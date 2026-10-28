/**
 * The one number the agent side is judged by, as a person reads it: of the questions each agent filed that you
 * answered, the share you accepted unchanged, by agent and by kind of change (`kept` on each agent of `trust`).
 *
 * PURE, SO `node --test` CAN IMPORT IT. The record counts (`keptShares` in `packages/record/src/ladder.ts`); this only
 * says the counts: "82%" and "41 of 50 accepted unchanged". A share over fewer than `FEW` answers is said as the
 * counts alone and never as a percentage, since three of four is not 75% of anything yet.
 */

import type { TrustStanding } from '@braindog/client';

type Agent = TrustStanding['agents'][number];

/** Under this many answers a share is said as its counts, not as a percentage. */
export const FEW = 5;

export const keptWords = {
  heading: 'Accepted unchanged',
  empty: 'No agent has had a suggestion answered in the last 90 days.',
  byKind: 'By kind of change',
} as const;

/** One kind of change, or the agent as a whole, as one line reads it. */
export type KeptLine = { label: string; pct: string | null; counts: string; share: number | null; answered: number };
/** One agent: its name, its number, and each kind under it. */
export type KeptRow = KeptLine & { agent: string; days: number; kinds: KeptLine[] };

/** `82%`, or `null` over too few answers to be a share. */
export const pctOf = (accepted: number, answered: number): string | null =>
  answered < FEW ? null : `${Math.round((accepted / answered) * 100)}%`;

const countsOf = (accepted: number, answered: number): string => `${accepted} of ${answered} accepted unchanged`;

const lineOf = (label: string, k: { accepted: number; answered: number; share: number | null }): KeptLine => ({
  label,
  pct: pctOf(k.accepted, k.answered),
  counts: countsOf(k.accepted, k.answered),
  share: k.share,
  answered: k.answered,
});

/** Every agent with an answered suggestion, most answered first, each with its kinds as the record ordered them. */
export function keptRows(standing: TrustStanding | null): KeptRow[] {
  if (standing === null) return [];
  return standing.agents
    .filter((a): a is Agent & { kept: NonNullable<Agent['kept']> } => a.kept !== undefined && a.kept.answered > 0)
    .map((a) => ({ ...lineOf(a.agent, a.kept), agent: a.agent, days: a.kept.days, kinds: a.kept.kinds.filter((k) => k.answered > 0).map((k) => lineOf(k.kind, k)) }))
    .sort((x, y) => y.answered - x.answered);
}

/** One agent's number as a sentence, for a line under its name: "82% accepted unchanged, 41 of 50 in 90 days". */
export function keptSentence(kept: NonNullable<Agent['kept']>): string | null {
  if (kept.answered === 0) return null;
  const pct = pctOf(kept.accepted, kept.answered);
  const counts = `${kept.accepted} of ${kept.answered} in ${kept.days} days`;
  return pct === null ? `Accepted unchanged: ${counts}` : `${pct} accepted unchanged, ${counts}`;
}
