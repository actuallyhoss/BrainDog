/**
 * Solo founder: one or several organisations, the money across them, and the numbers each project
 * reports or is polled for.
 *
 * IT BUILDS ON FIVE FIRST-PARTY MODULES. Projects, People, Money, Estate and Work are installed first, and
 * this pack adds what they do not hold: datapoints, one number from one project at one moment, written by the project
 * itself over the API or by a poll the record runs.
 *
 * THE ORGANISATIONS ARE PEOPLE'S SINCE 2.0.0 (People 3.0.0), under the same id, so a founder's rows stay where they are:
 * every record meets companies, and `meet` writes them there. This pack hands the list over (`hands`), and adds the
 * numbers an organisation reports to People's page for it (`adds`), where it drew a page of its own.
 *
 * ESTATE IS ONE OF THEM SINCE 1.4.0, AND IT WAS NOT BEFORE. A founder running several companies holds
 * domains, hosting and subscriptions, which is what Estate's services are. Without it an owner's
 * import (23 domains and the hosting behind them) had no list to land in, and the importer left all of
 * them out in one skip line, read once, with the fix a second install from Add-ons that nothing asked for.
 */

/*
 * MONEY'S OWN "DUE THIS WEEK", TAKEN AND NOT COPIED, the way the project page takes Portfolio's template. Money exports
 * it by name since money-core 3.0.0 retired its own `home`, where the block used to sit. One declaration means the
 * window, the columns and the order cannot drift; and because it is read from Money, an edit there moves this use
 * case's fingerprint, which `usecase-versions.test.ts` then asks a version for.
 */
import { DUE_THIS_WEEK } from '../modules/money.ts';
import { DUE_WINDOW, LATE_MONEY, LATE_WINDOW } from '../modules/money/pages/shared.ts';
import { projectTemplate } from '../modules/portfolio.ts';
import { counted } from './counted.ts';

/** The lists a founder's record holds once its five modules and this pack are in, services among them. */
const HOLDS = ['things', 'people', 'accounts', 'obligations', 'transactions', 'services', 'tasks', 'tracks', 'runs', 'updates', 'organisations', 'datapoints'];

/**
 * WHICH FIELD OF A NUMBER IS WHICH, BY PLACE: when, the value, the measure, its unit, and the project it is about. The
 * record reads the first four into one series a measure (`measures.ts` in the kernel).
 *
 * THE PROJECT IS THE FIFTH, SINCE 1.16.0, the field the lines are to be grouped by, so that a chart is labelled by the
 * measure and the project comes from its own row: a measure two projects both send is to be two lines and not one, and
 * an import that glued the project onto the measure's name ("Aov, Crumb.gg") is no longer the only place the project is
 * said. The record reads the first four and passes over a fifth (`readBlockAsWritten` in `packages/kernel/src/pages.ts`),
 * so until it groups by it the column changes nothing a record draws, and no version has to move when it does: today
 * two projects sending Sign-ups still draw one line between them.
 *
 * THE FIFTH IS THE READING AS MONEY, SINCE 2.5.0, and the project moved to the sixth. The record reads a block's fifth
 * column as `amount`, integer minor units with the reading's own currency, in place of `value` (`measures.ts`
 * `moneyOf`), and refuses a fifth that is not a money field, so the project there had the install refuse every block
 * over Numbers. A reading in another currency is a line of its own, never added to this one.
 */
const NUMBER_COLUMNS = [{ field: 'at' }, { field: 'value' }, { field: 'name' }, { field: 'unit' }, { field: 'amount' }, { field: 'thing' }];

/**
 * THE NUMBERS, ONCE, for the dashboard, an organisation and a project: the example left out, and thirty days against
 * the thirty before. The record works the series out, so a year of hourly polls draws as fast as a week of them.
 *
 * A LINE A MEASURE AND NO TILE BESIDE IT, SINCE 1.16.0. A `stat` over the same readings drew a tile a measure above the
 * line a measure, so every number was said twice on one page: twelve tiles over twelve charts on a Dashboard. The
 * record draws a line for a measure read twice or more in the window and hands back each measure read only once as
 * its latest reading, for a small table under the lines (`measureLines` in `packages/kernel/src/measures.ts`). No
 * empty line: a page with no number has nothing here, and where a project sends them is the section under it.
 */
const numbers = (where: string | null, when?: Record<string, unknown>): Record<string, unknown> => ({
  kind: 'lines',
  heading: 'Numbers, 30 days',
  icon: 'chart-line',
  span: 12,
  source: 'register.datapoints',
  columns: NUMBER_COLUMNS,
  where: ['source is not example', ...(where ? [where] : [])].join(', '),
  back: 30,
  ...(when ? { when } : {}),
});

/**
 * THE TEMPLATE'S WHERE IT STANDS FIGURES WITH THE NUMBERS THIS WEEK AFTER THEM, SINCE 2.5.0 (REC-C16 part b): a founder's
 * project says "2 changed this week, last worked 2 days ago, 6 numbers this week" while nobody has said where it stands.
 * The template keeps no Numbers, so the cell is this use case's, laid on the block by its key.
 */
