#!/usr/bin/env node
// `sem-jiff-copy-wasm <dest-dir>`: copy every wasm file the package ships into <dest-dir> (see copy-wasm.ts).
import { copyWasm } from './copy-wasm.ts';

const { argv, exit } = (globalThis as unknown as { process: { argv: string[]; exit(code: number): never } }).process;

const dest = argv[2] ?? '';
if (!dest) {
  console.error('usage: sem-jiff-copy-wasm <dest-dir>');
  exit(2);
}
const written = await copyWasm(dest);
console.log(`sem-jiff: ${written.length} wasm files in ${dest}`);
