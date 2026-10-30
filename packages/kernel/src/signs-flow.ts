/**
 * The signs of scripts and automations: seven readings in the shape `signs.ts` sets, joined to its
 * closed list with one import and one spread.
 *
 * WHY THIS EXISTS. A paused script showed on `/scripts` only, and on the owner's record the hub read "76 automations
 * run by themselves, and none failed this month" over a month that held one run. Nothing read either daily. These read the
 * record's own rows (the script and rule declarations, the runs `meter` signs, `automation_run` and its steps) and say
 * what they find with names, never ids, on every record alike.
 *
 * NONE IS NOT GREEN, as in `signs.ts`: no script installed, no automation switched on, no run this week, is nothing to
 * judge by and says so.
 *
 * `automations-idle` NEVER READS RED. PRF-A01 has three states and no amber, and a rule that waits for rows that do not
 * arrive yet is not a fault of the rule. It reads green with its count in its sentence and facts, so the number is
 * there to read without the sign going red for good on a record whose arrivals are broken elsewhere. THE SENTENCE LEADS
 * WITH THAT COUNT, "70 of 76 automations have never run", because a green sign is read as "all fine" past its first
 * words, and on the owner's record the first words were "Of 76 automations switched on".
 *
 * ONLY TYPES COME FROM `signs.ts`. It spreads `SIGNS_FLOW` into `VITAL_SIGNS` at load, so a value imported back from it
 * would be read before it exists whenever this file is the one loaded first.
 */

import type { Sql } from '@braindog/ports';

import { ASK_PERSON_WAIT, runKey } from './flow.ts';
import { intervalMs } from './pull.ts';
import type { SignLasts, SignReader, SignReading, SignState } from './signs.ts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/* ── the thresholds, one line each ───────────────────────────────────── */

/** Red when more than this many installed scripts are paused. */
export const SCRIPTS_PAUSED_MOST = 0;
/** Red when more than this many installed scripts ended their last run refused. */
export const SCRIPTS_REFUSED_MOST = 0;
/** Red when more than this many installed scripts hold no source a read could answer. */
export const SCRIPTS_SOURCELESS_MOST = 0;
/** Runs of this many days are judged, for failed runs and stopped chains. */
export const FLOW_WINDOW_DAYS = 7;
/** Red when more than this many automation runs failed in the window. */
export const AUTOMATIONS_FAILED_MOST = 0;
/** A run asking a person is parked once its wake is this far past due and it still waits. */
export const PARKED_GRACE_MS = HOUR;
/** Red when more than this many runs are parked past their wait. */
export const AUTOMATIONS_PARKED_MOST = 0;
/** An automation switched on longer than this many days that has never run is idle. Counted, never red. */
export const IDLE_AFTER_DAYS = 14;
/** Red when more than this many script runs stopped a chain in the window. */
export const CHAINS_STOPPED_MOST = 0;

/**
 * The words `script-run.ts` writes on an `ok` run whose writes reached the chain's bound (`chain.stopped` not empty).
 * The run's line is the only place the stop is kept; `$.stopped` on the run's `to_v` is read too, once the run writes it.
 */
export const CHAIN_STOPPED_SAID = ' Its writes started no ';

/* ── helpers ───────────────────────────────────────────────────────────── */

const reading = (state: SignState, value: number | null, said: string, facts: string[] = []): SignReading => ({ state, value, said, facts: facts.slice(0, 6) });

/** `n thing` or `n things`. */
const count = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** An id said as words, only where nothing declares a name: `gold-rate` is `gold rate`. */
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

/* ── scripts ───────────────────────────────────────────────────────────── */

type Script = { name: string; bare: string; version: number; body: Record<string, unknown> | null };

/** Every installed script: its bare id, the version now live, its body, and the name a person reads. */
function installedScripts(sql: Sql): Script[] {
  return sql
    .all<{ id: string; version: number; body: string }>("SELECT id, version, body FROM declaration WHERE kind = 'script' AND superseded_at IS NULL AND retired = 0 ORDER BY id")
    .map((d) => {
      const body = parsed(d.body);
      const bare = d.id.slice('script.'.length);
      const title = typeof body?.title === 'string' && body.title.trim() !== '' ? body.title.trim() : plain(bare);
      return { name: title, bare, version: Number(d.version), body };
    });
}

