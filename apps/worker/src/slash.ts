/**
 * Slash on the Worker: the model hookup and the daily look (`docs/46` §5.9).
 *
 * TWO WAYS TO A MODEL, AND THE OWNER CHOOSES. The INCLUDED model (`includedInference` below): Workers AI through `AI`, which
 * spends the Cloudflare account's neurons and opens no key at all. And HIS OWN KEY: a provider (Anthropic's Messages or an
 * OpenAI-compatible endpoint), an https address on the public internet, a model name, and a key he picked from his keychain,
 * which Settings saves in Slash's own store and `@braindog/host/slash`'s `slashOwnKeyOf` reads back. The key is opened
 * through `KEK` on each call (`actions.ts` `keyOpener`, one `grant.read` event each time) and dropped when the call returns.
 * Which of the two answers is read on every ask, so a choice saved a second ago is the one the next ask goes to.
 *
 * `SLASH_ENDPOINT` IS NOT READ HERE ANY MORE. It named a deployment's own endpoint, asked with whatever key the keychain held
 * under the label `slash`, which on a hosted record was the person's key sent to an address the operator chose. His own
 * key replaces it: he names the address, he picks the key by its id, and no key is chosen by its label. The builders are `@braindog/host/slash`'s, the ones the self-host uses, so the two
 * hosts cannot drift.
 *
 * EVERY WIRE HERE THAT CARRIES A KEY REQUIRES IT. A key that will not open is a
 * `SlashKeyClosedError` before anything is sent, never a request with no key, because every address his key goes to is a
 * hosted provider on his own bill. `wireOf` sets it, and the own-key path in the host keeps it whatever a caller passes.
 *
 * NO `KEK`, NO OWN KEY. Unbound, no keychain key can be opened, so the settings door will not store one, and Slash is the
 * included model or nothing.
 *
 * THE INCLUDED MODEL IS SWITCHED ON BY `SLASH_INCLUDED`, NOT BY THE BINDING. `AI` is bound in both environments already
 * (`wrangler.jsonc`, since `src/inference.ts` was written) and `deploy.yml` deploys production on every green `ci`, so a
 * model keyed on the binding alone would have started spending the operator's account at the first deploy of the commit that built it.
 * Spending it is the operator's choice, so it takes a var.
 *
 * TWO FEATURES SHARE THE NAME AND THIS FILE BUILDS BOTH. `workerSlashModel` is the model behind the RECORD's Slash, which
 * proposes how a BrainDog is ARRANGED; `workerSlashEngine` is `@braindog/slash`, `docs/46`'s engine, which answers a typed
 * question about what is IN the record. `1f85a49a` settled that neither is a newer version of the other, and the app is where
 * the edge to the package belongs: `46 §5.1` has the host `import()` it once and only when there is a model to offer, so the
 * decision cannot live in `packages/host/src/slash.ts`, a module every host loads. Both read the owner's one choice, so the
 * press on Decide and a question at the palette go to the same model.
 *
 * AND `workerSlashDoor` IS THE THIRD NAME HERE, because a builder is not a caller: `index.ts` keeps a `#slash` field on
 * `Record$` and hands a request to `serveSlash` when `servesSlash` names the path.
 */

import {
  SLASH_ABOUT_ASK,
  SLASH_BRIEF_INSTRUCTIONS,
  SLASH_COMPOSE_INSTRUCTIONS,
  SLASH_INSTRUCTIONS,
  SLASH_KEY_GONE,
  SLASH_PLAN_INSTRUCTIONS,
  SLASH_WRITTEN_INSTRUCTIONS,
  SlashAnsweredError,
  SlashKeyClosedError,
  answerOf,
  slashDeepFor,
  slashDeepKeyOf,
  slashDeepTurn,
  slashGuardedEngine,
  slashOwnInference,
  slashOwnKeyFor,
  slashOwnKeyOf,
  slashOwnModel,
  slashRecord,
  slashSamplesOf,
  turnedAway,
  type SlashBriefModel,
  type SlashHostDeps,
  type SlashInference,
} from '@braindog/host/slash';
import type { OpenKey } from '@braindog/host/actions';
import { PURPOSES, routeFor, type Candidate, type RouteFacts } from '@braindog/host/infer';
import { SLASH_MENTIONS_INSTRUCTIONS, SLASH_RESOLVE_INSTRUCTIONS, type UnderstandModel } from '@braindog/host/understand';
import { slashAskDoor, slashDayStop, type SlashAskDoor } from '@braindog/host';
import type { SlashAnswer } from '@braindog/host/slash-answers';
import { no, ok, type Clock, type Refusal, type Result, type Sql } from '@braindog/ports';
import type { CallContext, RecordApi, SlashModel, TickBudget } from '@braindog/record';
import { PLANS, PLAN_TABLE, type Plan } from '@braindog/record/plans';
import type { Slash, SlashOptions } from '@braindog/slash';

import { keyOpener } from './actions.ts';
import { aiInference, scrubRaw, type AiBinding, type JsonSchema } from './inference.ts';
import { isBound, type KekBinding } from './keys.ts';

export type SlashEnv = {
  KEK?: KekBinding | undefined;
  /** Workers AI, and the gateway its calls go through (`inference.ts` `AiEnv`). */
  AI?: AiBinding | undefined;
  AI_GATEWAY?: string | undefined;
  /** The REST fallback for model calls: its run address, and the secret `WORKERS_AI_TOKEN` (`inference.ts` `runModel`). */
  AI_REST_URL?: string | undefined;
  WORKERS_AI_TOKEN?: string | undefined;
  /** `yes` to offer Slash's included model. Anything else, including unset, is off, and Slash answers only on his own key. */
  SLASH_INCLUDED?: string | undefined;
  /** The most one record's asks may spend of the included model in a UTC month, in neurons. See `INCLUDED_MONTH_NEURONS`. */
  SLASH_INCLUDED_MONTH_NEURONS?: string | undefined;
  /** `yes` where the operator said yes to the larger model's cost (HD.463). Unset, and today, the larger model is on no route. */
  SLASH_LARGE?: string | undefined;
  /** The operator's second provider (`includedCandidates`): its https address, its model, `openai` or `anthropic`. */
  SLASH_FALLBACK_URL?: string | undefined;
  SLASH_FALLBACK_MODEL?: string | undefined;
  SLASH_FALLBACK_PROVIDER?: string | undefined;
  /** And its key, a secret: read only to open the call, never logged, never on a row. */
  SLASH_FALLBACK_KEY?: string | undefined;
};

/* ── the included model ───────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The most one included call may spend, in neurons, checked by `aiInference` BEFORE the call against its worst case.
 *
 * THE NUMBER IS HIS TO CHANGE, and this is the default. One
 * conversational turn on `glm-5.3-flash`, 12,000 tokens in and 1,500 out, is 231.8 neurons or $0.00255 (`inference.ts`,
 * the rate table's comment). 2,500 is about ten and a half such turns, and 2,500 × $0.011 / 1,000 is $0.0275 at most.
 *
 * IT STOPS A RUNAWAY AND NOTHING ELSE, AND ONLY ON THE ENGINE'S CALLS NOW. The package caps its own prompts at 12,000 tokens
 * in and 2,048 out, 256.7 neurons at the most, so no package call comes near it; the package's monthly `ask_cap` is what
 * bounds those. It was once the whole bound on the record's own `draft` too, whose reading has no cap of its own, and that
 * let a press on a large record spend more than the one ask the ceiling counted it as. The record's asks are held to `worstAsk` instead (`includedModel`).
 */
export const INCLUDED_NEURONS_PER_CALL = 2_500;

/**
 * The most one record's Slash asks may spend of the included model in a UTC month, in neurons, where
 * `SLASH_INCLUDED_MONTH_NEURONS` does not say otherwise. The var is the operator's; `ask_cap` is the record owner's and
 * can only lower what this allows (`operatorCeiling` below).
 *
 * WHY A CEILING OF THE OPERATOR'S AT ALL. Once `4e701b15`
 * switched the included model on, the only monthly bound on the operator's neurons was `ask_cap`, which any record owner
 * types, with no upper limit. A probe saved `ask_cap: 1_000_000_000` through the door and 200 reads all reached the
 * binding, and 100,000 proposes from one owner with a cookie came to about $283.
 *
 * WHY 300,000. At $0.011 a thousand neurons that is about $3.30 a record a month (down
 * from 900,000 and about $9.90), the same number `wrangler.jsonc` sets in both environments, so an unset or mistyped var
 * falls back to the ceiling the operator chose. The package's own caps put the default month (80 asks) at about 20,600
 * neurons at the very worst, some $0.23, so this is some fourteen times what an owner who never touches the setting
 * could spend, and room for one who raises it to use Slash most days. It is counted in asks at the package's worst
 * call, 232 neurons (`worstAsk`), which is 1,293 asks, so the bound holds whatever mix of
 * reads, proposes, presses and first plans spends it; a read's worst is 25.5, so in practice a month at the ceiling costs
 * far less. The press and the first plan hold to it only because `includedModel` refuses either past 232 before sending:
 * their input is the record's and has no `capIn`, and at 300 lists a press's worst case was 272.
 *
 * IT IS PER RECORD AND NOT PER ACCOUNT. Each record's ledger is in its own Durable Object, and no count here sees another
 * record's. A thousand records at the ceiling is about $3,300; bounding the account needs a counter every record shares,
 * which this file has not got.
 */
export const INCLUDED_MONTH_NEURONS = 300_000;

/**
 * `SLASH_INCLUDED_MONTH_NEURONS` read whole, or the default.
 *
 * A VALUE THAT IS NOT A WHOLE COUNT IS THE DEFAULT AND NEVER "NO CEILING". `Number('')` is 0 and `Number('1e9')` is a
 * billion, so the var is held to digits: an empty or mistyped var costs the operator the default, which is a number he
 * chose, rather than switching Slash off or lifting the bound. `0` is a count, and turns every ask away.
 */
export const includedMonthNeurons = (env: SlashEnv): number => {
  const v = env.SLASH_INCLUDED_MONTH_NEURONS?.trim();
  return v !== undefined && /^[0-9]+$/u.test(v) ? Number(v) : INCLUDED_MONTH_NEURONS;
};

/** The routing name the record's own asks go by: every template of the package asks the same (`prompts.ts`). */
const INCLUDED_MODEL = 'glm-5.3-flash';

/** The record's `draft` and `form` send no `max_tokens` on the endpoint path; here one is needed, and this is the package's largest. */
const RECORD_TOKENS = 2_048;

/* THE SCHEMAS THE RECORD'S TWO ASKS ANSWER, TOP LEVEL ONLY, because `aiInference` checks the top level and the record checks
   the rest (`fromModel`, `formedRows`). Whether `glm-5.3-flash` honours an open object under `strict: true` was not measured
   here: no test spends a neuron, so the first alpha answer after the switch is the measurement. */
const DRAFTS: JsonSchema = { type: 'object', properties: { drafts: { type: 'array', items: { type: 'object' } } }, required: ['drafts'] };
const PLAN: JsonSchema = { type: 'object', properties: { plan: { type: 'object' } }, required: ['plan'] };
/* A PAGE'S WHOLE LOOK, keyed by the page's id: the bare line, or every part `lookAnswerOf` in
   `packages/record/src/compose-look.ts` reads, `{ headline, lead, order, hide, next, group }`, and nothing it does not.
   `LINES` once declared `lines` alone, so a model holding to the schema had nowhere to put a lead, a hide or a next, and
   Today on the Cloud was never arranged as a self-host's is. Each part is still checked by the record (`headlineFault`,
   `leadFault`, `hideFault`, `nextFault`, `orderFault`, `groupFault`): this says what may come back, never that it holds. */
const LOOK_PAGE: JsonSchema = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    lead: { type: 'string' },
    order: { type: 'array', items: { type: 'string' } },
    hide: { type: 'array', items: { type: 'string' } },
    next: { type: 'object', properties: { row: { type: 'string' }, text: { type: 'string' } }, required: ['row', 'text'] },
    group: { type: 'object', additionalProperties: { type: 'string' } },
  },
  additionalProperties: false,
};
export const LOOK: JsonSchema = {
  type: 'object',
  properties: { lines: { type: 'object', additionalProperties: { anyOf: [{ type: 'string' }, LOOK_PAGE] } } },
  required: ['lines'],
};
/* The briefing: the cards Today opens on, each a handle it was handed and one line. Each card is checked by the record
   (`briefFault`), which keeps only the handles it handed out. */
