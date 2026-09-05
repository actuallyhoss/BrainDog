/**
 * The outbox: work that must LEAVE the record.
 *
 * THE RECORD MAKES NO OUTBOUND CALL. That is the rule the whole object model rests on — a Durable
 * Object holding one customer's SQLite in the same thread as the code cannot afford to sit in a
 * `fetch` waiting on somebody's SMTP, and a write that half-committed because a webhook was slow is
 * a record that has to be repaired by hand. So a write that needs the world to hear about it inserts
 * a ROW, in the write's own transaction, and something else delivers it.
 *
 * WHICH MAKES THE OUTBOX THE SOURCE OF TRUTH AND THE QUEUE A DOORBELL. A lost queue message costs
 * latency and never a notification, because the row is still `pending` and the next request drains
 * it. A queue that carried the payload instead would be a second copy of a notification that may
 * have changed.
 *
 * THE RETRY LADDER IS THE SCHEDULE'S, AND THERE IS ONLY ONE. A failed delivery does not sit in the
 * outbox being re-leased on a clock of the deliverer's own: it goes `failed`, and a `retry` row in
 * `schedule` — the same table, the same backoff, the same visible ceiling — puts it back to
 * `pending` when its time comes. Two ladders for one notification is how a thing gets retried
 * forever or never, and both have happened to everyone.
 */