function readPaused(sql: Sql): SignReading {
  const scripts = installedScripts(sql);
  if (scripts.length === 0) return reading('none', null, 'No script is installed yet.');
  /* THE ROW PAUSING WRITES (`script-run.ts`'s `pauseAfterRefusals`): every installed script has one, door and rule ones too. */
  const paused = scripts.filter((s) => sql.one<{ state: string }>("SELECT state FROM schedule WHERE kind = 'script' AND key = ?", s.bare)?.state === 'paused');
  const facts = [`${count(scripts.length, 'script')} installed, ${paused.length} paused.`];
  if (paused.length <= SCRIPTS_PAUSED_MOST) return reading('green', paused.length, 'No script is paused.', facts);
  facts.push(...paused.map((s) => `${s.name} is paused and runs again only when somebody resumes it.`));
  return reading('red', paused.length, `${count(paused.length, 'script is', 'scripts are')} paused: ${names(paused.map((s) => s.name))}.`, facts);
}

/**
 * THE FIRST OF THIS CALENDAR MONTH, UTC, as Automations counts its month (`record/src/automations.ts`), so a green sign
 * and the screen it watches count the same runs.
 */
const monthFrom = (nowMs: number): string => `${new Date(nowMs).toISOString().slice(0, 7)}-01T00:00:00.000Z`;

/** The first instant of the next calendar month, UTC: where `monthFrom` moves by the clock alone (`SignLasts`). */
const monthAfter = (nowMs: number): number => {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
};

/** The instant an ISO time crosses a line `ms` after it, or `Infinity` for none: a time that cannot be read never crosses. */
const crossesAt = (at: string | null | undefined, ms: number): number => {
  const t = typeof at === 'string' ? Date.parse(at) : Number.NaN;
  return Number.isNaN(t) ? Infinity : t + ms;
};

/**
 * THE MONTH'S FAILURES SAID AFTER A GREEN SENTENCE: " 2 runs were refused earlier this month: Gold price." A sign
 * judges the last run or the last week, and it said "every script finished" under a month Automations counted four
 * failures in. What is judged does not move; the sentence says the rest. Nothing to say says nothing.
 */
function earlier(who: readonly string[], verb: 'refused' | 'failed'): string {
  if (who.length === 0) return '';
  const runs = verb === 'refused' ? count(who.length, 'run was', 'runs were') : count(who.length, 'run');
  return ` ${runs} ${verb} earlier this month: ${names(tally(who).map(([n]) => n))}.`;
}

function readRefused(sql: Sql, nowMs: number, tz: string, lasts: SignLasts = () => undefined): SignReading {
  /* THE MONTH'S REFUSALS ARE COUNTED FROM ITS FIRST DAY; nothing else here reads the clock. */
  lasts(monthAfter(nowMs));
  const scripts = installedScripts(sql);
  if (scripts.length === 0) return reading('none', null, 'No script is installed yet.');
  /* THE LAST RUN THAT RAN THE SOURCE NOW INSTALLED, as the pause reads it: `ok` or `refused`, signed by this version.
     A run held, dropped or failed by the host never ran the source, and a fixed version starts with a clean slate. */
  const last = scripts.flatMap((s) => {
    const run = sql.one<{ ts: string; outcome: string; note: string | null; log: string | null }>(
      `SELECT ts, json_extract(to_v, '$.outcome') AS outcome, note, json_extract(to_v, '$.log') AS log FROM event
        WHERE kind = 'pull' AND target = ? AND actor = ? AND json_valid(to_v) AND json_extract(to_v, '$.outcome') IN ('ok', 'refused')
        ORDER BY rowid DESC LIMIT 1`,
      `declaration:script.${s.bare}`,
      `script:${s.bare}@v${s.version}`,
    );
    return run ? [{ ...s, ...run }] : [];
  });
  if (last.length === 0) return reading('none', null, 'No installed script has run yet.');
  const refused = last.filter((r) => r.outcome === 'refused');
  const facts = [`${count(last.length, 'script has', 'scripts have')} run, ${refused.length} refused on the last run.`];
  if (refused.length <= SCRIPTS_REFUSED_MOST) {
    /* EVERY REFUSAL OF AN INSTALLED SCRIPT THIS MONTH, whichever version ran: the runs Scripts counts on its page. */
    const before = sql
      .all<{ target: string }>(
        `SELECT target FROM event WHERE kind = 'pull' AND target IN (SELECT value FROM json_each(?)) AND ts >= ? AND json_valid(to_v)
          AND json_extract(to_v, '$.outcome') = 'refused' ORDER BY rowid`,
        JSON.stringify(scripts.map((s) => `declaration:script.${s.bare}`)),
        monthFrom(nowMs),
      )
      .map((e) => scripts.find((s) => `declaration:script.${s.bare}` === e.target)!.name);
    return reading('green', refused.length, `Every script that ran finished its last run.${earlier(before, 'refused')}`, facts);
  }
  facts.push(...refused.map((r) => `${r.name} was refused on ${daySaid(r.ts, tz)}: it ${whyRefused(r.note, r.log)}.`));
  if (refused.length === 1) return reading('red', 1, `${refused[0]!.name} did not finish its last run: it ${whyRefused(refused[0]!.note, refused[0]!.log)}.`, facts);
  return reading('red', refused.length, `${refused.length} scripts did not finish their last run: ${names(refused.map((r) => `${r.name} ${whyRefused(r.note, r.log)}`))}.`, facts);
}

