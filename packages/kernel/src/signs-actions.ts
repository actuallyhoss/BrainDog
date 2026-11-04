/**
 * The signs of what runs by itself and what arrives: five readings in the shape `signs.ts` sets,
 * joined to its closed list with one import and one spread, and the read a project's blockers take from
 * (`actionsBlocking`, for REC-C09).
 *
 * WHY THIS EXISTS. "Now needs to name a failed `pull` too", "a dead job", "a run is never skipped
 * silently". A paused action showed its last status in "Runs on" and nowhere else; a schedule row that failed
 * eight times became one question in Decide per dead job; no sign read the schedule, the meter or the doors. Since
 * AGT-C06 the eighth attempt raises a fault for the operator (`schedule.ts`), and the owner sees one line here.
 *
 * NO `actions-late`: `numbers-arrive` reads a scheduled action whose last good run is older than twice its interval
 * (`signs.ts`'s `feedsOn`), and a second sign over the same fact would be red twice for one fault.
 *
 * NONE IS NOT GREEN, as in `signs.ts`: no action declared, nothing scheduled but the record's own upkeep, no door busy
 * enough to judge its silence, nothing arrived in seven days, is nothing to judge by and says so.
 *
 * ONLY TYPES COME FROM `signs.ts`. It spreads `SIGNS_ACTIONS` into `VITAL_SIGNS` at load, so a value imported back from
 * it would be read before it exists whenever this file is the one loaded first.
 */

import type { Sql } from '@braindog/ports';

import { ACTION_KINDS, listActions, type ActionRow } from './actions.ts';
import { UNVERIFIED } from './ingest.ts';
import { intervalMs } from './pull.ts';
import type { SignLasts, SignReader, SignReading, SignState } from './signs.ts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/* ── the thresholds, one line each ───────────────────────────────────── */

/** Red when more than this many scheduled actions are paused (review-measure 3.2: 0). */
export const ACTIONS_PAUSED_MOST = 0;
/** Red when the plan's limit held more than this many runs this calendar month. */
export const ACTIONS_HELD_MOST = 0;
/** Red when more than this many scheduled jobs have stopped as failed (review-measure 3.2: 0). */
export const SCHEDULE_FAILED_MOST = 0;
/** A door is judged once this many arrivals filed through it in the days before the quiet window... */
export const DOOR_BUSY_LEAST = 10;
/** ...over this many days... */
export const DOOR_BUSY_DAYS = 14;
/** ...and is silent when none filed through it in this many days since. */
export const DOOR_QUIET_DAYS = 3;
/** Arrivals of this many days are judged for verification. */
export const UNVERIFIED_WINDOW_DAYS = 7;
/** Red when more than this many arrivals in the window were verified by nothing (review-measure 3.2: 0). */
export const UNVERIFIED_MOST = 0;
/**
 * A project's action is late when its last good run is older than this many of its periods: `signs.ts`'s
 * `FEED_LATE_PERIODS`, which this file may not import (see above), held equal by `signs-actions.test.ts`.
 */
export const ACTION_LATE_PERIODS = 2;

/** The schedule's own upkeep, which a person never set up: it says nothing about what runs for them. */
const UPKEEP_KINDS: readonly string[] = ['purge', 'retry', 'rotate', 'analyse'];
/** The night's reading of the signs (`SIGNS_KEY` in `signs.ts`), upkeep too. */
const SIGNS_ROW = { kind: 'snapshot', key: 'signs' } as const;

/* ── helpers ───────────────────────────────────────────────────────────── */

const reading = (state: SignState, value: number | null, said: string, facts: string[] = []): SignReading => ({ state, value, said, facts: facts.slice(0, 6) });

/** `n thing` or `n things`. */
const count = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** An id said as words, only where nothing declares a name: `oxbow-revenue` is `oxbow revenue`. */
const plain = (id: string): string => id.replace(/[-_.:]+/g, ' ').trim();

/** `A`, `A and B`, `A, B and C`, or the first three and how many more. */
function names(all: readonly string[]): string {
  const shown = all.slice(0, 3);
  const more = all.length - shown.length;
  if (more > 0) return `${shown.join(', ')} and ${more} more`;
  return shown.length <= 1 ? (shown[0] ?? '') : `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)!}`;
}

