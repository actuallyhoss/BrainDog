/**
 * Reminders, derived from the dates a register already holds.
 *
 * NOBODY SETS A REMINDER. That is the whole design: a field declares `remind: ['-7d', '0d']` and the
 * record derives the rows, so a due date that moves takes its reminders with it. Every product where
 * the reminder is a separate object has the same failure — the invoice slips a week, the reminder
 * does not, and it fires about a date that is no longer true.
 *
 * THE KEY CARRIES THE DERIVATION: `<entry>:<field>:<at>:<offset>`. So re-deriving is a range delete
 * and a set of inserts rather than a diff, and a `done` row keeps its key — which means a date moved
 * away and back does not fire twice. That is `once_per: [entry, field]` expressed as a unique index
 * rather than as a rule somebody has to remember.
 *
 * THE RANGE ENDS AT `;` BECAUSE `;` IS `:` PLUS ONE. `key >= '<id>:' AND key < '<id>;'` is an index
 * scan on `(kind, key)`; the `LIKE '<id>:%'` that reads more naturally is a table scan, and it is a
 * table scan on every write of every row that has a date.
 */

import type { Sql } from '@braindog/ports';

import type { Json } from './coerce.ts';
import { backoffMs, openChangeSuggestion, summary, type AckDeps } from './outbox.ts';
import { SESSION } from './session.ts';
import { resolveDay } from '@braindog/where';

const DAY_MS = 86_400_000;
const OFFSET = /^([+-]?)(\d{1,4})([dwm])$/;

export type Remindable = { id: string; type: string; remind?: readonly string[]; repeat?: Repeat };

/** `freq` and how often, with the ways a date lands on a day nobody works. */
export type Repeat = {
  /**
   * EVERY SPELLING THE DOCUMENTS USE COMPUTED AS YEARLY, IN SILENCE.
   *
   * `42 §4.4` closes this at `daily weekly monthly yearly` and `02 §4`'s own worked example is
   * `repeat: { freq: weekly, byday: [TU, TH], count: 12 }`. This union spelled the four
   * `day week month year`, and `expandRepeat`'s if-chain had no final guard, so **the documented
   * spelling and every typo alike fell through to the yearly arm**. Driven from an anchor of
   * 2026-09-08:
   *
   *     freq: week     ->  2026-09-08, 09-15, 09-22, 09-29
   *     freq: weekly   ->  2026-09-08, 2027-09-08
   *     freq: banana   ->  2026-09-08, 2027-09-08
   *
   * A weekly standup written exactly as the specification writes it reminded nobody for
   * fifty-one weeks, and `validate` checked `repeat:` not at all, so nothing was refused and
   * nothing was logged. It is a wrong answer on a date somebody acts on, produced by following
   * the documentation.
   *
   * BOTH SPELLINGS ARE ACCEPTED AND ONE IS CANONICAL. The documents are the source and their
   * words go first; the short forms stay because a record may already hold one and dropping them
   * would turn a working reminder into a refused declaration on somebody's next install.
   */
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'day' | 'week' | 'month' | 'year';
  interval?: number;
  count?: number;
  until?: string;
  /** A Saturday or Sunday moved to the Friday before or the Monday after. */
  workday?: 'previous' | 'next';
};

/**
 * One word, whatever spelling arrived, and `undefined` for anything that is not a frequency.
 *
 * IT IS A LOOKUP AND NOT A NORMALISING REGEX, so an unknown word has no answer rather than the
 * nearest one. The chain this replaces ended in an `else` that meant yearly, which is how
 * `freq: 'banana'` came to arm a reminder once a year.
 */
export const FREQ: Readonly<Record<string, 'day' | 'week' | 'month' | 'year'>> = Object.freeze({
  day: 'day',
  daily: 'day',
  week: 'week',
  weekly: 'week',
  month: 'month',
  monthly: 'month',
  year: 'year',
  yearly: 'year',
});

/**
 * `-7d` as milliseconds. `null` when it is not an offset, which is a declaration to refuse.
 *
 * DAYS AND WEEKS ONLY. A month is not a fixed number of milliseconds, and this used to answer thirty
 * days for one — in the same file whose `repeat` arithmetic clamps to the calendar. Use `shiftFrom`,
 * which does both and agrees with itself.
 */
