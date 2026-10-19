/**
 * The migration runner, the checksum, and the ledger.
 *
 * ONE IDEA: a schema that has been applied is never edited. A migration is identified by its
 * number, its bytes are hashed, and the hash is written beside it. If the code and the database
 * disagree about what version 1 said, the record REFUSES rather than repairing itself — because the
 * repair a runner would attempt is a guess about which of the two is right, made without the data.
 *
 * The refusal is module-level and it is sticky: every method that returns a `Result` short-circuits
 * on it until a deploy replaces the code. A record that half-works after a bad deploy is a record
 * that writes rows nobody can read back.
 */

import type { Clock, Refusal, Result, Sql } from '@braindog/ports';
import { mapDriverMessage, ok } from '@braindog/ports';

import { seedLadder } from './change-kind.ts';
import { rebuildKeys } from './entities.ts';
import { ulids } from './ids.ts';
import { rebuild } from './fts.ts';
import type { RegisterDecl } from './index.ts';

import kernel0001 from './migrations/0001_kernel.ts';
import session0002 from './migrations/0002_session.ts';
import packDisabled0003 from './migrations/0003_pack_disabled.ts';
import device0004 from './migrations/0004_device.ts';
import scheduleActions0005 from './migrations/0005_schedule_actions.ts';
import invitation0006 from './migrations/0006_invitation.ts';
import view0007 from './migrations/0007_view.ts';
import arrange0008 from './migrations/0008_arrange.ts';
import pref0009 from './migrations/0009_pref.ts';
import grantSealedUnder0010 from './migrations/0010_grant_sealed_under.ts';
import automationRun0011 from './migrations/0011_automation_run.ts';
import script0012 from './migrations/0012_script.ts';
import inferAsk0013 from './migrations/0013_infer_ask.ts';
import push0014 from './migrations/0014_push.ts';
import tokenReach0015 from './migrations/0015_token_reach.ts';
import slash0016 from './migrations/0016_slash.ts';
import automationWatch0017 from './migrations/0017_automation_watch.ts';
import jobs0018 from './migrations/0018_jobs.ts';
import memberWhere0019 from './migrations/0019_member_where.ts';
import quiet0020 from './migrations/0020_quiet.ts';
import draftedBy0021 from './migrations/0021_drafted_by.ts';
import sessionClient0022 from './migrations/0022_session_client.ts';
import entityKey0023 from './migrations/0023_entity_key.ts';
import look0024 from './migrations/0024_look.ts';
import trust0025 from './migrations/0025_trust.ts';
import sessionStarted0026 from './migrations/0026_session_started.ts';
import signs0027 from './migrations/0027_signs.ts';
import runs0028 from './migrations/0028_runs.ts';
import door0029 from './migrations/0029_door.ts';
import faults0030 from './migrations/0030_faults.ts';
import cause0031, { causeSteps } from './migrations/0031_cause.ts';
import tokenBuild0032 from './migrations/0032_token_build.ts';
import shapeReach0033 from './migrations/0033_shape_reach.ts';
import ruleStat0034 from './migrations/0034_rule_stat.ts';
import repeatMarks0035, { repeatMarks } from './migrations/0035_repeat_marks.ts';
import runsBefore0036 from './migrations/0036_runs_before.ts';
import causeAnswered0037 from './migrations/0037_cause_answered.ts';
import packWaiting0038 from './migrations/0038_pack_waiting.ts';
import entryMadeIndex0039 from './migrations/0039_entry_made_index.ts';
import entryPrivate0040 from './migrations/0040_entry_private.ts';

export type Migration = { version: number; slug: string; sql: string };

