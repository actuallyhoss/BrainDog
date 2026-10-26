/**
 * Money across currencies: the dated rates, the home currency, and minor units that round once.
 *
 * `fx.ts` is the arithmetic both engines share; the second half drives it through a record, with the rates as rows of
 * an `fx` list and the home currency as a pack's setting, which is how a real record holds them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { across, barsOf, convertMinor, dayFieldOf, homeFrom, isAtLeast, jcs, openRecord, rateFor, ratesFrom, type MetricDecl, type Declaration, type Kernel, type Rate, type Reading } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 17, 12);

const RATES: Rate[] = [
  { currency: 'USD', base: 'EGP', rate: 48, as_of: '2026-09-01' },
  { currency: 'USD', base: 'EGP', rate: 50, as_of: '2026-09-15' },
];

/* ── the arithmetic ──────────────────────────────────────────────────────── */

test('A RATE IS THE NEWEST ON OR BEFORE THE DAY, else the earliest after it, and a pair quoted the other way is its inverse', () => {
  assert.deepEqual(rateFor(RATES, 'USD', 'EGP', '2026-09-10'), { rate: 48, as_of: '2026-09-01', forward: false });
  assert.deepEqual(rateFor(RATES, 'USD', 'EGP', '2026-09-15'), { rate: 50, as_of: '2026-09-15', forward: false });
  assert.deepEqual(rateFor(RATES, 'USD', 'EGP', '2026-08-01'), { rate: 48, as_of: '2026-09-01', forward: true });
  assert.deepEqual(rateFor(RATES, 'EGP', 'USD', '2026-09-20'), { rate: 1 / 50, as_of: '2026-09-15', forward: false });
  assert.equal(rateFor(RATES, 'GBP', 'EGP', '2026-09-20'), null);
  /* ONE DAY, BOTH WAYS ROUND: the pair as asked wins. */
  const both: Rate[] = [...RATES, { currency: 'EGP', base: 'USD', rate: 0.1, as_of: '2026-09-15' }];
  assert.equal(rateFor(both, 'USD', 'EGP', '2026-09-16')?.rate, 50);
});

test('MINOR UNITS ROUND ONCE, HALF AWAY FROM ZERO, in each currency’s own exponent', () => {
  /* EGP 10.05 at 0.02 dollars a pound is 20.1 cents, so 20. */
  assert.equal(convertMinor(1_005, 'EGP', 'USD', 0.02), 20);
  /* Half a cent goes away from zero, both ways. */
  assert.equal(convertMinor(125, 'EGP', 'USD', 0.02), 3);
  assert.equal(convertMinor(-125, 'EGP', 'USD', 0.02), -3);
  /* 0.29 is not a number binary holds, and 50 × 0.29 must still be 14.5 before it rounds to 15. */
  assert.equal(convertMinor(50, 'GBP', 'USD', 0.29), 15);
  /* A thousand yen is 1,000 minor units and 650 cents; a dinar has three places. */
  assert.equal(convertMinor(1_000, 'JPY', 'USD', 0.0065), 650);
  assert.equal(convertMinor(1_500, 'KWD', 'USD', 3.25), 488);
  assert.equal(convertMinor(4_200, 'USD', 'USD', 99), 4_200);
});

test('ACROSS: one currency is one amount, every rate converts, and with nothing converted it is the parts with each pair named', () => {
  const amounts = [
    { currency: 'EGP', amount: 5_000_000, day: '2026-09-10' },
    { currency: 'USD', amount: 340_000, day: '2026-09-10' },
    { currency: 'USD', amount: 10_050, day: '2026-09-16' },
  ];
  assert.deepEqual(across(amounts.slice(1), 'USD', [], '2026-09-17'), { kind: 'one', currency: 'USD', amount: 350_050 });
  /* Each amount at the rate as of its own day: 3,400 at 48 and 100.50 at 50. `asOf` IS THE OLDEST OF THE TWO RATES USED
     AND NOT THE NEWEST. It once read the newest, which made a figure sound more current than it was: half of this one
     is converted at the 1st and the answer said the 15th. A figure is only as current as the stalest rate behind it,
     which is what `rateFor`'s via rule one function away already said. */
  assert.deepEqual(across(amounts, 'EGP', RATES, '2026-09-17'), {
    kind: 'converted',
    currency: 'EGP',
    amount: 5_000_000 + 16_320_000 + 502_500,
    asOf: '2026-09-01',
    forward: false,
    stale: true,
    /* AND THE RATES OF THAT OLDEST DAY, one a currency, so a page can say "$1 = EGP 48" beside the figure. */
    pairs: [{ from: 'USD', rate: 48 }],
  });
  /* ONE MISSING RATE AND NOTHING ADDED UP IN: no amount is in dollars and none reaches them, so there is no total to
     be at least anything, and the answer is one amount a currency with the pair named. */
  assert.deepEqual(across([amounts[0]!, { currency: 'GBP', amount: 100, day: null }], 'USD', RATES.slice(0, 0), '2026-09-17'), {
    kind: 'parts',
    parts: [
      { currency: 'EGP', amount: 5_000_000 },
      { currency: 'GBP', amount: 100 },
    ],
    missing: ['EGP to USD', 'GBP to USD'],
  });
  /* NO CURRENCY CHOSEN TO ADD UP IN is the parts with nothing named, because no rate would do. */
  assert.deepEqual(across(amounts, 'EGP', RATES, '2026-09-17', false), { kind: 'parts', parts: [{ currency: 'EGP', amount: 5_000_000 }, { currency: 'USD', amount: 350_050 }], missing: [] });
  assert.deepEqual(across(amounts, null, RATES, '2026-09-17'), { kind: 'parts', parts: [{ currency: 'EGP', amount: 5_000_000 }, { currency: 'USD', amount: 350_050 }], missing: [] });
});

