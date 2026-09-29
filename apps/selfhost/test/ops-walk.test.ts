/**
 * A root key rotation on the self-host, walked through the self-host's own code over a real record and real key files
 * (`53 §5.6` step 8).
 *
 * WHAT RUNS HERE IS THE HOST'S CODE, NOT A COPY OF IT. `openKeyStore` opens the key file and the `<file>.prev` beside
 * it and says at boot what a new key file does; `keyOpener` offers `openGrant` the id the record is wrapped under
 * through `offeredId` and opens the sealed bytes; `rewrapAtStart` moves the record's keys under the new file. The
 * record's half, `rewrapKeys` and `wrappedKeys`, is `packages/kernel/src/api/keys.test.ts`'s.
 *
 * THE WALK: keys made under file A; A moved to `.prev` and a new key file B made beside it; every grant opens before
 * the re-wrap; after it every row is under B, and B with no `.prev` opens them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createRecordApi } from '@braindog/record';
import { grantAad, grantKey, seal } from '@braindog/host';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { keyOpener } from '../src/actions.ts';
import { openKeyStore, previousOf, recordKeys, unwrap, type KeyStore } from '../src/keys.ts';
import { rewrapAtStart } from '../src/rewrap.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const GRANT = 'g_01JZ8QK3F7R2M9V4XN6TCB5HAE';
const GRANT_ARGS = { id: GRANT, label: 'Kiln deploy' };

const utf8 = (s: string) => new TextEncoder().encode(s);

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

test('KEYS MADE UNDER FILE A, A MOVED TO .prev AND B MADE: THE GRANT OPENS BEFORE THE RE-WRAP, AND UNDER B ALONE AFTER IT', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bd-ops-walk-'));
  try {
    const file = join(dir, 'kek');
    const secret = `bd_fake_token_${randomBytes(12).toString('hex')}`;
    const storeA = await openKeyStore(file);
    const idA = (await storeA.current()).kekId;
    assert.equal(existsSync(previousOf(file)), false, 'a previous key file was made where nobody put one');
    const { sql, api } = await recordUnder(storeA, secret);

    /* THE ROTATION: the old file beside the key file as `.prev`, and a new key file made on the next start. */
    renameSync(file, previousOf(file));
    const said: string[] = [];
    const rotated = await openKeyStore(file, (line) => said.push(line));
    const idB = (await rotated.current()).kekId;
    assert.notEqual(idB, idA, 'no new key was made');
    assert.ok(await rotated.byId(idA), 'the previous key file does not open');
    assert.ok(said.some((line) => line.includes('.prev holds the previous key')), 'the boot did not name the previous key file');
    assert.ok(said.some((line) => line.includes('signs everybody out unless BRAINDOG_SESSION_SECRET is set')), 'the boot did not say sessions end');

    /* BEFORE THE RE-WRAP: the current id alone is refused, and the opener offers the one the record is under. */
    assert.equal(api.kernel.wrappingKey(), idA);
    const bare = api.kernel.openGrant({ id: GRANT, kek_id: idB }, 'system');
    assert.equal(bare.ok ? 'opened' : 'refusal' in bare ? bare.refusal.code : 'a conflict', 'WRONG_KEY');
    assert.equal(await keyOpener(api, rotated)(GRANT_ARGS), secret, 'the grant did not open during the rotation');

    /* THE START'S RE-WRAP. */
    const moved: string[] = [];
    assert.equal(await rewrapAtStart(api, rotated, (line) => moved.push(line)), 'rewrapped');
    assert.equal(moved.length, 1);
    const after = api.kernel.wrappedKeys();
    assert.deepEqual(after.map((r) => r.kek_id), [idB, idB, idB], 'a key was left under A');
    assert.equal(api.kernel.wrappingKey(), idB);
    assert.equal(sql.one<{ kek_id: string }>('SELECT kek_id FROM grant WHERE id = ?', GRANT)?.kek_id, idB);

    /* THE NEXT START, and the one after `.prev` is gone: nothing to move, and B alone opens every row and the grant. */
    const quiet: string[] = [];
    assert.equal(await rewrapAtStart(api, rotated, (line) => quiet.push(line)), 'ok');
    assert.deepEqual(quiet, []);
    rmSync(previousOf(file));
    const alone = await openKeyStore(file);
    assert.equal(await alone.byId(idA), null, 'the retired key still opens');
    for (const row of after) {
      const inside = await unwrap(alone, REC, row.purpose, { wrapped: row.wrapped, nonce: row.nonce, kek_id: row.kek_id, wrapped_by: 'kek' });
      assert.ok(inside, `${row.purpose} did not open under B alone`);
      inside.fill(0);
    }
    assert.equal(await keyOpener(api, alone)(GRANT_ARGS), secret, 'the grant did not open under B alone');
    assert.equal(await rewrapAtStart(api, alone), 'ok');
    sql.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('A RECORD UNDER A KEY NEITHER FILE HOLDS IS A STRAGGLER, said once and left as it was, and the same key twice is one key', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bd-ops-walk-'));
  try {
    const old = join(dir, 'old');
    const file = join(dir, 'kek');
    const storeA = await openKeyStore(old);
    const idA = (await storeA.current()).kekId;
    const { sql, api } = await recordUnder(storeA, `bd_fake_token_${randomBytes(12).toString('hex')}`);
    const before = api.kernel.wrappedKeys();

    const storeB = await openKeyStore(file);
    const said: string[] = [];
    assert.equal(await rewrapAtStart(api, storeB, (line) => said.push(line)), 'straggler');
    assert.equal(said.length, 1);
    assert.match(said[0] ?? '', /WRONG_KEY/);
    assert.deepEqual(api.kernel.wrappedKeys(), before, 'a straggler was written to');
    assert.equal(api.kernel.wrappingKey(), idA);

    /* THE SAME KEY IN BOTH FILES: nothing is said about a previous key, and the store is the key file's alone. */
    copyFileSync(file, previousOf(file));
    /* `0600`, as a key file is checked to be; the copy's mode is not this test's subject. */
    chmodSync(previousOf(file), 0o600);
    const twice: string[] = [];
    const same = await openKeyStore(file, (line) => twice.push(line));
    assert.equal(twice.some((line) => line.includes('.prev holds the previous key')), false);
    assert.equal((await same.current()).kekId, (await storeB.current()).kekId);
    sql.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
