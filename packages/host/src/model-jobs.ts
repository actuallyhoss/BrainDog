/**
 * The pass that serves the record's model jobs on either host: lease the `infer.draft`, `infer.prose`, `infer.resolve` and
 * `infer.embed` rows, answer each through the Slash engine the host hands in, and ack each in the shape
 * `packages/kernel/src/outbox.ts`'s `ack` reads. Once a night it also reads the notes changed on people, organisations and
 * projects and the newest runs' handoffs (`understand.ts`, `serveNotes`), and offers what a person wrote out word for word
 * in them (`serveOffers`).
 *
 * ONE PASS FOR BOTH HOSTS, AND THE RECORD STAYS THE JUDGE. The Worker calls this from `alarm()` as `#model`, after `#ask`,
 * and the self-host from `poll`, after its asks. The kernel files a draft through its one gate in the ack's transaction and
 * sends the digest the prose was waiting on; this file only chooses what each ack carries.
 *
 * WHAT A DRAFT BECOMES:
 *   - a draft with `examples` (the ingest's third unmatched arrival of one shape, `packages/kernel/src/ingest.ts`) reads
 *     those arrivals from the inbox and asks for a pattern, acked as `{ question, body_kind: 'pattern', body }`;
 *   - a draft with `signal: 'ingest.unmatched'` is the same, its samples found by the shape its `subject` names;
 *   - any other `signal` (`search.empty`, `write.refused`, `query.scan`, dormant) is settled done with no model call,
 *     its sentence kept as a reading, and files no question (ENG-B17): a finding that changes nothing is not asked.
 * A digest's prose is acked as `{ text }`, and `''` sends the digest as figures. An embedding is acked as
 * `{ model, dims, vectors }`, one vector for each text the hourly sweep queued, which the kernel writes to `entry_vec`.
 * A doubtful pair is acked as `{ verdicts: [{ hash, same, confidence }] }`, from the cache first (`understand.ts`).
 *
 * METERED ON THE BACKGROUND ALLOWANCE, NEVER ON HIS ASKS. The daily look, a digest's prose, an embedding, a pattern
 * drafted for the record, the page headlines and understanding who is who share the background allowance
 * (`BACKGROUND_JOBS_MONTH`) as one pool with a floor each (`budget-plan.ts`); his 80 are his own
 * (`packages/slash/src/types.ts`), and an automation's question spends those, as his own press does. Which of the two a
 * row spent is what the row says in `spends`, written with it, and never something read back out of its kind or its
 * question. The pass
 * asks the meter BEFORE it leases and leases no more jobs than the month has left, so a spent month leaves the jobs
 * `pending`, where they never walk the retry ladder to dead, and the next month serves them.
 *
 * STRUCTURAL, AS `slash-answers.ts` IS: it imports neither `@braindog/slash` nor an app. The engine is handed in as
 * `ModelJobInference`, which each host builds over its own Slash (`apps/worker/src/slash-jobs.ts`,
 * `apps/selfhost/src/slash.ts` `slashModelJobs`), so a host with no model never evaluates the package (`46 §5.1`).
 */

import { shapeOf, type Kernel, type MayPropose, type OutboxKind, type OutboxRow } from '@braindog/kernel';
import { codeOf, fixOf, type Result, type Scheduler, type Sql } from '@braindog/ports';
import type { CallContext, RecordApi } from '@braindog/record';

import { BUDGET_ORDER, leftOf, mostOf, type BudgetPurpose, type BudgetSpent } from './budget-plan.ts';
import type { EngineHealthRead } from './engine-health.ts';
import { mayThink, neverSent, type NeverSent, type Reads } from './infer.ts';
import type { DraftSample, ModelJobInference } from './slash-answers.ts';
import { slashSamplesOf } from './slash.ts';
import { serveNotes, serveOffers, settleResolve, type OffersKernel, type UnderstandStore } from './understand.ts';

export { UNDERSTAND_ASK, UNDERSTAND_ASKS_MONTH } from './understand.ts';

/** How many model jobs one pass leases. A pass that leased all five may have left more, and the host runs another. */
export const MODEL_JOBS_PER_PASS = 5;

/**
 * The model jobs a month's background allowance holds: `@braindog/slash`'s `BACKGROUND_ASKS_MONTH`, restated because this
 * package never imports that one (the header's rule). A host that has the package's number hands it to `backgroundMeter`.
 */
export const BACKGROUND_JOBS_MONTH = 600;

/**
 * The headline asks a month is expected to hold: one batched ask a night for thirty nights. The headline ask writes its
 * row with purpose `headline`, which is how the meters below tell it from a skill draft, a digest's prose, a pattern or
 * an embedding.
 *
 * NO LONGER A WALL (ENG-A10). It was the most the headlines might spend, and everything else was held out of it: a 31st
 * night whose figures moved kept its rules line while the month still had asks nobody was owed. What the headlines may
 * spend now is the plan's answer (`budget-plan.ts`): their floor always, and past it whatever is left once the floors
 * the others have not used are set aside.
 */
export const HEADLINE_ASKS_MONTH = 30;

/**
 * The question a headline ask's ledger row is written with: the words a person reads beside the row, and nothing a
 * meter counts by. The meters read the row's `purpose` (`backgroundSpent`).
 */
export const HEADLINE_ASK = "Slash's page headlines";

/**
 * What a ledger row was for, and whose allowance it spent: Slash's own two columns (`packages/slash/src/call.ts`,
 * store version 3), restated because this package never imports that one. Every row this host writes carries both,
 * and every count here reads them.
 */
export type AskPurpose = 'headline' | 'understand' | 'look' | 'skill' | 'prose' | 'pattern' | 'embed' | 'ask' | 'automation' | 'plan';

/**
 * The purposes of the work that write rows of their own, each with a meter of its own (`ModelJobMeter.of`): the daily
 * look, a digest's prose, a pattern draft, a skill draft and an embedding.
 */
