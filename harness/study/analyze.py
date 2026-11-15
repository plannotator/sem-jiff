# The analysis fixed in PROTOCOL.md. Usage: python3 analyze.py [responses.json]
import json, math, random, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
key = json.load(open(os.path.join(HERE, 'key.json')))
resp = json.load(open(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'responses-final.json')))
items = {k['id']: k for k in key['items']}
first, again = {}, {}
for a in resp['answers'].values():
    if not a.get('verdict'): continue
    (again if a.get('repeat') else first)[a['id']] = a
def wilson(k, n, z=1.96):
    if n == 0: return (float('nan'),) * 3
    p = k / n; d = 1 + z * z / n; c = p + z * z / (2 * n); h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return p, (c - h) / d, (c + h) / d
def kappa(pairs):
    n = len(pairs)
    if n == 0: return float('nan')
    po = sum(a == b for a, b in pairs) / n
    pa = sum(a for a, _ in pairs) / n; pb = sum(b for _, b in pairs) / n
    pe = pa * pb + (1 - pa) * (1 - pb)
    return float('nan') if pe == 1 else (po - pe) / (1 - pe)
out = []
P = lambda *a: out.append(' '.join(str(x) for x in a))
P(f'answered {len(first)} of {len(items)} unique items; repeats answered {len(again)} of {len(key["repeats"])}; replaced at sampling {key["replaced"]}')
med = sorted(a.get('ms', 0) for a in first.values()); P(f'median time per item {med[len(med)//2]/1000:.0f} s' if med else '')
for s, name in (('A', 'engine claims'), ('B', 'model-added claims')):
    v = [first[i]['verdict'] for i, k in items.items() if k['stratum'] == s and i in first]
    r, w, u = v.count('right'), v.count('wrong'), v.count('unsure')
    p, lo, hi = wilson(r, r + w)
    P(f'{s} {name}: human says right {r}, wrong {w}, can\'t tell {u} -> precision {p:.0%} (95% {lo:.0%} to {hi:.0%})')
pairs, gen, strict, aib, hu = [], 0, 0, 0, 0
for i, k in items.items():
    if i not in first: continue
    h = first[i]['verdict']; ai = k['ai']
    if ai == 'borderline': aib += 1; continue
    if h == 'unsure': hu += 1; continue
    hv, av = h == 'right', ai in ('extract', 'inline')
    pairs.append((hv, av))
    if av and not hv: gen += 1
    if hv and not av: strict += 1
air = sum(1 for _, a in pairs if a)
kap = kappa(pairs); rnd = random.Random(20261109)
boots = sorted(kappa([pairs[rnd.randrange(len(pairs))] for _ in pairs]) for _ in range(2000)) if pairs else []
boots = [b for b in boots if not math.isnan(b)]
ci = (boots[int(0.025 * len(boots))], boots[int(0.975 * len(boots)) - 1]) if boots else (float('nan'),) * 2
P(f'agreement over {len(pairs)} items (excluded: AI borderline {aib}, human can\'t tell {hu}): raw {sum(a == b for a, b in pairs) / max(len(pairs), 1):.0%}, kappa {kap:.2f} (95% {ci[0]:.2f} to {ci[1]:.2f})')
P(f'AI too generous (AI right, human wrong): {gen} of {air} AI-right items ({gen / max(air, 1):.0%}); AI too strict (AI wrong, human right): {strict}')
same = [first[i]['verdict'] == again[i]['verdict'] for i in again if i in first]
P(f'rater consistency on repeats: {sum(same)} of {len(same)} the same')
# Decision rules (PROTOCOL.md).
A = [first[i]['verdict'] for i, k in items.items() if k['stratum'] == 'A' and i in first and first[i]['verdict'] != 'unsure']
B = [first[i]['verdict'] for i, k in items.items() if k['stratum'] == 'B' and i in first and first[i]['verdict'] != 'unsure']
pa = A.count('right') / max(len(A), 1); pb = B.count('right') / max(len(B), 1)
P('DECISION: AI labels fit for keep/drop decisions' if kap >= 0.6 and gen / max(air, 1) <= 0.15 else 'DECISION: AI labels NOT confirmed (see rules)')
if gen / max(air, 1) > 0.15: P('DECISION: found-numbers overstated; correct by the human rate and revisit labelling instructions')
if pa - pb > 0.15: P('DECISION: model-added claims need a stricter cut-off or a "suggested" marking')
print('\n'.join(out))
print('\nDisagreements (for reading, after the numbers):')
for i, k in items.items():
    if i in first and k['ai'] != 'borderline' and first[i]['verdict'] != 'unsure' and (first[i]['verdict'] == 'right') != (k['ai'] in ('extract', 'inline')):
        print(f"  [{k['stratum']}] {k['key']}  human={first[i]['verdict']} ai={k['ai']}  human note: {first[i].get('note','')!r}  ai note: {k['ai_note'][:120]!r}")
