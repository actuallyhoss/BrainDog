/**
 * WHAT IS ALLOWED IN THE COMMAND LIST, WRITTEN DOWN AND ENFORCED.
 *
 * The palette used to hold a hand-kept array of destinations with no rule over it, so the only
 * question anybody could ask of a new row was whether it looked like the others. That is how a
 * launcher rots: nothing in it is wrong on its own, and after a year it is a menu of the screens
 * whoever added them happened to be working on.
 *
 * So the rule is written at the top of this file. A command belongs here when it can be STARTED WITHOUT FIRST CHOOSING WHERE, and
 * three tests decide it. All three have to pass:
 *
 *   1. NO OBJECT IS REQUIRED BEFORE IT. "Open the vault" always makes sense. "File this row under
 *      Groceries" needs the row first, so it lives on the row. Mechanically: the address names its
 *      whole target, with no placeholder segment left for something you have not picked yet.
 *   2. IT MEANS THE SAME THING FROM EVERY SCREEN. A period filter on the spending view is a control
 *      for a page you are looking at; from here it would be a remote control for a page you cannot
 *      see. Mechanically: the address is absolute, so it cannot be read against whatever route
 *      happens to be underneath. A command that ACTS rather than travels passes this a second way,
 *      by naming a binding the keymap already holds at the document, which is the same claim.
 *   3. IT HAS A NAME SOMEBODY WOULD TYPE. A command whose only honest label is "toggle the thing in
 *      the corner" is furniture. Mechanically: the name has to survive the palette's own query
 *      grammar, so that typing the row's own words finds the row. The half a machine cannot judge
 *      is whether those words are the ones a person reaches for, and that half stays with the
 *      reviewer.
 *
 * AND THE STANDING RULE, WHICH IS NOT ONE OF THE THREE: A ROW THAT CANNOT RUN IS NOT THERE. Not
 * greyed out, not present and inert. Undo is absent when there is nothing to reverse. It is
 * `when` below, and the palette applies the same rule to the objects it draws: a saved view over a
 * register this record does not hold, and a figure whose declaration needs a project chosen first,
 * are both simply not built.
 *
 * ENFORCED, NOT DESCRIBED. `admits` is the rule as code and `commands` is the only way the list
 * gets read, so a row that fails a test cannot reach a reader whatever the comment above it says.
 * `palette.test.ts` then asserts that no declared row is silently dropped, because a filter with
 * nothing watching it turns a mistake into an absence nobody notices.
 */

import { BINDINGS } from '../a11y/bindings.ts';
import { copy } from '../copy.ts';
import { terms, tokensOf } from '../record/find.ts';
import type { IconName } from '../ui/icons.ts';
import { words } from './create.ts';

/**
 * The verbs the palette can perform in place rather than travel to.
 *
 * A CLOSED LIST, and that is test 1 for a command that has no address: a named act takes no
 * argument, so there is nothing for a reader to have chosen first. It is also why the act is a
 * name and not a closure hanging off the declaration: a closure would let the next row smuggle in
 * an argument, and the rule would stop being checkable.
 *
 * `add` IS THE ONE WITH AN ARGUMENT, AND THE ARGUMENT IS THE QUERY. `Add to Tasks: buy milk` is
 * typed, not chosen: the list and the title are words in the box, read by `creation()` in
 * `create.ts`, so there is still no object somebody has to pick on a screen before the row can
 * run, which is what test 1 asks. What it takes is `Live.creation`, which the palette computes
 * and this file only asks about, so the declaration stays a name.
 */
export const ACTS = ['undo', 'add'] as const;
export type Act = (typeof ACTS)[number];

/**
 * THE ACTS THAT CARRY THEIR OWN TARGET, which is the third way to pass test 2.
 *
 * Undo means the same thing from every screen because the keymap binds it at the document. Add
 * means the same thing because the list it writes to is named in its own words: `Add to Tasks` is
 * Tasks from the inbox, from a page and from Settings. No binding is needed to prove that, and
 * inventing one to satisfy the test would put a key in the `?` sheet that does nothing.
 */
const NAMES_ITS_TARGET: readonly Act[] = ['add'];

