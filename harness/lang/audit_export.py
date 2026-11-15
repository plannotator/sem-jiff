# audit_export.py <lang> <out-dir> <claims.jsonl>... : every claim (any tool) that matches no expected answer goes to
# the blind audit (harness/audit/AUDIT.md). Identical claims from several tools are one item, and items carry no tool
# name. Writes <out-dir>/<group>-items.json (practice, held) for the judges and <out-dir>/key.json (item -> claims),
# which judges never see. merge with audit_merge.py. Prints counts only.
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
WORK = os.environ.get('WORK', os.path.join(HERE, '..', 'work'))
lang, out, paths = sys.argv[1], sys.argv[2], sys.argv[3:]
expected = json.load(open(os.path.join(ROOT, 'test/fixtures/labels', f'lang-{lang}-expected.json')))['labels']
sets = {p['name']: p['set'] for p in json.load(open(os.path.join(HERE, lang, 'projects.json')))}
norm = lambda k: 'moved' if k in ('moved', 'reordered') else k
def overlap(a, b): return any(x[0] <= y[1] and y[0] <= x[1] for x in a for y in b)
def meets(c, e): return c['project'] == e['project'] and c['commit'][:10] == e['commit'][:10] and c['file'] == e['file'] and \
    norm(c['kind']) == norm(e['kind']) and overlap(c['old'], e['old']) and overlap(c['new'], e['new'])
claims = [json.loads(l) for p in paths for l in open(p) if l.strip()]
texts = {}
def text(project, commit, file):
    if project not in texts:
        texts[project] = {(f['commit'], f['name']): f for f in json.load(open(os.path.join(WORK, 'data', f'hist-{project}.json')))}
    return texts[project][(commit, file)]
def excerpt(t, ranges):
    L = t.split('\n')
    return [{'start': a, 'end': b, 'text': '\n'.join(L[a - 1:min(b, a + 39)]) + ('\n…' if b - a >= 40 else '')} for a, b in ranges]
items, key = {}, {}
for c in claims:
    if any(meets(c, e) for e in expected): continue
    sig = (c['project'], c['commit'], c['file'], 'moved' if c['kind'] == 'reordered' else c['kind'], json.dumps(c['old']), json.dumps(c['new']))
    if sig not in items:
        f = text(c['project'], c['commit'], c['file'])
        group = sets[c['project']].split('-')[0]
        items[sig] = {'group': group, 'project': c['project'], 'commit': c['commit'], 'file': c['file'], 'kind': sig[3],
                      'old': excerpt(f['oldContents'], c['old']), 'new': excerpt(f['newContents'], c['new'])}
        key[sig] = []
    key[sig].append({k: c[k] for k in ('tool', 'project', 'commit', 'file', 'kind', 'old', 'new')})
os.makedirs(out, exist_ok=True)
groups = {}
for sig, it in items.items():
    g = it.pop('group'); groups.setdefault(g, []).append((sig, it))
allkey = []
for g, lst in groups.items():
    for i, (sig, it) in enumerate(lst, 1):
        it['id'] = i
        allkey.append({'group': g, 'id': i, 'claims': key[sig]})
    json.dump([{'id': it['id'], **{k: v for k, v in it.items() if k != 'id'}} for _, it in lst], open(os.path.join(out, f'{g}-items.json'), 'w'), indent=1)
    print(g, len(lst), 'items')
json.dump(allkey, open(os.path.join(out, 'key.json'), 'w'))
