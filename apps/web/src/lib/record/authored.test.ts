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

import { toSegments } from './blocks.ts';
import type { BlockResult } from './api.ts';

/** The minimum a `BlockResult` needs to be rendered, with no register behind it. */
const authored = (kind: string, rows: { cells: string[]; tone?: 'good' | 'warn' | 'bad' | 'info' }[]): BlockResult =>
  ({
    kind,
    heading: 'Test',
    authored: rows,
    columns: [],
    entries: [],
    rows: [],
    total: 0,
    drawn: true,
    stale_at: '2026-09-05T00:00:00.000Z',
  }) as unknown as BlockResult;

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
