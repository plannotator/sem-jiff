// Safety check on the patch we hand Pierre: applying it to the old file must
// give the new file exactly, and every line it marks as changed must be owned
// by some operation (Pierre's semantic view draws only owned lines).
// Usage: node bench/coverage.ts data.json
import fs from 'node:fs';
import { applyPatch, parsePatch } from 'diff';
import { languageForPath, semanticDiffFile } from '../src/index.ts';

const files = JSON.parse(fs.readFileSync(process.argv[2]!, 'utf8')) as Array<{ name: string; oldContents?: string; newContents?: string }>;
let checked = 0;
let changedLines = 0;
let missing = 0;
let badPatches = 0;
const worst: Array<[string, number, string]> = [];
for (const f of files) {
  const lang = languageForPath(f.name);
  if (!lang || f.oldContents == null || f.newContents == null || f.oldContents === f.newContents) continue;
  const r = await semanticDiffFile(lang, f.oldContents, f.newContents, f.name);
  if (applyPatch(f.oldContents, r.patch) !== f.newContents) { badPatches++; console.log('  patch does not reproduce the new file:', f.name); }
  const owned = { old: new Set<number>(), new: new Set<number>() };
  for (const op of r.semanticOperations) for (const side of ['old', 'new'] as const) for (const l of op.lines[side]) for (let n = l.start; n <= l.end; n++) owned[side].add(n);
  const patch = parsePatch(r.patch)[0]!;
  let miss = 0;
  let sample = '';
  for (const h of patch.hunks) {
    let o = h.oldStart;
    let n = h.newStart;
    for (const line of h.lines) {
      if (line[0] === '-') { changedLines++; if (line.slice(1).trim() && !owned.old.has(o)) { miss++; sample ||= `old ${o}: ${line.slice(1).trim().slice(0, 60)}`; } o++; }
      else if (line[0] === '+') { changedLines++; if (line.slice(1).trim() && !owned.new.has(n)) { miss++; sample ||= `new ${n}: ${line.slice(1).trim().slice(0, 60)}`; } n++; }
      else if (line[0] === ' ') { o++; n++; }
    }
  }
  checked++;
  missing += miss;
  if (miss) worst.push([f.name.split('/').slice(-2).join('/'), miss, sample]);
}
console.log(`files ${checked}, patches that fail to reproduce the new file: ${badPatches}; changed non-blank lines ${changedLines}, not covered ${missing} in ${worst.length} files`);
for (const w of worst.sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(' ', w[1], w[0], '|', w[2]);
