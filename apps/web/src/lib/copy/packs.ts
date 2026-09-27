/**
 * The words of add-ons and use cases: the catalogue, a pack's own page, sharing and installing a shared plan,
 * turning one off, and the exchange rates form on Money's settings.
 *
 * AN AREA FILE OF THE COPY AGGREGATE (ARC-8). `lib/copy.ts` spreads this object into `copy`, and every screen reads a
 * key here as `copy.<key>`. The house voice is written once, at the top of `copy.ts`. A word a screen in another
 * area also draws is in `shell.ts`, so that rewording it is nobody's edit to another area's screen.
 *
 * Plain Node loads this file through the aggregate (`passkey.mjs`), so it imports only relative `.ts` files.
 */

import { list } from './english.ts';

export const packs = {
  /* THE HOME CURRENCY PICKER AND THE EXCHANGE RATES FORM, on Money's settings (`routes/packs/[id]`). The form files a
     proposal like the poll form on a page (`pages.ts`), because a poll calls out on a clock and the owner approves the address once. */
  currencyNone: 'None chosen',
  currencyCommon: 'Common',
  currencyAll: 'All currencies',
  ratesHeading: 'Exchange rates, fetched every day',
  ratesWhy:
    'BrainDog can fetch what your currencies are worth from a public address once a day, so money in more than one currency adds up in your home currency. You approve the address once, on Decide, and nothing is fetched before that.',
  ratesSource: 'From',
  ratesCustom: 'Another address',
  ratesCoversOpenEr: 'About 160 currencies, most of the world’s, updated once a day. No key needed.',
  ratesCoversFrankfurter: 'The European Central Bank’s rates for about 30 currencies, on working days. Many smaller currencies are not among them. No key needed.',
  ratesCustomCovers: 'Any https address that answers JSON. Say which currency it quotes against and where each number is.',
  ratesBase: 'Quoted against',
  ratesBaseNote: (base: string) => `Each number in the answer says what one ${base} is worth in that currency.`,
  ratesCurrencies: 'Currencies to fetch',
  ratesCurrenciesNote: 'The currencies your money is in, and your home currency.',
  ratesAdd: 'Add a currency',
  ratesRemove: (code: string) => `Remove ${code}`,
  ratesFile: 'Propose these rates',
  ratesFaultBase: 'Choose the currency the address quotes against.',
  ratesFaultNone: 'Choose at least one currency other than the one the address quotes against.',
  ratesFaultCode: (code: string) => `${code || 'That'} is not a currency code.`,
  ratesFaultUnquoted: (name: string, codes: string) => `${name} does not quote ${codes}. Choose another address.`,
  ratesQuestion: (host: string, base: string, codes: string) => `Fetch ${host} every day for what one ${base} is worth in ${codes}?`,
  noPacksYet: 'No add-ons installed',
  noPacksBody: 'An add-on brings ready-made lists and pages. The ones below are ready to install.',
  /* The Vault's words are in `record/vault.ts`, which only its two routes load. */

  /* packs */
  installed: 'Installed',
  /* `The Kennel` IS A COINED NOUN DEFINED NOWHERE IN THE PRODUCT. It is a good name for the place
     and a bad heading for a list of things somebody has not met yet — `packBlurb` says what one is
     and sat unused two hundred lines from the screen that needed it. */
  browse: 'Add-ons you can install',
  /* THE OTHER HALF OF THIS SCREEN HAD AN EMPTY STATE AND THIS ONE DID NOT. Eleven lines above it
     the installed grid draws `noPacksYet`; here a record that has installed everything got the
     heading, a `0` and blank space where a list had been. `19 §6` names that exact failure, and
     the fix was one branch away in the same file. `cleared` rather than `no-data-yet`, because
     having them all is finishing rather than starting, and it carries no action: there is nothing
     for the reader to do about a list somebody else publishes to. */
  allInstalled: 'Nothing new to install',
  allInstalledWhy: 'Add-ons this record does not already have appear here, each with what it would add before you install it.',
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
  diffChanges: 'Changes',
  /* `04 §4`: a pack may place a page it owns and may never move yours. The move is SHOWN, so that
     the refusal is visible rather than silent, and then it does not happen. */
  diffNavKept: 'shown, not applied. Your sidebar is yours',
  diffUnread: 'This record has not read the add-on yet, so the details arrive when you install it.',
  /* THE SENTENCE UNDER THE TITLE. The screen was `Packs`, a word nobody brings with them; it is
     `Add-ons` now, the reader's word for an installable thing with an author. The API, the docs and
     the `mcp` surface keep `pack`. The sentence stays for what an add-on here is: text, not code. */
  packBlurb: 'An add-on brings ready-made lists and pages. It is readable text, and nothing in it runs.',

  /* USE CASES, SHARED AND INSTALLED (`loop/research-spark.md` S14). A use case is a file like an add-on, planned and
     approved the same way, so these sentences say what it arranges and never how the screen works. */
  useCases: 'Use cases',
  useCasesBlurb: 'A use case arranges a BrainDog for one kind of work: its lists, its pages, its rail and its words.',
  browseUseCases: 'Browse use cases',
  /* BROWSE LISTS BOTH: the built-in use cases, and the use cases and add-ons this BrainDog's catalogue serves. */
  browseTitle: 'Use cases and add-ons',
  browseAll: 'All use cases and add-ons',
  installFromFile: 'Install from a file',
  chooseFile: 'Choose a file',
  shareAddress: 'Or an https address',
  readAddress: 'Read it',
  shareReading: 'Reading',
  shareAddressNotOne: 'That is not a web address. Paste the whole https address of the file.',
  shareAddressHttps: 'A use case is read only from an https address.',
  shareTooBig: (kb: number) => `This file is ${kb} KB, and a shared use case is at most 256 KB.`,
  shareConflict: (name: string, pack: string) => `${name} is already held by ${pack}, so this cannot be installed beside it.`,
  shareStale: 'Something changed since the plan was read, so it has been read again. Look it over, then install.',
  sharePlanTitle: (title: string, version: string) => `${title} ${version}`,
  /** A page drawn once for every row of a list, whose title is the row's own. */
  sharePageEach: (one: string) => `A page for each ${one}`,
  shareBy: (author: string) => `By ${author}`,
  shareInstallsFirst: 'Installs first',
  shareTurnsOn: 'Turns on',
  shareUpdates: (from: string, to: string) => `Updates from ${from} to ${to}`,
  shareSameVersion: 'This version is already installed, so nothing is added.',
  shareNothingElse: 'Nothing else changes',
  shareRelabelFor: (title: string) => `Update for ${title}`,
  shareRelabel: (modules: string[], title: string) => `Update ${list(modules)} to ${title}'s words and targets`,
  shareChanges: 'Changes',
  shareTakesAway: 'Takes away',
  shareInstall: (title: string) => `Install ${title}`,
  shareUpdate: (title: string) => `Update ${title}`,
  shareInstalled: (title: string) => `${title} is installed.`,
  shareKept: (fix: string, names: string[]) => `${fix} Already installed, and kept: ${list(names)}.`,
  switchTo: (title: string) => `Switch to ${title}`,
  switchedTo: (title: string) => `This BrainDog is now set up as ${title}.`,
  inUse: 'In use',
  /* A SECOND USE CASE ASKS WHOSE VOICE THE RECORD KEEPS, as onboarding and an arrangement say it, and the person picks. */
  voiceAsk: 'Voice and Home',
  voiceKeep: (now: string, adding: string) => `Keep ${now}'s voice and Home, and add ${adding} beside it`,
  voiceTake: (now: string, adding: string) => `Speak as ${adding}, with its own Home. ${now}'s lists stay`,
  updateTo: (version: string) => `Update to ${version}`,
  browseRail: 'Rail',
  browseHome: 'Home',
  browseLists: 'Lists',
  browseHouseHome: 'The house Home',
  browseNoRail: 'Nothing added to the rail',
  browseBuildsOn: (names: string[]) => `Builds on ${list(names)}`,
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
  browseDetails: 'Details',
  useCaseFor: 'What it is for',
  useCaseTone: (tone: string) => `Speaks ${tone}.`,
  useCaseVersion: (version: string, author: string, license: string) => `Version ${version}, by ${author}, ${license} licence`,
  useCaseInstalls: 'What installing it adds',
  useCaseModulesFirst: 'Modules first',
  useCasePages: 'Pages',
  useCaseExamples: (n: number) => (n === 0 ? 'No example rows' : `${n} example ${n === 1 ? 'row' : 'rows'}, marked as examples`),
  useCaseNothingOwn: 'Nothing of its own: the modules above, in the house voice.',
  useCaseVoice: 'How it speaks',
  useCaseVoiceHouse: 'In the house voice, unchanged.',
  useCaseSkills: 'Skills it suggests to your agents',
  useCaseMissing: 'There is no use case with that name here',
  /* A CATALOGUE THIS BRAINDOG SERVES (`routes/packs/browse/catalogue.ts`): said as what it is, never as the add-on index. */
  catalogueHeading: "From this BrainDog's catalogue",
  catalogueBlurb:
    "Use cases and add-ons published to a folder this BrainDog serves. They are not from the add-on index. Each file is held to the checksum the catalogue lists and to its author's signature when it has one, then planned for you to approve on Decide.",
  catalogueAddon: 'Add-on',
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
  catalogueAsk: 'Ask on Decide',
  catalogueAskUpdate: (version: string) => `Ask on Decide to update to ${version}`,
  catalogueQuestion: (title: string, to: string, from: string | null, keyId: string | null) =>
    `${from ? `Update ${title} from ${from} to ${to}` : `Install ${title} ${to}`} from this BrainDog's catalogue? ${keyId ? `It is signed by key ${keyId}.` : 'Nobody signed it.'}`,
  catalogueAsked: 'Asked. It installs only when you approve it on Decide.',
  catalogueUpdatesHeading: "Updates from this BrainDog's catalogue",
  catalogueFromTo: (from: string, to: string) => `${from} to ${to}`,
  catalogueChangedGone: 'The catalogue no longer holds the version installed here, so only the plan on Decide can say what changes.',
  catalogueAdds: (lists: number, pages: number) => `Adds ${lists} ${lists === 1 ? 'list' : 'lists'} and ${pages} ${pages === 1 ? 'page' : 'pages'}`,
  catalogueCallsNothing: 'Calls out to nothing. It reads and writes only this record.',
  catalogueCallsOut: (hosts: string[]) => `Calls out to ${list(hosts)}`,
  catalogueReach: 'What it can reach',
  catalogueRules: 'Rules',
  catalogueVersions: 'Versions',
  catalogueBump: { major: 'Takes something away', minor: 'Adds something', patch: 'Changes details' } as Record<string, string>,
  catalogueFirst: 'First version',
  cataloguePublished: (day: string, sum: string) => `Published ${day} · checksum ${sum.slice(0, 12)}`,
  catalogueCurrent: (version: string) => `Version ${version} is installed.`,
  catalogueAhead: (at: string) => `This BrainDog holds ${at}, later than this catalogue's latest.`,
  catalogueOff: 'Installed and turned off. Turn it on from Add-ons.',
  catalogueChanged: (from: string, to: string) => `What changed from ${from} to ${to}`,
  catalogueChangedUnknown: 'The version installed here is not in this catalogue, so the plan is the whole comparison.',
  catalogueRemoved: 'Takes away',
  catalogueAltered: 'Changes',
  catalogueHostsNew: 'Calls out to, newly',
  catalogueHostsGone: 'No longer calls out to',
  catalogueModulesNew: 'Installs first, newly',
  catalogueWords: 'Its words, voice or labels differ.',
  catalogueNothing: 'Nothing else differs.',
  uninstalled: (pack: string) => `${pack} is uninstalled. Its rows stay, and installing it again within 30 days brings back its settings and schedules.`,
  packInstalledNamed: (pack: string) => `${pack} is installed.`,
  packNotInstallable: (pack: string) => `${pack} cannot be installed on this record yet, so nothing was changed.`,
  packPlanning: 'Reading what this adds',
} as const;
