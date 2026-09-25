/**
 * A token's reach: what the owner names, when they mint it, beyond the token's scope (parity brief B7, pick P2 in
 * `loop/DIRECTION.md` section 30).
 *
 * WHAT WAS MEASURED BEFORE THIS. The record's inbox gate (d41ec831) admits a whole-record owner token whose principal
 * carries `reach: ['inbox']`, and nothing could ever put it there. `createToken` wrote `{ scope, label, days }` and
 * dropped anything else it was handed, the `token` table had no column to keep it in, and `verifyToken` answered
 * `{ id, person_id, scope }`. A token minted "with the inbox reach" verified exactly like one without it, so the gate
 * was a contract nobody could reach.
 *
 * THE REACH LIVES ON THE TOKEN'S OWN ROW, and the hosts put it on the principal from what `verifyToken` read there. A
 * caller never says what its own token reaches: a reach the bearer could claim in a request would be no grant at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MIGRATIONS } from '../src/migrate.ts';
import { openRecord } from '../src/index.ts';
import { createToken, listTokens, revokeToken, verifyToken, TOKEN_REACHES, type CreateTokenArgs, type TokenDeps } from '../src/token.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 25, 9);
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

/** A migrated record, and the token module's deps over it with a fixed clock and secrets a test can tell apart. */
async function record(): Promise<{ sql: NodeSql; deps: TokenDeps }> {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  let n = 0;
  let r = 0;
  const deps: TokenDeps = {
    sql,
    nowMs: NOW,
    mint: () => `0${(n += 1).toString().padStart(4, '0')}`,
    recordId: () => REC,
    digest: async (text) => `h:${text}`,
    random: (size) => new Uint8Array(size).fill((r += 1)),
  };
  return { sql, deps };
}

