/**
 * `init <slug> --from <file>` restores a record every member of it can still open, and a throw part way through leaves
 * nothing behind (`loop/research-batch-fifty-seven-audit.md` finding 1, and the checker's line on `restore.ts`).
 *
 * MEASURED BEFORE THIS FILE, by the audit's probe S3/S4 and again here: `initFrom` wrote ONE `dir_person` row, for
 * `owners[0]`, and nobody else on the record got one. The self-host's door for a new address, `person$`, found no row
 * and minted `p_<new ulid>`, an id no `member` row names, so every other member signed in as a stranger. The owner filter
 * never read `person.suspended_at`, so with a suspended first owner the one person the Directory named could not open it
 * either: the command exited 0 with "restored" and `access` was null for all three people.
 *
 * AND A THROW AFTER THE FOLDER WAS MADE LEFT IT THERE. Every refusal after `mkdirSync` cleaned up, and an exception did
 * not, so the retry was refused "already exists" by the half a failed run had written.
 *
 * THE COPY IS BUILT AS `restore-from.test.ts` BUILDS IT, `kernel.export({ redactGrants: false, actor: 'system' })` over a
 * signed record, which is what the Cloud's `dumpOf` writes. It runs `initFrom` in this process and not the entry in a
 * child, because what is asked here is which rows it wrote, and `restore-from.test.ts` already holds the argv.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { Signer } from '@braindog/kernel';
import { createRecordApi } from '@braindog/record';
import { createDirectory } from '@braindog/record/directory';

import { openKeyStore, recordKeys } from '../src/keys.ts';
import { initFrom } from '../src/restore.ts';
import { openSqlite } from '../src/server.ts';
import { signerFor } from '../src/sign.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
/* ADA SORTS FIRST, which is what made her `owners[0]`. */
const ADA = 'p_01JZ8QK3F7R2M9V4XN6TCB5HA0';
const BEA = 'p_01JZ8QK3F7R2M9V4XN6TCB5HA1';
const CAL = 'p_01JZ8QK3F7R2M9V4XN6TCB5HA2';
const DEE = 'p_01JZ8QK3F7R2M9V4XN6TCB5HA3';
const NOW = (): number => Date.UTC(2026, 8, 23, 3, 17);

/**
 * A record with a suspended owner who sorts first, a second owner, a writer and a reader of one list, exported whole.
 */
async function copyOf(work: string, also: (sql: ReturnType<typeof openSqlite>) => void = () => {}): Promise<string> {
  const sql = openSqlite(':memory:');
  const store = await openKeyStore(join(work, 'kek'));
  let signer: Signer | null = null;
  const api = await createRecordApi({ sql, clock: { now: NOW }, sign: async (b) => (signer ? signer(b) : null) });
  const made = await api.createRecord({
    id: REC,
    slug: 'the-studio',
    name: 'The Studio',
    tz: 'UTC',
    locale: 'en',
    owner: { id: ADA, email: 'ada@example.com', name: 'Ada' },
    keys: await recordKeys(store, REC),
  });
  assert.ok(made.ok, JSON.stringify(made));
  signer = await signerFor(sql, store, REC);
  sql.exec("UPDATE person SET suspended_at = '2026-09-01T00:00:00.000Z' WHERE id = ?", ADA);
  sql.exec(
    "INSERT INTO person (id, email, name) VALUES (?, 'bea@example.com', 'Bea'), (?, 'Cal@Example.com', 'Cal'), (?, 'dee@example.com', 'Dee')",
    BEA,
    CAL,
    DEE,
  );
  sql.exec("INSERT INTO member (person_id, register, level) VALUES (?, '*', 'owner'), (?, '*', 'write'), (?, 'session', 'read')", BEA, CAL, DEE);
  also(sql);
  const exported = await api.kernel.export({ redactGrants: false, actor: 'system' });
  assert.ok(exported.ok, JSON.stringify(exported));
  sql.close();
  const file = join(work, 'copy.brainl');
  writeFileSync(file, `${exported.value.join('\n')}\n`);
  return file;
}

function scratch(t: { after: (f: () => void) => void }): string {
  const work = mkdtempSync(join(tmpdir(), 'braindog-restore-members-'));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  return work;
}

/** The restored record and its Directory, opened as `serve` opens them, for the questions a sign-in asks. */
async function served(data: string) {
  const dirSql = openSqlite(join(data, 'directory.sqlite'));
  const recSql = openSqlite(join(data, 'drill', 'record.brain'));
  const directory = createDirectory(dirSql, { now: NOW });
  const record = await createRecordApi({ sql: recSql, clock: { now: NOW } });
  return {
    directory,
    dirSql,
    /** What the record lets the person the Directory knows by this address do, which is what a session is built from. */
    reach(email: string) {
      const person = directory.person$(email);
      assert.ok(person.ok, JSON.stringify(person));
      return { id: person.value.id, held: record.kernel.access(person.value.id), records: directory.recordsOf(person.value.id).map((r) => r.record) };
    },
    close() {
      recSql.close();
      dirSql.close();
    },
  };
}

