/**
 * `init` — the only way a record comes into being on a self-host.
 *
 * WHAT IS ASSERTED HERE IS THAT THE TWO HALVES AGREE. A record is a `record` row in one file and a
 * `dir_slug` row in another, written by two different statements against two different databases,
 * and every failure this command can have is one of them without the other: a name that resolves to
 * nothing, a record nothing can address, an owner the record does not know, or a bearer refused by
 * the server that issued it.
 *
 * IT RUNS THE REAL ENTRY IN A REAL PROCESS, because the thing under test is `main.ts` as the CLI
 * spawns it — its argv parsing, its exit codes and its one line of stderr together. A test that
 * imported `init()` would prove the function works and say nothing about the command.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openSqlite, start } from '../src/server.ts';

const MAIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'main.ts');

function run(data: string, ...args: string[]): { code: number; said: string } {
  const r = spawnSync(process.execPath, [MAIN, ...args], {
    encoding: 'utf8',
    env: { ...process.env, BRAINDOG_DATA: data, BRAINDOG_OWNER: '' },
  });
  return { code: r.status ?? -1, said: `${r.stdout}${r.stderr}` };
}

const scratch = (): string => mkdtempSync(join(tmpdir(), 'braindog-init-'));

test('A RECORD COMES INTO BEING, and both halves say the same thing', async () => {
  const data = scratch();
  try {
    const out = run(data, 'init', 'the-studio', '--owner', 'Ada@Example.com');
    assert.equal(out.code, 0, out.said);
    assert.match(out.said, /^record the-studio created · owner Ada@Example\.com · inbound email token at /m);

    /* THE FILE IS `record.dog`. Migration 0001 makes it one — 49 §4.3, and `record.sqlite` appears
       in none of the fifty-four documents. */
    const file = join(data, 'the-studio', 'record.dog');
    assert.ok(existsSync(file), 'the record was not created where the docs say it lives');
    assert.ok(existsSync(join(data, 'the-studio', 'blobs')), 'no blobs directory');
    assert.ok(existsSync(join(data, 'the-studio', 'snapshots')), 'no snapshots directory');

    const sql = openSqlite(file);
    const record = sql.one<{ id: string; slug: string }>('SELECT id, slug FROM record WHERE singleton = 1')!;
    assert.equal(record.slug, 'the-studio');
    assert.match(record.id, /^rec_[0-9A-HJKMNP-TV-Z]{26}$/);

    /* THE OWNER IS IN THE RECORD'S OWN `member` TABLE, which is the table every authorisation path
       reads — and their id is a real one. A constant here is a person no `member` row names, and a
       bearer minted for them is refused by the server that issued it. */
    const owner = sql.one<{ person_id: string; level: string }>("SELECT person_id, level FROM member WHERE register = '*'")!;
    assert.equal(owner.level, 'owner');
    assert.match(owner.person_id, /^p_[0-9A-HJKMNP-TV-Z]{26}$/);
    assert.equal(
      sql.one<{ email: string }>('SELECT email FROM person WHERE id = ?', owner.person_id)?.email,
      'Ada@Example.com',
      'the record does not know its own owner by address',
    );

    /* AND THE GRANT IS AN EVENT, like every other grant. */
    assert.equal(sql.all("SELECT 1 FROM event WHERE kind = 'access.grant'").length, 1);
    sql.close();

    /* THE DIRECTORY POINTS AT THE RECORD THAT WAS ACTUALLY CREATED. `provision` mints its own id
       when the caller does not name one, and then the two files disagree for ever. */
    const dirSql = openSqlite(join(data, 'directory.sqlite'));
    const named = dirSql.one<{ record: string }>("SELECT record FROM dir_slug WHERE slug = 'the-studio'")!;
    assert.equal(named.record, record.id, 'the Directory names a record that does not exist');
    assert.equal(
      dirSql.one<{ email: string }>('SELECT email FROM dir_person')?.email,
      'Ada@Example.com',
      'the address is stored as typed',
    );
    assert.equal(dirSql.one<{ level: string }>('SELECT level FROM dir_member')?.level, 'owner');
    dirSql.close();

    /* THE INBOUND TOKEN IS A PATH IN THE OUTPUT AND NEVER ITS CONTENTS. 49 §6: nothing at boot or on
       the wire ever prints a token. */
    const token = readFileSync(join(data, 'the-studio', 'inbound.token'), 'utf8');
    assert.equal(token.length, 43, 'the inbound token is not 32 bytes of base64url');
    assert.ok(!out.said.includes(token), 'the success line printed the token itself');
    if (process.platform !== 'win32')
      assert.equal(statSync(join(data, 'the-studio', 'inbound.token')).mode & 0o777, 0o600);
  } finally {
    rmSync(data, { recursive: true, force: true });
  }
});

test('AND A SECOND INIT IS A REFUSAL, not a second record', async () => {
  const data = scratch();
  try {
    assert.equal(run(data, 'init', 'the-studio', '--owner', 'ada@example.com').code, 0);
    const again = run(data, 'init', 'the-studio', '--owner', 'bo@example.com');
    assert.equal(again.code, 1);
    assert.match(again.said, /is already a record/);

    const dirSql = openSqlite(join(data, 'directory.sqlite'));
    assert.equal(dirSql.all('SELECT 1 FROM dir_record').length, 1, 'a refused init left a second record behind');
    assert.equal(dirSql.all('SELECT 1 FROM dir_person').length, 1, 'a refused init created a person');
    dirSql.close();
  } finally {
    rmSync(data, { recursive: true, force: true });
  }
});