/** A JSON object, or `null`. */
function parsed(text: string | null | undefined): Record<string, unknown> | null {
  if (typeof text !== 'string') return null;
  try {
    const v: unknown = JSON.parse(text);
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A day a person reads, in the record's zone: `28 September`. A zone this runtime cannot read is UTC. */
function daySaid(at: string, tz: string): string {
  const ms = Date.parse(at);
  if (Number.isNaN(ms)) return 'an unknown day';
  for (const timeZone of [tz, 'UTC']) {
    try {
      return new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'long' }).format(ms);
    } catch {
      /* the next zone */
    }
  }
  return new Date(ms).toISOString().slice(0, 10);
}

/** The first of `fields` that is a non-empty string on a declaration's newest version, live or not, or `null`. */
function declaredName(sql: Sql, id: string, fields: readonly string[]): string | null {
  const body = parsed(sql.one<{ body: string }>('SELECT body FROM declaration WHERE id = ? ORDER BY version DESC LIMIT 1', id)?.body);
  for (const f of fields) if (typeof body?.[f] === 'string' && (body[f] as string).trim() !== '') return (body[f] as string).trim();
  return null;
}

/** A door's or an action's name: its description, then its name, then its id said as words. */
const ingestName = (sql: Sql, bare: string): string => declaredName(sql, `ingest.${bare}`, ['description', 'name']) ?? plain(bare);

/** What a person reads for a schedule kind that names nothing of its own. */
const KIND_WORDS: Readonly<Record<string, string>> = {
  reminder: 'A reminder',
  retry: 'A retry of something sent out',
  purge: "BrainDog's clean-up",
  rotate: 'A key rotation',
  analyse: "BrainDog's weekly look at itself",
  score: 'A scoring pass',
  digest: 'A digest',
  snapshot: 'A nightly reading',
  rule: 'An automation',
  script: 'A script',
};

/** A scheduled job's name: the declaration it runs for, by its kind, or the kind said plainly. */
function jobName(sql: Sql, kind: string, key: string): string {
  if ((ACTION_KINDS as readonly string[]).includes(kind)) return ingestName(sql, key);
  const found =
    kind === 'script' ? declaredName(sql, `script.${key}`, ['title'])
    : kind === 'rule' ? declaredName(sql, `rule.${key}`, ['name'])
    : kind === 'digest' ? declaredName(sql, `digest.${key}`, ['name', 'title'])
    : kind === 'snapshot' ? (declaredName(sql, `metric.${key}`, ['name']) ?? declaredName(sql, `register.${key}`, ['name']))
    : null;
  if (found !== null) return found;
  if (kind === SIGNS_ROW.kind && key === SIGNS_ROW.key) return 'The nightly reading of these signs';
  return KIND_WORDS[kind] ?? plain(kind);
}

/** An action's name, as a person reads it. */
const actionName = (sql: Sql, a: Pick<ActionRow, 'ingest'>): string => ingestName(sql, a.ingest);

/** What a provider's status says, in words, with the number kept for whoever reports it on. */
function statusSaid(status: number | null, outcome: string | null): string {
  if (status === 401 || status === 403) return `its key was refused (${status})`;
  if (status === 404 || status === 410) return `the address it asks was not found (${status})`;
  if (status === 429) return 'it was asked too often (429)';
  if (status !== null && status >= 500) return `the provider failed on its side (${status})`;
  if (status !== null && status >= 400) return `the provider turned it away (${status})`;
  if (outcome === 'held') return "the plan's limit held it";
  if (outcome === 'refused') return 'BrainDog refused to send it';
  if (outcome === 'dropped') return 'its answer could not be read';
  return 'its last run did not finish';
}

/**
 * NOTHING HERE CALLS OUT ON A CLOCK. An action is a web call a record makes on a schedule (`ACTION_KINDS`), and "no
 * action runs on a schedule" stood beside scripts and digests that run daily, so it says which.
 */
const NO_WEB_CALL = 'No web call runs on a schedule yet.';

/* ── actions-paused ────────────────────────────────────────────────────── */