test('EVERY MEMBER OF THE COPY SIGNS IN AS THEMSELVES, and a suspended first owner is not the one the Directory names', async (t) => {
  const work = scratch(t);
  const file = await copyOf(work);
  const data = join(work, 'data');
  const out = await initFrom({ data, slug: 'drill', from: file, kekFile: join(work, 'kek'), now: NOW, say: () => {} });
  assert.ok(out.ok, JSON.stringify(out));
  assert.match(out.said[0] ?? '', / · owner bea@example\.com$/, 'the Directory named the suspended owner');
  assert.ok(!out.said.join('\n').includes('—'));

  const s = await served(data);
  try {
    const bea = s.reach('bea@example.com');
    assert.equal(bea.id, BEA);
    assert.equal(bea.held?.level, 'owner');
    assert.deepEqual(bea.records, [REC]);
    const cal = s.reach('cal@example.com');
    assert.equal(cal.id, CAL, 'the writer signs in as a stranger to the record');
    assert.equal(cal.held?.level, 'write');
    assert.deepEqual(cal.records, [REC], 'the writer has no row in the switcher');
    const dee = s.reach('dee@example.com');
    assert.equal(dee.id, DEE);
    assert.deepEqual(dee.held?.levels, { session: 'read' });
    /* THE SUSPENDED OWNER IS CARRIED UNDER HER OWN ID, so lifting the suspension later lets her in as herself; the
       record, which is where a suspension lives, still refuses her. */
    const ada = s.reach('ada@example.com');
    assert.equal(ada.id, ADA);
    assert.equal(ada.held, null);
    assert.equal(s.dirSql.one<{ owner: string }>('SELECT owner FROM dir_record WHERE id = ?', REC)?.owner, BEA);
  } finally {
    s.close();
  }
});

test('A SUSPENDED OWNER NAMED WITH --owner IS REFUSED BEFORE ANYTHING IS WRITTEN, naming the owner who could be', async (t) => {
  const work = scratch(t);
  const file = await copyOf(work);
  const data = join(work, 'data');
  const named = await initFrom({ data, slug: 'drill', from: file, owner: 'ada@example.com', kekFile: join(work, 'kek'), now: NOW, say: () => {} });
  assert.equal(named.ok, false);
  assert.match(String(named.said), /ada@example\.com is suspended/);
  assert.match(String(named.said), /bea@example\.com/, 'the refusal does not say who could be named instead');
  assert.equal(existsSync(join(data, 'drill')), false);
});

test('A MEMBER THE DIRECTORY HOLDS UNDER ANOTHER ID IS NOT CARRIED, IS NAMED, AND THE RESTORE STILL SERVES EVERYONE ELSE', async (t) => {
  const work = scratch(t);
  const file = await copyOf(work);
  const data = join(work, 'data');
  /* CAL SIGNED UP HERE BEFORE, SO THIS DIRECTORY KNOWS HIS ADDRESS UNDER AN ID OF ITS OWN. Rewriting his row would move
     every record he reaches here onto an id they do not name; leaving it is the only honest thing, and saying so. */
  {
    const dirSql = openSqlite(join((mkdirSync(data, { recursive: true }), data), 'directory.sqlite'));
    const directory = createDirectory(dirSql, { now: NOW });
    const cal = directory.person$('cal@example.com', 'Cal');
    assert.ok(cal.ok && cal.value.id !== CAL);
    dirSql.close();
  }
  const out = await initFrom({ data, slug: 'drill', from: file, kekFile: join(work, 'kek'), now: NOW, say: () => {} });
  assert.ok(out.ok, JSON.stringify(out));
  assert.match(out.said.join('\n'), /cal@example\.com/i, 'the member who cannot be carried is not named');

  const s = await served(data);
  try {
    assert.equal(s.reach('bea@example.com').held?.level, 'owner');
    assert.equal(s.reach('dee@example.com').id, DEE);
    assert.notEqual(s.reach('cal@example.com').id, CAL);
  } finally {
    s.close();
  }
});

/* TWO PEOPLE IN THE COPY WITH ONE ADDRESS. The record's `person` table has no unique address, and a self-host that ran
   the restore before this one leaves exactly that behind: the member it could not carry signed in under a fresh id and
   was invited again, so the next copy names them twice. The Directory holds one row per address (`dir_person_email`),
   so the second insert threw `UNIQUE constraint failed` and the whole restore was refused, keeping the record from
   everybody (measured by the checker on the first version of this change). One is carried and the other is named. */