export type WorkPurpose = Exclude<BudgetPurpose, 'headline' | 'understand' | 'compose'>;
export type AskSpends = 'person' | 'background' | 'none';

/** The kernel's job for a doubtful pair (`loop/contract-17.md`), migration 23's kind in `OUTBOX_KINDS`. */
const RESOLVE: OutboxKind = 'infer.resolve';

/** How many arrivals of one shape a finding's pattern is drafted from, the oldest of them, handed over oldest first. */
const SHAPE_SAMPLES_MOST = 5;

/** How far back through the inbox a shape's samples are looked for: five pages of 200, as `slashSamplesOf` walks. */
const SHAPE_PAGES = 5;

/** The record reading its own inbox for its own job: nobody asked, so nobody's reach decides, as `SLASH_CTX` is read. */
/* `outbound`: what Slash reads goes to a model, so no row anyone kept private goes with it. */
const RECORD_CTX: CallContext = { principal: { kind: 'system', id: 'slash' }, outbound: true };

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

/**
 * The kernel methods this pass calls, and not the kernel. The notes pass's and the offers' are optional, so a host or a
 * test that hands the queue alone still has its jobs served, and the notes are not read.
 */
export type ModelJobsKernel = Pick<Kernel, 'leaseOutbox' | 'ackOutbox' | 'tail'> & Partial<Pick<Kernel, 'outboxWaiting'>> & Partial<OffersKernel>;

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
  /**
   * The part of this meter's month that understanding may spend, counted inside it: its floor always, and past it what
   * the plan leaves (`budget-plan.ts`).
   * ABSENT, nothing is spent on understanding: `infer.resolve` waits `pending` and the notes are not read.
   */
  understand?: ModelJobMeter | undefined;
  /**
   * The part of this meter's month that is NOT understanding's: what the drafts, the prose and the embeddings may spend,
   * with understanding's unspent floor set aside. ABSENT, as a meter a host built by hand is, they are held to the
   * whole meter, as they were before the plan.
   */
  rest?: ModelJobMeter | undefined;
  /**
   * ONE PURPOSE OF THE WORK AS A METER OF ITS OWN: its floor always, and past it what the plan leaves, so the prose is
   * never leased out of the pattern's floor nor a skill draft out of the look's. `leased` is what a pass has leased
   * and not settled yet, by purpose, counted as spent so two leases of one pass never take the same ask left over.
   * ABSENT, as a meter a host built by hand is, every purpose is held to `rest`, as before each had its own.
   */
  of?: ((purpose: WorkPurpose, leased?: BudgetSpent) => ModelJobMeter) | undefined;
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
  /**
   * The host's Slash store, where understanding keeps the verdicts it was given and the notes it read (`understand.ts`).
   * ABSENT, every pair is asked as it comes and the nightly notes pass does not run.
   */
  store?: UnderstandStore | undefined;
  /**
   * The engine's health (`engine-health.ts`, `engineHealthRead`), asked before anything is leased. `not_answering` holds
   * the jobs `pending` with their attempts as they were, and the model is tried every `MODEL_TEST_EVERY_MS` by a call that is no job.
   * ABSENT, or a read that throws, and the pass leases as it always did.
   */
  health?: (() => Promise<Pick<EngineHealthRead, 'health'>>) | undefined;
  /**
   * His switch for background reading (`infer.ts` `mayThink`), asked before anything is leased. Off, every job waits
   * `pending` with its attempts as they were and the model is neither asked nor tested. ABSENT IS ON.
   */
  reads?: Reads | undefined;
  /**
   * The kernel's governor (`observe.ts` `mayPropose`, over the record's sql), asked before a pattern draft goes to the
   * model, because the kernel's ack files what it drafts as Slash's question. No, and the draft is held: no model call,
   * nothing filed, the job done, and the pass says how many it held and why. The arrivals stay in the inbox, so the
   * pattern is noticed again once Slash may ask. ABSENT, as a host built by hand is, every draft is sent as before.
   */
  mayPropose?: ((nowMs: number) => MayPropose) | undefined;
};

/**
 * How often a silent model is tried, by one call that leases no job (ENG-A04, `allowed`). Once that call is answered the
 * pass runs as before; until then every job waits off the ladder with its attempts as they were.
 */
export const MODEL_TEST_EVERY_MS = 30 * 60_000;

/** The ack for one job, without its id and lease. `held` is the governor's sentence for a draft it held (never acked). */
type Settled = { state: 'done'; result?: unknown; held?: string } | { state: 'failed'; error: string };

/** The governor as one pass asks it: once, on the first draft that would file, and the same answer for the rest. */
type Governor = () => MayPropose;

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
 * THE ROWS COUNTED ARE THE ROWS THAT SAY `spends = 'background'`, and nothing else decides it. Whoever writes a row says
 * whose allowance it spent: `digestProse`, `draftPattern` and an embedding (`packages/slash/src/jobs.ts`), and the look,
 * a skill draft, the headlines and understanding (`slash-ask.ts` `background`) write `background`; his own press writes
 * `person` whether it filed its pattern or the checks refused it, so a press that filed nothing is his ask and never
 * this. It was counted here once, when the count was "a pattern, prose or embed row with nothing in `filed`". A model
 * never reached and a failed attempt write `none` and cost the month nothing. An `embed` row is one embedding job, a
 * hundred rows in one call.
 *
 * ONE POOL WITH A FLOOR EACH, AND `share` SAYS WHOSE PART OF IT IS METERED (`budget-plan.ts`, ENG-A10). `headline` is the
 * page headlines and `understand` is reading who is who, each a purpose of its own. `work`, the default and what the
 * model-jobs pass is held to, is everything but the headlines, understanding among it as it always was counted, and it
 * carries understanding's meter, the meter of all the rest together (`REST`), and a meter for each purpose of the rest
 * alone (`of`), which is what a job of the pass, the look and a skill draft are each held to. None of them is a wall:
 * each may always spend its floor, and past it whatever is left once the floors nobody has used yet are set aside, so
 * thirty nights of headlines no longer stop the thirty-first while the month has room, a month of drafts still leaves
 * the headlines theirs, and a month of daily looks still leaves a digest its prose.
 *
 * `cap` IS THE MOST THE SHARE COULD EVER SPEND, the month less everybody else's floors, and `spent` is the share's own
 * rows, read as more when the others have spent into what was left over, so `cap - spent` is what the share may spend
 * now. A caller that leases or asks no further than that never passes the plan.
 *
 * NO LEDGER YET IS NOTHING SPENT. The engine creates the table on its first call, so a host that has not built it has
 * spent nothing this month; any other failure to count is read as spent, so a count nobody can read never lets a call through.
 * A ledger an older build wrote, with no `spends` yet, is one of those: it reads as spent until the engine is built and
 * steps the store (`openStore`), which the first ask of any kind does.
 */
