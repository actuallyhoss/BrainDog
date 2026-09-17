/**
 * Every sentence on brain.dog, in one file.
 *
 * Same discipline as the record app's `copy.ts` and for a sharper reason here: marketing copy is
 * where a product lies to itself. One file means one pass to check that every claim on this site is
 * a thing the software does, and where a claim is about something not built yet, it says so in the
 * sentence rather than in a footnote nobody reads.
 *
 * THE VOICE, in five rules:
 *   - Say what it does. Never sell it, never adjective it, never "powerful" or "seamless".
 *   - A CTA is Verb + Noun. Never "Get Started", never "Learn More".
 *   - A number is a real number or it is absent. No "10x", no "up to".
 *   - Say the limits out loud. A page that lists only strengths is a page nobody believes twice,
 *     and the buyer here reads specifications for a living.
 *   - NO EM DASHES, anywhere a person reads. A sentence that only worked because of the dash was
 *     two sentences. Write them as two, or use a colon.
 *
 * THE DRAWINGS ARE COPY TOO. The landing page shows the product as small drawn moments rather than
 * screenshots, and every label, figure, name and time in them is below, read off the demo record
 * (`apps/web/src/lib/record/data.ts` and `packages/seed/src/index.ts`). Nothing in a drawing is
 * invented: when the seed's sample business changes, these change with it, not before it. A key
 * that nothing renders is deleted rather than kept for later.
 */

