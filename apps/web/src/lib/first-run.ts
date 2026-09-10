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
  firstLede: 'Everything about your business that is not just code.',
  /* `the services it runs on` AND IT WAS `the estate`. One area of this record answered to four
     names — this lede, the card below it, the pack, the rail's section heading — while the list
     underneath all of them was called Services. This is the first paragraph of the first screen,
     so it is where a reader learns the word, and it was teaching them the one nothing else says. */
  firstBody:
    'Money, the services it runs on, the people, the projects, and the decisions behind ' +
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
    'Rows in one list can point at rows in another: an invoice at the client it is for, a renewal at the project it belongs to. That is where the record starts answering questions you did not ask it.',

  /* AND THE WORD *PACK*, FOR THE FIRST TIME IN THE PRODUCT, DEFINED IN PLACE. It does not appear on
     screen one at all: selecting a pack means reading an install diff written in the language of
     metrics and nav order, and asking somebody to approve four schema reviews before they have seen
     one of their own rows is worse than a tour. Here they have seen one. */
  secondPacks:
    'A pack is a list somebody else already worked out the fields for, with the figures and the pages that go with it. Nothing installs without you reading what it would change.',

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
     as the row having been written and gone somewhere strange. Named, it reads as what it is. */
  seeTheList: (label: string) => `See ${label} as it comes`,
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
