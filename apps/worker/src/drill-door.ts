/**
 * The restore drill's door (LCH-C04 job 3): what `restore-drill.mjs --report` posts to `/account/ops/drill`, read, and
 * what the host then says about it.
 *
 * COUNTS ONLY. The drill sends `{ at, pass, copies, rows, lists, people, records }` (`report` in
 * `apps/cli/scripts/restore-drill.mjs`), with `records` null when it did not open the Directory's copy. Any other field is
 * refused, so an id, a name or an address can never ride in beside the counts and be kept where every record reads it.
 *
 * THE HOST KEEPS THE LAST DRILL, not one per record (the scope's critic): only the operator holds the key that opens a
 * copy, so the Directory keeps it (`drill` in `@braindog/record/directory`) and every signed-in person reads the same one.
 * The last is the newest by when it ran: a post older than the kept drill is ignored (`olderDrill`).
 */

import type { HostDrill } from '@braindog/record/directory';

/** The fields a drill's report may hold, and nothing else. */
export const DRILL_FIELDS = ['at', 'pass', 'copies', 'rows', 'lists', 'people', 'records'] as const;

/** How far ahead of the host's clock a drill's `at` may be: a Mac's clock a little fast, never a drill from tomorrow. */
export const DRILL_AHEAD_MS = 10 * 60_000;

const SHAPE = 'The drill reports { at, pass, copies, rows, lists, people, records } as JSON, counts only.';

const whole = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

/** The body the drill sent, read, or the one sentence that says what is wrong with it and which field. */
export function readDrill(body: unknown, now: number = Date.now()): { ok: true; value: HostDrill } | { ok: false; fix: string; at: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, fix: SHAPE, at: 'body' };
  const b = body as Record<string, unknown>;
  const extra = Object.keys(b).find((k) => !(DRILL_FIELDS as readonly string[]).includes(k));
  if (extra !== undefined) return { ok: false, fix: `The drill's report holds counts only, and ${extra.slice(0, 40)} is not one of them.`, at: extra.slice(0, 40) };
  const at = b['at'];
  const when = typeof at === 'string' ? Date.parse(at) : Number.NaN;
  if (!Number.isFinite(when)) return { ok: false, fix: 'The drill says when it ran as an ISO date and time, such as 2026-10-09T09:17:00Z.', at: 'at' };
  if (when > now + DRILL_AHEAD_MS) return { ok: false, fix: 'The drill says it ran later than now, so the clock that sent it is wrong.', at: 'at' };
  if (typeof b['pass'] !== 'boolean') return { ok: false, fix: 'The drill says whether it passed as true or false.', at: 'pass' };
  for (const field of ['copies', 'rows', 'lists', 'people'] as const)
    if (!whole(b[field])) return { ok: false, fix: `The drill's ${field} is a whole number, zero or more.`, at: field };
  const records = b['records'] ?? null;
  if (records !== null && !whole(records))
    return { ok: false, fix: "The drill's records is the Directory's count as a whole number, or null when it did not open the Directory.", at: 'records' };
  /* A DRILL OF THE DIRECTORY ALONE (`--directory` with no `--record`) opened one copy and counts no record's, so it may
     pass with no copies; one that opened nothing at all did not. */
  if (b['pass'] === true && b['copies'] === 0 && records === null) return { ok: false, fix: 'A drill that opened no copy did not pass.', at: 'pass' };
  return {
    ok: true,
    value: {
      at: new Date(when).toISOString(),
      pass: b['pass'],
      copies: b['copies'] as number,
      rows: b['rows'] as number,
      lists: b['lists'] as number,
      people: b['people'] as number,
      records: records as number | null,
    },
  };
}

/**
 * The note the operator's own record takes (`OPS_RECORD`), in the walk's form (`summaryOf` in `nightly.ts`):
 * `drill 2026-10-09 · pass · 2 records`. The records are the copies the drill opened, each one record's.
 */
export function drillNote(d: HostDrill): string {
  return `drill ${d.at.slice(0, 10)} · ${d.pass ? 'pass' : 'fail'} · ${String(d.copies)} records`;
}

/**
 * A DRILL OF THE DIRECTORY ALONE: it opened the Directory's copy (`records` is its count) and no record's (`copies` 0).
 * Such a drill may pass, yet no record's copy was tried, so the answer says so in a field of its own and the Backups
 * area never has to read it out of a zero.
 */
export function directoryOnly(d: HostDrill): boolean {
  return d.copies === 0 && d.records !== null;
}

/**
 * Whether a drill just told is OLDER than the one the host keeps, so the door ignores it: the host keeps the NEWEST
 * drill by when it ran, not whichever post lands last (a report sent again, or two Macs out of order). The same
 * instant is not older, so a drill run again in the same minute replaces the one before it. Nothing kept, or a kept
 * `at` this build cannot read, is older than nothing.
 */
export function olderDrill(told: HostDrill, kept: HostDrill | null): boolean {
  if (kept === null) return false;
  const was = Date.parse(kept.at);
  return Number.isFinite(was) && Date.parse(told.at) < was;
}

/** What the door answers: when, whether it passed, how many records it opened, and whether it opened the Directory alone. */
export type DrillAnswer = { at: string; pass: boolean; records: number; directory_only: boolean } | { at: null };

/**
 * What `GET /account/drill` answers a signed-in person, or `{ at: null }`. `records` is the count of records whose copy
 * was opened; `directory_only` is true when that is none because the drill opened the Directory's copy and no other.
 */
export function drillAnswer(d: HostDrill | null): DrillAnswer {
  return d === null ? { at: null } : { at: d.at, pass: d.pass, records: d.copies, directory_only: directoryOnly(d) };
}
