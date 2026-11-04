/**
 * Projects: the things you run, their frozen identity hues, and the one page template every project shares.
 *
 * One module of the sample record, split out of `index.ts` so each first-party module's registers, rows,
 * figures and pages sit in one file. `index.ts` composes them and keeps every export it had.
 */

import { LOOKUPS, NOW, OPEN, day, gbp, type Fields, type SeedMetric, type SeedPage, type SeedRegister, type SeedRule } from './base.ts';
import { KPI_BACKFILL_SCRIPT } from './portfolio/kpi-backfill.js';
import { KIND_DRAFTS } from './portfolio/kind-drafts.js';

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
Direct licences | {{money:1120000 GBP}} | 61%
Studio deals | {{money:530000 GBP}} | 29%
Specimen prints | {{money:190000 GBP}} | 10%
Unattributed | {{money:340000 GBP}} | | hole
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

It waits on you in [Needs you](/decide) and blocks two quotes. The September issue announces whichever wins, so
it is not deferrable past {{date:2026-09-20}}.

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
links in files that have already been delivered, which is not a thing an apology fixes. The task
for it: {{ref:tasks#3}}.
\`\`\`

## What is not verified

- The 61% direct share {estimate}; it excludes the unattributed rows above.
- Whether studio deals renew at all is {unknown}.

## Log

\`\`\`timeline | Recent
{{ago:2026-08-14}} | Raised the studio tier | first increase since launch | good
{{ago:2026-07-02}} | Shipped the italic | four weights | good
{{ago:2026-05-19}} | Moved off the old CI | Hobnail cancelled
\`\`\`

Settled by research. Do not run it again: the domain host comparison was decided for Nordhaven Registry.

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
  /* EACH ONE'S COLOUR IS A CATEGORY SLOT AND ITS MARK AN ICON (1.3): Kiln blue (265),
     Marlow & Co pink (352), Portage teal (185) and Tallow yellow (90), each a slot's own hue so no two read alike, and
     marks the app draws as glyphs (tag, board, globe, archive) where the wells drew a letter. */
  /* AND WHAT EACH ONE IS, IN A LINE, since portfolio 1.6.0: the words under a project's name on the Overview's cards, so a
     list of names says which is the type family and which is the client's site without opening any of them. */
  { name: 'Kiln', about: 'A variable type family, licensed direct', lane: 'earning', health: 'at_risk', next: 'Settle how Kiln is licensed, before the September issue announces it', progress: 60, aim: day(17), agent: 'claude', revenue: gbp(1_840_000), earned_before: gbp(1_412_000), since: '2024-03-11', mark: 'tag', hue: 265, note: KILN_NOTE, repos: ['https://git.kiln.example/type/kiln-type.git', 'git@git.kiln.example:type/kiln-site.git'], folders: ['/Users/studio/Code/kiln-type', '/Users/studio/Code/kiln-site'], domains: ['kiln.example', 'kilnfonts.example'] },
  { name: 'Marlow & Co', about: 'A brand system and site, made for a client', lane: 'earning', health: 'on_track', next: 'Chase Halden on invoice 2026-041 once its terms run out', progress: 85, agent: 'cursor', revenue: gbp(420_000), earned_before: gbp(510_000), since: '2023-01-08', mark: 'board', hue: 352, repos: ['https://git.marlow.example/brand/marlow-site.git'], folders: ['/Users/studio/Clients/marlow'], domains: ['marlow.example'] },
  { name: 'Portage', about: 'A newsletter, and the site it sends from', lane: 'building', health: 'off_track', next: 'Choose where the newsletter sends from, then wire the domain', progress: 35, aim: day(28), revenue: gbp(0), earned_before: gbp(0), since: '2026-05-02', mark: 'globe', hue: 185, repos: ['portage'], folders: ['D:\\Studio\\portage'], domains: ['portage.example'] },
  { name: 'Tallow', about: 'A display face that never shipped', lane: 'parked', next: 'Retire it or park it another year', revenue: gbp(0), earned_before: gbp(21_000), since: '2025-02-20', mark: 'archive', hue: 90, repos: ['git@git.kiln.example:type/tallow.git'] },
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

/**
 * THE SAMPLE'S KEY NUMBERS (the KPI plan of 21 October). Kiln's: what it earns a month, which leads its card and
 * its page, how many studios hold a licence, and the specimen downloads nobody has reported for three weeks, so a stale
 * number is on the sample too. Marlow & Co's hours billed, which he pinned to Today, and Portage's subscribers, whose
 * day went by short of its target, so Today shows a pin, a miss and a stale number side by side. `thing` is the
 * project's place in `THINGS`, from 1. A sample's and not Portfolio's: the add-on ships the list and no row of it.
 *
 * MARLOW & CO LEADS WITH WHAT IT BILLED A MONTH, client work's money number (the plan's 2.7), marked to lead its card.
 * With the hours alone its card led with them, the top of its numbers by Today's score being the pin, and a client's
 * card led with its hours where the plan has money first. Its twelve months add up to what it earned in a year.
 */
export const SAMPLE_KPIS: Fields[] = [
  { name: 'Revenue a month', thing: 1, measures: 'What the licences, studio deals and prints brought in each month', source: 'numbers', measure: 'Revenue a month', unit: 'GBP', kind: 'flow', every: '1m', target_amount: gbp(200_000), headline: true, owner: 'claude', order: 1 },
  { name: 'Studios licensed', thing: 1, measures: 'Studios holding a current licence', source: 'agent', measure: 'Studios licensed', unit: 'studios', kind: 'level', every: '1w', target: 60, target_by: day(90), owner: 'claude', order: 2 },
  { name: 'Specimen downloads', thing: 1, measures: 'Specimen PDFs downloaded in a week', source: 'typed', measure: 'Specimen downloads', unit: 'downloads', kind: 'level', every: '1w', owner: 'claude', order: 3 },
  { name: 'Billed a month', thing: 2, measures: 'What Marlow & Co was invoiced each month', source: 'typed', measure: 'Billed a month', unit: 'GBP', kind: 'flow', every: '1m', headline: true, order: 1 },
  { name: 'Hours billed', thing: 2, measures: 'Hours billed to Marlow & Co each week', source: 'typed', measure: 'Hours billed', unit: 'hours', kind: 'flow', every: '1w', today: 'pinned', order: 2 },
  { name: 'Subscribers', thing: 3, measures: 'People signed up to the Portage newsletter', source: 'agent', measure: 'Subscribers', unit: 'people', kind: 'level', every: '1w', target: 500, target_by: day(-6), headline: true, owner: 'claude', order: 1 },
];

/** The 28th of the month this many months before the sample's own, at noon. */
const monthBack = (n: number): string => {
  const d = new Date(NOW);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, 28, 12)).toISOString();
};

/** Twelve months that add up to what Kiln earned in a year (GBP 18,400.00), the last whole month the best. */
const KILN_MONTHS = [125_000, 130_000, 120_000, 140_000, 135_000, 150_000, 145_000, 160_000, 155_000, 170_000, 180_000, 230_000];
const KILN_STUDIOS = [38, 39, 39, 41, 42, 42, 44, 45, 47, 48, 50, 52];
const KILN_DOWNLOADS = [212, 240, 198, 260, 275, 251];
const MARLOW_HOURS = [22, 18, 26, 24, 30, 21, 28, 32];
/** Twelve months that add up to what Marlow & Co earned in a year (GBP 4,200.00), lower than the year before. */
const MARLOW_MONTHS = [45_000, 40_000, 45_000, 35_000, 40_000, 35_000, 30_000, 35_000, 30_000, 30_000, 25_000, 30_000];
const PORTAGE_PEOPLE = [140, 168, 190, 214, 236, 251, 270, 284, 301, 318];

/** The readings behind them, in Numbers: a month's revenue on its 28th, the studios each week, the downloads until three weeks ago. */
export const SAMPLE_READINGS: Fields[] = [
  ...KILN_MONTHS.map((minor, i) => ({ name: 'Revenue a month', thing: 1, amount: gbp(minor), at: monthBack(KILN_MONTHS.length - i), source: 'reported' })),
  ...KILN_STUDIOS.map((n, i) => ({ name: 'Studios licensed', thing: 1, value: n, unit: 'studios', at: `${day(-1 - 7 * (KILN_STUDIOS.length - 1 - i))}T09:00:00.000Z`, source: 'reported' })),
  ...KILN_DOWNLOADS.map((n, i) => ({ name: 'Specimen downloads', thing: 1, value: n, unit: 'downloads', at: `${day(-21 - 7 * (KILN_DOWNLOADS.length - 1 - i))}T09:00:00.000Z`, source: 'typed' })),
  ...MARLOW_MONTHS.map((minor, i) => ({ name: 'Billed a month', thing: 2, amount: gbp(minor), at: monthBack(MARLOW_MONTHS.length - i), source: 'typed' })),
  ...MARLOW_HOURS.map((n, i) => ({ name: 'Hours billed', thing: 2, value: n, unit: 'hours', at: `${day(-2 - 7 * (MARLOW_HOURS.length - 1 - i))}T17:00:00.000Z`, source: 'typed' })),
  ...PORTAGE_PEOPLE.map((n, i) => ({ name: 'Subscribers', thing: 3, value: n, unit: 'people', at: `${day(-1 - 7 * (PORTAGE_PEOPLE.length - 1 - i))}T09:00:00.000Z`, source: 'reported' })),
];

/** The kinds of project, since portfolio 1.19.0: what each one is, which picks the key numbers offered for it. */
export const PROJECT_KINDS = ['business', 'client', 'product', 'content'] as const;

/** The shapes a project's plan is kept in, SINCE portfolio 1.23.0: its road of stages, or its roadmap of dated work (`design-agent.ts` `PlanShape`). */
export const PLAN_SHAPES = ['path', 'roadmap'] as const;

/**
 * THE KEY NUMBERS' CONTRACT, SINCE portfolio 1.19.0 (the KPI plan of 21 October, Part 2.1): the `kpis` list's id, every
 * field it declares and every value of its enums, said once, so the kernel's ranking (`kpi-rank.ts`), the page source
 * over it and the renderer's block spell the same words as the list does. `portfolio-kpis.test.ts` holds the list to
 * this, field for field and value for value.
 *
 * A KPI IS A ROW, not a figure: a figure is a pack's, and a key number is added by its owner on a phone, suggested by
 * an agent as a draft, and differs per project. Its history is the readings it already has, in Numbers
 * (`readings`, matched on `measure` whole or as "measure, project"), or a figure's nightly snapshot.
 *
 * MONEY IS AN AMOUNT, as a reading's is: a KPI whose `unit` is a currency code keeps its target in `target_amount`,
 * integer minor units and that currency, and leaves `target` empty; any other keeps it in `target`.
 *
 * AN EMPTY `kind` IS WORKED OUT from `source` and `unit` by the reader, and an empty `good` reads `up`. Stale is a
 * newest point older than `stale.periods` times `every`, or `stale.days` with no `every` (the record's own
 * `FEED_LATE_PERIODS`). Today shows `most.today` at most, `most.phone` on a phone, one auto KPI a project.
 */
export const KPI_LIST = {
  list: 'kpis',
  readings: 'datapoints',
  fields: ['name', 'thing', 'measures', 'source', 'measure', 'figure', 'unit', 'kind', 'good', 'target', 'target_amount', 'target_by', 'every', 'owner', 'today', 'headline', 'order', 'draft', 'state'],
  source: ['numbers', 'figure', 'feed', 'agent', 'typed'],
  kind: ['level', 'flow', 'share', 'progress', 'count'],
  good: ['up', 'down'],
  every: ['1h', '1d', '1w', '1m'],
  today: ['auto', 'pinned', 'hidden'],
  state: ['live', 'retired'],
  defaults: { source: 'numbers', good: 'up', today: 'auto', headline: false, draft: false, state: 'live' },
  stale: { periods: 2, days: 14 },
  most: { today: 4, phone: 2 },
} as const;

/** The sample's key numbers and their readings, by the lists `KPI_LIST` names, written after the projects. */
export const SAMPLE_ROWS: Readonly<Record<string, readonly Fields[]>> = { [KPI_LIST.list]: SAMPLE_KPIS, [KPI_LIST.readings]: SAMPLE_READINGS };

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
    /* A PROJECT OTHER ENTRIES POINT AT STAYS, SINCE portfolio 1.16.0 ("there is no delete"). A task, a bill, a
       service or a person that names it was left pointing at nothing when it went; now the delete is refused and the
       sentence names the lists that still point at it and how many, as Accounts does. A project nothing points at
       goes, and comes back, as before. Closed is how a project leaves the board. */
    delete: 'refuse_while_referenced',
    fields: [
      { id: 'name', type: 'text', required: true, search: true },
      /* WHAT IT IS, IN A LINE, SINCE portfolio 1.6.0: "a variable type family, licensed direct". Drawn under the name on
         the Overview's cards, where a column of bare names said nothing to somebody who had not opened each one. Text
         and optional, so every project already written stays valid and an importer fills it where its source says. */
      { id: 'about', label: 'About', type: 'text', search: true },
      /* WHAT KIND OF PROJECT IT IS, SINCE portfolio 1.19.0 (the KPI plan of 21 October, 2.7): a business that earns, work
         for a client, a product being built, or content. It says which key numbers are offered as drafts when it is
         first set, and nothing else reads it; Status stays how it is going. Optional, so every project already written
         stays valid. */
      {
        id: 'kind',
        label: 'Kind',
        type: 'enum',
        values: PROJECT_KINDS,
        labels: { business: 'Business', client: 'Client work', product: 'Product', content: 'Content' },
        index: true,
      },
      /* SAID IN SENTENCE CASE, SINCE portfolio 1.9.0: the split under Where they are printed the stored words, "earning"
         and "building", where every other label on the page starts with a capital. `retired` reads Closed (29 October, his
         word: "instead of finished projects it should say closed"); the stored value stays `retired`. */
      {
        id: 'lane',
        label: 'Status',
        type: 'enum',
        values: ['building', 'earning', 'parked', 'retired'],
        labels: { building: 'Building', earning: 'Earning', parked: 'Parked', retired: 'Closed' },
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
      /* A PROJECT THE RECORD FORMED ITSELF from an agent's first session (portfolio 1.18.0), a draft until its owner keeps it. */
      { id: 'draft', label: 'Not kept yet', type: 'bool', default: false, hidden_from_agents: true },
      { id: 'mark', type: 'text', hidden_from_agents: true },
      { id: 'hue', type: 'int', hidden_from_agents: true },
      { id: 'note', type: 'document' },
      { id: 'repos', label: 'Repositories', type: 'list', of: 'text' },
      { id: 'folders', label: 'Folders', type: 'list', of: 'text' },
      /* THE DOMAINS IT LIVES AT, SINCE portfolio 1.14.0: `kiln.example`, so a mail, a deploy or a renewal naming one is
         read as about the project. A list of text, as an owner who added it by hand already had it, so the update lays
         the pack's field over theirs and keeps every row. */
      { id: 'domains', label: 'Domains', type: 'list', of: 'text' },
      /* HOW ITS PLAN IS DRAWN, SINCE portfolio 1.23.0 (§45 "Each project's roadmap is designed for that project"): its
         road of stages alone, or its roadmap of dated work alone, chosen by its owner or kept from what BrainDog drew
         for it (`packages/record/src/drew.ts`). Empty draws each it has, as before. Optional, so every project already
         written stays valid. */
      {
        id: 'drawn_as',
        label: 'Plan drawn as',
        type: 'enum',
        values: PLAN_SHAPES,
        labels: { path: 'Its stages', roadmap: 'A roadmap' },
      },
    ],
  },
  /**
   * THE STAGES A PROJECT GOES THROUGH, SINCE portfolio 1.23.0 (§45 "A roadmap is drawn, not listed: its stages, each
   * one's done-when line, and where it stands"). One row a stage, in order, each with the line that says when it is
   * done. A list of steps (`steps:`), so the project page draws them as a path with the one that is next marked, and an
   * agent's plan for a project is written here as its road.
   */
  stages: {
    id: 'stages',
    icon: 'milestone',
    name: 'Stages',
    one: 'stage',
    holds: "the stages a project goes through, in order, each with the line that says when it is done",
    title: 'name',
    mobile: ['name', 'thing', 'done'],
    pack: 'portfolio',
    steps: { of: 'thing', done: 'done', order: 'order' },
    order: { field: 'order', dir: 'asc' },
    fields: [
      { id: 'name', label: 'Stage', type: 'text', required: true, search: true },
      { id: 'thing', label: 'Project', type: 'ref', to: 'things', required: true, index: true },
      { id: 'done_when', label: 'Done when', type: 'text' },
      { id: 'done', label: 'Done', type: 'bool', default: false },
      { id: 'order', label: 'Order', type: 'int' },
      { id: 'aim', label: 'Aiming for', type: 'day' },
    ],
  },
  /**
   * NUMBERS, PORTFOLIO'S SINCE 1.19.0, TAKEN OVER FROM THE FOUNDER USE CASE (founder 3.0.0 hands it here, `hands`), under
   * the same id, so a founder's readings stay where they are: one number from one project at
   * one moment, reported by the project, polled by the record or typed. Every record with projects can hold a project's
   * key numbers now, and not only a founder's.
   *
   * NOT THE ORGANISATION OR THE SERVICE A READING IS ABOUT, which point at People's and Estate's lists, both installed
   * after Projects: the founder use case lays those two (`extends` in `usecases/founder.ts`) with the figures and blocks
   * that read them, so they are on a record exactly while what reads them is, and Portfolio still needs no other list.
   */
  datapoints: {
    id: 'datapoints',
    /* "NUMBERS" AND NOT "DATAPOINTS", which is a word from a database and not from a person. The id stays
       `datapoints`, because every door, poll and figure already writes to it by that id. */
    name: 'Numbers',
    one: 'number',
    icon: 'observe',
    holds: 'one number from one project at one moment, reported by the project or polled by the record',
    title: 'name',
    mobile: ['name', 'value', 'at'],
    pack: 'portfolio',
    /* NEWEST FIRST BY THE MOMENT A NUMBER IS FOR; the kernel breaks a tie by the row's id. */
    order: { field: 'at', dir: 'desc' },
    fields: [
      { id: 'name', label: 'Measure', type: 'text', required: true, index: true, search: true },
      /* A NUMBER OR AN AMOUNT: money is written as `amount`, integer minor units and its currency, and leaves `value`
         empty, so a feed of revenue never has the record guess a currency from a unit of text. */
      { id: 'value', label: 'Value', type: 'decimal' },
      { id: 'amount', label: 'Amount', type: 'money' },
      { id: 'unit', label: 'Unit', type: 'text' },
      { id: 'thing', label: 'Project', type: 'ref', to: 'things', index: true },
      { id: 'at', label: 'When', type: 'instant', index: true },
      {
        id: 'source',
        label: 'Source',
        type: 'enum',
        /* `example` IS A SEED'S, so every tile and chart leaves it out while it still shows, marked, in a list. */
        values: ['reported', 'polled', 'typed', 'example'],
        labels: { reported: 'Reported', polled: 'Polled', typed: 'Typed', example: 'Example' },
        index: true,
      },
      { id: 'tags', type: 'list', of: 'text' },
    ],
  },
  /**
   * THE KEY NUMBERS, SINCE portfolio 1.19.0: each project's KPIs as rows (`KPI_LIST` above), where it reads from, what
   * good looks like and how often a value should arrive. A row and not a figure, so its owner adds one on a phone and an
   * agent suggests one as a draft. Its values are the readings it already has, so nothing here holds a number but the
   * target.
   */
  kpis: {
    id: 'kpis',
    icon: 'gauge',
    /* KEY NUMBERS, AND NOT NUMBERS, which is the readings' list above: two lists with one name. */
    name: 'Key numbers',
    one: 'key number',
    holds: "the numbers each project is judged by, where each one's values come from and what good looks like",
    title: 'name',
    mobile: ['name', 'thing', 'target'],
    pack: 'portfolio',
    fields: [
      { id: 'name', label: 'Name', type: 'text', required: true, search: true },
      { id: 'thing', label: 'Project', type: 'ref', to: 'things', required: true, index: true },
      /* ONE LINE OF WHAT IT MEASURES, for the hover and for an agent reading it. */
      { id: 'measures', label: 'What it measures', type: 'text' },
      {
        id: 'source',
        label: 'Comes from',
        type: 'enum',
        values: KPI_LIST.source,
        labels: { numbers: 'Numbers', figure: 'Worked out from my lists', feed: 'A feed', agent: 'An agent', typed: 'I type it' },
        default: KPI_LIST.defaults.source,
        index: true,
      },
      /* THE READING'S NAME IN NUMBERS, for every source but `figure`: matched whole or as "measure, project". */
      { id: 'measure', label: 'Measure', type: 'text', index: true },
      /* A DECLARED FIGURE WITH `{{it}}`, for `figure`: `project-in-by-month`, `project-owed`, `project-last-worked`. */
      { id: 'figure', label: 'Figure', type: 'text' },
      /* `USD`, `players`, `%`, `days`: a currency code makes it money, as a reading's unit does. */
      { id: 'unit', label: 'Unit', type: 'text' },
      {
        id: 'kind',
        label: 'Shape',
        type: 'enum',
        values: KPI_LIST.kind,
        labels: { level: 'Level', flow: 'Flow', share: 'Share', progress: 'Progress', count: 'Count' },
      },
      {
        id: 'good',
        label: 'Which way is good',
        type: 'enum',
        values: KPI_LIST.good,
        labels: { up: 'Up', down: 'Down' },
        default: KPI_LIST.defaults.good,
      },
      { id: 'target', label: 'Target', type: 'decimal' },
      { id: 'target_amount', label: 'Target amount', type: 'money' },
      { id: 'target_by', label: 'Target by', type: 'day', index: true },
      {
        id: 'every',
        label: 'How often',
        type: 'enum',
        values: KPI_LIST.every,
        labels: { '1h': 'Every hour', '1d': 'Every day', '1w': 'Every week', '1m': 'Every month' },
      },
      /* WHO KEEPS IT: a person's name, an agent's kind ("claude"), or a feed's name. */
      { id: 'owner', label: 'Kept by', type: 'text', index: true },
      {
        id: 'today',
        label: 'Show on Today',
        type: 'enum',
        values: KPI_LIST.today,
        labels: { auto: 'Auto', pinned: 'Always', hidden: 'Never' },
        default: KPI_LIST.defaults.today,
        index: true,
      },
      { id: 'headline', label: 'Shown first', type: 'bool', default: KPI_LIST.defaults.headline },
      { id: 'order', label: 'Order', type: 'int' },
      /* SUGGESTED AND NOT KEPT YET, as a draft project is (portfolio 1.18.0): nothing is tracked until its owner keeps it. */
      { id: 'draft', label: 'Not kept yet', type: 'bool', default: KPI_LIST.defaults.draft },
      /* RETIRED KEEPS ITS HISTORY AND LEAVES EVERY SCREEN. */
      {
        id: 'state',
        label: 'State',
        type: 'enum',
        values: KPI_LIST.state,
        labels: { live: 'Live', retired: 'Retired' },
        default: KPI_LIST.defaults.state,
        index: true,
      },
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
  /* HOW MANY ARE EARNING, REMEMBERED EACH NIGHT, SINCE portfolio 1.17.0, for the strip on Projects that says it
     beside In play with the line of its nights. A count and not the year's money: that is the sum of What each one earns,
     and a figure is said once on a page (`packages/seed/test/portfolio.test.ts`). */
  'projects-lane-earning': { ...counted('projects-lane-earning', 'Earning', 'lane is earning'), snapshot: { grain: 'day', into: 'series.projects-lane-earning' } },
  /* WHAT THE OVERVIEW'S FOLDED TILES ARE DRAWN ON, SINCE portfolio 1.8.0, each over its tile's own clauses, so a tile is
     never drawn empty and never hidden while it holds a project. */
  'projects-aiming': counted('projects-aiming', 'Aiming for a day', `${LIVE}, aim is set`),
  'projects-not-in-play': counted('projects-not-in-play', 'Parked or closed', 'lane is parked or retired'),
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
  'projects-retired': counted('projects-retired', 'Closed', 'lane is retired'),

  /* ── the key numbers, since portfolio 1.19.0 ──────────────────────────────
     HOW MANY KEY NUMBERS ARE KEPT, live and not a draft: what a block over them is drawn on, so a record with none
     draws nothing (calm before rich). */
  'kpis-held': {
    metric: 'kpis-held',
    name: 'Key numbers kept',
    source: 'register.kpis',
    where: 'state is live, draft is false',
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
  /* HOW MANY READINGS NUMBERS HOLDS, SINCE portfolio 1.31.0 (empty states, 2 Nov): the example left out, as every count of
     Numbers is. What the Numbers page's line is drawn on while it holds none. */
  'readings-held': {
    metric: 'readings-held',
    name: 'Readings',
    source: 'register.datapoints',
    where: 'source is not example',
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
  /* HOW LONG SINCE A MEASURE WAS LAST READ, in days, `{{it}}` the measure's name in Numbers: `kpi-stale:Daily active
     players`. Held to the days a key number with no cadence may go quiet (`KPI_LIST.stale.days`), so a reading of 23
     misses it; one with a cadence is held to twice it by the reader. The example left out, and up to today, as every
     count of Numbers is. A tree, because a measure's name may hold a comma. A measure never read reads nothing. */
  'kpi-stale': {
    metric: 'kpi-stale',
    name: 'Days since it was read',
    source: 'register.datapoints',
    where: { all: [{ field: 'name', is: '{{it}}' }, { field: 'source', not: 'example' }, { field: 'at', before: 'tomorrow' }] },
    value: { age: 'at' },
    format: 'days',
    target: { lte: KPI_LIST.stale.days },
    window: '30d',
    compare: 'none',
  },
  /* HOW THE PROJECTS IN PLAY ARE GOING, as parts of one whole, with the ones nobody has said about as their own part. */
  'projects-by-health': { ...counted('projects-by-health', 'How they are going', LIVE), group_by: 'health' },
  /* WHAT THE SPLIT ABOVE IS DRAWN ON, SINCE portfolio 1.17.0: the projects in play somebody said how they are
     going about. A record where nobody has drew one grey bar of Not said yet, which says nothing a person can act on. */
  'projects-with-health': counted('projects-with-health', 'Saying how they are going', `${LIVE}, health is set`),
  /* EVERY PROJECT BY ITS STATUS, SINCE portfolio 1.6.0: one track cut into earning, building, parked and finished, so the
     Overview says in one line where the projects are before it lists any of them. Over every project and not only
     those in play, because a strip of the whole is what says how much of it is parked. `lane` is required, so no
     project is in no part. */
  'projects-by-lane': { ...counted('projects-by-lane', 'Where they are', 'lane is not retired'), group_by: 'lane' },

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

  /* WHETHER ANYBODY HAS SAID WHERE A PROJECT STANDS, SINCE portfolio 1.16.0: how it is going, how far along,
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

  /* WHAT WAS WORKED ON THIS WEEK, SINCE portfolio 1.16.0: the tasks on a project written to in the last seven
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
     task reads nothing, never nought. Filed with Work beside `project-moved-7d`, by the list it reads.
     QUIET PAST THIRTY DAYS, SINCE work 1.19.0: the target is the most days a project in play may go
     with nothing written on it, so a reading of 40 misses it and is drawn in the late tone beside its word, on the
     project page's Where it stands and on its card in play. A declaration, so a person who means a fortnight writes 14.
     TASKS ONLY: a figure reads one list, and no shape takes the newest of three figures, so a project worked through
     its updates or readings alone still reads as quiet until one does. */
  'project-last-worked': {
    metric: 'project-last-worked',
    name: 'Last worked',
    source: 'register.tasks',
    where: 'thing is {{it}}',
    value: { age: 'updated_at' },
    format: 'days',
    target: { lte: 30 },
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
     it carried was one studio's size in one currency. Empty until somebody sets it, so no verdict until then.
     NAMED AS MONEY STILL ON ITS WAY, the words Shop heads its unpaid orders with, where it said Owed to you: the id,
     what it sums and the setting it is held to are as they were. */
  'project-owed': {
    metric: 'project-owed',
    name: 'Still to come in',
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

  /* A PROJECT'S STAGES, SINCE portfolio 1.23.0: the project page draws them as its road when it has any. */
  'project-staged': {
    metric: 'project-staged',
    name: 'Stages',
    source: 'register.stages',
    where: 'thing is {{it}}',
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /* WHICH SHAPE ITS PLAN IS KEPT IN, SINCE portfolio 1.23.0: its road alone, or its roadmap alone. Neither chosen, the
     project page draws both where it has both. */
  'project-plan-path': {
    metric: 'project-plan-path',
    name: 'Plan drawn as its road',
    source: 'register.things',
    where: { all: [{ field: 'name', is: '{{it}}' }, { field: 'drawn_as', is: 'path' }] },
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
  'project-plan-roadmap': {
    metric: 'project-plan-roadmap',
    name: 'Plan drawn as a roadmap',
    source: 'register.things',
    where: { all: [{ field: 'name', is: '{{it}}' }, { field: 'drawn_as', is: 'roadmap' }] },
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
 * THE SCRIPT PROJECTS SHIPS, SINCE portfolio 1.22.0: each project's key numbers offered from what Numbers holds (the KPI
 * plan's K2-C). It was written and tested (`portfolio/kpi-backfill.js`) and declared nowhere, so a record that kept
 * readings in Numbers held no key number and nothing offered one. It asks, once a project, and writes nothing itself.
 */
export const PORTFOLIO_AUTOMATIONS: readonly Record<string, unknown>[] = [KPI_BACKFILL_SCRIPT, ...KIND_DRAFTS];

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


/** What was finished on a project in the last seven days, and how that moved over four weeks: At a glance's last figure. */
const PROJECT_DONE_CELL = { metric: 'project-done-7d:{{name}}', label: 'Done this week', trend: '4w' } as const;

/* NO LINE COUNTING HOW MANY SAY WHAT THEY EARNED, SINCE portfolio 1.18.0: "3 of 3 projects in play say what they earned in a
   year" in a grey box beside the split, which the split says by being drawn. */

export const PORTFOLIO_PAGES: Record<string, SeedPage> = {
  /**
   * THE PORTFOLIO, LEADING WITH WHAT NEEDS YOU. "Which of my
   * projects are moving, which need a call, and where my agents are": the figures, the queue of projects somebody said
   * are at risk or off track with who said so, every project in play as a card, what agents hold, what is coming up, and
   * the parked and finished ones folded away. Every block reads Projects alone, so it opens on any record that keeps them.
   *
   * CALMER, SINCE portfolio 1.8.0: the line, then where the projects are and how they are going, what
   * needs you and the projects in play, and what each earns, what agents hold and what is coming up folded under them.
   * No figure is said twice: Need you is the line's, and the year earned is the sum of What each one earns. Every heading wears a glyph, and every tile over the projects is drawn only while it holds one.
   *
   * EACH THING ONCE, SINCE portfolio 1.11.0: the line, one track of how they are going, and the cards, with Needs you and
   * Where they are gone (the visual review of October 2nd).
   *
   * ONLY THE LINE SAYS WHAT IS EMPTY, AND THE PARKED ARE A COUNT, SINCE portfolio 1.13.0. With nothing in
   * play the line says so and how to start, where it said every project in play was on track over a page with none,
   * and In play is drawn only while it holds one. Parked and finished is a heading that counts what is folded under
   * it, and it read every one of those projects whole, its notes included, to say one number.
   *
   * NO FOLD OVER A SHORT LIST, SINCE portfolio 1.15.0 (the second design review's fix 6). With three
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
    /* ITS PLACE ON THE RAIL, SINCE batch 101 (places-and-computed-101): the lead pages sit Work, Orders, Projects,
       Money, People, Agents, lowest first (`placesOf` in `packages/record/src/places.ts`). */
    nav: { section: 'Projects', order: 5, place: 30 },
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
        /* A RECORD WITH NO PROJECT AT ALL, SINCE portfolio 1.27.0: a new record's Projects
           said "No project is in play. Add one, or set a parked one building." over nothing to press, and nothing was
           parked. One line, and the Add a project box under it says how. No figure, so no line is asked of it. */
        kind: 'note',
        lead: true,
        span: 12,
        when: { all: [{ metric: 'projects-live', is: 0 }, { metric: 'projects-parked', is: 0 }, { metric: 'projects-retired', is: 0 }] },
        body: 'No project yet. Add the first one below.',
      },
      {
        /* THE ONE THING TO DO ON A PAGE WITH NOTHING IN PLAY, SINCE portfolio 1.13.0, which was In play's own empty line:
           a line is the one place a page says it is empty. FIRST OF THE THREE, because the record draws the one saying
           nothing needs you too over none in play, and the nightly line is written for the first line a page draws
           (`leadBlockOf` in `packages/record/src/headlines.ts`): asked of "across 0 projects", the model's line would
           be drawn over this one saying the same. This one has no figure, so no line is asked of it. */
        kind: 'note',
        lead: true,
        span: 12,
        /* ONLY WHILE ONE IS PARKED, SINCE portfolio 1.27.0: a new record has none to set
           building, so it said a step it could not take. The record with no project at all has the line before this. */
        when: { all: [{ metric: 'projects-live', is: 0 }, { metric: 'projects-parked', gt: 0 }] },
        body: 'No project is in play. Add one, or set a parked one building.',
      },
      /* NO LINE SAID FROM HOW THE PROJECTS ARE GOING, SINCE portfolio 1.30.0: "Nothing needs a push" read only each
         project's health, which a record may never set, so it was false beside two late projects. The board below leads
         with a fact instead (`key: board`): what is late, what is due this week, whose numbers went quiet, what waits and
         what renews, naming the projects. The two lines for a record with no project stay above. */
      {
        /* ONE BOX TO ADD A PROJECT WHILE NONE IS IN PLAY, SINCE portfolio 1.27.0: the page said
           "Add one" with nothing to press. Under the line, as Work's box is under its own, and a project added here is
           Building, the first of its lanes. */
        kind: 'capture',
        heading: 'Add a project',
        icon: 'plus',
        span: 12,
        register: 'things',
        when: { metric: 'projects-live', is: 0 },
      },
      /* NO IN PLAY AND EARNING STRIP, SINCE portfolio 1.18.0: a full-width tile saying "In play 3, Earning 2", which the line
         above already says. */
      /* NO WHERE THEY ARE, SINCE portfolio 1.30.0: a bar of lanes said 45% are building and nothing to act on. The
         board's date line says how many are in play, parked and finished. */
      /* NO RIGHT NOW TILE, SINCE portfolio 1.10.0. It held In play and what aims to land within thirty days in a third of
         the row, beside two splits a third its height, so the row ended at three heights. In play is the line's now;
         what aims within thirty days is Coming up, folded under Earnings, agents and dates; and what an agent holds is
         With an agent beside it. */
      /* NO HOW THEY ARE GOING, SINCE portfolio 1.31.2 (4 Nov, the owner: "projects page looks poor"): past four projects a whole
         tile of coloured bar stood over the projects, and said how many are at risk, not which. Each card says so now
         beside its lane. `metric.projects-by-health` stays declared, since a page somebody made may draw on it. */
      /* NO NEEDS YOU TABLE, SINCE portfolio 1.11.0. It listed the projects at risk with their health and next step, and
         the cards under it say both on every project in play, while the line counts them: Kiln's next step was on the
         page three times. */
      {
        kind: 'cards',
        heading: 'In play',
        icon: 'rocket',
        span: 12,
        /* THE BOARD, SINCE portfolio 1.30.0: the app draws this block as the Projects board (`ProjectsBoard.svelte`), its
           headline, what the earning ones bring in a month, this week's four counts, one list in three groups and the
           parked and finished as a strip. Read by its key; a host that does not know it draws the cards. */
        key: 'board',
        source: 'register.things',
        /* EVERY PROJECT, THE FINISHED TOO, SINCE portfolio 1.30.0: the board counts them on its date line and folds them
           into its last strip. The cards a host draws in its place leave the finished out themselves. */
        /* EACH CARD WEARS THE PROJECT'S OWN MARK IN ITS OWN HUE, SINCE portfolio 1.6.0, the identity the list declares
           (`identity: { mark, accent }`), and says what the project is under its name (`about`, drawn as the quieter
           line under a title). Neither is a fact, so the three facts below are unchanged.
           THE ONE LINE IS TYPED ON THE CARD, SINCE portfolio 1.17.0: `edit: true` on `about`, written after a
           pause through the page's own writer where the reader may write the list, and text everywhere else. */
        columns: [
          { field: 'name', as: 'title' },
          { field: 'mark', as: 'mark' },
          { field: 'hue', as: 'hue' },
          { field: 'about', as: 'reply', edit: true },
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
             nothing was finished on, draws no line, and the card is as it was.
             ONLY WHERE THE PROJECT KEEPS NO KEY NUMBER, SINCE the KPI plan of 21 October (2.5, decided 3): a card leads
             with its project's headline key number and draws that number's own readings, so this line is the card's
             fallback, never drawn beside a key number. SINCE portfolio 1.20.0 THE COLUMN SAYS SO ITSELF (`kpi: headline`):
             the record draws each card's line from the number its project leads with, over the `kpis` source `for:
             cards` that the app's `withKpis` reads too (`trendsOf` in the kernel's `pages.ts`), by that number's own
             periods, and this figure only on a card whose project keeps none with a value. */
          { metric: 'project-done-by-week:{{name}}', kpi: 'headline', as: 'trend' },
          /* HOW LONG SINCE ANYBODY WORKED ON IT, SINCE portfolio 1.17.0: Work's `project-last-worked` for the
             card's own project, the reading the project page's Where it stands draws, said in the card's head as "Worked on 2
             days ago", or "Quiet for 40 days" in the late tone once it misses its thirty days. A project with no task reads
             nothing and the card draws no line. So a quiet project is seen on the list.
             ITS TASKS AND ITS RUNS TOGETHER, SINCE portfolio 1.26.0: the record's own
             `project-worked`, the figure Today's cards read, so a card here says "Claude worked on it 20 minutes ago"
             where Today does, and never "4 days ago" from the tasks alone. */
          { metric: 'project-worked:{{name}}', as: 'when', label: 'Worked on' },
        ],
        order: [{ field: 'name', dir: 'asc' }],
        /* EVERY PROJECT IN PLAY OR PARKED, SINCE portfolio 1.21.0 (batch 4's look on his record): twelve by name, parked
           among them, and the lane bar the app draws over these cards said "In play 5" where Today, the sidebar and the
           More sheet said 13. A count read off part of a list is never drawn; a hundred is past any record's projects. */
        limit: 100,
        /* DRAWN ONLY WHILE ONE IS IN PLAY OR PARKED, SINCE portfolio 1.13.0 and the redesign: its empty line,
           the one thing to do on a page with no project, is the line's now, and a parked one is a lane of these cards. */
        when: { any: [{ metric: 'projects-live', gt: 0 }, { metric: 'projects-parked', gt: 0 }, { metric: 'projects-retired', gt: 0 }] },
      },
      {
        /* WHAT A RULE OR AN AGENT ASKED ABOUT A PROJECT, SINCE portfolio 1.17.0, answered here, three at a time,
           one tile each, and the rest in Decide: the questions whose row is on Projects (`list is things`), counted by
           `questions-open-in:things` and drawn only while that is above nought. A project's own page draws its own
           (`about is {{spoken}}`); this is every project's at once. UNDER IN PLAY AND BEFORE THE OPEN TILE, which takes
           every block after it up to the next heading: at 1440 In play and earning, Where they are, How they are going,
           In play, this and that tile, six before the fold (since 1.17.0). */
        kind: 'queue',
        heading: 'Waiting on you',
        icon: 'ask',
        span: 12,
        source: 'governance.open',
        where: 'list is things',
        limit: 3,
        tiles: true,
        when: { metric: 'questions-open-in:things', gt: 0 },
      },
      /* NO WHAT EACH ONE EARNS, SINCE portfolio 1.30.0: the board's Earning, a month says it beside its headline, a
         month at a time and with each project's own warning, where this split said the year each one typed. */
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
   * CALMER, SINCE portfolio 1.8.0: the line first, then six tiles, what needs you, where it stands, how
   * its work moved, what is open and handed back, and the plan, and everything after them folded shut: who worked on it
   * and its notes, its money, and in the rail what it runs on with what that costs. Each date is drawn once, on the
   * plan, and the month so far is the chart's newest month and not a tile beside it. Still twenty-one blocks.
   *
   * EVEN ROWS, SINCE portfolio 1.10.0 (the visual review of October 2nd): where it stands and what is handed back sit in
   * the rail under At a glance, one column of short tiles beside the chart, which takes the main column; What is open
   * goes, the plan drawing the same tasks; and what is handed back is drawn only while it lists one. Twenty blocks.
   *
   * NO CHART OF ONES AND TWOS, SINCE founder 2.3.0 and team 2.18.0 ("a chart is drawn only when it says
   * something; else the tile shows the number", and the second design review's fix 5). Done, by week was a tile 280px
   * tall, the whole of the main column, for bars of 1 and 2. What was finished this week is a figure of At a glance,
   * with how it moved as the line beside it, and the plan leads the main column. Nineteen blocks.
   */
  /**
   * NUMBERS, THE LIST'S OWN PAGE, SINCE portfolio 1.22.0: `list: datapoints` sends `/r/datapoints` here, where the
   * generic list drew 2,527 readings a row each, 9,350 px of "CPU, bake" four weeks ago. Each kind of number is said once,
   * under the project it is for (the sixth column, `thing`), with its newest value, its unit and how old it is; the two
   * that moved most over the year are drawn as lines above them. A reading's row page opens here searched for its name
   * (`q`, the head's search), which is its chart. The example left out, as every block over Numbers leaves it.
   *
   * THE ROWS AS A TABLE ARE ONE LINK AWAY, `?rows=1`, the list's own screen, for a person who wants every reading.
   */
  'all-numbers': {
    page: 'all-numbers',
    title: 'Numbers',
    icon: 'observe',
    list: 'datapoints',
    requires: ['register.datapoints'],
    pack: 'portfolio',
    header: { search: { param: 'q' } },
    blocks: [
      {
        key: 'numbers-line',
        kind: 'note',
        lead: true,
        span: 12,
        /* WHAT WILL BE HERE WHILE NOTHING IS, SINCE portfolio 1.31.0 (empty states, 2 Nov): a new Numbers said "What your
           projects report, newest first." over no number and a link to an empty table. AND ONLY THEN, SINCE portfolio
            1.31.1 (3 Nov): that line said what the cards under it show. */
        when: { metric: 'readings-held', is: 0 },
        body: 'No project has reported a number yet. [Add a key number](/r/kpis).',
      },
      {
        key: 'numbers-by-project',
        kind: 'lines',
        heading: 'By project, this year',
        icon: 'chart-line',
        span: 12,
        source: 'register.datapoints',
        columns: [{ field: 'at' }, { field: 'value' }, { field: 'name' }, { field: 'unit' }, { field: 'amount' }, { field: 'thing' }],
        where: 'source is not example',
        back: 366,
        bucket: 'week',
        limit: 2,
        most: 40,
        empty: 'No project has reported a number this year.',
      },
      {
        key: 'numbers-rows',
        kind: 'link',
        heading: 'All readings',
        icon: 'rows',
        span: 12,
        authored: [{ cells: ['Open every reading as a table', '/r/datapoints?rows=1', 'Every reading on its own line, newest first'] }],
        /* ONLY ONCE THERE IS A READING, SINCE portfolio 1.31.0: a link to an empty table under the line saying none came. */
        when: { metric: 'readings-held', gt: 0 },
      },
    ],
  },
  project: {
    page: 'project',
    title: '{{name}}',
    /* EVERY PROJECT, PARKED AND FINISHED ONES TOO (things, not rows, 24 October): it was the ones building or earning,
       so a parked project's row opened on its fields. Its hero says it is parked, and since when, quietly. */
    for: { register: 'things' },
    nav: { section: 'Projects', order: 10 },
    icon: 'thing',
    layout: { rail: 4 },
    requires: ['register.things', 'register.stages', 'register.tasks', 'register.session', 'register.obligations', 'register.services', 'register.transactions'],
    blocks: [
      /* THE PROJECT'S OWN SHAPE, AS BLOCKS OF ITS PAGE, SINCE founder 3.3.0 and team 2.25.0 (24 October): its hero with its
         Path and Money under it, then its Work and Who is on it with Runs on and the agents on it under them. They were
         drawn by hand over the blocks below, so the page pulled as text did not say they were there and none could be
         moved, hidden or changed. Each is a `project` block now, its parts named in the order they are drawn, read for
         the row the page is about, and drawn only where a part of it has something to say: a part with nothing is left
         out, and its partner beside it takes the whole row. The widths are the shape's from a wide screen: the path at
         two thirds beside the money, the work beside who is on it, what it runs on beside who was here today.

         TWO BLOCKS AND NOT A PART A BLOCK, since a page holds 24 blocks and shows six tiles before it folds, and a
         founder's project page held 24 already. So two blocks the page drew only where the shape was not went for them:
         Handed back or blocked (the Work tile's With you) and Money by month (the Money tile's bars). */
      /* THREE BLOCKS, LANE BY LANE, SINCE founder 3.7.0 and team 2.28.0 (the project page of 27 October): the hero, whose
         headline is a fact and whose next step is drawn once as a checklist, beside its lane's tile (what it brings in
         while it earns, its dated path while it is built, what it costs to keep while parked); its numbers with their
         lines and ages beside its work; and the rest of its picture in one block, laid in rows as they fit (`rowLaid`,
         `project-parts.ts`): its dates beside who is on it and what it runs on and renews, the agents' sessions, with
         the box to tell them at the foot, beside what was decided, and what happened, in words. Three and not a block a
         row, so the page keeps the room under the ceiling of 24 that a use case adds to. */
      { kind: 'project', parts: ['hero', 'side'], heading: 'Overview', icon: 'eye', span: 12 },
      { kind: 'project', parts: ['numbers', 'what-is-open'], heading: 'Numbers and work', icon: 'chart-line', span: 12 },
      { kind: 'project', parts: ['dates', 'who-is-on-it', 'runs-on', 'agents-here', 'decisions', 'happened'], heading: 'Dates, people, agents and what happened', icon: 'calendar', span: 12 },
      /* THE OPENING SENTENCE, SAID FROM THE PROJECT'S FIGURES. A sentence cannot print a figure named for one project
         (`{{project-open:Kiln}}` is not a path the page reads), so each sentence is drawn on its figure's `when:`
         instead, as the launch desk's are.

         EXACTLY ONE OF THE TWO, ON ONE FIGURE, SINCE portfolio 1.9.0. Before it the second said "nothing is open" and a
         project with open work and nothing handed back, which is most of them, had no sentence at all: Kiln opened on
         a bare title over a band of tiles. Now work handed back is the line when there is any, and otherwise the line
         is the project's own next step, the one sentence whoever works on it keeps current. A project with no next step
         written has neither: the app drops a lead clause whose hole it cannot fill (`leadOf`), so it never reads
         an empty line.

         ONE NOTE AND TWO SENTENCES, SINCE portfolio 1.23.0 (`says:`), where it was two notes on one figure, so the page
         keeps a block for its road under the ceiling a use case adds to. The first whose `when:` holds is said. */
      {
        kind: 'note',
        lead: true,
        span: 12,
        says: [
          { when: { metric: 'project-in-review:{{name}}', gt: 0 }, body: 'Work on {{name}} has been handed back, and it waits for you to check it.' },
          /* THE NEXT STEP ALONE, SINCE portfolio 1.12.0: the page's title already names the project, and "Next on Kiln:"
             in front of it said so twice. */
          { body: '{{next}}' },
        ],
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
          /* LABELLED AS ITS FIGURE IS NAMED, since the figure's name heads the list this opens. */
          { metric: 'project-owed:{{name}}', label: 'Still to come in' },
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
           person ("status colours as small dots and text"). */
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
        /* ONLY WHILE SOMEBODY HAS SAID ONE OF THE FOUR, SINCE portfolio 1.16.0. On a record nobody had
           described a project on, which is every imported one, the card was a dash and nothing else on every project
           page; the figures under the same heading speak instead. */
        when: { metric: 'project-said:{{name}}', gt: 0 },
      },
      {
        /* WHERE IT STANDS FROM WHAT HAPPENED ON IT, SINCE portfolio 1.16.0: drawn while nobody has said, so
           its figures stand alone, which is how a project stays until its owner answers the tidy after an import. What
           was worked on this week, from the day the record stamps each task it writes. What is open is At a glance's
           first figure straight above, so it is not said twice. How long since anybody worked on it beside that, from the
           same stamps (`project-last-worked`), so a project that went quiet a month ago reads "30 days" and not only a
           nought for this week. A use case that keeps more adds its own cell (founder's numbers this week).
           LAST WORKED READS ITS RUNS TOO, SINCE founder 3.4.0 and team 2.26.0: the
           record's own `project-worked`, the figure its card on Projects and on Today reads. */
        kind: 'stat',
        heading: 'Where it stands',
        icon: 'target',
        span: 12,
        area: 'rail',
        key: 'stands-figures',
        cells: [
          { metric: 'project-moved-7d:{{name}}', label: 'Changed this week' },
          { metric: 'project-worked:{{name}}', label: 'Last worked' },
        ],
        when: { metric: 'project-said:{{name}}', is: 0 },
      },
      /* NO DONE, BY WEEK, SINCE founder 2.3.0 and team 2.18.0: from work 1.10.0 it charted what was finished on the
         project each of the last eight weeks, the whole of the main column, and on most projects that is a bar of 1
         beside a bar of 2. Done this week is the last figure of At a glance. */
      /* NO WHAT IS OPEN, SINCE portfolio 1.10.0: the plan draws every open task with a day, so the page listed the same
         tasks twice, one tile above the other. A task with no day is on Work, narrowed to the project. */
      {
        /* ITS ROAD, SINCE portfolio 1.23.0 (§45 "A roadmap is drawn, not listed"): its stages in order, each with the
           line that says when it is done, the done ones marked and the one that is next said, so where it stands is
           read at a glance. Drawn only when the project has stages. IN THE RAIL, under where it stands and what waits,
           a path read top to bottom, so the main column keeps the plan of its work and the first screen keeps its six. */
        kind: 'steps',
        heading: 'The road',
        icon: 'flag',
        span: 12,
        area: 'rail',
        source: 'register.stages',
        where: 'thing is {{name}}',
        columns: [
          { field: 'name', label: 'Stage' },
          { field: 'done_when', label: 'Done when' },
        ],
        order: [{ field: 'order', dir: 'asc' }],
        limit: 20,
        /* AND NOT WHILE ITS PLAN IS KEPT AS A ROADMAP ALONE, SINCE portfolio 1.23.0 (`drawn_as`). */
        when: { all: [{ metric: 'project-staged:{{name}}', gt: 0 }, { metric: 'project-plan-roadmap:{{name}}', is: 0 }] },
        empty: '{{name}} has no stages yet.',
      },
      {
        /* EVERYTHING ELSE ABOUT IT, AS ONE TILE, SINCE work 1.15.0 (the design review's fix 9). From
           1.8.0 who worked on it and its notes, its money, and what it runs on were three sections folded shut, each a
           tile 56px tall holding only its name and a Show button, which read as unfinished. Now they are one boxed tile
           under the plan, its parts on one surface, each short: the last few changes and runs, the notes, the money by
           month and the next bills, and what keeps it running. A part with nothing in it is not drawn, so a new project's
           tile is its notes.

           THE SCHEDULED ACTIONS LEFT THE RAIL FOR IT (Resume, Pause), which the host draws under this heading
           (`panel: actions`). The rail keeps the short tiles beside the plan. ITS KEYS, TOOLS AND SKILLS ARE THE
           SECTION AFTER THIS ONE, "Runs on", under a heading of their own. */
        kind: 'section',
        heading: 'More about {{name}}',
        icon: 'notebook-pen',
        span: 12,
        box: true,
        panel: 'actions',
        /* FOLDED SHUT, SINCE founder 3.3.0 and team 2.25.0, as the project's page has drawn it since the hero (`project-page.ts`):
           said here, so the page read as text says so too. */
        fold: true,
      },
      {
        /* ITS PLAN ON A TIME AXIS, AND ITS DATES ONCE, SINCE portfolio 1.8.0: a calendar of the month above it drew the
           same tasks on the same days a second time, so it went.

           ITS PLAN ON A TIME AXIS: each task in play with a day, as a window as long as its effort ending on that day, or a
           line on the day where it has no effort. Drawn only when the project has such a task (`project-dated`), so a
           project nobody has planned in days says nothing about a plan rather than showing an empty axis.
           UNDER MORE ABOUT, SINCE founder 3.7.0 and team 2.28.0: the tile beside the hero draws a project's dated path while
           it is built, so the axis is one press away, where the app already drew it as Plan by date. */
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
        /* AND NOT WHILE ITS PLAN IS KEPT AS ITS ROAD ALONE, SINCE portfolio 1.23.0 (`drawn_as`). */
        when: { all: [{ metric: 'project-dated:{{name}}', gt: 0 }, { metric: 'project-plan-path:{{name}}', is: 0 }] },
        empty: 'No task on {{name}} has a day yet.',
      },
      {
        /* ITS KEY NUMBERS, SINCE founder 3.0.0 and team 2.21.0 (the KPI plan of 21 October, 2.8): the one it leads with
           large with its chart, the rest as small tiles, each its value, its line from three points, its target and
           whether it is late, from the project's own rows of Key numbers (`kpis`, the kernel's `sources/kpis.ts`). The
           whole width under the questions, before the plan. A number is pressed to change it, and the app adds one at
           the foot and lists what was suggested and not kept yet under it.
           UNDER MORE ABOUT, SINCE founder 3.7.0 and team 2.28.0: the Numbers part beside the work draws them with their
           lines and ages, so here they are kept to be changed, one press away. */
        kind: 'kpis',
        heading: 'Key numbers',
        icon: 'chart-line',
        span: 12,
        key: 'kpis',
        source: 'kpis',
        for: 'project',
      },
      /* NO WHAT CHANGED, SINCE founder 3.7.0 and team 2.28.0: What happened says the changes in words, with the edits to
         the project's own row folded into one line a day. */
      {
        /* CARDS, because an agent working on the project is a face and a sentence, not a row in a log. The last three
           runs, beside what changed.

           ONE CARD FOR A RUN AND ITS HELPERS (AGT-C12 job d). The tile read every run placed in the project, so a run
           and each helper it started were a card apiece, and so was a run that opened and wrote nothing; and each was
           titled by `doing`, which on a run nobody named is the record's own name for it. A project's page listed six
           cards with one title. A CARD IS THE AGENT AND WHAT IT SAID, as on Agents: `doing_said` is the column the
           record works out over the list of runs, empty where the name is the record's own or reads as a path.
           KEPT FOR A HOST THAT DOES NOT DRAW THE AGENTS' PART: the app draws the sessions there, with how each ended. */
        kind: 'cards',
        heading: 'Agents',
        icon: 'bot',
        span: 12,
        columns: [{ field: 'agent', as: 'title' }, { field: 'doing_said', as: 'reply' }, { field: 'last_seen', as: 'when' }],
        source: 'register.session',
        /* BY `project`, WHICH HOLDS THE PROJECT'S SPOKEN ID, `things#1`. `{{spoken}}` is that id for the
           row the template is about, filled by both engines.

           A RUN OF ITS OWN THAT DID SOMETHING, in the Agents page's own words (`RAN` in `packs/agents.ts`): not a
           helper, whose work is its parent's, and not a run that signed no write. `is not 0`, so a run whose writes
           the record has not counted yet is kept. */
        where: 'project is {{spoken}}, parent is empty, wrote is not 0',
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
        kind: 'table',
        heading: 'Bills and invoices',
        icon: 'receipt',
        /* THE WHOLE WIDTH SINCE 24 October (things, not rows), and so is Services: a parked project's page, which
           the look orders by what it has, put a half alone in a row of its own, beside a hole. */
        span: 12,
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
           so a figure of what it costs cannot say whether there is anything here.

           CALLED SERVICES SINCE portfolio 1.30.2 (31 October, AG22): "Keeping it alive" beside "Runs on" read as the same
           services under two names, and Services is what Estate and the list itself call them. */
        kind: 'cards',
        heading: 'Services',
        icon: 'server',
        span: 12,
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
        /* WHAT IT RUNS ON, UNDER ITS OWN HEADING ("Each project page has a Runs on section listing its
           keys, MCP servers and skills, with the global ones it inherits shown faintly beneath"). The three tiles sat
           among the money under "More about" the project, and what reaches a project from everywhere was said nowhere
           on its page. One boxed tile now: the project's own keys, tools and skills, six of each, and under them
           the five that apply everywhere.

           NO `when:` AND NO PANEL: a section whose every block went is not drawn (`emptyHidden` in the kernel's
           `drawn.ts`), so a project with nothing of its own on a record with nothing for everybody has no heading
           over nothing. The scheduled actions stay the panel of "More about", which the host counts for. */
        kind: 'section',
        heading: 'Runs on',
        icon: 'plug',
        span: 12,
        box: true,
      },
      {
        /* `{{spoken}}` IS THIS PROJECT'S OWN ROW, `things#1`, which `runs_on` takes as `about:` and reads every kind
           from, so the blocks below narrow one read to a kind apiece by `where:` rather than asking the kernel three
           times. `about:` is read by a `cards` block (`block-keys.ts` `KEY_KINDS`), as it is by `table`.

           NO BLOCK HERE NAMES `kind is action`: the scheduled actions are the panel "More about" draws, with Resume and
           Pause, so a card for each as well would say every action twice.

           EACH CARD SAYS WHERE IT APPLIES AND WHO USED IT LAST. `scope` is the chip, the project's mark, and it is
           the project's on every card here: the kernel answers the project's own first and the ones that apply
           everywhere after them, and all three blocks ask for `scope is project`. A key or a skill that
           applies everywhere is under them, in And from everywhere, faint and without the chip; mixed in under every
           project it was the same three of everybody's, read as the project's own.

           WHO USED IT IS SAID BY THE AGENT'S NAME, "Claude Code", and `used_at` says when anybody last did (AGT-D12
           job 2, batch 89: "Claude Code, 2 days ago"). It was `used_by`, the run's handle, `S731`, which said nothing
           to a person. `used_agents` is the agents whose runs used it in ninety days, newest first and three at most,
           "Claude Code, Codex" (`runs-on.ts`), so the label is "Used by" and not "Last used by". A
           skill has no use the record counts, so it names neither.

           SIX OF EACH SINCE portfolio 1.17.0 (batch 89), where it was three since work 1.15.0, and none that says it is
           empty: a project with no key, tool or skill of its own draws none of the three, where the rail said three
           sentences of nothing and then, until each was narrowed, three of everybody's. Past six, the host's line
           under the card says how many more, as under any block cut short.

           A THIRD OF THE TILE EACH, since they are three under a heading of their own: at a half each the third sat
           beside a hole, in any order the page's look put them. */
        kind: 'cards',
        heading: 'Keys',
        icon: 'key',
        span: 4,
        source: 'runs_on',
        about: '{{spoken}}',
        where: 'kind is key, scope is project',
        columns: [
          { field: 'name', as: 'title' },
          { field: 'scope', label: 'Applies to', as: 'scope' },
          { field: 'detail', label: 'Opens', as: 'fact' },
          { field: 'used_agents', label: 'Used by', as: 'who' },
          { field: 'used_at', label: 'Last used', as: 'when' },
        ],
        limit: 6,
      },
      {
        kind: 'cards',
        heading: 'Tools and servers',
        icon: 'plug',
        span: 4,
        source: 'runs_on',
        about: '{{spoken}}',
        /* THE PROJECT'S OWN ALONE: the kernel answers what applies everywhere after a project's
           own, so a project with no tool of its own listed three of everybody's under its name, and they were not
           its. A tool that applies everywhere is in And from everywhere, below. With none of its own the card is not
           drawn. */
        where: 'kind is tool, scope is project',
        columns: [
          { field: 'name', as: 'title' },
          { field: 'scope', label: 'Applies to', as: 'scope' },
          { field: 'detail', label: 'Reached by', as: 'fact' },
          { field: 'used_agents', label: 'Used by', as: 'who' },
          { field: 'used_at', label: 'Last used', as: 'when' },
        ],
        limit: 6,
      },
      {
        kind: 'cards',
        heading: 'Skills',
        icon: 'skill',
        span: 4,
        source: 'runs_on',
        about: '{{spoken}}',
        where: 'kind is skill, scope is project',
        columns: [
          { field: 'name', as: 'title' },
          { field: 'scope', label: 'Applies to', as: 'scope' },
          { field: 'detail', label: 'Version', as: 'fact' },
        ],
        limit: 6,
      },
      {
        /* AND WHAT REACHES IT FROM EVERYWHERE, SAID ONCE AND FAINT, under the project's own: the keys, tools and
           skills that name no project, which an agent working here is handed all the same. FIVE, by name and kind,
           with the agents that used each and when; the rest are in the lists Agents stands over.

           AND HOW MANY MORE, IN ONE LINE UNDER THEM: the block's count is every row that applies everywhere, read
           before the cut to five (`matched`, since `where:` keeps only those, and the kernel's `inherited` on the
           answer says the same number), so the host's line under a block cut short says "7 more", and says
           nothing while five or fewer apply. No sentence is declared here, since that line is every block's and a
           second one would say it twice.

           The kernel answers `quiet` on every one of them, which is what a host dims a card by (`runs-on.ts`), and
           none carries the project's chip, so nobody reads them as the project's.

           NOT THE SCHEDULED ACTIONS: one that runs for every project is already in the panel "More about" draws,
           with Resume and Pause, and a card here would say it twice. With nothing that applies everywhere the block
           is not drawn. */
        kind: 'cards',
        heading: 'And from everywhere',
        icon: 'globe',
        span: 12,
        source: 'runs_on',
        about: '{{spoken}}',
        where: 'kind is not action, scope is global',
        columns: [
          { field: 'name', as: 'title' },
          /* WHAT IT IS IN A WORD, the app's (`page-live.ts`): a key, a tool or server, a skill. "Kind key" read as a field's
             label and its stored word. */
          { field: 'kind', label: 'What it is', as: 'fact' },
          { field: 'used_agents', label: 'Used by', as: 'who' },
          { field: 'used_at', label: 'Last used', as: 'when' },
        ],
        limit: 5,
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
 *
 * AND ITS STAGES, SINCE portfolio 1.23.0: a record that still holds an older Projects is laid the page without its
 * road, and without the plan's kept shape on the roadmap's `when:`, until Projects updates (`planGone`).
 */
export const PROJECT_LINKS: readonly string[] = ['services', 'obligations', 'transactions', 'stages'];

/** The figures a project's kept plan shape is read by, declared with the stages since portfolio 1.23.0. */
const PLAN_FIGURES: readonly string[] = ['project-plan-path', 'project-plan-roadmap'];

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
  /* A RECORD WITHOUT THE STAGES HAS NONE OF THE PLAN'S SHAPE EITHER, so a `when:` leaf on it goes, and an `all:` left
     with one leaf is that leaf, as the page drew before 1.23.0. */
  const planGone = !held.has('stages');
  const unshaped = (when: unknown): unknown => {
    const all = (when as { all?: unknown[] } | null)?.all;
    if (!planGone || !Array.isArray(all)) return when;
    const kept = all.filter((leaf) => !PLAN_FIGURES.includes(String((leaf as { metric?: unknown } | null)?.metric ?? '').split(':')[0] ?? ''));
    return kept.length === 1 ? kept[0] : { all: kept };
  };
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
    if (block.when !== undefined) block = { ...block, when: unshaped(block.when) };
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

/**
 * THE WORDS A PERSON USES FOR WHAT THIS PACK KEEPS, which the first run listens for in the sentence it is told
 * (`apps/web/src/lib/shape.ts`), carried in its manifest as `signals` (`firstPartyManifest`). Kept with the pack's own
 * declarations, as an add-on's are in its file: they are its words, and a word one of them shares with an add-on's id
 * ("subscriptions") is the pack's to say and not the code's that reads it. Lower-case words and short phrases, each
 * inflection written out, because the reader matches whole words and never stems.
 */
export const PORTFOLIO_SIGNALS: readonly string[] = [
  'project', 'projects', 'side project', 'side projects', 'side-project', 'side-projects', 'product', 'products', 'app', 'apps',
  'studio', 'shop', 'store', 'brand', 'brands', 'game', 'games', 'agency', 'foundry', 'website', 'websites',
];

/**
 * THE WIDGETS PROJECTS BRINGS TO TODAY (SHL-A22, 30 October), in the shape an add-on's manifest `widgets` takes, joined
 * to the core's at read time. They were the core's own catalogue's until today, which named this module's lists by id.
 */
export const PORTFOLIO_WIDGETS = {
  pack: 'portfolio',
  title: 'Projects',
  widgets: [
    {
      id: 'projects',
      alike: ['projects'],
      title: 'Projects in play',
      says: 'Each project you are working on, with when it was last worked on.',
      group: 'projects',
      for: 'business',
      icon: 'grid',
      block: {
        kind: 'cards',
        heading: 'Projects',
        icon: 'grid',
        source: 'register.things',
        /* IN PLAY, AS THE SIDEBAR COUNTS THEM: a parked or retired project is not one (audit of 30 October, 12). */
        where: 'lane is not parked or retired',
        columns: [{ field: 'name', as: 'title' }, { metric: 'project-worked:{{name}}', as: 'when', label: 'Worked on' }],
        limit: 8,
      },
      sizes: ['wide', 'large', 'full'],
      size: 'full',
      needs: { lists: ['things'] },
      rows: { title: 'name', meta: 'next' },
      example: { rows: [{ title: 'Kiln', meta: 'Worked on today' }, { title: 'Marlow & Co', meta: 'Worked on 2 days ago' }, { title: 'Portage' }] },
      words: ['projects', 'portfolio', 'clients'],
      leads: ['portfolio'],
    },
    {
      id: 'numbers',
      alike: ['numbers'],
      title: 'Key numbers',
      says: 'The few numbers that lead, your pinned ones first, each with its line.',
      group: 'numbers',
      for: 'business',
      icon: 'gauge',
      block: { kind: 'kpis', heading: 'Key numbers', icon: 'gauge', source: 'kpis', for: 'today', empty: 'No key numbers yet.' },
      sizes: ['small', 'wide', 'tall', 'large', 'full'],
      size: 'wide',
      needs: { lists: ['kpis'] },
      example: { figures: [{ label: 'Subscribers', said: '486' }, { label: 'Hours billed', said: '32' }] },
      words: ['kpi', 'kpis', 'metrics', 'revenue'],
      asked: [{ match: '\\b(kpis?|key numbers|metrics)\\b', about: 'your key numbers' }],
      leads: ['all-numbers'],
    },
  ],
};
