/**
 * What every module of the sample record shares: the row and declaration shapes, the clock the record
 * is read at, the money and duration helpers, and the named factor tables.
 */

import type { FieldDecl, Json, Leg } from '@braindog/kernel';
import type { Predicate } from '@braindog/where';

/** What a row holds, before the record has given it a number. */
export type Fields = Record<string, Json | number | null | undefined>;

/**
 * A register, as this record declares one.
 *
 * IT IS A SUPERSET OF WHAT THE KERNEL READS, and deliberately: `icon`, `one`, `holds` and `mobile`
 * are declaration fields in the specification, and the kernel ignores what it does not need. The
 * alternative — a presentation copy beside a storage copy — is two descriptions of one register,
 * and the one that drifts is whichever nobody is testing.
 */
export type SeedRegister = {
  id: string;
  name: string;
  one: string;
  holds: string;
  title: string;
  mobile: readonly [string, string, string, string?];
  state?: string;
  done?: readonly string[];
  /** A day field the record fills when a row enters a `done` state and empties when it leaves one. */
  finished?: string;
  fields: readonly SeedField[];
  identity?: { mark: string; accent: string };
  icon?: string;
  pack?: string;
  seq_prefix?: string;
  /** On the one register whose rows are projects: its fields listing repositories and folders. */
  scopes?: { repos?: string; folders?: string };
  /**
   * `refuse_while_referenced`, the one value the kernel keeps (`packages/kernel/src/referenced.ts`, `DELETE_RULES`): a
   * row other live rows point at is not deleted, and the refusal names the lists and how many. Written as its one word,
   * as Money's accounts declare it (`modules/money/lists/accounts.ts`), and held to that list at install (`declare.ts`).
   */
  delete?: 'refuse_while_referenced';
  /** `automations`: the record's own automations write its rows, never a person one by one, so no page is offered for it. */
  kept_by?: 'automations';
  /** The order a read that names none comes back in: one field that sorts, `desc` highest first (`declare.ts`). */
  order?: { field: string; dir: 'asc' | 'desc' };
  /** The columns its table opens on, in order: a field, or one read from a second where it holds nothing, with its own heading. */
  table?: readonly (string | { field: string; or?: string; label?: string })[];
  /** A list whose rows are steps of another's: the link naming that row, the done flag, and the order they go in. */
  steps?: { of: string; done: string; order?: string };
};

export type SeedField = FieldDecl & {
  label?: string;
  required?: boolean;
  default?: Json;
  /** Where a row applies: a ref to a project, or a list of them. */
  scope?: { widen?: 'any' | 'person'; same?: 'both' | 'nearer'; links?: true };
  min?: number;
  max?: number;
  required_when?: { field: string; is: Json };
  by?: 'decide';
  transitions?: Readonly<Record<string, { to: readonly string[]; requires?: readonly string[]; by?: 'decide' }>>;
  index?: boolean;
  unique?: boolean;
  immutable?: boolean;
  /** The date this row is ABOUT, for tone. Declared, never the first `day` field the register has. */
  deadline?: boolean;
  /** Worked out at read and never stored (the kernel's `derive.ts`), such as a field read through a link: `{ via: { ref, field } }`. */
  derive?: Readonly<Record<string, unknown>>;
  /** The list's own bookkeeping: left out of an agent's short answers, kept in `format: full` and the app. */
  hidden_from_agents?: boolean;
  /**
   * The field this one makes readable, if it makes one readable.
   *
   * A COLUMN OF AMOUNTS ON UNSTATED PERIODS CANNOT BE READ: `GBP 340.00` beside `GBP 5.00` is not a
   * comparison until one says yearly and the other monthly. `cycle` is that field for `cost`, and
   * when the default column set narrowed to what a register nominates, the amounts stayed and the
   * period went. The comment on `cycle` below had already predicted exactly that, which is why the
   * pair is declared here rather than inferred by whatever draws the columns.
   */
  qualifies?: string;
  /** In the search index. A register whose title is not searchable is a register nobody can find. */
  search?: boolean;
  /** Lead times. NOBODY SETS A REMINDER: the field declares them and the record derives the rows. */
  remind?: readonly string[];
  /**
   * How a `duration` is SAID, which is not how it is stored. The record holds integer seconds; a
   * task's effort is spoken in days, and the field is what says which.
   */
  unit?: string;
};

