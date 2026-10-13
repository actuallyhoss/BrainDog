/**
 * The forecast's later controls, reachable from a declaration: the four knob words and the `sell:` figure.
 *
 * THE CONTROLS WERE BUILT AND NO PAGE COULD TURN THEM ON. `packages/render/src/forecast.ts` reads eight knob words and a
 * `sell` row, and this file's `KNOBS` held four, so a page that asked for `grow` was refused DECLARATION_INVALID and
 * the whole walk drew nothing. And holdings sold on a day need a figure the host has read, since the renderer only
 * does arithmetic over rows it was handed: `sell:` names that figure and `sells` is the answer.
 *
 * MONEY IS THE WORST PLACE TO BE WRONG, so every figure below is asserted to the minor unit against what the record
 * itself reads for the same declaration, and the figures are invented ones.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel, type PageBlock } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 17, 12);
const OWNER = { actor: 'p_1' };

const ACCOUNTS: Declaration = {
  id: 'register.accounts',
  kind: 'register',
  body: {
    id: 'accounts',
    name: 'Accounts',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'balance', type: 'money', required: true },
    ],
  },
};

const BILLS: Declaration = {
  id: 'register.bills',
  kind: 'register',
  body: {
    id: 'bills',
    name: 'Bills',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money', required: true },
      { id: 'due', type: 'day', required: true },
    ],
  },
};

const STORE: Declaration = {
  id: 'register.store',
  kind: 'register',
  body: {
    id: 'store',
    name: 'Store of value',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'worth', type: 'money' },
    ],
  },
};

const figure = (metric: string, name: string, source: string, sum: string, format: string): Declaration => ({
  id: `metric.${metric}`,
  kind: 'metric',
  body: { metric, name, source, value: { sum }, format, target: { gte: 0 }, window: '30d', compare: 'none' },
});

const value = <T>(r: unknown): T => {
  const out = r as { ok: boolean; value?: T };
  assert.ok(out.ok, JSON.stringify(out));
  return out.value as T;
};

async function record(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  value(
    await k.install([
      ACCOUNTS,
      BILLS,
      STORE,
      figure('cash-now', 'Cash now', 'register.accounts', 'balance', 'money.GBP'),
      figure('store-value', 'Store value', 'register.store', 'worth', 'money.GBP'),
    ]),
  );
  value(k.create('accounts', { name: 'Current', balance: { amount: 412_345, currency: 'GBP' } }, OWNER));
  value(k.create('bills', { what: 'Rent', amount: { amount: 600_000, currency: 'GBP' }, due: '2026-10-01' }, OWNER));
  value(k.create('store', { what: 'Coins', worth: { amount: 150_075, currency: 'GBP' } }, OWNER));
  value(k.create('store', { what: 'Bond', worth: { amount: 99_901, currency: 'GBP' } }, OWNER));
  return k;
}

const walk = (more: Partial<PageBlock> = {}): PageBlock => ({
  kind: 'forecast',
  source: 'forecast.runway',
  opening: { metric: 'cash-now' },
  from: [{ register: 'bills', on: 'due', amount: 'amount' }],
  horizon: 90,
  ...more,
});

test('EVERY KNOB THE RENDERER DRAWS IS A WORD A DECLARATION MAY TURN ON, and a word it does not draw is still refused', async () => {
  const k = await record();
  const all = k.block(walk({ knobs: ['horizon', 'late', 'spend', 'leave', 'grow', 'drift', 'count', 'sell'] }));
  assert.deepEqual(all.refusals, []);
  assert.equal(all.walk?.from, 412_345);
  const wrong = k.block(walk({ knobs: ['horizon', 'payrise'] }));
  assert.equal(wrong.refusals[0]?.code, 'DECLARATION_INVALID');
  assert.equal(wrong.refusals[0]?.at, 'knobs');
  assert.equal(wrong.walk, undefined, 'a refused knob list draws no walk, as before');
});

test('WHAT THE SELL CONTROL MAY COUNT AS SOLD IS THE FIGURE `sell:` NAMES, to the minor unit, in the walk’s own money', async () => {
  const k = await record();
  const out = k.block(walk({ knobs: ['sell'], sell: { metric: 'store-value' } }));
  assert.deepEqual(out.refusals, []);
  /* THE SAME DECLARATION READ ON ITS OWN, so the number on the control is the number the record holds and not a copy. */
  const read = value<{ value: number; unit: string }>(k.metric(k.metricDecl('store-value')!));
  assert.equal(read.value, 249_976, 'GBP 1,500.75 and GBP 999.01');
  assert.deepEqual(out.sells, [{ label: 'Store value', value: read.value }]);
  assert.equal(out.walk?.currency, read.unit);
  /* AND THE WALK ITSELF IS NOT MOVED: holdings are sold only when a reader picks a day, which the host never does. */
  assert.deepEqual(out.walk, k.block(walk()).walk);
});

