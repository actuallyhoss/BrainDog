/**
 * A progress over two figures by one word: a track a part, what the first figure counted against the second.
 *
 * Money's Instalments tile reads the parts paid by plan and the parts in all by plan
 * (`packages/seed/src/modules/money/pages/parts/instalments.ts`), and the page draws "2 of 6" a plan from them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord } from '@braindog/kernel';
import { NOW, installSeed } from '@braindog/seed';

import './fixtures/fill.ts';
import { toSegments } from './blocks.ts';
import { blockOf } from './page-live.ts';

const now = Date.UTC(2026, 9, 13, 12);

type Group = { key: string; value: number | null; label?: string };

const counted = (groups: Group[] | undefined) => ({ value: null, unit: null, rows: 3, held: 3, met: null, refusals: [], ...(groups ? { groups } : {}) });

/** The tile as the record answers it: two cells, a reading each, no rows. */
const tile = (paid: Group[] | undefined, total: Group[] | undefined, more: Record<string, unknown> = {}) =>
  blockOf(
    {
      kind: 'progress',
      heading: 'Instalments',
      icon: 'credit-card',
      span: 12,
      empty: 'Nothing is being paid in parts.',
      cells: [
        { metric: 'installments-paid-by-plan', label: 'Paid' },
        { metric: 'installments-total-by-plan', label: 'Parts' },
      ],
      readings: [
        { metric: 'installments-paid-by-plan', label: 'Paid', reading: counted(paid) },
        { metric: 'installments-total-by-plan', label: 'Parts', reading: counted(total) },
      ],
      rows: [],
      matched: 0,
      refusals: [],
      ...more,
    } as never,
    new Map(),
    now,
  );

/** The tracks the renderer was handed, each as its cells. */
const tracks = (block: ReturnType<typeof blockOf>) =>
  toSegments(block).flatMap((s) => (s.type === 'block' && s.kind === 'progress' ? (s.rows as { cells: string[] }[]).map((r) => r.cells.map((c) => c.trim())) : []));

test('each plan is a track: the parts paid against the parts in all', () => {
  const block = tile(
    [{ key: 'Flat', value: 2 }],
    [
      { key: 'Flat', value: 6 },
      { key: 'Car', value: 4 },
    ],
  );
  assert.deepEqual(block.authored, [{ cells: ['Flat', '2', '6'] }, { cells: ['Car', '0', '4'] }], 'a plan with nothing paid reads nought of its parts');
  assert.equal(block.metrics, undefined, 'no tile is drawn in place of the tracks');
  assert.deepEqual(tracks(block), [
    ['Flat', '2', '6'],
    ['Car', '0', '4'],
  ]);
  assert.equal(block.shown, 2);
  assert.equal(block.total, 2);
});

test('a plan named with a bar is one cell, and six tracks at most are drawn', () => {
  const total = ['A | B', 'c', 'd', 'e', 'f', 'g', 'h'].map((key) => ({ key, value: 3 }));
  const block = tile([{ key: 'A | B', value: 1 }], total);
  const drawn = tracks(block);
  assert.equal(drawn.length, 6);
  assert.deepEqual(drawn[0], ['A | B', '1', '3']);
  assert.equal(block.shown, 6);
  assert.equal(block.total, 7, 'the count of every plan is kept beside the six drawn');
});

/* THE AUDIT OF 25 OCTOBER, Z12 (`loop/proof/looks/audit-2026-10-25/money-390-light-full.png`, Instalments): his plans
   read in small letters, the text the import wrote on each part, where Needs you and the plan's own row start each
   with a capital. A plan is a name, and a name starts with a capital; a name typed with one keeps every letter as typed. */
test('A PLAN TYPED ALL IN SMALL LETTERS IS NAMED WITH A CAPITAL, as its own row and Needs you name it', () => {
  const block = tile([{ key: 'harbourview', value: 1 }], [{ key: 'harbourview', value: 39 }, { key: 'larch', value: 14 }, { key: 'iPad', value: 3 }]);
  assert.deepEqual(tracks(block).map((t) => t[0]), ['Harbourview', 'Larch', 'iPad']);
});

test('a paid count for a plan the second figure does not hold draws no track', () => {
  const block = tile([{ key: 'Gone', value: 1 }], [{ key: 'Flat', value: 6 }]);
  assert.deepEqual(tracks(block), [['Flat', '0', '6']]);
});

