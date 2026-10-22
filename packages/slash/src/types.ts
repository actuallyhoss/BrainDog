/**
 * The shapes this package asks of the world, and the three it has to declare for itself.
 *
 * `Inference` IS A PORT `@braindog/ports` HAS NOT GOT. `33 §1` lists it beside `Sql` and `Clock`,
 * and `31 §2` row 13 says this package's ports are `{ Sql, Clock, Inference }` in those words, but
 * the ports package carries `Sql Clock Scheduler KeyStore Http Snapshots Auth` and nothing at all
 * for a model. Declaring it here is the move `46 §4.6` already makes for `RecordApi`: the
 * structural subset this package calls, which a host satisfies without an import edge existing.
 * It moves down to `packages/ports` when somebody owns that file; nothing here changes when it does.
 *
 * `InferenceCall` HAS NO `tools` FIELD, AND THAT IS THE DECISION RATHER THAN AN OMISSION. `46 §13`
 * D9 and `11 §7`: no Slash inference passes tools, every call is schema-constrained structured
 * output, and retrieval is code. A rule kept by a reviewer lasts until the reviewer is busy, so the
 * rule is the type: a caller cannot pass a field the call shape does not name. The test that reads
 * the recorded calls back is the second lock, because a host writing its own adapter could still
 * add one on the way out.
 *
 * `CallContext` IS THE TWO FIELDS THIS PACKAGE READS AND NOT THE RECORD'S WHOLE ONE. The record's
 * `CallContext` carries seven more (`levels registers batch credentialed provedAt session`), every
 * one of them the record's business; naming them here would be a copy that goes stale the first
 * time one changes. What Slash asks is: who is calling, and what may they do.
 */

import type { Clock, Result, Sql } from '@braindog/ports';
import type { Predicate } from '@braindog/where';
import type { PatternDraft } from './jobs.ts';
import type { MappingAnswer, MappingAsk, SetupAnswer, SetupAsk } from './propose.ts';

export type { Result };

/** The predicate tree, validated here and never built here. `where` owns the grammar. */
export type Where = Predicate;

/** The port a host implements over Workers AI, an Ollama tag or a customer's own endpoint. */
export interface Inference {
  complete(call: InferenceCall): Promise<InferenceReply>;
  /**
   * OPTIONAL, as `complete` is not: an adapter built before embeddings, or a host with no embedding model, answers
   * `undefined` here and `embedTexts` (`jobs.ts`) refuses `NOT_IN_THIS_BUILD` rather than throwing on a method that
   * was never there. Throws as `complete` does, on the same host marks `answer.ts` reads off a throw.
   */
  embed?(texts: readonly string[]): Promise<Embedding>;
}

/** One call's embeddings: the model that answered, the width of each vector, and the vectors themselves, in order. */
export type Embedding = { model: string; dims: number; vectors: Int8Array[]; usage: { in: number; out: number } };

/**
 * One model call.
 *
 * `model` IS A SHORT NAME AND NEVER A PROVIDER ID. The adapter maps `glm-5.3-flash` onto whatever
 * the host is actually talking to, so no provider is named anywhere in this package and a
 * self-host swapping providers changes no line here. It is `string` rather than `ModelId` for the
 * one case that is not ours to name: on tiers `b` and `byo` the model is whatever the owner typed
 * into settings, which is why those two tiers also bill no neurons.
 */
export type InferenceCall = {
  model: string;
  messages: readonly { role: 'system' | 'user'; content: string }[];
  maxTokens: number;
  /** The result schema, sent to the provider AND re-checked by hand when the reply lands. */
  jsonSchema: object;
};

export type InferenceReply = {
  text: string;
  /** Tokens as the provider counted them. The meter bills these, never the local estimate. */
  usage: { in: number; out: number };
};

export type ModelId = 'llama-3.2-1b' | 'glm-5.3-flash' | 'glm-5.3' | 'bge-m3';
/** Neurons per million tokens, `08 §6`. */
export type ModelRate = { in: number; out: number };

/**
 * The six templates this package calls. `46 §4.5` describes eight and names no automation's question; `answer` is
 * an automation's question, `setup` and `mapping` are the first run's two asks, and the other five of the eight have no
 * caller here yet.
 */
export type PromptId = 'predicate' | 'propose' | 'pattern' | 'answer' | 'setup' | 'mapping';