test('A SUM WITH ONE RATE MISSING CONVERTS WHAT IT CAN AND LISTS THE REST, and is at least that much', () => {
  const amounts = [
    { currency: 'EGP', amount: 5_000_000, day: '2026-09-10' },
    { currency: 'USD', amount: 340_000, day: '2026-09-10' },
    { currency: 'AED', amount: 120_000, day: '2026-09-12' },
    { currency: 'AED', amount: 0, day: '2026-09-16' },
  ];
  /* The pounds as they are, the dollars at 48, and the dirhams left out and listed: one part a currency. */
  const out = across(amounts, 'EGP', RATES, '2026-09-17');
  assert.deepEqual(out, {
    kind: 'atleast',
    currency: 'EGP',
    amount: 5_000_000 + 16_320_000,
    asOf: '2026-09-01',
    forward: false,
    stale: true,
    pairs: [{ from: 'USD', rate: 48 }],
    left: [{ currency: 'AED', amount: 120_000 }],
    missing: ['AED'],
  });
  assert.equal(isAtLeast(out), true);

  /* TWO CURRENCIES LEFT OUT are two parts in code order, and a rate standing in from a later day is still said. */
  const two = across([...amounts.slice(1), { currency: 'GBP', amount: 100, day: null }, { currency: 'USD', amount: 100, day: '2026-08-01' }], 'EGP', RATES, '2026-09-02');
  assert.deepEqual(two, {
    kind: 'atleast',
    currency: 'EGP',
    amount: 16_320_000 + 4_800,
    asOf: '2026-09-01',
    forward: true,
    stale: false,
    pairs: [{ from: 'USD', rate: 48 }],
    left: [{ currency: 'AED', amount: 120_000 }, { currency: 'GBP', amount: 100 }],
    missing: ['AED', 'GBP'],
  });

  /* ONLY THE HOME CURRENCY ADDED AND NO RATE AT ALL is still at least the home amounts, with no rate to date it. */
  assert.deepEqual(across(amounts, 'EGP', [], '2026-09-17'), {
    kind: 'atleast',
    currency: 'EGP',
    amount: 5_000_000,
    asOf: '',
    forward: false,
    stale: false,
    left: [{ currency: 'AED', amount: 120_000 }, { currency: 'USD', amount: 340_000 }],
    missing: ['AED', 'USD'],
  });

  /* A SUBTRACTION LEFT OUT IS NOT A LOWER BOUND. One dirham amount under nought, even where the dirhams together are
     over it, and the whole figure is one amount a currency with the pair named, as it always was. */
  const owed = across([...amounts, { currency: 'AED', amount: -500, day: '2026-09-14' }], 'EGP', RATES, '2026-09-17');
  assert.deepEqual(owed, {
    kind: 'parts',
    parts: [
      { currency: 'AED', amount: 119_500 },
      { currency: 'EGP', amount: 5_000_000 },
      { currency: 'USD', amount: 340_000 },
    ],
    missing: ['AED to EGP'],
  });
  assert.equal(isAtLeast(owed), false);

  /* AN AVERAGE, A LEAST AND A MOST ARE NEVER AT LEAST: leaving an amount out can move any of them either way. */
  for (const kind of ['avg', 'min', 'max'] as const) {
    const reduced = across(amounts, 'EGP', RATES, '2026-09-17', true, kind);
    assert.equal(reduced.kind, 'parts', kind);
    assert.deepEqual(reduced.kind === 'parts' ? reduced.missing : null, ['AED to EGP'], kind);
  }

  /* NO CURRENCY CHOSEN TO ADD UP IN is never at least either: nothing was converted. */
  assert.equal(across(amounts, 'EGP', RATES, '2026-09-17', false).kind, 'parts');
  assert.equal(across(amounts, null, RATES, '2026-09-17').kind, 'parts');

  /* NOTHING MISSING IS CONVERTED, exactly as before. */
  const whole = across(amounts.slice(0, 2), 'EGP', RATES, '2026-09-17');
  assert.deepEqual(whole, { kind: 'converted', currency: 'EGP', amount: 5_000_000 + 16_320_000, asOf: '2026-09-01', forward: false, stale: true, pairs: [{ from: 'USD', rate: 48 }] });
  assert.equal(isAtLeast(whole), false);
});