test('a figure that came with no parts is still said as the tiles, never as an empty track', () => {
  const block = tile(undefined, [{ key: 'Flat', value: 6 }]);
  assert.equal(block.authored, undefined);
  assert.equal(block.metrics?.length, 2);
  const refused = tile([{ key: 'Flat', value: 2 }], [{ key: 'Flat', value: 6 }], { readings: [{ metric: 'installments-paid-by-plan', reading: null }, { metric: 'installments-total-by-plan', reading: counted([{ key: 'Flat', value: 6 }]) }] });
  assert.equal(refused.authored, undefined);
});

test('a progress over one figure, or a stat over two by a word, is read as before', () => {
  const stat = tile([{ key: 'Flat', value: 2 }], [{ key: 'Flat', value: 6 }], { kind: 'stat' });
  assert.equal(stat.authored, undefined);
  assert.equal(stat.metrics?.length, 2);
});

test('no plan at all draws nothing to throw on', () => {
  const block = tile([], []);
  assert.deepEqual(block.authored, []);
  assert.doesNotThrow(() => toSegments(block));
  assert.deepEqual(tracks(block), []);
});

/* ── The plans still being paid first, and what was left out ────────────── */

test('a plan with parts left to pay is drawn before one paid off, each kind in the order the record sent', () => {
  const total = ['Sofa', 'Flat', 'Phone', 'Car'].map((key) => ({ key, value: 4 }));
  const block = tile(
    [
      { key: 'Sofa', value: 4 },
      { key: 'Flat', value: 1 },
      { key: 'Phone', value: 5 },
    ],
    total,
  );
  assert.deepEqual(tracks(block), [
    ['Flat', '1', '4'],
    ['Car', '0', '4'],
    ['Sofa', '4', '4'],
    ['Phone', '5', '4'],
  ]);
});

test('a seventh plan still being paid is drawn, and a paid one is what is left out', () => {
  const total = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'Flat'].map((key) => ({ key, value: 3 }));
  const paid = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((key) => ({ key, value: 3 }));
  const block = tile([...paid, { key: 'Flat', value: 2 }], total);
  const drawn = tracks(block);
  assert.deepEqual(drawn[0], ['Flat', '2', '3'], 'the one plan with a part left leads');
  assert.deepEqual(drawn.map((t) => t[0]), ['Flat', 'A', 'B', 'C', 'D', 'E']);
  assert.equal(block.shown, 6);
  assert.equal(block.total, 8);
  assert.equal(block.total - block.shown, 2, 'two plans are said as left out');
});

test('a plan with no parts to count has nothing left to pay, and goes after one that has', () => {
  const block = tile(
    [],
    [
      { key: 'Empty', value: 0 },
      { key: 'Unread', value: null },
      { key: 'Flat', value: 6 },
    ],
  );
  assert.deepEqual(tracks(block).map((t) => t[0]), ['Flat', 'Empty', 'Unread']);
});

test('the plans the record itself left out of the figure are in the count of what was left out', () => {
  const total = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((key) => ({ key, value: 3 }));
  const cut = (more: unknown) => ({ ...counted(total), more });
  const readings = (more: unknown) => [
    { metric: 'installments-paid-by-plan', label: 'Paid', reading: counted([]) },
    { metric: 'installments-total-by-plan', label: 'Parts', reading: cut(more) },
  ];
  const block = tile([], total, { readings: readings(44) });
  assert.equal(block.shown, 6);
  assert.equal(block.total, 51, 'seven named and forty-four past the cap');
  /* A COUNT THAT IS NOT ONE ADDS NOTHING, and never makes the page say fewer than it drew. */
  for (const bad of [-3, '9', null, Number.NaN]) assert.equal(tile([], total, { readings: readings(bad) }).total, 7, String(bad));
});

/* ── Money's tile on a real kernel ──────────────────────────────────────── */

type Sql = Parameters<typeof openRecord>[0];

function openSqlite(): Sql {
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
  } as unknown as Sql;
}

const OWNER = { actor: 'p_1' } as never;

type Answer = { heading?: unknown; refusals?: unknown[]; readings?: { metric: string; refusal?: unknown; reading: { groups?: Group[]; more?: number } | null }[] };

