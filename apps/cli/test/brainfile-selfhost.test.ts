/**
 * `braindog export` then `braindog import` against a real self-host, started in this process by `start` with a server
 * key and a key store, over a real socket: the round trip a restore depends on, and the two files it must refuse.
 *
 * THE MANIFESTS ARE THE PROOF. W55-2 wrote no event for a replacing import so that the record exported after it is the
 * file it came from, manifest for manifest; a row written between the export and the import is gone afterwards, and a
 * second export carries the first one's `dog_manifest` block exactly.
 *
 * THE VAULT IS REAL. `recordKeys` wraps the record's three keys under a KEK made for this run, so the record holds
 * `vault_key` rows, and a copy without them is the one W55-2's checker found a replacing import must refuse.
 *
 * THE COMMAND'S FUNCTIONS ARE CALLED HERE, NOT A CHILD PROCESS, because the self-host runs in this process and the
 * dispatch in `main.ts` is pinned by `brainfile.test.ts`. The requests still go over the socket, through `fetch`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openRecord } from '@braindog/kernel';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { testSigner } from '../../../packages/kernel/test/signer.ts';
import { openKeyStore, recordKeys } from '../../selfhost/src/keys.ts';
import { start } from '../../selfhost/src/server.ts';
import { exportFile, importFile, type BrainfileIo } from '../src/brainfile.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const OTHER = 'rec_01JZ9ZZZZZZZZZZZZZZZZZZZZZ';

const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  body: { id: 'things', name: 'Things', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};

/** A self-host holding one created record with a vault, one list and two rows, and the io a command reaches it with. */
async function stack(t: { after: (f: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-brainfile-selfhost-'));
  const serverKey = randomBytes(32).toString('base64url');
  const store = await openKeyStore(join(dir, 'kek.key'));
  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    token: serverKey,
    sessionKey: new Uint8Array(randomBytes(32)),
    keys: store,
    pollMs: 0,
  });
  t.after(async () => {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const person = running.directory.person$('ada@example.com', 'Ada');
  assert.ok(person.ok);
  const owner = person.value.id;
  const made = await running.api.createRecord({
    id: REC,
    slug: 'the-studio',
    name: 'The Studio',
    tz: 'UTC',
    locale: 'en',
    owner: { id: owner, email: 'ada@example.com', name: 'Ada' },
    keys: await recordKeys(store, REC),
  });
  assert.ok(made.ok, JSON.stringify(made));
  assert.ok((await running.api.kernel.install([THINGS])).ok);
  const add = (name: string) => assert.ok(running.api.kernel.create('things', { name }, { actor: owner }).ok);
  add('Kiln');
  add('Wheel');

  const port = (running.server.address() as { port: number }).port;
  const out: string[] = [];
  const said: string[] = [];
  const io: BrainfileIo = {
    env: { BRAINDOG_HOST: `http://127.0.0.1:${port}`, BRAINDOG_TOKEN: serverKey },
    cwd: dir,
    file: join(dir, 'hosts.json'),
    out: (l) => void out.push(l),
    say: (l) => void said.push(l),
  };
  const kek = (await store.current()).kekId;
  const things = () => running.api.kernel.count('things');
  return { dir, io, out, said, kek, add, things, serverKey };
}

/** How many rows one table has in a file. */
function rows(file: string, table: string): number {
  const lines = readFileSync(file, 'utf8').split('\n');
  const at = lines.findIndex((l) => l.startsWith(`#table ${table} `));
  assert.ok(at >= 0, `${file} has no ${table} table`);
  const end = lines.findIndex((l, i) => i > at && (l.startsWith('#') || l === ''));
  return end - at - 1;
}

/** The `dog_manifest` block of a file: its header and every row up to the next table. */
function manifest(file: string): string[] {
  const lines = readFileSync(file, 'utf8').split('\n');
  const at = lines.findIndex((l) => l.startsWith('#table dog_manifest '));
  assert.ok(at >= 0, `${file} has no manifest`);
  const end = lines.findIndex((l, i) => i > at && l.startsWith('#'));
  return lines.slice(at, end);
}

test('A BACKUP ROUND TRIP ON A SELF-HOST: the key named, the file checked, a later row undone, and the manifests equal', async (t) => {
  const s = await stack(t);

  /* NO KEY NAMED: the record says which one it holds, and that is the id the key store made. */
  assert.equal(await exportFile(['-o', 'first.brainl'], s.io), 1, s.said.join('\n'));
  assert.ok(s.said.some((l) => l.includes(s.kek)), `the refusal did not name ${s.kek}: ${s.said.join('\n')}`);

  s.said.length = 0;
  assert.equal(await exportFile(['--kek', s.kek, '-o', 'first.brainl'], s.io), 0, s.said.join('\n'));
  assert.ok(s.out.some((l) => l.includes('signature valid')), s.out.join('\n'));
  assert.equal(rows(join(s.dir, 'first.brainl'), 'vault_key'), 3, 'the backup left the vault out');

  s.add('Written after the backup');
  assert.equal(s.things(), 3);

  s.out.length = 0;
  assert.equal(await importFile(['first.brainl'], s.io), 0, s.said.join('\n'));
  assert.equal(s.things(), 2, 'the row written after the backup is still there');
  assert.ok(s.out.some((l) => l.startsWith(`put back ${REC} from first.brainl: `)), s.out.join('\n'));

  /* AND THE SERVER KEY STILL OPENS IT, because `local` did not travel and was not cleared. */
  assert.equal(await exportFile(['--kek', s.kek, '-o', 'second.brainl'], s.io), 0, s.said.join('\n'));
  assert.deepEqual(manifest(join(s.dir, 'second.brainl')), manifest(join(s.dir, 'first.brainl')));
});

test('A SHAREABLE COPY SAYS IT CANNOT RESTORE, AND THE RECORD REFUSES TO BE PUT BACK FROM IT', async (t) => {
  const s = await stack(t);
  assert.equal(await exportFile(['--redact-grants', '-o', 'share.brainl'], s.io), 0, s.said.join('\n'));
  assert.ok(s.out.some((l) => l.includes('copy to share')), s.out.join('\n'));
  /* THE TABLE'S HEADER TRAVELS AND ITS ROWS DO NOT, which is what a redacted file is. */
  assert.equal(rows(join(s.dir, 'share.brainl'), 'vault_key'), 0);

  s.add('Kept');
  assert.equal(await importFile(['share.brainl'], s.io), 1);
  assert.ok(s.said.some((l) => l.includes('without the sealed bytes')), s.said.join('\n'));
  assert.equal(s.things(), 3, 'a refused import changed the record');
});

test('ANOTHER RECORD\'S COPY IS REFUSED BY THE RECORD, and both ids are said', async (t) => {
  const s = await stack(t);
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(Date.UTC(2026, 8, 23)), { sign: testSigner() });
  sql.exec("INSERT INTO record (singleton, id, slug, name, locale, tz, format_ver, created_at) VALUES (1, ?, 'elsewhere', 'Elsewhere', 'en', 'UTC', 1, '2026-09-23T00:00:00.000Z')", OTHER);
  const theirs = (await k.export()) as { ok: boolean; value?: string[] };
  sql.close();
  assert.ok(theirs.ok);
  writeFileSync(join(s.dir, 'theirs.brainl'), `${theirs.value!.join('\n')}\n`);

  assert.equal(await importFile(['theirs.brainl'], s.io), 1);
  const all = [...s.out, ...s.said].join('\n');
  assert.ok(all.includes(OTHER) && all.includes(REC), all);
  assert.equal(s.things(), 2);
});
