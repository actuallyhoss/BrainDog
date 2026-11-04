/**
 * Exceptions: what a record says by itself has stopped.
 *
 * A LIST THAT TOOK ROWS MOST DAYS AND THEN TOOK NONE, a door that went quiet, a feed whose clock passed with no run, a
 * row older than the window its page declares. Each was being said only as a sentence on its own page; here they are
 * read in one place so a briefing can lead with them.
 *
 * AN ABSENCE IS ONLY EVIDENCE WHERE PRESENCE IS BEING RECORDED (`observe.ts`, whose reading this shares). Every
 * detector asks first whether the thing was arriving, and says nothing about a thing that never was: a list written to
 * once, a door that took one message, a feed that never ran well and a record three days old all answer none.
 *
 * COMPUTED AT READ, STORED NOWHERE. An exception has no table, so it has nothing to go out of date and nothing to
 * close: when a row arrives, the next read does not find it. They are candidates for a briefing and never questions.
 *
 * IT NAMES NO LIST. The lists to watch, their names and their windows are handed in; the doors and the feeds are the
 * ones the record's declarations say. A model that did not answer is not read here at all: that is the health of the
 * engine, and never something the person's record stopped doing.
 */

import type { Sql } from '@braindog/ports';

import { windowMs } from './metrics.ts';
import { lastPresence, presenceOf, type PresenceSource } from './observe.ts';
import { intervalMs } from './pull.ts';

const DAY_MS = 86_400_000;

/** The most lists one read looks at. The ones past it are not read, and a caller that has more says so itself. */
export const LISTS_A_READ = 50;
/** The most doors and the most feeds one read looks at, for the same reason. */
const DECLARED_A_READ = 50;
/** The most out-of-date rows one list answers, the ones that went out of date last. */
const STALE_A_LIST = 5;

/** Presence is `PRESENT_DAYS` separate days of the `WINDOW_DAYS` ending on the last one, and quiet is `QUIET_DAYS` since. */
const WINDOW_DAYS = 14;
const PRESENT_DAYS = 5;
const QUIET_DAYS = 3;

/** A list to watch: its id, the name a person calls it, and the window its page declares with `stale`, when one does. */
export type Watched = { id: string; name: string; stale?: { field: string; after: string } };

/**
 * What presence was before it stopped: the days of the window that carried something, the period a feed runs on, or
 * the window a page declares.
 */
export type Was = { days: number; of: number } | { everyMs: number } | { afterMs: number };

export type Exception = {
  kind: 'list' | 'door' | 'schedule' | 'stale';
  /** The handle of what stopped: a list's id, a door's, a feed's declaration, or a list and its row. Never shown. */
  subject: string;
  /** What a person calls it, when the record holds a name for it. */
  name: string | null;
  /** The day it was last present, in UTC. */
  since: string;
  was: Was;
  /** `quiet:<kind>:<subject>`, the same on every read while it stays open. */
  cause: string;
  /** The row to open: a list's newest, or the one out of date. `null` for a door and a feed. */
  row: string | null;
};

const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

const made = (kind: Exception['kind'], subject: string, name: string | null, since: string, was: Was, row: string | null): Exception => ({
  kind,
  subject,
  name,
  since,
  was,
  cause: `quiet:${kind}:${subject}`,
  row,
});

/**
 * Whether `key` was arriving and then stopped: its last day, and how many of the fourteen days ending on it carried
 * something. `null` when it is still arriving, or when it never was.
 *
 * THE WINDOW ENDS ON THE LAST DAY AND NOT ON TODAY. Counted back from today, a list quiet for a fortnight has an empty
 * window and reads as one nobody ever used, which is the exact case this exists to catch.
 */
