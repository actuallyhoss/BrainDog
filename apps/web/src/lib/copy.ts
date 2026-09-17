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

/**
 * `a` or `an`, for a noun this file does not know in advance.
 *
 * THE CAPTURE FIELD SAID "Add a item". It is the label AND the placeholder of the first control on
 * every register screen, drawn from the register's own `one:`, and two of the nine the seed ships
 * are wrong: `item` gives "Add a item" on Money, which is the first list in the rail and the first
 * list anybody opens, and `update` gives "Add a update". A pack may ship any noun at all, so this
 * cannot be fixed by editing the seed: the sentence is generated and the generator has to know.
 *
 * IT IS ABOUT SOUND AND NOT ABOUT LETTERS, which is why the naive vowel test is not enough in
 * either direction. `user`, `unit`, `usage` and `unique` all begin with a vowel and take `a`,
 * because they are said with a `y` in front. `hour` begins with a consonant and takes `an`. The
 * `u` rule below is the one heuristic that earns its place: a `u` whose third letter is a vowel is
 * almost always the `yoo` sound (`user`, `unit`, `usage`, `utility`, `unique`), and one whose third
 * letter is not is almost always the `uh` sound (`update`, `upgrade`, `umbrella`). Measured over
 * the nouns this product can plausibly meet, it is right every time.
 *
 * The silent `h` is a closed list rather than a rule because there is no rule: four words in
 * ordinary English, and a business noun is almost never one of them.
 */
const SILENT_H = /^(hour|honest|honour|honor|heir)/;
const article = (noun: string): string => {
  const w = noun.trim().toLowerCase();
  if (SILENT_H.test(w)) return 'an';
  if (/^u/.test(w)) return /^u[^aeiou][aeiou]/.test(w) ? 'a' : 'an';
  return /^[aeio]/.test(w) ? 'an' : 'a';
};

