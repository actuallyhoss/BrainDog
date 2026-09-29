#!/usr/bin/env node
/**
 * The migration rehearsal: last night's copy of a Cloud record, restored by the build that is live, then opened by this
 * checkout's kernel so every migration it adds runs over real rows before any person's record meets it.
 *
 *   node apps/cli/scripts/migration-rehearsal.mjs <night.brainl.age> --identity <age identity file> --deployed <sha>
 *   node apps/cli/scripts/migration-rehearsal.mjs <record.brain>
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
import { closeSync, copyFileSync, existsSync, mkdtempSync, openSync, readFileSync, readSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';

import { MIGRATIONS, openRecord } from '@braindog/kernel';
import { guarded } from '@braindog/ports';

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
  'The rehearsal takes one night and the build it is restored with, as in node apps/cli/scripts/migration-rehearsal.mjs latest.brainl.age --identity <a file outside this repository> --deployed <the sha that is live>, or one record.brain already restored and nothing else.';

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
 */
async function rehearse(file) {
  const sql = openSql(file);
  try {
    const before = measure(sql);
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
  if (text.startsWith('age-encryption.org/'))
    return { refused: 'The identity file is itself sealed with a passphrase. Open it with age -d into a file outside this repository, run the rehearsal with that, and delete it after.' };
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('#'));
  const keys = lines.map(reader.secretOf);
  /* THE SENTENCE NAMES NO LINE AND QUOTES NOTHING, because the line it would quote is the secret. */
  if (lines.length === 0 || keys.some((k) => k === null))
    return { refused: 'The identity file holds a line that is not an age identity (AGE-SECRET-KEY-1 and its checksum), so it was copied with a character wrong or it is not the file.' };
  return { ids: keys.map(reader.keyOf) };
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

/** Steps 2 and 3: the live build checked out and installed in `tree`, and the night restored with it into `data`. */
function restoreWithDeployed(sha, tree, night, data) {
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

async function main() {
  let values;
  let positionals;
  try {
    ({ values, positionals } = parseArgs({ allowPositionals: true, strict: true, options: { identity: { type: 'string' }, deployed: { type: 'string' } } }));
  } catch {
    say(USAGE);
    return 1;
  }
  const [input, ...more] = positionals;
  if (input === undefined || more.length > 0) {
    say(USAGE);
    return 1;
  }

  let head;
  try {
    head = headOf(input);
  } catch {
    say(`${input} could not be read.`);
    return 1;
  }
  const isRecord = head.startsWith('SQLite format 3\0');
  const isSealed = head.startsWith('age-encryption.org/');
  if (head.startsWith('-----BEGIN AGE ENCRYPTED FILE-----')) {
    say(`${input} is armored age text, and the Cloud puts binary copies. Fetch the object again with wrangler, which writes the bytes as they are.`);
    return 1;
  }
  if (isRecord && (values.deployed !== undefined || values.identity !== undefined)) {
    say(`${input} is a record already restored, so it takes neither --deployed nor --identity. ${USAGE}`);
    return 1;
  }
  if (!isRecord && values.deployed === undefined) {
    say(`${input} is a night, so the rehearsal needs the build that is live to restore it with: add --deployed <sha>, the sha the live Worker was built from.`);
    return 1;
  }
  if (isSealed && values.identity === undefined) {
    say(`${input} is sealed, so the rehearsal needs the identity that opens it: add --identity <file>, the age identity kept outside this repository.`);
    return 1;
  }
  /* THE IDENTITY'S PLACE IS CHECKED BEFORE ANYTHING ELSE IS DONE, and before the drill's reader is loaded, so a key in
     the tree is refused at once and never read. */
  if (isSealed) {
    const where = identitiesOf(values.identity, null);
    if (where.refused) {
      say(where.refused);
      return 1;
    }
  }
  /* A SHA IS NEVER AN OPTION TO GIT: one starting with `-` is refused here, and the rest must name a commit this clone
     holds, which `git fetch` gives it. */
  let sha = null;
  if (!isRecord) {
    const named = values.deployed;
    const found = named.startsWith('-') ? null : git('rev-parse', '--verify', '--quiet', `${named}^{commit}`);
    if (found === null || found.status !== 0) {
      say(`${named} is not a commit this clone holds. Run git fetch, then name the sha the live Worker was built from.`);
      return 1;
    }
    sha = found.stdout.trim();
  }

  out(`migration rehearsal · ${input}${sha ? ` · live build ${sha.slice(0, 12)}` : ''}`);

  /* EVERYTHING GOES IN ONE FOLDER, AND THE FOLDER GOES WHATEVER HAPPENS: the opened night, the worktree, and the
     restored record, which the rehearsal migrates in place. Ctrl-C removes it too. */
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
    let file;
    if (isRecord) {
      file = join(scratch, 'record.brain');
      copyRecord(input, file);
      out('  copied     the record into a throwaway folder, removed when the rehearsal ends; the file named is not opened for writing');
    } else {
      // 1 · OPEN ───────────────────────────────────────────────────────────────────────────────────────────────────
      let bytes = readFileSync(input);
      if (isSealed) {
        const reader = await drillReader();
        if (reader === null) {
          say(
            "This checkout's restore-drill.mjs does not export its age reader (ageOpen, secretOf and keyOf) with its main() behind import.meta.main, so a sealed night cannot be opened here. Open it with age -d into a file outside this repository and name that instead.",
          );
          return 1;
        }
        const id = identitiesOf(values.identity, reader);
        if (id.refused) {
          say(id.refused);
          return 1;
        }
        const opened = reader.ageOpen(bytes, id.ids);
        if (opened.refused) {
          say(opened.refused);
          return 1;
        }
        bytes = opened.plain;
        out(`  opened     ${bytes.length} bytes of .brainl with the identity whose recipient is ${id.ids.map((k) => k.recipient).join(', ')}`);
      } else out('  opened     already: the night is not sealed, so it is read as it is');
      const night = join(scratch, 'night.brainl');
      writeFileSync(night, bytes, { mode: 0o600 });

      // 2 AND 3 · THE LIVE BUILD, AND ITS RESTORE ──────────────────────────────────────────────────────────────────
      const data = join(scratch, 'data');
      const stopped = restoreWithDeployed(sha, tree, night, data);
      if (stopped) {
        out(`FAIL ${input} · ${stopped}`);
        return 1;
      }
      file = join(data, SLUG, 'record.brain');
    }

    // 4 TO 8 ───────────────────────────────────────────────────────────────────────────────────────────────────────
    try {
      return await rehearse(file);
    } catch (e) {
      out(`FAIL ${input} · the rehearsal could not read the record: ${said(e)}`);
      return 1;
    }
  } finally {
    cleanup();
  }
}

if (import.meta.main) process.exitCode = await main();
