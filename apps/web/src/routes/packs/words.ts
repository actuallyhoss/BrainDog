/**
 * The words `/packs` draws that no other screen does (a unit's own `words` object): its three
 * tabs, the Updates list and "Install from…". What it shares with browse and share, a refusal's code line and the
 * catalogue's trust sentences, stays in `lib/copy/packs.ts`.
 *
 * PLAIN NODE LOADS THIS FILE, because `sharing.ts` reads it and a test reads `sharing.ts`.
 */

/** "a", "a and b", "a, b and c". */
const joined = (parts: readonly string[]): string =>
  parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;

const counted = (n: number, one: string, many: string): string => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

export const words = {
  tabsLabel: 'Add-ons',
  /* TWO HALVES OF ONE PLACE (agents F8, F9): what is in, and what there is to add. Updates sit at the top of Installed
     while there are any, and installing from a file or a link is in the page's "⋯". */
  tabs: { installed: 'Installed', browse: 'Browse' },
  browse: 'Browse add-ons',
  more: 'More',
  from: 'Install from a file or link',
  fromDone: 'Done',
  /* THE TITLE ROW'S SENTENCE. An update is never urgent, so no phrase in it is red. `updates` is `null`
     while the newer versions are still being looked for, and the sentence then says only what is installed. */
  sentence: (installed: number, updates: number | null): string => {
    const head = counted(installed, 'add-on installed', 'add-ons installed');
    if (installed === 0) return '';
    if (updates === null) return `${head}.`;
    if (updates === 0) return installed === 1 ? `${head}, and it is up to date.` : `${head}, and every one is up to date.`;
    return `${head}, and ${updates.toLocaleString('en-GB')} ${updates === 1 ? 'has an update' : 'have an update'}.`;
  },
  /* WHAT ONE ADD-ON HOLDS, on its own row (agents F22): "12 lists, 4 pages, 9 rules", each kind it holds none of left
     out. It was one bar summing lists, pages and rules, three units that do not add. */
  holds: (h: { lists: number; pages: number; rules: number }): string =>
    [
      h.lists > 0 ? counted(h.lists, 'list', 'lists') : '',
      h.pages > 0 ? counted(h.pages, 'page', 'pages') : '',
      h.rules > 0 ? counted(h.rules, 'rule', 'rules') : '',
    ]
      .filter((p) => p !== '')
      .join(', '),
  /* THE LIST'S OWN HEADING, and the updates' when that tab is open. */
  installedTitle: 'Installed',
  updatesTitle: 'Updates',
  /* UPDATES, at the top of Installed while there are any. */
  seePlan: 'See the plan',
  planning: 'Reading the plan',
  updateAll: 'Update all',
  updated: (n: number) => (n === 1 ? '1 add-on is updated.' : `${n} add-ons are updated.`),
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
  fromBlurb: 'A use case or an add-on somebody shared: a file, an https address, a file in a GitHub repository, or its text pasted in.',
  address: 'An https address, or a file in a GitHub repository',
  addressHint: 'BrainDog reads it, so a site that blocks browsers still works.',
  read: 'Read it',
  reading: 'Reading',
  paste: 'Or paste the text of the file',
  readPasted: 'Read the pasted text',
  tooBig: (kb: number) => `This file is ${kb} KB, and a shared file is at most 256 KB.`,
  gitNotOne: 'A git address reads git:owner/repo@ref:path, such as git:someone/kit@main:kit.usecase.json.',
  installed: (title: string) => `${title} is installed.`,
} as const;