test('A RATE ROW THAT IS NOT WHOLE IS NOT A RATE, and a home currency is a code or nothing', () => {
  assert.deepEqual(
    ratesFrom([
      { currency: 'usd', base: 'EGP', rate: 48.5, as_of: '2026-09-01' },
      { currency: 'USD', base: 'USD', rate: 1, as_of: '2026-09-01' },
      { currency: 'USD', base: 'EGP', rate: 0, as_of: '2026-09-01' },
      { currency: 'USD', base: 'EGP', rate: 48 },
      { currency: 'US', base: 'EGP', rate: 48, as_of: '2026-09-01' },
    ]),
    [{ currency: 'USD', base: 'EGP', rate: 48.5, as_of: '2026-09-01' }],
  );
  assert.equal(homeFrom(' egp '), 'EGP');
  assert.equal(homeFrom('pounds'), null);
  assert.equal(dayFieldOf({ name: { type: 'text' }, as_of: { type: 'day' }, settled: { type: 'day' } }), 'as_of');
  assert.equal(dayFieldOf([{ id: 'name', type: 'text' }]), null);
});

/* ── through a record ────────────────────────────────────────────────────── */

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
      { id: 'as_of', type: 'day', index: true, required: true },
    ],
  } as never,
};

const FX: Declaration = {
  id: 'register.fx',
  kind: 'register',
  body: {
    id: 'fx',
    name: 'Rates',
    title: 'currency',
    fields: [
      { id: 'currency', type: 'text', required: true },
      { id: 'base', type: 'text', required: true },
      { id: 'rate', type: 'decimal', required: true },
      { id: 'as_of', type: 'day', index: true, required: true },
    ],
  } as never,
};

const CASH = {
  metric: 'cash-now',
  name: 'Cash now',
  source: 'register.accounts',
  value: { sum: 'balance' },
  group_by: undefined,
  format: 'money.GBP',
  target: { gte: 0 },
  window: '30d',
  compare: 'none',
} as const;

async function founder(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([ACCOUNTS, FX])).ok);
  for (const row of [
    { name: 'CIB', balance: { amount: 5_200_000, currency: 'EGP' }, as_of: '2026-09-10' },
    { name: 'Mercury', balance: { amount: 340_000, currency: 'USD' }, as_of: '2026-09-10' },
    { name: 'Wise', balance: { amount: 10_050, currency: 'USD' }, as_of: '2026-09-16' },
  ])
    assert.ok(k.create('accounts', row, { actor: 'p_1' }).ok);
  k.rememberPack({
    id: 'money-core',
    version: '1.0.0',
    source: 'local',
    ref: null,
    manifest: jcs({ pack: 'money-core', version: '1.0.0', config: { home_currency: { type: 'text' } } }),
    checksum: 'not-a-real-checksum',
  });
  return { k, sql };
}

const read = (k: Kernel, decl: object): Reading => {
  const out = k.metric(decl as never);
  assert.ok(out.ok, out.ok ? '' : JSON.stringify(out));
  return out.value;
};

