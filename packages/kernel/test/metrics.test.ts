/**
 * A metric: one number the record computes, over the same rows a list of the same predicate reads.
 *
 * THE FIGURE AND THE LINK AGREE OR THE TILE IS A LIE. That is what compiling the predicate with the
 * same function `list` uses buys: two definitions of "overdue" agree until somebody edits one, and
 * then a tile says two and the page it opens shows four, and nobody can tell which is wrong.
 *
 * Everything else here is about refusing rather than answering — a target that is the wrong shape, a
 * window that is not a window, an aggregation this build does not read, and a sum of two currencies.
 * A metric that answers anyway is a number on a screen with nothing behind it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateMetric,
  meets,
  openRecord,
  snapshot,
  targetOf,
  windowMs,
  type Declaration,
  type Kernel,
  type MetricDecl,
  type Reading,
  type Snapshot,
} from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const DAY = 86_400_000;

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'party', type: 'text', index: true },
      { id: 'direction', type: 'enum', values: ['owed_by_me', 'owed_to_me'], index: true },
      { id: 'amount', type: 'money', index: true },
      { id: 'effort', type: 'duration' },
      { id: 'due', type: 'day', index: true },
      { id: 'state', type: 'enum', values: ['open', 'part', 'paid'], index: true },
    ],
  } as never,
};

const day = (offset: number) => new Date(NOW + offset * DAY).toISOString().slice(0, 10);
const gbp = (amount: number) => ({ amount, currency: 'GBP' });

type Clockish = ReturnType<typeof fixedClock>;

async function record(): Promise<{ k: Kernel; sql: NodeSql; clock: Clockish }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  assert.ok((await k.install([OBLIGATIONS])).ok);

  for (const row of [
    { what: 'Invoice 41', party: 'Halden', direction: 'owed_to_me', amount: gbp(480_000), due: day(-38), state: 'open', effort: 3600 },
    { what: 'Invoice 46', party: 'Ravensworth', direction: 'owed_to_me', amount: gbp(240_000), due: day(-9), state: 'open', effort: 1800 },
    { what: 'Illustration', party: 'Okonkwo', direction: 'owed_by_me', amount: gbp(135_000), due: day(-2), state: 'open' },
    { what: 'Tax', party: 'HMRC', direction: 'owed_by_me', amount: gbp(1_910_000), due: day(4), state: 'open' },
    { what: 'Invoice 38', party: 'Ravensworth', direction: 'owed_to_me', amount: gbp(180_000), due: day(-71), state: 'paid' },
  ])
    assert.ok(k.create('obligations', row, { actor: 'p_1' }).ok);

  return { k, sql, clock };
}

const OVERDUE: MetricDecl = {
  metric: 'overdue',
  name: 'Overdue',
  source: 'register.obligations',
  where: { all: [{ field: 'direction', is: 'owed_to_me' }, { field: 'state', in: ['open', 'part'] }, { field: 'due', before: day(0) }] },
  value: { sum: 'amount' },
  target: { lte: 400_000 },
  window: '30d',
  format: 'money.GBP',
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const refusal = (r: unknown) => {
  const x = r as { ok: boolean; refusal: { code: string; fix: string; at?: string; allowed?: readonly string[] } };
  assert.equal(x.ok, false, 'this was supposed to be refused');
  return x.refusal;
};

/* ── the figure ──────────────────────────────────────────────────────────── */

test('THE FIGURE IS THE SUM OF THE ROWS THE SAME PREDICATE LISTS', async () => {
  const { k, sql } = await record();
  const read = value<Reading>(k.metric(OVERDUE));

  const listed = k.list({ register: 'obligations', ...(OVERDUE.where === undefined ? {} : { where: OVERDUE.where }), limit: 100 });
  assert.ok(listed.ok);
  const truth = listed.value.rows.reduce((a, e) => a + (e.fields.amount as { amount: number }).amount, 0);

  assert.equal(read.value, truth, 'the tile and the page it opens disagree');
  assert.equal(read.value, 720_000);
  assert.equal(read.rows, 2);
  assert.equal(read.unit, 'GBP', 'a money figure came back with no currency');
  assert.equal(read.met, false, '720,000 is not under a 400,000 ceiling');
  sql.close();
});