test('A SELL FIGURE IN ANOTHER CURRENCY IS NOT OFFERED, rather than counted as the walk’s money', async () => {
  const k2 = await openRecord(openSqlite(), fixedClock(NOW));
  value(await k2.install([ACCOUNTS, BILLS, STORE, figure('cash-now', 'Cash now', 'register.accounts', 'balance', 'money.GBP'), figure('store-value', 'Store value', 'register.store', 'worth', 'money.USD')]));
  value(k2.create('accounts', { name: 'Current', balance: { amount: 412_345, currency: 'GBP' } }, OWNER));
  value(k2.create('bills', { what: 'Rent', amount: { amount: 600_000, currency: 'GBP' }, due: '2026-10-01' }, OWNER));
  value(k2.create('store', { what: 'Coins', worth: { amount: 150_075, currency: 'USD' } }, OWNER));
  /* THE FIGURE READS, so what is left out below is left out for its currency and not for reading nothing. */
  assert.deepEqual(
    (({ value: v, unit }) => ({ v, unit }))(value<{ value: number; unit: string }>(k2.metric(k2.metricDecl('store-value')!))),
    { v: 150_075, unit: 'USD' },
  );
  const out = k2.block(walk({ sell: { metric: 'store-value' } }));
  assert.deepEqual(out.refusals, []);
  assert.equal(out.walk?.currency, 'GBP');
  assert.deepEqual(out.sells, [], 'USD 1,500.75 is not GBP 1,500.75');
});

test('A WALK WITH NOTHING DUE STILL OFFERS THE SELL FIGURE, in the money its opening figure is', async () => {
  /* NO BILLS AT ALL, so the walk has no step to take a currency from. Measured: with the opening's unit
     taken out as the fallback, `sells` came back empty here and every other test in this file still passed. */
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  value(await k.install([ACCOUNTS, BILLS, STORE, figure('cash-now', 'Cash now', 'register.accounts', 'balance', 'money.GBP'), figure('store-value', 'Store value', 'register.store', 'worth', 'money.GBP')]));
  value(k.create('accounts', { name: 'Current', balance: { amount: 412_345, currency: 'GBP' } }, OWNER));
  value(k.create('store', { what: 'Coins', worth: { amount: 150_075, currency: 'GBP' } }, OWNER));
  const out = k.block(walk({ sell: { metric: 'store-value' } }));
  assert.deepEqual(out.refusals, []);
  assert.equal(out.walk?.steps.length, 0);
  assert.deepEqual(out.sells, [{ label: 'Store value', value: 150_075 }]);
});

test('A SELL FIGURE THAT HOLDS NOTHING, OR LESS THAN NOTHING, IS NOT OFFERED', async () => {
  /* A ZERO WAS OFFERED WHEN THE `> 0` WAS TAKEN OUT, and no other test here noticed: a control called `Store value sold on`
     that moves nothing is a control that says something is there when nothing is. */
  const k = await record();
  value(k.create('store', { what: 'Loan against the coins', worth: { amount: -249_976, currency: 'GBP' } }, OWNER));
  assert.equal(value<{ value: number }>(k.metric(k.metricDecl('store-value')!)).value, 0);
  assert.deepEqual(k.block(walk({ sell: { metric: 'store-value' } })).sells, []);
  value(k.create('store', { what: 'Margin call', worth: { amount: -1, currency: 'GBP' } }, OWNER));
  assert.deepEqual(k.block(walk({ sell: { metric: 'store-value' } })).sells, []);
});

