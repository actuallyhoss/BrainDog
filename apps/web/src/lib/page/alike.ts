/**
 * Questions that share one cause, drawn as one. The record marks them (`cause`, and `alike` for how many are open); this
 * reads a drawn queue and folds the ones that share a cause into a single entry, so a person answers "Add this message
 * to Ledger?" once and not four times.
 *
 * PURE, AND NODE LOADS IT. An arrangement and a merge are never folded: each is read on its own, as a batch leaves them.
 */

import type { QueueOption, QueueQuestion } from '@braindog/kernel';

import { arranges } from './batch.ts';

/** One entry of a drawn queue: a question alone, or a family led by its first member. */
export type QueueEntry = { kind: 'one'; q: QueueQuestion } | { kind: 'many'; lead: QueueQuestion; rest: QueueQuestion[] };

const foldable = (q: QueueQuestion): boolean => typeof q.cause === 'string' && q.cause !== '' && (q.alike ?? 1) > 1 && !arranges(q) && !q.candidates;

/** The queue in its order, with the questions of one cause folded into the place of the first of them. */
export function alikeOf(queue: readonly QueueQuestion[]): QueueEntry[] {
  const families = new Map<string, QueueQuestion[]>();
  for (const q of queue) if (foldable(q)) families.set(q.cause!, [...(families.get(q.cause!) ?? []), q]);
  const out: QueueEntry[] = [];
  const placed = new Set<string>();
  for (const q of queue) {
    const family = foldable(q) ? families.get(q.cause!) : undefined;
    if (!family || family.length < 2) {
      out.push({ kind: 'one', q });
      continue;
    }
    if (placed.has(q.cause!)) continue;
    placed.add(q.cause!);
    out.push({ kind: 'many', lead: family[0]!, rest: family.slice(1) });
  }
  return out;
}

/** The options every member offers, with the lead's words, so one press means the same thing on each. */
export function sharedOptions(lead: QueueQuestion, rest: readonly QueueQuestion[]): QueueOption[] {
  return lead.options.filter((o) => rest.every((q) => q.options.some((p) => p.key === o.key)));
}

export const alikeWords = {
  /** "and 3 like it", under the one question. */
  more: (n: number) => (n === 1 ? 'and 1 like it' : `and ${n.toLocaleString('en-GB')} like it`),
  /** The line over the members. */
  members: 'The questions this answers',
  /** The sentence over the reason field, when the record wants one. */
  why: 'Why? (one line, for all of them)',
  send: 'Send',
  /** After the press: how many were answered. */
  done: (n: number) => (n === 1 ? 'Answered 1 question.' : `Answered ${n.toLocaleString('en-GB')} questions.`),
  /** How many the record refused, and that they are still waiting. */
  left: (n: number) => (n === 1 ? '1 is still waiting.' : `${n.toLocaleString('en-GB')} are still waiting.`),
} as const;
