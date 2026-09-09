/**
 * The three things a page did in the browser and not in the kernel.
 *
 * `apps/web` holds a second implementation of the page runner, and `loop/research-phase1-map.md`
 * marked it for deletion. It could not be deleted: three behaviours lived only there, so removing
 * the copy would have removed the behaviour. They are here now, which is what makes the copy
 * removable rather than load-bearing.
 *
 *   `when:`     `06 §1.1` publishes it. The kernel drew every block unconditionally, so the two
 *               implementations disagreed about which blocks are on a page.
 *   the reads   a key the build does not read was silently ignored, so a pack could carry a
 *               misspelling and get a block that quietly did something else.
 *   `order:`    `list` took no order at all, so a block asking for the largest rows got the most
 *               recently changed ones and whatever read it afterwards sorted the page it was given.
 *
 * EACH TEST DRIVES A REAL RECORD, not a stub of the deps. The whole point of moving these is that
 * one implementation answers, and a fake `list` would let the sort pass while the SQL was wrong.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 9, 12);
const day = (offset: number) => new Date(NOW + offset * 86_400_000).toISOString().slice(0, 10);
const gbp = (amount: number) => ({ amount, currency: 'GBP' });

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true, search: true },
      { id: 'amount', type: 'money', index: true },
      { id: 'due', type: 'day', index: true },
      { id: 'state', type: 'enum', values: ['open', 'paid'], required: true },
    ],
  } as never,
};

/** One figure, so a `when:` has something true to read. */
const OPEN_COUNT: Declaration = {
  id: 'metric.open-count',
  kind: 'metric',
  body: { metric: 'open-count', name: 'Open', source: 'register.obligations', where: 'state is open', value: { count: 'what' }, format: 'int', target: { lte: 99 }, window: '30d' } as never,
};

const pageOf = (...blocks: Record<string, unknown>[]): Declaration => ({
  id: 'page.invoicing',
  kind: 'page',
  body: { page: 'invoicing', title: 'Invoicing', requires: ['register.obligations'], blocks } as never,
});

async function record(...decls: Declaration[]): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([OBLIGATIONS, OPEN_COUNT, ...decls])).ok);
  for (const row of [
    { what: 'Small', amount: gbp(10_000), due: day(3), state: 'open' },
    { what: 'Large', amount: gbp(900_000), due: day(1), state: 'open' },
    { what: 'Middle', amount: gbp(50_000), due: day(2), state: 'open' },
  ])
    assert.ok(k.create('obligations', row, { actor: 'p_1' }).ok);
  return { k, sql };
}

const blocks = (r: unknown): Record<string, unknown>[] =>
  ((r as { ok: true; value: { blocks: Record<string, unknown>[] } }).value.blocks ?? []);

/* ── `when:` ─────────────────────────────────────────────────────────────── */

test('A BLOCK WHOSE CONDITION IS NOT MET DRAWS NOTHING, and the kernel drew it anyway', () => {
  /* `06 §1.1` publishes `when:`, the browser has evaluated it since it was written, and this side
     read every block unconditionally. A red note about an overdue invoice on a record with no
     invoices is the one thing a `when:` exists to prevent. */
  return record(
    pageOf(
      { kind: 'note', heading: 'Never', body: 'x', when: { metric: 'open-count', gt: 99 } },
      { kind: 'note', heading: 'Always', body: 'x', when: { metric: 'open-count', gt: 0 } },
    ),
  ).then(({ k, sql }) => {
    const out = blocks(k.page('invoicing'));
    assert.equal(out[0]?.drawn, false, 'a condition nothing satisfies still drew');
    assert.notEqual(out[1]?.drawn, false, 'a condition the record satisfies did not draw');

    /* `drawn` IS ON THE RESULT rather than implied by an empty one, because "the condition was
       false" and "the query matched nothing" are different facts, and a renderer that cannot tell
       them apart draws the empty state of a block that was never meant to be on the page. */
    assert.equal(out[0]?.rows === undefined || (out[0]?.rows as unknown[]).length, 0);
    sql.close();
  });
});

