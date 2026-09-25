/**
 * Authored rows: the half of the block format that had nowhere to live.
 *
 * 05 §2 calls `table` "the one kind bound to a `source:` register rather than to authored rows",
 * which makes authored rows the norm and the register-bound block the exception. The declaration
 * carried a `body` string and nothing else, so three of the sixteen kinds could not be delivered at
 * all: `comparison` is defined as "a small table you write yourself", and a `quote` and a `tree` are
 * by definition not projections of anything.
 *
 * What is checked here is the round trip. A cell goes in as a string somebody typed and has to come
 * back out of the parser as the same string — which is only true if the separator and the escape
 * character are escaped, in that order.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './fixtures/fill.ts';
import { toSegments } from './blocks.ts';
import { page } from './fixtures/readers.ts';
import { ROWS } from './fixtures/sample.ts';
import type { BlockResult } from './api.ts';
import type { Fields } from './schema.ts';

/** The minimum a `BlockResult` needs to be rendered, with no register behind it. */
const authored = (kind: string, rows: { cells: string[]; tone?: 'good' | 'warn' | 'bad' | 'info' }[]): BlockResult =>
  ({
    kind,
    heading: 'Test',
    authored: rows,
    columns: [],
    entries: [],
    matched: [],
    rows: [],
    total: 0,
    drawn: true,
    stale_at: '2026-09-05T00:00:00.000Z',
  }) as unknown as BlockResult;

/** Put a field back exactly as it was, including not being there at all. */
const restore = (fields: Fields, key: string, was: Fields[string] | undefined): void => {
  if (was === undefined) delete fields[key];
  else fields[key] = was;
};

/** Every cell of every row the parser gave back. */
const cellsOf = (block: BlockResult): string[][] =>
  toSegments(block).flatMap((seg) => ('rows' in seg ? (seg.rows as { cells: string[] }[]).map((r) => r.cells) : []));

/* ── the round trip ──────────────────────────────────────────────────────── */

test('a cell comes back out as the string that went in', () => {
  assert.deepEqual(cellsOf(authored('comparison', [{ cells: ['Per seat', 'GBP 90', 'per designer'] }]))[0], [
    'Per seat',
    'GBP 90',
    'per designer',
  ]);
});

test('a cell containing a pipe survives, and does not become two cells', () => {
  // The whole reason the author does not write the separator: `a | b` inside one cell is a value,
  // and splitting it is a column that appeared out of nowhere.
  const out = cellsOf(authored('comparison', [{ cells: ['either | or', 'yes'] }]))[0];
  assert.deepEqual(out, ['either | or', 'yes']);
});

test('a cell containing a backslash survives, including next to a pipe', () => {
  // Escaping the pipe first would double the backslash it just introduced, turning one literal pipe
  // into a backslash and a column break. Backslash first is the only order that round-trips.
  const out = cellsOf(authored('comparison', [{ cells: ['C:\\Repos', 'a \\| b', 'end'] }]))[0];
  assert.deepEqual(out, ['C:\\Repos', 'a \\| b', 'end']);
});

test('an empty cell is a cell, not a missing one', () => {
  const out = cellsOf(authored('comparison', [{ cells: ['left', '', 'right'] }]))[0];
  assert.equal(out?.length, 3);
  assert.equal(out?.[1], '');
});

/* ── the shape ───────────────────────────────────────────────────────────── */

test('several rows are several rows', () => {
  const out = cellsOf(
    authored('comparison', [{ cells: ['a', '1'] }, { cells: ['b', '2'] }, { cells: ['c', '3'] }]),
  );
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((r) => r[0]), ['a', 'b', 'c']);
});

test('a tone is carried on the kinds that take one, and dropped on the kinds that do not', () => {
  // `KINDS[kind].tone` gates it. Appending a tone cell to a kind with no tone would be an extra
  // column, which shifts every cell after it.
  const toned = cellsOf(authored('chips', [{ cells: ['', '3', 'open'], tone: 'good' }]))[0];
  assert.ok(toned && toned.length >= 3, 'chips takes a tone, so the cells survive it');

  const untoned = cellsOf(authored('spec', [{ cells: ['Label', 'Value', 'Note'], tone: 'bad' }]))[0];
  assert.deepEqual(untoned, ['Label', 'Value', 'Note'], 'spec has no tone, so none was appended');
});

/* ── the refusal ─────────────────────────────────────────────────────────── */

test('a block that declares BOTH a source and authored rows renders neither', () => {
  // Picking one would be a silent decision about where a block's content comes from, taken on
  // behalf of whoever wrote the declaration. The same argument as the `where:` evaluator: a
  // declaration must not be quietly reinterpreted.
  const both = {
    ...authored('comparison', [{ cells: ['a', 'b'] }]),
    register: 'obligations',
  } as unknown as BlockResult;
  assert.deepEqual(cellsOf(both), []);
});

/* ── a value somebody typed cannot break the block it is in ──────────────── */

test('a pipe in a register value does not delete the block', () => {
  // The dialect separates cells on `|`, so one pipe in a free-text field made the row a cell too
  // wide, failed the arity check, and degraded the WHOLE BLOCK to a fence the app then dropped on
  // the floor. `redirect | kiln.example` in a domain's target field deleted the block it was in.
  const row = (ROWS.services ?? []).find((r) => r.fields.kind === 'domain');
  assert.ok(row, 'the seed needs a domain for this to mean anything');
  const before = row.fields.points_at;
  row.fields.points_at = 'redirect | kiln.example';
  try {
    const block = page('estate')?.blocks.find((b) => b.heading?.includes('points at'));
    assert.ok(block);
    const segs = toSegments(block);
    assert.deepEqual([...new Set(segs.map((x) => x.type))], ['block'], 'the block degraded');
    const cells = segs.flatMap((seg) => ('rows' in seg ? (seg.rows as { cells: string[] }[]) : [])).map((r) => r.cells);
    assert.ok(cells.length > 0, 'the rows vanished');
    assert.ok(
      cells.some((c) => c.some((v) => v === 'redirect | kiln.example')),
      'the value did not survive the round trip intact',
    );
  } finally {
    restore(row.fields, 'points_at', before);
  }
});

test('a backslash in a register value survives too', () => {
  // `String.raw` because a plain literal drops an unknown escape: 'C:\Repos' IS 'C:Repos' in
  // JavaScript, so the obvious version of this test compares a string to itself and proves nothing.
  const value = String.raw`C:\\Repos\\kiln`;
  assert.ok(value.includes('\\'), 'the fixture has to actually contain a backslash');
  const row = (ROWS.services ?? []).find((r) => r.fields.kind === 'domain');
  assert.ok(row);
  const before = row.fields.points_at;
  row.fields.points_at = value;
  try {
    const block = page('estate')?.blocks.find((b) => b.heading?.includes('points at'));
    const segs = toSegments(block!);
    const cells = segs.flatMap((seg) => ('rows' in seg ? (seg.rows as { cells: string[] }[]) : [])).map((r) => r.cells);
    assert.ok(cells.some((c) => c.some((v) => v === value)), 'the backslash did not round-trip');
  } finally {
    restore(row.fields, 'points_at', before);
  }
});
