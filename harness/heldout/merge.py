# merge.py <lab-dir> <out.json> "<how>": turn each labeller's labels-<batch>.json plus its in-<batch>.json
# into one answer-key file in the format bench/recall.ts reads. Prints counts only (held-out set).
import glob, json, os, sys
lab, out, how = sys.argv[1], sys.argv[2], sys.argv[3]
entries, missing = [], 0
for inf in sorted(glob.glob(os.path.join(lab, 'in-*.json'))):
    batch = os.path.basename(inf)[3:-5]
    lf = os.path.join(lab, f'labels-{batch}.json')
    todo = {t['id']: t for t in json.load(open(inf))}
    if not os.path.exists(lf):
        print(f'batch {batch}: no labels file'); missing += len(todo); continue
    labs = json.load(open(lf)); labs = labs['labels'] if isinstance(labs, dict) else labs
    got = set()
    for l in labs:
        t = todo.get(l.get('id'))
        if t is None: continue
        got.add(t['id'])
        # Identity fields come from the input (labellers only judge); the caller may be corrected.
        entries.append({'repo': t['repo'], 'kind': t['kind'], 'commit': t['commit'], 'file': t['file'], 'helper': t['helper'],
                        'caller': l.get('caller') or t.get('caller', ''), 'label': l['label'], 'note': l.get('note', ''), 'src': t.get('src', '')})
    missing += len(set(todo) - got)
bad = sum(1 for e in entries if e['label'] not in ('extract', 'inline', 'borderline', 'no'))
json.dump({'how': how, 'labels': entries}, open(out, 'w'), indent=1)
from collections import Counter
print(len(entries), 'entries;', dict(Counter(e['label'] for e in entries)), '; missing', missing, '; bad labels', bad)