export function backgroundMeter(sql: Pick<Sql, 'one'>, cap = BACKGROUND_JOBS_MONTH, share: 'work' | 'headline' | 'understand' = 'work'): ModelJobMeter {
  return share === 'work'
    ? {
        ...shareMeter(sql, cap, ['understand', ...REST]),
        understand: shareMeter(sql, cap, ['understand']),
        rest: shareMeter(sql, cap, REST),
        of: (purpose, leased) => shareMeter(sql, cap, [purpose], leased),
      }
    : shareMeter(sql, cap, [share]);
}

/**
 * Everything the ledger writes that is neither a headline nor understanding: the purposes the `rest` meter adds up. A
 * LIST AND NO LONGER A POOL. It was one pool while a digest's prose, a pattern, an embedding and a skill draft were all
 * written with purpose `look`: their floors would have been set aside for rows nobody wrote, so they were added into
 * one floor, and the busiest of the six spent all of it. Each of those rows names its own purpose now
 * (`packages/slash/src/jobs.ts`, `slash-ask.ts` `BACKGROUND_PURPOSE`), so each floor holds alone.
 */
const REST: readonly BudgetPurpose[] = BUDGET_ORDER.filter((p) => p !== 'headline' && p !== 'understand');

/**
 * The purposes whose rows still cannot be told apart, each list one pool of the plan with one floor (`leftOf`). ONE IS
 * LEFT: no row is written with purpose `compose`, and what composes outside a page's headline is the daily look, so the
 * two share the look's rows and the look spends both floors. When a row names `compose` this list is empty.
 */
const SHARED: readonly (readonly BudgetPurpose[])[] = [['compose', 'look']];

/**
 * One share of the plan as a meter: the purposes in `mine`, counted and held by the plan. `leased` is added to what the
 * ledger says each purpose spent (`ModelJobMeter.of`).
 */
function shareMeter(sql: Pick<Sql, 'one'>, cap: number, mine: readonly BudgetPurpose[], leased?: BudgetSpent): ModelJobMeter {
  const most = mostOf(mine, cap, SHARED);
  return {
    cap: most,
    spent(since) {
      const by = backgroundSpentBy(sql, since);
      /* A COUNT NOBODY CAN READ IS READ AS SPENT, so it never lets a call through. */
      if (by === null) return most;
      if (leased !== undefined) for (const p of BUDGET_ORDER) by[p] += Math.max(0, Math.floor(leased[p] ?? 0));
      const own = mine.reduce((n, p) => n + (by[p] ?? 0), 0);
      return Math.max(own, most - leftOf(mine, by, cap, SHARED));
    },
  };
}

/**
 * This month's background asks by the purpose each row was written with, or `null` when the ledger could not be read.
 * No ledger yet is nothing spent (`backgroundMeter`). What the plan is handed (`budget-plan.ts`).
 *
 * A ROW WHOSE PURPOSE THE PLAN DOES NOT NAME IS COUNTED AS THE LOOK'S, so every row that says it spent `background` is
 * in the month whatever a later build calls its purpose, as "every background row but the headlines" always counted it.
 */
export function backgroundSpentBy(sql: Pick<Sql, 'one'>, since: string): Record<BudgetPurpose, number> | null {
  try {
    /* THE PURPOSES ARE THE PLAN'S OWN NAMES, constants of this build and never a caller's words. */
    const sums = BUDGET_ORDER.map((p) => `SUM(CASE WHEN purpose = '${p}' THEN 1 ELSE 0 END) AS "${p}"`).join(', ');
    const row = sql.one<{ n: number } & Record<BudgetPurpose, number | null>>(`SELECT COUNT(*) AS n, ${sums} FROM slash_call WHERE spends = 'background' AND ts >= ?`, since);
    const by = nothingSpent();
    let named = 0;
    for (const p of BUDGET_ORDER) {
      by[p] = row?.[p] ?? 0;
      named += by[p];
    }
    by.look += Math.max(0, (row?.n ?? 0) - named);
    return by;
  } catch (e) {
    return /no such table/iu.test(said(e)) ? nothingSpent() : null;
  }
}

const nothingSpent = (): Record<BudgetPurpose, number> => ({ understand: 0, headline: 0, compose: 0, look: 0, prose: 0, pattern: 0, skill: 0, embed: 0 });

/**
 * Every background ask this month, the headlines among them and the understanding asks among them, as the status door
 * shows the whole allowance spent, or `null` when the ledger could not be read. No ledger yet is nothing spent
 * (`backgroundMeter`).
 *
 * BY `spends` AND `purpose`, THE TWO THINGS A ROW SAYS ABOUT ITSELF. Neither its kind, nor whether it filed, nor the
 * words of its question is read: `test/model-jobs-spends.test.ts` fails when one of them decides a count again.
 */