/**
 * A money value, which is an integer in minor units WITH ITS OWN CURRENCY.
 *
 * Never a bare number. The record refuses one, and the reason is the whole rule: a figure with no
 * currency beside it is a figure that can be added to another currency, and the sum is not about
 * anything. This record is entirely in sterling, so the helper is short — but the pair is written
 * out on every row rather than assumed once at the top, because the assumption is the bug.
 */
/**
 * A duration, which the record holds as INTEGER SECONDS and a person says in days.
 *
 * `0.2` is not a duration: it is a number of some unit the field forgot to name, and two of them
 * cannot be added without knowing which. Seconds is the one unit, and `2h` and `0.1d` are the same
 * value written two ways rather than two values.
 */
export const days = (n: number): number => Math.round(n * 86_400);

export const gbp = (minor: number): { amount: number; currency: string } => ({ amount: minor, currency: 'GBP' });

/** The record is read as if it were opened on this day, so every relative date is stable. */

export const TODAY = '2026-09-03';
export const NOW = Date.UTC(2026, 8, 3, 12);

export const day = (offset: number): string => new Date(NOW + offset * 86_400_000).toISOString().slice(0, 10);

/** An `instant`, not a `day`: a session's age is said in hours and minutes, never in whole days. */
export const hours = (ago: number): string => new Date(NOW - ago * 3_600_000).toISOString();
export const stamp = (offsetHours: number): string => new Date(NOW + offsetHours * 3_600_000).toISOString();

/**
 * Named factor tables, for the one row-level multiplication a metric needs.
 *
 * 08 §2.5's `lookup` shape, with a literal table instead of an `fx` register — the pattern is the
 * same and so is the reason: a service's `cost` is per CYCLE, so a yearly domain and a monthly
 * bucket are two different units, and adding them gives a number that is not about anything. The
 * factor was written out longhand in one metric and omitted from another, and Kiln's annual cost
 * came out 9.25 times too low. One table, named, read by whatever declares it.
 */
export const LOOKUPS: Record<string, Record<string, number>> = {
  per_year: { monthly: 12, yearly: 1, two_yearly: 0.5 },
  /* The monthly share of a repeating amount. `none` is absent, so a one-off is not in a monthly figure.
     A WEEK AND A FORTNIGHT ARE SHARES OF A YEAR, NOT OF A MONTH: fifty-two weeks and twenty-six fortnights make a year,
     so a weekly amount is 52/12 of itself a month, and four would drop a week every quarter. Twice a month is two. */
  per_month: { weekly: 52 / 12, fortnightly: 26 / 12, twice_monthly: 2, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 },
  /* WHICH WAY AN AMOUNT MOVES A NET, for a figure that adds money in and takes money out over one list in one reading:
     money-core's `net-by-month`. The amount stays positive on the row and `direction` carries the sign. */
  sign: { in: 1, out: -1 },
};

/**
 * The metrics the record ships with, as DOCUMENTS.
 *
 * Every one of these was a `case` in a twelve-branch `switch`. The point of moving them was not
 * tidiness — it is that a page an agent writes can carry a `stat`, because a figure is a row in a
 * table rather than a branch in a function, and a second project page is a second declaration
 * rather than a thirteenth case.
 *
 * TWO SHAPES REPEAT, AND THAT IS THE ARGUMENT. `owed-to-you` and `project-owed` are the same
 * document with one clause added; `estate-year` and `project-cost` likewise. A project page is the
 * register's own numbers with a `thing is Kiln` on the front, and nothing about it is a new kind of
 * thing — which was true in the comment above the old `switch` and false in the code underneath.
 * The three project documents carry `{{it}}` rather than a name, so four projects are four pages
 * over one declaration instead of twelve documents.
 *
 * THE HREF IS NOT HERE. It is derived from `source` and `where`, so a tile and the list it opens
 * cannot disagree — they used to be typed beside each other and drifted twice.
 *
 * They live in the SEED rather than in the app for the reason the registers do: the record is what
 * answers them, and a declaration only the browser could read was a declaration the record could
 * not be measured against.
 */
