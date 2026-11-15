// tsc rewrites `./x.ts` imports to `./x.js` in the emitted JavaScript but not in the declarations; a
// consumer without allowImportingTsExtensions would reject them. Rewrite them in dist/*.d.ts.
import fs from 'node:fs';
import path from 'node:path';

const dist = path.join(import.meta.dirname, '..', 'dist');
for (const f of fs.readdirSync(dist).filter((x) => x.endsWith('.d.ts'))) {
  const p = path.join(dist, f);
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/(from\s+|import\(\s*)(['"])(\.{1,2}\/[^'"]+)\.ts\2/g, '$1$2$3.js$2'));
}
