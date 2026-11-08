/**
 * The words every page shares: the product's name, each page's search result, the header, the footer (which
 * carries the slogan) and the 404. Which pages the header, the footer and the 404 list is `nav.ts`'s.
 */
import { LAUNCH } from '../launch.ts';
import { TABLE } from '../plans.ts';

export const shell = {
  product: 'BrainDog',

  /** The search result and the shared card, about 150 characters each. */
  meta: {
    home: {
      title: 'BrainDog: shared memory for you and your AI agents',
      description: 'One place for your projects, decisions and money. Every agent reads it before it starts and writes down what it did. Money and keys wait for your yes.',
    },
    slash: {
      title: 'Slash, the assistant built into BrainDog',
      description:
        'Press ⌘J and ask in plain words. Slash answers from your own numbers and makes the changes you ask for, with an undo.',
    },
    pricing: {
      title: LAUNCH.billing ? `BrainDog pricing: free to start, Cloud from ${TABLE.hosted.price.month} a month` : 'Pricing: free to start · BrainDog',
      description: LAUNCH.billing
        ? 'Free to start with 3 connected agents. Cloud and Cloud Plus add more agents, more questions and, on Cloud Plus, your team.'
        : 'BrainDog is free to start: every feature, 3 connected agents and 20 questions to the built-in assistant a ' +
          'month. Paid plans come later.',
    },
    agents: {
      title: 'One memory for Claude Code, ChatGPT and Cursor · BrainDog',
      description:
        'One address and one approval per agent. Then each one starts with where things stand and writes down what it did.',
    },
    notFound: {
      title: 'Page not found · BrainDog',
      description: 'There is no page at this address on brain.dog.',
    },
    legal: {
      title: 'Legal: licence, terms and privacy · BrainDog',
      description: 'The licence BrainDog is published under, its Terms of Service, its Privacy Policy and the Data Processing Addendum for a business.',
    },
    download: {
      title: 'Download BrainDog for Windows, iPhone and the web',
      description: 'BrainDog for Windows from the Microsoft Store and for iPhone from the App Store, in any browser on any device, and the command line for your agents.',
    },
    changelog: {
      title: 'BrainDog changelog: what shipped, day by day',
      description: 'Everything that shipped in BrainDog, day by day: the app, the tools your agents use, plugins and fixes. Also as a feed you can follow.',
    },
  },

  /** The download page's head: its name and the line under it, which its shared card prints too. */
  downloadHead: {
    title: 'Download BrainDog',
    lead: "The same record on every device, so your work and your agents' work come with you.",
  },

  /* One label per page `nav.ts` knows, by the same key, plus the header's own words. */
  nav: {
    home: 'Home',
    slash: 'Slash',
    agents: 'Agents',
    packs: 'Plugins',
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
    personal: 'Personal',
    developers: 'Developers',
    terms: 'Terms',
    privacy: 'Privacy',
    owner: '© 2026 BrainDog',
  },
} as const;
