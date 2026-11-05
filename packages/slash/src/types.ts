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
  /**
   * `complete`, with the reply's text handed to `onText` piece by piece as the provider sends it, and the same reply at
   * the end: the whole text, and the usage the stream's last chunk reported, or the adapter's estimate where it reported
   * none. OPTIONAL, as `embed` is: an adapter without it is asked through `complete`, and the answer arrives whole.
   * Throws as `complete` does; a throw after any text arrived is marked `answered`, since a model ran.
   */
  stream?(call: InferenceCall, onText: (text: string) => void): Promise<InferenceReply>;
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

export type ModelId = 'llama-3.2-1b' | 'glm-5.3-flash' | 'glm-5.3' | 'bge-m3' | 'gemma-4-26b-a4b';
/** Neurons per million tokens, `08 §6`. */
export type ModelRate = { in: number; out: number };

/**
 * The six templates this package calls. `46 §4.5` describes eight and names no automation's question; `answer` is
 * an automation's question, `setup` and `mapping` are the first run's two asks, and the other five of the eight have no
 * caller here yet.
 */
export type PromptId = 'predicate' | 'propose' | 'pattern' | 'answer' | 'setup' | 'mapping' | 'chat' | 'turn' | 'drafts';

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
  /** `false`: asked on its own model, never walked down the host's route (`prompts.ts`). */
  walks?: false;
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
 * The host's router, handed to the core: the candidates for one purpose, in the order they are tried.
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
 * A SAVE OF `included` NEVER WRITES `byo`, whatever `tier` it carries. On a self-host it keeps the model name
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
export type Setup = Settings & { source: Source; provider: Provider | null; base_url: string | null; deep: DeepSetup };

/**
 * Deep as the owner set it up: the keychain grant holding his Anthropic key for it, and the most it may spend in a month,
 * in cents. `grant_id` is `null` where he picked none, and then Deep answers on his own key where that key is Anthropic's.
 * A cap of 0 turns Deep off.
 */
export type DeepSetup = { grant_id: string | null; cap_cents: number };

/** What an owner may change, as the settings door hands it on. `tier` still works. */
export type SetupPatch = Partial<{
  source: Source;
  tier: Tier;
  provider: Provider | null;
  base_url: string | null;
  model: string | null;
  grant_id: string | null;
  ask_cap: number;
  /** The keychain grant Deep answers with, or `null` to use his own key where that key is Anthropic's. */
  deep_grant_id: string | null;
  /** The most Deep may spend in a month, in cents; 0 turns it off. */
  deep_cap_cents: number;
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
  /**
   * Deep: whether an Anthropic key is set for it, the model it answers with and the one "Think harder" asks, and this
   * month's spend against its cap, in cents, as the provider's own counts priced it.
   */
  deep?: { key: boolean; model: string; harder: string; cap_cents: number; spent_cents: number };
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
  /** A pattern for the samples, drafted and not filed: the record's `infer.draft` job, which the host's pass acks with it (`jobs.ts`). The three oldest are sent, and `waiting` is how many of the shape wait. */
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
  /**
   * One turn of a conversation (`chat.ts`): the model reads the record through `tools`, does what the person asked
   * through them, and answers. Every event goes to `emit` as it happens, and the last is always `done`. One ask a turn,
   * on the same month's count as a question, however many steps it took.
   */
  chat(input: ChatInput, ctx: CallContext, tools: ChatTools, emit: (event: ChatEvent) => void, inference?: Inference, deep?: Deep): Promise<void>;
  /** A held action answered: `accept` applies it through `tools.apply`, and either way it is settled and never asked again. */
  act(id: string, accept: boolean, ctx: CallContext, tools: Pick<ChatTools, 'apply'>): Promise<Result<ChatActed>>;
  /** One conversation, its turns oldest first, for the person who had it and nobody else. */
  thread(id: string, ctx: CallContext): Result<ChatThread>;
  /** This person's conversations, newest first, each titled by the name they gave it or else its first words. */
  threads(ctx: CallContext): Result<ChatThreads>;
  /** Name one of this person's conversations; no words hands it back to its first words. */
  rename(id: string, name: string, ctx: CallContext): Result<{ id: string }>;
  /** Delete one of this person's conversations, its turns and what it held for a yes. */
  remove(id: string, ctx: CallContext): Result<{ id: string }>;
}

/* ── a conversation ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * What a person sent: the words, the conversation it continues, and where they were when they sent it.
 *
 * `mode` IS HOW DEEP: `quick` the model this host answers with, `deep` the owner's own Anthropic key, `auto` quick first
 * and deep when the ask wants a plan, a why or several changes, or quick runs out of steps. Absent is `quick`, as every
 * turn was before there were two. `attach` names rows the person sent with the words (`tasks#12`), read before the first
 * model call. `rethink` asks the thread's last question again at deep, on the model that thinks harder; `message` may
 * then be empty, and the question is the thread's own.
 */
