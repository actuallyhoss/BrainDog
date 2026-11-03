/**
 * The words `/packs` draws that no other screen does (a unit's own `words` object): its three
 * tabs, the Updates list and "Install from…". What it shares with browse and share, a refusal's code line and the
 * catalogue's trust sentences, stays in `lib/copy/packs.ts`.
 *
 * PLAIN NODE LOADS THIS FILE, because `sharing.ts` reads it and a test reads `sharing.ts`.
 */
import { CORE_PACK } from '@braindog/declare';

/** "a", "a and b", "a, b and c". */
const joined = (parts: readonly string[]): string =>
  parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;


/**
 * HOW MANY ADD-ONS ARE IN THIS BRAINDOG, ONE COUNT FOR BOTH TABS (packs-browse-390-light.png): Browse said "7
 * are already in your BrainDog", counting only the installed ones the catalogue lists, while Installed said "9 add-ons
 * installed" over every one the record holds. Both say the record's own list. `null` until the record answers.
 */
export const installedCount = (states: readonly unknown[] | null): number | null => (states === null ? null : states.filter((s) => (s as { id?: unknown }).id !== CORE_PACK).length);

export const words = {
  tabsLabel: 'Plugins',
  /* TWO HALVES OF ONE PLACE (agents F8): what is in, and what there is to add. Updates sit at the top of Installed
     while there are any, and installing from a file or a link is in the page's "⋯". */
  tabs: { installed: 'Installed', browse: 'Browse' },
  browse: 'Browse plugins',
  more: 'More',
  from: 'Install from a file or link',
  fromDone: 'Done',
  /* THE TITLE ROW'S SENTENCE. An update is never urgent, so no phrase in it is red. `updates` is `null`
     while the newer versions are still being looked for, and the sentence then says only what is installed. */
  /* THE COUNT IS THE LIST'S OWN ("Your plugins 2"), so the sentence says only whether they are up to date (3 Nov: "2
     plugins installed" over a card that said 2). Nothing while the newer versions are still being looked for. */
  sentence: (installed: number, updates: number | null): string => {
    if (installed === 0 || updates === null) return '';
    if (updates === 0) return 'All up to date.';
    return `${updates.toLocaleString('en-GB')} ${updates === 1 ? 'update' : 'updates'} ready.`;
  },
  /* THE LIST'S OWN HEADING, and the updates' when that tab is open. */
  installedTitle: 'Installed',
  updatesTitle: 'Updates',
  /* UPDATES, at the top of Installed while there are any. */
  seePlan: 'See the plan',
  planning: 'Reading the plan',
  updateAll: 'Update all',
  updated: (n: number) => (n === 1 ? '1 plugin is updated.' : `${n} plugins are updated.`),
  /* ONE PASSED OVER IS NAMED: an earlier update of the same run already brought it to its version. */
  alreadyIn: (names: readonly string[]) => `${joined(names)} ${names.length === 1 ? 'was' : 'were'} already in.`,
  /**
   * What "Update all" says when it ends, or `null` when there is nothing to add to what each install said for itself:
   * one update that went in alone stays quiet. One passed over is always said, so the count never reads one short.
   */
  updatedAll(done: number, passed: readonly string[]): string | null {
    if (passed.length === 0) return done > 1 ? this.updated(done) : null;
    return done > 0 ? `${this.updated(done)} ${this.alreadyIn(passed)}` : this.alreadyIn(passed);
  },
  asked: 'Asked in Needs you. The owner reads the same plan there.',
  openDecide: 'Open it in Needs you',
  fromTo: (from: string, to: string) => `${from} to ${to}`,
  /* WHAT AN UPDATE'S ROW SAYS: the versions it moves between are in its tooltip, for whoever wants them. */
  updateAvailable: 'Update available',
  /* INSTALL FROM. */
  fromBlurb: 'A starter or a plugin somebody shared: a file, an https address, a file in a GitHub repository, or its text pasted in.',
  address: 'An https address, or a file in a GitHub repository',
  addressHint: 'BrainDog reads it, so a site that blocks browsers still works.',
  read: 'Read it',
  reading: 'Reading',
  paste: 'Or paste the text of the file',
  readPasted: 'Read the pasted text',
  tooBig: (kb: number) => `This file is ${kb} KB, and a shared file is at most 256 KB.`,
  gitNotOne: 'A git address reads git:owner/repo@ref:path, such as git:someone/kit@main:kit.usecase.json.',
  installed: (title: string) => `${title} is installed.`,
  /* SETTINGS › ADD-ONS IN FOUR PARTS: what waits on you, your starter, your add-ons, and BrainDog's own parts folded into
     one line. No row has a bare switch: turning one off is in its "⋯" and on its own page. */
  waitingTitle: 'Waiting on you',
  update: 'Update',
  /* AN UPDATE FROM OUTSIDE BRAINDOG ALWAYS ASKS, and BrainDog's own one waits here only when it would lose or newly reach something. */
  outsideAsks: 'Plugins from outside BrainDog always ask first.',
  yourStarter: (title: string) => `Your starter: ${title}`,
  starterTurnedOn: (names: readonly string[]) => `Turned on ${joined(names)}`,
  changeStarter: 'Change starter',
  shareStarter: 'Share as a file',
  yoursTitle: 'Your plugins',
  findAddons: 'Find plugins',
  partOf: 'Part of BrainDog',
  /* WHAT FOLLOWS THE NAMES, each name a link to its own page: "Projects, Work and Agents are always on and update themselves." */
  partOfTail: (n: number) => (n === 1 ? 'is always on and updates itself.' : 'are always on and update themselves.'),
  turnOff: 'Turn off',
  turnOn: 'Turn on',
  off: 'Off',
} as const;
