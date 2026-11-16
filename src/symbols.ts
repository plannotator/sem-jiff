// The declaration each operation is about (`symbol` on an operation), for hosts that name it: the Sem tab
// shows "greet moved", not "Greeter moved". Additive and optional: nothing else about an operation changes,
// and when the engine is unsure which declaration an operation is about it leaves `symbol` out, because a
// wrong name is shown to the person. The rules are in docs/symbols.md.
import type { Node } from 'web-tree-sitter';
import type { Declaration, LanguageConfig } from './parse.ts';
import type { SemanticDiffLineRange, SemanticDiffOperation, SemanticDiffTextRange } from './pierre-types.ts';
import { functionsIn } from './syntax.ts';

export type SymbolKind =
  | 'function' | 'method' | 'constructor' | 'class' | 'interface' | 'enum' | 'struct'
  | 'property' | 'field' | 'variable' | 'type' | 'module' | 'namespace' | 'import' | 'other';

export interface OperationSymbol {
  /** The declaration's own name as written, without class, receiver or namespace: "greet", not "Greeter.greet". */
  name: string;
  kind: SymbolKind;
  /** renamed only: the name before (`name` is the name after). */
  oldName?: string;
  /**
   * The enclosing declarations, outermost first, joined with "." ("Greeter", "User.Companion"). For a Kotlin
   * extension function or property it is the receiver type; inside a Swift extension, the extended type.
   */
  container?: string;
}

/** An operation as semanticDiffFile returns it: Pierre's operation plus the optional symbol. */
export type SemDiffOperation = SemanticDiffOperation & { symbol?: OperationSymbol };

interface Decl {
  node: Node;
  /** First line, comments and attributes attached above included; `bodyStart`: the declaration's own first line. */
  start: number;
  bodyStart: number;
  end: number;
  name: string;
  /** null: a declaration no symbol is given for (unsure what to call it). */
  kind: SymbolKind | null;
  container?: string;
  /** What members of this declaration are contained in (its name, or the type it extends or implements). */
  scope?: string;
  parent?: Decl;
  children: Decl[];
}

const FUNCTION_KINDS = new Set<SymbolKind>(['function', 'method', 'constructor']);
const line = (n: Node) => n.startPosition.row + 1;
const lastLine = (n: Node) => n.endPosition.row + 1;

/** First line of the comments and attributes directly above a declaration (no blank line between). */
function attachedStart(n: Node, cfg: LanguageConfig): number {
  let at = line(n);
  for (let c = n.previousSibling; c && cfg.attachedTypes.has(c.type); c = c.previousSibling) {
    const end = c.endPosition.column === 0 && c.endPosition.row > c.startPosition.row ? c.endPosition.row : c.endPosition.row + 1;
    if (end !== at - 1) break;
    at = line(c);
  }
  return at;
}

const bareType = (t: string) => (t.match(/[A-Za-z_][\w]*/g) ?? []).filter((w) => !/^(where|extension|impl|for)$/.test(w))[0] ?? t;

/** Name and container prefix of a declaration, per language: receivers, namespaces and `self.` are taken off the name. */
function nameOf(d: Declaration, cfg: LanguageConfig): { name: string; receiver?: string } | null {
  const raw = d.name;
  if (d.kind === 'import' || d.kind === 'export-from') {
    const key = raw.slice(raw.lastIndexOf(' ') + 1);
    return key ? { name: key } : null;
  }
  switch (cfg.id) {
    case 'kotlin': {
      if (d.kind === 'companion') return { name: raw === 'companion' ? 'Companion' : raw.slice('companion '.length) };
      const dot = d.kind.startsWith('function') || d.kind === 'property' ? raw.lastIndexOf('.') : -1;
      return dot > 0 ? { name: raw.slice(dot + 1), receiver: raw.slice(0, dot) } : { name: raw };
    }
    case 'go': {
      const m = raw.match(/^\(\s*\*?\s*([A-Za-z_]\w*)[^)]*\)\.(.+)$/);
      return m ? { name: m[2]!, receiver: m[1]! } : { name: raw };
    }
    case 'php':
      return { name: raw.slice(raw.lastIndexOf('\\') + 1) };
    case 'ruby':
      return { name: raw.replace(/^self\./, '') };
    default:
      return { name: raw };
  }
}

