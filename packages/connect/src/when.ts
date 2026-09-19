/**
 * When a run is due, and what range of time it asks the provider for.
 *
 * JITTER IS MANDATORY AND DETERMINISTIC, and both halves of that are load-bearing (`25 §9`). Twenty
 * connectors declaring `every: 1h` become due at the same instant, which is one wake and twenty
 * runs in one Worker invocation — at `max_pages: 50` that is a thousand subrequests, exactly the
 * Paid ceiling and twenty times the Free one. So the due instant is spread. And it is spread by a
 * hash of the record and the ingest rather than by a random number, because *"why was there a gap
 * at 04:00"* has to have an answer, and with random jitter it does not.
 *
 * THE WINDOW CEILING IS THE START OF THE CURRENT GRAIN AND NOT THE CURRENT INSTANT. A `day` series
 * fetched at 14:00 would otherwise write eleven hours of a day into the row that means the whole
 * day, and nothing downstream could tell that number from a finished one. `47 §6`'s complete-window
 * rule says the same thing from the other end: `watermark = min(until, start of today)`.
 *
 * AND THE ARITHMETIC IS IN THE RECORD'S ZONE, not in UTC. A person whose day starts in Cairo wants
 * yesterday to mean yesterday there. That means converting a wall clock back to an instant, which
 * means knowing the offset — and the offset depends on the instant, which is the circularity every
 * one of these functions is really about. `zonedToMs` resolves it by measuring the offset twice.
 */

import { GRAINS, parseDuration, type Cursor, type FetchDecl, type Grain, type Window } from './index.ts';

const utf8 = new TextEncoder();
const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

/* ── The zone ────────────────────────────────────────────────────────────────────────────────── */

const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

const formatter = (tz: string): Intl.DateTimeFormat => {
  const held = FORMATTERS.get(tz);
  if (held !== undefined) return held;
  const made = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  FORMATTERS.set(tz, made);
  return made;
};

/** The wall clock in `tz` at an instant, as numbers. */
export type Wall = { year: number; month: number; day: number; hour: number; minute: number; second: number };

export function wallAt(ms: number, tz: string): Wall {
  const parts: Record<string, string> = {};
  for (const part of formatter(tz).formatToParts(new Date(ms))) parts[part.type] = part.value;
  /* `hour12: false` STILL SPELLS MIDNIGHT `24` IN SOME ENGINES, which is a wall clock an hour
     arithmetic cannot use and a bug that only appears between 00:00 and 01:00 local. */
  const hour = Number(parts.hour ?? '0');
  return {
    year: Number(parts.year ?? '0'),
    month: Number(parts.month ?? '1'),
    day: Number(parts.day ?? '1'),
    hour: hour === 24 ? 0 : hour,
    minute: Number(parts.minute ?? '0'),
    second: Number(parts.second ?? '0'),
  };
}

/** How far `tz` is from UTC at an instant, in milliseconds. */
const offsetAt = (ms: number, tz: string): number => {
  const w = wallAt(ms, tz);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(ms / 1000) * 1000;
};

/**
 * A wall clock in `tz`, as an instant.
 *
 * MEASURED TWICE, BECAUSE THE OFFSET DEPENDS ON THE ANSWER. Guessing with the offset at the naive
 * instant is wrong by an hour on the two days a year a zone changes — which is the pair of days a
 * connector is most likely to double-count or skip a bucket, and the least likely to be watched.
 * The second pass reads the offset where the first guess landed and re-applies it.
 *
 * A WALL CLOCK THAT DOES NOT EXIST LANDS AFTER THE GAP. On a spring-forward night 00:30 is not a
 * time; the two passes agree on the instant just past the jump, which is the next moment that
 * actually happened. Nothing here pretends the hour was there.
 */
export function zonedToMs(w: Wall, tz: string): number {
  const naive = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  const once = naive - offsetAt(naive, tz);
  return naive - offsetAt(once, tz);
}

/** The instant the grain containing `ms` began, in `tz`. */
export function startOfGrainMs(ms: number, grain: Grain, tz: string): number {
  const w = wallAt(ms, tz);
  if (grain === 'month') return zonedToMs({ ...w, day: 1, hour: 0, minute: 0, second: 0 }, tz);
  if (grain === 'day') return zonedToMs({ ...w, hour: 0, minute: 0, second: 0 }, tz);
  return zonedToMs({ ...w, minute: 0, second: 0 }, tz);
}

/* ── Jitter ──────────────────────────────────────────────────────────────────────────────────── */

const JITTER_FLOOR_S = 30;
const JITTER_CEILING_S = 900;

/**
 * `47 §4.8`: `u32be(sha256(record ‖ 0x1F ‖ ingest)[0..4]) mod clamp(every / 10, 30 s, 15 min)`.
 *
 * IT IS A PROMISE AND `47 §2` DECLARES IT SYNCHRONOUS (`§13` D19). `crypto.subtle.digest` is the
 * only SHA-256 a package may reach for — `31 §1` bans `node:crypto` here — and it is async. The
 * alternative was forty lines of hand-written SHA-256 in a connector, which is a primitive
 * reimplemented to satisfy a signature, and the only caller is already `async`.
 */
export async function jitterSeconds(recordId: string, ingestId: string, everyS: number): Promise<number> {
  const digest = await crypto.subtle.digest('SHA-256', utf8.encode(`${recordId}\u001f${ingestId}`));
  const head = new DataView(digest).getUint32(0, false);
  const window = Math.min(Math.max(Math.floor(everyS / 10), JITTER_FLOOR_S), JITTER_CEILING_S);
  return head % window;
}

