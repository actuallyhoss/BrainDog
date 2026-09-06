/**
 * The forecast, which is the one part of this product that states something about the future.
 *
 * Every test here exists because the wrong version of it is plausible. A walk that reads a service's
 * stored `renews` date once looks completely correct and is too cheap by five months of hosting. A
 * walk that pays you before it charges you produces the same closing balance and hides the day you
 * needed to see. A fit that always returns a slope produces a number that gets quoted.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runway, trend, type Leg } from './forecast.ts';
import { NOW, PAGES, ROWS } from './data.ts';
import { page } from './api.ts';
import { magnitudeOf } from 'braindog-render';

/**
 * The legs the record declares, read from the shipped page rather than retyped.
 *
 * WHAT THE WALK READS IS DECLARED, so a test that hardcoded two registers would be testing a
 * different function from the one the product runs.
 */
const LEGS = Object.values(PAGES)
  .flatMap((p) => p.blocks)
  .find((b) => b.source === 'forecast.runway')!.from!;

/* ── the walk ────────────────────────────────────────────────────────────── */

test('the walk starts from what is liquid and ends somewhere else', () => {
  const r = runway(1_000_000, LEGS);
  assert.equal(r.from, 1_000_000);
  assert.ok(r.steps.length > 0, 'the seed has dated movements, so the walk cannot be empty');
});

test('every step carries the balance after it, and they chain', () => {
  // The point of returning the sequence rather than the answer: each row has to be readable as
  // "and this is where you were after that one".
  const r = runway(500_000, LEGS);
  let acc = r.from;
  for (const s of r.steps) {
    acc += s.delta;
    assert.equal(s.balance, acc, `${s.day} ${s.label} broke the chain`);
  }
});

test('the walk is in date order, and an outgoing on a day comes before an incoming', () => {
  // A balance that dips under at breakfast and recovers by lunchtime has still bounced. Ordering
  // receipts first on a shared day produces the same closing figure and hides the crossing.
  const r = runway(500_000, LEGS);
  for (let i = 1; i < r.steps.length; i++) {
    const a = r.steps[i - 1]!, b = r.steps[i]!;
    assert.ok(a.day <= b.day, `${a.day} came before ${b.day}`);
    if (a.day === b.day) assert.ok(a.delta <= b.delta, `on ${a.day} an incoming was paid before an outgoing`);
  }
});

test('a recurring service is charged once per cycle across the window, not once in total', () => {
  // The failure this catches is silent and always in the same direction: too cheap. A monthly
  // service inside a 180-day window is six charges, and reading the stored date once is one.
  const short = runway(0, LEGS, 40).steps.filter((s) => s.source === 'services').length;
  const long = runway(0, LEGS, 400).steps.filter((s) => s.source === 'services').length;
  assert.ok(long > short, `${long} service charges over 400 days against ${short} over 40`);
});

test('a longer horizon is a superset: it never loses a movement', () => {
  const near = runway(0, LEGS, 60).steps.map((s) => `${s.day} ${s.label}`);
  const far = new Set(runway(0, LEGS, 365).steps.map((s) => `${s.day} ${s.label}`));
  for (const s of near) assert.ok(far.has(s), `${s} vanished when the horizon grew`);
});

test('AN OVERDUE OBLIGATION IS STILL A MOVEMENT, and it moves today', () => {
  // It used to be dropped, on the argument that an overdue invoice is a fact about the present
  // rather than a movement still to come. That is true of a PAID one — and the walk already filters
  // to open and part, so what it dropped was four rows of money that has not moved yet. The Runway
  // tile read 116 days where the truth is 93, and named a different row as the one that does it.
  const today = new Date(NOW).toISOString().slice(0, 10);
  const late = (ROWS.obligations ?? []).filter(
    (e) => (e.fields.state === 'open' || e.fields.state === 'part') && String(e.fields.due) < today,
  );
  assert.ok(late.length > 0, 'the seed needs an overdue obligation for this to mean anything');

  const steps = runway(0, LEGS, 365).steps;
  for (const row of late) {
    const step = steps.find((s) => s.href === `/r/obligations/${row.seq}`);
    assert.ok(step, `${row.fields.what} is overdue, open, and not in the walk`);
    assert.equal(step.day, today, 'an overdue movement is dated in the past, so the walk is out of order');
    assert.match(step.label, /overdue/, 'nothing on the row says why it is dated today');
  }
  for (const s of steps) assert.ok(s.day >= today, `${s.day} predates the walk`);
});

