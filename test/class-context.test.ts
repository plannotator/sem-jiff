// Java and C#: the class a line sits in is its context (the decided rule). Code moved into another class, or
// into or out of a nested class, is an edit; moves that stay in one class, one nested class, or the parts of
// one C# partial class are still moves. Lookalikes of the trap cases in test/fixtures/traps/{java,csharp}.json.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { semanticDiffFile } from '../src/index.ts';
import type { LanguageId } from '../src/parse.ts';

const moves = async (lang: LanguageId, a: string, b: string) =>
  (await semanticDiffFile(lang, a, b, lang === 'java' ? 'A.java' : 'A.cs')).semanticOperations.filter((o) => o.type === 'moved' || o.type === 'movedWithEdit');

const jm = (name: string, body: string) => `  int ${name}(int x) {\n    int y = x * 3;\n    return ${body};\n  }\n`;

test('Java: a method moved within its class is moved', async () => {
  const a = `class Shop {\n${jm('total', 'y + 1')}\n${jm('tax', 'y / 10')}\n${jm('fee', 'y - 2')}}\n`;
  const b = `class Shop {\n${jm('tax', 'y / 10')}\n${jm('fee', 'y - 2')}\n${jm('total', 'y + 1')}}\n`;
  assert.ok((await moves('java', a, b)).some((o) => o.type === 'moved'));
});

test('Java: a method moved within a nested class is moved; the same method moved out of it is not', async () => {
  const inner = (first: boolean) => `class Outer {\n  static class Inner {\n${first ? jm('a', 'y + 1') + '\n' : ''}${jm('b', 'y + 2')}\n${jm('c', 'y + 3')}${first ? '' : '\n' + jm('a', 'y + 1')}  }\n}\n`;
  assert.ok((await moves('java', inner(true), inner(false))).some((o) => o.type === 'moved'));
  const out = `class Outer {\n${jm('a', 'y + 1')}\n  static class Inner {\n${jm('b', 'y + 2')}\n${jm('c', 'y + 3')}  }\n}\n`;
  const a = inner(true);
  assert.deepEqual((await moves('java', a, out)).filter((o) => o.lines.old.some((l) => l.start <= 6 && 3 <= l.end)), []);
});

test('Java: a whole nested class moved within its outer class is moved', async () => {
  const nested = `  static class Box {\n${jm('size', 'y + 4')}  }\n`;
  const a = `class Outer {\n${nested}\n${jm('p', 'y + 5')}\n${jm('q', 'y + 6')}\n${jm('r', 'y + 7')}}\n`;
  const b = `class Outer {\n${jm('p', 'y + 5')}\n${jm('q', 'y + 6')}\n${jm('r', 'y + 7')}\n${nested}}\n`;
  assert.ok((await moves('java', a, b)).some((o) => o.type === 'moved'));
});

const cm = (name: string, body: string) => `    public int ${name}(int x)\n    {\n        var y = x * 3;\n        return ${body};\n    }\n`;

test('C#: a method moved between the parts of a partial class is moved', async () => {
  const a = `public partial class Cart\n{\n${cm('Total', 'y + 1')}\n${cm('Tax', 'y / 10')}}\n\npublic partial class Cart\n{\n${cm('Fee', 'y - 2')}}\n`;
  const b = `public partial class Cart\n{\n${cm('Tax', 'y / 10')}}\n\npublic partial class Cart\n{\n${cm('Fee', 'y - 2')}\n${cm('Total', 'y + 1')}}\n`;
  const m = await moves('csharp', a, b);
  assert.ok(m.some((o) => o.type === 'moved'), JSON.stringify(m.map((o) => o.type)));
  assert.ok(!m.some((o) => o.type === 'movedWithEdit'), JSON.stringify(m.map((o) => o.type)));
});

test('C#: a method moved between two different classes is not a move; within one class it is', async () => {
  const a = `public class Cart\n{\n${cm('Total', 'y + 1')}\n${cm('Tax', 'y / 10')}}\n\npublic class Order\n{\n${cm('Fee', 'y - 2')}}\n`;
  const b = `public class Cart\n{\n${cm('Tax', 'y / 10')}}\n\npublic class Order\n{\n${cm('Fee', 'y - 2')}\n${cm('Total', 'y + 1')}}\n`;
  assert.deepEqual((await moves('csharp', a, b)).map((o) => o.type), []);
  const c = `public class Cart\n{\n${cm('Tax', 'y / 10')}\n${cm('Total', 'y + 1')}}\n\npublic class Order\n{\n${cm('Fee', 'y - 2')}}\n`;
  assert.ok((await moves('csharp', a, c)).some((o) => o.type === 'moved'));
});

test('C#: a method moved between namespaces is not a move', async () => {
  const ns = (n: string, body: string) => `namespace ${n}\n{\n    public static class Util\n    {\n${body}    }\n}\n`;
  const m = cm('Total', 'y + 1').replace(/^ {4}/gm, '        ');
  const other = cm('Tax', 'y / 10').replace(/^ {4}/gm, '        ');
  const a = `${ns('A', m + '\n' + other)}\n${ns('B', other.replace('Tax', 'Fee'))}`;
  const b = `${ns('A', other)}\n${ns('B', other.replace('Tax', 'Fee') + '\n' + m)}`;
  assert.deepEqual((await moves('csharp', a, b)).map((o) => o.type), []);
});

test('C#: Foo and Foo<T> are different classes: a member moved between them is not a move', async () => {
  const a = `public class Box\n{\n${cm('Total', 'y + 1')}\n${cm('Tax', 'y / 10')}}\n\npublic class Box<T>\n{\n${cm('Fee', 'y - 2')}}\n`;
  const b = `public class Box\n{\n${cm('Tax', 'y / 10')}}\n\npublic class Box<T>\n{\n${cm('Fee', 'y - 2')}\n${cm('Total', 'y + 1')}}\n`;
  assert.deepEqual((await moves('csharp', a, b)).map((o) => o.type), []);
});