/**
 * The next unjittered slot, and the instant the row actually becomes due.
 *
 * THE SLOT AND THE DUE INSTANT ARE TWO DIFFERENT NUMBERS, and keeping them apart is what stops
 * jitter from drifting. Each slot is computed from the previous SLOT, so an hourly connector runs
 * at 04:00 + 3 min, 05:00 + 3 min, 06:00 + 3 min. Computing the next one from the DUE instant would
 * add the jitter again every hour and walk the schedule off the hour entirely within a day.
 *
 * `at:` RE-ANCHORS RATHER THAN ADDING. `every` is a multiple of 24 h when `at` is declared, so
 * adding it preserves the wall clock — except across a zone change, where it slips by an hour and
 * stays slipped. Re-reading the declared wall time on the day it landed on puts it back.
 */
export async function nextDue(
  decl: FetchDecl,
  slot: number,
  now: number,
  recordId: string,
  ingestId: string,
  tz: string,
): Promise<{ slot: number; dueAt: number }> {
  const everyMs = parseDuration(decl.schedule.every);
  if (everyMs === null || everyMs <= 0)
    throw new Error(`a schedule needs an interval this build can read, and "${decl.schedule.every}" is not one`);

  let next = slot;
  do {
    next += everyMs;
  } while (next <= now);

  const at = decl.schedule.at;
  if (at !== undefined) {
    const [h, m] = at.split(':');
    const wall = { ...wallAt(next, tz), hour: Number(h), minute: Number(m), second: 0 };
    next = zonedToMs(wall, tz);
    while (next <= now) next = zonedToMs({ ...wallAt(next + everyMs, tz), hour: Number(h), minute: Number(m), second: 0 }, tz);
  }

  const jitter = await jitterSeconds(recordId, ingestId, Math.floor(everyMs / 1000));
  return { slot: next, dueAt: next + jitter * 1000 };
}

/* ── The window ──────────────────────────────────────────────────────────────────────────────── */

const isGrain = (g: string): g is Grain => (GRAINS as readonly string[]).includes(g);

/** `YYYY-MM-DD` or an RFC 3339 instant, as an instant in `tz`. A date means that day's midnight there. */
const instantOf = (text: string, tz: string): number | null => {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(text);
  if (date !== null)
    return zonedToMs(
      { year: Number(date[1]), month: Number(date[2]), day: Number(date[3]), hour: 0, minute: 0, second: 0 },
      tz,
    );
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
};

/** An instant as the RFC 3339 a cursor carries. */
export const rfc3339 = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/u, 'Z');

/**
 * What this run asks for, or `null` when the answer is "nothing yet" (`47 §5.1` step 3).
 *
 * A HALF-FINISHED WINDOW IS RESUMED EXACTLY, never recomputed. `cursor.window` is present precisely
 * when the last run ended `partial`, and recomputing it from the watermark would re-fetch the pages
 * that already landed — which for a `flow` series is every one of their values counted twice.
 *
 * `lookback` REACHES BACK BEHIND THE WATERMARK ON PURPOSE. A provider that backdates a row, or
 * settles a transaction two days after it appears, hands a run rows it has already seen; the record
 * deduplicates them, and the alternative is never seeing the correction at all.
 *
 * NO `window:` DECLARED MEANS THE RUN IS NOT A RANGE. `{since}` and `{until}` are refused at lint
 * for such a declaration, so both are the slot and neither is ever substituted.
 */
export function windowFor(
  decl: FetchDecl,
  cursor: Cursor,
  slotMs: number,
  nowMs: number,
  tz: string,
): Window | null {
  const held = cursor.window;
  if (held !== undefined) {
    const since = Date.parse(held.since);
    const until = Date.parse(held.until);
    if (!Number.isNaN(since) && !Number.isNaN(until)) return { since, until };
  }

  const declared = decl.window;
  if (declared === undefined) return { since: slotMs, until: slotMs };

  if (!isGrain(declared.grain))
    throw new Error(`a window is bucketed by one of ${GRAINS.join(', ')}, and "${declared.grain}" is none of them`);

  const start = instantOf(declared.start, tz);
  if (start === null) throw new Error(`a window starts at a date this build can read, and "${declared.start}" is not one`);

  const watermark = cursor.watermark === null ? start : (instantOf(cursor.watermark, tz) ?? start);
  const lookback = parseDuration(declared.lookback ?? '0m') ?? 0;
  const since = Math.max(start, watermark - lookback);

  const span = declared.max_span === undefined ? Infinity : (parseDuration(declared.max_span) ?? Infinity);
  const until = Math.min(since + span, startOfGrainMs(nowMs, declared.grain, tz));

  /* NOTHING TO FETCH IS NOT A FAILURE. A connector caught up at 00:05, whose grain is a day, has no
     complete bucket it has not already read, and the run that says so writes nothing and asks for
     nothing. `since >= until` is the whole of that condition. */
  return since >= until ? null : { since, until };
}

/**
 * Where the watermark moves to after a window completes (`47 §6`).
 *
 * CAPPED AT THE START OF THE CURRENT GRAIN, so a watermark can never claim coverage of a bucket
 * that is still filling. That invariant is what a test checks, and it is the reason a cursor can be
 * trusted after a run that ended in the middle of a day.
 */
export const watermarkAfter = (until: number, grain: Grain, nowMs: number, tz: string): string =>
  rfc3339(Math.min(until, startOfGrainMs(nowMs, grain, tz)));

/** `HH:MM` on the day an instant falls in, for the tests and the schedule's `at`. */
export const wallClock = (ms: number, tz: string): string => {
  const w = wallAt(ms, tz);
  return `${w.year}-${pad(w.month)}-${pad(w.day)} ${pad(w.hour)}:${pad(w.minute)}`;
};
