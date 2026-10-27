/**
 * The agent door's own signs: marks the door leaves as clients connect, and what they add up to.
 *
 * WHY THIS EXISTS. For a week no client was given the tool list and nothing in the record knew: the dead week was found
 * by reading 65 client log files by hand. A mark is the door saying what happened to one session, so the record can
 * answer "how many sessions connected, were given the tools, made a call" from its own table (migration 29).
 */

import type { Sql } from '@braindog/ports';

/** The marks, a closed list: hello, given the tool list, made calls, the start hook's time, a resource list's time, a card's words, an INTERNAL answer. */
export const DOOR_KINDS = ['hello', 'listed', 'called', 'hook', 'resource', 'card', 'internal'] as const;

export type DoorKind = (typeof DOOR_KINDS)[number];

/** One mark as a surface hears it. */
export type DoorMark = { kind: DoorKind; n?: number; ms?: number; build?: string; client?: string };


/** The kinds whose `n` is a size a row keeps the most of, rather than a count it adds to (migration 29). */
const SIZES: ReadonlySet<DoorKind> = new Set<DoorKind>(['listed', 'card']);

/** How long a mark is kept: the hourly sweep deletes older ones. */
export const DOOR_KEPT_DAYS = 30;

/** The window the signs are read over when a caller names none. */
export const DOOR_WINDOW_DAYS = 7;

const DAY = 24 * 60 * 60 * 1000;

/** The longest `build` or `client` kept: a version and a name, never a paragraph a client chose to send. */
export const DOOR_TEXT_MOST = 80;

/** What the marks since an instant add up to. Every count is of sessions unless it says calls or answers. */
export type DoorSigns = {
  /** How many days the window covers, rounded. */
  days: number;
  /** Sessions that said hello. */
  hello: number;
  /** Sessions given the tool list. */
  listed: number;
  /** Sessions that made a call. */
  called: number;
  /** Calls those sessions made, all told. */
  calls: number;
  /** Each build a mark named, with how many sessions were on it, most first. */
  builds: { build: string; n: number }[];
  /** Sessions on a build other than `current`, when the reader named one; otherwise `null`. */
  behind: number | null;
  /** Answers whose code was INTERNAL. */
  internal: number;
  hookMedianMs: number | null;
  hookSlowestMs: number | null;
  resourceSlowestMs: number | null;
  /** The most words one card held. */
  cardWordsMost: number | null;
  /** The one line a person reads. */
  said: string;
  /** The lines behind it, each a plain sentence; none when there is nothing to add. */
  facts: string[];
};

const whole = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(Math.round(v), Number.MAX_SAFE_INTEGER) : null;

const text = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t.slice(0, DOOR_TEXT_MOST);
};

/**
 * Keeps one mark against `run`: one row for each run and kind, `n` added to (or for a size, the most kept), `ms` the
 * slowest, `build` and `client` the latest a mark named. A kind off the list is not kept: the record refuses it before
 * it gets here, and a surface that sends one must not break the call it rode on.
 */
export function markDoor(sql: Sql, run: string, mark: DoorMark, nowMs: number): void {
  const who = run.trim();
  if (who === '' || !(DOOR_KINDS as readonly string[]).includes(mark.kind)) return;
  const n = whole(mark.n) ?? (SIZES.has(mark.kind) ? 0 : 1);
  sql.exec(
    `INSERT INTO door_mark (run, kind, at, n, ms, build, client) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (run, kind) DO UPDATE SET
       at = excluded.at,
       n = CASE WHEN kind IN ('listed', 'card') THEN max(n, excluded.n) ELSE n + excluded.n END,
       ms = CASE WHEN excluded.ms IS NULL THEN ms WHEN ms IS NULL THEN excluded.ms ELSE max(ms, excluded.ms) END,
       build = coalesce(excluded.build, build),
       client = coalesce(excluded.client, client)`,
    who,
    mark.kind,
    new Date(nowMs).toISOString(),
    n,
    whole(mark.ms),
    text(mark.build),
    text(mark.client),
  );
}

