/**
 * The home page's words: the hero, the decision scene, the bands under it and the close.
 *
 * THE DRAWINGS ARE COPY TOO. Every name and figure in the decision scene is read off `packages/seed`,
 * the record the gates install, so a reader who starts a Personal record meets what the page showed.
 */
export const home = {
  hero: {
    /* THE SLOGAN, IN TWO HALVES, so the last two words take `--accent-text`. The words are the
       owner's and unchanged. */
    title: 'Give your business',
    titleAccent: 'a memory',
    sub: 'Everything you keep track of, in one place arranged around you. You and your AI agents keep it up to date, and every change says who made it.',
    primary: 'Start your record',
    secondary: 'See what it costs',
    note: 'From $12 a month per record. Colleagues are free.',
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
    history: [
      /* The times are `sample.ts`'s: `seq 4160` at `stamp(-31)`, and `stamp` counts hours. */
      { who: 'Codex', what: 'Opened a question about the Kiln licensing model', when: '1d ago' },
      /* `seq 4188` in `sample.ts`, written by `rule.reply`, which the app names `Reply` through `names.ts`'s `actor`. */
      { who: 'Reply', what: 'Added a note to an invoice that is late', when: '9h ago' },
      /* `seq 4192` and `4191` in `sample.ts`. It says `just now` because it lands as the reader presses
         Accept, and `decide-copy.test.ts` reads that word from `since` in `packages/render/src/format.ts`. */
      { who: 'Claude', what: 'Added Object storage and the Workers plan, from the Fenwick invoice', when: 'just now' },
    ],
  },

  /**
   * THE HOME PAGE UNDER THE HERO (`loop/DIRECTION.md` §33). Each band shows one thing the product does,
   * drawn working, with a heading that says what the reader gets and one sentence under it.
   */
  home: {
    slash: {
      title: 'Press / and ask.',
      lead:
        'Slash is built into every record. Ask what you owe this month and it shows the bills. Ask for a ' +
        'page and it builds one. Nothing it writes goes in until you say yes.',
      more: 'More about Slash',
    },

    agents: {
      title: 'Bring your own agents.',
      lead:
        'Claude, Codex, Cursor and anything else that speaks MCP can read and write your record with a ' +
        'key you give it. When an agent wants to change something, you get a question first, and its ' +
        'name stays on the change.',
      connect: 'MCP address',
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
        'Send in bank texts and receipts by email, point a webhook at your record, or connect Stripe and ' +
        'Mercury. After three of the same kind, Slash suggests how to file them. Say yes and the rest go ' +
        'in on their own, without using credits.',
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

    /**
     * THE BLOCKS, DRAWN AS A PAGE BY THE PRODUCT'S OWN RENDERER. `page.src` is dialect text (docs/05 §2),
     * drawn by `lib/app/Page.svelte` through `braindog-render`, so the band shows what a record's page
     * with these rows draws rather than a picture of one.
     *
     * EVERY FIGURE AGREES WITH THE PERSONAL AND TEAM EXAMPLES in the window above (`lib/examples/`),
     * dated `DRAWN_ON`, Monday 28 September 2026. The Personal Home leaves GBP 1,312.40 after the
     * week's GBP 878.99 of bills, so its accounts hold GBP 2,191.39; less the GBP 1,148.99 of bills
     * due inside thirty days and plus the GBP 2,450.00 pay day, that is GBP 3,492.40. The Lisbon goal,
     * the three bills due this week and their days are the Personal example's, September is the month
     * in progress, and the tickets are the Team example's board.
     */
    pages: {
      title: 'Make the pages you actually check.',
      /* The block kinds are `KINDS` in `packages/render/src/kinds.ts`; moving and asking for them are
         docs/06 and docs/29. */
      lead:
        'Put figures, charts, boards, calendars and tables on a page, all reading from your lists. ' +
        'Drag them around yourself, or tell Slash what you want to see.',
      page: {
        src: `~~~stat
Cash in 30 days | GBP 3,492.40 | after bills and pay day
Trip to Lisbon | GBP 420.00 | of GBP 900.00 put by
~~~

~~~series | Spending by month
Month | in: Spent | state
May | GBP 612.00
June | GBP 540.00
July | GBP 701.00
August | GBP 588.00
September | GBP 455.00 | partial
~~~

~~~comparison | Due this week
What | Amount | Due
Streaming subscription | GBP 10.99 | 30 Sep
Phone contract | GBP 18.00 | 1 Oct
Rent | GBP 850.00 | 4 Oct
~~~

~~~board | Tickets
To do | Search filters | Omar
To do | Export to CSV | Lena
Doing | Onboarding emails | Maya
Review | Invite links | Lena
~~~`,
        /* Figures beside the chart, then the table beside the board, on the page's twelve columns. */
        layout: [
          { at: 0, cols: 4 },
          { at: 1, cols: 8 },
          { at: 2, cols: 6 },
          { at: 3, cols: 6 },
        ],
      },
      /* The first-party packs are `FIRST_PARTY` in `packages/seed/src/packs/first-party.ts`. */
      packsLine: 'Or start from a pack: Money, Work, Studies, People, Stripe, Mercury, Holdings and more.',
    },

    yours: {
      title: 'Your data stays yours.',
      body: [
        'Each record gets its own database. Export the whole thing as one file whenever you want, and ' +
          'if you leave, you take it with you.',
        'Every change is saved with who made it, whether that was you, a colleague, an agent or a rule, ' +
          'and any change can be undone. Agents and scripts use your API keys without ever seeing them.',
        'BrainDog is open source, so you can read exactly how all of this works.',
      ],
      source: 'See the code on GitHub',
    },

    plans: {
      title: 'Priced per record, not per person.',
      lead: 'Invite your whole team for free. Every plan includes Slash credits, and you can top up any time.',
      side: [
        { head: 'Need more Slash?', said: 'Top up with a credit pack. 100 credits are $5, and they never expire.' },
        { head: 'Colleagues are free', said: 'On both plans, with any level of access.' },
      ],
      more: 'Full pricing',
    },
  },

  closing: {
    title: 'Start your record.',
    body: 'Tell it who you are and what it is for. Slash sets up the first lists and pages, and you change whatever you like after that.',
    primary: 'Start your record',
    secondary: 'See the pricing',
  },
} as const;
