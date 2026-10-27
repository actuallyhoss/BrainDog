/**
 * The night's copy and the last export, as Settings says them: `boot`'s `copies` to the one line over the
 * Backups list and the one line in Export. And this host's last restore test beside the copy line, at the end.
 *
 * THE FACTS ARE THE RECORD'S, AND LOCAL: `last_copy_at`, `last_copy_bytes` and `last_export_at`, read from the newest
 * `export` events (`packages/kernel/src/copies.ts`, `copyFacts`) and sent on `boot` as `copies`. Each may be `null`.
 *
 * READ LOOSELY, because the client's `Boot` type does not name `copies` yet: an answer from a host older than the field
 * has none, and an answer with a value of the wrong shape is read as that fact unknown rather than as a date of 1970.
 *
 * LATE IS PAST 26 HOURS, never colour alone. A night's copy runs once a day, so a copy older than a day and two hours
 * means last night's did not land, and the line says so with a word beside the deeper red.
 */

import { bytes } from 'braindog-render';

import { copy } from '../../../../lib/copy.ts';

/** What `boot` says of the record's copies. */
export type CopyFacts = {
  last_copy_at: string | null;
  last_copy_bytes: number | null;
  last_export_at: string | null;
};

/** Past this, the newest copy is not last night's. */
export const LATE_MS = 26 * 3_600_000;

const instant = (v: unknown): string | null => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null);

/** `boot`'s `copies`, or `null` from a host that does not send them, so the screen draws no line rather than a wrong one. */
export function copiesOf(boot: unknown): CopyFacts | null {
  const said = boot !== null && typeof boot === 'object' ? (boot as { copies?: unknown }).copies : undefined;
  if (said === null || typeof said !== 'object') return null;
  const c = said as Record<string, unknown>;
  const size = c.last_copy_bytes;
  return {
    last_copy_at: instant(c.last_copy_at),
    last_copy_bytes: typeof size === 'number' && Number.isFinite(size) && size >= 0 ? size : null,
    last_export_at: instant(c.last_export_at),
  };
}

/** How long ago, in the words a person says it: "just now", "9 hours ago", "yesterday", "3 days ago". */
export function ago(iso: string, now: number): string {
  const ms = Math.max(0, now - Date.parse(iso));
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return copy.copiesJustNow;
  if (mins < 60) return copy.copiesAgo(mins, 'minute');
  const hours = Math.floor(mins / 60);
  if (hours < 24) return copy.copiesAgo(hours, 'hour');
  const days = Math.floor(hours / 24);
  return days === 1 ? copy.copiesYesterday : copy.copiesAgo(days, 'day');
}

/** The Backups line: the sentence, and whether it is late, which the screen marks with the word as well. */
export type CopyLine = { text: string; late: boolean };

/**
 * "Last copy: 9 hours ago, 2.10 MB", or "First copy tonight" where no copy has been kept yet. A record with no copy
 * is never late: it is a record made since the last night ran, and the night copies it.
 */
export function copyLine(facts: CopyFacts, now: number): CopyLine {
  if (facts.last_copy_at === null) return { text: copy.copiesFirst, late: false };
  const when = ago(facts.last_copy_at, now);
  const text = facts.last_copy_bytes === null ? copy.copiesLast(when) : copy.copiesLastSized(when, bytes(facts.last_copy_bytes));
  return { text, late: now - Date.parse(facts.last_copy_at) > LATE_MS };
}

/** The Export line: "Last exported: 3 days ago", or "Never exported". */
export function exportLine(facts: CopyFacts, now: number): string {
  return facts.last_export_at === null ? copy.exportedNever : copy.exportedLast(ago(facts.last_export_at, now));
}

/**
 * THE EXPORTS SOMEBODY TOOK, AS THE LOG KEEPS THEM: every export writes one `export`
 * event whose note begins `sections` (`packages/kernel/src/copies.ts`), and the night's own dump is one too, written as
 * `system`, which is the nightly copy and never an export. Backups said "No backups here yet" over a log whose Activity
 * counted four of his exports, so it lists them, newest first, the instants alone.
 */
