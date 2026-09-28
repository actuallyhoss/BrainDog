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
        'One record for everything you keep track of, arranged around you. You, Slash and your AI ' +
        'agents keep it current, and every change says who made it.',
    },
    slash: {
      title: 'Slash · BrainDog',
      description:
        'Slash is the assistant inside every BrainDog record. It answers from your own lists, drafts ' +
        'what you describe, and writes nothing until you accept it.',
    },
    pricing: {
      title: 'Pricing · BrainDog',
      description:
        'From $12 a month per record, with Slash credits included. Colleagues are free on ' +
        'every plan, and extra usage is off until you turn it on.',
    },
    agents: {
      title: 'For agents · BrainDog',
      description:
        'Connect Claude, Codex, Cursor or any MCP client to your record by URL: what an agent reads, ' +
        'what it writes, and what only a person can do.',
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
    agents: 'For agents',
    packs: 'Packs',
    pricing: 'Pricing',
    docs: 'Docs',
    changelog: 'Changelog',
    support: 'Support',
    security: 'Security',
    legal: 'Legal',
    source: 'GitHub',
    open: 'Open the app',
    signin: 'Sign in',
    start: 'Start your record',
    menu: 'Menu',
  },

  /** The page a mistyped address lands on. Its list of pages is `nav.ts`'s, so it cannot leave one out. */
  notFound: {
    title: 'There is no page here',
    lede: 'The address may be mistyped, or the page may have moved. These are the pages brain.dog has.',
  },

  footer: {
    tagline: 'Give your business a memory',
    groups: {
      product: 'Product',
      build: 'Build',
      trust: 'Trust',
    },
  },
} as const;
