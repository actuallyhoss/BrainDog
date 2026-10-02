/**
 * THE MINUS ON THE BRIDGE'S OUT ROW AND THE TILE BESIDE IT THAT DOES NOT WEAR ONE, held together.
 *
 * `/p/money` draws `Going out GBP −42,741.00` two blocks under a tile reading `Owed by you, 30 days
 * GBP 38,880.00`, one negative and one positive over money leaving the same record inside the same
 * thirty days, and that was filed as one screen contradicting itself. It is a disagreement on
 * purpose: `bridgeRows` in `blocks.ts` carries the measurements, both of what the renderer does when
 * the minus is taken off and of why a tile stating an amount must not have one. Since money-core
 * 3.0.0 the tile is `Going out, 30 days`, read from the bridge's own walk, so the pair is one sum; since 3.3.0 the
 * page draws only the bridge, and the figure is read directly.
 *
 * WHAT THIS FILE ADDS IS THE PAIR, because a sign that is right on its own terms in two places can
 * still drift into two answers, which is what 491e7e05 measured on these very blocks. So the two
 * figures are read off the DRAWN page together and pinned against each other. Neither can move
 * alone: take the minus off the bridge and the renderer's own reading of the four cells fails here,
 * give the tile a minus or hand it the bridge's words back and the same test fails.
 *
 * THAT THE FOUR ROWS SUM TO THE END IS ALREADY HELD, in `api.test.ts`'s "THE BRIDGE ADDS UP BY
 * CONSTRUCTION", so it is not asserted again below. What is new here is the renderer's verdict on
 * those same cells, `bridgePlan`'s warning line and the direction `moveOf` floats the bar, which is
 * the half a reader actually sees.
 *
 * ── AND THE HEADING THIS FILE PUTS OVER A REFUSAL ────────────────────────────
 *
 * The second subject below is the other thing `blocks.ts` says on its own authority: the one line it
 * writes above the record's own sentence when a block refuses. That line claimed the filter was
 * misread and that nothing matched, for every refusal a block can carry, and on the Ledger's only
 * chart of where the money goes both halves were false. It is held here against a record of 220 rows
 * rather than against a hand-written refusal string, because the sentence being contradicted is one
 * only the record writes and only over enough rows to write it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { bridgePlan, moveOf, signedOf, type Row } from 'braindog-render';
import { openRecord, type Declaration } from '@braindog/kernel';
import './fixtures/fill.ts';
import { REGISTERS } from './api.ts';
import { metric, page } from './fixtures/readers.ts';
import { blockOf as liveBlockOf } from './page-live.ts';
import { draw, toSegments } from './blocks.ts';
import { copy } from '../copy.ts';

/** The rows a block DRAWS, through the one conversion every surface uses, because a sign is a drawing. */
const drawnRows = (block: Parameters<typeof toSegments>[0]): Row[] =>
  toSegments(block).flatMap((seg) => ('rows' in seg ? seg.rows : []));

const blockOf = (slug: string, kind: string, source?: string) => {
  const block = page(slug)?.blocks.find((b) => b.kind === kind && (source === undefined || b.source === source));
  assert.ok(block, `/p/${slug} draws no ${kind}, so this test is about a block that is gone`);
  return block;
};

/** A figure as a reader sees it, sign and all: `signedOf` reads `GBP −42,741.00` back as a number. */
const figure = (row: Row | undefined): number => signedOf(row?.cells[1] ?? '');

