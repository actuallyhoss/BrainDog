/**
 * The `Inference` port: the one seam a model call crosses, and the only one.
 *
 * NOT EXPORTED FROM THE BARREL BY THIS FILE. `src/index.ts` is being written by somebody else as
 * this lands, so the `export * from './inference.ts';` line is the caller's to add, in the same
 * commit that takes this file. Two agents editing one barrel is how a declaration gets merged twice
 * without a word, which this package has already paid for once (see `Scheduler` in `index.ts`).
 *
 * A PLAIN `export *`, NEVER `export type *`, and this paragraph said the wrong one until it was
 * tried. `export type *` is what the two neighbours want and it is why the wrong form reads
 * natural here: `auth.ts` is types only, and the barrel already takes `http.ts` as a type-only line
 * plus a separate `export { HTTP_FAULTS, httpFault }` for its two values. This file ships five
 * values of its own — `INFERENCE_CODES`, `modelMissing`, `schemaFailed`, `budgetSpent` and
 * `isInferenceRefusal` — and `export type *` erases every one of them. Measured
 * against a copy of this package's `src/` with that exact line appended: `tsc` answers TS1362,
 * *"'modelMissing' cannot be used as a value because it was exported using 'export type'"*, three
 * times, and Node answers `SyntaxError: The requested module './index.ts' does not provide an
 * export named 'INFERENCE_CODES'`. Neither failure lands on whoever adds the line. Both land on
 * the first consumer in `spark`, reading a barrel that appears to export the port and does not.
 *
 * WHY IT EXISTS NOW RATHER THAN WITH `spark`. Measured against the live Cloudflare account on
 * 2026-09-20: the token carries `ai (write)`, `/accounts/{id}/ai/models/search` answers 200, and
 * the account's usage is zero neurons, so nothing has ever run. `apps/worker/wrangler.jsonc` holds
 * `"ai": { "binding": "AI" }` in both environment blocks, because Cloudflare fails a deploy on a
 * binding whose resource nothing reads yet and that file uncomments a block in the commit that
 * first reads it. Whether the two are live is the Worker's business and not this port's.
 *
 * THAT SENTENCE CITED TWO LINE NUMBERS AND BOTH WENT STALE INSIDE A DAY. It read
 * `wrangler.jsonc:330` and `:415`, which was exactly right against the commit it was written on:
 * both sat inside the `DRAFTED AND NOT ACTIVE` comment there. By the time the change was checked
 * the Worker had uncommented them and they were live at 340 and 437, so a comment that had been
 * measured was wrong in three ways at once. A line number into a file this package does not own is
 * a fact with somebody else's commit rate attached to it, and naming the file is worth as much.
 *
 * The account id is in the deploy configuration and not in this file: a 32-character identifier
 * pasted into source is a thing `secret-grep` has to learn to forgive, and forgiving one is how it
 * learns to forgive the next.
 *
 * NO CALL PASSES `tools`, AND THE BAN IS THE TYPE RATHER THAN A RULE. `37 §10` sketched
 * `complete(req: { …; tools?: ToolDef[]; … })` returning `{ text; toolCalls?; usage }`, and the
 * iteration-1 audits settle against it: *"No Spark inference passes `tools`. Every call is
 * schema-constrained structured output; retrieval is `project()`"* (`46 #9`, amending `11 §6`'s
 * "tool-call headroom"). So `tools` and `toolCalls` are gone from the port, and `schema` is
 * REQUIRED where the sketch had it optional. A field that exists and must never be set is a field
 * somebody sets, and the review that catches it happens after the model has already been handed a
 * way to act.
 *
 * THE PORT NEVER HOLDS A CREDENTIAL, structurally: there is no base URL, no header map, no key and
 * no account on any request here. `46 §2` #3 is that the package *"receives an object with a
 * `complete()` method and nothing else"*, and tier B is the same shape built per ask by the host
 * after it opens the grant in the Worker (`ADR-062`). The credential is closed over by whoever
 * builds the adapter. A request field that could carry one would move that decision back into the
 * package that is not allowed to make it.
 *
 * EVERY ANSWER IS A `Result`, including the three failures below. `index.ts` states the posture
 * once and it applies hardest here: an adapter is a network call behind a method, so its failures
 * are the common case rather than the exception, and an exception carries neither a code nor a
 * sentence across the RPC boundary that every one of these calls crosses.
 */

import { no, type Refusal, type Result } from './index.ts';

/**
 * One line of a prompt.
 *
 * THERE IS NO `assistant` ROLE AND THAT IS THE DESIGN. `23 §3` is that nothing accumulates: there is
 * no conversation table in `46 §4.1`, the palette is two calls rather than a thread, and every job
 * in `46 §5.3` sends exactly one system line and one user line. A role for the model's own previous
 * turn would be a place to put a history that the product has decided not to keep.
 *
 * `ponytail: two roles, one turn` — add `assistant` the day a spec asks for a second turn whose
 * first turn has to be replayed, and add the table that holds it in the same change.
 */
export type Msg = { role: 'system' | 'user'; content: string };

