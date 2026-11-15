// clef-collect.ts out.jsonl --set <set> | <name>... : every extract/inline candidate the engine
// rejects, with its code, for asking Clef (harness/compare/clef.py --all). Reads no labels, so it
// is safe on held-out sets: the answers are then scored by harness/score.ts with CLEF_ANSWERS set.
import fs from 'node:fs';
import path from 'node:path';
import { languageForPath, semanticDiffFile } from '../../src/index.ts';

const here = path.dirname(new URL(import.meta.url).pathname);
const work = process.env.WORK ?? path.join(here, '..', 'work');
const projects = JSON.parse(fs.readFileSync(path.join(here, '..', 'projects.json'), 'utf8')) as Array<{ name: string; set: string }>;
const [out, ...rest] = process.argv.slice(2);
if (!out || !rest.length) throw new Error('usage: node harness/compare/clef-collect.ts out.jsonl --set <set> | <name>...');
const chosen = rest[0] === '--set' ? projects.filter((p) => p.set === rest[1]) : projects.filter((p) => rest.includes(p.name));
process.env.SEMANTIC_FEATURES = '1';
const orig = console.error;
for (const { name: repo } of chosen) {
  const data = path.join(work, 'data', `hist-${repo}.json`);
  if (!fs.existsSync(data)) { orig(`skip ${repo}: no dataset`); continue; }
  let n = 0;
  for (const f of JSON.parse(fs.readFileSync(data, 'utf8'))) {
    const lang = languageForPath(f.name);
    if (!lang || f.oldContents === f.newContents) continue;
    const lines: string[] = [];
    console.error = (...a: unknown[]) => { const s = a.join(' '); if (s.startsWith('[feat] ')) lines.push(s.slice(7)); };
    try { await semanticDiffFile(lang, f.oldContents, f.newContents, f.name); } catch {}
    console.error = orig;
    for (const l of lines) {
      const x = JSON.parse(l);
      if (x.accepted) continue;
      fs.appendFileSync(out, JSON.stringify({ repo, commit: f.commit, file: f.name, label: null, ...x }) + '\n');
      n++;
    }
  }
  orig(`${repo}: ${n} rejected candidates`);
}
