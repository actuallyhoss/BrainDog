/**
 * A difference is read in parts, and against the window before.
 *
 * "spent-vs-last-month (diff, for "Outings up 40%" note and paired bars)". A difference of two halves grouped
 * by a field was refused whole, "a ratio or a diff is not grouped in this build; group each half as its own figure",
 * so nothing could say which category moved against last month. Held here:
 *
 *  - a difference grouped by one field answers one difference for each part;
 *  - `before` reads the second half over the same words against a moved clock, so "this month so far" is taken from
 *    last month up to the same day number, and a part only one of the two months holds counts the other as nought;
 *  - two halves that name two fields are still refused by name, and so is a ratio in parts;
 *  - the comparison gate is asked of each part on its own, so a part with too little on either side shows no change.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Group, type Kernel, type Reading } from '../src/index.ts';
import { monthBefore } from '../src/metrics.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

/** 13 October 2026, midday. A month before is 13 September. */
const NOW = Date.UTC(2026, 9, 13, 12);
const OWNER = { actor: 'p_1' };

const TRANSACTIONS = {
  id: 'register.transactions',
  kind: 'register',
  body: {
    id: 'transactions',
    name: 'Transactions',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'on', type: 'day' },
      { id: 'amount', type: 'money', required: true },
      { id: 'refund', type: 'money' },
      { id: 'category', type: 'text' },
      { id: 'shop', type: 'text' },
    ],
  },
} as unknown as Declaration;

const egp = (amount: number) => ({ amount, currency: 'EGP' });

/** [category, day, amount]. What is dated after 13 September, or in August, is in neither half. */
const SPENT: [string, string, number][] = [
  ['Outing', '2026-10-02', 700], ['Outing', '2026-10-05', 700],
  ['Outing', '2026-09-03', 500], ['Outing', '2026-09-13', 500], ['Outing', '2026-09-20', 5000],
  ['Food', '2026-10-01', 300], ['Food', '2026-10-03', 300], ['Food', '2026-10-10', 400],
  ['Food', '2026-09-02', 600], ['Food', '2026-09-12', 600], ['Food', '2026-08-05', 9990],
  ['Gift', '2026-10-06', 500],
  ['Rent', '2026-09-01', 9000],
  ['Taxi', '2026-10-04', 100],
  ['Taxi', '2026-09-01', 100], ['Taxi', '2026-09-02', 100], ['Taxi', '2026-09-03', 100], ['Taxi', '2026-09-04', 100], ['Taxi', '2026-09-05', 100],
  ['Books', '2026-10-07', 200], ['Books', '2026-10-08', 200], ['Books', '2026-10-09', 200],
  ['Books', '2026-09-04', 200],
];

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([TRANSACTIONS]);
  assert.ok(installed.ok, JSON.stringify(installed));
  for (const [category, on, amount] of SPENT) {
    const made = k.create('transactions', { what: `${category} ${on}`, on, amount: egp(amount), refund: egp(amount / 10), category, shop: on < '2026-10-01' ? 'Old' : 'New' }, OWNER);
    assert.ok(made.ok, JSON.stringify(made));
  }
  return { k, sql };
}

const BASE = { source: 'register.transactions', format: 'money', target: { gte: 0 }, window: '30d', compare: 'none' };

/** This month so far less last month up to the same day number, by category. */
const VS_LAST = {
  ...BASE,
  metric: 'spent-vs-last-month',
  name: 'Spent against last month',
  where: 'on at least bom',
  value: { diff: { of: { sum: 'amount' }, per: { sum: 'amount' }, before: 'month_ago' } },
  group_by: 'category',
};

