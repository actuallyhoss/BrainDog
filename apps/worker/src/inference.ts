/**
 * The `Inference` port on the Worker: Workers AI, through AI Gateway. `33 §1` port 3, `51 §5.11` step 4.
 *
 * THE MODEL IS PICKED HERE AND NOWHERE ELSE, AND THAT IS `46 §4.3`'s ARRANGEMENT, not a convenience.
 * Spark names a job's model by a short name out of the routing table (`llama-3.2-1b`), and this
 * adapter is the only place that knows the short name is spelled `@cf/meta/llama-3.2-1b-instruct`
 * on this platform and something else on a laptop running Ollama. A package that named a provider
 * id would be a package that cannot be self-hosted.
 *
 * WHY THE TABLE BELOW STOPS WHERE IT DOES, WITH THE ARITHMETIC. The calls this adapter serves are
 * short schema-constrained generations rather than conversation: triage caps at 64 output tokens
 * and digest prose at 120 (`46 §5.2`). For work that shape the cheapest model that honours a JSON
 * schema is the right one, and the difference is not a rounding error. At `11 §3`'s catalogue
 * prices, read 2026-08-31, per million tokens:
 *
 *   `llama-3.2-1b`   $0.027 in / $0.201 out   triage, digest prose
 *   `glm-5.3-flash`  $0.150 in / $0.500 out   anything that emits structure over a projection
 *   `glm-5.3`        $1.400 in / $4.400 out   NOT CARRIED HERE
 *
 * `glm-5.3` is 9.3 times the input price and 8.8 times the output price of `glm-5.3-flash`, for
 * output that is read once by code and thrown away. `11 §3` has it as an opt-in for long write-ups
 * a person reads many times, and there is no such job on this adapter, so naming it is a refusal
 * rather than a bill. The table is closed, and a name that is not in it is refused BEFORE the call.
 *
 * WHAT THIS DOES NOT DECIDE: whether `granite-4.0-h-micro` at $0.017 / $0.112 should take triage off
 * `llama-3.2-1b`. `11 §3` says plainly that cheaper is not better at classification if it costs
 * accuracy and that the eval suite decides it. A row added to this table on a price alone would be
 * a decision taken in the wrong file.
 *
 * NO LIVE CALL WAS MADE TO BUILD THIS, AND NO TEST MAKES ONE. Every test in
 * `test/inference.test.ts` hands `aiInference` a local function as the binding, so the suite costs
 * zero neurons and cannot be made to cost any by a typo in a model id. The account preconditions
 * (Workers AI enabled, credits on it, `ai (write)` on the deploy token) were established off this
 * tree and are recorded in `wrangler.jsonc` beside the binding they justify.
 */

import { no, ok, type Result } from '@braindog/ports';

/* ── Borrowed from `packages/ports/src/inference.ts`, and it must all be deleted ──────────────── */

/**
 * THE PORT EXISTS AND THIS FILE CANNOT IMPORT IT YET, WHICH IS THE ONLY REASON THIS BLOCK IS HERE.
 * `packages/ports/src/inference.ts` was written in this same batch and says in its own header that
 * the `export type * from './inference.ts'` line in the barrel is the caller's to add. Until that
 * line lands, `@braindog/ports` does not export these names, and `packages/ports/package.json`
 * exports `"."` and nothing else, so there is no subpath to reach them by and a relative import
 * across a package boundary is what `graph` calls an undeclared cross-package import.
 *
 * SO IT IS COPIED VERBATIM RATHER THAN ADAPTED, INCLUDING THE THREE REFUSAL SENTENCES. That is the
 * whole discipline of this block: when the barrel exports the port, replacing it is a deletion and
 * an import, not a reconciliation between two things that have drifted. The argument behind each
 * type is in the port's own header and is not repeated here, because a second copy of an argument
 * is the copy that goes stale.
 */
export type Msg = { role: 'system' | 'user'; content: string };
export type JsonSchema = Record<string, unknown>;
export type Budget = { neurons: number };
export type Usage = { in: number; out: number; neurons: number | null };
export type CompleteRequest = { model: string; messages: readonly Msg[]; maxTokens: number; schema: JsonSchema; budget: Budget };
export type Completion = { text: string; model: string; usage: Usage };
export type Embeddings = { model: string; dims: number; vectors: Int8Array[]; usage: Usage };

