/**
 * Device grants, driven directly against the table (`12-SECURITY` §6.1).
 *
 * What is asserted is the life of one row: asked for, approved by a person, exchanged once for a
 * bearer, and swept when it goes quiet. And the refusals that keep a six-digit code honest: ten
 * minutes, five tries across every waiting row, and a denied row that stays to be read.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import {
  CODE_MS,
  SILENT_MS,
  KEYCHAIN_ALL_DAYS,
  deviceApprove,
  deviceList,
  devicePoll,
  deviceRevoke,
  deviceStart,
  deviceSweep,
  keychainGrant,
  type Exchanged,
} from '../src/device.ts';
import { openRecord, type Declaration } from '../src/index.ts';
import { applyMigrations } from '../src/migrate.ts';
import { verifyToken, type TokenDeps } from '../src/token.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 15, 12);
const DAY = 86_400_000;
const OWNER = 'p_owner';
/** Obviously not a real record id, and what every bearer here starts with. */
const RECORD = 'rec_fake';

const sha256 = async (text: string): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

async function setup(sql: NodeSql = openSqlite()) {
  const clock = fixedClock(NOW);
  if (!sql.one("SELECT 1 AS hit FROM sqlite_master WHERE name = 'device_grant'")) await applyMigrations(sql, clock);
  /* ONLY AN OWNER APPROVES A GRANT, AND ONLY AN OWNER KEEPS ONE STANDING (`APPROVER_STANDING`). */
  sql.exec("INSERT OR IGNORE INTO member (person_id, register, level) VALUES (?, '*', 'owner')", OWNER);
  let n = 0;
  /* THE DEPS ARE BUILT PER CALL, so each call reads the clock as it now stands. */
  const deps = (): TokenDeps => ({
    sql,
    nowMs: clock.now(),
    mint: () => `m_${String(++n).padStart(6, '0')}`,
    recordId: () => RECORD,
    digest: sha256,
    random: (size: number) => crypto.getRandomValues(new Uint8Array(size)),
  });
  return { sql, clock, deps };
}

const value = <T>(r: Result<T>): T => {
  assert.ok(r.ok, fixOf(r));
  return r.value;
};
const refusalOf = (r: Result<unknown>) => {
  assert.equal(r.ok, false, 'the call went through');
  return !r.ok && 'refusal' in r ? r.refusal : { code: 'conflict', fix: '', at: undefined };
};

const grants = (sql: NodeSql) =>
  sql.all<{ status: string; tries: number; reach: string; scope: string | null; expires: string; token_hash: string | null }>(
    'SELECT status, tries, reach, scope, expires, token_hash FROM device_grant ORDER BY rowid',
  );

/** A code that is not the one given, and still six digits. */
const wrong = (code: string): string => String((Number(code) + 1) % 1_000_000).padStart(6, '0');

/* ── the whole walk ──────────────────────────────────────────────────────── */

