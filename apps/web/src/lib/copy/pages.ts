/**
 * A page's words: editing its layout, the block picker and the kinds' names, the cash walk and the series, the
 * report keys and the poll form on `/p`, a thread on `/t`, and what a block says about the slice it shows.
 *
 * AN AREA FILE OF THE COPY AGGREGATE. `lib/copy.ts` spreads this object into `copy`, and every screen reads a
 * key here as `copy.<key>`. The house voice is written once, at the top of `copy.ts`. A word a screen in another
 * area also draws is in `shell.ts`, so that rewording it is nobody's edit to another area's screen.
 *
 * Plain Node loads this file through the aggregate (`passkey.mjs`), so it imports only relative `.ts` files.
 */

export const pages = {
  /* Arranging a page. Verb + Noun on every action, and the mode's own name is a verb: you are
     doing something to the page, not entering a place.

     `Edit layout` AND IT WAS `Arrange`. A friction pass counted thirty-six product words a stranger
     meets on the first run path and the five screens after it, and put this one on the list for a
     specific reason: it is a control in the top right of every page, it is a real English word, and
     it is not the word for the thing. "Arrange" is what you do to flowers; a reader looking for the
     way to move a block reads past it. `19 §9`'s rule is the one Slack follows and not the one
     Notion follows: the interface says the word a person would say. */
  arrange: 'Edit layout',
  arrangeDone: 'Done',
  width: 'Width',
  /* ACROSS, ON A PAGE WITH A SIDE RAIL, as Move up and Move down are along: the keyboard's way to the other column, and
     what each column is called while it is a list, so a screen reader moving between them hears which one it is in. */
  moveToRail: 'Move to rail',
  moveToMain: 'Move to main',
  mainColumn: 'Main column',
  sideRail: 'Side rail',
  removeBlock: 'Remove from this page',
  addBlock: 'Add to this page',
  showMe: 'Show me',
  asA: 'Draw it as',
  onPage: 'On the page',
  noDestination: (register: string) => `No page shows ${register} yet.`,
  /**
   * WHAT WILL BE ADDED, IN THE WORDS THE CONTROL ABOVE IT USED.
   *
   * ALL THREE TOOK THE DIALECT ID. The dropdown read *Label and value* and the line under it read
   * "Adds a spec to the end of the page" — one control, two vocabularies for one object — and
   * `blockAdded` produced "Added a chips.", which is not English. `kindNames` exists for exactly
   * this and its own header says why: an id is what an agent writes into a declaration, a name is
   * what a person picks from a list.
   *
   * AND THE WIDTH IS A PROPORTION. "4 of 12 wide" is the grid describing itself; a third of the
   * width is the same fact in the words somebody would use to ask for it.
   */
  willAdd: (name: string, span: number) =>
    `Adds a ${name} to the end of the page, ${span === 12 ? 'the full width' : `${span} twelfths wide`}.`,
  blockLink: 'a link to this part of the page',

  /* The picker groups by PURPOSE, because somebody adding a block knows they want to show a list
     and does not know that `todo` and `timeline` share a primitive while `chips` does not. */
  purposes: {
    say: 'Say something',
    figure: 'Show a figure',
    list: 'Show several things',
    plan: 'Show a plan',
    media: 'Show media',
  } as Record<string, string>,

  /* One line per kind, in the picker. What it is FOR, never how it is drawn — "the money you are
     owed, biggest first" tells you whether you want it; "a horizontal proportional bar" does not. */
  /**
   * WHAT EACH KIND IS CALLED, as opposed to what it is keyed on.
   *
   * The block picker and the arrange bar printed `bar`, `spec`, `gauge`, `params` — the dialect's
   * own identifiers, to somebody choosing between them. An id is what an agent writes into a
   * declaration; a name is what a person picks from a list. They are not the same job and this
   * product has both readers.
   */
  kindNames: {
    bar: 'Bar chart',
    gauge: 'Gauge',
    chips: 'Facts side by side',
    spec: 'Label and value',
    params: 'Settings',
    todo: 'To-do list',
    steps: 'Numbered steps',
    timeline: 'Timeline',
    board: 'Board',
    comparison: 'Comparison table',
    table: 'Table',
    note: 'Note',
    quote: 'Quote',
    code: 'Code',
    tree: 'Tree',
    stat: 'Figures',
    cards: 'Cards',
    section: 'Section heading',
    feed: 'What happened',
    agents: 'What agents did',
    diff: 'Before and after',
    sparkline: 'Small trend line',
    split: 'Parts of a whole',
    series: 'Bars by month',
    forecast: 'Cash ahead',
    bridge: 'From start to end',
    heat: 'Heat map',
    ring: 'Ring',
    lanes: 'Lanes',
    form: 'Form',
  } as Record<string, string>,

  kinds: {
    bar: 'amounts side by side, biggest first',
    gauge: 'one number against its target',
    chips: 'a few short facts side by side',
    spec: 'label, value, note. The workhorse',
    params: 'settings and their values',
    todo: 'things to do, with a date',
    steps: 'a sequence, numbered',
    timeline: 'what happened, most recent first',
    board: 'cards in columns by state',
    comparison: 'a small table you write yourself',
    table: 'every item, in full',
    note: 'a paragraph that matters',
    quote: 'something somebody said',
    code: 'code, exactly as typed',
    tree: 'a shape with indentation',
    stat: 'two or three figures across the top',
    feed: 'what agents, rules and you did since you last looked',
    agents: 'what each agent did, grouped by agent',
    diff: 'how a text changed, line by line',
    sparkline: 'a figure with the run of numbers that led to it',
    split: 'one total cut into its parts',
    bridge: 'how a start became an end, step by step',
    heat: 'each day of twelve weeks, darker the busier it was',
    ring: 'one figure toward its target, or up to five parts of a whole',
    lanes: 'each item as a span from its start to its end',
    cards: 'each item as a card, its name and a few facts',
    form: 'a few questions and a button that adds to this list',
  } as Record<string, string>,
  arrangeNothing: 'Nothing moved.',
  arranged: (title: string) => `${title} rearranged.`,
  arrangeTemplate: 'This page is drawn once for each item from one shared layout, so it cannot be rearranged from one of those items.',
  arrangeMoved: 'This page changed while it was being arranged. Open it again, then arrange it.',
  blockAddedLive: (name: string) => `Added a ${name}. Press Done to keep it.`,

  cardFallback: 'The card',
  /* A BRIDGE OVER THE CASH WALK: where the money starts, what comes and goes, and where it lands. */
  bridgeStart: 'Cash now',
  bridgeIn: 'Coming in',
  bridgeOut: 'Going out',
  bridgeEnd: (days: number) => `In ${days} days`,
  seriesWeekOf: (day: string) => `Week of ${day}`,
  /* SEND NUMBERS HERE (`lib/page/panels/Reporting.svelte`): the seed's heading, which the panel is drawn under, and what
     a report key can and cannot do, said before anybody makes one. */
  reportHeading: 'Send numbers here',
  reportWhy: (title: string) =>
    `A project sends its numbers to ${title} with a report key. The key can only add numbers for ${title}: it cannot read anything, or write anywhere else.`,
  reportLine: 'Send one number from the project, or from a scheduled job on its server',
  reportPlaceholder: '<report key>',
  reportMake: 'Make a report key',
  reportKeys: 'Report keys',
  reportRevoked: 'Revoked. The key stops working now.',
  /* THE POLL FORM (`lib/page/panels/PollForm.svelte`): an address, how often, and which number is which. It files a
     proposal, because a poll calls out on a clock and the owner approves the address once, on Decide. */
  pollHeading: 'Or let BrainDog fetch them',
  pollWhy:
    'If the project answers its numbers as JSON at an https address, BrainDog can fetch them on a clock. You approve the address and how often once, in Needs you, and nothing is fetched before that.',
  pollEvery: 'How often',
  pollEveryLabels: { '15m': 'Every 15 minutes', '1h': 'Every hour', '6h': 'Every 6 hours', '1d': 'Every day' } as Record<string, string>,
  pollKey: 'Key in the Keychain, only if the address needs one',
  pollKeyNote: 'Leave it empty for an address anybody can read. A key is sent to this address and nowhere else.',
  pollNumbers: 'The numbers in the answer',
  pollName: 'Called',
  pollNameHint: 'Monthly recurring revenue',
  pollUnit: 'Unit',
  pollUnitHint: 'GBP',
  /* WHEN A NUMBER IS DATED, and whether it is money (live feed 2.0.0). A count for the 20th asked on the 21st is the
     20th's, so a number can be dated from the answer; money is written as an amount in its currency, never as text. */
  pollDated: 'Dated',
  pollDatedLabels: { arrived: 'Dated when it arrives', day: 'Dated by a day in the answer', instant: 'Dated by a time in the answer' } as Record<string, string>,
  pollDatePath: 'Where its date is',
  pollDatePathHint: 'data.day',
  pollMoney: 'Money',
  pollMoneyLabels: { no: 'Not money', whole: 'Money, in whole units', minor: 'Money, in cents' } as Record<string, string>,
  pollCurrency: 'Currency',
  pollCurrencyHint: 'USD',
  pollFaultDate: (name: string) => `Say where ${name}’s date is in the answer, such as data.day.`,
  pollAddRow: 'Add a number',
  pollRemoveRow: (n: number) => `Remove number ${n}`,
  pollFile: 'Propose this poll',
  pollFaultKey: 'A key’s label is 40 characters at most.',
  pollFaultNone: 'Name at least one number: where it is in the answer, and what it is called.',
  pollFaultName: (path: string) => `Say what the number at ${path} is called.`,
  pollQuestion: (host: string, every: string, title: string, names: string) => `Poll ${host} ${every.toLowerCase()} for ${title}’s numbers: ${names}?`,
  /* A BALANCE NOBODY HAS UPDATED IN A WHILE says so beside its date, with the watch glyph. */
  outOfDate: (day: string) => `${day}, out of date`,
  /* `blockNeedsOneCurrency` WAS HERE AND IS DELETED RATHER THAN EXCUSED. It was one of two headings the
     browser chose between by running `/currenc/` over the record's refusal text, which is the habit that put
     *This block's filter was not understood, so it matched nothing* over a filter that was understood and
     matched 216 rows. The app now passes on what the record said, so a second copy of the record's sentence
     here is a standing invitation to guess again. The record's own words are in `packages/kernel/src/pages.ts`. */
  /** The heading over one currency's chart, when a chart is drawn once per currency. */
  inCurrency: (currency: string) => `In ${currency}`,
  noSources: 'Nothing feeds your BrainDog yet',
  noSourcesWhy: 'A connector pulls things in on a schedule from a mailbox, a bank feed or a repository, and reports here when it fails.',
  ingestPrompt: 'read my BrainDog, then set up a connector for the mailbox I file invoices in',

  /** Names the source block so tabbing into it says which page it is the workings of. */
  declarationOf: (page: string) => `How ${page} is built`,
  /* The toggle top right of every page. `Source` was a developer's word for it, read by somebody
     who does not write code as an origin or a supplier. */
  pageBack: 'Back to the page',
  openTheRest: (register: string) => `Open ${register} for the rest`,
  /** A list's door at a tile's foot, with how many it holds: "All 36 in Ledger" said what "30 more" left to sums. */
  allIn: (n: number, register: string) => `All ${n.toLocaleString('en-GB')} in ${register}`,
  /**
   * THE CASH WALK COUNTS MOVEMENTS, AND THERE IS NOWHERE TO OPEN.
   *
   * The general sentence says "Showing 12 of 69" and the comment above it promises a rung — but a
   * walk is computed from several lists at once, so there is no single one to open, and the block
   * draws THIRTEEN rows: the twelve movements plus the opening balance, which is a header wearing a
   * row's clothes. A reader who counted got a number the line did not use. This names the unit, so
   * the extra line is not a discrepancy, and promises nothing it cannot give.
   */
  ofWhichWalked: (drawn: number, total: number, days: number) =>
    /* `payments in and out` AND IT WAS `movements`. A movement is a bookkeeper's word for the thing
       and this line sits under a table of dated amounts on a screen a business owner opens to see
       what is coming: the reader knows what a payment is and does not have to be taught. */
    `The next ${drawn.toLocaleString('en')} of ${total.toLocaleString('en')} payments in and out over ${days} days`,
  pageRowConflict: (title: string) => `${title} was changed somewhere else first. The page has been read again, so try once more.`,
  pageRowUnknown: 'This could not be saved from here, because the page did not say which item it is.',
  pageRowNoState: 'This could not be marked done from here, because it has no done state.',
  /* A path's own add line (`page/AddStep.svelte`), and what it says when the record did not say where a step goes. */
  pathStepAdd: 'Add a step',
  pathStepNew: 'A new step',
  pathStepAdded: (title: string) => `Added ${title}.`,
  pathStepNowhere: 'A step could not be added from here, because nothing says which item these steps belong to.',
  /* Lane O: the page's source as a file. The name is on the button because the name is the point —
     one page, one file, called what the declaration's first line calls it. */
  pageSourceSave: (file: string) => `Download ${file}`,
} as const;

/**
 * The sentences only an `inputs` block's box says (`record/inputs-write.ts`): a comma that does not group thousands, a
 * bare figure in an empty money box on a record with no home currency, and a row changed somewhere else while it was typed.
 *
 * NOT A KEY OF `copy`, so `lib/copy.ts` re-exports it by name and `inputs-write.ts` imports it from there as it always has.
 */
export const INPUTS_SAID = {
  comma: 'A comma here only groups thousands, as in 1,250.50. Write a part of one with a point: 1.20, not 1,20.',
  noCurrency: (typed: string): string => `Nothing says which currency this is in yet, so type its three-letter code with the figure, as USD ${typed}.`,
  changed: (label: string, now: string, typed: string): string =>
    `This was changed somewhere else while you typed, and ${label} now holds ${now}. What you typed, ${typed}, was not written: type it again to write it over.`,
} as const;
