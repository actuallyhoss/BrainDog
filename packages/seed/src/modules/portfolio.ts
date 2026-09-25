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
kilnfonts.example | lapsing {verified: registrar email, 8 Aug} | auto-renew is off
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

Settled by research. Do not run it again: the registrar comparison is D41.

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
  { name: 'Kiln', lane: 'earning', health: 'at_risk', next: 'Settle how Kiln is licensed, before the September issue announces it', progress: 60, aim: day(17), agent: 'claude', revenue: gbp(1_840_000), earned_before: gbp(1_412_000), since: '2024-03-11', mark: '◆', hue: 214, note: KILN_NOTE, repos: ['git.kiln.example/type/kiln-type', 'git.kiln.example/type/kiln-site'], folders: ['/Users/studio/Code/kiln-type', '/Users/studio/Code/kiln-site'] },
  { name: 'Marlow & Co', lane: 'earning', health: 'on_track', next: 'Chase Halden on invoice 2026-041 once its terms run out', progress: 85, agent: 'cursor', revenue: gbp(420_000), earned_before: gbp(510_000), since: '2023-01-08', mark: '▲', hue: 305, repos: ['git.marlow.example/brand/marlow-site'], folders: ['/Users/studio/Clients/marlow'] },
  { name: 'Portage', lane: 'building', health: 'off_track', next: 'Choose where the newsletter sends from, then wire the domain', progress: 35, aim: day(28), revenue: gbp(0), earned_before: gbp(0), since: '2026-05-02', mark: '●', hue: 176, repos: ['portage'], folders: ['D:\\Studio\\portage'] },
  { name: 'Tallow', lane: 'parked', next: 'Retire it or park it another year', revenue: gbp(0), earned_before: gbp(21_000), since: '2025-02-20', mark: '◼', hue: 261, repos: ['git.kiln.example/type/tallow'] },
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
  'projects-live': counted('projects-live', 'In play', LIVE),
  /* WHAT NEEDS A PERSON: a project somebody, or its agent, said is at risk or off track. */
  'projects-need-you': counted('projects-need-you', 'Need you', `${LIVE}, health is at_risk or off_track`, { lte: 0 }),
  'projects-with-agent': counted('projects-with-agent', 'With an agent', `${LIVE}, agent is set`),
  'projects-aim-30d': counted('projects-aim-30d', 'Aiming within 30 days', `${LIVE}, aim after yesterday, aim before +31d`),
  'projects-past-aim': counted('projects-past-aim', 'Past the day they aimed for', `${LIVE}, aim before today`, { lte: 0 }),
  'projects-parked': counted('projects-parked', 'Parked', 'lane is parked'),
  'projects-retired': counted('projects-retired', 'Finished', 'lane is retired'),
  /* HOW THE PROJECTS IN PLAY ARE GOING, as parts of one whole, with the ones nobody has said about as their own part. */
  'projects-by-health': { ...counted('projects-by-health', 'How they are going', LIVE), group_by: 'health' },

  /* ── what they earn ───────────────────────────────────────────────────────
     OVER PROJECTS ALONE, AND THAT IS NOT A PREFERENCE. The Portfolio pack needs no other list, and
     `first-party.test.ts` holds it to exactly that (`portfolio: []`), so a figure here sourced from
     Money's ledger would make Portfolio install Money with it, and would leave an Overview that
     cannot open on a record that keeps only projects. A figure over somebody else's register is
     what `project-owed` and `project-cost` below are, and both of them are drawn on the PROJECT
     page, where `projectTemplate` takes a figure out of a record that does not keep the list it
     reads. The Overview has no such machinery, so what a project earns is the project's own
     statement, read off the project's own row.

     ONE CURRENCY, OR NO NUMBER. `format: 'money.GBP'` is the currency each reading is judged in. A
     sum over rows in two currencies is converted at the record's own dated rates, or comes back as
     one amount per currency with no total at all (`kernel/src/metrics.ts`); it is never the two
     added together, which is the arithmetic the whole money type exists to refuse.

     AND `compare: 'none'` ON ALL THREE, which is a statement and not an omission. The comparison
     the engine offers is the same predicate against a moved clock, and these predicates name no
     date, so a moved clock reads the same four rows: the delta would be structurally zero and the
     tile would say steady about a business nobody measured. The year before is a field, and the
     comparison is the diff below.

     AND OVER THE PROJECTS THAT HAVE SAID, WHICH IS WHY ALL FOUR CARRY `revenue is set`: THE OVERVIEW
     TOLD AN IMPORTED RECORD IT EARNED NOTHING. Driven on a self-host at Sam's size,
     21 registers and his 26 projects imported through the owner's own door plus the founder pack's
     one example project: 27 projects, 14 of them in play, and not one annual figure on any of them,
     because the the old tool adapter (`packs/legacy-import/adapter.ts`) files a project's monthly revenue as a READING and has no
     year to write. `projects-earning` answered `value: 0, rows: 14, held: 27, met: true`, so the
     Earning tile drew "Earned in a year GBP 0.00" with "GBP 0.00 the year before", in the GOOD tone
     and linked into the list, in the same block row as a bar correctly drawing "No project in play
     says what it earns". His record held a monthly figure for three of those projects at the time.

     THE IMPORTER IS NOT THE THING TO CHANGE, AND THE ARGUMENT IS ALREADY IN THIS TREE. `estate-year`
     multiplies a service's `cost` by its cycle and is called "Cost per YEAR": a subscription is a
     standing commitment, so twelve of a monthly one is a rate that will be paid. This field is
     "Earned IN a year": a total that happened. Twelve times a monthly figure is a run rate and not a
     total, so an importer writing it here would be putting a forecast in a field the page reads as
     history, and one of the three monthly figures on his record is a salary, where twelve of it
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
    format: 'money.GBP',
    target: { gte: 0 },
    window: '12m',
    compare: 'none',
  },

  'projects-earning-before': {
    metric: 'projects-earning-before',
    name: 'Earned the year before',
    source: 'register.things',
    where: `${LIVE}, revenue is set`,
    value: { sum: 'earned_before' },
    format: 'money.GBP',
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
    format: 'money.GBP',
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

  'project-owed': {
    metric: 'project-owed',
    name: 'Owed to you',
    source: 'register.obligations',
    where: `${OPEN}, direction is owed to me, thing is {{it}}`,
    value: { sum: 'amount' },
    format: 'money.GBP',
    target: { lte: 1_000_000 },
    window: '30d',
    compare: 'none',
  },

  'project-cost': {
    metric: 'project-cost',
    name: 'Costs a year',
    source: 'register.services',
    where: 'thing is {{it}}, state is not cancelled',
    value: { sum: { product: ['cost', { lookup: 'per_year', by: 'cycle' }] } },
    lookups: { per_year: LOOKUPS.per_year! },
    format: 'money.GBP',
    target: { lte: 120_000 },
    window: '90d',
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
   * THE PORTFOLIO, LEADING WITH WHAT NEEDS YOU (`loop/research-modules.md` §2.5, `loop/DIRECTION.md` §3). "Which of my
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
      {
        kind: 'stat',
        lead: true,
        heading: 'Right now',
        span: 12,
        cells: [
          { metric: 'projects-live', label: 'In play', note: '{{projects-with-agent}} with an agent' },
          { metric: 'projects-need-you', label: 'Need you', note: 'at risk or off track' },
          { metric: 'projects-aim-30d', label: 'Aiming within 30 days', note: '{{projects-past-aim}} past their day' },
          { metric: 'projects-parked', label: 'Parked', note: '{{projects-retired}} finished' },
        ],
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
        /* WHAT EACH ONE EARNS, AS BARS, because the question a person asks of a portfolio after "what
           needs me" is "which of these is carrying the others". A total says the studio earned
           GBP 22,600 and hides that one project is 81 per cent of it. Two columns, so the bar is the
           name against the money and nothing else. */
        kind: 'bar',
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
           Driven at his size the tile said "Earned in a year GBP 0.00, GBP 0.00 the year before" in
           the good tone over 14 projects in play, none of which had stated a year; it now says "0 of
           14 in play" on the same line, which is the only part of that tile a person could act on.
           The count is in the note rather than a third tile: a portfolio's headline is what it earns,
           and a tile counting the projects that have answered a question would take a quarter of
           this block to say something about the record's paperwork. */
        kind: 'stat',
        heading: 'Earning',
        span: 4,
        cells: [
          { metric: 'projects-earning', label: 'Earned in a year', note: '{{projects-earning-before}} the year before, from {{projects-earning-said}} of {{projects-live}} in play' },
          { metric: 'projects-earning-change', label: 'Against that year' },
        ],
      },
      {
        kind: 'cards',
        heading: 'In play',
        span: 12,
        source: 'register.things',
        where: LIVE,
        columns: [
          { field: 'name', as: 'title' },
          { field: 'progress', label: 'How far along', as: 'ring' },
          { field: 'health', label: 'Health', as: 'fact' },
          /* NO LABEL, as the project page's first column carries none: a personal record renames
             this field to "Money made" (`usecases/personal.ts`), and a label typed in here would
             print "Earned in a year" over it and undo the rename on the one page that shows it per
             project. */
          { field: 'revenue', as: 'fact' },
          { field: 'next', label: 'Next step', as: 'fact' },
          { field: 'agent', label: 'Agent', as: 'who' },
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
   * Spans read left to right: the stat takes the row, then work and agents sit side by side,
   * then money and the estate.
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
  project: {
    page: 'project',
    title: '{{name}}',
    for: { register: 'things', where: 'lane is building or earning' },
    nav: { section: 'Projects', order: 10 },
    icon: 'thing',
    requires: ['register.things', 'register.tasks', 'register.session', 'register.obligations', 'register.services'],
    blocks: [
      {
        kind: 'stat',
        heading: 'At a glance',
        span: 12,
        cells: [
          { metric: 'project-open:{{name}}', label: 'Open' },
          { metric: 'project-owed:{{name}}', label: 'Owed to you' },
          { metric: 'project-cost:{{name}}', label: 'Costs a year' },
        ],
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
        /* THE WORK ON IT THAT WAITS ON A PERSON: handed back by an agent to be checked, or blocked, and who changed it last. */
        kind: 'table',
        heading: 'Waiting on you',
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
        empty: 'Nothing on {{name}} is waiting on you.',
      },
      {
        kind: 'todo',
        heading: 'What is open',
        span: 5,
        columns: [{ field: 'what' }, { field: 'by' }],
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
        kind: 'table',
        heading: 'Money',
        /* EIGHT, which is what four columns of a `table` need. Declared at 6 it was clamped up
           anyway — `floorFor` gives a table two twelfths a column so its cells do not truncate — so
           the declaration was a number that never reached the screen. Its row partner is the 4. */
        span: 8,
        source: 'register.obligations',
        where: 'thing is {{name}}',
        /* THE DIRECTION IS A COLUMN, because this block holds both and its own `empty:` says so.
           Four columns of `# | What | Amount | Due` drew a receivable and seven payables in one
           unsigned column: read down it and Kiln looks like GBP 25,530.00 of something, where the
           net is minus GBP 23,610.00. Nothing else in the row carried the sign — the tone comes from
           state and date, which are the same for both directions. */
        /* Four columns, so the block still fits beside the 4 next to it. `#` is the one that goes:
           `what` already links to the row, and a direction the reader cannot see is worse than a
           number they cannot say out loud. */
        columns: [
          { field: 'what', label: 'Description', width: 'minmax(18ch,1fr)' },
          { field: 'direction', label: 'Which way', width: '13ch' },
          { field: 'amount', label: 'Amount', width: '15ch', align: 'end' },
          { field: 'due', label: 'Due', width: '15ch', align: 'end' },
        ],
        order: [{ field: 'due', dir: 'asc' }],
        limit: 8,
        empty: 'Nothing owed either way on {{name}}.',
      },
      {
        kind: 'spec',
        heading: 'Keeping it alive',
        /* Two cells, not three. A third column pushes this block's own floor to six, and six beside
           the eight the money table needs is fourteen of twelve — the row would wrap and leave a
           gap. The renewal date is what the Renewals page is for. */
        span: 4,
        columns: [{ field: 'name' }, { field: 'cost' }],
        source: 'register.services',
        where: 'thing is {{name}}',
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
      {
        /**
         * A `code` block is authored rather than projected: `body` is the whole of it, verbatim. It
         * is on a project page because the question "how do I point an agent at this one" is asked
         * once per project and answered nowhere else.
         *
         * ONLY THE FIRST LINE WAS TEMPLATED, AND THE OTHER TWO INSTRUCTED SOMEBODY TO DAMAGE ROWS
         * THAT ARE NOT THIS PAGE'S. `{{name}}` resolves per page; `tasks#7` and `track 1` did not,
         * so Kiln, Marlow & Co and Portage all printed the same two literals — and `tasks#7` is
         * "Retire the Tallow staging box", a TALLOW task, while `track 1` is "Variable axis QA", a
         * KILN track. A person on their client's page, running the block their own record handed
         * them, would set a third project's task to `doing` and overwrite a fourth's health with a
         * sentence about neither.
         *
         * WHAT IS LEFT IS THE LINE THAT IS TRUE ON EVERY PAGE, and it is a read. The two writes
         * were demonstrating a verb at the cost of being wrong, and a demonstration that is wrong
         * is not a demonstration. A second line naming a row this page can resolve would need the
         * projection a `code` block deliberately does not have.
         */
        kind: 'code',
        heading: 'Work on this from an agent',
        span: 12,
        body: 'braindog.list tasks where thing is {{name}} and state is open',
      },
    ],
  },
};

/**
 * THE LISTS THE PROJECT TEMPLATE ONLY LINKS TO. What a project runs on, and what that costs a year, come from Estate's
 * services, and a record that keeps no services still has projects worth a page: a founder's apps, a student's passion
 * project. So services are a link and not a dependency, the way People's "Met in" is (`first-party.ts` `LINKS`). Money
 * owed on a project is the same: a team's products have work and agents on them and no invoices in the record.
 */
export const PROJECT_LINKS: readonly string[] = ['services', 'obligations'];

/** What a project's stat row says from its tasks when a figure over money is left out, and how many figures the row holds. */
const PROJECT_WORK_CELLS: readonly { metric: string; label: string }[] = [
  { metric: 'project-due-soon:{{name}}', label: 'Due soon' },
  { metric: 'project-in-review:{{name}}', label: 'In review' },
  { metric: 'project-done-7d:{{name}}', label: 'Done this week' },
];
const PROJECT_CELLS = 4;

/**
 * The project template for a record that holds these lists: every block and figure over a linked list it does not hold
 * left out, and the width a block took given to the block before it, so a row that paired two still fills the width.
 */
export function projectTemplate(holds: Iterable<string>): SeedPage {
  const held = new Set(holds);
  const gone = (source: unknown): boolean => {
    if (typeof source !== 'string') return false;
    const register = source.replace(/^register\./u, '');
    return source.startsWith('register.') && PROJECT_LINKS.includes(register) && !held.has(register);
  };
  const page = PORTFOLIO_PAGES.project!;
  const blocks: Record<string, unknown>[] = [];
  for (const block of page.blocks as Record<string, unknown>[]) {
    if (gone(block.source)) {
      const before = blocks.at(-1);
      if (before && typeof before.span === 'number' && typeof block.span === 'number')
        blocks[blocks.length - 1] = { ...before, span: Math.min(12, before.span + block.span) };
      continue;
    }
    const cells = block.cells as { metric: string }[] | undefined;
    if (!cells) {
      blocks.push(block);
      continue;
    }
    const kept = cells.filter((c) => !gone(PROJECT_METRICS[c.metric.split(':')[0] ?? '']?.source));
    /* A ROW THAT LOST A FIGURE IS MADE UP FROM THE PROJECT'S TASKS, so a team's page does not lead with Open alone. */
    const made = kept.length < cells.length ? [...kept, ...PROJECT_WORK_CELLS].slice(0, PROJECT_CELLS) : kept;
    blocks.push({ ...block, cells: made });
  }
  return { ...page, requires: (page.requires as string[]).filter((r) => !gone(r)), blocks };
}