test('the six aggregations this build reads', async () => {
  const { k, sql } = await record();
  const of = (v: MetricDecl['value']) => value<Reading>(k.metric({ ...OVERDUE, value: v, where: undefined, target: { gte: 0 } }));

  assert.equal(of({ count: 'id' }).value, 5);
  assert.equal(of({ count: 'effort' }).value, 2, 'a count of a field counts the rows that carry it');
  assert.equal(of({ distinct: 'party' }).value, 4);
  assert.equal(of({ sum: 'effort' }).value, 5400);
  assert.equal(of({ avg: 'effort' }).value, 2700);
  assert.equal(of({ min: 'effort' }).value, 1800);
  assert.equal(of({ max: 'effort' }).value, 3600);
  sql.close();
});

test('AN AVERAGE OF NOTHING IS NOT ZERO, and a sum of nothing is', async () => {
  // Zero is an answer about the rows; the em dash is an answer about there being none. A tile that
  // says "0 days average" over an empty set is a claim nobody made.
  const { k, sql } = await record();
  const none = { ...OVERDUE, where: { field: 'party', is: 'Nobody' } as never, target: { gte: 0 } };
  assert.equal(value<Reading>(k.metric({ ...none, value: { avg: 'effort' } })).value, null);
  assert.equal(value<Reading>(k.metric({ ...none, value: { min: 'effort' } })).value, null);
  assert.equal(value<Reading>(k.metric({ ...none, value: { sum: 'effort' } })).value, 0);
  assert.equal(value<Reading>(k.metric({ ...none, value: { count: 'id' } })).value, 0);
  sql.close();
});

test('a ratio with a zero denominator is not a number', async () => {
  // Never `0`, never infinity, never `NaN` — the em dash, and the numerator is still behind it.
  const { k, sql } = await record();
  const r = value<Reading>(
    k.metric({
      ...OVERDUE,
      where: undefined,
      value: { ratio: { of: { count: 'id' }, per: { count: 'effort' } } },
      target: { gte: 0 },
    }),
  );
  assert.equal(r.value, 2.5);

  const zero = value<Reading>(
    k.metric({
      ...OVERDUE,
      where: { field: 'party', is: 'Nobody' } as never,
      value: { ratio: { of: { count: 'id' }, per: { count: 'id' } } },
      target: { gte: 0 },
    }),
  );
  assert.equal(zero.value, null);
  sql.close();
});

/* ── two currencies are never added ──────────────────────────────────────── */

test('A SUM ACROSS TWO CURRENCIES IS REFUSED, not answered', async () => {
  /* One SUM over a column of amounts is a figure of the right size in whatever unit happened to be
     commonest, in a tile with a code beside it. There is no screen on which anybody notices. */
  const { k, sql } = await record();
  assert.ok(
    k.create('obligations', { what: 'Euro one', direction: 'owed_to_me', amount: { amount: 100_000, currency: 'EUR' }, due: day(-1), state: 'open' }, { actor: 'p_1' }).ok,
  );

  const out = refusal(k.metric(OVERDUE));
  assert.equal(out.code, 'MIXED_CURRENCY');
  assert.match(out.fix, /EUR and GBP/);
  assert.match(out.fix, /never added/);
  assert.deepEqual(out.allowed, ['EUR', 'GBP']);
  sql.close();
});

test('and a count across two is fine, because a count is not a sum', async () => {
  const { k, sql } = await record();
  assert.ok(
    k.create('obligations', { what: 'Euro one', direction: 'owed_to_me', amount: { amount: 100_000, currency: 'EUR' }, due: day(-1), state: 'open' }, { actor: 'p_1' }).ok,
  );
  assert.equal(value<Reading>(k.metric({ ...OVERDUE, value: { count: 'amount' } })).value, 3);
  sql.close();
});

/* ── the two required fields ─────────────────────────────────────────────── */

test('A NUMBER WITH NO TARGET IS DECORATION, and one with no window cannot be acted on', async () => {
  // `08` §2.2 in bold, and it says every dashboard product makes them optional. Both are refused.
  const { k, sql } = await record();
  assert.equal(refusal(k.metric({ ...OVERDUE, target: undefined })).at, 'target');
  assert.equal(refusal(k.metric({ ...OVERDUE, window: undefined })).at, 'window');
  assert.equal(refusal(k.metric({ ...OVERDUE, window: 'a month' })).at, 'window');
  sql.close();
});

