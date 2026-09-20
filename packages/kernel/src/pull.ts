/**
 * `pull`: a scheduled fetch of something you already own.
 *
 * THE RECORD NEVER MAKES THE CALL. A fire writes ONE outbox row carrying the ingest, its cursor and
 * the id of the grant the runner should open — and nothing else. The runner fetches, unwraps the
 * credential somewhere the record cannot reach, and hands each page back through `applyPull`. That
 * is the whole of why "we cannot read your record" survives contact with a bank's API.
 *
 * JITTER IS MANDATORY AND DETERMINISTIC. Twenty connectors declaring `every: 1h` become due at the
 * same instant, and one wake then runs twenty fetches in one invocation — at fifty pages each that
 * is a thousand subrequests, which is exactly the paid ceiling. Deriving the offset from the record
 * and the ingest makes it stable, and stable is what makes "why was there a gap at four" a question
 * with an answer. Random jitter makes it unanswerable.
 *
 * A MINIMUM INTERVAL, REFUSED AT INSTALL. Fifteen minutes, or a provider's own floor — banks are
 * hard-floored at six hours by law, and a connector that polled one every minute would be closed by
 * the bank rather than by us.
 *
 * AND A REJECTED CREDENTIAL IS NEVER RETRIED. A 401 is not a transient failure: it is a fact about
 * the key, and eight exponential retries against a bank's auth endpoint is how an account gets
 * locked. The row pauses, the grant is marked stale, and somebody is told.
 */

import type { Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { instant } from './migrate.ts';


export type PullDecl = {
  ingest: string;
  /** `15m`, `1h`, `6h`, `1d`. Refused below the floor. */
  every: string;
  /** The grant whose key the runner opens. The record hands over its id and never its bytes. */
  grant?: string;
  /** A provider's own floor, in the same span grammar. Banks are six hours by law. */
  floor?: string;
};

/** Fifteen minutes. Below it, a connector costs more than it tells you. */
export const FLOOR_MS = 15 * 60_000;

const INTERVAL = /^(\d{1,4})([smhdw])$/;

/**
 * `15m`, `1h`, `6h`, `1d` — and `m` IS MINUTES HERE.
 *
 * IT IS NOT `spanMs`, AND THE DIFFERENCE IS DELIBERATE. A credential's `rotate_every: 3m` means
 * three months and a connector's `every: 15m` means fifteen minutes, because those are the units
 * each of those things is actually said in. One grammar covering both would have to pick, and
 * whichever it picked would be surprising in the other place — a rotation every fifteen minutes or
 * a fetch every three months, and both of those are the kind of wrong nobody reads twice.
 */
export function intervalMs(text: string): number | null {
  /* A DECLARATION THAT NAMES NO INTERVAL REACHED HERE AND THREW. `install` is the door a `.brain`
     pack comes through, and `checkInterval` is called from the validator, so an ingest with no
     `every:` took the whole install down with a `TypeError` instead of being refused with a
     sentence — every other declaration in the same pack included. The type said `string`; the
     value came out of `JSON.parse`. */
  if (typeof text !== 'string') return null;
  const m = INTERVAL.exec(text.trim());
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2];
  return n * (unit === 's' ? 1_000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : unit === 'd' ? 86_400_000 : 604_800_000);
}

export type Fired = { ingest: string; outbox: string | null; nextMs: number | null; paused: boolean };

/**
 * A stable offset, from the record and the ingest.
 *
 * FNV-1a over `<record>\x1f<ingest>`, modulo a window of a tenth of the interval clamped between
 * thirty seconds and fifteen minutes. It is arithmetic rather than a hash library because the value
 * only has to be well spread and the same every time — and "the same every time" is the whole
 * requirement, because a gap somebody asks about has to have a reason.
 */
export function jitterMs(recordId: string, ingest: string, everyMs: number): number {
  let h = 0x811c9dc5;
  for (const ch of `${recordId}\x1f${ingest}`) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const window = Math.min(Math.max(Math.floor(everyMs / 10), 30_000), 15 * 60_000);
  return h % window;
}

export type PullDeps = {
  sql: Sql;
  recordId: string;
  nowMs: number;
  mint: () => string;
  outbox: (payload: unknown) => string;
};

