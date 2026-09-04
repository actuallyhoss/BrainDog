/**
 * Every sentence on brain.dog, in one file.
 *
 * Same discipline as the record app's `copy.ts` and for a sharper reason here: marketing copy is
 * where a product lies to itself. One file means one pass to check that every claim on this site is
 * a thing the software does — and where a claim is about something not built yet, it says so in the
 * sentence rather than in a footnote nobody reads.
 *
 * THE VOICE, in four rules:
 *   - Say what it does. Never sell it, never adjective it, never "powerful" or "seamless".
 *   - A CTA is Verb + Noun. Never "Get Started", never "Learn More".
 *   - A number is a real number or it is absent. No "10x", no "up to".
 *   - Say the limits out loud. A page that lists only strengths is a page nobody believes twice,
 *     and the buyer here reads specifications for a living.
 */

export const site = {
  product: 'BrainDog',
  /** The one sentence. It is the repository's own first line, unchanged. */
  tagline: "Everything about your business that isn't code.",

  nav: {
    pricing: 'Pricing',
    changelog: 'Changelog',
    docs: 'Design',
    source: 'Source',
    open: 'Open the app',
  },

  hero: {
    title: "Everything about your business that isn't code.",
    body:
      'Money owed, renewals, hosting, credentials, decisions and the reasons for them. One typed ' +
      'record every agent you use can read and write, and that renders itself as a web app.',
    primary: 'Start a record',
    secondary: 'Read the design',
    caption: 'The record app. Cream in light, warm charcoal in dark, and the same palette generated for both.',
  },

  sections: {
    typed: {
      kicker: 'It is a database',
      title: 'Typed rows, not a pile of notes.',
      body:
        'A register declares its fields and their types, and every row obeys them. Money is an integer in ' +
        'minor units with its own currency, so two currencies can never be added by accident. A date is a ' +
        'date. A reference to another row is a reference, not a name someone retyped.',
      note: 'The grid is a CSS grid with declared column tracks, not a <table>, because at eight columns and five thousand rows table layout stops being free.',
    },
    agents: {
      kicker: 'For your agents',
      title: 'They already know how to use it.',
      body:
        'The record is an MCP server. Every agent you run gets the same tool surface you get, scoped to ' +
        'one record, with a per-tool audit line. There is no scraping, no browser automation and no ' +
        'second copy of your data for the model to read.',
      /* Real calls, wrapped to fit a narrow column rather than scrolled sideways. A code block the
         reader has to drag is a code block nobody finishes. */
      code: [
        '# any session. no adapter, no SDK',
        '',
        'braindog.list',
        '  obligations',
        '  where state is open',
        '    and due before 2026-10-01',
        '',
        'braindog.set',
        '  obligations#4',
        '  state: paid',
        '',
        '# signed, and in the audit log',
        '# with the agent named',
      ].join('\n'),
    },
    pages: {
      kicker: 'A page is a row',
      title: 'The screens are data too.',
      body:
        'A page is a declaration: which blocks, over which query, in which order and how wide. Editing one ' +
        'is editing a row, so it versions, diffs and reverts like everything else, and a pack can ship a ' +
        'page the same way it ships a register.',
      note: 'Sixteen block kinds over eight primitives. A pack may invent a kind; it may never write a colour, a font or a spacing value.',
    },
    project: {
      kicker: 'Per project',
      title: 'A page that is about one thing.',
      body:
        'Point every block on a page at one project and it stops being a dashboard and starts being that ' +
        "project's page: what is open on it, which of your agents are working on it right now, what it is " +
        'owed, what it costs to keep alive. Agent sessions are a register like any other, so they draw like ' +
        'any other.',
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
        'Drag to reorder, or move with the keyboard. It is the same operation either way. Set a width in twelfths. ' +
        'That is the whole vocabulary, and it is why you cannot make one of these pages ugly: spacing, type, ' +
        'colour, radius and density all come from the theme, so there is no word for ugly to say.',
      note: 'Each kind knows the narrowest it survives, and the control refuses below it rather than clamping. A table at a third of a page is not a narrow table, it is an unreadable one.',
    },
    vault: {
      kicker: 'Credentials',
      title: 'The vault indexes what a key opens. Never the key.',
      body:
        'A row records that the Fenwick deploy key exists, what it unlocks and when it was last rotated. ' +
        'The secret itself is encrypted under a separate envelope, revealed once, and every reveal is in ' +
        'the audit log with your name on it. Agents are refused the vault outright.',
    },
    own: {
      kicker: 'Your data',
      title: 'The record is a file you own.',
      body:
        'Export is one signed file with every row, every declaration and every event in it. Not a CSV per ' +
        'table with the relationships thrown away. Self-hosting runs the same code from the same file, so ' +
        'leaving is a copy rather than a migration.',
    },
  },

  pricing: {
    title: 'Two ways to run it.',
    body: 'The same software either way. Hosting is the only thing being sold.',
    self: {
      name: 'Self-hosted',
      price: 'Free',
      unit: 'and complete',
      body: 'Every feature, no seat count, no key to phone home for. AGPL-3.0-only.',
      points: [
        'One process, one file, one port',
        'The same MCP surface',
        'Your own domain and your own backups',
      ],
      cta: 'Read the install',
    },
    hosted: {
      name: 'Hosted',
      price: '$12',
      unit: 'per month, per record',
      body: 'One isolated database per customer, backed up, with inbound email and the Kennel wired in.',
      points: [
        'Daily signed backups, thirty days deep',
        'An inbound address per record',
        'Export the whole file whenever you like',
      ],
      cta: 'Start a record',
    },
    honest:
      'No free hosted tier, on purpose. A free tier on a per-customer database is a per-customer cost with ' +
      'no revenue against it, and the way that ends is a product that quietly gets worse for the people ' +
      'paying for it.',
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
        body: 'An extension is a set of declarations, checked before installation. That closes the whole class of supply-chain attack, and it means some things you might want a pack to do are things a pack cannot do.',
      },
    ],
  },

  footer: {
    tagline: "Everything about your business that isn't code.",
    licence: 'AGPL-3.0-only',
    columns: [
      {
        title: 'Product',
        links: [
          { label: 'Pricing', href: '/pricing' },
          { label: 'Changelog', href: '/changelog' },
        ],
      },
      {
        title: 'Open source',
        links: [
          { label: 'Source', href: 'https://github.com/braindog/braindog' },
          { label: 'The design, in full', href: 'https://github.com/braindog/braindog/tree/main/docs' },
          { label: 'Licence', href: 'https://www.gnu.org/licenses/agpl-3.0.en.html' },
        ],
      },
    ],
  },
} as const;

/** The app's own address. One constant, because it appears in six places. */
export const APP = 'https://app.brain.dog';
export const SOURCE = 'https://github.com/braindog/braindog';
export const DOCS = 'https://github.com/braindog/braindog/tree/main/docs';
