/**
 * The night's copy and the last export, as Settings says them (LCH-C03): `boot`'s `copies` to the one line over the
 * Backups list and the one line in Export.
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
