/**
 * The add-on store's words: `/addons`, the catalogue's public face, `/addons/<id>`, one add-on, and `/addons/by/<who>`,
 * everything one author has listed.
 *
 * EVERY FACT ON THOSE PAGES IS THE CATALOGUE'S, read at build time (`lib/packs/read.server.ts`), so this
 * file holds only the sentences said around them and never a pack's name, count or version.
 */

const many = (n: number, one: string, more: string): string => `${n} ${n === 1 ? one : more}`;

export const packs = {
  packs: {
    meta: {
      title: 'Add-ons · BrainDog',
      description:
        'Add-ons give your BrainDog new lists, pages and rules for the work you do. Each one shows what it adds ' +
        'before you add it.',
    },
    /* THE STORE'S NAME AS A STRANGER READS IT: "add-ons", the word the app's browse uses (`apps/web/src/lib/market/
       words.ts`). "Pack" stays the word in the docs, where the file format is. */
    title: 'Add-ons',
    /* What an add-on is rests on `packages/declare/src/catalogue.ts`: `reachOf` counts the lists, pages, rules and hosts. */
    lede: 'New lists, pages and rules for the work you do, from Stripe and Mercury to Sentry, Calendar and Weather. Each one shows what it adds before anything changes.',

    search: 'Search add-ons',
    searchHint: 'Rent, invoices, Stripe',
    filters: 'Show',
    all: 'All',
    /** The catalogue's categories as a reader says them, the same words the app's browse uses (`apps/web/src/lib/market/words.ts`). */
    categories: {
      'made-by-braindog': 'Made by BrainDog',
      'ways-of-working': 'Use cases',
      modules: 'Lists',
      templates: 'Templates',
      connectors: 'Connectors',
      doors: 'Doors',
      automations: 'Automations',
      blocks: 'Blocks',
      themes: 'Themes',
    },
    shown: (n: number) => many(n, 'add-on', 'add-ons'),
    noMatch: 'Nothing matches that. Try fewer words, or show all.',
    showAll: 'Show all add-ons',
    none: 'No add-on is listed yet.',

    /** What a listing is, on its card: a use case sets up a whole way of working, an add-on adds to one. */
    kind: { pack: 'Add-on', usecase: 'Use case' },
    /* SAID ONLY WHERE THE CATALOGUE SAYS BRAINDOG PUBLISHED IT (`Card.ours`), and as a plain fact: no tick, no "verified". */
    ours: 'Made by BrainDog',
    /* TRUE WHILE EVERY LISTING IS BRAINDOG'S, and drawn only then (`+page.svelte` counts), so it cannot outlive the day a
       stranger's add-on is listed. */
    allOurs: 'Every add-on here so far is made by BrainDog.',
    by: (name: string) => `By ${name}`,
    lists: (n: number) => many(n, 'list', 'lists'),
    pages: (n: number) => many(n, 'page', 'pages'),
    rules: (n: number) => many(n, 'rule', 'rules'),
    /* On a card the hosts are counted, never named: a person reads no hostname there. The add-on's own page lists them. */
    services: (n: number) => many(n, 'outside service', 'outside services'),
    /* What it brings, when it brings nothing of its own to open: a theme, a door, a rule on what is already there. */
    worksOn: 'Works on what you already keep',
    /* Rounded down and never below ten: `roundCount` in `packages/declare/src/kennel.ts`, the Kennel's `counts.json`. */
    installs: (n: number) => `On ${n}+ BrainDogs`,

    /** How far a listing is trusted, in the record's words (`TRUST_SAID` in `packages/record/src/methods/addons.ts`). */
    trust: {
      braindog: 'Made by BrainDog',
      reviewed: 'Reviewed by BrainDog',
      signed: 'Signed by its author, not reviewed',
      unreviewed: 'Not reviewed',
    },

    /**
     * THE BAND THAT ENDS THE STORE: anybody can make one, and the quickest way is to ask an agent. Every line rests on the
     * add-on docs: one file (`06-packs/01-overview.md`), the agent's calls (`17-with-your-agent.md`: it looks in the store,
     * writes, checks, and asks you on Needs you) and review (`10-publishing.md`, "Nothing from outside is listed until a
     * person has looked at it").
     */
    make: {
      title: 'Build your own.',
      say:
        'When BrainDog does not do something you want, ask your agent. It looks here first, and if nothing fits it writes ' +
        'an add-on, checks it against your BrainDog and asks you before anything is installed. You can share it, or send it ' +
        'in for review. Nothing from outside is listed until a person has looked at it.',
      agent: 'Build one with your agent',
      agentHref: '/docs/packs/with-your-agent',
      first: 'Write one yourself',
      firstHref: '/docs/packs/first-pack',
      publish: 'How publishing works',
      publishHref: '/docs/packs/publishing',
      terminal: 'Ask your agent',
      /* What a person says, and the agent's calls in their order (`17-with-your-agent.md`, `skills/braindog/SKILL.md`). */
      ask: 'BrainDog has no way to track films I want to watch. Make me an add-on for it.',
      steps: ['addons {q: "films to watch"}', 'addonNew {id: "watch-list", ...}', 'addonCheck {doc}', 'installPack {doc}'],
      stepsSaid: 'What it does, in order',
    },

    /** `/addons/by/<who>`: one author's listings. */
    by_page: {
      title: (name: string) => `Add-ons by ${name} · BrainDog`,
      description: (name: string, n: number) => `${many(n, 'add-on', 'add-ons')} by ${name} for BrainDog, each showing what it adds before you add it.`,
      heading: (name: string) => `Add-ons by ${name}`,
      lede: (n: number) => `${many(n, 'add-on', 'add-ons')} listed. ${n === 1 ? 'It shows' : 'Each one shows'} what it asks for of yours before anything changes.`,
      back: 'All add-ons',
    },

    detail: {
      title: (name: string) => `${name} · BrainDog add-on`,
      back: 'All add-ons',
      install: 'Add to BrainDog',
      /* The app shows its plan before a write: `apps/web/src/lib/market/PlanSheet.svelte`. */
      installNote: 'Opens BrainDog, which shows what this adds and asks before anything changes.',
      /* SIGN-UP IS OPEN, so `installNote` is for anybody, with a BrainDog or without one. This twin is shown only
         while `LAUNCH.signup` is off, when only a BrainDog that already exists can take an add-on, and it says just that. */
      installNoteSoon: 'Opens BrainDog, for a BrainDog you already have.',
      preview: 'How it looks',
      /* A preview is made in a scratch record by `tools/catalogue/previews.mjs`, never by the author. */
      previewNote: 'Drawn by BrainDog in a fresh BrainDog with only this add-on on, holding just the examples it brings.',
      adds: 'What it adds',
      addsNote: 'No drawing of this version was made, so this is what it brings, by name.',
      addsLists: 'Lists',
      addsPages: 'Pages',
      addsRules: 'Rules',
      addsHosts: 'Hosts it calls',
      addsExamples: 'Example entries',
      addsNothing: 'It adds no list or page of its own. It works on what your BrainDog already holds.',
      /* THE TILE BESIDE THE DRAWING, by name: what a person will find in their BrainDog after adding it. */
      brings: 'What it brings',
      ruleCount: (n: number) => (n === 1 ? '1 rule that runs on its own' : `${n} rules that run on their own`),
      exampleCount: (n: number) => `${many(n, 'example entry', 'example entries')} to start from`,
      facts: 'About this add-on',
      publisher: 'Made by',
      licence: 'Licence',
      latest: 'Latest version',
      hosts: 'Calls out to',
      /* `calls_out` in `reachOf` (`packages/declare/src/catalogue.ts`) lists every host a declaration names. */
      noHosts: 'Nothing. It talks to nothing outside your BrainDog.',
      versions: 'Versions',
      /* THE DECISION, first after the head: the lines worked out from the file (`asksOf`, the record's `reachLines`). */
      asks: 'What it asks for of yours',
      asksNote: 'Worked out by BrainDog from the add-on file, not written by its author. Your BrainDog shows these again and asks before anything changes.',
      asksNothing: 'Nothing of yours: no list of yours, no outside service and no key.',
      trust: 'Checked',
      moreBy: (name: string) => `More from ${name}`,
      first: 'First release.',
      /* What each word means is `declaredBump` in `packages/declare/src/catalogue.ts`. */
      bumps: {
        major: 'Changes what it adds, so a BrainDog on the last version is asked first.',
        minor: 'Adds to what it did.',
        patch: 'Small fixes.',
      },
      added: (names: string) => `Adds ${names}.`,
      dropped: (names: string) => `Drops ${names}.`,
      withdrawn: (reason: string) => `Withdrawn: ${reason}`,
    },
  },
} as const;
