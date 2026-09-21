/**
 * THE FIRST RUN'S OWN WORDS, AND THE VOCABULARY THEY INTRODUCE.
 *
 * IT IS SPLIT OUT FOR A MEASURED REASON. `copy.ts` is imported by the shell, so everything in it
 * lands in the entry chunk that every screen waits for — and this is over a kilobyte of prose read
 * by exactly two surfaces, `/start` and `Second.svelte`, one of which a person sees once. The bundle
 * gate measures "the entry chunk and everything statically reachable from it" and `50 §10` records
 * the path back under 30 KB; shipping the sign-up copy to somebody opening their obligations on a
 * phone is the opposite direction.
 *
 * IT DOES NOT BREAK `copy.ts`'s RULE. That file's first line is that every UI literal lives in one
 * place, and the argument is about literals not being typed into markup where they drift — not
 * about one module. This is the same place, addressed by what reads it.
 */

import type { IconName } from './ui/icons.ts';

export const firstRun = {
  /* FIRST RUN, TURN 1 (`loop/research-modular.md` §2). A question, a field and four chips; what was
     heard is said back, and nothing explains the screen. The chips append words, so each is a clause
     a person could have typed, never a choice. */
  whoQuestion: 'Who are you?',
  whoPlaceholder: 'Your name, and what you do',
  /* ONE CHIP PER KIND OF PERSON THE PRODUCT IS FOR (`loop/DIRECTION.md` §11), and they were four ways of
     running a business. Each is still a clause a person could have typed. */
  whoChips: ["I'm a student", 'I run a few companies', "I'm part of a team", "I'm starting something new"],
  whoChipsLabel: 'Add to your answer',
  gotYou: (name: string) => `Got it, you're ${name}.`,
  gotIt: 'Got it.',
  whoEdit: 'Edit your answer',
  /* TURN 3, beside the row they typed. Said only when the People row was actually made. */
  youArePending: (name: string, mark: string) => `${name} is in People too, marked ${mark}.`,
  youAreKnown: (name: string) => `${name} is in People too.`,

  /* TURN 2 (`loop/research-modules.md` §5). A question, a field and six chips; what was heard and what
     the record will hold are two short columns, and the screen explains neither.

     IT ASKED "What's your business?", and a student, a team or somebody with an idea is not a business.
     The question is what this BrainDog is for, and the chips span the people it is for
     (`loop/research-spark.md` §1). */
  shapeQuestion: 'What is this BrainDog for?',
  shapePlaceholder: 'Your studies, your companies, a team, a new project, or anything you keep track of',
  shapeChips: ['My courses and homework', 'Dashboards for my projects', 'I send invoices', 'Tasks for a small team', 'A new project', 'I use Claude or Codex'],

  /* THE USE CASE IT SUGGESTS, above the two columns (`loop/research-spark.md` §3.2). Suggested and never
     chosen for them: the other use cases are one press away, and nothing is made until Make my record.
     Titles, summaries and tones are the use case's own words, from its package. */
  useSuggested: 'Suggested for this BrainDog',
  useNone: 'Nothing here points to one kind of BrainDog yet. Choose one below, or say a little more.',
  useChoose: 'Make it for',
  usePages: (names: string) => `Pages: ${names}.`,
  useLists: (names: string) => `Lists: ${names}.`,
  useBuildsOn: (names: string) => `Builds on ${names}.`,
  useBeside: (names: string) => `Adds ${names} as well, from what you said.`,
  useVoice: (tone: string, lines: string) => `In a voice that is ${tone}: ${lines}.`,
  useHouseVoice: 'Speaks in the house voice.',
  /* A USE CASE THAT FORMS AROUND WHAT WAS SAID (the guide): what it made from the sentence, or the one thing to add. */
  useFormed: (name: string) => `Its milestones, first steps and choices are for ${name}, from what you said.`,
  useFormHint: 'Say what the project is, such as a podcast, a shop or an app, and its milestones and first steps are made for it.',
  /** Where a model drafted the plan instead: it waits on Decide, and nothing in it is added until it is accepted. */
  usePlanWaiting: 'Spark drafted a first plan for what you said. It is waiting on Decide, and nothing in it is added until you accept it.',
  usePlanSee: 'See the plan',
  /** The note on the rows of a plan written after its lists went in, when no model formed one. */
  usePlanPlanted: 'The first plan for this project.',
  useQuoted: (line: string) => `“${line}”`,
  shapeHeard: 'What I heard',
  shapeRecord: 'Your record',
  shapeHeardCount: (n: number) => (n === 1 ? 'Heard one thing.' : `Heard ${n} things.`),
  /* An amount with no currency is said back, so the person sees why it is not in the row. */
  shapeNoCurrency: 'no currency, so not kept',
  shapeLanguage: 'This reads English only for now.',
  shapeUnread: 'Nothing here makes a list yet.',
  shapeYou: 'you',
  shapeNeeds: (what: string) => `needs ${what}`,
  shapeMissing: { amount: 'an amount', due: 'a due date' } as Record<string, string>,
  /* A title the record keeps, built only from what was typed: the cadence and the client's name. */
  shapeInvoice: (cadence: string | null, client: string | null) =>
    `${cadence ? `${cadence.charAt(0).toUpperCase()}${cadence.slice(1)} invoice` : 'Invoice'}${client ? ` to ${client}` : ''}`,
  shapeMake: 'Make my record',
  shapeFromList: 'Start from a list instead',
  /* `Describe your business instead`, AND A STUDENT IS NOT A BUSINESS. `shapeQuestion` above stopped
     asking "What's your business?" for that reason and this button, which is the way back to that very
     question, went on saying it: on 21 September three of the four people driven through this screen
     were offered a business to describe on the one screen where they have said nothing yet. It names
     the question it returns to, which is what a button naming its destination is for. */
  shapeDescribe: 'Say what this BrainDog is for instead',
  shapeAnd: (items: readonly string[]) =>
    items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`,
  shapeIn: (name: string, list: string) => `${name} in ${list}`,
  shapeMade: (items: string) => `Made ${items}.`,
  shapeMadeWaiting: (items: string, mark: string) => `Made ${items}, marked ${mark}.`,
  shapeReady: 'Your lists are ready.',
  shapeTurnedOn: (names: string) => `Turned on ${names}.`,
  shapeAbsent: (names: string) => `Not installed on this record: ${names}. Nothing was made there.`,
  /* A LIST THE LIVE RECORD DID NOT HAVE, added through its own plan. Its example rows are said,
     because they are rows the person did not type and will find in the list.

     AND IT IS SAID ONLY OF THE LISTS THAT REALLY CARRY THEM, which is what `addedIn` is for. This
     was the whole outcome's one sentence: a student record made on 21 September answered "Added
     Projects, People, Tasks, Courses, Assignments and Study sessions, with example rows marked
     example." and three of those six lists were empty, because example rows belong to the use case
     and `MODULE_EXAMPLES` names no student. The feed on the next screen said "3 example rows". */
  shapeAdded: (names: string) => `Added ${names}, with example rows marked example.`,
  /* A LIST HOLDING THE PLAN FORMED FROM WHAT THE PERSON SAID, which is not an example of anything.
     Somebody who typed "I want to start a podcast and I do not know where to begin" was told, about
     the only sixteen rows on their record and on the first screen they had ever seen, that they were
     example rows. `install.ts` is already explicit that a formed plan is the person's and that
     Clear the examples must leave it; this is the sentence catching up with it. */
  shapeAddedFormed: (names: string) => `Added ${names}, holding the plan made from what you said.`,
  /* A LIST THAT ARRIVED WITH NOTHING IN IT, said rather than left to be found. A module a use case
     installs carries that use case's examples or none, so a student's Projects and Tasks go in empty,
     and their pages then read as a product that has lost something. Saying so is the honest half of
     what `research-usability-2026-09-21.md` finding 2 asks for; the other half is the rail, which
     keeps a page of an empty list off it, and that is not this file's to fix. */
  shapeAddedEmpty: (names: string) => `Added ${names}, with nothing in them yet.`,
  /* AND A LIST WHOSE ONE ROW IS THE PERSON THEMSELVES. People is the only list this screen adds that
     it also writes a row into, and the sentence about that row is `youAreKnown`, one line below. */
  shapeAddedPlain: (names: string) => `Added ${names}.`,
  /* A list that could not be added, in one sentence, and nothing is made in it. */
  shapeNotAdded: (name: string, fix: string) => `${name} was not added: ${fix}`,
  shapeNeedsFirst: (name: string, needs: string) => `${name} was not added, because it needs ${needs} first.`,
  shapeChanged: 'the record changed while it was being added, so try again.',
  shapeRefused: (name: string, fix: string) => `${name} was not made. ${fix}`,
  /**
   * AND `/start` OPENED AGAIN ON A RECORD THAT IS ALREADY MADE SAYS SO, AND OFFERS THE WAY BACK.
   *
   * MEASURED ON 21 September: this screen on an arranged record drew 21 words, five controls and a
   * blank "Who are you?", with no sign that the BrainDog behind it already had a use case, a name and
   * four hundred rows, and nothing on it to press to get back to them. The root layout spares
   * `/start` from the redirect that sends an empty record here, which is right, and it is also what
   * makes this the one screen somebody can reach with the record already behind it.
   *
   * IT IS THREE SHORT SENTENCES AND A DOOR, not a warning. Answering again installs; it deletes
   * nothing and changes no row, so saying so is what lets somebody who came here on purpose carry on.
   */
  againMade: 'This BrainDog is already made.',
  againMore: 'Answering again adds to it and takes nothing away.',
  againBack: 'Open this BrainDog',
  /* first run.

     THE FIRST SCREEN SETS THE CEILING. It used to open with "What do you want to stop forgetting?"
     over three narrow nouns — an invoice, a domain, a decision — and somebody reading that meets a
     reminders app with a database under it. The record is the whole of a business that is not just
     code, and a first run that asks about a domain renewal has already decided it is something
     smaller.

     So the scope is stated before the question is asked, and the choices are the PARTS OF A
     BUSINESS rather than three things worth remembering. The mechanic underneath is unchanged and
     still right (19 §6): one row, typed by hand, no pack vocabulary, nothing to approve. You are
     not picking a plan or a template — you are picking where to start, which is a different
     sentence and the reason there are five of them now instead of three. */
  /* NOT "that isn't code", WHICH READS AS A BOUNDARY THE PRODUCT DOES NOT HAVE. A repository, a
     deploy and a bug are all things a record holds; what it is not is a place to keep the code
     itself. "Not just code" says the same thing without telling a developer their work is out of
     scope. */
  firstLede: 'Everything you keep track of, not just code.',
  /* `the services it runs on` AND IT WAS `the estate`. One area of this record answered to four
     names — this lede, the card below it, the pack, the rail's section heading — while the list
     underneath all of them was called Services. This is the first paragraph of the first screen,
     so it is where a reader learns the word, and it was teaching them the one nothing else says. */
  firstBody:
    'Money, the services you run on, the people, the projects, and the decisions behind ' +
    'them. Typed, versioned, and readable by every agent you use.',
  firstQuestion: 'Where do you want to start?',
  /* SPLIT IN TWO, so the clause defining *row* can sit against the word rather than behind the
     paragraph. Both halves are sentences on their own, which is what lets the definition slot
     between them without either one reading as a fragment. */
  firstRowIs: 'One real row is enough.',
  firstHint: 'You can delete it later.',
  firstChoices: [
    { key: 'obligations', icon: 'money', label: 'Money', body: 'What you owe, and what you are owed.', field: 'What is it, and how much?' },
    /* `Services`, AND IT WAS `The estate`. The tile is the second of five on the first screen
       anybody sees, and it was the only one of the five whose word appeared nowhere else in the
       product: the register it makes is Services, the rail heading over it is Services now, and
       the page it opens is Renewals. `start.ts` resolves `?add=` against the word on the tile, so
       `?add=services` and `?add=Services` both land where they did; `?add=estate` and
       `?add=the-estate` now get the choice list, which is the honest answer to a word this
       record's tiles no longer use. Nothing in the product writes that parameter. */
    { key: 'services', icon: 'calendar', label: 'Services', body: 'Domains, hosting, subscriptions, licences.', field: 'What renews, and when?' },
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
    'Rows in one list can point at rows in another: an invoice at the client it is for, a renewal at the project it belongs to.',

  /* AND THE WORD *PACK*, FOR THE FIRST TIME IN THE PRODUCT, DEFINED IN PLACE. It does not appear on
     screen one at all: selecting a pack means reading an install diff written in the language of
     metrics and nav order, and asking somebody to approve four schema reviews before they have seen
     one of their own rows is worse than a tour. Here they have seen one. */
  /* Cut to two short sentences: under a heading, a paragraph and three cards, the fourth block of
     prose on a first minute was the one nobody read. */
  secondPacks: 'A pack is a list somebody already worked out, with its figures and pages. Nothing installs until you have read what it changes.',
  secondBrowse: 'Browse packs',

  /**
   * SCREEN 2b: WHAT HAPPENED TO THE ROW THEY JUST TYPED.
   *
   * There was no screen here. `commit` pushed the honest toast and navigated in the same tick, and
   * the toast did not survive the navigation: measured on the deployed build, at 700ms the sentence
   * is in the DOM and the URL is still `/start`, and at 2,200ms the URL has changed and the live
   * region is present and empty. So the highest-stakes control in the product reported nothing at
   * all, and what it reported nothing about was landing on thirty-eight rows of a fictional studio
   * under a four-paragraph lesson about lists.
   *
   * THE FIX IS NOT A LONGER-LIVED TOAST. A screen must not navigate away from its own outcome; that
   * is what made the receipt losable, and it is also what made the answer confusing even when the
   * toast worked. The form stays exactly where it is with everything they typed still in it, which
   * IS the receipt, and the outcome is a sentence under the button they pressed.
   *
   * IT SAYS WHAT IS TRUE AND NOT WHAT STAGE THE BUILD IS AT (`19 §9`). "Nothing was saved yet" is
   * the same sentence forty other controls give, so a person meets one product rather than one
   * product and one apology.
   */
  keptNothing: 'Nothing was saved yet.',
  /* `the row lasts until this tab is closed or reloaded`, AND IT SAID "what you typed is still on
     this screen and nowhere else. It is safe to leave it and come back." Measured on the build of
     September 10th, neither half was true. The row was also on the list the button under it opens,
     and leaving and coming back found this form empty with no outcome under it, while a reload
     took the row off the list as well. How long `pending` holds a row is the true part, so it is
     what this says. The second `yet` went too: the sentence before it already has one. */
  keptNothingWhy: 'This record cannot be written to from the browser, so the row lasts until this tab is closed or reloaded.',
  /* AND THE WAY ONWARD IS AN OFFER, NAMED FOR WHAT IS THERE. It used to be the only path and it was
     taken without asking: a list of somebody else's invoices, arrived at with no explanation, reads
     as the row having been written and gone somewhere strange. Named, it reads as what it is.
     "See Money as it comes" named it and then hedged; the verb is the whole offer. */
  seeTheList: (label: string) => `Open ${label}`,
  /**
   * AND THE ROW THEY TYPED IS IN IT.
   *
   * IT USED TO SAY THE LISTS ARRIVE WITH AN EXAMPLE IN THEM, which is true and was the wrong thing
   * to say here: it explains what somebody else's rows are doing on the screen and says nothing
   * about the one thing the person just did. A friction pass ranked that exact gap first of ten,
   * measured as four clicks, twenty-five keystrokes and zero rows. The row is now at the top of the
   * list, marked, and this sentence is what tells them to look for it.
   *
   * AND IT WAS THE LAST THING THE OUTCOME SAID, AFTER THREE WAYS OF SAYING NOTHING WAS SAVED. A
   * fresh-eyes pass on the build of September 10th measured 61 words under the button, with a
   * 13-word toast lying across them at y 713 to 776 on a 390px phone, and 43 of those 74 words said
   * one fact. The thing that did happen came fourth. It leads now, the row is named as what the
   * person typed rather than as "it", and the list is named, because "the list" on a screen that
   * shows none is a list the reader has to guess at. The half about the other rows is
   * `keptExamples`.
   */
  rowIsThere: (thing: string, list: string, mark: string) => `${thing} is at the top of the ${list} list, marked ${mark}.`,
  /* THE HALF OF THAT SENTENCE ABOUT EVERYBODY ELSE'S ROWS, kept on its own: it is what stops a list
     of a fictional studio's rows reading as the record having taken the person's row somewhere. */
  keptExamples: 'The other rows are the worked examples the lists arrive with.',
  /**
   * WHAT A SECOND PRESS SAYS, which is a correction rather than another row.
   *
   * IT WAS "the first row in Money would be changed, but nothing was saved yet.", starting in lower
   * case, stacked under the first press's toast still saying the row "would be written". The row
   * HAD been changed. This press is the one that keeps a toast, because nothing else on the screen
   * moves when it lands: the outcome under the button is already there from the first press.
   */
  rowChanged: (thing: string, list: string) => `${thing} on the ${list} list was changed`,

  /**
   * AND THE SAME THREE SENTENCES FOR A RECORD THAT CAN BE WRITTEN TO.
   *
   * THE FOUR ABOVE ARE THE DEMO'S AND ONLY THE DEMO'S. They say the row is waiting, marked, and
   * that nothing was saved, which is true of a tab holding a row in `pending` and false of a record
   * that has just taken one. The screen used to say them whatever it was looking at, so the person
   * most likely to have a record of their own was told their first row went nowhere.
   *
   * WHAT WAS SAVED AND WHERE IT NOW LIVES, in that order, because the row is the thing they did and
   * the list is where they will find it again. The demo's sentence names the mark to look for; this
   * one has no mark to name, so it says the durable fact instead.
   */
  rowSaved: (thing: string, list: string) => `${thing} is saved to your record, at the top of the ${list} list.`,
  /* THE OTHER HALF OF `keptNothingWhy`, and the opposite fact. That one says how long a waiting row
     lasts, because the honest answer is until the tab closes. This one answers the same question
     for a row the record holds, and the answer is the reason somebody typed it. */
  keptSaved: 'It is in the record now, so it is there when you come back.',
  /**
   * AND A FIRST ROW THE RECORD WOULD NOT TAKE SAYS WHY, IN THE RECORD'S OWN WORDS.
   *
   * `fix` IS PASSED THROUGH AND NOT SUMMARISED. A refusal carries the sentence that says what to do
   * about it, and a screen that replaces it with its own wording is a screen guessing at a rule it
   * does not hold. The shape is `shapeRefused`'s, one turn up, for the same reason.
   */
  rowNotSaved: (thing: string, fix: string) => `${thing} was not saved. ${fix}`,
  /* WHAT A SECOND PRESS SAYS ON A RECORD. `rowChanged` is the demo's fragment, and it is a fragment
     because `copy.notWritten` finishes it with the half that is not true here. */
  rowChangedSaved: (thing: string, list: string) => `${thing} on the ${list} list was changed.`,

  /** The label above the first field. Written per choice, because "Your first money" is not English. */
  firstField: {
    obligations: 'Your first invoice',
    services: 'Your first renewal',
    people: 'The first person',
    things: 'Your first project',
    tasks: 'The first thing to do',
  } as Record<string, string>,

  /* WHAT THE ROW IS CALLED ONCE IT EXISTS, for the sentence that says where it went. Per choice for
     the reason `firstField` gives: Money's own noun is `item`, because half of Money is owed by you,
     and this row was asked for as an invoice. */
  firstThing: {
    obligations: 'Your invoice',
    services: 'Your renewal',
    people: 'The person',
    things: 'Your project',
    tasks: 'The task',
  } as Record<string, string>,

  /**
   * WHAT THE CHOICE HAS ALREADY ANSWERED, so the first-run form does not ask it.
   *
   * THE FORM ASKED FOR EVERY FIELD THE REGISTER REQUIRES, AND ON MONEY TWO OF THEM ANSWERED
   * THEMSELVES. A fresh-eyes pass measured `/start?add=obligations` on the build of September 10th
   * at five fields for one row, each wearing `required`. `Which way` opened on `owed by me` under a
   * field labelled "Your first invoice", and an invoice somebody writes is owed TO them, so the
   * default most people accept without reading recorded their first row backwards. `Status` offered
   * `part` and `written off`, which is bookkeeping, on the screen `19 §6` budgets at one true fact
   * in thirty seconds.
   *
   * THE DECLARATION STAYS REQUIRED. These are values, not exemptions: `RowForm` puts them in the
   * same map a press writes, so the row, its card and its own page carry them exactly as if they had
   * been chosen, and the row's menu changes them later like any other value.
   *
   * ONLY WHERE THE CHOICE DECIDES THE ANSWER. An invoice is owed to you. Something that renews is
   * `live`, because a service that is lapsing or cancelled is one that does not. Something that
   * needs doing is `open`. A new invoice is `open` because that is where the register starts every
   * row, and `part`, `paid` and `written off` are what happens to it afterwards, one press away on
   * the row. Everything else a register requires is still asked, because a value nobody saw is a
   * fact nobody stated: a renewal's type, cost and cycle, a person's role and a project's status
   * each have more than one right answer, and the tile says nothing about which.
   * `first-run.test.ts` holds every tile to this against the seed the app ships.
   */
  firstGiven: {
    obligations: { direction: 'owed_to_me', state: 'open' },
    services: { state: 'live' },
    tasks: { state: 'open' },
  } as Record<string, Readonly<Record<string, string>>>,

  /* THE OTHER WAY IN, and it is offered rather than buried. PostHog's install flow leads with
     `npx @posthog/wizard` and treats the in-product path as the alternative, which is the right
     read of who is arriving: somebody who already has an agent open would rather finish there than
     type rows into a browser.

     It stays an OFFER and never a requirement. First run has to work on a fresh self-host with
     nothing configured (19 §6), so nothing below this line is a step. */
  /**
   * AND IT PRINTED A COMMAND NOBODY COULD RUN.
   *
   * `claude mcp add --transport http braindog https://mcp.brain.dog`, on the first screen of the
   * product, ready to copy. `mcp.brain.dog` answers 525: the MCP transport is not built and that
   * hostname is deliberately unclaimed, because pointing it at the Worker would answer an MCP
   * address with the app's shell.
   *
   * `23 §3.1` IS THE RULE THIS BROKE, and it is the same rule `askBrainDog` obeys four hundred
   * lines away: a capability with no model behind it is *"not there, not greyed out"*. An offer
   * that cannot be taken is worse than an absent one, because the person spends their first minute
   * pasting it into a terminal and reading an error, and the product taught them that in its first
   * thirty seconds.
   *
   * THE SENTENCES STAY AND THE COMMAND GOES. What the section says about the record being an MCP
   * server is true and worth saying; what it cannot do yet is hand over a working address. It says
   * so, and `agentCommand` is gone rather than commented out, so nothing can render it by accident.
   */
  agentTitle: 'Set it up in your agent',
  /* `MCP server` WAS THE SECOND UNDEFINED WORD ON THE FIRST SCREEN. A friction pass counted it as
     tax and noted that the product explains it nowhere at all: a reader who does not already know
     what MCP is meets an acronym in the second sentence of the product, on the screen where they
     have the least reason to look it up. The clause is now in the sentence that needs it, which is
     `19 §6`'s own rule, and the acronym stays because it is the word the reader will type into
     their agent's settings and a product that hides it has helped nobody. */
  agentBody:
    'Your agent can read and write this record directly, over MCP: the connector standard Claude, ' +
    'Codex and Cursor already speak. Add it once and the agent you have can make the lists, fill ' +
    'the first rows, and read the record from then on.',
  agentNotYet:
    'The address is not open yet. Nothing here needs it: everything on this screen works without an agent, and the record will hand you the command when there is one to hand over.',

  /* THE VOCABULARY MOVED TO `copy.ts` AND IS NOW RENDERED.
     
     Five definitions lived here, imported by nothing, under a comment that stated the policy in the
     past tense — so `row`, `pack`, `page`, `block` and `tone` each reached a screen and the sentence
     defining them appeared on none. They belong in `copy.ts` for the reason `50 §3` gives (one file
     holds every sentence, so the no-over-explaining rule is reviewable in one place) and they belong
     to the whole product rather than to first run, because three of the four are met long after it.
     See `define.svelte.ts` for which four survived the measurement and why. */
} as const;

