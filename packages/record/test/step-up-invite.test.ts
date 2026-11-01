/**
 * Inviting somebody and minting a token ask a session for a proof in the last fifteen minutes, as deleting the record
 * does.
 *
 * ONLY A SESSION IS ASKED. `provedAt` is set by a host from a session row and nowhere else, so its absence is a caller
 * with no session at all (a self-host's server key, open mode), which both methods answer as before.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';

const MINUTE = 60_000;
const NOW = Date.UTC(2026, 8, 25, 12);

const owner = (provedAt?: number): CallContext => ({
  principal: { kind: 'person', id: 'p_1', level: 'owner' },
  credentialed: true,
  ...(provedAt === undefined ? {} : { provedAt }),
});

const refusalOf = (out: { ok: boolean }): { code: string; fix: string; at?: string } | null =>
  'refusal' in out ? (out as { refusal: { code: string; fix: string; at?: string } }).refusal : null;

test('A SESSION PROVED MORE THAN FIFTEEN MINUTES AGO CANNOT INVITE ANYBODY OR MINT A TOKEN, and is told to sign in again', async () => {
  const api = await createRecordApi({ sql: openSqlite(), clock: { now: () => NOW }, invitations: () => null });
  const stale = owner(NOW - 15 * MINUTE - 1);

  assert.deepEqual(refusalOf(await api.invite({ email: 'bo@example.com', level: 'read' }, stale)), {
    code: 'NEEDS_BROWSER_SESSION',
    fix: 'Sign in again to invite somebody or change what they can do. Nothing was changed.',
    at: 'principal',
  });
  assert.deepEqual(refusalOf(await api.createToken({ scope: 'read', label: 'an agent' }, stale)), {
    code: 'NEEDS_BROWSER_SESSION',
    fix: 'Sign in again to make a token. Nothing was made.',
    at: 'principal',
  });
});

test('A PROOF FIFTEEN MINUTES OLD, OR NO SESSION AT ALL, IS NOT ASKED AGAIN', async () => {
  const api = await createRecordApi({ sql: openSqlite(), clock: { now: () => NOW }, invitations: () => null });
  /* A REAL RECORD WITH `p_1` AS ITS OWNER, so what answers past the step-up is the method's own work. */
  assert.ok((await api.kernel.install([])).ok);
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.com' } }).ok);
  for (const ctx of [owner(NOW - 15 * MINUTE), owner()]) {
    const invited = refusalOf(await api.invite({ email: 'bo@example.com', level: 'read' }, ctx));
    assert.notEqual(invited?.at === 'proof' ? invited.code : null, 'NEEDS_BROWSER_SESSION', 'a recent proof was asked to sign in again');
    const minted = refusalOf(await api.createToken({ scope: 'read', label: 'an agent' }, ctx));
    assert.notEqual(minted?.at === 'proof' ? minted.code : null, 'NEEDS_BROWSER_SESSION', 'a recent proof was asked to sign in again');
  }
});
