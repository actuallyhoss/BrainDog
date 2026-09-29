/**
 * A root key rotation on the Worker, walked through the Worker's own code over a real record (`53 §5.6`).
 *
 * WHAT RUNS HERE IS THE HOST'S CODE, NOT A COPY OF IT. `keyStoreOf` reads `KEK` holding the new key, a space and the old
 * one; `keyOpener` offers `openGrant` the id the record is wrapped under through `offeredId` and opens the sealed bytes;
 * `rewrapRecord` unwraps under the old key, wraps under the new and hands the record the bytes. The record's half,
 * `rewrapKeys` and `wrappedKeys`, is `packages/kernel/src/api/keys.test.ts`'s. The one stand-in is the object: the
 * platform's RPC stub over `Record$` is two calls here, `keysHeld` and `rewrapKeys`, made on the record the way the
 * object makes them.
 *
 * THE WALK: keys made under key A; `KEK` rebuilt as B with A beside it; every grant opens before the re-wrap; after it,
 * every row is under B and B alone opens them. And a record whose old key the secret no longer holds is a straggler,
 * with its rows left as they were.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { createRecordApi, type RecordApi } from '@braindog/record';
import { grantAad, grantKey, seal } from '@braindog/host';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { keyOpener } from '../src/actions.ts';
import { keyStoreOf, offeredId, recordKeys, unwrap, type KeyStore } from '../src/keys.ts';
import { rewrapRecord, type Rewrappable } from '../src/rewrap.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const GRANT = 'g_01JZ8QK3F7R2M9V4XN6TCB5HAE';

const utf8 = (s: string) => new TextEncoder().encode(s);
const rootHex = (): string => randomBytes(32).toString('hex');

const storeOf = async (bound: string): Promise<KeyStore> => (await keyStoreOf(bound)) ?? assert.fail('bound, and no store');

/** A record made under `store`, with one credential sealed under its record key as the vault door seals a deposit. */
async function recordUnder(store: KeyStore, secret: string) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 25, 12)) });
  const keys = await recordKeys(store, REC);
  const made = await api.createRecord({
    id: REC,
    slug: 'the-studio',
    name: 'The Studio',
    tz: 'UTC',
    locale: 'en',
    owner: { id: 'p_1', email: 'ada@example.com', name: 'Ada' },
    keys,
  } as never);
  assert.ok(made.ok, JSON.stringify(made));
  const dek = (await unwrap(store, REC, 'record', keys.record)) ?? assert.fail('the record key did not open');
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await seal(await grantKey(dek, GRANT), nonce, grantAad(REC, GRANT, '1'), utf8(secret));
  dek.fill(0);
  const bound = api.kernel.bindGrant(
    { label: 'Kiln deploy', opens: 'kiln.example', kind: 'api_token', ciphertext, nonce, kdf: 'hkdf', wrapped_by: 'kek', kek_id: keys.record.kek_id, sealed_under: 'record', sealed_for: { id: GRANT, version: 1 } },
    'p_1',
  );
  assert.ok(bound.ok, JSON.stringify(bound));
  return { sql, api };
}

/** The two RPCs `rewrapRecord` makes on `Record$`, made on the record as the object makes them. */
const objectOf = (api: RecordApi): Rewrappable => ({
  keysHeld: async () => (api.kernel.refused() ? null : { record: api.kernel.identity()?.id ?? null, rows: api.kernel.wrappedKeys() }),
  rewrapKeys: (args) => api.rewrapKeys(args),
});

/** The environment `rewrapRecord` reads: `KEK`, and the record's object by the name the walk addresses it by. */
const envOf = (bound: string, api: RecordApi, asked: string[] = []) => ({
  KEK: bound,
  RECORD: {
    idFromName: (name: string) => (asked.push(name), name),
    get: (_id: string) => objectOf(api),
  },
});

test('KEK HOLDING B THEN A: B IS CURRENT, BOTH OPEN, AND A THIRD KEY OR A WORD THAT IS NOT ONE IS REFUSED', async () => {
  const a = rootHex();
  const b = rootHex();
  const idA = (await (await storeOf(a)).current()).kekId;
  const idB = (await (await storeOf(b)).current()).kekId;
  const rotated = await storeOf(`${b} ${a}`);

  assert.equal((await rotated.current()).kekId, idB, 'the first key is not the current one');
  assert.ok(await rotated.byId(idA), 'the key before it does not open');
  assert.ok(await rotated.byId(idB));
  assert.equal(await rotated.byId('0'.repeat(18)), null, 'a key the secret does not hold opened');

  /* THE SAME KEY TWICE IS ONE KEY, the moment in the runbook where both halves hold it. */
  assert.equal((await (await storeOf(`${a} ${a}`)).current()).kekId, idA);

  await assert.rejects(() => keyStoreOf(`${b} ${a} ${rootHex()}`), /more than two keys/);
  await assert.rejects(() => keyStoreOf(`${b} not-a-key`), /not 32 bytes/);

  /* `offeredId`: the id the record is under while the store holds it, and the current one otherwise. */
  assert.equal(await offeredId(rotated, idA), idA);
  assert.equal(await offeredId(rotated, '0'.repeat(18)), idB);
  assert.equal(await offeredId(rotated, null), idB);
});

