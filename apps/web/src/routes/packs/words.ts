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
  tabs: { installed: 'Installed', updates: 'Updates', from: 'Install from…' },
  browse: 'Browse add-ons',
  /* THE TITLE ROW'S SENTENCE. An update is never urgent, so no phrase in it is red. `updates` is `null`
     while the newer versions are still being looked for, and the sentence then says only what is installed. */
  sentence: (installed: number, updates: number | null): string => {
    const head = counted(installed, 'add-on installed', 'add-ons installed');
    if (installed === 0) return '';
    if (updates === null) return `${head}.`;
    if (updates === 0) return installed === 1 ? `${head}, and it is up to date.` : `${head}, and every one is up to date.`;
    return `${head}, and ${updates.toLocaleString('en-GB')} ${updates === 1 ? 'has an update' : 'have an update'}.`;
  },
  /* WHAT THE INSTALLED ADD-ONS HOLD, the tile over the list: its parts on the chart, then the one line reading it. */
  holdsTitle: 'What your add-ons hold',
  holdsLists: (n: number) => counted(n, 'list', 'lists'),
  holdsPages: (n: number) => counted(n, 'page', 'pages'),
  holdsRules: (n: number) => counted(n, 'rule', 'rules'),
  holds: (parts: readonly string[], alone: boolean, largest: string | null): string =>
    alone
      ? `It keeps ${joined(parts)}.`
      : `Between them they keep ${joined(parts)}${largest ? `; ${largest} is the largest` : ''}.`,
  /* THE LIST'S OWN HEADING, and the updates' when that tab is open. */
  installedTitle: 'Installed',
  updatesTitle: 'Updates',
  /* UPDATES. */
  updatesNone: 'Everything is up to date',
  updatesNoneBody: 'A newer version of anything installed here shows up in this list, with its plan.',
  updatesReading: 'Looking for newer versions',
  seePlan: 'See the plan',
  planning: 'Reading the plan',
  updateAll: 'Update all',
  updated: (n: number) => (n === 1 ? '1 add-on is updated.' : `${n} add-ons are updated.`),
  asked: 'Asked on Decide. The owner reads the same plan there.',
  openDecide: 'Open it on Decide',
  fromTo: (from: string, to: string) => `${from} to ${to}`,
  /* WHAT AN UPDATE'S ROW SAYS: the versions it moves between are in its tooltip, for whoever wants them. */
  updateAvailable: 'Update available',
  /* INSTALL FROM. */
  fromBlurb: 'A use case or an add-on somebody shared: a file, an https address, a file in a GitHub repository, or its text pasted in.',
  address: 'An https address, or a file in a GitHub repository',
  addressHint: 'The host reads it, so a site that blocks browsers still works.',
  read: 'Read it',
  reading: 'Reading',
  paste: 'Or paste the text of the file',
  readPasted: 'Read the pasted text',
  tooBig: (kb: number) => `This file is ${kb} KB, and a shared file is at most 256 KB.`,
  gitNotOne: 'A git address reads git:owner/repo@ref:path, such as git:someone/kit@main:kit.usecase.json.',
  installed: (title: string) => `${title} is installed.`,
} as const;
