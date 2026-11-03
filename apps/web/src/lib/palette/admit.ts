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
 *   1. NO OBJECT IS REQUIRED BEFORE IT. "Open the Keychain" always makes sense. "File this row under
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
import { MONEY_ADDS, MONEY_IMPORT, PEOPLE_IMPORT, words } from './create.ts';
import type { Offer } from './customise.ts';
import { words as pageWords, type Paging } from './new-page.ts';

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
 *
 * `customise` IS THE SAME SHAPE. `Dark mode`, `Open on Money`, `Hide Inbox`: the change and the thing it changes are
 * words in the box, read by `customise()` in `customise.ts`, and what it takes is `Live.customise`.
 *
 * `page` TOO. `New page: Wedding` makes a page whose name is typed in the box, read by `paging()` in
 * `new-page.ts`, and what it takes is `Live.page`.
 */
export const ACTS = ['undo', 'add', 'customise', 'page', 'money'] as const;
export type Act = (typeof ACTS)[number];

/**
 * THE ACTS THAT CARRY THEIR OWN TARGET, which is the third way to pass test 2.
 *
 * Undo means the same thing from every screen because the keymap binds it at the document. Add
 * means the same thing because the list it writes to is named in its own words: `Add to Tasks` is
 * Tasks from the inbox, from a page and from Settings. No binding is needed to prove that, and
 * inventing one to satisfy the test would put a key in the `?` sheet that does nothing.
 */
const NAMES_ITS_TARGET: readonly Act[] = ['add', 'customise', 'page', 'money'];

/** A row a query can make: the list it goes in and the words it is titled with. `create.ts` reads it. */
export type Creation = { register: string; title: string };

/** What the palette knows about right now, so the standing rule has something to ask. */
export type Live = {
  /** True while a toast is still holding an offer to reverse something. */
  undoable: boolean;
  /** The row the query would add, or `null` while the query is not the whole sentence. */
  creation: Creation | null;
  /**
   * The changes the query names (`customise.ts`), empty for an empty query and for any query that names none. Absent is
   * empty, so a caller that knows nothing of them is answered as before.
   */
  customise?: readonly Offer[];
  /**
   * The page the query would make or suggest (`new-page.ts`), its name empty while the row is only found by its words.
   * `null` or absent when the query is about something else, or nobody here may ask for a page.
   */
  page?: Paging | null;
  /**
   * Whether the record keeps a ledger and a page is drawn that can open the quick-add sheet (`lib/money/quick.svelte.ts`
   * `ready`). Absent is no, so a caller that knows nothing of it is offered no money row.
   */
  ledger?: boolean;
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
  /**
   * THE OTHER WORDS A PERSON REACHES FOR. Somebody after their mail types `mail`, not `Inbox`, and a
   * palette that answers only to the screen's own name makes them learn the app's vocabulary first. Plain lower-case
   * words, at most six, and never another command's name: `scoreOf` ranks an alias hit below every hit on a title, so
   * a word that is somebody else's name would be a second door to the wrong place.
   */
  aliases?: readonly string[];
};

/**
 * Which test a row failed, so a refusal can be reported rather than silently swallowed. `alias` is the fourth, and it
 * is about the other words rather than the name: one empty, too long, not plain lower-case, more than six, or another
 * command's name.
 */
export type Refusal = 'object-first' | 'not-everywhere' | 'unsayable' | 'alias';

/** An alias is plain lower-case words, a space between them, and short enough to be something a person types. */
const ALIAS = /^[a-z]+(?: [a-z]+)*$/u;
const ALIAS_MOST = 6;
const ALIAS_LONGEST = 24;

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

/**
 * The rule, as code. `null` is admitted; anything else names the test it failed.
 *
 * `among` is the list an alias may not be a name in, `COMMANDS` unless a test asks of another. A command's own name
 * is left out by its id, so a fixture that borrows a shipped row's words is not refused for being itself.
 */
