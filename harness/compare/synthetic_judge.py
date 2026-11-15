# synthetic_judge.py cases.jsonl raw.jsonl : per tool and change kind, how often the tool's output says what the change
# was ("recognised") and how often it claims a kind of change that did not happen ("false claim").
# A tool whose output has no way to say a kind of change is marked "can't say" for it, not scored as missing it.
import json, re, sys, statistics
from collections import defaultdict

cases = [json.loads(l) for l in open(sys.argv[1])]
raw = {r['i']: r for r in map(json.loads, open(sys.argv[2]))}
KINDS = ['move', 'rename', 'reindent', 'imports', 'extract', 'inline']
CANT = {('difftastic', k) for k in ['move', 'imports', 'extract', 'inline']} | {('gumtree', k) for k in ['extract', 'inline']} | \
       {('sem', k) for k in ['rename', 'extract', 'inline']} | {('refactoringminer', k) for k in ['move', 'imports']}

def gumtree(c, out):
    acts = json.loads(out)['actions']
    kinds = {a['action'] for a in acts}
    moves = 'move-tree' in kinds
    edits = kinds - {'move-tree'}
    k = c['kind']
    if k in ('move', 'imports'):
        return moves and not edits, bool(edits)  # an edit claimed where nothing was edited
    if k == 'rename':
        labels = {a.get('label') for a in acts}
        ok = bool(acts) and kinds == {'update-node'} and len(labels) == 1 and all('identifier' in a['tree'].split(':')[0].lower() or 'name' in a['tree'].split(':')[0].lower() for a in acts)
        return ok, moves
    if k == 'reindent':
        return not acts, bool(acts)
    return None, False  # extract/inline: can't say (its moves and inserts are not wrong here)

def difftastic(c, out):
    lines = [json.loads(x) for x in out.strip().split('\n') if x.strip()]
    d = lines[0] if lines else {}
    if d.get('status') == 'unchanged' or not d.get('chunks'):
        changed = []
    else:
        changed = [ch for chunk in d['chunks'] for side in chunk for s in ('lhs', 'rhs') if s in side for ch in side[s]['changes']]
    k = c['kind']
    if k == 'reindent':
        return not changed, False
    if k == 'rename':
        toks = {ch['content'] for ch in changed}
        return bool(changed) and len(toks) <= 2 and all(re.fullmatch(r'[\w$]+', t) for t in toks), False
    return None, False  # no notion of moved code, extract or inline

def sem(c, out):
    d = json.loads(out)
    ch = d.get('changes', [])
    types = [x['changeType'] for x in ch]
    structural = [x for x in ch if x.get('structuralChange') and x['changeType'] not in ('moved', 'reordered')]
    k = c['kind']
    if k == 'move':
        return any(t in ('moved', 'reordered') for t in types) and not structural, any(t == 'renamed' for t in types)
    if k in ('imports', 'reindent'):
        return not structural, any(t in ('renamed', 'moved') for t in types) if k == 'reindent' else any(t == 'renamed' for t in types)
    return None, any(t in ('renamed', 'moved') for t in types) if k != 'rename' else any(t == 'moved' for t in types)

def refactoringminer(c, out):
    refs = [r['type'] for cm in json.loads(out)['commits'] for r in cm['refactorings']] if out else []
    want = {'extract': {'Extract Method'}, 'inline': {'Inline Method'}, 'rename': {'Rename Variable', 'Rename Parameter', 'Rename Attribute'}}.get(c['kind'], set())
    ok = any(r in want for r in refs) if want else None
    if c['kind'] in ('reindent',):
        ok = not refs
    return ok, any(r not in want for r in refs)

JUDGE = {'gumtree': gumtree, 'difftastic': difftastic, 'sem': sem, 'refactoringminer': refactoringminer}
tally = defaultdict(lambda: {'n': 0, 'rec': 0, 'false': 0, 'fail': 0, 's': []})
for i, c in enumerate(cases):
    k = c['kind']
    t = tally[('sem-diff', k, c['language'])]
    t['n'] += 1; t['rec'] += c['ours']['found']; t['false'] += bool(c['ours']['wrong']); t['s'].append(c['ours']['ms'] / 1000)
    r = raw.get(i, {})
    for tool, f in JUDGE.items():
        if tool not in r: continue
        t = tally[(tool, k, c['language'])]
        t['n'] += 1; t['s'].append(r[tool]['s'])
        if not r[tool]['ok'] or not r[tool]['out'].strip():
            t['fail'] += 1; continue
        try:
            ok, false = f(c, r[tool]['out'])
        except Exception:
            t['fail'] += 1; continue
        t['rec'] += bool(ok); t['false'] += bool(false)

TOOLS = ['sem-diff', 'refactoringminer', 'gumtree', 'sem', 'difftastic']
def row(tool, k, langs=None):
    keys = [x for x in tally if x[0] == tool and x[1] == k and (langs is None or x[2] in langs)]
    fail = sum(tally[x]['fail'] for x in keys)
    n = sum(tally[x]['n'] for x in keys) - fail  # cases the tool could not read are left out of its score
    if n <= 0: return None
    rec = sum(tally[x]['rec'] for x in keys); fal = sum(tally[x]['false'] for x in keys)
    s = statistics.median([v for x in keys for v in tally[x]['s']])
    return n, rec, fal, fail, s
for scope, langs in [('all languages', None), ('Java only (where RefactoringMiner runs)', {'java'})]:
    print(f'\n## {scope}\n')
    print('| Change | ' + ' | '.join(TOOLS) + ' |')
    print('|---|' + '---|' * len(TOOLS))
    for k in KINDS:
        cells = []
        for tool in TOOLS:
            r = row(tool, k, langs)
            if r is None: cells.append('—'); continue
            n, rec, fal, fail, s = r
            if (tool, k) in CANT: cells.append(f"can't say" + (f'; false {100*fal/n:.0f}%' if fal else '')); continue
            cells.append(f'{100*rec/n:.0f}% ok, {100*fal/n:.0f}% false' + (f' ({fail} unreadable)' if fail else ''))
        n0 = row('sem-diff', k, langs)
        print(f'| {k} ({n0[0] if n0 else 0}) | ' + ' | '.join(cells) + ' |')
print('\nMedian seconds per file pair:', {t: round(statistics.median([v for x in tally if x[0] == t for v in tally[x]['s']]), 3) for t in TOOLS if any(x[0] == t for x in tally)})
