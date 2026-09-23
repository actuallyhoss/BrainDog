/**
 * A model for Spark at an endpoint: the adapter a host builds behind `@braindog/record`'s `SparkModel` port.
 *
 * THE RECORD NEVER SEES THE ADDRESS OR THE KEY. It is handed an object with a name and `draft()`. The key is asked for on each
 * call (`key()`), from the host's environment or from the person's own key in the record's vault, and dropped when the call
 * returns: it is never kept in a variable here, logged, thrown or put in what the model is sent.
 *
 * ONE SHAPE ON THE WIRE, the chat-completions request most endpoints speak (a self-hosted server, a gateway, a provider),
 * asked for a JSON object. What comes back is only text to the record: `fromModel` checks it, and `propose` checks it again.
 *
 * NO RUNTIME HERE, like `actions.ts`: no bare `fetch`, so both hosts import it and pass their own `send`.
 *
 * ── WHAT THIS FILE IS TO `packages/spark`, DECIDED HERE AND NOT LEFT TO BE ARGUED ABOUT ─────────────────────────────────
 *
 * THEY ARE TWO FEATURES THAT SHARE A NAME, AND NEITHER IS A NEWER VERSION OF THE OTHER, so neither is deleted. This file is
 * the model behind the RECORD's Spark, which reads how a BrainDog is used and drafts `pack`, `settings` and `arrange`
 * proposals about its arrangement, and a `change` that builds a register, an ingest, a rule or a page
 * (`packages/record/src/spark.ts`, `loop/research-spark.md` S15, `loop/research-shell-mcp.md` §4 Brief D). `@braindog/spark` is
 * `docs/46`'s assistant engine: a person's typed question turned into a predicate, their own rows, and one cited proposal
 * with verbs, plus the ingest-pattern proposer, the meter and the tiers.
 *
 * THEY OVERLAP ON EXACTLY ONE BODY KIND OF SEVEN, AND `rowset` IS IT. An earlier line here called the two sets disjoint,
 * which `grep -n rowset packages/record/src/spark.ts` refutes at `:622`: the record's Spark files `pack`, `settings`,
 * `arrange`, a model's `change` (Brief D), and one `rowset`, the skill row a use case names and the Skills list has not
 * got. The package files `query`, `options`, `rowset` and `pattern`. The one shared kind is not one feature written twice either, because what reaches it
 * differs: the record's is drafted from usage by rules with no model in the path, and the package's is drafted from a typed
 * question against rows the asker may read and is refused unless it cites one. So a deletion either way loses a feature, and
 * a rewrite of one as a thin caller of the other would be a rewrite of what it does, not of how it calls out.
 *
 * WHAT THEY SHARE IS EXACTLY THE WIRE, AND THAT IS THE SEAM. `46 §1`'s first and third boundaries are that the package's
 * ports are `{ Sql, Clock, Inference }` and that it never sees a credential: it cannot fetch a URL and cannot unwrap a key,
 * by having no port that could. This file is the half that can do both, and it already does it once. So it does it twice,
 * from one configuration and one key path: `sparkModelOf` for the record's port and `sparkInferenceOf` for the package's,
 * with `endpointOptionsOf` deciding once whether a key could ever be had.
 *
 * AND THE PACKAGE'S OTHER PORT IS THE RECORD, WHICH NOTHING IN THIS TREE IMPLEMENTS. Every method the package has
 * (`read` · `propose` · `proposePattern`) reads through `RecordApi.project`, the READ+ projection of `30 §9` and `45 §4.4`,
 * and `grep -rn 'Projection' packages apps` finds the type in `packages/spark` and nowhere else: the record has `boot`,
 * `schema`, `list`, `search`, `get` and `propose`, and no `project`. That missing method, not a missing import, is why the
 * thirteenth package reached no record. `sparkRecord` below is the bridge over it, built from those six guarded methods, so
 * the scoping, the refusals and the field ceilings stay the record's. It is a bridge and says so: when the record grows
 * `project`, `sparkRecord` is deleted and the app passes the record's stub instead.
 *
 * WHY THIS FILE STILL DOES NOT IMPORT THE PACKAGE. `46 §5.1`: with `SPARK_ENDPOINT` unset neither host imports it, and set,
 * the HOST does `await import('@braindog/spark')` once. An import here would be that decision taken one level too low, in a
 * module every host loads. So the two ports are declared structurally, which is the move the package itself makes for
 * `RecordApi` and `Inference`, and `createSpark` is called by the app with what this file builds.
 */

import { ok, type Refusal, type Result, type Sql } from '@braindog/ports';
import type { Entry, RegisterDecl } from '@braindog/kernel';
import type { CallContext, RecordApi, SparkFormInput, SparkModel, SparkModelInput } from '@braindog/record';

import type { SparkAsk } from './spark-answers.ts';

/** How long a draft may take before Spark's own rules speak instead. */
export const SPARK_TIMEOUT_MS = 30_000;

/** At most this much of an answer is read. Three proposals are a few kilobytes. */
const ANSWER_BYTES = 64_000;

/**
 * The most tokens one side of one call is billed, whatever the provider's body says (`counted`).
 *
 * A MILLION, WHICH IS SEVENTY TIMES THE LARGEST CALL THE PACKAGE MAKES: its `propose` template caps the prompt at 12,000
 * tokens and the completion at 1,500, and the largest `maxTokens` any template sends is 2,048. A count past it is not a
 * count a call to this host can have spent. It keeps the ledger's columns whole, and tier `a`'s `neurons`, at the dearest
 * rate in `MODELS` (400,000 a million out), comes to 400,000 for one side, which an `INTEGER` column holds exactly.
 */
export const SPARK_TOKENS_CEILING = 1_000_000;

/** What the model is told. Data, so it can be read and reviewed in one place. */
export const SPARK_INSTRUCTIONS = [
  'You are Spark, the manager of one BrainDog: a record a person keeps, arranged as lists, pages, packs and a voice.',
  'You are given how the record is used: which lists grow, which pages are opened, what nothing has touched, what agents write, and what the host offers to install.',
  'Propose at most `most` changes that would make this BrainDog fit how it is really used. Each is one question the owner answers on Decide, with the reason in the question.',
  'Answer only JSON: {"drafts":[{"question":"...","body_kind":"pack"|"settings"|"arrange"|"change","body":{...}}]}. The rules\' drafts show the body shapes.',
  'pack bodies: {"install":"<offered id>"}, {"enable":"<id>"}, {"disable":"<id>"}. settings: {"pack":"<id>","values":{...}} or {"voice":{"home":"..."}}. arrange: {"why":["..."],"usecase"?,"packs"?,"pages"?,"settings"?,"voice"?}.',
  'change builds what the record does not have yet, such as a rate fetched on a schedule into a list: {"to":{"id":"ingest.<id>","kind":"ingest","body":{...}}} for one register, ingest, rule or page, or {"to":{"declarations":[...]}} for several that belong together, like a list and the door that fills it. Write each body whole, in the record\'s grammar for its kind (grammar/register, grammar/ingest, grammar/rule, grammar/page). Never write what it calls out to: the record works that out and shows the owner.',
  'Tone is settings too: the words the speaking use case declares are in usage.tone.settings (voice_* lines, label_* words), and only those names may be set, as {"pack":"<usage.tone.pack>","values":{"label_tickets":"Issues"}}, with the reason drawn from how the record is used.',
  'Never name a figure that is not in the reading. Write plainly and warmly, with no dashes used as punctuation. If nothing would help, answer {"drafts":[]}.',
].join('\n');

/**
 * What the model is told when it forms a first plan (`SparkModel.form`). It is handed only the sentence the owner typed, what
 * the plan is, today, and each list's limits; the answer is checked row by row (`formedRows`) and filed on Decide, never written.
 */
export const SPARK_PLAN_INSTRUCTIONS = [
  'You are Spark, the manager of one BrainDog. Its owner has just said what they are starting, in `said`. Form a first plan for it, in the lists given in `lists`, which the owner reads on Decide before anything is made.',
  '`what` says what the plan is. Each list gives its register, the least and most rows, and the fields a row may have: {"text":n} is text of at most n characters, {"one":[...]} is one of those values, {"link":"<register>"} is the position from 0 of a row of that list in your plan, and {"days":n} is a whole number of days from today, at most n. A field marked required must be given. Give no other field and no other list.',
  'Answer only JSON: {"plan":{"<register>":[{"<field>":...}]}}, with the lists in the order given, so a link points at a row already listed.',
  'Make it specific to what was said: concrete, small steps a person can take this week, milestones in the order they are reached, the real choices this kind of project faces, and the kinds of help worth finding.',
  'Never write a web address, an email address, a price you were not told, a name of a real person, or anything that looks like a key or a password. Write plainly and warmly, in short sentences, with no dashes used as punctuation.',
].join('\n');

