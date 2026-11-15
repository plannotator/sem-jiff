# Using the sem-jiff package

How an app installs `@plannotator/sem-jiff`, which entry points it imports, and how it serves the WebAssembly files.
The package version and its changes are in `CHANGELOG.md`.

## Install

```sh
npm install @plannotator/sem-jiff
```

Node 24 or later. The runtime dependencies are `web-tree-sitter`, `diff` and `@vscode/diff`. The tree-sitter grammar
packages are not dependencies: every grammar ships prebuilt in the package's `wasm/` folder.

Declare the dependency in every package of your workspace that reads this one (imports it or copies its wasm files);
with isolated installs, a folder finds the package only through its own dependency.

## Entry points

| Import | File | What it exports |
|---|---|---|
| `@plannotator/sem-jiff` | `dist/index.js` | `semanticDiffFile`, `semanticDiff`, `languageForPath`, `configure`, `candidateId`, `reviewSummary`, `READ_KINDS`, `SKIM_KINDS`; types `SemanticDiffOperation`, `SemanticDiffFold`, `SecondOpinionReport`, `SecondOpinionLink`, `SecondOpinionState`, `LanguageId`, `Candidate`, `SemDiffSetup`, `WasmSource`, `DiffOptions`, `SemanticFileDiff`, `PassReport` |
| `@plannotator/sem-jiff/summary` | `dist/summary.js` | `reviewSummary`, `SKIM_KINDS`; type `ReviewSummary` |
| `@plannotator/sem-jiff/opinions` | `dist/opinions.js` | `jevOpinion`, `clefOpinion`, `clefScore`, `jevAnswers`, `clefAnswers`, `checkKey`, `OpinionKeyError`, `bandFor`, `candidateState`; types `OpinionAnswer`, `OpinionBand`, `JevOptions`, `ClefOptions`, `KeyCheck` |
| `@plannotator/sem-jiff/candidate` | `dist/candidate.js` | type `Candidate` |
| `@plannotator/sem-jiff/languages` | `dist/languages.js` | `languageForPath` (loads no parser) |
| `@plannotator/sem-jiff/grammars` | `dist/grammars.js` | `SEM_DIFF_RUNTIME_FILE`, `SEM_DIFF_GRAMMARS` (language to file), `SEM_DIFF_GRAMMAR_FILES`, `SEM_DIFF_WASM_FILES`, all typed with their exact file names; type `SemDiffWasmFile` |
| `@plannotator/sem-jiff/copy-wasm` | `dist/copy-wasm.js` | `copyWasm(destDir, files?)` (Node only): copies the wasm files out of the installed package, checking each against `wasm/SHA256SUMS` |
| `@plannotator/sem-jiff/wasm/<file>` | `wasm/<file>` | The WebAssembly files themselves |

Every entry point ships its declarations (`dist/*.d.ts`). They do not reference web-tree-sitter's types, so a
consumer does not need `@types/emscripten`. They compile with `strict`, `noUncheckedIndexedAccess` and `skipLibCheck`
off, under both `moduleResolution bundler` and `nodenext`.

## The wasm files

The package ships web-tree-sitter's runtime and every grammar prebuilt in `wasm/`, with `wasm/SHA256SUMS`:

| File | Language |
|---|---|
| `web-tree-sitter.wasm` | runtime |
| `tree-sitter-typescript.wasm` | TypeScript |
| `tree-sitter-tsx.wasm` | TSX and JavaScript |
| `tree-sitter-python.wasm` | Python |
| `tree-sitter-go.wasm` | Go |
| `tree-sitter-rust.wasm` | Rust |
| `tree-sitter-java.wasm` | Java |
| `tree-sitter-c_sharp.wasm` | C# |
| `tree-sitter-php.wasm` | PHP |
| `tree-sitter-ruby.wasm` | Ruby |
| `tree-sitter-kotlin.wasm` | Kotlin |
| `tree-sitter-swift.wasm` | Swift |

Their licences are in `THIRD-PARTY-NOTICES`.

**In Node** nothing is needed: when no `locateGrammar` is configured, the engine loads the grammars from the installed
package's `wasm/` folder.

**In a browser, a worker or a compiled binary**, copy the files into your app's assets at build time and tell the
engine where they are served. The package does the copy, checking every file against `wasm/SHA256SUMS`:

```sh
npx sem-jiff-copy-wasm dist/sem-jiff
```

or, from a build script:

```ts
import { copyWasm } from '@plannotator/sem-jiff/copy-wasm';

await copyWasm('dist/sem-jiff'); // every file in SEM_DIFF_WASM_FILES; pass a list to copy fewer
```

Then, where the engine runs:

```ts
import { configure } from '@plannotator/sem-jiff';

configure({
  locateRuntime: (file) => `/sem-jiff/${file}`,
  locateGrammar: (file) => `/sem-jiff/${file.split('/').pop()}`,
});
```

`locateGrammar` receives a package-relative path; its last segment is the file name in `wasm/`.

A bundler can also import a file directly: `import url from '@plannotator/sem-jiff/wasm/tree-sitter-go.wasm'` (as a
URL in a browser bundle, or with `with { type: 'file' }` to embed it in a Bun-compiled binary). A page that imports the
engine does not pull the grammars into its build on its own; only web-tree-sitter's runtime comes along, as for any page
that imports web-tree-sitter.

## Source files for hosts that vendor them

Three source files ship as TypeScript, for hosts (such as a Pi-style extension) that copy source instead of importing
the package:

- `src/opinions.ts`: the bring-your-own-model second opinions. It imports only `type { Candidate } from './candidate.ts'`.
- `src/candidate.ts`: the `Candidate` type. It imports nothing.
- `src/grammars.ts`: the wasm file names. It imports nothing.

Copy them from the package's `src/` folder (through the host's own dependency on the package). No other source file is
shipped.

## Building and checking the package

- **Build:** `npm run build` writes `dist/` (JavaScript and declarations) and `wasm/` (with `wasm/SHA256SUMS`). The
  vendored Kotlin and Swift grammars are checked against their pinned sha256 first.
- **Pack:** `npm pack`.
- **Proof:** `SEM_DIFF_PACK_TEST=1 node --test test/package.test.ts` installs the packed tarball into a throwaway project
  outside the source tree and checks it there: every entry point imports, every grammar loads in Node, the wasm files
  embed in a Bun-compiled binary and bundle for a browser, `copyWasm` and the `sem-jiff-copy-wasm` bin copy them, a Vite
  page build pulls in no grammar, the declarations pass a strict consumer, no grammar package is installed, and no
  harness, bench, test, demo, docs, scripts or vendor file is shipped.

The tarball holds `dist/`, `wasm/`, `src/opinions.ts`, `src/candidate.ts`, `src/grammars.ts`, `README.md`, `CHANGELOG.md`,
`LICENSE-MIT`, `LICENSE-APACHE`, `THIRD-PARTY-NOTICES` and `package.json`.
