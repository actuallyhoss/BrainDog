/**
 * The words every page shares: the product's name, each page's search result, the header, the footer (which
 * carries the slogan) and the 404. Which pages the header, the footer and the 404 list is `nav.ts`'s.
 */
import { APPS_OR } from '../agents.ts';
import { LAUNCH } from '../launch.ts';

export const shell = {
  product: 'BrainDog',

  /** The search result and the shared card, about 150 characters each. */
  meta: {
    home: {
      title: 'BrainDog · Give your business a memory',
      description:
        'BrainDog remembers your projects, money and people, shows what needs you on a Today you arrange, and ' +
        'shares it with Claude and Cursor. Free in early access.',
    },
    slash: {
      title: 'Slash: press ⌘J and ask anything · BrainDog',
      description:
        'Press ⌘J anywhere in BrainDog and ask in plain words. Slash answers with your numbers and makes the changes ' +
        'you ask for, each with an undo.',
    },
    pricing: {
      title: 'Pricing: free in early access · BrainDog',
      description:
        'BrainDog is Free: every feature, 3 AI tools and 20 Slash questions a month. ' +
        (LAUNCH.billing ? 'Cloud and Cloud Plus are monthly plans with more of each.' : 'Cloud and Cloud Plus are coming soon, priced at launch.'),
    },
    agents: {
      title: 'Connect Claude, ChatGPT and Cursor · BrainDog',
      description:
        `Connect ${APPS_OR} to BrainDog in one line. Each starts from your ` +
        "brief and leaves a note when it's done.",
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
      description: 'The BrainDog apps for iPhone and Mac are coming. Until then, BrainDog works in any browser.',
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
    rest: "It's free while we open it up.",
  },

  /** The dark footer: the brand with no blurb, three groups of plain links (`lib/site/footer.ts`) and the owner. */
  footer: {
    groups: {
      product: 'Product',
      who: "Who it's for",
      help: 'Help',
    },
    /* The links that are not a page's own label: who it is for, then the texts. */
    small: 'Small businesses',
    teams: 'Teams and agencies',
    personal: 'Personal use',
    developers: 'Developers',
    terms: 'Terms',
    privacy: 'Privacy',
    owner: '© 2026 BrainDog',
  },
} as const;
