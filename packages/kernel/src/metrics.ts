/**
 * A metric: one number, computed by the record, with a target and a comparison.
 *
 * A NUMBER WITH NO TARGET IS DECORATION, and one with no comparison window is a number you cannot
 * act on. Both are required, and both are refused by name rather than defaulted — a dashboard that
 * shows eleven figures nobody can say anything about is the failure this is meant to avoid, and
 * making the two fields optional is exactly how every product gets there.
 *
 * ONE AGGREGATE SCAN, TWO WITH A COMPARISON. The predicate is compiled to SQL by `@braindog/where`,
 * so a metric reads the same rows a list of the same predicate would — the alternative is two
 * definitions of "overdue" that agree until somebody edits one, and then a tile that links to a
 * page contradicting it.
 *
 * TWO CURRENCIES ARE NEVER ADDED AS THEY ARE. A money sum groups by currency in SQL, and when more
 * than one group comes back, or one in a currency other than the figure's, it is converted into the
 * home currency at the rates as of each row's day, or answered one amount per currency with the
 * missing rates named (`fx.ts`, `08 §2.5`). A total across two added as they are is a number of the
 * right size in the wrong unit, and there is no screen on which anybody notices.
 *
 * WHAT IS NOT HERE IS REFUSED BY NAME. `running`, `trend`, `last` and `median` are published shapes
 * with no consumer in this build. `group_by` and `bucket` are read (`groupsOf`). Reading one and
 * quietly returning the ungrouped figure would be a number under a heading that says it is grouped,
 * which is worse than an em dash.
 */

import type { Refusal, Result, Sql } from '@braindog/ports';
import { fixOf, no, ok } from '@braindog/ports';
import { KERNEL_FIELDS, compile, jsonPath, lookupRef, parseWhere, resolveDay, type Predicate, type Schema, type SentenceDeps } from '@braindog/where';

import { GROUP_CAP, bucketOf, bucketRun, bucketStart, isBucket, nextBucket, type Bucket } from './buckets.ts';
import type { Leg } from './forecast.ts';
import { across, convertMinor, dayFieldOf, pairParts, rateFor, rateIsStale, type Part, type Rate, type Reduce } from './fx.ts';
/* THE TWO FIGURES THAT ARE NOT A SUM OVER ONE LIST, read in their own file, which imports this one back (it says why that is safe). */
import { isRolled, isWalked, readRolled, readWalk } from './money-figures.ts';

/** The six this build reads. The other five are `08` §2.2's and are refused by name. */
export const AGGREGATIONS = ['sum', 'count', 'avg', 'min', 'max', 'distinct'] as const;
/**
 * A row-level multiplication, before the sum.
 *
 * `08` §2.5's shape with a NAMED FACTOR TABLE instead of an `fx` register, and the reason is the
 * same either way: a service's `cost` is per CYCLE, so a yearly domain and a monthly subscription
 * are two different units and adding them gives a number that is not about anything. Written out
 * longhand in one metric and omitted from another, this came out 9.25 times too low under the word
 * "year". One table, named, read by whatever declares it.
 */
export type Product = { product: [string, { lookup: string; by: string }] };

export type Aggregation =
  | { sum: string | Product }
  | { count: string }
  | { avg: string }
  | { min: string }
  | { max: string }
  | { distinct: string };

export type Value = Aggregation | { ratio: { of: Aggregation; per: Aggregation } } | { diff: { of: Aggregation; per: Aggregation } };

export type MetricDecl = {
  metric: string;
  name: string;
  /**
   * `register.<id>`, or `forecast.runway` for a figure over the cash walk ahead (`money-figures.ts`). A `series.<id>`
   * source reads `metric_point`, which this build does not.
   */
  source: string;
  /**
   * The predicate, structured or as a sentence.
   *
   * BOTH, because a declaration is written by a person or an agent as `direction is owed to me,
   * state is open` and read by the compiler as a tree. One form the record accepts and the other it
   * does not would make `where:` two languages.
   */
  where?: Predicate | string | undefined;
  value: Value;
  /** Required. A number with no target is decoration. */
  target?: { lte: number } | { gte: number } | undefined;
  /** Required. `30d`, `4w`, `3m` — the shift the comparison is measured over. */
  window?: string | undefined;
  /**
   * `08 §2`'s three words, and this type knew two of them.
   *
   * `declare.ts` has always admitted `previous`, `year_ago` and `none`, with the citation on the
   * line, so a metric declaring `year_ago` installed. This union said `'previous' | 'none'`, and
   * the branch below sent everything that was not `none` down the same `now minus window` path: a
   * tile labelled *vs. last year* was reading last month, on the 30-day window `08 §2`'s own
   * example uses. See `yearBefore` for what the record means by a year and for what the drift cost.
   */
  compare?: 'previous' | 'year_ago' | 'none' | undefined;
  /**
   * `money`, `money.GBP`, `int`, `pct`, `days`. It says how to WRITE the figure, never what it is of.
   *
   * `money` NAMES NO CURRENCY, AND THAT IS THE POINT OF IT. A pack cannot know the currency of the record it lands on, and
   * `money.GBP` written by a pack author was a fact about the author: the figure is added up in the record's home
   * currency, else in its rows' one currency, else one amount per currency, whatever the format says (`evaluateMetric`).
   * `money.<CUR>` is still read, for the figures installed before `money` was, and its currency is still the one a
   * literal target is set in.
   */
  format?: string | undefined;
  /**
   * The walk a `forecast.runway` figure adds up: the same legs a forecast block's `from` names (`forecast.ts` `Leg`).
   * Only on that source; `declare.ts` refuses the key anywhere else.
   */
  legs?: readonly Leg[] | undefined;
  /** The figure a `days_to_zero` walk starts from, by id: what is held now. */
  opening?: { metric: string } | undefined;
  /**
   * Where the figure stands among the record's Home figures, 1 to 9, lowest first; the `figures.home` page source
   * (`pages.ts`) draws the first of them. Absent is a figure Home does not draw.
   */
  home?: number | undefined;
  /** `true` offers the figure to a forecast's sell control as something that could be sold for cash. */
  sellable?: true | undefined;
  /**
   * The factor tables this figure's `product` reads, by name: `{ per_year: { monthly: 12, yearly: 1 } }`.
   *
   * CARRIED BY THE DECLARATION, SO IT TRAVELS WITH THE PACK. The tables used to be handed to the kernel
   * by whoever opened the record, and no host ever handed one in: every real record answered
   * `LOOKUP_UNKNOWN` for a figure its own pack had installed, while every test passed the seed's table
   * and read the right number. A table in the body is installed, versioned, exported and uninstalled
   * with the figure that multiplies by it, which is the property the `fx` register of `08 §2.5` has.
   */
  lookups?: Lookups | undefined;
  /**
   * One field the figure is read per value of (`08 §2.1`): an enum, a ref or a word, or a day or an
   * instant cut into `bucket`s. The figure itself stays the whole; `groups` carries the parts.
   */
  group_by?: string | undefined;
  /** `day` · `week` · `month` · `quarter` · `year`, and only beside a date `group_by`. */
  bucket?: Bucket | undefined;
  /**
   * THE CLAUSES A PARAMETER FILLED, WHICH ARE SCOPE AND NOT FILTER, and what `held` counts.
   *
   * NOBODY SHOULD DECLARE THIS. A metric document is written once with `{{it}}` in its `where`, and
   * the reader that fills the parameter writes this key on the copy it hands the evaluator (`fill`,
   * in `pages.ts`). Nothing in the shipped seed carries it and nothing needs to.
   *
   * AND A BODY THAT CARRIES IT IS REFUSED AT INSTALL, which is where the sentence that used to stand
   * here said the closing belonged. `metricBody` in `declare.ts` refuses the key by name, and the
   * case that sentence described as accepted was driven through `install` again to write this one:
   *
   *     install {where: 'state is open', within: 'party is HMRC'}
   *       DECLARATION_INVALID at within
   *       "within is the scope a parameter cut rather than a key a document carries: the reader
   *        derives it from where when it fills {{it}}."
   *
   * WHY THE GUARD IS THERE, KEPT AS HISTORY: installed, that same body read `rows: 4, held: 1` over
   * the five-row register of `metrics.test.ts`, with no refusal anywhere. Four matched out of one
   * held is a reading that contradicts itself, and it is the one shape `scopeOf` in `pages.ts`
   * refuses to produce on purpose, so the body a pack could write by hand was worse than the copy a
   * reader builds. That route is shut. The measurement stays because it is the argument for the
   * guard, not a description of what happens now.
   *
   * SO THE GUARANTEE IS OVER A STORED BODY AND NOT OVER THIS FIELD. `evaluateMetric` still honours a
   * `within` from whoever calls it, so the same object assembled in TypeScript rather than parsed out
   * of a declaration row still reads `rows: 4, held: 1` on that seed, measured today. The invariant
   * lives at the install boundary: `fill` is the only writer meant to set the key, and nothing in
   * this type or in the evaluator says so.
   *
   * AND IT IS A REFUSAL BY NAME RATHER THAN AN UNKNOWN-KEY CHECK, because a metric body still has
   * none of those: `wibble: 1` beside the same keys installs cleanly, measured on the same record. So
   * this one word is closed and the next key a pack invents is not, which is why the `within` beside
   * `where` in `evaluateMetric` is resolved and compiled rather than trusted.
   *
   * `project-owed:Kiln` IS NOT A FILTER OVER THE OBLIGATIONS REGISTER, IT IS A QUESTION ABOUT KILN.
   * `held` exists to tell an empty register from an empty match, and on a project page the register
   * the reader means is that project's rows. Without this key the count was a bare `count(*)` over
   * every obligation in the record, so a project with nothing in it answered `rows: 0, held: 38`,
   * which reads as *everything here is settled* on the screen most likely to be new and empty.
   */
  within?: Predicate | string | undefined;
};

/**
 * One part of a grouped figure.
 *
 * `empty` is a bucket nothing fell in, and its value is `null`: a gap, never a zero (`08 §2.1`).
 * `partial` is the bucket the clock is in, or one after it, which is not finished and is drawn faint.
 */
export type Group = {
  key: string;
  value: number | null;
  rows: number;
  state: 'empty' | 'partial' | 'full';
  /** On a figure in more than one currency that is not converted: this part's amount in each, and `value` is `null`. */
  parts?: Part[];
};

/**
 * How a money figure across currencies was read (`fx.ts`).
 *
 * `into` IS THE CURRENCY SOMEBODY CHOSE TO ADD UP IN, OR IT IS `null`. That is the record's home currency (`home`),
 * and a record with no home currency has no such currency at all. This sentence read *"else the one the figure
 * declares"* for as long as `evaluateMetric` fell back to the declared format, which published `into: "GBP"` on a
 * record holding pounds Egyptian and no sterling; the fallback is gone and so is the clause. `asOf` is the OLDEST
 * rate a converted figure used, because a figure is only as current as the stalest rate behind it, and `missing`
 * each pair with no rate, which is why a figure came back in `parts`.
 *
 * `stale` WHEN THAT OLDEST RATE IS OLDER THAN `RATE_STALE_DAYS`. A rate with no maximum age was the expensive kind
 * of silence: a poll that quietly stopped went on converting at the old rate and the figure never changed tone.
 */
export type FxRead = { into: string | null; home: string | null; asOf: string | null; forward: boolean; stale: boolean; missing: string[] };

/** Named factor tables: a table's name, then each `by` value's factor. */
export type Lookups = Record<string, Record<string, number>>;

/**
 * The tables a metric installed before it could carry its own was written against.
 *
 * READ ONLY FOR A BODY WITH NO `lookups` KEY AT ALL, the way `group_by` below is still looked for on a
 * body installed before `declare` refused one. Declaration rows are never edited (`02 §1`), so a
 * record whose figure was installed by an earlier build keeps that body until its pack is installed
 * again, and until then this is the side that reads it. `per_year` is the only table a build ever
 * named without carrying, and a new declaration is refused at install unless it carries its own.
 */
const UNCARRIED: Lookups = { per_year: { monthly: 12, yearly: 1, two_yearly: 0.5 } };

/** The factor tables a metric reads: its own, or for a body from before it could carry them, `UNCARRIED`. */
export const tablesOf = (decl: Pick<MetricDecl, 'lookups'>): Lookups => decl.lookups ?? UNCARRIED;

export type Reading = {
  value: number | null;
  /** The currency the rows were in, when they were money. `null` for a plain figure. */
  unit: string | null;
  rows: number;
  /**
   * HOW MANY ROWS WERE IN SCOPE BEFORE THE PREDICATE RAN: the register's own, less the deleted.
   *
   * A READING COULD NOT TELL AN EMPTY REGISTER FROM AN EMPTY MATCH. `rows` is what the filter
   * matched, so a tile at zero meant either *add your first invoice* or *nothing is overdue*, and
   * those are not the same sentence. Measured over the five-row seed in `metrics.test.ts`, a
   * predicate matching nobody and a register nobody has ever written to came back as the same
   * reading, key for key:
   *
   *     {"value":0,"unit":null,"rows":0,"refusals":[],"delta":null,"why":"…","met":true}
   *
   * So whichever of the two sentences the app drew, it was guessing, and the guess that goes wrong
   * is the one shown to somebody who has just arrived: their empty record reads as a record that is
   * up to date, which is how a dashboard loses trust on the first screen anybody sees.
   *
   * IT IS THE SCOPE AND NOT THE WINDOW. Only the predicate stands between `held` and `rows`, so the
   * two windows of a comparison, the two halves of a ratio and the parts of a grouped figure are all
   * cut out of this one number rather than each carrying their own.
   *
   * AND A PARAMETER IS PART OF THE SCOPE, WHICH IS MOST OF THE POINT OF THE FIELD. `project-owed:Kiln`
   * is a question about Kiln, so the rows Kiln's own clause admits are what the predicate chose from.
   * Counted as the whole register instead, a brand-new project read `rows: 0, held: 38` against this
   * seed's obligations, and zero matched out of thirty-eight held is the good-news zero: the tile
   * would have said nothing is overdue for a project with no invoice ever written. `MetricDecl.within`
   * carries those clauses, and `heldBy` counts inside them.
   *
   * THE BROWSER'S COPY OF THIS EVALUATOR HAS CARRIED THE FIELD ALL ALONG, under the same name and
   * with the same meaning, counted before its filter runs (`apps/web/src/lib/record/metrics.ts`),
   * and its tile keys a verdict off it: zero matched over rows that exist is good news, zero held is
   * not news at all. This side did not carry it, so a host reading the same figure over the API got
   * the ambiguous pair while the browser did not. `50 §1` says there should not be two engines;
   * while there are, a field on one of them is half a field.
   *
   * AND THE PARAMETERISED CASE, WHICH THE TWO DID DISAGREE ON, IS CLOSED ON BOTH SIDES NOW. The
   * browser's `held` was `all.length` with nothing able to narrow it, so `project-owed:Kiln` answered
   * `held: 40` there against this side's `held: 10` on the demo's rows; its `withParam` now writes
   * `within` the way `fill` does and its `heldRows` is `all` filtered by that scope. What holds them
   * together is a test rather than a shared function: `engines.test.ts` drove only unparameterised
   * figures through its `held` loop, and now also fills one parameter by each engine's own rule and
   * asserts the two counts and the narrowing. The rule is still written twice, in `scopeOf` on this
   * side and in `withParam` on that one, which is the duplication `50 §1` wants deleted rather than
   * guarded: the two agree because a test says so, not because either derives its scope from a
   * function they share.
   */
  held: number;
  /** `(value − prior) / prior`, or `null` with `why` naming the clause that stopped it. */
  delta: number | null;
  why: string;
  met: boolean | null;
  refusals: Refusal[];
  /** A grouped figure's parts, in key order. Absent on a figure with no `group_by`. */
  groups?: Group[];
  /** On a figure bucketed by date: the bucket the clock is in, which a chart marks as unfinished. */
  current?: string;
  /** How many groups past the cap of fifty were left out, the oldest first. */
  more?: number;
  /**
   * MONEY IN MORE THAN ONE CURRENCY THAT COULD NOT BE CONVERTED, one amount per currency, and `value` is `null`. It is
   * not a refusal: the parts are the answer, and `fx.missing` says which rate would add them up.
   */
  parts?: Part[];
  /** Present when the rows were in a currency other than the one the figure is added up in: converted, or in `parts`. */
  fx?: FxRead;
  /**
   * A MONEY FIGURE CONVERTED OUT OF THE CURRENCY IT DECLARES HAS ITS TARGET CONVERTED TOO, at the latest rate from that
   * currency into this one, and `met` is read against it. Absent when there is no such rate, and then `met` is `null`.
   */
  targetIn?: TargetIn;
  /**
   * ON A ROLLED CASH FIGURE, THE OLDEST DAY ANY OF ITS BALANCES WAS STATED ON, which the tile says as "as of 3 Sep" so a
   * reader knows how old the weakest part of the figure is (`money-figures.ts` `readRolled`). Absent on every other
   * figure, and on a rolled one with nothing stated.
   */
  as_of?: string;
};

