/**
 * What each pattern did with the last fortnight's messages, as lines a person reads (REC-A03): per pattern, how many it
 * filed and how many it held, each held reason in plain words, and per door the messages no pattern read. The Inbox
 * draws it as one tile under "What comes in".
 *
 * THE REPORT IS THE RECORD'S, `inboxPatterns` over the kernel's `patternReport`, and nothing is counted here. A pattern,
 * or a door, with nothing to say draws nothing: a tile of rows reading "0 filed" says less than no tile.
 *
 * NAMES, NEVER IDS. The record names each pattern by its description and each door by its add-on's title; the pattern's
 * own handle rides along only as the key the screen draws a line by.
 *
 * A ROUTE-ONLY MODULE, like `series.ts`. The reads take the fetch they send by, so a test drives them without a socket.
 */

import { createClient } from '@braindog/client';

import { itemOf } from '../../lib/record/inbox-live.ts';
import type { InboxItem } from '../../lib/record/schema.ts';

/** The record's report, as `PatternReport` in `@braindog/kernel` shapes it. */
export type PatternLine = { ingest: string; said: string; filed: number; skipped: { reason: string; n: number }[]; waiting: number };
export type DoorLine = { door: string; said: string; patterns: PatternLine[]; unread: number };
export type PatternReport = { days: number; since: string; doors: DoorLine[] };

/** One pattern as a person reads it. `held` is each reason it held messages for, `waiting` the ones that need a person. */
export type PatternSaid = { key: string; name: string; counts: string; held: string[]; waiting: string | null };
/** One door as a person reads it, and the line for what no pattern read there. */
export type DoorSaid = { key: string; name: string; patterns: PatternSaid[]; unread: string | null };
/** The tile: its one sentence and its doors, or nothing when no pattern had anything to say. */
export type PatternPanel = { sentence: string; doors: DoorSaid[] };

/** How many days back the panel reads: the scope's fortnight. */
export const PATTERN_DAYS = 14;

/**
 * How a repeat's reason reads, in the kernel's words (`repeatSaid`), and how it read before batch 35: "transactions#4
 * already says this.". The report counts reasons, not the record's `repeats` mark, so its tile knows a repeat by these
 * words alone. Which messages offer "It is a second one" is the mark's to say (`readRepeats`), never these words.
 */
export const REPEAT = 'Looks like a repeat';
const REPEAT_BEFORE = /\salready says this\.?$/u;

export const isRepeat = (reason: string | null | undefined): boolean => typeof reason === 'string' && (reason.startsWith(REPEAT) || REPEAT_BEFORE.test(reason));

/** A list's handle and number (`transactions#4`) or a row's id: words a person never reads. */
const HANDLE = /[\p{L}\p{N}_-]+#\d+|\b[0-9A-HJKMNP-TV-Z]{26}\b/u;

