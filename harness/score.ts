// Scores the engine on the rebuilt datasets, per test set. Held-out sets print totals
// only: no case names, so nobody tunes the engine to them.
//
// Usage: node harness/score.ts [--dir <work-dir>] [--set <set>] [--engine <engine-dir>] [--label <name>]
// Every run also appends one record to harness/work/ledger.jsonl (or $LEDGER): the label, the time,
// the switches in effect (CLEF_*, SEMANTIC_*), and per-project counts (counts only, also for held
// sets). harness/analysis/judge.py compares two records; charts.py draws them.
// Run `node harness/setup.ts` first. --engine scores another copy of the engine
// (a directory with src/ and bench/recall.ts), against these same labels.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
type Project = { name: string; set: string; labels: string };

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '..');
const args = process.argv.slice(2);
const opt = (flag: string) => {
  const i = args.indexOf(flag);
  return i < 0 ? undefined : args[i + 1];
};
const work = path.resolve(opt('--dir') ?? path.join(here, 'work'));
const engine = path.resolve(opt('--engine') ?? root);
const onlySet = opt('--set');

const projects: Project[] = JSON.parse(fs.readFileSync(path.join(here, 'projects.json'), 'utf8'));
const sets = [...new Set(projects.map((p) => p.set))].filter((s) => !onlySet || s === onlySet);

// SCORE_WORKERS caps the parallel projects (the shared machine asks for 4).
const limit = Math.max(1, Math.min(Number(process.env.SCORE_WORKERS ?? 8), os.cpus().length - 1));
async function pool<T, R>(items: T[], f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await f(items[i]!);
    }
  }));
  return out;
}

for (const set of sets) {
  const members = projects.filter((p) => p.set === set && fs.existsSync(path.join(work, 'data', `hist-${p.name}.json`)));
  if (!members.length) continue;
  const held = set.startsWith('held');
  const logs = await pool(members, async (p) => {
    const { stdout } = await run('node', ['--max-old-space-size=8192', '--stack-size=8000', 'bench/recall.ts', path.join(root, 'test/fixtures/labels', p.labels), `${p.name}=${path.join(work, 'data', `hist-${p.name}.json`)}`], {
      cwd: engine,
      maxBuffer: 1 << 28,
      env: { ...process.env, MISSED: held ? '' : '1' },
    });
    return { p, stdout };
  });
  const sum = (re: RegExp) => logs.reduce((n, l) => n + Number(l.stdout.match(re)?.[1] ?? 0), 0);
  const real = sum(/real (\d+):/);
  const found = sum(/found (\d+) \(/);
  const wrong = sum(/(\d+) wrong/);
  const borderline = sum(/(\d+) borderline,/);
  const unlabelled = sum(/(\d+) unlabelled/);
  const one = (s: string, re: RegExp) => Number(s.match(re)?.[1] ?? 0);
  const perProject = Object.fromEntries(logs.map(({ p, stdout }) => [p.name, { real: one(stdout, /real (\d+):/), found: one(stdout, /found (\d+) \(/), wrong: one(stdout, /(\d+) wrong/), borderline: one(stdout, /(\d+) borderline,/), unlabelled: one(stdout, /(\d+) unlabelled/) }]));
  const switches = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(CLEF_|SEMANTIC_|QUICK$)/.test(k)));
  fs.appendFileSync(process.env.LEDGER ?? path.join(work, 'ledger.jsonl'), JSON.stringify({ label: opt('--label') ?? null, time: new Date().toISOString(), set, switches, totals: { real, found, wrong, borderline, unlabelled }, perProject }) + '\n');
  console.log(`${set}: ${members.length} projects, real ${real}, found ${found} (${((100 * found) / Math.max(real, 1)).toFixed(0)}%), wrong ${wrong}, borderline reported ${borderline}, unlabelled ${unlabelled}`);
  if (!held) for (const { p, stdout } of logs) for (const line of stdout.split('\n')) if (/^\s+(missed|wrong):/.test(line)) console.log(`  ${p.name}:${line}`);
}
