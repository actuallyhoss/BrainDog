/**
 * The record's copies as three facts: when the last copy was kept and how large it was, and when the record was last
 * exported (LCH-C03). And the two writes that make them true each night: a copy kept, or a copy that failed.
 *
 * READ FROM THE `export` EVENTS, AND NOTHING NEW IS STORED. Every copy already writes one (`lifecycle`, with the note
 * `snapshot <id> <bytes> bytes`), every export writes one (`export`, with the note `sections ...`), and those events are
 * local: `brainl.ts`'s `LOCAL_ROWS` leaves them out of every copy and every file. So the facts never travel, a write
 * after tonight's dump does not change tomorrow's bytes, and there is no table to migrate.
 *
 * A NOTE BEGINNING `failed:` IS A NIGHT THAT DID NOT COPY, as he worded it (P.173), and never a copy: its time is not
 * `last_copy_at`. The same night raises one fault (`fault.ts`, cause `NIGHT_FAULT`), and the same cause the next night
 * counts one more of that fault rather than opening a second. A copy kept clears it. Never a question.
 *
 * THE NIGHT'S OWN DUMP IS AN EXPORT TOO, written as `system` (`dumpOf` in the Worker), so `last_export_at` is an export
 * somebody asked for: any actor but `system`.
 */

import type { Sql } from '@braindog/ports';

import { clearFault, raiseFault } from './fault.ts';

/** What Settings reads about the record's copies. `null` is none yet: a record made today has had no copy. */
export type CopyFacts = {
  last_copy_at: string | null;
  last_copy_bytes: number | null;
  last_export_at: string | null;
};

/**
 * The fault a failed night raises. `night#` is the door and `export.night` the kind, so `familyOf` reads it as `export`
 * and he reads "BrainDog could not save a copy of your record. It tries again tonight."
 */
export const NIGHT_FAULT = 'night#export.night';

/** The kind under `NIGHT_FAULT`. */
export const NIGHT_KIND = 'export.night';

/** The note a kept copy writes: the copy's name and its size, the shape "snapshot now" has always written. */
export const keptNote = (id: string, bytes: number): string => `snapshot ${id} ${String(Math.max(0, Math.trunc(bytes)))} bytes`;

/**
 * The note a failed night writes, in plain words, and always the same words.
 *
 * THE REASON NEVER GOES IN THE NOTE. A note is history anyone who reads the record sees, and a thrown error can carry
 * a bucket's name, an object's key or a host. The reason goes to the fault alone (`raiseFault`, which caps it). The
 * `failed:` prefix stays, because the self-host's one-note-a-night check matches it (`backup.ts`).
 */
export const failedNote = (): string => 'failed: the copy could not be saved';

const KEPT = /^snapshot \S+ (\d+) bytes$/u;

/**
 * The three facts, from the newest `export` events.
 *
 * `target IS NULL` IS EVERY `export` EVENT (none is about a row), and it lets the read walk `event_target` from its
 * newest end rather than the whole log, so asking on every boot costs a few rows on a record of any size.
 */
export function copyFacts(sql: Sql): CopyFacts {
  const copy = sql.one<{ ts: string; note: string }>(
    "SELECT ts, note FROM event WHERE target IS NULL AND kind = 'export' AND note LIKE 'snapshot %' ORDER BY ts DESC, id DESC LIMIT 1",
  );
  const exported = sql.one<{ ts: string }>(
    "SELECT ts FROM event WHERE target IS NULL AND kind = 'export' AND note LIKE 'sections %' AND actor <> 'system' ORDER BY ts DESC, id DESC LIMIT 1",
  );
  const bytes = copy ? KEPT.exec(copy.note)?.[1] : undefined;
  return {
    last_copy_at: copy?.ts ?? null,
    last_copy_bytes: bytes === undefined ? null : Number(bytes),
    last_export_at: exported?.ts ?? null,
  };
}

/** How the two writes reach the log: the kernel's `lifecycle`, so the event is written the one way an `export` is. */
export type Lifecycle = (kind: 'export', actor: string, note: string) => unknown;

/** A copy kept: one `export` event with its name and size, and a failed night's fault cleared. */
export function copyKept(sql: Sql, lifecycle: Lifecycle, id: string, bytes: number, nowMs: number): void {
  lifecycle('export', 'system', keptNote(id, bytes));
  clearFault(sql, NIGHT_FAULT, nowMs);
}

/**
 * A copy that failed: one `export` event whose note begins `failed:`, and one fault, counted again if already open.
 * `why` reaches the fault and never the note.
 */
export function copyFailed(sql: Sql, lifecycle: Lifecycle, why: string, nowMs: number): void {
  lifecycle('export', 'system', failedNote());
  raiseFault(sql, NIGHT_FAULT, NIGHT_KIND, why, nowMs);
}