export type EndpointModelOptions = {
  /** The chat-completions address, such as `http://localhost:11434/v1/chat/completions`. */
  url: string;
  /** The model name the endpoint expects, when it expects one. */
  model?: string | undefined;
  /** The key for this call, or `null` for none. Asked for on every call and never kept. */
  key?: (() => Promise<string | null>) | undefined;
  /** How a request leaves this host: `fetch` on both hosts, a fake in tests. */
  send: (input: URL, init: RequestInit) => Promise<Response>;
  /** What the Spark page says drafted: `endpoint`, or `your key`. */
  name?: string | undefined;
  timeoutMs?: number | undefined;
};

/** The address, checked once at construction, so a misconfigured endpoint fails at boot and not at the first ask. */
const endpointUrl = (raw: string): URL => {
  const url = new URL(raw);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('A Spark endpoint is an http or https address.');
  return url;
};

/**
 * A throw after the endpoint answered, which the package reads by its `answered` mark and not by its class.
 *
 * `UNREACHABLE` WAS EVERY THROW, AND FOUR OF THEM CAME AFTER A MODEL RAN. `core.run` calls any throw out of `complete`
 * `UNREACHABLE`, `answer` settles that row under `-`, which no count reads, and `serveAsks`'s `RETRIED` asks it again.
 * Measured by `loop/research-batch-forty-six-audit.md` finding 4 through the self-host: a model answering one question with
 * a 200 of 70,000 characters served four completions, the endpoint reporting 16,000 completion tokens each, and the ledger
 * held four rows under `-` with `tokens_out` 0 (`apps/selfhost/test/spark-answers.test.ts`). The size and the parse are
 * read after a 200, so a model ran and the provider may have billed; the timeout is counted with them because the cap is
 * the bound on spend and a model that ran out the clock may have run to the end.
 *
 * A STATUS THAT IS NOT `ok` IS NOT ONE OF THEM, AND WAVE 47 HAD IT AS ONE. `loop/research-worker-spark.md` §6 Q8, whose
 * default is taken here for the owner: marked, a 429, a 502, a 503 or a 401 spent an ask and ended the run on the first
 * rung, where before wave 47 each was retried uncounted. A status is the endpoint saying no completion was served, so it
 * is a plain throw again (`post`), and what is marked is what a provider bills: the size, the parse, a body that broke
 * off, and the timeout.
 *
 * A MARK AND NOT AN IMPORT, because the package may not import this host (`46 §5.1`) and reads the field structurally.
 * `usage` is the provider's count where the body held one, so the row bills what was reported and not the estimate.
 * `model` is the name this host sent, for the row's `model` column (see `endpointInference`).
 */
export class SparkAnsweredError extends Error {
  readonly answered = true;
  readonly usage: { in: number; out: number } | undefined;
  readonly model: string | undefined;
  constructor(message: string, usage?: { in: number; out: number }, model?: string) {
    super(message);
    this.name = 'SparkAnsweredError';
    this.usage = usage;
    this.model = model;
  }
}

/**
 * The provider's own count in a body Spark will not otherwise read, or nothing.
 *
 * THE BODY IS ALREADY IN MEMORY, because `res.text()` read it to measure it, so parsing it for two numbers costs one more
 * pass and changes no bound. What is kept is the two counts: none of the content reaches the package.
 */
const usageIn = (text: string): { in: number; out: number } | undefined => {
  try {
    const usage = (JSON.parse(text) as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } } | null)?.usage;
    /* BOTH OR NEITHER, so a body with no count is billed on the package's estimate and not as zero tokens. */
    const tin = usage?.prompt_tokens;
    const tout = usage?.completion_tokens;
    return typeof tin === 'number' && typeof tout === 'number' ? { in: counted(tin), out: counted(tout) } : undefined;
  } catch {
    return undefined;
  }
};

/**
 * One POST to the endpoint, and the body it answered.
 *
 * ONE FUNCTION FOR BOTH PORTS, because the key discipline is the part that must not be written twice: asked for on this call
 * (`key()`), put in a header and nowhere else, and gone when the string this returns is handed back. A second copy of these
 * eight lines is a second place for the key to end up in a request body or an error sentence.
 *
 * TWO THROWS ARE PLAIN, AND THE PACKAGE SETTLES BOTH UNDER `-` AND THE HOST ASKS BOTH AGAIN: a `send` that never
 * resolved, and not by the clock (a refused connection, a name that did not resolve), which is audit forty-two's finding
 * 6 and stays fixed; and a status that is not `ok`, which is Q8's default (`SparkAnsweredError` says why). Everything
 * after a 200, and the timeout, is a `SparkAnsweredError`, carrying `model`, the name the body was sent with.
 */
const post = async (url: URL, options: EndpointModelOptions, body: unknown, model?: string): Promise<string> => {
  const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' };
  const key = options.key ? await options.key() : null;
  if (key) headers.authorization = `Bearer ${key}`;
  const ms = options.timeoutMs ?? SPARK_TIMEOUT_MS;
  const signal = AbortSignal.timeout(ms);
  /* THE SIGNAL AND NOT THE ERROR'S NAME, because a `send` is anybody's function and what it rejects with on an abort is
     its own choice: fetch says `TimeoutError`, a fake says whatever it was written to. The signal says whether the clock
     ran out. */
  const timedOut = (): SparkAnsweredError =>
    new SparkAnsweredError(`The Spark endpoint did not finish answering within ${ms / 1000} seconds.`, undefined, model);
  let res: Response;
  try {
    res = await options.send(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      /* `manual`, NEVER `error`: workerd refuses `redirect: 'error'` outright ("must be one of follow or manual") before any
         request leaves, so on the Worker every Spark call was UNREACHABLE and fell to the rules. `manual` still follows
         nothing: a 3xx, or the opaque redirect a browser-style fetch hands back, is not `ok` and is thrown below. */
      redirect: 'manual',
      signal,
    });
  } catch (e) {
    throw signal.aborted ? timedOut() : e;
  }
  /* THE STATUS AND NOTHING ELSE. An error body can echo the request, and the request can carry the key. A PLAIN THROW,
     NOT MARKED: no completion was served, so the package settles it under `-` and the ladder asks again (Q8's default). */
  if (!res.ok) throw new Error(`The Spark endpoint answered ${res.status}.`);
  let text: string;
  try {
    text = await res.text();
  } catch {
    throw signal.aborted ? timedOut() : new SparkAnsweredError('The Spark endpoint broke off its answer.', undefined, model);
  }
  if (text.length > ANSWER_BYTES) throw new SparkAnsweredError('The Spark endpoint answered more than Spark reads.', usageIn(text), model);
  return text;
};

/** A `SparkModel` over a chat-completions endpoint. Every failure is a throw, which the record reads as "the rules speak". */
export function endpointModel(options: EndpointModelOptions): SparkModel {
  const url = endpointUrl(options.url);
  /* ONE REQUEST SHAPE FOR BOTH ASKS: what differs is what the model is told and what it is handed. */
  const ask = async (instructions: string, input: unknown): Promise<unknown> =>
    answerOf(
      await post(url, options, {
        ...(options.model ? { model: options.model } : {}),
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: instructions },
          { role: 'user', content: JSON.stringify(input) },
        ],
      }),
    );
  return {
    name: options.name ?? 'endpoint',
    draft: (input: SparkModelInput): Promise<unknown> => ask(SPARK_INSTRUCTIONS, input),
    form: (input: SparkFormInput): Promise<unknown> => ask(SPARK_PLAN_INSTRUCTIONS, input),
  };
}

/** A model that fences its JSON is read inside the fence. */
const FENCE = /```(?:json)?\s*([\s\S]*?)```/u;

