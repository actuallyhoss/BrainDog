/**
 * A running total and a measured trend are read.
 *
 * "a cumulative reducer with an optional stop condition, returning the first row that crosses" (P.218), and "compound
 * growth with a band, or flat" (P.221). Both were published shapes refused by name. Held here:
 *
 *  - `{ running: { sum, order, until: { gte: n } } }` walks the entries in order and answers the total at the stop, with
 *    the entry that reached the line; with no stop, or a line nothing reaches, it answers the total at the end;
 *  - the line may be what one row holds, `until: { gte: { field, of } }`: the goal of the plan the `where` names;
 *  - two currencies follow the rule of any sum: one amount a currency with no home currency, converted with one;
 *  - `{ trend: { of, ahead } }` reads the figure it names in its buckets and answers what `trendOf` says of them;
 *  - a trend of a figure with no bucket is refused by name, and nothing it answers is a number JSON cannot carry.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel, type Reading } from '../src/index.ts';
import { trendOf, type TrendBucket } from '../src/trend.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

/** 13 October 2026, midday. */
const NOW = Date.UTC(2026, 9, 13, 12);
const OWNER = { actor: 'p_1' };

const list = (id: string, name: string, fields: object[]): Declaration => ({ id: `register.${id}`, kind: 'register', body: { id, name, title: 'what', fields } }) as unknown as Declaration;

const INSTALMENTS = list('instalments', 'Instalments', [
  { id: 'what', type: 'text', required: true },
  { id: 'due', type: 'day' },
  { id: 'amount', type: 'money' },
  { id: 'place', type: 'int' },
  { id: 'units', type: 'int' },
  { id: 'plan', type: 'ref', to: 'plans' },
]);
const PLANS = list('plans', 'Plans', [
  { id: 'what', type: 'text', required: true },
  { id: 'goal', type: 'money' },
]);
const INCOME = list('income', 'Income', [
  { id: 'what', type: 'text', required: true },
  { id: 'on', type: 'day' },
  { id: 'amount', type: 'money' },
]);
const FX = list('fx', 'Rates', [
  { id: 'what', type: 'text' },
  { id: 'currency', type: 'text', required: true },
  { id: 'base', type: 'text', required: true },
  { id: 'rate', type: 'decimal', required: true },
  { id: 'as_of', type: 'day', index: true, required: true },
]);

/** Six instalments, 100,000 in all, written out of order so the walk is by day and never by when each was typed. */
const SIX: [string, string, number][] = [
  ['Fourth', '2026-04-01', 20_000],
  ['First', '2026-01-01', 10_000],
  ['Sixth', '2026-06-01', 25_000],
  ['Second', '2026-02-01', 10_000],
  ['Fifth', '2026-05-01', 25_000],
  ['Third', '2026-03-01', 10_000],
];
const TOTAL = 100_000;

async function record(currencyOf: (what: string) => string = () => 'EGP'): Promise<{ k: Kernel; sql: NodeSql; ids: Map<string, string> }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([PLANS, INSTALMENTS, INCOME, FX]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const ids = new Map<string, string>();
  SIX.forEach(([what, due, amount], i) => {
    const made = k.create('instalments', { what, due, amount: { amount, currency: currencyOf(what) }, place: Number(due.slice(5, 7)), units: i + 1 }, OWNER);
    assert.ok(made.ok, JSON.stringify(made));
    ids.set(what, (made as unknown as { value: { id: string } }).value.id);
  });
  return { k, sql, ids };
}

type Crossed = { id: string; at: string | number; value: number };
type Read = Reading & { crossed?: Crossed; trend?: Record<string, unknown> & { kind: string; n: number } };

const BASE = { source: 'register.instalments', format: 'money', target: { gte: 0 }, window: '12m', compare: 'none' };
const running = (shape: object, extra: object = {}): object => ({ ...BASE, metric: 'paid-so-far', name: 'Paid so far', value: { running: shape }, ...extra });

const read = (k: Kernel, decl: object): Read => {
  const out = k.metric(decl as never, {});
  assert.ok(out.ok, out.ok ? '' : JSON.stringify(out));
  return out.value as Read;
};
const refused = (k: Kernel, decl: object): { code: string; fix: string } => {
  const out = k.metric(decl as never, {});
  assert.ok(!out.ok && 'refusal' in out, JSON.stringify(out));
  return out.refusal;
};