test('and counting it changes the answer, in the direction it should', () => {
  // Net overdue on the seed is negative, so admitting it can only shorten the runway. A test that
  // just says "the number changed" would pass if the sign were wrong.
  const withThem = runway(4_200_000, LEGS);
  assert.ok(withThem.days !== null);
  assert.ok(withThem.days < 116, `runway is ${withThem.days} days; dropping the overdue rows gave 116`);
});

test('a large enough opening balance never crosses', () => {
  const r = runway(500_000_000, LEGS);
  assert.equal(r.crossed, null);
  assert.equal(r.days, null);
});

test('crossing is the FIRST step under zero, and it names the row that did it', () => {
  const r = runway(0, LEGS);
  assert.ok(r.crossed, 'starting from nothing, the first outgoing must cross');
  assert.ok(r.crossed.balance < 0);
  assert.ok(r.crossed.href.startsWith('/r/'), 'the crossing has to be openable, or it is just a date');
  // And nothing before it went under.
  for (const s of r.steps) {
    if (s === r.crossed) break;
    assert.ok(s.balance >= 0, `${s.day} went under before the reported crossing`);
  }
});

test('the walk never divides, so a balance cannot drift by a penny', () => {
  for (const s of runway(1_234_567, LEGS).steps) assert.ok(Number.isInteger(s.balance), `${s.balance} is not minor units`);
});

test('the crossing is ONE row, and the rest of the year is not the same colour', () => {
  // The walk exists to produce a day. Painting every row after it `bad` too says "everything from
  // here is an emergency", which is both true and useless: the eye has nothing to land on, and the
  // one row worth acting on looks like all the others.
  //
  // The block is widened for the length of the test because its heading is "What is coming" and
  // twelve movements is what that heading promises — the crossing at day 116 is named by the Runway
  // tile, not by this table. What is under test is the mapping, so the window has to reach it.
  const decl = PAGES.money?.blocks.find((b) => b.source === 'forecast.runway');
  assert.ok(decl, 'the money page has no cash walk');
  const before = decl.limit;
  decl.limit = 60;
  try {
    const block = page('money')?.blocks.find((b) => b.source === 'forecast.runway');
    assert.ok(block);
    const at = block.rows.findIndex((r) => r.tone === 'bad');
    assert.ok(at >= 0, 'the widened window does not reach the crossing, so nothing is being tested');
    assert.equal(block.rows.filter((r) => r.tone === 'bad').length, 1, 'more than one row is drawn as the crossing');
    /* `warn` is STILL UNDER, not "after the crossing" — the balance recovers when a receivable
       lands, and a row back in the black is not a warning. Read from the drawn balance column, so
       what is asserted is what somebody sees. */
    block.rows.forEach((r, i) => {
      if (i === at) return;
      const balance = magnitudeOf(r.cells[3] ?? '');
      assert.equal(r.tone, balance < 0 ? 'warn' : undefined, `row ${i} (${r.cells[1]}) carries the wrong tone`);
    });
    assert.ok(block.rows.some((r) => magnitudeOf(r.cells[3] ?? '') < 0), 'no row is under, so nothing is tested');
  } finally {
    // Put it back exactly as it was, including not being set: an optional property assigned
    // `undefined` is not an absent one.
    if (before === undefined) delete (decl as { limit?: number }).limit;
    else decl.limit = before;
  }
});

/* ── the fit ─────────────────────────────────────────────────────────────── */

test('too few buckets is flat, and says how many it needed', () => {
  const t = trend([100, 110, 120, 130, 140]);
  assert.equal(t.kind, 'flat');
  assert.match(t.why, /needs 6/);
});

test('noise is flat, however tempting the slope', () => {
  // This is the whole point. A line through this has a gradient; printing it as growth is how a
  // product invents a figure that then gets defended for a year.
  const t = trend([100, 140, 90, 150, 95, 145, 92, 148]);
  assert.equal(t.kind, 'flat');
  assert.match(t.why, /not significant/);
});

test('real compound growth is reported with a band', () => {
  const t = trend([100, 110, 121, 133, 146, 161, 177, 195]);
  assert.equal(t.kind, 'growth');
  if (t.kind !== 'growth') return;
  assert.ok(Math.abs(t.rate - 1.1) < 0.02, `rate was ${t.rate}`);
  assert.ok(t.low < t.rate && t.rate < t.high, 'the band has to contain the estimate');
});

test('decline is a trend too, and is not rounded up to flat', () => {
  const t = trend([200, 180, 162, 146, 131, 118, 106, 95]);
  assert.equal(t.kind, 'growth');
  if (t.kind !== 'growth') return;
  assert.ok(t.rate < 1, `a falling series reported ${t.rate}`);
});