test('A FOUNDER’S CASH IN EGP AND USD: parts with no home currency, parts naming the pair with one, converted with rates', async () => {
  const { k, sql } = await founder();

  const bare = read(k, CASH);
  assert.equal(bare.value, null);
  assert.deepEqual(bare.parts, [
    { currency: 'EGP', amount: 5_200_000 },
    { currency: 'USD', amount: 350_050 },
  ]);
  /* `into: null` BECAUSE NOBODY HAS CHOSEN A CURRENCY TO ADD UP IN, and `CASH` declares `money.GBP`
     only because a money figure names a currency for its target to mean anything. This line read
     `into: 'GBP'` while the declared format stood in for that choice, over a founder holding pounds
     Egyptian and dollars and no sterling at all. */
  assert.deepEqual(bare.fx, { into: null, home: null, asOf: null, forward: false, stale: false, missing: [] });

  assert.ok(k.setPackConfig('money-core', { home_currency: 'EGP' }, { actor: 'p_1' }).ok);
  /* AT LEAST: the pounds are added, the dollars no rate reaches are listed beside them, and no `value` is said, so
     nothing draws the lower bound as the total. */
  const home = read(k, CASH);
  assert.equal(home.atLeast, true);
  assert.deepEqual(home.noRate, [{ currency: 'USD', amount: 350_050 }]);
  assert.deepEqual(home.parts, [
    { currency: 'EGP', amount: 5_200_000 },
    { currency: 'USD', amount: 350_050 },
  ]);
  assert.deepEqual(home.fx, { into: 'EGP', home: 'EGP', asOf: null, forward: false, stale: false, missing: ['USD to EGP'] });
  assert.equal(home.value, null);
  assert.equal(home.unit, null);
  assert.equal(home.delta, null);

  for (const r of [
    { currency: 'USD', base: 'EGP', rate: 48, as_of: '2026-09-01' },
    { currency: 'USD', base: 'EGP', rate: 50, as_of: '2026-09-15' },
  ])
    assert.ok(k.create('fx', r, { actor: 'p_1' }).ok);
  const converted = read(k, CASH);
  /* 52,000 pounds, 3,400 dollars at 48 on the 10th, and 100.50 at 50 on the 16th. */
  assert.equal(converted.value, 5_200_000 + 16_320_000 + 502_500);
  assert.equal(converted.unit, 'EGP');
  assert.equal(converted.parts, undefined);
  assert.deepEqual(converted.fx, { into: 'EGP', home: 'EGP', asOf: '2026-09-01', forward: false, stale: true, pairs: [{ from: 'USD', rate: 48 }], missing: [] });
  assert.equal(converted.met, null, 'the target is in sterling, the figure it declares, so a figure in pounds has no verdict');

  /* THE OTHER WAY ROUND, the same rows read in dollars through the inverse. */
  assert.ok(k.setPackConfig('money-core', { home_currency: 'USD' }, { actor: 'p_1' }).ok);
  const dollars = read(k, CASH);
  assert.equal(dollars.unit, 'USD');
  /* 5,200,000 piastres at 1/50 is 104,000 cents: the balance is dated the 10th, so the rate of the 1st, 1/48, is 108,333.33. */
  assert.equal(dollars.value, 350_050 + 108_333);
  sql.close();
});

test('A GROUPED FIGURE IN TWO CURRENCIES IS PARTS IN EVERY GROUP, and converted in every group once the rates are there', async () => {
  const { k, sql } = await founder();
  const byDay = { ...CASH, metric: 'cash-by-month', group_by: 'as_of', bucket: 'month' };
  const parts = read(k, byDay);
  const sept = parts.groups?.find((g) => g.key === '2026-09');
  assert.equal(sept?.value, null);
  assert.deepEqual(sept?.parts, [
    { currency: 'EGP', amount: 5_200_000 },
    { currency: 'USD', amount: 350_050 },
  ]);

  assert.ok(k.setPackConfig('money-core', { home_currency: 'USD' }, { actor: 'p_1' }).ok);
  assert.ok(k.create('fx', { currency: 'EGP', base: 'USD', rate: 0.02, as_of: '2026-09-01' }, { actor: 'p_1' }).ok);
  const converted = read(k, byDay);
  assert.equal(converted.groups?.find((g) => g.key === '2026-09')?.value, 350_050 + 104_000);
  assert.equal(converted.groups?.find((g) => g.key === '2026-09')?.parts, undefined);
  sql.close();
});

test('A CASH WALK OVER TWO CURRENCIES names the rate it lacks, and walks in the home currency once it has it', async () => {
  const { k, sql } = await founder();
  const legs = [{ register: 'accounts', on: 'as_of', amount: 'balance' }];
  const bare = k.runway(0, legs, 30);
  assert.ok(bare.ok);
  assert.equal(bare.value.steps.length, 0);
  assert.match(bare.value.refusals[0]?.fix ?? '', /EGP and USD.*Set a home currency/u);

  assert.ok(k.setPackConfig('money-core', { home_currency: 'EGP' }, { actor: 'p_1' }).ok);
  const lacking = k.runway(0, legs, 30);
  assert.ok(lacking.ok);
  assert.match(lacking.value.refusals[0]?.fix ?? '', /no rate yet from USD to EGP/u);

  assert.ok(k.create('fx', { currency: 'USD', base: 'EGP', rate: 50, as_of: '2026-09-01' }, { actor: 'p_1' }).ok);
  const walk = k.runway(0, legs, 30);
  assert.ok(walk.ok);
  assert.equal(walk.value.currency, 'EGP');
  assert.deepEqual(walk.value.converted, { asOf: '2026-09-01', forward: false, stale: true });
  /* Every row is in the past, so each lands today, going out in pounds: 52,000 + 3,400 × 50 + 100.50 × 50. */
  assert.equal(walk.value.steps.at(-1)?.balance, -(5_200_000 + 17_000_000 + 502_500));
  sql.close();
});

