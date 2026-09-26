/**
 * Every sentence on brain.dog, in one file.
 *
 * WRITTEN FOR LAUNCH DAY. On 26 September the owner asked for a site that shows the product as it
 * will be when the finish is done, not where it stands today (`loop/DIRECTION.md` §33): "brandog is
 * not gonna be published anyways until everything is done". So every sentence here is in the present
 * tense about the finished product, and this copy is deployed with that product and not before it.
 * The sentences that said what a stranger could not have yet, and the tests that required them, went
 * the same day.
 *
 * THE VOICE, in five rules, and they still hold:
 *   - Say what it does. Never sell it, never adjective it, never "powerful" or "seamless".
 *   - A CTA is Verb + Noun. Never "Get Started", never "Learn More".
 *   - A number is a real number or it is absent. No "10x", no "up to".
 *   - Say the limits out loud. A page that lists only strengths is a page nobody believes twice.
 *   - NO EM DASHES, anywhere a person reads. Write two sentences, or use a colon.
 *
 * AND A SIXTH, THE OWNER'S OF 21 SEPTEMBER (`loop/DIRECTION.md` §19): a figure earns its place by
 * answering a question the reader was already asking. The home page counts none of the product's own
 * parts; `/agents` may, because a reader arrives there to ask exactly that. What a plan includes is the
 * reader's question on `/pricing`, and those figures live in `plans.ts`, not here.
 *
 * THE DRAWINGS ARE COPY TOO. Every name and figure in the drawn app, the decision scene and the Slash
 * palette is read off `packages/seed`, the record the gates install, so a reader who starts a Personal
 * record meets the same bills, balances and goals the page showed them.
 */

/**
 * The addresses, in one place. `APP` is the app, served on this site's own name (`wrangler.jsonc`);
 * every link to it carries `rel="external"` so the prerender crawler leaves it alone.
 */
export const APP = '/app';
export const SIGNUP = `${APP}/signup`;
export const SOURCE: string | null = 'https://github.com/actuallyhoss/BrainDog';
export const DOCS: string | null = null;
/** The build instructions, which is what a self-hoster is actually sent to. */
export const BUILD: string | null = null;
/** Where an MCP client connects: `servesMcp` in `apps/worker/src/route.ts`, with OAuth from AGT-3. */
export const MCP_URL = 'https://brain.dog/mcp';
/** The command line's install line, as `apps/cli/README.md` gives it. */
export const CLI_INSTALL = 'curl -fsSL https://brain.dog/cli/install.sh | sh';

