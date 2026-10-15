/**
 * Run one scheduled action now: a person presses Run now on a `pull`, `call` or `poll`, and its next run is due at once.
 *
 * THE PRESS MAKES NO REQUEST. It moves the pending schedule row's `due_at` to now and writes one event naming the action
 * and who pressed; the alarm the record re-arms after every write (`tail`) then fires the row through `fireAction` like
 * any other due run, so the run is metered, held at the plan's limit and paused on a refused key exactly as a scheduled
 * one is. Nothing here reaches the network, and nothing here can be handed a key.
 *
 * A PAUSED OR HELD ACTION ANSWERS ITS OWN SENTENCE AND DOES NOT RUN. Paused is the row's state, as `listActions` reads it,
 * and only `resumeAction` starts one again, because a key that was refused is refused again on every press. Held is the
 * plan's limit: the last run was `held` and the row waits for the month to turn (`finishAction`), so a press would only be
 * held again.
 *
 * THE RATE IS READ FROM THE PRESSES THEMSELVES, the `pull` events this file writes with `field = 'run_now'`, so it needs no
 * table and survives a restart. One press an action each minute, twenty a record each hour; past either, `RATE_LIMITED`
 * with `retry_after` in whole seconds, which a host sends as `Retry-After`. A press that was refused for any other reason
 * wrote no event, so it counts nothing.
 */

import type { Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { ACTION_KINDS } from './actions.ts';
import { instant } from './migrate.ts';

/** One press an action in this window. */
export const NUDGE_ACTION_MS = 60_000;
/** The presses one record may make in `NUDGE_RECORD_MS`. */
export const NUDGE_RECORD_MOST = 20;
export const NUDGE_RECORD_MS = 3_600_000;

/** The `field` a press's event carries, which is how the rate tells a press from a run or a resume. */
export const NUDGE_FIELD = 'run_now';

export type NudgeDeps = { sql: Sql; nowMs: number; mint: () => string };

/** What a press answers: the action, and the instant its run is now due. */
export type Nudged = { ingest: string; due_at: string };

const targetOf = (ingest: string): string => `declaration:ingest.${ingest}`;

/** A day a person reads, such as 1 November, in UTC as the plan's month is counted. */
const dayOf = (ms: number): string => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });

/** Whole seconds until `untilMs`, never less than one. */
const secondsTo = (untilMs: number, nowMs: number): number => Math.max(1, Math.ceil((untilMs - nowMs) / 1000));

/**
 * Whether one more press of this action may be taken now: `null` when it may, else `RATE_LIMITED` with `retry_after`.
 *
 * THE ACTION'S MINUTE FIRST, because it is the shorter wait and the one a person pressing twice is told. The record's hour
 * is counted from its twentieth newest press, so `retry_after` is when that one leaves the window.
 */
export function nudgeRate(sql: Sql, ingest: string, nowMs: number): Result<null> {
  const last = sql.one<{ ts: string }>(
    'SELECT ts FROM event WHERE kind = ? AND target = ? AND field = ? ORDER BY ts DESC LIMIT 1',
    'pull',
    targetOf(ingest),
    NUDGE_FIELD,
  );
  const lastMs = last === undefined ? Number.NaN : Date.parse(last.ts);
  if (Number.isFinite(lastMs) && nowMs - lastMs < NUDGE_ACTION_MS) {
    const wait = secondsTo(lastMs + NUDGE_ACTION_MS, nowMs);
    return no('RATE_LIMITED', `Run now was pressed for ${ingest} less than a minute ago. Press again in ${wait} ${wait === 1 ? 'second' : 'seconds'}.`, {
      at: 'ingest',
      retry_after: wait,
    });
  }
  const recent = sql.all<{ ts: string }>(
    'SELECT ts FROM event WHERE kind = ? AND field = ? AND ts > ? ORDER BY ts DESC LIMIT ?',
    'pull',
    NUDGE_FIELD,
    instant(nowMs - NUDGE_RECORD_MS),
    NUDGE_RECORD_MOST,
  );
  if (recent.length >= NUDGE_RECORD_MOST) {
    const oldest = Date.parse(recent[recent.length - 1]!.ts);
    const wait = secondsTo(oldest + NUDGE_RECORD_MS, nowMs);
    /* THE WAIT IN WHOLE MINUTES, said by the platform's own words for a span ("in 59 minutes"). */
    const said = new Intl.RelativeTimeFormat('en-GB', { numeric: 'always' }).format(Math.ceil(wait / 60), 'minute');
    return no(
      'RATE_LIMITED',
      `Run now was pressed ${NUDGE_RECORD_MOST} times in the last hour. Press again ${said}; every action still runs on its own schedule.`,
      { retry_after: wait },
    );
  }
  return ok(null);
}

