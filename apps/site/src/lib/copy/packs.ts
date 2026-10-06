/**
 * The packs pages' words: `/packs`, the catalogue's public face, and `/packs/<id>`, one pack.
 *
 * EVERY FACT ON THOSE PAGES IS THE CATALOGUE'S, read at build time (`lib/packs/read.server.ts`), so this
 * file holds only the sentences said around them and never a pack's name, count or version.
 */

const many = (n: number, one: string, more: string): string => `${n} ${n === 1 ? one : more}`;

export const packs = {
  packs: {
    meta: {
      title: 'Packs for BrainDog',
      description:
        'Lists, pages, rules and connections you can add to a BrainDog record, each shown as it draws before you install it.',
    },
    title: 'Packs',
    /* What a pack is rests on `packages/declare/src/catalogue.ts`: `reachOf` counts the lists, pages, rules and hosts. */
    lede:
      'Lists, pages, rules and connections that slot into your record. Each one shows what it adds, and ' +
      'the hosts it talks to, before anything changes.',

    search: 'Search packs',
    searchHint: 'Name, what it does, or who made it',
    filters: 'Show',
    all: 'All',
    /** The catalogue's categories as a reader says them, the same words the app's browse uses (`apps/web/src/lib/market/words.ts`). */
    categories: {
      'made-by-braindog': 'Made by BrainDog',
      'ways-of-working': 'Ways of working',
      modules: 'Lists',
      templates: 'Templates',
      connectors: 'Connectors',
      doors: 'Doors',
      automations: 'Automations',
      blocks: 'Blocks',
      themes: 'Themes',
    },
    shown: (n: number) => many(n, 'pack', 'packs'),
    /* The chart beside the search: how many packs each kind holds, from the filters' own counts. */
    kinds: 'By kind',
    kindsRead: (kind: string, n: number) => `${kind} is the largest kind, with ${many(n, 'pack', 'packs')}. A pack can be more than one kind.`,
    noMatch: 'No pack matches that. Try a shorter word, or show all.',
    showAll: 'Show all packs',
    none: 'No pack is listed yet.',

    by: (name: string) => `By ${name}`,
    version: (v: string) => `Version ${v}`,
    lists: (n: number) => many(n, 'list', 'lists'),
    pages: (n: number) => many(n, 'page', 'pages'),
    rules: (n: number) => many(n, 'rule', 'rules'),
    /* On a card the hosts are counted, never named: a person reads no hostname there. The pack's own page lists them. */
    services: (n: number) => many(n, 'outside service', 'outside services'),
    /* Rounded down and never below ten: `roundCount` in `packages/declare/src/kennel.ts`, the Kennel's `counts.json`. */
    installs: (n: number) => `On ${n}+ BrainDogs`,

    detail: {
      back: 'All packs',
      install: 'Install in BrainDog',
      /* The app shows its plan before a write: `apps/web/src/lib/market/PlanSheet.svelte`. */
      installNote: 'Opens BrainDog, which shows what this adds and asks before anything changes.',
      /* Until `LAUNCH.signup`, only a record that already exists can take one: `apps/site/src/lib/launch.ts`. */
      installNoteSoon: 'Opens BrainDog for a record you already have. Anyone can start a record at launch.',
      preview: 'How it looks',
      /* A preview is made in a scratch record by `tools/catalogue/previews.mjs`, never by the author. */
      previewNote: 'Drawn by BrainDog in a fresh record with only this pack on, holding just the examples it brings.',
      adds: 'What it adds',
      addsNote: 'No drawing of this version was made, so this is what it brings, by name.',
      addsLists: 'Lists',
      addsPages: 'Pages',
      addsRules: 'Rules',
      addsHosts: 'Hosts it calls',
      addsExamples: 'Example entries',
      addsNothing: 'It adds no list or page of its own. It works on what your record already holds.',
      facts: 'About this pack',
      publisher: 'Made by',
      licence: 'Licence',
      latest: 'Latest version',
      hosts: 'Hosts it calls',
      /* `calls_out` in `reachOf` (`packages/declare/src/catalogue.ts`) lists every host a declaration names. */
      noHosts: 'None. It talks to nothing outside your record.',
      versions: 'Versions',
      first: 'First release.',
      /* What each word means is `declaredBump` in `packages/declare/src/catalogue.ts`. */
      bumps: {
        major: 'Changes what it adds, so a record on the last version is asked first.',
        minor: 'Adds to what it did.',
        patch: 'Small fixes.',
      },
      added: (names: string) => `Adds ${names}.`,
      dropped: (names: string) => `Drops ${names}.`,
      withdrawn: (reason: string) => `Withdrawn: ${reason}`,
    },
  },
} as const;
