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

const DAY_MS = 86_400_000;
const OFFSET = /^([+-]?)(\d{1,4})([dwm])$/;

export type Remindable = { id: string; type: string; remind?: readonly string[]; repeat?: Repeat };

/** `freq` and how often, with the ways a date lands on a day nobody works. */
export type Repeat = {
  freq: 'day' | 'week' | 'month' | 'year';
  interval?: number;
  count?: number;
  until?: string;
  /** A Saturday or Sunday moved to the Friday before or the Monday after. */
  workday?: 'previous' | 'next';
};

/** `-7d` as milliseconds. `null` when it is not an offset, which is a declaration to refuse. */
export function offsetMs(text: string): number | null {
  const m = OFFSET.exec(text.trim());
  if (!m) return null;
  const n = Number(m[2]) * (m[1] === '-' ? -1 : 1);
  return n * (m[3] === 'd' ? DAY_MS : m[3] === 'w' ? 7 * DAY_MS : 30 * DAY_MS);
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
  for (let n = 0; out.length < (repeat.count ?? 500) && n < 5000; n++) {
    let at: number;
    if (repeat.freq === 'day') at = anchor + n * interval * DAY_MS;
    else if (repeat.freq === 'week') at = anchor + n * interval * 7 * DAY_MS;
    else {
      /* BY CALENDAR AND CLAMPED. Adding to the month number rolls 31 January into 3 March, which is
         not what anybody means by "monthly" — the last day of the month they named is. */
      const months = repeat.freq === 'month' ? n * interval : n * interval * 12;
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
      const shift = offsetMs(offset);
      if (shift === null) continue;
      const dueAt = at + shift;
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
export const pendingWork = (sql: Sql): { nextDueMs: number | null; outboxPending: boolean } => {
  const next = sql.one<{ d: string | null }>("SELECT min(due_at) AS d FROM schedule WHERE state = 'pending'")?.d ?? null;
  const queued = sql.one("SELECT 1 AS x FROM outbox WHERE state = 'pending' LIMIT 1");
  return { nextDueMs: next ? Date.parse(next) : null, outboxPending: Boolean(queued) };
};

/** The reminders that are due, oldest first. What the alarm hands to whatever sends them. */
export const due = (sql: Sql, now: number, limit = 100) =>
  sql.all<{ id: string; key: string; due_at: string; payload: string }>(
    "SELECT id, key, due_at, payload FROM schedule WHERE state = 'pending' AND due_at <= ? ORDER BY due_at LIMIT ?",
    iso(now),
    limit,
  );

/* ── the alarm handler ──────────────────────────────────────────── */

/** The ten the DDL's `CHECK` admits. */
export const SCHEDULE_KINDS = [
  'digest',
  'reminder',
  'rule',
  'retry',
  'purge',
  'rotate',
  'pull',
  'analyse',
  'score',
  'snapshot',
] as const;

export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];

export type Claimed = { id: string; kind: string; key: string; payload: string; attempts: number; due_at: string };

/**
 * What one kind of row DOES when its time comes.
 *
 * The return value is the next `due_at` in milliseconds for a row that recurs, or `null` for a
 * one-shot. A throw is a failure, and the ladder below catches it — which is the only way a handler
 * gets to be written as if nothing goes wrong.
 */
export type Handler = (row: Claimed) => number | null;

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
): Drained {
  const claimed = sql.all<Claimed>(
    `UPDATE schedule SET state = 'firing'
     WHERE id IN (SELECT id FROM schedule WHERE state = 'pending' AND due_at <= ? ORDER BY due_at LIMIT ?)
     RETURNING id, kind, key, payload, attempts, due_at`,
    new Date(deps.nowMs).toISOString(),
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

    let next: number | null;
    try {
      next = handler(row);
    } catch (e) {
      fail(sql, deps, row, e instanceof Error ? e.message : String(e), row.attempts + 1);
      out.failed++;
      continue;
    }

    if (next === null) sql.exec("UPDATE schedule SET state = 'done' WHERE id = ?", row.id);
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
