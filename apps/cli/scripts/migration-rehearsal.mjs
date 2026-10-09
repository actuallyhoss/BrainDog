#!/usr/bin/env node
/**
 * The migration rehearsal: last night's copy of a Cloud record, restored by the build that is live, then opened by this
 * checkout's kernel so every migration it adds runs over real rows before any person's record meets it.
 *
 *   node apps/cli/scripts/migration-rehearsal.mjs <night.brainl.age> --identity <age identity file> --deployed <sha>
 *   node apps/cli/scripts/migration-rehearsal.mjs --record <night> --record <night> --identity-cmd "<command>" --deployed <sha>
 *   node apps/cli/scripts/migration-rehearsal.mjs <record.brain>
 *
 * `--record` AND `--identity-cmd` ARE THE RESTORE DRILL'S FLAGS (LCH-C04), so one line of a runbook names a copy for
 * either. `--record` names one record's copy and may be given once per record: each is rehearsed on its own throwaway
 * copy, restored by the same live build, and the run is PASS only when every one is. `--identity-cmd` reads the age
 * identity from a command's output (the keychain, or a password manager's command line), so no key file is ever
 * written; its output is never printed. A `--record` that names a record's address rather than a file waits for the
 * drill's own fetch, and is refused until then with the way round it.
 *
 * AND A PASS WRITES THE RECEIPT INTO THE LOCK (`packages/kernel/src/migrations/LOCK.json`, `--lock` for another copy of
 * it): for each migration that ran and that the lock does not already mark `applied`, the date, how many records it ran
 * over and how many rows they held, and PASS. Counts only: no record's name, id or row goes into a tracked file. A FAIL
 * writes nothing, so the `migration-lock` gate stays red until a rehearsal passes.
 *
 * WHY IT EXISTS. A migration runs at open on every live record, the first time that record is opened on the new build,
 * and it cannot be rolled back once it has run. The tests run each migration over a
 * record a test built, which holds the rows a test thought of. This runs them over the rows a person actually holds,
 * on a throwaway copy, before the merge that ships them, and FAIL stops that merge.
 *
 * WHAT IT DOES WITH A NIGHT, IN ORDER, and it stops at the first step that fails:
 *   1. opens the copy with the identity file he names, through the restore drill's own age reader
 *      (`restore-drill.mjs`). An identity path inside this repository is refused before it is read, as the drill does.
 *   2. checks out the deployed sha as a `git worktree` under the OS temp folder and installs it there, so the restore in
 *      step 3 is the live build's and not this checkout's.
 *   3. restores the night with that build's `braindog init rehearsal --from`, the drill's restore and the command a host
 *      runs, into a throwaway data directory. The record it writes is at the live build's migration count.
 *   4. counts every table, its columns and every index, and every list's rows, in that file.
 *   5. opens the file with this checkout's kernel, which runs every migration the live build does not have. A migration
 *      that throws is a FAIL naming it; a record the kernel refuses (an applied migration whose text changed, a copy
 *      newer than this checkout) is a FAIL with the refusal's sentence.
 *   6. counts again and compares: a table, column or index gone, a table with fewer rows, or a list whose rows changed
 *      is a FAIL. A table with more rows is said and not scored, because a migration may write its own metadata rows,
 *      and a list is held to the exact count, so a migration that writes a person's rows cannot hide there.
 *   7. calls `boot`, then one `list` per list `boot` names, as the app does on its first screen, and holds each count
 *      to the rows counted in step 4.
 *   8. prints PASS or FAIL and removes the worktree and the folder, with the opened copy and the record in it, which
 *      steps 5 to 7 migrated and read in place.
 *
 * A `.brain` FILE IS A RECORD ALREADY RESTORED, by the drill's restore at the deployed sha or copied out of a self-host's
 * data directory before an upgrade, so steps 1 to 3 are skipped and it is copied into the folder, never opened in place.
 * The copy is SQLite's own `VACUUM INTO`, a consistent snapshot even while a host is writing the file.
 *
 * NOTHING HERE WRITES TO A NETWORK OR TO A LIVE RECORD. The night is a file he fetched himself; the one network read is `pnpm install`'s, and only when the package store on this
 * machine does not already hold what the live build's lockfile names.
 *
 * THE WORKTREE IS NOT THIS TREE, and that is the point of it: a restore by this checkout's kernel would run the new
 * migrations inside the restore, so the open in step 5 would have nothing left to run and the rehearsal would pass
 * having rehearsed nothing.
 */

