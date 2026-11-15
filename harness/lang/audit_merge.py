# audit_merge.py <audit-dir> <key.json> <out.json> : join the blind judges' labels (<audit-dir>/labels-*.json, items
# from in-*.json) with the key audit_export.py wrote, giving one label per tool claim, in the shape judge.py reads
# (AUDIT=<out.json>). Prints counts only.
import glob, json, os, sys
from collections import Counter
d, keyp, out = sys.argv[1:4]
key = {(k['group'], k['id']): k['claims'] for k in json.load(open(keyp))}
labels, missing = [], 0
for lf in sorted(glob.glob(os.path.join(d, 'labels-*.json'))):
    batch = os.path.basename(lf)[7:-5]
    group = 'held' if batch.startswith('h') else 'practice'
    items = {i['id'] for i in json.load(open(os.path.join(d, f'in-{batch}.json')))}
    got = json.load(open(lf)); got = got['labels'] if isinstance(got, dict) else got
    seen = set()
    for l in got:
        if l.get('id') not in items: continue
        seen.add(l['id'])
        for c in key[(group, l['id'])]: labels.append({**c, 'label': l['label'], 'note': l.get('note', '')})
    missing += len(items - seen)
json.dump({'how': 'Blind strict audit (harness/audit/AUDIT.md) by independent Fable judges; claims from all tools pooled, tool names withheld.', 'labels': labels}, open(out, 'w'), indent=1)
print(len(labels), 'claim labels;', dict(Counter(l['label'] for l in labels)), '; items missing', missing)