/** A repeat's reason as a person reads it: the record's sentence, or, where it names the row by a handle, plain words. */
function repeatReason(reason: string | null | undefined): string {
  const said = sentence(reason ?? '');
  return said === '' || HANDLE.test(said) ? 'Looks like a repeat of one already filed.' : said;
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

/** A reason as a sentence: no em dash, a capital to start and a full stop to end. */
function sentence(text: string): string {
  const flat = text.replace(/\s*\u2014\s*|\s+\u2013\s+/gu, ', ').replace(/\s+/gu, ' ').trim();
  if (flat === '') return '';
  const capped = flat[0]!.toUpperCase() + flat.slice(1);
  return /[.!?]$/u.test(capped) ? capped : `${capped}.`;
}

/**
 * Each reason a pattern held messages for, in plain words. Repeats are one line, since each names the row it repeats:
 * one is said in the record's own sentence, more are counted. Any other reason is said once, with how many it held.
 */
export function heldSaid(skipped: readonly { reason: string; n: number }[]): string[] {
  const repeats = skipped.filter((s) => isRepeat(s.reason));
  const repeated = repeats.reduce((sum, s) => sum + s.n, 0);
  const out: string[] = [];
  if (repeated === 1) out.push(repeatReason(repeats[0]!.reason));
  else if (repeated > 1) out.push(`${plural(repeated, 'message', 'messages')} looked like repeats of ones already filed.`);
  for (const s of skipped) {
    if (isRepeat(s.reason) || s.n < 1) continue;
    const said = sentence(s.reason);
    if (said !== '') out.push(s.n === 1 ? said : `${said} ${s.n.toLocaleString('en-GB')} like this.`);
  }
  return out;
}

/** One pattern's line, or `null` when it filed, held and kept waiting nothing. */
export function patternSaid(p: PatternLine): PatternSaid | null {
  const skipped = p.skipped.reduce((sum, s) => sum + Math.max(0, s.n), 0);
  const held = skipped + Math.max(0, p.waiting);
  if (p.filed <= 0 && held === 0) return null;
  return {
    key: p.ingest,
    name: p.said,
    counts: `${p.filed > 0 ? `${p.filed.toLocaleString('en-GB')} filed` : 'None filed'}${held > 0 ? `, ${held.toLocaleString('en-GB')} held` : ''}`,
    held: heldSaid(p.skipped),
    waiting: p.waiting > 0 ? `${plural(p.waiting, 'waits', 'wait')} for you to decide.` : null,
  };
}

/** The busiest pattern first: what it held, then what it filed. */
const weight = (p: PatternLine) => p.skipped.reduce((sum, s) => sum + s.n, 0) + p.waiting;

/**
 * The tile from the report, or `null` when nothing in it has anything to say. Its sentence counts the whole window:
 * what was filed, what was held, and what no pattern read.
 */
export function panelOf(report: PatternReport | null): PatternPanel | null {
  /* A RECORD WITH NO PATTERN HAS NO PANEL: what no pattern read is said under "What comes in" already, and a tile of
     "no pattern read" on a record that has none says nothing a person can act on. */
  if (report === null || report.doors.every((d) => d.patterns.length === 0)) return null;
  let filed = 0;
  let held = 0;
  let unread = 0;
  const doors: DoorSaid[] = [];
  for (const d of report.doors) {
    const patterns = [...d.patterns]
      .sort((a, b) => weight(b) - weight(a) || b.filed - a.filed)
      .map((p) => {
        const said = patternSaid(p);
        if (said !== null) {
          filed += Math.max(0, p.filed);
          held += weight(p);
        }
        return said;
      })
      .filter((p): p is PatternSaid => p !== null);
    unread += Math.max(0, d.unread);
    const none = d.unread > 0 ? `${plural(d.unread, 'message', 'messages')} no pattern read.` : null;
    if (patterns.length > 0 || none !== null) doors.push({ key: d.door, name: d.said, patterns, unread: none });
  }
  if (doors.length === 0) return null;
  const parts = [`${filed.toLocaleString('en-GB')} filed`, `${held.toLocaleString('en-GB')} held`];
  if (unread > 0) parts.push(`${unread.toLocaleString('en-GB')} no pattern read`);
  return { sentence: `In the last ${plural(report.days, 'day', 'days')}: ${parts.join(', ')}.`, doors };
}

/* ── the reads ──────────────────────────────────────────────────────────── */

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const fetched: Fetch = (url, init) => fetch(url, init);

const isLine = (p: unknown): p is PatternLine => {
  const l = p as PatternLine;
  return typeof l === 'object' && l !== null && typeof l.ingest === 'string' && typeof l.said === 'string' && Number.isInteger(l.filed) && Number.isInteger(l.waiting) && Array.isArray(l.skipped) && l.skipped.every((s) => typeof s?.reason === 'string' && Number.isInteger(s.n));
};

/** The report from an answer, or `null` when the answer is not one. */
export function reportOf(said: unknown): PatternReport | null {
  const value = (said as { ok?: unknown; value?: Partial<PatternReport> } | null)?.ok === true ? (said as { value?: Partial<PatternReport> }).value : undefined;
  if (!value || !Number.isInteger(value.days) || !Array.isArray(value.doors)) return null;
  const doors = value.doors.filter(
    (d): d is DoorLine => typeof d?.door === 'string' && typeof d.said === 'string' && Number.isInteger(d.unread) && Array.isArray(d.patterns) && d.patterns.every(isLine),
  );
  return { days: value.days as number, since: String(value.since ?? ''), doors };
}

/**
 * The record's report for the last `PATTERN_DAYS`. A POST, which the host takes for any read, since the client's route
 * table is not this screen's to change. A record that does not answer one, an older host among them, is `null`, and the
 * tile is not drawn rather than drawn empty.
 */
export async function readReport(base: string, io: Fetch = fetched): Promise<PatternReport | null> {
  try {
    const res = await io(`${base}/api/inboxPatterns`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({ days: PATTERN_DAYS }),
    });
    if (!res.ok) return null;
    return reportOf(await res.json().catch(() => null));
  } catch {
    return null;
  }
}

/** The most repeats the tile offers "It is a second one" on; the record keeps the rest. */
export const REPEATS_MOST = 5;

/**
 * The newest messages skipped as a repeat, each with the record's reason, at most `REPEATS_MOST`. The record is asked
 * for its repeats alone (`repeats: true`, by the mark ingest wrote), so a page of other skips never pushes one off and a
 * marked repeat offers "It is a second one" whatever its words. A rule's skip carries no mark and never shows, and nor
 * does a repeat skipped before batch 35, which ingest kept no mark for. A record that does not answer `repeats` refuses
 * the read, and the tile draws no repeats rather than guess. The host must declare `repeats` on `inbox` as structured
 * (`ROUTES` in `@braindog/host`), or the query string's "true" reaches the record as text and is refused.
 */
export async function readRepeats(base: string, io?: Fetch): Promise<(InboxItem & { reason: string })[]> {
  try {
    const out = await createClient({ base, ...(io ? { fetch: io as typeof globalThis.fetch } : {}) }).inbox({ state: 'skipped', repeats: true, limit: REPEATS_MOST });
    if (!out.ok) return [];
    return out.value.arrivals
      .filter((a) => typeof a.repeats === 'string' && a.repeats !== '')
      .slice(0, REPEATS_MOST)
      .map((a) => ({ ...itemOf(a), reason: repeatReason(a.reason) }));
  } catch {
    return [];
  }
}
