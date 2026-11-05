/**
 * `ops-revoke` (`53 §5.11` (c) step 3): the operator's cut-off, `TokenDeps.validFrom`.
 *
 * WHAT IS PROVED IS THE KERNEL'S HALF, WHICH IS ALL OF THE RULE. Both hosts read their setting (`TOKENS_VALID_FROM`,
 * `BRAINDOG_TOKENS_VALID_FROM`) and hand it down per call, and every bearer either host takes is checked by one of the
 * readers below: a token by `verifyToken`, an operation by `operationGrant`, a keychain grant by `keychainGrant`. A credential
 * made before the instant is refused in the sentence an unknown one gets, one made at it or after passes, and nothing is
 * written, so an earlier instant gives every one of them back.
 *
 * HERE AND NOT IN `test/`, beside `rehearse.test.ts`, which the kernel's glob for tests under `src` runs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import { deviceApprove, deviceList, devicePoll, deviceStart, operationGrant, keychainGrant, type Exchanged } from '../device.ts';
import { applyMigrations, instant } from '../migrate.ts';
import { createToken, cutOffReadable, listTokens, revokeToken, verifyToken, type TokenDeps } from '../token.ts';
import { fixedClock, openSqlite } from '../../test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 25, 12);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const OWNER = 'p_owner';
/** Obviously not a real record id, and what every bearer here starts with. */
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
  /* BUILT PER CALL, so each call reads the clock as it now stands and carries the cut-off it was asked with. */
  const deps = (validFrom?: string): TokenDeps => ({
    sql,
    nowMs: clock.now(),
    mint: () => `m_${String(++n).padStart(6, '0')}`,
    recordId: () => RECORD,
    digest: sha256,
    random: (size: number) => crypto.getRandomValues(new Uint8Array(size)),
    ...(validFrom === undefined ? {} : { validFrom }),
  });
  /** A device grant of this reach, approved by the owner now and exchanged: the bearer the device holds. */
  const grant = async (reach: string, scope?: string): Promise<string> => {
    const started = value(await deviceStart(deps(), { reach, label: 'test-box', ...(scope === undefined ? {} : { scope }) }));
    value(await deviceApprove(deps(), OWNER, { user_code: started.user_code }));
    return (value(await devicePoll(deps(), { device_code: started.device_code })) as Exchanged).bearer;
  };
  return { sql, clock, deps, grant };
}

const value = <T>(r: Result<T>): T => {
  assert.ok(r.ok, fixOf(r));
  return r.value;
};
const refusalOf = (r: Result<unknown>) => {
  assert.equal(r.ok, false, 'the credential was admitted');
  return !r.ok && 'refusal' in r ? r.refusal : { code: 'conflict', fix: '', at: undefined };
};

test('A TOKEN MADE BEFORE THE CUT-OFF IS NOT ONE THIS RECORD KNOWS, AND ONE MADE AT IT OR AFTER IS', async () => {
  const { clock, deps } = await setup();
  const early = value(await createToken(deps(), OWNER, { scope: 'read' }));
  clock.advance(HOUR);
  const cut = instant(clock.now());
  const atCut = value(await createToken(deps(), OWNER, { scope: 'read' }));
  clock.advance(HOUR);
  const late = value(await createToken(deps(), OWNER, { scope: 'write' }));

  const refused = refusalOf(await verifyToken(deps(cut), early.bearer, 'api'));
  const stranger = refusalOf(await verifyToken(deps(cut), `${RECORD}.nonsense`, 'api'));
  assert.equal(refused.code, 'FORBIDDEN');
  assert.equal(refused.fix, stranger.fix, 'the cut-off told the caller something an unknown bearer is not told');

  assert.equal(value(await verifyToken(deps(cut), atCut.bearer)).id, atCut.id, 'a token made at the instant was refused');
  assert.equal(value(await verifyToken(deps(cut), late.bearer)).id, late.id);

  /* NOTHING WAS WRITTEN: without the cut-off, or with an earlier one, the early token works again. */
  assert.equal(value(await verifyToken(deps(), early.bearer)).id, early.id);
  assert.equal(value(await verifyToken(deps(instant(NOW - HOUR)), early.bearer)).id, early.id);
});

