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
import { DatabaseSync } from 'node:sqlite';

import { openRecord } from '@braindog/kernel';
import { NOW, installSeed } from '@braindog/seed';

import './fixtures/fill.ts';
import { toSegments } from './blocks.ts';
import { blockOf as liveBlockOf } from './page-live.ts';
import type { BlockResult } from './api.ts';

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

/** A record in memory over `node:sqlite`, bound the way the kernel's own tests bind one. */
function openSqlite(): Parameters<typeof openRecord>[0] {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    exec: (text: string, ...params: unknown[]) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  } as unknown as Parameters<typeof openRecord>[0];
}

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
  const out = cellsOf(authored('comparison', [{ cells: ['C:\\Work', 'a \\| b', 'end'] }]))[0];
  assert.deepEqual(out, ['C:\\Work', 'a \\| b', 'end']);
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

/**
 * The estate page's "points at" block, drawn from a seeded record of this file's own with one domain's `points_at`
 * written as `value`.
 *
 * A RECORD OF ITS OWN, BECAUSE THE SAMPLE CANNOT BE WRITTEN TO. These two changed a row in the fixture's `ROWS` and
 * read the page back, which reached the page while the sample drew it with a browser engine over those rows. Since
 * the app has had one engine the fixture's `page` asks a kernel seeded once and never written to (`fixtures/readers.ts`), so the value is
 * written to a record here and the page drawn from it the way a live page is (`page-live.ts`).
 */
async function pointsAtWith(value: string): Promise<BlockResult> {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  assert.ok((await installSeed(k)).ok, 'the seed did not install');
  const listed = k.list({ register: 'services', where: 'kind is domain', limit: 1 });
  const domain = listed.ok ? listed.value.rows[0] : undefined;
  assert.ok(domain, 'the seed needs a domain for this to mean anything');
  const wrote = k.update('services', `services#${domain.seq}`, { points_at: value }, { actor: 'p_owner' });
  assert.ok(wrote.ok, JSON.stringify(wrote));
  const opened = k.page('estate');
  assert.ok(opened.ok, JSON.stringify(opened));
  const block = opened.value.blocks.find((b) => String((b as { heading?: unknown }).heading ?? '').includes('points at'));
  assert.ok(block, 'the estate page no longer draws the block about what each domain points at');
  return liveBlockOf(block as never, new Map(), NOW);
}

test('a pipe in a register value does not delete the block', async () => {
  // The dialect separates cells on `|`, so one pipe in a free-text field made the row a cell too
  // wide, failed the arity check, and degraded the WHOLE BLOCK to a fence the app then dropped on
  // the floor. `redirect | kiln.example` in a domain's target field deleted the block it was in.
  const block = await pointsAtWith('redirect | kiln.example');
  const segs = toSegments(block);
  assert.deepEqual([...new Set(segs.map((x) => x.type))], ['block'], 'the block degraded');
  const cells = segs.flatMap((seg) => ('rows' in seg ? (seg.rows as { cells: string[] }[]) : [])).map((r) => r.cells);
  assert.ok(cells.length > 0, 'the rows vanished');
  assert.ok(
    cells.some((c) => c.some((v) => v === 'redirect | kiln.example')),
    'the value did not survive the round trip intact',
  );
});

test('a backslash in a register value survives too', async () => {
  // `String.raw` because a plain literal drops an unknown escape: 'C:\Work' IS 'C:Work' in
  // JavaScript, so the obvious version of this test compares a string to itself and proves nothing.
  const value = String.raw`C:\\Work\\kiln`;
  assert.ok(value.includes('\\'), 'the fixture has to actually contain a backslash');
  const segs = toSegments(await pointsAtWith(value));
  const cells = segs.flatMap((seg) => ('rows' in seg ? (seg.rows as { cells: string[] }[]) : [])).map((r) => r.cells);
  assert.ok(cells.some((c) => c.some((v) => v === value)), 'the backslash did not round-trip');
});