/** The index is the version, and a mis-numbered file is a defect, not a refusal. */
export const MIGRATIONS: readonly Migration[] = [
  { version: 1, slug: 'kernel', sql: kernel0001 },
  { version: 2, slug: 'session', sql: session0002 },
  { version: 3, slug: 'pack_disabled', sql: packDisabled0003 },
  { version: 4, slug: 'device', sql: device0004 },
  { version: 5, slug: 'schedule_actions', sql: scheduleActions0005 },
  { version: 6, slug: 'invitation', sql: invitation0006 },
  { version: 7, slug: 'view', sql: view0007 },
  { version: 8, slug: 'arrange', sql: arrange0008 },
  { version: 9, slug: 'pref', sql: pref0009 },
  { version: 10, slug: 'grant_sealed_under', sql: grantSealedUnder0010 },
  { version: 11, slug: 'automation_run', sql: automationRun0011 },
  { version: 12, slug: 'script', sql: script0012 },
  { version: 13, slug: 'infer_ask', sql: inferAsk0013 },
  { version: 14, slug: 'push', sql: push0014 },
  { version: 15, slug: 'token_reach', sql: tokenReach0015 },
  { version: 16, slug: 'slash', sql: slash0016 },
  { version: 17, slug: 'automation_watch', sql: automationWatch0017 },
  { version: 18, slug: 'jobs', sql: jobs0018 },
  { version: 19, slug: 'member_where', sql: memberWhere0019 },
  { version: 20, slug: 'quiet', sql: quiet0020 },
  { version: 21, slug: 'drafted_by', sql: draftedBy0021 },
  { version: 22, slug: 'session_client', sql: sessionClient0022 },
  { version: 23, slug: 'entity_key', sql: entityKey0023 },
  { version: 24, slug: 'look', sql: look0024 },
  { version: 25, slug: 'trust', sql: trust0025 },
  { version: 26, slug: 'session_started', sql: sessionStarted0026 },
  { version: 27, slug: 'signs', sql: signs0027 },
  { version: 28, slug: 'runs', sql: runs0028 },
  { version: 29, slug: 'door', sql: door0029 },
  { version: 30, slug: 'faults', sql: faults0030 },
  { version: 31, slug: 'cause', sql: cause0031 },
  { version: 32, slug: 'token_build', sql: tokenBuild0032 },
  { version: 33, slug: 'shape_reach', sql: shapeReach0033 },
  { version: 34, slug: 'rule_stat', sql: ruleStat0034 },
  { version: 35, slug: 'repeat_marks', sql: repeatMarks0035 },
  { version: 36, slug: 'runs_before', sql: runsBefore0036 },
  { version: 37, slug: 'cause_answered', sql: causeAnswered0037 },
  { version: 38, slug: 'pack_waiting', sql: packWaiting0038 },
  { version: 39, slug: 'entry_made_index', sql: entryMadeIndex0039 },
  { version: 40, slug: 'entry_private', sql: entryPrivate0040 },
];

