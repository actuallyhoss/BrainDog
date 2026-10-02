/**
 * The pass that serves the record's model jobs on either host: lease the `infer.draft`, `infer.prose` and `infer.embed`
 * rows, answer each through the Slash engine the host hands in, and ack each in the shape `packages/kernel/src/outbox.ts`'s
 * `ack` reads.
 *
 * ONE PASS FOR BOTH HOSTS, AND THE RECORD STAYS THE JUDGE. The Worker calls this from `alarm()` as `#model`, after `#ask`,
 * and the self-host from `poll`, after its asks. The kernel files a draft through its one gate in the ack's transaction and
 * sends the digest the prose was waiting on; this file only chooses what each ack carries.
 *
 * WHAT A DRAFT BECOMES:
 *   - a draft with `examples` (the ingest's third unmatched arrival of one shape, `packages/kernel/src/ingest.ts`) reads
 *     those arrivals from the inbox and asks for a pattern, acked as `{ question, body_kind: 'pattern', body }`;
 *   - a draft with `signal: 'ingest.unmatched'` is the same, its samples found by the shape its `subject` names;
 *   - any other `signal` (`search.empty`, `write.refused`, `query.scan`, dormant) is acked with no model call as a
 *     two-way `options` question carrying the finding's own sentence, so every finding reaches Decide at no cost.
 * A digest's prose is acked as `{ text }`, and `''` sends the digest as figures. An embedding is acked as
 * `{ model, dims, vectors }`, one vector for each text the hourly sweep queued, which the kernel writes to `entry_vec`.
 *
 * METERED ON THE BACKGROUND ALLOWANCE, NEVER ON HIS ASKS. The daily look, an automation's question, a digest's prose and a
 * pattern's draft share `BACKGROUND_ASKS_MONTH` (60) a month, less the page headlines' own share (`HEADLINE_ASKS_MONTH`); his
 * 80 are his own (`packages/slash/src/types.ts`). The pass
 * asks the meter BEFORE it leases and leases no more jobs than the month has left, so a spent month leaves the jobs
 * `pending`, where they never walk the retry ladder to dead, and the next month serves them.
 *
 * STRUCTURAL, AS `slash-answers.ts` IS: it imports neither `@braindog/slash` nor an app. The engine is handed in as
 * `ModelJobInference`, which each host builds over its own Slash (`apps/worker/src/slash-jobs.ts`,
 * `apps/selfhost/src/slash.ts` `slashModelJobs`), so a host with no model never evaluates the package (`46 §5.1`).
 */

import { shapeOf, type Kernel, type OutboxRow } from '@braindog/kernel';
import { codeOf, fixOf, type Result, type Scheduler, type Sql } from '@braindog/ports';
import type { CallContext, RecordApi } from '@braindog/record';

import type { DraftSample, ModelJobInference } from './slash-answers.ts';
import { slashSamplesOf } from './slash.ts';

/** How many model jobs one pass leases. A pass that leased all five may have left more, and the host runs another. */
export const MODEL_JOBS_PER_PASS = 5;

/**
 * The model jobs a month's background allowance holds: `@braindog/slash`'s `BACKGROUND_ASKS_MONTH`, restated because this
 * package never imports that one (the header's rule). A host that has the package's number hands it to `backgroundMeter`.
 */
export const BACKGROUND_JOBS_MONTH = 60;

/**
 * The part of a month's background allowance kept for the daily look's page headlines, and the most they may spend: one
 * batched ask a night for thirty nights. The headline ask writes its row with `HEADLINE_ASK` as its question, which is how
 * both meters below tell it from a skill draft, a digest's prose, a pattern or an embedding.
 *
 * TWO SHARES, SO NEITHER KIND CAN EAT THE OTHER'S MONTH. Counted as one pool, a busy inbox's patterns and a week of
 * digests spent the 60 by the twentieth and every page fell back to its rules line for the rest of the month; and a
 * record whose figures move every day, with the look asked for on a request as well as at night, could spend the 60 on
 * headlines and leave the digests to go out as figures. So headlines may spend this much and no more, and everything else
 * may spend the rest of the allowance and never this. A 31st night whose figures moved keeps the rules line.
 */