export const site = {
  product: 'BrainDog',
  /** The slogan. It is the README's headline, unchanged, and it takes no full stop. */
  tagline: 'Give your business a memory',

  /** The search result and the shared card, about 150 characters each. */
  meta: {
    home: {
      title: 'BrainDog · Give your business a memory',
      description:
        'One record for everything you keep track of, arranged around you. You, Slash and your AI ' +
        'agents keep it current, and every change says who made it.',
    },
    slash: {
      title: 'Slash · BrainDog',
      description:
        'Slash is the assistant inside every BrainDog record. It answers from your own lists, drafts ' +
        'what you describe, and writes nothing until you accept it.',
    },
    pricing: {
      title: 'Pricing · BrainDog',
      description:
        'From $12 a month per record, with Slash credits included. Colleagues are free on ' +
        'every plan, and extra usage is off until you turn it on.',
    },
    agents: {
      title: 'For agents · BrainDog',
      description:
        'Connect Claude, Codex, Cursor or any MCP client to your record by URL: what an agent reads, ' +
        'what it writes, and what only a person can do.',
    },
    notFound: {
      title: 'Page not found · BrainDog',
      description: 'There is no page at this address on brain.dog.',
    },
    legal: {
      title: 'Legal · BrainDog',
      description: 'The licence BrainDog is published under, and its Terms of Service and Privacy Policy.',
    },
    changelog: {
      title: 'Changelog · BrainDog',
      description: "What shipped in BrainDog and when, in the repository's own words.",
    },
  },

  nav: {
    slash: 'Slash',
    pricing: 'Pricing',
    agents: 'For agents',
    changelog: 'Changelog',
    docs: 'Design',
    source: 'GitHub',
    open: 'Open the app',
    signin: 'Sign in',
    start: 'Start your record',
    menu: 'Menu',
  },

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
   * THE DECISION, which the home page draws as a scene rather than as a table of rows. It replaced
   * the ledger on 2026-09-22, and the ledger's argument is the scene's last beat rather than gone.
   *
   * WHY THE TABLE WENT. `loop/research-site-now.md` read the mechanism band as a table of record ids under a
   * paragraph about registers: `tasks#12`, `obligations#1`, `services#6`, five rows of the record's
   * own addresses shown to a stranger who has no record. And it found the one thing BrainDog does
   * that no other product page can show was on this page only as two names in a `who` column: an
   * agent proposes, a person decides, and the change lands carrying the agent's name. That is the
   * app's `decide` screen, and `agents.cannot` states the rule under it (*no token reaches it. A
   * person has to do it, signed in*).
   *
   * EVERY WORD IS THE SEED'S OR THE FIXTURE LEDGER'S, and there is one liberty, named here. `SG33`
   * in `packages/seed/src/index.ts` asks *Add the two services on the Fenwick invoice?*, recommends
   * *Add both* with this `change` as its body, and is decided by you; the fixture ledger in
   * `apps/web/src/lib/record/fixtures/sample.ts` follows it with Claude creating `services#6` and
   * `services#7`, three hours before its clock. THE LIBERTY: in the seed the question is opened by the record's own
   * reader of the arriving invoice, not by Claude. An agent proposing over MCP is real (`propose` is
   * one of the six writes `agents.mcp.writes` lists), so the scene draws a thing the product does,
   * compressed into one agent where the seed has two actors.
   *
   * `history` IS OLDEST FIRST, and its LAST ROW IS THE LANDING POINT: the scene ends when Claude's
   * row arrives under the two that were already there, which is the ledger's append-only thesis kept
   * in one row instead of five. The two earlier rows are the ledger's own, with their ids taken out:
   * `test/content.test.ts` now fails if a `register#n` address reaches a stranger again.
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
      /* THE TIMES ARE `sample.ts`'s AND NOT THE OLD LEDGER'S. It said `2d ago` and `14h ago`; the
         rows it was quoting are `seq 4160` at `stamp(-31)` and `seq 4188` at `stamp(-9)`, and
         `stamp` counts hours (`packages/seed/src/modules/base.ts:104`). Named, never numbered. */
      { who: 'Codex', what: 'Opened a question about the Kiln licensing model', when: '1d ago' },
      /* `seq 4188` in `sample.ts`, at `stamp(-9)`, and it is `by: 'rule.reply'`, not the late-invoice
         rule. This row credited it to *Chase late payments*, the name `names.ts` gives
         `invoice-late`, which wrote no row in the fixture ledger at all. `reply` is in no
         `RULE_NAMES` entry, so the app draws it through `actorOf`'s fallback as `reply rule`, and
         that is the name the app puts on this row. The note it added reads
         *Chased twice. 45-day terms expired 3 August.* on `obligations#1`. */
      { who: 'reply rule', what: 'Added a note to an invoice that is late', when: '9h ago' },
      /* `seq 4192` and `4191` in `sample.ts`: Object storage and the Workers plan, each `from the
         Fenwick invoice`. THE TIME IS NOT THE LEDGER'S `stamp(-3)`, AND THAT IS DELIBERATE. This row
         lands the moment the reader presses Accept, and it said `3h ago` while doing so: a row
         written a second ago under a time three hours old. The app's word for a row under a minute
         old is `just now` (`packages/render/src/format.ts`, `since`), and `decide-copy.test.ts`
         reads the word from `since` so the two cannot drift. The two rows above keep `sample.ts`'s
         times, because they were already there when the reader arrived. */
      { who: 'Claude', what: 'Added Object storage and the Workers plan, from the Fenwick invoice', when: 'just now' },
    ],
  },

  /**
   * THE DRAWN APP, and it sits across the bottom edge of the hero because it is the product. On 22
   * September the owner asked for the screenshots to go and for this drawing to take their place,
   * overlapping the hero, with the records inside it pressable. Pressing a case redraws the window
   * in front of the reader, and pressing a list, a row, Decide or Automations inside it opens that
   * page of the drawn app, so the claim is made by the page doing the thing rather than by a
   * sentence about it: their money, their studies, their companies, their team, their new project.
   *
   * `id` is what the switcher tracks and what /start calls the setup. `holds` is the pages and the
   * lists that setup ships, each under the name the record itself gives it, so a reader can check
   * this list against the screen they get after Make my record.
   *
   * `tag` IS THE WORD IN THE BAND'S OPENER, and it lives here rather than in the page for the
   * reason at the top of this file: it is a word a stranger reads. All four were literals inside
   * `+page.svelte` until 2026-09-21, which meant the em-dash scan over this file could not see
   * them and nobody editing copy would have found them.
   *
   * `glyph` AND `tiles` ARE WHAT MAKE THE SWITCHER A PICTURE RATHER THAN A LIST OF NOUNS.
   * `loop/research-site-now.md` ranks it first of five: the rail drew a grey square where the app
   * draws a glyph, and a box of nouns beside grey squares was the most text-like thing on the first
   * screen after the headline. `glyph` is a Lucide name `lib/icons.ts` draws. `tiles` are two or
   * three of what that record's home would show on its first day, every value read off the example
   * rows the use case installs (`packages/seed/src/usecases/*.ts`, `seeds` and `FOUNDER_EXAMPLES`),
   * with the day arithmetic done the way `install.ts` does it: a `+3d` row is due in three days on
   * whichever day somebody starts. None of them counts the product's own parts. A tile that said how
   * many pages a setup ships would be the stat §19 named, drawn in a box.
   */
  arrange: {
    tag: 'Yours',
    title: 'Arranged for you. Made of parts.',
    /* THE TWO STRINGS THE SWITCHER ITSELF SAYS, here rather than defaulted inside the component,
       because every word a stranger reads on this site is in this file and a default in a
       component is a word nobody edits. `head` is the line above the drawn rail, where the real
       application says Switch record; `label` is what a screen reader calls the switcher. */
    head: 'Your record',
    label: 'What your record is for',
    /* THE LINE UNDER THE WINDOW THAT SAYS IT CAN BE PRESSED. A drawing of an app looks like a
       picture of one, and a picture is not something anybody tries to click. */
    hint: 'Pick who it is for, then open a list, a row or a question.',
    /**
     * THE WORDS THE DRAWN APP ITSELF SAYS, each one the app's own for the same place.
     *
     * `decide`, `automations`, `accept` and `reject` are the rail entry, the page titles and the two
     * buttons `apps/web` draws (`lib/copy.ts`, and the Decide screen's Accept and Reject).
     * `noQuestions` is `copy.noQuestions` and `noRules` is `flow.none`, the two empty states;
     * `notRun` is `flow.neverRun`, which is true of every rule in a record made today; `inline` is
     * `flow.inline`, which is how every rule below runs; `starts` and `only` are `flow.trigger` and
     * `flow.condition`. `accepted` is the scene's own word further down this file.
     */
    app: {
      decide: 'Decide',
      automations: 'Automations',
      toDecide: (n: number) => `${n} to decide`,
      noQuestions: 'Nothing waits on you',
      noRules: 'Nothing runs on its own yet',
      notRun: 'Not run yet.',
      inline: 'Runs inside the change that starts it.',
      starts: 'Starts',
      only: 'Only when',
      then: 'Then',
      from: 'From',
      opened: 'opened just now',
      accept: 'Accept',
      reject: 'Reject',
      accepted: 'Accepted by you',
      rejected: 'Rejected by you',
      /* What a screen reader calls the drawn window and its rail, and the back link's first word. */
      window: 'A drawing of the app',
      rail: 'Pages and lists',
      back: 'Back to',
    },
    lead:
      'Say what your record is for. The pages, the lists and the words follow. Underneath, every ' +
      'part can be changed or turned off.',
    /**
     * WHO DRAFTS THE ARRANGEMENT, AND THAT NOTHING LANDS UNTIL THE OWNER SAYS SO.
     *
     * It said a model drafts it only once you configure one, and that no host configures one by
     * default, which went false on 24 September (`loop/DIRECTION.md` §24): production sets `SLASH_INCLUDED` to
     * `yes`, so the Cloud answers Slash with the included model without anybody configuring one
     * (`apps/worker/src/slash.ts`, `includedInference`). `src/lib/claims.test.ts` now fails if a
     * sentence here says there is no model while production includes one.
     *
     * The first sentence rests on `packages/record/src/slash.ts`, which drafts from what the owner
     * describes and writes nothing itself, and on `packages/record/src/arrange.ts`, whose question
     * changes nothing until the owner accepts it. It names no model, so it stays true on a host
     * with none, where Slash's rules draft instead.
     */
    note:
      'Slash drafts the arrangement from what you say, and nothing is written until you accept it. ' +
      'Any module can be turned off afterwards, People included.',
    cases: [
      {
        id: 'personal',
        /* `Money` WAS IN THIS LIST BESIDE `Bills`, AND THEY ARE ONE REGISTER.
           `packages/seed/src/usecases/personal.ts:160` renames `obligations` to `Bills` for this
           setup, and `personal.ts:6` gives the reason in the file itself: a person's words, so
           "Bills" and not "Money". A personal record never shows a page or a list called Money;
           the word survives only as a heading in the rail, which is not what `holds` lists. */
        label: 'Personal',
        glyph: 'house',
        /* The two groceries rows in the seeded week (6,420 and 2,135 pence) against the 30,000 the
           groceries budget allows, the two `PUT_BY` rows toward Lisbon (20,000 and 22,000) against
           its 90,000 target, and the first of the habits, all in `personal.ts` `seeds`. THE LISBON
           TILE SAID `GBP 900.00, saving towards it`, which is the target drawn where the groceries
           tile beside it draws the amount so far: a reader of the pair takes 900 as saved, and the
           seed has put 420 by.
           THE GROCERIES FIGURE IS THE HOME FROM A MONTH'S THIRD DAY, NOT FROM ITS FIRST. The
           6,420 shop is dated two days back, so on the 1st and 2nd it falls in the month before and
           the Home counts only the 2,135 one. Measured by making the Personal record the way
           `packages/seed/test/usecase-install.test.ts` does, at noon UTC on 1, 2 and 3 October 2026,
           and reading "Spending against your budget": 2135 (1 row), 2135 (1 row), 8555 (2 rows).
           The seed's own test pins 3 September for the same reason. The other way to make the tile
           true every day is to move the Weekly shop to `0d` in `personal.ts`, which changes every
           new Personal record and that test's figures, and is more than a site sentence should move
           (`loop/research-bundle-reads.md` brief S2). */
        tiles: [
          { title: 'Groceries', value: 'GBP 85.55', note: 'of GBP 300.00 budgeted' },
          { title: 'Trip to Lisbon', value: 'GBP 420.00', note: 'of GBP 900.00 put by' },
          { title: 'Run three times a week', value: 'A habit', note: 'logged as you go' },
        ],
        /* HOME'S TABLE UNDER ITS TILES, as `home-personal` in `personal.ts` draws one: `Bills due this
           week`, which on a record made today is the three bills due inside seven days. `rows` are
           indexes into the list it names, so every row here is one Bills already opens. */
        soon: { heading: 'Bills due this week', list: 'Bills', rows: [0, 1, 2] },
        /**
         * THE LISTS THAT OPEN, THE QUESTION AND THE RULES. The rows are `PERSONAL_EXAMPLES` in
         * `personal.ts`, all eight bills and all three accounts, with the days counted the way
         * `install.ts` counts them. A row's page draws its cells under the list's column names and
         * then the fields listed with it, each one a field the seed row carries.
         *
         * THE QUESTION IS THE ONE LIBERTY, and it is the same one `decide` below names: a record
         * made today holds no question, and this is one an agent could put over MCP (`propose`),
         * about rows that are really there. The Lisbon goal and the GBP 420.00 put by toward it are
         * the `seeds`' own.
         *
         * THE RULES ARE THREE OF THE SEVEN THE SETUP INSTALLS, the three over lists this rail names,
         * with their names from `RULE_NAMES` and their conditions (`MONEY_RULES`, `PORTFOLIO_RULES`)
         * said in words. A rule's `suggest` is a question on Decide, which is what `then` says.
         */
        lists: [
          {
            name: 'Bills',
            columns: ['What', 'Amount', 'Due'],
            rows: [
              { cells: ['Streaming subscription', 'GBP 10.99', 'In 2 days'], fields: [['Repeats', 'Monthly']] },
              { cells: ['Phone contract', 'GBP 18.00', 'In 3 days'], fields: [['Repeats', 'Monthly']] },
              { cells: ['Rent', 'GBP 850.00', 'In 6 days'], fields: [['Repeats', 'Monthly']] },
              { cells: ['Pay day', 'GBP 2,450.00', 'In 10 days'], fields: [['Repeats', 'Monthly'], ['Direction', 'Owed to you']] },
              { cells: ['Gym membership', 'GBP 32.00', 'In 12 days'], fields: [['Repeats', 'Monthly']] },
              { cells: ['Energy bill', 'GBP 96.00', 'In 18 days'], fields: [['Repeats', 'Monthly']] },
              { cells: ['Contents insurance', 'GBP 8.50', 'In 21 days'], fields: [['Repeats', 'Monthly']] },
              { cells: ['Council tax', 'GBP 142.00', 'In 25 days'], fields: [['Repeats', 'Monthly']] },
            ],
          },
          {
            name: 'Accounts',
            columns: ['Account', 'Balance', 'As of'],
            rows: [
              { cells: ['Current account', 'GBP 1,240.56', 'Today'], fields: [['Kind', 'Bank']] },
              { cells: ['Savings account', 'GBP 2,420.00', '2 days ago'], fields: [['Kind', 'Bank']] },
              { cells: ['Credit card', 'GBP -186.40', 'Yesterday'], fields: [['Kind', 'Card']] },
            ],
          },
        ],
        questions: [
          {
            from: 'Claude',
            question: 'Put GBP 50.00 by toward the Trip to Lisbon?',
            change: 'A new row in Put by. GBP 420.00 of the GBP 900.00 is put by so far.',
          },
        ],
        rules: [
          {
            name: 'Keep balances current',
            starts: 'When a row in Accounts is added or changed',
            only: 'Its balance was last set more than a week ago',
            then: 'Asks you on Decide to update it, once for each account and date',
          },
          {
            name: 'Chase late payments',
            starts: 'When a row in Bills is added or changed',
            only: 'It is owed to you, still open, and more than a week past due',
            then: 'Asks you on Decide whether to chase it',
          },
          {
            name: 'Ask about a missed day',
            starts: 'When a row in Projects is added or changed',
            only: 'It is still in play and the day it aimed for has passed',
            then: 'Asks you on Decide to move the day or park it',
          },
        ],
        holds: [
          'Day to day',
          'Spending',
          'Goals',
          'Bills',
          'Accounts',
          'Budget',
          'Savings goals',
          'Log',
          'Put by',
          'Projects',
        ],
      },
      {
        id: 'student',
        label: 'Student',
        glyph: 'graduation-cap',
        tiles: [
          { title: 'Problem set 1: probability', value: 'Due in 3 days', note: 'Introduction to statistics' },
          { title: 'Study session tomorrow', value: '90 minutes', note: 'Conditional probability' },
        ],
        /* `home-student`'s `Study sessions` table: the one session, tomorrow, inside its eight days. */
        soon: { heading: 'Study sessions', list: 'Study sessions', rows: [0] },
        /* `student.ts` `seeds`: one course, one assignment, one study session, each list with its one
           row. The setup installs no module, so it has no rule, and Automations says so in the app's
           own words. The question is the liberty `decide` names, about the assignment that is there. */
        lists: [
          {
            name: 'Assignments',
            columns: ['Assignment', 'State', 'Due'],
            rows: [{ cells: ['Problem set 1: probability', 'Doing', 'In 3 days'], fields: [['Course', 'Introduction to statistics']] }],
          },
          {
            name: 'Courses',
            columns: ['Course', 'Term', 'Teacher'],
            rows: [{ cells: ['Introduction to statistics', 'Autumn', 'Dr Adeyemi'] }],
          },
          {
            name: 'Study sessions',
            columns: ['Session', 'On', 'Minutes'],
            rows: [{ cells: ['Go over the lecture on conditional probability', 'Tomorrow', '90'], fields: [['Done', 'Not yet']] }],
          },
        ],
        questions: [
          {
            from: 'Claude',
            question: 'Add a study session for Problem set 1?',
            change: 'Sixty minutes on the problem set, the day before it is due.',
          },
        ],
        rules: [],
        holds: ['Today', 'Studies', 'Courses', 'Assignments', 'Study sessions'],
      },
      {
        id: 'founder',
        label: 'Solo founder',
        glyph: 'wallet',
        /* `FOUNDER_EXAMPLES` in `founder.ts`: the current account at 2,480,000 pence, the hosting bill
           at 32,000 due `+9d`, and the one datapoint the setup seeds, reported `-1d`. */
        tiles: [
          { title: 'Northwind current account', value: 'GBP 24,800.00' },
          { title: 'Monthly recurring revenue', value: 'GBP 4,200', note: 'reported yesterday' },
          { title: 'Cloud hosting', value: 'GBP 320.00', note: 'due in 9 days' },
        ],
        /* `home-founder`'s `Latest numbers` table, which is the one figure reported so far. */
        soon: { heading: 'Latest numbers', list: 'Datapoints', rows: [0] },
        /* `FOUNDER_EXAMPLES` and the pack's `seeds`, one row a list, as the setup gives them. The
           question is the liberty `decide` names, about the hosting bill that is there; the rules are
           three of the seven the setup installs, as Personal's are. */
        lists: [
          {
            name: 'Money',
            columns: ['What', 'Amount', 'Due'],
            rows: [{ cells: ['Cloud hosting, Northwind app', 'GBP 320.00', 'In 9 days'], fields: [['Repeats', 'Monthly']] }],
          },
          {
            name: 'Datapoints',
            columns: ['Measure', 'Value', 'At'],
            rows: [{ cells: ['Monthly recurring revenue', 'GBP 4,200', 'Yesterday'], fields: [['Source', 'Example']] }],
          },
          {
            name: 'Organisations',
            columns: ['Name', 'Kind', 'Country'],
            rows: [{ cells: ['Northwind Labs Ltd', 'Company', 'United Kingdom'], fields: [['Currency', 'GBP']] }],
          },
          {
            name: 'Tasks',
            columns: ['Task', 'State', 'By'],
            rows: [{ cells: ['Write the pricing page copy', 'Open', 'In 4 days'] }],
          },
        ],
        questions: [
          {
            from: 'Claude',
            question: 'Add a task to check the hosting bill before it is paid?',
            change: 'Cloud hosting, Northwind app, GBP 320.00, due in 9 days.',
          },
        ],
        rules: [
          {
            name: 'Chase late payments',
            starts: 'When a row in Money is added or changed',
            only: 'It is owed to you, still open, and more than a week past due',
            then: 'Asks you on Decide whether to chase it',
          },
          {
            name: 'Keep balances current',
            starts: 'When a row in Accounts is added or changed',
            only: 'Its balance was last set more than a week ago',
            then: 'Asks you on Decide to update it, once for each account and date',
          },
          {
            name: 'Ask about a missed day',
            starts: 'When a row in Projects is added or changed',
            only: 'It is still in play and the day it aimed for has passed',
            then: 'Asks you on Decide to move the day or park it',
          },
        ],
        holds: ['Overview', 'Dashboard', 'Organisations', 'Datapoints', 'Money', 'Projects', 'People', 'Tasks'],
      },
      {
        id: 'team',
        /* `Work` WAS A NAV SECTION AND NOT A PAGE. `packages/seed/src/modules/work.ts:426` and
           `:538` put two pages under a section called Work, and they are titled Overview and
           Board. `holds` lists what a reader will actually see named on a page or a list. */
        label: 'Team',
        glyph: 'users',
        /* `team.ts` `seeds`: one active cycle, and four planned tickets at 2, 1, 3 and 5 points. */
        tiles: [
          { title: 'Cycle 1', value: 'Active', note: 'Ship the first version of the board' },
          { title: 'Cycle plan', value: '11 points', note: 'across four tickets' },
        ],
        /* `home-team`'s `Due this week`, which leaves out what is doing, in review or blocked: of the six
           tickets that is only the one about the next cycle, due in three days. */
        soon: { heading: 'Due this week', list: 'Tickets', rows: [1] },
        /* `TEAM_EXAMPLES` for the six tickets, with each one's state, priority and agent, and the
           pack's `seeds` for the four planned ones. Claude is the agent the seed names on three of
           them, so the question is Claude's too, about the ticket the seed leaves in review. Portfolio
           brings `project-past-aim`, the one rule this setup carries. */
        lists: [
          {
            name: 'Tickets',
            columns: ['Ticket', 'State', 'Priority'],
            rows: [
              { cells: ['Write the release notes', 'In progress', 'Normal'], fields: [['Agent', 'Claude']] },
              { cells: ['Agree what goes in the next cycle', 'To do', 'High'], fields: [['By', 'In 3 days']] },
              { cells: ['Fix the sign-in link that expires too soon', 'In review', 'Urgent'], fields: [['Agent', 'Claude']] },
              { cells: ['Wait on the design for the settings screen', 'Blocked', 'Normal'], fields: [['By', 'In 5 days']] },
              { cells: ['Tidy the backlog labels', 'Done', 'Low'], fields: [['Agent', 'Claude']] },
              { cells: ['Let a teammate export the board as a spreadsheet', 'Backlog', 'Low'] },
            ],
          },
          {
            name: 'Cycle plan',
            columns: ['Ticket', 'Points'],
            rows: [
              { cells: ['Write the release notes', '2'], fields: [['Cycle', 'Cycle 1']] },
              { cells: ['Agree what goes in the next cycle', '1'], fields: [['Cycle', 'Cycle 1']] },
              { cells: ['Fix the sign-in link that expires too soon', '3'], fields: [['Cycle', 'Cycle 1']] },
              { cells: ['Wait on the design for the settings screen', '5'], fields: [['Cycle', 'Cycle 1']] },
            ],
          },
        ],
        questions: [
          {
            from: 'Claude',
            question: 'Move “Fix the sign-in link that expires too soon” to Done?',
            change: 'The fix is written, and it is waiting in review.',
          },
        ],
        rules: [
          {
            name: 'Ask about a missed day',
            starts: 'When a row in Projects is added or changed',
            only: 'It is still in play and the day it aimed for has passed',
            then: 'Asks you on Decide to move the day or park it',
          },
        ],
        holds: ['Team', 'Cycles', 'Agent work', 'Board', 'Tickets', 'Cycle plan', 'Teammates'],
      },
      {
        id: 'guide',
        label: 'New project',
        glyph: 'rocket',
        tiles: [
          { title: 'Say what it is and who it is for', value: 'Underway', note: 'the first milestone' },
          { title: 'What will it be called?', value: 'Open', note: 'a choice to make' },
          { title: 'Next step', value: 'In 2 days', note: 'Write one sentence about what this is' },
        ],
        /* `home-guide`'s `Your next steps`, the three steps in order. */
        soon: { heading: 'Your next steps', list: 'Steps', rows: [0, 1, 2] },
        /* `guide.ts` `seeds`: the six milestones in order with their stage and state, the three
           steps and the one choice. No module, so no rule. The question is the liberty `decide`
           names, about the choice that is open. */
        lists: [
          {
            name: 'Milestones',
            columns: ['Milestone', 'Stage', 'State'],
            rows: [
              { cells: ['Say what it is and who it is for', 'Idea', 'Underway'] },
              { cells: ['Find the people who want it', 'Idea', 'Not started'] },
              { cells: ['Plan the smallest first version', 'Plan', 'Not started'] },
              { cells: ['Make the first version', 'Build', 'Not started'] },
              { cells: ['Share it with the first people', 'Launch', 'Not started'] },
              { cells: ['Keep it going and learn from it', 'Grow', 'Not started'] },
            ],
          },
          {
            name: 'Steps',
            columns: ['Step', 'State', 'By'],
            rows: [
              { cells: ['Write one sentence about what this is and who it is for', 'To do', 'In 2 days'] },
              { cells: ['Name three people who would use it', 'To do', 'In 5 days'] },
              { cells: ['Ask one of them what they would want first', 'To do', 'In 9 days'] },
            ],
          },
          {
            name: 'Choices',
            columns: ['Question', 'State'],
            rows: [{ cells: ['What will it be called?', 'To make'] }],
          },
        ],
        questions: [
          {
            from: 'Claude',
            question: 'Add a step to write down five names?',
            change: 'For the open choice, “What will it be called?”, by the end of the week.',
          },
        ],
        rules: [],
        holds: ['Your project', 'Guide', 'Milestones', 'Steps', 'Choices', 'Resources'],
      },
    ],
  },


  /**
   * THE HOME PAGE UNDER THE HERO, rebuilt on 26 September because the owner called what was there
   * "pure AI slop" (`loop/DIRECTION.md` §33). Each band shows one thing the product does, drawn
   * working, with a heading that says what the reader gets and one sentence under it. No band opens
   * on an eyebrow and a rule, and none is a list of three hedged columns.
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
     * THE BLOCKS, DRAWN AS A PAGE. Five of the kinds a page is made of, each over rows the Personal and
     * Team records really have: the Lisbon goal (GBP 420.00 of 900.00), the week's three bills, the
     * team's tickets by state, and a thirty-day cash figure worked from the three accounts and every
     * bill and the pay day due inside a month (3,474.16 less 1,157.49 plus 2,450.00).
     */
    pages: {
      title: 'Make the pages you actually check.',
      lead:
        'Put figures, charts, boards, calendars and tables on a page, all reading from your lists. ' +
        'Drag them around yourself, or tell Slash what you want to see.',
      cash: { title: 'Cash in 30 days', value: 'GBP 4,766.67', note: 'after bills and pay day' },
      goal: { title: 'Trip to Lisbon', value: 'GBP 420.00', of: 'of GBP 900.00', pct: 47 },
      spend: {
        title: 'Spending by month',
        bars: [
          ['Jun', 612],
          ['Jul', 540],
          ['Aug', 701],
          ['Sep', 588],
          ['Oct', 455],
        ] as [string, number][],
      },
      week: {
        title: 'Due this week',
        days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        items: [
          { day: 1, what: 'Streaming subscription', amount: 'GBP 10.99' },
          { day: 2, what: 'Phone contract', amount: 'GBP 18.00' },
          { day: 5, what: 'Rent', amount: 'GBP 850.00' },
        ],
      },
      board: {
        title: 'Tickets',
        columns: [
          { name: 'To do', cards: ['Agree what goes in the next cycle'] },
          { name: 'In progress', cards: ['Write the release notes'] },
          { name: 'In review', cards: ['Fix the sign-in link that expires too soon'] },
        ],
      },
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

  /**
   * THE SLASH PAGE, which the owner asked for on 26 September. Everything it says Slash does is in
   * `packages/record/src/slash.ts` and `packages/slash`, and the limits are the product's: drafts are
   * questions in Decide (`arrange.ts`), the vault is closed to it, it is quiet on a record younger than
   * two weeks (`YOUNG_DAYS`, decisions C71), and background work has its own allowance (contracts X41).
   */
  slash: {
    title: 'Slash',
    sub:
      'The assistant built into every record. Press / anywhere to ask a question, have it build a page ' +
      'or a rule, or see what needs you today. Nothing it writes goes in until you say yes.',
    primary: 'Start your record',
    secondary: 'How credits work',
    /** The palette the page and the home page draw. Every figure is the Personal record's. */
    demo: {
      label: 'Slash, drawn',
      placeholder: 'Ask, or say what you want',
      accept: 'Accept',
      reject: 'Reject',
      modes: [
        {
          id: 'ask',
          label: 'Ask',
          prompt: 'What do I owe in the next two weeks?',
          lead: 'GBP 910.99, across four bills.',
          rows: [
            ['Streaming subscription', 'GBP 10.99', 'In 2 days'],
            ['Phone contract', 'GBP 18.00', 'In 3 days'],
            ['Rent', 'GBP 850.00', 'In 6 days'],
            ['Gym membership', 'GBP 32.00', 'In 12 days'],
          ],
          source: 'From Bills',
        },
        {
          id: 'draft',
          label: 'Draft',
          prompt: 'Make me a page for the Lisbon trip',
          lead: 'A new page, Trip to Lisbon, with three blocks:',
          rows: [
            ['A figure', 'GBP 420.00 of GBP 900.00 put by', ''],
            ['A list', 'Every row in Put by for the trip', ''],
            ['A chart', 'What was put by, month by month', ''],
          ],
          source: 'Waits in Decide until you accept it',
        },
        {
          id: 'notice',
          label: 'Notice',
          prompt: 'This morning',
          lead: 'Rent is due in 6 days, and pay day is in 10.',
          rows: [
            ['Current account', 'GBP 1,240.56', 'Today'],
            ['Rent', 'GBP 850.00', 'In 6 days'],
          ],
          source: 'Your current account covers it',
        },
      ],
    },
    abilities: [
      {
        id: 'ask',
        title: 'Ask',
        lead:
          'Ask the way you would ask a person. The answer comes from your own lists, says which one, and ' +
          'you can click a number to see the rows behind it.',
        examples: ['What do I owe in the next two weeks?', 'Which clients are late, and by how much?', 'How much went on hosting this year?'],
      },
      {
        id: 'draft',
        title: 'Draft',
        lead:
          'Describe a page, a list, a rule or an edit. Slash puts together a draft and shows you exactly ' +
          'what it would change. You accept it, tweak it, or throw it away.',
        examples: ['Make me a page for the Lisbon trip', 'Add a field for the invoice number', 'Ask me when a bill is a week late'],
      },
      {
        id: 'notice',
        title: 'Notice',
        lead:
          'Once a day Slash looks over the record and flags what is due, what changed and what looks off. ' +
          'It shows up on Home and in your daily email, and on a quiet day there is nothing.',
        examples: ['Rent is due before pay day', 'A card bill is higher than usual', 'Three tickets have waited a week in review'],
      },
      {
        id: 'learn',
        title: 'Learn',
        lead:
          'Forward a few emails of the same kind and Slash works out how to file them. Once you approve ' +
          'that, every one after is filed automatically, and it costs no credits.',
        examples: ['Card alerts into Spending', 'Invoices into Money', 'A skill that learned your filing rules'],
      },
    ],
    rulesTitle: 'Ground rules',
    rules: [
      { head: 'You approve every change', said: 'Anything Slash wants to add or edit waits in Decide until you accept it.' },
      { head: 'It can’t see your keys', said: 'Saved API keys and passwords are off limits. It only knows their names.' },
      { head: 'The daily check is free', said: 'Flagging what is due, writing your daily email and learning how to file things never use your credits.' },
      { head: 'It waits before flagging things', said: 'On a new record it stays quiet for the first two weeks, until there is enough history to go on.' },
    ],
    allowance: {
      title: 'How credits work',
      lead: 'Each question or draft uses one credit, no matter how long the answer takes. Every plan comes with a monthly amount, and you can top up with a pack if you run out.',
      credits: 'credits a month',
      packs: 'Credit packs',
      packsN: (credits: number) => `+${credits.toLocaleString('en-US')}`,
      packsUnit: (packs: readonly { credits: number; price: string }[]) =>
        `credits for ${packs[0]?.price}` +
        packs.slice(1).map((p) => `, or ${p.credits.toLocaleString('en-US')} for ${p.price}`).join('') +
        ', and they never expire',
      more: 'See pricing',
    },
    closeTitle: 'Try it on your own record.',
    closeBody: 'Slash is included on every plan from day one.',
  },

  pricing: {
    title: 'Pricing',
    sub: 'You pay per record, by the month. Invite as many people as you like, it costs the same.',
    included: 'Included each month',
    popular: 'Most popular',
    usageTitle: 'Compare plans',
    usageLead: 'Allowances reset on the first of each month. People, pages, lists and history are never counted.',
    rows: [
      ['People', 'Unlimited', 'Unlimited'],
      ['Database', 'Your own, not shared', 'Your own, not shared'],
      ['Backups', 'Nightly, last 30 kept', 'Nightly, last 30 kept'],
      ['Email and webhook inbox', 'Included', 'Included'],
      ['Export', 'Any time, as one file', 'Any time, as one file'],
    ] as [string, string, string][],
    extraTitle: 'Need more?',
    packsTitle: 'Slash credit packs',
    packsLead: 'Used after your monthly credits run out. They never expire.',
    packsPer: (credits: number) => `${credits.toLocaleString('en-US')} credits`,
    extraUsageTitle: 'Extra usage',
    extraLead:
      'Off by default. Turn it on and set a monthly cap, and you are never charged past it. With it off, ' +
      'anything over your plan waits until next month.',
    faqTitle: 'Questions',
    faq: [
      {
        q: 'What is a record?',
        a: 'Everything one person, family or company keeps track of: its lists, pages, rules and history, in one file. Most people need one. A second business is a second record.',
      },
      {
        q: 'Are colleagues really free?',
        a: 'Yes. Invite as many people as you need, with any level of access. The price is per record, not per person.',
      },
      {
        q: 'What is a Slash credit?',
        a: 'One question or one draft, however long Slash works on it. Each plan includes a month of credits, and a pack adds more when you need them. Slash’s own daily read never spends yours.',
      },
      {
        q: 'What happens when I reach the allowance?',
        a: 'Work that needs more waits for the next month, and the record tells you what is waiting. Add a credit pack for Slash, or turn on extra usage, with a cap you choose, for everything else.',
      },
      {
        q: 'Why is there no free plan?',
        a: 'Every record gets its own database, and that costs money to run. We would rather charge a fair price than have paying customers cover a free tier.',
      },
      {
        q: 'Can I change plan or cancel?',
        a: 'Whenever you like, from Settings. A change takes effect straight away, and a cancelled record can still be exported.',
      },
    ],
  },

  /** The page a mistyped address lands on. `claims.test.ts` holds this list to the routes. */
  notFound: {
    title: 'There is no page here',
    lede: 'The address may be mistyped, or the page may have moved. These are the pages brain.dog has.',
    links: [
      { label: 'Home', href: '/' },
      { label: 'Slash', href: '/slash' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'For agents', href: '/agents' },
      { label: 'Changelog', href: '/changelog' },
      { label: 'Legal', href: '/legal' },
    ],
  },

  /** THE LEGAL PAGE. The licence lives here and in the READMEs, not in the marketing copy. */
  legal: {
    title: 'Legal',
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
    },
    terms: {
      title: 'Terms and privacy',
      /* NOT WRITTEN HERE. The legal texts are OPS-27's (W3), drafted in `apps/site/legal/` and his to
         approve; a marketing redesign does not invent a legal term. */
      body: 'The Terms of Service and the Privacy Policy are published on this page before sign-up opens, and each says when it last changed.',
    },
  },

  changelog: {
    title: 'Changelog',
    lede: "What shipped and when, in the repository's own words.",
    count: (entries: number, days: number) => `${entries} entries over ${days} days`,
  },

  /**
   * THE PAGE FOR THE READER WHO WANTS THE MECHANISM, so it may count: every number is read off the
   * code, and `test/content.test.ts` holds the tool and template lists to `packages/mcp`.
   */
  agents: {
    title: 'Connect your AI agents.',
    lead:
      'Claude, Codex, Cursor and any other MCP client can connect with a key you create. Everything an ' +
      'agent changes is saved under its name, and a few things always need a person.',

    connect: {
      title: 'Connect in a minute',
      ways: [
        {
          head: 'By address',
          said: 'Add this address to your MCP client. It opens the app so you can approve it, once, and picks the record.',
          code: MCP_URL,
        },
        {
          head: 'From a terminal',
          said: 'The command line signs a machine in and serves your record to the agents on it, with keys they can use and never read.',
          code: CLI_INSTALL,
        },
      ],
    },

    mcp: {
      /* `packages/mcp/src/index.ts`: `TOOLS` holds fifteen entries, nine carrying `writes: false`. */
      title: 'Fifteen tools, and nine of them only read.',
      lead: 'An agent reads the record the way a person does, and what it writes lands as an event carrying its name. Nothing here is a separate copy of your data.',
      readsTitle: 'Read',
      reads: ['record_index', 'context', 'schema', 'get', 'list', 'search', 'history', 'activity', 'governance'],
      writesTitle: 'Write',
      writes: ['propose', 'create', 'update', 'log', 'handoff', 'meet'],
      /* `TEMPLATES` in the same file; `test/content.test.ts` holds this list and its count to it. */
      resourcesTitle: 'Resources a client can read directly',
      resources: [
        { uri: 'braindog:schema/{register}', said: 'The fields of one register.' },
        { uri: 'braindog:page/{slug}', said: 'One page with every block run: rows and figures, never markup.' },
        { uri: 'braindog:metric/{id}', said: 'One figure, with its target and how it compares.' },
        { uri: 'braindog:skill/{name}', said: 'The text of one skill, and when to reach for it.' },
        { uri: 'braindog:declaration/{slug}', said: 'One page as declared, to change and propose back.' },
        { uri: 'braindog:automation/{id}', said: 'One automation as declared, with its last ten runs, each step with its outcome.' },
        { uri: 'braindog:inbox/{state}', said: 'The arrivals in one state: untriaged, review, skipped, matched, proposed, ignored, or all. Skipped is where a wrong skip rule shows.' },
      ],
    },

    report: {
      title: 'Let a project report its own numbers.',
      lead: 'A report key can only add rows to one list, with fields you fix when you create it. It cannot read anything, so it is safe to put in a CI job or on a server.',
      /* Every figure off `packages/record/src/report.ts`. */
      limits: [
        { what: 'Write only', said: 'It cannot read lists, figures or people. Anything else it tries is refused.' },
        { what: 'One list', said: 'Chosen when you create the key, and it never changes.' },
        { what: 'Up to 8 fixed fields', said: 'Values you set on the key that the project cannot change.' },
        { what: '100 rows a call', said: 'A bigger batch is refused whole, never half written.' },
        { what: '256 KB a call', said: 'Measured as the JSON of its rows.' },
        { what: '600 rows a minute', said: 'Counted from the first report in each minute.' },
      ],
    },

    cannot: {
      title: 'What only a person can do.',
      lead: 'Whatever key an agent holds, these need somebody signed in to the app.',
      rows: [
        { what: 'Answer a decision', said: 'Deciding needs a person, signed in. No token reaches it.' },
        { what: 'Invite anybody', said: 'An invitation, a new token, an export and the list of vault grants all need a browser session.' },
        { what: 'Read a secret', said: 'The record indexes what a key opens, never the key. A value leaves the vault for one call and is never written down.' },
      ],
    },
  },

  footer: {
    tagline: 'Give your business a memory',
    columns: [
      {
        title: 'Product',
        links: [
          { label: 'Slash', href: '/slash' },
          { label: 'Pricing', href: '/pricing' },
          { label: 'For agents', href: '/agents' },
          { label: 'Changelog', href: '/changelog' },
        ],
      },
      {
        title: 'Open source',
        links: [
          { label: 'GitHub', href: 'https://github.com/actuallyhoss/BrainDog' },
          { label: 'Licence', href: '/legal' },
        ],
      },
      {
        title: 'Your record',
        links: [
          { label: 'Start your record', href: SIGNUP, rel: 'external' },
          { label: 'Sign in', href: `${APP}/signin`, rel: 'external' },
        ],
      },
    ],
  },
} as const;