function readActionsPaused(sql: Sql, nowMs: number, tz: string): SignReading {
  const actions = listActions(sql, nowMs);
  if (actions.length === 0) return reading('none', null, NO_WEB_CALL);
  const paused = actions.filter((a) => a.state === 'paused');
  const facts = [`${count(actions.length, 'action')} on a schedule, ${paused.length} paused.`];
  if (paused.length <= ACTIONS_PAUSED_MOST) return reading('green', paused.length, 'No action that runs on a schedule is paused.', facts);
  for (const a of paused)
    facts.push(a.last === null ? `${actionName(sql, a)} is paused and has never run.` : `${actionName(sql, a)} has been paused since ${daySaid(a.last.at, tz)}: ${statusSaid(a.last.status, a.last.outcome)}.`);
  return reading('red', paused.length, `${count(paused.length, 'action is', 'actions are')} paused and will not run until somebody resumes ${paused.length === 1 ? 'it' : 'them'}: ${names(paused.map((a) => actionName(sql, a)))}.`, facts);
}

/* ── actions-held ──────────────────────────────────────────────────────── */

function readActionsHeld(sql: Sql, nowMs: number): SignReading {
  const actions = listActions(sql, nowMs);
  if (actions.length === 0) return reading('none', null, NO_WEB_CALL);
  const held = actions.filter((a) => a.month.held > 0).sort((a, b) => b.month.held - a.month.held);
  const total = held.reduce((n, a) => n + a.month.held, 0);
  if (total <= ACTIONS_HELD_MOST) return reading('green', total, "The plan's limit held no run this month.", [`${count(actions.length, 'action')} on a schedule.`]);
  const facts = held.map((a) => `${actionName(sql, a)}: ${count(a.month.held, 'run')} held this month.`);
  return reading('red', total, `The plan's limit held ${count(total, 'run')} this month, so ${held.length === 1 ? 'one action' : `${held.length} actions`} did not run when due: ${names(held.map((a) => actionName(sql, a)))}.`, facts);
}

/* ── schedule-failed ───────────────────────────────────────────────────── */

function readScheduleFailed(sql: Sql, _nowMs: number, tz: string): SignReading {
  const failed = sql.all<{ kind: string; key: string; due_at: string }>("SELECT kind, key, due_at FROM schedule WHERE state = 'failed' ORDER BY due_at DESC");
  if (failed.length === 0) {
    /* NOTHING A PERSON SET UP IS SCHEDULED: the record's own upkeep running is not a thing that runs for them. */
    const theirs = sql.all<{ kind: string; key: string }>("SELECT kind, key FROM schedule WHERE state <> 'done'").filter(
      (r) => !UPKEEP_KINDS.includes(r.kind) && !(r.kind === SIGNS_ROW.kind && r.key === SIGNS_ROW.key),
    );
    if (theirs.length === 0) return reading('none', null, 'Nothing runs by itself yet.');
    return reading('green', 0, 'Nothing that runs by itself has stopped after failing.', [`${count(theirs.length, 'job')} on the schedule.`]);
  }
  const named = failed.map((r) => ({ name: jobName(sql, r.kind, r.key), at: r.due_at }));
  if (failed.length <= SCHEDULE_FAILED_MOST) return reading('green', failed.length, 'Nothing that runs by itself has stopped after failing.');
  const facts = named.map((j) => `${j.name} last tried on ${daySaid(j.at, tz)} and stopped after failing again and again.`);
  return reading('red', failed.length, `${count(failed.length, 'job that runs by itself has', 'jobs that run by themselves have')} stopped after failing: ${names(named.map((j) => j.name))}. The operator has been told.`, facts);
}

/* ── doors-silent ──────────────────────────────────────────────────────── */

/* A DOOR IS A LIVE PATTERN THAT FILES WHAT ARRIVES, counted by its receipts. ONE RETIRED IS NOT JUDGED: a door he turned
   off is quiet for a good reason, the risk the brief names ("Risk"), and so is one switched off at its door
   (`ingest_off.<id>`, the record's `door-switch.ts`).

   PATTERNS THAT SHARE A DOOR ARE JUDGED AS THE DOOR (`door` on the declaration). His phone sends every HSBC text to one
   address, and seven patterns read what comes through it. One kind of text not coming for three days, while the card's
   and the cash machine's came through the same address that same day, said a door had gone silent when he had only sent
   no InstaPay: the question this sign asks is whether the sender stopped. A kind of text the bank rewrites still shows,
   as texts no pattern reads, in `arrivals-filed`. The kind that went quiet is said in the facts. */
