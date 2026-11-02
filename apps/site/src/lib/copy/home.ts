/**
 * The home page's words, section by section: the hero, the filing, your AI tools, your money, what keeps it yours, and
 * free while in early access (the redo of 2 November). The questions are the pricing page's, which reads them here.
 *
 * ONE IDEA A SECTION, said once: what it is (the hero), that it does the filing and leaves you the calls, that every AI
 * tool you use reads the same memory, your money, that it stays yours, and what it costs. Each heading is one plain
 * sentence and each line under it one or two more. The claims ledger (`lib/claims.ts`) reads these key paths, so a key
 * that moves moves there too.
 *
 * THE DRAWINGS' NAMES AND FIGURES ARE NOT HERE. Maya Okafor's record is one file, `lib/demo/maya.ts`, and every section
 * draws from it; the app's own words in a drawing are `copy/product.ts`. The early access figures are `lib/plans.ts`,
 * read by the page and never typed.
 */
import { APPS_AND, listed } from '../agents.ts';
import { DOCS, SECURITY, SUPPORT_EMAIL } from '../links.ts';
import { LAUNCH } from '../launch.ts';

/** Where a developer reads how to connect: the docs' first page for AI tools. */
const CONNECT_DOCS = `${DOCS}/agents/connect`;

export const home = {
  hero: {
    /* THE SLOGAN, word for word, with its full stop. */
    title: 'Give your business a memory.',
    /* No mechanism in the promise: no event, log, row or ledger (`test/content.test.ts`). Personal use as much as
       business (29 October), said lightly: your work, your money, your life. */
    sub: 'One place that remembers your work, your money and your life, and tells you what needs you today. Your AI tools read from it too.',
    secondary: 'Connect your AI tools',
    /* The makers, once each, named under the AI tools heading: Claude, not "Claude Code" (§47 his notes). Their marks are
       `@braindog/skin/agent-marks.ts`. */
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

  /* IT DOES THE FILING, YOU MAKE THE CALLS: what happened on its own today, each with its reason and an undo; the
     questions only a person answers; and the floor no rule and no AI tool can move. */
  filing: {
    title: 'It does the filing. You make the calls.',
    say: 'Payments, receipts and notes are filed on their own, each with a reason and an undo. Only what needs a person waits for you.',
    done: 'Done on its own',
    today: (n: number) => `${n} today`,
    undo: 'Undo',
    undone: 'Put back where it was',
    redo: 'Redo',
    /* NOT "NEEDS YOU", the app's place, which the hero's Today already names for its own two: these are the calls the
       section's heading promises, and the floor under them is "Always your call". */
    waits: 'Your call',
    askedBy: 'asked by',
    /* The line under the one question drawn, so the count beside the heading is what a reader can account for. */
    after: (n: number) => (n === 1 ? '1 more waits after this one.' : `${n} more wait after this one.`),
    empty: 'Nothing needs you. Everything else is handled.',
    floor: {
      title: 'Always your call',
      say: 'Money, keys, sharing and deletes always wait for your yes. No rule and no AI tool can change that.',
      parts: ['Money', 'Keys', 'Sharing', 'Deletes'],
      yes: 'Your yes',
    },
  },

  /* EVERY AI TOOL YOU USE READS THE SAME MEMORY: the brief each starts from, the notes each leaves, the line that
     connects one, and BrainDog's own, Slash. */
  tools: {
    title: 'Your AI tools share one memory.',
    say: `${APPS_AND} start from your brief and leave a note when they're done. Nothing gets explained twice.`,
    brief: 'What Claude reads first',
    briefSay: 'Where things stand, what is next and what waits on you.',
    notes: 'Notes on Tidepool',
    notesSay: 'What each one did, in its own name.',
    connect: 'Connect yours in one line',
    approve: 'You approve each one once, and no key is copied anywhere.',
    /* The one place home names the protocol, for the developer who came for it. */
    dev: 'Developer details: MCP, the command line and tokens',
    devHref: CONNECT_DOCS,
    slash: {
      title: 'Or ask BrainDog itself',
      say: 'Press ⌘J anywhere and ask in plain words. Slash answers with your numbers, and every figure opens what it came from.',
      more: 'How Slash works',
    },
  },

  /* MONEY, A WHOLE SECTION OF THE APP (the 27 October rebuild): cash and how long it lasts, every account in its book,
     budgets that say what is left, and what is coming up. The add-on names are the catalogue's own (`packs/`). */
  money: {
    title: 'Your money, in one place.',
    say: 'Every account, what is coming up and how long the cash lasts. For a business, for you, or both in separate books.',
    /* THE MONEY HOME'S OWN WORDS over Maya's figures: its lead tile and its "Over time" line. */
    cash: 'Cash now',
    across: 'In 2 accounts',
    lasts: 'Lasts about 14 months at this pace',
    weeks: 'Cash, the last 12 weeks',
    today: 'Today',
    accounts: 'Accounts',
    budgets: 'Budgets',
    coming: 'Coming up',
    left: (left: string) => `${left} left`,
    over: (over: string) => `${over} over`,
    of: (spent: string, of: string, period: string) => `${spent} of ${of} ${period}`,
    addons: 'Add what you need: subscriptions, splitting costs with friends, investments and gold, property, insurance, debts, goals, trips, certificates and zakat.',
    /* WHERE TO READ ON, for a business and for yourself: the two links the old "Who it's for" tiles carried, so the
       home page still sends a reader on to each. */
    more: [
      { label: 'For small businesses', href: '/for/founders' },
      { label: 'For your own money', href: `${DOCS}/use/money` },
    ],
  },

  yours: {
    title: 'It stays yours.',
    say: 'Your BrainDog is its own database, and you can take all of it with you whenever you like.',
    points: [
      { icon: 'history', text: 'Every change has a name on it, and an undo.' },
      { icon: 'download', text: 'Export everything as one file, any time.' },
      { icon: 'key', text: 'AI tools use your keys without ever seeing them.' },
      { icon: 'server', text: "Nothing is shared between customers, so no one else's search can reach yours." },
      { icon: 'shield', text: 'Sign in with your email, Google or a passkey. No password to steal.' },
      { icon: 'lock', text: 'A sealed copy every night, to a key kept outside Cloudflare.' },
    ],
    link: 'How we keep it safe',
    href: SECURITY,
  },

  free: {
    title: 'Free while in early access.',
    say: "BrainDog is invite only for now. Ask for an invite and we'll email you when there's room.",
    plan: 'Free',
    price: '$0',
    later: 'Cloud and Cloud Plus',
    laterSay: 'Coming soon, priced at launch. Nothing you make now is lost.',
    pricing: 'See pricing',
    /* The figures are `TABLE.free`'s, said in ONE SENTENCE, NOT A ROW OF STATS (the site's own rule, §47). */
    figures: (tools: number, questions: number): string => `Every feature, ${tools} AI tools and ${questions} Slash questions a month.`,
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
        /* THE PAID PLANS BY THE BILLING FLAG: coming soon while it is off, and the pricing page's own figures once it is on. */
        a: LAUNCH.billing
          ? "Nothing: Free is $0. Cloud and Cloud Plus are monthly plans for more AI tools, questions and runs; the pricing page has each price."
          : "Nothing: Free is $0. Cloud and Cloud Plus are coming soon, priced at launch. Sign-up is invite only for now: ask for an invite and we'll email you when there's room.",
        link: { label: 'Pricing', href: '/pricing' },
      },
    ],
  },
} as const;
