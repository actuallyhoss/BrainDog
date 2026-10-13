/**
 * Projects: the things you run, their frozen identity hues, and the one page template every project shares.
 *
 * One module of the sample record, split out of `index.ts` so each first-party module's registers, rows,
 * figures and pages sit in one file. `index.ts` composes them and keeps every export it had.
 */

import { LOOKUPS, OPEN, day, gbp, type Fields, type SeedMetric, type SeedPage, type SeedRegister, type SeedRule } from './base.ts';

/* ── things, and their frozen identity hues ───────────────────────────────
   The hue is chosen at create by the theme's `nextAccentHue` and written once. The kernel never
   computes it: a hue seven degrees from `earn` is an intent, not a mark. */

/**
 * The write-up shape a month of real use settled into (05 §7.6). Nobody designed it; it is worth
 * writing down so an agent does not rediscover it:
 *
 *   1. a `chips` line at the very top, with `{{path}}` values, so the page answers itself before
 *      anyone scrolls
 *   2. `# Name`, then a status line
 *   3. numbered `## N · Title` sections, EACH OPENING WITH A BLOCK AND THEN PROSE
 *   4. for research: `## What is not verified` and `## Sources`
 *   5. a `## Log` of dated one-liners — the document's own history
 *   6. settled things marked so nobody re-runs them
 *
 * The last block is malformed on purpose. It is the visible fence, and it is the only feedback
 * channel an agent has.
 */
const KILN_NOTE = `\`\`\`chips
● | 3 | cuts
● | 2 | clients | good
● | 1 | open question | warn
\`\`\`

# Kiln

Earning · a variable type family, licensed direct. {{money:1840000 GBP}} in the last twelve months, and
earning since March 2024.

## 1 · Where the money comes from

\`\`\`bar | Revenue by channel, twelve months
Direct licences | 11200 | 61%
Studio deals | 5300 | 29%
Specimen prints | 1900 | 10%
Unattributed | 3400 | | hole
\`\`\`

Direct licensing carries it, and that is the thing to protect. The unattributed row is not a
channel: it is three months of payouts that arrived before the reference field existed, and it
sits outside the scale because a hole that sets the bar makes every real category a stub.

## 2 · The licensing question

\`\`\`spec | What each model costs to run
Per seat | Honour system | every foundry does this
Per product | One number per shipped thing | needs a definition of "shipped"
Flat studio | One price, no counting | hardest to raise later
\`\`\`

Open as SG31 and it blocks two quotes. The September issue announces whichever wins, so it is not
deferrable past {{date:2026-09-20}}.

## 3 · What is on the roadmap

\`\`\`steps | Next three
Variable axis QA | the new cut, all weights | doing
Specimen page | one screen, no marketing | open
Licence generator | reads the tier, emits the PDF | blocked
\`\`\`

## 4 · The estate underneath it

\`\`\`spec | Domains and hosting
kiln.example | renews {{until:2026-09-15}} | the apex
kilnfonts.example | lapsing {verified: renewal email, 8 Aug} | auto-renew is off
Object storage | {{money:4100 GBP}} a month | the binaries
\`\`\`

\`\`\`note | Watch this | warn
\`kilnfonts.example\` is the redirect every old licence PDF points at. Letting it lapse breaks
links in files that have already been delivered, which is not a thing an apology fixes. Tracked
as {{ref:tasks#3}}.
\`\`\`

## What is not verified

- The 61% direct share {estimate}; it excludes the unattributed rows above.
- Whether studio deals renew at all {unknown}

## Log

\`\`\`timeline | Recent
{{ago:2026-08-14}} | Raised the studio tier | first increase since launch | good
{{ago:2026-07-02}} | Shipped the italic | four weights | good
{{ago:2026-05-19}} | Moved off the old CI | Hobnail cancelled
\`\`\`

Settled by research. Do not run it again: the domain host comparison is D41.

\`\`\`stat | This block is wrong on purpose
Too | many | cells | for | a | stat | row
\`\`\``;

export const THINGS: Fields[] = [
  /* GBP 18,400.00, AND THE NOTE FOUR LINES BELOW IT HAS SAID SO ALL ALONG. The field held
     `gbp(184_000)` — GBP 1,840.00, one zero short — while Kiln's own note opens "{{money:1840000
     GBP}} since March 2024" and its revenue chart breaks that down: 11,200 + 5,300 + 1,900 = 18,400,
     with printed shares of 61 / 29 / 10 that are exactly those over that total. Three figures agreed
     and the fourth did not, and the fourth is the one the register sorts, the grid shows and any
     future roll-up reads. */
  /* Where each project's work happens. Kiln is on a Mac and Portage on a Windows desktop, so both
     path shapes are placed; Portage's repository is named bare, as its runs report it.
     A REMOTE IS WRITTEN WHOLE, SINCE portfolio 1.14.0, as `git remote -v` prints it, over https or ssh: the record
     reads either as `host/owner/name` (`remoteKey` in `packages/kernel/src/scope.ts`), and an owner pasting what git
     printed should never have to trim it. And the domains each project lives at, which a mail from one is matched by. */
  /* HOW EACH ONE IS GOING, WHAT IS NEXT AND HOW FAR ALONG, kept current by whoever works on it: a person, or the agent named
     on the row. Kiln waits on how it is licensed and Portage on where it sends from, so both are the ones that need a call. */
  /* AND WHAT EACH ONE EARNED THE YEAR BEFORE, so the Overview's comparison is over four projects going four
     different ways rather than one shape repeated. Kiln is up, because its own note dates the first tier rise
     since launch to August and the italic to July. Marlow & Co is down, because the row's next step is chasing
     an invoice whose terms ran out 38 days ago. Portage started in May of this year and has earned nothing
     either year. Tallow earned in the year before and nothing since, which is what "park it or retire it"
     looks like as a pair of numbers, and it is out of every figure below because it is out of play. */
  /* AND WHAT EACH ONE IS, IN A LINE, since portfolio 1.6.0: the words under a project's name on the Overview's cards, so a
     list of names says which is the type family and which is the client's site without opening any of them. */
  { name: 'Kiln', about: 'A variable type family, licensed direct', lane: 'earning', health: 'at_risk', next: 'Settle how Kiln is licensed, before the September issue announces it', progress: 60, aim: day(17), agent: 'claude', revenue: gbp(1_840_000), earned_before: gbp(1_412_000), since: '2024-03-11', mark: '◆', hue: 214, note: KILN_NOTE, repos: ['https://git.kiln.example/type/kiln-type.git', 'git@git.kiln.example:type/kiln-site.git'], folders: ['/Users/studio/Code/kiln-type', '/Users/studio/Code/kiln-site'], domains: ['kiln.example', 'kilnfonts.example'] },
  { name: 'Marlow & Co', about: 'A brand system and site, made for a client', lane: 'earning', health: 'on_track', next: 'Chase Halden on invoice 2026-041 once its terms run out', progress: 85, agent: 'cursor', revenue: gbp(420_000), earned_before: gbp(510_000), since: '2023-01-08', mark: '▲', hue: 305, repos: ['https://git.marlow.example/brand/marlow-site.git'], folders: ['/Users/studio/Clients/marlow'], domains: ['marlow.example'] },
  { name: 'Portage', about: 'A newsletter, and the site it sends from', lane: 'building', health: 'off_track', next: 'Choose where the newsletter sends from, then wire the domain', progress: 35, aim: day(28), revenue: gbp(0), earned_before: gbp(0), since: '2026-05-02', mark: '●', hue: 176, repos: ['portage'], folders: ['D:\\Studio\\portage'], domains: ['portage.example'] },
  { name: 'Tallow', about: 'A display face that never shipped', lane: 'parked', next: 'Retire it or park it another year', revenue: gbp(0), earned_before: gbp(21_000), since: '2025-02-20', mark: '◼', hue: 261, repos: ['git@git.kiln.example:type/tallow.git'] },
];

/**
 * WHAT AGENTS SAID ABOUT THE PROJECTS THEY HOLD, so Changed by names them. The agent on a project keeps where it stands
 * current, and a record says so in its history: the row goes in without these fields and the agent writes them after.
 * `hours` is when, against the sample's `NOW`: the record writes each one then (`HISTORY`), and so does the sample's
 * ledger. `things` is the project's place in `THINGS`, from 1.
 */
export const PROJECTS_SAID: readonly { things: number; by: string; hours: number; fields: readonly string[]; note: string }[] = [
  { things: 1, by: 'claude', hours: -9.5, fields: ['health', 'next', 'progress'], note: 'said Kiln is at risk until its licensing is settled' },
  { things: 2, by: 'cursor', hours: -10, fields: ['next', 'progress'], note: 'set the next step on Marlow & Co to the chaser for 2026-041' },
];

