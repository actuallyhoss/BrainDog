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
import { APPS_AND, APPS_OR, listed } from '../agents.ts';
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
    sub: `BrainDog keeps where your projects stand, what you decided and who owes you in one place. ${APPS_AND} read it first, so each picks up where the last one stopped, and they ask before touching money, keys or deletes.`,
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
      title: 'Connect the agents you already use',
      say: `Paste one address into ${APPS_OR}, or run one command for Claude Code. You approve each once, and no key is copied anywhere.`,
      figure: '1 address',
      figureSay: 'for every agent you use',
      link: 'Connect your agents',
      href: '/agents',
    },
    build: {
      title: 'Each session starts caught up',
      say: "Your agent opens on the briefing: where the project stands, the next step the last session left, who else is working, and what's waiting on you. When it stops, it writes the next step down.",
      lines: ['braindog · context', 'Tidepool. Next: ship webhook retries.', "Cursor, yesterday: onboarding copy waits on Dana's icons."],
      link: 'What an agent sees',
      href: '/agents',
    },
    /* The drawing is the first of Maya's questions (`NEEDS[0]`), as Needs you draws it. */
    life: {
      title: 'You answer what needs you',
      say: "Agents ask before they change things, until they've earned your trust. Their questions wait in one list, each with what would happen and why. Say yes, not now, or undo it later.",
      link: 'How approvals work',
      href: `${DOCS}/use/decide`,
    },
  },

  /* THE BUSINESS SIDE (3 November): money as a reason to stay, said for the founder. The add-on names are the
     catalogue's own (`packs/`); Stripe and Mercury read balances and payouts only, so nothing here says revenue. */
  money: {
    title: 'The business side, where your agents can see it.',
    say: "Cash ahead, who owes you, what's due and what each project costs, from your bank statements, Stripe and Mercury. Ask an agent what to chase this week and it answers with your numbers.",
    worth: 'Net worth',
    accounts: 'Accounts',
    budgets: 'Budgets',
    coming: 'Coming up',
    left: (left: string) => `${left} left`,
    over: (over: string) => `${over} over`,
    of: (spent: string, of: string, period: string) => `${spent} of ${of} ${period}`,
    addons: "Import any bank's statement as a CSV and each line is filed; your choices become rules for the next one. Stripe and Mercury connect read only. Your own money can sit beside the business, kept apart.",
  },

  /* TRUST THEY EARN (3 November): the ladder in `packages/record/src/ladder.ts`, said plainly. Its own handoffs and
     lessons are written freely, which is why the sentence says "your work". */
  chores: {
    title: "Agents ask until they've earned your trust.",
    say: "A new agent asks before every change to your work. Once you've kept ten of its changes of one kind, BrainDog offers to let it make that kind on its own, and only that kind. One undo puts it back to asking.",
    waits: 'Waiting on you',
    done: 'Done on its own',
    floor: 'Deletes, money, keys and sharing ask every time. You can let your own agents skip that; reading a key, giving BrainDog away and deleting it stay yours either way.',
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
    say: 'Invite people by email and choose what each can see and change. Their agents get exactly their access, no more, and every change says who made it.',
    roles: {
      title: 'Access in plain words',
      say: 'Can view, Can add, Can edit or Can decide, for everything or only the projects you pick. Money can stay yours.',
    },
    mention: {
      title: 'Mention someone and they hear about it',
      say: 'Type @ and a name in a comment, and their phone gets a notification. You see who else is on the page.',
      comment: 'can you check the April invoice before Friday?',
    },
    link: {
      title: 'Share one page with a link',
      say: 'A read-only link to one page or project, for a day, a week or a month. Money stays off it unless you add it.',
      rows: ['Tidepool, read only', 'Works for 7 days', 'Money left off'],
    },
    imports: 'Bring contacts in from a CSV or vCard. Anyone already here is skipped.',
    link2: 'How sharing works',
    href: `${DOCS}/use/sharing`,
  },

  /* THE CORE PROMISE, on the night ground: every agent reads the same page and leaves the next step on it. */
  tools: {
    title: 'Nothing gets explained twice.',
    say: 'Every agent reads the same page: each project\'s next step, the decisions and why, the dead ends already tried, the lessons learned and the keys it may use, by name. What Claude learns on Monday, Cursor knows on Tuesday.',
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
    say: 'The assistant built into BrainDog answers from your own numbers and shows what it read. Ask for a change and it makes it, with an undo. Press ⌘J on any page, or Ctrl J on Windows.',
    tries: 'Try',
    more: 'How Slash works',
  },

  /* WHAT KEEPS IT YOURS, the row under the chores band's drawing. Export is said in the questions and on /security. */
  yours: {
    title: 'It stays yours.',
    points: [
      { icon: 'history', text: 'Every change carries a name, person or agent, and an undo.' },
      { icon: 'pause', text: 'See which agents are working now, and pause, redirect or stop one from any browser.' },
      { icon: 'key', text: 'Agents use your keys without ever seeing them.' },
    ],
    link: 'How we keep it safe',
    href: SECURITY,
  },

  free: {
    title: 'Free while in early access.',
    say: "BrainDog is invite only for now. Ask for an invite and we'll email you when your place is ready. A short chat about your work sets it up.",
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
        q: 'How is this different from ChatGPT or Claude memory?',
        a: `Their memory stays inside their own app and holds facts about you. Even Claude's chat memory doesn't reach Claude Code. BrainDog is one place that ${APPS_AND} all read, and it holds the work itself: each project's next step, what was decided, the money, and who changed what.`,
      },
      {
        q: 'Isn\'t a CLAUDE.md enough?',
        a: "For one repository and one tool, often it is. You keep it by hand, and it knows nothing of what Cursor did yesterday, what's waiting on you or who hasn't paid. Keep it for the code's rules. BrainDog holds the state of the work, and your agents keep it current at the end of every session.",
      },
      {
        q: 'Do I need to be technical?',
        a: 'No. Claude and ChatGPT connect with one address in their settings (ChatGPT needs a paid plan for this), and BrainDog works in any browser. The command line is there for Claude Code users who want the briefing at every start.',
        link: { label: 'How to connect', href: CONNECT_DOCS },
      },
      {
        q: 'Can an agent spend money or delete things?',
        /* THE OWNER'S SWITCH (2 November) covers money, settings, add-ons, the team, sharing, making keys, imports and
           exports; never handing over, deleting the whole BrainDog or reading a key's value, and paying stays in
           Billing (`docs/03-agents/04-scopes.md`). */
        a: 'Not unless you say so. Money, keys, sharing and deletes ask every time. You can switch on letting your own agents do everything without asking, but reading a key, giving BrainDog away, deleting it and paying stay yours even then. Every change carries its name and an undo.',
      },
      {
        q: "Won't it ask me about everything?",
        a: 'At first, yes: a new agent asks before every change to your work. Keep ten of its changes of one kind and BrainDog offers to let it do that kind on its own. You can see where each agent stands, and put any kind back to asking, in Settings.',
      },
      {
        q: 'Can my team use it?',
        a: 'Yes. Invite people by email, each with their own sign-in and a role in plain words, or share one page with a read-only link. A colleague\'s agents can never do more than that colleague can.',
        link: { label: 'How sharing works', href: `${DOCS}/use/sharing` },
      },
      {
        q: 'Is my data safe?',
        a: "Your BrainDog is its own database, apart from every other customer's. Keys are sealed, a sealed copy is made every night, and you can export everything as one file whenever you like.",
        link: { label: 'Security', href: SECURITY },
      },
      {
        q: 'Is it only for work?',
        a: 'It is built for running projects with agents. Your own bills and budgets can sit beside the business, kept apart.',
        link: { label: 'How Money works', href: `${DOCS}/use/money` },
      },
      {
        q: 'What does it cost?',
        /* THE PAID PLANS BY THE BILLING FLAG: priced at launch while it is off, and the pricing page's own figures once it is on. */
        a: LAUNCH.billing
          ? 'Free is $0. Cloud and Cloud Plus are monthly plans for more agents, more questions and, on Cloud Plus, your team.'
          : 'Nothing while in early access: every feature is free. Paid plans for more agents, more questions and teams come later, priced at launch.',
        link: { label: 'Pricing', href: '/pricing' },
      },
    ],
  },
} as const;
