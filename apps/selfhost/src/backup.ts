/**
 * The self-host's nightly copy, for a record kept on this machine.
 *
 * THE SAME COPY AS "SNAPSHOT NOW", ON A CLOCK. `snapshots.ts` takes it (`VACUUM INTO`, the whole file, beside the record in
 * `snapshots/`), keeps thirty nightly copies apart from the thirty a person takes, and puts one back; the app lists, downloads and restores them. This only decides
 * when one is due and takes it labelled `nightly`, with the `export` line in the log a copy taken from the app writes.
 *
 * DUE ONCE A DAY, AT A TIME OF DAY IN UTC, AND CAUGHT UP ON START. A machine that was off at that time takes the copy the
 * first time it looks after it: the question is always "is there a nightly copy since the last time it was due?", never
 * "is it that minute now?". So a laptop asleep at night still keeps one a day, and a restart never takes a second.
 *
 * AND THE DIRECTORY IS COPIED ON THE SAME CLOCK, `VACUUM INTO <data>/directory-snapshots/<time>-nightly.sqlite`, thirty
 * kept. Measured at 1586f2a2, a nightly copy left the data directory holding the
 * record's copy and nothing of `directory.sqlite`, the only file that knows which name reaches which record, who owns it
 * and their passkeys: lose it and every record is whole and nobody can reach one. It is the whole file, sessions
 * included, because it is a backup of this machine and never leaves it; the Cloud's copy, which does leave, carries only
 * the durable tables. Asked on its own question, "is there a Directory copy since it fell due?", so a host
 * upgraded after tonight's record copy still takes tonight's Directory copy.
 */

import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { copyFailed, copyKept } from '@braindog/kernel';
import type { Sql } from '@braindog/ports';

import { fileSnapshots, isNightly, KEEP } from './snapshots.ts';

/** The nightly copy runs at 03:20 UTC, an hour when a record is quiet. */
export const NIGHTLY_AT = '03:20';

const AT = /^([01]\d|2[0-3]):([0-5]\d)$/u;

