/**
 * WHAT A BLOCK KIND IS, asked of both engines over a register past one read.
 *
 * Two different questions get asked about a kind, and they have two different answers:
 *
 *   ADDS ITS ROWS UP  `bar`, `chips`, `gauge`, `heat`, `progress` and `split` do arithmetic over
 *                     every row the predicate admitted, so a page of the answer is a wrong number
 *                     rather than a short list. The record refuses one past what a single read
 *                     holds, and this app refuses a live answer that came back short of `matched`.
 *   DRAWS NO SLICE    those six and `section`. The count over them is the whole match, so there is
 *                     no "Showing 5 of 38" line to draw. A section is here and not above because it
 *                     adds nothing up: it draws no row of its own and its count is `total`.
 *
 * ONE SET WAS ANSWERING BOTH, IN TWO PACKAGES, UNDER ONE NAME. `@braindog/kernel` exported a
 * `REDUCES` of five and `record/schema.ts` exported a `REDUCES` of six, both `ReadonlySet<string>`,
 * both importable into the same file, and nothing anywhere held them against each other. The first
 * test below is that check, and it is the whole reason this file exists.
 *
 * AND NOTHING DROVE A REDUCING BLOCK PAST THE CEILING THROUGH BOTH ENGINES. `packages/kernel`'s own
 * `pages.test.ts` drives a `split` over 301 rows through the record; `page-live.test.ts` hands this
 * app a hand-written answer. Neither holds the two together, so the record refusing at 201 rows and
 * the app refusing a short answer agreed by luck rather than by test. The second test below drives
 * the record's own answer, over a register of 301 rows, into this app's drawing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { REDUCES as RECORD_REDUCES, openRecord, type Declaration } from '@braindog/kernel';

import { REGISTERS } from './api.ts';
import { blockOf, liveWords } from './page-live.ts';
import { REDUCES, SUMS } from './schema.ts';

const NOW = Date.UTC(2026, 8, 15, 12);

/** The same shim the other cross-engine tests in this directory open a record on. */
type Sql = Parameters<typeof openRecord>[0];

