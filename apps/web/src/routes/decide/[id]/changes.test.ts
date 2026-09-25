/**
 * What a `rowset` proposal draws on Decide: a diff for prose, a before and after for the rest, and
 * nothing for a row it would create.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { diffRows } from 'braindog-render';

import { REGISTERS, display } from '../../../lib/record/api.ts';
import { ROWS } from '../../../lib/record/fixtures/sample.ts';
import { QUESTIONS, ROWSETS } from '../../../lib/record/fixtures/sample.ts';
import { LONG, isLong, updatesOf } from './changes.ts';

const registers = {
  notes: {
    title: 'name',
    fields: [
      { id: 'name', type: 'text' },
      { id: 'body', type: 'document', label: 'Body' },
      { id: 'lane', type: 'enum', label: 'Status' },
      { id: 'blurb', type: 'text' },
    ],
  },
};
const rows = { notes: [{ seq: 1, version: 3, fields: { name: 'Kiln', body: 'one\ntwo\nthree', lane: 'building', blurb: 'short' } }] };
const show = (_: string, __: string, v: unknown) => (v === undefined || v === null ? null : String(v));

test('a document field is drawn with the render package diff, and any other field before and after', () => {
  const [u] = updatesOf(
    { register: 'notes', rows: [{ at: 'notes#1', version: 3, patch: { body: 'one\n2\nthree', lane: 'earning' } }] },
    registers,
    rows,
    show,
  );
  assert.ok(u);
  assert.equal(u.title, 'Kiln');
  const [body, lane] = u.changes;
  assert.ok(body?.long);
  assert.deepEqual(body.block.rows.map((r) => r.cells[0]), diffRows('one\ntwo\nthree', 'one\n2\nthree'));
  assert.equal(body.block.kind, 'diff');
  assert.deepEqual(lane, { field: 'lane', label: 'Status', long: false, before: 'building', after: 'earning' });
});

test('a text is prose once it spans lines or runs long', () => {
  assert.equal(isLong('text', 'short', 'shorter'), false);
  assert.equal(isLong('text', 'a', 'a\nb'), true);
  assert.equal(isLong('text', 'x'.repeat(LONG + 1), 'y'), true);
  assert.equal(isLong('document', '', ''), true);
  assert.equal(isLong('enum', 'x'.repeat(500), 'y'), false);
});

test('a row it would create, a row the record does not hold and a field that would not move draw nothing', () => {
  const out = updatesOf(
    {
      register: 'notes',
      rows: [
        { name: 'A new one' },
        { at: 'notes#9', version: 1, patch: { lane: 'earning' } },
        { at: 'notes#1', version: 3, patch: { blurb: 'short' } },
      ],
    },
    registers,
    rows,
    show,
  );
  assert.deepEqual(out, []);
  assert.deepEqual(updatesOf(undefined, registers, rows, show), []);
});

test('THE SAMPLE PROPOSAL CHANGES A DOCUMENT AND A STATUS, on an open question the queue shows', () => {
  const q = QUESTIONS.find((x) => ROWSETS[x.id]);
  assert.ok(q, 'no open question carries rows');
  const updates = updatesOf(ROWSETS[q.id], REGISTERS, ROWS, (r, f, v) => display(r, f, v));
  const kinds = updates.flatMap((u) => u.changes.map((c) => c.long));
  assert.ok(kinds.includes(true), 'no field is drawn as a diff');
  assert.ok(kinds.includes(false), 'no field is drawn before and after');
  for (const u of updates) for (const c of u.changes) if (c.long) assert.ok(c.block.rows.some((r) => /^[-+] /u.test(r.cells[0] ?? '')), `${u.at} ${c.field} diffs to no change`);
});

test('an instant the formatter left alone reads as a day', async () => {
  const { dated } = await import('./changes.ts');
  assert.equal(dated('2026-09-16T15:23:18.843Z'), '16 Sep 2026');
  assert.equal(dated('people#2'), 'people#2');
  assert.equal(dated(null), null);
});

test('a typed token in a diffed field reads as what it draws, and one that does not parse stays', async () => {
  const { diffBlock, filled } = await import('./changes.ts');
  assert.equal(filled('Target {{money:1840000 GBP}} by May'), 'Target GBP 18,400.00 by May');
  assert.equal(filled('{{money:12 gbp}}'), '{{money:12 gbp}}');
  const lines = diffBlock('Raise {{money:1840000 GBP}}\nkeep', 'Raise {{money:2000000 GBP}}\nkeep').rows.map((r) => r.cells[0] ?? '');
  assert.ok(lines.every((l) => !l.includes('{{')), lines.join(' | '));
});

test('THE SAMPLE DIFFS DRAW NO RAW TOKEN', () => {
  for (const q of QUESTIONS) {
    for (const u of updatesOf(ROWSETS[q.id], REGISTERS, ROWS, (r, f, v) => display(r, f, v))) {
      for (const c of u.changes) if (c.long) for (const r of c.block.rows) assert.ok(!/\{\{/u.test(r.cells[0] ?? ''), `${q.id} ${u.at}: ${r.cells[0]}`);
    }
  }
});
