/**
 * Every word the docs frame says: the landing page, the sections, the page furniture and `/llms.txt`.
 *
 * THE DOCS' OWN WORDS, beside the code that reads them (each page has its own copy file, and this
 * one belongs to `lib/docs/`). The pages themselves are dialect text in `src/docs/`, so
 * nothing here describes the product beyond what a section of the docs is about.
 */
import { APPS_AND, APPS_OR } from '../agents.ts';
import { LAUNCH } from '../launch.ts';
import type { IconName } from '../icons.ts';
import type { Section } from './pages.ts';

export const docsWords = {
  meta: {
    title: 'Docs · BrainDog',
    description:
      'How to use BrainDog, connect your AI tools, and build on it. Every page is also plain text an AI tool can read.',
    /** A page's own title in the tab. */
    page: (title: string): string => `${title} · BrainDog docs`,
  },

  title: 'Docs',
  lede: 'How to use BrainDog, connect your AI tools, and build on it. Every page is also plain text an AI tool can read.',
  /** The link to `/llms.txt`, under the lede. */
  forAgents: 'Plain-text index for AI tools',

  /* "START HERE" IS ITS OWN FULL-WIDTH ROW: three ways in, rather than a one-link card as tall as the rest. */
  start: [
    { label: 'Welcome to BrainDog', href: '/docs/start/welcome' },
    { label: 'Making your BrainDog', href: '/docs/use/first-run' },
    { label: 'Connect an AI tool', href: '/docs/agents/connect' },
  ],

  /* WHAT EACH SECTION IS ABOUT, in the order of `SECTIONS`. Each names what its section covers, not
     what the product does. */
  sections: {
    start: { label: 'Start here', blurb: 'What BrainDog is, and where to go next.', glyph: 'rocket' },
    use: { label: 'Using BrainDog', blurb: 'Today, pages, lists, Needs you, Slash, automations, the inbox and sharing.', glyph: 'home' },
    agents: { label: 'Agents', blurb: 'Connecting an agent, its tools, keys and grants, and the command line.', glyph: 'plug' },
    api: { label: 'The API', blurb: 'The HTTP calls a key may make, doors and webhooks, and their limits.', glyph: 'terminal' },
    dialect: { label: 'Writing pages', blurb: 'Every block a page can draw, each shown beside the text that draws it.', glyph: 'layers' },
    packs: { label: 'Add-ons', blurb: 'What an add-on declares, and how to write and publish one.', glyph: 'board' },
  } as const satisfies Record<Section, { label: string; blurb: string; glyph: IconName }>,

  /** A section card with no page in it yet. */
  empty: 'No pages yet.',

  search: {
    label: 'Search the docs',
    placeholder: 'Try invoices, keys or Slash',
    found: (n: number): string => (n === 1 ? '1 page found' : `${n} pages found`),
    none: (query: string): string => `No page mentions "${query}".`,
  },

  nav: {
    label: 'Docs pages',
    /** The phone's disclosure, which holds the same list. */
    open: 'All docs pages',
    home: 'All sections',
  },

  contents: 'On this page',
  pager: 'Previous and next page',
  prev: 'Previous',
  next: 'Next',

  copy: 'Copy as text',
  copied: 'Copied the page as text.',
  failed: 'This browser would not copy. Open the page as text instead.',
  raw: 'Open as text',
  /* A code block's own button (plan F25), as the agents page's address has one. */
  codeCopy: 'Copy',
  codeCopied: 'Copied',
  codeLabel: 'Copy this code',
  /* The part of the page in view, said in the bar that stays at the top on a phone (plan F24). */
  inView: 'In this part',
  edit: 'Edit on GitHub',

  llms: {
    /* `/llms.txt`'s opening lines, read by an agent that has never met the product. */
    title: 'BrainDog',
    /* The home page's sentence (`meta.home` in `lib/copy/shell.ts`), said in the third person for a reader who is not the owner. */
    summary:
      "BrainDog is a shared record of a person's or a small team's projects, decisions and money. " +
      `${APPS_AND} read it over MCP before they start and leave a handoff when they stop. Agents ask before touching ` +
      'money, keys or deletes, and the person answers in one list.',
    /* THE FACTS AN AI SEARCH TOOL QUOTES, one line each, plain and true on the day the site ships: how agents reach it,
       what they start with, how they earn trust, what is in the app, what it costs and who runs it. */
    factsTitle: 'What it is',
    facts: [
      'Agents connect over MCP at https://app.brain.dog/mcp, approved once with OAuth. Claude Code users run `braindog setup`, which adds a start hook that prints the briefing at every session.',
      'The briefing: where the project stands, the last handoff\'s next step, who else is working now, what waits on the person, and the learnings, skills and keys (by name) that apply.',
      'Needs you holds the questions only a person should answer. Every agent starts by asking before each change and earns the right to act alone one kind of change at a time (offered after ten kept changes of that kind; an undo, three declines, a burst of writes or reading outside text puts it back). Deletes, money, keys and sharing always ask unless the owner lets their own agents do everything. Every change has a name and an undo.',
      'The Agents page shows every agent working now; the person can tell one something, pause, redirect or stop it.',
      'Projects, Work, People, Agents and Money are built in. Money: cash ahead, accounts, ledger, budgets, forecast, coming up, payees, reports. Stripe and Mercury connect read only; bank statements import as CSV.',
      'Slash: the built-in assistant. Press ⌘J to ask in plain words or ask for a change, with an undo.',
      'Free is $0, with every feature, 3 connected agents and 20 Slash questions a month; sign-up is by invite for now. ' +
        (LAUNCH.billing ? 'Cloud and Cloud Plus are paid monthly; see https://brain.dog/pricing.' : 'Cloud and Cloud Plus, paid monthly, are coming soon, priced at launch.'),
      'The app is at https://app.brain.dog. BrainDog is made by Quartz Apps LLC. Support: support@brain.dog.',
    ],
    about:
      'Each docs page below is the page as dialect text: Markdown with fenced blocks such as stat, steps and comparison that a BrainDog page draws. The address of each is the page address with .md on the end.',
    /* THE SITE'S OWN PAGES, before the docs: each line is the page's name and its search result (`meta` in `lib/copy/shell.ts`). */
    site: 'Site',
    pages: { home: 'Home', slash: 'Slash', agents: 'Connect your agents', pricing: 'Pricing', security: 'Security', support: 'Support', docs: 'Docs' },
    connect: 'Connecting',
    /* `MCP` in `lib/links.ts`, `servesMcp` in `apps/worker/src/route.ts`. The address is code; the words around it are not. */
    address: 'The address agents connect to',
    mcp: `Where ${APPS_OR} connects to a BrainDog. You approve it once in the app, and no key is copied anywhere.`,
  },
};
