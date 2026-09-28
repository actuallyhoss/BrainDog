/**
 * The words browse and an add-on's detail page draw that no other screen does (`loop/finish/rules.md` §2: a unit's own
 * `words` object). The sentences these screens share with /packs, the catalogue's trust lines among them, stay in
 * `lib/copy/packs.ts`, so both screens say a key and a signature the same way.
 */

import type { Category } from '@braindog/declare/catalogue';

export const words = {
  searchLabel: 'Search use cases and add-ons',
  searchHint: 'Search by name, what it adds or who made it',
  all: 'All',
  categoriesLabel: 'Categories',
  categories: {
    'made-by-braindog': 'Made by BrainDog',
    'ways-of-working': 'Ways of working',
    modules: 'Lists',
    templates: 'Templates',
    connectors: 'Connectors',
    doors: 'Doors',
    automations: 'Automations',
    blocks: 'Blocks',
    themes: 'Themes',
  } satisfies Record<Category, string>,
  orderLabel: 'Order',
  orders: { 'for-you': 'For you', installed: 'Most installed', newest: 'Newest' },
  kinds: { module: 'Built in', usecase: 'Use case', pack: 'Add-on' },
  nothingFound: 'Nothing matches that search',
  nothingFoundBody: 'Try fewer words, or pick All.',
  results: (n: number): string => (n === 1 ? '1 result' : `${n} results`),
  installs: (n: number): string => `${n}+ installs`,
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
  addsExamples: 'Example rows',
  addsModules: 'Needs first',
  addsNothing: 'Nothing of its own',
  addsFigures: 'Figures',
  atLeast: (n: string): string => `at least ${n}`,
  atMost: (n: string): string => `at most ${n}`,
  exactly: (n: string): string => `exactly ${n}`,
  over: (n: number, unit: 'd' | 'w' | 'm' | 'y'): string => {
    const name = { d: 'day', w: 'week', m: 'month', y: 'year' }[unit];
    return `over ${n} ${n === 1 ? name : `${name}s`}`;
  },
  ruleWritten: (list: string): string => `When a row in ${list} is written, it acts on it`,
  ruleScheduled: 'Runs on a schedule',
  ruleOther: 'Runs when something happens in the record',
  examples: (n: number): string => (n === 0 ? 'No example rows' : n === 1 ? '1 example row' : `${n} example rows`),
  bump: { major: 'Takes something away', minor: 'Adds something', patch: 'Changes details' },
  first: 'First version',
  /* A DAY, NEVER ISO: "2 Sep" this year, "2 Sep 2025" before it (design.md §6.5). A version is dated to the day, so a
     time inside the week is not worth the relative form. */
  published: (at: string): string => {
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return '';
    const year = d.getUTCFullYear() === new Date().getUTCFullYear() ? {} : { year: 'numeric' as const };
    return `Published ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC', ...year })}`;
  },
  calls: 'What it calls out to',
  versions: 'Versions',
  requires: 'Needs',
  requiresNothing: 'Nothing else',
  licence: 'Licence',
  pages: 'Its pages',
  noPreview: 'No drawing of its pages yet. Its lists and pages are named below.',
  previewRefused: 'This drawing could not be read.',
  yanked: (reason: string): string => `Taken back: ${reason}`,
  install: (title: string): string => `Install ${title}`,
  update: (to: string): string => `Update to ${to}`,
  turnOn: (title: string): string => `Turn on ${title}`,
  installed: 'Installed',
  turnedOn: (title: string): string => `${title} is on.`,
  planning: 'Reading the plan…',
  asked: 'Asked on Decide.',
  openDecide: 'Open it on Decide',
  missing: 'Nothing here by that name',
  missingBody: 'It may have been taken back, or the link is wrong.',
} as const;