/** A row a query can make: the list it goes in and the words it is titled with. `create.ts` reads it. */
export type Creation = { register: string; title: string };

/** What the palette knows about right now, so the standing rule has something to ask. */
export type Live = {
  /** True while a toast is still holding an offer to reverse something. */
  undoable: boolean;
  /** The row the query would add, or `null` while the query is not the whole sentence. */
  creation: Creation | null;
};

export type Command = {
  id: string;
  /** The words on the row, and the words somebody types to find it. Test 3 is about this. */
  title: string;
  /** The heading it sits under, from `copy.ts`. */
  group: string;
  icon: IconName;
  /** Where it goes, or `null` when it acts in place and `act` says what it does. */
  href: string | null;
  act?: Act;
  /**
   * A binding id from `a11y/keys.svelte.ts`, when the keymap already binds this command.
   *
   * THE ID, NEVER THE KEY ITSELF. The palette prints what the registry holds, so the row and the
   * `?` sheet cannot drift, and a chord respelled here would be the second list the registry exists
   * to prevent. `palette.test.ts` asserts every id named here is one the registry declares.
   */
  binding?: string;
  /** Present only on a command that can be unavailable. Absent means it can always run. */
  when?: (live: Live) => boolean;
};

/** Which test a row failed, so a refusal can be reported rather than silently swallowed. */
export type Refusal = 'object-first' | 'not-everywhere' | 'unsayable';

/**
 * The registry's own label for the undo binding, READ from the registry.
 *
 * IT WAS A COPY OF THE SENTENCE, under a comment explaining that `a11y/keys.svelte.ts` uses runes
 * and so cannot be imported by a plain module or by `node --test`, with a test in `palette.test.ts`
 * that read the registry as TEXT and grepped it for the same string. That was an honest answer to a
 * real constraint and the constraint is gone: the bindings are data and they live in a plain
 * `bindings.ts` now, so the label can simply be the label.
 */
export const UNDO_LAST = BINDINGS.find((b) => b.id === 'undo')?.label ?? '';

/**
 * A segment somebody still has to fill in: `/r/:register/:seq`, `/r/[register]`, `/p/{slug}`.
 *
 * Test 1 in one expression. A route with a hole in it is a route that needs an object chosen
 * before it can be run, and the palette is the surface you reach for BEFORE you have one.
 */
const PLACEHOLDER = /[:[\]{}]/u;

/**
 * Test 3, mechanically: are these words the query grammar can carry back?
 *
 * The same two primitives the palette's own `starts()` filters with, asked the one question a name
 * has to answer. It is deliberately not a copy of `starts()`: that one keeps an empty-query branch
 * a filter box needs, and an empty query is not a name.
 *
 * The three-letter floor is the part with teeth. `terms()` alone admits a title of single letters
 * and punctuation, which tokenises fine and is not a word anybody types.
 */
const typeable = (title: string): boolean => {
  const want = terms(title);
  if (!want) return false;
  if (!want.some((word) => word.length >= 3)) return false;
  const has = tokensOf(title);
  return want.every((word) => has.some((token) => token.startsWith(word)));
};

/** The rule, as code. `null` is admitted; anything else names the test it failed. */
export function admits(c: Command): Refusal | null {
  const acts = c.act !== undefined && (ACTS as readonly string[]).includes(c.act);

  // 1. No object is required before it.
  if (c.href === null ? !acts : PLACEHOLDER.test(c.href)) return 'object-first';

  // 2. It means the same thing from every screen.
  const carries = c.act !== undefined && NAMES_ITS_TARGET.includes(c.act);
  if (c.href === null ? c.binding === undefined && !carries : !c.href.startsWith('/')) return 'not-everywhere';

  // 3. It has a name somebody would type.
  if (!typeable(c.title)) return 'unsayable';

  return null;
}

/**
 * The list the palette draws, with the rule and the standing rule both applied.
 *
 * ONE READER, so there is no path to `COMMANDS` that skips the tests. The filter runs on every
 * keystroke and costs a regex over ten short strings, which is cheaper than the search underneath
 * it by orders of magnitude and buys the guarantee that the rule is not advisory.
 */
