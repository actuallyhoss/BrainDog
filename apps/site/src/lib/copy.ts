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
 * AND A SIXTH RULE, ADDED 2026-09-21 BY THE OWNER, WHO COUNTED THE NUMBERS ON THE PAGE AND CALLED
 * THEM "silly ai-looking stats" (`loop/DIRECTION.md` §19). A figure earns its place by answering a
 * question the reader was already asking. `16 tools an agent can call`, `5 resource templates`,
 * `1 file holds your record` and `30 nightly backups` answered none: nobody arrives at a marketing
 * page wondering how many tools a protocol surface declares, and a row of four such figures under a
 * headline is the shape of a page filling space rather than making an argument. The `facts` section
 * that held them is deleted, along with the sixteen tool names and the five resource-template
 * grammars that were drawn as a grid two bands further down. `test/content.test.ts` now fails if any
 * of them comes back.
 *
 * THE DRAWINGS ARE COPY TOO. The home page draws two working things rather than pictures of them: an
 * agent's proposal that a person decides, landing in the history under the agent's name, and a
 * switcher that rearranges the page as you pick who the record is for. Every name, figure and time
 * in both is below, read off the demo record (`apps/web/src/lib/record/data.ts` and
 * `packages/seed`). Nothing in a drawing is invented: when the seed's sample changes, these change
 * with it, not before it. Where a drawing takes a liberty with the sample, the comment beside it
 * names the liberty. A key that nothing renders is deleted rather than kept for later.
 *
 * WHY THERE ARE FEWER SECTIONS THAN THERE WERE. `typed` and `agents` were two bands of their own and
 * are now three sentences inside one. The page used to open on typed rows, registers and the MCP
 * tool table, which is how the thing is built rather than what it is worth, and §19 is explicit that
 * the first blocks answer the second question. Their surviving sentences moved into `plain`, at the
 * foot of the page where a reader who wants the mechanism will still find it, and the comments that
 * argued each sentence into its current wording moved with them rather than being thrown away.
 */

/**
 * The addresses, in one place, and ABOVE `site` so every link inside it can be built from them.
 *
 * `APP` IS THE ONE PLACE THE APP'S ADDRESS IS WRITTEN. Every "Open the app" on the site, the header,
 * the hero, the close, the pricing card and the changelog, and the footer's sign-in, read it from
 * here. It sat below `site` until 22 September, which is why the footer's sign-in was a second
 * literal of the same address. The day the app moved, this line was every LINK that changed and not
 * the whole change: `loop/research-site-now.md` (23 September, section 2) measured `static/robots.txt`,
 * the comments in `static/sitemap.xml` and the want of a CSP in `static/_headers` all going false with
 * the move.
 *
 * `/app` AND NOT AN ADDRESS, SINCE PUSH B2 PUT THE APP ON THIS SITE'S OWN NAME. The site's script
 * hands `/app` and everything under it to its own environment's app (`wrangler.jsonc`,
 * `run_worker_first` and `services`), so the alpha site's readers reach alpha's app, where the old
 * absolute `https://app.brain.dog` sent them to production's. It stayed absolute until the flip
 * because until then `/app` on `brain.dog` refused every sign-in at `origin`, and after it the old
 * name refuses a device start (`loop/research-one-domain-binding.md` section 2.4).
 * `test/one-origin.test.mjs` reads production's `PUBLIC_HOST` and says which of the two this must be.
 *
 * `SOURCE` IS PUBLISHED AHEAD OF THE REPOSITORY GOING PUBLIC, on the owner's word, 2026-09-16. The
 * repository is private until the product launches, and the link is on the site now so it is
 * already in place on the day it opens.
 *
 * `DOCS` AND `BUILD` ARE STILL `null`. They point inside the repository at pages that are not
 * written for a stranger yet. `null` and not a different URL, so every call site has to decide what
 * to draw when there is no address, and the type makes it decide.
 */