import { spawnSync } from 'node:child_process';
import { closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';

import { MIGRATIONS, checksum, openRecord } from '@braindog/kernel';
import { guarded } from '@braindog/ports';

/* THE LOCK IS WRITTEN AS THE GATE READS IT, by the gate's own writer, so the two never disagree about its shape. */
import { lockText } from '../../../tools/gates/migration-lock.mjs';

import { planCommand } from '../src/keys.ts';
/* THE RECORD PACKAGE BY ITS PATH, as `test/brainfile-novault.test.ts` reaches it: the CLI does not depend on it, and
   `boot` and `list` are the record's methods, not the kernel's. Its own imports resolve from its own folder. */
import { createRecordApi } from '../../../packages/record/src/index.ts';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const DRILL = fileURLToPath(new URL('./restore-drill.mjs', import.meta.url));
const SLUG = 'rehearsal';
/** The last lines of a refusing child's output that are said, so a failed install names its reason and not its log. */
const TAIL_LINES = 12;
const CLOCK = { now: () => Date.now() };

const say = (line) => process.stderr.write(`${line}\n`);
const out = (line) => process.stdout.write(`${line}\n`);

const USAGE =
  'The rehearsal takes the nights it runs over and the build they are restored with, as in node apps/cli/scripts/migration-rehearsal.mjs --record latest.brainl.age --identity-cmd "<a command that prints the age identity>" --deployed <the sha that is live>, with --record once per record (or --identity <a file outside this repository>), or record.brain files already restored and nothing else.';

/** The kernel's lock, where a PASS writes its receipt. `--lock` names another copy of it, as a test does. */
const LOCK_FILE = fileURLToPath(new URL('../../../packages/kernel/src/migrations/LOCK.json', import.meta.url));

const row = (a, b, c, mark) => `  ${String(a).padEnd(28)}${String(b).padStart(9)}${String(c).padStart(10)}  ${mark}`.trimEnd();
const quoted = (name) => `"${name.replaceAll('"', '""')}"`;
const said = (e) => (e instanceof Error ? e.message : String(e));

// ─── the record file, as SQLite holds it ──────────────────────────────────────────────────────────────────────────

/**
 * The `Sql` port over `node:sqlite`, as the drill builds it, behind `guarded`, as a host builds it.
 *
 * GUARDED BECAUSE THE CLOUD IS WHERE THE RECORD LIVES. `guarded` holds every statement to the Durable Object's limits
 * (`packages/ports/src/sql.ts`), so a migration that runs in Node and would be refused on the Cloud fails here too.
 */
function openSql(path) {
  const db = new DatabaseSync(path, { enableForeignKeyConstraints: false });
  let depth = 0;
  return guarded({
    close: () => db.close(),
    exec: (text, ...params) => (params.length === 0 ? db.exec(text) : void db.prepare(text).run(...params)),
    all: (text, ...params) => db.prepare(text).all(...params),
    one: (text, ...params) => db.prepare(text).get(...params),
    transactionSync(fn) {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  });
}

const hasTable = (sql, name) => sql.one("SELECT 1 AS y FROM sqlite_schema WHERE type = 'table' AND name = ?", name) !== undefined;

/** The versions in the record's migration ledger, oldest first; none when it has no ledger yet. */
const ledgerOf = (sql) => (hasTable(sql, 'migration') ? sql.all('SELECT version FROM migration ORDER BY version').map((r) => Number(r.version)) : []);

/**
 * Everything the comparison reads: each table's rows and columns, each index, each list's rows, and the ledger.
 *
 * `PRAGMA table_list` NAMES THE KIND OF EACH TABLE, so FTS5's shadow tables, which are the search index's own storage
 * and change shape whenever the index merges, are left out, and the index itself is counted as the table it is. The
 * walk is one `count(*)` per table the schema holds, so it is bounded by the schema and reads each row once.
 */
function measure(sql) {
  const tables = new Map();
  for (const t of sql.all('PRAGMA main.table_list')) {
    const name = String(t.name);
    if (name.startsWith('sqlite_') || (t.type !== 'table' && t.type !== 'virtual')) continue;
    const columns = sql.all(`PRAGMA main.table_info(${quoted(name)})`).map((c) => String(c.name));
    tables.set(name, { n: Number(sql.one(`SELECT count(*) AS n FROM ${quoted(name)}`)?.n ?? 0), columns });
  }
  /* AN INDEX SQLITE MADE FOR A CONSTRAINT HAS NO SQL, and it goes and comes with its table, so only declared ones count. */
  const indexes = new Set(sql.all("SELECT name FROM sqlite_schema WHERE type = 'index' AND sql IS NOT NULL").map((r) => String(r.name)));
  const lists = new Map();
  if (tables.has('entry'))
    for (const r of sql.all('SELECT register, count(*) AS n, count(deleted_at) AS gone FROM entry GROUP BY register'))
      lists.set(String(r.register), { n: Number(r.n), live: Number(r.n) - Number(r.gone) });
  const record = tables.has('record') ? sql.one('SELECT id FROM record LIMIT 1')?.id : undefined;
  return { tables, indexes, lists, ledger: ledgerOf(sql), record: typeof record === 'string' ? record : 'a record the file does not name' };
}

/**
 * Who `boot` and `list` are asked as: the record's first owner who is not suspended, as the app asks for its owner.
 *
 * A PERSON AND NOT THE SYSTEM, because `boot` reads a person's own sessions, waiting questions and shell, and those are
 * what a migration to `pref` or `session` would break. A record with no such owner is asked as the system.
 */
function askerOf(sql) {
  if (hasTable(sql, 'member') && hasTable(sql, 'person')) {
    const owner = sql.one(
      "SELECT m.person_id AS id FROM member m JOIN person p ON p.id = m.person_id WHERE m.register = '*' AND m.level = 'owner' AND p.suspended_at IS NULL ORDER BY m.person_id LIMIT 1",
    );
    if (typeof owner?.id === 'string') return { principal: { kind: 'person', id: owner.id, level: 'owner' }, credentialed: true };
  }
  return { principal: { kind: 'system', id: SLUG } };
}

const refusalOf = (r) => (r.refusal ? `${r.refusal.code}${r.refusal.at ? ` at ${r.refusal.at}` : ''}. ${r.refusal.fix ?? ''}`.trim() : 'a conflict');

/**
 * Steps 4 to 7 over one restored record file, which is a throwaway copy in the rehearsal's folder. 0 is PASS, 1 FAIL.
 *
 * `seen` IS WHAT THE RECEIPT IS MADE OF, and it is counts: the migrations that ran and the rows the record's lists held.
 */
async function rehearse(file, seen = { ran: [], rows: 0 }) {
  const sql = openSql(file);
  try {
    const before = measure(sql);
    seen.rows = [...before.lists.values()].reduce((sum, l) => sum + l.n, 0);
    const name = before.record;
    const had = new Set(before.ledger);
    const coming = MIGRATIONS.filter((m) => !had.has(m.version));
    if (coming.length === 0) out(`  migrating  nothing: the record is at ${before.ledger.length} migrations, which is all this checkout has, so this rehearses the open alone`);
    else out(`  migrating  from ${before.ledger.length} migrations to ${MIGRATIONS.length}, with this checkout's kernel`);

    // 5 · OPEN ─────────────────────────────────────────────────────────────────────────────────────────────────────
    let kernel;
    try {
      kernel = await openRecord(sql, CLOCK);
    } catch (e) {
      /* EACH MIGRATION IS ITS OWN TRANSACTION WITH ITS LEDGER ROW (`migrate.ts` `applyOne`), so the ones before the
         throw are in the ledger and the one that threw is not: the first of those coming that is still missing. */
      const now = new Set(ledgerOf(sql));
      for (const m of coming) if (now.has(m.version)) out(`  ran        migration ${m.version} ${m.slug}`);
      const threw = coming.find((m) => !now.has(m.version));
      if (threw) out(`FAIL ${name} · migration ${threw.version} (${threw.slug}) threw, so no record opened on this build would open: ${said(e)}`);
      else out(`FAIL ${name} · every migration ran and the kernel then threw opening the record: ${said(e)}`);
      return 1;
    }
    const refusal = kernel.refused();
    if (refusal) {
      out(`FAIL ${name} · the kernel refused the record: ${refusalOf({ refusal })}`);
      return 1;
    }
    const after = measure(sql);
    const ran = coming.filter((m) => after.ledger.includes(m.version));
    seen.ran = ran;
    for (const m of ran) out(`  ran        migration ${m.version} ${m.slug}`);

    // 6 · COMPARE ──────────────────────────────────────────────────────────────────────────────────────────────────
    let failed = 0;
    out(row('table', 'before', 'after', ''));
    for (const [table, was] of before.tables) {
      const now = after.tables.get(table);
      if (!now) {
        failed++;
        out(row(table, was.n, 'gone', '✗'));
        continue;
      }
      const lost = was.columns.filter((c) => !now.columns.includes(c));
      if (lost.length > 0) {
        failed++;
        out(row(table, was.n, now.n, `✗ lost ${lost.join(', ')}`));
      } else if (now.n < was.n) {
        failed++;
        out(row(table, was.n, now.n, '✗ lost rows'));
      } else if (now.n > was.n) out(row(table, was.n, now.n, '+ written by a migration'));
      else if (was.n > 0) out(row(table, was.n, now.n, '✓'));
    }
    for (const [table, now] of after.tables) if (!before.tables.has(table)) out(row(table, 'new', now.n, ''));
    for (const index of before.indexes)
      if (!after.indexes.has(index)) {
        failed++;
        out(`  index ${index} is gone`);
      }

    out(row('list', 'before', 'after', ''));
    for (const [list, was] of before.lists) {
      const now = after.lists.get(list) ?? { n: 0, live: 0 };
      const same = now.n === was.n && now.live === was.live;
      if (!same) failed++;
      out(row(list, was.n, now.n, same ? '✓' : '✗'));
    }
    for (const [list, now] of after.lists)
      if (!before.lists.has(list)) {
        failed++;
        out(row(list, 0, now.n, '✗'));
      }

    // 7 · READ, AS THE APP DOES ────────────────────────────────────────────────────────────────────────────────────
    /* `createRecordApi` OPENS THE RECORD AGAIN, which runs nothing now, and it is the object a host serves. The counts
       above were taken first, because the record's own open may write to its declarations. */
    const api = await createRecordApi({ sql, clock: CLOCK });
    const ctx = askerOf(sql);
    const booted = await api.boot(ctx);
    let read = 0;
    if (!booted.ok) {
      failed++;
      out(`  boot refused: ${refusalOf(booted)}`);
    } else {
      out(row('read', 'boot', 'list', ''));
      for (const r of booted.value.registers) {
        const live = before.lists.get(r.id)?.live ?? 0;
        const listed = await api.list({ register: r.id, limit: 1 }, ctx);
        const good = r.count === live && listed.ok && listed.value.matched === live;
        if (!good) failed++;
        read++;
        out(row(r.id, r.count, listed.ok ? listed.value.matched : 'refused', good ? '✓' : `✗ ${live} before`));
        if (!listed.ok) out(`  list ${r.id} refused: ${refusalOf(listed)}`);
      }
    }

    // 8 · SAY SO ───────────────────────────────────────────────────────────────────────────────────────────────────
    if (failed > 0) out(`FAIL ${name} · ${failed} of the record's tables, indexes, lists and reads did not come through the migrations as they were`);
    else
      out(
        `PASS ${name} · ${ran.length} migrations ran over ${before.tables.size} tables, every list kept its rows, and boot and ${read} lists answered as they did before`,
      );
    return failed > 0 ? 1 : 0;
  } finally {
    sql.close();
  }
}

// ─── the night, restored by the build that is live ────────────────────────────────────────────────────────────────

const aFile = (path) => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

/** Git in this repository, with its arguments as they are and no shell. */
const git = (...args) => spawnSync('git', ['-C', REPO, ...args], { encoding: 'utf8' });

const tail = (text) =>
  String(text ?? '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .slice(-TAIL_LINES);

/**
 * The identities in the file he names, or the sentence that says why not. The drill's rules, in the drill's words.
 *
 * `..` AS A PATH STEP, NOT AS TWO CHARACTERS, as the drill measured: a key saved in the repository as `..backup.key` is
 * relative `..backup.key`, and a bare `startsWith('..')` would read it.
 */
function identitiesOf(path, reader) {
  const idPath = resolve(path);
  const within = relative(resolve(REPO), idPath);
  if (within === '' || (within !== '..' && !within.startsWith(`..${sep}`) && !isAbsolute(within)))
    return { refused: `The identity file is inside the repository, and it must never be. Move it out of ${resolve(REPO)} and delete it from the tree before anything is committed; it was not read.` };
  if (reader === null) return { ids: null };
  let text;
  try {
    text = readFileSync(idPath, 'latin1');
  } catch {
    return { refused: 'The identity file could not be read.' };
  }
  return keysIn(text, reader, 'The identity file');
}

/**
 * The identities in a text, from a file or from a command, by the drill's reader. `what` begins each sentence.
 *
 * THE SENTENCE NAMES NO LINE AND QUOTES NOTHING, because the line it would quote is the secret.
 */
function keysIn(text, reader, what) {
  if (text.startsWith('age-encryption.org/'))
    return { refused: `${what} is itself sealed with a passphrase. Give the rehearsal the opened identity, through --identity-cmd or a file outside this repository deleted after.` };
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('#'));
  const keys = lines.map(reader.secretOf);
  if (lines.length === 0 || keys.some((k) => k === null))
    return { refused: `${what} holds a line that is not an age identity (AGE-SECRET-KEY-1 and its checksum), so it was copied with a character wrong or it is not the key.` };
  return { ids: keys.map(reader.keyOf) };
}

/**
 * The identities a command prints, as the drill's `--identity-cmd` reads them: the keychain's or a password manager's
 * command line, run by the shell, its output read and never shown.
 *
 * ITS OWN ERROR OUTPUT IS NOT SAID EITHER. A password manager that fails may print the item it was asked for, and the
 * exit code is enough to say what went wrong.
 */
function identitiesFromCommand(command, reader) {
  const r = spawnSync(command, { shell: true, encoding: 'latin1', stdio: ['inherit', 'pipe', 'pipe'], maxBuffer: 1 << 20 });
  if (r.error) return { refused: `The identity command could not be run (${r.error.code ?? 'no reason given'}), so no identity was read.` };
  if (r.status !== 0) return { refused: `The identity command exited ${r.status}, so no identity was read. Run it by itself to see why.` };
  return keysIn(String(r.stdout ?? ''), reader, 'What the identity command printed');
}

/**
 * The drill's age reader, or null when this checkout's drill does not export it.
 *
 * LOADED ONLY FOR A SEALED NIGHT, so a `.brain` file and an opened `.brainl` need nothing from the drill.
 *
 * AND NOT IMPORTED AT ALL WHILE THE DRILL RUNS ITSELF ON IMPORT. Its last line awaits its own `main()` unless it is
 * guarded by `import.meta.main`, and unguarded that `main()` would read this rehearsal's arguments as a drill's, refuse
 * `--deployed`, print the drill's usage and set the exit code, before a single export could be read.
 */
async function drillReader() {
  if (!/^if \(import\.meta\.main\)/m.test(readFileSync(DRILL, 'utf8'))) return null;
  const drill = await import('./restore-drill.mjs');
  return typeof drill.ageOpen === 'function' && typeof drill.secretOf === 'function' && typeof drill.keyOf === 'function' ? drill : null;
}

/** Step 2: the live build checked out and installed in `tree`, once for every night the run names. */
function checkOutDeployed(sha, tree) {
  const added = git('worktree', 'add', '--detach', tree, sha);
  if (added.status !== 0) {
    for (const line of tail(added.stderr)) say(line);
    return `git worktree add refused ${sha}, so the live build could not be checked out`;
  }
  out(`  deployed   ${sha}, checked out in ${tree}, removed when the rehearsal ends`);

  /* OFFLINE FIRST, FROM THE PACKAGE STORE THIS MACHINE ALREADY HOLDS, and online only when that store lacks something
     the live build's lockfile names. `--frozen-lockfile` installs what that build shipped with, never a newer one, and
     `--ignore-scripts` runs no package's install script. The two filters are the CLI and the self-host its `init`
     starts, with everything they import; the web app and the site are not needed to restore a record. */
  const install = (offline) => {
    const args = ['install', '--frozen-lockfile', '--ignore-scripts', ...(offline ? ['--offline'] : []), '--filter', 'braindog-cli...', '--filter', '@braindog/selfhost...'];
    const launch = planCommand('pnpm', args, process.env, { platform: process.platform, isFile: aFile });
    if (typeof launch === 'string') return { status: 1, stderr: launch };
    return spawnSync(launch.command, launch.args, { cwd: tree, encoding: 'utf8', windowsVerbatimArguments: launch.verbatim });
  };
  let installed = install(true);
  if (installed.status === 0) out('  installed  from the package store on this machine, offline');
  else {
    installed = install(false);
    if (installed.status !== 0) {
      for (const line of tail(installed.stderr || installed.stdout)) say(line);
      return `pnpm install could not install the live build in its worktree (exit ${installed.status}), so it could not restore the night`;
    }
    out('  installed  with pnpm, which fetched what the package store on this machine lacked');
  }
  return null;
}

/** Step 3: one night restored by the live build in `tree` into `data`, its own throwaway data directory. */
function restoreWithDeployed(tree, night, data) {
  /* THE CHILD GETS NO BRAINDOG_ VARIABLE OF HIS SHELL BUT THE DATA DIRECTORY. BRAINDOG_SELFHOST would start this
     checkout's self-host in place of the live build's, BRAINDOG_KEK_FILE would read a real root key, and BRAINDOG_OWNER
     would choose the copy's owner; without them the child makes a key of its own in the throwaway folder. */
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.toUpperCase().startsWith('BRAINDOG_')));
  env.BRAINDOG_DATA = data;
  const init = spawnSync(process.execPath, [join(tree, 'apps', 'cli', 'src', 'main.ts'), 'init', SLUG, '--from', night], { encoding: 'utf8', cwd: tree, env });
  if (init.status !== 0) {
    for (const line of tail(init.stderr)) say(line);
    return `the live build's braindog init --from refused the night (exit ${init.status}), so no host on that build could serve it`;
  }
  out(`  restored   with the live build's braindog init ${SLUG} --from, into a throwaway data directory`);
  return null;
}