const read = (k: Kernel, decl: object): Reading => {
  const out = k.metric(decl as never, {});
  assert.ok(out.ok, out.ok ? '' : JSON.stringify(out));
  return out.value;
};
const refused = (k: Kernel, decl: object): { code: string; fix: string } => {
  const out = k.metric(decl as never, {});
  assert.ok(!out.ok && 'refusal' in out, JSON.stringify(out));
  return out.refusal;
};
const part = (r: Reading, key: string): Group => {
  const g = (r.groups ?? []).find((x) => x.key === key);
  assert.ok(g, `no part called ${key} in ${JSON.stringify(r.groups)}`);
  return g;
};

test('A DIFFERENCE GROUPED BY ONE FIELD ANSWERS ONE DIFFERENCE FOR EACH PART, over the entries of that part alone', async () => {
  const { k, sql } = await record();
  const net = { ...BASE, metric: 'net-by-category', name: 'Net, by category', where: 'on at least bom', value: { diff: { of: { sum: 'amount' }, per: { sum: 'refund' } } }, group_by: 'category' };
  const r = read(k, net);
  assert.equal(r.value, 3600 - 360);
  assert.deepEqual(
    (r.groups ?? []).map((g) => [g.key, g.value, g.rows]),
    [['Outing', 1260, 2], ['Food', 900, 3], ['Books', 540, 3], ['Gift', 450, 1], ['Taxi', 90, 1]],
  );
  /* No window before was asked for, so no part says a change. */
  assert.ok((r.groups ?? []).every((g) => g.delta === undefined && g.halves === undefined));

  /* THE HALVES MAY NAME THE FIELD THEMSELVES, when both name the same one, and the answer is the same. */
  const { group_by: _, ...bare } = net;
  const own = read(k, { ...bare, value: { diff: { of: { sum: 'amount', group_by: 'category' }, per: { sum: 'refund', group_by: 'category' } } } });
  assert.deepEqual(own.groups, r.groups);
  sql.close();
});

test('TWO HALVES GROUPED BY TWO FIELDS ARE STILL REFUSED BY NAME, and so is a ratio in parts', async () => {
  const { k, sql } = await record();
  const two = refused(k, { ...BASE, metric: 'two-ways', name: 'Two ways', value: { diff: { of: { sum: 'amount', group_by: 'category' }, per: { sum: 'refund', group_by: 'shop' } } } });
  assert.equal(two.code, 'NOT_IN_THIS_BUILD');
  assert.match(two.fix, /category/u);
  assert.match(two.fix, /shop/u);

  /* One half grouped and the other not is two shapes as well. */
  assert.equal(refused(k, { ...BASE, metric: 'one-way', name: 'One way', value: { diff: { of: { sum: 'amount', group_by: 'category' }, per: { sum: 'refund' } } } }).code, 'NOT_IN_THIS_BUILD');
  /* And a half that disagrees with the figure's own grouping. */
  assert.equal(
    refused(k, { ...BASE, metric: 'against', name: 'Against', group_by: 'category', value: { diff: { of: { sum: 'amount', group_by: 'shop' }, per: { sum: 'refund', group_by: 'shop' } } } }).code,
    'NOT_IN_THIS_BUILD',
  );

  const ratio = refused(k, { ...BASE, metric: 'share', name: 'Share', format: 'pct', value: { ratio: { of: { sum: 'refund' }, per: { sum: 'amount' } } }, group_by: 'category' });
  assert.equal(ratio.code, 'NOT_IN_THIS_BUILD');
  assert.match(ratio.fix, /ratio/u);
  sql.close();
});

