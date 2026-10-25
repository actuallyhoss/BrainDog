/**
 * `pull`: a scheduled fetch of something you already own.
 *
 * THE RECORD NEVER MAKES THE CALL. A fire writes ONE outbox row carrying the ingest, its cursor and
 * the id of the grant the runner should open — and nothing else. The runner fetches, unwraps the
 * credential somewhere the record cannot reach, hands each page back through `applyPage`
 * (`fetched.ts`), and finishes the run through the outbox's ack, which `finishPull` below reads. That
 * is the whole of why "we cannot read your record" survives contact with a bank's API.
 *
 * THE CURSOR LIVES ON THE CONNECTOR'S OWN SCHEDULE ROW, and this file holds what writes and reads it:
 * `keepCursor` writes it after every page, `finishPull` writes the one a run ends on, and `cursorOf`
 * reads it back for `prepareAction` to hand the next run. The older `applyPull` below writes the same key on the same
 * row, for a caller that finishes a run through it rather than through the ack. A cursor written anywhere else is a
 * second answer to "where did this connector get to", and the run that read the other one fetches its first window
 * for ever.
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
import { clockOf, nextSlotMs } from './slot.ts';


export type PullDecl = {
  ingest: string;
  /** `15m`, `1h`, `6h`, `1d`. Refused below the floor. */
  every: string;
  /** The grant whose key the runner opens. The record hands over its id and never its bytes. */
  grant?: string;
  /** A provider's own floor, in the same span grammar. Banks are six hours by law. */
  floor?: string;
  /**
   * A connector's `fetch:` block, read here for one key: `auth.grant`, the key its requests are signed
   * with (`keyNameOf`). Everything else in it is `@braindog/connect`'s, and this file never looks.
   */
  fetch?: unknown;
  /** The wall time a single-request pull is due at, and the zone it is read in (`slot.ts`'s `clockOf`). */
  at?: string;
  tz?: string;
};

/**
 * The name of the key a scheduled fetch sends: its `fetch.auth.grant` when it signs its requests, or
 * its top-level `grant`. A label or an id; `keyNamed` in `actions.ts` resolves either.
 *
 * THE AUTH BLOCK FIRST, because it is the key the requests are actually signed with. A connector
 * declares its key inside `fetch.auth` (`47 §4.5`), and until this read it the fire and the run both
 * looked only at the top-level `grant`, so a connector that named its key where its grammar says to
 * was handed no credential at all and answered `PULL_AUTH_REJECTED` on every run. An auth block of
 * kind `none` names no key, and the top-level one is read instead, as it always was.
 *
 * ONE READER, used by the fire here and by `prepareAction`, because the fire writes the key's id into
 * the job and the keychain refuses a lease on a job that names any other key (`sealedGrant`).
 */
export function keyNameOf(decl: { grant?: unknown; fetch?: unknown }): string | undefined {
  const auth = decl.fetch !== null && typeof decl.fetch === 'object' ? (decl.fetch as { auth?: unknown }).auth : undefined;
  if (auth !== null && typeof auth === 'object') {
    const signed = auth as { kind?: unknown; grant?: unknown };
    if (signed.kind !== 'none' && typeof signed.grant === 'string' && signed.grant !== '') return signed.grant;
  }
  return typeof decl.grant === 'string' && decl.grant !== '' ? decl.grant : undefined;
}

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
  /**
   * The live key a name opens, by label or id: `keyNamed` in `actions.ts`, handed in.
   *
   * INJECTED AND NOT IMPORTED, because `actions.ts` imports this file and an import back would be a
   * cycle at run time. Absent, a name is read as an id and nothing else, which is what a fire did
   * before it could be handed a label; a label then names no live key and the connector pauses.
   */
  keyOf?: ((name: string) => { id: string } | null) | undefined;
  /** The record's zone, for a pull whose declaration names none (`slot.ts`'s `clockOf`). */
  tz?: string | undefined;
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
 * keychain, under a `grant.read` event, so a fetch that reads a credential is a fetch that is on the
 * record — and one that never happened cannot pretend it did.
 */
