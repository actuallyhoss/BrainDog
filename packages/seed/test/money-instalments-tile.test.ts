/**
 * Money's Instalments tile, one test an effect.
 *
 * ON A RECORD HOLDING MONEY AS ITS PACK DOCUMENT SAYS IT, as `money-plan-page.test.ts` measures a plan's own page: the
 * three packs installed with no example entries, a plan and its parts written as a person writes them, and Money read
 * as the app reads it (`k.page`). So a figure the record refuses, or a block the page checker refuses, fails here and
 * not on a screen.
 *
 * EACH PLAN READS ITS PAID OF TOTAL FROM THE TWO FIGURES THE OWNER NAMED, `installments-paid-by-plan` and
 * `installments-total-by-plan`, and never from a count of the rows the tile happened to be handed.
 *
 * RED FIRST: while the tile was a count over the list's rows it carried no figure, and `tile` below found none.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan as planOf, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyDocument } from '../src/index.ts';
import { MONEY_PAGE } from '../src/modules/money/pages/money.ts';
import { INSTALMENTS } from '../src/modules/money/pages/parts/instalments.ts';

type Fields = Record<string, unknown>;
type Reading = { value: number | null; unit: string | null; groups?: { key: string; value: number | null }[] };
type Cell = { metric: string; label?: string; reading: Reading | null; refusal?: unknown };
type Block = { kind: string; heading?: string; icon?: string; span?: number; drawn?: boolean; readings?: Cell[]; refusals?: unknown[] };

const OWNER = { actor: 'p_1' };
const PAID = 'installments-paid-by-plan';
const TOTAL = 'installments-total-by-plan';
const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T };
  assert.ok(x.ok, sayOf(r as never));
  return x.value;
};
const hostFor = (k: Kernel): Host => ({
  count: (register) => k.count(register),
  stage: (batch) => k.stageInstall(batch as never),
  transaction: (fn) => k.transaction(fn),
  reload: () => k.reload(),
  retire: (ids) => k.retire(ids),
  seed: (register, fields) => k.create(register, { ...fields, tags: ['example'] }, { actor: 'p_seed', cascade: false }) as never,
  remember: (row) => k.rememberPack(row),
  forget: (id) => k.forgetPack(id),
  claimed: (pack) => k.packClaims(pack),
});

/**
 * A record holding money-core and what it points at, with no example entries and one account that holds cash.
 *
 * THE ACCOUNT, because the tile stands under Money's "Coming and going", which is drawn once there is an account to
 * come and go from (`parts/next30.ts`): with none the whole of it is folded and no tile under it is read.
 */
