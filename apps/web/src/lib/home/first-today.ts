/**
 * What a first Today offers beside its blocks: the card to tell it one real thing (`TellOne.svelte`), and once that is
 * done, the next steps (`WantMore.svelte`). Use case 6's steps 5 and 6 (planner-45, the onboarding target), which
 * home-first-46 mounts on Today.
 *
 * ONE AT A TIME, AS THE MOCKUP DRAWS THEM. While nothing has been added the card is the first act, alone; the moment
 * something is, the card goes and the next steps take its place, until the person hides them.
 *
 * NOTHING HERE IS ANY ONE RECORD'S (DIRECTION §27). It reads what every `boot` sends, the lists and how many entries each
 * holds, and the lists are known by the part they play (`start/parts.ts`), never by a name.
 *
 * A plain `.ts` with relative imports, so `node --test` can hold it; the screen only calls it.
 */

import type { Boot } from '@braindog/client';

import type { Pref } from '../pref.ts';
import { playedBy } from '../start/parts.ts';
import { madeSteps, type MadeStep } from '../start/made.ts';
import type { TellList } from '../tell/read.ts';

/** What these read of `boot`: the lists, each with how many entries it holds. */
type Holds = Pick<Boot, 'registers'>;

/** What these read of the device's preferences: whether the next steps are hidden, and how work arrives. */
type Said = Pick<Pref, 'nextStepsHidden' | 'arrivesBy'>;

/**
 * How many entries a person has put in, across every list.
 *
 * THE RECORD FILLS RATES ITSELF, so the list that keeps them counts for nothing. AND THE PERSON MAY BE HER OWN FIRST
 * PERSON: a People list whose one entry is the person who signed up has had nothing added by hand, so its first entry is
 * not counted. A record that keeps no rates or no People counts every entry.
 */
export function addedByHand(boot: Holds): number {
  const rates = playedBy('rates');
  const people = playedBy('meets');
  let n = 0;
  for (const r of boot.registers) {
    const count = Number.isFinite(r.count) && r.count > 0 ? r.count : 0;
    if (r.id === rates) continue;
    n += r.id === people ? Math.max(0, count - 1) : count;
  }
  return n;
}

/** Whether Today offers the card to tell it one real thing: while nothing is added by hand, and the person has not hidden it. */
export const showTell = (boot: Holds, pref: Said = {}): boolean => pref.nextStepsHidden !== true && addedByHand(boot) === 0;

/**
 * The next steps Today offers, in the order the person's answer puts them, or none: while the card is still the first
 * act, and once the person has hidden them.
 */
export function wantMore(boot: Holds, pref: Said = {}): MadeStep[] {
  if (pref.nextStepsHidden === true || showTell(boot, pref)) return [];
  return madeSteps(
    boot.registers.map((r) => r.id),
    pref.arrivesBy,
  );
}

/* ── the card's words that are worked out ────────────────────────────────────── */

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** A count as the card says it: "three" up to ten, the number past it. One sentence becomes eight at most. */
export const countWord = (n: number): string => WORDS[n] ?? String(n);

/** "A, B and C". */
const andOf = (items: readonly string[]): string =>
  items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/** "an order", "a client": one entry of a list, by what the list calls one of its entries. */
const oneOf = (one: string): string => `${/^[aeiou]/iu.test(one) ? 'an' : 'a'} ${one.toLowerCase()}`;

/**
 * The receipt after the press: "Added an order, a client and a payment", each entry by what its list calls one, in the
 * order they were added. A list that names no `one` says its own name; nothing says an id.
 */
export function addedSaid(made: readonly { register: string }[], lists: readonly Pick<TellList, 'id' | 'name' | 'one'>[]): string {
  const said = made.map((m) => {
    const list = lists.find((l) => l.id === m.register);
    return list?.one ? oneOf(list.one) : `one in ${list?.name ?? 'your BrainDog'}`;
  });
  return said.length === 0 ? 'Added nothing' : `Added ${andOf(said)}`;
}

/**
 * The lists a sentence is read against: those `boot` says this person holds, each as the record declared it, where this
 * tab has learnt the declaration (`record/held.ts` `REGISTERS`). A list not learnt yet is left out, never guessed.
 */
export function tellLists(boot: Holds, declared: Readonly<Record<string, TellList | undefined>>): TellList[] {
  const out: TellList[] = [];
  for (const r of boot.registers) {
    const d = declared[r.id];
    if (d) out.push(d);
  }
  return out;
}