export function exportsIn(events: readonly { kind?: unknown; actor?: unknown; note?: unknown; ts?: unknown }[]): string[] {
  const out: string[] = [];
  for (const e of events) {
    if (e.kind !== 'export' || e.actor === 'system' || typeof e.note !== 'string' || !e.note.startsWith('sections')) continue;
    const at = instant(e.ts);
    if (at !== null) out.push(at);
  }
  return out.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

/** How many pages of the log Backups reads for exports: a recent export is found, an old one is said by the line. */
export const EXPORT_PAGES = 2;

/** The page reader `readExports` asks, `recentHistory`'s shape: one page and the cursor below it. */
export type LogPager = (cursor: unknown) => Promise<{ events: readonly Record<string, unknown>[]; cursor: unknown } | null>;

/**
 * The exports in the newest `EXPORT_PAGES` pages of the log, or `null` where the log could not be read, so the screen
 * says the one line it has from `boot` and lists nothing it was not told.
 */
export async function readExports(page: LogPager): Promise<string[] | null> {
  const seen: Record<string, unknown>[] = [];
  let cursor: unknown = null;
  for (let i = 0; i < EXPORT_PAGES; i++) {
    const out = await page(cursor).catch(() => null);
    if (out === null) return i === 0 ? null : exportsIn(seen);
    seen.push(...out.events);
    if (out.cursor === null || out.cursor === undefined) break;
    cursor = out.cursor;
  }
  return exportsIn(seen);
}

/**
 * THIS HOST'S LAST RESTORE TEST (LCH-C04 job 4), from `GET /account/drill`: `{ at, pass, record_copies, directory_only }`, or `{ at: null }`
 * before the first. A FACT ABOUT THE HOST AND NOT THE RECORD (the scope's critic): only the operator holds the key that
 * opens the copies, so every record on the host reads the same line, and nothing here is drawn for one record alone.
 */
export type DrillFacts = { at: string; pass: boolean; records: number } | { at: null };

/** Past this, the last pass is overdue: the drill runs monthly, and the vital sign asks for one under 35 days. */
export const DRILL_DUE_MS = 35 * 24 * 3_600_000;

/** The answer's `value`, or `null` where it is not the door's shape, so a wrong answer draws no line rather than a wrong one. */
export function drillOf(value: unknown): DrillFacts | null {
  if (value === null || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v.at === null) return { at: null };
  const at = instant(v.at);
  if (at === null || typeof v.pass !== 'boolean') return null;
  /* THE DOOR SAYS `record_copies` (drill-note-53-54): the records whose copy the drill opened. `records` is read where
     that is absent, for a host still on the build before the name moved; the two never mean different things here. */
  const said = v.record_copies ?? v.records;
  const counted = typeof said === 'number' && Number.isInteger(said) && said >= 0;
  // A pass with no count is not the door's shape: zero now reads "no record's copy was tried", which nobody said.
  if (v.pass && !counted) return null;
  return { at, pass: v.pass, records: counted ? (said as number) : 0 };
}

/**
 * Read the door. `null` IS NO LINE: a self-host has no such door and answers 404, a host where nobody signs in or a
 * session that ended answers 401, and a host that could not be reached says nothing. Only the door's own answer draws.
 * The door is at the root, under no record's slug, because the fact is the host's.
 */
export async function readDrill(io: typeof fetch, base = ''): Promise<DrillFacts | null> {
  let res: Response;
  try {
    res = await io(`${base}/account/drill`, { headers: { accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store' });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const said: unknown = await res.json().catch(() => undefined);
  if (said === null || typeof said !== 'object' || (said as { ok?: unknown }).ok !== true) return null;
  return drillOf((said as { value?: unknown }).value);
}

/**
 * The drill line: the sentence, whether it is a fault, and the word that marks it beside the deeper red. A test never
 * run is a fault, and stays one until the operator runs the first; so is a failed test, and a pass past 35 days.
 * A PASS THAT TRIED NO RECORD'S COPY IS NOT "PASSED": the Directory's copy opened and nothing else was
 * restored, so the line says exactly that, as a fault, until a test restores at least one record's copy.
 */
export type DrillLine = { text: string; fault: boolean; mark: string | null };

/** "This host's last restore test: passed 12 days ago", "...: failed 3 days ago", "..., 12 days ago: the Directory's copy opened; no record's copy was tried", or "Never tested". */
export function drillLine(drill: DrillFacts, now: number): DrillLine {
  if (drill.at === null) return { text: copy.drillNeverSaid, fault: true, mark: copy.drillNever };
  const when = ago(drill.at, now);
  if (!drill.pass) return { text: copy.drillFailed(when), fault: true, mark: null };
  if (drill.records === 0) return { text: copy.drillNoRecord(when), fault: true, mark: copy.drillUnproven };
  const overdue = now - Date.parse(drill.at) > DRILL_DUE_MS;
  return { text: copy.drillPassed(when), fault: overdue, mark: overdue ? copy.drillOverdue : null };
}
