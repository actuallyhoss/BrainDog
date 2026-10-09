/**
 * A list's own order (PGS-B06 job a).
 *
 * `list` with no `order` came back by last change, so his Ledger opened on 13 July: an import had touched July's
 * entries last, and December sat under them. A list may now declare `order: { field, dir }`, and a read that names no
 * order comes back in it, paged by the same key. A list that declares none comes back newest made first, which an
 * edit does not move. An order the caller names still wins.
 *
 * RED UNTIL THE KERNEL LINES LAND (batch 50, blocked to the kernel's owner): `RegisterDecl.order`, the declared order
 * as `list`'s default, and `created_at` in place of `updated_at` for a list that declares none.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { TRANSACTIONS_REGISTER } from '../../seed/src/modules/money/lists/transactions.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 9);

const list = (id: string, extra: Record<string, unknown>): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: {
    id,
    name: id,
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'on', type: 'day' },
      { id: 'amount', type: 'money' },
    ],
    ...extra,
  } as never,
});

/** A ledger in the order an import writes it: July, then December, then July again, then a day left empty. */
const DAYS = [
  ['Coffee', '2026-07-13'],
  ['Rent', '2026-12-31'],
  ['Lunch', '2026-07-14'],
  ['Fuel', '2026-12-30'],
  ['Cash', null],
  ['Books', '2026-09-01'],
] as const;

async function record(extra: Record<string, unknown>): Promise<{ k: Kernel; sql: NodeSql; made: Entry[] }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  const put = await k.install([list('ledger', extra)]);
  assert.ok(put.ok, JSON.stringify(put));
  const made: Entry[] = [];
  for (const [what, on] of DAYS) {
    clock.advance(60_000);
    const got = k.create('ledger', on === null ? { what } : { what, on }, { actor: 'p_1' });
    assert.ok(got.ok, JSON.stringify(got));
    made.push(got.value);
  }
  /* AND THE IMPORT TOUCHES JULY LAST, which is what put 13 July at the top of his Ledger. */
  clock.advance(60_000);
  assert.ok(k.write('ledger', made[0]!.id, { what: 'Coffee, Bridge St' }, { actor: 'p_1' }).ok);
  return { k, sql, made };
}