/**
 * `PRAGMA user_version`, the `.brain` format revision of `30-BLUEPRINT` §11. Migration 2 adds a row and
 * its indexes and no table or column. Migration 3 adds one nullable column, which an older file
 * imports without (the positional read in `brainl.ts` takes fewer columns), so the format is still 1.
 * Migration 4 rebuilds `device_grant`, a `local` table no file carries, so it is still 1. Migration 5
 * rebuilds `schedule` with two more kinds, and no file carries a schedule row either.
 * Migration 6 adds `invitation`, a `local` table no file carries, so it is still 1.
 * Migration 7 adds `view`, `local` for the same reason and at the same price: a saved view does not
 * travel in an export, and carrying one means a travelling table and a format revision.
 * Migration 8 rebuilds `suggestion` with three more bodies; an older file carries only the four it still takes.
 * Migration 9 adds `pref` and `pack_removed`, both `local`, so no file carries either.
 * Migration 10 adds one `NOT NULL DEFAULT` column to `grant`, which an older file imports without and reads as
 * `'record'` — which is what those rows are — so the format is still 1.
 * Migration 13 rebuilds `outbox` with one more kind; an older file carries only the ten it still takes.
 * Migration 14 adds `push_sub`, `local`, so no file carries it.
 * Migration 15 adds one nullable column to `token`, which is `local`, so no file carries it either.
 * Migration 16 renames the assistant to Slash in the values of rows and changes no table or column.
 * Migration 17 adds `automation_watch`, `local`, so no file carries it, and two indexes, which no file carries either.
 * Migration 18 rebuilds `declaration` with one more kind, keeping every column, and `job` with no CHECK on its kind and
 * two new nullable columns; an older file carries only the kinds it still takes, and `job` is `local`, so no file carries
 * it.
 * Migration 19 adds one nullable column to `member`, which an older file imports without and reads as NULL, every row
 * of the list, which is what that file's grants meant, so the format is still 1.
 * Migration 20 adds one nullable column to `record`, which an older file imports without and reads as NULL, the quiet
 * hours every record kept before it, so the format is still 1.
 * Migration 21 adds one nullable column to `suggestion`, which an older file imports without and reads as NULL, a
 * question whose drafter nobody kept, so the format is still 1.
 * Migration 22 adds a row, the next version of migration 2's `register.session`, and no table, column or index; an
 * older file carries migration 2's body, which an import supersedes the way the migration does, so the format is still 1.
 * Migration 23 adds `entity_key` and `entity_mention`, both `local` and rebuilt from the rows an import brings, and
 * rebuilds `outbox` with one more kind; an older file carries only the kinds it still takes, so the format is still 1.
 * Migration 24 rebuilds `declaration` with one more kind, `look`, for the same reason, so the format is still 1.
 * Migration 25 rebuilds `suggestion` with one nullable column last, which an older file imports without and reads as NULL,
 * and `token` with three, adds two indexes and `ladder` and `undone`, both `local`, so the format is still 1.
 * Migration 26 adds a row, the next version of `register.session`, and gives runs a field, so the format is still 1.
 * Migration 27 adds `sign_reading`, `local`, so no file carries it, and the format is still 1.
 * Migration 28 adds a row, the next version of `register.session` with nine fields an older file's runs import without,
 * and no table, column or index, so the format is still 1.
 * Migration 29 adds `door_mark`, how each run met the agent door, `local`, so no file carries it.
 * Migration 30 adds `fault`, what an operator must fix, `local` as the identity keys are, so no file carries it.
 * Migration 31 adds one nullable column, `cause`, to `suggestion` and to `decision`, which an older file imports
 * without and reads as NULL, a question nobody gave a cause, with indexes and a trigger no file carries, so the format
 * is still 1.
 * Migration 32 rebuilds `token` with `last_build` and `last_tool_at`, `local` as every key is, so no file carries it.
 * Migration 33 rebuilds `device_grant` with an eighth reach, `shape`, `local` for migration 4's reason, so no file carries it.
 * Migration 34 adds `rule_stat`, `local` as `fault` is, so no file carries it.
 * Migration 35 adds no table and no column: it writes `match` lines in history, which every file already carries.
 * Migration 36 adds no table and no column: it takes `next` off the runs never heard from here and not in `handoff`,
 * in their fields, which an older file's runs import with and a newer reader reads without, so the format is still 1.
 * Migration 37 adds `suggestion_cause_closed`, an index no file carries, so the format is still 1.
 * Migration 38 rebuilds `pack` with one more nullable column, which an older file imports without and reads as NULL,
 * an add-on with nothing waiting, which is what every add-on was before `when`, so the format is still 1.
 * Migration 39 adds `entry_made`, an index no file carries, so the format is still 1.
 * Migration 40 adds `entry_private`, `local` as `device_grant` is, so no file carries it and the format is still 1.
 */
export const FORMAT_VERSION = 1 as const;

/** `DOG!` — the four bytes at offset 68 of every `.brain` file, and what `file(1)` reads. */
export const APPLICATION_ID = 0x444f4721;
export const KERNEL_MIGRATION = MIGRATIONS.length;

/**
 * The bytes a checksum is taken over: CRLF to LF, then trailing spaces and tabs stripped per line.
 *
 * `34-GRAMMARS` §5's rule, and it exists because the alternative is a schema mismatch every time
 * somebody's editor trims whitespace or a file crosses an operating system. What must not vary is
 * the SQL; what must be allowed to vary is how it was stored.
 */
export const canon = (sql: string): string =>
  sql.replace(/\r\n/g, '\n').split('\n').map((line) => line.replace(/[ \t]+$/, '')).join('\n');

