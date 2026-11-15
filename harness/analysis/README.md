# Analysis: logbook, judge, charts

Everything here reads saved data only, so anyone can rerun it and get the same answer.

**Logbook.** Every `node harness/score.ts` run appends one record to `harness/work/ledger.jsonl`:
`label` (from `--label`), `time`, `set`, the switches in effect (`CLEF_*`, `SEMANTIC_*`, `QUICK`),
`totals` and `perProject` counts (counts only, also for held-out sets). Label runs you mean to compare:

```sh
node harness/score.ts --set practice --label before-x
# ...change the engine...
node harness/score.ts --set practice --label after-x
python3 harness/analysis/judge.py before-x after-x
```

**Judge** (`judge.py`). Keep / reject / undecided, by rules written at the top of the file and fixed
before a result is seen: a wrong claim costs five finds, unlabelled new claims mean "label first",
and a keep needs the gain to hold across projects (bootstrap interval above zero, sign-flip p < 0.1).
Seeded, so the same two records always get the same verdict.

**Charts** (`charts.py`, needs matplotlib in `harness/work/.venv`):

```sh
python3 -m venv harness/work/.venv && harness/work/.venv/bin/pip install matplotlib==3.9.2
harness/work/.venv/bin/python harness/analysis/charts.py harness/work/charts
```

1. *Gain vs mistakes*: for each second-opinion setup, real cases added against wrong claims added as
   the cut-off loosens (practice). The higher and steeper curve is better at every mistake budget.
2. *Calibration*: what a model said against how often it was right.
3. *Per project*: whether a gain is broad or carried by one project.
4. *Held-out*: real found per setting, from ledger records labelled `held:<setting>`.