const withNumbersThisWeek = (blocks: readonly Record<string, unknown>[]): Record<string, unknown>[] =>
  blocks.map((b) =>
    b.key === 'stands-figures' && Array.isArray(b.cells)
      ? { ...b, cells: [...(b.cells as Record<string, unknown>[]), { metric: 'project-numbers-7d:{{name}}', label: 'Numbers this week' }] }
      : b,
  );

/**
 * AN EARNING PROJECT THAT WENT SILENT, SINCE 2.5.0 (REC-C08 step 9): marked Earning, with no cleared money in on the
 * Ledger and no number sent in 90 days. The after-an-import skill reads it to propose a lane (`agents-skills.ts`), and
 * Projects names them. A count of projects and never a sum, so no two currencies meet in it.
 *
 * TWO HOPS BACKWARDS ALONG `thing` (`pointed` in `packages/where`), from the project to the Ledger entries and the numbers
 * that name it. HERE AND NOT IN PORTFOLIO, because Portfolio needs no other list (`first-party.test.ts`, `portfolio: []`),
 * and a hop into a list the record does not keep is refused; a founder keeps all three (`HOLDS`).
 *
 * ONE `none` AT THE TOP, AND THE LANE INSIDE IT AS ITS OPPOSITE: not (another lane, or money in, or a number) is Earning
 * with neither. A predicate nests three groups deep and a hop counts as one, so an `all` round a `none` would leave the
 * hops' own `all` a fourth and be refused.
 *
 * NOT A TRANSFER, as Received, 7 days is not (`modules/money/figures/spending.ts`): money moved between his own
 * accounts and filed to the project is not money the project made.
 */
const SILENT = {
  metric: 'projects-earning-silent',
  name: 'Earning, silent 90 days',
  source: 'register.things',
  where: {
    none: [
      { field: 'lane', not: 'earning' },
      {
        pointed: {
          register: 'transactions',
          by: 'thing',
          where: { all: [{ field: 'state', is: 'cleared' }, { field: 'direction', is: 'in' }, { field: 'transfer', is: false }, { field: 'on', after: '-90d' }] },
        },
      },
      { pointed: { register: 'datapoints', by: 'thing', where: { all: [{ field: 'at', after: '-90d' }, { field: 'source', not: 'example' }] } } },
    ],
  },
  value: { count: 'id' },
  format: 'int',
  target: { lte: 0 },
  window: '90d',
  compare: 'none',
};

/**
 * A project template's blocks with `added` put in before its boxed section, More about it (work 1.15.0), so what a use
 * case adds to the page stands on the board and is not taken into that tile, which holds every block after it up to
 * the next section. At the end where the template has no box.
 */
const beforeMore = (blocks: readonly Record<string, unknown>[], ...added: Record<string, unknown>[]): Record<string, unknown>[] => {
  const at = blocks.findIndex((b) => b.kind === 'section' && b.box === true);
  return at < 0 ? [...blocks, ...added] : [...blocks.slice(0, at), ...added, ...blocks.slice(at)];
};

/**
 * WHERE A BUTTON ON A DECLARED PAGE OPENS THE NEW-ACTION SHEET. A path of this
 * BrainDog, which the app puts under the record's own address (`at` in `apps/web/src/lib/at.ts`), and the preset ids
 * are `PRESETS` in `apps/web/src/lib/record/action-draft.ts`: `numbers` is a door writing to this list, `watch` a
 * scheduled read of one number.
 */
const SEND_NUMBERS = '/automations?new=door&preset=numbers';
const WATCH_NUMBER = '/automations?new=action&preset=watch';

/**
 * BROWSE, SEARCHED FOR THE PACKS A BUTTON NAMES. Browse reads `q` off the address and keeps a listing only when every
 * word is in it, so one word each: every pack that brings money in says "Money" in its summary, and every pack that
 * reads a live number says "Polls".
 */
const BROWSE_MONEY = '/packs/browse?q=money';
const BROWSE_LIVE = '/packs/browse?q=polls';

/**
 * WHAT YOU HAVE, AS MONEY'S OWN PAGE SAYS IT (`MONEY_PAGES.money` in `../modules/money.ts`): one line of the cash there
 * is and how long it lasts while the record keeps one set of money, and Cash now a book once it keeps two, because one
 * figure over two books adds a company's money to a person's own. A LINE AND NOT A TILE SINCE 1.11.0, as Money's is
 * since money-core 3.4.0: the tile beside it said the same figures again.
 */
const WHAT_YOU_HAVE: Record<string, unknown>[] = [
  {
    kind: 'note',
    lead: true,
    span: 12,
    body: 'Cash is {{cash-now}} across {{cash-accounts}} account(s), and on what is due it runs out in {{runway-days}} day(s).',
    when: { metric: 'books-held', lt: 2 },
  },
  {
    kind: 'bar',
    heading: 'What you have, by book',
    icon: 'book',
    span: 12,
    source: 'metric.cash-by-book',
    unset: 'In no book',
    when: { metric: 'books-held', gte: 2 },
    empty: 'No account counts as cash yet.',
  },
];

