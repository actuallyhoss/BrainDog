/**
 * The pass that answers an automation's question to Slash: lease the `infer.ask` jobs, ask `answer` for each, ack each
 * with what came back, then tail the scheduler once. `loop/research-infer-ask.md` §4 and §6 Brief C.
 *
 * THE RECORD IS THE QUEUE AND THE JUDGE, AND THIS IS ONLY THE PASS. `flow.ts` `ask()` queued the question, `answerStep`
 * holds the text to the shape the rule asked for, and `outbox.ts` `ack` walks the ladder and ends the run with a sentence
 * at its eighth rung. Nothing here decides a shape, keeps a count or retries: it chooses which of three acks to send, and
 * that choice is the whole file.
 *
 * NEITHER PUMP COULD CARRY THIS JOB, which is why it is a pass of its own. Both hand a job to a `Deliver` that returns
 * `void` and ack `done` with no `result` (`apps/worker/src/pump.ts`, `apps/selfhost/src/server.ts`), so an `infer.ask` on
 * either list would be acked with no text and every run would end on *"Slash answered job … with no text"*. The Worker
 * calls this in `alarm()` after `#act`, inside the object that holds the vault, and sets the next alarm for now when a pass
 * leased its full `n`, since nothing rings for the rest; the self-host calls it in `poll`, after `act()` and not inside it,
 * because `act()` returns on its first line where no actions runner is configured (Briefs E and D).
 *
 * STRUCTURAL, AND IT IMPORTS NEITHER `@braindog/slash` NOR AN APP. `answer` is handed in as a function, so the package's
 * `answer` method, the key opened in the rule's name and the tier all stay the app's to build; `31 §2` puts the package at
 * row 13 and `46 §5.1` has only the app `import()` it, which is the rule `slash.ts` states at its own header.
 *
 * AND THE SHAPE OF WHAT ANSWERS THE RECORD'S OTHER MODEL JOBS, `infer.draft` and `infer.prose`, sits at the foot of this
 * file for the same reason (`ModelJobInference`): the pass that leases them is `model-jobs.ts`'s, and Slash is handed in.
 */

import type { Kernel, OutboxRow } from '@braindog/kernel';
import { codeOf, fixOf, type Result, type Scheduler } from '@braindog/ports';

/**
 * One question, as `flow.ts` `ask()` queues it and `@braindog/slash`'s `answer` takes it.
 *
 * `step` IS THE KERNEL'S, COUNTED FROM 0, and every sentence a person reads says `step + 1`, as `flow.ts` does. `rule` is
 * Brief A's addition to the payload: Slash's ledger row is written as `rule.<id> step <n>` and the key is opened as
 * `rule:<id>`, so a job without it cannot be answered in anybody's name.
 */
export type SlashAsk = {
  run: string;
  step: number;
  rule: string;
  question: string;
  shape: 'text' | 'number' | 'choice';
  choices?: readonly string[] | undefined;
  about?: Readonly<Record<string, unknown>> | undefined;
};

/** What answers one job: `@braindog/slash`'s `answer`, with the inference for this rule already chosen by the app. */
export type SlashAnswer = (job: SlashAsk) => Promise<Result<{ text: string }>>;

/** The three kernel methods this pass calls, and not the kernel. */
export type SlashAsksKernel = Pick<Kernel, 'leaseOutbox' | 'ackOutbox' | 'tail'>;

/**
 * What one pass did. `answered`, `refused` and `failed` count acks that landed; `unacked` counts acks that threw or that
 * the kernel refused, whose leases expire into a retry, which is what a lease is for.
 */
export type SlashAsksServed = { answered: number; failed: number; refused: number; unacked: number };

/**
 * The one refusal a retry can change.
 *
 * `UNREACHABLE` SAYS THE MODEL WAS NOT REACHED, AND EVERY OTHER REFUSAL IS SLASH DECIDING. The brief names three that end
 * the run (`SLASH_BUDGET_SPENT`, `PROPOSAL_SCHEMA`, `FORBIDDEN`), and this is the same rule stated from the other side, so
 * a refusal the package adds later ends the run with its own sentence rather than walking eight rungs. A cap that is
 * spent is spent for the month, and asking it seven more times would be seven more hold rows on the owner's allowance.
 *
 * AND A RETRY OF `UNREACHABLE` SPENDS NOTHING. The package settles that row under `-`, which no count reads
 * (`packages/slash/src/answer.ts`, `test/slash-answers-unreachable.test.ts`). Settled under the model's name, each rung
 * was an ask: `loop/research-batch-forty-two-audit.md` finding 6 put a fifteen-minute clock rule through a two-hour
 * outage at about forty asks that reached nothing, half the default cap of 80, by the ladder's arithmetic and not by a run.
 */
