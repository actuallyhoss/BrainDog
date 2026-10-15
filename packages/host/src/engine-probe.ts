/**
 * The engine's probe, the host's half (ENG-A08 job 3): one press asks each model of the answer route whether it answers now.
 *
 * WHY IT EXISTS. The engine's health is read from the ledger (`engine-health.ts`), and while no model answers the record's
 * jobs wait and the model is tried every half hour (`model-jobs.ts`, `MODEL_TEST_EVERY_MS`). Nobody could ask "does it
 * answer now?", so after he mended a key he waited half an hour to know. This asks at once and says, in one sentence,
 * "Answered by <model> in 1.2 s", or in plain words why not.
 *
 * THROUGH THE ROUTER THE REAL ASK USES (`infer.ts`): `routeFor` names the candidates and `infer` asks each, one ledger row an
 * attempt under purpose `probe`, which spends nobody's month. Each candidate is walked as a route of its own, so a second
 * model is asked even when the first answered, and the pause is not read: the probe is the one call made to learn whether a
 * paused model is back, and a row it serves is what ends the pause and the jobs' wait, since both are read from the ledger.
 *
 * A FIXED PROMPT THAT HOLDS NOTHING OF THE RECORD, so no row, name or figure is ever sent by it. `strict` says whether the
 * reply was the JSON the schema asked for: a model that answers in another shape answers no real ask either.
 *
 * WHAT A PERSON READS IS THE HOUSE'S SENTENCE. `why` is written here from how the attempt ended, never the provider's own
 * words (those stay on the ledger's row, as every row keeps them), and a model name that looks like a key is not repeated.
 *
 * STRUCTURAL, AS `engine-health.ts` IS: the ledger is `@braindog/slash`'s, which this package may not import, so the host hands
 * it in, loaded only on a press; and the wire for each candidate is the host's, handed in as `complete`.
 */

import { looksLikeCredential } from '@braindog/kernel';
import { no, ok, type Clock, type Completion, type CompleteRequest, type Result } from '@braindog/ports';

import { infer, mayThink, routeFor, type Candidate, type InferLedger, type Reads, type RouteFacts, type Try } from './infer.ts';
import type { SlashInference } from './slash.ts';

/** One model of the answer route, as the probe found it. `ms` is how long its turn took; `why` is said when it did not serve, or served loose. */
export type EngineProbeCandidate = { model: string; served: boolean; strict: boolean; ms: number; why?: string };

/** What one press answers: every candidate in the order a real ask tries them, and the one sentence about all of them. */
export type EngineProbe = { candidates: EngineProbeCandidate[]; said: string };

export type EngineProbeDeps = {
  /** What this host may ask for this record, read on each press (his own key chosen is a route of one), or `undefined` with no model. */
  facts: () => RouteFacts | undefined;
  clock: Clock;
  /** Slash's own ledger, the one every ask settles in, loaded only when there is a model to ask. */
  ledger: () => InferLedger | Promise<InferLedger>;
  /** The host's wire for one candidate: the included model, the operator's provider, his key or a self-host's endpoint. */
  complete: (candidate: Candidate, req: CompleteRequest) => Promise<Result<Completion>>;
  /** His switch for Slash reading on its own (`mayThink`). Absent is on. */
  reads?: Reads | undefined;
};

/** The probe's prompt, the same on every host and every press. */
export const PROBE_SYSTEM = 'You are being checked to see whether you answer. Reply with the JSON the schema asks for and nothing else.';
export const PROBE_USER = 'Are you there? Answer with ready set to true.';
export const PROBE_SCHEMA = {
  type: 'object',
  properties: { ready: { type: 'boolean' } },
  required: ['ready'],
  additionalProperties: false,
} as const;

/** The whole request for one candidate: nothing in it comes from the record. */
export const probeRequest = (model: string): CompleteRequest => ({
  model,
  messages: [
    { role: 'system', content: PROBE_SYSTEM },
    { role: 'user', content: PROBE_USER },
  ],
  maxTokens: 16,
  schema: { ...PROBE_SCHEMA },
  budget: { neurons: 1000 },
});

/** Said with no call made. */
export const NO_MODEL = 'No model is set up.';

/** Whether a reply is exactly `{ "ready": true }`, as a strict schema would hold it. */
export const strictOf = (text: string): boolean => {
  try {
    const value: unknown = JSON.parse(text.trim());
    return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length === 1 && (value as { ready?: unknown }).ready === true;
  } catch {
    return false;
  }
};

/* ── How a turn ended, in the house's words ───────────────────────────────────────────────────── */

const LOOSE = 'It answered, but not in the shape BrainDog asks for, so its answers would be set aside.';

const WHY: Record<Try['ended'], string> = {
  answered: LOOSE,
  schema: LOOSE,
  late: 'It began to answer and broke off before the end.',
  not_served: 'Its provider does not serve this model now.',
  no_answer: 'It did not answer.',
  budget: "This month's allowance for the model is spent, so it was not asked.",
  refused: 'Its provider turned the question away.',
};

const KEY_CLOSED = 'Your own key would not open, so it was not asked.';
const NOT_ASKED = 'It was not asked.';

/** The host's own error for a key that would not open (`SlashKeyClosedError`, `slash.ts`), read by its name, as `infer.ts` reads it. */
const keyClosed = (thrown: unknown): boolean => thrown instanceof Error && thrown.name === 'SlashKeyClosedError';

