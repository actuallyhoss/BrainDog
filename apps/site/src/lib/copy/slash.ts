/**
 * The Slash page, and the words of the drawing of Slash that the home card, the desk's bar and this page share.
 *
 * THE WORDS ARE THE PROTOTYPE'S (loop/site-2026-10-17/src/site.html ~:686-756, DIRECTION §47 "have a separate page for
 * Slash ... make it super readable and neat"), with the site's known fix: "Every figure opens what it came from".
 * The questions in the examples, and every name and figure in an answer, are the made-up record's
 * (`demo/maya.ts`), so none is typed here.
 *
 * EVERY COUNT OF ASKS IS `PLAN_TABLE`'S, through `plans.ts`: Free's 20, Cloud's 80, Cloud Plus's 400. A figure moved
 * there moves on this page, in the card's note and in the close.
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
    title: 'Slash knows your whole record.',
    lead:
      'Press / anywhere in BrainDog and ask in plain words. Slash reads your record, shows what it read, and drafts ' +
      'what you ask for. Nothing it makes goes in until you say yes.',
  },
  /** The label a screen reader hears on each list of examples. */
  examples: 'Try typing',
  ask: {
    title: 'Ask',
    body: [
      'Ask the way you would ask someone who knows your business. Slash looks through your projects, money, people ' +
        'and notes, and answers in a few lines.',
      'Every figure opens what it came from, and under the answer you see what Slash read. When nothing in your ' +
        'record answers, it says so instead of guessing.',
    ],
  },
  find: {
    title: 'Find',
    body: [
      "Type a few letters and everything that matches shows up at once: people, projects, invoices, notes, pages and your agents' work.",
      'It also jumps to any page and runs actions. Finding is free and never spends an ask.',
    ],
  },
  make: {
    title: 'Make',
    body: [
      'Ask for a page, a list or a rule, and Slash drafts it from what is already in your record. You see what it ' +
        'will look like, what it reads and where it goes.',
      'Add it with one press, or say not now and nothing changes. Everything it makes carries its name and can be undone.',
    ],
  },
  counted: {
    title: 'How asks are counted',
    say:
      'Each question or draft is one ask, however much reading it takes. Finding, your brief and the work Slash does ' +
      'in the background cost nothing.',
    plans: [TABLE.free.name, TABLE.hosted.name, TABLE.plus.name],
    month: { label: 'Asks a month', cells: [TABLE.free.credits, TABLE.hosted.credits, TABLE.plus.credits] },
    key: { label: 'With your own model key', cell: 'No limit' },
    after: "When the month's asks run out, Slash says when they come back. Everything else keeps working.",
  },
  agents: {
    title: 'Slash and your agents',
    say: 'Slash lives inside BrainDog. Your agents live in Claude, ChatGPT, Codex, Cursor and VS Code. They read the same record.',
    head: ['Slash', 'Your agents'],
    lines: [
      ['Where', 'In BrainDog. Press /', 'In the apps you connect'],
      ['What it reads', 'Your record', 'What you allowed it'],
      ['What it writes', 'Drafts you add with one press', 'Notes and changes, each with an undo'],
      ['Who pays', "Your plan's asks, or your own key", "Your agent's own plan"],
    ],
  },
  faq: {
    title: 'Questions',
    items: [
      { q: 'Does Slash change things on its own?', a: 'No. What it makes is a draft until you add it, and anything added can be undone.' },
      { q: 'Can it move money or delete things?', a: 'Never. Money, keys, sharing and deletes always wait for you.' },
      { q: 'Can I use my own model key?', a: 'Yes, in Settings under Agents. Asks on your own key have no monthly limit.' },
      { q: 'Can I turn it off?', a: 'Yes. Set the monthly limit to zero and Slash stays quiet. Finding still works.' },
    ],
  },
  close: { title: 'Press / and ask.', body: `${TABLE.free.name} comes with ${FREE} asks a month.` },
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
      think: 'Reading your record',
      note: `One ask per question. ${TABLE.free.name} has ${FREE} a month.`,
    },
    find: {
      tab: 'Find',
      tries: 'Try finding',
      empty: 'Find a person, a project, a note',
      enter: 'to open',
      think: null,
      note: 'Finding is free. It never spends an ask.',
    },
    make: {
      tab: 'Make',
      tries: 'Try making',
      empty: 'Make a page, a list or a rule',
      enter: 'to draft',
      think: 'Drafting',
      note: 'One ask per draft. Nothing goes in until you add it.',
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