test('A SELL FIGURE NOBODY DECLARED IS SAID, and so is a `sell:` that names no figure', async () => {
  const k = await record();
  const unknown = k.block(walk({ sell: { metric: 'store-later' } }));
  assert.equal(unknown.refusals[0]?.code, 'METRIC_UNKNOWN');
  assert.equal(unknown.refusals[0]?.at, 'sell');
  const shapeless = k.block(walk({ sell: 'store-value' as never }));
  assert.equal(shapeless.refusals[0]?.code, 'DECLARATION_INVALID');
  assert.equal(shapeless.refusals[0]?.at, 'sell');
});

test('A WALK THAT READS A SELL FIGURE READS THAT FIGURE’S LIST, so a reader who may not open the list is not handed its total', async () => {
  const k = await record();
  assert.deepEqual(k.blockRegisters(walk()).sort(), ['accounts', 'bills']);
  assert.deepEqual(k.blockRegisters(walk({ sell: { metric: 'store-value' } })).sort(), ['accounts', 'bills', 'store']);
});

test('ONE WALK A CURRENCY CARRIES NO SELLS ON THE BLOCK, since each walk is drawn with the block’s keys and a figure has one currency', async () => {
  const k = await record();
  value(k.create('bills', { what: 'Hosting', amount: { amount: 1_000, currency: 'USD' }, due: '2026-09-20' }, OWNER));
  const out = k.block(walk({ sell: { metric: 'store-value' } }));
  assert.deepEqual(out.refusals, []);
  assert.equal(out.walks?.length, 2);
  assert.equal(out.sells, undefined);
  /* THE FIGURE IS IN POUNDS, so it is the pound walk's and never the dollar walk's (`walkSells`). */
  assert.deepEqual(out.walks?.map((w) => [w.currency, w.sells]), [['GBP', [{ label: 'Store value', value: 249_976 }]], ['USD', []]]);
});

/** A second store of value, held in dollars, so a record holds one sellable figure in each of two currencies. */
const VAULT: Declaration = { id: 'register.vault', kind: 'register', body: { ...(STORE.body as object), id: 'vault', name: 'Vault' } } as never;

/** A figure a sell knob may offer without a page naming it: `sellable: true` beside the rest. */
const sellable = (metric: string, name: string, source: string, format: string): Declaration => {
  const decl = figure(metric, name, source, 'worth', format);
  return { ...decl, body: { ...(decl.body as object), sellable: true } } as never;
};

/** Accounts in pounds and dollars with no rate between them, a bill in each, and one holding in each. */
async function twoMoneys(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  value(
    await k.install([
      ACCOUNTS,
      BILLS,
      STORE,
      VAULT,
      figure('cash-now', 'Cash now', 'register.accounts', 'balance', 'money'),
      sellable('coins-value', 'Coins', 'register.store', 'money.GBP'),
      sellable('bonds-value', 'Bonds', 'register.vault', 'money.USD'),
    ]),
  );
  value(k.create('accounts', { name: 'Current', balance: { amount: 412_345, currency: 'GBP' } }, OWNER));
  value(k.create('accounts', { name: 'Dollar account', balance: { amount: 90_010, currency: 'USD' } }, OWNER));
  value(k.create('bills', { what: 'Rent', amount: { amount: 600_000, currency: 'GBP' }, due: '2026-10-01' }, OWNER));
  value(k.create('bills', { what: 'Hosting', amount: { amount: 1_000, currency: 'USD' }, due: '2026-09-20' }, OWNER));
  value(k.create('store', { what: 'Coins', worth: { amount: 150_075, currency: 'GBP' } }, OWNER));
  value(k.create('vault', { what: 'Bond', worth: { amount: 99_901, currency: 'USD' } }, OWNER));
  return k;
}