test('A RUNNING TOTAL STOPS AT ITS LINE: six instalments and a line at half their total answer the total at the fourth', async () => {
  const { k, sql, ids } = await record();
  const r = read(k, running({ sum: 'amount', order: 'due', until: { gte: TOTAL / 2 } }));
  assert.equal(r.value, 50_000, 'the total when the line was reached, not the total at the end');
  assert.equal(r.unit, 'EGP');
  assert.equal(r.rows, 6);
  assert.deepEqual(r.crossed, { id: ids.get('Fourth'), at: '2026-04-01', value: 50_000 });

  /* In order of a number, and a line the walk passes without landing on: the first entry at or over it. */
  const byPlace = read(k, running({ sum: 'amount', order: 'place', until: { gte: 60_000 } }));
  assert.equal(byPlace.value, 75_000);
  assert.deepEqual(byPlace.crossed, { id: ids.get('Fifth'), at: 5, value: 75_000 });

  /* A plain number is walked the same way, and carries no currency. */
  const units = read(k, running({ sum: 'units', order: 'due', until: { gte: 3 } }, { format: 'int' }));
  assert.equal(units.unit, null);
  assert.deepEqual(units.crossed, { id: ids.get('Second'), at: '2026-02-01', value: 6 }, 'First was typed second and holds 2, Second was typed fourth and holds 4');
  sql.close();
});

test('WITH NO STOP, OR A LINE NOTHING REACHES, IT ANSWERS THE TOTAL AT THE END and names no entry', async () => {
  const { k, sql } = await record();
  const whole = read(k, running({ sum: 'amount', order: 'due' }));
  assert.equal(whole.value, TOTAL);
  assert.equal(whole.crossed, undefined);
  assert.equal(whole.value, read(k, { ...BASE, metric: 'paid', name: 'Paid', value: { sum: 'amount' } }).value, 'the same number a sum of the same entries answers');

  const far = read(k, running({ sum: 'amount', order: 'due', until: { gte: TOTAL + 1 } }));
  assert.equal(far.value, TOTAL);
  assert.equal(far.crossed, undefined);

  /* The figure's own `where` chooses what is walked. */
  const late = read(k, running({ sum: 'amount', order: 'due', until: { gte: 40_000 } }, { where: 'due at least 2026-04-01' }));
  assert.equal(late.rows, 3);
  assert.equal(late.crossed?.at, '2026-05-01');
  assert.equal(late.value, 45_000);
  sql.close();
});

test('TWO CURRENCIES FOLLOW THE RULE OF ANY SUM: one amount a currency with no home currency, converted with one', async () => {
  const { k, sql, ids } = await record((what) => (what === 'Fifth' || what === 'Sixth' ? 'USD' : 'EGP'));
  const line = running({ sum: 'amount', order: 'due', until: { gte: 1_000_000 } });
  const sum = { ...BASE, metric: 'paid', name: 'Paid', value: { sum: 'amount' } };

  /* NO HOME CURRENCY: nothing is added across the two, so there is no total to walk and no entry that reached a line. */
  const apart = read(k, line);
  assert.equal(apart.value, null);
  assert.deepEqual(apart.parts, [{ currency: 'EGP', amount: 50_000 }, { currency: 'USD', amount: 50_000 }]);
  assert.equal(apart.crossed, undefined);
  assert.deepEqual(apart.parts, read(k, sum).parts);

  /* A HOME CURRENCY AND A RATE: each amount is converted on its way into the walk, as a sum converts it. */
  k.rememberPack({
    id: 'money-core',
    version: '1.0.0',
    source: 'local',
    ref: null,
    manifest: JSON.stringify({ pack: 'money-core', version: '1.0.0', config: { home_currency: { type: 'text' } } }),
    checksum: 'not-a-real-checksum',
  });
  assert.ok(k.create('fx', { currency: 'USD', base: 'EGP', rate: 50, as_of: '2026-01-01' }, OWNER).ok);
  assert.ok(k.setPackConfig('money-core', { home_currency: 'EGP' }, OWNER).ok);
  const whole = read(k, running({ sum: 'amount', order: 'due' }));
  const added = read(k, sum);
  assert.equal(added.value, 50_000 + 2 * 1_250_000, 'the fixture: two payments of 250 dollars at 50 pounds each');
  assert.equal(whole.value, added.value);
  assert.equal(whole.unit, 'EGP');
  assert.deepEqual(whole.fx, added.fx);
  const stopped = read(k, line);
  assert.equal(stopped.value, 1_300_000);
  assert.deepEqual(stopped.crossed, { id: ids.get('Fifth'), at: '2026-05-01', value: 1_300_000 });

  /* NOUGHT IN A CURRENCY WITH NO RATE is added by the sum as nothing, so it does not end the walk either. */
  assert.ok(k.create('instalments', { what: 'Nothing yet', due: '2025-12-01', amount: { amount: 0, currency: 'JPY' } }, OWNER).ok);
  assert.equal(read(k, sum).value, added.value, 'the fixture: the sum still has one number');
  assert.deepEqual(read(k, line).crossed, stopped.crossed);
  sql.close();
});