test('THE BRIDGE’S OUT ROW AND THE `Going out, 30 days` TILE ARE ONE MONEY IN TWO READINGS, and neither may take the other’s sign', () => {
  const bridge = blockOf('money', 'bridge', 'forecast.runway');
  const rows = drawnRows(bridge);
  assert.deepEqual(
    rows.map((r) => r.cells[0]),
    [copy.bridgeStart, copy.bridgeIn, copy.bridgeOut, copy.bridgeEnd(typeof bridge.walk?.horizon === 'number' ? bridge.walk.horizon : typeof bridge.horizon === 'number' ? bridge.horizon : 180)],
    'the bridge draws start, in, out and end in that order, and everything below reads those positions',
  );
  const values = rows.map((r) => figure(r));
  assert.ok(
    values.every((v) => Number.isFinite(v)),
    `a row came back unreadable, so the checks below would pass over nothing: ${JSON.stringify(rows.map((r) => r.cells[1]))}`,
  );
  const out = values[2]!;
  assert.ok(out < 0, `what leaves is subtracted on a bridge, and the out row drew ${rows[2]?.cells[1]}`);

  /* THE RENDERER'S OWN READING OF THOSE FOUR CELLS, which is what a person sees rather than what the
     walk meant. Measured with the minus taken off: `bridgePlan` answers "These rows do not add up:
     the start and the movements come to 88,081, and the end says 2,599" and the bars come back
     `start up up end`, so the money leaving floats the same way as the money arriving. */
  const plan = bridgePlan(values);
  assert.equal(plan.warn, null, `the drawn bridge warns its reader: ${plan.warn}`);
  assert.deepEqual(
    plan.bars?.map((b) => b.move),
    ['start', 'up', 'down', 'end'],
    'the bar for what leaves no longer floats downwards',
  );
  assert.equal(moveOf(2, values.length, out), 'down');

  /* THE FIGURES AND NOT THE TILES, SINCE money-core 3.3.0. The Money page says the thirty days once, as the bridge, and
     no longer draws `arriving-30d` and `leaving-30d` beside Cash now; a use case's page still does (`founder`), so the
     two are read here as figures, as `packages/seed/test/money.test.ts` reads them, and held to the bridge's legs.

     SINCE money-core 3.0.0 BOTH READ THE WALK. `out-30d` summed what Bills and invoices owed inside thirty days while
     the bridge walked every list that holds a dated amount, so a tile over it could only be a part of the leg, and
     491e7e05 kept the two apart in words. `leaving-30d` walks `CASH_LEGS` over the same thirty days as the bridge
     (`packages/seed/src/modules/money.ts`), so it is the leg itself: the two must be the same money exactly. */
  const leaving = metric('leaving-30d');
  assert.equal(leaving.label, 'Going out, 30 days');
  const left = signedOf(leaving.value);
  assert.ok(left > 0, `a figure labelled ${JSON.stringify(leaving.label)} states an amount rather than a term in a sum, and it reads ${leaving.value}`);
  assert.equal(left, -out, `the figure says ${left} leaves where the bridge's own leg says ${-out}, over the one walk and the same thirty days`);

  /* AND THE OTHER LEG IS THE OTHER FIGURE, by the same walk: what arrives is said once as a figure and once as a term. */
  const arriving = metric('arriving-30d');
  assert.equal(arriving.label, 'Coming in, 30 days');
  assert.equal(signedOf(arriving.value), values[1], 'the figure and the bridge disagree on what comes in');
});

/* ── the heading over a refusal ───────────────────────────────────────────── */

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
 * A ledger of his shape rather than the seed's: the seven fields the chart's four clauses read.
 *
 * `category` is an enum here where his is a ref to a register of categories, because what the bar
 * groups by is not the subject and a second register would be a second declaration to install. Every
 * field the `where:` names is his, spelt his way, so the clauses under test are the shipped ones.
 */
const LEDGER = {
  id: 'ledger',
  name: 'Ledger',
  one: 'transaction',
  holds: 'money that has moved',
  title: 'what',
  mobile: ['what', 'amount', 'on'],
  state: 'state',
  done: ['cleared', 'void'],
  fields: [
    { id: 'what', label: 'Description', type: 'text', required: true },
    { id: 'on', label: 'Date', type: 'day', index: true, required: true },
    { id: 'direction', label: 'Which way', type: 'enum', values: ['in', 'out'], index: true, required: true },
    { id: 'amount', type: 'money', required: true },
    { id: 'category', label: 'For', type: 'enum', values: ['groceries', 'software', 'travel', 'fees'], index: true },
    { id: 'state', label: 'Status', type: 'enum', values: ['pending', 'cleared', 'void'], default: 'cleared', index: true, required: true },
    { id: 'transfer', label: 'Between your own accounts', type: 'bool', default: false, index: true },
  ],
};

const REGISTER: Declaration = { id: 'register.ledger', kind: 'register', body: LEDGER as never };

/** His chart's four clauses, held in one place so the block and the count read the same sentence. */
const WENT_OUT = 'state is cleared, transfer is false, direction is out, on after -12m';

