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
     path shapes are placed; Portage's repository is named bare, as its runs report it. */
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
  { name: 'Kiln', about: 'A variable type family, licensed direct', lane: 'earning', health: 'at_risk', next: 'Settle how Kiln is licensed, before the September issue announces it', progress: 60, aim: day(17), agent: 'claude', revenue: gbp(1_840_000), earned_before: gbp(1_412_000), since: '2024-03-11', mark: '◆', hue: 214, note: KILN_NOTE, repos: ['git.kiln.example/type/kiln-type', 'git.kiln.example/type/kiln-site'], folders: ['/Users/studio/Code/kiln-type', '/Users/studio/Code/kiln-site'] },
  { name: 'Marlow & Co', about: 'A brand system and site, made for a client', lane: 'earning', health: 'on_track', next: 'Chase Halden on invoice 2026-041 once its terms run out', progress: 85, agent: 'cursor', revenue: gbp(420_000), earned_before: gbp(510_000), since: '2023-01-08', mark: '▲', hue: 305, repos: ['git.marlow.example/brand/marlow-site'], folders: ['/Users/studio/Clients/marlow'] },
  { name: 'Portage', about: 'A newsletter, and the site it sends from', lane: 'building', health: 'off_track', next: 'Choose where the newsletter sends from, then wire the domain', progress: 35, aim: day(28), revenue: gbp(0), earned_before: gbp(0), since: '2026-05-02', mark: '●', hue: 176, repos: ['portage'], folders: ['D:\\Studio\\portage'] },
  { name: 'Tallow', about: 'A display face that never shipped', lane: 'parked', next: 'Retire it or park it another year', revenue: gbp(0), earned_before: gbp(21_000), since: '2025-02-20', mark: '◼', hue: 261, repos: ['git.kiln.example/type/tallow'] },
];

/**
 * WHAT AGENTS SAID ABOUT THE PROJECTS THEY HOLD, so Changed by names them. The agent on a project keeps where it stands
 * current, and a record says so in its history: the row goes in without these fields and the agent writes them after.
 * `hours` is how long ago, for the sample's ledger. `things` is the project's place in `THINGS`, from 1.
 */
