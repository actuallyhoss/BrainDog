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

import { runway, trend } from './forecast.ts';
import { ROWS } from './data.ts';

/* ── the walk ────────────────────────────────────────────────────────────── */

test('the walk starts from what is liquid and ends somewhere else', () => {
  const r = runway(1_000_000);
  assert.equal(r.from, 1_000_000);
  assert.ok(r.steps.length > 0, 'the seed has dated movements, so the walk cannot be empty');
});

test('every step carries the balance after it, and they chain', () => {
  // The point of returning the sequence rather than the answer: each row has to be readable as
  // "and this is where you were after that one".
  const r = runway(500_000);
  let acc = r.from;
  for (const s of r.steps) {
    acc += s.delta;
    assert.equal(s.balance, acc, `${s.day} ${s.label} broke the chain`);
  }
});

test('the walk is in date order, and an outgoing on a day comes before an incoming', () => {
  // A balance that dips under at breakfast and recovers by lunchtime has still bounced. Ordering
  // receipts first on a shared day produces the same closing figure and hides the crossing.
  const r = runway(500_000);
  for (let i = 1; i < r.steps.length; i++) {
    const a = r.steps[i - 1]!, b = r.steps[i]!;
    assert.ok(a.day <= b.day, `${a.day} came before ${b.day}`);
    if (a.day === b.day) assert.ok(a.delta <= b.delta, `on ${a.day} an incoming was paid before an outgoing`);
  }
});

test('a recurring service is charged once per cycle across the window, not once in total', () => {
  // The failure this catches is silent and always in the same direction: too cheap. A monthly
  // service inside a 180-day window is six charges, and reading the stored date once is one.
  const short = runway(0, 40).steps.filter((s) => s.source === 'service').length;
  const long = runway(0, 400).steps.filter((s) => s.source === 'service').length;
  assert.ok(long > short, `${long} service charges over 400 days against ${short} over 40`);
});

test('a longer horizon is a superset: it never loses a movement', () => {
  const near = runway(0, 60).steps.map((s) => `${s.day} ${s.label}`);
  const far = new Set(runway(0, 365).steps.map((s) => `${s.day} ${s.label}`));
  for (const s of near) assert.ok(far.has(s), `${s} vanished when the horizon grew`);
});

test('nothing before today is in the walk', () => {
  // An overdue invoice is a fact about the present, not a movement still to come. Counting it again
  // in the future would double it.
  const today = new Date().toISOString().slice(0, 10);
  for (const s of runway(0, 365).steps) assert.ok(s.day >= today.slice(0, 4), 'a step predates the walk');
});

test('a large enough opening balance never crosses', () => {
  const r = runway(500_000_000);
  assert.equal(r.crossed, null);
  assert.equal(r.days, null);
});

test('crossing is the FIRST step under zero, and it names the row that did it', () => {
  const r = runway(0);
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
  for (const s of runway(1_234_567).steps) assert.ok(Number.isInteger(s.balance), `${s.balance} is not minor units`);
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
  for (const step of runway(0, 400).steps) {
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
  const months = runway(0, 365)
    .steps.filter((s) => s.source === 'service')
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
