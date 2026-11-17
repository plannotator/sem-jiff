// How the engine finds its parsers and reads its debug switches, kept apart so the core
// runs the same in Node, a browser and a worker. Nothing here imports a Node module up front.
import type { LanguageId } from './languages.ts';

/** A grammar or runtime file: a path or URL to load, or its bytes. */
export type WasmSource = string | URL | Uint8Array;

export interface SemDiffSetup {
  /**
   * Where a language's grammar lives. `file` is its package path, e.g.
   * `tree-sitter-go/tree-sitter-go.wasm`. In a browser, return a URL the page can fetch.
   * Default (Node only): resolved from the installed packages.
   */
  locateGrammar?: (file: string, language: LanguageId) => WasmSource | Promise<WasmSource>;
  /** Where web-tree-sitter's own `web-tree-sitter.wasm` lives (default: next to its script). */
  locateRuntime?: (file: string) => string;
  /** Debug output on stderr: why candidates were rejected, the evidence per candidate. */
  debug?: { reasons?: boolean; features?: boolean };
  /** Let the learned check accept candidates the rules reject (off by default). */
  learned?: boolean;
  /**
   * A second opinion on extract/inline candidates the rules reject, e.g. a decision model's
   * answers looked up ahead of time (harness/compare/clef.py). Return true to accept. It must
   * answer at once: look answers up here, never fetch them.
   */
  secondOpinion?: (candidate: Candidate) => boolean;
  /** Skip the second opinion when the helper's code is still in the caller (default on). */
  secondOpinionCopyCheck?: boolean;
}

export type { Candidate } from './candidate.ts';
import type { Candidate } from './candidate.ts';

let setup: SemDiffSetup = {};

/** Configure the engine once, before the first diff (later calls replace earlier ones). */
export function configure(s: SemDiffSetup): void {
  setup = { ...s };
}

export const currentSetup = (): SemDiffSetup => setup;

/** An environment switch, read only where `process` exists (Node); always off in a browser. */
function env(name: string): boolean {
  const p = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return !!p?.env?.[name];
}

export const flags = {
  reasons: () => !!setup.debug?.reasons || env('SEMANTIC_DEBUG'),
  features: () => !!setup.debug?.features || env('SEMANTIC_FEATURES'),
  learned: () => !!setup.learned || env('SEMANTIC_LEARNED'),
};

// Rules that can be switched off to measure what each one adds (harness/score.ts). Not part
// of the public setup: the shipped engine never reads the environment to decide a result.
const rulesOff = new Set<string>();
export const rule = (name: string): boolean => !rulesOff.has(name);
export function switchRulesOff(names: Iterable<string>): void {
  rulesOff.clear();
  for (const n of names) rulesOff.add(n);
}

// Trial rules: off unless switched on (harness: SEMANTIC_TRY_<NAME>=1), measured on a fresh draw before
// they may ship. Like the rule switches, not part of the public setup.
const trialsOn = new Set<string>();
export const trial = (name: string): boolean => trialsOn.has(name);
export function switchTrialsOn(names: Iterable<string>): void {
  trialsOn.clear();
  for (const n of names) trialsOn.add(n);
}

/**
 * The default grammar lookup (Node only, loaded only when needed and never bundled): the file in this
 * package's own `wasm/` folder when it is there (an installed package), else Node's resolver from the
 * grammar packages (the source tree).
 */
export async function resolveInNode(file: string): Promise<string> {
  const mod = 'node:module';
  const fsName = 'node:fs';
  const urlName = 'node:url';
  const { createRequire } = (await import(/* @vite-ignore */ mod)) as { createRequire(url: string): { resolve(id: string): string } };
  const { existsSync } = (await import(/* @vite-ignore */ fsName)) as { existsSync(p: string): boolean };
  const { fileURLToPath } = (await import(/* @vite-ignore */ urlName)) as { fileURLToPath(u: URL): string };
  // Built in a variable, not a template inside `new URL(..., import.meta.url)`: bundlers (Vite) turn that
  // pattern into a glob over ../wasm/ and would pull every grammar into a page build.
  const ownPath = '../wasm/' + file.split('/').pop();
  const own = fileURLToPath(new URL(/* @vite-ignore */ ownPath, import.meta.url));
  return existsSync(own) ? own : createRequire(import.meta.url).resolve(file);
}