const HEX = Array.from({ length: 256 }, (_, n) => n.toString(16).padStart(2, '0'));

export async function checksum(sql: string): Promise<string> {
  const bytes = new TextEncoder().encode(canon(sql));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  let out = '';
  for (const byte of new Uint8Array(digest)) out += HEX[byte];
  return out;
}

/**
 * A migration's number IS its position, and a file that disagrees is a defect rather than a refusal.
 *
 * The distinction matters: a refusal is for a RECORD that disagrees with the code, and it is
 * something an operator can act on. A migration list that disagrees with itself is the code being
 * wrong, and nobody should be able to deploy past it.
 */
export function assertNumbering(migrations: readonly Migration[]): void {
  for (const [i, m] of migrations.entries())
    if (m.version !== i + 1) throw new TypeError(`migration ${m.slug} is numbered ${m.version} and sits at ${i + 1}`);
}

export type SchemaState = { applied: number[]; refusal: Refusal | null };

const LEDGER =
  'CREATE TABLE IF NOT EXISTS migration (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL, checksum TEXT NOT NULL)';

const FORMAT_BUMP = /^-- format-bump (\d+)$/m;

/** `2026-09-05T12:34:56.789Z`, which is the only instant format the record stores. */
export const instant = (ms: number): string => new Date(ms).toISOString();

/**
 * The refusal a SQLite without `fts5` or `json` opens as: `30 §13`'s boot-probe block, in one sentence.
 *
 * `RECORD_UNAVAILABLE` AND NOT THE ADAPTER'S `NO_SUCH_MODULE`, because this is what a caller reads and `30 §6` maps it
 * to 503: the request was fine and a deploy fixes it. Measured before this existed: an adapter refusing `USING fts5`
 * made `applyMigrations` throw out of migration 1, so `openRecord` threw and the host answered nothing with a code in
 * it.
 *
 * THE VERSION IS READ HERE, not remembered, because the operator's next move is to find out which SQLite they are
 * running, and `sqlite_version()` answers on every build including the ones this refuses. A throw from it is not
 * caught: a SQLite that cannot say its own version is not a missing module.
 */
const unhostable = (sql: Sql, module: 'fts5' | 'json'): Refusal => ({
  code: 'RECORD_UNAVAILABLE',
  at: `sqlite.${module}`,
  fix: `SQLite ${String(sql.one<{ v: string }>('SELECT sqlite_version() AS v')?.v)} has no ${module}, which a .brain file cannot open without; run Node 24.13 or later, which bundles its own SQLite, and not Bun, which loads Apple's on macOS.`,
});

/**
 * Whether a throw means the module is missing, and nothing wider.
 *
 * `fts5` GOES THROUGH `mapDriverMessage`, the one table both adapters share (`37 §5.8`), so a guarded port's
 * `SqlError` and a bare driver's `Error` read the same. `json` has no row there, because SQLite says `no such
 * function: json` and that sentence is not one of the thirteen. A full disk or a locked file is a real failure and
 * keeps its own sentence, which is the line `measureCaps` draws for the same reason.
 */
const lacks = (e: unknown, module: 'fts5' | 'json'): boolean => {
  const message = e instanceof Error ? e.message : String(e);
  return module === 'fts5' ? mapDriverMessage(message) === 'NO_SUCH_MODULE' : message.includes('no such function: json');
};

/**
 * Whether the probe's read failed because the index ITSELF is damaged, on a SQLite that has FTS5.
 *
 * THE TWO SENTENCES ARE THE TWO MEASURED, and nothing wider: a file with `entry_fts_config` dropped says
 * `vtable constructor failed: entry_fts`, and one whose `entry_fts` schema row was removed says
 * `no such table: entry_fts`. A guarded port keeps the driver's sentence verbatim, so both read the same through it.
 * `disk I/O error` names no table and is the file's failure, not the index's, so it still throws.
 */
const damagedIndex = (e: unknown): boolean =>
  /(?:vtable constructor failed|no such table): entry_fts$/.test(e instanceof Error ? e.message : String(e));