/** The kind of a declaration (null: give no symbol), from its config kind and node type. */
function kindOf(d: Declaration, parent: Decl | undefined, cfg: LanguageConfig): SymbolKind | null {
  const k = d.kind;
  const t = d.node.type;
  if (k === 'import' || k === 'export-from') return 'import';
  const inType = !!parent && parent.kind !== null && ['class', 'interface', 'enum', 'struct', 'other'].includes(parent.kind);
  const fn = (): SymbolKind => (inType ? 'method' : 'function');
  switch (cfg.id) {
    case 'typescript':
    case 'tsx': {
      const decl = t === 'export_statement' ? (d.node.childForFieldName('declaration') ?? d.node) : d.node;
      const dt = decl.type;
      if (/^(function_declaration|generator_function_declaration|function_signature)$/.test(dt)) return 'function';
      if (dt === 'method_definition' || dt === 'method_signature' || dt === 'abstract_method_signature') return d.name === 'constructor' ? 'constructor' : 'method';
      if (dt === 'class_declaration' || dt === 'abstract_class_declaration') return 'class';
      if (dt === 'interface_declaration') return 'interface';
      if (dt === 'enum_declaration') return 'enum';
      if (dt === 'type_alias_declaration') return 'type';
      if (dt === 'internal_module' || dt === 'module') return 'namespace';
      if (dt === 'lexical_declaration' || dt === 'variable_declaration') {
        const value = decl.namedChildren.find((c) => c?.type === 'variable_declarator')?.childForFieldName('value');
        return value && /^(arrow_function|function_expression|function|generator_function)$/.test(value.type) ? 'function' : 'variable';
      }
      if (dt === 'public_field_definition') {
        const value = decl.childForFieldName('value');
        return value && /^(arrow_function|function_expression)$/.test(value.type) ? 'method' : 'field';
      }
      return null;
    }
    case 'python': {
      const def = t === 'decorated_definition' ? d.node.childForFieldName('definition') : d.node;
      if (def?.type === 'function_definition') return inType ? (d.name === '__init__' ? 'constructor' : 'method') : 'function';
      if (def?.type === 'class_definition') return 'class';
      if (k === 'assignment') return inType ? 'field' : 'variable';
      return null;
    }
    case 'go': {
      if (t === 'function_declaration') return 'function';
      if (t === 'method_declaration') return 'method';
      if (t === 'type_declaration') {
        const spec = d.node.namedChildren.find((c) => c?.type === 'type_spec' || c?.type === 'type_alias');
        const ty = spec?.childForFieldName('type')?.type;
        return ty === 'struct_type' ? 'struct' : ty === 'interface_type' ? 'interface' : 'type';
      }
      if (t === 'const_declaration' || t === 'var_declaration') return 'variable';
      return null;
    }
    case 'rust': {
      if (t === 'function_item' || t === 'function_signature_item') return parent && (parent.node.type === 'impl_item' || parent.node.type === 'trait_item') ? 'method' : 'function';
      if (t === 'struct_item' || t === 'union_item') return 'struct';
      if (t === 'enum_item') return 'enum';
      if (t === 'trait_item') return 'interface';
      if (t === 'mod_item') return 'module';
      if (t === 'const_item' || t === 'static_item') return 'variable';
      if (t === 'type_item') return 'type';
      return null; // impl blocks, macros, extern crates
    }
    case 'java': {
      if (t === 'method_declaration') return 'method';
      if (t === 'constructor_declaration' || t === 'compact_constructor_declaration') return 'constructor';
      if (t === 'class_declaration' || t === 'record_declaration') return 'class';
      if (t === 'interface_declaration' || t === 'annotation_type_declaration') return 'interface';
      if (t === 'enum_declaration') return 'enum';
      if (k === 'field_declaration') return 'field';
      return null;
    }
    case 'csharp': {
      if (t === 'method_declaration' || t === 'local_function_statement') return t === 'method_declaration' ? 'method' : 'function';
      if (t === 'constructor_declaration') return 'constructor';
      if (t === 'class_declaration' || t === 'record_declaration') return 'class';
      if (t === 'struct_declaration' || t === 'record_struct_declaration') return 'struct';
      if (t === 'interface_declaration') return 'interface';
      if (t === 'enum_declaration') return 'enum';
      if (t === 'property_declaration') return 'property';
      if (k === 'field_declaration') return 'field';
      if (t === 'delegate_declaration') return 'type';
      if (t === 'namespace_declaration') return 'namespace';
      return null;
    }
    case 'php': {
      if (t === 'function_definition') return 'function';
      if (t === 'method_declaration') return d.name === '__construct' ? 'constructor' : 'method';
      if (t === 'class_declaration' || t === 'trait_declaration') return 'class';
      if (t === 'interface_declaration') return 'interface';
      if (t === 'enum_declaration') return 'enum';
      if (t === 'enum_case') return 'field';
      if (t === 'property_declaration') return 'property';
      if (t === 'const_declaration') return inType ? 'field' : 'variable';
      if (k === 'namespace') return 'namespace';
      if (k === 'use_declaration') return 'other';
      return null;
    }
    case 'ruby': {
      if (k === 'method' || k === 'define_method') return fn();
      if (k === 'class') return 'class';
      if (k === 'module') return 'module';
      if (k === 'constant') return 'variable';
      if (/^attr(_reader|_writer|_accessor)?$/.test(k)) return d.name.includes(',') ? null : 'property';
      return null; // `class << self`, visibility lines
    }
    case 'kotlin': {
      if (k.startsWith('function(')) return fn();
      if (k.startsWith('constructor(')) return 'constructor';
      if (k === 'class' || k === 'object' || k === 'companion') return 'class';
      if (k === 'interface') return 'interface';
      if (k === 'enum class') return 'enum';
      if (k === 'property') return d.name.startsWith('(') ? null : 'property';
      if (k === 'type_alias') return 'type';
      if (k === 'enum_entry') return 'field';
      if (k === 'init') return 'other';
      return null;
    }
    case 'swift': {
      if (k.startsWith('func(') || k.startsWith('requirement func(')) {
        if (t === 'init_declaration') return 'constructor';
        if (t === 'subscript_declaration') return null;
        return fn();
      }
      if (k === 'class' || k === 'actor') return 'class';
      if (k === 'struct') return 'struct';
      if (k === 'enum') return 'enum';
      if (t === 'protocol_declaration' || k === 'protocol') return 'interface';
      if (k === 'extension') return 'other';
      if (k === 'property' || k === 'requirement property') return inType ? 'property' : 'variable';
      if (k === 'case') return d.name.includes(',') ? null : 'field';
      if (t === 'typealias_declaration' || t === 'associatedtype_declaration') return 'type';
      return null;
    }
  }
  return null;
}