export function firePull(deps: PullDeps, row: { id: string; payload: string; due_at?: string }, decl: PullDecl | null): Fired {
  const payload = row.payload;
  /* `cursor` IS WHATEVER THE ROW HOLDS: a page cursor as `keepCursor` and `finishPull` write it, or
     the string an older `applyPull` wrote. The fire carries it as it is and never reads it. `slot` is
     the unjittered instant this row last counted from, kept here for a pull that does not page. */
  const parsedPayload = JSON.parse(payload) as { ingest?: string; cursor?: unknown; slot?: unknown };
  const { ingest, cursor } = parsedPayload;
  if (!ingest || !decl) return { ingest: ingest ?? '', outbox: null, nextMs: null, paused: false };

  /* A PAUSED CONNECTOR IS THIS ROW WITH `state = 'paused'`, and the claim never takes one — so a
     credential that was rejected stops costing requests until somebody rebinds it. Getting here
     means it was pending, so it is live.

     THE KEY IS RESOLVED HERE AND ITS ID GOES IN THE JOB, because the keychain opens a credential only
     for a job that names it by id (`sealedGrant`). A name the job carried as written reached the keychain
     as a label and was refused as a key the job does not send. */
  const named = keyNameOf(decl);
  const key =
    named === undefined
      ? null
      : deps.keyOf
        ? deps.keyOf(named)
        : (deps.sql.one<{ id: string }>('SELECT id FROM grant WHERE id = ? AND revoked_at IS NULL', named) ?? null);

  if (named !== undefined && key === null) {
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
      `grant:${named}`,
      `${ingest} is paused: the credential it uses is gone.`,
    );
    return { ingest, outbox: null, nextMs: null, paused: true };
  }

  const every = intervalMs(decl.every) ?? FLOOR_MS;

  /* A PULL THAT PAGES ARMS ITS NEXT RUN FROM ITS SLOT ONLY ONCE THE PAGED RUN ENDS (`finishPull`, whose
     slot `prepareAction` then hands the runner): counting it here too would be a second, earlier answer
     to "when is this due next," racing whichever alarm read it first. A pull that fires and finishes in
     one request has no other writer, so it counts and keeps its own slot here, from the last slot this
     row wrote, else its `due_at`, else now. */
  const fetch = decl.fetch !== null && typeof decl.fetch === 'object' ? (decl.fetch as { page?: unknown; read?: unknown }) : undefined;
  const paged = fetch !== undefined && (fetch.page !== undefined || fetch.read !== undefined);
  let dueAfter = (): number => deps.nowMs + every + jitterMs(deps.recordId, ingest, every);
  if (!paged) {
    const slotMs =
      typeof parsedPayload.slot === 'string' && !Number.isNaN(Date.parse(parsedPayload.slot))
        ? Date.parse(parsedPayload.slot)
        : typeof row.due_at === 'string' && !Number.isNaN(Date.parse(row.due_at))
          ? Date.parse(row.due_at)
          : deps.nowMs;
    const next = nextSlotMs({ slotMs, nowMs: deps.nowMs, everyMs: every, clock: clockOf(decl, deps.tz ?? 'UTC') });
    deps.sql.exec('UPDATE schedule SET payload = ? WHERE id = ?', JSON.stringify({ ...parsedPayload, slot: instant(next) }), row.id);
    dueAfter = () => next + jitterMs(deps.recordId, ingest, every);
  }

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
  if (busy) return { ingest, outbox: null, nextMs: dueAfter(), paused: false };

  const id = deps.outbox({
    ingest,
    ...(cursor === undefined ? {} : { cursor }),
    ...(key === null ? {} : { grant: key.id }),
  });

  /* THE JITTER IS ON EVERY OCCURRENCE, not only the first. Twenty connectors that all started at
     midnight would re-converge within a day if the offset were applied once. */
  return { ingest, outbox: id, nextMs: dueAfter(), paused: false };
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
    /* BY LABEL OR ID, as the fire resolves it, so a row that names its key by label marks that key stale and not nothing. */
    const said = typeof payload.grant === 'string' && payload.grant !== '' ? payload.grant : null;
    const grant = said === null ? null : (deps.keyOf?.(said)?.id ?? said);
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

/* ── the cursor ──────────────────────────────────────────────────────────── */

/**
 * Where a paged connector got to (`47 §4.4`), structurally `@braindog/connect`'s `Cursor`.
 *
 * `watermark` is the exclusive end of complete coverage; `window` is there only when the last run
 * stopped part way, and names the range and the page it stopped on. `page` is the paginator's own
 * state, which this record keeps and never reads.
 */
export type PullCursor = {
  watermark: string | null;
  window?: { since: string; until: string; page: Readonly<Record<string, unknown>> | null; n: number; rows: number };
};

/**
 * The most a cursor may hold, in characters of JSON. A page cursor is a value the provider chose (a
 * token, a `Link` URL), and it is written onto a schedule row every page; one past this is not kept,
 * and the run resumes from the last cursor that was, whose pages the register's dedupe already holds.
 */
export const CURSOR_CHARS = 4_096;

