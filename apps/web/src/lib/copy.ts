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
  /* The rail's heading for the registers, hard-coded there and needed by the phone nav too. */
  lists: 'Lists',
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
  raiseIt: 'Open a question',
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
  bound: (name: string, page: string) => `Added a ${name} to ${page}. Nothing was written; this is a mock-up.`,
  blockLink: 'a link to this block',
  blockAdded: (name: string) => `Added a ${name}. Nothing was written; this is a mock-up.`,

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
    table: 'a list, in full',
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
  /* WHY THE COMMIT IS REFUSING, said where the refusal is. A decision is immutable once made, so the
     reason is the whole of what anybody reading it in six weeks will have. */
  reasonRequired: 'A decision is kept for ever and cannot be edited. Write why, and the button turns on.',
  reasonHint: 'Why this one, in a sentence somebody can read in six weeks.',
  reasonNudge: 'That will not mean anything in six weeks. Keep it anyway?',
  commit: 'Commit the decision',
  defer: 'Defer the question',
  decidedBy: 'Decided by',
  immutable: 'A decision cannot be edited once it is made.',
  noQuestions: 'Nothing to decide.',
  lastDecided: 'The last one was decided',

  /* the register grid */
  newRow: 'New',
  filter: 'Filter',
  done: 'Done',
  /**
   * VERB + NOUN, never "Save" or "Submit": the button says what will exist afterwards.
   *
   * IT WAS STATED HERE AND KEPT BY ABOUT HALF THE FILE. Fourteen labels were a bare verb or a
   * pronoun — `Add it`, `Back`, `Edit`, `Stop`, `Archive`, `Raise it`, `Add one`, `Done`, `Defer`,
   * `Open`, `Peek`, `Clear`, `Show me an example`, `Show them all`. Each is unambiguous while you
   * are looking at the thing it acts on and unreadable in a list of shortcuts, a screen reader's
   * control list, or a sentence quoting it. A CTA that needs its surroundings to mean anything is a
   * CTA that means nothing to somebody arriving at it from the side.
   */
  addRow: 'Add',
  noneChosen: 'None',
  yes: 'Yes',
  secretsLiveInTheVault: 'Keys and tokens go in the Vault. A row records what one opens.',
  savedNothing: 'Nothing was written. This is a mock-up of the record, not the record.',
  /**
   * WHAT A LEVEL MEANS, IN ONE CELL. There were two: a chip printing the enum (`write`) and, three
   * inches away, a sentence collapsing three levels into two with a ternary — so S. Marchetti's row
   * read `write` … `Read only`, two cells contradicting each other about who can change the
   * business record. The chip was also the schema's spelling, lower-cased, on the one screen where
   * a person decides who to trust.
   */
  /**
   * WHAT A RUN IS DOING, as a sentence rather than an enum.
   *
   * The chip beside it printed `running` and `failed` in the schema's own lower case, and the line
   * under it said "Running" unconditionally — so a failed run described itself as running, on the
   * screen somebody opens BECAUSE something went wrong.
   */
  /* WHEN A SCREEN DOES NOT LOAD. What was wrong · where · what to do — and the reassurance is a fact
     about the record rather than an apology: nothing was written, because this screen never got as
     far as writing. */
  screenFailed: 'This screen did not load.',
  screenFailedBody: 'Nothing was changed. Try again, and if it happens twice, quote the request below.',

  jobStatus: {
    running: 'Running',
    done: 'Finished',
    failed: 'Stopped after a step was refused',
    queued: 'Waiting to start',
  } as Record<string, string>,

  levelMeans: {
    owner: 'Can change everything, and invite people',
    decide: 'Can change rows, and answer questions',
    write: 'Can add and change rows',
    append: 'Can add rows, and not read the rest',
    read: 'Can read, cannot change',
  } as Record<string, string>,
  /* THE SAME ANSWER `/decide` GIVES TO THE SAME QUESTION. A disabled control says why it is
     disabled, and the register's own declaration is what says which fields cannot be left out — so
     the sentence names them rather than saying "some fields". */
  rowRequired: (names: string[]): string =>
    `${list(names)} cannot be left out. Fill ${names.length === 1 ? 'it' : 'them'} in, and the button turns on.`,
  /* AND IT POINTS RATHER THAN REPEATS. A money field already prints its own sentence under itself;
     copying that sentence into the footer put the same words on screen twice, six inches apart —
     which is the thing `/decide` was just fixed for. This one names the field and says where the
     reason is. */
  rowFieldProblem: (names: string[]): string =>
    `${list(names)} cannot be stored as typed — the reason is under the field.`,
  noFilters: 'Nothing here can be filtered yet.',
  /* WHERE A FIELD IS FILTERED INSTEAD, said once for all of them rather than as a headed section
     each. Three fieldsets carrying a legend and one sentence read as three controls that failed to
     render.

     ITS SIBLING SAID SOMETHING FALSE and is gone: "Due sorts on the column" named one field, and
     every column on the table sorts. A sentence explaining the interface is against the house rule
     to begin with; one that explains it wrongly teaches somebody the product is smaller than it is.
     Sorting is a fact about the table, and the table says it — every header is a button. */
  filterBySearch: (fields: string[]): string =>
    `${list(fields)} ${fields.length === 1 ? 'is' : 'are'} matched by the search box.`,

  displayOptions: 'Display',
  display: 'Display',
  displayNote: 'Only affects your view of this list.',
  columns: 'Columns',
  always: 'always',
  showAll: 'Show every column',
  rowMenu: 'Actions for this row',
  archive: 'Archive the row',
  selected: 'selected',
  clear: 'Clear the selection',
  /* The picker's two labels, written out rather than built by concatenation — the screenshot
     allow-list only keeps text a developer typed into source. */
  select: 'Select',
  deselect: 'Deselect',
  /* THE VERBS A SELECTION IS FOR. A selection with nothing to do with it is a mode you can enter
     and not leave usefully, which is what this one was: implemented, drawn, and consumed by
     nothing. Verb + Noun, like every other action here. */
  copyIds: 'Copy ids',
  setState: 'Set state',
  archiveSelected: 'Archive them',
  clearFilters: 'Clear filters',
  saveAsView: 'Save as a view',
  export: 'Export the record',
  requestAccess: 'Request access',
  tryAgain: 'Load it again',
  addOne: 'Add the first row',
  addTheRow: 'Add the row',
  /* The two questions an audit log exists to answer, as the labels of the two controls. */
  auditWho: 'Who',
  auditWhat: 'What kind of change',
  auditNone: 'Nothing in the log matches that.',
  /* THE INBOX. `pattern` and `claimed` are the schema's words for a thing a person would call a
     rule, and what they are being offered is not a pattern — it is what happens to the NEXT one. */
  ruleOffer: 'A rule that would have filed this, and the next one like it',
  makeRule: 'Make it a rule',
  notThisOne: 'Leave it for another rule',
  fileIt: 'File it as a row',
  archiveArrival: 'Archive the arrival',
  /* WHAT THE VERSION IS FOR, rather than what it is. Every change moves it by one, so it names a
     moment — which is the only thing anybody does with it. */
  auditVersion: (n: string): string =>
    `This record is at version ${n}. Every change moves it by one, so a version is a way of naming a moment.`,
  goBack: 'Choose something else',
  editRow: 'Edit the row',
  stopRun: 'Stop the run',
  verifyFile: 'Check an exported file',
  /* WHAT DELETING DOES, said instead of a one-word heading that states no fact. `Danger` was over
     `Delete this record` over `Delete the studio` — three lines, two of them the same sentence, and
     the two disagreeing about what the record is called. */
  deleteWhat: (record: string): string =>
    `Deleting ${record} removes every list, page and row in it. It cannot be undone.`,
  deleteRecord: (record: string): string => `Delete ${record}`,
  showExample: 'Show an example row',
  peek: 'Peek at the row',
  openRow: 'Open the row',
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
  /* `The Kennel` IS A COINED NOUN DEFINED NOWHERE IN THE PRODUCT. It is a good name for the place
     and a bad heading for a list of things somebody has not met yet — `packBlurb` says what one is
     and sat unused two hundred lines from the screen that needed it. */
  browse: 'Packs you can install',
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

  /* MONEY IS AN INTEGER IN MINOR UNITS, and this is the one place a person types one. The sentence
     says what to do rather than what is wrong: "not a number" is a verdict, and "digits and at most
     one point" is an instruction. */
  moneyShape: 'An amount is digits and at most one point — 1234.56, or -50.',
  moneyPlaces: (exp: number): string =>
    exp === 0
      ? 'This currency has no smaller unit, so an amount is a whole number.'
      : `This currency goes to ${exp} decimal place${exp === 1 ? '' : 's'}, and a fraction of one is not an amount anybody can pay.`,

  /* the record's own colour */

  accentTitle: 'Accent',
  accentHint: 'The colour this record is. Every surface, ink and boundary is solved from it against the same contrast floors, so a colour that would be unreadable is refused rather than approximated.',
  accentHouse: 'House',
  accentSet: (name: string) => `${name} is this record's colour.`,
  accentReset: 'Back to the house colour.',
  /* A FIGURE THAT CANNOT BE WORKED OUT, said to the person reading the tile rather than to whoever
     wrote the declaration. What was here was the author's sentence — "group_by: is published in 08
     and not read by this build", "{ lte: 400000 } for money in minor units" — under a headline
     figure, quoting a document number and a JSON literal at somebody with no control that edits a
     metric. The author's sentence still prints on the page block, beside the declaration. */
  figureUnavailable: 'This figure cannot be worked out from what is declared. The pack that owns it says why.',
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
        ? 'two of the four meanings — good, watch, wrong, note — would look the same to somebody who does not see red and green apart'
        : codes.includes('THEME_LADDER_ORDER')
          ? 'its surfaces would not stack in order, so a card would not read as sitting on the page'
          : 'a full palette cannot be solved from it';
    return `${name} cannot be this record's colour: ${why}. The other colours are unaffected.`;
  },

  /**
   * THE LOAD-BEARING NOUNS, one clause each, `19 §6`.
   *
   * Four, and the number was measured rather than chosen. Of the eight the rule names, `pack` is
   * already defined in place — "A pack adds ready-made lists and pages" is the first line of
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
    list: 'a list of one kind of thing, with the same fields on every row',
    row: 'one thing in a list. It has a number you can say',
    page: 'a screen made of blocks. It is a row, so you can change it',
    block: 'one thing on a page — a table, a figure, a note',
  } as const,

  /** Names the source block so tabbing into it says which page's declaration it is. */
  declarationOf: (page: string) => `Source of ${page}`,

  /**
   * A BLOCK ADMITS THAT IT IS SHOWING A SLICE.
   *
   * `limit:` is a reading cap and every page in the seed declares one — 8 on the project money
   * tables, 12 on "What is coming", 50 on "Who owes you" — and nothing rendered said so. Six blocks
   * across five pages were cut: `/p/marlow-co`'s Money drew 8 of the client's 12 obligations under a
   * heading that reads as the whole answer. Invisible at 9 rows and a lie at 400.
   *
   * IT SAYS BOTH NUMBERS AND WHERE THE REST ARE. "12 of 38" alone is a fact somebody can do nothing
   * with; the register, opened at the block's own predicate, is the rung that was missing.
   */
  ofWhichDrawn: (drawn: number, total: number) =>
    `Showing ${drawn.toLocaleString('en')} of ${total.toLocaleString('en')}`,
  openTheRest: (register: string) => `Open ${register} for the rest`,

  /* the keymap sheet */
  keymap: 'Keyboard',
  /* THE SIDEBAR CALLS IT A LIST AND THIS CALLED IT A GRID — one object, two names, both on screen
     in the same session, and one of them appearing only in the document that teaches the keyboard. */
  keymapHint: 'Bare letters act only inside a list you have clicked into.',
  scopeDocument: 'Anywhere',
  scopeGrid: 'In a list',
  scopePage: 'On a page',
  scopeGate: 'At the gate',
  scopePalette: 'In the palette',
  scopeNav: 'In the sidebar',

  /* the mock-up's own line, and the only one that is about the mock-up */
  mockNotice: 'A frontend mock-up. Nothing writes, and no request leaves the page.',
} as const;

export type Copy = typeof copy;
