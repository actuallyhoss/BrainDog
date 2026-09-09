/**
 * The Directory: who somebody is, and which record a name means.
 *
 * WHAT IS ASSERTED HERE IS THE TENANT BOUNDARY. The string this file returns is the argument to
 * `idFromName`, so a name that resolves to the wrong record is one customer reading another's — and
 * the two ways that happens are a name given out twice and a name given back after a rename. Both
 * are tested, and the rest is the question a record cannot answer about itself.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DIRECTORY_VERSION, createDirectory, type Directory, type Membership, type Named, type Person } from '../src/directory.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const refusal = (r: unknown) => {
  const x = r as { ok: boolean; refusal: { code: string; fix: string; at?: string } };
  assert.equal(x.ok, false, 'this was supposed to be refused');
  return x.refusal;
};

function directory(): { d: Directory; sql: NodeSql } {
  const sql = openSqlite();
  return { d: createDirectory(sql, fixedClock(NOW)), sql };
}

const studio = (d: Directory) => {
  value<Person>(d.person$('ada@example.com', 'Ada'));
  return value<Named & { person: string }>(d.provision({ slug: 'the-studio', email: 'ada@example.com' }));
};

/* ── a name is not an address ────────────────────────────────────────────── */

test('A RENAMED RECORD KEEPS ITS STORAGE, because the name was never the address', async () => {
  /* `idFromName(rec_id)` is where the bytes are. Renaming is a row here and nothing else — no
     migration, no copy, and no window in which half the writes go to the old object. */
  const { d, sql } = directory();
  const made = studio(d);

  assert.deepEqual(d.resolve('the-studio'), { record: made.record, slug: 'the-studio' });
  const renamed = value<Named>(d.rename('the-studio', 'halden'));
  assert.equal(renamed.record, made.record, 'the record moved');
  assert.deepEqual(d.resolve('halden'), { record: made.record, slug: 'halden' });
  assert.equal(d.slugOf(made.record), 'halden');

  // And every name it has ever had is still readable, which is what a redirect would be built from.
  assert.deepEqual(
    d.namesOf(made.record).map((n) => [n.slug, n.released_at === null]),
    [
      ['the-studio', false],
      ['halden', true],
    ],
  );
  sql.close();
});

test('AND THE OLD NAME IS NEVER GIVEN OUT AGAIN, which is the whole tenant boundary', async () => {
  /* Every stale bookmark, saved link and API caller still says `the-studio`. Putting that name back
     in the pool is how one of them starts reading somebody else's record. */
  const { d, sql } = directory();
  const made = studio(d);
  value<Named>(d.rename('the-studio', 'halden'));

  assert.equal(d.resolve('the-studio'), null, 'a released name still resolves');

  value<Person>(d.person$('bo@example.com'));
  const tried = refusal(d.provision({ slug: 'the-studio', email: 'bo@example.com' }));
  /* `ALREADY_KNOWN`, which 30's register assigns to a taken slug at sign-up and 51 §5.8 to the route
     — `UNIQUE_VIOLATION` is the index as a backstop, and nothing was inserted here. */
  assert.equal(tried.code, 'ALREADY_KNOWN');
  assert.match(tried.fix, /cannot be given out again/);

  // Nor by renaming into it.
  const second = value<Named & { person: string }>(d.provision({ slug: 'kiln', email: 'bo@example.com' }));
  assert.equal(refusal(d.rename('kiln', 'the-studio')).code, 'ALREADY_KNOWN');
  assert.equal(d.resolve('kiln')?.record, second.record);
  sql.close();
});

