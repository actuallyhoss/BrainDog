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

  /**
   * THE SEARCH RESULT AND THE SHARED CARD, written for that job rather than borrowed from the page.
   *
   * All three descriptions were the longest paragraph the page already had. The home page's was 304
   * characters of hero body whose first four clauses are rhetorical questions, so a snippet cut at
   * about 155 never reached the sentence that says what BrainDog is, and the changelog's was 522
   * and cut mid-paragraph. These are about 150 characters and they answer the question a stranger
   * is actually asking. The home title carries the slogan because `og:site_name` is already the
   * bare brand, so a shared card read the name twice and then four questions.
   */
  meta: {
    home: {
      title: 'BrainDog · Give your business a memory',
      description:
        'Everything about your business that is not just code, in one typed, append-only database ' +
        'your agents can read and write.',
    },
    pricing: {
      title: 'Pricing · BrainDog',
      description:
        'Two ways to run BrainDog: hosted at $12 a month per record, or self-hosted for free under ' +
        'Apache-2.0. Neither plan is open yet.',
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
    source: 'Source',
    open: 'Open the app',
  },

  hero: {
    title: 'Give your business a memory',
    /**
     * THE FOUR THINGS WERE ALWAYS A LIST AND WERE SET AS A PARAGRAPH.
     *
     * Every word here is the word it was. What changed is the shape: on a phone at 390px the one
     * paragraph ran to eight lines between the headline and the button, and a reader met the
     * promise, then a wall, then the action. Four short sentences that are plainly four items of
     * one list were the middle six of those lines, and prose is the one setting in which a list
     * cannot be scanned.
     *
     * `lead` states the problem, `knows` is the evidence, `body` is what the product does about
     * it. Three beats, and only the middle one is long, which is the beat a reader is allowed to
     * skim.
     */
    lead: 'A company knows a great deal that never reaches its codebase.',
    knows: [
      'What it is owed and by whom.',
      'What renews on Tuesday.',
      'Which key opens which account.',
      'Who decided the thing nobody can remember deciding.',
    ],
    body:
      'BrainDog keeps all of it in one database instead: typed, append-only, and readable by ' +
      'every agent you use.',
    /* `Open the demo record` AND IT WAS `Start a record`, which started no record. This is the
       largest control on the site and it is drawn twice; the route it opens is the first-run
       screen, and the row somebody types there is marked `Not saved` and dropped with the tab,
       which `apps/web/src/lib/record/pending.svelte.ts` says in its own words. A verb the product
       cannot perform is the one defect a marketing page cannot carry. The pricing page and the
       changelog both already said there is no sign-up; the hero did not, and `note` is that
       sentence, under the hero's own pair of buttons. */
    primary: 'Open the demo record',
    secondary: 'Read the design',
    /** The second action while the design is not readable. `Changelog` is a bare noun, and a CTA is a verb plus a noun. */
    changelog: 'Read the changelog',
    note:
      'The app draws a synthetic record rather than yours. There is no sign-up and no billing, and ' +
      'nothing you type into it is kept.',
    caption: 'The record app. Cream in light, warm charcoal in dark, and the same palette generated for both.',
  },

  sections: {
    typed: {
      kicker: 'It is a database',
      title: 'Typed rows, not a pile of notes.',
      /* `money, services, people` AND IT WAS `obligations, domains, people`. This is the sentence
         that teaches a stranger the word register by example, and two of the three examples were
         wrong. There has never been a `domains` register: `domain` is one of four values of the
         `kind` field on `services`. And `obligations` is an id, which the interface has drawn as
         Money since `packages/seed/src/index.ts` renamed it. The id is still in the code block
         further down, because an id is what an agent writes and it has not changed. */
      /**
       * TWO PARAGRAPHS AND NOT ONE, AND EVERY WORD IS THE WORD IT WAS.
       *
       * The same change the hero got, for the same measured reason and applied to the eight
       * sections under it. At 390px a five-sentence body is nine or eleven unbroken lines between
       * a heading and a picture, and a reader meets a wall in the place the page is making its
       * argument. Each `body` is an array now, split only where the copy already had a full stop:
       * the FIRST entry is the claim, set a step larger, and the rest is the detail under it.
       *
       * The teaching sentence is intact inside entry one, in one text node, because
       * `test/content.test.ts` reads it back out of the served bytes and a tag inside it would
       * split it.
       */
      body: [
        'A register is a typed collection: money, services, people.',
        'It declares its fields and their types, and every row is checked against them on the way in.',
        'Money is an integer in minor units with its own currency, so two currencies can never be ' +
          'added by accident. A date is a date. A reference to another row is a reference, not a ' +
          'name someone retyped.',
      ],
      note: 'The grid is a CSS grid with declared column tracks, not a <table>, because at eight columns and five thousand rows table layout stops being free.',
      /**
       * THE FIRST DRAWING ON THIS SITE, AND IT IS THE ONE THING NO SCREENSHOT HERE SHOWS.
       *
       * Every picture on this page is a photograph of a surface. A grid shows you the VALUES; the
       * sentence above it is about the TYPES, and a type is not a thing a screenshot has ever
       * contained. So the claim *"it declares its fields and their types, and every row is checked
       * against them"* was the one argument on the page with no evidence beside it.
       *
       * NOTHING HERE IS INVENTED, and that is the whole reason it is safe to draw. The labels and
       * the types are `packages/seed/src/index.ts`'s `obligations` declaration, and the values are
       * item #4 of the same synthetic record the screenshot below is a photograph of, read off
       * that screenshot. `test/content.test.ts` checks the first half against the seed, the same
       * way it already checks the sentence that names three registers.
       *
       * The two reference fields are absent because their VALUES are not on the shipped shot and
       * this figure does not get to guess at data. The sentence about references is in the prose
       * above, where it always was.
       */
      figure: {
        register: 'Money',
        row: 'item #4',
        fields: [
          { label: 'Description', type: 'text', value: 'Corporation tax, payment on account' },
          { label: 'Which way', type: 'one of two', value: 'owed by me' },
          { label: 'Amount', type: 'money', value: 'GBP 19,100.00' },
          { label: 'Due', type: 'a date', value: '7 Sep 2026' },
          { label: 'Status', type: 'one of four', value: 'open' },
        ],
        caption: 'One row of the sample record, beside what the register says each of its fields may hold.',
      },
    },
    agents: {
      kicker: 'For your agents',
      title: 'They already know how to use it.',
      /* THE BODY SAID `The record is an MCP server`, in the present indicative, over a code block
         headed `# every session, over MCP`. The note below it withdrew the claim, and a reader who
         stops at the code block, which is what a code block is for, never reaches the note. The
         tense is in the body now, and the note says what the block is instead of repeating it. */
      body: [
        'The record speaks MCP.',
        'Sixteen typed tools are written and tested against it, and the transport that carries ' +
          'them is not connected yet, so no agent can reach a hosted record today.',
        'When it is connected an agent gets the same typed tools you get, scoped to one record, ' +
          'and every call it makes is in the audit log with the agent named. There is no scraping, ' +
          'no browser automation and no second copy of your data for the model to read.',
      ],
      /* Real tool names and real argument shapes, checked against `packages/mcp/src/index.ts`. Wrapped
         to fit a narrow column rather than scrolled sideways: a code block the reader has to drag is
         a code block nobody finishes. */
      code: [
        '# how an agent will call it.',
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
        'The code block is the specification those tools are written to, not an address you can ' +
        'point an agent at today. Connecting the transport is the next thing after the browser ' +
        'client.',
    },
    pages: {
      kicker: 'A page is a row',
      title: 'The screens are data too.',
      body: [
        'A page is a screen made of blocks, and a block is one thing on it: a table, a figure, a note.',
        'Which blocks, over which rows, in which order and how wide is all written down, and ' +
          'editing it is editing a row. So it versions and diffs like everything else, and a pack, ' +
          'which is a file that adds registers and pages, can ship a page the same way it ships a ' +
          'register.',
      ],
      note: 'Sixteen block kinds over eight primitives. A pack may invent a kind; it may never write a colour, a font or a spacing value.',
    },
    project: {
      kicker: 'Per project',
      title: 'A page that is about one thing.',
      body: [
        'Point every block on a page at one project and it stops being a dashboard and starts being ' +
          "that project's page: what is open on it, which of your agents are working on it right " +
          'now, what it is owed, what it costs to keep alive.',
        /* `Agent runs` AND NOT `Agent sessions`. The register was renamed in the app the same day
           the other three words on this page were, and this sentence was not in the list. */
        'Agent runs are a list like any other, so they draw like any other.',
      ],
      /* NOTHING ON THIS SITE RENDERS MARKDOWN, so a backtick in a string is a backtick on the page.
         This one also wrapped a filter written in a field label the screen has stopped using. */
      note: 'Nothing about it is a new kind of thing. It is the same blocks over the same registers, filtered to one project.',
    },
    tracks: {
      kicker: 'Keeping the thread',
      /* `thread` AND IT WAS `track`, in the title, in the body and in the note. The register is
         named Threads and the field on Agent runs is labelled Thread, both for the reason written
         at `packages/seed/src/index.ts`: a reader meets `track` cold and it reads as music or as
         shipping. The kicker on this section was already right and the definition sentence, which
         is where a stranger learns the word, was not. The id stays `tracks`, which is what the URL
         and a predicate say. */
      title: 'Pin an agent to a thread.',
      body: [
        'A thread is the line of work you are in the middle of.',
        'Pin a session to one and the context survives the session: close the window, come back on ' +
          'Tuesday, and what each agent was doing is there in order, next to the updates that say ' +
          'how it was going.',
      ],
      note:
        'Health is never a stored field. It is derived from the newest update, so it can always tell ' +
        'you who said so and when. And a finished thread expects no update, which is a different ' +
        'thing from one that is overdue.',
    },
    forecast: {
      kicker: 'What is coming',
      title: 'The day the money runs out, and what does it.',
      body: [
        'Start from what is liquid, apply every dated movement in order, and stop at the first day ' +
          'the balance goes under.',
        'Invoices in both directions, and every renewal a subscription will actually charge inside ' +
          'the window rather than the one date it stores.',
      ],
      note:
        'It names the row that crosses, not just the date. And the growth fit refuses to answer when ' +
        'the data cannot support one: six points of noise always produce a slope, and printing it is ' +
        'how a number gets quoted for a year.',
    },
    arrange: {
      kicker: 'Arrange it',
      title: 'Order and span. Nothing else.',
      /* `a page cannot set one of them` AND IT SAID `it is why you cannot make one of these pages
         ugly`. Rule one of this file is: say what it does, never sell it. Whether a page is ugly is
         not a thing the software decides and not a thing a reader can check, and what the software
         actually does was already in the same sentence. */
      body: [
        'Drag to reorder, or move with the keyboard. It is the same operation either way. Set a ' +
          'width in twelfths.',
        'That is the whole vocabulary: spacing, type, colour, radius and density all come from the ' +
          'theme, and a page cannot set one of them.',
      ],
      note: 'Each kind knows the narrowest it survives, and the control refuses below it rather than clamping. A table at a third of a page is not a narrow table, it is an unreadable one.',
    },
    vault: {
      kicker: 'Credentials',
      title: 'The vault indexes what a key opens. Never the key.',
      /* THE REVEAL WAS IN THE PRESENT TENSE AND NEITHER HOST CAN PERFORM IT. `openGrant` sits in
         `packages/host/src/index.ts`'s UNROUTED list on purpose, because neither host can yet tell
         a browser session from a bearer token, and the app's own Reveal button raises a toast
         saying the secret WOULD be decrypted. The other two claims are true today and are
         unchanged: the index excludes the ciphertext, and every token principal is refused. This
         was also the only capability section on the page carrying no note, and it was the section
         making the strongest promise. */
      body: [
        'A row records that the Fenwick deploy key exists, what it unlocks and when it was last rotated.',
        'The secret itself is encrypted under a separate envelope. Agents are refused the vault outright.',
      ],
      note:
        'Revealing a secret is written in the kernel and is routed by neither host yet, so nothing ' +
        'outside the record can decrypt one today. When it is routed, a secret is revealed once and ' +
        'every reveal is in the audit log with your name on it.',
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
      body: [
        'A record is one SQLite file, in the format every operating system has a free reader for.',
        'Export is one file with every row, the fields each register declared, and every event in ' +
          'it, not a CSV per table with the relationships thrown away. Self-hosting runs the same ' +
          'packages from the same file, so leaving is a copy rather than a migration.',
      ],
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
        /* `one record file` AND IT WAS `one file`. An installation writes three of them: the key
           file, the tenant map and the record itself, at `apps/selfhost/src/main.ts`. The RECORD is
           one file, which is what the `own` section says and is right; the installation is not. */
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
        /* THE DEFINITION MOVED UP TO THE FIRST USE. `pack` arrived in the `pages` section and was
           defined here, eight sections later, which is the rule this file states at the top of
           itself and then broke. */
        body: 'A pack is readable text, checked before installation, and nothing in it runs. That closes the whole class of supply-chain attack, and it means some things you might want a pack to do are things a pack cannot do.',
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
          /* THE FOOTER AND NOT THE HEADER. The page above it says there is no sign-up and no
             billing, and the two buttons in the hero open the demo: a sign-in control beside them
             would contradict the sentence a reader has just been given. Somebody who already has
             a record knows they have one and looks at the bottom of the page for the way in.

             A literal and not `${APP}/signin`, because `APP` is declared below `site` in this
             module and a template here reads it before it exists. */
          { label: 'Sign in', href: 'https://app.brain.dog/signin' },
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
