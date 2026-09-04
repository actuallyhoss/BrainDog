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
  removeBlock: 'Remove this block',
  addBlock: 'Add a block',

  /* Binding a saved view onto a page — 21 §3.4's sentence, with the two halves the view already
     answered stated rather than asked. */
  bindBlock: 'Bind as a block',

  /* THE ONE SENTENCE A MOCK-UP OWES ITS READER. A control that does nothing at all is
     indistinguishable from a broken one, so every action that cannot happen here says what it
     would have done and that it did not happen — once, in the toast, not as a disabled state.
     A disabled control tells you a thing exists and refuses to say why it will not work. */
  notWritten: (what: string) => `${what} — but nothing was written. This is a mock-up of the record.`,
  promoted: (title: string) => `${title} is in your nav, at the end of its section.`,
  showMe: 'Show me',
  thatIs: 'that is',
  asA: 'Draw it as',
  onPage: 'On the page',
  noDestination: (register: string) =>
    `No page requires ${register} yet, so there is nowhere for this to live. A page declares which registers it reads.`,
  willAdd: (kind: string, span: number) =>
    `Adds one ${kind} at the end of the page, ${span} of 12 columns wide. You can move and resize it there.`,
  bound: (kind: string, page: string) =>
    `Added a ${kind} to ${page}. Nothing was written — this is a mock-up.`,
  blockLink: 'a link to this block',
  blockAdded: (kind: string) => `Added a ${kind}. Nothing was written — this is a mock-up.`,

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
  kinds: {
    bar: 'amounts side by side, biggest first',
    gauge: 'one number against its target',
    chips: 'a few short facts in a row',
    spec: 'label, value, note — the workhorse',
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
    `${title} rearranged here. Nothing was written — this is a mock-up of the record.`,
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
  deferWhy: 'You are parking this question, not answering it.',
  deferHint: 'What has to happen first',
  deferAction: 'Park it',
  wakeOn: 'Wake me on',
  deferNote: 'It leaves Decide and comes back on that date.',
  deferred: (on: string) => `Parked until ${on}. Nothing was written — this is a mock-up.`,
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
  immutable: 'Decided rows are append-only. This one cannot be edited, including by you.',
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
  secretsLiveInTheVault: 'A key or a token goes in the Vault, never in a row. The row records what it opens.',
  savedNothing: 'Nothing was written. This is a mock-up of the record, not the record.',
  noFilters: 'This register declares no indexed fields, so there is nothing to filter on yet.',
  /* What a field CAN be filtered on, said plainly, instead of a disabled range control. */
  filterKind: (type: string) =>
    type === 'money' || type === 'int' || type === 'decimal'
      ? 'A range control for numbers is not built yet. Sort on the column instead.'
      : type === 'day' || type === 'instant'
        ? 'A date range is not built yet. Sort on the column instead.'
        : 'Search matches this field.',
  displayOptions: 'Display',
  display: 'Display',
  displayNote: 'What you see on this grid. It stays on this device and changes nothing in the record.',
  columns: 'Columns',
  always: 'always',
  showAll: 'Show them all',
  rowMenu: 'Actions for this row',
  archive: 'Archive',
  selected: 'selected',
  clear: 'Clear',
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
  pages: 'Pages and registers',
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
  packBlurb: 'A pack is a file that adds registers and pages. Readable text; nothing runs.',

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
  characterKeysHint: 'Single letters act on the focused grid. Turn them off and every modifier chord still works.',
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
    'Money, the estate it runs on, the people, the projects, and the decisions and the reasons for ' +
    'them — typed, versioned, and readable by every agent you use.',
  firstQuestion: 'Where do you want to start?',
  firstHint: 'One real row is enough. The rest of the record arrives as you need it, and you can delete this one.',
  firstChoices: [
    { key: 'obligations', label: 'Money', body: 'What you owe, and what you are owed.', field: 'What is it, and how much?' },
    { key: 'services', label: 'The estate', body: 'Domains, hosting, subscriptions, licences.', field: 'What renews, and when?' },
    { key: 'people', label: 'People', body: 'Clients, contractors, and who does what.', field: 'Who is it, and what are they for?' },
    { key: 'things', label: 'Projects', body: 'The things you run, and the plan for each.', field: 'What is it, and what is it for?' },
    { key: 'decisions', label: 'Decisions', body: 'The ones you keep re-making, and why.', field: 'What do you keep re-deciding?' },
  ],

  /* the vocabulary, defined on first use, in place, once */
  defRegister: 'a typed collection — obligations, domains, people',
  defRow: 'one thing in a register. It has a number you can say',
  defPack: 'a file that adds registers and pages. Readable text; nothing runs',
  defPage: 'a screen made of blocks. It is a row, so you can change it',
  defBlock: 'one thing on a page — a table, a figure, a note',
  defTone: 'what a value means: good, watch, wrong, note',

  /** Names the source block so tabbing into it says which page's declaration it is. */
  declarationOf: (page: string) => `Declaration for ${page}`,

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
