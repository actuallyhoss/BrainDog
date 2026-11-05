/**
 * A row's history and its comments are one timeline, newest first.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { momentsOf, noteSaid } from './timeline.ts';

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

test('THE FIRST LINE SAYS WHO ADDED THE ROW, "added this", and any other note is the record\'s own', () => {
  assert.equal(noteSaid('created'), 'added this');
  assert.equal(noteSaid('state from open to paid'), 'state from open to paid');
});

/* "An agent Imported again from Kiln Notes." The verb
   follows the name in lower case; any other note is what the writer noted. */
test('A NOTE THAT OPENS ON ITS VERB READS ON FROM THE NAME, and any other is said as noted', () => {
  assert.equal(noteSaid('Imported again from Kiln Notes.'), 'imported this from Kiln Notes');
  assert.equal(noteSaid('Imported again from Mara Brain'), 'imported this from your old notes');
  assert.equal(noteSaid('Partner on Marrow. Runs a paper in Osaka.'), 'noted: Partner on Marrow. Runs a paper in Osaka.');
  assert.equal(noteSaid('Imported from Kiln Notes.'), 'imported this from Kiln Notes');
  assert.equal(noteSaid('Halden sent this.'), 'noted: Halden sent this.');
  assert.equal(noteSaid('Based in Osaka.'), 'noted: Based in Osaka.');
  assert.equal(noteSaid('Lifted by the morning run.'), 'noted: Lifted by the morning run.');
  assert.equal(noteSaid('Moved the call to Friday.'), 'moved the call to Friday.');
});

test('A CHANGE TO ONE FIELD WITH NO NOTE PUTS ITS VERB FIRST, so it reads on from who made it (Q38)', () => {
  const edit = { field: 'state', from: 'open' };
  assert.equal(noteSaid('state from open to paid', edit), 'changed state from open to paid');
  assert.equal(noteSaid('email set to ada@pellvine.example', { field: 'email', from: null }), 'set email to ada@pellvine.example');
  assert.equal(noteSaid('email cleared', { field: 'email', from: 'a@b.example' }), 'cleared email');
  assert.equal(noteSaid('amount changed', { field: 'amount', from: '--redacted--' }), 'changed amount');
  assert.equal(noteSaid('added this to Tidewell', { field: 'projects', from: [] }), 'added this to Tidewell');
});

test("A ROW A MEET MADE SAYS WHERE IT CAME FROM: a bank text, or a mail's sender, the person or the organisation", async () => {
  const { lineWhole } = await import('./timeline.ts');
  assert.equal(lineWhole('rule:meet-payees', 'created'), 'Filed from a bank text');
  assert.equal(lineWhole('rule:meet-senders', 'created'), 'Added from a mail');
  assert.equal(lineWhole('rule:meet-sender-firms', 'created'), 'Added from a mail');
  assert.equal(lineWhole('rule:meet-senderless', 'created'), null);
  assert.equal(lineWhole('rule:meet-senders', 'changed'), null);
});
