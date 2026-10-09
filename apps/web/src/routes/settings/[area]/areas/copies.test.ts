/**
 * `boot`'s `copies`, said as Settings says them (LCH-C03).
 *
 * THE SHAPE IS THE RECORD'S AND NOT WRITTEN HERE TWICE: `{ last_copy_at, last_copy_bytes, last_export_at }`, each
 * possibly `null`, as `packages/kernel/src/copies.ts` answers it. The cases are the ones a screen can meet: a copy in
 * last night, one past 26 hours, a record with no copy yet, a host older than the field, and a value of the wrong shape.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LATE_MS, ago, copiesOf, copyLine, exportLine } from './copies.ts';

const NOW = Date.parse('2026-10-09T12:00:00Z');
const back = (ms: number) => new Date(NOW - ms).toISOString();
const H = 3_600_000;

test("the record's facts are read as they come, and a host older than the field draws no line", () => {
  const facts = { last_copy_at: back(9 * H), last_copy_bytes: 2_100_000, last_export_at: null };
  assert.deepEqual(copiesOf({ copies: facts }), facts);
  assert.equal(copiesOf({ registers: [] }), null);
  assert.equal(copiesOf(null), null);
  assert.equal(copiesOf({ copies: null }), null);
});

test('a value of the wrong shape is that fact unknown, never a date of 1970', () => {
  assert.deepEqual(copiesOf({ copies: { last_copy_at: 'soon', last_copy_bytes: -4, last_export_at: 0 } }), {
    last_copy_at: null,
    last_copy_bytes: null,
    last_export_at: null,
  });
});

test('last night\'s copy reads its age and size, and is not late', () => {
  const line = copyLine({ last_copy_at: back(9 * H), last_copy_bytes: 2_100_000, last_export_at: null }, NOW);
  assert.deepEqual(line, { text: 'Last copy: 9 hours ago, 2.10 MB', late: false });
  assert.equal(copyLine({ last_copy_at: back(9 * H), last_copy_bytes: null, last_export_at: null }, NOW).text, 'Last copy: 9 hours ago');
});

test('past 26 hours the copy is late, and at 26 hours it is not yet', () => {
  assert.equal(copyLine({ last_copy_at: back(LATE_MS), last_copy_bytes: 10, last_export_at: null }, NOW).late, false);
  const late = copyLine({ last_copy_at: back(LATE_MS + 60_000), last_copy_bytes: 10, last_export_at: null }, NOW);
  assert.equal(late.late, true);
  assert.equal(late.text, 'Last copy: yesterday, 10 B');
});

test('a record with no copy yet reads "First copy tonight", never a fault', () => {
  assert.deepEqual(copyLine({ last_copy_at: null, last_copy_bytes: null, last_export_at: null }, NOW), { text: 'First copy tonight', late: false });
});

test('the export reads when it was taken, or that it never was', () => {
  assert.equal(exportLine({ last_copy_at: null, last_copy_bytes: null, last_export_at: back(3 * 24 * H) }, NOW), 'Last exported: 3 days ago');
  assert.equal(exportLine({ last_copy_at: back(H), last_copy_bytes: 1, last_export_at: null }, NOW), 'Never exported');
});

test('an age is said in the unit a person uses, one of each in the singular', () => {
  assert.equal(ago(back(20_000), NOW), 'just now');
  assert.equal(ago(back(60_000), NOW), '1 minute ago');
  assert.equal(ago(back(45 * 60_000), NOW), '45 minutes ago');
  assert.equal(ago(back(H), NOW), '1 hour ago');
  assert.equal(ago(back(30 * H), NOW), 'yesterday');
  assert.equal(ago(back(49 * H), NOW), '2 days ago');
  /* A CLOCK A LITTLE BEHIND THE HOST'S is "just now", never a negative age. */
  assert.equal(ago(new Date(NOW + 5_000).toISOString(), NOW), 'just now');
});

test('no line carries an em dash or an id', () => {
  const lines = [
    copyLine({ last_copy_at: back(9 * H), last_copy_bytes: 2_100_000, last_export_at: null }, NOW).text,
    copyLine({ last_copy_at: null, last_copy_bytes: null, last_export_at: null }, NOW).text,
    exportLine({ last_copy_at: null, last_copy_bytes: null, last_export_at: null }, NOW),
  ];
  for (const line of lines) assert.doesNotMatch(line, /\u2014|#\d|[0-9A-HJKMNP-TV-Z]{26}/, line);
});
