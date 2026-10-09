/**
 * AN IMPORT SAYS WHAT IT LEFT UNREAD, a line for each section of the export no map or adapter opened.
 *
 * Before this the importer printed only the adapter's own list of what it left, and a section the adapter never
 * touched was in no list at all: on his record fourteen holdings stayed out for a week and nothing said so. The export
 * now reaches the adapter through a reader that notes each path it is asked for (`watched`), two names deep.
 *
 * RED FIRST: on the invented export of four sections with a map naming three, the dry run printed no "Not read" line,
 * and `--strict` was not an option the command took. EVERY VALUE IS MADE UP.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { importCommand, unreadSaid, watched } from '../src/import.ts';
import { NOW, imported, tallybook } from './fixtures/tallybook/host.ts';

const now = () => new Date(NOW);
const utc = () => 0;

test('THE READER NOTES EVERY SECTION IT IS ASKED FOR, two names deep, and plain values are never sections', () => {
  const exp = { saved: '2026-09-24', version: 3, items: [{ id: 1 }, { id: 2 }], empty: [], book: { opened: '2025-01-04', accounts: [{}], cards: { a: {}, b: {} } }, shelf: { s1: {} } };
  const w = watched(exp);
  void (w.value.items as unknown[]).length;
  void (w.value.book as Record<string, unknown>).accounts;
  assert.deepEqual(w.unread(), [
    { section: 'book.cards', items: 2 },
    { section: 'shelf', items: 1 },
  ]);
  assert.deepEqual(unreadSaid(w.unread()), ['Not read: book.cards, 2 items.', 'Not read: shelf, one item.']);
});

test('A SECTION COPIED WHOLE HAS BEEN READ, so an adapter that spreads the export is never said to have left it', () => {
  const w = watched({ items: [{ id: 1 }], book: { accounts: [{}], cards: [{}] } });
  void { ...w.value };
  assert.deepEqual(w.unread(), [
    { section: 'book.accounts', items: 1 },
    { section: 'book.cards', items: 1 },
  ]);
  void JSON.stringify(w.value);
  assert.deepEqual(w.unread(), [], 'a section written out whole was said to be unread');
});

test('A MAP NAMING THREE OF FOUR SECTIONS: the dry run ends with one "Not read" line for the fourth, and writes nothing', async (t) => {
  const { kernel, io, out, said } = await tallybook(t);
  const code = await importCommand(['--map', 'sections.json', 'export.json', '--dry-run'], io, undefined, now, utc);
  assert.equal(code, 0, [...said, ...out].join(' | '));
  const nots = out.filter((l) => l.startsWith('Not read:'));
  assert.deepEqual(nots, ['Not read: shelf, 4 items.'], out.join(' | '));
  assert.equal(out.at(-1), 'Not read: shelf, 4 items.', 'the unread lines end the report');
  assert.ok(out.includes('Tasks: 3 would be added, 0 would be updated, 0 unchanged.'), out.join(' | '));
  assert.deepEqual(await imported(kernel, 'tasks', 'what'), [], 'a dry run wrote');
});

test('APPLIED, THE THREE SECTIONS ARRIVE and the fourth is still named, so the line is not the dry run alone', async (t) => {
  const { kernel, io, out, said } = await tallybook(t);
  const code = await importCommand(['--map', 'sections.json', 'export.json'], io, undefined, now, utc);
  assert.equal(code, 0, [...said, ...out].join(' | '));
  assert.deepEqual(await imported(kernel, 'tasks', 'what'), ['Book the kiln service', 'Renew the workshop lease', 'Send the October invoices']);
  assert.deepEqual(await imported(kernel, 'accounts', 'name'), ['Dollar card', 'Studio cash']);
  assert.deepEqual(await imported(kernel, 'people', 'name'), ['Mona Fathy']);
  assert.ok(out.includes('Not read: shelf, 4 items.'), out.join(' | '));
  assert.ok(!out.some((l) => /Not read: (items|people|book)/u.test(l)), `a section whose items arrived was said unread: ${out.join(' | ')}`);
});

test('WITH --strict, AN UNREAD SECTION REFUSES THE IMPORT before the record is asked anything', async (t) => {
  const { kernel, io, out, said } = await tallybook(t);
  const code = await importCommand(['--map', 'sections.json', 'export.json', '--strict'], io, undefined, now, utc);
  assert.equal(code, 1, [...said, ...out].join(' | '));
  assert.ok(said.includes('Not read: shelf, 4 items.'), said.join(' | '));
  assert.ok(said.some((l) => l.startsWith('With --strict, an import that leaves part of export.json unread writes nothing.')), said.join(' | '));
  assert.deepEqual(await imported(kernel, 'tasks', 'what'), [], '--strict wrote');
});