test('A SERIES IN TWO CURRENCIES IS ONE CHART A CURRENCY, and one chart in the home currency once the rates are there', async () => {
  const { k, sql } = await founder();
  const byMonth = { ...CASH, metric: 'cash-by-month', group_by: 'as_of', bucket: 'month' } as unknown as MetricDecl;
  const draw = () => {
    const got = barsOf([{ metric: 'cash-by-month', label: 'Cash' }], 2, 0, () => byMonth, (d) => k.metric(d));
    assert.ok('bars' in got, JSON.stringify(got));
    return got.bars;
  };
  const split = draw();
  assert.deepEqual(split.keys, ['2026-09']);
  assert.deepEqual(split.split, [
    { unit: 'EGP', values: [[5_200_000]] },
    { unit: 'USD', values: [[350_050]] },
  ]);
  assert.equal(split.unit, 'EGP');

  assert.ok(k.setPackConfig('money-core', { home_currency: 'USD' }, { actor: 'p_1' }).ok);
  assert.ok(k.create('fx', { currency: 'EGP', base: 'USD', rate: 0.02, as_of: '2026-09-01' }, { actor: 'p_1' }).ok);
  const one = draw();
  assert.equal(one.split, undefined);
  assert.equal(one.unit, 'USD');
  assert.deepEqual(one.values, [[454_050]]);
  sql.close();
});

test('A PAIR NOBODY QUOTES IS READ THROUGH ONE BOTH ARE QUOTED AGAINST, as old as its older half', () => {
  const againstDollars: Rate[] = [
    { currency: 'USD', base: 'EGP', rate: 50, as_of: '2026-09-15' },
    { currency: 'USD', base: 'GBP', rate: 0.75, as_of: '2026-09-10' },
  ];
  const r = rateFor(againstDollars, 'GBP', 'EGP', '2026-09-17');
  assert.equal(r?.as_of, '2026-09-10');
  assert.equal(r?.forward, false);
  /* A pound is 1/0.75 dollars, and a dollar is 50 Egyptian pounds: GBP 10.00 is EGP 666.67. */
  assert.equal(convertMinor(1_000, 'GBP', 'EGP', r!.rate), 66_667);
});

test('AN AVERAGE, A LEAST AND A MOST ACROSS CURRENCIES are each currency’s own with no rate, and of the converted amounts with one', async () => {
  const { k, sql } = await founder();
  const of = (value: object) => read(k, { ...CASH, metric: 'cash-read', value });

  assert.deepEqual(of({ avg: 'balance' }).parts, [
    { currency: 'EGP', amount: 5_200_000 },
    { currency: 'USD', amount: 175_025 },
  ]);
  assert.deepEqual(of({ min: 'balance' }).parts, [
    { currency: 'EGP', amount: 5_200_000 },
    { currency: 'USD', amount: 10_050 },
  ]);
  const most = of({ max: 'balance' });
  assert.equal(most.value, null);
  assert.deepEqual(most.parts, [
    { currency: 'EGP', amount: 5_200_000 },
    { currency: 'USD', amount: 340_000 },
  ]);
  /* AND THE SAME HERE: the most is one amount per currency and the reading names no currency it was
     added up in, because none was chosen. It said `GBP` off the back of the declaration. */
  assert.deepEqual(most.fx, { into: null, home: null, asOf: null, forward: false, stale: false, missing: [] });

  assert.ok(k.setPackConfig('money-core', { home_currency: 'EGP' }, { actor: 'p_1' }).ok);
  assert.deepEqual(of({ avg: 'balance' }).fx?.missing, ['USD to EGP']);
  for (const r of [
    { currency: 'USD', base: 'EGP', rate: 48, as_of: '2026-09-01' },
    { currency: 'USD', base: 'EGP', rate: 50, as_of: '2026-09-15' },
  ])
    assert.ok(k.create('fx', r, { actor: 'p_1' }).ok);
  /* Each amount at its own day's rate first: 5,200,000, 16,320,000 and 502,500 piastres. */
  const avg = of({ avg: 'balance' });
  assert.equal(avg.value, (5_200_000 + 16_320_000 + 502_500) / 3);
  assert.equal(avg.unit, 'EGP');
  assert.equal(avg.parts, undefined);
  assert.deepEqual(avg.fx, { into: 'EGP', home: 'EGP', asOf: '2026-09-01', forward: false, stale: true, pairs: [{ from: 'USD', rate: 48 }], missing: [] });
  assert.equal(of({ min: 'balance' }).value, 502_500);
  assert.equal(of({ max: 'balance' }).value, 16_320_000);
  sql.close();
});

