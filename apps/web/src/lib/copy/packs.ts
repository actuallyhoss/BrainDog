/**
 * The words of add-ons and use cases: the catalogue, a pack's own page, sharing and installing a shared plan,
 * turning one off, and the way into exchange rates on Money's settings.
 *
 * AN AREA FILE OF THE COPY AGGREGATE. `lib/copy.ts` spreads this object into `copy`, and every screen reads a
 * key here as `copy.<key>`. The house voice is written once, at the top of `copy.ts`. A word a screen in another
 * area also draws is in `shell.ts`, so that rewording it is nobody's edit to another area's screen.
 *
 * Plain Node loads this file through the aggregate (`passkey.mjs`), so it imports only relative `.ts` files.
 */

import { list } from './english.ts';

export const packs = {
  /* THE HOME CURRENCY PICKER AND THE WAY INTO EXCHANGE RATES, on Money's settings (`routes/packs/[id]`). Rates are a
     preset of the new-action sheet, so the words of the sheet itself are `actionWords` in `action-draft.ts`.
     `ratesWhy` SAYS ONE ACTION, because the preset is one poll for every currency the record holds (`ratesPreset`),
     and opening it again replaces that poll. It said to set up one for each currency, which made two of them. */
  currencyNone: 'None chosen',
  currencyCommon: 'Common',
  currencyAll: 'All currencies',
  ratesHeading: 'Exchange rates, fetched every day',
  ratesWhy: 'Fetched once a day from a public address, so money in other currencies adds up in your home currency.',
  ratesKeep: 'Keep rates current',
  ratesTurnedOff: 'Exchange rates are no longer fetched. Turn it on again to bring them back.',
  noPacksYet: 'No plugins installed',
  /* The Keychain's words are in `record/keychain.ts`, which only its two routes load. */

  /* packs */
  uninstall: 'Uninstall',
  /* REMOVE WITH ITS DATA (phase 8): asked once, in a line under the head, with where the entries go and the way back. */
  removeWithData: 'Remove with its data',
  removeWithDataAsk: (pack: string) =>
    `Remove ${pack} and its entries? Everything in its own lists goes to the bin and its web address stops working. Your other lists stay as they are. Install it again within 30 days and its entries come back.`,
  removeWithDataYes: 'Remove it and its entries',
  removeWithDataNo: 'Keep it',
  removedWithData: (pack: string, n: number) =>
    `${pack} is removed and ${n === 1 ? 'its 1 entry is' : `its ${n.toLocaleString('en-GB')} entries are`} in the bin. Install it again within 30 days to bring ${n === 1 ? 'it' : 'them'} back.`,
  /* TURNING ONE OFF. An add-on that is off stays on the screen, dimmed and labelled, because its
     rows are still in the record. A refused switch says who leans on it and offers the cascade as a
     second press, never as a side effect of the first. */
  packTurnedOff: 'Turned off',
  packSwitch: (name: string) => `${name}, on or off`,
  /* UNINSTALL IS UNDONE, NOT ASKED. The kernel keeps what the pack row and its schedules held for thirty days, and an
     install inside that window puts them back and plants no second set of examples, so Undo is installing it again. */
  reinstalled: (pack: string) => `${pack} is back, with its settings and schedules.`,
  reinstallApprove: (pack: string) => `${pack} calls other services. Approve what it calls out below to install it again.`,
  /* TURNING OFF IS UNDONE, because turning back on is the same kernel call over the same rows. */
  packTurnedOffNamed: (names: string[]) =>
    `${list(names)} ${names.length === 1 ? 'is' : 'are'} turned off and out of the sidebar. What they held is kept.`,
  packNeededBy: (names: string[]) => `Needed by ${list(names)}`,
  packOffTogether: (others: number) => (others === 1 ? 'Turn both off' : `Turn all ${others + 1} off`),
  packIsOff: (name: string) => `${name} is off`,
  packTurnOn: (name: string) => `Turn on ${name}`,
  packScopesInUse: (names: string[]) => `Its projects are still used by ${list(names)}`,
  packNothingToSet: 'This plugin has nothing to set',
  packNotInstalled: (id: string) => `There is no plugin called ${id} here`,
  packNotInstalledWhy: 'Plugins shows the ones you have, and the ones you could add.',
  packNothingToSetWhy: 'It adds the lists and pages below, and nothing about it needs choosing.',
  /* THE SENTENCE UNDER THE TITLE. The screen was `Packs`, a word nobody brings with them; it is
     `Plugins` now, the reader's word for an installable thing with an author. The API, the docs and
     the `mcp` surface keep `pack`. It says what an add-on brings, which is also what fills the screen while none is
     installed. "It is readable text, and nothing in it runs" was a sentence about how an add-on is built, and a person
     choosing one is asking what they get. */
  packBlurb: 'A plugin brings ready-made lists and pages.',

  /* USE CASES, SHARED AND INSTALLED. A use case is a file like an add-on, planned and
     approved the same way, so these sentences say what it arranges and never how the screen works. */
  browseAll: 'All starters and plugins',
  chooseFile: 'Choose a file',
  shareAddressNotOne: 'That is not a web address. Paste the whole https address of the file.',
  shareAddressHttps: 'A starter is read only from an https address.',
  shareConflict: (name: string, pack: string) => `${name} is already held by ${pack}, so this cannot be installed beside it.`,
  shareStale: 'Something changed since the plan was read, so it has been read again. Look it over, then install.',
  /** A page drawn once for every row of a list, whose title is the row's own. */
  sharePageEach: (one: string) => `A page for each ${one}`,
  shareRelabel: (modules: string[], title: string) => `Update ${list(modules)} to ${title}'s words and targets`,
  shareInstalled: (title: string) => `${title} is installed.`,
  shareKept: (fix: string, names: string[]) => `${fix} Already installed, and kept: ${list(names)}.`,
  switchedTo: (title: string) => `This BrainDog is now set up as ${title}.`,
  /* A SECOND USE CASE ASKS WHOSE VOICE THE RECORD KEEPS, as onboarding and an arrangement say it, and the person picks. */
  voiceAsk: 'Voice and Today',
  voiceKeep: (now: string, adding: string) => `Keep ${now}'s voice and Today, and add ${adding} beside it`,
  voiceTake: (now: string, adding: string) => `Speak as ${adding}, with its own Today. ${now}'s lists stay`,
  browseRail: 'Menu',
  browseHome: 'Today',
  browseLists: 'Lists',
  browseNoRail: 'Nothing added to the menu',
  shareTitle: 'Title',
  shareVersion: 'Version',
  shareSummary: 'What it is for',
  shareSummaryHint: 'One line, like: a starting set for a solo founder',
  shareAudience: 'Who it is for',
  shareAudienceHint: 'Pick one or type your own',
  shareAudiences: { individual: 'One person', founder: 'A founder', team: 'A team', starter: 'Starting something', other: 'Anybody' },
  shareExamples: 'Examples',
  shareExamplesNone: 'Nothing picked, so none of yours goes in.',
  shareExamplesPicked: (n: number) => `${n} picked, shared as examples.`,
  shareExamplesMost: 'Up to eight from each list.',
  shareNoRows: 'Nothing in this list yet.',
  shareDownload: 'Download the file',
  shareDownloaded: (file: string, n: number) =>
    n === 0 ? `${file} is saved, with nothing of yours in it.` : `${file} is saved, with ${n} ${n === 1 ? 'example' : 'examples'}.`,
  shareStep: 'What changed since it was last shared',
  shareStepPatch: 'Words, examples or small fixes',
  shareStepMinor: 'A list or a page added',
  shareFromInstalled: (version: string) => `Counted on from ${version}, the version installed.`,
  shareFirstVersion: 'First version.',
  shareLastShared: (version: string) => `Last shared as ${version}.`,
  shareNoSkills: 'No skills to share yet.',
  shareRailOrder: 'Your menu order goes in too.',
  /* THE CODE IS A TOOLTIP ON THE SENTENCE, never words on the screen: the sentence is what a person reads, and the code
     is what they quote to somebody who can look it up. */
  refusalCode: (code: string) => `Reference: ${code}`,
  useCaseFor: 'What it is for',
  /* A PLUGIN'S SECOND WAY IN, folded under the Google card while Connect Google is offered. */
  connectOther: 'Or set it up by hand instead',
  /* THE KENNEL'S TRUST LINES (`routes/packs/browse/catalogue.ts`), said the same on browse and on /packs. */
  catalogueSigned: (keyId: string) => `Signed by key ${keyId}`,
  catalogueUnsigned: 'Not checked',
  catalogueTrustUnsigned: 'Nobody signed this version, so nothing but the catalogue says who published it.',
  catalogueTrustStripped: (author: string, before: string[]) =>
    `Nobody signed this version, and ${author}'s earlier versions were signed by key ${before.join(', ')}. A catalogue does not publish an unsigned version after a signed one, so this may not be from ${author}. It cannot be asked for.`,
  catalogueTrustFirst: (author: string) => `This browser has not seen a key for ${author} before. It keeps this one when you ask in Needs you, and will say so if a later version is signed by a different key.`,
  catalogueTrustKnown: (author: string) => `This browser has seen this key for ${author} before.`,
  catalogueTrustChanged: (author: string, before: string[]) =>
    `This is not the key this browser has seen for ${author} before (${list(before)}). Somebody other than ${author} may have signed it. Check with ${author} before you ask for it.`,
  catalogueTrustRotated: (author: string, from: string) => `This is a new key for ${author}. Key ${from}, the one this browser has seen for ${author}, signed a statement naming it as its successor.`,
  catalogueTrustRevoked: (author: string, reason: string) => `${author} revoked the key that signed this version, so it is not trusted and cannot be asked for. Their reason: ${reason}`,
  catalogueQuestion: (title: string, to: string, from: string | null, keyId: string | null) =>
    `${from ? `Update ${title} from ${from} to ${to}` : `Install ${title} ${to}`} from this BrainDog's catalogue? ${keyId ? `It is signed by key ${keyId}.` : 'Nobody signed it.'}`,
  uninstalled: (pack: string) => `${pack} is uninstalled. What it held stays, and installing it again within 30 days brings back its settings and schedules.`,
  packNotInstallable: (pack: string) => `${pack} cannot be installed here yet, so nothing was changed.`,
} as const;
