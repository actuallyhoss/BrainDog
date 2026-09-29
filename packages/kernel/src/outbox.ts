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

import { actionJitterMs, keyNamed } from './actions.ts';
import { writeEmbeddings } from './embed.ts';
import { finishPull, pullFinishOf, type PullFinished } from './pull.ts';

/**
 * What the DDL's `CHECK` admits. Another is a migration, which is the point of the check.
 *
 * `script.run` IS MIGRATION 12'S: one run of a `script` declaration, leased by a host that runs it in a sandbox.
 *
 * `infer.ask` IS AN AUTOMATION'S QUESTION TO SLASH (`flow.ts`): `{ run, rule, step, question, shape, choices?,
 * about? }`, answered by an ack whose `result.text` is the answer, or whose `result.failed` is the sentence the run
 * ends on when the host refused to ask. The `CHECK` that admits it is a migration of its own.
 */
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
  'script.run',
  'infer.ask',
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
export function lease(sql: Sql, deps: AckDeps, kinds: readonly OutboxKind[], n: number): OutboxRow[] {
  const wanted = kinds.filter((k) => (OUTBOX_KINDS as readonly string[]).includes(k));
  if (wanted.length === 0 || n <= 0) return [];
  const limit = Math.min(Math.floor(n), 100);
  const nowMs = deps.nowMs;
  const marks = wanted.map(() => '?').join(', ');

  /* AN EXPIRED LEASE ON A QUESTION NO RUN IS WAITING ON IS FINISHED, AND NOT HANDED OUT AGAIN. `release()` leaves a
     leased Slash job to its ack, and the ack's failed branch reads the run; a host that never acked came through here
     instead, where only the clock was read. Measured, and `lease-cancelled-run.test.ts` counts it: a job leased, its
     run cancelled and never acked was handed out seven more times over 24 minutes of clock, each a post on the owner's
     key in the name of a rule that is gone, and ended `dead` with `attempts` 8, a dead letter addressed to a run that
     had already stopped. `done` with the expiry counted, as the failed ack counts it, because a host was handed it.

     BEFORE THE DEAD-LETTER SWEEP BELOW, or a job on its last rung is dead-lettered for a run that is over.

     AND A CALL A `call` STEP MADE, whose post on the owner's key is as unwanted once its run is over. A `pull.fetch` that
     names no run is a scheduled action or a rule's `run:`, and is left to the reclaim as it always was. */
  for (const row of sql.all<{ id: string; kind: string; payload: string }>(
    "SELECT id, kind, payload FROM outbox WHERE kind IN ('infer.ask', 'pull.fetch') AND state = 'leased' AND leased_until < ?",
    iso(nowMs),
  ))
    if ((row.kind === 'infer.ask' || runOf(row.payload) !== null) && !awaited(sql, row.id, row.payload)) finishUnawaited(sql, row.id, 1);

  /* AN EXPIRED LEASE THAT HAS RUN OUT OF LADDER IS DEAD, and this runs first so the claim below
     cannot hand it out again. Without it a deliverer that never acks — crashed, or simply slower
     than the sixty-second window — was handed the same job forever: forty deliveries in the probe,
     `attempts` still 0, no ceiling and no visible item. The file's own promise is that the eighth
     failure is visible. */
  for (const row of sql.all<{ id: string; kind: string; payload: string; attempts: number }>(
    `SELECT id, kind, payload, attempts FROM outbox
     WHERE state = 'leased' AND leased_until < ? AND attempts + 1 >= ?`,
    iso(nowMs),
    CEILING,
  )) {
    /* `attempts + 1` because the reclaim below is what would record THIS expiry, and the ladder ends
       at eight recorded failures however they were recorded — eight acks, eight abandoned leases, or
       any mixture. A job handed out a ninth time is a ninth delivery attempt of something that has
       already been given eight. */
    /* The expiry is recorded on the row as well as in the item, or the two disagree about how many
       attempts were made and the row reads as though it died one short. */
    sql.exec("UPDATE outbox SET state = 'dead', leased_until = NULL, attempts = attempts + 1 WHERE id = ?", row.id);
    deadLetter(sql, deps, {
      id: row.id,
      kind: row.kind,
      payload: row.payload,
      attempts: row.attempts + 1,
      error: 'the lease expired without an ack, eight times',
    });
  }

  const rows = sql.all<{ id: string; kind: OutboxKind; payload: string; attempts: number; leased_until: string }>(
    `UPDATE outbox SET state = 'leased',
       /* A RECLAIM IS AN ATTEMPT. A lease that expired means somebody was handed this job and never
          said what happened to it, which is a failure — and counting it is the only thing that makes
          the ceiling reachable on that path. A first claim is not. */
       attempts = attempts + (CASE WHEN state = 'leased' THEN 1 ELSE 0 END),
       leased_until = CASE
         WHEN kind LIKE 'notify.%' THEN ?
         WHEN kind LIKE 'infer.%' THEN ?
         ELSE ? END
     WHERE id IN (
       SELECT id FROM outbox
       WHERE kind IN (${marks})
         AND (state = 'pending' OR (state = 'leased' AND leased_until < ? AND attempts + 1 < ${CEILING}))
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

/** Eight attempts, and the eighth is visible. One number, read by both ladders. */
export const CEILING = 8;

/**
 * The longest any one rung waits: six hours. The backoff's bound, and the furthest a provider's
 * `Retry-After` may push a connector's retry, whatever instant it names.
 */
const RUNG_CAP_MS = 6 * 3_600_000;

/**
 * The backoff both ladders use: doubling minutes, capped at six hours.
 *
 * THE CAP IS A BOUND AND NOT A RUNG. At the ceiling of eight, `attempts` reaches 7 and the longest
 * wait is 128 minutes — the ladder spans about four hours, and six hours is never reached. That is
 * deliberate rather than dead: the bound is what keeps the wait finite if the ceiling ever rises,
 * and moving the doubling to reach it would change every wait a person has already learned.
 */
export const backoffMs = (attempts: number): number => Math.min(2 ** attempts * 60_000, RUNG_CAP_MS);

/**
 * Hand a leased row back, unrun, for the next invocation to take.
 *
 * NOT AN ACK, because nothing happened: no attempt was made, so the retry ladder must not move and
 * the attempt count must not go up. This is the row going back on the shelf.
 *
 * FENCED ON THE LEASE, for the reason `Ack` spells out below. A pass that ran long, lost its lease
 * to another host and then released what it thought it held would unclaim a row that host is in
 * the middle of running, and two hosts would fetch one window from one provider.
 *
 * A QUESTION NO RUN IS WAITING ON IS FINISHED INSTEAD, with its attempt count as it was. `release()` deletes a pending
 * Slash job only at the moment its run ends, so one handed back to `pending` after that was a job nothing would ever
 * delete, and the next lease posted it: one more question asked for a run already `cancelled` (measured).
 * A call a `call` step made is finished the same way, since `release()` deletes it only as its run ends too.
 */
export function unlease(sql: Sql, args: { id: string; leasedUntil: string }): void {
  const row = sql.one<{ kind: string; payload: string }>(
    "SELECT kind, payload FROM outbox WHERE id = ? AND state = 'leased' AND leased_until = ?",
    args.id,
    args.leasedUntil,
  );
  if (row && (row.kind === 'infer.ask' || (row.kind === 'pull.fetch' && runOf(row.payload) !== null)) && !awaited(sql, args.id, row.payload)) {
    finishUnawaited(sql, args.id, 0);
    return;
  }
  sql.exec(
    "UPDATE outbox SET state = 'pending', leased_until = NULL WHERE id = ? AND state = 'leased' AND leased_until = ?",
    args.id,
    args.leasedUntil,
  );
}

export type Ack = {
  id: string;
  state: 'done' | 'failed';
  error?: string | undefined;
  /**
   * The lease this ack is answering, as `lease()` handed it back.
   *
   * WITHOUT IT AN ACK HAS NO FENCE, and a stale one completes somebody else's lease. A slow endpoint
   * outlives its sixty seconds, another worker reclaims the job and starts delivering, the first
   * worker's request finally fails and acks `failed` — the row IS leased, so it lands: attempts go
   * up and a retry is armed. The second worker's `done` is then refused and thrown away, and the
   * retry re-sends a job that already succeeded, up to eight times. The refusal this method returns
   * says "somebody else has it", describing a check the code did not make.
   *
   * OPTIONAL, because a deliverer that does not pass one is answering the old contract and should
   * keep working — but every deliverer in this repository passes it.
   */
  leasedUntil?: string | undefined;
  /**
   * What the job produced, for the kinds that produce something.
   *
   * THE LOOP HAD NO WAY BACK IN. `analyse` queues an `infer.draft` — the one proposal a crossed
   * threshold earns — and the ack marked the row `done` and returned, so whatever the model drafted
   * reached nobody. Every governor, every threshold and the whole brake existed to decide WHETHER to
   * ask a question, and the question could not be asked. 45 §13 puts the result on the ack, and 45
   * §14 says the write-back happens in the ack's transaction, which is what makes "delivered" and
   * "recorded" the same event rather than two that can disagree.
   */
  result?: unknown;
};

/** What the deliverer needs from the record to finish the job, beyond SQL. */
export type AckDeps = {
  mint: () => string;
  /** The next integer for a counter, inside the transaction. `SG41` is `allocate('suggestion')`. */
  allocate: (name: string) => number;
  nowMs: number;
  /**
   * This record's id, for the retry ladder's jitter. Absent is `self`, which is what a host with no
   * identity row yet is called everywhere else in the kernel.
   */
  recordId?: string | undefined;
  /**
   * File a suggestion, for the ack of a job that drafted one.
   *
   * INJECTED, because the gate is `govern.ts`'s and this file is the queue. A draft that wrote its
   * own suggestion row would be a second `propose` with its own idea of what a body must contain,
   * and the whole point of the gate is that there is one.
   */
  propose?: (p: { question: string; body_kind: string; body: Record<string, unknown> }, actor: string) => Result<{ id: string }>;
  /**
   * Send an assembled digest onto its channels, for the ack of the model call that held it.
   *
   * INJECTED FOR THE SAME REASON `propose` IS. Step d belongs to `digest.ts` — it knows what a
   * channel is — and this file is the queue. A queue that grew its own copy of the channel loop is
   * how one path acquires a channel the other has never heard of.
   */
  sendDigest?: (assembled: unknown, prose: string) => void;
  /**
   * Hand an automation the answer to the question it asked Slash, or the reason there is none.
   *
   * INJECTED FOR THE SAME REASON AGAIN. Where the answer goes, and what shape it must have to go there, is the run's
   * business (`flow.ts`'s `answerStep`), and this file only knows that a job came back.
   */
  answerRun?: (a: { run: string; step: number; by: string; answer?: string; failed?: string }) => void;
  /**
   * The one notification path, urgent, for the ack of a connector run whose key was refused.
   *
   * INJECTED FOR THE SAME REASON AGAIN: routing a notice is `digest.ts`'s. A host that wired none still
   * pauses the connector, and the pause is kept as a `note` event (`finishPull`).
   */
  notify?: ((said: { actor: string; say: string; because?: string }) => void) | undefined;
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
  const row = sql.one<{ kind: string; payload: string; attempts: number; leased_until: string | null }>(
    "SELECT kind, payload, attempts, leased_until FROM outbox WHERE id = ? AND state = 'leased'",
    args.id,
  );

  /* THE FENCE. An ack that names a lease which is no longer the current one is answering for a job
     somebody else now holds, and applying it is how one delivery becomes eight. */
  if (row && args.leasedUntil !== undefined && row.leased_until !== args.leasedUntil)
    return no<null>(
      'OUT_OF_BOUNDS',
      `Job ${args.id} was leased again while you had it, so this answer is about a lease that is over.`,
      { at: 'leasedUntil' },
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

  /* A HOST THAT CANNOT FINISH WHAT IT STARTED SAYS SO, BEFORE ANYTHING IS WRITTEN. An `infer.prose`
     row is not a notification, it is a digest waiting behind a model — so an ack with no way to send
     it would mark the row `done` and drop the digest silently, which is the exact bug this branch
     exists to fix, restored by a wiring mistake. Refusing leaves the row leased, and the lease
     expires into a retry.

     BEFORE THE WRITE, because a refusal returned from inside a transaction COMMITS: nothing throws,
     so there is nothing to roll back. */
  /* `NOT_IN_THIS_BUILD`, WHICH IS WHAT `NOT_IMPLEMENTED` WAS TRYING TO SAY AND COULD NOT. The job is
     legal, the row is legal, and the deployment holding it wired no sender — `49 §5.12` note 1's
     whole argument is that a host serves the kinds it declares and leaves the rest in `pending`, so
     "this deployment does not do that" is a first-class answer here rather than a gap. It is the
     same fact `metrics.ts` and `pages.ts` refuse with the same code for a published shape this build
     does not compute, and one fact takes one code (`30 §6`). */
  if (row.kind === 'infer.prose' && !deps.sendDigest)
    return no<null>(
      'NOT_IN_THIS_BUILD',
      `Job ${args.id} is a digest waiting on two sentences, and this host wired no way to send it.`,
      { at: 'kind' },
    );

  /* THE SAME FOR A QUESTION A RUN IS WAITING ON. Marked done with nowhere to put the answer, the run would wait out its
     day and fail as though Slash had never answered. */
  if (row.kind === 'infer.ask' && !deps.answerRun)
    return no<null>('NOT_IN_THIS_BUILD', `Job ${args.id} is an automation waiting on Slash's answer, and this host wired no way to hand it back.`, {
      at: 'kind',
    });

  /* A PAGED CONNECTOR'S RUN FINISHES HERE, in the ack's transaction and on either side of the ladder: the cursor, the
     next due instant, the pause and a rotated key are what the runner carried back, and until `finishPull` existed this
     ack marked the job finished and dropped all four (`pull.ts`). BEHIND THE FENCE, so a stale lease writes none of
     them. An ack with no finish on it is the older contract (`release`, `prepareAction`'s drops) and writes nothing
     here. What `failed` needs from it, the provider's `Retry-After`, is read below where the retry is armed. */
  const pulled: PullFinished | null = row.kind === 'pull.fetch' ? pullFinishOf(args.result) : null;
  if (pulled !== null)
    finishPull({ sql, mint: deps.mint, nowMs: deps.nowMs, notify: deps.notify, keyOf: (name) => keyNamed(sql, name) }, { payload: row.payload }, pulled);

  if (args.state === 'done') {
    sql.exec("UPDATE outbox SET state = 'done', leased_until = NULL WHERE id = ?", args.id);

    /* AN ANSWER TO AN AUTOMATION GOES BACK TO ITS RUN, in this transaction, which is the `infer.draft` branch's shape
       below with a run where that has the gate. A reply with no text is still a reply: the run is told there was no
       answer and stops with that sentence, rather than the job walking a ladder that would ask the same model again.

       `result.failed` FIRST, AS THE RUN'S OWN SENTENCE. It is how the host's pass acks a refusal that no retry mends, a
       month's asks spent or a job with no rule to ask in the name of (`slash-answers.ts`), and this branch read `text` alone: put
       through the real kernel, a spent month ended the run on "Slash answered job ... with no text", and the sentence
       that says what to do was thrown away. */
    if (row.kind === 'infer.ask') {
      const asked = JSON.parse(row.payload) as { run?: unknown; step?: unknown };
      const said = args.result as { text?: unknown; failed?: unknown } | undefined;
      if (typeof asked.run === 'string' && typeof asked.step === 'number')
        deps.answerRun?.(
          typeof said?.failed === 'string' && said.failed.trim() !== ''
            ? { run: asked.run, step: asked.step, by: args.id, failed: said.failed }
            : typeof said?.text === 'string'
              ? { run: asked.run, step: asked.step, by: args.id, answer: said.text }
              : { run: asked.run, step: asked.step, by: args.id, failed: `Slash answered job ${args.id} with no text, so the run stopped at step ${asked.step + 1}.` },
        );
      return ok(null);
    }

    /* A CALL A RUN WAITS ON HANDS THE RUN ITS ANSWER, in this transaction, as a question to Slash does above. The job
       carries the run and the step (`queueCall`), and `finishAction` puts the provider's answer on the ack, or the
       sentence the call stopped on: a held month, a refused key, a declaration gone. Where the run is no longer waiting
       on this job, `answerStep` changes nothing, so a call whose rule was switched off while it was out is answered
       into nothing. A job with no run on it is a call no step waits on, and this passes it by. */
    const waits = row.kind === 'pull.fetch' ? runOf(row.payload) : null;
    if (waits !== null && deps.answerRun) {
      const said = args.result as { answer?: unknown; failed?: unknown } | undefined;
      deps.answerRun(
        typeof said?.failed === 'string' && said.failed.trim() !== ''
          ? { ...waits, by: args.id, failed: said.failed }
          : typeof said?.answer === 'string'
            ? { ...waits, by: args.id, answer: said.answer }
            : { ...waits, by: args.id, failed: `The call the run made at step ${waits.step + 1} came back with no answer, so the run stopped there.` },
      );
      return ok(null);
    }

    /* AND THE RESULT GOES BACK IN, in this transaction. `infer.draft` is the analyser's one output:
       the model drafted a question and a body, and until now the ack marked the row done and threw
       the answer away — so the entire observe loop, every governor and the brake, existed to decide
       whether to ask something that could never be asked.

       A DRAFT THAT WILL NOT FILE IS NOT A DELIVERY FAILURE. The gate refuses a malformed body, and
       that is a fact about the draft rather than about the queue: the job is done, the refusal is
       returned, and the caller sees why rather than watching a retry ladder for something a retry
       cannot fix. */
    if (row.kind === 'infer.draft' && args.result !== undefined && deps.propose) {
      const drafted = args.result as { question?: unknown; body_kind?: unknown; body?: unknown };
      if (typeof drafted?.question !== 'string' || typeof drafted?.body_kind !== 'string')
        return no<null>('VALUE_MALFORMED', `Job ${args.id} came back without a question and a body kind, so there is nothing to file.`, {
          at: 'result',
        });
      const filed = deps.propose(
        { question: drafted.question, body_kind: drafted.body_kind, body: (drafted.body ?? {}) as Record<string, unknown> },
        'slash',
      );
      if (!filed.ok) return filed as Result<null>;
    }

    /* AN EMBEDDING'S VECTORS GO INTO `entry_vec`, in this transaction, so the job is `done` exactly when the index holds
       them. A result that will not write is a fact about the answer, as a draft that will not file is: done, and the
       refusal returned. The rows still have no vector as new as their words, so the next sweep queues them again. An ack with
       no result, from a host that could not embed, writes nothing and leaves them to that sweep too. */
    if (row.kind === 'infer.embed' && args.result !== undefined) {
      const wrote = writeEmbeddings(sql, args.id, row.payload, args.result);
      if (!wrote.ok) return wrote;
    }

    /* AND THE DIGEST THAT WAS WAITING FOR IT GOES OUT. `prose: slash` stops `runDigest` after one
       `infer.prose` row, because a model that takes a minute must not be a minute the alarm is
       holding — and this branch, the half that starts it again, was never written. Every digest
       declaring `prose: slash` queued a row nothing consumed and sent nothing on any channel, ever,
       with no error to say so. The feature was one missing `if` from existing.

       THE PROSE IS OPTIONAL AND THE DIGEST IS NOT. A result the host could not produce, or one that
       came back without a usable sentence, ships the figures on their own — 46 §5: "the digest ships
       as figures only". Two sentences are worth having and never worth losing a digest over. */
    if (row.kind === 'infer.prose') {
      const said = args.result as { text?: unknown; prose?: unknown } | undefined;
      /* BOTH KEYS. 45 §5.10 calls it `text` and 46 §5 calls it `prose`, and which one is on the wire
         is a fact about the host rather than about this record. */
      const raw = typeof said?.text === 'string' ? said.text : typeof said?.prose === 'string' ? said.prose : '';
      deps.sendDigest?.(JSON.parse(row.payload), raw);
    }
    return ok(null);
  }

  /* A QUESTION WHOSE RUN IS NO LONGER WAITING ON IT IS FINISHED HERE, AND NOT RETRIED. `release()` in `flow.ts` takes a
     run's Slash job out of the outbox when the run ends, but only while nobody holds it: a job a host had leased is
     left to this ack. The failed branch read the job and never the run, so a rule retired, switched off or its pack
     turned off while its question was out armed a `retry` like any other, and a probe on the Worker walked all eight
     rungs on the owner's key, eight posts and eight `grant.read` events for a run already `cancelled`, and a rung that
     was answered was billed and counted. `done` and not deleted, because a host did try it.

     THE RUN AND THE STEP ROW BOTH, the pair `answerStep` holds an answer to. `release()` leaves the step row `waiting`
     after it cancels the run, so the step row alone passed a cancelled run's job straight through; and a run still
     waiting whose step names another job is not waiting on this one. `lease()` and `unlease()` read the same pair
     through `awaited`, since a host that never acks and one that hands the job back reach the same run. */
  /* AND A CALL A RUN MADE, FOR THE SAME REASON: a run that stopped while its call was out is answered by nothing, so a
     retry would be one more post on the owner's key for a run already over. A call no step made carries no run, and walks
     the ladder as it always has. */
  if ((row.kind === 'infer.ask' || (row.kind === 'pull.fetch' && runOf(row.payload) !== null)) && !awaited(sql, args.id, row.payload)) {
    finishUnawaited(sql, args.id, 1);
    return ok(null);
  }

  const after = sql.one<{ attempts: number }>(
    "UPDATE outbox SET state = 'failed', leased_until = NULL, attempts = attempts + 1 WHERE id = ? RETURNING attempts",
    args.id,
  );
  const attempts = Number(after?.attempts ?? row.attempts + 1);
  const error = args.error ?? 'no reason given';

  if (attempts < CEILING) {
    /* THE RETRY IS A SCHEDULE ROW, not a flag on this one. `UNIQUE (kind, key)` makes it idempotent:
       two failures of the same job cannot arm two retries, and the key says what it is about.

       AND ITS `attempts` IS ITS OWN, WHICH IS ZERO. This wrote the OUTBOX's attempt count into the
       SCHEDULE row's failure counter — two different quantities in one column, and nothing ever read
       it back. A job failing its seventh delivery armed a retry row that `drainSchedule` already
       considered to be on its seventh rung, so the first transient error inside `retryHandler` — a
       storage blip, one lock — made it eight, and eight is the ceiling: the row went `failed`
       immediately, a suggestion opened saying a retry “could not run after 8 attempts” when it had
       run once, and the outbox row stayed `failed` for ever. Not `dead`, so no dead letter and no
       question; not `pending`, so nothing could ever lease it again. The notification was gone, and
       the only trace was a sentence about the wrong subject.

       THE OUTBOX'S COUNT GOES IN THE PAYLOAD, where it is what it always was: something to read,
       and not something the ladder walks on. */

    /* AND THE RUNG IS SPREAD, because `backoffMs` alone is the same number for every job in the
       record. A provider that goes down fails every action pointed at it inside the same drain, each
       one arms its retry at exactly `now + 2^attempts` minutes, and they all come back together: the
       same herd, the same instant, eight times over, against a host that is already struggling. The
       jitter is the one the interval re-arm already uses, so the offset is arithmetic over the
       record, the pack and the action rather than a random number, and a gap somebody asks about is
       a gap with a reason. It is stable for one row, so a rung is not re-rolled by a retry of the
       same job; the outbox id stands in for the action here, because that is the identity the queue
       holds and it is what differs between two jobs failing at the same moment. */
    const wait = backoffMs(attempts);
    const spread = actionJitterMs(deps.recordId ?? 'self', row.kind, args.id, wait);
    /* AND NO SOONER THAN THE PROVIDER SAID. A connector answered 429 with `Retry-After` carries that instant back, and
       a rung that came round first would be one more request the provider has already said it will refuse. The later
       of the two wins, and the provider's is held to the ladder's own six-hour bound, because an instant a stranger's
       server chose is not one this record waits on for a week. */
    const ladder = deps.nowMs + wait + spread;
    const asked = pulled?.notBefore ?? null;
    const due = asked === null ? ladder : Math.max(ladder, Math.min(asked, deps.nowMs + RUNG_CAP_MS));
    sql.exec(
      `INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts)
       VALUES (?, ?, 'retry', ?, ?, 'pending', 0)
       ON CONFLICT (kind, key) DO UPDATE SET due_at = excluded.due_at, payload = excluded.payload, state = 'pending', attempts = 0`,
      deps.mint(),
      iso(due),
      `outbox:${args.id}`,
      JSON.stringify({ outbox: args.id, attempt: attempts }),
    );
    return ok(null);
  }

  /* AT THE CEILING, A DIGEST STILL GOES — as figures, which is 46 §5's own fallback for a prose
     call that came back unusable. This used to happen on the FIRST failure, which conflated two
     different events: a model that answered and said nothing usable, and a request that never
     reached one. `pump` acks `failed` for a twenty-second timeout, a 502 or a DNS blip, and nothing
     bills twice for a call that never happened — so the ladder is right for those, and the ladder
     ending is the right moment to stop waiting.

     `done` AND NOT `dead`, because the work this row existed for was done at that point: the digest
     left. A dead letter would ask somebody to decide about an ornament. */
  if (row.kind === 'infer.prose') {
    sql.exec("UPDATE outbox SET state = 'done' WHERE id = ?", args.id);
    deps.sendDigest?.(JSON.parse(row.payload), '');
    return ok(null);
  }

  sql.exec("UPDATE outbox SET state = 'dead' WHERE id = ?", args.id);
  deadLetter(sql, deps, { id: args.id, kind: row.kind, payload: row.payload, attempts, error });
  return ok(null);
}

