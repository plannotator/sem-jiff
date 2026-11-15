// The wasm files the engine loads, by the names a host serves them under. The package ships them in
// its `wasm/` folder (`@plannotator/sem-jiff/wasm/<file>`); a host that runs the engine in a page or a
// compiled binary copies them from there (`copyWasm` in `@plannotator/sem-jiff/copy-wasm`, or the
// `sem-jiff-copy-wasm` bin) and points `configure({ locateGrammar, locateRuntime })` at them.
// This file imports nothing, so a host can vendor it as source (it ships as `src/grammars.ts`).

/** web-tree-sitter's own runtime. */
export const SEM_DIFF_RUNTIME_FILE = 'web-tree-sitter.wasm';

/** The grammar file each language loads (keys are the engine's language ids). */
export const SEM_DIFF_GRAMMARS = {
  typescript: 'tree-sitter-typescript.wasm',
  tsx: 'tree-sitter-tsx.wasm',
  python: 'tree-sitter-python.wasm',
  go: 'tree-sitter-go.wasm',
  rust: 'tree-sitter-rust.wasm',
  java: 'tree-sitter-java.wasm',
  csharp: 'tree-sitter-c_sharp.wasm',
  php: 'tree-sitter-php.wasm',
  ruby: 'tree-sitter-ruby.wasm',
  kotlin: 'tree-sitter-kotlin.wasm',
  swift: 'tree-sitter-swift.wasm',
} as const;

/** Every grammar file, once each, in the order of SEM_DIFF_GRAMMARS. */
export const SEM_DIFF_GRAMMAR_FILES = [
  'tree-sitter-typescript.wasm',
  'tree-sitter-tsx.wasm',
  'tree-sitter-python.wasm',
  'tree-sitter-go.wasm',
  'tree-sitter-rust.wasm',
  'tree-sitter-java.wasm',
  'tree-sitter-c_sharp.wasm',
  'tree-sitter-php.wasm',
  'tree-sitter-ruby.wasm',
  'tree-sitter-kotlin.wasm',
  'tree-sitter-swift.wasm',
] as const;

/** Everything in the package's `wasm/` folder: the runtime first, then the grammars. */
export const SEM_DIFF_WASM_FILES = [SEM_DIFF_RUNTIME_FILE, ...SEM_DIFF_GRAMMAR_FILES] as const;

/** One of the wasm files the package ships. */
export type SemDiffWasmFile = (typeof SEM_DIFF_WASM_FILES)[number];