test('and a target of the wrong SHAPE is refused too, which is the one that renders as NaN', async () => {
  /* `docs/08` writes `target: { lte: { amount, currency } }` three times. An object compared with
     `<=` is neither true nor false: it printed `target ≤ GBP NaN` under a warn glyph, with no
     refusal at all — the exact class this file exists to prevent, in the file that prevents it. */
  const { k, sql } = await record();
  const out = refusal(k.metric({ ...OVERDUE, target: { lte: { amount: 400_000, currency: 'GBP' } } as never }));
  assert.equal(out.at, 'target');
  assert.match(out.fix, /minor units/);
  sql.close();
});

test('a shape this build does not read is named rather than answered as the ungrouped one', async () => {
  // `group_by` and `bucket` were ignored in silence, and the figure that came back was the UNGROUPED
  // one — drawn under a heading that says it is grouped, which is worse than an em dash.
  const { k, sql } = await record();
  for (const value of [{ last: 'amount' }, { median: 'amount' }, { group_by: 'party' }])
    assert.equal(refusal(k.metric({ ...OVERDUE, value: value as never })).code, 'UNIMPLEMENTED');

  // A product naming a table the record was not given is named too, rather than read as factor one.
  assert.equal(
    refusal(k.metric({ ...OVERDUE, value: { sum: { product: ['amount', { lookup: 'per_year', by: 'state' }] } } })).code,
    'LOOKUP_UNKNOWN',
  );

  assert.equal(refusal(k.metric({ ...OVERDUE, value: { sum: 'nonesuch' } })).code, 'FIELD_UNKNOWN');
  assert.equal(refusal(k.metric({ ...OVERDUE, source: 'series.revenue' })).code, 'SOURCE_UNKNOWN');
  assert.equal(refusal(k.metric({ ...OVERDUE, source: 'register.nothing' })).code, 'REGISTER_UNKNOWN');
  sql.close();
});

test('A PREDICATE THE REGISTER CANNOT ANSWER IS REFUSED, not run as if it matched nothing', async () => {
  const { k, sql } = await record();
  const out = refusal(k.metric({ ...OVERDUE, where: { field: 'colour', is: 'red' } as never }));
  assert.match(out.fix, /colour/);
  sql.close();
});

/* ── the comparison ──────────────────────────────────────────────────────── */

test('a window is a window, and a comparison under a week is noise', async () => {
  assert.equal(windowMs('30d'), 30 * DAY);
  assert.equal(windowMs('4w'), 28 * DAY);
  assert.equal(windowMs('3m'), 90 * DAY);
  assert.equal(windowMs('quarterly'), null);

  const { k, sql } = await record();
  assert.equal(value<Reading>(k.metric({ ...OVERDUE, window: '3d' })).why, 'a window under seven days is noise');
  assert.equal(value<Reading>(k.metric({ ...OVERDUE, compare: 'none' })).why, 'no comparison asked for');
  sql.close();
});

test('AND A COMPARISON OF A SET WITH ITSELF SAYS SO rather than reporting no change', async () => {
  /* The shifted window is the same sentence against a MOVED CLOCK. A predicate with no dated clause
     resolves to the same tree at both ends, so the delta would be structurally zero — and reporting
     that as "steady" is a fact about the arithmetic dressed as a fact about the business, which is
     worse than saying nothing because somebody would act on it. */
  const { k, sql } = await record();
  const undated = value<Reading>(k.metric({ ...OVERDUE, where: { field: 'direction', is: 'owed_to_me' } }));
  assert.equal(undated.delta, null);
  assert.equal(undated.why, 'the predicate does not mention time, so the window moves nothing');

  // A dated one moves, and the delta is a real movement.
  const dated = value<Reading>(k.metric({ ...OVERDUE, where: 'direction is owed to me, due before today' }));
  assert.notEqual(dated.why, 'the predicate does not mention time, so the window moves nothing');
  sql.close();
});

test('A SENTENCE IS A PREDICATE, in a metric and in a list, and both read the same rows', async () => {
  // A declaration is written as `direction is owed to me, state is open`. One form the record
  // accepts and the other it does not would make `where:` two languages.
  const { k, sql } = await record();
  const said = 'direction is owed to me, state is open or part, due before today';
  const read = value<Reading>(k.metric({ ...OVERDUE, where: said }));
  assert.equal(read.value, 720_000, 'the sentence read different rows from the tree');

  const listed = k.list({ register: 'obligations', where: said, limit: 100 });
  assert.ok(listed.ok, listed.ok ? '' : listed.refusal.fix);
  assert.equal(listed.value.rows.length, 2);

  // And a sentence the register cannot answer is refused, in both.
  assert.equal(refusal(k.metric({ ...OVERDUE, where: 'state is not done' })).code, 'ENUM_VALUE_UNKNOWN');
  const badList = k.list({ register: 'obligations', where: 'state is not done', limit: 100 });
  assert.equal(badList.ok, false);
  sql.close();
});

