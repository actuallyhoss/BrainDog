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
 * The vocabulary is `19 §9`'s. `register`, `row`, `pack`, `page` and `block` are defined in the
 * clause that first uses them; `predicate`, `projection`, `declaration`, `ceiling`, `extractor` and
 * `key` are internal words and never appear here.
 */

export const site = {
  product: 'BrainDog',
  /** The slogan. It is the README's headline, unchanged, and it takes no full stop. */
  tagline: 'Give your business a memory',

  nav: {
    pricing: 'Pricing',
    changelog: 'Changelog',
    docs: 'Design',
    source: 'Source',
    open: 'Open the app',
  },

  hero: {
    title: 'Give your business a memory',
    body:
      'A company knows a great deal that never reaches its codebase. What it is owed and by whom. ' +
      'What renews on Tuesday. Which key opens which account. Who decided the thing nobody can ' +
      'remember deciding. BrainDog keeps all of it in one database instead: typed, append-only, ' +
      'and readable by every agent you use.',
    primary: 'Start a record',
    secondary: 'Read the design',
    caption: 'The record app. Cream in light, warm charcoal in dark, and the same palette generated for both.',
  },

  sections: {
    typed: {
      kicker: 'It is a database',
      title: 'Typed rows, not a pile of notes.',
      body:
        'A register is a typed collection: obligations, domains, people. It declares its fields and ' +
        'their types, and every row is checked against them on the way in. Money is an integer in ' +
        'minor units with its own currency, so two currencies can never be added by accident. A date ' +
        'is a date. A reference to another row is a reference, not a name someone retyped.',
      note: 'The grid is a CSS grid with declared column tracks, not a <table>, because at eight columns and five thousand rows table layout stops being free.',
    },
    agents: {
      kicker: 'For your agents',
      title: 'They already know how to use it.',
      body:
        'The record is an MCP server. An agent gets the same typed tools you get, scoped to one ' +
        'record, and every call it makes is in the audit log with the agent named. There is no ' +
        'scraping, no browser automation and no second copy of your data for the model to read.',
      /* Real tool names and real argument shapes, checked against `packages/mcp/src/index.ts`. Wrapped
         to fit a narrow column rather than scrolled sideways: a code block the reader has to drag is
         a code block nobody finishes. */
      code: [
        '# every session, over MCP.',
        '# no adapter, no SDK',
        '',
        'list {',
        '  "register": "obligations",',
        '  "where": {',
        '    "field": "state",',
        '    "is": "open"',
        '  }',
        '}',
        '',
        'update {',
        '  "spoken": "obligations#4",',
        '  "patch": { "state": "paid" },',
        '  "version": 7',
        '}',
        '',
        '# send the version you read.',
        '# a stale write is refused,',
        '# never merged behind you.',
      ].join('\n'),
      note:
        'Sixteen tools are written and tested against the record. The transport that carries them ' +
        'is not connected yet, so no agent can reach a hosted record today. That is the next thing ' +
        'after the browser client.',
    },
    pages: {
      kicker: 'A page is a row',
      title: 'The screens are data too.',
      body:
        'A page is a screen made of blocks, and a block is one thing on it: a table, a figure, a ' +
        'note. Which blocks, over which rows, in which order and how wide is all written down, and ' +
        'editing it is editing a row. So it versions and diffs like everything else, and a pack can ' +
        'ship a page the same way it ships a register.',
      note: 'Sixteen block kinds over eight primitives. A pack may invent a kind; it may never write a colour, a font or a spacing value.',
    },
    project: {
      kicker: 'Per project',
      title: 'A page that is about one thing.',
      body:
        'Point every block on a page at one project and it stops being a dashboard and starts being ' +
        "that project's page: what is open on it, which of your agents are working on it right now, " +
        'what it is owed, what it costs to keep alive. Agent sessions are a register like any other, ' +
        'so they draw like any other.',
      note: 'Nothing about it is a new kind of thing. It is the same blocks over the same registers with `thing is Kiln` on the front.',
    },
    tracks: {
      kicker: 'Keeping the thread',
      title: 'Pin an agent to a track.',
      body:
        'A track is the line of work you are in the middle of. Pin a session to one and the context ' +
        'survives the session: close the window, come back on Tuesday, and what each agent was ' +
        'doing is there in order, next to the updates that say how it was going.',
      note:
        'Health is never a stored field. It is derived from the newest update, so it can always tell ' +
        'you who said so and when. And a finished track expects no update, which is a different ' +
        'thing from one that is overdue.',
    },
    forecast: {
      kicker: 'What is coming',
      title: 'The day the money runs out, and what does it.',
      body:
        'Start from what is liquid, apply every dated movement in order, and stop at the first day ' +
        'the balance goes under. Invoices in both directions, and every renewal a subscription will ' +
        'actually charge inside the window rather than the one date it stores.',
      note:
        'It names the row that crosses, not just the date. And the growth fit refuses to answer when ' +
        'the data cannot support one: six points of noise always produce a slope, and printing it is ' +
        'how a number gets quoted for a year.',
    },
    arrange: {
      kicker: 'Arrange it',
      title: 'Order and span. Nothing else.',
      body:
        'Drag to reorder, or move with the keyboard. It is the same operation either way. Set a width ' +
        'in twelfths. That is the whole vocabulary, and it is why you cannot make one of these pages ' +
        'ugly: spacing, type, colour, radius and density all come from the theme, so there is no word ' +
        'for ugly to say.',
      note: 'Each kind knows the narrowest it survives, and the control refuses below it rather than clamping. A table at a third of a page is not a narrow table, it is an unreadable one.',
    },
    vault: {
      kicker: 'Credentials',
      title: 'The vault indexes what a key opens. Never the key.',
      body:
        'A row records that the Fenwick deploy key exists, what it unlocks and when it was last ' +
        'rotated. The secret itself is encrypted under a separate envelope, revealed once, and every ' +
        'reveal is in the audit log with your name on it. Agents are refused the vault outright.',
    },
    own: {
      kicker: 'Your data',
      title: 'The record is a file you own.',
      /* TWO SENTENCES CORRECTED AGAINST WHAT IS BUILT, both found by an audit of the live pages.
         `a command-line tool that already ships with your computer` is false on Windows, which has
         no `sqlite3`, and this is the paragraph a Windows reader reads to decide whether their data
         is theirs. And `one signed file` is not built yet: `BACKLOG.md` records that a `.dog`
         carries no signature. A promise about leaving is the one promise on a page like this that
         has to be exactly true, because it is the promise somebody checks on the way out. */
      body:
        'A record is one SQLite file, in the format every operating system has a free reader for. ' +
        'Export is one file with every row, every declaration and every event in it, not a CSV per ' +
        'table with the relationships thrown away. Self-hosting runs the same packages from the ' +
        'same file, so leaving is a copy rather than a migration.',
    },
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
    status:
      'Neither plan is open yet. The record app is live and you can use it, hosting has no billing ' +
      'and no sign-up, and the self-host boots but still needs its authentication finished. These ' +
      'are the prices for when they open, published early so nobody has to ask.',
    self: {
      name: 'Self-hosted',
      price: 'Free',
      /* `and yours to run` AND IT SAID `and complete`, with `Every feature` under it. It is not
         complete: a running self-host cannot open its own vault, which `BACKLOG.md` records, so the
         one claim on this card that a reader could act on and find untrue was the word `complete`.
         The rest of the card is true, and `no seat count, no key to phone home for` is the thing
         somebody choosing this plan actually wants to know. */
      unit: 'and yours to run',
      body: 'No seat count, no key to phone home for. Apache-2.0.',
      points: [
        'One process, one file, one port',
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
    honest:
      'No free hosted tier, on purpose. A free tier on a per-customer database is a per-customer ' +
      'cost with no revenue against it, and the way that ends is a product that quietly gets worse ' +
      'for the people paying for it.',
  },

  /** Stated because a page that lists only strengths is a page nobody believes twice. */
  limits: {
    kicker: 'What it is not',
    title: 'Three things it will not do.',
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
        body: 'A pack is a file that adds registers and pages. It is readable text, checked before installation, and nothing in it runs. That closes the whole class of supply-chain attack, and it means some things you might want a pack to do are things a pack cannot do.',
      },
    ],
  },

  footer: {
    tagline: 'Give your business a memory',
    licence: 'Apache-2.0',
    columns: [
      {
        title: 'Product',
        links: [
          { label: 'Pricing', href: '/pricing' },
          { label: 'Changelog', href: '/changelog' },
        ],
      },
      {
        /* THE TWO DEAD LINKS ARE GONE AND THE HEADING IS NOT A PROMISE ANY MORE. `Source` and
           `The design, in full` both 404 while the repository is private, in a footer column headed
           *Open source*: three claims, two of them uncheckable, on every page of the site. The
           licence is the one that is true today and it is what the column now says. */
        title: 'Licence',
        links: [{ label: 'Apache-2.0', href: 'https://www.apache.org/licenses/LICENSE-2.0' }],
      },
    ],
  },
} as const;