/** Migration 1's `CREATE VIRTUAL TABLE entry_fts`, as it ran, so a rebuilt index has the DDL a new file gets. */
const INDEX_DDL = (): string => {
  const ddl = statements(kernel0001).find((s) => s.startsWith('CREATE VIRTUAL TABLE entry_fts '));
  if (!ddl) throw new TypeError('migration 1 no longer creates entry_fts, and the index cannot be rebuilt without it');
  return ddl;
};

/** FTS5's five shadow tables for a contentful table, which is what `entry_fts` is. */
const SHADOWS = ['data', 'idx', 'content', 'docsize', 'config'] as const;

/** The index and its five shadows, the six names a whole index has in `sqlite_master`. */
const INDEX_TABLES = ['entry_fts', ...SHADOWS.map((s) => `entry_fts_${s}`)];

/**
 * Whether every table the index is made of is in the schema: the half of the damage probe the `LIMIT 0` read cannot see.
 *
 * FOUR OF SIX DAMAGES GOT PAST THE READ (measured). Compiling `SELECT rowid FROM entry_fts` connects to the table,
 * which reads `entry_fts_config` and no other shadow, so a file with `data`, `idx`, `content` or `docsize` dropped
 * opened without a rebuild, and then every search and every write to a searchable list threw
 * (`database disk image is malformed`, or `no such table: main.entry_fts_content`). A missing table is what all four
 * are, and the schema says so without touching the index.
 *
 * WHAT IT COSTS ON EVERY OPEN: one read of `sqlite_master`, which has no index on `name` and so is a scan of the
 * schema, 103 rows on a record with one list installed, whatever the number of rows. Measured over the test port on a
 * file record holding 2,000 rows, 10,000 probes, statement prepared each time as the port does: 15 to 17 microseconds
 * each, against 5 for the `LIMIT 0` read beside it. FTS5's own `integrity-check` was the other candidate and it reads
 * every line of the index: 1.0 to 1.2 milliseconds on the same file, growing with the record. Not taken.
 */
const indexWhole = (sql: Sql): boolean =>
  sql.one<{ n: number }>(
    `SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN (${INDEX_TABLES.map(() => '?').join(', ')})`,
    ...INDEX_TABLES,
  )?.n === INDEX_TABLES.length;

/**
 * Each live list's searchable fields, title and series flag, read from the declarations: what `rebuild` projects by.
 *
 * THE REGISTER-LEVEL `search: [field, ...]` IS FOLDED INTO EACH FIELD'S OWN FLAG, the one rule `makeKernel`'s `listsOf`
 * applies (`index.ts`, "TWO SPELLINGS OF ONE FLAG"). It is repeated here because `listsOf` lives inside `makeKernel`,
 * which runs after this does, and without it a list declared the documented way rebuilds with nothing of it indexed but
 * its title. `boot-damaged-index.test.ts` declares one that way, so a copy that drifts from `listsOf` fails there.
 */
function searchedLists(sql: Sql): Map<string, { fields: RegisterDecl['fields']; title?: string; series: boolean }> {
  const lists = new Map<string, { fields: RegisterDecl['fields']; title?: string; series: boolean }>();
  for (const { body } of sql.all<{ body: string }>(
    "SELECT body FROM declaration WHERE kind = 'register' AND superseded_at IS NULL AND retired = 0",
  )) {
    const decl = JSON.parse(body) as RegisterDecl & { search?: unknown };
    const named = Array.isArray(decl.search) ? (decl.search as string[]) : null;
    const fields = named ? decl.fields.map((f) => (named.includes(f.id) ? { ...f, search: true } : f)) : decl.fields;
    lists.set(decl.id, { fields, ...(typeof decl.title === 'string' ? { title: decl.title } : {}), series: Boolean(decl.series) });
  }
  return lists;
}

