/**
 * Opening a `.dog` file into the source view's box, and the difference between the box and the record's text.
 *
 * The files are real `File`s, as the browser hands one from a file input, and the texts are `dogText`'s own, so what is
 * read here is what Save writes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dogText, parseDog, type PageBody } from '@braindog/dog';

import { OPEN_MOST, diffBlock, diffLines, openText, openWords } from './open.ts';

const DESK: PageBody = {
  page: 'desk',
  title: 'Desk',
  blocks: [{ kind: 'note', body: 'Nothing is late.' }],
};

const file = (text: string, name = 'desk.dog'): File => new File([text], name, { type: 'text/plain' });

test('a .dog file fills the box with the text it holds', async () => {
  const text = dogText(DESK);
  assert.deepEqual(await openText(file(text)), { ok: true, name: 'desk.dog', text });
});

test('a file saved on another machine reads as the same text: no mark at its head, one kind of line ending', async () => {
  const text = dogText(DESK);
  const got = await openText(file(`﻿${text.replace(/\n/g, '\r\n')}`));
  assert.deepEqual(got, { ok: true, name: 'desk.dog', text });
});

test("a file that does not parse is refused with the parser's sentence and its line", async () => {
  const text = 'title: Desk\n';
  const parsed = parseDog(text);
  assert.equal(parsed.ok, false);
  const got = await openText(file(text, 'notes.txt'));
  assert.deepEqual(got, { ok: false, name: 'notes.txt', fix: parsed.ok ? '' : parsed.fix, line: parsed.ok ? null : parsed.line });
});

test('a refused file leaves the box alone: the answer carries no text to put in it', async () => {
  const got = await openText(file('{ "not": "a page" }'));
  assert.equal(got.ok, false);
  assert.equal('text' in got, false);
});

test('a file too large to be a page is refused before it is read', async () => {
  let read = false;
  const big = { name: 'film.dog', size: OPEN_MOST + 1, text: async () => ((read = true), '') };
  assert.deepEqual(await openText(big), { ok: false, name: 'film.dog', fix: openWords.tooLarge, line: null });
  assert.equal(read, false);
});

test('a file the browser cannot read is refused in a sentence', async () => {
  const gone = { name: 'desk.dog', size: 10, text: async (): Promise<string> => Promise.reject(new Error('NotReadableError')) };
  assert.deepEqual(await openText(gone), { ok: false, name: 'desk.dog', fix: openWords.unread, line: null });
});

test('a file kept from another page is refused on this one, and opens on its own', async () => {
  const text = dogText({ ...DESK, page: 'money' });
  assert.deepEqual(await openText(file(text, 'money.dog'), 'desk'), { ok: false, name: 'money.dog', fix: openWords.otherPage('money', 'desk'), line: 1 });
  assert.deepEqual(await openText(file(text, 'money.dog'), 'money'), { ok: true, name: 'money.dog', text });
});

test('the box against the record lists the changed lines, each with its own line number', () => {
  const held = 'page: desk\ntitle: Desk\nblocks:\n  - kind: note\n';
  const box = 'page: desk\ntitle: My desk\nblocks:\n  - kind: note\n    lead: true\n';
  assert.deepEqual(diffLines(held, box), [
    { op: 'del', line: 2, text: 'title: Desk' },
    { op: 'add', line: 2, text: 'title: My desk' },
    { op: 'add', line: 5, text: '    lead: true' },
  ]);
});

test('the same text differs in nothing, and a line break at the end is not a line', () => {
  assert.deepEqual(diffLines('page: desk\n', 'page: desk\n'), []);
  assert.deepEqual(diffLines('page: desk\n', 'page: desk'), []);
});

test("the difference is a block the diff kind's drawer draws: every line, marked", () => {
  const block = diffBlock('page: desk\ntitle: Desk\n', 'page: desk\ntitle: My desk\n');
  assert.equal(block.kind, 'diff');
  assert.deepEqual(
    block.rows.map((r) => r.cells[0]),
    ['  page: desk', '- title: Desk', '+ title: My desk'],
  );
});