test('THE LINE MAY BE A FIELD OF THE ROW THE WHERE NAMES: each plan stops at its own goal, and a plan with none passes none', async () => {
  const { k, sql } = await record();
  const made = (list: string, fields: Record<string, unknown>): string => {
    const out = k.create(list, fields, OWNER);
    assert.ok(out.ok, JSON.stringify(out));
    return (out as unknown as { value: { id: string } }).value.id;
  };
  const kiln = made('plans', { what: 'Kiln', goal: { amount: 30_000, currency: 'EGP' } });
  const shed = made('plans', { what: 'Shed' });
  const paid = (plan: string, due: string, amount: number): string => made('instalments', { what: `Paid ${due}`, due, amount: { amount, currency: 'EGP' }, plan });
  paid(kiln, '2027-01-01', 10_000);
  paid(kiln, '2027-02-01', 10_000);
  const third = paid(kiln, '2027-03-01', 20_000);
  paid(kiln, '2027-04-01', 5_000);
  paid(shed, '2027-01-01', 90_000);
  const toGoal = (plan: string): object => running({ sum: 'amount', order: 'due', until: { gte: { field: 'goal', of: 'plan' } } }, { where: `plan is ${plan}` });

  const r = read(k, toGoal('Kiln'));
  assert.deepEqual(r.crossed, { id: third, at: '2027-03-01', value: 40_000 });
  assert.equal(r.value, 40_000);
  const none = read(k, toGoal('Shed'));
  assert.equal(none.crossed, undefined, 'Shed holds no goal, so it reached none');
  assert.equal(none.value, 90_000);

  /* A where that holds the plan to no one row has no line to read, and a field nobody declared is named. */
  const loose = refused(k, running({ sum: 'amount', order: 'due', until: { gte: { field: 'goal', of: 'plan' } } }));
  assert.equal(loose.code, 'DECLARATION_INVALID');
  assert.match(loose.fix, /plan is/u);
  assert.equal(refused(k, running({ sum: 'amount', order: 'due', until: { gte: { field: 'nosuch', of: 'plan' } } }, { where: 'plan is Kiln' })).code, 'FIELD_UNKNOWN');
  assert.equal(refused(k, running({ sum: 'amount', order: 'due', until: { gte: { field: 'goal', of: 'what' } } }, { where: 'plan is Kiln' })).code, 'VALUE_MALFORMED');
  sql.close();
});

