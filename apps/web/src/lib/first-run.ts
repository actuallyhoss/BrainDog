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
  firstBody:
    'Money, the estate it runs on, the people, the projects, and the decisions behind ' +
    'them. Typed, versioned, and readable by every agent you use.',
  firstQuestion: 'Where do you want to start?',
  /* SPLIT IN TWO, so the clause defining *row* can sit against the word rather than behind the
     paragraph. Both halves are sentences on their own, which is what lets the definition slot
     between them without either one reading as a fragment. */
  firstRowIs: 'One real row is enough.',
  firstHint: 'You can delete it later.',
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
    'Rows in one list can point at rows in another — an invoice at the client it is for, a renewal at the project it belongs to — and that is where the record starts answering questions you did not ask it.',

  /* AND THE WORD *PACK*, FOR THE FIRST TIME IN THE PRODUCT, DEFINED IN PLACE. It does not appear on
     screen one at all: selecting a pack means reading an install diff written in the language of
     metrics and nav order, and asking somebody to approve four schema reviews before they have seen
     one of their own rows is worse than a tour. Here they have seen one. */
  secondPacks:
    'A pack is a list somebody else already worked out the fields for, with the figures and the pages that go with it. Nothing installs without you reading what it would change.',

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
    'The record is an MCP server. Add it once and the agent you already have can make the ' +
    'lists, fill the first rows, and read the record from then on.',
  agentCommand: 'claude mcp add --transport http braindog https://mcp.brain.dog',
  agentNote: 'Codex, Cursor and anything else that speaks MCP take the same URL.',
  agentCopy: 'Copy the command',
  agentCopied: 'Copied. Paste it where your agent is running.',

  /* THE VOCABULARY MOVED TO `copy.ts` AND IS NOW RENDERED.
     
     Five definitions lived here, imported by nothing, under a comment that stated the policy in the
     past tense — so `row`, `pack`, `page`, `block` and `tone` each reached a screen and the sentence
     defining them appeared on none. They belong in `copy.ts` for the reason `50 §3` gives (one file
     holds every sentence, so the no-over-explaining rule is reviewable in one place) and they belong
     to the whole product rather than to first run, because three of the four are met long after it.
     See `define.svelte.ts` for which four survived the measurement and why. */
} as const;
