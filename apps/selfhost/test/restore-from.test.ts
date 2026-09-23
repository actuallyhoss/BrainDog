/**
 * `braindog init <slug> --from <file.brainl>`: a copy of a record becomes a record this host serves (ROADMAP W55-4).
 *
 * MEASURED BEFORE THIS FILE, at 1586f2a2: `init drill --from nightly.brainl` ignored the flag. With no owner it refused
 * "needs an owner", and with one it made a NEW record under a new id, so the copy never became anything; the only other
 * way in, `init` then an import, is `IMPORT_NOT_EMPTY`, because `createRecord` writes the owner, the schedules and the
 * three keys first (`loop/research-restore.md` 3.4). A Cloud copy could be checked and read, and could not be served.
 *
 * THE COPY IS BUILT THE WAY THE CLOUD BUILDS ITS NIGHTLY ONE: `kernel.export({ redactGrants: false, actor: 'system' })`
 * joined by newlines, as `apps/worker/src/snapshots.ts` `dumpOf` does, with the record's keys wrapped by a root key the
 * test holds. What is proved is the round trip the brief names: the served record's next export carries the same
 * manifest, table for table but the migration ledger, which is this host's own and says so below, and under the same
 * root key the same signing key.
 *
 * IT RUNS THE REAL ENTRY IN A REAL PROCESS, as `init.test.ts` does and for its reason: the argv, the exit code and the
 * one sentence on stderr are the command.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRecordApi } from '@braindog/record';
import { createDirectory } from '@braindog/record/directory';
import type { Signer } from '@braindog/kernel';

import { openKeyStore, recordKeys } from '../src/keys.ts';
import { signerFor } from '../src/sign.ts';
import { openSqlite, start } from '../src/server.ts';

const MAIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'main.ts');
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const PERSON = 'p_01JZ8QK3F7R2M9V4XN6TCB5HAE';
const KEY = 'a-server-key-for-this-test-only';
/** The instant the copy was taken, and the clock the restored record is served on. */
const TAKEN = (): number => Date.UTC(2026, 8, 23, 3, 17);

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register' as const,
  body: { id: 'obligations', name: 'Obligations', title: 'what', fields: [{ id: 'what', type: 'text', required: true, search: true }] } as never,
};

function run(data: string, ...args: string[]): { code: number; said: string; out: string } {
  const r = spawnSync(process.execPath, [MAIN, ...args], { encoding: 'utf8', env: { ...process.env, BRAINDOG_DATA: data, BRAINDOG_OWNER: '' } });
  return { code: r.status ?? -1, said: r.stderr, out: r.stdout };
}

/** The `dog_manifest` block of a file: its header line and every row under it, which is what a round trip compares. */
function manifestOf(lines: readonly string[]): string[] {
  const at = lines.findIndex((l) => l.startsWith('#table dog_manifest '));
  assert.ok(at >= 0, 'the file has no manifest');
  const out = [lines[at]!];
  for (const line of lines.slice(at + 1)) {
    if (line.startsWith('#')) break;
    if (line.trim() !== '') out.push(line);
  }
  return out;
}

/** The `key_id` of a file's `dog_sig` row, or `null` for a file nobody signed. */
function keyIdOf(lines: readonly string[]): string | null {
  const at = lines.findIndex((l) => l.startsWith('#table dog_sig '));
  if (at < 0) return null;
  const columns = lines[at]!.slice('#table dog_sig '.length).split(' ')[0]!.split(',');
  const row = lines.slice(at + 1).find((l) => l.trim() !== '');
  if (row === undefined || row.startsWith('#')) return null;
  return (JSON.parse(row) as string[])[columns.indexOf('key_id')] ?? null;
}

/**
 * A record kept somewhere else, and its nightly copy as the Cloud writes one, with its keys under `kek`.
 */