/** A plan and its parts as a person writes them, one a month: `states[i]` is the status of part `i + 1`. */
function write(k: Awaited<ReturnType<typeof openRecord>>, name: string, states: string[]): void {
  const made = k.create('plans', { name }, OWNER);
  assert.ok(made.ok, JSON.stringify(made));
  states.forEach((state, i) => {
    const part = k.create(
      'installments',
      { what: `${name}, part ${i + 1}`, plan: name, number: i + 1, direction: 'out', amount: { amount: 4_600_000, currency: 'EGP' }, due: `2027-${String(i + 1).padStart(2, '0')}-01`, state },
      OWNER,
    );
    assert.ok(part.ok, JSON.stringify(part));
  });
}

test('Money’s tile, answered by a real kernel, leads with the plans still being paid and says how many it left out', async () => {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  assert.ok((await installSeed(k)).ok);
  /* SIX PLANS PAID OFF, WRITTEN FIRST, and one with parts left written last: seven, and the plan the seed holds. The
     record names a figure's parts largest first, so the smallest plan, the one still being paid, is the last it names. */
  const settled = ['Sofa', 'Phone', 'Laptop', 'Fridge', 'Bike', 'Desk'];
  for (const name of settled) write(k, name, ['paid', 'paid', 'paid']);
  write(k, 'Kitchen', ['paid', 'open']);

  const page = k.page('money') as unknown as { ok: boolean; value: { blocks: Answer[] } };
  assert.ok(page.ok, JSON.stringify(page));
  const answer = page.value.blocks.find((b) => b.heading === 'Instalments');
  assert.ok(answer, 'Money has a tile headed Instalments');
  assert.deepEqual(answer.refusals ?? [], []);
  const by = (id: string): Map<string, number> => {
    const cell = answer.readings?.find((c) => c.metric === id);
    assert.ok(cell?.reading && cell.refusal === undefined, `the record reads ${id}`);
    assert.ok((cell.reading.more ?? 0) === 0, 'no plan is past the record’s own cap here');
    return new Map((cell.reading.groups ?? []).map((g) => [g.key, g.value ?? 0]));
  };
  const paid = by('installments-paid-by-plan');
  const parts = by('installments-total-by-plan');
  assert.deepEqual([...settled, 'Kitchen'].filter((name) => !parts.has(name)), [], 'the record names every plan written');
  assert.equal(parts.get('Kitchen'), 2);
  assert.equal([...parts.keys()].at(-1), 'Kitchen', 'the record names it last, past the six a tile draws');
  assert.equal(paid.get('Kitchen'), 1);
  const left = [...parts].filter(([name, all]) => (paid.get(name) ?? 0) < all).map(([name]) => name);
  assert.ok(left.includes('Kitchen') && left.length < 6, left.join(', '));

  const block = blockOf(answer as never, new Map(), NOW);
  assert.equal(block.cannot, undefined);
  assert.equal(block.metrics, undefined, 'tracks, never the two figures as tiles');
  const drawn = tracks(block);
  assert.equal(drawn.length, 6);
  /* EVERY PLAN WITH A PART LEFT IS DRAWN, AHEAD OF EVERY PLAN PAID OFF, in the order the record named them. */
  assert.deepEqual(drawn.slice(0, left.length).map((t) => t[0]), left);
  assert.ok(drawn.slice(left.length).every(([, done, all]) => Number(done) >= Number(all)), JSON.stringify(drawn));
  /* AND EACH TRACK IS THE RECORD'S TWO COUNTS FOR ITS PLAN, by its name. */
  for (const [name, done, all] of drawn) assert.deepEqual([Number(done), Number(all)], [paid.get(name!) ?? 0, parts.get(name!)], name);
  assert.ok(drawn.some(([name, done, all]) => name === 'Kitchen' && done === '1' && all === '2'), JSON.stringify(drawn));
  assert.equal(block.shown, 6);
  assert.equal(block.total, parts.size, 'every plan the record named is counted');
  assert.equal(block.total - block.shown, parts.size - 6);
  assert.ok(block.total > block.shown, 'the page has plans to say it left out');
});

/* ── What is next, under each bar ────────────────────────────────────────── */

const DAY = (iso: string): number => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
const NEXT_IDS = ['installments-next-due-by-plan', 'installments-left-by-plan', 'installments-after-next-by-plan'];