test('the projection compounds the last complete bucket, and is capped out loud', () => {
  const steady = trend([100, 110, 121, 133, 146, 161], 3);
  assert.equal(steady.kind, 'growth');
  if (steady.kind !== 'growth') return;
  assert.equal(steady.capped, false);
  assert.equal(steady.projection.length, 3);
  assert.ok(steady.projection[0]! > 161, 'the projection has to start after the last bucket');

  // An uncapped exponential on six points is a number that will be quoted, so it is ceilinged at
  // ten times the last bucket and the fact is reported rather than hidden.
  const steep = trend([1, 8, 64, 512, 4096, 32768], 4);
  assert.equal(steep.kind, 'growth');
  if (steep.kind !== 'growth') return;
  assert.equal(steep.capped, true);
  assert.ok(steep.projection.every((p) => p <= 32768 * 10));
});

test('too few buckets survive the zeros to fit at all', () => {
  // Zero has no logarithm, so a zero bucket cannot be a point. Three survivors is under the gate.
  const t = trend([0, 0, 0, 100, 110, 121]);
  assert.equal(t.kind, 'flat');
  assert.match(t.why, /usable buckets/);
  assert.equal(t.dropped, 3, 'the dropped buckets have to be reported, not swallowed');
});

test('DROPPING A BUCKET MUST NOT DROP A UNIT OF TIME', () => {
  // The bug this replaces, and the worst kind: a plausible number, confidently stated. Twelve
  // months with alternating zeros were fitted as six consecutive months — 1.0997 a month where the
  // truth over those twelve is 1.0488, `n` reporting 6 when handed 12, and `t` at 379, which reads
  // as beyond argument.
  const t = trend([100, 0, 110, 0, 121, 0, 133, 0, 146, 0, 161, 0]);
  assert.equal(t.kind, 'growth');
  if (t.kind !== 'growth') return;
  const truth = Math.pow(161 / 100, 1 / 10);
  assert.ok(Math.abs(t.rate - truth) < 0.001, `rate ${t.rate} against a true ${truth}`);
  assert.equal(t.dropped, 6);
});

test('a zeroed bucket and a deleted bucket are not the same series', () => {
  // This is the property that proves time is preserved, and the one that failed before: the two
  // returned an identical rate, which they can only do if the gap was closed up.
  const zeroed = trend([100, 110, 121, 133, 146, 0, 177, 195, 214, 236, 259, 285]);
  const deleted = trend([100, 110, 121, 133, 146, 177, 195, 214, 236, 259, 285]);
  if (zeroed.kind !== 'growth' || deleted.kind !== 'growth') return assert.fail('expected growth');
  assert.notEqual(zeroed.rate.toFixed(4), deleted.rate.toFixed(4));
});

test('the band uses Student t, not the large-sample limit', () => {
  // The gate fires at six points, where df is 4 and the two-tailed 97.5% value is 2.776 — so a band
  // drawn with 1.96 is about 40% too narrow. A function whose whole thesis is refusing to over-claim
  // cannot then under-state its own uncertainty.
  const six = trend([100, 111, 120, 134, 145, 162]);
  const many = trend([100, 111, 120, 134, 145, 162, 177, 196, 213, 236, 259, 287, 315, 349, 380, 420]);
  if (six.kind !== 'growth' || many.kind !== 'growth') return assert.fail('expected growth');
  const width = (t: typeof six) => Math.log(t.high) - Math.log(t.low);
  // Same shape of series; the small one must carry the wider interval.
  assert.ok(width(six) > width(many), 'six points reported no more uncertainty than sixteen');
});

test('the projection is integers, because it is money', () => {
  const t = trend([100, 110, 121, 133, 146, 161]);
  if (t.kind !== 'growth') return assert.fail('expected growth');
  for (const p of t.projection) assert.ok(Number.isInteger(p), `${p} is not an integer`);
});

/* ── states, and months ──────────────────────────────────────────────────── */

test('a cancelled service is never charged again', () => {
  // The guard read `state === 'ended'`. The register declares live, lapsing and cancelled — there
  // is no `ended` — so it never fired once, and a cancelled monthly subscription took GBP 174.00
  // out of the forecast over six months as the FIRST row of the money page.
  const cancelled = (ROWS.services ?? []).filter((s) => s.fields.state === 'cancelled');
  assert.ok(cancelled.length > 0, 'the seed needs a cancelled service for this to mean anything');
  const names = new Set(cancelled.map((s) => String(s.fields.name)));
  for (const step of runway(0, LEGS, 400).steps) {
    assert.ok(!names.has(step.label), `${step.label} is cancelled and is still being charged`);
  }
});