/**
 * Why a run was refused, as one clause after the script's name: `ran out of time`.
 *
 * SORTED, NEVER QUOTED. The reason is the first line of the run's log (`finishScript` puts the why there) or the
 * record's own note, and a why can quote what the script chose: its thrown message, a value the write path read back.
 * The log is held to an owner who reads every list the script touched (`lineOf` in `@braindog/record`), and a sign is
 * read by more people than that, so the sign says which kind of stop it was in words of its own, and the log keeps
 * the rest. The patterns are the sentences both hosts write (`@braindog/script`, `apps/worker/src/script.ts`,
 * `script-run.ts`); one this does not know is said as a stop its log explains.
 */
function whyRefused(note: string | null, log: string | null): string {
  const said = note ?? '';
  if (/ asked to write outside what it may write/u.test(said)) return 'wrote outside the lists it may write';
  if (/ asked nothing: /u.test(said)) return 'asked a question the record would not take';
  if (/ wrote nothing: write \d+ of \d+ was refused/u.test(said)) return 'had a write the record refused';
  const why = typeof log === 'string' && log !== '--redacted--' ? (log.split('\n')[0] ?? '') : '';
  if (/ ran past its wall_ms /u.test(why)) return 'ran out of time';
  if (/ spent more than its cpu_ms |exceeded CPU/iu.test(why)) return 'ran out of processing time';
  if (/out of (its \d+ MB of )?memory|exceeded memory/iu.test(why)) return 'ran out of memory';
  if (/ threw: /u.test(why)) return 'hit an error in its own code';
  if (/ fetched /u.test(why)) return 'fetched an address it may not';
  if (/ made more than its \d+ fetches/u.test(why)) return 'made more fetches than it may';
  if (/ asked for the key /u.test(why)) return 'asked for a key it does not declare';
  if (/, which is not in its (reads|writes)| declares no reads/u.test(why)) return 'reached a list it does not declare';
  if (/ queued more than its \d+ writes/u.test(why)) return 'asked for more writes than it may';
  if (/'s limits\.|'s source |'s egress | handed back /u.test(why)) return 'is declared in a way it cannot run';
  if (/ stopped: /u.test(why)) return 'was stopped by the host';
  return 'stopped for a reason its log gives';
}

function readSourceless(sql: Sql): SignReading {
  const scripts = installedScripts(sql);
  if (scripts.length === 0) return reading('none', null, 'No script is installed yet.');
  /* THE LIVE BODY IS WHAT A READ OF THE SCRIPT ANSWERS (SHL-D08's `script`), so a script whose live body holds no source
     text, or no body that parses, is one no read can show and no person can mend. */
  const without = scripts.filter((s) => typeof s.body?.source !== 'string' || s.body.source.trim() === '');
  const facts = [`${count(scripts.length, 'script')} installed, ${without.length} without source.`];
  if (without.length <= SCRIPTS_SOURCELESS_MOST) return reading('green', 0, 'Every installed script holds its source.', facts);
  return reading('red', without.length, `${names(without.map((s) => s.name))} ${without.length === 1 ? 'holds' : 'hold'} no source anybody can read.`, facts);
}

/** A script's name by its bare id, from its newest version whether live or not, so a retired one still has its name. */
function scriptName(sql: Sql, bare: string): string {
  const body = parsed(sql.one<{ body: string }>("SELECT body FROM declaration WHERE id = ? AND kind = 'script' ORDER BY version DESC LIMIT 1", `script.${bare}`)?.body);
  return typeof body?.title === 'string' && body.title.trim() !== '' ? body.title.trim() : plain(bare);
}

/* ── automations ───────────────────────────────────────────────────────── */

/** An automation's name by its bare id, from its newest version whether live or not: `name`, or the id said as words. */
function ruleName(sql: Sql, bare: string): string {
  const body = parsed(sql.one<{ body: string }>("SELECT body FROM declaration WHERE id = ? AND kind = 'rule' ORDER BY version DESC LIMIT 1", `rule.${bare}`)?.body);
  return typeof body?.name === 'string' && body.name.trim() !== '' ? body.name.trim() : plain(bare);
}

/**
 * A name read once a reading for each id it is asked, as `ruleName` or `scriptName` reads it: a month of runs of one
 * automation asked its declaration once a run, three hundred queries for one name.
 */
function namedOnce(read: (bare: string) => string): (bare: string) => string {
  const said = new Map<string, string>();
  return (bare) => {
    let name = said.get(bare);
    if (name === undefined) {
      name = read(bare);
      said.set(bare, name);
    }
    return name;
  };
}

/** Every live automation that is switched on: its bare id, its name, and when its first version went in. */
function switchedOn(sql: Sql): { bare: string; name: string; since: string }[] {
  return sql
    .all<{ id: string; body: string; since: string }>(
      `SELECT d.id, d.body, (SELECT min(f.created_at) FROM declaration f WHERE f.id = d.id) AS since
         FROM declaration d WHERE d.kind = 'rule' AND d.superseded_at IS NULL AND d.retired = 0 ORDER BY d.id`,
    )
    .flatMap((d) => {
      const body = parsed(d.body);
      if (body?.enabled === false) return [];
      const bare = d.id.slice('rule.'.length);
      return [{ bare, name: typeof body?.name === 'string' && body.name.trim() !== '' ? body.name.trim() : plain(bare), since: d.since }];
    });
}

/** Most first: `[name, n]` for each name, so a fact reads the busiest first. */
function tally(all: readonly string[]): [string, number][] {
  const by = new Map<string, number>();
  for (const n of all) by.set(n, (by.get(n) ?? 0) + 1);
  return [...by].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function readFailed(sql: Sql, nowMs: number, lasts: SignLasts = () => undefined): SignReading {
  const since = new Date(nowMs - FLOW_WINDOW_DAYS * DAY).toISOString();
  const runs = sql.all<{ rule: string; state: string; say: string | null; at: string | null }>(
    'SELECT rule, state, say, coalesce(finished_at, started_at) AS at FROM automation_run WHERE coalesce(finished_at, started_at) >= ? ORDER BY coalesce(finished_at, started_at) DESC, rowid DESC',
    since,
  );
  /* BY THE CLOCK ALONE (`SignLasts`): a run leaves the window, or a new month begins. */
  lasts(monthAfter(nowMs));
  for (const r of runs) lasts(crossesAt(r.at, FLOW_WINDOW_DAYS * DAY));
  if (runs.length === 0) return reading('none', null, `No automation has run in ${FLOW_WINDOW_DAYS} days.`);
  const failed = runs.filter((r) => r.state === 'failed');
  const facts = [`${count(runs.length, 'run')} in ${FLOW_WINDOW_DAYS} days, ${failed.length} failed.`];
  const nameOf = namedOnce((bare) => ruleName(sql, bare));
  if (failed.length <= AUTOMATIONS_FAILED_MOST) {
    const before = sql
      .all<{ rule: string }>("SELECT rule FROM automation_run WHERE state = 'failed' AND started_at >= ? AND coalesce(finished_at, started_at) < ? ORDER BY rowid", monthFrom(nowMs), since)
      .map((r) => nameOf(r.rule));
    return reading('green', 0, `None of ${count(runs.length, 'run')} in ${FLOW_WINDOW_DAYS} days failed.${earlier(before, 'failed')}`, facts);
  }
  const who = tally(failed.map((r) => nameOf(r.rule)));
  facts.push(...who.map(([name, n]) => `${name} failed ${n === 1 ? 'once' : `${n} times`}.`));
  return reading('red', failed.length, `${count(failed.length, 'automation run')} failed in ${FLOW_WINDOW_DAYS} days: ${names(who.map(([name]) => name))}.`, facts);
}

function readParked(sql: Sql, nowMs: number, tz: string, lasts: SignLasts = () => undefined): SignReading {
  lasts(Infinity);
  /* THE STEP THE RUN WAITS AT is its `step`, and the row `record` wrote for it says what it asked and since when. */
  const waiting = sql.all<{ id: string; rule: string; at: string }>(
    `SELECT r.id, r.rule, s.at FROM automation_run r JOIN automation_step s ON s.run = r.id AND s.n = r.step
      WHERE r.state = 'waiting' AND s.state = 'waiting' AND s.kind = 'ask_person' ORDER BY s.at`,
  );
  if (waiting.length === 0 && switchedOn(sql).length === 0) return reading('none', null, 'No automation is switched on yet.');
  /* PAST ITS WAIT: the run's own wake, armed for the end of the wait, is due and has not taken it. A run with no wake row
     at all waits for good, so it is judged by the step's default wait from when it asked. */
  const fallback = intervalMs(ASK_PERSON_WAIT) ?? 7 * DAY;
  const parked = waiting.filter((w) => {
    const due = sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'rule' AND key = ?", runKey(w.id))?.due_at;
    const wakeMs = due !== undefined ? Date.parse(due) : Date.parse(w.at) + fallback;
    const past = wakeMs + PARKED_GRACE_MS < nowMs;
    /* ONE INSIDE ITS WAIT IS PAST IT by the clock alone (`SignLasts`); a wake that cannot be read never is. */
    if (!past && !Number.isNaN(wakeMs)) lasts(wakeMs + PARKED_GRACE_MS + 1);
    return past;
  });
  const facts = [`${count(waiting.length, 'run waits', 'runs wait')} on a person, ${parked.length} past ${waiting.length === 1 ? 'its' : 'their'} wait.`];
  if (parked.length <= AUTOMATIONS_PARKED_MOST)
    return reading('green', 0, waiting.length === 0 ? 'No run waits on a person.' : 'Every run that waits on a person is inside its wait.', facts);
  const nameOf = namedOnce((bare) => ruleName(sql, bare));
  facts.push(...parked.map((p) => `${nameOf(p.rule)} asked on ${daySaid(p.at, tz)} and was never woken.`));
  return reading('red', parked.length, `${count(parked.length, 'run is', 'runs are')} still waiting on a person after ${parked.length === 1 ? 'its' : 'their'} wait ended: ${names(tally(parked.map((p) => nameOf(p.rule))).map(([n]) => n))}.`, facts);
}

function readIdle(sql: Sql, nowMs: number, lasts: SignLasts = () => undefined): SignReading {
  lasts(Infinity);
  const on = switchedOn(sql);
  if (on.length === 0) return reading('none', null, 'No automation is switched on yet.');
  const old = new Date(nowMs - IDLE_AFTER_DAYS * DAY).toISOString();
  /* ONE SWITCHED ON TOO LATELY TO JUDGE is judged once it is old enough (`SignLasts`). */
  for (const r of on) if (!(r.since <= old)) lasts(crossesAt(r.since, IDLE_AFTER_DAYS * DAY));
  /* NEVER RUN: no run of the runner, and for a rule that finishes inside a write, no line of the log signed by it. */
  const idle = on.filter(
    (r) =>
      r.since <= old &&
      sql.one('SELECT 1 AS x FROM automation_run WHERE rule = ? LIMIT 1', r.bare) === undefined &&
      sql.one('SELECT 1 AS x FROM event WHERE actor = ? LIMIT 1', `rule:${r.bare}`) === undefined,
  );
  const facts = [`${count(on.length, 'automation is', 'automations are')} switched on, and ${idle.length} of them ${idle.length === 1 ? 'has' : 'have'} never run.`];
  if (idle.length > 0) facts.push(`Never run: ${names(idle.map((r) => r.name))}.`);
  /* GREEN WITH ITS COUNT, NEVER RED: see the head of this file. */
  const said =
    idle.length === 0
      ? `Every automation switched on more than ${IDLE_AFTER_DAYS} days ago has run.`
      : `${idle.length} of ${count(on.length, 'automation')} switched on ${idle.length === 1 ? 'has' : 'have'} never run, ${IDLE_AFTER_DAYS} days or more after going in.`;
  return reading('green', idle.length, said, facts);
}

function readStopped(sql: Sql, nowMs: number, tz: string, lasts: SignLasts = () => undefined): SignReading {
  lasts(Infinity);
  const since = new Date(nowMs - FLOW_WINDOW_DAYS * DAY).toISOString();
  const runs = sql.all<{ target: string; ts: string; stopped: number }>(
    `SELECT target, ts,
            CASE WHEN json_extract(to_v, '$.outcome') = 'ok' AND (instr(coalesce(note, ''), ?) > 0 OR coalesce(json_extract(to_v, '$.stopped'), 0) > 0) THEN 1 ELSE 0 END AS stopped
       FROM event WHERE kind = 'pull' AND target LIKE 'declaration:script.%' AND ts >= ? AND json_valid(to_v)
        AND json_extract(to_v, '$.outcome') IN ('ok', 'refused')
      ORDER BY rowid DESC`,
    CHAIN_STOPPED_SAID,
    since,
  );
  /* A RUN LEAVES THE WINDOW by the clock alone (`SignLasts`). */
  for (const r of runs) lasts(crossesAt(r.ts, FLOW_WINDOW_DAYS * DAY));
  if (runs.length === 0) return reading('none', null, `No script has run in ${FLOW_WINDOW_DAYS} days.`);
  const stopped = runs.filter((r) => Number(r.stopped) === 1);
  const facts = [`${count(runs.length, 'script run')} in ${FLOW_WINDOW_DAYS} days, ${stopped.length} stopped a chain.`];
  if (stopped.length <= CHAINS_STOPPED_MOST) return reading('green', 0, `No chain of rules and scripts hit its depth limit in ${FLOW_WINDOW_DAYS} days.`, facts);
  const nameOf = namedOnce((bare) => scriptName(sql, bare));
  const who = stopped.map((r) => ({ name: nameOf(r.target.slice('declaration:script.'.length)), ts: r.ts }));
  facts.push(...who.map((w) => `${w.name} stopped a chain on ${daySaid(w.ts, tz)}; nothing past that point ran.`));
  return reading('red', stopped.length, `${count(stopped.length, 'chain')} of rules and scripts hit ${stopped.length === 1 ? 'its' : 'their'} depth limit in ${FLOW_WINDOW_DAYS} days, at ${names(tally(who.map((w) => w.name)).map(([n]) => n))}.`, facts);
}

/* ── the list ──────────────────────────────────────────────────────────── */

const kernel = (sign: string, name: string, thresholds: Record<string, number>, read: NonNullable<SignReader['read']>): SignReader => ({ sign, name, hand: 'kernel', version: 1, thresholds, read });

/**
 * THE SEVEN, in SHL-D01's order. `signs.ts` joins them to `VITAL_SIGNS` with `...SIGNS_FLOW`. The ids are kebab case,
 * as PRF-A01's are; a person reads the names.
 */
export const SIGNS_FLOW: readonly SignReader[] = [
  /* READ WITHOUT THE CLOCK: stands until something it read is written (`SignLasts`). */
  kernel('scripts-paused', 'No script is paused', { SCRIPTS_PAUSED_MOST }, (sql, _nowMs, _tz, lasts) => (lasts?.(Infinity), readPaused(sql))),
  kernel('scripts-refused', 'Scripts finish their runs', { SCRIPTS_REFUSED_MOST }, readRefused),
  kernel('scripts-sourceless', 'Every script holds its source', { SCRIPTS_SOURCELESS_MOST }, (sql, _nowMs, _tz, lasts) => (lasts?.(Infinity), readSourceless(sql))),
  kernel('automations-failed', 'Automations do not fail', { FLOW_WINDOW_DAYS, AUTOMATIONS_FAILED_MOST }, (sql, nowMs, _tz, lasts) => readFailed(sql, nowMs, lasts)),
  kernel('automations-parked', 'No run is stuck waiting on a person', { PARKED_GRACE_MS, AUTOMATIONS_PARKED_MOST }, readParked),
  kernel('automations-idle', 'Automations that have never run', { IDLE_AFTER_DAYS }, (sql, nowMs, _tz, lasts) => readIdle(sql, nowMs, lasts)),
  kernel('automations-stopped-chains', 'Chains run to their end', { FLOW_WINDOW_DAYS, CHAINS_STOPPED_MOST }, readStopped),
];