test('A LOGIN GRANT: asked for, approved, exchanged once for a write token that verifies', async () => {
  const { sql, clock, deps } = await setup();
  const started = value(await deviceStart(deps(), { reach: 'login', label: 'test-box · braindog-cli', ua: 'braindog/0.0.0' }));
  assert.match(started.user_code, /^\d{6}$/);
  assert.equal(started.device_code.length, 43);
  assert.equal(started.interval, 5);
  assert.equal(started.expires, new Date(NOW + CODE_MS).toISOString());

  assert.deepEqual(value(await devicePoll(deps(), { device_code: started.device_code })), { pending: true, interval: 5 });

  clock.advance(60_000);
  const approved = value(await deviceApprove(deps(), OWNER, { user_code: started.user_code }));
  assert.equal(approved.reach, 'login');
  assert.equal(approved.label, 'test-box · braindog-cli');
  assert.match(approved.handle, /^[0-9a-f]{16}$/);
  assert.equal(grants(sql)[0]?.status, 'approved');

  clock.advance(5_000);
  const out = value(await devicePoll(deps(), { device_code: started.device_code })) as Exchanged;
  assert.equal(out.pending, false);
  assert.equal(out.reach, 'login');
  assert.match(out.bearer, /^rec_fake\.[A-Za-z0-9_-]{43}$/);

  const token = sql.one<{ person_id: string; scope: string; label: string; expires_at: string; hash: string }>(
    'SELECT person_id, scope, label, expires_at, hash FROM token',
  );
  assert.deepEqual({ ...token, hash: undefined }, {
    person_id: OWNER,
    scope: 'write',
    label: 'test-box · braindog-cli',
    expires_at: new Date(clock.now() + 90 * DAY).toISOString(),
    hash: undefined,
  });
  const [row] = grants(sql);
  assert.equal(row?.status, 'active');
  assert.equal(row?.expires, token?.expires_at);
  assert.equal(row?.token_hash, token?.hash, 'the grant does not point at the token it minted');
  assert.equal(value(await verifyToken(deps(), out.bearer)).person_id, OWNER);

  /* AND ONCE. A second poll with the same id is refused, and mints nothing. */
  assert.equal(refusalOf(await devicePoll(deps(), { device_code: started.device_code })).code, 'FORBIDDEN');
  assert.equal(sql.all('SELECT id FROM token').length, 1);
  sql.close();
});

/* ── ten minutes ─────────────────────────────────────────────────────────── */

test('AFTER TEN MINUTES THE CODE IS EXPIRED, whether it was waiting or approved and never collected', async () => {
  const { sql, clock, deps } = await setup();
  const waiting = value(await deviceStart(deps(), { reach: 'login', label: 'slow-box' }));
  const collected = value(await deviceStart(deps(), { reach: 'login', label: 'forgetful-box' }));
  value(await deviceApprove(deps(), OWNER, { user_code: collected.user_code }));

  clock.advance(CODE_MS);
  const late = refusalOf(await devicePoll(deps(), { device_code: waiting.device_code }));
  assert.deepEqual([late.code, late.at], ['DEVICE_CODE_EXPIRED', 'device_code']);
  assert.equal(refusalOf(await devicePoll(deps(), { device_code: collected.device_code })).code, 'DEVICE_CODE_EXPIRED');
  assert.equal(refusalOf(await deviceApprove(deps(), OWNER, { user_code: waiting.user_code })).code, 'FORBIDDEN');
  assert.deepEqual(grants(sql).map((g) => g.status), ['expired', 'expired']);
  assert.equal(sql.all('SELECT id FROM token').length, 0);
  sql.close();
});

/* ── five tries ──────────────────────────────────────────────────────────── */

test('FIVE WRONG CODES DENY EVERY WAITING ROW, and a denied row is kept for good', async () => {
  const { sql, clock, deps } = await setup();
  const first = value(await deviceStart(deps(), { reach: 'login', label: 'mine' }));
  const second = value(await deviceStart(deps(), { reach: 'runner', label: 'not mine' }));
  const guess = wrong(first.user_code) === second.user_code ? wrong(second.user_code) : wrong(first.user_code);

  /* A malformed entry spends nothing. */
  assert.equal(refusalOf(await deviceApprove(deps(), OWNER, { user_code: '12345' })).code, 'VALUE_MALFORMED');
  assert.deepEqual(grants(sql).map((g) => g.tries), [0, 0]);

  for (let i = 1; i <= 4; i++) {
    const miss = refusalOf(await deviceApprove(deps(), OWNER, { user_code: guess }));
    assert.deepEqual([miss.code, miss.at], ['FORBIDDEN', 'user_code']);
    assert.deepEqual(grants(sql).map((g) => g.tries), [i, i], 'a miss did not cost every pending row');
  }
  const fifth = refusalOf(await deviceApprove(deps(), OWNER, { user_code: guess }));
  assert.deepEqual([fifth.code, fifth.at], ['DEVICE_CODE_TRIES', 'user_code']);
  assert.deepEqual(grants(sql).map((g) => g.status), ['denied', 'denied']);

  /* The right code no longer approves anything, and the device hears why. */
  assert.equal(refusalOf(await deviceApprove(deps(), OWNER, { user_code: first.user_code })).code, 'FORBIDDEN');
  assert.equal(refusalOf(await devicePoll(deps(), { device_code: first.device_code })).code, 'DEVICE_CODE_TRIES');

  /* KEPT. A month of sweeps leaves both rows saying they were denied. */
  for (let d = 0; d < 30; d++) {
    clock.advance(DAY);
    deviceSweep(deps());
  }
  assert.deepEqual(grants(sql).map((g) => g.status), ['denied', 'denied']);
  assert.deepEqual(
    (await deviceList(deps())).map((g) => `${g.label}:${g.status}`).sort(),
    ['mine:denied', 'not mine:denied'],
  );
  sql.close();
});

