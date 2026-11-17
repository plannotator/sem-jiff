// Ground truth without hand labels: apply a known change to real files and check
// the engine names it, and claims nothing else.
//
//   move      a top-level function moves to the end of the file      -> moved
//   rename    a local used only in one function gets a new name      -> renamed
//   extract   2-4 statements of a function move into a new helper    -> extractedFunction
//   inline    the same change backwards                              -> inlinedFunction
//   imports   the file's single-line imports are reversed            -> moved only
//   reindent  a function's inner lines gain one indentation level    -> reformatted
//
// Usage: node bench/synthetic.ts data.json [max-files] [seed]
// EXPORT=cases.jsonl also writes every change (old, new, kind, our answer) for bench/compare.
// Prints, per change: tried, found, and "false claims" (an extract, inline, rename
// or move the change did not make). Set SHOW=kind to print failing examples.
import fs from 'node:fs';
import type { Node } from 'web-tree-sitter';
import { languageForPath, semanticDiffFile } from '../src/index.ts';
import { getParser, LANGUAGES, type LanguageConfig, type LanguageId } from '../src/parse.ts';
import { functionsIn, isMethod, type FunctionInfo } from '../src/syntax.ts';
import { switchTrialsOn } from '../src/runtime.ts';

// SEMANTIC_TRY_<RULE>=1 switches a trial rule on (off by default), as in bench/recall.ts.
switchTrialsOn(Object.keys(process.env).filter((k) => k.startsWith('SEMANTIC_TRY_') && process.env[k]).map((k) => k.slice('SEMANTIC_TRY_'.length)));

const [, , dataPath, maxFiles = '400', seedArg = '1'] = process.argv;
if (!dataPath) throw new Error('usage: node bench/synthetic.ts data.json [max-files] [seed]');

let seed = Number(seedArg);
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T>(xs: T[]): T | undefined => xs[Math.floor(rand() * xs.length)];

type Kind = 'move' | 'rename' | 'extract' | 'inline' | 'imports' | 'reindent';
type Change = { kind: Kind; old: string; new: string; expect: string; allowed: Set<string> };
const SEMANTIC = new Set(['moved', 'movedWithEdit', 'renamed', 'reformatted', 'extractedFunction', 'inlinedFunction']);

const lineStart = (text: string, n: Node) => text.lastIndexOf('\n', n.startIndex - 1) + 1;
const lineEnd = (text: string, n: Node) => {
  const i = text.indexOf('\n', n.endIndex);
  return i < 0 ? text.length : i + 1;
};
const indentOf = (text: string, at: number) => (text.slice(at).match(/^[ \t]*/) ?? [''])[0];

/**
 * Ruby: a method moves to the end of its own visibility section in the innermost class or module
 * (a move past a `private` line changes meaning, and the engine rightly calls it an edit).
 */