/** The drafts in an answer: a chat completion's message content as JSON, or a JSON body that is the drafts itself. */
export function answerOf(text: string): unknown {
  const parsed = JSON.parse(text) as { choices?: { message?: { content?: unknown } }[] };
  const content = parsed?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') return parsed;
  const fenced = FENCE.exec(content);
  return JSON.parse(fenced ? fenced[1]! : content);
}

/* ── the `Inference` port of `@braindog/spark`, over the same endpoint ─────── */

/**
 * The package's `Inference`, declared here and imported from nowhere.
 *
 * `46 §4.6` DOES THIS IN THE OTHER DIRECTION and says why: a structural subset is how two packages meet without an edge
 * existing. `InferenceCall` has no `tools` field, which is `46 §13` D9 and not an omission: every Spark call is a
 * schema-constrained generation and retrieval is code, so the rule is the type rather than a reviewer's note. Copying the
 * shape means copying that, and the line below is where a host would have to add one to break it.
 */
export type SparkInferenceCall = {
  model: string;
  messages: readonly { role: 'system' | 'user'; content: string }[];
  maxTokens: number;
  jsonSchema: object;
};

/**
 * What the package reads back. `usage` is the provider's own count, which is what the meter bills (`46 §4.1`).
 *
 * `model` IS THE NAME THIS HOST SENT, AND IT IS OPTIONAL. The package's `InferenceReply` has no such field and every
 * call it accounts reads it structurally (`nameIn`, `packages/spark/src/propose.ts`), as `answer` reads `answered` off a
 * throw, so an adapter that leaves it out keeps the template's name.
 */
export type SparkInferenceReply = { text: string; usage: { in: number; out: number }; model?: string };

export interface SparkInference {
  complete(call: SparkInferenceCall): Promise<SparkInferenceReply>;
}

/**
 * The package's routing short names, the four `ModelId`s of `packages/spark/src/prompts.ts`, WRITTEN OUT AND NOT IMPORTED.
 *
 * `packages/host` MUST NOT DEPEND ON `@braindog/spark` (`31 §2` puts the package at row 13, and `46 §5.1` has only the app
 * `import()` it, and only when an endpoint is configured), so reading `MODELS` here would be the edge that rule forbids,
 * loaded on every host. The cost is a fifth model added to the package and not to this list: that name would reach the
 * endpoint unmapped, which a self-host sees as its server refusing an unknown model. `test/spark.test.ts` drives every key of
 * the package's own `MODELS` through this rule (a test may reach across; `graph.mjs` reads `src/**` alone), so that drift is
 * a red test and not a silent refusal.
 */
const ROUTING_NAMES: ReadonlySet<string> = new Set(['llama-3.2-1b', 'glm-5.3-flash', 'glm-5.3', 'bge-m3']);

/** What the endpoint is sent for what the package asked: `SPARK_MODEL` in place of a short name, anything else as it came. */
const modelSent = (asked: string, configured: string | undefined): string =>
  configured !== undefined && ROUTING_NAMES.has(asked) ? configured : asked;

/**
 * A count the endpoint may not have sent. Absent is zero, and zero bills nothing rather than guessing a figure.
 *
 * WHOLE AND NOT NEGATIVE, because the ledger's `tokens_in` and `tokens_out` are `INTEGER NOT NULL` and SQLite keeps what
 * it is handed: measured on 23 September, a body reporting `prompt_tokens: -40` and `completion_tokens: 2.5` reached the
 * package as exactly that, a count that subtracts from the month and a REAL in an integer column. A fraction is rounded
 * up, as the package's own estimate (`tokens`) rounds, so a count nobody can bill in halves is never billed low.
 *
 * AND NOT PAST `SPARK_TOKENS_CEILING`, because whole and not negative is also true of `1e300`: `Number.isInteger(1e300)`
 * holds, so wave 48's clamp handed it on, and measured on 23 September the ledger stored `tokens_in` and `tokens_out` as a
 * REAL 1e300, with tier `a`'s `neurons` a REAL beside them (`packages/spark/test/spark-ledger-model.test.ts`). A number
 * past the ceiling, `Infinity` included, which is what `JSON.parse` makes of `1e999`, is billed at the ceiling and not as
 * zero, so a body that lies high is still counted high. `NaN > 0` is false, so a count that is not a number stays zero.
 */
const counted = (value: unknown): number =>
  typeof value === 'number' && value > 0 ? Math.min(Math.ceil(value), SPARK_TOKENS_CEILING) : 0;

/**
 * The same endpoint as the package's `Inference` port.
 *
 * THE SHORT NAME IS THE PACKAGE'S AND THE PROVIDER ID IS THIS HOST'S (`46 §2`, the routing table's note). The package asks
 * for `glm-5.3-flash` because that is what its table routes the job to; what answers is whatever `SPARK_MODEL` names on this
 * host, an Ollama tag or a gateway's id, and the mapping lives here so no provider is named in the package. With no
 * `SPARK_MODEL` the short name is passed through, which is right for an endpoint that serves exactly one model and says so.
 *
 * ONLY A SHORT NAME IS MAPPED, AND A NAME THE OWNER TYPED PASSES THROUGH. This line used to read
 * `options.model ?? call.model`, and measured on 22 September an owner's `llama3:8b` on tier `byo` was posted as
 * `ENV_MODEL`: the package hands `settings.model` down as `call.model` on tiers `b` and `byo` (`propose.ts`), so on any
 * host with `SPARK_MODEL` set the model a settings route stored was a model nothing sent (`loop/research-spark-routes.md`
 * F1). `modelSent` below is the whole rule, and `sparkNamedEngine` uses the same function so that what a status names and
 * what the endpoint is sent cannot come apart.
 *
 * `response_format` IS `json_schema` AND NOT `json_object`, which is the whole difference from `endpointModel`'s ask: the
 * package pins a schema per job and re-checks the answer by hand (`checkSchema`), and an endpoint that enforces the schema
 * turns that second check into a formality instead of a retry. `strict: true` is the half that asks for enforcement rather
 * than a suggestion.
 *
 * EVERY FAILURE IS A THROW, which `core.run` reads as `UNREACHABLE` and accounts for: the ask is refused, the meter still
 * carries the row, and nothing is filed. A throw after a 200 is a `SparkAnsweredError`, which `answer` settles under the
 * model's name, counted, and which the ladder does not ask again. A status that is not `ok` is not one (`post`).
 *
 * THE REPLY AND THE THROW BOTH SAY WHICH MODEL WAS SENT, because the package cannot know `SPARK_MODEL` and its row named
 * the routing short name instead: measured on 23 September through the self-host with `SPARK_MODEL=llama3`, the ledger
 * held `glm-5.3-flash` for a completion the endpoint was asked of as `llama3` (`apps/selfhost/test/spark-answers.test.ts`).
 * `sparkNamedEngine` corrects `status()` the same way and with the same `modelSent`.
 */
export function endpointInference(options: EndpointModelOptions): SparkInference {
  const url = endpointUrl(options.url);
  return {
    complete: async (call: SparkInferenceCall): Promise<SparkInferenceReply> => {
      const model = modelSent(call.model, options.model);
      const text = await post(
        url,
        options,
        {
          model,
          temperature: 0,
          max_tokens: call.maxTokens,
          response_format: { type: 'json_schema', json_schema: { name: 'answer', schema: call.jsonSchema, strict: true } },
          messages: call.messages.map((m) => ({ role: m.role, content: m.content })),
        },
        model,
      );
      let parsed: {
        choices?: { message?: { content?: unknown } }[];
        usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
      };
      try {
        parsed = JSON.parse(text) as typeof parsed;
      } catch {
        /* A 200 THAT IS NOT JSON, a proxy's page or a stream cut short, came from a reached endpoint, and without the mark
           the parser's own `SyntaxError` read as a model not reached. There is no count in it to bill. */
        throw new SparkAnsweredError('The Spark endpoint answered with a body that is not JSON.', undefined, model);
      }
      const content = parsed?.choices?.[0]?.message?.content;
      /* THE TEXT AND NOT THE PARSE, because the package parses it itself and then checks it against the schema it sent. An
         endpoint that answered the object bare, with no `choices`, is read as having answered the whole body. */
      const answered = typeof content === 'string' ? (FENCE.exec(content)?.[1] ?? content) : text;
      return {
        text: answered,
        usage: { in: counted(parsed?.usage?.prompt_tokens), out: counted(parsed?.usage?.completion_tokens) },
        model,
      };
    },
  };
}

