/**
 * `apps/cli/scripts/migration-rehearsal.mjs`: a record at an older migration count opened by this checkout's kernel,
 * compared table by table and list by list, and read through `boot` and `list`.
 *
 * THE RECORD IS BUILT AT THE OLDER COUNT HERE, NOT FOUND IN A FIXTURE. Today's kernel writes the rows into one file; a
 * second file gets the schema of the first `OLDER` migrations and nothing else, each with the ledger row and checksum
 * the runner would write, and the rows are copied across, column by column where both schemas have the column. So the
 * migrations after `OLDER` meet a real older schema holding rows, which is what the rehearsal exists to try, and this
 * stays true whatever migration is added next.
 *
 * THE NIGHT'S OWN HALF (the worktree at the live sha, its install and its restore) IS NOT RUN HERE: it needs the clone's
 * history and a package store, and the restore it runs is the drill's, which `restore-drill.test.ts` holds. The record
 * file this test builds is what that half hands on, and the script takes one as it is.
 *
 * THE SCRIPT RUNS AS A CHILD PROCESS with the OS temp directory pointed at this test's folder, because what it must leave
 * behind is nothing, and the file it was handed must come back untouched.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { MIGRATIONS, checksum, openRecord, statements } from '@braindog/kernel';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';

const SCRIPT = fileURLToPath(new URL('../scripts/migration-rehearsal.mjs', import.meta.url));
const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const OWNER = 'p_01JZ8QK3F7R2M9V4XN6TCB5HAO';
const NOW = Date.UTC(2026, 8, 25, 3, 17);
const AT = new Date(NOW).toISOString();

/** The migration count the live records held before the first workflow's two (contracts.md §1.2). */
const OLDER = 16;

