// Copies the package's wasm files (web-tree-sitter's runtime and every grammar) into a host's own folder, for a
// page or a compiled binary that serves or embeds them under these names. Node only. Each file is checked against
// the package's wasm/SHA256SUMS on the way. Also the `sem-jiff-copy-wasm <dest-dir>` bin.
import { SEM_DIFF_WASM_FILES, type SemDiffWasmFile } from './grammars.ts';

/** Copy `files` (default: all of SEM_DIFF_WASM_FILES) into `destDir`, creating it; returns the paths written. */
export async function copyWasm(destDir: string, files: readonly SemDiffWasmFile[] = SEM_DIFF_WASM_FILES): Promise<string[]> {
  const fsName = 'node:fs';
  const pathName = 'node:path';
  const urlName = 'node:url';
  const cryptoName = 'node:crypto';
  // Node's modules, loaded only when called, typed by what is used here (the package builds without Node's types).
  const fs = (await import(/* @vite-ignore */ fsName)) as {
    readFileSync(p: string): Uint8Array;
    readFileSync(p: string, encoding: 'utf8'): string;
    mkdirSync(p: string, options: { recursive: true }): unknown;
    writeFileSync(p: string, data: Uint8Array): void;
  };
  const path = (await import(/* @vite-ignore */ pathName)) as { join(...parts: string[]): string };
  const { fileURLToPath } = (await import(/* @vite-ignore */ urlName)) as { fileURLToPath(u: URL): string };
  const { createHash } = (await import(/* @vite-ignore */ cryptoName)) as { createHash(algorithm: 'sha256'): { update(b: Uint8Array): { digest(encoding: 'hex'): string } } };
  // Built in a variable: a template in `new URL(..., import.meta.url)` would make bundlers glob the folder.
  const folderPath = '../wasm/';
  const folder = fileURLToPath(new URL(/* @vite-ignore */ folderPath, import.meta.url));
  const sums = new Map(
    fs.readFileSync(path.join(folder, 'SHA256SUMS'), 'utf8').trim().split('\n').map((line: string) => {
      const [sum, name] = line.split(/\s+/);
      return [name!, sum!] as const;
    })
  );
  fs.mkdirSync(destDir, { recursive: true });
  const written: string[] = [];
  for (const name of files) {
    const bytes = fs.readFileSync(path.join(folder, name));
    const got = createHash('sha256').update(bytes).digest('hex');
    if (got !== sums.get(name)) throw new Error(`sem-jiff: ${name} has sha256 ${got}, expected ${sums.get(name) ?? 'none (not in SHA256SUMS)'}`);
    const to = path.join(destDir, name);
    fs.writeFileSync(to, bytes);
    written.push(to);
  }
  return written;
}