/** A target converted into the currency a figure was added up in: the bound, and the rate's day. */
export type TargetIn = {
  currency: string;
  target: { lte: number } | { gte: number };
  asOf: string;
  forward: boolean;
  /** Whether the rate that converted the bound is older than `RATE_STALE_DAYS`: a stale rate is a stale verdict. */
  stale: boolean;
  /** The currency the target was set in, when it is not the one the figure declares: the home currency a person typed it in. */
  from?: string;
};

/**
 * The currency a target is in: the one its setting was typed in (`currency`, put there when a setting is read), else the
 * figure's declared one.
 */
export const targetCurrency = (target: unknown, declared: string | null): string | null => {
  const said = target !== null && typeof target === 'object' ? (target as { currency?: unknown }).currency : undefined;
  return typeof said === 'string' && /^[A-Z]{3}$/u.test(said) ? said : declared;
};

/**
 * A target in the currency a figure came back in: as it is when it was set in that currency, converted at the latest rate
 * when it was set in another, or `null` with no rate. Shared by both engines.
 */
export function targetFor(
  target: { lte: number } | { gte: number },
  declared: string,
  into: string,
  rates: readonly Rate[],
  today: string,
): TargetIn | null {
  const from = targetCurrency(target, declared)!;
  const bound = 'lte' in target ? { lte: target.lte } : { gte: target.gte };
  if (from === into) return { currency: into, target: bound, asOf: today, forward: false, stale: false, from };
  const got = targetInto(bound, from, into, rates, today);
  return got && from !== declared ? { ...got, from } : got;
}

/**
 * A declared target in another currency, at the latest rate as of `today` (`fx.ts` `rateFor`), or `null` with no rate.
 * Exported so the browser's reader converts a target exactly as the record does.
 */
export function targetInto(
  target: { lte: number } | { gte: number },
  from: string,
  into: string,
  rates: readonly Rate[],
  today: string,
): TargetIn | null {
  const r = rateFor(rates, from, into, today);
  if (!r) return null;
  const bound = convertMinor('lte' in target ? target.lte : target.gte, from, into, r.rate);
  return { currency: into, target: 'lte' in target ? { lte: bound } : { gte: bound }, asOf: r.as_of, forward: r.forward, stale: rateIsStale(r.as_of, today.slice(0, 10)) };
}

/** Whether a format says the figure is money: `money`, or `money.<CUR>` from before a figure could leave its currency unsaid. */
export const isMoneyFormat = (format: unknown): boolean => format === 'money' || (typeof format === 'string' && /^money\.[A-Z]{3}$/u.test(format));

/**
 * Whether a figure clears its target, and the target it was held to when that is not the one written.
 *
 * ONE RULE FOR EVERY KIND OF FIGURE, a sum over a list, a rolled balance or a walk (`money-figures.ts`), so a tile's
 * verdict does not depend on which file read its number. A target is set in a currency: the one a `money.<CUR>` format
 * declares, else the one its setting was typed in (`liveTarget` in `declare.ts` writes it there), else none, and then it
 * is read as it is in whatever currency the figure came back in (`loop/finish/modules.md` C1). A figure in a currency
 * other than its target's is judged against the target converted at the latest rate, and has no verdict without one.
 *
 * A TARGET WITH NO NUMBER TO HOLD THE FIGURE TO HAS NO VERDICT, rather than the `false` that comparing against nothing
 * would give: every figure is judged here, so whatever leaves a target without its bound leaves the figure unjudged.
 */
export function verdictOf(
  decl: Pick<MetricDecl, 'format' | 'target'>,
  value: number | null,
  unit: string | null,
  rates: readonly Rate[],
  today: string,
): { met: boolean | null; targetIn: TargetIn | null } {
  const target = decl.target;
  const bound = target as { lte?: unknown; gte?: unknown } | undefined;
  if (!target || (typeof bound?.lte !== 'number' && typeof bound?.gte !== 'number')) return { met: null, targetIn: null };
  const declared = typeof decl.format === 'string' && decl.format.startsWith('money.') ? decl.format.slice('money.'.length) : null;
  const from = declared ?? (decl.format === 'money' ? targetCurrency(target, null) : null);
  const moved = from !== null && unit !== null && unit !== from;
  const targetIn = moved && from !== null && isCurrencyUnit(unit) ? targetFor(target, from, unit, rates, today) : null;
  const judged = moved ? targetIn?.target : target;
  return { met: value === null || !judged ? null : meets(value, judged), targetIn };
}

const WINDOW = /^(\d{1,4})([dwm])$/;
const DAY = 86_400_000;

/** A window as milliseconds, or `null` when it is not one. */
export function windowMs(text: string): number | null {
  const m = WINDOW.exec(text.trim());
  if (!m) return null;
  return Number(m[1]) * (m[2] === 'd' ? DAY : m[2] === 'w' ? 7 * DAY : 30 * DAY);
}

/** The published shapes with no consumer here, each named rather than ignored. */
const UNREAD = ['last', 'delta', 'median', 'group_by', 'bucket', 'running', 'trend'] as const;

/**
 * The same clock, one year earlier.
 *
 * `compare: year_ago` WAS COMPUTED AS `previous`, AND IT SHIPPED THE WRONG DELTA WITH EVERY HONESTY
 * CHECK GREEN. The union above read `'previous' | 'none'` while `declare` admitted `08 §2`'s three
 * words, so `year_ago` fell into the same arm as `previous` and the comparison moved the clock back
 * one WINDOW. Ten rows in the last thirty days, a hundred in the thirty before and a thousand a year
 * ago came back as minus 91 per cent under a label that says *vs. last year*, with the thousand
 * never read: the comparability gate below is correctly implemented and passes, so `why` was empty
 * and `delta` was a number, and nothing on the screen disagreed with anything else on it.
 *
 * A YEAR IS NOT A FIXED NUMBER OF MILLISECONDS, AND THIS RECORD HAS ALREADY WRITTEN DOWN WHAT IT
 * MEANS BY ONE. `resolveDay` resolves `+1m` by calendar arithmetic and clamps the day of the month,
 * on the argument that "adding to the month number rolls it into 3 March and nobody means that by a
 * month". A year is twelve of those months, so it is the same calendar date one year earlier at the
 * same time of day: 365 days in an ordinary year and 366 across a leap day. Subtracting a constant
 * `365 * DAY` instead, which is what `vault.spanMs('1y')` does for a grant's lifetime, lands on the
 * wrong day of the month for good after every 29 February, and `08 §2.4` asks for the opposite in
 * so many words: the prior window is cut at the same day, "this month to the 14th against last
 * month to the 14th". A grant expiring a day early costs nobody anything; a comparison cut a day
 * short is a figure.
 *
 * THE ONE DAY THAT CLAMPS IS 29 FEBRUARY, WHOSE ANNIVERSARY IS 28 FEBRUARY. `Date.UTC` rolls it
 * forward to 1 March on its own, which would put a February figure beside a March one under a label
 * naming a single month, so the day is cut to the last the target month has, exactly as `resolveDay`
 * cuts 31 January plus a month to 28 February.
 *
 * IT IS UTC BECAUSE `resolveDay` IS. Every temporal word in a predicate resolves against
 * `new Date(nowMs).toISOString()`, so an anniversary computed in any other zone would name a day the
 * predicate then resolves differently, and the two would be one day apart for part of every year.
 *
 * Exported for `money-figures.ts`, whose rolled figure compares with a year ago by this same rule.
 */
export const yearBefore = (nowMs: number): number => {
  const d = new Date(nowMs);
  const year = d.getUTCFullYear() - 1;
  const month = d.getUTCMonth();
  /* Day 0 of the next month is the last day of this one, which is how `resolveDay` finds it too. */
  const last = new Date(Date.UTC(year, month + 1, 0, 12)).getUTCDate();
  return Date.UTC(
    year,
    month,
    Math.min(d.getUTCDate(), last),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    d.getUTCMilliseconds(),
  );
};

/**
 * The window before, given the end the current one takes from the clock.
 *
 * A WINDOW THAT WRITES ONLY ITS START ENDS AT THE CLOCK, AND THE CLOCK WAS THE ONE THING THAT DID NOT
 * MOVE. The comparison resolves the same predicate at a moved clock, which moves every day the
 * predicate names and nothing it leaves unsaid. `on after -31d` names a start; its end is "up to now".
 * Resolved thirty days back it became `on after -61d`, still up to now, so the window before was
 * sixty-one days CONTAINING the thirty-one it was compared with. Both figures in the tree that declare
 * `compare: previous` (`spent-30d`, `received-30d`) were written that way when this was measured; the
 * seed has said `on after -30d` since `aeef01c5`, and a start with no end still ends at the clock, so
 * the rule below is about every such window and not about that one spelling. Measured in
 * `test/metrics-window.test.ts`, 150,000 spent in each of two consecutive months read `delta: -0.5`,
 * a doubled month read `-0.33`, and the Ledger's lead tile could not say "up" for any spending at all.
 * `year_ago` did the same over thirteen months and read `-0.875` against an identical month.
 *
 * SO THE END MOVES WITH THE CLOCK, AS THE START DOES: the day the moved clock falls on is the last day
 * of the window before, unless that is inside the current window, and a clause saying so is added to
 * each field that has a start and no end. That is `08 §2.4`'s rule rather than a new one, "this month
 * to the 14th against last month to the 14th", and where a declaration's span is its window it makes
 * `on after -30d` compare exactly as `on after -30d, on before tomorrow` does, which is one set of rows
 * spelled twice and was compared with two different windows.
 *
 * A FIELD WITH A WRITTEN END IS LEFT ALONE, because its end already moved with the clock, and so is a
 * field with no start: `due before today` is a balance at a moment, and the moment is its definition.
 * Only the top conjunction is read, which is every shape the sentence grammar writes; a start inside
 * `any` or `none` is not a window and is not given an end.
 */
const LOWER = ['after', 'gt', 'gte'] as const;
const UPPER = ['before', 'lt', 'lte', 'between', 'is', 'in'] as const;

const conjuncts = (p: Predicate): Record<string, unknown>[] =>
  (Array.isArray((p as { all?: unknown }).all) ? (p as { all: Predicate[] }).all : [p]) as Record<string, unknown>[];

/**
 * The type a `where` leaf's field has, from the register or from the record's own columns.
 *
 * `created_at` AND `updated_at` ARE INSTANTS THAT NO REGISTER DECLARES. They are `KERNEL_FIELDS`, read
 * off `entry`'s columns and addressable in any `where`, and `schema.fields` does not hold them. `endedAt`
 * and `localInstants` asked `schema.fields` alone, so `created_at after -30d` got neither an as-of end
 * nor local bounds: the audit (`loop/research-batch-twenty-four-audit.md` §3) measured the point stored
 * under 4 September at 11111, every row, in New York, Tokyo and UTC, where the same instants in a
 * declared `at` gave 10011, 10101 and 10101 (`test/metrics-local-day-kernel.test.ts`). This is the lookup
 * `@braindog/where`'s `specOf` makes, so the compiler, these two and `resolveRelative` before them agree
 * on which names are instants. The inbox's schema keeps no kernel columns, and its `ts` is declared.
 */
const typeOf = (schema: Schema, field: string): string | undefined =>
  Object.hasOwn(schema.fields, field)
    ? schema.fields[field]?.type
    : schema.subject !== 'inbox_raw' && Object.hasOwn(KERNEL_FIELDS, field)
      ? KERNEL_FIELDS[field]
      : undefined;

/**
 * Whether the register declares this field a deadline: a day a row is due by, which a row carries
 * from the moment it is written, rather than the day something happened.
 *
 * `=== true` AND NOT TRUTHY, because the flag arrives from a declaration a person or an agent wrote,
 * and `deadline: false` is a register saying the opposite (`test/metrics-asof-forward.test.ts`).
 */
const isDeadline = (schema: Schema, field: string): boolean => Object.hasOwn(schema.fields, field) && schema.fields[field]!.deadline === true;

/**
 * Whether the field is one the record stamps as a row is written, `created_at` or `updated_at`, rather than a day
 * somebody typed: `typeOf` reads it off the record's own columns because no register declares it.
 */
const isStamped = (schema: Schema, field: string): boolean => !Object.hasOwn(schema.fields, field) && typeOf(schema, field) === 'instant';

const dayAfter = (iso: string): string => new Date(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) + DAY).toISOString().slice(0, 10);

function endedAt(shifted: Predicate | undefined, current: Predicate | undefined | null, schema: Schema, thenMs: number): Predicate | undefined {
  /* `current: null` IS THE CURRENT WINDOW ITSELF, ended at an as-of clock: there is no later window
     for it to stay clear of, so only the clock's day bounds it. */
  if (!shifted || current === undefined) return shifted;
  const clauses = conjuncts(shifted);
  const dated = (field: unknown): field is string =>
    typeof field === 'string' && ['day', 'instant'].includes(typeOf(schema, field) ?? '');
  const started = new Set(clauses.filter((c) => dated(c.field) && LOWER.some((op) => op in c)).map((c) => c.field as string));
  for (const c of clauses) if (dated(c.field) && UPPER.some((op) => op in c)) started.delete(c.field as string);

  /* THE FIRST DAY A WINDOW HOLDS: `gte` names it, `after` names the day before it. The latest start
     is where the window begins, when a field is given two. */
  const startOf = (of: readonly Record<string, unknown>[], field: string): string | undefined =>
    of
      .filter((c) => c.field === field)
      .flatMap((c) => LOWER.filter((op) => typeof c[op] === 'string').map((op) => (op === 'gte' ? (c[op] as string).slice(0, 10) : dayAfter(c[op] as string))))
      .sort()
      .at(-1);

  /* AND AN AS-OF END ONLY FOR A WINDOW THAT LOOKS BACK. `5ae403ff` ended every such window at the
     as-of day, and `due after today` became `due > asOf and due < asOf + 1`, which holds nothing: the
     audit (`loop/research-batch-nineteen-audit.md` §5) measured two open bills due 3 and 12 days
     ahead at 300,000 live on the day and 0 as of that day, and the same for `due after -1d`. A
     window whose first day is the as-of day or later is a question about what is coming, and the
     rows it counts were there to be counted on that day; only one that begins before the day has
     rows from after it that had not happened yet. `test/metrics-asof-forward.test.ts` holds both.

     AND NEVER ON A FIELD THE REGISTER DECLARES A DEADLINE, WHEREVER THE WINDOW BEGINS. The first day
     was a guess at the real question, which is whether a row dated after the as-of day could have
     been there on it: a payment `on` the 10th had not happened on the 5th, and a bill `due` the 10th
     was already owed. `due after -7d` over bills due 2 days before and 3 and 12 after read 350,000
     live on the day and 50,000 as of it, `due after -2d` 300,000 and 0 (the audit,
     `loop/research-batch-twenty-one-audit.md` §6). `deadline: true` is the register saying which
     kind a field is; `test/metrics-past-window.test.ts` holds both, and that a field without it
     still ends at the day.

     AND ALWAYS ON `created_at` AND `updated_at`, WHEREVER THE WINDOW BEGINS. The record stamps them when a row is
     written, so a row stamped after the as-of day was not there on it, which is the one question the first-day rule
     above guesses at and these two answer outright. `created_at after -1d` stored as the night of the 5th begins on
     the 5th, so under that rule it took no end and counted every row written since, the next morning's included
     (`loop/finish/defects.md` M17). `test/metrics-live-local-day.test.ts` holds it in Tokyo, where that night ends at
     15:00 UTC. A declared `instant` keeps the first-day rule, because nothing says who wrote it or when. */
  if (current === null) {
    const asOfDay = new Date(thenMs).toISOString().slice(0, 10);
    for (const field of [...started]) {
      const begins = startOf(clauses, field);
      if (begins === undefined || isDeadline(schema, field) || (begins >= asOfDay && !isStamped(schema, field))) started.delete(field);
    }
  }
  if (started.size === 0) return shifted;

  /* `before` THE DAY AFTER, because `before` is exclusive of its day (`34 §6`) and the moved clock's
     own day belongs to the window before, as today belongs to this one. */
  const clock = dayAfter(new Date(thenMs).toISOString());
  const ends = [...started].map((field) => {
    /* AND NEVER PAST THE DAY THE CURRENT WINDOW STARTS, so no row is in both. The two coincide when a
       declaration's span is its window, which the seed's now are: `on after -30d` under `window: 30d`
       starts the current window the day after the moved clock's, so this cut changes nothing for
       them. It was written when they said `on after -31d`, thirty-one days under a clock moved thirty,
       where the moved clock's own day was the current window's first and ending there counted that
       day's rows on both sides of the comparison. It stays for any declaration whose span is longer
       than its window: the window before is cut at the day before, and holds only days the current
       one does not. */
    const begins = current === null ? undefined : startOf(conjuncts(current), field);
    return { field, before: begins !== undefined && begins < clock ? begins : clock } as Predicate;
  });
  return { all: [...(clauses as Predicate[]), ...ends] } as Predicate;
}