test('A RATIO AND A DIFF ACROSS CURRENCIES are one per currency with no rate, and of the converted halves with one', async () => {
  const { k, sql } = await founder();
  const spread = { ...CASH, metric: 'cash-spread', value: { diff: { of: { sum: 'balance' }, per: { min: 'balance' } } } };
  const each = { ...CASH, metric: 'cash-each', value: { ratio: { of: { sum: 'balance' }, per: { count: 'id' } } } };

  const apart = read(k, spread);
  assert.equal(apart.value, null);
  assert.deepEqual(apart.parts, [
    { currency: 'EGP', amount: 0 },
    { currency: 'USD', amount: 340_000 },
  ]);
  /* A count has no currency, so it is counted over the rows of the currency the other half is in. */
  assert.deepEqual(read(k, each).parts, [
    { currency: 'EGP', amount: 5_200_000 },
    { currency: 'USD', amount: 175_025 },
  ]);

  assert.ok(k.setPackConfig('money-core', { home_currency: 'EGP' }, { actor: 'p_1' }).ok);
  /* A HALF IS NEVER AT LEAST: a bound less a bound is a bound on nothing, so the diff stays one per currency. */
  const lacking = read(k, spread);
  assert.deepEqual(lacking.fx?.missing, ['USD to EGP'], 'still one per currency, and the rate it lacks named');
  assert.equal(lacking.atLeast, undefined);
  assert.equal(lacking.noRate, undefined);
  assert.deepEqual(lacking.parts, apart.parts);
  /* THE SUM ON ITS OWN IS: the pounds, then the dollars no rate reaches. */
  const sum = read(k, CASH);
  assert.equal(sum.atLeast, true);
  assert.deepEqual(sum.noRate, [{ currency: 'USD', amount: 350_050 }]);
  for (const r of [
    { currency: 'USD', base: 'EGP', rate: 48, as_of: '2026-09-01' },
    { currency: 'USD', base: 'EGP', rate: 50, as_of: '2026-09-15' },
  ])
    assert.ok(k.create('fx', r, { actor: 'p_1' }).ok);
  const converted = read(k, spread);
  assert.equal(converted.value, 5_200_000 + 16_320_000 + 502_500 - 502_500);
  assert.equal(converted.unit, 'EGP');
  assert.equal(converted.parts, undefined);
  assert.deepEqual(converted.fx, { into: 'EGP', home: 'EGP', asOf: '2026-09-01', forward: false, stale: true, missing: [] });
  assert.equal(read(k, each).value, (5_200_000 + 16_320_000 + 502_500) / 3);
  sql.close();
});

test('A TARGET IN THE DECLARED CURRENCY IS CONVERTED AT THE LATEST RATE, and judges the converted figure; with no rate there is no verdict', async () => {
  const { k, sql } = await founder();
  const cash = { ...CASH, target: { gte: 10_000_000 } };
  assert.ok(k.setPackConfig('money-core', { home_currency: 'EGP' }, { actor: 'p_1' }).ok);
  assert.ok(k.create('fx', { currency: 'USD', base: 'EGP', rate: 50, as_of: '2026-09-01' }, { actor: 'p_1' }).ok);

  const unjudged = read(k, cash);
  assert.equal(unjudged.unit, 'EGP');
  assert.equal(unjudged.targetIn, undefined, 'no rate from sterling, so no target in pounds');
  assert.equal(unjudged.met, null);

  for (const r of [
    { currency: 'GBP', base: 'EGP', rate: 60, as_of: '2026-09-02' },
    { currency: 'GBP', base: 'EGP', rate: 64, as_of: '2026-09-12' },
  ])
    assert.ok(k.create('fx', r, { actor: 'p_1' }).ok);
  const judged = read(k, cash);
  /* 100,000 pounds sterling at the latest rate, 64, is 6,400,000 Egyptian pounds. */
  assert.deepEqual(judged.targetIn, { currency: 'EGP', target: { gte: 640_000_000 }, asOf: '2026-09-12', forward: false, stale: false });
  assert.equal(judged.met, false);
  assert.equal(read(k, { ...cash, target: { lte: 640_000_000 } }).met, true);
  sql.close();
});