export const PORTFOLIO_REGISTERS: Record<string, SeedRegister> = {
  things: {
    id: 'things',
    icon: 'thing',
    name: 'Projects',
    one: 'project',
    holds: 'what you are building, and the plan for each',
    title: 'name',
    mobile: ['name', 'lane', 'revenue'],
    state: 'lane',
    pack: 'portfolio',
    // Rows of this register HAVE an identity: one mark and one accent each, chosen at create and
    // frozen, never hand-picked and never the only signal (13 §2.1b).
    identity: { mark: 'mark', accent: 'hue' },
    /* THE PROJECTS, for every register with a `scope:` field: a run is placed in the project whose
       repositories or folders it is working in, and is global anywhere else. */
    scopes: { repos: 'repos', folders: 'folders' },
    /* A PROJECT OTHER ENTRIES POINT AT STAYS, SINCE portfolio 1.16.0 (REC-C08, "there is no delete"). A task, a bill, a
       service or a person that names it was left pointing at nothing when it went; now the delete is refused and the
       sentence names the lists that still point at it and how many, as Accounts does. A project nothing points at
       goes, and comes back, as before. Finished is how a project leaves the board. */
    delete: 'refuse_while_referenced',
    fields: [
      { id: 'name', type: 'text', required: true, search: true },
      /* WHAT IT IS, IN A LINE, SINCE portfolio 1.6.0: "a variable type family, licensed direct". Drawn under the name on
         the Overview's cards, where a column of bare names said nothing to somebody who had not opened each one. Text
         and optional, so every project already written stays valid and an importer fills it where its source says. */
      { id: 'about', label: 'About', type: 'text', search: true },
      /* SAID IN SENTENCE CASE, SINCE portfolio 1.9.0: the split under Where they are printed the stored words, "earning"
         and "building", where every other label on the page starts with a capital. `retired` reads Finished, as the fold
         of the parked and finished ones already calls it. */
      {
        id: 'lane',
        label: 'Status',
        type: 'enum',
        values: ['building', 'earning', 'parked', 'retired'],
        labels: { building: 'Building', earning: 'Earning', parked: 'Parked', retired: 'Finished' },
        index: true,
        required: true,
      },
      /**
       * WHAT IT EARNS, OVER WHICH TWELVE MONTHS, AND WHAT THE TWELVE BEFORE THEM EARNED.
       *
       * `revenue` was one money field with no label and no period on it, and the page about the
       * projects drew it nowhere: the Overview's eight blocks were a count, a split, cards, four
       * tables and a fold, and not one of them a sum of money. He runs several businesses, and the
       * page about how they are doing had no figure for how they are doing. Two things had to be
       * settled before it could be drawn.
       *
       * WHICH TWELVE MONTHS, AND KILN'S OWN NOTE ANSWERS IT. The note heads its revenue chart
       * "Revenue by channel, twelve months" and the three channels come to 11,200 + 5,300 + 1,900 =
       * 18,400, which is `revenue` to the penny. So the field is a year, `since` is the day the
       * project started earning rather than the start of the period, and the label says the period
       * instead of leaving a reader to guess it from a chart inside a note.
       *
       * AND THE YEAR BEFORE IS A SECOND FIELD, BECAUSE THE ENGINE CANNOT WORK IT OUT. A figure's
       * `compare:` reads the same predicate against a moved clock, and `kernel/src/metrics.ts`
       * refuses to report a delta when the predicate does not mention time: "the predicate does not
       * mention time, so the window moves nothing". `revenue` carries no date of its own, so a moved
       * clock reads the same rows and the delta would be a structural zero dressed up as steady
       * trading. Either the project states the year before, or there is no comparison to draw.
       */
      { id: 'revenue', label: 'Earned in a year', type: 'money' },
      { id: 'earned_before', label: 'Earned the year before', type: 'money' },
      { id: 'since', type: 'day' },
      /* WHERE A PROJECT STANDS, in the words anybody working on it keeps current. The values are Work's thread health, so a
         project and a thread say "at risk" the same way. */
      {
        id: 'health',
        label: 'Health',
        type: 'enum',
        values: ['on_track', 'at_risk', 'off_track'],
        labels: { on_track: 'On track', at_risk: 'At risk', off_track: 'Off track' },
        index: true,
      },
      { id: 'next', label: 'Next step', type: 'text' },
      { id: 'progress', label: 'How far along', type: 'decimal', unit: '%', min: 0, max: 100 },
      { id: 'aim', label: 'Aiming for', type: 'day', index: true },
      /* THE AGENT WORKING ON IT, by the name it signs its runs with, as a task names one. A delegate, never the owner. */
      { id: 'agent', label: 'Agent', type: 'text', index: true },
      { id: 'mark', type: 'text' },
      { id: 'hue', type: 'int' },
      { id: 'note', type: 'document' },
      { id: 'repos', label: 'Repositories', type: 'list', of: 'text' },
      { id: 'folders', label: 'Folders', type: 'list', of: 'text' },
      /* THE DOMAINS IT LIVES AT, SINCE portfolio 1.14.0: `kiln.example`, so a mail, a deploy or a renewal naming one is
         read as about the project. A list of text, as an owner who added it by hand already had it, so the update lays
         the pack's field over theirs and keeps every row. */
      { id: 'domains', label: 'Domains', type: 'list', of: 'text' },
    ],
  },
};

/** A project somebody is working on: the ones with a page. */
const LIVE = 'lane is building or earning';

/** A money figure, in the record's own currency. */
const MONEY = 'money';

/** A count of projects, which is all the Overview's figures are. */
const counted = (metric: string, name: string, where: string, target: SeedMetric['target'] = { gte: 0 }): SeedMetric => ({
  metric,
  name,
  source: 'register.things',
  where,
  value: { count: 'id' },
  format: 'int',
  target,
  window: '30d',
  compare: 'none',
});