/**
 * The instant a local day starts at in `tz`.
 *
 * MIDNIGHT UNDER THE OFFSET IN FORCE A DAY EITHER SIDE, AND THE EARLIER OF THE TWO THAT IS ON THE
 * DAY. Reading the offset at UTC midnight alone is wrong east of UTC on the day the clocks go
 * forward: in `Australia/Sydney` 00:00 UTC on 4 October 2026 is already under +11:00, which put the
 * start at 13:00 UTC on the 3rd, an hour of 3 October; the day starts at 14:00 UTC under the +10:00
 * it began in. A candidate that is not on the day is dropped, which is also what finds the start of
 * a day with no local midnight (`America/Santiago` on 6 September 2026 starts at 01:00, 04:00 UTC).
 * Both were measured against `Intl` when this was written, as were both New York and London changes.
 */
const offsetAt = (ms: number, tz: string): number => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  return Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!) - Math.floor(ms / 1000) * 1000;
};

const localDate = (ms: number, tz: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));

const dayStartsAt = (day: string, tz: string): string => {
  const midnight = Date.parse(`${day}T00:00:00Z`);
  const on = [midnight - offsetAt(midnight - DAY, tz), midnight - offsetAt(midnight + DAY, tz)].filter((ms) => localDate(ms, tz) === day);
  /* Neither is on the day only if a zone moved its clocks by a day, which Samoa did once in 2011. */
  return new Date(on.length ? Math.min(...on) : midnight).toISOString();
};

/**
 * A bare day bounding an `instant` field, rewritten as the instants the day starts and ends at in `tz`.
 *
 * THE COMPILER COMPARES A BARE DAY WITH AN INSTANT'S FIRST TEN CHARACTERS, WHICH ARE ITS UTC DATE.
 * `snapshot` asks each day's question at noon UTC of the record's local date, so every day in the
 * predicate is a local day, and for a `day` field that is the whole of it. An `instant` was still
 * dated in UTC: `loop/research-batch-twenty-audit.md` §5 measured the point stored under 4 September
 * in `America/New_York` at 10101 where the local thirty days hold 10011, because ten at night on the
 * 4th is the 5th by UTC and ten at night on 5 August is the 6th (`test/metrics-instant-day.test.ts`).
 * Solo founder's `datapoints-30d` is that window over that type.
 *
 * SO THE BOUND BECOMES AN INSTANT, which the compiler compares whole: `after D` is from the start of
 * the day after, `before D` is up to the start of D, and `is`, `between` and `in` hold the instants
 * from a day's start to the next day's. `not` and `not_in` keep a row with no value, as the compiler
 * does for them, so `empty` goes beside the two sides of the day. A bound that is already a full
 * timestamp is compared as written, as it was.
 *
 * IT RUNS ONLY WHERE A ZONE WAS GIVEN, and only on the predicate handed to `read`, after `endedAt`
 * has written its bare-day ends. `moved` and `endedAt` read the declaration's own days, which are
 * unchanged. A read with no `tz` compares as it always has.
 */
function localInstants(where: Predicate | undefined, schema: Schema, tz: string | undefined): Predicate | undefined {
  if (!where || typeof where !== 'object' || tz === undefined) return where;
  const bare = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(v);
  const from = (day: string) => dayStartsAt(day, tz);
  const upTo = (day: string) => dayStartsAt(dayAfter(day), tz);

  const walk = (node: Predicate): Predicate => {
    for (const q of ['all', 'any', 'none'] as const) {
      const kids = (node as Record<string, unknown>)[q];
      if (Array.isArray(kids)) return { ...node, [q]: kids.map((k) => walk(k as Predicate)) } as Predicate;
    }
    const leaf = node as Record<string, unknown>;
    const field = typeof leaf.field === 'string' ? leaf.field : null;
    if (!field || typeOf(schema, field) !== 'instant') return node;
    const on = (day: string): Predicate => ({ all: [{ field, gte: from(day) }, { field, lt: upTo(day) }] }) as Predicate;
    const off = (day: string): Predicate[] => [{ field, lt: from(day) }, { field, gte: upTo(day) }] as Predicate[];
    const v = (op: string) => leaf[op];

    if (bare(v('after')) || bare(v('gt'))) return { field, gte: upTo((v('after') ?? v('gt')) as string) } as Predicate;
    if (bare(v('gte'))) return { field, gte: from(v('gte') as string) } as Predicate;
    if (bare(v('before')) || bare(v('lt'))) return { field, lt: from((v('before') ?? v('lt')) as string) } as Predicate;
    if (bare(v('lte'))) return { field, lt: upTo(v('lte') as string) } as Predicate;
    if (bare(v('is'))) return on(v('is') as string);
    if (bare(v('not'))) return { any: [{ field, empty: true }, ...off(v('not') as string)] } as Predicate;
    const pair = v('between');
    if (Array.isArray(pair) && bare(pair[0]) && bare(pair[1]))
      return { all: [{ field, gte: from(pair[0]) }, { field, lt: upTo(pair[1]) }] } as Predicate;
    const list = v('in') ?? v('not_in');
    if (Array.isArray(list) && list.some(bare)) {
      const each = list.map((x) => (bare(x) ? on(x) : ({ field, is: x } as Predicate)));
      return 'in' in leaf ? ({ any: each } as Predicate) : ({ any: [{ field, empty: true }, { none: each }] } as Predicate);
    }
    return node;
  };
  return walk(where);
}

export type EvalContext = {
  nowMs: number;
  /**
   * Read the record as it was at this instant instead of now.
   *
   * IT MOVES THE PREDICATE, NOT THE ROWS. `due before today` resolves against `asOf`, so a snapshot
   * of last Tuesday is the question this metric asks, asked on Tuesday — which is the only kind of
   * historical figure worth storing. Reconstructing the ROWS as they were would need a replay of
   * every event and would still be a different question.
   */
  asOfMs?: number | undefined;
  /**
   * The record's zone, which dates an `instant` on its local day (`localInstants`).
   *
   * `snapshot` SET IT AND THE KERNEL'S LIVE READS DID NOT, so a night point and the tile above it
   * answered different days. `snapshot` asks at noon UTC of the local date, which makes `today` and
   * `-30d` local days; a live read named them from the UTC date of `nowMs`. In `Asia/Tokyo` at 00:05
   * on the 6th, `created_at is today` read 1100 live and in the list, and 110 in the point stored
   * for the 5th (`loop/research-batch-twenty-eight-audit.md` §4). Now the kernel's `evalContext`
   * carries the record's zone, and a live read with one names its days from noon UTC of the local
   * date (`clockOf`), so the day's name and the instants it holds are the same local day.
   */
  tz?: string | undefined;
  /** The register's declared fields, so a predicate and a field expression check against one shape. */
  schemaOf: (register: string) => Schema | null;
  /** A ref written by name: `thing is Kiln`, every row bearing it. Absent means a sentence cannot name one. */
  refByTitle?: ((register: string, title: string) => string | readonly string[] | null) | undefined;
  /** The register a row id's row is on, deleted or not; `SentenceDeps.refById` says why it is asked. */
  refById?: ((id: string) => string | null) | undefined;
  /** Whether the caller reads a register; absent is everything. `SentenceDeps.reads` says what it closes. */
  reads?: ((register: string) => boolean) | undefined;
  /** A ref naming no row refused, or matching no row. A rule evaluating a row asks for the second. */
  absent?: 'refuse' | 'no-row' | undefined;
  /**
   * A ref written as the id a person or an agent is handed: `things#1`, or a prefixed one like `S6`.
   *
   * `null` WHEN THE WORDS ARE NOT AN ID AT ALL, so the caller goes on to read them as a title. An id
   * that parses answers with the register it names, even when no row holds it, because the caller
   * has to tell `tasks#1` in a field pointing at `things` (the wrong row) from `things#999` (no row):
   * `REF_REGISTER_MISMATCH` and `REF_UNKNOWN` are repaired differently, as `coerce` says for a write.
   */
  refBySpoken?: ((said: string) => { register: string; id: string | null } | null) | undefined;
  /**
   * The record's home currency and its dated rates, read when a money figure meets a second currency. Absent is no
   * home currency and no rates, so such a figure comes back in parts.
   */
  fx?: (() => { home: string | null; rates: readonly Rate[] }) | undefined;
};

/** What a money sum needs to add across currencies: the currency, the rates, today, and the field that dates a row. */
type Across = { into: string | null; home: string | null; rates: readonly Rate[]; today: string; day: string | null };

/**
 * The predicate a declaration meant, whichever form it wrote it in.
 *
 * A SENTENCE IS RESOLVED AGAINST THE REGISTER AND THE CLOCK, so `due before +30d` is an absolute
 * date by the time the compiler sees it — which is what makes it a comparison rather than a string
 * comparison that happens to be true of everything.
 */
export function predicateOf(
  where: Predicate | string | undefined,
  schema: Schema,
  ctx: EvalContext,
): { predicate: Predicate | undefined; bad: Refusal[] } {
  const said = resolvedOf(where, schema, ctx);
  return { ...said, predicate: localInstants(said.predicate, schema, ctx.tz) };
}

/**
 * The clock a predicate's days are named from: the as-of instant, or on a live read in a zone, noon
 * UTC of the local date.
 *
 * NOON UTC OF THE LOCAL DATE IS HOW `snapshot` ALREADY ASKS. Its UTC date is the local date by
 * construction, so `resolveDay`, which reads only the UTC date, names local days without a zone of
 * its own. A live read used the UTC
 * date of `nowMs`: in `Asia/Tokyo` at 00:05 on the 6th, `today` was the 5th
 * (`test/metrics-live-local-day.test.ts`).
 *
 * Exported for `money-figures.ts`, so a rolled figure and a walk name today exactly as every other figure does.
 */
export function clockOf(ctx: EvalContext): number {
  if (ctx.asOfMs !== undefined) return ctx.asOfMs;
  return ctx.tz === undefined ? ctx.nowMs : Date.parse(`${localDate(ctx.nowMs, ctx.tz)}T12:00:00Z`);
}

/**
 * `predicateOf` without the local instants, for `evaluateMetric`, which needs the bare days.
 *
 * `endedAt` finds a window's first day with `startOf`, which takes the first ten characters of a
 * bound. Handed the instants `localInstants` writes, that is the UTC date of local midnight, the day
 * before east of UTC, so a window over a declared `instant` that begins on the as-of day would read as
 * one beginning the day before and take an as-of end it should not have. It was measured on
 * `created_at` in `Asia/Tokyo` (`test/metrics-live-local-day.test.ts`), which no longer shows it:
 * `created_at` and `updated_at` now take the end wherever the window begins (`endedAt`,
 * `loop/finish/defects.md` M17). So the metric resolves here, writes its ends, and dates the instants
 * last, which is the order `snapshot` has always read in.
 */
function resolvedOf(
  where: Predicate | string | undefined,
  schema: Schema,
  ctx: EvalContext,
): { predicate: Predicate | undefined; bad: Refusal[] } {
  const nowMs = clockOf(ctx);
  if (typeof where !== 'string') {
    const dated = resolveRelative(where, schema, nowMs);
    const refs = resolveRefs(dated.predicate, schema, ctx);
    return { predicate: refs.predicate, bad: [...dated.bad, ...refs.bad] };
  }
  return parseWhere(where, schema, { nowMs, ...refDeps(ctx) });
}

/** The lookups a ref is read with, without the keys a context left out. */
function refDeps(ctx: EvalContext): Omit<SentenceDeps, 'nowMs'> {
  return {
    ...(ctx.refByTitle === undefined ? {} : { refByTitle: ctx.refByTitle }),
    ...(ctx.refBySpoken === undefined ? {} : { refBySpoken: ctx.refBySpoken }),
    ...(ctx.refById === undefined ? {} : { refById: ctx.refById }),
    ...(ctx.reads === undefined ? {} : { reads: ctx.reads }),
    ...(ctx.absent === undefined ? {} : { absent: ctx.absent }),
  };
}

/** The operators whose value on a ref field is a row: one, or a list of them. */
const ADDRESSED = ['is', 'not', 'in', 'not_in'] as const;

/**
 * A ref leaf in the tree form, read the way a ref field is written.
 *
 * `{field: 'thing', is: 'things#1'}` REACHED SQL AS THE STRING, and no row's `thing` holds the string
 * `things#1`: it holds the row id `create` resolved that same string to. Measured over the seed
 * (`loop/research-mcp-parity.md` §3), the tree the `list` tool teaches answered ok with 0 rows on a
 * project with 14 tasks, `{is: 'Kiln'}` answered 0, `{not: 'things#1'}` answered all 27 tasks with
 * Kiln's 14 among them, and `{is: 'Nowhere'}` answered ok with 0 where a refusal was owed. That is
 * 80 of the 93 task reads Sam's agents make, returning an empty board that reads as "nothing to do".
 *
 * THE ORDER IS THE ONE `coerce` WRITES WITH, then the sentence's title, and it is `lookupRef` in
 * `@braindog/where` so the two forms cannot drift again. A row id is looked up, deleted rows
 * included. An id resolves in the register it names. A title resolves to every row bearing it in
 * the register the field points at. And the title is tried before either refusal, so a project
 * really called `Q3#2` or `S6` is still found by its name rather than refused as an id it never was.
 *
 * NOTHING TO RESOLVE WITH IS NOT A REFUSAL. A context built without either lookup (a test's page
 * deps, for one) cannot say what a word means, so the leaf goes through as it went through before.
 */
function resolveRefs(
  where: Predicate | undefined,
  schema: Schema,
  ctx: EvalContext,
): { predicate: Predicate | undefined; bad: Refusal[] } {
  if (!where || typeof where !== 'object') return { predicate: where, bad: [] };
  if (ctx.refBySpoken === undefined && ctx.refByTitle === undefined) return { predicate: where, bad: [] };
  const bad: Refusal[] = [];
  const deps = refDeps(ctx);

  /* EVERY ROW THE WORDS NAME, which is one, several when a title is shared, or `NO_ROW`. */
  const one = (field: string, to: string | undefined, value: unknown): unknown[] => {
    if (typeof value !== 'string') return [value];
    const said = value.trim();
    const found = lookupRef(to, said, deps);
    if ('ids' in found) return found.ids;
    if ('mismatch' in found)
      bad.push({
        code: 'REF_REGISTER_MISMATCH',
        fix: `${field} points at ${to}, and ${said} is a ${found.mismatch} row. Name a ${to} row.`,
        at: field,
        ...(to === undefined ? {} : { allowed: [to] }),
      });
    /* `REF_UNKNOWN`, the code the sentence gives for the same words, and the one `unreadWhere` lets
       through so a rule may name a row written tomorrow. */ else
      bad.push({ code: 'REF_UNKNOWN', fix: `${field} is ${said}: there is no ${to ?? 'row'} called ${said}.`, at: field });
    return [value];
  };

  /* ONE VALUE THAT NAMED TWO ROWS WIDENS ITS OPERATOR, and the sentence builds the same shapes:
     `is` either row is `in`, `not` either is `not_in`, `has` either is `any`, `lacks` both is `all`. */
  const widened = (field: string, op: string, values: unknown[]): Predicate => {
    if (op === 'in' || op === 'not_in') return { field, [op]: values } as Predicate;
    if (values.length === 1) return { field, [op]: values[0] } as Predicate;
    if (op === 'is' || op === 'not') return { field, [op === 'is' ? 'in' : 'not_in']: values } as Predicate;
    return { [op === 'has' ? 'any' : 'all']: values.map((v) => ({ field, [op]: v })) } as Predicate;
  };

  const walk = (node: Predicate): Predicate => {
    for (const q of ['all', 'any', 'none'] as const) {
      const kids = (node as Record<string, unknown>)[q];
      if (Array.isArray(kids)) return { ...node, [q]: kids.map((k) => walk(k as Predicate)) } as Predicate;
    }
    const leaf = node as Record<string, unknown>;
    const field = typeof leaf.field === 'string' ? leaf.field : null;
    const decl = field && Object.hasOwn(schema.fields, field) ? schema.fields[field] : undefined;
    /* A `list<ref>` ELEMENT IS THE SAME ADDRESS, asked with `has` and `lacks`: the sentence reads
       `projects has things#1` through the same `resolve`, and the tree has to agree with it. */
    const listed = decl?.type === 'list' && decl.of === 'ref';
    if (!field || !decl || (decl.type !== 'ref' && !listed)) return node;
    const op = (listed ? (['has', 'lacks'] as const) : ADDRESSED).find((o) => o in leaf);
    if (!op) return node;
    const value = leaf[op];
    /* A LIST THAT IS NOT ONE STAYS AS IT CAME, for `compile` to refuse in its own words. */
    if ((op === 'in' || op === 'not_in') && !Array.isArray(value)) return node;
    const values = Array.isArray(value) ? value.flatMap((v) => one(field, decl.to, v)) : one(field, decl.to, value);
    /* THE LEAF'S OTHER KEYS GO WITH IT, `via` among them, so only the operator is rewritten. */
    const rest: Record<string, unknown> = { ...leaf };
    delete rest[op];
    const read = widened(field, op, values) as Record<string, unknown>;
    /* AND INTO EVERY BRANCH WHEN `has` WIDENED TO `any`. Returned bare, `{also has Kiln, via x}` over
       two Kilns lost its `via` and answered two rows, where over one Kiln it is refused
       `MATCH_OP_UNSUPPORTED`: a shared title turned a refused filter into an answer. */
    if (!('field' in read)) {
      const q = 'any' in read ? 'any' : 'all';
      return { [q]: (read[q] as Record<string, unknown>[]).map((kid) => ({ ...rest, ...kid })) } as Predicate;
    }
    return { ...rest, ...read } as Predicate;
  };

  return { predicate: walk(where), bad };
}