/* ── the model a host hands the record, on both hosts ─────────────────────── */

/** The vault label a person's own model key is kept under, on the self-host and on the Worker alike. */
export const SPARK_KEY_LABEL = 'spark';

export type SparkHostConfig = {
  url: string;
  model?: string | undefined;
  /** An operator's key, which only a self-host has. Absent, the person's own key in the vault, labelled `spark`. */
  key?: string | undefined;
};

export type SparkHostDeps = {
  /** The record's vault rows, read on each call so a key put in or revoked after boot counts. */
  grants: () => readonly { id: string; label: string; revoked_at: string | null }[];
  /** How this host opens a sealed key, or `null` when it cannot open any (a Worker with no `KEK` bound). */
  openKey: ((grant: { id: string; label: string }) => Promise<string | null>) | null;
  send: (input: URL, init: RequestInit) => Promise<Response>;
};

/**
 * THE SAME PORT ON BOTH HOSTS. `SPARK_ENDPOINT` names the address and `SPARK_MODEL` the model; the key is the operator's
 * `SPARK_KEY` where a self-host set one, else the person's own key in the vault under `spark`, opened on each call through the
 * host's key store (one `grant.read` event each time) and dropped when the call returns.
 *
 * NO MODEL WHEN NO KEY COULD EVER BE HAD: nothing configured, or no operator key and a host that cannot open the vault. Then
 * `/api/version` says `spark: false` and Spark's own rules draft, which is the product working.
 */
export function sparkFromEnv(env: Readonly<Record<string, unknown>>, options: { operatorKey?: boolean } = {}): SparkHostConfig | undefined {
  const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);
  const url = text(env.SPARK_ENDPOINT);
  if (!url) return undefined;
  const key = options.operatorKey === false || typeof env.SPARK_KEY !== 'string' || env.SPARK_KEY === '' ? undefined : env.SPARK_KEY;
  return { url, model: text(env.SPARK_MODEL), key };
}

/**
 * The endpoint one host configured, or nothing at all.
 *
 * ONE RULE FOR BOTH PORTS, so `/api/version`'s `spark` flag cannot come to mean one thing for the record's model and another
 * for the package's engine. A host with no key path is a host with no Spark, and the two builders below must agree about it
 * on the same line, because that flag is what makes the client draw Spark's rows at all (`23 §8`).
 */
function endpointOptionsOf(config: SparkHostConfig | undefined, deps: SparkHostDeps): EndpointModelOptions | undefined {
  if (!config) return undefined;
  if (config.key === undefined && deps.openKey === null) return undefined;
  const open = deps.openKey;
  const own = async (): Promise<string | null> => {
    const grant = deps.grants().find((g) => g.label === SPARK_KEY_LABEL && g.revoked_at === null);
    return grant && open ? open(grant) : null;
  };
  return {
    url: config.url,
    model: config.model,
    key: config.key !== undefined ? async () => config.key ?? null : own,
    send: deps.send,
    name: 'endpoint',
  };
}

export function sparkModelOf(config: SparkHostConfig | undefined, deps: SparkHostDeps): SparkModel | undefined {
  const options = endpointOptionsOf(config, deps);
  return options === undefined ? undefined : endpointModel(options);
}

/** The same endpoint, the same key path, as the `Inference` the app hands `createSpark`. */
export function sparkInferenceOf(config: SparkHostConfig | undefined, deps: SparkHostDeps): SparkInference | undefined {
  const options = endpointOptionsOf(config, deps);
  return options === undefined ? undefined : endpointInference(options);
}

/**
 * Tier `b`'s adapter: this host's endpoint, asked with the key in the grant the owner's setting names, for one propose.
 *
 * `46 §5.9` HAS THE HOST OPEN THE OWNER'S GRANT AND HAND THE PACKAGE AN ADAPTER, and the package never sees the key
 * (`propose.ts` uses `byok` for the proposal and nothing else). The setting names a grant by id and never holds a key, so
 * this is where the id becomes a key, on the call and through the same `post` every other Spark request takes.
 *
 * THREE THINGS DIFFER FROM THE HOST'S OWN PATH, AND EACH IS A WAY THE OWNER'S CHOICE WOULD OTHERWISE BE OVERRULED:
 *
 * - THE GRANT IS THE ONE NAMED, NOT THE ONE LABELLED `spark`, and an operator's `SPARK_KEY` does not stand in for it. With
 *   the host's `endpointOptionsOf` handed in, measured in `test/spark.test.ts`, the proposal went out as
 *   `Bearer fake-key-of-g_...HAD`, the `spark`-labelled key, on a record whose setting named `g_...HAE`.
 * - `SPARK_MODEL` IS NOT CONSULTED. It maps the package's routing names to what this host's tier `a` runs; on the owner's
 *   key and the owner's bill the name the owner typed is sent as typed, a short one included.
 * - A KEY THAT CANNOT BE OPENED IS A THROW, NOT A CALL WITH NO `authorization`. The host's path sends keyless when the vault
 *   has no `spark` grant, which is right for an endpoint on the owner's own machine; here it would be an anonymous call
 *   against the owner's provider account, so nothing is sent and `core.run` records `UNREACHABLE`.
 *
 * `undefined` WHEN NO KEY COULD BE HAD: no endpoint, a host that cannot open keys (a Worker with no `KEK`), no grant named,
 * or a named grant that is revoked or was never in the vault. The package then answers its own `FORBIDDEN`, "Your key is
 * not open in this session", which is the sentence for each of those. Nothing is opened here: the key is asked for on the
 * call, so a propose that finds no rows is no `grant.read` on the record.
 */
export function sparkByokOf(config: SparkHostConfig | undefined, deps: SparkHostDeps, grantId: string | null): SparkInference | undefined {
  const open = deps.openKey;
  if (!config || open === null || grantId === null) return undefined;
  const live = () => deps.grants().find((g) => g.id === grantId && g.revoked_at === null);
  if (live() === undefined) return undefined;
  return endpointInference({
    url: config.url,
    key: async () => {
      const grant = live();
      const key = grant ? await open(grant) : null;
      if (!key) throw new Error('Your key for Spark could not be opened.');
      return key;
    },
    send: deps.send,
    name: 'your key',
  });
}

/**
 * The grant tier `b` names, read straight from the package's own `settings` row in the SQLite the app handed `createSpark`.
 *
 * A HOST READING A TABLE `46 §4.1` DEFINES, said out loud because it is the cost of this line. The package's `Status` carries
 * no `grant_id` and its engine exposes no `settings()`, and adding either is an edit to `packages/spark`; the host already
 * owns this handle, so one `SELECT` answers it without that edge (`loop/research-spark-routes.md` K1 chose this over a
 * package edit). If the package renames the column this answers `null` for nobody and throws for everybody, which the door
 * turns into a 500 on the first tier `b` propose rather than a silent fall to the included model.
 */
export const sparkGrantIdOf = (sql: Sql): string | null => {
  /* ONLY ON TIER `b`, because `configure` keeps `grant_id` when an owner moves back to `a` (`packages/spark/src/index.ts`,
     `grant = patch.grant_id === undefined ? before.grant_id : ...`). Answering it on `a` made every propose on the
     included model open the vault gate in `sparkByokFor`, so a read colleague on tier `a` would have been refused a key
     nobody was going to send. */
  const row = sql.one<{ tier: string; grant_id: string | null }>('SELECT tier, grant_id FROM settings WHERE singleton = 1');
  return row?.tier === 'b' ? (row.grant_id ?? null) : null;
};

/**
 * `46 §5.5` step 3's sentence for tier `b` with no open key, which `§5.9` step 4 has the host answer when the vault refuses.
 *
 * THE PACKAGE SAYS IT TOO, BUT ONLY AFTER PASS ONE HAS DRAFTED. `pass2` reads the rows, which on a `propose` with no
 * `ask_id` is a model call on this host's endpoint, and only then finds `byok` absent. So the host says it first, in the
 * same words, where no model has been asked anything.
 */
export const SPARK_KEY_CLOSED: Refusal = {
  code: 'FORBIDDEN',
  fix: 'Your key is not open in this session. Open the vault, or switch Spark to the included model.',
};

/**
 * The sentence for an asker the vault refuses when the INCLUDED model is keyed from the vault, on any tier.
 *
 * NOT `SPARK_KEY_CLOSED`, whose advice is to switch to the included model: here the included model is the key that is
 * closed, so that advice would send a colleague round in a circle. What opens it is the owner, recently signed in.
 */
