/**
 * Sign-in hardened before strangers arrive: the challenge lockout, the mailbox count, the ninety-day proof, the fresh
 * proof for passkeys, the session list, signing out everywhere, and an invited address proving its mailbox.
 *
 * AGAINST A FIXED CLOCK, AT THE EDGES, as `identity.test.ts` is: each window is tried the millisecond before it
 * closes and the millisecond it does, because an off-by-one there is a session, a link or a proof that outlives
 * its rule.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { AuthResult } from '@braindog/ports';

import { createDirectory, type AuthConfig, type Directory, type Reason } from '../src/directory.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { asJSON, register, testKeys, type TestKey } from './fixtures/webauthn/authenticator.ts';

const NOW = Date.UTC(2026, 8, 25, 9);
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const ORIGIN = 'https://studio.example';
const RP_ID = 'studio.example';
const serverKey = 'a-throwaway-server-key-for-these-tests-only';
const KEYS = testKeys()!;
const NOT_YOU = { code: 'UNAUTHORIZED', fix: 'That did not sign you in.' };
const STALE = { code: 'NEEDS_BROWSER_SESSION', fix: 'Sign in again to change your passkeys. It has been more than fifteen minutes since you last did.', at: 'proof' };

/** A fresh address per request, unless a test is about one address, so no test measures a lockout it did not mean to. */
let seq = 0;
const nextIp = () => `192.0.2.${(++seq % 250) + 1}`;

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

type Line = { flow: string; reason: Reason };

function setup(change: (c: AuthConfig) => AuthConfig = (c) => c) {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const lines: Line[] = [];
  const d = createDirectory(
    sql,
    clock,
    change({ mac: new Uint8Array(32).fill(9), rp: { id: RP_ID, origin: ORIGIN }, magic: true, key: { serverKey }, log: (line) => void lines.push(line) }),
    { sells: false },
  );
  const ada = value<{ id: string }>(d.person$('ada@example.com', 'Ada')).id;
  const record = value<{ record: string }>(d.provision({ slug: 'the-studio', email: 'ada@example.com' })).record;
  return { sql, clock, d, lines, ada, record };
}

function ok<B>(r: AuthResult<B>) {
  if (r.status !== 200) assert.fail(`expected 200, got ${r.status}${'refusal' in r ? ` ${r.refusal.code}` : ''}`);
  return r;
}

function sidOf(r: AuthResult<unknown>): string {
  const s = ok(r).session;
  if (!s || s === 'clear') return assert.fail('no session was set');
  return s.sid;
}

function notYou(r: AuthResult<unknown>, cleared = false): void {
  assert.equal(r.status, 401, `expected 401, got ${r.status}`);
  assert.deepEqual('refusal' in r ? r.refusal : null, NOT_YOU);
  if (cleared) assert.equal(r.session, 'clear', 'the cookie was not cleared');
}

const keyIn = (d: Directory, sid?: string) =>
  d.auth({ flow: 'key.exchange', serverKey, ip: nextIp(), ...(sid === undefined ? {} : { sid }) });

function linkOf(r: AuthResult<unknown>): string {
  const mail = ok(r).mail;
  if (!mail || !('linkToken' in mail)) return assert.fail('no sign-in link was handed over');
  return mail.linkToken;
}

/** Signed in by a link, the way in every person on the Cloud has. */
async function linkIn(d: Directory, email: string): Promise<string> {
  const linkToken = linkOf(await d.auth({ flow: 'magic.start', email, ip: nextIp() }));
  return sidOf(await d.auth({ flow: 'magic.redeem', linkToken, ip: nextIp() }));
}

async function addPasskey(d: Directory, sid: string, key: TestKey) {
  const options = ok(await d.auth({ flow: 'passkey.register.options', sid })).body;
  const made = await register(key, { rpId: RP_ID, origin: ORIGIN, challenge: options.challenge });
  return d.auth({ flow: 'passkey.register', sid, credential: asJSON.registration(made) });
}

const prove = (d: Directory, email: string, name?: string) =>
  d.auth({ flow: 'invite.prove', email, invite: 'rec_01J0000000000000000000000.an-invitation', ...(name === undefined ? {} : { name }) });

function proofOf(r: AuthResult<unknown>): string {
  const mail = ok(r).mail;
  if (!mail || !('kind' in mail) || mail.kind !== 'invite.prove') return assert.fail('no proof was handed over');
  return mail.link;
}

const live = (d: Directory, sid: string) => d.auth({ flow: 'session', sid });

/* ── the challenge lockout ────────────────────────────────────────────── */