const WRITTEN: JsonSchema = { type: 'object', properties: { sentences: { type: 'array', items: { type: 'string' } } }, required: ['sentences'] };
const CARDS: JsonSchema = { type: 'object', properties: { cards: { type: 'array', items: { type: 'object' } } }, required: ['cards'] };
/* Who is who: a number for each doubtful pair, keyed by the pair's handle, and the names read in the night's notes. Each
   is checked by `@braindog/host/understand` (`settleResolve`, `mentionsKept`), which keeps only what it handed out. */
const VERDICTS: JsonSchema = { type: 'object', properties: { verdicts: { type: 'object' } }, required: ['verdicts'] };
const MENTIONS: JsonSchema = { type: 'object', properties: { mentions: { type: 'array', items: { type: 'object' } } }, required: ['mentions'] };
/* Who and what a job of things is about: the names, and for an arrival its triage and the quotes of its fields. Each is
   checked by `@braindog/host`'s `aboutKept`, which keeps only the handles it handed and the text's own words. */
const ABOUT: JsonSchema = {
  type: 'object',
  properties: {
    about: { type: 'array', items: { type: 'object' } },
    triage: { type: 'array', items: { type: 'object' } },
    fields: { type: 'array', items: { type: 'object' } },
  },
  required: ['about'],
};

/**
 * One call to a model that did not answer, for the operator: what `index.ts` writes as an `op: 'model'` line
 * and mails as "BrainDog model".
 *
 * `why` IS THE PORT'S PHRASE, or `schema` for an answer that broke the JSON it was pinned to; `raw` is the provider's own
 * sentence, scrubbed and cut (`scrubRaw`), and `''` where nothing was thrown. `provider` is the id the binding was asked
 * for, `''` where nothing was sent. `streak` counts schema breaks in a row on this model (0 for every other failure), so
 * the hook can let one bad reply pass and mail the third. `whose: 'owner'` is a call on the owner's own key: his
 * provider's bill and his provider's fault, logged and never mailed to the operator.
 *
 * A BUDGET REFUSAL IS NOT A FAILURE AND NEVER REACHES THIS: the ceiling said no before anything was sent, which is the
 * ceiling working.
 */
export type ModelFail = {
  model: string;
  provider: string;
  why: string;
  raw: string;
  sent: boolean;
  whose: 'operator' | 'owner';
  streak: number;
};

/** Where a failed call is told. Never throws into the call: a hook that failed is a log line lost, not an ask lost. */
export type OnModelFail = (fail: ModelFail) => void;

const told = (onFail: OnModelFail | undefined, fail: ModelFail): void => {
  try {
    onFail?.(fail);
  } catch {
    /* See `OnModelFail`. */
  }
};

/** The port's phrase out of its sentence, so the line carries the three words a query can group by. */
const phraseOf = (fix: string): string =>
  /no adapter on this host|the provider does not serve it|the provider did not answer/u.exec(fix)?.[0] ?? 'the provider did not answer';

/** Nothing reached the binding, which the package reads by this mark and not by the class, as it reads `SlashKeyClosedError`'s. */
class NotSent extends Error {
  readonly sent = false;
  readonly why: string;
  readonly raw: string;
  constructor(message: string, why = message, raw = '') {
    super(message);
    this.why = why;
    this.raw = raw;
  }
}

/**
 * The binding was called and threw: a call the platform may have billed, which the package reads by this mark.
 *
 * IT WAS ONCE A PLAIN `Error`, and the package read a plain throw two ways.
 * A probe put one `AI.run` that threw through both paths: a read kept `glm-5.3-flash`, priced the prompt estimate at
 * 9 neurons and counted the ask, and an automation's answer settled it under `-`, priced 0, uncounted, and was asked
 * again up to the ladder's eighth rung. With the mark both settle it under the model's name, priced and counted.
 * `model` is the routing name, for the reason `includedInference` gives.
 */
class Reached extends Error {
  readonly reached = true;
  readonly model: string;
  readonly why: string;
  readonly raw: string;
  constructor(message: string, model: string, why = message, raw = '') {
    super(message);
    this.model = model;
    this.why = why;
    this.raw = raw;
  }
}

const counted = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.ceil(v) : 0);

/**
 * `aiInference` as the package's `SlashInference`, or nothing where the included model is off.
 *
 * THE PORTS DIFFER IN THREE WAYS AND THIS IS THE WHOLE ADAPTER: `jsonSchema` is `schema`, a budget is added, and a refusal
 * becomes a throw, because the package reads every throw as a model not reached and marks tell it otherwise.
 *
 * - NO RUN, NO SEND: the ceiling, or a routing name the adapter's table does not carry. `sent: false` lets `answer` release
 *   its hold and write no ledger row.
 * - A RUN AND A BAD ANSWER, `PROPOSAL_SCHEMA`: the platform billed it, so it is `SlashAnsweredError` with the counts the
 *   binding reported. `aiInference` drops them from its refusal, so a wrapped binding, built fresh for each call so two asks
 *   in flight cannot cross, keeps the last answer to read them off.
 * - A BINDING THAT THREW is `Reached`: `UNREACHABLE`, which the ladder asks again, but settled under the model's name,
 *   priced on the prompt estimate and counted as an ask, on a read and on an automation's answer alike.
 *
 * `most` IS THE LARGEST WORST CASE ONE CALL MAY HAVE, read when the call is made. The engine's calls keep the runaway guard,
 * `INCLUDED_NEURONS_PER_CALL`; the record's own asks pass the call the operator's ceiling counts them as (`includedModel`).
 *
 * `model` IN THE REPLY IS THE ROUTING NAME, NOT THE PROVIDER ID `aiInference` answers. The package prices a row by its name
 * in `MODELS`, which holds `glm-5.3-flash` and not `@cf/zai-org/glm-5.3-flash`: handing the id through billed every row 0
 * neurons, measured in `test/slash-included.test.ts`'s door case.
 */
export function includedInference(
  env: SlashEnv,
  most: () => number | Promise<number> = () => INCLUDED_NEURONS_PER_CALL,
  onFail?: OnModelFail,
): SlashInference | undefined {
  const ai = env.AI;
  if (ai === undefined || env.SLASH_INCLUDED !== 'yes') return undefined;
  /* SCHEMA BREAKS IN A ROW, over every call this adapter makes: an answer that keeps its schema starts it over. */
  let streak = 0;
  /* ONE CALL, WHOLE OR STREAMED (`onText`), and every failure after it read the same way. A streamed answer's counts are
     the stream's own (`onUsage`), so a reply that then breaks its schema is billed what was read. */
  const once = async (call: Parameters<SlashInference['complete']>[0], onText?: (text: string) => void): Promise<Awaited<ReturnType<SlashInference['complete']>>> => {
    let last: unknown;
    let ran = false;
    let provider = '';
    let streamed: { in: number; out: number } | undefined;
    const port = aiInference({
      AI: { run: async (model, inputs, options) => ((ran = true), (provider = model), (last = await ai.run(model, inputs, options))) },
      AI_GATEWAY: env.AI_GATEWAY,
      AI_REST_URL: env.AI_REST_URL,
      WORKERS_AI_TOKEN: env.WORKERS_AI_TOKEN,
    });
    const req = {
      model: call.model,
      messages: call.messages,
      maxTokens: call.maxTokens,
      schema: call.jsonSchema as JsonSchema,
      budget: { neurons: await most() },
    };
    const out =
      onText === undefined
        ? await port.complete(req)
        : await port.stream(req, onText, (usage) => {
            streamed = { in: usage.in, out: usage.out };
          });
    if (out.ok) {
      streak = 0;
      return { text: out.value.text, usage: { in: out.value.usage.in, out: out.value.usage.out }, model: call.model };
    }
    const refusal = 'refusal' in out ? out.refusal : undefined;
    const fix = refusal?.fix ?? 'The included model did not answer.';
    const raw = refusal?.detail ?? '';
    /* THE CEILING SAYING NO IS NOT A MODEL THAT FAILED, so the hook hears every refusal but that one. */
    const budget = refusal?.code === 'SLASH_BUDGET_SPENT';
    if (!ran) {
      if (!budget) told(onFail, { model: call.model, provider: '', why: phraseOf(fix), raw, sent: false, whose: 'operator', streak: 0 });
      /* THE CEILING'S NO CARRIES ITS CODE, so a route's walk stops here: every candidate after it hears the same no. */
      throw Object.assign(new NotSent(fix, budget ? fix : phraseOf(fix), raw), budget ? { code: 'SLASH_BUDGET_SPENT' } : {});
    }
    if (refusal?.code === 'PROPOSAL_SCHEMA') {
      streak += 1;
      told(onFail, { model: call.model, provider, why: 'schema', raw: scrubRaw(fix), sent: true, whose: 'operator', streak });
      const usage = (last as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } } | null)?.usage;
      throw new SlashAnsweredError(fix, streamed ?? { in: counted(usage?.prompt_tokens), out: counted(usage?.completion_tokens) }, call.model);
    }
    streak = 0;
    told(onFail, { model: call.model, provider, why: phraseOf(fix), raw, sent: true, whose: 'operator', streak: 0 });
    throw new Reached(fix, call.model, phraseOf(fix), raw);
  };
  return {
    ...embedOver(env),
    complete: (call) => once(call),
    stream: (call, onText) => once(call, onText),
  };
}

/**
 * The engine's embedding call, over `aiInference`'s own `embed` on the `AI` binding, wherever that binding is bound: on
 * the included engine and on the one for his own key alike, since the binding is the Worker's and not his model's. So
 * every embedding on the Cloud goes through `embedTexts` (`packages/slash/src/jobs.ts`), which writes its `slash_call` row
 * of kind `embed`, and `backgroundMeter`, the half-month rule and the vital signs count it.
 *
 * A REFUSAL IS THROWN AS ITS FIX, MARKED NOT REACHED (`NotSent`), so the package settles the row under `-` and spends
 * nobody's month on a call no vector came back from. No binding, no `embed`, and the package refuses in words.
 */
function embedOver(env: SlashEnv): Pick<SlashInference, 'embed'> {
  if (env.AI === undefined) return {};
  return {
    embed: async (texts) => {
      const got = await aiInference(env).embed(texts);
      if (got.ok) return { model: got.value.model, dims: got.value.dims, vectors: got.value.vectors, usage: { in: got.value.usage.in, out: got.value.usage.out } };
      const fix = 'refusal' in got ? got.refusal.fix : 'The embedding model did not answer.';
      throw new NotSent(fix, phraseOf(fix));
    },
  };
}

/**
 * The record's model on this Worker: its press, first plan and headlines, the two asks of who is who, and the briefing.
 *
 * `brief` IS OPTIONAL ON THE TYPE AS `headline` IS, because the owner's own model is whatever the host's adapter for his
 * provider can write. Both models this file builds have it.
 */
export type WorkerSlashModel = SlashModel & UnderstandModel & Partial<SlashBriefModel>;

/**
 * The record's own Slash over the included model: `endpointModel`'s draft, first plan and page headlines, the same
 * instructions and the same input, read by the same `answerOf`. Every failure is a throw, which the record reads as "the
 * rules speak".
 *
 * EACH ASK IS HELD TO THE ONE CALL THE OPERATOR'S CEILING COUNTS IT AS, `worstAsk`, AND NOT TO `INCLUDED_NEURONS_PER_CALL`.
 * The record's meter writes one `slash_call` row a press, and `operatorCeiling` turns the month's neurons into asks at 232 each,
 * so a press that may spend more than 232 spends past the ceiling. The package's templates never do, because each trims
 * its input to `capIn`; the press's input is the record's own reading, which has no cap and grows with the record.
 * It was measured at 300 lists: 52,310 bytes, a worst case of 272
 * neurons, and 274 through the bundle with the instructions counted (`test/slash-ceiling-all.test.ts`). Checked here,
 * by `aiInference`'s own worst case and before the call, a press past it is never sent: the record releases its hold,
 * writes no row, and its rules draft. A record of 150 lists is 186 and is still asked. The package is imported only
 * when the record's model is asked, by which time the meter has imported it already (`slash-meter.ts`).
 */