export const SPARK_HOST_KEY_CLOSED: Refusal = {
  code: 'FORBIDDEN',
  fix: "Spark answers here on a key kept in this record's vault, which opens only for the owner signed in within the last fifteen minutes. Sign in again, or ask the owner.",
};

/**
 * A refusal from `sparkByokFor` that stands in front of this host's own drafting as well as the proposal.
 *
 * `hostKey` IS WHAT TELLS THE DOOR TO REFUSE A READ WITH IT. A read never uses `byok`, so a refusal about tier `b`'s own
 * grant is nothing to a read, and a colleague's read on an operator's `SPARK_KEY` must still answer. Only when the key
 * this host drafts on is the vault's does the same refusal stop a read, and this flag is the one bit that says which.
 */
export type SparkKeyRefused = { ok: false; refusal: Refusal; hostKey?: true };

/** What `sparkByokFor` needs of the record: the vault gate, asked through a read that writes no event, and the kernel. */
export type SparkVaultApi = Pick<RecordApi, 'kernel' | 'listGrants'>;

/**
 * Whether this host's included model is keyed from the vault: no operator key, and a live grant labelled `spark`.
 *
 * THE SAME TEST `endpointOptionsOf`'s `own` makes, on the same rows, so the gate stands exactly where that path would open a
 * grant and nowhere else. With no such grant the included model is called keyless, which opens nothing to gate.
 */
const hostKeyedFromVault = (config: SparkHostConfig, grants: () => readonly { label: string; revoked_at: string | null }[]): boolean =>
  config.key === undefined && grants().some((g) => g.label === SPARK_KEY_LABEL && g.revoked_at === null);

/**
 * Tier `b`'s adapter FOR THIS ASKER: the vault's own check on their session first, and every `grant.read` signed by them.
 *
 * `46 §5.9` step 2 HAS THE HOST OPEN THE GRANT "UNDER THE ASKER'S BROWSER SESSION", AND AS BUILT IT OPENED IT AS `system`.
 * Both hosts handed the door `sparkByokOf` over their `keyOpener`, which calls `kernel.openGrant(..., 'system')`, and the
 * door's `ctx` was dropped on the floor. Measured in `apps/selfhost/test/spark-byok-guard.test.ts` before this function existed: a `read`
 * colleague whose last proof was fifty minutes old proposed, got 200, and the proposal went out on the owner's key; the
 * owner's own ask left one `grant.read` whose actor was `system`, so an owner reading the vault's log could not tell her own
 * asks from anybody else's (`loop/research-batch-thirty-one-audit.md` §1).
 *
 * SO THE VAULT GATE RUNS FIRST, AND IT IS THE RECORD'S AND NOT A COPY. `listGrants(ctx)` is the record's `vault(ctx)` and
 * nothing else: a person at `owner`, never a bearer, and a proof in the last fifteen minutes. It writes no event, which is
 * why it is the probe and `openGrant` is not: a propose that finds no rows opens no key, and should leave no `grant.read`.
 * Refused, the door answers `SPARK_KEY_CLOSED` and the engine is never called, so nothing is drafted either.
 *
 * AND THE READ IS SIGNED BY THE ASKER. `wire` is handed the asker's id as `actor`, and each app's `keyOpener` now takes
 * one (`system` stays its default, for scheduled actions, where nobody asked). That is exactly what the record's own
 * `openGrant(args, ctx)` does after the same gate (`packages/record/src/index.ts`, `kernel.openGrant(args, actorOf(ctx))`),
 * split in two so the gate can answer before the model is asked and the event is written only when the key is.
 *
 * NO VIEW OF THE RECORD IS BUILT HERE ANY MORE. Both apps' `wireOf` (in their `spark.ts`) now take the actor and hand it
 * straight to `keyOpener`, so the id this function reads off `ctx` reaches the `grant.read` without a second `RecordApi`
 * standing in front of the real one. Before both apps passed it on, this function built that stand-in with
 * `Object.create` so `openGrant` alone would sign as the asker; the four lines are gone with the last caller that needed
 * them, and `apps/selfhost/test/spark-byok-guard.test.ts` ("signed by her and not by system") is the case that would go
 * red if `actor` stopped reaching `wire`.
 *
 * AND THE SAME GATE STANDS IN FRONT OF THE INCLUDED MODEL WHEN THAT MODEL IS KEYED FROM THE VAULT, on every tier. This
 * function used to answer `undefined` on tier `a` without asking anything, and `endpointOptionsOf` keys the included model
 * with the grant labelled `spark` whenever there is no `SPARK_KEY`, through an opener that signs `system`. Measured in
 * `apps/selfhost/test/spark-included-guard.test.ts` before this line: Bo, at `read` with a proof fifty minutes old, answered
 * `read=200 propose=200; 3 model calls; grant.read ["system","system","system"]`, every call on the owner's key
 * (`loop/research-batch-thirty-three-audit.md` §2). So the gate now runs there too, and its refusal carries `hostKey`, which
 * `serveSpark` reads to refuse a READ as well as a propose. A refusal about tier `b`'s own grant alone does not carry it,
 * because a read on an operator's key opens nothing of the owner's and a colleague may ask it.
 *
 * WHAT THIS DOES NOT DO IS SIGN THE INCLUDED MODEL'S `grant.read` WITH THE ASKER. The gate is what keeps anybody else from
 * reaching the key; the log line is `sparkAskerEngine`'s, below, which each app's door wraps its engine in so the included
 * model is built per ask, for the asker, and handed to `read` and `propose` as an argument.
 *
 * `undefined` WHERE NOTHING OF THE OWNER'S WOULD BE OPENED: tier `a` (from `sparkGrantIdOf`) on an operator key or a keyless
 * endpoint, and tier `a` on the vault's key once the gate has let the asker through.
 */
export async function sparkByokFor<A extends SparkVaultApi>(
  config: SparkHostConfig | undefined,
  grantId: string | null,
  api: A,
  ctx: CallContext,
  wire: (api: A, actor: string) => SparkHostDeps,
): Promise<SparkInference | SparkKeyRefused | undefined> {
  if (!config) return undefined;
  const hostKey = hostKeyedFromVault(config, () => api.kernel.grants());
  if (grantId === null && !hostKey) return undefined;
  const gate = await api.listGrants(ctx);
  if (!gate.ok) return hostKey ? { ok: false, refusal: SPARK_HOST_KEY_CLOSED, hostKey: true } : { ok: false, refusal: SPARK_KEY_CLOSED };
  if (grantId === null) return undefined;
  return sparkByokOf(config, wire(api, actorOf(ctx)), grantId);
}

/** Who a `grant.read` is signed by for this caller: the person behind a token, and the principal's own id otherwise. */
const actorOf = (ctx: CallContext): string => (ctx.principal.kind === 'token' ? ctx.principal.person : ctx.principal.id);

type Asked = {
  read(question: string, ctx: CallContext, inference?: SparkInference): Promise<Result<unknown>>;
  propose(question: string, ctx: CallContext, byok?: unknown, askId?: string, inference?: SparkInference): Promise<Result<unknown>>;
};

/**
 * The engine a door holds, with this host's own model built for the asker on every `read` and `propose`.
 *
 * THE INCLUDED MODEL IS BUILT ONCE PER HOST, WITH NOBODY ASKING, SO EVERY `grant.read` IT MADE WAS SIGNED `system`. Where
 * there is no `SPARK_KEY` that model is keyed with the vault's `spark` grant (`endpointOptionsOf`), and measured in
 * `apps/selfhost/test/spark-included-guard.test.ts` the owner's own fresh read left `grant.read ["system"]`, so the vault's
 * log could not tell her asks from a scheduled one. `sparkByokFor`'s gate already kept everybody else off that key; this
 * is the log line.
 *
 * `inferenceFor` IS BUILT PER CALL AND HANDED IN AS AN ARGUMENT, never kept. `@braindog/spark`'s `read` and `propose` take
 * it for that one ask, which is the only shape that holds with two asks in flight: a slot set around the call is shared by
 * both, and a colleague's read would open the key in the owner's name, or the other way about. `AsyncLocalStorage` would
 * scope it, and the Worker has not got it. Each app passes its own `wireOf(..., actor)`, the same wire `sparkByokFor`
 * signs tier `b`'s key with, so the two openings a propose may make are signed alike.
 *
 * `Object.create`, AS `sparkNamedEngine` DOES, so `status` and `configure` stay the wrapped engine's own.
 */
