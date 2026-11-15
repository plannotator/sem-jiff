// Score extracted-function detection against hand labels.
// Usage: node bench/extract-score.ts data.json labels.json
import fs from 'node:fs';
import { languageForPath, semanticDiffFile } from '../src/index.ts';

const [, , dataPath, labelPath] = process.argv;
const files = JSON.parse(fs.readFileSync(dataPath!, 'utf8')) as Array<{ name: string; oldContents?: string; newContents?: string }>;
const { labels } = JSON.parse(fs.readFileSync(labelPath!, 'utf8')) as { labels: Array<{ file: string; into: string; label: string }> };
const labelOf = (file: string, into: string) => labels.find((l) => l.file === file && l.into === into)?.label ?? 'unlabelled';

const found: Array<{ file: string; into: string; label: string }> = [];
for (const f of files) {
  const lang = languageForPath(f.name);
  if (!lang || !f.oldContents || !f.newContents || f.oldContents === f.newContents) continue;
  const r = await semanticDiffFile(lang, f.oldContents, f.newContents);
  for (const op of r.semanticOperations.filter((o) => o.type === 'extractedFunction')) {
    const container = op.spans.find((s) => s.role === 'container');
    if (!container || container.relation !== 'introduced') continue;
    const header = f.newContents.split('\n')[container.new[0]!.start.line - 1] ?? '';
    const into = labels.filter((l) => l.file === f.name).map((l) => l.into).find((name) => new RegExp(`\\b${name}\\s*[(<]`).test(header)) ?? header.trim().slice(0, 60);
    if (!found.some((x) => x.file === f.name && x.into === into)) found.push({ file: f.name, into, label: labelOf(f.name, into) });
  }
}
const real = labels.filter((l) => l.label === 'extract');
const hits = real.filter((l) => found.some((x) => x.file === l.file && x.into === l.into));
const count = (label: string) => found.filter((x) => x.label === label).length;
console.log(`labelled real extracts: ${real.length}; found ${hits.length} (recall ${(hits.length / real.length * 100).toFixed(0)}%)`);
console.log(`reported ${found.length}: ${count('extract')} real, ${count('borderline')} borderline, ${count('not-extract')} wrong, ${count('unlabelled')} unlabelled`);
for (const m of real.filter((l) => !hits.includes(l))) console.log('  missed:', m.into, m.file.split('/').pop());
for (const x of found.filter((x) => x.label !== 'extract')) console.log(`  ${x.label}:`, x.into, x.file.split('/').pop());
