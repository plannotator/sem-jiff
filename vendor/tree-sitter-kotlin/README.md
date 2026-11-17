# tree-sitter-kotlin 1.1.0 (vendored)

`tree-sitter-kotlin.wasm` is the release asset of [tree-sitter-grammars/tree-sitter-kotlin](https://github.com/tree-sitter-grammars/tree-sitter-kotlin), tag `v1.1.0` (commit 77dd60e), unchanged:
<https://github.com/tree-sitter-grammars/tree-sitter-kotlin/releases/download/v1.1.0/tree-sitter-kotlin.wasm>

- sha256: `7009d69453bc8735e438b2818a633efb21c88f99782769abba60dffedfab73f7` (also in `SHA256SUMS`)
- Size: 3,441,042 bytes
- Licence: MIT (`LICENSE`, from the same release)

It is byte-identical to the `tree-sitter-kotlin.wasm` in the npm package `@tree-sitter-grammars/tree-sitter-kotlin` 1.1.0, the file the Kotlin engine was scored with. It is vendored because that npm package declares `npm-check-updates` as a runtime dependency, which would install with the app. The file is installed as a local `file:` dependency under the same name, `@tree-sitter-grammars/tree-sitter-kotlin`, so the engine loads it as `@tree-sitter-grammars/tree-sitter-kotlin/tree-sitter-kotlin.wasm`, as before.

## Updating

1. Download the new release asset: `gh release download <tag> -R tree-sitter-grammars/tree-sitter-kotlin -p tree-sitter-kotlin.wasm`, and take `LICENSE` from the same tag.
2. Replace `tree-sitter-kotlin.wasm` (and `LICENSE` if it changed) here, and set `version` in `package.json` to the tag.
3. Update `SHA256SUMS`: `shasum -a 256 tree-sitter-kotlin.wasm > SHA256SUMS`.
4. Put the new sha256 in the pinned check: `test/kotlin.test.ts`.
5. Reinstall (`npm install`). Then run the tests, including the Kotlin trap cases, and `npm run build`, whose `scripts/build-wasm.ts` refuses a file whose sha256 does not match.

## Patched build (trial KOTLIN_GRAMMAR only)

`tree-sitter-kotlin-patched.wasm` is tree-sitter-kotlin 1.1.0 (same tag, unchanged `parser.c`) with `scanner.patch`
applied to `src/scanner.c`. Release 1.1.0 ends a class header at a line break before a modified constructor, so
`class A` + newline + `@Inject internal constructor(...)` (top level) and a nested `class B` + newline +
`internal constructor(...)` parse with an ERROR and the rest of the class is lost. Kotlin reads both as the
primary constructor; the patched scanner does too.

- sha256: in `PATCHED-SHA256SUMS` (kept apart from `SHA256SUMS`, which the release build checks).
- Loaded only with the trial switch on (`SEMANTIC_TRY_KOTLIN_GRAMMAR=1`, source tree under Node). The package's
  `wasm/` folder and `wasm/SHA256SUMS` hold the release grammar only.
- Built with the flags of tree-sitter-cli 0.24.7 `build --wasm`, in Docker (`emscripten/emsdk:3.1.64`):
  `emcc -o tree-sitter-kotlin-patched.wasm -Os -fno-exceptions -fvisibility=hidden -s WASM=1 -s SIDE_MODULE=2
  -s TOTAL_MEMORY=33554432 -s NODEJS_CATCH_EXIT=0 -s 'EXPORTED_FUNCTIONS=["_tree_sitter_kotlin"]' -I src
  src/parser.c src/scanner.c`. The same command on the unpatched scanner gives a file that is not byte-identical
  to the release asset but parses every Kotlin file version of the practice and held3 sets to the same tree.