export function admits(c: Command, among: readonly Command[] = COMMANDS): Refusal | null {
  const acts = c.act !== undefined && (ACTS as readonly string[]).includes(c.act);

  // 1. No object is required before it.
  if (c.href === null ? !acts : PLACEHOLDER.test(c.href)) return 'object-first';

  // 2. It means the same thing from every screen.
  const carries = c.act !== undefined && NAMES_ITS_TARGET.includes(c.act);
  if (c.href === null ? c.binding === undefined && !carries : !c.href.startsWith('/')) return 'not-everywhere';

  // 3. It has a name somebody would type.
  if (!typeable(c.title)) return 'unsayable';

  // 4. Its other words are words, and nobody else's name.
  if (c.aliases !== undefined) {
    if (c.aliases.length > ALIAS_MOST) return 'alias';
    const names = new Set(among.filter((o) => o.id !== c.id).map((o) => plain(o.title)));
    for (const a of c.aliases) if (a.length > ALIAS_LONGEST || !ALIAS.test(a) || names.has(a)) return 'alias';
  }

  return null;
}

/** Words as the query grammar reads them, joined by one space: `Sign in` and `sign  in!` are both `sign in`. */
const plain = (s: string): string => tokensOf(s).join(' ');

/**
 * HOW WELL A COMMAND ANSWERS WHAT WAS TYPED, or `null` when it does not answer at all (HD.119's one matcher).
 *
 * The order is the order of how sure the hit is. The whole name typed is 5, the name's beginning 4, the beginning of a
 * word in it 3 (every typed word starting one of the name's words, the rule the palette filtered with before), the
 * name holding it somewhere 2, and one of the command's other words equal to it or starting with it 1. AN ALIAS IS
 * LAST ON PURPOSE: a person who typed the start of a name meant that name, and the other words are for the person
 * who did not know it.
 *
 * THE MIDDLE OF A WORD NEEDS THREE LETTERS. `ing` finding Settings is a guess worth showing; `e` finding every name
 * with an e in it is the panel filling up with rows nobody asked for.
 */
export function scoreOf(c: Command, needle: string): number | null {
  const want = terms(needle);
  if (!want) return null;
  const typed = want.join(' ');
  const title = plain(c.title);
  if (title === typed) return 5;
  if (title.startsWith(typed)) return 4;
  const has = tokensOf(c.title);
  if (want.every((w) => has.some((tok) => tok.startsWith(w)))) return 3;
  if (typed.length >= 3 && title.includes(typed)) return 2;
  if ((c.aliases ?? []).some((a) => a.startsWith(typed))) return 1;
  return null;
}

/** A command with how well it answered, so a caller can draw the best first and still say why. */
export type Ranked = Command & { score: number };

/**
 * THE COMMANDS THAT ANSWER, BEST FIRST, in one ordered list within each group.
 *
 * The groups keep the order their first command was declared in, so the palette's headings do not swap places as a
 * person types; inside a group the best hit leads and a tie keeps the declared order. With nothing typed every
 * command answers with 0, in the order declared, which is the list a freshly opened palette shows. Something typed
 * that holds no letter or digit answers nothing, the honest answer `starts()` gave.
 */