export const site = {
  product: 'BrainDog',
  /** The slogan. It is the README's headline, unchanged, and it takes no full stop. */
  tagline: 'Give your business a memory',

  /**
   * THE SEARCH RESULT AND THE SHARED CARD, written for that job rather than borrowed from the page.
   * About 150 characters each, answering the question a stranger is actually asking.
   */
  meta: {
    home: {
      title: 'BrainDog · Give your business a memory',
      description:
        'One record arranged around you: your own money, your studies, the companies you run, a ' +
        "team's work or a new project. You and your AI agents keep it up to date.",
    },
    pricing: {
      title: 'Pricing · BrainDog',
      description:
        'Two ways to run BrainDog: hosted at $12 a month per record, or self-hosted for free on your ' +
        'own machine. Neither plan is open yet.',
    },
    legal: {
      title: 'Legal · BrainDog',
      description:
        'The licence BrainDog is published under, and where its Terms and Privacy policy will be ' +
        'published before hosted sign-up opens.',
    },
    changelog: {
      title: 'Changelog · BrainDog',
      description:
        "What shipped in BrainDog and when, in the repository's own words. The app is live on a " +
        'synthetic record, and nothing is for sale yet.',
    },
  },

  nav: {
    pricing: 'Pricing',
    changelog: 'Changelog',
    docs: 'Design',
    source: 'GitHub',
    open: 'Open the app',
    menu: 'Menu',
  },

  hero: {
    title: 'Give your business a memory',
    /* THE SLOGAN STAYS UNTIL THE OWNER PICKS ANOTHER; the line under it speaks to every kind of person
       the product is for (`loop/DIRECTION.md` §11), not to a business alone. */
    sub:
      'One record for what you keep track of, arranged around you: your own money, a term of ' +
      "coursework, the companies you run, a team's work or a project you are starting. You and your " +
      'AI agents keep it up to date.',
    /* `Open the demo` opens the demo, where nothing needs an account; `note` says so under it. */
    primary: 'Open the demo',
    secondary: 'See who it is for',
    note:
      'The demo is a made-up business, not yours. There is no sign-up and no billing yet, and ' +
      'nothing you type into it is kept.',
    /* THE PICTURE UNDER THE PROMISE is the demo's home screen, photographed by
       `scripts/product.mjs`, so its alt text says what that screen holds. */
    shotAlt:
      'The home screen of the demo record, The Studio: what it is owed and what is due, the ' +
      'questions waiting on a decision, and what its agents and rules did while you were away.',
  },

  /** The demo's projects, with the mark and the frozen hue the seed gives each one. */
  projects: {
    Kiln: { name: 'Kiln', mark: 'diamond', hue: 214 },
    Portage: { name: 'Portage', mark: 'circle', hue: 176 },
    Tallow: { name: 'Tallow', mark: 'square', hue: 261 },
  },

  /**
   * WHO IT IS FOR: the five use cases, each with a photograph of its own first page.
   *
   * THE PICTURES ARE NOT THE DEMO. Each is a new self-hosted record set up through /start by
   * `scripts/usecases.mjs`, so what it shows is what that person sees after Make my record, with the
   * examples the use case ships. `shot: null` is a use case not yet built, drawn as text only and
   * marked for a re-shoot: run `node scripts/usecases.mjs personal` once /start offers it, then set
   * `shot: 'personal'` and write its alt text.
   */
  who: {
    title: "Who it's for",
    body:
      'Say who you are and what the record is for, and it is arranged around that: its pages, its ' +
      'lists and the words on them. Each picture is a new record, set up that way from the first screen.',
    cases: [
      {
        id: 'personal',
        title: 'Personal',
        body: 'Your own money and bills, what renews, what you are saving for, and the passion projects you come back to.',
        holds: 'Being built. Until it is ready, a personal record starts from the lists you pick on the first screen, such as Money, People and Work.',
        shot: null,
        alt: '',
      },
      {
        id: 'student',
        title: 'Student',
        body: 'Your courses, what is due and when, and how each piece of work went.',
        holds: 'Opens on Today, with Studies beside it. Lists: Courses, Assignments and Study sessions.',
        shot: 'student',
        alt: "A student's record on Today: an assignment due this week, a study session tomorrow, and what changed since the last look.",
      },
      {
        id: 'founder',
        title: 'Solo founder',
        body: 'The organisations you run, the money across them, and the numbers your projects report.',
        holds: 'Opens on Overview, with a Dashboard across organisations and a page for each. Lists: Organisations and Datapoints, beside Money, Projects, People and Tasks.',
        shot: 'founder',
        alt: "A solo founder's Overview: cash now, what comes in and goes out in 30 days, the numbers a project reported, and the organisations.",
      },
      {
        id: 'team',
        title: 'Team board',
        body: 'Tickets with an owner and a status, the cycle each is in, and the work your agents took on.',
        holds: 'Opens on Team, with Board and Agent work. Lists: Teammates, Cycles and Tickets.',
        shot: 'team',
        alt: "A team's record: tickets in flight with the agent working on each, what is blocked, and what is due this week.",
      },
      {
        id: 'guide',
        title: 'New project guide',
        body: 'The milestones of your project, the next step to take, the choices to make and what helps along the way.',
        holds: 'Opens on Your project, with a Guide page. Lists: Milestones, Steps, Choices and Resources.',
        shot: 'guide',
        alt: 'A new project on its first page: the milestone it is at, the next three steps with their dates, and a choice waiting.',
      },
    ],
    pending: 'A picture follows when the personal setup ships.',
    jump: 'The use cases',
  },

  /** THE FACADE, in plain words (`loop/DIRECTION.md` §11). */
  facade: {
    title: 'Arranged for you. Made of parts.',
    body:
      'Everything you see in a BrainDog is arranged for you. Underneath, it is modules that you or your ' +
      'agents can change, and a setup that works can be handed to somebody else.',
    items: [
      {
        title: 'What you see is arranged',
        body: "The pages, the rail, the names of the lists and the voice of each screen follow what the record is for. A student's record talks about courses and due dates, not invoices.",
      },
      {
        title: 'Underneath, it is modules',
        body: 'Lists with typed fields, pages built from blocks, rules, polls and the tools agents use. Each can be turned on, turned off, renamed or changed, by you or by an agent you allow to.',
      },
      {
        title: 'Spark suggests, you accept',
        body: 'Spark, the manager of your BrainDog, suggests an arrangement from what you tell it on the first screen. Nothing is arranged or rearranged until you accept.',
      },
      {
        title: 'Setups are shared',
        body: 'An arrangement saves as a use case file. Another record installs it from the file or an address, and browses the ones on offer as cards. A shared setup is readable text and runs no code.',
      },
    ],
  },

  /** THE OWNER'S OWN CASE: numbers arriving from projects, drawn as dashboards. */
  founder: {
    title: 'Your projects report. Your dashboards draw.',
    body:
      'The case BrainDog was first built for: one person running several organisations, with the ' +
      'numbers coming from the projects themselves rather than typed in.',
    steps: [
      {
        title: 'A project reports',
        body: 'Each project gets a report key that opens nothing else. It sends a measure, a value and a time, and the record keeps it as a row.',
      },
      {
        title: 'Or BrainDog polls it',
        body: 'Give it an address and an interval and it reads every number there, with no key when the address needs none. You approve the poll once.',
      },
      {
        title: 'Dashboards draw them',
        body: "Tiles, lines against the period before, and each organisation's balance from the accounts it names: across all of them, and one page for each.",
      },
    ],
    alt: "A founder's Dashboard: cash across organisations, the balance of each, and active users, recurring revenue and signups drawn against the thirty days before.",
    note: 'The numbers in this picture are sixty days of rows written the way a project reports them, into a new record.',
  },

  /** SEVEN SMALL MOMENTS, each a real feature in miniature, drawn from the same demo record. */
  bento: {
    title: 'The same parts, whoever it is for.',
    body:
      'Every setup draws on the same modules: typed rows, questions, rules, keys, history and export. ' +
      'The pictures here are small pieces of the demo, a made-up studio called The Studio.',
    money: {
      title: 'Money, owed and owing',
      caption: 'What you are owed, what is late, and the balance walked forward to the first day it would go under.',
      figures: [
        { label: 'Owed to you', amount: '£28,320.00', late: false },
        { label: 'Due in 30 days', amount: '£26,690.00', late: false },
        { label: 'Overdue to pay', amount: '£10,540.00', late: true },
      ],
      walked: 'Walked forward',
      under: 'First day under',
    },
    ask: {
      title: 'Questions, with a recommendation',
      caption: 'When the record should not guess, it asks you, and says what it would do.',
      project: 'Portage',
      id: 'SG29',
      question: 'Does Portage keep sending from portagemail.example, or move to the apex?',
      options: [
        { title: 'Keep the subdomain', recommended: true },
        { title: 'Move to the apex', recommended: false },
      ],
      recommended: 'Recommended',
      answered: 'Answered: Keep the subdomain',
    },
    inbox: {
      title: 'Mail, filed by a rule',
      caption: 'A rule reads the reply and writes it onto the invoice it is about.',
      from: 'ap@halden.example',
      subject: 'RE: Invoice 2026-041',
      preview:
        'Apologies for the delay. This is with our finance team and should clear in the next payment run on the 12th.',
      age: '9h ago',
      rule: 'Reply rule',
      row: 'Invoice 2026-041, brand system',
      party: 'Halden Type Co · Owed to you',
      amount: '£4,800.00',
      line: 'Halden replied on 2026-041: payment run on the 12th',
    },
    vault: {
      title: 'Keys, without the keys',
      caption: 'The vault records what each key opens. The key itself is never in a row, and agents are refused it.',
      key: {
        label: 'Fenwick deploy key',
        opens: 'Workers deploys for kiln.example',
      },
      other: { label: 'Nordhaven API', opens: 'DNS for five domains' },
      stale: 'Due for rotation',
      opens: 'Opens',
      secret: 'The key',
      sealed: 'Not in the row',
      asks: 'Claude asks for the Fenwick deploy key',
      refused: 'Refused',
    },
    history: {
      title: 'Who changed what, and when',
      caption: 'Every change is an event with a name and a time, and events are only ever added.',
      head: 'History',
      only: 'Only ever added',
      events: [
        {
          seq: '4192',
          who: 'Claude',
          what: 'Created services#6, Object storage',
          age: '3h ago',
        },
        {
          seq: '4188',
          who: 'Reply rule',
          what: 'Added a note to obligations#1',
          age: '9h ago',
        },
        {
          seq: '4181',
          who: 'You',
          what: 'Moved tasks#12 from open to done',
          age: '14h ago',
        },
        {
          seq: '4174',
          who: 'Renewal rule',
          what: 'Moved services#2 from live to lapsing',
          age: '1d ago',
        },
        {
          seq: '4160',
          who: 'Codex',
          what: 'Opened SG31, Kiln licensing model',
          age: '1d ago',
        },
      ],
    },
    export: {
      title: 'All of it, as one file',
      caption: 'Export is one SQLite file with every row, the fields each register declared, and every event.',
      parts: ['Money', 'Services', 'People', 'Projects', 'History'],
      file: 'The Studio',
      ext: '.brain',
      what: 'One SQLite file',
    },
    /**
     * THE TYPED ROW, and the one sentence on the site that teaches the word register by example.
     *
     * `test/content.test.ts` reads the caption back out of the served page and checks each register
     * it names against the seed, and checks every field label in the figure against the money
     * register's declaration. The values are item #4 of the same synthetic record.
     */
    typed: {
      title: 'Typed rows, not a pile of notes',
      caption: 'A register is a typed collection: money, services, people.',
      figure: {
        register: 'Money',
        row: 'item #4',
        fields: [
          {
            label: 'Description',
            type: 'text',
            value: 'Corporation tax, payment on account',
          },
          { label: 'Which way', type: 'one of two', value: 'owed by me' },
          { label: 'Amount', type: 'money', value: '£19,100.00' },
          { label: 'Due', type: 'a date', value: '7 Sep 2026' },
          { label: 'Status', type: 'one of four', value: 'open' },
        ],
      },
    },
  },

  /**
   * HOW IT WORKS WITH AGENTS, as the one chain in the demo that runs from an arrival to rows: the
   * Fenwick invoice, the question it raised, the answer and its reason, and the two rows written.
   *
   * THE NOTE IS THE LIMIT, and it sits under the steps rather than in a footnote. The tools are
   * written and the transport is not, and a buyer who reads specifications will find that out in
   * about four minutes. Better it comes from us.
   */
  steps: {
    title: 'Agents propose. You decide.',
    body:
      'Claude, Codex, Cursor or any MCP client reads and writes the record with a key you issue. ' +
      'Nothing it does is quiet: every change carries its name, and what needs you arrives as a proposal.',
    /* HOW AN AGENT CONNECTS, as a ledger under the chain. Each line is a thing the self-host does today. */
    ways: [
      {
        title: 'Over MCP',
        body: 'The record serves MCP over HTTP, and the braindog command serves it over stdio for tools that start one. Its tools read, search, write and propose.',
      },
      {
        title: 'With a key you issue',
        body: 'braindog login signs a machine in with a six-digit code you approve in Settings. A key can read, propose or write, and it expires.',
      },
      {
        title: 'Proposals land with you',
        body: 'A change the agent may not make itself is proposed. Decide draws what it would change, and one press applies it as you.',
      },
    ],
    items: [
      {
        title: 'An agent proposes',
        body: 'The assistant reads the Fenwick invoice and drafts the two services on it.',
      },
      {
        title: 'The record asks you',
        body: 'One question, with the options and the one it recommends.',
      },
      {
        title: 'You decide, and it is written down',
        body: 'Your answer, your reason, and each new row with a name and a time.',
      },
    ],
    mail: {
      from: 'billing@fenwick.example',
      subject: 'Your September invoice is ready',
    },
    proposer: 'The assistant',
    proposes: 'drafted two services',
    drafts: [
      { name: 'Object storage', cost: '£41.00 monthly' },
      { name: 'Workers plan', cost: '£5.00 monthly' },
    ],
    question: 'Add the two services on the Fenwick invoice?',
    options: [
      { title: 'Add both', recommended: true },
      { title: 'Leave them out', recommended: false },
    ],
    recommended: 'Recommended',
    answered: 'Answered: Add both',
    reason:
      'Both are live and both renew; an invoice line nobody has a row for is the thing this record exists to stop.',
    written: [
      { seq: '4192', id: 'services#6', name: 'Object storage' },
      { seq: '4191', id: 'services#7', name: 'Workers plan' },
    ],
    writer: 'Claude',
    age: '3h ago',
    note:
      'Agents reach a self-hosted record over MCP today. The chain above is drawn from the demo, and ' +
      'on the hosted app it opens with sign-up.',
  },

  /** What a reader can hold the product to, and what it cannot do yet, side by side. */
  trust: {
    title: 'Plain about what it is.',
    keepTitle: 'Yours to keep',
    keep: [
      {
        title: 'Open source',
        body: 'The code is on GitHub, and the self-hosted build is built from it. The repository opens to the public when the product launches.',
      },
      {
        title: 'Run it yourself',
        body: 'The self-hosted build is the same software as the hosted one: one process, one record file, one port.',
      },
      {
        /* `in the format every operating system has a free reader for` and not a named tool, because
           Windows ships no `sqlite3` and this is the sentence somebody checks on the way out. */
        title: 'Your data is one file',
        body: 'A record is one SQLite file, in the format every operating system has a free reader for. Leaving is a copy, not a migration.',
      },
      {
        title: 'Nothing is overwritten',
        body: 'Every change is an event, and events are only ever added. A write made against an old version is refused rather than merged behind you.',
      },
    ],
    notYetTitle: 'Not built yet',
    notYet: [
      'The personal setup is being built. Student, Solo founder, Team board and New project guide are ready.',
      'Spark suggests a setup by reading the words you type on the first screen. Arranging with a language model is not built yet.',
      'Mail does not arrive by itself yet. The inbox in the demo holds sample mail.',
      'Neither plan is open. There is no sign-up and no billing.',
    ],
  },

  /** Stated because a page that lists only strengths is a page nobody believes twice. */
  limits: {
    title: 'What it will not do',
    items: [
      {
        title: 'It is not an accounting package.',
        body: 'It records what you owe and what you are owed. It does not do double entry, and it will not file anything for you.',
      },
      {
        title: 'It is not a CRM.',
        body: 'People are rows because contracts and invoices point at them. There is no pipeline, no sequence and no lead score.',
      },
      {
        title: 'A pack never runs code.',
        body: 'A pack is a file that adds registers and pages. It is readable text, checked before installation, and nothing in it runs, which closes a whole class of supply-chain attack and means some things you might want a pack to do are things it cannot do.',
      },
    ],
  },

  closing: {
    body: 'The demo opens on The Studio, a made-up business with questions waiting. A record of your own starts with who you are and what it is for.',
    secondary: 'See the pricing',
  },

  pricing: {
    title: 'Two ways to run it.',
    body: 'The same software either way. Hosting is the only thing being sold.',
    /**
     * THE STATE OF BOTH PLANS, above the prices rather than under them.
     *
     * A price on a page is an offer, and neither of these can be accepted yet. Saying so once, in
     * plain words, is what lets the rest of the page describe the plans in the present tense.
     */
    statusTitle: 'Not open yet',
    status:
      'Neither plan is open yet. The record app is live and you can use it, hosting has no billing ' +
      'and no sign-up, and the self-host boots but still needs its authentication finished. These ' +
      'are the prices for when they open, published early so nobody has to ask.',
    self: {
      name: 'Self-hosted',
      price: 'Free',
      /* `and yours to run` and not `and complete`: a running self-host cannot open its own vault. */
      unit: 'and yours to run',
      body: 'No seat count, no key to phone home for.',
      points: [
        /* `one record file`: an installation writes three files, and the RECORD is one of them. */
        'One process, one record file, one port',
        'The same registers, pages and rules',
        'Your own domain and your own backups',
      ],
      cta: 'Read the build',
    },
    hosted: {
      name: 'Hosted',
      price: '$12',
      unit: 'per month, per record',
      body: 'One isolated database per record, run on Cloudflare, with nothing shared between customers.',
      points: [
        'One database per record, never a shared table',
        'The same software as the self-hosted build',
        'Export the whole file whenever you like',
      ],
      cta: 'Open the app',
    },
    honestTitle: 'Why there is no free hosted tier',
    honest:
      'No free hosted tier, on purpose. A free tier on a per-customer database is a per-customer ' +
      'cost with no revenue against it, and the way that ends is a product that quietly gets worse ' +
      'for the people paying for it.',
  },

  /**
   * THE LEGAL PAGE. The licence lives here and in the READMEs, not in the marketing copy.
   *
   * THE TERMS AND THE PRIVACY POLICY ARE NOT WRITTEN, and this page says so rather than drawing a
   * placeholder that reads like one. Nothing here is a legal term that has not been decided.
   */
  legal: {
    title: 'Legal',
    lede: 'The licence BrainDog is published under, and what is still to be written.',
    licence: {
      title: 'Licence',
      body: [
        'BrainDog is open source. The software is licensed under the Apache License 2.0, and the renderer in packages/render is licensed under the MIT License.',
        'It is provided as is, without warranty of any kind, express or implied. The licence texts set out the full terms.',
      ],
      links: [
        { label: 'Apache License 2.0', href: 'https://www.apache.org/licenses/LICENSE-2.0' },
        { label: 'MIT License', href: 'https://opensource.org/license/mit' },
        { label: 'The code on GitHub', href: 'https://github.com/actuallyhoss/BrainDog' },
      ],
      note: 'The repository is private until the product launches, so the GitHub link opens for the public then.',
    },
    terms: {
      title: 'Terms and privacy',
      body: 'The Terms of Service and the Privacy policy are not published yet. Both will be published here before hosted sign-up opens. Until then there is no sign-up and no billing, and the demo keeps nothing you type into it.',
    },
  },

  changelog: {
    lede: "What shipped and when, in the repository's own words.",
    count: (entries: number, days: number) => `${entries} entries over ${days} days`,
  },

  footer: {
    tagline: 'Give your business a memory',
    columns: [
      {
        title: 'Product',
        links: [
          { label: 'Pricing', href: '/pricing' },
          { label: 'Changelog', href: '/changelog' },
          { label: 'GitHub', href: 'https://github.com/actuallyhoss/BrainDog' },
          /* THE FOOTER AND NOT THE HEADER: the hero says there is no sign-up, and a sign-in beside
             it would contradict the sentence a reader has just been given. A literal and not
             `${APP}/signin`, because `APP` is declared below `site` in this module. */
          { label: 'Sign in', href: 'https://app.brain.dog/signin' },
        ],
      },
      {
        /* THE LICENCE IS NAMED ON THE LEGAL PAGE AND IN THE READMES, not in the marketing copy. */
        title: 'Legal',
        links: [{ label: 'Licence', href: '/legal' }],
      },
    ],
  },
} as const;

/**
 * The addresses, in one place.
 *
 * `SOURCE` IS PUBLISHED AHEAD OF THE REPOSITORY GOING PUBLIC, on the owner's word, 2026-09-16. The
 * repository is private until the product launches, and the link is on the site now so it is
 * already in place on the day it opens.
 *
 * `DOCS` AND `BUILD` ARE STILL `null`. They point inside the repository at pages that are not
 * written for a stranger yet. `null` and not a different URL, so every call site has to decide what
 * to draw when there is no address, and the type makes it decide.
 */
export const APP = 'https://app.brain.dog';
export const SOURCE: string | null = 'https://github.com/actuallyhoss/BrainDog';
export const DOCS: string | null = null;
/** The build instructions, which is what a self-hoster is actually sent to. */
export const BUILD: string | null = null;