export function backgroundSpent(sql: Pick<Sql, 'one'>, since: string): { all: number; headlines: number; understand: number } | null {
  const by = backgroundSpentBy(sql, since);
  if (by === null) return null;
  return { all: BUDGET_ORDER.reduce((n, p) => n + by[p], 0), headlines: by.headline, understand: by.understand };
}

/** The meters whose pass has said background reading is off, so the line is said once and not on every alarm. */
const waiting = new WeakSet<ModelJobMeter>();

/** What a withheld thing is called in a line about it. The value itself is never quoted. */
const WITHHELD: Record<NeverSent, string> = { sealed: 'a sealed field', key: 'what looks like a key', bytes: "a file's bytes" };

/**
 * What stands in a batch for a text that is not sent. THE BATCH KEEPS ITS LENGTH because the kernel matches vectors to
 * rows by position (`packages/kernel/src/embed.ts`) and refuses a batch one short, which would hold every other row of it
 * out of the index for as long as the one row holds its key.
 */
const NOT_SENT_TEXT = 'not sent';

/** The months a meter has already said it is spent in, so the line is said once a month and not on every alarm. */
const told = new WeakMap<ModelJobMeter, string>();

/** What the silent model's test asks about: a digest of one line that is nobody's, so the test leases no job. */
const TEST_DIGEST = { digest: 'model-test', name: 'A test', text: 'One task closed.' };

/** The key the next test's time is kept under, in the host's store. */
const TEST_MARK = 'model.test.next';

/** The next test's time where the host hands no store, by the health read it belongs to. */
const testsHeld = new WeakMap<object, number>();

/**
 * When a silent model is next tried, or `null` when no wait is open.
 *
 * KEPT IN THE HOST'S STORE WHERE THERE IS ONE, because the Worker's object may be a fresh isolate on every alarm, and a
 * time held in memory alone would test on every pass and spend the attempts the wait exists to keep. A store that will not
 * answer falls back to memory: the wait is kept for as long as this isolate lives, which is still the wait.
 */