/**
 * Drop whatever is left of a damaged `entry_fts` and build it again, projected from the rows. One transaction.
 *
 * PROJECTED FROM `entry`, WHICH IS THE RECORD, and not refilled from `entry_fts_content`, the index's own copy of each
 * line. The refill was what 151295ca shipped, and a file that lost the content table opened with an empty index: every
 * row read and exported and none was found by search until an import (measured). The index is derived, so the rows are
 * the only copy worth rebuilding from, and `rebuild` is the projection an import runs. No row is written: the
 * transaction touches `entry_fts` and its shadows and nothing else.
 *
 * THE CONFIG ROW IS PUT BACK FIRST, because FTS5 connects to a table before it drops one, and with the config table
 * gone `DROP TABLE entry_fts` throws the same `vtable constructor failed` the probe did (measured). Version 4 is what
 * SQLite 3.50.4 writes there; the table is dropped one statement later, so it only has to connect.
 */
function rebuildIndex(sql: Sql): void {
  sql.transactionSync(() => {
    sql.exec('CREATE TABLE IF NOT EXISTS entry_fts_config (k PRIMARY KEY, v) WITHOUT ROWID');
    sql.exec("INSERT OR REPLACE INTO entry_fts_config (k, v) VALUES ('version', 4)");
    sql.exec('DROP TABLE IF EXISTS entry_fts');
    /* A SCHEMA ROW REMOVED LEAVES ITS FIVE SHADOWS BEHIND as ordinary tables, and `CREATE VIRTUAL TABLE` refuses a name
       that is taken, so they go too. After the drop above they are already gone for the other damages. */
    for (const shadow of SHADOWS) sql.exec(`DROP TABLE IF EXISTS entry_fts_${shadow}`);
    sql.exec(INDEX_DDL());
    const lists = searchedLists(sql);
    rebuild(sql, (register) => lists.get(register), (register) => lists.get(register)?.series ?? false);
  });
}

/**
 * Apply what has not been applied, and refuse what disagrees.
 *
 * The two refusals are different failures and the fix is different for each, so they are two codes:
 * SCHEMA_NEWER is a database written by code newer than this deploy — roll forward. SCHEMA_MISMATCH
 * is a migration whose text changed after it was applied — put it back, and write a new one.
 */
