/**
 * `init`: the only way a record comes into being on a self-host.
 *
 * WHAT IS ASSERTED HERE IS THAT THE TWO HALVES AGREE. A record is a `record` row in one file and a
 * `dir_slug` row in another, written by two different statements against two different databases,
 * and every failure this command can have is one of them without the other: a name that resolves to
 * nothing, a record nothing can address, an owner the record does not know, or a bearer refused by
 * the server that issued it.
 *
 * IT RUNS THE REAL ENTRY IN A REAL PROCESS, because the thing under test is `main.ts` as the CLI
 * spawns it: its argv parsing, its exit codes and its one line of stderr together. A test that
 * imported `init()` would prove the function works and say nothing about the command.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createDirectory } from '@braindog/record/directory';

import { checkBrainl } from '@braindog/kernel';
import { createRecordApi } from '@braindog/record';

import { openKeyStore, unwrap } from '../src/keys.ts';
import { signerFor } from '../src/sign.ts';
import { openSqlite, start } from '../src/server.ts';

const MAIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'main.ts');

/**
 * THE TWO STREAMS ARE KEPT APART, because one of the contracts is about which one carries what.
 * `48 §5.14` spawns this with `stdio: 'inherit'` and stdout belongs to the CLI's `--json` envelope,
 * so a merged capture cannot tell a correct command from one that corrupts it.
 */
function run(data: string, ...args: string[]): { code: number; said: string; out: string } {
  const r = spawnSync(process.execPath, [MAIN, ...args], {
    encoding: 'utf8',
    env: { ...process.env, BRAINDOG_DATA: data, BRAINDOG_OWNER: '' },
  });
  return { code: r.status ?? -1, said: r.stderr, out: r.stdout };
}

const scratch = (): string => mkdtempSync(join(tmpdir(), 'braindog-init-'));