export function offsetMs(text: string): number | null {
  const m = OFFSET.exec(text.trim());
  /* AND THE COMMENT ABOVE WAS THE ONLY PLACE THE RULE EXISTED. It says days and weeks only,
     and the regex admitted `m` and answered `n * 30 * DAY_MS`, a thirty-day month, in the same
     file whose `shiftFrom` clamps a month to the calendar. `shiftFrom` routes `m` past this,
     so nothing in the tree got the wrong answer, but this is exported from the kernel's public
     API and the next caller would have. */
  if (!m || m[3] === 'm') return null;
  const n = Number(m[2]) * (m[1] === '-' ? -1 : 1);
  return n * (m[3] === 'd' ? DAY_MS : m[3] === 'w' ? 7 * DAY_MS : 30 * DAY_MS);
}

/**
 * An anchor shifted by an offset, in the arithmetic the unit actually has.
 *
 * A MONTH IS NOT THIRTY DAYS, and this file did both. `expandRepeat` steps months on the calendar
 * and clamps — the 31st of a 30-day month is its 30th — while `remindersFor` multiplied by
 * `30 * DAY_MS`, so `remind: ['-1m']` on 31 March fired on 1 March instead of 28 February: three
 * days early, on the one feature whose whole job is to be on the right day. Two answers for one
 * word, in one file.
 *
 * `resolveDay` IS THE SHARED ARITHMETIC — the same function `where`'s predicates and the cash walk
 * step months with, so a reminder and a filter written for the same month land together.
 */
export function shiftFrom(atMs: number, offset: string): number | null {
  const m = OFFSET.exec(offset.trim());
  if (!m) return null;
  if (m[3] !== 'm') {
    const ms = offsetMs(offset);
    return ms === null ? null : atMs + ms;
  }
  const day = resolveDay(`${m[1] === '-' ? '-' : '+'}${m[2]}m`, atMs);
  if (!day) return null;
  /* THE CLOCK OF THE ANCHOR IS KEPT. A reminder on a dated field is noon UTC by `atMs`'s own rule;
     one on an instant carries the time it was set for, and a month's shift must not silently move
     it to midday. */
  const at = new Date(atMs);
  const [y = 0, mo = 1, d = 1] = day.split('-').map(Number);
  return Date.UTC(y, mo - 1, d, at.getUTCHours(), at.getUTCMinutes(), at.getUTCSeconds(), at.getUTCMilliseconds());
}

const iso = (ms: number): string => new Date(ms).toISOString();

/** A stored day or instant as milliseconds at noon UTC, so a timezone cannot move a date by one. */
export function atMs(value: string): number | null {
  const ms = value.length === 10 ? Date.parse(`${value}T12:00:00Z`) : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * The days a repeat lands on, from its anchor forward, within the horizon.
 *
 * FOUR HUNDRED DAYS AND NOT FOREVER. A yearly repeat with no `until` is an infinite series, and the
 * useful thing to hold is the next one — the walk is re-derived on every write of the row, so a
 * horizon costs nothing and an unbounded expansion costs everything.
 */
export function expandRepeat(anchor: number, repeat: Repeat, now: number, horizonDays = 400): number[] {
  const interval = Math.max(1, Math.floor(repeat.interval ?? 1));
  const until = repeat.until ? atMs(repeat.until) : null;
  const limit = now + horizonDays * DAY_MS;
  const out: number[] = [];

  const start = new Date(anchor);

  /* NO ARM MEANS NO OCCURRENCES. The chain below ended in an `else`, so a word it did not know
     was a year rather than a refusal. `declare` refuses an unknown frequency at install; this is
     what the same fact looks like to a caller holding a record that was installed before it did. */
  const freq = FREQ[repeat.freq];
  if (!freq) return [];

  /* THE BUDGET IS SPENT FORWARD, NOT BACKWARD. The walk began at the anchor and stopped at `count`
     (or 500), so a daily repeat anchored more than about five hundred days ago produced five hundred
     occurrences that had all already happened — and `remindersFor`, which drops anything past,
     derived NOTHING. A yearly subscription set up in 2019 simply stopped reminding anybody, silently.
     `from` is the first index whose occurrence is not behind us, computed rather than walked to. */
  const from = repeat.count === undefined ? skipPast(anchor, repeat, now) : 0;

  for (let n = from; out.length < (repeat.count ?? 500) && n < from + 5000; n++) {
    let at: number;
    if (freq === 'day') at = anchor + n * interval * DAY_MS;
    else if (freq === 'week') at = anchor + n * interval * 7 * DAY_MS;
    else {
      /* BY CALENDAR AND CLAMPED. Adding to the month number rolls 31 January into 3 March, which is
         not what anybody means by "monthly" — the last day of the month they named is. */
      const months = freq === 'month' ? n * interval : n * interval * 12;
      const first = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1, 12));
      const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0, 12)).getUTCDate();
      at = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(start.getUTCDate(), last), 12);
    }

    if (at > limit) break;
    if (until !== null && at > until) break;

    out.push(shiftWorkday(at, repeat.workday));
  }
  return out;
}