test('a target is a bound, and `met` is a fact about one number', () => {
  assert.equal(meets(100, { lte: 200 }), true);
  assert.equal(meets(300, { lte: 200 }), false);
  assert.equal(meets(300, { gte: 200 }), true);
  assert.equal(meets(200, { lte: 200 }), true, 'a bound includes the bound');
});

test('the evaluator is a function, and it reads a record it was handed', async () => {
  // It takes `Sql` and a schema lookup rather than a kernel, so a host with a different cache can
  // call it — and so this test is about the arithmetic rather than about the wiring.
  const { k, sql } = await record();
  const out = evaluateMetric(sql, OVERDUE, {
    nowMs: NOW,
    schemaOf: (register) => {
      const r = k.register(register);
      return r ? { register, fields: Object.fromEntries(r.fields.map((f) => [f.id, f])) } : null;
    },
  });
  assert.equal(value<Reading>(out).value, 720_000);
  sql.close();
});

/* ── a prediction comes due ────────────────────────────────────── */

const predict = (sql: NodeSql, target: string, on_miss = 'suggest') =>
  sql.exec(
    `INSERT INTO prediction (id, for_decl, claim, measure, baseline, unit, target, window, score_at, on_miss)
     VALUES ('pr_1', 'decision.D1', 'Chasing halves what is overdue', ?, 720000, 'GBP', ?, '30d', ?, ?)`,
    JSON.stringify({
      source: 'register.obligations',
      where: { all: [{ field: 'direction', is: 'owed_to_me' }, { field: 'state', in: ['open', 'part'] }] },
      value: { sum: 'amount' },
    }),
    target,
    new Date(NOW).toISOString(),
    on_miss,
  );

test('A DECISION THAT PREDICTED NOTHING CANNOT BE WRONG, so the record checks the ones that did', async () => {
  const { k, sql, clock } = await record();
  predict(sql, '<=400000');
  sql.exec(
    "INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES ('s_1', ?, 'score', 'pr_1', ?, 'pending', 0)",
    new Date(NOW).toISOString(),
    JSON.stringify({ prediction: 'pr_1' }),
  );

  clock.set(NOW + 1000);
  const drained = await k.drain();
  assert.equal(drained.done, 1);
  assert.equal(drained.failed, 0);

  const row = sql.one<{ scored_at: string; observed: number; met: number }>('SELECT scored_at, observed, met FROM prediction')!;
  assert.ok(row.scored_at, 'the prediction came due and was not scored');
  assert.equal(row.observed, 720_000, 'the observed figure is not the measure it named');
  assert.equal(row.met, 0, '720,000 is not under a 400,000 ceiling');

  // And the event, with the reading in it, because a verdict nobody can find is not a verdict.
  const event = sql.one<{ actor: string; target: string; to_v: string }>("SELECT actor, target, to_v FROM event WHERE kind = 'score'")!;
  assert.equal(event.actor, 'system');
  assert.equal(event.target, 'prediction:pr_1');
  assert.deepEqual(JSON.parse(event.to_v), { observed: 720_000, met: false });
  sql.close();
});

test('and a prediction it met says so', async () => {
  const { k, sql, clock } = await record();
  predict(sql, '<=800000');
  sql.exec(
    "INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES ('s_1', ?, 'score', 'pr_1', ?, 'pending', 0)",
    new Date(NOW).toISOString(),
    JSON.stringify({ prediction: 'pr_1' }),
  );
  clock.set(NOW + 1000);
  await k.drain();
  assert.equal(sql.one<{ met: number }>('SELECT met FROM prediction')?.met, 1);
  sql.close();
});