export type ChatInput = {
  thread?: string | undefined;
  message: string;
  page?: { path: string; title?: string | undefined; row?: string | undefined } | undefined;
  mode?: ChatMode | undefined;
  attach?: readonly string[] | undefined;
  /** Which letters of the message name which row, kept with the turn and read back with it, for its bubble alone. */
  mentions?: readonly ChatMention[] | undefined;
  rethink?: boolean | undefined;
};

/** `len` letters at `at` in what somebody sent name `ref`. */
export type ChatMention = { at: number; len: number; ref: string };

/** How deep a turn goes: the included model, the owner's own Anthropic key, or the first and then the second. */
export type ChatMode = 'quick' | 'deep' | 'auto';

/**
 * One thing Slash did, or wants to do and waits for a yes on. `done` has happened, with `undo` its batch where the record
 * keeps one; `ask` is held (`act` answers it). `state` is said once an `ask` is answered, on a thread read back.
 */
export type ChatAction = {
  id: string;
  kind: 'done' | 'ask';
  title: string;
  detail?: string | undefined;
  undo?: { batch: string } | undefined;
  href?: string | undefined;
  state?: 'open' | 'accepted' | 'declined' | undefined;
  /** A message that went to an agent: the instruction to read back, who it went to, and the run where it went to one. */
  sent?: ChatSent | undefined;
  /** Cards of one choice: only one of them is taken, and Enter takes none, since which one is the question. */
  group?: string | undefined;
};

export type ChatSent = { id: string; to: string; said?: string | undefined; run?: string | undefined };

/** The events of one turn, in the order they happen, one a line on the wire. */
export type ChatEvent =
  | { type: 'thread'; id: string }
  | { type: 'step'; text: string }
  /* `figures` NAMES THE ROWS THIS PIECE LINKS, so a link streamed before `done` is drawn by its name at once. */
  | { type: 'delta'; text: string; figures?: ChatFigure[] | undefined }
  | ({ type: 'action' } & Omit<ChatAction, 'state'>)
  | { type: 'navigate'; href: string; label: string }
  | { type: 'error'; text: string }
  /* WHICH BRAIN ANSWERS THIS TURN, said once it is known and again if an `auto` turn goes deep. */
  | { type: 'brain'; depth: 'quick' | 'deep'; model?: string | undefined }
  /* DEEP WAS ASKED FOR AND CANNOT ANSWER HERE: the screen may hand the turn to Claude on the person's own Mac. */
  | { type: 'route'; to: 'mac' }
  | { type: 'done'; spent: { asks: number; left: number | null }; figures?: ChatFigure[] | undefined };

/** A row the answer links to, by the `register#seq` in its brace and the row's own name. */
export type ChatFigure = { ref: string; label: string };

/** One tool as the model is told of it: its name, the arguments it takes as they read in a line, and what it does. */
export type ChatTool = { name: string; args: string; about: string; writes?: boolean | undefined };

/**
 * What one tool call came back with.
 *
 * `text` IS WHAT THE MODEL READS NEXT, already short. `outside` names text from outside the record the call handed back,
 * which drops the rest of the turn to asking. `action` is a write's outcome; an `ask` carries `op`, the write to make on
 * the person's yes, which the engine keeps and never shows. `figures` are numbers worked out in code (`calc`), which the
 * answer may say though no result printed them.
 */
export type ChatRan = {
  text: string;
  outside?: string | null | undefined;
  action?: (Omit<ChatAction, 'id' | 'state'> & { op?: Record<string, unknown> | undefined }) | undefined;
  /** Several held at once: a choice, each its own card. */
  actions?: readonly (Omit<ChatAction, 'id' | 'state'> & { op?: Record<string, unknown> | undefined })[] | undefined;
  navigate?: { href: string; label: string } | undefined;
  figures?: readonly number[] | undefined;
  /** The words the step says while it runs, "Reading Money". */
  step?: string | undefined;
};

/** How the run stands when a tool is called: whether it may write at once, and the person's words it acts on. */
export type ChatRun = { askOnly: boolean; asked: boolean; said: string; outside: string | null; sent?: readonly string[] };

/**
 * The tools a host hands a conversation, over the record and as the asker: reads, writes through the record's own write
 * path, and `ref`, which turns an id a result printed into the `register#seq` a link is drawn from.
 */