const RETRIED: ReadonlySet<string> = new Set(['UNREACHABLE']);

const SHAPES: readonly string[] = ['text', 'number', 'choice'];

/** The ack for one job, without its id and lease, and the counter it lands in. */
type Settled =
  | { ack: { state: 'done'; result: { text: string } }; counts: 'answered' }
  | { ack: { state: 'done'; result: { failed: string } }; counts: 'refused' }
  | { ack: { state: 'failed'; error: string }; counts: 'failed' };

/**
 * The job's payload as a question, or the step it was at when it cannot be read.
 *
 * EVERY FIELD IS CHECKED, AND ONLY THE KNOWN ONES ARE PASSED ON. The payload is the kernel's own JSON, but a row queued by
 * a build before Brief A has no `rule`, and a model call built from a half-read job would bill the owner for a question
 * whose answer nothing could file.
 */
function askOf(payload: string): SlashAsk | { unread: true; step: number | undefined } {
  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    return { unread: true, step: undefined };
  }
  const p = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const step = typeof p.step === 'number' && Number.isInteger(p.step) && p.step >= 0 ? p.step : undefined;
  const choices = p.choices;
  const about = p.about;
  if (
    step === undefined ||
    typeof p.run !== 'string' ||
    typeof p.rule !== 'string' ||
    p.rule === '' ||
    typeof p.question !== 'string' ||
    typeof p.shape !== 'string' ||
    !SHAPES.includes(p.shape) ||
    (choices !== undefined && !(Array.isArray(choices) && choices.every((c) => typeof c === 'string'))) ||
    (about !== undefined && (typeof about !== 'object' || about === null || Array.isArray(about)))
  )
    return { unread: true, step };
  return {
    run: p.run,
    step,
    rule: p.rule,
    question: p.question,
    shape: p.shape as SlashAsk['shape'],
    ...(choices === undefined ? {} : { choices: choices as readonly string[] }),
    ...(about === undefined ? {} : { about: about as Readonly<Record<string, unknown>> }),
  };
}

/** THE MESSAGE AND NEVER THE PAYLOAD, `pump.ts`'s rule: a question carries a row's values, and an error line goes to logs. */
const said = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const warn = (line: string): void => console.error(line);

/** What one job comes to, with every throw inside `answer` caught here so it is a `failed` ack and not a lost batch. */
async function settle(job: OutboxRow, answer: SlashAnswer): Promise<Settled> {
  const ask = askOf(job.payload);
  if ('unread' in ask) {
    const at = ask.step === undefined ? '' : ` at step ${ask.step + 1}`;
    return { ack: { state: 'done', result: { failed: `The question${at} was queued without what Slash needs to answer it, so the run stopped there.` } }, counts: 'refused' };
  }
  let out: Result<{ text: string }>;
  try {
    out = await answer(ask);
  } catch (e) {
    return { ack: { state: 'failed', error: said(e) }, counts: 'failed' };
  }
  if (out.ok) return { ack: { state: 'done', result: { text: out.value.text } }, counts: 'answered' };
  /* `fixOf` AND NOT `.refusal.fix`, because a `Result` has a conflict arm too, and a sentence read off the wrong arm is
     `undefined` on the run a person reads. */
  if (RETRIED.has(codeOf(out))) return { ack: { state: 'failed', error: fixOf(out) }, counts: 'failed' };
  return { ack: { state: 'done', result: { failed: fixOf(out) } }, counts: 'refused' };
}

