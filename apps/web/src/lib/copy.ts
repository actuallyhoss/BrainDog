/**
 * Every UI literal in the app, in one file.
 *
 * Load-bearing twice. It is the only place a sentence is typed, so the rule that the interface never
 * explains itself is reviewable in one pass (23 §7). And it is the first input of the screenshot
 * allow-list: under `html[data-shot]` only text a developer typed into source stays legible, which
 * is why a toggle's two states are two full literals here rather than one built by concatenation.
 * Pattern-based redaction let "GREEN MARKET" through once (19 §6).
 *
 * The house voice, in three rules:
 *   - What was wrong · where · what to do. No apology, no blame, no exclamation.
 *   - A CTA is Verb + Noun. Never "Get Started".
 *   - Say what a thing does, plainly. Never sell it, and never explain the interface.
 */

/** `a`, `a and b`, `a, b and c` — an Oxford-less list, which is what a person writes. */
const list = (words: string[]): string =>
  words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;

export const copy = {
  /* the product */
  product: 'BrainDog',
  tagline: "Everything about your business that isn't code.",

  /* the spine */
  home: 'Home',
  decide: 'Decide',
  inbox: 'Inbox',
  search: 'Search',
  packs: 'Packs',
  vault: 'Vault',
  settings: 'Settings',
  audit: 'Audit',
  more: 'More',
  close: 'Close',

  /* Arranging a page. Verb + Noun on every action, and the mode's own name is a verb: you are
     doing something to the page, not entering a place. */
  arrange: 'Arrange',
  arrangeDone: 'Done',
  arrangeCancel: 'Cancel',
  width: 'Width',
  moveUp: 'Move up',
  moveDown: 'Move down',
  /* The nav's own two, which the arrange verbs above do not cover: a rail is sectioned, so "top"
     means the top of the section, and "hide" is the nav's word for removing a row without deleting
     the page behind it (19 §3). */
  moveToTop: 'Move to top',
  hide: 'Hide',
  removeBlock: 'Remove this block',
  addBlock: 'Add a block',

  /* Binding a saved view onto a page — 21 §3.4's sentence, with the two halves the view already
     answered stated rather than asked. */
  bindBlock: 'Bind as a block',

  /* THE ONE SENTENCE A MOCK-UP OWES ITS READER. A control that does nothing at all is
     indistinguishable from a broken one, so every action that cannot happen here says what it
     would have done and that it did not happen — once, in the toast, not as a disabled state.
     A disabled control tells you a thing exists and refuses to say why it will not work. */
  /** What to do with something the record noticed: put it where things get decided. */
  raiseIt: 'Raise it',
  /** The way from a session to the run behind it: the tool calls, in order, with their answers. */
  watchRun: 'Watch the run',
  /** The predicate of an unfiltered list, said as a person would say it. */
  everything: 'everything in it',
  notWritten: (what: string) => `${what}, but nothing was written. This is a mock-up of the record.`,
  promoted: (title: string) => `${title} is in your nav, at the end of its section.`,
  showMe: 'Show me',
  thatIs: 'that is',
  asA: 'Draw it as',
  onPage: 'On the page',
  noDestination: (register: string) => `No page shows ${register} yet.`,
  willAdd: (kind: string, span: number) => `Adds a ${kind} to the end of the page, ${span} of 12 wide.`,
  bound: (kind: string, page: string) =>
    `Added a ${kind} to ${page}. Nothing was written; this is a mock-up.`,
  blockLink: 'a link to this block',
  blockAdded: (kind: string) => `Added a ${kind}. Nothing was written; this is a mock-up.`,

  /* The picker groups by PURPOSE, because somebody adding a block knows they want to show a list
     and does not know that `todo` and `timeline` share a primitive while `chips` does not. */
  purposes: {
    say: 'Say something',
    figure: 'Show a figure',
    list: 'Show a list',
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
    chips: 'Facts in a row',
    spec: 'Label and value',
    params: 'Settings',
    todo: 'To-do list',
    steps: 'Numbered steps',
    timeline: 'Timeline',
    board: 'Board',
    comparison: 'Comparison table',
    table: 'Table of rows',
    note: 'Note',
    quote: 'Quote',
    code: 'Code',
    tree: 'Tree',
    stat: 'Figures',
  } as Record<string, string>,

  kinds: {
    bar: 'amounts side by side, biggest first',
    gauge: 'one number against its target',
    chips: 'a few short facts in a row',
    spec: 'label, value, note. The workhorse',
    params: 'settings and their values',
    todo: 'things to do, with a date',
    steps: 'a sequence, numbered',
    timeline: 'what happened, most recent first',
    board: 'cards in columns by state',
    comparison: 'a small table you write yourself',
    table: 'a register, in full',
    note: 'a paragraph that matters',
    quote: 'something somebody said',
    code: 'code, exactly as typed',
    tree: 'a shape with indentation',
    stat: 'two or three figures across the top',
  } as Record<string, string>,
  arrangedNotSaved: (title: string) =>
    `${title} rearranged here. Nothing was written; this is a mock-up of the record.`,
  arrangeNothing: 'Nothing moved.',
  switchRecord: 'Switch record',
  recordSettings: 'Record settings',
  newRecord: 'New record',

  /* Toasts. Past tense, the row named, and the undo is the sentence's point — never "Row archived
     successfully", which reports on the software rather than on the record. */
  toasts: 'Recent actions',
  undo: 'Undo',

  /* Deferring. A defer without a date is a dismissal wearing a nicer word, so both fields are
     required and the button says what will exist afterwards. */
  deferTitle: 'Why not yet, and when',
  deferHint: 'What has to happen first',
  deferAction: 'Park it',
  wakeOn: 'Wake me on',
  deferred: (on: string) => `Parked until ${on}. Nothing was written; this is a mock-up.`,
  required: 'required',
  nothingToUndo: 'Nothing to undo.',
  archived: (id: string) => `Archived ${id}.`,
  restored: (id: string) => `Restored ${id}.`,
  marked: (id: string, state: string) => `${id} is ${state}.`,
  copied: (what: string) => `Copied ${what}.`,
  copyRefused: 'The browser would not give this page the clipboard.',

  /* home */
  needsYou: 'What needs you',
  sinceAway: 'Since you were away',
  nothingNeedsYou: 'Nothing needs you today.',
  andMore: 'and more',
  markAllRead: 'Mark all read',

  /* decide and the gate */
  openQuestions: 'Open questions',
  rankedBy: 'Ranked by the cost of being wrong',
  costOfDelay: 'Cost of deciding late',
  theOptions: 'The options',
  recommended: 'Recommended',
  chooseThis: 'Choose this',
  yourReason: 'Your reason',
  reasonHint: 'Why this one, in a sentence somebody can read in six weeks.',
  reasonNudge: 'That will not mean anything in six weeks. Keep it anyway?',
  commit: 'Commit the decision',
  defer: 'Defer',
  decidedBy: 'Decided by',
  immutable: 'A decision cannot be edited once it is made.',
  noQuestions: 'Nothing to decide.',
  lastDecided: 'The last one was decided',

  /* the register grid */
  newRow: 'New',
  filter: 'Filter',
  done: 'Done',
  /* Verb + Noun, never "Save" or "Submit": the button says what will exist afterwards. */
  addRow: 'Add',
  noneChosen: 'None',
  yes: 'Yes',
  secretsLiveInTheVault: 'Keys and tokens go in the Vault. A row records what one opens.',
  savedNothing: 'Nothing was written. This is a mock-up of the record, not the record.',
  noFilters: 'Nothing here can be filtered yet.',
  /* WHERE A FIELD IS FILTERED INSTEAD, said once for all of them rather than as a headed section
     each. Three fieldsets carrying a legend and one sentence read as three controls that failed to
     render. */
  filterBySearch: (fields: string[]): string =>
    `${list(fields)} ${fields.length === 1 ? 'is' : 'are'} matched by the search box.`,
  filterBySort: (fields: string[]): string => `${list(fields)} sort${fields.length === 1 ? 's' : ''} on the column.`,

  displayOptions: 'Display',
  display: 'Display',
  displayNote: 'Only affects your view of this list.',
  columns: 'Columns',
  always: 'always',
  showAll: 'Show them all',
  rowMenu: 'Actions for this row',
  archive: 'Archive',
  selected: 'selected',
  clear: 'Clear',
  /* The picker's two labels, written out rather than built by concatenation — the screenshot
     allow-list only keeps text a developer typed into source. */
  select: 'Select',
  deselect: 'Deselect',
  /* THE VERBS A SELECTION IS FOR. A selection with nothing to do with it is a mode you can enter
     and not leave usefully, which is what this one was: implemented, drawn, and consumed by
     nothing. Verb + Noun, like every other action here. */
  copyIds: 'Copy ids',
  setState: 'Set state',
  archiveSelected: 'Archive',
  clearFilters: 'Clear filters',
  saveAsView: 'Save as a view',
  export: 'Export',
  requestAccess: 'Request access',
  tryAgain: 'Try again',
  addOne: 'Add one',
  showExample: 'Show me an example',
  peek: 'Peek',
  openRow: 'Open',
  copyId: 'Copy id',
  copyLink: 'Copy link',
  includesExample: 'includes 1 example',
  example: 'example',

  /* states */
  offline: 'Offline. New records only.',
  live: 'Live',
  polling: 'Polling',
  stale: 'Stale',
  saved: 'Saved',
  reloaded: 'Reloaded',
  screenshotOn: 'Screenshot mode is on.',
  screenshotOff: 'Screenshot mode is off.',
  stopped: 'Stopped.',
  suggestedPage: '1 suggested page.',
  holdingPen: 'Not placed. Nothing moved.',
  review: 'Review',

  /* the palette */
  paletteLabel: 'Search, or run a command',
  palettePlaceholder: 'Type a name, an id, or a command',
  noMatches: 'Nothing matches',
  commands: 'Commands',
  destinations: 'Go to',
  records: 'Rows',
  pages: 'Pages and lists',
  askBrainDog: 'Ask BrainDog',

  /* the vault */
  vaultBlurb: 'What each key opens, and when each was last rotated. The value is never shown here.',
  opens: 'Opens',
  rotated: 'Rotated',
  reveal: 'Reveal once',
  revealWarning: 'Revealing is recorded in the audit log with your name on it.',
  staleKey: 'Not rotated in over six months.',

  /* packs */
  installed: 'Installed',
  browse: 'The Kennel',
  install: 'Install',
  uninstall: 'Uninstall',
  installDiff: 'What this adds',
  packBlurb: 'A pack adds ready-made lists and pages. Readable text; nothing runs.',

  /* settings */
  appearance: 'Appearance',
  scheme: 'Colour scheme',
  schemeLight: 'Light',
  schemeSystem: 'System',
  schemeDark: 'Dark',
  textSize: 'Text',
  textSmall: 'Small',
  textNormal: 'Normal',
  textLarge: 'Large',
  density: 'Density',
  densityCompact: 'Compact',
  densityComfortable: 'Comfortable',
  densityRoomy: 'Roomy',
  characterKeys: 'Character keys',
  characterKeysHint: 'Single letters act on the focused list.',
  on: 'On',
  off: 'Off',

  /* first run.

     THE FIRST SCREEN SETS THE CEILING. It used to open with "What do you want to stop forgetting?"
     over three narrow nouns — an invoice, a domain, a decision — and somebody reading that meets a
     reminders app with a database under it. The record is the whole of a business that isn't code,
     and a first run that asks about a domain renewal has already decided it is something smaller.

     So the scope is stated before the question is asked, and the choices are the PARTS OF A
     BUSINESS rather than three things worth remembering. The mechanic underneath is unchanged and
     still right (19 §6): one row, typed by hand, no pack vocabulary, nothing to approve. You are
     not picking a plan or a template — you are picking where to start, which is a different
     sentence and the reason there are five of them now instead of three. */
  firstLede: "Everything about your business that isn't code.",
  firstBody:
    'Money, the estate it runs on, the people, the projects, and the decisions behind ' +
    'them. Typed, versioned, and readable by every agent you use.',
  firstQuestion: 'Where do you want to start?',
  firstHint: 'One real row is enough. You can delete it later.',
  firstChoices: [
    { key: 'obligations', icon: 'money', label: 'Money', body: 'What you owe, and what you are owed.', field: 'What is it, and how much?' },
    { key: 'services', icon: 'calendar', label: 'The estate', body: 'Domains, hosting, subscriptions, licences.', field: 'What renews, and when?' },
    { key: 'people', icon: 'people', label: 'People', body: 'Clients, contractors, and who does what.', field: 'Who is it, and what are they for?' },
    { key: 'things', icon: 'thing', label: 'Projects', body: 'The things you run, and the plan for each.', field: 'What is it, and what is it for?' },
    /* `tasks` AND NOT `decisions`. A decision is not a register — it is what the gate writes when
       somebody answers a question — so the fifth card named a register the record does not have,
       and the only reason nobody found out is that the form below never ran. */
    { key: 'tasks', icon: 'task', label: 'Work', body: 'What is on, what is next, and who has it.', field: 'What needs doing?' },
  ],

  /* SCREEN 2, INLINE UNDER THE REGISTER THEY JUST MADE (19 §6). The claim is about what the record
     becomes rather than about what they should do next — "Add another" is work manufactured for
     somebody who has not asked for any, and 19 §6's own rule for an empty state is that a product
     which manufactures work is the failure. */
  secondHeading: 'One kind of thing is a list. Two is a record.',
  secondBody:
    'Rows in one register can point at rows in another — an invoice at the client it is for, a renewal at the project it belongs to — and that is where the record starts answering questions you did not ask it.',

  /* AND THE WORD *PACK*, FOR THE FIRST TIME IN THE PRODUCT, DEFINED IN PLACE. It does not appear on
     screen one at all: selecting a pack means reading an install diff written in the language of
     metrics and nav order, and asking somebody to approve four schema reviews before they have seen
     one of their own rows is worse than a tour. Here they have seen one. */
  secondPacks:
    'A pack is a register somebody else already worked out the fields for, with the metrics and the pages that go with it. Nothing installs without you reading what it would change.',

  /* MONEY IS AN INTEGER IN MINOR UNITS, and this is the one place a person types one. The sentence
     says what to do rather than what is wrong: "not a number" is a verdict, and "digits and at most
     one point" is an instruction. */
  moneyShape: 'An amount is digits and at most one point — 1234.56, or -50.',
  moneyPlaces: (exp: number): string =>
    exp === 0
      ? 'This currency has no smaller unit, so an amount is a whole number.'
      : `This currency goes to ${exp} decimal place${exp === 1 ? '' : 's'}, and a fraction of one is not an amount anybody can pay.`,

  /** The label above the first field. Written per choice, because "Your first money" is not English. */
  firstField: {
    obligations: 'Your first invoice',
    services: 'Your first renewal',
    people: 'The first person',
    things: 'Your first project',
    tasks: 'The first thing to do',
  } as Record<string, string>,

  /* THE OTHER WAY IN, and it is offered rather than buried. PostHog's install flow leads with
     `npx @posthog/wizard` and treats the in-product path as the alternative, which is the right
     read of who is arriving: somebody who already has an agent open would rather finish there than
     type rows into a browser.

     It stays an OFFER and never a requirement. First run has to work on a fresh self-host with
     nothing configured (19 §6), so nothing below this line is a step. */
  agentTitle: 'Set it up in your agent',
  agentBody:
    'The record is an MCP server. Add it once and the agent you already have can create the ' +
    'registers, fill the first rows, and read the record from then on.',
  agentCommand: 'claude mcp add --transport http braindog https://mcp.brain.dog',
  agentNote: 'Codex, Cursor and anything else that speaks MCP take the same URL.',
  agentCopy: 'Copy the command',
  agentCopied: 'Copied. Paste it where your agent is running.',

  /* the record's own colour */

  accentTitle: 'Accent',
  accentHint: 'The colour this record is. Every surface, ink and boundary is solved from it against the same contrast floors, so a colour that would be unreadable is refused rather than approximated.',
  accentHouse: 'House',
  accentSet: (name: string) => `${name} is this record's colour.`,
  accentReset: 'Back to the house colour.',

  /* the vocabulary, defined on first use, in place, once */

  defRow: 'one thing in a register. It has a number you can say',
  defPack: 'a file that adds registers and pages. Readable text; nothing runs',
  defPage: 'a screen made of blocks. It is a row, so you can change it',
  defBlock: 'one thing on a page: a table, a figure, a note',
  defTone: 'what a value means: good, watch, wrong, note',

  /** Names the source block so tabbing into it says which page's declaration it is. */
  declarationOf: (page: string) => `Source of ${page}`,

  /* the keymap sheet */
  keymap: 'Keyboard',
  keymapHint: 'Bare letters act only inside a focused grid.',
  scopeDocument: 'Anywhere',
  scopeGrid: 'In a grid',
  scopePage: 'On a page',
  scopeGate: 'At the gate',
  scopePalette: 'In the palette',
  scopeNav: 'In the sidebar',

  /* the mock-up's own line, and the only one that is about the mock-up */
  mockNotice: 'A frontend mock-up. Nothing writes, and no request leaves the page.',
} as const;

export type Copy = typeof copy;