/** The operators that carry a day. `empty` and `present` carry a boolean and are left alone. */
const DATED = ['is', 'not', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte', 'before', 'after', 'between'] as const;

/**
 * The same resolution the sentence gets, for the predicate somebody wrote as JSON.
 *
 * `{ field: 'due', before: 'today' }` REACHED SQL AS THE WORD, and `'2026-…' < 'today'` is a string
 * comparison that is true of every date there has ever been — so the figure was the whole register
 * and looked like an answer. It is the clause that quietly matches everything, arrived at through
 * the one form of the grammar nobody was resolving.
 *
 * IT IS ALSO WHAT MAKES `asOf` MEAN ANYTHING HERE. Without it a backfilled month is thirty copies of
 * today's number, written down as history that never happened.
 */
function resolveRelative(
  where: Predicate | undefined,
  schema: Schema,
  nowMs: number,
): { predicate: Predicate | undefined; bad: Refusal[] } {
  if (!where || typeof where !== 'object') return { predicate: where, bad: [] };
  const bad: Refusal[] = [];

  const one = (field: string, value: unknown, instant: boolean): unknown => {
    if (typeof value !== 'string') return value;
    /* A FULL TIMESTAMP ON AN INSTANT IS ALREADY WHAT IT MEANS, and the compiler compares it whole.
       `resolveDay` reads days and refused it, so `{ field: at, after: '2020-01-01T00:00:00.000Z' }`
       on a declared `instant` was `RELATIVE_LITERAL_UNKNOWN` while the same bound on `created_at`,
       which this walk skipped, listed its rows (measured through `list` when `typeOf` came in, and
       `pages.test.ts` holds the `created_at` half). */
    if (instant && /^\d{4}-\d{2}-\d{2}T/u.test(value) && Number.isFinite(Date.parse(value))) return value;
    const day = resolveDay(value, nowMs);
    if (day === null) {
      /* `RELATIVE_LITERAL_UNKNOWN` — `30 §6`'s grammar family, *"a temporal literal outside the
         anchors and offsets"*, which is exactly what `resolveDay` reads and exactly what this
         string failed to be. It was `WHERE_MALFORMED`, a code in no registry, for the one fact
         `34 §1.1` names the anchors and offsets in order to make refusable. */
      bad.push({ code: 'RELATIVE_LITERAL_UNKNOWN', fix: `${field} is a date, and ${value} is not one.`, at: field });
      return value;
    }
    return day;
  };

  const walk = (node: Predicate): Predicate => {
    for (const q of ['all', 'any', 'none'] as const) {
      const kids = (node as Record<string, unknown>)[q];
      if (Array.isArray(kids)) return { ...node, [q]: kids.map((k) => walk(k as Predicate)) } as Predicate;
    }

    const leaf = node as Record<string, unknown>;
    const field = typeof leaf.field === 'string' ? leaf.field : null;
    /* AN `instant` IS A DATE HERE TOO, and it has to be: `before` and `after` are legal on both, and
       the sentence grammar resolves both to a plain day. Resolving only one of them meant a JSON
       predicate on an `instant` reached SQL as the word — and `'2026-09-15T…' < 'today'` is true of
       every instant there has ever been. Two renderings of one grammar, and they agree.

       `created_at` AND `updated_at` COUNT, through `typeOf`: asked of `schema.fields` alone,
       `{ field: created_at, after: '-30d' }` reached SQL holding `-30d` and read every row
       (`test/metrics-local-day-kernel.test.ts`), and once `endedAt` knew them it threw `Invalid time
       value` dating the word. */
    const type = field ? typeOf(schema, field) : undefined;
    if (!field || (type !== 'day' && type !== 'instant')) return node;

    const op = DATED.find((o) => o in leaf);
    if (!op) return node;
    const value = leaf[op];
    const instant = type === 'instant';
    return {
      ...leaf,
      [op]: Array.isArray(value) ? value.map((v) => one(field, v, instant)) : one(field, value, instant),
    } as Predicate;
  };

  return { predicate: walk(where), bad };
}

/**
 * Read one metric.
 *
 * The refusals come first and ALL of them come back, because a declaration with three things wrong
 * with it fixed one at a time is three round trips for whoever is writing it.
 */
export function evaluateMetric(sql: Sql, decl: MetricDecl, ctx: EvalContext): Result<Reading> {
  const refusals: Refusal[] = [];
  const at = (code: string, fix: string, key?: string): void => {
    refusals.push({ code, fix: `${decl.metric}: ${fix}`, ...(key === undefined ? {} : { at: key }) });
  };

  if (!decl.target) at('REQUIRED_MISSING', 'a number with no target is decoration', 'target');
  /* THE SHAPE OF THE TARGET, not only its presence. `{ lte: { amount, currency } }` compared with
     `<=` is neither true nor false, and it renders as a warn glyph over `NaN` with no refusal at
     all — which is precisely the class this file exists to prevent. */
  const bound = decl.target && ('lte' in decl.target ? decl.target.lte : decl.target.gte);
  /* A TARGET THAT NAMES A SETTING AND NO BOUND IS WAITING FOR A PERSON TO TYPE ONE, which is how a money ceiling ships:
     it has no verdict until then (`verdictOf`), and it is not malformed (`loop/finish/contracts.md` §7.5). */
  const shape = decl.target as { lte?: unknown; gte?: unknown; setting?: unknown } | undefined;
  const waiting = shape !== undefined && typeof shape.setting === 'string' && shape.lte === undefined && shape.gte === undefined;
  if (decl.target && typeof bound !== 'number' && !waiting)
    at('VALUE_MALFORMED', "target takes a number in the figure's own units: { lte: 400000 } for money in minor units", 'target');

  if (!decl.window) at('REQUIRED_MISSING', 'a number with no comparison window is a number you cannot act on', 'window');
  const shift = decl.window ? windowMs(decl.window) : null;
  if (decl.window && shift === null) at('VALUE_MALFORMED', `${decl.window} is not a window: write 30d, 4w or 3m`, 'window');

  /* CASH ROLLED FORWARD AND THE WALK AHEAD ARE READ IN THEIR OWN FILE (`money-figures.ts`), after the two keys every
     figure needs and before anything that assumes one aggregation over one list. */
  if (isRolled(decl.value) || isWalked(decl)) {
    if (refusals.length) return { ok: false, refusal: refusals[0]! };
    return isWalked(decl) ? readWalk(sql, decl, ctx) : readRolled(sql, decl, ctx);
  }

  const register = decl.source.startsWith('register.') ? decl.source.slice('register.'.length) : null;
  if (!register) at('SOURCE_UNKNOWN', `${decl.source} is not a register this build reads`, 'source');
  const schema = register ? ctx.schemaOf(register) : null;
  if (register && !schema) at('REGISTER_UNKNOWN', `there is no register called ${register}`, 'source');

  /* THE KEYS, NOT A SUBSTRING OF THE JSON. `includes('"trend"')` cannot tell a key from a value, so
     a register with a field called `trend` could never be summed — refused for being a shape this
     build does not read, which it was not. */
  /**
   * `NOT_IN_THIS_BUILD`, AND THE OLD NAME WAS THE PROBLEM RATHER THAN THE BRANCH.
   *
   * `UNIMPLEMENTED` names nothing: it does not say what is unimplemented, by whom, or what the
   * person holding it should do — it is a `fix` sentence with a shouty prefix, which is the exact
   * shape `30 §6` exists to stop. The three branches it stood in front of are all one fact, and it
   * is a fact worth a code: `08 §2.2` PUBLISHES eleven aggregations and this build computes six,
   * publishes `group_by` and `bucket` and reads neither. The declaration is well formed. The build
   * is behind. The repair is a deploy, not an edit.
   *
   * That is the same sentence `FORMAT_NEWER_THAN_READER` and `SCHEMA_NEWER` already say about a
   * version integer, which is why `30 §6` files the new code beside them in format and lifecycle
   * rather than inventing a family for it.
   *
   * AND IT IS NOT `VALUE_MALFORMED`, though the branch below uses that for a neighbouring failure.
   * `median` is a documented word; telling its author it is malformed sends them to check their
   * spelling of a thing they spelled correctly. `08 §2.2` is the document they read, and it says
   * `median` is real — so the record has to say *not here yet*, not *not a thing*.
   */
  for (const word of keysOf(decl.value))
    if ((UNREAD as readonly string[]).includes(word))
      at('NOT_IN_THIS_BUILD', `${word} is a published shape this build does not read, so its figure would be the ungrouped one`, 'value');

  /**
   * THE GROUPING, WHICH IS READ NOW, AND CHECKED AGAINST THE REGISTER IT GROUPS.
   *
   * `08 §2.1`'s rules: one field; a `bucket` only beside a day or an instant, and a day or an instant
   * only with one, because a bar per distinct date is a list rather than a chart. A ratio or a diff
   * of groups is a second dimension of arithmetic this build does not do, so it says so.
   */
  if (decl.group_by !== undefined) {
    const by = typeof decl.group_by === 'string' ? decl.group_by : null;
    const type = by && schema && Object.hasOwn(schema.fields, by) ? schema.fields[by]?.type : undefined;
    const dated = type === 'day' || type === 'instant';
    if (by === null) at('DECLARATION_INVALID', 'group_by is one field name', 'group_by');
    else if (schema && type === undefined) at('FIELD_UNKNOWN', `${register} has no field called ${by}`, 'group_by');
    else if (dated && decl.bucket === undefined) at('DECLARATION_INVALID', `${by} is a date, so group_by needs a bucket: day, week, month, quarter or year`, 'bucket');
    else if (!dated && schema && decl.bucket !== undefined) at('DECLARATION_INVALID', `a bucket cuts a date, and ${by} is a ${type}`, 'bucket');
    if (decl.bucket !== undefined && !isBucket(decl.bucket)) at('DECLARATION_INVALID', `${String(decl.bucket)} is not a bucket`, 'bucket');
    if ('ratio' in decl.value || 'diff' in decl.value)
      at('NOT_IN_THIS_BUILD', 'a ratio or a diff is not grouped in this build; group each half as its own figure', 'group_by');
  } else if (decl.bucket !== undefined) at('DECLARATION_INVALID', `buckets by ${String(decl.bucket)} and groups by nothing`, 'bucket');

  const fields = aggregationsOf(decl.value);
  if (fields.length === 0) at('VALUE_MALFORMED', 'a value is an aggregation, a ratio or a diff', 'value');
  if (schema)
    for (const f of fields) {
      for (const id of [f.field, f.by].filter((x): x is string => typeof x === 'string'))
        if (id !== 'id' && !Object.hasOwn(schema.fields, id)) at('FIELD_UNKNOWN', `${register} has no field called ${id}`, 'value');
      if (!AGGREGATIONS.includes(f.kind as (typeof AGGREGATIONS)[number]))
        at('NOT_IN_THIS_BUILD', `${f.kind} is not an aggregation this build reads`, 'value');
      if (f.lookup && !Object.hasOwn(tablesOf(decl), f.lookup)) at('LOOKUP_UNKNOWN', `there is no factor table called ${f.lookup}`, 'value');
      if (f.lookup && f.kind !== 'sum') at('NOT_IN_THIS_BUILD', `a product is summed, and ${f.kind} is not a sum`, 'value');
      const said = unaggregatable(f.kind, f.field, schema);
      if (said) at('VALUE_MALFORMED', said, 'value');
    }

  const said = schema ? resolvedOf(decl.where, schema, ctx) : { predicate: undefined, bad: [] };
  refusals.push(...said.bad);
  if (schema && said.predicate) refusals.push(...compile(said.predicate, schema).bad);

  /* THE PARAMETER'S OWN CLAUSES, RESOLVED THE SAME WAY THE WHOLE PREDICATE IS, because they are a
     subset of it and a subset read by a second grammar would be a second answer. Anything wrong
     with them is already wrong with `where`, so this adds no refusal a reader has not been given;
     it is here so that a `within` some future reader builds by hand cannot reach SQL unchecked. */
  const scope = schema && decl.within !== undefined ? resolvedOf(decl.within, schema, ctx) : { predicate: undefined, bad: [] };
  refusals.push(...scope.bad);
  if (schema && scope.predicate) refusals.push(...compile(scope.predicate, schema).bad);

  if (refusals.length || !schema) return { ok: false, refusal: refusals[0]! };

  /**
   * THE CURRENCY A MONEY FIGURE IS ADDED UP IN, AND IT IS THE ONE SOMEBODY CHOSE OR IT IS NONE.
   *
   * This was `held.home ?? declared`, and the fallback is the defect. A pack declares `money.GBP`
   * because a money figure must name a currency for its target to mean anything, and that is a fact
   * about the SEED and never about the record it lands on. Taking it as the currency to add up in
   * hands a record a currency nobody on it chose: `into: "GBP"` went out in every reading on a record
   * holding pounds Egyptian and dollars and no sterling at all.
   *
   * WHAT IT COST, MEASURED ON A RECORD WITH ONE CURRENCY AND NO HOME CURRENCY (`test/metrics.test.ts`,
   * two obligations of EGP 58,185.54):
   *
   *     into: home ?? declared   {"value":null,"unit":null,"parts":[{"currency":"EGP","amount":5818554}],"fx":{"into":"GBP","home":null}}
   *     into: home               {"value":5818554,"unit":"EGP","rows":2}
   *
   * A sum in a currency the figure is not added up in is read one currency at a time, so ONE currency
   * that was not the declared one came back as one part with no number. A part is how two currencies
   * are held apart, one of them is not two, and `value: null` costs the delta, the verdict, and the
   * row in `snapshots`, because the night skips a figure whose value is null (`index.ts:3538`). The
   * Ledger's night-by-night history therefore never started on a record whose one currency was not
   * the pack's.
   *
   * WHAT REPLACES IT IS NOT A LOUDER FALLBACK. A figure over rows in one currency is IN that currency
   * and says so in `unit`; the tile writes it from `unit` rather than from the format when the two
   * differ (`apps/web/src/lib/record/metrics.ts:1106`), and a target in the declared currency is
   * converted at the latest rate or has no verdict (`verdictOf`, through `targetFor`). Two currencies with no home
   * currency are parts, exactly as before, and now `into` is `null` there, which is the true answer to
   * "in which currency is this being added up": in none, because nobody has chosen one.
   */
  const declared = decl.format?.startsWith('money.') ? decl.format.slice('money.'.length) : null;
  const held = ctx.fx?.() ?? { home: null, rates: [] };
  const fx: Across = {
    into: held.home,
    home: held.home,
    rates: held.rates,
    /* The local day on a live read in a zone, as the predicate's `today` is (`clockOf`). */
    today: new Date(clockOf(ctx)).toISOString().slice(0, 10),
    day: dayFieldOf(schema.fields),
  };
  /**
   * AND UNDER `asOfMs` THE CURRENT WINDOW ENDS AT THE AS-OF DAY, as the window before ends at its own.
   *
   * A start with no end ends at the clock, and the clock the rows are compared against is the real
   * one, which under `asOfMs` is days or months later than the day asked about. `on after -30d` read
   * as of sixty days back counted every row dated after that day up to now: the audit
   * (`loop/research-batch-seventeen-audit.md` §3) measured 14,300,000 in four rows where the thirty
   * days to the as-of day hold 300,000 in two, and `snapshot` backfills every missing day this way.
   * `test/metrics-asof-end.test.ts` holds it. A live read is not given the end, because a live window
   * has always counted a row dated ahead of today and that is not what was wrong here.
   */
  const current = localInstants(
    ctx.asOfMs === undefined ? said.predicate : endedAt(said.predicate, null, schema, ctx.asOfMs),
    schema,
    ctx.tz,
  );
  const now = read(sql, current, schema, decl, tablesOf(decl), fx);
  if (!now.ok) return now;

  /**
   * AND THE FORMAT IS CHECKED AGAINST THE ROWS, WHICH IT WAS NOT.
   *
   * `format: money.USD` is a declaration about how to WRITE the figure and the rows are what it is a
   * figure OF. A `sum` of sterling invoices declared `money.USD` once came back as a plain number
   * with `unit: 'GBP'` and no refusal, and the renderers of the day formatted from `decl.format`, so
   * it reached a screen as USD 168,794.00 over rows that are in pounds. That is the worst class of
   * defect this file knows: a figure of the right size in the wrong currency, with nothing on the
   * screen disagreeing with anything else on it.
   *
   * ANOTHER CURRENCY IS NO LONGER WHAT THIS REFUSES, AND THE REASON IS THE LINE ABOVE. A record
   * without a home currency reads its money in the currency its rows are in, so `unit` is that
   * currency, the tile writes the figure from `unit` when it differs from the format
   * (`apps/web/src/lib/record/metrics.ts:1106`), and the target is converted or withheld
   * (`targetFor` below). Refusing there would blank every money tile on a record whose currency is
   * not the pack author's, which is a whole product going dark over a label. The declared code
   * loses; the figure does not.
   *
   * WHAT IS LEFT IS THE DISAGREEMENT NO RENDERER CAN RESCUE: a money format over rows that are not
   * money. A `quantity` of hours under `money.GBP` has `unit: 'h'`, and there is no amount of
   * sterling that is three hours. It went through this branch before by accident, because the
   * declared currency stood in for the currency to add up in and `'GBP' !== 'h'` was true.
   *
   * SO THE DECLARATION IS ASKED AND NOT THE SPELLING (`isMoneyFigure`). The first repair written
   * here tested `!isCurrencyUnit(unit)`, which is three upper-case letters, and this file says one
   * function away why that regex cannot do this job: `mixedUnits` takes `money = false` from the
   * quantity arm precisely so that `KGS` against `LBS` stay units. Driven with the regex in this
   * condition, a `sum` of a `quantity` field over two rows in `KGS` declared `money.GBP` answered
   *
   *     {"value":7,"unit":"KGS","rows":2}
   *
   * a weight read as money with no refusal, where the same rows in `h` still refused. The declared
   * type of the field the figure aggregates is in scope here, and it is the only thing that knows.
   *
   * `money` WITH NO CURRENCY IS THE SAME CLAIM, that the figure is money, and it is held to the same check.
   */
  if (isMoneyFormat(decl.format) && now.value.unit && !isMoneyFigure(schema, decl.value))
    return no<Reading>(
      'MIXED_CURRENCY',
      `${decl.metric}: the rows are in ${now.value.unit} and the format says ${declared ?? 'money'}.`,
      { at: 'format', allowed: [now.value.unit] },
    );

  /* THE COMPARISON IS THE SAME PREDICATE AGAINST A MOVED CLOCK, which is why a predicate with no
     dated clause compares a set with itself: the delta is then structurally zero, and reporting that
     as "no change" would be a fact about the arithmetic dressed as a fact about the business. */
  let delta: number | null = null;
  let why = '';
  if (decl.compare === 'none' || shift === null) why = 'no comparison asked for';
  else if (shift < 7 * DAY) why = 'a window under seven days is noise';
  else {
    /* THE COMPARISON IS THE SAME SENTENCE AGAINST A MOVED CLOCK. `due before today` resolves to a
       different day when `now` moves back a month, which is what makes the two windows different
       sets — and a predicate with no dated clause resolves to the SAME tree, which is how the
       structural check below knows the window moves nothing. */
    /* AND HOW FAR THE CLOCK MOVES IS THE WHOLE OF THE DIFFERENCE BETWEEN THE TWO WORDS. `previous`
       moves it by the declared window and `year_ago` by a year, which is what each of them says.
       This line was `ctx.nowMs - shift` for both, so the two words named one figure and only one of
       the two labels above it was true. `yearBefore` carries the argument for what a year is. */
    /* AND IT MOVES FROM THE CLOCK THE CURRENT WINDOW WAS READ AT, WHICH UNDER `asOfMs` IS NOT `nowMs`.
       This moved `ctx.nowMs` and handed the result over as `nowMs`, but `predicateOf` reads
       `asOfMs ?? nowMs`, so under `asOfMs` the moved clock was never looked at: the window before was
       the current predicate again, and a comparison read sixty days back over a doubled month came
       back `delta: null`, "the predicate does not mention time", where the same rows read live on
       that day say `delta: 1` (`test/metrics-asof.test.ts`). The moved clock goes in as `asOfMs`,
       the one field `predicateOf` reads first, so it is honoured whether or not the caller set one. */
    const anchor = clockOf(ctx);
    const moveTo = decl.compare === 'year_ago' ? yearBefore(anchor) : anchor - shift;
    const shifted = resolvedOf(decl.where, schema, { ...ctx, asOfMs: moveTo });
    const moved = JSON.stringify(shifted.predicate) !== JSON.stringify(said.predicate);
    /* AND THE WINDOW BEFORE ENDS WHERE ITS CLOCK IS. `moved` above is asked of the predicate as
       written, because a clause this adds is not a sign the declaration mentions time; `endedAt`
       carries the measurement for why the end has to be written in. */
    const before = read(sql, localInstants(endedAt(shifted.predicate, said.predicate, schema, moveTo), schema, ctx.tz), schema, decl, tablesOf(decl), fx);

    if (!before.ok) why = fixOf(before);
    else if (!moved) {
      /* A SET COMPARED WITH ITSELF IS NOT NO CHANGE. The delta would be structurally zero, and
         reporting that as "steady" is a fact about the arithmetic dressed as a fact about the
         business — which is worse than saying nothing, because somebody would act on it. */
      why = 'the predicate does not mention time, so the window moves nothing';
    } else if (now.value.rows === 0 || before.value.rows === 0) why = 'one of the two windows is empty';
    else if (before.value.rows * 2 < now.value.rows) why = 'the window before has under half the rows';
    else if (before.value.value === null || now.value.value === null || before.value.value === 0)
      why = 'the window before has nothing to compare against';
    else delta = deltaFrom(before.value.value, now.value.value);
  }

  const grouped = decl.group_by === undefined ? null : groupsOf(sql, current, schema, decl, ctx, fx);
  if (grouped && !grouped.ok) return grouped;

  const { met, targetIn } = verdictOf(decl, now.value.value, now.value.unit, fx.rates, fx.today);
  /* ONE MORE `count(*)` ON A TABLE THIS FIGURE HAS ALREADY COUNTED ONCE, and it is counted here
     rather than inside a scan because it is a fact about the scope and not about an aggregation:
     the comparison window, the two halves of a ratio and every group are all the same rows under a
     narrower predicate, so each of them reading it would be the same query several times over. */
  return ok({
    ...now.value,
    held: heldBy(sql, schema, scope.predicate),
    delta,
    why,
    met,
    ...(targetIn ? { targetIn } : {}),
    ...(grouped ? grouped.value : {}),
  });
}

/** The order a grouping by a word draws in: the largest part first, then the key. Exported for the browser's reader. */
export const largestFirst = (a: Group, b: Group): number =>
  (b.value ?? -Infinity) - (a.value ?? -Infinity) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/**
 * A figure read once per group, each part by the same aggregation over the same predicate.
 *
 * EACH PART IS THE WHOLE QUERY WITH ONE MORE CLAUSE, rather than a second implementation of summing
 * with a `GROUP BY` in it: a part then refuses a second currency, a missing factor and a day summed
 * as a number exactly as the whole does, because it is the same code.
 *
 * A DATE IS CUT INTO BUCKETS by `buckets.ts`, which the browser's reader imports, so a bar labelled
 * June holds the same rows in both engines. Every bucket between the first and the last that hold a
 * row is returned, and one nothing fell in is `empty` with no value: a gap, never a zero.
 */
function groupsOf(
  sql: Sql,
  predicate: Predicate | undefined,
  schema: Schema,
  decl: MetricDecl,
  ctx: EvalContext,
  fx?: Across,
): Result<Pick<Reading, 'groups' | 'current' | 'more'>> {
  const w = compile(predicate, schema);
  if (w.bad.length) return { ok: false, refusal: w.bad[0]! };
  const by = decl.group_by!;
  const where = `register = ? AND deleted_at IS NULL AND ${w.sql}`;
  const params: (string | number)[] = [schema.register, ...w.params];
  const field = `json_extract(fields, '${jsonPath(by)}')`;
  const tables = tablesOf(decl);
  const value = decl.value as Aggregation;

  const units = new Map<string, string | null>();
  const part = (key: string, clause: string, more: (string | number)[]): Result<{ value: number | null; rows: number; parts?: Part[] }> => {
    const got = one(sql, schema, value, `${where} AND ${clause}`, [...params, ...more], tables, fx);
    if (!got.ok) return got;
    units.set(key, got.value.unit);
    return ok({ value: got.value.rows === 0 ? null : got.value.value, rows: got.value.rows, ...(got.value.parts ? { parts: got.value.parts } : {}) });
  };
  /**
   * ONE PART IN PARTS PUTS EVERY PART IN PARTS. A month in one currency beside a month in two is still a
   * figure with no single unit, so its amount is said as the one currency it is in, never as a bare
   * number beside the others.
   *
   * AND SO DOES ONE CURRENCY BESIDE ANOTHER, WHICH IS THE INVARIANT THE SENTENCE ABOVE ALREADY CLAIMED
   * AND THE CODE STOPPED KEEPING. It asked whether some group already HELD parts, and a group holds
   * parts only when its OWN rows are in two currencies. The day `into` stopped falling back to the
   * declared format (`evaluateMetric`), no group on a record with no home currency came back in parts
   * again: each group is in one currency, so `across` answers `one`. Measured on three obligations in
   * EGP and USD, no home currency, grouped by party:
   *
   *     before   [{Landlord, parts:[EGP 5,200,000]}, {Utility, parts:[EGP 618,554]}, {Bank, parts:[USD 340,000]}]
   *     after    [{"key":"Landlord","value":5200000},{"key":"Utility","value":618554},{"key":"Bank","value":340000}]
   *
   * The tile above refuses to add two currencies and the bars under it added them anyway: `largestFirst`
   * ranked E£52,000.00 over $3,400.00 on the raw minor units, on a chart with no currency drawn anywhere
   * on it. So the question is the one the `units` map can answer, how many currencies the groups hold
   * BETWEEN them. A group that is ALREADY in parts is not one of them: `one` hands such a group back
   * with `unit: null`, so it is filtered out of the tally, and the old test for it is kept as the
   * second half of the condition rather than folded into the count.
   *
   * AND ONLY FOR A FIGURE OF MONEY (`isMoneyFigure`), because a part carries a `currency`: a `quantity`
   * grouped by its unit would otherwise write `h` and `kg` into a currency field, and the refusals for
   * two units in one figure are `aggregate`'s, not this one's.
   *
   * THAT GUARD IS A BELT AND NOT A REPAIR, AND IT IS SAID HERE BECAUSE NO TEST CAN DRIVE IT. Deleting
   * it leaves all 1,007 tests in this package green, which is the state the `mixedUnits` note two
   * hundred lines down calls out as the reason to distrust a claim. Driven rather than read: the
   * ungrouped figure is read over the SAME predicate as the groups, so two units between the groups
   * are two units in that figure, and `{ ...MEASURED, group_by: 'what' }` over rows in `h` and `d`
   * answered `QUANTITY_MIXED_UNIT` from `evaluateMetric` and never reached this function at all. One
   * unit between them makes `held.size` one and the condition moot. So the guard cannot fire today,
   * and it is kept because the day a grouping is read under a predicate the figure above it is not,
   * the alternative is a unit written into a currency field.
   */
  const money = isMoneyFigure(schema, decl.value);
  const inParts = (groups: Group[]): Group[] => {
    const held = new Set([...units.values()].filter((u): u is string => u !== null));
    if (!money || (held.size < 2 && !groups.some((g) => g.parts))) return groups;
    return groups.map((g) => {
      const unit = units.get(g.key);
      return g.parts || g.value === null || !unit ? { ...g, value: null } : { ...g, value: null, parts: [{ currency: unit, amount: g.value }] };
    });
  };

  if (decl.bucket !== undefined) {
    const bucket = decl.bucket;
    const day = `substr(${field}, 1, 10)`;
    const days = sql.all<{ d: string }>(`SELECT DISTINCT ${day} AS d FROM entry WHERE ${where} AND ${field} IS NOT NULL ORDER BY d`, ...params);
    /* FROM `clockOf`, THE CLOCK THE WORDS WERE NAMED FROM. This read `asOfMs ?? nowMs`, so in
       `Asia/Tokyo` at 00:05 on the 6th a live `on after -3d` named `today` the 6th and marked the
       5th as the bucket the clock is in (`test/metrics-live-local-day.test.ts`). */
    const current = bucketOf(new Date(clockOf(ctx)).toISOString(), bucket)!;
    const keys = [...new Set(days.map((r) => bucketOf(String(r.d), bucket)).filter((k): k is string => k !== null))].sort();
    if (keys.length === 0) return ok({ groups: [], current, more: 0 });
    /* TO THE BUCKET THE CLOCK IS IN AT LEAST, so a month since the last row reads as the gap it is. */
    const last = keys.at(-1)! > current ? keys.at(-1)! : current;
    const run = bucketRun(keys[0]!, last, bucket, GROUP_CAP);
    const groups: Group[] = [];
    for (const key of run.keys) {
      const got = part(key, `${day} >= ? AND ${day} < ?`, [bucketStart(key, bucket), bucketStart(nextBucket(key, bucket), bucket)]);
      if (!got.ok) return got;
      groups.push({ key, ...got.value, state: bucketState(key, got.value.rows, current, key === run.keys[0] && run.more === 0) });
    }
    return ok({ groups: inParts(groups), current, more: run.more });
  }

  /* THE LARGEST FIRST, the key breaking a tie, and past fifty the rest are counted rather than drawn
     (`45 §5.8`). Every part is read before the cut, because which fifty are largest is the question. */
  const values = sql.all<{ v: string | number }>(`SELECT DISTINCT ${field} AS v FROM entry WHERE ${where} AND ${field} IS NOT NULL`, ...params);
  const groups: Group[] = [];
  for (const { v } of values) {
    const got = part(String(v), `${field} = ?`, [v]);
    if (!got.ok) return got;
    groups.push({ key: String(v), ...got.value, state: 'full' });
  }
  groups.splice(0, groups.length, ...inParts(groups));
  groups.sort(largestFirst);
  return ok({ groups: groups.slice(0, GROUP_CAP), more: Math.max(0, groups.length - GROUP_CAP) });
}

/**
 * A bucket's state (`08 §2.4`): `empty` when nothing fell in it, `partial` when it is not finished or the data began
 * inside it, `full` otherwise.
 *
 * THE FIRST BUCKET IS WHERE THE DATA BEGAN, so it holds only the days after the first row or after the window's own
 * edge, and a bar for it is not a month like the others. Past the cap the first bucket drawn is not where the data
 * began, so it is full.
 */
export const bucketState = (key: string, rows: number, current: string, first: boolean): Group['state'] =>
  rows === 0 ? 'empty' : key >= current || first ? 'partial' : 'full';

/** Does the figure clear its target? A target is a bound, and `met` is a fact about one number. */
export const meets = (value: number, target: { lte: number } | { gte: number }): boolean =>
  'lte' in target ? value <= target.lte : value >= target.gte;

/* ── the scan ────────────────────────────────────────────────────────────── */

/**
 * What one scan answers.
 *
 * `held` IS NOT HERE BECAUSE A SCAN CANNOT KNOW IT. Every scan in this file is already inside the
 * predicate, and `held` is the count of the rows the predicate chose from, so it belongs to the
 * scope rather than to the aggregation: reading it per scan would have each half of a ratio and
 * each bucket of a grouped figure answer the same number over again, once per query.
 */
type Read = Omit<Reading, 'delta' | 'why' | 'met' | 'held'>;

/**
 * The rows the predicate chose from: the register, less what is deleted, and inside the parameter's
 * own clauses when the figure has one.
 *
 * THE SAME TWO CLAUSES EVERY SCAN BELOW OPENS WITH, and a third only for a parameter. `deleted_at IS
 * NULL` is in because a deleted row is held by nobody and a tile counting it would say the register
 * has something in it when it has not. The clock is out because `asOf` moves the PREDICATE and never
 * the rows (`EvalContext`), so a snapshot of last Tuesday is last Tuesday's question over today's
 * scope.
 *
 * `within` IS THE THIRD, AND IT IS NOT THE FILTER. It holds only the clauses a parameter filled
 * (`MetricDecl.within`), so `project-owed:Kiln` counts Kiln's obligations and `state is open` still
 * stands between this number and `rows`. `compile(undefined, …)` answers `1 = 1`, so a figure with
 * no parameter asks the same question it always did.
 */
const heldBy = (sql: Sql, schema: Schema, within: Predicate | undefined): number => {
  const w = compile(within, schema);
  return Number(
    sql.one<{ n: number }>(
      `SELECT count(*) AS n FROM entry WHERE register = ? AND deleted_at IS NULL AND ${w.sql}`,
      schema.register,
      ...w.params,
    )?.n ?? 0,
  );
};

/**
 * The mark a mixed-unit refusal gives a row that carries no unit at all.
 *
 * Spelled once here because it was spelled four times, and the day the sample said `no currency` a
 * live record said `no unit` about the same two rows. The web held two of those copies and holds one:
 * `apps/web/src/lib/record/money.ts` declares `BARE` and its `metrics.ts` re-exports it rather than
 * declaring its own, which `bare-unit.test.ts` asserts by importing the two names and then reading
 * the web's `metrics.ts`, because an equality holds right up until somebody edits one of two
 * declarations. So the string is written twice in the tree, here and there, because this one is
 * module-private and `index.ts` re-exports no such name; that same test reads the line below out of
 * this file and pins it to the web's value, which is the gap it exists to hold. It is a UNIT and not a
 * CURRENCY because the set it joins is units, one of which happens to be money: `GBP and no unit`
 * is a list of two units, `GBP and no currency` is a list with a hole in it.
 */
const BARE_UNIT = 'no unit';

/**
 * A CURRENCY IS THREE UPPER-CASE LETTERS, which is ISO 4217 and is what `money` stores in its
 * `currency` half. A `quantity` stores `h`, `d`, `kg`, and a duration stores nothing.
 */
const isCurrencyUnit = (unit: string | null | undefined): unit is string =>
  typeof unit === 'string' && /^[A-Z]{3}$/u.test(unit);

/**
 * IS THIS A FIGURE OF MONEY? THE DECLARATION ANSWERS, BECAUSE THE UNIT THAT CAME BACK CANNOT.
 *
 * `isCurrencyUnit` above is the spelling and this is the question. `KGS` and `LBS` are three
 * upper-case letters and are not ISO 4217, which is why `mixedUnits` is handed `money = false` by the
 * quantity arm; asking the regex instead let a `sum` of a `quantity` field over two rows in `KGS`
 * pass under `format: 'money.GBP'` as `{"value":7,"unit":"KGS"}` with no refusal.
 *
 * `some` AND NOT `every`, and that is the one line of it worth arguing about. A rate takes its
 * currency from one half: `sum(balance) / count(id)` is an average balance in the currency of the
 * balances, and `id` is not a declared field at all, so `every` would refuse the average invoice size
 * the `ratio` arm was widened to allow (`engines.test.ts`'s `cash-each`). A half that is money is
 * what makes a currency a possible answer; `rateUnit` and the mixed-unit checks decide the rest.
 */
const isMoneyFigure = (schema: Schema, value: Value): boolean =>
  aggregationsOf(value).some((f) => schema.fields[f.field]?.type === 'money');

/**
 * THE LIST OF UNITS A MIXED-UNIT REFUSAL NAMES, AND THE WORD FOR HOW MANY OF THEM THERE ARE, decided
 * together and in one place.
 *
 * TWO SENTENCES SAID "CURRENCIES" ABOUT SETS THAT HELD NO CURRENCY, and both were driven before this
 * function existed. A `diff` of one `quantity` field in `h` against another in `kg`:
 *
 *   MIXED_CURRENCY  one half of this figure is in h and the other in kg, and two currencies are
 *                   never subtracted either
 *
 * and a `money` column holding one row that had lost its currency:
 *
 *   MIXED_CURRENCY  these rows are in no unit and GBP, and two currencies are never added
 *
 * One currency named, two claimed, and the reader sent looking for a second currency in a figure
 * measured in hours. The `added` arm had already been given a second code and a second sentence for
 * exactly this, and chose between them on the FIELD'S DECLARED TYPE, which is not what the rows
 * turned out to hold.
 *
 * THE `ratio` SENTENCE WAS NOT ONE OF THE TWO, said here because an audit counted it as a third.
 * That arm is reached only when both halves match the regex, so it is about two currencies whenever
 * it speaks at all. The `?? 'no unit'` in both pair sentences is unreachable for the same reason: the
 * `diff` arm needs both units non-empty and the `ratio` arm needs both to be codes. They keep the
 * fallback so the mark is spelled in one place and not so that it prints.
 *
 * SO THE WORD FOLLOWS THE SET AND THE CODE FOLLOWS THE FIELD. `04 §5` gives `MIXED_CURRENCY` and
 * `QUANTITY_MIXED_UNIT` separate rows, so an agent branching on the code still learns which kind of
 * aggregation refused; what a person reads is about the units in front of them. `money` is passed
 * `false` by the `quantity` arm so that two units spelled like currency codes, `KGS` against `LBS`,
 * are still units: the regex cannot tell those apart and the declaration can.
 *
 * AND THE UNITLESS MARK GOES LAST, because SQLite's `ORDER BY u` puts `NULL` first and *"these rows
 * are in no unit and GBP"* opens on the exception. That was the second half of the divergence with
 * the browser and nobody had noticed it: the mirror's set arrives alphabetically sorted, so it said
 * *"GBP and no unit"* about rows this called *"no unit and GBP"*. The mirror now names its units first
 * as well, so the two agree by the same rule rather than by where a sort happened to put a word.
 */
function mixedUnits(units: readonly (string | null | undefined)[], money = true): { said: string; word: string } {
  const named = units.filter((u): u is string => typeof u === 'string' && u !== '');
  const bare = named.length < units.length;
  return {
    said: [...named, ...(bare ? [BARE_UNIT] : [])].join(' and '),
    word: money && units.every(isCurrencyUnit) ? 'currencies' : 'units',
  };
}

function read(
  sql: Sql,
  predicate: Predicate | undefined,
  schema: Schema,
  decl: MetricDecl,
  lookups?: Record<string, Record<string, number>> | undefined,
  fx?: Across,
): Result<Read> {
  const w = compile(predicate, schema);
  if (w.bad.length) return { ok: false, refusal: w.bad[0]! };

  const where = `register = ? AND deleted_at IS NULL AND ${w.sql}`;
  const params: (string | number)[] = [schema.register, ...w.params];

  if ('ratio' in decl.value || 'diff' in decl.value) {
    /* HOISTED SO THE REFUSAL BELOW READS ITS CODE FROM A CONSTRUCTOR AND NOT FROM A TERNARY WHOSE
       CONDITION HOLDS A QUOTE: `refusals.mjs` cannot cross one, and would count neither code.
       The narrowing has to stay inline, because `'ratio' in decl.value` is what tells the type
       checker which half of the union it is holding, and a boolean does not carry that. */
    const ratio = 'ratio' in decl.value;
    const pair = 'ratio' in decl.value ? decl.value.ratio : decl.value.diff;
    const of = one(sql, schema, pair.of, where, params, lookups, fx);
    const per = one(sql, schema, pair.per, where, params, lookups, fx);
    if (!of.ok) return of;
    if (!per.ok) return per;
    /* A HALF IN PARTS, OR TWO HALVES IN TWO CURRENCIES, IS THE FIGURE ONCE PER CURRENCY: each half read again over the rows
       in that currency, unconverted, and subtracted or divided there (`fx.ts` `pairParts`). A converted pair is in one
       currency by now and falls through to the arithmetic below. */
    const code = (u: string | null | undefined): u is string => typeof u === 'string' && /^[A-Z]{3}$/u.test(u);
    const apart = Boolean(of.value.parts || per.value.parts) || (code(of.value.unit) && code(per.value.unit) && of.value.unit !== per.value.unit);
    if (apart) {
      const currencies = [of.value, per.value].flatMap((h) => h.parts?.map((p) => p.currency) ?? (code(h.unit) ? [h.unit] : []));
      const ofField = moneyFieldOf(schema, pair.of);
      const perField = moneyFieldOf(schema, pair.per);
      const inCurrency = (agg: Aggregation, field: string | null, currency: string): number | null => {
        if (field === null) return null;
        const got = one(sql, schema, agg, `${where} AND json_extract(fields, '${jsonPath(field)}.currency') = ?`, [...params, currency], lookups);
        return got.ok ? got.value.value : null;
      };
      const parts = pairParts(currencies, ratio, (c) => ({ of: inCurrency(pair.of, ofField ?? perField, c), per: inCurrency(pair.per, perField ?? ofField, c) }));
      const said = fxOfPair(fx, of.value.fx, per.value.fx, false);
      if (parts.length) return ok({ value: null, unit: null, rows: of.value.rows, refusals: [], parts, ...(said ? { fx: said } : fx ? { fx: { into: fx.into, home: fx.home, asOf: null, forward: false, stale: false, missing: [] } } : {}) });
    }
    /* A HALF IN PARTS WITH NO CURRENCY BOTH HALVES ARE IN is not one number, and it says which currencies. */
    const split = of.value.parts ?? per.value.parts;
    if (split)
      return no<Read>(
        'MIXED_CURRENCY',
        `one half of this figure is in ${split.map((p) => p.currency).join(' and ')}, and two currencies are never subtracted or divided without a rate`,
        { at: 'value' },
      );
    /* AND THE TWO HALVES AGAINST EACH OTHER. Each was checked for a mixed currency INSIDE itself and
       neither against the other, so GBP − USD came out as a number labelled GBP — the same failure
       this file's header is written against, arrived at through the guard against it. */
    /**
     * A RATIO OF TWO DIFFERENT UNITS IS A RATE, AND ONLY A DIFF NEEDS THEM TO MATCH.
     *
     * This refused both, so `cost per hour` and `average invoice size` were refused as mixed
     * currencies: GBP over hours, GBP over a count. Dividing one unit by another is the entire
     * point of a rate, and refusing it took a whole family of ordinary figures off the table.
     *
     * `04 §5` NAMES THE CASE PRECISELY and it is narrower than the check was: *"a `ratio` of two
     * different CURRENCIES"*, with the repair *"revenue is USD, spend is EGP. Name an fx source, or
     * scope the predicate to one currency"*. Two currencies, not two units, because GBP over USD is
     * a number with no meaning and GBP over hours is a rate.
     *
     * A DIFF STILL NEEDS THEM EQUAL, whatever they are: subtracting hours from pounds is not a
     * quantity that exists, and that is what the check was written for.
     *
     * A CURRENCY IS THREE UPPER-CASE LETTERS (`isCurrencyUnit`), which is ISO 4217 and is what
     * `money` stores in its `currency` half. A `quantity` stores `h`, `d`, `m`, so the test is on the
     * value rather than on a type that would have to be threaded down through two aggregations to get
     * here. It cannot tell `KGS` from a currency, and the `added` arm below, which does have the
     * declared type, is told not to trust it for that reason.
     */
    /**
     * AND A HALF THAT READ NOTHING HAS NO UNIT, WHICH IS NOT A DIFFERENT UNIT.
     *
     * A sum over no rows is zero and its unit is `null`, because there was nothing to take a unit
     * from. `'GBP' !== null` is true, so `sum(received) - sum(paid)` refused `MIXED_CURRENCY` on any
     * record that had received money and not yet paid any: the tile read *"one half of this figure
     * is in GBP and the other in no unit"* instead of the figure, and it repaired itself the day
     * somebody entered a bill. A money tile that is broken only while a register is young is broken
     * for exactly the people who have just arrived.
     *
     * SUBTRACTING NOTHING FROM POUNDS IS POUNDS. What the check is for is subtracting hours from
     * pounds, and that needs two units to be wrong about.
     */
    const said = (u: string | null | undefined) => typeof u === 'string' && u !== '';
    const clash = ratio
      ? isCurrencyUnit(of.value.unit) && isCurrencyUnit(per.value.unit) && of.value.unit !== per.value.unit
      : said(of.value.unit) && said(per.value.unit) && of.value.unit !== per.value.unit;
    /* WHAT TWO OF THEM ARE CALLED, FROM `mixedUnits` AND NOT FROM THIS SENTENCE. The `ratio` arm
       reaches here only when both halves ARE currencies, so its word does not move; the `diff` arm
       reaches here on any two units that differ, and said "currencies" about hours against kilograms
       until this line. Only the word is taken: these two sentences name their halves one at a time
       rather than as a list, so the list is built here. */
    const two = mixedUnits([of.value.unit, per.value.unit]).word;
    if (clash)
      /* `RATIO_MIXED_CURRENCY` FOR A RATIO, AND `MIXED_CURRENCY` FOR A DIFF, because `04 §5` gives
         them separate rows with separate sentences: the ratio's is *"revenue is USD, spend is EGP.
         Name an fx source, or scope the predicate to one currency"*, and the plain one is about a
         mixed-currency AGGREGATION. Both arms said `MIXED_CURRENCY`, so a code the specification
         publishes was emitted by nothing and an agent branching on it could not tell a division of
         two currencies from a sum across three. `30 §6` counts a code nothing emits, which is how
         this was found. */
      /* THE CONDITION IS HOISTED SO THE CODE SITS AFTER THE CONSTRUCTOR. `refusals.mjs` reads an
         emitted code as a quoted literal after `no(`, crossing at most a ternary condition that
         holds no quote of its own, and it says why in its own header: a pattern that chewed through
         a whole file looking for an upper-case string would start reporting enum values as refusal
         codes. `'ratio' in decl.value` inline would put a quote in that condition and hide both
         codes from the gate that counts them. */
      return ratio
        ? no<Read>(
            'RATIO_MIXED_CURRENCY',
            `one half of this figure is in ${of.value.unit ?? BARE_UNIT} and the other in ${per.value.unit ?? BARE_UNIT}, and two ${two} are never divided either`,
            { at: 'value' },
          )
        : no<Read>(
            'MIXED_CURRENCY',
            `one half of this figure is in ${of.value.unit ?? BARE_UNIT} and the other in ${per.value.unit ?? BARE_UNIT}, and two ${two} are never subtracted either`,
            { at: 'value' },
          );

    const a = of.value.value;
    const b = per.value.value;
    /* A ZERO DENOMINATOR IS NOT A NUMBER. Never `0`, never infinity, never `NaN` — the em dash, and
       the numerator is still on the row behind it. */
    const value = a === null || b === null ? null : 'ratio' in decl.value ? (b === 0 ? null : a / b) : a - b;
    /* EITHER HALF'S UNIT, because the two agree or the check above refused. It was the first half's,
       so nothing received less GBP 50.00 paid read a bare -5000 with no currency. */
    const converted = fxOfPair(fx, of.value.fx, per.value.fx, true);
    return ok({ value, unit: 'ratio' in decl.value ? rateUnit(of.value.unit, per.value.unit) : (of.value.unit ?? per.value.unit), rows: of.value.rows, refusals: [], ...(converted ? { fx: converted } : {}) });
  }

  return one(sql, schema, decl.value, where, params, lookups, fx);
}

/** One aggregation, as one SELECT. Money groups by currency; everything else is a scalar. */
function one(
  sql: Sql,
  schema: Schema,
  agg: Aggregation,
  where: string,
  params: (string | number)[],
  lookups?: Record<string, Record<string, number>> | undefined,
  fx?: Across,
): Result<Read> {
  const [kind, operand] = Object.entries(agg)[0] as [string, string | Product];
  const product = typeof operand === 'object' && operand !== null ? operand.product : null;
  const field = product ? product[0] : (operand as string);
  const rows = Number(sql.one<{ n: number }>(`SELECT count(*) AS n FROM entry WHERE ${where}`, ...params)?.n ?? 0);

  if (kind === 'count')
    return ok({
      value:
        field === 'id'
          ? rows
          : Number(
              sql.one<{ n: number }>(
                `SELECT count(*) AS n FROM entry WHERE ${where} AND json_extract(fields, ?) IS NOT NULL`,
                ...params,
                jsonPath(field),
              )?.n ?? 0,
            ),
      unit: null,
      rows,
      refusals: [],
    });

  const type = schema.fields[field]?.type ?? 'text';
  const expr = `json_extract(fields, '${jsonPath(field)}${type === 'money' ? '.amount' : type === 'quantity' ? '.value' : ''}')`;

  if (kind === 'distinct') {
    /* THE PAIR, NOT THE NUMBER. `count(DISTINCT amount)` over GBP 50, USD 50 and EUR 50 answered
       ONE — three different sums of money counted as the same one — because the currency was
       dropped on the way in. `sum` over the same rows refuses `MIXED_CURRENCY`; this quietly
       agreed with itself. A quantity has the same shape and the same hazard. */
    const unit = type === 'money' ? '.currency' : type === 'quantity' ? '.unit' : null;
    const key = unit ? `${expr} || '|' || json_extract(fields, '${jsonPath(field)}${unit}')` : expr;
    return ok({
      value: Number(sql.one<{ n: number }>(`SELECT count(DISTINCT ${key}) AS n FROM entry WHERE ${where}`, ...params)?.n ?? 0),
      unit: null,
      rows,
      refusals: [],
    });
  }

  const fn = kind === 'sum' ? 'sum' : kind === 'avg' ? 'avg' : kind === 'min' ? 'min' : 'max';

  /* THE FACTOR IS PART OF THE ROW, so the multiplication happens before the sum and inside SQL. A
     CASE over the named table rather than a join, because the table is a handful of constants a
     declaration wrote down — and a row whose `by` value the table does not know is EXCLUDED and
     named, never multiplied by one. Factor one is the answer that made this 9.25 times too low. */
  if (product) {
    const table = lookups?.[product[1].lookup] ?? {};
    const byExpr = `json_extract(fields, '${jsonPath(product[1].by)}')`;
    const marks = Object.keys(table).map(() => '?').join(', ') || 'NULL';
    const missing = sql
      .all<{ v: string | null }>(
        `SELECT DISTINCT ${byExpr} AS v FROM entry WHERE ${where} AND ${expr} IS NOT NULL AND (${byExpr} IS NULL OR ${byExpr} NOT IN (${marks}))`,
        ...params,
        ...Object.keys(table),
      )
      .map((r) => r.v ?? '(unset)');
    /* TWO LOOKUP CODES, AND `30 §6` NOW CARRIES BOTH, because they are two repairs rather than two
       spellings. `LOOKUP_UNKNOWN` above says the declaration named a factor table nobody declared —
       fix the name. `LOOKUP_MISSING` says the table is right and does not cover the data — add a
       factor for `yearly`, and the `allowed` list says which ones it does cover. Collapsing them
       would hand one sentence to two different people. */
    if (missing.length)
      return no<Read>(
        'LOOKUP_MISSING',
        `${product[1].lookup} has no factor for ${missing.join(', ')}, and a row multiplied by one is a wrong number rather than a missing one.`,
        { at: product[1].by, allowed: Object.keys(table) },
      );

    /* SINGLE-QUOTED AND DOUBLED, because SQLite reads a double-quoted word as an IDENTIFIER — so
       `WHEN "monthly"` is a column that does not exist rather than the string it looks like. The
       keys come from a declaration, so the quote is escaped rather than assumed absent. */
    const cases = Object.entries(table)
      .map(([k, v]) => `WHEN '${k.replaceAll("'", "''")}' THEN ${Number(v)}`)
      .join(' ');
    /* ROUNDED PER ROW, because minor units are integers: a half-penny that survives the sum is a
       total that does not match the rows it is a total of. */
    const times = `CAST(round(${expr} * (CASE ${byExpr} ${cases} ELSE NULL END)) AS INTEGER)`;
    return aggregate(sql, field, type, times, where, params, kind, 'sum', undefined, fx);
  }

  /* MONEY AND QUANTITY CARRY THEIR UNIT INTO THE GROUP BY. The rule is one line — two currencies are
     never added — and this is the line that would have added them: one SUM over a column of amounts
     is a figure of the right size in whatever unit happened to be commonest. */
  /* AN AVERAGE DAY IS AVERAGED AS DAYS SINCE 1970, never as text: SQLite reads `2026-07-28` as 2026. */
  if (type === 'day' && kind === 'avg') return aggregate(sql, field, 'decimal', `(julianday(${expr}) - 2440587.5)`, where, params, kind, fn, rows);
  /* AN AVERAGE BOOL COUNTS A ROW NOBODY MARKED AS NOT YET, never as absent: SQL's `avg` skips a null, so two essential
     steps with one done and one cleared to null averaged 1 and the desk said "All 2 essential steps are done" with one
     open (`loop/research-audit-2026-09-25-layouts.md` finding 13). The browser reads it the same way (`apps/web`
     `metrics.ts` `one`). */
  if (type === 'bool' && kind === 'avg') return aggregate(sql, field, type, `coalesce(${expr}, 0)`, where, params, kind, fn, rows);
  return aggregate(sql, field, type, expr, where, params, kind, fn, rows, fx);
}

/**
 * `sum`, `avg`, `min` or `max` over one expression.
 *
 * MONEY AND QUANTITY CARRY THEIR UNIT INTO THE GROUP BY. The rule is one line — two currencies are
 * never added — and this is the line that would have added them: one SUM over a column of amounts
 * is a figure of the right size in whatever unit happened to be commonest.
 */
function aggregate(
  sql: Sql,
  field: string,
  type: string,
  expr: string,
  where: string,
  params: (string | number)[],
  kind: string,
  fn = 'sum',
  known?: number,
  fx?: Across,
): Result<Read> {
  const rows = known ?? Number(sql.one<{ n: number }>(`SELECT count(*) AS n FROM entry WHERE ${where}`, ...params)?.n ?? 0);

  if (type === 'money' || type === 'quantity') {
    const unitExpr = `json_extract(fields, '${jsonPath(field)}.${type === 'money' ? 'currency' : 'unit'}')`;
    const groups = sql.all<{ u: string | null; v: number | null; n: number }>(
      `SELECT ${unitExpr} AS u, ${fn}(${expr}) AS v, count(${expr}) AS n FROM entry WHERE ${where} AND ${expr} IS NOT NULL GROUP BY u ORDER BY u`,
      ...params,
    );
    /* Hoisted for the same reason as the ratio above: the gate that counts emitted codes will not
       cross a ternary condition carrying a quote, and both arms below are codes it has to see. */
    const money = type === 'money';
    if (groups.length === 0) return ok({ value: kind === 'sum' ? 0 : null, unit: null, rows, refusals: [] });
    /* A SUM OF MONEY IN A CURRENCY OTHER THAN THE ONE THE FIGURE IS ADDED UP IN is read row by row, each amount with
       the day its row is about, and converted at the rate as of that day, or said one amount per currency (`fx.ts`). */
    const foreign = groups.length > 1 || (fx?.into != null && groups[0]!.u !== fx.into);
    /* AND SO IS AN AVERAGE, A LEAST OR A MOST: each amount converted first, or each currency's own, never across two. */
    if (money && fx && REDUCIBLE.has(kind) && foreign && groups.every((g) => g.u !== null)) {
      const dated = fx.day ? `json_extract(fields, '${jsonPath(fx.day)}')` : 'NULL';
      const amounts = sql
        .all<{ u: string; v: number; d: string | null }>(`SELECT ${unitExpr} AS u, ${expr} AS v, ${dated} AS d FROM entry WHERE ${where} AND ${expr} IS NOT NULL`, ...params)
        .map((r) => ({ currency: String(r.u), amount: Number(r.v), day: typeof r.d === 'string' ? r.d : null }));
      const said = across(amounts, fx.into, fx.rates, fx.today, fx.home !== null, kind as Reduce);
      if (said.kind === 'one') return ok({ value: said.amount, unit: said.currency, rows, refusals: [] });
      if (said.kind === 'converted')
        return ok({ value: said.amount, unit: said.currency, rows, refusals: [], fx: { into: fx.into, home: fx.home, asOf: said.asOf, forward: said.forward, stale: said.stale, missing: [] } });
      return ok({ value: null, unit: null, rows, refusals: [], parts: said.parts, fx: { into: fx.into, home: fx.home, asOf: null, forward: false, stale: false, missing: said.missing } });
    }
    /* AND A QUANTITY SAYS SO IN ITS OWN CODE. `04 §5` gives the unit case its own row, *"a
       `quantity` aggregation across units"*, with its own sentence: *"sums consumption across m,
       cm and g. Scope the predicate to one unit"*. The sentence below has said "units" since it
       was written and the code said `MIXED_CURRENCY`, which is a sentence about money attached to
       a figure about metres.

       AND THE MONEY ARM'S WORD NOW FOLLOWS THE ROWS AS WELL AS THE FIELD (`mixedUnits`). It split on
       the declared type alone, so a money column holding one row that had lost its currency refused
       with *"these rows are in no unit and GBP, and two currencies are never added"*: one currency
       named and two claimed, about the one set the browser's own `mixedFix` has called units since
       `adf59786`. The code is still the money one, because the aggregation is still a money one. */
    if (groups.length > 1) {
      const mixed = mixedUnits(
        groups.map((g) => g.u),
        money,
      );
      const allowed = groups.map((g) => String(g.u ?? ''));
      /* THE TWO SENTENCES ARE NOW THE SAME TEXT AND THE TWO CALLS STAY APART, because `refusals.mjs`
         counts a code only where it is a quoted literal after `no(`: folding these into one call
         with the code in a ternary would hide both from the gate that checks every published code is
         emitted by something, and that gate is how the `QUANTITY_MIXED_UNIT` arm was found missing. */
      return money
        ? no<Read>('MIXED_CURRENCY', `these rows are in ${mixed.said}, and two ${mixed.word} are never added`, { at: field, allowed })
        : no<Read>('QUANTITY_MIXED_UNIT', `these rows are in ${mixed.said}, and two ${mixed.word} are never added`, { at: field, allowed });
    }
    const only = groups[0]!;
    return ok({ value: only.v === null ? null : Number(only.v), unit: only.u, rows, refusals: [] });
  }

  const out = sql.one<{ v: number | null; n: number }>(
    `SELECT ${fn}(${expr}) AS v, count(${expr}) AS n FROM entry WHERE ${where}`,
    ...params,
  );
  /* AN AVERAGE, A MINIMUM AND A MAXIMUM OF NOTHING IS NOT ZERO. A sum of nothing is. */
  if (Number(out?.n ?? 0) === 0) return ok({ value: kind === 'sum' ? 0 : null, unit: null, rows, refusals: [] });
  /* A DAY'S MINIMUM IS TEXT, `2026-09-11`, and it is kept as the whole days since 1970 that name it. */
  if (type === 'day' && typeof out?.v === 'string') {
    const at = Date.parse(`${String(out.v).slice(0, 10)}T00:00:00Z`);
    return ok({ value: Number.isFinite(at) ? Math.round(at / 86_400_000) : null, unit: null, rows, refusals: [] });
  }
  return ok({ value: out?.v === null || out?.v === undefined ? null : Number(out.v), unit: null, rows, refusals: [] });
}

/** The aggregations money across currencies is converted for, or read one currency at a time. */
const REDUCIBLE = new Set(['sum', 'avg', 'min', 'max']);

/** The money field an aggregation reads, or `null` when it reads a count or a field that is not money. */
function moneyFieldOf(schema: Schema, agg: Aggregation): string | null {
  const [, operand] = Object.entries(agg)[0] as [string, string | Product];
  const field = typeof operand === 'object' && operand !== null ? operand.product[0] : operand;
  return schema.fields[field]?.type === 'money' ? field : null;
}

/**
 * The unit of a ratio: money over a count is money, so an average invoice converted into pounds is in pounds and is never
 * written under the currency the figure declares. Pounds over pounds, or anything over hours, has no unit.
 * Exported for the browser's reader.
 */
export const rateUnit = (of: string | null, per: string | null): string | null => (of !== null && /^[A-Z]{3}$/u.test(of) && per === null ? of : null);

/** How the two halves of a ratio or a diff were read across currencies, as one: the OLDEST rate of the two, and every pair missing. Exported for the browser's reader. */
export function fxOfPair(into: { into: string | null; home: string | null } | undefined, a: FxRead | undefined, b: FxRead | undefined, converted: boolean): FxRead | undefined {
  if (!a && !b) return undefined;
  /* `.at(0)` AND NOT `.at(-1)`: a ratio of a figure converted today and one converted in July is
     as old as the July half, and saying today made the stale half invisible. */
  const asOf = converted ? ([a?.asOf, b?.asOf].filter((d): d is string => typeof d === 'string').sort().at(0) ?? null) : null;
  return {
    into: into?.into ?? a?.into ?? b?.into ?? null,
    home: into?.home ?? a?.home ?? b?.home ?? null,
    asOf,
    forward: converted && Boolean(a?.forward || b?.forward),
    stale: converted && Boolean(a?.stale || b?.stale),
    missing: [...new Set([...(a?.missing ?? []), ...(b?.missing ?? [])])].sort(),
  };
}

/** The field types `sum`, `avg`, `min` and `max` read as numbers. A `bool` is one or zero. */
const NUMERIC = new Set(['int', 'decimal', 'duration', 'money', 'quantity', 'bool']);

/**
 * Why one aggregation cannot be read as a number, or `null` when it can.
 *
 * A DAY IS TEXT TO SQLITE. `sum` and `avg` read `2026-07-28` as 2026, so a sum of two due dates was
 * 4052, and `min` and `max` hand back the text, which became NaN on the way out and went to a screen
 * as a blank beside `met: false`. `count` and `distinct` read any field, so they are never refused.
 */
function unaggregatable(kind: string, field: string, schema: Schema): string | null {
  if (!['sum', 'avg', 'min', 'max'].includes(kind) || field === 'id') return null;
  const type = Object.hasOwn(schema.fields, field) ? schema.fields[field]?.type : undefined;
  if (type === undefined || NUMERIC.has(type)) return null;
  /* THE EARLIEST OR THE LATEST DAY IS A DAY, and it is read as whole days since 1970 (`aggregate`). AN
     AVERAGE DAY IS READ THE SAME WAY, so the average of two paid days less the average of their due days is
     how late the money came, in days. A sum of days is still nothing. */
  if (type === 'day' && (kind === 'min' || kind === 'max' || kind === 'avg')) return null;
  return `${kind} reads a number, and ${field} is a ${type}. Count it, or aggregate a number field.`;
}

/** Every value expression's aggregations that cannot be read as a number, as install refuses them. */
export function unaggregatableIn(value: Value, schema: Schema): string | null {
  for (const f of aggregationsOf(value)) {
    const said = unaggregatable(f.kind, f.field, schema);
    if (said) return said;
  }
  return null;
}

/** Every key anywhere in a value expression. A field NAME is a value and never appears here. */
function keysOf(value: unknown): string[] {
  if (value === null || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(keysOf);
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => [k, ...keysOf(v)]);
}

/** Every aggregation a value expression reads, with the field each names. */
function aggregationsOf(value: Value): { kind: string; field: string; by?: string; lookup?: string }[] {
  const flat = (agg: Aggregation): { kind: string; field: string; by?: string; lookup?: string }[] => {
    const entry = Object.entries(agg)[0];
    if (!entry) return [];
    const [kind, operand] = entry;
    if (typeof operand === 'string') return [{ kind, field: operand }];
    const p = (operand as Product | undefined)?.product;
    return Array.isArray(p) && typeof p[0] === 'string' ? [{ kind, field: p[0], by: p[1]?.by, lookup: p[1]?.lookup }] : [];
  };
  if ('ratio' in value) return [...flat(value.ratio.of), ...flat(value.ratio.per)];
  if ('diff' in value) return [...flat(value.diff.of), ...flat(value.diff.per)];
  return flat(value);
}

/* ── scoring a prediction ──────────────────────────────────────── */

export type Scored = { id: string; observed: number | null; met: boolean | null };

/**
 * A prediction comes due: read the measure, compare it to the target, and write down what happened.
 *
 * A DECISION THAT PREDICTED NOTHING CANNOT BE WRONG. That is the point of the whole mechanism — a
 * decision carries a claim with a number and a date, and on that date the record checks. What makes
 * it honest is that the baseline was FROZEN at acceptance and is never recomputed: a prediction
 * scored against a baseline that moved with the world is a prediction that is always right.
 *
 * SCORED ONCE. `scored_at` is the guard, so a re-entered alarm or a re-run schedule row finds
 * nothing to do rather than overwriting a verdict with a later reading.
 */
/**
 * How far a figure moved, as a fraction of where it was.
 *
 * `Math.abs` ON THE DENOMINATOR, or the sign inverts on a negative prior. A net position going from
 * −48,000 to −72,000 is 50% WORSE, and dividing by −48,000 gives +0.5 — which the interface keys
 * the word "up" off, so a figure that got worse by half was reported as improving by half. The web
 * build has divided by the magnitude since it was written; the two disagreed, on money.
 *
 * It is a named function rather than one line inline because it is the arithmetic two builds have to
 * agree on, and the disagreement was invisible until somebody's balance went negative.
 */
export const deltaFrom = (before: number, now: number): number => (now - before) / Math.abs(before);

export function scorePrediction(
  sql: Sql,
  id: string,
  ctx: EvalContext,
  deps: {
    mint: () => string;
    nowAt: string;
    /**
     * File the question a missed prediction earns.
     *
     * `on_miss` WAS READ OUT OF THE ROW AND NEVER USED. The column exists, the default is `suggest`,
     * 24 §4.6 writes the sentence out — *"The CIB pattern you approved on 1 Sep predicted unmatched
     * payloads would fall to ≤1. They are at 7. Supersede it, or say why you are keeping it."* — and
     * the score was written and nothing came back to anybody. A loop that measures and does not
     * report is a loop that has measured for its own benefit.
     */
    propose?: (p: { question: string; body_kind: string; body: Record<string, unknown> }, actor: string) => Result<{ id: string }>;
  },
): Result<Scored> {
  const row = sql.one<{ id: string; claim: string; measure: string; target: string; window: string; on_miss: string; unit: string | null }>(
    'SELECT id, claim, measure, target, window, on_miss, unit FROM prediction WHERE id = ? AND scored_at IS NULL',
    id,
  );
  /* NOT A REFUSAL. A prediction already scored is the ordinary case for a re-entered alarm, and the
     handler above wants "nothing to do" rather than a failure that walks a retry ladder. */
  if (!row) return ok({ id, observed: null, met: null });

  const measure = JSON.parse(row.measure) as { source?: string; where?: Predicate; value?: Value };
  if (!measure.source || !measure.value)
    return no<Scored>('VALUE_MALFORMED', `${id}'s measure names no source or no value, so there is nothing to read.`, {
      at: 'measure',
    });

  const reading = evaluateMetric(sql, {
    metric: id,
    name: row.claim,
    source: measure.source,
    where: measure.where,
    value: measure.value,
    /* The prediction's own target and window stand in for the metric's two required fields: it has
       both, by construction, which is what makes it a prediction rather than a hope. */
    target: { gte: Number(row.target) },
    window: row.window,
    compare: 'none',
  }, ctx);
  if (!reading.ok) return reading;

  /* A TARGET THAT IS NOT A BOUND IS A REFUSAL, not a verdict. Writing `scored_at` here would settle
     the question permanently on arithmetic nobody meant. */
  const bound = targetOf(row.target);
  if (!bound)
    return no<Scored>('VALUE_MALFORMED', `${id}'s target is ${JSON.stringify(row.target)}, which is not a bound.`, {
      at: 'target',
    });

  const observed = reading.value.value;
  const met = observed === null ? null : meets(observed, bound);

  sql.exec(
    'UPDATE prediction SET scored_at = ?, observed = ?, met = ? WHERE id = ?',
    deps.nowAt,
    /* THE SAME INTEGER RULE AS A SERIES POINT, AND THE SAME UNIT THE BASELINE WENT IN UNDER.
       `Math.round` alone stored a ratio of 0.375 as `0` while `met` was computed from 0.375 and
       stored as `1` — a row reading "target ≥ 0.3 met, observed 0", which is the record
       contradicting itself in its own governance table. The scale that replaced it was then applied
       to money as well, so a prediction about a figure in pounds was settled against an observation
       ten thousand times its own baseline. `row.unit` is the unit chosen when the prediction was
       accepted, and it is the unit the observation has to be in for the two to be comparable. */
    observed === null ? null : point(observed, row.unit).value,
    met === null ? null : met ? 1 : 0,
    id,
  );
  sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v) VALUES (?, ?, 'system', 'score', ?, 'prediction', ?)",
    deps.mint(),
    deps.nowAt,
    `prediction:${id}`,
    JSON.stringify({ observed, met }),
  );

  /* AND A MISS GOES IN FRONT OF A PERSON. `supersede` or `keep`, with a reason either way — because
     the interesting half is the second one: a prediction that missed and a decision somebody still
     stands behind is a fact about the world rather than about the change, and the reason is where
     that gets said. `system` opens it; nobody can answer their own question here.

     AND IT NAMES THE PREDICTION IT GRADES, so the record holds it as it holds that prediction. Without the id the record
     matched the question's words, and two predictions in the same words, one over Money and one over Inbox, both
     answered, so the Inbox miss was held from the member who reads Inbox (`loop/research-decide-reach.md`, E1). */
  if (met === false && row.on_miss === 'suggest' && deps.propose)
    deps.propose(
      {
        question: `${row.claim}: predicted ${row.target}, observed ${observed === null ? 'nothing' : observed}. Supersede that decision, or say why you are keeping it.`,
        body_kind: 'options',
        body: {
          options: [
            { id: 'supersede', label: 'Supersede it', because: 'the change did not do what it promised' },
            { id: 'keep', label: 'Keep it', because: 'the prediction was wrong about the world, not the change' },
          ],
          requires_reason: true,
          prediction: id,
        },
      },
      'system',
    );

  return ok({ id, observed, met });
}

