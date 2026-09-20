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
 * D9 and `11 §7`: no Spark inference passes tools, every call is schema-constrained structured
 * output, and retrieval is code. A rule kept by a reviewer lasts until the reviewer is busy, so the
 * rule is the type: a caller cannot pass a field the call shape does not name. The test that reads
 * the recorded calls back is the second lock, because a host writing its own adapter could still
 * add one on the way out.
 *
 * `CallContext` IS THE TWO FIELDS THIS PACKAGE READS AND NOT THE RECORD'S WHOLE ONE. The record's
 * `CallContext` carries seven more (`levels registers batch credentialed provedAt session`), every
 * one of them the record's business; naming them here would be a copy that goes stale the first
 * time one changes. What Spark asks is: who is calling, and what may they do.
 */

import type { Clock, Result, Sql } from '@braindog/ports';
import type { Predicate } from '@braindog/where';

export type { Result };

/** The predicate tree, validated here and never built here. `where` owns the grammar. */
export type Where = Predicate;

/** The port a host implements over Workers AI, an Ollama tag or a customer's own endpoint. */
export interface Inference {
  complete(call: InferenceCall): Promise<InferenceReply>;
}

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

/** The three templates this package calls. `46 §4.5` describes eight; the other five have no caller here yet. */
export type PromptId = 'predicate' | 'propose' | 'pattern';

export type PromptTemplate = {
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
 * than by a reviewer: the model cannot write a row because the object Spark holds has no method
 * that writes one, and it cannot see a credential because the only read is `project`, whose
 * `secret` fields are already labels (`30 §9` rule 3).
 *
 * `project` TAKES TWO ARGUMENTS WITH THE BUDGET INSIDE THE FIRST. `46 §4.6` as drafted called a
 * three-argument form and `45 D1` exports a two-argument one; `AUDIT-interface-B` IB-4 settled it
 * on the record's shape, and this is that shape.
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
export type ProjectionRegister = { id: string; rows: number; open: number; fields: ProjectionField[] };
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

export type Status = {
  tier: Tier;
  model: string;
  asks: { used: number; cap: number; resets: string };
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

export type SparkDeps = {
  /** Spark's OWN SQLite: the `settings` and `call` tables of `46 §4.1`, never the record's database. */
  sql: Sql;
  clock: Clock;
  inference: Inference;
  record: RecordApi;
};

export interface Spark {
  read(question: string, ctx: CallContext): Promise<Result<Reading>>;
  propose(question: string, ctx: CallContext, byok?: Inference, askId?: string): Promise<Result<Proposal>>;
  proposePattern(samples: readonly RawPayload[], ctx: CallContext): Promise<Result<Proposal>>;
  configure(patch: Partial<Pick<Settings, 'tier' | 'model' | 'grant_id' | 'ask_cap'>>, ctx: CallContext): Result<Settings>;
  status(): Status;
}