test('KEYS MADE UNDER A, KEK REBUILT AS B WITH A BESIDE IT: THE GRANT OPENS BEFORE THE RE-WRAP, AND UNDER B ALONE AFTER IT', async () => {
  const a = rootHex();
  const b = rootHex();
  const secret = `bd_fake_token_${randomBytes(12).toString('hex')}`;
  const storeA = await storeOf(a);
  const idA = (await storeA.current()).kekId;
  const { sql, api } = await recordUnder(storeA, secret);
  const grant = { id: GRANT, label: 'Kiln deploy' };

  /* THE ROTATION. The current id alone is refused, which is the window `offeredId` closes. */
  const rotated = `${b} ${a}`;
  const idB = (await (await storeOf(b)).current()).kekId;
  assert.equal(api.kernel.wrappingKey(), idA);
  const bare = api.kernel.openGrant({ id: GRANT, kek_id: idB }, 'system');
  assert.equal(bare.ok ? 'opened' : 'refusal' in bare ? bare.refusal.code : 'a conflict', 'WRONG_KEY');
  assert.equal(await (keyOpener(api, rotated) ?? assert.fail('bound, and no opener'))(grant), secret, 'the grant did not open during the rotation');

  /* THE NIGHT'S RE-WRAP, addressed by the record's name. */
  const asked: string[] = [];
  assert.equal(await rewrapRecord(envOf(rotated, api, asked), REC), 'rewrapped');
  assert.deepEqual(asked, [REC]);
  const after = api.kernel.wrappedKeys();
  assert.deepEqual(after.map((r) => r.kek_id), [idB, idB, idB], 'a key was left under A');
  assert.equal(api.kernel.wrappingKey(), idB);
  assert.equal(sql.one<{ kek_id: string }>('SELECT kek_id FROM grant WHERE id = ?', GRANT)?.kek_id, idB);

  /* B ALONE OPENS EVERY ROW, AND THE GRANT, and A alone no longer opens the grant. */
  const storeB = await storeOf(b);
  for (const row of after) {
    const inside = await unwrap(storeB, REC, row.purpose, { wrapped: row.wrapped, nonce: row.nonce, kek_id: row.kek_id, wrapped_by: 'kek' });
    assert.ok(inside, `${row.purpose} did not open under B alone`);
    inside.fill(0);
  }
  assert.equal(await (keyOpener(api, b) ?? assert.fail('bound, and no opener'))(grant), secret, 'the grant did not open under B alone');
  assert.equal(await (keyOpener(api, a) ?? assert.fail('bound, and no opener'))(grant), null, 'the retired key still opened the grant');

  /* THE NEXT NIGHT, AND A SECOND WALK: nothing left to move, and nothing written. */
  assert.equal(await rewrapRecord(envOf(rotated, api), REC), 'ok');
  assert.equal(await rewrapRecord(envOf(b, api), REC), 'ok');
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM event WHERE kind = 'grant.rotate' AND target_kind = 'vault_key'")?.n, 1);
  sql.close();
});

test('A RECORD UNDER A KEY THE SECRET NO LONGER HOLDS IS A STRAGGLER, and its rows are left as they were', async () => {
  const a = rootHex();
  const b = rootHex();
  const secret = `bd_fake_token_${randomBytes(12).toString('hex')}`;
  const storeA = await storeOf(a);
  const idA = (await storeA.current()).kekId;
  const { sql, api } = await recordUnder(storeA, secret);
  const before = api.kernel.wrappedKeys();

  assert.equal(await rewrapRecord(envOf(b, api), REC), 'straggler');
  assert.deepEqual(api.kernel.wrappedKeys(), before, 'a straggler was written to');
  assert.equal(api.kernel.wrappingKey(), idA);

  /* AND PUTTING A BACK BESIDE B MOVES IT, which is the runbook's repair. */
  assert.equal(await rewrapRecord(envOf(`${b} ${a}`, api), REC), 'rewrapped');
  assert.equal(await (keyOpener(api, b) ?? assert.fail('bound, and no opener'))({ id: GRANT, label: 'Kiln deploy' }), secret);
  sql.close();
});

test('A RECORD WITH NO KEYS UNDER A ROOT KEY IS OK WHATEVER KEK HOLDS, INCLUDING NOTHING', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 25, 12)) });
  const made = await api.createRecord({ id: REC, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.com', name: 'Ada' } });
  assert.ok(made.ok, JSON.stringify(made));
  assert.equal(await rewrapRecord(envOf('', api), REC), 'ok');
  assert.equal(await rewrapRecord(envOf(rootHex(), api), REC), 'ok');
  sql.close();
});