function stopped(sql: Sql, source: PresenceSource, key: string, nowMs: number): { since: string; was: Was } | null {
  const last = lastPresence(sql, source, key);
  const lastMs = last === null ? Number.NaN : Date.parse(last);
  if (!Number.isFinite(lastMs) || nowMs - lastMs < QUIET_DAYS * DAY_MS) return null;
  const since = dayOf(lastMs);
  const end = Date.parse(`${since}T00:00:00Z`);
  const seen = presenceOf(sql, source, key, dayOf(end - (WINDOW_DAYS - 1) * DAY_MS), dayOf(end + DAY_MS));
  if (seen.days < PRESENT_DAYS) return null;
  return { since, was: { days: seen.days, of: WINDOW_DAYS } };
}

/** The lists that took rows and stopped, each with its newest row. */
function quietLists(sql: Sql, nowMs: number, lists: readonly Watched[]): Exception[] {
  const out: Exception[] = [];
  for (const list of lists) {
    const s = stopped(sql, 'rows', list.id, nowMs);
    if (s === null) continue;
    const newest = sql.one<{ id: string }>('SELECT id FROM entry WHERE register = ? ORDER BY created_at DESC, id DESC LIMIT 1', list.id);
    out.push(made('list', list.id, list.name, s.since, s.was, newest?.id ?? null));
  }
  return out;
}

/**
 * The doors that took messages and stopped. A door is a pattern that takes messages in; a pull is a feed, below.
 *
 * PATTERNS THAT SHARE A DOOR (`door` on the declaration) ARE ONE WAY IN: one kind of message not coming while others come
 * through the same address is not a way in that stopped, as the sign `doors-silent` reads it. And a pattern with no name
 * of its own is said by its id's words: Today said "a way in with no name" for a door the sign called bank ipn out sms.
 */
function quietDoors(sql: Sql, nowMs: number): Exception[] {
  const doors = sql.all<{ ingest: string | null; door: string | null; name: string | null }>(
    `SELECT json_extract(body, '$.ingest') AS ingest, json_extract(body, '$.door') AS door, json_extract(body, '$.name') AS name FROM declaration
      WHERE kind = 'ingest' AND superseded_at IS NULL AND retired = 0 AND json_valid(body)
        AND json_extract(body, '$.channel') IN ('email', 'webhook', 'api', 'paste') ORDER BY id LIMIT ?`,
    DECLARED_A_READ,
  );
  const doorOf = (d: { ingest: string | null; door: string | null }): string => (typeof d.door === 'string' && d.door !== '' ? d.door : (d.ingest ?? ''));
  /* A WAY IN STILL TAKING MESSAGES, by any of its patterns: read from the same presence the stop is read from. */
  const open = new Set<string>();
  for (const d of doors) {
    if (typeof d.ingest !== 'string') continue;
    const last = lastPresence(sql, 'arrivals', d.ingest);
    const lastMs = last === null ? Number.NaN : Date.parse(last);
    if (Number.isFinite(lastMs) && nowMs - lastMs < QUIET_DAYS * DAY_MS) open.add(doorOf(d));
  }
  const out: Exception[] = [];
  for (const d of doors) {
    if (typeof d.ingest !== 'string' || open.has(doorOf(d))) continue;
    const s = stopped(sql, 'arrivals', d.ingest, nowMs);
    if (s !== null) out.push(made('door', d.ingest, typeof d.name === 'string' && d.name !== '' ? d.name : d.ingest.replace(/[-_.:]+/g, ' ').trim(), s.since, s.was, null));
  }
  return out;
}

/**
 * The feeds on a clock whose time passed by more than their period with no run that ended well.
 *
 * A FEED'S TIME IS ITS LAST GOOD RUN AND ONE PERIOD, so it is an exception once two periods have gone by: one period
 * late is a late run. A failed run is not a run. A FEED THAT NEVER RAN WELL IS NOT ONE: nothing was arriving, so
 * nothing stopped, and the vital sign for feeds that are behind already counts it.
 */