test('EACH WALK OF A GROUP IS OFFERED ITS OWN HOLDING ONLY, the one in its own currency, and the block itself none', async () => {
  const k = await twoMoneys();
  const out = k.block(walk({ knobs: ['sell'] }));
  assert.deepEqual(out.refusals, []);
  /* EACH FIGURE READS, so a walk that is not offered one is not offered it for its currency. */
  const read = (id: string) => (({ value: v, unit }) => ({ v, unit }))(value<{ value: number; unit: string }>(k.metric(k.metricDecl(id)!)));
  assert.deepEqual(read('coins-value'), { v: 150_075, unit: 'GBP' });
  assert.deepEqual(read('bonds-value'), { v: 99_901, unit: 'USD' });
  assert.deepEqual(
    out.walks?.map((w) => ({ currency: w.currency, from: w.from, sells: w.sells })),
    [
      { currency: 'GBP', from: 412_345, sells: [{ label: 'Coins', value: 150_075 }] },
      { currency: 'USD', from: 90_010, sells: [{ label: 'Bonds', value: 99_901 }] },
    ],
  );
  assert.equal(out.sells, undefined, 'one list on the block would be written under both walks');
  /* AND NO WALK IS MOVED BY WHAT IT MAY SELL, nor offered anything when the block has no sell control. */
  const plain = k.block(walk());
  assert.deepEqual(plain.walks?.map((w) => w.sells), [undefined, undefined]);
  assert.deepEqual(out.walks?.map(({ sells: _sells, ...w }) => w), plain.walks);
});

test('A WALK OF A GROUP THAT HOLDS NOTHING TO SELL IS OFFERED AN EMPTY LIST, and a `sell:` figure goes to its own walk', async () => {
  const k = await twoMoneys();
  /* `sell:` NAMES THE POUND FIGURE: the dollar walk is offered nothing, rather than GBP 1,500.75 as dollars. */
  const named = k.block(walk({ knobs: ['sell'], sell: { metric: 'coins-value' } }));
  assert.deepEqual(named.refusals, []);
  assert.deepEqual(named.walks?.map((w) => [w.currency, w.sells]), [['GBP', [{ label: 'Coins', value: 150_075 }]], ['USD', []]]);
  /* THE BOND IS SOLD FOR REAL, so the dollar walk has nothing left to offer and the pound walk is as it was. */
  value(k.create('vault', { what: 'Bond sold', worth: { amount: -99_901, currency: 'USD' } }, OWNER));
  const after = k.block(walk({ knobs: ['sell'] }));
  assert.deepEqual(after.walks?.map((w) => [w.currency, w.sells]), [['GBP', [{ label: 'Coins', value: 150_075 }]], ['USD', []]]);
  /* A `sell:` NOBODY DECLARED IS STILL SAID ONCE, by the block, and no walk is drawn. */
  const unknown = k.block(walk({ sell: { metric: 'store-later' } }));
  assert.equal(unknown.refusals[0]?.code, 'METRIC_UNKNOWN');
  assert.equal(unknown.walks, undefined);
});

test('A WALK SAYS THE PAGE’S LINE SAYS WHEN IT RUNS OUT only while that line is drawn, and `headline:` takes one word', async () => {
  const k = await record();
  assert.deepEqual(k.block(walk({ headline: 'under' })).refusals, []);
  const wrong = k.block(walk({ headline: 'over' as never }));
  assert.equal(wrong.refusals[0]?.at, 'headline');
  /* THE LINE IS DRAWN ON ONE PAGE AND HELD BACK BY ITS `when:` ON THE OTHER, as Money's is with two books. */
  const page = (slug: string, gt: number): Declaration => ({
    id: `page.${slug}`,
    kind: 'page',
    body: {
      page: slug,
      title: slug,
      blocks: [
        { kind: 'note', lead: true, body: 'It runs out soon.', when: { metric: 'cash-now', gt } },
        { ...walk({ headline: 'under' }), heading: 'Cash ahead', empty: 'Nothing dated.' },
      ],
    } as never,
  });
  value(await k.install([page('said', 0), page('unsaid', 1_000_000_000)]));
  const forecastOn = (slug: string) => value<{ blocks: Record<string, unknown>[] }>(k.page(slug)).blocks.find((b) => b.kind === 'forecast')!;
  assert.equal(forecastOn('said').headline, 'under');
  assert.equal(forecastOn('unsaid').headline, undefined, 'the chart left its sentence off for a line nobody drew');
});