const register = (id: string, name: string) => ({
  id: `register.${id}`,
  kind: 'register' as const,
  body: { id, name, title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
});

type Ran = { code: number | null; stdout: string; stderr: string };

/** The rehearsal as he runs it, with the temp directory it may write to pointed at `temp`. */
const rehearsal = (args: string[], temp: string): Promise<Ran> =>
  new Promise((done) => {
    const env: NodeJS.ProcessEnv = { ...process.env, TEMP: temp, TMP: temp, TMPDIR: temp };
    const child = spawn(process.execPath, [SCRIPT, ...args], { env, cwd: temp, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += String(d)));
    child.stderr.on('data', (d) => (stderr += String(d)));
    child.on('close', (code) => done({ code, stdout, stderr }));
  });

type Listed = { name: string; type: string; wr: number };
type Column = { name: string; type: string; pk: number };

/**
 * A record file at `OLDER` migrations holding two lists and five rows, and the folders the rehearsal runs in.
 *
 * `refuse` PUTS A TRIGGER ON THE LEDGER that aborts that one migration's ledger row, so the migration throws inside its
 * own transaction exactly as one with a bad statement would, whatever the migration is.
 */
async function older(t: { after: (f: () => void) => void }, shape: { refuse?: number } = {}) {
  assert.ok(MIGRATIONS.length > OLDER, 'this checkout has no migration past the older count to rehearse');
  const dir = mkdtempSync(join(tmpdir(), 'braindog-rehearsal-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const temp = join(dir, 'temp');
  mkdirSync(temp);

  /* THE ROWS, WRITTEN BY TODAY'S KERNEL through its own install and create, so they are rows a record really holds. */
  const newer = join(dir, 'newer.brain');
  const sql = openSqlite(newer);
  const k = await openRecord(sql, fixedClock(NOW));
  sql.exec('INSERT INTO record (singleton, id, slug, name, locale, tz, format_ver, created_at) VALUES (1, ?, ?, ?, ?, ?, 1, ?)', REC, 'the-studio', 'The Studio', 'en', 'UTC', AT);
  sql.exec('INSERT INTO person (id, email, name, suspended_at) VALUES (?, ?, ?, NULL)', OWNER, 'ada@example.com', 'ada');
  sql.exec("INSERT INTO member (person_id, register, level) VALUES (?, '*', 'owner')", OWNER);
  assert.ok((await k.install([register('things', 'Things'), register('tools', 'Tools')])).ok);
  for (const name of ['Kiln', 'Wheel']) assert.ok(k.create('things', { name }, { actor: OWNER }).ok);
  for (const name of ['Rib', 'Wire', 'Sponge']) assert.ok(k.create('tools', { name }, { actor: OWNER }).ok);
  sql.close();

  /* THE OLDER SCHEMA, AS THE RUNNER WRITES IT: each migration's statements and its ledger row in one transaction. */
  const file = join(dir, 'record.brain');
  /* FOREIGN KEYS OFF, AS ON EVERY ADAPTER (`0001_kernel.ts`), so the copy below may meet the tables in any order. */
  const db = new DatabaseSync(file, { enableForeignKeyConstraints: false });
  db.exec('CREATE TABLE IF NOT EXISTS migration (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL, checksum TEXT NOT NULL)');
  for (const m of MIGRATIONS.slice(0, OLDER)) {
    const sum = await checksum(m.sql);
    db.exec('BEGIN');
    for (const statement of statements(m.sql)) db.exec(statement);
    db.prepare('INSERT INTO migration (version, applied_at, checksum) VALUES (?, ?, ?)').run(m.version, AT, sum);
    db.exec('COMMIT');
  }

  /* THE ROWS COPIED ACROSS. The ledger stays the older one's. `OR IGNORE` because the migrations wrote some metadata rows
     of their own (`dog_section`), and the search index keeps its rowids, which are its rows' rowids in `entry`. */
  const all = <T>(text: string): T[] => db.prepare(text).all() as unknown as T[];
  const q = (name: string) => `"${name.replaceAll('"', '""')}"`;
  db.prepare('ATTACH DATABASE ? AS newer').run(newer);
  const theirs = new Map(all<Listed>('PRAGMA newer.table_list').map((l) => [l.name, l]));
  for (const l of all<Listed>('PRAGMA main.table_list')) {
    if (l.name.startsWith('sqlite_') || l.name === 'migration' || (l.type !== 'table' && l.type !== 'virtual')) continue;
    if (theirs.get(l.name)?.type !== l.type) continue;
    const ours = all<Column>(`PRAGMA main.table_info(${q(l.name)})`);
    const have = new Set(all<Column>(`PRAGMA newer.table_info(${q(l.name)})`).map((c) => c.name));
    const keyed = ours.filter((c) => c.pk > 0);
    /* A TABLE WHOSE KEY IS AN INTEGER PRIMARY KEY CARRIES ITS ROWID AS THAT COLUMN, so naming both would name it twice. */
    const aliased = keyed.length === 1 && keyed[0]?.type.toUpperCase() === 'INTEGER';
    const columns = [...(l.wr === 0 && !aliased ? ['rowid'] : []), ...ours.filter((c) => have.has(c.name)).map((c) => q(c.name))].join(', ');
    const verb = l.type === 'virtual' ? 'INSERT' : 'INSERT OR IGNORE';
    db.exec(`${verb} INTO main.${q(l.name)} (${columns}) SELECT ${columns} FROM newer.${q(l.name)}`);
  }
  db.exec('DETACH DATABASE newer');
  if (shape.refuse !== undefined)
    db.exec(`CREATE TRIGGER refuse_one BEFORE INSERT ON migration WHEN NEW.version = ${shape.refuse} BEGIN SELECT RAISE(ABORT, 'this test refuses migration ${shape.refuse}'); END`);
  db.close();
  return { dir, temp, file, bytes: new Uint8Array(readFileSync(file)) };
}

const leftIn = (temp: string): string[] => readdirSync(temp);

test('A RECORD AT AN OLDER COUNT TAKES EVERY NEW MIGRATION AND COMES THROUGH WHOLE: each list counted, boot and list read, nothing left', async (t) => {
  const n = await older(t);
  const out = await rehearsal([n.file], n.temp);
  assert.equal(out.code, 0, `${out.stdout}\n${out.stderr}`);

  assert.match(out.stdout, new RegExp(`migrating\\s+from ${OLDER} migrations to ${MIGRATIONS.length}`));
  for (const m of MIGRATIONS.slice(OLDER)) assert.match(out.stdout, new RegExp(`ran\\s+migration ${m.version} ${m.slug}\\b`));
  assert.match(out.stdout, /entry\s+5\s+5\s+✓/);
  assert.match(out.stdout, /things\s+2\s+2\s+✓/);
  assert.match(out.stdout, /tools\s+3\s+3\s+✓/);
  assert.match(out.stdout, /read\s+boot\s+list/, 'boot answered and each list was read');
  assert.match(out.stdout, new RegExp(`^PASS ${REC} · ${MIGRATIONS.length - OLDER} migrations ran`, 'm'));
  assert.doesNotMatch(out.stdout, /✗/);

  assert.deepEqual(leftIn(n.temp), [], 'the copy it migrated is removed');
  assert.deepEqual(new Uint8Array(readFileSync(n.file)), n.bytes, 'the file it was handed is not touched');
});

test('A MIGRATION THAT THROWS IS A FAIL NAMING IT, after the ones before it ran, and nothing is left in temp', async (t) => {
  const last = MIGRATIONS[MIGRATIONS.length - 1];
  assert.ok(last);
  const n = await older(t, { refuse: last.version });
  const out = await rehearsal([n.file], n.temp);
  assert.equal(out.code, 1, `${out.stdout}\n${out.stderr}`);

  for (const m of MIGRATIONS.slice(OLDER, -1)) assert.match(out.stdout, new RegExp(`ran\\s+migration ${m.version} ${m.slug}\\b`));
  assert.match(out.stdout, new RegExp(`^FAIL ${REC} · migration ${last.version} \\(${last.slug}\\) threw`, 'm'));
  assert.match(out.stdout, new RegExp(`this test refuses migration ${last.version}`), 'the driver sentence is said');
  assert.doesNotMatch(out.stdout, /^PASS/m);

  assert.deepEqual(leftIn(n.temp), []);
  assert.deepEqual(new Uint8Array(readFileSync(n.file)), n.bytes, 'the file it was handed is not touched');
});

test('A NIGHT NEEDS THE LIVE BUILD NAMED, AND AN IDENTITY INSIDE THE REPOSITORY IS REFUSED BEFORE IT IS READ', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-rehearsal-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const temp = join(dir, 'temp');
  mkdirSync(temp);
  /* ONLY ITS FIRST LINE IS READ BEFORE THE REFUSALS, which is what makes it a sealed night. */
  const night = join(dir, 'latest.brainl.age');
  writeFileSync(night, 'age-encryption.org/v1\n');

  const unnamed = await rehearsal([night, '--identity', join(dir, 'backup.key')], temp);
  assert.equal(unnamed.code, 1);
  assert.match(unnamed.stderr, /--deployed/);

  const inRepo = await rehearsal([night, '--identity', join(REPO, 'backup.key'), '--deployed', 'HEAD'], temp);
  assert.equal(inRepo.code, 1);
  assert.match(inRepo.stderr, /inside the repository/);
  const dotted = await rehearsal([night, '--identity', join(REPO, '..backup.key'), '--deployed', 'HEAD'], temp);
  assert.match(dotted.stderr, /inside the repository/, 'a name that starts with two dots is still inside');

  const unsealed = await rehearsal([night, '--deployed', 'HEAD'], temp);
  assert.equal(unsealed.code, 1);
  assert.match(unsealed.stderr, /--identity/);
  assert.deepEqual(leftIn(temp), []);
});
