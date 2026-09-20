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
 * THE DRAWINGS ARE COPY TOO. The home page draws two working things rather than pictures of them: a
 * ledger whose events are only ever added to, and a switcher that rearranges the page as you pick
 * who the record is for. Every name, figure and time in both is below, read off the demo record
 * (`apps/web/src/lib/record/data.ts` and `packages/seed/src/index.ts`). Nothing in a drawing is
 * invented: when the seed's sample business changes, these change with it, not before it. A key
 * that nothing renders is deleted rather than kept for later.
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
     * There is no demo to open. `apps/worker/wrangler.jsonc:270` and `:360` both set
     * `DEMO_RECORD: ""`, and `apps/worker/src/route.ts:139` answers `null` for an unset one, so the
     * anonymous door never opens in either environment. A primary button naming a verb the product
     * cannot perform is the exact defect `test/content.test.ts` says this app keeps shipping, and
     * it was in the one filled button on the page.
     *
     * The note under it is the state rather than a reassurance. It used to read `No sign-up.`,
     * which was meant as *nothing is asked of you* and reads, once there is no demo behind the
     * button, as *there is no way in*. That second reading is the true one, so it is said plainly.
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
    note: 'Neither plan is open yet.',
  },

  /**
   * THE FOUR FIGURES UNDER THE HERO, and every one of them was counted on 2026-09-21 rather than
   * remembered. `apps/site/DESIGN-NOTES.md` §4 carries the command beside each.
   *
   *   16   the `name:` keys of `packages/mcp/src/index.ts:163-329`
   *    5   the `TEMPLATES` array of the same file
   *    1   `apps/selfhost/src/main.ts:105`: the record is one file (of three an install writes,
   *        which is why the label says the record and not the installation)
   *   30   `apps/selfhost/src/snapshots.ts:30` and `apps/worker/src/snapshots.ts`, both hosts
   *
   * TWO FIGURES FROM THE BRIEF ARE NOT HERE and the reason is the rule above: a commit count moves
   * every hour on a site that redeploys on a schedule, and the brief's gate count was 31 where the
   * registered list in `tools/gates/run.mjs` holds 30. A number that has to be re-earned on every
   * deploy is a number this file will eventually ship stale, which is the defect it exists to stop.
   */
  facts: {
    items: [
      { figure: '16', label: 'tools an agent can call' },
      { figure: '5', label: 'resource templates beside them' },
      { figure: '1', label: 'file holds your record' },
      { figure: '30', label: 'nightly backups, either host' },
    ],
  },

  /**
   * THE LEDGER UNDER THE HERO, which the home page draws as rows rather than as a picture of rows.
   * `head` and `only` are its heading, drawn as one line.
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
   * THE ARRANGEMENT SWITCHER on the home page: pressing a case redraws the section, so the claim
   * above it is made by the page doing the thing rather than by a sentence about it.
   *
   * `id` is what the switcher tracks and what /start calls the setup. `holds` is the pages and the
   * lists that setup ships, each under the name the record itself gives it, so a reader can check
   * this list against the screen they get after Make my record.
   */
  arrange: {
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
     * `Turn a module off, People included` IS FROM THE CHANGELOG OF 2026-09-14 and is the detail
     * `research-site-copy.md` ranks fifth of the eight things this page should say and does not:
     * the granularity goes all the way down to the one register most products treat as
     * infrastructure.
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
   * THE ONE SENTENCE ON THE SITE THAT TEACHES THE WORD REGISTER by example.
   *
   * `test/content.test.ts` reads the register names back out of the served page and checks each
   * against the seed's declarations, so `money, services, people` cannot be edited here alone. The
   * picture beside it is the demo's home screen, photographed by `scripts/product.mjs`, and `alt`
   * says what that screen holds for somebody who is not shown it.
   */
  typed: {
    title: 'Typed rows, not a pile of notes',
    lead:
      'A register is a typed collection: money, services, people. So "what is due in October" has ' +
      'an answer, not a search.',
    /**
     * THE CAPTION FOR A PICTURE THAT IS NOW THE WIDTH OF THE SCREEN.
     *
     * It read `the demo record, at full size`, which was a promise about the pixels made inside a
     * 420px window that showed about a third of them. The picture is full-bleed now and the
     * capture is 1440 CSS px wide, so at a 1440 viewport it paints one device pixel per captured
     * pixel and the sentence is finally literal. `loop/research-site-reference.md` §5 measured
     * that none of the four references boxes its primary product image.
     */
    caption: 'One record, photographed on the day this build was made',
    alt:
      'The home screen of a record: what it is owed and what is due, the money falling due this ' +
      'week, the questions waiting on a decision, and what its agents and rules did while you ' +
      'were away.',
  },

  /**
   * AGENTS, with the limit in `note` and not in a footnote.
   *
   * THE RATIONALE HERE USED TO SAY *the transport is written and the hosted door is not*, and the
   * hosted door IS written: `apps/worker/src/index.ts:1020-1032`, routed at
   * `apps/worker/src/route.ts:70`, with `apps/worker/test/mcp.test.ts` over it. The public
   * sentence in `note` was right for a different reason, which is worth having straight before
   * somebody edits it: a hosted record is what nobody can open yet, not the door into one. A
   * buyer who reads specifications works that out in about four minutes, so better it comes from
   * us.
   *
   * THE TWENTY-ONE NAMES BELOW ARE THE SURFACE ITSELF, and they are here because
   * `loop/research-site-copy.md` ranks this first of the eight things the page should say and does
   * not: *"Agents get a typed surface, not a chat window."* The old section said agents "read and
   * write the same rows", which undersells a surface built so a session can ask for a schema, a
   * filtered list, a search, an activity feed, a money view, a governance queue, and hand context
   * to the next session, all typed and none of it scraped HTML.
   *
   * THEY ARE COPIED FROM THE DECLARATION AND NOT INVENTED. `tools` is every `name:` key of
   * `packages/mcp/src/index.ts:163-329`, in declaration order; `templates` is the `name` of each
   * entry in that file's `TEMPLATES` array. `schema` appears in both lists and that is not a
   * mistake: it is a tool a caller runs and a resource a client can subscribe to, which is why the
   * two lists are drawn under two headings rather than merged into one of twenty.
   */
  agents: {
    title: 'Agents propose. You decide.',
    lead:
      'Claude, Codex and Cursor read and write the same rows you do, over MCP, with a key you ' +
      'issue. Every change carries a name.',
    toolsHead: 'Tools',
    tools: [
      'record_index',
      'context',
      'schema',
      'get',
      'list',
      'search',
      'history',
      'activity',
      'money',
      'governance',
      'propose',
      'create',
      'update',
      'log',
      'handoff',
      'meet',
    ],
    templatesHead: 'Resource templates',
    templates: ['schema/{register}', 'page/{slug}', 'metric/{id}', 'skill/{name}', 'declaration/{slug}'],
    note: 'Agents reach a self-hosted record today.',
  },

  /**
   * THE OWNER'S OWN CASE: numbers arriving from the projects themselves, drawn as dashboards.
   * `caption` says where the numbers in the picture came from, because a dashboard with no
   * provenance is a mock-up.
   */
  report: {
    title: 'Your projects report. Your dashboards draw.',
    lead: 'Give a project a report key, or an address to poll. The numbers arrive and the tiles draw.',
    /**
     * WHAT A LEAKED REPORT KEY CAN ACTUALLY DO, which is the fourth thing
     * `loop/research-site-copy.md` says this page should say and does not.
     *
     * Every figure is read off `packages/record/src/report.ts:1-30`. A developer deciding whether
     * to paste a credential into a deploy script checks exactly this before anything else, and
     * "give a project a report key" on its own invites them to assume the worst, which is an API
     * token with read access to their whole record. It is the opposite: it cannot read one row of
     * the record it writes into.
     */
    specHead: 'What a report key can do',
    spec: [
      { term: 'Direction', def: 'Write only. It cannot read a row.' },
      { term: 'Reach', def: 'One register, and a fixed set of fields.' },
      { term: 'Per call', def: '100 rows, 256 KB.' },
      { term: 'Per minute', def: '600 rows.' },
    ],
    caption: 'sixty days of rows, written the way a project reports them',
    /* `region` WENT WITH THE SCROLLING BOX IT NAMED. It was the accessible name of a 420px window
       a reader had to scroll, and there is no window now: the picture is painted at its own size
       and the band clips what will not fit. This file's own rule is that a key nothing renders is
       deleted rather than kept for later, and `typed.region` went the same way in the same pass. */
    alt:
      "A founder's Dashboard: cash across organisations, the balance of each, and active users, " +
      'recurring revenue and signups drawn against the thirty days before.',
  },

  /**
   * WHAT A READER CAN HOLD THE PRODUCT TO, what is not built, and what it will never do, in three
   * columns side by side. The middle column is the reason the other two get believed.
   */
  plain: {
    title: 'Plain about what it is',
    columns: [
      {
        head: 'Yours to keep',
        /**
         * ALL THREE OF THESE WERE FALSE OR OVERSTATED, and an audit falsified each with one grep.
         * They are the three sentences on the page a reader is most likely to check, which is the
         * whole point of the column, so they are the three worst ones to have got wrong.
         *
         *   - `The code is on GitHub` is true of the address and not of a reader: the repository
         *     is private and the link 404s. `/legal` admitted it and this page did not, which is
         *     exactly the footnote this file's own rule forbids.
         *   - `One SQLite file` is the record. An installation writes three things
         *     (`apps/selfhost/src/main.ts:105`, `:171`, `:257`): the record, a second database
         *     holding sign-in and people, and a `blobs` directory where attachments live OUTSIDE
         *     the record. The pricing page kept the qualifier and this page dropped it.
         *   - `Nothing is overwritten` is the hero's claim and falls for the hero's reason.
         */
        /* THE THIRD LINE WAS THE HERO'S SENTENCE AGAIN, WORD FOR WORD. `hero.sub` already ends
           `Every change is an event, and the log only grows`, and the same ten words a second
           time three bands down is not a second reason to believe it: it is the page counting
           one claim twice. The column is two lines now, and the claim is made once, at the top,
           where the ledger beside it is busy demonstrating it. */
        lines: [
          'Open source. The code opens on GitHub when the product launches.',
          'Your record is one file. Leaving is a copy, not a migration.',
          /* THE STRONGEST ANSWER TO "WHAT HAPPENS IF I LEAVE" AND IT WAS ON NEITHER MARKETING
             PAGE. `loop/research-site-copy.md` ranks it third: the self-host writes a signed,
             versioned export, the hosted Cloud takes the same format as its nightly backup, and
             thirty are kept on both sides (`apps/worker/src/snapshots.ts:1-30`,
             `apps/selfhost/src/snapshots.ts:30`). The pricing page offered "your own backups" to
             self-hosters only, which reads as a reason NOT to take the hosted plan. */
          'Thirty nightly backups, in the same portable format on either host.',
        ],
      },
      {
        head: 'Not built yet',
        lines: [
          /* THE LINE THAT STOOD HERE WAS FALSE. See the note on `arrange.note`, which is where the
             true half of it now lives. What IS unbuilt, and what this replaces it with, is the
             other Spark: `packages/spark` answers a typed question against a person's own rows and
             cites what it read (`packages/spark/src/propose.ts:1-25`), and
             `grep -rl "@braindog/spark" apps/worker/src apps/selfhost/src` returns nothing, so no
             host reaches it. A visitor can do nothing with it today, which is the definition of
             this column. */
          'Asking your record a question in words. The engine is written; no host reaches it yet.',
          'Mail does not arrive by itself.',
          /* THE DEMO BELONGS IN THIS COLUMN and was in none of them, which is how the page came
             to point its one filled button at it. `DEMO_RECORD` is empty in both environments. */
          'Neither plan is open, and there is no demo to open yet.',
        ],
      },
      {
        head: 'It will not do',
        /* `file anything for you` WAS IN THIS COLUMN AND CONTRADICTED THE DIRECTION DOCUMENT.
           `loop/DIRECTION.md:224` schedules exactly that: *agents do the legwork in view: filing
           invoices from email, chasing, flagging, proposing*. This column is a list of permanent
           never-promises, so a capability the owner has written down as planned cannot be in it.
           Double entry stays, because DIRECTION §2 is explicit that Money is not a ledger. */
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
    title: 'Start your record',
    /* IT SAID `The demo is a made-up business`, and there is no demo. What is true and is the
       better sentence anyway: making a record is two answers long. `/start` asks who you are and
       what the record is for, and arranges the rest from those (`packages/seed/src/usecases`). */
    body: 'A record of your own starts with two answers: who you are, and what it is for.',
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
    status: 'Neither plan is open. No sign-up and no billing yet.',
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
     */
    compareTitle: 'What actually differs',
    compare: {
      columns: ['', 'Self-hosted', 'Hosted'],
      rows: [
        ['The software', 'The same build', 'The same build'],
        ['Runs on', 'Your machine, one process, one port', 'Cloudflare, run by us'],
        ['Your record lives in', 'One file on your disk', 'A database of its own, never shared'],
        ['Backups', 'Nightly, thirty kept', 'Nightly, thirty kept'],
        ['Leaving', 'Copy the file', 'Export the file, whenever you like'],
        ['Price', 'Free', '$12 a month, per record'],
      ],
    },
    honestTitle: 'Why there is no free hosted tier',
    honest:
      'No free hosted tier, on purpose. A per-customer database with no revenue against it ends as ' +
      'a product that gets worse for the people paying for it.',
  },

  /**
   * THE PAGE A MISTYPED ADDRESS LANDS ON. Cloudflare serves it with a 404 for any path the build has
   * no file for (`not_found_handling` in `wrangler.jsonc`), in place of a blank white page.
   */
  notFound: {
    title: 'There is no page here',
    lede: 'The address may be mistyped, or the page may have moved. These are the pages brain.dog has.',
    links: [
      { label: 'Home', href: '/' },
      { label: 'Pricing', href: '/pricing' },
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
      body: [
        'BrainDog is open source. The software is licensed under the Apache License 2.0, and the renderer in packages/render is licensed under the MIT License.',
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

  footer: {
    tagline: 'Give your business a memory',
    columns: [
      {
        title: 'Product',
        links: [
          { label: 'Pricing', href: '/pricing' },
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