export type PromptTemplate = {
  /** The purpose the host's route is asked for; every template in `PROMPTS` says one (`SlashPurpose` below). */
  purpose?: SlashPurpose;
  /** The model asked where the host hands no route. */
  model: ModelId;
  maxTokens: number;
  /** The ceiling on the prompt, in the local token estimate. Over it, rows are dropped from the end. */
  capIn: number;
  system: string;
  user: string;
  schema: object;
  /** The `%SLOT%` names `user` substitutes, whole, in one pass, never re-scanned. */
  slots: readonly string[];
};

/**
 * Who is calling.
 *
 * `level` IS OPTIONAL BECAUSE A SYSTEM PRINCIPAL HAS NONE. The record's union has three arms and
 * only two of them carry a level, so an optional field is the shape all three satisfy.
 */
export type Principal = { kind: string; id: string; level?: string | null | undefined };
export type CallContext = { principal: Principal };

/**
 * What this package asks of the record, `46 §4.6`.
 *
 * TWO METHODS, AND THE SECOND ONE IS THE ONLY WRITE. There is no `create`, no `update` and no
 * `openGrant` on this interface, which is how `46 §8`'s first two rows are kept structurally rather
 * than by a reviewer: the model cannot write a row because the object Slash holds has no method
 * that writes one, and it cannot see a credential because the only read is `project`, whose
 * `secret` fields are already labels (`30 §9` rule 3).
 *
 * `project` TAKES TWO ARGUMENTS WITH THE BUDGET INSIDE THE FIRST. `46 §4.6` as drafted called a
 * three-argument form and `45 D1` exports a two-argument one; the record's shape
 * settled it, and this is that shape.
 */
export interface RecordApi {
  project(args: ProjectQuery & { budget: { tokens: number } }, ctx: CallContext): Promise<Result<Projection>>;
  propose(
    args: { question: string; body_kind: FiledBodyKind; body: Record<string, unknown>; op_id?: string },
    ctx: CallContext,
  ): Promise<Result<{ id: string }>>;
}

export type ProjectQuery = {
  registers: string[];
  where?: Where | undefined;
  q?: string | undefined;
  limit?: number | undefined;
};

export type ProjectionField = { id: string; type: string };

/**
 * One register in the index.
 *
 * `open` IS OPTIONAL AND `45 §4.4` HAS IT REQUIRED, and the difference is a host that has not got the record's `project` yet.
 * It is the count of non-terminal rows, which the record's own projection knows from the register's `done:` states and its
 * own row counts; a host bridging this port over `list` can only get it by listing every register and counting, which is a
 * scan per register on the index call. Nothing here computes with it: `indexLines` prints it for the model and that is all,
 * so a projection that does not know the figure omits it and the line is printed without the clause. A zero would have been
 * a figure in a prompt that nothing measured, which is the one thing `cite` exists to stop on the way back.
 */
export type ProjectionRegister = { id: string; rows: number; open?: number; fields: ProjectionField[] };
export type Projection = {
  rows: ProjectionRow[];
  index: { registers: ProjectionRegister[]; open_questions: string[] };
  budget: { used: number; limit: number };
};
export type ProjectionRow = {
  id: string;
  register: string;
  seq: number;
  /** `obligations#7`, the qualified form of `34 §4`. The only id a proposal may name. */
  spoken: string;
  summary: string;
  fields: Record<string, unknown>;
};

/** The five bodies of `46 §4.2`. `query` is the palette's answer and is the one that is never filed. */
export type BodyKind = 'query' | 'options' | 'pattern' | 'rowset' | 'change';
export type FiledBodyKind = Exclude<BodyKind, 'query'>;

export const VERBS = ['decide', 'defer', 'dismiss', 'edit', 'save', 'open'] as const;
export type Verb = (typeof VERBS)[number];

/** What was read, for the fold of `23 §6`. Register, count and predicate: never a row, never a value. */
export type ReadTrace = { register: string; rows: number; predicate: string };

export type Proposal = {
  /** One to three sentences. Every figure a `{{path}}`; no digit outside `{{…}}` or a code span. */
  text: string;
  citations: string[];
  verbs: Verb[];
  body_kind: BodyKind;
  body: Record<string, unknown>;
  /** Ships with every output, always (`23 §1`). */
  model: string;
  /** The spoken id `record.propose` returned, or `null` for a `query` and for nothing. */
  filed: string | null;
  read: ReadTrace[];
};

