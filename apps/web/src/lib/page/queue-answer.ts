/**
 * What a question card decides without a DOM: its words, who asked in words a person reads, and the ways to answer. The
 * one decision card (`lib/decide/card.ts`, `DecisionCard.svelte`) builds on these, and `QueueAnswer.svelte` draws it.
 *
 * PURE, AND NODE LOADS IT (relative `.ts` imports, no runes), so `blocks.ts` can say the proposer the same way on the
 * read-only queue the renderer draws, and a card and the fence under it never name one asker two ways.
 *
 * NO READING OF ITS OWN. The asker is worded by `names.ts`'s `actor` from what the caller holds (the reader's id and the
 * people `boot` named), as every other screen words an actor.
 */

import type { QueueQuestion } from '@braindog/kernel';
import { day, relative, showsOf } from 'braindog-render';

import { citedWords } from '../cite.ts';
import { copy } from '../copy.ts';
import { moneyInText } from '../record/money.ts';
import { actor, type Actor } from '../record/names.ts';
import { mergeOf, type Merge } from '../../routes/decide/merge.ts';

/**
 * THE CARD'S OWN WORDS, in a `words` object in a module this card owns rather than the copy aggregate, by the rule every
 * area keeps. "Suggested" is the one word for a recommended option.
 */
export const queueWords = {
  /** The label over the one line a question opens when the record wants a reason. */
  why: 'Why? (one line)',
  send: 'Send',
  suggested: 'Suggested',
  /** What a proposal that changes something links to, where its whole change is laid out before anybody accepts it. */
  seeWhole: 'See what it changes',
  /**
   * A row the proposal would change moved after it was filed. Decide's own sentence for this says the question "has
   * been read again", which Decide does and this card does not, so the card says only what happened.
   */
  moved: 'Something this would change has changed since it was proposed, so nothing was written.',
  /** A rule that asked, by its name, so a reader knows a person did not. */
  rule: (name: string) => `A rule: ${name}`,
  /** The line a card becomes once it is answered: what was chosen, by whom, and when. */
  answered: (option: string, when: string) => `${option} · you, ${when}`,
  /** A question put off (`governance.later`): the day it comes back to the reader. */
  back: (when: string) => `Comes back ${when}`,
  /** Beside a question joined from several: how many things answering it changes. */
  joined: (n: number) => `· ${n.toLocaleString('en-GB')} changes`,
} as const;

/**
 * A rule's name as the middle of a sentence: its first letter lowered, unless the name opens on a run of capitals (an
 * initialism such as "SMS"), which keeps its spelling.
 */
const inSentence = (name: string): string => (/^\p{Lu}{2}/u.test(name) ? name : name.charAt(0).toLowerCase() + name.slice(1));

/**
 * Who opened a question, as a face and a name: "Claude", "A rule: chase late payments", "Slash", "You", a person by the
 * name the record gave them, never `p_seed` or `rule:cash-stale`.
 *
 * `actor` SAYS EVERY SHAPE, and this adds one thing to it: a rule's name is said as a rule's, because on a card with no
 * face beside it ("Keep balances current" in the renderer's by-line) a rule's name reads as a person's request.
 */
export function proposer(who: string, me: string | null = null, names: ReadonlyMap<string, string> = new Map()): Actor {
  const said = actor(who, me, names);
  return said.kind === 'rule' ? { name: queueWords.rule(inSentence(said.name)), kind: 'rule' } : said;
}

/** What an option is, where the card can draw it: its colours, or a few words or a figure. */
export type Visual = { swatch: string[] } | { figure: string };

/**
 * An option's visual, held to the renderer's own reading first (`showsOf`), or `null`.
 *
 * THE SAME CHECK THE FENCE MAKES (`blocks.ts` `showsCell`), because a swatch is the one colour from the record that
 * reaches a style, and a spelling the renderer would refuse is left out rather than written into `--swatch`. A FILE IS
 * LEFT OUT HERE: only the page's `RenderOptions.file` turns a row's file into an address, and this card is handed none.
 */
export function visualOf(shows: unknown): Visual | null {
  if (shows === null || typeof shows !== 'object') return null;
  const s = shows as { swatch?: unknown; figure?: unknown };
  const cell = Array.isArray(s.swatch) ? `swatch:${s.swatch.join(',')}` : typeof s.figure === 'string' ? `figure:${s.figure}` : '';
  const read = cell === '' ? null : showsOf(cell);
  return read === null || 'file' in read ? null : read;
}

/** One way to answer, in the words a reader sees, with what it is where it says. */
export type Way = { key: string; label: string; because: string; recommended: boolean; shows: Visual | null };

