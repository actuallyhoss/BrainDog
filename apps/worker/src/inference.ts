/**
 * The `Inference` port on the Worker: Workers AI, through AI Gateway. `33 §1` port 3, `51 §5.11` step 4.
 *
 * THE MODEL IS PICKED HERE AND NOWHERE ELSE, AND THAT IS `46 §4.3`'s ARRANGEMENT, not a convenience.
 * Slash names a job's model by a short name out of the routing table (`llama-3.2-1b`), and this
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
 *   `llama-3.2-1b`   $0.027 in / $0.201 out   triage
 *   `glm-5.3-flash`  $0.150 in / $0.500 out   anything that emits structure over a projection, digest prose
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

import {
  budgetSpent,
  modelMissing,
  ok,
  schemaFailed,
  type Completion,
  type CompleteRequest,
  type Embeddings,
  type Inference,
  type JsonSchema,
  type Missing,
  type Result,
  type Usage,
} from '@braindog/ports';

/**
 * THE PORT IS IMPORTED, AND THE COPY THIS FILE CARRIED IS GONE. It was here only while the barrel did not
 * export `packages/ports/src/inference.ts`; the barrel does now (`export * from './inference.ts'`), so the three refusals
 * are the port's own, sentence for sentence, and they carry `why` for a router as well. Re-exported so the Worker's own
 * callers and tests keep the one import they had.
 */
export type { Budget, Completion, CompleteRequest, Embeddings, Inference, JsonSchema, Missing, Msg, Usage } from '@braindog/ports';
export { budgetSpent, modelMissing, schemaFailed } from '@braindog/ports';

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
export type AiEnv = {
  AI?: AiBinding | undefined;
  AI_GATEWAY?: string | undefined;
  /** Workers AI's REST run address up to `/ai/run/` (a plain var naming the account) and its token (the secret
   * `WORKERS_AI_TOKEN`) for the REST path. Both, or no REST path. */
  AI_REST_URL?: string | undefined;
  WORKERS_AI_TOKEN?: string | undefined;
};

/** What a test may swap: the fetch the REST path uses and where the one fault line goes. */
export type AiDeps = { fetch?: typeof fetch | undefined; log?: ((line: string) => void) | undefined };

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
type Rate = { provider: string; shape: Shape; inPerM: number; outPerM: number; effort?: Effort | undefined; thinks?: false | undefined };

/**
 * HOW HARD A ROW THAT REASONS IS ASKED TO THINK BEFORE IT ANSWERS, sent as `reasoning_effort`. Absent on a row that does not
 * reason, and nothing is sent for it.
 *
 * `glm-5.3-flash` REASONS, AT `max` UNLESS TOLD OTHERWISE, AND ITS THINKING IS SPENT FROM THE SAME CEILING AS ITS ANSWER.
 * The model's page (developers.cloudflare.com/workers-ai/models/glm-5.3-flash, read 23 October) lists reasoning as `low`,
 * `high`, `max` (default) and says it cannot be disabled; the binding's own `ChatCompletionsCommonOptions` declares
 * `reasoning_effort`, and its `CompletionUsage` counts `reasoning_tokens` inside `completion_tokens`. So `max_tokens` bounds
 * the thinking and the answer together. Measured on the live record on 22 and 23 October: the written brief, whose whole
 * answer is three sentences of at most 200 characters (`SLASH_WRITTEN_INSTRUCTIONS`), well under 300 tokens, stopped at
 * the 2,048-token ceiling every half hour (its `WRITTEN_RETRY_MS`), so what ran the ceiling out was the thinking before
 * it and not the answer.
 *
 * `low` AND NOT `max`: every call this adapter makes pins a JSON schema and is read once by code, nothing here reads the
 * reasoning, and the platform bills it as output. The ceiling and its worst-case price are unchanged (`complete` still
 * counts `maxTokens` whole), so this costs no estimate its honesty; it only leaves the answer the room it was sized for.
 */
