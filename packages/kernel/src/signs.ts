/**
 * The record's vital signs (PRF-A01, DIRECTION §40): a short closed list of readings about the record itself, each
 * green, red or none, read on demand and kept a row a day in `sign_reading` (migration 27).
 *
 * WHY THIS EXISTS. His record stood still for nine days after the move, 32 messages waited, 17 of 25 open questions were
 * one question, and every gate stayed green, because every gate drew an invented record. "A daily check watches all of
 * that and says so in the app when one fails" (D40.37). These are that check, and every record has them: nothing here
 * names a list, a bank or a use case (DIRECTION §27).
 *
 * FIVE ARE READ HERE, OVER THE KERNEL'S OWN TABLES: arrivals, numbers, questions by cause, the oldest question, runs.
 * FOUR ARE FILED by the layers that know more, through `fileSignReading`: whether the model answers and whether agents
 * get the tool list (the host), whether the briefing is true (the record), whether pages print clean (the host). Until
 * one is filed it reads `none`.
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

import type { Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { nextOccurrence } from './digest.ts';
import { dayIn } from './finished.ts';
import { UNVERIFIED } from './ingest.ts';
import { intervalMs } from './pull.ts';
import { SIGNS_FLOW } from './signs-flow.ts';

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
};

/** What a reader answers, and what the record or host files through `fileSignReading`. */
export type SignReading = { state: SignState; value: number | null; said: string; facts?: string[] };

/** The key the nightly `snapshot` row is armed under, payload `{ signs: true }`. */
export const SIGNS_KEY = 'signs';

/** Who reads a sign: the kernel itself, or the layer that files it. */
export type SignHand = 'kernel' | 'record' | 'host';