export function ranked(list: readonly Command[], needle: string): Ranked[] {
  const blank = needle.trim() === '';
  const groups = [...new Set(list.map((c) => c.group))];
  const hits = list.flatMap((c, at) => {
    const score = blank ? 0 : scoreOf(c, needle);
    return score === null ? [] : [{ c, at, score }];
  });
  hits.sort((a, b) => groups.indexOf(a.c.group) - groups.indexOf(b.c.group) || b.score - a.score || a.at - b.at);
  return hits.map((h) => ({ ...h.c, score: h.score }));
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
  { id: 'c-home', title: copy.today, href: '/', group: copy.destinations, icon: 'today', aliases: ['start', 'home', 'dashboard', 'overview'] },
  { id: 'c-decide', title: copy.decide, href: '/decide', group: copy.destinations, icon: 'decide', aliases: ['questions', 'approve', 'approvals', 'pending'] },
  { id: 'c-inbox', title: copy.inbox, href: '/inbox', group: copy.destinations, icon: 'inbox', aliases: ['mail', 'messages', 'email', 'incoming'] },
  { id: 'c-keychain', title: copy.keychain, href: '/keychain', group: copy.destinations, icon: 'vault', aliases: ['vault', 'keys', 'secrets', 'passwords', 'tokens'] },
  { id: 'c-packs', title: copy.packs, href: '/settings/plugins', group: copy.destinations, icon: 'plug', aliases: ['packs', 'extensions', 'add ons', 'addons', 'install', 'store'] },
  /* SLASH'S CONVERSATIONS, the bare `/slash`: each one press from going on with it in Ask. */
  { id: 'c-slash-threads', title: 'Slash conversations', href: '/slash', group: copy.destinations, icon: 'slash', aliases: ['threads', 'chats'] },
  /* SLASH'S HISTORY, what it noticed, suggested and was asked: the old page, kept at `?history`. */
  { id: 'c-slash', title: 'Slash history', href: '/slash?history', group: copy.destinations, icon: 'slash', aliases: ['suggestions', 'noticed', 'asked'] },
  /* AUTOMATIONS, the canvas an owner and an agent both edit. Reachable only by its address
     until it was here and in the rail. */
  { id: 'c-automations', title: copy.automations, href: '/automations', group: copy.destinations, icon: 'refresh', aliases: ['rules', 'workflows', 'triggers', 'schedules'] },
  { id: 'c-settings', title: copy.settings, href: '/settings', group: copy.destinations, icon: 'settings', aliases: ['preferences', 'configure', 'account', 'profile'] },
  /* THE FRONT DOOR, WHICH NOTHING LINKED TO. A screen with no way in is the same as no screen,
     and the palette is `19 §4`'s primary way to reach one. */
  { id: 'c-signin', title: copy.signIn, href: '/signin', group: copy.destinations, icon: 'lock', aliases: ['login', 'log in', 'signin'] },
  /* THE ROUTE THE SHORTCUT TEACHER DID NOT TEACH. `g s` was bound, the `?` sheet advertised it, and
     `/search` appeared in no nav, no tab bar, no sidebar and not here, so typing `sear` found
     nothing, and on a phone the route was reachable only from the palette's overflow row, which is
     to say only from inside the cap it exists to relieve. */
  { id: 'c-search', title: copy.search, href: '/search', group: copy.destinations, icon: 'search', aliases: ['find', 'lookup'] },
  { id: 'c-audit', title: copy.audit, href: '/audit', group: copy.destinations, icon: 'activity', aliases: ['audit', 'history', 'log', 'changes'] },
  { id: 'c-keys', title: copy.keymap, href: '/settings/keyboard', group: copy.commands, icon: 'keyboard', aliases: ['shortcuts', 'hotkeys', 'bindings'] },
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
    aliases: ['revert', 'reverse'],
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
  /**
   * AND THE ROWS THAT CHANGE THE APP ITSELF, drawn like the add row: as the sentences the query makes,
   * `Dark mode`, `Open on Money`, `Hide Inbox`, and only while it makes one. With nothing typed there are none, so a
   * freshly opened palette looks as it always has.
   */
  {
    id: 'c-customise',
    title: copy.customise.group,
    href: null,
    act: 'customise',
    group: copy.customise.group,
    icon: 'settings',
    when: (live) => (live.customise?.length ?? 0) > 0,
  },
  /**
   * AND THE ROW THAT MAKES A PAGE. No control made one: a person who wanted an empty page pasted source.
   *
   * THE TITLE HERE IS THE DECLARATION'S. The palette draws `New page`, then `New page: Wedding` once the box holds a
   * name, and `Suggest a page` for somebody who does not own the record, all of it `new-page.ts`'s reading of the
   * query. With no record, or a query about something else, there is no row.
   */
  {
    id: 'c-page',
    title: pageWords.declared,
    href: null,
    act: 'page',
    group: copy.commands,
    icon: 'plus',
    when: (live) => (live.page ?? null) !== null,
  },
  /* AND THE THREE THAT ADD MONEY (`create.ts` `MONEY_ADDS`), offered while the record keeps a ledger, and the import. */
  ...MONEY_ADDS,
  MONEY_IMPORT,
  /* AND PEOPLE'S IMPORT, a contacts file (`routes/add/contacts`). */
  PEOPLE_IMPORT,
];