export async function applyMigrations(
  sql: Sql,
  clock: Clock,
): Promise<{ result: Result<{ kernel: number; format: number; applied: number[] }>; state: SchemaState }> {
  assertNumbering(MIGRATIONS);

  sql.exec(LEDGER);
  const rows = sql.all<{ version: number; checksum: string }>('SELECT version, checksum FROM migration ORDER BY version');
  const sums = await Promise.all(MIGRATIONS.map((m) => checksum(m.sql)));

  /* THE BOOT PROBE, HALF ONE: `json` before anything is applied, because every register's fields are a JSON column
     and a record that cannot read one cannot read anything. It cannot read compile options instead: the Durable
     Object answers `PRAGMA compile_options` with `not authorized` (`37 §5.8`, measured). */
  const unavailable = (refusal: Refusal, applied: number[]) => ({
    result: { ok: false as const, refusal },
    state: { applied: [...rows.map((r) => r.version), ...applied], refusal },
  });
  try {
    sql.one("SELECT json('{}') AS v");
  } catch (e) {
    if (!lacks(e, 'json')) throw e;
    return unavailable(unhostable(sql, 'json'), []);
  }

  for (const row of rows) {
    const at = MIGRATIONS.find((m) => m.version === row.version);
    if (!at || row.version > MIGRATIONS.length) {
      const refusal: Refusal = {
        code: 'SCHEMA_NEWER',
        /* THE LEDGER IS A LIST AND THIS IS ABOUT ONE ROW OF IT. `40 §6`'s import row specifies
           `migration[<n>]` and nothing produced it, so the version was only ever in the sentence.
           The operator's next move is to find the build that has this migration, and the index is
           what they look it up by. */
        at: `migration[${row.version}]`,
        fix: `This record was written by a build that knows migration ${row.version}; this one stops at ${MIGRATIONS.length}. Deploy the newer build.`,
      };
      return { result: { ok: false, refusal }, state: { applied: rows.map((r) => r.version), refusal } };
    }
    if (sums[row.version - 1] !== row.checksum) {
      const refusal: Refusal = {
        code: 'SCHEMA_MISMATCH',
        /* Same address space as the arm above: one row of the ledger, named by its version. This is
           the one an operator acts on with an editor, so pointing at the migration rather than at
           the record is the difference between one file to read and ten. */
        at: `migration[${row.version}]`,
        fix: `Migration ${row.version} (${at.slug}) is not the text that was applied to this record. Restore it and add a new migration instead.`,
      };
      return { result: { ok: false, refusal }, state: { applied: rows.map((r) => r.version), refusal } };
    }
  }

  const highest = rows.length ? Math.max(...rows.map((r) => r.version)) : 0;
  const applied: number[] = [];

  for (const [i, m] of MIGRATIONS.entries()) {
    if (m.version <= highest) continue;
    /* A NEW FILE MEETS A MISSING `fts5` HERE, at migration 1's `CREATE VIRTUAL TABLE entry_fts`, and not at the read
       below. The migration's transaction has already rolled back when this catches it, so the refusal leaves no half
       of migration 1 behind, and the ones applied before it stay applied and are reported. */
    try {
      applyOne(m, i);
    } catch (e) {
      if (!lacks(e, 'fts5')) throw e;
      return unavailable(unhostable(sql, 'fts5'), applied);
    }
    applied.push(m.version);
    /* THE IDENTITIES OF THE ROWS ALREADY HERE, once, in the run that made their table. A key is normalised by code that
       SQL cannot run (Gmail's dots, GitHub's private address), so the backfill is this and not the migration's text. */
    if (m.slug === 'entity_key') sql.transactionSync(() => rebuildKeys(sql, instant(clock.now())));
    /* AND THE RUNGS EXISTING WRITE TOKENS KEEP, once, in the run that made the ladder: the kinds each used in the last
       thirty days and that are not on the floor stay at Do and tell (`seedLadder`). A kind is worked out by code too. */
    if (m.slug === 'trust') sql.transactionSync(() => seedLadder(sql, clock.now()));
    /* AND THE DECISION'S TRIGGER AND EACH OPEN QUESTION'S CAUSE, once, in the run that made the column: a derived cause
       is a hash code works out, a merge writes a line whose id is minted, and a trigger's body holds a `;` the script
       runner would cut (`causeSteps`). */
    if (m.slug === 'cause') sql.transactionSync(() => causeSteps(sql, ulids(() => clock.now()), instant(clock.now())));
    /* AND THE REPEATS HELD BEFORE A SKIP KEPT ITS MARK, once, in the run that brings this: each line's id is minted and the
       old reason is read by a pattern, so it is code and not the migration's text (`repeatMarks`). */
    if (m.slug === 'repeat_marks') sql.transactionSync(() => repeatMarks(sql, ulids(() => clock.now()), instant(clock.now())));
  }

  /* HALF TWO: a read of `entry_fts` that returns nothing, once the schema is whole. A file whose migrations were
     applied on another machine is not re-applied here, so without this read it opened clean on a SQLite that cannot
     search it, answered every method, and failed at the first search with a driver sentence and no code (measured,
     `boot-probe.test.ts`). `LIMIT 0` compiles the statement, which is where the module is looked up, and reads no row.

     WHAT A SELF-HOSTER WITHOUT FTS5 NOW GETS, Bun on macOS loading Apple's SQLite being the one `30 §13` names: the
     sticky `RECORD_UNAVAILABLE` at `sqlite.fts5` from every method that answers a `Result`, `export` among them, with
     the fix naming their SQLite. That is `30 §13`'s intent, no degraded mode. Before daef0898 the same file opened, a
     row read by id, and `export` threw `no such module: fts5` with no code (measured); a row by id still reads now,
     because `get` does not consult the refusal, so what changed is that the export says why it will not run.

     AND A DAMAGED INDEX IS NOT A MISSING MODULE, so it is rebuilt here and the record opens. This read rethrew every
     other failure, so a file with `entry_fts_config` dropped, or with the table's schema row removed, threw out of
     `openRecord` and no method answered, where every row was intact and the index is derived from them. The read sees
     only those two damages; `indexWhole` sees the other four, and `boot-damaged-index.test.ts` has all six. */
  let damaged = false;
  try {
    sql.all('SELECT rowid FROM entry_fts LIMIT 0');
  } catch (e) {
    if (lacks(e, 'fts5')) return unavailable(unhostable(sql, 'fts5'), applied);
    if (!damagedIndex(e)) throw e;
    damaged = true;
  }
  if (damaged || !indexWhole(sql)) rebuildIndex(sql);

  return {
    result: ok({ kernel: MIGRATIONS.length, format: FORMAT_VERSION, applied }),
    state: { applied: [...rows.map((r) => r.version), ...applied], refusal: null },
  };

  /** One migration and its ledger row, in one transaction: the body the loop above catches around. */
  function applyOne(m: Migration, i: number): void {
    sql.transactionSync(() => {
      execScript(sql, m.sql);
      sql.exec('INSERT INTO migration (version, applied_at, checksum) VALUES (?, ?, ?)', m.version, instant(clock.now()), sums[i]!);

      const bump = FORMAT_BUMP.exec(m.sql);
      if (bump) {
        const n = Number(bump[1]);
        /* Best effort: a driver may not expose PRAGMA, and the format also lives in `dog_meta` and
           on the record row, which are the two an export actually reads. */
        try {
          sql.exec(`PRAGMA user_version = ${n}`);
          /* `0x444F4721`, WHICH IS THE BYTES `DOG!` — written in hex because that is the only form
             in which it can be checked by reading it. `03 §2`'s own table gives the hex and a
             DECIMAL beside it that disagrees: 1145193761 is `0x44424521`, the bytes `DBE!`, and it
             is the decimal three documents copied. The hex is the one a magic number is chosen for
             and the one `file(1)` prints, so the hex wins, and writing it as hex is what stops the
             next transcription being wrong the same way. */
          if (m.version === 1) sql.exec(`PRAGMA application_id = ${APPLICATION_ID}`);
        } catch {
          /* the two rows below are the ones that travel */
        }
        sql.exec('UPDATE record SET format_ver = ?', n);
        sql.exec(
          "INSERT INTO dog_meta (key, value) VALUES ('format', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
          String(n),
        );
      }
    });
  }
}

