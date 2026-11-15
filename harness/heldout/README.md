# Building a fresh held-out set

These scripts made the `held-final` set (2026-11-11). Until now they lived only in temporary folders, so they are kept here
to be run again.

1. `build.sh <dir> name=url ...` clones each project (bare and shallow) and builds its dataset from its last 300
   commits, leaving out tests, vendored code and generated files. It then runs the loose candidate search
   (`loose.ts`) and writes the labelling list (`todo.ts`): a fixed-seed sample of 70 candidates per project, plus
   every extract or inline the engine claims. The sample never depends on anything anyone has seen.
2. Add the projects to `harness/projects.json` under a new `held-*` set, and link `<dir>/hist-<name>.json` into
   `harness/work/data/`.
3. For the second-opinion numbers, run `harness/compare/clef-collect.ts rows.jsonl --set <set>`, then
   `harness/compare/clef.py rows.jsonl --all --model jev --question choice` and `--model clef`. After that,
   `EXTRA=1 CLEF_ANSWERS=... todo.ts <dir> <name>` lists the claims the engine makes only with the second opinion,
   so they get labelled as well. Run it once with the tie-breaker settings and once with Jev alone.
4. Independent agents label each list following a counts-only copy of `../LABELLING.md`. They reply with counts and
   never name cases.
5. `merge.py <lab-dir> test/fixtures/labels/locked-<set>-extracts.json "<how>"` builds the answer key, and
   `node harness/score.ts --set <set>` scores it (totals only).