function readDoorsSilent(sql: Sql, nowMs: number, tz: string, lasts: SignLasts = () => undefined): SignReading {
  const quietFrom = new Date(nowMs - DOOR_QUIET_DAYS * DAY).toISOString();
  const busyFrom = new Date(nowMs - (DOOR_QUIET_DAYS + DOOR_BUSY_DAYS) * DAY).toISOString();
  const doors = sql.all<{ ingest_id: string; door: string | null; before: number; since: number; last: string; first: string | null; quiet: string | null }>(
    `SELECT r.ingest_id, (SELECT json_extract(d.body, '$.door') FROM declaration d WHERE d.id = 'ingest.' || r.ingest_id AND d.superseded_at IS NULL AND json_valid(d.body)) AS door,
            count(DISTINCT CASE WHEN r.ts < ? THEN r.raw_id END) AS before, count(DISTINCT CASE WHEN r.ts >= ? THEN r.raw_id END) AS since, max(r.ts) AS last,
            min(r.ts) AS first, min(CASE WHEN r.ts >= ? THEN r.ts END) AS quiet
       FROM ingest_receipt r
      WHERE r.ts >= ? AND EXISTS (SELECT 1 FROM declaration d WHERE d.id = 'ingest.' || r.ingest_id AND d.superseded_at IS NULL AND d.retired = 0)
        AND NOT EXISTS (SELECT 1 FROM dog_meta m WHERE m.key = 'ingest_off.' || r.ingest_id)
      GROUP BY r.ingest_id ORDER BY r.ingest_id`,
    quietFrom,
    quietFrom,
    quietFrom,
    busyFrom,
  );
  /* BY THE CLOCK ALONE (`SignLasts`): an arrival leaves the last few days for the two weeks before, or leaves both. */
  lasts(Infinity);
  for (const d of doors) {
    lasts(crossesAt(d.first, (DOOR_QUIET_DAYS + DOOR_BUSY_DAYS) * DAY));
    lasts(crossesAt(d.quiet, DOOR_QUIET_DAYS * DAY));
  }
  /* EACH DOOR WITH ALL ITS PATTERNS: one a pattern that names no door. A message read by two patterns counts twice here,
     which only ever makes a door look busier, and never one that had nothing look as if it had. */
  const byDoor = new Map<string, { ingest_id: string; before: number; since: number; last: string; patterns: typeof doors }>();
  for (const d of doors) {
    const key = typeof d.door === 'string' && d.door !== '' ? d.door : d.ingest_id;
    const was = byDoor.get(key);
    if (was === undefined) byDoor.set(key, { ingest_id: key, before: Number(d.before), since: Number(d.since), last: d.last, patterns: [d] });
    else {
      was.before += Number(d.before);
      was.since += Number(d.since);
      if (d.last > was.last) was.last = d.last;
      was.patterns.push(d);
    }
  }
  const busy = [...byDoor.values()].filter((d) => d.before >= DOOR_BUSY_LEAST);
  if (busy.length === 0) return reading('none', null, `No way in has had ${DOOR_BUSY_LEAST} messages in two weeks yet, so none is watched for going quiet.`);
  const silent = busy.filter((d) => d.since === 0).map((d) => ({ ...d, name: ingestName(sql, d.ingest_id) }));
  const facts = [`${count(busy.length, 'busy door')}, ${silent.length} quiet for ${DOOR_QUIET_DAYS} days.`];
  /* ONE KIND OF MESSAGE QUIET AT A DOOR STILL OPEN IS SAID, never judged: it may only be that nothing of that kind was sent. */
  for (const d of busy)
    if (d.since > 0)
      for (const p of d.patterns)
        if (Number(p.before) >= DOOR_BUSY_LEAST && Number(p.since) === 0)
          facts.push(`${ingestName(sql, p.ingest_id)} filed nothing in ${DOOR_QUIET_DAYS} days after ${count(Number(p.before), 'arrival')} in the ${DOOR_BUSY_DAYS} days before, the last on ${daySaid(p.last, tz)}. Other messages still come through the same door.`);
  if (silent.length === 0) return reading('green', 0, `Every busy way in has had messages in the last ${DOOR_QUIET_DAYS} days.`, facts);
  facts.push(...silent.map((d) => `${d.name} filed ${count(Number(d.before), 'arrival')} in the ${DOOR_BUSY_DAYS} days before, the last on ${daySaid(d.last, tz)}.`));
  const one = silent[0]!;
  return reading(
    'red',
    silent.length,
    silent.length === 1
      ? `${one.name} has had nothing in ${DOOR_QUIET_DAYS} days, after ${count(Number(one.before), 'arrival')} in the ${DOOR_BUSY_DAYS} days before.`
      : `${silent.length} doors have had nothing in ${DOOR_QUIET_DAYS} days after a busy two weeks: ${names(silent.map((d) => d.name))}.`,
    facts,
  );
}