/**
 * Whether an `infer.ask` job is still the one its run waits on: the run `waiting` at the payload's step, and that step's
 * row holding this job's id, which is the pair `answerStep` in `flow.ts` holds an answer to. A payload without a run
 * and a step answers nothing, and reads as not awaited.
 *
 * THE STEP ROW'S OWN STATE IS NOT READ, BECAUSE THE RUN'S ALREADY SAYS IT. An earlier query also asked for
 * `s.state = 'waiting'`, and taking it out failed none of the kernel's 1476 tests. Nothing reachable needs it:
 * `advance` parks a run `waiting` at step i only straight after writing step i's row `waiting`, and every write that
 * moves that row on moves the run too, either to `pending` at i + 1 (`answerStep`), or to `failed` first (`finish`),
 * or with the run already `running`, as `advance` marks it before it takes any step. A plan's jumps only go forward,
 * so no run comes back to a step whose row is already finished, and a finished ask's row holds its answer, never the
 * job's id. A test of that clause would have to write a step row no code writes.
 */
function awaited(sql: Sql, id: string, payload: string): boolean {
  const asked = runOf(payload);
  if (asked === null) return false;
  return (
    sql.one<{ n: number }>(
      `SELECT 1 AS n FROM automation_run r JOIN automation_step s ON s.run = r.id AND s.n = r.step
       WHERE r.id = ? AND r.state = 'waiting' AND r.step = ? AND s.answer = ?`,
      asked.run,
      asked.step,
      id,
    ) !== undefined
  );
}