test('AN ADDRESS THE COPY NAMES TWICE IS CARRIED ONCE AND THE OTHER IS NAMED, and the restore still serves everyone else', async (t) => {
  const work = scratch(t);
  const file = await copyOf(work, (sql) => {
    sql.exec("INSERT INTO person (id, email, name) VALUES ('p_01JZ8QK3F7R2M9V4XN6TCB5HA4', 'cal@example.com', 'Cal again'), ('p_01JZ8QK3F7R2M9V4XN6TCB5HA5', 'BEA@example.com', 'Bea again')");
    sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_01JZ8QK3F7R2M9V4XN6TCB5HA4', '*', 'read'), ('p_01JZ8QK3F7R2M9V4XN6TCB5HA5', 'session', 'read')");
  });
  const data = join(work, 'data');
  const out = await initFrom({ data, slug: 'drill', from: file, kekFile: join(work, 'kek'), now: NOW, say: () => {} });
  assert.ok(out.ok, JSON.stringify(out));
  const said = out.said.join('\n');
  assert.match(said, /p_01JZ8QK3F7R2M9V4XN6TCB5HA4/, 'the second Cal is not named');
  assert.match(said, /p_01JZ8QK3F7R2M9V4XN6TCB5HA5/, 'the second Bea is not named');

  const s = await served(data);
  try {
    assert.equal(s.reach('bea@example.com').id, BEA);
    assert.equal(s.reach('cal@example.com').id, CAL);
    assert.equal(s.reach('dee@example.com').id, DEE);
  } finally {
    s.close();
  }
});

test('A THROW AFTER THE RECORD FOLDER IS MADE LEAVES NO FOLDER AND NO DIRECTORY ROW, and the retry restores', async (t) => {
  const work = scratch(t);
  const file = await copyOf(work);
  const data = join(work, 'data');
  /* A CLOCK THAT STOPS ONCE THE RECORD FILE EXISTS: the first call after `mkdirSync` and `openSqlite` throws, wherever
     that call is, which is the shape of any fault between making the folder and naming the record. */
  const stopping = (): number => {
    if (existsSync(join(data, 'drill', 'record.brain'))) throw new Error('the clock stopped');
    return NOW();
  };
  let out: Awaited<ReturnType<typeof initFrom>> | null = null;
  try {
    out = await initFrom({ data, slug: 'drill', from: file, kekFile: join(work, 'kek'), now: stopping, say: () => {} });
  } catch (e) {
    assert.fail(`initFrom threw instead of refusing: ${e instanceof Error ? e.message : String(e)}; folder left: ${existsSync(join(data, 'drill'))}`);
  }
  assert.equal(out?.ok, false);
  assert.match(String(out?.said), /the clock stopped/);
  assert.equal(existsSync(join(data, 'drill')), false, 'the record folder was left behind');
  const dirSql = openSqlite(join(data, 'directory.sqlite'));
  try {
    assert.equal(dirSql.one<{ n: number }>('SELECT count(*) AS n FROM dir_person')?.n, 0);
    assert.equal(dirSql.one<{ n: number }>('SELECT count(*) AS n FROM dir_record')?.n, 0);
    assert.equal(dirSql.one<{ n: number }>('SELECT count(*) AS n FROM dir_slug')?.n, 0);
  } finally {
    dirSql.close();
  }

  const retry = await initFrom({ data, slug: 'drill', from: file, kekFile: join(work, 'kek'), now: NOW, say: () => {} });
  assert.ok(retry.ok, JSON.stringify(retry));
});

/* THE TEST ABOVE THROWS BEFORE THE DIRECTORY IS WRITTEN, so its empty tables prove nothing about the undo's own rows:
   measured by the checker, deleting the `provisioned` branch of `undo` or its `dir_person` loop left it green. This
   clock stops once the Directory holds the record, which is `directory.join` for the first person carried after the
   owner, so by then `provision` has written the record, its name and the owner's membership, and `dir_person` holds the
   owner and that person under the copy's ids. */
test('A THROW AFTER THE NAME IS GIVEN TAKES THE NAME, THE MEMBERSHIPS AND THE PEOPLE BACK, and the name is not a tombstone', async (t) => {
  const work = scratch(t);
  const file = await copyOf(work);
  const data = join(work, 'data');
  const dirFile = join(data, 'directory.sqlite');
  const named = (): boolean => {
    if (!existsSync(dirFile)) return false;
    const db = new DatabaseSync(dirFile, { readOnly: true });
    try {
      return db.prepare('SELECT 1 AS x FROM dir_record').get() !== undefined;
    } catch {
      return false;
    } finally {
      db.close();
    }
  };
  const stopping = (): number => {
    if (named()) throw new Error('the clock stopped after the name');
    return NOW();
  };
  const out = await initFrom({ data, slug: 'drill', from: file, kekFile: join(work, 'kek'), now: stopping, say: () => {} });
  assert.equal(out.ok, false);
  assert.match(String(out.said), /the clock stopped after the name/);
  assert.equal(existsSync(join(data, 'drill')), false, 'the record folder was left behind');
  const dirSql = openSqlite(dirFile);
  try {
    for (const table of ['dir_person', 'dir_record', 'dir_slug', 'dir_member'])
      assert.equal(dirSql.one<{ n: number }>(`SELECT count(*) AS n FROM ${table}`)?.n, 0, `${table} kept a row the failed restore wrote`);
  } finally {
    dirSql.close();
  }

  const retry = await initFrom({ data, slug: 'drill', from: file, kekFile: join(work, 'kek'), now: NOW, say: () => {} });
  assert.ok(retry.ok, JSON.stringify(retry));
});