test('A CASH WALK OVER TWO CURRENCIES WITH NO RATE IS ONE WALK A CURRENCY, each from its part of the opening', async () => {
  const { k, sql } = await founder();
  assert.ok(
    (
      await k.install([
        { id: 'metric.cash-now', kind: 'metric', body: Object.fromEntries(Object.entries(CASH).filter(([key]) => key !== 'group_by')) } as unknown as Declaration,
        {
          id: 'register.bills',
          kind: 'register',
          body: { id: 'bills', name: 'Bills', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'amount', type: 'money', required: true }, { id: 'due', type: 'day', required: true }] },
        } as unknown as Declaration,
      ])
    ).ok,
  );
  for (const row of [
    { what: 'Rent', amount: { amount: 2_000_000, currency: 'EGP' }, due: '2026-09-25' },
    { what: 'Hosting', amount: { amount: 400_000, currency: 'USD' }, due: '2026-09-20' },
  ])
    assert.ok(k.create('bills', row, { actor: 'p_1' }).ok);
  const block = { kind: 'forecast', source: 'forecast.runway', opening: { metric: 'cash-now' }, from: [{ register: 'bills', on: 'due', amount: 'amount' }], horizon: 30 };

  const apart = k.block(block as never);
  assert.deepEqual(apart.refusals, []);
  assert.equal(apart.walk, undefined);
  assert.deepEqual(
    apart.walks?.map((w) => ({ currency: w.currency, from: w.from, end: w.steps.at(-1)?.balance, crossed: w.crossed?.label ?? null })),
    [
      { currency: 'EGP', from: 5_200_000, end: 3_200_000, crossed: null },
      { currency: 'USD', from: 350_050, end: -49_950, crossed: 'Hosting' },
    ],
  );
  assert.deepEqual(apart.walkFx, { home: null, missing: [] });

  assert.ok(k.setPackConfig('money-core', { home_currency: 'EGP' }, { actor: 'p_1' }).ok);
  const lacking = k.block(block as never);
  assert.equal(lacking.walks?.length, 2, 'still one walk a currency');
  assert.deepEqual(lacking.walkFx, { home: 'EGP', missing: ['USD to EGP'] });

  assert.ok(k.create('fx', { currency: 'USD', base: 'EGP', rate: 50, as_of: '2026-09-01' }, { actor: 'p_1' }).ok);
  const one = k.block(block as never);
  assert.equal(one.walks, undefined, 'converted, it is one walk');
  assert.equal(one.walk?.currency, 'EGP');
  assert.equal(one.walk?.from, 5_200_000 + 17_502_500);
  sql.close();
});

test('THE CURRENT MONTH IS WHAT WAS PAID SO FAR AND WHAT IS STILL DUE IN IT, and says so; a month with nothing due is so far', () => {
  const decl = (metric: string) => ({ metric, bucket: 'month', group_by: 'settled' }) as unknown as MetricDecl;
  const groups: Record<string, { key: string; value: number | null; rows: number; state: 'full' | 'partial' | 'empty' }[]> = {
    paid: [
      { key: '2026-08', value: 100_000, rows: 1, state: 'full' },
      { key: '2026-09', value: 40_000, rows: 1, state: 'partial' },
    ],
    due: [
      { key: '2026-09', value: 25_000, rows: 1, state: 'partial' },
      { key: '2026-10', value: 60_000, rows: 1, state: 'partial' },
    ],
    none: [{ key: '2026-10', value: 60_000, rows: 1, state: 'partial' }],
  };
  const read = (d: MetricDecl) => ({ ok: true as const, value: { groups: groups[d.metric] ?? [], current: '2026-09', unit: 'GBP' } });
  const bars = (then: string) => {
    const got = barsOf([{ metric: 'paid', then, label: 'In' }], 2, 1, decl, read);
    assert.ok('bars' in got, JSON.stringify(got));
    return got.bars;
  };
  const due = bars('due');
  assert.deepEqual(due.keys, ['2026-08', '2026-09', '2026-10']);
  assert.deepEqual(due.values, [[100_000, 65_000, 60_000]]);
  assert.deepEqual(due.states, ['', 'due', 'ahead']);
  const none = bars('none');
  assert.deepEqual(none.values, [[100_000, 40_000, 60_000]]);
  assert.deepEqual(none.states, ['', 'partial', 'ahead']);
});

