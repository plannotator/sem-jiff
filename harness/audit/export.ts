// export.ts out.json [perKind=150] [seed=1]: a random sample of the engine's moved / renamed /
// reformatted / reordered claims on real commits from the practice projects, for blind auditing.
// Commits are drawn at random (fixed seed) across projects; every such claim in a drawn file is
// kept until each kind reaches `perKind`, so the sample is a random sample of claims per kind.
import fs from 'node:fs';
import path from 'node:path';
import { languageForPath, semanticDiffFile } from '../../src/index.ts';

const here = path.dirname(new URL(import.meta.url).pathname);
const work = process.env.WORK ?? path.join(here, '..', 'work');
const [out, perKindArg = '150', seedArg = '1'] = process.argv.slice(2);
if (!out) throw new Error('usage: node harness/audit/export.ts out.json [perKind] [seed]');
const perKind = Number(perKindArg);
let seed = Number(seedArg);
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

// KINDS=movedWithEdit,renamed: only these kinds (the draw stops once they are full).
const KINDS = (process.env.KINDS ? process.env.KINDS.split(',') : ['moved', 'movedWithEdit', 'renamed', 'reformatted', 'reordered']) as readonly string[];
const projects = (JSON.parse(fs.readFileSync(path.join(here, '..', 'projects.json'), 'utf8')) as Array<{ name: string; set: string }>).filter((p) => p.set === 'practice');
// Every (project, commit) pair, shuffled.
const commits: Array<{ project: string; commit: string }> = [];
const files = new Map<string, any[]>();
for (const p of projects) {
  const f = path.join(work, 'data', `hist-${p.name}.json`);
  if (!fs.existsSync(f)) continue;
  for (const x of JSON.parse(fs.readFileSync(f, 'utf8'))) {
    const k = `${p.name}|${x.commit}`;
    if (!files.has(k)) { files.set(k, []); commits.push({ project: p.name, commit: x.commit }); }
    files.get(k)!.push(x);
  }
}
for (let i = commits.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [commits[i], commits[j]] = [commits[j]!, commits[i]!]; }

const counts = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<string, number>;
const items: any[] = [];
let commitsUsed = 0;
const lines = (text: string, ranges: Array<{ start: number; end: number }>) => {
  const L = text.split('\n');
  return ranges.map((r) => ({ start: r.start, end: r.end, text: L.slice(r.start - 1, Math.min(r.end, r.start + 39)).join('\n') + (r.end - r.start >= 40 ? '\n…' : '') }));
};
for (const { project, commit } of commits) {
  if (KINDS.every((k) => counts[k]! >= perKind)) break;
  commitsUsed++;
  for (const f of files.get(`${project}|${commit}`)!) {
    const lang = languageForPath(f.name);
    if (!lang) continue;
    let r;
    try { r = await semanticDiffFile(lang, f.oldContents, f.newContents, f.name); } catch { continue; }
    for (const o of r.semanticOperations) {
      if (!(KINDS as readonly string[]).includes(o.type) || counts[o.type]! >= perKind) continue;
      counts[o.type]!++;
      items.push({ id: items.length + 1, project, commit, file: f.name, kind: o.type, old: lines(f.oldContents, o.lines.old), new: lines(f.newContents, o.lines.new) });
    }
  }
}
fs.writeFileSync(out, JSON.stringify(items, null, 1));
console.log(`commits drawn ${commitsUsed}; claims`, counts);
