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
  /* WHAT WOULD HAVE HAPPENED, AND THAT IT DID NOT. The second half used to name the build —
     "This is a mock-up of the record" — which `19 §9` bans and which answers a question nobody
     asked: the reader wants to know whether their action stuck, not what stage the software is at.
     Three sentences said it three ways; they say one thing one way now. */
  notWritten: (what: string) => `${what}, but nothing was saved yet.`,
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
  bound: (name: string, page: string) => `Added a ${name} to ${page}. Nothing was saved yet.`,
  blockLink: 'a link to this block',
  blockAdded: (name: string) => `Added a ${name}. Nothing was saved yet.`,

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
    `${title} rearranged here. Nothing was saved yet.`,
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
  deferred: (on: string) => `Parked until ${on}. Nothing was saved yet.`,
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
  /* THE ONE CONTROL THAT APPEARS WHEN THE NAV DOES NOT. It names the thing it brings back rather
     than the gesture that hid it: "Toggle the sidebar" is what the key sheet calls the chord, and a
     reader looking at a blank gutter does not know a toggle happened. */
  showSidebar: 'Show the sidebar',
  andMore: 'and more',
  /* THE OVERFLOW OF A FEED, as a count and a place to go. Home is not the log — `19 §2` gives that
     job to `/audit` — so what this screen owes a reader is how much it is not showing and the door
     to the rest, which is the same shape the needs-you list already uses. */
  moreInTheLog: (n: number) => `${n.toLocaleString('en')} more in the log`,
  /* WHAT THE PALETTE IS NOT SHOWING, and where the rest is. It printed eight hits and said nothing
     about the ninth — on the surface `19 §4` makes the primary way to reach a row, and with a
     round-robin that gives one hit per list, eight across nine lists is one row each. */
  /* `/search?q=` — `19 §2`'s spine screen, which the route directory did not have. `search` is
     already declared above, as the nav's own word for the same place. */
  searchRecord: 'Search the record',
  searchWaiting: 'Type to search the record.',
  /* NOT `noneMatching`, which counts the rows a LIST holds and reads "0 rows, none matching" here —
     a search is over every list at once, so there is no single total to count against. */
  searchNone: 'Nothing in the record matches:',
  searchWhere: 'Every list, every decision, and every page — by the words in them.',
  allIn: (n: number, list: string) => `All ${n.toLocaleString('en')} in ${list}`,
  allMatches: (n: number, q: string) => `All ${n.toLocaleString('en')} matches for “${q}”`,
  showingOf: (shown: number, total: number) => (shown >= total ? `${shown}` : `${shown} of ${total}`),
  markAllRead: 'Mark all read',
  /* THE `cleared` STATE FOR THE FEED, which is a feed you have worked through rather than a record
     with nothing in it. `19 §6` gives this state no action, because there is nothing to do. */
  nothingNew: 'Nothing new since you last looked.',

  /* decide and the gate */
  openQuestions: 'Open questions',
  rankedBy: 'Ranked by the cost of being wrong',
  costOfDelay: 'Cost of deciding late',
  theOptions: 'The options',
  recommended: 'Recommended',
  /* VERB + NOUN, which `19 §2` asks for and "Choose this" is not — it is verb plus pronoun, and
     the noun is a hundred and seventy pixels away in an `<h3>` nothing associates with the button.
     Three of them on `/decide/<id>` gave a screen reader the same three words three times, on one of
     the three spine screens; and at 390px the third button sits below the fold, so the option's name
     and the control that takes it are never on screen together. */
  chooseThis: (option: string) => `Choose ${option}`,
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
  /* A NAME FOR THE SEARCH BOX. It had only a placeholder, which is not an accessible name and
     disappears the moment somebody types — so the field announced itself right up until it had
     content, and then stopped. */
  searchIn: (name: string) => `Search ${name}`,
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
  savedNothing: 'Nothing was saved yet.',
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
    /* `20 §1`: `append` is *"`create`, `propose` and `log` — and no read … an appender sees nothing,
       **not even what it filed**"*. "Not the rest" said the opposite — that they can read their own
       submissions — which is wrong in the PERMISSIVE direction, on the control that decides who can
       see somebody's business. */
    append: 'Can add rows, and read nothing',
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
    `The box searches ${list(fields)}.`,
  /**
   * AND THE EMPTY STATE SAYS IT TOO, because that is where somebody is when it matters.
   *
   * The box is `34 §6`'s `matches` operator over the register's `search:` fields, which is narrower
   * than the scan it replaced — rightly, per `fts.ts` (*"an index over everything answers every query
   * with everything"*), and at a cost: an amount, a state word or a counterparty's name that used to
   * find rows now finds none. Enum words are recoverable from the chips in the same bar. A REF is
   * not: `party` and `thing` have no chip and no other text surface, so *"38 rows, none matching:
   * halden"* over a list where nine rows are Halden's is a dead end unless the screen says where the
   * words it does read come from.
   */
  searchesOnly: (fields: string[]): string => `This box reads ${list(fields)}. For anything else, use the filters above.`,

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
  /* WHAT THE LIST IS ORDERED BY. It lives beside the column list because both are answers to
     "what am I looking at", and on a phone this sheet is the only place either can be asked. */
  sortedBy: 'Sorted by',
  /* A DIRECTION IN THE FIELD'S OWN WORDS. An arrow on a column header sits on the thing it orders
     and needs no more; a chip in a sheet is read alone, and nobody calls an ascending date "lowest
     first". Six words rather than two, because a date, a number and a name each have their own. */
  oldestFirst: 'oldest first',
  newestFirst: 'newest first',
  lowestFirst: 'lowest first',
  highestFirst: 'highest first',
  aToZ: 'A to Z',
  zToA: 'Z to A',
  firstAdded: 'first added',
  lastAdded: 'last added',
  rowOrder: 'Back to row order',
  /* WHAT A FIGURE SAYS WHEN THE LIST UNDER IT IS EMPTY. Not a verdict — there is nothing to judge —
     and not silence either, because a bare `GBP 0.00` with no note beside it is the same tile a
     working figure draws. It names the list, so it points at what to do next. */
  nothingIn: (list: string) => `Nothing in ${list} yet.`,
  nothingDated: 'Nothing dated to walk yet.',
  /* A ROUNDED ZERO IS NOT A DIRECTION. "up 0%" gives a reader a way and a distance of nothing. */
  aboutTheSame: 'about the same',
  /* THE FIVE STATES, ON THE FOUR SCREENS THAT COULD NOT DRAW ANY OF THEM. `grep -c "<Empty"` was
     0 on Home, /audit, /packs and /vault — four surfaces with no way to tell "nothing here yet"
     from "nothing matched", which `19 §6` calls the failure by name. */
  /* THE RECORD ITSELF IS EMPTY, which is a different sentence from every list being empty and from
     nothing needing you. It is the state of the first hour and nothing could say it. */
  recordEmpty: 'Nothing in the record yet.',
  recordEmptyBody: 'A record holds what a business is made of — what you owe and are owed, what it runs on, who is involved, and the decisions behind them.',
  startHere: 'Start here',
  noPacksYet: 'No packs installed.',
  noPacksBody: 'A pack adds ready-made lists and pages. The ones below are ready to install.',
  matching: 'matching',
  backToView: 'Back to the saved view',
  openUnfiltered: (list: string) => `Open ${list}`,
  rowsWord: (n: number) => (n === 1 ? 'row' : 'rows'),
  noneMatching: (total: number, what: string) => `${total} ${what}, none matching:`,
  auditHolds: 'Every change to this record is appended here, with who made it and when.',
  vaultEmpty: 'No credentials indexed yet.',
  vaultHolds: 'A credential here is a note about what a key opens and when it was last rotated. The value itself is never in the record.',
  select: 'Select',
  deselect: 'Deselect',
  /* THE VERBS A SELECTION IS FOR. A selection with nothing to do with it is a mode you can enter
     and not leave usefully, which is what this one was: implemented, drawn, and consumed by
     nothing. Verb + Noun, like every other action here. */
  copyIds: 'Copy ids',
  /* THE REGISTER'S OWN WORD FOR ITS OWN COLUMN. `things` labels its state field **Status**, so a
     hardcoded "Set state" put one field's three names on one screen — `lane` in the schema, Status
     in the header, state on the verb, two of them visible at once. The menu's VALUES already come
     from the declaration, which is why they were right; only the verb was typed. It is wrong the
     first time anybody labels theirs, which is exactly what a pack author does. */
  setState: (field: string) => `Set ${field.toLowerCase()}`,
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
  /* A DAY-ONE SENTENCE, because this is now the `no-data-yet` title and the filtered case has its
     own. "Nothing in the log matches that" was drawn for both, so an empty record and a filter that
     missed said the same thing — and the empty record has not been asked anything. */
  auditNone: 'Nothing in the log yet.',
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

  /**
   * THE VAULT, AND THE ONE WORD IT MAY NOT USE.
   *
   * `19 §9` bans `key` outright — "say **field**" — and in the same table renames this screen's row
   * to **credential**, with the reason spelled out: "Not `key`, which this same table bans because
   * it means a JSON key." This blurb said `key` and the whole screen never said `credential` once.
   *
   * Two documents still say the wrong thing and will keep saying it: `19 §2`'s screen inventory
   * ("What each key opens") and `50 §2.2` ("what each key opens"). `19 §9` is the later, explicit
   * correction and names the collision it is fixing, so it wins.
   *
   * IT IS A DISPLAY RENAME ONLY. `grant`, `grant.read` and `grant.kind` stay as they are in the
   * schema, the API and the `.dog` — `19 §9` again: "renaming a column to improve a label is how a
   * spoken id stops resolving."
   */
  vaultBlurb: 'What each credential opens, and when each was last rotated. The value is never shown here.',
  opens: 'Opens',
  rotated: 'Rotated',
  reveal: 'Reveal once',
  revealWarning: 'Revealing is recorded in the audit log with your name on it.',
  /* `n` NOT ROTATED, said once. It was a hardcoded literal in the markup with this string sitting
     unrendered beside it — two sentences about one fact, and the one in `copy.ts` unreachable. */
  staleCount: (n: number) => `${n} not rotated in six months`,
  /* The five of `12 §6` and `30 §1`'s CHECK, as a reader says them rather than as the column
     stores them. `50 §10`'s precedent: "field labels are ids with `_` as a space." */
  credentialKinds: {
    api_token: 'API token',
    password: 'Password',
    ssh_key: 'SSH key',
    recovery_codes: 'Recovery codes',
    note: 'Note',
  } as Record<string, string>,

  /* packs */
  installed: 'Installed',
  /* `The Kennel` IS A COINED NOUN DEFINED NOWHERE IN THE PRODUCT. It is a good name for the place
     and a bad heading for a list of things somebody has not met yet — `packBlurb` says what one is
     and sat unused two hundred lines from the screen that needed it. */
  browse: 'Packs you can install',
  install: 'Install',
  uninstall: 'Uninstall',
  installDiff: 'What this adds',
  /* `04 §3`'s seven sections, in a person's words. Only the ones that say something render: a
     `CHANGES` heading over nothing is a warning that does not apply, and `06 §1` is that those
     teach people to ignore warnings. */
  diffAdds: 'Adds',
  diffChanges: 'Changes',
  diffConflicts: 'Conflicts',
  diffSeeds: 'Seeds',
  diffTouches: 'Touches',
  /* `04 §4`: a pack may place a page it owns and may never move yours. The move is SHOWN, so that
     the refusal is visible rather than silent, and then it does not happen. */
  diffNavKept: 'shown, not applied. Your sidebar is yours',
  diffUnread: 'This record has not read the pack yet, so the shape of each arrives with the file.',
  /* `02 §1`: a name another pack ships is a name this one cannot own, and the whole install is one
     transaction — so it does not half-apply.

     AND IT NAMES WHAT COLLIDES. "Installing is refused while a name collides" said the shape of the
     rule and not the fact: the reader is looking at a disabled button and the one thing they need is
     WHICH name, because it is the only part of this they can act on — drop the pack, or ask its
     author to rename. `10 §7`'s fourth rule, on a screen rather than in an envelope. */
  diffRefused: (names: string[]) =>
    `${names.join(' and ')} ${names.length === 1 ? 'is already a list' : 'are already lists'} on this record, and a pack cannot take a name another one owns. Nothing would be applied.`,
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
    page: 'a screen made of blocks. It is a row, so you can change it',
    block: 'one thing on a page — a table, a figure, a note',
  } as const,

  /* the settings areas `19 §2` says an earlier draft dropped */
  /* AND SO DOES THIS ONE. **Who can see this record · 4** stood over four rows, one of which is an
     invitation that has not been accepted, at level `append`, which reads nothing — so three of the
     four could see the record and the fourth could not, for two independent reasons, both printed
     within two hundred pixels of the heading counting them. */
  whoCanSee: 'People on this record',
  /* `19 §9` bans `ceiling` and `scope` by name and says: say WHAT THEY CAN SEE. And it says the
     thing this line exists for — a level here is over the whole record, not one list. */
  /**
   * IT ASSERTED TWO RULES THAT CANNOT BOTH BE TRUE, and each half was a real one.
   *
   * *"A level here covers every list. Nobody is added to a new list until you add them."* The first
   * clause is `45 §5.1` step 3 — the `'*'` row fills every register without one of its own, new
   * ones included. The second is `20 §1`'s *"a new register, entity or page is private until
   * granted"*. Both are true **of different rows of the matrix**: the `'*'` grant covers everything,
   * and somebody with no `'*'` row holds exactly the lists they were named on. The screen drew one
   * level per person, so there was no matrix for either clause to be about, and the sentence read as
   * a contradiction because on that screen it was one.
   */
  accessScope: 'A level here covers every list, including ones added later. Give somebody a different level on one list and it replaces it, for that list only.',
  levelFor: (name: string) => `What ${name} can do`,
  /* NOT A SIXTH LEVEL. `member` is a ROW that may not exist, and "no row" is a different answer from
     the lowest rung — `members.ts` shipped both wrong readings of that before settling on `null`. */
  noRecordLevel: 'nothing',
  noRecordLevelMeans: 'Nothing on this record itself — only the lists named below, and nothing that is added later.',
  addException: 'Different on one list',
  removeException: 'Back to their level',
  suspendedSince: (ago: string) => `stopped ${ago}`,
  sinceWhen: (ago: string) => `joined ${ago}`,
  /* AN INVITATION OUT IS NOT ACCESS, and the two were one row. Somebody who had invited a
     bookkeeper could not tell whether the link had been used. */
  inviteOut: 'invited, not accepted yet',
  /* THE READ MARK, WHICH `20 §6` PUTS ON THE *WORTH BUILDING* SIDE of its table: "who has seen the
     thing that binds them", against live cursors and avatar stacks on the other. A decision binds
     people who were not in the room, so whether they have looked is the question a record can
     answer and a chat cannot — and this screen showed what everybody MAY do and nothing about
     whether any of them had been. */
  lastLooked: (ago: string) => `last looked ${ago}`,
  /* NOT "never" ON ITS OWN, WHICH READS AS AN ACCUSATION and is ambiguous besides: somebody whose
     invitation is still out has also never looked, and that is a different sentence. This one is
     only ever drawn for somebody who has accepted. */
  neverLooked: 'has not opened it',
  /* WHAT THIS DEPLOYMENT IS, IN A WORD, AND NOT ONLY IN A COLOUR. `13 §5.1`: meaning may not live
     in the styling alone, so an accent a colour-blind reader cannot tell from production is a
     signal that is not there for them. The word sits beside the mark and in the page title, where
     it survives a screenshot and a tab strip; it is not a banner, because a banner is dismissed
     once and then absent for the rest of the session. Production has no word — the absence is the
     signal, and labelling the normal case trains people to stop reading the label. */
  alpha: 'Alpha',
  removeAccess: 'Remove',
  /* `LEVEL_REQUIRED`'s own fix sentence, verbatim (45 §5.6). */
  lastOwner: 'A record keeps at least one owner.',
  /* THE ONE ACTION THAT REMOVES YOUR OWN WAY BACK. `45 §5.6` gives every level change one method,
     and another owner can still do this to you — which is what a second owner is for. What is
     refused is doing it to yourself, alone, from the screen you would then be locked out of. */
  ownLevel: 'You cannot change your own level here. Another owner can.',
  inviteTitle: 'Invite somebody',
  inviteHow: 'The link is single-use, good for 24 hours, and bound to the one address you send it to.',
  invitePerson: 'Invite a person',
  erasePerson: 'Erase a person',
  eraseWhat: 'Everything one person wrote, removed from sixteen places in one go. It cannot be undone.',

  /* recovery — the way back in */
  passkeys: 'Passkeys',
  passkeyHow: 'A passkey is how you get back in. Keep more than one, on more than one device.',
  noPasskeys: 'No passkey yet.',
  /**
   * `13 §5.2`: be specific about what will be here. On this screen that sentence is the stakes —
   * AND THE STAKES DEPEND ON THE DEPLOYMENT.
   *
   * There was one sentence, ungated: *"Without one, the only way back into this record is an email
   * link."* The magic-link SECTION four blocks down is gated on `AUTH_METHODS.magic`, with a comment
   * quoting `49 §5.6` — *"so the screen never offers it"* — but the gate was on the section and not
   * on this. With no passkeys and no SMTP the screen read "the only way back in is an email link"
   * and then nothing, because the block that would have explained the link had deleted itself.
   *
   * That is the hole `19 §2` names by name — *"left a passkey-primary product with no designed way
   * back in"* — reopened inside the fix for it, on the one screen where believing a false promise
   * costs the record. `49 §5.7` has the self-host answer, and it is a person rather than a link.
   */
  noPasskeysWhy: (magic: boolean) =>
    magic
      ? 'Without one, the only way back into this record is an email link.'
      : 'This server cannot send an email link, so without a passkey there is no way back in on your own — ask whoever runs it.',
  addPasskey: 'Add a passkey',
  addedWhen: (ago: string) => `added ${ago}`,
  usedWhen: (ago: string) => `used ${ago}`,
  /* SHARED WITH THE KEYS LIST at the foot of `agents`, which says the same thing about a token
     nobody has presented. Two spellings of one sentence is how a product ends up saying "never used"
     in one list and "not used yet" in the next. (This note used to sit beside `endsWhen`, 154 lines
     down, explaining a key that was not the one under it.) */
  neverUsed: 'never used',
  remove: 'Remove',
  lastPasskey: 'This is your only passkey, so it cannot be removed. Add a second one first.',
  magicLink: 'If you lose them all',
  /* `49 §5.6`. It is the ONLY other way in — there are no recovery codes anywhere in this product,
     and saying so is kinder than letting somebody look for them. */
  magicHow:
    'A link is emailed to the address on this record. It lasts fifteen minutes and works once. There are no recovery codes.',
  lockout: 'After too many tries',
  /* `49 §5.5`: ten strikes, fifteen minutes, sticky, fail-closed. */
  lockoutHow: 'Ten failed attempts locks sign-in for fifteen minutes. Waiting is the only way through it.',

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
  noSuch: (kind: string, name: string) => `There is no ${kind} called ${name}.`,
  /* A ROW IS NAMED BY ITS NUMBER, and "no obligation CALLED #9999" is not English. `19 §642`: a row
     "has a number you can say" — so the sentence says it the way somebody would. */
  noSuchNumber: (one: string, seq: number | string) => `There is no ${one} #${seq}.`,
  theseExist: (kind: string, names: readonly string[]) =>
    `${kind} on this record: ${names.join(' · ')}.`,

  /* export — `03 §1`'s three layers, and the two containers `03 §2.1` keeps apart */
  yourData: 'The whole record',
  /* IT IS A SQLITE FILE AND THAT IS THE WHOLE TRICK (`03 §2`). Saying so is the difference between
     a promise and a checkable fact: `sqlite3 portfolio.dog "select …"` works with no SDK, no import
     step and no reader of ours. */
  exportWhat:
    'One .dog file: a SQLite database you can open with sqlite3, or anything that reads one. No import step, no reader of ours.',
  /* `03 §1`: the three layers are addressable independently, and the governance layer alone IS a
     pack. A product whose only exit is all-or-nothing has three exits it is not offering. */
  takeAway: 'Part of it',
  takeAwayWhat: 'The way you work and the rows you have written are separate things, and either can leave on its own.',
  exportPack: 'Export the way you work',
  exportRows: 'Export the rows only',

  /* identity — `33 §10`: login is account-level, so this lives outside the record */
  you: 'You',
  signedInAs: 'Signed in as',
  onThisRecord: 'On this record',
  identityOutside:
    'Your sign-in belongs to you rather than to this record, so it is the same across every record you hold.',
  yourRecords: 'Records you can open',
  thisOne: 'you are here',

  /* agents — `12 §6.1`'s device grants */
  /* THE HEADING SAYS WHAT IT COUNTS. It said **Connected machines** over four rows whose own state
     words are `connected`, `connected`, `waiting for you`, `you said no` — so the number counted two
     machines the same screen calls not-connected. A previous fix reasoned carefully about the
     NUMBER, concluded "if the heading is to say `active`, it has to say so in the heading", and left
     the heading saying Connected. This is the other half of it. */
  connected: 'Machines that have asked',
  /* `13 §5.2` GIVES `no-data-yet` A CONTENT CONTRACT: what this is for, and — where it applies — the
     copyable prompt. Four settings areas rendered a heading, a `0` and an empty `<ul>`; these two
     are the ones where a machine or a connector is what fills the list, so the prompt is the thing
     that fills it. */
  noDevices: 'No machine has asked yet.',
  noDevicesWhy: 'A machine that wants to act as you asks here first, and waits until you say yes.',
  enrollPrompt: 'braindog runner enroll',
  noSources: 'Nothing feeds this record yet.',
  noSourcesWhy: 'A connector pulls rows in on a schedule — a mailbox, a bank feed, a repository — and reports here when it fails.',
  ingestPrompt: 'read my record, then set up a connector for the mailbox I file invoices in',
  noSnapshots: 'No sealed copy yet.',
  noSnapshotsWhy: 'A snapshot is the whole record at one moment, kept so you can go back to it.',
  connectedHow: 'A machine asks, and you approve it here on a device you are already holding.',
  /* ALL SIX THE RECORD CAN BE IN, and four of them had a word.

     `approved` is the state a row sits in between your click and the machine's next poll — up to
     five seconds, and longer if the machine has gone away — so a screen without it has no way to
     tell you that approving worked. `expired` is what a pending row becomes ten minutes after it
     was made, which is the most common end a device grant has. Both were reachable in the DDL and
     unnameable on the screen. */
  deviceState: {
    pending: 'waiting for you',
    approved: 'approved — waiting for the machine',
    active: 'connected',
    expired: 'ran out of time',
    /* `12 §6.1`: a denied row is KEPT. "I said no to a request I did not make" is the single most
       important line this table can produce. */
    denied: 'you said no',
    revoked: 'you disconnected it',
  } as Record<string, string>,
  overSurface: (surface: string) => `over ${surface}`,
  askedWhen: (ago: string) => `asked ${ago}`,
  approve: 'Approve',
  deny: 'Deny',
  revoke: 'Disconnect',

  /* WHAT APPROVING IT WOULD ALLOW — `49 §5.9` step 2.3, *"the screen said what it was about to grant
     before the click"*, which the row could not say because it did not carry the reach.

     THE SIX ARE NOT ONE THING WITH SIX NAMES. Two mint a bearer good for ninety days; the other four
     are one operation, ten minutes, single-use (`48 §13 D1`). That difference is the entire decision
     a person is making, so each sentence says the life as well as the power. `19 §9` bans `scope` on
     a screen — "say what they can see" — so none of these is a word from the schema. */
  reachMeans: {
    login: 'sign in as you, for ninety days',
    runner: 'claim jobs and run code as you, for ninety days',
    export: 'take one copy of this record, once, in the next ten minutes',
    import: 'load rows into this record, once, in the next ten minutes',
    pack: 'install one pack, once, in the next ten minutes',
    token: 'make one more key, once, in the next ten minutes',
  } as Record<string, string>,
  /* `30 §1` calls `ua` "client-supplied — shown to the approver, TRUSTED FOR NOTHING", so the
     sentence says who is claiming it rather than stating it as fact. A machine that lies about what
     it is has told you nothing; a machine quoted as claiming something has told you what it claims. */
  saysItIs: (ua: string) => `says it is ${ua}`,
  /* For the four operation reaches `ua` is not a user agent at all — `48 §5.2` sends the command's
     `subject` in that column, which is the thing that would be exported, imported or installed. It
     is the only part of an operation grant that makes it decidable. */
  aboutWhat: (subject: string) => `about ${subject}`,

  /* the code-entry control — `19 §2` names it as one of this area's three things, and the screen
     had zero `<input>` in `<main>`. Four documents make this address the `verification_uri` a
     machine prints (`33 §10`, `49 §5.9`, `26 §2.3`, `53 §5`), so the person arriving here is
     holding six digits and looking for somewhere to put them. */
  enterCode: 'A machine showing a code',
  /* `12 §6.1`: "The code is not the security … what the code proves is that the approver is looking
     at the device that asked." The sentence says the same thing without saying it about security. */
  enterCodeHow: 'A machine asking for access shows six digits. Typing them here is how you say the machine in front of you is the one that asked.',
  codeLabel: 'The six digits it is showing',
  codeGo: 'Approve it',
  approvedNow: (label: string, means: string) => `${label} is approved — it can ${means}. It becomes connected the next time it asks.`,

  /* the tokens — `12 §3`, and the first of this area's three things to have no surface at all.

     *"Every token records `last_used_at` and the surface it was used from, and the app lists them
     with a revoke button. A credential you cannot see being used is a credential you cannot know is
     stolen."* The screen listed the machines that had ASKED, which is the request and not the
     result, so nothing in the product answered *what can act as me right now*. */
  keys: 'What can act as you',
  keysHow: 'Each of these was made when you approved a machine. Revoking one stops it working immediately, without ending your own session.',
  noKeys: 'Nothing can act as you.',
  noKeysWhy: 'Approving a machine makes one of these. Until then, only your own session can reach this record.',
  /* `19 §9` again: never `scope`, and never the three words from the ladder either. What it can do,
     said as what it can do. There is no fourth and there is deliberately no `admin` (ADR-060) — an
     agent may put a question in front of a person and may not answer its own. */
  keyCan: {
    read: 'can read, and change nothing',
    propose: 'can read and suggest, and change nothing itself',
    write: 'can read and change rows',
  } as Record<string, string>,
  madeWhen: (ago: string) => `made ${ago}`,
  endsWhen: (when: string) => `ends ${when}`,
  revokeKey: 'Revoke',

  /* ingest — `25 §9` draws this screen */
  sources: 'Where rows come in from',
  sourcesHow: 'Each of these fetches on its own schedule. Nothing here writes without a receipt.',
  sourceState: { ok: 'working', failing: 'failing', paused: 'paused' } as Record<string, string>,
  lastRan: (ago: string) => `last ran ${ago}`,
  nextRun: (ago: string) => `next ${ago}`,
  noNextRun: 'nothing scheduled',
  pointsIn: (n: number) => `${n.toLocaleString('en')} in`,
  reconnect: 'Reconnect',
  retryNow: 'Retry now',
  /* `25 §9`'s own blockquote, and it outranks the screen it is on. */
  staleShows: 'A figure fed by one of these shows a gap and says it is stale rather than holding yesterday’s number.',

  /* notifications — `09` specifies the mechanism and no settings, so this reports */
  whenWeInterrupt: 'When this record interrupts you',
  batchByDefault: 'Batch by default; interrupt by exception.',
  quietHours: 'Quiet hours',
  quietHoursAre: '22:00 to 08:00 in this record’s timezone. Anything not urgent waits until they end.',
  urgentKinds: 'Urgent',
  urgentKindsAre: 'A payment failing, a credential expiring inside 48 hours, a domain expiring inside 7 days.',
  interruptCap: 'At most',
  interruptCapIs: 'One urgent interruption an hour.',
  unreadCount: 'Unread',
  unreadCountIs: 'One number, on the record, in one place.',
  muteAtSource: 'To stop one of these, change the rule that raises it. There is no switch here that would.',

  /* backups — `53 §5.4` */
  kept: 'What is kept',
  /* ONE SENTENCE SAID BOTH HOSTS' POLICIES AND WAS RIGHT ON NEITHER: "nightly, at 03:00. The 30
     newest are kept." `53 §4` gives Cloud `17 3 * * *` UTC and *"the 30 newest dated keys plus
     `latest`"*; `49 §5.13` gives a self-host 02:00 UTC plus `hash(slug) mod 60` minutes and thirty
     files. And Cloud's real promise is the bigger one — any point in thirty days — which the shared
     sentence obscured by talking about the nightly copies. */
  /* navigation — `29 §4`'s one global switch, which `19 §2` says is why this area exists */
  suggestPages: 'Suggest new pages',
  suggestPagesHint: 'When a list grows or you keep asking the same question, this record offers a page for it. Nothing is ever placed for you — an offer sits in the list below until you promote it.',
  suggested: 'Waiting for you',
  suggestOff: 'Not offering anything.',
  suggestOffWhy: 'Pages you have already placed are untouched. Turn this back on and the record starts offering again.',
  perDevice: 'This setting is remembered on this device.',

  /* the signing key — `53 §4` puts the public half on the export screen, and `03 §4` says why */
  theSignature: 'How anybody checks a copy is yours',
  /* IT SAID ANYBODY COULD FETCH IT AT `/.well-known/braindog-key`, and there is no such route in
     any of the three apps — the one sentence on this screen asserting a live endpoint, where every
     other unwritten action goes through `notWritten`. `03 §4` specifies the URL; the product has not
     got it yet, and the sentence says what is true today. */
  theSignatureIs: 'Every export and every backup is signed. This is the public half of the key that signs them, and it opens nothing — which is why it is safe to hand to anybody checking a copy.',
  keyFingerprint: 'Fingerprint',
  keyPublic: 'Public key',
  copyKey: 'Copy the key',
  keyCopied: 'Public key copied',
  verifyHow: 'Hand it to somebody with a copy of your record and they can prove it came from here and that no row has changed since. Without it they can prove the file is whole, but not where it came from.',

  /* deletion — `02 §9`: browser session, re-authenticated, the slug typed */
  /* `deleteWhat` ALREADY SAYS "It cannot be undone", one line above this on the screen — in the
     section whose own comment condemns *"three lines, two of them the same sentence"*. This one
     carries what `deleteWhat` does not: how long a change of mind lasts, and when the last copy is
     gone (`53 §5.9`). */
  deleteCosts: 'A final copy is kept for the rest of today, in case you change your mind within the hour. Within thirty days nothing of this record is left anywhere.',
  typeSlug: (slug: string) => `Type ${slug} to confirm`,

  keptCloud: (n: number) => `A sealed copy of the whole record every night. The ${n} newest are kept, plus the latest.`,
  keptSelfHost: (n: number) => `A sealed copy of the whole record every night, on this machine. The ${n} newest are kept.`,
  snapshotFailed: 'nothing kept',
  download: 'Download',
  restoreTo: 'Restore to a time',
  findTheMoment: 'Find the moment',
  restoreLoses: 'What it costs',
  restoreLosesWhat: 'Every change made after the moment you pick. There is no way to bring them back except restoring forward again.',
  restoreBack: 'If it was wrong',
  restoreBackHow: 'Restore to the instant just before — that is a point in time too, for thirty days.',
  rowsAndSize: (rows: number, size: string) => `${rows.toLocaleString('en')} rows · ${size}`,
  snapshotNow: 'Take one now',
  theKey: 'The key',
  /* `49 §8` asks for exactly this line. */
  theKeyIs:
    'These copies are sealed with a key that is not inside them. Back that key up somewhere else, or the copies cannot be opened.',
  restore: 'Going back',
  restoreSelfHost: 'This record is self-hosted, so going back means restoring one of the copies above by hand.',
  restoreCloud: 'Any point in the last thirty days, not only the nightly copies.',

  /* billing — nothing to bill on a self-host (23 §8: one line in Settings) */
  billing: 'Billing',
  billingSelfHost: 'This record runs on your own machine. There is nothing to bill and no subscription to lapse.',
  billingCloud: 'Payment is up to date. If it ever lapses the record turns read-only, and export keeps working.',

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
    `The next ${drawn.toLocaleString('en')} of ${total.toLocaleString('en')} movements over ${days} days`,

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

  /**
   * WHAT IT MEANS TO THE READER, not what it is to whoever built it.
   *
   * It read *"A frontend mock-up. Nothing writes, and no request leaves the page."* on all twelve
   * settings areas, on `/jobs/<id>` and on `/decide/<id>` — `19 §9` names `mock-up` as internal
   * vocabulary reaching a user, and `access.test.ts` was written to forbid exactly this, but forbade
   * one literal that has since been deleted while the bigger call site stayed. "Nothing writes" is
   * the schema's word for it; "no request leaves the page" is a fact about the network that no
   * reader asked for. What they need is whether their typing survives.
   */
  mockNotice: 'Nothing you do here is saved yet.',
} as const;

export type Copy = typeof copy;