test('AN OPENING THAT CONVERTS AND A BILL WITH NO RATE: the home walk draws what converts, and the bill walks on its own', async () => {
  const { k, sql } = await founder();
  assert.ok(
    (
      await k.install([
        { id: 'metric.cash-now', kind: 'metric', body: Object.fromEntries(Object.entries(CASH).filter(([key]) => key !== 'group_by')) } as unknown as Declaration,
        {
          id: 'register.bills',
          kind: 'register',
          body: { id: 'bills', name: 'Bills', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'amount', type: 'money', required: true }, { id: 'due', type: 'day', required: true }] },
        } as unknown as Declaration,
      ])
    ).ok,
  );
  for (const row of [
    { what: 'Rent', amount: { amount: 2_000_000, currency: 'EGP' }, due: '2026-09-25' },
    { what: 'Hosting', amount: { amount: 400_000, currency: 'USD' }, due: '2026-09-20' },
    { what: 'Domain', amount: { amount: 1_200, currency: 'GBP' }, due: '2026-09-22' },
  ])
    assert.ok(k.create('bills', row, { actor: 'p_1' }).ok);
  assert.ok(k.setPackConfig('money-core', { home_currency: 'EGP' }, { actor: 'p_1' }).ok);
  assert.ok(k.create('fx', { currency: 'USD', base: 'EGP', rate: 50, as_of: '2026-09-01' }, { actor: 'p_1' }).ok);
  const block = { kind: 'forecast', source: 'forecast.runway', opening: { metric: 'cash-now' }, from: [{ register: 'bills', on: 'due', amount: 'amount' }], horizon: 30 };

  const out = k.block(block as never);
  assert.deepEqual(out.refusals, []);
  assert.equal(out.walk, undefined, 'not one walk while a bill has no rate');
  assert.deepEqual(
    out.walks?.map((w) => ({ currency: w.currency, from: w.from, steps: w.steps.map((s) => [s.label, s.delta]) })),
    [
      { currency: 'EGP', from: 5_200_000 + 17_502_500, steps: [['Hosting', -20_000_000], ['Rent', -2_000_000]] },
      { currency: 'GBP', from: 0, steps: [['Domain', -1_200]] },
    ],
  );
  assert.deepEqual(out.walkFx, { home: 'EGP', missing: ['GBP to EGP'] });
  sql.close();
});

/**
 * A RATE HAD NO MAXIMUM AGE, which is the expensive kind of silence.
 *
 * `rateFor` takes the newest rate on or before the day and, failing that, the earliest after it,
 * with no bound in either direction. So a poll that quietly stopped two months ago — a paused
 * action, an expired key — went on converting at the old rate, and the only signal was a footnote
 * printed in the same ink whether the rate was yesterday's or July's. He holds EGP, where two
 * months of drift is not a rounding error.
 *
 * SEVEN DAYS, which is the number this tree already uses for the same question about a bank
 * balance (`accounts` declares `stale: { field: 'as_of', after: '7d' }`). A published rate comes
 * on weekdays, so a week covers a holiday without covering a poll that stopped.
 */
test('A FIGURE IS AS STALE AS THE OLDEST RATE UNDER IT, and it says so rather than reading current', () => {
  const stale: Rate[] = [
    { currency: 'USD', base: 'GBP', rate: 0.79, as_of: '2026-09-20' },
    { currency: 'EGP', base: 'GBP', rate: 0.016, as_of: '2026-07-14' },
  ];
  const amounts = [
    { currency: 'USD', amount: 100_00, day: '2026-09-20' },
    { currency: 'EGP', amount: 50_000_00, day: '2026-09-20' },
  ];

  /* THE OLDEST AND NOT THE NEWEST. Reporting the newest was the part that concealed it: the
     dollar half really is as of today, and saying so about the figure was false about the pound. */
  assert.deepEqual(across(amounts, 'GBP', stale, '2026-09-20'), {
    kind: 'converted', currency: 'GBP', amount: 87_900, asOf: '2026-07-14', forward: false, stale: true,
    /* THE OLDEST DAY'S RATE ALONE: the dollar's is today's and says nothing of how old the figure is. */
    pairs: [{ from: 'EGP', rate: 0.016 }],
  });

  /* A WEEK IS NOT STALE AND EIGHT DAYS IS. The boundary is asserted from both sides, because a
     bound nothing pins moves the first time somebody tidies the comparison. */
  const at = (day: string): boolean => {
    const out = across(amounts, 'GBP', [stale[0]!, { ...stale[1]!, as_of: day }], '2026-09-20');
    assert.equal(out.kind, 'converted');
    return out.kind === 'converted' ? out.stale : true;
  };
  assert.equal(at('2026-09-13'), false, 'seven days is not stale');
  assert.equal(at('2026-09-12'), true, 'eight days is');

  /* AND A FIGURE THAT CONVERTED NOTHING IS NOT STALE, because there is no rate behind it to age. */
  const one = across([{ currency: 'GBP', amount: 500, day: '2026-09-20' }], 'GBP', stale, '2026-09-20');
  assert.deepEqual(one, { kind: 'one', currency: 'GBP', amount: 500 });
});
