/**
 * Sign-in, against a fixed clock.
 *
 * EVERY TEST IS ABOUT SOMEBODY GETTING IN WHO SHOULD NOT, OR STAYING IN LONGER THAN THEY SHOULD. The edges are
 * the millisecond each window closes, because that is where an off-by-one lets a dead session or a used link
 * through; the lockout, links and challenges are each tried twice, because single use is the property; and the
 * tables are read raw, because "stored only as a MAC" is a claim about every cell and not about a code path.
 *
 * The ceremonies are signed live by the software authenticator in `fixtures/webauthn/`, with its committed
 * throwaway keys, because the Directory's challenges are random and a fixed vector could not answer one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { AuthResult } from '@braindog/ports';

import { DIRECTORY_VERSION, createDirectory, type AuthConfig, type Directory, type Reason } from '../src/directory.ts';
import { b64url } from '../src/webauthn.ts';
import { sharedSuffix } from '../src/identity.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';
import { asJSON, assert as authenticate, register, testKeys, type TestKey } from './fixtures/webauthn/authenticator.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const ORIGIN = 'https://studio.example';
const RP_ID = 'studio.example';
const serverKey = 'a-throwaway-server-key-for-these-tests-only';
const KEYS = testKeys()!;
const NOT_YOU = { code: 'UNAUTHORIZED', fix: 'That did not sign you in.' };

/**
 * A fresh address per sign-in, unless a test is about one address. Every sign-in reserves a strike against
 * its IP, successful or not, so a test that signed in ten times from one address would be testing the lockout.
 */
let seq = 0;
const nextIp = () => `203.0.113.${(++seq % 250) + 1}`;

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
  const config = change({
    mac: new Uint8Array(32).fill(7),
    rp: { id: RP_ID, origin: ORIGIN },
    magic: true,
    key: { serverKey },
    log: (line) => void lines.push(line),
  });
  const d = createDirectory(sql, clock, config, { sells: false });
  const ada = value<{ id: string }>(d.person$('ada@example.com', 'Ada')).id;
  const record = value<{ record: string }>(d.provision({ slug: 'the-studio', email: 'ada@example.com' })).record;
  return { sql, clock, d, lines, ada, record, config };
}

/** The 200 arm, or a failed assertion that says what came back instead. */
function ok<B>(r: AuthResult<B>) {
  if (r.status !== 200) assert.fail(`expected 200, got ${r.status}${'refusal' in r ? ` ${r.refusal.code}` : ''}`);
  return r;
}

function sidOf(r: AuthResult<unknown>): string {
  const s = ok(r).session;
  if (!s || s === 'clear') return assert.fail('no session was set');
  return s.sid;
}

/** The one failure body, and optionally the cookie cleared with it. */
function notYou(r: AuthResult<unknown>, cleared = false): void {
  assert.equal(r.status, 401, `expected 401, got ${r.status}`);
  assert.deepEqual('refusal' in r ? r.refusal : null, NOT_YOU);
  if (cleared) assert.equal(r.session, 'clear', 'the cookie was not cleared');
}

const keyIn = (d: Directory, o: { sid?: string; ip?: string; key?: string } = {}) =>
  d.auth({ flow: 'key.exchange', serverKey: o.key ?? serverKey, ip: o.ip ?? nextIp(), ...(o.sid === undefined ? {} : { sid: o.sid }) });

function linkOf(r: AuthResult<unknown>): string {
  const mail = ok(r).mail;
  if (!mail || !('linkToken' in mail)) return assert.fail('no sign-in link was handed over');
  return mail.linkToken;
}

async function addPasskey(d: Directory, sid: string, key: TestKey, label?: string) {
  const options = ok(await d.auth({ flow: 'passkey.register.options', sid })).body;
  const made = await register(key, { rpId: RP_ID, origin: ORIGIN, challenge: options.challenge });
  const credential = asJSON.registration(made);
  const result = await d.auth({ flow: 'passkey.register', sid, credential, ...(label === undefined ? {} : { label }) });
  return { options, credential, result };
}

async function passkeyIn(d: Directory, key: TestKey, o: { person: string | null; signCount: number; sid?: string; ip?: string }) {
  const ip = o.ip ?? nextIp();
  const options = ok(await d.auth({ flow: 'passkey.assert.options', ip })).body;
  const signed = await authenticate(key, { rpId: RP_ID, origin: ORIGIN, challenge: options.challenge, signCount: o.signCount, person: o.person });
  return d.auth({ flow: 'passkey.assert', credential: asJSON.assertion(signed), ip, ...(o.sid === undefined ? {} : { sid: o.sid }) });
}

