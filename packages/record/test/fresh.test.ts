/**
 * The keychain asks a session for a proof in the last fifteen minutes. `12 §6`, `33 §10`.
 *
 * ONLY A SESSION IS ASKED. `provedAt` is set by a host from a session row and nowhere else, so its absence is
 * a caller with no session at all (a self-host's server key, open mode), which the keychain answers as before.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';

const MINUTE = 60_000;

test('THE KEYCHAIN OPENS FOR A PROOF FIFTEEN MINUTES OLD AND NOT A MILLISECOND OLDER', async () => {
  const now = Date.UTC(2026, 8, 5, 12);
  const api = await createRecordApi({ sql: openSqlite(), clock: { now: () => now } });
  const owner = (provedAt?: number): CallContext => ({
    principal: { kind: 'person', id: 'p_1', level: 'owner' },
    credentialed: true,
    ...(provedAt === undefined ? {} : { provedAt }),
  });

  assert.ok((await api.listGrants(owner(now))).ok);
  assert.ok((await api.listGrants(owner(now - 15 * MINUTE))).ok, 'a proof exactly fifteen minutes old was refused');

  const stale = await api.listGrants(owner(now - 15 * MINUTE - 1));
  assert.equal(stale.ok, false);
  assert.deepEqual('refusal' in stale ? stale.refusal : null, { code: 'NEEDS_BROWSER_SESSION', fix: 'Sign in again to open the keychain.', at: 'proof' });

  /* No session, no freshness question. */
  assert.ok((await api.listGrants(owner())).ok);
});

test('somebody who is not an owner is told that, and a token is refused as it always was', async () => {
  const now = Date.UTC(2026, 8, 5, 12);
  const api = await createRecordApi({ sql: openSqlite(), clock: { now: () => now } });

  const reader = await api.listGrants({ principal: { kind: 'person', id: 'p_2', level: 'read' }, provedAt: now - 60 * MINUTE });
  assert.equal(reader.ok, false);
  assert.notEqual('refusal' in reader ? reader.refusal.fix : '', 'Sign in again to open the keychain.');

  const agent = await api.listGrants({ principal: { kind: 'token', id: 't_1', scope: 'write', person: 'p_1', level: 'owner' }, provedAt: now });
  assert.equal(agent.ok, false);
  assert.equal('refusal' in agent ? agent.refusal.code : '', 'NEEDS_BROWSER_SESSION');
  assert.notEqual('refusal' in agent ? agent.refusal.fix : '', 'Sign in again to open the keychain.');
});
