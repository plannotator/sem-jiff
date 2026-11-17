// Which function on one side is the same function on the other: the pairing the extract/inline
// check builds on. A function with a counterpart still exists (it was not inlined or extracted);
// one with a twin moved or was renamed. Each rule below is one way the same function shows up.
import { rule, trial } from './runtime.ts';
import type { Node } from 'web-tree-sitter';
import { swiftParams, type LanguageConfig } from './parse.ts';
import { callsParent, callsTo, dice, pairSameNamed, tokens, type FunctionInfo } from './syntax.ts';


export interface Pairing {
  /** The same function on the other side, if it still exists there. */
  counterpart(f: FunctionInfo): FunctionInfo | undefined;
  /** Its body reappears in another function on the other side: moved or renamed, not inlined. */
  hasTwin(f: FunctionInfo): boolean;
}

export function pairFunctions(oldFns: FunctionInfo[], newFns: FunctionInfo[], oldRoot: Node, newRoot: Node, cfg: LanguageConfig): Pairing {
  // Same function in both versions: same class (or receiver) and name, or, when the
  // class itself was renamed, the only function of that name on each side.
  // Overloads share a name: pair them by body similarity, not by order.
  // The overload that kept the old parameter list is the old function: when code moves
  // into a new, longer overload (`readFrom(in, funnel)` -> `readFrom(in, funnel, max)`),
  // body similarity alone would pair the old one with the overload now holding its code.
  // Trial FN_PAIRING: Swift has no `parameters` field. Its signature is the declaration's header before the
  // body (parameter labels and types, `async`, `throws`, the result type), so overloads are told apart by what
  // they take and give, not by their bodies alone.
  const fnPairing = trial('FN_PAIRING');
  const swiftSig = (f: FunctionInfo) => fnPairing && cfg.id === 'swift' && SWIFT_SIGNED.has(f.node.type);
  const signature = (f: FunctionInfo) => {
    const p = swiftSig(f)
      ? f.node.children.filter((c): c is Node => !!c && c.endIndex <= f.body.startIndex && c.type !== 'modifiers').flatMap(tokens).slice(0, 60)
      : tokens(f.node.childForFieldName('parameters') ?? f.node.childForFieldName('value')?.childForFieldName('parameters') ?? f.body).slice(0, 60);
    return [...p, ...p, ...p, ...tokens(f.body)];
  };
  // An overload that kept the old parameter list exactly is the old function, however
  // much its body changed: `consumeMessages(brokerUrl, topics)` became a wrapper around a
  // new `consumeMessages(consumer, topics)` that now holds the old body.
  const base = (f: FunctionInfo) => f.key.replace(/#\d+$/, '');
  const params = (f: FunctionInfo) => {
    const p = f.node.childForFieldName('parameters') ?? f.node.childForFieldName('value')?.childForFieldName('parameters');
    return p ? tokens(p).join(' ') : null;
  };
  // A tie-break, not a key: only huge same-name groups (which otherwise pair in order) pair an exact parameter list first.
  const exactSignature = (f: FunctionInfo) => (swiftSig(f) ? swiftParams(f.node) : params(f));
  const samePlace = (fs: FunctionInfo[], f: FunctionInfo) => fs.filter((g) => base(g) === base(f));
  const pinned: Array<[FunctionInfo, FunctionInfo]> = [];
  // Either way round: one function became several overloads, or several became one.
  for (const f of oldFns) {
    const p = params(f);
    const olds = samePlace(oldFns, f);
    const news = samePlace(newFns, f);
    if (p === null || olds.length > 1 || news.length < 2) continue;
    const same = news.filter((g) => params(g) === p);
    if (same.length === 1) pinned.push([f, same[0]!]);
  }
  for (const g of newFns) {
    const p = params(g);
    const olds = samePlace(oldFns, g);
    const news = samePlace(newFns, g);
    if (p === null || news.length > 1 || olds.length < 2) continue;
    const same = olds.filter((f) => params(f) === p);
    if (same.length === 1) pinned.push([same[0]!, g]);
  }
  // A body that reappears token for token under another name was renamed, even when a new
  // function took the old name (`run` -> `fly` and a new `run`; `comments` -> `reviewComments`
  // while `conversation` -> `comments`): pairing by name would set up a false extract and inline.
  // Only one-to-one identical bodies of some size, and only when the same-name partner differs.
  if (rule('SWAPPED_RENAMES')) {
    const text = (f: FunctionInfo) => tokens(f.body).join(' ');
    const sized = (f: FunctionInfo) => tokens(f.body).length >= 12;
    const group = (fs: FunctionInfo[]) => fs.filter(sized).reduce((m, f) => m.set(text(f), [...(m.get(text(f)) ?? []), f]), new Map<string, FunctionInfo[]>());
    const og = group(oldFns);
    const ng = group(newFns);
    const taken = new Set(pinned.flat());
    for (const [t, os] of og) {
      const ns = ng.get(t);
      if (os.length !== 1 || ns?.length !== 1) continue;
      const [f, g] = [os[0]!, ns[0]!];
      if (f.name === g.name || taken.has(f) || taken.has(g)) continue;
      const sameNameNew = newFns.filter((x) => base(x) === base(f));
      const sameNameOld = oldFns.filter((x) => base(x) === base(g));
      // Unless one side's same-name partner is just as identical (then it is a copy, not a rename).
      if ([...sameNameNew, ...sameNameOld].some((x) => text(x) === t)) continue;
      if (!sameNameNew.length && !sameNameOld.length) continue; // a plain rename: hasTwin handles it
      // A namesake that called the other one took its whole body: an inline (`entrySet()` that
      // called `createEntrySet()` now holds its body) or, the other way round, an extract.
      if (sameNameOld.some((x) => callsTo(x.node, f.name, cfg).length) || sameNameNew.some((x) => callsTo(x.node, g.name, cfg).length)) continue;
      pinned.push([f, g]);
      taken.add(f).add(g);
    }
    if (fnPairing) pinned.push(...renameChains(oldFns, newFns, oldRoot, newRoot, cfg, base, taken));
  }
  const pinnedOld = new Set(pinned.map(([a]) => a));
  const pinnedNew = new Set(pinned.map(([, b]) => b));
  const byKey = new Map([
    ...pinned,
    ...pairSameNamed(oldFns.filter((f) => !pinnedOld.has(f)), newFns.filter((f) => !pinnedNew.has(f)), base, signature, undefined, fnPairing ? exactSignature : undefined),
  ]);
  const count = (fs: FunctionInfo[]) => fs.reduce((m, f) => m.set(f.name, (m.get(f.name) ?? 0) + 1), new Map<string, number>());
  const oldCount = count(oldFns);
  const newCount = count(newFns);
  // With FN_PAIRING, a function already paired (a rename chain took it) is no one else's counterpart by name.
  const pairedNew = fnPairing ? new Set(byKey.values()) : new Set<FunctionInfo>();
  const newOnlyByName = new Map(newFns.filter((f) => newCount.get(f.name) === 1 && !pairedNew.has(f)).map((f) => [f.name, f]));
  const counterpart = (f: FunctionInfo) =>
    byKey.get(f) ?? (oldCount.get(f.name) === 1 ? newOnlyByName.get(f.name) : undefined);
  // A function whose twin (same name, same body) is on the other side was moved or
  // had its class renamed; it was not inlined or extracted.
  // Likewise one whose body reappears in a new function under another name was renamed
  // (`entryIterator` -> `internalEntryIterator`, callers updated).
  const matched = new Set(oldFns.map((f) => counterpart(f)).filter((g): g is FunctionInfo => !!g));
  // A rename takes the old name away. When that name is still declared on this side (the
  // function was kept, say as a one-line arrow the pairing above does not see), its body
  // moving to a new function is an extract or inline, not a rename. (Mere references do
  // not count: callers elsewhere may keep calling the old name.)
  // Declarations are counted: overrides in several classes share a name, and renaming
  // some of them still takes declarations away.
  let declared: [Map<string, number>, Map<string, number>] | null = null;
  const stillNamed = (name: string) => {
    declared ??= [namesIn(oldRoot), namesIn(newRoot)];
    return (declared[0].get(name) ?? 0) >= (declared[1].get(name) ?? 0);
  };
  const hasTwin = (f: FunctionInfo) => {
    const t = tokens(f.body);
    return newFns.some((g) => {
      // Same name, same body: moved. Unless that function is still paired with another one
      // here (it kept its signature as a wrapper): then the body went into a new overload.
      if (g.name === f.name) return !matched.has(g) && dice(tokens(g.body), t) >= 0.9;
      // Renamed and lightly edited on the way (`IsSafe` -> `Validate`, 0.82 alike).
      return !matched.has(g) && t.length >= 8 && dice(tokens(g.body), t) >= 0.8 && !stillNamed(g.name);
    });
  };

  return { counterpart, hasTwin };
}

/**
 * Trial FN_PAIRING: renames where a new function took the old name, which name-only pairing reads as an
 * extract or inline. `f` (old) and `g` (new) under different names
 * in one class are one function when their bodies are near-identical (dice >= 0.9, 12+ tokens), or identical and short
 * with the references to the name moved over (`schema` -> `__schema__`, callers updated); one to one, and
 * only when a namesake took a name. A namesake that calls the other one took its body (an inline or an
 * extract), unless it is itself one link of the chain: its body reappears in another new (old) function,
 * with the call renamed (`clearDiskCache()` -> `clearDiskCache_()` while `clearDiskCacheWith...(_:)` ->
 * `clearDiskCache(with:)`); a call to the parent's version (`super.f`, `superclass&.__schema__`) never counts.
 */
function renameChains(oldFns: FunctionInfo[], newFns: FunctionInfo[], oldRoot: Node, newRoot: Node, cfg: LanguageConfig, base: (f: FunctionInfo) => string, taken: Set<FunctionInfo>): Array<[FunctionInfo, FunctionInfo]> {
  const out: Array<[FunctionInfo, FunctionInfo]> = [];
  const toks = new Map<FunctionInfo, string[]>();
  const t = (f: FunctionInfo) => toks.get(f) ?? (toks.set(f, tokens(f.body)), toks.get(f)!);
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  let refs: [Map<string, number>, Map<string, number>] | null = null;
  const moved = (from: string, to: string) => {
    refs ??= [leafCounts(oldRoot), leafCounts(newRoot)];
    const [o, n] = refs;
    return (o.get(from) ?? 0) > (n.get(from) ?? 0) && (n.get(to) ?? 0) > (o.get(to) ?? 0);
  };
  const alike = (f: FunctionInfo, g: FunctionInfo): number => {
    const a = t(f);
    const b = t(g);
    if (a.length >= 12 && b.length >= 12) return dice(a, b);
    return a.length >= 4 && same(a, b) && f.name !== g.name && moved(f.name, g.name) ? 1 : 0;
  };
  const scope = (f: FunctionInfo) => base(f).slice(0, base(f).lastIndexOf('/'));
  const ownCalls = (x: FunctionInfo, name: string) => callsTo(x.node, name, cfg).filter((c) => !callsParent(c));
  // `x` (on one side) calls `name`; its own twin `y` on the other side calls `to` and reads the same with the call renamed.
  // `y` is new to its side: no function of its name on `x`'s side.
  const chainTwin = (x: FunctionInfo, name: string, to: string, others: FunctionInfo[], xSide: FunctionInfo[]) => {
    const want = t(x).map((k) => (k === name ? to : k));
    return others.find((y) => !taken.has(y) && y.name !== x.name && !xSide.some((z) => base(z) === base(y)) && ownCalls(y, to).length && dice(want, t(y)) >= 0.8);
  };
  const best = (pool: FunctionInfo[], skip: (g: FunctionInfo) => boolean, score1: (g: FunctionInfo) => number) => {
    let top: FunctionInfo | null = null;
    let score = 0;
    let tie = false;
    for (const g of pool) {
      if (taken.has(g) || skip(g)) continue;
      const s = score1(g);
      if (s > score) { top = g; score = s; tie = false; }
      else if (s === score && s > 0) tie = true;
    }
    return score >= 0.9 && !tie ? { g: top!, score } : null;
  };
  for (const f of oldFns) {
    if (taken.has(f)) continue;
    const m = best(newFns, (g) => g.name === f.name || scope(g) !== scope(f), (g) => alike(f, g));
    if (!m) continue;
    const { g, score } = m;
    const back = best(oldFns, (x) => x.name === g.name || scope(x) !== scope(g), (x) => alike(x, g));
    if (back?.g !== f) continue;
    const sameNameNew = newFns.filter((x) => base(x) === base(f));
    const sameNameOld = oldFns.filter((x) => base(x) === base(g));
    if (!sameNameNew.length && !sameNameOld.length) continue; // a plain rename: hasTwin handles it
    // A same-name partner just as alike: a copy, not a rename.
    if (sameNameNew.some((x) => alike(f, x) >= score) || sameNameOld.some((x) => alike(x, g) >= score)) continue;
    const links: Array<[FunctionInfo, FunctionInfo]> = [];
    let namesakeTookIt = false;
    for (const x of sameNameOld) {
      if (!ownCalls(x, f.name).length) continue;
      const y = chainTwin(x, f.name, g.name, newFns.filter((y) => y !== g), oldFns);
      if (y) links.push([x, y]);
      else namesakeTookIt = true;
    }
    for (const x of sameNameNew) {
      if (!ownCalls(x, g.name).length) continue;
      const y = chainTwin(x, g.name, f.name, oldFns.filter((y) => y !== f), newFns);
      if (y) links.push([y, x]);
      else namesakeTookIt = true;
    }
    if (namesakeTookIt) continue;
    out.push([f, g], ...links);
    taken.add(f).add(g);
    for (const [a, b] of links) taken.add(a).add(b);
  }
  return out;
}

/** How often each leaf text occurs in the tree (declarations and references alike). */
function leafCounts(root: Node): Map<string, number> {
  const out = new Map<string, number>();
  const stack: Node[] = [root];
  while (stack.length) {
    const n = stack.pop()!;
    if (n.childCount === 0) { out.set(n.text, (out.get(n.text) ?? 0) + 1); continue; }
    for (const c of n.children) if (c) stack.push(c);
  }
  return out;
}

/** Swift declarations with a parameter list (a computed property has none). */
const SWIFT_SIGNED = new Set(['function_declaration', 'init_declaration', 'subscript_declaration']);

/** How often the tree declares each name (a leaf that is its parent's `name` field). */
function namesIn(root: Node): Map<string, number> {
  const out = new Map<string, number>();
  const stack: Node[] = [root];
  while (stack.length) {
    const n = stack.pop()!;
    if (n.childCount === 0) {
      if (n.parent?.childForFieldName('name')?.id === n.id) out.set(n.text, (out.get(n.text) ?? 0) + 1);
      continue;
    }
    for (const c of n.children) if (c) stack.push(c);
  }
  return out;
}