test('and a `when:` the record cannot answer does not draw either', () => {
  /* A metric nobody declared, and a condition with no test in it. Both are unknown rather than
     false, and drawing on an unknown is guessing: the author meant something, and the block waits
     until they say what. */
  return record(
    pageOf(
      { kind: 'note', heading: 'Ghost', body: 'x', when: { metric: 'no-such-figure', gt: 0 } },
      { kind: 'note', heading: 'Empty', body: 'x', when: { metric: 'open-count' } },
    ),
  ).then(({ k, sql }) => {
    const out = blocks(k.page('invoicing'));
    assert.equal(out[0]?.drawn, false, 'a when: naming a figure nobody declared drew');
    assert.equal(out[1]?.drawn, false, 'a condition with no comparison in it drew');
    sql.close();
  });
});

/* ── the keys this build reads ───────────────────────────────────────────── */

test('A KEY THIS RECORD DOES NOT READ IS SAID, and it used to be ignored', () => {
  /* A declaration arrives as JSON from a pack somebody else wrote, so the type is not there at the
     moment it is read. A misspelling was accepted in silence and the block quietly did something
     else than what it said. */
  return record(pageOf({ kind: 'note', heading: 'Typo', body: 'x', wehn: { metric: 'open-count', gt: 0 } })).then(
    ({ k, sql }) => {
      const said = (blocks(k.page('invoicing'))[0]?.refusals ?? []) as { fix: string; at?: string }[];
      assert.equal(said.length, 1, 'the unreadable key was not named');
      assert.match(said[0]?.fix ?? '', /wehn: is not a key this record reads/u);
      assert.equal(said[0]?.at, 'wehn', 'the refusal does not point at the key');
      sql.close();
    },
  );
});

test('and it is said on a stat block too, which returns before every other check', () => {
  /* The `cells` arm returns early, so a misspelling on a stat block was the one shape that could
     not be reported however the check was written after it. */
  return record(pageOf({ kind: 'stat', cells: [{ metric: 'open-count' }], hedaing: 'Typo' })).then(({ k, sql }) => {
    const said = (blocks(k.page('invoicing'))[0]?.refusals ?? []) as { fix: string }[];
    assert.match(said[0]?.fix ?? '', /hedaing: is not a key this record reads/u);
    sql.close();
  });
});

/* ── `order:` ────────────────────────────────────────────────────────────── */

test('A BLOCK SORTS ITS QUERY, and the kernel could not be asked to sort at all', () => {
  /* `list` ordered by `updated_at DESC, id DESC` and took no order, so a block asking for the
     largest rows got the most recently changed ones. Sorting afterwards is worse than not sorting:
     "the five largest" becomes five arbitrary rows put in order, which is a different answer and an
     invisible one. */
  return record(
    pageOf({
      kind: 'table',
      heading: 'Biggest',
      source: 'register.obligations',
      columns: [{ field: 'what' }],
      order: [{ field: 'amount', dir: 'desc' }],
      limit: 2,
    }),
  ).then(({ k, sql }) => {
    const rows = (blocks(k.page('invoicing'))[0]?.rows ?? []) as { fields: Record<string, unknown> }[];
    assert.deepEqual(rows.map((r) => r.fields.what), ['Large', 'Middle'], 'the two largest are not the two drawn');
    sql.close();
  });
});

test('and a money sorts by its number rather than by its JSON', () => {
  /* `money` is an object, so sorting the value sorts the text: `GBP 9.00` lands above `GBP 10.00`.
     `where`'s `fieldSql` reaches `.amount`, which is why the kernel imports the path from the
     package that owns it rather than building one (`31 §2`). */
  return record(
    pageOf({
      kind: 'table',
      heading: 'Smallest',
      source: 'register.obligations',
      columns: [{ field: 'what' }],
      order: [{ field: 'amount', dir: 'asc' }],
    }),
  ).then(({ k, sql }) => {
    const rows = (blocks(k.page('invoicing'))[0]?.rows ?? []) as { fields: Record<string, unknown> }[];
    assert.deepEqual(rows.map((r) => r.fields.what), ['Small', 'Middle', 'Large']);
    sql.close();
  });
});