type Effort = 'low' | 'high' | 'max';

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

/*
 * `gemma-4-26b-a4b` IS THE FIRST RUN'S CONVERSATION, ONE TURN AT A TIME (`turn` in `packages/slash/src/prompts.ts`), and
 * nothing else. Measured on 1 November through this account's binding, the turn's own prompt (about 700 tokens in):
 *
 *   `glm-5.3-flash` at `low`   3.3 to 7.6 s, and 11 and 22 s for a bare `{"ok":true}`; it cannot stop thinking
 *   `gemma-4-26b-a4b`          0.8 to 3.9 s, median about 2.2 s, 40 to 57 tokens out, with its thinking off
 *   `llama-4-scout-17b`        1.1 to 4.2 s, and questions that asked what was already said
 *   `llama-3.3-70b-fp8-fast`   2.4 to 9.7 s, and questions cut to "How much?"
 *   `mistral-small-3.1-24b`    1.8 to 6.2 s
 *
 * Its questions were the best of the fast ones ("What kind of things do you sell at the markets?"), it is a third of the
 * flash model's price, and it is a `chat` row (`ChatCompletionsInput` in `@cloudflare/workers-types` 5.20260907.1).
 * `thinks: false` sends `chat_template_kwargs: { enable_thinking: false }`, the platform's own switch for a model that
 * reasons by default; with it on, the same turn spent its whole ceiling thinking.
 */
const MODELS: Record<string, Rate> = {
  'llama-3.2-1b': { provider: '@cf/meta/llama-3.2-1b-instruct', shape: 'text', inPerM: 2_455, outPerM: 18_273 },
  'glm-5.3-flash': { provider: '@cf/zai-org/glm-5.3-flash', shape: 'chat', inPerM: 13_636, outPerM: 45_455, effort: 'low' },
  'gemma-4-26b-a4b': { provider: '@cf/google/gemma-4-26b-a4b-it', shape: 'chat', inPerM: 9_091, outPerM: 27_273, thinks: false },
};

/**
 * The table above as the model checks read it: each routed name with the id it is spelled by, its shape and its
 * rates. `tools/model-checks/run.mjs --routes` asks every row once, so what it measures is the table this Worker ships,
 * never a copy that could drift from it. Read only; the adapter still reads `MODELS`.
 */
export const ROUTED: readonly ({ name: string } & Readonly<Rate>)[] = Object.freeze(Object.entries(MODELS).map(([name, rate]) => Object.freeze({ name, ...rate })));

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

/**
 * A throw the model itself gave (overloaded, rate limited): another route to the same model would say the same, so none
 * is tried.
 *
 * A 5XX IS NOT ONE OF THEM. It was, and a gateway answering 502 or 504 is the gateway, which is the one failure the two
 * later paths exist for: the call was thrown at once and the binding without the gateway, and REST, were never asked.
 * A 5xx that was the model's after all costs one more call that fails the same way.
 */
const MODEL_SIDE = /\b429\b|overload|capacity|rate.?limit/iu;

const sayOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** The most of the provider's own message a log line keeps. */
export const RAW_MOST = 300;

/**
 * The provider's own words for a failed call, fit for a log line: anything shaped like a key cut out, then cut at
 * `RAW_MOST`. `''` for a throw that said nothing.
 *
 * KEPT BECAUSE THE TWO PHRASES TELL NOBODY WHAT TO FIX. On his record the night's resolve failed eight times as "the
 * provider did not answer", and whether that was the route table, the gateway or the account could not be said, because
 * the platform's sentence was thrown away here. That sentence is the operator's whole lead.
 *
 * SCRUBBED BECAUSE A PROVIDER QUOTES WHAT IT WAS SENT. A bearer, a `key=` or a `"token": "..."` pair, any long opaque run
 * (an API token, an account id in a gateway path), and a `"content"` string, which is a person's prompt quoted back. Then
 * the cut, which is the brake on whatever the patterns miss: a quoted prompt past the first 300 characters never lands.
 */