/** Every declaration in a tree, as the engine's config sees them, with its kind, container and children. */
function declarations(root: Node, cfg: LanguageConfig): Decl[] {
  const all: Decl[] = [];
  const visit = (container: Node, parent: Decl | undefined) => {
    for (const d of cfg.declarationsIn(container)) {
      const named = nameOf(d, cfg);
      const kind = named ? kindOf(d, parent, cfg) : null;
      const outer = parent?.scope;
      const container_ = named?.receiver ? (outer ? `${outer}.${bareType(named.receiver)}` : bareType(named.receiver)) : outer;
      const node = d.node;
      const end = lastLine(d.tail ?? node);
      const decl: Decl = { node, start: attachedStart(node, cfg), bodyStart: line(node), end, name: named?.name ?? d.name, kind, container: container_, parent, children: [] };
      // Members of an extension or impl belong to the type it extends or implements.
      const own = cfg.id === 'swift' && d.kind === 'extension' ? bareType(d.name) : node.type === 'impl_item' ? bareType((node.childForFieldName('type')?.text ?? d.name).replace(/<.*$/s, '')) : decl.name;
      decl.scope = cfg.id === 'swift' && d.kind === 'extension' ? own : outer ? `${outer}.${own}` : own;
      parent?.children.push(decl);
      all.push(decl);
      if (d.members) visit(d.members, decl);
    }
  };
  visit(root, undefined);
  return all;
}

const symbolOf = (d: Decl): OperationSymbol | null =>
  d.kind === null || !d.name ? null : { name: d.name, kind: d.kind, ...(d.container ? { container: d.container } : {}) };

/** Lines of a side's ranges, blank lines dropped. */
const nonBlank = (ranges: SemanticDiffLineRange[], lines: string[]) => {
  const out: number[] = [];
  for (const r of ranges) for (let l = r.start; l <= r.end; l++) if ((lines[l - 1] ?? '').trim()) out.push(l);
  return out;
};

/** The one declaration a single range is exactly (from its first or attached line to its last). */
function whole(ranges: SemanticDiffLineRange[], decls: Decl[], lines: string[]): Decl | null {
  const ls = nonBlank(ranges, lines);
  if (!ls.length) return null;
  const lo = ls[0]!;
  const hi = ls.at(-1)!;
  const hits = decls.filter((d) => (d.start === lo || d.bodyStart === lo) && d.end === hi);
  if (hits.length === 1) return hits[0]!;
  // A declaration and its only member on the same lines: the outer one is what the lines are.
  const outer = hits.filter((d) => !hits.some((o) => o !== d && o === d.parent));
  return hits.length && outer.length === 1 ? outer[0]! : null;
}