export type Reading = {
  /** The `call` row's id. Pass 2 quotes it back so the drafted predicate is not drafted twice. */
  ask_id: string;
  predicate: Where | null;
  q: string | null;
  read: ReadTrace[];
  rows: ProjectionRow[];
};

export type Settings = {
  tier: Tier;
  model: string | null;
  grant_id: string | null;
  ask_cap: number;
  updated_at: string;
};
export type Tier = 'a' | 'b' | 'byo';

/**
 * The monthly ask limit a record starts with, and the one `ask_cap` is held to until its owner sets another.
 *
 * NAMED ONCE, HERE, because the site's price list and the Settings row both say it:
 * a number written in three places is three numbers the day one of them moves.
 */
export const ASK_CAP_DEFAULT = 80;

/**
 * The monthly ask limit of a record on Free, the plan a record made without paying is on: Slash credits,
 * as the pricing page counts them. Cloud's is `ASK_CAP_DEFAULT`.
 *
 * NAMED HERE BESIDE IT, for the same reason: the site's Free card says it, and `apps/site/src/lib/plans.test.ts` holds
 * the card to this. The Worker lowers a record to it when the record is put on Free, holds a save above it while it is
 * there, and raises it back to `ASK_CAP_DEFAULT` when it is paid for (`slashPlanMoved` in `apps/worker/src/slash.ts`).
 */
export const ASK_CAP_FREE = 20;

/**
 * The asks a month Slash's background work may spend on the included model: the daily look, the page headlines, digest
 * prose, a pattern drafted for the inbox and the reading of who is who, apart from the asks a person makes.
 *
 * 600, HIS RECORD'S MONTHLY THINKING BUDGET. It was 60 while the ledger could not tell a background ask
 * from one of his, and a background ask on the included model spent one of his 80. The ledger says it now (`Spends`,
 * `call.ts`'s `backgroundUsed`), so this is a count of its own and his 80 stay his. An automation's question is not in
 * it: that spends his own allowance.
 */
export const BACKGROUND_ASKS_MONTH = 600;

/**
 * What an ask was for, written on its ledger row by whoever made the call and never read back out of its kind or the
 * words of its question.
 *
 * `ask` is a person's own question or press. `automation` is a rule of his asking at one of its steps. `plan` is the
 * first plan a new record is offered. `headline` is the page headlines, `understand` the reading of who is who, and
 * `look` the daily look.
 *
 * `compose`, `skill`, `pattern`, `prose`, `embed` and `probe` are the host router's own names for the other background
 * work one by one (`packages/host/src/infer.ts`, host-infer-54). The engine's own jobs write `pattern`, `prose` and
 * `embed` (`jobs.ts`), the host writes a skill draft as `skill` (`packages/host/src/slash-ask.ts`), nothing writes
 * `compose` yet, and `probe` is the operator's test of a model, which spends nobody's allowance. The ledger's purpose
 * column takes any of them.
 */
export type Purpose = 'ask' | 'automation' | 'plan' | 'headline' | 'understand' | 'look' | 'compose' | 'skill' | 'pattern' | 'prose' | 'embed' | 'probe';

/**
 * The purposes this package's own templates ask a route for (`prompts.ts` `TemplatePurpose`, restated there because that
 * file imports nothing). Each is a name in the host router's `PURPOSES`, so a host hands `routeFor` the value as it is.
 */
export type SlashPurpose = 'ask' | 'plan' | 'automation' | 'pattern' | 'prose';

/**
 * One model a host's route offers, shaped to the host router's `Candidate` (`packages/host/src/infer.ts`) without
 * importing it: `id` is the host's handle, written on the row's `candidate` and never shown to a person, `model` the
 * short name sent, and `inference` the wire it is on, where that is not the adapter the caller handed `core.run`.
 */
export type SlashCandidate = { id?: string | undefined; model: string; inference?: Inference | undefined };