test('a name that is not a name, and a record with no owner, are refused before anything is written', async () => {
  const data = scratch();
  try {
    for (const slug of ['The-Studio', '2024', 'x', 'studio-', '-studio', 'a'.repeat(33), 'a/b']) {
      const out = run(data, 'init', slug, '--owner', 'ada@example.com');
      assert.equal(out.code, 1, `${slug} was allowed`);
      assert.match(out.said, /is not a name/);
    }

    /* THE OWNER IS NOT OPTIONAL, and the docs do not say what a record with none would be. The
       Directory's `person.email` is NOT NULL, so there is no consistent thing to invent. */
    const none = run(data, 'init', 'the-studio');
    assert.equal(none.code, 1);
    assert.match(none.said, /needs an owner/);

    const bad = run(data, 'init', 'the-studio', '--owner', 'not-an-address');
    assert.equal(bad.code, 1);
    assert.match(bad.said, /is not an address/);

    assert.equal(existsSync(join(data, 'the-studio')), false, 'a refused init left a directory behind');
    assert.equal(existsSync(join(data, 'directory.sqlite')), false, 'a refused init left a Directory behind');

    /* AND THE NAME IS STILL AVAILABLE, which is the whole point of refusing before anything is
       written: a bad address must not cost somebody their first attempt at the name they wanted. */
    assert.equal(run(data, 'init', 'the-studio', '--owner', 'ada@example.com').code, 0);
  } finally {
    rmSync(data, { recursive: true, force: true });
  }
});

test('AND A COMMAND THIS HOST DOES NOT HAVE IS ONE SENTENCE, not a stack', async () => {
  const data = scratch();
  try {
    const out = run(data, 'nonsense');
    assert.equal(out.code, 1);
    /* THE LAST LINE, because Node prints its own experimental-SQLite warning first and that is the
       runtime's sentence rather than this command's. */
    assert.equal(out.said.trim().split(String.fromCharCode(10)).at(-1), 'braindog has no nonsense. It has serve and init.');

    /* AND `serve` WITH NOTHING TO SERVE SAYS WHAT TO DO ABOUT IT, rather than starting a server for
       a record nobody created — which is what an empty file quietly becomes. */
    const empty = run(data, 'serve');
    assert.equal(empty.code, 1);
    assert.match(empty.said, /braindog init <slug> --owner <email>/);
  } finally {
    rmSync(data, { recursive: true, force: true });
  }
});

test('AND A BEARER MINTED AFTER IT WORKS, which is the whole point of writing an owner', async () => {
  /* THE LOOP THAT DID NOT CLOSE. An unauthenticated request was a constant person, `p_self`, which
     was correct while nothing could create a record — and quietly wrong the moment `init` could: a
     token minted under that constant names a person with no `member` row, so `access()` returns
     null and the server refuses, with 403, the bearer it had just issued. */
  const data = scratch();
  let running: Awaited<ReturnType<typeof start>> | null = null;
  try {
    assert.equal(run(data, 'init', 'the-studio', '--owner', 'ada@example.com').code, 0);

    running = await start({ file: join(data, 'the-studio', 'record.dog'), port: 0, pollMs: 0 });
    const at = (running.server.address() as { port: number }).port;

    const minted = (await (
      await fetch(`http://127.0.0.1:${at}/api/createToken`, {
        method: 'POST',
        body: JSON.stringify({ scope: 'write', label: 'a laptop', days: 30 }),
      })
    ).json()) as { ok: boolean; value?: { bearer: string }; refusal?: { code: string; fix: string } };
    assert.ok(minted.ok, `the record refused to mint a token: ${minted.refusal?.code} ${minted.refusal?.fix}`);

    const bearer = minted.value!.bearer;
    assert.match(bearer, /^rec_[0-9A-HJKMNP-TV-Z]{26}\./, 'a bearer carries the record it is for');

    const said = await fetch(`http://127.0.0.1:${at}/api/whoami`, { headers: { authorization: `Bearer ${bearer}` } });
    const who = (await said.json()) as { ok: boolean; value?: { level: string; scope?: string }; refusal?: { code: string } };
    assert.equal(said.status, 200, `the server refused the bearer it issued: ${who.refusal?.code}`);
    assert.ok(who.ok);
    /* THE PERSON'S LEVEL AND THE TOKEN'S SCOPE ARE TWO LADDERS, and this is where they intersect: the
       owner holds `owner`, and the token they minted may do `write` with it. A token never carries a
       level of its own — ADR-060 — so `owner` here is the person the bearer belongs to. */
    assert.equal(who.value?.level, 'owner', 'the bearer named somebody the record does not know');
    assert.equal(who.value?.scope, 'write', 'the token was minted at one scope and read back at another');
  } finally {
    await running?.close();
    rmSync(data, { recursive: true, force: true });
  }
});