/**
 * A copy of a record file he names, into the folder: `VACUUM INTO` from a read-only connection, which is a consistent
 * snapshot and changes nothing in his file.
 *
 * THE FALLBACK IS A COPY OF THE FILE AND ITS WRITE-AHEAD LOG, for a SQLite that will not vacuum a read-only connection
 * into another file. It is consistent only while nothing writes the file, which the sentence before it says.
 */
function copyRecord(from, to) {
  const db = new DatabaseSync(from, { readOnly: true });
  try {
    db.exec(`VACUUM INTO '${to.replaceAll("'", "''")}'`);
    return;
  } catch {
    rmSync(to, { force: true });
  } finally {
    db.close();
  }
  out('  copying    the file and its write-ahead log as they are, so stop any host serving it before trusting this');
  copyFileSync(from, to);
  if (existsSync(`${from}-wal`)) copyFileSync(`${from}-wal`, `${to}-wal`);
}

/** The first bytes of a file, without reading the rest of it. */
function headOf(path) {
  const fd = openSync(path, 'r');
  try {
    const head = Buffer.alloc(64);
    return head.subarray(0, readSync(fd, head, 0, head.length, 0)).toString('latin1');
  } finally {
    closeSync(fd);
  }
}

/**
 * What a named file is, by its first bytes: a record already restored, a sealed night, an opened night, or the
 * sentence that says why it is none of them.
 *
 * A NAME THAT IS NOT A FILE AND LOOKS LIKE AN ADDRESS is a record the drill would fetch. That fetch is the restore
 * drill's own `--record` and this checkout's drill does not have it yet, so the sentence gives the way round it.
 */