/**
 * The target as a bound, or `null` when it is not one.
 *
 * `<= 20` and `20` are the same claim written two ways, and a prediction written as a bare number
 * means "at least this" — which is what `gte` is. A leading operator says otherwise.
 *
 * IT RETURNS `null` RATHER THAN A BOUND OF `NaN`. `Number('')` is zero, so an empty target used to
 * read as "at least nothing" — met by every figure, scored once, and never revisited because
 * `scored_at` was set. A prediction that cannot be wrong is not a prediction.
 */
export function targetOf(text: string): { lte: number } | { gte: number } | null {
  const t = text.trim();
  const bound = (op: 'lte' | 'gte', rest: string): { lte: number } | { gte: number } | null => {
    const n = Number(rest.trim());
    if (rest.trim() === '' || !Number.isFinite(n)) return null;
    return op === 'lte' ? { lte: n } : { gte: n };
  };
  if (t.startsWith('<=') || t.startsWith('≤')) return bound('lte', t.replace(/^(<=|≤)/, ''));
  if (t.startsWith('<')) return bound('lte', t.slice(1));
  if (t.startsWith('>=') || t.startsWith('≥')) return bound('gte', t.replace(/^(>=|≥)/, ''));
  if (t.startsWith('>')) return bound('gte', t.slice(1));
  return bound('gte', t);
}

