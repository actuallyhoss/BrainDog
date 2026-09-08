/**
 * The record's own ledger, against the vocabulary the record actually has.
 *
 * `AUDIT` HELD EIGHT ROWS AND NOT ONE OF THEM COULD HAVE BEEN WRITTEN. `kind` was typed `string`,
 * and the seed said `entry.create`, `entry.update`, `question.open` and `declaration.set`; the
 * screen's display map added `entry.archive`, `question.decide` and `pack.install`. The forty kinds
 * are `30 §2`, closed by a `CHECK` in migration 0001, and the list has been exported from
 * `@braindog/kernel` the whole time — `event-kinds.mjs` exists solely to keep five copies of it
 * agreeing. The browser was a sixth copy nobody had thought to compare.
 *
 * There was no test here because there was no file here: `AUDIT` is the record's most-quoted array
 * — `/audit`, the home feed and every row's history read it — and its only assertion lived inside
 * a test about `display()`.
 *
 * WHAT THESE ASSERT IS AGREEMENT, not shape. Every one of them is a place two surfaces could tell
 * different stories about one night, which is the failure this record keeps finding in itself.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isEventKind } from '@braindog/kernel';
import { boot } from './api.ts';
import { AUDIT, DECIDED, PEOPLE_ACCESS, QUESTIONS, SNAPSHOTS } from './data.ts';

test('EVERY EVENT IN THE LEDGER IS A KIND THE DATABASE WOULD ACCEPT', () => {
  /* `30 §2` rule 1: "A new kind is a kernel migration, not a string somebody passes." The seed
     passed seven. */
  for (const e of AUDIT) assert.ok(isEventKind(e.kind), `${e.kind} is not one of the forty`);
  assert.ok(AUDIT.length > 8, 'the ledger lost rows');
});

test('and the actor grammar closes `spark` to three of them', () => {
  /* `30 §3`, in as many words: "an invariant with a test — `event WHERE actor='spark' AND kind NOT
     IN ('suggest','propose','predict')` must always be empty." It is `11 §2`'s architectural claim
     written as a query anybody can run against a real record: the assistant proposes and never
     writes. */
  const sparkKinds = new Set(['suggest', 'propose', 'predict']);
  for (const e of AUDIT)
    if (e.by === 'spark') assert.ok(sparkKinds.has(e.kind), `spark wrote a ${e.kind}, which 30 §3 forbids`);

  /* AND IT IS NOT VACUOUS. A ledger with no `spark` row satisfies the invariant the way an empty
     list satisfies anything — which is what it did until the proposal behind the two Fenwick
     services was written down. */
  assert.ok(AUDIT.some((e) => e.by === 'spark'), 'no spark row, so the assertion above proves nothing');
});

test('A SEQ IS A PLACE IN THE LIST, so the ledger reads in one order', () => {
  /* `30 §1` makes `version` the rowid and `/audit`'s footer says it out loud: "a version number is
     a place in this list". Two hand-numbered arrays about the same four nights is what made that
     false — the nightly runs at 03:17 UTC on Cloud and 02:41 on a self-host, so the same night
     falls on either side of a 03:00 write depending on which host you are reading. */
  for (let i = 1; i < AUDIT.length; i++) {
    const older = AUDIT[i]!;
    const newer = AUDIT[i - 1]!;
    assert.ok(newer.seq > older.seq, `seq ${newer.seq} is not above ${older.seq}`);
    assert.ok(newer.at >= older.at, `${newer.at} is listed above ${older.at}`);
    assert.equal(newer.version, newer.seq, 'the version and the seq are the same fact');
  }
});

test('EVERY NIGHT IN THE ARCHIVE IS A NIGHT IN THE LEDGER', () => {
  /* THE DEFECT THIS FILE EXISTS FOR. `/settings/backups` drew a failed night and `/audit` showed a
     ledger in which every night ran — because the ledger had no `export` rows at all. Two screens,
     one night, two stories, on the pair whose entire job is that the record is checkable. */
  const exports = AUDIT.filter((e) => e.kind === 'export');
  assert.equal(exports.length, SNAPSHOTS.length, 'the archive and the ledger count different nights');
  for (const snap of SNAPSHOTS) {
    const row = exports.find((e) => e.at.startsWith(snap.at));
    assert.ok(row, `the night of ${snap.at} is in the archive and not in the ledger`);
    assert.equal(row.by, 'system', '`30 §3`: the scheduler is `system`');
  }
});

test('and a night that produced nothing says so in `12 §8`’s own words', () => {
  /* "a failed night writes an `export` event with `note: 'failed: <reason>'` and opens a
     `suggestion` (re-run the snapshot)". Both halves, because `30 §2` is explicit that there is no
     other way to record one: "`blocker` is not an event kind." */
  const failed = SNAPSHOTS.filter((s) => s.failed !== null);
  assert.ok(failed.length > 0, 'no failed night in the seed, so nothing below is being tested');

  for (const snap of failed) {
    const row = AUDIT.find((e) => e.kind === 'export' && e.at.startsWith(snap.at));
    assert.ok(row, `${snap.at} failed and the ledger has no export row for it`);
    assert.equal(row.note, `failed: ${snap.failed}`, '`12 §8` fixes the shape of this string');

    const asked = AUDIT.find((e) => e.kind === 'suggest' && e.at.startsWith(snap.at));
    assert.ok(asked, `${snap.at} failed and opened no suggestion`);
    const target = asked.target;
    assert.ok(target, `${snap.at}'s suggestion names nothing`);
    assert.ok(target.startsWith('suggestion:'), '`45 §5.1` prefixes a governance target');

    /* AND THE EXPORT COMES FIRST. They are one write with two events (`45 §5`: `appendEvent × 2`),
       so they share an instant — and a ledger that lists the question above the failure that caused
       it reads as two unrelated things happening at 02:41. This is the only place in the ledger
       where the tiebreak fires at all. */
    assert.ok(asked.seq > row.seq, 'the suggestion is listed below the failure that opened it');

    /* AND THE SUGGESTION IS SOMETHING A PERSON CAN ANSWER. `49 §5.13` raises it as a question with
       *Run it now* and *Ignore* — an event nobody is shown is the silence `12 §8` is about. */
    const id = target.slice('suggestion:'.length);
    const question = QUESTIONS.find((q) => q.id === id);
    assert.ok(question, `${id} is in the ledger and not in the gate`);
    assert.deepEqual(question.options.map((o) => o.key), ['run', 'ignore']);
    assert.ok(question.cost.includes(snap.failed ?? ''), 'the question does not say why the night failed');
  }
});