test('A PASSKEY CHALLENGE IS THIRTY A MINUTE FROM ONE ADDRESS, and one address no longer fills the table', async () => {
  const { sql, clock, d, lines } = setup();
  const ip = '198.51.100.40';
  for (let i = 0; i < 30; i++) ok(await d.auth({ flow: 'passkey.assert.options', ip }));
  assert.deepEqual({ ...(await d.auth({ flow: 'passkey.assert.options', ip })) }, { status: 429, retryAfter: 60 });
  assert.equal(lines.at(-1)?.reason, 'locked');
  assert.equal(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM dir_challenge')?.n, 30, 'a refused ask still stored a challenge');

  /* Another address is not held up by this one, and the lock lifts when its minute is up. */
  ok(await d.auth({ flow: 'passkey.assert.options', ip: '198.51.100.41' }));
  clock.set(NOW + MINUTE - 1);
  assert.equal((await d.auth({ flow: 'passkey.assert.options', ip })).status, 429);
  clock.set(NOW + MINUTE);
  ok(await d.auth({ flow: 'passkey.assert.options', ip }));
});

test('BOTH CEREMONIES ASK FOR USER VERIFICATION', async () => {
  const { d } = setup();
  const sid = sidOf(await keyIn(d));
  assert.equal(ok(await d.auth({ flow: 'passkey.register.options', sid })).body.authenticatorSelection.userVerification, 'required');
  assert.equal(ok(await d.auth({ flow: 'passkey.assert.options', ip: nextIp() })).body.userVerification, 'required');
});

/* ── the mailbox count ────────────────────────────────────────────────── */

test('THE MAILBOX COUNT IS OF MAILS SENT: a full one sends nothing, a link already sent still works, and spending it clears the count', async () => {
  const { sql, d } = setup();
  const count = (address: string) => sql.all('SELECT 1 FROM dir_fail WHERE key = ?', `email:${address}`).length;

  const sent: string[] = [];
  for (let i = 0; i < 10; i++) sent.push(linkOf(await d.auth({ flow: 'magic.start', email: 'ada@example.com', ip: nextIp() })));
  /* The eleventh is the 200 an unknown address gets, so the count says nothing about who is here. */
  assert.deepEqual({ ...(await d.auth({ flow: 'magic.start', email: 'ada@example.com', ip: nextIp() })) }, { status: 200, body: {} });
  assert.equal(sql.all('SELECT 1 FROM dir_link').length, 10, 'a full count still wrote a link');

  ok(await d.auth({ flow: 'magic.redeem', linkToken: sent[3]!, ip: nextIp() }));
  assert.equal(count('ada@example.com'), 0, 'spending a link left the count behind');
  assert.ok(ok(await d.auth({ flow: 'magic.start', email: ' ADA@example.com', ip: nextIp() })).mail, 'the count did not clear for the address as typed');

  /* AN ADDRESS NOBODY HAS IS NEVER COUNTED, so typing somebody's address a dozen times sends them nothing and costs
     them nothing when they ask for a link themselves. */
  for (let i = 0; i < 12; i++) await d.auth({ flow: 'magic.start', email: 'nobody@example.com', ip: nextIp() });
  assert.equal(count('nobody@example.com'), 0);
});

/* ── the proof that caps a rotating session ─────────────────────────────────────────────── */

test('A SESSION ENDS 180 DAYS AFTER ITS LAST PROOF, however often it has rotated, though each day of use renews its ninety', async () => {
  const { sql, clock, d } = setup();
  let sid = sidOf(await keyIn(d));
  const turn = async (at: number) => {
    clock.set(at);
    const next = ok(await live(d, sid)).session;
    if (!next || next === 'clear') return assert.fail(`no rotation at day ${(at - NOW) / DAY}`);
    sid = next.sid;
  };
  for (const day of [89, 150, 178]) await turn(NOW + day * DAY);
  /* The last rotation did not reach past the proof: ninety days from it would be day 268. */
  assert.equal(sql.one<{ expires: number }>('SELECT expires FROM dir_session')?.expires, NOW + 180 * DAY);

  await turn(NOW + 180 * DAY - 1);
  assert.equal(ok(await live(d, sid)).body.provedAt, NOW, 'rotation moved the proof');
  clock.set(NOW + 180 * DAY);
  notYou(await live(d, sid), true);
  assert.equal(sql.all('SELECT 1 FROM dir_session').length, 0, 'the row outlived its proof');
});

test('A NEW PROOF STARTS THE NINETY DAYS AGAIN', async () => {
  const { clock, d } = setup();
  const first = sidOf(await keyIn(d));
  clock.set(NOW + 80 * DAY);
  const again = sidOf(await keyIn(d, first));
  clock.set(NOW + 100 * DAY);
  assert.equal(ok(await live(d, again)).body.provedAt, NOW + 80 * DAY);
});

/* ── a fresh proof for passkeys ───────────────────────────────────────── */

test('ADDING OR REMOVING A PASSKEY NEEDS A PROOF IN THE LAST FIFTEEN MINUTES, and asks for it without signing anybody out', async () => {
  const { clock, d, lines } = setup();
  const sid = sidOf(await keyIn(d));
  ok(await addPasskey(d, sid, KEYS.es256));

  clock.set(NOW + 15 * MINUTE);
  ok(await d.auth({ flow: 'passkey.register.options', sid }));

  clock.set(NOW + 15 * MINUTE + 1);
  for (const r of [
    await d.auth({ flow: 'passkey.register.options', sid }),
    await d.auth({ flow: 'passkey.register', sid, credential: { id: 'AAAA', response: { clientDataJSON: '', attestationObject: '' } } }),
    await d.auth({ flow: 'passkey.remove', sid, id: KEYS.es256.id }),
  ]) {
    assert.equal(r.status, 401);
    assert.equal('reason' in r && r.reason, 'stale');
    assert.deepEqual('refusal' in r && r.refusal, STALE);
    assert.equal(r.session, undefined, 'a stale session had its cookie cleared');
  }
  assert.deepEqual(lines.slice(-3).map((l) => l.reason), ['stale', 'stale', 'stale']);
  assert.equal(ok(await d.auth({ flow: 'passkeys', sid })).body.length, 1, 'a stale removal removed the passkey');
  ok(await live(d, sid));

  /* Signing in again is the whole fix. */
  const fresh = sidOf(await keyIn(d, sid));
  ok(await d.auth({ flow: 'passkey.remove', sid: fresh, id: KEYS.es256.id }));
});

test('A PASSKEY ADDED OR REMOVED IS MAILED TO ITS PERSON, and removing one ends every other session they have', async () => {
  const { d } = setup();
  value(d.person$('bo@example.com', 'Bo'));
  const here = await linkIn(d, 'ada@example.com');
  const there = await linkIn(d, 'ada@example.com');
  const bo = await linkIn(d, 'bo@example.com');

  assert.deepEqual(ok(await addPasskey(d, here, KEYS.es256)).mail, { kind: 'passkey.added', to: 'ada@example.com' });
  const removed = ok(await d.auth({ flow: 'passkey.remove', sid: here, id: KEYS.es256.id }));
  assert.deepEqual(removed.mail, { kind: 'passkey.removed', to: 'ada@example.com' });
  ok(await live(d, here));
  notYou(await live(d, there), true);
  ok(await live(d, bo));

  /* A removal that finds no passkey ends nothing. */
  const later = await linkIn(d, 'ada@example.com');
  assert.equal((await d.auth({ flow: 'passkey.remove', sid: here, id: KEYS.rs256.id })).status, 422);
  ok(await live(d, later));
});

/* ── the session list, and signing out everywhere ─────────────────────── */

test('SESSIONS LISTS THIS PERSON’S LIVE SESSIONS, newest first, this one marked, and nothing that opens one', async () => {
  const { sql, clock, d, record } = setup();
  value(d.person$('bo@example.com', 'Bo'));
  const first = await linkIn(d, 'ada@example.com');
  clock.advance(MINUTE);
  const second = await linkIn(d, 'ada@example.com');
  await linkIn(d, 'bo@example.com');

  const listed = ok(await d.auth({ flow: 'sessions', sid: first })).body.sessions;
  assert.deepEqual(
    listed.map((s) => [s.current, s.authedAt, s.activeAt, s.record]),
    [
      [false, NOW + MINUTE, NOW + MINUTE, record],
      [true, NOW, NOW, record],
    ],
  );
  const hashes = sql.all<{ id_hash: string }>('SELECT id_hash FROM dir_session').map((r) => r.id_hash);
  for (const s of listed) {
    assert.match(s.ref, /^[0-9a-f]{12}$/);
    assert.ok(hashes.some((h) => h.startsWith(s.ref)), 'a ref names no session');
  }
  const said = JSON.stringify(listed);
  for (const secret of [...hashes, first, second]) assert.ok(!said.includes(secret), 'the list carried a whole MAC or a session id');

  notYou(await d.auth({ flow: 'sessions', sid: 'C'.repeat(43) }), true);
});

test('SIGNING OUT EVERYWHERE ELSE KEEPS THIS BROWSER, and everywhere means this one too', async () => {
  const { d } = setup();
  const here = await linkIn(d, 'ada@example.com');
  const phone = await linkIn(d, 'ada@example.com');
  const laptop = await linkIn(d, 'ada@example.com');

  const others = ok(await d.auth({ flow: 'logout.all', sid: here, keep: 'this' }));
  assert.deepEqual(others.body, { ended: 2 });
  assert.equal(others.session, undefined);
  ok(await live(d, here));
  notYou(await live(d, phone), true);
  notYou(await live(d, laptop), true);

  const tablet = await linkIn(d, 'ada@example.com');
  const all = ok(await d.auth({ flow: 'logout.all', sid: here, keep: 'none' }));
  assert.deepEqual(all.body, { ended: 2 });
  assert.equal(all.session, 'clear');
  notYou(await live(d, here), true);
  notYou(await live(d, tablet), true);
  notYou(await d.auth({ flow: 'logout.all', sid: here, keep: 'this' }), true);
});

/* ── an invited address proves its mailbox ────────────────────────────── */

test('AN INVITED ADDRESS PROVES ITS MAILBOX: a proof mailed, stored only as a MAC, spent once, for a day', async () => {
  const { sql, clock, d, lines } = setup();
  const asked = ok(await prove(d, '  New.Person@Example.com ', 'Nia'));
  assert.deepEqual(asked.body, {});
  const mail = asked.mail;
  assert.ok(mail && 'kind' in mail && mail.kind === 'invite.prove');
  assert.equal(mail.to, 'new.person@example.com');
  const proof = proofOf(asked);
  assert.match(proof, /^[A-Za-z0-9_-]{43}$/);

  const row = sql.one<{ hash: string; purpose: string; email: string; expires: number }>('SELECT hash, purpose, email, expires FROM dir_pending');
  assert.ok(row);
  assert.match(row.hash, /^[0-9a-f]{64}$/);
  assert.deepEqual({ purpose: row.purpose, email: row.email, expires: row.expires }, { purpose: 'invite', email: 'new.person@example.com', expires: NOW + DAY });
  assert.ok(!sql.all<{ payload: string }>('SELECT payload FROM dir_pending').some((r) => r.payload.includes(proof)), 'the proof is stored in clear');

  assert.deepEqual(ok(await d.auth({ flow: 'invite.proved', token: proof })).body, {
    email: 'new.person@example.com',
    invite: 'rec_01J0000000000000000000000.an-invitation',
    name: 'Nia',
  });
  assert.equal(sql.all('SELECT 1 FROM dir_pending').length, 0, 'a spent proof was kept');
  notYou(await d.auth({ flow: 'invite.proved', token: proof }));
  assert.equal(lines.at(-1)?.reason, 'link');
  notYou(await d.auth({ flow: 'invite.proved', token: 'short' }));

  const edge = proofOf(await prove(d, 'edge@example.com'));
  const gone = proofOf(await prove(d, 'gone@example.com'));
  clock.set(NOW + DAY - 1);
  assert.equal(ok(await d.auth({ flow: 'invite.proved', token: edge })).body.name, null);
  clock.set(NOW + DAY);
  notYou(await d.auth({ flow: 'invite.proved', token: gone }));
});

test('A PROOF IS COUNTED AGAINST THE MAILBOX, is refused for what is not an address, and is off where mail is', async () => {
  const { d } = setup();
  const proofs: string[] = [];
  for (let i = 0; i < 10; i++) proofs.push(proofOf(await prove(d, 'target@example.com')));
  assert.equal((await prove(d, 'target@example.com')).status, 429);
  ok(await d.auth({ flow: 'invite.proved', token: proofs[0]! }));
  ok(await prove(d, 'target@example.com'));

  for (const email of ['not an address', '', 'a@b', `${'x'.repeat(250)}@example.com`]) {
    const r = await prove(d, email);
    assert.equal(r.status, 422, email);
    assert.equal('refusal' in r && r.refusal.at, 'email', email);
  }
  const noInvite = await d.auth({ flow: 'invite.prove', email: 'someone@example.com', invite: '  ' });
  assert.equal('refusal' in noInvite && noInvite.refusal.at, 'invite');

  const { d: mailless } = setup((c) => ({ ...c, magic: false }));
  assert.equal((await prove(mailless, 'someone@example.com')).status, 404);
});

/* ── the first run is this person's ───────────────────────────────────── */

test('FIRST RUN IS ASKED OF THIS PERSON, so a newcomer is led to add a passkey where others already have one', async () => {
  const { d } = setup();
  value(d.person$('bo@example.com', 'Bo'));
  const ada = await linkIn(d, 'ada@example.com');
  ok(await addPasskey(d, ada, KEYS.es256));
  const bo = await linkIn(d, 'bo@example.com');

  assert.equal(ok(await d.auth({ flow: 'methods', sid: bo })).body.firstRun, true, 'Bo was told he is past his first run');
  assert.equal(ok(await d.auth({ flow: 'methods', sid: ada })).body.firstRun, false);
  /* Signed out nobody is known, and a passkey exists here, so the passkey button is offered. */
  assert.equal(ok(await d.auth({ flow: 'methods' })).body.firstRun, false);
});
