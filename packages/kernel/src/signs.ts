/**
 * The record's vital signs: a short closed list of readings about the record itself, each
 * green, red or none, read on demand and kept a row a day in `sign_reading` (migration 27).
 *
 * WHY THIS EXISTS. His record stood still for nine days after the move, 32 messages waited, 17 of 25 open questions were
 * one question, and every gate stayed green, because every gate drew an invented record. "A daily check watches all of
 * that and says so in the app when one fails". These are that check, and every record has them: nothing here
 * names a list, a bank or a use case.
 *
 * FIVE ARE READ HERE, OVER THE KERNEL'S OWN TABLES: arrivals, numbers, questions by cause, the oldest question, runs.
 * FIVE ARE FILED by the layers that know more, through `fileSignReading`: whether the model answers and whether agents
 * get the tool list (the host), whether the briefing is true (the record), whether pages print clean (the host), whether
 * what shipped has arrived (the record). Until one is filed it reads `none`. The automation signs and those of
 * what runs by itself join by a spread each (`signs-flow.ts`, `signs-actions.ts`), then the three vitals of SHL-A06
 * (`signs-vitals.ts`).
 *
 * NONE IS NOT GREEN. A sign with nothing to judge by (no door, no series, no question ever asked, no run this week)
 * says so, and an empty record reads `none` on every sign by construction. Each reader is its own count, written apart
 * from the code it watches (`built-in-figures.ts` reads arrivals too, and this does not call it), so a fault that sets
 * the flag a sign would read cannot also turn the sign green.
 *
 * EVERY THRESHOLD IS ONE LINE BELOW, and `tools/mutate.mjs` moves each by one and expects `test/signs-read.test.ts` to
 * go red. `rule` on a reading is a hash of its reader's thresholds and version, so a day judged by an older rule can
 * be told apart from one judged by today's.
 */

import { SESSIONLESS_SQL } from './presence.ts';
import type { Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';
import { jsonPath, unprivate } from '@braindog/where';

import { BUILT_IN_FIGURES, readRatesAge } from './built-in-figures.ts';
import { homeCurrency } from './declare.ts';
import { nextOccurrence } from './digest.ts';
import { dayIn } from './finished.ts';
import { UNVERIFIED } from './ingest.ts';
import { RATE_STALE_DAYS, ratesFrom, type Rate } from './fx.ts';
import { openRunsHeard } from './presence.ts';
import { intervalMs } from './pull.ts';
import { ratesFeed, ratesFeedSaid } from './rates-feed.ts';
import { ratesRole, type RoleList } from './roles.ts';
import { SIGNS_ACTIONS } from './signs-actions.ts';
import { SIGNS_FLOW } from './signs-flow.ts';
import { SIGNS_VITALS } from './signs-vitals.ts';
import { NEVER_FILED } from './sources/signs.ts';

export type SignState = 'green' | 'red' | 'none';

/** One sign as a person and the CLI read it: now, plus the last fourteen days, oldest first. */
export type VitalSign = {
  sign: string;
  name: string;
  state: SignState;
  value: number | null;
  said: string;
  facts: string[];
  days: { day: string; state: SignState }[];
  /** The counts a filed sign carries beside its value (`SIGN_COUNTS`), when its filing held any. */
  counts?: Record<string, number>;
  /** Where a person goes to mend it, a path in this app, when its reader knows one (`SignReading.to`). */
  to?: string;
};

/** What a reader answers, and what the record or host files through `fileSignReading`. */
export type SignReading = {
  state: SignState;
  value: number | null;
  said: string;
  facts?: string[];
  counts?: Readonly<Record<string, number>>;
  /**
   * THE HEADING THIS READING IS SAID UNDER, when it is not the check's own name (30 October): the record's own failure
   * ("The backup on 3 Sep did not run") was headed "Each problem is asked once", the name of the check that caught it.
   */
  named?: string;
  /**
   * WHERE A PERSON GOES TO MEND IT, a path in this app (31 October, AG7): Health's "Something did not work" over "The
   * backup on 3 Sep did not run" had nothing to press, while Needs you held the same question with "Run it now".
   */
  to?: string;
};

/**
 * THE COUNTS A FILED SIGN MAY CARRY BESIDE ITS ONE VALUE, a closed list a sign, each with the words a person reads it
 * by. `pages-clean` carries the pages census's four: its value stays the number of faults, and these
 * say which kind. Each is a whole number of nought or more, and a filing may leave one out when nobody counted it.
 * Kept in the row's `facts`, as its last entry and the one that is not a line (`{ counts }`), so no column is added.
 */
export const SIGN_COUNTS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'pages-clean': {
    refused_pages: 'pages show a block that could not be read',
    unnamed_pages: 'pages print a path that names nothing',
    missing_pages: 'pages this BrainDog does not hold',
    suggested_waiting: 'suggested pages wait',
  },
};

/** The key the nightly `snapshot` row is armed under, payload `{ signs: true }`. */
export const SIGNS_KEY = 'signs';

/** Who reads a sign: the kernel itself, or the layer that files it. */
export type SignHand = 'kernel' | 'record' | 'host';

/**
 * HOW LONG A READING STANDS BY THE CLOCK ALONE, told by its reader: the first instant at which the same rows could read
 * otherwise because time moved (a message turning a day old, a feed a period late, a window letting a run go), or
 * `Infinity` when only a write or the day where the record is can move it. Told more than once, the earliest stands.
 *
 * WHY. Today's "signs need a look" read every sign again on every open, because each was held 30 s at most: a sign may
 * say how long ago something was. A reader that knows when its answer moves says so here, and the kernel holds its
 * reading until then or until something it read is written (`held-signs.ts`). A reader that tells nothing is read again
 * after 30 s, as before, so a sign nobody taught this is never held past what it was.
 */
export type SignLasts = (until: number) => void;

/** A sign on the closed list: its id, its name, who reads it, and for the kernel's own the reader and its thresholds. */
export type SignReader = {
  sign: string;
  name: string;
  hand: SignHand;
  version: number;
  thresholds: Readonly<Record<string, number>>;
  read: ((sql: Sql, nowMs: number, tz: string, lasts?: SignLasts) => SignReading) | null;
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** The instant an ISO time crosses a line `ms` after it, or `Infinity` for none: a time that cannot be read never crosses. */
const crossesAt = (at: string | null | undefined, ms: number): number => {
  const t = typeof at === 'string' ? Date.parse(at) : Number.NaN;
  return Number.isNaN(t) ? Infinity : t + ms;
};

/* ── the thresholds, one line each, as 2.2 of  sets them ───────────────── */

/** An arrival waits once it is older than this and still unfiled. */
export const ARRIVAL_WAIT_MS = DAY;
/** Red when this many arrivals or more wait: one text unfiled past a day is already one the person must file by hand. */
export const ARRIVALS_WAITING_MOST = 1;
/** Red when an arrival is more than this newer than the newest entry of the list its pattern files into. */
export const ARRIVAL_AHEAD_MS = DAY;
/** The window arrivals are judged over: with no door, or none arrived in it and none waiting, nothing to judge by. */
export const ARRIVALS_WINDOW_DAYS = 14;

/** A feed is late when its last good run is older than this many of its periods. */
export const FEED_LATE_PERIODS = 2;
/** A series counts once it has held this many numbers; one younger counts only when a feed declares how often it comes. */
export const SERIES_POINTS_LEAST = 5;
/** A series is stale when its newest number is older than this many of its usual gaps... */
export const SERIES_GAP_TIMES = 3;
/** ...and older than this many days. */
export const SERIES_STALE_DAYS = 3;
/** Red when one in this many series or more is stale (a quarter). */
export const SERIES_STALE_ONE_IN = 4;

/** Red when one cause holds more than this many open questions. */
export const CAUSE_QUESTIONS_MOST = 1;
/** Red when more than this many open questions carry no cause. */
export const UNCAUSED_MOST = 3;

/** Red when the oldest open question is older than this many days, the mark the queue already draws (`pages.ts`). */
export const QUESTION_DAYS_MOST = 14;

/** Runs of this many days are judged. */
export const RUNS_WINDOW_DAYS = 7;
/** Red when a run is still open this long after it was last heard from (the sweep writes it off at twelve hours). */
export const RUN_SILENT_MS = 12 * HOUR;
/** The abandoned share is judged once this many runs have ended... */
export const RUNS_ENDED_LEAST = 8;
/** ...and red when more than one in this many ended as lost (a quarter): abandoned, or handed off by the sweep. */
export const RUNS_ABANDONED_ONE_IN = 4;

/**
 * Red when the newest exchange rate is more than this many days old: the line `fx.ts` marks a converted figure stale
 * at, the one the `rates-age-days` figure's own note names, imported so the sign and the figure cannot drift apart.
 */
export const RATES_STALE_DAYS = RATE_STALE_DAYS;

/** A filed reading stands for now this long after it was filed. A layer that files once a night files again before it is up. */
export const FILED_STANDS_MS = DAY;

/* ── helpers ───────────────────────────────────────────────────────────── */

const reading = (state: SignState, value: number | null, said: string, facts: string[] = [], counts?: Record<string, number>): SignReading =>
  counts === undefined ? { state, value, said, facts: facts.slice(0, 6) } : { state, value, said, facts: facts.slice(0, 6), counts };

/** A row's `facts` as kept: its lines, and the counts a filed sign carried as the one entry that is not a line. */
function factsOf(text: string): { facts: string[]; counts?: Record<string, number> } {
  const kept = JSON.parse(text) as unknown;
  if (!Array.isArray(kept)) return { facts: [] };
  const facts = kept.filter((f) => typeof f !== 'object' || f === null).map(String);
  const box = kept.find((f): f is { counts: unknown } => typeof f === 'object' && f !== null && 'counts' in f);
  if (box === undefined || typeof box.counts !== 'object' || box.counts === null) return { facts };
  const counts = Object.fromEntries(Object.entries(box.counts as Record<string, unknown>).filter(([, n]) => Number.isSafeInteger(n) && (n as number) >= 0)) as Record<string, number>;
  return { facts, counts };
}

/** `n thing` or `n things`. */
const count = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** A day a person reads, in the record's zone: `28 September`, with the year when it is not this one. */
export function dateSaid(at: string | number, tz: string, nowMs: number): string {
  const ms = typeof at === 'number' ? at : Date.parse(at);
  const zone = safeZone(tz);
  const year = (x: number) => new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric' }).format(x);
  const opts: Intl.DateTimeFormatOptions = { timeZone: zone, day: 'numeric', month: 'long', ...(year(ms) === year(nowMs) ? {} : { year: 'numeric' }) };
  return new Intl.DateTimeFormat('en-GB', opts).format(ms);
}

/** A zone this runtime can read, or UTC. */
function safeZone(tz: string): string {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

/** The calendar day before `day`, both `YYYY-MM-DD`. */
export const dayBefore = (day: string, back = 1): string => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d - back)).toISOString().slice(0, 10);
};