/**
 * Run a script of statements through a port that binds one statement at a time.
 *
 * `Sql.exec` takes one statement, because a port that took a script could not bind parameters. The
 * cutting is for DDL THIS PACKAGE SHIPS and for nothing else: a statement from anywhere else is
 * bound, never assembled, and never split.
 */
export function execScript(sql: Sql, script: string): void {
  for (const statement of statements(script)) sql.exec(statement);
}

/**
 * A script, cut into statements.
 *
 * IT TRACKS STRING LITERALS, which is not gold-plating: the DDL's own comments contain semicolons
 * ("31 rows; 25 travel") and its inserts contain quoted values, so a split on `;` alone hands the
 * driver half a statement — and the error that comes back is "incomplete input", which names
 * neither the statement nor the reason. Ten lines here, or an afternoon there.
 */
export function statements(script: string): string[] {
  const text = canon(script);
  let out = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      out += c;
      if (c === "'") quoted = false;
      continue;
    }
    if (c === "'") {
      quoted = true;
      out += c;
      continue;
    }
    // `--` to the end of the line, outside a literal, is a comment and not part of the statement.
    if (c === '-' && text[i + 1] === '-') {
      const end = text.indexOf('\n', i);
      if (end === -1) break;
      i = end - 1;
      continue;
    }
    out += c;
  }
  return out
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The sticky schema refusal, WHOLE. It was rebuilt from `code` and `fix` alone, so `applyMigrations`' `at:
 * migration[<n>]` never reached a caller: `kernel.import` and every other method answer through here, and the import
 * runner's `schema-mismatch` and `schema-newer` fixtures could not see the address `migrate.test.ts` checks.
 */
export const schemaRefusal = (state: SchemaState): Result<never> | null =>
  state.refusal ? { ok: false, refusal: state.refusal } : null;
