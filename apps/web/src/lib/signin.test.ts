/**
 * Every state `/signin` can be in, reached without a host.
 *
 * THE SUBJECT IS THAT THEY ARE FOURTEEN. Each is something different to tell the reader, and the
 * only way that stays true is a test that reaches each one and says which it is.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Failure, Methods, Said } from './auth.ts';
import { stateOf, type How, type Seen, type Step } from './signin.ts';

const WHO = { person: 'p_01', email: 'ada@example.com', record: 'studio', provedAt: 1 };
const NOW = 1_757_000_000_000;

const host = (m: Partial<Methods> = {}): Said<Methods> => ({
  ok: true,
  value: { passkey: true, magic: true, key: false, open: false, demo: false, me: null, ...m },
});

const seen = (over: Partial<Seen> = {}): Seen => ({
  methods: host(),
  entered: null,
  link: null,
  step: { at: 'idle' },
  secure: true,
  webauthn: true,
  now: NOW,
  ...over,
});

const failed = (how: How, failure: Failure, when = NOW): Step => ({ at: 'failed', how, failure, when });

test('loading, until the host has said how it lets people in', () => {
  assert.deepEqual(stateOf(seen({ methods: null })), { name: 'loading' });
});

test('no-host and unreachable are two different silences', () => {
  assert.equal(stateOf(seen({ methods: { ok: false, kind: 'no-host' } })).name, 'no-host');
  assert.equal(stateOf(seen({ methods: { ok: false, kind: 'absent' } })).name, 'no-host');
  assert.equal(stateOf(seen({ methods: { ok: false, kind: 'unreachable' } })).name, 'unreachable');
  assert.equal(stateOf(seen({ methods: { ok: false, kind: 'closed' } })).name, 'unreachable');
});

test('open, when the host lets anyone in without a session', () => {
  assert.deepEqual(stateOf(seen({ methods: host({ open: true }) })), { name: 'open' });
});

test('not-configured, when the host offers no way in and says why', () => {
  const none = { passkey: false, magic: false, key: false };
  assert.deepEqual(stateOf(seen({ methods: host({ ...none, why: 'not-configured' }) })), { name: 'not-configured' });
  assert.deepEqual(stateOf(seen({ methods: host(none) })), { name: 'not-configured' });
});

test('insecure, because off a secure context no way in can finish, whichever side notices', () => {
  assert.deepEqual(stateOf(seen({ secure: false })), { name: 'insecure' });
  const none = { passkey: false, magic: false, key: false };
  assert.deepEqual(stateOf(seen({ methods: host({ ...none, why: 'insecure' }) })), { name: 'insecure' });
});

test('SIGNED OUT LEADS WITH A PASSKEY, and only draws the ways that can act here', () => {
  const s = stateOf(seen());
  assert.equal(s.name, 'signed-out');
  if (s.name !== 'signed-out') return;
  assert.deepEqual(s.ways, { passkey: true, magic: true, key: false, lead: 'passkey', keyOpen: false });
  assert.equal(s.note, null);

  /* No WebAuthn: the passkey is not there at all, and the link leads. */
  const w = stateOf(seen({ webauthn: false }));
  assert.ok(w.name === 'signed-out' && w.ways?.passkey === false && w.ways.lead === 'magic');
});

test('ON FIRST RUN THE SERVER KEY LEADS AND ITS BLOCK IS OPEN, because no passkey exists to sign in with', () => {
  const s = stateOf(seen({ methods: host({ key: true, magic: false, firstRun: true }) }));
  assert.ok(s.name === 'signed-out');
  assert.deepEqual(s.ways, { passkey: false, magic: false, key: true, lead: 'key', keyOpen: true });

  /* Later, with a passkey somewhere, the key is a quiet second way and starts closed. */
  const later = stateOf(seen({ methods: host({ key: true, magic: false }) }));
  assert.ok(later.name === 'signed-out');
  assert.deepEqual(later.ways, { passkey: true, magic: false, key: true, lead: 'passkey', keyOpen: false });
});

test('a host that offers only passkeys to a browser without WebAuthn says so, rather than nothing', () => {
  const s = stateOf(seen({ webauthn: false, methods: host({ magic: false }) }));
  assert.ok(s.name === 'signed-out' && s.ways?.lead === null && s.note === 'unsupported');
});

test('asking, while a press is out', () => {
  assert.deepEqual(stateOf(seen({ step: { at: 'asking', how: 'passkey' } })), {
    name: 'asking',
    ways: { passkey: true, magic: true, key: false, lead: 'passkey', keyOpen: false },
    how: 'passkey',
  });
});

test('A CANCELLED SHEET IS A CALM NOTE ON THE SIGNED-OUT SCREEN, not a rejection', () => {
  const s = stateOf(seen({ step: failed('passkey', { kind: 'cancelled' }) }));
  assert.ok(s.name === 'signed-out' && s.note === 'cancelled');
});