/**
 * The JSON Schema a call is constrained by. Opaque here on purpose.
 *
 * The provider validates it and the package checks the parsed value by hand afterwards
 * (`46 §5.3` step 4), so a type here that tried to describe JSON Schema would be a third opinion
 * about a document neither of them reads from this package.
 */
export type JsonSchema = Record<string, unknown>;

/**
 * What one call is allowed to spend.
 *
 * IN NEURONS, WHICH IS WHAT THE BILL IS IN. `08 §6` prices Workers AI at $0.011 per 1,000 neurons
 * and `46 §4.1` converts tokens to neurons through a per-model rate; the ceiling is stated in the
 * unit the money is in so that comparing it to what was spent is subtraction rather than a
 * conversion somebody can get wrong in one direction.
 */
export type Budget = { neurons: number };

/**
 * What a call spent.
 *
 * `neurons` IS NULLABLE AND ZERO IS NOT THE SAME ANSWER. The owner is spending credits from today,
 * and an adapter that cannot report what it spent is a meter he cannot read. Two cases look alike
 * and are not: a tier B call on the customer's own key spends none of the owner's neurons and is
 * honestly `0` (`46 §4.1`: *"0 on b and byo, not our money"*), while a provider that returned no
 * price for the call is UNKNOWN. Summing unknown as zero produces a monthly total that is
 * confidently wrong in the direction nobody checks, because it reads as good news.
 *
 * `in` and `out` are tokens, and they are kept beside `neurons` rather than replaced by it because
 * `46 §4.1` derives the neuron figure from them through `MODELS[model]` whenever the provider
 * declines to. The adapter reports what it was told; the package does the arithmetic it can.
 */
export type Usage = { in: number; out: number; neurons: number | null };

/** One structured-output call. No credential, no tools, no base URL: see the header. */
export type CompleteRequest = {
  /** A provider id, or a short name the host's adapter maps to one (`46 §4.3`). The port names no provider. */
  model: string;
  messages: readonly Msg[];
  /** The ceiling on the answer, in tokens. The ceiling on the money is `budget`. */
  maxTokens: number;
  schema: JsonSchema;
  budget: Budget;
};

/** What a call that was served returns. `model` is what actually answered, which a router may change. */
export type Completion = { text: string; model: string; usage: Usage };

/**
 * A batch of embeddings.
 *
 * `vectors` ARE `Int8Array` BECAUSE THE QUANTISATION IS THE ADAPTER'S, not the caller's:
 * `51 §5.11` step 4 quantises `clamp(round(x × 127), −127, 127)` in the Worker, and a caller handed
 * floats would be a caller that could quantise differently and write vectors that no longer compare.
 */
export type Embeddings = { model: string; dims: number; vectors: Int8Array[]; usage: Usage };

/**
 * `infer.prose`'s result, and `null` is a real answer rather than a failure.
 *
 * `46 §5.3` on the digest: prose that cites a figure it cannot support is dropped and the digest
 * ships as figures only, never retried. So the job SUCCEEDED and there is no prose, which is a
 * different thing from the three refusals below and has to stay tellable apart from them.
 */
export type Prose = { prose: string | null; model: string; usage: Usage };

/**
 * What an `infer.draft` proposal carries.
 *
 * TWO KINDS, NOT THE KERNEL'S SEVEN. `46 §5.3` files exactly two through this job: `proposePattern`
 * writes `pattern` and `analyseDraft` writes `change`. The kernel's `BodyKind` has seven, and this
 * package may not import it anyway, because `ports` is the bottom of the graph and the kernel sits
 * above it. Widen this union the day a third job files a third kind, and cite the job.
 */
export type DraftKind = 'pattern' | 'change';

/** `infer.draft`'s result. `null` where the model produced nothing citable, exactly as `Prose` does. */
export type Draft = {
  body: { question: string; body_kind: DraftKind; body: unknown } | null;
  model: string;
  usage: Usage;
};

/**
 * Spark's model calls, and the whole of what a package may do to a model.
 *
 * `33 §1` port 3, `46 §2` #1: the ports are `{ Sql, Clock, Inference }` and there is no `Http`, so
 * this interface is the only way out of `packages/spark/**`. The record has no `Inference` port at
 * all (`ADR-002`).
 */
export interface Inference {
  complete(req: CompleteRequest): Promise<Result<Completion>>;
  embed(texts: readonly string[]): Promise<Result<Embeddings>>;
}

/* ── The three refusals ──────────────────────────────────────────────────────────────────────── */