async function cloudCopy(kek: string): Promise<string[]> {
  const store = await openKeyStore(kek);
  const sql = openSqlite(':memory:');
  let signer: Signer | null = null;
  const api = await createRecordApi({ sql, clock: { now: TAKEN }, sign: async (bytes) => (signer ? signer(bytes) : null) });
  const made = await api.createRecord({
    id: REC,
    slug: 'the-studio',
    name: 'The Studio',
    tz: 'UTC',
    locale: 'en',
    owner: { id: PERSON, email: 'ada@example.com', name: 'Ada' },
    keys: await recordKeys(store, REC),
  });
  assert.ok(made.ok, JSON.stringify(made));
  signer = await signerFor(sql, store, REC);
  assert.ok(signer, 'the copy has no signing key');
  assert.ok((await api.kernel.install([OBLIGATIONS])).ok);
  const owner = { principal: { kind: 'person' as const, id: PERSON, level: 'owner' as const }, credentialed: true };
  for (const what of ['File the VAT return', 'Renew the lease'])
    assert.ok((await api.create({ register: 'obligations', fields: { what } }, owner)).ok);
  const out = await api.kernel.export({ redactGrants: false, actor: 'system' });
  assert.ok(out.ok, JSON.stringify(out));
  sql.close();
  return out.value;
}

const scratch = (): string => mkdtempSync(join(tmpdir(), 'braindog-restore-'));

test('A CLOUD COPY BECOMES THE RECORD THIS HOST SERVES, under its own id and owner, and its next export has the same manifest and the same key', async () => {
  const data = scratch();
  let running: Awaited<ReturnType<typeof start>> | null = null;
  try {
    /* THE SAME ROOT KEY THE COPY WAS WRAPPED WITH, put where `init` looks for it: the case in which the vault opens. */
    const lines = await cloudCopy(join(data, 'kek'));
    const file = join(data, 'nightly.brainl');
    writeFileSync(file, `${lines.join('\n')}\n`);

    const out = run(data, 'init', 'drill', '--from', file);
    assert.equal(out.code, 0, out.said);
    assert.equal(out.out, '', 'stdout belongs to the CLI’s --json envelope');
    assert.match(out.said, new RegExp(`^record drill restored from ${file.replace(/[\\.]/g, '\\$&')} · ${REC} · owner ada@example\\.com$`, 'm'));
    assert.doesNotMatch(out.said, /wrapped/, 'a copy under this host’s own root key was said to be wrapped elsewhere');
    assert.ok(!out.said.includes('—'));

    /* THE RECORD IS THE FILE'S, AND NOT ONE `createRecord` MADE: its id, its owner, its rows. */
    const recordFile = join(data, 'drill', 'record.brain');
    const sql = openSqlite(recordFile);
    assert.equal(sql.one<{ id: string }>('SELECT id FROM record WHERE singleton = 1')?.id, REC);
    assert.equal(sql.one<{ person_id: string }>("SELECT person_id FROM member WHERE register = '*' AND level = 'owner'")?.person_id, PERSON);
    sql.close();
    assert.ok(existsSync(join(data, 'drill', 'inbound.token')), 'a restored record takes no forwarded mail');

    /* AND THE DIRECTORY NAMES IT, FOR THE PERSON THE RECORD SAYS OWNS IT. A Directory person under a new id would be
       somebody the record's `member` table does not hold, and every sign-in would be refused 403. */
    const dirSql = openSqlite(join(data, 'directory.sqlite'));
    const directory = createDirectory(dirSql, { now: () => Date.now() });
    assert.equal(directory.claimed('drill'), 'taken');
    assert.deepEqual(directory.namesOf(REC).map((n) => n.slug), ['drill']);
    const ada = directory.person$('ada@example.com');
    assert.ok(ada.ok, JSON.stringify(ada));
    assert.equal(ada.value.id, PERSON);
    dirSql.close();

    /* SERVED, AND EXPORTED AGAIN OVER THE WIRE, with the bytes carried as the copy carried them. THE CLOCK IS THE COPY'S:
       measured with the real one, the record's daily `purge` sweep, due an hour after the copy was taken, fired on the
       first drain and moved its `schedule` row, which is the restored record working and not the restore differing. */
    const store = await openKeyStore(join(data, 'kek'));
    running = await start({ file: recordFile, directory: join(data, 'directory.sqlite'), keys: store, token: KEY, host: '127.0.0.1', port: 0, pollMs: 0, now: TAKEN });
    const base = `http://127.0.0.1:${(running.server.address() as { port: number }).port}`;
    const bearer = { authorization: `Bearer ${KEY}` };
    const listed = await fetch(`${base}/api/list?register=obligations`, { headers: bearer });
    assert.equal(listed.status, 200);
    const rows = ((await listed.json()) as { value: { rows: { fields: { what: string } }[] } }).value.rows.map((r) => r.fields.what).sort();
    assert.deepEqual(rows, ['File the VAT return', 'Renew the lease']);

    /* BOTH NAMES REACH IT: the one the record carries, which the app reads from `boot`, and the one it was restored
       under, which the Directory hands the switcher. */
    assert.equal((await fetch(`${base}/app/the-studio/api/boot`, { headers: bearer })).status, 200);
    assert.equal((await fetch(`${base}/app/drill/api/boot`, { headers: bearer })).status, 200, 'the name the record was restored under is refused');
    assert.equal((await fetch(`${base}/app/somebody-else/api/boot`, { headers: bearer })).status, 403);

    const again = await fetch(`${base}/api/export`, {
      method: 'POST',
      headers: bearer,
      body: JSON.stringify({ redactGrants: false, kek_id: (await store.current()).kekId }),
    });
    const exported = (await again.json()) as { ok: boolean; value: string[] };
    assert.equal(again.status, 200, JSON.stringify(exported));
    /* EVERY TABLE THE COPY CARRIES, BUT THE LEDGER OF MIGRATIONS. `migration` is this file's own account of when this host
       migrated it, which `importBrainl` never imports by design (`packages/kernel/src/index.ts`, `import`): measured, its
       13 rows match the copy's in number and its hash differs, by `applied_at`. Every other table is the copy's, hash for
       hash. */
    const withoutLedger = (block: string[]) => block.filter((l) => !l.startsWith('["migration",'));
    const ledgerRows = (block: string[]) => (JSON.parse(block.find((l) => l.startsWith('["migration",'))!) as [string, number])[1];
    assert.deepEqual(withoutLedger(manifestOf(exported.value)), withoutLedger(manifestOf(lines)));
    assert.equal(ledgerRows(manifestOf(exported.value)), ledgerRows(manifestOf(lines)));
    assert.equal(keyIdOf(exported.value), keyIdOf(lines), 'the restored record signs with another key');
    assert.ok(keyIdOf(lines));
  } finally {
    await running?.close();
    rmSync(data, { recursive: true, force: true });
  }
});

