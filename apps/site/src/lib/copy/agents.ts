/**
 * The page that connects an AI tool, `/agents`: the head, what an AI tool gets and what it can't do, the brief it
 * starts with, the row for developers, and the early access strip. Rewritten
 * so a reader who is not a developer reads it too, with the developer's detail
 * one row away.
 *
 * The connect steps themselves are data in `lib/connect/apps.ts`, beside the box that draws them, so the home page and
 * this page say the same lines. The made-up names are the demo record's (`lib/demo/maya.ts`).
 */
import { PEOPLE, PROJECTS } from '../demo/maya.ts';
import { APPS_AND } from '../agents.ts';
import { DOCS } from '../links.ts';

const DANA = PEOPLE.dana.name.split(' ')[0] ?? PEOPLE.dana.name;
const TIDEPOOL = PROJECTS.tidepool.name;

export const agents = {
  agents: {
    title: 'Connect your AI tools in one line.',
    lead: `${APPS_AND} can read your BrainDog, suggest changes and leave notes. You approve each one once, and no key is copied anywhere.`,
    /* The connect box's tile: the apps, each with its line, and beside it the three steps it takes. The third is
       `connect/apps.ts`'s way in: the app opens BrainDog once to be approved, with OAuth. */
    connect: 'Choose your app',
    steps: {
      title: 'How it goes',
      items: ['Choose your app and copy its line.', 'Paste it where the app adds a connector, or run it in a terminal.', 'BrainDog opens once, and you approve it.'],
    },
    gets: {
      title: 'What your AI tool gets',
      lines: [
        "Your brief first: where things stand, what's next and what waits on you.",
        `Names, never codes, so it talks about ${DANA} and ${TIDEPOOL} the way you do.`,
        'A receipt and an undo for everything it writes.',
      ],
    },
    cannot: {
      title: "What it can't do",
      lines: [
        'See a key. It uses them from the Keychain, by name.',
        'Move money, share or delete without your yes.',
        'Hide what it did. Everything it writes carries its name.',
      ],
    },
    brief: {
      title: 'It starts with your brief.',
      say: "Claude knows what's next before you say a word, and leaves a note when it's done.",
    },
    dev: {
      title: 'For developers',
      links: [
        { label: 'The command line', href: `${DOCS}/agents/cli` },
        { label: 'Scopes and tokens', href: `${DOCS}/agents/scopes` },
        { label: 'All agent docs', href: `${DOCS}/agents/connect` },
      ],
    },
  },
} as const;