/**
 * A stored or handed-back cursor, read, or `null` when it is not one.
 *
 * A WINDOW THAT DOES NOT READ WHOLE IS DROPPED AND THE WATERMARK KEPT. Resuming a half-read range
 * from a page state nobody can vouch for is how a window is fetched from the wrong page; starting it
 * again from the watermark costs pages the dedupe already holds.
 */
export function cursorOf(value: unknown): PullCursor | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const said = value as { watermark?: unknown; window?: unknown };
  if (said.watermark !== undefined && said.watermark !== null && typeof said.watermark !== 'string') return null;
  const watermark = typeof said.watermark === 'string' ? said.watermark : null;
  const held = said.window;
  if (held === null || typeof held !== 'object' || Array.isArray(held)) return { watermark };
  const w = held as { since?: unknown; until?: unknown; page?: unknown; n?: unknown; rows?: unknown };
  const page =
    w.page === null || w.page === undefined
      ? null
      : typeof w.page === 'object' && !Array.isArray(w.page)
        ? (w.page as Readonly<Record<string, unknown>>)
        : undefined;
  if (typeof w.since !== 'string' || typeof w.until !== 'string' || page === undefined) return { watermark };
  if (typeof w.n !== 'number' || !Number.isInteger(w.n) || typeof w.rows !== 'number' || !Number.isInteger(w.rows)) return { watermark };
  return { watermark, window: { since: w.since, until: w.until, page, n: w.n, rows: w.rows } };
}

/**
 * The cursor, onto the connector's schedule row, after every page (`applyPage`). The one a run ends
 * on is written by `finishPull`, beside the slot, in one update.
 *
 * WRITTEN PER PAGE AND NOT ONLY AT THE END, because the point of a cursor is the run that does not
 * reach the end: a lease that expires at page nine resumes at page nine, and one written only on
 * success resumes at page one and re-fetches eight pages it already wrote.
 */
export function keepCursor(sql: Sql, ingest: string, cursor: unknown): void {
  const text = JSON.stringify(cursor);
  if (text === undefined || text.length > CURSOR_CHARS) return;
  const row = sql.one<{ id: string; payload: string }>("SELECT id, payload FROM schedule WHERE kind = 'pull' AND key = ?", ingest);
  if (!row) return;
  const payload = payloadOf(row.payload);
  if (payload === null) return;
  payload.cursor = cursor;
  sql.exec('UPDATE schedule SET payload = ? WHERE id = ?', JSON.stringify(payload), row.id);
}

/** A schedule row's payload as an object, or `null` when it is not one. */
const payloadOf = (text: string): Record<string, unknown> | null => {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/* ── the finish ──────────────────────────────────────────────────────────── */

/**
 * `@braindog/connect`'s outcomes, copied from `PULL_OUTCOMES` because the kernel may not import it
 * (`31 §2`), which this record reads off an ack.
 */
const OUTCOMES = ['ok', 'partial', 'review', 'failed', 'paused'] as const;

/** A resealed credential, as the runner hands it back: base64, at the version it was sealed for. */
type Rotated = { ciphertext: string; nonce: string; grant_id: string; version: number };

/**
 * What a paged run's ack carries, as far as the record acts on it: connect's `PullFinish`, read.
 *
 * `dueMs` is the runner's next due instant (its next slot plus its jitter, or a minute away for a run
 * that stopped at a cap); `slot` the unjittered slot it counted from; `notBefore` a provider's
 * `Retry-After` as an instant.
 */
export type PullFinished = {
  outcome: (typeof OUTCOMES)[number];
  cursor: PullCursor | null;
  dueMs: number | null;
  slot: string | null;
  notBefore: number | null;
  rotated: Rotated | null;
};

/**
 * The most characters a resealed credential may carry. A grant is a small JSON object of string
 * fields sealed once (`47 §4.6`), so anything near this is not one.
 */
const ROTATED_CHARS = 65_536;

const rotatedOf = (value: unknown): Rotated | null => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const r = value as { ciphertext?: unknown; nonce?: unknown; grant_id?: unknown; version?: unknown };
  if (typeof r.ciphertext !== 'string' || typeof r.nonce !== 'string' || typeof r.grant_id !== 'string') return null;
  if (typeof r.version !== 'number' || !Number.isInteger(r.version) || r.version < 2) return null;
  return { ciphertext: r.ciphertext, nonce: r.nonce, grant_id: r.grant_id, version: r.version };
};

/**
 * An ack's `result`, read as a paged run's finish, or `null` when it is not one.
 *
 * `null` IS NOT A REFUSAL. A host that acks a connector job with no result (`release`, a lapsed
 * lease, a job whose declaration has gone) is answering the older contract, and the job still
 * finishes: only what the finish would have written is left as it was.
 */
