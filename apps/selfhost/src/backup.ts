/**
 * The self-host's nightly copy (`loop/research-switch.md` §4, step 6, for a record kept on this machine).
 *
 * THE SAME COPY AS "SNAPSHOT NOW", ON A CLOCK. `snapshots.ts` takes it (`VACUUM INTO`, the whole file, beside the record in
 * `snapshots/`), prunes to its thirty, and puts one back; the app lists, downloads and restores them. This only decides
 * when one is due and takes it labelled `nightly`, with the `export` line in the log a copy taken from the app writes.
 *
 * DUE ONCE A DAY, AT A TIME OF DAY IN UTC, AND CAUGHT UP ON START. A machine that was off at that time takes the copy the
 * first time it looks after it: the question is always "is there a nightly copy since the last time it was due?", never
 * "is it that minute now?". So a laptop asleep at night still keeps one a day, and a restart never takes a second.
 */

import type { Sql } from '@braindog/ports';

import { fileSnapshots } from './snapshots.ts';

/** the old tool's own nightly copy ran at 03:20 UTC; this keeps the hour. */
export const NIGHTLY_AT = '03:20';

const AT = /^([01]\d|2[0-3]):([0-5]\d)$/u;
const NIGHTLY = /Z-nightly(?:-\d+)?$/u;

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
  /** The log line, `export`, as a copy from the app writes it. */
  logged?: (note: string) => void;
  say?: (line: string) => void;
}): Nightly {
  const minutes = minutesOf(o.at ?? NIGHTLY_AT);
  if (minutes === null) throw new Error(`${String(o.at)} is not a time of day. Write it as HH:MM in UTC, such as 03:20, or off.`);
  const copies = fileSnapshots(o.sql, o.file, o.now);
  let busy = false;

  const check = async (): Promise<string | null> => {
    if (busy) return null;
    busy = true;
    try {
      const since = new Date(lastDue(o.now(), minutes)).toISOString();
      const kept = await copies.list();
      if (kept.some((c) => NIGHTLY.test(c.id) && c.at >= since)) return null;
      const taken = await copies.take('nightly');
      o.logged?.(`snapshot ${taken.id} ${String(taken.bytes)} bytes`);
      o.say?.(`braindog · nightly copy ${taken.id} · ${String(taken.bytes)} bytes`);
      return taken.id;
    } finally {
      busy = false;
    }
  };

  const tick = o.tickMs ?? 600_000;
  const timer =
    tick > 0
      ? setInterval(() => {
          check().catch((e: unknown) => o.say?.(`braindog · the nightly copy was not taken: ${e instanceof Error ? e.message : String(e)}`));
        }, tick)
      : null;
  timer?.unref?.();
  return {
    check,
    stop: () => {
      if (timer) clearInterval(timer);
    },
  };
}