/**
 * THE NUMBERS OF THE WEEK, one line a measure over this week against the week before, once a project has sent one
 * this week.
 *
 * A WEEK, SINCE 1.16.0, AND IT SAID A WEEK OVER THIRTY DAYS. At most six lines, the ones that moved most, each
 * declared with the project it is about (`NUMBER_COLUMNS`, which no record reads yet), and a measure read only once in
 * the week is not a line: the record hands it back as its latest reading, for the small table under the lines. An
 * import that wrote two hundred measures once each, on one morning, drew twelve one-dot charts here in the alphabet's
 * order; the Dashboard keeps every number for thirty days.
 *
 * UNTIL A PROJECT HAS EVER SENT ONE, THE WAYS TO START, in place of an empty chart: a door a project posts its numbers
 * to, a number the record asks for on a schedule, and the packs that already read one. Gated on every number ever
 * reported (`datapoints-reported`), so a record whose projects went quiet this week reads nothing here rather than an
 * offer to start what it already does. Both figures leave the example out.
 */
const NUMBERS_THIS_WEEK: Record<string, unknown>[] = [
  {
    kind: 'lines',
    heading: 'Numbers this week',
    icon: 'chart-line',
    span: 12,
    source: 'register.datapoints',
    columns: NUMBER_COLUMNS,
    where: 'source is not example',
    back: 7,
    limit: 6,
    when: { metric: 'datapoints-7d', gte: 1 },
  },
  {
    kind: 'link',
    heading: 'Bring your numbers in',
    icon: 'send',
    span: 12,
    when: { metric: 'datapoints-reported', lt: 1 },
    authored: [
      { cells: ['Send numbers from a project', SEND_NUMBERS, 'A project posts each number to its own address here'] },
      { cells: ['Watch a number', WATCH_NUMBER, 'BrainDog asks an address for one number on a schedule'] },
      { cells: ['Watch a live number', BROWSE_LIVE, 'Add-ons that read a live number for you'] },
    ],
  },
];

/**
 * A SERVICE LAPSING WITHIN THIRTY DAYS, EITHER SIDE OF TODAY, SINCE 1.16.0: one whose renewal passed in the last month
 * and can still be saved, or that lapses in the next. `state is lapsing` alone listed every domain somebody chose to
 * let go, renewing in a year's time, on the page read every morning. The Services page still counts them all.
 */
const LAPSING_SOON = 'state is lapsing, renews after -31d, renews before +31d';