test('THIS MONTH SO FAR LESS LAST MONTH TO THE SAME DAY, BY CATEGORY, and a part in one month only counts the other as nought', async () => {
  const { k, sql } = await record();
  const r = read(k, VS_LAST);

  /* THE WHOLE: 3,600 this month so far against 11,900 to 13 September. The 20th and August are in neither. */
  assert.equal(r.value, 3600 - 11_900);
  assert.deepEqual(r.halves, { of: 3600, per: 11_900, perRows: 11 });
  assert.equal(r.rows, 10);
  assert.equal(r.unit, 'EGP');
  assert.ok(Math.abs(r.delta! - (3600 - 11_900) / 11_900) < 1e-12, r.why);

  /* "Outings up 40%": 1,400 against 1,000, two entries each side. */
  const outing = part(r, 'Outing');
  assert.equal(outing.value, 400);
  assert.deepEqual(outing.halves, { of: 1400, per: 1000, perRows: 2 });
  assert.ok(Math.abs(outing.delta! - 0.4) < 1e-12);
  assert.equal(outing.why, '');
  assert.ok(Math.abs(part(r, 'Food').delta! - (1000 - 1200) / 1200) < 1e-12);

  /* ONLY THIS MONTH, AND ONLY LAST MONTH: the other side is nought, and the difference is still said. */
  const gift = part(r, 'Gift');
  assert.deepEqual([gift.value, gift.rows, gift.halves], [500, 1, { of: 500, per: 0, perRows: 0 }]);
  const rent = part(r, 'Rent');
  assert.deepEqual([rent.value, rent.rows, rent.halves], [-9000, 0, { of: 0, per: 9000, perRows: 1 }]);

  /* Every part either month holds, the largest difference first, and the name breaking a tie at 400. */
  assert.deepEqual((r.groups ?? []).map((g) => g.key), ['Gift', 'Books', 'Outing', 'Food', 'Taxi', 'Rent']);
  sql.close();
});

test('THE COMPARISON GATE IS ASKED OF EACH PART ON ITS OWN, so a part with too little on either side shows no change', async () => {
  const { k, sql } = await record();
  const r = read(k, VS_LAST);
  const why = (key: string): [number | null | undefined, string | undefined] => [part(r, key).delta, part(r, key).why];

  /* The whole figure passes the gate, ten entries against eleven, and these parts do not. */
  assert.notEqual(r.delta, null);
  assert.deepEqual(why('Gift'), [null, 'one of the two windows is empty']);
  assert.deepEqual(why('Rent'), [null, 'one of the two windows is empty']);
  assert.deepEqual(why('Books'), [null, 'the window before has under half the rows']);
  /* One taxi this month against five by this day last month: the first week of a month is not good news. */
  assert.deepEqual(why('Taxi'), [null, 'this window has under half the rows of the one before']);
  /* The difference itself is still the difference. */
  assert.equal(part(r, 'Taxi').value, 100 - 500);
  sql.close();
});

test('THE WINDOW BEFORE IS A WORD, and it is not cut by date', async () => {
  const { k, sql } = await record();
  /* Thirty days before 13 October is 13 September too, so `previous` under a 30d window reads the same halves. */
  const previous = read(k, { ...VS_LAST, value: { diff: { ...VS_LAST.value.diff, before: 'previous' } } });
  assert.deepEqual(previous.halves, { of: 3600, per: 11_900, perRows: 11 });
  /* A year before holds nothing, so every part is this month's alone. */
  const year = read(k, { ...VS_LAST, value: { diff: { ...VS_LAST.value.diff, before: 'year_ago' } } });
  assert.deepEqual([year.value, year.halves, year.delta, year.why], [3600, { of: 3600, per: 0, perRows: 0 }, null, 'one of the two windows is empty']);

  const word = refused(k, { ...VS_LAST, value: { diff: { ...VS_LAST.value.diff, before: 'last_week' } } });
  assert.equal(word.code, 'DECLARATION_INVALID');
  assert.match(word.fix, /month_ago/u);
  const cut = refused(k, { ...VS_LAST, group_by: 'on', bucket: 'week' });
  assert.equal(cut.code, 'DECLARATION_INVALID');

  /* WORDS THAT NAME NO DAY MOVE NOTHING: both halves are the same entries, and no change is claimed of any part. */
  const still = read(k, { ...VS_LAST, where: undefined });
  assert.equal(still.delta, null);
  assert.match(still.why, /does not mention time/u);
  assert.ok((still.groups ?? []).every((g) => g.delta === null && g.value === 0));
  sql.close();
});

