/**
 * The home page's words: the hero, the decision scene, the bands under it and the close.
 *
 * THE DRAWINGS ARE COPY TOO. Every name and figure in the decision scene is read off `packages/seed`,
 * the record the gates install, so a reader who starts a Personal record meets what the page showed.
 */
export const home = {
  hero: {
    /* THE SLOGAN, in two halves for the history of the thing, drawn as one sentence in one colour since 29 September:
       red is the accent and never a heading's colour. The words are the owner's and unchanged, with no full stop. */
    title: 'Give your business',
    titleAccent: 'a memory',
    sub: 'Everything you keep track of, in one place. You and your AI agents keep it up to date, and every change says who made it.',
    /* FREE LEADS (DIRECTION §35): the first button says what it costs, which is nothing. */
    primary: 'Start for free',
    secondary: 'See pricing',
  },

  /**
   * THE DECISION, drawn as a scene: an agent proposes, a person decides, and the change lands carrying
   * the agent's name. Every word is `SG33` in `packages/seed/src/index.ts` or the fixture ledger in
   * `apps/web/src/lib/record/fixtures/sample.ts`, with one liberty: in the seed the question is opened by
   * the record's reader of the invoice, and here by Claude, as `propose` over MCP really can.
   *
   * `history` is oldest first, and its last row is the one that lands when the reader accepts.
   */
  decide: {
    /* What a screen reader calls the scene, and the line a sighted reader sees over it. */
    label: 'An agent proposes. You decide.',
    agent: 'Claude',
    person: 'You',
    proposal: {
      title: 'Add the two services on the Fenwick invoice?',
      change: 'Object storage and the Workers plan, with the renewal dates from the invoice.',
    },
    /* `acceptIt` in `apps/web/src/lib/copy.ts`: the word the app's own button says. */
    verb: 'Accept',
    accepted: 'Accepted by you',
    /* THE TWO TILES' HEADINGS, as the app names the screen and the list, and the line under the history, which is
       what `yours` below says of every change. */
    heads: { ask: 'Decide', history: 'History', order: 'Newest first' },
    undo: 'Any change can be undone, and the name stays on it.',
    history: [
      /* The times are `sample.ts`'s: `seq 4160` at `stamp(-31)`, and `stamp` counts hours. */
      { who: 'Codex', what: 'Opened a question about the Kiln licensing model', when: '1d ago' },
      /* `seq 4188` in `sample.ts`, written by `rule.reply`, which the app names `Reply` through `names.ts`'s `actor`. */
      { who: 'Reply', what: 'Added a note to an invoice that is late', when: '9h ago', rule: true },
      /* `seq 4192` and `4191` in `sample.ts`. It says `just now` because it lands as the reader presses
         Accept, and `decide-copy.test.ts` reads that word from `since` in `packages/render/src/format.ts`. */
      { who: 'Claude', what: 'Added Object storage and the Workers plan, from the Fenwick invoice', when: 'just now' },
    ],
  },

  /**
   * THE HOME PAGE UNDER THE HERO. Each band shows one thing the product does,
   * drawn working, with a heading that says what the reader gets and one sentence under it.
   */
  home: {
    /* THE DECISION'S BAND: the heading and one sentence beside the scene above. */
    decide: {
      title: 'An agent proposes. You decide.',
      lead: 'When an agent wants to change something, you get a question first. Accept it and the change lands with its name on it.',
    },

    slash: {
      title: 'Press / and ask.',
      lead: 'Ask what you owe this month and it shows the bills. Ask for a page and it builds one. Nothing it writes goes in until you say yes.',
      more: 'More about Slash',
    },

    agents: {
      title: 'Bring your own agents.',
      lead: 'Claude, Codex, Cursor or anything else that speaks MCP reads and writes your record with a key you give it.',
      /* The connect sheet's own words, as the app's sheet says them. */
      sheet: 'Connect an agent',
      connect: 'MCP address',
      copy: 'Copy the address',
      keys: 'Agents use your API keys without ever seeing them.',
      more: 'How agents connect',
    },

    /**
     * THE DOORS AND THE LEARNED PATTERN, drawn as three steps. The flow is `docs/07` §4: an unmatched
     * payload lands raw, Slash proposes an ingest pattern from three examples, one approval makes it
     * a declaration, and no model runs on that shape again. The three alerts are the Personal
     * record's own gym and phone bills and a groceries shop.
     */
    inbox: {
      title: 'Forward it once. It files itself after that.',
      lead:
        'Send bank texts and receipts by email, point a webhook at your record, or connect Stripe and Mercury. ' +
        'After three of a kind, Slash suggests how to file them. Say yes and the rest file themselves, with no credits spent.',
      doors: ['Email', 'Webhook', 'Stripe', 'Mercury'],
      steps: ['Arrives', 'Learned once', 'Filed'],
      arrivals: [
        { from: 'Card alert', text: 'You paid GBP 32.00 to PUREGYM on 3 Oct.' },
        { from: 'Card alert', text: 'You paid GBP 18.00 to VODAFONE on 4 Oct.' },
        { from: 'Card alert', text: 'You paid GBP 64.20 to TESCO STORES on 5 Oct.' },
      ],
      pattern: {
        name: 'Card alerts',
        fields: [
          ['Amount', 'the money after “paid”'],
          ['Merchant', 'the words after “to”'],
          ['Date', 'the day after “on”'],
        ],
        tested: 'Matches all three',
        writes: 'Files into Spending',
      },
      list: 'Spending',
      columns: ['What', 'Amount', 'On'],
      rows: [
        ['Puregym', 'GBP 32.00', '3 Oct'],
        ['Vodafone', 'GBP 18.00', '4 Oct'],
        ['Tesco Stores', 'GBP 64.20', '5 Oct'],
      ],
    },

    yours: {
      title: 'Your data stays yours.',
      body: [
        'Each record is its own database. Export all of it as one file whenever you like.',
        'Every change is saved with who made it, and any change can be undone.',
        'The code is open, so you can read exactly how all of this works.',
      ],
      source: 'See the code on GitHub',
      /* A glyph for each paragraph of `body`, in order: its own database, every change named, open source. */
      glyphs: ['server', 'undo', 'code'],
    },

    /**
     * THE PLANS, FREE FIRST (DIRECTION §35): the heading is Free's and never a price, Free is the large tile with its
     * figures, and the paid plans share one quieter tile, a line each. The figures are `lib/plans.ts`.
     */
    plans: {
      title: 'Free for one person.',
      lead: 'The whole app, for one record, with no card and no trial that runs out.',
      /* The two meters Free is drawn with. */
      meters: { credits: 'Slash credits a month', runs: 'automation runs a month' },
      pros: {
        head: 'For pros',
        said: 'More Slash and automations, and colleagues in the same record at no extra cost.',
      },
      /* A paid plan's line in the pros tile: its price, then its unit, read from `lib/plans.ts`. */
      price: (price: string, unit: string) => `${price} ${unit.replace(', per record', '')}`,
      more: 'Full pricing',
    },
  },

  closing: {
    title: 'Start your record.',
    body: 'Tell it who you are and what it is for, and Slash sets up the first lists and pages.',
    primary: 'Start for free',
    secondary: 'See the pricing',
  },
} as const;
