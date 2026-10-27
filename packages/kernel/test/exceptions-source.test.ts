/**
 * `exceptions` as a source a page names (`src/sources/exceptions.ts`): what went quiet on a record, drawn as an
 * ordinary block. One row a thing that stopped, with what a person calls it, the day it was last there and what it was
 * doing before, in words. A record with nothing quiet draws the block empty and is not refused. It belongs to no list,
 * so a block over it is named as a read of the whole record and only a reader of the whole record is shown it.
 *
 * The rows are planted as the kernel leaves them, as `exceptions.test.ts` does, because the detectors read what the
 * tables hold; the block is then read through the record's own wiring (`k.block`, `k.page`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sourceModule } from '../src/sources/index.ts';
import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { registersOfBlock, WHOLE_RECORD, type PageBlock } from '../src/pages.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 12);
const DAY = 86_400_000;
const ago = (days: number): string => new Date(NOW - days * DAY).toISOString();

const SEED: Declaration[] = [
  { id: 'register.numbers', kind: 'register', body: { id: 'numbers', name: 'Numbers', title: 'what', fields: [{ id: 'what', type: 'text' }] } as never },
  { id: 'register.notes', kind: 'register', body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text' }] } as never },
  {
    id: 'page.quiet',
    kind: 'page',
    body: { page: 'quiet', title: 'Quiet', blocks: [{ kind: 'table', source: 'exceptions', columns: [{ field: 'subject' }, { field: 'since' }, { field: 'was' }] }] } as never,
  },
];

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install(SEED);
  assert.ok(installed.ok, JSON.stringify(installed));
  return { k, sql };
}

let n = 0;
/** One row on a list, made `days` ago, as a write that day would have left it. */
function row(sql: NodeSql, list: string, days: number): void {
  const id = `01KQUIET${String(++n).padStart(18, '0')}`;
  sql.exec('INSERT INTO entry (id, register, seq, fields, version, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)', id, list, n, JSON.stringify({ what: 'a reading' }), ago(days), ago(days));
}

/** Numbers took a row a day for five days and none for the four since. */
const quietNumbers = (sql: NodeSql): void => [8, 7, 6, 5, 4].forEach((d) => row(sql, 'numbers', d));

const BLOCK = { kind: 'table', source: 'exceptions', columns: [{ field: 'subject' }, { field: 'since' }, { field: 'was' }] } as PageBlock;

test('A QUIET LIST IS ONE ROW, with its name, the day it was last written to and what it was before, in words', async () => {
  const { k, sql } = await record();
  quietNumbers(sql);
  const read = k.block(BLOCK);
  assert.deepEqual(read.refusals, []);
  assert.equal(read.matched, 1);
  const fields = read.rows![0]!.fields;
  assert.equal(fields.subject, 'Numbers');
  assert.equal(fields.since, ago(4).slice(0, 10));
  assert.equal(fields.was, 'Written to on 5 of 14 days');
  assert.equal(fields.kind, 'list');
  sql.close();
});

test('A PAGE DRAWS IT AS AN ORDINARY BLOCK, and nothing a person reads on the row is an id', async () => {
  const { k, sql } = await record();
  quietNumbers(sql);
  const page = k.page('quiet');
  assert.ok(page.ok, JSON.stringify(page));
  const block = page.value.blocks.find((b) => b.source === 'exceptions')!;
  assert.deepEqual(block.refusals, []);
  assert.equal(block.rows!.length, 1);
  for (const field of ['subject', 'since', 'was']) assert.doesNotMatch(String(block.rows![0]!.fields[field]), /[0-9A-HJKMNP-TV-Z]{26}|numbers/u, field);
  sql.close();
});

test('A RECORD WITH NOTHING QUIET DRAWS THE BLOCK EMPTY, and it is not refused', async () => {
  const { k, sql } = await record();
  const read = k.block(BLOCK);
  assert.deepEqual([read.rows, read.matched, read.refusals], [[], 0, []]);
  /* A LIST WRITTEN TO ONCE WAS NEVER ARRIVING, so its silence says nothing. */
  row(sql, 'notes', 9);
  assert.equal(k.block(BLOCK).matched, 0);
  sql.close();
});

test('WHEN A ROW ARRIVES THE BLOCK NO LONGER DRAWS IT, on the next read', async () => {
  const { k, sql } = await record();
  quietNumbers(sql);
  assert.equal(k.block(BLOCK).matched, 1);
  row(sql, 'numbers', 0);
  assert.equal(k.block(BLOCK).matched, 0);
  sql.close();
});

test('IT BELONGS TO NO LIST, so only a reader of the whole record is shown it', () => {
  assert.equal(sourceModule('exceptions')?.whole, true);
  assert.deepEqual(registersOfBlock(BLOCK, () => null), [WHOLE_RECORD]);
});

test('IT NAMES EVERY LIST IT WATCHES, so a reader held from one of them is held from the block', async () => {
  const { k, sql } = await record();
  /* A ROW HERE IS A LIST'S NAME AND ITS NEWEST ROW. `*` alone is passed by a reader with no ceiling whose one list is
     held to `append`, and by a grant narrowed to some of a list's rows; the record checks her against each name. */
  const named = k.blockRegisters(BLOCK);
  assert.ok(named.includes(WHOLE_RECORD));
  for (const list of ['numbers', 'notes']) assert.ok(named.includes(list), list);
  assert.ok(!named.includes('session'), 'the list of runs is not watched');
  /* AND NO OTHER SOURCE IS NAMED ANY WIDER THAN IT WAS. */
  assert.deepEqual(k.blockRegisters({ kind: 'table', source: 'signs' } as PageBlock), [WHOLE_RECORD]);
  sql.close();
});

test('A where: NARROWS IT, and a column or an order it does not have is refused in its own words', async () => {
  const { k, sql } = await record();
  quietNumbers(sql);
  assert.equal(k.block({ ...BLOCK, where: 'kind is list' } as PageBlock).matched, 1);
  assert.equal(k.block({ ...BLOCK, where: 'kind is door' } as PageBlock).matched, 0);
  const column = k.block({ kind: 'table', source: 'exceptions', columns: [{ field: 'cause' }] } as PageBlock);
  assert.deepEqual(column.refusals.map((r) => [r.code, r.at]), [['FIELD_UNKNOWN', 'columns']]);
  const order = k.block({ ...BLOCK, order: [{ field: 'since' }] } as PageBlock);
  assert.deepEqual(order.refusals.map((r) => [r.code, r.at]), [['DECLARATION_INVALID', 'order']]);
  sql.close();
});

test('A HOST THAT HANDS NO READ OF THEM IS TOLD SO ON THE BLOCK, and the source never throws', () => {
  const base = { ...BLOCK, rows: [], matched: 0, refusals: [] } as never;
  const read = sourceModule('exceptions')!.read({ ctx: { nowMs: NOW } } as never, BLOCK, base, (...more) => [...more], {} as never);
  assert.deepEqual(read.refusals.map((r) => r.code), ['NOT_IN_THIS_BUILD']);
});
