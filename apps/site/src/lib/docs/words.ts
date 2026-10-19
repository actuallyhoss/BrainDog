/**
 * Every word the docs frame says: the landing page, the sections, the page furniture and `/llms.txt`.
 *
 * THE DOCS' OWN WORDS, beside the code that reads them (each page has its own copy file, and this
 * one belongs to `lib/docs/`). The pages themselves are dialect text in `src/docs/`, so
 * nothing here describes the product beyond what a section of the docs is about.
 */
import type { IconName } from '../icons.ts';
import type { Section } from './pages.ts';

export const docsWords = {
  meta: {
    title: 'Docs · BrainDog',
    description:
      'How to use BrainDog, connect your agents, write pages in the dialect and build packs. Every page is also text an agent can read.',
    /** A page's own title in the tab. */
    page: (title: string): string => `${title} · BrainDog docs`,
  },

  title: 'Docs',
  lede: 'How to use BrainDog, connect your agents, write pages and build packs. Every page here is also plain text an agent can read.',
  /** The link to `/llms.txt`, under the lede. */
  forAgents: 'The list for agents',

  /* WHAT EACH SECTION IS ABOUT, in the order of `SECTIONS`. Each names what its section covers, not
     what the product does. */
  sections: {
    start: { label: 'Start here', blurb: 'What BrainDog is, and where to go next.', glyph: 'rocket' },
    use: { label: 'Using BrainDog', blurb: 'Home, pages, lists, Needs you, Slash, automations, the inbox and sharing.', glyph: 'home' },
    agents: { label: 'Agents', blurb: 'Connecting an agent, its tools, keys and grants, and the command line.', glyph: 'plug' },
    api: { label: 'The API', blurb: 'The HTTP calls a key may make, doors and webhooks, and their limits.', glyph: 'terminal' },
    dialect: { label: 'The page dialect', blurb: 'Every block a page can draw, each shown beside the text that draws it.', glyph: 'layers' },
    packs: { label: 'Packs', blurb: 'What a pack declares, and how to write and publish one.', glyph: 'board' },
  } as const satisfies Record<Section, { label: string; blurb: string; glyph: IconName }>,

  /** A section card with no page in it yet. */
  empty: 'No pages yet.',

  search: {
    label: 'Search the docs',
    placeholder: 'Try keys, pages or webhooks',
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
  edit: 'Edit on GitHub',

  llms: {
    /* `/llms.txt`'s opening lines, read by an agent that has never met the product. */
    title: 'BrainDog',
    /* The home page's sentence (`meta.home` in `lib/copy/shell.ts`), said in the third person for a reader who is not the owner. */
    summary:
      "BrainDog is one record of a person's or a business's projects, money and people, shared by them and every AI agent they use. It tells them where things stand and asks only what matters.",
    about:
      'Each docs page below is the page as dialect text: Markdown with fenced blocks such as stat, steps and comparison that a BrainDog page draws. The address of each is the page address with .md on the end.',
    /* THE SITE'S OWN PAGES, before the docs: each line is the page's name and its search result (`meta` in `lib/copy/shell.ts`). */
    site: 'Site',
    pages: { home: 'Home', slash: 'Slash', agents: 'Connect your agent', pricing: 'Pricing' },
    connect: 'Connecting',
    /* `MCP` in `lib/links.ts`, `servesMcp` in `apps/worker/src/route.ts`. The address is code; the words around it are not. */
    address: 'The address agents connect to',
    mcp: 'Where Claude, ChatGPT, Codex, Cursor or VS Code connects to a BrainDog record. You approve it once in the app, and no key is copied anywhere.',
  },
};
