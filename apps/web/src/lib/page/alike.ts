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
 * AND ONE RUN'S ROWSETS ARE ONE FAMILY once it filed three or more: a cleanup run filed 24, each with its own
 * cause, and Needs you drew 24 cards. A run's `options` questions stay single, since each asks something of its own.
 *
 * PURE, AND NODE LOADS IT. An arrangement and a merge are never folded: each is read on its own, as a batch leaves them.
 */

import type { QueueOption, QueueQuestion } from '@braindog/kernel';
import { money } from 'braindog-render';

import { arranges } from './batch.ts';
import { waysOf, type Way } from './queue-answer.ts';

/** One entry of a drawn queue: a question alone, or a family led by its first member. */
export type QueueEntry = { kind: 'one'; q: QueueQuestion } | { kind: 'many'; lead: QueueQuestion; rest: QueueQuestion[] };

/** The fewest rowsets one run must have waiting before they are drawn as one card. */
export const RUN_FAMILY_MOST = 3;

const rowsetOf = (q: QueueQuestion): boolean => (q.body_kind ?? q.kind) === 'rowset';

/** The run a question folds under, when it is a rowset a run filed. */
const runOf = (q: QueueQuestion): string | null => (rowsetOf(q) && typeof q.run?.id === 'string' && q.run.id !== '' ? q.run.id : null);

/** The family a question belongs to, or `null` when it is read on its own. `runs` is how many rowsets each run has waiting. */
const familyOf = (q: QueueQuestion, runs: ReadonlyMap<string, number>): string | null => {
  if (arranges(q) || q.candidates) return null;
  const run = runOf(q);
  if (run !== null && (runs.get(run) ?? 0) >= RUN_FAMILY_MOST) return `run\u0000${run}`;
  /* SAME WORDS, SAME REASON, SAME INGEST: "Add this message to Ledger? Its last digits match HSBC (EGP)." four times. */
  if (typeof q.who === 'string' && q.who.startsWith('ingest:') && q.question.trim() !== '' && (q.body_kind ?? 'rowset') === 'rowset')
    return `said\u0000${q.who}\u0000${q.question.trim()}\u0000${(q.why ?? '').trim()}`;
  if (typeof q.cause !== 'string' || q.cause === '') return null;
  return `cause\u0000${q.cause.replace(/#\d+$/u, '')}`;
};

/** The queue in its order, with the questions of one family folded into the place of the first of them. */
export function alikeOf(queue: readonly QueueQuestion[]): QueueEntry[] {
  const runs = new Map<string, number>();
  for (const q of queue) {
    const run = arranges(q) || q.candidates ? null : runOf(q);
    if (run !== null) runs.set(run, (runs.get(run) ?? 0) + 1);
  }
  const families = new Map<string, QueueQuestion[]>();
  for (const q of queue) {
    const key = familyOf(q, runs);
    if (key !== null) families.set(key, [...(families.get(key) ?? []), q]);
  }
  const out: QueueEntry[] = [];
  const placed = new Set<string>();
  for (const q of queue) {
    const key = familyOf(q, runs);
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
 * The ways every member can be answered, as the card draws them (`waysOf`): a rowset offers Accept and Decline though
 * its question lists no options, so a family of rowsets has those two and not none.
 */
export function sharedWays(lead: QueueQuestion, rest: readonly QueueQuestion[]): Way[] {
  const each = rest.map((q) => new Set(waysOf(q).map((w) => w.key)));
  return waysOf(lead).filter((w) => each.every((keys) => keys.has(w.key)));
}

/** The run a family was folded under (`run`), when one run's rowsets are what it holds; `null` for any other family. */
export function runFamily(lead: QueueQuestion, rest: readonly QueueQuestion[]): { id: string; name: string } | null {
  const run = runOf(lead);
  if (run === null || rest.length + 1 < RUN_FAMILY_MOST || !rest.every((q) => runOf(q) === run)) return null;
  const doing = lead.run?.name?.trim() ?? '';
  return { id: run, name: doing === '' ? run : doing };
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

/** A run's doing, short enough for a card's heading. */
const clip = (said: string): string => (said.length <= 60 ? said : `${said.slice(0, 59).trimEnd()}\u2026`);

export const alikeWords = {
  /** "and 3 like it", under the one question. */
  more: (n: number) => (n === 1 ? 'and 1 like it' : `and ${n.toLocaleString('en-GB')} like it`),
  /** A run's family, over its card: "Approve all 16 from Tidy projects and tasks?" */
  fromRun: (n: number, doing: string) => `Approve all ${n.toLocaleString('en-GB')} from ${clip(doing)}?`,
  /** Its press on accept, and on the rest as they are labelled. */
  approveAll: 'Approve all',
  /** The way to answer the members one at a time. */
  goThrough: 'Go through them',
  /** After a group press: one Undo for all of it. */
  undo: 'Undo',
  undone: (n: number) => (n === 1 ? 'Put 1 back.' : `Put ${n.toLocaleString('en-GB')} back.`),
  /** The line over the members. */
  members: 'The questions this answers',
  /** After the press: how many were answered. */
  done: (n: number) => (n === 1 ? 'Answered 1 question.' : `Answered ${n.toLocaleString('en-GB')} questions.`),
  /** How many the record refused, and that they are still waiting. */
  left: (n: number) => (n === 1 ? '1 is still waiting.' : `${n.toLocaleString('en-GB')} are still waiting.`),
} as const;
