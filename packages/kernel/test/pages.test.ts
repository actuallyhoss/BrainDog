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
    /* THE THREE AMOUNTS ARE CHOSEN SO THE TWO ORDERS DISAGREE, and they used to agree. They were
       10,000, 900,000 and 50,000 minor units, whose JSON sorts as text into "10000" < "50000" <
       "900000" - the same sequence the numbers give. So the test below, whose whole subject is that
       a money must not sort by its JSON, passed either way and could not fail. At 900, 1,000 and
       50,000 the text order is Middle, Large, Small and the numeric order is Small, Middle, Large. */
    { what: 'Small', amount: gbp(900), due: day(3), state: 'open' },
    { what: 'Large', amount: gbp(50_000), due: day(1), state: 'open' },
    { what: 'Middle', amount: gbp(1_000), due: day(2), state: 'open' },
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

test('and it survives a block that is wrong about a second thing as well', () => {
  /* THE UNREAD KEY WAS BUILT INTO THE BASE RESULT AND THEN SPREAD OVER. Eight returns below the
     base wrote their own `refusals:`, so a block that both misspelt a key and named a source nobody
     publishes reported only the source: the author fixed that, redeployed, and met the second
     sentence they could have had the first time. */
  return record(pageOf({ kind: 'table', source: 'forecast.runway', limti: 5 })).then(
    ({ k, sql }) => {
      const said = (blocks(k.page('invoicing'))[0]?.refusals ?? []) as { code: string; fix: string; at?: string }[];
      assert.equal(said.length, 2, 'both mistakes were not reported at once');
      assert.ok(
        said.some((r) => /limti: is not a key this record reads/u.test(r.fix)),
        'the misspelt key was dropped by the source refusal',
      );
      assert.ok(
        said.some((r) => r.code === 'REQUIRED_MISSING'),
        'the missing opening balance was not named',
      );
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

test('AND A RECORD-ORDER CURSOR DOES NOT PAGE A SORTED LIST', async () => {
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
  assert.match((both as { refusal: { fix: string } }).refusal.fix, /cannot page a sorted list/u);

  /* A SORTED ANSWER HANDS BACK ITS OWN CURSOR, and `list-order-paging.test.ts` pages through it. */
  const sorted = k.list({ register: 'obligations', limit: 2, order: [{ field: 'amount', dir: 'desc' }] });
  assert.match(String((sorted as { value: { cursor: string | null } }).value.cursor), /^~/u);
  sql.close();
});

/* ── the six the record keeps for itself, through a real register ────────── */

test('A `where:` AND AN `order:` MAY NAME THE RECORD’S OWN FIELDS, and every one was FIELD_UNKNOWN', async () => {
  /**
   * `02 §6` makes `id seq state created_at updated_at version` addressable in any `where:` without
   * a register declaring them. `schemaOf` hands the grammar the declared fields and nothing else,
   * so `created_at after -7d`, which is *rows added this week*, was a refusal from a register that
   * keeps a `created_at` column on every row of itself. `order:` had the same hole with one
   * exception cut into it by hand: `o.field !== 'seq'`, one name of the six, spelt twice.
   *
   * IT IS DRIVEN THROUGH A REAL RECORD because the sort and the filter both have to reach a real
   * column. A `created_at` compiled as `json_extract(fields, '$.created_at')` is NULL on every row,
   * which sorts as the default order with extra steps and filters as a clause matching nothing:
   * both look like a working query.
   */
  const { k, sql } = await record();

  const recent = k.list({ register: 'obligations', where: { field: 'created_at', after: '2020-01-01T00:00:00.000Z' } });
  assert.equal(recent.ok, true, (recent as { refusal?: { fix: string } }).refusal?.fix);
  assert.equal((recent as { value: { matched: number } }).value.matched, 3);

  /* AND THE OTHER DIRECTION ANSWERS NOTHING, so the clause is being read rather than ignored. */
  const old = k.list({ register: 'obligations', where: { field: 'created_at', before: '2020-01-01T00:00:00.000Z' } });
  assert.equal((old as { value: { matched: number } }).value.matched, 0);

  /* AND AS A SENTENCE, which is the form a person and an agent write and the form a page prints. */
  const said = k.list({ register: 'obligations', where: 'created_at after 2020-01-01' });
  assert.equal(said.ok, true, (said as { refusal?: { fix: string } }).refusal?.fix);
  assert.equal((said as { value: { matched: number } }).value.matched, 3);

  const bySeq = k.list({ register: 'obligations', where: { field: 'seq', gt: 1 } });
  assert.equal((bySeq as { value: { matched: number } }).value.matched, 2);

  /* THE SORT TAKES THEM TOO, and `seq` was the only one it took. */
  const sorted = k.list({ register: 'obligations', order: [{ field: 'created_at', dir: 'asc' }, { field: 'seq', dir: 'asc' }] });
  assert.equal(sorted.ok, true, (sorted as { refusal?: { fix: string } }).refusal?.fix);
  assert.deepEqual(
    (sorted as { value: { rows: { fields: Record<string, unknown> }[] } }).value.rows.map((r) => r.fields.what),
    ['Small', 'Large', 'Middle'],
  );

  /* AND A NAME THAT IS STILL UNKNOWN TEACHES THE WHOLE VOCABULARY, `38 §6`'s sentence for it. */
  const nope = k.list({ register: 'obligations', order: [{ field: 'nonesuch' }] });
  assert.equal((nope as { refusal: { code: string } }).refusal.code, 'FIELD_UNKNOWN');
  for (const name of ['created_at', 'seq', 'id', 'updated_at', 'version'])
    assert.ok(
      ((nope as { refusal: { allowed?: readonly string[] } }).refusal.allowed ?? []).includes(name),
      `${name} is missing from the refusal`,
    );
  sql.close();
});

test('AND A PREDICATE OVER THE STATE READS THE MIRRORED COLUMN, which `02 §1` settles in bold', async () => {
  /**
   * `02 §1` asks what `{ field: state, is: open }` compiles against, says that for a state machine
   * this is not a detail but the whole thing, and answers: the COLUMN. It compiled against the
   * JSON, and the answers were right anyway, because the write path stores the state in both
   * places. What was lost is the reason the exception was granted, `entry_state`, which no
   * predicate this record emitted could use.
   *
   * THE TWO HALVES ARE DESYNCHRONISED HERE ON PURPOSE, because that is the only way to see WHICH
   * one is read while both agree. It is not a contrived state either: `02 §1`'s second reason for
   * the mirror is that a person can open the file with `sqlite3` and ask it questions, and the
   * column is what such a person writes to.
   *
   * WHICH FIELD IS MIRRORED COMES FROM THE DECLARATION AND NOT FROM THE WORD. This register names
   * `state`, one of the shipped registers names `lane`, and a register may declare an enum called
   * `state` and name no state at all, in which case the column is NULL on every row of it and
   * reading it would match nothing.
   */
  const { k, sql } = await record();
  const before = k.list({ register: 'obligations', where: { field: 'state', is: 'paid' } });
  assert.equal((before as { value: { matched: number } }).value.matched, 0);

  sql.exec("UPDATE entry SET state = 'paid' WHERE register = 'obligations' AND seq = 1");

  const after = k.list({ register: 'obligations', where: { field: 'state', is: 'paid' } });
  assert.equal(
    (after as { value: { matched: number } }).value.matched,
    1,
    'the predicate read the JSON, so the column the record mirrors for exactly this is decoration',
  );
  sql.close();
});

/* ── a register bigger than one read ─────────────────────────────────────── */

test('A BLOCK THAT ADDS ITS ROWS UP REFUSES PAST ONE READ, and it was summing 200 of 301', async () => {
  /**
   * `pages.ts` HAS SAID SINCE IT WAS WRITTEN THAT THIS REFUSAL EXISTS, and it did not exist. The
   * comment over `REDUCES` reads "a register past that says it cannot be drawn rather than adding
   * up part"; `READ_WHOLE` appeared at one site, which set the read limit to 200, and nothing
   * compared `matched` against it. Measured on this record before the fix: a `split` over 301
   * obligations came back with 200 rows, `matched: 301` and an EMPTY `refusals`, so the figure a
   * reader saw was the first 200 amounts added together and nothing on the page said so.
   *
   * IT IS DRIVEN THROUGH THE KERNEL RATHER THAN THROUGH THE BROWSER because the browser is where
   * the only guard was. `apps/web` refuses a reducing block whose rows are short of `matched`, so
   * the one consumer with a screen was protected and every other one was not: `packages/mcp`
   * publishes the same answer to an agent as "rows and figures", and an agent asked to total a bar
   * over a 250-row register got 200 of them with nothing to read that said so.
   */
  const { k, sql } = await record(
    pageOf({ kind: 'split', heading: 'By state', source: 'register.obligations', columns: [{ field: 'state' }, { field: 'amount' }] }),
  );
  /* 3 rows are already there, and 200 is the ceiling, so 301 is one read plus a hundred and one. */
  for (let n = 0; n < 298; n += 1)
    assert.ok(k.create('obligations', { what: `Row ${n}`, amount: gbp(100), due: day(1), state: 'open' }, { actor: 'p_1' }).ok);
  assert.equal((k.list({ register: 'obligations' }) as { value: { matched: number } }).value.matched, 301);

  const split = blocks(k.page('invoicing'))[0] as { rows?: unknown[]; matched?: number; refusals?: { code: string; fix: string }[] };
  const said = split.refusals ?? [];
  assert.equal(said.length, 1, `a split over 301 rows drew ${(split.rows ?? []).length} rows, matched ${split.matched}, and refused nothing`);
  assert.equal(said[0]?.code, 'OUT_OF_BOUNDS');
  assert.match(String(said[0]?.fix), /301/u);
  assert.match(String(said[0]?.fix), /200/u);
  /* AND A REFUSAL MEANS THE BLOCK DREW NOTHING, which is the contract every other refusal here keeps. */
  assert.equal((split.rows ?? []).length, 0, 'the block refused and handed back rows to add up anyway');
  sql.close();
});

test('and the same block under the ceiling still draws every row it matched', async () => {
  /* THE REFUSAL HAS TO HAVE AN EDGE OR IT IS A KIND THAT NEVER DRAWS. Three rows is the record the
     other tests in this file use, and a `split` over it answers rows and no refusal. */
  const { k, sql } = await record(
    pageOf({ kind: 'split', heading: 'By state', source: 'register.obligations', columns: [{ field: 'state' }, { field: 'amount' }] }),
  );
  const split = blocks(k.page('invoicing'))[0] as { rows?: unknown[]; matched?: number; refusals?: unknown[] };
  assert.deepEqual(split.refusals, []);
  assert.equal(split.matched, 3);
  assert.equal((split.rows ?? []).length, 3);
  sql.close();
});

/* ── which register a page came out of ───────────────────────────────────── */

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Projects', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};

/** One declaration, one page per project, and a place in the rail for every one of them. */
const PER_PROJECT: Declaration = {
  id: 'page.project',
  kind: 'page',
  body: {
    page: 'project',
    title: '{{name}}',
    for: { register: 'things' },
    requires: ['register.things'],
    nav: { section: 'Projects', order: 1 },
    blocks: [{ kind: 'note', body: 'About {{name}}.' }],
  } as never,
};

test('A PAGE OUT OF A TEMPLATE SAYS WHICH ROW OF WHICH REGISTER IT IS ABOUT, and a written page says nothing', async () => {
  /**
   * `pages()` HANDED BACK THE REGISTERS A PAGE DRAWS FROM AND NEVER THE ONE IT CAME OUT OF, and
   * those are different questions. A page per project draws from `updates`, `session` and whatever
   * else its blocks name; what it is ABOUT is one row of `things`, and nothing in the answer said
   * so. The rail is the caller that needs it: `boot` sends these to the shell, and a rule of the
   * form "at most five pages per register in one heading" cannot be written against a list whose
   * entries carry no register at all. Measured before this line: 27 projects gave 27 entries
   * carrying `registers: ['things']` only because the template's own block named it, which is a
   * coincidence of that declaration rather than a fact about where the page came from.
   */
  const { k, sql } = await record(PROJECTS, PER_PROJECT);
  for (const name of ['Kiln', 'Loom', 'Anvil']) assert.ok(k.create('things', { name }, { actor: 'p_1' }).ok);

  const pages = k.pages() as { slug: string; about: { register: string; seq: number | null } | null }[];
  assert.deepEqual(
    pages.filter((p) => p.about).map((p) => [p.slug, p.about?.register, p.about?.seq]),
    /* The record's own order, which for these is newest first, and the order the rail draws them in. */
    [
      ['anvil', 'things', 3],
      ['loom', 'things', 2],
      ['kiln', 'things', 1],
    ],
    'a page per project did not say which project it is a page of',
  );
  assert.equal(pages.find((p) => p.slug === 'invoicing')?.about ?? null, null, 'a page somebody wrote was reported as a page about a row');
  sql.close();
});