export const HEADLINE_ASKS_MONTH = 30;

/** The question a headline ask's ledger row is written with, and what the meters count it by. */
export const HEADLINE_ASK = "Slash's page headlines";

/** How many arrivals of one shape a finding's pattern is drafted from, newest first and handed over oldest first. */
const SHAPE_SAMPLES_MOST = 5;

/** How far back through the inbox a shape's samples are looked for: five pages of 200, as `slashSamplesOf` walks. */
const SHAPE_PAGES = 5;

/** The record reading its own inbox for its own job: nobody asked, so nobody's reach decides, as `SLASH_CTX` is read. */
const RECORD_CTX: CallContext = { principal: { kind: 'system', id: 'slash' } };

/**
 * The refusals a retry can change: a model not reached, and a month spent under a cap the engine holds as well as this
 * pass's. Any other refusal is the engine deciding about the job itself, and asking again would bill the same call twice.
 */
const RETRIED: ReadonlySet<string> = new Set(['UNREACHABLE', 'SLASH_BUDGET_SPENT']);

/**
 * How much of a month's background allowance embeddings may never touch: half of it, kept for the digest prose and the
 * pattern drafts. A record that changes every hour would otherwise spend the month on its index by the tenth, and his
 * digests would go out as figures for the rest of it. A month with half left lets embeddings use the rest, a hundred
 * rows a call, so a large record's first index is built over a few months rather than all at once.
 */
const EMBED_KEPT_SHARE = 0.5;

/** A batch of embeddings as the pass acks it: `@braindog/ports`'s `Embeddings` less the usage the engine's ledger keeps. */
export type ModelJobEmbeddings = { model: string; dims: number; vectors: Int8Array[] };

/**
 * What a host's engine adds when it can embed: `embed`, over the same engine and ledger as `draft` and `prose`, so each
 * call is a `slash_call` row of kind `embed` and `backgroundMeter` counts it. ABSENT, `infer.embed` is never leased and
 * its one job waits `pending` for a host that has it, which the sweep reads before it queues another.
 */
export type ModelJobEmbed = { embed?: ((texts: readonly string[]) => Promise<Result<ModelJobEmbeddings>>) | undefined };

/** The three kernel methods this pass calls, and not the kernel. */
export type ModelJobsKernel = Pick<Kernel, 'leaseOutbox' | 'ackOutbox' | 'tail'>;

/** What the pass reads on the record: its kernel for the queue, and the inbox a draft's samples come from. */
export type ModelJobsApi = Pick<RecordApi, 'inbox'> & { kernel: ModelJobsKernel };

/**
 * The background allowance, as the pass asks it before it leases.
 *
 * A COUNT AND NOT A HOLD, because the pass leases no more jobs than `cap - spent` and each job is one model call at most,
 * so a pass cannot spend past the cap however its calls interleave. The engine writes each call's ledger row itself.
 */
export type ModelJobMeter = {
  /** The model jobs a month holds. */
  cap: number;
  /** The model jobs spent since `since`, the first instant of this month as an ISO string. */
  spent(since: string): number;
};

export type ModelJobsDeps = {
  /** What answers the jobs, or `undefined` where the host has no model: then nothing is leased and the jobs wait. */
  inference: (ModelJobInference & ModelJobEmbed) | undefined;
  meter: ModelJobMeter;
  now: () => number;
  /** The alarm, tailed once after an ack landed, so a `failed` ack's retry row is armed. Absent, the host tails it. */
  scheduler?: Scheduler | undefined;
  /** Where a line about the pass goes: a spent month, an ack that did not land. The message only, never a payload. */
  log?: ((line: string) => void) | undefined;
};

/** The ack for one job, without its id and lease. */
type Settled = { state: 'done'; result?: unknown } | { state: 'failed'; error: string };

/** The first instant of the month `add` months from `ms`, as the package's `call.ts` `monthOf` writes it, so the counts agree. */
const monthOf = (ms: number, add: number): string => {
  const at = new Date(ms);
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + add, 1)).toISOString();
};

/** THE MESSAGE AND NEVER THE PAYLOAD, `pump.ts`'s rule: a draft's samples are a stranger's text. */
const said = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const warn = (line: string): void => console.error(line);