/**
 * How many occurrences are already behind us.
 *
 * Arithmetic rather than a walk, because the whole point is not to spend five hundred iterations
 * getting to today. It is deliberately an UNDERESTIMATE for the calendar frequencies — clamping a
 * 31st into February shortens a month, so the count is floored and the loop steps the last one or
 * two — and it is never applied when the repeat declares its own `count`, where every occurrence is
 * one of a numbered series somebody asked for.
 */
function skipPast(anchor: number, repeat: Repeat, now: number): number {
  if (anchor >= now) return 0;
  const interval = Math.max(1, Math.floor(repeat.interval ?? 1));
  const behind = now - anchor;
  /* THE SAME TABLE, because a skip that disagreed with the walk would put the first
     occurrence in the wrong place rather than nowhere, which is harder to see. */
  const freq = FREQ[repeat.freq];
  if (!freq) return 0;
  if (freq === 'day') return Math.floor(behind / (interval * DAY_MS));
  if (freq === 'week') return Math.floor(behind / (interval * 7 * DAY_MS));
  const from = new Date(anchor);
  const to = new Date(now);
  const months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  const step = freq === 'month' ? interval : interval * 12;
  return Math.max(0, Math.floor((months - 1) / step));
}

/** A weekend moved to the Friday before or the Monday after, when the declaration asks. */
function shiftWorkday(at: number, how: Repeat['workday']): number {
  if (!how) return at;
  const day = new Date(at).getUTCDay();
  if (day !== 0 && day !== 6) return at;
  if (how === 'previous') return at - (day === 0 ? 2 : 1) * DAY_MS;
  return at + (day === 0 ? 1 : 2) * DAY_MS;
}

export type Reminder = { key: string; dueAt: string; payload: string };

/**
 * The reminders one field of one row implies: occurrences × offsets.
 *
 * A reminder already past is not derived. Deriving it would mean every import and every restore
 * fires a year of reminders at once — the failure mode of every scheduler that treats "due" as
 * "should have fired".
 */
export function remindersFor(
  entry: { id: string; register: string; fields: Record<string, Json>; deleted: boolean },
  field: Remindable,
  now: number,
): Reminder[] {
  if (entry.deleted || (!field.remind && !field.repeat)) return [];
  const raw = entry.fields[field.id];
  if (typeof raw !== 'string' || !raw) return [];
  const anchor = atMs(raw);
  if (anchor === null) return [];

  const occurrences = field.repeat ? expandRepeat(anchor, field.repeat, now) : [anchor];
  const offsets = field.remind?.length ? field.remind : ['0d'];

  const out: Reminder[] = [];
  for (const at of occurrences)
    for (const offset of offsets) {
      const dueAt = shiftFrom(at, offset);
      if (dueAt === null) continue;
      if (dueAt < now) continue;
      out.push({
        key: `${entry.id}:${field.id}:${iso(at)}:${offset}`,
        dueAt: iso(dueAt),
        payload: JSON.stringify({ entry: entry.id, register: entry.register, field: field.id, at: iso(at), offset }),
      });
    }
  return out;
}