export type ChatTools = {
  list: readonly ChatTool[];
  call(name: string, args: Record<string, unknown>, run: ChatRun): Promise<ChatRan>;
  apply(op: Record<string, unknown>): Promise<Result<{ receipt: string; undo?: { batch: string } | undefined; href?: string | undefined; sent?: ChatSent | undefined }>>;
  /**
   * A sentence plainly about the agents, answered from the record with no model and no ask spent, or `null` for the model
   * to read. Nothing an agent wrote reaches a model this way, and the first words wait only on the record.
   */
  direct?(message: string, sent: { attach?: readonly string[] | undefined; mentions?: readonly ChatMention[] | undefined; page?: { row?: string | undefined } | undefined }): Promise<ChatRan | null>;
  /** An id a result printed, as the `register#seq` a link is drawn from and the row's own name, or `null`. */
  ref?(id: string): Promise<{ ref: string; label: string } | null>;
  /** The lists the asker may read, named with their ids and counts in one line, which the model is shown before it calls anything. */
  context?(): Promise<string>;
  /**
   * The reads a message plainly wants, run before the first model call so a plain question is answered in one: cash and
   * spending ask for the figures, "what's late" for today. Reads only, and none for a message asking for something done.
   */
  prefetch?(message: string): readonly { tool: string; args: Record<string, unknown> }[];
  /**
   * One thing the person sent with their words, read as they may read it: a row (`tasks#12`), a question in Decide
   * (`decide:<id>`), an agent's run (`run:<id>`) or a vital sign (`sign:<id>`). Absent, a row is read with `open` and the
   * other three are not read.
   */
  attached?(ref: string): Promise<ChatRan>;
};

/* ── deep: the owner's own Anthropic key, with the model's own tool use ──────────────────────────────────────────── */

/**
 * The port Deep is asked through: one Messages turn with tools, streamed. NOT `Inference`, whose call shape has no tools
 * by decision (the top of this file): every quick ask keeps that rule. Deep is the one place a model is handed the tools
 * themselves, and only on the owner's own key, so it is its own port and a host builds it only over that key.
 *
 * `content` IS THE PROVIDER'S BLOCKS AS THEY CAME, thinking blocks included, because the next request must hand them back
 * unchanged; the engine reads only `text` and `tool_use` out of them.
 */
export interface DeepInference {
  turn(call: DeepCall, on: DeepStream): Promise<DeepReply>;
}

export type DeepTool = { name: string; description: string; input_schema: Record<string, unknown> };
export type DeepBlock = Record<string, unknown> & { type: string };
export type DeepMessage = { role: 'user' | 'assistant'; content: string | readonly DeepBlock[] };
export type DeepCall = {
  model: string;
  /** Stable for every turn, so it and the tools are read from the provider's cache after the first. */
  system: string;
  tools: readonly DeepTool[];
  messages: readonly DeepMessage[];
  maxTokens: number;
  effort: 'low' | 'medium' | 'high';
  /** `none` on a turn's last step, which may only answer. The tools stay listed, so the cached prefix is the same. */
  toolChoice?: 'auto' | 'none' | undefined;
};
/** What the provider counted: fresh input, output, and input read from and written to its cache. */
export type DeepUsage = { in: number; out: number; cacheRead: number; cacheWrite: number };
export type DeepReply = { content: DeepBlock[]; stop: string; usage: DeepUsage; model: string };
/** The reply as it streams: the answer's words as they land, and the name of each tool the model starts to call. */
export type DeepStream = { text(piece: string): void; tool?(name: string): void };

/**
 * What a host hands a turn for Deep: the port over the owner's key, or the sentence for why it cannot open here (the
 * keychain closed in this session, the key gone). Absent where no Anthropic key is set for Deep at all.
 */
export type Deep = { inference: DeepInference } | { refused: string };

/** A held action answered. */
export type ChatActed ={ ok: true; receipt?: string | undefined; undo?: { batch: string } | undefined };

/** A person's conversations, newest first. */
export type ChatThreads = { threads: { id: string; title: string; at: string; answering?: true }[] };

/**
 * One conversation read back. `answering` is an answer whose turn is still writing it; `stopped` one whose turn went quiet
 * partway and will not finish (`ANSWER_QUIET_MS`); `error` what stopped an answer that ended short.
 */
export type ChatThread = {
  id: string;
  turns: {
    role: 'you' | 'slash';
    text: string;
    mentions?: ChatMention[];
    actions: ChatAction[];
    steps?: string[];
    go?: { href: string; label: string }[];
    route?: string;
    error?: string;
    figures?: ChatFigure[];
    answering?: true;
    stopped?: true;
  }[];
};