/* ── arrivals-unverified ───────────────────────────────────────────────── */

/** How a message came in, as a person reads it. */
const CAME: Readonly<Record<string, string>> = { email: 'by email', webhook: 'through a webhook', api: 'through the API', paste: 'by paste', pull: 'by a fetch' };

/* AN ARRIVAL NOTHING VERIFIED (`ingest.ts`'s `UNVERIFIED`, the exact string written on the row) was offered to no
   pattern. A forgery is the sender's fault, but a door whose signing broke makes every real message one of these, and
   nothing else on the record says so: `arrivals-filed` counts them out on purpose. */
function readUnverified(sql: Sql, nowMs: number, tz: string, lasts: SignLasts = () => undefined): SignReading {
  const since = new Date(nowMs - UNVERIFIED_WINDOW_DAYS * DAY).toISOString();
  const window = sql.one<{ n: number; first: string | null }>("SELECT count(*) AS n, min(ts) AS first FROM inbox_raw WHERE state <> 'erased' AND ts >= ?", since);
  /* THE OLDEST MESSAGE IN THE WINDOW LEAVES IT by the clock alone (`SignLasts`). */
  lasts(crossesAt(window?.first, UNVERIFIED_WINDOW_DAYS * DAY));
  const all = Number(window?.n ?? 0);
  if (all === 0) return reading('none', null, `Nothing has come in for ${UNVERIFIED_WINDOW_DAYS} days, so there is nothing to judge by.`);
  const by = sql.all<{ channel: string; n: number; last: string }>(
    "SELECT channel, count(*) AS n, max(ts) AS last FROM inbox_raw WHERE state <> 'erased' AND ts >= ? AND reason = ? GROUP BY channel ORDER BY n DESC, channel",
    since,
    UNVERIFIED,
  );
  const n = by.reduce((s, r) => s + Number(r.n), 0);
  const facts = [`${count(all, 'message')} came in over ${UNVERIFIED_WINDOW_DAYS} days, ${n} verified by nothing.`];
  if (n <= UNVERIFIED_MOST) return reading('green', n, `Every message in ${UNVERIFIED_WINDOW_DAYS} days came from where its door expects.`, facts);
  facts.push(...by.map((r) => `${Number(r.n)} came in ${CAME[r.channel] ?? plain(r.channel)}, the newest on ${daySaid(r.last, tz)}.`));
  return reading('red', n, `${count(n, 'message', 'messages')} in ${UNVERIFIED_WINDOW_DAYS} days came in that nothing verified, so no pattern was offered ${n === 1 ? 'it' : 'them'}.`, facts);
}

/* ── what is in a project's way ────────────────────────────────────────── */

/** One scheduled action in a project's way, for the record's read of its blockers. */
export type ActionBlocking = {
  /** The action's handle, for an agent beside its name. Never in `said`. */
  action: string;
  name: string;
  why: 'paused' | 'failed' | 'late';
  /** When it last ran well, or `null` when it never has. */
  since: string | null;
  /** The provider's status on the last run, when it answered one. */
  status: number | null;
  /** One sentence a person reads: "Oxbow revenue has not answered since 4 October: its key was refused (401)." */
  said: string;
};

/** A run that did its work: a pull's `ok`, a poll's `changed` or `unchanged`. */
const GOOD = ['ok', 'changed', 'unchanged'];

/**
 * The project's scheduled actions that are paused, stopped as failed, or late (the last good run older than
 * `ACTION_LATE_PERIODS` of its interval), each in one sentence with the provider's status. PURE: it reads and writes
 * nothing else. `project` is what the action's declaration holds, or the project's row id or spoken id; an action for
 * every project is in no one project's way.
 */
