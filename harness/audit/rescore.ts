// rescore.ts [labels.json]: re-run the engine on every audited claim's file and report, per kind and
// label, how many audited claims the current engine still makes (same kind, same lines).
import fs from 'node:fs';
import path from 'node:path';
import { languageForPath, semanticDiffFile } from '../../src/index.ts';

const here = path.dirname(new URL(import.meta.url).pathname);
const work = process.env.WORK ?? path.join(here, '..', 'work');
const labelsPath = process.argv[2] ?? path.join(here, '..', '..', 'test/fixtures/labels/audit-moves.json');
const labels = JSON.parse(fs.readFileSync(labelsPath, 'utf8')).labels;
const byFile = new Map<string, any[]>();
for (const l of labels) byFile.set(`${l.project}|${l.commit}|${l.file}`, [...(byFile.get(`${l.project}|${l.commit}|${l.file}`) ?? []), l]);
const data = new Map<string, any[]>();
const tally = new Map<string, { kept: number; gone: number }>();
for (const [k, ls] of byFile) {
  const [project, commit, file] = k.split('|') as [string, string, string];
  if (!data.has(project)) data.set(project, JSON.parse(fs.readFileSync(path.join(work, 'data', `hist-${project}.json`), 'utf8')));
  const f = data.get(project)!.find((x) => x.commit === commit && x.name === file);
  const r = await semanticDiffFile(languageForPath(f.name)!, f.oldContents, f.newContents, f.name);
  const sig = (kind: string, o: number[][], n: number[][]) => `${kind}|${JSON.stringify(o)}|${JSON.stringify(n)}`;
  const now = new Set(r.semanticOperations.map((o) => sig(o.type, o.lines.old.map((x) => [x.start, x.end]), o.lines.new.map((x) => [x.start, x.end]))));
  for (const l of ls) {
    const t = tally.get(`${l.kind} ${l.label}`) ?? { kept: 0, gone: 0 };
    tally.set(`${l.kind} ${l.label}`, t);
    if (now.has(sig(l.kind, l.old, l.new))) t.kept++;
    else { t.gone++; if (process.env.SHOW) console.log('gone:', l.id, l.kind, l.label, l.project, l.file); }
  }
}
for (const [k, t] of [...tally].sort()) console.log(`${k.padEnd(24)} still claimed ${t.kept}, no longer claimed ${t.gone}`);