/* ── a figure, kept ────────────────────────────────────────────────── */

export type Snapshot = { series: string; wrote: number; backfilled: number; missing: number };

/**
 * Yesterday's reading, written down.
 *
 * A METRIC IS A QUESTION AND A SERIES IS ITS ANSWERS. Everything else the record computes is
 * computed fresh; this is the one thing it remembers, because "is this getting better" cannot be
 * asked of a number that only exists now.
 *
 * YESTERDAY, NEVER TODAY. Today's figure is still moving — an invoice paid this afternoon changes
 * it — and a stored point that later disagrees with the same question asked again is worse than no
 * point at all. Today is appended live by the reader and flagged as partial.
 *
 * AND IT BACKFILLS, thirty days, once. A series that starts the day somebody turned it on has no
 * shape for a month, and the record already holds the rows every one of those days is a question
 * about. The backfill never overwrites: a day that has a point keeps it.
 */
/**
 * The unit a fractional figure is stored in, and the factor that gets it there.
 *
 * `metric_point.value` IS AN INTEGER, on purpose — 08 §8's series model stores a provider's `12.5%`
 * as `1250` basis points rather than as a float, so two records comparing a series never disagree
 * about the last bit. But `Math.round` alone is not that model, it is the loss without the scale: a
 * `ratio` of 0.375 was written as `0` on EVERY day of a backfill, so a series whose whole point is a
 * trend read as a flat line of zeroes — under a comment two lines above warning that a series of
 * zeroes cannot tell nothing from no answer.
 */