function moveRuby(text: string, root: Node, cfg: LanguageConfig): Change | null {
  let holder = root;
  for (let d = cfg.declarationsIn(holder).find((x) => x.members); d?.members; d = cfg.declarationsIn(holder).find((x) => x.members)) holder = d.members;
  const all = cfg.declarationsIn(holder);
  const visibility = (n: Node) => n.type === 'identifier' && /^(private|protected|public|module_function)$/.test(n.text);
  const sectionEnd = (n: Node) => {
    let last = n;
    for (let x = n.nextNamedSibling; x && !visibility(x); x = x.nextNamedSibling) last = x;
    return last;
  };
  const methods = all.filter((d) => cfg.functionTypes.has(d.node.type) && !d.tail && sectionEnd(d.node).id !== d.node.id);
  if (all.filter((d) => cfg.functionTypes.has(d.node.type)).length < 3 || !methods.length) return null;
  const d = pick(methods)!;
  // Each `#` line is its own comment node: the whole block of them directly above moves along.
  let doc: Node | null = null;
  for (let c = d.node.previousSibling, row = d.node.startPosition.row; c && cfg.attachedTypes.has(c.type) && c.endPosition.row === row - 1; c = c.previousSibling) {
    doc = c;
    row = c.startPosition.row;
  }
  const s = lineStart(text, doc ?? d.node);
  const e = lineEnd(text, d.node);
  if (text.slice(s, (doc ?? d.node).startIndex).trim() || text.slice(d.node.endIndex, e).trim()) return null;
  const last = sectionEnd(d.node);
  const after = lineEnd(text, last);
  if (text.slice(last.endIndex, after).trim() || /<<[~-]?["'`]?\w/.test(text.slice(d.node.endIndex, after))) return null;
  const out = text.slice(0, s) + text.slice(e, after) + '\n' + text.slice(s, e).replace(/\n$/, '') + '\n' + text.slice(after);
  return { kind: 'move', old: text, new: out, expect: 'moved', allowed: new Set(['moved', 'movedWithEdit']) };
}

function move(text: string, root: Node, cfg: LanguageConfig): Change | null {
  if (cfg.id === 'ruby') return moveRuby(text, root, cfg);
  // A PHP file usually holds one class: its methods are the declarations to move. So does a Kotlin
  // file, unless it holds top-level functions of its own.
  const topLevel = cfg.declarationsIn(root).filter((d) => cfg.functionTypes.has(d.node.type)).length;
  const inClass = cfg.id === 'php' || cfg.id === 'swift' || (cfg.id === 'kotlin' && topLevel < 3);
  const holder = inClass ? (cfg.declarationsIn(root).find((d) => d.members)?.members ?? root) : root;
  const decls = cfg.declarationsIn(holder).filter((d) => cfg.functionTypes.has(d.node.type) || d.node.type === 'decorated_definition' || d.node.type === 'export_statement');
  if (decls.length < 3) return null;
  const d = pick(decls.slice(0, -1))!;
  // Only declarations alone on their lines, with nothing attached above them.
  const prev = d.node.previousSibling;
  // PHP methods nearly always carry a doc comment, Kotlin's often a KDoc: it moves with them.
  let doc = (cfg.id === 'php' || cfg.id === 'kotlin' || cfg.id === 'swift') && prev && cfg.attachedTypes.has(prev.type) && prev.endPosition.row === d.node.startPosition.row - 1 ? prev : null;
  // Swift's `///` doc lines are one comment node each: every line of the block moves along.
  while (cfg.id === 'swift' && doc?.previousSibling && cfg.attachedTypes.has(doc.previousSibling.type) && doc.previousSibling.endPosition.row === doc.startPosition.row - 1) doc = doc.previousSibling;
  const s = lineStart(text, doc ?? d.node);
  const e = lineEnd(text, d.node);
  if (text.slice(s, (doc ?? d.node).startIndex).trim() || text.slice(d.node.endIndex, e).trim()) return null;
  if (!doc && prev && cfg.attachedTypes.has(prev.type)) return null;
  const chunk = text.slice(s, e);
  const rest = text.slice(0, s) + text.slice(e);
  // Inside a class the method goes to the end of the class body, before its closing brace.
  const brace = holder.endIndex - 1 - (e - s);
  const at = rest.lastIndexOf('\n', brace - 1) + 1;
  const out = holder === root ? rest.replace(/\n*$/, '\n\n') + chunk : rest.slice(0, at) + '\n' + chunk + rest.slice(at);
  return { kind: 'move', old: text, new: out, expect: 'moved', allowed: new Set(['moved', 'movedWithEdit']) };
}

/** Identifiers declared inside `fn` whose every use in the file is inside `fn`. */
function localNames(fn: FunctionInfo, root: Node, cfg: LanguageConfig): string[] {
  const all = new Map<string, Node[]>();
  const walk = (n: Node) => {
    if (n.childCount === 0) {
      if (cfg.identifierTypes.has(n.type)) all.set(n.text, [...(all.get(n.text) ?? []), n]);
      return;
    }
    for (const c of n.children) if (c) walk(c);
  };
  walk(root);
  const inside = (n: Node) => fn.node.startIndex <= n.startIndex && n.endIndex <= fn.node.endIndex;
  return [...all]
    .filter(([name, ns]) => ns.length >= 2 && ns.every(inside) && name.length > 1 && /^[a-z_]\w*$/.test(name))
    // `$this` and PHP's superglobals (`$_ENV`) are not names a function declares.
    .filter(([name]) => cfg.id !== 'php' || (name !== 'this' && !/^_[A-Z]+$/.test(name)))
    // A Swift name that is also an argument label or a member (`f(count: n)`, `x.count`) is not only this local.
    .filter(([, ns]) => cfg.id !== 'swift' || ns.every((n) => !/^(navigation_suffix|value_argument_label)$/.test(n.parent?.type ?? '') && n.parent?.childForFieldName('external_name')?.id !== n.id))
    .filter(([, ns]) => ns.some((n) => /declarator|parameter|short_var|let_declaration|assignment|variable/.test(n.parent?.type ?? '') || /parameter|pattern/.test(n.parent?.parent?.type ?? '') || (cfg.id === 'swift' && n.parent?.type === 'pattern')))
    .map(([name]) => name);
}

function rename(text: string, root: Node, cfg: LanguageConfig, fns: FunctionInfo[]): Change | null {
  const fn = pick(fns.filter((f) => f.statements.length >= 2));
  if (!fn) return null;
  const name = pick(localNames(fn, root, cfg));
  if (!name) return null;
  const to = `${name}Renamed`;
  if (text.includes(to)) return null;
  const nodes: Node[] = [];
  const walk = (n: Node) => {
    if (n.childCount === 0 && cfg.identifierTypes.has(n.type) && n.text === name) nodes.push(n);
    for (const c of n.children) if (c) walk(c);
  };
  walk(fn.node);
  // A shorthand `{ name }` would also rename an object key.
  if (nodes.some((n) => /shorthand/.test(n.type))) return null;
  let out = text;
  for (const n of [...nodes].sort((a, b) => b.startIndex - a.startIndex)) out = out.slice(0, n.startIndex) + to + out.slice(n.endIndex);
  return { kind: 'rename', old: text, new: out, expect: 'renamed', allowed: new Set(['renamed']) };
}

const EXIT = /\b(return|break|continue|yield|await|goto|defer|throw|raise|panic)\b|\?;|\?\s*$|=>|\bfunc\b|\bfn\b|\bdef\b|\blambda\b|\bfunction\b/;

function extract(text: string, root: Node, cfg: LanguageConfig, fns: FunctionInfo[], id: LanguageId): Change | null {
  const fn = pick(fns.filter((f) => f.statements.length >= 5));
  if (!fn) return null;
  const k = 2 + Math.floor(rand() * 3);
  const startAt = 1 + Math.floor(rand() * Math.max(1, fn.statements.length - k - 1));
  const run = fn.statements.slice(startAt, startAt + k);
  if (run.length < 2) return null;
  const s = lineStart(text, run[0]!);
  const e = lineEnd(text, run.at(-1)!);
  const body = text.slice(s, e);
  // Whole lines only, nothing that leaves the function, no names declared here and used later.
  if (text.slice(s, run[0]!.startIndex).trim() || text.slice(run.at(-1)!.endIndex, e).trim()) return null;
  if (EXIT.test(body) || body.split('\n').length > 40 || body.trim().split(/\s+/).length < 12) return null;
  const later = text.slice(e, fn.node.endIndex);
  const declared = [...body.matchAll(/\b(?:const|let|var|mut)\s+(\w+)|(\w+)\s*:=|^\s*(\w+)\s*=[^=]/gm)].map((m) => m[1] ?? m[2] ?? m[3]);
  // PHP variables are declared by assignment: `$total = 0`.
  if (id === 'php') declared.push(...[...body.matchAll(/\$(\w+)\s*=[^=>]/g)].map((m) => m[1]));
  // Kotlin declares with `val` as well as `var`.
  if (id === 'kotlin') declared.push(...[...body.matchAll(/\bval\s+(\w+)/g)].map((m) => m[1]));
  // A Ruby heredoc's text follows its statement: a run could cut it off.
  if (id === 'ruby' && /<<[~-]?["'`]?\w/.test(body)) return null;
  if (declared.some((d) => d && new RegExp(`\\b${d}\\b`).test(later))) return null;
  const name = `extractedHelper${Math.floor(rand() * 1e6)}`;
  const ind = indentOf(text, s);
  const fnStart = lineStart(text, fn.node);
  const fnInd = indentOf(text, fnStart);
  const method = isMethod(fn.node);
  const isStatic = /\bstatic\b/.test(fn.node.text.slice(0, fn.node.text.indexOf('(')));
  const call: Record<LanguageId, string> = {
    typescript: method ? `this.${name}();` : `${name}();`,
    tsx: method ? `this.${name}();` : `${name}();`,
    go: `${name}()`,
    rust: method ? `Self::${name}();` : `${name}();`,
    python: method ? `self.${name}()` : `${name}()`,
    java: `${name}();`,
    csharp: `${name}();`,
    php: method ? (isStatic ? `self::${name}();` : `$this->${name}();`) : `${name}();`,
    kotlin: `${name}()`,
    swift: `${name}()`,
    ruby: name,
  };
  // The helper's body keeps the statements' lines, re-indented one level inside the helper.
  const step = id === 'go' ? '\t' : fnInd.includes('\t') ? '\t' : '    ';
  const inner = body
    .split('\n')
    .map((l) => (l.startsWith(ind) ? fnInd + step + l.slice(ind.length) : l))
    .join('\n');
  const head: Record<LanguageId, string> = {
    typescript: method ? `${fnInd}${name}() {\n` : `${fnInd}function ${name}() {\n`,
    tsx: method ? `${fnInd}${name}() {\n` : `${fnInd}function ${name}() {\n`,
    go: `${fnInd}func ${name}() {\n`,
    rust: `${fnInd}fn ${name}() {\n`,
    python: method ? `${fnInd}def ${name}(self):\n` : `${fnInd}def ${name}():\n`,
    java: `${fnInd}private void ${name}() {\n`,
    csharp: `${fnInd}private void ${name}()\n${fnInd}{\n`,
    php: method ? `${fnInd}private ${isStatic ? 'static ' : ''}function ${name}()\n${fnInd}{\n` : `${fnInd}function ${name}()\n${fnInd}{\n`,
    kotlin: `${fnInd}private fun ${name}() {\n`,
    swift: method ? `${fnInd}private ${isStatic ? 'static ' : ''}func ${name}() {\n` : `${fnInd}func ${name}() {\n`,
    ruby: `${fnInd}def ${name}\n`,
  };
  const tail = id === 'python' ? '' : id === 'ruby' ? `${fnInd}end\n` : `${fnInd}}\n`;
  // Go methods and Python functions take the helper after the function, at the function's indentation.
  const fnEnd = lineEnd(text, fn.node);
  const helper = `\n${head[id]}${inner}${tail}`;
  const out = text.slice(0, s) + ind + call[id] + '\n' + text.slice(e, fnEnd) + helper + text.slice(fnEnd);
  return { kind: 'extract', old: text, new: out, expect: 'extractedFunction', allowed: new Set(['extractedFunction']) };
}

function imports(text: string, root: Node, cfg: LanguageConfig): Change | null {
  // Ruby's `include`/`extend` order decides method lookup: only `require` lines are re-sorted.
  const imps = cfg.declarationsIn(root).filter((d) => d.kind === 'import' && d.node.startPosition.row === d.node.endPosition.row && (cfg.id !== 'ruby' || d.name.startsWith('require')));
  // A run of consecutive single-line imports.
  const run: Node[] = [];
  for (const d of imps) {
    const last = run.at(-1);
    if (last && d.node.startPosition.row !== last.endPosition.row + 1) {
      if (run.length >= 3) break;
      run.length = 0;
    }
    run.push(d.node);
  }
  if (run.length < 3) return null;
  // A comment above the run would end up describing a different import.
  if (run[0]!.previousSibling && cfg.attachedTypes.has(run[0]!.previousSibling.type)) return null;
  if (run.some((n, i) => i > 0 && n.previousSibling?.startIndex !== run[i - 1]!.startIndex)) return null;
  const s = lineStart(text, run[0]!);
  const e = lineEnd(text, run.at(-1)!);
  const lines = text.slice(s, e).replace(/\n$/, '').split('\n');
  if (new Set(lines).size !== lines.length) return null;
  const out = text.slice(0, s) + [...lines].reverse().join('\n') + '\n' + text.slice(e);
  return { kind: 'imports', old: text, new: out, expect: 'moved', allowed: new Set(['moved']) };
}

function reindent(text: string, fns: FunctionInfo[], id: LanguageId): Change | null {
  if (id === 'python') return null;
  const fn = pick(fns.filter((f) => f.statements.length >= 2 && f.node.startPosition.row < f.node.endPosition.row - 2));
  if (!fn) return null;
  const s = lineEnd(text, fn.body.child(0) ?? fn.body);
  const e = lineStart(text, fn.body.child(fn.body.childCount - 1) ?? fn.body);
  if (e <= s) return null;
  const inner = text.slice(s, e);
  // Template strings and raw strings keep their spacing: skip functions that have any.
  if (/`|r#?"|"""/.test(inner) || /^\s*$/.test(inner)) return null;
  // PHP heredocs and nowdocs keep their spacing too, and so does HTML outside <?php ... ?>.
  if (id === 'php' && /<<<|\?>/.test(inner)) return null;
  // Ruby heredocs and %-literals keep their spacing, and `=begin` must start its line.
  if (id === 'ruby' && (/<<[~-]?["'`]?\w|%[qQwWiIr]?[\[({<|!]|^=begin/m.test(inner))) return null;
  // Swift raw strings (`#"..."#`) too.
  if (id === 'swift' && /#+"/.test(inner)) return null;
  const out = text.slice(0, s) + inner.replace(/^(?=[ \t]*\S)/gm, id === 'go' ? '\t' : '  ') + text.slice(e);
  return { kind: 'reindent', old: text, new: out, expect: 'reformatted', allowed: new Set(['reformatted']) };
}

const stats = new Map<Kind, { tried: number; found: number; wrong: number; ms: number }>();
const show = process.env.SHOW;
const files = JSON.parse(fs.readFileSync(dataPath, 'utf8')) as Array<{ name: string; newContents: string }>;
let used = 0;
for (const f of files) {
  if (used >= Number(maxFiles)) break;
  const id = languageForPath(f.name);
  const text = f.newContents;
  if (!id || text.length > 300_000 || text.split('\n').some((l) => l.length > 1000)) continue;
  const cfg = LANGUAGES[id];
  const parser = await getParser(id);
  const tree = parser.parse(text)!;
  if (tree.rootNode.hasError) {
    tree.delete();
    parser.delete();
    continue;
  }
  used++;
  const fns = functionsIn(tree.rootNode, cfg);
  const changes: Array<Change | null> = [move(text, tree.rootNode, cfg), rename(text, tree.rootNode, cfg, fns), imports(text, tree.rootNode, cfg), reindent(text, fns, id)];
  const ex = extract(text, tree.rootNode, cfg, fns, id);
  changes.push(ex);
  if (ex) changes.push({ kind: 'inline', old: ex.new, new: ex.old, expect: 'inlinedFunction', allowed: new Set(['inlinedFunction']) });
  tree.delete();
  parser.delete();
  for (const c of changes) {
    if (!c || c.old === c.new) continue;
    const st = stats.get(c.kind) ?? { tried: 0, found: 0, wrong: 0, ms: 0 };
    stats.set(c.kind, st);
    st.tried++;
    const t0 = performance.now();
    const r = await semanticDiffFile(id, c.old, c.new, f.name);
    st.ms += performance.now() - t0;
    const types = r.semanticOperations.map((o) => o.type).filter((t) => SEMANTIC.has(t));
    const found = types.includes(c.expect as never);
    const wrong = types.filter((t) => !c.allowed.has(t));
    if (found) st.found++;
    if (wrong.length) st.wrong++;
    // EXPORT=<file.jsonl>: write each change, with our answer, for comparing other tools on the same pairs.
    if (process.env.EXPORT) fs.appendFileSync(process.env.EXPORT, JSON.stringify({ kind: c.kind, language: id, name: f.name, old: c.old, new: c.new, expect: c.expect, ours: { found, wrong, ms: performance.now() - t0 } }) + '\n');
    if (show === c.kind && (!found || wrong.length)) {
      console.log(`--- ${c.kind} ${f.name}: found=${found} extra=${wrong.join(',')}`);
      if (process.env.DUMP) fs.writeFileSync(`${process.env.DUMP}/${c.kind}-${used}.json`, JSON.stringify({ language: id, name: f.name, old: c.old, new: c.new, ops: r.semanticOperations.map((o) => [o.type, o.lines]) }));
    }
  }
}
console.log(`${dataPath.split('/').pop()}: ${used} files`);
for (const [k, s] of stats)
  console.log(`  ${k.padEnd(9)} tried ${String(s.tried).padStart(4)}  found ${((100 * s.found) / s.tried).toFixed(0).padStart(3)}%  false claims ${s.wrong} (${((100 * s.wrong) / s.tried).toFixed(1)}%)  ${(s.ms / s.tried).toFixed(0)} ms each`);
