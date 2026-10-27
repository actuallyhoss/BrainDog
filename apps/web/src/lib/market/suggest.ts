/**
 * "Suggested for you": at most three things the store offers this record, each from something the record itself says,
 * with that reason beside it. Never a list of what is popular, and never installed for anybody: a card opens the plan
 * or the setting, which asks first.
 *
 * TWO READINGS, BOTH THE RECORD'S OWN:
 * - A RED RATES SIGN (the vital sign that says the newest exchange rate is old) offers keeping rates current, Money's
 *   daily rate feed, with the sign's own sentence as the reason. Only where Money is on: a record with no Money has no
 *   rates to keep.
 * - A QUESTION IN NEEDS YOU THAT NAMES A CONNECTOR offers that connector: a money add-on that brings balances in by
 *   itself (a connector on the money shelf), not added here, whose name an open question says, as when Needs you asks
 *   for a balance to be typed by hand. The question is the reason.
 *
 * NOTHING IS NAMED HERE. No add-on, list or bank is spelled: the sign is read by the words of its name, and a connector
 * by its own title as the catalogue gives it.
 *
 * PURE, so `node --test` reads it.
 */

import { KEEP_RATES_AT } from '@braindog/declare';
import type { PackState } from '../record/packs.ts';
import { actionOf, type Listing } from './listing.ts';
import { shelfOf } from './shelves.ts';

/** A vital sign as the record answers `signs`: what it is, its state and its sentence. */
export type SignRead = { sign: string; name?: string; state: string; said?: string };

/** One suggestion: what it is, one line of what it does, why this record, where it opens, and what the press says. */
export type Suggestion = { key: string; title: string; line: string; why: string; href: string; cue: string; listing: Listing | null };

/** The most suggestions the store shows. */
export const SUGGESTED_MOST = 3;

/** The words the store says them in. */
export const suggestWords = {
  ratesTitle: 'Keep rates current',
  ratesLine: 'Fetches what one dollar is worth in each currency you hold, once a day. A setting in Money.',
  ratesCue: 'Set up',
  /** Where the rates feed is set up: the scheduled action for rates, filled in. */
  ratesAt: KEEP_RATES_AT,
  asked: (question: string): string => `Needs you asks: "${question}"`,
  add: 'Add',
} as const;

/** The rates sign, by the words of its name and its id: the one about exchange rates being current. */
const isRatesSign = (s: SignRead): boolean => /\brates?\b/iu.test(s.sign) && /current/iu.test(`${s.sign} ${s.name ?? ''}`);

/** The first sentence of a sign's line: "The newest exchange rate is 28 days old." */
const firstSentence = (said: string): string => /^[^.!?]*[.!?]/u.exec(said.trim())?.[0] ?? said.trim();

/** A question said short enough for one card: its first eighty characters, cut at a word. */
const short = (q: string): string => {
  const one = q.replace(/\s+/gu, ' ').trim();
  if (one.length <= 80) return one;
  const cut = one.slice(0, 80);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 40 ? cut.lastIndexOf(' ') : 80)}…`;
};

/** Whether a question names a title as a whole word, case aside. */
const names = (question: string, title: string): boolean => {
  const t = title.trim().toLowerCase();
  if (t.length < 3) return false;
  const q = question.toLowerCase();
  const at = q.indexOf(t);
  if (at < 0) return false;
  const before = at === 0 ? ' ' : q[at - 1]!;
  const after = q[at + t.length] ?? ' ';
  return !/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after);
};

/**
 * What the store suggests to this record, at most `SUGGESTED_MOST`, rates first. `moneyOn` says whether the record holds
 * Money turned on; `questions` are the open questions in Needs you.
 */
export function suggestionsOf(input: {
  signs: readonly SignRead[] | null;
  questions: readonly string[] | null;
  listings: readonly Listing[];
  states: readonly PackState[] | null;
  moneyOn: boolean;
  href: (l: Listing) => string;
}): Suggestion[] {
  const out: Suggestion[] = [];
  const rates = (input.signs ?? []).find((s) => isRatesSign(s) && s.state === 'red');
  if (rates && input.moneyOn)
    out.push({ key: 'rates', title: suggestWords.ratesTitle, line: suggestWords.ratesLine, why: firstSentence(rates.said ?? ''), href: suggestWords.ratesAt, cue: suggestWords.ratesCue, listing: null });
  const states = input.states;
  if (states !== null)
    for (const l of input.listings) {
      if (l.kind !== 'pack' || !l.categories.includes('connectors') || shelfOf(l) !== 'money') continue;
      if (actionOf(l, states).kind !== 'install') continue;
      const q = (input.questions ?? []).find((x) => names(x, l.title));
      if (q === undefined) continue;
      out.push({ key: l.key, title: l.title, line: l.summary, why: suggestWords.asked(short(q)), href: input.href(l), cue: suggestWords.add, listing: l });
    }
  return out.slice(0, SUGGESTED_MOST);
}