test('A RUNNING TOTAL THAT NAMES WHAT IT CANNOT WALK IS REFUSED BY NAME', async () => {
  const { k, sql } = await record();
  assert.equal(refused(k, running({ sum: 'what', order: 'due' })).code, 'VALUE_MALFORMED');
  const order = refused(k, running({ sum: 'amount', order: 'what' }));
  assert.equal(order.code, 'VALUE_MALFORMED');
  assert.match(order.fix, /a day or a number/u);
  assert.equal(refused(k, running({ sum: 'amount', order: 'nosuch' })).code, 'FIELD_UNKNOWN');
  assert.equal(refused(k, running({ sum: 'nosuch', order: 'due' })).code, 'FIELD_UNKNOWN');
  assert.match(refused(k, running({ sum: 'amount', order: 'due', until: 500 })).fix, /until: \{ gte: /u);
  /* A line read off a setting installs, and this build says it does not read one yet. */
  assert.equal(refused(k, running({ sum: 'amount', order: 'due', until: { gte: { setting: 'goal' } } })).code, 'NOT_IN_THIS_BUILD');
  assert.equal(refused(k, running({ sum: 'amount', order: 'due' }, { group_by: 'what' })).code, 'DECLARATION_INVALID');
  /* Neither shape is half of another figure, and the shape nobody reads keeps its code. */
  const half = refused(k, { ...BASE, metric: 'share', name: 'Share', value: { ratio: { of: { running: { sum: 'amount', order: 'due' } }, per: { sum: 'amount' } } } });
  assert.equal(half.code, 'NOT_IN_THIS_BUILD');
  assert.equal(refused(k, { ...BASE, metric: 'old', name: 'Old', value: { trend: 'amount' } }).code, 'NOT_IN_THIS_BUILD');
  assert.equal(refused(k, { ...BASE, metric: 'old', name: 'Old', value: { median: 'amount' } }).code, 'NOT_IN_THIS_BUILD');
  sql.close();
});

/* ── the trend ─────────────────────────────────────────────────── */

const figure = (body: Record<string, unknown>): Declaration => ({ id: `metric.${String(body.metric)}`, kind: 'metric', body }) as unknown as Declaration;
const IN = { source: 'register.income', format: 'money', target: { gte: 0 }, window: '12m', compare: 'none', value: { sum: 'amount' } };
const IN_BY_MONTH = figure({ ...IN, metric: 'in-by-month', name: 'Money in, by month', group_by: 'on', bucket: 'month' });
const IN_LATELY = figure({ ...IN, metric: 'in-lately', name: 'Money in lately, by month', where: 'on at least 2026-06-01', group_by: 'on', bucket: 'month' });
const IN_WHOLE = figure({ ...IN, metric: 'in', name: 'Money in' });
const trend = (of: unknown, ahead: unknown = 3): object => ({ ...IN, metric: 'in-trend', name: 'Money in, its trend', format: 'pct', value: { trend: { of, ahead } } });

/** January to October 2026. January is the first month held and October the month the clock is in, so eight are full. */
const CURVED = [90_000, 100_000, 130_000, 170_000, 220_000, 285_000, 370_000, 480_000, 625_000, 10_000];
/** The same months, each exactly double the last: a line with nothing left over. */
const DOUBLED = [500, 1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 64_000, 128_000, 10_000];

async function earning(months: readonly number[]): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([PLANS, INSTALMENTS, INCOME, FX, IN_BY_MONTH, IN_LATELY, IN_WHOLE]);
  assert.ok(installed.ok, JSON.stringify(installed));
  months.forEach((amount, i) => {
    const on = `2026-${String(i + 1).padStart(2, '0')}-05`;
    assert.ok(k.create('income', { what: `Paid ${on}`, on, amount: { amount, currency: 'EGP' } }, OWNER).ok);
  });
  return { k, sql };
}

const bucketsOf = (k: Kernel, decl: Declaration): TrendBucket[] =>
  (read(k, { ...(decl.body as object) }).groups ?? []).map((g) => ({ key: g.key, value: g.value, state: g.state }));

test('A TREND OF A FIGURE CUT BY MONTH ANSWERS WHAT trendOf SAYS OF ITS MONTHS: growth, with its rate, its band and n', async () => {
  const { k, sql } = await earning(CURVED);
  const buckets = bucketsOf(k, IN_BY_MONTH);
  assert.equal(buckets.filter((b) => b.state === 'full').length, 8, 'the fixture: eight full months');
  const said = trendOf(buckets, 3, 'month') as unknown as Record<string, unknown> & { ahead: { key?: string; value: number }[] };
  assert.equal(said.kind, 'growth', 'the fixture: months that compound');

  const r = read(k, trend('in-by-month'));
  const t = r.trend!;
  assert.equal(t.kind, 'growth');
  assert.equal(t.n, 8);
  assert.equal(t.rate, said.rate);
  assert.equal(t.low, said.low);
  assert.equal(t.high, said.high);
  assert.equal(r.value, said.rate, 'the figure is the rate, a share a month');
  assert.equal(r.unit, null);
  assert.equal(t.bucket, 'month');
  assert.equal(t.unit, 'EGP', 'the months ahead are money, and say whose');
  assert.equal(r.met, true, 'held to its own target, at least nought');

  /* THE MONTHS AHEAD LEAVE IN MINOR UNITS: whole numbers, each the line's reading rounded. */
  const ahead = t.ahead as { key: string; value: number; low: number; high: number }[];
  assert.deepEqual(ahead.map((a) => a.key), ['2026-10', '2026-11', '2026-12']);
  assert.deepEqual(ahead.map((a) => a.value), said.ahead.map((a) => Math.round(a.value)));
  for (const a of ahead) for (const n of [a.value, a.low, a.high]) assert.ok(Number.isInteger(n), `${n} is not whole minor units`);
  assert.ok(Number.isInteger(t.cap as number));
  sql.close();
});