/**
 * Put one row's reminders in step with the row.
 *
 * A RANGE DELETE AND A SET OF INSERTS, not a diff: the key encodes the derivation, so the rows that
 * should exist are exactly the rows the derivation produces, and computing which of them changed
 * would be work whose only output is the same set.
 *
 * `DO NOTHING` on conflict rather than `DO UPDATE`, because a `done` row keeps its key: a date moved
 * away and back must not fire a second time.
 */
export function reschedule(
  sql: Sql,
  mint: () => string,
  entry: { id: string; register: string; fields: Record<string, Json>; deleted: boolean },
  fields: readonly Remindable[],
  now: number,
): number {
  let n = 0;
  for (const field of fields) {
    if (!field.remind && !field.repeat) continue;
    if (field.type !== 'day' && field.type !== 'instant') continue;

    /* `;` is `:` + 1, so this is an index scan on (kind, key) rather than a LIKE over the table —
       and this runs on every write of every row that carries a date. */
    sql.exec(
      "DELETE FROM schedule WHERE kind = 'reminder' AND state = 'pending' AND key >= ? AND key < ?",
      `${entry.id}:${field.id}:`,
      `${entry.id}:${field.id};`,
    );

    for (const r of remindersFor(entry, field, now)) {
      sql.exec(
        "INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES (?, ?, 'reminder', ?, ?, 'pending', 0) ON CONFLICT (kind, key) DO NOTHING",
        mint(),
        r.dueAt,
        r.key,
        r.payload,
      );
      n++;
    }
  }
  return n;
}

/**
 * When the record next has something to do, and whether anything is queued.
 *
 * ONE ALARM PER CUSTOMER, which is what an object per customer buys: the alternative is a cron
 * worker fanning out across every tenant, waking records that have nothing to do to ask them.
 */
export const pendingWork = (
  sql: Sql,
  /**
   * The kinds this deployment can actually deliver. Absent is all of them.
   *
   * THE DOORBELL RINGS FOR WORK SOMEBODY CAN DO. A kind no host on this deployment delivers —
   * `infer.draft` without a Slash, `pull.fetch` without a runner — sits `pending` for ever, and
   * without this filter `outboxPending` was then true for ever: every write for the life of the
   * record sent a queue message and bought a lease pass that claimed nothing. The row is still
   * there and still visible; what stops is the bell.
   */
  delivers?: readonly string[] | undefined,
): { nextDueMs: number | null; outboxPending: boolean; queued: boolean } => {
  const next = sql.one<{ d: string | null }>("SELECT min(due_at) AS d FROM schedule WHERE state = 'pending'")?.d ?? null;
  /* `queued` IS EVERY WAITING ROW AND `outboxPending` IS THE ONES SOMEBODY CAN SEND. The two are
     separate on purpose: a job with no deliverer is KEPT — that is the honest behaviour, and the
     row is still there when a deliverer arrives — and the bell is what stops. */
  const queued = Boolean(sql.one("SELECT 1 AS x FROM outbox WHERE state = 'pending' LIMIT 1"));
  const deliverable = delivers
    ? delivers.length > 0 &&
      Boolean(
        sql.one(
          `SELECT 1 AS x FROM outbox WHERE state = 'pending' AND kind IN (${delivers.map(() => '?').join(', ')}) LIMIT 1`,
          ...delivers,
        ),
      )
    : queued;
  return { nextDueMs: next ? Date.parse(next) : null, outboxPending: deliverable, queued };
};

/** The reminders that are due, oldest first. What the alarm hands to whatever sends them. */
export const due = (sql: Sql, now: number, limit = 100) =>
  /* `kind` COMES BACK TOO, because "what is due" is a question whose answer a caller has to be able
     to tell apart: a reminder, the weekly analysis and a digest are due through the same door. */
  sql.all<{ id: string; kind: string; key: string; due_at: string; payload: string }>(
    "SELECT id, kind, key, due_at, payload FROM schedule WHERE state = 'pending' AND due_at <= ? ORDER BY due_at LIMIT ?",
    iso(now),
    limit,
  );

