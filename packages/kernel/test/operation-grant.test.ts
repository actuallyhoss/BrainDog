/**
 * An operation grant: a device grant of reach `export`, `import`, `pack` or `token`, checked for the one ADMIN call it
 * was approved for (`12-SECURITY` §6.1, `30 §10`).
 *
 * WHAT WAS MEASURED BEFORE THIS EXISTED. The kernel accepted a device start with reach `import`, an owner approved it,
 * and the exchange handed the device a bearer that lived ten minutes (`lifeMs`). Nothing read it again: the only reader
 * of `device_grant.token_hash` was `keychainGrant`, which matches `reach = 'vault'` alone, so the CLI could be given a
 * bearer for an import that no door in either host would take.
 *
 * SPENT ON FIRST USE, and the second presentation is told what a stranger's bearer is told, so a replayed request and a
 * guessed one read the same.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import { CODE_MS, deviceApprove, devicePoll, deviceStart, operationGrant, keychainGrant, type Exchanged } from '../src/device.ts';
import { applyMigrations } from '../src/migrate.ts';
import { verifyToken, type TokenDeps } from '../src/token.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);
const OWNER = 'p_owner';
const RECORD = 'rec_fake';

const sha256 = async (text: string): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');

async function setup() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  await applyMigrations(sql, clock);
  sql.exec("INSERT INTO person (id, email, name) VALUES (?, 'ada@example.com', 'Ada')", OWNER);
  /* ONLY AN OWNER APPROVES A GRANT, AND ONLY AN OWNER KEEPS ONE STANDING (`APPROVER_STANDING`). */
  sql.exec("INSERT INTO member (person_id, register, level) VALUES (?, '*', 'owner')", OWNER);
  let n = 0;
  const deps = (): TokenDeps => ({
    sql,
    nowMs: clock.now(),
    mint: () => `m_${String(++n).padStart(6, '0')}`,
    recordId: () => RECORD,
    digest: sha256,
    random: (size: number) => crypto.getRandomValues(new Uint8Array(size)),
  });
  /** A grant of this reach, approved by the owner and exchanged: the bearer the device holds. */
  const bearerFor = async (reach: string, scope?: string): Promise<string> => {
    const started = value(await deviceStart(deps(), { reach, label: 'test-box · braindog-cli', ...(scope === undefined ? {} : { scope }) }));
    value(await deviceApprove(deps(), OWNER, { user_code: started.user_code }));
    return (value(await devicePoll(deps(), { device_code: started.device_code })) as Exchanged).bearer;
  };
  return { sql, clock, deps, bearerFor };
}

const value = <T>(r: Result<T>): T => {
  assert.ok(r.ok, fixOf(r));
  return r.value;
};
const refusalOf = (r: Result<unknown>) => {
  assert.equal(r.ok, false, 'the grant was admitted');
  return !r.ok && 'refusal' in r ? r.refusal : { code: 'conflict', fix: '', at: undefined };
};

test('AN IMPORT GRANT, APPROVED AND EXCHANGED, IS ADMITTED ONCE FOR IMPORT, AND THE SECOND USE READS AS A STRANGER', async () => {
  const { sql, deps, bearerFor } = await setup();
  const bearer = await bearerFor('import');

  const first = value(await operationGrant(deps(), bearer));
  assert.deepEqual({ ...first, handle: undefined }, { handle: undefined, reach: 'import', method: 'import', person: OWNER, binds: null });
  assert.match(first.handle, /^[0-9a-f]{16}$/);

  /* The mutation this holds: a grant that is not spent admits twice. */
  const again = refusalOf(await operationGrant(deps(), bearer));
  const stranger = refusalOf(await operationGrant(deps(), `${RECORD}.${'x'.repeat(43)}`));
  assert.deepEqual(again, stranger, 'a spent grant was told something a guessed one is not');
  assert.equal(again.code, 'FORBIDDEN');

  const row = sql.one<{ status: string; expires: string; last_used: string }>('SELECT status, expires, last_used FROM device_grant');
  assert.deepEqual({ ...row }, { status: 'expired', expires: new Date(NOW).toISOString(), last_used: new Date(NOW).toISOString() });
});

