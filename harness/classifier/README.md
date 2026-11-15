# The learned check (experiment)

A logistic regression over the evidence numbers the engine already computes for each
extract/inline candidate (how much of the helper reappears in the caller's lost code, how
closely, sizes, calls). It can accept a candidate the strict rules rejected, but only when it
is very sure and the rules' guards still pass. Code: `src/classifier.ts`; off by default
(`learned: true` or `SEMANTIC_LEARNED=1` turns it on).

Result so far (2026-11-08): leaving one practice project out at a time, it added 19 real finds
with no wrong or borderline claims at threshold 0.96. On the held-out sets it added nothing
(TypeScript 83, Effect 96, mixed 63 found either way) and brought 4 borderline claims on the
mixed set, so it stays off. It is also the baseline any outside model (Jev, Clef) must beat.

```sh
node harness/setup.ts --set practice
node harness/classifier/collect.ts features.jsonl          # practice projects only
python3 harness/classifier/train.py features.jsonl          # leave-one-project-out table
EXPORT=weights.json python3 harness/classifier/train.py features.jsonl   # weights for src/classifier.ts
```