function kindOf(input) {
  if (!aFile(input)) {
    if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(input) || !/[\\/.]/u.test(input))
      return {
        refused: `${input} names a record and not a file. Fetching a record's newest copy by its address comes with the restore drill's --record, which this checkout's drill does not have yet: download the night from Settings > Backups and name the file.`,
      };
    return { refused: `${input} could not be read.` };
  }
  let head;
  try {
    head = headOf(input);
  } catch {
    return { refused: `${input} could not be read.` };
  }
  if (head.startsWith('-----BEGIN AGE ENCRYPTED FILE-----'))
    return { refused: `${input} is armored age text, and the Cloud puts binary copies. Fetch the object again with wrangler, which writes the bytes as they are.` };
  if (head.startsWith('SQLite format 3\0')) return { kind: 'record' };
  return { kind: head.startsWith('age-encryption.org/') ? 'sealed' : 'night' };
}

/**
 * Steps 1 to 3 for one named file, into its own folder `here`: the record file the rehearsal opens, or the sentence
 * that stopped it. A `.brain` is copied; a night is opened (with `keys` when sealed) and restored by the live build,
 * which `deployed()` checks out the first time a night needs it, so a key that opens nothing stops the run before it.
 */
async function recordOf({ input, kind }, here, tree, keys, deployed) {
  if (kind === 'record') {
    const file = join(here, 'record.brain');
    copyRecord(input, file);
    out('  copied     the record into a throwaway folder, removed when the rehearsal ends; the file named is not opened for writing');
    return { file };
  }
  // 1 · OPEN ─────────────────────────────────────────────────────────────────────────────────────────────────────
  let bytes = readFileSync(input);
  if (kind === 'sealed') {
    const opened = keys.reader.ageOpen(bytes, keys.ids);
    if (opened.refused) return { stopped: opened.refused };
    bytes = opened.plain;
    out(`  opened     ${bytes.length} bytes of .brainl with the identity whose recipient is ${keys.ids.map((k) => k.recipient).join(', ')}`);
  } else out('  opened     already: the night is not sealed, so it is read as it is');
  const night = join(here, 'night.brainl');
  writeFileSync(night, bytes, { mode: 0o600 });

  // 2 AND 3 · THE LIVE BUILD, AND ITS RESTORE ────────────────────────────────────────────────────────────────────
  const unready = deployed();
  if (unready) return { stopped: unready };
  const data = join(here, 'data');
  const stopped = restoreWithDeployed(tree, night, data);
  return stopped ? { stopped } : { file: join(data, SLUG, 'record.brain') };
}