test('A COPY WRAPPED BY ANOTHER HOST’S ROOT KEY IS RESTORED AND SAYS, IN ONE SENTENCE, what will not open here', async () => {
  const data = scratch();
  const elsewhere = scratch();
  try {
    const lines = await cloudCopy(join(elsewhere, 'kek'));
    const file = join(data, 'nightly.brainl');
    writeFileSync(file, lines.join('\n'));

    const out = run(data, 'init', 'drill', '--from', file);
    assert.equal(out.code, 0, out.said);
    const said = out.said.split('\n');
    const at = said.findIndex((l) => l.startsWith('record drill restored from '));
    assert.ok(at >= 0, out.said);
    assert.match(
      said[at + 1]!,
      /^  its vault and its signing key were wrapped by another host’s root key, [0-9a-f]{18}\. On this host its sealed credentials do not open and what it exports goes out unsigned; /,
    );
    assert.equal(said.filter((l) => l.includes('root key')).length, 1, out.said);
    assert.ok(!out.said.includes('—'));
  } finally {
    rmSync(data, { recursive: true, force: true });
    rmSync(elsewhere, { recursive: true, force: true });
  }
});

test('A COPY THAT DOES NOT CHECK, OR IS SIGNED BY ANOTHER KEY THAN THE ONE NAMED, IS REFUSED BEFORE ANYTHING IS WRITTEN', async () => {
  const data = scratch();
  try {
    const lines = await cloudCopy(join(data, 'kek'));
    const file = join(data, 'nightly.brainl');

    /* ONE ROW CHANGED AND NOTHING ELSE: the manifest no longer matches, and nothing of the copy becomes a record. */
    const at = lines.findIndex((l) => l.includes('Renew the lease'));
    assert.ok(at > 0);
    writeFileSync(file, lines.map((l, i) => (i === at ? l.replace('Renew the lease', 'Renew the loan') : l)).join('\n'));
    const bent = run(data, 'init', 'drill', '--from', file);
    assert.equal(bent.code, 1, bent.said);
    assert.match(bent.said, /CHECKSUM_MISMATCH|does not match/u);
    assert.ok(!existsSync(join(data, 'drill')), 'a copy that did not check left a directory behind');

    /* THE RIGHT BYTES, AND A KEY THE CALLER NAMED THAT DID NOT SIGN THEM. */
    writeFileSync(file, lines.join('\n'));
    const stranger = generateKeyPairSync('ed25519').publicKey.export({ format: 'jwk' }).x!;
    const pinned = run(data, 'init', 'drill', '--from', file, '--key', stranger);
    assert.equal(pinned.code, 1, pinned.said);
    assert.match(pinned.said, /SIGNATURE_INVALID|not the key/u);
    assert.ok(!existsSync(join(data, 'drill')));

    /* A SEALED COPY IS NAMED FOR WHAT IT IS, and the sentence says how to open it. */
    writeFileSync(join(data, 'nightly.brainl.age'), 'age-encryption.org/v1\n-> X25519 abc\n');
    const sealed = run(data, 'init', 'drill', '--from', join(data, 'nightly.brainl.age'));
    assert.equal(sealed.code, 1);
    assert.match(sealed.said, /age -d/);

    /* AND A COPY THIS HOST ALREADY SERVES IS NOT RESTORED A SECOND TIME UNDER ANOTHER NAME: two names reaching two files
       that both say they are one record is the tenant map lying. */
    assert.equal(run(data, 'init', 'drill', '--from', file).code, 0);
    const twice = run(data, 'init', 'drill-2', '--from', file);
    assert.equal(twice.code, 1, twice.said);
    assert.match(twice.said, new RegExp(`${REC} is already served here as drill`));
    assert.ok(!existsSync(join(data, 'drill-2')));
    assert.equal(readFileSync(file, 'utf8'), lines.join('\n'), 'the copy was changed');
  } finally {
    rmSync(data, { recursive: true, force: true });
  }
});

