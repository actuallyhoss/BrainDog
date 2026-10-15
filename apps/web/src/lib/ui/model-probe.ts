/**
 * "Test the model now", under Slash's health line in Settings then Agents (ENG-A08, "health shown" D40.45).
 *
 * The health line says what the engine's own ledger last saw; this asks now. `engineProbe` asks each candidate of the
 * answer route the fixed prompt, the path a real ask takes, and answers one entry a candidate: whether it served,
 * whether its answer kept to the strict form, how long it took, and why when it did not. The record holds it to one
 * every ten minutes, and a held press is refused `RATE_LIMITED` with the seconds to wait.
 *
 * PURE, SO `node --test` CAN IMPORT IT: the words live here and the component only draws them.
 *
 * ONE LINE A CANDIDATE, NAMED BY THE MODEL'S OWN NAME (`modelName`), never the provider's path in front of it. The
 * first reads "Answered by" or "did not answer"; one after a failure reads "Asked ... instead", so the order of the walk
 * is in the words and not only in the order of the lines.
 *
 * A HOST WITHOUT THE CALL says so in one sentence rather than a refusal code: an older host answers `ROUTE_UNKNOWN`, and
 * one whose record has no such method `NOT_IN_THIS_BUILD` at its name.
 */

import { createClient } from '@braindog/client';
import { modelName } from '../../routes/settings/[area]/health.ts';

export type Candidate = { model: string; served: boolean; strict: boolean; ms: number; why?: string };
/** `said` is the record's one sentence over them all; read only when there is no candidate, where it says why (no model,
 *  or Slash's reading switched off). */
export type ProbeAnswer = { candidates: Candidate[]; said?: string };

export type ProbeOut =
  | { kind: 'answer'; answer: ProbeAnswer }
  | { kind: 'refused'; fix: string; retryAfter?: number }
  | { kind: 'absent' }
  | { kind: 'unreached' };

type Refused = { refusal: { code: string; fix: string; at?: string; retry_after?: number } } | { conflict: unknown };
type Answered = { ok: true; value: unknown } | ({ ok: false } & Refused);
/** The one door this needs, so a test hands in a fake and no request leaves. */
export type ProbeDoor = { call: (name: string, args: Record<string, unknown>) => Promise<Answered> };

const NAME = 'engineProbe';

/* AN ANSWER IS ONLY TAKEN WHEN IT IS THE SHAPE: anything else from a host is nothing said, never a wrong sentence. */
const candidateOf = (v: unknown): Candidate | null => {
  if (v === null || typeof v !== 'object') return null;
  const c = v as Record<string, unknown>;
  if (typeof c.model !== 'string' || typeof c.served !== 'boolean') return null;
  const ms = typeof c.ms === 'number' && Number.isFinite(c.ms) && c.ms >= 0 ? c.ms : 0;
  const why = typeof c.why === 'string' && c.why.trim() !== '' ? c.why.trim() : undefined;
  return { model: c.model, served: c.served, strict: c.strict === true, ms, ...(why ? { why } : {}) };
};

export const answerOf = (v: unknown): ProbeAnswer | null => {
  if (v === null || typeof v !== 'object' || !Array.isArray((v as { candidates?: unknown }).candidates)) return null;
  const all = (v as { candidates: unknown[] }).candidates.map(candidateOf);
  if (!all.every((c) => c !== null)) return null;
  const said = (v as { said?: unknown }).said;
  return { candidates: all as Candidate[], ...(typeof said === 'string' && said.trim() !== '' ? { said: said.trim() } : {}) };
};

/** One press: the record's answer, its refusal, or that this host has no such call. Never throws. */
export async function probe(base: string, door: ProbeDoor = createClient({ base }) as unknown as ProbeDoor): Promise<ProbeOut> {
  let out: Answered;
  try {
    out = await door.call(NAME, {});
  } catch {
    return { kind: 'unreached' };
  }
  if (out.ok) {
    const answer = answerOf(out.value);
    return answer ? { kind: 'answer', answer } : { kind: 'absent' };
  }
  if ('conflict' in out) return { kind: 'refused', fix: 'Something changed while this was open. Try again.' };
  const r = out.refusal;
  if (r.code === 'ROUTE_UNKNOWN' || (r.code === 'NOT_IN_THIS_BUILD' && (r.at === undefined || r.at === NAME))) return { kind: 'absent' };
  const wait = typeof r.retry_after === 'number' && r.retry_after > 0 ? r.retry_after : undefined;
  return { kind: 'refused', fix: r.fix, ...(wait !== undefined ? { retryAfter: wait } : {}) };
}