/** Every cell of every `dir_` table, as text. */
function cells(sql: NodeSql): string[] {
  const out: string[] = [];
  for (const { name } of sql.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'dir%'"))
    for (const row of sql.all(`SELECT * FROM ${name}`)) for (const cell of Object.values(row)) out.push(String(cell));
  return out;
}

const reasons = (lines: Line[]) => lines.map((l) => l.reason);

/* ── what is stored ───────────────────────────────────────────────────── */

test('NO CELL OF ANY dir_ TABLE HOLDS A VALUE THAT OPENS ANYTHING', async () => {
  const { sql, clock, d } = setup();
  const sid = sidOf(await keyIn(d));
  const outstanding = ok(await d.auth({ flow: 'passkey.register.options', sid })).body.challenge;
  const linkToken = linkOf(await d.auth({ flow: 'magic.start', email: 'ada@example.com', ip: nextIp() }));
  const claimed = ok(await d.auth({ flow: 'claim.mint', email: 'ada@example.com' })).mail;
  assert.ok(claimed && 'claimToken' in claimed);
  const claimToken = claimed.claimToken;
  await keyIn(d, { key: 'wrong', ip: '198.51.100.1' });
  clock.advance(DAY + 1);
  const rotated = ok(await d.auth({ flow: 'session', sid })).session;
  assert.ok(rotated && rotated !== 'clear');

  const stored = cells(sql);
  const dump = stored.join('\n');
  for (const [name, raw] of [
    ['a session id', sid],
    ['a rotated session id', rotated.sid],
    ['a sign-in link', linkToken],
    ['a claim link', claimToken],
    ['a challenge', outstanding],
    ['the server key', serverKey],
  ] as const)
    assert.ok(!dump.includes(raw), `${name} is stored in clear`);

  /* What IS stored is the MAC: 64 hex characters, the same length whatever went in. */
  for (const row of sql.all<{ id_hash: string }>('SELECT id_hash FROM dir_session')) assert.match(row.id_hash, /^[0-9a-f]{64}$/);
  for (const row of sql.all<{ hash: string }>('SELECT hash FROM dir_link UNION ALL SELECT hash FROM dir_challenge')) assert.match(row.hash, /^[0-9a-f]{64}$/);
  assert.equal(sid.length, 43);
});

/* ── sessions ─────────────────────────────────────────────────────────── */

test('A SESSION LIVES NINETY DAYS AND NOT A MILLISECOND MORE', async () => {
  const { sql, clock, d, ada, record } = setup();
  const early = sidOf(await keyIn(d));
  const late = sidOf(await keyIn(d));

  clock.set(NOW + 90 * DAY - 1);
  const who = ok(await d.auth({ flow: 'session', sid: early })).body;
  assert.deepEqual(who, { person: ada, email: 'ada@example.com', record, provedAt: NOW, passkey: false });

  clock.set(NOW + 90 * DAY);
  notYou(await d.auth({ flow: 'session', sid: late }), true);
  /* And the row is gone, not merely refused, so it cannot come back if the clock does. */
  assert.equal(sql.all('SELECT 1 FROM dir_session').length, 1, 'the expired row was kept');
  clock.set(NOW);
  notYou(await d.auth({ flow: 'session', sid: late }), true);
});

test('A SESSION ROTATES AFTER A DAY OF USE, and the old id is good for one more minute', async () => {
  const { sql, clock, d } = setup();
  const sid = sidOf(await keyIn(d));

  clock.set(NOW + DAY);
  const same = ok(await d.auth({ flow: 'session', sid }));
  assert.equal(same.session, undefined, 'rotated at exactly a day, where the rule is more than a day');

  const at = NOW + DAY + 1;
  clock.set(at);
  const turned = ok(await d.auth({ flow: 'session', sid }));
  const next = turned.session;
  assert.ok(next && next !== 'clear', 'a day-old session was not rotated');
  assert.notEqual(next.sid, sid);
  assert.match(next.sid, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(turned.body.provedAt, NOW, 'rotation moved the proof, and it is not one');

  /* The grace: requests already in flight with the old id are answered, and do not rotate it again. */
  clock.set(at + MINUTE - 1);
  const inFlight = ok(await d.auth({ flow: 'session', sid }));
  assert.equal(inFlight.session, undefined, 'the previous id rotated the session a second time');
  clock.set(at + MINUTE);
  notYou(await d.auth({ flow: 'session', sid }), true);
  ok(await d.auth({ flow: 'session', sid: next.sid }));

  /* The expiry moved with the rotation: ninety days from it, not from sign-in. */
  const row = sql.one<{ expires: number; rotated_at: number; authed_at: number }>('SELECT expires, rotated_at, authed_at FROM dir_session');
  assert.deepEqual({ ...row }, { expires: at + 90 * DAY, rotated_at: at, authed_at: NOW });
});

test('TWO REQUESTS WITH ONE DAY-OLD COOKIE ROTATE IT ONCE, and both are answered', async () => {
  const { clock, d } = setup();
  const sid = sidOf(await keyIn(d));
  clock.set(NOW + 2 * DAY);
  const [a, b, c] = await Promise.all([
    d.auth({ flow: 'session', sid }),
    d.auth({ flow: 'session', sid }),
    d.auth({ flow: 'methods', sid }),
  ]);
  const minted = [ok(a).session, ok(b).session, ok(c).session].filter((s) => s !== undefined);
  assert.equal(minted.length, 1, `${minted.length} rotations for one cookie`);
});

test('A ROTATION RIDES ON WHATEVER ANSWER THE CALL ENDS WITH, or the browser keeps an id about to die', async () => {
  const { clock, d } = setup();
  const sid = sidOf(await keyIn(d));
  clock.set(NOW + DAY + 1);
  /* A day-old cookie has a day-old proof, so registering is refused as stale: a 401 that is not a sign-in failure,
     which still has to carry the id the same call rotated. */
  const failed = await d.auth({ flow: 'passkey.register', sid, credential: { id: 'AAAA', response: { clientDataJSON: '', attestationObject: '' } } });
  assert.equal(failed.status, 401);
  assert.equal('reason' in failed && failed.reason, 'stale');
  const s = failed.session;
  assert.ok(s && s !== 'clear', 'a failed registration dropped the rotated id');
  ok(await d.auth({ flow: 'session', sid: s.sid }));
});

test('SIGNING OUT DELETES THE ROW AND CLEARS THE COOKIE, and signing out twice is the same answer', async () => {
  const { sql, d } = setup();
  const sid = sidOf(await keyIn(d));
  const out = ok(await d.auth({ flow: 'logout', sid }));
  assert.deepEqual({ ...out }, { status: 200, body: {}, session: 'clear' });
  assert.equal(sql.all('SELECT 1 FROM dir_session').length, 0);
  notYou(await d.auth({ flow: 'session', sid }), true);
  assert.deepEqual({ ...(await d.auth({ flow: 'logout', sid })) }, { status: 200, body: {}, session: 'clear' });
  assert.deepEqual({ ...(await d.auth({ flow: 'logout', sid: 'not a session id' })) }, { status: 200, body: {}, session: 'clear' });
});

test('A NEW MAC KEY SIGNS EVERYBODY OUT, and leaves every link dead', async () => {
  const { sql, clock, d } = setup();
  const sid = sidOf(await keyIn(d));
  const linkToken = linkOf(await d.auth({ flow: 'magic.start', email: 'ada@example.com', ip: nextIp() }));

  const rekeyed = createDirectory(sql, clock, { mac: new Uint8Array(32).fill(8), rp: { id: RP_ID, origin: ORIGIN }, magic: true, key: { serverKey } });
  notYou(await rekeyed.auth({ flow: 'session', sid }), true);
  notYou(await rekeyed.auth({ flow: 'magic.redeem', linkToken, ip: nextIp() }));
  /* And nothing was walked to do it: the rows are still there, they just match nothing. */
  assert.equal(sql.all('SELECT 1 FROM dir_link').length, 1);
});

test('SIGNING IN DELETES THE SESSION IT WAS HANDED, so a planted cookie never becomes a signed-in one', async () => {
  const { d, ada } = setup();
  const planted = sidOf(await keyIn(d));
  const after = sidOf(await keyIn(d, { sid: planted }));
  assert.notEqual(after, planted);
  notYou(await d.auth({ flow: 'session', sid: planted }), true);

  const linkToken = linkOf(await d.auth({ flow: 'magic.start', email: 'ada@example.com', ip: nextIp() }));
  const viaLink = sidOf(await d.auth({ flow: 'magic.redeem', linkToken, ip: nextIp(), sid: after }));
  notYou(await d.auth({ flow: 'session', sid: after }), true);

  await addPasskey(d, viaLink, KEYS.es256);
  const viaPasskey = sidOf(await passkeyIn(d, KEYS.es256, { person: ada, signCount: 1, sid: viaLink }));
  notYou(await d.auth({ flow: 'session', sid: viaLink }), true);
  ok(await d.auth({ flow: 'session', sid: viaPasskey }));
});

test('A SUSPENDED PERSON IS REFUSED EVERYWHERE, including by the session they already had', async () => {
  const { sql, d, ada, lines } = setup();
  const sid = sidOf(await keyIn(d));
  await addPasskey(d, sid, KEYS.es256);
  sql.exec("UPDATE dir_person SET suspended_at = '2026-09-05T12:00:00.000Z' WHERE id = ?", ada);

  notYou(await d.auth({ flow: 'session', sid }), true);
  notYou(await keyIn(d));
  notYou(await passkeyIn(d, KEYS.es256, { person: ada, signCount: 1 }));
  const start = ok(await d.auth({ flow: 'magic.start', email: 'ada@example.com', ip: nextIp() }));
  assert.equal(start.mail, undefined, 'a suspended person was sent a link');
  assert.equal((await d.auth({ flow: 'claim.mint', email: 'ada@example.com' })).status, 422);
  assert.deepEqual(reasons(lines).filter((r) => r === 'suspended').length, 2);
});

/* ── the lockout ──────────────────────────────────────────────────────── */

test('A BLANK SERVER KEY OPENS NOTHING: an empty configured key refuses every exchange, the empty one too', async () => {
  for (const blank of ['', '   ']) {
    const { d } = setup((c) => ({ ...c, key: { serverKey: blank } }));
    for (const sent of ['', '   ', undefined]) {
      const r = await d.auth({ flow: 'key.exchange', serverKey: sent as string, ip: nextIp() });
      assert.equal(r.status, 404, `a blank key ${JSON.stringify(blank)} took ${JSON.stringify(sent)}`);
      assert.equal(r.session, undefined);
    }
  }
});

test('THE LOCKOUT: ten wrong keys are counted, the eleventh is refused, and the right key always gets in', async () => {
  const { sql, clock, d, lines } = setup();
  const ip = '198.51.100.7';
  for (let i = 0; i < 10; i++) notYou(await keyIn(d, { ip, key: `wrong-${i}` }));
  assert.deepEqual(reasons(lines), Array(10).fill('key'));

  assert.deepEqual({ ...(await keyIn(d, { ip, key: 'wrong-again' })) }, { status: 429, retryAfter: 900 });
  /* A WRONG KEY WAITS IT OUT. */
  clock.advance(5 * MINUTE);
  assert.deepEqual({ ...(await keyIn(d, { ip, key: 'wrong-later' })) }, { status: 429, retryAfter: 600 });
  assert.equal(reasons(lines).filter((r) => r === 'key').length, 10, 'a wrong key was counted as a failure during the lock');

  /* Hammering does not extend it, and the counter stays capped. */
  for (let i = 0; i < 20; i++) await keyIn(d, { ip, key: 'wrong' });
  assert.equal(sql.one<{ n: number }>("SELECT n FROM dir_fail WHERE key = 'ip:198.51.100.7'")?.n, 10);

  /* Another address is not locked out by this one. */
  ok(await keyIn(d, { ip: '198.51.100.8' }));

  clock.set(NOW + 15 * MINUTE - 1);
  assert.equal((await keyIn(d, { ip, key: 'wrong' })).status, 429);
  /* THE RIGHT KEY IS THE OWNER WHEREVER IT CAME FROM (RG14): somebody naming their address cannot lock them out. */
  ok(await keyIn(d, { ip }));
  assert.equal(sql.all('SELECT 1 FROM dir_fail WHERE key = ?', `ip:${ip}`).length, 0, 'and it clears the address');
});

test('AND IT FORGETS: strikes whose first is fifteen minutes old start again at one', async () => {
  /* Without this, a handful of typos spread over a month from one office add up to a lock. */
  const { clock, d } = setup();
  const ip = '198.51.100.9';
  for (let i = 0; i < 10; i++) notYou(await keyIn(d, { ip, key: 'wrong' }));
  clock.set(NOW + 15 * MINUTE);
  for (let i = 0; i < 10; i++) notYou(await keyIn(d, { ip, key: 'wrong' }));
  assert.equal((await keyIn(d, { ip, key: 'wrong' })).status, 429, 'the second window did not count');
});

test('TEN SIGN-INS IN A ROW FROM ONE ADDRESS LOCK NOBODY OUT, because a success clears the address', async () => {
  /* An office behind one address on a Monday morning. Every one of these reserved a strike before comparing. */
  const { sql, d } = setup();
  const ip = '198.51.100.30';
  for (let i = 0; i < 12; i++) ok(await keyIn(d, { ip }));
  assert.equal(sql.all('SELECT 1 FROM dir_fail WHERE key = ?', `ip:${ip}`).length, 0, 'a success left its strike behind');
});

test('NINE FAILURES, A SUCCESS, NINE FAILURES DO NOT LOCK, whichever way in the success was', async () => {
  for (const way of ['key', 'link', 'passkey'] as const) {
    const { d, ada } = setup();
    const ip = '198.51.100.31';
    /* The passkey and the link are made first, from other addresses, so only sign-ins count against this one. */
    const sid = sidOf(await keyIn(d));
    ok((await addPasskey(d, sid, KEYS.es256)).result);
    const linkToken = linkOf(await d.auth({ flow: 'magic.start', email: 'ada@example.com', ip: nextIp() }));

    for (let i = 0; i < 9; i++) notYou(await keyIn(d, { ip, key: 'wrong' }));
    if (way === 'key') ok(await keyIn(d, { ip }));
    else if (way === 'link') ok(await d.auth({ flow: 'magic.redeem', linkToken, ip }));
    else ok(await passkeyIn(d, KEYS.es256, { person: ada, signCount: 1, ip }));
    for (let i = 0; i < 9; i++) notYou(await keyIn(d, { ip, key: 'wrong' }));

    /* The count restarted at the success rather than stopping: ten failures after it still lock. */
    notYou(await keyIn(d, { ip, key: 'wrong' }));
    assert.equal((await keyIn(d, { ip, key: 'wrong' })).status, 429, `${way}: the count stopped rather than restarted`);
  }
});

test('TEN FAILURES LOCK, AND A CORRECT SECRET DURING THE LOCK IS REFUSED AND UNLOCKS NOTHING', async () => {
  const { sql, clock, d, ada } = setup();
  const ip = '198.51.100.32';
  const sid = sidOf(await keyIn(d));
  ok((await addPasskey(d, sid, KEYS.es256)).result);
  const linkToken = linkOf(await d.auth({ flow: 'magic.start', email: 'ada@example.com', ip: nextIp() }));

  for (let i = 0; i < 10; i++) notYou(await keyIn(d, { ip, key: 'wrong' }));
  assert.equal((await keyIn(d, { ip, key: 'wrong' })).status, 429);
  const strikes = () => ({ ...sql.one<{ n: number; until: number | null }>('SELECT n, until FROM dir_fail WHERE key = ?', `ip:${ip}`)! });
  const locked = strikes();
  assert.deepEqual(locked, { n: 10, until: NOW + 15 * MINUTE });

  /* A LINK AND A PASSKEY, each with the right secret, and neither is compared or clears the lock. The server key is the one
     way past it (RG14), and is asked below. */
  clock.advance(MINUTE);
  assert.equal((await d.auth({ flow: 'magic.redeem', linkToken, ip })).status, 429, 'a live link');
  assert.equal((await passkeyIn(d, KEYS.es256, { person: ada, signCount: 1, ip })).status, 429, 'a good passkey');
  assert.deepEqual(strikes(), locked, 'a correct secret during the lock moved it');
  assert.equal(sql.all('SELECT 1 FROM dir_link').length, 1, 'the link was looked at, and used up, during the lock');

  /* And when it lifts, the right key signs in and the address is clear again. (Not the link: it was minted at
     the same instant as the lock, so it dies at the same instant the lock lifts.) */
  clock.set(NOW + 15 * MINUTE);
  ok(await keyIn(d, { ip }));
  assert.equal(sql.all('SELECT 1 FROM dir_fail WHERE key = ?', `ip:${ip}`).length, 0);
});

test('THE LOCKOUT FAILS CLOSED: a reservation with no row back is a 503, never a pass', async () => {
  for (const broken of ['no row', 'throws'] as const) {
    const real = openSqlite();
    const refusing = {
      ...real,
      one: <T,>(text: string, ...params: unknown[]): T | undefined => {
        if (/^INSERT INTO dir_fail/.test(text)) {
          if (broken === 'throws') throw new Error('disk I/O error');
          return undefined;
        }
        return real.one<T>(text, ...(params as never[]));
      },
    } as NodeSql;
    const lines: Line[] = [];
    const d = createDirectory(refusing, fixedClock(NOW), {
      mac: new Uint8Array(32).fill(7),
      rp: { id: RP_ID, origin: ORIGIN },
      magic: true,
      key: { serverKey },
      log: (line) => void lines.push(line),
    });
    value(d.person$('ada@example.com'));

    assert.deepEqual({ ...(await keyIn(d, { key: 'wrong' })) }, { status: 503 }, broken);
    assert.deepEqual({ ...(await d.auth({ flow: 'magic.start', email: 'ada@example.com', ip: nextIp() })) }, { status: 503 }, broken);
    assert.equal(real.all('SELECT 1 FROM dir_session').length, 0, 'somebody was signed in past a broken lockout');
    assert.deepEqual(reasons(lines), ['reserve', 'reserve']);
    real.close();
  }
});

/* ── links ────────────────────────────────────────────────────────────── */

test('A SIGN-IN LINK WORKS ONCE, FOR FIFTEEN MINUTES', async () => {
  const { sql, clock, d, ada, lines } = setup();
  const start = ok(await d.auth({ flow: 'magic.start', email: '  ADA@example.com ', ip: nextIp() }));
  assert.deepEqual(start.body, {});
  assert.equal(start.mail?.to, 'ada@example.com', 'the link went to an address other than the one on file');
  const linkToken = linkOf(start);

  const first = ok(await d.auth({ flow: 'magic.redeem', linkToken, ip: nextIp() }));
  assert.equal(first.body.person, ada);
  assert.equal(sql.all('SELECT 1 FROM dir_link').length, 0, 'a used link was kept');
  notYou(await d.auth({ flow: 'magic.redeem', linkToken, ip: nextIp() }));
  assert.equal(reasons(lines).at(-1), 'link');

  const edge = linkOf(await d.auth({ flow: 'magic.start', email: 'ada@example.com', ip: nextIp() }));
  const gone = linkOf(await d.auth({ flow: 'magic.start', email: 'ada@example.com', ip: nextIp() }));
  clock.set(NOW + 15 * MINUTE - 1);
  ok(await d.auth({ flow: 'magic.redeem', linkToken: edge, ip: nextIp() }));
  clock.set(NOW + 15 * MINUTE);
  notYou(await d.auth({ flow: 'magic.redeem', linkToken: gone, ip: nextIp() }));
});

test('A CLAIM LINK WORKS ONCE, FOR A DAY, and only as a claim', async () => {
  const { clock, d, ada } = setup();
  const mint = async () => {
    const r = ok(await d.auth({ flow: 'claim.mint', email: 'ada@example.com' }));
    assert.equal(r.body.expires, clock.now() + DAY);
    if (!r.mail || !('claimToken' in r.mail)) return assert.fail('no claim link was handed over');
    return r.mail.claimToken;
  };
  const claimToken = await mint();
  /* A claim presented as a sign-in link finds nothing, and does not burn the claim either. */
  notYou(await d.auth({ flow: 'magic.redeem', linkToken: claimToken, ip: nextIp() }));
  assert.equal(ok(await d.auth({ flow: 'magic.redeem', claimToken, ip: nextIp() })).body.person, ada);
  notYou(await d.auth({ flow: 'magic.redeem', claimToken, ip: nextIp() }));

  const edge = await mint();
  const gone = await mint();
  clock.set(NOW + DAY - 1);
  ok(await d.auth({ flow: 'magic.redeem', claimToken: edge, ip: nextIp() }));
  clock.set(NOW + DAY);
  notYou(await d.auth({ flow: 'magic.redeem', claimToken: gone, ip: nextIp() }));

  const unknown = await d.auth({ flow: 'claim.mint', email: 'nobody@example.com' });
  assert.equal(unknown.status, 422);
  assert.equal('refusal' in unknown && unknown.refusal.code, 'OUT_OF_BOUNDS');
});

test('AN UNKNOWN ADDRESS GETS THE SAME ANSWER AND NO MAIL, so the form says nothing about who is here', async () => {
  const { sql, clock, d } = setup();
  const known = ok(await d.auth({ flow: 'magic.start', email: 'ada@example.com', ip: nextIp() }));
  for (const email of ['nobody@example.com', 'not an address', '']) {
    const r = await d.auth({ flow: 'magic.start', email, ip: nextIp() });
    assert.deepEqual({ ...r }, { status: 200, body: {} }, email);
    assert.deepEqual({ status: known.status, body: known.body }, { ...r });
  }
  assert.equal(sql.all('SELECT 1 FROM dir_link').length, 1, 'an unknown address left a link row');

  /* And a mailbox that has been sent its ten answers exactly as an address nobody has: the same 200, no mail, never
     a 429 only a known address could earn. The window is let pass first, so the mail above is forgotten. */
  clock.set(NOW + 15 * MINUTE);
  for (let i = 0; i < 10; i++) assert.ok(ok(await d.auth({ flow: 'magic.start', email: 'ada@example.com', ip: nextIp() })).mail, `mail ${i + 1} was not sent`);
  for (const email of ['ada@example.com', 'nobody@example.com']) {
    const full = await d.auth({ flow: 'magic.start', email, ip: nextIp() });
    assert.deepEqual({ ...full }, { status: 200, body: {} }, email);
  }
  /* And the per-asker one, whatever address is asked about. */
  /* Ten starts per fifteen minutes (49 §8), and a sent link never clears the count: sending is not a sign-in. */
  for (let i = 0; i < 10; i++) ok(await d.auth({ flow: 'magic.start', email: `x${i}@example.com`, ip: '198.51.100.20' }));
  assert.equal((await d.auth({ flow: 'magic.start', email: 'y@example.com', ip: '198.51.100.20' })).status, 429);
});

/* ── challenges ───────────────────────────────────────────────────────── */

test('A CHALLENGE IS SINGLE USE: a registration replayed is refused', async () => {
  const { d, lines } = setup();
  const sid = sidOf(await keyIn(d));
  const { credential, result } = await addPasskey(d, sid, KEYS.es256);
  ok(result);
  notYou(await d.auth({ flow: 'passkey.register', sid, credential }));
  assert.equal(reasons(lines).at(-1), 'challenge');
});

test('A CHALLENGE LIVES FIVE MINUTES', async () => {
  const { clock, d, lines } = setup();
  const sid = sidOf(await keyIn(d));
  const late = ok(await d.auth({ flow: 'passkey.register.options', sid })).body.challenge;
  const edge = ok(await d.auth({ flow: 'passkey.register.options', sid })).body.challenge;

  clock.set(NOW + 5 * MINUTE - 1);
  const inTime = await register(KEYS.es256, { rpId: RP_ID, origin: ORIGIN, challenge: edge });
  ok(await d.auth({ flow: 'passkey.register', sid, credential: asJSON.registration(inTime) }));

  clock.set(NOW + 5 * MINUTE);
  const tooLate = await register(KEYS.rs256, { rpId: RP_ID, origin: ORIGIN, challenge: late });
  notYou(await d.auth({ flow: 'passkey.register', sid, credential: asJSON.registration(tooLate) }));
  assert.equal(reasons(lines).at(-1), 'challenge');
});

test('A CHALLENGE IS FOR ONE CEREMONY AND ONE PERSON', async () => {
  const { d, ada, lines } = setup();
  value(d.person$('bo@example.com', 'Bo'));
  const signIn = async (email: string) =>
    sidOf(await d.auth({ flow: 'magic.redeem', linkToken: linkOf(await d.auth({ flow: 'magic.start', email, ip: nextIp() })), ip: nextIp() }));
  const adaSid = sidOf(await d.auth({ flow: 'magic.redeem', linkToken: linkOf(await d.auth({ flow: 'magic.start', email: 'ada@example.com', ip: nextIp() })), ip: nextIp() }));
  const boSid = await signIn('bo@example.com');

  /* Ada's registration challenge, answered inside Bo's session. */
  const adas = ok(await d.auth({ flow: 'passkey.register.options', sid: adaSid })).body.challenge;
  const crossed = await register(KEYS.es256, { rpId: RP_ID, origin: ORIGIN, challenge: adas });
  notYou(await d.auth({ flow: 'passkey.register', sid: boSid, credential: asJSON.registration(crossed) }));
  assert.equal(reasons(lines).at(-1), 'challenge');

  /* A sign-in challenge answered as a registration. */
  const signing = ok(await d.auth({ flow: 'passkey.assert.options', ip: nextIp() })).body.challenge;
  const wrongCeremony = await register(KEYS.es256, { rpId: RP_ID, origin: ORIGIN, challenge: signing });
  notYou(await d.auth({ flow: 'passkey.register', sid: adaSid, credential: asJSON.registration(wrongCeremony) }));
  assert.equal(reasons(lines).at(-1), 'challenge');

  /* And a registration challenge answered as a sign-in. */
  await addPasskey(d, adaSid, KEYS.rs256);
  const registering = ok(await d.auth({ flow: 'passkey.register.options', sid: adaSid })).body.challenge;
  const signed = await authenticate(KEYS.rs256, { rpId: RP_ID, origin: ORIGIN, challenge: registering, signCount: 0, person: ada });
  notYou(await d.auth({ flow: 'passkey.assert', credential: asJSON.assertion(signed), ip: nextIp() }));
  assert.equal(reasons(lines).at(-1), 'challenge');
});

test('TEN THOUSAND LIVE CHALLENGES ARE THE CEILING, and expiry makes room again', async () => {
  const { sql, clock, d, lines } = setup();
  sql.transactionSync(() => {
    for (let i = 0; i < 10_000; i++)
      sql.exec("INSERT INTO dir_challenge (hash, purpose, person, expires) VALUES (?, 'assert', NULL, ?)", `filler-${i}`, NOW + 5 * MINUTE);
  });
  assert.deepEqual({ ...(await d.auth({ flow: 'passkey.assert.options', ip: nextIp() })) }, { status: 503 });
  assert.equal(reasons(lines).at(-1), 'full');
  clock.set(NOW + 5 * MINUTE);
  ok(await d.auth({ flow: 'passkey.assert.options', ip: nextIp() }));
  assert.equal(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM dir_challenge')?.n, 1, 'expired challenges were not pruned');
});

/* ── passkeys ─────────────────────────────────────────────────────────── */

test('THE OPTIONS ARE EXACTLY WHAT THE BROWSER IS HANDED', async () => {
  const { d, ada } = setup();
  const sid = sidOf(await keyIn(d));
  const register0 = ok(await d.auth({ flow: 'passkey.register.options', sid })).body;
  assert.match(register0.challenge, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(
    { ...register0, challenge: '' },
    {
      challenge: '',
      rp: { id: RP_ID, name: 'BrainDog' },
      user: { id: b64url(new TextEncoder().encode(ada)), name: 'ada@example.com', displayName: 'Ada' },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      timeout: 300000,
      attestation: 'none',
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      excludeCredentials: [],
    },
  );
  ok((await addPasskey(d, sid, KEYS.es256)).result);
  const again = ok(await d.auth({ flow: 'passkey.register.options', sid })).body;
  assert.deepEqual(again.excludeCredentials, [{ type: 'public-key', id: KEYS.es256.id }], 'the passkey already held is not excluded');

  const signIn = ok(await d.auth({ flow: 'passkey.assert.options', ip: nextIp() })).body;
  assert.match(signIn.challenge, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual({ ...signIn, challenge: '' }, { challenge: '', rpId: RP_ID, timeout: 300000, userVerification: 'required', allowCredentials: [] });
});

test('A PASSKEY, END TO END: registered behind a session, then signing in on its own, ES256 and RS256', async () => {
  const { sql, clock, d, ada, record } = setup();
  const sid = sidOf(await keyIn(d));
  const es = ok((await addPasskey(d, sid, KEYS.es256, '  Test phone  ')).result).body;
  assert.deepEqual(es, { id: KEYS.es256.id, label: 'Test phone', alg: -7, backedUp: false, createdAt: NOW, lastUsed: null });
  ok((await addPasskey(d, sid, KEYS.rs256)).result);
  assert.deepEqual(
    ok(await d.auth({ flow: 'passkeys', sid })).body.map((k) => [k.id, k.alg, k.label]),
    [[KEYS.es256.id, -7, 'Test phone'], [KEYS.rs256.id, -257, null]].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
  ok(await d.auth({ flow: 'logout', sid }));

  clock.advance(MINUTE);
  const signedIn = ok(await passkeyIn(d, KEYS.es256, { person: ada, signCount: 1 }));
  assert.deepEqual(signedIn.body, { person: ada, email: 'ada@example.com', record, provedAt: NOW + MINUTE });
  assert.deepEqual(
    { ...sql.one<{ sign_count: number; last_used: number }>('SELECT sign_count, last_used FROM dir_passkey WHERE id = ?', KEYS.es256.id)! },
    { sign_count: 1, last_used: NOW + MINUTE },
  );
  notYou(await passkeyIn(d, KEYS.es256, { person: ada, signCount: 1 }), false);
  ok(await passkeyIn(d, KEYS.es256, { person: ada, signCount: 2 }));

  /* RS256 reports zero, and zero over zero is accepted every time: a synced passkey never counts. */
  ok(await passkeyIn(d, KEYS.rs256, { person: ada, signCount: 0 }));
  ok(await passkeyIn(d, KEYS.rs256, { person: null, signCount: 0 }));
});

test('a passkey is refused when it is a duplicate, unknown, or made for somebody else', async () => {
  const { sql, d, ada, lines } = setup();
  const sid = sidOf(await keyIn(d));
  ok((await addPasskey(d, sid, KEYS.es256)).result);

  notYou((await addPasskey(d, sid, KEYS.es256)).result);
  assert.equal(reasons(lines).at(-1), 'dup');
  assert.equal(sql.all('SELECT 1 FROM dir_passkey').length, 1);

  notYou(await passkeyIn(d, KEYS.rs256, { person: ada, signCount: 0 }));
  assert.equal(reasons(lines).at(-1), 'unknown');

  notYou(await passkeyIn(d, KEYS.es256, { person: 'p_somebody_else', signCount: 1 }));
  assert.equal(reasons(lines).at(-1), 'handle');
});

test('REGISTRATION NEEDS A LIVE SESSION, which is the attestation', async () => {
  const { d, lines } = setup();
  notYou(await d.auth({ flow: 'passkey.register.options', sid: 'A'.repeat(43) }), true);
  const options = ok(await d.auth({ flow: 'passkey.assert.options', ip: nextIp() })).body;
  const made = await register(KEYS.es256, { rpId: RP_ID, origin: ORIGIN, challenge: options.challenge });
  notYou(await d.auth({ flow: 'passkey.register', sid: 'A'.repeat(43), credential: asJSON.registration(made) }), true);
  assert.deepEqual(reasons(lines), ['session', 'session']);
});

test('a passkey is removed only by the person who holds it, and the last one can go', async () => {
  const { d } = setup();
  value(d.person$('bo@example.com'));
  const adaSid = sidOf(await d.auth({ flow: 'magic.redeem', linkToken: linkOf(await d.auth({ flow: 'magic.start', email: 'ada@example.com', ip: nextIp() })), ip: nextIp() }));
  const boSid = sidOf(await d.auth({ flow: 'magic.redeem', linkToken: linkOf(await d.auth({ flow: 'magic.start', email: 'bo@example.com', ip: nextIp() })), ip: nextIp() }));
  ok((await addPasskey(d, adaSid, KEYS.es256)).result);

  const theirs = await d.auth({ flow: 'passkey.remove', sid: boSid, id: KEYS.es256.id });
  assert.equal(theirs.status, 422);
  assert.equal('refusal' in theirs && theirs.refusal.code, 'OUT_OF_BOUNDS');
  ok(await d.auth({ flow: 'passkey.remove', sid: adaSid, id: KEYS.es256.id }));
  assert.deepEqual(ok(await d.auth({ flow: 'passkeys', sid: adaSid })).body, []);
});

/* ── the server key ───────────────────────────────────────────────────── */

test('THE SERVER KEY IS REFUSED WHERE THERE IS MORE THAN ONE PERSON', async () => {
  const { d } = setup();
  ok(await keyIn(d));
  value(d.person$('bo@example.com'));
  const refused = await keyIn(d);
  assert.equal(refused.status, 403);
  assert.equal('refusal' in refused && refused.refusal.code, 'FORBIDDEN');
  /* Even the wrong key gets the same 403: the count is checked before the compare. */
  assert.equal((await keyIn(d, { key: 'wrong' })).status, 403);
  assert.equal(ok(await d.auth({ flow: 'methods' })).body.key, false, 'methods still offers the key');
});

test('THE SERVER KEY IS NOT OFFERED WHERE NOBODY IS IN THE DIRECTORY, because the exchange has nobody to sign in', async () => {
  const { config } = setup();
  const d = createDirectory(openSqlite(), fixedClock(NOW), config, { sells: false });
  assert.equal(ok(await d.auth({ flow: 'methods' })).body.key, false, 'methods offers a key nobody can sign in with');
  notYou(await keyIn(d));
});

/* ── one failure, and what the log is told ────────────────────────────── */

test('EVERY SIGN-IN FAILURE IS ONE BODY, and the log hears why without hearing who', async () => {
  const { clock, d, ada, lines } = setup();
  const sid = sidOf(await keyIn(d));
  await addPasskey(d, sid, KEYS.es256);
  ok(await passkeyIn(d, KEYS.es256, { person: ada, signCount: 2 }));
  const failures = [
    await keyIn(d, { key: 'wrong' }),
    await d.auth({ flow: 'magic.redeem', linkToken: 'B'.repeat(43), ip: nextIp() }),
    await d.auth({ flow: 'magic.redeem', linkToken: 'short', ip: nextIp() }),
    await passkeyIn(d, KEYS.es256, { person: ada, signCount: 1 }),
    await passkeyIn(d, KEYS.rs256, { person: ada, signCount: 0 }),
    await d.auth({ flow: 'passkey.assert', credential: { id: KEYS.es256.id, response: { clientDataJSON: '', authenticatorData: '', signature: '' } }, ip: nextIp() }),
  ];
  clock.set(NOW + 91 * DAY);
  failures.push(await d.auth({ flow: 'session', sid }));
  for (const r of failures) notYou(r);
  assert.deepEqual(reasons(lines), ['key', 'link', 'shape', 'count', 'unknown', 'shape', 'session']);

  const heard = lines.map((l) => `${l.flow} ${l.reason}`).join('\n');
  assert.ok(!heard.includes('@') && !heard.includes(sid), 'the log was told who, or handed a session id');
});

/* ── switched off ─────────────────────────────────────────────────────── */

test('WITHOUT A KEY TO TAKE MACS UNDER, SIGN-IN SAYS SO AND DOES NOTHING', async () => {
  const sql = openSqlite();
  const d = createDirectory(sql, fixedClock(NOW));
  value(d.person$('ada@example.com'));
  assert.deepEqual(ok(await d.auth({ flow: 'methods' })).body, { configured: false, passkey: false, magic: false, key: false, firstRun: false, me: null });
  for (const r of [await keyIn(d), await d.auth({ flow: 'passkey.assert.options', ip: nextIp() }), await d.auth({ flow: 'magic.start', email: 'ada@example.com', ip: nextIp() })]) {
    assert.equal(r.status, 404);
    assert.equal('refusal' in r && r.refusal.code, 'ROUTE_UNKNOWN');
  }
  assert.throws(() => createDirectory(sql, fixedClock(NOW), { mac: new Uint8Array(16), magic: false }), /at least 32 bytes/);
});

test('each way in is off until the host turns it on, and methods says which are on', async () => {
  const { d } = setup(({ rp: _rp, key: _key, ...rest }) => ({ ...rest, magic: false }));
  assert.deepEqual(
    { ...ok(await d.auth({ flow: 'methods' })).body },
    { configured: true, passkey: false, magic: false, key: false, firstRun: true, me: null },
  );
  for (const r of [
    await keyIn(d),
    await d.auth({ flow: 'passkey.assert.options', ip: nextIp() }),
    await d.auth({ flow: 'magic.start', email: 'ada@example.com', ip: nextIp() }),
  ])
    assert.equal(r.status, 404);

  const { d: on, ada, record } = setup();
  const sid = sidOf(await keyIn(on));
  const methods = ok(await on.auth({ flow: 'methods', sid })).body;
  assert.deepEqual(methods, { configured: true, passkey: true, magic: true, key: true, firstRun: true, me: { person: ada, email: 'ada@example.com', record, provedAt: NOW } });
  await addPasskey(on, sid, KEYS.es256);
  assert.equal(ok(await on.auth({ flow: 'methods' })).body.firstRun, false);
  assert.equal(ok(await on.auth({ flow: 'methods', sid: 'C'.repeat(43) })).session, 'clear', 'a dead cookie was not cleared');
});

/* ── opening another record ───────────────────────────────────────────── */

test('A SESSION OPENS ANOTHER RECORD ITS PERSON IS ON, and only one they are on, open, under a live name', async () => {
  const { sql, d, ada, record } = setup();
  const sid = sidOf(await keyIn(d));
  const shop = value<{ record: string }>(d.provision({ slug: 'the-shop', email: 'ada@example.com' })).record;
  const gone = value<{ record: string }>(d.provision({ slug: 'the-old-shop', email: 'ada@example.com' })).record;
  value(d.close(gone));
  value(d.person$('bob@example.com', 'Bob'));
  value(d.provision({ slug: 'bobs-books', email: 'bob@example.com' }));

  const moved = ok(await d.auth({ flow: 'switch', sid, slug: 'The-Shop ' }));
  assert.deepEqual(moved.body, { person: ada, email: 'ada@example.com', record: shop, provedAt: NOW });
  assert.equal(moved.session, undefined, 'a switch minted a new cookie, and the record is on the row');
  assert.equal(ok(await d.auth({ flow: 'session', sid })).body.record, shop, 'the next request still named the first record');

  for (const slug of ['bobs-books', 'the-old-shop', 'nobody', '']) {
    const refused = await d.auth({ flow: 'switch', sid, slug });
    assert.equal(refused.status, 403, slug);
    assert.deepEqual('refusal' in refused && refused.refusal, { code: 'FORBIDDEN', fix: 'You are on no open record by that name.', at: 'slug' });
  }
  assert.equal(ok(await d.auth({ flow: 'session', sid })).body.record, shop, 'a refused switch moved the session');

  ok(await d.auth({ flow: 'switch', sid, slug: 'the-studio' }));
  assert.equal(sql.one<{ record: string }>('SELECT record FROM dir_session')?.record, record);
  notYou(await d.auth({ flow: 'switch', sid: 'C'.repeat(43), slug: 'the-studio' }), true);
});

test('A SWITCH ON A DAY-OLD COOKIE MOVES THE ROW IT ROTATED, and the new cookie names the record opened', async () => {
  const { d, clock } = setup();
  const sid = sidOf(await keyIn(d));
  const shop = value<{ record: string }>(d.provision({ slug: 'the-shop', email: 'ada@example.com' })).record;
  clock.set(NOW + DAY + 1);
  const moved = ok(await d.auth({ flow: 'switch', sid, slug: 'the-shop' }));
  assert.equal(moved.body.record, shop);
  const next = moved.session;
  if (!next || next === 'clear') return assert.fail('the switch did not carry the rotation');
  assert.equal(ok(await d.auth({ flow: 'session', sid: next.sid })).body.record, shop, 'the switch answered opened and the row stayed');
});

test('A SWITCH ASKS THE RECORD ITSELF, and a name that only folds to a slug opens nothing', async () => {
  const on = new Set<string>();
  const { d, record } = setup((c) => ({ ...c, admits: async (rec, person) => on.has(`${rec}/${person}`) }));
  const who = ok(await keyIn(d));
  const sid = sidOf(who);
  const refused = { code: 'FORBIDDEN', fix: 'You are on no open record by that name.', at: 'slug' };

  /* LISTED IN THE DIRECTORY, AND REMOVED FROM THE RECORD'S OWN TABLE: refused, and the row stays. */
  const out = await d.auth({ flow: 'switch', sid, slug: 'the-studio' });
  assert.equal(out.status, 403);
  assert.deepEqual('refusal' in out && out.refusal, refused);

  on.add(`${record}/${who.body.person}`);
  ok(await d.auth({ flow: 'switch', sid, slug: 'The-Studio' }));
  const kiosk = value<{ record: string }>(d.provision({ slug: 'the-kiosk', email: 'ada@example.com' })).record;
  on.add(`${kiosk}/${who.body.person}`);
  ok(await d.auth({ flow: 'switch', sid, slug: 'THE-KIOSK' }));
  for (const slug of ['the-Kiosk', 'the-studıo', 'ｔhe-studio', 'the-studio\u0000', 'x'.repeat(40)]) {
    const folded = await d.auth({ flow: 'switch', sid, slug });
    assert.equal(folded.status, 403, JSON.stringify(slug));
  }
});

/* ── a request that names its record ──────────────────────────────────── */

test('A SESSION ASKED WITH A SLUG ANSWERS THAT RECORD FOR A MEMBER, the same 403 for everybody else, and writes no row', async () => {
  /* THE BROWSER NOW NAMES ITS RECORD IN THE PATH (`/<slug>/api/…`), and this is the check that runs before the
     Worker addresses anything. It is `switch`'s own question without `switch`'s write: it runs on every request, and
     the Directory is the one writer the whole installation signs in through. */
  const raw = openSqlite();
  const writes: string[] = [];
  const note = (text: string) => {
    if (/^\s*(INSERT|UPDATE|DELETE)\b[\s\S]*\bdir_session\b/i.test(text)) writes.push(text.trim().split(/\s+/).slice(0, 3).join(' '));
  };
  const sql: typeof raw = {
    ...raw,
    exec: (text, ...params) => (note(text), raw.exec(text, ...params)),
    all: (text, ...params) => (note(text), raw.all(text, ...params)),
    one: (text, ...params) => (note(text), raw.one(text, ...params)),
    transactionSync: (fn) => raw.transactionSync(fn),
  };
  const d = createDirectory(sql, fixedClock(NOW), { mac: new Uint8Array(32).fill(7), magic: true, key: { serverKey } });
  const ada = value<{ id: string }>(d.person$('ada@example.com', 'Ada')).id;
  const studio = value<{ record: string }>(d.provision({ slug: 'the-studio', email: 'ada@example.com' })).record;
  const shop = value<{ record: string }>(d.provision({ slug: 'the-shop', email: 'ada@example.com' })).record;
  const gone = value<{ record: string }>(d.provision({ slug: 'the-old-shop', email: 'ada@example.com' })).record;
  value(d.close(gone));
  /* SIGNED IN BEFORE BOB EXISTS, because the server key refuses a Directory with two people in it. */
  const sid = sidOf(await keyIn(d));
  value(d.person$('bob@example.com', 'Bob'));
  value(d.provision({ slug: 'bobs-books', email: 'bob@example.com' }));
  writes.length = 0;

  const named = ok(await d.auth({ flow: 'session', sid, slug: 'the-shop' }));
  assert.deepEqual(named.body, { person: ada, email: 'ada@example.com', record: shop, provedAt: NOW, passkey: false });
  assert.equal(named.session, undefined, 'a named read minted a cookie');
  assert.deepEqual(writes, [], 'asking which record a slug names wrote the session row');
  /* THE ROW STILL SAYS WHERE THE SESSION WAS OPENED, so the bare app goes back there and not to the last tab read. */
  assert.equal(ok(await d.auth({ flow: 'session', sid })).body.record, studio);

  /* SOMEBODY ELSE'S RECORD, A CLOSED ONE, A NAME NOBODY HOLDS, A SPOKEN ID AND GARBAGE: ONE ANSWER, WORD FOR WORD. A
     different sentence for "no such name" would be an oracle for which names exist, readable by anybody signed in. */
  const NOT_ON = { code: 'FORBIDDEN', fix: 'You are not on this BrainDog.' };
  for (const slug of ['bobs-books', 'the-old-shop', 'nobody-here', 'd41', '', 'the-ſhop', 'x'.repeat(40)]) {
    const refused = await d.auth({ flow: 'session', sid, slug });
    assert.equal(refused.status, 403, JSON.stringify(slug));
    assert.deepEqual('refusal' in refused && refused.refusal, NOT_ON, JSON.stringify(slug));
  }
  assert.deepEqual(writes, [], 'a refused slug wrote the session row');

  /* AND A DEAD COOKIE IS STILL THE ONE 401 THAT CLEARS IT, whatever the slug: the slug is asked only of a live session. */
  notYou(await d.auth({ flow: 'session', sid: 'C'.repeat(43), slug: 'the-shop' }), true);
});

test('A NAMED SESSION ON A DAY-OLD COOKIE CARRIES THE ROTATION, on the 200 and on the 403 alike', async () => {
  const { d, clock } = setup();
  const sid = sidOf(await keyIn(d));
  clock.set(NOW + DAY + 1);
  const refused = await d.auth({ flow: 'session', sid, slug: 'somebody-elses' });
  assert.equal(refused.status, 403);
  const next = refused.session;
  if (!next || next === 'clear') return assert.fail('a refused named read dropped the rotation, and the browser keeps an id about to die');
  assert.equal(ok(await d.auth({ flow: 'session', sid: next.sid, slug: 'the-studio' })).session, undefined);
});

/* ── the migration ────────────────────────────────────────────────────── */

test('A DIRECTORY WRITTEN BY VERSION 2 IS BROUGHT FORWARD, and signs its person in', async () => {
  const sql = openSqlite();
  sql.exec(`
    CREATE TABLE dir_person (id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT, created_at TEXT NOT NULL);
    CREATE UNIQUE INDEX dir_person_email ON dir_person(lower(email));
    CREATE TABLE dir_record (id TEXT PRIMARY KEY, owner TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, closed_at TEXT);
    CREATE TABLE dir_slug (slug TEXT PRIMARY KEY, record TEXT NOT NULL, claimed_at TEXT NOT NULL, released_at TEXT);
    CREATE TABLE dir_member (person TEXT NOT NULL, record TEXT NOT NULL, added_at TEXT NOT NULL, PRIMARY KEY (person, record));
    CREATE TABLE dir_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO dir_meta (key, value) VALUES ('version', '2');
    PRAGMA user_version = 2;
  `);
  sql.exec("INSERT INTO dir_person (id, email, created_at) VALUES ('p_ada', 'ada@example.com', '2026-01-01T00:00:00.000Z')");
  sql.exec("INSERT INTO dir_record (id, owner, created_at) VALUES ('rec_old', 'p_ada', '2026-01-01T00:00:00.000Z')");
  sql.exec("INSERT INTO dir_member (person, record, added_at) VALUES ('p_ada', 'rec_old', '2026-01-01T00:00:00.000Z')");

  const config = { mac: new Uint8Array(32).fill(7), magic: false, key: { serverKey } };
  const d = createDirectory(sql, fixedClock(NOW), config);
  assert.equal(DIRECTORY_VERSION, 4);
  assert.equal(sql.one<{ value: string }>("SELECT value FROM dir_meta WHERE key = 'version'")?.value, '4');
  assert.equal(sql.all("SELECT 1 FROM pragma_table_info('dir_person') WHERE name = 'suspended_at'").length, 1, 'suspended_at was not added');
  assert.equal(sql.one<{ plan: string }>("SELECT plan FROM dir_record WHERE id = 'rec_old'")?.plan, 'hosted', 'version 4 did not follow version 3');
  assert.deepEqual(ok(await keyIn(d)).body, { person: 'p_ada', email: 'ada@example.com', record: 'rec_old', provedAt: NOW });

  /* And opening it again runs nothing twice: ADD COLUMN would throw the second time. */
  assert.doesNotThrow(() => createDirectory(sql, fixedClock(NOW), config));
  sql.close();
});

/* ── a shared address ─────────────────────────────────────────────────── */

test('A SELF-HOST AT A FLY.DEV ADDRESS IS REFUSED, and the sentence says the refusal is on purpose', () => {
  const sentence =
    'Passkeys cannot use fly.dev: it is a name many sites share, so any of them could ask for your passkeys. ' +
    'Serve BrainDog at a domain you own and sign in there. This is on purpose, and there is no setting that allows it.';
  assert.equal(sharedSuffix('studio.fly.dev'), sentence);
  assert.throws(
    () => createDirectory(openSqlite(), fixedClock(NOW), { mac: new Uint8Array(32).fill(9), rp: { id: 'studio.fly.dev', origin: 'https://studio.fly.dev' }, magic: true }),
    (e: Error) => e.message === sentence,
  );
});

test('A /64 IS ONE PLACE: walking the addresses of one IPv6 network does not buy more tries', async () => {
  const { d } = setup();
  const hextet = (i: number) => i.toString(16);
  let last = 0;
  for (let i = 1; i <= 11; i++) last = (await keyIn(d, { ip: `2001:db8:0:1::${hextet(i)}`, key: 'wrong' })).status;
  assert.equal(last, 429, 'each address of the network counted as a new one');
});