test('A DIRECTORY THAT HOLDS THE OWNER’S ID UNDER ANOTHER ADDRESS IS REFUSED BEFORE THE RECORD IS WRITTEN, and a retry is not blocked by what it left', async () => {
  /* MEASURED ON THE FIRST DRAFT: the address check looked a person up by email only, so a Directory holding the copy's
     owner id under the address they had before answered `UNIQUE constraint failed: dir_person.id` from the insert, after
     the record had been imported, and left `<data>/drill/` behind, so the second try said "already exists". */
  const data = scratch();
  try {
    const lines = await cloudCopy(join(data, 'kek'));
    const file = join(data, 'nightly.brainl');
    writeFileSync(file, lines.join('\n'));
    const dirSql = openSqlite(join(data, 'directory.sqlite'));
    createDirectory(dirSql, { now: () => Date.now() });
    dirSql.exec("INSERT INTO dir_person (id, email, name, created_at) VALUES (?, 'ada@old.example.com', 'Ada', '2026-01-01T00:00:00.000Z')", PERSON);
    dirSql.close();

    for (let attempt = 0; attempt < 2; attempt++) {
      const out = run(data, 'init', 'drill', '--from', file);
      assert.equal(out.code, 1, out.said);
      assert.match(out.said, /ada@old\.example\.com/u, out.said);
      assert.doesNotMatch(out.said, /UNIQUE|already exists/u);
      assert.ok(!existsSync(join(data, 'drill')), 'a refused restore left the record behind');
    }
  } finally {
    rmSync(data, { recursive: true, force: true });
  }
});
