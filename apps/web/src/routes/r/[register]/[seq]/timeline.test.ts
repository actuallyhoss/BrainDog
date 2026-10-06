/**
 * A row's history and its comments are one timeline, newest first.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { momentsOf } from './timeline.ts';

const event = (at: string, note: string) => ({ by: 'system', note, at });
const comment = (at: string, body: string) => ({
  comment: { id: body, by: 'p_1', at, body, reply_to: null, resolved: null },
  replies: [],
});

test('THE CHANGES AND THE COMMENTS INTERLEAVE BY WHEN THEY HAPPENED, newest first', () => {
  const history = [event('2026-09-03T12:00:00.000Z', 'paid'), event('2026-09-01T09:00:00.000Z', 'created')];
  const threads = [comment('2026-09-02T10:00:00.000Z', 'chased'), comment('2026-09-04T08:00:00.000Z', 'thanks')];
  const out = momentsOf(history, threads).map((m) => (m.kind === 'event' ? m.event.note : m.thread.comment.body));
  assert.deepEqual(out, ['thanks', 'paid', 'chased', 'created']);
});

test('ON A TIE THE CHANGE GOES FIRST, and a time that does not read keeps its place', () => {
  const same = '2026-09-03T12:00:00.000Z';
  const out = momentsOf([event(same, 'edited'), event('soon', 'odd')], [comment(same, 'why?')]).map((m) => m.kind);
  assert.deepEqual(out, ['event', 'event', 'comment']);
});

test('EITHER SIDE ALONE IS ITSELF', () => {
  assert.deepEqual(momentsOf([], []), []);
  assert.equal(momentsOf([event('2026-09-01T00:00:00.000Z', 'created')], []).length, 1);
  const two = momentsOf([], [comment('2026-09-01T00:00:00.000Z', 'a'), comment('2026-09-02T00:00:00.000Z', 'b')]);
  assert.deepEqual(two.map((m) => (m.kind === 'comment' ? m.thread.comment.body : '')), ['b', 'a']);
});

test('A COMMENT OUT OF ORDER IS PUT IN ITS PLACE, so a day is never split in two', () => {
  /* `threadsOf` puts a reply whose comment has gone at the end of the threads, whenever it was written. */
  const threads = [comment('2026-09-01T10:00:00.000Z', 'first'), comment('2026-09-04T10:00:00.000Z', 'late'), comment('2026-09-02T10:00:00.000Z', 'orphan')];
  const out = momentsOf([event('2026-09-03T12:00:00.000Z', 'paid')], threads).map((m) => (m.kind === 'event' ? m.event.note : m.thread.comment.body));
  assert.deepEqual(out, ['late', 'paid', 'orphan', 'first']);
});