/**
 * His two blocks, as `packages/seed/src/modules/money.ts:1944`-`:1957` declares the first of them.
 *
 * THE SECOND ONE IS THE OTHER HALF OF THE SAME HABIT. `currency` is not a field this register
 * declares, so the record refuses the table by naming it, and the sentence it writes has the letters
 * `currenc` in it. That is all the old heading tested for.
 */
const PAGE: Declaration = {
  id: 'page.ledger',
  kind: 'page',
  body: {
    page: 'ledger',
    title: 'Ledger',
    requires: ['register.ledger'],
    blocks: [
      {
        kind: 'bar',
        heading: 'Where it went, 12 months',
        span: 7,
        source: 'register.ledger',
        where: WENT_OUT,
        columns: [{ field: 'category' }, { field: 'amount' }],
        limit: 8,
        unset: 'Uncategorised',
        empty: 'Nothing has gone out in the last 12 months.',
      },
      {
        kind: 'table',
        heading: 'Every movement',
        span: 12,
        source: 'register.ledger',
        columns: [{ field: 'what' }, { field: 'currency' }],
        limit: 5,
        empty: 'Nothing has moved yet.',
      },
    ],
  } as never,
};

/** How many rows the chart's four clauses admit, which is what the record counts and says out loud. */
const GOES_OUT = 216;

/** And the rows that are there for the clauses to exclude, one per clause, so a filter that ran is visible as one. */
const EXCLUDED = [
  { what: 'Still pending', state: 'pending', direction: 'out', transfer: false, back: 3 },
  { what: 'Money in', state: 'cleared', direction: 'in', transfer: false, back: 4 },
  { what: 'Moved to savings', state: 'cleared', direction: 'out', transfer: true, back: 5 },
  { what: 'Last year', state: 'cleared', direction: 'out', transfer: false, back: 400 },
];