export function includedModel(env: SlashEnv, onFail?: OnModelFail): WorkerSlashModel | undefined {
  const inference = includedInference(env, recordAskMost, onFail);
  if (inference === undefined) return undefined;
  const ask = async (instructions: string, input: unknown, schema: JsonSchema): Promise<unknown> => {
    const reply = await inference.complete({
      model: INCLUDED_MODEL,
      maxTokens: RECORD_TOKENS,
      jsonSchema: schema,
      messages: [
        { role: 'system', content: instructions },
        { role: 'user', content: JSON.stringify(input) },
      ],
    });
    return answerOf(reply.text);
  };
  return {
    name: 'included',
    draft: (input) => ask(SLASH_INSTRUCTIONS, input, DRAFTS),
    form: (input) => ask(SLASH_PLAN_INSTRUCTIONS, input, PLAN),
    /* THE PAGES' LOOKS, under the instructions' own name: the line and how each page is arranged, in one ask. */
    headline: (input) => ask(SLASH_COMPOSE_INSTRUCTIONS, input, LOOK),
    /* THE BRIEFING, held to the same worst ask as the rest: a background ask, and never one of his. */
    brief: (input) => ask(SLASH_BRIEF_INSTRUCTIONS, input, CARDS),
    /* THE WRITTEN BRIEF, the same background ask: a few sentences, rewritten when the rows it reads change. */
    written: (input) => ask(SLASH_WRITTEN_INSTRUCTIONS, input, WRITTEN),
    resolve: (input) => ask(SLASH_RESOLVE_INSTRUCTIONS, input, VERDICTS),
    mentions: (input) => ask(SLASH_MENTIONS_INSTRUCTIONS, input, MENTIONS),
    /* WHO AND WHAT A THING IS ABOUT, the same background ask under the same worst-ask bound. */
    about: (input) => ask(SLASH_ABOUT_ASK, input, ABOUT),
  };
}

/**
 * The Kennel's pre-review note over the included model (`kennel.ts` `noted`), or `undefined` where there is none. One ask,
 * a short answer, the same JSON reading as the record's asks. Nobody's record and nobody's allowance: the Kennel asks it
 * for the operator, at most once a submission, under the submission limits.
 */
export function kennelNoteModel(env: SlashEnv): ((instructions: string, input: unknown) => Promise<unknown>) | undefined {
  const inference = includedInference(env);
  if (inference === undefined) return undefined;
  return async (instructions, input) => {
    const reply = await inference.complete({
      model: INCLUDED_MODEL,
      maxTokens: 600,
      jsonSchema: { type: 'object', properties: { note: { type: 'string' } }, required: ['note'], additionalProperties: false },
      messages: [
        { role: 'system', content: instructions },
        { role: 'user', content: JSON.stringify(input) },
      ],
    });
    return answerOf(reply.text);
  };
}

/**
 * How a request leaves this Worker and how a sealed key is opened. Both are injected so a test needs no network and no KEK.
 *
 * `open` TAKES THE ASKER'S ID SO A TEST-INJECTED OPENER STILL SIGNS AS THEM: `wireOf` passes its own `actor` through to
 * whichever opener is in play, the real one or a test's stand-in, so `keyOpener`'s default of `system` is only ever what a
 * caller with nobody asking gets.
 */
export type SlashWire = {
  send?: ((input: URL, init: RequestInit) => Promise<Response>) | undefined;
  open?: ((api: Pick<RecordApi, 'kernel'>, actor?: string) => OpenKey | null) | undefined;
  /**
   * Slash's own store, where the owner's choice of model is kept, for the record's own model to read on each press.
   *
   * NAMED `store` AND NOT `sql` because `SlashEngineDeps` below adds its own `sql`, and one name for two meanings in one
   * type would be a store handed where a thunk was asked for. A thunk because `index.ts` builds the record's model before
   * the object's storage is wrapped. Absent, the record's model is the included one alone.
   */
  store?: (() => Sql) | undefined;
  /**
   * Where a model that did not answer is told (`ModelFail`): the Worker's log line and the operator's mail, `index.ts`'s.
   * Absent, a failure is the throw alone, as it always was.
   */
  onFail?: OnModelFail | undefined;
};

/**
 * The deps every call on his own key is built from. Written once because the key discipline is the part that must not be copied.
 *
 * `keyRequired` IS ALWAYS SET: every model this Worker reaches with a key is a hosted provider
 * on his own bill, so a key that will not open is a `SlashKeyClosedError` before anything is sent.
 *
 * `actor` SIGNS EVERY `grant.read` THIS WIRE OPENS, AND `system` IS RIGHT ONLY WHERE NOBODY ASKED: the record's own press
 * reaches its model with no context, so it passes none and `keyOpener`'s own default stands. The door has an asker and
 * passes their id through `slashOwnKeyFor`, and an automation's question passes `rule:<id>`.
 */
const wireOf = (env: SlashEnv, api: () => Pick<RecordApi, 'kernel'>, options: SlashWire, actor?: string): SlashHostDeps => {
  const opener = options.open ?? ((a: Pick<RecordApi, 'kernel'>, who?: string) => keyOpener(a, env.KEK, who));
  return {
    grants: () => api().kernel.grants(),
    openKey: isBound(env.KEK) ? async (grant) => (opener(api(), actor) ?? (async () => null))(grant) : null,
    send: options.send ?? ((input, init) => fetch(input, init)),
    keyRequired: true,
  };
};

/**
 * The owner's own model, each ask told to `onFail` when it throws, with `whose: 'owner'`, and the throw passed on as it was.
 *
 * HIS KEY, HIS PROVIDER: the line is written so the operator can see the record's model is down, and the hook in
 * `index.ts` mails nothing for it, because nothing the operator does mends somebody else's account.
 */
const ownTold = (model: WorkerSlashModel, key: { provider: string; model: string }, onFail: OnModelFail | undefined): WorkerSlashModel => {
  if (onFail === undefined) return model;
  const wrap =
    <I, O>(ask: (input: I) => Promise<O>) =>
    async (input: I): Promise<O> => {
      try {
        return await ask(input);
      } catch (e) {
        const said = e instanceof Error ? e.message : String(e);
        const sent = !(typeof e === 'object' && e !== null && (e as { sent?: unknown }).sent === false);
        told(onFail, { model: key.model, provider: key.provider, why: 'your key did not answer', raw: scrubRaw(said), sent, whose: 'owner', streak: 0 });
        throw e;
      }
    };
  return {
    ...model,
    name: model.name,
    draft: wrap(model.draft.bind(model)),
    resolve: wrap(model.resolve.bind(model)),
    mentions: wrap(model.mentions.bind(model)),
    ...(model.about ? { about: wrap(model.about.bind(model)) } : {}),
    ...(model.form ? { form: wrap(model.form.bind(model)) } : {}),
    ...(model.skill ? { skill: wrap(model.skill.bind(model)) } : {}),
    ...(model.headline ? { headline: wrap(model.headline.bind(model)) } : {}),
    ...(model.brief ? { brief: wrap(model.brief.bind(model)) } : {}),
  };
};

/** Where Slash on this Worker has nothing to answer with: no included model, and no key of his chosen. */
const NO_MODEL_HERE = 'Slash answers on your own key on this host, and none is chosen yet. Pick your key in Settings.';

/**
 * The record's own Slash, the arranger's press and first plan, on whichever model the owner chose, or nothing at all.
 *
 * THE CHOICE IS READ ON EACH ASK, not when the object opens: a save in Settings reaches the next press without a restart,
 * and the press and a question at the palette go to the same model. His key where he chose it, the included model
 * otherwise, and a throw the record reads as "the rules speak" where neither is there.
 *
 * `undefined` ONLY WHERE NEITHER COULD EVER ANSWER: the included model off and no `KEK` to open a key with, or no store
 * handed in to read a choice from. That is what `/api/version`'s `slash` reads, so a Worker that can open a key says it
 * has Slash, and Settings is where it is set up.
 */
export function workerSlashModel(env: SlashEnv, api: () => Pick<RecordApi, 'kernel'>, options: SlashWire = {}): WorkerSlashModel | undefined {
  const included = includedModel(env, options.onFail);
  const store = options.store;
  /* EVERY LOOK ASK IS HEARD (`heardBy`), on either path, so a look that fails says why in Health (`slashLook`). */
  if (store === undefined || !isBound(env.KEK)) return included === undefined ? undefined : heardBy(included, api, store);
  const own = () => slashOwnKeyOf(store());
  const chosen = (): WorkerSlashModel => {
    const key = own();
    if (key === null) {
      if (included === undefined) throw new NotSent(NO_MODEL_HERE);
      return included;
    }
    const model = slashOwnModel(key, wireOf(env, api, options));
    if (model === undefined) throw new NotSent(SLASH_KEY_GONE.fix);
    return ownTold(model, key, options.onFail);
  };
  return heardBy({
    /* READ ON EACH ASK AS THE REST IS, because the record names who drafted by it and treats `included` as the one model
       whose refusal before sending means the record was too large to ask about. */
    get name() {
      if (own() !== null) return 'your key';
      return included?.name ?? 'none';
    },
    draft: async (input) => chosen().draft(input),
    form: async (input) => {
      const model = chosen();
      if (model.form === undefined) throw new NotSent('The model Slash answers with here drafts no first plan.');
      return model.form(input);
    },
    /* THE DAILY LOOK'S SKILL STEP, through the same model choice as `form`: the included model or the
       record's own key, whichever `chosen()` says is asking today. */
    skill: async (input) => {
      const model = chosen();
      if (model.skill === undefined) throw new NotSent('The model Slash answers with here drafts no skill.');
      return model.skill(input);
    },
    /* THE PAGE HEADLINES, the daily look's other background ask, through the same choice: a model that writes none is
       never sent, and each page keeps its rules line. */
    headline: async (input) => {
      const model = chosen();
      if (model.headline === undefined) throw new NotSent('The model Slash answers with here writes no headlines.');
      return model.headline(input);
    },
    /* THE BRIEFING, Today's cards, through the same choice: a model that writes none is never sent, and the rules
       write the cards as they did. */
    brief: async (input) => {
      const model = chosen();
      if (model.brief === undefined) throw new NotSent('The model Slash answers with here writes no briefing.');
      return model.brief(input);
    },
    /* AND THE WRITTEN BRIEF, through the same choice: a model that writes none is never sent, and the cards stand. */
    written: async (input) => {
      const model = chosen();
      if (model.written === undefined) throw new NotSent('The model Slash answers with here writes no brief.');
      return model.written(input);
    },
    /* WHO IS WHO, the model-jobs pass's two asks, through the same choice: the doubtful pairs and the night's notes. */
    resolve: async (input) => chosen().resolve(input),
    mentions: async (input) => chosen().mentions(input),
    /* WHO AND WHAT A THING IS ABOUT, through the same choice: a model that reads none is never sent, and the rules keep
       the key hits alone. */
    about: async (input) => {
      const model = chosen();
      if (model.about === undefined) throw new NotSent('The model Slash answers with here reads nothing for who it is about.');
      return model.about(input);
    },
  }, api, store);
}

export type SlashEngineDeps = SlashWire & {
  /**
   * Slash's OWN SQLite, and the caller's to supply.
   *
   * IT IS NOT THE RECORD'S DATABASE (`46 §2`), and it is a parameter here rather than a line reading `this.ctx.storage`
   * because `docs/46` puts the engine in its own Durable Object (`apps/worker/src/do/slash.ts`, `idFromName(rec_id)`), which
   * has its own storage and its own `wrangler.jsonc` binding. The caller decides which storage Slash's `slash_settings` and
   * `slash_call` tables are created in, and this file neither knows nor guesses. Today it is the record object's own, which
   * is why the tables carry Slash's name.
   */
  sql: Sql;
  clock: Clock;
  /**
   * The plan the Directory meters this record under (`free`, `hosted`, `plus`), asked once when the engine is built, or
   * `null` where it could not be asked. Free's asks follow from it (`slashPlanMoved`); absent is a host with no plans.
   */
  plan?: (() => Promise<string | null>) | undefined;
};

/**
 * The tiers Slash runs on the Cloud: `a`, the included model, and `b`, his own key. Not `byo`.
 *
 * `byo` NAMES NO ADDRESS OF THE OWNER'S, only a model name for a host's own model, and a Worker has no model of its own
 * but the included one. On the included model the name went to Workers AI's own table, which answered "no adapter on this
 * host" on every pass 2 (`src/inference.ts`), while the host still counted each ask against the cap Settings said `byo`
 * did not have. So on every Worker the package refuses to store it, reads a record already saved on it as the included
 * model, and the guard counts it the same way. Settings offers "Included" and "Your own key" and nothing else: the
 * Cloud's two sources.
 */
export const CLOUD_TIERS = ['a', 'b'] as const;

/* ── the route ─────────────────────────────────────────────────────────────────────────────────────────── */

