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

import { createDirectory, type Directory, type Membership, type Named, type Person } from '../src/directory.ts';
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
  assert.equal(tried.code, 'UNIQUE_VIOLATION');
  assert.match(tried.fix, /cannot be given out again/);

  // Nor by renaming into it.
  const second = value<Named & { person: string }>(d.provision({ slug: 'kiln', email: 'bo@example.com' }));
  assert.equal(refusal(d.rename('kiln', 'the-studio')).code, 'UNIQUE_VIOLATION');
  assert.equal(d.resolve('kiln')?.record, second.record);
  sql.close();
});

test('and a name that is not a name, or is the platform’s, is refused before it is durable', async () => {
  const { d, sql } = directory();
  value<Person>(d.person$('ada@example.com'));
  for (const slug of ['The-Studio', 'the studio', '-studio', 'studio-', 'a/b', '', '..'])
    assert.equal(refusal(d.provision({ slug, email: 'ada@example.com' })).at, 'slug', `${slug} was allowed`);
  for (const slug of ['api', 'auth', 'a', 's'])
    assert.match(refusal(d.provision({ slug, email: 'ada@example.com' })).fix, /the platform uses/);

  assert.equal(refusal(d.provision({ slug: 'nobody', email: 'ghost@example.com' })).code, 'OUT_OF_BOUNDS');
  assert.equal(sql.all('SELECT 1 FROM dir_record').length, 0, 'a refused provision left a record behind');
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

  value(d.join(made.record, bo.id, 'write'));
  const reach: Membership[] = d.recordsOf(bo.id);
  assert.deepEqual(
    reach.map((m) => [m.slug, m.level]),
    [
      ['kiln', 'owner'],
      ['the-studio', 'write'],
    ],
  );
  assert.equal(d.levelOf(made.record, bo.id), 'write');
  assert.equal(d.levelOf(second.record, made.person), null, 'somebody reached a record they are not on');

  // Joining again moves them rather than adding a second row.
  value(d.join(made.record, bo.id, 'read'));
  assert.equal(d.recordsOf(bo.id).length, 2);
  assert.equal(d.levelOf(made.record, bo.id), 'read');

  assert.equal(refusal(d.join(made.record, bo.id, 'admin' as never)).code, 'ENUM_VALUE_UNKNOWN');
  assert.equal(refusal(d.join('rec_nothing', bo.id, 'read')).at, 'record');
  assert.equal(refusal(d.join(made.record, 'p_nobody', 'read')).at, 'person');
  sql.close();
});

test('A RECORD KEEPS ONE OWNER, or nobody can grant access to it ever again', async () => {
  const { d, sql } = directory();
  const made = studio(d);
  const bo = value<Person>(d.person$('bo@example.com'));

  assert.equal(refusal(d.leave(made.record, made.person)).code, 'LEVEL_REQUIRED');
  assert.equal(d.levelOf(made.record, made.person), 'owner');

  value(d.join(made.record, bo.id, 'owner'));
  value(d.leave(made.record, made.person));
  assert.equal(d.levelOf(made.record, made.person), null);
  assert.equal(d.levelOf(made.record, bo.id), 'owner');

  // Removing somebody who is not there is not an error; it is the state they asked for.
  value(d.leave(made.record, 'p_nobody'));
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
  assert.equal(refusal(d.provision({ slug: 'the-studio', email: 'bo@example.com' })).code, 'UNIQUE_VIOLATION');
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

test('AND THE LAST OWNER CANNOT BE DEMOTED EITHER, which `leave` alone did not stop', async () => {
  /* `leave` refused to remove them and `join` moved them, which is the same record with nobody who
     can grant access to it — and the only way out of that is somebody with a database. */
  const { d, sql } = directory();
  const made = studio(d);

  assert.equal(refusal(d.join(made.record, made.person, 'read')).code, 'LEVEL_REQUIRED');
  assert.equal(d.levelOf(made.record, made.person), 'owner');

  // With a second owner it is an ordinary change.
  const bo = value<Person>(d.person$('bo@example.com'));
  value(d.join(made.record, bo.id, 'owner'));
  value(d.join(made.record, made.person, 'read'));
  assert.equal(d.levelOf(made.record, made.person), 'read');
  sql.close();
});

test('and a closed record takes nobody, because its name may already be somebody else’s problem', async () => {
  const { d, sql } = directory();
  const made = studio(d);
  const bo = value<Person>(d.person$('bo@example.com'));
  value(d.close(made.record));

  assert.equal(refusal(d.join(made.record, bo.id, 'owner')).at, 'record');
  assert.equal(d.levelOf(made.record, bo.id), null, 'somebody was given owner on a closed record');
  sql.close();
});
