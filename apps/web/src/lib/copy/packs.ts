/**
 * The words of add-ons and use cases: the catalogue, a pack's own page, sharing and installing a shared plan,
 * turning one off, and the way into exchange rates on Money's settings.
 *
 * AN AREA FILE OF THE COPY AGGREGATE (ARC-8). `lib/copy.ts` spreads this object into `copy`, and every screen reads a
 * key here as `copy.<key>`. The house voice is written once, at the top of `copy.ts`. A word a screen in another
 * area also draws is in `shell.ts`, so that rewording it is nobody's edit to another area's screen.
 *
 * Plain Node loads this file through the aggregate (`passkey.mjs`), so it imports only relative `.ts` files.
 */

import { list } from './english.ts';

export const packs = {
  /* THE HOME CURRENCY PICKER AND THE WAY INTO EXCHANGE RATES, on Money's settings (`routes/packs/[id]`). Rates are a
     preset of the new-action sheet (USE-5), so the words of the sheet itself are `actionWords` in `action-draft.ts`. */
  currencyNone: 'None chosen',
  currencyCommon: 'Common',
  currencyAll: 'All currencies',
  ratesHeading: 'Exchange rates, fetched every day',
  ratesWhy:
    'BrainDog can fetch what a currency is worth from a public address once a day, so money in more than one currency adds up in your home currency. Set up one for each currency your money is in.',
  ratesSetUp: 'Set up exchange rates',
  noPacksYet: 'No add-ons installed',
  /* The Vault's words are in `record/vault.ts`, which only its two routes load. */

  /* packs */
  uninstall: 'Uninstall',
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
    `${list(names)} ${names.length === 1 ? 'is' : 'are'} turned off and out of the sidebar. The rows are kept.`,
  packNeededBy: (names: string[]) => `Needed by ${list(names)}`,
  packOffTogether: (others: number) => (others === 1 ? 'Turn both off' : `Turn all ${others + 1} off`),
  packIsOff: (name: string) => `${name} is off`,
  packTurnOn: (name: string) => `Turn on ${name}`,
  packScopesInUse: (names: string[]) => `Its projects are still used by ${list(names)}`,
  packNothingToSet: 'This add-on has nothing to set',
  packNotInstalled: (id: string) => `There is no add-on called ${id} on this record`,
  packNotInstalledWhy: 'Add-ons shows the ones this record has, and the ones it could add.',
  packNothingToSetWhy: 'It adds the lists and pages below, and nothing about it needs choosing.',
  /* THE SENTENCE UNDER THE TITLE. The screen was `Packs`, a word nobody brings with them; it is
     `Add-ons` now, the reader's word for an installable thing with an author. The API, the docs and
     the `mcp` surface keep `pack`. It says what an add-on brings, which is also what fills the screen while none is
     installed. "It is readable text, and nothing in it runs" was a sentence about how an add-on is built, and a person
     choosing one is asking what they get (MOD-24). */
  packBlurb: 'An add-on brings ready-made lists and pages.',

  /* USE CASES, SHARED AND INSTALLED (`loop/research-spark.md` S14). A use case is a file like an add-on, planned and
     approved the same way, so these sentences say what it arranges and never how the screen works. */
  /* BROWSE LISTS BOTH: the built-in use cases, and the use cases and add-ons this BrainDog's catalogue serves. */
  browseTitle: 'Use cases and add-ons',
  browseAll: 'All use cases and add-ons',
  chooseFile: 'Choose a file',
  shareAddressNotOne: 'That is not a web address. Paste the whole https address of the file.',
  shareAddressHttps: 'A use case is read only from an https address.',
  shareConflict: (name: string, pack: string) => `${name} is already held by ${pack}, so this cannot be installed beside it.`,
  shareStale: 'Something changed since the plan was read, so it has been read again. Look it over, then install.',
  /** A page drawn once for every row of a list, whose title is the row's own. */
  sharePageEach: (one: string) => `A page for each ${one}`,
  shareRelabel: (modules: string[], title: string) => `Update ${list(modules)} to ${title}'s words and targets`,
  shareInstalled: (title: string) => `${title} is installed.`,
  shareKept: (fix: string, names: string[]) => `${fix} Already installed, and kept: ${list(names)}.`,
  switchedTo: (title: string) => `This BrainDog is now set up as ${title}.`,
  /* A SECOND USE CASE ASKS WHOSE VOICE THE RECORD KEEPS, as onboarding and an arrangement say it, and the person picks. */
  voiceAsk: 'Voice and Home',
  voiceKeep: (now: string, adding: string) => `Keep ${now}'s voice and Home, and add ${adding} beside it`,
  voiceTake: (now: string, adding: string) => `Speak as ${adding}, with its own Home. ${now}'s lists stay`,
  browseRail: 'Rail',
  browseHome: 'Home',
  browseLists: 'Lists',
  browseHouseHome: 'The house Home',
  browseNoRail: 'Nothing added to the rail',
  shareWhat: "The file carries this BrainDog's modules, its lists and pages, its rail, its voice and its labels. None of your rows go in unless you pick them here.",
  shareNoUseCase: 'No use case is on here, so the file carries the modules that are on and the pages you placed.',
  shareTitle: 'Title',
  shareVersion: 'Version',
  shareSummary: 'What it is for',
  shareAudience: 'Who it is for',
  shareAudiences: { individual: 'One person', founder: 'A founder', team: 'A team', starter: 'Starting something', other: 'Anybody' },
  shareExamples: 'Example rows',
  shareExamplesNone: 'No rows are picked, so none go in.',
  shareExamplesPicked: (n: number) => `${n} ${n === 1 ? 'row' : 'rows'} picked, shared as examples.`,
  shareExamplesMost: 'Up to eight from each list.',
  shareNoRows: 'Nothing in this list yet.',
  shareDownload: 'Download the file',
  shareDownloaded: (file: string, n: number) =>
    n === 0 ? `${file} is saved, with no rows of yours in it.` : `${file} is saved, with ${n} example ${n === 1 ? 'row' : 'rows'}.`,
  shareStep: 'What changed since it was last shared',
  shareStepPatch: 'Words, rows or small fixes',
  shareStepMinor: 'A list or a page added',
  shareLastShared: (version: string) => `Last shared as ${version}.`,
  shareExtras: 'Also in the file',
  shareSignals: (words: string[]) => `The words that suggest it, so a new BrainDog can recognise it: ${list(words)}`,
  shareSkills: 'Skills, each as its name and when to use it. Their text stays here.',
  shareNoSkills: 'No skills to share yet.',
  shareRailOrder: 'The order of your pages and lists in the rail goes in too, and is used on the BrainDog that installs it.',
  refusalCode: (code: string) => `Refusal code ${code}`,
  useCaseFor: 'What it is for',
  /* THE KENNEL'S TRUST LINES (`routes/packs/browse/catalogue.ts`), said the same on browse and on /packs. */
  catalogueSigned: (keyId: string) => `Signed by key ${keyId}`,
  catalogueUnsigned: 'Not checked',
  catalogueTrustUnsigned: 'Nobody signed this version, so nothing but the catalogue says who published it.',
  catalogueTrustStripped: (author: string, before: string[]) =>
    `Nobody signed this version, and ${author}'s earlier versions were signed by key ${before.join(', ')}. A catalogue does not publish an unsigned version after a signed one, so this may not be from ${author}. It cannot be asked for.`,
  catalogueTrustFirst: (author: string) => `This browser has not seen a key for ${author} before. It keeps this one when you ask on Decide, and will say so if a later version is signed by a different key.`,
  catalogueTrustKnown: (author: string) => `This browser has seen this key for ${author} before.`,
  catalogueTrustChanged: (author: string, before: string[]) =>
    `This is not the key this browser has seen for ${author} before (${list(before)}). Somebody other than ${author} may have signed it. Check with ${author} before you ask for it.`,
  catalogueTrustRotated: (author: string, from: string) => `This is a new key for ${author}. Key ${from}, the one this browser has seen for ${author}, signed a statement naming it as its successor.`,
  catalogueTrustRevoked: (author: string, reason: string) => `${author} revoked the key that signed this version, so it is not trusted and cannot be asked for. Their reason: ${reason}`,
  catalogueQuestion: (title: string, to: string, from: string | null, keyId: string | null) =>
    `${from ? `Update ${title} from ${from} to ${to}` : `Install ${title} ${to}`} from this BrainDog's catalogue? ${keyId ? `It is signed by key ${keyId}.` : 'Nobody signed it.'}`,
  uninstalled: (pack: string) => `${pack} is uninstalled. Its rows stay, and installing it again within 30 days brings back its settings and schedules.`,
  packNotInstallable: (pack: string) => `${pack} cannot be installed on this record yet, so nothing was changed.`,
} as const;
