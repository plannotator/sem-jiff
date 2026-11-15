// Run the engine over a dataset of {name, oldContents, newContents} files and
// report speed, crashes and what it found. Usage: node bench/run.ts data.json [out.json]
import fs from 'node:fs';
import { languageForPath, semanticDiffFile } from '../src/index.ts';

const [, , dataPath, outPath] = process.argv;
if (!dataPath) throw new Error('usage: node bench/run.ts data.json [out.json]');
const files = JSON.parse(fs.readFileSync(dataPath, 'utf8')) as Array<{ name: string; oldContents?: string; newContents?: string }>;
const times: number[] = [];
const counts = new Map<string, number>();
const results: Array<{ name: string; ms: number; ops: Array<{ type: string; old: number[]; new: number[] }> }> = [];
let errors = 0;
let skipped = 0;
const t0 = performance.now();
for (const f of files) {
  const lang = languageForPath(f.name);
  if (!lang || f.oldContents == null || f.newContents == null || f.oldContents === f.newContents) { skipped++; continue; }
  const s = performance.now();
  try {
    const r = await semanticDiffFile(lang, f.oldContents, f.newContents);
    const ms = performance.now() - s;
    times.push(ms);
    for (const op of r.semanticOperations) counts.set(op.type, (counts.get(op.type) ?? 0) + 1);
    results.push({ name: f.name, ms, ops: r.semanticOperations.map((o) => ({ type: o.type, old: o.lines.old.map((l) => l.start), new: o.lines.new.map((l) => l.start) })) });
  } catch (e) {
    errors++;
    console.error('ERROR', f.name, (e as Error).message);
  }
}
const sorted = [...times].sort((a, b) => a - b);
const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]?.toFixed(1);
console.log(`files ${times.length}, skipped ${skipped}, errors ${errors}, total ${(performance.now() - t0).toFixed(0)} ms`);
console.log(`per file: median ${q(0.5)} ms, p95 ${q(0.95)} ms, max ${q(1)} ms`);
console.log('found:', Object.fromEntries([...counts].sort((a, b) => b[1] - a[1])));
if (outPath) fs.writeFileSync(outPath, JSON.stringify(results, null, 1));