/** The tile as Money now declares it: the two counts, then the day of the next part, what is left and what is left after it. */
const withNext = (rows: { day?: Group[]; left?: Group[]; after?: Group[]; unit?: string | null }, total: Group[], paid: Group[]) =>
  blockOf(
    {
      kind: 'progress',
      heading: 'Instalments',
      cells: [{ metric: 'installments-paid-by-plan' }, { metric: 'installments-total-by-plan' }, ...NEXT_IDS.map((metric) => ({ metric }))],
      readings: [
        { metric: 'installments-paid-by-plan', reading: counted(paid) },
        { metric: 'installments-total-by-plan', reading: counted(total) },
        { metric: NEXT_IDS[0], reading: { ...counted(rows.day), unit: null } },
        { metric: NEXT_IDS[1], reading: { ...counted(rows.left), unit: rows.unit === undefined ? 'GBP' : rows.unit } },
        { metric: NEXT_IDS[2], reading: { ...counted(rows.after), unit: rows.unit === undefined ? 'GBP' : rows.unit } },
      ],
      rows: [],
      matched: 0,
      refusals: [],
    } as never,
    new Map(),
    now,
  );

test('each plan with a part left says its next part under its bar: the amount, and the day without this year', () => {
  const block = withNext(
    {
      day: [{ key: 'Flat', value: DAY('2026-11-03') }, { key: 'Car', value: DAY('2027-01-05') }],
      left: [{ key: 'Flat', value: 562_500 }, { key: 'Car', value: 900_000 }],
      after: [{ key: 'Flat', value: 375_000 }, { key: 'Car', value: 450_000 }],
    },
    [{ key: 'Flat', value: 6 }, { key: 'Car', value: 4 }],
    [{ key: 'Flat', value: 4 }, { key: 'Car', value: 2 }],
  );
  const drawn = tracks(block);
  /* £1,875.00 and £4,500.00 are the part's own amount, the second figure less the third, said in whole units (the code
     stands after it only while the record has chosen no home currency, as here). */
  assert.match(drawn[0]![3]!, /^Next £1,875(\p{Z}GBP)? on 3 Nov$/u);
  assert.match(drawn[1]![3]!, /^Next £4,500(\p{Z}GBP)? on 5 Jan 2027$/u, 'a day in another year says its year');
  assert.deepEqual(drawn.map((t) => t.slice(0, 3)), [['Flat', '4', '6'], ['Car', '2', '4']]);
  assert.equal(block.metrics, undefined);
});

test('a plan paid off says no next, and one the figures cannot say the amount for says its day alone', () => {
  const block = withNext(
    { day: [{ key: 'Flat', value: DAY('2026-11-03') }], left: [{ key: 'Flat', value: 562_500 }], after: [] },
    [{ key: 'Flat', value: 6 }, { key: 'Desk', value: 2 }],
    [{ key: 'Flat', value: 4 }, { key: 'Desk', value: 2 }],
  );
  assert.deepEqual(tracks(block), [
    ['Flat', '4', '6', 'Next on 3 Nov'],
    ['Desk', '2', '2'],
  ]);
});

test('a plan with no day says nothing under its bar, and two cells draw the tracks as they were', () => {
  const none = withNext({ day: [], left: [], after: [] }, [{ key: 'Flat', value: 6 }], [{ key: 'Flat', value: 4 }]);
  assert.deepEqual(tracks(none), [['Flat', '4', '6']]);
  const two = tile([{ key: 'Flat', value: 4 }], [{ key: 'Flat', value: 6 }]);
  assert.deepEqual(tracks(two), [['Flat', '4', '6']]);
});

test('A NEXT PART WHOSE DAY HAS GONE IS LATE: how late in the danger colour, then the day it was due', () => {
  const block = withNext(
    { day: [{ key: 'Harbourview', value: DAY('2026-10-03') }], left: [{ key: 'Harbourview', value: 900_000 }], after: [{ key: 'Harbourview', value: 450_000 }] },
    [{ key: 'Harbourview', value: 4 }],
    [{ key: 'Harbourview', value: 1 }],
  );
  const [said] = tracks(block).map((t) => t[3]);
  assert.match(said ?? '', /^£4,500(\p{Z}GBP)? \{\{bad:10 days late\}\}, due 3 Oct$/u);
});
