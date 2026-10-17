/**
 * The page that connects an agent, `/agents` (DIRECTION §47, the prototype's connect page): the head, what an agent
 * gets and what it can't do, the brief it starts with, and the close.
 *
 * The connect steps themselves are data in `lib/connect/apps.ts`, beside the box that draws them, so the home page and
 * this page say the same lines. The made-up names are the demo record's (`lib/demo/maya.ts`), and the free plan's
 * agents are `TABLE`'s (`lib/plans.ts`), so no figure here is typed by hand.
 */
import { PEOPLE, PROJECTS } from '../demo/maya.ts';
import { TABLE } from '../plans.ts';

/** A small count in words, the way a sentence says it; a bigger one stays a figure. */
const COUNTED = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'] as const;
const inWords = (n: number): string => COUNTED[n] ?? String(n);

const DANA = PEOPLE.dana.name.split(' ')[0] ?? PEOPLE.dana.name;
const TIDEPOOL = PROJECTS.tidepool.name;

export const agents = {
  agents: {
    title: 'Connect your agent in one line.',
    lead: 'Claude, ChatGPT, Codex, Cursor and VS Code can read your record, propose changes and leave notes. You approve it once in the app, and no key is copied anywhere.',
    gets: {
      title: 'What your agent gets',
      lines: [
        "Your brief first: where things stand, what's next, and what waits on you.",
        `Names, never ids, so it talks about ${DANA} and ${TIDEPOOL} the way you do.`,
        'A receipt with an undo for everything it writes.',
      ],
    },
    cannot: {
      title: "What it can't do",
      lines: [
        'See a key. It uses them from the vault, by name.',
        'Move money, share or delete without your yes.',
        'Hide what it did. Everything it writes carries its name.',
      ],
    },
    brief: {
      title: 'It starts with your brief.',
      say: "Claude knows what's next before you say a word, and tells the record when it's done.",
    },
    close: {
      title: 'Make your record.',
      body: `Free for one person, with ${inWords(TABLE.free.agents)} agents.`,
    },
  },
} as const;