test('IT IS SCORED ONCE, so a re-entered alarm does not overwrite a verdict with a later reading', async () => {
  const { k, sql, clock } = await record();
  predict(sql, '<=400000');
  sql.exec(
    "INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES ('s_1', ?, 'score', 'pr_1', ?, 'pending', 0)",
    new Date(NOW).toISOString(),
    JSON.stringify({ prediction: 'pr_1' }),
  );
  clock.set(NOW + 1000);
  await k.drain();
  const first = sql.one<{ scored_at: string; observed: number }>('SELECT scored_at, observed FROM prediction')!;

  // The rows move, and the row is scored again — which it must not be.
  assert.ok(k.create('obligations', { what: 'More', direction: 'owed_to_me', amount: gbp(1_000_000), due: day(-1), state: 'open' }, { actor: 'p_1' }).ok);
  sql.exec("UPDATE schedule SET state = 'pending', due_at = ? WHERE id = 's_1'", new Date(NOW).toISOString());
  clock.set(NOW + 2000);
  await k.drain();

  const again = sql.one<{ scored_at: string; observed: number }>('SELECT scored_at, observed FROM prediction')!;
  assert.deepEqual(again, first, 'a scored prediction was scored a second time');
  assert.equal(sql.all("SELECT 1 FROM event WHERE kind = 'score'").length, 1);
  sql.close();
});

test('a target is a bound however it is written', () => {
  // `<= 20` and `20` are the same claim written two ways, and a bare number means "at least this".
  assert.deepEqual(targetOf('<=400000'), { lte: 400_000 });
  assert.deepEqual(targetOf('≤ 400000'), { lte: 400_000 });
  assert.deepEqual(targetOf('>=20'), { gte: 20 });
  assert.deepEqual(targetOf('> 20'), { gte: 20 });
  assert.deepEqual(targetOf('20'), { gte: 20 });
});

/* ── the row-level product ────────────────────────────────────── */

const CYCLES: Declaration = {
  id: 'register.services',
  kind: 'register',
  body: {
    id: 'services',
    name: 'Services',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'cost', type: 'money' },
      { id: 'cycle', type: 'enum', values: ['monthly', 'yearly', 'two_yearly'] },
    ],
  } as never,
};

async function services(lookups?: Record<string, Record<string, number>>) {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW), { lookups: lookups ?? { per_year: { monthly: 12, yearly: 1, two_yearly: 0.5 } } });
  assert.ok((await k.install([CYCLES])).ok);
  for (const row of [
    { name: 'Object storage', cost: gbp(4_100), cycle: 'monthly' },
    { name: 'kiln.example', cost: gbp(1_400), cycle: 'yearly' },
    { name: 'A two-year one', cost: gbp(3_000), cycle: 'two_yearly' },
  ])
    assert.ok(k.create('services', row, { actor: 'p_1' }).ok);
  return { k, sql };
}

const ANNUAL: MetricDecl = {
  metric: 'estate-year',
  name: 'Estate, a year',
  source: 'register.services',
  value: { sum: { product: ['cost', { lookup: 'per_year', by: 'cycle' }] } },
  target: { lte: 100_000 },
  window: '90d',
  compare: 'none',
  format: 'money.GBP',
};

test('A COST PER CYCLE IS ANNUALISED PER ROW, before the sum', async () => {
  /* `cost` is per CYCLE, so a yearly domain and a monthly subscription are two different units and
     adding them straight gives a number that is not about anything. Written out longhand in one
     metric and omitted from another, this came out 9.25 times too low under the word "year". */
  const { k, sql } = await services();
  const read = value<Reading>(k.metric(ANNUAL));

  const naive = 4_100 + 1_400 + 3_000;
  const annual = 4_100 * 12 + 1_400 * 1 + 3_000 * 0.5;
  assert.equal(read.value, annual, `${read.value} is not the annualised figure`);
  assert.notEqual(read.value, naive, 'the cycle factor is missing again');
  assert.equal(read.unit, 'GBP');
  sql.close();
});

test('A ROW THE TABLE HAS NO FACTOR FOR IS EXCLUDED AND NAMED, never multiplied by one', async () => {
  // Factor one is the answer that made this 9.25 times too low. A figure missing one row is a
  // refusal; a figure with one row counted wrongly is a number nobody can spot.
  const { k, sql } = await services({ per_year: { monthly: 12, yearly: 1 } });
  const out = refusal(k.metric(ANNUAL));
  assert.equal(out.code, 'LOOKUP_MISSING');
  assert.match(out.fix, /two_yearly/);
  assert.deepEqual(out.allowed, ['monthly', 'yearly']);
  sql.close();
});

test('and the product is rounded per row, because minor units are integers', async () => {
  const { k, sql } = await services();
  const read = value<Reading>(k.metric(ANNUAL));
  assert.equal(Number.isInteger(read.value), true, `${read.value} is not a whole number of minor units`);
  sql.close();
});

/* ── a figure, kept ────────────────────────────────────────────────── */