export interface Inference {
  complete(req: CompleteRequest): Promise<Result<Completion>>;
  embed(texts: readonly string[]): Promise<Result<Embeddings>>;
}

/** The port's closed vocabulary for the ways a model can fail to be there. */
export type Missing = 'no adapter on this host' | 'the provider did not answer' | 'the provider does not serve it';

const refuse = <T>(code: 'NOT_IN_THIS_BUILD' | 'PROPOSAL_SCHEMA' | 'SPARK_BUDGET_SPENT', fix: string, at: string): Result<T> => no<T>(code, fix, { at });

/** No model answered for this call. `NOT_IN_THIS_BUILD` is borrowed; the port's header argues for it. */
export const modelMissing = <T>(model: string, why: Missing): Result<T> =>
  refuse<T>(
    'NOT_IN_THIS_BUILD',
    `No model answered for '${model}': ${why}. The repair is a deploy of a host that serves it, not an edit.`,
    'model',
  );

/** The answer is not the JSON the call pinned, and nobody is retrying it. */
export const schemaFailed = <T>(model: string, why: string): Result<T> =>
  refuse<T>(
    'PROPOSAL_SCHEMA',
    `The answer from '${model}' is not the JSON this call pinned: ${why}. It is not filed and not retried, because a second call bills twice for one payload.`,
    'schema',
  );

/** This call would cost more than it may spend. Both figures ride the sentence, because the two repairs differ. */
export const budgetSpent = <T>(neurons: number, cap: number): Result<T> =>
  refuse<T>(
    'SPARK_BUDGET_SPENT',
    `This call would spend about ${neurons} neurons and its ceiling is ${cap}. Raise the ceiling for this job, or send fewer rows.`,
    'budget',
  );

/* ── The adapter ──────────────────────────────────────────────────────────────────────────────── */

/**
 * The one method this needs from the `AI` binding, and not one more.
 *
 * NAMED STRUCTURALLY SO THE RULES CAN BE TESTED, exactly as `snapshots.ts` names its five R2
 * methods. `@cloudflare/workers-types` is not in the test tsconfig's `types`, deliberately: a
 * module that can only be typechecked with the platform's globals is a module whose tests have to
 * run on the platform, and a stubbed `run` is what keeps a test run at zero neurons.
 *
 * THAT THE PLATFORM'S OWN `Ai` SATISFIES IT WAS CHECKED AND NOT ASSUMED. `Ai.run` is seven
 * overloads, and a structural type can miss all seven quietly: `const b: AiBinding = ai` was
 * compiled against `@cloudflare/workers-types` 5.20260907.1 and accepted, through the
 * unknown-model fallback overload. Widening `model` past `string` would break that silently, so if
 * this type is edited, compile the assignment again.
 *
 * AND THE OVERLOAD IT MATCHES IS THE ONE THAT KNOWS NOTHING, WHICH HAS ALREADY COST THIS FILE A
 * BUG. The fallback returns `Promise<Record<string, unknown>>`, so every per-model input and
 * output type in the platform's declarations is erased at exactly the seam that needed them. The
 * first draft read `answer.response` for both rows of `MODELS`, which is right for
 * `BaseAiTextGeneration` and wrong for `ChatCompletionsOutput`, and nothing here could have caught
 * it. `SHAPES` below is where that knowledge now lives, and the only way to check a row is to
 * compile the call against the real binding, which `test/inference.test.ts` records the output of.
 */
export type AiOptions = { gateway?: { id: string; collectLog?: boolean } | undefined };
export type AiBinding = { run(model: string, inputs: Record<string, unknown>, options?: AiOptions): Promise<unknown> };

/** The two keys this reads off the Worker's env. `AI` is `Ai`; `AI_GATEWAY` is the gateway's name, per environment. */
export type AiEnv = { AI?: AiBinding | undefined; AI_GATEWAY?: string | undefined };

/**
 * A model this host serves: what Workers AI calls it, and what it costs in neurons.
 *
 * THE RATES ARE `11 §3`'s DOLLAR PRICES DIVIDED BY $0.011 PER 1,000 NEURONS, and the conversion was
 * checked against a figure the docs state independently rather than trusted. `11 §3` prices one
 * conversational turn of 12k in / 1.5k out on `glm-5.3-flash` at $0.00255. Through this table:
 * 12,000 × 13,636 / 1e6 = 163.6 neurons in, 1,500 × 45,455 / 1e6 = 68.2 out, 231.8 together, and
 * 231.8 × $0.011 / 1,000 = $0.00255. The table reproduces the published figure to the cent it is
 * quoted at, so the arithmetic below is the same arithmetic `08 §6` costed the product with.
 */
