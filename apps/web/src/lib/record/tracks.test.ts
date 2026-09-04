/**
 * A track's health, which is derived and must stay derived.
 *
 * The rule this file exists to protect is the one every implementation of this mechanism drops:
 * `not_expected` is a SEPARATE value from `missing`. A track that is holding or done is not silent
 * — nobody is expected to say anything about it. Collapse the two and every finished and parked
 * track piles into the missing bucket, the bucket becomes noise, and the nudge built on it is dead
 * inside a month (20 §9). Nothing about that failure is visible in a screenshot; it takes a month
 * and it looks like people ignoring a reminder.
 *
 * The other one is ordering. `trackHealth` takes the NEWEST update, and a seed or a query that
 * hands them over in the other order still renders a health, still looks right, and is wrong.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { healthLabel, healthTone, sessionsFor, trackHealth, updatesFor } from './api.ts';
import { REGISTERS, ROWS } from './data.ts';

/* ── the derivation ──────────────────────────────────────────────────────── */

test('health is the NEWEST update, not the first and not the last written', () => {
  // Track 1 has two updates twenty days and three days old. The three-day-old one wins.
  const t = trackHealth(1);
  assert.equal(t.health, 'on_track');
  assert.equal(t.by, 'claude', 'the newest update on track 1 is claude’s');
});

test('a track that has gone bad reports the bad news, not an average', () => {
  // Track 2 went on_track then at_risk. There is no smoothing: the last person to look decides.
  assert.equal(trackHealth(2).health, 'at_risk');
});

test('a track nobody has ever written about is MISSING, not blank and not healthy', () => {
  const t = trackHealth(3);
  assert.equal(t.health, null);
  assert.equal(t.state, 'missing');
  assert.equal(healthLabel(t), 'Update missing');
});

test('a holding track expects nothing, even though it has an old update', () => {
  // Track 4 is `holding` with an update 45 days old. Silence there is correct, not overdue.
  const t = trackHealth(4);
  assert.equal(t.state, 'not_expected');
  assert.equal(healthLabel(t), 'No update expected');
});

test('a finished track expects nothing, even with no update at all', () => {
  // Track 5 is `done` and has never had one. This is the case that floods the missing bucket if
  // the two states are collapsed into a boolean.
  const t = trackHealth(5);
  assert.equal(t.health, null);
  assert.equal(t.state, 'not_expected');
});

test('an open track whose newest update has gone stale says so without losing the health', () => {
  const t = trackHealth(2);
  assert.equal(t.state, 'current', 'two days old is current');
  // And the label carries both facts when it is not.
  assert.equal(healthLabel({ health: 'on_track', asOf: null, by: null, state: 'missing' }), 'On track, and stale');
});

test('no update is not an alarm', () => {
  // Nobody having spoken is not bad news, and painting it in the danger colour teaches people that
  // the danger colour means nothing in particular.
  assert.equal(healthTone(null), undefined);
  assert.equal(healthTone('on_track'), 'good');
  assert.equal(healthTone('at_risk'), 'warn');
  assert.equal(healthTone('off_track'), 'bad');
});

/* ── the shape of the thing ──────────────────────────────────────────────── */

test('health is nowhere in the track declaration', () => {
  // The whole mechanism rests on there being nowhere else to look. A `health` column on `tracks`
  // would be a second source of truth that can disagree with the log.
  const fields = REGISTERS.tracks?.fields.map((f) => f.id) ?? [];
  assert.ok(fields.length > 0, 'the tracks register must exist');
  assert.ok(!fields.includes('health'), 'health became a stored field');
});

test('an update cannot exist without a health, a body, an author and a date', () => {
  const required = (REGISTERS.updates?.fields ?? []).filter((f) => f.required).map((f) => f.id);
  for (const id of ['body', 'health', 'track', 'by', 'at']) {
    assert.ok(required.includes(id), `${id} is not required, so an update can be posted without it`);
  }
});

test('updates read newest first, because that is the order a person reads a thread in', () => {
  const list = updatesFor(1).map((u) => String(u.fields.at));
  assert.deepEqual(list, [...list].sort().reverse());
});

/* ── the pin ─────────────────────────────────────────────────────────────── */

test('a session can be pinned to a track, and most are not', () => {
  const pinned = (ROWS.sessions ?? []).filter((x) => x.fields.track !== undefined);
  assert.ok(pinned.length > 0, 'nothing is pinned, so the pin is untested');
  assert.ok(
    pinned.length < (ROWS.sessions ?? []).length,
    'every session carries a track — the seed is demonstrating the over-assignment failure it exists to avoid',
  );
});

test('a track gathers its own sessions, most recently seen first', () => {
  const seen = sessionsFor(1).map((x) => String(x.fields.last_seen));
  assert.ok(seen.length >= 2, 'track 1 needs more than one session for the order to mean anything');
  assert.deepEqual(seen, [...seen].sort().reverse());
});

test('track is not in any register’s mobile columns', () => {
  // Three fields become the phone card. A grouping field that most rows leave empty is never one
  // of the three most important things about a row.
  for (const [id, reg] of Object.entries(REGISTERS)) {
    assert.ok(!(reg.mobile ?? []).includes('track'), `${id} put track on its phone card`);
  }
});