/**
 * The addresses, in one place, because between them they appear a dozen times.
 *
 * `SOURCE`, `DOCS` AND `BUILD` ARE `null` BECAUSE THE REPOSITORY IS PRIVATE, and a link that 404s
 * is worse than an absent one on the page whose whole argument is that you can check things. An
 * audit of the live site counted SEVEN rendered instances across four URLs, every one of them a
 * 404 to a stranger, including the only outbound action in the pricing page's free plan and the
 * only one in the changelog's status block. `BACKLOG.md` recorded five and missed those two.
 *
 * THEY WERE POINTING AT THE RIGHT REPOSITORY. An earlier fix corrected them from
 * `github.com/braindog/braindog` on a branch called `main`, which is a stranger's repository called
 * *teste*; the address is right and the repository is not readable. Nothing here can fix that:
 * making it public is one setting and it is not this file's to change.
 *
 * `null` AND NOT A DIFFERENT URL, so every call site has to decide what to draw when there is no
 * address, and the type makes it decide. A placeholder would have put the same dead link back
 * through a variable.
 */
export const APP = 'https://app.brain.dog';
export const SOURCE: string | null = null;
export const DOCS: string | null = null;
/** The build instructions, which is what a self-hoster is actually sent to. */
export const BUILD: string | null = null;
