/**
 * The `where:` evaluator, whose failure mode is the reason it exists.
 *
 * A filter that does not understand its own predicate must return NOTHING. The version this
 * replaces returned everything: five `String.includes` checks, and any predicate outside them was
 * silently ignored, so a block drew the whole register and looked exactly like a block that had
 * filtered. An agent writing a declaration cannot see that. It writes a page, the page renders,
 * every figure on it is about the wrong rows, and the only person who could catch it is the one who
 * trusted the agent.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { NOW, ROWS } from './data.ts';
import { matches, parseWhere } from './where.ts';

const keep = (register: string, where: string) =>
  (ROWS[register] ?? []).filter((e) => matches(register, e, parseWhere(where), NOW));

const all = (register: string) => (ROWS[register] ?? []).length;

/* ── the failure that motivated it ───────────────────────────────────────── */

test('a predicate it cannot parse matches NOTHING, never everything', () => {
  const out = keep('services', 'this is not a predicate at all');
  assert.equal(out.length, 0, 'an unparseable filter passed rows through');
  assert.deepEqual(parseWhere('nonsense here').bad, ['nonsense here']);
});

test('one bad clause poisons the whole predicate rather than being skipped', () => {
  // Half a filter is more dangerous than none: the block looks filtered and is not.
  assert.equal(keep('services', 'state is live, wat').length, 0);
});

test('an empty predicate keeps everything, which is the one safe pass-through', () => {
  assert.equal(keep('services', '').length, all('services'));
});

/* ── the grammar ─────────────────────────────────────────────────────────── */

test('one value', () => {
  const out = keep('services', 'state is live');
  assert.ok(out.length > 0 && out.length < all('services'));
  for (const e of out) assert.equal(e.fields.state, 'live');
});

test('several values, read as "or"', () => {
  const live = keep('services', 'state is live').length;
  const lapsing = keep('services', 'state is lapsing').length;
  assert.equal(keep('services', 'state is live or lapsing').length, live + lapsing);
});

test('clauses are ANDed', () => {
  const out = keep('services', 'state is live, cycle is monthly');
  assert.ok(out.length > 0, 'the seed needs a live monthly service for this to mean anything');
  for (const e of out) {
    assert.equal(e.fields.state, 'live');
    assert.equal(e.fields.cycle, 'monthly');
  }
  assert.ok(out.length < keep('services', 'state is live').length, 'the second clause did nothing');
});

test('negation', () => {
  const out = keep('services', 'state is not live');
  for (const e of out) assert.notEqual(e.fields.state, 'live');
  assert.equal(out.length, all('services') - keep('services', 'state is live').length);
});

/* ── values are read the way they are SHOWN ──────────────────────────────── */

test('an enum matches the words a reader sees, not the identifier it stores', () => {
  // `owed_to_me` on the row, "owed to me" on the screen, and the predicate is written the second
  // way — which is the entire argument for having a readable predicate.
  const out = keep('obligations', 'direction is owed to me');
  assert.ok(out.length > 0);
  for (const e of out) assert.equal(e.fields.direction, 'owed_to_me');
});

test('a ref matches the NAME of the row it points at', () => {
  // The declaration says `thing is Kiln`, never `thing is 1`.
  const out = keep('tasks', 'thing is Kiln');
  assert.ok(out.length > 0);
  const kiln = (ROWS.things ?? []).find((t) => t.fields.name === 'Kiln')?.seq;
  for (const e of out) assert.equal(e.fields.thing, kiln);
});

test('and the stored form still matches, so an agent may write either', () => {
  assert.equal(keep('obligations', 'direction is owed_to_me').length, keep('obligations', 'direction is owed to me').length);
});

/* ── dates ───────────────────────────────────────────────────────────────── */

test('before and after are exclusive, and take an ISO day', () => {
  const before = keep('obligations', 'due before 2026-09-01');
  const after = keep('obligations', 'due after 2026-09-01');
  for (const e of before) assert.ok(String(e.fields.due) < '2026-09-01');
  for (const e of after) assert.ok(String(e.fields.due) > '2026-09-01');
  // Neither contains the boundary, so the two cannot overlap.
  assert.equal(before.filter((e) => after.includes(e)).length, 0);
});

test('`today` resolves against the record clock, not the wall clock', () => {
  const overdue = keep('obligations', 'due before today');
  assert.ok(overdue.length > 0, 'the seed has overdue rows');
  const today = new Date(NOW).toISOString().slice(0, 10);
  for (const e of overdue) assert.ok(String(e.fields.due) < today);
});

test('a row with no value for a dated field is not silently included', () => {
  // A missing date is not "before" anything. Counting it would put rows with no due date into an
  // overdue list, which is the sort of thing somebody acts on.
  const rows = (ROWS.tasks ?? []).filter((t) => !t.fields.by);
  for (const e of rows) assert.equal(matches('tasks', e, parseWhere('by before today'), NOW), false);
});

/* ── shape ───────────────────────────────────────────────────────────────── */

test('whitespace and case are not part of the grammar', () => {
  assert.equal(keep('services', '  STATE   IS   Live  ').length, keep('services', 'state is live').length);
});

test('an unknown field matches nothing rather than everything', () => {
  assert.equal(keep('services', 'nope is live').length, 0);
});