/* ── fourteen silent days ────────────────────────────────────────────────── */

test('A GRANT SILENT FOR FOURTEEN DAYS IS DEREGISTERED, and its token stops working', async () => {
  const { sql, clock, deps } = await setup();
  const started = value(await deviceStart(deps(), { reach: 'login', label: 'quiet-box' }));
  value(await deviceApprove(deps(), OWNER, { user_code: started.user_code }));
  const { bearer } = value(await devicePoll(deps(), { device_code: started.device_code })) as Exchanged;

  clock.advance(13 * DAY);
  assert.equal(deviceSweep(deps()), 0);
  value(await verifyToken(deps(), bearer));

  /* USE THROUGH THE TOKEN COUNTS: thirteen more days is thirteen since it last spoke. */
  clock.advance(13 * DAY);
  assert.equal(deviceSweep(deps()), 0);
  assert.equal(grants(sql)[0]?.status, 'active');

  clock.advance(SILENT_MS - 13 * DAY + 1);
  assert.equal(deviceSweep(deps()), 1);
  assert.equal(grants(sql)[0]?.status, 'expired');
  assert.ok(sql.one<{ revoked_at: string | null }>('SELECT revoked_at FROM token')?.revoked_at, 'the token outlived its device');
  assert.equal(refusalOf(await verifyToken(deps(), bearer)).code, 'FORBIDDEN');
  sql.close();
});

/* ── revoking one ────────────────────────────────────────────────────────── */

test('A GRANT IS REVOKED BY ITS HANDLE, takes its token with it, and a second revoke says the same', async () => {
  const { sql, deps } = await setup();
  const started = value(await deviceStart(deps(), { reach: 'login', label: 'lost-laptop' }));
  value(await deviceApprove(deps(), OWNER, { user_code: started.user_code }));
  const { bearer } = value(await devicePoll(deps(), { device_code: started.device_code })) as Exchanged;

  const [listed] = await deviceList(deps());
  assert.ok(listed);
  assert.equal(JSON.stringify(listed).includes(started.device_code), false, 'a listing shows the poll id');
  assert.equal('code_hash' in listed || 'token_hash' in listed, false);

  assert.equal(value(await deviceRevoke(deps(), OWNER, listed.handle)).status, 'revoked');
  assert.equal(refusalOf(await verifyToken(deps(), bearer)).code, 'FORBIDDEN');
  assert.equal(value(await deviceRevoke(deps(), OWNER, listed.handle)).status, 'revoked');
  assert.equal(refusalOf(await deviceRevoke(deps(), OWNER, '0000000000000000')).code, 'OUT_OF_BOUNDS');
  assert.deepEqual(
    sql.all<{ kind: string; target_kind: string }>("SELECT kind, target_kind FROM event WHERE target_kind = 'device_grant' ORDER BY rowid").map((e) => e.kind),
    ['access.grant', 'access.revoke'],
  );
  sql.close();
});

/* ── the keychain reach ─────────────────────────────────────────────────────── */

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: {
    id: 'things',
    name: 'Projects',
    title: 'name',
    scopes: { repos: 'repos' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'repos', type: 'list', of: 'text' },
    ],
  },
};