test('EACH REACH NAMES ITS ONE METHOD, and a keychain or login bearer is no operation grant', async () => {
  const { deps, bearerFor } = await setup();
  for (const [reach, method] of [['export', 'export'], ['import', 'import'], ['pack', 'installPack'], ['token', 'createToken']] as const)
    assert.equal(value(await operationGrant(deps(), await bearerFor(reach))).method, method, reach);

  /* A keychain grant needs a scope, and `*` needs no project row. */
  const keychain = await bearerFor('vault', '*');
  assert.equal(refusalOf(await operationGrant(deps(), keychain)).code, 'FORBIDDEN');
  assert.ok((await keychainGrant(deps(), keychain)).ok, 'the keychain grant stopped working as one');

  const login = await bearerFor('login');
  assert.equal(refusalOf(await operationGrant(deps(), login)).code, 'FORBIDDEN');
  assert.ok((await verifyToken(deps(), login, 'api')).ok);

  /* And the other way round: an operation bearer opens no key. */
  assert.equal(refusalOf(await keychainGrant(deps(), await bearerFor('export'))).code, 'FORBIDDEN');
});

test('PAST ITS TEN MINUTES, FOR ANOTHER RECORD, OR APPROVED BY SOMEBODY SINCE SUSPENDED, IT IS REFUSED IN THE SAME WORDS', async () => {
  const { sql, clock, deps, bearerFor } = await setup();

  const late = await bearerFor('export');
  clock.advance(CODE_MS);
  const expired = refusalOf(await operationGrant(deps(), late));

  const elsewhere = await bearerFor('export');
  const moved = refusalOf(await operationGrant(deps(), `rec_other.${elsewhere.slice(RECORD.length + 1)}`));
  assert.ok((await operationGrant(deps(), elsewhere)).ok, 'a bearer for another record spent this one');

  const suspended = await bearerFor('import');
  sql.exec('UPDATE person SET suspended_at = ? WHERE id = ?', new Date(clock.now()).toISOString(), OWNER);
  const stopped = refusalOf(await operationGrant(deps(), suspended));

  assert.deepEqual(expired, moved);
  assert.deepEqual(expired, stopped);
  assert.deepEqual(refusalOf(await operationGrant(deps(), 'no-dot-at-all')), expired);
});

/* A GRANT NAMES THE ONE REQUEST IT IS FOR. It named only its method, so a `token` grant minted any scope, life and reach,
   and an `import` grant took any file, while the approver saw only the word. Started with `binds` (the body's SHA-256),
   the grant carries it to the host that spends it, which refuses any other body; only an operation may name one. */
test('AN OPERATION GRANT STARTED FOR ONE BODY CARRIES THAT BODY’S HASH TO THE HOST, and only an operation may name one', async () => {
  const { deps } = await setup();
  const body = JSON.stringify({ scope: 'read', label: 'laptop', days: 30 });
  const binds = await sha256(body);
  const started = value(await deviceStart(deps(), { reach: 'token', label: 'test-box · braindog-cli · token', binds }));
  value(await deviceApprove(deps(), OWNER, { user_code: started.user_code }));
  const bearer = (value(await devicePoll(deps(), { device_code: started.device_code })) as Exchanged).bearer;
  const grant = value(await operationGrant(deps(), bearer));
  assert.equal(grant.method, 'createToken');
  assert.equal(grant.binds, binds);

  assert.equal(refusalOf(await deviceStart(deps(), { reach: 'login', label: 'test-box', binds })).at, 'binds');
  assert.equal(refusalOf(await deviceStart(deps(), { reach: 'token', label: 'test-box', binds: 'not-a-hash' })).at, 'binds');
  assert.equal(refusalOf(await deviceStart(deps(), { reach: 'token', label: 'test-box', binds: binds.toUpperCase() })).at, 'binds');
});
