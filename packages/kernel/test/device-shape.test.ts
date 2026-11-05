/**
 * The shape reach: a standing grant, approved once with six digits, that takes shape copies and reads nothing
 * else.
 *
 * WHAT "NOTHING ELSE" MEANS HERE. A shape bearer is held as `device_grant.token_hash` on a row of reach `shape`, so the
 * four other readers of a bearer each turn it away: `verifyToken` (the `token` table), `keychainGrant` (reach `keychain`),
 * `operationGrant` (the four ADMIN reaches) and the runner's `runnerGrant` (reach `runner`). `shapeGrant` alone admits
 * it, again and again, until its life runs out or it is revoked.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import { DEFAULT_DAYS, verifyToken, type TokenDeps } from '../src/token.ts';
import { REACHES, deviceApprove, deviceList, devicePoll, deviceRevoke, deviceStart, operationGrant, shapeGrant, keychainGrant, type Exchanged } from '../src/device.ts';
import { runnerGrant } from '../src/jobs.ts';
import { applyMigrations } from '../src/migrate.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const DAY = 86_400_000;
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
  return { sql, clock, deps };
}

const value = <T>(r: Result<T>): T => {
  assert.ok(r.ok, fixOf(r));
  return r.value;
};

/** Asked for, approved with the six digits, and exchanged: the bearer the loop's machine holds. */
async function approved(deps: () => TokenDeps): Promise<Exchanged & { handle: string }> {
  const started = value(await deviceStart(deps(), { reach: 'shape', label: 'studio mac, the loop' }));
  const { handle } = value(await deviceApprove(deps(), OWNER, { user_code: started.user_code }));
  return { ...(value(await devicePoll(deps(), { device_code: started.device_code })) as Exchanged), handle };
}

test('SHAPE IS A REACH A DEVICE MAY ASK FOR, and it carries no scope', async () => {
  const { deps } = await setup();
  assert.ok((REACHES as readonly string[]).includes('shape'));
  const scoped = await deviceStart(deps(), { reach: 'shape', label: 'box', scope: '*' });
  assert.equal(scoped.ok, false, 'a shape grant took a scope');
});

test('A SHAPE GRANT, APPROVED ONCE, IS ADMITTED AGAIN AND AGAIN FOR NINETY DAYS, and each copy is its last use', async () => {
  const { sql, clock, deps } = await setup();
  const grant = await approved(deps);
  assert.equal(grant.reach, 'shape');
  assert.equal(grant.expires, new Date(NOW + DEFAULT_DAYS * DAY).toISOString());
  assert.equal(sql.all('SELECT id FROM token').length, 0, 'a shape grant minted a key');

  const first = value(await shapeGrant(deps(), grant.bearer));
  assert.deepEqual(first, { handle: grant.handle, person: OWNER, expires: grant.expires });
  clock.advance(10 * DAY);
  value(await shapeGrant(deps(), grant.bearer));
  assert.equal(sql.one<{ last_used: string }>('SELECT last_used FROM device_grant')!.last_used, new Date(NOW + 10 * DAY).toISOString());
  assert.equal(sql.one<{ status: string }>('SELECT status FROM device_grant')!.status, 'active', 'a shape grant was spent');

  clock.advance(DEFAULT_DAYS * DAY);
  assert.equal((await shapeGrant(deps(), grant.bearer)).ok, false, 'a shape grant outlived its ninety days');
});

test('A SHAPE GRANT READS NOTHING ELSE: no key door, no keychain, no operation and no runner takes its bearer', async () => {
  const { deps } = await setup();
  const { bearer } = await approved(deps);
  assert.equal((await verifyToken(deps(), bearer)).ok, false, 'the key door took a shape bearer');
  assert.equal((await keychainGrant(deps(), bearer)).ok, false, 'the keychain took a shape bearer');
  assert.equal((await operationGrant(deps(), bearer)).ok, false, 'an operation door took a shape bearer');
  assert.equal((await runnerGrant(deps(), bearer)).ok, false, 'the runner door took a shape bearer');
  /* And it is still whole after all four tried it: none of them spent it. */
  value(await shapeGrant(deps(), bearer));
});

test('NO OTHER GRANT IS A SHAPE GRANT, and a revoked one, a stranger and a suspended approver read the same', async () => {
  const { sql, deps } = await setup();
  const grant = await approved(deps);
  const stranger = await shapeGrant(deps(), `${RECORD}.${'x'.repeat(43)}`);
  assert.equal(stranger.ok, false);

  const keychain = value(await deviceStart(deps(), { reach: 'vault', label: 'box', scope: '*' }));
  value(await deviceApprove(deps(), OWNER, { user_code: keychain.user_code }));
  const keychainBearer = (value(await devicePoll(deps(), { device_code: keychain.device_code })) as Exchanged).bearer;
  assert.deepEqual(await shapeGrant(deps(), keychainBearer), stranger, 'a keychain bearer opened a shape copy');
  assert.deepEqual(await shapeGrant(deps(), `rec_other.${grant.bearer.split('.')[1]}`), stranger, 'another record was admitted');

  sql.exec('UPDATE person SET suspended_at = ? WHERE id = ?', new Date(NOW).toISOString(), OWNER);
  assert.deepEqual(await shapeGrant(deps(), grant.bearer), stranger, 'a suspended approver kept the grant');
  sql.exec('UPDATE person SET suspended_at = NULL WHERE id = ?', OWNER);

  value(await deviceRevoke(deps(), OWNER, grant.handle));
  assert.deepEqual(await shapeGrant(deps(), grant.bearer), stranger, 'a revoked grant was admitted');
  const listed = (await deviceList(deps())).find((r) => r.handle === grant.handle)!;
  assert.deepEqual({ reach: listed.reach, status: listed.status }, { reach: 'shape', status: 'revoked' });
});

test('A SHAPE GRANT STANDS ONLY WHILE ITS APPROVER IS AN OWNER', async () => {
  const { sql, deps } = await setup();
  const { bearer } = await approved(deps);
  assert.ok((await shapeGrant(deps(), bearer)).ok);
  sql.exec('DELETE FROM member WHERE person_id = ?', OWNER);
  assert.equal((await shapeGrant(deps(), bearer)).ok, false);
});
