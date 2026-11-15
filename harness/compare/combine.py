# combine.py features.jsonl : Clef and Jev together, from answers already saved by clef.py (no calls).
# Same yardstick as clef.py: real cases gained vs wrong claims added, on candidates the engine rejected.
import json, os, sys, math
here = os.path.dirname(os.path.abspath(__file__))
def keyfn(model):
    sys.argv = ['x', '--model', model]
    src = open(os.path.join(here, 'clef.py')).read()
    ns = {'__file__': os.path.join(here, 'clef.py')}
    exec(src.split("cache_path")[0].replace("rows = [json.loads(l) for f in args if f != '--all' for l in open(f)]", "rows=[]"), ns)
    return ns['key']
work = os.path.join(here, '..', 'work', 'clef')
rows = [json.loads(l) for l in open(sys.argv[1] if len(sys.argv) > 1 else os.path.join(work, 'features.jsonl'))]
rows = [r for r in rows if r['label'] in ('extract', 'inline', 'no', 'borderline')]
for m in ('clef', 'jev'):
    k = keyfn(m); ans = {json.loads(l)['key']: json.loads(l)['p'] for l in open(os.path.join(work, f'answers-{m}.jsonl'))}
    for r in rows: r[m] = ans.get(k(r))
rows = [r for r in rows if r['clef'] is not None and r['jev'] is not None]
logit = lambda p: math.log(max(p, 1e-6) / max(1 - p, 1e-6))
ways = {
    'clef >= .90': lambda r: r['clef'] >= .90,
    'jev >= .62': lambda r: r['jev'] >= .62,
    'both agree (clef>=.80 and jev>=.55)': lambda r: r['clef'] >= .80 and r['jev'] >= .55,
    'both agree (clef>=.70 and jev>=.50)': lambda r: r['clef'] >= .70 and r['jev'] >= .50,
    'either (clef>=.95 or jev>=.70)': lambda r: r['clef'] >= .95 or r['jev'] >= .70,
}
# Averaged score (on the log-odds scale, Jev rescaled to Clef's by matching medians): a sweep.
cand = {}
for r in rows:
    k = (r['repo'], r['commit'], r['file'], r['kind'], r['helper']); o = cand.get(k)
    s = logit(r['clef']) + logit(r['jev'])
    r['avg'] = s
    if o is None or (r['accepted'] and not o['accepted']) or (r['accepted'] == o['accepted'] and s > o['avg']): cand[k] = r
c = [r for r in cand.values() if not r['accepted']]
def show(name, f):
    print(f"{name:42} +{sum(f(r) for r in c if r['label'] in ('extract','inline')):3} real  +{sum(f(r) for r in c if r['label']=='no'):2} wrong  +{sum(f(r) for r in c if r['label']=='borderline'):3} borderline")
for n, f in ways.items(): show(n, f)
for t in [5, 4, 3.5, 3, 2.5, 2]:
    show(f'sum of log-odds >= {t}', lambda r, t=t: r['avg'] >= t)
