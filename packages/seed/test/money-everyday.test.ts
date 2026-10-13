/**
 * Everyday spending in Money's cash walk (audit 68 finding 4): the leg in `CASH_LEGS` over the moves, read through the
 * figures a person sees, on a record installed the way a record is.
 *
 * WHY. The kernel could walk everyday spending since batch 68 (`packages/kernel/test/forecast-everyday.test.ts`) and no
 * walk on any record did, because Money's legs named no such leg. A record with money in the bank and a card it lives
 * on read as money that never runs out.
 *
 * TODAY IS 3 SEPTEMBER 2026 (`NOW`), so the three full months are June, July and August, and the ledger begins in May
 * so that June is whole.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, day, firstPartyDocument } from '../src/index.ts';
import { CASH_LEGS } from '../src/modules/money/legs.ts';

const OWNER = { actor: 'p_1' };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
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

const held = (k: Kernel): string[] => (k.declarations() as { id: string; kind: string }[]).filter((d) => d.kind === 'register').map((d) => d.id.slice('register.'.length));

/**
 * A record holding Money as the pack document says it, with no example rows. With `subscriptions` it holds Estate
 * first and Money is installed for what the record holds, so the walk has its leg over subscriptions; without, it holds
 * no such list and the walk is one leg shorter, which is most records.
 */
async function record(subscriptions = false): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  for (const id of ['portfolio', 'people', ...(subscriptions ? ['estate'] : []), 'money-core']) {
    const holds = subscriptions && id === 'money-core' ? { holds: held(k) } : {};
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [], ...holds }), { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  return k;
}

const gbp = (amount: number) => ({ amount, currency: 'GBP' });
const make = (k: Kernel, register: string, fields: Record<string, unknown>): string => value<{ id: string }>(k.create(register, fields, OWNER)).id;
const figure = (k: Kernel, id: string): unknown => value<{ value: unknown }>(k.metric(k.metricDecl(id)!)).value;

/**
 * An account holding `cash` today and three full months of what went out of it: GBP 900.00 in June, GBP 1,200.00 in
 * July and GBP 900.00 in August, GBP 1,000.00 a month. GBP 400.00 of each month is the rent. Around them, the rows a
 * measure must leave out: the first row in May (a month that is not whole), this month's shop, a salary in, a pending
 * card payment and money moved to savings.
 */
function lived(k: Kernel, cash: number): string {
  const account = make(k, 'accounts', { name: 'Current account', kind: 'bank', liquid: true, balance: gbp(cash), as_of: day(0) });
  const move = (what: string, on: string, amount: number, more: Record<string, unknown> = {}): void =>
    void make(k, 'transactions', { what, on, direction: 'out', amount: gbp(amount), account, state: 'cleared', ...more });
  move('Opening shop', '2026-05-20', 7_000);
  for (const [month, shops] of [['2026-06', 50_000], ['2026-07', 80_000], ['2026-08', 50_000]] as const) {
    move('Rent', `${month}-01`, 40_000);
    move('Food and fuel', `${month}-12`, shops - 20_000);
    move('Food and fuel', `${month}-25`, 20_000);
    move('Salary', `${month}-28`, 300_000, { direction: 'in' });
  }
  move('To savings', '2026-07-15', 500_000, { transfer: true });
  move('Card held', '2026-08-30', 60_000, { state: 'pending' });
  move('This month so far', '2026-09-01', 33_000);
  return account;
}

/** What the walk has moved for everyday spending by the end of a week, as the kernel shares a month out: 12 months, 52 weeks. */
const shared = (monthly: number, week: number): number => Math.round((monthly * 12 * week) / 52);