/**
 * Check a connector's interval before it is installed.
 *
 * AT INSTALL, because a floor enforced at fire time is a floor somebody finds out about after they
 * have written the declaration and waited for the first run.
 */
export function checkInterval(decl: PullDecl): Result<number> {
  const every = intervalMs(decl.every);
  if (every === null)
    return no<number>(
      'VALUE_MALFORMED',
      /* NAMED RATHER THAN PRINTED WHEN THERE IS NOTHING TO PRINT. "undefined is not an interval" is
         a sentence about this program and not about the declaration somebody wrote. */
      typeof decl.every === 'string'
        ? `${decl.every} is not an interval: write 15m, 1h, 6h or 1d.`
        : `${decl.ingest} says how to fetch but not how often. Write every: 15m, 1h, 6h or 1d.`,
      { at: 'every' },
    );

  const floor = decl.floor ? intervalMs(decl.floor) : null;
  if (decl.floor && floor === null)
    return no<number>('VALUE_MALFORMED', `${decl.floor} is not an interval.`, { at: 'floor' });

  const lowest = Math.max(FLOOR_MS, floor ?? 0);
  if (every < lowest)
    return no<number>(
      'OUT_OF_BOUNDS',
      floor && floor > FLOOR_MS
        ? `${decl.ingest} may be fetched no more often than every ${decl.floor}, which is the provider's own floor.`
        : `${decl.ingest} may be fetched no more often than every fifteen minutes.`,
      { at: 'every' },
    );

  return ok(every);
}

/**
 * A `pull` row fires: queue one fetch, and say when the next one is due.
 *
 * THE PAYLOAD CARRIES THE GRANT'S ID AND NOT ITS BYTES. The runner opens it through the record's own
 * vault, under a `grant.read` event, so a fetch that reads a credential is a fetch that is on the
 * record — and one that never happened cannot pretend it did.
 */
export function firePull(deps: PullDeps, row: { id: string; payload: string }, decl: PullDecl | null): Fired {
  const payload = row.payload;
  const { ingest, cursor } = JSON.parse(payload) as { ingest?: string; cursor?: string };
  if (!ingest || !decl) return { ingest: ingest ?? '', outbox: null, nextMs: null, paused: false };

  /* A PAUSED CONNECTOR IS THIS ROW WITH `state = 'paused'`, and the claim never takes one — so a
     credential that was rejected stops costing requests until somebody rebinds it. Getting here
     means it was pending, so it is live. */
  const grant = decl.grant
    ? deps.sql.one<{ revoked_at: string | null; stale_at: string | null }>(
        'SELECT revoked_at, stale_at FROM grant WHERE id = ?',
        decl.grant,
      )
    : null;

  if (decl.grant && (!grant || grant.revoked_at)) {
    /* THE CREDENTIAL IS GONE, so the connector is not going to work and saying so is the only useful
       thing left. Paused rather than failed: a failure walks a retry ladder against an auth endpoint,
       which is how an account gets locked. */
    /* THE ROW THAT FIRED, BY ITS ID. Pausing by the payload's ingest name pauses whichever row
       happens to carry that key — which after a rename is a different connector, not due for
       another half hour — and leaves the row that actually fired stranded at `firing` for ever:
       no ladder, no failure, and `done` reported. */
    deps.sql.exec("UPDATE schedule SET state = 'paused' WHERE id = ?", row.id);
    deps.sql.exec(
      "INSERT INTO event (id, ts, actor, kind, target, target_kind, note) VALUES (?, ?, ?, 'note', ?, 'grant', ?)",
      deps.mint(),
      instant(deps.nowMs),
      `ingest:${ingest}`,
      `grant:${decl.grant}`,
      `${ingest} is paused: the credential it uses is gone.`,
    );
    return { ingest, outbox: null, nextMs: null, paused: true };
  }

  const every = intervalMs(decl.every) ?? FLOOR_MS;

  /* A RUN THAT HAS NOT FINISHED IS NOT RUN AGAIN. `call` and `poll` have checked this since they
     were written (`actions.ts`, the `busy` query) and `pull` never did, so a connector whose hour
     came round while the last hour's run was still leased got a second row — two runs of the same
     window, against the same provider, paying twice for it. Each row carries its own lease, so the
     write-side fence in `fetched.ts` does not see the other one and cannot help.

     THE STATES ARE THE UNFINISHED ONES. `failed` is in the list because a row on the retry ladder
     is still going to run; only `done` and `dropped` mean this connector is idle.

     AND THE NEXT OCCURRENCE IS STILL ARMED. Skipping the queue is not skipping the schedule: a run
     that overruns its interval should resume its cadence afterwards, not stop. */
  const busy = deps.sql.one(
    `SELECT 1 AS x FROM outbox WHERE kind = 'pull.fetch' AND state IN ('pending', 'leased', 'failed')
     AND json_extract(payload, '$.ingest') = ? LIMIT 1`,
    ingest,
  );
  if (busy)
    return { ingest, outbox: null, nextMs: deps.nowMs + every + jitterMs(deps.recordId, ingest, every), paused: false };

  const id = deps.outbox({
    ingest,
    ...(cursor === undefined ? {} : { cursor }),
    ...(decl.grant === undefined ? {} : { grant: decl.grant }),
  });

  /* THE JITTER IS ON EVERY OCCURRENCE, not only the first. Twenty connectors that all started at
     midnight would re-converge within a day if the offset were applied once. */
  return { ingest, outbox: id, nextMs: deps.nowMs + every + jitterMs(deps.recordId, ingest, every), paused: false };
}

