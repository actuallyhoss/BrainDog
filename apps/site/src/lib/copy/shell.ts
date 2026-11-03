/**
 * The words every page shares: the product's name, each page's search result, the header, the footer (which
 * carries the slogan) and the 404. Which pages the header, the footer and the 404 list is `nav.ts`'s.
 */
import { LAUNCH } from '../launch.ts';

export const shell = {
  product: 'BrainDog',

  /** The search result and the shared card, about 150 characters each. */
  meta: {
    home: {
      title: 'BrainDog · Every AI agent starts where the last one stopped',
      description: 'One record of your projects, decisions and money. Your agents read it before they start, leave a handoff when they stop, and ask before touching money or keys.',
    },
    slash: {
      title: 'Slash, the assistant built into BrainDog',
      description:
        'Press ⌘J and ask in plain words. Slash answers from your own numbers, shows what it read, and makes changes with an undo.',
    },
    pricing: {
      title: 'Pricing: free in early access · BrainDog',
      description: LAUNCH.billing
        ? 'Free to start with 3 connected agents. Cloud and Cloud Plus add more agents, more questions and, on Cloud Plus, your team.'
        : 'BrainDog is free while invite only: every feature, 3 connected agents and 20 questions to the built-in assistant a ' +
          'month. Paid plans come later, priced at launch.',
    },
    agents: {
      title: 'Connect your agents · BrainDog',
      description:
        'One address and one approval per agent. Every session then starts with where things stand and ends with a handoff.',
    },
    notFound: {
      title: 'Page not found · BrainDog',
      description: 'There is no page at this address on brain.dog.',
    },
    legal: {
      title: 'Legal · BrainDog',
      description: 'The licence BrainDog is published under, and its Terms of Service and Privacy Policy.',
    },
    download: {
      title: 'BrainDog for iPhone and Mac',
      description: 'The iPhone and Mac apps are coming. Until then BrainDog works in any browser, on your phone too.',
    },
    changelog: {
      title: 'Changelog · BrainDog',
      description: 'Everything that shipped in BrainDog, day by day.',
    },
  },

  /* One label per page `nav.ts` knows, by the same key, plus the header's own words. */
  nav: {
    home: 'Home',
    slash: 'Slash',
    agents: 'Agents',
    packs: 'Add-ons',
    pricing: 'Pricing',
    download: 'Download',
    docs: 'Docs',
    changelog: 'Changelog',
    support: 'Support',
    security: 'Security',
    legal: 'Legal',
    source: 'GitHub',
    /** Drawn in place of the start button and "Sign in" once the visitor is signed in (`lib/site/signed-in.ts`). */
    open: 'Open BrainDog',
    signin: 'Sign in',
    /* THE BUTTON THAT STARTS IT: "Get early access" while sign-up is by invite, "Start free" once it is open,
       from `LAUNCH.invite`, so one flag turns every start button on the site. */
    start: LAUNCH.invite ? 'Get early access' : 'Start free',
    menu: 'Menu',
  },

  /** The page a mistyped address lands on. Its list of pages is `nav.ts`'s, so it cannot leave one out. */
  notFound: {
    title: "There's no page here",
    lede: 'The address may be mistyped, or the page has moved.',
    /* Over the three pages nearest the address (plan F29), and over every page under them. */
    near: 'Did you mean',
    all: 'Every page',
  },

  /** The early access line: the hero's under its buttons, and the strip that closes an inner page. */
  early: {
    strong: 'Early access, invite only.',
    rest: 'Free while we open it up.',
  },

  /** The dark footer: the brand with no blurb, three groups of plain links (`lib/site/footer.ts`) and the owner. */
  footer: {
    groups: {
      product: 'Product',
      who: "Who it's for",
      help: 'Help',
    },
    /* The links that are not a page's own label: who it is for, then the texts. */
    small: 'Founders',
    teams: 'Teams and agencies',
    developers: 'Developers',
    terms: 'Terms',
    privacy: 'Privacy',
    owner: '© 2026 BrainDog',
  },
} as const;