test('A RECORD COMES INTO BEING, and both halves say the same thing', async () => {
  const data = scratch();
  try {
    const out = run(data, 'init', 'the-studio', '--owner', ' Ada@Example.com ');
    assert.equal(out.code, 0, out.said);
    /* TRIMMED AND LOWER-CASED, 49 §4.1, and the whitespace used to travel as far as `provision`,
       which looked up an address `person$` had already stored trimmed and refused "has no account
       yet", after the record file had been written. */
    assert.match(out.said, /^record the-studio created · owner ada@example\.com · inbound email token at /m);
    assert.equal(out.out, '', 'stdout belongs to the CLI’s --json envelope');

    /* THE FILE IS `record.brain`. Migration 0001 makes it one, 49 §4.3, and `record.sqlite` appears
       in none of the fifty-four documents. */
    const file = join(data, 'the-studio', 'record.brain');
    assert.ok(existsSync(file), 'the record was not created where the docs say it lives');
    assert.ok(existsSync(join(data, 'the-studio', 'blobs')), 'no blobs directory');
    assert.ok(existsSync(join(data, 'the-studio', 'snapshots')), 'no snapshots directory');

    const sql = openSqlite(file);
    const record = sql.one<{ id: string; slug: string }>('SELECT id, slug FROM record WHERE singleton = 1')!;
    assert.equal(record.slug, 'the-studio');
    assert.match(record.id, /^rec_[0-9A-HJKMNP-TV-Z]{26}$/);

    /* THE OWNER IS IN THE RECORD'S OWN `member` TABLE, which is the table every authorisation path
       reads, and their id is a real one. A constant here is a person no `member` row names, and a
       bearer minted for them is refused by the server that issued it. */
    const owner = sql.one<{ person_id: string; level: string }>("SELECT person_id, level FROM member WHERE register = '*'")!;
    assert.equal(owner.level, 'owner');
    assert.match(owner.person_id, /^p_[0-9A-HJKMNP-TV-Z]{26}$/);
    assert.equal(
      sql.one<{ email: string }>('SELECT email FROM person WHERE id = ?', owner.person_id)?.email,
      'ada@example.com',
      'the record does not know its own owner by address',
    );

    /* AND THE GRANT IS AN EVENT, like every other grant. */
    assert.equal(sql.all("SELECT 1 FROM event WHERE kind = 'access.grant'").length, 1);

    /* THE THREE KEYS ARE THERE, AND THEY OPEN. 49 §5.22 step 4, and a record created without them
       boots, serves, accepts writes and cannot seal one of them: `openGrant` has nothing to open
       with, `bindGrant` nothing to bind under, and a snapshot nothing to sign. Rows alone prove
       nothing, so each one is opened here under the KEK the command made. */
    const keychain = sql.all<{ purpose: string; wrapped: Uint8Array; nonce: Uint8Array; kek_id: string; wrapped_by: string }>(
      'SELECT purpose, wrapped, nonce, kek_id, wrapped_by FROM vault_key ORDER BY purpose',
    );
    assert.deepEqual(keychain.map((v) => v.purpose), ['connector', 'record', 'signing'], '30 §1: three vault_key rows');

    const store = await openKeyStore(join(data, 'kek'));
    for (const row of keychain) {
      assert.equal(row.wrapped_by, 'kek');
      assert.equal(row.kek_id, (await store.current()).kekId, 'wrapped under a key this host does not hold');
      const open = await unwrap(store, record.id, row.purpose as 'record', {
        wrapped: new Uint8Array(row.wrapped),
        nonce: new Uint8Array(row.nonce),
        kek_id: row.kek_id,
        wrapped_by: 'kek',
      });
      assert.ok(open, `the ${row.purpose} key does not open under the KEK that wrapped it`);
    }

    /* AND THE BINDING IS TO THIS RECORD. A row copied into another record's file does not open,
       which is the whole of 12 §6's AAD, and is invisible from reading the code. */
    const first = keychain[0]!;
    assert.equal(
      await unwrap(store, 'rec_SOMEBODY_ELSE', 'connector', {
        wrapped: new Uint8Array(first.wrapped),
        nonce: new Uint8Array(first.nonce),
        kek_id: first.kek_id,
        wrapped_by: 'kek',
      }),
      null,
      'a wrapped key opened under a record it was not made for',
    );
    sql.close();

    /* THE DIRECTORY POINTS AT THE RECORD THAT WAS ACTUALLY CREATED. `provision` mints its own id
       when the caller does not name one, and then the two files disagree for ever. */
    const dirSql = openSqlite(join(data, 'directory.sqlite'));
    const named = dirSql.one<{ record: string }>("SELECT record FROM dir_slug WHERE slug = 'the-studio'")!;
    assert.equal(named.record, record.id, 'the Directory names a record that does not exist');
    assert.equal(
      dirSql.one<{ email: string }>('SELECT email FROM dir_person')?.email,
      'ada@example.com',
      'the address is not stored trimmed and lower-cased',
    );
    /* THE DIRECTORY SAYS WHICH RECORD AND THE RECORD SAYS WHAT MAY BE DONE. `dir_member` carried a
       level and that was a second copy of one, in a database that cannot be written in the same
       transaction as the record's own `member` table, so the two disagreed the moment anybody was
       invited. The owner is named once, on the record's row. */
    assert.equal(dirSql.all('SELECT 1 FROM dir_member').length, 1);
    assert.equal(
      dirSql.one<{ owner: string }>('SELECT owner FROM dir_record')?.owner,
      dirSql.one<{ id: string }>('SELECT id FROM dir_person')?.id,
      'the directory does not name the person who owns the record it just made',
    );
    dirSql.close();

    /* THE INBOUND TOKEN IS A PATH IN THE OUTPUT AND NEVER ITS CONTENTS. 49 §6: nothing at boot or on
       the wire ever prints a token. */
    const token = readFileSync(join(data, 'the-studio', 'inbound.token'), 'utf8');
    assert.equal(token.length, 43, 'the inbound token is not 32 bytes of base64url');
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.ok(!out.said.includes(token), 'the success line printed the token itself');

    /* AND IT IS RANDOM, not a constant of the right length. A second record's is a different one. */
    assert.equal(run(data, 'init', 'kiln', '--owner', 'bo@example.com', '--alongside').code, 0);
    assert.notEqual(readFileSync(join(data, 'kiln', 'inbound.token'), 'utf8'), token);
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
    assert.match(again.said, /is already somebody's BrainDog here/);

    const dirSql = openSqlite(join(data, 'directory.sqlite'));
    assert.equal(dirSql.all('SELECT 1 FROM dir_record').length, 1, 'a refused init left a second record behind');
    /* AND IT CREATED NOBODY. The refusal now fires before `person$`, so a second init with a
       different address does not leave that address in the installation's person table, which the
       earlier version of this assertion could not have caught, because the refusal already came
       first for a different reason. */
    assert.equal(dirSql.all('SELECT 1 FROM dir_person').length, 1, 'a refused init created a person');
    assert.equal(dirSql.all("SELECT 1 FROM dir_person WHERE email = 'bo@example.com'").length, 0);
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

    /* A RESERVED NAME, WHICH `init`'S OWN COPY OF THE GRAMMAR DID NOT KNOW. It passed the shape,
       built the directory and thirty-one tables, and was refused by the Directory at the end, and
       the leftover was then a record a later `init` could adopt. */
    for (const slug of ['api', 'auth', 'mcp', 'www']) {
      const out = run(data, 'init', slug, '--owner', 'ada@example.com');
      assert.equal(out.code, 1, `${slug} was allowed`);
      assert.match(out.said, /the platform uses/);
      assert.equal(existsSync(join(data, slug)), false, `${slug} was refused after it was built`);
    }

    assert.equal(existsSync(join(data, 'the-studio')), false, 'a refused init left a directory behind');
    /* The Directory itself is the INSTALLATION's and not a record's, so an empty one is not a
       leftover. What must not be there is a row. */
    const dirSql = openSqlite(join(data, 'directory.sqlite'));
    assert.equal(dirSql.all('SELECT 1 FROM dir_record').length, 0, 'a refused init left a record behind');
    assert.equal(dirSql.all('SELECT 1 FROM dir_person').length, 0, 'a refused init left a person behind');
    dirSql.close();

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
    assert.match(out.said.trim().split(String.fromCharCode(10)).at(-1) ?? '', /^There is no nonsense here\. It has serve, init, backup, restore and invite; node \S+main\.ts --help says what each takes\.$/);

    /* AND --help IS AN ANSWER, not a refusal: each command as it is run here, and exit 0. */
    const help = run(data, '--help');
    assert.equal(help.code, 0, help.said);
    for (const word of ['init <name> --owner <email>', 'backup <folder>', 'restore <backup folder>']) assert.ok(help.said.includes(word), word);

    /* AND `serve` WITH NOTHING TO SERVE SAYS WHAT TO DO ABOUT IT, rather than starting a server for
       a record nobody created, which is what an empty file quietly becomes. */
    const empty = run(data, 'serve');
    assert.equal(empty.code, 1);
    assert.match(empty.said, /main\.ts init <name> --owner <your email>/);
  } finally {
    rmSync(data, { recursive: true, force: true });
  }
});

test('MINTING A BEARER NEEDS A CREDENTIAL, and the one it mints then works', async () => {
  /* THE LOOP THAT DID NOT CLOSE. An unauthenticated request was a constant person, `p_self`, which
     was correct while nothing could create a record, and quietly wrong the moment `init` could: a
     token minted under that constant names a person with no `member` row, so `access()` returns null
     and the server refuses, with 403, the bearer it had just issued.

     AND CLOSING IT MADE A SECOND HOLE VISIBLE. Reading and writing as the owner without a credential
     is the documented shape of one person on one machine: the process binds loopback, and the
     machine is the boundary. A BEARER OUTLIVES THAT BOUNDARY: it works from anywhere, for thirty
     days, including after the operator later sets a token and the process binds every interface. So
     anything that could reach loopback for one moment walked away with a portable owner credential.
     49 §5.2 step 7: ADMIN admits a cookie, `config.token`, or an operation grant. */
  const data = scratch();
  const SECRET = 'a-shared-secret';
  let running: Awaited<ReturnType<typeof start>> | null = null;
  try {
    assert.equal(run(data, 'init', 'the-studio', '--owner', 'ada@example.com').code, 0);

    /* FIRST WITH NO SHARED SECRET, which is how a self-host is started by default and the shape the
       hole lived in: every request is the owner, and every request could therefore mint. */
    const open = await start({ file: join(data, 'the-studio', 'record.brain'), port: 0, pollMs: 0 });
    const openAt = (open.server.address() as { port: number }).port;
    const bare = await fetch(`http://127.0.0.1:${openAt}/api/createToken`, {
      method: 'POST',
      body: JSON.stringify({ scope: 'write', label: 'anyone', days: 30 }),
    });
    const said = (await bare.json()) as { refusal?: { code: string; fix: string } };
    await open.close();

    assert.equal(bare.status, 403, 'a request carrying nothing minted a bearer that works from anywhere');
    assert.equal(said.refusal?.code, 'NEEDS_BROWSER_SESSION');
    assert.match(said.refusal!.fix, /BRAINDOG_SERVER_KEY/);

    /* AND THEN WITH ONE. Reading and writing without a credential stays what it was; minting is the
       one call that needed the operator to have said something. */
    running = await start({ file: join(data, 'the-studio', 'record.brain'), port: 0, pollMs: 0, token: SECRET, host: '127.0.0.1' });
    const at = (running.server.address() as { port: number }).port;
    const mint = (headers: Record<string, string> = {}) =>
      fetch(`http://127.0.0.1:${at}/api/createToken`, {
        method: 'POST',
        body: JSON.stringify({ scope: 'write', label: 'a laptop', days: 30 }),
        headers,
      });

    const minted = (await (await mint({ authorization: `Bearer ${SECRET}` })).json()) as {
      ok: boolean;
      value?: { bearer: string };
      refusal?: { code: string; fix: string };
    };
    assert.ok(minted.ok, `the record refused to mint a token: ${minted.refusal?.code} ${minted.refusal?.fix}`);

    const bearer = minted.value!.bearer;
    assert.match(bearer, /^rec_[0-9A-HJKMNP-TV-Z]{26}\./, 'a bearer carries the record it is for');

    const answer = await fetch(`http://127.0.0.1:${at}/api/whoami`, { headers: { authorization: `Bearer ${bearer}` } });
    const who = (await answer.json()) as { ok: boolean; value?: { level: string; scope?: string }; refusal?: { code: string } };
    assert.equal(answer.status, 200, `the server refused the bearer it issued: ${who.refusal?.code}`);
    /* THE PERSON'S LEVEL AND THE TOKEN'S SCOPE ARE TWO LADDERS, and this is where they intersect: the
       owner holds `owner`, and the token they minted may do `write` with it. */
    assert.equal(who.value?.level, 'owner', 'the bearer named somebody the record does not know');
    assert.equal(who.value?.scope, 'write', 'the token was minted at one scope and read back at another');
  } finally {
    await running?.close();
    rmSync(data, { recursive: true, force: true });
  }
});

test('A RECORD FILE THAT ALREADY HOLDS A RECORD IS NEVER ADOPTED', async () => {
  /* THE HOLE THAT RELAXING 49 §5.22 STEP 2 OPENED. The guard became "the Directory does not name
     this slug", and three ordinary things satisfy that while a live record sits on disk: delete
     `directory.sqlite`, rename the record, or restore a backup without it. `createRecord` is an
     upsert, so the next `init` added whoever ran it as a SECOND OWNER and rewrote the record's slug,
     name, timezone and locale to their arguments: exit 0, "record created". */
  const data = scratch();
  try {
    assert.equal(run(data, 'init', 'the-studio', '--owner', 'ada@example.com').code, 0);
    rmSync(join(data, 'directory.sqlite'), { force: true });
    rmSync(join(data, 'directory.sqlite-wal'), { force: true });
    rmSync(join(data, 'directory.sqlite-shm'), { force: true });

    const taken = run(data, 'init', 'the-studio', '--owner', 'mallory@example.com');
    assert.equal(taken.code, 1, 'a live record was handed to whoever ran init next');
    assert.match(taken.said, /already holds the record the-studio/);

    const sql = openSqlite(join(data, 'the-studio', 'record.brain'));
    assert.equal(sql.all("SELECT 1 FROM member WHERE register = '*'").length, 1, 'a second owner was added');
    assert.equal(
      sql.one<{ email: string }>("SELECT p.email FROM member m JOIN person p ON p.id = m.person_id WHERE m.register = '*'")?.email,
      'ada@example.com',
      'the record was adopted',
    );
    sql.close();
  } finally {
    rmSync(data, { recursive: true, force: true });
  }
});

test('AND A NAME WITH NO RECORD BEHIND IT IS NOT REISSUED, nor half-created', async () => {
  /* The other half of the same relaxation: with the FILE gone and the Directory row still there,
     `init` built a whole new record with a new id and only then refused, so `dir_slug` named
     `rec_A` and the file on disk was `rec_B`, for ever, with every bearer it minted rejected by
     anything that checks the two against each other. */
  const data = scratch();
  try {
    assert.equal(run(data, 'init', 'the-studio', '--owner', 'ada@example.com').code, 0);
    const dirSql = openSqlite(join(data, 'directory.sqlite'));
    const was = dirSql.one<{ record: string }>("SELECT record FROM dir_slug WHERE slug = 'the-studio'")!.record;
    dirSql.close();

    rmSync(join(data, 'the-studio'), { recursive: true, force: true });
    const again = run(data, 'init', 'the-studio', '--owner', 'ada@example.com');
    assert.equal(again.code, 1);
    assert.match(again.said, /is already somebody's BrainDog here/);
    assert.equal(existsSync(join(data, 'the-studio')), false, 'a refused init rebuilt the record it refused');

    const after = openSqlite(join(data, 'directory.sqlite'));
    assert.equal(after.one<{ record: string }>("SELECT record FROM dir_slug WHERE slug = 'the-studio'")?.record, was);
    after.close();
  } finally {
    rmSync(data, { recursive: true, force: true });
  }
});

test('AND `serve` WITH A PATH THAT IS NOT A RECORD REFUSES, rather than making one', async () => {
  /* `openSqlite` CREATES the file, so a mistyped flag became a fully migrated thirty-one-table
     record named `--port=9999`, served on the port, with every anonymous request its owner. The
     multi-record refusal tells people to use this branch, which made it the likeliest way in. */
  const data = scratch();
  try {
    const out = run(data, 'serve', '--port=9999');
    assert.equal(out.code, 1);
    assert.match(out.said, /is not a record/);
    assert.equal(existsSync(join(data, '--port=9999')), false, 'a mistyped flag became a record');
    assert.equal(existsSync('--port=9999'), false, 'a mistyped flag became a record in the working directory');
  } finally {
    rmSync(data, { recursive: true, force: true });
  }
});

test('A HEADER WITH NOTHING IN IT IS NOT A CREDENTIAL', async () => {
  /* `headers.get` returns `''` for a bare `Authorization:` line, and `'' !== undefined`, so one
     byte walked straight through the check added to stop exactly this. `Authorization: Bearer` did
     it too, because the strip needs whitespace after the word for the pattern to match, so `Bearer`
     itself became the credential. Every one of these minted an owner bearer that works from
     anywhere, for thirty days. */
  const data = scratch();
  let running: Awaited<ReturnType<typeof start>> | null = null;
  try {
    assert.equal(run(data, 'init', 'the-studio', '--owner', 'ada@example.com').code, 0);
    running = await start({ file: join(data, 'the-studio', 'record.brain'), port: 0, pollMs: 0 });
    const at = (running.server.address() as { port: number }).port;

    for (const authorization of ['', ' ', 'Bearer', 'Bearer ', 'Bearer   ', 'x', 'Basic abc']) {
      const said = await fetch(`http://127.0.0.1:${at}/api/createToken`, {
        method: 'POST',
        body: JSON.stringify({ scope: 'write', label: 'anyone', days: 30 }),
        headers: { authorization },
      });
      assert.notEqual(said.status, 200, `\`${authorization}\` minted a bearer that works from anywhere`);
      await said.arrayBuffer();
    }

    /* AND SOMETHING THAT MATCHED NOTHING IS REFUSED OUTRIGHT, rather than read as nothing:
       49 §5.4 step 1. It used to fall through: `Authorization: x` on a self-host with no shared
       secret was the owner, which reads even less like a hole than the empty header. */
    const wrong = await fetch(`http://127.0.0.1:${at}/api/boot`, { headers: { authorization: 'nonsense' } });
    assert.equal(wrong.status, 401, 'a credential that matched nothing was treated as no credential');
    await wrong.arrayBuffer();

    // And nothing presented at all still reads, which is what one person on one machine means.
    const bare = await fetch(`http://127.0.0.1:${at}/api/boot`);
    assert.equal(bare.status, 200, 'a self-host with no token stopped answering its owner');
    await bare.arrayBuffer();
  } finally {
    await running?.close();
    rmSync(data, { recursive: true, force: true });
  }
});

test('AND A DATA DIRECTORY THAT DOES NOT EXIST YET IS CREATED, which is every first run', async () => {
  /* The primary happy path, against the documented default `/data`: nothing exists yet. Moving the
     refusals before the writes moved the Directory open ahead of the `mkdir` that makes a place for
     it, so `init` answered "unable to open database file" (naming a database the operator never
     mentioned) and created nothing. Every test in this file passed, because `mkdtemp` had always
     made the directory first. */
  const parent = scratch();
  const data = join(parent, 'nested', 'data');
  try {
    const out = run(data, 'init', 'the-studio', '--owner', 'ada@example.com');
    assert.equal(out.code, 0, out.said);
    assert.ok(existsSync(join(data, 'the-studio', 'record.brain')));
    if (process.platform !== 'win32') {
      assert.equal(statSync(data).mode & 0o777, 0o700, 'the installation root is readable by anybody');
      assert.equal(statSync(join(data, 'the-studio')).mode & 0o777, 0o700, "the record's own directory is readable by anybody");
    }
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('AND A RELEASED NAME IS NEVER REISSUED, which is the whole tenant boundary', async () => {
  const data = scratch();
  try {
    assert.equal(run(data, 'init', 'the-studio', '--owner', 'ada@example.com').code, 0);

    /* Renaming releases the old name. Every stale link still says it, so handing it to the next
       person who asks is how one of them reads another customer's record. */
    const dirSql = openSqlite(join(data, 'directory.sqlite'));
    const directory = createDirectory(dirSql, { now: () => Date.now() });
    assert.ok(directory.rename('the-studio', 'halden').ok);
    dirSql.close();

    const again = run(data, 'init', 'the-studio', '--owner', 'bo@example.com');
    assert.equal(again.code, 1, 'a released name was given out again');
    assert.match(again.said, /cannot be given out again/);

    /* AND THE RECORD THE NAME USED TO MEAN IS UNTOUCHED. Its directory is still there (a rename
       moves a row and never a file) so the refusal has to come from the Directory rather than from
       anything on disk, and bo must not appear anywhere in it. */
    const sql = openSqlite(join(data, 'the-studio', 'record.brain'));
    assert.equal(sql.all("SELECT 1 FROM member WHERE register = '*'").length, 1, 'a released name added an owner');
    assert.equal(sql.one<{ slug: string }>('SELECT slug FROM record WHERE singleton = 1')?.slug, 'the-studio');
    assert.equal(sql.all("SELECT 1 FROM person WHERE email = 'bo@example.com'").length, 0);
    sql.close();
  } finally {
    rmSync(data, { recursive: true, force: true });
  }
});

test('A SECOND RECORD IN A LIVE DATA FOLDER IS REFUSED, because the next start would refuse and a container would restart for ever', async () => {
  /* MEASURED: `init second` on a folder already holding `home` exited 0, and `serve` then refused "holds 2 records",
     which under Docker's bare `serve` is a restart loop. The refusal comes before anything is written. */
  const data = scratch();
  try {
    assert.equal(run(data, 'init', 'home', '--owner', 'ada@example.com').code, 0);
    const second = run(data, 'init', 'second', '--owner', 'ada@example.com');
    assert.equal(second.code, 1, second.said);
    assert.match(second.said, /already holds the record home, and this host serves one record, so second was not made/);
    assert.match(second.said, /empty data folder/);
    assert.ok(!existsSync(join(data, 'second')), 'the refused record left a folder behind');

    /* AND A COPY IS REFUSED THE SAME WAY, before the file is even read. */
    const copy = run(data, 'init', 'drill', '--from', join(data, 'nowhere.brainl'));
    assert.equal(copy.code, 1, copy.said);
    assert.match(copy.said, /already holds the record home/);
  } finally {
    rmSync(data, { recursive: true, force: true });
  }
});

test('AND `serve` SERVES THE ONE RECORD IT HAS, even beside a name whose file is gone', async () => {
  /* 49 §5.1 step 6: "a `record_dir` row with no directory … is logged as `slug` and skipped."
     Counting it made a host with exactly one servable record refuse to start, saying it held two,
     and nothing on the machine would then start it. */
  const data = scratch();
  try {
    assert.equal(run(data, 'init', 'one', '--owner', 'ada@example.com').code, 0);
    assert.equal(run(data, 'init', 'two', '--owner', 'ada@example.com', '--alongside').code, 0);

    const both = run(data, 'serve');
    assert.equal(both.code, 1, 'a host with two records served one of them');
    assert.match(both.said, /holds 2 records/);

    rmSync(join(data, 'two'), { recursive: true, force: true });
    /* It starts now, which cannot be asserted by running `serve` to completion, so the property is
       that it no longer refuses for the reason it used to. */
    const one = spawnSync(process.execPath, [MAIN, 'serve'], {
      encoding: 'utf8',
      timeout: 4000,
      env: { ...process.env, BRAINDOG_DATA: data, PORT: '0' },
    });
    assert.ok(!`${one.stderr}`.includes('holds 2 records'), 'a name with no file behind it was counted as a record');
  } finally {
    rmSync(data, { recursive: true, force: true });
  }
});


/* -- what a killed run leaves, and whether anything can finish it ---------- */

/** Every Directory file, gone, which is what "restore a backup without it" looks like on disk. */
function loseTheDirectory(data: string): void {
  for (const suffix of ['', '-wal', '-shm']) rmSync(join(data, `directory.sqlite${suffix}`), { force: true });
}

test('A RUN KILLED BEFORE THE MIGRATION FINISHED IS FINISHED BY THE NEXT ONE', async () => {
  /* `init` creates `record.brain` and migrates it as two steps. Killed between them, the file exists
     with no tables, and the branch written to make that recoverable was the branch that made it
     permanent: `SELECT id FROM record` threw `no such table: record` out of the command, printed
     SQLite's sentence with no path in it, and did the same on every retry for ever. */
  const data = scratch();
  try {
    mkdirSync(join(data, 'the-studio'), { recursive: true });
    writeFileSync(join(data, 'the-studio', 'record.brain'), '');

    const out = run(data, 'init', 'the-studio', '--owner', 'ada@example.com');
    assert.equal(out.code, 0, out.said);
    assert.match(out.said, /^record the-studio created/m);

    const sql = openSqlite(join(data, 'the-studio', 'record.brain'));
    assert.equal(sql.one<{ slug: string }>('SELECT slug FROM record WHERE singleton = 1')?.slug, 'the-studio');
    sql.close();
  } finally {
    rmSync(data, { recursive: true, force: true });
  }
});

test('AND A RECORD THE DIRECTORY NEVER HEARD OF IS FINISHED FOR THE PERSON WHOSE IT IS', async () => {
  /* `49 §5.22` writes the record at step 6 and the Directory rows at step 7, deliberately, so a
     name never resolves to a record that failed. What that ordering leaves when it is interrupted is
     a whole record nothing can address: `init` refused "already holds the record" for ever and
     `serve` answered "there is no record in <data>". */
  const data = scratch();
  try {
    assert.equal(run(data, 'init', 'the-studio', '--owner', 'ada@example.com').code, 0);
    const sql = openSqlite(join(data, 'the-studio', 'record.brain'));
    const was = sql.one<{ id: string }>('SELECT id FROM record WHERE singleton = 1')!.id;
    sql.close();

    /* The two rows step 7 writes, removed, which is what a kill between the two steps leaves. */
    const dirSql = openSqlite(join(data, 'directory.sqlite'));
    dirSql.exec("DELETE FROM dir_slug WHERE slug = 'the-studio'");
    dirSql.exec('DELETE FROM dir_record');
    dirSql.exec('DELETE FROM dir_member');
    dirSql.close();

    const again = run(data, 'init', 'the-studio', '--owner', 'ada@example.com');
    assert.equal(again.code, 0, again.said);
    assert.match(again.said, /finished/);

    const after = openSqlite(join(data, 'directory.sqlite'));
    assert.equal(
      after.one<{ record: string }>("SELECT record FROM dir_slug WHERE slug = 'the-studio'")?.record,
      was,
      'the directory names a record other than the one on disk',
    );
    after.close();

    /* AND THE RECORD WAS NOT REMADE. One owner, one id, one create. */
    const check = openSqlite(join(data, 'the-studio', 'record.brain'));
    assert.equal(check.one<{ id: string }>('SELECT id FROM record WHERE singleton = 1')?.id, was);
    assert.equal(check.all("SELECT 1 FROM member WHERE register = '*'").length, 1);
    check.close();
  } finally {
    rmSync(data, { recursive: true, force: true });
  }
});

test('BUT NOT FOR SOMEBODY ELSE, which is the hole the whole check exists to close', async () => {
  /* Deleting `directory.sqlite` produces the same evidence as a killed run: a record on disk that
     the Directory does not name. Adopting on that alone hands a live record to whoever runs `init`
     next, and the address is the thing that tells the two apart, because the retry of a killed run
     is literally the same command. */
  const data = scratch();
  try {
    assert.equal(run(data, 'init', 'the-studio', '--owner', 'ada@example.com').code, 0);
    loseTheDirectory(data);

    const taken = run(data, 'init', 'the-studio', '--owner', 'mallory@example.com');
    assert.equal(taken.code, 1, 'a live record was handed to whoever ran init next');
    assert.match(taken.said, /already holds the record the-studio/);

    /* AND NOT FOR THE RIGHT ADDRESS ATTACHED TO THE WRONG DIRECTORY EITHER. The Directory is new, so
       `ada@example.com` mints a new person id, and provisioning against it would leave `dir_member`
       and the record's own `member` naming two different people for one owner. */
    const wrongDir = run(data, 'init', 'the-studio', '--owner', 'ada@example.com');
    assert.equal(wrongDir.code, 1, 'a record was re-provisioned against a directory that never held its owner');
    assert.match(wrongDir.said, /a person this directory does not know/);

    const sql = openSqlite(join(data, 'the-studio', 'record.brain'));
    assert.equal(sql.all("SELECT 1 FROM member WHERE register = '*'").length, 1, 'a second owner was added');
    sql.close();
  } finally {
    rmSync(data, { recursive: true, force: true });
  }
});

test('THE RECORD FILE IS NOT WORLD-READABLE, and neither is its write-ahead log', { skip: process.platform === 'win32' }, () => {
  /* `<slug>/` is 0700 so nobody can walk to it, but a backup that copies file modes and a `docker cp`
     out of the directory both carry the file's own bits, and this file holds every token hash and
     every sealed grant. SQLite gives the sidecars the main file's mode at the moment it creates
     them, which is inside the migration, so the `chmod` has to happen before it. */
  const data = scratch();
  try {
    assert.equal(run(data, 'init', 'the-studio', '--owner', 'ada@example.com').code, 0);
    assert.equal(statSync(join(data, 'the-studio', 'record.brain')).mode & 0o777, 0o600);
    assert.equal(statSync(join(data, 'directory.sqlite')).mode & 0o777, 0o600);
  } finally {
    rmSync(data, { recursive: true, force: true });
  }
});

test('A KEY FILE THAT IS NOT A KEY COSTS NOBODY THE NAME THEY WANTED', () => {
  /* `49 §5.1` step 2 opens the KEK before the Directory, and this is why: everything after that
     point creates something, and an `init` that made a record and only then could not find a key to
     wrap it with would leave a record nothing can seal and a name resolving to it. */
  const data = scratch();
  try {
    mkdirSync(data, { recursive: true });
    /* `mode: 0o600`, AND IT IS THE ASSERTION BELOW THAT NEEDS IT. `openKeyStore` checks the
       permission bits before the length, and skips that check on Windows where the bit is advisory
       (`49 §4.4`). Written with no mode, this file arrives 0644 under a default umask, and on Linux
       the run refuses `mode 644` instead of `is 9 bytes`, so the test passes here and fails there,
       on a sentence it is not about. The third fixture in this repository with that shape; the
       other two are in `keys.test.ts`, behind a `writeKey` helper for the same reason. */
    writeFileSync(join(data, 'kek'), 'too short', { mode: 0o600 });

    const out = run(data, 'init', 'the-studio', '--owner', 'ada@example.com');
    assert.equal(out.code, 1);
    assert.match(out.said, /is 9 bytes and a key is 32/);
    assert.ok(!existsSync(join(data, 'the-studio')), 'a record directory was made before the key was checked');
    assert.ok(!existsSync(join(data, 'directory.sqlite')), 'the directory was opened before the key was checked');
  } finally {
    rmSync(data, { recursive: true, force: true });
  }
});


/* -- and the file it exports can be checked by somebody else -------------- */

test('A RECORD `init` MADE EXPORTS A FILE THAT VERIFIES, AND IMPORTS INTO ANOTHER ONE', async () => {
  /* THE WHOLE CHAIN, END TO END, and every link of it was missing a week ago: `init` wrote no keys,
     no process opened the KEK, nothing signed, and nothing checked. `41 §5.11` steps 2 and 3 are
     what make a `.brain` a thing somebody can be handed rather than a thing they have to trust. */
  const data = scratch();
  try {
    assert.equal(run(data, 'init', 'the-studio', '--owner', 'ada@example.com').code, 0);

    const file = join(data, 'the-studio', 'record.brain');
    const sql = openSqlite(file);
    const store = await openKeyStore(join(data, 'kek'));
    const id = sql.one<{ id: string }>('SELECT id FROM record WHERE singleton = 1')!.id;

    const sign = await signerFor(sql, store, id);
    assert.ok(sign, 'a record init created cannot open its own signing key');

    const api = await createRecordApi({ sql, clock: { now: () => Date.UTC(2026, 8, 5) }, sign });
    const out = await api.kernel.export();
    assert.ok(out.ok, 'export refused');
    const lines = (out as { value: string[] }).value;

    /* IT VERIFIES, against nothing but the file. `checkBrainl` recomputes every table's hash and the
       key id, and checks the signature against the key the file carries. */
    const checked = await checkBrainl(lines);
    assert.ok(checked.ok, checked.ok ? '' : `${checked.refusal.code}: ${checked.refusal.fix}`);

    /* AND ONE CHANGED DIGIT DOES NOT, even with the manifest recomputed, which is the difference
       between a checksum and a signature. */
    const at = lines.findIndex((l) => l.startsWith('["record_id"'));
    assert.ok(at > 0, 'no dog_meta row to edit');
    const bent = [...lines];
    /* The id is random, so the new last character must differ from the old one, or one run in
       every few dozen edits nothing and the file still verifies. */
    const last = id.slice(-1) === 'X' ? 'Y' : 'X';
    bent[at] = bent[at]!.replace(id, `${id.slice(0, -1)}${last}`);
    assert.equal((await checkBrainl(bent)).ok, false, 'an edited record id verified');

    sql.close();
  } finally {
    rmSync(data, { recursive: true, force: true });
  }
});

test('AND A RECORD WITH NO SIGNING KEY SAYS SO BY MAKING NO SIGNER', async () => {
  /* `signerFor` answers `null` rather than throwing, because "no signing key" is an ordinary state:
     a record restored from a redacted export has no `vault_key` rows at all: `brainl.ts` drops them,
     since the row is nothing but wrapped bytes and a salt. Its exports are unsigned, and nothing
     will import them, which is true and worth saying at export rather than at import. */
  const data = scratch();
  try {
    assert.equal(run(data, 'init', 'the-studio', '--owner', 'ada@example.com').code, 0);
    const file = join(data, 'the-studio', 'record.brain');
    const sql = openSqlite(file);
    const store = await openKeyStore(join(data, 'kek'));
    const id = sql.one<{ id: string }>('SELECT id FROM record WHERE singleton = 1')!.id;

    sql.exec("DELETE FROM vault_key WHERE purpose = 'signing'");
    assert.equal(await signerFor(sql, store, id), null);

    /* AND A KEY THIS KEK DID NOT WRAP IS THE SAME ANSWER, not an exception three frames down. */
    sql.exec(
      "INSERT INTO vault_key (purpose, wrapped, nonce, wrapped_by, kek_id, salt, rewrapped_at) VALUES ('signing', ?, ?, 'kek', ?, NULL, NULL)",
      new Uint8Array(48),
      new Uint8Array(12),
      (await store.current()).kekId,
    );
    assert.equal(await signerFor(sql, store, id), null, 'bytes that do not open produced a signer');
    sql.close();
  } finally {
    rmSync(data, { recursive: true, force: true });
  }
});