test('rejected carries the host sentence, and a host that failed closed says so', () => {
  const r = stateOf(seen({ step: failed('key', { kind: 'refused', fix: 'That did not sign you in.' }) }));
  assert.ok(r.name === 'rejected' && r.fix === 'That did not sign you in.' && !r.closed);
  const c = stateOf(seen({ step: failed('passkey', { kind: 'closed' }) }));
  assert.ok(c.name === 'rejected' && c.closed && c.fix === null);
});

test('LOCKED COUNTS DOWN IN WHOLE MINUTES, and gives the screen back when the time is up', () => {
  const lock = failed('passkey', { kind: 'locked', retryAfter: 840 }, NOW);
  const s = stateOf(seen({ step: lock }));
  assert.ok(s.name === 'locked' && s.minutes === 14 && s.how === 'passkey');
  assert.ok((() => { const t = stateOf(seen({ step: lock, now: NOW + 810_000 })); return t.name === 'locked' && t.minutes === 1; })());
  assert.equal(stateOf(seen({ step: lock, now: NOW + 840_000 })).name, 'signed-out');
});

test('link-sent names the address it was asked for', () => {
  assert.ok((() => { const s = stateOf(seen({ step: { at: 'sent', email: 'ada@example.com' } })); return s.name === 'link-sent' && s.email === 'ada@example.com'; })());
});

test('A LINK IN THE ADDRESS WAITS FOR A PRESS, and a spent one is link-expired', () => {
  const link = { kind: 'magic', token: 't' } as const;
  assert.deepEqual(stateOf(seen({ link })), { name: 'link-landing', link, asking: false });
  assert.deepEqual(stateOf(seen({ link, step: { at: 'asking', how: 'link' } })), { name: 'link-landing', link, asking: true });
  const spent = stateOf(seen({ link: { kind: 'claim', token: 't' }, step: failed('link', { kind: 'refused', fix: null }) }));
  assert.ok(spent.name === 'link-expired' && spent.link === 'claim');
  /* A link works even where the host offers no other way in. */
  assert.equal(stateOf(seen({ link, methods: host({ passkey: false, magic: false }) })).name, 'link-landing');
});

test('a press that could not reach the host is unreachable', () => {
  assert.equal(stateOf(seen({ step: failed('send', { kind: 'unreachable' }) })).name, 'unreachable');
});

test('SIGNED IN OFFERS A PASSKEY ON THIS DEVICE, and leads with it on first run', () => {
  const s = stateOf(seen({ methods: host({ me: WHO }) }));
  assert.deepEqual(s, { name: 'signed-in', who: WHO, add: 'offer', lead: 'open', out: 'idle' });

  const first = stateOf(seen({ methods: host({ key: true, firstRun: true }), entered: { who: WHO, via: 'key' } }));
  assert.ok(first.name === 'signed-in' && first.add === 'offer' && first.lead === 'add');

  const added = stateOf(seen({ methods: host({ key: true, firstRun: true }), entered: { who: WHO, via: 'key' }, step: { at: 'added' } }));
  assert.ok(added.name === 'signed-in' && added.add === 'added' && added.lead === 'open');
});

test('adding is absent where it cannot act: no passkeys on the host, no WebAuthn, or one just used here', () => {
  for (const s of [
    seen({ methods: host({ me: WHO, passkey: false }) }),
    seen({ methods: host({ me: WHO }), webauthn: false }),
    seen({ entered: { who: WHO, via: 'passkey' } }),
  ]) {
    const out = stateOf(s);
    assert.ok(out.name === 'signed-in' && out.add === 'absent', JSON.stringify(s));
  }
});

test('what became of adding one, and of signing out', () => {
  const at = (step: Step) => stateOf(seen({ methods: host({ me: WHO }), step }));
  const pick = (step: Step) => { const s = at(step); return s.name === 'signed-in' ? [s.add, s.out] : s.name; };
  assert.deepEqual(pick({ at: 'asking', how: 'add' }), ['asking', 'idle']);
  assert.deepEqual(pick(failed('add', { kind: 'cancelled' })), ['cancelled', 'idle']);
  assert.deepEqual(pick(failed('add', { kind: 'exists' })), ['exists', 'idle']);
  assert.deepEqual(pick(failed('add', { kind: 'refused', fix: null })), ['failed', 'idle']);
  assert.deepEqual(pick({ at: 'asking', how: 'out' }), ['offer', 'asking']);
  assert.deepEqual(pick(failed('out', { kind: 'unreachable' })), ['offer', 'failed']);
});

test('after signing out the screen says so, calmly', () => {
  const s = stateOf(seen({ step: { at: 'out' } }));
  assert.ok(s.name === 'signed-out' && s.note === 'out');
});
