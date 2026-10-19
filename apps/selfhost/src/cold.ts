/**
 * `braindog backup <folder>` and `braindog restore <backup folder>`: the data directory as plain files, for a machine
 * that is moving or a disk that is failing. The nightly copy in `backup.ts` stays on the same disk; this one is meant to
 * be carried off it.
 *
 * `VACUUM INTO` AND NOT A FILE COPY, so a running server's write-ahead log cannot leave a copy that reads as empty.
 * THE KEY FILE GOES IN TOO, because the record's sealed keys open only under it, so the folder is as secret as the key.
 */

import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { openSqlite } from './server.ts';

const RECORD_NAMES = ['record.brain', 'record.dog'];
/** Kept on the same disk by the host itself; not part of a carried-off copy. */
const SKIP = new Set(['snapshots', 'directory-snapshots']);

function vacuum(from: string, to: string): void {
  const sql = openSqlite(from);
  try {
    sql.exec('VACUUM INTO ?', to);
  } finally {
    sql.close();
  }
  chmodSync(to, 0o600);
}

/** Writes `<dest>/braindog-<time>/` and answers its path and what went into it. Throws a sentence on a data directory with nothing in it. */
export function backupData(o: { data: string; kekFile: string; dest: string; now: number }): { out: string; said: string[] } {
  const dirFile = join(o.data, 'directory.sqlite');
  if (!existsSync(dirFile)) throw new Error(`There is nothing to back up: no directory.sqlite in ${o.data}.`);
  const stamp = new Date(o.now).toISOString().replace(/[-:]/gu, '').replace(/\.\d+Z$/u, 'Z');
  const out = join(o.dest, `braindog-${stamp}`);
  if (existsSync(out)) throw new Error(`${out} already exists. Wait a second or name another folder.`);
  mkdirSync(out, { mode: 0o700, recursive: true });
  const said: string[] = [];

  vacuum(dirFile, join(out, 'directory.sqlite'));
  said.push('directory.sqlite');
  for (const name of readdirSync(o.data)) {
    const dir = join(o.data, name);
    if (SKIP.has(name) || !statSync(dir).isDirectory()) continue;
    const record = RECORD_NAMES.find((f) => existsSync(join(dir, f)));
    if (!record) continue;
    mkdirSync(join(out, name), { mode: 0o700, recursive: true });
    vacuum(join(dir, record), join(out, name, record));
    if (existsSync(join(dir, 'inbound.token'))) copyFileSync(join(dir, 'inbound.token'), join(out, name, 'inbound.token'));
    if (existsSync(join(dir, 'blobs'))) cpSync(join(dir, 'blobs'), join(out, name, 'blobs'), { recursive: true });
    said.push(`${name}/${record}`);
  }
  if (existsSync(o.kekFile)) {
    copyFileSync(o.kekFile, join(out, 'kek'));
    chmodSync(join(out, 'kek'), 0o600);
    said.push('kek');
  }
  return { out, said };
}

/** Puts a `backupData` folder into an empty data directory. It never writes over a directory that already holds a record. */
export function restoreData(o: { data: string; from: string }): string[] {
  if (!existsSync(join(o.from, 'directory.sqlite'))) throw new Error(`${o.from} is not a BrainDog backup: it has no directory.sqlite.`);
  if (existsSync(join(o.data, 'directory.sqlite')))
    throw new Error(`${o.data} already holds a record. Restore into an empty folder: set BRAINDOG_DATA to a new one, or move this one aside.`);
  mkdirSync(o.data, { mode: 0o700, recursive: true });
  cpSync(o.from, o.data, { recursive: true });
  if (existsSync(join(o.data, 'kek'))) chmodSync(join(o.data, 'kek'), 0o600);
  return readdirSync(o.data);
}
