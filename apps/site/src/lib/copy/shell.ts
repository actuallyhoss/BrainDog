/**
 * The words every page shares: the product's name, the slogan, each page's search result, the header,
 * the footer and the 404. Which pages the header, the footer and the 404 list is `nav.ts`'s.
 */
export const shell = {
  product: 'BrainDog',
  /** The slogan. It is the README's headline, unchanged, and it takes no full stop. */
  tagline: 'Give your business a memory',

  /** The search result and the shared card, about 150 characters each. */
  meta: {
    home: {
      title: 'BrainDog · Give your business a memory',
      description:
        'One record of your projects, money and people, shared by you and every AI agent you use. ' +
        'It tells you where things stand and asks only what matters.',
    },
    slash: {
      title: 'Slash · BrainDog',
      description:
        'Press / anywhere in BrainDog and ask in plain words. Slash answers from your record, finds ' +
        'anything, and drafts what you ask for, with nothing added until you say yes.',
    },
    pricing: {
      title: 'Pricing · BrainDog',
      description:
        'Free for one person, with the whole app, three agents and 20 questions to Slash a month. ' +
        'Cloud and Cloud Plus add room when you need it.',
    },
    agents: {
      title: 'Connect your agent · BrainDog',
      description:
        'Connect Claude, ChatGPT, Codex, Cursor or VS Code to your record in one line. Your agent ' +
        'starts with your brief and leaves a note when it is done.',
    },
    notFound: {
      title: 'Page not found · BrainDog',
      description: 'There is no page at this address on brain.dog.',
    },
    legal: {
      title: 'Legal · BrainDog',
      description: 'The licence BrainDog is published under, and its Terms of Service and Privacy Policy.',
    },
    changelog: {
      title: 'Changelog · BrainDog',
      description: "What shipped in BrainDog and when, in the repository's own words.",
    },
  },

  /* One label per page `nav.ts` knows, by the same key, plus the header's own words. */
  nav: {
    home: 'Home',
    slash: 'Slash',
    agents: 'Agents',
    packs: 'Packs',
    pricing: 'Pricing',
    docs: 'Docs',
    changelog: 'Changelog',
    support: 'Support',
    security: 'Security',
    legal: 'Legal',
    source: 'GitHub',
    /** Drawn in place of "Start free" and "Sign in" once the visitor is signed in (`lib/site/signed-in.ts`). */
    open: 'Open BrainDog',
    signin: 'Sign in',
    start: 'Start free',
    menu: 'Menu',
  },

  /** The page a mistyped address lands on. Its list of pages is `nav.ts`'s, so it cannot leave one out. */
  notFound: {
    title: 'There is no page here',
    lede: 'The address may be mistyped, or the page may have moved. These are the pages brain.dog has.',
  },

  /** The dark footer: the brand and its line, three groups (`lib/site/footer.ts`) and the company's name. */
  footer: {
    tagline: 'Give your business a memory.',
    groups: {
      product: 'Product',
      learn: 'Learn',
      company: 'Company',
    },
    /* The links that are not a page's own label: the first doc, the connect page by what it does, and the texts. */
    start: 'Get started',
    connect: 'Connect an agent',
    terms: 'Terms',
    privacy: 'Privacy',
    owner: '© 2026 BrainDog',
  },
} as const;
