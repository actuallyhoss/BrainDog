/**
 * The words browse and an add-on's detail page draw that no other screen does (a module's own
 * `words` object). The sentences these screens share with /packs, the catalogue's trust lines among them, stay in
 * `lib/copy/packs.ts`, so both screens say a key and a signature the same way.
 */

import type { Category } from '@braindog/declare/catalogue';

export const words = {
  searchLabel: 'Search add-ons',
  searchHint: 'Search add-ons',
  /* BROWSE IN TWO SECTIONS (the UI pass of 20 October, agents F9): the ways of working as cards with their Home drawn
     small, and what is built in as rows, the way /packs lists what is installed. An add-on from outside is a third. */
  sections: { usecase: 'Use cases', module: 'Built in', pack: 'From others' } as const,
  sortLabel: 'Sort',
  all: 'All',
  categoriesLabel: 'Categories',
  categories: {
    'made-by-braindog': 'Made by BrainDog',
    'ways-of-working': 'Use cases',
    modules: 'Built in',
    templates: 'Templates',
    connectors: 'Connectors',
    doors: 'Doors',
    automations: 'Automations',
    blocks: 'Blocks',
    themes: 'Themes',
  } satisfies Record<Category, string>,
  orderLabel: 'Order',
  orders: { 'for-you': 'For you', installed: 'Most used', newest: 'Newest' },
  kinds: { module: 'Built in', usecase: 'Use case', pack: 'Add-on' },
  nothingFound: 'Nothing matches that search',
  nothingFoundBody: 'Try fewer words, or pick All.',
  installs: (n: number): string => `On ${n}+ BrainDogs`,
  /* UNDER TEN INSTALLS THE STORE SAYS NO NUMBER (`roundCount`), so an add-on from outside that nobody much holds yet is "New". */
  newOne: 'New',
  /**
   * HOW MANY HOLD IT, AS A CARD AND A PAGE SAY IT: "On 50+ BrainDogs" from ten up (the count is already rounded, and a
   * count under ten is never sent), "New" for an add-on from outside with no count yet, and nothing for a built-in.
   */
  held(count: number | null, source: 'bundled' | 'kennel' | 'file'): string | null {
    if (count !== null) return this.installs(count);
    return source === 'bundled' ? null : this.newOne;
  },
  by: (name: string): string => `By ${name}`,
  verified: 'Verified',
  reviewed: 'Reviewed by BrainDog',
  signedBy: (key: string): string => `Signed with key ${key}`,
  callsNothing: 'Calls out to nothing. It reads and writes only this record.',
  callsOut: (hosts: readonly string[]): string => `Calls out to ${hosts.join(', ')}`,
  adds: 'What it adds',
  addsLists: 'Lists',
  addsPages: 'Pages',
  addsRules: 'Rules',
  addsExamples: 'Examples',
  addsModules: 'Needs first',
  addsNothing: 'Nothing of its own',
  addsFigures: 'Numbers it tracks',
  atLeast: (n: string): string => `at least ${n}`,
  atMost: (n: string): string => `at most ${n}`,
  exactly: (n: string): string => `exactly ${n}`,
  over: (n: number, unit: 'd' | 'w' | 'm' | 'y'): string => {
    const name = { d: 'day', w: 'week', m: 'month', y: 'year' }[unit];
    return `over ${n} ${n === 1 ? name : `${name}s`}`;
  },
  ruleWritten: (list: string): string => `When something in ${list} is written, it acts on it`,
  ruleScheduled: 'Runs on a schedule',
  ruleOther: 'Runs when something happens in the record',
  examples: (n: number): string => (n === 0 ? 'No examples' : n === 1 ? '1 example' : `${n} examples`),
  /* A VERSION'S TAG, OR NONE: "Adds something" on every row said nothing (agents F25). A major is still said, since it
     takes something away. */
  bump: { major: 'Takes something away', minor: 'New', patch: 'Fixes' },
  first: 'First version',
  /* A DAY, NEVER ISO: "2 Sep" this year, "2 Sep 2025" before it. A version is dated to the day, so a
     time inside the week is not worth the relative form. */
  published: (at: string): string => {
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return '';
    const year = d.getUTCFullYear() === new Date().getUTCFullYear() ? {} : { year: 'numeric' as const };
    return `Published ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC', ...year })}`;
  },
  calls: 'What it calls out to',
  /* WHAT WAITS, SAID AS SENTENCES under the plan (`offer.ts` `waitsOf`). */
  waits: 'What waits',
  waitsNote: 'These arrive on their own once you have what they wait for.',
  /* WHAT A PART WAITS FOR WHEN IT NAMES A ROLE AND NOT A LIST (`@braindog/declare` `when.ts`): whichever list plays the
     role will do, so it is said in plain words and never as one list's name. */
  waitsOn: { rates: 'exchange rates', meets: 'a list of people', org: 'a list of organisations' } as Readonly<Record<string, string>>,
  versions: 'Versions',
  requiresNothing: 'Nothing else',
  licence: 'Licence',
  pages: 'Its pages',
  noPreview: 'No drawing of its pages yet. What it adds names each one.',
  previewRefused: 'This drawing could not be read.',
  yanked: (reason: string): string => `Taken back: ${reason}`,
  install: (title: string): string => `Install ${title}`,
  update: (to: string): string => `Update to ${to}`,
  turnOn: (title: string): string => `Turn on ${title}`,
  installed: 'Installed',
  turnedOn: (title: string): string => `${title} is on.`,
  planning: 'Reading the plan…',
  asked: 'Asked in Needs you.',
  openDecide: 'Open it in Needs you',
  missing: 'Nothing here by that name',
  missingBody: 'It may have been taken back, or the link is wrong.',
  /* A CARD'S ONE CUE. The whole card opens the detail page, where the plan is read before anything installs, so the cue
     names the press that page offers and never claims the install itself. */
  installCue: 'Install',
  /* THE DETAIL PAGE'S FACTS: what version this is, under what licence, and who signed it, said once below the fold. */
  details: 'Details',
  version: 'Version',
  signature: 'Signature',
  /* AN INSTALLED ADD-ON ON /packs AND ITS OWN PAGE: one row, its switch, one "…". */
  more: (name: string): string => `More for ${name}`,
  versionOf: (version: string): string => `Version ${version}`,
  /* A CARD'S COUNTS, "1 list · 1 page · 1 rule", each beside its glyph. */
  countLists: (n: number): string => (n === 1 ? '1 list' : `${n} lists`),
  countPages: (n: number): string => (n === 1 ? '1 page' : `${n} pages`),
  countRules: (n: number): string => (n === 1 ? '1 rule' : `${n} rules`),
  countHosts: (n: number): string => (n === 1 ? 'Calls 1 host' : `Calls ${n} hosts`),
  /* THE BROWSE TITLE ROW'S SENTENCE: how many there are, and how many this record holds already. */
  sentence: (n: number, held: number | null): string =>
    held === null || held === 0 ? `${n} to pick from.` : `${n} to pick from, and ${held} ${held === 1 ? 'is' : 'are'} already in your BrainDog.`,
  /* WHAT A USE CASE BRINGS OF ITS OWN, said once under its drawing: its lists by name. */
  ownLists: (names: readonly string[]): string => names.join(', '),
  /* THE DETAIL PAGE'S PLAN: the row that names every host it calls, and the tail of a row that names more than fit. */
  calledHosts: 'Hosts it calls',
  andMore: (n: number): string => `and ${n} more`,
  /* A SMALL DRAWING'S LAST LINE, when a Home has more headings than a card draws. */
  moreLines: (n: number): string => `${n} more`,
  /* WHAT A USE CASE BRINGS BESIDE ITS OWN LISTS: the modules it turns on, by name. */
  brings: (names: readonly string[]): string =>
    `With ${names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`}`,
} as const;
