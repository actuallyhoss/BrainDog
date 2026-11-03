/**
 * The home page's words, band by band: the hero, how it works, nothing gets explained twice, the trust agents earn,
 * the business side, your team, Slash, free, and the questions.
 *
 * THE STORY (3 November, `loop/plans/site-story-2026-11-03`): you stop re-explaining your work; here is how; every
 * agent stays caught up; you can let them work because they earn it; and they know the business side too. One product
 * picture, the desk, then full-bleed bands that each say one new thing, and no recap close. The claims ledger
 * (`lib/claims.ts`) reads these key paths, so a key that moves moves there too.
 *
 * THE DRAWINGS' NAMES AND FIGURES ARE NOT HERE. Maya Okafor's record is one file, `lib/demo/maya.ts`, and every band
 * draws from it. The early access figures are `lib/plans.ts`, read by the page and never typed.
 */
import { listed } from '../agents.ts';
import { DOCS, SECURITY, SUPPORT_EMAIL } from '../links.ts';
import { LAUNCH } from '../launch.ts';

/** Where a developer reads how to connect: the docs' first page for AI tools. */
const CONNECT_DOCS = `${DOCS}/agents/connect`;

export const home = {
  hero: {
    /* THE HEADLINE (3 November, the site story): the buyer's own complaint, said as the promise. His slogan, "Give your
       business a memory.", left the hero because memory is free in every assistant now and four competitors' headline. */
    title: 'Stop re-explaining your work.',
    /* No mechanism in the promise: no event, log, row or ledger (`test/content.test.ts`). */
    /* No product names in the promise (3 November, Sam): "your agents", and the makers row under the buttons says which. */
    sub: 'One record of your projects, decisions and money. Your agents read it first, so each picks up where the last one stopped. They ask before touching money, keys or deletes.',
    secondary: 'Connect your agents',
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

  /* HOW IT WORKS (3 November): three steps, each a tile with its own icon and drawing. The keys are the old three
     readers' (`small`, `build`, `life`), kept so the ledger's paths stay put: connect, start caught up, answer. */
  who: {
    title: 'How it works',
    small: {
      title: 'Connect your agents',
      say: 'Paste one address, or run one command. You approve each once, and no key is copied anywhere.',
      figure: '1 address',
      figureSay: 'for every agent you use',
      link: 'Connect your agents',
      href: '/agents',
    },
    build: {
      title: 'Each session starts caught up',
      say: 'Your agent opens on where the project stands, the next step and who else is working. When it stops, it writes the next step down.',
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
      title: 'You answer what needs you',
      say: 'Agents ask before they change things. Their questions wait in one list, each with what would happen and why. Say yes, or not now.',
      link: 'How approvals work',
      href: `${DOCS}/use/decide`,
    },
  },

  /* THE BUSINESS SIDE (3 November): money as a reason to stay, said for the founder. The plugin names are the
     catalogue's own (`packs/`); Stripe and Mercury read balances and payouts only, so nothing here says revenue. */
  money: {
    title: 'The business side, where your agents can see it.',
    say: "Cash ahead, who owes you and what's due, from your bank statements, Stripe and Mercury. Ask an agent what to chase this week and it answers with your numbers.",
    worth: 'Net worth',
    accounts: 'Accounts',
    budgets: 'Budgets',
    coming: 'Coming up',
    left: (left: string) => `${left} left`,
    over: (over: string) => `${over} over`,
    of: (spent: string, of: string, period: string) => `${spent} of ${of} ${period}`,
    addons: "Import any bank's statement as a CSV and each line is filed. Your choices become rules for the next one. Stripe and Mercury connect read only.",
  },

  /* TRUST THEY EARN (3 November): the ladder in `packages/record/src/ladder.ts`, said plainly. Its own handoffs and
     lessons are written freely, which is why the sentence says "your work". */
  chores: {
    title: "Agents ask until they've earned your trust.",
    say: 'A new agent asks before every change to your work. Keep ten of its changes of one kind, and BrainDog offers to let it make that kind alone. One undo puts it back to asking.',
    waits: 'Waiting on you',
    done: 'Done on its own',
    floor: 'Deletes, money, keys and sharing ask every time. You can let your own agents skip that, but reading a key, giving BrainDog away and deleting it stay yours.',
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
    say: 'Invite people by email and choose what each can see and change. Their agents get the same access, no more. Every change says who made it.',
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
    title: 'Nothing gets explained twice.',
    say: 'Every agent reads the same page: the next step, what was decided and why, the dead ends, and the keys it may use. What one agent learns on Monday, the next one knows on Tuesday.',
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
    say: 'The assistant inside BrainDog answers from your own numbers and shows what it read. Ask for a change and it makes it, with an undo. Press ⌘J on any page, or Ctrl J on Windows.',
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
    title: 'Free while in early access.',
    say: "BrainDog is invite only for now. Ask for an invite and we'll email you when your place is ready.",
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
        a: 'That memory stays inside one app and holds facts about you. BrainDog is one record every agent you use reads, and it holds the work itself: next steps, decisions, money, and who changed what.',
      },
      {
        q: "Isn't a notes file in my repo enough?",
        a: "For one repo and one agent, often it is. But you keep it by hand, and it doesn't know what another agent did yesterday or who hasn't paid. Keep it for the code's rules. BrainDog holds the state of the work, and your agents keep it current.",
      },
      {
        q: 'Do I need to be technical?',
        a: 'No. Most agents connect with one address in their settings, and BrainDog works in any browser. The command line is there if you want it.',
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
          : 'Nothing in early access: every feature is free. Paid plans for more agents, more questions and teams come later.',
        link: { label: 'Pricing', href: '/pricing' },
      },
    ],
  },
} as const;
