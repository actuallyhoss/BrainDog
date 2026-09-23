/**
 * `braindog export` against a real record with no vault: the backup it asks for by default is the whole record, and
 * nobody is sent looking for a wrapping key that does not exist.
 *
 * WAVE FIFTY-FIVE'S CHECKER FOUND IT. The command asks for `redactGrants: false` by default so a backup can put the
 * record back, and the record answered that request `WRONG_KEY` whenever `kernel.wrappingKey()` was null, which is
 * every record never given a vault. The command then printed "run braindog export --kek <that key>", and there is no
 * such key to name: the default export of a record with nothing sealed in it could not be taken at all.
 *
 * THE DOOR IS THE RECORD ITSELF, `createRecordApi` over an in-memory SQLite, reached through a function standing in
 * for `fetch` with a self-host server key, so the refusal and the file are the record's own and not a stub's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createRecordApi, type CallContext } from '../../../packages/record/src/index.ts';
import { openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { testSigner } from '../../../packages/kernel/test/signer.ts';
import { exportFile, type BrainfileIo } from '../src/brainfile.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const NOW = Date.UTC(2026, 8, 23, 21);
const LOCAL = 'http://127.0.0.1:5870';
const SERVER_KEY = 'stub-server-key-never-printed-4c2e';
const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' }, credentialed: true };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };

/** A record `createRecord` made, which holds no `vault_key` row and no sealed grant until something puts one there. */
async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: { now: () => NOW }, sign: testSigner() });
  const made = await api.createRecord({ id: REC, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_owner', email: 'ada@example.com', name: 'Ada' } });
  assert.ok(made.ok, JSON.stringify(made));
  return { api, sql };
}

/** The record's `export` door behind the server key, as the self-host answers it, and every body it was sent. */
function door(api: Awaited<ReturnType<typeof record>>['api']) {
  const sent: Record<string, unknown>[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, '/api/export');
    assert.equal(new Headers(init?.headers).get('authorization'), `Bearer ${SERVER_KEY}`);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    sent.push(body);
    const out = (await api.export(body, owner)) as Out;
    return new Response(JSON.stringify(out), { status: out.ok ? 200 : 422, headers: { 'content-type': 'application/json' } });
  }) as typeof globalThis.fetch;
  return { fetch, sent };
}

function rig(t: { after: (f: () => void) => void }, fetch: typeof globalThis.fetch) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-novault-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const out: string[] = [];
  const said: string[] = [];
  const io: BrainfileIo = {
    env: { BRAINDOG_HOST: LOCAL, BRAINDOG_TOKEN: SERVER_KEY },
    cwd: dir,
    file: join(dir, 'hosts.json'),
    out: (l) => void out.push(l),
    say: (l) => void said.push(l),
    fetch,
  };
  return { dir, io, out, said };
}

test('NO VAULT, NO --kek: the default backup is taken whole, checked and written, and --kek is never mentioned', async (t) => {
  const { api, sql } = await record();
  t.after(() => sql.close());
  assert.equal(api.kernel.wrappingKey(), null, 'the record this test is about has no vault');
  const d = door(api);
  const r = rig(t, d.fetch);

  const code = await exportFile(['-o', 'backup.brainl'], r.io);
  assert.equal(code, 0, r.said.join('\n'));
  assert.deepEqual(d.sent, [{ redactGrants: false }], 'the default was not the unredacted export');
  assert.ok(!r.said.join('\n').includes('--kek'), r.said.join('\n'));
  assert.ok(r.out.includes('wrote backup.brainl'), r.out.join('\n'));
  assert.ok(!r.out.some((l) => l.includes('copy to share')), 'a whole record was described as a redacted copy');
  const file = readFileSync(join(r.dir, 'backup.brainl'), 'utf8');
  assert.ok(file.includes(REC), 'the file is not this record');
  assert.ok(!file.includes('grants redacted'), 'the export event says the grants were left out of a whole copy');
});

test('A RECORD WITH A KEY STILL NEEDS IT NAMED: the sentence names it, the command says --kek, and no file is written', async (t) => {
  const { api, sql } = await record();
  t.after(() => sql.close());
  sql.exec("INSERT INTO vault_key (purpose, wrapped, nonce, wrapped_by, kek_id) VALUES ('record', ?, ?, 'kek', 'kek_2f')", new Uint8Array([9]), new Uint8Array([1]));
  const d = door(api);
  const r = rig(t, d.fetch);

  assert.equal(await exportFile(['-o', 'backup.brainl'], r.io), 1);
  assert.ok(r.said.some((l) => l.includes('kek_2f')), r.said.join('\n'));
  assert.ok(r.said.some((l) => l.includes('--kek')), r.said.join('\n'));
  assert.ok(!existsSync(join(r.dir, 'backup.brainl')));

  assert.equal(await exportFile(['--kek', 'kek_2f', '-o', 'backup.brainl'], r.io), 0, r.said.join('\n'));
});

test('SEALED GRANT BYTES WITH NO vault_key ROW ARE STILL A VAULT, as the replacing import counts one', async (t) => {
  /* `import` refuses a redacted file when the record holds `vault_key` rows OR grants with a `ciphertext`
     (`packages/kernel/src/index.ts`), so "no vault" here is the same two counts, and a record that holds a sealed
     credential is not let through on the strength of a missing `vault_key` row alone. */
  const { api, sql } = await record();
  t.after(() => sql.close());
  sql.exec(
    `INSERT INTO grant (id, label, kind, opens, ciphertext, nonce, kdf, wrapped_by, kek_id, created_at)
     VALUES ('g1', 'Bank', 'password', 'the bank', ?, ?, 'hkdf', 'kek', 'k1', ?)`,
    new Uint8Array([7, 8, 0, 255]),
    new Uint8Array([1, 2, 3]),
    new Date(NOW).toISOString(),
  );
  const out = (await api.export({ redactGrants: false }, owner)) as Out;
  assert.equal(out.ok, false, 'sealed bytes left in an export that named no key');
  assert.equal(out.refusal?.code, 'WRONG_KEY');
  assert.doesNotMatch(out.refusal?.fix ?? '', /has no vault/, 'a record holding a sealed credential was said to have no vault');
});

test('A KEY WRAPPED BY A PASSPHRASE HAS NO ID TO NAME, so the command does not tell anybody to pass --kek', async (t) => {
  const { api, sql } = await record();
  t.after(() => sql.close());
  sql.exec(
    "INSERT INTO vault_key (purpose, wrapped, nonce, wrapped_by, kek_id, salt) VALUES ('record', ?, ?, 'passphrase', NULL, ?)",
    new Uint8Array([9]),
    new Uint8Array([1]),
    new Uint8Array([4]),
  );
  const d = door(api);
  const r = rig(t, d.fetch);

  assert.equal(await exportFile(['-o', 'backup.brainl'], r.io), 1);
  assert.ok(!r.said.join('\n').includes('--kek'), r.said.join('\n'));
  assert.ok(!r.said.join('\n').includes('has no vault'), r.said.join('\n'));
  assert.ok(r.said.some((l) => l.includes('--redact-grants')), r.said.join('\n'));
  assert.ok(!existsSync(join(r.dir, 'backup.brainl')));
});