export function actionsBlocking(sql: Sql, nowMs: number, project: string, tz = 'UTC'): ActionBlocking[] {
  const out: ActionBlocking[] = [];
  for (const a of listActions(sql, nowMs)) {
    if (a.project === null || a.project === 'global' || ![a.project, a.project_row?.id, a.project_row?.spoken].includes(project)) continue;
    const row = sql.one<{ state: string }>('SELECT state FROM schedule WHERE kind = ? AND key = ?', a.channel, a.ingest);
    const good = sql.one<{ ts: string | null }>(
      `SELECT max(ts) AS ts FROM event WHERE kind = 'pull' AND target = ? AND json_valid(to_v) AND json_extract(to_v, '$.outcome') IN (SELECT value FROM json_each(?))`,
      `declaration:ingest.${a.ingest}`,
      JSON.stringify(GOOD),
    )?.ts ?? null;
    let why: ActionBlocking['why'] | null = row?.state === 'failed' ? 'failed' : a.state === 'paused' ? 'paused' : null;
    const every = a.every === '' ? null : intervalMs(a.every);
    if (why === null && every !== null && (a.state === 'pending' || a.state === 'firing')) {
      const from = good ?? sql.one<{ at: string | null }>('SELECT min(created_at) AS at FROM declaration WHERE id = ?', `ingest.${a.ingest}`)?.at ?? null;
      if (from !== null && nowMs - Date.parse(from) > ACTION_LATE_PERIODS * every) why = 'late';
    }
    if (why === null) continue;
    const name = actionName(sql, a);
    const bad = a.last !== null && !GOOD.includes(a.last.outcome);
    const head = good === null ? `${name} has never answered` : `${name} has not answered since ${daySaid(good, tz)}`;
    /* A JOB THAT DIED BEFORE ITS FIRST RUN did run, and failed: "it has not run yet" beside "it stopped after failing"
       says two things at once. */
    const reason = bad ? `: ${statusSaid(a.last!.status, a.last!.outcome)}` : a.last === null && why !== 'failed' ? ': it has not run yet' : '';
    const tail = why === 'paused' ? ' It is paused until somebody resumes it.' : why === 'failed' ? ' It stopped after failing again and again.' : '';
    out.push({ action: a.ingest, name, why, since: good, status: bad ? a.last!.status : null, said: `${head}${reason}.${tail}` });
  }
  return out;
}

/* ── the list ──────────────────────────────────────────────────────────── */

const kernel = (sign: string, name: string, thresholds: Record<string, number>, read: NonNullable<SignReader['read']>): SignReader => ({ sign, name, hand: 'kernel', version: 1, thresholds, read });

/** The instant an ISO time crosses a line `ms` after it, or `Infinity` for none: a time that cannot be read never crosses. */
const crossesAt = (at: string | null | undefined, ms: number): number => {
  const t = typeof at === 'string' ? Date.parse(at) : Number.NaN;
  return Number.isNaN(t) ? Infinity : t + ms;
};

/** The first instant of the next calendar month, UTC, where an action's month (`listActions`) begins again. */
const monthAfter = (nowMs: number): number => {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
};

/**
 * THE FIVE, in SHL-C01's order less `actions.late`. `signs.ts` joins them to `VITAL_SIGNS` with `...SIGNS_ACTIONS`. The
 * ids are kebab case, as PRF-A01's are; a person reads the names.
 */
export const SIGNS_ACTIONS: readonly SignReader[] = [
  /* HOW LONG EACH STANDS BY THE CLOCK ALONE (`SignLasts`): what is paused or has died moves only with a write; what the
     plan held is counted by the month. */
  kernel('actions-paused', 'No scheduled action is paused', { ACTIONS_PAUSED_MOST }, (sql, nowMs, tz, lasts) => (lasts?.(Infinity), readActionsPaused(sql, nowMs, tz))),
  kernel('actions-held', "Runs fit the plan's limit", { ACTIONS_HELD_MOST }, (sql, nowMs, _tz, lasts) => (lasts?.(monthAfter(nowMs)), readActionsHeld(sql, nowMs))),
  kernel('schedule-failed', 'Nothing that runs by itself has died', { SCHEDULE_FAILED_MOST }, (sql, nowMs, tz, lasts) => (lasts?.(Infinity), readScheduleFailed(sql, nowMs, tz))),
  kernel('doors-silent', 'Messages keep arriving', { DOOR_BUSY_LEAST, DOOR_BUSY_DAYS, DOOR_QUIET_DAYS }, readDoorsSilent),
  kernel('arrivals-unverified', 'Every arrival is verified', { UNVERIFIED_WINDOW_DAYS, UNVERIFIED_MOST }, readUnverified),
];