/** The included model's two rows (`inference.ts` `MODELS`), as the router names them. Tier `a`: the operator's account. */
const FLASH: Candidate = { id: 'flash', model: INCLUDED_MODEL, tier: 'a', source: 'included' };
const SMALL: Candidate = { id: 'small', model: 'llama-3.2-1b', tier: 'a', source: 'included' };

/** The operator's second provider as its four settings say it, or `null` while any one of them is missing. */
const fallbackOf = (env: SlashEnv): { url: string; model: string; provider: 'openai' | 'anthropic' } | null => {
  const url = env.SLASH_FALLBACK_URL?.trim() ?? '';
  const model = env.SLASH_FALLBACK_MODEL?.trim() ?? '';
  const provider = env.SLASH_FALLBACK_PROVIDER?.trim() ?? '';
  if (url === '' || model === '' || (env.SLASH_FALLBACK_KEY ?? '') === '') return null;
  return provider === 'openai' || provider === 'anthropic' ? { url, model, provider } : null;
};

/**
 * What the Cloud may try for an ask on the included model, in `routeFor`'s terms, or `undefined` where that model is off.
 *
 * "RULES ARE THE FALLBACK, NOT THE ENGINE". When the included model fails, the next model the operator set is
 * asked before the rules speak. The table has two rows and no second chat row: which model would be second is the model
 * checks' to choose (`tools/model-checks/run.mjs --routes`), so today the answering route is flash alone, and the operator's
 * provider after it once he sets all four of its settings.
 *
 * THE LARGER MODEL STAYS OFF. `large` carries the operator's yes (`SLASH_LARGE`), and the table holds no large row, so even a yes
 * names none: the row is added beside the model checks that price it, never here.
 *
 * HIS OWN KEY IS NOT ON IT. A record set to his key is a route of one in the package (`core.run` walks nothing on tier
 * `b`), so a question for his provider never falls to the included model or to the operator's.
 */
export function includedCandidates(env: SlashEnv): RouteFacts | undefined {
  if (env.AI === undefined || env.SLASH_INCLUDED !== 'yes') return undefined;
  const second = fallbackOf(env);
  return {
    form: 'included',
    models: {
      flash: FLASH,
      small: SMALL,
      ...(second === null ? {} : { provider: { id: 'provider', model: second.model, tier: 'a', source: 'included' } satisfies Candidate }),
    },
    large: env.SLASH_LARGE === 'yes',
    machine: false,
  };
}

/** The handle the operator's key goes by inside the keyed wire. It names no keychain row: the key is the Worker's secret. */
const FALLBACK_GRANT = 'operator.fallback';

/**
 * The operator's second provider on the keyed wire his own key uses (`slashOwnInference`), or `undefined` where it is not
 * set or its address is not an https address on the public internet.
 *
 * THE KEY IS OPENED ON EACH CALL AND HELD NOWHERE ELSE: `openKey` reads the secret when the call is made, and the wire
 * requires it, so an empty secret is a call never sent and never a request with no key.
 */
export function fallbackWire(env: SlashEnv, send?: SlashWire['send']): SlashInference | undefined {
  const second = fallbackOf(env);
  if (second === null) return undefined;
  return slashOwnInference(
    { provider: second.provider, base_url: second.url, model: second.model, grant_id: FALLBACK_GRANT },
    {
      grants: () => [{ id: FALLBACK_GRANT, label: 'operator fallback', revoked_at: null }],
      openKey: async () => env.SLASH_FALLBACK_KEY || null,
      send: send ?? ((input, init) => fetch(input, init)),
      keyRequired: true,
    },
  );
}

/**
 * The route `createSlash` walks, built from `includedCandidates`, or `undefined` where there are no facts: then every ask
 * is the one call it always was. A candidate on the operator's provider carries its own wire; the rest are asked on the
 * engine's own adapter, the included model.
 */
export function includedRoute(env: SlashEnv, send?: SlashWire['send']): SlashOptions['route'] {
  const facts = includedCandidates(env);
  if (facts === undefined) return undefined;
  const wire = facts.models.provider === undefined ? undefined : fallbackWire(env, send);
  return (purpose) =>
    routeFor(purpose, facts).candidates.flatMap((c) =>
      c.id !== 'provider' ? [{ id: c.id, model: c.model }] : wire === undefined ? [] : [{ id: c.id, model: c.model, inference: wire }],
    );
}

/**
 * `@braindog/slash` over the included model or his own key, and this record's guarded reads, or nothing at all.
 *
 * THE IMPORT IS DYNAMIC AND THE REFUSAL COMES FIRST, in that order, which is the whole of `46 §5.1`: a Worker with neither
 * the included model switched on nor a `KEK` to open a key with never evaluates the module, so the bundle a keyless
 * deployment serves does not carry it and the keyless e2e row stays byte-identical. Reversing those two lines would keep the feature working and lose
 * the property the loading rule exists for.
 *
 * HIS KEY IS NOT THE ENGINE'S OWN MODEL. The door opens it for each asker and hands it to both passes (`slashOwnKeyFor`),
 * and an automation's question is handed it the same way (`workerSlashAnswers`), so the engine's own is the included
 * model, or, where that is off, a model that sends nothing and says so (`ownOnly`).
 *
 * `slashRecord` IS THE BRIDGE AND NOT THE RECORD'S OWN `project`, which does not exist yet: it composes the projection out of
 * `boot`, `schema`, `list`, `search` and `get`, so every read runs under the asker's own level and scoping. When the record
 * grows `project`, the bridge goes and the record's stub is passed instead.
 *
 * `api()` IS RESOLVED HERE AND NOT PER CALL because the engine is built on the first ask and not at boot, which is when the
 * Durable Object's record already exists. The two-argument `() => api` shape is kept so the caller can pass the same thunk it
 * passes `workerSlashModel`, which is assigned after this module's own `#open` has begun.
 */
export async function workerSlashEngine(env: SlashEnv, api: () => RecordApi, deps: SlashEngineDeps): Promise<Slash | undefined> {
  const included = includedInference(env, undefined, deps.onFail);
  const inference = included ?? (isBound(env.KEK) ? { ...ownOnly, ...embedOver(env) } : undefined);
  if (inference === undefined) return undefined;
  const slash = await import('@braindog/slash');
  /* ONLY TIER `a` IS PRICED IN NEURONS, the package's default: those calls are Workers AI on the operator's account, and
     a call on his own key is on his provider's bill, which this host has no rate for. */
  /* THE ROUTE, ON THE INCLUDED MODEL ALONE: when it fails, the next model the operator set is asked before the
     rules speak. On his own key there is no route, so his key never falls to another model. */
  const route = included === undefined ? undefined : includedRoute(env, deps.send);
  const engine = slash.createSlash(
    { sql: deps.sql, clock: deps.clock, inference, record: slashRecord(api()) },
    { tiers: CLOUD_TIERS, ...(route === undefined ? {} : { route }) },
  );
  /* GUARDED BY THIS HOST, as on the self-host: `configure` checks a grant id's shape and never the keychain, and the guard
     holds a save on his own key to a live API token (`slashGuardedEngine`). It reads the tiers this Worker runs as the
     package does, so a record saved on `byo` is counted where the package answers it. */
  const guarded = slashGuardedEngine(engine, { sql: deps.sql, clock: deps.clock, grants: () => api().kernel.grants(), tiers: CLOUD_TIERS });
  /* THE PLAN'S ASKS, NOW THE STORE EXISTS: a record put on Free before Slash was first asked is lowered here, on the build,
     because there was no `slash_settings` row to lower when the plan was set. */
  const plan = deps.plan === undefined ? null : await deps.plan().catch(() => null);
  if (plan !== null) planMoved(slash, deps.sql, plan);
  if (included === undefined) return planCeiling(keyOnly(guarded, deps.sql), deps.sql);
  /* AND ON THE INCLUDED MODEL, HELD UNDER THE OPERATOR'S CEILING, outermost so its check runs before either count below
     it and with no `await` between them and the package's hold. The plan's own ceiling is a save's alone, so it sits
     outside and counts nothing. */
  return planCeiling(operatorCeiling(guarded, deps, includedMonthNeurons(env), worstAsk(slash)), deps.sql);
}

/* ── the plan's asks ─────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Where Slash's store keeps the plan's ceiling on `ask_cap` while the record is on a plan that has one: its credits.
 * A key of this host's in `slash_meta`, beside the package's own (`version`, `own.provider`, `own.base_url`), which the
 * package never reads.
 */
export const PLAN_ASK_CAP = 'plan.ask_cap';

/** Whether Slash's store has been made in this storage: before the first ask it has not, and there is nothing to move. */
const slashStored = (sql: Sql): boolean =>
  sql.one("SELECT 1 AS n FROM sqlite_master WHERE type = 'table' AND name = 'slash_meta'") !== undefined &&
  sql.one("SELECT 1 AS n FROM sqlite_master WHERE type = 'table' AND name = 'slash_settings'") !== undefined;

/** The plan's ceiling on `ask_cap`, or `null` on a plan with none. */
const planCapOf = (sql: Sql): number | null => {
  if (!slashStored(sql)) return null;
  const said = sql.one<{ value: string }>('SELECT value FROM slash_meta WHERE key = ?', PLAN_ASK_CAP)?.value;
  return said !== undefined && /^[0-9]+$/u.test(said) ? Number(said) : null;
};

/**
 * A record's Slash asks, moved with its plan ("Free leads"): on Free the month's asks are `ASK_CAP_FREE`,
 * and paid for they are `ASK_CAP_DEFAULT` again.
 *
 * ON FREE THE CAP IS LOWERED AND NEVER RAISED, so an owner who set fewer keeps fewer, and the ceiling is kept beside it for
 * `planCeiling` to hold a save to. OFF FREE IT IS RAISED ONCE, and only where the ceiling was kept, which is a record that
 * was on Free: a renewal moves nothing, and an owner who set zero to turn Slash off is left off.
 *
 * TAKES THE PACKAGE AS AN ARGUMENT for the reason `worstAsk` does: the two numbers are named there, and `46 §5.1` has this
 * Worker load it only once an engine is being built.
 */
const planMoved = (slash: Pick<typeof import('@braindog/slash'), 'ASK_CAP_FREE' | 'ASK_CAP_DEFAULT'>, sql: Sql, plan: string): void => {
  planAgents(sql, plan);
  if (!slashStored(sql)) return;
  const held = planCapOf(sql);
  /* EVERY PLAN'S CREDITS ARE ITS CEILING (`PLAN_TABLE`), not Free's alone: Cloud's 80 held nothing and Plus never had its 400. */
  const known = (PLANS as readonly string[]).includes(plan) ? (plan as Plan) : null;
  const most = known === null ? null : PLAN_TABLE[known].credits;
  sql.transactionSync(() => {
    if (most === null) {
      if (held !== null) sql.exec('DELETE FROM slash_meta WHERE key = ?', PLAN_ASK_CAP);
      return;
    }
    /* A MOVE UP RAISES A CAP UNDER THE NEW CREDITS, as Free to Cloud always did; zero stays off and a renewal moves nothing. */
    if (most > (held ?? slash.ASK_CAP_DEFAULT)) sql.exec('UPDATE slash_settings SET ask_cap = ? WHERE singleton = 1 AND ask_cap > 0 AND ask_cap < ?', most, most);
    sql.exec('UPDATE slash_settings SET ask_cap = MIN(ask_cap, ?) WHERE singleton = 1', most);
    sql.exec('INSERT INTO slash_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', PLAN_ASK_CAP, String(most));
  });
};

/* ── the plan's agents ─────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Where the record's kernel reads the plan's count of agents (`AGENTS_KEY` in `packages/kernel/src/token.ts`): one row of
 * `host_meta`, a table of this host's that no `.brain` carries, so a record taken to a self-host leaves its cap behind.
 * The kernel names the same table and key; `token-agents.test.ts` writes the row as this does.
 */
export const PLAN_AGENTS = 'plan.agents';

/** The plan a record moves up to from each, for the refusal's way on: Free to Cloud, Cloud to Cloud Plus, none above. */
const NEXT_PLAN: Readonly<Record<Plan, Plan | null>> = { free: 'hosted', hosted: 'plus', plus: null, selfhost: null };

/**
 * A record's count of agent keys, moved with its plan: `PLAN_TABLE`'s `agents`, its name and the plan above it,
 * which `createToken` reads where every key is minted. A plan with no count, or one this table does not know, takes the
 * row away, and absent is no cap.
 *
 * WRITTEN WHETHER OR NOT SLASH HAS BEEN ASKED, unlike the asks above: the count holds at the first key, and a record
 * that never asked Slash still mints keys. Nothing is revoked by a move down; the kernel only stops the next mint.
 */
