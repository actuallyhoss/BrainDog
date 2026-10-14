import { test } from 'node:test';
import assert from 'node:assert/strict';

import { adoptImport, importLine, importLists, markedLine, readImports, words, type ImportRow } from './imports.ts';

/* Noon UTC, so the day reads the same in any zone a test runs in. */
const NOW = Date.parse('2026-10-13T12:00:00Z');

const row = (more: Partial<ImportRow> = {}): ImportRow => ({
  run: 'run-a',
  at: '2026-09-28T12:00:00.000Z',
  lists: [
    { list: 'Orchard Notes', rows: 200 },
    { list: 'Kettle Jobs', rows: 12 },
    { list: 'Lantern Bills', rows: 5 },
  ],
  rows: 217,
  adopted: null,
  ...more,
});

const answering = (out: unknown) => ({ call: async () => out });

test('a run that read the inbox says so under its agent', () => {
  assert.equal(markedLine({ agent: 'Wren Helper', asking: { from: 'the inbox', at: '2026-10-13T09:00:00Z' } }), 'Asking about everything in this run, because it read the inbox.');
});

test('a run that read an import says so in the record\'s words', () => {
  assert.equal(markedLine({ agent: 'Wren Helper', asking: { from: 'an import you have not said is yours.', at: '2026-10-13T09:00:00Z' } }), 'Asking about everything in this run, because it read an import you have not said is yours.');
});

test('no line when nothing marked the run, or the host sends no mark', () => {
  assert.equal(markedLine({ agent: 'Wren Helper', asking: null }), null);
  assert.equal(markedLine({ agent: 'Wren Helper' }), null);
  assert.equal(markedLine({ agent: 'Wren Helper', asking: { from: '  ' } }), null);
  assert.equal(markedLine(null), null);
});

test('an import he has not answered asks, and each answer says what he chose', () => {
  assert.equal(importLine(row(), NOW), 'You brought in 217 entries into 3 lists on 28 Sep. Is all of it your own?');
  assert.equal(importLine(row({ adopted: true }), NOW), words.yours);
  assert.equal(importLine(row({ adopted: false }), NOW), 'Treated as outside text: an agent that reads it asks first.');
  assert.equal(importLine(row({ rows: 1, lists: [{ list: 'Kettle Jobs', rows: 1 }], at: '2025-12-30T12:00:00Z' }), NOW), 'You brought in 1 entry into 1 list on 30 Dec 2025. Is all of it your own?');
  assert.equal(importLine(row({ rows: 2527 }), NOW), 'You brought in 2,527 entries into 3 lists on 28 Sep. Is all of it your own?');
});

test('the lists are said by the names the record sent', () => {
  assert.equal(importLists(row()), 'Orchard Notes, Kettle Jobs and Lantern Bills');
  assert.equal(importLists(row({ lists: [{ list: 'Kettle Jobs', rows: 3 }] })), 'Kettle Jobs');
});

test('a malformed import is dropped and the rest are read', async () => {
  const good = row();
  const out = await readImports(
    answering({ ok: true, value: { imports: [good, { run: 'run-b', at: '2026-09-29T12:00:00Z', rows: -1, lists: [], adopted: null }, { run: 'run-c', at: '2026-09-30T12:00:00Z', rows: 3, lists: [{ list: 7, rows: 3 }] }, { ...good, run: 'run-d', adopted: 'yes' }, { ...good, run: 'run-e', adopted: undefined }] } }),
  );
  assert.deepEqual(
    out?.map((r) => [r.run, r.adopted]),
    [
      ['run-a', null],
      ['run-e', null],
    ],
  );
});

test('a host with no such call, or a refusal, reads as nothing to draw', async () => {
  assert.equal(await readImports(answering({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'No such call.' } })), null);
  assert.equal(await readImports(answering({ ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', at: 'imports', fix: 'Not here.' } })), null);
  assert.equal(await readImports(answering({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'Only the owner.' } })), null);
  assert.equal(await readImports({ call: async () => { throw new Error('offline'); } }), null);
  assert.equal(await readImports(answering({ ok: true, value: {} })), null);
});

test('an answer goes by the run, and a refusal carries the record\'s sentence', async () => {
  const sent: unknown[] = [];
  const ok = await adoptImport({ call: async (name, args) => (sent.push([name, args]), { ok: true, value: {} }) }, 'run-a', true);
  assert.deepEqual(ok, { ok: true });
  assert.deepEqual(sent, [['importAdopt', { run: 'run-a', yes: true }]]);
  assert.deepEqual(await adoptImport(answering({ ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'That import is not on the record any more.' } }), 'run-a', false), { ok: false, fix: 'That import is not on the record any more.' });
  assert.deepEqual(await adoptImport({ call: async () => { throw new Error('offline'); } }, 'run-a', false), { ok: false, fix: 'That could not be done just now. Nothing was changed.' });
});
