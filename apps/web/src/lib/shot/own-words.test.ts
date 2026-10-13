/**
 * Screenshot mode: which texts are the product's own.
 *
 * THE PLATE ASKS ONE QUESTION, "is this text in the set", and this file is about how the set is made.
 * A sentence somebody typed whole into a copy file is in it. A sentence with a hole is not, in any
 * form, because what fills the hole comes from a record. Every case below errs the same way: a text
 * left out of the set is plated, and a text wrongly let in is a record's word shown in a picture.
 *
 * THE SOURCES ARE STRINGS OF TYPESCRIPT, as the build reads them off the disk. Nothing here touches
 * a file or a bundler: `vite.config.ts` does the reading and hands the texts to the same function.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ownWordsOf } from './own-words.ts';

const words = (...sources: unknown[]) => [...ownWordsOf(sources)].sort();

test('every string literal is a member, in either quote', () => {
  const source = `export const shell = { accept: 'Accept', decide: "Decide", needs: 'Needs you' };`;
  assert.deepEqual(words(source), ['Accept', 'Decide', 'Needs you']);
});

test('a template with no hole is a sentence like any other', () => {
  assert.deepEqual(words('export const calm = `Nothing needs you`;'), ['Nothing needs you']);
});

test('a member is trimmed, and a literal of nothing but space is no member', () => {
  assert.deepEqual(words(`const a = '  Search '; const b = '   '; const c = '';`), ['Search']);
});

test('a template with a hole contributes nothing, and neither does what is typed inside the hole', () => {
  const source = [
    'export const due = (n: number) => `Due in ${n} days`;',
    "export const left = (n: number) => `${n} ${n === 1 ? 'task' : 'tasks'} left`;",
  ].join('\n');
  assert.deepEqual(words(source), []);
});

test('a hole does not hide the whole sentences beside it', () => {
  const source = "export const say = (n: number) => (n === 0 ? 'All done' : `${n} to go`);";
  assert.deepEqual(words(source), ['All done']);
});

test('a duplicate counts once, in one file or across two', () => {
  const own = ownWordsOf([`const a = 'Close'; const b = 'Close';`, `export const c = ' Close ';`]);
  assert.equal(own.size, 1);
  assert.ok(own.has('Close'));
});

test('a source that is not a string is ignored, and so is a literal that is not one', () => {
  assert.deepEqual(words(undefined, null, 7, { text: `'Money'` }, ['x'], `const n = 12; const yes = true;`), []);
  assert.deepEqual(words(null, `const a = 'Money';`), ['Money']);
});

test('a quote inside a comment or a pattern is not a sentence', () => {
  const source = [
    "/** It says 'Renew the lease' when the record does. */",
    "// and \"Pay rent\" too",
    "const folded = (said: string) => said.replace(/['\"]+/gu, '-');",
  ].join('\n');
  assert.deepEqual(words(source), ['-']);
});

test('the name of a file, a key and a type are not words anybody reads', () => {
  const source = [
    "import { list } from './english.ts';",
    "export { list as again } from './english.ts';",
    "type Mode = 'on' | 'off';",
    "export const copy = { 'try-again': 'Try again' };",
  ].join('\n');
  assert.deepEqual(words(source), ['Try again']);
});

test('an escape is read as the character it stands for', () => {
  assert.deepEqual(words(`const a = 'Don\\'t ask again'; const b = "Caf\\u00e9";`), ['Café', "Don't ask again"]);
});

test('the answer is a new set each time, so a caller may add to its own', () => {
  const first = ownWordsOf([`const a = 'Accept';`]);
  first.add('Mine');
  assert.deepEqual(words(`const a = 'Accept';`), ['Accept']);
});