export function planAgents(sql: Sql, plan: string): void {
  const known = (PLANS as readonly string[]).includes(plan) ? (plan as Plan) : null;
  sql.exec('CREATE TABLE IF NOT EXISTS host_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  planFiles(sql, known);
  if (known === null || PLAN_TABLE[known].agents === null) {
    sql.exec('DELETE FROM host_meta WHERE key = ?', PLAN_AGENTS);
    return;
  }
  const next = NEXT_PLAN[known];
  sql.exec(
    'INSERT INTO host_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    PLAN_AGENTS,
    JSON.stringify({ agents: PLAN_TABLE[known].agents, plan: PLAN_TABLE[known].name, next: next === null ? null : PLAN_TABLE[next].name }),
  );
}

/** Where the record's kernel reads the plan's room for files (`FILES_KEY` in `packages/kernel/src/attachment.ts`). */
export const PLAN_FILES = 'plan.files';

/**
 * A record's room for attached files, moved with its plan: `PLAN_TABLE`'s `files`, its name and the plan above it with
 * its room, which `writeAttachment` reads at every new file. A plan with no figure takes the row away, and absent is the
 * kernel's default. Nothing is deleted by a move down; the next file that does not fit is refused, saying why.
 */
function planFiles(sql: Sql, known: Plan | null): void {
  const most = known === null ? null : PLAN_TABLE[known].files;
  if (known === null || most === null) {
    sql.exec('DELETE FROM host_meta WHERE key = ?', PLAN_FILES);
    return;
  }
  const next = NEXT_PLAN[known];
  const nextMost = next === null ? null : PLAN_TABLE[next].files;
  sql.exec(
    'INSERT INTO host_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    PLAN_FILES,
    JSON.stringify({ most, plan: PLAN_TABLE[known].name, next: next === null || nextMost === null ? null : { plan: PLAN_TABLE[next].name, most: nextMost } }),
  );
}

/**
 * The record's plan has moved: billing put it on Free, or it was paid for (`Record$.planMoved` in `index.ts`).
 *
 * THE COUNT OF AGENTS MOVES FIRST, ALWAYS (`planAgents`). The asks have nothing to move where Slash has not been asked,
 * and the package is not loaded for them: the store is made on the first build, which reads the plan itself. Where it
 * has, the package was already loaded to make it.
 */
export async function slashPlanMoved(sql: Sql, plan: string): Promise<void> {
  planAgents(sql, plan);
  if (!slashStored(sql)) return;
  planMoved(await import('@braindog/slash'), sql, plan);
}

/**
 * The engine, with a save above the plan's ceiling refused in a sentence that names the plan and the way up.
 *
 * A SAVE'S CHECK AND NOT AN ASK'S. The cap itself is the package's to keep, and `planMoved` has already lowered it, so
 * every ask is held to it by the count it always was; what this stops is an owner on Free typing a higher number into
 * Settings. Read from the store on each save, so a record paid for a second ago may raise it at once.
 */
function planCeiling(engine: Slash, sql: Sql): Slash {
  const held = Object.create(engine) as Slash;
  held.configure = (patch, ctx) => {
    const owner = ctx.principal.kind === 'person' && ctx.principal.level === 'owner';
    const most = owner && typeof patch.ask_cap === 'number' ? planCapOf(sql) : null;
    if (most !== null && typeof patch.ask_cap === 'number' && patch.ask_cap > most) {
      /* THE PLAN IS NAMED BY ITS CREDITS, the one figure the store keeps, and the plan above it is the way up. */
      const on = PLANS.find((p) => PLAN_TABLE[p].credits === most);
      const up = on === undefined ? null : NEXT_PLAN[on];
      const name = on === undefined ? 'This plan' : PLAN_TABLE[on].name;
      return no(
        'VALUE_MALFORMED',
        `${name} comes with ${most} Slash questions a month, so the monthly limit is ${most} or lower.${up === null ? '' : ` ${PLAN_TABLE[up].name} comes with more.`}`,
        { at: 'ask_cap' },
      );
    }
    return engine.configure(patch, ctx);
  };
  return held;
}

/**
 * The engine's own model on a Worker whose included model is off: one that sends nothing, marked so the package releases
 * its hold and writes no ledger row. Every ask on his own key is handed his key instead, so this answers only a question
 * that reached the engine with no key chosen, which `keyOnly` below turns away first.
 */
const ownOnly: SlashInference = {
  complete: async () => {
    throw new NotSent(NO_MODEL_HERE);
  },
};

/** Whether Slash's store says his own key, read on each ask so a save a second ago is the one that counts. */
const onOwnKey = (sql: Sql): boolean =>
  sql.one("SELECT 1 AS n FROM sqlite_master WHERE type = 'table' AND name = 'slash_settings'") !== undefined &&
  sql.one<{ tier: string }>('SELECT tier FROM slash_settings WHERE singleton = 1')?.tier === 'b';

/**
 * The engine on a Worker with no included model: every ask refused in one sentence until his own key is chosen.
 *
 * `NOT_IN_THIS_BUILD` AND NOT A MODEL THAT FAILED. Nothing is wrong with a record that has not picked a key, and a
 * refusal that reads as a failure would send an owner hunting for a fault; the sentence says what to do instead.
 *
 * A SAVE OF "INCLUDED" IS REFUSED HERE TOO, and only a save that asks for it. Settings offers both sources on every Cloud
 * record (`kindsOn` in `apps/web/src/lib/ui/slash-model.ts`), and a switch back to the included model was stored, after
 * which every ask answered `NOT_IN_THIS_BUILD`. Handing the package tier `b` alone would refuse it as well, but also every
 * save on a record still on the default, since the package checks the stored tier when a patch names none, and an owner
 * setting his monthly limit there would be told Slash runs on his own key.
 */
function keyOnly(engine: Slash, sql: Sql): Slash {
  const refused = <T>(): Promise<Result<T>> => Promise.resolve(no('NOT_IN_THIS_BUILD', NO_MODEL_HERE));
  const only = Object.create(engine) as Slash;
  /* THE OWNER'S CHECK STAYS THE ENGINE'S AND COMES FIRST, so anybody else is refused `FORBIDDEN` as on every host. */
  only.configure = (patch, ctx) => {
    const owner = ctx.principal.kind === 'person' && ctx.principal.level === 'owner';
    if (!owner || (patch.source !== 'included' && patch.tier !== 'a')) return engine.configure(patch, ctx);
    return no('NOT_IN_THIS_BUILD', 'Slash has no included model on this host, so it answers only on your own key.', { at: patch.source === 'included' ? 'source' : 'tier' });
  };
  only.read = (question, ctx, inference) => (onOwnKey(sql) ? engine.read(question, ctx, inference) : refused());
  only.propose = (question, ctx, byok, askId, inference) => (onOwnKey(sql) ? engine.propose(question, ctx, byok, askId, inference) : refused());
  only.proposePattern = (samples, ctx, inference) => (onOwnKey(sql) ? engine.proposePattern(samples, ctx, inference) : refused());
  only.answer = (ask, inference) => (onOwnKey(sql) ? engine.answer(ask, inference) : refused());
  only.proposeSetup = (ask, ctx, inference) => (onOwnKey(sql) ? engine.proposeSetup(ask, ctx, inference) : refused());
  only.proposeMapping = (ask, ctx, inference) => (onOwnKey(sql) ? engine.proposeMapping(ask, ctx, inference) : refused());
  /* A CONVERSATION SAYS IT IN ITS OWN STREAM, and ends as every turn ends. */
  /* DEEP NEEDS NO INCLUDED MODEL: it is his own Anthropic key, so a turn that may go deep goes there when quick has
     nothing to answer with. */
  only.chat = (input, ctx, tools, emit, inference, deep) => {
    if (onOwnKey(sql)) return engine.chat(input, ctx, tools, emit, inference, deep);
    if (slashDeepTurn(input, deep) !== null) return engine.chat({ ...input, mode: 'deep' }, ctx, tools, emit, inference, deep);
    if (input.mode === 'deep' || input.rethink === true) return engine.chat(input, ctx, tools, emit, inference, deep);
    emit({ type: 'error', text: NO_MODEL_HERE });
    emit({ type: 'done', spent: { asks: 0, left: null } });
    return Promise.resolve();
  };
  return only;
}

/**
 * The most one package call can spend on the included model, in neurons: every template at its own input cap and its own
 * output ceiling, at its own model's rate. 232 today, a `propose` of 12,000 tokens in and 1,500 out.
 *
 * READ OFF THE PACKAGE AND NOT WRITTEN HERE, so a template whose caps grow moves the ceiling's count of asks with it. It
 * takes the module as an argument because `46 §5.1` has this Worker import it only once an engine is being built.
 */
const worstAsk = (slash: Pick<typeof import('@braindog/slash'), 'PROMPTS' | 'MODELS'>): number =>
  Math.max(
    ...Object.values(slash.PROMPTS).map((t) => {
      const rate = slash.MODELS[t.model];
      return Math.ceil((t.capIn * rate.in + t.maxTokens * rate.out) / 1_000_000);
    }),
  );

/**
 * `worstAsk`, for the record's own asks on the included model (`includedModel`), read on each ask.
 *
 * THE IMPORT IS HERE AND NOT INLINE IN `includedModel` because `test/slash.test.ts` reads this file as text and holds every
 * `import('@braindog/slash')` below the first refusal, which is how `46 §5.1`'s loading rule is kept checkable. It is
 * reached only once the record asks its model, which needs the included model switched on, and the module is cached.
 */
const recordAskMost = async (): Promise<number> => worstAsk(await import('@braindog/slash'));

/** `2026-10-01T00:00:00.000Z` for a clock in September, and `1 October` for the run's sentence. UTC, as the package's month. */
const monthOf = (ms: number, add: number): string => {
  const at = new Date(ms);
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + add, 1)).toISOString();
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const grouped = (n: number): string => String(n).replace(/\B(?=([0-9]{3})+(?![0-9]))/gu, ',');

/* EVERY CALL OF HIS BUT HIS OWN KEY'S. A call on tier `b` went to his provider on his bill and spent none of the operator's
   neurons, so it is not counted here, and while he is on it the ceiling does not apply at all (`agents.md` §5 item 7).

   AND NEVER A BACKGROUND ASK. The daily look, a skill draft, the pages' headlines and the reading of who is who say
   `spends = 'background'` on their own rows (`@braindog/host` `slashRecordMeter.background`), and were counted here beside
   his: under a ceiling of three asks the look took one, and a month of headlines could leave the palette refusing a
   person who had asked nothing. They are counted apart (`backgroundMade`) and held apart (`includedCeilingReached`). */
/* WHOSE A CALL IS, WHERE ITS ROW SPENDS NOBODY'S MONTH. An attempt no model answered and a question's second call settle
   `spends = 'none'` and keep their model's name and their neurons (`@braindog/slash` `unspent`), so the ceiling still
   counts them, and the row's `purpose` says whose they were: a look or a headline the model never answered is the
   background's, and read as "not background" a week of them took a person's asks at the palette. */
/* READ OFF THE PURPOSES TABLE AND NOT TYPED HERE (`@braindog/host/infer` `PURPOSES`, where who pays for each purpose is
   said once): a purpose added there as a person's is one of his here the same day, and one added as the background's is
   never his by default of this line being forgotten. The names are the table's own keys, so nothing a caller typed is in
   the SQL. */
const HIS_PURPOSES = Object.entries(PURPOSES)
  .filter(([, who]) => who.spends === 'person')
  .map(([purpose]) => `'${purpose}'`)
  .join(', ');
const HIS = `(spends = 'person' OR (spends = 'none' AND purpose IN (${HIS_PURPOSES})))`;
/** The SQL test for a `slash_call` row that is a person's own or his automations', for `slashDays` to count by the same rule. */
export const HIS_CALL = HIS;

/* AND NEVER AN EMBEDDING, in any of the three counts, as `slash-meter.ts` leaves `kind = 'embed'` out of its own: the
   index's calls are the background allowance's, held there by the half-month rule (`@braindog/host/model-jobs`
   `embedRoom`), and an hour of them would otherwise eat the asks the operator's ceiling keeps for everything else. */
const callsMade = (deps: { sql: Sql; clock: Clock }): number =>
  deps.sql.one<{ n: number }>(`SELECT COUNT(*) AS n FROM slash_call WHERE model <> '-' AND tier <> 'b' AND kind <> 'embed' AND ${HIS} AND ts >= ?`, monthOf(deps.clock.now(), 0))?.n ?? 0;