/**
 * Which fields the first-run form asks for: the title, and every field the register requires that
 * the choice has not already answered.
 *
 * IT WAS `f.required || f.id === decl.title`, INSIDE `RowForm`, where nothing but the screen could
 * say what it produced, and on Money it produced five fields. It sits here beside `firstGiven`
 * because it is that table's other half, and because a function a test can call is the only way
 * `first-run.test.ts` can hold all five tiles to it against the seed the app ships.
 */
export function firstAsks<F extends { id: string; required?: boolean }>(fields: readonly F[], title: string | undefined, given: Readonly<Record<string, string>> = {}): F[] {
  return fields.filter((f) => f.id === title || (f.required === true && given[f.id] === undefined));
}

/** A pack the sentence reader answered with, and the phrases it heard for it. Empty `why` is a pack nothing pointed at. */
type HeardPack = { id: string; why: readonly unknown[] };

/**
 * WHICH FIRST-PARTY MODULES A SENTENCE ACTUALLY ASKS FOR, and it is fewer than the reader answers.
 *
 * MEASURED ON A FRESH SELF-HOST, 21 September, at 390 with a coarse pointer. "Sam, I am a maths
 * student at Leeds" and "I keep losing track of my coursework deadlines" put Projects, People and
 * Tasks on the record beside the three student lists, and `/p/portfolio` then drew 157 words, nine
 * blocks with nothing in any of them, four tiles reading `0` and three money figures of £0.00 on a
 * maths student's second screen. One of those three modules was in the sentence: `shape.ts` hears
 * `deadlines` for Tasks, and `shape.ts:286` adds Projects with no `why` at all whenever it hears
 * anything. `LEANS_ON.work` is empty, so nothing on that record leaned on Projects, and the line
 * above that rule in `shape.ts` states the rule this applies: Projects is "added with no `why` when
 * another list leans on it".
 *
 * SO A PACK WITH NO PHRASE BEHIND IT IS DROPPED HERE, and the caller's `LEANS_ON` closure puts back
 * whatever something genuinely needs: Money, Renewals and Agents all lean on Projects and all still
 * arrive with it. Measured over fifteen sentences, including all four people and all six chips, this
 * changes exactly one answer, and it is the student's.
 *
 * PEOPLE SURVIVES A NAME, because the name is the phrase behind it: the person's own row goes into
 * that list in the same press, so it is the one module that never arrives empty.
 *
 * WHAT IT DOES NOT FIX, said so nobody reads more into it: Tasks still arrives on that record for one
 * matched word, with `/p/work` at 95 words and `/p/work-board` at 12, both empty. A page whose lists
 * hold nothing does not belong on the rail (`DIRECTION.md` §6), and the rail is built in
 * `boot-live.ts`, which this file does not own.
 */
