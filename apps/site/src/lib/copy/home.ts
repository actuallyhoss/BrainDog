/**
 * The home page's words, band by band: the hero, who it's for, the chores, your AI tools, Slash, yours and free, and
 * the questions.
 *
 * THE UI PASS OF 20 OCTOBER (`loop/ui-pass-2026-10-20/site.md` 2a, SPEC 4.7): one product picture, the desk, then six
 * full-bleed bands that each say one new thing, and no recap close. The words are the review's, with the spec's
 * changes (the early access line). The claims ledger (`lib/claims.ts`) reads these key paths, so a key that moves
 * moves there too.
 *
 * THE DRAWINGS' NAMES AND FIGURES ARE NOT HERE. Maya Okafor's record is one file, `lib/demo/maya.ts`, and every band
 * draws from it. The early access figures are `lib/plans.ts`, read by the page and never typed.
 */
import { DOCS, SECURITY, SUPPORT_EMAIL } from '../links.ts';

/** Where a developer reads how to connect: the docs' first page for AI tools. */
const CONNECT_DOCS = `${DOCS}/agents/connect`;

export const home = {
  hero: {
    /* THE SLOGAN, his words, with its full stop (§47). */
    title: 'Give your business a memory.',
    /* No mechanism in the promise: no event, log, row or ledger (`test/content.test.ts`). */
    sub: 'One place that remembers your work and tells you what needs you today. Your AI tools read from it too.',
    secondary: 'Connect your AI tools',
    works: 'Works with',
    /* The makers, once each: Claude, not "Claude Code" (§47 his notes). Their marks are `@braindog/skin/agent-marks.ts`. */
    makers: [
      { id: 'claude', name: 'Claude' },
      { id: 'chatgpt', name: 'ChatGPT' },
      { id: 'codex', name: 'Codex' },
      { id: 'cursor', name: 'Cursor' },
      { id: 'vscode', name: 'VS Code' },
    ],
  },

  /* WHO IT'S FOR: three readers, each a tile with its own fill, icon and drawing. */
  who: {
    title: "Who it's for",
    small: {
      title: 'Run a small business',
      say: "See who owes you, what's due and how long the cash lasts, in one short brief each morning.",
      figure: '14 months',
      figureSay: 'of cash at this pace',
      link: 'For small businesses',
      href: '/for/founders',
    },
    build: {
      title: 'Build with AI',
      say: "Claude, Cursor and Codex start every session from your brief and leave a note when they're done.",
      lines: ['braindog · context', 'Tidepool, building. Next: ship webhook retries.', "Cursor, yesterday: onboarding copy waits on Dana's icons."],
      link: 'Connect your tools',
      href: '/agents',
    },
    team: {
      title: 'Work as a team or agency',
      say: "Give each client a project. Everyone sees what's next, and every change has a name on it.",
      line: 'Dana moved Onboarding copy to review · 10:05',
      link: 'For teams and agencies',
      href: '/for/teams',
    },
  },

  chores: {
    title: 'It does the chores. You make the calls.',
    say: 'Filing, naming and sorting just happen, each with a reason and an undo. You only see what needs a person.',
    waits: 'Waits for you',
    done: 'Done on its own',
    floor: 'Money, keys, sharing and deletes always wait for your yes. No rule and no AI tool can change that.',
    /* The figures beside the two headings, and the line the drawing says once nothing waits. */
    today: (n: number) => `${n} today`,
    empty: 'Nothing needs you. Everything else is handled.',
    askedBy: 'asked by',
    undo: 'Undo',
  },

  tools: {
    title: 'Your AI tools share one memory.',
    say: "Each one starts from your brief and leaves a note when it's done. Nothing gets explained twice.",
    notes: 'Notes on Tidepool',
    connect: 'Connect yours in one line',
    /* The one place home names the protocol, for the developer who came for it. */
    dev: 'Developer details: MCP, the command line and tokens',
    devHref: CONNECT_DOCS,
  },

  slash: {
    name: 'Slash',
    title: 'Press / and ask anything.',
    say: 'Ask about your business in plain words, find anything as you type, or have it draft a page. Nothing goes in without your yes.',
    tries: 'Try',
    more: 'How Slash works',
  },

  yours: {
    title: 'It stays yours.',
    points: [
      { icon: 'history', text: 'Every change has a name on it, and an undo.' },
      { icon: 'download', text: 'Export everything as one file, any time.' },
      { icon: 'key', text: 'AI tools use your keys without ever seeing them.' },
    ],
    link: 'How we keep it safe',
    href: SECURITY,
  },

  free: {
    title: 'Free while in early access.',
    say: "BrainDog is invite only for now. Ask for an invite and we'll email you when it's ready.",
    /* The figures are `TABLE.free`'s; these are only their labels. */
    every: 'Every feature',
    tools: 'AI tools',
    asks: 'questions to Slash a month',
  },

  faq: {
    title: 'Questions',
    aside: 'Anything else? Write to',
    email: SUPPORT_EMAIL,
    questions: [
      {
        q: 'Do I need to be technical?',
        a: 'No. Write things down, forward bills and receipts, and read your brief each morning. Connecting an AI tool is optional and takes one line.',
      },
      {
        q: 'Which AI tools work with it?',
        a: 'Claude, ChatGPT, Codex, Cursor and VS Code. You approve each one once in BrainDog. Developers can use the MCP address or the command line.',
        link: { label: 'How to connect', href: CONNECT_DOCS },
      },
      {
        q: 'Can an AI tool spend money or delete things?',
        a: 'No. Money, keys, sharing and deletes always wait for your yes, and every change has a name on it and an undo.',
      },
      {
        q: 'Is my data safe?',
        a: 'Each BrainDog is its own database. Keys are sealed, a sealed copy is made every night, and you can export everything whenever you like.',
        link: { label: 'Security', href: SECURITY },
      },
      {
        q: 'What does it cost?',
        a: "Nothing while in early access. It is invite only for now: ask for an invite and we'll email you when it's ready.",
      },
    ],
  },
} as const;