test('and a good night records what makes “it is backed up” checkable', () => {
  /* `12 §8`: the walk "records row counts in the object's metadata so *it is backed up* is
     checkable". A night that says only that it happened is not. */
  for (const snap of SNAPSHOTS) {
    if (snap.failed !== null) continue;
    const row = AUDIT.find((e) => e.kind === 'export' && e.at.startsWith(snap.at));
    assert.ok(row, `${snap.at}`);
    assert.equal(row.note, `${snap.rows} rows, sealed`);
    assert.ok(snap.rows > 0, 'a sealed copy of nothing is not a sealed copy');
  }
});

test('A GOVERNANCE TARGET NAMES A ROW THE GATE HAS', () => {
  /* An audit line's target is a LINK, and `45 §5.1`'s `suggestion:SG<n>` shape has to resolve to
     something. A ledger pointing at ids the record does not hold is a log full of dead ends on the
     screen somebody opens when they already suspect something is wrong. */
  const known = new Set([...QUESTIONS, ...DECIDED].map((q) => q.id));
  for (const e of AUDIT) {
    const governed = /^(?:suggestion|decision):(.+)$/.exec(e.target ?? '');
    if (!governed) continue;
    assert.ok(known.has(governed[1]!), `${e.target} is in the ledger and nowhere else`);
  }
});

test('A READ MARK IS A PLACE IN THE LEDGER, not a decoration on a row', () => {
  /* `20 §6` puts read marks on the *worth building* side of its table — *"who has seen the thing
     that binds them"* — and the mark is `member.seen_at`, which `30 §1` has carried since migration
     0001 and `45 §5.2` writes from an EVENT's own `ts`. The browser's `Person` held the matrix and
     the suspension and stopped one column short, so this screen said what four people MAY do and
     nothing about whether any of them had been. */
  const marked = PEOPLE_ACCESS.filter((p) => p.seen !== null);
  assert.ok(marked.length > 0, 'nobody has read anything, so nothing below is being tested');

  /* A MARK IS NEVER AHEAD OF THE LEDGER. It comes from an event's timestamp, so a mark later than
     the newest event is a mark for something that has not happened — and it is the one value
     `MAX()` can pin permanently, because no later read can move it. */
  const newest = AUDIT[0]?.at ?? '';
  for (const p of marked) assert.ok(p.seen! <= newest, `${p.name} has read past the end of the record`);

  /* AND NEVER BEFORE THEY ARRIVED. */
  for (const p of marked) assert.ok(p.since !== null, `${p.name} has read a record they have not joined`);

  /* THE TWO `null`s ARE DIFFERENT SENTENCES, and the screen draws them differently for that reason:
     an invitation still out has also never been looked at. The seed has to hold both or the branch
     that tells them apart is drawn by nothing. */
  assert.ok(
    PEOPLE_ACCESS.some((p) => p.since !== null && p.seen === null),
    'nobody has joined and not looked, so `has not opened it` is unreachable',
  );
  assert.ok(
    PEOPLE_ACCESS.some((p) => p.since === null && p.seen === null),
    'no invitation is still out, so the sentence that is NOT a read mark is unreachable',
  );
});

test('THE GATE ARRIVES RANKED, because two screens read it and one of them sorted', () => {
  /* `19 §4`: *"Ranked by the cost of being wrong, never by age."* `/decide` sorts by `rank`; home
     renders `boot().questions` in array order. That was invisible while the ranks happened to run
     1, 2, 3 down the file — and the moment a question was appended with rank 1 (the failed backup,
     which is whether the record still exists tomorrow), the surface a person LANDS on put it fourth
     of four. A list whose order is a fact about it should arrive ordered. */
  const ranks = QUESTIONS.map((q) => q.rank);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), 'the gate is not in rank order');

  /* AND WHAT `boot()` HANDS THE HOME SCREEN IS THE SAME LIST. This is the assertion that would have
     caught it: the ordering lives in the data, and the screen is not trusted to redo it. */
  const home = boot().questions;
  assert.deepEqual(home.map((q) => q.id), QUESTIONS.map((q) => q.id));
  assert.equal(home[0]?.rank, Math.min(...ranks), 'the costliest question is not first on the home screen');

  /* AND THE RANKS ARE DISTINCT. Two questions ranked equally is a tie the sort breaks by array
     order, which is the thing this test exists to stop mattering. */
  assert.equal(new Set(ranks).size, ranks.length, 'two questions share a rank');
});