export const copy = {
  /* the product */
  product: 'BrainDog',
  /**
   * THE SLOGAN, AND THERE IS ONE. Not a description of the product, which the sentence under it
   * does; a thing a person remembers. It is the README's headline, the marketing site's, and this,
   * and the three are the same five words on purpose: a product with three taglines has none.
   *
   * It read "Everything about your business that isn't code." for the life of the build, which is a
   * definition rather than a promise, and it was rendered nowhere.
   */
  tagline: 'Give your business a memory',

  /* the spine */
  home: 'Home',
  decide: 'Decide',
  inbox: 'Inbox',
  search: 'Search',
  /* The rail's heading for the registers, hard-coded there and needed by the phone nav too. */
  lists: 'Lists',
  packs: 'Add-ons',
  vault: 'Vault',
  settings: 'Settings',
  audit: 'History',
  more: 'More',
  close: 'Close',

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

  /* Putting a saved view onto a page. `21 §3.4`'s sentence, with the two halves the view already
     answered stated rather than asked.

     `Put this on a page` AND IT WAS `Bind as a block`. Two invented words in a three-word button:
     nothing in the product ever says what binding is, and `block` is defined once, on a different
     screen, once per device, for ever. A button is the wrong place to introduce a vocabulary. */
  bindBlock: 'Put this on a page',

  /* THE ONE SENTENCE A MOCK-UP OWES ITS READER. A control that does nothing at all is
     indistinguishable from a broken one, so every action that cannot happen here says what it
     would have done and that it did not happen — once, in the toast, not as a disabled state.
     A disabled control tells you a thing exists and refuses to say why it will not work. */
  /** What to do with something the record noticed: put it where things get decided. */
  raiseIt: 'Open a question',
  /** The way from a session to the run behind it: the tool calls, in order, with their answers. */
  watchRun: 'Watch the run',
  /**
   * TWO SCREENS DRAW WORKED EXAMPLES AND NEITHER OF THEM SAID SO.
   *
   * A run's transcript and a shared page are both written into the app rather than read from a
   * record: there is no method that answers with a run's tool calls, and a share token resolves to
   * nothing, so the same rows are drawn whichever record the reader is signed in to. Somebody
   * looking at their own record was shown invented rows with nothing to tell them apart from theirs,
   * which is worse than an empty screen.
   *
   * SO THE SCREEN SAYS WHICH IT IS, in the sample bar's register and no louder. It states the fact
   * and stops: what the reader needs is to know these rows are not theirs, not an account of why.
   */
  exampleRun: 'This is an example run, and not one from your record.',
  exampleShared: 'This is an example of a shared page, and not data from a record.',
  /** The predicate of an unfiltered list, said as a person would say it. */
  everything: 'everything in it',
  /* WHAT WOULD HAVE HAPPENED, AND THAT IT DID NOT. The second half used to name the build —
     "This is a mock-up of the record" — which `19 §9` bans and which answers a question nobody
     asked: the reader wants to know whether their action stuck, not what stage the software is at.
     Three sentences said it three ways; they say one thing one way now. */
  notWritten: (what: string) => `${what}, but nothing was saved yet.`,
  promoted: (title: string) => `${title} is in your nav, at the end of its section.`,
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
    feed: 'what agents, rules and you did since you last looked',
    agents: 'what each agent did, grouped by agent',
    diff: 'how a text changed, line by line',
    sparkline: 'a figure with the run of numbers that led to it',
    split: 'one total cut into its parts',
    bridge: 'how a start became an end, step by step',
  } as Record<string, string>,
  arrangedNotSaved: (title: string) =>
    `${title} rearranged here. Nothing was saved yet.`,
  arrangeNothing: 'Nothing moved.',
  arranged: (title: string) => `${title} rearranged.`,
  arrangeTemplate: 'This page is drawn once for each row from one shared layout, so it cannot be rearranged from one of those rows.',
  arrangeMoved: 'This page changed while it was being arranged. Open it again, then arrange it.',
  blockAddedLive: (name: string) => `Added a ${name}. Press Done to keep it.`,
  switchRecord: 'Switch record',
  recordSettings: 'Record settings',
  newRecord: 'New record',
  /**
   * WHAT THE OTHER RECORD WOULD OPEN WITH, AND IT SAID `registers`.
   *
   * The rail's switcher and the Settings list of records are two surfaces offering one act, so
   * they were already typed as one sentence — twice, once in each file, neither of them here.
   * `lists` is the word the rail's own heading uses and the word this file has settled on; the
   * sentence behind the press kept the schema's word because a rename can only reach text that
   * exists before somebody presses something, and this text does not.
   *
   * It is one key now, so the next rename reaches both call sites or neither.
   */
  otherRecord: (name: string) => `${name} would open, with its own lists and pages`,
  recordNotOpened: 'That record could not be opened just now. Try again in a moment.',
  recordOpenSignIn: 'Sign in again to open another record.',

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
  /**
   * IT CLAIMED SUCCESS IN THE PAST TENSE FOR SOMETHING THAT DOES NOT PERSIST.
   *
   * `Archived tasks#9.` with an Undo beside it, and a reload brings the row back. A friction pass
   * listed it under "things that lie", and it is the sharpest kind of lie this product can tell:
   * every other write control in the app says `notWritten`, so a reader learns that this product
   * tells them when nothing happened, and then meets the one that does not.
   *
   * THE ROW ITSELF NOW CARRIES THE RECEIPT, so the toast is the backup for a row that has scrolled
   * away, and it says the same thing the chip says. The past tense goes with the claim.
   */
  archived: (id: string) => `${id} would be archived. Nothing was saved yet.`,
  restored: (id: string) => `${id} is back. Nothing had been saved.`,
  marked: (id: string, state: string) => `${id} would be ${state}. Nothing was saved yet.`,
  copied: (what: string) => `Copied ${what}.`,
  copyRefused: 'The browser would not give this page the clipboard.',

  /* The chip on a row that has just been acted on. One word, in the past tense, so the row says
     what happened to it where the row is rather than in a toast at the other end of the screen. */
  /* The bar over a sample record. It says what the record is, and where the way out is: a stranger
     landing on somebody else's company with no explanation is the first screen this product had. */
  sampleWhat: 'This is a sample record.',
  densityPreview: 'How a list looks',
  sourcesAdd: 'New sources arrive the way new lists do: with an add-on, or set up by your assistant.',
  sourcesAddGo: 'Browse add-ons',
  densityPreviewRows: ['Invoice 2026-041, brand system', 'Studio insurance, annual', 'VAT quarter to 31 Aug'],
  sampleWhy: 'A small business, made up, so you can see what a record holds. Nothing you do here is saved.',
  sampleStart: 'Start your own',
  samplePutAway: 'Put this away',

  /* What a board and a checklist say when they move something the record has not been given yet.
     The mark on the card or the row is the answer; this is for the reader whose card has scrolled
     away, which is the same division `archive` makes on the register list. */
  cardMovedTo: (title: string, to: string) => `${title} would move to ${to}, and nothing was saved yet.`,
  taskTicked: (title: string, done: boolean) =>
    `${title} would be marked ${done ? 'done' : 'not done'}, and nothing was saved yet.`,
  cardFallback: 'The card',

  /* Answering a question where it is drawn. The options used to be a printed span inside the card's
     own link, so the thing that looked like the answer was decoration and answering meant a second
     screen and a paragraph of prose. */
  answeredOption: (option: string) => `Answered: ${option}`,
  takeItBack: 'Take it back',
  /* The visible words start the accessible name rather than being a different sentence, so "take it
     back" said out loud reaches the control a person is looking at (WCAG 2.5.3). */
  takeItBackOf: (title: string) => `Take it back: ${title}`,
  whyForLater: 'Why, for whoever reads this in six weeks',
  reasonMissing: 'No reason yet. The answer is kept either way, and in six weeks it will say what was chosen and not why.',
  reasonThinNudge: 'That will not mean much in six weeks. It is kept either way.',

  /* What the record would do, appended to a decision's second line on Home, so "what needs you"
     shows its thinking rather than four questions and none. */
  suggestedAnswer: 'Suggested:',
  /* Which way an obligation runs, on the second line of its row on Home. */
  owedToYou: 'Owed to you',
  youOwe: 'You owe',
  toDecide: 'to decide',

  rowActions: 'What you can do here',
  editValue: (field: string) => `Change ${field.toLowerCase()}`,
  /* WHY THIS CELL IS NOT THE EDITOR, said when somebody asks for it rather than only drawn.
     The pencil appears on an editable cell and on no other, which answers the question for anybody
     looking at that cell with a pointer. `e` is a keyboard binding on a sheet that advertises it
     for every cell, so pressing it on a money or a ref did nothing at all and said nothing: the
     silence a bound key is never allowed to answer with (19 §4). */
  cellOpensRow: (field: string, why: string) =>
    `${field} is ${why}, so it is changed on the row rather than in the list. Open the row to change it.`,
  /* ONE REASON PER TYPE, AND THERE WERE TWO REASONS FOR SIX TYPES. The first version of this
     branched on `money` and gave everything else "a row in another list", so pressing `e` on an
     update's `When` answered *When is a row in another list*, which is not true of an instant and
     is not true of a document either. A wrong sentence is worse than the silence it replaced,
     because silence is not a claim. Anything not named here falls back to the shape of the value,
     which is the one thing that is true of all of them. */
  cellWhy: {
    money: 'an amount and a currency',
    ref: 'a row in another list',
    document: 'a piece of writing rather than a value',
    instant: 'a moment down to the second',
    duration: 'a length of time with its own unit',
    bool: 'a yes or no with nothing to type',
    secret: 'held by the vault and never drawn in full',
  } as Record<string, string | undefined>,
  cellWhyElse: 'more than one value',
  /* AND A COLUMN THAT IS NOT A FIELD AT ALL. The picker and the row's verbs are controls rather
     than values, and `e` on one of them did nothing and said nothing: `19 §4` is that the sheet
     documents the bindings by reading them, so a key it prints for the grid has to answer wherever
     the caret is. It became reachable the day clicking a cell started moving the caret to it. */
  cellNoValue: 'That column is a control rather than a value, so there is nothing in it to change.',
  setTo: (state: string) => `Set to ${state}`,
  markArchived: 'Archived',
  markNotWritten: 'Not saved',
  /* AND THE SAME FACT, WHEREVER YOU ARE STANDING. A row typed on the first run and left behind is
     unwritten, and the only screen that said so was the list it belongs to, which is the one screen
     the person has already walked away from. The shell says how many there are and where they are.

     IT IS GONE AT ZERO, and that is the honest part: a nought drawn here would be the shell
     reporting on a thing that has not happened. */
  unsavedRows: (n: number) => (n === 1 ? 'One row you typed has not been saved.' : `${n} rows you typed have not been saved.`),
  unsavedRowsWhy:
    'Each one is at the top of the list it was typed into, marked Not saved, and it lasts until this tab is closed or reloaded.',
  markNeeds: (fields: string) => `Needs ${fields}`,
  undoRow: 'Put back',
  /* WHAT A ROW IS CALLED WHEN IT HAS NO NAME YET. `undoRowOf` puts the row's title in the control's
     accessible name, and a row typed into the capture line has a title only if the capture WAS the
     title; the grid falls back to `#<seq>`, which for a pending row is the negative sentinel. */
  thisRow: 'this row',
  /* The confirmation AFTER `Put back`, and not a second copy of the button. A toast that
     repeats the verb reads like the command rather than like the outcome, which leaves
     somebody pressing it again to find out whether the first press worked. */
  undoneRow: (row: string) => `${row} was taken back. It was never saved.`,
  undoRowOf: (row: string) => `Put ${row} back`,
  archiveRow: (row: string) => `Archive ${row}`,
  moreOn: (row: string) => `More on ${row}`,

  /* The capture line: one field at the top of a register, and the only decision in it is the words.
     IT SPELT THE ARTICLE ITSELF and got it wrong on two of the nine registers the seed ships. */
  captureIn: (one: string) => `Add ${article(one)} ${one.toLowerCase()}`,
  captureAdd: 'Add',

  /* home */
  needsYou: 'What needs you',
  /* THE BAND OF FIGURES, AND IT WAS A LITERAL IN THE SCREEN. Every other title on this page comes
     from here; this one was typed as `title="Right now"` in the markup, where `19 §9`'s vocabulary
     cannot see it and `dead-copy` cannot count it. */
  rightNow: 'Right now',
  sinceAway: 'Since you were away',
  nothingNeedsYou: 'Nothing needs you today.',
  /* THE TWO HALVES OF ONE CONTROL, AT THE HEAD OF THE RAIL. Each names what it will do rather than
     the gesture that got you here: "Toggle the sidebar" is what the key sheet calls the chord, and
     a reader looking at a column of glyphs does not know a toggle happened. */
  showSidebar: 'Show the sidebar',
  collapseSidebar: 'Collapse the sidebar',
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
  searchWaiting: 'Find anything in the record',
  /* NOT `noneMatching`, which counts the rows a LIST holds and reads "0 rows, none matching" here —
     a search is over every list at once, so there is no single total to count against. */
  searchNone: (q: string) => `Nothing matches “${q}”`,
  /* THE NEXT STEP, NOT A WAY OUT (DESIGN-SYSTEM APPENDIX C15): what to change about the words, and the one
     other place a thing that is not in a list may have been. */
  searchNoneNext: 'Check the spelling or try fewer words. A row that was archived or changed still shows in History.',
  searchClear: 'Clear the search',
  searchInHistory: 'Open History',
  searchWhere: 'Every list, every decision, and every page, by the words in them.',
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
  recommended: 'Suggested',
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
  commit: 'Record the decision',
  defer: 'Defer the question',
  decidedBy: 'Decided by',
  immutable: 'A decision cannot be edited once it is made.',
  noQuestions: 'Nothing waits on you',
  lastDecided: 'The last one was decided',
  /* A LIVE RECORD: what `decide` answered, and the two words a proposal that is not a choice takes. */
  acceptIt: 'Accept',
  rejectIt: 'Reject',
  decisionRecorded: (option: string, id: string) => `${option} is recorded as the decision on ${id}.`,
  parkedUntil: (on: string) => `Parked until ${on}.`,
  changedSince: 'A row this would change has changed since it was proposed. Nothing was written.',

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
  secretsLiveInTheVault: 'Passwords and keys go in the Vault. A row records what one opens.',
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
    `${list(names)} cannot be stored as typed. The reason is under the field.`,
  noFilters: 'Nothing here can be filtered yet.',
  /**
   * WHAT THE SEARCH BOX READS, SAID WHERE A SEARCH HAS FOUND NOTHING, because that is where somebody
   * is when it matters. It was also said under the bar on every visit, which is a screen explaining
   * its own interface to somebody who had not asked; an empty answer is the moment they have.
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
  /* A BRIDGE OVER THE CASH WALK: where the money starts, what comes and goes, and where it lands. */
  bridgeStart: 'Cash now',
  bridgeIn: 'Coming in',
  bridgeOut: 'Going out',
  bridgeEnd: (days: number) => `In ${days} days`,
  /* A series's first column names what each bar is, by the bucket it is cut into. */
  seriesAxis: { day: 'Day', week: 'Week', month: 'Month', quarter: 'Quarter', year: 'Year' } as Record<string, string>,
  seriesWeekOf: (day: string) => `Week of ${day}`,
  /* A MEASURE A PROJECT REPORTS, as a tile and a line (`record/measures.ts`): the period before, and the change against it. */
  measurePrevious: (n: number, weeks = false) => `Previous ${n} ${weeks ? 'weeks' : 'days'}`,
  measureAgainst: (change: string, n: number, weeks = false) => `${change} on the previous ${n} ${weeks ? 'weeks' : 'days'}`,
  measureNothingBefore: (n: number, weeks = false) => `Nothing reported in the ${n} ${weeks ? 'weeks' : 'days'} before`,
  measureLastOn: (day: string) => `Last reported ${day}`,
  /* SEND NUMBERS HERE (`routes/p/[slug]/Reporting.svelte`): the seed's heading, which the panel is drawn under, and what
     a report key can and cannot do, said before anybody makes one. */
  reportHeading: 'Send numbers here',
  reportWhy: (title: string) =>
    `A project sends its numbers to ${title} with a report key. The key can only add numbers for ${title}: it cannot read anything, or write anywhere else.`,
  reportLine: 'Send one number from the project, or from a scheduled job on its server',
  reportPlaceholder: '<report key>',
  reportMake: 'Make a report key',
  reportKeys: 'Report keys',
  reportRevoked: 'Revoked. The key stops working now.',
  reportUnread: 'The report keys could not be read just now.',
  /* THE POLL FORM (`routes/p/[slug]/PollForm.svelte`): an address, how often, and which number is which. It files a
     proposal, because a poll calls out on a clock and the owner approves the address once, on Decide. */
  pollHeading: 'Or let BrainDog fetch them',
  pollWhy:
    'If the project answers its numbers as JSON at an https address, BrainDog can fetch them on a clock. You approve the address and how often once, on Decide, and nothing is fetched before that.',
  pollAddress: 'Address',
  pollAddressHint: 'https://api.example.com/numbers.json',
  pollEvery: 'How often',
  pollEveryLabels: { '15m': 'Every 15 minutes', '1h': 'Every hour', '6h': 'Every 6 hours', '1d': 'Every day' } as Record<string, string>,
  pollKey: 'Key in the vault, only if the address needs one',
  pollKeyNote: 'Leave it empty for an address anybody can read. A key is sent to this address and nowhere else.',
  pollNumbers: 'The numbers in the answer',
  pollPath: 'Where it is',
  pollPathHint: 'data.mrr',
  pollName: 'Called',
  pollNameHint: 'Monthly recurring revenue',
  pollUnit: 'Unit',
  pollUnitHint: 'GBP',
  pollAddRow: 'Add a number',
  pollRemoveRow: (n: number) => `Remove number ${n}`,
  pollFile: 'Propose this poll',
  pollFiled: 'Proposed. Approve it on Decide and the numbers start arriving.',
  pollOpenDecide: 'Open it on Decide',
  pollFaultUrl: 'Write the whole https:// address the numbers are at.',
  pollFaultKey: 'A key’s label is 40 characters at most.',
  pollFaultNone: 'Name at least one number: where it is in the answer, and what it is called.',
  pollFaultMost: (n: number) => `One address fills ${n} numbers at most.`,
  pollFaultName: (path: string) => `Say what the number at ${path} is called.`,
  pollFaultPath: (path: string) => `${path} is not a path. Write it as data.mrr or plans[0].count.`,
  pollQuestion: (host: string, every: string, title: string, names: string) => `Poll ${host} ${every.toLowerCase()} for ${title}’s numbers: ${names}?`,
  /* A BALANCE NOBODY HAS UPDATED IN A WHILE says so beside its date, with the watch glyph. */
  outOfDate: (day: string) => `${day}, out of date`,
  /* A ROUNDED ZERO IS NOT A DIRECTION. "up 0%" gives a reader a way and a distance of nothing. */
  aboutTheSame: 'about the same',
  /* THE FIVE STATES, ON THE FOUR SCREENS THAT COULD NOT DRAW ANY OF THEM. `grep -c "<Empty"` was
     0 on Home, /audit, /packs and /vault — four surfaces with no way to tell "nothing here yet"
     from "nothing matched", which `19 §6` calls the failure by name. */
  /* THE RECORD ITSELF IS EMPTY, which is a different sentence from every list being empty and from
     nothing needing you. It is the state of the first hour and nothing could say it. */
  recordEmpty: 'Nothing in the record yet.',
  /** A use case's pack going in or out, in the feed: "Added the Student use case". */
  useCaseEvent: (verb: string, name: string) => `${verb} the ${name} use case`,
  /** A record setting itself up, said as one line of the feed: "Set up Personal with 40 example rows". */
  setUpWith: (name: string, rows: number) => `Set up ${name} with ${rows} example ${rows === 1 ? 'row' : 'rows'}`,
  setUpRows: (rows: number) => `Added ${rows} example ${rows === 1 ? 'row' : 'rows'}`,
  setUpLinked: 'Linked the example rows to each other',
  /** Who did it and what to, in a `feed` block on a live record: "You", "Someone", "installed the Team board use case". */
  feedYou: 'You',
  feedSomeone: 'Someone on this record',
  feedUseCase: (name: string) => `the ${name} use case`,
  feedPack: (id: string) => `the ${id} add-on`,
  recordEmptyBody: 'A record holds what a business is made of: what you owe and are owed, what it runs on, who is involved, and the decisions behind them.',
  startHere: 'Start here',
  noPacksYet: 'No add-ons installed.',
  noPacksBody: 'An add-on brings ready-made lists and pages. The ones below are ready to install.',
  matching: 'matching',
  /**
   * A SAVED VIEW'S FILTER, AS THE SENTENCE A PERSON WOULD SAY.
   *
   * `/v/obligations.overdue` printed `state is open or part, due before today` in the id face on a
   * grey chip: the `where` dialect, with the field ids `state` and `due`, over a list whose own
   * columns call them Status and Due. The dialect is what an agent reads, and it stays on the
   * control that hands one over; this is the reading line.
   *
   * TWO FUNCTIONS, ONE CLAUSE AND ONE SENTENCE, because `access.test.ts` renders every function in
   * this file with a handful of argument shapes and counts one that renders under none of them as a
   * sentence nobody checked. A single function over an array of clause objects was that sentence.
   *
   * `filterClause` takes the field's label, not its id: the caller knows the register.
   */
  filterClause: (label: string, values: readonly string[], op = 'in'): string =>
    op === 'before' || op === 'after'
      ? `${label} ${op} ${values.join(' or ')}`
      : `${label} is ${op === 'not-in' ? 'not ' : ''}${values.join(' or ')}`,
  /* Every clause after the first starts lower-case when it starts with an ordinary word, so "Due"
     joins the sentence and "VAT number" keeps its capitals. */
  filterReads: (clauses: readonly string[]): string => {
    const said = clauses.map((c, i) => (i > 0 && /^[A-Z][a-z]/.test(c) ? c.charAt(0).toLowerCase() + c.slice(1) : c));
    return said.length < 2 ? (said[0] ?? '') : `${said.slice(0, -1).join(', ')}, and ${said.at(-1) ?? ''}`;
  },
  backToView: 'Back to the saved view',
  openUnfiltered: (list: string) => `Open ${list}`,
  rowsWord: (n: number) => (n === 1 ? 'row' : 'rows'),
  noneMatching: (total: number, what: string) => `${total} ${what}, none matching:`,
  auditHolds: 'Every change to this record shows up here, with who made it and when.',
  /* A THREAD'S TWO EMPTY STATES, AND BOTH SAID `track`. The register was renamed to Threads and the
     rename reached the head and the kicker of this screen, which read it from the declaration; the
     three sentences below them were typed into the route, so they went on saying the word the rest
     of the product had stopped using. They are here so the next rename reaches them. */
  threadNoUpdate: 'An update is a sentence, a health and a date. It is the only thing on a thread that says how it is actually going.',
  threadNoTasks: 'No open tasks on this thread.',
  /* POSTING ONE. The button's own word and the sample's clause were both typed into the route, so
     the one control in the product that writes an update kept its words where no review of this
     file could see them, which is the whole reason this file exists. */
  postUpdate: 'Post an update',
  updateWouldBePosted: 'An update would be posted',
  post: 'Post',
  select: 'Select',
  deselect: 'Deselect',
  /* THE VERBS A SELECTION IS FOR. A selection with nothing to do with it is a mode you can enter
     and not leave usefully, which is what this one was: implemented, drawn, and consumed by
     nothing. Verb + Noun, like every other action here. */
  copyIds: 'Copy numbers',
  /* THE REGISTER'S OWN WORD FOR ITS OWN COLUMN. `things` labels its state field **Status**, so a
     hardcoded "Set state" put one field's three names on one screen — `lane` in the schema, Status
     in the header, state on the verb, two of them visible at once. The menu's VALUES already come
     from the declaration, which is why they were right; only the verb was typed. It is wrong the
     first time anybody labels theirs, which is exactly what a pack author does. */
  setState: (field: string) => `Set ${field.toLowerCase()}`,
  archiveSelected: 'Archive them',
  clearFilters: 'Clear filters',
  saveAsView: 'Save as a view',
  /* WHAT `Alt+V` WOULD DO, AND IT SAID `register`. `19 §9` bans that word from a screen by name,
     and two other files in this repository had swept the markup and concluded it never reaches
     one. Both sweeps were right about the markup: the sentence is a toast typed into the route, so
     it does not exist until somebody presses the chord, and no sweep of visible text can see it. */
  viewWouldBeSaved: 'The filter would be saved as a named view on this list',
  /* AND THE OTHER ONE, WHICH IS NOT A TOAST AND WAS MISSED FOR A DIFFERENT REASON. The banner over
     the busiest list names the field the rejected saves were aimed at, and falls back to naming
     the list when the refusal carries no field. That fallback is static markup, so a sweep could
     have seen it — but only on a record whose newest refusal has no field on it, and this one's
     has. A word that only appears in a state the seeded record is not in is a word nobody reads
     until somebody's own record reaches that state. */
  thisList: 'this list',
  export: 'Export the record',
  requestAccess: 'Request access',
  tryAgain: 'Load it again',
  addOne: 'Add the first row',
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
  /* The one word a screen reader hears while a screen waits on the record (`Waiting.svelte`). */
  waiting: 'Loading',
  addTheRow: 'Add the row',
  /* The two questions an audit log exists to answer, as the labels of the two controls. */
  auditWho: 'Who',
  auditWhat: 'What kind of change',
  /* A DAY-ONE SENTENCE, because this is now the `no-data-yet` title and the filtered case has its
     own. "Nothing in the log matches that" was drawn for both, so an empty record and a filter that
     missed said the same thing — and the empty record has not been asked anything. */
  auditNone: 'Nothing in the log yet.',
  olderEntries: 'Show older entries',
  /* THE INBOX. `pattern` and `claimed` are the schema's words for a thing a person would call a
     rule, and what they are being offered is not a pattern — it is what happens to the NEXT one. */
  ruleOffer: 'A rule that would have filed this, and the next one like it',
  makeRule: 'Make it a rule',
  notThisOne: 'Leave it for another rule',
  fileIt: 'File it as a row',
  /* `Archive this` AND IT WAS `Archive the arrival`. An `arrival` is what the record calls a thing
     that came in through an ingest, and the inbox is the one screen where the reader is looking at
     an email. Naming it after the mechanism that carried it is naming it after the plumbing. */
  archiveArrival: 'Archive this',
  /**
   * AND THE THREE SENTENCES BEHIND THE THREE BUTTONS, WHICH DID NOT GET THE MEMO.
   *
   * The note above renamed `arrival` off the button and gave the reason: the inbox is the one
   * screen where the reader is looking at an email, and naming it after the mechanism that carried
   * it is naming it after the plumbing. All three toasts under those buttons still said it, and
   * one of them said `pattern` as well, three words away from a button reading "Leave it for
   * another rule". They were literals in the route, which is why the rename could not reach them.
   */
  inboxLeaveIt: 'This email would be left for a different rule',
  inboxFileIt: 'A row would be created from this email',
  inboxArchiveIt: 'This email would be archived, and its bytes kept',
  /**
   * THE INBOX AT ZERO IS TWO STATES, AND IT WAS DRAWN AS ONE, in a literal typed into the route.
   *
   * `kind="cleared"` is the check glyph, which means YOU FINISHED, and it was drawn on a record
   * with no connector: nothing has ever come in there and nothing can until one exists, and the
   * screen that makes one was not linked. The body asserted a history besides, "every arrival
   * since you last looked became a row", on a record that has never had an arrival. `19 §6`
   * separates *nothing yet* from *nothing matched* for exactly this reason.
   *
   * AND IT SAID `arrival`, which is the word the note above argues against and renamed out of the
   * button below it. That literal lived in the route rather than in this file, which is why the
   * rename could not reach it. Both sentences are here now.
   */
  inboxNothingYet: 'Nothing arrives here yet.',
  inboxNothingYetWhy:
    'The inbox holds email that came in and matched no rule, so you can file it yourself or make the rule that files the next one like it. A connector is what brings it in.',
  inboxConnect: 'Set up a connector',
  inboxClear: 'Nothing waits in the inbox',
  inboxClearWhy: 'Anything that comes in without a rule to file it waits here.',
  /* WHAT THE VERSION IS FOR, rather than what it is. Every change moves it by one, so it names a
     moment — which is the only thing anybody does with it. */
  /* THE DAY FILTER, on the screen the restore setting sends somebody to with the words "find the
     moment". It had no way to narrow by when at all. */
  auditWhen: 'Day',
  auditAnyDay: 'Any day',
  auditVersion: (n: string): string =>
    `This record is at version ${n}. Every change moves it by one, so a version is a way of naming a moment.`,
  goBack: 'Choose something else',
  editRow: 'Edit the row',
  stopRun: 'Stop the run',
  /**
   * ONE SCREEN, ONE NOUN FOR ITS OWN SUBJECT, AND IT USED TO HAVE TWO.
   *
   * `/jobs/<id>` drew the kicker `Job` and the tab title `Job` over a refusal reading "There is no
   * run called j_9K4A" and a button reading "Stop the run", and the register it is reached from is
   * called Agent runs with `one: 'run'`. A reader who followed "Watch the run" arrived somewhere
   * headed Job. `job` stays in the address, in the field on a session row and in the type, because
   * those are handles; the two words on the screen are not.
   */
  run: 'Run',
  runWouldStop: 'The run would stop at its next step',
  verifyFile: 'Check an exported file',
  /* WHAT DELETING DOES, said instead of a one-word heading that states no fact. `Danger` was over
     `Delete this record` over `Delete the studio` — three lines, two of them the same sentence, and
     the two disagreeing about what the record is called. */
  deleteWhat: (record: string): string =>
    `Deleting ${record} removes every list, page and row in it. It cannot be undone.`,
  deleteRecord: (record: string): string => `Delete ${record}`,
  showExample: 'Show an example row',
  /* AND WHAT PRESSING IT WOULD DO. The toast printed the schema's own value back inside a
     backtick — "marked `example`" — on the empty state of a list somebody has just made. The mark
     is real and it is a value in a `tags` field; its spelling is not what somebody deciding
     whether they want a sample row is asking about. */
  exampleWouldBeAdded: 'One example row would be added, marked as an example',
  /* `Preview` AND IT WAS `Peek`. It is printed as a keyboard hint on every list, `p peek`, which is
     a word the product invented for a thing every other product calls a preview. */
  peek: 'Preview the row',
  openRow: 'Open the row',
  copyId: 'Copy number',
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
  paletteLabel: 'Search',
  palettePlaceholder: 'Search or jump to anything',
  noMatches: 'Nothing matches',
  commands: 'Actions',
  destinations: 'Go to',
  records: 'Rows',
  pages: 'Pages and lists',
  /* THE LINE UNDER AN ID SOMEBODY TYPED, AND IT SAID `spoken id`. That is this product's internal
     name for the convention, written down in `19 §2` and in this file's own notes, and the palette
     is the one surface where the reader has just proved they know the convention by using it. The
     detail is there to say what pressing Enter does, in the reader's word for the thing: a number. */
  openById: 'Open by number',
  askBrainDog: 'Ask BrainDog',
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
  allInstalled: 'Nothing new to install.',
  allInstalledWhy: 'Add-ons this record does not already have appear here, each with what it would add before you install it.',
  install: 'Install',
  uninstall: 'Uninstall',
  /* AND WHAT UNINSTALLING WOULD DO, WHICH SAID `declares`. That is the schema's verb, and it sat
     on the one control of the trust screen a person presses when they have decided against a file
     they let in. What they want to know is what leaves and what stays, and the pack ADDED those
     things; declaring them is what the file did before any of this concerned them. */
  uninstallWould: (pack: string) =>
    `${pack} and everything it added would be removed, with what changes shown first, and the rows it created would stay`,
  /* TURNING ONE OFF. An add-on that is off stays on the screen, dimmed and labelled, because its
     rows are still in the record. A refused switch says who leans on it and offers the cascade as a
     second press, never as a side effect of the first. */
  packTurnedOff: 'Turned off',
  packSwitch: (name: string) => `${name}, on or off`,
  /* UNINSTALL IS ASKED, NOT UNDONE, and it is the one place on this screen that is. The kernel
     retires the declarations, forgets the pack row with its chosen settings and deletes its pending
     schedules, and a second install plants the examples again, so there is no state before to give
     back. The question names what leaves, in counts a person can check against the row above it. */
  uninstallLeaves: (pack: string, lists: number, pages: number): string => {
    const parts = [
      ...(lists > 0 ? [lists === 1 ? 'its list' : `its ${lists} lists`] : []),
      ...(pages > 0 ? [pages === 1 ? 'its page' : `its ${pages} pages`] : []),
    ];
    const leave = `${list([pack, ...parts])} ${parts.length > 0 ? 'leave' : 'leaves'} the sidebar.`;
    return lists > 0
      ? `${leave} Their rows are kept; its settings and schedules are not.`
      : `${leave} Its settings and schedules go with it.`;
  },
  uninstallNamed: (pack: string) => `Uninstall ${pack}`,
  uninstallKeep: 'Keep it',
  /* TURNING OFF IS UNDONE, because turning back on is the same kernel call over the same rows. */
  packTurnedOffNamed: (names: string[]) =>
    `${list(names)} ${names.length === 1 ? 'is' : 'are'} turned off and out of the sidebar. The rows are kept.`,
  packNeededBy: (names: string[]) => `Needed by ${list(names)}`,
  packOffTogether: (others: number) => (others === 1 ? 'Turn both off' : `Turn all ${others + 1} off`),
  packIsOff: (name: string) => `${name} is off`,
  packTurnOn: (name: string) => `Turn on ${name}`,
  packScopesInUse: (names: string[]) => `Its projects are still used by ${list(names)}`,
  installDiff: 'What this adds',
  packNothingToSet: 'This add-on has nothing to set.',
  packNotInstalled: (id: string) => `There is no add-on called ${id} on this record.`,
  packNotInstalledWhy: 'Add-ons shows the ones this record has, and the ones it could add.',
  packNothingToSetWhy: 'It adds the lists and pages below, and nothing about it needs choosing.',
  /* `04 §3`'s seven sections, in a person's words. Only the ones that say something render: a
     `CHANGES` heading over nothing is a warning that does not apply, and `06 §1` is that those
     teach people to ignore warnings. */
  diffAdds: 'Adds',
  diffChanges: 'Changes',
  diffConflicts: 'Conflicts',
  /* IN THE READER'S WORDS, AND THEY WERE IN THE SCHEMA'S. `Seeds` and `Touches` are `04 §3`'s
     section names, and they were printed as headings over values that are already plain English:
     "1 example row, marked example, clearable in one action" and "nothing you have written: 0 rows
     read". This is the trust screen, where somebody decides whether to let a stranger's file into
     their business, and the two labels on it were the two words nobody outside this repository
     uses. `19 §9`: the product speaks the reader's words. The API keeps `seeds` and `touches`, the
     way Slack's says `conversations` and its screens say channel. */
  diffSeeds: 'Example rows',
  diffTouches: 'Your rows',
  /* `04 §4`: a pack may place a page it owns and may never move yours. The move is SHOWN, so that
     the refusal is visible rather than silent, and then it does not happen. */
  diffNavKept: 'shown, not applied. Your sidebar is yours',
  diffUnread: 'This record has not read the add-on yet, so the details arrive when you install it.',
  /* `02 §1`: a name another pack ships is a name this one cannot own, and the whole install is one
     transaction — so it does not half-apply.

     AND IT NAMES WHAT COLLIDES. "Installing is refused while a name collides" said the shape of the
     rule and not the fact: the reader is looking at a disabled button and the one thing they need is
     WHICH name, because it is the only part of this they can act on — drop the pack, or ask its
     author to rename. `10 §7`'s fourth rule, on a screen rather than in an envelope. */
  /* AND IT JOINED THEM WITH ` and `, so three colliding names read "Money and Services and People".
     `list()` is at the top of this file for exactly this, and `rowRequired` and `rowFieldProblem`
     both already use it for the same job. Two names is the common case, which is why a sentence
     that reads wrong at three was not noticed. */
  diffRefused: (names: string[]) =>
    `${list(names)} ${names.length === 1 ? 'is already a list' : 'are already lists'} on this record, and an add-on cannot take a name another one owns. Nothing would be applied.`,
  /* THE SENTENCE UNDER THE TITLE. The screen was `Packs`, a word nobody brings with them; it is
     `Add-ons` now, the reader's word for an installable thing with an author. The API, the docs and
     the `mcp` surface keep `pack`. The sentence stays for what an add-on here is: text, not code. */
  packBlurb: 'An add-on brings ready-made lists and pages. It is readable text, and nothing in it runs.',

  /* USE CASES, SHARED AND INSTALLED (`loop/research-spark.md` S14). A use case is a file like an add-on, planned and
     approved the same way, so these sentences say what it arranges and never how the screen works. */
  useCases: 'Use cases',
  useCasesBlurb: 'A use case arranges a BrainDog for one kind of work: its lists, its pages, its rail and its words.',
  browseUseCases: 'Browse use cases',
  shareSetup: 'Share this setup',
  installFromFile: 'Install from a file',
  chooseFile: 'Choose a file',
  shareAddress: 'Or an https address',
  readAddress: 'Read it',
  shareReading: 'Reading',
  shareAddressNotOne: 'That is not a web address. Paste the whole https address of the file.',
  shareAddressHttps: 'A use case is read only from an https address.',
  shareAddressUnread: (host: string) => `${host} did not let this page read the file. Download it, then choose it as a file.`,
  shareAddressAnswered: (host: string, status: number) => `${host} answered ${status}, so there was no file to read.`,
  shareTooBig: (kb: number) => `This file is ${kb} KB, and a shared use case is at most 256 KB.`,
  shareConflict: (name: string, pack: string) => `${name} is already held by ${pack}, so this cannot be installed beside it.`,
  shareStale: 'Something changed since the plan was read, so it has been read again. Look it over, then install.',
  sharePlanTitle: (title: string, version: string) => `${title} ${version}`,
  shareBy: (author: string) => `By ${author}`,
  shareInstallsFirst: 'Installs first',
  shareTurnsOn: 'Turns on',
  shareUpdates: (from: string, to: string) => `Updates from ${from} to ${to}`,
  shareSameVersion: 'This version is already installed, so nothing is added.',
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
  shareSampleNote: 'This is the sample, so the file is made from a record of your own.',
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
  useCaseAll: 'All use cases',
  useCaseMissing: 'There is no use case with that name here.',

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
  /* IT SAID "Single letters act on the focused list", WHICH NAMED NEITHER THE SCOPE NOR THE COST.
     Nothing has to be focused: `?`, `/` and `g` act anywhere, and `j` moves a page's block cursor
     from nowhere. So a reader deciding whether to turn this off was told it affected one list, and
     what it actually takes is the help sheet, the palette shortcut and every goto. The sentence a
     person needs before pressing Off is what stops working and what does not. */
  characterKeysHint:
    'Off silences every shortcut that is a single letter, digit or punctuation mark, including ? for this list, / for the palette and g to go somewhere. Shortcuts that use Ctrl or Alt keep working.',

  /* MONEY IS AN INTEGER IN MINOR UNITS, and this is the one place a person types one. The sentence
     says what to do rather than what is wrong: "not a number" is a verdict, and "digits and at most
     one point" is an instruction. */
  moneyShape: 'An amount is digits and at most one point. 1234.56, or -50.',
  moneyPlaces: (exp: number): string =>
    exp === 0
      ? 'This currency has no smaller unit, so an amount is a whole number.'
      : `This currency goes to ${exp} decimal place${exp === 1 ? '' : 's'}, and a fraction of one is not an amount anybody can pay.`,

  /* the record's own colour */

  accentTitle: 'Accent',
  /* IT DESCRIBED THE GENERATOR: "Every surface, ink and boundary is solved from it against the same
     contrast floors, so a colour that would be unreadable is refused rather than approximated." True,
     and a sentence about how the palette is computed, under a row of swatches somebody is choosing
     between. What it does for them is the same fact from their side, including the refusal, which
     is the one thing a swatch press can do that they would not expect. */
  accentHint:
    'The colour this record is. The other colours on screen are worked out from it, and one that would leave text hard to read is refused.',
  accentHouse: 'House',
  accentSet: (name: string) => `${name} is this record's colour.`,
  accentReset: 'Back to the house colour.',
  /* `/settings` REDIRECTS, AND DREW NOTHING WHILE IT DID. One line, so the frame before the
     redirect lands is a page rather than a blank document with no title. */
  settingsGoing: 'Opening Appearance.',
  /**
   * THE PALETTE THAT SHIPPED AND COULD NOT BE TURNED ON.
   *
   * `packages/theme` solves a second palette against a higher contrast floor and `theme.mjs` writes
   * it into `house.css` behind `html[data-theme='hc']`, byte-compared on every build. Nothing in
   * the app ever set that attribute, so it was sixteen checks' worth of work that no reader could
   * reach. What stood in its way was the record accent, which was being written into the same
   * attribute and read by nothing.
   *
   * NAMED FOR WHAT IT DOES AND NOT FOR THE STANDARD IT MEETS. "WCAG AAA" is a fact about a document
   * somebody else wrote; "more contrast" is a fact about the screen in front of you (`19 §9`).
   */
  contrast: 'More contrast',
  /* "A second palette, solved against a higher floor" was the comment above, said to the reader.
     What they get is the second sentence it already had, in the words of what they see. */
  contrastHint: 'Makes text and edges stand out more, and keeps the accent you chose.',
  /* A FIGURE THAT CANNOT BE WORKED OUT, said to the person reading the tile rather than to whoever
     wrote the declaration. What was here was the author's sentence — "group_by: is published in 08
     and not read by this build", "{ lte: 400000 } for money in minor units" — under a headline
     figure, quoting a document number and a JSON literal at somebody with no control that edits a
     metric. The author's sentence still prints on the page block, beside the declaration. */
  figureUnavailable: 'This figure cannot be worked out yet. The add-on that owns it says why.',
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
       title and the figures; what a reader meeting a page needs is that it is theirs to change and
       that nothing on it is typed in twice. It names no control, because Edit layout is absent on
       a phone. */
    page: 'this page is yours to arrange, and every figure on it is read from your lists',
    block: 'one piece of a page: a table, a figure, a note',
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
  /* THE WHOLE OF THIS AREA AT ONE PERSON. A level, an exception, a removal and an erasure are all
     one person measured against another, so on a record whose only person is you there is nothing
     for any of them to say: five greyed segments, two hints about the greying, and a red erasure
     aimed at the reader. This sentence and the invitation below it are what is left, and everything
     else comes back the day there is somebody to compare with. */
  onlyPerson: 'You are the only person on this record.',
  levelFor: (name: string) => `What ${name} can do`,
  /* NOT A SIXTH LEVEL. `member` is a ROW that may not exist, and "no row" is a different answer from
     the lowest rung — `members.ts` shipped both wrong readings of that before settling on `null`. */
  noRecordLevel: 'No access',
  noRecordLevelMeans: 'Nothing on this record itself. Only the lists named below, and nothing that is added later.',
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
  /**
   * THE FOUR SENTENCES THIS SCREEN SAYS WHEN YOU PRESS SOMETHING, AND ALL FOUR PRINTED AN EVENT
   * KIND.
   *
   * `access.grant` and `access.revoke` are two of `30 §2`'s forty kinds, closed by a `CHECK` the
   * database enforces, and they belong in the log and in the API. They were being read out to a
   * person on the screen that decides who can see their business, in a sentence whose whole job is
   * to say how much would happen. How much is one per list; which direction it is has already been
   * said by the half of the sentence naming where the level moves from and to.
   *
   * THE KINDS ARE UNTOUCHED, which is the trade `19 §9` already ran once for the vault: the word on
   * the screen changes and the schema keeps its own, because a kind is spoken by the record.
   * They were four literals in the route, which is why one rename never reached all four.
   */
  levelWouldMove: (name: string, from: string, to: string) =>
    `${name} would move from ${from} to ${to} across this record, with one change per list`,
  accessWouldGo: (name: string) => `Every one of ${name}'s access rows would be removed, with one change per list`,
  exceptionWouldGo: (list: string, to: string) => `${list} would go back to ${to}, with one change naming that list`,
  exceptionWouldBeAdded: (name: string) =>
    `One list would be picked, and ${name} given a different level on it, which takes one invitation and one change naming that list`,
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
      : 'This server cannot send an email link, so without a passkey there is no way back in on your own. Ask whoever runs it.',
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
  /* A passkey the host holds with no name, which is every one this browser adds. */
  passkeyUnnamed: 'Passkey',
  passkeysUnread: 'Your passkeys could not be read just now.',
  passkeyNotRemoved: 'That passkey was not removed. Try again.',
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
  /* A NEGATIVE NUMBER IS NOT A NUMBER ANYBODY TYPED. `pending` hands an unwritten row a negative
     sequence so it can never collide with a real one, and a link to that row is good for exactly as
     long as the tab is open. Saying "There is no obligation #-1" to somebody who followed their own
     link back after a reload tells them nothing they can act on; saying that the row was never
     saved does. */
  neverSaved: (one: string) =>
    `That ${one.toLowerCase()} was never saved, so it is gone. Nothing typed into this product is kept until the record is given it.`,
  theseExist: (kind: string, names: readonly string[]) =>
    `${kind} on this record: ${names.join(' · ')}.`,

  /* export — `03 §1`'s three layers, and the two containers `03 §2.1` keeps apart */
  yourData: 'The whole record',
  /* IT IS A SQLITE FILE AND THAT IS THE WHOLE TRICK (`03 §2`): `sqlite3 portfolio.brain "select …"`
     works with no SDK and no reader of ours. The screen says it as "any database tool", because the
     format's name means nothing to most of the people reading it. */
  exportWhat: 'One file with everything in it, readable by any database tool.',
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

  /* agents — `12 §6.1`'s device grants. The heading counts every row beneath it, denied ones included,
     so it names machines rather than connections. */
  machines: 'Machines',
  /* `13 §5.2`: an empty list the person fills from a machine carries the command that fills it. */
  noDevices: 'No machine has asked yet.',
  enrollPrompt: 'braindog login',
  noSources: 'Nothing feeds this record yet.',
  noSourcesWhy: 'A connector pulls rows in on a schedule from a mailbox, a bank feed or a repository, and reports here when it fails.',
  ingestPrompt: 'read my record, then set up a connector for the mailbox I file invoices in',
  /* `backup` AND IT WAS `sealed copy` AND `snapshot`, WHICH ARE TWO WORDS FOR ONE IDEA. A friction
     pass found them competing on the same screen: `/decide` said "The newest sealed copy is from
     2026-09-02" and a card beside it was titled `Snapshot`. Neither is the word a person uses, and
     having two of them means a reader who learns one still meets the other.

     THE SEALING IS NOT LOST, it moves to where it is the point: the sentence about the key, three
     screens down, where somebody is being told why a copy can be proved to be theirs. Above that,
     what they want to know is that there is a backup and how old it is. */
  noSnapshots: 'No backup yet.',
  noSnapshotsWhy: 'A backup is the whole record at one moment, kept so you can go back to it.',
  /* The kernel's six. `approved` is the seconds between the press and the machine's next poll, and a
     denied row is kept: "I said no to a request I did not make" is the line this table exists for. */
  deviceState: {
    pending: 'waiting for you',
    approved: 'approved, waiting for the machine',
    active: 'connected',
    expired: 'ran out of time',
    denied: 'turned away',
    revoked: 'revoked',
  } as Record<string, string>,

  /* WHAT IT MAY REACH, with its life, because that difference is the whole decision. `19 §9` keeps
     every word from the schema off the screen. A vault grant's life depends on its scope. */
  reachMeans: {
    login: 'sign in as you, for ninety days',
    runner: 'do work for you on this machine, for ninety days',
    export: 'take one copy of this record, once, in the next ten minutes',
    import: 'load rows into this record, once, in the next ten minutes',
    pack: 'install one add-on, once, in the next ten minutes',
    token: 'make one more key, once, in the next ten minutes',
    vault: 'open the keys of one project, for thirty days',
    vaultAll: 'open the keys that belong to no project, for seven days',
  } as Record<string, string>,

  /* The code entry: the `verification_uri` every device flow prints. */
  approveTitle: 'Approve a machine',
  codeLabel: 'The six digits it is showing',
  codeGo: 'Approve',
  codeEmpty: 'Type the six digits the machine is showing.',
  codeShort: (n: number) => `That is ${n} digit${n === 1 ? '' : 's'}. A code is six.`,
  codeLong: (n: number) => `That is ${n} digits. A code is six.`,
  codeOther: 'A code is six digits, and this has something else in it.',
  /* The record says no more than this about a miss, so neither does the screen: no count of tries. */
  codeWrong: 'No machine is waiting with that code.',
  codeTries: 'Five wrong codes turned away every waiting machine. Start again on the machine.',
  codeExpired: 'That code ran out of time. Run braindog login again on the machine.',
  signInAgainWhy: 'Approving a machine needs a sign-in from the last fifteen minutes.',
  signInAgain: 'Sign in again',
  approvedNow: (label: string, means: string) => `${label} is approved. It can ${means}.`,
  unnamedMachine: 'A machine with no name',
  /* One sentence for every control here that would need an account. */
  notOnDemo: 'The demo has no account, so nothing here can be approved, revoked or connected.',

  /* the tokens — `12 §3`: listed with a revoke button, and never the token itself */
  tokens: 'Tokens',
  noKeys: 'Nothing can act as you.',
  /* `19 §9` again: what it can do, said as what it can do. There is no `admin` (ADR-060). */
  keyCan: {
    read: 'can read, and change nothing',
    propose: 'can read and suggest, and change nothing itself',
    write: 'can read and change rows',
  } as Record<string, string>,
  endsWhen: (when: string) => `ends ${when}`,
  revokeKey: 'Revoke',
  unnamedToken: 'A token with no name',
  /* A REPORT KEY IN THE TOKENS LIST (`record/device.ts` `reportKeyOf`): its name and the one thing it can do. */
  reportKeyNamed: (name: string | null) => (name ? `Report key for ${name}` : 'A report key'),
  reportKeyCan: (list: string) => (list ? `can send numbers to ${list}, and nothing else` : 'can do nothing, because it is bound to no list'),

  /* Connect an agent: a write token for ninety days, its bearer shown once. */
  connectTitle: 'Connect an agent',
  connectLabel: 'Name the machine',
  connectGo: 'Connect',
  tokenOnce: 'Shown once. Copy it now.',
  copyToken: 'Copy the token',
  tokenCopied: 'Token copied',
  onNewMachine: 'On a new machine',
  inClaudeCode: 'In Claude Code',
  copyLine: 'Copy',
  lineCopied: 'Line copied',
  connectDone: 'Done',

  /* ingest — `25 §9` draws this screen */
  sources: 'Where rows come in from',
  sourcesHow: 'Each of these fetches on its own schedule. Everything they add is logged.',
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
  batchByDefault: 'Most things wait for your summary. Only urgent ones interrupt.',
  quietHours: 'Quiet hours',
  quietHoursAre: '22:00 to 08:00 in this record’s timezone. Anything not urgent waits until they end.',
  urgentKinds: 'Urgent',
  urgentKindsAre: 'A payment failing, a credential expiring inside 48 hours, a domain expiring inside 7 days.',
  interruptCap: 'At most',
  interruptCapIs: 'One urgent interruption an hour.',
  unreadCount: 'Unread',
  unreadCountIs: 'One number, on the record, in one place.',
  /* IT POINTED AT A SCREEN THAT DOES NOT EXIST. "Change the rule that raises it" is a route this
     product has not got: there is no rules screen, no link, and nothing in the nav that reaches
     one. Advice a reader cannot follow is worse than no advice, because they go looking. What is
     true is that a rule raised it and the rule is named on the row itself. */
  muteAtSource: 'There is no switch here. Each of these is raised by a rule, and the rule is named on the row.',

  /* backups — `53 §5.4` */
  kept: 'What is kept',
  /* ONE SENTENCE SAID BOTH HOSTS' POLICIES AND WAS RIGHT ON NEITHER: "nightly, at 03:00. The 30
     newest are kept." `53 §4` gives Cloud `17 3 * * *` UTC and *"the 30 newest dated keys plus
     `latest`"*; `49 §5.13` gives a self-host 02:00 UTC plus `hash(slug) mod 60` minutes and thirty
     files. And Cloud's real promise is the bigger one — any point in thirty days — which the shared
     sentence obscured by talking about the nightly copies. */
  /* navigation — `29 §4`'s one global switch, which `19 §2` says is why this area exists */
  suggestPages: 'Suggest new pages',
  suggestPagesHint: 'When a list grows or you keep asking the same question, this record offers a page for it. Nothing is ever placed for you. An offer sits in the list below until you promote it.',
  suggested: 'Waiting for you',
  suggestOff: 'Not offering anything.',
  suggestOffWhy: 'Pages you have already placed are untouched. Turn this back on and the record starts offering again.',
  perDevice: 'This setting is remembered on this device.',

  /* The shape of the navigation — `19 §3`'s table, in the words a reader would use for each one.
     The labels name the THING and not the setting: somebody choosing between these is picking
     where their navigation lives, so "Sidebar" and "Top bar" are the answer and "Rail" is ours. */
  navShape: 'Where your navigation lives',
  navShapeHint: 'The sidebar holds a list of any length, in sections you arrange. A top bar holds a few entries in one strip and puts the rest behind More. The menu keeps nothing on screen and opens the whole list when you ask for it.',
  navShapeRail: 'Sidebar',
  navShapeBar: 'Top bar',
  navShapeMenu: 'Menu',
  /* AND THE ONE CONDITION THAT IS NOT A TASTE. A narrow screen keeps the tab bar whatever this
     says, and a reader who picks a top bar and then opens their phone deserves to have been told
     rather than to find out. */
  navShapeOnPhone: 'On a narrow screen the bottom tab bar is used whatever you pick here. A strip of eighteen entries across a phone is not a navigation.',
  /* WHAT THE TOP BAR IS HIDING, SAID AS A NUMBER. `19 §3` makes this the condition that stops a
     chosen top bar becoming the rejected default: it "states how many entries sit behind More
     rather than quietly swallowing them". */
  navBehindMore: (n: number) => `More, and ${n.toLocaleString('en')} ${n === 1 ? 'page' : 'pages'} behind it`,

  /* THE DESIGN AGENT'S OWN RECOMMENDATION, `19 §3`: the design agent reads the record and answers
     with one shape and one sentence of why. The sentence itself comes from `design/nav-shape.ts`;
     these are the verbs around it, never applied on their own and Dismiss is terminal. */
  navShapeRecommend: 'A shape that might suit this record better',
  navShapeRecommendAccept: (label: string) => `Switch to ${label}`,
  navShapeRecommendDismiss: 'Dismiss',

  /* the signing key — `53 §4` puts the public half on the export screen, and `03 §4` says why */
  theSignature: 'How anybody checks a copy is yours',
  /* IT SAID ANYBODY COULD FETCH IT AT `/.well-known/braindog-key`, and there is no such route in
     any of the three apps — the one sentence on this screen asserting a live endpoint, where every
     other unwritten action goes through `notWritten`. `03 §4` specifies the URL; the product has not
     got it yet, and the sentence says what is true today. */
  theSignatureIs: 'Every export and every backup is signed. This is the public half of the key that signs them. It opens nothing, which is why it is safe to hand to anybody checking a copy.',
  keyFingerprint: 'Fingerprint',
  keyPublic: 'Public key',
  copyKey: 'Copy the key',
  keyCopied: 'Public key copied',
  verifyHow: 'Hand it to somebody with a copy of your record and they can prove it came from here and that no row has changed since. Without it they can prove the file is whole, but not where it came from.',
  /* AND ON A RECORD THERE IS NO KEY TO SHOW YET. The value under this heading is the sample's, kept
     in `data.ts` with the rest of the synthetic record, and it was drawn on every record: an
     invented key presented as that record's own, which no reader could tell by looking. `boot` does
     not carry the real one and `03 §4`'s well-known URL is served by none of the three apps, so a
     record gets the fact that its files are signed and the absence said plainly, which is the
     register `notWritten` uses everywhere else on this screen. */
  /* THE CHECK, RUN IN THIS BROWSER over a file somebody picks: the same `checkBrainl` an import runs before it writes
     a row. It proves the file is whole and signed by the key inside it, and not whose key that is, so it says no more. */
  fileChecked: (name: string) =>
    `${name} is whole and signed. Every table matches its own manifest, and the signature holds for the key inside the file.`,
  fileFailed: (name: string, fix: string) => `${name} did not pass. ${fix}`,
  fileUnread: (name: string) => `${name} could not be read as text. Only a .brainl file can be checked here.`,
  theSignatureNotHere: 'Every export and every backup is signed. The public half of the key that signs them is not shown here yet, so there is nothing on this screen to hand to somebody checking a copy.',

  /* deletion — `02 §9`: browser session, re-authenticated, the slug typed */
  /* `deleteWhat` ALREADY SAYS "It cannot be undone", one line above this on the screen — in the
     section whose own comment condemns *"three lines, two of them the same sentence"*. This one
     carries what `deleteWhat` does not: how long a change of mind lasts, and when the last copy is
     gone (`53 §5.9`). */
  deleteCosts: 'A final copy is kept for the rest of today, in case you change your mind within the hour. Within thirty days nothing of this record is left anywhere.',
  typeSlug: (slug: string) => `Type ${slug} to confirm`,

  keptCloud: (n: number) => `A backup of the whole record every night. The ${n} newest are kept, plus the latest.`,
  keptSelfHost: (n: number) => `A backup of the whole record every night, on this machine. The ${n} newest are kept.`,
  snapshotFailed: 'Nothing kept',
  download: 'Download',
  restoreTo: 'Restore to a time',
  findTheMoment: 'Find the moment',
  restoreLoses: 'What it costs',
  restoreLosesWhat: 'Every change made after the moment you pick. There is no way to bring them back except restoring forward again.',
  restoreBack: 'If it was wrong',
  restoreBackHow: 'Restore to the instant just before. That is a point in time too, for thirty days.',
  rowsAndSize: (rows: number, size: string) => `${rows.toLocaleString('en')} rows · ${size}`,
  snapshotNow: 'Back up now',
  theKey: 'The key',
  /* `49 §8` asks for exactly this line. */
  /**
   * IT TOLD SOMEBODY TO BACK UP A KEY IT WOULD NOT SHOW THEM.
   *
   * The section had no button, no link and no value in it: *"Back that key up somewhere else, or
   * the copies cannot be opened"* over an empty box. `49 §8` asks for the sentence and the sentence
   * is right; a screen that gives an instruction and then withholds the one thing needed to follow
   * it is the same defect as a control that does nothing.
   *
   * WHERE THE KEY IS IS THE HONEST ANSWER, and on a self-host it is a file on their own disk rather
   * than anything this screen could print. `12 §8` keeps the age identity outside the product on
   * purpose, so the fix is not to reveal it here; it is to say where it lives.
   */
  theKeyIs:
    'These copies are sealed with a key that is not inside them, and this record cannot show it to you: it is kept outside the product on purpose.',
  theKeyWhere:
    'On a self-host it is the key file you made when you set the record up. Copy that file somewhere else, or these backups cannot be opened.',
  restore: 'Going back',
  restoreSelfHost: 'This record is self-hosted, so going back means restoring one of the copies above by hand.',
  restoreCloud: 'Any point in the last thirty days, not only the nightly copies.',

  /* billing — nothing to bill on a self-host (23 §8: one line in Settings) */
  billing: 'Billing',
  billingSelfHost: 'This record runs on your own machine. There is nothing to bill and no subscription to lapse.',
  billingCloud: 'Payment is up to date. If it ever lapses the record turns read-only, and export keeps working.',

  /** Names the source block so tabbing into it says which page it is the workings of. */
  declarationOf: (page: string) => `How ${page} is built`,
  /* The toggle top right of every page. `Source` was a developer's word for it, read by somebody
     who does not write code as an origin or a supplier. */
  pageSource: 'How this is built',
  pageBack: 'Back to the page',

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
    /* `payments in and out` AND IT WAS `movements`. A movement is a bookkeeper's word for the thing
       and this line sits under a table of dated amounts on a screen a business owner opens to see
       what is coming: the reader knows what a payment is and does not have to be taught. */
    `The next ${drawn.toLocaleString('en')} of ${total.toLocaleString('en')} payments in and out over ${days} days`,

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
  scopeGrid: 'In a list',
  scopeBoard: 'On a board',
  scopePage: 'On a page',
  scopeGate: 'At the gate',
  scopeDecide: 'In Decide',
  scopeInbox: 'In the inbox',
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
  /**
   * AND THE FOUR AREAS WHERE THAT SENTENCE IS FALSE.
   *
   * `mockNotice` was rendered outside the area branch, so it appeared on all twelve — including the
   * three where every control genuinely persists. On `/settings/navigation` it sat four lines under
   * `perDevice`'s *"This setting is remembered on this device"*: two sentences, one screen, one
   * scroll, saying opposite things. Measured on the deployed build: accent, colour scheme, text
   * size, density, character keys and page suggestions all write `bd_pref` and all survive a
   * reload, under a footer telling the reader they do not.
   *
   * The one blanket disclaimer that exists to protect the mock had become the thing teaching people
   * not to trust the half that works.
   */
  mockNoticeSome: 'The settings above are kept on this device. Nothing else here is saved yet.',
  /* On a live record the rest of Settings writes to it, so only the device half is said. */
  keptOnDevice: 'The settings above are kept on this device.',

  /* ── the front door · `/signin` ───────────────────────────────────────────────────────────────

     One sentence per state of `lib/signin.ts`, and calm throughout: a closed passkey sheet or a
     lockout is something that happened, not something that went wrong. Nothing here names a way in
     the host has not offered, because the screen never draws one. */

  /** `33 §4`'s own row is headed *Sign in*, so that is the word rather than a new one. */
  signIn: 'Sign in',
  signInLede: 'Sign in to open your record.',
  checkingWays: 'Checking how this server signs you in',
  withPasskey: 'Sign in with a passkey',
  /* The mechanism and not the gesture: "Use Face ID" is wrong on a laptop, and the browser names the
     gesture itself a moment later. */
  waitingForPasskey: 'Waiting for your passkey',
  passkeyCancelled: 'Sign-in was cancelled. Nothing changed.',
  passkeyUnusable: 'This browser cannot use a passkey here. Try another browser, or another way in.',
  emailLink: 'Email me a sign-in link',
  emailLabel: 'Email',
  emailLike: 'you@example.com',
  sendLink: 'Send me a link',
  sendingLink: 'Sending the link',
  linkSentTitle: 'Check your email',
  /* The host answers alike for an address it does not know, so this cannot say the link was sent. */
  linkSentBody: (email: string) => `If ${email} can sign in here, a link is on its way. It works once, for fifteen minutes.`,
  useAnotherEmail: 'Use a different email',
  serverKeyWay: 'Sign in with the server key',
  serverKeyLabel: 'Server key',
  /* Where the credential goes, said to the person handing it over: one request, and nowhere after. */
  serverKeyHint: 'The key you started your server with. It is sent once and never kept in this browser.',
  /* Two full literals for the toggle's two states, which is this file's own rule about a toggle. */
  showToken: 'Show',
  hideToken: 'Hide',
  signingIn: 'Signing you in',
  rejectedTitle: 'That did not sign you in.',
  rejectedNext: 'Try again, or use another way in.',
  closedTitle: 'The server could not check that just now.',
  closedNext: 'Nobody was let in. Try again in a minute.',
  lockedTitle: (minutes: number) => `Sign-in is paused for ${minutes === 1 ? 'a minute' : `${minutes} minutes`}.`,
  lockedWhy: 'There were too many tries. Waiting is the only way through it.',
  linkLandingTitle: 'Your sign-in link is here.',
  claimLandingTitle: 'Your record is ready to claim.',
  useLink: 'Sign in with this link',
  claimRecord: 'Claim your record',
  linkExpiredTitle: 'That link has expired or was already used.',
  linkExpiredWhy: (kind: 'magic' | 'claim', canAsk: boolean) =>
    kind === 'claim'
      ? 'Ask whoever set up your record for a new one.'
      : canAsk
        ? 'A link works once, for fifteen minutes. Ask for a new one below.'
        : 'A link works once, for fifteen minutes.',
  unreachableTitle: 'The server did not answer.',
  unreachableWhy: 'Check your connection, then try again.',
  /* After a press of Try again that came back the same, so the press visibly did something. */
  unreachableStill: (at: string) => `Asked again at ${at}, and it still did not answer. Check your connection, then try again.`,
  askAgain: 'Try again',
  noHostTitle: 'There is nothing to sign in to here.',
  noHostWhy: 'This copy of BrainDog runs without a server, so there is no record behind it.',
  openTitle: 'This server lets you straight in.',
  openWhy: 'It was started without a key, so anyone on this computer can open the record.',
  openYourRecord: 'Open your record',
  /* What the hosted app says until its sign-in is switched on, to whoever opens it: a fact and a
     promise, and the demo underneath as the one thing to press. */
  notConfiguredTitle: 'Sign-in is not open here yet.',
  notConfiguredWhy: 'When it opens, this is where you will sign in to your record.',
  insecureTitle: 'Sign-in needs a secure address.',
  insecureWhy: "Open this page over https, or at localhost on the server's own computer.",
  signedInTitle: 'You are signed in',
  /* Every screen reads the record once somebody is signed in; the sample is only for a browser with none. */
  signedInReads: 'Every screen now reads this record.',
  addPasskeyHere: 'Add a passkey on this device',
  addPasskeyWhy: 'Add one now, so next time you can sign in without the key.',
  addingPasskey: 'Waiting for your device',
  passkeyAdded: 'Passkey added. Next time, sign in with it.',
  passkeyNotAdded: 'Nothing was added.',
  passkeyExists: 'This device already has a passkey for this record.',
  passkeyFailed: 'The passkey was not added. Try again.',
  openBrainDog: 'Open BrainDog',
  signOut: 'Sign out',
  signingOut: 'Signing out',
  signedOut: 'You are signed out.',
  signOutFailed: 'You are still signed in. Try again.',
  /* The marketing site's own line, because the app must not imply an account to look around. */
  demoNeedsNothing: 'The demo record needs no sign-in. There is no sign-up and no billing.',
  openTheDemo: 'Open the demo record',
  /* THE AIM FOR THE DECIDE QUEUE, AS A SENTENCE. `/decide` printed the metric's note by itself,
     `no more than 3`, at the end of its heading row: a fragment with no subject, beside a count of
     4 it was failing. The words are here; the tone and its glyph come from the metric. */
  aimFor: (target: string) => `Aim for ${target}`,
  /* Inbox and page-row writes (lane D) */
  inboxFileInto: 'File it in',
  inboxFiled: (row: string) => `Filed as ${row}. It has left the inbox.`,
  inboxArchived: 'Archived. The email is kept, and it has left the inbox.',
  inboxNoLists: 'This record has no lists to file it in yet.',
  recordNotReached: 'The record could not be reached, so nothing was saved. Try again in a moment.',
  pageRowConflict: (title: string) => `${title} was changed somewhere else first. The page has been read again, so try once more.`,
  pageRowUnknown: 'This could not be saved from here, because the page did not say which row it is.',
  pageRowNoState: 'This could not be saved from here, because its list has no state to mark it done with.',
  /* Decide and page writes (lane B) */
  decideConflict: 'A row this would change has changed since it was proposed. Nothing was written, and the question has been read again.',
  /* Row writes (lane A) */
  writeConflict: (row: string) => `${row} was changed somewhere else first. It now shows the latest version, so check it and try again.`,
  writeNotReached: 'The record could not be reached, so nothing was saved. Try again in a moment.',
  writeMarkAdded: 'Added',
  writeMarkSaved: 'Saved',
  writeMarkSaving: 'Saving',
  writeBulk: (landed: number, total: number, state: string) =>
    landed === total ? `${total} ${total === 1 ? 'row' : 'rows'} set to ${state}.` : `${landed} of ${total} rows set to ${state}.`,
  noteLabel: 'Add a note',
  notePlaceholder: 'Write a note…',
  noteAdd: 'Add note',
  noteWouldBeAdded: "The note would be added to this row's history",
  /* Settings, vault and packs writes (lane C) */
  writeRaced: 'The record changed while this was sent, so it has been read again.',
  levelMoved: (name: string, to: string) => `${name} is set to ${to} across this record.`,
  accessRemoved: (name: string) => `${name} no longer has access to this record.`,
  exceptionRemoved: (list: string, to: string) => `${list} is back to ${to}.`,
  exceptionAdded: (name: string, list: string, level: string) => `${name} is set to ${level} on ${list}.`,
  exceptionList: 'List',
  exceptionLevel: 'Level',
  exceptionAdd: 'Add',
  exceptionCancel: 'Cancel',
  peopleUnrouted: 'This record does not list its people yet.',
  exported: (file: string) => `${file} is in your downloads.`,
  uninstalled: (pack: string) => `${pack} is uninstalled. The rows it created are still here.`,
  /* Lane E: archive and restore, installing an add-on, and saved views */
  writeArchived: (what: string) => `Archived ${what}.`,
  writeArchivedSome: (landed: number, total: number) => `${landed} of ${total} rows archived.`,
  writeMarkRestored: 'Restored',
  packInstalledNamed: (pack: string) => `${pack} is installed.`,
  packNotInstallable: (pack: string) => `${pack} cannot be installed on this record yet, so nothing was changed.`,
  packPlanning: 'Reading what this adds',
  viewsSection: 'Views',
  viewEmpty: 'No rows match this view yet.',
  viewTitle: (list: string, reads: string) => `${list}: ${reads}`,
  viewSaved: (title: string) => `Saved ${title}. It is under Views.`,
  viewNeedsFilter: 'Filter or search the list first. What is on screen is what a view saves.',
  /* Lane F: backups, putting a copy back, erasing a person and deleting the record */
  backedUp: (id: string) => `Backed up. The copy is ${id}.`,
  sizeOnDisk: (size: string) => `${size} on disk`,
  restoreThis: 'Restore this copy',
  restoreLive: 'Put the record back to one of the copies above. What it holds now is kept as a copy first.',
  restoreConfirm: (id: string) => `Put the record back to ${id}? Everything written since then is replaced.`,
  keepAsIs: 'Keep it as it is',
  restoredTo: (id: string, kept: string) => `The record is back to ${id}. What it held before is kept as ${kept}.`,
  eraseWho: 'Name or email',
  eraseBasis: 'Legal basis',
  eraseWhichPerson: 'Person on this record',
  eraseNobody: 'Not on this record',
  eraseNow: 'Erase for good',
  erasedRows: (rows: number) => `Erased. ${rows} ${rows === 1 ? "row no longer holds" : "rows no longer hold"} them, and the log keeps only that it happened.`,
  recordDeleted: (record: string) => `${record} is deleted. You can close this tab.`,
  /* Lane G: inviting somebody with a link the owner sends, and opening that link */
  inviteEmailLabel: 'Their email',
  inviteLevelLabel: 'What they can do',
  inviteMaking: 'Making a link',
  inviteNoMail: 'No email is sent. Copy the link and send it to them yourself.',
  inviteLinkReady: (email: string) => `This link is for ${email}. It is shown once, so copy it now.`,
  inviteCopyLink: 'Copy link',
  inviteLinkLabel: 'the invitation link',
  inviteDone: 'Done',
  invitesWaiting: 'Waiting to be used',
  inviteWaitingRow: (level: string, until: string) => `${level} · good until ${until}`,
  inviteWithdraw: 'Withdraw',
  inviteWithdrawn: (email: string) => `The link for ${email} no longer works.`,
  invitePageTitle: 'Invitation',
  inviteLanding: 'You have been invited to a record',
  inviteFor: (email: string) => `This invitation is for ${email}.`,
  inviteSignedInAs: (email: string) => `You are signed in as ${email}.`,
  inviteAccept: 'Accept',
  inviteAccepting: 'Accepting',
  inviteJoined: 'You are on the record.',
  inviteKeepWay: 'Add a passkey now, so you can sign in again on this device.',
  inviteNoLink: 'This page needs the whole invitation link. Open it again from the message it came in.',
  inviteChecking: 'Checking the link',
  inviteFailed: 'That did not work. Open the link again, or ask for a new one.',
  inviteAskNew: 'Ask the person who sent it for a new link.',
  inviteSignInFirst: 'Sign in',
  /* A key taken out of service from the vault screen: the bytes go, the row stays. */
  keyRevoked: (label: string) => label + ' is out of service. Its row stays, because what it opened is a fact.',
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
  captureFilled: (what: readonly string[]) => `Filled in ${list([...what])}. Change any of it on the row.`,
  /* The same fact as the chip on the row, which has the width for it only on a card. The grid wears `Added`. */
  markAddedFilled: (what: readonly string[]) => `Added, with ${list([...what])} filled in`,
  /* An example row that is a real row: it is named as one, so nobody has to wonder which of these they typed. */
  exampleTitle: (one: string) => `Example ${one}`,
  exampleAdded: (one: string) => `Added an example ${one}. Put it back if you do not want it.`,
  markExample: 'Example',
  /* Lane I */
  /**
   * EDITING A ROW WHERE IT IS READ, which is the half this screen did not have.
   *
   * The page could show every field and change none of them: the one control in the header opened a
   * toast saying the row "would open for editing". A detail screen that cannot edit is a report, and
   * the product's own answer to "change any of it" was on the list behind it, a screen away from the
   * row a person is looking at.
   *
   * ONE FIELD AT A TIME, so what is saved is what was changed: a form over eight fields sends eight
   * values and a `version`, and the seven nobody touched are seven chances to overwrite somebody
   * else's write with what was on screen when the page was opened.
   */
  /* `editValue` IS ALREADY HERE, as "Change <field>", and it says what this control does. A second
     spelling of one sentence is the drift a copy file exists to prevent. */
  editSave: 'Save',
  editCancel: 'Cancel',
  /* A SAVE THAT CHANGES NOTHING IS NOT A WRITE. Sending it would put a line in the row's history
     saying a field went from a value to the same value, which is a fact about a press, not the row. */
  editNoChange: 'Nothing was changed.',
  /* What a field the row does not carry yet says, where a value would be. It is a fact about the
     row — the register declares the field and this row has not answered it — and not an absence. */
  editNotSet: 'Not set',
  /* Archive and put back, on the row itself, in the words the list already uses for the same verb. */
  rowArchive: 'Archive',
  rowRestore: 'Put back',
  rowArchiveWould: 'The row would be archived',
  rowRestoreWould: 'The row would be put back',
  rowRestored: (what: string) => `${what} is back.`,
  /* The row is archived: said on the row, because every list leaves it out and nothing else here would. */
  rowArchivedNote: 'This row is archived. It is left out of every list until it is put back.',
  /* What points at this row, when the record refuses that read alone: the sections are absent and the
     reason is said once, rather than the page looking like nothing points here. */
  linksRefused: 'What points at this row could not be read.',
  /* Lane O: the page's source as a file. The name is on the button because the name is the point —
     one page, one file, called what the declaration's first line calls it. */
  pageSourceSave: (file: string) => `Download ${file}`,
  /* Phase 1's last reads: what a question found by `/search` on a record says beside its title. */
  searchOpenQuestion: 'Open question',
  searchDecided: 'Decided',
  /* DECIDE AND THE INBOX AS QUEUES (DESIGN-SYSTEM appendix D): the cursor, a selection, and what a
     proposal would put on the screen. No sentence here assumes what kind of record it is. */
  proposalWillAppear: 'What will appear',
  fromSpark: 'From Spark',
  proposalKind: (kind: string): string =>
    ({ page: 'Page', register: 'List', ingest: 'Rule for what comes in', theme: 'Look', metric: 'Measure', digest: 'Summary', rule: 'Rule', block: 'Block' })[kind] ??
    kind.charAt(0).toUpperCase() + kind.slice(1),
  proposalInSidebar: 'In the sidebar',
  proposalUnder: (section: string) => `Under ${section}`,
  proposalNotInSidebar: 'Not in the sidebar, reached by its link',
  proposalShows: 'Shows',
  proposalReads: 'Reads from',
  proposalFields: 'Fields',
  proposalComesFrom: 'Comes from',
  proposalEvery: 'How often',
  proposalFilesInto: 'Files into',
  proposalAccent: 'Accent',
  proposalScheme: 'Scheme',
  proposalSamples: (n: number) => `Drawn from ${n} ${n === 1 ? 'thing' : 'things'} that came in`,
  decideRows: (n: number, list: string) => `Changes ${n} ${n === 1 ? 'row' : 'rows'} in ${list}`,
  decideGroup: 'Group',
  decideGroupNone: 'One list',
  decideGroupList: 'By what it is about',
  decideGroupElse: 'Everything else',
  decideSelected: (n: number) => `${n} selected`,
  decideAnswerSuggested: (n: number) => `Answer ${n} with what is suggested`,
  decideNoneSuggested: 'None of these has a suggested answer. Answer each one.',
  decideBatchReason: 'One reason for all of them',
  decideBatchDone: (n: number) => `${n} answered.`,
  clearSelection: 'Clear the selection',
  decideDecided: (option: string) => `Decided: ${option}`,
  decideToSend: 'sends it',
  decideToLeave: 'goes back to the list',
  decideNext: 'Next question',
  decideOpenInbox: 'Open the inbox',
  inboxOpenDecide: 'Open Decide',
  inboxSelected: (n: number) => `${n} selected`,
  inboxFileSelected: (n: number) => `File ${n}`,
  inboxArchiveSelected: (n: number) => `Archive ${n}`,
  inboxBatchFiled: (n: number) => `${n} filed. They have left the inbox.`,
  inboxBatchArchived: (n: number) => `${n} archived. They are kept, and they have left the inbox.`,
  inboxWouldFile: (n: number) => `${n} ${n === 1 ? 'row' : 'rows'} would be created from these`,
  inboxWouldArchive: (n: number) => `${n} would be archived, and their bytes kept`,
  decideWouldAnswer: (n: number) => `${n} would be answered with what is suggested`,
  /* A PROPOSAL THAT ARRANGES THIS BRAINDOG (DESIGN-SYSTEM D11): a pack, its settings, or several at once. Why, what it
     calls out, the packs, what appears, the words that change, the rest; then what was applied, or how far it got. */
  arrangeLeadUseCase: (name: string) => `Sets this BrainDog up for ${name}`,
  arrangeLeadArrange: 'Rearranges this BrainDog',
  arrangeLeadInstall: (name: string) => `Adds ${name}`,
  arrangeLeadEnable: (name: string) => `Turns ${name} back on`,
  arrangeLeadDisable: (name: string) => `Turns ${name} off`,
  arrangeLeadSettings: (name: string) => `Changes the words and settings of ${name}`,
  arrangeWhy: 'Why',
  arrangeCalls: 'Calls out once you accept',
  arrangeCallsNote: 'Accepting approves these. Each one reaches a service outside this record, and counts toward what it calls out.',
  arrangeCallKey: (label: string) => `with the key “${label}”`,
  arrangeCallNoKey: 'with no key',
  arrangeCallNoHost: 'A service it does not name',
  arrangeCallSends: (fields: string) => `sends ${fields}`,
  arrangePacks: 'Packs',
  arrangeInstalls: (names: readonly string[]) => `Installs ${names.join(', then ')}`,
  /** Use cases an arrangement installs beside the one the record speaks in, which keeps its voice. */
  arrangeBeside: (names: string[]) => `Adds ${list(names)} beside it, in the same voice`,
  arrangeTurnsOn: (names: readonly string[]) => `Turns on ${list([...names])}`,
  arrangeTurnsOff: (names: readonly string[]) => `Turns off ${list([...names])}`,
  arrangeListsLeave: (lists: readonly string[]) => `${list([...lists])} ${lists.length === 1 ? 'leaves' : 'leave'} the sidebar. The rows are kept.`,
  arrangeListsReturn: (lists: readonly string[]) => `${list([...lists])} ${lists.length === 1 ? 'comes' : 'come'} back to the sidebar.`,
  arrangeNew: (kind: string) => `New ${kind.toLowerCase()}`,
  arrangeChanged: (kind: string) => `Changed ${kind.toLowerCase()}`,
  arrangeAlso: 'Also adds',
  arrangeAdds: 'Adds',
  arrangeMany: (kind: string): string =>
    ({ page: 'Pages', register: 'Lists', ingest: 'Rules for what comes in', theme: 'Looks', metric: 'Measures', digest: 'Summaries', rule: 'Rules', block: 'Blocks' })[kind] ??
    kind.charAt(0).toUpperCase() + kind.slice(1),
  arrangeShowsNow: 'Shows now',
  arrangeWillShow: 'Will show',
  arrangeExamples: (n: number) => `With ${n} example ${n === 1 ? 'row' : 'rows'} to start from`,
  arrangeWords: 'Words',
  arrangeCalled: (now: string, next: string) => `${now} will be called “${next}”`,
  arrangeReads: (now: string, next: string) => `“${now}” will read “${next}”`,
  arrangeBackToHouse: (now: string, house: string) => `“${now}” goes back to “${house}”`,
  arrangeListCalled: (list: string, next: string) => `The list ${list} will be called “${next}”`,
  arrangeFieldCalled: (list: string, field: string, next: string) => `In ${list}, ${field} will be called “${next}”`,
  arrangeValueCalled: (list: string, value: string, next: string) => `In ${list}, “${value}” will be called “${next}”`,
  arrangeDefault: 'its usual word',
  /** A long label filed before its title was, so only its hashed setting name is known. */
  arrangeLongLabel: 'A label',
  arrangeSettings: 'Settings',
  arrangeSettingTo: (pack: string, setting: string, value: string, was: string | null) =>
    was === null ? `${pack}: ${setting} will be ${value}` : `${pack}: ${setting} will be ${value}, where it is ${was} now`,
  arrangeCountPages: (n: number) => `${n} new ${n === 1 ? 'page' : 'pages'}`,
  arrangeCountLists: (n: number) => `${n} new ${n === 1 ? 'list' : 'lists'}`,
  arrangeCountOther: (n: number) => `${n} more ${n === 1 ? 'change' : 'changes'}`,
  arrangeCountWords: (n: number) => `${n} ${n === 1 ? 'word changes' : 'words change'}`,
  arrangeLeadSummary: (lead: string, summary: string) => `${lead}: ${summary}`,
  arrangeCountSettings: (n: number) => `${n} ${n === 1 ? 'setting' : 'settings'}`,
  arrangeApplied: 'What was applied',
  arrangeDidInstall: (names: readonly string[]) => `Installed ${list([...names])}`,
  arrangeDidEnable: (names: readonly string[]) => `Turned on ${list([...names])}`,
  arrangeDidDisable: (names: readonly string[]) => `Turned off ${list([...names])}`,
  arrangeDidPages: (names: readonly string[]) => `Put in place ${names.length === 1 ? 'the page' : 'the pages'} ${list([...names])}`,
  arrangeDidSettings: (names: readonly string[]) => `Changed the words and settings of ${list([...names])}`,
  arrangeDidSidebar: (names: readonly string[]) => `New in the sidebar: ${names.join(', ')}`,
  arrangeDidNothing: 'Everything it asked for was already in place.',
  arrangePartial: 'Only part of this was applied',
  arrangePartialDone: 'Done, and kept',
  arrangePartialLeft: 'Not done',
  arrangePartialWhy: 'What stopped it',
  arrangePartialOpen: 'The question is open again. Accept it once what stopped it is put right, or reject it.',
  arrangeNotApplied: 'None of it was applied, and the question is still open.',
  arrangePageNamed: (name: string) => `the page ${name}`,
  arrangeSettingsOf: (name: string) => `the words and settings of ${name}`,
  arrangeNotInBatch: 'A proposal that arranges this BrainDog is answered on its own, so it is not in this answer.',
  decideSelect: 'Select',
  decideSelectDone: 'Done',
} as const;

export type Copy = typeof copy;
