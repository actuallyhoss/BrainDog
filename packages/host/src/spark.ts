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
 * proposals about its arrangement (`packages/record/src/spark.ts`, `loop/research-spark.md` S15). `@braindog/spark` is
 * `docs/46`'s assistant engine: a person's typed question turned into a predicate, their own rows, and one cited proposal
 * with verbs, plus the ingest-pattern proposer, the meter and the tiers.
 *
 * THEY OVERLAP ON EXACTLY ONE BODY KIND OF SEVEN, AND `rowset` IS IT. An earlier line here called the two sets disjoint,
 * which `grep -n rowset packages/record/src/spark.ts` refutes at `:620`: the record's Spark files `pack`, `settings`,
 * `arrange` and one `rowset`, the skill row a use case names and the Skills list has not got. The package files `query`,
 * `options`, `rowset` and `pattern`. The one shared kind is not one feature written twice either, because what reaches it
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

import { ok, type Result } from '@braindog/ports';
import type { Entry, RegisterDecl } from '@braindog/kernel';
import type { CallContext, RecordApi, SparkFormInput, SparkModel, SparkModelInput } from '@braindog/record';

/** How long a draft may take before Spark's own rules speak instead. */
export const SPARK_TIMEOUT_MS = 30_000;

/** At most this much of an answer is read. Three proposals are a few kilobytes. */
const ANSWER_BYTES = 64_000;

/** What the model is told. Data, so it can be read and reviewed in one place. */
export const SPARK_INSTRUCTIONS = [
  'You are Spark, the manager of one BrainDog: a record a person keeps, arranged as lists, pages, packs and a voice.',
  'You are given how the record is used: which lists grow, which pages are opened, what nothing has touched, what agents write, and what the host offers to install.',
  'Propose at most `most` changes that would make this BrainDog fit how it is really used. Each is one question the owner answers on Decide, with the reason in the question.',
  'Answer only JSON: {"drafts":[{"question":"...","body_kind":"pack"|"settings"|"arrange","body":{...}}]}. The rules\' drafts show the body shapes.',
  'pack bodies: {"install":"<offered id>"}, {"enable":"<id>"}, {"disable":"<id>"}. settings: {"pack":"<id>","values":{...}} or {"voice":{"home":"..."}}. arrange: {"why":["..."],"usecase"?,"packs"?,"pages"?,"settings"?,"voice"?}.',
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
 * One POST to the endpoint, and the body it answered.
 *
 * ONE FUNCTION FOR BOTH PORTS, because the key discipline is the part that must not be written twice: asked for on this call
 * (`key()`), put in a header and nowhere else, and gone when the string this returns is handed back. A second copy of these
 * eight lines is a second place for the key to end up in a request body or an error sentence.
 */
const post = async (url: URL, options: EndpointModelOptions, body: unknown): Promise<string> => {
  const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' };
  const key = options.key ? await options.key() : null;
  if (key) headers.authorization = `Bearer ${key}`;
  const res = await options.send(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(options.timeoutMs ?? SPARK_TIMEOUT_MS),
  });
  /* THE STATUS AND NOTHING ELSE. An error body can echo the request, and the request can carry the key. */
  if (!res.ok) throw new Error(`The Spark endpoint answered ${res.status}.`);
  const text = await res.text();
  if (text.length > ANSWER_BYTES) throw new Error('The Spark endpoint answered more than Spark reads.');
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

/** What the package reads back. `usage` is the provider's own count, which is what the meter bills (`46 §4.1`). */
export type SparkInferenceReply = { text: string; usage: { in: number; out: number } };

export interface SparkInference {
  complete(call: SparkInferenceCall): Promise<SparkInferenceReply>;
}

/** A count the endpoint may not have sent. Absent is zero, and zero bills nothing rather than guessing a figure. */
const counted = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/**
 * The same endpoint as the package's `Inference` port.
 *
 * THE SHORT NAME IS THE PACKAGE'S AND THE PROVIDER ID IS THIS HOST'S (`46 §2`, the routing table's note). The package asks
 * for `glm-5.3-flash` because that is what its table routes the job to; what answers is whatever `SPARK_MODEL` names on this
 * host, an Ollama tag or a gateway's id, and the mapping lives here so no provider is named in the package. With no
 * `SPARK_MODEL` the short name is passed through, which is right for an endpoint that serves exactly one model and says so.
 *
 * `response_format` IS `json_schema` AND NOT `json_object`, which is the whole difference from `endpointModel`'s ask: the
 * package pins a schema per job and re-checks the answer by hand (`checkSchema`), and an endpoint that enforces the schema
 * turns that second check into a formality instead of a retry. `strict: true` is the half that asks for enforcement rather
 * than a suggestion.
 *
 * EVERY FAILURE IS A THROW, which `core.run` reads as `UNREACHABLE` and accounts for: the ask is refused, the meter still
 * carries the row, and nothing is filed.
 */
export function endpointInference(options: EndpointModelOptions): SparkInference {
  const url = endpointUrl(options.url);
  return {
    complete: async (call: SparkInferenceCall): Promise<SparkInferenceReply> => {
      const text = await post(url, options, {
        model: options.model ?? call.model,
        temperature: 0,
        max_tokens: call.maxTokens,
        response_format: { type: 'json_schema', json_schema: { name: 'answer', schema: call.jsonSchema, strict: true } },
        messages: call.messages.map((m) => ({ role: m.role, content: m.content })),
      });
      const parsed = JSON.parse(text) as {
        choices?: { message?: { content?: unknown } }[];
        usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
      };
      const content = parsed?.choices?.[0]?.message?.content;
      /* THE TEXT AND NOT THE PARSE, because the package parses it itself and then checks it against the schema it sent. An
         endpoint that answered the object bare, with no `choices`, is read as having answered the whole body. */
      const answered = typeof content === 'string' ? (FENCE.exec(content)?.[1] ?? content) : text;
      return {
        text: answered,
        usage: { in: counted(parsed?.usage?.prompt_tokens), out: counted(parsed?.usage?.completion_tokens) },
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
