import assert from 'node:assert/strict';
import { test } from 'node:test';

import { matches, skipReason, subjectOf, type RawArrival } from '../src/arrival.ts';

const email: RawArrival = {
  id: 'r1',
  ts: '2026-08-29T10:00:00Z',
  channel: 'email',
  headers: { from: 'alerts@hsbc.com', to: 'me@x.com', subject: 'Debit alert' },
  body: 'Your account was debited EGP 1,250.00 on 29/08/26',
};

const hook: RawArrival = { id: 'r2', ts: '2026-08-29T10:00:00Z', channel: 'webhook', body: '{"a":1}' };

/* ── the subject ─────────────────────────────────────────────────────────── */

test('the subject is 34 §1.9’s seven fields and the sender read out of from, and nothing else', () => {
  assert.deepEqual(Object.keys(subjectOf(email)).sort(), ['body', 'channel', 'from', 'from_address', 'from_domain', 'state', 'subject', 'to', 'ts']);
});

test('state is untriaged, because this runs before the arrival is triaged', () => {
  assert.equal(subjectOf(email).state, 'untriaged');
});

test('a header that is not there is absent, not empty', () => {
  const s = subjectOf(hook);
  assert.equal(Object.hasOwn(s, 'subject'), false);
  assert.equal(Object.hasOwn(s, 'from'), false);
});

test('the sender is read out of from, beside it and never instead of it', () => {
  const s = subjectOf({ ...email, headers: { from: '"Sara Ali" <Sara@Bank.Example>' } });
  assert.equal(s.from, '"Sara Ali" <Sara@Bank.Example>');
  assert.equal(s.from_name, 'Sara Ali');
  assert.equal(s.from_address, 'sara@bank.example');
  assert.equal(s.from_domain, 'bank.example');
  assert.equal(matches({ match: { field: 'from_domain', is: 'bank.example' } }, { ...email, headers: { from: 'Sara Ali <sara@bank.example>' } }), true);
});

test('a bare address has no name, and an address alone said twice is no name either', () => {
  assert.equal(Object.hasOwn(subjectOf(email), 'from_name'), false);
  assert.equal(subjectOf(email).from_address, 'alerts@hsbc.com');
  assert.equal(Object.hasOwn(subjectOf({ ...email, headers: { from: 'ada@x.com <ada@x.com>' } }), 'from_name'), false);
});

test('the sender is read as the stored arrival reads it: encoded names, a list, a comma inside quotes', () => {
  assert.equal(subjectOf({ ...email, headers: { from: '=?UTF-8?B?U2FyYSBBbGk=?= <sara@bank.example>' } }).from_name, 'Sara Ali');
  const two = subjectOf({ ...email, headers: { from: 'Ada <ada@x.com>, Bo <bo@y.com>' } });
  assert.equal(two.from_address, 'ada@x.com');
  assert.equal(two.from_name, 'Ada');
  assert.equal(subjectOf({ ...email, headers: { from: '"Ali, Sara" <sara@bank.example>' } }).from_name, 'Ali, Sara');
  assert.equal(subjectOf({ ...email, headers: { from: 'root@localhost' } }).from_domain, 'localhost');
});

test('a from that names no one address leaves the sender absent, not empty', () => {
  for (const from of ['', 'Undisclosed', 'not an address <nope>']) {
    const s = subjectOf({ ...email, headers: { from } });
    assert.equal(s.from, from);
    for (const k of ['from_name', 'from_address', 'from_domain']) assert.equal(Object.hasOwn(s, k), false, `${from}: ${k}`);
  }
  for (const k of ['from_name', 'from_address', 'from_domain']) assert.equal(Object.hasOwn(subjectOf(hook), k), false);
});

test('the body is the one as stored, not the normalised one', () => {
  const messy: RawArrival = { ...email, body: 'debited\u00a0EGP  1,250\r\n' };
  assert.equal(subjectOf(messy).body, 'debited\u00a0EGP  1,250\r\n');
});