test('A KEYCHAIN GRANT NAMES ITS SCOPE, mints no token, and its bearer is checked by keychainGrant alone', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([PROJECTS]));
  const project = value(k.create('things', { name: 'BrainDog' }, { actor: OWNER }));
  const { deps } = await setup(sql);

  assert.equal(refusalOf(await deviceStart(deps(), { reach: 'vault', label: 'box' })).code, 'REQUIRED_MISSING');
  assert.equal(refusalOf(await deviceStart(deps(), { reach: 'login', label: 'box', scope: '*' })).code, 'OUT_OF_BOUNDS');
  /* NOBODY IS SIGNED IN AT THE START, so a name that is no project reads as one that is, and only the approval says so. */
  const stranger = value(await deviceStart(deps(), { reach: 'vault', label: 'box', scope: 'not-a-project' }));
  assert.equal(refusalOf(await deviceApprove(deps(), OWNER, { user_code: stranger.user_code })).code, 'REF_UNKNOWN');
  value(await deviceRevoke(deps(), OWNER, (await deviceList(deps()))[0]!.handle));
  assert.equal(refusalOf(await deviceStart(deps(), { reach: 'admin', label: 'box' })).code, 'ENUM_VALUE_UNKNOWN');

  const scoped = value(await deviceStart(deps(), { reach: 'vault', label: 'box', scope: project.id }));
  const approved = value(await deviceApprove(deps(), OWNER, { user_code: scoped.user_code }));
  assert.deepEqual([approved.reach, approved.scope], ['vault', project.id]);
  /* `keychain` is accepted as the reach and stored as `vault`. */
  const named = value(await deviceStart(deps(), { reach: 'keychain', label: 'box2', scope: project.id }));
  assert.equal(value(await deviceApprove(deps(), OWNER, { user_code: named.user_code })).reach, 'vault');
  const out = value(await devicePoll(deps(), { device_code: scoped.device_code })) as Exchanged;
  assert.equal(out.scope, project.id);
  assert.equal(sql.all('SELECT id FROM token').length, 0, 'a keychain grant minted a token');
  assert.equal(refusalOf(await verifyToken(deps(), out.bearer)).code, 'FORBIDDEN');

  const grant = value(await keychainGrant(deps(), out.bearer));
  assert.deepEqual([grant.scope, grant.person, grant.handle], [project.id, OWNER, approved.handle]);

  const everything = value(await deviceStart(deps(), { reach: 'vault', label: 'box', scope: '*' }));
  value(await deviceApprove(deps(), OWNER, { user_code: everything.user_code }));
  const wide = value(await devicePoll(deps(), { device_code: everything.device_code })) as Exchanged;
  assert.equal(wide.expires, new Date(NOW + KEYCHAIN_ALL_DAYS * DAY).toISOString());

  /* A login bearer is not a keychain grant, and a revoked keychain grant opens nothing. */
  const login = value(await deviceStart(deps(), { reach: 'login', label: 'box' }));
  value(await deviceApprove(deps(), OWNER, { user_code: login.user_code }));
  const token = value(await devicePoll(deps(), { device_code: login.device_code })) as Exchanged;
  assert.equal(refusalOf(await keychainGrant(deps(), token.bearer)).code, 'FORBIDDEN');
  value(await deviceRevoke(deps(), OWNER, grant.handle));
  assert.equal(refusalOf(await keychainGrant(deps(), out.bearer)).code, 'FORBIDDEN');
  assert.equal(refusalOf(await keychainGrant(deps(), `rec_other.${out.bearer.split('.')[1]}`)).code, 'FORBIDDEN');
  sql.close();
});

/* ── nothing in the clear ────────────────────────────────────────────────── */

