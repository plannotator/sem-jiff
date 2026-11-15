# Results: AI second rater (Fable), 2026-11-09

Deviation from PROTOCOL.md, at the person's request after the protocol was fixed: the 40 screens were first
rated by a Fable agent under the same blinding (items.json only; no key, labels or responses). The person then
rates only the items where a human call matters (Fable disagrees with the AI label, the AI label is borderline,
or Fable could not tell). Same analysis script, unchanged (checksums in PREREGISTERED.sha256).

```
answered 36 of 36 unique items; repeats answered 4 of 4; replaced at sampling 0
median time per item 0 s
A engine claims: rater says right 14, wrong 0, can't tell 0 -> precision 100% (95% 78% to 100%)
B model-added claims: rater says right 13, wrong 0, can't tell 1 -> precision 100% (95% 77% to 100%)
agreement over 32 items (excluded: AI borderline 3, rater can't tell 1): raw 94%, kappa 0.76 (95% 0.48 to 1.00)
AI too generous (AI right, rater wrong): 1 of 27 AI-right items (4%); AI too strict (AI wrong, rater right): 1
rater consistency on repeats: 4 of 4 the same
DECISION: AI labels fit for keep/drop decisions

```

Caveat: Fable is also an AI; agreement here does not rule out a blind spot shared by all AI raters.

## Human check of the 6 items that needed one (2026-11-09)

| Item | AI label | Fable | Human |
|---|---|---|---|
| playwright `_disableInterception` (claimed with Jev) | borderline | can't tell | right |
| livestore `publish` (claimed with Jev) | no | right | can't tell |
| effected `mergeRecords` (engine claim) | borderline | right | right |
| automapper `Include` (nobody claims) | inline | wrong | can't tell |
| effect-smol `combineChecks` (claimed with Jev) | borderline | right | right |
| typescript `resolvePathForModule` (nobody claims) | extract | can't tell | can't tell (skipped) |

- All 3 claims the AI labels called arguable, the human called right: the labels lean strict, not generous, so
  reported "found" numbers are if anything slightly understated (arguable claims are not counted as found).
- The 2 items where Fable and the labels disagree, the human could not call either: genuinely hard cases.
- No item where the human called a claim wrong that the labels called right: no sign of a shared generous blind spot.
- Six items: a direction, not a measurement.
