/**
 * An add-on's `migrate`: the one script a major version may carry to move the entries the older version kept into the
 * shape the newer one reads (phase 8, DESIGN.md 8).
 *
 * IN THE FILE, NOT A DECLARATION. A migrate runs once, inside the update that brings it, and never again, so it has no
 * schedule, no door and no row in the record's declarations. It is part of the manifest, and so of the checksum: what
 * the person approved is the source that runs.
 *
 * IT REACHES NOTHING OUTSIDE THE RECORD. No `egress`, no `keys`: a move of your entries has no reason to call anyone.
 * What it reads and writes is named, and the record holds both to the add-on's own lists when it runs (`reads` may be
 * a list of the version held or of this one, `writes` only one of this one).
 *
 * `from` IS THE MAJOR VERSION IT MOVES FROM. It runs when the record holds that major and this file's major is higher;
 * any other update, and a first install, runs nothing.
 */

import type { Refusal } from '@braindog/ports';

/** The manifest's `migrate`, read. */
export type PackMigrate = {
  /** The major version it moves entries from: 1 for a 1.x held, updated to this file. */
  from: number;
  /** What the plan says it does, in the author's words: "Moves your ratings into stars". */
  says: string;
  /** The lists it reads, by id. */
  reads: string[];
  /** The lists it writes, by id. Only this file's own. */
  writes: string[];
  /** The script, as a script declaration's `source` is written. */
  source: string;
  /** The ceilings, as a script's `limits` are written. Absent is a script's defaults. */
  limits?: Record<string, number>;
};

/** What the plan carries when an update will run one: the versions, and the author's words. */
export type Migrates = { from: string; to: string; says: string };

const SAYS_MOST = 140;
const SOURCE_MOST = 64 * 1024;
const LIST_ID = /^[a-z][a-z0-9_]*$/u;
const KEYS = ['from', 'says', 'reads', 'writes', 'source', 'limits'] as const;

const bad = (fix: string, at: string): Refusal => ({ code: 'DECLARATION_INVALID', fix, at: `migrate.${at}` });

/** `doc.migrate` read, `null` when the file has none, or the refusal that says what is wrong with it. */
export function readMigrate(raw: unknown): { ok: true; value: PackMigrate | null } | { ok: false; refusal: Refusal } {
  if (raw === undefined) return { ok: true, value: null };
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
    return { ok: false, refusal: { code: 'DECLARATION_INVALID', fix: 'migrate is { from, says, reads, writes, source }: the major it moves from, a line for the plan, the lists, and the script.', at: 'migrate' } };
  const m = raw as Record<string, unknown>;
  const stray = Object.keys(m).find((k) => !(KEYS as readonly string[]).includes(k));
  if (stray !== undefined) return { ok: false, refusal: bad(`migrate says ${stray}, and it takes ${KEYS.join(', ')}. A move of your entries calls nobody, so it has no egress and no keys.`, stray) };
  if (typeof m.from !== 'number' || !Number.isSafeInteger(m.from) || m.from < 0)
    return { ok: false, refusal: bad('from is the major version it moves from, a whole number: 1 moves a 1.x into this one.', 'from') };
  if (typeof m.says !== 'string' || m.says.trim() === '' || m.says.length > SAYS_MOST)
    return { ok: false, refusal: bad(`says is one line the plan shows, at most ${SAYS_MOST} characters, such as "Moves your ratings into stars".`, 'says') };
  const lists = (key: 'reads' | 'writes'): string[] | Refusal => {
    const v = m[key];
    if (!Array.isArray(v) || v.length === 0 || v.some((x) => typeof x !== 'string' || !LIST_ID.test(x)))
      return bad(`${key} names the lists it ${key === 'reads' ? 'reads' : 'writes'} by id, at least one, such as ["films"].`, key);
    return [...new Set(v as string[])];
  };
  const reads = lists('reads');
  if (!Array.isArray(reads)) return { ok: false, refusal: reads };
  const writes = lists('writes');
  if (!Array.isArray(writes)) return { ok: false, refusal: writes };
  if (typeof m.source !== 'string' || m.source.trim() === '' || m.source.length > SOURCE_MOST)
    return { ok: false, refusal: bad('source is the script that moves the entries, as a script declaration writes it.', 'source') };
  let limits: Record<string, number> | undefined;
  if (m.limits !== undefined) {
    if (m.limits === null || typeof m.limits !== 'object' || Array.isArray(m.limits) || Object.values(m.limits).some((x) => typeof x !== 'number'))
      return { ok: false, refusal: bad("limits are a script's limits: numbers by name.", 'limits') };
    limits = m.limits as Record<string, number>;
  }
  return { ok: true, value: { from: m.from, says: m.says.trim(), reads, writes, source: m.source, ...(limits === undefined ? {} : { limits }) } };
}

const majorOf = (version: string): number => Number(version.split('.')[0]);

/** Whether updating from `held` to `to` runs this file's migrate: the record holds its `from` major and `to` is a higher major. */
export function migrateDue(migrate: PackMigrate | undefined, held: string | null, to: string): boolean {
  if (migrate === undefined || held === null) return false;
  const was = majorOf(held);
  return was === migrate.from && majorOf(to) > was;
}