test('NO USER CODE AND NO BEARER IS IN ANY TABLE, only their hashes', async () => {
  const { sql, deps } = await setup();
  const said: string[] = [];
  for (const reach of ['login', 'runner', 'pack'] as const) {
    const started = value(await deviceStart(deps(), { reach, label: `${reach}-box` }));
    value(await deviceApprove(deps(), OWNER, { user_code: started.user_code }));
    const out = value(await devicePoll(deps(), { device_code: started.device_code })) as Exchanged;
    said.push(started.user_code, out.bearer, out.bearer.split('.')[1]!);
    assert.equal(
      sql.one<{ code_hash: string }>('SELECT code_hash FROM device_grant WHERE id = ?', started.device_code)?.code_hash,
      await sha256(`${started.device_code}:${started.user_code}`),
    );
  }
  const everything = JSON.stringify(
    sql
      .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .map((t) => sql.all(`SELECT * FROM "${t.name}"`)),
  );
  for (const secret of said) assert.equal(everything.includes(secret), false, 'a code or a bearer was stored in the clear');
  sql.close();
});

/* ── one code, one waiting device ────────────────────────────────────────── */

test('A CODE IS NEVER SHARED BY TWO WAITING DEVICES: a draw that matches one is drawn again, and the owner approves only their own', async () => {
  const { deps } = await setup();
  /* EVERY FOUR-BYTE DRAW IS ZERO UNTIL TOLD OTHERWISE, so the second device first draws the code the first holds. */
  let fresh = false;
  const fixed = (): TokenDeps => ({
    ...deps(),
    random: (size: number) => (size === 4 && !fresh ? new Uint8Array(4) : crypto.getRandomValues(new Uint8Array(size))),
  });
  const stranger = value(await deviceStart(fixed(), { reach: 'login', label: 'not yours' }));
  assert.equal(stranger.user_code, '000000');
  let draws = 0;
  const second = value(
    await deviceStart({ ...fixed(), random: (size: number) => (size === 4 && draws++ === 0 ? new Uint8Array(4) : crypto.getRandomValues(new Uint8Array(size))) }, { reach: 'login', label: 'my terminal' }),
  );
  assert.notEqual(second.user_code, stranger.user_code, 'the second device was handed a code another waiting device holds');
  fresh = true;
  assert.equal(value(await deviceApprove(deps(), OWNER, { user_code: second.user_code })).label, 'my terminal');
  assert.equal((value(await devicePoll(deps(), { device_code: stranger.device_code })) as { pending?: boolean }).pending, true);
});

test('A KEYCHAIN GRANT STANDS ONLY WHILE ITS APPROVER IS AN OWNER: made less than one, or taken off, it opens nothing', async () => {
  const { sql, deps } = await setup();
  const started = value(await deviceStart(deps(), { reach: 'vault', scope: '*', label: 'test-box' }));
  value(await deviceApprove(deps(), OWNER, { user_code: started.user_code }));
  const bearer = (value(await devicePoll(deps(), { device_code: started.device_code })) as Exchanged).bearer;
  assert.ok((await keychainGrant(deps(), bearer)).ok);

  sql.exec("UPDATE member SET level = 'decide' WHERE person_id = ?", OWNER);
  assert.equal(refusalOf(await keychainGrant(deps(), bearer)).code, 'FORBIDDEN');

  sql.exec('DELETE FROM member WHERE person_id = ?', OWNER);
  assert.equal(refusalOf(await keychainGrant(deps(), bearer)).code, 'FORBIDDEN');
});

test('STRANGERS CANNOT FILL THE TABLE: only so many wait at once, and what nobody approved goes a week after it lapsed', async () => {
  const { sql, clock, deps } = await setup();
  for (let i = 0; i < 200; i++) value(await deviceStart(deps(), { reach: 'login', label: `box ${i}` }));
  assert.equal(refusalOf(await deviceStart(deps(), { reach: 'login', label: 'one more' })).code, 'RATE_LIMITED');
  clock.advance(8 * DAY);
  value(await deviceStart(deps(), { reach: 'login', label: 'a week on' }));
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM device_grant')?.n, 1);
});