/* THE BACKGROUND'S OWN CALLS ON THE INCLUDED MODEL THIS MONTH, held and settled, as `callsMade` counts his: every call that is not his. */
const backgroundMade = (deps: { sql: Sql; clock: Clock }): number =>
  deps.sql.one<{ n: number }>(`SELECT COUNT(*) AS n FROM slash_call WHERE model <> '-' AND tier <> 'b' AND kind <> 'embed' AND NOT ${HIS} AND ts >= ?`, monthOf(deps.clock.now(), 0))?.n ?? 0;

/**
 * THE JOINT SPEND: this month's neurons on the included model, his calls and the background's together, with the next
 * one's room still to be taken off (`jointFull`).
 *
 * WHY A THIRD NUMBER BESIDE THE TWO COUNTS. Each count holds its own side to the ceiling's asks, so the two together could
 * reach twice the ceiling, and the ceiling is the operator's monthly budget for one record: about $3.30 was a promise of
 * about $6.60 at the worst. The counts keep either side from spending the other's asks; this keeps the sum inside the
 * budget, in the unit the budget is written in.
 *
 * NEURONS AS BILLED, AND THE WORST ASK WHERE THE BILL IS NOT IN YET. A settled call is its own `neurons`. A hold in flight
 * (`SLASH_PENDING`, written before the model is called) is priced 0 until it settles, so it is taken at `worst`, the most
 * the call may spend, and so is a row on a tier the package has no rate for. Read with no `await` before the engine's own
 * hold, so asks in flight together see each other, as the counts do. A call no model was reached for spent nothing and
 * adds nothing.
 */
const jointSpent = (deps: { sql: Sql; clock: Clock }, worst: number): number =>
  deps.sql.one<{ n: number | null }>(
    `SELECT SUM(CASE WHEN code = 'SLASH_PENDING' OR tier <> 'a' THEN ? ELSE neurons END) AS n FROM slash_call WHERE model <> '-' AND tier <> 'b' AND kind <> 'embed' AND ts >= ?`,
    worst,
    monthOf(deps.clock.now(), 0),
  )?.n ?? 0;

/** Whether `calls` more calls at their worst would take the month past `budget`: the joint cap, asked before anything is held. */
const jointFull = (deps: { sql: Sql; clock: Clock }, budget: number, worst: number, calls = 1): boolean =>
  jointSpent(deps, worst) + calls * worst > budget;

/**
 * Whether the operator's ceiling has turned this month's BACKGROUND calls on the included model away, for an ask no engine
 * method carries (`slash-meter.ts` `workerSlashMeter`, `workerUnderstandLedger`). `false` on his own key and where the
 * included model is off.
 *
 * THE BACKGROUND'S OWN COUNT AGAINST THE CEILING, NEVER HIS. The ceiling is one number of asks, and each of the two
 * allowances is held to it apart: his asks by `operatorCeiling`, the background's here. So neither spends the other's,
 * and a ceiling of 0 still turns every ask of both away.
 *
 * AND THE TWO TOGETHER TO THE BUDGET (`jointSpent`): a background ask whose worst case would not fit what the month has
 * left is turned away too, so the most one record costs the operator in a month is the ceiling and not twice it.
 *
 * THE CEILING ITSELF AND NOT `status()`, which says his own `ask_cap` wherever that is the lower: read there, a Free record
 * whose month of asks was spent at the palette lost its reading of who is who, which is the background's and never his.
 */
export async function includedCeilingReached(env: SlashEnv, deps: { sql: Sql; clock: Clock }): Promise<boolean> {
  if (includedInference(env) === undefined || onOwnKey(deps.sql)) return false;
  const worst = await recordAskMost();
  const budget = includedMonthNeurons(env);
  return backgroundMade(deps) >= Math.floor(budget / worst) || jointFull(deps, budget, worst);
}

/**
 * The engine, with the operator's monthly ceiling over every call it makes on the included model (`INCLUDED_MONTH_NEURONS`).
 *
 * IT COUNTS CALLS AND NOT NEURONS, AND THAT IS WHAT MAKES IT EXACT. The package writes a hold row for each call before its
 * first `await` (`core.reserve`), with the model's name and 0 neurons, and a call settled under `-` reached no model. So
 * `model <> '-'` this month is every call already made and every call in flight, on any tier but his own key's and of any kind
 * a person or his automations asked for (a background ask is the background's, counted apart: `callsMade`),
 * and a check taken synchronously before the engine's own sees them all: the lesson of
 * `packages/slash/test/cap-concurrent.test.ts`, where a check and a count with a model between them let ten asks through
 * a cap of two. A sum of `neurons` would miss every hold in flight, which is priced 0 until it settles.
 *
 * AN OWNER'S `ask_cap` ONLY LOWERS IT. A save above the ceiling is refused in the owner's settings sentence, and a cap
 * stored above it before this check existed stops nothing: the count here refuses first. `status` says the lower of the
 * two, so a person is not told of a billion asks this host will not answer.
 *
 * ONE PROPOSE CAN END ONE CALL OVER THE COUNT, as the package's own cap can (`46 §5.5`): it is checked once and may draft
 * and then propose. It cannot end over the budget, which is the next paragraph's.
 *
 * AND THE JOINT CAP IS BESIDE BOTH COUNTS (`jointSpent`). `budget` is the month's neurons and `worst` the most one call
 * spends, so the ceiling's asks are `budget / worst`, and every ask here is also turned away where its worst case would
 * not fit what his calls and the background's have left of the month together. A propose is asked for room for two calls,
 * the draft and the proposal it may hold at once. In practice a call costs a fraction of its worst, so the counts bind
 * first and this binds only where the month really is nearly spent.
 */
function operatorCeiling(engine: Slash, deps: { sql: Sql; clock: Clock }, budget: number, worst: number): Slash {
  const asks = Math.floor(budget / worst);
  const made = (): number => callsMade(deps);
  const spent = (calls = 1): boolean => !onOwnKey(deps.sql) && (made() >= asks || jointFull(deps, budget, worst, calls));
  /* THE RECORD'S OWN JOBS ARE HELD OVER THE BACKGROUND'S COUNT (`infer.draft`, `infer.prose`): their rows say `background`,
     so held over his they went on past the ceiling while he had asks left and stopped the day his were spent. */
  const backgroundSpent = (): boolean => !onOwnKey(deps.sql) && (backgroundMade(deps) >= asks || jointFull(deps, budget, worst));
  const until = (): string => monthOf(deps.clock.now(), 1);
  const refused = <T>(kind: 'read' | 'propose' | 'pattern' = 'read'): Result<T> => {
    /* THE ASK TURNED AWAY LEAVES ITS ROW (`@braindog/host/slash` `turnedAway`, model-sign-49). */
    turnedAway(deps.sql, new Date(deps.clock.now()).toISOString(), kind, 'a');
    return no('SLASH_BUDGET_SPENT', `Slash has asked this host's model as often as one BrainDog may in a month, so its questions are used until ${until().slice(0, 10)}.`);
  };

  const capped = Object.create(engine) as Slash;
  capped.read = (question, ctx, inference) => (spent() ? Promise.resolve(refused()) : engine.read(question, ctx, inference));
  capped.propose = (question, ctx, byok, askId, inference) =>
    spent(2) ? Promise.resolve(refused('propose')) : engine.propose(question, ctx, byok, askId, inference);
  capped.proposePattern = (samples, ctx, inference) => (spent() ? Promise.resolve(refused('pattern')) : engine.proposePattern(samples, ctx, inference));
  capped.draftPattern = (samples) => (backgroundSpent() ? Promise.resolve(refused('pattern')) : engine.draftPattern(samples));
  capped.digestProse = (digest) => (backgroundSpent() ? Promise.resolve(ok({ text: '' })) : engine.digestProse(digest));
  capped.proposeSetup = (ask, ctx, inference) => (spent() ? Promise.resolve(refused()) : engine.proposeSetup(ask, ctx, inference));
  capped.proposeMapping = (ask, ctx, inference) => (spent() ? Promise.resolve(refused()) : engine.proposeMapping(ask, ctx, inference));
  /* A TURN IS SEVERAL CALLS AT MOST `STEPS_MOST`, and is let in while two more fit, as a question's two passes are; the
     ceiling's sentence goes in the turn's own stream. */
  /* A TURN THAT GOES DEEP SPENDS NONE OF THE INCLUDED MODEL, so the ceiling does not hold it; `auto` past the ceiling
     goes deep where it can. */
  capped.chat = (input, ctx, tools, emit, inference, deep) => {
    const going = slashDeepTurn(input, deep);
    if (going === 'deep' || input.mode === 'deep' || input.rethink === true) return engine.chat(input, ctx, tools, emit, inference, deep);
    if (!spent(2)) return engine.chat(input, ctx, tools, emit, inference, deep);
    if (going === 'auto') return engine.chat({ ...input, mode: 'deep' }, ctx, tools, emit, inference, deep);
    const out = refused<never>();
    emit({ type: 'error', text: out.ok ? '' : 'refusal' in out ? out.refusal.fix : '' });
    emit({ type: 'done', spent: { asks: 0, left: 0 } });
    return Promise.resolve();
  };
  /* THE RUN'S OWN SENTENCE, NAMING THE RULE AND THE STEP, as the package's own cap refusal does. Any code but
     `UNREACHABLE` is one `serveAsks` acks `done`, so the run stops here and the ladder does not ask again. */
  capped.answer = (ask, inference) => {
    if (!spent()) return engine.answer(ask, inference);
    turnedAway(deps.sql, new Date(deps.clock.now()).toISOString(), 'read', 'a');
    const next = new Date(until());
    return Promise.resolve(
      no(
        'SLASH_BUDGET_SPENT',
        `rule.${ask.rule} asked Slash at step ${ask.step + 1}, and this BrainDog has used every question this host's model allows one BrainDog in a month, so the run stopped there. Questions start again on ${next.getUTCDate()} ${MONTHS[next.getUTCMonth()]}.`,
      ),
    );
  };
  capped.configure = (patch, ctx) => {
    const owner = ctx.principal.kind === 'person' && ctx.principal.level === 'owner';
    if (owner && typeof patch.ask_cap === 'number' && patch.ask_cap > asks)
      return no(
        'VALUE_MALFORMED',
        asks === 0
          ? "This host's included model answers no questions, so the monthly limit here is 0."
          : `This host's included model answers at most ${grouped(asks)} questions a month for one BrainDog, so the monthly limit is ${grouped(asks)} or lower.`,
        { at: 'ask_cap' },
      );
    return engine.configure(patch, ctx);
  };
  /* AND WHERE THE CEILING IS THAT CAP, THE COUNT UNDER IT IS THE CEILING'S. The package counts tier `a` and the guard
     counts `byo`, so an owner who moved from `a` to `byo` mid-month read `{ used: 2, cap: 10 }` from a host that
     was refusing every ask (`test/slash-operator-cap.test.ts` case 9). The ceiling's count holds every row either of those
     does, so where it binds it is never the smaller number. On his own key it is neither: his asks are listed and not
     capped, and the package's own status says so.

     AND WHERE THE JOINT CAP IS WHAT TURNS HIM AWAY, THE CAP SAID IS THE ASKS HE HAS MADE: with the month's neurons spent
     by the two together he is not shown asks left on a host that is refusing every one. Until then it is the ceiling's
     own number, since a call costs a fraction of its worst and the room left cannot be said in asks any closer. */
  capped.status = () => {
    const status = engine.status();
    if (status.tier === 'b') return status;
    const used = made();
    const cap = jointFull(deps, budget, worst) ? Math.min(asks, used) : asks;
    if (status.asks.cap < cap) return status;
    return { ...status, asks: { ...status.asks, used, cap } };
  };
  return capped;
}