/** A model's name as a person may read it: never anything that looks like a key, whoever's adapter named it. */
const named = (model: string): string => (model === '' || looksLikeCredential(model) ? 'the model' : model);

/** Seconds to one place, as "1.2 s". */
const seconds = (ms: number): string => `${(Math.max(0, ms) / 1000).toFixed(1)} s`;

/** The route as one candidate's own, in the form it came from, so the ledger's row keeps the route's name. */
const alone = (facts: RouteFacts, c: Candidate): RouteFacts => ({
  form: facts.form,
  models: facts.form === 'key' ? { key: c } : facts.form === 'selfhost' ? { endpoint: c } : { flash: c },
  large: false,
  machine: false,
});

/** The ledger with the pause unread: the probe asks a paused model, since learning whether it is back is the point. */
const unpaused = (ledger: InferLedger): InferLedger => ({
  reserve: (kind, tier, model, charge) => ledger.reserve(kind, tier, model, charge),
  account: (row) => ledger.account(row),
  release: (id) => ledger.release(id),
  last: () => [],
});

/**
 * The one sentence over every candidate. "Answered by" is said only of a reply that came whole: one that broke off was
 * served on the ledger, but no ask could use it, so it is a model that did not answer here.
 */
const saidOf = (candidates: readonly EngineProbeCandidate[]): string => {
  const whole = candidates.find((c) => c.served && c.strict);
  if (whole !== undefined) return `Answered by ${whole.model} in ${seconds(whole.ms)}.`;
  const loose = candidates.find((c) => c.served && c.why === LOOSE);
  if (loose !== undefined) return `Answered by ${loose.model} in ${seconds(loose.ms)}, but not in the shape BrainDog asks for, so its answers would be set aside.`;
  const why = candidates[0]?.why ?? NOT_ASKED;
  return why === WHY.no_answer ? 'No model answered.' : `No model answered. ${why}`;
};

/* ── The probe ────────────────────────────────────────────────────────────────────────────────── */

/** The probe, built once per host and run on each press. Nothing is cached: each press asks again. */
export function engineProbeOf(deps: EngineProbeDeps): () => Promise<EngineProbe> {
  return async () => {
    const facts = deps.facts();
    const route = facts === undefined ? [] : routeFor('probe', facts).candidates;
    if (facts === undefined || route.length === 0) return { candidates: [], said: NO_MODEL };
    /* THE CONSENT RULE, ASKED AS A BACKGROUND ASK ASKS IT. `probe` spends nobody's month, so `mayThink('probe')` alone would
       wave it through; the probe is held to his switch all the same, so with Slash reading switched off nothing is sent. */
    const may = await mayThink('understand', deps.reads);
    if (!may.ok) return { candidates: [], said: 'refusal' in may ? may.refusal.fix : NOT_ASKED };
    const ledger = unpaused(await deps.ledger());
    const candidates: EngineProbeCandidate[] = [];
    for (const c of route) {
      let text: string | null = null;
      const began = deps.clock.now();
      try {
        const out = await infer(
          'probe',
          {
            hold: 'read',
            kind: 'read',
            run: async (asked) => {
              const reply = await deps.complete(asked, probeRequest(asked.model));
              if (reply.ok) text = reply.value.text;
              return reply;
            },
          },
          { facts: alone(facts, c), clock: deps.clock, ledger },
        );
        const ms = deps.clock.now() - began;
        const ended = out.tries.at(-1)?.ended;
        if (out.out.ok) {
          const strict = strictOf(text ?? '');
          candidates.push({ model: named(out.model ?? c.model), served: true, strict, ms, ...(strict ? {} : { why: LOOSE }) });
        } else {
          const served = ended === 'schema' || ended === 'late';
          candidates.push({ model: named(c.model), served, strict: false, ms, why: ended === undefined ? NOT_ASKED : WHY[ended] });
        }
      } catch (thrown) {
        if (!keyClosed(thrown)) throw thrown;
        candidates.push({ model: named(c.model), served: false, strict: false, ms: deps.clock.now() - began, why: KEY_CLOSED });
      }
    }
    return { candidates, said: saidOf(candidates) };
  };
}

/* ── The wire, from the adapters a host already holds ─────────────────────────────────────────── */

/**
 * `complete` over the host's own `SlashInference` adapters, one a candidate, so an app hands the probe the wires its asks
 * already use and writes no mapping of its own. A candidate the host has no wire for is answered as no answer, with no
 * call; an adapter that throws is thrown on, which `infer` reads as a model that did not answer (or `answered`, late).
 */
export const probeWireOf =
  (wireFor: (candidate: Candidate) => SlashInference | undefined): EngineProbeDeps['complete'] =>
  async (candidate, req) => {
    const wire = wireFor(candidate);
    if (wire === undefined) return no<Completion>('UNREACHABLE', 'This host has no wire for the model.', { at: 'model' });
    const reply = await wire.complete({ model: req.model, messages: req.messages, maxTokens: req.maxTokens, jsonSchema: req.schema });
    return ok<Completion>({ text: reply.text, model: reply.model ?? req.model, usage: { in: reply.usage.in, out: reply.usage.out, neurons: null } });
  };