/** Milliseconds as seconds to one decimal: 1234 reads "1.2 s". Under a twentieth of a second still reads "0.1 s". */
export const seconds = (ms: number): string => `${Math.max(0.1, Math.round(ms / 100) / 10).toFixed(1)} s`;

/** The wait before the next press, in whole minutes rounded up: 480 seconds reads "in 8 minutes". */
export const againIn = (s: number): string => {
  const m = Math.max(1, Math.ceil(s / 60));
  return m === 1 ? 'You can test again in a minute.' : `You can test again in ${m} minutes.`;
};

/* THE ENGINE'S REASON AS ONE CLAUSE. The host writes whole sentences ("Its provider turned the question away."), so its
   full stop goes, a plain first word drops its capital after the colon (a name keeps its own), no em dash stays, and
   "It did not answer" is not said twice. */
const clause = (why: string): string =>
  why
    .replace(/\s*[\u2014\u2013]\s*/gu, ', ')
    .replace(/[.\s]+$/u, '')
    .replace(/^(It|Its|This|That|Your|The|A|An|There|Their|No)\b/u, (w) => w.toLowerCase());
const SAID_ALREADY = /^it did not answer$/iu;

/* THE MODEL'S OWN NAME. A host that would not show one says "the model", which takes a capital where a sentence starts. */
const named = (model: string, start = false): string => {
  const n = modelName(model);
  return n === '' || n.toLowerCase() === 'the model' ? (start ? 'The model' : 'the model') : n;
};

const failed = (c: Candidate): string => {
  const why = c.why ? clause(c.why) : '';
  return why === '' || SAID_ALREADY.test(why) ? 'did not answer.' : `did not answer: ${why}.`;
};

/* A WAIT THE RECORD'S FIX ALREADY NAMES ("The next check can go in 8 minutes."), dropped, since the line after says it. */
const NAMES_A_WAIT = /\bin (?:a|an|\d+) (?:second|minute|hour)s?\b/iu;
const heldSaid = (fix: string, wait: number): string[] => {
  const rest = fix
    .split(/(?<=\.)\s+/u)
    .filter((s) => !NAMES_A_WAIT.test(s))
    .join(' ')
    .trim();
  return rest === '' ? [againIn(wait)] : [rest, againIn(wait)];
};
const served = (c: Candidate): string =>
  `in ${seconds(c.ms)}${c.strict ? '' : ', but its answer did not keep to the form it was asked for'}.`;

export const words = {
  button: 'Test the model now',
  busy: 'Testing the model',
  none: 'No model is set up to test.',
  absent: 'This host cannot test its model yet.',
  unreached: 'BrainDog could not be reached. Try again.',
};

/** What a press says, one line a candidate, or the refusal's own fix and, when held, when the next may go. */
export function probeSaid(out: ProbeOut): string[] {
  if (out.kind === 'absent') return [words.absent];
  if (out.kind === 'unreached') return [words.unreached];
  if (out.kind === 'refused') return out.retryAfter === undefined ? [out.fix] : heldSaid(out.fix, out.retryAfter);
  const list = out.answer.candidates;
  /* NOTHING ASKED: the record's own reason (no model, or his switch for Slash reading off), else the plain one. */
  if (list.length === 0) return [out.answer.said ?? words.none];
  return list.map((c, i) => {
    const name = named(c.model);
    const first = named(c.model, true);
    if (i === 0) return c.served ? `Answered by ${name} ${served(c)}` : `${first} ${failed(c)}`;
    /* A LATER CANDIDATE ASKED ANYWAY, after one that served, was not asked "instead" of anything. */
    if (list[i - 1]!.served) return c.served ? `${first} also answered ${served(c)}` : `${first} ${failed(c)}`;
    return c.served ? `Asked ${name} instead, which answered ${served(c)}` : `Asked ${name} instead, which ${failed(c)}`;
  });
}