/** The innermost declaration holding every line, unless the lines also reach into more than one of its members. */
function holder(ranges: SemanticDiffLineRange[], decls: Decl[], lines: string[]): Decl | null {
  const ls = nonBlank(ranges, lines);
  if (!ls.length) return null;
  const lo = ls[0]!;
  const hi = ls.at(-1)!;
  const holding = decls.filter((d) => d.start <= lo && hi <= d.end);
  if (!holding.length) return null;
  // The smallest holder; when a declaration and its member cover the same lines (`object A { val x = 1 }`), the outer one.
  const inner = holding.reduce((a, b) => (b.end - b.start < a.end - a.start || (b.end - b.start === a.end - a.start && a.parent === b) ? b : a));
  // Lines in the holder that also reach into one of its members (and not only that member) are about more than one thing.
  if (ls.some((l) => inner.children.some((c) => c.start <= l && l <= c.end)) && !(lo <= inner.start && inner.end <= hi)) return null;
  return inner;
}

const same = (a: OperationSymbol | null, b: OperationSymbol | null) => !!a && !!b && a.name === b.name && a.kind === b.kind && a.container === b.container;
const agree = (a: OperationSymbol | null | undefined, b: OperationSymbol | null | undefined) => (a === undefined ? b ?? null : b === undefined ? a : same(a, b) ? a : null);

/** The text a span range covers, on one line. */
function textAt(lines: string[], r: SemanticDiffTextRange): string | null {
  if (r.start.line !== r.end.line) return null;
  return (lines[r.start.line - 1] ?? '').slice(r.start.character, r.end.character) || null;
}

const VARIABLE_PARENT = /parameter|variable_declarator|variable_declaration|let_declaration|short_var_declaration|assignment|pattern|catch|for_statement|for_in|range_clause|lambda|closure_parameters|block_parameters|method_parameters|value_binding|property_declaration|multi_variable/;

/** The kind of a renamed name, from where it is declared (on the old side): a declaration, or a local or parameter. */
function renamedSymbol(op: SemanticDiffOperation, oldDecls: Decl[], newDecls: Decl[], oldRoot: Node, oldLines: string[], newLines: string[], cfg: LanguageConfig): OperationSymbol | null {
  if (op.spans.length !== 1) return null;
  const span = op.spans[0]!;
  const olds = 'old' in span ? (span.old ?? []) : [];
  const news = 'new' in span ? (span.new ?? []) : [];
  const oldNames = new Set(olds.map((r) => textAt(oldLines, r)));
  const newNames = new Set(news.map((r) => textAt(newLines, r)));
  if (oldNames.size !== 1 || newNames.size !== 1) return null;
  const oldName = [...oldNames][0];
  const newName = [...newNames][0];
  if (!oldName || !newName || oldName === newName) return null;
  const declared = oldDecls.filter((d) => d.name === oldName && d.kind !== null && d.kind !== 'import');
  if (declared.length) {
    const kinds = new Set(declared.map((d) => `${d.kind}\u0000${d.container ?? ''}`));
    if (kinds.size !== 1) return null;
    const d = declared[0]!;
    const after = newDecls.filter((x) => x.name === newName && x.kind === d.kind && x.container === d.container);
    if (!after.length) return null;
    return { name: newName, kind: d.kind!, oldName, ...(d.container ? { container: d.container } : {}) };
  }
  // Not a declaration the config lists: a local or a parameter, when one of the old name's uses declares it.
  let local = false;
  let other = false;
  const walk = (n: Node) => {
    if (n.childCount === 0) {
      if (cfg.identifierTypes.has(n.type) && n.text === oldName && n.parent) {
        const p = n.parent;
        if (/type_parameter/.test(p.type)) other = true;
        else if (VARIABLE_PARENT.test(p.type) || VARIABLE_PARENT.test(p.parent?.type ?? '')) local = true;
      }
      return;
    }
    for (const c of n.children) if (c) walk(c);
  };
  walk(oldRoot);
  if (!local || other) return null;
  const holderFn = holder(op.lines.old, oldDecls, oldLines);
  const container = holderFn && FUNCTION_KINDS.has(holderFn.kind ?? 'other') ? [holderFn.container, holderFn.name].filter(Boolean).join('.') : undefined;
  return { name: newName, kind: 'variable', oldName, ...(container ? { container } : {}) };
}

