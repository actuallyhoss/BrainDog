/**
 * Questions that share one cause, drawn as one. The record marks them (`cause`, and `alike` for how many are open); this
 * reads a drawn queue and folds the ones that share a cause into a single entry, so a person answers "Add this message
 * to Ledger?" once and not four times.
 *
 * A CAUSE HOLDS ONE OPEN QUESTION (migration 31), so `alike` over one is rare: an arrival's cause hashes its payee too
 * (`rowsetCause` in the kernel's `ingest.ts`), and four bank texts to four payees were four causes, each `alike: 1`,
 * drawn as four cards. So questions an ingest filed are also one family when they ask the same words for the same
 * reason, and a cause's overflow (`cause#2`, `freeCause`) is the cause it overflowed.
 *
 * PURE, AND NODE LOADS IT. An arrangement and a merge are never folded: each is read on its own, as a batch leaves them.
 */

import type { QueueOption, QueueQuestion } from '@braindog/kernel';
import { money } from 'braindog-render';

import { arranges } from './batch.ts';

/** One entry of a drawn queue: a question alone, or a family led by its first member. */
export type QueueEntry = { kind: 'one'; q: QueueQuestion } | { kind: 'many'; lead: QueueQuestion; rest: QueueQuestion[] };

/** The family a question belongs to, or `null` when it is read on its own. */
const familyOf = (q: QueueQuestion): string | null => {
  if (arranges(q) || q.candidates) return null;
  /* SAME WORDS, SAME REASON, SAME INGEST: "Add this message to Ledger? Its last digits match HSBC (EGP)." four times. */
  if (typeof q.who === 'string' && q.who.startsWith('ingest:') && q.question.trim() !== '' && (q.body_kind ?? 'rowset') === 'rowset')
    return `said\u0000${q.who}\u0000${q.question.trim()}\u0000${(q.why ?? '').trim()}`;
  if (typeof q.cause !== 'string' || q.cause === '') return null;
  return `cause\u0000${q.cause.replace(/#\d+$/u, '')}`;
};

/** The queue in its order, with the questions of one family folded into the place of the first of them. */
export function alikeOf(queue: readonly QueueQuestion[]): QueueEntry[] {
  const families = new Map<string, QueueQuestion[]>();
  for (const q of queue) {
    const key = familyOf(q);
    if (key !== null) families.set(key, [...(families.get(key) ?? []), q]);
  }
  const out: QueueEntry[] = [];
  const placed = new Set<string>();
  for (const q of queue) {
    const key = familyOf(q);
    const family = key === null ? undefined : families.get(key);
    if (!family || family.length < 2) {
      out.push({ kind: 'one', q });
      continue;
    }
    if (placed.has(key!)) continue;
    placed.add(key!);
    out.push({ kind: 'many', lead: family[0]!, rest: family.slice(1) });
  }
  return out;
}

/** The options every member offers, with the lead's words, so one press means the same thing on each. */
export function sharedOptions(lead: QueueQuestion, rest: readonly QueueQuestion[]): QueueOption[] {
  return lead.options.filter((o) => rest.every((q) => q.options.some((p) => p.key === o.key)));
}

/**
 * Each member as one line under the card. Members asked in the same words are told apart by what they write: the money
 * of each, as the record keeps it, so four bank texts read "EGP 34,620.00", "EGP 1,501.50" and not one sentence four
 * times. A member with no money, or a family in different words, is its own question.
 */
export function memberLines(all: readonly QueueQuestion[]): { id: string; line: string }[] {
  const same = all.length > 1 && all.every((q) => q.question.trim() === all[0]!.question.trim());
  return all.map((q) => {
    const said = same ? (q.money ?? []).map((m) => money(m.amount, m.currency)).join(', ') : '';
    return { id: q.id, line: said === '' ? q.question : said };
  });
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