/**
 * The run and the step a job was queued for, or `null` for a job no run waits on: an `infer.ask` always names both, and
 * a `pull.fetch` names them only when a `call` step queued it (`actions.ts`'s `queueCall`). A payload that is not JSON
 * names neither.
 */
function runOf(payload: string): { run: string; step: number } | null {
  let said: { run?: unknown; step?: unknown };
  try {
    said = JSON.parse(payload) as typeof said;
  } catch {
    return null;
  }
  return said !== null && typeof said === 'object' && typeof said.run === 'string' && typeof said.step === 'number' ? { run: said.run, step: said.step } : null;
}

/**
 * Finish a question nobody is waiting on: `done`, with no `retry`. `tried` is 1 where a host was handed the job and 0
 * where it handed the job back unrun. `done` and not deleted, because the row is the trace of what was asked.
 */
function finishUnawaited(sql: Sql, id: string, tried: 0 | 1): void {
  sql.exec("UPDATE outbox SET state = 'done', leased_until = NULL, attempts = attempts + ? WHERE id = ?", tried, id);
  sql.exec("DELETE FROM schedule WHERE kind = 'retry' AND key = ?", `outbox:${id}`);
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
  /* A QUESTION AN AUTOMATION ASKED ENDS ITS RUN INSTEAD. "Retry it, or change what produces it" has nothing to retry:
     the run it would answer has stopped waiting by the time a person reads it, so the run fails here with the error as
     its sentence, and the run is the item the owner sees. Both ends of the ladder come through here, an eighth failed
     ack and an eighth abandoned lease. A call a `call` step made ends its run the same way. */
  const asked = job.kind === 'infer.ask' || job.kind === 'pull.fetch' ? runOf(job.payload) : null;
  if (asked !== null && deps.answerRun) {
    const who = job.kind === 'infer.ask' ? 'Slash' : 'The call';
    deps.answerRun({
      ...asked,
      by: job.id,
      failed: `${who} could not be reached after ${job.attempts} attempts (${job.error}), so the run stopped at step ${asked.step + 1}.`,
    });
    return;
  }
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
 *
 * AND `row`, the fields a rule-fired call carries to its host. They are the record's own data, sent only where the
 * owner approved, and a dead-letter item is not that place.
 */
export function summary(payload: string): Record<string, string> {
  const withheld = new Set(['texts', 'text', 'html', 'body', 'ciphertext', 'token', 'secret', 'vectors', 'password', 'row']);
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