test('A MONTH BEFORE IS THE SAME DAY NUMBER LAST MONTH, cut to the last day that month has', () => {
  const day = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
  assert.equal(day(monthBefore(Date.UTC(2026, 9, 13, 12))), '2026-09-13');
  assert.equal(day(monthBefore(Date.UTC(2026, 9, 31, 12))), '2026-09-30');
  assert.equal(day(monthBefore(Date.UTC(2026, 2, 31, 12))), '2026-02-28');
  assert.equal(day(monthBefore(Date.UTC(2026, 0, 15, 12))), '2025-12-15');
});

test('A PART IN TWO CURRENCIES WITH NO RATE IS ONE DIFFERENCE FOR EACH, never the two subtracted, and it installs', async () => {
  const { k, sql } = await record();
  const installed = await k.install([{ id: 'metric.spent-vs-last-month', kind: 'metric', body: VS_LAST } as never]);
  assert.ok(installed.ok, JSON.stringify(installed));
  for (const [on, amount] of [['2026-10-03', 50], ['2026-09-04', 30]] as const)
    assert.ok(k.create('transactions', { what: `Outing abroad ${on}`, on, amount: { amount, currency: 'USD' }, category: 'Outing', shop: 'Abroad' }, OWNER).ok);
  const r = read(k, VS_LAST);
  assert.equal(r.value, null);
  assert.deepEqual(r.parts, [{ currency: 'EGP', amount: 3600 - 11_900 }, { currency: 'USD', amount: 20 }]);
  const outing = part(r, 'Outing');
  assert.deepEqual([outing.value, outing.parts], [null, [{ currency: 'EGP', amount: 400 }, { currency: 'USD', amount: 20 }]]);
  /* No one number each side, so no change is claimed of it. */
  assert.deepEqual([outing.delta, outing.why], [null, 'the window before has nothing to compare against']);
  /* And every other part says its one currency, so no bar is ranked across two. */
  assert.deepEqual(part(r, 'Gift').parts, [{ currency: 'EGP', amount: 500 }]);
  sql.close();
});

test('ONE CURRENCY THIS MONTH AND ANOTHER LAST MONTH IS NO CHANGE THAT MAY BE SAID, of the whole or of a part', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([TRANSACTIONS])).ok);
  const spent: [string, string, number, string][] = [['Food', '2026-10-02', 100, 'EGP'], ['Food', '2026-09-02', 70, 'USD'], ['Gift', '2026-09-03', 50, 'USD'], ['Taxi', '2026-10-03', 5, 'EGP']];
  for (const [category, on, amount, currency] of spent) assert.ok(k.create('transactions', { what: `${category} ${on}`, on, amount: { amount, currency }, category }, OWNER).ok);
  const r = read(k, VS_LAST);

  /* E£105 now against $120 then: one amount for each currency, and never a percentage across the two. */
  assert.deepEqual([r.value, r.parts], [null, [{ currency: 'EGP', amount: 105 }, { currency: 'USD', amount: -120 }]]);
  assert.deepEqual([r.halves, r.delta, r.why], [{ of: null, per: null, perRows: 2 }, null, 'the window before has nothing to compare against']);
  const food = part(r, 'Food');
  assert.deepEqual([food.value, food.parts], [null, [{ currency: 'EGP', amount: 100 }, { currency: 'USD', amount: -70 }]]);
  assert.deepEqual([food.halves, food.delta], [{ of: null, per: null, perRows: 1 }, null]);
  /* A part one month alone holds is in one currency, and says it. */
  assert.deepEqual([part(r, 'Gift').parts, part(r, 'Gift').halves], [[{ currency: 'USD', amount: -50 }], { of: 0, per: 50, perRows: 1 }]);
  sql.close();
});
