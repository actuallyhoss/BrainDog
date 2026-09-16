/**
 * A sorted list pages.
 *
 * `list` with an `order` answered one page and no cursor, so a sorted list stopped at its limit with nothing to ask
 * for next. Its cursor is the last row's sort values and its id now, so every row comes back exactly once, in order,
 * whatever repeats or is missing in the sorted field.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 16, 12);

const THINGS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: {
    id: 'things',
    name: 'Things',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'rank', type: 'int' },
      { id: 'amount', type: 'money' },
      { id: 'kind', type: 'text' },
    ],
  } as never,
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([THINGS])).ok);
  const rows = [
    { name: 'a', rank: 3, kind: 'x', amount: { amount: 500, currency: 'GBP' } },
    { name: 'b', rank: 1, kind: 'y' },
    { name: 'c', kind: 'x', amount: { amount: 100, currency: 'GBP' } },
    { name: 'd', rank: 3, kind: "it's" },
    { name: 'e', rank: 2 },
    { name: 'f', rank: 1, kind: 'x', amount: { amount: 100, currency: 'GBP' } },
    { name: 'g' },
    { name: 'h', rank: 3, kind: 'y', amount: { amount: 900, currency: 'GBP' } },
  ];
  for (const fields of rows) assert.ok(k.create('things', fields, { actor: 'p_1' }).ok);
  return { k, sql };
}

type Page = { rows: Entry[]; cursor: string | null; matched: number };
const page = (r: unknown): Page => {
  const x = r as { ok: boolean; value: Page; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const ORDERS: { field: string; dir?: 'asc' | 'desc' }[][] = [
  [{ field: 'rank', dir: 'asc' }],
  [{ field: 'rank', dir: 'desc' }],
  [{ field: 'kind', dir: 'asc' }, { field: 'rank', dir: 'desc' }],
  [{ field: 'amount' }, { field: 'name', dir: 'asc' }],
  [{ field: 'seq', dir: 'asc' }],
];

test('A SORTED LIST PAGES, and the pages joined are the whole sorted answer, each row once', async () => {
  const { k, sql } = await record();
  for (const order of ORDERS)
    for (const limit of [1, 2, 3]) {
      const whole = page(k.list({ register: 'things', order, limit: 100 }));
      assert.equal(whole.cursor, null, 'the whole answer said there was more');

      const seen: string[] = [];
      let cursor: string | null = null;
      for (let i = 0; i < 20; i++) {
        const p: Page = page(k.list({ register: 'things', order, limit, cursor }));
        assert.equal(p.matched, 8);
        seen.push(...p.rows.map((r) => String(r.fields.name)));
        cursor = p.cursor;
        if (cursor === null) break;
      }
      assert.deepEqual(seen, whole.rows.map((r) => String(r.fields.name)), `${JSON.stringify(order)} at ${limit} a page`);
    }
  sql.close();
});

test('A CURSOR BELONGS TO ITS ORDER: one from the record order, another order or nowhere is refused', async () => {
  const { k, sql } = await record();
  const plain = page(k.list({ register: 'things', limit: 2 })).cursor;
  assert.ok(plain);
  const sorted = page(k.list({ register: 'things', limit: 2, order: [{ field: 'rank' }] })).cursor;
  assert.ok(sorted, 'a sorted page with more behind it handed back no cursor');

  const code = (r: unknown) => (r as { ok: boolean; refusal?: { code: string; at?: string } }).refusal;
  assert.equal(code(k.list({ register: 'things', limit: 2, cursor: plain, order: [{ field: 'rank' }] }))?.code, 'VALUE_MALFORMED');
  assert.equal(code(k.list({ register: 'things', limit: 2, cursor: sorted, order: [{ field: 'name' }] }))?.code, 'VALUE_MALFORMED');
  assert.equal(code(k.list({ register: 'things', limit: 2, cursor: sorted }))?.code, 'VALUE_MALFORMED');
  assert.equal(code(k.list({ register: 'things', limit: 2, cursor: '~not-a-cursor', order: [{ field: 'rank' }] }))?.at, 'cursor');
  sql.close();
});

test('A CURSOR THE RECORD DID NOT MINT IS REFUSED IN THE RECORD\'S OWN ORDER TOO, rather than answered with the first page', async () => {
  const { k, sql } = await record();
  for (const cursor of ['junk', '5', 'a|b', '2026-09-16T12:00:00.000Z', '2026-09-16T12:00:00.000Z|'])
    assert.equal((k.list({ register: 'things', limit: 2, cursor }) as { refusal?: { code: string } }).refusal?.code, 'VALUE_MALFORMED', cursor);

  // And the cursors it does mint still walk the whole list, once each.
  const seen: string[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 20; i++) {
    const p: Page = page(k.list({ register: 'things', limit: 3, cursor }));
    seen.push(...p.rows.map((r) => String(r.fields.name)));
    cursor = p.cursor;
    if (cursor === null) break;
  }
  assert.deepEqual([...seen].sort(), ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
  sql.close();
});
