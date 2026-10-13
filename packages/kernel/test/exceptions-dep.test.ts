/**
 * What went quiet, handed to a page through the record's own deps (`PageDeps.exceptions`, ENG-B13).
 *
 * `exceptions-source.test.ts` holds the source to its columns and its refusals. This file holds the wire: a record
 * opened the ordinary way hands `openExceptions` to every page it draws, so a block over `exceptions` on any page
 * draws without the host adding a line, and a record with nothing quiet draws it empty instead of refusing it as not
 * in this build.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 12);
const DAY = 86_400_000;
const ago = (days: number): string => new Date(NOW - days * DAY).toISOString();

const QUIET = { kind: 'table', source: 'exceptions', columns: [{ field: 'subject' }, { field: 'since' }, { field: 'was' }] };

const SEED: Declaration[] = [
  { id: 'register.numbers', kind: 'register', body: { id: 'numbers', name: 'Numbers', title: 'what', fields: [{ id: 'what', type: 'text' }] } as never },
  /* TWO PAGES, neither of them about what went quiet: the block is drawn on whichever page names it. */
  { id: 'page.desk', kind: 'page', body: { page: 'desk', title: 'Desk', blocks: [{ kind: 'table', source: 'register.numbers', columns: [{ field: 'what' }] }, QUIET] } as never },
  { id: 'page.week', kind: 'page', body: { page: 'week', title: 'Week', blocks: [QUIET] } as never },
];

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install(SEED);
  assert.ok(installed.ok, JSON.stringify(installed));
  return { k, sql };
}

let n = 0;
/** One row on Numbers, made `days` ago, as a write that day would have left it. */
function row(sql: NodeSql, days: number): void {
  const id = `01KQDEP${String(++n).padStart(19, '0')}`;
  sql.exec('INSERT INTO entry (id, register, seq, fields, version, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)', id, 'numbers', n, JSON.stringify({ what: 'a reading' }), ago(days), ago(days));
}

const quiet = (k: Kernel, page: string) => {
  const read = k.page(page);
  assert.ok(read.ok, JSON.stringify(read));
  const block = read.value.blocks.find((b) => b.source === 'exceptions');
  assert.ok(block, `${page} holds no block over what went quiet`);
  return block;
};

test('NUMBERS TOOK ROWS FIVE OF FOURTEEN DAYS AND NONE FOR THREE: any page that names the block draws one row', async () => {
  const { k, sql } = await record();
  /* A row a day for five days, the newest four days back, so three whole days have gone by with none. */
  [8, 7, 6, 5, 4].forEach((d) => row(sql, d));
  for (const page of ['desk', 'week']) {
    const block = quiet(k, page);
    assert.deepEqual(block.refusals, [], page);
    assert.equal(block.rows!.length, 1, page);
    const fields = block.rows![0]!.fields;
    assert.equal(fields.subject, 'Numbers');
    assert.equal(fields.since, ago(4).slice(0, 10));
    assert.equal(fields.was, 'Written to on 5 of 14 days');
  }
  /* AND THE BLOCK BESIDE IT ON THE SAME PAGE DRAWS AS IT DID. */
  const desk = k.page('desk');
  assert.ok(desk.ok);
  assert.equal(desk.value.blocks.find((b) => b.source === 'register.numbers')!.rows!.length, 5);
  sql.close();
});

test('A RECORD WITH NOTHING QUIET DRAWS THE BLOCK EMPTY, and it is not refused as missing from this build', async () => {
  const { k, sql } = await record();
  for (const page of ['desk', 'week']) {
    const block = quiet(k, page);
    assert.deepEqual(block.refusals, [], page);
    assert.deepEqual(block.rows, [], page);
    assert.equal(block.matched, 0, page);
  }
  sql.close();
});

test('WHEN A ROW ARRIVES THE PAGE NO LONGER DRAWS IT, on the next read', async () => {
  const { k, sql } = await record();
  [8, 7, 6, 5, 4].forEach((d) => row(sql, d));
  assert.equal(quiet(k, 'week').rows!.length, 1);
  row(sql, 0);
  assert.equal(quiet(k, 'week').rows!.length, 0);
  sql.close();
});