/**
 * The host's router, handed to the core (ENG-A06): the candidates for one purpose, in the order they are tried.
 *
 * "RULES ARE THE FALLBACK, NOT THE ENGINE". When the first candidate is not served, `core.run` asks the next
 * before its caller's rules speak. THE HOST DECIDES WHAT IS ON IT: his own key is a route of one, and the larger model is
 * on none unless its cost was agreed (HD.463). No route, or an empty one, is the template's own model as before.
 */
export type SlashRoute = (purpose: SlashPurpose) => readonly SlashCandidate[];

/**
 * Whose monthly allowance a ledger row spends: `person` is one of his asks (`ask_cap`), `background` one of the
 * background allowance (`BACKGROUND_ASKS_MONTH`), and `none` neither, which is every attempt no model answered and
 * every second model call of a question already counted.
 */
export type Spends = 'person' | 'background' | 'none';

/**
 * Where Slash's model comes from: the model this host includes, or a key of the owner's own at a provider he chose.
 *
 * THE OWNER'S WORD FOR THE CHOICE, AND THE TIER IS THE STORE'S. `slash_settings` keeps a tier under its `46 §4.1` CHECK, so
 * `included` is stored as `a` and `key` as `b`, and a record a self-host keeps on `byo` reads as `included`: that is the
 * host's own endpoint with a model name typed for it, and nothing of the owner's is sent. `tier` stays readable beside it
 * for one release.
 *
 * A SAVE OF `included` NEVER WRITES `byo` (ENG-A07), whatever `tier` it carries. On a self-host it keeps the model name
 * typed for the host's own endpoint on tier `a`, so the two forms are the same two on every host; a row stored on `byo`
 * before is read, never rewritten, and keeps the count its host gives that tier.
 */
export type Source = 'included' | 'key';

/** The two shapes an own key is asked in: Anthropic's Messages API, and the chat completions most other providers speak. */
export const PROVIDERS = ['anthropic', 'openai'] as const;
export type Provider = (typeof PROVIDERS)[number];

/**
 * Settings as the owner chose them: the stored row, and where the own key is asked.
 *
 * `provider` AND `base_url` ARE KEPT BESIDE THE ROW AND NOT IN IT, in `slash_meta` (`index.ts`, `OWN_PROVIDER`), because a
 * column is a step under `STORE_VERSION` and this is two values the row's own shape has no room for. `base_url` is `null`
 * where the owner left it to the provider's own address, and the host fills that in.
 */
export type Setup = Settings & { source: Source; provider: Provider | null; base_url: string | null };

/** What an owner may change, as the settings door hands it on. `tier` still works. */
export type SetupPatch = Partial<{
  source: Source;
  tier: Tier;
  provider: Provider | null;
  base_url: string | null;
  model: string | null;
  grant_id: string | null;
  ask_cap: number;
}>;

/**
 * `capped` IS WHETHER THE MONTH'S ASKS STOP AT `cap`. On his own key they are listed and not capped,
 * so `used` is still the count and `cap` is the limit that would apply on the included model.
 */
export type Status = {
  source: Source;
  tier: Tier;
  provider: Provider | null;
  model: string;
  asks: { used: number; cap: number; resets: string; capped: boolean };
  /** The month's background asks and their allowance (`BACKGROUND_ASKS_MONTH`), never his. Absent from a host that does not count them. */
  background?: { used: number; cap: number };
};

/**
 * One ask in the ledger, as `history` lists it for the person who pays for them (`GET /api/slash/asks`).
 *
 * THE LEDGER'S OWN COLUMNS AND NOTHING WORKED OUT. `question` is what was typed, or `rule.<id> step <n>` for an
 * automation's, or the record's own words for its press; `filed` is the suggestion it put on Decide. No row of the record
 * and no prompt is here, because the ledger never held one (`call.ts`).
 *
 * `purpose` is what the ask was for, the column the store has written since version 3 (`Purpose` above): `ask` for his
 * own, `headline`, `understand`, `look` and the rest for the record's. It is a string here because the ledger's column
 * is one, and a screen that counts by it names the ones it knows and keeps the others under their own word.
 */
export type Asked = {
  id: string;
  ts: string;
  kind: string;
  purpose: string;
  status: string;
  code: string | null;
  question: string | null;
  model: string;
  filed: string | null;
};

/** What a figure may be pinned to, built once per projection (`46 §5.6`). */
export type Citable = {
  spoken: Set<string>;
  paths: Set<string>;
  /** `500500 EGP`: the minor units and the code, as a quoted `{{money:…}}` has to spell them. */
  money: Set<string>;
  days: Set<string>;
};

