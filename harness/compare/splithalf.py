# splithalf.py variant... : compare question/layout variants without tuning and judging on the same data.
# Each variant is "model:input:question" (e.g. jev:full:choice). Practice projects are split in half at
# random (by project, many times); the cut-off is chosen on one half (the most real finds with at most
# BUDGET wrong claims there) and scored on the other half. Prints the held-half gains with a 90% range
# over splits, and for each pair of variants how often the first beats the second.
import json, os, random, sys, statistics

here = os.path.dirname(os.path.abspath(__file__))
work = os.path.join(here, '..', 'work', 'clef')
BUDGET = int(os.environ.get('BUDGET', 2))
SPLITS = int(os.environ.get('SPLITS', 200))

def loader(model, inp, q):
    sys.argv = ['x', '--model', model, '--input', inp, '--question', q]
    src = open(os.path.join(here, 'clef.py')).read()
    ns = {'__file__': os.path.join(here, 'clef.py')}
    exec(src.split("cache_path")[0].replace("rows = [json.loads(l) for f in args if f != '--all' for l in open(f)]", "rows=[]"), ns)
    path = os.path.join(work, f"answers-{model}{'' if inp == 'full' else '-' + inp}{'' if q == 'noul' else '-' + q}.jsonl")
    ans = {json.loads(l)['key']: json.loads(l)['p'] for l in open(path)}
    return ns['key'], ans

rows = [json.loads(l) for l in open(os.path.join(work, 'features.jsonl'))]
rows = [r for r in rows if r['label'] in ('extract', 'inline', 'no', 'borderline')]
variants = sys.argv[1:]
for v in variants:
    k, ans = loader(*v.split(':'))
    for r in rows: r[v] = ans.get(k(r))
rows = [r for r in rows if all(r[v] is not None for v in variants)]
# One decision per candidate helper: an accepted caller wins, else the caller the variant likes best.
def cands(v):
    cand = {}
    for r in rows:
        k = (r['repo'], r['commit'], r['file'], r['kind'], r['helper']); o = cand.get(k)
        if o is None or (r['accepted'] and not o['accepted']) or (r['accepted'] == o['accepted'] and r[v] > o[v]): cand[k] = r
    return [r for r in cand.values() if not r['accepted']]
C = {v: cands(v) for v in variants}
projects = sorted({r['repo'] for r in rows})
real = lambda r: r['label'] in ('extract', 'inline')

def pick(cs, budget):
    best = (0, 1.01)
    for t in sorted({round(r[v_], 3) for r in cs for v_ in [cur]}, reverse=True):
        if sum(r[cur] >= t for r in cs if r['label'] == 'no') > budget: break
        n = sum(r[cur] >= t for r in cs if real(r))
        if n >= best[0]: best = (n, t)
    return best[1]

rng = random.Random(7)
res = {v: [] for v in variants}
for _ in range(SPLITS):
    rng.shuffle(projects); A = set(projects[: len(projects) // 2])
    for v in variants:
        cur = v
        tune = [r for r in C[v] if r['repo'] in A]; test = [r for r in C[v] if r['repo'] not in A]
        t = pick(tune, BUDGET)
        res[v].append((sum(r[v] >= t for r in test if real(r)), sum(r[v] >= t for r in test if r['label'] == 'no'), sum(r[v] >= t for r in test if r['label'] == 'borderline')))
q = lambda xs, p: sorted(xs)[int(p * (len(xs) - 1))]
print(f"cut-off tuned on half the projects (at most {BUDGET} wrong there), scored on the other half; {SPLITS} splits")
for v in variants:
    g = [x[0] for x in res[v]]; w = [x[1] for x in res[v]]; b = [x[2] for x in res[v]]
    print(f"  {v:26} real +{statistics.mean(g):5.1f} (90%: {q(g, .05)}–{q(g, .95)})  wrong +{statistics.mean(w):4.1f} (90%: {q(w, .05)}–{q(w, .95)})  borderline +{statistics.mean(b):4.1f}")
for i, a in enumerate(variants):
    for b_ in variants[i + 1:]:
        # Same split for both: compare real gained minus 5x wrong added.
        sa = [x[0] - 5 * x[1] for x in res[a]]; sb = [x[0] - 5 * x[1] for x in res[b_]]
        wins = sum(x > y for x, y in zip(sa, sb)) / SPLITS
        print(f"  {a} beats {b_} (real - 5x wrong) in {100 * wins:.0f}% of splits")