/**
 * The receipt, into the lock: for every migration that ran over at least one record and that the lock does not mark
 * `applied`, the date, how many records it ran over, the rows those records' lists held, and PASS. 0 when written or
 * when none was needed, 1 when the lock could not be read or written.
 *
 * AN APPLIED MIGRATION IS NEVER GIVEN A RECEIPT. A record at an older count runs migrations every live record already
 * ran, and a receipt on one of them would say this rehearsal is what shipped it.
 *
 * AND A MIGRATION WHOSE TEXT CHANGED SINCE ITS LAST RECEIPT IS LOCKED AT ITS NEW TEXT, because what was rehearsed is the
 * text this checkout holds; an applied one is never rewritten here, and the gate says when it moved.
 */
async function receipt(results, lockFile) {
  const ran = new Map();
  for (const r of results)
    for (const m of r.ran) {
      const was = ran.get(m.version) ?? { m, records: 0, rows: 0 };
      was.records++;
      was.rows += r.rows;
      ran.set(m.version, was);
    }
  if (ran.size === 0) {
    out('  receipt    none needed: no migration ran');
    return 0;
  }
  let lock;
  try {
    lock = JSON.parse(readFileSync(lockFile, 'utf8'));
  } catch (e) {
    out(`  receipt    not written: the lock could not be read (${said(e)})`);
    return 1;
  }
  const at = new Date().toISOString();
  const written = [];
  for (const { m, records, rows } of [...ran.values()].sort((a, b) => a.m.version - b.m.version)) {
    const file = `${String(m.version).padStart(4, '0')}_${m.slug}.ts`;
    if (lock[file]?.applied === true) continue;
    const sum = await checksum(m.sql);
    // An owner's waiver stays beside the receipt, as long as it was written for this same text.
    const kept = lock[file]?.checksum === sum && lock[file]?.waived ? { waived: lock[file].waived } : {};
    lock[file] = { checksum: sum, applied: false, rehearsed: { at, records, rows, pass: true }, ...kept };
    written.push(`migration ${m.version} ${m.slug}, ${records} ${records === 1 ? 'record' : 'records'} and ${rows} rows`);
  }
  if (written.length === 0) {
    out('  receipt    none needed: every migration that ran is one the lock already marks applied');
    return 0;
  }
  try {
    writeFileSync(lockFile, lockText(lock));
  } catch (e) {
    out(`  receipt    not written: the lock could not be written (${said(e)})`);
    return 1;
  }
  for (const w of written) out(`  receipt    ${w}, PASS, written to the lock`);
  return 0;
}