const dayBack = (back: number): string => new Date(NOW - back * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

type Answered = { heading?: string; rows?: unknown[]; matched?: number; refusals?: { code: string; fix: string }[] };

/**
 * The page as the record answers it, and what the chart's own clauses admit, read separately.
 *
 * THE REFUSED BLOCK CARRIES `matched: 0`, which is why the count is read off a `list` rather than off
 * the block: the record refuses before it counts anything onto the answer, so the only place the 216
 * appears is inside the sentence. Asking the same predicate as a query is what shows that the filter
 * ran at all, which is the claim the old heading denied.
 */
type Answer = { blocks: Answered[]; admitted: number };

let answered: Answer | null = null;

async function ledger(): Promise<Answer> {
  if (answered) return answered;
  const k = await openRecord(openSqlite(), { now: () => NOW });
  assert.ok((await k.install([REGISTER, PAGE])).ok);
  const categories = ['groceries', 'software', 'travel', 'fees'];
  for (let n = 0; n < GOES_OUT; n += 1)
    assert.ok(
      k.create(
        'ledger',
        {
          what: `Payment ${n + 1}`,
          /* WITHIN THE TWELVE MONTHS AND SPREAD ACROSS THEM, one row every day and a half, so the
             oldest of the 216 sits 323 days back and the window is a clause with work to do: the
             `Last year` row below it, at 400 days, is the row it excludes on its own. */
          on: dayBack(1 + Math.floor(n * 1.5)),
          direction: 'out',
          amount: { amount: 1200 + n, currency: 'GBP' },
          category: categories[n % categories.length],
          state: 'cleared',
          transfer: false,
        },
        { actor: 'p_1' },
      ).ok,
      `row ${n + 1} was refused`,
    );
  for (const e of EXCLUDED)
    assert.ok(
      k.create(
        'ledger',
        { what: e.what, on: dayBack(e.back), direction: e.direction, amount: { amount: 5000, currency: 'GBP' }, state: e.state, transfer: e.transfer },
        { actor: 'p_1' },
      ).ok,
      `${e.what} was refused`,
    );
  assert.equal((k.list({ register: 'ledger' }) as { value: { matched: number } }).value.matched, GOES_OUT + EXCLUDED.length);
  const admitted = k.list({ register: 'ledger', where: WENT_OUT }) as { ok: boolean; value: { matched: number } };
  assert.ok(admitted.ok, JSON.stringify(admitted));
  const read = k.page('ledger') as { ok: boolean; value: { blocks: Answered[] } };
  assert.ok(read.ok, JSON.stringify(read));
  answered = { blocks: read.value.blocks, admitted: admitted.value.matched };
  return answered;
}

const answeredBlock = (blocks: Answered[], heading: string): Answered => {
  const found = blocks.find((b) => b.heading === heading);
  assert.ok(found, `the record answered no block called ${heading}`);
  return found;
};

/** What the reader is shown: the app's heading, and the record's own lines under it. */
const shownFor = (block: Answered): { title: string; lines: string[] } => {
  REGISTERS.ledger = LEDGER as never;
  const { refusal, segments } = draw(liveBlockOf(block as never, new Map(), NOW));
  assert.ok(refusal, `${block.heading} refused nothing, so there is no heading to read`);
  assert.equal(refusal.kind, 'error', `${block.heading}: a block the record refused is not an empty answer`);
  assert.equal(segments.length, 0, `${block.heading} drew segments under a refusal`);
  /* AND THERE IS A HEADING AT ALL, which the two tests below only ever ask about negatively. Measured
     while checking them: with `title` set to the empty string every assertion in this file and all 21
     in `refusal.test.ts` still passed, so the one state the refusal surface was built to end, a
     heading over a blank rectangle saying nothing, was the one state nothing held. */
  assert.ok(refusal.title.trim(), `${block.heading} was refused under no heading at all`);
  return { title: refusal.title, lines: refusal.lines ?? [] };
};

test('A CHART PAST THE CEILING IS NOT A FILTER NOBODY UNDERSTOOD, and the heading may not say it was', async () => {
  const { blocks, admitted } = await ledger();
  const bar = answeredBlock(blocks, 'Where it went, 12 months');

  /* THE RECORD'S HALF, and the two facts the heading used to contradict: the filter ran, excluding
     four rows of the 220 held, and what it admitted is 216 rather than nothing. */
  assert.equal(admitted, GOES_OUT, 'the four clauses admitted a different number, so the sentence below is about another block');
  assert.equal((bar.rows ?? []).length, 0, 'the record refused the bar and handed back rows to add up anyway');
  const said = bar.refusals ?? [];
  assert.equal(said.length, 1, `refusals: ${JSON.stringify(said)}`);
  assert.equal(said[0]?.code, 'OUT_OF_BOUNDS');
  assert.match(String(said[0]?.fix), /216/u, "the record's sentence no longer carries what it matched");
  assert.match(String(said[0]?.fix), /200/u, 'nor what a block that adds up reads');

  /* AND THIS APP'S HALF. Measured on the working tree before the repair: the heading read `This
     block's filter was not understood, so it matched nothing.` over that sentence, so the screen
     stated the opposite of the line directly beneath it, twice over. */
  const shown = shownFor(bar);
  assert.deepEqual(shown.lines, [said[0]?.fix], "the record's words are what the reader gets");
  assert.ok(
    !/match/iu.test(shown.title),
    `the heading makes a claim about what the filter matched while the line under it says ${admitted} rows did: ${JSON.stringify(shown.title)}`,
  );
  assert.ok(
    !/filter/iu.test(shown.title),
    `the heading blames the filter, and this filter was understood: ${JSON.stringify(shown.title)}`,
  );
});

test('AND A MISSPELT COLUMN IS NOT A SECOND CURRENCY, which is the same guess in its milder form', async () => {
  const { blocks } = await ledger();
  const table = answeredBlock(blocks, 'Every movement');
  const said = table.refusals ?? [];
  assert.equal(said.length, 1, `refusals: ${JSON.stringify(said)}`);
  assert.equal(said[0]?.code, 'FIELD_UNKNOWN');
  /* THE LETTERS THE OLD HEADING TESTED FOR, in a sentence about a column that does not exist. */
  assert.match(String(said[0]?.fix), /currenc/iu);

  const shown = shownFor(table);
  assert.deepEqual(shown.lines, [said[0]?.fix]);
  assert.ok(
    !/currency/iu.test(shown.title),
    `nothing is wrong with this block's money, and the heading says there is: ${JSON.stringify(shown.title)}`,
  );

  /* ONE HEADING OVER TWO DIFFERENT REFUSALS, which is the whole of the repair: the state is what this
     file knows and the reason is what the record said, so the same line stands over both while the
     lines under them differ. */
  const bar = shownFor(answeredBlock(blocks, 'Where it went, 12 months'));
  assert.equal(shown.title, bar.title, 'the heading is a guess about the refusal again');
  assert.notDeepEqual(shown.lines, bar.lines);
});