export type SeedMetric = {
  metric: string;
  name: string;
  /** `register.<id>`, or `forecast.runway` for a figure over the cash walk ahead. */
  source: string;
  /** A sentence, or the tree the sentence compiles to where one sentence cannot say it (`money.ts` `LIVE_LINES`). */
  where?: string | Predicate;
  value: unknown;
  format?: string;
  /**
   * `setting` names a setting of the pack the target is read from, each time the figure is read (`liveTarget`).
   *
   * A TARGET MAY BE A SETTING AND NO NUMBER, which is a money ceiling nobody has set: the figure has no verdict until a
   * person types one, in the record's own currency, because a pack cannot know which currency that is.
   */
  target?: { lte?: number; gte?: number; setting?: string };
  /** A walk's legs, the same shape a forecast block's `from:` names, on a `forecast.runway` figure only. */
  legs?: readonly Leg[];
  /** The figure a `days_to_zero` walk starts from: what is held now. */
  opening?: { metric: string };
  /** Its place among the record's Home figures, 1 to 9, lowest first. */
  home?: number;
  /** Offered to a forecast's sell control as something that could be sold for cash. */
  sellable?: true;
  /**
   * The pack it ships in, where its `source` cannot say: a figure over `forecast.runway` reads no one list, so the
   * first-party split (`packs/first-party.ts`) would otherwise file it with the declarations no single pack holds.
   */
  pack?: string;
  window?: string;
  compare?: 'previous' | 'none';
  /** The factor tables a `product` reads, carried with the figure so a pack installs them with it. */
  lookups?: Record<string, Record<string, number>>;
  /** Remember the reading daily, into the series it names (08 §2.6). */
  snapshot?: { grain: 'day'; into: string };
  /** Read the figure once per value of one field, a date cut into buckets (08 §2.1). */
  group_by?: string;
  bucket?: 'day' | 'week' | 'month' | 'quarter' | 'year';
};

/** Everything not settled, in either direction. The four states a register declares, minus two. */
export const OPEN = 'state is open or part';

/**
 * A page is a DOCUMENT, and its blocks are queries.
 *
 * Nothing here is a component. A page names blocks, a block names a kind, a source, a predicate and
 * some columns, and what draws it is a renderer that has never heard of money or of projects — which
 * is what makes a page an agent writes indistinguishable from one that shipped.
 *
 * ONE DECLARATION, ONE PAGE PER ROW. A page that declares `for:` is a TEMPLATE: every `{{field}}` in
 * it resolves against one row of that register, so four projects are four pages over one document
 * rather than four documents with the name typed into every predicate, every metric id and every
 * heading.
 *
 * They live in the SEED for the reason the registers and the metrics do: a page is a document the
 * RECORD holds — it travels in a `.brain` file, it versions when it changes, and a person can point at
 * the version that was live when a figure was screenshotted. A page only the browser could read was
 * a page the record could not carry.
 */
export type SeedPage = Record<string, unknown> & { page: string };

/** A rule as a pack writes it: the register it watches, when it fires, what it does, and once per what. */
export type SeedRule = { rule: string; pack?: string; register: string; when: string; then: Record<string, unknown>[]; once_per: string[] };

/**
 * Calendar: every day the record is waiting on, a month grid a date anywhere on the record can open (PGS-B14 job e).
 *
 * ONE CALENDAR, OVER THE COMPUTED DEADLINES. `source: deadlines` is the kernel's own reading of every list that declares a
 * deadline day, finished rows left out, so the page names no list and no field of one, leans on no register, and draws whatever
 * a record's add-ons hold. A record with no list holding a deadline opens on the one line under `empty:`.
 *
 * THIS MONTH AND THE TWO AFTER IT (`back: 0`, `ahead: 2`), because the page is opened from a day AHEAD: a date in a
 * note links here with `?day=`, and a host draws the link only for a record that holds this page.
 *
 * NO HEADING ON THE BLOCK. The page's name is already Calendar, and a tile headed Calendar under it says it twice.
 *
 * IT OPENS ON ITS LINE, AS EVERY PAGE DOES (held by `calm-pages.test.ts`): one sentence of what the
 * months hold, in plain words and with no figure, since nothing counts what falls due in three months yet.
 *
 * NOT ON THE RAIL, so no `nav:`. The rail is the seven places, and this page is reached from a date.
 *
 * IN PEOPLE, FOR THE REASON HEALTH IS (`modules/health.ts`): no add-on is held by every record, and People is the one
 * nearly every record holds. It is declared here, beside the shapes every module shares, because it belongs to no
 * module's lists, and moving it is one `pack:` and a version.
 */
export const CALENDAR_SOURCE = 'deadlines';