export function firstModules(turnOn: readonly string[], packs: readonly HeardPack[], named: boolean): string[] {
  const pointed = new Set(packs.filter((p) => p.why.length > 0).map((p) => p.id));
  return turnOn.filter((id) => pointed.has(id) || (id === 'people' && named));
}

/**
 * THE WAY ONWARD OFF THE FIRST SCREEN, AND IT IS WHAT THE RECORD HOLDS RATHER THAN WHAT THE PRESS CHANGED.
 *
 * `Make my record` pressed twice on a fresh record, 390, measured: the first press answered "Your
 * lists are ready. Added Courses, Assignments and Study sessions, with example rows marked example."
 * with `Open Study sessions` under it and 17 controls on the screen; the second answered "Your lists
 * are ready." with 16, and the control it dropped was the only way off a screen that carries no rail
 * and no tab bar at either width. Nothing was installed twice and no row was lost: the record was
 * unharmed and the display had thrown the door away.
 *
 * `held` IS THE FACT THAT DECIDES IT: the proposed use case's lists are on the record now, however
 * they got there. The two fields this no longer reads are `added` and `on`, which are what THIS press
 * changed, and a second press changes nothing because the lists are already in. They stay in the
 * parameter because the caller hands over its whole outcome, and the comment above is why nobody
 * should read them here again.
 */