export function sparkAskerEngine<E extends Asked>(engine: E, inferenceFor: (actor: string) => SparkInference | undefined): E {
  const asked = Object.create(engine) as E;
  asked.read = (question, ctx) => engine.read(question, ctx, inferenceFor(actorOf(ctx)));
  asked.propose = (question, ctx, byok, askId) => engine.propose(question, ctx, byok, askId, inferenceFor(actorOf(ctx)));
  return asked;
}

/**
 * The first of the month, as the package's `call.ts` `monthOf` writes it, so a count here and a count there agree.
 */
const monthOf = (ms: number, add: number): string => {
  const at = new Date(ms);
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + add, 1)).toISOString();
};

export type SparkGuardDeps = {
  /** Spark's own SQLite, the one the app handed `createSpark`. */
  sql: Sql;
  clock: { now(): number };
  /** The record's vault rows, read on each settings save so a grant revoked a second ago counts, with the kind each holds. */
  grants: () => readonly { id: string; kind: string; label: string; revoked_at: string | null }[];
};

/**
 * The tiers whose drafts this host pays for and the package does not meter.
 *
 * `byo` IS HERE BESIDE `b`, AND `46 §4.1` CALLS IT "a self-host endpoint, unmetered". That describes an endpoint the owner
 * runs and pays for, and no such endpoint exists in the settings: they hold a tier, a model name, a grant and a cap, and
 * no address. So tier `byo` asks `SPARK_ENDPOINT` with this host's key, the included model's endpoint under a name the
 * owner typed. Measured in `apps/selfhost/test/spark-byok-guard.test.ts` before `byo` was listed: at `ask_cap: 1`, the four
 * reads after the first all answered 200 where the cap allowed one.
 */
const HOST_DRAFTED: readonly string[] = ['b', 'byo'];

/** `46 §5.9` step 1: the grant tier `b` names holds an API token. A password or an SSH key is sent as nobody's bearer. */
const SPARK_GRANT_KIND = 'api_token';

/**
 * OPTIONAL `answer`, BECAUSE THE PACKAGE GAINS IT IN A BRIEF BESIDE THIS ONE (`loop/research-infer-ask.md` §6 Brief B), and
 * both apps pass their engine here today. Required, every host would fail to typecheck until that package landed; absent,
 * the guard adds nothing, so a host on the older package keeps the shape it had.
 */
type Guarded = {
  status(): unknown;
  read(question: string, ctx: CallContext, inference?: SparkInference): Promise<Result<unknown>>;
  propose(question: string, ctx: CallContext, byok?: unknown, askId?: string, inference?: SparkInference): Promise<Result<unknown>>;
  configure(patch: Record<string, unknown>, ctx: CallContext): Result<unknown>;
  answer?(ask: SparkAsk, inference?: SparkInference): Promise<Result<{ text: string }>>;
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** `2026-10-01T00:00:00.000Z` as `1 October`, written out so the sentence does not depend on the runtime's locale. */
const dayOf = (iso: string): string => {
  const at = new Date(iso);
  return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}`;
};

/**
 * The package's engine, with the two host-side rules tier `b` was missing: its drafts counted against `ask_cap`, and a
 * save refused when the grant it names is not a live API token. Tier `byo`'s drafts are counted too (`HOST_DRAFTED`).
 *
 * TIER `b`'s PASS ONE IS THIS HOST'S MODEL ON THIS HOST'S KEY, AND THE PACKAGE DOES NOT METER IT. `spent()` stops tier `a`
 * alone (on a reason its comment used to give and now corrects, "the asker is paying"), and `look` drafts every
 * predicate on `fallback`, which is the host's endpoint; only the proposal goes on `byok`. Measured in
 * `apps/selfhost/test/spark-byok-guard.test.ts` before this wrap: at `ask_cap: 1` five reads made five model calls, all five as `Bearer fake-operator-key`, and status read `used 0`
 * (`loop/research-batch-thirty-one-audit.md` §3). The audit offered two repairs, drafting on the owner's key or metering
 * the draft, and this is the second: drafting on `byok` needs the asker's session inside `fallback.complete`, which has
 * no context to carry it, and a slot shared between two asks in flight would open one person's key for another.
 *
 * THE CHECK IS SYNCHRONOUS AND RIGHT BEFORE THE ENGINE'S OWN, AND THAT IS WHAT MAKES IT A CAP. The package writes a hold
 * row (`core.reserve`) before its first `await`, so the count here, taken with no `await` before the call, includes every
 * draft already in flight. `packages/spark/src/call.ts` records what a check and a count with a model between them cost:
 * ten asks at `ask_cap: 2` made ten calls.
 *
 * A HOST READING A TABLE `46 §4.1` DEFINES, AGAIN, which `sparkGrantIdOf` already does for the same reason: the package
 * exposes no count by tier and changing that is an edit to `packages/spark`. `status()` is corrected with the same count,
 * because `23 §8` has a person told what they have used, and on tier `b` that was always 0.
 *
 * A PROPOSE ON A STORED `ask_id` DRAFTS NOTHING, AND ON TIER `b` ALONE THAT MAKES IT FREE TO THIS HOST: its one call is
 * on the owner's key. On `byo` the proposal is on `fallback` too, `SPARK_ENDPOINT` with this host's key, because the
 * settings hold no address of the owner's, so there it is counted and stopped like a draft. This comment once said the
 * exemption held for both tiers, and measured at `ask_cap: 1` one read and five proposes on its `ask_id` answered 200
 * five times on six calls to the operator key, with status reading 1 of 1 (`loop/research-batch-thirty-four-audit.md`
 * §3, `apps/selfhost/test/spark-byo-propose.test.ts`). Any propose with no stored draft drafts first, on this host, and
 * is held to the cap like a read on either tier.
 */
export function sparkGuardedEngine<E extends Guarded>(engine: E, deps: SparkGuardDeps): E {
  const tierOf = (): { tier: string; grant_id: string | null; ask_cap: number } | undefined =>
    deps.sql.one<{ tier: string; grant_id: string | null; ask_cap: number }>('SELECT tier, grant_id, ask_cap FROM settings WHERE singleton = 1');
  /* BOTH TIERS IN ONE COUNT, so an owner moving between `b` and `byo` in a month does not start this host's bill again
     from zero. Tier `a` stays the package's own count, as it was. EVERY CALL THIS HOST PAID FOR AND NO OTHER: a draft on
     either tier, and a proposal on `byo`, whose `propose` row is on this host's key where tier `b`'s is on the owner's.
     The package's hold rows are `kind = 'propose'` on `byo` too, so a proposal in flight is already in this count. */
  const drafted = (): number =>
    deps.sql.one<{ n: number }>(
      "SELECT COUNT(*) AS n FROM call WHERE (kind = 'read' AND tier IN ('b', 'byo') OR kind = 'propose' AND tier = 'byo') AND model <> '-' AND ts >= ?",
      monthOf(deps.clock.now(), 0),
    )?.n ?? 0;
  const hostDrafted = (tier: string | undefined): boolean => tier !== undefined && HOST_DRAFTED.includes(tier);
  const spent = (askId: string | undefined): Refusal | null => {
    const s = tierOf();
    if (s === undefined || !hostDrafted(s.tier)) return null;
    if (
      s.tier === 'b' &&
      askId !== undefined &&
      deps.sql.one("SELECT 1 AS n FROM call WHERE id = ? AND kind = 'read' AND predicate IS NOT NULL", askId) !== undefined
    )
      return null;
    if (drafted() < s.ask_cap) return null;
    const until = monthOf(deps.clock.now(), 1).slice(0, 10);
    /* TWO SENTENCES, because "before your own key answers it" is false on `byo`: nothing of the owner's is asked there,
       and the proposal is spent from the same count as the read, so the sentence names asks and not reads. */
    return {
      code: 'SPARK_BUDGET_SPENT',
      fix:
        s.tier === 'b'
          ? `Spark reads each question on this host's model before your own key answers it, and those reads are spent until ${until}. Raise the monthly limit, or wait.`
          : `Spark reads and answers each question on this host's model, and those asks are spent until ${until}. Raise the monthly limit, or wait.`,
    };
  };

  const guarded = Object.create(engine) as E;
  guarded.status = () => {
    const status = engine.status() as { asks?: { used: number } };
    if (!hostDrafted(tierOf()?.tier) || status?.asks === undefined) return status;
    return { ...status, asks: { ...status.asks, used: drafted() } };
  };
  guarded.read = (question, ctx, inference) => {
    const stop = spent(undefined);
    return stop ? Promise.resolve({ ok: false, refusal: stop }) : engine.read(question, ctx, inference);
  };
  guarded.propose = (question, ctx, byok, askId, inference) => {
    const stop = spent(askId);
    return stop ? Promise.resolve({ ok: false, refusal: stop }) : engine.propose(question, ctx, byok, askId, inference);
  };
  /* AN AUTOMATION'S QUESTION IS SPENT FROM THE SAME COUNT AS A PERSON'S READ, which is `loop/research-infer-ask.md` §5 Q2's
     default. Before this line the guard named `read` and `propose` alone, so `answer` reached the engine through the
     prototype `Object.create` leaves, and the package stops tier `a` only: measured in `test/spark-guard-answer.test.ts`,
     on tiers `b` and `byo` at `ask_cap: 1` with one read made, the engine was called once where the cap allowed none. A
     clock rule at the fifteen-minute floor is 96 calls a day on this host's model with nothing in front of it.
     The package accounts an answer as `kind = 'read'` with no predicate (Brief B), so `drafted()` already counts it, and
     `spent(undefined)` because there is no stored draft to exempt. The sentence is its own because the run shows it, and
     it names the rule and the step, never a value from the row. */
  if (typeof engine.answer === 'function') {
    const answer = engine.answer.bind(engine);
    guarded.answer = (ask, inference) => {
      if (spent(undefined) === null) return answer(ask, inference);
      const until = dayOf(monthOf(deps.clock.now(), 1));
      return Promise.resolve({
        ok: false,
        refusal: {
          code: 'SPARK_BUDGET_SPENT',
          fix: `rule.${ask.rule} asked Spark at step ${ask.step + 1}, and this month's asks are spent until ${until}. Raise the monthly limit, or wait.`,
        },
      });
    };
  }
  /* A TIER `b` SAVE MUST NAME A KEY THE VAULT HOLDS. `configure` checks a grant id's shape and never the vault, so an id
     that is not there saved with 200 and every propose after it was 403 (`loop/research-batch-thirty-one-audit.md` §5).
     The grant it checks is the one tier `b` would open: the patch's, or the one already stored when the patch names none,
     which is how a revoked key reached the save. A caller who is not the owner is left to `configure`, which refuses them
     in its own sentence, so this check never tells a colleague whether a grant id exists.
     AND IT MUST HOLD AN API TOKEN. A live password opens like any other grant, so before the kind was read an owner who
     chose her bank login from the vault saved 200, and the next propose sent it to `SPARK_ENDPOINT` as the bearer
     (measured in `apps/selfhost/test/spark-byok-guard.test.ts`). The sentence names the kind and never the value. */
  guarded.configure = (patch, ctx) => {
    if (ctx.principal.kind !== 'person' || ctx.principal.level !== 'owner') return engine.configure(patch, ctx);
    const before = tierOf();
    const tier = patch['tier'] ?? before?.tier;
    const grant = patch['grant_id'] === undefined ? (before?.grant_id ?? null) : patch['grant_id'];
    if (tier !== 'b' || typeof grant !== 'string') return engine.configure(patch, ctx);
    const held = deps.grants().find((g) => g.id === grant && g.revoked_at === null);
    if (held === undefined)
      return {
        ok: false,
        refusal: {
          code: 'VALUE_MALFORMED',
          fix: 'That grant holds no key in this record. Put the key in the vault first, then choose it here.',
          at: 'grant_id',
        },
      };
    if (held.kind !== SPARK_GRANT_KIND)
      return {
        ok: false,
        refusal: {
          code: 'VALUE_MALFORMED',
          fix: 'That grant is not an API token, so Spark cannot answer with it. Choose the key your model provider gave you.',
          at: 'grant_id',
        },
      };
    /* AND IT MUST NOT BE THE KEY LABELLED `spark`, which is the included model's key on a host with no `SPARK_KEY`
       (`endpointOptionsOf`). Measured in `apps/selfhost/test/spark-included-guard.test.ts`: the save answered 200, and
       tier `b`'s promise that the owner's key opens only for the owner then held for the proposal and not for the draft
       before it, which went out on the same key for anybody (`loop/research-batch-thirty-three-audit.md` §2). Refused
       whatever this host's operator key is, because the guard is not told it, and the label is the included model's
       either way: an operator who unsets `SPARK_KEY` would otherwise turn a tier `b` key into everybody's. */
    if (held.label === SPARK_KEY_LABEL)
      return {
        ok: false,
        refusal: {
          code: 'VALUE_MALFORMED',
          fix: 'That key is the one this host answers everybody with. Put your own key in the vault under another label, then choose it here.',
          at: 'grant_id',
        },
      };
    return engine.configure(patch, ctx);
  };
  return guarded;
}