/** `HH:MM` as minutes after midnight, or `null` when it is not one. */
export function minutesOf(at: string): number | null {
  const m = AT.exec(at.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** The last moment a nightly copy fell due at or before `now`. */
export function lastDue(now: number, minutes: number): number {
  const day = Math.floor(now / 86_400_000) * 86_400_000;
  const today = day + minutes * 60_000;
  return today <= now ? today : today - 86_400_000;
}

export type Nightly = {
  /** Take the copy when one is due: its id, or `null` when there is already one since it fell due. */
  check(): Promise<string | null>;
  /**
   * `check`, and a copy that cannot be written is said in one sentence rather than thrown: the id, or `null`. The host
   * serves the record either way, because a backup that failed is a thing to fix, not a reason nobody can open the record.
   */
  look(): Promise<string | null>;
  stop(): void;
};

export function nightlyBackups(o: {
  sql: Sql;
  file: string;
  now: () => number;
  /** `HH:MM`, UTC. */
  at?: string;
  /** How often to ask. `0` never asks on its own; `check` still works. */
  tickMs?: number;
  /** The log line, `export`, as a copy from the app writes it, or `failed: the copy could not be saved` for a night that did not copy (the reason goes to the fault, never the note). */
  logged?: (note: string) => void;
  say?: (line: string) => void;
  /** The Directory, through the connection the server holds, and its file; copies go in `directory-snapshots/` beside it. */
  directory?: { sql: Sql; file: string } | undefined;
}): Nightly {
  const minutes = minutesOf(o.at ?? NIGHTLY_AT);
  if (minutes === null) throw new Error(`${String(o.at)} is not a time of day. Write it as HH:MM in UTC, such as 03:20, or off.`);
  const copies = fileSnapshots(o.sql, o.file, o.now);
  let busy = false;
  /* THE SAME EVENT AND THE SAME FACTS AS THE CLOUD'S: a copy kept is `snapshot <id> <bytes> bytes`,
     a copy that failed is `failed: the copy could not be saved` and one fault holding the reason, through the kernel's `copyKept` and `copyFailed`, so Settings
     reads a self-host's copies with the same `copyFacts`. */
  const lifecycle = (_kind: 'export', _actor: string, note: string): void => o.logged?.(note);
  /* ONE FAILED NOTE A NIGHT, NOT ONE EVERY TEN MINUTES. A copy that cannot be written is tried again on every tick until
     the next one falls due, and the night it failed is one night: a note already written since it fell due is enough,
     and the fault it raised is still open. */
  const told = (why: string, since: string): void => {
    const already = o.sql.one<{ n: number }>(
      "SELECT count(*) AS n FROM event WHERE target IS NULL AND kind = 'export' AND note LIKE 'failed:%' AND ts >= ?",
      since,
    );
    if (Number(already?.n ?? 0) === 0) copyFailed(o.sql, lifecycle, why, o.now());
  };

  const check = async (): Promise<string | null> => {
    if (busy) return null;
    busy = true;
    try {
      const since = new Date(lastDue(o.now(), minutes)).toISOString();
      const kept = await copies.list();
      let taken: string | null = null;
      if (!kept.some((c) => isNightly(c.id) && c.at >= since)) {
        const copy = await copies.take('nightly').catch((e: unknown) => {
          told(e instanceof Error ? e.message : String(e), since);
          throw e;
        });
        copyKept(o.sql, lifecycle, copy.id, copy.bytes, o.now());
        o.say?.(`braindog · nightly copy ${copy.id} · ${String(copy.bytes)} bytes`);
        taken = copy.id;
      }
      /* THE DIRECTORY'S COPY FAILING DOES NOT UNDO THE RECORD'S, and it is said on its own: the sentence `look` gives
         names the record's folder, and this is a different file in a different one. */
      if (o.directory)
        try {
          directoryCopy(o.directory, since, o.now);
        } catch (e) {
          o.say?.(
            `braindog · the Directory's nightly copy was not taken, and the record is still served: ${e instanceof Error ? e.message : String(e)}. Check that ${join(dirname(o.directory.file), DIRECTORY_COPIES)} can be written; it is tried again every ten minutes.`,
          );
        }
      return taken;
    } finally {
      busy = false;
    }
  };

  const look = (): Promise<string | null> =>
    check().catch((e: unknown) => {
      o.say?.(
        `braindog · the nightly copy was not taken, and the record is still served: ${e instanceof Error ? e.message : String(e)}. Check that the snapshots folder beside the record can be written; it is tried again every ten minutes.`,
      );
      return null;
    });

  const tick = o.tickMs ?? 600_000;
  const timer = tick > 0 ? setInterval(() => void look(), tick) : null;
  timer?.unref?.();
  return {
    check,
    look,
    stop: () => {
      if (timer) clearInterval(timer);
    },
  };
}

/** The folder beside `directory.sqlite` its nightly copies go in. */
export const DIRECTORY_COPIES = 'directory-snapshots';

/* `2026-09-16T22-00-00Z-nightly.sqlite`, the record copies' stamp with the Directory's own extension: a copy is a SQLite
   file `sqlite3` opens as it is, and nothing here builds a path from anything but this shape. */
const DIRECTORY_COPY = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z-nightly(?:-\d+)?\.sqlite$/u;

/**
 * Copy the Directory if no copy has been taken since `since`, then keep the newest thirty. The copy's name, or `null`.
 *
 * 0600, AS THE RECORD'S COPIES ARE: it holds every address on this installation and every passkey's public half.
 */
export function directoryCopy(directory: { sql: Sql; file: string }, since: string, now: () => number): string | null {
  const folder = join(dirname(directory.file), DIRECTORY_COPIES);
  const atOf = (name: string): string => {
    const m = DIRECTORY_COPY.exec(name);
    return m ? `${m[1]}T${m[2]}:${m[3]}:${m[4]}.000Z` : '';
  };
  const held = (): string[] => (existsSync(folder) ? readdirSync(folder).filter((n) => DIRECTORY_COPY.test(n)) : []);
  if (held().some((n) => atOf(n) >= since)) return null;
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const stamp = `${new Date(now()).toISOString().slice(0, 19).replace(/:/g, '-')}Z-nightly`;
  let name = `${stamp}.sqlite`;
  for (let n = 2; existsSync(join(folder, name)); n++) name = `${stamp}-${String(n)}.sqlite`;
  directory.sql.exec('VACUUM INTO ?', join(folder, name));
  try {
    chmodSync(join(folder, name), 0o600);
  } catch {
    /* Advisory on Windows. */
  }
  const newest = held().sort((a, b) => (atOf(a) === atOf(b) ? b.localeCompare(a, 'en', { numeric: true }) : atOf(a) < atOf(b) ? 1 : -1));
  for (const old of newest.slice(KEEP)) rmSync(join(folder, old), { force: true });
  return name;
}