/** One message as it arrived, `46 §4.4`. The shape `shapeOf` groups and `proposePattern` reads. */
export type RawPayload = {
  id: string;
  channel: 'email' | 'webhook' | 'pull' | 'paste' | 'api';
  ts: string;
  from: string | null;
  subject: string | null;
  body: string;
};

/**
 * One automation's question, as the kernel's `infer.ask` outbox row carries it (`packages/kernel/src/flow.ts`, `ask`).
 *
 * `step` IS THE KERNEL'S, COUNTED FROM ZERO, and every sentence about it says `step + 1`, as the kernel's own do.
 * `about` IS THE RUN'S ROW, ALREADY CUT DOWN BY THE KERNEL to the fields the rule named, with no `secret` or `file` field
 * among them (`UNSENDABLE`), so this package is handed values and never reads the record for them.
 */
export type Ask = {
  rule: string;
  step: number;
  question: string;
  shape: 'text' | 'number' | 'choice';
  choices?: readonly string[] | undefined;
  about?: Readonly<Record<string, unknown>> | undefined;
};

export type SlashDeps = {
  /** Slash's OWN SQLite: the `slash_settings` and `slash_call` tables of `46 §4.1`, never the record's database. */
  sql: Sql;
  clock: Clock;
  inference: Inference;
  record: RecordApi;
};

/**
 * The engine.
 *
 * `inference` ON EVERY ASK IS THE MODEL FOR THIS ONE ASK, in place of `SlashDeps.inference`. On his own key it is the host's
 * adapter over that key, opened for the asker (or in the rule's name, for an automation), and the opening is an event with
 * an actor; built once for the engine, the adapter could name nobody. An argument and not a slot the host sets around the
 * call, because two asks awaiting the model together would share the slot, and not `AsyncLocalStorage`, which the Worker
 * has not got. `byok` is the adapter the proposal is asked on when Slash runs on his own key; a host hands the same one as
 * `inference`, so both passes of one question go to the model he chose.
 */
export interface Slash {
  read(question: string, ctx: CallContext, inference?: Inference): Promise<Result<Reading>>;
  propose(question: string, ctx: CallContext, byok?: Inference, askId?: string, inference?: Inference): Promise<Result<Proposal>>;
  proposePattern(samples: readonly RawPayload[], ctx: CallContext, inference?: Inference): Promise<Result<Proposal>>;
  /** A pattern for the samples, drafted and not filed: the record's `infer.draft` job, which the host's pass acks with it (`jobs.ts`). The three oldest are sent, and `waiting` is how many of the shape wait (ENG-B07). */
  draftPattern(samples: readonly RawPayload[], waiting?: number): Promise<Result<PatternDraft>>;
  /** Two sentences above a digest about to be sent, or `{ text: '' }` for none: the record's `infer.prose` job (`jobs.ts`). */
  digestProse(digest: unknown): Promise<Result<{ text: string }>>;
  /** The record's `infer.embed` job: one embedding call over `texts`, on the engine's own `Inference.embed` (`jobs.ts`). */
  embedTexts(texts: readonly string[]): Promise<Result<Embedding>>;
  /**
   * An automation's question, answered in the shape its rule asked for. `inference` is the model for this job, keyed in the
   * rule's name, as `read`'s is keyed in the asker's; it takes no `CallContext` because nobody is asking.
   */
  answer(ask: Ask, inference?: Inference): Promise<Result<{ text: string }>>;
  /** The first run's setup from what a person typed about themselves, held to the catalogue the browser offered (`propose.ts`). */
  proposeSetup(ask: SetupAsk, ctx: CallContext, inference?: Inference): Promise<Result<SetupAnswer>>;
  /** How a file exported from another app maps into the record's lists, from its columns and first entries. */
  proposeMapping(ask: MappingAsk, ctx: CallContext, inference?: Inference): Promise<Result<MappingAnswer>>;
  configure(patch: SetupPatch, ctx: CallContext): Result<Setup>;
  status(): Status;
  /** The owner's latest asks, newest first, at most `limit` of them (`ASKS_MOST` in `index.ts`). */
  history(limit: number, ctx: CallContext): Result<{ asks: Asked[] }>;
}
