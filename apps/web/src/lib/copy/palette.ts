/**
 * The words of the palette, search and Slash: finding anything, a run on `/jobs`, what a load-bearing noun means
 * (`Define.svelte`), and what Slash read and found.
 *
 * AN AREA FILE OF THE COPY AGGREGATE. `lib/copy.ts` spreads this object into `copy`, and every screen reads a
 * key here as `copy.<key>`. The house voice is written once, at the top of `copy.ts`. A word a screen in another
 * area also draws is in `shell.ts`, so that rewording it is nobody's edit to another area's screen.
 *
 * Plain Node loads this file through the aggregate (`passkey.mjs`), so it imports only relative `.ts` files.
 */

export const palette = {
  search: 'Search',
  /* WHAT THE PALETTE IS NOT SHOWING, and where the rest is. It printed eight hits and said nothing
     about the ninth — on the surface `19 §4` makes the primary way to reach a row, and with a
     round-robin that gives one hit per list, eight across nine lists is one row each. */
  searchWaiting: 'Find anything you keep',
  /* NOT `noneMatching`, which counts the rows a LIST holds and reads "0 rows, none matching" here —
     a search is over every list at once, so there is no single total to count against. */
  searchNone: (q: string) => `Nothing matches “${q}”`,
  searchClear: 'Clear the search',
  searchInHistory: 'Open History',
  searchWhere: 'Projects, people, money and more.',
  allMatches: (n: number, q: string) => `All ${n.toLocaleString('en')} matches for “${q}”`,
  showingOf: (shown: number, total: number) => (shown >= total ? `${shown}` : `${shown} of ${total}`),
  /* `Stopped.` IS THE ASSISTANT'S, NOT THE TRANSPORT'S, whatever its position in this block says.
     `23 §7` Cancel: Escape stops the answer instantly and the typed text survives, and the toast is
     this word. So it is absent for the same reason `askBrainDog` is, which `23 §3.1` settles: with no
     model the assistant is not there rather than greyed out. `dead-copy` files it under the offline
     surface, which would have it waiting on a socket it has nothing to do with. */
  stopped: 'Stopped.',
  noMatches: 'Nothing matches',
  /* WHILE THE RECORD IS STILL ANSWERING, where the first row will be: the panel sat white for 2 s on "late". */
  looking: 'Looking…',
  commands: 'Actions',
  destinations: 'Go to',
  records: 'In your things',
  /* THE LINE UNDER AN ID SOMEBODY TYPED, AND IT SAID `spoken id`. That is this product's internal
     name for the convention, written down in `19 §2` and in the copy's own notes, and the palette
     is the one surface where the reader has just proved they know the convention by using it. The
     detail is there to say what pressing Enter does, in the reader's word for the thing: a number. */
  openById: 'Open by number',
  askBrainDog: 'Ask BrainDog',
  /* SLASH'S ROW AND WHAT IT DRAWS (`50 §5.5` step 5). Every one of these is on screen only when `/api/version` says a model
     is behind Slash on this host, because the row is the only way into the mode and without a model the row does not exist.
     The fold's last line is `23 §6`'s, with a colon for the dash. */
  askSlash: (text: string) => `Ask Slash: ${text}`,
  slashAsking: 'Slash is reading your BrainDog.',
  /* WHILE A BUSY RECORD IS ASKED AGAIN (the client's 503 retry): calm, and never the crash sentence to quote. */
  slashBusy: 'BrainDog is busy. Trying again.',
  slashWhere: 'Slash looked for',
  slashSearched: (q: string) => `Slash searched your BrainDog for “${q}”`,
  slashNothing: 'Nothing in your BrainDog answers that.',
  slashFold: 'What Slash read',
  slashFoldLine: (register: string, rows: number, predicate: string) => `${register}: ${rows === 1 ? '1 item' : `${rows.toLocaleString('en')} items`}, ${predicate}`,
  slashAll: 'all',
  slashGrantRefused: 'grant: refused',
  /* A PREDICATE IN WORDS, one phrase per test of `34 §1.1`. `empty` and `present` take no operand. */
  slashOps: {
    is: 'is',
    not: 'is not',
    in: 'is one of',
    not_in: 'is none of',
    gt: 'is more than',
    gte: 'is at least',
    lt: 'is less than',
    lte: 'is at most',
    before: 'is before',
    after: 'is after',
    between: 'is between',
    contains: 'contains',
    starts: 'starts with',
    ends: 'ends with',
    empty: 'is empty',
    present: 'is set',
    has: 'has',
    lacks: 'lacks',
    near: 'is near',
  } as Readonly<Record<string, string>>,
  slashMatches: (text: string) => `the text matches “${text}”`,

  /**
   * THE LOAD-BEARING NOUNS, one clause each, `19 §6`.
   *
   * Four, and the number was measured rather than chosen. Of the eight the rule names, `pack` is
   * already defined in place — "An add-on brings ready-made lists and pages" is the first line of
   * `/packs` — and `tone`, `target` and `window` never appear on a screen in this build at all, so
   * a rule about the first time a word appears is satisfied by their not appearing. `register` is
   * not here because this product says LIST to a reader; `register` is the id an agent writes.
   *
   * NONE OF THEM DEFINES ITSELF WITH ANOTHER OF THEM except downwards: a row is a thing in a list,
   * a page is made of blocks. A definition that needs a second definition to land is a glossary.
   */
  defines: {
    /* `19 §642`'s clauses, with one word swapped: the table writes `register` and this product says
       LIST to a reader. Its wording, except here.

       ITS OWN EXAMPLES BACKFIRE IN PLACE. The document's clause is "a typed collection —
       obligations, domains, people", which reads well in a glossary listing all eight nouns and
       badly under the heading "Obligations", where the three examples sit directly beneath one of
       themselves and scan as the list's FIELDS. What "typed" actually means is the half a reader
       needs, so that is the half this says. */
    /**
     * DEFINED BY EXAMPLE, NOT BY ANOTHER NOUN. This read "one thing in a list. It has a number you
     * can say" and broke `copy.ts`'s own stated invariant two lines up — none of these defines
     * itself with another of them **except downwards** — because the first place it renders is
     * `/start`, where `list` has not been defined and will not be until the next screen, and where
     * there is not a single number on the page for "a number you can say" to point at.
     *
     * `19 §6` asks for the clause to be specific about the thing rather than about the schema. An
     * invoice, a domain and a person are three things a reader already owns.
     */
    row: 'one thing you are keeping track of: an invoice, a domain, a person',
    /* IT DEFINED THE WORD AND THEN UNTAUGHT IT. `a screen made of blocks. It is a row, so you can
       change it` introduces `block`, which the reader has not met, and then says a page is a row,
       which is true of how it is stored and is not a thing anybody needed to know at the moment
       they first opened one. A friction pass counted `block` as tax for exactly this: the sentence
       teaching it was doing two other jobs at the same time.

       WHAT IS LEFT IS WHAT A READER CAN DO WITH IT. `block` is defined on its own, one line down,
       on the screen where somebody meets one. */
    /* AND IT SAYS WHAT TO DO ABOUT IT. The clause was a description of the idea, standing between the
       title and the figures; what a reader meeting a page needs is that it is theirs to change. Where
       its figures come from is how the software works, and it was cut for that. It names no control,
       because Edit layout is absent on a phone. AND "YOURS TO CHANGE" WAS STILL A SENTENCE ABOUT THE SCREEN, not
       about the page: what a page is to its reader is what it gathers. */
    page: 'one screen that gathers what you keep an eye on: figures, tables and notes',
    block: 'one piece of a page: a table, a figure, a note',
  } as const,
  /* Phase 1's last reads: what a question found by `/search` on a record says beside its title. */
  searchOpenQuestion: 'Open question',

  /**
   * CHANGING THE APP IN WORDS (`palette/customise.ts`). A row is drawn only when the query names it, so
   * every title is the words somebody types, and every line under it says where the change lands. Each names the
   * person's own page by the name their nav shows.
   */
  customise: {
    group: 'Customise',
    shot: 'Screenshot mode',
    shotDetail: 'Hides what your BrainDog holds on this screen.',
    dark: 'Dark mode',
    light: 'Light mode',
    system: 'Match the system',
    textSm: 'Small text',
    textBase: 'Normal text',
    textMd: 'Large text',
    compact: 'Compact spacing',
    comfortable: 'Comfortable spacing',
    roomy: 'Roomy spacing',
    /* WHERE A LOOK CHANGE IS KEPT, under its title (`pref.whereKept`): the record keeps each person's look, per record,
       so it is on every device they open it on; a device with no record, or a record that cannot keep it, holds it alone;
       and a change the record has not heard of yet waits here until it can be sent. */
    inRecord: 'Yours in this BrainDog, on every device',
    thisDeviceNow: 'On this device for now',
    thisDevice: 'On this device',
    /* THE TOAST AFTER A LOOK CHANGES, which has nothing to add but where it was kept, as the record answered. */
    lookKept: (name: string) => `${name}, in this BrainDog on every device you open it on.`,
    lookPending: (name: string) => `${name}, on this device for now. It reaches your BrainDog the next time it can.`,
    lookSet: (name: string) => `${name}, on this device.`,
    openOn: (name: string) => `Open on ${name}`,
    openOnDetail: 'The page BrainDog opens first',
    homeSet: (name: string) => `BrainDog opens on ${name} now.`,
    hide: (name: string) => `Hide ${name}`,
    hideDetail: 'From your nav. Nothing is deleted.',
    hidden: (name: string) => `${name} is hidden from your nav.`,
    show: (name: string) => `Show ${name}`,
    showDetail: 'Back in your nav',
    rename: (from: string, to: string) => `Rename ${from} to ${to}`,
    renameDetail: 'In your nav. The page keeps its own name.',
    renameListDetail: 'Everywhere it is named, for everyone here. Undo puts the old name back.',
    renamed: (from: string, to: string) => `${from} is ${to} in your nav.`,
    unnamed: (own: string) => `${own} has its own name again.`,
    renameAsk: (name: string) => `Rename ${name}`,
    renameAskDetail: 'Type the new name after “to”',
    /* WHAT THE BOX SAYS ONCE "Rename Money" IS PRESSED: the sentence, waiting for its last word. */
    renameFill: (name: string) => `Rename ${name} to `,
    page: 'Customise this page',
    pageDetail: 'Its layout, what it shows, how it is built',
    quiet: 'Quiet hours',
    quietDetail: 'Settings › Notifications',
  },
} as const;