/**
 * The ways to answer a question, in the record's order.
 *
 * AN `options` QUESTION CARRIES ITS OWN, and every other kind is accepted or rejected in this app's two words, the ones
 * `blocks.ts` writes for the renderer and `governance.ts` puts on Decide: the record sends no English for them.
 *
 * NO `{{ref:...}}` REACHES THE CARD: a Slash option's words carry citations, read here as their fallback words, and a
 * stored money sentence is drawn in the record's currency, as the renderer's fence is.
 */
export function waysOf(q: Pick<QueueQuestion, 'options'>): Way[] {
  if (q.options.length === 0)
    return [
      { key: 'accept', label: copy.acceptIt, because: '', recommended: false, shows: null },
      { key: 'reject', label: copy.rejectIt, because: '', recommended: false, shows: null },
    ];
  return q.options.map((o) => ({
    key: o.key,
    label: saidOf(o.label),
    because: saidOf(o.because),
    recommended: o.recommended,
    shows: visualOf(o.shows),
  }));
}

/** A question's own words, and why it is asked, as the card draws them: citations as words, money in the record's currency. */
export const saidOf = (text: string): string => moneyInText(citedWords(text));

/**
 * A DAY SAID THE WAY DECIDE SAYS ONE: relative inside a week ("in 3 days", "tomorrow"), then the day and month, and the
 * year as well once it is another year. "on" leads a date so the line reads whole.
 */
function backDay(iso: string, now: number): string {
  const d = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(d)) return '';
  if (Math.abs(Date.parse(`${d}T12:00:00Z`) - now) / 86_400_000 < 7) return relative(d, now);
  const said = day(d);
  const year = String(new Date(now).getUTCFullYear());
  return `on ${said.endsWith(` ${year}`) ? said.slice(0, -year.length - 1) : said}`;
}

/**
 * THE ONE QUIET LINE A QUESTION PUT OFF CARRIES (`governance.later` sends `until` and `until_why`): when it comes back,
 * and why it was put off, as Decide's classic list said it. `null` on any other question, or a day that does not read.
 */
export function laterLine(q: { until?: unknown; until_why?: unknown }, now: number): string | null {
  const when = typeof q.until === 'string' ? backDay(q.until, now) : '';
  if (when === '') return null;
  const why = typeof q.until_why === 'string' ? saidOf(q.until_why.trim()) : '';
  return why === '' ? queueWords.back(when) : `${queueWords.back(when)} · ${why}`;
}

/**
 * Whether a question changes something the reader should see whole before accepting it: every kind but `options`, which
 * is a choice between the answers written on the card itself.
 */
export const changesSomething = (q: Pick<QueueQuestion, 'kind'>): boolean => q.kind !== 'options';

/**
 * THE MERGE A QUEUE QUESTION ASKS, from the `candidates` the record sends beside it (`QueueQuestion`), or `null` for a
 * question that is not one or a record on an older build that sends none.
 *
 * A QUESTION OF OPTIONS IS READ AS ITS OWN PAGE READS IT (`merge.ts` `mergeOf`). A ROWSET IS READ OFF ITS CANDIDATES, since
 * the queue does not carry the rows the question's page checks: the record's own cluster question (`people.ts`
 * `askCluster`) names every one it is about, one of them kept, and folds the others into it, one row each plus at most
 * one on the kept row. A rowset whose count of rows is not that is some other change, and keeps its two answers. Accept is
 * Merge all and Reject is Keep apart, and a rowset is answered whole, so no candidate carries a Pick.
 */
export function queueMergeOf(q: { kind: string; body_kind?: unknown; candidates?: unknown; held?: unknown }, offered: readonly string[]): Merge | null {
  const candidates = q.candidates;
  if (!Array.isArray(candidates)) return null;
  const kind = typeof q.body_kind === 'string' ? q.body_kind : q.kind;
  if (kind === 'options') return mergeOf({ kind, body: { candidates } }, offered);
  if (kind !== 'rowset' || !offered.includes('accept') || !offered.includes('reject')) return null;
  /* THE NAMES AND WHERE EACH WAS SEEN, worded as a question of options words them: no handle drawn as a name. */
  const read = mergeOf({ kind: 'options', body: { candidates } }, ['merge', 'apart']);
  if (read === null) return null;
  const kept = read.candidates.filter((c) => c.kept);
  const n = read.candidates.length;
  if (kept.length !== 1 || (q.held !== n - 1 && q.held !== n)) return null;
  return {
    candidates: [...kept, ...read.candidates.filter((c) => !c.kept)].map((c) => ({ ...c, pick: null })),
    all: { option: 'accept' },
    apart: { option: 'reject' },
  };
}