async function moneyCore(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  for (const id of ['portfolio', 'people', 'money-core'] as const) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }) as never, { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await planOf(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  value(k.create('accounts', { name: 'Current account', kind: 'bank', balance: { amount: 90_000_000, currency: 'EGP' }, as_of: new Date(NOW).toISOString().slice(0, 10), liquid: true }, OWNER));
  return k;
}

/** A plan and its parts, one a month from January 2027, each E£46,000: `states[i]` is the status of part `i + 1`. */
function write(k: Kernel, name: string, states: string[], direction = 'out'): void {
  value(k.create('plans', { name }, OWNER));
  states.forEach((state, i) =>
    value(
      k.create(
        'installments',
        { what: `${name}, part ${i + 1}`, plan: name, number: i + 1, direction, amount: { amount: 4_600_000, currency: 'EGP' }, due: `2027-${String(i + 1).padStart(2, '0')}-01`, state },
        OWNER,
      ),
    ),
  );
}

/** Money's Instalments tile as the app reads it, drawn or not, and never refused. */
function tile(k: Kernel): Block {
  const blocks = value<{ blocks: Block[] }>(k.page('money')).blocks;
  const found = blocks.find((b) => b.heading === 'Instalments');
  assert.ok(found, 'Money has a tile headed Instalments');
  assert.deepEqual(found.refusals ?? [], [], 'the tile is read');
  return found;
}

/** What the tile says of each plan, in the order the count of every part names them: "2 of 6 paid". */
function said(block: Block): Record<string, string> {
  const by = (id: string): Map<string, number> => {
    const cell = (block.readings ?? []).find((c) => c.metric === id);
    assert.ok(cell, `the tile reads ${id}`);
    assert.equal(cell.refusal, undefined, JSON.stringify(cell.refusal));
    return new Map((cell.reading?.groups ?? []).map((g) => [g.key, g.value ?? 0]));
  };
  const paid = by(PAID);
  /* A PLAN WITH NOTHING PAID IS IN THE COUNT OF EVERY PART AND NOT IN THE COUNT OF THE PAID, so it reads nought. */
  return Object.fromEntries([...by(TOTAL)].map(([plan, all]) => [plan, `${paid.get(plan) ?? 0} of ${all} paid`]));
}

test('a plan of six parts with two paid reads 2 of 6 paid, each plan its own', async () => {
  const k = await moneyCore();
  write(k, 'Flat', ['paid', 'paid', 'open', 'open', 'open', 'open']);
  assert.deepEqual(said(tile(k)), { Flat: '2 of 6 paid' });

  write(k, 'Car, the red one', ['paid', 'open', 'open']);
  write(k, 'Desk', ['open', 'open']);
  assert.deepEqual(said(tile(k)), { Flat: '2 of 6 paid', 'Car, the red one': '1 of 3 paid', Desk: '0 of 2 paid' });
});

test('a cancelled part is in neither count, and money coming in by parts is not drawn', async () => {
  const k = await moneyCore();
  write(k, 'Flat', ['paid', 'paid', 'open', 'cancelled', 'open', 'cancelled']);
  write(k, 'Sold the van', ['paid', 'open'], 'in');
  assert.deepEqual(said(tile(k)), { Flat: '2 of 4 paid' });
});

test('a record with no plan draws no tile, and one all paid draws none either', async () => {
  const k = await moneyCore();
  assert.equal(tile(k).drawn, false, 'nothing is being paid in parts');

  write(k, 'Desk', ['paid', 'paid']);
  assert.equal(tile(k).drawn, false, 'nothing is left to pay in parts');

  write(k, 'Flat', ['paid', 'open']);
  assert.notEqual(tile(k).drawn, false);
});

test('it is the one tile it was: its heading, its icon, no width of its own, and only while something is left', () => {
  assert.equal(INSTALMENTS.length, 1);
  const [block] = INSTALMENTS as Fields[];
  assert.deepEqual(
    [block!.kind, block!.heading, block!.icon, block!.span, block!.when],
    /* NO WIDTH OF ITS OWN SINCE money-core 3.29.0, so the app pairs it on Money's board. */
    ['progress', 'Instalments', 'credit-card', undefined, { metric: 'installments-left', gt: 0 }],
  );
  assert.deepEqual((block!.cells as { metric: string }[]).map((c) => c.metric), [PAID, TOTAL, ...NEXT]);
});

/** The three figures after the two counts, which say what is next under each bar (`NEXT_PART_FIGURES`). */
const NEXT = ['installments-next-due-by-plan', 'installments-left-by-plan', 'installments-after-next-by-plan'];

/** What the tile's cell for `id` reads, plan by plan. */
function byPlan(block: Block, id: string): Record<string, number | null> {
  const cell = (block.readings ?? []).find((c) => c.metric === id);
  assert.ok(cell, `the tile reads ${id}`);
  assert.equal(cell.refusal, undefined, JSON.stringify(cell.refusal));
  return Object.fromEntries((cell.reading?.groups ?? []).map((g) => [g.key, g.value]));
}

/** Days since 1970 of a day, as a `day` figure holds it. */
const daysOf = (iso: string): number => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

test('the tile reads the day of each plan\'s next unpaid part, what is left, and what is left once that part is paid', async () => {
  const k = await moneyCore();
  write(k, 'Flat', ['paid', 'paid', 'open', 'open', 'open', 'open']);
  write(k, 'Desk', ['open', 'open']);
  /* WHAT IS LEFT AFTER EACH PART is written by Money's script a run after the part is (`left_after`); here it is typed, since this
     test asks the figures and not the script (`money-plan-page.test.ts` measures the column). */
  const after = (plan: string, number: number, parts: number): void => {
    const row = value<{ rows: { id: string; version: number; fields: Fields }[] }>(k.list({ register: 'installments', limit: 50 })).rows.find((r) => r.fields.plan === plan && r.fields.number === number)!;
    value(k.update('installments', row.id, { left_after: { amount: 4_600_000 * parts, currency: 'EGP' } }, { ...OWNER, version: row.version }));
  };
  [3, 4, 5, 6].forEach((n) => after('Flat', n, 6 - n));
  [1, 2].forEach((n) => after('Desk', n, 2 - n));
  const block = tile(k);

  /* THE EARLIEST OPEN PART'S DAY: the third of Flat, the first of Desk. */
  assert.deepEqual(byPlan(block, NEXT[0]!), { Flat: daysOf('2027-03-01'), Desk: daysOf('2027-01-01') });
  assert.deepEqual(byPlan(block, NEXT[1]!), { Flat: 4 * 4_600_000, Desk: 2 * 4_600_000 });
  /* AND THE GREATEST LEFT-AFTER OF A PLAN'S OPEN PARTS IS THE NEXT PART'S, so the part's own amount is the two less each other. */
  assert.deepEqual(byPlan(block, NEXT[2]!), { Flat: 3 * 4_600_000, Desk: 4_600_000 });
});

test('a part paid is no longer the next, and a plan all paid has no next', async () => {
  const k = await moneyCore();
  write(k, 'Flat', ['paid', 'open', 'open']);
  write(k, 'Desk', ['paid', 'paid']);
  const block = tile(k);
  assert.deepEqual(byPlan(block, NEXT[0]!), { Flat: daysOf('2027-02-01') });
  /* Money coming in by parts is not drawn either. */
  write(k, 'Sold the van', ['open'], 'in');
  assert.deepEqual(Object.keys(byPlan(tile(k), NEXT[0]!)), ['Flat']);
});

test('Money holds no more blocks than it did', () => {
  const blocks = MONEY_PAGE.blocks as Fields[];
  assert.equal(blocks.length, BLOCKS);
  assert.equal(blocks.filter((b) => b.heading === 'Instalments').length, 1);
});

/** How many blocks Money's home holds since money-core 3.34.0: with no account the line asking for one and what is held,
    the line, the box to add an account, the hero, whether Cash now adds up and an old balance under it, Over time (two,
    one drawn by how many nights net worth has), five tiles and the budgets at a glance. */
const BLOCKS = 19;