test('AN UNREADABLE CUT-OFF REFUSES EVERY BEARER, A BLANK ONE IS NONE, AND A ZONE IS READ AS A ZONE', async () => {
  const { clock, deps } = await setup();
  clock.advance(HOUR);
  const minted = value(await createToken(deps(), OWNER, { scope: 'read' }));

  for (const said of ['2026-09-25', '2026-09-25T12:00', 'yesterday', '2026-09-25T25:00:00Z']) {
    assert.equal(cutOffReadable(said), false, `${said} was read as an instant`);
    refusalOf(await verifyToken(deps(said), minted.bearer));
  }

  assert.equal(cutOffReadable('   '), true);
  value(await verifyToken(deps('   '), minted.bearer));

  /* 14:00 at an offset of plus one hour is 13:00 in UTC, the moment this token was made, so it passes; a minute later
     it does not. */
  value(await verifyToken(deps('2026-09-25T14:00:00+01:00'), minted.bearer));
  refusalOf(await verifyToken(deps('2026-09-25T14:01:00+01:00'), minted.bearer));
});

test('AN OPERATION GRANT APPROVED BEFORE THE CUT-OFF IS REFUSED UNSPENT, AND ONE APPROVED AFTER IS ADMITTED', async () => {
  const { clock, deps, grant } = await setup();
  const before = await grant('export');
  const cut = instant(NOW + MINUTE);
  clock.advance(2 * MINUTE);
  const after = await grant('import');

  assert.equal(refusalOf(await operationGrant(deps(cut), before)).code, 'FORBIDDEN');
  assert.equal(value(await operationGrant(deps(cut), after)).reach, 'import');
  /* UNSPENT: the operator corrects the instant, and the device that was refused has its one call still. */
  assert.equal(value(await operationGrant(deps(), before)).reach, 'export');
});

test('A KEYCHAIN GRANT APPROVED BEFORE THE CUT-OFF IS REFUSED, AND ONE APPROVED AFTER IS NOT', async () => {
  const { clock, deps, grant } = await setup();
  const before = await grant('vault', '*');
  const cut = instant(NOW + MINUTE);
  clock.advance(2 * MINUTE);
  const after = await grant('vault', '*');

  assert.equal(refusalOf(await keychainGrant(deps(cut), before)).code, 'FORBIDDEN');
  assert.equal(value(await keychainGrant(deps(cut), after)).scope, '*');
  assert.equal(value(await keychainGrant(deps(), before)).scope, '*');
});

test('A CODE APPROVED BEFORE THE CUT-OFF IS NOT EXCHANGED FOR A TOKEN THE CUT-OFF WOULD PASS', async () => {
  const { clock, deps } = await setup();
  const started = value(await deviceStart(deps(), { reach: 'login', label: 'test-box' }));
  value(await deviceApprove(deps(), OWNER, { user_code: started.user_code }));
  clock.advance(2 * MINUTE);
  const cut = instant(NOW + MINUTE);

  assert.equal(refusalOf(await devicePoll(deps(cut), { device_code: started.device_code })).code, 'DEVICE_CODE_EXPIRED');
  /* THE ROW WAS LEFT AS IT WAS, so an earlier instant lets the device finish inside its ten minutes. */
  assert.equal((value(await devicePoll(deps(), { device_code: started.device_code })) as Exchanged).reach, 'login');
});

test("THE OWNER'S LISTS SAY WHICH CREDENTIALS THE OPERATOR ENDED, AND ONLY THOSE", async () => {
  const { sql, clock, deps, grant } = await setup();
  const early = value(await createToken(deps(), OWNER, { scope: 'read' }));
  const gone = value(await createToken(deps(), OWNER, { scope: 'read' }));
  value(revokeToken(deps(), OWNER, gone.id));
  await grant('vault', '*');
  clock.advance(HOUR);
  const cut = instant(clock.now() - MINUTE);
  const late = value(await createToken(deps(), OWNER, { scope: 'read' }));

  const listed = new Map(listTokens(sql, cut).map((t) => [t.id, t]));
  assert.equal(listed.get(early.id)?.ended_by, 'operator');
  assert.equal(listed.get(gone.id)?.ended_by, undefined, 'a token its owner revoked was put down to the operator');
  assert.equal(listed.get(late.id)?.ended_by, undefined);
  assert.ok(listTokens(sql).every((t) => t.ended_by === undefined), 'a listing without the cut-off marked a token');

  const devices = await deviceList(deps(cut));
  assert.deepEqual(devices.map((d) => d.ended_by), ['operator']);
  assert.deepEqual((await deviceList(deps())).map((d) => d.ended_by), [undefined]);
});
