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
 * A copy written by a different set of migrations is refused, because its tables are not this record's tables.
 */

import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { Snapshot, Snapshots, Sql } from '@braindog/ports';

/** How many copies are kept (`53 §5.4`: thirty). A `before-restore` copy is never what makes one go. */
export const KEEP = 30;

const ID = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z-[a-z][a-z0-9-]*$/;

/* THE EXTENSION IS A CONSTANT BECAUSE THE ID IS THE NAME WITHOUT IT. A copy is a whole-record file,
   so it is a `.brain`; the id is read back by cutting the extension off, and a literal `-4` left over
   from `.dog` would have cut two characters off the middle of every id instead. */
const EXT = '.brain';

export type FileSnapshots = Snapshots & {
  /** The file behind one kept copy, or `null` when the id is not one. */
  path(id: string): string | null;
};

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
      .sort((a, b) => (a.at === b.at ? (a.id < b.id ? 1 : -1) : a.at < b.at ? 1 : -1));
  };

  const prune = async (keep: number): Promise<void> => {
    for (const old of (await list()).slice(keep)) rmSync(join(dir, `${old.id}.brain`), { force: true });
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
      if (label !== 'before-restore') await prune(KEEP);
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
          for (const name of tables) {
            const cols = sql
              .all<{ name: string }>(`SELECT name FROM pragma_table_info('${name}', 'main')`)
              .map((c) => `"${c.name}"`)
              .join(', ');
            sql.exec(`DELETE FROM main."${name}"`);
            sql.exec(`INSERT INTO main."${name}" (${cols}) SELECT ${cols} FROM snap."${name}"`);
          }
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