async function main() {
  let values;
  let positionals;
  try {
    ({ values, positionals } = parseArgs({
      allowPositionals: true,
      strict: true,
      options: {
        record: { type: 'string', multiple: true },
        identity: { type: 'string' },
        'identity-cmd': { type: 'string' },
        deployed: { type: 'string' },
        lock: { type: 'string' },
      },
    }));
  } catch {
    say(USAGE);
    return 1;
  }
  /* A BARE FILE IS ONE `--record`, as it was before the flag, so a runbook line that names one still runs. */
  const inputs = [...positionals, ...(values.record ?? [])];
  if (inputs.length === 0) {
    say(USAGE);
    return 1;
  }
  const identityCmd = values['identity-cmd'];
  if (values.identity !== undefined && identityCmd !== undefined) {
    say('The rehearsal takes the identity one way: --identity <file> or --identity-cmd "<command>", not both.');
    return 1;
  }
  const named = [];
  for (const input of inputs) {
    const k = kindOf(input);
    if (k.refused) {
      say(k.refused);
      return 1;
    }
    named.push({ input, kind: k.kind });
  }
  const nights = named.filter((n) => n.kind !== 'record');
  const sealed = nights.find((n) => n.kind === 'sealed');
  const keyed = values.identity !== undefined || identityCmd !== undefined;
  if (nights.length === 0 && (values.deployed !== undefined || keyed)) {
    say(`${named.length === 1 ? `${inputs[0]} is a record` : 'Every file named is a record'} already restored, so it takes neither --deployed nor an identity. ${USAGE}`);
    return 1;
  }
  if (nights.length > 0 && values.deployed === undefined) {
    say(`${nights[0].input} is a night, so the rehearsal needs the build that is live to restore it with: add --deployed <sha>, the sha the live Worker was built from.`);
    return 1;
  }
  if (sealed && !keyed) {
    say(
      `${sealed.input} is sealed, so the rehearsal needs the identity that opens it: add --identity-cmd "<a command that prints it>", or --identity <file>, the age identity kept outside this repository.`,
    );
    return 1;
  }
  /* THE IDENTITY'S PLACE IS CHECKED BEFORE ANYTHING ELSE IS DONE, and before the drill's reader is loaded, so a key in
     the tree is refused at once and never read. */
  if (sealed && values.identity !== undefined) {
    const where = identitiesOf(values.identity, null);
    if (where.refused) {
      say(where.refused);
      return 1;
    }
  }
  /* A SHA IS NEVER AN OPTION TO GIT: one starting with `-` is refused here, and the rest must name a commit this clone
     holds, which `git fetch` gives it. */
  let sha = null;
  if (nights.length > 0) {
    const asked = values.deployed;
    const found = asked.startsWith('-') ? null : git('rev-parse', '--verify', '--quiet', `${asked}^{commit}`);
    if (found === null || found.status !== 0) {
      say(`${asked} is not a commit this clone holds. Run git fetch, then name the sha the live Worker was built from.`);
      return 1;
    }
    sha = found.stdout.trim();
  }

  out(`migration rehearsal · ${named.length === 1 ? inputs[0] : `${named.length} records`}${sha ? ` · live build ${sha.slice(0, 12)}` : ''}`);

  /* EVERYTHING GOES IN ONE FOLDER, AND THE FOLDER GOES WHATEVER HAPPENS: the opened nights, the worktree, and the
     restored records, which the rehearsal migrates in place. Ctrl-C removes it too. */
  const scratch = mkdtempSync(join(tmpdir(), 'braindog-rehearsal-'));
  const tree = join(scratch, 'deployed');
  const cleanup = () => {
    if (sha !== null && existsSync(tree)) git('worktree', 'remove', '--force', tree);
    rmSync(scratch, { recursive: true, force: true });
    /* A WORKTREE REMOVE THAT FAILED LEAVES ITS NAME IN `.git/worktrees`; with the folder gone, prune clears it. */
    if (sha !== null) git('worktree', 'prune');
  };
  process.once('SIGINT', () => {
    cleanup();
    process.exit(130);
  });
  try {
    let keys = null;
    if (sealed) {
      const reader = await drillReader();
      if (reader === null) {
        say(
          "This checkout's restore-drill.mjs does not export its age reader (ageOpen, secretOf and keyOf) with its main() behind import.meta.main, so a sealed night cannot be opened here. Open it with age -d into a file outside this repository and name that instead.",
        );
        return 1;
      }
      const id = identityCmd !== undefined ? identitiesFromCommand(identityCmd, reader) : identitiesOf(values.identity, reader);
      if (id.refused) {
        say(id.refused);
        return 1;
      }
      keys = { reader, ids: id.ids };
    }
    /* THE LIVE BUILD IS CHECKED OUT AND INSTALLED ONCE, FOR EVERY NIGHT, and only when the first night is open. */
    let checkedOut;
    const deployed = () => (checkedOut === undefined ? (checkedOut = checkOutDeployed(sha, tree)) : checkedOut);

    // EACH RECORD ON ITS OWN COPY, 4 TO 8 ──────────────────────────────────────────────────────────────────────────
    const results = [];
    for (const [i, one] of named.entries()) {
      if (named.length > 1) out(`record ${i + 1} of ${named.length} · ${one.input}`);
      const here = join(scratch, `record-${i + 1}`);
      mkdirSync(here);
      const seen = { ran: [], rows: 0 };
      let code = 1;
      const got = await recordOf(one, here, tree, keys, deployed);
      if (got.stopped) out(`FAIL ${one.input} · ${got.stopped}`);
      else
        try {
          code = await rehearse(got.file, seen);
        } catch (e) {
          out(`FAIL ${one.input} · the rehearsal could not read the record: ${said(e)}`);
        }
      results.push({ code, ...seen });
      /* EACH COPY GOES AS SOON AS IT IS READ, so a run over many records holds one at a time. */
      rmSync(here, { recursive: true, force: true });
    }

    const failed = results.filter((r) => r.code !== 0).length;
    if (failed > 0) {
      if (named.length > 1) out(`FAIL · ${failed} of ${named.length} records did not come through the migrations, and the lock is not written`);
      return 1;
    }
    if (named.length > 1) out(`PASS · all ${named.length} records came through every migration`);
    return await receipt(results, values.lock ?? LOCK_FILE);
  } finally {
    cleanup();
  }
}

if (import.meta.main) process.exitCode = await main();
