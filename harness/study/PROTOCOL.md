# Blind label-validity study: protocol (fixed before any response is collected)

Date: 2026-11-09. Seed: 20261109. Written before the rater sees any item; not changed afterwards.

## Question
Every accuracy number for the semantic-diff engine rests on labels written by AI agents. Do a human's judgements
agree with those labels, and how often are the engine's (and the models') claims right according to a human?

## Population and sampling
Practice projects only (57 projects; the locked test set is never shown). Units are extract/inline *candidates*:
"function X was pulled out of Y" or "X was folded back into Y", at one commit and file, that already carry an AI label.
Four strata, sampled at random without replacement (seed above):
- **A, engine claims** (reported by the engine alone): 14 items.
- **B, model-added claims** (reported only with Jev, or Jev with the Clef tie-breaker): 14 items.
- **C1, candidates nobody claims that the AI labelled real** (misses): 4 items.
- **C2, candidates nobody claims that the AI labelled wrong**: 4 items.
- **R, repeats**: 4 of the 36 items above, chosen at random among those early enough to be shown again at least 10
  items later.
Total 40 screens. Order is random. The rater does not see the stratum, the AI label, or whether anything claimed it.
An item whose code cannot be extracted is replaced by the next random draw; the count is reported.

## Procedure
For each item the rater sees the claim in neutral words, the helper's code, and the caller before and after (as a
diff), and answers **Right**, **Wrong** or **Can't tell**, optionally with a note. Time per item is recorded. Two
worked examples (made up, not scored) come first.

## Outcomes and analysis (fixed in advance)
Human verdict: Right / Wrong; "Can't tell" is excluded from the rates below and reported separately.
AI verdict: extract or inline = Right; no = Wrong; borderline is excluded from agreement and reported separately.
1. **Human-judged precision of engine claims** (stratum A): share Right, Wilson 95% interval.
2. **Human-judged precision of model-added claims** (stratum B): same.
3. **Agreement between human and AI labels** over the 36 unique items: raw agreement and Cohen's kappa, with a
   bootstrap 95% interval (2,000 resamples, seed above).
4. **Direction of disagreement**: how many AI-Right the human calls Wrong (AI too generous) and the reverse.
5. **Rater consistency**: agreement on the 4 repeats.

## Decision rules (fixed in advance)
- Kappa ≥ 0.6 and AI-too-generous ≤ 15% of AI-Right items: the AI labels are fit for keep/drop decisions as used.
- AI-too-generous > 15%: every reported "found" number is overstated; report numbers corrected by the human rate and
  re-examine the labelling instructions before more tuning.
- Human-judged precision of B more than 15 points below A: the model power-up's claims need a stricter cut-off or a
  visible "suggested" marking in the UI.

## Limits (stated in advance)
One rater; 36 items. Intervals will be wide (14 items at 13/14 right gives roughly 69% to 99%). This is a pilot-sized
formal check: it can catch a large problem, not certify a small one.