const BASIS = 'pct.bp';
const BASIS_SCALE = 10_000;

/**
 * A UNIT THIS RECORD MEANS SOMETHING BY: a currency, a quantity's unit, a duration's.
 *
 * `''` and `'count'` are the two spellings a bare number gets, and `pct.bp` is the one the scaling
 * below invents. Everything else came off a declaration and is a real measurement.
 */
const realUnit = (unit: string | null | undefined): unit is string =>
  typeof unit === 'string' && unit !== '' && unit !== 'count' && unit !== BASIS;

/**
 * What goes in the integer column, AND THE UNIT THAT GOES BESIDE IT, decided together.
 *
 * THE SCALE WAS APPLIED TO MONEY AND THE CURRENCY WAS KEPT, WHICH IS A FIGURE TEN THOUSAND TIMES
 * TOO BIG WITH A POUND SIGN IN FRONT OF IT. `stored()` took a value and nothing else: any fractional
 * number became basis points, while each of the three call sites wrote the unit from a separate
 * expression that correctly kept a real unit when the reading had one. So the average of two rows at
 * GBP 101 and GBP 102 read `{ value: 101.5, unit: 'GBP' }` and was written as
 * `{ value: 1015000, unit: 'GBP' }`, which every surface in this product renders as £10,150.00. The
 * same happened to `prediction.baseline`, and `listGovernance` hands those rows back as they are, so
 * it reached a screen.
 *
 * A REAL UNIT IS THE ATOM AND IS NEVER SCALED. Money is already an integer in minor units, so an
 * average landing between two pennies rounds to a penny: that is what money does, and half a penny
 * is not a number this record can hold. The same is true of a duration in milliseconds and of a
 * quantity in kilograms, and both were being multiplied by ten thousand for the same reason.
 *
 * BASIS POINTS ARE FOR THE FIGURE WITH NO UNIT AT ALL, which is what `08 §8` specifies them for: a
 * ratio of 0.375 stored as `0` made a series whose whole point is a trend read as a flat line of
 * zeroes. That case is unchanged.
 *
 * THE TWO ANSWERS COME BACK TOGETHER because they were computed apart, and computing them apart is
 * the whole defect. A caller cannot write the scaled value under the reading's own unit any more,
 * because it is not given one to write.
 */
