/**
 * The home page's words, band by band: the hero, who it's for, the chores, your AI tools, Slash, yours and free, and
 * the questions.
 *
 * THE HOME PAGE: one product picture, the desk, then six
 * full-bleed bands that each say one new thing, and no recap close. The words are the review's, with the spec's
 * changes (the early access line). The claims ledger (`lib/claims.ts`) reads these key paths, so a key that moves
 * moves there too.
 *
 * THE DRAWINGS' NAMES AND FIGURES ARE NOT HERE. Maya Okafor's record is one file, `lib/demo/maya.ts`, and every band
 * draws from it. The early access figures are `lib/plans.ts`, read by the page and never typed.
 */
import { APPS_AND, listed, sayList } from '../agents.ts';
import { DOCS, SECURITY, SUPPORT_EMAIL } from '../links.ts';

/** Where a developer reads how to connect: the docs' first page for AI tools. */
const CONNECT_DOCS = `${DOCS}/agents/connect`;

export const home = {
  hero: {
    /* THE SLOGAN, word for word, with its full stop. */
    title: 'Give your business a memory.',
    /* No mechanism in the promise: no event, log, row or ledger (`test/content.test.ts`). */
    /* PERSONAL USE AS MUCH AS BUSINESS (29 October), said lightly: your work, your money, your life. */
    sub: 'One place that remembers your work, your money and your life, and tells you what needs you today. Your AI tools read from it too.',
    secondary: 'Connect your AI tools',
    works: 'Works with',
    /* The makers, once each: Claude, not "Claude Code" (§47 his notes). Their marks are `@braindog/skin/agent-marks.ts`. */
    makers: (
      [
        { id: 'claude', name: 'Claude' },
        { id: 'chatgpt', name: 'ChatGPT' },
        { id: 'codex', name: 'Codex' },
        { id: 'cursor', name: 'Cursor' },
        { id: 'vscode', name: 'VS Code' },
      ] as const
    ).filter((maker) => listed(maker.name)),
  },

  /* WHO IT'S FOR: three readers, each a tile with its own fill, icon and drawing. */
  who: {
    title: "Who it's for",
    small: {
      title: 'Run a small business',
      say: "See who owes you, what's due and how long the cash lasts, on one page each morning.",
      figure: '14 months',
      figureSay: 'of cash at this pace',
      link: 'For small businesses',
      href: '/for/founders',
    },
    build: {
      title: 'Build with AI',
      say: `${sayList(['Claude', 'Cursor', 'Codex'])} start every session from your brief and leave a note when they're done.`,
      lines: ['braindog · context', 'Tidepool, building. Next: ship webhook retries.', "Cursor: onboarding copy waits on Dana's icons."],
      link: 'Connect your tools',
      href: '/agents',
    },
    /* YOUR OWN LIFE (29 October): personal use as much as business. Money is a whole section of the app now, with
       budgets, bills and a book of your own beside a company's. The rows in its drawing are Maya's (`MONEY_BAND`). */
    life: {
      title: 'Keep your own life in order',
      say: "Budgets, bills, subscriptions, net worth and trips in a book of your own. It tells you what's due before it's late.",
      link: 'For your own money',
      href: '/docs/use/money',
    },
  },

  /* MONEY, A WHOLE SECTION (the 27 October rebuild): accounts, the ledger, budgets, the forecast, coming up, payees and
     reports, and the add-ons that hang off it. The add-on names are the catalogue's own (`packs/`). */
  money: {
    title: 'Your money, in one place.',
    say: 'Your net worth, every account, budgets that say what is left, bills and a forecast that says if cash runs short. For a business, for you, or both in separate books.',
    worth: 'Net worth',
    accounts: 'Accounts',
    budgets: 'Budgets',
    coming: 'Coming up',
    left: (left: string) => `${left} left`,
    over: (over: string) => `${over} over`,
    of: (spent: string, of: string, period: string) => `${spent} of ${of} ${period}`,
    addons: 'Add what you need: subscriptions, splitting costs with friends, investments and gold, property, insurance, debts, goals, trips, certificates and zakat.',
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
    /* The line under the one question drawn, so the count beside the heading is what a reader can account for. */
    after: (n: number) => (n === 1 ? '1 more waits after this one.' : `${n} more wait after this one.`),
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
    /* ⌘J IS ASK, as the app's bar shows it; / is find (audit E18). */
    title: 'Press ⌘J and ask anything.',
    say: 'Ask about your business in plain words and it answers with your numbers. Ask for a change and it makes it, with an undo. Money, keys, sharing and deletes wait for your yes.',
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
    /* The figures are `TABLE.free`'s, said in ONE SENTENCE, NOT A ROW OF STATS (the
       site's own rule, §47): "Free: every feature, 3 AI tools and 20 Slash questions a month." */
    figures: (tools: number, questions: number): string => `Free: every feature, ${tools} AI tools and ${questions} Slash questions a month.`,
  },

  faq: {
    title: 'Questions',
    /* The disclosure the questions after the first three sit behind. */
    more: 'More questions',
    aside: 'Anything else? Write to',
    email: SUPPORT_EMAIL,
    questions: [
      {
        q: 'Do I need to be technical?',
        a: 'No. Write things down, forward bills and receipts, and open Today each morning. Connecting an AI tool is optional and takes one line.',
      },
      {
        q: 'Is it only for businesses?',
        a: 'No. Keep your own money, bills, trips and plans in it, on their own or beside a business. Each book keeps its money apart.',
        link: { label: 'How Money works', href: `${DOCS}/use/money` },
      },
      {
        q: 'Which AI tools work with it?',
        a: `${APPS_AND}. You approve each one once in BrainDog. Developers can use the MCP address or the command line.`,
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
        a: "Nothing: Free is $0. Cloud and Cloud Plus are coming soon, priced at launch. Sign-up is invite only for now: ask for an invite and we'll email you when it's ready.",
        link: { label: 'Pricing', href: '/pricing' },
      },
    ],
  },
} as const;