/**
 * The three codes this port may answer with, and nothing else.
 *
 * ONE OF THEM IS BORROWED AND THE BORROWING IS THE FINDING. `30 §6`'s registry of a hundred and
 * twenty-five has no code for a model that is unavailable, and minting `MODEL_UNAVAILABLE` here
 * would need three edits this file may not make: the `REFUSAL_CODES` array in `index.ts`, the table
 * and the counting sentence in `30 §6`, and the family sizes `refusals.mjs` compares them against.
 * That gate's budget for codes outside the registry is an exact four, red above AND below, so an
 * invented code is red the moment it is written rather than at review.
 *
 * `NOT_IN_THIS_BUILD` is the nearest TRUE statement rather than the nearest-sounding one. Its row
 * covers *"an outbox kind this deployment wired no sender for"* and says *"the repair is a deploy,
 * not an edit"*, which is exactly the self-host's position: `49 §10` is *"No Inference adapter"*, so
 * on that host every `infer.*` row is a job this deployment wired no model for. It answers 501,
 * which is the right status for it.
 *
 * WHERE IT IS A STRETCH, and it is worth saying rather than hiding: a Workers AI outage is not
 * repaired by a deploy, and this code sends its reader to the wrong remedy for that one case.
 * `30 §6` has met the shape twice and answered the same way both times, one code for a whole
 * vocabulary of ways a remote call fails, named for the direction it fails in: `PULL_ORIGIN_REFUSED`
 * outbound and `UNREACHABLE` inbound. A third, for the model, is an amendment worth making, and
 * `Missing` below is the vocabulary it would take.
 *
 * The other two are exact. `PROPOSAL_SCHEMA` is `30 §6`'s *"structured output that fails its kind's
 * schema"*, and `SPARK_BUDGET_SPENT` is the meter of `11 §4`, read here per call rather than per
 * month.
 */
export const INFERENCE_CODES = ['NOT_IN_THIS_BUILD', 'PROPOSAL_SCHEMA', 'SPARK_BUDGET_SPENT'] as const;

export type InferenceCode = (typeof INFERENCE_CODES)[number];

/**
 * One refusal, with the code narrowed to the three.
 *
 * THE LITERAL IS WRITTEN AT EACH CALL SITE ON PURPOSE, and a constant would have been tidier and
 * wrong. `refusals.mjs` finds emitters with a pattern anchored to a quote immediately after one of
 * four helper names, and its own comment names this hazard: *"A SIXTH WAY WOULD STILL BE
 * INVISIBLE"*. A code raised through a named constant is that sixth way, and the gate's other half
 * would then report the code as *written in source and constructed by nothing*, which is the exact
 * finding it exists to deliver and would be wrong. `refuse` is one of the four names it knows.
 *
 * The type is what stops the drift a constant was going to prevent: a fourth code does not compile.
 */
const refuse = <T>(code: InferenceCode, fix: string, at: string): Result<T> => no<T>(code, fix, { at });

/**
 * The ways a model can fail to be there, as a closed list.
 *
 * IT IS A VOCABULARY AND NOT THREE CODES, for the reason `30 §6` gives when it maps the `Http`
 * port's four error names onto the single code `PULL_ORIGIN_REFUSED`: a caller branches on the code
 * and READS the sentence, so three codes here would be three branches that all do the same thing
 * and one of them would rot.
 */
export type Missing = 'no adapter on this host' | 'the provider did not answer' | 'the provider does not serve it';

/**
 * No model answered for this call.
 *
 * `why` rides the sentence rather than a field because `Refusal` has no room for one: its shape is
 * `code`, `fix`, `at`, `allowed` and `retry_after`, and widening it for this would widen it for
 * every refusal in the tree.
 */
export const modelMissing = <T>(model: string, why: Missing): Result<T> =>
  refuse<T>(
    'NOT_IN_THIS_BUILD',
    `No model answered for '${model}': ${why}. The repair is a deploy of a host that serves it, not an edit.`,
    'model',
  );

/**
 * The answer is not the JSON the call pinned.
 *
 * THE SENTENCE SAYS NOBODY IS RETRYING, and that is the part a reader needs. `46 §5.3` on the
 * digest: a retry bills twice for one payload, so the job ends here. A fix line reading "try again"
 * would invite the second bill from whoever is holding the failure.
 */
export const schemaFailed = <T>(model: string, why: string): Result<T> =>
  refuse<T>(
    'PROPOSAL_SCHEMA',
    `The answer from '${model}' is not the JSON this call pinned: ${why}. It is not filed and not retried, because a second call bills twice for one payload.`,
    'schema',
  );

/**
 * This call would cost more than it may spend.
 *
 * BOTH FIGURES ARE IN THE SENTENCE. A ceiling refusal with one number in it cannot be acted on: the
 * reader has to see how far over the call was to choose between raising the ceiling and sending
 * fewer rows, and the two repairs are not interchangeable.
 */
export const budgetSpent = <T>(neurons: number, cap: number): Result<T> =>
  refuse<T>(
    'SPARK_BUDGET_SPENT',
    `This call would spend about ${neurons} neurons and its ceiling is ${cap}. Raise the ceiling for this job, or send fewer rows.`,
    'budget',
  );

/**
 * Whether a refusal is one of this port's three. For a host mapping a code onto a status.
 *
 * IT IS NOT A NARROWING PREDICATE, because two of the three codes are raised elsewhere for other
 * subjects: `NOT_IN_THIS_BUILD` by a host with no key store and by the kernel over an aggregation
 * it does not compute, and `SPARK_BUDGET_SPENT` by the month's meter in `46 §5.4`. This answers
 * whether the code is one a model call can produce, which is all a status map needs.
 */
export const isInferenceRefusal = (r: Refusal): boolean =>
  (INFERENCE_CODES as readonly string[]).includes(r.code);