function testNext(deps: ModelJobsDeps, key: object): number | null {
  if (deps.store)
    try {
      deps.store.exec('CREATE TABLE IF NOT EXISTS model_jobs_mark (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
      const at = deps.store.one<{ value: string }>('SELECT value FROM model_jobs_mark WHERE key = ?', TEST_MARK)?.value;
      return at === undefined ? null : Date.parse(at);
    } catch {
      /* the memory below */
    }
  return testsHeld.get(key) ?? null;
}

/** Set when a silent model is next tried, or close the wait with `null`. */
function setTestNext(deps: ModelJobsDeps, key: object, at: number | null): void {
  if (at === null) testsHeld.delete(key);
  else testsHeld.set(key, at);
  if (deps.store)
    try {
      deps.store.exec('CREATE TABLE IF NOT EXISTS model_jobs_mark (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
      if (at === null) deps.store.exec('DELETE FROM model_jobs_mark WHERE key = ?', TEST_MARK);
      else deps.store.exec('INSERT OR REPLACE INTO model_jobs_mark (key, value) VALUES (?, ?)', TEST_MARK, new Date(at).toISOString());
    } catch {
      /* held in memory above */
    }
}

/**
 * What the engine's health lets this pass lease: `all` as before, or `none` while the model is silent.
 *
 * ONLY `not_answering` HOLDS THE JOBS. `never_asked` has to ask to learn anything, and `key_closed` and `off` are said on
 * Settings by the same read. The first silent pass opens the wait and says so in one line; it does not test at once, because
 * the call that just failed was the test. A read that throws is no news, and the pass runs as it always did.
 *
 * THE TEST IS ONE CALL AND NOT A JOB (audit-38-39 finding 7). A job leased as the test and acked `failed` spent one of its
 * eight attempts every silent half hour, and the oldest job was leased each time, so it died in about four hours: the kernel
 * hands this pass no verb that puts a lease back without an attempt (`unlease` is not on `Kernel`). A call over a digest of
 * nobody's leases nothing, a model never reached costs nothing on the month (`backgroundMeter`), and one that answers is
 * the wait's end: the pass runs as before at once, on the jobs it kept.
 */
async function allowed(
  deps: ModelJobsDeps,
  kernel: ModelJobsKernel,
  inference: ModelJobInference,
  now: number,
  log: (line: string) => void,
): Promise<'all' | 'none'> {
  const read = deps.health;
  if (read === undefined) return 'all';
  let state: string;
  try {
    state = (await read()).health.state;
  } catch (e) {
    log(`engine health: ${said(e)}`);
    return 'all';
  }
  const next = testNext(deps, read);
  if (state !== 'not_answering') {
    if (next !== null) setTestNext(deps, read, null);
    return 'all';
  }
  if (next === null) {
    setTestNext(deps, read, now + MODEL_TEST_EVERY_MS);
    log(`Slash's model is not answering, so the record's model jobs wait with their attempts kept, and the model is tried again every ${MODEL_TEST_EVERY_MS / 60_000} minutes.`);
    return 'none';
  }
  if (now < next) return 'none';
  setTestNext(deps, read, now + MODEL_TEST_EVERY_MS);
  /* NOTHING WAITING, NOTHING TO TEST FOR: the test is a model call, and one made every half hour over an empty queue is
     spent on nobody. A job leased as the test (before) was only ever tried when one waited, and so is this call. */
  const kinds: OutboxKind[] = ['infer.draft', 'infer.prose', ...(inference.resolve ? [RESOLVE] : []), ...(inference.embed ? (['infer.embed'] as const) : [])];
  if (kernel.outboxWaiting?.(kinds) === false) return 'none';
  let answered = false;
  try {
    answered = (await inference.prose(TEST_DIGEST)).ok;
  } catch {
    /* a test that throws is a model still silent */
  }
  if (!answered) {
    log("Slash's model is still not answering, so the record's model jobs keep waiting with their attempts kept.");
    return 'none';
  }
  setTestNext(deps, read, null);
  return 'all';
}

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
 * The oldest arrivals still waiting whose shape is `shape`, oldest first, and how many of the shape wait.
 *
 * THE SHAPE IS THE KERNEL'S OWN `shapeOf`, over the same `from` and `to` headers the ingest keyed the finding by, so the
 * pass and the observation cannot come to disagree about which arrivals belong to it.
 */
async function samplesOfShape(api: ModelJobsApi, shape: string): Promise<Result<{ samples: DraftSample[]; waiting: number }>> {
  const found: DraftSample[] = [];
  let waiting = 0;
  let cursor: number | undefined;
  for (let page = 0; page < SHAPE_PAGES; page++) {
    const read = await api.inbox({ state: 'untriaged', limit: 200, ...(cursor === undefined ? {} : { cursor }) }, RECORD_CTX);
    if (!read.ok) return read;
    for (const a of read.value.arrivals) {
      const channel = a.channel as DraftSample['channel'];
      if (shapeOf(channel as Parameters<typeof shapeOf>[0], { from: a.from, to: a.to }) !== shape) continue;
      found.push({ id: a.id, channel, ts: a.ts, from: a.from === '' ? null : a.from, subject: a.subject === '' ? null : a.subject, body: a.body ?? '' });
      waiting++;
      if (found.length > SHAPE_SAMPLES_MOST) found.shift();
    }
    if (read.value.cursor === null) break;
    cursor = read.value.cursor;
  }
  return { ok: true, value: { samples: found.reverse(), waiting } };
}

/**
 * A finding no model is asked about, as the one line the pass logs (ENG-B17).
 *
 * KEPT AS A READING, NEVER FILED AS A QUESTION. It used to be a "Look into it / Not now" question signed by Slash whose
 * two answers changed nothing on the record, so every week asked him to choose between two ways of doing nothing. The
 * finding's own sentence is what the analyser wrote to be read (`packages/kernel/src/observe.ts`), and it stays noticed
 * there; what Slash offers is a real change or nothing.
 */
function findingReading(p: Record<string, unknown>): string {
  return typeof p.why === 'string' && p.why.trim() !== '' ? p.why : `The record noticed ${String(p.signal)} on ${String(p.subject ?? 'something')}.`;
}

/**
 * A refusal from the engine as an ack. A retry can change `RETRIED`'s, so those are `failed` and walk the ladder; any other
 * is `done` with `onRefused`, what the job comes to without an answer.
 */
function refusedAck<T>(out: Result<T>, onRefused: Settled): Settled {
  return RETRIED.has(codeOf(out)) ? { state: 'failed', error: fixOf(out) } : onRefused;
}

/** What one draft comes to. Every throw in `draft` or the inbox is a `failed` ack here, never a lost batch. */
async function settleDraft(api: ModelJobsApi, inference: ModelJobInference, job: OutboxRow, log: (line: string) => void, governor?: Governor): Promise<Settled> {
  const p = payloadOf(job);
  /* A DRAFT NOBODY CAN READ HAS NOTHING TO FILE, and a retry reads the same bytes: done, with nothing on it. */
  if (p === null) return { state: 'done' };

  let samples: Result<DraftSample[]>;
  let waiting: number | undefined = typeof p.waiting === 'number' && Number.isSafeInteger(p.waiting) && p.waiting > 0 ? p.waiting : undefined;
  if (Array.isArray(p.examples) && p.examples.every((id) => typeof id === 'string' && id !== ''))
    samples = await slashSamplesOf(api, p.examples as string[], RECORD_CTX);
  else if (p.signal === 'ingest.unmatched' && typeof p.subject === 'string') {
    const shaped = await samplesOfShape(api, p.subject);
    samples = shaped.ok ? { ok: true, value: shaped.value.samples } : shaped;
    if (shaped.ok) waiting = shaped.value.waiting;
  }
  else if (typeof p.signal === 'string') {
    log(`model job ${job.id}: noticed, and nothing to ask: ${findingReading(p)}`);
    return { state: 'done' };
  } else return { state: 'done' };

  /* AN ARRIVAL GONE SINCE THE DRAFT WAS QUEUED (filed, erased) LEAVES NOTHING TO DRAFT FROM, and asking again finds it
     gone again: done with nothing filed, and the line says why. */
  if (!samples.ok) {
    log(`model job ${job.id}: ${fixOf(samples)}`);
    return { state: 'done' };
  }
  if (samples.value.length === 0) return { state: 'done' };

  /* NEVER A SEALED FIELD, A KEY OR A FILE'S BYTES (ENG-A09): an arrival holding one is left out whole, and the pattern
     is drafted from the others. With none left there is nothing to draft from, and a retry reads the same arrivals. */
  const clean = samples.value.filter((sample) => neverSent(sample) === null);
  if (clean.length < samples.value.length) {
    const held = neverSent(samples.value.find((sample) => neverSent(sample) !== null)) ?? 'key';
    log(`model job ${job.id}: ${samples.value.length - clean.length} of its ${samples.value.length} arrivals held ${WITHHELD[held]} and were not sent to the model.`);
  }
  if (clean.length === 0) return { state: 'done' };

  /* THE THREE OLDEST OF HOW MANY WAIT (ENG-B07): the engine sends the oldest three by `ts` and names the count; the
     kernel's payload says `waiting` (`ingest.ts` `propose`), and a shape read here counts its own. */
  /* AND ONLY WHERE SLASH MAY ASK (ENG-B17 job 4): the floor and the brake (`mayPropose`) are asked before the model,
     because what it drafts is filed as Slash's question by the ack. Held, nothing is sent and nothing filed; the pass
     counts it and says why, and the arrivals wait in the inbox to be noticed again. Nothing here lifts the brake. */
  const may = governor?.();
  if (may && !may.may) return { state: 'done', held: may.why };
  const out = await inference.draft(clean, waiting);
  if (out.ok) return { state: 'done', result: out.value };
  /* A DRAFT THE ENGINE'S CHECKS REFUSED IS NOT RETRIED: the same samples would draft the same refusal, billed twice. */
  log(`model job ${job.id}: ${fixOf(out)}`);
  return refusedAck(out, { state: 'done' });
}

/** What one digest's prose comes to. A refusal no retry mends sends the figures alone, as `46 §5` says a digest ships. */
async function settleProse(inference: ModelJobInference, job: OutboxRow, log: (line: string) => void): Promise<Settled> {
  let digest: unknown;
  try {
    digest = JSON.parse(job.payload);
  } catch {
    return { state: 'done', result: { text: '' } };
  }
  /* A DIGEST HOLDING WHAT IS NEVER SENT GOES OUT AS ITS FIGURES (ENG-A09), as one the model refused does. */
  const held = neverSent(digest);
  if (held !== null) {
    log(`model job ${job.id}: its digest held ${WITHHELD[held]} and was not sent to the model, so it goes out as its figures.`);
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
async function settleEmbed(embed: NonNullable<ModelJobEmbed['embed']>, job: OutboxRow, log: (line: string) => void): Promise<Settled> {
  const texts = payloadOf(job)?.texts;
  /* A JOB NOBODY CAN READ HAS NOTHING TO EMBED, and a retry reads the same bytes: done, with nothing on it. */
  if (!Array.isArray(texts) || texts.length === 0 || !texts.every((t) => typeof t === 'string')) return { state: 'done' };
  /* A TEXT HOLDING WHAT IS NEVER SENT IS NOT EMBEDDED (ENG-A09): its place is kept by `NOT_SENT_TEXT`, so the rows
     beside it are still indexed and it is found by none of its own words. */
  const sent = (texts as string[]).map((t) => (neverSent(t) === null ? t : NOT_SENT_TEXT));
  const kept = sent.filter((t, i) => t !== texts[i]).length;
  if (kept > 0) log(`model job ${job.id}: ${kept} of its ${texts.length} texts held what looks like a key or a file's bytes and were not sent to the model.`);
  const out = await embed(sent);
  if (out.ok) return { state: 'done', result: { model: out.value.model, dims: out.value.dims, vectors: out.value.vectors } };
  return refusedAck(out, { state: 'done' });
}

async function settle(
  api: ModelJobsApi,
  inference: ModelJobInference & ModelJobEmbed,
  job: OutboxRow,
  log: (line: string) => void,
  store: UnderstandStore | undefined,
  now: number,
  governor?: Governor,
): Promise<Settled> {
  try {
    if (job.kind === RESOLVE)
      return inference.resolve ? await settleResolve(inference.resolve, job, store, now, log) : { state: 'failed', error: 'This host has no model to judge pairs with.' };
    if (job.kind === 'infer.embed')
      return inference.embed ? await settleEmbed(inference.embed, job, log) : { state: 'failed', error: 'This host has no model to embed with.' };
    if (job.kind === 'infer.prose') return await settleProse(inference, job, log);
    return await settleDraft(api, inference, job, log, governor);
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
 * THE DRAFTS AND THE PROSE ARE LEASED FIRST, then `infer.resolve` while understanding's own share has room, and
 * `infer.embed` takes what room they leave, only where the host can embed and only while more than `EMBED_KEPT_SHARE` of
 * the month is left: a digest never waits behind the index, nor behind a pair. None of the three is leased into the
 * floor understanding has not spent yet (`rest`), and a pair is leased while that floor has room even when they have none.
 *
 * AND THE NOTES PASS LAST, once its night has come (`serveNotes`), where the host hands a store, a kernel that reads and
 * a model that reads notes. Its ask is understanding's too, so it is held to the same share and the work's month.
 *
 * A MODEL THAT IS NOT ANSWERING LEASES NOTHING, where the host hands its health (`allowed`): every job waits `pending`,
 * one call that is no job tests the model every `MODEL_TEST_EVERY_MS`, and the pass runs as before once it is answered. A
 * job that fails for any other cause, while the model answers, still climbs its own ladder.
 *
 * AND NOTHING AT ALL WHILE HE HAS BACKGROUND READING OFF (`mayThink`): the offers, which ask no model, still run.
 *
 * AN ACK THAT WILL NOT LAND IS LOGGED AND NOT A REASON TO ABANDON THE REST: the lease expires and the job is reclaimed.
 */
export async function serveModelJobs(api: ModelJobsApi, deps: ModelJobsDeps): Promise<boolean> {
  const { inference, meter } = deps;
  const log = deps.log ?? warn;

  /* WHAT A PERSON WROTE WORD FOR WORD IS OFFERED FIRST, AND WITH NO MODEL (`serveOffers`): it costs no ask, so neither a
     host without a model nor a spent month holds it back. Nightly by its own mark, like the notes. */
  const { registers, list, meetsList, propose, history, members, orgsList } = api.kernel;
  if (deps.store && registers && list && meetsList && propose && history && members && orgsList) {
    try {
      serveOffers({ registers, list, meetsList, propose, history, members, orgsList }, { store: deps.store, now: deps.now, log });
    } catch (e) {
      log(`offers: ${said(e)}`);
    }
  }

  if (inference === undefined) return false;

  /* THE CONSENT RULE BEFORE THE QUEUE (ENG-A09). Every job this pass serves spends `background`, so one answer covers
     the drafts, the prose, the pairs, the embeddings and the notes, and it is asked before the meter, the health and
     the model's test, none of which a pass that may not think has any use for. Said once, and again after he turns it
     back on and off. */
  const may = await mayThink('look', deps.reads);
  if (!may.ok) {
    if (!waiting.has(meter)) {
      waiting.add(meter);
      /* THE REFUSAL'S OWN SENTENCE, so a switch that could not be read is not logged as one he turned off. */
      log(`${fixOf(may)} The record's model jobs wait with their attempts kept.`);
    }
    return false;
  }
  waiting.delete(meter);

  const now = deps.now();
  const month = monthOf(now, 0);
  const left = meter.cap - meter.spent(month);
  if (left <= 0) {
    /* THE JOBS WAIT, AND THE LINE SAYS WHY, once a month: leasing nothing leaves them `pending`, off the retry ladder. */
    if (told.get(meter) !== month) {
      told.set(meter, month);
      log(`Slash's background model jobs this month, apart from the page headlines, are spent until ${monthOf(now, 1).slice(0, 10)}, so the record's pattern drafts, digest prose, embeddings and its reading of who is who wait until then.`);
    }
    return false;
  }

  /* A SILENT MODEL LEASES NOTHING (ENG-A04): an outage once spent each job's eight attempts in four hours and filed it
     as a question. Leasing nothing leaves them `pending` with their attempts as they were, and the notes wait too. */
  if ((await allowed(deps, api.kernel, inference, now, log)) === 'none') return false;

  const n = Math.min(MODEL_JOBS_PER_PASS, left);
  /* THE DRAFTS, THE PROSE AND THE EMBEDDINGS NEVER SPEND UNDERSTANDING'S FLOOR (`budget-plan.ts`): they are leased no
     further than the rest of the month has left, which sets that floor aside while it is unspent. A meter with no
     `rest`, built by hand, holds them to the whole month as before. */
  const rest = meter.rest ?? meter;
  const restLeft = rest === meter ? left : Math.min(left, rest.cap - rest.spent(month));
  /* AND EACH JOB IS LEASED FROM ITS OWN PURPOSE'S MONTH (`ModelJobMeter.of`): the prose from the prose's, a draft from
     the pattern's, so a night of one never takes the other's floor. What this pass has leased already is counted as
     spent, because a job is a call not settled yet and two purposes may not both take the last ask left over. */
  const leased: BudgetSpent = {};
  const ownLeft = (purpose: WorkPurpose): number => {
    const own = meter.of?.(purpose, leased);
    return own === undefined ? restLeft : Math.min(restLeft, own.cap - own.spent(month));
  };
  let asked: OutboxRow[];
  if (meter.of === undefined) {
    /* A METER BUILT BY HAND HAS ONE MONTH FOR BOTH, and the queue decides which comes first, as it always did. */
    const drafting = Math.min(n, restLeft);
    asked = drafting > 0 ? api.kernel.leaseOutbox(['infer.draft', 'infer.prose'], drafting) : [];
    /* COUNTED AS LEASED all the same, so the embeddings' room below sets them aside as it always did. */
    for (const job of asked) {
      const p = job.kind === 'infer.prose' ? 'prose' : 'pattern';
      leased[p] = (leased[p] ?? 0) + 1;
    }
  } else {
    /* THE PROSE FIRST, as the plan's order has it (`BUDGET_ORDER`): a digest goes out today, a pattern can wait a night. */
    const prosing = Math.min(n, ownLeft('prose'));
    const prose = prosing > 0 ? api.kernel.leaseOutbox(['infer.prose'], prosing) : [];
    leased.prose = prose.length;
    const drafting = Math.min(Math.min(n, restLeft) - prose.length, ownLeft('pattern'));
    const drafts = drafting > 0 ? api.kernel.leaseOutbox(['infer.draft'], drafting) : [];
    leased.pattern = drafts.length;
    asked = [...prose, ...drafts];
  }
  /* A PAIR IS ONE ASK AT MOST AND OFTEN NONE (the cache), and it is leased no further than understanding's month has left. */
  const understandLeft = meter.understand ? meter.understand.cap - meter.understand.spent(month) : 0;
  const judging = Math.min(n - asked.length, understandLeft);
  const judged = inference.resolve && judging > 0 ? api.kernel.leaseOutbox([RESOLVE], judging) : [];
  leased.understand = judged.length;
  /* AN EMBEDDING HAS NO FLOOR, so its own month is what is left over once every floor nobody has used is set aside. */
  const room = Math.min(n - asked.length - judged.length, embedRoom(meter, now, leased));
  const jobs = [...asked, ...judged, ...(inference.embed && room > 0 ? api.kernel.leaseOutbox(['infer.embed'], room) : [])];
  let acked = 0;
  /* THE GOVERNOR ONCE A PASS, and only when a draft would file: it reads and writes nothing, so one answer holds. */
  let ruled: MayPropose | undefined;
  const governor: Governor | undefined = deps.mayPropose && (() => (ruled ??= deps.mayPropose!(now)));
  const held: string[] = [];

  await Promise.all(
    jobs.map(async (job) => {
      const { held: why, ...settled } = await settle(api, inference, job, log, deps.store, now, governor) as Settled & { held?: string };
      if (why !== undefined) held.push(why);
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
  /* HELD, NEVER DROPPED SILENTLY: one line a pass with the count and the governor's own sentence. */
  if (held.length > 0)
    log(`Slash held ${held.length === 1 ? 'one pattern' : `${held.length} patterns`} it noticed and asked you nothing: ${held[0]} The arrivals stay in the inbox.`);

  /* THE NOTES, AFTER THE JOBS AND ON WHAT THE MONTH STILL HAS: the understanding share, held under the work's. */
  if (inference.mentions && deps.store && meter.understand && registers && list && meetsList && propose) {
    const work = meter;
    const understand = meter.understand;
    const held: ModelJobMeter = { cap: understand.cap, spent: (since) => Math.max(understand.spent(since), understand.cap - (work.cap - work.spent(since))) };
    try {
      await serveNotes({ registers, list, meetsList, propose }, { mentions: inference.mentions, meter: held, store: deps.store, now: deps.now, log });
    } catch (e) {
      log(`notes: ${said(e)}`);
    }
  }
  return jobs.length >= MODEL_JOBS_PER_PASS;
}

/**
 * How many embedding calls the month has room for now: what the rest of the month has left once `EMBED_KEPT_SHARE` of it
 * is set aside for the prose and the pattern drafts, less what a pass has `leased` and not settled, and no more than the
 * embeddings' own month (`ModelJobMeter.of`). The pass leases `infer.embed` no further than this, and a search turns its
 * words into a vector only while it is above nought (`queryVector`), so the half-month rule holds for both.
 */
export function embedRoom(meter: ModelJobMeter, now: number, leased: BudgetSpent = {}): number {
  const month = monthOf(now, 0);
  const left = meter.cap - meter.spent(month);
  const rest = meter.rest ?? meter;
  const restLeft = rest === meter ? left : Math.min(left, rest.cap - rest.spent(month));
  const taken = BUDGET_ORDER.reduce((n, p) => n + Math.max(0, Math.floor(leased[p] ?? 0)), 0);
  const spare = restLeft - Math.ceil(rest.cap * EMBED_KEPT_SHARE) - taken;
  const own = meter.of?.('embed', leased);
  return own === undefined ? spare : Math.min(spare, own.cap - own.spent(month));
}

/* ── A search's words as a vector (ENG-B18) ───────────────────────────────────────────────────── */

/**
 * What a search by meaning is handed for its query: the vector, or why there is none. `off` is his switch, `spent` is
 * the month's room, `failed` is everything else, and the search is by words for all three. The same shape as
 * `MeaningAnswer` in `packages/record/src/near.ts`, written out here because this package imports no record source.
 */
export type QueryMeaning = { ok: true; vector: { model: string; dims: number; vec: Int8Array } } | { ok: false; why: 'off' | 'spent' | 'failed' };

/** How long a query's vector is kept: a day, so a search asked again today costs no call. */
export const QUERY_KEPT_MS = 86_400_000;
/** How many queries are kept at most; the oldest goes past this. */
export const QUERY_KEPT_MOST = 256;
/** The longest query sent, in characters after folding. Longer is not a search and is never sent. */
export const QUERY_CHARS_MOST = 500;

/** A query as it is kept and sent: spaces trimmed and collapsed, lower case, so the same words are one call. */
const foldQuery = (q: string): string => q.trim().replace(/\s+/gu, ' ').toLowerCase();

/**
 * The record's one guarded path from a search's words to a vector, or `undefined` where the host cannot embed.
 *
 * IN THIS ORDER, AND EACH STEP SENDS NOTHING WHEN IT SAYS NO: the query is folded, and empty or past `QUERY_CHARS_MOST`
 * is `failed`; his switch (`mayThink('embed')`, ENG-A09) off, or not readable, is `off`, even for a query kept from
 * before; a query asked within the day is answered from memory with no call and no ledger row; no room in the month (`embedRoom`) is `spent`; then one
 * call of one text, and one vector of the width it states is `ok` and is kept. The call goes through the host's
 * engine, which writes its ledger row, so `backgroundMeter` and the vital signs count it as an embedding.
 *
 * THE LOG NEVER HOLDS HIS WORDS: a refusal's fix or a thrown message, and a message that echoes the query is replaced.
 */
export function queryVector(deps: { embed: ModelJobEmbed['embed'] | undefined; meter: ModelJobMeter; now: () => number; reads?: Reads; log?: (line: string) => void }): ((q: string) => Promise<QueryMeaning>) | undefined {
  const { embed, meter } = deps;
  if (embed === undefined) return undefined;
  const log = deps.log ?? warn;
  const kept = new Map<string, { at: number; vector: { model: string; dims: number; vec: Int8Array } }>();
  const failed: QueryMeaning = { ok: false, why: 'failed' };
  /* HIS SWITCH IS SAID ONCE while it stays off, as the pass says it, and again after he turns it back on and off. */
  let saidOff = false;
  const unsaid = (line: string, q: string): string => (line.toLowerCase().includes(q) ? 'A search by meaning was not answered, so it was by words.' : line);
  return async (raw) => {
    const q = foldQuery(raw);
    if (q === '' || q.length > QUERY_CHARS_MOST) return failed;
    /* HIS SWITCH BEFORE THE KEPT VECTORS, so a query kept while it was on is not answered by meaning once it is off. */
    const may = await mayThink('embed', deps.reads);
    if (!may.ok) {
      if (!saidOff) log(`${fixOf(may)} The search was by words.`);
      saidOff = true;
      return { ok: false, why: 'off' };
    }
    saidOff = false;
    const now = deps.now();
    const hit = kept.get(q);
    if (hit !== undefined) {
      if (now - hit.at <= QUERY_KEPT_MS) return { ok: true, vector: hit.vector };
      kept.delete(q);
    }
    if (embedRoom(meter, now) <= 0) return { ok: false, why: 'spent' };
    let got: Result<ModelJobEmbeddings>;
    try {
      got = await embed([q]);
    } catch (e) {
      log(unsaid(said(e), q));
      return failed;
    }
    if (!got.ok) {
      log(unsaid(fixOf(got), q));
      return failed;
    }
    const { model, dims, vectors } = got.value;
    const vec = vectors[0];
    if (vectors.length !== 1 || vec === undefined || dims <= 0 || vec.length !== dims) return failed;
    const vector = { model, dims, vec };
    kept.set(q, { at: now, vector });
    while (kept.size > QUERY_KEPT_MOST) {
      const oldest = kept.keys().next().value;
      if (oldest === undefined) break;
      kept.delete(oldest);
    }
    return { ok: true, vector };
  };
}