import type { Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

/** The nine the DDL's `CHECK` admits. A tenth is a migration, which is the point of the check. */
export const OUTBOX_KINDS = [
  'notify.email',
  'notify.push',
  'notify.webhook',
  'pull.fetch',
  'export.r2',
  'erase.r2',
  'infer.embed',
  'infer.prose',
  'infer.draft',
] as const;

export type OutboxKind = (typeof OUTBOX_KINDS)[number];

export type OutboxRow = {
  id: string;
  kind: OutboxKind;
  payload: string;
  attempts: number;
  leasedUntil: string;
};

/**
 * How long a lease lasts, by what is on the other end of it.
 *
 * A push takes a second and a model takes a minute, so one window would have to be the longest —
 * and a lease that is too long is a notification nobody sends for five minutes after the worker
 * delivering it died.
 */
const NOTIFY_LEASE_MS = 60_000;
const INFER_LEASE_MS = 120_000;
const LEASE_OTHER_MS = 300_000;

const iso = (ms: number): string => new Date(ms).toISOString();

/**
 * Queue one job. The ONLY insertion path, for the same reason `schedule` has one: a second one is
 * how the doorbell stops being rung and a notification waits for the next unrelated write.
 */
export function enqueue(sql: Sql, mint: () => string, nowMs: number, kind: OutboxKind, payload: unknown): string {
  const id = mint();
  sql.exec(
    "INSERT INTO outbox (id, created, kind, payload, state, attempts) VALUES (?, ?, ?, ?, 'pending', 0)",
    id,
    iso(nowMs),
    kind,
    JSON.stringify(payload),
  );
  return id;
}

/**
 * Claim up to `n` jobs, in one statement.
 *
 * ONE STATEMENT, so a second drain arriving at the same moment finds nothing rather than sending
 * the same email twice. An expired lease is claimable again — a worker that died holding rows must
 * not take them with it — which is the belt that makes the doorbell losable.
 */
export function lease(sql: Sql, nowMs: number, kinds: readonly OutboxKind[], n: number): OutboxRow[] {
  const wanted = kinds.filter((k) => (OUTBOX_KINDS as readonly string[]).includes(k));
  if (wanted.length === 0 || n <= 0) return [];
  const limit = Math.min(Math.floor(n), 100);

  const marks = wanted.map(() => '?').join(', ');
  const rows = sql.all<{ id: string; kind: OutboxKind; payload: string; attempts: number; leased_until: string }>(
    `UPDATE outbox SET state = 'leased', leased_until = CASE
       WHEN kind LIKE 'notify.%' THEN ?
       WHEN kind LIKE 'infer.%' THEN ?
       ELSE ? END
     WHERE id IN (
       SELECT id FROM outbox
       WHERE kind IN (${marks}) AND (state = 'pending' OR (state = 'leased' AND leased_until < ?))
       ORDER BY created LIMIT ?)
     RETURNING id, kind, payload, attempts, leased_until`,
    iso(nowMs + NOTIFY_LEASE_MS),
    iso(nowMs + INFER_LEASE_MS),
    iso(nowMs + LEASE_OTHER_MS),
    ...wanted,
    iso(nowMs),
    limit,
  );
  return rows.map((r) => ({ id: r.id, kind: r.kind, payload: r.payload, attempts: r.attempts, leasedUntil: r.leased_until }));
}

/** The backoff both ladders use: doubling minutes, capped at six hours. */
export const backoffMs = (attempts: number): number => Math.min(2 ** attempts * 60_000, 6 * 3_600_000);

export type Ack = { id: string; state: 'done' | 'failed'; error?: string | undefined };

/** What the deliverer needs from the record to finish the job, beyond SQL. */
export type AckDeps = {
  mint: () => string;
  /** The next integer for a counter, inside the transaction. `SG41` is `allocate('suggestion')`. */
  allocate: (name: string) => number;
  nowMs: number;
};

/**
 * Finish a leased job.
 *
 * `done` closes it. `failed` walks the ladder: `attempts + 1`, and a `retry` row that will put the
 * job back to `pending`. At the eighth failure the job is `dead` and a suggestion opens — because a
 * notification that silently gave up is worse than one that never existed, and the person it was
 * about is the only one who can decide whether to retry it or change what produces it.
 */
export function ack(sql: Sql, deps: AckDeps, args: Ack): Result<null> {
  const row = sql.one<{ kind: string; payload: string; attempts: number }>(
    "SELECT kind, payload, attempts FROM outbox WHERE id = ? AND state = 'leased'",
    args.id,
  );
  /* A JOB THAT IS NOT LEASED CANNOT BE ACKED, and the refusal says which of the two it is: a lease
     that expired while the worker was delivering is a different problem from an id that never
     existed, and a deliverer that cannot tell them apart retries the wrong one. */
  if (!row) {
    const known = sql.one<{ state: string }>('SELECT state FROM outbox WHERE id = ?', args.id);
    return no<null>(
      'OUT_OF_BOUNDS',
      known
        ? `Job ${args.id} is ${known.state}, not leased. Its lease expired and somebody else has it, or it is already finished.`
        : `No job ${args.id}. Lease it before acking it.`,
      { at: 'id' },
    );
  }

  if (args.state === 'done') {
    sql.exec("UPDATE outbox SET state = 'done', leased_until = NULL WHERE id = ?", args.id);
    return ok(null);
  }

  const after = sql.one<{ attempts: number }>(
    "UPDATE outbox SET state = 'failed', leased_until = NULL, attempts = attempts + 1 WHERE id = ? RETURNING attempts",
    args.id,
  );
  const attempts = Number(after?.attempts ?? row.attempts + 1);
  const error = args.error ?? 'no reason given';

  if (attempts < 8) {
    /* THE RETRY IS A SCHEDULE ROW, not a flag on this one. `UNIQUE (kind, key)` makes it idempotent:
       two failures of the same job cannot arm two retries, and the key says what it is about. */
    sql.exec(
      `INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts)
       VALUES (?, ?, 'retry', ?, ?, 'pending', ?)
       ON CONFLICT (kind, key) DO UPDATE SET due_at = excluded.due_at, state = 'pending', attempts = excluded.attempts`,
      deps.mint(),
      iso(deps.nowMs + backoffMs(attempts)),
      `outbox:${args.id}`,
      JSON.stringify({ outbox: args.id }),
      attempts,
    );
    return ok(null);
  }

  sql.exec("UPDATE outbox SET state = 'dead' WHERE id = ?", args.id);
  deadLetter(sql, deps, { id: args.id, kind: row.kind, payload: row.payload, attempts, error });
  return ok(null);
}

/**
 * The visible item at the end of the ladder.
 *
 * The question is the whole point of it: "retry it, or change what produces it" is a decision only a
 * person can make, and a dead job with no question attached is a row in a table nobody opens.
 */
function deadLetter(
  sql: Sql,
  deps: AckDeps,
  job: { id: string; kind: string; payload: string; attempts: number; error: string },
): void {
  openChangeSuggestion(sql, deps, {
    declarationId: 'kernel.outbox',
    from: { kind: job.kind, error: job.error, attempts: job.attempts, payload: summary(job.payload) },
    question: `${job.kind} could not be delivered after ${job.attempts} attempts: ${job.error}. Retry it, or change what produces it.`,
  });
}

/**
 * A `change` suggestion by `system`, and the `suggest` event that makes it visible.
 *
 * Shared by the two ladders, because they end the same way and a second copy of this would be the
 * one that forgot the event — leaving a suggestion nothing in the app knows arrived.
 */
export function openChangeSuggestion(
  sql: Sql,
  deps: AckDeps,
  item: { declarationId: string; from: Record<string, unknown>; question: string },
): string {
  const id = `SG${deps.allocate('suggestion')}`;
  const body = { declaration_id: item.declarationId, from: item.from, to: 'retry', question: item.question };
  sql.exec(
    "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES (?, 'change', ?, 'open', 'system', ?)",
    id,
    JSON.stringify(body),
    iso(deps.nowMs),
  );
  sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, note) VALUES (?, ?, 'system', 'suggest', ?, 'suggestion', ?)",
    deps.mint(),
    iso(deps.nowMs),
    `suggestion:${id}`,
    item.question.slice(0, 280),
  );
  return id;
}

/**
 * A payload reduced to something safe to put in front of a person.
 *
 * KEYS AND THE FIRST 120 CHARACTERS, and never the fields that are the reason the job existed:
 * `texts`, a body, a token. A dead-letter item is READ by whoever the record belongs to, and a
 * failure report that quotes the credential it failed to use has published it.
 */
export function summary(payload: string): Record<string, string> {
  const withheld = new Set(['texts', 'text', 'html', 'body', 'ciphertext', 'token', 'secret', 'vectors', 'password']);
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return { payload: payload.slice(0, 120) };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return { payload: String(parsed).slice(0, 120) };

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (withheld.has(key)) {
      out[key] = '--withheld--';
      continue;
    }
    out[key] = (typeof value === 'string' ? value : JSON.stringify(value) ?? String(value)).slice(0, 120);
  }
  return out;
}