/* ── matches ─────────────────────────────────────────────────────────────── */

test('no match: is true', () => {
  assert.equal(matches({}, email), true);
});

test('a predicate over a header', () => {
  assert.equal(matches({ match: { field: 'from', is: 'alerts@hsbc.com' } }, email), true);
  assert.equal(matches({ match: { field: 'from', is: 'someone@else.com' } }, email), false);
});

test('contains over the body is case-insensitive, which is what makes it equal the SQL', () => {
  assert.equal(matches({ match: { field: 'body', contains: 'debited' } }, email), true);
  assert.equal(matches({ match: { field: 'body', contains: 'DEBITED' } }, email), true);
  /**
   * THE EQUALITY `§5.2` STEP 1 ASKS FOR, asserted rather than trusted to the comment. The record may ask
   * the same question as `instr(lower(body), lower(?))`, and the two answers have to agree or an arrival
   * matches in memory and not on disk.
   */
  const sql = (body: string, needle: string) => body.toLowerCase().includes(needle.toLowerCase());
  for (const needle of ['debited', 'DEBITED', 'EGP', 'egp 1,250', 'not here'])
    assert.equal(matches({ match: { field: 'body', contains: needle } }, email), sql(email.body, needle), needle);
});

test('a predicate over a header the arrival does not carry is false, not a throw', () => {
  assert.equal(matches({ match: { field: 'subject', contains: 'Debit' } }, hook), false);
});

test('the channel and the state are enums of the grammar', () => {
  assert.equal(matches({ match: { field: 'channel', is: 'email' } }, email), true);
  assert.equal(matches({ match: { field: 'channel', is: 'webhook' } }, email), false);
  assert.equal(matches({ match: { field: 'state', is: 'untriaged' } }, email), true);
});

test('a value outside an enum is false rather than a match on nothing', () => {
  assert.equal(matches({ match: { field: 'channel', is: 'fax' } }, email), false);
});

test('a field outside the seven is false', () => {
  assert.equal(matches({ match: { field: 'headers', is: 'x' } }, email), false);
  assert.equal(matches({ match: { field: 'id', is: 'r1' } }, email), false);
  assert.equal(matches({ match: { field: 'nope', is: 'x' } }, email), false);
});

test('groups work, so a real declaration reads as one', () => {
  const decl = {
    match: { all: [{ field: 'channel', is: 'email' }, { field: 'from', contains: 'hsbc' }, { field: 'body', contains: 'debited' }] },
  };
  assert.equal(matches(decl, email), true);
  assert.equal(matches(decl, { ...email, headers: { ...email.headers, from: 'alerts@cib.com' } }), false);
});

/* ── the skip list ───────────────────────────────────────────────────────── */

test('no skip: is no reason', () => {
  assert.equal(skipReason({}, email), undefined);
  assert.equal(skipReason({ skip: [] }, email), undefined);
});

test('the first true when wins, in declared order', () => {
  const decl = {
    skip: [
      { when: { field: 'body', contains: 'REFUND' }, reason: 'refund' },
      { when: { field: 'body', contains: 'debited' }, reason: 'debit' },
      { when: { field: 'channel', is: 'email' }, reason: 'email' },
    ],
  };
  assert.equal(skipReason(decl, email), 'debit');
  assert.equal(skipReason({ skip: [decl.skip[2]!, decl.skip[1]!] }, email), 'email');
});

test('a skip list where nothing is true is no reason', () => {
  assert.equal(skipReason({ skip: [{ when: { field: 'body', contains: 'REFUND' }, reason: 'refund' }] }, email), undefined);
});

test('skip and match are independent: an arrival can match and still be skipped', () => {
  const decl = {
    match: { field: 'channel', is: 'email' },
    skip: [{ when: { field: 'body', contains: 'debited' }, reason: 'debit' }],
  };
  assert.equal(matches(decl, email), true);
  assert.equal(skipReason(decl, email), 'debit');
});