export const point = (value: number, unit: string | null | undefined): { value: number; unit: string | null } => {
  if (realUnit(unit)) return { value: Math.round(value), unit };
  if (Number.isInteger(value)) return { value, unit: null };
  return { value: Math.round(value * BASIS_SCALE), unit: BASIS };
};

export function snapshot(
  sql: Sql,
  decl: MetricDecl,
  ctx: EvalContext,
  deps: { nowAt: string; tz: string },
  backfillDays = 30,
): Result<Snapshot> {
  const DAY = 86_400_000;

  /**
   * THE DAY IS THE RECORD'S, NOT UTC'S. `deps.tz` was read and thrown away (`void deps.tz`), so
   * every boundary here was UTC — and the row that fires this is armed for five past midnight
   * LOCAL. In `Pacific/Auckland` that is 11:05 the previous day in UTC, so `nowMs - DAY` landed two
   * local days back and `toISOString()` named the wrong one; backfill only walks backwards, so
   * local yesterday was never written at all, for any record east of UTC. 45 §5.9: "y = yesterday
   * in tz".
   *
   * `en-CA` GIVES `YYYY-MM-DD` DIRECTLY, which is the format `metric_point.at` stores and the one
   * every comparison in this file assumes.
   */
  const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: deps.tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const at = (ms: number): string => dayFmt.format(new Date(ms));

  /**
   * The local date `n` days before `day`, counted on the calendar and not on the clock.
   *
   * THIS STEPPED BACK 24 HOURS AT A TIME FROM THE LAST INSTANT OF LOCAL TODAY, and a day the clocks
   * go back on is 25 hours long. Measured in `Europe/London` and `America/New_York`
   * (`test/metrics-backfill-dst.test.ts`): from the morning after it, the stride that should have
   * reached the day before landed at 00:59 on the same date as the stride before, so one day was
   * filed twice and the thirty-first day back was never reached; on the 25-hour day itself the first
   * stride was still that day, and today's moving figure was stored as yesterday's. A date string
   * has no length to get wrong, and noon UTC is only a place to do the subtraction, since no zone is
   * consulted here.
   */
  const back = (day: string, n: number): string => new Date(Date.parse(`${day}T12:00:00Z`) - n * DAY).toISOString().slice(0, 10);

  /** Yesterday, locally: the date before the local date `nowMs` falls on. */
  const yesterday = back(at(ctx.nowMs), 1);

  const write = (day: string, overwrite: boolean): 'wrote' | 'kept' | 'missing' => {
    if (!overwrite && sql.one("SELECT 1 AS x FROM metric_point WHERE series = ? AND grain = 'day' AND at = ?", decl.metric, day))
      return 'kept';

    /**
     * AND THE QUESTION IS ASKED OF THAT DAY'S DATE, NOT OF AN INSTANT IN IT.
     *
     * This passed `endOf(dayMs)`, the last instant of the LOCAL day, and every reader of `asOfMs`
     * takes the UTC date of what it is given: `resolveDay` for the window's start, `endedAt` for its
     * end, the fx day. West of UTC the end of a local day is the next UTC day, so in
     * `America/New_York` the point stored under 4 September was the thirty days to the 5th, 1100
     * where the rows to the 4th hold 110 (`test/metrics-asof-tz.test.ts`). Noon UTC of the local
     * date has that date as its UTC date in every zone, which is what a live read made at noon UTC
     * on the same day resolves against.
     */
    /* AND THE ZONE GOES WITH IT, because noon UTC makes every bare day in the predicate a local day
       and an `instant` is only compared with one in a zone (`localInstants`). */
    const read = evaluateMetric(sql, decl, { ...ctx, asOfMs: Date.parse(`${day}T12:00:00Z`), tz: deps.tz });
    /* A NULL VALUE IS NO ROW. A series with a zero on every day nothing happened is a series that
       cannot tell "nothing" from "no answer", and the difference is the whole of a trend. */
    if (!read.ok || read.value.value === null) return 'missing';

    const wrote = point(read.value.value, read.value.unit);

    sql.exec(
      `INSERT INTO metric_point (series, grain, at, value, unit, n, source, wrote_at) VALUES (?, 'day', ?, ?, ?, ?, ?, ?)
       ON CONFLICT (series, grain, at) DO UPDATE SET value = excluded.value, unit = excluded.unit, n = excluded.n, wrote_at = excluded.wrote_at`,
      decl.metric,
      day,
      /* ONE DECISION, TWO COLUMNS. The value and its unit were computed by two expressions that
         disagreed about money: the first scaled it and the second kept the currency. */
      wrote.value,
      wrote.unit ?? '',
      read.value.rows,
      decl.source,
      deps.nowAt,
    );
    return 'wrote';
  };

  /* YESTERDAY IS OVERWRITTEN, because a snapshot that ran twice in one day should agree with itself
     rather than refuse the second time. Every earlier day is kept. */
  const today = write(yesterday, true);
  let backfilled = 0;
  let missing = today === 'missing' ? 1 : 0;

  for (let n = 1; n <= backfillDays; n++) {
    const out = write(back(yesterday, n), false);
    if (out === 'wrote') backfilled++;
    if (out === 'missing') missing++;
  }

  return ok({ series: decl.metric, wrote: today === 'wrote' ? 1 : 0, backfilled, missing });
}