type Rate = { provider: string; shape: Shape; inPerM: number; outPerM: number };

/**
 * WHICH OF WORKERS AI'S TWO REQUEST AND ANSWER SHAPES A ROW SPEAKS, AND IT IS NOT A DETAIL. The
 * two rows below are on opposite sides of it, measured in `@cloudflare/workers-types`
 * 5.20260907.1, which is the version `apps/worker/tsconfig.json` compiles against:
 *
 *   `@cf/meta/llama-3.2-1b-instruct`  `BaseAiTextGeneration`            `text`
 *   `@cf/zai-org/glm-5.3-flash`       `Base_Ai_Cf_Zai_Org_Glm_5_3_Flash`  `chat`
 *
 * `text` answers `{ response?: string; usage? }`. `chat` answers `ChatCompletionsOutput`, which is
 * OpenAI's shape, has no `response` at all, and carries a required `finish_reason` per choice.
 * Compiling a read of `.response` against the flash row answers *"TS2339: Property 'response'
 * does not exist on type 'ChatCompletionsOutput'"*. On the way in they differ too: `text` takes
 * `AiTextGenerationResponseFormat`, which is `{ type; json_schema?: any }`, and `chat` takes
 * `ResponseFormatJSONSchema`, whose `json_schema` is `{ name; description?; schema?; strict? }`.
 * Sending the bare schema to the flash row answers *"TS2769 ... Property 'name' is missing"*, and
 * a wrapper the platform accepts without applying is a bill for a call whose schema did nothing.
 *
 * A NEW ROW HAS TO DECLARE ITS SHAPE, and the way to find out is to look the provider id up in
 * `AiModels` and follow the class it maps to. Guessing from the model's family is what put both
 * rows on one shape in the first place.
 */
type Shape = 'text' | 'chat';

const MODELS: Record<string, Rate> = {
  'llama-3.2-1b': { provider: '@cf/meta/llama-3.2-1b-instruct', shape: 'text', inPerM: 2_455, outPerM: 18_273 },
  'glm-5.3-flash': { provider: '@cf/zai-org/glm-5.3-flash', shape: 'chat', inPerM: 13_636, outPerM: 45_455 },
};

/** Embeddings are the adapter's own pick, because the port passes no model: multilingual, because the record holds Arabic and English (`11 §3`). */
export const EMBED_MODEL = '@cf/baai/bge-m3';

/** `11 §3`: the budget counts a token as `ceil(utf8 bytes / 4)`. The only token count available before a call. */
const tokensIn = (text: string): number => Math.ceil(new TextEncoder().encode(text).length / 4);

/**
 * What Workers AI says when the id is not in its catalogue, matched loosely.
 *
 * LOOSELY BECAUSE THE WORDING IS THE PLATFORM'S AND MAY CHANGE, and a miss is cheap in one
 * direction and dear in the other. Both branches answer `NOT_IN_THIS_BUILD`, so a miss costs only
 * the `why` clause in the sentence: a reader is told the provider did not answer when in fact it
 * answered that it does not serve the model. Getting that clause right is worth a loose pattern
 * and is not worth a brittle one.
 */
const NO_SUCH_MODEL = /no such model|model not found|not a valid model|unknown model/iu;

const sayOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * The gateway wrapper every call carries.
 *
 * `collectLog: false` IS `11 §3`'s *payload retention off*, and it is the setting that decides
 * whether a record's own sentences sit in a Cloudflare log. The gateway still counts the neurons
 * and still enforces the per-record rate limit, which is the whole reason the calls go through it;
 * what it does not do is keep a copy of what the person asked.
 *
 * AN UNSET `AI_GATEWAY` IS A DIRECT CALL rather than a refusal. Both environments declare the var
 * in `wrangler.jsonc`, so unset means somebody deployed by hand, and a model call that fails at
 * 03:17 because a var is empty is a worse failure than a call whose neurons are counted at the
 * account level instead of the record's.
 */
