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

Earning · a variable type family, licensed direct. {{money:1840000 GBP}} since March 2024.

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
  { name: 'Kiln', lane: 'earning', health: 'at_risk', next: 'Settle how Kiln is licensed, before the September issue announces it', progress: 60, aim: day(17), agent: 'claude', revenue: gbp(1_840_000), since: '2024-03-11', mark: '◆', hue: 214, note: KILN_NOTE, repos: ['git.kiln.example/type/kiln-type', 'git.kiln.example/type/kiln-site'], folders: ['/Users/studio/Code/kiln-type', '/Users/studio/Code/kiln-site'] },
  { name: 'Marlow & Co', lane: 'earning', health: 'on_track', next: 'Chase Halden on invoice 2026-041 once its terms run out', progress: 85, agent: 'cursor', revenue: gbp(420_000), since: '2023-01-08', mark: '▲', hue: 305, repos: ['git.marlow.example/brand/marlow-site'], folders: ['/Users/studio/Clients/marlow'] },
  { name: 'Portage', lane: 'building', health: 'off_track', next: 'Choose where the newsletter sends from, then wire the domain', progress: 35, aim: day(28), revenue: gbp(0), since: '2026-05-02', mark: '●', hue: 176, repos: ['portage'], folders: ['D:\\Studio\\portage'] },
  { name: 'Tallow', lane: 'parked', next: 'Retire it or park it another year', revenue: gbp(0), since: '2025-02-20', mark: '◼', hue: 261, repos: ['git.kiln.example/type/tallow'] },
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
      { id: 'revenue', type: 'money' },
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
const counted = (metric: string, name: string, where: string, target: Record<string, number> = { gte: 0 }): SeedMetric => ({
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
        empty: 'No project is in play.',
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
    blocks.push(cells ? { ...block, cells: cells.filter((c) => !gone(PROJECT_METRICS[c.metric.split(':')[0] ?? '']?.source)) } : block);
  }
  return { ...page, requires: (page.requires as string[]).filter((r) => !gone(r)), blocks };
}
