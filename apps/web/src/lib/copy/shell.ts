/**
 * The frame's words, and every word more than one area draws.
 *
 * AN AREA FILE OF THE COPY AGGREGATE. `lib/copy.ts` spreads this object into `copy`, and every screen reads a
 * key here as `copy.<key>`, exactly as it did while the whole of `copy` was one object in one file. The house voice
 * is written once, at the top of `copy.ts`, and holds here as it does in every area file.
 *
 * THE FRAME IS THE RAIL, THE TOP BAR, THE TAB BAR, THE KEY SHEET AND THE ERROR PAGE (the web shell), and their words
 * are here.
 *
 * AND A SENTENCE TWO AREAS DRAW IS HERE, IN NO AREA'S OWN FILE. `tryAgain`, `noSuch`, `recordNotReached`, the
 * poll form's labels that the exchange rates form reuses, and the rest: rewording one of them changes a screen in
 * each area at once, so it belongs to no one area's owner. A key moves into an area's file the day only that
 * area's screens draw it.
 *
 * Plain Node loads this file through the aggregate (`passkey.mjs`), so it imports only relative `.ts` files.
 */

import { list } from './english.ts';

/**
 * One thing a refusal can list: the address somebody types, and the name they know it by.
 *
 * A BARE STRING IS AN ADDRESS AND NOT A NAME, which is the direction that matters. Every caller of
 * `theseExist` compiled before this type existed, so a screen still handing it titles is a screen
 * this type cannot catch; what it can do is make the address the only thing an entry is required to
 * carry, so the next one written cannot offer a name alone.
 */
export type Held = string | { address: string; title?: string };

/**
 * A word with its case and its separators taken off, for asking whether two of them are the same
 * word. `Agent work` and `agent-work` are; `installments` and `Instalments` are not, and that is
 * exactly the pair a reader has to be shown both halves of.
 */
const folded = (said: string): string => said.toLowerCase().replace(/[^a-z0-9]+/gu, '');

/**
 * THE SENTENCE TYPED ONCE AND NAMED TWICE, because two keys over one string is how a sentence
 * drifts into two.
 *
 * The rule at the top of `copy.ts` is that a sentence is typed in one place, and the check for it is
 * a reader's eye. A scan of the copy's own literals found two full sentences typed out twice: this
 * one, and `updatesTo` in `decide.ts`. Both pairs are pairs for a reason that is not going away: each
 * key has its own call sites and its own lane, so neither can be deleted without editing the screens
 * that name it.
 *
 * `notReached` IS A REFUSAL, WHICH MAKES IT THE MOST-READ PROSE THIS PRODUCT HAS. `recordNotReached`
 * is lanes C and D (inbox writes, page-row writes, settings, the catalogue) and `writeNotReached` is
 * lane A (row writes, the grid, `/start`): twelve call sites and five, outside the tests. They were
 * two identical literals eight lines apart. Editing one and not the other gives a product describing
 * the same dead network two ways depending on which control you pressed, and nothing would have
 * caught it: both keys are rendered, so `dead-copy` is content and the tests assert against the key
 * rather than the words.
 */
const notReached = 'The record could not be reached, so nothing was saved. Try again in a moment.';