/**
 * What answers an automation's question to Slash on this Worker, or nothing: `serveAsks`'s `answer`, one job at a time.
 *
 * `undefined` EXACTLY WHERE `workerSlashEngine` IS, AND DECIDED WITHOUT AN `await`, because `Record$.#open` reads it to set
 * the record's `answersSlash` before `createRecordApi` runs. The test is the builder's own: the included model switched on,
 * or a `KEK` to open his key with. `workerSlashModel`, which `/api/version`'s `slash` reads, is `undefined` on the same
 * test, so the switch that files `ask_slash` and the flag the canvas reads are one fact.
 *
 * THE ENGINE IS BUILT ONCE, ON THE FIRST QUESTION, THROUGH `workerSlashEngine`, so it is the guarded one and it meters on
 * the same `slash_settings` and `slash_call` tables the door's engine does, in the same storage: one `ask_cap` for a person's read and
 * an automation's question. A build that throws is let go, as `apps/selfhost/src/slash.ts` `slashAnswersFor` lets it go,
 * so the next pass builds again rather than every question after it failing on one bad import.
 *
 * ON HIS OWN KEY THE QUESTION GOES TO HIS KEY, AND NO KEY, NO POST. Where his key is chosen the question is asked on it,
 * and only on it: a grant revoked or gone since he picked it is refused `FORBIDDEN` before the engine is built or anything
 * is held, and nothing is written to the ledger (Q7's default). The included model is never asked in its place, since he
 * chose where his questions go.
 *
 * AND A KEY THAT IS THERE AND WILL NOT OPEN IS REFUSED TOO, which the check above cannot see: it reads that the grant is
 * live, and the opening is the call's. A probe put the owner's key under one
 * `KEK` and woke the object under another, as a `wrangler secret put KEK` leaves it: 8 POSTs with no `authorization` of 8
 * over the ladder, 8 ledger rows under the dash, and a run ending "could not be reached". `keyOpener` answers `null` for
 * that and for four other ways a grant fails to open (`actions.ts`). His key's wire always requires it (`wireOf`), the host
 * throws before `post` sends, and the job is refused `FORBIDDEN` with the same ledger as a key that is gone: none.
 *
 * EACH QUESTION IS ASKED ON A WIRE SIGNED `rule:<id>`, so the keychain's `grant.read` for the owner's key names the rule that
 * opened it and not `system`. This never runs the keychain's session gate (`slashOwnKeyFor`): a rule has no session for it
 * to read, and installing a rule that asks Slash is the owner's consent to its question going to the model he chose (Q3's
 * default).
 */
export function workerSlashAnswers(env: SlashEnv, api: () => RecordApi, deps: SlashEngineDeps): SlashAnswer | undefined {
  const included = includedInference(env) !== undefined;
  const keyed = isBound(env.KEK);
  if (!included && !keyed) return undefined;
  let built: Promise<Slash | undefined> | null = null;
  const engineOf = () =>
    (built ??= workerSlashEngine(env, api, deps).catch((e: unknown) => {
      built = null;
      throw e;
    }));
  return async (ask) => {
    const own = keyed ? slashOwnKeyOf(deps.sql) : null;
    /* THE INCLUDED MODEL OPENS NO KEY, SO NONE OF THE KEY RULES BELOW IS ITS. There is no keychain grant to gate on and no
       rule id to sign a `grant.read` with, so the question goes to the engine's own model. */
    if (own === null) {
      if (!included)
        return no(
          'NOT_IN_THIS_BUILD',
          `rule.${ask.rule} asked Slash at step ${ask.step + 1}, and Slash on this host answers on your own key, which is not chosen yet, so the run stopped there. Pick your key in Settings.`,
        );
      const engine = await engineOf();
      if (engine === undefined) throw new Error('Slash has no model on this Worker to answer with.');
      return engine.answer(ask);
    }
    const inference = slashOwnInference(own, wireOf(env, api, deps, `rule:${ask.rule}`));
    if (inference === undefined)
      return no(
        'FORBIDDEN',
        `rule.${ask.rule} asked Slash at step ${ask.step + 1}, and the key Slash was set to answer with is no longer a key in the keychain, so nothing was sent and the run stopped there. Pick your key again in Settings.`,
        { at: 'grant_id' },
      );
    const engine = await engineOf();
    /* NOT REACHABLE WHILE THE TEST ABOVE HOLDS, and a thrown sentence here becomes the ladder's `failed` ack rather than
       an answer nobody asked for. */
    if (engine === undefined) throw new Error('Slash has no model on this Worker to answer with.');
    /* THE KEY IS OPENED ON THE CALL, SO WHETHER IT OPENS IS LEARNT INSIDE `answer`, and this wrap is how the pass hears
       it: `SlashKeyClosedError` is thrown before `post` sends, and the package, reading its `sent: false`, releases its
       hold and writes no ledger row. What the package cannot say is where the key lives, so the sentence is this file's,
       beside the one for a key that is gone. */
    let closed = false;
    const out = await engine.answer(ask, {
      complete: async (call) => {
        try {
          return await inference.complete(call);
        } catch (e) {
          closed ||= e instanceof SlashKeyClosedError;
          throw e;
        }
      },
    });
    if (closed)
      return no(
        'FORBIDDEN',
        `rule.${ask.rule} asked Slash at step ${ask.step + 1}, and your own key for Slash would not open on this Worker, so nothing was sent and the run stopped there.`,
        { at: 'grant_id' },
      );
    return out;
  };
}

/**
 * `POST /api/slash/read` for this record's object: the door `@braindog/host` serves, over the builder above.
 *
 * THIS IS THE CALLER THE BUILDER ONCE LACKED. The dependency, the builder and a door were each added without the
 * branch in `Record$.#answer` that hands a request to one; that branch is added now, so `grep -rn workerSlashDoor apps`
 * finds this declaration and the branch that calls it.
 *
 * EACH MUTATION IS WRITTEN OUT ON ITS OWN, because a tally over several is easy to misread. Every
 * figure below is `node --test --experimental-strip-types "apps/worker/test/*.test.ts"`, whose unmutated run
 * is 179 tests, 179 pass. A `throw new Error(…)` on the first line of `workerSlashEngine` ALONE is 177 pass,
 * 2 fail, at `slash.test.ts:153` and `:238`. On the first line of `slashEngineFor` alone it is also 177 pass,
 * 2 fail, but at `:206` and `:238`, because `:206` drives the SELF-HOST's builder out of this app's suite.
 * Only BOTH builders throwing is 176 pass, 3 fail at `:153`, `:206` and `:238`, and no single mutation
 * produces that three-red tally. Every reading says the same thing: the only callers of either builder are the
 * tests that name them. The same glob LESS `slash.test.ts` counts 172, which is true of every OTHER suite and
 * not of this app. `apps/selfhost` is the cleaner measurement, because with `slashEngineFor` throwing its own
 * suite is 204 tests, 202 pass, 0 fail, 2 skipped, exactly as an unmutated run: no test in that app reaches
 * its own builder at all.
 *
 * WHAT A REQUEST MET BEFORE THE MOUNT, measured rather than reasoned about: a real self-host started with a
 * `SLASH_ENDPOINT` and a key answered `slash: true` at `/api/version` and 404 `ROUTE_UNKNOWN` "There is no
 * method called slash/read." at `POST /api/slash/read`, because `serveApi` was the only thing behind `/api` on
 * either host.
 *
 * WHAT IT MEETS NOW, on the self-host, driven over a real socket: 200 on one model call, and the
 * row it asked about. A record holding three rows in `things` asked the name of one of them answers that row,
 * with `{"register":"things","rows":1,"predicate":"all"}` in the fold. A register that declares no field with
 * `search: true` reads back empty, because nothing about its rows is indexed, and that is the record and the ask
 * answering correctly. This Worker's mount is the same door over the same builder and has not been driven against a
 * deployed object, so it is not claimed here.
 *
 * IT IS BUILT INSIDE THE OBJECT AND NOT IN THE ROUTER, unlike `/api/keys/*`, and the difference is what each
 * door needs: the key doors need the `KEK` binding alone, so the Worker answers them without waking the record,
 * and this one needs the record's own `RecordApi` and Slash's own SQLite in this object's storage (`46 §2`).
 *
 * WHEN THE ENGINE IS BUILT IS `slashAskDoor`'s AND NOT THIS FILE'S, for the reason `wireOf` above is written
 * once: the self-host asks the same question of the same builder, and two copies of that rule are two hosts
 * that come to disagree about the first ask of the day. What is this file's is WHICH builder.
 *
 * AND THE MOUNT THIS OBJECT NEEDS IS A FIELD AND A BRANCH, in `apps/worker/src/index.ts` and nowhere else,
 * because `servesApi` is a prefix test (`route.ts:58`) and so `/api/slash/read` already reaches `Record$`.
 * A FIELD and not a local: `slashAskDoor` caches the built engine on the door it returns, so a door built per
 * request would run `createSlash`'s store check (`openStore`) and its settings insert on every question,
 * which is the cold path `46 §7` budgets. The branch goes in `#answer`, beside `servesMcp`'s and before
 * `serveApi`, because `fetch` only drains the body around it. The storage is this object's own until
 * `apps/worker/src/do/slash.ts` exists, which is what `SlashEngineDeps.sql`'s comment above already says.
 */
export function workerSlashDoor(
  env: SlashEnv,
  api: () => RecordApi,
  deps: SlashEngineDeps,
  origins: ReadonlySet<string>,
  chat?: SlashAskDoor<CallContext>['chat'],
): SlashAskDoor<CallContext> {
  /* HIS OWN KEY IS OFFERED ONLY WHERE A KEY CAN BE OPENED. A `byok` handed in here is what lets the settings door store
     it: offering it on a Worker with no `KEK` would save a choice every later ask refuses. `api` is not called until an
     ask, by which time the engine is built and its `slash_settings` table exists for `slashOwnKeyOf` to read.
     OPENED FOR THE ASKER, NOT FOR `system`: `slashOwnKeyFor` runs the keychain's own gate on `ctx` and signs the `grant.read`
     with the asker's id, where this line once opened the owner's key for any caller the door let through. */
  const byok = isBound(env.KEK)
    ? async (ctx: CallContext) => slashOwnKeyFor(slashOwnKeyOf(deps.sql), api(), ctx, (_asker, actor) => wireOf(env, api, deps, actor))
    : undefined;
  /* THE KEYCHAIN'S OWN GATE FOR A SAVE THAT POINTS HIS KEY SOMEWHERE (`slashKeySave`), asked through the read that writes no
     event, and the INBOX'S OWN READ for a pattern's arrivals, as the asker. */
  const keychain = async (ctx: CallContext): Promise<Refusal | null> => {
    const gate = await api().listGrants(ctx);
    if (gate.ok) return null;
    return 'refusal' in gate ? gate.refusal : { code: 'FORBIDDEN', fix: 'The keychain could not be asked about your key. Try again.' };
  };
  const samples = (ids: readonly string[], ctx: CallContext) => slashSamplesOf(api(), ids, ctx);
  /* THE DAY'S CEILING, from the same ledger the month's count is read from (`slashDayStop`). */
  const day = async (): Promise<Refusal | null> => slashDayStop(deps.sql, Date.now());
  /* DEEP, ON HIS ANTHROPIC KEY, opened for the asker as his own key is, and only where a key can be opened at all. */
  const deep = isBound(env.KEK)
    ? async (ctx: CallContext) => slashDeepFor(slashDeepKeyOf(deps.sql), api(), ctx, (_asker, actor) => wireOf(env, api, deps, actor))
    : undefined;
  /* AND A CONVERSATION'S TOOLS, built by the object over the record it holds (`@braindog/mcp/slash-tools`). */
  return slashAskDoor(origins, () => workerSlashEngine(env, api, deps), byok, {
    keychain,
    samples,
    day,
    ...(chat === undefined ? {} : { chat }),
    ...(deep === undefined ? {} : { deep }),
  });
}

/* ── the daily look, and what it heard go wrong ───────────────────────────────────────────────────────────────────── */

/**
 * What the look's asks heard, kept by the record they were asked for: the store the model reads its choice from, and the
 * provider's words of the newest ask that failed, with when.
 *
 * KEYED BY THE RECORD, BECAUSE THE RECORD SWALLOWS THE THROW. `slashTick` reads a model that failed as "the rules speak",
 * which is right for the page and left Health with nothing: the meter settles the hold as `UNREACHABLE` and no words, and
 * `slashLook` saw nothing at all. The model (`heardBy`) and the look are both built over the one record `index.ts` opens,
 * so the record is the one key both hold, and nothing is wired between them for it. A WeakMap, so a record let go takes
 * its words with it.
 */
type LookEar = { store?: (() => Sql) | undefined; words: string | null; at: number };
const lookEars = new WeakMap<object, LookEar>();

const earOf = (record: unknown): LookEar | null => {
  if (record === null || typeof record !== 'object') return null;
  let ear = lookEars.get(record);
  if (ear === undefined) lookEars.set(record, (ear = { words: null, at: 0 }));
  return ear;
};

/** The asks the daily look makes of the record's model: its drafts, a skill's next version, the pages' looks and Today's cards. */
const LOOK_ASKS = ['draft', 'skill', 'headline', 'brief'] as const;

