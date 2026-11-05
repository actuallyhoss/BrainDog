/**
 * The home page's words, band by band: the hero, how it works, every agent knows what the others did, the trust agents earn,
 * the business side, your team, Slash, free, and the questions.
 *
 * THE STORY (4 November, `loop/plans/finish-2026-11-03/copy1104/HEADLINES.md`): your agents keep track and you make
 * the calls; here is how; every agent knows what the others did; you can let them work because they earn it; and the
 * money sits beside the work. One product
 * picture, the desk, then full-bleed bands that each say one new thing, and no recap close. The claims ledger
 * (`lib/claims.ts`) reads these key paths, so a key that moves moves there too.
 *
 * THE DRAWINGS' NAMES AND FIGURES ARE NOT HERE. Maya Okafor's record is one file, `lib/demo/maya.ts`, and every band
 * draws from it. The early access figures are `lib/plans.ts`, read by the page and never typed.
 */
import { DOCS, SECURITY, SUPPORT_EMAIL } from '../links.ts';
import { LAUNCH } from '../launch.ts';

/** Where a developer reads how to connect: the docs' first page for AI tools. */
const CONNECT_DOCS = `${DOCS}/agents/connect`;

export const home = {
  hero: {
    /* THE HEADLINE (4 November, copy1104): both reasons to buy in one breath, the agents keep the work current and you
       keep the decisions. "Every AI agent starts where the last one stopped" and "Stop re-explaining your work." sold the
       relay between sessions, and he called the first one shitty. HEADLINES.md has the seven tried. */
    title: 'Your agents keep track. You make the calls.',
    /* No mechanism in the promise: no event, log, row or ledger (`test/content.test.ts`). */
    /* No product names anywhere on the home page (3 and 4 November, the owner: "just say agents"), so no makers' row. */
    sub: 'One place for your projects, decisions and money. Every agent reads it before it starts and writes down what it did. Money, keys and deletes wait for your yes.',
    secondary: 'Connect your agents',
  },

  /* HOW IT WORKS (3 November): three steps, each a tile with its own icon and drawing. The keys are the old three
     readers' (`small`, `build`, `life`), kept so the ledger's paths stay put: connect, start caught up, answer. */
  who: {
    title: 'How it works',
    small: {
      title: 'Connect your agents',
      say: 'Paste one address or run one command. You approve each agent once, and no key is copied anywhere.',
      figure: '1 address',
      figureSay: 'for every agent you use',
      link: 'Connect your agents',
      href: '/agents',
    },
    build: {
      title: 'They keep track',
      say: 'Each agent starts by reading where the project stands, the next step and who else is working. When it stops, it writes the next step down.',
      /* THE TERMINAL IN THE TILE (`lib/site/TermWindow.svelte`): a real command and its short answer, on Maya's record. */
      term: {
        title: 'zsh: ~/code/tidepool',
        label: 'A terminal: braindog context prints where Tidepool stands',
        lines: [
          { kind: 'cmd', text: 'braindog context' },
          { kind: 'head', text: 'Tidepool · building' },
          { kind: 'out', text: 'Next: ship webhook retries' },
          { kind: 'out', text: "Waits on you: Dana's invoice" },
          { kind: 'dim', text: 'Yesterday: copy waits on icons' },
        ],
      },
      link: 'What an agent sees',
      href: '/agents',
    },
    /* The drawing is the first of Maya's questions (`NEEDS[0]`), as Needs you draws it. */
    life: {
      title: 'You make the calls',
      say: 'Questions from every agent wait in one list, each with what would happen and why. Say yes, or not now.',
      link: 'How approvals work',
      href: `${DOCS}/use/decide`,
    },
  },

  /* THE BUSINESS SIDE (3 November): money as a reason to stay, said for the founder. The plugin names are the
     catalogue's own (`packs/`); Stripe and Mercury read balances and payouts only, so nothing here says revenue. */
  money: {
    title: 'Your money, next to the work.',
    say: "Cash ahead, who owes you and what's due, from your bank statements, Stripe and Mercury. Ask an agent what to chase this week and it answers with real numbers.",
    worth: 'Net worth',
    accounts: 'Accounts',
    budgets: 'Budgets',
    coming: 'Coming up',
    left: (left: string) => `${left} left`,
    over: (over: string) => `${over} over`,
    of: (spent: string, of: string, period: string) => `${spent} of ${of} ${period}`,
    addons: "Import any bank's statement as a CSV and each line is filed. Stripe and Mercury connect read only.",
  },

  /* TRUST THEY EARN (3 November): the ladder in `packages/record/src/ladder.ts`, said plainly. Its own handoffs and
     lessons are written freely, which is why the sentence says "your work". */
  chores: {
    title: "Agents ask until they've earned your trust.",
    say: 'A new agent asks before every change to your work. Keep ten of its changes of one kind and BrainDog offers to let it do that kind alone. One undo puts it back to asking.',
    waits: 'Waiting on you',
    done: 'Done on its own',
    floor: 'Deletes, money, keys and sharing always ask. You can let your own agents skip that, but reading a key, giving BrainDog away and deleting it stay yours.',
    /* The figures beside the two headings, and the line the drawing says once nothing waits. */
    today: (n: number) => `${n} today`,
    empty: 'Nothing is waiting on you.',
    /* The line under the one question drawn, so the count beside the heading is what a reader can account for. */
    after: (n: number) => (n === 1 ? '1 more waits after this one.' : `${n} more wait after this one.`),
    askedBy: 'asked by',
    undo: 'Undo',
    /* THE LADDER, as Settings says it (`TrustRows.svelte`): one agent trusted with one kind, one still asking. */
    trust: 'Where each agent stands',
    askAgain: 'Ask again',
  },

  /* WORKING TOGETHER (2 November): the five roles in the app's words, invitations by mail, @ mentions that ring a
     colleague's phone, faces of who else is here, and read-only links with or without money
     (`docs/02-use/09-sharing.md`). A second person joins on any plan while billing is off (`teamsStop` in the worker). */
  together: {
    title: 'Bring your team, and their agents.',
    say: 'Invite people by email and choose what each can see and change. Their agents get the same access, no more.',
    roles: {
      title: 'Access in plain words',
      say: 'Can view, add, edit or decide, on everything or only the projects you pick. Money can stay yours.',
    },
    mention: {
      title: 'Mention someone and they hear about it',
      say: 'Type @ and a name in a comment, and their phone gets a notification.',
      comment: 'can you check the April invoice before Friday?',
    },
    link: {
      title: 'Share one page with a link',
      say: 'Read only, for a day, a week or a month. Money stays off it unless you add it.',
      rows: ['Tidepool, read only', 'Works for 7 days', 'Money left off'],
    },
    imports: 'Bring contacts in from a CSV or vCard. Anyone already here is skipped.',
    link2: 'How sharing works',
    href: `${DOCS}/use/sharing`,
  },

  /* THE CORE PROMISE, on the night ground: every agent reads the same page and leaves the next step on it. */
  tools: {
    title: 'Every agent knows what the others did.',
    say: 'They all read the same page: the next step, what was decided and why, and the dead ends. What one agent learns on Monday, the next one knows on Tuesday.',
    notes: 'What your agents left on Tidepool',
    connect: 'Connect yours',
    /* The one place home names the protocol, for the developer who came for it. */
    dev: 'For developers: the MCP address, the command line and tokens',
    devHref: CONNECT_DOCS,
  },

  slash: {
    name: 'Slash',
    /* ⌘J IS ASK, as the app's bar shows it; / is find (audit E18). */
    title: 'Or just ask BrainDog.',
    say: 'Slash, the assistant inside BrainDog, answers from your own numbers and shows what it read. Ask for a change and it makes it, with an undo. Press ⌘J on any page.',
    tries: 'Try',
    more: 'How Slash works',
  },

  /* WHAT KEEPS IT YOURS, the row under the chores band's drawing. Export is said in the questions and on /security. */
  yours: {
    title: 'It stays yours.',
    points: [
      { icon: 'history', text: 'Every change carries a name, person or agent, and an undo.' },
      { icon: 'pause', text: 'See which agents are working, and pause or stop one from any browser.' },
      { icon: 'key', text: 'Agents use your keys without ever seeing them.' },
    ],
    link: 'How we keep it safe',
    href: SECURITY,
  },

  free: {
    title: 'Start today, for free.',
    say: 'Sign up with your email and start. No card.',
    /* The figures are `TABLE.free`'s, said in ONE SENTENCE, NOT A ROW OF STATS (the site's own rule, §47). */
    /* "built\u2011in" with a hyphen that never breaks, so a phone does not leave "in assistant." alone on a line. */
    figures: (tools: number, questions: number): string =>
      `Free: every feature, ${tools} connected agents and ${questions} questions a month to the built\u2011in assistant.`,
  },

  faq: {
    title: 'Questions',
    /* The disclosure the questions after the first three sit behind. */
    more: 'More questions',
    aside: 'Anything else? Write to',
    email: SUPPORT_EMAIL,
    questions: [
      {
        q: 'How is this different from the memory in my AI app?',
        a: 'That memory stays inside one app and holds facts about you. BrainDog is read by every agent you use, and it holds the work itself: next steps, decisions, money, and who changed what.',
      },
      {
        q: "Isn't a notes file in my repo enough?",
        a: "For one repo and one agent, often it is. But you keep it by hand, and it doesn't know what another agent did yesterday or who hasn't paid. Keep it for the code's rules. BrainDog holds the state of the work, and your agents keep it current.",
      },
      {
        q: 'Do I need to be technical?',
        a: 'No. Most agents connect with one address in their settings, and BrainDog works in any browser.',
        link: { label: 'How to connect', href: CONNECT_DOCS },
      },
      {
        q: 'Can an agent spend money or delete things?',
        /* THE OWNER'S SWITCH (2 November) covers money, settings, plugins, the team, sharing, making keys, imports and
           exports; never handing over, deleting the whole BrainDog or reading a key's value, and paying stays in
           Billing (`docs/03-agents/04-scopes.md`). */
        a: 'Not unless you say so. Money, keys, sharing and deletes ask every time. You can let your own agents do everything without asking, but reading a key, giving BrainDog away, deleting it and paying stay yours even then.',
      },
      {
        q: "Won't it ask me about everything?",
        a: 'At first, yes. Keep ten of an agent\'s changes of one kind and BrainDog offers to let it do that kind alone. You can see where each agent stands, and put any kind back to asking, in Settings.',
      },
      {
        q: 'Can my team use it?',
        a: 'Yes. Invite people by email, each with their own sign-in and role, or share one page with a read-only link. A colleague\'s agents can never do more than that colleague can.',
        link: { label: 'How sharing works', href: `${DOCS}/use/sharing` },
      },
      {
        q: 'Is my data safe?',
        a: "Your BrainDog is its own database, apart from everyone else's. Keys are sealed, there's a sealed backup every night, and you can export everything as one file.",
        link: { label: 'Security', href: SECURITY },
      },
      {
        q: 'Is it only for work?',
        a: 'It is built for work run with agents. Your own bills and budgets can sit beside the business, kept apart.',
        link: { label: 'How Money works', href: `${DOCS}/use/money` },
      },
      {
        q: 'What does it cost?',
        /* THE PAID PLANS BY THE BILLING FLAG: priced at launch while it is off, and the pricing page's own figures once it is on. */
        a: LAUNCH.billing
          ? 'Free is $0. Cloud and Cloud Plus are monthly plans for more agents, more questions and, on Cloud Plus, your team.'
          : 'Nothing for now: every feature is free. Paid plans for more agents, more questions and teams come later.',
        link: { label: 'Pricing', href: '/pricing' },
      },
    ],
  },
} as const;
