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
import { ok } from '@braindog/ports';

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
    applied.push(m.version);
  }

  return {
    result: ok({ kernel: MIGRATIONS.length, format: FORMAT_VERSION, applied }),
    state: { applied: [...rows.map((r) => r.version), ...applied], refusal: null },
  };
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
