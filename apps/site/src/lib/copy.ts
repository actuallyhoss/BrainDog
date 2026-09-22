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
 * THE DRAWINGS ARE COPY TOO. The home page draws two working things rather than pictures of them: a
 * ledger whose events are only ever added to, and a switcher that rearranges the page as you pick
 * who the record is for. Every name, figure and time in both is below, read off the demo record
 * (`apps/web/src/lib/record/data.ts` and `packages/seed/src/index.ts`). Nothing in a drawing is
 * invented: when the seed's sample business changes, these change with it, not before it. A key
 * that nothing renders is deleted rather than kept for later.
 *
 * WHY THERE ARE FEWER SECTIONS THAN THERE WERE. `typed` and `agents` were two bands of their own and
 * are now three sentences inside one. The page used to open on typed rows, registers and the MCP
 * tool table, which is how the thing is built rather than what it is worth, and §19 is explicit that
 * the first blocks answer the second question. Their surviving sentences moved into `plain`, at the
 * foot of the page where a reader who wants the mechanism will still find it, and the comments that
 * argued each sentence into its current wording moved with them rather than being thrown away.
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
    agents: {
      title: 'For agents and services · BrainDog',
      description:
        'What an agent reaches over MCP, what a project reports with a key of its own, and the ' +
        'limits on both. Sixteen tools, ten of which only read.',
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
     */
    sub: 'One record. You and your AI agents both write to it. Every change is an event, and the log only grows.',
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
    /**
     * THE CAPTION AND THE ALT BELONG TO THE HERO NOW, because the picture does.
     *
     * They were `typed.caption` and `typed.alt`, under a band whose heading was `Typed rows, not a
     * pile of notes`: the product's own screen, used as the illustration for a sentence about data
     * modelling. §19 says the picture is the argument, so it moved up into the first screen and the
     * sentence it used to illustrate moved down into `plain`. The words themselves are unchanged.
     *
     * The caption is literal about the pixels and it has to stay that way. The capture is 1440 CSS
     * px wide, so at a 1440 viewport it paints one device pixel per captured pixel.
     */
    caption: 'One record, photographed on the day this build was made',
    alt:
      'The home screen of a record: what it is owed and what is due, the money falling due this ' +
      'week, the questions waiting on a decision, and what its agents and rules did while you ' +
      'were away.',
  },

  /**
   * THE LEDGER, which the home page draws as rows rather than as a picture of rows. `head` and
   * `only` are its heading, drawn as one line.
   *
   * IT MOVED OUT OF THE HERO AND DOWN TO THE LAST BAND BEFORE THE CLOSE, and the move is the whole
   * of §19 in one component. A list of five text rows is a record, and a record on the first screen
   * is exactly what the owner meant by *it is all records and text*. Where it now sits it is the
   * evidence for the sentence above it, which is that every change carries a name: the `who` column
   * is You, Codex, a rule and Claude, and the reader watches the last three of them arrive.
   *
   * WHAT IS CHECKABLE ABOUT THESE FIVE, said exactly, because the looser version of this sentence
   * was wrong three ways at once and an audit found all three.
   *   - Every register named is one `packages/seed` declares, and `test/content.test.ts` holds
   *     them to it, reading the served bytes for the two that prerender and this file for the
   *     three the tick appends.
   *   - Every actor named is a person, an agent, or a rule this build actually ships. It said
   *     `Renewal rule` and `Reply rule`, which are neither: they are the fallback string
   *     `apps/web/src/lib/record/api.ts` synthesises from an id when `ruleName()` finds nothing.
   *     The three rules that exist are named in `packages/seed/src/usecases/names.ts`.
   *   - A `seq` is a place in a list and never a number typed beside a row, which is
   *     `apps/web/src/lib/record/data.ts`'s own rule about itself: it sorts the ledger and
   *     renumbers from the top, so every number typed here was overwritten by position anyway.
   *     These ascend, they are spaced the way a real ledger's are, and nothing reads them as an
   *     address.
   *
   * A sixth event invented here would be this file breaking its own rule, in the one section whose
   * whole point is that nothing in it was made up.
   *
   * OLDEST FIRST, which is not the order a history page shows and is the order this list needs.
   * `Ledger.svelte` draws the first two and then appends one every four seconds, so the array's
   * order is the order a reader watches them arrive in. Newest first would have the sequence
   * number counting DOWN as rows landed, under a heading that says only ever added: the one
   * component on the site whose job is to prove the claim beside it would be contradicting it.
   */
  ledger: {
    head: 'History',
    only: 'only ever added',
    /* TWO WORDS, AND NO REASON GIVEN. The control ends the wait; it does not explain that there
       is a timer, how long is left, or why the rows appear one at a time. */
    all: 'Show all',
    events: [
      {
        seq: '4176',
        who: 'You',
        /* `12d ago` AND NOT `14h ago`: `packages/seed/src/modules/work.ts:35` carries
           `done_on: day(-12)` on this row, and the copy was quoting the other of the demo's two
           sources, which disagreed with it. */
        what: 'Moved tasks#12 from open to done',
        age: '12d ago',
      },
      {
        seq: '4181',
        who: 'Codex',
        /* NO ID ON THIS ONE, because the id it carried was a sample's and not a record's.
           `packages/seed/src/index.ts:424-429` is explicit that a question is filed under the
           record's own counter, so the sample's `SG31` is filed as something else entirely.
           Naming the question rather than numbering it is true under either counter. */
        what: 'Opened a question, Kiln licensing model',
        age: '2d ago',
      },
      {
        seq: '4183',
        who: 'You',
        what: 'Moved services#2 from live to lapsing',
        age: '1d ago',
      },
      {
        seq: '4187',
        /* A RULE THAT EXISTS, under the name the seed gives it. `packages/seed/src/usecases/names.ts:45`
           names `invoice-late` as this, and chasing a late invoice is what it does. */
        who: 'Chase late payments',
        what: 'Added a note to obligations#1',
        age: '14h ago',
      },
      {
        seq: '4191',
        who: 'Claude',
        what: 'Created services#6, Object storage',
        age: '3h ago',
      },
    ],
  },

  /**
   * THE ARRANGEMENT SWITCHER, and it is the page's first band after the hero because it is the one
   * that answers *what is this worth to me*. Pressing a case redraws the rail in front of the
   * reader, so the claim above it is made by the page doing the thing rather than by a sentence
   * about it, and what it shows is the product becoming the reader's own: their money, their
   * studies, their companies, their team, their new project.
   *
   * `id` is what the switcher tracks and what /start calls the setup. `holds` is the pages and the
   * lists that setup ships, each under the name the record itself gives it, so a reader can check
   * this list against the screen they get after Make my record.
   *
   * `tag` IS THE WORD IN THE BAND'S OPENER, and it lives here rather than in the page for the
   * reason at the top of this file: it is a word a stranger reads. All four were literals inside
   * `+page.svelte` until 2026-09-21, which meant the em-dash scan over this file could not see
   * them and nobody editing copy would have found them.
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
        holds: ['Today', 'Studies', 'Courses', 'Assignments', 'Study sessions'],
      },
      {
        id: 'founder',
        label: 'Solo founder',
        holds: ['Overview', 'Dashboard', 'Organisations', 'Datapoints', 'Money', 'Projects', 'People', 'Tasks'],
      },
      {
        id: 'team',
        /* `Work` WAS A NAV SECTION AND NOT A PAGE. `packages/seed/src/modules/work.ts:426` and
           `:538` put two pages under a section called Work, and they are titled Overview and
           Board. `holds` lists what a reader will actually see named on a page or a list. */
        label: 'Team',
        holds: ['Team', 'Cycles', 'Agent work', 'Board', 'Tickets', 'Cycle plan', 'Teammates'],
      },
      {
        id: 'guide',
        label: 'New project',
        holds: ['Your project', 'Guide', 'Milestones', 'Steps', 'Choices', 'Resources'],
      },
    ],
  },

  /**
   * THE OWNER'S OWN CASE: numbers arriving from the projects themselves, drawn as dashboards.
   * `caption` says where the numbers in the picture came from, because a dashboard with no
   * provenance is a mock-up.
   *
   * THE SPECIFICATION THAT USED TO LIE ON THIS PICTURE IS GONE FROM THE PAGE. It was four rows of
   * what a report key can and cannot do (write only, one register, 100 rows and 256 KB a call, 600
   * rows a minute), every figure read off `packages/record/src/report.ts:1-30`, and every one of
   * them true. It is also a table of limits on a credential, which is a thing a reader wants at the
   * moment they are about to paste one into a deploy script and at no moment before that. §19 puts
   * it plainly: what is worth keeping belongs on a page a curious reader reaches on purpose. There
   * is no such page on this site yet, so the rows are recorded here and drawn nowhere, and the
   * band is about two hundred and thirty pixels shorter for it.
   */
  report: {
    tag: 'Reported',
    title: 'Your projects report. Your dashboards draw.',
    lead: 'Give a project a report key, or an address to poll. The numbers arrive and the tiles draw.',
    caption: 'sixty days of rows, written the way a project reports them',
    /* `region` WENT WITH THE SCROLLING BOX IT NAMED. It was the accessible name of a 420px window
       a reader had to scroll, and there is no window now: the picture is painted at its own size
       and the band clips what will not fit. This file's own rule is that a key nothing renders is
       deleted rather than kept for later. */
    alt:
      "A founder's Dashboard: cash across organisations, the balance of each, and active users, " +
      'recurring revenue and signups drawn against the thirty days before.',
  },

  /**
   * THE LAST BAND BEFORE THE CLOSE, and it is where every sentence about mechanism ended up.
   *
   * WHAT A READER CAN HOLD THE PRODUCT TO, what is not built, and what it will never do, in three
   * columns side by side. The middle column is the reason the other two get believed, which is why
   * it is the longest of the three and why it lost nothing in the cut.
   *
   * `lead` IS TWO BANDS' WORTH OF PAGE IN THREE SENTENCES, and each one is load-bearing:
   *
   *   - `A register is a typed collection: money, services, people.` is the one sentence on the
   *     site that teaches the word by example, and `test/content.test.ts` reads the three names
   *     back out of the served bytes and checks each against the seed's declarations. It was the
   *     lead of a band called `Typed rows, not a pile of notes`, at the top of the page, which is
   *     the mechanism-before-value order §19 asks us to stop using.
   *   - The agents sentence is what `loop/research-site-copy.md` ranks FIRST of the eight things
   *     this page should say: an agent gets a typed surface, not a chat window. The sixteen tool
   *     names that used to be drawn under it as a grid are gone, because a reader who does not
   *     already know what `governance` or `handoff` means learns nothing from reading the word,
   *     and a reader who does will go to the protocol.
   *   - `every change carries a name` is the claim the ledger under this paragraph demonstrates.
   *     It is placed last for that reason: the names in the `who` column are You, Codex, a rule
   *     and Claude, and three of the four arrive while the reader is looking at them.
   */
  plain: {
    tag: 'In writing',
    title: 'Plain about what it is',
    lead:
      'A register is a typed collection: money, services, people. Claude, Codex and Cursor read ' +
      'and write the same rows you do, over MCP, with a key you issue, and every change carries a ' +
      'name.',
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
        head: 'Not built yet',
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
           buy and the most expensive to win back once it is dropped. */
        lines: [
          'Double entry, or a general ledger.',
          'A pipeline, a sequence or a lead score.',
          'Run code from a pack. Ever.',
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
     */
    title: 'What would you keep in it?',
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
     * THE HOSTED BACKUP CELL IS THE ONE THAT WAITS ON A SETTING, NOT ON CODE. The Worker keeps
     * thirty nightly copies, each sealed to `AGE_RECIPIENT` (`apps/worker/src/snapshots.ts`,
     * `seal.ts`). Both environments in `apps/worker/wrangler.jsonc` still hold the placeholder
     * `age1<...-recipient>`, and `sealerOf` refuses a placeholder before the walk starts, so on
     * 22 September no hosted copy was being written at all. `Nightly, thirty kept` was true of the
     * code and of no copy. The cell says what a hosted record would get today, and
     * `src/lib/claims.test.ts` fails if it stops saying so while the placeholder is there. When the
     * owner sets the recipient, the `None yet.` half goes and the test's condition goes false.
     */
    compareTitle: 'What actually differs',
    compare: {
      columns: ['', 'Self-hosted', 'Hosted'],
      rows: [
        ['The software', 'The same build', 'The same build'],
        ['Runs on', 'Your machine, one process, one port', 'Cloudflare, run by us'],
        ['Your record lives in', 'One file on your disk', 'A database of its own, never shared'],
        ['Backups', 'Nightly, thirty kept', 'None yet. Nightly, thirty kept, once we set the key that seals them'],
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
    tag: 'For agents',
    title: 'What an agent or a service does with a record.',
    lead: 'The same record and the same rules, whether a model reaches it over MCP or a project posts its own numbers to one address. Every limit below is a value in the code.',

    mcp: {
      tag: 'Over MCP',
      /* `packages/mcp/src/index.ts`: `TOOLS` holds sixteen entries, ten carrying `writes: false`. */
      title: 'Sixteen tools, and ten of them only read.',
      lead: 'An agent reads the record the way a person does, and what it writes lands as an event carrying its name. Nothing here is a separate copy of your data.',
      readsTitle: 'Read',
      reads: ['record_index', 'context', 'schema', 'get', 'list', 'search', 'history', 'activity', 'money', 'governance'],
      writesTitle: 'Write',
      writes: ['propose', 'create', 'update', 'log', 'handoff', 'meet'],
      /* `RESOURCES` in the same file: five `uriTemplate` entries. */
      resourcesTitle: 'And five addresses a client can read directly',
      resources: [
        { uri: 'braindog:schema/{register}', said: 'The fields of one register.' },
        { uri: 'braindog:page/{slug}', said: 'One page with every block run: rows and figures, never markup.' },
        { uri: 'braindog:metric/{id}', said: 'One figure, with its target and how it compares.' },
        { uri: 'braindog:skill/{name}', said: 'The text of one skill, and when to reach for it.' },
        { uri: 'braindog:declaration/{slug}', said: 'One page as declared, to change and propose back.' },
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
