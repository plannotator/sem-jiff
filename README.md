# @plannotator/sem-jiff

Part of [Plannotator](https://github.com/backnotprop/plannotator).

A diff shows lines that were added and deleted. Much of that is not a real change:
a function moved further down the file, a variable renamed, code reformatted, a
block pulled out into a helper. This package reads both versions of a file,
understands their structure, and says what each change really is, so a reviewer
can skip what kept its meaning and focus on what didn't.

It returns that as plain data (`semanticOperations` and `semanticFolds`, with the matching patch) that any
diff viewer can draw. The operation types in `src/pierre-types.ts` are copied from
[Pierre](https://github.com/pierrecomputer/pierre) (Apache-2.0).

## What it finds

| Change | Example |
|---|---|
| Moved | `loadUser` moved below `saveUser`, unchanged |
| Moved and edited | moved, with a line changed on the way |
| Renamed | `MAX_RETRIES` became `MAX_ATTEMPTS` everywhere, nothing else changed |
| Reformatted | the same code laid out differently (line breaks, Prettier) |
| Reordered | imports or members re-sorted |
| Extracted function | a loop left `checkout` and now lives in a new `sumLineItems` it calls |
| Inlined function | a helper was removed and its body pasted where it was called |
| Added, deleted, edited | everything else, as a plain diff |

It prefers saying nothing to saying something wrong: a missed change falls back to
the plain diff, while a wrong label would mislead the reviewer.

## Install

```sh
npm install @plannotator/sem-jiff
```

The grammars ship prebuilt in the package's `wasm/` folder; `sem-jiff-copy-wasm <dest-dir>` copies them where a
page or a compiled binary can load them (see PACKAGING.md).

## Usage

```ts
import { semanticDiffFile, languageForPath } from '@plannotator/sem-jiff';

const language = languageForPath('src/users.ts'); // 'typescript'
const { semanticOperations, semanticFolds, patch } =
  await semanticDiffFile(language, oldText, newText, 'src/users.ts');

// Give your diff viewer the patch too, so its layout matches the operations,
// then draw semanticOperations over it.
```

A fifth argument sets guardrails: `{ maxChars, timeBudgetMs }`. A file over `maxChars`
(default 2,000,000 characters) gets a plain diff. `timeBudgetMs` (off by default) skips the
remaining passes once that much time has gone by; since timing varies between machines, the
same file can then get different labels, so it is opt-in. `diagnostics` on the result says what each
pass did (`ok`, `failed` or `skipped`, with the reason and time taken).

For an "edits only" view, `reviewSummary(semanticOperations)` splits the operations into `read`
(edited, added, deleted, moved with edits) and `skim` (moved, renamed, reordered, reformatted, extracted,
inlined), with counts and line totals for a header such as "1 edit, 4 skimmable". Collapse the `skim`
group; don't remove it from view: a wrong label must not be able to hide a real edit.

Without `timeBudgetMs`, the same two texts always give the same result, on any machine and
under any load. Costly line diffs are cut short by a count of work done, not by the clock
(`src/textdiff.ts`).

Parsing uses `web-tree-sitter` (WebAssembly), so the same code runs in Node 24+ and in a
browser or worker. Every grammar ships in the package's own `wasm/` folder, so in Node nothing
else is needed. In a browser, copy those files next to your app (`npx sem-jiff-copy-wasm <dir>` or
`copyWasm(dir)` from `@plannotator/sem-jiff/copy-wasm`) and tell the engine where they are served from:

```ts
import { configure } from '@plannotator/sem-jiff';

configure({
  locateGrammar: (file) => new URL(`/grammars/${file.split('/').pop()}`, location.href),
  locateRuntime: (file) => `/grammars/${file}`, // web-tree-sitter.wasm
});
```

**Power-up: a second opinion from your own model (optional).** The rules are strict, so they
miss extracted functions whose code was reworded on the way out. Give the engine a decision
model and it asks about exactly those candidates, once per file, and accepts what the model is
sure of. Your key, your account; call it from a server or your own machine.

```ts
import { semanticDiffFile } from '@plannotator/sem-jiff';
import { checkKey, clefOpinion, clefScore, jevOpinion } from '@plannotator/sem-jiff/opinions';

// In a settings screen: one tiny question to see whether the key works (or why not).
const check = await checkKey({ provider: 'jev', apiKey });   // { ok: true, ms } | { ok: false, reason }

const secondOpinion = jevOpinion({ apiKey });                // or clefOpinion({ accountId, apiToken })
const diff = await semanticDiffFile('typescript', oldText, newText, 'src/cart.ts', { secondOpinion });

// Both keys: Clef breaks the tie when Jev is unsure (only a few percent of questions).
jevOpinion({ apiKey, tieBreaker: { ask: clefScore({ accountId, apiToken }) } });
```

On the fresh final set (193 real extract/inline cases, see [How well it works](#how-well-it-works)) the engine
alone finds 127 with 1 wrong claim; with Jev 168 with 5 wrong; with Jev and Clef as tie-breaker 171 with 5 wrong.
On the older, much-used held-out sets (454 cases): 263, 8 wrong; 371, 12 wrong; 388, 13 wrong. About
$0.0004 per 500-line change with Jev. It is never asked about code
still present in the caller, and answers are remembered, so opening the same diff again costs
nothing. If the service fails the diff goes ahead without it; a refused key or an empty account
stops the questions at once and says so in `diagnostics` (pass `second-opinion`).
Details: [harness/compare/README.md](harness/compare/README.md).

```sh
npm install
npm run check   # typecheck + tests
npm run build   # dist/: JavaScript + type definitions
npm run smoke   # pack, install into an empty project, import in Node, bundle for the browser
npm run smoke:browser   # run the built engine in a Web Worker in headless Chromium
```

## How well it works

**Final score (2026-11-11), on a fresh set nobody had looked at.** Seven projects never used before
(astro, TanStack Router, traefik, nushell, pydantic, mockito, MudBlazor: TypeScript, Go, Rust, Python, Java, C#),
labelled blind by independent agents, scored once, totals only. 193 real cases of a function pulled out or merged back:

| | Found | Wrong claims | Borderline claims |
|---|---|---|---|
| Engine alone | 127 (66%, range 51–72% across projects) | 1 of 133 claims | 5 |
| + Jev second opinion | 168 (87%, range 76–92%) | 5 of 181 claims | 8 |
| + Jev, Clef as tie-breaker | 171 (89%, range 76–95%) | 5 of 186 claims | 10 |

The ranges come from resampling the seven projects. "Found" is somewhat high on every set: every claim the engine
makes is labelled, but its misses are counted only from a sample of 70 candidates per project.

Earlier sets, measured the same way (each was scored many times while the engine was developed, so these are less
trustworthy than the row above):

| Code | Functions pulled out or merged back that it finds | Wrong claims |
|---|---|---|
| TypeScript (Vue, TanStack Query, tldraw, Mermaid, tRPC, Apollo) | 57% | 1 in 90 |
| Effect (6 projects) | 62% | 1 in 108 |
| Mixed languages (6 projects) | 68% | 1 in 64 |

Moves, renames, formatting and imports: no false claims on about 7,000 generated
known changes. Details are under [How it is verified](#how-it-is-verified); to repeat
the measurements yourself, see [`harness/`](harness/README.md).

## Languages

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

## Development history

| Milestone | State |
|---|---|
| 1. Output format, exact match with Pierre's own example | done: `test/golden.test.ts` |
| 2. Moved, renamed, formatting-only, plus plain added/deleted/edited | done: `test/structure.test.ts` |
| 3. Extracted / inlined functions, measured on a hand-labelled set | done: `test/extract.test.ts`, `bench/extract-score.ts` |
| 4. Demo page + accuracy and speed scoreboard | done: `demo/` |
| 5. Hardening on real history from more repositories | done: `test/history.test.ts`, `bench/history.ts`, `bench/recall.ts` |
| 6. Imports as units; Rust | done: `test/imports.test.ts` |
| 7. Python, Java, C#; adversarial and held-out verification | done: `test/stress.test.ts`, `bench/synthetic.ts`, `bench/locked.sh` |

## How it is verified

Five layers, each catching what the others cannot. A wrong claim misleads a
reviewer; a miss only falls back to a plain diff, so the bar is no false claims
first, and finding more second.

1. **Unit and regression tests** (`npm test`, 243 tests). Includes 163 adversarial
   cases written by independent stress-test agents, 58 of them aimed at TypeScript
   and React (renames hiding edits,
   meaning-changing line breaks labelled formatting, boilerplate posing as moved
   code, swaps reported twice, fuzzer crashes), each pinned to the engine's answer
   (`test/stress.test.ts`, `test/fixtures/stress/`). Every result is also checked
   against the output rules in `test/validate.ts`.
2. **Output rules on real history.** Every commit's diff in 32 projects, file by
   file: no crash, the patch rebuilds the new file, every changed line is owned by
   exactly one operation (`bench/run.ts`, `bench/coverage.ts`).
3. **Known changes** (`bench/synthetic.ts`). Real files from the first 11 projects get a
   known change (a function moved, a local renamed, statements extracted into a
   helper and back, imports re-sorted, a function re-indented), and the engine must
   name it and claim nothing else. No hand labels needed, thousands of cases.
4. **Hand-labelled real history** (`bench/recall.ts`). Independent agents label
   candidates from a deliberately loose search, so misses are measured as well as
   mistakes. The projects tuned on are the *practice* set: 11 at first, a second
   batch of 9 fresh ones, then the first held-out set once it was retired
   (`test/practice2.test.ts` pins what these taught). Labels judge the helper, not
   the candidate's caller: a real extract listed with the wrong caller is still real.
5. **Held-out projects** (`bench/locked.sh`). Six more projects, labelled the same
   way, never debugged on: the script prints totals only. A change that helps the
   practice set but not these was fitted to cases, not to code. The set is
   *rotated*: when its mistakes are worth studying, it joins the practice set and
   six new projects are labelled as the next held-out set.

The fuzzer used for layer 1's crash cases (random line edits, truncation, syntax
errors, CRLF/CR-only, BOM, deep nesting, 20,000-line files) ran 4,000 pairs on the
final engine with no crashes and no broken output rules.

### Results

Known changes (layer 3), 200 files per project, the first 11 projects:

| Change | Tried | Named correctly | False claims |
|---|---|---|---|
| function moved | 457 | 100% | 0 |
| imports re-sorted | 1,515 | 100% | 0 |
| function re-indented | 1,323 | 99.4% | 0 |
| local renamed | 946 | 97.7% | 0 |
| statements extracted into a helper | 229 | 99.1% | 0 |
| helper inlined | 229 | 99.1% | 0 |

Extracted and inlined functions in real history (layers 4 and 5):

| | Real cases | Found | Wrong claims |
|---|---|---|---|
| Practice, first 11: vite, Hugo, TypeScript-Go, ripgrep, tokio, django, rich, guava, kafka, jellyfin, Avalonia | 258 | 171 (66%) | 2 |
| Practice, second batch: hono, svelte, playwright, drizzle-orm, prometheus, helix, scrapy, jenkins, Polly | 116 | 79 (68%) | 0 |
| Practice, retired held-out set: excalidraw, cli, uv, black, spring-boot, AutoMapper | 173 | 101 (58%) | 2 |
| Practice, TypeScript batch: React Router, Zod, Prisma (sampled), Storybook, Vitest | 128 | 78 (61%) | 1 |
| Practice, Effect: Effect, language service, discord-bot, pi-claude-cli, herdr SDK, stack, visual-effect, beep-effect, strider, allthingsweb, effected, watchdog, efffrida, opencode, livestore, effect-aws, alchemy-async, Foldkit, foldkit-plus, foldkit-domains (sampled) | 511 | 403 (79%) | 6 |
| Practice, retired Effect held-out set: Effect 4 (effect-smol), alchemy, ghui, motel, overseer, janitor (sampled) | 230 | 167 (73%) | 6 |
| vscode 60-commit range | 14 | 13 | 0 |
| **Held out (current): nest, caddy, alacritty, poetry, netty, EF Core** | **93** | **63 (68%)** | **1** |
| **Held out, TypeScript only: Vue, TanStack Query, tldraw, Mermaid, tRPC, Apollo Client** | **146** | **83 (57%)** | **1** |
| **Held out, Effect (second set): aksara, ghost, peektrace, dotflowy, foldkit-dials, foldkit-alchemy-starter (sampled)** | **154** | **96 (62%)** | **1** |
| **Final, fresh (2026-11-11): astro, TanStack Router, traefik, nushell, pydantic, mockito, MudBlazor** | **193** | **127 (66%)** | **1** |

The held-out rows are the honest estimate for unseen code. Across languages about
two thirds of real extracts and inlines are found and about 1 report in 64 is
wrong; on TypeScript a bit over half are found and wrong claims are rare (1 in
about 88 reports). On the second Effect set about three in five are found and 1 report in
108 is wrong. The wrong claims left in practice are judgement calls or
single cases (a one-line getter, helpers whose code was mostly rewritten, a
local closure renamed and rewritten, a helper deleted outright).

How the numbers got here, each step scored before tuning on it:

- **First held-out set:** 86 of 164 found, 6 wrong. On unlocking it, 5 of the 6
  "wrong" were labelling slips: real extracts listed under the wrong caller,
  where the engine had named the right one. Corrected, it was 1 wrong in 98 reports.
- **Second practice batch:** 76 of 116 found (66%), 3 wrong. It taught three
  rules: statements that call different functions are not the same code; a
  helper renamed into a new closure of its caller is not inlined; a function
  whose name is still declared was not renamed. They took it to 1 wrong with no
  finds lost, but left the first held-out set unchanged.
- **Second held-out set,** with the engine as it stood before studying the first
  one: 64 of 93 found, 5 wrong. Studying the first set taught two more rules:
  code in object-property functions (`perform: () => {...}`) is followed, and a
  statement the caller kept, edited, is not code that moved into a new helper.
  Re-scored: 63 found, 3 wrong (and 0 wrong in the second practice batch).
- **TypeScript held-out set,** scored before the TypeScript round: 70 of 146
  found (48%), 1 wrong. The round taught: one-line arrow helpers
  (`const f = (x) => x.a`) are functions, with their value matched in order and
  by name; JSX `<Row />` calls the `Row` component; `memo`, `forwardRef`,
  `useCallback` and `observer` wrap the function they define; a call inside a
  helper is not a call site. Re-scored: 82 found (56%), still 1 wrong.
- **TypeScript stress agents** (58 cases) found and fixed: a local rename that
  swallowed same-spelled properties of other objects (`user.name`), field
  renames reaching another type's property (`input.value`, `document.title`),
  an import alias "renamed" while the import changed, decorators left behind by
  their methods, `return` + line break (which returns `undefined`) called
  formatting, and Prettier output not recognised as formatting (leading `|` in
  unions, `(x) =>`, member `;`, JSX in parentheses, a whole interface wrapped).
  `.js` files are now read with the JSX-aware grammar.
- **Second TypeScript round:** a helper's value is also looked for with the
  call's arguments put in place of its parameters (`usesRegisterHooks(process.versions.node)`
  for `Number(process.versions.node.split('.')[0]) >= 26`), and a one-expression
  helper that grew around the old expression counts (`paths.sort().join(",")`
  became a helper that also encodes commas), as long as the old piece makes two or
  more calls, comes mostly from the helper's own code rather than the arguments,
  and is gone from the caller. Practice: 16 more found (431 of 675, 64%;
  9 of them new claims checked by hand, all real), no new wrong claims. TypeScript held-out: 83 found (57%), still 1 wrong;
  the mixed held-out set unchanged.

- **Effect round,** with two new Effect sets (20 practice projects, 6 held out,
  labelled from a candidate search that knows Effect helpers; vendored copies of
  Effect, alchemy and Foldkit inside some repos left out). Before: held out 147 of
  230 found (64%), 10 wrong; practice 305 of 511 (60%), 12 wrong. Learned:
  `const f = Effect.gen(function* ...)`, `Effect.fn("f")(...)`, `Effect.fnUntraced(...)`
  and `Effect.suspend(...)` define a function, and `yield* f` or `yield* f.pipe(...)`
  uses one; a function stored in an object literal (`{ run: () => ... }`) is called
  only by `this.run()` or `run()`, not by some `options.run()` (held out: 17 wrong
  down to 9, no finds lost). After: held out 169 found (73%), 9 wrong; practice 409
  (80%), 10 wrong. The other sets are unchanged. Tried and dropped because they cost
  held-out finds without removing held-out wrong claims: dropping a "grew around"
  extract whose code another finding took (2 finds), skipping piece matching for
  one-line helpers (15 finds), requiring scattered pieces to total 25 tokens (4 finds).

- **Effect rotation.** The first Effect held-out set was opened for study and a new one
  labelled (6 projects never used before, vendored copies and a data corpus left out).
  Scored first with the engine as it stood: 96 of 154 found (62%), 2 wrong; the engine
  from before any Effect work found 83, also 2 wrong, so the Effect round carried over to
  unseen code. Studying the old set's 9 wrong claims: most were a new helper matched to
  code still sitting, unchanged, in its caller (a new `runValuesUncached` beside an
  unchanged `runValues`). Now a piece of the helper (or its returned value) counts only
  if the caller's other version holds it fewer times, not counting the helper's own code
  when it is declared inside the caller. Result: new held out 96 found, 1 wrong; old set
  9 wrong down to 6 for 2 finds; mixed held out 3 wrong down to 1 for 1 find; TypeScript
  sets unchanged. About 7% slower in total on opencode (typical files unchanged).

- **Head-to-head round** (`harness/compare/`). RefactoringMiner on the same Java commits and
  files found more (96 of 122 real, against our 68) with far more wrong claims (19 against 1);
  its extra claims, labelled blind, added 42 real cases our own candidate search had missed.
  Learned from it: code moved into a new overload of the same name (the old signature kept as a
  wrapper) is an extract; a function stored in an object literal is named after the object's
  holder (`actionWrap.perform`), so several objects' `perform`s stay apart. From the generated
  changes: renamed lambda parameters, Go parameters declared together and Python `except ... as`
  targets. Java: 68 to 74 found, still 1 wrong; held-out sets unchanged. A learned check
  (`src/classifier.ts`, `harness/classifier/`) added 19 finds on unseen practice projects but none
  on the held-out sets, so it is off by default.

- **Call-matching round, and repeatable results** (2026-11-09). Three rules about which calls reach a
  helper: the "callers still call it" check counts only calls whose argument count fits the helper; a
  Java call passing fewer arguments than a method takes is another method of that name; `this(...)`
  inside a Java constructor calls a constructor. Practice (1,511 real): 12 more found, 0 wrong, 2
  borderline (the judge in `harness/analysis/judge.py`: keep, p = 0.005; the 13 new claims were labelled
  blind first: 9 real, 4 borderline). Held-out totals (454 real): no new finds, 0 wrong, 3 borderline:
  the gain did not carry over, the rules stay because they cost no wrong claims. Tried and dropped:
  pairing overloads by identical parameter lists (undecided on practice, 2 more borderline claims held
  out). Also in this round: line diffs are now cut short by work done instead of by the clock, so two
  runs give identical results (checked on all 55,396 practice files under load); the rule switches used
  for these measurements moved out of the shipped code into the harness; and plain git, diffmantic,
  a newer sem and RefactoringMiner on Python joined the comparison (`harness/compare/README.md`).

- **Renames next to edits, and an "edits only" split** (2026-11-10). A rename used to be found only in a
  declaration that was otherwise unchanged, so `rate` -> `taxRate` in a function whose discount also
  changed came out as plain edits. Now the statements of an edited declaration are a source of renames
  too, kept only for a variable or parameter whose own declaration reads the same apart from renames
  (not a function, not a name after a dot). On the practice projects this adds 187 renamed lines in 70
  files (1,100 before), and takes none away; all 70 files were judged blind: 56 correct, 12 borderline,
  2 wrong (existing renamed labels: 126, 22, 2 of 150). The first, looser version was 79, 10, 11 of 100
  and was not kept: most of its wrong claims were another thing under a new name (`typeChecker` ->
  `typeCheckerUtils`, a different service). Extract and inline scores are unchanged, project by project.
  Also: `reviewSummary` (what to read, what to skim), and an extract no longer claims a later use of
  the variable its helper returns.

Not covered: helpers moved into a different file in the same commit (about 10% of
cross-file candidates were real).

Re-sorted imports: in vite's history (which includes a commit that sorted every
file's imports), a plain line diff shows 1,449 import lines as deleted and re-added
although the import is still there; the engine shows 1, the rest as moves.

Speed: median 13–35 ms per file across the 12 projects.

## Layout

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

## Known erratum in Pierre's fixture

The moved body's new range in Pierre's example ends one character early
(`(14, 27)` on a 28-character line). That cuts the `g` off `item.Shipping`. Our
output covers the whole statement. The golden test records this as the
single allowed difference.

## Licence

MIT or Apache-2.0, at your choice (`LICENSE-MIT`, `LICENSE-APACHE`), like Plannotator.
`src/pierre-types.ts` and the Pierre fixture are Apache-2.0, copied from Pierre.
The WebAssembly files in `wasm/` (web-tree-sitter and the grammars) keep their own licences: see
`THIRD-PARTY-NOTICES`.