/**
 * One pass over this record's questions to Slash.
 *
 * THE JOBS ARE ASKED TOGETHER AND NOT IN TURN, because in turn does not fit inside the lease. `INFER_LEASE_MS` is 120
 * seconds (`packages/kernel/src/outbox.ts`) and a Slash call may take `SLASH_TIMEOUT_MS`, 30 seconds (`slash.ts`), so the
 * fifth of five asked in turn is acked up to 150 seconds after it was leased, when another pass may hold it and the fence
 * refuses the answer. Together is safe for the cap: the package writes its hold row before its first `await` and the
 * guard counts before calling through, so ten asks at `ask_cap: 2` make two model calls (`packages/slash/test/cap-concurrent.test.ts`).
 *
 * EACH JOB IS ACKED AS IT SETTLES, so a quick answer is not held behind a slow one's thirty seconds.
 *
 * AN ACK THAT WILL NOT LAND IS NOT A REASON TO ABANDON THE REST, `pump.ts`'s rule and for its reason: the lease expires
 * and the job is reclaimed. A refused ack is counted the same way, because the kernel refuses one only when the lease is
 * over or the job is gone, and either way this pass no longer holds it.
 *
 * THE TAIL IS ONCE, AND ONLY AFTER AN ACK LANDED. `answerStep` arms the woken run's wake for now and a `failed` ack arms a
 * `retry` row, and neither reaches the alarm until the scheduler is tailed, which the self-host's `poll` already does for
 * the retry rows. A pass that leased nothing changed nothing, and a tail then is a storage read for no reason on every alarm.
 */
export async function serveAsks(
  kernel: SlashAsksKernel,
  answer: SlashAnswer,
  scheduler: Scheduler,
  n = 5,
  log: (line: string) => void = warn,
): Promise<SlashAsksServed> {
  const out: SlashAsksServed = { answered: 0, failed: 0, refused: 0, unacked: 0 };
  const jobs = kernel.leaseOutbox(['infer.ask'], n);

  await Promise.all(
    jobs.map(async (job) => {
      const settled = await settle(job, answer);
      try {
        const acked = kernel.ackOutbox({ id: job.id, ...settled.ack, leasedUntil: job.leasedUntil });
        if (acked.ok) out[settled.counts]++;
        else {
          out.unacked++;
          log(`ack ${job.id}: ${fixOf(acked)}`);
        }
      } catch (e) {
        out.unacked++;
        log(`ack ${job.id}: ${said(e)}`);
      }
    }),
  );

  if (out.answered + out.failed + out.refused > 0) await kernel.tail(scheduler);
  return out;
}

/* ── the record's model jobs: a pattern's draft and a digest's two sentences (`loop/finish/contracts.md` X8) ────────── */

/**
 * One arrival a pattern is drafted from: `@braindog/slash`'s `RawPayload`, restated because this package never imports
 * that one (the header's rule). The pass reads it off the kernel's inbox, by the ids an `infer.draft` job names.
 */
export type DraftSample = {
  id: string;
  channel: 'email' | 'webhook' | 'pull' | 'paste' | 'api';
  ts: string;
  from: string | null;
  subject: string | null;
  body: string;
};

/**
 * A pattern drafted and not filed, in the shape the kernel's `ack` reads an `infer.draft` job's `result` in
 * (`{ question, body_kind, body }`, `packages/kernel/src/outbox.ts`), and files as `slash` in the ack's transaction.
 *
 * THE INGEST IS A DECLARATION, `{ id, kind: 'ingest', body }`, BECAUSE THAT IS WHAT AN ACCEPT INSTALLS: a bare body was
 * filed and then refused at every accept (`loop/finish/defects.md` A7).
 */
export type DraftedPattern = {
  question: string;
  body_kind: 'pattern';
  body: { ingest: { id: string; kind: 'ingest'; body: Record<string, unknown> }; samples: string[] };
};

/**
 * What answers the record's model jobs on a host: `serveModelJobs`'s `deps.inference` (`packages/host/src/model-jobs.ts`).
 *
 * `draft` IS A PATTERN FOR THE SAMPLES, AND IT FILES NOTHING. The pass acks the job with it, and the kernel files it
 * through its one gate; a draft that filed itself would be filed a second time by that ack.
 *
 * `prose` IS HANDED THE `infer.prose` PAYLOAD AS THE KERNEL QUEUED IT, parsed and unread (the assembled digest,
 * `packages/kernel/src/digest.ts`), and answers the `{ text }` the ack prefixes to it. `{ text: '' }` is an answer too:
 * the model said nothing usable, the digest goes as figures, and a retry would only bill the same call twice. A refusal
 * is a model not reached, which the pass acks as failed so the retry ladder asks again, and the kernel sends the figures
 * at the ladder's ceiling.
 *
 * STRUCTURAL, AS `SlashAnswer` IS: each host builds it over its own engine, the Worker in `apps/worker/src/slash-jobs.ts`.
 */
export type ModelJobInference = {
  draft(samples: readonly DraftSample[]): Promise<Result<DraftedPattern>>;
  prose(digest: unknown): Promise<Result<{ text: string }>>;
};