type Page = { rows: Entry[]; cursor: string | null; matched: number };
const page = (r: unknown): Page => {
  const x = r as { ok: boolean; value: Page; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};
const whats = (rows: Entry[]) => rows.map((r) => String(r.fields.what));

/** Every page of a read that names no order, two at a time, handing each cursor back as it came. */
function walk(k: Kernel, extra: Record<string, unknown> = {}): string[] {
  const seen: string[] = [];
  let cursor: string | null = null;
  do {
    const p = page(k.list({ register: 'ledger', limit: 2, ...extra, ...(cursor === null ? {} : { cursor }) }));
    seen.push(...whats(p.rows));
    cursor = p.cursor;
    /* A CURSOR THAT HANDS BACK A PAGE ALREADY READ WOULD WALK FOREVER, so the walk fails rather than hangs. */
    assert.ok(seen.length <= DAYS.length, `the pages repeat: ${seen.join(', ')}`);
  } while (cursor !== null);
  return seen;
}

test('THE DECLARED ORDER IS THE DEFAULT: newest day first, an empty day last, whatever changed last', async () => {
  const { k, sql } = await record({ order: { field: 'on', dir: 'desc' } });
  const first = page(k.list({ register: 'ledger' }));
  assert.deepEqual(whats(first.rows), ['Rent', 'Fuel', 'Books', 'Lunch', 'Coffee, Bridge St', 'Cash']);
  assert.notEqual(first.rows[0]!.fields.on, '2026-07-13', 'it no longer opens on 13 July');
  sql.close();
});

test('AND IT PAGES BY THE SAME KEY: every entry once, in the declared order, with the cursor handed back alone', async () => {
  const { k, sql } = await record({ order: { field: 'on', dir: 'desc' } });
  assert.deepEqual(walk(k), ['Rent', 'Fuel', 'Books', 'Lunch', 'Coffee, Bridge St', 'Cash']);
  sql.close();
});

test('LOWEST FIRST WHEN IT SAYS asc, and an order the caller names still wins over the declared one', async () => {
  const asc = await record({ order: { field: 'on', dir: 'asc' } });
  assert.deepEqual(whats(page(asc.k.list({ register: 'ledger' })).rows), ['Coffee, Bridge St', 'Lunch', 'Books', 'Fuel', 'Rent', 'Cash']);
  asc.sql.close();
  /* AN ORDER THAT SAYS NO WAY READS LOWEST FIRST, as `declare.ts` admits it, and not highest first as a read's own
     order with no `dir` does. */
  const bare = await record({ order: { field: 'on' } });
  assert.deepEqual(whats(page(bare.k.list({ register: 'ledger' })).rows), ['Coffee, Bridge St', 'Lunch', 'Books', 'Fuel', 'Rent', 'Cash']);
  bare.sql.close();
  const { k, sql } = await record({ order: { field: 'on', dir: 'desc' } });
  const named = page(k.list({ register: 'ledger', order: [{ field: 'what', dir: 'asc' }] }));
  assert.deepEqual(whats(named.rows), ['Books', 'Cash', 'Coffee, Bridge St', 'Fuel', 'Lunch', 'Rent']);
  sql.close();
});

test('A LIST THAT DECLARES NO ORDER IS NEWEST MADE FIRST, and an edit does not move an entry to the top', async () => {
  const { k, sql } = await record({});
  const made = ['Books', 'Cash', 'Fuel', 'Lunch', 'Rent', 'Coffee, Bridge St'];
  assert.deepEqual(whats(page(k.list({ register: 'ledger' })).rows), made);
  assert.deepEqual(walk(k), made, 'and its pages walk the same order');
  sql.close();
});

test('MANY ENTRIES ON ONE DAY PAGE WITHOUT A GAP OR A REPEAT, either way round and at every page size', async () => {
  /* And a list that declares no order, made in the same millisecond, pages by when each was made and its id. */
  for (const dir of ['desc', 'asc', null] as const) {
    const sql = openSqlite();
    const clock = fixedClock(NOW);
    const k = await openRecord(sql, clock);
    assert.ok((await k.install([list('ledger', dir === null ? {} : { order: { field: 'on', dir } })])).ok);
    /* Seven on one day, three on another, two with none, written out of order and some in the same millisecond, so
       the only thing telling equals apart is the id the kernel breaks a tie with. */
    const days = ['2026-12-31', '2026-07-13', null, '2026-12-31', '2026-12-31', '2026-07-13', '2026-12-31', null, '2026-12-31', '2026-07-13', '2026-12-31', '2026-12-31'];
    days.forEach((on, i) => {
      if (i % 3 === 0) clock.advance(1);
      assert.ok(k.create('ledger', on === null ? { what: `e${i}` } : { what: `e${i}`, on }, { actor: 'p_1' }).ok);
    });
    const all = whats(page(k.list({ register: 'ledger', limit: 500 })).rows);
    assert.equal(all.length, days.length);
    const day = (w: string) => days[Number(w.slice(1))];
    const want = dir === 'desc' ? ['2026-12-31', '2026-07-13'] : ['2026-07-13', '2026-12-31'];
    if (dir !== null) assert.deepEqual([...new Set(all.map(day))], [...want, null], `${dir}: the days in order, the empty ones last`);
    for (const limit of [1, 2, 3, 5, 7]) {
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const p = page(k.list({ register: 'ledger', limit, ...(cursor === null ? {} : { cursor }) }));
        seen.push(...whats(p.rows));
        cursor = p.cursor;
        assert.ok(seen.length <= days.length, `${dir} by ${limit}: the pages repeat: ${seen.join(', ')}`);
      } while (cursor !== null);
      assert.deepEqual(seen, all, `${dir} by ${limit}: every entry once, in the one order`);
    }
    sql.close();
  }
});

test('THE ORDER IS A FIELD THAT SORTS: one the list does not have, or a money, is refused at the door', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  for (const order of [{ field: 'colour', dir: 'desc' }, { field: 'amount', dir: 'desc' }, { field: 'on', dir: 'sideways' }]) {
    const put = await k.install([list('ledger', { order })]);
    assert.ok(!put.ok, `${JSON.stringify(order)} was installed`);
  }
  sql.close();
});

test("THE SEED'S LEDGER DECLARES ITS DAY, NEWEST FIRST: the field is there and is a day", () => {
  const ledger = TRANSACTIONS_REGISTER as typeof TRANSACTIONS_REGISTER & { order?: { field: string; dir: string } };
  assert.deepEqual(ledger.order, { field: 'on', dir: 'desc' });
  assert.equal(ledger.fields.find((f) => f.id === ledger.order!.field)?.type, 'day');
});