export const APP = '/app';
export const SOURCE: string | null = 'https://github.com/actuallyhoss/BrainDog';
export const DOCS: string | null = null;
/** The build instructions, which is what a self-hoster is actually sent to. */
export const BUILD: string | null = null;

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
    agents: {
      title: 'For agents and services · BrainDog',
      description:
        'What an agent reaches over MCP, what a project reports with a key of its own, and the ' +
        'limits on both. Fifteen tools, nine of which only read.',
    },
    notFound: {
      title: 'Page not found · BrainDog',
      description: 'There is no page at this address on brain.dog.',
    },
    legal: {
      title: 'Legal · BrainDog',
      description:
        'The licence BrainDog is published under, and where its Terms and Privacy policy will be ' +
        'published before hosted sign-up opens.',
    },
    changelog: {
      title: 'Changelog · BrainDog',
      /* `live on a synthetic record` IS THE SAME FALSE CLAIM `STATUS.body` CARRIED, one layer out,
         and a meta description is read by every person a search result or a shared link reaches.
         `DEMO_RECORD` is empty in both environments, so there is no record to be live on. */
      description:
        "What shipped in BrainDog and when, in the repository's own words. The app is live, " +
        'signing in works, and nothing is for sale yet.',
    },
  },

  nav: {
    pricing: 'Pricing',
    agents: 'For agents',
    changelog: 'Changelog',
    docs: 'Design',
    source: 'GitHub',
    open: 'Open the app',
    menu: 'Menu',
  },

  hero: {
    /**
     * THE SLOGAN, IN TWO HALVES, AND THE WORDS ARE UNCHANGED.
     *
     * It reads `Give your business a memory` on the page, because it is one `<h1>` with a coloured
     * span inside it, and the slogan is the owner's call rather than a redesign's
     * (`loop/research-site-copy.md` closes with three alternatives and leaves the decision with
     * him). The split exists so the last two words can take `--accent-text`, which is the one move
     * taken verbatim from the reference: PostHog's hero headline carries
     * `className="text-red dark:text-yellow"` on a phrase inside it
     * (`src/components/Home/Hero.js`), a different hue per scheme because neither reads on both
     * grounds. Ours needs no swap: `--accent-text` is already solved per scheme for text on the
     * page ground, and it is the token whose whole job is this.
     *
     * A SEARCH RESULT AND A SHARED CARD STILL SEE ONE SENTENCE, because `site.tagline` and
     * `footer.tagline` hold it whole and neither of them is built from these two.
     */
    title: 'Give your business',
    titleAccent: 'a memory',
    /**
     * IT SAID `Nothing in it is ever overwritten` AND THAT IS STRONGER THAN THE STORAGE.
     *
     * The design is a current-state table beside an append-only log, which is the right design and
     * is not the same sentence. `packages/kernel/src/index.ts` updates a row in place and bumps its
     * version; `erase.ts` writes over the log itself when somebody exercises a right to erasure;
     * `provision.ts` deletes past the retention cutoff. Three greps falsify the old claim. What is
     * true without qualification is the half that matters to a reader: changes are events, and the
     * list of them only grows.
     *
     * AND THEN IT SAID WHAT THE STORAGE DOES INSTEAD OF WHAT THE READER GETS, which is the order
     * §19 asks this page to stop using on its first screen. `loop/research-site-now.md` counted it:
     * of the sub-line's three sentences, the last was spent on events and a log, the most technical
     * words above the fold. What a reader gets is the switcher's promise (their own things, arranged
     * for them), the agents doing the upkeep, and being able to see who changed what. The last half
     * is the same claim `plain.lead` makes and the drawn decision in the mechanism band shows, so it is said
     * here in the reader's words and proven there. `test/content.test.ts` fails if a word of
     * mechanism comes back into this sentence.
     */
    sub: 'Everything you keep track of, in one place arranged around you. You and your AI agents keep it up to date, and every change says who made it.',
    /**
     * `Open the app` AND NOT `Open the demo`, WHICH IS THE VERB THIS SITE ALREADY USES for the same
     * address in the nav and on the pricing page.
     *
     * The server has no demo record to serve: `apps/worker/wrangler.jsonc` sets `DEMO_RECORD: ""` in
     * both environments, so its anonymous door never opens. The label stays `Open the app` because
     * the app is what opens, and what it opens on is said in the note under the button.
     *
     * THE NOTE SAID ONLY `Neither plan is open yet.`, AND THAT HID THE ONE THING A STRANGER GETS.
     * The comment above it argued there was nothing behind the button, from `DEMO_RECORD` alone, and
     * that is true of the server and false of the browser. Measured on 22 September:
     * `https://app.brain.dog/api/boot` answers 401 `UNAUTHORIZED`, `apps/web/src/lib/record/device.ts:143`
     * counts that as no record, and the app draws its built-in sample under a bar that says `This is
     * a sample record.` The live bundle carries that sentence. So the note now says what the button
     * opens first and what is closed second, and `test/promises.test.mjs` fails if it stops naming
     * the sample.
     */
    primary: 'Open the app',
    /**
     * THE QUIET SECOND ACTION, and it is quiet for `app.css`'s reason: one filled button per view
     * is the answer to "what do I do here", and a second filled one is a second answer. A reader
     * who has just been told neither plan is open has exactly one other question, which is what it
     * would cost, so the quiet link answers that one.
     *
     * NOT `See the pricing`, WHICH IS WHAT THE RULE AT THE TOP OF THIS FILE ASKS FOR and is what
     * the closing band says. Two reasons, and the second is the stronger. The rule exists to stop
     * `Learn More`, and what it is really asking for is a label that names the thing you get; this
     * one names it in five words instead of two. And the close already uses those two words, so
     * repeating them in the hero would put the same label on both ends of the page, which is the
     * repetition `closing.title` refuses in the paragraph above it for the same reason.
     */
    secondary: 'See what it costs',
    note: 'The app opens on a sample record. Neither plan is open yet.',
    /* THE HERO HAS NO PHOTOGRAPH, AND SO NO CAPTION AND NO ALT. On 22 September the owner said of
       the screenshots on this page *i hate those screenshots. they look terrible*, and asked for the
       drawn app to take their place, overlapping the hero. That drawing is `arrange` below, and
       every word in it is a string a screen reader reads as text, so it needs no alt. */
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
   * EVERY WORD IS THE SAMPLE RECORD'S, and there is one liberty, named here. `SG33` in
   * `packages/seed/src/index.ts` and `apps/web/src/lib/record/data.ts` asks *Add the two services on
   * the Fenwick invoice?*, recommends *Add both* with this `change` as its body, is decided by you,
   * and is followed by Claude creating `services#6` and `services#7`, three hours before the sample
   * is opened. THE LIBERTY: in the sample the question is opened by the record's own reader of the
   * arriving invoice, not by Claude. An agent proposing over MCP is real (`propose` is one of the six
   * writes `agents.mcp.writes` lists), so the scene draws a thing the product does, compressed into
   * one agent where the sample has two actors.
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
      /* THE TIMES ARE `data.ts`'s AND NOT THE OLD LEDGER'S. It said `2d ago` and `14h ago`; the
         rows it was quoting are `seq 4160` at `stamp(-31)` and `seq 4188` at `stamp(-9)`, and
         `stamp` counts hours (`packages/seed/src/modules/base.ts:104`). Named, never numbered. */
      { who: 'Codex', what: 'Opened a question about the Kiln licensing model', when: '1d ago' },
      /* `seq 4188` in `data.ts`, at `stamp(-9)`, and it is `by: 'rule.reply'`, not the late-invoice
         rule. This row credited it to *Chase late payments*, the name `names.ts` gives
         `invoice-late`, which wrote no row in the sample's ledger at all. `reply` is in no
         `RULE_NAMES` entry, so the app draws it through `actorOf`'s fallback as `reply rule`, and
         that is the name a reader who opens the sample sees on this row. The note it added reads
         *Chased twice. 45-day terms expired 3 August.* on `obligations#1`. */
      { who: 'reply rule', what: 'Added a note to an invoice that is late', when: '9h ago' },
      /* `seq 4192` and `4191` in `data.ts`: Object storage and the Workers plan, each `from the
         Fenwick invoice`. THE TIME IS NOT THE SAMPLE'S `stamp(-3)`, AND THAT IS DELIBERATE. This row
         lands the moment the reader presses Accept, and it said `3h ago` while doing so: a row
         written a second ago under a time three hours old. The app's word for a row under a minute
         old is `just now` (`packages/render/src/format.ts`, `since`), and `decide-copy.test.ts`
         reads the word from `since` so the two cannot drift. The two rows above keep `data.ts`'s
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
     * THE SENTENCE THIS REPLACES WAS FALSE, AND IT WAS IN THE `Not built yet` COLUMN.
     *
     * It read: *Spark arranges by reading what you type. A language model does not do it yet.*
     * `loop/research-site-copy.md` falsifies it twice over. `packages/host/src/spark.ts:52`
     * defines `endpointModel()`, a real model behind a chat-completions port, and BOTH hosts wire
     * it in (`apps/worker/src/spark.ts:22`, `apps/selfhost/src/spark.ts:29`). What is true is
     * narrower and is what `loop/STATUS.md` §5 actually says: with none configured, the rules
     * draft. So the claim moves out of the not-built column, where it was a lie about our own
     * software, and becomes the limit it always was, stated beside the thing it limits.
     *
     * IT SURVIVED THE CUT OF 2026-09-21 WHOLE, and that is deliberate. §19 asks for a shorter
     * page, and `loop/DIRECTION.md` is equally clear that a shorter page must not become a
     * truer-sounding one. Deleting a stated limit is the cheapest way to lose length and the one
     * way that is not allowed, so the length came out of bands and pictures instead.
     */
    note:
      'Rules draft the arrangement. A model drafts it instead once you configure one, and none is ' +
      'configured by default. Any module can be turned off afterwards, People included.',
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
        /* The two groceries rows in the sample week (6,420 and 2,135 pence) against the 30,000 the
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
   * THE LAST BAND BEFORE THE CLOSE, and it is where every sentence about mechanism ended up.
   *
   * WHAT A READER CAN HOLD THE PRODUCT TO, what is not built, and what it will never do, in three
   * columns side by side. The middle column is the reason the other two get believed, which is why
   * it is the longest of the three and why it lost nothing in the cut.
   *
   * `lead` IS ONE SENTENCE NOW, AND IT WAS TWO.
   *
   *   - `A register is a typed collection: money, services, people.` WENT, on 2026-09-22. It was
   *     the one sentence on the site that taught the word by example, and it opened the band, so
   *     the first thing the mechanism band asked of a reader was to learn a term of the product's own
   *     plumbing. Nothing else on the home page uses the word, so there was nothing left for the
   *     definition to serve: `test/content.test.ts` now fails if `register` reaches the home page
   *     without the sentence that teaches it, and still checks the examples if it comes back.
   *   - The agents sentence is what `loop/research-site-copy.md` ranks FIRST of the eight things
   *     this page should say: an agent gets a typed surface, not a chat window. The sixteen tool
   *     names that used to be drawn under it as a grid are gone, because a reader who does not
   *     already know what `governance` or `handoff` means learns nothing from reading the word,
   *     and a reader who does will go to the protocol.
   *   - `every change carries a name` is the claim the drawn decision under this paragraph
   *     demonstrates, and it is placed last for that reason: the scene ends with Claude's row
   *     arriving in the history under Claude's name.
   */
  plain: {
    tag: 'In writing',
    title: 'Plain about what it is',
    lead:
      'Claude, Codex and Cursor read and write the same record you do, over MCP, with a key you ' +
      'issue, and every change carries a name.',
    /**
     * THE LIMIT ON THE SENTENCE ABOVE, and it is a limit about records rather than about the door.
     *
     * The hosted MCP door IS written (`apps/worker/src/index.ts:1020-1032`, routed at
     * `apps/worker/src/route.ts:70`, with `apps/worker/test/mcp.test.ts` over it). What nobody can
     * open yet is a hosted RECORD, so a self-host is the only place an agent can reach one.
     * A buyer who reads specifications works that out in about four minutes, so better it comes
     * from us.
     *
     * AND IT SAID `Agents reach a self-hosted record today.`, WHICH NO READER COULD ACT ON. A
     * self-host needs the code, and the code is in a private repository that answers 404 to anybody
     * signed out; `npm view` answers E404 for every name this repository could publish under. The
     * door is real and a self-host built from this tree does answer it, so the sentence keeps the
     * door and says when a stranger gets a record to point it at.
     */
    note: 'Both hosts answer agents over MCP. Your agent reaches a record of yours once the code is published or hosted sign-up opens.',
    columns: [
      {
        head: 'Yours to keep',
        /**
         * ALL THREE OF THESE WERE FALSE OR OVERSTATED ONCE, and an audit falsified each with one
         * grep. They are the sentences on the page a reader is most likely to check, which is the
         * whole point of the column, so they were the worst ones to have got wrong.
         *
         *   - `The code is on GitHub` is true of the address and not of a reader: the repository
         *     is private and the link 404s. `/legal` admitted it and this page did not, which is
         *     exactly the footnote this file's own rule forbids.
         *   - `One SQLite file` is the record. An installation writes three things
         *     (`apps/selfhost/src/main.ts:105`, `:171`, `:257`): the record, a second database
         *     holding sign-in and people, and a `blobs` directory where attachments live OUTSIDE
         *     the record. The pricing page kept the qualifier and this page dropped it.
         *
         * THE BACKUPS LINE WENT IN THE CUT OF 2026-09-21 AND IT IS THE ONE DELETION HERE.
         * It read `Thirty nightly backups, in the same portable format on either host`, and it is
         * true (`apps/worker/src/snapshots.ts:1-30`, `apps/selfhost/src/snapshots.ts:30`). It is
         * also a counted figure of the product's own parts, which is the category the owner named
         * as silly, and the same thirty was one of the four numbers deleted from under the hero. A
         * strength coming off the page costs the page nothing it is owed; a LIMIT coming off would
         * have, which is why the middle column below still has three lines.
         *
         * `Open source.` AS A SENTENCE OF ITS OWN WAS A PRESENT-TENSE LABEL ON A PRIVATE REPOSITORY.
         * The clause after it was careful and the label in front of it was not, and a label is what a
         * reader checks first: `https://github.com/actuallyhoss/BrainDog` answered 404 signed out on
         * 22 September. `from launch` puts the timing inside the claim instead of after it.
         */
        lines: [
          'Open source from launch. The code is published on GitHub when the product launches.',
          'Your record is one file. Leaving is a copy, not a migration.',
        ],
      },
      {
        /**
         * IT WAS HEADED `Not built yet`, AND THE FIRST LINE UNDER IT IS BUILT.
         *
         * The comment on that line keeps it in this column on purpose and defines the column as what
         * a visitor can do nothing with, which is right. A stranger reads the head and not the
         * comment, and the head said the opposite of the comment: both hosts wire `@braindog/spark`
         * (`apps/worker/src/spark.ts`, `apps/selfhost/src/spark.ts`), the palette asks it, and
         * `SPARK_ENDPOINT` is `""` in both of `apps/worker/wrangler.jsonc`'s environments. Built and
         * switched off is not unbuilt. `Not switched on yet`, the survey's suggestion, fits that line
         * and the third, and misreads the second: nothing is built that reaches into an inbox, so a
         * head saying it is only switched off would overstate the product the other way. What is true
         * of all three is the column's own definition, said to the reader in the words of the column
         * beside it. `src/lib/claims.test.ts` fails if the head says `built` while both hosts wire the
         * engine.
         */
        head: 'Not yours to use yet',
        lines: [
          /**
           * THIS LINE WAS TRUE ON 2026-09-21 IN THE MORNING AND FALSE BY THE EVENING, which is what
           * a marketing page that cites a grep is for.
           *
           * It said *the engine is written; no host reaches it yet*, on the strength of
           * `grep -rl "@braindog/spark" apps/worker/src apps/selfhost/src` returning nothing. Run
           * again, it returns `apps/worker/src/spark.ts` and `apps/selfhost/src/spark.ts`: the
           * engine landed as a package of its own on 2026-09-20 and both hosts were wired to it in
           * the same day's work.
           *
           * WHAT IS STILL TRUE IS NARROWER AND IS WHY THE LINE STAYS IN THIS COLUMN. Both wirings
           * refuse before they import: `workerSparkEngine` returns `undefined` when no endpoint is
           * configured, and `SPARK_ENDPOINT` is `""` in both of `apps/worker/wrangler.jsonc`'s
           * environments. So a visitor can still do nothing with it, which is this column's own
           * definition.
           *
           * AND THE SENTENCE SAID "BOTH HOSTS REACH THE ENGINE", WHICH IS NOT TRUE AND WAS BACKED
           * BY A GREP FOR THE PACKAGE NAME. Finding 3 of `loop/research-batch-five-audit.md`, and
           * the finding under it is worse than the wording: `workerSparkEngine`
           * (`apps/worker/src/spark.ts:83`) and `sparkEngineFor` (`apps/selfhost/src/spark.ts:73`)
           * are called from their own test files and from nowhere else. Driven by the audit: with
           * both builders throwing on every call, 172 of 172 tests pass in `apps/worker` and 199 of
           * 199 in `apps/selfhost`. An import edge is not a path. Configuring a model would change
           * nothing, because nothing asks either builder for an engine.
           *
           * So the line said what a stranger could check: the engine exists in this repository and no
           * screen and no door reaches it.
           *
           * AND A DOOR REACHES IT NOW, SO THE SENTENCE MOVED RATHER THAN THE COLUMN. Both hosts
           * mounted `POST /api/spark/read` on 2026-09-21, and a real self-host over a real socket
           * answers it 200 on exactly one model call. Two things are still true and they are what
           * the new sentence says: nothing in `apps/web` calls that address, which
           * `grep -rn "spark/read" apps/web/src` returns nothing for, and `SPARK_ENDPOINT` is `""`
           * in both of `apps/worker/wrangler.jsonc`'s environments, so no host this project deploys
           * has a model behind it. A visitor can still do nothing with it, which is this column's
           * own definition.
           *
           * WHAT THE DOOR ANSWERS IS A ROW, which was checked before this sentence was written and
           * then checked again after a first reading of it was wrong: a record holding a row named
           * Kiln, asked `Kiln`, answers that row. The page says nothing about that either way,
           * because a door no screen reaches is not a feature a visitor can use, and this column is
           * about what they can use.
           *
           * AND A SCREEN ASKS IT NOW, SO THE SENTENCE MOVED AGAIN AND THE COLUMN STILL DID NOT.
           * Since a331fe8c the palette offers a Spark row for a plain query of two characters or
           * more that matched no place (`apps/web/src/lib/palette/spark.ts`, `offersSpark`), and
           * asks through the client's `sparkRead` (`Palette.svelte`), which is why the grep above
           * stopped measuring the screen: the address lives in `packages/client`, not in
           * `apps/web`. The row appears only when `/api/version` reports a model and the record is
           * live (`apps/web/src/routes/+layout.ts`); the sample is never live, and `SPARK_ENDPOINT`
           * is still `""` in both environments. So a stranger still cannot ask, and the line says
           * why in terms that stay true the day a model is configured somewhere.
           * `src/lib/claims.test.ts` fails if the palette asks and this line says no screen does.
           */
          'Asking your record a question in words. The app asks it where a model is configured, and no host here has one.',
          /* THE SECOND HALF IS NEW AND IT IS THERE TO STOP A CONTRADICTION. Both hosts opened an
             arrival door on 2026-09-20 and the changelog says so, so `Mail does not arrive by
             itself` on its own now reads as the page disagreeing with its own history page. The
             two are compatible and the distinction is the whole point: nothing here reaches into
             an inbox, and what does land has to be forwarded there by a person. */
          'Mail does not arrive by itself. Nothing reaches into your inbox, and a message has to be forwarded in.',
          /* THE DEMO BELONGS IN THIS COLUMN and was in none of them, which is how the page came
             to point its one filled button at it. `DEMO_RECORD` is empty in both environments.

             BUT `there is no demo to open yet` WAS FALSE OF THE SCREEN, which is the thing a reader
             opens. With no session the app draws its own sample record (`/api/boot` answers 401 and
             `apps/web/src/lib/record/device.ts:143` reads that as no record), under a bar saying
             nothing done there is saved. What is not built is a record of one's own, so that is
             what this line says is missing, and the sample is named as what there is instead. */
          'A record of your own. Neither plan is open yet, so the app shows a made-up sample, and nothing typed into it is saved.',
        ],
      },
      {
        head: 'It will not do',
        /* `file anything for you` WAS IN THIS COLUMN AND CONTRADICTED THE DIRECTION DOCUMENT.
           `loop/DIRECTION.md:224` schedules exactly that: *agents do the legwork in view: filing
           invoices from email, chasing, flagging, proposing*. This column is a list of permanent
           never-promises, so a capability the owner has written down as planned cannot be in it.
           Double entry stays, because DIRECTION §2 is explicit that Money is not a ledger.

           ALL THREE SURVIVED THE CUT. A refusal is the cheapest credibility a marketing page can
           buy and the most expensive to win back once it is dropped.

           THE THIRD SAID `Run code from a pack. Ever.` AND STOPPED BEING TRUE ON 22 SEPTEMBER.
           DIRECTION §22 made a script record content ("never a script in the core; a user's script is
           content"), `script` is the ninth kind of declaration, and a pack may own one through its
           body's `pack:` (`packages/kernel/test/script-declare.test.ts` installs one under `money`).
           What stayed true is where it runs: the record never runs it, a host runs it in a sandbox
           of its own (QuickJS on a self-host, a Dynamic Worker on the Cloud), and every fetch is held
           to the origins its `egress:` lists (`packages/host/src/script.ts`, `apps/worker/src/script.ts`).
           So the refusal names that, and says scripts exist rather than implying they do not. */
        lines: [
          'Double entry, or a general ledger.',
          'A pipeline, a sequence or a lead score.',
          'Run a script inside your record. A script runs in a sandbox of its own, and calls out only to the addresses it names.',
        ],
      },
    ],
  },

  closing: {
    /* NOT THE SLOGAN AGAIN: the hero already made the promise in this face, and the same seven
       words at the foot of the page read as a mistake. This one says what to do next. */
    /**
     * AND IT SAID `Start your record`, WHICH IS THE VERB THE PRODUCT CANNOT PERFORM, in 88px, on the
     * only coloured field on the page.
     *
     * The rule is thirty lines up this file, written about `hero.primary`: a control naming a verb the
     * product cannot perform is the exact defect this app keeps shipping. `POST /auth/provision`
     * answers 404 on both hosts because `PROVISION_KEY` is unset, so starting a record is the one
     * thing a reader who has got this far cannot do. The heading was doing what the button beneath it
     * was stopped from doing, and it was louder.
     *
     * A QUESTION RATHER THAN A SMALLER PROMISE. The body under it already says what making a record
     * takes, and the two actions are honest: the app opens, and the pricing is there to read. What the
     * heading has to stop doing is instruct. The day `/auth/provision` answers, `Start your record` is
     * the right heading again and this comment is how somebody knows it.
     *
     * IN TWO HALVES, LIKE THE HERO'S, so the last three words can carry the accent. The band under
     * it was a whole field of red until 22 September, when the owner asked for it to be much less
     * red; the colour now lives in these words and nowhere else on the band.
     */
    title: 'What would you',
    titleAccent: 'keep in it?',
    /* IT SAID `The demo is a made-up business`, and there is no demo. What is true and is the
       better sentence anyway: making a record is two answers long. `/start` asks who you are and
       what the record is for, and arranges the rest from those (`packages/seed/src/usecases`).

       AND IT SAID SO IN THE PRESENT TENSE, under a button that opens a sample. Nobody can make a
       record yet: `loop/STATUS.md` §7.A.2 records `POST /auth/provision` answering 404 on both
       hosts while `PROVISION_KEY` is unset and `KEK` unbound. The two answers are still the
       argument; the sentence now says what the button opens today and when the rest applies. */
    body: 'Open the app to walk around a sample record. Once sign-up opens, yours starts with two answers: who you are, and what it is for.',
    primary: 'Open the app',
    secondary: 'See the pricing',
  },

  pricing: {
    title: 'Two ways to run it.',
    /**
     * THE STATE OF BOTH PLANS, above the prices rather than under them.
     *
     * A price on a page is an offer, and neither of these can be accepted yet. Saying so once, in
     * plain words, is what lets the rest of the page describe the plans in the present tense.
     */
    statusTitle: 'Not open yet',
    /* `No sign-up and no billing yet` WAS ONLY EVER ABOUT THE HOSTED PLAN. The self-hosted plan has
       no sign-up to open: what it lacks is the code, which is private, and a package, which `npm view`
       answers E404 for under every name this repository could publish. So each plan gets its own
       reason, and the sample is named because it is the one thing on this page a reader can open. */
    status:
      'Neither plan is open yet. The code to self-host is published when the product launches, and hosted sign-up and billing are not switched on. Until then the app shows a sample record.',
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
    /**
     * A TABLE, AND THE PAGE'S OWN COMMENT SAYS WHY THERE IS NO FEATURE MATRIX. Both are true and
     * they are not the same table.
     *
     * `pricing/+page.svelte` argues, correctly, that a matrix of ticks exists to make the cheaper
     * column look incomplete, and that there is nothing to make incomplete here because the
     * self-hosted build is the same software. So this table has no ticks and no crosses in it. It
     * is six rows of what is OPERATIONALLY different between running it yourself and having it
     * run: who runs the process, where the database is, what the backup is, whose domain, how you
     * leave, and what it costs. Four of the six answer the same for both plans, which is the point
     * being made and is the opposite of what a feature matrix is for.
     *
     * Every cell is settled in `loop/research-site-copy.md`: one Durable Object with its own
     * SQLite per hosted record (`apps/worker/src/snapshots.ts:1-10`), the nightly `VACUUM INTO`
     * with thirty kept on self-host (`apps/selfhost/src/backup.ts:4-15`,
     * `snapshots.ts:30`), and export as a live host-independent call
     * (`apps/web/src/lib/record/settings-write.ts:154-159`).
     *
     * THE HOSTED BACKUP CELL WAITED ON A SETTING, AND THE SETTING IS MADE. The cron in
     * `apps/worker/wrangler.jsonc` (`17 3 * * *`, 03:17 UTC) walks every record once a night, puts
     * one copy each in the environment's own R2 bucket and keeps thirty (`KEEP` in
     * `apps/worker/src/snapshots.ts`), each sealed with age to `AGE_RECIPIENT` (`seal.ts`). Until
     * 54a16ffb, on 22 September at 20:12, both environments held the placeholder
     * `age1<...-recipient>`, which `sealerOf` refuses before the walk starts, so no hosted copy was
     * written and the cell said `None yet`. Since then each environment names a real key of its own,
     * production's `age1av0654...` and alpha's `age1f6rykm...`. The cell went on waiting for a key
     * that was already set, for a day, because `claims.test.ts` only spoke while the value was a
     * placeholder.
     *
     * WHAT THE CELL NOW SAYS IS WHAT THE CODE DOES AND NO MORE. `Nightly, thirty kept, sealed to a key
     * we hold` is the cron, `KEEP` and the recipient; the identity that opens a copy is kept outside
     * Cloudflare (`seal.ts`'s header, `12 §8`). It does not say a failed night is tried again,
     * because nothing tries it again: `nightly.ts` counts the failure, and the next copy is the next
     * night's. It is read from the code; nobody opened the bucket to write it. `claims.test.ts`
     * holds both directions: `None yet` while production's key is a placeholder, neither `None yet`
     * nor `once we set` once it is real, and no `seal` if it is ever set empty, which is unsealed on
     * purpose.
     */
    compareTitle: 'What actually differs',
    compare: {
      columns: ['', 'Self-hosted', 'Hosted'],
      rows: [
        ['The software', 'The same build', 'The same build'],
        ['Runs on', 'Your machine, one process, one port', 'Cloudflare, run by us'],
        ['Your record lives in', 'One file on your disk', 'A database of its own, never shared'],
        ['Backups', 'Nightly, thirty kept', 'Nightly, thirty kept, sealed to a key we hold'],
        ['Leaving', 'Copy the file', 'Export the file, whenever you like'],
        ['Price', 'Free', '$12 a month, per record'],
      ],
    },
    /* THE BAND'S OWN LABEL, in the same register as `Pricing` and `Side by side` above it. Three
       words off the sentence under it rather than a new claim: this band exists to say there is no
       free hosted tier, so that is what its mark says. */
    honestTag: 'No free tier',
    honestTitle: 'Why there is no free hosted tier',
    honest:
      'No free hosted tier, on purpose. A per-customer database with no revenue against it ends as ' +
      'a product that gets worse for the people paying for it.',
  },

  /**
   * THE PAGE A MISTYPED ADDRESS LANDS ON. Cloudflare serves it with a 404 for any path the build has
   * no file for (`not_found_handling` in `wrangler.jsonc`), in place of a blank white page.
   *
   * THE LEDE SAYS THIS IS EVERY PAGE, SO THE LIST HAS TO BE. `/agents` arrived on 6ef2193e, went
   * into the header and the footer, and was missing here for a day: the one page claiming to list
   * all of them was the one that did not. `src/lib/claims.test.ts` now reads the route directories
   * and fails on a page this list or `static/sitemap.xml` leaves out.
   */
  notFound: {
    title: 'There is no page here',
    lede: 'The address may be mistyped, or the page may have moved. These are the pages brain.dog has.',
    links: [
      { label: 'Home', href: '/' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'For agents', href: '/agents' },
      { label: 'Changelog', href: '/changelog' },
      { label: 'Legal', href: '/legal' },
    ],
  },

  /**
   * THE LEGAL PAGE. The licence lives here and in the READMEs, not in the marketing copy.
   *
   * THE TERMS AND THE PRIVACY POLICY ARE NOT WRITTEN, and this page says so rather than drawing a
   * placeholder that reads like one. Nothing here is a legal term that has not been decided.
   */
  legal: {
    title: 'Legal',
    licence: {
      title: 'Licence',
      /* `BrainDog is open source.` WAS A STATE, AND THE REPOSITORY IS PRIVATE. The licence is decided
         and in `LICENSING.md`, so the terms are stated as they are; what waits for launch is the
         publishing, and the note under the links already says when. */
      body: [
        'BrainDog is published as open source when the product launches. The software is licensed under the Apache License 2.0, and the renderer in packages/render is licensed under the MIT License.',
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
      /* THE LAST CLAUSE PROMISED SOMETHING ABOUT A DEMO THAT DOES NOT EXIST. It read *the demo
         keeps nothing you type into it*, which is a data-handling promise about a surface no
         visitor can reach: `DEMO_RECORD` is empty in both environments. A promise nobody can test
         is the kind a legal page must not make, so it says the true and smaller thing. */
      body: 'The Terms of Service and the Privacy policy are not published yet. Both will be published here before hosted sign-up opens. Until then there is no sign-up and no billing, so there is nothing to collect.',
    },
  },

  changelog: {
    lede: "What shipped and when, in the repository's own words.",
    count: (entries: number, days: number) => `${entries} entries over ${days} days`,
  },

  /**
   * THE PAGE THE HOME PAGE'S TECHNICAL MATERIAL MOVED TO, which is what `loop/DIRECTION.md` §19 asks
   * for in the owner's own words: what is worth keeping belongs on a page a curious reader reaches
   * on purpose. Two things were cut from the home page on 21 September and drawn nowhere for an
   * hour: a table of what a report key can and cannot do, and the sixteen MCP tool names with five
   * resource-template grammars. Both are here.
   *
   * A READER ARRIVES HERE ON PURPOSE, so it may count. `test/content.test.ts` refuses a counted
   * figure of the product's own parts on `index.html` and on `index.html` alone, for the reason the
   * rule was written: a row of figures under a headline is a page filling space, and the same figure
   * on the page that answers "what can my agent do" is the answer to the question.
   *
   * EVERY NUMBER IS READ OFF THE CODE, and where it came from is in the comment beside it. A number
   * on this page that nobody can check is worse here than anywhere else on the site, because this is
   * the page written for the reader who checks.
   */
  agents: {
    /* NO `tag`. /agents dropped its eyebrow on 27a3cf59 and `tag: 'For agents'` stayed here read by
       nothing. `dead-copy.mjs` could not say so, because it reads `apps/web` and never this file. */
    title: 'What an agent or a service does with a record.',
    lead: 'The same record and the same rules, whether a model reaches it over MCP or a project posts its own numbers to one address. Every limit below is a value in the code.',

    mcp: {
      tag: 'Over MCP',
      /* `packages/mcp/src/index.ts`: `TOOLS` holds fifteen entries, nine carrying `writes: false`. It held sixteen until
         the `money` tool left the core (B6), since one pack's figures are an address like every other pack's. */
      title: 'Fifteen tools, and nine of them only read.',
      lead: 'An agent reads the record the way a person does, and what it writes lands as an event carrying its name. Nothing here is a separate copy of your data.',
      readsTitle: 'Read',
      reads: ['record_index', 'context', 'schema', 'get', 'list', 'search', 'history', 'activity', 'governance'],
      writesTitle: 'Write',
      writes: ['propose', 'create', 'update', 'log', 'handoff', 'meet'],
      /* `TEMPLATES` in the same file: six `uriTemplate` entries. This said five and named `RESOURCES`,
         an array that file has never had, and stayed five for a day after `braindog:automation/{id}`
         was added. `test/content.test.ts` now imports `TEMPLATES` and holds this list and its count to it. */
      resourcesTitle: 'And seven addresses a client can read directly',
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
      tag: 'Reported',
      title: 'A project reports its own numbers, and can do nothing else.',
      lead: 'A write token is a key to the whole record. A report key is bound to one register and to the fields it always carries, so the record refuses it everywhere except reporting.',
      /* Every figure off `packages/record/src/report.ts`: `REPORT_ROWS_MOST`, `REPORT_BYTES_MOST`,
         `REPORT_ROWS_PER_MINUTE` over `REPORT_WINDOW_MS`, and `REPORT_FIXED_MOST`. */
      limits: [
        { what: 'Writes only', said: 'It reads no list, no figure and no person. Every other call is refused.' },
        { what: 'One register', said: 'The register is fixed when the key is minted, and a label is fixed for a token’s life.' },
        /* `At most` AND NOT `Up to`, which is this file's own third voice rule: a number is a real number or it is absent, no 10x and no up to. Eight is a real cap, so only the phrasing was selling it. */
        { what: 'At most 8 fixed fields', said: 'Values the project cannot change, set by whoever minted the key.' },
        { what: '100 rows a call', said: 'A batch past it is refused whole, rather than half written.' },
        { what: '256 KB a call', said: 'Measured as the JSON of its rows.' },
        { what: '600 rows a minute', said: 'Counted in a window the first report opens. A leaked key was every row the record could hold.' },
      ],
    },

    cannot: {
      tag: 'Refused',
      title: 'What a token is not allowed to do.',
      lead: 'Driven against a running record on 21 September, as a scoped token and as five people at every level the product offers.',
      rows: [
        { what: 'Answer a decision', said: 'This needs decide, and no token reaches it. A person has to do it, signed in.' },
        { what: 'Invite anybody', said: 'An invitation, a new token, an export and the list of vault grants all need a browser session.' },
        { what: 'Read a secret', said: 'The registers index what a key opens, never the key. A value leaves the vault for one call and is never written down.' },
      ],
    },
  },

  footer: {
    tagline: 'Give your business a memory',
    columns: [
      {
        title: 'Product',
        links: [
          { label: 'Pricing', href: '/pricing' },
          { label: 'For agents', href: '/agents' },
          { label: 'Changelog', href: '/changelog' },
          { label: 'GitHub', href: 'https://github.com/actuallyhoss/BrainDog' },
          /* THE FOOTER AND NOT THE HEADER: the hero says there is no sign-up, and a sign-in beside
             it would contradict the sentence a reader has just been given. Built from `APP`, so the
             app's address is written once, and `external` for the reason at the header's link in
             `+layout.svelte`: `/app/signin` is the app's, on this site's name. */
          { label: 'Sign in', href: `${APP}/signin`, rel: 'external' },
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