test('AN ORDER FROM A QUERY STRING IS A VALUE, NOT AN EXCEPTION', async () => {
  /* `packages/host` JSON-decodes every query value, so the caller chooses the SHAPE as well as the
     contents. This gated on `q.order?.length` and then iterated, so `?order={"length":1}` passed
     the gate, threw inside the loop, and answered 500 to a read. The argument for coercing `limit`
     and `cursor` is written four lines above it and applies word for word: a refusal is a value at
     this boundary and an exception is not. */
  const { k, sql } = await record();
  for (const bad of [{ length: 1 }, 'due', 7, { 0: { field: 'due' }, length: 1 }] as unknown[]) {
    const said = k.list({ register: 'obligations', order: bad as never });
    assert.equal(said.ok, false, JSON.stringify(bad));
    assert.equal((said as { refusal: { code: string } }).refusal.code, 'VALUE_MALFORMED');
  }
  assert.equal(k.list({ register: 'obligations', order: [{} as never] }).ok, false, 'a part naming no field was taken');

  /* AND A DIRECTION THAT IS NOT ONE IS REFUSED RATHER THAN READ AS DESCENDING. `dir === 'asc' ?
     'ASC' : 'DESC'` took `descnding`, `1` and `null` and sorted the other way: a typo that answers
     with a correct-looking list in the wrong order, which is the one kind of wrong answer a reader
     cannot see. */
  for (const dir of ['descnding', 1, null, {}] as unknown[]) {
    const said = k.list({ register: 'obligations', order: [{ field: 'due', dir: dir as never }] });
    assert.equal(said.ok, false, JSON.stringify(dir));
    assert.equal((said as { refusal: { code: string; allowed?: readonly string[] } }).refusal.code, 'ENUM_VALUE_UNKNOWN');
    assert.deepEqual((said as { refusal: { allowed?: readonly string[] } }).refusal.allowed, ['asc', 'desc']);
  }

  /* AND THE TWO SHAPES THAT ARE RIGHT STILL ANSWER, or the guard has refused the feature. */
  assert.equal(k.list({ register: 'obligations', order: [{ field: 'due' }] }).ok, true);
  assert.equal(k.list({ register: 'obligations', order: [{ field: 'due', dir: 'asc' }] }).ok, true);
  sql.close();
});

test('a sort on a field the register does not declare is refused, not ignored', async () => {
  /* `json_extract` on an absent key is `NULL` for every row, so an unknown field sorts by nothing at
     all and looks like the default order with extra steps. */
  const { k, sql } = await record();
  const said = k.list({ register: 'obligations', order: [{ field: 'nonesuch' }] });
  assert.equal(said.ok, false);
  assert.equal((said as { refusal: { code: string; at?: string } }).refusal.code, 'FIELD_UNKNOWN');
  assert.equal((said as { refusal: { at?: string } }).refusal.at, 'order');
  sql.close();
});

test('AND A CURSOR AND AN ORDER ARE ONE QUERY OR THE OTHER', async () => {
  /* The cursor is keyset pagination on `updated_at|id`, which is what the `WHERE (updated_at < ?…)`
     clause IS, so a different sort key makes that clause select the wrong rows rather than fewer of
     them. Ignoring one of the two silently would hand back a page that is neither what was asked
     for nor detectably wrong. */
  const { k, sql } = await record();
  const first = k.list({ register: 'obligations', limit: 2 });
  assert.equal(first.ok, true);
  const cursor = (first as { value: { cursor: string | null } }).value.cursor;
  assert.ok(cursor, 'the unsorted query stopped paging, so this asserts nothing');

  const both = k.list({ register: 'obligations', limit: 2, cursor, order: [{ field: 'amount' }] });
  assert.equal(both.ok, false);
  assert.match((both as { refusal: { fix: string } }).refusal.fix, /cannot also sort by a field/u);

  /* AND A SORTED ANSWER HANDS BACK NO CURSOR, because the cursor it would hand back is a position
     in an order the page is not in. */
  const sorted = k.list({ register: 'obligations', limit: 2, order: [{ field: 'amount', dir: 'desc' }] });
  assert.equal((sorted as { value: { cursor: string | null } }).value.cursor, null);
  sql.close();
});