test('THE CASH WALK HAS ONE EVERYDAY LEG over the moves, cleared and not a transfer, measured against every other leg of the walk', () => {
  const legs = CASH_LEGS.filter((l) => l.everyday);
  assert.equal(legs.length, 1);
  const leg = legs[0]!;
  assert.equal(leg.register, 'transactions');
  assert.equal(leg.where, 'state is cleared, transfer is false');
  assert.deepEqual(leg.incoming, { field: 'direction', is: 'in' });
  assert.equal(leg.everyday!.months, 3);
  /* UNSAID IS EVERY OTHER LEG OF THE WALK IT IS IN. A leg written out here rides onto a record that does not hold its
     list, and every figure over the walk is refused (the tests below are on such a record). */
  assert.equal(leg.everyday!.already, undefined);
  assert.deepEqual(CASH_LEGS.filter((l) => !l.everyday).map((l) => l.register), ['obligations', 'recurring', 'installments', 'accounts', 'services']);
});

test('A RECORD WITH NOTHING AHEAD OF IT AND NO SPENDING TO MEASURE has money that lasts, as before', async () => {
  const k = await record();
  make(k, 'accounts', { name: 'Current account', kind: 'bank', liquid: true, balance: gbp(590_000), as_of: day(0) });
  assert.equal(figure(k, 'runway-days'), null);
  assert.equal(figure(k, 'leaving-30d'), 0);
});

test('THREE FULL MONTHS OF SPENDING MOVE THE RUNWAY: GBP 5,900.00 at GBP 1,000.00 a month lasts 182 days, where it lasted for ever', async () => {
  const k = await record();
  lived(k, 590_000);
  /* THE 26TH WEEK IS THE FIRST THAT HAS MOVED MORE THAN IS HELD, and a week is seven days. */
  assert.ok(shared(100_000, 25) < 590_000 && shared(100_000, 26) > 590_000);
  assert.equal(figure(k, 'runway-days'), 26 * 7);
  assert.equal(figure(k, 'runs-out-on'), Math.floor(NOW / 86_400_000) + 26 * 7, 'the day it runs out is not the day the count says');
  /* FOUR WEEKS FALL INSIDE THIRTY DAYS, and nothing is coming in. */
  assert.equal(figure(k, 'leaving-30d'), shared(100_000, 4));
  assert.equal(figure(k, 'arriving-30d'), 0);
});

test('RENT WRITTEN AS A REPEATING LINE IS NOT WALKED TWICE: its monthly worth comes off what was measured', async () => {
  const k = await record();
  lived(k, 590_000);
  make(k, 'recurring', { what: 'Rent', direction: 'out', amount: gbp(40_000), every: 'monthly', next_due: day(10), state: 'live' });
  /* THE LINE ONCE IN THIRTY DAYS, AND FOUR WEEKS OF THE GBP 600.00 A MONTH THAT IS NOT RENT. */
  assert.equal(figure(k, 'leaving-30d'), 40_000 + shared(60_000, 4));
  const days = figure(k, 'runway-days') as number;
  assert.ok(days > 26 * 7 - 31 && days <= 26 * 7 + 7, `the money lasts ${days} days, and it lasted 182 before the rent was written down`);
});

test('A LEDGER THAT BEGAN LAST MONTH HAS NO FULL MONTH, so nothing is moved and the figures still answer', async () => {
  const k = await record();
  const account = make(k, 'accounts', { name: 'Current account', kind: 'bank', liquid: true, balance: gbp(590_000), as_of: day(0) });
  make(k, 'transactions', { what: 'Food and fuel', on: '2026-08-10', direction: 'out', amount: gbp(90_000), account, state: 'cleared' });
  assert.equal(figure(k, 'runway-days'), null);
  assert.equal(figure(k, 'leaving-30d'), 0);
});

test('A SUBSCRIPTION ON A RECORD THAT HOLDS THEM IS NOT WALKED TWICE EITHER, and the walk over that record is not refused', async () => {
  const k = await record(true);
  lived(k, 590_000);
  make(k, 'services', { name: 'Studio software', kind: 'saas', cost: gbp(10_000), cycle: 'monthly', renews: day(10), state: 'live' });
  /* THE SUBSCRIPTION ONCE IN THIRTY DAYS, AND FOUR WEEKS OF THE GBP 900.00 A MONTH THAT IS NOT IT. */
  assert.equal(figure(k, 'leaving-30d'), 10_000 + shared(90_000, 4));
});