/** The model this host's endpoint answers with when the package asks by short name: `SPARK_MODEL`, or nothing when unset. */
export const sparkModelNameOf = (config: SparkHostConfig | undefined): string | undefined => config?.model;

/**
 * The package's engine with a `status()` that names what answers.
 *
 * THE PACKAGE CANNOT KNOW THE PROVIDER ID AND MUST NOT (`46 §2`), so on tier `a` its `status()` says `glm-5.3-flash`,
 * measured as `{"tier":"a","model":"glm-5.3-flash",...}` on a host whose `SPARK_MODEL` was an Ollama tag. `23 §8` makes the
 * model name the one thing a person is never told wrong, so the host corrects it here with the same `modelSent` the
 * endpoint is sent through (`loop/research-spark-routes.md` F2). A name the owner typed on tier `b` or `byo` is left as it
 * is, because that is now what goes on the wire too.
 *
 * STRUCTURAL AND GENERIC, for the reason `SparkInference` is declared rather than imported: naming `Spark` here would be
 * the edge to row 13. `Object.create` rather than a spread so every other method is the engine's own, whatever shape
 * `createSpark` builds it in.
 */
export function sparkNamedEngine<E extends { status(): { model: string } }>(engine: E, name: string | undefined): E {
  if (name === undefined) return engine;
  const named = Object.create(engine) as E;
  named.status = () => {
    const status = engine.status();
    return { ...status, model: modelSent(status.model, name) };
  };
  return named;
}

/* ── the `RecordApi` port of `@braindog/spark`, over the record's own guarded reads ─────────────── */

/**
 * The projection the package reads through, and the one write it makes. `46 §4.6`'s shape, declared here for the reason
 * `SparkInference` is: the package satisfies nothing and asks for a structural subset, and this is a host satisfying it.
 *
 * `open` IS OPTIONAL HERE AND REQUIRED IN `45 §4.4`, which is the one place this bridge cannot reproduce the record's own
 * projection. `open` is the count of non-terminal rows, and the only way to it through DATA reads is to list a register and
 * count what comes back, which is a scan per register on a call that exists to be cheap. The package prints the index for
 * the model, so the choice is between a number nothing measured and no number: `indexLines` now omits the clause when the
 * projection did not carry one. When the record grows `project`, the count arrives with it.
 */
export type SparkProjectionRegister = { id: string; rows: number; open?: number; fields: { id: string; type: string }[] };
export type SparkProjectionRow = {
  id: string;
  register: string;
  seq: number;
  /** `34 §4`'s qualified form, `tasks#7`: the only id a proposal may name, and the prefix of every path over the row. */
  spoken: string;
  summary: string;
  fields: Record<string, unknown>;
};
export type SparkProjection = {
  rows: SparkProjectionRow[];
  index: { registers: SparkProjectionRegister[]; open_questions: string[] };
  budget: { used: number; limit: number };
};

/** The predicate type, taken off the method that takes one, so this file needs no edge to `@braindog/where`. */
type Where = NonNullable<Parameters<RecordApi['list']>[0]['where']>;

