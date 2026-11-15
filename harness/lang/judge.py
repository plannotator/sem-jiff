# judge.py <lang> <claims.jsonl>... : score each tool's moved / renamed / reformatted / reordered claims against the
# expected answers (test/fixtures/labels/lang-<lang>-expected.json) and, when given, the blind audit labels
# (AUDIT=<labels.json> from harness/audit, keyed by tool, project, commit, file, kind and lines).
# A claim matches an expected item when its kind is the same and its old and new ranges overlap the item's
# (moved and reordered count as one kind; movedWithEdit as moved for a tool that cannot say "with edits").
# Held sets (HELD=<set prefix>, default "held") print totals only.
import json, os, sys
from collections import defaultdict
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
lang, paths = sys.argv[1], sys.argv[2:]
expected = json.load(open(os.path.join(ROOT, 'test/fixtures/labels', f'lang-{lang}-expected.json')))['labels']
sets = {p['name']: p['set'] for p in json.load(open(os.path.join(HERE, lang, 'projects.json')))}
audit = {}
if os.environ.get('AUDIT'):
    for a in json.load(open(os.environ['AUDIT']))['labels']:
        audit[(a['tool'], a['project'], a['commit'], a['file'], a['kind'], json.dumps(a['old']), json.dumps(a['new']))] = a['label']
norm = lambda k: 'moved' if k in ('moved', 'reordered') else k
def overlap(a, b): return any(x[0] <= y[1] and y[0] <= x[1] for x in a for y in b)
def meets(c, e): return c['project'] == e['project'] and c['commit'][:10] == e['commit'][:10] and c['file'] == e['file'] and \
    norm(c['kind']) == norm(e['kind']) and overlap(c['old'], e['old']) and overlap(c['new'], e['new'])
claims = [json.loads(l) for p in paths for l in open(p) if l.strip()]
tools = sorted({c['tool'] for c in claims})
for group in sorted({sets[c['project']].split('-')[0] for c in claims} | {'practice'}):
    rows = []
    for tool in tools:
        cs = [c for c in claims if c['tool'] == tool and sets[c['project']].startswith(group)]
        es = [e for e in expected if sets[e['project']].startswith(group)]
        t = defaultdict(int)
        for e in es:
            hit = any(meets(c, e) for c in cs)
            if e['label'] == 'correct': t['expected'] += 1; t['found'] += hit
            elif e['label'] == 'wrong': t['wrong'] += hit
            else: t['borderline'] += hit
        for c in cs:
            if any(meets(c, e) for e in es): continue
            lab = audit.get((tool, c['project'], c['commit'], c['file'], c['kind'], json.dumps(c['old']), json.dumps(c['new'])))
            t['claims-unlabelled' if lab is None else f'audit-{lab}'] += 1
        t['claims'] = len(cs)
        rows.append((tool, dict(t)))
    print(f'## {group}')
    for tool, t in rows: print(f'  {tool}: {t}')