export const PROJECTS_SAID: readonly { things: number; by: string; hours: number; fields: readonly string[]; note: string }[] = [
  { things: 1, by: 'claude', hours: -6, fields: ['health', 'next', 'progress'], note: 'said Kiln is at risk until its licensing is settled' },
  { things: 2, by: 'cursor', hours: -27, fields: ['next', 'progress'], note: 'set the next step on Marlow & Co to the chaser for 2026-041' },
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
    fields: [
      { id: 'name', type: 'text', required: true, search: true },
      /* WHAT IT IS, IN A LINE, SINCE portfolio 1.6.0: "a variable type family, licensed direct". Drawn under the name on
         the Overview's cards, where a column of bare names said nothing to somebody who had not opened each one. Text
         and optional, so every project already written stays valid and an importer fills it where its source says. */
      { id: 'about', label: 'About', type: 'text', search: true },
      { id: 'lane', label: 'Status', type: 'enum', values: ['building', 'earning', 'parked', 'retired'], index: true, required: true },
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
  'projects-with-agent': counted('projects-with-agent', 'With an agent', `${LIVE}, agent is set`),
  'projects-aim-30d': counted('projects-aim-30d', 'Aiming within 30 days', `${LIVE}, aim after yesterday, aim before +31d`),
  'projects-past-aim': counted('projects-past-aim', 'Past the day they aimed for', `${LIVE}, aim before today`, { lte: 0 }),
  'projects-parked': counted('projects-parked', 'Parked', 'lane is parked'),
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
  'project-cost': {
    metric: 'project-cost',
    name: 'Costs a year',
    source: 'register.services',
    where: 'thing is {{it}}, state is not cancelled',
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

export const PORTFOLIO_PAGES: Record<string, SeedPage> = {
  /**
   * THE PORTFOLIO, LEADING WITH WHAT NEEDS YOU. "Which of my
   * projects are moving, which need a call, and where my agents are": the figures, the queue of projects somebody said
   * are at risk or off track with who said so, every project in play as a card, what agents hold, what is coming up, and
   * the parked and finished ones folded away. Every block reads Projects alone, so it opens on any record that keeps them.
   */
  portfolio: {
    page: 'portfolio',
    title: 'Overview',
    nav: { section: 'Projects', order: 5 },
    icon: 'thing',
    requires: ['register.things'],
    pack: 'portfolio',
    blocks: [
      /* THE OPENING SENTENCE, SAID FROM THE FIGURES, SINCE portfolio 1.6.0: the line under the page's title, and the one
         thing read before any tile. Two notes on the one figure, so exactly one of them draws: how many projects somebody
         said are not going well, or that none is. `project(s) are` is settled by the count before it, so one project
         "is" and two "are". Words from the figures only: which project is sliding and why is an agent's reading, and it
         arrives as a question in Decide, not as a sentence a page makes up. */
      {
        kind: 'note',
        lead: true,
        span: 12,
        when: { metric: 'projects-need-you', gt: 0 },
        body: '{{projects-need-you}} project(s) in play are at risk or off track.',
      },
      {
        kind: 'note',
        lead: true,
        span: 12,
        when: { metric: 'projects-need-you', is: 0 },
        body: 'Nothing needs you. Every project in play is on track, or nobody has said otherwise.',
      },
      {
        /* IN PLAY CARRIES ITS TWELVE WEEKS AS A LINE, SINCE portfolio 1.6.0, read from the figure's own nightly series. */
        kind: 'stat',
        lead: true,
        heading: 'Right now',
        span: 12,
        cells: [
          { metric: 'projects-live', label: 'In play', trend: '12w', note: '{{projects-with-agent}} with an agent' },
          { metric: 'projects-need-you', label: 'Need you', note: 'at risk or off track' },
          { metric: 'projects-aim-30d', label: 'Aiming within 30 days', note: '{{projects-past-aim}} past their day' },
          { metric: 'projects-parked', label: 'Parked', note: '{{projects-retired}} finished' },
        ],
      },
      {
        /* WHERE THEY ARE, AS ONE TRACK, SINCE portfolio 1.6.0: every project by its status, earning, building, parked and
           finished, the parts of one whole with each labelled on the track. It reads Projects alone, as every block on
           this page does. */
        kind: 'split',
        heading: 'Where they are',
        span: 12,
        source: 'metric.projects-by-lane',
        empty: 'No project is written down yet.',
      },
      {
        /* THE QUEUE: what somebody said is not going well, what is next, and who said it last, so a person sees whether
           it was them, a colleague or an agent. */
        kind: 'table',
        heading: 'Needs you',
        span: 8,
        source: 'register.things',
        where: `${LIVE}, health is at_risk or off_track`,
        columns: [
          PROJECT,
          { field: 'health', label: 'Health', width: '12ch' },
          { field: 'next', label: 'Next', width: 'minmax(20ch,2fr)' },
          { field: 'changed', label: 'Changed by', width: '16ch' },
        ],
        order: [{ field: 'aim', dir: 'asc' }],
        limit: 12,
        empty: 'Nothing needs you. Every project in play is on track, or nobody has said otherwise.',
      },
      {
        kind: 'split',
        heading: 'How they are going',
        span: 4,
        source: 'metric.projects-by-health',
        unset: 'Not said yet',
        /* EACH PART IN ITS INTENT, so off track reads as trouble at a glance, in the theme's colour and not only in words. */
        tones: { on_track: 'good', at_risk: 'warn', off_track: 'bad' },
        empty: 'No project is in play.',
      },
      {
        /* WHAT EACH ONE EARNS, because the question a person asks of a portfolio after "what needs me" is "which of
           these is carrying the others". A total says the studio earned GBP 22,600 and hides that one project is 81 per
           cent of it. Two columns, so each part is the name against the money and nothing else.

           ONE TRACK CUT INTO PARTS, SINCE portfolio 1.6.0, where it was a bar a project: the question is a share of one
           whole, and a split says "81 per cent" by its length where bars side by side only say which is longest. The
           rows, the order, the empty line and the heading are the bar's. */
        kind: 'split',
        heading: 'What each one earns',
        span: 8,
        source: 'register.things',
        where: `${LIVE}, revenue is set`,
        columns: [{ field: 'name' }, { field: 'revenue' }],
        order: [{ field: 'revenue', dir: 'desc' }],
        limit: 8,
        empty: 'No project in play says what it earns. Put a year on one and it draws here.',
      },
      {
        /* THE TWELVE-MONTH TOTAL AND WHAT IT IS UP ON, which is the pair. A year on its own is a
           number nobody can act on: GBP 22,600 is good news or bad news only beside the year before
           it. Both tiles are money and both name their currency, so neither can quietly become a
           count.

           AND HOW MANY PROJECTS IT IS A TOTAL OF, because the pair on its own reads GBP 0.00 against
           GBP 0.00 on every record that has not filled the field in, which is every imported one.
           Driven at a real record's size the tile said "Earned in a year GBP 0.00, GBP 0.00 the year before" in
           the good tone over 14 projects in play, none of which had stated a year; it now says "0 of
           14 in play" on the same line, which is the only part of that tile a person could act on.
           The count is in the note rather than a third tile: a portfolio's headline is what it earns,
           and a tile counting the projects that have answered a question would take a quarter of
           this block to say something about the record's paperwork. */
        kind: 'stat',
        heading: 'Earning',
        span: 4,
        cells: [
          { metric: 'projects-earning', label: 'Earned in a year', trend: '12w', note: '{{projects-earning-before}} the year before, from {{projects-earning-said}} of {{projects-live}} in play' },
          { metric: 'projects-earning-change', label: 'Against that year' },
        ],
      },
      {
        kind: 'cards',
        heading: 'In play',
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
          { field: 'progress', label: 'How far along', as: 'ring' },
          { field: 'health', label: 'Health', as: 'fact' },
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
        empty: 'No project is in play. Add one, or set a parked one building.',
      },
      {
        /* WHAT AGENTS HOLD, and what each one is doing next on it. An agent takes a project by setting itself as its agent. */
        kind: 'table',
        heading: 'With an agent',
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
        empty: 'No agent holds a project. An agent takes one by setting itself as its agent.',
      },
      {
        kind: 'table',
        heading: 'Coming up',
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
        empty: 'No project in play has a day it is aiming for.',
      },
      {
        kind: 'section',
        heading: 'Parked and finished',
        icon: 'thing',
        span: 12,
        fold: true,
        source: 'register.things',
        where: 'lane is parked or retired',
      },
      {
        kind: 'table',
        heading: 'Not in play',
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
        empty: 'Nothing is parked or finished.',
      },
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
   *
   * WHAT IS OPEN STAYS A CHECKLIST AND IS NOT A PATH. A `steps` block is drawn as a path only over a list that declares
   * `steps:` with a done field that holds true or false (`ownSteps` in the kernel's `pages.ts`), and Work's tasks say
   * where they are with a `state`. Over tasks a `steps` block would be a plain list with no tick, and the `todo` here
   * already ticks a task done.
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
      {
        kind: 'stat',
        heading: 'At a glance',
        span: 12,
        area: 'rail',
        cells: [
          { metric: 'project-open:{{name}}', label: 'Open' },
          { metric: 'project-owed:{{name}}', label: 'Owed to you' },
          { metric: 'project-cost:{{name}}', label: 'Costs a year' },
        ],
      },
      /* THE OPENING SENTENCE, SAID FROM THE PROJECT'S FIGURES. A sentence cannot print a figure named for one project
         (`{{project-open:Kiln}}` is not a path the page reads), so each sentence is drawn on its figure's `when:`
         instead, as the launch desk's are. Work handed back is inside what is open, so the two never draw together; a
         project with open work and nothing handed back has no sentence, because the figures beside it already say it. */
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
        when: { metric: 'project-open:{{name}}', is: 0 },
        body: 'Nothing is open on {{name}} right now.',
      },
      {
        /* WHAT A RULE OR AN AGENT HAS ASKED ABOUT THIS PROJECT, answered where it is shown, three at a time, and the rest
           are in Decide. A question names the row it is about (`about`, `things#1`), and `{{spoken}}` is this project's,
           so the queue holds this project's calls and no other's. No `empty:` of its own: with nothing waiting the queue
           says its own line. */
        kind: 'queue',
        heading: 'Waiting on you',
        span: 7,
        source: 'governance.open',
        where: 'about is {{spoken}}',
        limit: 3,
        /* ONE TILE A QUESTION, SINCE portfolio 1.6.0, led by what its recommended answer shows, the ways to answer under
           it: a decision about a project is read as its options, not as a line in a list. */
        tiles: true,
      },
      {
        /* WHERE IT STANDS, as whoever works on it last said: how it is going, what is next, how far along, and the agent
           on it. One card, because it is one project. */
        kind: 'cards',
        heading: 'Where it stands',
        span: 5,
        source: 'register.things',
        where: 'name is {{name}}',
        columns: [
          { field: 'next', label: 'Next step', as: 'title' },
          { field: 'progress', label: 'How far along', as: 'ring' },
          { field: 'health', label: 'Health', as: 'fact' },
          { field: 'aim', label: 'Aiming for', as: 'fact' },
          { field: 'agent', label: 'Agent', as: 'who' },
        ],
        limit: 1,
        empty: 'Nobody has said where {{name}} stands yet.',
      },
      {
        /* HOW ITS WORK IS MOVING, SINCE work 1.10.0: what was finished on it each of the last eight weeks, over Work's
           `project-done-by-week`. It took the place of a tally of the open work by priority, which said again what the
           list below draws on every task, so the page has a chart and not a row of chips, and stays three blocks under
           the ceiling a use case adds to. */
        kind: 'series',
        heading: 'Done, by week',
        icon: 'chart-column',
        span: 12,
        series: [{ metric: 'project-done-by-week:{{name}}', label: 'Done' }],
        back: 8,
        empty: 'Nothing on {{name}} was finished in these weeks.',
      },
      {
        /* THE WORK ON IT THAT WAITS ON A PERSON: handed back by an agent to be checked, or blocked, and who changed it last.
           Its own heading, since the questions above are what "Waiting on you" names on every module's page. */
        kind: 'table',
        heading: 'Handed back or blocked',
        span: 7,
        source: 'register.tasks',
        where: 'thing is {{name}}, state is review or blocked',
        columns: [
          /* NO LABEL: headed by what one task is called, so a team whose tasks are Tickets reads Ticket. */
          { field: 'what', width: 'minmax(16ch,1fr)' },
          { field: 'state', label: 'Status', width: '11ch' },
          { field: 'changed', label: 'Changed by', width: '15ch' },
        ],
        order: [{ field: 'by', dir: 'asc' }],
        limit: 6,
        empty: 'Nothing on {{name}} is handed back or blocked.',
      },
      {
        kind: 'todo',
        heading: 'What is open',
        span: 5,
        /* ITS PRIORITY AND THE AGENT ON IT AS THE LINE UNDER EACH TASK, SINCE portfolio 1.6.0, the two facts a todo row
           draws after its due day: "high · claude" says which one to look at and whether anybody already is. */
        columns: [{ field: 'what' }, { field: 'by' }, { field: 'priority' }, { field: 'agent' }],
        source: 'register.tasks',
        where: 'thing is {{name}}, state is open or doing',
        order: [{ field: 'by', dir: 'asc' }],
        limit: 8,
        empty: 'Nothing open on {{name}}.',
      },
      {
        /* CARDS, because an agent working on the project is a face and a sentence, not a row in a log.
           Same span as the timeline it replaces: the page pairs its blocks 8 with 4 and 7 with 5. */
        kind: 'cards',
        heading: 'Agents',
        span: 7,
        columns: [{ field: 'doing', as: 'title' }, { field: 'agent', as: 'who' }, { field: 'last_seen', as: 'when' }],
        source: 'register.session',
        /* BY `project`, WHICH HOLDS THE PROJECT'S SPOKEN ID, `things#1`. `{{spoken}}` is that id for the
           row the template is about, filled by both engines. */
        where: 'project is {{spoken}}',
        order: [{ field: 'last_seen', dir: 'desc' }],
        limit: 6,
        empty: 'No agent has touched {{name}}.',
      },
      {
        /* WHAT CHANGED ON THE PROJECT, from the record's own log, newest first, beside the agents doing it: who said how it
           is going, what is next and how far along, a person or an agent or a rule. `{{spoken}}` is this project's row,
           which is what an edit of it names as its target. */
        kind: 'feed',
        heading: 'What changed',
        span: 5,
        source: 'activity',
        where: 'target is {{spoken}}',
        first: 5,
        empty: 'Nothing about {{name}} has changed yet.',
      },
      {
        /* ITS DATES AS WEEKS, SINCE portfolio 1.6.0: this month and the next as a grid of days, each day naming the tasks
           due on it, then the days that hold anything as a list. The same tasks the plan below draws on its time axis,
           read first, because "what is due when" is asked before "how long each takes". Only when a task has a day. */
        kind: 'calendar',
        heading: 'Dates',
        span: 12,
        source: 'register.tasks',
        where: 'thing is {{name}}, by is set, state is not done or dropped',
        columns: [{ field: 'what' }, { field: 'by' }],
        back: 0,
        ahead: 1,
        when: { metric: 'project-dated:{{name}}', gt: 0 },
        empty: 'Nothing on {{name}} is due this month or next.',
      },
      {
        /* ITS PLAN ON A TIME AXIS: each task in play with a day, as a window as long as its effort ending on that day, or a
           line on the day where it has no effort. Drawn only when the project has such a task (`project-dated`), so a
           project nobody has planned in days says nothing about a plan rather than showing an empty axis. */
        kind: 'roadmap',
        heading: 'The plan',
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
        /* THIS MONTH SO FAR, SINCE portfolio 1.6.0: what came in, what went out and what was kept since the first, beside
           the twelve months it is the newest of. Three figures over Money's transactions, so a record that keeps no Money
           has neither this nor the chart (`projectTemplate` takes a row of figures out whole when every one of them
           reads a list the record does not hold). */
        kind: 'stat',
        heading: 'This month so far',
        span: 5,
        cells: [
          { metric: 'project-in-month:{{name}}', label: 'In' },
          { metric: 'project-out-month:{{name}}', label: 'Out' },
          { metric: 'project-kept-month:{{name}}', label: 'Kept' },
        ],
      },
      {
        /* ITS MONEY MONTH BY MONTH, in and out, from what moved in the twelve months to now, with what was left each month
           as a line. Read from Money's transactions, so a record that keeps no Money has the page without it
           (`PROJECT_LINKS`). A line names its figure with this project as its parameter, as a tile's cell does.
           SEVEN BESIDE THE MONTH'S FIVE, SINCE portfolio 1.6.0. */
        kind: 'series',
        heading: 'Money by month',
        span: 7,
        series: [
          { metric: 'project-in-by-month:{{name}}', label: 'Money in' },
          { metric: 'project-out-by-month:{{name}}', label: 'Money out', dir: 'out' },
        ],
        back: 12,
        net: true,
        empty: 'No money has moved on {{name}} in the last twelve months.',
      },
      {
        kind: 'table',
        heading: 'Money',
        /* THE WHOLE WIDTH, SINCE portfolio 1.6.0, when what keeps it running moved to the rail as cards. It was eight
           beside that block's four. */
        span: 12,
        source: 'register.obligations',
        where: 'thing is {{name}}',
        /* THE AMOUNT CARRIES ITS OWN SIGN, because this block holds money in and money out, and a column of unsigned
           amounts read down as one sum when the net is the other way. The sign is the row's direction, money out drawn
           with a minus, so which way it goes is said by the figure and not by a column of words beside it. */
        columns: [
          { field: 'what', label: 'Description', width: 'minmax(18ch,1fr)' },
          { field: 'amount', label: 'Amount', width: '15ch', align: 'end', sign: { field: 'direction', minus: 'owed_by_me' } },
          { field: 'due', label: 'Due', width: '15ch', align: 'end' },
        ],
        order: [{ field: 'due', dir: 'asc' }],
        limit: 8,
        empty: 'Nothing owed either way on {{name}}.',
      },
      {
        /* WHAT KEEPS IT RUNNING, AS CARDS IN THE RAIL, SINCE portfolio 1.6.0: one card a service, its name, what it costs
           a cycle and which cycle, the day it renews, and what the service's own note says about it ("the only copy of
           the binaries"). It was a two-column spec in the main column, which had no room for the renewal day; in the rail
           it is looked up beside the figures, as what the project runs on below it is. */
        kind: 'cards',
        heading: 'Keeping it alive',
        span: 12,
        area: 'rail',
        source: 'register.services',
        where: 'thing is {{name}}',
        columns: [
          { field: 'name', as: 'title' },
          { field: 'cost', as: 'figure' },
          { field: 'cycle', label: 'Every', as: 'fact' },
          { field: 'note', label: 'Note', as: 'fact' },
          { field: 'renews', label: 'Renews', as: 'when' },
        ],
        /* WHAT RENEWS FIRST, FIRST. With no order the record listed the newest six and the sample the oldest. */
        order: [{ field: 'renews', dir: 'asc' }],
        limit: 6,
        empty: '{{name}} runs on nothing you pay for.',
      },
      {
        /* WHAT IS WRITTEN ABOUT THE PROJECT: its plan, what blocks it and what was decided, as the row's note holds it,
           blocks and all. A project nobody has written about says so. */
        kind: 'note',
        document: true,
        heading: 'Notes',
        span: 12,
        body: '{{note}}',
        empty: 'Nothing is written about {{name}} yet. Its note is on the project.',
      },
      /* THE PAGE ENDS WITH WHAT RUNS ON IT, IN THE RAIL: its own keys, tools and skills, then the
         ones that apply everywhere, faint beneath, one above the other at the rail's width. `panel: actions` names the
         host panel a section draws under it, so `BlockSlot.svelte` attaches the scheduled actions list (Resume, Pause)
         here without matching English text. A record without the agents pack, or with
         none of a kind, says so through each block's own `empty:` rather than refusing: `runs_on` reads a list only
         where the record holds it. */
      {
        kind: 'section',
        heading: 'Runs on',
        icon: 'plug',
        span: 12,
        area: 'rail',
        panel: 'actions',
      },
      {
        /* `{{spoken}}` IS THIS PROJECT'S OWN ROW, `things#1`, which `runs_on` takes as `about:` and reads every kind
           from, so the same three blocks below narrow one read to a kind apiece by `where:` rather than asking the
           kernel three times. `about:` is read by a `cards` block (`block-keys.ts` `KEY_KINDS`), as it is by `table`.
           Each takes the rail's whole width, since four twelfths of a page is too narrow to put two cards side by side.

           NO BLOCK HERE NAMES `kind is action`: the scheduled actions are the panel the section above draws, with
           Resume and Pause, so a card for each as well would say every action twice.

           EACH CARD SAYS WHERE IT APPLIES AND WHO USED IT LAST. `scope` is the chip, the project's mark or the globe
           for everywhere, and the kernel answers the project's own first and the global ones after them.
           `used_by` is the run that last opened a key or called a tool, `S47`, which the card draws as that run's face,
           and `used_at` when anybody last did; a skill has no use the record counts, so it names neither. */
        kind: 'cards',
        heading: 'Keys',
        span: 12,
        area: 'rail',
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
        limit: 8,
        empty: 'No key is kept for {{name}} yet. An agent working in its folder adds what it uses.',
      },
      {
        kind: 'cards',
        heading: 'Tools and servers',
        span: 12,
        area: 'rail',
        source: 'runs_on',
        about: '{{spoken}}',
        where: 'kind is tool',
        columns: [
          { field: 'name', as: 'title' },
          { field: 'scope', label: 'Applies to', as: 'scope' },
          { field: 'detail', label: 'Reached by', as: 'fact' },
          { field: 'used_by', label: 'Last used by', as: 'who' },
          { field: 'used_at', label: 'Last used', as: 'when' },
        ],
        limit: 8,
        empty: 'No tool or server is set up for {{name}} yet. An agent working in its folder adds what it uses.',
      },
      {
        kind: 'cards',
        heading: 'Skills',
        span: 12,
        area: 'rail',
        source: 'runs_on',
        about: '{{spoken}}',
        where: 'kind is skill',
        columns: [
          { field: 'name', as: 'title' },
          { field: 'scope', label: 'Applies to', as: 'scope' },
          { field: 'detail', label: 'Version', as: 'fact' },
        ],
        limit: 8,
        empty: 'No skill is written for {{name}} yet. An agent working in its folder adds what it uses.',
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

/** What a project's stat row says from its tasks when a figure over money is left out, and how many figures the row holds. */
const PROJECT_WORK_CELLS: readonly { metric: string; label: string }[] = [
  { metric: 'project-due-soon:{{name}}', label: 'Due soon' },
  { metric: 'project-in-review:{{name}}', label: 'In review' },
  { metric: 'project-done-7d:{{name}}', label: 'Done this week' },
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
  for (const block of page.blocks as Record<string, unknown>[]) {
    if (gone(block.source) || linesGone(block.series) || cellsGone(block.cells)) {
      const before = blocks.at(-1);
      /* ONLY WITHIN ONE COLUMN: a main block's width given to a rail block before it would widen the wrong column. */
      if (before && before.area === block.area && typeof before.span === 'number' && typeof block.span === 'number')
        blocks[blocks.length - 1] = { ...before, span: Math.min(12, before.span + block.span) };
      continue;
    }
    const cells = block.cells as { metric: string }[] | undefined;
    if (!cells) {
      blocks.push(block);
      continue;
    }
    const kept = cells.filter((c) => !figureGone(c.metric));
    /* A ROW THAT LOST A FIGURE IS MADE UP FROM THE PROJECT'S TASKS, so a team's page does not lead with Open alone. */
    const made = kept.length < cells.length ? [...kept, ...PROJECT_WORK_CELLS].slice(0, PROJECT_CELLS) : kept;
    blocks.push({ ...block, cells: made });
  }
  return { ...page, requires: (page.requires as string[]).filter((r) => !gone(r)), blocks };
}