test('WHATEVER trendOf SAYS OF THE MONTHS IS PASSED ON WHOLE: a rise by the same amount a month is no rate, and still whole minor units ahead', async () => {
  /* January to October again, 10,000 more each month: a straight line, which a share a month does not describe. */
  const { k, sql } = await earning([90_000, 100_000, 110_000, 120_000, 130_000, 140_000, 150_000, 160_000, 170_000, 10_000]);
  const said = trendOf(bucketsOf(k, IN_BY_MONTH), 2, 'month') as unknown as Record<string, unknown> & { ahead?: { value: number }[] };
  const r = read(k, trend('in-by-month', 2));
  assert.equal(r.trend?.kind, said.kind);
  assert.equal(r.trend?.n, 8);
  assert.equal(r.value, said.kind === 'growth' ? said.rate : null);
  for (const key of ['rate', 'step', 'low', 'high', 'capped', 'why']) assert.deepEqual(r.trend?.[key], said[key], key);
  const ahead = (r.trend?.ahead ?? []) as { value: number; low: number; high: number }[];
  assert.deepEqual(ahead.map((a) => a.value), (said.ahead ?? []).map((a) => Math.round(a.value)));
  for (const a of ahead) for (const n of [a.value, a.low, a.high]) assert.ok(Number.isInteger(n), `${n} is not whole minor units`);
  assert.deepEqual(JSON.parse(JSON.stringify(r.trend)), r.trend);
  sql.close();
});

test('TOO FEW FULL MONTHS ANSWER FLAT, with how many there were and no rate', async () => {
  const { k, sql } = await earning(CURVED);
  const r = read(k, trend('in-lately'));
  assert.deepEqual({ kind: r.trend?.kind, n: r.trend?.n, why: r.trend?.why }, { kind: 'flat', n: 3, why: 'few' });
  assert.equal(r.value, null);
  assert.equal(r.met, null, 'no rate is no verdict');
  assert.match(r.why, /3 full months/u);
  sql.close();
});

test('NOTHING A TREND ANSWERS IS A NUMBER JSON CANNOT CARRY: an exact line sends no Infinity t', async () => {
  const { k, sql } = await earning(DOUBLED);
  const r = read(k, trend('in-by-month'));
  assert.equal(r.trend?.kind, 'growth');
  assert.ok(Math.abs((r.trend?.rate as number) - 1) < 1e-9, 'doubling is a rate of one');
  assert.ok(r.trend?.t === undefined || Number.isFinite(r.trend.t), `t is ${String(r.trend?.t)}`);
  assert.deepEqual(JSON.parse(JSON.stringify(r.trend)), r.trend, 'it is the same after a trip through JSON');
  sql.close();
});

test('A TREND OF A FIGURE WITH NO BUCKET IS REFUSED BY NAME, and so is one of a figure nobody declared', async () => {
  const { k, sql } = await earning(CURVED);
  const whole = refused(k, trend('in'));
  assert.equal(whole.code, 'DECLARATION_INVALID');
  assert.match(whole.fix, /Money in\b/u, 'by its name');
  assert.match(whole.fix, /bucket/u);
  assert.equal(refused(k, trend('nosuch')).code, 'METRIC_UNKNOWN');
  assert.equal(refused(k, trend('in-trend')).code, 'DECLARATION_INVALID', 'a figure is not its own trend');
  assert.equal(refused(k, trend(7)).code, 'VALUE_MALFORMED');
  for (const ahead of [0, 2.5, 13]) assert.equal(refused(k, trend('in-by-month', ahead)).code, 'OUT_OF_BOUNDS', String(ahead));
  /* Left out, the trend is read and nothing is read ahead. */
  assert.deepEqual(read(k, { ...trend('in-by-month'), value: { trend: { of: 'in-by-month' } } }).trend?.ahead, []);
  sql.close();
});