/** A sign on the closed list: its id, its name, who reads it, and for the kernel's own the reader and its thresholds. */
export type SignReader = {
  sign: string;
  name: string;
  hand: SignHand;
  version: number;
  thresholds: Readonly<Record<string, number>>;
  read: ((sql: Sql, nowMs: number, tz: string) => SignReading) | null;
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/* ── the thresholds, one line each, as 2.2 of `loop/scope/area-proof-a.md` sets them ───────────────── */

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

/** A filed reading stands for now this long after it was filed. A layer that files once a night files again before it is up. */
export const FILED_STANDS_MS = DAY;

/* ── helpers ───────────────────────────────────────────────────────────── */

const reading = (state: SignState, value: number | null, said: string, facts: string[] = []): SignReading => ({ state, value, said, facts: facts.slice(0, 6) });

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

function readArrivals(sql: Sql, nowMs: number, tz: string): SignReading {
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
  /* NO PATTERN IS NOT NOTHING TO JUDGE BY WHILE MESSAGES WAIT: a pattern retired or lost leaves them waiting all the same. */
  if (fed.size === 0 && waiting.length === 0) return reading('none', null, 'Nothing on this record takes messages in yet.');
  const since = new Date(nowMs - ARRIVALS_WINDOW_DAYS * DAY).toISOString();
  const recent = Number(sql.one<{ n: number }>(`SELECT count(*) AS n FROM inbox_raw WHERE state <> 'erased' AND ts >= ? AND ${VOUCHED}`, since, UNVERIFIED)?.n ?? 0);
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
       read of signs (audit 36-37, finding 10). An empty list of patterns matches nothing, as `IN ()` would. */
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
const DECLARED = `WITH declared AS MATERIALIZED (SELECT json_extract(body, '$.metric') AS m, json_extract(body, '$.source') AS s
  FROM declaration WHERE kind = 'metric' AND superseded_at IS NULL AND json_valid(body))`;
const ARRIVED = 'NOT EXISTS (SELECT 1 FROM declared d WHERE d.m = mp.series AND d.s = mp.source)';

function readNumbers(sql: Sql, nowMs: number, tz: string): SignReading {
  const feeds = feedsOn(sql);
  const late = feeds.filter((f) => nowMs - f.lastGoodMs > FEED_LATE_PERIODS * f.everyMs);

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
  if (feeds.length === 0 && series.length === 0 && young.length === 0) return reading('none', null, 'No numbers come in on this record yet.');
  const stale: { name: string; newestMs: number }[] = [];
  const judged: { series: string; newest: string; every?: number }[] = [...series, ...young];
  for (const s of judged) {
    const ats = s.every !== undefined ? [] : sql.all<{ at: string }>(`${DECLARED} SELECT DISTINCT at FROM metric_point mp WHERE series = ? AND ${ARRIVED} ORDER BY at DESC LIMIT 30`, s.series).map((r) => Date.parse(r.at));
    const gaps = ats.slice(1).map((at, i) => ats[i]! - at).sort((a, b) => a - b);
    const gap = s.every ?? gaps[Math.floor(gaps.length / 2)] ?? DAY;
    const newestMs = Date.parse(s.newest);
    const age = nowMs - newestMs;
    if (age > SERIES_GAP_TIMES * gap && age > SERIES_STALE_DAYS * DAY) stale.push({ name: seriesName(sql, s.series), newestMs });
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
    "SELECT coalesce(to_v, note) AS said FROM event WHERE kind = 'suggest' AND target = ? AND field IS NULL ORDER BY rowid LIMIT 1",
    `suggestion:${id}`,
  );
  return typeof row?.said === 'string' && row.said.trim() !== '' ? row.said.trim() : NO_WORDS;
}

const NO_WORDS = 'A question with no words.';

/** Whether this record has ever been asked anything: with nothing ever asked, the two question signs have nothing to judge by. */
const everAsked = (sql: Sql): boolean => sql.one('SELECT 1 AS x FROM suggestion LIMIT 1') !== undefined;

function readCauses(sql: Sql, nowMs: number): SignReading {
  if (!everAsked(sql)) return reading('none', null, 'Nothing has been asked on this record yet.');
  /* THE CAUSE IS THE BODY'S OWN WHEN IT HAS ONE (a tail question writes it), ELSE THE KIND OF CHANGE STAMPED ON IT WITH
     WHAT IT IS ABOUT, ELSE NONE. `system` opens a question only when the record itself failed (`0001_kernel.ts`). */
  const open = sql.all<{ id: string; cause: string | null; kind: string | null; about: string | null; opened_by: string }>(
    `SELECT id, opened_by, kind,
            CASE WHEN json_valid(body) THEN json_extract(body, '$.cause') END AS cause,
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
  if (faults.length > 0) facts.push(`${count(faults.length, 'question was', 'questions were')} opened by the record failing: ${askedIn(sql, faults[0]!.id)}`);
  const red = shared.length > 0 || uncaused.length > UNCAUSED_MOST || faults.length > 0;
  const biggest = shared[0];
  if (!red) return reading('green', open.length, open.length === 0 ? 'No question is waiting.' : `${count(open.length, 'open question')}, no two with the same cause.`, facts);
  const said = biggest
    ? `${biggest.length} open questions share one cause: ${askedIn(sql, biggest[0]!)} One answer closes them.`
    : faults.length > 0
      ? `${count(faults.length, 'open question is', 'open questions are')} a fault of the record, not a choice for you.`
      : `${uncaused.length} open questions carry no cause.`;
  return reading('red', biggest?.length ?? (faults.length || uncaused.length), said, facts);
}

function readOldest(sql: Sql, nowMs: number, tz: string): SignReading {
  if (!everAsked(sql)) return reading('none', null, 'Nothing has been asked on this record yet.');
  const oldest = sql.one<{ id: string; at: string }>(`SELECT id, opened_at AS at FROM suggestion WHERE ${OPEN} ORDER BY opened_at LIMIT 1`, new Date(nowMs).toISOString());
  if (oldest === undefined) return reading('green', 0, 'No question is waiting.');
  const days = Math.max(0, Math.floor((nowMs - Date.parse(oldest.at)) / DAY));
  const facts = [`Asked on ${dateSaid(oldest.at, tz, nowMs)}: ${askedIn(sql, oldest.id)}`];
  const said = `The oldest open question is ${count(days, 'day')} old.`;
  return reading(days > QUESTION_DAYS_MOST ? 'red' : 'green', days, said, facts);
}

/* ── runs-true ─────────────────────────────────────────────────────────── */

function readRuns(sql: Sql, nowMs: number): SignReading {
  const since = new Date(nowMs - RUNS_WINDOW_DAYS * DAY).toISOString();
  const HEARD = "coalesce(json_extract(fields, '$.last_seen'), updated_at)";
  const AGENT = "coalesce(json_extract(fields, '$.client'), json_extract(fields, '$.agent'))";
  /* A HANDOFF THE SWEEP WROTE IS A RUN THAT WENT SILENT, not one that ended: `sweepSessions` hands off a run that crashed
     after leaving a step, and its `state` line is by `system`. A run that handed off itself signs its own line. Read in
     the same query, the newest `state` line of each handoff, so a week of runs is one read and not one a run. */
  const runs = sql.all<{ state: string | null; swept: number }>(
    `SELECT state, (state = 'handoff' AND coalesce((SELECT e.actor FROM event e WHERE e.target = 'entry:' || entry.id AND e.kind = 'state'
       ORDER BY e.ts DESC, e.rowid DESC LIMIT 1), '') = 'system') AS swept
     FROM entry WHERE register = 'session' AND deleted_at IS NULL AND ${HEARD} >= ?`,
    since,
  );
  /* STILL OPEN LONG AFTER IT WAS LAST HEARD FROM: the sweep that writes such a run off did not. AT ANY AGE, not only this
     week's: a run the sweep never wrote off falls out of the window and would read as no run at all. */
  const silent = sql.all<{ heard: string; agent: string | null }>(
    `SELECT ${HEARD} AS heard, ${AGENT} AS agent FROM entry WHERE register = 'session' AND deleted_at IS NULL AND state IN ('active', 'idle') AND ${HEARD} < ? ORDER BY heard`,
    new Date(nowMs - RUN_SILENT_MS).toISOString(),
  );
  if (runs.length === 0 && silent.length === 0) return reading('none', null, `No agent has run on this record in ${RUNS_WINDOW_DAYS} days.`);
  const ended = runs.filter((r) => r.state === 'done' || r.state === 'abandoned' || r.state === 'handoff');
  const abandoned = ended.filter((r) => r.state === 'abandoned').length;
  const swept = ended.filter((r) => Number(r.swept) === 1).length;
  const gone = abandoned + swept;
  const lost = ended.length >= RUNS_ENDED_LEAST && gone * RUNS_ABANDONED_ONE_IN > ended.length;
  const facts = [`${count(runs.length, 'run')} this week, ${ended.length} ended, ${abandoned} of them abandoned.`];
  if (swept > 0) facts.push(`${count(swept, 'run')} went silent and ${swept === 1 ? 'was' : 'were'} left waiting with ${swept === 1 ? 'its' : 'their'} next step, not ended.`);
  if (silent.length > 0) {
    const ago = nowMs - Date.parse(silent[0]!.heard);
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

/* ── the closed list ───────────────────────────────────────────────────── */

/* A READER WHOSE RULE CHANGED WITHOUT A THRESHOLD MOVING TAKES THE NEXT VERSION, so its days read under the old rule keep
   the old `rule`. Version 2 (audit 35): arrivals all set aside, a young series read by its feed, a run the sweep handed off. */
const kernel = (sign: string, name: string, thresholds: Record<string, number>, read: NonNullable<SignReader['read']>, version = 1): SignReader => ({ sign, name, hand: 'kernel', version, thresholds, read });
const filed = (sign: string, name: string, hand: 'record' | 'host'): SignReader => ({ sign, name, hand, version: 1, thresholds: {}, read: null });

/**
 * THE KERNEL'S FIVE AND THE FOUR FILED, in the order 2.2 sets them, then the seven automation signs (SHL-D01,
 * `signs-flow.ts`) with one spread. The ids are 2.2's; a person reads the names.
 */
export const VITAL_SIGNS: readonly SignReader[] = [
  kernel('arrivals-filed', 'Arrivals file by themselves', { ARRIVAL_WAIT_MS, ARRIVALS_WAITING_MOST, ARRIVAL_AHEAD_MS, ARRIVALS_WINDOW_DAYS }, readArrivals, 2),
  kernel('numbers-arrive', 'Numbers arrive on schedule', { FEED_LATE_PERIODS, SERIES_POINTS_LEAST, SERIES_GAP_TIMES, SERIES_STALE_DAYS, SERIES_STALE_ONE_IN }, readNumbers, 2),
  filed('model-answers', 'The model answers', 'host'),
  filed('tools-listed', 'Agents get the tool list', 'host'),
  filed('briefing-true', 'The briefing is true', 'record'),
  kernel('questions-by-cause', 'One question per cause', { CAUSE_QUESTIONS_MOST, UNCAUSED_MOST }, (sql, nowMs) => readCauses(sql, nowMs)),
  kernel('oldest-question', 'No question waits too long', { QUESTION_DAYS_MOST }, readOldest),
  kernel('runs-true', 'Runs end as they ended', { RUNS_WINDOW_DAYS, RUN_SILENT_MS, RUNS_ENDED_LEAST, RUNS_ABANDONED_ONE_IN }, (sql, nowMs) => readRuns(sql, nowMs), 2),
  filed('pages-clean', 'Pages print clean', 'host'),
  ...SIGNS_FLOW,
];

/** The sign called `id` on the closed list, or `null`. */
export const signOf = (id: string): SignReader | null => VITAL_SIGNS.find((s) => s.sign === id) ?? null;

/** What the night writes for a filed sign on a day nothing was filed: a placeholder, never a filing. */
const NOT_FILED = 'Nothing was filed for this sign that day.';

/** One sign read now. A reader that throws reads `none` with its own words, never green and never a throw out of here. */
function readNow(sql: Sql, s: SignReader, nowMs: number, tz: string): SignReading {
  if (s.read !== null) {
    try {
      return s.read(sql, nowMs, tz);
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
  if (row === undefined) return reading('none', null, 'Nothing has been filed for this sign yet.');
  if (nowMs - Date.parse(row.read_at) > FILED_STANDS_MS)
    return reading('none', null, `Not read since ${dateSaid(row.read_at, tz, nowMs)}.`, [`It last read ${row.state === 'none' ? 'nothing to judge by' : row.state}: ${row.said}`.slice(0, 200)]);
  const facts = JSON.parse(row.facts) as unknown;
  return reading(row.state, row.value === null ? null : Number(row.value), row.said, Array.isArray(facts) ? facts.map(String) : []);
}

/** Every sign now, with its last fourteen days, oldest first; a day with no reading is `none`. */
export function readSigns(sql: Sql, nowMs: number, tz: string): VitalSign[] {
  const today = dayIn(nowMs, safeZone(tz));
  const first = dayBefore(today, 14);
  const kept = new Map<string, SignState>();
  for (const r of sql.all<{ sign: string; day: string; state: SignState }>('SELECT sign, day, state FROM sign_reading WHERE day >= ? AND day < ?', first, today))
    kept.set(`${r.sign} ${r.day}`, r.state);
  return VITAL_SIGNS.map((s) => {
    const now = readNow(sql, s, nowMs, safeZone(tz));
    const days = Array.from({ length: 14 }, (_, i) => dayBefore(today, 14 - i)).map((day) => ({ day, state: kept.get(`${s.sign} ${day}`) ?? ('none' as const) }));
    return { sign: s.sign, name: s.name, state: now.state, value: now.value, said: now.said, facts: now.facts ?? [], days };
  });
}

/** What a filed reading may hold. */
const SAID_MOST = 280;
const FACTS_MOST = 6;
const FACT_MOST = 200;

/**
 * The record layer or the host files today's reading of one of the four signs it owns. A later filing the same day
 * replaces the earlier one. Refuses an id outside the list, one the kernel reads itself, and a reading out of shape.
 */
export function fileSignReading(sql: Sql, id: string, r: SignReading, nowMs: number, tz: string): Result<{ sign: string; day: string }> {
  const s = signOf(id);
  if (s === null) return no('REF_UNKNOWN', `${JSON.stringify(id).slice(0, 60)} is not a sign. The signs filed from outside are ${VITAL_SIGNS.filter((x) => x.read === null).map((x) => x.sign).join(', ')}.`);
  if (s.read !== null) return no('FORBIDDEN', `${s.name} is read by the record itself, so nothing files it. File one of ${VITAL_SIGNS.filter((x) => x.read === null).map((x) => x.sign).join(', ')}.`);
  if (r === null || typeof r !== 'object' || !['green', 'red', 'none'].includes(r.state as string))
    return no('VALUE_MALFORMED', 'A reading is { state, value, said, facts }, and its state is green, red or none.');
  if (r.value !== null && !Number.isSafeInteger(r.value)) return no('VALUE_MALFORMED', "A reading's value is a whole number, or null when there is none.");
  if (typeof r.said !== 'string' || r.said.trim() === '' || r.said.length > SAID_MOST)
    return no('VALUE_MALFORMED', `A reading says one sentence of 1 to ${SAID_MOST} characters.`);
  const facts = r.facts ?? [];
  if (!Array.isArray(facts) || facts.length > FACTS_MOST || facts.some((f) => typeof f !== 'string' || f.length > FACT_MOST))
    return no('VALUE_MALFORMED', `A reading's facts are at most ${FACTS_MOST} lines of at most ${FACT_MOST} characters.`);
  const day = dayIn(nowMs, safeZone(tz));
  write(sql, s, day, { state: r.state, value: r.value, said: r.said.trim(), facts }, nowMs, true);
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
    JSON.stringify(r.facts ?? []),
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