export const PROJECT_METRICS: Record<string, SeedMetric> = {
  /* ── the portfolio, over Projects alone ─────────────────────────────────────
     Every figure here reads the projects list and nothing else, so the Overview works on a record that keeps only
     projects: a student's passion projects, a founder's apps, a team's products, or one new project and its plan. */
  /* REMEMBERED EACH NIGHT, SINCE portfolio 1.6.0, so the tile draws how many are in play over twelve weeks as a line
     (`trend: 12w` on the Overview), the way Cash now and Open tasks do. A record draws the line once it has run a
     night; before that the tile is the figure alone. */
  'projects-live': { ...counted('projects-live', 'In play', LIVE), snapshot: { grain: 'day', into: 'series.projects-live' } },
  /* WHAT NEEDS A PERSON: a project somebody, or its agent, said is at risk or off track. */
  'projects-need-you': counted('projects-need-you', 'Need you', `${LIVE}, health is at_risk or off_track`, { lte: 0 }),
  /* WHAT IS GOING WELL, which the line names beside what needs a push (portfolio 1.12.0). */
  'projects-on-track': counted('projects-on-track', 'On track', `${LIVE}, health is on_track`),
  'projects-with-agent': counted('projects-with-agent', 'With an agent', `${LIVE}, agent is set`),
  'projects-aim-30d': counted('projects-aim-30d', 'Aiming within 30 days', `${LIVE}, aim after yesterday, aim before +31d`),
  'projects-past-aim': counted('projects-past-aim', 'Past the day they aimed for', `${LIVE}, aim before today`, { lte: 0 }),
  'projects-parked': counted('projects-parked', 'Parked', 'lane is parked'),
  /* WHAT THE OVERVIEW'S FOLDED TILES ARE DRAWN ON, SINCE portfolio 1.8.0, each over its tile's own clauses, so a tile is
     never drawn empty and never hidden while it holds a project. */
  'projects-aiming': counted('projects-aiming', 'Aiming for a day', `${LIVE}, aim is set`),
  'projects-not-in-play': counted('projects-not-in-play', 'Parked or finished', 'lane is parked or retired'),
  /* WHAT THE FOLD OVER THOSE THREE TILES IS DRAWN ON: a project in play that says what it earns, is held by an agent or
     aims for a day, so a record with none reads no folded heading over nothing. A tree, because it ORs three fields. */
  'projects-looked-up': {
    ...counted('projects-looked-up', 'Earning, with an agent or aiming', LIVE),
    where: {
      all: [
        { field: 'lane', in: ['building', 'earning'] },
        { any: [{ field: 'revenue', present: true }, { field: 'agent', present: true }, { field: 'aim', present: true }] },
      ],
    },
  },
  'projects-retired': counted('projects-retired', 'Finished', 'lane is retired'),
  /* HOW THE PROJECTS IN PLAY ARE GOING, as parts of one whole, with the ones nobody has said about as their own part. */
  'projects-by-health': { ...counted('projects-by-health', 'How they are going', LIVE), group_by: 'health' },
  /* EVERY PROJECT BY ITS STATUS, SINCE portfolio 1.6.0: one track cut into earning, building, parked and finished, so the
     Overview says in one line where the projects are before it lists any of them. Over every project and not only
     those in play, because a strip of the whole is what says how much of it is parked. `lane` is required, so no
     project is in no part. */
  'projects-by-lane': { ...counted('projects-by-lane', 'Where they are', 'lane is set'), group_by: 'lane' },

  /* ── what they earn ───────────────────────────────────────────────────────
     OVER PROJECTS ALONE, AND THAT IS NOT A PREFERENCE. The Portfolio pack needs no other list, and
     `first-party.test.ts` holds it to exactly that (`portfolio: []`), so a figure here sourced from
     Money's ledger would make Portfolio install Money with it, and would leave an Overview that
     cannot open on a record that keeps only projects. A figure over somebody else's register is
     what `project-owed` and `project-cost` below are, and both of them are drawn on the PROJECT
     page, where `projectTemplate` takes a figure out of a record that does not keep the list it
     reads. The Overview has no such machinery, so what a project earns is the project's own
     statement, read off the project's own row.

     ONE CURRENCY, OR NO NUMBER, AND THE RECORD'S, SINCE portfolio 1.5.0. `format: 'money'` is added
     up in the record's home currency when one is set, else in the one currency the rows are in;
     it named sterling before, which is one studio's currency and not
     the person's. A sum over rows in two currencies is converted at the record's own dated rates, or
     comes back as one amount per currency with no total at all (`kernel/src/metrics.ts`); it is never
     the two added together, which is the arithmetic the whole money type exists to refuse.

     AND `compare: 'none'` ON ALL THREE, which is a statement and not an omission. The comparison
     the engine offers is the same predicate against a moved clock, and these predicates name no
     date, so a moved clock reads the same four rows: the delta would be structurally zero and the
     tile would say steady about a business nobody measured. The year before is a field, and the
     comparison is the diff below.

     AND OVER THE PROJECTS THAT HAVE SAID, WHICH IS WHY ALL FOUR CARRY `revenue is set`: THE OVERVIEW
     TOLD AN IMPORTED RECORD IT EARNED NOTHING. Driven on a self-host at a real record's size,
     21 registers and 26 projects imported through an import door plus the founder pack's
     one example project: 27 projects, 14 of them in play, and not one annual figure on any of them,
     because the importer filed a project's monthly revenue as a READING and had no
     year to write. `projects-earning` answered `value: 0, rows: 14, held: 27, met: true`, so the
     Earning tile drew "Earned in a year GBP 0.00" with "GBP 0.00 the year before", in the GOOD tone
     and linked into the list, in the same block row as a bar correctly drawing "No project in play
     says what it earns". That record held a monthly figure for three of those projects at the time.

     THE IMPORTER IS NOT THE THING TO CHANGE, AND THE ARGUMENT IS ALREADY IN THIS TREE. `estate-year`
     multiplies a service's `cost` by its cycle and is called "Cost per YEAR": a subscription is a
     standing commitment, so twelve of a monthly one is a rate that will be paid. This field is
     "Earned IN a year": a total that happened. Twelve times a monthly figure is a run rate and not a
     total, so an importer writing it here would be putting a forecast in a field the page reads as
     history, and one of the three monthly figures on that record is a salary, where twelve of it
     asserts a year of employment nothing in the export states. Nor can these figures read the
     reading: `datapoints` is declared by the `usecase-founder` use case, so a figure over it would
     make Portfolio install a use case and would shut the Overview on a record that keeps only
     projects. Both halves are right about their own kind of fact. What was wrong was this
     predicate.

     A ROW WITH THE FIELD UNSET IS NOT A PROJECT THAT EARNED NOTHING, and a money sum cannot say the
     difference: a sum over no values is zero and the kernel means it to be (`metrics.ts`, "a sum of
     nothing is"). `held` does not rescue it either, because `held` is the whole register by design,
     so "zero matched over rows that exist is good news" reads a field nobody filled in as a year
     measured at nil. The one number left is `rows`, and `revenue is set` is what makes it honest:
     over the drive above the reading becomes `rows: 0` where the register holds 27, and the figure
     is now over exactly the rows the bar beside it draws, which is what a total and its breakdown
     have to be for the two to be one statement.

     AND IT CLOSES A SECOND LIE NOBODY HAD SEEN: a project in play stating `earned_before` and no
     `revenue` is a project that has said nothing about this year, and under `where: LIVE` the diff
     read its absence as a fall. Measured on the sample with one such project added at GBP 21,000:
     the comparison went from GBP 3,380.00 up to GBP 17,620.00 down, a collapse the record never
     stated. */

  'projects-earning': {
    metric: 'projects-earning',
    name: 'Earned in a year',
    source: 'register.things',
    where: `${LIVE}, revenue is set`,
    value: { sum: 'revenue' },
    format: MONEY,
    target: { gte: 0 },
    window: '12m',
    compare: 'none',
    /* REMEMBERED EACH NIGHT, SINCE portfolio 1.6.0, for the Earning tile's line: what the projects say they earn moves
       when somebody writes a new year onto one, and the line is where that shows. */
    snapshot: { grain: 'day', into: 'series.projects-earning' },
  },

  'projects-earning-before': {
    metric: 'projects-earning-before',
    name: 'Earned the year before',
    source: 'register.things',
    where: `${LIVE}, revenue is set`,
    value: { sum: 'earned_before' },
    format: MONEY,
    target: { gte: 0 },
    window: '12m',
    compare: 'none',
  },

  /* HOW MANY OF THEM SAID, WHICH IS THE ONLY THING THAT STOPS GBP 0.00 BEING A CLAIM. The headline
     is a money sum and a money sum of nothing is zero, so the figure itself cannot hold the
     difference between a portfolio that earned nothing and a portfolio nobody has told. The tile
     says both numbers instead: the total, and how many of the projects in play it is a total of.
     `{{projects-earning-said}} of {{projects-live}}` reads "0 of 14" on the drive above and "3 of 3"
     on this sample, and 0 of 14 is a sentence a person can act on where a green GBP 0.00 was not. */
  'projects-earning-said': counted('projects-earning-said', 'Saying what they earn', `${LIVE}, revenue is set`),

  /* ONE FIGURE AND NOT A SUBTRACTION ON THE PAGE. A page that draws two tiles and subtracts them
     has nowhere to refuse when the two are in different currencies: it would print the difference
     between pence and cents. A `diff:` is read by the kernel's pair arithmetic, which converts both
     halves into one currency at the record's rates or answers in parts and names the pair it has no
     rate for. Its target is zero because the question the tile asks is whether the year is up on
     the one before, and that is the only bound that is not somebody's guess.

     ITS PREDICATE IS THE OTHER TWO'S, and it has to be: the comparison is the two halves over ONE
     set of rows, so a clause on the halves and not on the diff would be a difference between two
     different portfolios. */
  'projects-earning-change': {
    metric: 'projects-earning-change',
    name: 'Against the year before',
    source: 'register.things',
    where: `${LIVE}, revenue is set`,
    value: { diff: { of: { sum: 'revenue' }, per: { sum: 'earned_before' } } },
    format: MONEY,
    target: { gte: 0 },
    window: '12m',
    compare: 'none',
  },

  /* ── the same three, narrowed by one ref ──────────────────────────────────
     PARAMETERISED, not copied. These were `kiln-open`, `kiln-owed` and `kiln-cost` with the name
     typed into each predicate, so a second project meant three more documents. `{{it}}` is filled
     from the id — `project-open:Portage` — which is what makes one project page a declaration
     rather than a thirteenth case. */

  'project-open': {
    metric: 'project-open',
    name: 'Open',
    source: 'register.tasks',
    where: 'thing is {{it}}, state is not backlog or done or dropped',
    value: { count: 'id' },
    format: 'int',
    target: { lte: 5 },
    window: '30d',
    compare: 'none',
  },

  /* WHAT IS MOVING ON A PROJECT, from its tasks alone: a record that keeps no money still has these to say (`projectTemplate`). */
  'project-due-soon': {
    metric: 'project-due-soon',
    name: 'Due soon',
    source: 'register.tasks',
    where: 'thing is {{it}}, state is not backlog or done or dropped, by after yesterday, by before +8d',
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  'project-in-review': {
    metric: 'project-in-review',
    name: 'In review',
    source: 'register.tasks',
    where: 'thing is {{it}}, state is review',
    value: { count: 'id' },
    format: 'int',
    target: { lte: 0 },
    window: '30d',
    compare: 'none',
  },

  /* WHAT ON A PROJECT WAITS ON A PERSON, handed back to be checked or blocked: what its Handed back tile lists, so the
     tile is drawn only while it lists something (portfolio 1.10.0, where it was drawn on everything open). */
  'project-held-up': {
    metric: 'project-held-up',
    name: 'Handed back or blocked',
    source: 'register.tasks',
    where: 'thing is {{it}}, state is review or blocked',
    value: { count: 'id' },
    format: 'int',
    target: { lte: 0 },
    window: '30d',
    compare: 'none',
  },

  /* WHETHER ANYBODY HAS SAID WHERE A PROJECT STANDS, SINCE portfolio 1.16.0 (REC-C16): how it is going, how far along,
     the day it aims for or the agent on it. The project page draws those four when one is said, and its own figures
     when none is, so a project nobody has described is never a dash. A tree, because it ORs four fields. */
  'project-said': {
    metric: 'project-said',
    name: 'Said where it stands',
    source: 'register.things',
    where: {
      all: [
        { field: 'name', is: '{{it}}' },
        { any: [{ field: 'health', present: true }, { field: 'progress', present: true }, { field: 'aim', present: true }, { field: 'agent', present: true }] },
      ],
    },
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /* WHAT WAS WORKED ON THIS WEEK, SINCE portfolio 1.16.0 (REC-C16): the tasks on a project written to in the last seven
     days, made, moved or finished. Read off the day the record stamps a task with when it changes, so it says the
     project is moving or has gone quiet without anybody typing a word about it. */
  'project-moved-7d': {
    metric: 'project-moved-7d',
    name: 'Changed this week',
    source: 'register.tasks',
    where: 'thing is {{it}}, updated_at after -8d',
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /* HOW LONG SINCE ANYBODY WORKED ON IT, SINCE portfolio 1.16.0 (REC-C16 part a): the days from the newest stamp the record
     put on a task of the project, made, moved or finished, to the reading's own day. Read off the record's own
     `updated_at` and never a typed day, so a project nobody describes still says "2 days" or "40 days". A project with no
     task reads nothing, never nought. Filed with Work beside `project-moved-7d`, by the list it reads. */
  'project-last-worked': {
    metric: 'project-last-worked',
    name: 'Last worked',
    source: 'register.tasks',
    where: 'thing is {{it}}',
    value: { age: 'updated_at' },
    format: 'days',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  'project-done-7d': {
    metric: 'project-done-7d',
    name: 'Done this week',
    source: 'register.tasks',
    where: 'thing is {{it}}, state is done, done_on after -8d',
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /* HELD TO THE MOST A PERSON SAID MAY BE OWED TO THEM AT ONCE, SINCE portfolio 1.5.0: Money's own setting
     (`most_owed_to_you`, `MONEY_TARGET_SETTINGS` in `money.ts`), which the record reads from the pack this figure is
     filed in, and a project owed more than the whole record's line is past it by the person's own measure. The number
     it carried was one studio's size in one currency. Empty until somebody sets it, so no verdict until then. */
  'project-owed': {
    metric: 'project-owed',
    name: 'Owed to you',
    source: 'register.obligations',
    where: `${OPEN}, direction is owed to me, thing is {{it}}`,
    value: { sum: 'amount' },
    format: MONEY,
    target: { setting: 'most_owed_to_you' },
    window: '30d',
    compare: 'none',
  },

  /* A SETTING OF SERVICES, SINCE portfolio 1.5.0 (`ESTATE_TARGET_SETTINGS` in `estate.ts`), because the figure reads
     services and is filed with them; empty, so no verdict until somebody sets the most a project may cost a year. */
  /* ONLY OVER WHAT SAYS A COST: `cost is set` is no narrower a sum, since a service with no cost adds nothing, and it
     is what lets the record tell "costs nothing" from "nobody filed a cost". A live product whose domain was imported
     with no cost read "Costs a year 0"; now no row matches over rows that are held, the reading is `unsaid`, and At a
     glance leaves the figure out (`told` in the kernel's `drawn.ts`). A cost typed as 0 is a cost, and is still said. */
  'project-cost': {
    metric: 'project-cost',
    name: 'Costs a year',
    source: 'register.services',
    where: 'thing is {{it}}, state is not cancelled, cost is set',
    value: { sum: { product: ['cost', { lookup: 'per_year', by: 'cycle' }] } },
    lookups: { per_year: LOOKUPS.per_year! },
    format: MONEY,
    target: { setting: 'most_a_year_on_a_project' },
    window: '90d',
    compare: 'none',
  },

  /* THE TASKS ON A PROJECT THAT HAVE A DAY, which is what a plan is: the project page draws them on a time axis
     (`roadmap`) when there is at least one, and says nothing about a plan a project does not have. The roadmap pack's
     own clauses (`packs/roadmap`), narrowed to the project. */
  'project-dated': {
    metric: 'project-dated',
    name: 'Planned with a day',
    source: 'register.tasks',
    where: 'thing is {{it}}, by is set, state is not done or dropped',
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /* WHAT MOVED ON A PROJECT, MONTH BY MONTH, in and out: Money's `in-by-month` and `out-by-month` narrowed to the project,
     from what moved and not from what was promised. Filed with Money by the list they read (`packs/first-party.ts`), and
     left off the project page on a record that keeps no Money (`PROJECT_LINKS`). */
  'project-in-by-month': {
    metric: 'project-in-by-month',
    name: 'Money in, by month',
    source: 'register.transactions',
    where: 'thing is {{it}}, state is cleared, transfer is false, direction is in, on after -13m',
    value: { sum: 'amount' },
    group_by: 'on',
    bucket: 'month',
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  'project-out-by-month': {
    metric: 'project-out-by-month',
    name: 'Money out, by month',
    source: 'register.transactions',
    where: 'thing is {{it}}, state is cleared, transfer is false, direction is out, on after -13m',
    value: { sum: 'amount' },
    group_by: 'on',
    bucket: 'month',
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /* ── this month so far, on one project ───────────────────────────────────
     WHAT CAME IN, WHAT WENT OUT AND WHAT WAS KEPT SINCE THE FIRST OF THE MONTH, SINCE money-core 3.2.0: the three
     figures a project page leads its money with, beside the twelve months under them. The clauses of the two by-month
     figures above, cut at the first of this month instead of thirteen months back and added up whole rather than by
     month, so the month in the chart and these three are one set of rows. Filed with Money by the list they read, and
     left off the page on a record that keeps no Money (`projectTemplate`).

     KEPT IS ONE FIGURE AND NOT A SUBTRACTION ON THE PAGE, for the reason `projects-earning-change` gives: the amount is
     signed by its direction (`LOOKUPS.sign`) and added up once, so money in one currency and out in another is answered
     as parts or converted at the record's rates, never subtracted as two bare numbers. */
  'project-in-month': {
    metric: 'project-in-month',
    name: 'In this month',
    source: 'register.transactions',
    where: 'thing is {{it}}, state is cleared, transfer is false, direction is in, on at least bom',
    value: { sum: 'amount' },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  'project-out-month': {
    metric: 'project-out-month',
    name: 'Out this month',
    source: 'register.transactions',
    where: 'thing is {{it}}, state is cleared, transfer is false, direction is out, on at least bom',
    value: { sum: 'amount' },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  'project-kept-month': {
    metric: 'project-kept-month',
    name: 'Kept this month',
    source: 'register.transactions',
    where: 'thing is {{it}}, state is cleared, transfer is false, on at least bom',
    value: { sum: { product: ['amount', { lookup: 'sign', by: 'direction' }] } },
    lookups: { sign: LOOKUPS.sign! },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
};

/**
 * WHAT ASKS A PERSON ON ITS OWN: a project still in play whose day has passed. It writes nothing; the question lands on
 * Decide, once per project and day, and the answer is theirs (move the day, or park it).
 */
export const PORTFOLIO_RULES: Record<string, SeedRule> = {
  'project-past-aim': {
    rule: 'project-past-aim',
    pack: 'portfolio',
    register: 'things',
    when: `${LIVE}, aim before today`,
    then: [{ suggest: { question: '{{name}} was aiming for {{ago:aim}}. Move the day, or park it?', options: ['Move the day', 'Park it'] } }],
    once_per: ['entry', 'aim'],
  },
};

const PROJECT = { field: 'name', label: 'Project', width: 'minmax(14ch,1fr)' } as const;

/** What was finished on a project in the last seven days, and how that moved over four weeks: At a glance's last figure. */
const PROJECT_DONE_CELL = { metric: 'project-done-7d:{{name}}', label: 'Done this week', trend: '4w' } as const;

/**
 * HOW MANY PROJECTS A TILE OF THE OVERVIEW HOLDS OPEN, since portfolio 1.15.0: past this many it folds shut. Four, the
 * number past which How they are going is drawn, so the page changes shape once, when it stops being short.
 */
const FOLD_PAST = 4;

/* THE TILES UNDER THE OVERVIEW'S TWO HEADINGS, each written once and drawn under whichever heading is: the open one
   while the list is short and the folded one when it is long (`PORTFOLIO_PAGES.portfolio`). */

/* WHAT EACH ONE EARNS, because the question a person asks of a portfolio after "what needs me" is "which of
   these is carrying the others". A total says the studio earned GBP 22,600 and hides that one project is 81 per
   cent of it. Two columns, so each part is the name against the money and nothing else.

   ONE TRACK CUT INTO PARTS, SINCE portfolio 1.6.0, where it was a bar a project: the question is a share of one
   whole, and a split says "81 per cent" by its length where bars side by side only say which is longest. The
   rows, the order, the empty line and the heading are the bar's.

   NO EARNING TILE BESIDE IT, SINCE portfolio 1.8.0. Its year was the sum of this split, said a second time; what each
   project earns is read off the split, and the year before is on each project's row. */
const EARNS = {
  kind: 'split',
  heading: 'What each one earns',
  icon: 'coins',
  span: 12,
  source: 'register.things',
  where: `${LIVE}, revenue is set`,
  columns: [{ field: 'name' }, { field: 'revenue' }],
  order: [{ field: 'revenue', dir: 'desc' }],
  limit: 8,
  when: { metric: 'projects-earning-said', gt: 0 },
};

/* HOW MANY OF THE PROJECTS IN PLAY SAY WHAT THEY EARNED, ALWAYS DRAWN BESIDE THE SPLIT, SINCE portfolio 1.16.0 (REC-C08
   step 6, "0 of 14"). The split is hidden while none says, so a record where nobody had said read nothing at all about
   earnings, and a split of two said nothing of the nine silent beside them. Two counts, never a sum: projects that earn
   in two currencies are counted once each, and no amount is added. Drawn while one project is in play, since "0 of 0"
   says nothing the line at the top does not.

   ONLY WHILE ONE SAYS, SINCE portfolio 1.17.0. "0 of 11 projects in play say what they earned in a year" read as a
   telling off on a record that never meant to say, under a split that was not drawn. So the line goes with the split
   it sits beside: both are drawn from the first project that says, and neither before. */
const EARNS_SAID = {
  kind: 'note',
  span: 12,
  when: { metric: 'projects-earning-said', gt: 0 },
  body: '{{projects-earning-said}} of {{projects-live}} projects in play say what they earned in a year',
};

/* WHAT AGENTS HOLD, and what each one is doing next on it. An agent takes a project by setting itself as its agent. */
const WITH_AGENT = {
  kind: 'table',
  heading: 'With an agent',
  icon: 'session',
  span: 12,
  source: 'register.things',
  where: `${LIVE}, agent is set`,
  columns: [
    PROJECT,
    { field: 'agent', label: 'Agent', width: '10ch' },
    { field: 'next', label: 'Next', width: 'minmax(20ch,2fr)' },
    { field: 'changed', label: 'Changed by', width: '16ch' },
  ],
  order: [{ field: 'name', dir: 'asc' }],
  limit: 12,
  when: { metric: 'projects-with-agent', gt: 0 },
};

const COMING_UP = {
  kind: 'table',
  heading: 'Coming up',
  icon: 'calendar-clock',
  span: 12,
  source: 'register.things',
  where: `${LIVE}, aim is set`,
  columns: [
    PROJECT,
    { field: 'progress', label: 'How far along', width: '14ch', align: 'end' },
    { field: 'aim', label: 'Aiming for', width: '14ch', align: 'end' },
  ],
  order: [{ field: 'aim', dir: 'asc' }],
  limit: 8,
  when: { metric: 'projects-aiming', gt: 0 },
};

const NOT_IN_PLAY = {
  kind: 'table',
  heading: 'Not in play',
  icon: 'archive',
  span: 12,
  source: 'register.things',
  where: 'lane is parked or retired',
  columns: [
    PROJECT,
    { field: 'lane', label: 'Status', width: '10ch' },
    { field: 'next', label: 'Next', width: 'minmax(18ch,2fr)' },
    { field: 'changed', label: 'Changed by', width: '16ch' },
  ],
  order: [{ field: 'name', dir: 'asc' }],
  limit: 20,
  when: { metric: 'projects-not-in-play', gt: 0 },
};

export const PORTFOLIO_PAGES: Record<string, SeedPage> = {
  /**
   * THE PORTFOLIO, LEADING WITH WHAT NEEDS YOU. "Which of my
   * projects are moving, which need a call, and where my agents are": the figures, the queue of projects somebody said
   * are at risk or off track with who said so, every project in play as a card, what agents hold, what is coming up, and
   * the parked and finished ones folded away. Every block reads Projects alone, so it opens on any record that keeps them.
   *
   * CALMER, SINCE portfolio 1.8.0 (DIRECTION §35): the line, then where the projects are and how they are going, what
   * needs you and the projects in play, and what each earns, what agents hold and what is coming up folded under them.
   * No figure is said twice: Need you is the line's, and the year earned is the sum of What each one earns. Every heading wears a glyph, and every tile over the projects is drawn only while it holds one.
   *
   * EACH THING ONCE, SINCE portfolio 1.11.0: the line, one track of how they are going, and the cards, with Needs you and
   * Where they are gone (the visual review of October 2nd).
   *
   * ONLY THE LINE SAYS WHAT IS EMPTY, AND THE PARKED ARE A COUNT, SINCE portfolio 1.13.0 (DIRECTION §37). With nothing in
   * play the line says so and how to start, where it said every project in play was on track over a page with none,
   * and In play is drawn only while it holds one. Parked and finished is a heading that counts what is folded under
   * it, and it read every one of those projects whole, its notes included, to say one number.
   *
   * NO FOLD OVER A SHORT LIST, SINCE portfolio 1.15.0 (DIRECTION §39, the second design review's fix 6). With three
   * projects in play the page ended on two folded headings, 56px each with a Show button, over 240px of empty page:
   * the fold hid less than it took to say it was there. What each earns, what agents hold and what is coming up are one
   * open tile while four projects or fewer are under it, and so are the parked and finished; past four each folds as
   * it did, since a long page is what a fold is for. Four, as How they are going is drawn past four.
   */
  portfolio: {
    page: 'portfolio',
    /* CALLED WHAT THE NAVIGATION CALLS IT, SINCE portfolio 1.9.0: the title read Overview under a top bar that says
       Projects, so a person pressed one word and landed on another. */
    title: 'Projects',
    nav: { section: 'Projects', order: 5 },
    icon: 'thing',
    requires: ['register.things'],
    pack: 'portfolio',
    blocks: [
      /* THE OPENING SENTENCE, SAID FROM THE FIGURES, SINCE portfolio 1.6.0: the line under the page's title, and the one
         thing read before any tile. Two notes on the one figure, so exactly one of them draws: how many projects somebody
         said are not going well, or that none is. Words from the figures only: which project is sliding and why is an agent's reading, and it
         arrives as a question in Decide, not as a sentence a page makes up. SINCE portfolio 1.13.0 a third, put first,
         speaks when nothing is in play, and the one saying nothing needs you then has no clause left to say, so a page
         still reads one line. */
      {
        /* THE ONE THING TO DO ON A PAGE WITH NOTHING IN PLAY, SINCE portfolio 1.13.0, which was In play's own empty line:
           a line is the one place a page says it is empty. FIRST OF THE THREE, because the record draws the one saying
           nothing needs you too over none in play, and the nightly line is written for the first line a page draws
           (`leadBlockOf` in `packages/record/src/headlines.ts`): asked of "across 0 projects", the model's line would
           be drawn over this one saying the same. This one has no figure, so no line is asked of it. */
        kind: 'note',
        lead: true,
        span: 12,
        when: { metric: 'projects-live', is: 0 },
        body: 'No project is in play. Add one, or set a parked one building.',
      },
      {
        kind: 'note',
        lead: true,
        span: 12,
        when: { metric: 'projects-need-you', gt: 0 },
        /* THE PROJECTS BY NAME, SINCE portfolio 1.12.0 (the visual review of October 2nd), where the line counted them
           ("3 projects in play, 2 at risk or off track"): which need a push and which are on track, from what each one's
           health says (`.names`), so the verb agrees with how many it names. A record with nothing on track says the
           first half alone. */
        body: '{{projects-need-you.names}} need(s) a push, {{projects-on-track.names}} is on track',
      },
      {
        /* SAID OF THE PROJECTS IN PLAY, SINCE portfolio 1.13.0, so with none in play the clause has no figure left and the
           first note speaks instead: "Every project in play is on track" was true of an empty list. */
        kind: 'note',
        lead: true,
        span: 12,
        when: { metric: 'projects-need-you', is: 0 },
        body: 'Nothing needs you across {{projects-live}} project(s) in play',
      },
      /* NO RIGHT NOW TILE, SINCE portfolio 1.10.0. It held In play and what aims to land within thirty days in a third of
         the row, beside two splits a third its height, so the row ended at three heights. In play is the line's now;
         what aims within thirty days is Coming up, folded under Earnings, agents and dates; and what an agent holds is
         With an agent beside it. */
      {
        /* HOW THE PROJECTS IN PLAY ARE GOING, AS ONE TILE, SINCE portfolio 1.11.0. Where they are and How they are going
           were two half-width tracks under a line that already counts the projects in play and the ones at risk, so the
           row said the line twice; the health track is the one that says something the line does not (which part is
           off track, and how much of it nobody has said about). What is parked or finished is folded under the cards, and
           `projects-by-lane` stays declared for a page that draws it. EACH PART IN ITS INTENT, so off track reads as
           trouble at a glance, in the theme's colour and not only in words. */
        kind: 'split',
        heading: 'How they are going',
        icon: 'activity',
        span: 12,
        source: 'metric.projects-by-health',
        unset: 'Not said yet',
        tones: { on_track: 'good', at_risk: 'warn', off_track: 'bad' },
        /* ONLY PAST FOUR PROJECTS IN PLAY, SINCE portfolio 1.12.0 (the visual review of October 2nd). Three projects drew
           three equal thirds, which says nothing the line and the cards under it do not; a bar earns its row when there
           are too many cards to read at a glance. */
        when: { metric: 'projects-live', gt: 4 },
      },
      /* NO NEEDS YOU TABLE, SINCE portfolio 1.11.0. It listed the projects at risk with their health and next step, and
         the cards under it say both on every project in play, while the line counts them: Kiln's next step was on the
         page three times. */
      {
        kind: 'cards',
        heading: 'In play',
        icon: 'rocket',
        span: 12,
        source: 'register.things',
        where: LIVE,
        /* EACH CARD WEARS THE PROJECT'S OWN MARK IN ITS OWN HUE, SINCE portfolio 1.6.0, the identity the list declares
           (`identity: { mark, accent }`), and says what the project is under its name (`about`, drawn as the quieter
           line under a title). Neither is a fact, so the three facts below are unchanged. */
        columns: [
          { field: 'name', as: 'title' },
          { field: 'mark', as: 'mark' },
          { field: 'hue', as: 'hue' },
          { field: 'about', as: 'reply' },
          /* NO LABELS ON HOW IT IS GOING, SINCE portfolio 1.12.0: "At risk" and a ring at 60% say what they are, and
             "Health" and "How far along" under them on every card read as a form. An empty label draws none. */
          { field: 'progress', label: '', as: 'ring' },
          { field: 'health', label: '', as: 'fact' },
          /* NO LABEL, as the project page's first column carries none: a personal record renames
             this field to "Money made" (`usecases/personal.ts`), and a label typed in here would
             print "Earned in a year" over it and undo the rename on the one page that shows it per
             project. */
          { field: 'revenue', as: 'fact' },
          { field: 'next', label: 'Next step', as: 'fact' },
          { field: 'agent', label: 'Agent', as: 'who' },
          /* HOW ITS WORK IS MOVING, AS A LINE ON THE CARD: what was finished on it each week, over Work's
             `project-done-by-week`, the same numbers the project's own page charts. A record without Work, or a project
             nothing was finished on, draws no line, and the card is as it was. */
          { metric: 'project-done-by-week:{{name}}', as: 'trend' },
        ],
        order: [{ field: 'name', dir: 'asc' }],
        limit: 12,
        /* DRAWN ONLY WHILE ONE IS IN PLAY, SINCE portfolio 1.13.0: its empty line, the one thing to do on a page with no
           project, is the line's now. */
        when: { metric: 'projects-live', gt: 0 },
      },
      /* WHAT EACH EARNS, WHAT AGENTS HOLD AND WHAT IS COMING UP, OPEN WHILE SHORT AND FOLDED WHEN LONG, SINCE portfolio
         1.15.0. Two headings on one figure, as the page's two lines are, and a heading whose `when:` says no hides the
         tiles under it (`readPage`), so exactly one set is ever read. */
      {
        /* ONE OPEN TILE (`box`), its parts on one surface, while four projects or fewer are under it. No `when:` of
           more than nought: a boxed heading with nothing drawn under it is not drawn either, so a fresh Projects still
           ends on In play. */
        kind: 'section',
        heading: 'Earnings, agents and dates',
        icon: 'rows',
        span: 12,
        box: true,
        /* A KEY OF ITS OWN, AND ONE ON EACH TILE UNDER IT: a block with none is keyed by its kind, list and heading, and
           the second of two alike takes `-2`. The folded ones are the ones a record already holds, so they keep the
           keys they had and whatever a person pinned, moved or hid on a long Projects still names the same tile. */
        key: 'open-earnings',
        when: { metric: 'projects-looked-up', lte: FOLD_PAST },
      },
      { ...EARNS, key: 'open-earns' },
      { ...EARNS_SAID, key: 'open-earns-said' },
      /* SIDE BY SIDE, HALF EACH, in the open tile, and a half holds three columns. So what an agent holds leaves its
         next step out here: with four projects or fewer every one of them is a card straight above, and a card says
         its next step. Who holds it and who changed it last stay, since no card says who last said where it stands. One
         of the two tables alone takes the row. */
      { ...WITH_AGENT, key: 'open-with-agent', span: 6, columns: WITH_AGENT.columns.filter((c) => c.field !== 'next'), limit: FOLD_PAST },
      { ...COMING_UP, key: 'open-coming-up', span: 6, limit: FOLD_PAST },
      {
        /* FOLDED SHUT PAST FOUR, AS IT WAS SINCE portfolio 1.8.0: the page a person reads is the line, how the
           projects are going and the projects themselves, and by then those are two rows of cards or more. */
        kind: 'section',
        heading: 'Earnings, agents and dates',
        /* A GLYPH THE APP DRAWS ON A FOLDED HEADING, SINCE portfolio 1.10.0: `layout-list` drew nothing there. */
        icon: 'rows',
        span: 12,
        fold: true,
        when: { metric: 'projects-looked-up', gt: FOLD_PAST },
      },
      EARNS,
      { ...EARNS_SAID, key: 'earns-said' },
      WITH_AGENT,
      COMING_UP,
      {
        /* THE PARKED AND FINISHED, OPEN WHILE FOUR OR FEWER, SINCE portfolio 1.15.0: one tile under its heading, the
           table in it with no heading of its own, since the tile's says what they are. Shut by its own rule when
           there is none (`emptyBoxesShut`). */
        kind: 'section',
        heading: 'Parked and finished',
        icon: 'archive',
        span: 12,
        box: true,
        when: { metric: 'projects-not-in-play', lte: FOLD_PAST },
      },
      (({ heading: _heading, icon: _icon, ...table }) => ({ ...table, limit: FOLD_PAST }))(NOT_IN_PLAY),
      {
        /* A COUNT, SINCE portfolio 1.13.0: the heading says how many are folded under it, which the record answers with
           the whole match whatever it reads (`matched`), so one project is read where it read up to fifty, each with
           its notes. The projects themselves are the table under it. FOLDED ONLY PAST FOUR since portfolio 1.15.0. */
        kind: 'section',
        heading: 'Parked and finished',
        icon: 'thing',
        span: 12,
        fold: true,
        source: 'register.things',
        where: 'lane is parked or retired',
        limit: 1,
        when: { metric: 'projects-not-in-play', gt: FOLD_PAST },
      },
      NOT_IN_PLAY,
    ],
  },

  /**
   * A PROJECT PAGE: every block filtered to one thing.
   *
   * This is the shape the whole widget idea was really asking for, and it needs no new machinery —
   * it is an ordinary `page` row whose blocks all carry `where: thing is Kiln`. Open the project and
   * the page is about the project: what is open on it, who is working on it right now, what it is
   * owed, what it costs to keep alive.
   *
   * The AGENTS block is the interesting one. "A Claude Code widget I can code into" cannot be a
   * block that runs code — 04 §7 has no interpreter to reach and 22 §3 names and rejects the three
   * ways people try. It does not need to be. An agent run is a typed row in the kernel's `session`
   * register (02 §1), so the widget is an
   * ordinary register-bound block, and the instruction you type is an ordinary WRITE — which is the
   * product's own thesis stated back at it: the record is the coordinator, and it is better than a
   * model because it cannot be persuaded (23 §12).
   *
   * WHAT NEEDS A PERSON COMES FIRST, SINCE portfolio 1.5.0: after the figures, the
   * questions a rule or an agent asked about this project, answered where they are shown; then where it stands, the work
   * handed back and what is open; the agents on it beside what changed on it; its plan on a time axis when its tasks
   * have days; its money month by month and row by row, and what keeps it running; and what is written about it.
   *
   * Spans read left to right, 7 beside 5 and 8 beside 4, and every block is one column at a phone's width, in this
   * order.
   *
   * A RAIL FOR WHAT IS LOOKED UP AND NOT READ: the figures and what the project
   * runs on sit in a rail four twelfths wide (`area: rail`), and the main column opens with one sentence said from the
   * figures. A span in either column is a share of that column. At a phone's width the rail comes after the main
   * column, so the sentence is still the first thing read.
   */
  /**
   * ONE DECLARATION, FOUR PAGES. This was `kiln:`, with the name typed into six predicates, three
   * metric ids and five sentences — and a second project meant a second copy of all of it. The
   * `{{name}}` is the row's own field, resolved once per project the `for:` predicate admits, and
   * the slug comes from the row's title so `/p/kiln` is still `/p/kiln`.
   *
   * `parked` and `retired` projects get no page. A rail with a page for something nobody is working
   * on is a rail you stop reading.
   */
  /**
   * THE SHAPE OF IT SINCE portfolio 1.6.0, AS THE BOARD FOR A PROJECT DRAWS IT: the work finished on it each week (a
   * tally by priority until work 1.10.0), what came in, went out and was kept this month beside the twelve
   * months, the dated work as a strip of weeks above the plan's time axis, and what it runs on as cards in the rail with
   * what each costs and when it renews. Twenty-one blocks, so a use case can add three of its own under the ceiling of
   * twenty-four a page may declare (`usecases/founder.ts` adds exactly three).
   *
   * CALMER, SINCE portfolio 1.8.0 (DIRECTION §35): the line first, then six tiles, what needs you, where it stands, how
   * its work moved, what is open and handed back, and the plan, and everything after them folded shut: who worked on it
   * and its notes, its money, and in the rail what it runs on with what that costs. Each date is drawn once, on the
   * plan, and the month so far is the chart's newest month and not a tile beside it. Still twenty-one blocks.
   *
   * EVEN ROWS, SINCE portfolio 1.10.0 (the visual review of October 2nd): where it stands and what is handed back sit in
   * the rail under At a glance, one column of short tiles beside the chart, which takes the main column; What is open
   * goes, the plan drawing the same tasks; and what is handed back is drawn only while it lists one. Twenty blocks.
   *
   * NO CHART OF ONES AND TWOS, SINCE founder 2.3.0 and team 2.18.0 (DIRECTION §39, "a chart is drawn only when it says
   * something; else the tile shows the number", and the second design review's fix 5). Done, by week was a tile 280px
   * tall, the whole of the main column, for bars of 1 and 2. What was finished this week is a figure of At a glance,
   * with how it moved as the line beside it, and the plan leads the main column. Nineteen blocks.
   */
  project: {
    page: 'project',
    title: '{{name}}',
    for: { register: 'things', where: 'lane is building or earning' },
    nav: { section: 'Projects', order: 10 },
    icon: 'thing',
    layout: { rail: 4 },
    requires: ['register.things', 'register.tasks', 'register.session', 'register.obligations', 'register.services', 'register.transactions'],
    blocks: [
      /* THE OPENING SENTENCE, SAID FROM THE PROJECT'S FIGURES. A sentence cannot print a figure named for one project
         (`{{project-open:Kiln}}` is not a path the page reads), so each sentence is drawn on its figure's `when:`
         instead, as the launch desk's are.

         EXACTLY ONE OF THE TWO, ON ONE FIGURE, SINCE portfolio 1.9.0. Before it the second said "nothing is open" and a
         project with open work and nothing handed back, which is most of them, had no sentence at all: Kiln opened on
         a bare title over a band of tiles. Now work handed back is the line when there is any, and otherwise the line
         is the project's own next step, the one sentence whoever works on it keeps current. A project with no next step
         written has neither: the app drops a lead clause whose hole it cannot fill (`leadOf`), so it never reads
         an empty line. */
      {
        kind: 'note',
        lead: true,
        span: 12,
        when: { metric: 'project-in-review:{{name}}', gt: 0 },
        body: 'Work on {{name}} has been handed back, and it waits for you to check it.',
      },
      {
        kind: 'note',
        lead: true,
        span: 12,
        when: { metric: 'project-in-review:{{name}}', is: 0 },
        /* THE NEXT STEP ALONE, SINCE portfolio 1.12.0: the page's title already names the project, and "Next on Kiln:"
           in front of it said so twice. */
        body: '{{next}}',
      },
      {
        /* WHAT A RULE OR AN AGENT HAS ASKED ABOUT THIS PROJECT, answered where it is shown, three at a time, and the rest
           are in Decide. A question names the row it is about (`about`, `things#1`), and `{{spoken}}` is this project's,
           so the queue holds this project's calls and no other's. No `empty:` of its own: with nothing waiting the queue
           says its own line. */
        kind: 'queue',
        heading: 'Waiting on you',
        icon: 'ask',
        /* THE WHOLE WIDTH, AND ONLY WHILE SOMETHING IS ASKED, SINCE portfolio 1.8.0 (`questions-open`), so a project
           with nothing waiting draws no band under its line. */
        span: 12,
        source: 'governance.open',
        where: 'about is {{spoken}}',
        limit: 3,
        when: { metric: 'questions-open:{{spoken}}', gt: 0 },
        /* ONE TILE A QUESTION, SINCE portfolio 1.6.0, led by what its recommended answer shows, the ways to answer under
           it: a decision about a project is read as its options, not as a line in a list. */
        tiles: true,
      },
      {
        kind: 'stat',
        heading: 'At a glance',
        icon: 'gauge',
        span: 12,
        area: 'rail',
        cells: [
          { metric: 'project-open:{{name}}', label: 'Open' },
          { metric: 'project-owed:{{name}}', label: 'Owed to you' },
          { metric: 'project-cost:{{name}}', label: 'Costs a year' },
          /* HOW ITS WORK IS MOVING, AS A FIGURE WITH ITS LINE, where a chart of its own stood: what was finished on it
             in the last seven days, and `trend:` asks for how that moved over four weeks, as Work's Done this week
             draws its seven nights. THE LINE WAITS ON THE RECORD: a night's series is kept for a figure with no
             parameter, and this one is read a project at a time, so until the record keeps one a project the cell is
             the figure alone, which a cell with no points has always been (`trendOf` in the kernel's `pages.ts`).
             The weeks themselves are still drawn, on the project's card on Projects. */
          PROJECT_DONE_CELL,
        ],
      },
      {
        /* WHERE IT STANDS, as whoever works on it last said: how it is going, what is next, how far along, and the agent
           on it. One card, because it is one project, and no `when:`: the row
           is the page's own, so it is always there.

           NOT THE NEXT STEP, SINCE portfolio 1.9.0: the line above says it, and the card said the same sentence again
           straight under it.

           IN THE RAIL UNDER AT A GLANCE, SINCE portfolio 1.10.0, with what is handed back under it: one column of short
           tiles beside the chart, where it was five twelfths of a row beside a chart twice its height.

           HOW IT IS GOING LEADS AND THE AGENT COMES LAST, SINCE portfolio 1.12.0. A card with no title is headed by its
           person, so the agent's name and mark were the first line of the tile; with the health as its title the card
           reads "At risk", how far along, the day it aims for, and who is on it under them.

           AT RISK AND OFF TRACK WEAR THEIR COLOUR, SINCE founder 2.2.0 and team 2.17.0: a card is toned by its title's
           value, and the title is the health. On track wears no mark on purpose, since colour is for what needs the
           person (DIRECTION §39, "status colours as small dots and text"). */
        kind: 'cards',
        heading: 'Where it stands',
        icon: 'target',
        span: 12,
        area: 'rail',
        source: 'register.things',
        where: 'name is {{name}}',
        columns: [
          { field: 'health', as: 'title' },
          { field: 'progress', label: '', as: 'ring' },
          { field: 'aim', label: 'Aiming for', as: 'fact' },
          { field: 'agent', label: 'Agent', as: 'who' },
        ],
        tones: { at_risk: 'warn', off_track: 'bad' },
        limit: 1,
        empty: 'Nobody has said where {{name}} stands yet.',
        /* ONLY WHILE SOMEBODY HAS SAID ONE OF THE FOUR, SINCE portfolio 1.16.0 (REC-C16). On a record nobody had
           described a project on, which is every imported one, the card was a dash and nothing else on every project
           page; the figures under the same heading speak instead. */
        when: { metric: 'project-said:{{name}}', gt: 0 },
      },
      {
        /* WHERE IT STANDS FROM WHAT HAPPENED ON IT, SINCE portfolio 1.16.0 (REC-C16): drawn while nobody has said, so
           its figures stand alone, which is how a project stays until its owner answers the tidy after an import. What
           was worked on this week, from the day the record stamps each task it writes. What is open is At a glance's
           first figure straight above, so it is not said twice. How long since anybody worked on it beside that, from the
           same stamps (`project-last-worked`), so a project that went quiet a month ago reads "30 days" and not only a
           nought for this week. A use case that keeps more adds its own cell (founder's numbers this week). */
        kind: 'stat',
        heading: 'Where it stands',
        icon: 'target',
        span: 12,
        area: 'rail',
        key: 'stands-figures',
        cells: [
          { metric: 'project-moved-7d:{{name}}', label: 'Changed this week' },
          { metric: 'project-last-worked:{{name}}', label: 'Last worked' },
        ],
        when: { metric: 'project-said:{{name}}', is: 0 },
      },
      {
        /* THE WORK ON IT THAT WAITS ON A PERSON: handed back by an agent to be checked, or blocked, and who changed it last.
           Its own heading, since the questions above are what "Waiting on you" names on every module's page.

           IN THE RAIL, AND ONLY WHILE IT LISTS A TASK, SINCE portfolio 1.10.0 (`project-held-up`, over its own clauses).
           It was drawn on everything open, to keep a row whole beside What is open, and that row is gone.

           A TO-DO AND NOT A TABLE, SINCE portfolio 1.12.0: three columns squeezed into a rail cut "Decide the licensing
           tie…" to a stub, and "Changed by: You, 3 Sep" told a person what they did themselves. Each task is one line
           with its status beside it, and can be ticked off where it is read. */
        kind: 'todo',
        heading: 'Handed back or blocked',
        icon: 'hourglass',
        span: 12,
        area: 'rail',
        source: 'register.tasks',
        where: 'thing is {{name}}, state is review or blocked',
        columns: [{ field: 'what' }, { field: 'state' }],
        order: [{ field: 'by', dir: 'asc' }],
        limit: 6,
        when: { metric: 'project-held-up:{{name}}', gt: 0 },
        empty: 'Nothing on {{name}} is handed back or blocked.',
      },
      /* NO DONE, BY WEEK, SINCE founder 2.3.0 and team 2.18.0: from work 1.10.0 it charted what was finished on the
         project each of the last eight weeks, the whole of the main column, and on most projects that is a bar of 1
         beside a bar of 2. Done this week is the last figure of At a glance. */
      /* NO WHAT IS OPEN, SINCE portfolio 1.10.0: the plan draws every open task with a day, so the page listed the same
         tasks twice, one tile above the other. A task with no day is on Work, narrowed to the project. */
      {
        /* ITS PLAN ON A TIME AXIS, AND ITS DATES ONCE, SINCE portfolio 1.8.0: a calendar of the month above it drew the
           same tasks on the same days a second time, so it went.

           ITS PLAN ON A TIME AXIS: each task in play with a day, as a window as long as its effort ending on that day, or a
           line on the day where it has no effort. Drawn only when the project has such a task (`project-dated`), so a
           project nobody has planned in days says nothing about a plan rather than showing an empty axis. */
        kind: 'roadmap',
        heading: 'The plan',
        icon: 'milestone',
        span: 12,
        source: 'register.tasks',
        where: 'thing is {{name}}, by is set, state is not done or dropped',
        columns: [
          { field: 'what', label: 'What' },
          { field: 'by', label: 'Due' },
          { field: 'effort', label: 'Effort' },
        ],
        order: [{ field: 'by', dir: 'asc' }],
        limit: 50,
        when: { metric: 'project-dated:{{name}}', gt: 0 },
        empty: 'No task on {{name}} has a day yet.',
      },
      {
        /* EVERYTHING ELSE ABOUT IT, AS ONE TILE, SINCE work 1.15.0 (DIRECTION §39, the design review's fix 9). From
           1.8.0 who worked on it and its notes, its money, and what it runs on were three sections folded shut, each a
           tile 56px tall holding only its name and a Show button, which read as unfinished. Now they are one boxed tile
           under the plan, its parts on one surface, each short: the last few changes and runs, the notes, the money by
           month and the next bills, what keeps it running and the keys, tools and skills it uses. A part with nothing
           in it is not drawn, so a new project's tile is its notes.

           WHAT IT RUNS ON LEFT THE RAIL FOR IT, with the scheduled actions (Resume, Pause), which the host draws under
           this heading (`panel: actions`). The rail keeps the short tiles beside the plan. */
        kind: 'section',
        heading: 'More about {{name}}',
        icon: 'notebook-pen',
        span: 12,
        box: true,
        panel: 'actions',
      },
      {
        /* WHAT CHANGED ON THE PROJECT, from the record's own log, newest first: who said how it is going, what is next and
           how far along, a person or an agent or a rule. `{{spoken}}` is this project's row, which is what an edit of it
           names as its target. THREE, SINCE work 1.15.0, and the project's own history holds the rest. */
        kind: 'feed',
        heading: 'What changed',
        icon: 'activity',
        span: 6,
        source: 'activity',
        where: 'target is {{spoken}}',
        first: 3,
      },
      {
        /* CARDS, because an agent working on the project is a face and a sentence, not a row in a log. The last three
           runs, beside what changed. */
        kind: 'cards',
        heading: 'Agents',
        icon: 'bot',
        span: 6,
        columns: [{ field: 'doing', as: 'title' }, { field: 'agent', as: 'who' }, { field: 'last_seen', as: 'when' }],
        source: 'register.session',
        /* BY `project`, WHICH HOLDS THE PROJECT'S SPOKEN ID, `things#1`. `{{spoken}}` is that id for the
           row the template is about, filled by both engines. */
        where: 'project is {{spoken}}',
        order: [{ field: 'last_seen', dir: 'desc' }],
        limit: 3,
      },
      {
        /* WHAT IS WRITTEN ABOUT THE PROJECT: its plan, what blocks it and what was decided, as the row's note holds it,
           blocks and all. A project nobody has written about says so, and where to write it. */
        kind: 'note',
        document: true,
        heading: 'Notes',
        icon: 'notebook-pen',
        span: 12,
        body: '{{note}}',
        empty: 'Nothing is written about {{name}} yet. Its note is on the project.',
      },
      {
        /* ITS MONEY MONTH BY MONTH, in and out, from what moved in the twelve months to now, with what was left each month
           as a line. Read from Money's transactions, so a record that keeps no Money has the page without it
           (`PROJECT_LINKS`). A line names its figure with this project as its parameter, as a tile's cell does. HALF THE
           TILE SINCE work 1.15.0, beside the bills and invoices. */
        kind: 'series',
        heading: 'Money by month',
        icon: 'chart-column',
        span: 6,
        series: [
          { metric: 'project-in-by-month:{{name}}', label: 'Money in' },
          { metric: 'project-out-by-month:{{name}}', label: 'Money out', dir: 'out' },
        ],
        back: 12,
        net: true,
      },
      {
        kind: 'table',
        heading: 'Bills and invoices',
        icon: 'receipt',
        span: 6,
        source: 'register.obligations',
        where: 'thing is {{name}}',
        /* THE AMOUNT CARRIES ITS OWN SIGN, because this block holds money in and money out, and a column of unsigned
           amounts read down as one sum when the net is the other way. The sign is the row's direction, money out drawn
           with a minus, so which way it goes is said by the figure and not by a column of words beside it. TWO COLUMNS
           AND FOUR ROWS SINCE work 1.15.0, the soonest due first: the day is said by the order, and the rest are on
           Money. */
        columns: [
          { field: 'what', label: 'Description', width: 'minmax(14ch,1fr)' },
          { field: 'amount', label: 'Amount', width: '15ch', align: 'end', sign: { field: 'direction', minus: 'owed_by_me' } },
        ],
        order: [{ field: 'due', dir: 'asc' }],
        limit: 4,
      },
      {
        /* WHAT KEEPS IT RUNNING: one card a service, its name, what it costs a cycle and which cycle, and the day it
           renews, what renews first first. No `when:`: a domain imported with no cost is still what the project runs on,
           so a figure of what it costs cannot say whether there is anything here. */
        kind: 'cards',
        heading: 'Keeping it alive',
        icon: 'server',
        span: 6,
        source: 'register.services',
        where: 'thing is {{name}}',
        columns: [
          { field: 'name', as: 'title' },
          { field: 'cost', as: 'figure' },
          { field: 'cycle', label: 'Every', as: 'fact' },
          { field: 'note', label: 'Note', as: 'fact' },
          { field: 'renews', label: 'Renews', as: 'when' },
        ],
        order: [{ field: 'renews', dir: 'asc' }],
        limit: 3,
      },
      {
        /* `{{spoken}}` IS THIS PROJECT'S OWN ROW, `things#1`, which `runs_on` takes as `about:` and reads every kind
           from, so the blocks below narrow one read to a kind apiece by `where:` rather than asking the kernel three
           times. `about:` is read by a `cards` block (`block-keys.ts` `KEY_KINDS`), as it is by `table`.

           NO BLOCK HERE NAMES `kind is action`: the scheduled actions are the panel the section above draws, with
           Resume and Pause, so a card for each as well would say every action twice.

           EACH CARD SAYS WHERE IT APPLIES AND WHO USED IT LAST. `scope` is the chip, the project's mark or the globe
           for everywhere, and the kernel answers the project's own first and the global ones after them.
           `used_by` is the run that last opened a key or called a tool, `S47`, which the card draws as that run's face,
           and `used_at` when anybody last did; a skill has no use the record counts, so it names neither.

           THREE OF EACH SINCE work 1.15.0, and none that says it is empty: a project with no key, tool or skill of
           its own draws none of the three, where the rail said three sentences of nothing. */
        kind: 'cards',
        heading: 'Keys',
        icon: 'key',
        span: 6,
        source: 'runs_on',
        about: '{{spoken}}',
        where: 'kind is key',
        columns: [
          { field: 'name', as: 'title' },
          { field: 'scope', label: 'Applies to', as: 'scope' },
          { field: 'detail', label: 'Opens', as: 'fact' },
          { field: 'used_by', label: 'Last used by', as: 'who' },
          { field: 'used_at', label: 'Last used', as: 'when' },
        ],
        limit: 3,
      },
      {
        kind: 'cards',
        heading: 'Tools and servers',
        icon: 'plug',
        span: 6,
        source: 'runs_on',
        about: '{{spoken}}',
        /* THE PROJECT'S OWN ALONE: the kernel answers what applies everywhere after a project's
           own, so a project with no tool of its own listed three of everybody's under its name, and they were not
           its. A tool that applies everywhere is on Agents, said once. With none of its own the card is not drawn. */
        where: 'kind is tool, scope is project',
        columns: [
          { field: 'name', as: 'title' },
          { field: 'scope', label: 'Applies to', as: 'scope' },
          { field: 'detail', label: 'Reached by', as: 'fact' },
          { field: 'used_by', label: 'Last used by', as: 'who' },
          { field: 'used_at', label: 'Last used', as: 'when' },
        ],
        limit: 3,
      },
      {
        kind: 'cards',
        heading: 'Skills',
        icon: 'skill',
        span: 6,
        source: 'runs_on',
        about: '{{spoken}}',
        where: 'kind is skill',
        columns: [
          { field: 'name', as: 'title' },
          { field: 'scope', label: 'Applies to', as: 'scope' },
          { field: 'detail', label: 'Version', as: 'fact' },
        ],
        limit: 3,
      },
    ],
  },
};

/**
 * THE LISTS THE PROJECT TEMPLATE ONLY LINKS TO. What a project runs on, and what that costs a year, come from Estate's
 * services, and a record that keeps no services still has projects worth a page: a founder's apps, a student's passion
 * project. So services are a link and not a dependency, the way People's "Met in" is (`first-party.ts` `LINKS`). Money
 * owed on a project is the same: a team's products have work and agents on them and no invoices in the record. So is
 * what moved on it, month by month, which Money's transactions hold.
 */
export const PROJECT_LINKS: readonly string[] = ['services', 'obligations', 'transactions'];

/**
 * What a project's stat row says from its tasks when a figure over money is left out, and how many figures the row
 * holds. What was finished this week is not among them since founder 2.3.0 and team 2.18.0: At a glance declares it on
 * every record (`PROJECT_DONE_CELL`), and it closes the row whatever was made up before it.
 */
const PROJECT_WORK_CELLS: readonly { metric: string; label: string }[] = [
  { metric: 'project-due-soon:{{name}}', label: 'Due soon' },
  { metric: 'project-in-review:{{name}}', label: 'In review' },
];
const PROJECT_CELLS = 4;

/**
 * The project template for a record that holds these lists: every block and figure over a linked list it does not hold
 * left out, and the width a block took given to the block before it in the same column, so a row that paired two still
 * fills the width.
 */
export function projectTemplate(holds: Iterable<string>): SeedPage {
  const held = new Set(holds);
  const gone = (source: unknown): boolean => {
    if (typeof source !== 'string') return false;
    const register = source.replace(/^register\./u, '');
    return source.startsWith('register.') && PROJECT_LINKS.includes(register) && !held.has(register);
  };
  /* A FIGURE AS A PAGE NAMES IT, `project-in-by-month:{{name}}`, is over the list its declaration reads. */
  const figureGone = (said: unknown): boolean => typeof said === 'string' && gone(PROJECT_METRICS[said.split(':')[0] ?? '']?.source);
  /* A SERIES READS NO LIST BY `source:`, ONLY THROUGH ITS LINES' FIGURES, so it goes with the list they read. */
  const linesGone = (series: unknown): boolean => Array.isArray(series) && series.some((line) => figureGone((line as { metric?: unknown } | null)?.metric));
  const page = PORTFOLIO_PAGES.project!;
  const blocks: Record<string, unknown>[] = [];
  /* A ROW OF FIGURES EVERY ONE OF WHICH READS A LIST THE RECORD DOES NOT HOLD GOES WHOLE, as a block over such a list
     does: made up from the tasks instead, it would say At a glance's figures a second time under a heading about money. */
  const cellsGone = (cells: unknown): boolean => Array.isArray(cells) && cells.length > 0 && cells.every((c) => figureGone((c as { metric?: unknown } | null)?.metric));
  /* WHERE EACH BLOCK STARTS IN ITS ROW, laid as the page lays them, each column a flow of its own: a block that would
     run past the twelfth starts the next row. */
  const declared = page.blocks as Record<string, unknown>[];
  const used = new Map<unknown, number>();
  const opensRow = declared.map((b) => {
    const span = typeof b.span === 'number' ? b.span : 12;
    const at = used.get(b.area) ?? 0;
    const fresh = at === 0 || at + span > 12;
    used.set(b.area, (fresh ? 0 : at) + span);
    return fresh;
  });
  /* THE WIDTH THE BLOCKS THAT OPENED A ROW LEFT, owed to the next block kept in that row of their column. */
  type Owed = { area: unknown; span: number };
  let owed = null as Owed | null;
  for (let [i, block] of declared.entries()) {
    if (opensRow[i]) owed = null;
    if (gone(block.source) || linesGone(block.series) || cellsGone(block.cells)) {
      const before = blocks.at(-1);
      if (typeof block.span !== 'number') continue;
      /* TO A BLOCK IT SHARED A ROW WITH, ONLY WITHIN ONE COLUMN: a main block's width given to a rail block would widen
         the wrong column. One that opened its row hands its width on to the next kept in that row, since portfolio
         1.15.0, where giving it to the block before, already a whole row, dropped it and left its partner half a row
         alone. */
      if (owed !== null) owed = { area: owed.area, span: owed.span + block.span };
      else if (opensRow[i]) owed = { area: block.area, span: block.span };
      else if (before && before.area === block.area && typeof before.span === 'number')
        blocks[blocks.length - 1] = { ...before, span: Math.min(12, before.span + block.span) };
      continue;
    }
    if (owed !== null && owed.area === block.area && typeof block.span === 'number') block = { ...block, span: Math.min(12, block.span + owed.span) };
    owed = null;
    const cells = block.cells as { metric: string }[] | undefined;
    if (!cells) {
      blocks.push(block);
      continue;
    }
    const kept = cells.filter((c) => !figureGone(c.metric));
    /* A ROW THAT LOST A FIGURE IS MADE UP FROM THE PROJECT'S TASKS, so a team's page does not lead with Open alone. What
       was finished this week stays the row's last figure, with its line, and what is made up goes before it. */
    const last = kept.filter((c) => c.metric === PROJECT_DONE_CELL.metric);
    const rest = kept.filter((c) => c.metric !== PROJECT_DONE_CELL.metric);
    const made = kept.length < cells.length ? [...[...rest, ...PROJECT_WORK_CELLS].slice(0, PROJECT_CELLS - last.length), ...last] : kept;
    blocks.push({ ...block, cells: made });
  }
  /* A SECTION WITH NOTHING LEFT UNDER IT GOES TOO, SINCE portfolio 1.8.0: on a record that keeps no Money the Money
     section would be a folded heading over nothing. What a section holds is the blocks after it in its own column, up to
     the next section there, which is how the record folds them (`readPage` in the kernel's `pages.ts`). */
  const areaOf = (b: Record<string, unknown>): unknown => b.area ?? 'main';
  const holding = blocks.filter((b, i) => {
    if (b.kind !== 'section' || typeof b.panel === 'string') return true;
    const next = blocks.slice(i + 1).find((n) => areaOf(n) === areaOf(b));
    return next !== undefined && next.kind !== 'section';
  });
  return { ...page, requires: (page.requires as string[]).filter((r) => !gone(r)), blocks: holding };
}