export const FOUNDER = {
  usecase: 'founder',
  /* 1.3.2 BECAUSE THE TWO THIRTY-DAY TILES ON BOTH DASHBOARDS ARE RENAMED, and a record is offered a
     use case's change only when its version goes up: 1.3.1 was itself the wording of these same tiles
     (`fbf260e6`), so leaving the number alone would mean every record that took that one keeps the
     words it corrected. Nothing here declares a field or a register, so there is nothing to refuse.

     1.4.0 BECAUSE ESTATE IS ONE OF THE MODULES, which is more than a reworded tile: the project page draws
     each project's services and what they cost a year, so it requires a list 1.3.2 never asked for. A
     minor step and not a patch, because a record taking it gains a module and a list.

     1.5.0 BECAUSE HOME GAINS TWO TABLES AND A LIST IT REQUIRES: "Due this week", which Money's own Home drew
     and a founder's Home replaced, and "Lapsing", over Estate's services. Nothing is declared or taken away,
     but `page.home-founder` now requires `register.services`, which is the same kind of step 1.4.0 was.

     1.5.1 BECAUSE HOME'S EMPTY TITLE LOSES ITS FULL STOP. A title ends without one everywhere else, and a record
     is offered the words only when the version goes up.

     1.6.0 BECAUSE THE PROJECT PAGE TAKES PORTFOLIO 1.5.0'S TEMPLATE: the questions waiting on a project, what
     changed on it, its plan on a time axis and its money by month, over the same registers this use case already
     lists (`transactions` joins `HOLDS` so the money series draws).

     1.7.0 BECAUSE HOME LEADS WITH THE MONEY THERE IS AND NOT WITH WHO OWES WHOM: What you have, by book
     once there are two, Lasts until, the numbers of the week as lines, then what is due, lapsing and working now.
     `page.home-founder` now requires `register.books`, which money-core 3.1.0 holds, so it is a minor step as
     1.5.0 was. Datapoints are called Numbers, the lists are Lists, and an organisation's page lists its projects.

     1.8.0 BECAUSE THE PAGES ARE LAID OUT AND NAME THEIR PANELS: the Dashboard and a project's page open with
     one sentence said from their figures and keep a rail beside the main column, and "Send numbers here" on an
     organisation and on a project says `panel: reporting`, so the key a project sends its numbers with is drawn by
     that name and not by the heading's English. A page somebody arranged in their own record keeps its arrangement:
     the update is offered, never forced. In the same unreleased version, the voice says more of the record its own
     way, Home's empty lines and Decide's among them, each a new setting a person can change at /packs.

     1.9.0 BECAUSE THE PROJECT PAGE TAKES PORTFOLIO 1.6.0'S TEMPLATE, built to the new look:
     its open work tallied by priority, what came in, went out and was kept this month beside the money
     by month, its dated work as weeks above the plan, its questions as tiles and what it runs on as cards in the rail.
     1.8.0 is on `origin/master`, so a record on it is offered this only through a new version. Blocks added and nothing
     taken away, so a minor step; the template is twenty-one blocks, so the three this page adds under it land exactly
     on the ceiling of twenty-four.

     1.10.0 BECAUSE THE PROJECT PAGE TAKES WORK 1.10.0'S TEMPLATE: what was finished on the project each week, as a
     chart, in place of the tally of its open work by priority, which said again what the list under it says. Still
     twenty-one blocks under this page's three. 1.9.0 is on `origin/master`, so the change is a version and not a reset.

     1.11.0 BECAUSE THE PAGES ARE CALMER (DIRECTION §35): Home opens on one line of the cash there is where a tile of
     four figures stood, every heading wears a glyph, each list is drawn only while it holds something, the Dashboard
     folds every number and organisation under the numbers it charts, and a project's page takes portfolio 1.8.0's
     template, six tiles and then its history, money and what it runs on folded shut. 1.10.0 is on `origin/master`.

     1.12.0 BECAUSE THE PROJECT PAGE TAKES PORTFOLIO 1.9.0'S TEMPLATE: it always opens on a line, the work handed back
     when there is any and otherwise the project's next step, and Where it stands no longer says that step again. No
     block added or taken away. 1.11.0 is live, so the change is a version and not a reset.

     1.13.0 BECAUSE THE PROJECT PAGE TAKES PORTFOLIO 1.10.0'S TEMPLATE: where it stands and what is handed back sit in
     the rail beside the chart, which takes the main column, What is open goes since the plan draws the same tasks, and
     what is handed back is drawn only while it lists a task. A block taken away and none added; no list, field or
     figure of this use case moves, so a minor step. 1.12.0 is live.

     1.14.0 BECAUSE THE PROJECT PAGE TAKES PORTFOLIO 1.12.0'S TEMPLATE: its line is the next step alone, Where it stands is
     headed by how it is going with the agent last, and what is handed back is a to-do with no Changed by. No block added
     or taken away, so a minor step. 1.13.0 is live.

     1.16.0 BECAUSE EVERY PAGE SAYS ONLY WHAT IS TRUE OF THIS RECORD (DIRECTION §37, "Stop the harm"). Home draws What you
     have, by organisation only while an organisation lists an account, Bring your money in only while no account counts
     as cash, Lapsing only within thirty days of today, and Numbers this week over a week, six lines at most, each
     declared with the project it is about; Working now reads the runs heard from today. The Dashboard stops saying Home's cash and its
     organisations' balances again, and every numbers block is a line a measure with no tile beside it. Four counts are
     added to draw on, so a minor step. 1.15.0 is live.
     1.16.1: the settings that hold each list's name and one of it are titled by what the list is called ("Name
     of the Ledger list"), not by its id ("Label: transactions"), and every list's name is declared before any
     singular, so the 64-setting ceiling costs a singular first. Titles and order only, so a patch step.

     2.0.0 BECAUSE THE ORGANISATIONS ARE PEOPLE'S (People 3.0.0, `loop/contract-17.md`). The list keeps its id and its
     rows and is handed to People, which declares it as the list `meet` writes a company into. People's list has no
     `country`, `currency` or `accounts`, so What you have, by organisation and the organisation's Balance go (books keep
     a company's money apart, and What you have, by book stays), the Dashboard lists each organisation by kind and
     website, and the numbers an organisation reports are added to People's page for it rather than drawn on a page of
     this pack's own. A list and a page taken away, so a major step.

     2.1.0: `page.project` takes the project template of work 1.15.0, its history, notes, money and what it runs on as one More
     about tile where they were three folded sections, with the project's numbers before that tile. Blocks moved on a
     page that is already there, so a minor step.

     2.2.0: Where it stands on `page.project` draws At risk in the warning colour and Off track in the danger colour, by
     the template's `tones:`. On track wears no mark. A key added to a block that is already there, so a minor step.
     2.1.0 is live, so the change is a version and not a reset.

     2.3.0: `page.project` takes the template without Done, by week, a chart the whole of the main column for bars of 1
     and 2 (the second design review's fix 5): what was finished this week is the last figure of At a glance, asking
     for its four weeks as a line. A block gone from a page that is already there and a cell added to another, so a
     minor step. 2.2.0 is live.

     2.4.0: `page.home-founder` says how many agents work now in a line, from the record's `runs-working`, and its
     Working now table reads the record's working runs (`sessions.working`, agents 1.9.0), heard from in the last
     fifteen minutes, where its own clause said today and a run quiet for hours was listed as at work. A block added
     and a source changed, so a minor step. 2.3.0 is live.

     2.5.0: Numbers takes money. A reading may hold `amount`, integer minor units and its currency, in place of its
     decimal `value`, which stops being required; the blocks over Numbers read it as their fifth column and the project
     moves to the sixth; Latest numbers shows it beside Value; and `poll-setup` says to fill the live feed add-on. A
     field added, one made optional and columns added, so a minor step. 2.4.0 is live. Folded into the same unreleased
     2.5.0 (REC-C16 part b, REC-C08 step 9): `project-numbers-7d`, the numbers a project sent this week, as the last
     figure of Where it stands on `page.project`; and `projects-earning-silent`, a project marked Earning with no cleared
     money in and no number in 90 days, named on Projects in a line under In play. Two figures, a cell and a block laid
     on another pack's page added, nothing taken away.

     2.6.0, FROM THE LOOK AT A REAL RECORD ON 13 OCTOBER. Home is called Today, in the voice and as the page's title,
     where both said Overview under a rail item that said Today. Due this week starts today (`DUE_WINDOW`), and what is
     already late has its own table ahead of it, Late, oldest first, with its own count (`late-money`): a bill four days
     late was listed as due this week. Lapsing loses its Cost column, which was a dash on every line. A figure and a
     block added, a window narrowed, a column and two words changed, so a minor step. 2.5.0 is live. */
  version: '2.6.0',
  title: 'Solo founder',
  summary: 'The organisations you run, the money across them, and the numbers your projects report.',
  author: 'BrainDog',
  license: 'MIT',
  audience: 'founder',
  tone: 'direct, and about the numbers',
  signals: [
    'founder', 'founders', 'co-founder', 'cofounder', 'startup', 'startups', 'saas', 'indie hacker', 'bootstrapped',
    'my companies', 'companies', 'organisations', 'organizations', 'several businesses', 'side projects',
    'dashboard', 'dashboards', 'analytics', 'metrics', 'kpis', 'datapoints', 'mrr', 'arr', 'revenue', 'users',
    'signups', 'churn', 'runway', 'balances', 'my apps', 'my products', 'launch', 'launched', 'shipping',
  ],
  modules: ['portfolio', 'people', 'money-core', 'estate', 'work'],
  voice: {
    home: 'Today',
    right_now: 'The numbers',
    needs_you: 'Needs your call',
    nothing_needs_you: 'Nothing needs your call',
    since_away: 'While you were building',
    /* "Your things", AND IT WAS "Lists": the system's word for how the record stores them, said back over the house heading. */
    lists: 'Your things',
    /* THE REST OF THE LINES, direct and about the work: a call to make, what shipped, what reports a number. */
    working_now: 'Agents at work',
    coming_up: 'Due soon',
    overdue: 'Late',
    nothing_now: 'Nothing needs your call. Back to building.',
    nothing_waiting: 'No call is waiting on you.',
    fills_with: 'Your numbers, the calls waiting on you and what shipped while you were building show up here as your projects report.',
    no_questions: 'No call waiting',
    inbox_clear: 'Nothing new has come in',
    pen_waits: 'When there is a way to fit this to how you run your projects, it waits here until you keep it or say no.',
  },
  skills: [
    { name: 'datapoint-reporter', trigger: 'when a project ships a number worth watching, to post it as a datapoint' },
    { name: 'poll-setup', trigger: 'when a project has an API that answers a number, to fill the live feed add-on for it' },
  ],
  pack: {
    pack: 'usecase-founder',
    requires: { format: 1, primitives: 1, packs: {} },
    declarations: [
      {
        register: 'datapoints',
        /* "NUMBERS" AND NOT "DATAPOINTS", which is a word from a database and not from a founder. The list's id stays
           `datapoints`, because every door, poll and figure already writes to it by that id. */
        name: 'Numbers',
        one: 'number',
        icon: 'observe',
        holds: 'one number from one project at one moment, reported by the project or polled by the record',
        title: 'name',
        mobile: ['name', 'value', 'at'],
        fields: [
          { id: 'name', label: 'Measure', type: 'text', required: true, index: true, search: true },
          /* A NUMBER OR AN AMOUNT, SINCE 2.5.0: money is written as `amount`, integer minor units and its currency,
             and leaves `value` empty, so a feed of revenue never has the record guess a currency from a unit of text. */
          { id: 'value', label: 'Value', type: 'decimal' },
          { id: 'amount', label: 'Amount', type: 'money' },
          { id: 'unit', label: 'Unit', type: 'text' },
          { id: 'thing', label: 'Project', type: 'ref', to: 'things', index: true },
          { id: 'organisation', label: 'Organisation', type: 'ref', to: 'organisations', index: true },
          { id: 'at', label: 'When', type: 'instant', index: true },
          {
            id: 'source',
            label: 'Source',
            type: 'enum',
            /* `example` IS THE SEED'S, so the dashboards leave it out of every tile and chart while it still shows,
               marked, in the lists of latest numbers. */
            values: ['reported', 'polled', 'typed', 'example'],
            labels: { reported: 'Reported', polled: 'Polled', typed: 'Typed', example: 'Example' },
            index: true,
          },
          { id: 'tags', type: 'list', of: 'text' },
        ],
      },
      {
        metric: 'datapoints-30d',
        name: 'Numbers reported, 30 days',
        source: 'register.datapoints',
        where: 'at after -30d, source is not example',
        value: { count: 'id' },
        format: 'int',
        target: { gte: 1 },
        window: '30d',
        compare: 'none',
      },
      /* WHAT THE FOUNDER'S PAGES ARE DRAWN ON, SINCE 1.11.0, each over its list's own clauses. */
      counted('datapoints-held', 'Numbers', 'register.datapoints'),
      counted('organisations-held', 'Organisations', 'register.organisations'),
      counted('due-this-week', 'Due this week', 'register.obligations', DUE_WINDOW),
      /* WHAT IS ALREADY LATE, SINCE 2.6.0, over the Late table's own clauses (`LATE_MONEY`). */
      counted('late-money', 'Late', 'register.obligations', LATE_WINDOW),
      /* AND SINCE 1.16.0: the week Numbers this week draws, every number a project ever sent, and what Lapsing lists,
         each over its block's own clauses. */
      counted('datapoints-7d', 'Numbers reported, 7 days', 'register.datapoints', 'at after -7d, source is not example'),
      counted('datapoints-reported', 'Numbers reported', 'register.datapoints', 'source is not example'),
      counted('lapsing-30d', 'Lapsing within 30 days', 'register.services', LAPSING_SOON),
      /* THE NUMBERS ONE PROJECT SENT THIS WEEK, SINCE 2.5.0 (REC-C16 part b), the example left out: the third thing a
         project page's Where it stands says while nobody has said, beside what changed and when it was last worked. */
      counted('project-numbers-7d', 'Numbers this week', 'register.datapoints', 'thing is {{it}}, at after -7d, source is not example'),
      SILENT,
      {
        /* HOME, AS THIS USE CASE ANSWERS IT: the money across every organisation and
           the numbers the projects sent, in place of the house figures. No `nav`, because Home is on the rail
           already.

           WHAT YOU HAVE LEADS SINCE 1.7.0, THEN THE NUMBERS, THEN WHAT TO ACT ON. The figures were Cash now beside
           "Owed to you" and "Owed by you", which framed a founder's money as who owes whom; now it is the money there
           is, by book, and how long it lasts. Due this week and Lapsing stay, the two lists
           somebody has to act on this week, and the latest-numbers and organisations tables went to the Dashboard,
           which already drew both. */
        page: 'home-founder',
        title: 'Today',
        icon: 'home',
        requires: ['register.datapoints', 'register.accounts', 'register.obligations', 'register.services', 'register.books'],
        blocks: [
          ...WHAT_YOU_HAVE,
          {
            /* THE ONE WAY IN FOR A BANK OR A PAYMENTS FEED, ONLY WHILE NO ACCOUNT COUNTS AS CASH, SINCE 1.16.0: it was
               drawn on a record holding thirteen accounts and its bank's own add-on. Browse is searched for "money"
               because every pack that brings money in says so in its summary, and this file names no provider
               (`tools/gates/shell-words.mjs`). */
            kind: 'link',
            heading: 'Bring your money in',
            icon: 'plug',
            span: 12,
            when: { metric: 'cash-accounts', lt: 1 },
            authored: [{ cells: ['Connect a bank or a payments feed', BROWSE_MONEY, 'Balances and payments arrive on their own'] }],
          },
          ...NUMBERS_THIS_WEEK,
          /* WHAT IS LATE HAS ITS OWN TABLE, AHEAD OF THE WEEK, SINCE 2.6.0 (`LATE_MONEY`, Money's own block by name): a
             salary due four days ago was listed under Due this week, which from 2.6.0 starts today. The oldest first.
             Drawn only while something is late. */
          { ...LATE_MONEY, when: { metric: 'late-money', gt: 0 } },
          /* ONLY WHILE SOMETHING IS DUE, SINCE 1.11.0, over the table's own clauses. */
          { ...DUE_THIS_WEEK, when: { metric: 'due-this-week', gt: 0 } },
          {
            /* WHAT IS LAPSING NOW (`LAPSING_SOON`), SINCE 1.16.0, and it was every service Estate's own `lapsing` tile
               counts. Soonest renewal first, since that is the one that goes first. Drawn only while it lists one, so it
               says nothing of its own when nothing is.

               NO COST COLUMN, SINCE 2.6.0. A domain let go mostly holds no cost, and the column was a dash on every
               line. What a service costs is on Services and on its own page. */
            kind: 'table',
            heading: 'Lapsing',
            icon: 'clock-alert',
            span: 12,
            source: 'register.services',
            where: LAPSING_SOON,
            when: { metric: 'lapsing-30d', gt: 0 },
            columns: [
              { field: 'name', label: 'Name', width: 'minmax(16ch,1fr)' },
              { field: 'renews', label: 'Renews', width: '15ch', align: 'end' },
            ],
            order: [{ field: 'renews', dir: 'asc' }],
            limit: 6,
          },
          {
            /* HOW MANY AGENTS WORK NOW, SAID IN WORDS, SINCE 2.4.0, from the record's own count (`runs-working`): the runs
               heard from in the last fifteen minutes, the number the rail and the Agents page say. The plural and the
               verb agree with it ("1 agent is working now"). Drawn only while one is, so a quiet record says nothing. */
            kind: 'note',
            lead: true,
            span: 12,
            when: { metric: 'runs-working', gt: 0 },
            body: '{{runs-working}} agent(s) are working now.',
          },
          {
            /* AND WHICH, the record's working runs since 2.4.0 (`sessions.working`), a helper folded under its run. It
               read its own clause of active and heard from today, and a run quiet for four hours was listed as at work. */
            kind: 'table',
            heading: 'Working now',
            icon: 'session',
            span: 12,
            source: 'sessions.working',
            when: { metric: 'runs-working', gt: 0 },
            columns: [
              { field: 'agent', label: 'Agent' },
              { field: 'doing', label: 'Doing' },
              { field: 'last_seen', label: 'Last seen' },
            ],
            limit: 6,
          },
        ],
      },
      {
        /* `Dashboard` AND NOT `Overview`, which this use case's voice called Home until 2.6.0: two rail items with one
           name.

           THE WHOLE PORTFOLIO ON ONE PAGE: every number a project reported, as a line over thirty days against the thirty
           before, with every number and organisation folded under them. A `lines` block over Datapoints names which field
           is which and draws one chart a measure, so a measure a project starts sending tomorrow is on this page
           tomorrow without an edit.

           NOT HOME AGAIN, SINCE 1.16.0. It opened on Cash now, how long it lasts and the month's money in and out, which
           are Home's line and Money's, kept each organisation's balance in a rail beside what Home draws as What you
           have, by organisation, and drew a tile a measure over the chart of the same measure. What is left is what only
           this page says: thirty days of every number, and where each came from. */
        page: 'dashboard',
        title: 'Dashboard',
        nav: { section: 'Dashboard', order: 10 },
        icon: 'observe',
        requires: ['register.datapoints', 'register.organisations'],
        blocks: [
          /* THE OPENING SENTENCE, SAID FROM THE NUMBERS OF THE LAST THIRTY DAYS (`datapoints-30d`, which leaves the
             example out). Both are held to the one figure, so exactly one of them draws. */
          {
            kind: 'note',
            lead: true,
            span: 12,
            when: { metric: 'datapoints-30d', gte: 1 },
            body: 'Your projects reported {{datapoints-30d}} number(s) in the last thirty days.',
          },
          {
            kind: 'note',
            lead: true,
            span: 12,
            when: { metric: 'datapoints-30d', lt: 1 },
            body: "No project has reported a number in the last thirty days. A project's page has the key it sends them with.",
          },
          /* ON THE FIGURE THE LINE SAYS, so the chart is drawn exactly while the sentence over it counts something. The
             example number shows under Latest numbers and is left out here. */
          numbers(null, { metric: 'datapoints-30d', gte: 1 }),
          {
            /* EVERY NUMBER AND EVERY ORGANISATION, FOLDED SHUT, SINCE 1.11.0: the lines above draw the same numbers, and
               these are looked up. */
            kind: 'section',
            heading: 'Every number and organisation',
            icon: 'layout-list',
            span: 12,
            fold: true,
          },
          {
            kind: 'table',
            heading: 'Latest numbers',
            icon: 'list',
            span: 12,
            source: 'register.datapoints',
            when: { metric: 'datapoints-held', gt: 0 },
            columns: [
              { field: 'name', label: 'Measure', width: 'minmax(16ch,1fr)' },
              { field: 'value', label: 'Value', width: '14ch', align: 'end' },
              { field: 'amount', label: 'Amount', width: '14ch', align: 'end' },
              { field: 'unit', label: 'Unit', width: '8ch' },
              { field: 'organisation', label: 'Organisation', width: 'minmax(10ch,18ch)' },
              { field: 'source', label: 'Source', width: '11ch' },
              { field: 'at', label: 'When', width: '12ch', align: 'end' },
            ],
            order: [{ field: 'at', dir: 'desc' }],
            limit: 10,
            empty: 'No project has reported a number yet.',
          },
          {
            kind: 'table',
            heading: 'Organisations',
            icon: 'building',
            span: 12,
            source: 'register.organisations',
            when: { metric: 'organisations-held', gt: 0 },
            /* BY KIND AND WEBSITE SINCE 2.0.0, where it said where each was registered and its currency, which People's
               list does not keep. Each opens People's page for it. */
            where: 'merged_into is empty',
            columns: [
              { field: 'name', label: 'Organisation', width: 'minmax(20ch,1fr)' },
              { field: 'kind', label: 'Kind', width: '14ch' },
              { field: 'domain', label: 'Website', width: 'minmax(14ch,22ch)' },
            ],
            empty: 'No organisations yet.',
          },
        ],
      },
      {
        /* A PROJECT'S PAGE, WITH ITS SERVICES SINCE 1.4.0. Portfolio's template reads what a project runs on and what
           that costs a year from Estate's services, and a founder installs Estate now, so the template is taken with
           them (`projectTemplate`) and the numbers the project reports and where it sends them are added under it.
           Same id as the template, so a record never has two pages at one project's address.

           THIS PAGE NOW REQUIRES `register.services`, so the pack alone does not plan on a record made on 1.3.2, which
           holds no services: its plan there comes back with `services` unresolved. The update is not the pack alone. The plan for a use
           case installs each module it names that the record lacks before the use case's own pack (`planFile` in
           `record/src/usecase.ts`), so a 1.3.2 record is offered Estate and then this, and `founder-estate.test.ts`
           drives that order over a record rebuilt as 1.3.2 made it. */
        ...projectTemplate(HOLDS),
        requires: [...(projectTemplate(HOLDS).requires as string[]), 'register.datapoints'],
        /* THE NUMBERS AND WHERE THEY ARE SENT BEFORE THE TEMPLATE'S MORE ABOUT TILE, SINCE founder 2.1.0: a box holds
           every block after it up to the next section, so under it the numbers would be a part of that tile and not the
           project's own figures, and the key would sit under the tile, a screen away from the numbers it sends. */
        blocks: beforeMore(
          withNumbersThisWeek(projectTemplate(HOLDS).blocks as Record<string, unknown>[]),
          numbers('thing is {{name}}'),
          /* IN THE MAIN COLUMN UNDER THE PROJECT'S NUMBERS, and the one place on the page the key is drawn: More about
             the project draws the scheduled actions alone (`BlockSlot.svelte`). */
          { kind: 'section', heading: 'Send numbers here', icon: 'observe', span: 12, panel: 'reporting' },
        ),
      },
    ],
    seeds: [{ register: 'datapoints', fields: { name: 'Monthly recurring revenue', value: 4200, unit: 'GBP', source: 'example', at: '-1d' } }],
    /* THE ORGANISATIONS GO TO PEOPLE WITH THEIR ROWS, SINCE 2.0.0: People 3.0.0 declares the list under the same id. */
    hands: { 'register.organisations': 'people' },
    /* WHAT AN ORGANISATION REPORTS, ON PEOPLE'S PAGE FOR IT, SINCE 2.0.0, where it was a page of this pack's own (the
       numbers, the latest of them, and where a project sends them), after its people: two pages for one organisation
       would have been two addresses for one name. */
    adds: [
      { page: 'page.relation', after: 'People', block: numbers('organisation is {{name}}') },
      {
        page: 'page.relation',
        after: 'People',
        block: {
          kind: 'table',
          heading: 'Latest numbers',
          icon: 'list',
          span: 12,
          source: 'register.datapoints',
          where: 'organisation is {{name}}',
          columns: [
            { field: 'name', label: 'Measure', width: 'minmax(16ch,1fr)' },
            { field: 'value', label: 'Value', width: '14ch', align: 'end' },
            { field: 'amount', label: 'Amount', width: '14ch', align: 'end' },
            { field: 'unit', label: 'Unit', width: '8ch' },
            { field: 'at', label: 'When', width: '12ch', align: 'end' },
          ],
          order: [{ field: 'at', dir: 'desc' }],
          limit: 10,
        },
      },
      /* `panel: reporting` NAMES THE KEY AND THE POLL FORM the app draws under this section (`panel-of.ts`), so a person
         or Slash renaming the heading keeps them. */
      { page: 'page.relation', after: 'People', block: { kind: 'section', heading: 'Send numbers here', icon: 'observe', span: 12, panel: 'reporting' } },
      /* WHICH EARNING PROJECTS WENT SILENT, ON PROJECTS, SINCE 2.5.0 (REC-C08 step 9), by name and under the cards in play:
         drawn only while one has, so a record whose earning projects all took money or sent a number says nothing. LAST, so
         the blocks laid before it keep their places. */
      {
        page: 'page.portfolio',
        after: 'In play',
        block: {
          kind: 'note',
          span: 12,
          key: 'earning-silent',
          when: { metric: 'projects-earning-silent', gt: 0 },
          body: '{{projects-earning-silent.names}}: marked Earning, but no money in and no number sent in 90 days',
        },
      },
    ],
  },
};