/**
 * The record's model with each of the look's asks heard: the store noted, and a failure's words kept beside the record,
 * then the throw passed on as it was. MUTATED IN PLACE, because `workerSlashModel`'s `name` is a getter read on each ask,
 * and a spread would freeze it at the name of the moment it was built.
 *
 * A CALL NEVER SENT IS NOT HEARD (`sent: false`): no model was asked and the record writes no row for it, and the ceiling
 * saying no (`SLASH_BUDGET_SPENT`) is the ceiling working, never a look that failed.
 */
function heardBy(model: WorkerSlashModel, api: () => unknown, store: (() => Sql) | undefined): WorkerSlashModel {
  const ears = model as unknown as Record<(typeof LOOK_ASKS)[number], ((input: unknown) => Promise<unknown>) | undefined>;
  for (const name of LOOK_ASKS) {
    const ask = ears[name];
    if (ask === undefined) continue;
    ears[name] = async (input) => {
      const ear = (() => {
        try {
          return earOf(api());
        } catch {
          return null;
        }
      })();
      if (ear !== null && store !== undefined) ear.store = store;
      try {
        return await ask.call(model, input);
      } catch (e) {
        const mark = (typeof e === 'object' && e !== null ? e : {}) as { sent?: unknown; code?: unknown; raw?: unknown };
        if (ear !== null && mark.sent !== false && mark.code !== 'SLASH_BUDGET_SPENT') {
          const raw = typeof mark.raw === 'string' && mark.raw.trim() !== '' ? mark.raw : e instanceof Error ? e.message : String(e);
          ear.words = lookWords(raw);
          ear.at = Date.now();
        }
        throw e;
      }
    };
  }
  return model;
}

/** Anything that names where a call went: a URL, an IP address, a host name. Health says what failed, never where. */
/* THE TRAILING STOP STAYS: an address ends before a comma, a colon or a full stop that follows it, so the sentence reads on. */
const ADDRESS = /\b[a-z][a-z0-9+.-]*:\/\/\S*[^\s.,;:)!?]|\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b|\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d+)?(?:\/\S*[^\s.,;:)!?])?/giu;

/**
 * The provider's words fit for Health: every address cut, then everything shaped like a key (`scrubRaw`), and no dash
 * used as punctuation, since a person reads them. `''` for a failure that said nothing.
 */
export const lookWords = (said: string): string =>
  scrubRaw(said.replace(ADDRESS, '[cut]'))
    .replace(/\s*[–—]\s*/gu, ', ')
    .trim();

/** The sentence a failed look is kept under, which Health reads as the provider's last words (`engineHealth`'s `lastWords`). */
export const lookFailed = (words: string | null): string => `Today's look failed: ${words !== null && words !== '' ? words : 'the model did not answer.'}`;

/** The asks of the look, by the purpose their rows carry (`slashRecordMeter`'s `BACKGROUND_PURPOSE`). */
const LOOK_PURPOSES = "purpose IN ('look', 'headline', 'skill')";

/** `LEDGER_FAILED` of `packages/slash/src/health.ts`, restated: this file never imports the package before a model is asked. */
const FAILED = "status = 'error' AND code IN ('UNREACHABLE', 'PULL_REQUEST_REFUSED', 'ANSWER_UNREADABLE')";

/**
 * Where the look writes what failed: Slash's own store, and the time its rows are written at. Both default to what the
 * model noted. `budget` is the alarm's share for the look (`TickBudget`): the look stops when it is spent and says so.
 */
export type LookLedger = { sql?: Sql | undefined; clock?: Clock | undefined; budget?: TickBudget | undefined };

/**
 * A look that failed, written into Slash's ledger where the engine's readings and Health count a failed background ask.
 *
 * THE ROWS THE LOOK'S OWN ASKS LEFT ARE GIVEN THE WORDS. The meter settled each failed ask as `UNREACHABLE` with no words;
 * each such row since the tick began is given the sentence, so Health says why and the readings count it once, as the
 * meter wrote it. A TICK THAT THREW WITH NO SUCH ROW gets one, since nothing else says the look never ran. ONE A UTC DAY,
 * moved to the newest failure's time and words, so a look that throws on every request is one failed look and one call
 * of the background's month, never a row a request.
 *
 * WORDS HEARD WITH NO FAILED ROW WRITE NOTHING. That is an ask the meter already counted another way (an answer the
 * schema refused is `PROPOSAL_SCHEMA`, answered and counted once), or his own press failing beside the tick, which is
 * not the look; a row for either would count one ask twice or call a press a look.
 *
 * `since` IS THE LEDGER'S LAST ROW BEFORE THE TICK, or `null` where the store was not known until the tick's first ask
 * (a Durable Object just woken). Then the tick's rows are the ones written from `from` on, never every failed row the
 * ledger ever held.
 *
 * NOTHING HERE MAKES THE TABLE: a store no engine was ever built in has no ledger, and the failure is the log line alone.
 */
function lookCounted(sql: Sql, since: number | null, from: string, words: string | null, now: number, threw: boolean): void {
  if (sql.one("SELECT 1 AS n FROM sqlite_master WHERE type = 'table' AND name = 'slash_call'") === undefined) return;
  const raw = lookFailed(words);
  const failed = sql.all<{ id: string }>(
    `SELECT id FROM slash_call WHERE ${since === null ? 'ts >= ?' : 'rowid > ?'} AND ${LOOK_PURPOSES} AND ${FAILED} AND raw IS NULL`,
    since ?? from,
  );
  for (const row of failed) sql.exec('UPDATE slash_call SET raw = ? WHERE id = ?', raw, row.id);
  if (failed.length > 0 || !threw) return;
  const at = new Date(now).toISOString();
  const today = sql.one<{ id: string }>(
    `SELECT id FROM slash_call WHERE id LIKE 'look-failed-%' AND substr(ts, 1, 10) = ? ORDER BY ts DESC LIMIT 1`,
    at.slice(0, 10),
  );
  if (today !== undefined) {
    sql.exec('UPDATE slash_call SET ts = ?, raw = ? WHERE id = ?', at, raw, today.id);
    return;
  }
  /* UNDER THE MODEL THE LOOK WOULD HAVE ASKED: his key's where he chose it, the included one otherwise. A row under `-`
     is one the readings pass over as a call that reached nothing, and this one is the look that failed. */
  const settings = sql.one("SELECT 1 AS n FROM sqlite_master WHERE type = 'table' AND name = 'slash_settings'") === undefined
    ? undefined
    : sql.one<{ tier: string | null; model: string | null }>('SELECT tier, model FROM slash_settings WHERE singleton = 1');
  const tier = settings?.tier === 'b' || settings?.tier === 'byo' ? settings.tier : 'a';
  const model = tier !== 'a' && settings?.model ? settings.model : INCLUDED_MODEL;
  sql.exec(
    `INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, code, question, purpose, spends, raw)
     VALUES (?, ?, 'read', ?, ?, 0, 0, 0, 0, 'error', 'UNREACHABLE', ?, 'look', 'none', ?)`,
    `look-failed-${at}`,
    at,
    tier,
    model,
    "Slash's daily look",
    raw,
  );
}

/** The newest row of Slash's ledger, so a tick's own rows are the ones after it; 0 where there is no ledger yet. */
const ledgerMark = (sql: Sql): number =>
  sql.one("SELECT 1 AS n FROM sqlite_master WHERE type = 'table' AND name = 'slash_call'") === undefined
    ? 0
    : (sql.one<{ n: number | null }>('SELECT MAX(rowid) AS n FROM slash_call')?.n ?? 0);

/**
 * Slash's daily look, asked on an alarm and after a request: the record decides whether it is due. It never throws.
 *
 * A LOOK THAT FAILS IS SEEN IN HEALTH. It once wrote one console line and went on, so a dead look was invisible
 * in the engine's readings. Now the asks that failed during the tick, and a tick that threw, are counted where the
 * readings count a failed background ask (`lookCounted`), with the provider's words, so Settings says "Today's look
 * failed: ..." and never a key or an address. `ledger` names Slash's store; absent, the store the record's model noted
 * on its last ask is used, and with neither the failure is the log line alone, as it was.
 */
export async function slashLook(api: Pick<RecordApi, 'slashTick'>, ledger: LookLedger = {}): Promise<boolean> {
  const ear = earOf(api);
  const store = (): Sql | undefined => ledger.sql ?? ear?.store?.();
  const clock = ledger.clock ?? { now: () => Date.now() };
  const began = Date.now();
  const from = new Date(clock.now()).toISOString();
  let since: number | null = null;
  try {
    const sql = store();
    since = sql === undefined ? null : ledgerMark(sql);
  } catch {
    since = null;
  }
  let threw: string | null = null;
  let more = false;
  try {
    const out: unknown = await api.slashTick(ledger.budget === undefined ? undefined : { budget: ledger.budget });
    more = typeof out === 'object' && out !== null && (out as { more?: unknown }).more === true;
  } catch (e) {
    const said = e instanceof Error ? e.message : String(e);
    console.error('slash:', said);
    threw = lookWords(said);
  }
  const heard = ear !== null && ear.words !== null && ear.at >= began ? ear.words : null;
  if (threw === null && heard === null) return more;
  try {
    const sql = store();
    if (sql !== undefined) lookCounted(sql, since, from, heard ?? threw, clock.now(), threw !== null);
  } catch (e) {
    console.error('slash: the failed look could not be counted:', e instanceof Error ? e.message : String(e));
  }
  return more;
}

/**
 * Whether the look has work due now, asked after a request and doing none of it (`slashTick`'s `defer`). It never throws.
 *
 * A REQUEST NO LONGER CARRIES THE LOOK. `slashLook` ran in every request's `waitUntil` but the version poll's and
 * `boot`'s, and the update pass and the page walks it starts drew every page there: from 00:00 UTC on 30 October each
 * `/api/pulse` on his record (one every 25 s while a session was open) spent 14 to 17 s of CPU, about 2,100 s an hour,
 * and the alarm and the bank's texts queued behind it. A request now only asks whether anything is due, in a few
 * indexed reads, and the host wakes its alarm for it, which does the work a slice at a time.
 */
export async function slashDue(api: Pick<RecordApi, 'slashTick'>): Promise<boolean> {
  try {
    const out: unknown = await api.slashTick({ defer: true });
    return typeof out === 'object' && out !== null && (out as { why?: unknown }).why === 'later';
  } catch (e) {
    console.error('slash:', e instanceof Error ? e.message : String(e));
    return false;
  }
}

/* ── erasing a person from Slash's ledger ─────────────────────────────────────────────────────────────────────────────── */

/**
 * `eraseSlash` over this object's Slash store, or nothing where no ledger was ever built here. The ledger rows it touched.
 *
 * THE PACKAGE IS LOADED ONLY WHERE THERE IS A LEDGER, which is `46 §5.1` kept on this path too: a Worker that never built an
 * engine has no `slash_call` table, nor version 1's `call`, and the erasure finishes without evaluating the module.
 */
export async function slashErased(sql: Sql, subjects: readonly string[]): Promise<number> {
  if (sql.one("SELECT 1 AS n FROM sqlite_master WHERE type = 'table' AND name IN ('slash_call', 'call')") === undefined) return 0;
  const { eraseSlash } = await import('@braindog/slash');
  return eraseSlash(sql, subjects);
}

/**
 * The record's `erase`, followed by `eraseSlash` over the store this object hands every Slash engine, so an erasure reaches
 * the questions Slash kept. `Record$.#open` calls it once, on the record it has just built.
 *
 * THE RECORD CANNOT DO IT ITSELF: it has no edge to `@braindog/slash` and must not, and the kernel's cascade walks the
 * record's own tables and names none of Slash's. So the host that holds both finishes the erasure.
 *
 * ONLY WHEN THE RECORD ANSWERED `ok`, so every refusal it gives (a caller who is not the owner in a browser, a subject too
 * short) stands for the ledger too. A ledger that could not be erased is a refusal of its own and not the record's report:
 * the record's part is done and cannot be undone, and answering the erasure whole would say something that did not happen.
 * Asked again, the record finds nothing more and the ledger is walked again.
 */
export function slashErasing(api: Pick<RecordApi, 'erase'>, sql: Sql): void {
  const erase = api.erase.bind(api);
  api.erase = async (args, ctx) => {
    const out = await erase(args, ctx);
    if (!out.ok) return out;
    try {
      await slashErased(sql, args.subjects);
    } catch (e) {
      return no(
        'INTERNAL',
        `The record erased every value naming them, and Slash's own ledger could not be erased: ${e instanceof Error ? e.message : String(e)} Erase again once Slash answers.`,
      );
    }
    return out;
  };
}