export type SparkRecordApi = {
  project(
    args: { registers: string[]; where?: Where | undefined; q?: string | undefined; limit?: number | undefined; budget: { tokens: number } },
    ctx: CallContext,
  ): Promise<Result<SparkProjection>>;
  propose(
    args: { question: string; body_kind: 'options' | 'pattern' | 'rowset' | 'change'; body: Record<string, unknown>; op_id?: string | undefined },
    ctx: CallContext,
  ): Promise<Result<{ id: string }>>;
};

/** The six methods this bridge is built from, and not the record's other ninety-four. */
export type SparkRecordDeps = Pick<RecordApi, 'boot' | 'schema' | 'list' | 'search' | 'get' | 'propose'>;

/** `12 §5`: the register that holds credentials is not one Spark reads, so it never reaches a projection to be dropped later. */
const VAULT_REGISTER = 'grant';

/** Rows per register in one projection. `list`'s own default, and the ceiling the budget then trims against. */
const ROWS = 50;

const UTF8 = new TextEncoder();

/**
 * What one row costs the budget: `45 §13` #14's `ceil(utf8Bytes(row) / 4)`.
 *
 * `JSON.stringify` AND NOT JCS, because the count is what is being asked for and key order does not change a byte count.
 * A JCS implementation here would be a second one in the tree for no reader.
 */
const costOf = (row: SparkProjectionRow): number => Math.ceil(UTF8.encode(JSON.stringify(row)).length / 4);

/**
 * The fields a projection carries.
 *
 * A `secret` FIELD IS DROPPED AND NOT LABELLED, which is stricter than `45 §4.4` rule 3 and deliberately so. The record's own
 * mapper replaces a secret with its grant's label, because a screen has to show the person which key a row uses; this bridge
 * has one reader, a model, and a label is nothing it can use. Dropping needs no grant read and cannot be got wrong.
 *
 * A `document` FIELD IS DROPPED TOO, for `46 §4.6`'s own reason: `project` carries no document in v1, and the alternative is
 * an entire body of prose in a prompt that is capped in tokens.
 */
const shownFields = (decl: RegisterDecl): readonly { id: string; type: string }[] =>
  decl.fields.filter((f) => f.retired !== true && f.type !== 'secret' && f.type !== 'document');

/** `45 §4.4` rule 5, as far as the declaration reaches: the spoken id, the title, and the state where the register has one. */
const summaryOf = (spoken: string, entry: Entry, decl: RegisterDecl): string => {
  const parts = [spoken];
  const title = entry.fields[decl.title];
  if (typeof title === 'string' && title.trim() !== '') parts.push(title.trim());
  if (entry.state !== null && entry.state !== '') parts.push(entry.state);
  return parts.join(' | ');
};

/**
 * `RecordApi.project` for a record that has not got one, built from the reads that are there.
 *
 * EVERY READ RUNS UNDER THE ASKER'S OWN CONTEXT, which is `46 §5.4`'s arrangement and the reason this is composed out of
 * `boot`, `schema`, `list`, `search` and `get` rather than out of the kernel: those five apply the caller's level, their
 * per-register scoping and their refusals, so the record decides what a model may be shown and this file never has to.
 *
 * A REGISTER THIS CALLER CANNOT READ IS LEFT OUT AND NOT REFUSED, which is what `30 §9` says a projection does: a refusal
 * naming a register would say which registers exist, one guess at a time.
 *
 * `q` IS THE RECORD'S OWN SEARCH AND ONLY WHERE THERE IS NO PREDICATE. The package sends keywords when the drafted predicate
 * did not validate or no register took it (`46 §5.4` step 5), and it may send both; there is no record method that takes a
 * predicate and a query together, and of the two the predicate is the sharper filter, so it wins and the keywords are left.
 * A register answers a keyword only through the fields it declares `search:` on: measured against a fresh record, a row
 * titled `Invoice Acme` in a register that names none came back from `search({ q: 'Invoice' })` as no rows at all.
 *
 * WHAT IT COSTS, SAID OUT LOUD: one `boot` and one `schema` per register on every call, where the record's own `project`
 * would be one query, and the package calls this twice per ask. The declarations are not cached between calls on purpose,
 * because a pack installed or a field retired under a running host would leave a cached index describing a register that is
 * no longer there, and a prompt is the worst place to find that out. The repair is the record's method, not a cache here.
 */
export function sparkRecord(api: SparkRecordDeps): SparkRecordApi {
  return {
    async project(args, ctx) {
      const boot = await api.boot(ctx);
      if (!boot.ok) return boot;

      const decls = new Map<string, RegisterDecl>();
      const registers: SparkProjectionRegister[] = [];
      for (const register of boot.value.registers) {
        if (register.id === VAULT_REGISTER) continue;
        const decl = await api.schema({ register: register.id }, ctx);
        if (!decl.ok) continue;
        decls.set(register.id, decl.value);
        registers.push({
          id: register.id,
          rows: register.count,
          fields: shownFields(decl.value).map((f) => ({ id: f.id, type: f.type })),
        });
      }
      /* `open_questions` IS EMPTY AND NOT FILLED, because no prompt in the package carries it: `indexLines` prints the
         registers and nothing else. `boot` has the list, so this is one line away the day a template asks for it. */
      const index = { registers, open_questions: [] };
      const limit = args.budget.tokens;
      if (args.registers.length === 0) return ok({ rows: [], index, budget: { used: 0, limit } });

      const rows: SparkProjectionRow[] = [];
      let used = 0;
      /** One entry projected, or `false` when the budget is spent and the caller should stop asking. */
      const take = (entry: Entry): boolean => {
        const decl = decls.get(entry.register);
        /* A SERIES ROW HAS NO SPOKEN NUMBER AND IS NEVER PROJECTED (`45 §4.4` rule 2): nothing could cite it. */
        if (decl === undefined || entry.seq === null) return true;
        const spoken = `${entry.register}#${entry.seq}`;
        const fields: Record<string, unknown> = {};
        for (const field of shownFields(decl)) {
          const value = entry.fields[field.id];
          if (value !== undefined && value !== null) fields[field.id] = value;
        }
        const row: SparkProjectionRow = { id: entry.id, register: entry.register, seq: entry.seq, spoken, summary: summaryOf(spoken, entry, decl), fields };
        const cost = costOf(row);
        if (used + cost > limit) return false;
        used += cost;
        rows.push(row);
        return true;
      };

      const asked = args.registers.filter((id) => decls.has(id));
      if (args.where === undefined && args.q !== undefined && args.q !== null && args.q.trim() !== '') {
        const hits = await api.search({ q: args.q, limit: args.limit ?? ROWS }, ctx);
        if (!hits.ok) return hits;
        /* BOTH SHAPES, because the record answers `{hits, matched}` since the day a clamped search stopped
           being printable as a total, and a host in one process is not always the version of the record it
           is talking to. The count is not read here: this bridge walks the rows it was given and stops at
           its own budget, so how many there were is the asker's question rather than the walk's. */
        const found = Array.isArray(hits.value) ? hits.value : ((hits.value as { hits: typeof rows }).hits ?? []);
        for (const hit of found as readonly { register: string; seq: number | null }[]) {
          if (!asked.includes(hit.register) || hit.seq === null) continue;
          const got = await api.get({ register: hit.register, seq: hit.seq }, ctx);
          if (!got.ok || got.value === null) continue;
          if (!take(got.value)) break;
        }
      } else {
        for (const register of asked) {
          const got = await api.list({ register, ...(args.where === undefined ? {} : { where: args.where }), limit: args.limit ?? ROWS }, ctx);
          if (!got.ok) continue;
          let room = true;
          for (const entry of got.value.rows) {
            room = take(entry);
            if (!room) break;
          }
          if (!room) break;
        }
      }
      return ok({ rows, index, budget: { used, limit } });
    },

    /**
     * The one write, through the record's own proposal door.
     *
     * `op_id` IS TAKEN AND DROPPED. The package mints a call id and passes it so a retried ask cannot file twice; the
     * record's `propose` has no such parameter, and the tie between a suggestion and the call that made it is kept on
     * Spark's own `call` row, in `filed`. Accepting the argument and ignoring it is the honest shape: the parameter is the
     * package's, the de-duplication is not there to be claimed.
     */
    async propose(args, ctx) {
      const put = await api.propose({ question: args.question, body_kind: args.body_kind, body: args.body }, ctx);
      if (!put.ok) return put;
      return ok({ id: String((put.value as { id?: unknown }).id ?? '') });
    },
  };
}