export function pullFinishOf(result: unknown): PullFinished | null {
  if (result === null || typeof result !== 'object' || Array.isArray(result)) return null;
  const said = result as { outcome?: unknown; cursor?: unknown; due_at?: unknown; slot?: unknown; error?: unknown; rotated_grant?: unknown };
  const outcome = OUTCOMES.find((o) => o === said.outcome);
  if (outcome === undefined) return null;
  const due = typeof said.due_at === 'string' ? Date.parse(said.due_at) : Number.NaN;
  const slot = typeof said.slot === 'string' && !Number.isNaN(Date.parse(said.slot)) ? said.slot : null;
  const wait = said.error !== null && typeof said.error === 'object' ? (said.error as { notBefore?: unknown }).notBefore : undefined;
  const notBefore = typeof wait === 'number' && Number.isFinite(wait) ? wait : null;
  return {
    outcome,
    cursor: cursorOf(said.cursor),
    dueMs: Number.isFinite(due) ? due : null,
    slot,
    notBefore,
    rotated: rotatedOf(said.rotated_grant),
  };
}

export type FinishDeps = {
  sql: Sql;
  mint: () => string;
  nowMs: number;
  /** The live key a name opens, by label or id: `keyNamed`. The row, never its bytes. */
  keyOf: (name: string) => { id: string; label: string } | null;
  /**
   * The one notification path, urgent. ABSENT ON A HOST THAT WIRED NONE, and then the pause is still
   * said, as a `note` event the record keeps, because a connector that stopped without a word is the
   * failure this whole finish exists to end.
   */
  notify?: ((said: { actor: string; say: string; because?: string }) => void) | undefined;
};

/**
 * A paged connector's run finishes: the half of `47 §5.1` that was planned and never written.
 *
 * CALLED FROM THE `pull.fetch` BRANCH OF `ack()`, IN THE ACK'S TRANSACTION, so the job being `done`
 * and its cursor being written are one event rather than two that can disagree. Until this existed
 * the ack marked the row finished and dropped everything the runner carried back: the cursor, the
 * next due instant, the pause and the rotated key. A windowed connector therefore fetched its first
 * window on every run, a rejected key was re-sent every interval, and a provider that rotates its
 * refresh token on every use had its one working token thrown away after the first run.
 *
 * WHAT EACH OUTCOME WRITES, which is connect's table (`run.ts`, `RULES`) read from the record's side:
 *
 *   - `ok` and `review`: the cursor the run ended on, and the next due instant the runner counted
 *     from its slot. A review keeps the cursor where it was, because the runner hands that one back.
 *   - `partial`: the half-read window, due again in the minute the runner set.
 *   - `failed`: the cursor only. The retry is the outbox's ladder, which `ack()` arms after this,
 *     no sooner than the provider's `Retry-After`.
 *   - `paused`: the connector's row pauses, its key is marked stale, and the owner is told. It is
 *     never retried: a 401 is a fact about the key, and eight retries against an auth endpoint is how
 *     an account gets locked. `resumeAction` is the only way it starts again.
 *
 * A ROTATED KEY IS STORED WHATEVER THE OUTCOME. The provider handed back the only credential that
 * still works at the token step, before any page, so a run that failed afterwards still has to keep
 * it or the connector is dead until somebody reconnects it by hand.
 *
 * THE DUE INSTANT MOVES ONLY A ROW THAT IS WAITING. A connector somebody paused, or whose
 * declaration was retired, while its run was out stays as they left it.
 */
