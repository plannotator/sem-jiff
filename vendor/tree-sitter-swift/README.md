# tree-sitter-swift 0.7.3 (vendored)

`tree-sitter-swift.wasm` is the release asset of [alex-pinkus/tree-sitter-swift](https://github.com/alex-pinkus/tree-sitter-swift), tag `0.7.3` (commit b8b22bf), unchanged:
<https://github.com/alex-pinkus/tree-sitter-swift/releases/download/0.7.3/tree-sitter-swift.wasm>

- sha256: `0258a7ef17303a8079ffe0748b3583d59656b5c3e8653fca7b6451b3e6689eb2` (also in `SHA256SUMS`)
- Size: 3,825,025 bytes
- Licence: MIT (`LICENSE`, from the same release)

It is vendored because npm has only 0.7.1, which ships no wasm, and a 0.7.1 build failed to parse 9 of 19 real Swift files. The file is installed as a local `file:` dependency named `tree-sitter-swift`, so the engine loads it as `tree-sitter-swift/tree-sitter-swift.wasm`, like the npm grammars.

## Updating

1. Download the new release asset: `gh release download <tag> -R alex-pinkus/tree-sitter-swift -p tree-sitter-swift.wasm`, and take `LICENSE` from the same tag.
2. Replace `tree-sitter-swift.wasm` (and `LICENSE` if it changed) here, and set `version` in `package.json` to the tag.
3. Update `SHA256SUMS`: `shasum -a 256 tree-sitter-swift.wasm > SHA256SUMS`.
4. Put the new sha256 in the pinned check: `test/swift.test.ts`.
5. Reinstall (`npm install`). Then run the tests, including the Swift trap cases, and `npm run build`, whose `scripts/build-wasm.ts` refuses a file whose sha256 does not match.
