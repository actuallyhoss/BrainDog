/**
 * How long the cash lasts with no income (money-lasts-no-income-95; REC-B07 step 8, REC-B23 job 2 step 1). "Money leads
 * with cash and runway", and "i want the headlines to be the money i have, not the money im due/owed".
 *
 * WHY. Money's first sentence said the cash and its change, and on a record whose pay comes in every month it said "on
 * what is due it lasts the year": true, and nothing about how long the money a person has would carry them. Since
 * money-core 3.17.0 `lasts-no-income` walks Cash ahead's own legs narrowed to the money that goes out (`OUT_LEGS`), and
 * every lead ends on it.
 *
 * TODAY IS 3 SEPTEMBER 2026 (`NOW`), so day(7) is 10 September.
 *
 * RED FIRST: before this job no figure was called `lasts-no-income`, and no lead body named it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { BANKS, COMPANIES } from '../../../fixtures/names.ts';
import { NOW, day, firstPartyDocument } from '../src/index.ts';
import { OUT_LEGS } from '../src/modules/money/legs.ts';

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
type Read = { value: number | null; beyond?: unknown; met?: boolean | null };
const reading = (k: Kernel, id: string): Read => value<Read>(k.metric(k.metricDecl(id)!));

/** GBP 1,200.00 in the bank, GBP 3,000.00 of pay in every month and GBP 500.00 of rent out, both from 10 September. */
async function lived(): Promise<{ k: Kernel; account: string }> {
  const k = await fresh();
  const account = make(k, 'accounts', { name: `${BANKS[0]} current`, kind: 'bank', liquid: true, balance: gbp(120_000), as_of: day(0) });
  make(k, 'recurring', { what: `Pay from ${COMPANIES[1]}`, direction: 'in', amount: gbp(300_000), every: 'monthly', next_due: day(7), state: 'live' });
  make(k, 'recurring', { what: 'Rent', direction: 'out', amount: gbp(50_000), every: 'monthly', next_due: day(7), state: 'live' });
  return { k, account };
}

test('THE WALK WITH NO INCOME IS CASH AHEAD\'S LEGS NARROWED TO MONEY OUT, with money on its way left out and everyday spending kept', () => {
  assert.deepEqual(OUT_LEGS.map((l) => l.register), ['obligations', 'recurring', 'installments', 'services', 'transactions']);
  const where = Object.fromEntries(OUT_LEGS.map((l) => [l.register, l.where]));
  assert.match(String(where.obligations), /, direction is owed by me$/u);
  assert.equal(where.recurring, 'state is live, direction is out');
  assert.equal(where.installments, 'state is open, direction is out');
  assert.ok(OUT_LEGS.at(-1)!.everyday, 'everyday spending is not in the walk');
});

test('PAY IN EVERY MONTH LASTS THE YEAR, AND WITH NO INCOME GBP 1,200.00 PAYS THE RENT TWICE AND RUNS OUT ON THE THIRD, 68 days on', async () => {
  const { k } = await lived();
  const runway = reading(k, 'runway-days');
  assert.equal(runway.value, null, 'on what is due the money never goes under');
  assert.ok(runway.beyond, 'the walk reached its last day above zero');
  /* MEASURED FROM THE WALK: GBP 1,200.00 less GBP 500.00 on 10 September is GBP 700.00, less GBP 500.00 on 10 October
     is GBP 200.00, and on 10 November it goes under. 3 September to 10 November is 27 + 31 + 10 = 68 days (the brief
     said 67, a month of 30 days counted where October has 31). The pay is not in this walk, so it moves nothing. */
  const lasts = reading(k, 'lasts-no-income');
  assert.equal(lasts.value, 68);
  assert.notEqual(lasts.met, false, 'running out with no income is the measure, never a miss');
});

test('MONEY OWED TO YOU AND MONEY ON ITS WAY TO AN ACCOUNT CHANGE IT BY NOTHING: neither is money going out', async () => {
  const { k } = await lived();
  make(k, 'obligations', { what: `Invoice to ${COMPANIES[2]}`, direction: 'owed_to_me', amount: gbp(900_000), due: day(20), state: 'open' });
  make(k, 'accounts', { name: `${BANKS[1]} payout`, kind: 'bank', liquid: false, arrives: day(14), balance: gbp(500_000), as_of: day(0) });
  assert.equal(reading(k, 'lasts-no-income').value, 68);
  /* AND A BILL OWED BY YOU IS MONEY OUT, so it does move it: GBP 300.00 on 1 October leaves GBP 400.00, and the
     rent on 10 October takes it under. */
  make(k, 'obligations', { what: 'Accountant', direction: 'owed_by_me', amount: gbp(30_000), due: day(28), state: 'open' });
  assert.equal(reading(k, 'lasts-no-income').value, 37);
});

test('THREE FULL MONTHS OF CLEARED SPENDING SHORTEN IT: the everyday leg is in the walk with no income', async () => {
  const { k, account } = await lived();
  /* GBP 1,100.00 a month of food and fuel in June, July and August, the three full months before 3 September. The rent
     line is GBP 500.00 a month of it already walked, so GBP 600.00 a month more is moved a week at a time. */
  for (const month of ['2026-06', '2026-07', '2026-08'])
    make(k, 'transactions', { what: 'Food and fuel', on: `${month}-12`, direction: 'out', amount: gbp(110_000), account, state: 'cleared' });
  const lasts = reading(k, 'lasts-no-income').value;
  assert.ok(lasts !== null && lasts < 68, `the money lasts ${String(lasts)} days with no income, as long as it did with no spending`);
});

/* THE LASTS TILE SAYS IT (money F3), beside the day on what is due, and the lead says
   what there is: the two answers to how long it lasts stood a screen apart, one in the line and one in the tile. */
test('MONEY\'S HERO SAYS IT, and the one line drawn says where the money is kept and that it lasts the year', async () => {
  const { k } = await lived();
  type Drawn = { kind: string; heading?: string; lead?: boolean; drawn?: boolean; body?: string; values?: Record<string, unknown>; cells?: { metric: string }[] };
  const blocks = value<{ blocks: Drawn[] }>(k.page('money')).blocks;
  const leads = blocks.filter((b) => b.kind === 'note' && b.lead === true && b.drawn !== false);
  assert.equal(leads.length, 1, 'one lead under the page name');
  /* NOTHING IS LATE HERE, SO SINCE money-core 3.33.0 (AF4) THE LINE IS THE YEAR AND THE CARD: what is late leads only while it is. */
  assert.equal(leads[0]!.body, 'Lasts the year on what is due.');
  assert.equal(leads[0]!.values?.['lasts-no-income'], undefined, 'the line says it again');
  /* THE HERO SAYS IT SINCE money-core 3.29.0, as the cell after the day it runs out on what is due, with the day it ends
     on in the sentence under it; the line says it lasts the year on what is due, so no cell says "Lasts past" beside it. */
  const hero = blocks.find((b) => b.kind === 'stat' && b.lead === true);
  assert.ok(hero?.cells?.some((c) => c.metric === 'lasts-no-income'), 'the hero does not say how long it lasts with nothing coming in');
  assert.equal(reading(k, 'lasts-no-income').value, 68);
});