test('A WALK THAT OFFERS `last` WALKS TO THE LAST DATED MOVEMENT, opens on `horizon:`, and never stops short of a longer length', async () => {
  const k = await record();
  /* A PLAN'S LAST PAYMENT IN MARCH: "To the end" over a walk that stopped at 90 days drew three months under its name. */
  value(k.create('bills', { what: 'Last instalment', amount: { amount: 25_000, currency: 'GBP' }, due: '2027-03-15' }, OWNER));
  const reachOf = (more: Partial<PageBlock>) => {
    const read = k.block(walk(more));
    assert.deepEqual(read.refusals, []);
    const w = (read as { walk?: { horizon: number; reach?: number; steps: { day: string }[] } }).walk!;
    return { opens: w.horizon, reach: w.reach ?? null, last: w.steps.at(-1)?.day ?? null };
  };
  assert.deepEqual(reachOf({ horizons: [90, 'last'] }), { opens: 90, reach: 179, last: '2027-03-15' });
  /* A LONGER NUMBER STILL HOLDS, so the year is in reach though the last movement comes sooner. */
  assert.equal(reachOf({ horizons: [90, 365, 'last'] }).reach, 365);
  assert.equal(reachOf({ horizons: [90, 180] }).reach, 180);
  /* AND A WALK THAT OFFERS NOTHING LONGER WALKS WHAT IT OPENS ON. */
  assert.deepEqual(reachOf({ horizons: [30, 90] }), { opens: 90, reach: null, last: '2026-10-01' });
});

test('A WALK REACHES A YEAR AND A DAY PAST WHAT IT OPENS ON UNASKED, and a longer length it offers when a reader picks it', async () => {
  const k = await record();
  /* A PLAN RUNNING THREE YEARS: walked to the five years Money offered, each load walked 1,825 days for a chart opening on 90. */
  value(k.create('bills', { what: 'Last instalment', amount: { amount: 25_000, currency: 'GBP' }, due: '2029-09-01' }, OWNER));
  const reachOf = (more: Partial<PageBlock>, walkTo?: number | 'last') => {
    const read = k.block(walk(more), walkTo === undefined ? {} : { walk: walkTo });
    assert.deepEqual(read.refusals, []);
    const w = (read as { walk?: { horizon: number; reach?: number } }).walk!;
    return { opens: w.horizon, reach: w.reach ?? null };
  };
  /* Unasked, the five years and the end are walked as far as two years and a day, and Money's two years in full. */
  assert.deepEqual(reachOf({ horizons: [90, 365, 730, 1825] }), { opens: 90, reach: 730 });
  assert.deepEqual(reachOf({ horizons: [90, 1825] }), { opens: 90, reach: null }, 'a length past two years was walked unasked');
  assert.deepEqual(reachOf({ horizons: [90, 365, 'last'] }), { opens: 90, reach: 731 });
  /* Asked, and offered: walked in full. */
  assert.deepEqual(reachOf({ horizons: [90, 365, 1825] }, 1825), { opens: 90, reach: 1825 });
  assert.ok((reachOf({ horizons: [90, 365, 'last'] }, 'last').reach ?? 0) > 1_000, 'To the end stopped at two years when asked for');
  /* Asked, and not offered: the block's own lengths are the bound on the work, whoever asks. */
  assert.deepEqual(reachOf({ horizons: [90, 365] }, 3650), { opens: 90, reach: 365 });
  assert.deepEqual(reachOf({ horizons: [90, 365] }, 'last'), { opens: 90, reach: 365 });
  /* Asked for a length the walk reaches anyway: walked as it is unasked, so the longer ones stay on the knob. */
  assert.deepEqual(reachOf({ horizons: [90, 365, 730] }, 365), { opens: 90, reach: 730 });
  /* A walk opening past the year walks what it opens on. */
  assert.deepEqual(reachOf({ horizon: 730, horizons: [730, 1825] }), { opens: 730, reach: null });
  /* And a page passes the asked length to its forecasts. */
  const page: Declaration = { id: 'page.ahead', kind: 'page', body: { page: 'ahead', title: 'Ahead', blocks: [{ ...walk({ horizons: [90, 1825] }), heading: 'Cash ahead' }] } as never };
  value(await k.install([page]));
  const forecastOf = (walkTo?: number) =>
    value<{ blocks: { kind: string; walk?: { reach?: number } }[] }>(k.page('ahead', undefined, walkTo === undefined ? {} : { walk: walkTo })).blocks.find((b) => b.kind === 'forecast')!;
  assert.equal(forecastOf().walk?.reach, undefined);
  assert.equal(forecastOf(1825).walk?.reach, 1825);
});