/**
 * The background allowance counted in Slash's own ledger, the `slash_call` table the engine writes each call's row to.
 *
 * A DIGEST'S PROSE AND A DRAFT FOR THE RECORD ARE THE ROWS COUNTED. `digestProse` settles a `prose` row and `draftPattern`
 * a `pattern` row with nothing in `filed`, because the kernel files it in the ack (`packages/slash/src/jobs.ts`). A press
 * that filed its pattern carries the filed id and is his ask, not this; a press the checks refused has no id either and is
 * counted here too, which errs on the side a cap should. An `embed` row is one embedding job, a hundred rows in one call.
 * `-` is a model never reached, which costs nothing and is not counted.
 *
 * `share` SAYS WHICH OF THE TWO SHARES IS METERED (`HEADLINE_ASKS_MONTH`). `work`, the default and what the model-jobs pass
 * and a skill draft are held to, counts every background row but the headlines and holds `cap` less the headlines' share;
 * `headline` counts the headline rows alone and holds their share. The two caps add up to `cap`.
 *
 * NO LEDGER YET IS NOTHING SPENT. The engine creates the table on its first call, so a host that has not built it has
 * spent nothing this month; any other failure to count is read as spent, so a count nobody can read never lets a call through.
 */
export function backgroundMeter(sql: Pick<Sql, 'one'>, cap = BACKGROUND_JOBS_MONTH, share: 'work' | 'headline' = 'work'): ModelJobMeter {
  /* IN PROPORTION, so a smaller cap keeps both shares: a flat thirty under a cap of ten would leave the work none. */
  const headlines = Math.round((cap * HEADLINE_ASKS_MONTH) / BACKGROUND_JOBS_MONTH);
  const held = share === 'headline' ? headlines : cap - headlines;
  return {
    cap: held,
    spent(since) {
      const spent = backgroundSpent(sql, since);
      if (spent === null) return held;
      return share === 'headline' ? spent.headlines : spent.all - spent.headlines;
    },
  };
}

/**
 * Every background ask this month and the headlines among them, as the status door shows the whole allowance spent, or
 * `null` when the ledger could not be read. No ledger yet is nothing spent (`backgroundMeter`).
 */
export function backgroundSpent(sql: Pick<Sql, 'one'>, since: string): { all: number; headlines: number } | null {
  try {
    const row = sql.one<{ n: number; h: number | null }>(
      `SELECT COUNT(*) AS n, SUM(CASE WHEN kind = 'pattern' AND question = ? THEN 1 ELSE 0 END) AS h FROM slash_call
       WHERE kind IN ('pattern', 'prose', 'embed') AND filed IS NULL AND model <> '-' AND ts >= ?`,
      HEADLINE_ASK,
      since,
    );
    return { all: row?.n ?? 0, headlines: row?.h ?? 0 };
  } catch (e) {
    return /no such table/iu.test(said(e)) ? { all: 0, headlines: 0 } : null;
  }
}

/** The months a meter has already said it is spent in, so the line is said once a month and not on every alarm. */
const told = new WeakMap<ModelJobMeter, string>();

