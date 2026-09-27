/**
 * What `QueueAnswer.svelte` decides without a DOM: its words, who asked in words a person reads, and the ways to answer.
 *
 * PURE, AND NODE LOADS IT (relative `.ts` imports, no runes), so `blocks.ts` can say the proposer the same way on the
 * read-only queue the renderer draws, and a card and the fence under it never name one asker two ways.
 *
 * NO READING OF ITS OWN. The asker is worded by `names.ts`'s `actor` from what the caller holds (the reader's id and the
 * people `boot` named), as every other screen words an actor.
 */

import type { QueueQuestion } from '@braindog/kernel';
import { showsOf } from 'braindog-render';

import { citedWords } from '../cite.ts';
import { copy } from '../copy.ts';
import { moneyInText } from '../record/money.ts';
import { actor, type Actor } from '../record/names.ts';

/**
 * THE CARD'S OWN WORDS, in a `words` object in a module this unit owns rather than the copy aggregate, by the rule every
 * unit keeps (`loop/finish/contracts.md` §8.1). "Suggested" is the one word for a recommended option (design brief §9).
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
  moved: 'A row this would change has changed since it was proposed, so nothing was written.',
  /** A rule that asked, by its name, so a reader knows a person did not. */
  rule: (name: string) => `A rule: ${name}`,
  /** The line a card becomes once it is answered: what was chosen, by whom, and when. */
  answered: (option: string, when: string) => `${option} · you, ${when}`,
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
 * Whether a question changes something the reader should see whole before accepting it: every kind but `options`, which
 * is a choice between the answers written on the card itself.
 */
export const changesSomething = (q: Pick<QueueQuestion, 'kind'>): boolean => q.kind !== 'options';
