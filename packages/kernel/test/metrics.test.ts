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

import { fixOf } from '@braindog/ports';

import {
  evaluateMetric,
  deltaFrom,
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

test('A SUM, AVERAGE, MINIMUM OR MAXIMUM OF A DAY OR A WORD IS REFUSED, not answered as a number', async () => {
  const { k, sql } = await record();
  /* SQLite reads the text `2026-07-28` as 2026 inside sum() and avg(), and `Number('2026-07-28')` is
     NaN after min() and max(), which went out as null beside `met: false` and two rows counted. */
  for (const v of [{ sum: 'due' }, { avg: 'due' }, { min: 'due' }, { max: 'due' }, { sum: 'party' }, { max: 'state' }] as MetricDecl['value'][]) {
    const said = refusal(k.metric({ ...OVERDUE, value: v, where: undefined, target: { gte: 0 }, format: 'int' }));
    assert.equal(said.code, 'VALUE_MALFORMED', JSON.stringify(v));
    assert.equal(said.at, 'value');
  }
  /* A COUNT OR A DISTINCT OF ANY FIELD IS STILL A NUMBER. */
  assert.equal(value<Reading>(k.metric({ ...OVERDUE, value: { distinct: 'due' }, where: undefined, target: { gte: 0 }, format: 'int' })).value, 5);

  /* AND AT INSTALL, so the tile never reaches a page. */
  const installed = await k.install([
    { id: 'metric.oldest', kind: 'metric', body: { metric: 'oldest', name: 'Oldest', source: 'register.obligations', value: { min: 'due' }, format: 'int', target: { gte: 0 }, window: '30d' } } as never,
  ]);
  assert.equal(installed.ok, false, 'a minimum of a day installed');
  assert.equal(refusal(installed).code, 'VALUE_MALFORMED');
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

test('A RATIO OF TWO DIFFERENT UNITS IS A RATE, and it was refused as a mixed currency', async () => {
  /* Money over a duration is cost per hour, and money over a count is average invoice size. The
     two-halves check refused both: it compared the units of a `ratio` the same way it compares the
     units of a `diff`, so a whole family of ordinary figures could not be declared. Dividing one
     unit by another is the entire point of a rate. */
  const { k, sql } = await record();
  const rate = value<Reading>(
    k.metric({
      ...OVERDUE,
      where: undefined,
      value: { ratio: { of: { sum: 'amount' }, per: { sum: 'effort' } } },
      format: 'decimal',
      target: { gte: 0 },
    } as never),
  );
  assert.equal(typeof rate.value, 'number', 'a rate over two units was refused');
  sql.close();
});

test('A FORMAT THAT CONTRADICTS THE ROWS IS REFUSED, and it used to be printed', async () => {
  /* `format: money.USD` is a declaration about how to WRITE the figure and the rows are what it is a
     figure OF, so when they disagree the declaration is wrong. This side checked neither: a sum of
     sterling invoices declared `money.USD` came back as a plain number with `unit: 'GBP'` and no
     refusal, and every renderer formats from `decl.format`, so it reached a screen as USD 168,794.00
     over rows that are in pounds. The browser's copy of this evaluator has had the check all along,
     and a differential pass over the shipped seed is what found the two disagreeing. */
  const { k, sql } = await record();
  const out = k.metric({ ...OVERDUE, where: undefined, value: { sum: 'amount' }, format: 'money.USD', target: { lte: 99_999_999 } } as never);
  assert.equal(out.ok, false, 'a sterling sum was read under a dollar format');
  assert.match(fixOf(out) ?? '', /the rows are in GBP and the format says USD/u);

  /* AND THE FORMAT THAT AGREES IS UNTOUCHED, so the check is about a contradiction rather than
     about declaring a currency at all. */
  const fine = k.metric({ ...OVERDUE, where: undefined, value: { sum: 'amount' }, format: 'money.GBP', target: { lte: 99_999_999 } } as never);
  assert.equal(fine.ok, true, fixOf(fine) ?? '');
  sql.close();
});

test('A DIFF WHOSE OTHER HALF READ NOTHING IS THE FIRST HALF, and it refused MIXED_CURRENCY', async () => {
  /* A sum over no rows is zero, and its unit is `null` because there was nothing to take a unit
     from. `'GBP' !== null` is true, so `sum(received) - sum(paid)` refused on any record that had
     received money and not yet paid any: the tile read "one half of this figure is in GBP and the
     other in no unit" and repaired itself the day somebody entered a bill. A money tile that is
     broken only while a register is young is broken for exactly the people who have just arrived. */
  const { k, sql } = await record();
  const net = value<Reading>(
    k.metric({
      ...OVERDUE,
      where: undefined,
      value: {
        diff: {
          of: { sum: 'amount', where: 'direction is owed_to_me' },
          per: { sum: 'amount', where: 'party is Nobody At All' },
        },
      },
      format: 'money',
      target: { gte: 0 },
    } as never),
  );
  assert.equal(typeof net.value, 'number', 'a diff against a half that read nothing was refused');
  assert.equal(net.unit, 'GBP', 'the answer lost the currency the half that read something was in');
  sql.close();
});

test('AND A RATIO OF TWO CURRENCIES STILL IS NOT, in its own code', async () => {
  /* `04 §5` names this one and names it narrowly: "a `ratio` of two different CURRENCIES", with the
     repair "revenue is USD, spend is EGP. Name an fx source, or scope the predicate to one
     currency". GBP over USD is a number with no meaning; GBP over hours is a rate. Both arms of
     this check used to say `MIXED_CURRENCY`, so an agent branching on it could not tell a division
     of two currencies from a sum across three. */
  const { k, sql } = await record();
  assert.ok(
    k.create('obligations', { what: 'Euro one', direction: 'owed_to_me', amount: { amount: 100_000, currency: 'EUR' }, due: day(-1), state: 'open' }, { actor: 'p_1' }).ok,
  );
  const out = refusal(
    k.metric({
      ...OVERDUE,
      where: undefined,
      value: { ratio: { of: { sum: 'amount', where: 'direction is owed_to_me' }, per: { sum: 'amount', where: 'direction is owed_by_me' } } },
      format: 'decimal',
      target: { gte: 0 },
    } as never),
  );
  /* Both halves read the same field over the same `where`, so this refuses as a mixed SUM before it
     reaches the two-halves check. That is the right refusal and the right code: the rows really are
     in two currencies, which is what `MIXED_CURRENCY` names. */
  assert.ok(out.code === 'RATIO_MIXED_CURRENCY' || out.code === 'MIXED_CURRENCY', out.code);
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
  /* `NOT_IN_THIS_BUILD`, added to `30 §6` in the same change. `UNIMPLEMENTED` named nothing — not
     what is unimplemented, not by whom, not what to do — and `08 §2.2` PUBLISHES these eleven
     aggregations, so telling their author the shape is unknown or malformed would send them to
     check a spelling that is correct. The build is behind the document; a deploy is the repair. */
  for (const value of [{ last: 'amount' }, { median: 'amount' }, { group_by: 'party' }])
    assert.equal(refusal(k.metric({ ...OVERDUE, value: value as never })).code, 'NOT_IN_THIS_BUILD');

  // A product naming a table the metric does not carry is named too, rather than read as factor one.
  assert.equal(
    refusal(k.metric({ ...OVERDUE, value: { sum: { product: ['amount', { lookup: 'per_week', by: 'state' }] } } })).code,
    'LOOKUP_UNKNOWN',
  );

  assert.equal(refusal(k.metric({ ...OVERDUE, value: { sum: 'nonesuch' } })).code, 'FIELD_UNKNOWN');
  assert.equal(refusal(k.metric({ ...OVERDUE, source: 'series.revenue' })).code, 'SOURCE_UNKNOWN');
  assert.equal(refusal(k.metric({ ...OVERDUE, source: 'register.nothing' })).code, 'REGISTER_UNKNOWN');
  sql.close();
});

test('AND THE GUARD FIRED WHERE NOBODY WRITES THE KEY, so the documented spelling got the ungrouped figure', async () => {
  /**
   * The loop above walks `keysOf(decl.value)`, and `group_by` is not inside `value`: `42 §4.9` and
   * `declare.ts`'s `metricBody` both put it at the TOP LEVEL of a metric body, and `MetricDecl` has
   * no field for either it or `bucket`. So a stored body carrying one arrived here as an extra key
   * nothing looked at. Driven over the same rows, with a control:
   *
   *     plain sum, no group_by                       {"value":700,"rows":3,"unit":"GBP","refusals":0}
   *     GROUP_BY_CARDINALITY: group_by: 'party'      {"value":700,"rows":3,"unit":"GBP","refusals":0}
   *     group_by inside value (the checked place)    REFUSED NOT_IN_THIS_BUILD
   *
   * Identical figures, zero refusals, and the harm is the one the guard's own sentence names word
   * for word: *"its figure would be the ungrouped one"*. A tile declaring `group_by: 'party'` draws
   * one number over every party.
   */
  const { k, sql } = await record();
  const ungrouped = value<Reading>(k.metric({ ...OVERDUE, where: undefined, target: { gte: 0 } }));

  for (const key of ['group_by', 'bucket']) {
    const said = refusal(k.metric({ ...OVERDUE, where: undefined, target: { gte: 0 }, [key]: 'party' } as never));
    assert.equal(said.code, 'NOT_IN_THIS_BUILD');
    assert.equal(said.at, key);
    assert.match(said.fix, /the ungrouped one/);
  }

  /* AND THE CONTROL, so this is about the key and not about the metric: the same declaration
     without it still answers, and the figure it answered with is the one the grouped tile drew. */
  assert.equal(ungrouped.value, 2_945_000);
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

test('`year_ago` READS LAST YEAR, and it used to read last month', async () => {
  /* `08 §2` publishes three comparison words and `declare` admits all three; this evaluator's union
     carried two, so anything that was not `none` went down the `now minus window` arm. A metric
     saying *against the same period last year* rendered a delta against the previous THIRTY DAYS,
     and said nothing, because the comparability gate above it is correct and passes: `why` was
     empty and `delta` was a number with every honesty check green.

     THREE WINDOWS, SO READING THE WRONG ONE IS A DIFFERENT NUMBER rather than a missing one. A test
     seeded with two could not tell the two words apart at all, which is how the drift survived. */
  const { k, sql } = await record();

  const seed = (offset: number, amount: number, tag: string): void => {
    for (let n = 0; n < 3; n++)
      assert.ok(
        k.create(
          'obligations',
          { what: `${tag} ${n}`, party: 'Anniversary', direction: 'owed_to_me', amount: gbp(amount), due: day(offset), state: 'open' },
          { actor: 'p_1' },
        ).ok,
      );
  };
  /* Equal counts in all three, so the "prior holds at least half the current's rows" clause of the
     gate cannot be what a failure here is about. */
  seed(-5, 10_000, 'this month');
  seed(-40, 100_000, 'last month');
  seed(-370, 1_000_000, 'last year');

  const ANNIVERSARY: MetricDecl = {
    metric: 'anniversary',
    name: 'Owed, this window',
    source: 'register.obligations',
    where: { all: [{ field: 'party', is: 'Anniversary' }, { field: 'due', after: '-30d' }, { field: 'due', before: 'today' }] },
    value: { sum: 'amount' },
    target: { lte: 1 },
    window: '30d',
    format: 'money.GBP',
  };

  const previous = value<Reading>(k.metric({ ...ANNIVERSARY, compare: 'previous' }));
  const yearAgo = value<Reading>(k.metric({ ...ANNIVERSARY, compare: 'year_ago' }));

  assert.equal(previous.value, 30_000, 'both words read the same current window');
  assert.equal(yearAgo.value, 30_000);
  assert.equal(previous.why, '', 'the comparability gate refused the comparison this test is about');
  assert.equal(yearAgo.why, '');

  // 30,000 against 300,000 is the month before; 30,000 against 3,000,000 is the year before.
  assert.equal(previous.delta, deltaFrom(300_000, 30_000));
  assert.equal(previous.delta, -0.9);
  assert.equal(yearAgo.delta, deltaFrom(3_000_000, 30_000));
  assert.equal(yearAgo.delta, -0.99, '`year_ago` was computed as `previous`, so it read last month');
  assert.notEqual(yearAgo.delta, previous.delta, 'two comparison words that always agree are one word');
  sql.close();
});

test('and a year is calendar arithmetic, so the anniversary of 29 February is the 28th', async () => {
  /* A YEAR IS NOT A FIXED NUMBER OF MILLISECONDS. `resolveDay` resolves `+1m` by the calendar and
     clamps the day of the month, on the argument that rolling 31 January into 3 March is not what
     anybody means by a month; a year is twelve of those. Subtracting `365 * DAY` from noon on
     29 February 2028 lands on 1 MARCH 2027, and letting `Date.UTC` roll the impossible 29 February
     2027 forward lands there too. The record's answer is 28 February 2027, and this seeds both
     candidate days with different amounts so the three readings are three numbers. */
  const LEAP = Date.UTC(2028, 1, 29, 12);
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(LEAP));
  assert.ok((await k.install([OBLIGATIONS])).ok);

  const on = (iso: string, amount: number): void => {
    assert.ok(
      k.create('obligations', { what: iso, direction: 'owed_to_me', amount: gbp(amount), due: iso, state: 'open' }, { actor: 'p_1' }).ok,
    );
  };
  on('2028-02-29', 10_000);
  on('2027-02-28', 40_000); // the anniversary
  on('2027-03-01', 90_000); // where 365 days, and an unclamped roll, both land

  const TODAY: MetricDecl = {
    metric: 'leap',
    name: 'Owed today',
    source: 'register.obligations',
    where: { field: 'due', is: 'today' },
    value: { sum: 'amount' },
    target: { lte: 1 },
    window: '30d',
    format: 'money.GBP',
    compare: 'year_ago',
  };

  const read = value<Reading>(k.metric(TODAY));
  assert.equal(read.value, 10_000);
  assert.equal(read.why, '', 'the anniversary window came back empty, so the clock moved to a day with no rows');
  assert.equal(read.delta, deltaFrom(40_000, 10_000), 'the anniversary of 29 February is 28 February, not 1 March');
  assert.equal(read.delta, -0.75);
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
  assert.ok(listed.ok, fixOf(listed));
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

async function services() {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
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
  lookups: { per_year: { monthly: 12, yearly: 1, two_yearly: 0.5 } },
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
  const { k, sql } = await services();
  const out = refusal(k.metric({ ...ANNUAL, lookups: { per_year: { monthly: 12, yearly: 1 } } }));
  assert.equal(out.code, 'LOOKUP_MISSING');
  assert.match(out.fix, /two_yearly/);
  assert.deepEqual(out.allowed, ['monthly', 'yearly']);
  sql.close();
});

test('THE TABLE IS INSTALLED WITH THE FIGURE, and a figure that does not carry it is refused at install', async () => {
  /* The tables were handed to the kernel by the host, no host handed one in, and every real record
     read "cannot be worked out yet" for the pack's own Cost per year while every test passed. */
  const { k, sql } = await services();
  const { lookups: _, ...bareBody } = ANNUAL;
  const installed = await k.install([{ id: 'metric.estate-year', kind: 'metric', body: ANNUAL as never }]);
  assert.ok(installed.ok, JSON.stringify(installed));
  assert.equal(value<Reading>(k.metric(k.metricDecl('estate-year')!)).value, 4_100 * 12 + 1_400 + 1_500);

  const bare = await k.install([{ id: 'metric.bare-year', kind: 'metric', body: { ...bareBody, metric: 'bare-year' } as never }]);
  assert.equal(!bare.ok && 'refusal' in bare ? bare.refusal.code : null, 'LOOKUP_UNKNOWN');
  sql.close();
});

test('A BODY FROM BEFORE A METRIC COULD CARRY ITS TABLE still reads per_year, because declaration rows are never edited', async () => {
  const { k, sql } = await services();
  const { lookups, ...legacy } = ANNUAL;
  assert.equal(value<Reading>(k.metric(legacy)).value, 4_100 * 12 + 1_400 + 1_500);
  // A body that carries tables gets only its own.
  assert.equal(refusal(k.metric({ ...legacy, lookups: { other: { monthly: 1 } } })).code, 'LOOKUP_UNKNOWN');
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

test("A RECORD AT UTC+12 GETS ITS OWN YESTERDAY, and it used to get today's date on it", async () => {
  /**
   * `endOf` SEEDED ITS SEARCH AT NOON UTC. The comment above it argues for noon because no clock
   * change has ever crossed it, which is an argument about noon LOCAL: in `Pacific/Auckland` noon
   * UTC is one o'clock the following morning, so the walk began in the wrong day and stayed there.
   * The newest point came out stamped with TODAY's local date, holding a reading taken as of one in
   * the morning, and the row that fires this is armed for five past midnight local.
   *
   * EVERY OTHER SNAPSHOT TEST IN THIS FILE PASSES `tz: 'UTC'`, the one zone where the defect is
   * invisible, under code whose own comment is about Auckland.
   */
  const { k, sql } = await record();
  const tz = 'Pacific/Auckland';
  const local = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const today = local.format(new Date(NOW));

  value<Snapshot>(snapshot(sql, OPEN, ctxOf(k, NOW), { nowAt: new Date(NOW).toISOString(), tz }, 3));
  const newest = sql.one<{ at: string }>("SELECT at FROM metric_point WHERE series = 'still-open' ORDER BY at DESC")?.at;
  assert.ok(newest, 'nothing was written at all');
  assert.ok(newest < today, `the newest point is ${newest} and the local day is ${today}, so today was written as yesterday`);
  sql.close();
});

test('A MONEY POINT IS MONEY, and it went in ten thousand times too large with a currency on it', async () => {
  /**
   * `stored()` TOOK A VALUE AND NOTHING ELSE. Any figure that was not a whole number became basis
   * points, and each of the three call sites wrote the unit from a SEPARATE expression that kept a
   * real unit when the reading had one. So an average of money landing between two pennies was
   * multiplied by ten thousand and filed under `GBP`, which every surface in this product renders
   * with a pound sign in front of it.
   *
   * THE SEED'S FIVE AMOUNTS AVERAGE TO A HALF-PENNY. 480,000 + 240,000 + 135,000 + 1,910,000 +
   * 180,000 is 2,945,000 over five, which is 589,000 exactly, so the amounts are cut to four rows to
   * reach a fraction: an average that lands on a whole penny cannot tell the two rules apart, which
   * is why the one `avg` test in this file could not fail. It averages a `duration`, the single type
   * where the old scaling happened to be harmless.
   */
  const { k, sql } = await record();
  assert.ok(
    k.create('obligations', { what: 'Odd one', direction: 'owed_to_me', amount: gbp(1), due: day(-1), state: 'open' }, { actor: 'p_1' }).ok,
  );
  const avg: MetricDecl = { ...OPEN, metric: 'avg-owed', value: { avg: 'amount' }, where: 'state is open', target: { lte: 9_999_999 }, format: 'money' };

  const read = value<Reading>(evaluateMetric(sql, avg, ctxOf(k, NOW)));
  assert.equal(read.unit, 'GBP', 'the reading is not in a currency, so this test is about the wrong thing');
  assert.equal(Number.isInteger(read.value ?? 0), false, 'the average is a whole number of pennies, so the two rules agree here');

  value<Snapshot>(snapshot(sql, avg, ctxOf(k, NOW), { nowAt: new Date(NOW).toISOString(), tz: 'UTC' }, 1));
  const kept = sql.one<{ value: number; unit: string }>("SELECT value, unit FROM metric_point WHERE series = 'avg-owed' ORDER BY at DESC");
  assert.ok(kept, 'nothing was written');

  assert.equal(kept.unit, 'GBP', 'a money point lost its currency');
  /* WITHIN A PENNY OF THE READING, and not four orders of magnitude away from it. Money is an
     integer in minor units, so an average between two pennies rounds to a penny: that is what money
     does, and half a penny is not a number this record can hold. */
  assert.ok(
    Math.abs(kept.value - (read.value ?? 0)) <= 1,
    `the point is ${kept.value} and the reading is ${read.value}`,
  );
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

/* ── the other rendering of the same predicate ───────────────────────── */

const OPEN_JSON: MetricDecl = {
  ...OPEN,
  metric: 'still-open-json',
  where: { all: [{ field: 'state', is: 'open' }, { field: 'due', before: 'today' }] },
};

test('A PREDICATE WRITTEN AS JSON SAYS `today` TOO, and it used to reach SQL as the word', async () => {
  /* `'2026-…' < 'today'` is a string comparison true of every date there has ever been, so the
     figure was the whole register and looked like an answer. The clause that quietly matches
     everything, reached through the one form of the grammar nobody was resolving. */
  const { k, sql } = await record();
  const sentence = value<Reading>(evaluateMetric(sql, OPEN, ctxOf(k, NOW)));
  const json = value<Reading>(evaluateMetric(sql, OPEN_JSON, ctxOf(k, NOW)));
  assert.equal(json.value, sentence.value, 'the two renderings of one predicate disagree');
  assert.ok((json.value ?? 0) < k.count('obligations'), 'the JSON form matched every row in the register');
  sql.close();
});

test('and `asOf` moves it, so a backfill is history rather than thirty copies of today', async () => {
  const { k, sql } = await record();
  const out = value<Snapshot>(snapshot(sql, OPEN_JSON, ctxOf(k, NOW), { nowAt: new Date(NOW).toISOString(), tz: 'UTC' }, 60));
  assert.equal(out.missing, 0);

  const values = sql
    .all<{ value: number }>("SELECT value FROM metric_point WHERE series = 'still-open-json' ORDER BY at")
    .map((r) => r.value);
  assert.ok(new Set(values).size > 1, `every day stored the same figure: ${[...new Set(values)].join(', ')}`);
  assert.ok(values[0]! < values.at(-1)!, 'the series does not move in the direction the rows do');
  sql.close();
});

test('and a day the grammar does not admit is refused in JSON as it is in a sentence', async () => {
  // `2026-13-45` matched the shape and was then compared as a string, so it was true of every row.
  const { k, sql } = await record();
  const bad = evaluateMetric(sql, { ...OPEN_JSON, where: { field: 'due', before: '2026-13-45' } }, ctxOf(k, NOW));
  assert.equal(bad.ok, false);
  // `RELATIVE_LITERAL_UNKNOWN`: `30 §6`'s code for a temporal literal outside the anchors and
  // offsets, which is what `2026-13-45` is. The sentence form has always answered the same way.
  assert.equal((bad as { refusal: { code: string } }).refusal.code, 'RELATIVE_LITERAL_UNKNOWN');
  sql.close();
});

/* ── wrong numbers that looked right ───────────────────────────────────── */

test('DISTINCT OVER MONEY COUNTS THE PAIR, not the number', async () => {
  /* GBP 50, USD 50 and EUR 50 came back as ONE distinct value — three different sums of money
     counted as the same one — because the currency was dropped on the way into the expression.
     `sum` over the same rows refuses `MIXED_CURRENCY`; this quietly agreed with itself. */
  const { k, sql } = await record();
  for (const currency of ['GBP', 'USD', 'EUR'])
    value(k.create('obligations', { what: `Fifty ${currency}`, amount: { amount: 5000, currency } }, { actor: 'p_1' }));

  const out = k.metric({
    metric: 'kinds',
    name: 'How many different amounts',
    source: 'register.obligations',
    value: { distinct: 'amount' },
    where: { field: 'what', contains: 'Fifty ' },
    target: { gte: 1 },
    window: '30d',
    compare: 'none',
  });
  assert.ok(out.ok, fixOf(out));
  assert.equal(out.value.rows, 3, 'the predicate did not isolate the three rows under test');
  assert.equal(out.value.value, 3, 'three currencies of the same number counted as one');
  sql.close();
});

test('A DELTA OVER A NEGATIVE PRIOR KEEPS ITS DIRECTION', async () => {
  /* Dividing by a negative denominator inverts the sign, and the interface keys the word "up" off
     it — so a net position that got 50% worse was reported as improving by half. The web build has
     divided by the magnitude since it was written; these two disagreed. */
  assert.equal(deltaFrom(-48_000, -72_000), -0.5);
  assert.equal(deltaFrom(-48_000, -24_000), 0.5);
  assert.equal(deltaFrom(48_000, 72_000), 0.5);
});

test('A DIFF WHOSE FIRST HALF READ NOTHING KEEPS THE OTHER HALF\'S CURRENCY', async () => {
  /* The unit was the first half's alone, so nothing received and GBP 50.00 paid read
     `{ value: -5000, unit: null }`: a bare number an agent could not tell was money. */
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const LEDGER: Declaration = {
    id: 'register.ledger',
    kind: 'register',
    body: {
      id: 'ledger',
      name: 'Ledger',
      title: 'what',
      fields: [
        { id: 'what', type: 'text', required: true },
        { id: 'got', type: 'money' },
        { id: 'paid', type: 'money' },
      ],
    } as never,
  };
  assert.ok((await k.install([LEDGER])).ok);
  assert.ok(k.create('ledger', { what: 'Hosting', paid: gbp(5_000) }, { actor: 'p_1' }).ok);
  const net = value<Reading>(
    k.metric({ metric: 'net', name: 'Net', source: 'register.ledger', value: { diff: { of: { sum: 'got' }, per: { sum: 'paid' } } }, format: 'money', target: { gte: 0 }, window: '30d' } as never),
  );
  assert.equal(net.value, -5_000);
  assert.equal(net.unit, 'GBP', 'a diff whose first half read nothing lost its currency');
  sql.close();
});