/** The job's payload as an object, or `null` when it cannot be read. */
function payloadOf(job: OutboxRow): Record<string, unknown> | null {
  try {
    const raw: unknown = JSON.parse(job.payload);
    return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * The newest arrivals still waiting whose shape is `shape`, oldest first, as `ingest.ts` `propose` orders its examples.
 *
 * THE SHAPE IS THE KERNEL'S OWN `shapeOf`, over the same `from` and `to` headers the ingest keyed the finding by, so the
 * pass and the observation cannot come to disagree about which arrivals belong to it.
 */
async function samplesOfShape(api: ModelJobsApi, shape: string): Promise<Result<DraftSample[]>> {
  const found: DraftSample[] = [];
  let cursor: number | undefined;
  for (let page = 0; page < SHAPE_PAGES && found.length < SHAPE_SAMPLES_MOST; page++) {
    const read = await api.inbox({ state: 'untriaged', limit: 200, ...(cursor === undefined ? {} : { cursor }) }, RECORD_CTX);
    if (!read.ok) return read;
    for (const a of read.value.arrivals) {
      if (found.length >= SHAPE_SAMPLES_MOST) break;
      const channel = a.channel as DraftSample['channel'];
      if (shapeOf(channel as Parameters<typeof shapeOf>[0], { from: a.from, to: a.to }) !== shape) continue;
      found.push({ id: a.id, channel, ts: a.ts, from: a.from === '' ? null : a.from, subject: a.subject === '' ? null : a.subject, body: a.body ?? '' });
    }
    if (read.value.cursor === null) break;
    cursor = read.value.cursor;
  }
  return { ok: true, value: found.reverse() };
}

/**
 * A finding no model is asked about, as the two-way question the gate files (`packages/kernel/src/govern.ts`, `options`).
 *
 * THE QUESTION IS THE FINDING'S OWN SENTENCE, which the analyser wrote to be read (`packages/kernel/src/observe.ts`), so the
 * person on Decide reads what was noticed and chooses, and a real change can be drafted from `look` later.
 */
function findingQuestion(p: Record<string, unknown>): Settled {
  const why = typeof p.why === 'string' && p.why.trim() !== '' ? p.why : `The record noticed ${String(p.signal)} on ${String(p.subject ?? 'something')}.`;
  return {
    state: 'done',
    result: {
      question: why,
      body_kind: 'options',
      body: {
        options: [
          { id: 'look', label: 'Look into it', because: why },
          { id: 'later', label: 'Not now', because: 'Nothing on the record changes, and the finding stays noticed.' },
        ],
      },
    },
  };
}

/**
 * A refusal from the engine as an ack. A retry can change `RETRIED`'s, so those are `failed` and walk the ladder; any other
 * is `done` with `onRefused`, what the job comes to without an answer.
 */
function refusedAck<T>(out: Result<T>, onRefused: Settled): Settled {
  return RETRIED.has(codeOf(out)) ? { state: 'failed', error: fixOf(out) } : onRefused;
}

/** What one draft comes to. Every throw in `draft` or the inbox is a `failed` ack here, never a lost batch. */
async function settleDraft(api: ModelJobsApi, inference: ModelJobInference, job: OutboxRow, log: (line: string) => void): Promise<Settled> {
  const p = payloadOf(job);
  /* A DRAFT NOBODY CAN READ HAS NOTHING TO FILE, and a retry reads the same bytes: done, with nothing on it. */
  if (p === null) return { state: 'done' };

  let samples: Result<DraftSample[]>;
  if (Array.isArray(p.examples) && p.examples.every((id) => typeof id === 'string' && id !== ''))
    samples = await slashSamplesOf(api, p.examples as string[], RECORD_CTX);
  else if (p.signal === 'ingest.unmatched' && typeof p.subject === 'string') samples = await samplesOfShape(api, p.subject);
  else if (typeof p.signal === 'string') return findingQuestion(p);
  else return { state: 'done' };

  /* AN ARRIVAL GONE SINCE THE DRAFT WAS QUEUED (filed, erased) LEAVES NOTHING TO DRAFT FROM, and asking again finds it
     gone again: done with nothing filed, and the line says why. */
  if (!samples.ok) {
    log(`model job ${job.id}: ${fixOf(samples)}`);
    return { state: 'done' };
  }
  if (samples.value.length === 0) return { state: 'done' };

  const out = await inference.draft(samples.value);
  if (out.ok) return { state: 'done', result: out.value };
  /* A DRAFT THE ENGINE'S CHECKS REFUSED IS NOT RETRIED: the same samples would draft the same refusal, billed twice. */
  log(`model job ${job.id}: ${fixOf(out)}`);
  return refusedAck(out, { state: 'done' });
}

/** What one digest's prose comes to. A refusal no retry mends sends the figures alone, as `46 §5` says a digest ships. */
async function settleProse(inference: ModelJobInference, job: OutboxRow): Promise<Settled> {
  let digest: unknown;
  try {
    digest = JSON.parse(job.payload);
  } catch {
    return { state: 'done', result: { text: '' } };
  }
  const out = await inference.prose(digest);
  if (out.ok) return { state: 'done', result: { text: out.value.text } };
  return refusedAck(out, { state: 'done', result: { text: '' } });
}

/**
 * What one embedding job comes to: the vectors for its texts, in their order, which the kernel writes to `entry_vec` by
 * position. A refusal no retry mends writes nothing, and the next sweep queues the same rows again from the record's text.
 */
async function settleEmbed(embed: NonNullable<ModelJobEmbed['embed']>, job: OutboxRow): Promise<Settled> {
  const texts = payloadOf(job)?.texts;
  /* A JOB NOBODY CAN READ HAS NOTHING TO EMBED, and a retry reads the same bytes: done, with nothing on it. */
  if (!Array.isArray(texts) || texts.length === 0 || !texts.every((t) => typeof t === 'string')) return { state: 'done' };
  const out = await embed(texts as string[]);
  if (out.ok) return { state: 'done', result: { model: out.value.model, dims: out.value.dims, vectors: out.value.vectors } };
  return refusedAck(out, { state: 'done' });
}

async function settle(api: ModelJobsApi, inference: ModelJobInference & ModelJobEmbed, job: OutboxRow, log: (line: string) => void): Promise<Settled> {
  try {
    if (job.kind === 'infer.embed')
      return inference.embed ? await settleEmbed(inference.embed, job) : { state: 'failed', error: 'This host has no model to embed with.' };
    if (job.kind === 'infer.prose') return await settleProse(inference, job);
    return await settleDraft(api, inference, job, log);
  } catch (e) {
    return { state: 'failed', error: said(e) };
  }
}

/**
 * One pass over this record's model jobs. Answers `true` when it leased a full batch, so the host runs another soon.
 *
 * THE JOBS ARE ANSWERED TOGETHER AND NOT IN TURN, for `serveAsks`'s reason: `INFER_LEASE_MS` is 120 seconds and a model
 * call may take thirty, so the fifth of five in turn would be acked after its lease. Each is acked as it settles.
 *
 * THE DRAFTS AND THE PROSE ARE LEASED FIRST, and `infer.embed` takes what room they leave, only where the host can embed
 * and only while more than `EMBED_KEPT_SHARE` of the month is left: a digest never waits behind the index.
 *
 * AN ACK THAT WILL NOT LAND IS LOGGED AND NOT A REASON TO ABANDON THE REST: the lease expires and the job is reclaimed.
 */
export async function serveModelJobs(api: ModelJobsApi, deps: ModelJobsDeps): Promise<boolean> {
  const { inference, meter } = deps;
  if (inference === undefined) return false;
  const log = deps.log ?? warn;

  const now = deps.now();
  const month = monthOf(now, 0);
  const left = meter.cap - meter.spent(month);
  if (left <= 0) {
    /* THE JOBS WAIT, AND THE LINE SAYS WHY, once a month: leasing nothing leaves them `pending`, off the retry ladder. */
    if (told.get(meter) !== month) {
      told.set(meter, month);
      log(`Slash's ${meter.cap} background model jobs this month, apart from the page headlines, are spent until ${monthOf(now, 1).slice(0, 10)}, so the record's pattern drafts, digest prose and embeddings wait until then.`);
    }
    return false;
  }

  const n = Math.min(MODEL_JOBS_PER_PASS, left);
  const asked = api.kernel.leaseOutbox(['infer.draft', 'infer.prose'], n);
  const room = Math.min(n, left - Math.ceil(meter.cap * EMBED_KEPT_SHARE)) - asked.length;
  const jobs = inference.embed && room > 0 ? [...asked, ...api.kernel.leaseOutbox(['infer.embed'], room)] : asked;
  let acked = 0;

  await Promise.all(
    jobs.map(async (job) => {
      const settled = await settle(api, inference, job, log);
      try {
        const landed = api.kernel.ackOutbox({ id: job.id, ...settled, leasedUntil: job.leasedUntil });
        if (landed.ok) acked++;
        else log(`ack ${job.id}: ${fixOf(landed)}`);
      } catch (e) {
        log(`ack ${job.id}: ${said(e)}`);
      }
    }),
  );

  if (acked > 0 && deps.scheduler) await api.kernel.tail(deps.scheduler);
  return jobs.length >= MODEL_JOBS_PER_PASS;
}
