# Using sem-jiff

The grammars ship prebuilt in the package's `wasm/` folder; `sem-jiff-copy-wasm <dest-dir>` copies them where a
page or a compiled binary can load them (see [PACKAGING.md](../PACKAGING.md)).

## Options and results

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

## Second opinion (Power Up)

A second opinion from your own model (optional). The rules are strict, so they
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

Results: [verification.md](verification.md#with-the-second-opinion).

## Development

```sh
npm install
npm run check   # typecheck + tests
npm run build   # dist/: JavaScript + type definitions
npm run smoke   # pack, install into an empty project, import in Node, bundle for the browser
npm run smoke:browser   # run the built engine in a Web Worker in headless Chromium
```