/**
 * Press Run now on one scheduled action, as `actor`: its pending row is due now, and one event says who pressed.
 *
 * EVERY REFUSAL IS ITS OWN SENTENCE, in the order a person would ask: is there such an action, does it run on a clock at
 * all, is a run waiting, is it paused, is one already on its way, is it held at the plan's limit, and only then the rate.
 * A row already due earlier keeps its instant, so a press never pushes a late run later.
 */
export function nudgeAction(deps: NudgeDeps, ingest: string, actor: string): Result<Nudged> {
  const { sql, nowMs } = deps;
  const body = sql.one<{ body: string }>(
    "SELECT body FROM declaration WHERE kind = 'ingest' AND id = ? AND superseded_at IS NULL AND retired = 0",
    `ingest.${ingest}`,
  )?.body;
  const decl = body === undefined ? null : (JSON.parse(body) as { channel?: unknown; trigger?: unknown });
  if (decl === null || !(ACTION_KINDS as readonly unknown[]).includes(decl.channel))
    return no('DECLARATION_UNKNOWN', `There is no scheduled action called ${ingest}.`, { at: 'ingest' });
  if (decl.trigger === 'rule')
    return no('OUT_OF_BOUNDS', `${ingest} runs only when its automation sends it, so it has no schedule to run now.`, { at: 'ingest' });

  const row = sql.one<{ id: string; state: string; due_at: string }>(`SELECT id, state, due_at FROM schedule WHERE kind = ? AND key = ?`, decl.channel as string, ingest);
  /* ONLY A PENDING ROW HAS A RUN WAITING. A `done` row is finished, and a `failed` one gave up after its retries and is
     read as finished (`listActions`); the drain fires `pending` rows only, so moving either one's instant ran nothing. */
  if (row === undefined || (row.state !== 'pending' && row.state !== 'paused' && row.state !== 'firing'))
    return no('OUT_OF_BOUNDS', `${ingest} has no run waiting, so there is nothing to run now.`, { at: 'ingest' });
  if (row.state === 'paused')
    return no('OUT_OF_BOUNDS', `${ingest} is paused, so it does not run now. Resume it to start it again.`, { at: 'ingest' });

  /* ONE RUN IN FLIGHT PER ACTION, as `fireAction` holds it: a row firing, or a job still pending, leased or waiting on its
     retry, is the run a press would duplicate, and `fireAction` would queue nothing for it anyway. */
  const busy =
    row.state === 'firing' ||
    sql.one(
      `SELECT 1 AS x FROM outbox WHERE kind = 'pull.fetch' AND state IN ('pending', 'leased', 'failed')
       AND json_extract(payload, '$.channel') = ? AND json_extract(payload, '$.ingest') = ?
       AND json_extract(payload, '$.entry') IS NULL LIMIT 1`,
      decl.channel as string,
      ingest,
    ) !== undefined;
  if (busy) return no('OUT_OF_BOUNDS', `${ingest} has a run on its way already, so it does not run twice.`, { at: 'ingest' });

  const due = Date.parse(row.due_at);
  const last = sql.one<{ outcome: string | null }>(
    `SELECT json_extract(to_v, '$.outcome') AS outcome FROM event
     WHERE kind = 'pull' AND target = ? AND to_v IS NOT NULL AND json_valid(to_v) AND json_extract(to_v, '$.outcome') IS NOT NULL
     ORDER BY rowid DESC LIMIT 1`,
    targetOf(ingest),
  );
  /* HELD AT THE PLAN'S LIMIT MOVES THE ROW TO A LATER MONTH (`finishAction`). A call a rule sent past its day's share is
     metered `held` too and leaves the row where its clock put it, so a held run whose row waits this month is not the plan's. */
  if (last?.outcome === 'held' && Number.isFinite(due) && due > nowMs && instant(due).slice(0, 7) > instant(nowMs).slice(0, 7))
    return no('OUT_OF_BOUNDS', `${ingest} is held at this plan's limit until ${dayOf(due)}, so it does not run now.`, { at: 'ingest' });

  const rate = nudgeRate(sql, ingest, nowMs);
  if (!rate.ok) return rate as Result<never>;

  const at = instant(Number.isFinite(due) && due < nowMs ? due : nowMs);
  sql.exec('UPDATE schedule SET due_at = ? WHERE id = ?', at, row.id);
  sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, field, note) VALUES (?, ?, ?, 'pull', ?, 'declaration', ?, ?)",
    deps.mint(),
    instant(nowMs),
    actor,
    targetOf(ingest),
    NUDGE_FIELD,
    `${ingest} was asked to run now.`,
  );
  return ok({ ingest, due_at: at });
}
