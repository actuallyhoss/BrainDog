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
import { compile, explain, matches, resolveDay } from './where.ts';

const keep = (register: string, where: string) => {
  const w = compile(register, where);
  return (ROWS[register] ?? []).filter((e) => matches(e, w, NOW));
};

const all = (register: string) => (ROWS[register] ?? []).length;

/* ── the failure that motivated it ───────────────────────────────────────── */

test('a filter it cannot parse matches NOTHING, never everything', () => {
  const out = keep('services', 'this is not a filter at all');
  assert.equal(out.length, 0, 'an unparseable filter passed rows through');
  /* AND IT SAYS SO IN THE KERNEL'S WORDS. `13 §6`: the app renders the server's `fix` verbatim, and
     this file had its own — "not a predicate", a verdict with no instruction, using the schema's
     word for a thing whose button says Filter. */
  const said = compile('services', 'nonsense here').bad[0] ?? '';
  assert.match(said, /not something a filter can say/);
  assert.ok(!/predicate/.test(said), 'the schema is talking about itself in a refusal');
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
  const w = compile('tasks', 'by before today');
  for (const e of rows) assert.equal(matches(e, w, NOW), false);
});

/* ── the refusal names what to write instead ─────────────────────────────── */

test('the predicate TREE the docs also show is refused, not thrown on', () => {
  // `06-PAGES` §1 writes `where: { all: [...] }` and `21-AUTHORING` §4.5 says the sentence is the
  // read-only restatement of it. An agent following either is following the documentation, and the
  // object reached `.split`, threw, and took the whole page with it.
  const w = compile('obligations', { all: [{ field: 'state', in: ['open'] }] } as unknown as string);
  assert.equal(w.clauses.length, 0);
  assert.match(w.bad[0] ?? '', /sentence/);
  assert.match(w.bad[0] ?? '', /state is open/, 'a refusal that does not show the shape is a dead end');
});

test('an operator the build does not read is named as an operator, not matched as a value', () => {
  // `21-AUTHORING` §4.2 publishes eleven and four are implemented. `amount is at least 10000` parsed
  // as `is` against the literal string "at least 10000", matched nothing, and drew the author's own
  // "nothing matched" sentence — the one state that must be kept apart from a filter that failed.
  for (const [text, word] of [
    ['amount is at least 10000', 'at least'],
    ['note is empty', 'empty'],
    ['amount is between 1 and 2', 'between'],
  ] as const) {
    const w = compile('obligations', text);
    assert.ok(w.bad.length, `${text} was accepted`);
    assert.match(w.bad[0] ?? '', new RegExp(word));
    assert.match(w.bad[0] ?? '', /is not/, 'the refusal has to say what does work');
  }
});

test('and an operator word that is a real value is still a value', () => {
  // The check runs after the declared set, so an enum that genuinely holds one of those words
  // resolves. `state is open` is the case that matters, and `present`/`in` are the ones at risk.
  assert.deepEqual(compile('obligations', 'state is open').bad, []);
  assert.deepEqual(compile('services', 'state is live').bad, []);
});

test('an unparseable clause says which four operators exist, in the words to type', () => {
  /* THE SENTENCE IS THE KERNEL'S, BYTE FOR BYTE (`packages/where/src/sentence.ts`). It used to be
     `This build reads: is · is not · before · after` — middle dots a person cannot type, and the
     software describing itself. */
  const said = compile('obligations', 'what contains invoice').bad[0] ?? '';
  assert.match(said, /Write is, is not, before or after\./);
  assert.ok(!/This build/.test(said), 'the software is describing itself in a refusal');
});

/* ── shape ───────────────────────────────────────────────────────────────── */

test('whitespace and case are not part of the grammar', () => {
  assert.equal(keep('services', '  STATE   IS   Live  ').length, keep('services', 'state is live').length);
});

test('an unknown field matches nothing rather than everything', () => {
  assert.equal(keep('services', 'nope is live').length, 0);
});

/* ── operands are CHECKED, not just parsed ───────────────────────────────── */

test('a date operand that is not a date is refused, not compared as a string', () => {
  // Every one of these parsed cleanly in the first version and then string-compared: `'2026-08-01'
  // > '-7d'` is true because '2' sorts after '-', so a "this week" block drew the whole register.
  for (const bad of ['-7d ago', 'soon', 'last tuesday', 'next month']) {
    const w = compile('obligations', `due after ${bad}`);
    assert.ok(w.bad.length, `${bad} was accepted as a date`);
    assert.equal(keep('obligations', `due after ${bad}`).length, 0);
  }
});

test('the temporal literals resolve, and are not all the same day', () => {
  const days = ['today', 'tomorrow', 'yesterday', 'bom', 'eom', 'boy', 'eoy', '+30d', '-7d', '+2w', '+1m'];
  const seen = new Set<string>();
  for (const d of days) {
    const out = resolveDay(d, NOW);
    assert.ok(out && /^\d{4}-\d{2}-\d{2}$/.test(out), `${d} did not resolve`);
    seen.add(out);
  }
  assert.ok(seen.size >= 9, 'several literals collapsed onto the same day');
});

test('a month is a calendar month, and it clamps rather than overflowing', () => {
  // One month after 31 January is the last day of February. Adding to the month number rolls into
  // March, which is not what anybody means by "in a month".
  const jan31 = Date.parse('2026-01-31T12:00:00Z');
  assert.equal(resolveDay('+1m', jan31), '2026-02-28');
  assert.equal(resolveDay('-1m', Date.parse('2026-03-31T12:00:00Z')), '2026-02-28');
});

test('a relative window actually narrows, in the direction it says', () => {
  const soon = keep('obligations', 'due before +30d');
  const later = keep('obligations', 'due before +365d');
  assert.ok(soon.length > 0, '+30d matched nothing, which is the old failure in the other direction');
  assert.ok(soon.length < later.length, 'a wider window did not admit more rows');
  assert.ok(later.length <= all('obligations'));
});

test('a value the field cannot hold is refused, and says which', () => {
  // `done` is a TASK state. Obligations have none, so `state is not done` was true of all 38 —
  // a negation over a typo passing the whole register through.
  const w = compile('obligations', 'state is not done');
  assert.ok(w.bad.length, 'an impossible value was accepted');
  assert.match(w.bad[0] ?? '', /state has no value done/);
  assert.equal(keep('obligations', 'state is not done').length, 0);
});

test('a ref value that names no row is refused', () => {
  const w = compile('tasks', 'thing is Atlantis');
  assert.ok(w.bad.length);
  assert.equal(keep('tasks', 'thing is Atlantis').length, 0);
});

test('every value in an `or` is checked, not just the first', () => {
  const w = compile('obligations', 'state is open or nonsense');
  assert.ok(w.bad.length, 'a bad value hid behind a good one');
});

test('explain says what was wrong, because the refusal is the teacher', () => {
  const w = compile('obligations', 'state is not done, due after soon');
  assert.equal(explain(w).length, 2);
  for (const line of explain(w)) assert.ok(line.length > 10, 'a refusal that explains nothing is a dead end');
});