/* ── the alarm handler ──────────────────────────────────────────── */

/** The thirteen the `CHECK` admits: 0001's ten, `call` and `poll` from migration 5, and `script` from migration 12. */
export const SCHEDULE_KINDS = [
  'digest',
  'reminder',
  'rule',
  'retry',
  'purge',
  'rotate',
  'pull',
  'call',
  'poll',
  'analyse',
  'score',
  'snapshot',
  'script',
] as const;

export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];

export type Claimed = { id: string; kind: string; key: string; payload: string; attempts: number; due_at: string };

/**
 * What one kind of row DOES when its time comes.
 *
 * The return value is the next `due_at` in milliseconds for a row that recurs, or `null` for a
 * one-shot. A throw is a failure, and the ladder below catches it — which is the only way a handler
 * gets to be written as if nothing goes wrong.
 *
 * `'kept'` IS FOR A HANDLER THAT SET THE STATE ITSELF. A paused connector is its own `pull` row at
 * `state = 'paused'`, and a handler that returned `null` for it would have the drain write `done`
 * straight over the pause — quietly un-pausing a connector whose credential was just rejected.
 */
export type Handler = (row: Claimed) => number | null | 'kept';

export type Drained = { claimed: number; done: number; failed: number; dead: number };

const CEILING = 8;

/**
 * Fire everything that is due, once.
 *
 * CLAIM BEFORE WORK, IN ONE STATEMENT. An alarm handler can be re-entered — a platform guarantees
 * delivery, not exactly-once — so the conditional `UPDATE` is what makes a second entry find nothing
 * to do rather than send the same email twice.
 *
 * A HUNDRED AT A TIME. The whole due set is not drained in one wake if it is huge: the caller re-arms
 * to the new minimum, which is still in the past, and fires again. That keeps any single invocation
 * inside a CPU budget instead of discovering the ceiling in production.
 *
 * BACKOFF, CAPPED, AND THEN VISIBLE. Doubling minutes to six hours, and at the eighth attempt the row
 * is `failed` and a suggestion opens. A reminder that silently gave up is worse than one that never
 * existed — the person it was about has no way to know the difference, and acts as though it fired.
 */
export function drainSchedule(
  sql: Sql,
  deps: AckDeps,
  handlers: Partial<Record<ScheduleKind, Handler>>,
  limit = 100,
  /**
   * Only these kinds, when given. The runner of scheduled actions claims `pull`, `call` and `poll` and
   * nothing else, so a reminder is never sent from inside a loop that is waiting on somebody's API.
   */
  kinds?: readonly ScheduleKind[],
): Drained {
  const only = kinds === undefined ? '' : ` AND kind IN (${kinds.map(() => '?').join(', ') || "''"})`;
  const claimed = sql.all<Claimed>(
    `UPDATE schedule SET state = 'firing'
     WHERE id IN (SELECT id FROM schedule WHERE state = 'pending' AND due_at <= ?${only} ORDER BY due_at LIMIT ?)
     RETURNING id, kind, key, payload, attempts, due_at`,
    new Date(deps.nowMs).toISOString(),
    ...(kinds ?? []),
    Math.max(0, Math.floor(limit)),
  );

  const out: Drained = { claimed: claimed.length, done: 0, failed: 0, dead: 0 };

  for (const row of claimed) {
    const handler = handlers[row.kind as ScheduleKind];
    if (!handler) {
      /* A KIND WITH NO HANDLER DOES NOT WALK THE LADDER. Retrying code that does not exist eight
         times is not a retry — it is eight hours of pretending. The row fails once, and the
         suggestion says which kind nothing answers to. */
      fail(sql, deps, row, `Nothing in this record handles a ${row.kind} row.`, CEILING);
      out.dead++;
      continue;
    }

    let next: number | null | 'kept';
    try {
      next = handler(row);
    } catch (e) {
      fail(sql, deps, row, e instanceof Error ? e.message : String(e), row.attempts + 1);
      out.failed++;
      continue;
    }

    if (next === 'kept') {
      /* The handler moved the row itself, and writing over it here is how a pause becomes a
         `done` — which is a connector quietly resuming after its credential was rejected.

         BUT IT IS CHECKED, because `'kept'` is the one return this loop takes on trust. A handler
         that says it moved the row and leaves it at `firing` strands it: never claimable again, no
         ladder, no failure, and `done` reported to whoever asked. */
      if (sql.one<{ state: string }>('SELECT state FROM schedule WHERE id = ?', row.id)?.state === 'firing') {
        fail(sql, deps, row, `A ${row.kind} handler said it had moved this row, and left it firing.`, row.attempts + 1);
        out.failed++;
        continue;
      }
    } else if (next === null) sql.exec("UPDATE schedule SET state = 'done' WHERE id = ?", row.id);
    else
      sql.exec(
        "UPDATE schedule SET state = 'pending', due_at = ?, attempts = 0 WHERE id = ?",
        new Date(next).toISOString(),
        row.id,
      );
    out.done++;
  }

  return out;
}