function openSqlite(): Sql {
  const db = new DatabaseSync(':memory:');
  return {
    exec: (text: string, ...params: unknown[]) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
    transactionSync<T>(fn: () => T): T {
      db.exec('BEGIN');
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  } as unknown as Sql;
}

/**
 * A register of its own rather than the seed's, because the number of rows is the whole subject.
 *
 * The app's mirror is given the same declaration, which is what `blockOf` reads for labels: a
 * register it does not know draws nothing at all, and then this test would pass on the wrong
 * reason.
 */
const BULK = {
  id: 'bulk',
  name: 'Bulk',
  one: 'row',
  title: 'what',
  mobile: ['what', 'amount', 'state'],
  state: 'state',
  fields: [
    { id: 'what', type: 'text', required: true },
    { id: 'amount', type: 'money', index: true },
    { id: 'state', type: 'enum', values: ['open', 'paid'], required: true },
  ],
};

const REGISTER: Declaration = { id: 'register.bulk', kind: 'register', body: BULK as never };

const PAGE: Declaration = {
  id: 'page.bulk',
  kind: 'page',
  body: {
    page: 'bulk',
    title: 'Bulk',
    requires: ['register.bulk'],
    blocks: [
      { kind: 'bar', heading: 'By state', source: 'register.bulk', columns: [{ field: 'state' }, { field: 'amount' }] },
      { kind: 'split', heading: 'Shared out', source: 'register.bulk', columns: [{ field: 'state' }, { field: 'amount' }] },
      { kind: 'section', heading: 'Everything', source: 'register.bulk', columns: [{ field: 'what' }] },
    ],
  } as never,
};

/** 301 rows: one read of 200, plus a hundred and one the block would never have seen. */
const ROWS_HELD = 301;

type Answered = { heading?: string; rows?: unknown[]; matched?: number; refusals?: { code: string; fix: string }[] };

let answered: Answered[] | null = null;

async function record(): Promise<Answered[]> {
  if (answered) return answered;
  const k = await openRecord(openSqlite(), { now: () => NOW });
  assert.ok((await k.install([REGISTER, PAGE])).ok);
  for (let n = 0; n < ROWS_HELD; n += 1)
    assert.ok(k.create('bulk', { what: `Row ${n + 1}`, amount: { amount: 100, currency: 'GBP' }, state: 'open' }, { actor: 'p_1' }).ok);
  assert.equal((k.list({ register: 'bulk' }) as { value: { matched: number } }).value.matched, ROWS_HELD);
  const read = k.page('bulk') as { ok: boolean; value: { blocks: Answered[] } };
  assert.ok(read.ok, JSON.stringify(read));
  answered = read.value.blocks;
  return answered;
}

const of = (blocks: Answered[], heading: string): Answered => {
  const found = blocks.find((b) => b.heading === heading);
  assert.ok(found, `the record answered no block called ${heading}`);
  return found;
};

test('ONE NAME, ONE SET: the record and this app mean the same seven kinds by REDUCES', () => {
  /**
   * TWO SETS OF DIFFERENT MEMBERSHIP UNDER ONE NAME is worse than the duplication it was meant to
   * end, because the two names give no hint that they disagree: a file that imported one and
   * already had the other would have got a silently different answer about `section`.
   */
  assert.deepEqual([...RECORD_REDUCES].sort(), [...REDUCES].sort(), 'the record and the app disagree about which kinds draw no slice');

  /* AND THE OTHER QUESTION IS THE SAME SET PLUS `section`, which is the one kind that draws no
     slice without adding anything up. Written out rather than derived, so that a kind added to one
     and not the other is a red test rather than a set that quietly follows. */
  assert.deepEqual([...REDUCES].sort(), [...SUMS, 'section'].sort());
  /* `heat` WAS ADDED TO THE RECORD'S LIST FIRST, and this test went red on the first line above with
     the record's seven against the app's six, which is the kind-added-to-one case it was written for. */
  assert.deepEqual([...SUMS].sort(), ['bar', 'chips', 'gauge', 'heat', 'progress', 'split']);
  assert.ok(!SUMS.has('section'), 'a section adds nothing up, so a short answer is not a wrong figure');
});

test('A REDUCING BLOCK PAST ONE READ IS REFUSED BY THE RECORD AND DRAWN AS A REFUSAL BY THE APP', async () => {
  const blocks = await record();

  /* THE RECORD'S HALF: 301 matched against a read of 200 is a figure that would have been short by
     a hundred and one rows, so the block draws nothing and says why. */
  for (const heading of ['By state', 'Shared out']) {
    const block = of(blocks, heading);
    const said = block.refusals ?? [];
    assert.equal(said.length, 1, `${heading}: ${(block.rows ?? []).length} rows, matched ${block.matched}, refusals ${JSON.stringify(said)}`);
    assert.equal(said[0]?.code, 'OUT_OF_BOUNDS', heading);
    assert.match(String(said[0]?.fix), /301/u, heading);
    assert.match(String(said[0]?.fix), /200/u, heading);
    assert.equal((block.rows ?? []).length, 0, `${heading}: the block refused and handed back rows to add up anyway`);

    /* AND THIS APP'S HALF, over the record's own answer rather than over a hand-written one: the
       record's sentence is what the reader gets, not this file's one line about a block that
       cannot be drawn. */
    const drawn = blockOf(block as never, new Map(), NOW);
    assert.equal(drawn.cannot, undefined, heading);
    assert.deepEqual(drawn.refusals, [said[0]?.fix], heading);
    assert.equal(drawn.rows?.length ?? 0, 0, heading);
  }
});

test('AND A SECTION OVER THE SAME 301 ROWS IS REFUSED BY NEITHER, because it adds nothing up', async () => {
  const blocks = await record();
  const section = of(blocks, 'Everything');

  /* THE RECORD DOES NOT REFUSE IT: a heading over 301 rows has nothing to be wrong about, and a section in the refusing
     set would have refused it. AND IT SENDS ITS COUNT AND NO ROWS, which it draws none of: a page whose sections each
     carried their rows' whole notes answered 760 KB and froze the browser (`loop/research-real-record.md`). */
  assert.deepEqual(section.refusals ?? [], []);
  assert.equal(section.matched, ROWS_HELD);
  assert.equal((section.rows ?? []).length, 0, 'a section sent rows it draws only the count of');

  /* AND THE APP DRAWS THE WHOLE MATCH AS ITS COUNT, so no slice line is drawn over a heading that
     draws no row of its own. */
  REGISTERS.bulk = BULK as never;
  const drawn = blockOf(section as never, new Map(), NOW);
  assert.equal(drawn.cannot, undefined);
  assert.equal(drawn.total, ROWS_HELD);
  assert.equal(drawn.shown, ROWS_HELD, 'a section drew a slice line over rows it never draws');
});

test('A RECORD ON AN OLDER KERNEL ANSWERS A PARTIAL SUM WITH NO REFUSAL IN IT, and the app still refuses', () => {
  /**
   * THE RECORD IS A DIFFERENT DEPLOYMENT FROM THIS APP, which is the whole reason the guard in
   * `page-live.ts` is kept now that the kernel refuses first. A record on an older kernel answers
   * 200 rows, `matched: 301` and an empty `refusals`, and that answer is what the guard was written
   * for. Every kind that adds up is driven, because the copy this app held was four kinds long and
   * `progress` was the one it left out.
   */
  REGISTERS.bulk = BULK as never;
  const short = (kind: string) => ({
    kind,
    heading: 'Old',
    source: 'register.bulk',
    columns: [{ field: 'state' }, { field: 'amount' }],
    rows: Array.from({ length: 200 }, (_, n) => ({
      id: `01JBULK${String(n).padStart(19, '0')}`,
      register: 'bulk',
      seq: n + 1,
      fields: { what: `Row ${n + 1}`, amount: { amount: 100, currency: 'GBP' }, state: 'open' },
      state: 'open',
      version: 1,
      created_at: '2026-09-01T09:00:00.000Z',
      updated_at: '2026-09-01T09:00:00.000Z',
      deleted_at: null,
    })),
    matched: ROWS_HELD,
    refusals: [],
  });
  for (const kind of SUMS) assert.equal(blockOf(short(kind) as never, new Map(), NOW).cannot, liveWords.cannot, kind);

  /* AND A SECTION IS NOT ONE OF THEM: its count is the whole match however few rows came back with
     it, so refusing it would refuse a heading that had nothing to be wrong about. */
  const section = blockOf(short('section') as never, new Map(), NOW);
  assert.equal(section.cannot, undefined);
  assert.equal(section.shown, ROWS_HELD);
});
