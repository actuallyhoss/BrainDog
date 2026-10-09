/**
 * Every state `/signin` can be in, reached without a host.
 *
 * THE SUBJECT IS THAT THEY ARE FOURTEEN. Each is something different to tell the reader, and the
 * only way that stays true is a test that reaches each one and says which it is.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Failure, Methods, Said } from './auth.ts';
import { SENT_LATE, googleStart, googleWhy, onwardOf, stateOf, type How, type Seen, type Shelf, type Step } from './signin.ts';

const WHO = { person: 'p_01', email: 'ada@example.com', record: 'studio', provedAt: 1 };
const NOW = 1_757_000_000_000;

const host = (m: Partial<Methods> = {}): Said<Methods> => ({
  ok: true,
  value: { passkey: true, magic: true, key: false, open: false, me: null, ...m },
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

/* THE SECOND LINE (LCH-A04): a minute after the send, and not a moment before, the sent screen says what fixes a letter
   that did not come. A send that carries no time never says it, so an older caller draws the one line it always drew. */
test('the sent screen adds its second line once a minute has passed, and not before', () => {
  const late = (now: number, when?: number) => {
    const s = stateOf(seen({ step: { at: 'sent', email: 'ada@example.com', ...(when === undefined ? {} : { when }) }, now }));
    return s.name === 'link-sent' ? s.late : null;
  };
  assert.equal(late(NOW, NOW), false);
  assert.equal(late(NOW + SENT_LATE - 1, NOW), false);
  assert.equal(late(NOW + SENT_LATE, NOW), true);
  assert.equal(late(NOW + 10 * SENT_LATE), false, 'no time, no second line');
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

/* MEASURED FIRST, BY THE AUDIT'S PROBE: with somebody signed in, a kept
   link and an idle step answered `{ name: 'signed-in' }` and nothing else, so the link had left the address bar and
   the screen had no way to say it arrived. The state carries it now, and Sign out lands on it. */
test('A LINK PASTED WHILE SOMEBODY IS IN IS CARRIED BY SIGNED IN, and signing out hands it to the landing', () => {
  const link = { kind: 'claim', token: 't' } as const;
  assert.deepEqual(stateOf(seen({ methods: host({ me: WHO }), link })), {
    name: 'signed-in',
    who: WHO,
    add: 'offer',
    lead: 'open',
    out: 'idle',
    link,
  });
  /* The same link kept through Sign out: `leave()` sets `me` to null and the step to `out`. */
  assert.deepEqual(stateOf(seen({ link, step: { at: 'out' } })), { name: 'link-landing', link, asking: false });
});

test('a press that could not reach the host is unreachable', () => {
  assert.equal(stateOf(seen({ step: failed('send', { kind: 'unreachable' }) })).name, 'unreachable');
});

test('SIGNED IN OFFERS A PASSKEY ON THIS DEVICE, and leads with it on first run', () => {
  const s = stateOf(seen({ methods: host({ me: WHO }) }));
  assert.deepEqual(s, { name: 'signed-in', who: WHO, add: 'offer', lead: 'open', out: 'idle', link: null });

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

/* ── where Open BrainDog goes ─────────────────────────────────────────── */

/** `sessionStorage` as far as `onwardOf` touches it, and what it holds. */
const shelf = (): Shelf & { held: Map<string, string> } => {
  const held = new Map<string, string>();
  return {
    held,
    getItem: (k) => held.get(k) ?? null,
    setItem: (k, v) => void held.set(k, v),
    removeItem: (k) => void held.delete(k),
  };
};

const ASKED = '?next=%2Fapp%2Facme%2Fr%2Ftasks';

/* MEASURED FIRST: pasting a link over
   `/app/signin?next=...` changes the query, which is a full navigation, so the page mounted again on
   `/app/signin#magic=...` and "Open BrainDog" read an empty search and went to `/app/`. */
test('A PASTED LINK KEEPS THE PAGE HE WAS SENT FROM, held in the tab across the navigation', () => {
  const s = shelf();
  assert.equal(onwardOf(ASKED, '', s), '/app/acme/r/tasks');
  assert.equal(onwardOf('', '#magic=t', s), '/app/acme/r/tasks');
  assert.equal(onwardOf('', '#claim=t', s), '/app/acme/r/tasks');
});

test('A PLAIN VISIT TO SIGN-IN FORGETS IT, because nothing sent him and nothing arrived', () => {
  const s = shelf();
  onwardOf(ASKED, '', s);
  assert.equal(onwardOf('', '', s), '/app/');
  assert.equal(s.held.size, 0);
  assert.equal(onwardOf('', '#magic=t', s), '/app/', 'a link after a plain visit went to an older page');
});

test('A NEXT THAT COULD LEAVE THE APP IS NEVER KEPT, and a newer one replaces the older', () => {
  const s = shelf();
  onwardOf(ASKED, '', s);
  for (const bad of ['?next=%2F%2Fevil.example', '?next=https%3A%2F%2Fevil.example%2Fapp%2F', '?next=%2Fapp%5C..%5Cevil', '?next=%2Fr%2Ftasks']) {
    assert.equal(onwardOf(bad, '', s), '/app/', bad);
    assert.equal(onwardOf('', '#magic=t', s), '/app/', `${bad} left the older next to follow`);
  }
  onwardOf(ASKED, '', s);
  assert.equal(onwardOf('?next=%2Fapp%2Fshop', '', s), '/app/shop');
  assert.equal(onwardOf('', '#magic=t', s), '/app/shop');
});

test('WHAT THE TAB HOLDS IS READ AS UNTRUSTED as the address is', () => {
  const s = shelf();
  onwardOf(ASKED, '', s);
  const [key] = [...s.held.keys()];
  assert.ok(key, 'nothing was kept');
  for (const planted of ['//evil.example', 'https://evil.example/app/', '/app/\\evil.example', 'javascript:alert(1)']) {
    s.held.set(key, planted);
    assert.equal(onwardOf('', '#magic=t', s), '/app/', planted);
  }
});

test('NO STORAGE, OR STORAGE THAT THROWS, IS THE ADDRESS ALONE, and never an exception', () => {
  const refuses: Shelf = {
    getItem: () => { throw new Error('SecurityError'); },
    setItem: () => { throw new Error('QuotaExceededError'); },
    removeItem: () => { throw new Error('SecurityError'); },
  };
  for (const s of [null, refuses]) {
    assert.equal(onwardOf(ASKED, '', s), '/app/acme/r/tasks');
    assert.equal(onwardOf('', '#magic=t', s), '/app/');
    assert.equal(onwardOf('', '', s), '/app/');
  }
});

/* MEASURED FIRST (by a probe that was never kept in the tree): `onward()`
   checked the spelling of the path, so a dot segment, plain or percent-encoded, passed as `/app/...` and the drawn
   href resolved on this origin outside the app, `/auth/signout`, `/api/export`, `/in/x` and `/`. The mail's
   `safeNext` resolved the same values and dropped every one. */
test('A NEXT THAT RESOLVES OUTSIDE THE APP IS THE FRONT DOOR, however its dot segments are spelled', () => {
  const s = shelf();
  for (const bad of ['/app/../auth/session', '/app/%2e%2e/api/export', '/app/../auth/signout', '/app/%2e%2e/auth/signout', '/app/%2E%2E/api/export', '/app/.%2e/in/x', '/app/..', '/app/../']) {
    const search = `?${new URLSearchParams({ next: bad })}`;
    assert.equal(onwardOf(search, '', s), '/app/', bad);
    assert.equal(s.held.size, 0, `${bad} was kept for the tab`);
    assert.equal(onwardOf('', '#magic=t', s), '/app/', `${bad} was followed from the tab`);
  }
  /* The same planted in the tab's storage, which is read as untrusted as the address is. */
  onwardOf(ASKED, '', s);
  const [key] = [...s.held.keys()];
  assert.ok(key, 'nothing was kept');
  s.held.set(key, '/app/%2e%2e/api/export');
  assert.equal(onwardOf('', '#magic=t', s), '/app/');
});

test('A NEXT THAT RESOLVES INSIDE THE APP IS FOLLOWED AS IT RESOLVES, not as it was typed', () => {
  const s = shelf();
  assert.equal(onwardOf(`?${new URLSearchParams({ next: '/app/acme/../shop/./r/tasks?f=a#top' })}`, '', s), '/app/shop/r/tasks?f=a#top');
  /* What the tab keeps is the resolved address, so the two halves cannot disagree about it later. */
  assert.deepEqual([...s.held.values()], ['/app/shop/r/tasks?f=a#top']);
  assert.equal(onwardOf('', '#magic=t', s), '/app/shop/r/tasks?f=a#top');
});

/* ── Google ──────────────────────────────────────────────────────────────── */

test('GOOGLE IS A WAY ONLY WHERE THE HOST SAYS SO, and never the lead', () => {
  const without = stateOf(seen({ methods: host() }));
  assert.equal(without.name === 'signed-out' && without.ways?.google, undefined);
  const s = stateOf(seen({ methods: host({ google: true }) }));
  assert.equal(s.name === 'signed-out' && s.ways?.google, true);
  assert.notEqual(s.name === 'signed-out' && s.ways?.lead, 'google');
});

test('THE WAY BACK FROM GOOGLE SAYS WHY IN FIVE WORDS, and anything else says nothing', () => {
  assert.equal(googleWhy('?google=unknown'), 'unknown');
  assert.equal(googleWhy('?next=%2Fapp%2Fwork&google=cancelled'), 'cancelled');
  assert.equal(googleWhy('?google=%3Cscript%3E'), null);
  assert.equal(googleWhy(''), null);
});

test('THE GOOGLE BUTTON GOES TO THE HOST, carrying where to land only when that is not the front', () => {
  assert.equal(googleStart('/app/', 'https://brain.dog'), 'https://brain.dog/auth/google/start');
  assert.equal(googleStart('/app/work', 'https://brain.dog'), 'https://brain.dog/auth/google/start?next=%2Fapp%2Fwork');
});