/**
 * A connector run comes back.
 *
 * `paused` IS A STATE, NOT A FAILURE. A 401 is a fact about the key rather than a transient error,
 * and eight exponential retries against a bank's auth endpoint is how an account gets locked. The
 * row pauses, the grant is marked stale, and the next thing that happens is a person rebinding it.
 */
export function applyPull(
  deps: PullDeps,
  finish: { ingest: string; outcome: 'ok' | 'paused'; cursor?: string; dueAtMs?: number; error?: string },
): Result<null> {
  const row = deps.sql.one<{ id: string; payload: string; state: string }>(
    "SELECT id, payload, state FROM schedule WHERE kind = 'pull' AND key = ?",
    finish.ingest,
  );
  if (!row) return no<null>('OUT_OF_BOUNDS', `There is no connector called ${finish.ingest}.`, { at: 'ingest' });

  /* A REFUSAL IS A VALUE HERE TOO. A payload that is not JSON threw a `SyntaxError` straight out
     through the `Result` contract, so the one caller written to branch on `ok` got an exception. */
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(row.payload) as Record<string, unknown>;
  } catch {
    return no<null>('VALUE_MALFORMED', `${finish.ingest} has a payload this record cannot read.`, { at: 'ingest' });
  }
  if (finish.cursor !== undefined) payload.cursor = finish.cursor;

  if (finish.outcome === 'paused') {
    deps.sql.exec(
      "UPDATE schedule SET state = 'paused', payload = ? WHERE id = ?",
      JSON.stringify(payload),
      row.id,
    );
    const grant = typeof payload.grant === 'string' ? payload.grant : null;
    if (grant) deps.sql.exec('UPDATE grant SET stale_at = ? WHERE id = ?', instant(deps.nowMs), grant);
    deps.sql.exec(
      "INSERT INTO event (id, ts, actor, kind, target, target_kind, note) VALUES (?, ?, ?, 'pull', ?, 'grant', ?)",
      deps.mint(),
      instant(deps.nowMs),
      `ingest:${finish.ingest}`,
      grant ? `grant:${grant}` : null,
      `${finish.ingest} stopped: ${finish.error ?? 'the credential was rejected'}. It will not retry until somebody rebinds it.`,
    );
    return ok(null);
  }

  /* THE RUNNER'S `due_at` WINS when it sends one, because a provider that says "come back at four"
     knows something the schedule does not — a rate limit, a nightly window, a batch that is not
     ready. The record's own interval is the fallback rather than the rule. */
  deps.sql.exec(
    "UPDATE schedule SET state = 'pending', payload = ?, due_at = COALESCE(?, due_at), attempts = 0 WHERE id = ?",
    JSON.stringify(payload),
    finish.dueAtMs === undefined ? null : instant(finish.dueAtMs),
    row.id,
  );
  return ok(null);
}
