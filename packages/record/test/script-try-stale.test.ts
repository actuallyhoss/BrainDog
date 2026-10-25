/**
 * What the record tells a host about a trial's caller: `owner` when the keychain's own gate would let them in, and `stale`
 * when the one thing keeping it shut is a proof older than fifteen minutes.
 *
 * WHAT WAS MEASURED. `scriptTry` said `owner` on `level === 'owner'` alone, and the keychain asks one thing more. On the
 * self-host a session proved two hours ago was planted: the keychain refused it `listGrants` with `NEEDS_BROWSER_SESSION`,
 * and the same cookie's trial sent a request carrying the owner's key and left a `grant.read` in her name. The host
 * builds a trial's `grantOf` from `owner`, so the record's word is the whole gate, and this holds it to `keychain()`'s
 * answer. The HTTP join is `apps/selfhost/test/script-try-asker.test.ts`.
 *
 * NOT `keychain() === null` ALONE, because `allows` lets `system` through everything and `keychain` refuses only tokens, so a
 * `system` caller would have been handed the key that the line before this change kept from it. The last case holds
 * that.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext, type RecordDeps } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);
const MINUTE = 60_000;
const BODY = { script: 'peek', runs: { every: '1h' }, egress: [], keys: [], reads: [], writes: [], source: 'export default async function run() { return null; }' };

type Draft = Parameters<NonNullable<RecordDeps['tryScript']>>[0];

/** What the host was handed for this caller, as `{ owner, stale }`. */
async function handed(ctx: CallContext): Promise<{ owner: boolean; stale: unknown }> {
  let seen: Draft | null = null;
  const sql = openSqlite();
  const api = await createRecordApi({
    sql,
    clock: fixedClock(NOW),
    tryScript: async (d) => {
      seen = d;
      return null;
    },
  });
  const out = (await api.scriptTry({ body: BODY }, ctx)) as { ok: boolean };
  assert.ok(out.ok, JSON.stringify(out));
  sql.close();
  const d = seen as Draft | null;
  assert.ok(d, 'the host was never asked');
  return { owner: d.owner, stale: (d as { stale?: unknown }).stale };
}

const person = (level: 'owner' | 'decide', provedAt?: number): CallContext => ({
  principal: { kind: 'person', id: 'p_1', level },
  ...(provedAt === undefined ? {} : { provedAt }),
});

test('AN OWNER WHOSE PROOF IS TWO HOURS OLD IS NOT HANDED THE KEYCHAIN, and the host is told the proof is why', async () => {
  assert.deepEqual(await handed(person('owner', NOW - 120 * MINUTE)), { owner: false, stale: true });
});

test('AN OWNER PROVED A MINUTE AGO, OR WITH NO SESSION TO AGE, IS HANDED IT', async () => {
  assert.deepEqual(await handed(person('owner', NOW - MINUTE)), { owner: true, stale: false });
  assert.deepEqual(await handed(person('owner')), { owner: true, stale: false });
});

test('NOBODY ELSE IS HANDED IT, AND NOBODY ELSE IS TOLD TO SIGN IN AGAIN: a member, a token at owner, and system', async () => {
  assert.deepEqual(await handed(person('decide', NOW - MINUTE)), { owner: false, stale: false });
  const token: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'propose', person: 'p_1', level: 'owner' } };
  assert.deepEqual(await handed(token), { owner: false, stale: false });
  assert.deepEqual(await handed({ principal: { kind: 'system', id: 'system' } }), { owner: false, stale: false });
});