export function commands(live: Live): Command[] {
  return COMMANDS.filter((c) => admits(c) === null && (c.when?.(live) ?? true));
}

export const COMMANDS: readonly Command[] = [
  { id: 'c-home', title: copy.home, href: '/', group: copy.destinations, icon: 'today' },
  { id: 'c-decide', title: copy.decide, href: '/decide', group: copy.destinations, icon: 'decide' },
  { id: 'c-inbox', title: copy.inbox, href: '/inbox', group: copy.destinations, icon: 'inbox' },
  { id: 'c-vault', title: copy.vault, href: '/vault', group: copy.destinations, icon: 'vault' },
  { id: 'c-packs', title: copy.packs, href: '/packs', group: copy.destinations, icon: 'packs' },
  /* SLASH'S PAGE, what it noticed and suggests; its title is its name, which is why it is not a copy key. */
  { id: 'c-slash', title: 'Slash', href: '/slash', group: copy.destinations, icon: 'slash' },
  /* AUTOMATIONS, the canvas an owner and an agent both edit. Reachable only by its address
     until it was here and in the rail. */
  { id: 'c-automations', title: copy.automations, href: '/automations', group: copy.destinations, icon: 'refresh' },
  { id: 'c-settings', title: copy.settings, href: '/settings', group: copy.destinations, icon: 'settings' },
  /* THE FRONT DOOR, WHICH NOTHING LINKED TO. A screen with no way in is the same as no screen,
     and the palette is `19 §4`'s primary way to reach one. */
  { id: 'c-signin', title: copy.signIn, href: '/signin', group: copy.destinations, icon: 'lock' },
  /* THE ROUTE THE SHORTCUT TEACHER DID NOT TEACH. `g s` was bound, the `?` sheet advertised it, and
     `/search` appeared in no nav, no tab bar, no More sheet and not here, so typing `sear` found
     nothing, and on a phone the route was reachable only from the palette's overflow row, which is
     to say only from inside the cap it exists to relieve. */
  { id: 'c-search', title: copy.search, href: '/search', group: copy.destinations, icon: 'search' },
  { id: 'c-audit', title: copy.audit, href: '/audit', group: copy.destinations, icon: 'activity' },
  { id: 'c-keys', title: copy.keymap, href: '/settings/keyboard', group: copy.commands, icon: 'keyboard' },
  /**
   * THE FIRST ROW IN THIS PRODUCT'S PALETTE THAT DOES SOMETHING RATHER THAN GO SOMEWHERE.
   *
   * It is also the standing rule's own worked example, which is why it is the one that was built
   * first: with nothing to reverse there is no row, so nobody reads a greyed line asking them to
   * work out what the app thinks they last did. It comes back the moment a toast offers an undo,
   * and it goes when that offer expires.
   *
   * NAMED FROM THE REGISTRY, NOT FROM THE TOAST. Slash names the row after the toast's own word so
   * the two agree about what is being reversed. This one cannot yet: nothing in this build writes,
   * so every offer on the stack is a mock-up's. The registry's label is the honest one until a
   * write exists to name.
   */
  {
    id: 'c-undo',
    title: UNDO_LAST,
    href: null,
    act: 'undo',
    binding: 'undo',
    group: copy.commands,
    icon: 'back',
    when: (live) => live.undoable,
  },
  /**
   * AND THE FIRST ROW THAT MAKES SOMETHING. Every other row went somewhere or undid something, so
   * the one surface reachable from every screen could not take down the thing a person had just
   * thought of: a task meant leaving for `/r/tasks`, finding its line, and coming back.
   *
   * THE TITLE HERE IS THE DECLARATION'S, NOT THE ROW'S. What the palette draws is the sentence the
   * query makes, `Add to Tasks: buy milk`, and it draws it only while `creation()` reads one out of
   * the box, which is the standing rule: half a sentence has nothing to add, so there is no row.
   * The write is `create.ts`'s, the list's own capture line, so the palette makes the row the list
   * would have made.
   */
  {
    id: 'c-add',
    title: words.declared,
    href: null,
    act: 'add',
    group: copy.commands,
    icon: 'plus',
    when: (live) => live.creation !== null,
  },
];
