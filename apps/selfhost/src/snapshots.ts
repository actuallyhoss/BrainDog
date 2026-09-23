/**
 * The self-host's copies of its record: `33 §1` port 9 over files beside the record.
 *
 * `VACUUM INTO`, AND THE WHOLE FILE. `53 §5.4`: a self-host snapshot is the live file, the six `local` tables included,
 * because it is a backup of the instance and not an export. It is a consistent copy of a database in WAL mode without
 * stopping writes, and it is a file `sqlite3` opens with nothing else installed.
 *
 * AN ID IS A TIME AND A LABEL, `2026-09-16T12-05-01Z-now`, so the list sorts by name and a path is never built from
 * anything a caller typed that does not match that shape.
 *
 * RESTORE COPIES TABLE BY TABLE INTO THE OPEN FILE, in one transaction, rather than swapping files under a process
 * that holds the old one open. The search index is not copied: the record rebuilds it from the rows it now holds.
 * A copy written by a different set of migrations is refused, because its tables are not this record's tables. A
 * credential the live record has ended since the copy stays ended (`CARRIED`).
 */

import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { Param, Snapshot, Snapshots, Sql } from '@braindog/ports';

/**
 * How many copies are kept (`53 §5.4`: thirty), of each kind: thirty nightly copies, and apart from them thirty a person
 * took. A `before-restore` copy is never what makes one go.
 *
 * TWO KINDS, KEPT APART. The nightly copies shared the thirty with copies taken by hand, so a month of nights pruned a copy
 * somebody had taken on purpose before a big change. A nightly copy now only ever pushes out an older nightly copy.
 */
export const KEEP = 30;

/** A copy the host took on its clock, `...Z-nightly` or `...Z-nightly-2`, as against one a person took. */
export const isNightly = (id: string): boolean => /Z-nightly(?:-\d+)?$/u.test(id);

const ID = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z-[a-z][a-z0-9-]*$/;

/* THE EXTENSION IS A CONSTANT BECAUSE THE ID IS THE NAME WITHOUT IT. A copy is a whole-record file,
   so it is a `.brain`; the id is read back by cutting the extension off, and a literal `-4` left over
   from `.dog` would have cut two characters off the middle of every id instead. */
const EXT = '.brain';

export type FileSnapshots = Snapshots & {
  /** The file behind one kept copy, or `null` when the id is not one. */
  path(id: string): string | null;
  /** Keep the newest `keep` of the copies `which` picks (all of them when it is left out), and delete the rest of those. */
  prune(keep: number, which?: (id: string) => boolean): Promise<void>;
};

/* COPIES TAKEN IN ONE SECOND ARE NUMBERED, `-now`, `-now-2` … `-now-10`, AND THEY SORT AS NUMBERS. By name,
   `-now-10` came before `-now-2` and after `-now-9`, so pruning could delete a newer copy and keep an older one. */
const NATURAL = new Intl.Collator('en', { numeric: true });

/**
 * The credentials a restore must not bring back: each table, the rows of it the live record has ended, and the columns
 * that say so, written over the copy's row with the same id when the copy still has it open.
 *
 * MEASURED BEFORE THIS (`test/restore-revoked.test.ts`, audit fifty-seven finding 3): every table was copied as the copy
 * held it, so a token revoked after the copy answered `/api/boot` 200 again once the copy was restored, an operation
 * grant already spent exported a second time, and a withdrawn invitation link opened again. Nothing said so.
 *
 * ONLY WHAT ENDS AND NEVER STARTS AGAIN. Revoking a token, spending or denying a device grant, and withdrawing or using
 * an invitation have no inverse in the record, so the live row is the later truth whatever the copy says. A row the copy
 * does not have is left out, because the credential was made after the copy and goes with everything else made since.
 * A person's suspension is not here: it can be lifted, so it is part of the record a restore puts back.
 */
const CARRIED: readonly { table: string; read: string; columns: readonly string[]; write: string }[] = [
  {
    table: 'token',
    read: 'SELECT id, revoked_at FROM main.token WHERE revoked_at IS NOT NULL',
    columns: ['revoked_at'],
    write: 'UPDATE main.token SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL',
  },
  {
    table: 'device_grant',
    read: "SELECT id, status, expires, last_used FROM main.device_grant WHERE status IN ('expired', 'denied', 'revoked')",
    columns: ['status', 'expires', 'last_used'],
    write: "UPDATE main.device_grant SET status = ?, expires = ?, last_used = ? WHERE id = ? AND status IN ('pending', 'approved', 'active')",
  },
  {
    table: 'invitation',
    read: 'SELECT id, accepted_at, accepted_by, revoked_at FROM main.invitation WHERE accepted_at IS NOT NULL OR revoked_at IS NOT NULL',
    columns: ['accepted_at', 'accepted_by', 'revoked_at'],
    write: 'UPDATE main.invitation SET accepted_at = ?, accepted_by = ?, revoked_at = ? WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL',
  },
];

