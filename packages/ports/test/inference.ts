/**
 * A canned `Inference`, for the port's own tests.
 *
 * NOT A `.test.ts` AND SO NOT A TEST. The runner's glob is `test/*.test.ts` and this file is
 * imported by one of them, exactly as `packages/connect/test/grants.ts` is by two of its own.
 *
 * WHERE THIS LIVES AND WHY. `37 §10` D9: *"no memory fakes for the eight other ports, an object
 * literal satisfies each interface; the first spec that needs a fake ships it in its own `test/`"*.
 * This is the first thing in the tree that needs one, so it ships here rather than in `src/`, where
 * it would be a fake every consumer could import and therefore a second implementation of the port
 * with nobody's name on it. `46 §9`'s canned `Inference`, the one that returns golden job outputs,
 * is a DIFFERENT object and belongs under `packages/spark/test/` when that package exists: it
 * knows about jobs, and this one knows only about the three refusals.
 *
 * IT REFUSES LIKE AN ADAPTER RATHER THAN LIKE A STUB. A double that always answers `ok` tests the
 * happy path of the caller and nothing about the port, and the three failure shapes are the whole
 * reason the port is a `Result`. The first cut of this file threw on an unknown model, priced an
 * unpriced call at zero and checked the ceiling after serving the call, which is what a real
 * adapter does when nobody has thought about it, and the tests caught all three.
 */

import { ok, type Result } from '../src/index.ts';
import {
  budgetSpent,
  modelMissing,
  schemaFailed,
  type CompleteRequest,
  type Completion,
  type Embeddings,
  type Inference,
} from '../src/inference.ts';

/** What a test hands in: the reply per model, and one embedding shape. Everything else is derived. */
export type Canned = {
  models: Record<string, { text: string; in: number; out: number; neurons: number | null }>;
  embed: { model: string; dims: number; in: number; neurons: number | null };
};

/**
 * The keys a request may carry, as data.
 *
 * THE TYPE BAN DOES NOT REACH A CAST, and a cast is how both of the banned keys would actually
 * arrive: a host passing through a body it parsed. `tools` is banned by `46 #9` and a credential by
 * `46 §2` #3, and one guard over the key set catches both plus the next one nobody has thought of.
 */
const FIELDS = ['model', 'messages', 'maxTokens', 'schema', 'budget'];

export const cannedInference = (canned: Partial<Canned>): Inference & { served: string[] } => {
  /** Every model this adapter actually called, in order. The budget test asserts it is empty. */
  const served: string[] = [];
  const models = canned.models ?? {};
  const emb = canned.embed ?? { model: '@cf/baai/bge-m3', dims: 4, in: 0, neurons: 0 };

  return {
    served,

    async complete(req: CompleteRequest): Promise<Result<Completion>> {
      /* A KEY THE PORT DOES NOT DEFINE IS A THROW AND NOT A REFUSAL, and the distinction is
         `30 §6`'s own: a refusal names a field and what was expected, and there is nothing here a
         person can fix. It is the judgement `INTERNAL` gets, taken one layer lower. */
      for (const key of Object.keys(req))
        if (!FIELDS.includes(key)) throw new Error(`an Inference request may not carry \`${key}\``);

      const reply = models[req.model];
      if (reply === undefined) return modelMissing<Completion>(req.model, 'the provider does not serve it');

      /* THE CEILING IS CHECKED BEFORE THE CALL, which is the only moment at which checking it saves
         anything. A call priced after it was served is a receipt. An UNPRICED model cannot be
         refused this way and is served: refusing what cannot be measured would make every self-host
         model unusable, and the unknown lands on the meter as `null` a line further down. */
      if (reply.neurons !== null && reply.neurons > req.budget.neurons)
        return budgetSpent<Completion>(reply.neurons, req.budget.neurons);

      served.push(req.model);
      const usage = { in: reply.in, out: reply.out, neurons: reply.neurons };

      /* THE SCHEMA CHECK IS THE PARSE, here and in a real adapter. The provider is handed
         `response_format` and still answers prose often enough that `46 §5.3` step 4 checks the
         parsed value by hand afterwards; this is the half the adapter owns, which is whether what
         came back is JSON of the pinned shape at all. */
      let parsed: unknown;
      try {
        parsed = JSON.parse(reply.text);
      } catch {
        return schemaFailed<Completion>(req.model, 'it is not JSON');
      }
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        return schemaFailed<Completion>(req.model, 'the top level is not an object');
      const required = req.schema['required'];
      if (Array.isArray(required))
        for (const key of required)
          if (!(String(key) in parsed)) return schemaFailed<Completion>(req.model, `\`${String(key)}\` is missing`);

      return ok({ text: reply.text, model: req.model, usage });
    },

    async embed(texts: readonly string[]): Promise<Result<Embeddings>> {
      /* ONE USAGE FOR THE BATCH, not one per text: `46 §5.3` bills `tokens_in` as the sum over the
         chunk, and `out` is zero because an embedding returns no tokens. */
      const vectors = texts.map(() => new Int8Array(emb.dims));
      return ok({
        model: emb.model,
        dims: emb.dims,
        vectors,
        usage: { in: emb.in, out: 0, neurons: emb.neurons },
      });
    },
  };
};