/** One rung of the ladder, or the end of it. */
function fail(sql: Sql, deps: AckDeps, row: Claimed, error: string, attempts: number): void {
  if (attempts < CEILING) {
    sql.exec(
      "UPDATE schedule SET state = 'pending', attempts = ?, due_at = ? WHERE id = ?",
      attempts,
      new Date(deps.nowMs + backoffMs(attempts)).toISOString(),
      row.id,
    );
    return;
  }
  sql.exec("UPDATE schedule SET state = 'failed', attempts = ? WHERE id = ?", attempts, row.id);
  openChangeSuggestion(sql, deps, {
    declarationId: `kernel.schedule.${row.kind}`,
    from: { kind: row.kind, key: row.key, error, attempts, payload: summary(row.payload) },
    question: `A ${row.kind} due ${row.due_at.slice(0, 10)} could not run after ${attempts} attempts: ${error}. Retry it, or change what produces it.`,
  });
}

/** A run not heard from in twelve hours is abandoned by the hourly sweep. */
export const ABANDON_MS = 12 * 3_600_000;

/**
 * The session half of the hourly sweep: a run not heard from in twelve hours is abandoned.
 *
 * WRITTEN, NOT DERIVED, because a run that crashed never marks itself dead, and a register whose
 * finished rows are finished only to a reader who remembers to compare clocks fills up with runs
 * that look alive. `handoff` is skipped: it is a request waiting for the next run, and its age says
 * nothing about whether anything died. `done` is never written, because the sweep knows that a run
 * went quiet and not that its work finished.
 *
 * `move` is the write path's, so each change is a `state` event by `system` like any other, and a
 * run that comes back later re-attaches through the declared `abandoned` to `active` move.
 */
export function sweepSessions(sql: Sql, nowMs: number, move: (id: string, to: string) => boolean, limit = 100): number {
  const quiet = sql.all<{ id: string }>(
    `SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL AND state IN ('active', 'idle')
     AND coalesce(json_extract(fields, '$.last_seen'), updated_at) < ?
     ORDER BY coalesce(json_extract(fields, '$.last_seen'), updated_at) LIMIT ?`,
    SESSION,
    iso(nowMs - ABANDON_MS),
    Math.max(0, Math.floor(limit)),
  );
  let n = 0;
  for (const row of quiet) if (move(row.id, 'abandoned')) n++;
  return n;
}

/**
 * `retry`: put an outbox job back where the deliverer can lease it.
 *
 * The whole retry ladder for the outbox is these four words. It is here rather than in the outbox
 * because the schedule already owns backoff, the ceiling and the visible item — and a second copy
 * of that in the outbox is how one notification ends up with two ladders and no owner.
 */
export const retryHandler =
  (sql: Sql): Handler =>
  (row) => {
    const { outbox } = JSON.parse(row.payload) as { outbox?: string };
    if (outbox)
      sql.exec("UPDATE outbox SET state = 'pending', leased_until = NULL WHERE id = ? AND state = 'failed'", outbox);
    return null;
  };