test('the guard is spelled with a state the register actually has', () => {
  // The bug was a typo that typechecked. Asserting the vocabulary directly means the next rename
  // breaks a test rather than a forecast.
  const states = new Set((ROWS.services ?? []).map((s) => String(s.fields.state)));
  assert.ok(states.has('cancelled'), 'the seed no longer has the state the walk filters on');
  assert.ok(!states.has('ended'), 'a state called `ended` appeared; the walk does not know it');
});

test('a monthly charge falls in every month, including February', () => {
  // `setUTCMonth` overflows: 31 Jan stepped to 3 Mar, so February had no charge and March had two.
  const jan31 = (ROWS.services ?? []).length; // touch the seed so the import is not unused
  assert.ok(jan31 >= 0);
  const months = runway(0, LEGS, 365)
    .steps.filter((s) => s.source === 'services')
    .map((s) => s.day.slice(0, 7));
  const counts = new Map<string, number>();
  for (const m of months) counts.set(m, (counts.get(m) ?? 0) + 1);
  // No month may be skipped between the first and last month a service charges in.
  const keys = [...new Set(months)].sort();
  const first = keys[0];
  const last = keys[keys.length - 1];
  assert.ok(first && last);
  assert.ok(counts.size > 1, 'a year of renewals landed in one month');
});

/* ── the arithmetic a monthly charge does to a calendar ───────────────────────── */

test('A MONTHLY CHARGE NEVER SKIPS A MONTH AND NEVER LANDS TWICE IN ONE', () => {
  /* `setUTCMonth` OVERFLOWS: 29 Jan + 1 month is 29 Feb, which does not exist, so it rolls to
     1 March — and then 29 March. Nothing in February, two charges in March, and every balance
     between the two one charge too high on a screen somebody reads to decide whether they can pay a
     bill. The fix had been written once and landed in a helper nothing called.

     ASSERTED PER ROW, so it holds whatever the fixture's own dates are: one subscription's charges
     must walk one month at a time. */
  const monthly: Leg = { register: 'services', on: 'renews', amount: 'cost', every: { field: 'cycle', months: { monthly: 1 } } };
  const byRow = new Map<string, string[]>();
  // Overdue charges are clamped to today on purpose — the walk stays in order and a balance already
  // gone is gone at the top of it — so several of one row's can share a day. They are not the
  // arithmetic under test.
  for (const step of runway(1_000_000, [monthly], 400).steps)
    if (!step.label.includes('overdue')) byRow.set(step.href, [...(byRow.get(step.href) ?? []), step.day]);

  for (const [href, days] of byRow) {
    for (let i = 1; i < days.length; i++) {
      const [ay = 0, am = 0] = days[i - 1]!.split('-').map(Number);
      const [by = 0, bm = 0] = days[i]!.split('-').map(Number);
      const apart = (by - ay) * 12 + (bm - am);
      assert.equal(apart, 1, `${href} charged ${days[i - 1]} then ${days[i]}, which is ${apart} months apart`);
    }
  }
});

test('and the day of the month is held, clamped rather than overflowed', () => {
  // The rule `where.ts` already uses for predicates: a step onto a day the month does not have
  // lands on the last day it does, not on the first of the next one.
  const monthly: Leg = { register: 'services', on: 'renews', amount: 'cost', every: { field: 'cycle', months: { monthly: 1 } } };
  for (const step of runway(1_000_000, [monthly], 400).steps) {
    const [y, m, d] = step.day.split('-').map(Number);
    assert.ok(y && m && d, step.day);
    assert.ok(d! <= new Date(Date.UTC(y!, m!, 0)).getUTCDate(), `${step.day} is not a real day`);
  }
});

test('A BARE NUMBER IN A STERLING WALK IS MIXING, and the walk says so', () => {
  /* `amountOf` coerces any scalar and `currencyOf` answers `null` for it, so a leg pointing at a
     `duration` poured seconds into a sterling walk while `mixed` stayed empty — seventeen thousand
     seconds arrived on the screen as GBP −172.80, and the crossing day moved. */
  const seconds: Leg = { register: 'tasks', on: 'by', amount: 'effort' };
  const money: Leg = { register: 'obligations', on: 'due', amount: 'amount', incoming: { field: 'direction', is: 'owed_to_me' } };
  const walk = runway(1_000_000, [money, seconds], 180);
  assert.ok(walk.mixed.length > 0, 'seconds were added to sterling and nothing said so');
  assert.equal(walk.currency, null, 'a mixed walk is in no currency');
  assert.deepEqual(walk.steps, [], 'a mixed walk draws no steps');
});
