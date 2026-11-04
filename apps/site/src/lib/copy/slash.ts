/**
 * The Slash page, and the words of the drawing of Slash that the home card, the desk's bar and this page share.
 *
 * THE WORDS ARE THE PROTOTYPE'S (Slash has a page of its own, made
 * super readable and neat), with the site's known fix: "Every figure opens what it came from".
 * The questions in the examples, and every name and figure in an answer, are the made-up record's
 * (`demo/maya.ts`), so none is typed here.
 *
 * EVERY COUNT OF QUESTIONS IS `PLAN_TABLE`'S, through `plans.ts`: Free's 20. The unit is a question, never an "ask"
 * (E17, his N1 of 1 November). No paid plan's price is said here: one paragraph and no table.
 *
 * TWO LINES CHECKED AGAINST THE PRODUCT (17 October). "In Settings under Agents": the model key is chosen in
 * `SlashModel`, drawn in the Agents area of Settings (`apps/web/src/routes/settings/[area]/areas/Agents.svelte`), and
 * asks on it are not capped (`capped: !key`, `packages/slash/src/index.ts`). "Set the monthly limit to zero": the
 * settings door takes any whole number from zero ("zero turns Slash off", the same file), and finding runs no model.
 *
 * IT IS NOT SPREAD INTO `copy.ts`: the Slash page and the drawing import it directly.
 */

import { TABLE } from '../plans.ts';

const FREE = TABLE.free.credits;

export const slashPage = {
  head: {
    title: 'Ask BrainDog in plain words.',
    lead:
      "Slash is the assistant inside BrainDog. Press ⌘J and ask what you owe, who hasn't paid or how a project is " +
      'doing. It answers from your own numbers and makes the changes you ask for, with an undo.',
  },
  /** The label a screen reader hears on each list of examples. */
  examples: 'Try typing',
  /** The disclosure the questions to try sit behind, under the three drawn answers. */
  moreExamples: 'More examples',
  ask: {
    title: 'Ask',
    body: [
      "Ask the way you'd ask someone who knows your business. Slash reads your projects, money, people " +
        'and notes, and answers in a few lines.',
      'Every figure opens what it came from. When nothing in BrainDog answers, it says so instead of guessing.',
    ],
  },
  find: {
    title: 'Find',
    body: [
      "Press ⌘K and type a few letters. People, projects, invoices, notes and your agents' work show up at once.",
      'It also jumps to any page and runs actions. Finding is free and never spends a question.',
    ],
  },
  make: {
    title: 'Make',
    body: [
      'Ask for a change, a page, a list or a rule, and Slash makes it. You see what changed and where.',
      'Everything it makes carries its name and an undo. Money, keys, sharing and deletes come back to you as a question first.',
    ],
  },
  tally: {
    title: 'How questions are counted',
    say:
      'Each question or change counts once, however much reading it takes. Finding, the briefing and background work ' +
      `cost nothing. Free includes ${FREE} Slash questions a month, or no limit with your own AI key.`,
    after: "When the month's questions run out, Slash says when they come back. Everything else keeps working.",
  },
  agents: {
    title: 'Slash and your agents',
    say: 'Slash lives inside BrainDog. Your agents live in the apps you already use. Both read the same BrainDog.',
    head: ['Slash', 'Your agents'],
    lines: [
      ['Where', 'In BrainDog. Press ⌘J', 'In the apps you connect'],
      ['What it reads', 'Your BrainDog', 'What you allowed it'],
      ['What it writes', 'Changes you ask for, each with an undo', 'Notes and changes, each with an undo'],
      ['Who pays', 'Your included questions, or your own key', "Your agent's own plan"],
    ],
  },
  faq: {
    title: 'Questions',
    questions: [
      { q: 'Does Slash change things on its own?', a: 'No. It changes what you ask for, and every change has an undo.' },
      /* CHECKED AGAINST THE PRODUCT (leftovers9, 2 Nov): Slash holds every change to money, keys, sharing, deletes or
         plugins as a card, even one asked for (`waitsFor` in `packages/mcp/src/slash-tools.ts`), and no switch lifts
         that for Slash. Your own agents are not held the same way: one you tell to delete something does it, and with
         "Let your agents do everything without asking" on, money goes through too (`docs/03-agents/04-scopes.md`). So the
         answer is said of Slash, and the agents get their own half, where "always wait" read as true of them as well. */
      {
        q: 'Can it move money or delete things?',
        a: 'Not without your yes. A change to money, keys, sharing or a delete comes back as a card to press, even when you asked for it. Your own agents can be allowed more in Settings.',
      },
      { q: 'Can I use my own AI key?', a: 'Yes, in Settings under Agents. Questions on your own key have no monthly limit.' },
      { q: 'Can I turn it off?', a: 'Yes. Set the monthly limit to zero and Slash stays quiet. Finding still works.' },
    ],
  },
} as const;

/** One of Slash's three modes, as the bar and the card name them. */
export type Mode = 'ask' | 'find' | 'make';

/**
 * THE DRAWING'S WORDS, for each mode: the tab, the label over the tries, the empty bar, what Enter does, the line shown
 * while it reads (Find has none: it answers at once), and the card's note under the drop.
 */
export const slashDrawing = {
  modesLabel: 'What Slash does',
  modes: {
    ask: {
      tab: 'Ask',
      tries: 'Try asking',
      empty: 'Ask or change anything',
      enter: 'to ask',
      think: 'Reading what you keep',
      note: `One question each time. Free has ${FREE} a month.`,
    },
    find: {
      tab: 'Find',
      tries: 'Try finding',
      empty: 'Find a person, a project, a note',
      enter: 'to open',
      think: null,
      note: 'Finding is free. It never spends a question.',
    },
    make: {
      tab: 'Make',
      tries: 'Try making',
      empty: 'Make a page, a list or a rule',
      enter: 'to draft',
      think: 'Drafting',
      note: 'One question per change. Each one has an undo.',
    },
  },
  move: 'to move',
  found: (n: number): string => `${n} found`,
  notNow: 'Not now',
  added: (where: string): string => `Added to ${where}.`,
  nothing: 'Nothing changed.',
  undo: 'Undo',
  back: 'Back',
} as const satisfies { modes: Record<Mode, unknown> } & Record<string, unknown>;