/** A time as a person reads it: milliseconds under a second, seconds above. */
const took = (ms: number): string => (ms < 1000 ? `${String(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);

const median = (sorted: readonly number[]): number | null => {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
};

/**
 * What the marks heard since `sinceMs` add up to, read now. A session counts once for each thing it did however many
 * times it did it, so "Given the tools: 41" is 41 sessions, not 41 lists. `current` is the build the reader runs: given,
 * a session whose marks named another counts as behind. Reads only.
 *
 * NONE IS NOT ZERO FOR THE TIMES: a window with no start hook heard answers `null`, never 0 ms, so a reader can tell "no
 * session sent its time" from "it was instant".
 */
export function doorMarks(sql: Sql, sinceMs: number, nowMs: number, current?: string): DoorSigns {
  const since = new Date(Math.min(sinceMs, nowMs)).toISOString();
  /* AND NOTHING AFTER `nowMs`: a figure read as of a day past counted every mark since, later ones too (kernel-figures-43). */
  const until = new Date(nowMs).toISOString();
  const days = Math.max(1, Math.round((nowMs - Math.min(sinceMs, nowMs)) / DAY));
  const counts = new Map(
    sql
      .all<{ kind: string; runs: number; n: number; slowest: number | null }>(
        'SELECT kind, COUNT(*) AS runs, SUM(n) AS n, MAX(ms) AS slowest FROM door_mark WHERE at >= ? AND at <= ? GROUP BY kind',
        since,
        until,
      )
      .map((r) => [r.kind, { runs: Number(r.runs), n: Number(r.n ?? 0), slowest: r.slowest === null ? null : Number(r.slowest) }]),
  );
  const of = (kind: DoorKind) => counts.get(kind) ?? { runs: 0, n: 0, slowest: null };
  const hooks = sql
    .all<{ ms: number }>("SELECT ms FROM door_mark WHERE kind = 'hook' AND at >= ? AND at <= ? AND ms IS NOT NULL ORDER BY ms", since, until)
    .map((r) => Number(r.ms));
  const card = sql.one<{ most: number | null }>("SELECT MAX(n) AS most FROM door_mark WHERE kind = 'card' AND at >= ? AND at <= ?", since, until);
  /* A SESSION'S BUILD IS THE LATEST ITS MARKS NAMED, across its kinds, so one session counts once on one build. */
  const builds = sql
    .all<{ build: string; n: number }>(
      `SELECT build, COUNT(*) AS n FROM (
         SELECT run, (SELECT d.build FROM door_mark d WHERE d.run = m.run AND d.build IS NOT NULL AND d.at <= ? ORDER BY d.at DESC LIMIT 1) AS build
         FROM door_mark m WHERE m.at >= ? AND m.at <= ? GROUP BY m.run
       ) WHERE build IS NOT NULL GROUP BY build ORDER BY n DESC, build`,
      until,
      since,
      until,
    )
    .map((r) => ({ build: r.build, n: Number(r.n) }));
  const now = text(current);
  const behind = now === null ? null : builds.filter((b) => b.build !== now).reduce((sum, b) => sum + b.n, 0);
  const signs: DoorSigns = {
    days,
    hello: of('hello').runs,
    listed: of('listed').runs,
    called: of('called').runs,
    calls: of('called').n,
    builds,
    behind,
    internal: of('internal').n,
    hookMedianMs: median(hooks),
    hookSlowestMs: hooks.length === 0 ? null : hooks[hooks.length - 1]!,
    resourceSlowestMs: of('resource').slowest,
    cardWordsMost: card?.most === null || card?.most === undefined ? null : Number(card.most),
    said: '',
    facts: [],
  };
  return { ...signs, said: saidOf(signs), facts: factsOf(signs) };
}

/** "Sessions that connected in the last 7 days: 41. Given the tools: 41. Made a call: 38. Builds behind: 0." */
function saidOf(s: DoorSigns): string {
  const window = s.days === 1 ? 'the last day' : `the last ${String(s.days)} days`;
  const line = `Sessions that connected in ${window}: ${String(s.hello)}. Given the tools: ${String(s.listed)}. Made a call: ${String(s.called)}.`;
  return s.behind === null ? line : `${line} Builds behind: ${String(s.behind)}.`;
}

function factsOf(s: DoorSigns): string[] {
  const facts: string[] = [];
  if (s.calls > 0) facts.push(`${String(s.calls)} ${s.calls === 1 ? 'call' : 'calls'} in all.`);
  if (s.internal > 0) facts.push(`${String(s.internal)} ${s.internal === 1 ? 'answer' : 'answers'} failed inside BrainDog.`);
  for (const b of s.builds) facts.push(`Build ${b.build}: ${String(b.n)} ${b.n === 1 ? 'session' : 'sessions'}.`);
  if (s.hookMedianMs !== null && s.hookSlowestMs !== null)
    facts.push(`The start hook took ${took(s.hookMedianMs)} at the median and ${took(s.hookSlowestMs)} at the slowest.`);
  if (s.resourceSlowestMs !== null) facts.push(`The slowest list of resources took ${took(s.resourceSlowestMs)}.`);
  if (s.cardWordsMost !== null) facts.push(`The longest card held ${String(s.cardWordsMost)} words.`);
  return facts;
}

/** Deletes the marks last heard more than 30 days ago, and answers how many went. The hourly sweep calls it. */
export function sweepDoorMarks(sql: Sql, nowMs: number): number {
  const before = new Date(nowMs - DOOR_KEPT_DAYS * DAY).toISOString();
  const n = Number(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM door_mark WHERE at < ?', before)?.n ?? 0);
  if (n > 0) sql.exec('DELETE FROM door_mark WHERE at < ?', before);
  return n;
}