export const shell = {
  /* the product */
  product: 'BrainDog',

  /* the spine */
  home: 'Home',
  decide: 'Needs you',
  inbox: 'Inbox',
  /* The rail's heading for the registers, hard-coded there and needed by the phone nav too. `Your things` AND IT WAS
     `Lists`: what sits under it is the person's invoices and tasks, and "list" is how the record stores them (§35). */
  lists: 'Your things',
  packs: 'Add-ons',
  vault: 'Vault',
  settings: 'Settings',
  /* ACTIVITY, AND IT WAS HISTORY: the owner's old tool called the same screen Activity, and it is a row of the flat nav now. */
  audit: 'Activity',
  automations: 'Automations',
  /* The Jobs screen, named in the rail and in the phone's More sheet. */
  jobs: 'Jobs',
  more: 'More',
  close: 'Close',
  arrangeCancel: 'Cancel',
  moveUp: 'Move up',
  moveDown: 'Move down',
  /* HIDING A PAGE AND BRINGING IT BACK, which Settings, Navigation does since the rail became one flat list with no
     menu of its own on each row. */
  hiddenCount: (n: number) => (n === 1 ? '1 page hidden' : `${n} pages hidden`),
  showHidden: 'Show',

  /* Putting a saved view onto a page. `21 §3.4`'s sentence, with the two halves the view already
     answered stated rather than asked.

     `Put this on a page` AND IT WAS `Bind as a block`. Two invented words in a three-word button:
     nothing in the product ever says what binding is, and `block` is defined once, on a different
     screen, once per device, for ever. A button is the wrong place to introduce a vocabulary. */
  bindBlock: 'Put this on a page',

  /** The predicate of an unfiltered list, said as a person would say it. */
  everything: 'everything in it',
  switchRecord: 'Switch record',
  recordSettings: 'Record settings',
  recordNotOpened: 'That record could not be opened just now. Try again in a moment.',

  /* Toasts. Past tense, the row named, and the undo is the sentence's point — never "Row archived
     successfully", which reports on the software rather than on the record. */
  toasts: 'Recent actions',
  undo: 'Undo',
  redo: 'Redo',
  required: 'required',
  nothingToUndo: 'Nothing to undo.',
  copied: (what: string) => `Copied ${what}.`,
  copyRefused: 'The browser would not give this page the clipboard.',
  /* THE TWO HALVES OF ONE CONTROL, AT THE HEAD OF THE RAIL. Each names what it will do rather than
     the gesture that got you here: "Toggle the sidebar" is what the key sheet calls the chord, and
     a reader looking at a column of glyphs does not know a toggle happened. */
  showSidebar: 'Show the sidebar',
  collapseSidebar: 'Collapse the sidebar',

  /* decide and the gate */
  openQuestions: 'Open questions',
  /* A LIVE RECORD: what `decide` answered, and the two words a proposal that is not a choice takes. */
  acceptIt: 'Accept',
  rejectIt: 'Reject',
  filter: 'Filter',
  /* WHEN A SCREEN DOES NOT LOAD. What was wrong · where · what to do — and the reassurance is a fact
     about the record rather than an apology: nothing was written, because this screen never got as
     far as writing. */
  screenFailed: 'This screen did not load',
  screenFailedBody: 'Nothing was changed. Try again, and if it happens twice, quote the request below.',
  /* WHAT A FIGURE SAYS WHEN THE LIST UNDER IT IS EMPTY. Not a verdict — there is nothing to judge —
     and not silence either, because a bare `GBP 0.00` with no note beside it is the same tile a
     working figure draws. It names the list, so it points at what to do next. */
  nothingIn: (list: string) => `Nothing in ${list} yet`,
  /**
   * WHAT A REDUCING FIGURE SAYS WHEN ITS PREDICATE MATCHED NO ROW.
   *
   * A sum of no values is zero and the kernel means it to be, so `GBP 0.00` is the same number
   * whether a portfolio earned nothing or nobody has written down what it earns. The tile draws this
   * instead of a target line every value satisfies, and draws no verdict and no door beside it.
   *
   * IT SAYS WHAT HAPPENED AND NOT WHY, because the reader cannot know which clause did the
   * excluding. The first wording was "No row has filled this in yet", which is a claim about ONE
   * clause: `days-late-in` matches nothing on a record whose recent invoices are all unpaid, and
   * that sentence would then be false about `settled`, a field many rows have filled in. Three
   * surfaces drew it, so it was three false sentences.
   */
  nothingMatched: 'Nothing matched, so there is nothing to add up.',
  /* A series's first column names what each bar is, by the bucket it is cut into. */
  seriesAxis: { day: 'Day', week: 'Week', month: 'Month', quarter: 'Quarter', year: 'Year' } as Record<string, string>,
  reportUnread: 'The report keys could not be read just now.',
  pollAddress: 'Address',
  pollAddressHint: 'https://api.example.com/numbers.json',
  pollPath: 'Where it is',
  pollPathHint: 'data.mrr',
  pollFiled: 'Proposed. Approve it in Needs you and the numbers start arriving.',
  pollOpenDecide: 'Open it in Needs you',
  pollFaultUrl: 'Write the whole https:// address the numbers are at.',
  pollFaultMost: (n: number) => `One address fills ${n} numbers at most.`,
  pollFaultPath: (path: string) => `${path} is not a path. Write it as data.mrr or plans[0].count.`,
  feedSomeone: 'Someone on this record',
  openUnfiltered: (list: string) => `Open ${list}`,
  noneMatching: (total: number, what: string) => `${total} ${what}, none matching:`,
  clearFilters: 'Clear filters',
  tryAgain: 'Load it again',
  addOne: 'Add the first one',
  /**
   * A declared value as a person reads it on a control: `saas` is SaaS, `two_yearly` is Two yearly.
   *
   * THE RECORD STORES THE SPELLING THE DECLARATION USES, and a form showed it raw, lowercase and
   * underscored, on a first-run screen the owner called out. Only the label changes; the value a
   * control writes is still the stored one. Words that are initialisms are listed, because no rule
   * on the letters can tell `saas` from `seas`.
   */
  valueWord: (value: string): string => {
    const word = value.replace(/_/g, ' ');
    const known: Record<string, string> = { saas: 'SaaS', api: 'API', vat: 'VAT', url: 'URL', dns: 'DNS', ssl: 'SSL', tls: 'TLS', seo: 'SEO', ai: 'AI', mcp: 'MCP', cli: 'CLI', paye: 'PAYE', cis: 'CIS' };
    const lower = word.toLowerCase();
    if (known[lower]) return known[lower];
    return word.charAt(0).toUpperCase() + word.slice(1);
  },
  olderEntries: 'Show older entries',

  /* states */
  offline: 'Offline. New records only.',
  live: 'Live',
  polling: 'Polling',
  /* `saved` AND `reloaded` WERE HERE, AND BOTH HAD SURFACES ALREADY. The word a landed write shows
     is `writeMarkSaved`, the same five letters, on the row the write touched. `reloaded` is
     `50 §6`'s one-word conflict toast, and what this app says when somebody else got there first
     names the row and what to do about it: `writeConflict`, `pageRowConflict`, `decideConflict` and
     `writeRaced`, all of them rendered. The words above are the ones still owed a transport:
     `+layout.svelte:279` holds the live state as a constant and its chip at `:379` is `aria-hidden`
     with no text in it, so none of them has ever been said out loud. */
  screenshotOn: 'Screenshot mode is on.',
  screenshotOff: 'Screenshot mode is off.',
  review: 'Review',

  /* the palette */
  paletteLabel: 'Search',
  pages: 'Pages',
  install: 'Install',
  installDiff: 'What this adds',
  /* `04 §3`'s seven sections, in a person's words. Only the ones that say something render: a
     `CHANGES` heading over nothing is a warning that does not apply, and `06 §1` is that those
     teach people to ignore warnings. */
  diffAdds: 'Adds',
  diffConflicts: 'Conflicts',
  /* IN THE READER'S WORDS, AND THEY WERE IN THE SCHEMA'S. `Seeds` and `Touches` are `04 §3`'s
     section names, and they were printed as headings over values that are already plain English:
     "1 example row, marked example, clearable in one action" and "nothing you have written: 0 rows
     read". This is the trust screen, where somebody decides whether to let a stranger's file into
     their business, and the two labels on it were the two words nobody outside this repository
     uses. `19 §9`: the product speaks the reader's words. The API keeps `seeds` and `touches`, the
     way Slack's says `conversations` and its screens say channel. */
  diffSeeds: 'Examples',
  diffTouches: 'What you wrote',
  shareSetup: 'Share this setup',
  /* THE RAIL'S STAR, said in plain words beside its name (`lib/ui/Sidebar.svelte`). */
  slashRail: 'Slash: suggestions to fit this BrainDog to how you use it',
  /* THE FLAT NAV'S OWN ROWS (`flatNav` in `lib/nav.ts`): the screen every record opens on, the page it opened on before,
     and Slash's row under More, named for what it offers rather than by its own name. */
  today: 'Today',
  suggestions: 'Suggestions',
  /* The phone's More sheet, over what the rail keeps under its own More. */
  otherPages: 'Other pages',
  /* The search button at the head of the rail, which says its two keys where the pointer rests on it. */
  searchKeys: 'Search (press / or Ctrl K)',

  /* MONEY IS AN INTEGER IN MINOR UNITS, and this is the one place a person types one. The sentence
     says what to do rather than what is wrong: "not a number" is a verdict, and "digits and at most
     one point" is an instruction. */
  moneyShape: 'An amount is digits and at most one point. 1234.56, or -50.',
  moneyPlaces: (exp: number): string =>
    exp === 0
      ? 'This currency has no smaller unit, so an amount is a whole number.'
      : `This currency goes to ${exp} decimal place${exp === 1 ? '' : 's'}, and a fraction of one is not an amount anybody can pay.`,
  /* A FIGURE THAT CANNOT BE WORKED OUT, said to the person reading the tile rather than to whoever
     wrote the declaration. What was here was the author's sentence — "group_by: is published in 08
     and not read by this build", "{ lte: 400000 } for money in minor units" — under a headline
     figure, quoting a document number and a JSON literal at somebody with no control that edits a
     metric. The author's sentence still prints on the page block, beside the declaration. */
  figureUnavailable: 'This figure cannot be worked out yet. The add-on that owns it says why.',
  /* A WALK AHEAD THAT NEVER WENT UNDER: the last day it looked at, said where the day the money runs out would be. */
  lastsPast: (day: string) => `Lasts past ${day}`,
  figureConverted: (day: string) => `Converted at rates as of ${day}.`,
  /* A BAR'S OWN NOTE, beside the bar and not under the chart: what its money was kept in before it was said in home. */
  convertedFrom: (codes: string) => `converted from ${codes}`,
  /**
   * WHY A COLOUR CANNOT BE USED, SAID TO THE PERSON WHO PRESSED THE SWATCH.
   *
   * What was on this screen was the theme author's sentence — "the pair (faint on s3) is 3.61:1 in
   * dark. It needs 4.5:1. Move faint further from the ground." — and there is no control here that
   * moves a hue, lowers a chroma, or knows what `s3` is. Every one of those sentences instructs an
   * action only somebody writing a theme can take, which `checks.ts` itself says is a refusal that
   * teaches people the control is broken.
   *
   * THE FLOOR IT MISSED IS STILL WHAT IT SAYS, in the terms this screen is about: readable text,
   * and four meanings that stay apart. What it does not do is quote a ratio at somebody who cannot
   * change one.
   */
  accentRefused: (name: string, codes: readonly string[]): string => {
    const why = codes.includes('CONTRAST_FLOOR')
      ? 'text on some of its surfaces would not be readable'
      : codes.includes('INTENT_INSEPARABLE')
        ? 'two of the four meanings, good and wrong, would look the same to somebody who does not see red and green apart'
        : codes.includes('THEME_LADDER_ORDER')
          ? 'its surfaces would not stack in order, so a card would not read as sitting on the page'
          : 'a full palette cannot be solved from it';
    return `${name} cannot be this record's colour: ${why}. The other colours are unaffected.`;
  },
  /* WHAT THIS DEPLOYMENT IS, IN A WORD, AND NOT ONLY IN A COLOUR. `13 §5.1`: meaning may not live
     in the styling alone, so an accent a colour-blind reader cannot tell from production is a
     signal that is not there for them. The word sits beside the mark and in the page title, where
     it survives a screenshot and a tab strip; it is not a banner, because a banner is dismissed
     once and then absent for the rest of the session. Production has no word — the absence is the
     signal, and labelling the normal case trains people to stop reading the label. */
  alpha: 'Alpha',
  usedWhen: (ago: string) => `used ${ago}`,
  /* SHARED WITH THE KEYS LIST at the foot of `agents`, which says the same thing about a token
     nobody has presented. Two spellings of one sentence is how a product ends up saying "never used"
     in one list and "not used yet" in the next. (This note used to sit beside `endsWhen`, 154 lines
     down, explaining a key that was not the one under it.) */
  neverUsed: 'never used',

  /**
   * A URL THAT NAMES SOMETHING THIS RECORD DOES NOT HAVE.
   *
   * It was dressed two ways across eight routes: four said "Couldn't load nope." with a request id,
   * which is `error` — "it failed. Say what, once" — and nothing failed; four said "Couldn't find
   * nope." as `no-results`, which `19 §6` defines as "a filter matched nothing" and no filter ran.
   * Neither is what happened, and the same fact read as two different kinds of wrong.
   *
   * IT IS A REFUSAL, AND THE KERNEL ALREADY HAS THE SENTENCE: `There is no register called nope.`
   * with the allowed list beside it. `13 §6` renders a `fix` verbatim and `10 §7`'s fourth rule is
   * that the refusal is the teacher — so it names the thing, says it does not exist, and lists what
   * does. No request id: `50 §13 D11` makes that the copyable id of a call that failed, and there
   * was no call.
   */
  noSuch: (kind: string, name: string) => `There is no ${kind} called ${name}`,
  /**
   * THE HALF OF THE REFUSAL A PERSON CAN ACT ON, AND IT WAS A BARE FULL STOP.
   *
   * `/v/nothing` on any live record with no saved views printed *"Saved views on this record: ."*
   * The arm at `v/[view]/+page.svelte:264` asks the record for its own addresses rather than the
   * sample's names, which is right; on a keyless address `addressOf` answers `null`, `client.views()`
   * answers `[]`, and `join` over nothing left the sentence trailing off. A refusal that trails off
   * reads as a broken product rather than as an answer, on the one screen whose whole job is to
   * teach. So none is a branch, and it says the fact instead of listing it.
   *
   * AND THE NAMES ARE DE-DUPLICATED, because nothing upstream promises they are unique and one
   * caller's are not. After `Clear the examples` the rail keeps entries for pages that no longer
   * exist, and following one gave *"Pages on this record: Overview · People · Home · Overview ·
   * Ledger · Overview · Board · Overview · Dashboard."* Nine names of which five are the one word
   * repeated, because a page title is per-pack and this list is every pack's. The repetition carries
   * nothing a reader can use: two pages called Overview are told apart by which pack they sit in,
   * and a dot-separated sentence has no room for that.
   *
   * ORDER IS THE CALLER'S ORDER. Each caller passes the order its own screen shows, so sorting here
   * would make the refusal disagree with the rail the reader arrived from.
   *
   * AND AN ENTRY IS AN ADDRESS NOW, BECAUSE THE READER IS STANDING AT AN ADDRESS THAT DID NOT WORK.
   *
   * `/p/say-what-it-is-and-who-it-is-for` answered *"There is no page called
   * say-what-it-is-and-who-it-is-for."* over *"Pages on this record: Your project · Guide."* The
   * heading names the thing in the alphabet of the URL bar and the half beneath it switched
   * alphabets without saying so: the page titled "Your project" answers at `/p/home-guide`
   * (`packages/seed/src/usecases/guide.ts:234`), so both words on offer refuse again when typed.
   * `/r/<unknown>` is worse, because the mapping is guessable in neither direction. Seven of the
   * fourteen registers the seed's modules declare are named something other than their address:
   * `obligations` is Money, `transactions` is Ledger, `things` is Projects, `tracks` is Threads,
   * and `installments` is Instalments, one letter away and still a refusal. `901a2bb7` settled the
   * same argument for a row, which is named by the number a person can say.
   *
   * THE TITLE RIDES IN BRACKETS ONLY WHERE IT IS NOT THAT ADDRESS IN OTHER CLOTHES. Eight of those
   * fourteen registers, seven of the seed's fifteen pages and eleven of the thirteen settings areas
   * differ from their address in case or in a separator alone, and `services (Services)` eleven
   * times over would bury the five entries where the brackets are the whole point.
   *
   * SO THE DE-DUPLICATION IS BY ADDRESS, and that is the half of the same finding that fixing the
   * names made wrong. The nine titles reduced to six above were nine pages at nine addresses, five
   * of them titled Overview by five packs, and the six-name sentence left four pages the record
   * holds unmentioned. Two entries are one entry when they answer in the same place, never because
   * two authors picked the same word.
   */
  theseExist: (kind: string, held: readonly Held[]) => {
    const shown = new Map<string, string>();
    for (const one of held) {
      const address = typeof one === 'string' ? one : one.address;
      const title = typeof one === 'string' ? undefined : one.title;
      if (shown.has(address)) continue;
      shown.set(address, title === undefined || folded(title) === folded(address) ? address : `${address} (${title})`);
    }
    return shown.size === 0
      ? `This record has no ${kind.toLowerCase()} yet.`
      : `${kind} on this record: ${[...shown.values()].join(' · ')}.`;
  },
  signInAgain: 'Sign in again',
  revokeKey: 'Revoke',
  tokenOnce: 'Shown once. Copy it now.',
  copyToken: 'Copy the token',
  tokenCopied: 'Token copied',
  copyLine: 'Copy',
  lineCopied: 'Line copied',
  connectDone: 'Done',
  suggested: 'Waiting for you',
  /* WHAT THE TOP BAR IS HIDING, SAID AS A NUMBER. `19 §3` makes this the condition that stops a
     chosen top bar becoming the rejected default: it "states how many entries sit behind More
     rather than quietly swallowing them". */
  navBehindMore: (n: number) => `More, and ${n.toLocaleString('en')} ${n === 1 ? 'page' : 'pages'} behind it`,

  /* the keymap sheet */
  keymap: 'Keyboard',
  /* THE SIDEBAR CALLS IT A LIST AND THIS CALLED IT A GRID — one object, two names, both on screen
     in the same session, and one of them appearing only in the document that teaches the keyboard.

     AND THEN THE SENTENCE WAS STILL FALSE. It read "Bare letters act only inside a list you have
     clicked into", printed as the subtitle of a sheet whose FIRST section is headed Anywhere and
     holds `/`, `g`, `?` and the goto digits, all four marked bare in the registry. Two sections
     below it, On a page gives `j`, `k`, `o` and `y`, and `p/[slug]`'s block cursor starts at -1,
     meaning nowhere, so `j` moves with nothing focused at all. Nine rows of the document disproved
     its own subtitle. A reader who believed it and pressed nothing lost nothing; a reader who
     believed it and turned Character keys off lost `?`, `/` and `g` without being told. */
  keymapHint: 'Single letters act on whatever is in front of you. Character keys, in Settings, turns every one of them off.',
  /* WHAT THE SHEET SAYS WHEN THE SWITCH IS OFF, above rows it is still right to print: the reader
     wants to know what the keyboard WOULD do, and which half of it they have silenced. */
  keymapSilenced: 'Character keys is off, so the keys marked below do nothing. Shortcuts that use Ctrl or Alt keep working.',
  keymapRowOff: 'Off',
  scopeDocument: 'Anywhere',
  scopeToday: 'On Today',
  scopeWork: 'On Work',
  scopeGrid: 'In a table',
  scopeBoard: 'On a board',
  scopePage: 'On a page',
  scopeGate: 'At the gate',
  scopeDecide: 'In Needs you',
  scopeInbox: 'In the inbox',
  scopePalette: 'In the palette',
  scopeNav: 'In the sidebar',

  /** `33 §4`'s own row is headed *Sign in*, so that is the word rather than a new one. */
  signIn: 'Sign in',
  /* Lanes C and D. Typed at `notReached` above, with `writeNotReached`, and the header there says why. */
  recordNotReached: notReached,
  /* Lane A, and the same sentence as `recordNotReached`: a dead network is a dead network whichever
     control was pressed. */
  writeNotReached: notReached,
  writeMarkAdded: 'Added',
  writeMarkSaving: 'Saving',
  /* Settings, vault and packs writes (lane C) */
  writeRaced: 'The record changed while this was sent, so it has been read again.',
  exported: (file: string) => `${file} is in your downloads.`,
  /* Lane E: archive and restore, installing an add-on, and saved views */
  writeArchived: (what: string) => `Archived ${what}.`,
  viewsSection: 'Views',
  /* Lane H */
  /**
   * WHAT THE CAPTURE LINE FILLED IN, AND THE FACT THAT IT DID.
   *
   * A required field the screen answers on somebody's behalf is a fact written into their record that nobody told
   * it. The row is the cheapest thing in the product to make and it must not also be the quietest: the chip says
   * it on the row, and this says it once where they are looking, in the reader's own spelling of each value rather
   * than the record's — `direction` filled as `owed_by_me` is said back as "which way owed by me".
   *
   * IT SAYS WHERE TO CHANGE IT, because the answer is one press away on the row itself and a sentence reporting a
   * value with nowhere to go is a sentence that makes somebody open a form.
   */
  captureFilled: (what: readonly string[]) => `Filled in ${list([...what])}. Change any of it where it is.`,
  /* The same fact as the chip on the row, which has the width for it only on a card. The grid wears `Added`. */
  markAddedFilled: (what: readonly string[]) => `Added, with ${list([...what])} filled in`,
  editCancel: 'Cancel',
  searchDecided: 'Decided',
  proposalKind: (kind: string): string =>
    ({ page: 'Page', register: 'List', ingest: 'Rule for what comes in', theme: 'Look', metric: 'Measure', digest: 'Summary', rule: 'Rule', block: 'Page part' })[kind] ??
    kind.charAt(0).toUpperCase() + kind.slice(1),
  arrangeAdds: 'Adds',
  /* WHAT AN UPDATE HANDS TO ANOTHER PACK, which stays live: said apart from what it takes away, because a door the owner's
     Shortcut posts to goes on answering. */
  arrangeMoving: 'Moves',
  arrangeMovesTo: (name: string, pack: string) => `${name} moves to ${pack}, which is not installed; it keeps working until you remove it.`,
  /* A PLACE THE RAIL DID NOT HOLD AT ITS LAST DRAW, named once in a toast (`routes/+layout.svelte`): a page stays off the
     rail until one of its lists holds something, so the first thing typed can bring a place nobody saw arrive. */
  placeArrived: (names: readonly string[]) => `${list([...names])} ${names.length === 1 ? 'is' : 'are'} in your rail now.`,
} as const;