const value = <T>(out: unknown): T => {
  const x = out as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const refusal = (out: unknown) => {
  const x = out as { ok: boolean; refusal: { code: string; fix: string; at?: string; allowed?: readonly string[] } };
  assert.equal(x.ok, false, 'this was supposed to be refused');
  return x.refusal;
};

test('THE REACHES ARE A CLOSED LIST, and today it is the inbox and nothing else', () => {
  assert.deepEqual([...TOKEN_REACHES], ['inbox']);
});

test('MIGRATION 15 IS THE ONE THAT ADDS reach TO token, and it is registered where the runner reads it', () => {
  /* THE FILE ALONE IS NOT A MIGRATION. `migrate.ts` imports each one by name, so a file in `migrations/` that nothing
     lists is never applied, and every read of `reach` below would throw "no such column" on a real record. */
  assert.deepEqual(
    MIGRATIONS.map((m) => [m.version, m.slug]).find(([version]) => version === 15),
    [15, 'token_reach'],
  );
});

test('A TOKEN MINTED WITH THE INBOX REACH KEEPS IT: on its row, in the listing, and in what verifyToken answers', async () => {
  const { deps } = await record();
  const minted = value<{ id: string; bearer: string; reach: readonly string[] }>(
    await createToken(deps, 'p_owner', { scope: 'read', label: 'triage agent', reach: ['inbox'] }),
  );
  assert.deepEqual(minted.reach, ['inbox']);

  const listed = listTokens(deps.sql).find((t) => t.id === minted.id);
  assert.deepEqual(listed?.reach, ['inbox'], 'the listing lost the reach, so Settings could not say what the token opens');

  /* THE ONE THE HOSTS READ. This is what goes on the principal, and before it the answer had no `reach` at all. */
  const seen = value<{ id: string; person_id: string; scope: string; reach: readonly string[] }>(await verifyToken(deps, minted.bearer, 'mcp'));
  assert.deepEqual({ ...seen }, { id: minted.id, person_id: 'p_owner', scope: 'read', reach: ['inbox'] });
});

test('AND ONE MINTED WITHOUT IT REACHES NOTHING BEYOND ITS SCOPE, which is every token made before this existed', async () => {
  const { sql, deps } = await record();
  const plain = value<{ id: string; bearer: string; reach: readonly string[] }>(await createToken(deps, 'p_owner', { scope: 'write', label: 'agent' }));
  assert.deepEqual(plain.reach, []);
  assert.deepEqual(value<{ reach: readonly string[] }>(await verifyToken(deps, plain.bearer)).reach, []);

  /* A ROW FROM BEFORE THE COLUMN reads NULL, and NULL is no reach rather than a malformed one. */
  assert.equal(sql.one<{ reach: string | null }>('SELECT reach FROM token WHERE id = ?', plain.id)?.reach, null);
  assert.deepEqual(listTokens(sql)[0]?.reach, []);
});

test('A REACH THE RECORD DOES NOT KNOW IS REFUSED BY NAME, and nothing is minted', async () => {
  const { sql, deps } = await record();
  for (const reach of [['vault'], ['inbox', 'owner'], 'inbox', [1], { inbox: true }]) {
    const out = refusal(await createToken(deps, 'p_owner', { scope: 'read', reach } as unknown as CreateTokenArgs));
    assert.equal(out.at, 'reach', `${JSON.stringify(reach)} was refused somewhere other than reach`);
    assert.deepEqual(out.allowed, ['inbox'], `${JSON.stringify(reach)} did not name the reaches there are`);
  }
  assert.equal(listTokens(sql).length, 0, 'a refused mint left a token behind');
});

test('THE SAME REACH NAMED TWICE IS HELD ONCE, and an empty list is no reach', async () => {
  const { deps } = await record();
  const twice = value<{ reach: readonly string[] }>(await createToken(deps, 'p_owner', { scope: 'read', reach: ['inbox', 'inbox'] }));
  assert.deepEqual(twice.reach, ['inbox']);
  const none = value<{ id: string; reach: readonly string[] }>(await createToken(deps, 'p_owner', { scope: 'read', reach: [] }));
  assert.deepEqual(none.reach, []);
  assert.equal(deps.sql.one<{ reach: string | null }>('SELECT reach FROM token WHERE id = ?', none.id)?.reach, null);
});

test('THE GRANT IS IN THE LEDGER: the access.grant event names the reach beside the scope', async () => {
  /* `field` IS WHAT A GRANT IS ON. A person's level names the list it is held to there; a token's names what it reaches
     beyond its scope, so "who let an agent read the inbox, and when" is one query over the log. */
  const { sql, deps } = await record();
  const granted = value<{ id: string }>(await createToken(deps, 'p_owner', { scope: 'read', label: 'triage', reach: ['inbox'] }));
  const plain = value<{ id: string }>(await createToken(deps, 'p_owner', { scope: 'write', label: 'agent' }));
  const grant = (id: string) =>
    sql.one<{ field: string | null; to_v: string; note: string | null }>(
      "SELECT field, to_v, note FROM event WHERE kind = 'access.grant' AND target = ?",
      `token:${id}`,
    );
  assert.deepEqual({ ...grant(granted.id) }, { field: 'inbox', to_v: 'read', note: 'triage' });
  assert.deepEqual({ ...grant(plain.id) }, { field: null, to_v: 'write', note: 'agent' });
});

test('A REVOKED TOKEN STILL LISTS ITS REACH, and verifies as nothing', async () => {
  const { deps } = await record();
  const minted = value<{ id: string; bearer: string }>(await createToken(deps, 'p_owner', { scope: 'read', reach: ['inbox'] }));
  assert.deepEqual(value<{ reach: readonly string[] }>(revokeToken(deps, 'p_owner', minted.id)).reach, ['inbox']);
  assert.equal(refusal(await verifyToken(deps, minted.bearer)).code, 'FORBIDDEN');
});

test('A COLUMN SOMEBODY WROTE BY HAND IS READ AS NO MORE THAN THE CLOSED LIST ALLOWS', async () => {
  /* THE HOST READS A LIST BACK FROM SQLITE, where it stays text until someone parses it, and the record's gate matches
     on it. A reach this build does not name is dropped here, so no principal ever carries one. */
  const { sql, deps } = await record();
  const minted = value<{ id: string; bearer: string }>(await createToken(deps, 'p_owner', { scope: 'read' }));
  sql.exec(`UPDATE token SET reach = '["inbox","vault"]' WHERE id = ?`, minted.id);
  assert.deepEqual(value<{ reach: readonly string[] }>(await verifyToken(deps, minted.bearer)).reach, ['inbox']);
  assert.throws(() => sql.exec(`UPDATE token SET reach = 'inbox' WHERE id = ?`, minted.id), /CHECK/, 'the column took a reach that is not a list');
});

test('THE KERNEL PASSES THE REACH THROUGH, from the record the hosts call to the row', async () => {
  /* `Kernel.createToken` is what the record's `createToken` calls with its arguments untouched. */
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok(k.createRecord({ id: REC, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } }).ok);
  const args: CreateTokenArgs = { scope: 'read', label: 'triage', reach: ['inbox'] };
  const minted = value<{ bearer: string }>(await k.createToken('p_owner', args));
  assert.deepEqual(value<{ reach: readonly string[] }>(await k.verifyToken(minted.bearer, 'api')).reach, ['inbox']);
  assert.deepEqual(k.listTokens()[0]?.reach, ['inbox']);
});
