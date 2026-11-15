// One practice file through the engine: node harness/one.ts <engine-dir> <repo> <commit> <file>
// SEMANTIC_NO_<RULE>=1 switches a rule off, as in bench/recall.ts.
import fs from 'node:fs';
const [eng, repo, commit, file, helper] = process.argv.slice(2);
process.env.SEMANTIC_DEBUG = '1';
const { languageForPath, semanticDiffFile } = await import(`${eng}/src/index.ts`);
(await import(`${eng}/src/runtime.ts`)).switchRulesOff(Object.keys(process.env).filter((k) => k.startsWith('SEMANTIC_NO_') && process.env[k]).map((k) => k.slice(12)));
const f = JSON.parse(fs.readFileSync(new URL(`./work/data/hist-${repo}.json`, import.meta.url), 'utf8')).find((x: any) => x.commit.startsWith(commit) && x.name === file);
const r = await semanticDiffFile(languageForPath(file), f.oldContents, f.newContents, file);
console.log(r.semanticOperations.map((o: any) => o.type).join(','));
