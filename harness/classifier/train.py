# train.py features.jsonl... : logistic regression on the engine's evidence numbers, tested by leaving one
# project out at a time (each project scored by a model that never saw it). Prints how many more real
# cases a learned rule would accept, and how many wrong claims it would add, at each threshold, on top of
# the engine's own decisions. EXPORT=weights.json also fits on everything and writes the weights that
# src/classifier.ts uses. Input from harness/classifier/collect.ts (practice projects only).
import json, math, os, sys

rows = [json.loads(l) for f in sys.argv[1:] for l in open(f)]

def feats(r):
    L = math.log1p
    return [1.0, L(r['helperTokens']), L(r['freshTokens']), L(r['statements']), L(r['movedStatements']),
            L(r['strictPairs']), r['strictShare'], r['strictMeanSim'], L(r['loosePairs']), r['looseShare'],
            r['bagDice'], r['nameOverlap'], float(r['hasValue']), L(r['valueTokens']), float(r['valueInFresh']),
            L(r['calls']), float(r['oneLine']), min(r['sizeRatio'], 5.0), float(r['kind'] == 'extract')]

# One decision per candidate helper (it may have several callers): an accepted caller wins, else the one
# with the most evidence.
cand = {}
for r in rows:
    k = (r['repo'], r['commit'], r['file'], r['kind'], r['helper'])
    old = cand.get(k)
    if old is None or (r['accepted'] and not old['accepted']) or (r['accepted'] == old['accepted'] and r['looseShare'] > old['looseShare']):
        cand[k] = r
items = [r for r in cand.values() if r['label'] in ('extract', 'inline', 'no')]
borders = [r for r in cand.values() if r['label'] == 'borderline']
print(f"candidates with labels: {len(items)} (real {sum(r['label'] != 'no' for r in items)}, no {sum(r['label'] == 'no' for r in items)}), borderline {len(borders)}")

def standardise(xs):
    n = len(xs[0])
    mu = [sum(x[j] for x in xs) / len(xs) for j in range(n)]
    sd = [max(1e-6, math.sqrt(sum((x[j] - mu[j]) ** 2 for x in xs) / len(xs))) for j in range(n)]
    mu[0], sd[0] = 0.0, 1.0
    return mu, sd

def fit(xs, ys, l2=1e-2, epochs=400, lr=0.3):
    """Class-balanced logistic regression by gradient descent on standardised features."""
    mu, sd = standardise(xs)
    n = len(mu)
    Z = [[(x[j] - mu[j]) / sd[j] for j in range(n)] for x in xs]
    pos = sum(ys); neg = len(ys) - pos
    cw = {1: len(ys) / (2 * pos), 0: len(ys) / (2 * neg)}
    w = [0.0] * n
    for _ in range(epochs):
        g = [0.0] * n
        for z, y in zip(Z, ys):
            p = 1 / (1 + math.exp(-max(-30, min(30, sum(a * b for a, b in zip(w, z))))))
            for j in range(n): g[j] += cw[y] * (p - y) * z[j]
        for j in range(n): w[j] -= lr * (g[j] / len(Z) + l2 * w[j] * (j > 0))
    return w, mu, sd

def predict(model, x):
    w, mu, sd = model
    return 1 / (1 + math.exp(-max(-30, min(30, sum(a * (b - m) / s for a, b, m, s in zip(w, x, mu, sd))))))

for held in sorted({r['repo'] for r in items}):
    train = [r for r in items if r['repo'] != held]
    model = fit([feats(r) for r in train], [int(r['label'] != 'no') for r in train])
    for r in items + borders:
        if r['repo'] == held: r['p'] = predict(model, feats(r))

real = [r for r in items if r['label'] != 'no']; no = [r for r in items if r['label'] == 'no']
eng_tp = sum(r['accepted'] for r in real); eng_fp = sum(r['accepted'] for r in no)
print(f"engine alone: real found {eng_tp}/{len(real)} ({100 * eng_tp / len(real):.1f}%), wrong claims {eng_fp}")
print('accept also when p >= t (only candidates the engine rejected, with one statement that really reappears):')
for t in [0.99, 0.98, 0.97, 0.96, 0.95, 0.9, 0.85, 0.8]:
    pick = lambda xs: [r for r in xs if not r['accepted'] and r.get('p', 0) >= t and r['strictPairs'] >= 1 and not r['oneLine']]
    print(f"  t={t:.2f}: +{len(pick(real))} real, +{len(pick(no))} wrong, +{len(pick(borders))} borderline")

if os.environ.get('DUMP'):
    # DUMP=probs.jsonl: the left-out-project probability for every candidate (for harness/analysis/charts.py).
    with open(os.environ['DUMP'], 'w') as f:
        for r in items + borders: f.write(json.dumps({k: r[k] for k in ('repo', 'commit', 'file', 'kind', 'helper', 'label', 'accepted')} | {'p': r.get('p', 0)}) + '\n')

if os.environ.get('EXPORT'):
    w, mu, sd = fit([feats(r) for r in items], [int(r['label'] != 'no') for r in items])
    json.dump({'weights': w, 'mean': mu, 'scale': sd, 'trainedOn': len(items)}, open(os.environ['EXPORT'], 'w'), indent=1)
    print('exported', os.environ['EXPORT'])
