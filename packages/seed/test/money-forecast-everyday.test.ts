/**
 * Everyday spending in the walk ahead, measured end to end (REC-B07 job 10, money-lasts-tile-100): a fresh record with
 * a salary, three full months of card spending and no bills, read through a figure over Cash ahead's own legs.
 *
 * WHY. The kernel moves a week's share of what was spent each week to the horizon (`packages/kernel/src/forecast.ts`,
 * the everyday leg) and `money-everyday.test.ts` holds it against the runway, on records whose money only goes out.
 * This holds the other half a person reads: with pay coming in, the walk ends lower than the pay alone would leave it,
 * by exactly what was measured, and the pay that came in is never counted as spending.
 *
 * TODAY IS 3 SEPTEMBER 2026 (`NOW`), so the three full months are June, July and August, and the ledger begins in May
 * so that June is whole. Ninety-one days ahead is thirteen weeks, which is three months of twelve over fifty-two.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { BANKS, CARD_TAILS, COMPANIES } from '../../../fixtures/names.ts';
import { NOW, day, firstPartyDocument } from '../src/index.ts';

const OWNER = { actor: 'p_test' };
const gbp = (amount: number) => ({ amount, currency: 'GBP' });

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

/** A record holding money-core and what it points at, as its document says them, with no example entries. */
async function fresh(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  for (const id of ['portfolio', 'people', 'money-core'] as const) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }) as never, { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census(), config: k.packSettings() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  return k;
}

const make = (k: Kernel, register: string, fields: Record<string, unknown>): string => value<{ id: string }>(k.create(register, fields, OWNER)).id;
type Read = { value: number | null; unit?: string | null; parts?: unknown };
const reading = (k: Kernel, decl: unknown): Read => value<Read>(k.metric(decl as never));

/**
 * WHERE THE WALK ENDS, as a figure over Cash ahead's own legs from Cash now: what is held today and what the walk moves
 * over the next ninety-one days. Declared here and read once, never installed: the balance thirty days on is a figure
 * of its own still to come (`cash-in-30d`, a kernel job), and this says nothing a person reads.
 */
const walkEnds = (k: Kernel): { now: Read; moved: Read } => {
  const runway = k.metricDecl('runway-days')!;
  const moved = { ...runway, metric: 'walk-ends-test', name: 'Moved over the walk', value: { walk: 'net', within: '91d' }, format: 'money', target: { gte: 0 }, snapshot: undefined };
  return { now: reading(k, k.metricDecl('cash-now')!), moved: reading(k, moved) };
};

/** GBP 2,000.00 in the bank, and pay from an invented employer of GBP 2,500.00 every month from 28 September. */
async function paid(): Promise<{ k: Kernel; bank: string }> {
  const k = await fresh();
  const bank = make(k, 'accounts', { name: `${BANKS[0]} current`, kind: 'bank', liquid: true, balance: gbp(200_000), as_of: day(0) });
  make(k, 'recurring', { what: `Pay from ${COMPANIES[3]}`, direction: 'in', amount: gbp(250_000), every: 'monthly', next_due: day(25), state: 'live' });
  return { k, bank };
}

/**
 * THREE FULL MONTHS ON A CARD: GBP 800.00 in June, GBP 1,200.00 in July and GBP 1,000.00 in August, GBP 1,000.00 a
 * month. Beside them the pay that came in each month, which is money in and never spending, and one shop in May so the
 * ledger began before June.
 */
function spent(k: Kernel, bank: string): void {
  const card = make(k, 'accounts', { name: `Card ending ${CARD_TAILS[1]}`, kind: 'card', liquid: false, balance: gbp(0), as_of: day(0) });
  const move = (what: string, on: string, amount: number, more: Record<string, unknown> = {}): void =>
    void make(k, 'transactions', { what, on, direction: 'out', amount: gbp(amount), account: card, state: 'cleared', ...more });
  move('Corner shop', '2026-05-24', 4_000);
  for (const [month, total] of [['2026-06', 80_000], ['2026-07', 120_000], ['2026-08', 100_000]] as const) {
    move('Groceries', `${month}-06`, total - 30_000);
    move('Fuel', `${month}-19`, 30_000);
    move(`Pay from ${COMPANIES[3]}`, `${month}-28`, 250_000, { direction: 'in', account: bank });
  }
}

test('THE WALK ENDS LOWER THAN THE PAY ALONE BY WHAT WAS MEASURED: GBP 1,000.00 a month over thirteen weeks is GBP 3,000.00', async () => {
  const alone = await paid();
  const before = walkEnds(alone.k);
  const lived = await paid();
  spent(lived.k, lived.bank);
  const after = walkEnds(lived.k);

  /* THE SAME CASH TODAY: the card holds nothing, and the spending is in the past. */
  assert.equal(before.now.value, 200_000);
  assert.equal(after.now.value, 200_000);
  /* THE PAY ALONE: three paydays inside ninety-one days (28 September, 28 October and 28 November), and nothing out. */
  assert.equal(before.moved.value, 3 * 250_000);
  /* AND WITH THE CARD: a week's share of GBP 1,000.00 a month, thirteen times. The pay in the ledger is not in the
     measure, or the walk would end GBP 7,500.00 lower than this. */
  const measured = Math.round((100_000 * 12 * 13) / 52);
  assert.equal(measured, 300_000);
  assert.equal((before.now.value ?? 0) + (before.moved.value ?? 0) - ((after.now.value ?? 0) + (after.moved.value ?? 0)), measured);
});

test('IN ONE CURRENCY ONLY: what the walk moves is pounds, as the cash it starts from is, and never split', async () => {
  const { k, bank } = await paid();
  spent(k, bank);
  const { now, moved } = walkEnds(k);
  for (const read of [now, moved]) {
    assert.equal(read.parts, undefined, 'the walk is split by currency on a record that holds one');
    if (read.unit !== undefined && read.unit !== null) assert.equal(read.unit, 'GBP');
  }
});

test('NO BILLS, AND STILL NO MONEY RUNS OUT: pay above the spending lasts the year, and the walk says how far it looked', async () => {
  const { k, bank } = await paid();
  spent(k, bank);
  const runway = value<{ value: number | null; beyond?: unknown }>(k.metric(k.metricDecl('runway-days')!));
  assert.equal(runway.value, null);
  assert.ok(runway.beyond, 'a walk that never went under carries how far it looked');
});