const through = (env: AiEnv): AiOptions => (env.AI_GATEWAY ? { gateway: { id: env.AI_GATEWAY, collectLog: false } } : {});

/** JSON Schema's name for what a value is. `integer` is handled at the call site, since JavaScript has one number type. */
const kindOf = (v: unknown): string => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

/**
 * Does the answer honour the schema the call pinned?
 *
 * TOP LEVEL ONLY, AND SAID OUT LOUD SO NOBODY READS IT AS VALIDATION. This is not a JSON Schema
 * implementation and must not grow into one: `46 §5.3` step 4 has the package check the parsed
 * value by hand afterwards, and a second opinion here would be a second place to disagree. What
 * this catches is the failure the package cannot catch cheaply, which is a model that ignored
 * `response_format` altogether and answered in prose, or dropped a field the prompt depends on.
 * Three checks: the top-level type, the `required` names, and extra keys when the schema closed
 * itself. Everything deeper is the caller's parse.
 *
 * It answers with the clause to put in the refusal, or `null` when the answer is good.
 */
const unhonoured = (value: unknown, schema: JsonSchema): string | null => {
  const want = schema['type'];
  if (typeof want === 'string') {
    const right = want === 'integer' ? typeof value === 'number' && Number.isInteger(value) : kindOf(value) === want;
    if (!right) return `it is ${kindOf(value)} where the schema asks for ${want}`;
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;

  const object = value as Record<string, unknown>;
  const required = Array.isArray(schema['required']) ? schema['required'] : [];
  const missing = required.filter((k): k is string => typeof k === 'string' && !Object.hasOwn(object, k));
  if (missing.length > 0) return `it is missing ${missing.join(', ')}`;

  if (schema['additionalProperties'] === false) {
    const declared = schema['properties'];
    const known = declared !== null && typeof declared === 'object' ? Object.keys(declared) : [];
    const extra = Object.keys(object).filter((k) => !known.includes(k));
    if (extra.length > 0) return `it carries ${extra.join(', ')}, which the schema does not declare`;
  }
  return null;
};

/** A count the platform may have omitted. Absent is zero, and zero makes no claim about truncation. */
const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * The `response_format` a row's own input type declares. One schema, two envelopes.
 *
 * `name` IS REQUIRED BY THE CHAT ENVELOPE AND CARRIES NO MEANING FOR US, which is why it is a
 * constant rather than something derived from the job. OpenAI's field names the schema so a
 * caller can tell two of them apart in a log; every call from this adapter pins exactly one
 * schema, so there is nothing to tell apart, and a name built out of the ask would put a slice of
 * a record's question into a request field for no reader. `strict: true` is the half that matters:
 * it is what asks the provider to enforce the schema rather than suggest it.
 */
const formatFor = (shape: Shape, schema: JsonSchema): Record<string, unknown> =>
  shape === 'chat'
    ? { type: 'json_schema', json_schema: { name: 'answer', schema, strict: true } }
    : { type: 'json_schema', json_schema: schema };

/**
 * What came back, read through the shape the row declared.
 *
 * `cutOff` IS THREE-VALUED BECAUSE ONLY ONE SHAPE KNOWS. `ChatCompletionChoice.finish_reason` is
 * required and says `length` when the generation hit the ceiling, so on that row truncation is
 * reported rather than inferred. `AiTextGenerationOutput` is `{ response, tool_calls, usage }` and
 * carries no such field, so that row answers `null` and the caller falls back to counting
 * completion tokens against the ceiling. The guess is the weaker signal and is only used where
 * there is nothing better: it calls a complete answer truncated whenever the model happens to land
 * exactly on the ceiling, which the reported flag never does.
 *
 * `neurons: null` BECAUSE THE PLATFORM PRICED NOTHING, AND `MODELS` IS NOT A SECOND OPINION.
 * Neither shape's `usage` carries a neuron figure; both carry token counts. The port is explicit
 * that the adapter reports what it was told and the package does the arithmetic from `MODELS`: a
 * derived number returned here would read as a measurement, and two derivations of one figure is
 * how a monthly total comes out confidently wrong. The rate table is used to REFUSE a call, where
 * being approximately right before spending is the whole value, and never to report one after.
 */
type Read = { text: string; usage: Usage; cutOff: boolean | null };

const readAnswer = (shape: Shape, raw: unknown): Read => {
  const answer = (raw !== null && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const reported = answer['usage'];
  const tokens = (reported !== null && typeof reported === 'object' ? reported : {}) as Record<string, unknown>;
  const usage: Usage = { in: count(tokens['prompt_tokens']), out: count(tokens['completion_tokens']), neurons: null };

  if (shape === 'text') {
    const response = answer['response'];
    return { text: typeof response === 'string' ? response : '', usage, cutOff: null };
  }

  const choices = answer['choices'];
  const first = (Array.isArray(choices) ? choices[0] : undefined) as
    | { message?: { content?: unknown } | undefined; finish_reason?: unknown }
    | undefined;
  const content = first?.message?.content;
  const why = first?.finish_reason;
  return { text: typeof content === 'string' ? content : '', usage, cutOff: typeof why === 'string' ? why === 'length' : null };
};

/** `clamp(round(x × 127), −127, 127)` of `51 §5.11` step 4: one signed byte per dimension, and −128 is never produced. */
const int8 = (row: number[]): Int8Array => {
  const out = new Int8Array(row.length);
  for (const [at, x] of row.entries()) out[at] = Math.max(-127, Math.min(127, Math.round(x * 127)));
  return out;
};

/**
 * Workers AI as the `Inference` port. `51 §2`'s signature.
 *
 * AN UNBOUND `AI` IS A REFUSAL AT THE CALL AND NOT A THROW AT WIRING. Construction is total, so a
 * deployment without the binding still boots and still serves every route that is not Spark; the
 * first ask is answered `no adapter on this host`, which is a `Missing` the port declares for
 * exactly this case. The alternative is a cold-start crash that takes the whole record down over a
 * feature the deployment may never use.
 *
 * NOTHING HERE THROWS. `packages/ports/src/inference.ts` states the posture and this adapter is
 * what it was written for: a network call behind a method fails as the common case, and these
 * calls cross a Durable Object RPC boundary that an exception carries neither a code nor a
 * sentence across.
 */
export function aiInference(env: AiEnv): Inference {
  /** The binding's answer, or one of the three `Missing` reasons, so neither caller re-reads the platform's error. */
  const call = async (provider: string, inputs: Record<string, unknown>): Promise<{ answer: unknown } | { why: Missing }> => {
    const ai = env.AI;
    if (ai === undefined) return { why: 'no adapter on this host' };
    try {
      return { answer: await ai.run(provider, inputs, through(env)) };
    } catch (e) {
      return { why: NO_SUCH_MODEL.test(sayOf(e)) ? 'the provider does not serve it' : 'the provider did not answer' };
    }
  };

  return {
    complete: async (req: CompleteRequest): Promise<Result<Completion>> => {
      /* A NAME THIS TABLE DOES NOT CARRY IS `no adapter on this host` AND NOT `the provider does not
         serve it`, AND THE DIFFERENCE IS THAT ONE OF THEM WOULD BE UNTRUE. Workers AI does serve
         `glm-5.3`; what does not exist is a row here that routes to it. The port's vocabulary has
         no value meaning *this host does not route that model*, and of the three it declares this
         is the only one that is true of both this case and an unbound binding. A refusal a person
         reads may be imprecise about which layer said no; it may not state something false about
         the provider, because the reader's next move is to go and look. */
      const rate = Object.hasOwn(MODELS, req.model) ? MODELS[req.model] : undefined;
      if (rate === undefined) return modelMissing<Completion>(req.model, 'no adapter on this host');

      /* THE CEILING IS CHECKED BEFORE THE CALL, WHICH IS THE ONLY PLACE IT IS WORTH ANYTHING. A
         budget read after the answer arrives is a report; read here it is a refusal that costs
         nothing. The estimate is deliberately the WORST case: every prompt byte is counted, and
         the output is counted at `maxTokens` as though the model ran to the ceiling. An estimate
         that erred low would let exactly the runaway generation this exists to stop through, and
         the price of erring high is a job that asks for a bigger number in its routing table. */
      const promptTokens = req.messages.reduce((n, m) => n + tokensIn(m.content), 0);
      const would = Math.ceil((promptTokens * rate.inPerM + req.maxTokens * rate.outPerM) / 1_000_000);
      if (would > req.budget.neurons) return budgetSpent<Completion>(would, req.budget.neurons);

      const got = await call(rate.provider, {
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: req.maxTokens,
        response_format: formatFor(rate.shape, req.schema),
      });
      if ('why' in got) return modelMissing<Completion>(req.model, got.why);

      const { text, usage, cutOff } = readAnswer(rate.shape, got.answer);

      /* TRUNCATION IS TOLD APART FROM A BAD ANSWER IN THE SENTENCE, AND IT IS CHECKED FIRST. A
         generation cut off at the ceiling is usually half a JSON document, so it fails the parse as
         well, and the two send a reader to different places: one raises `maxTokens`, the other
         rewrites the prompt. Measured while writing the test: with this check below the parse, the
         same half-written object is reported as JSON that could not be read, which is true and
         useless. Where the shape reports it, `cutOff` is the platform's own word; where it does
         not, the completion count against the ceiling is the only signal there is, and an absent
         `usage` counts as zero and therefore makes no claim either way. */
      if (cutOff ?? (usage.out > 0 && usage.out >= req.maxTokens))
        return schemaFailed<Completion>(req.model, `it stopped at the ${req.maxTokens}-token ceiling, so what came back is the beginning of a document rather than one`);

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return schemaFailed<Completion>(req.model, 'it is not JSON at all');
      }
      const wrong = unhonoured(parsed, req.schema);
      if (wrong !== null) return schemaFailed<Completion>(req.model, wrong);

      return ok({ text, model: rate.provider, usage });
    },

    embed: async (texts: readonly string[]): Promise<Result<Embeddings>> => {
      /* NOTHING TO EMBED IS NOT A CALL. An empty batch is what a record with no new entries hands
         over on a nightly run, and paying a request for it is paying for a round trip that can only
         answer with an empty list. */
      if (texts.length === 0) return ok({ model: EMBED_MODEL, dims: 0, vectors: [], usage: { in: 0, out: 0, neurons: null } });

      const got = await call(EMBED_MODEL, { text: [...texts] });
      if ('why' in got) return modelMissing<Embeddings>(EMBED_MODEL, got.why);

      const rows = (got.answer as { data?: unknown } | null)?.data;
      /* A COUNT THAT DOES NOT MATCH IS NOT SALVAGEABLE, because the caller writes `entry_vec` by
         position: the third vector belongs to the third entry and nothing in the answer says so
         except its index. Filing a short batch would attach each vector to the wrong row. */
      if (!Array.isArray(rows) || rows.length !== texts.length)
        return modelMissing<Embeddings>(EMBED_MODEL, 'the provider did not answer');

      /* AND NEITHER IS A ROW THAT IS NOT A FULL LIST OF NUMBERS, WHICH IS THE SAME FAILURE ONE
         level down. The first draft of this method guarded the count and then quantised each row
         with a filter, so a row that was not a list at all became an EMPTY vector and a row with a
         null in it became a SHORT one, both filed `ok`. A zero-width or narrow vector in
         `entry_vec` is a row that matches nothing and never says why, which is the worse half of
         what the count guard exists to prevent: at least a missing vector is missing. Width is
         taken from the first row and every row has to agree with it, because the table stores one
         width and a batch that disagreed with itself would be two of them. */
      const numeric: number[][] = [];
      for (const row of rows) {
        if (!Array.isArray(row) || row.length === 0 || !row.every((x) => typeof x === 'number' && Number.isFinite(x))) break;
        numeric.push(row as number[]);
      }
      const width = numeric[0]?.length ?? 0;
      if (numeric.length !== rows.length || numeric.some((row) => row.length !== width))
        return modelMissing<Embeddings>(EMBED_MODEL, 'the provider did not answer');

      const vectors = numeric.map(int8);

      /* `in` IS THE APPROXIMATION AND NOT A MEASUREMENT, and it is here because the port's `Usage`
         has no way to say unknown for a token count. `Ai_Cf_Baai_Bge_M3_Output` is
         `{ shape, data, pooling }`: the embedding models return no usage block at all. So the count
         is `11 §3`'s own `ceil(utf8 bytes / 4)`, which is the convention the budget is stated in,
         and `neurons: null` is the field that says nothing was priced. */
      const approx = texts.reduce((n, t) => n + tokensIn(t), 0);
      return ok({ model: EMBED_MODEL, dims: vectors[0]?.length ?? 0, vectors, usage: { in: approx, out: 0, neurons: null } });
    },
  };
}