const OPEN: MetricDecl = {
  metric: 'still-open',
  name: 'Still open',
  source: 'register.obligations',
  where: 'state is open, due before today',
  value: { count: 'id' },
  target: { lte: 5 },
  window: '30d',
  compare: 'none',
  format: 'int',
};

const ctxOf = (k: Kernel, nowMs: number) => ({
  nowMs,
  schemaOf: (register: string) => {
    const r = k.register(register);
    return r ? { register, fields: Object.fromEntries(r.fields.map((f) => [f.id, f as never])) } : null;
  },
});

test('A METRIC IS A QUESTION AND A SERIES IS ITS ANSWERS', async () => {
  /* Everything else the record computes is computed fresh. This is the one thing it remembers,
     because "is this getting better" cannot be asked of a number that only exists now. */
  const { k, sql } = await record();
  const out = value<Snapshot>(snapshot(sql, OPEN, ctxOf(k, NOW), { nowAt: new Date(NOW).toISOString(), tz: 'UTC' }, 10));

  assert.equal(out.wrote, 1, 'yesterday was not written');
  assert.ok(out.backfilled > 0, 'a series that starts today has no shape for a month');

  const points = sql.all<{ at: string; value: number; unit: string; source: string }>(
    "SELECT at, value, unit, source FROM metric_point WHERE series = 'still-open' ORDER BY at",
  );
  assert.equal(points.length, out.wrote + out.backfilled);
  assert.equal(points.at(-1)?.at, new Date(NOW - DAY).toISOString().slice(0, 10), 'today was written');
  assert.equal(points[0]?.source, 'register.obligations');
  sql.close();
});

test('AND THE PREDICATE MOVES WITH THE DAY, which is what makes a stored figure worth keeping', async () => {
  /* `due before today` resolves against the day being snapshotted. A backfill that asked today's
     question of every past day would store thirty copies of one number. */
  const { k, sql } = await record();
  value<Snapshot>(snapshot(sql, OPEN, ctxOf(k, NOW), { nowAt: new Date(NOW).toISOString(), tz: 'UTC' }, 60));

  const values = sql.all<{ value: number }>("SELECT value FROM metric_point WHERE series = 'still-open' ORDER BY at").map((r) => r.value);
  assert.ok(new Set(values).size > 1, `every day stored the same figure: ${[...new Set(values)].join(', ')}`);
  // Earlier days have fewer rows overdue, because fewer of them were overdue yet.
  assert.ok(values[0]! < values.at(-1)!, 'the series does not move in the direction the rows do');
  sql.close();
});

test('YESTERDAY IS OVERWRITTEN AND EVERY EARLIER DAY IS KEPT', async () => {
  // A snapshot that ran twice in one day should agree with itself rather than refuse; a backfill
  // that overwrote would rewrite history every night.
  const { k, sql } = await record();
  const ctx = ctxOf(k, NOW);
  value<Snapshot>(snapshot(sql, OPEN, ctx, { nowAt: new Date(NOW).toISOString(), tz: 'UTC' }, 10));

  const before = sql.all<{ at: string; value: number }>("SELECT at, value FROM metric_point ORDER BY at");
  sql.exec("UPDATE metric_point SET value = 999 WHERE at = ?", before[0]!.at);

  const again = value<Snapshot>(snapshot(sql, OPEN, ctx, { nowAt: new Date(NOW).toISOString(), tz: 'UTC' }, 10));
  assert.equal(again.backfilled, 0, 'the backfill rewrote days it had already written');
  assert.equal(sql.one<{ value: number }>('SELECT value FROM metric_point WHERE at = ?', before[0]!.at)?.value, 999);
  assert.equal(sql.all('SELECT 1 FROM metric_point').length, before.length, 'a second run doubled the series');
  sql.close();
});

test('and a day the metric could not answer is NO ROW, not a zero', async () => {
  /* A series with a zero on every day nothing happened cannot tell "nothing" from "no answer", and
     the difference is the whole of a trend. */
  const { k, sql } = await record();
  const avg: MetricDecl = { ...OPEN, metric: 'avg-effort', value: { avg: 'effort' }, target: { lte: 100_000 } };
  const out = value<Snapshot>(snapshot(sql, avg, ctxOf(k, NOW), { nowAt: new Date(NOW).toISOString(), tz: 'UTC' }, 90));
  assert.ok(out.missing > 0, 'a day with nothing to average stored a number anyway');
  assert.equal(sql.all("SELECT 1 FROM metric_point WHERE series = 'avg-effort' AND value = 0").length, 0);
  sql.close();
});