export function onwardFrom(
  press: { made: readonly { register: string; list: string }[]; added: readonly unknown[]; on: readonly unknown[] },
  own: { id: string; name: string } | undefined,
  held: boolean,
  fallback: { register: string; list: string } | null,
): { register: string; list: string } | null {
  return press.made[0] ?? (held && own ? { register: own.id, list: own.name } : fallback);
}

/**
 * What a list added by one press holds the moment it arrives: the pack's examples, the plan formed
 * from what the person said, the person's own row, or nothing at all.
 */
export type AddedRows = 'example' | 'formed' | 'own' | 'empty';

/**
 * WHAT THE PRESS ADDED, GROUPED SO THE OUTCOME CAN SAY ONE SENTENCE PER KIND OF LIST.
 *
 * IT WAS ONE SENTENCE FOR ALL OF THEM AND IT WAS FALSE ON TWO RECORDS OUT OF FOUR. A student was told
 * six lists had arrived "with example rows marked example" when three of them were empty, and the New
 * project guide was told the same about sixteen rows formed from its own sentence. Both readings are
 * on the first screen of a one-minute-old record, about the only rows on it.
 *
 * THE ORDER IS WHAT THE PERSON CARES ABOUT MOST FIRST: their own plan, then rows somebody else wrote,
 * then the list their own row went into, then the lists holding nothing.
 *
 * IT HOLDS NO SENTENCE, for the reason `firstAsks` above holds none: a key named only in this file is
 * a key `dead-copy` reads as rendered nowhere, and it is right to, because a renderer is what makes a
 * sentence a sentence. The screen maps each group to one of the four `shapeAdded*` keys.
 */
export function addedIn(added: readonly { name: string; rows: AddedRows }[]): { rows: AddedRows; names: string }[] {
  const order: readonly AddedRows[] = ['formed', 'example', 'own', 'empty'];
  return order.flatMap((rows) => {
    const names = added.filter((a) => a.rows === rows).map((a) => a.name);
    return names.length > 0 ? [{ rows, names: firstRun.shapeAnd(names) }] : [];
  });
}
