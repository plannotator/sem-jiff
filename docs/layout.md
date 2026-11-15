# Layout

- `src/index.ts`: `semanticDiffFile(language, oldText, newText, name)` (operations, fold regions and the matching patch); `semanticDiff` returns the operations only
- `src/inline.ts`: inlined-function detection and its operation (set `SEMANTIC_DEBUG=1` to see why a candidate was rejected)
- `src/extract.ts`: extracted functions, as inlining run backwards
- `src/coverage.ts`: safety net so every line the plain line diff marks as changed is owned by an operation
- `bench/coverage.ts`, `bench/extract-score.ts`: coverage check and extract scoring against `test/fixtures/labels/`
- `src/structure.ts`: declaration matching: moves, renames, formatting-only
- `src/textmoves.ts`: statement-block moves from VS Code's diff
- `src/edits.ts`: plain added/deleted/edited for everything else (a viewer that draws operations colors only the lines an operation owns)
- `src/textdiff.ts`: one shared `@vscode/diff` run per file, bounded by work done so results are repeatable
- `src/pairing.ts`: which old function is which new one (same name, renamed, swapped)
- `src/runtime.ts`: setup (`configure`), debug switches, and the harness-only rule switches
- `bench/run.ts`: speed and findings over a dataset
- `bench/history.ts`: build a per-commit dataset from any git repository
- `bench/recall.ts`: extract/inline precision and recall against `test/fixtures/labels/history-extracts.json`
- `bench/synthetic.ts`: known changes applied to real files; checks the engine names them and claims nothing else
- `harness/`: the evaluation harness: every project measured on (`projects.json`), the exact commits and files used (`manifest.json.gz`), `setup.ts` to download and rebuild them, `score.ts` to score each set, and the labelling instructions
- `bench/locked.sh`: held-out score, totals only (`test/fixtures/labels/locked-extracts.json`, currently the second held-out set)
- `bench/locked-ts.sh`: TypeScript held-out score, totals only (`test/fixtures/labels/locked-ts-extracts.json`)
- `bench/locked-effect.sh`: Effect held-out score, totals only (`test/fixtures/labels/locked-effect-extracts.json`)
- `test/validate.ts`: output rules every result must keep; `test/stress.test.ts` + `test/fixtures/stress/`: adversarial regression cases
- `src/syntax.ts`: positions, tokens, similarity, function/statement/call lookup
- `src/parse.ts`: parser setup and per-language rules (TypeScript/JavaScript, Go, Rust, Python, Java, C#)
- `src/pierre-types.ts`: the operation types (Apache-2.0, copied from Pierre)
- `test/fixtures/pierre-inlined-function-go.json`: Pierre's fixture (Apache-2.0)
- `docs/icons/`: the icon set; `docs/design/`: icon design explorations; `docs/explainers/`: plain-language explainers

## Languages in the code

TypeScript (and JavaScript, TSX/JSX), Go, Rust, Python, Java and C#. Each
language is one entry in `src/parse.ts` (60–90 lines). It says, in that grammar's
node types:

- what a function, a block, a call and a return are
- which comment and attribute lines belong to the declaration below them
- which declarations to pair, imports included

Everything else is shared. An import is paired by what it imports (its module
path), so re-sorted imports show as moved instead of deleted and re-added. This
takes one line per language: `importDeclaration(node, pathText)`.

A new language needs a tree-sitter WASM grammar (npm packages ship one for most
languages) and that entry. Languages built from statement blocks (C/C++, Kotlin,
Swift, PHP, Ruby) fit as they are; implicit returns are handled the way Rust's
are. Languages where a function is one expression or a set of pattern-matched
clauses (Haskell, Elixir, OCaml, Lisps) would need more thought in the
extract/inline rules. Moves, renames, formatting and imports carry over to any of them.
