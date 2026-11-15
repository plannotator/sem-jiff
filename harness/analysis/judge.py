# judge.py BEFORE AFTER [--ledger path] : keep / reject / undecided for a change, by rules fixed in advance.
#
# BEFORE and AFTER name ledger records (harness/work/ledger.jsonl, written by harness/score.ts) by their
# --label, or by line number (1-based, negative counts from the end). Both must score the same set.
#
# The rules (do not tune them to a result; change them only between experiments, in this file):
#   value per project   = Δfound − 5·Δwrong − 0.5·Δborderline     (a wrong claim costs five finds)
#   UNDECIDED  if the change adds unlabelled claims worth more than a quarter of its new finds
#              (or any, when it adds no finds): label them first, then judge again.
#   REJECT     if total Δwrong > 0.1·max(Δfound, 0) + 1, or the 90% interval of the total value is below 0.
#   KEEP       if the 90% interval of the total value is above 0 (bootstrap over projects, 10,000 draws),
#              and a sign-flip test over projects gives p < 0.1.
#   UNDECIDED  otherwise (no evidence either way: more data, not a closer look at this data).
# Deterministic: fixed random seed.
import json, os, random, sys

args = sys.argv[1:]
ledger = args[args.index('--ledger') + 1] if '--ledger' in args else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'work', 'ledger.jsonl')
args = [a for i, a in enumerate(args) if a != '--ledger' and (i == 0 or args[i - 1] != '--ledger')]
if len(args) != 2: sys.exit(__doc__ or 'usage: judge.py BEFORE AFTER')
records = [json.loads(l) for l in open(ledger) if l.strip()]

def find(ref):
    try:
        i = int(ref); return records[i - 1] if i > 0 else records[i]
    except ValueError:
        hits = [r for r in records if r.get('label') == ref]
        if not hits: sys.exit(f'no ledger record labelled {ref!r}')
        return hits[-1]

a, b = find(args[0]), find(args[1])
if a['set'] != b['set']: sys.exit(f"different sets: {a['set']} vs {b['set']}")
projects = sorted(set(a['perProject']) & set(b['perProject']))
d = {p: {k: b['perProject'][p][k] - a['perProject'][p][k] for k in ('found', 'wrong', 'borderline', 'unlabelled', 'real')} for p in projects}
value = {p: x['found'] - 5 * x['wrong'] - 0.5 * x['borderline'] for p, x in d.items()}
tot = {k: sum(x[k] for x in d.values()) for k in ('found', 'wrong', 'borderline', 'unlabelled', 'real')}
V = sum(value.values())

rng = random.Random(12345)
vals = list(value.values())
boot = sorted(sum(rng.choice(vals) for _ in vals) for _ in range(10000))
lo, hi = boot[500], boot[9499]
nz = [v for v in vals if v != 0]
flips = sum(1 for _ in range(10000) if sum(v if rng.random() < 0.5 else -v for v in nz) >= V) if nz else 10000
p = flips / 10000

print(f"set {a['set']}: {a.get('label') or a['time']}  ->  {b.get('label') or b['time']}")
if tot['real']: print(f"  note: the answer key changed between the runs (real {tot['real']:+d}); compare like with like")
print(f"  found {tot['found']:+d}   wrong {tot['wrong']:+d}   borderline {tot['borderline']:+d}   unlabelled {tot['unlabelled']:+d}")
print(f"  value (found − 5·wrong − 0.5·borderline) {V:+.1f}, 90% interval {lo:+.1f} to {hi:+.1f}, sign-flip p = {p:.3f}")
moved = sorted(((v, q) for q, v in value.items() if v), reverse=True)
if moved: print('  projects that moved: ' + ', '.join(f'{q} {v:+g}' for v, q in moved[:8]) + (' ...' if len(moved) > 8 else ''))
if tot['unlabelled'] > 0.25 * max(tot['found'], 0) or (tot['unlabelled'] > 0 and tot['found'] <= 0):
    verdict, why = 'UNDECIDED', f"{tot['unlabelled']} new unlabelled claims against {tot['found']} new finds: label them, then judge again"
elif tot['wrong'] > 0.1 * max(tot['found'], 0) + 1:
    verdict, why = 'REJECT', f"adds {tot['wrong']} wrong claims for {tot['found']} finds (allowed: {0.1 * max(tot['found'], 0) + 1:.1f})"
elif hi < 0:
    verdict, why = 'REJECT', 'the whole 90% interval of the value is below zero'
elif lo > 0 and p < 0.1:
    verdict, why = 'KEEP', 'the gain holds across projects (interval above zero, p < 0.1)'
else:
    verdict, why = 'UNDECIDED', 'no clear evidence either way: needs more data'
print(f"VERDICT: {verdict} - {why}")
