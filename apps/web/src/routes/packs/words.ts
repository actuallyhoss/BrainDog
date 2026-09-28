/**
 * The words `/packs` draws that no other screen does (`loop/finish/rules.md` §2: a unit's own `words` object): its three
 * tabs, the Updates list and "Install from…". What it shares with browse and share, a refusal's code line and the
 * catalogue's trust sentences, stays in `lib/copy/packs.ts`.
 *
 * PLAIN NODE LOADS THIS FILE, because `sharing.ts` reads it and a test reads `sharing.ts`.
 */

export const words = {
  tabsLabel: 'Add-ons',
  tabs: { installed: 'Installed', updates: 'Updates', from: 'Install from…' },
  browse: 'Browse add-ons',
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
  /* INSTALL FROM. */
  fromBlurb: 'A use case or an add-on somebody shared: a file, an https address, a file in a GitHub repository, or its text pasted in.',
  address: 'An https address, or git:owner/repo@ref:path',
  addressHint: 'The host reads it, so a site that blocks browsers still works.',
  read: 'Read it',
  reading: 'Reading',
  paste: 'Or paste the text of the file',
  readPasted: 'Read the pasted text',
  tooBig: (kb: number) => `This file is ${kb} KB, and a shared file is at most 256 KB.`,
  gitNotOne: 'A git address reads git:owner/repo@ref:path, such as git:someone/kit@main:kit.usecase.json.',
  installed: (title: string) => `${title} is installed.`,
} as const;
