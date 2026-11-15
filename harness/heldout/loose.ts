// Loose, engine-independent search for extract/inline candidates, to measure misses.
// A candidate: a function that is new (extract) or gone (inline), called from (or
// previously called from) a function present in both versions, whose body shares
// >= 30% of its tokens with lines removed from (added to) that caller.
// Also looks across files within one commit. Prints candidates and whether the engine reported them.
// Usage: node harness/heldout/loose.ts data.json out.json
import fs from 'node:fs';
import type { Node } from 'web-tree-sitter';
import { getParser, languageForPath, LANGUAGES } from '../../src/parse.ts';
import { semanticDiffFile } from '../../src/index.ts';

const FN = ['arrow_function', 'function_expression', 'function', 'generator_function'];
type Fn = { name: string; text: string; bodyLines: string[] };
const files = JSON.parse(fs.readFileSync(process.argv[2]!, 'utf8'));
const tok = (s: string) => s.match(/\w+|[^\s\w]/g) ?? [];
const trimLines = (t: string) => t.split('\n').map((l) => l.trim()).filter((l) => l && !/^[{}()[\];,]*$/.test(l));

function fns(root: Node): Fn[] {
  const out: Fn[] = [];
  const walk = (n: Node) => {
    let name: string | null = null;
    let body: Node | null = null;
    if (['function_declaration', 'generator_function_declaration', 'method_definition', 'method_declaration', 'function_item', 'function_definition', 'constructor_declaration', 'local_function_statement', 'method', 'singleton_method'].includes(n.type)) {
      name = n.childForFieldName('name')?.text ?? null;
      // Kotlin's function body has no field: `function_body` holds the block or the `= expr`.
      body = n.childForFieldName('body') ?? n.namedChildren.find((c) => c?.type === 'function_body') ?? null;
    } else if (n.type === 'variable_declarator' || n.type === 'public_field_definition' || n.type === 'pair') {
      const v = n.childForFieldName('value');
      // Effect style: the function sits inside a call (`Effect.gen(function* () {...})`,
      // `Effect.fn("name")(function* (x) {...})`, `Effect.suspend(() => ...)`).
      const fnIn = (x: Node | null, depth = 0): Node | null => {
        if (!x || depth > 4) return null;
        if (FN.includes(x.type)) return x;
        if (x.type === 'call_expression') {
          for (const a of x.childForFieldName('arguments')?.namedChildren ?? []) if (a && FN.includes(a.type)) return a;
          return fnIn(x.childForFieldName('function'), depth + 1);
        }
        if (x.type === 'member_expression') return fnIn(x.childForFieldName('object'), depth + 1);
        return null;
      };
      const f = fnIn(v);
      if (f) {
        name = (n.childForFieldName('name') ?? n.childForFieldName('key'))?.text ?? null;
        body = f.childForFieldName('body');
      }
    }
    if (name && body) out.push({ name, text: n.text, bodyLines: trimLines(body.text) });
    for (const c of n.namedChildren) if (c) walk(c);
  };
  walk(root);
  return out;
}

/** Lines in a but not in b (multiset). */
function minus(a: string[], b: string[]): string[] {
  const m = new Map<string, number>();
  for (const l of b) m.set(l, (m.get(l) ?? 0) + 1);
  return a.filter((l) => { const n = m.get(l) ?? 0; if (n > 0) { m.set(l, n - 1); return false; } return true; });
}