/** FNV-1a over a string, 32 bits as eight hex digits: the rule's fingerprint, not a secret, and no `node:crypto`. */
function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/** The hash of a reader's thresholds and version that a reading is stamped with. */
export const ruleOf = (r: Pick<SignReader, 'sign' | 'version' | 'thresholds'>): string =>
  fnv(JSON.stringify([r.sign, r.version, Object.entries(r.thresholds).sort(([a], [b]) => a.localeCompare(b))]));

/** A JSON body, or `null` when it is not one. */
function parsed(text: string | null | undefined): Record<string, unknown> | null {
  if (typeof text !== 'string') return null;
  try {
    const v: unknown = JSON.parse(text);
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A list's name and its word for one entry, from its live declaration, or the id said plainly when it has none. */
function listWords(sql: Sql, register: string): { name: string; one: string } {
  const row = sql.one<{ name: string | null; one: string | null }>(
    "SELECT json_extract(body, '$.name') AS name, json_extract(body, '$.one') AS one FROM declaration WHERE id = ? AND superseded_at IS NULL AND json_valid(body)",
    `register.${register}`,
  );
  return { name: typeof row?.name === 'string' ? row.name : plain(register), one: typeof row?.one === 'string' ? row.one : 'entry' };
}

/** An id said as words: `bank-sms` is `bank sms`. Only where nothing declares a name. */
const plain = (id: string): string => id.replace(/[-_.:]+/g, ' ').trim();

/* ── arrivals-filed ────────────────────────────────────────────────────── */

/* An arrival nothing verified (`ingest.ts`'s `UNVERIFIED`) is the sender's fault and waits on nobody. */
const VOUCHED = "(state <> 'untriaged' OR reason IS NULL OR reason <> ?)";

function readArrivals(sql: Sql, nowMs: number, tz: string, lasts: SignLasts = () => undefined): SignReading {
  lasts(Infinity);
  /* THE DOORS AND THE LISTS EACH FEEDS: an installed pattern that takes messages in, and where it files. */
  const fed = new Map<string, Set<string>>();
  /* AND THE PATTERNS THAT FILE INTO EACH LIST: a message another list's pattern filed says nothing of this one. */
  const by = new Map<string, Set<string>>();
  for (const r of sql.all<{ body: string }>(
    `SELECT body FROM declaration WHERE kind = 'ingest' AND superseded_at IS NULL AND retired = 0 AND json_valid(body)
       AND json_extract(body, '$.channel') IN ('email', 'webhook', 'api', 'paste')`,
  )) {
    const body = parsed(r.body);
    const channel = String(body?.channel);
    const target = (body?.writes as { register?: unknown } | undefined)?.register;
    const lists = typeof target === 'string' ? [target] : Array.isArray((target as { to?: unknown })?.to) ? ((target as { to: { register?: unknown }[] }).to.map((t) => t.register)) : [];
    for (const list of lists)
      if (typeof list === 'string') {
        fed.set(list, (fed.get(list) ?? new Set()).add(channel));
        if (typeof body?.ingest === 'string') by.set(list, (by.get(list) ?? new Set()).add(body.ingest));
      }
  }
  const waiting = sql.all<{ ts: string; reason: string | null }>(
    `SELECT ts, reason FROM inbox_raw WHERE state IN ('untriaged', 'review', 'proposed') AND ts <= ? AND ${VOUCHED} ORDER BY ts`,
    new Date(nowMs - ARRIVAL_WAIT_MS).toISOString(),
    UNVERIFIED,
  );
  /* THE NEXT MESSAGE TO TURN A DAY OLD UNFILED moves this reading by the clock alone (`SignLasts`). */
  lasts(
    crossesAt(
      sql.one<{ ts: string | null }>(
        `SELECT min(ts) AS ts FROM inbox_raw WHERE state IN ('untriaged', 'review', 'proposed') AND ts > ? AND ${VOUCHED}`,
        new Date(nowMs - ARRIVAL_WAIT_MS).toISOString(),
        UNVERIFIED,
      )?.ts,
      ARRIVAL_WAIT_MS,
    ),
  );
  /* NO PATTERN IS NOT NOTHING TO JUDGE BY WHILE MESSAGES WAIT: a pattern retired or lost leaves them waiting all the same. */
  if (fed.size === 0 && waiting.length === 0) return reading('none', null, 'Nothing takes messages in yet.');
  const since = new Date(nowMs - ARRIVALS_WINDOW_DAYS * DAY).toISOString();
  const window = sql.one<{ n: number; first: string | null }>(`SELECT count(*) AS n, min(ts) AS first FROM inbox_raw WHERE state <> 'erased' AND ts >= ? AND ${VOUCHED}`, since, UNVERIFIED);
  const recent = Number(window?.n ?? 0);
  /* AND THE OLDEST MESSAGE IN THE WINDOW LEAVING IT. */
  lasts(crossesAt(window?.first, ARRIVALS_WINDOW_DAYS * DAY));
  if (waiting.length === 0 && recent === 0) return reading('none', null, `Nothing has come in for ${ARRIVALS_WINDOW_DAYS} days, so there is nothing to judge by.`);

  /* EACH FED LIST AGAINST THE NEWEST MESSAGE AT ITS DOORS THAT WAS NOT SET ASIDE: one filed is in the list, one waiting is not. */
  const behind: string[] = [];
  const facts: string[] = [];
  for (const [list, channels] of fed) {
    const { name, one } = listWords(sql, list);
    const newest = sql.one<{ at: string | null }>('SELECT max(created_at) AS at FROM entry WHERE register = ? AND deleted_at IS NULL', list)?.at ?? null;
    /* A MESSAGE FILED COUNTS FOR THE LIST ITS PATTERN WROTE INTO; one still waiting holds every list at its door behind.
       THE PATTERNS AND THE DOORS GO IN AS ONE JSON LIST EACH, read by `json_each`, never a `?` apiece: a Durable Object
       refuses a statement with more than 100 bound values, and a list fed by a hundred patterns threw the night's whole
       read of signs. An empty list of patterns matches nothing, as `IN ()` would. */
    const came = sql.one<{ at: string | null }>(
      `SELECT max(r.ts) AS at FROM inbox_raw r
       WHERE ((r.state = 'matched' AND EXISTS (SELECT 1 FROM ingest_receipt x WHERE x.raw_id = r.id AND x.ingest_id IN (SELECT value FROM json_each(?))))
         OR (r.state IN ('untriaged', 'review', 'proposed') AND r.channel IN (SELECT value FROM json_each(?)))) AND ${VOUCHED}`,
      JSON.stringify([...(by.get(list) ?? [])]),
      JSON.stringify([...channels]),
      UNVERIFIED,
    )?.at ?? null;
    const has = newest === null ? `${name} has no ${one} yet` : `The newest ${one} in ${name} is from ${dateSaid(newest, tz, nowMs)}`;
    facts.push(`${has}.`);
    if (came !== null && (newest === null || Date.parse(came) - Date.parse(newest) > ARRIVAL_AHEAD_MS)) behind.push(has);
  }

  /* A DAY OF ARRIVALS ALL SET ASIDE AS REPEATS IS NOT A DAY FILED. A repeat is the record's own call, and a dedupe that
     matches every text leaves nothing waiting and nothing filed. A pattern's `skip` rule (a refund, a PIN reminder) is
     the person's declared call, so a day of only those is a quiet day and is not judged here: it would read red for two
     weeks on a bank that sends one. The day judged is the one up to the newest arrival no rule skipped, so a quiet day
     after it does not hide it. A repeat is known by its newest `match` line, marked `repeats` by ingest. */
  const RULED = `(state = 'skipped' AND coalesce((SELECT e.field FROM event e WHERE e.target = 'inbox_raw:' || inbox_raw.id AND e.kind = 'match'
     ORDER BY e.rowid DESC LIMIT 1), '') <> 'repeats')`;
  const at = sql.one<{ at: string | null }>(`SELECT max(ts) AS at FROM inbox_raw WHERE state <> 'erased' AND ts >= ? AND ${VOUCHED} AND NOT ${RULED}`, since, UNVERIFIED)?.at ?? null;
  const day =
    at === null
      ? []
      : sql.all<{ state: string; reason: string | null }>(
          `SELECT state, reason FROM inbox_raw WHERE state <> 'erased' AND ts > ? AND ts <= ? AND ${VOUCHED} AND NOT ${RULED}`,
          new Date(Date.parse(at) - DAY).toISOString(),
          at,
          UNVERIFIED,
        );
  const aside = day.filter((r) => r.state === 'skipped');
  const allAside = day.length > 0 && aside.length === day.length;
  const on = at === null ? '' : dateSaid(at, tz, nowMs);
  const asideSaid = !allAside ? '' : aside.length === 1 ? `The only message in the day up to ${on} was set aside as a repeat, not filed.` : `All ${aside.length} messages in the day up to ${on} were set aside as repeats. None was filed.`;
  const why = new Map<string, number>();
  for (const r of allAside ? aside : []) if (r.reason) why.set(r.reason, (why.get(r.reason) ?? 0) + 1);
  const top = [...why].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (top !== undefined) facts.push(top.length > 140 ? `${top.slice(0, 139)}…` : top);

  const reasons = new Map<string, number>();
  for (const w of waiting) if (w.reason) reasons.set(w.reason, (reasons.get(w.reason) ?? 0) + 1);
  const most = [...reasons].sort((a, b) => b[1] - a[1])[0];
  if (waiting.length > 0) facts.unshift(`The oldest has waited since ${dateSaid(waiting[0]!.ts, tz, nowMs)}.`);
  const red = waiting.length >= ARRIVALS_WAITING_MOST || behind.length > 0 || allAside;
  if (!red)
    return reading('green', waiting.length, waiting.length === 0 ? 'Every message has been filed or set aside within a day.' : `${count(waiting.length, 'message has', 'messages have')} waited more than a day. Every other one is filed.`, facts);
  /* ONE LIST BEHIND IN THE SENTENCE; every list's newest is in the facts. */
  const said = [
    waiting.length > 0 ? `${count(waiting.length, 'message has', 'messages have')} waited more than a day.` : allAside ? '' : 'Messages came in that no list holds yet.',
    asideSaid,
    ...behind.slice(0, 1).map((b) => `${b}.`),
    most && most[1] > 1 ? `Most say: ${most[0].length > 140 ? `${most[0].slice(0, 139)}…` : most[0]}` : '',
  ];
  return reading('red', waiting.length === 0 && allAside ? aside.length : waiting.length, said.filter((s) => s !== '').join(' '), facts);
}

/* ── numbers-arrive ────────────────────────────────────────────────────── */

/** Every feed on a clock: its name, its period, and when it last ran well (from when it was armed, if never). */
function feedsOn(sql: Sql): { name: string; everyMs: number; lastGoodMs: number }[] {
  const out: { name: string; everyMs: number; lastGoodMs: number }[] = [];
  for (const row of sql.all<{ kind: string; key: string }>("SELECT kind, key FROM schedule WHERE kind IN ('pull', 'call', 'poll', 'script') AND state <> 'done' ORDER BY key")) {
    const id = `${row.kind === 'script' ? 'script' : 'ingest'}.${row.key}`;
    const decl = sql.one<{ body: string; created_at: string }>('SELECT body, created_at FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0', id);
    const body = parsed(decl?.body);
    if (decl === undefined || body === null) continue;
    /* A SCRIPT WHOSE EGRESS IS EMPTY FETCHES NOTHING: a daily script over the record's own rows is not a feed, and
       its quiet days would read as numbers that did not arrive. */
    if (row.kind === 'script' && Array.isArray(body.egress) && body.egress.length === 0) continue;
    const every = intervalMs(String((row.kind === 'script' ? (body.runs as { every?: unknown } | undefined)?.every : body.every) ?? ''));
    if (every === null) continue;
    const good = sql.one<{ ts: string | null }>(
      "SELECT max(ts) AS ts FROM event WHERE kind = 'pull' AND target = ? AND json_valid(to_v) AND json_extract(to_v, '$.outcome') = 'ok'",
      `declaration:${id}`,
    )?.ts;
    const filed = row.kind === 'script' ? null : sql.one<{ ts: string | null }>('SELECT max(ts) AS ts FROM ingest_receipt WHERE ingest_id = ?', row.key)?.ts;
    const last = [good, filed, decl.created_at].filter((t): t is string => typeof t === 'string').map((t) => Date.parse(t));
    const name = [body.description, body.name].find((n): n is string => typeof n === 'string' && n.trim() !== '') ?? plain(row.key);
    out.push({ name, everyMs: every, lastGoodMs: Math.max(...last) });
  }
  return out;
}

/** A series' name: the figure that declares it, or its id said plainly. */
function seriesName(sql: Sql, series: string): string {
  const n = sql.one<{ name: string | null }>(
    "SELECT json_extract(body, '$.name') AS name FROM declaration WHERE kind = 'metric' AND superseded_at IS NULL AND json_valid(body) AND json_extract(body, '$.metric') = ?",
    series,
  )?.name;
  return typeof n === 'string' ? n : plain(series);
}

/* A NUMBER THAT ARRIVED, NOT ONE THE RECORD WROTE OF ITSELF. A figure's nightly reading (`metrics.ts`, under the figure's
   own id and source) is written every night over whatever its list holds, stale or not, so it is never late: counted
   here it would be a series that cannot go red, and enough of them would hide a quarter gone quiet.
   The figures' (series, source) pairs are read once per query, not once per point: parsing every declaration for
   every point was most of a night's signs read on a record with a few thousand points. */
/* AND EACH (series, source) PAIR IS JUDGED ONCE, not once per point: a point was matched against every figure, 161
   figures by 11,624 points on a lived record, 45 ms a query and three queries a read of the signs. The pairs that
   arrived are kept beside the figures' and a point is asked only whether its pair is one of them. */
/* AND NOT WHAT THE NIGHT COUNTS OF THE RECORD ITSELF (`night-counts.ts`, sources night.counts and night.paths): written every night, it can never be late. */
const DECLARED = `WITH declared AS MATERIALIZED (SELECT json_extract(body, '$.metric') AS m, json_extract(body, '$.source') AS s
  FROM declaration WHERE kind = 'metric' AND superseded_at IS NULL AND json_valid(body)),
  arrived AS MATERIALIZED (SELECT series, source FROM (SELECT DISTINCT series, source FROM metric_point) mp
    WHERE NOT EXISTS (SELECT 1 FROM declared d WHERE d.m = mp.series AND d.s = mp.source) AND mp.source NOT LIKE 'night.%')`;
const ARRIVED = '(mp.series, mp.source) IN (SELECT series, source FROM arrived)';

/**
 * NOTHING BRINGS NUMBERS IN ON A SCHEDULE, said as that. A record whose numbers were typed or imported holds thousands
 * of them, and "No numbers come in on this record yet" stood over 2,527. The sign judges what
 * arrives on a clock, so that is what it says is missing.
 */
const NO_NUMBER_FEED = 'No number arrives on a schedule yet, so there is nothing to judge by.';

function readNumbers(sql: Sql, nowMs: number, tz: string, lasts: SignLasts = () => undefined): SignReading {
  lasts(Infinity);
  const feeds = feedsOn(sql);
  const late = feeds.filter((f) => nowMs - f.lastGoodMs > FEED_LATE_PERIODS * f.everyMs);
  /* A FEED ON TIME IS LATE BY THE CLOCK ALONE once two of its periods pass with no good run (`SignLasts`). */
  for (const f of feeds) if (!late.includes(f)) lasts(f.lastGoodMs + FEED_LATE_PERIODS * f.everyMs + 1);

  /* EVERY SERIES THAT EVER HELD ENOUGH NUMBERS TO HAVE A USUAL GAP, the median of its last thirty. */
  const series = sql.all<{ series: string; newest: string }>(
    `${DECLARED} SELECT series, max(at) AS newest FROM metric_point mp WHERE ${ARRIVED} GROUP BY series HAVING count(DISTINCT at) >= ? ORDER BY series`,
    SERIES_POINTS_LEAST,
  );
  /* AND A SERIES TOO YOUNG FOR A USUAL GAP, WHEN A FEED DECLARES HOW OFTEN IT COMES: its gap is the feed's `every`. A
     feed that runs well and writes no number is late only here, and a new one is new for exactly the weeks it matters.
     Its feed is the one that wrote its newest number (`writePoints` stamps `ingest:<key>`). */
  const young = sql.all<{ series: string; newest: string; every: string | null }>(
    `${DECLARED}, young AS (SELECT series, max(at) AS newest FROM metric_point mp WHERE ${ARRIVED} GROUP BY series HAVING count(DISTINCT at) < ?)
     SELECT y.series, y.newest, json_extract(d.body, '$.every') AS every FROM young y
       JOIN metric_point p ON p.series = y.series AND p.at = y.newest AND p.source LIKE 'ingest:%'
       JOIN declaration d ON d.id = 'ingest.' || substr(p.source, 8) AND d.superseded_at IS NULL AND d.retired = 0 AND json_valid(d.body)
     GROUP BY y.series ORDER BY y.series`,
    SERIES_POINTS_LEAST,
  ).flatMap((y) => {
    const every = intervalMs(String(y.every ?? ''));
    return every === null ? [] : [{ series: y.series, newest: y.newest, every }];
  });
  if (feeds.length === 0 && series.length === 0 && young.length === 0) return reading('none', null, NO_NUMBER_FEED);
  const stale: { name: string; newestMs: number }[] = [];
  const judged: { series: string; newest: string; every?: number }[] = [...series, ...young];
  /* EACH SERIES' LAST THIRTY TIMES IN ONE READ, newest first. A read a series made the figures' declarations again for
     each series, and Health asked it on every read of a sign: 26 series were 26 of them. */
  const recent = new Map<string, number[]>();
  if (series.length > 0)
    for (const r of sql.all<{ series: string; at: string }>(
      `${DECLARED}, times AS (SELECT DISTINCT series, at FROM metric_point mp WHERE ${ARRIVED}),
         ranked AS (SELECT series, at, row_number() OVER (PARTITION BY series ORDER BY at DESC) AS n FROM times)
       SELECT series, at FROM ranked WHERE n <= 30 ORDER BY series, at DESC`,
    ))
      recent.set(r.series, [...(recent.get(r.series) ?? []), Date.parse(r.at)]);
  for (const s of judged) {
    const ats = s.every !== undefined ? [] : (recent.get(s.series) ?? []);
    const gaps = ats.slice(1).map((at, i) => ats[i]! - at).sort((a, b) => a - b);
    const gap = s.every ?? gaps[Math.floor(gaps.length / 2)] ?? DAY;
    const newestMs = Date.parse(s.newest);
    const age = nowMs - newestMs;
    if (age > SERIES_GAP_TIMES * gap && age > SERIES_STALE_DAYS * DAY) stale.push({ name: seriesName(sql, s.series), newestMs });
    /* AND A SERIES ON TIME IS BEHIND once its newest number is older than both lines. */ else if (!Number.isNaN(newestMs)) lasts(newestMs + Math.max(SERIES_GAP_TIMES * gap, SERIES_STALE_DAYS * DAY) + 1);
  }
  const newestAll = judged.reduce((m, s) => Math.max(m, Date.parse(s.newest)), -Infinity);
  const facts = [
    ...(Number.isFinite(newestAll) ? [`The newest number is from ${dateSaid(newestAll, tz, nowMs)}.`] : []),
    ...late.map((f) => `${f.name} last ran well on ${dateSaid(f.lastGoodMs, tz, nowMs)}.`),
    ...stale.slice(0, 3).map((s) => `${s.name}: no number since ${dateSaid(s.newestMs, tz, nowMs)}.`),
  ];
  const red = late.length > 0 || (judged.length > 0 && stale.length * SERIES_STALE_ONE_IN >= judged.length);
  if (!red) {
    const said = judged.length === 0 ? `${count(feeds.length, 'feed')} ran on time.` : stale.length === 0 ? 'Every series has its numbers on time.' : `${stale.length} of ${judged.length} series ${stale.length === 1 ? 'is' : 'are'} behind. The rest are on time.`;
    return reading('green', stale.length + late.length, said, facts);
  }
  const since = stale.reduce((m, s) => Math.max(m, s.newestMs), -Infinity);
  const said = [
    stale.length > 0 && stale.length * SERIES_STALE_ONE_IN >= judged.length
      ? `${count(stale.length, 'series has', 'series have')} had no number since ${dateSaid(since, tz, nowMs)}.`
      : '',
    late.length > 0 ? `${late.length === 1 ? late[0]!.name : count(late.length, 'feed')} ${late.length === 1 ? 'has' : 'have'} not run well since ${dateSaid(Math.max(...late.map((f) => f.lastGoodMs)), tz, nowMs)}.` : '',
    feeds.length === 0 ? 'Nothing is scheduled to bring one.' : '',
  ];
  return reading('red', stale.length + late.length, said.filter((s) => s !== '').join(' '), facts);
}

/* ── questions-by-cause and oldest-question ────────────────────────────── */

/** The open questions: not answered, and not put off past now, as the queue counts them (`govern.ts`). */
const OPEN = "status = 'open' AND (defer_until IS NULL OR defer_until <= ?)";

/** The words a question was asked in: its `suggest` event's question (`to_v`) or note. */
function askedIn(sql: Sql, id: string): string {
  const row = sql.one<{ said: string | null }>(
    "SELECT coalesce(to_v, note) AS said FROM event WHERE kind = 'suggest' AND target = ? AND field IS NULL AND coalesce(to_v, '') <> 'reopened' ORDER BY rowid DESC LIMIT 1",
    `suggestion:${id}`,
  );
  return typeof row?.said === 'string' && row.said.trim() !== '' ? row.said.trim() : NO_WORDS;
}

const NO_WORDS = 'A question with no words.';

/* A sentence joined after a colon starts lower-case, but only a common opening word: a name or a month keeps its capital. */
const joined = (said: string): string => (/^(The|A|An|This|That|These|Those|There|It|Its|Your|Our|No|Some|One|Nothing|Every|Each|Something|Someone|Many|Few|All|Both|Several) /u.test(said) ? said.charAt(0).toLowerCase() + said.slice(1) : said);

/** A question's words as a sentence of their own: a capital first and a full stop last. */
const sentence = (said: string): string => {
  const out = said.charAt(0).toUpperCase() + said.slice(1);
  return /[.!?]$/u.test(out) ? out : `${out}.`;
};

/** Whether this record has ever been asked anything: with nothing ever asked, the two question signs have nothing to judge by. */
const everAsked = (sql: Sql): boolean => sql.one('SELECT 1 AS x FROM suggestion LIMIT 1') !== undefined;

/** The next question put off to a later time that comes back open by the clock alone (`SignLasts`). */
const nextOpen = (sql: Sql, nowMs: number): number =>
  crossesAt(sql.one<{ at: string | null }>("SELECT min(defer_until) AS at FROM suggestion WHERE status = 'open' AND defer_until > ?", new Date(nowMs).toISOString())?.at, 0);

function readCauses(sql: Sql, nowMs: number, lasts: SignLasts = () => undefined): SignReading {
  if (!everAsked(sql)) {
    lasts(Infinity);
    return reading('none', null, 'Nothing has been asked yet.');
  }
  lasts(nextOpen(sql, nowMs));
  /* THE CAUSE IS THE QUESTION'S OWN, the column `propose` keeps every cause it filed or derived in (migration 31), else
     the body's (a tail question from before the column writes it, and Slash's reading keeps its key, `understand_key`),
     ELSE THE KIND OF CHANGE STAMPED ON IT WITH WHAT IT IS ABOUT, ELSE NONE. Read off the body alone, every question an
     agent gave a cause was counted as carrying none. `system` opens a question only when the record itself failed
     (`0001_kernel.ts`). */
  const open = sql.all<{ id: string; cause: string | null; kind: string | null; about: string | null; opened_by: string }>(
    `SELECT id, opened_by, kind,
            COALESCE(cause, CASE WHEN json_valid(body) THEN COALESCE(json_extract(body, '$.cause'), json_extract(body, '$.understand_key')) END) AS cause,
            CASE WHEN json_valid(body) THEN json_extract(body, '$.about') END AS about
       FROM suggestion WHERE ${OPEN} ORDER BY rowid`,
    new Date(nowMs).toISOString(),
  );
  const words = new Map(open.map((q) => [q.id, askedIn(sql, q.id).toLowerCase().replace(/\s+/g, ' ')] as const));
  const groups = new Map<string, string[]>();
  const add = (key: string, id: string) => groups.set(key, [...(groups.get(key) ?? []), id]);
  const caused = new Set<string>();
  for (const q of open) {
    /* A KIND ALONE IS NOT A CAUSE: two different tasks proposed are both `tasks:add`, and two unrelated choices both `call`. */
    const key = typeof q.cause === 'string' && q.cause !== '' ? `cause:${q.cause}` : typeof q.about === 'string' && q.about !== '' ? `about:${q.kind ?? ''}|${q.about}` : null;
    if (key !== null) {
      add(key, q.id);
      caused.add(q.id);
    }
    /* THE SAME WORDS ARE THE SAME QUESTION, WHATEVER CAUSE WAS STAMPED ON EACH. A question from before causes is grouped
       this way, and so is one whose cause was written wrong: a cause that splits one question in many (one per payee)
       is the fault this sign watches, so the cause alone cannot be what turns it green. */
    if (words.get(q.id) !== NO_WORDS.toLowerCase()) add(`words:${words.get(q.id)}`, q.id);
  }
  const uncaused = open.filter((q) => !caused.has(q.id) && (groups.get(`words:${words.get(q.id)}`)?.length ?? 0) <= 1).map((q) => q.id);
  /* ONE GROUP ONCE, when its cause and its words hold the same questions. */
  const seen = new Set<string>();
  const distinct = [...groups.values()].filter((ids) => {
    const at = [...ids].sort().join(' ');
    return seen.has(at) ? false : (seen.add(at), true);
  });
  const faults = open.filter((q) => q.opened_by === 'system');
  const shared = distinct.filter((ids) => ids.length > CAUSE_QUESTIONS_MOST).sort((a, b) => b.length - a.length);
  const facts = shared.slice(0, 3).map((ids) => `${ids.length} share: ${askedIn(sql, ids[0]!)}`);
  if (uncaused.length > 0) facts.push(`${count(uncaused.length, 'question carries', 'questions carry')} no cause.`);
  if (faults.length > 0) facts.push(`${count(faults.length, 'question was', 'questions were')} opened by something failing: ${askedIn(sql, faults[0]!.id)}`);
  const red = shared.length > 0 || uncaused.length > UNCAUSED_MOST || faults.length > 0;
  const biggest = shared[0];
  if (!red) return reading('green', open.length, open.length === 0 ? 'No question is waiting.' : `${count(open.length, 'open question')}, no two with the same cause.`, facts);
  const said = biggest
    ? `${biggest.length} open questions share one cause: ${askedIn(sql, biggest[0]!)} One answer closes them.`
    : faults.length > 0
      ? /* THE FAULT'S OWN WORDS (P36), not "a fault of the record", and nothing in front of them: the sign's name already
           says these are problems, so a lead-in of eleven words before the news only pushed it off a phone's line. */
        faults.length === 1
        ? sentence(askedIn(sql, faults[0]!.id))
        : `${faults.length} things went wrong. The first: ${joined(askedIn(sql, faults[0]!.id))}`
      : `${uncaused.length} open questions carry no cause.`;
  const out = reading('red', biggest?.length ?? (faults.length || uncaused.length), said, facts);
  /* THE RECORD'S OWN FAILURE IS HEADED AS ONE, not under this check's name (30 October): Health read "Each problem is
     asked once" over "The backup on 3 Sep did not run".
     AND BY WHAT FAILED, WITH ITS WAY ON (31 October, AG7): "Something did not work" over that line gave nothing to press,
     while Needs you held the same question with "Run it now" suggested. One failure is titled by its own words, says
     the answer suggested, and opens its question; more than one open Needs you. */
  if (biggest || faults.length === 0) return out;
  if (faults.length > 1) return { ...out, named: `${faults.length} things did not work`, to: '/decide' };
  const one = faults[0]!;
  const pick = suggestedOf(sql, one.id);
  return {
    ...out,
    named: sentence(askedIn(sql, one.id)).replace(/\.$/u, ''),
    said: pick === null ? 'It waits on you in Needs you.' : `It waits on you in Needs you, with “${pick}” suggested.`,
    to: `/decide/${one.id}`,
  };
}

/** The label of the answer a question suggests, when it holds options and marks one. */
function suggestedOf(sql: Sql, id: string): string | null {
  const row = sql.one<{ body: string | null }>('SELECT body FROM suggestion WHERE id = ?', id);
  try {
    const body = typeof row?.body === 'string' ? (JSON.parse(row.body) as { options?: unknown }) : null;
    const options = Array.isArray(body?.options) ? (body.options as { label?: unknown; recommended?: unknown }[]) : [];
    const label = options.find((o) => o?.recommended === true)?.label;
    return typeof label === 'string' && label.trim() !== '' ? label.trim() : null;
  } catch {
    return null;
  }
}

function readOldest(sql: Sql, nowMs: number, tz: string, lasts: SignLasts = () => undefined): SignReading {
  if (!everAsked(sql)) {
    lasts(Infinity);
    return reading('none', null, 'Nothing has been asked yet.');
  }
  lasts(nextOpen(sql, nowMs));
  const oldest = sql.one<{ id: string; at: string }>(`SELECT id, opened_at AS at FROM suggestion WHERE ${OPEN} ORDER BY opened_at LIMIT 1`, new Date(nowMs).toISOString());
  if (oldest === undefined) return reading('green', 0, 'No question is waiting.');
  const days = Math.max(0, Math.floor((nowMs - Date.parse(oldest.at)) / DAY));
  /* A DAY OLDER at the same hour it was asked. */
  lasts(Date.parse(oldest.at) + (days + 1) * DAY);
  const facts = [`Asked on ${dateSaid(oldest.at, tz, nowMs)}: ${askedIn(sql, oldest.id)}`];
  /* NOUGHT DAYS IS TODAY: "is 0 days old" was how Health said a question asked this morning. */
  const said = days === 0 ? 'The oldest open question was asked today.' : `The oldest open question is ${count(days, 'day')} old.`;
  return reading(days > QUESTION_DAYS_MOST ? 'red' : 'green', days, said, facts);
}

/* ── runs-true ─────────────────────────────────────────────────────────── */

/* RUNS ARE THE RECORD'S OWN BOOKKEEPING (agents' sessions, counted for health): owner-level by design, no private-row clause. */
function readRuns(sql: Sql, nowMs: number, lasts: SignLasts = () => undefined): SignReading {
  lasts(Infinity);
  const since = new Date(nowMs - RUNS_WINDOW_DAYS * DAY).toISOString();
  /* A WEEK OF RUNS IS RUNS HEARD FROM HERE THIS WEEK, by `last_seen` alone. A run never heard from here (`presenceOf`'s
     `before`: one carried in from another system, all of them written off there) has no `last_seen`, and read by its
     row's last change, one edit of its project in a week counted every such run as one that ended abandoned this week:
     203 of 237. */
  const HEARD_HERE = "json_extract(fields, '$.last_seen')";
  /* A HANDOFF THE SWEEP WROTE IS A RUN THAT WENT SILENT, not one that ended: `sweepSessions` hands off a run that crashed
     after leaving a step, and its `state` line is by `system`. A run that handed off itself signs its own line. Read in
     the same query, the newest `state` line of each handoff, so a week of runs is one read and not one a run. */
  const heard = sql.all<{ state: string | null; swept: number; seen: string | null; none: number }>(
    `SELECT state, (state = 'handoff' AND coalesce((SELECT e.actor FROM event e WHERE e.target = 'entry:' || entry.id AND e.kind = 'state'
       ORDER BY e.ts DESC, e.rowid DESC LIMIT 1), '') = 'system') AS swept, ${HEARD_HERE} AS seen, ${SESSIONLESS_SQL} AS none
     FROM entry WHERE register = 'session' AND deleted_at IS NULL AND ${HEARD_HERE} >= ?`,
    since,
  );
  /* A RUN WITH NO SESSION IS NOT JUDGED (`sessionless`): nothing could say it ended, so its end was not lost. A real
     window always names its session, so this leaves every real lost run counted. Said in the facts, never dropped. */
  const runs = heard.filter((r) => Number(r.none) !== 1);
  const unjudged = heard.length - runs.length;
  /* BY THE CLOCK ALONE (`SignLasts`): a run of the week leaves it, and an open run goes silent twelve hours after it was
     last heard from. */
  for (const r of heard) lasts(crossesAt(r.seen, RUNS_WINDOW_DAYS * DAY));
  /* STILL OPEN LONG AFTER IT WAS LAST HEARD FROM OR PULSED, as the sweep reads it: the sweep that writes such a run off did
     not. AT ANY AGE, not only this week's: a run the sweep never wrote off falls out of the window and would read as no
     run at all. */
  const { silent, soonest } = openRunsHeard(sql, nowMs, RUN_SILENT_MS);
  lasts(crossesAt(soonest, RUN_SILENT_MS));
  if (runs.length === 0 && silent.length === 0) return reading('none', null, `No agent has run in the last ${RUNS_WINDOW_DAYS} days.`);
  const ended = runs.filter((r) => r.state === 'done' || r.state === 'abandoned' || r.state === 'handoff');
  const abandoned = ended.filter((r) => r.state === 'abandoned').length;
  const swept = ended.filter((r) => Number(r.swept) === 1).length;
  const gone = abandoned + swept;
  const lost = ended.length >= RUNS_ENDED_LEAST && gone * RUNS_ABANDONED_ONE_IN > ended.length;
  const facts = [`${count(runs.length, 'run')} this week, ${ended.length} ended, ${abandoned} of them abandoned.`];
  if (unjudged > 0) facts.push(`${count(unjudged, 'run')} came from a connection with no session, which nothing can say has ended, so ${unjudged === 1 ? 'it is' : 'they are'} not counted.`);
  if (swept > 0) facts.push(`${count(swept, 'run')} went silent and ${swept === 1 ? 'was' : 'were'} left waiting with ${swept === 1 ? 'its' : 'their'} next step, not ended.`);
  if (silent.length > 0) {
    const ago = nowMs - Date.parse(silent[0]!.heard);
    /* ITS AGE IS SAID IN HOURS, then in days: the next hour or day it reaches. */
    const step = ago < 2 * DAY ? HOUR : DAY;
    lasts(Date.parse(silent[0]!.heard) + (Math.floor(ago / step) + 1) * step);
    facts.push(`${silent[0]!.agent ?? 'A run'} was last heard from ${ago < 2 * DAY ? count(Math.floor(ago / HOUR), 'hour') : count(Math.floor(ago / DAY), 'day')} ago and is still open.`);
  }
  if (!lost && silent.length === 0)
    return reading('green', gone, ended.length === 0 ? `${count(runs.length, 'run')} this week, none ended yet.` : gone === 0 ? 'Every run that ended this week ended normally.' : `${ended.length - gone} of ${ended.length} runs this week ended normally.`, facts);
  const how = swept === 0 ? 'ended as abandoned' : abandoned === 0 ? 'went silent and never ended' : `did not end normally: ${abandoned} ${abandoned === 1 ? 'was' : 'were'} abandoned and ${swept} went silent`;
  const said = [
    lost ? `${gone} of ${ended.length} runs this week ${how}. A normal end is being lost.` : '',
    silent.length > 0 ? `${count(silent.length, 'run is', 'runs are')} still open more than ${RUN_SILENT_MS / HOUR} hours after last heard from.` : '',
  ];
  return reading('red', lost ? gone : silent.length, said.filter((s) => s !== '').join(' '), facts);
}

/* ── rates-current ─────────────────────────────────────────────────────── */

/** The live lists: id and body, oldest id first. */
const listsHeld = (sql: Sql): { id: string; body: Record<string, unknown> }[] =>
  sql
    .all<{ id: string; body: string }>("SELECT id, body FROM declaration WHERE kind = 'register' AND superseded_at IS NULL AND retired = 0 ORDER BY id")
    .flatMap((d) => {
      const body = parsed(d.body);
      return body === null ? [] : [{ id: typeof body.id === 'string' ? body.id : d.id.slice('register.'.length), body }];
    });

/**
 * The currencies the record's money is in, stopping at two: the home currency a person chose, and those the money
 * fields of its lists hold, read as `api/money-figures.ts` `moneyCurrencies` reads them. Two is already more than one.
 */
function currenciesHeld(sql: Sql): string[] {
  const found = new Set<string>();
  const home = homeCurrency(sql);
  if (home !== null) found.add(home);
  for (const list of listsHeld(sql)) {
    const fields = Array.isArray(list.body.fields) ? (list.body.fields as { id?: unknown; type?: unknown }[]) : [];
    for (const f of fields) {
      if (f?.type !== 'money' || typeof f.id !== 'string') continue;
      const at = `json_extract(fields, '${jsonPath(f.id)}.currency')`;
      for (const r of sql.all<{ c: unknown }>(`SELECT DISTINCT ${at} AS c FROM entry WHERE register = ? AND deleted_at IS NULL AND ${at} IS NOT NULL AND ${unprivate()} LIMIT 2`, list.id, ''))
        if (typeof r.c === 'string' && /^[A-Z]{3}$/u.test(r.c)) found.add(r.c);
      if (found.size >= 2) return [...found].sort();
    }
  }
  return [...found].sort();
}

/** The record's rates: the rows of the list that declares `rates:`, read by the fields it names, as a figure's `fx` reads them. */
function ratesHeld(sql: Sql): Rate[] {
  const held = ratesRole(listsHeld(sql).map((l) => l.body as unknown as RoleList));
  if (!held) return [];
  const rows = sql.all<{ fields: string }>('SELECT fields FROM entry WHERE register = ? AND deleted_at IS NULL', held.register);
  return ratesFrom(
    rows.map((r) => JSON.parse(r.fields) as Record<string, unknown>),
    held.fields,
  );
}

/**
 * A CURRENCY BY ITS NAME, never its bank code: Health read "Every amount on this record is in GBP" (audit of 31 October,
 * A20, A21). The runtime's own English name ("British Pound"), or the code where the runtime has none.
 */
function currencyWords(code: string): string {
  try {
    return new Intl.DisplayNames('en', { type: 'currency', fallback: 'none' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * THE SAME AGE THE `rates-age-days` FIGURE READS, by the figure's own reader over the record's rates, judged by the line
 * its note names (`RATES_STALE_DAYS`): never a second count of how old a rate is. Red names the cure in the words an
 * agent looks for on offer, a feed of rates, so the skill "Keep a record current" can put it in its one question.
 *
 * NOTHING TO JUDGE BY ON A RECORD WITH ONE CURRENCY, however old its rates: nothing there is converted. And none with no
 * rate at all, as the figure says nothing then: nought would say the rates are fresh on a record that has none.
 */
function readRatesCurrent(sql: Sql, nowMs: number, tz: string, lasts: SignLasts = () => undefined): SignReading {
  /* BY THE DAY ALONE: the rate's age is counted in the record's days, and nothing else here reads the clock. */
  lasts(Infinity);
  const held = currenciesHeld(sql);
  if (held.length < 2)
    return reading('none', null, held.length === 0 ? 'No money is written down yet, so no exchange rate is needed.' : `Every amount is in ${currencyWords(held[0]!)}, so no exchange rate is needed.`);
  const facts = [`Money is kept in more than one currency, ${held.map(currencyWords).join(' and ')} among them.`];
  const decl = BUILT_IN_FIGURES['rates-age-days'];
  const age = decl === undefined ? null : readRatesAge({ nowMs, tz, fx: () => ({ home: homeCurrency(sql), rates: ratesHeld(sql) }) }, decl);
  const days = age?.ok ? age.value.value : null;
  if (days === null) return reading('none', null, 'No exchange rate is kept yet. A feed of rates would bring them in.', facts);
  const said = `The newest exchange rate is ${days === 0 ? 'from today' : `${count(days, 'day')} old`}.`;
  if (days <= RATES_STALE_DAYS) return reading('green', days, said, facts);
  facts.push(`An amount converted on a rate more than ${count(RATES_STALE_DAYS, 'day')} old is marked stale.`);
  return reading('red', days, `${said} ${ratesFeedSaid(ratesFeed(sql), (at) => dateSaid(at, tz, nowMs))}`, facts);
}

/* ── the closed list ───────────────────────────────────────────────────── */

/* A READER WHOSE RULE CHANGED WITHOUT A THRESHOLD MOVING TAKES THE NEXT VERSION, so its days read under the old rule keep
   the old `rule`. Version 2: arrivals all set aside, a young series read by its feed, a run the sweep handed off. */
const kernel = (sign: string, name: string, thresholds: Record<string, number>, read: NonNullable<SignReader['read']>, version = 1): SignReader => ({ sign, name, hand: 'kernel', version, thresholds, read });
const filed = (sign: string, name: string, hand: 'record' | 'host', version = 1): SignReader => ({ sign, name, hand, version, thresholds: {}, read: null });

/**
 * THE KERNEL'S FIVE AND THE FOUR FILED, in the order 2.2 sets them, then `arrived` (filed by the record), the
 * seven automation signs (`signs-flow.ts`) and the five of what runs by itself and arrives (SHL-C01,
 * `signs-actions.ts`), a spread each, the vitals of `signs-vitals.ts`, and last `rates-current`, how old
 * the newest exchange rate is on a record with money in more than one currency. The ids are 2.2's; a person reads the names.
 */
export const VITAL_SIGNS: readonly SignReader[] = [
  kernel('arrivals-filed', 'Arrivals file by themselves', { ARRIVAL_WAIT_MS, ARRIVALS_WAITING_MOST, ARRIVAL_AHEAD_MS, ARRIVALS_WINDOW_DAYS }, readArrivals, 2),
  kernel('numbers-arrive', 'Numbers arrive on schedule', { FEED_LATE_PERIODS, SERIES_POINTS_LEAST, SERIES_GAP_TIMES, SERIES_STALE_DAYS, SERIES_STALE_ONE_IN }, readNumbers, 2),
  filed('model-answers', 'The model answers', 'host'),
  filed('tools-listed', 'Agents get the tool list', 'host'),
  filed('briefing-true', 'What agents are told is true', 'record'),
  kernel('questions-by-cause', 'Each problem is asked once', { CAUSE_QUESTIONS_MOST, UNCAUSED_MOST }, (sql, nowMs, _tz, lasts) => readCauses(sql, nowMs, lasts)),
  kernel('oldest-question', 'No question waits too long', { QUESTION_DAYS_MOST }, readOldest),
  kernel('runs-true', 'Agent runs end cleanly', { RUNS_WINDOW_DAYS, RUN_SILENT_MS, RUNS_ENDED_LEAST, RUNS_ABANDONED_ONE_IN }, (sql, nowMs, _tz, lasts) => readRuns(sql, nowMs, lasts), 3),
  /* Version 2: a refused block or a path that named nothing, counted by the pages census, is red too. */
  filed('pages-clean', 'Pages draw without errors', 'host', 2),
  filed('arrived', 'What shipped has arrived', 'record'),
  ...SIGNS_FLOW,
  ...SIGNS_ACTIONS,
  ...SIGNS_VITALS,
  /* After the money-shaped ones: the age the `rates-age-days` figure reads, red past its own line. */
  kernel('rates-current', 'Rates are current', { RATES_STALE_DAYS }, readRatesCurrent),
];

/** The sign called `id` on the closed list, or `null`. */
export const signOf = (id: string): SignReader | null => VITAL_SIGNS.find((s) => s.sign === id) ?? null;

/* What a sign says before anything was ever filed for it is `NEVER_FILED` (`sources/signs.ts`), which a page folds into
   one line where two or more say it: Health said it six times over (recheck of 30 October, Low list). */

/** What the night writes for a filed sign on a day nothing was filed: a placeholder, never a filing. */
const NOT_FILED = 'Nothing was filed for this sign that day.';

/**
 * One sign read now. A reader that throws reads `none` with its own words, never green and never a throw out of here.
 * `lasts` is told how long the reading stands by the clock alone (`SignLasts`): the earliest its reader told, nothing
 * when it told nothing or threw, and for a filed sign, until its filing stops standing.
 */
function readNow(sql: Sql, s: SignReader, nowMs: number, tz: string, lasts?: SignLasts): SignReading {
  if (s.read !== null) {
    let until: number | undefined;
    try {
      const got = s.read(sql, nowMs, tz, (at) => {
        /* A TIME THAT IS NOT A NUMBER stands for no time at all. */
        until = Math.min(until ?? Infinity, Number.isNaN(at) ? -Infinity : at);
      });
      if (until !== undefined) lasts?.(until);
      return got;
    } catch (e) {
      return reading('none', null, 'This sign could not be read.', [e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200)]);
    }
  }
  /* THE NEWEST FILING, BY WHEN IT WAS FILED AND NOT BY ITS DAY: a reading stands a day after it was filed, so a filer
     that died reads `none` the next night and says since when, rather than its last word standing a second day. */
  const row = sql.one<{ state: SignState; value: number | null; said: string; facts: string; read_at: string }>(
    "SELECT state, value, said, facts, read_at FROM sign_reading WHERE sign = ? AND NOT (state = 'none' AND said = ?) ORDER BY day DESC, read_at DESC LIMIT 1",
    s.sign,
    NOT_FILED,
  );
  /* UNTIL SOMETHING IS FILED, which is a write to the readings. */
  if (row === undefined) {
    lasts?.(Infinity);
    return reading('none', null, NEVER_FILED);
  }
  /* NOT `> FILED_STANDS_MS`: a `read_at` that does not parse is NaN, and NaN is never more than a day, so the filing
     would stand forever. Written so a time that cannot be read reads as old. */
  const t = Date.parse(row.read_at);
  /* A FILING THAT STANDS STANDS UNTIL A DAY AFTER IT WAS FILED; one that no longer does reads the same until another is filed. */
  lasts?.(nowMs - t <= FILED_STANDS_MS ? t + FILED_STANDS_MS + 1 : Infinity);
  if (!(nowMs - t <= FILED_STANDS_MS))
    return reading('none', null, Number.isNaN(t) ? 'No day it was read is known.' : `Not read since ${dateSaid(t, tz, nowMs)}.`, [`It last read ${row.state === 'none' ? 'nothing to judge by' : row.state}: ${row.said}`.slice(0, 200)]);
  const kept = factsOf(row.facts);
  return reading(row.state, row.value === null ? null : Number(row.value), row.said, kept.facts, kept.counts);
}

/**
 * Every sign now, with its last fourteen days, oldest first; a day with no reading is `none`. `each` reads one sign as
 * the caller holds it (the kernel holds a sign until something it read is written or the clock moves it, `held-signs.ts`),
 * its `read` telling `lasts` how long the reading stands by the clock alone (`SignLasts`); absent, each is read now.
 */
export function readSigns(sql: Sql, nowMs: number, tz: string, each?: (sign: string, read: (lasts: SignLasts) => SignReading) => SignReading): VitalSign[] {
  const today = dayIn(nowMs, safeZone(tz));
  const first = dayBefore(today, 14);
  const kept = new Map<string, SignState>();
  for (const r of sql.all<{ sign: string; day: string; state: SignState }>('SELECT sign, day, state FROM sign_reading WHERE day >= ? AND day < ?', first, today))
    kept.set(`${r.sign} ${r.day}`, r.state);
  return VITAL_SIGNS.map((s) => {
    const now = each === undefined ? readNow(sql, s, nowMs, safeZone(tz)) : each(s.sign, (lasts) => readNow(sql, s, nowMs, safeZone(tz), lasts));
    const days = Array.from({ length: 14 }, (_, i) => dayBefore(today, 14 - i)).map((day) => ({ day, state: kept.get(`${s.sign} ${day}`) ?? ('none' as const) }));
    const sign: VitalSign = { sign: s.sign, name: now.named ?? s.name, state: now.state, value: now.value, said: now.said, facts: now.facts ?? [], days };
    if (now.counts !== undefined) sign.counts = { ...now.counts };
    if (typeof now.to === 'string' && now.to.startsWith('/')) sign.to = now.to;
    return sign;
  });
}

/** What a filed reading may hold. */
const SAID_MOST = 280;
const FACTS_MOST = 6;
const FACT_MOST = 200;

/**
 * A filing's counts, checked against the sign's own list (`SIGN_COUNTS`): `null` when it carries none, and a refusal
 * that names what the sign counts when one is not on its list, or is not a whole number of nought or more.
 */
function countsOf(s: SignReader, counts: unknown): Result<Record<string, number> | null> {
  if (counts === undefined) return ok(null);
  const words = SIGN_COUNTS[s.sign];
  if (words === undefined) return no('VALUE_MALFORMED', `${s.name} carries no counts beside its value. File it with state, value, said and facts.`);
  const named = Object.entries(words).map(([k, w]) => `${k} (${w})`).join(', ');
  if (counts === null || typeof counts !== 'object' || Array.isArray(counts))
    return no('VALUE_MALFORMED', `${s.name} counts are whole numbers by name: ${named}.`);
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(counts as Record<string, unknown>)) {
    if (!Object.hasOwn(words, k)) return no('VALUE_MALFORMED', `${JSON.stringify(k).slice(0, 40)} is not something ${s.name} counts. It counts ${named}.`);
    if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0)
      return no('VALUE_MALFORMED', `How many ${words[k]} is a whole number of nought or more.`);
    out[k] = n;
  }
  return ok(out);
}

/**
 * The record layer or the host files today's reading of one of the signs it owns. A later filing the same day
 * replaces the earlier one. Refuses an id outside the list, one the kernel reads itself, and a reading out of shape.
 */
export function fileSignReading(sql: Sql, id: string, r: SignReading, nowMs: number, tz: string): Result<{ sign: string; day: string }> {
  const s = signOf(id);
  if (s === null) return no('REF_UNKNOWN', `${JSON.stringify(id).slice(0, 60)} is not a sign. The signs filed from outside are ${VITAL_SIGNS.filter((x) => x.read === null).map((x) => x.sign).join(', ')}.`);
  if (s.read !== null) return no('FORBIDDEN', `${s.name} is read by BrainDog itself, so nothing files it. File one of ${VITAL_SIGNS.filter((x) => x.read === null).map((x) => x.sign).join(', ')}.`);
  if (r === null || typeof r !== 'object' || !['green', 'red', 'none'].includes(r.state as string))
    return no('VALUE_MALFORMED', 'A reading is { state, value, said, facts }, and its state is green, red or none.');
  if (r.value !== null && !Number.isSafeInteger(r.value)) return no('VALUE_MALFORMED', "A reading's value is a whole number, or null when there is none.");
  if (typeof r.said !== 'string' || r.said.trim() === '' || r.said.length > SAID_MOST)
    return no('VALUE_MALFORMED', `A reading says one sentence of 1 to ${SAID_MOST} characters.`);
  const facts = r.facts ?? [];
  if (!Array.isArray(facts) || facts.length > FACTS_MOST || facts.some((f) => typeof f !== 'string' || f.length > FACT_MOST))
    return no('VALUE_MALFORMED', `A reading's facts are at most ${FACTS_MOST} lines of at most ${FACT_MOST} characters.`);
  const counted = countsOf(s, r.counts);
  if (!counted.ok) return counted;
  const day = dayIn(nowMs, safeZone(tz));
  write(sql, s, day, { state: r.state, value: r.value, said: r.said.trim(), facts, ...(counted.value === null ? {} : { counts: counted.value }) }, nowMs, true);
  return ok({ sign: s.sign, day });
}

/** One reading as its day's row: replacing what is there, or only where there is nothing. */
function write(sql: Sql, s: SignReader, day: string, r: SignReading, nowMs: number, replace: boolean): number {
  const before = Number(sql.one<{ n: number }>('SELECT count(*) AS n FROM sign_reading WHERE sign = ? AND day = ?', s.sign, day)?.n ?? 0);
  if (before > 0 && !replace) return 0;
  sql.exec(
    `INSERT ${replace ? 'OR REPLACE' : 'OR IGNORE'} INTO sign_reading (sign, day, state, value, said, facts, rule, hand, read_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    s.sign,
    day,
    r.state,
    r.value,
    r.said,
    JSON.stringify(r.counts === undefined ? (r.facts ?? []) : [...(r.facts ?? []), { counts: r.counts }]),
    ruleOf(s),
    s.hand,
    new Date(nowMs).toISOString(),
  );
  return 1;
}

/** When the night's reading is next due: five past midnight in the record's zone, as a figure's snapshot is. */
export function nextSignsDue(nowMs: number, tz: string): number {
  return nextOccurrence({ at: '00:05' }, nowMs, safeZone(tz)) ?? nowMs + DAY;
}

/** Readings older than this many days are pruned by the night, as `observation` is. */
export const SIGNS_KEPT_DAYS = 400;

/**
 * The night: one row a sign for the day that ended, read now. The kernel's five are read and written over whatever the
 * day held; a filed sign keeps what was filed that day and is written `none` where nothing was. Then rows past 400 days
 * go. Answers how many rows it wrote.
 */
export function runSignsNight(sql: Sql, nowMs: number, tz: string): number {
  const zone = safeZone(tz);
  const ended = dayBefore(dayIn(nowMs, zone));
  let wrote = 0;
  sql.transactionSync(() => {
    for (const s of VITAL_SIGNS) {
      const r = s.read !== null ? readNow(sql, s, nowMs, zone) : reading('none', null, NOT_FILED);
      wrote += write(sql, s, ended, r, nowMs, s.read !== null);
    }
    sql.exec('DELETE FROM sign_reading WHERE day < ?', dayBefore(dayIn(nowMs, zone), SIGNS_KEPT_DAYS));
  });
  return wrote;
}

/* ── a sign without the inbox's words ──────────────────────────────────── */

/**
 * The sentence a reader without the inbox reach reads for a sign whose own sentence may quote a message or a question,
 * by its state and number alone. A sign not here keeps its own sentence, which names lists, feeds, runs and scripts,
 * never what was sent in. A sign read `none` keeps its own too: that sentence says only what is missing ("This sign
 * could not be read.", "Nothing has been asked on this record yet."), and one written here could not tell those apart.
 */
export const QUIET: Readonly<Record<string, (s: VitalSign) => string>> = {
  /* RED IS NOT ALWAYS MESSAGES WAITING: a list behind its doors, or a day set aside as
     repeats, reads red with none waiting, and "Messages wait to be filed." sent him to an Inbox that listed none. What
     is true of all three is that messages came in and were not filed. */
  'arrivals-filed': (s) =>
    s.state === 'red' ? 'Messages came in that are not filed yet.' : s.value ? `${count(s.value, 'message waits', 'messages wait')} to be filed, not yet too long.` : 'No message waits to be filed.',
  'questions-by-cause': (s) =>
    s.state === 'red' ? 'Open questions pile up on one cause, or carry none.' : s.value ? `${count(s.value, 'open question')}, no two with the same cause.` : 'No question is waiting.',
};

/**
 * A sign as a reader without the inbox reach reads it: no facts, and no message or question in its sentence. Pure, so
 * the record's `signs` method, the briefing's red signs and a page's `signs` block hold the inbox's words back by one
 * rule.
 */
export const quietSign = (s: VitalSign): VitalSign => {
  const { to: _to, ...rest } = s;
  const out: VitalSign = { ...rest, said: s.state === 'none' ? s.said : (QUIET[s.sign]?.(s) ?? s.said), facts: [] };
  /* A FAILURE IS TITLED BY ITS QUESTION'S WORDS (AG7), so the title is held back with the sentence, and so is its way to the question. */
  if (s.sign === 'questions-by-cause') out.name = VITAL_SIGNS.find((v) => v.sign === s.sign)?.name ?? s.name;
  return out;
};