/** Functions on one side lying wholly inside an operation's ranges. */
function functionsWithin(ranges: SemanticDiffLineRange[], decls: Decl[]): Decl[] {
  const covered = new Set<number>();
  for (const r of ranges) for (let l = r.start; l <= r.end; l++) covered.add(l);
  return decls.filter((d) => {
    if (d.kind === null || !FUNCTION_KINDS.has(d.kind)) return false;
    for (let l = d.bodyStart; l <= d.end; l++) if (!covered.has(l)) return false;
    return true;
  });
}

/** Set `symbol` on every operation the rules name a declaration for (docs/symbols.md); never changes anything else. */
export function attachSymbols(ops: SemDiffOperation[], oldRoot: Node, newRoot: Node, oldText: string, newText: string, cfg: LanguageConfig): void {
  const oldDecls = declarations(oldRoot, cfg);
  const newDecls = declarations(newRoot, cfg);
  // Functions the config does not list as declarations (nested ones): known only by name, as functions.
  const nested = (root: Node, decls: Decl[]) => {
    const out: Decl[] = [];
    // A function the config already lists (perhaps under an `export` or a decorator) is not a nested one.
    const listed = (f: Node) => decls.some((d) => d.node.startIndex <= f.startIndex && f.endIndex <= d.node.endIndex && d.bodyStart <= line(f) && lastLine(f) === d.end && (d.node.startIndex === f.startIndex || d.node.endIndex === f.endIndex));
    for (const f of functionsIn(root, cfg)) {
      if (listed(f.node) || f.node.type === 'pair' || f.node.type === 'variable_declarator' || f.node.type === 'public_field_definition') continue;
      const outer = decls.filter((d) => d.start <= line(f.node) && lastLine(f.node) <= d.end).sort((a, b) => b.start - a.start || a.end - b.end)[0];
      if (!outer || !FUNCTION_KINDS.has(outer.kind ?? 'other')) continue;
      const d: Decl = { node: f.node, start: line(f.node), bodyStart: line(f.node), end: lastLine(f.node), name: f.name, kind: 'function', container: [outer.container, outer.name].filter(Boolean).join('.'), parent: outer, children: [] };
      outer.children.push(d);
      out.push(d);
    }
    return out;
  };
  oldDecls.push(...nested(oldRoot, oldDecls));
  newDecls.push(...nested(newRoot, newDecls));
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const sideSymbol = (ranges: SemanticDiffLineRange[], decls: Decl[], lines: string[], pick: 'whole' | 'holder' | 'moved') => {
    if (!ranges.length) return undefined;
    if (pick === 'whole') {
      const d = whole(ranges, decls, lines);
      return d ? symbolOf(d) : null;
    }
    if (pick === 'holder') {
      const d = holder(ranges, decls, lines);
      return d ? symbolOf(d) : null;
    }
    const w = whole(ranges, decls, lines);
    if (w) return symbolOf(w);
    const h = holder(ranges, decls, lines);
    return h && FUNCTION_KINDS.has(h.kind ?? 'other') ? symbolOf(h) : null;
  };
  for (const op of ops) {
    let s: OperationSymbol | null | undefined = null;
    switch (op.type) {
      case 'moved':
      case 'movedWithEdit':
        s = agree(sideSymbol(op.lines.old, oldDecls, oldLines, 'moved'), sideSymbol(op.lines.new, newDecls, newLines, 'moved'));
        break;
      case 'reformatted':
      case 'edited':
        s = agree(sideSymbol(op.lines.old, oldDecls, oldLines, 'holder'), sideSymbol(op.lines.new, newDecls, newLines, 'holder'));
        break;
      case 'added':
        s = op.lines.old.length ? null : sideSymbol(op.lines.new, newDecls, newLines, 'whole');
        break;
      case 'deleted':
        s = op.lines.new.length ? null : sideSymbol(op.lines.old, oldDecls, oldLines, 'whole');
        break;
      case 'extractedFunction':
      case 'inlinedFunction': {
        const [ranges, decls] = op.type === 'extractedFunction' ? [op.lines.new, newDecls] : [op.lines.old, oldDecls];
        const fns = functionsWithin(ranges, decls).filter((f) => !functionsWithin(ranges, decls).some((g) => g !== f && g.start <= f.start && f.end <= g.end));
        s = fns.length === 1 ? symbolOf(fns[0]!) : null;
        break;
      }
      case 'renamed':
        s = renamedSymbol(op, oldDecls, newDecls, oldRoot, oldLines, newLines, cfg);
        break;
    }
    if (s) op.symbol = s;
  }
}