export function finishPull(deps: FinishDeps, job: { payload: string }, finish: PullFinished): void {
  const fired = payloadOf(job.payload);
  const ingest = fired === null ? undefined : fired.ingest;
  if (typeof ingest !== 'string' || ingest === '') return;
  const actor = `ingest:${ingest}`;
  /* THE KEY THE JOB NAMED, which the fire resolved to an id and the keychain opened for this run. */
  const named = fired === null ? undefined : fired.grant;
  const key = typeof named === 'string' && named !== '' ? deps.keyOf(named) : null;

  if (finish.rotated !== null && key !== null && finish.rotated.grant_id === key.id) keepRotated(deps, actor, key.id, finish.rotated);

  const row = deps.sql.one<{ id: string; payload: string }>("SELECT id, payload FROM schedule WHERE kind = 'pull' AND key = ?", ingest);
  if (!row) return;
  const payload = payloadOf(row.payload);
  if (payload === null) return;
  if (finish.cursor !== null && JSON.stringify(finish.cursor).length <= CURSOR_CHARS) payload.cursor = finish.cursor;
  /* THE SLOT IS KEPT SO THE NEXT RUN COUNTS FROM IT. A run handed the instant it was prepared counts
     its next slot from that, and the lateness of every alarm is added to the schedule for good. */
  if (finish.slot !== null) payload.slot = finish.slot;
  deps.sql.exec('UPDATE schedule SET payload = ? WHERE id = ?', JSON.stringify(payload), row.id);

  if (finish.outcome === 'paused') {
    const paused = deps.sql.one<{ id: string }>("UPDATE schedule SET state = 'paused' WHERE id = ? AND state = 'pending' RETURNING id", row.id);
    if (key !== null) deps.sql.exec('UPDATE grant SET stale_at = ? WHERE id = ?', instant(deps.nowMs), key.id);
    /* SAID ONLY WHEN THIS FINISH PAUSED IT. A row already paused was told when it paused, and one
       retired while the run was out has nothing left for anybody to resume. */
    if (paused) tellPaused(deps, ingest, key);
    return;
  }

  if (finish.outcome === 'failed' || finish.dueMs === null) return;
  deps.sql.exec("UPDATE schedule SET due_at = ? WHERE id = ? AND state = 'pending'", instant(finish.dueMs), row.id);
}

/**
 * The owner is told a connector stopped, through the one notification path when the host wired it.
 *
 * THE SENTENCE IS THE RECORD'S AND NOT THE HOST'S. The runner's own text names the path it stopped at
 * and what it found there, which is a provider's answer; what a lock screen carries is the connector
 * and the key's label, as a refused `call` or `poll` says it (`finishAction`).
 */
function tellPaused(deps: FinishDeps, ingest: string, key: { label: string } | null): void {
  const actor = `ingest:${ingest}`;
  const say =
    key === null
      ? `${ingest} is paused: the provider refused its credential.`
      : `${ingest} is paused: the provider refused the key "${key.label}".`;
  if (deps.notify) {
    deps.notify({ actor, say, because: 'A connector whose key is refused is never retried. It runs again when somebody resumes it.' });
    return;
  }
  deps.sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, note) VALUES (?, ?, ?, 'note', ?, 'declaration', ?)",
    deps.mint(),
    instant(deps.nowMs),
    actor,
    `declaration:ingest.${ingest}`,
    say,
  );
}

/** Base64, either alphabet, either padding, as bytes; `null` when it is not base64 or is too long. */
const bytesOf = (text: string): Uint8Array | null => {
  if (text === '' || text.length > ROTATED_CHARS) return null;
  const standard = text.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return Uint8Array.from(atob(standard + '='.repeat((4 - (standard.length % 4)) % 4)), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
};

/**
 * A credential the runner resealed after the provider rotated it, stored as the grant's next version.
 *
 * THE SAME MOVE `bindGrant` MAKES FOR A ROTATION: the sealed bytes become the one prior version, the
 * new bytes and the version they were sealed at take their place, and the stale mark clears. It is
 * written here and not through `bindGrant` because nobody bound anything: the provider replaced the
 * token and the runner sealed the replacement under the connector key, at `version + 1` in the AAD.
 *
 * EVERY CHECK IN THE `WHERE` IS A WAY TO WRITE THE WRONG BYTES: the grant is the one this job named, it is live,
 * it is sealed under the connector key the runner sealed with, and it is still at the version the
 * run opened. A grant somebody rotated by hand while the run was out is newer than this, and keeps
 * what they gave it.
 */
function keepRotated(deps: FinishDeps, actor: string, id: string, rotated: Rotated): void {
  const ciphertext = bytesOf(rotated.ciphertext);
  const nonce = bytesOf(rotated.nonce);
  if (ciphertext === null || nonce === null) return;
  const moved = deps.sql.one<{ kind: string }>(
    `UPDATE grant SET prev_ciphertext = ciphertext, prev_nonce = nonce, ciphertext = ?, nonce = ?, version = ?,
       rotated_at = ?, stale_at = NULL
     WHERE id = ? AND version = ? AND revoked_at IS NULL AND sealed_under = 'connector'
     RETURNING kind`,
    ciphertext,
    nonce,
    rotated.version,
    instant(deps.nowMs),
    id,
    rotated.version - 1,
  );
  if (!moved) return;
  /* `grant.rotate`, the event a hand rotation writes, with the connector as its actor. */
  deps.sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, note) VALUES (?, ?, ?, 'grant.rotate', ?, 'grant', ?)",
    deps.mint(),
    instant(deps.nowMs),
    actor,
    `grant:${id}`,
    `${id} ${moved.kind}`,
  );
}