function quietFeeds(sql: Sql, nowMs: number): Exception[] {
  const rows = sql.all<{ kind: string; key: string }>(
    "SELECT kind, key FROM schedule WHERE kind IN ('pull', 'call', 'poll', 'script') AND state <> 'done' ORDER BY kind, key LIMIT ?",
    DECLARED_A_READ,
  );
  const out: Exception[] = [];
  for (const row of rows) {
    const id = `${row.kind === 'script' ? 'script' : 'ingest'}.${row.key}`;
    const decl = sql.one<{ body: string }>('SELECT body FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0 ORDER BY version DESC LIMIT 1', id);
    if (decl === undefined) continue;
    let body: { name?: unknown; every?: unknown; runs?: { every?: unknown } } = {};
    try {
      body = JSON.parse(decl.body) as typeof body;
    } catch {
      continue;
    }
    const every = intervalMs(String((row.kind === 'script' ? body.runs?.every : body.every) ?? ''));
    if (every === null) continue;
    const good = sql.one<{ ts: string | null }>(
      `SELECT max(ts) AS ts FROM event WHERE kind = 'pull' AND target = ? AND json_valid(to_v) AND json_extract(to_v, '$.outcome') = 'ok'`,
      `declaration:${id}`,
    )?.ts;
    const filed = row.kind === 'script' ? null : lastPresence(sql, 'arrivals', row.key);
    const ran = [good, filed].flatMap((t) => (typeof t === 'string' && Number.isFinite(Date.parse(t)) ? [Date.parse(t)] : []));
    if (ran.length === 0) continue;
    const lastMs = Math.max(...ran);
    if (nowMs - lastMs <= 2 * every) continue;
    out.push(made('schedule', id, typeof body.name === 'string' ? body.name : null, dayOf(lastMs), { everyMs: every }, null));
  }
  return out;
}

/**
 * The rows whose day is older than the window their page declares, at most `STALE_A_LIST` a list, the ones that went
 * out of date last first. The field and the window are the ones handed in, so the add-on says both and nothing here
 * knows what a day on any list means. A list that declares neither is not read.
 */
function staleRows(sql: Sql, nowMs: number, lists: readonly Watched[]): Exception[] {
  const out: Exception[] = [];
  for (const list of lists) {
    if (list.stale === undefined) continue;
    const afterMs = windowMs(list.stale.after);
    if (afterMs === null || !/^[a-z][a-z0-9_]*$/.test(list.stale.field)) continue;
    const rows = sql.all<{ id: string; day: string }>(
      `SELECT id, substr(json_extract(fields, ?), 1, 10) AS day FROM entry
        WHERE register = ? AND deleted_at IS NULL AND substr(json_extract(fields, ?), 1, 10) GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
          AND substr(json_extract(fields, ?), 1, 10) < ? ORDER BY 2 DESC, id LIMIT ?`,
      `$.${list.stale.field}`,
      list.id,
      `$.${list.stale.field}`,
      `$.${list.stale.field}`,
      dayOf(nowMs - afterMs),
      STALE_A_LIST,
    );
    for (const r of rows) out.push(made('stale', `${list.id}/${r.id}`, list.name, r.day, { afterMs }, r.id));
  }
  return out;
}

/**
 * The exceptions open on this record now, the longest quiet first.
 *
 * `lists` are the lists to watch, at most `LISTS_A_READ` of them read; the doors and the feeds are the record's own.
 * Nothing is written, so two reads a second apart agree, and a read after presence returns does not hold what closed.
 */
export function openExceptions(sql: Sql, nowMs: number, lists: readonly Watched[]): Exception[] {
  const watched = lists.slice(0, LISTS_A_READ);
  const found = [...quietLists(sql, nowMs, watched), ...quietDoors(sql, nowMs), ...quietFeeds(sql, nowMs), ...staleRows(sql, nowMs, watched)];
  return found.sort((a, b) => (a.since < b.since ? -1 : a.since > b.since ? 1 : a.cause < b.cause ? -1 : a.cause > b.cause ? 1 : 0));
}