export const scrubRaw = (said: string): string =>
  said
    .replace(/\b(bearer|basic)\s+\S+/giu, '$1 [cut]')
    /* A KEY BY ITS SHAPE, short or long: the prefixes the common providers mint, and a key named in prose ("API key
       provided: ..."), where the value carries a digit, so "API key invalid" keeps its words. */
    .replace(/\b(?:sk|pk|rk)[-_][\w-]{6,}|\b(?:ghp|gho|ghu|ghs|ghr|github_pat|glpat|xox[abprse]|cfut|cfat|AIza)[\w-]{6,}|\b(?:AKIA|ASIA)[A-Z0-9]{12,}/gu, '[cut]')
    .replace(/\b((?:api|access|secret|auth)[ _-]?(?:key|token)s?)((?:\s+provided)?\s*:?\s+)(?=\S*\d)\S{6,}/giu, '$1$2[cut]')
    .replace(/(["']?)\b([\w-]*(?:key|token|secret|password|authorization)[\w-]*)\1(\s*[:=]\s*)("(?:[^"\\]|\\.)*"|'[^']*'|[^\s,;}&]+)/giu, '$1$2$1$3[cut]')
    /* A PERSON'S WORDS QUOTED BACK: a chat message's `content`, a completion's `prompt`, an embedding's `text` or `input`,
       as a string or a list of them. */
    .replace(/(["']?)\b(content|prompt|text|input)\1(\s*:\s*)(?:"(?:[^"\\]|\\.)*"?|\[(?:[^\]"]|"(?:[^"\\]|\\.)*"?)*\]?)/giu, '$1$2$1$3"[cut]"')
    .replace(/[A-Za-z0-9_\-+/=]{32,}/gu, '[cut]')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, RAW_MOST);

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

/** One path that failed, and what it said (`scrubRaw`'d). */
type Heard = { path: 'gateway' | 'binding' | 'rest'; said: string };

/**
 * What the paths that failed said, the last first. The last is why nothing answered; the gateway's sentence behind it is
 * why the others were tried, and is said only where it differs. "2001: Please configure AI Gateway" alone once stood for
 * a binding that had failed again, for a reason nobody could read.
 */
const heard = (failed: readonly Heard[]): string => {
  const last = failed.at(-1)!;
  const said = new Set([last.said]);
  const before: string[] = [];
  for (const h of failed.slice(0, -1)) {
    if (said.has(h.said)) continue;
    said.add(h.said);
    before.push(`${h.path} said: ${h.said}`);
  }
  return [last.said, ...before].join('; ');
};

/**
 * ONE MODEL CALL THAT SURVIVES A BROKEN GATEWAY. The binding with the gateway first; if that throws anything but "no such
 * model", the binding once more without the gateway option (a gateway that does not exist on the account makes the binding
 * throw while the model itself is fine); if that throws too, Workers AI's REST endpoint when `AI_REST_URL` and
 * `WORKERS_AI_TOKEN` are both set. When no later path answers, the throw says what every path said, the last first, and so
 * does the log line. A path other than the first that answers, or none answering, leaves ONE `console.warn` line naming
 * it, so `cf-logs ai:` finds it.
 */
export async function runModel(env: AiEnv, model: string, inputs: Record<string, unknown>, deps: AiDeps = {}): Promise<unknown> {
  const ai = env.AI;
  if (ai === undefined) throw new Error('no AI binding');
  const log = deps.log ?? ((line: string) => console.warn(line));
  const options = through(env);
  const failed: Heard[] = [];
  let first: unknown;
  try {
    return await ai.run(model, inputs, options);
  } catch (e) {
    first = e;
    if (NO_SUCH_MODEL.test(sayOf(e)) || MODEL_SIDE.test(sayOf(e))) throw e;
    failed.push({ path: options.gateway !== undefined ? 'gateway' : 'binding', said: scrubRaw(sayOf(e)) });
  }
  if (options.gateway !== undefined) {
    try {
      const answer = await ai.run(model, inputs);
      log(`ai: answered by binding-without-gateway; gateway ${env.AI_GATEWAY ?? ''} failed: ${failed[0]!.said}`);
      return answer;
    } catch (e) {
      if (NO_SUCH_MODEL.test(sayOf(e)) || MODEL_SIDE.test(sayOf(e))) throw e;
      failed.push({ path: 'binding', said: scrubRaw(sayOf(e)) });
    }
  }
  /* ONE PATH THAT FAILED THROWS WHAT IT THREW, as it always did; two or more say all of it. */
  const thrown = (): unknown => (failed.length === 1 ? first : new Error(heard(failed)));
  const tell = (): string => failed.map((h) => `${h.path} said: ${h.said}`).join('; ');
  const base = env.AI_REST_URL?.trim() ?? '';
  const token = env.WORKERS_AI_TOKEN ?? '';
  if (base === '' || token === '') {
    log(`ai: no path answered; rest not configured (set AI_REST_URL and secret WORKERS_AI_TOKEN); ${tell()}`);
    throw thrown();
  }
  try {
    const res = await (deps.fetch ?? fetch)(`${base.endsWith('/') ? base : `${base}/`}${model}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(inputs),
    });
    /* A STREAM ASKED FOR IS HANDED BACK AS THE BODY, as the binding hands back its own, once the status says it is one. */
    if (inputs['stream'] === true && res.ok && res.body !== null && (res.headers.get('content-type') ?? '').includes('event-stream')) {
      log(`ai: answered by rest; ${tell()}`);
      return res.body;
    }
    const body = (await res.json().catch(() => null)) as { success?: unknown; result?: unknown; errors?: unknown } | null;
    if (!res.ok || body === null || body.success === false || body.result === undefined)
      throw new Error(`rest ${res.status} ${scrubRaw(JSON.stringify(body?.errors ?? ''))}`);
    log(`ai: answered by rest; ${tell()}`);
    return body.result;
  } catch (e) {
    failed.push({ path: 'rest', said: scrubRaw(sayOf(e)) });
    log(`ai: no path answered; ${tell()}`);
    throw thrown();
  }
}

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

/**
 * WHETHER A VALUE KEEPS ITS SCHEMA ALL THE WAY DOWN: type, `required`, closed objects, and an array's `minItems`,
 * `maxItems` and `items`. Only for `mendCut` below, which must hand on nothing `@braindog/slash`'s own check would refuse
 * (`checkSchema`); `unhonoured` above stays the top-level check every whole answer gets.
 */
const keeps = (v: unknown, schema: JsonSchema): boolean => {
  const t = schema['type'];
  const kinds = typeof t === 'string' ? [t] : Array.isArray(t) ? t.filter((k): k is string => typeof k === 'string') : [];
  if (kinds.length > 0 && !kinds.some((k) => (k === 'integer' ? typeof v === 'number' && Number.isInteger(v) : kindOf(v) === k))) return false;
  if (Array.isArray(v)) {
    if (typeof schema['minItems'] === 'number' && v.length < schema['minItems']) return false;
    if (typeof schema['maxItems'] === 'number' && v.length > schema['maxItems']) return false;
    const items = schema['items'];
    return items === null || typeof items !== 'object' || Array.isArray(items) ? true : v.every((x) => keeps(x, items as JsonSchema));
  }
  if (v === null || typeof v !== 'object') return true;
  const o = v as Record<string, unknown>;
  const props = schema['properties'] !== null && typeof schema['properties'] === 'object' ? (schema['properties'] as Record<string, JsonSchema>) : {};
  const required = Array.isArray(schema['required']) ? schema['required'].filter((k): k is string => typeof k === 'string') : [];
  if (required.some((k) => !Object.hasOwn(o, k))) return false;
  if (schema['additionalProperties'] === false && Object.keys(o).some((k) => !Object.hasOwn(props, k))) return false;
  return Object.entries(props).every(([k, sub]) => !Object.hasOwn(o, k) || keeps(o[k], sub));
};

/** What a required key that never arrived is taken as: `null` where its schema allows it, `[]` for an array, else nothing. */
const emptyOf = (schema: JsonSchema | undefined): { v: unknown } | null => {
  const t = schema?.['type'];
  const kinds = typeof t === 'string' ? [t] : Array.isArray(t) ? t : [];
  if (kinds.includes('null')) return { v: null };
  if (kinds.includes('array')) return { v: [] };
  return null;
};

/**
 * A REPLY CUT OFF AT ITS CEILING, MENDED WHERE WHAT ARRIVED IS WHOLE UP TO A VALUE (1 Nov, a live first run): the
 * conversation's turn stopped at its ceiling one key short of the end, and the whole answer was refused for the half
 * question at its tail. The text is cut back to the last value that closed (never a half string: a question cut mid-word
 * is no question), the open objects and arrays are closed, a required key that never came is taken as `null` or `[]`
 * where its schema allows that, and the result is kept only if it keeps the schema all the way down (`keeps`). Earlier
 * cuts are tried in turn, so a pair cut after its first half falls back to the pair before it. `null` where nothing
 * whole can be made, and then the refusal stands as before.
 */
export function mendCut(text: string, schema: JsonSchema): string | null {
  type Open = { kind: 'obj' | 'arr'; key: boolean };
  const stack: Open[] = [];
  const cuts: { at: number; close: string }[] = [];
  const closers = (): string => stack.map((o) => (o.kind === 'obj' ? '}' : ']')).reverse().join('');
  /* A VALUE CLOSED INSIDE A CONTAINER IS A PLACE THE TEXT MAY BE CUT. */
  const closed = (at: number): void => {
    const top = stack.at(-1);
    if (top === undefined) return;
    if (top.kind === 'obj') top.key = false;
    cuts.push({ at, close: closers() });
  };
  let i = 0;
  while (i < text.length) {
    const c = text.charAt(i);
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text.charAt(j) !== '"') j += text.charAt(j) === '\\' ? 2 : 1;
      if (j >= text.length) break;
      const top = stack.at(-1);
      /* A KEY IS NO VALUE: the colon and its value are still to come. */
      if (top?.kind === 'obj' && top.key) top.key = false;
      else closed(j + 1);
      i = j + 1;
      continue;
    }
    if (c === '{' || c === '[') {
      stack.push({ kind: c === '{' ? 'obj' : 'arr', key: c === '{' });
      cuts.push({ at: i + 1, close: closers() });
      i += 1;
      continue;
    }
    if (c === '}' || c === ']') {
      stack.pop();
      if (stack.length === 0) return null;
      closed(i + 1);
      i += 1;
      continue;
    }
    if (c === ',') {
      const top = stack.at(-1);
      if (top?.kind === 'obj') top.key = true;
      i += 1;
      continue;
    }
    if (/[-0-9tfn]/u.test(c)) {
      const m = /^(?:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/u.exec(text.slice(i));
      if (m === null || i + m[0].length >= text.length) break;
      i += m[0].length;
      closed(i);
      continue;
    }
    i += 1;
  }
  const props = schema['properties'] !== null && typeof schema['properties'] === 'object' ? (schema['properties'] as Record<string, JsonSchema>) : {};
  const required = Array.isArray(schema['required']) ? schema['required'].filter((k): k is string => typeof k === 'string') : [];
  for (const cut of cuts.reverse().slice(0, 64)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text.slice(0, cut.at).replace(/,\s*$/u, '') + cut.close);
    } catch {
      continue;
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
    const o = { ...(parsed as Record<string, unknown>) };
    let whole = true;
    for (const k of required) {
      if (Object.hasOwn(o, k)) continue;
      const e = emptyOf(props[k]);
      if (e === null) whole = false;
      else o[k] = e.v;
    }
    if (whole && keeps(o, schema)) return JSON.stringify(o);
  }
  return null;
}

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
type Read = { text: string; usage: Usage; cutOff: boolean | null; thought: number };

/* `thought` IS THE PART OF `usage.out` THE PLATFORM SAYS WAS REASONING (`completion_tokens_details.reasoning_tokens`), 0
   where it says nothing, so a cut-off answer can say whether the thinking or the answer ran the ceiling out. */
const readAnswer = (shape: Shape, raw: unknown): Read => {
  const answer = (raw !== null && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const reported = answer['usage'];
  const tokens = (reported !== null && typeof reported === 'object' ? reported : {}) as Record<string, unknown>;
  const usage: Usage = { in: count(tokens['prompt_tokens']), out: count(tokens['completion_tokens']), neurons: null };
  const details = tokens['completion_tokens_details'];
  const thought = count(details !== null && typeof details === 'object' ? (details as Record<string, unknown>)['reasoning_tokens'] : undefined);

  /* `response` IS AN OBJECT, NOT A STRING, WHEN THE PLATFORM HONOURED `response_format`: Workers AI's JSON mode hands the
     parsed value back (its own example answers `"response": { "name": "India", ... }`). Read as a string only, every
     schema-pinned answer on this shape became `''` and was refused as "not JSON at all", so a digest's prose on
     `llama-3.2-1b` was set aside on every call the model answered. Written back as JSON here, it is parsed and checked
     below like any other answer. */
  if (shape === 'text') {
    const response = answer['response'];
    const text = typeof response === 'string' ? response : response !== null && typeof response === 'object' ? JSON.stringify(response) : '';
    return { text, usage, cutOff: null, thought };
  }

  const choices = answer['choices'];
  const first = (Array.isArray(choices) ? choices[0] : undefined) as
    | { message?: { content?: unknown } | undefined; finish_reason?: unknown }
    | undefined;
  const content = first?.message?.content;
  const why = first?.finish_reason;
  return { text: typeof content === 'string' ? content : '', usage, cutOff: typeof why === 'string' ? why === 'length' : null, thought };
};

/**
 * Workers AI's event stream read to its end: each piece of the answer handed to `onText` as it lands, and at the end
 * the same `Read` a whole answer gives.
 *
 * THE COUNTS ARE THE STREAM'S LAST WORD. Measured on `glm-5.3-flash` (28 October), every chunk carries a `usage`, the
 * content chunks a count of their own piece, and the last chunk before `[DONE]` is `{ "response": "", "usage": {...} }`
 * with the call's whole counts; that chunk is the one read. A stream that ends without it (a provider that sends none, or
 * a body that broke off) is counted the way a prompt is estimated, `ceil(utf8 bytes / 4)`, over what arrived, the
 * reasoning included, and never below the largest count a chunk reported.
 *
 * A BINDING THAT ANSWERS WHOLE, a test's stub or a model that ignores `stream`, is read as a whole answer and handed on
 * in one piece.
 */
const readStream = async (shape: Shape, raw: unknown, onText: (text: string) => void, promptTokens: number): Promise<Read> => {
  const reader = (raw as { getReader?: unknown } | null)?.getReader;
  if (typeof reader !== 'function') {
    const read = readAnswer(shape, raw);
    if (read.text !== '') onText(read.text);
    return read;
  }
  const stream = (raw as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let held = '';
  let text = '';
  let reasoning = '';
  let cutOff: boolean | null = null;
  let total: Usage | null = null;
  let thought = 0;
  let most = { in: 0, out: 0 };
  let ended = false;
  const take = (line: string): void => {
    const data = line.startsWith('data:') ? line.slice(5).trim() : '';
    if (data === '' || ended) return;
    if (data === '[DONE]') {
      ended = true;
      return;
    }
    let chunk: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(data);
      if (parsed === null || typeof parsed !== 'object') return;
      chunk = parsed as Record<string, unknown>;
    } catch {
      return;
    }
    const reported = chunk['usage'];
    if (reported !== null && typeof reported === 'object') {
      const tokens = reported as Record<string, unknown>;
      const counted = { in: count(tokens['prompt_tokens']), out: count(tokens['completion_tokens']) };
      most = { in: Math.max(most.in, counted.in), out: Math.max(most.out, counted.out) };
      if (typeof chunk['response'] === 'string' && !Array.isArray(chunk['choices'])) {
        total = { ...counted, neurons: null };
        const details = tokens['completion_tokens_details'];
        thought = count(details !== null && typeof details === 'object' ? (details as Record<string, unknown>)['reasoning_tokens'] : undefined);
      }
    }
    const choices = chunk['choices'];
    const first = (Array.isArray(choices) ? choices[0] : undefined) as
      | { delta?: { content?: unknown; reasoning_content?: unknown } | undefined; finish_reason?: unknown }
      | undefined;
    const piece = first !== undefined ? first.delta?.content : shape === 'text' ? chunk['response'] : undefined;
    if (typeof first?.delta?.reasoning_content === 'string') reasoning += first.delta.reasoning_content;
    if (typeof first?.finish_reason === 'string') cutOff = first.finish_reason === 'length';
    if (typeof piece === 'string' && piece !== '') {
      text += piece;
      onText(piece);
    }
  };
  for (;;) {
    const { value, done } = await stream.read();
    if (done) break;
    held += decoder.decode(value, { stream: true });
    const lines = held.split('\n');
    held = lines.pop() ?? '';
    for (const line of lines) take(line.trim());
  }
  held += decoder.decode();
  if (held.trim() !== '') take(held.trim());
  const usage: Usage = total ?? { in: Math.max(most.in, promptTokens), out: Math.max(most.out, tokensIn(text + reasoning)), neurons: null };
  return { text, usage, cutOff, thought };
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
 * deployment without the binding still boots and still serves every route that is not Slash; the
 * first ask is answered `no adapter on this host`, which is a `Missing` the port declares for
 * exactly this case. The alternative is a cold-start crash that takes the whole record down over a
 * feature the deployment may never use.
 *
 * NOTHING HERE THROWS. `packages/ports/src/inference.ts` states the posture and this adapter is
 * what it was written for: a network call behind a method fails as the common case, and these
 * calls cross a Durable Object RPC boundary that an exception carries neither a code nor a
 * sentence across.
 */
/**
 * The port with one call more: `complete` streamed (`stream: true`), each piece of the answer handed to `onText` as it
 * lands and the same `Result` at the end, checked the same way. `onUsage` hears the counts the answer was billed at,
 * also when the answer then fails its checks, so a caller that throws can bill what was read and not an estimate.
 */
export type StreamingInference = Inference & {
  stream(req: CompleteRequest, onText: (text: string) => void, onUsage?: (usage: Usage) => void): Promise<Result<Completion>>;
};

export function aiInference(env: AiEnv, deps: AiDeps = {}): StreamingInference {
  /** The binding's answer, or one of the three `Missing` reasons, so neither caller re-reads the platform's error. */
  /* `raw` IS THE PLATFORM'S OWN SENTENCE, scrubbed and cut (`scrubRaw`), carried beside the phrase and never instead. */
  const call = async (provider: string, inputs: Record<string, unknown>): Promise<{ answer: unknown } | { why: Missing; raw: string }> => {
    const ai = env.AI;
    if (ai === undefined) return { why: 'no adapter on this host', raw: '' };
    try {
      return { answer: await runModel(env, provider, inputs, deps) };
    } catch (e) {
      const said = sayOf(e);
      return { why: NO_SUCH_MODEL.test(said) ? 'the provider does not serve it' : 'the provider did not answer', raw: scrubRaw(said) };
    }
  };

  /** One completion, whole or streamed: the ceiling before it, the call, and the answer's checks after. */
  const completion = async (req: CompleteRequest, onText?: (text: string) => void, onUsage?: (usage: Usage) => void): Promise<Result<Completion>> => {
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
      /* THE ROW'S OWN EFFORT, where it reasons (`Effort`): its thinking is spent from `max_tokens` too. */
      ...(rate.effort === undefined ? {} : { reasoning_effort: rate.effort }),
      /* AND A ROW THAT MUST NOT THINK AT ALL, where the platform has the switch (`thinks`). */
      ...(rate.thinks === false ? { chat_template_kwargs: { enable_thinking: false } } : {}),
      ...(onText === undefined ? {} : { stream: true }),
    });
    if ('why' in got) return modelMissing<Completion>(req.model, got.why, got.raw);

    /* A STREAM THAT BREAKS OFF IS A PROVIDER THAT STOPPED ANSWERING, in the port's words; what arrived before it is
       the caller's to count (`onText`). */
    let read: Read;
    try {
      read = onText === undefined ? readAnswer(rate.shape, got.answer) : await readStream(rate.shape, got.answer, onText, promptTokens);
    } catch (e) {
      return modelMissing<Completion>(req.model, 'the provider did not answer', scrubRaw(sayOf(e)));
    }
    const { text, usage, cutOff, thought } = read;
    onUsage?.(usage);

    /* TRUNCATION IS TOLD APART FROM A BAD ANSWER IN THE SENTENCE, AND IT IS CHECKED FIRST. A
       generation cut off at the ceiling is usually half a JSON document, so it fails the parse as
       well, and the two send a reader to different places: one raises `maxTokens`, the other
       rewrites the prompt. Measured while writing the test: with this check below the parse, the
       same half-written object is reported as JSON that could not be read, which is true and
       useless. Where the shape reports it, `cutOff` is the platform's own word; where it does
       not, the completion count against the ceiling is the only signal there is, and an absent
       `usage` counts as zero and therefore makes no claim either way. AND THE SENTENCE SAYS HOW MUCH
       OF THE CEILING WAS THINKING where the platform counted it (`Effort`): a reasoning row spends
       its ceiling on both, and the two send a reader to different places again, the effort or the
       size of what was asked for. */
    if (cutOff ?? (usage.out > 0 && usage.out >= req.maxTokens)) {
      /* MENDED WHERE IT CAN BE (`mendCut`), and said once in the log, so a ceiling that keeps being reached is still seen. */
      const mended = mendCut(text, req.schema);
      if (mended !== null) {
        deps.log?.(`ai: ${req.model} stopped at the ${req.maxTokens}-token ceiling and was mended to the last whole value`);
        return ok({ text: mended, model: rate.provider, usage });
      }
      return schemaFailed<Completion>(
        req.model,
        `it stopped at the ${req.maxTokens}-token ceiling${thought > 0 ? `, ${thought} of them its reasoning` : ''}, so what came back is the beginning of a document rather than one`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return schemaFailed<Completion>(req.model, 'it is not JSON at all');
    }
    const wrong = unhonoured(parsed, req.schema);
    if (wrong !== null) return schemaFailed<Completion>(req.model, wrong);

    return ok({ text, model: rate.provider, usage });
  };

  return {
    complete: (req: CompleteRequest): Promise<Result<Completion>> => completion(req),
    stream: (req, onText, onUsage) => completion(req, onText, onUsage),

    embed: async (texts: readonly string[]): Promise<Result<Embeddings>> => {
      /* NOTHING TO EMBED IS NOT A CALL. An empty batch is what a record with no new entries hands
         over on a nightly run, and paying a request for it is paying for a round trip that can only
         answer with an empty list. */
      if (texts.length === 0) return ok({ model: EMBED_MODEL, dims: 0, vectors: [], usage: { in: 0, out: 0, neurons: null } });

      const got = await call(EMBED_MODEL, { text: [...texts] });
      if ('why' in got) return modelMissing<Embeddings>(EMBED_MODEL, got.why, got.raw);

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
