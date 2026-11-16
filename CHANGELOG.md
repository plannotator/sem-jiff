# Changelog

## 0.2.1

Held back in Swift, Ruby and Kotlin: claims whose wrong rate, measured on a fresh blind set, could be above our
1-in-50 bar. Their lines show as plain edits. The set: 30 projects never used before (10 per language), every claim
labelled blind by two raters and a third where they disagreed; the bar is the one-sided 95% upper bound on the wrong
rate, at most 2%.

| Language | Held back (wrong in n, 95% upper bound) | Still claimed |
|---|---|---|
| Swift | moved 4 in 131 (6.9%), renamed 3 in 149 (5.1%), extract/inline 6 in 142 (8.2%) | reformatted (0 in 150) |
| Ruby | moved 2 in 96 (6.4%), renamed 2 in 146 (4.3%), extract/inline 2 in 145 (4.3%) | reformatted (0 in 150) |
| Kotlin | renamed 2 in 143 (4.3%), extract/inline 4 in 142 (6.3%) | moved (0 in 138, under 2.2%), reformatted (0 in 150) |

Moved-with-edits stays held back in all three (wrong 30 in 125, 7 in 50, 69 in 131). No second opinion is asked
about an extract or inline a language holds back. 0.3 brings these back once each is measured under the bar.
The other eight languages are unchanged.

- Each operation can carry an optional `symbol: { name, kind, oldName?, container? }`: the declaration it is about
  (docs/symbols.md). Additive: no other field changes, and it is left out when the engine is unsure.
- Docs: `copyWasm` in the README; the `sem-jiff-copy-wasm` bin needs Node 24 or later, or Bun; vendoring the source
  tree needs the devDependencies (PACKAGING.md).

## 0.2.0 (2026-11-15)

The engine Plannotator's code review runs, now as one package. Languages, and the claims each holds back in this version
(their lines show as plain edits):

- TypeScript and TSX: none held back.
- JavaScript (read with the TSX grammar): none held back.
- Python: none held back.
- Go: none held back.
- Rust: none held back.
- Java: none held back. A method moved into another class, or into or out of a nested class, is now an edit, not a move (the decided rule; the class a line sits in is its context). Sorted imports still show as moves, not a reorder.
- C#: none held back. A move into another class or namespace, or into or out of a nested class, is now an edit; the parts of a partial class share one member scope, so a member moved between them is moved; `Foo` and `Foo<T>` are different classes. Of two swapped members the unchanged one is often named as the move.
- PHP (tree-sitter-php 0.24.2): none held back.
- Ruby (tree-sitter-ruby 0.23.1): holds back moved-with-edits.
- Kotlin (tree-sitter-kotlin 1.1.0, vendored release wasm): holds back moved-with-edits.
- Swift (tree-sitter-swift 0.7.3, vendored release wasm): holds back moved-with-edits.

Java and C# context fix, measured on their existing sets (13 projects, 9,962 files; these sets have been seen, so this is
practice): moved-with-edits claims 71 -> 60, moved 81, renamed 32 and reformatted 495 unchanged. The 11 claims removed
were all judged wrong by a blind strict audit; no claim judged correct was lost and none was added. The 4 Java/C# trap
cases that failed on false claims now pass. These sets are spent: a fresh held-out measurement for Java and C# is owed.

Packaging:
- Entry points `.`, `./summary`, `./opinions`, `./candidate`, `./languages` and `./grammars`, built JavaScript with declarations.
- Every grammar and web-tree-sitter's runtime prebuilt in `wasm/` (`./wasm/*`), with `wasm/SHA256SUMS`.
- `src/opinions.ts`, `src/candidate.ts` and `src/grammars.ts` shipped as source for hosts that vendor them (none imports anything).
- Runtime dependencies are web-tree-sitter, diff and @vscode/diff; the grammar packages are build-time only.
- Second-opinion answers are kept and reported (`secondOpinion` on the result, `jevAnswers`/`clefAnswers`, `rejectedCandidates`).
- A Vite build of a page that imports the engine keeps the wasm files out of its output; the pack test builds a small
  Vite consumer and checks that.
- `SEM_DIFF_GRAMMARS`, `SEM_DIFF_GRAMMAR_FILES` and `SEM_DIFF_WASM_FILES` keep their exact file names as types, and
  `SemDiffWasmFile` names one of them.
- `copyWasm(destDir)` (`./copy-wasm`) and the `sem-jiff-copy-wasm` bin copy the wasm files out of the installed package,
  checking each against `wasm/SHA256SUMS`.