/**
 * Activity: everything written to the record, a day at a time, with who did it beside it.
 *
 * ONE FEED OVER THE RECORD'S OWN LOG. `source: activity` reads every change whoever made it, so the page names no list and
 * leans on no register. `group: day` is a heading each day in the record's own zone, `fold: run` is one line for each
 * run's work with how many more it wrote, and `since: seen` marks what is new since the reader last looked. Fifty lines,
 * the most a feed reads at once; older ones wait for a feed's `more:`, which no build reads yet.
 *
 * THE SIDE COLUMN IS THE LOG AS THREE FIGURES (`activity-by-who`, `activity-by-kind`, `activity-by-hour`, the kernel's
 * own over the last thirty days), each tile headed by its figure's name, so a tile and the figure an agent reads are
 * never called two things. Who worked is a `split`, four parts of one whole; the other two are bars. Under them, what
 * an agent asked: the fifth part the hand-built screen lacked.
 *
 * IT OPENS ON ITS LINE, AS EVERY PAGE DOES (held by `calm-pages.test.ts`), in plain words and with no
 * figure: nothing counts what a reader has not seen yet, nor the agents' share of it, and a sentence is not given a
 * number the record cannot read.
 *
 * EVERY BLOCK HAS A `key:`, so a tile moved in Edit layout, or by an agent's proposal, is found again when the page's
 * next version lands.
 *
 * NOT ON THE RAIL, so no `nav:`: the rail is the seven places and is the person's to change. IN PEOPLE,
 * for Calendar's reason above.
 */

/**
 * What an agent asked: an open question opened by a run (its spoken id, `S12`) or by an agent's key with no run to sign
 * it (`agent:claude`). THE AGENTS PAGE'S OWN TEST, WRITTEN AGAIN (`ASKED_BY_A_RUN` in `packs/agents.ts`, which imports
 * this file and so cannot be imported here); `base-activity.test.ts` holds the two equal. A tree and not a sentence,
 * because a spoken id is an s and a first digit, one to nine, and the grammar has no pattern for that.
 */
export const ASKED_BY_AN_AGENT = {
  any: [{ field: 'who', starts: 'agent:' }, ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ field: 'who', starts: `s${n}` }))],
};

export const BASE_PAGES: Record<string, SeedPage> = {
  calendar: {
    page: 'calendar',
    title: 'Calendar',
    icon: 'calendar',
    pack: 'core',
    blocks: [
      { kind: 'note', lead: true, span: 12, body: 'Everything with a day it is due, this month and the next two.' },
      {
        kind: 'calendar',
        span: 12,
        source: CALENDAR_SOURCE,
        /* THE SOURCE'S OWN TWO NAMES, what falls due and its day, whatever each list calls its fields. */
        columns: [{ field: 'title' }, { field: 'day' }],
        back: 0,
        ahead: 2,
        empty: 'Nothing is due in these three months.',
      },
    ],
  },
  activity: {
    page: 'activity',
    title: 'Activity',
    icon: 'activity',
    pack: 'core',
    layout: { rail: 4 },
    /* WHO, WHAT KIND AND WHICH LIST, SINCE PGS-C24: the three things a person narrows the log by, as chips over
       it. A filter is `{ field, control }` (`filtersFault` in the kernel); the log answers them by its own words. */
    filters: [
      { field: 'who', control: 'chips' },
      { field: 'kind', control: 'chips' },
      { field: 'list', control: 'chips' },
    ],
    blocks: [
      { kind: 'note', lead: true, key: 'line', span: 12, body: 'Everything that changed, a day at a time, newest first.' },
      { kind: 'feed', key: 'feed', span: 12, source: 'activity', group: 'day', fold: 'run', since: 'seen', first: 50, empty: 'Nothing has changed yet.' },
      { kind: 'split', key: 'who-worked', heading: 'Who worked', icon: 'people', span: 12, area: 'rail', source: 'metric.activity-by-who' },
      { kind: 'bar', key: 'what-changed', heading: 'What changed', icon: 'activity', span: 12, area: 'rail', source: 'metric.activity-by-kind' },
      { kind: 'bar', key: 'busy-hours', heading: 'Busy hours', icon: 'clock', span: 12, area: 'rail', source: 'metric.activity-by-hour' },
      {
        /* ANSWERED WHERE THEY ARE SHOWN, three at most and the rest in Decide. ONLY WHILE SOMETHING IS ASKED
           (`questions-open`, the record's own count of what is open): with none of them an agent's, the queue has
           nothing in it and is not drawn. */
        kind: 'queue',
        key: 'agents-asked',
        heading: 'Agents asked',
        icon: 'ask',
        span: 12,
        area: 'rail',
        source: 'governance.open',
        where: ASKED_BY_AN_AGENT,
        limit: 3,
        when: { metric: 'questions-open', gt: 0 },
      },
    ],
  },
};