/**
 * THE EXAMPLE ROWS THE FOUR MODULES GET IN A FOUNDER'S RECORD, in place of the sample studio's Kiln, Halden Type Co
 * and brand-system invoice. One per list at most, no refs, and a day written `+5d` is counted from the day the
 * record is made (`install.ts`). People's own list gets none: onboarding writes the founder's own row there.
 */
export const FOUNDER_EXAMPLES = [
  { register: 'things', fields: { name: 'Northwind app', lane: 'earning', since: '-400d' } },
  /* PEOPLE'S EXAMPLE SINCE 2.0.0, where it was this pack's own seed: the company the founder runs. */
  { register: 'organisations', fields: { name: 'Northwind Labs Ltd', kind: 'company', domain: 'northwind.example' } },
  { register: 'accounts', fields: { name: 'Northwind current account', kind: 'bank', balance: { amount: 2_480_000, currency: 'GBP' }, as_of: '0d', liquid: true } },
  {
    register: 'obligations',
    fields: { what: 'Cloud hosting, Northwind app', direction: 'owed_by_me', amount: { amount: 32_000, currency: 'GBP' }, due: '+9d', state: 'open', category: 'software', repeats: 'monthly' },
  },
  { register: 'tracks', fields: { name: 'Launch the annual plan', state: 'open', opened: '-12d' } },
  { register: 'tasks', fields: { what: 'Write the pricing page copy', state: 'open', by: '+4d' } },
];

/**
 * WHAT THE MODULES SAY TO A FOUNDER, by module and then by the module's own words (`MODULE_NAMES` in `install.ts`). A
 * founder is not given the plain words the other use cases get: money owed to one of their organisations is an invoice,
 * and saying so is the business's voice and not somebody else's. Money's late line already names the invoices it
 * counts, and since money-core 3.5.0 it carries no heading for this to call Late invoices, so there is nothing to rename.
 */
export const FOUNDER_NAMES: Readonly<Record<string, Readonly<Record<string, string>>>> = {};