test('AND AN ADDRESS IT ALREADY HAS IS A REFUSAL, not a thrown constraint', async () => {
  /* `provision` advertises re-running a half-done sign-up with the same id as its recovery path —
     and then let the primary key throw a `SQLITE_CONSTRAINT` out of a function whose entire contract
     is a `Result`, across a Durable Object RPC boundary, as a bare 500. */
  const { d, sql } = directory();
  value<Person>(d.person$('ada@example.com'));
  const made = value<Named & { person: string }>(d.provision({ slug: 'the-studio', email: 'ada@example.com' }));

  const again = refusal(d.provision({ slug: 'a-second-name', email: 'ada@example.com', record: made.record }));
  assert.equal(again.code, 'ALREADY_KNOWN');
  assert.equal(again.at, 'record');
  assert.equal(sql.all('SELECT 1 FROM dir_record').length, 1, 'a refused provision left a record behind');

  // And a record id that is not one is refused before anything is read.
  assert.equal(refusal(d.provision({ slug: 'kiln', email: 'ada@example.com', record: 'rec_nope' })).at, 'record');

  // The one it is for still works, which is the whole point of taking the id at all.
  const named = value<Named & { person: string }>(d.provision({ slug: 'kiln', email: 'ada@example.com', record: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD' }));
  assert.equal(named.record, 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', 'the caller named the record and the Directory minted its own');
  sql.close();
});

test('and a name that is not a name, or is the platform’s, is refused before it is durable', async () => {
  const { d, sql } = directory();
  value<Person>(d.person$('ada@example.com'));
  /* 34-GRAMMARS line 348: two to thirty-two characters, starting with a letter. `2024` and `x` were
     both accepted by the old shape, and so was a forty-character name — and 34 names the two places
     that makes permanent: `<slug>@in.brain.dog`, and `<data>/<slug>/` on a self-host. */
  for (const slug of ['The-Studio', 'the studio', '-studio', 'studio-', 'a/b', '', '..', '2024', 'x', 'a'.repeat(33)])
    assert.equal(refusal(d.provision({ slug, email: 'ada@example.com' })).at, 'slug', `${slug} was allowed`);
  /* AND THE WORDS 33 §4'S OWN SURFACE USES. `mcp` and `p` were missing from the set, so either could
     have been claimed as a customer name the router reaches before the Directory does. */
  for (const slug of ['api', 'auth', 'mcp', 'in', 'ws', 'www'])
    assert.match(refusal(d.provision({ slug, email: 'ada@example.com' })).fix, /the platform uses/);

  assert.equal(refusal(d.provision({ slug: 'nobody', email: 'ghost@example.com' })).code, 'OUT_OF_BOUNDS');
  assert.equal(sql.all('SELECT 1 FROM dir_record').length, 0, 'a refused provision left a record behind');

  // And the far end of the range is a name, so the bound is thirty-two rather than thirty-one.
  assert.ok(d.provision({ slug: 'a'.repeat(32), email: 'ada@example.com' }).ok, 'thirty-two characters is not a name');
  sql.close();
});

/* ── who somebody is ─────────────────────────────────────────────────────── */

test('ONE HUMAN IS ONE PERSON, however they typed their address', async () => {
  // Mail is case-insensitive in the half anybody types, and disagreeing gives one human two accounts.
  const { d, sql } = directory();
  const first = value<Person>(d.person$('Ada@Example.com', 'Ada'));
  const again = value<Person>(d.person$('ada@example.com'));
  assert.equal(again.id, first.id);
  assert.equal(again.email, 'Ada@Example.com', 'the address is kept as it was typed');
  assert.equal(sql.all('SELECT 1 FROM dir_person').length, 1);

  assert.equal(refusal(d.person$('not an address')).code, 'VALUE_MALFORMED');
  sql.close();
});

test('WHICH RECORDS DOES THIS PERSON REACH — the question a record cannot answer about itself', async () => {
  const { d, sql } = directory();
  const made = studio(d);
  const bo = value<Person>(d.person$('bo@example.com'));
  const second = value<Named & { person: string }>(d.provision({ slug: 'kiln', email: 'bo@example.com' }));

  value(d.join(made.record, bo.id));
  const reach: Membership[] = d.recordsOf(bo.id);
  assert.deepEqual(reach.map((m) => m.slug), ['kiln', 'the-studio']);

  /* AND THAT IS THE WHOLE ANSWER. It used to carry a LEVEL, which is a fact this database cannot
     keep true: the record's own `member` table is written by `invite` and `removeMember`, this one
     by `join` and `leave`, and the two cannot be written in one transaction. Both hosts already
     built their `CallContext` level from `kernel.access(person)` and ignored this one. */
  assert.ok(!('level' in reach[0]!), 'the Directory is answering a question it cannot keep true');

  assert.equal(d.reaches(made.record, bo.id), true);
  assert.equal(d.reaches(second.record, made.person), false, 'somebody reached a record they are not on');

  // Joining again is the state they asked for, not a second row.
  value(d.join(made.record, bo.id));
  assert.equal(d.recordsOf(bo.id).length, 2);

  assert.equal(refusal(d.join('rec_nothing', bo.id)).at, 'record');
  assert.equal(refusal(d.join(made.record, 'p_nobody')).at, 'person');
  sql.close();
});

test('A RECORD KEEPS ITS OWNER, or nobody can grant access to it ever again', async () => {
  const { d, sql } = directory();
  const made = studio(d);
  const bo = value<Person>(d.person$('bo@example.com'));

  /* THE OWNER IS `dir_record.owner`, written once by `provision`. It used to be "whoever holds the
     highest level in `dir_member`" — a level this database could not keep true, so the guard on the
     one row that matters rested on the one column that drifted. */
  assert.equal(refusal(d.leave(made.record, made.person)).code, 'LEVEL_REQUIRED');
  assert.match(refusal(d.leave(made.record, made.person)).fix, /keeps its owner/);
  assert.equal(d.reaches(made.record, made.person), true);

  // Anybody else can be removed, and being an owner elsewhere does not protect them here.
  value(d.join(made.record, bo.id));
  value(d.leave(made.record, bo.id));
  assert.equal(d.reaches(made.record, bo.id), false);

  // Removing somebody who is not there is not an error; it is the state they asked for.
  value(d.leave(made.record, 'p_nobody'));
  sql.close();
});

test('A DIRECTORY WRITTEN BY VERSION 1 IS BROUGHT FORWARD, and keeps its owner', async () => {
  /* `CREATE TABLE IF NOT EXISTS` is a no-op over an existing table, so a version-1 directory would
     have kept its `level` column for ever — the same silent-upgrade failure the version gate stops
     from the other direction. The owner is recovered from the level before the column goes. */
  const sql = openSqlite();
  sql.exec(`
    CREATE TABLE dir_person (id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT, created_at TEXT NOT NULL);
    CREATE TABLE dir_record (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, closed_at TEXT);
    CREATE TABLE dir_slug (slug TEXT PRIMARY KEY, record TEXT NOT NULL, claimed_at TEXT NOT NULL, released_at TEXT);
    CREATE TABLE dir_member (person TEXT NOT NULL, record TEXT NOT NULL,
      level TEXT NOT NULL CHECK (level IN ('read','append','write','decide','owner')),
      added_at TEXT NOT NULL, PRIMARY KEY (person, record));
    PRAGMA user_version = 1;
  `);
  sql.exec("INSERT INTO dir_person (id, email, created_at) VALUES ('p_ada', 'ada@example.com', '2026-01-01T00:00:00.000Z')");
  sql.exec("INSERT INTO dir_person (id, email, created_at) VALUES ('p_bo', 'bo@example.com', '2026-01-01T00:00:00.000Z')");
  sql.exec("INSERT INTO dir_record (id, created_at) VALUES ('rec_old', '2026-01-01T00:00:00.000Z')");
  sql.exec("INSERT INTO dir_slug (slug, record, claimed_at) VALUES ('the-studio', 'rec_old', '2026-01-01T00:00:00.000Z')");
  sql.exec("INSERT INTO dir_member (person, record, level, added_at) VALUES ('p_ada', 'rec_old', 'owner', '2026-01-01T00:00:00.000Z')");
  sql.exec("INSERT INTO dir_member (person, record, level, added_at) VALUES ('p_bo', 'rec_old', 'write', '2026-01-01T00:00:00.000Z')");

  const d = createDirectory(sql, { now: () => Date.UTC(2026, 8, 7) });

  assert.equal(Number(sql.one<{ user_version: number }>('PRAGMA user_version')?.user_version), DIRECTORY_VERSION);
  assert.equal(sql.all("SELECT 1 FROM pragma_table_info('dir_member') WHERE name = 'level'").length, 0, 'the level column survived');
  assert.equal(sql.one<{ owner: string }>("SELECT owner FROM dir_record WHERE id = 'rec_old'")?.owner, 'p_ada');

  // And both memberships survived the migration, which is the point of doing it rather than dropping the table.
  assert.equal(d.reaches('rec_old', 'p_ada'), true);
  assert.equal(d.reaches('rec_old', 'p_bo'), true);
  assert.equal(refusal(d.leave('rec_old', 'p_ada')).code, 'LEVEL_REQUIRED');
  value(d.leave('rec_old', 'p_bo'));

  /* AND IT IS IDEMPOTENT. Opening the same file again runs no migration, because the version says
     so — and a `DROP COLUMN` that ran twice would throw out of `createDirectory`. */
  createDirectory(sql, { now: () => Date.UTC(2026, 8, 7) });
  sql.close();
});

test('A DIRECTORY WHOSE OWNER CANNOT BE RECOVERED REFUSES RATHER THAN GUESSING', async () => {
  const sql = openSqlite();
  sql.exec(`
    CREATE TABLE dir_person (id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT, created_at TEXT NOT NULL);
    CREATE TABLE dir_record (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, closed_at TEXT);
    CREATE TABLE dir_slug (slug TEXT PRIMARY KEY, record TEXT NOT NULL, claimed_at TEXT NOT NULL, released_at TEXT);
    CREATE TABLE dir_member (person TEXT NOT NULL, record TEXT NOT NULL,
      level TEXT NOT NULL CHECK (level IN ('read','append','write','decide','owner')),
      added_at TEXT NOT NULL, PRIMARY KEY (person, record));
    PRAGMA user_version = 1;
  `);
  sql.exec("INSERT INTO dir_person (id, email, created_at) VALUES ('p_bo', 'bo@example.com', '2026-01-01T00:00:00.000Z')");
  sql.exec("INSERT INTO dir_record (id, created_at) VALUES ('rec_odd', '2026-01-01T00:00:00.000Z')");
  // A record with members and no owner — which version 1 could produce, because nothing stopped it.
  sql.exec("INSERT INTO dir_member (person, record, level, added_at) VALUES ('p_bo', 'rec_odd', 'write', '2026-01-01T00:00:00.000Z')");

  const d = createDirectory(sql, { now: () => Date.UTC(2026, 8, 7) });
  assert.equal(sql.one<{ owner: string }>("SELECT owner FROM dir_record WHERE id = 'rec_odd'")?.owner, '');
  /* THE SAFE ANSWER IS THE REFUSAL. Removing the only person on a record whose owner is unknown is
     how a record becomes unreachable, and this one says which record so somebody can fix it. */
  assert.match(refusal(d.leave('rec_odd', 'p_bo')).fix, /does not know who owns rec_odd/);
  sql.close();
});

test('and closing a record releases its name without freeing it', async () => {
  const { d, sql } = directory();
  const made = studio(d);
  value(d.close(made.record));

  assert.equal(d.resolve('the-studio'), null);
  assert.equal(d.slugOf(made.record), null);
  assert.equal(d.recordsOf(made.person)[0]?.closed, true, 'a closed record does not say so');

  value<Person>(d.person$('bo@example.com'));
  assert.equal(refusal(d.provision({ slug: 'the-studio', email: 'bo@example.com' })).code, 'ALREADY_KNOWN');
  assert.equal(refusal(d.close('rec_nothing')).code, 'OUT_OF_BOUNDS');
  sql.close();
});

test('and the directory survives being opened twice over the same storage', async () => {
  // It creates its own schema, and a process that restarts must not lose the tenant map.
  const sql = openSqlite();
  const first = createDirectory(sql, fixedClock(NOW));
  value<Person>(first.person$('ada@example.com'));
  const made = value<Named & { person: string }>(first.provision({ slug: 'the-studio', email: 'ada@example.com' }));

  const second = createDirectory(sql, fixedClock(NOW));
  assert.deepEqual(second.resolve('the-studio'), { record: made.record, slug: 'the-studio' });
  sql.close();
});

test('and a closed record takes nobody, because its name may already be somebody else’s problem', async () => {
  const { d, sql } = directory();
  const made = studio(d);
  const bo = value<Person>(d.person$('bo@example.com'));
  value(d.close(made.record));

  assert.equal(refusal(d.join(made.record, bo.id)).at, 'record');
  assert.equal(d.reaches(made.record, bo.id), false, 'somebody was let into a closed record');
  sql.close();
});

test('A DIRECTORY OPENS ON A DRIVER THAT REFUSES `PRAGMA`, and it threw out of its first line', async () => {
  /* THIS IS THE CLOUD HOST. A Durable Object's SQLite authorizer refuses `PRAGMA`, and this file
     read `PRAGMA user_version` unguarded as the very first thing `createDirectory` does — so the
     call threw `not authorized: SQLITE_AUTH` before a table was created, on every request. The
     Directory is opened lazily on the first call, so the whole tenant map was unreachable on the
     deployed host: `route()` asks `directory.knows(named)` before it addresses a record, and that
     question answered with a 500 rather than with true or false. A well-formed bearer for a record
     nobody has came back `500 INTERNAL` where `33 §4` says 401.
     
     THE KERNEL HAD ALREADY LEARNED THIS. `migrate.ts` wraps its own `PRAGMA user_version` in a
     try/catch with the reason written beside it: "a driver may not expose PRAGMA". The tenant map
     was the one place that had not had the lesson.

     THE FAKE REFUSES EXACTLY WHAT THE PLATFORM REFUSES and nothing else, so a green here is a claim
     about the Cloud host rather than about a mock: every other statement goes to real SQLite. */
  const real = openSqlite();
  const refusesPragma: NodeSql = {
    ...real,
    exec: (text: string, ...params: unknown[]) => {
      if (/^\s*PRAGMA\b/iu.test(text)) throw new Error('not authorized: SQLITE_AUTH');
      return real.exec(text, ...(params as never[]));
    },
    one: <T,>(text: string, ...params: unknown[]) => {
      if (/^\s*PRAGMA\b/iu.test(text)) throw new Error('not authorized: SQLITE_AUTH');
      return real.one<T>(text, ...(params as never[]));
    },
  } as NodeSql;

  const d = createDirectory(refusesPragma, fixedClock(NOW));
  const made = value<Named & { person: string }>(
    (value<Person>(d.person$('ada@example.com', 'Ada')), d.provision({ slug: 'the-studio', email: 'ada@example.com' })),
  );

  /* AND IT ANSWERS THE ONE QUESTION THE ROUTER ASKS FIRST. `knows` is what stops a forged bearer
     minting an empty billable record, and it is the call that was throwing. */
  assert.equal(d.knows(made.record), true);
  assert.equal(d.knows('rec_00000000000000000000000000'), false, 'a record nobody has is not one of ours');

  /* THE ROW IS WHERE THE VERSION WENT, since the pragma could not take it. Opening a second time
     over the same storage has to read it back, or the DDL is the only thing that ever ran and a
     directory at version 1 would never be migrated forward on this host. */
  assert.equal(
    Number(real.one<{ value: string }>("SELECT value FROM dir_meta WHERE key = 'version'")?.value),
    DIRECTORY_VERSION,
  );
  assert.doesNotThrow(() => createDirectory(refusesPragma, fixedClock(NOW)));
  real.close();
});

test('A DIRECTORY WRITTEN BY A NEWER BUILD IS NOT OPENED', async () => {
  /* `CREATE TABLE IF NOT EXISTS` over a newer schema is silent: every statement is a no-op, the
     object opens, and the first `resolve` answers out of columns this build does not know the
     meaning of — confidently, about which record a name means, which is the one question the tenant
     map exists to answer. A record refuses in this situation; the map that decides which record
     anybody reaches did not. */
  const { d, sql } = directory();
  assert.equal(Number(sql.one<{ user_version: number }>('PRAGMA user_version')?.user_version), DIRECTORY_VERSION);
  value<Person>(d.person$('ada@example.com'));

  sql.exec(`PRAGMA user_version = ${DIRECTORY_VERSION + 1}`);
  assert.throws(() => createDirectory(sql, { now: () => Date.parse('2026-09-05T12:00:00Z') }), /written by a newer BrainDog/);
  sql.close();
});