function shared(helper: string[], lines: string[]): number {
  const bag = new Map<string, number>();
  for (const t of lines.flatMap(tok)) bag.set(t, (bag.get(t) ?? 0) + 1);
  let n = 0;
  for (const t of helper.flatMap(tok)) { const c = bag.get(t) ?? 0; if (c > 0) { n++; bag.set(t, c - 1); } }
  return n;
}
const calls = (text: string, name: string, ruby = false) => {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Ruby calls need no parentheses (`lines = header`, `header.join`): any use of the name that is not its
  // own `def` and not an assignment to a local of that name.
  if (ruby) return text.split('\n').some((l) => !new RegExp(`\\bdef\\s+(self\\.)?${n}(?![\\w?!])`).test(l) && new RegExp(`(^|[^\\w@:$])${n}(?![\\w?!:])(?!\\s*=[^=~>])`).test(l.replace(/#(?!\{).*$/, '')));
  // A call, `yield* name`, or the name passed as a value (`Effect.flatMap(name)`, `.pipe(a, name)`).
  return new RegExp(`\\b${n}\\s*(<[^>]*>)?\\s*\\(|yield\\*\\s*${n}\\b|[(,]\\s*${n}\\s*[,)]`).test(text);
};

// LOOSE_GRAMMAR=<ext>=<wasm>: parse files of a language the engine does not read yet (its corpus is
// built before its engine code). Those files are searched with the grammar alone; the engine reports nothing.
const extra = process.env.LOOSE_GRAMMAR?.split('=') ?? [];
let extraParser: any = null;
if (extra.length === 2) {
  const { Language, Parser } = await import('web-tree-sitter');
  await Parser.init();
  extraParser = new Parser();
  extraParser.setLanguage(await Language.load(extra[1]!));
}
const byCommit = new Map<string, any[]>();
for (const f of files) byCommit.set(f.commit, [...(byCommit.get(f.commit) ?? []), f]);
const out: any[] = [];
let checked = 0;
for (const [commit, group] of byCommit) {
  // Per file: functions before/after and engine findings.
  const info = [];
  for (const f of group) {
    const lang = languageForPath(f.name);
    const unread = !lang && !!extraParser && f.name.endsWith(`.${extra[0]}`);
    if (!lang && !unread) continue;
    const p = lang ? await getParser(lang) : extraParser;
    const a = p.parse(f.oldContents)!, b = p.parse(f.newContents)!;
    let old: Fn[], neu: Fn[];
    try { old = fns(a.rootNode); neu = fns(b.rootNode); } catch { a.delete(); b.delete(); continue; } // too deeply nested
    a.delete(); b.delete();
    // NO_ENGINE=1: the search alone, for a held-out set labelled before the engine ever runs on it.
    const r = lang && !process.env.NO_ENGINE ? await semanticDiffFile(lang, f.oldContents, f.newContents, f.name) : { semanticOperations: [] as any[] };
    const O = f.oldContents.split('\n'), N = f.newContents.split('\n');
    const reported = new Set<string>();
    for (const o of r.semanticOperations) {
      if (o.type !== 'extractedFunction' && o.type !== 'inlinedFunction') continue;
      const c: any = o.spans.find((s: any) => s.role === 'container');
      const hdr = o.type === 'extractedFunction' ? N[c.new[0].start.line - 1]! : O[c.old[0].start.line - 1]!;
      reported.add(`${o.type === 'extractedFunction' ? 'extract' : 'inline'}:${(hdr.replace(/^\s*func\s*(\([^)]*\))?\s*/, '').match(/([\w$]+)\s*(<[^>]*>|\[[^\]]*\])?\s*\(/) ?? [])[1]}`);
    }
    info.push({ f, old, neu, reported });
    checked++;
  }
  for (const kind of ['extract', 'inline'] as const) {
    for (const h of info) {
      const [had, has] = kind === 'extract' ? [h.old, h.neu] : [h.neu, h.old];
      const hadNames = new Set(had.map((x) => x.name));
      for (const helper of has) {
        if (hadNames.has(helper.name) || helper.bodyLines.length === 0) continue;
        for (const c of info) {
          const [before, after] = kind === 'extract' ? [c.old, c.neu] : [c.neu, c.old];
          for (const ca of after) {
            const ruby = c.f.name.endsWith('.rb');
            if (ca.name === helper.name || !calls(ca.text, helper.name, ruby)) continue;
            const cb = before.find((x) => x.name === ca.name);
            if (!cb || calls(cb.text, helper.name, ruby)) continue;
            const gone = minus(cb.bodyLines, ca.bodyLines);
            const s = shared(helper.bodyLines, gone);
            const ht = helper.bodyLines.flatMap(tok).length;
            if (s < 6 || s / ht < 0.3) continue;
            out.push({
              kind, commit, helper: helper.name, caller: ca.name, file: h.f.name, callerFile: c.f.name, crossFile: c !== h,
              coverage: +(s / ht).toFixed(2), reported: c === h && h.reported.has(`${kind}:${helper.name}`),
              helperBody: helper.bodyLines.slice(0, 6), callerLost: gone.slice(0, 6),
            });
          }
        }
      }
    }
  }
}
fs.writeFileSync(process.argv[3]!, JSON.stringify(out, null, 1));
const sum = (pred: (x: any) => boolean) => out.filter(pred).length;
console.log(`files ${checked}; candidates ${out.length}: same-file ${sum((x) => !x.crossFile)} (reported ${sum((x) => !x.crossFile && x.reported)}), cross-file ${sum((x) => x.crossFile)}`);
