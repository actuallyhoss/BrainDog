/**
 * What every module of the sample record shares: the row and declaration shapes, the clock the record
 * is read at, the money and duration helpers, and the named factor tables.
 */

import type { FieldDecl, Json } from '@braindog/kernel';

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
  mobile: readonly [string, string, string];
  state?: string;
  done?: readonly string[];
  fields: readonly SeedField[];
  identity?: { mark: string; accent: string };
  icon?: string;
  pack?: string;
  seq_prefix?: string;
  /** On the one register whose rows are projects: its fields listing repositories and folders. */
  scopes?: { repos?: string; folders?: string };
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
  /* The monthly share of a repeating amount. `none` is absent, so a one-off is not in a monthly figure. */
  per_month: { monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 },
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
  source: string;
  where?: string;
  value: unknown;
  format?: string;
  target?: { lte: number } | { gte: number };
  window?: string;
  compare?: 'previous' | 'none';
  /** The factor tables a `product` reads, carried with the figure so a pack installs them with it. */
  lookups?: Record<string, Record<string, number>>;
  /** Remember the reading daily, into the series it names (08 §2.6). */
  snapshot?: { grain: 'day'; into: string };
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
