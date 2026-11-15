# Development history

| Milestone | State |
|---|---|
| 1. Output format, exact match with Pierre's own example | done: `test/golden.test.ts` |
| 2. Moved, renamed, formatting-only, plus plain added/deleted/edited | done: `test/structure.test.ts` |
| 3. Extracted / inlined functions, measured on a hand-labelled set | done: `test/extract.test.ts`, `bench/extract-score.ts` |
| 4. Demo page + accuracy and speed scoreboard | done: `demo/` |
| 5. Hardening on real history from more repositories | done: `test/history.test.ts`, `bench/history.ts`, `bench/recall.ts` |
| 6. Imports as units; Rust | done: `test/imports.test.ts` |
| 7. Python, Java, C#; adversarial and held-out verification | done: `test/stress.test.ts`, `bench/synthetic.ts`, `bench/locked.sh` |

How the measured numbers moved, round by round, is under [verification.md](verification.md#results).
