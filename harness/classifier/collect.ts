// collect.ts out.jsonl <name>... : the engine's evidence numbers for every candidate in labelled practice
// files, joined with the labels (SEMANTIC_FEATURES=1). Needs `node harness/setup.ts <name>...` first.
// Practice projects only: held-out labels must never train anything.
import fs from 'node:fs';
import path from 'node:path';
import { languageForPath, semanticDiffFile } from '../../src/index.ts';

const here = path.dirname(new URL(import.meta.url).pathname);
const work = process.env.WORK ?? path.join(here, '..', 'work');
const projects = JSON.parse(fs.readFileSync(path.join(here, '..', 'projects.json'), 'utf8')) as Array<{ name: string; set: string }>;
const labels = JSON.parse(fs.readFileSync(path.join(here, '..', '..', 'test/fixtures/labels/history-extracts.json'), 'utf8')).labels;
process.env.SEMANTIC_FEATURES = '1';
const [out, ...names] = process.argv.slice(2);
if (!out) throw new Error('usage: node harness/classifier/collect.ts out.jsonl [names...]');
const chosen = projects.filter((p) => p.set === 'practice' && (!names.length || names.includes(p.name)));
const orig = console.error;
for (const { name: repo } of chosen) {
  const data = path.join(work, 'data', `hist-${repo}.json`);
  if (!fs.existsSync(data)) continue;
  const byFile = new Map<string, any[]>();
  for (const l of labels.filter((l: any) => l.repo === repo)) byFile.set(`${l.commit.slice(0, 7)}|${l.file}`, [...(byFile.get(`${l.commit.slice(0, 7)}|${l.file}`) ?? []), l]);
  for (const f of JSON.parse(fs.readFileSync(data, 'utf8'))) {
    const labs = byFile.get(`${f.commit.slice(0, 7)}|${f.name}`);
    if (!labs) continue;
    const lines: string[] = [];
    console.error = (...a: any[]) => { const s = a.join(' '); if (s.startsWith('[feat] ')) lines.push(s.slice(7)); };
    try { await semanticDiffFile(languageForPath(f.name)!, f.oldContents, f.newContents, f.name); } catch {}
    console.error = orig;
    for (const l of lines) {
      const x = JSON.parse(l);
      const lab = labs.find((y: any) => y.helper === x.helper && y.kind === x.kind);
      fs.appendFileSync(out, JSON.stringify({ repo, commit: f.commit, file: f.name, label: lab?.label ?? null, ...x }) + '\n');
    }
  }
}