const atOf = (id: string): string => {
  const m = ID.exec(id);
  return m ? `${m[1]}T${m[2]}:${m[3]}:${m[4]}.000Z` : '';
};

export function fileSnapshots(sql: Sql, file: string, now: () => number): FileSnapshots {
  const dir = join(dirname(file), 'snapshots');

  const path = (id: string): string | null => {
    if (!ID.test(id)) return null;
    const p = join(dir, `${id}.brain`);
    return existsSync(p) ? p : null;
  };

  const list = async (): Promise<Snapshot[]> => {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((name) => name.endsWith(EXT) && ID.test(name.slice(0, -EXT.length)))
      .map((name) => ({ id: name.slice(0, -EXT.length), at: atOf(name.slice(0, -EXT.length)), bytes: statSync(join(dir, name)).size }))
      .sort((a, b) => (a.at === b.at ? NATURAL.compare(b.id, a.id) : a.at < b.at ? 1 : -1));
  };

  const prune = async (keep: number, which: (id: string) => boolean = () => true): Promise<void> => {
    for (const old of (await list()).filter((c) => which(c.id)).slice(keep)) rmSync(join(dir, `${old.id}.brain`), { force: true });
  };

  return {
    path,
    list,
    prune,

    async take(label: string): Promise<Snapshot> {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const stamp = `${new Date(now()).toISOString().slice(0, 19).replace(/:/g, '-')}Z`;
      let id = `${stamp}-${label}`;
      for (let n = 2; existsSync(join(dir, `${id}.brain`)); n++) id = `${stamp}-${label}-${n}`;
      const target = join(dir, `${id}.brain`);
      sql.exec('VACUUM INTO ?', target);
      /* 0600, like the record it copies: every token hash and every sealed grant is in it. */
      try {
        chmodSync(target, 0o600);
      } catch {
        /* Advisory on Windows. */
      }
      /* A COPY TAKEN JUST BEFORE A RESTORE PRUNES NOTHING, so the copy being restored cannot be the one that goes. */
      if (label !== 'before-restore') await prune(KEEP, isNightly(id) ? isNightly : (other) => !isNightly(other));
      return { id, at: atOf(id), bytes: statSync(target).size };
    },

    async restore(id: string): Promise<void> {
      const from = path(id);
      if (!from) throw new Error(`${id} is not one of the copies this record keeps.`);
      sql.exec('ATTACH DATABASE ? AS snap', from);
      try {
        const versions = (schema: string): string => {
          try {
            return JSON.stringify(sql.all(`SELECT version, checksum FROM ${schema}.migration ORDER BY version`));
          } catch {
            return '';
          }
        };
        const mine = versions('main');
        if (!mine || versions('snap') !== mine)
          throw new Error(`${id} was written by a different version of this record, so it cannot be put back in place. Restore it into a fresh directory with braindog import.`);

        const tables = sql
          .all<{ name: string }>(
            "SELECT name FROM main.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'entry_fts%' AND sql NOT LIKE 'CREATE VIRTUAL%' AND name <> 'migration' ORDER BY name",
          )
          .map((t) => t.name);
        sql.exec('BEGIN IMMEDIATE');
        try {
          /* READ BEFORE THE TABLES ARE EMPTIED, in the same transaction, so nothing ends a credential between the read
             and the copy and is then lost. */
          const ended = CARRIED.filter((c) => tables.includes(c.table)).map((c) => ({ c, rows: sql.all<Record<string, Param>>(c.read) }));
          for (const name of tables) {
            const cols = sql
              .all<{ name: string }>(`SELECT name FROM pragma_table_info('${name}', 'main')`)
              .map((c) => `"${c.name}"`)
              .join(', ');
            sql.exec(`DELETE FROM main."${name}"`);
            sql.exec(`INSERT INTO main."${name}" (${cols}) SELECT ${cols} FROM snap."${name}"`);
          }
          for (const { c, rows } of ended) for (const row of rows) sql.exec(c.write, ...c.columns.map((col) => row[col] ?? null), row.id ?? null);
          sql.exec('COMMIT');
        } catch (e) {
          sql.exec('ROLLBACK');
          throw new Error(`${id} could not be put back, and the record is as it was: ${e instanceof Error ? e.message : String(e)}`);
        }
      } finally {
        sql.exec('DETACH DATABASE snap');
      }
    },
  };
}
