/**
 * A key renamed on the Keys screen is found by its new name when a poll that names it is accepted.
 *
 * MEASURED ON HIS RECORD BEFORE THE REPAIR: credentials#133 was put away by an agent as "sketchpad-metrics (vault)" and
 * renamed by him to "sketchpad-metrics". `braindog keys list` said "sketchpad-metrics", live and sealed, and accepting
 * SG380, a pattern whose poll sends the key "sketchpad-metrics", was refused "Add the key called "sketchpad-metrics" to
 * the keychain, then accept." The row's name changed and the grant's label, which every lookup reads, did not. A retired
 * row of the same name (an old import, its grant revoked) sat beside it. The agent's answer on his word reaches the
 * kernel as his own decide, so the owner's accept here is that path.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 10, 3, 9);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

const NUMBERS: Declaration = {
  id: 'register.numbers',
  kind: 'register',
  body: { id: 'numbers', name: 'Numbers', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

const CREDENTIALS: Declaration = {
  id: 'register.credentials',
  kind: 'register',
  body: {
    id: 'credentials',
    name: 'Keys',
    title: 'label',
    fields: [
      { id: 'label', type: 'text', required: true },
      { id: 'opens', type: 'text' },
      { id: 'value', type: 'secret' },
      { id: 'state', type: 'enum', values: ['live', 'retired'], index: true },
    ],
  } as never,
};

/** The poll SG380 installs: plays and servers from the admin site every day, on the key "sketchpad-metrics". */
const POLL = {
  id: 'ingest.sketchpad',
  kind: 'ingest',
  body: { ingest: 'sketchpad', channel: 'poll', url: 'https://admin.sketchpad.com/api/metrics', every: '1d', grant: 'sketchpad-metrics', extract: { what: { after: 'plays ' } }, writes: { register: 'numbers' } },
};

const SEALED = (label: string) => ({ label, opens: 'admin.sketchpad.com', kind: 'api_token' as const, ciphertext: new Uint8Array([1, 2]), nonce: new Uint8Array([9]), kdf: 'hkdf', wrapped_by: 'kek' as const, kek_id: 'kek_2f' });

const value = <T>(r: Result<T>): T => {
  assert.ok(r.ok, fixOf(r));
  return r.value;
};

async function record(): Promise<{ k: Kernel; sql: NodeSql; live: string; grant: string }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok(k.createRecord({ id: ID, slug: 'sami', name: 'Sami', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  assert.ok((await k.install([NUMBERS, CREDENTIALS])).ok);
  /* THE OLD IMPORT: a row of the same name, retired, whose grant is gone. */
  const old = value(k.depositGrant({ register: 'credentials', field: 'value', fields: { label: 'sketchpad-metrics', opens: 'admin.sketchpad.com', state: 'retired' }, grant: SEALED('sketchpad-metrics') }, { actor: 'p_1' }));
  value(k.revokeGrant(old.grant.id, 'p_1'));
  /* THE LIVE KEY, put away by an agent under the name it gave, and renamed by him. */
  const live = value(k.depositGrant({ register: 'credentials', field: 'value', fields: { label: 'sketchpad-metrics (vault)', opens: 'admin.sketchpad.com', state: 'live' }, grant: SEALED('sketchpad-metrics (vault)') }, { actor: 'S678' }));
  value(k.update('credentials', live.entry.id, { label: 'sketchpad-metrics' }, { actor: 'p_1' }) as Result<unknown>);
  return { k, sql, live: live.entry.id, grant: live.grant.id };
}

const file = (k: Kernel, ingest: Record<string, unknown>): string => {
  const out = k.propose({ question: "Read Sketchpad's plays and Discord servers every day at 09:00 into Numbers?", body_kind: 'pattern', body: { ingest, samples: ['raw_1'] } }, 'S959');
  assert.ok(out.ok, fixOf(out));
  return (out.value as { id: string }).id;
};

const accept = (k: Kernel, id: string) => k.decide(id, { decide: { option: 'accept', reason: 'Sami told S959: "accept it"' } }, 'p_1');

test('A KEY RENAMED ON THE KEYS SCREEN IS FOUND BY ITS NEW NAME, and the poll that names it is accepted', async () => {
  const { k, sql, grant } = await record();
  assert.equal(sql.one<{ label: string }>('SELECT label FROM grant WHERE id = ?', grant)?.label, 'sketchpad-metrics', 'the grant kept the name it was put away under');
  const id = file(k, POLL);
  const out = accept(k, id);
  assert.ok(out.ok, `refused: ${fixOf(out)}`);
  assert.equal(k.governanceRow('suggestion', id)?.status, 'resolved');
  sql.close();
});

test('A KEY THAT IS NOT IN THE KEYCHAIN IS STILL REFUSED, and a revoked one under the same name counts as none', async () => {
  const { k, sql, grant } = await record();
  const missing = accept(k, file(k, { ...POLL, body: { ...POLL.body, grant: 'nobody-put-this' } }));
  assert.equal(missing.ok, false, 'a poll whose key is missing was armed');
  if (!missing.ok && 'refusal' in missing) assert.equal(missing.refusal.code, 'REQUIRED_MISSING');

  /* THE LIVE ONE REVOKED, only the retired row's dead grant and the revoked one answer to the name. */
  value(k.revokeGrant(grant, 'p_1'));
  const gone = accept(k, file(k, POLL));
  assert.equal(gone.ok, false, 'a poll was accepted on a key whose every grant is revoked');
  if (!gone.ok && 'refusal' in gone) assert.match(gone.refusal.fix, /"sketchpad-metrics"/u);
  sql.close();
});

test('A ROW RENAMED BEFORE THIS EXISTED IS HEALED BY ITS NEXT WRITE, and a renamed key no longer answers to its old name', async () => {
  const { k, sql, live, grant } = await record();
  /* AS HIS RECORD HOLDS IT: the row says the new name and the grant still the old. */
  sql.exec('UPDATE grant SET label = ? WHERE id = ?', 'sketchpad-metrics (vault)', grant);
  value(k.update('credentials', live, { opens: 'admin.sketchpad.com' }, { actor: 'p_1' }) as Result<unknown>);
  assert.equal(sql.one<{ label: string }>('SELECT label FROM grant WHERE id = ?', grant)?.label, 'sketchpad-metrics');
  assert.ok(accept(k, file(k, POLL)).ok);

  const old = accept(k, file(k, { ...POLL, id: 'ingest.sketchpad_old', body: { ...POLL.body, ingest: 'sketchpad_old', grant: 'sketchpad-metrics (vault)' } }));
  assert.equal(old.ok, false, 'the old name still opened the renamed key');
  sql.close();
});
