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
 * WHAT IS NOT HERE IS REFUSED BY NAME. `last` and `median` are published shapes with no consumer in
 * this build. `group_by` and `bucket` are read (`groupsOf`). Reading one and quietly returning the
 * ungrouped figure would be a number under a heading that says it is grouped, which is worse than
 * an em dash.
 *
 * A RUNNING TOTAL AND A MEASURED TREND ARE READ. `{ running: { sum, order, until } }` walks
 * the entries in order and answers the total at the end or at its stop, with the entry that reached
 * the line (`crossedAt`). `{ trend: { of, ahead } }` reads another figure in its buckets and answers
 * what `trend.ts` says of them (`readTrend`). Neither is half of a ratio or a difference.
 */

import type { Refusal, Result, Sql } from '@braindog/ports';
import { fixOf, no, ok } from '@braindog/ports';
import { KERNEL_FIELDS, compile, evaluate, jsonPath, lookupRef, parseWhere, resolveDay, unprivate, type Predicate, type Schema, type SentenceDeps } from '@braindog/where';

import { GROUP_CAP, bucketOf, bucketRun, bucketStart, isBucket, nextBucket, type Bucket } from './buckets.ts';
import { bySplit, splitOf } from './row-parts.ts';
import {
  GOVERNANCE_OPEN,
  RECORD_ACTIVITY,
  HANDOFFS_OPEN,
  RECORD_DOOR,
  RECORD_KEYS,
  RECORD_LISTS,
  RECORD_MARKS,
  RECORD_PATHS,
  RECORD_PEOPLE,
  RECORD_PLACES,
  RECORD_RATES,
  RECORD_SIGNS,
  RECORD_TIDY,
  RECORD_VITALS,
  RECORD_WORKED,
  SESSIONS_WORKING,
  readActivity,
  readDeadPaths,
  readDoor,
  readHandoffsOpen,
  readKeysUnopenable,
  readListsShrunk,
  readMarksUnknown,
  readOpenQuestions,
  readPeopleTwice,
  readProjectsUnplaced,
  readRatesAge,
  readRunsWorking,
  readSign,
  readTidy,
  readVitals,
  readWorked,
} from './built-in-figures.ts';
import { SESSION, SESSION_PREFIX } from './session.ts';
import { RECORD_KEY_SCAN, readKeysInText } from './key-scan.ts';
import { isCurrencyCode } from './coerce.ts';
import type { Leg } from './forecast.ts';
import type { VitalSign } from './signs.ts';
import { across, convertMinor, dayFieldOf, isAtLeast, pairParts, partsOf, rateFor, rateIsStale, type Across as Added, type Amount, type Part, type Rate, type Reduce } from './fx.ts';
/* THE TWO FIGURES THAT ARE NOT A SUM OVER ONE LIST, read in their own file, which imports this one back (it says why that is safe). */
import { isCrosscheck, isRolled, isWalked, readCrosscheck, readRolled, readWalk } from './money-figures.ts';
import { fill } from './fill.ts';
import { TREND_POINTS, trendOf, type Trend } from './trend.ts';

/** The six this build reads. The other five are `08` §2.2's and are refused by name. */
export const AGGREGATIONS = ['sum', 'count', 'avg', 'min', 'max', 'distinct', 'age', 'currencies', 'empty', 'past'] as const;
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
  | { distinct: string }
  /** Whole days from the newest day in the field to the reading's own day, on a day or instant field (money-signs B1). */
  | { age: string }
  /** How many currencies a money field is kept in (money-signs B2). */
  | { currencies: string }
  /** How many rows leave the field empty, any type (money-signs B3). */
  | { empty: string }
  /**
   * How many rows hold a day that is gone, `by` whole days or more: `{ past: 'next_due', by: '3d' }` counts what
   * `next_due before -3d` selects, inside a `where` that does not say it (signs-metric-75-76). `past` is written first.
   */
  | { past: string; by?: string | undefined };

/**
 * The window a difference takes its second half from: the same `where`, read against the clock moved back.
 *
 * `previous` moves it by the figure's `window` and `year_ago` by a year, as `compare` does. `month_ago` moves it to the
 * same day number last month (`monthBefore`), which thirty days does not: 31 October less thirty days is still October.
 */
export const BEFORE = ['previous', 'month_ago', 'year_ago'] as const;
export type Before = (typeof BEFORE)[number];

/**
 * `diff.before` IS WHAT LETS A DIFFERENCE SAY WHAT MOVED: `of` over the window as written, `per` over the window before,
 * ended at the moved clock's day (`endedAt`), so "this month so far" is taken from last month up to the same day. It is
 * one source and one predicate still, which is what a half's own `where` would not be (`declare.ts`).
 */
export type Value = Aggregation | { ratio: { of: Aggregation; per: Aggregation } } | { diff: { of: Aggregation; per: Aggregation; before?: Before | undefined } };

/**
 * A FIGURE THAT ADDS OTHER FIGURES: cash held less what is owed out is a net position, `{ sum_of: [{ metric:
 * cash-now }, { metric: owed-out, minus: true }] }`. Each part is an installed figure by its id, with a parameter after
 * the first colon as a walk's opening takes one (`book-cash:Kiln`), and `minus` takes it away (`readSumOf`).
 *
 * A VALUE OF ITS OWN, BESIDE `Value` AND NOT IN IT, as cash rolled forward and a trend are: every reader of `Value`
 * narrows it to an aggregation over one list (`rules.ts` `addsMoney`, `fieldsOf`), and a sum of figures is none.
 * `evaluateMetric` reads it before any of them is reached, and `isSumOf` is how a reader tells.
 *
 * `optional: true` IS A PART AN ADD-ON MAY OR MAY NOT HAVE INSTALLED, since money-core 3.31.0: net worth adds Holdings,
 * Property, Certificates and Insurance when the record holds them. A part nobody installed then adds nothing rather
 * than refusing the whole sum, at install and when it is read; one that is installed is read like any other part.
 */
export type SumOf = { sum_of: { metric: string; minus?: boolean | undefined; optional?: boolean | undefined }[] };

/**
 * ONE SUM OF FIGURES AS A SHARE OF ANOTHER, SINCE 30 October (money's over-leverage, Q-health of round 1030): what goes
 * out every month on repeating lines and instalments, as a share of what comes in every month. Each half is a `sum_of`
 * read as one is (`readSumOf`), and the share is taken only when both come back as one number in one currency, or both
 * as plain numbers: two currencies are never divided, as they are never added. A half of nought reads nothing, never a
 * share of nothing.
 */
export type RatioOf = { ratio_of: { of: SumOf['sum_of']; per: SumOf['sum_of'] } };

export type MetricDecl = {
  metric: string;
  name: string;
  /**
   * `register.<id>`, or `forecast.runway` for a figure over the cash walk ahead (`money-figures.ts`). A `series.<id>`
   * source reads `metric_point`, the line a figure's nights kept, and this build reads one thing of it: with
   * `value: { count: 'missing' }`, how many days of the window hold no point (`readSeriesGaps`).
   * An `events.<list>` source reads the history for who made each entry of a list: with `value: { count: 'made' }`, how
   * many were made in the window, in parts by who made them (`readMade`); with `value: { count: 'changed', field }`, how
   * many had that field changed in it, and by `bucket` with `group_by: 'at'`, in each week of it (`readChanged`).
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
   * `true` makes the figure one of the record's vital signs: red on the day its reading misses its target,
   * green when it meets it. Only on a figure with a target, which `declare.ts` holds. A declared sign is shown with the
   * record's own; it never joins the signs the hold is counted on, so a pack cannot move the clock (`vitalOf`).
   */
  vital?: true | undefined;
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
  /**
   * WHAT A PERSON CALLS THE PART, where its key is not words: the title of the row a ref points at, an enum's declared
   * label, Yes or No. Absent where the key is the name already (a grouping by a text field) or nothing names it, and a
   * reader then says the key (`groupNames`). The key stays as it is, because a link and a filter are made from it.
   */
  label?: string;
  value: number | null;
  rows: number;
  state: 'empty' | 'partial' | 'full';
  /** On a figure in more than one currency that is not converted: this part's amount in each, and `value` is `null`. */
  parts?: Part[];
  /** On a difference against the window before: what each half read for this part, for two bars on one scale. */
  halves?: Halves;
  /**
   * On a difference against the window before: this part's change, through the same gate the whole figure's passes
   * (`comparisonOf`), asked of this part's own entries. `null` is no change that may be said, and `why` says why not.
   */
  delta?: number | null;
  why?: string;
};

/** The two halves of a difference against the window before: `of` now, `per` then, and how many entries `per` read. */
export type Halves = { of: number | null; per: number | null; perRows: number };

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
export type FxRead = {
  into: string | null;
  home: string | null;
  asOf: string | null;
  forward: boolean;
  stale: boolean;
  missing: string[];
  /** The rates of `asOf` the figure was converted with, one a currency, so a page can say "$1 = EGP 50.50" beside it. */
  pairs?: { from: string; rate: number }[];
};

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
  /** On a difference against the window before (`diff.before`): what each half read, and `delta` is `of` against `per`. */
  halves?: Halves;
  /** A grouped figure's parts, in key order. Absent on a figure with no `group_by`. */
  groups?: Group[];
  /** On a figure bucketed by date: the bucket the clock is in, which a chart marks as unfinished. */
  current?: string;
  /** How many groups past the cap of fifty were left out, the oldest first. */
  more?: number;
  /**
   * NO ROW SAID THE FIELD THIS FIGURE REDUCES: no row matched, rows were held, and the figure's own `where` requires that
   * field filled (`present`). "Earning £0" over a field nobody filled is not a zero, so `drawn.ts` leaves it out
   * (`unsaid`), as the web's `overUnsaidField` (`page-live.ts`) does. Absent when false.
   */
  unsaid?: true;
  /**
   * MONEY IN MORE THAN ONE CURRENCY THAT COULD NOT BE CONVERTED, one amount per currency, and `value` is `null`. It is
   * not a refusal: the parts are the answer, and `fx.missing` says which rate would add them up.
   */
  parts?: Part[];
  /** Present when the rows were in a currency other than the one the figure is added up in: converted, or in `parts`. */
  fx?: FxRead;
  /**
   * A SUM THAT CONVERTED WHAT IT COULD AND LEFT THE REST OUT (`fx.ts` `atleast`). `parts[0]` is then the least
   * the whole can be, in `fx.into`, and `noRate` is what no rate reached, one amount a currency, each more than nought;
   * `parts` is the two together and `fx.missing` names each pair. `value` STAYS `null`: a lower bound in `value` is
   * drawn as the total by every reader that has not learnt the mark, and no reader has yet. Absent on every other figure.
   */
  atLeast?: true;
  noRate?: Part[];
  /**
   * ON A FIGURE OVER A KEPT LINE (`readSeriesGaps`): the days counted in `value` that hold no point for want of a rate,
   * oldest first, as `snapshot` kept them. Absent when none of the missing days is one.
   */
  noRateDays?: string[];
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
  /**
   * ON A SUM, THE ENTRIES IT ADDED, by handle (`transactions#2`), oldest first and fifty at most (`BACKS_CAP`), so a
   * reader can tell two figures of one amount from one entry read twice: the amounts being equal never says so. An entry
   * the `where` chose that leaves the summed field empty was not added and is not here. Absent on a sum of nothing, on
   * every figure that is not a plain sum, and on a list that numbers nothing (`series`). A sum in more than one currency
   * names the entries of every currency it read, the ones no rate reached among them (`parts`, `noRate`).
   */
  backs?: string[];
  /** How many more entries the sum added than `backs` names. Absent when it names them all. */
  backsMore?: number;
  /**
   * ON A RUNNING TOTAL WITH A STOP (`running.until`), THE FIRST ENTRY THAT REACHED THE LINE: its id, what it holds in the
   * field the walk is in order of, and the total as it stood there, which is the figure's `value`. Absent when nothing
   * reached the line, when there is no stop, and when two currencies gave no one total to walk.
   */
  crossed?: Crossed;
  /** ON A TREND (`{ trend: { of, ahead } }`): what `trendOf` said of the figure's buckets, and `value` is its rate. */
  trend?: TrendSaid;
  /** How far a walk to zero looked when it never went under: its last day and the days to it. Beside value, never in it (`Beyond` in money-figures.ts). */
  beyond?: { day: string; days: number };
  /**
   * ON A WALK TO ZERO THAT GOES UNDER, THE STEP THAT TAKES IT THERE: its day, what the walk calls it, and its money as an
   * amount going out, in the walk's currency. Absent when the walk never goes under or opens under (`readWalk`).
   */
  under?: { day: string; label: string; amount: number; currency: string | null };
  /**
   * ON A STREAK (`{ streak: { on, grain } }`): the days or weeks in a row that hold an entry, which is `value`, the last
   * day one was made on, and whether the bucket the clock is in holds one yet. Absent on every other figure.
   */
  streak?: StreakSaid;
};

/** What a streak says beside its count: its grain, the newest day an entry falls on, and whether today's bucket has one. */
export type StreakSaid = { grain: StreakGrain; last: string | null; today: boolean };

/** The entry a running total reached its line at. `at` is a day or an instant as it is kept, or a number. */
export type Crossed = { id: string; at: string | number | null; value: number };

/** A trend with a `t` JSON can carry: one that is not a finite number is left out, never sent as `null`. */
type Untimed<T> = T extends { t: number } ? Omit<T, 't'> & { t?: number } : T;

/**
 * A trend as a reading says it: `bucket` is what one step of it is, and `unit` the currency the buckets ahead are in,
 * `null` for a plain number. The buckets ahead of a figure in whole numbers leave as whole numbers, which is minor
 * units for money.
 */
export type TrendSaid = Untimed<Trend> & { bucket: Bucket; unit: string | null };

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
 * declares, else the one its setting was typed in (`liveTarget` in `declare.ts` writes it there), else none, and then
 * it is read as it is in whatever currency the figure came back in. A figure in a currency other than its target's is
 * judged against the target converted at the latest rate, and has no verdict without one.
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
const UNREAD = ['last', 'delta', 'median', 'group_by', 'bucket'] as const;
/** The two shapes that are a figure of their own: read at the top of a value, refused by name inside one. */
const WHOLE_SHAPES = ['running', 'trend', 'streak'] as const;

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
 * `365 * DAY` instead, which is what `keychain.spanMs('1y')` does for a grant's lifetime, lands on the
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
 * A month before: the same day number last month, cut to the last day that month has, as `yearBefore` cuts 29 February.
 *
 * THIRTY DAYS IS NOT A MONTH FOR A FIGURE THAT STARTS AT THE FIRST. 31 October less thirty days is 1 October, so "since the
 * first of the month" names the same entries both times, and 1 March less thirty days is in January, a month too far.
 */
export const monthBefore = (nowMs: number): number => {
  const d = new Date(nowMs);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0, 12)).getUTCDate();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, Math.min(d.getUTCDate(), last), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds());
};

/**
 * THE COMPARISON GATE: may the change between a window and the one before be said, and if not, why not.
 *
 * One function, so the whole figure and each part of a grouped difference are held to the same sentences. A window with
 * nothing in it, a window before with under half the entries, and a window before worth nothing each answer `null` and
 * a reason, because a change read off them is a fact about how much was written down and not about what happened.
 *
 * `both` ASKS IT OF THE CURRENT WINDOW TOO, and a difference against the window before does: three entries
 * this month against forty last month is the first week of a month reading as good news. The comparison every figure has
 * always carried is asked one way, as it was.
 */
export function comparisonOf(now: { value: number | null; rows: number }, before: { value: number | null; rows: number }, both = false): { delta: number | null; why: string } {
  if (now.rows === 0 || before.rows === 0) return { delta: null, why: 'one of the two windows is empty' };
  if (before.rows * 2 < now.rows) return { delta: null, why: 'the window before has under half the rows' };
  if (both && now.rows * 2 < before.rows) return { delta: null, why: 'this window has under half the rows of the one before' };
  if (before.value === null || now.value === null || before.value === 0) return { delta: null, why: 'the window before has nothing to compare against' };
  return { delta: deltaFrom(before.value, now.value), why: '' };
}

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
 * `created_at` AND `updated_at` ARE INSTANTS THAT NO REGISTER DECLARES. They are `KERNEL_FIELDS`, read off `entry`'s
 * columns and addressable in any `where`, and `schema.fields` does not hold them. `endedAt` and `localInstants` asked
 * `schema.fields` alone, so `created_at after -30d` got neither an as-of end nor local bounds: the point stored under 4
 * September measured 11111, every row, in New York, Tokyo and UTC, where the same instants in a declared `at` gave
 * 10011, 10101 and 10101 (`test/metrics-local-day-kernel.test.ts`). This is the lookup `@braindog/where`'s `specOf`
 * makes, so the compiler, these two and `resolveRelative` before them agree on which names are instants. The inbox's
 * schema keeps no kernel columns, and its `ts` is declared.
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

  /* AND AN AS-OF END ONLY FOR A WINDOW THAT LOOKS BACK. `5ae403ff` ended every such window at the as-of day, and
     `due after today` became `due > asOf and due < asOf + 1`, which holds nothing: two open bills due 3 and 12 days
     ahead measured 300,000 live on the day and 0 as of that day, and the same for `due after -1d`. A window whose first
     day is the as-of day or later is a question about what is coming, and the rows it counts were there to be counted
     on that day; only one that begins before the day has rows from after it that had not happened yet.
     `test/metrics-asof-forward.test.ts` holds both.

     AND NEVER ON A FIELD THE REGISTER DECLARES A DEADLINE, WHEREVER THE WINDOW BEGINS. The first day was a guess at the
     real question, which is whether a row dated after the as-of day could have been there on it: a payment `on` the
     10th had not happened on the 5th, and a bill `due` the 10th was already owed. `due after -7d` over bills due 2 days
     before and 3 and 12 after read 350,000 live on the day and 50,000 as of it, `due after -2d` 300,000 and 0.
     `deadline: true` is the register saying which kind a field is; `test/metrics-past-window.test.ts` holds both, and
     that a field without it still ends at the day.

     AND ALWAYS ON `created_at` AND `updated_at`, WHEREVER THE WINDOW BEGINS. The record stamps them when a row is
     written, so a row stamped after the as-of day was not there on it, which is the one question the first-day rule
     above guesses at and these two answer outright. `created_at after -1d` stored as the night of the 5th begins on the
     5th, so under that rule it took no end and counted every row written since, the next morning's included.
     `test/metrics-live-local-day.test.ts` holds it in Tokyo, where that night ends at 15:00 UTC. A declared `instant`
     keeps the first-day rule, because nothing says who wrote it or when. */
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
/* ONE FORMATTER A ZONE, made the first time it is asked and kept: making one is most of what a date said here costs,
   and a page of figures asked it hundreds of times over the one zone. What it formats is the same either way. */
const clockFormats = new Map<string, Intl.DateTimeFormat>();
const dayFormats = new Map<string, Intl.DateTimeFormat>();
const formatIn = (kept: Map<string, Intl.DateTimeFormat>, tz: string, make: () => Intl.DateTimeFormat): Intl.DateTimeFormat => {
  let made = kept.get(tz);
  if (made === undefined) {
    made = make();
    kept.set(tz, made);
  }
  return made;
};

const offsetAt = (ms: number, tz: string): number => {
  const parts = Object.fromEntries(
    formatIn(clockFormats, tz, () => new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }))
      .formatToParts(new Date(ms))
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  return Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!) - Math.floor(ms / 1000) * 1000;
};

const localDate = (ms: number, tz: string): string =>
  formatIn(dayFormats, tz, () => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })).format(new Date(ms));

const dayStartsAt = (day: string, tz: string): string => {
  const midnight = Date.parse(`${day}T00:00:00Z`);
  const on = [midnight - offsetAt(midnight - DAY, tz), midnight - offsetAt(midnight + DAY, tz)].filter((ms) => localDate(ms, tz) === day);
  /* Neither is on the day only if a zone moved its clocks by a day, which Samoa did once in 2011. */
  return new Date(on.length ? Math.min(...on) : midnight).toISOString();
};

/**
 * A bare day bounding an `instant` field, rewritten as the instants the day starts and ends at in `tz`.
 *
 * THE COMPILER COMPARES A BARE DAY WITH AN INSTANT'S FIRST TEN CHARACTERS, WHICH ARE ITS UTC DATE. `snapshot` asks each
 * day's question at noon UTC of the record's local date, so every day in the predicate is a local day, and for a `day`
 * field that is the whole of it. An `instant` was still dated in UTC: the point stored under 4 September in
 * `America/New_York` measured 10101 where the local thirty days hold 10011, because ten at night on the 4th is the 5th
 * by UTC and ten at night on 5 August is the 6th (`test/metrics-instant-day.test.ts`). Solo founder's `datapoints-30d`
 * is that window over that type.
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

/** A read's own memo: `make` worked out once under `key`, and what it read noted again each time it is handed out. */
export type ReadMemo = { once<T>(key: string, make: () => T): T };

export type EvalContext = {
  /** Who is reading, for a `where` that says `someone else`; a figure that says it is held for each reader. */
  reader?: string | undefined;
  nowMs: number;
  /**
   * Walks ahead already worked out in this one read (`readWalk`), kept by the host only for a read that writes nothing.
   *
   * `once` AND NOT A MAP, so what a kept walk read is read again by whoever is handed it. A figure held across reads is
   * held on the lists its reads named (`holdAcross`), and the second figure over the same walk asked nothing of the
   * rows: `leaving-30d` after `arriving-30d` was held on no list, and a bill written after it stayed out of Today's
   * Out, 30 days for up to an hour.
   */
  walks?: ReadMemo | undefined;
  /** Who is reading, when rows somebody else kept private must be left out of a raw-SQL figure (`unprivate`); unset reads the whole record. */
  viewer?: string | undefined;
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
   * `snapshot` SET IT AND THE KERNEL'S LIVE READS DID NOT, so a night point and the tile above it answered different
   * days. `snapshot` asks at noon UTC of the local date, which makes `today` and `-30d` local days; a live read named
   * them from the UTC date of `nowMs`. In `Asia/Tokyo` at 00:05 on the 6th, `created_at is today` read 1100 live and in
   * the list, and 110 in the point stored for the 5th. Now the kernel's `evalContext` carries the record's zone, and a
   * live read with one names its days from noon UTC of the local date (`clockOf`), so the day's name and the instants
   * it holds are the same local day.
   */
  tz?: string | undefined;
  /**
   * THIS READ IS A KEPT POINT'S (`snapshot`). A row in a sum takes the nearest rate there is and says how old
   * it is; a point in a line is drawn as that day's, so each amount needs a rate of its own day or the day before (or of
   * the last day one was published, `RATE_QUIET_DAYS`), and never a later one standing in. Without one the figure has no `value` and names the pair (`pointSaid`), so the night
   * writes no point: a gap in the line is honest, and a point that is quietly wrong is not. Absent on every other read.
   */
  point?: true | undefined;
  /** The register's declared fields, so a predicate and a field expression check against one shape. */
  schemaOf: (register: string) => Schema | null;
  /** The field a list's rows are named by, for a walk that says what each step is. Absent names each by its day. */
  titleOf?: ((register: string) => string | null) | undefined;
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
  /**
   * The record's vital signs now, as Health reads them (`readSigns` in `signs.ts`), for `signs-red`. HANDED IN AND NOT
   * IMPORTED: `signs.ts` reaches `flow.ts`, which imports this file, and importing it here broke the kernel's own load.
   * Absent, `signs-red` says nothing.
   */
  signs?: (() => readonly Pick<VitalSign, 'sign' | 'state'>[]) | undefined;
  /**
   * The build this host runs, for the door's `behind` (`record.door`): a session whose marks named another is behind.
   * The kernel does not know its host's build, so the host hands it in. Absent, `behind` says nothing.
   */
  build?: string | null | undefined;
};

/** What a money sum needs to add across currencies: the currency, the rates, today, and the field that dates a row. */
type Across = { into: string | null; home: string | null; rates: readonly Rate[]; today: string; day: string | null; halves?: true; point?: true };

/** What a reading says of a sum added up across currencies, before its rows and its verdict (`across` in `fx.ts`). */
export type AcrossSaid = Pick<Reading, 'value' | 'unit' | 'parts' | 'fx' | 'atLeast' | 'noRate'>;

/**
 * One answer of `across` as a reading says it, the one place both the declared figures and the rolled ones read it.
 *
 * AN AT-LEAST SUM IS SAID IN PARTS, THE CONVERTED AMOUNT FIRST AND WHAT NO RATE REACHED AFTER IT, with `atLeast` and
 * `noRate` beside them. It is never a `value`, so nothing compares it, holds it to a target, subtracts it or draws it
 * as a plain total. `whole` false is a half of a ratio or a diff, or any reader that cannot say a bound: it gets one
 * amount a currency, unconverted, as before `atleast` existed. A part left out at exactly nought is not listed, and a
 * sum with nothing else left out is simply converted.
 */
export function acrossSaid(said: Added, amounts: readonly Amount[], into: string | null, home: string | null, whole = true): AcrossSaid {
  if (said.kind === 'one') return { value: said.amount, unit: said.currency };
  const dated = said.kind === 'parts' ? null : { into, home, asOf: said.asOf || null, forward: said.forward, stale: said.stale, ...(said.pairs ? { pairs: said.pairs } : {}) };
  if (said.kind === 'converted') return { value: said.amount, unit: said.currency, fx: { ...dated!, asOf: said.asOf, missing: [] } };
  if (isAtLeast(said)) {
    const left = said.left.filter((p) => p.amount !== 0);
    if (left.length === 0) return { value: said.amount, unit: said.currency, fx: { ...dated!, missing: [] } };
    const missing = said.missing.map((c) => `${c} to ${said.currency}`).sort();
    if (whole && left.length > 0)
      return { value: null, unit: null, parts: [{ currency: said.currency, amount: said.amount }, ...left], atLeast: true, noRate: left, fx: { ...dated!, missing } };
    return { value: null, unit: null, parts: partsOf(amounts), fx: { into, home, asOf: null, forward: false, stale: false, missing } };
  }
  return { value: null, unit: null, parts: said.parts, fx: { into, home, asOf: null, forward: false, stale: false, missing: said.missing } };
}

/** The day `n` days before a day, as text. Noon UTC is only a place to do the subtraction. */
const daysBefore = (day: string, n: number): string => new Date(Date.parse(`${day}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

/**
 * HOW MANY DAYS WITH NO RATE PUBLISHED A POINT'S RATE MAY REACH BACK OVER, past the day before the amount's own day.
 *
 * A RATES ADDRESS PUBLISHES ON WORKING DAYS. Held to the day before and no further, an amount of a Sunday or a Monday
 * had only Friday's rate to be priced at and was never a point: no rate of the Saturday or the Sunday ever arrives, so
 * the night after did not fill the day in either, and every line over two currencies had a hole each weekend. Three
 * is a weekend and a bank holiday beside it, and the four days markets close over Easter: Thursday's rate prices the
 * Monday. `rateFor` hands back the newest rate on or before the day, so the days reached over are days this record
 * holds no rate of, which is all "not published" can mean here.
 */
export const RATE_QUIET_DAYS = 3;

/**
 * Each pair a kept point has no rate for, as `USD to EGP`, in code order: none at all, only a later one standing in, or
 * one older than the day before the amount's own day and `RATE_QUIET_DAYS` more (`today` for an amount whose row has
 * no day).
 *
 * THE DAY IS THE AMOUNT'S, as `across` converts each amount at its own day's rate: a bill of the 3rd read in a point of
 * the 30th was priced on the 3rd, and it is the 3rd's rate that has to be there.
 *
 * AN AMOUNT DATED AFTER THE POINT IS HELD TO THE POINT'S DAY. A bill due on the 30th, read on the 16th, has no rate of
 * the 30th to wait for, and held to its own day a figure of what is still to come would never be a point at all.
 */
export function farRates(amounts: readonly Amount[], into: string, rates: readonly Rate[], today: string): string[] {
  const far = new Set<string>();
  const point = today.slice(0, 10);
  /* One answer a currency and day: a figure over a year of rows asks for the same few pairs over and over. */
  const seen = new Map<string, boolean>();
  for (const a of amounts) {
    if (a.currency === into) continue;
    const day = (a.day ?? today).slice(0, 10);
    const key = `${a.currency} ${day}`;
    let isFar = seen.get(key);
    if (isFar === undefined) {
      /* The rate `across` converts this amount with, so what is judged is what was used. */
      const r = rateFor(rates, a.currency, into, day);
      isFar = !r || r.forward || r.as_of < daysBefore(day > point ? point : day, 1 + RATE_QUIET_DAYS);
      seen.set(key, isFar);
    }
    if (isFar) far.add(`${a.currency} to ${into}`);
  }
  return [...far].sort();
}

/**
 * What a kept point says of amounts it cannot price on their own days: one amount a currency, no `value`, and each
 * pair named in `fx.missing`. `null` when every rate is near enough, and the figure is then read as any other is.
 */
export function pointSaid(amounts: readonly Amount[], into: string | null, home: string | null, rates: readonly Rate[], today: string, kind: Reduce = 'sum'): AcrossSaid | null {
  if (into === null) return null;
  const missing = farRates(amounts, into, rates, today);
  if (missing.length === 0) return null;
  return { value: null, unit: null, parts: partsOf(amounts, kind), fx: { into, home, asOf: null, forward: false, stale: false, missing } };
}

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
export function clockOf(ctx: Pick<EvalContext, 'asOfMs' | 'nowMs' | 'tz'>): number {
  if (ctx.asOfMs !== undefined) return ctx.asOfMs;
  return ctx.tz === undefined ? ctx.nowMs : Date.parse(`${localDate(ctx.nowMs, ctx.tz)}T12:00:00Z`);
}

/**
 * `predicateOf` without the local instants, for `evaluateMetric`, which needs the bare days.
 *
 * `endedAt` finds a window's first day with `startOf`, which takes the first ten characters of a bound. Handed the
 * instants `localInstants` writes, that is the UTC date of local midnight, the day before east of UTC, so a window over
 * a declared `instant` that begins on the as-of day would read as one beginning the day before and take an as-of end it
 * should not have. It was measured on `created_at` in `Asia/Tokyo` (`test/metrics-live-local-day.test.ts`), which no
 * longer shows it: `created_at` and `updated_at` now take the end wherever the window begins (`endedAt`). So the metric
 * resolves here, writes its ends, and dates the instants last, which is the order `snapshot` has always read in.
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
  return parseWhere(withoutNobody(where, schema), schema, { nowMs, ...refDeps(ctx) });
}

/**
 * `<field> is not someone else` ON A LIST WITH NO SUCH FIELD IS LEFT OUT: nobody else can hold a row that has nowhere to
 * say who holds it. Work's "yours" says `owner is not someone else` (unassigned or yours), and Work is also installed
 * where People is not, so its Owner field is not there. The clause is whole between commas, so no value is cut.
 */
function withoutNobody(where: string, schema: Schema): string {
  if (!/ is not someone else/iu.test(where)) return where;
  return where
    .split(',')
    .filter((clause) => {
      const m = /^\s*([a-z_][a-z0-9_]*) is not someone else\s*$/iu.exec(clause);
      return m === null || Object.hasOwn(schema.fields, m[1]!);
    })
    .join(',');
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
 * `{field: 'thing', is: 'things#1'}` REACHED SQL AS THE STRING, and no row's `thing` holds the string `things#1`: it
 * holds the row id `create` resolved that same string to. Measured over the seed, the tree the `list` tool teaches
 * answered ok with 0 rows on a project with 14 tasks, `{is: 'Kiln'}` answered 0, `{not: 'things#1'}` answered all 27
 * tasks with Kiln's 14 among them, and `{is: 'Nowhere'}` answered ok with 0 where a refusal was owed. That is 80 of the
 * 93 task reads one working set of agents made, returning an empty board that reads as "nothing to do".
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
    /* AND INSIDE A HOP, against the list it hops to (stands-50): `on after -90d` in a `pointed` reached SQL as the text
       '-90d' and matched every day. */
    const hop = (node as { pointed?: { register?: unknown; where?: Predicate } }).pointed;
    if (hop && typeof hop === 'object' && typeof hop.register === 'string' && hop.where !== undefined) {
      const there = schema.schemaOf?.(hop.register);
      if (!there) return node;
      const inner = resolveRelative(hop.where, there, nowMs);
      bad.push(...inner.bad);
      return { pointed: { ...hop, where: inner.predicate } } as Predicate;
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

/** A reader of a source no list holds: the record's database, the read's context, and the figure as declared. */
export type SourceReader = (sql: Sql, ctx: EvalContext, decl: MetricDecl) => Result<Reading>;

/**
 * THE SOURCES THAT ARE NO LIST'S, BY THEIR WORD, each with its reader (`built-in-figures.ts`). A later source is one line
 * here, and `evaluateMetric` asks this before it reads a list.
 *
 * `governance.open`: the open questions, which are not rows of a list; `questions-open:<what>` comes with its `about`
 * filled and counts that one thing's. `record.signs`: what arrives and what runs. `sessions.working`: how many
 * agents are working now, by the one clock (`presence.ts`). `handoffs.open`: the steps left for the next run.
 * `record.vitals`: `signs-red` and `green-days`. `record.rates`: how old the newest rate is.
 * `record.door`: the agent door's own signs. `record.places`: projects with no repository or folder, and
 * `record.keys`: keys whose sealed value cannot be opened, and `record.key-scan`: keys written in plain text
 * (`key-scan.ts`). `record.lists` and `record.paths`: what the night counted, the lists that shrank with nothing deleted
 * and the placeholders that name nothing. Each answers no value, never nought, with nothing to read.
 *
 * BUILT ON THE FIRST READ, NOT AS THE FILE LOADS: `built-in-figures.ts` reaches back here through `handoff.ts` and the
 * rest, so a table built at load could meet its words before they were set, and break the kernel's own load.
 */
let readers: Readonly<Record<string, SourceReader>> | null = null;
export const sourceReaders = (): Readonly<Record<string, SourceReader>> => (readers ??= {
  [GOVERNANCE_OPEN]: readOpenQuestions,
  [RECORD_SIGNS]: readSign,
  [SESSIONS_WORKING]: (sql, ctx, decl) => readRunsWorking(sql, ctx, decl),
  [HANDOFFS_OPEN]: readHandoffsOpen,
  [RECORD_TIDY]: readTidy,
  [RECORD_VITALS]: readVitals,
  [RECORD_RATES]: (_sql, ctx, decl) => readRatesAge(ctx, decl),
  [RECORD_DOOR]: readDoor,
  [RECORD_PLACES]: readProjectsUnplaced,
  [RECORD_KEYS]: readKeysUnopenable,
  [RECORD_MARKS]: readMarksUnknown,
  [RECORD_PEOPLE]: readPeopleTwice,
  [RECORD_KEY_SCAN]: readKeysInText,
  [RECORD_LISTS]: readListsShrunk,
  [RECORD_PATHS]: readDeadPaths,
  [RECORD_ACTIVITY]: readActivity,
  [RECORD_WORKED]: readWorked,
});

/**
 * Read one metric.
 *
 * The refusals come first and ALL of them come back, because a declaration with three things wrong
 * with it fixed one at a time is three round trips for whoever is writing it.
 */
export function evaluateMetric(sql: Sql, decl: MetricDecl, ctx: EvalContext): Result<Reading> {
  /* A SOURCE THAT IS NO LIST'S IS READ BY ITS OWN READER, by its word (`sourceReaders`). */
  const table = sourceReaders();
  const reader = Object.hasOwn(table, decl.source) ? table[decl.source]! : null;
  if (reader) return reader(sql, ctx, decl);
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
     it has no verdict until then (`verdictOf`), and it is not malformed. */
  const shape = decl.target as { lte?: unknown; gte?: unknown; setting?: unknown } | undefined;
  const waiting = shape !== undefined && typeof shape.setting === 'string' && shape.lte === undefined && shape.gte === undefined;
  if (decl.target && typeof bound !== 'number' && !waiting)
    at('VALUE_MALFORMED', "target takes a number in the figure's own units: { lte: 400000 } for money in minor units", 'target');

  if (!decl.window) at('REQUIRED_MISSING', 'a number with no comparison window is a number you cannot act on', 'window');
  const shift = decl.window ? windowMs(decl.window) : null;
  if (decl.window && shift === null) at('VALUE_MALFORMED', `${decl.window} is not a window: write 30d, 4w or 3m`, 'window');

  /* A FIGURE OVER A KEPT LINE: `series.<figure>` reads the points that figure's nights wrote, and the one thing
     this build asks of them is how many days of the window hold none (`readSeriesGaps`). Anything else over a line is
     still a source this build does not read, as it was before it read this, and says what it does read. */
  if (decl.source.startsWith('series.')) {
    const value = decl.value as { count?: unknown };
    if (keysOf(decl.value).join() !== 'count' || value.count !== 'missing')
      at('SOURCE_UNKNOWN', `${decl.source} is read only as { count: missing }, how many days of its window hold no point`, 'source');
    if (decl.source === 'series.') at('SOURCE_UNKNOWN', 'series. names no figure: write series.<figure>', 'source');
    if (refusals.length) return { ok: false, refusal: refusals[0]! };
    return readSeriesGaps(sql, decl, ctx, shift!);
  }

  /* A FIGURE OVER WHO MADE A LIST'S ENTRIES: `events.<list>` reads the history for who made each entry of one
     list, and the one thing this build asks of it is how many were made in the window (`readMade`). Its `where` narrows by
     who and by nothing else, because the entries' own fields are `register.<list>`'s to ask about. */
  if (decl.source.startsWith('events.')) {
    const list = decl.source.slice('events.'.length);
    const value = decl.value as { count?: unknown; field?: unknown };
    /* OR HOW MANY HAD ONE FIELD CHANGED (AGT-C17 job c), "skills changing" beside learnings arriving: `{ count: changed,
       field: rev }` over `events.skills` is the skills that took a new version. Read in its own reader (`readChanged`). */
    const changed = keysOf(decl.value).sort().join() === 'count,field' && value.count === 'changed';
    if (!changed && (keysOf(decl.value).join() !== 'count' || value.count !== 'made'))
      at('SOURCE_UNKNOWN', `${decl.source} is read only as { count: made }, how many of the list's entries were made in its window, or { count: changed, field: <a field> }, how many had that field changed`, 'source');
    if (list === '') at('SOURCE_UNKNOWN', 'events. names no list: write events.<list>', 'source');
    else if (!ctx.schemaOf(list) || (ctx.reads !== undefined && !ctx.reads(list))) at('REGISTER_UNKNOWN', `there is no list called ${list}`, 'source');
    if (changed) {
      const schema = list === '' ? undefined : ctx.schemaOf(list);
      const field = value.field;
      if (schema && (typeof field !== 'string' || !Object.hasOwn(schema.fields, field)))
        at('FIELD_UNKNOWN', `${list} has no field called ${String(field)} to count the changes of`, 'value');
      if (decl.where !== undefined) at('DECLARATION_INVALID', `${decl.source} counts every change of ${String(field)} in its window: leave where out`, 'where');
      if (decl.bucket === undefined && decl.group_by !== undefined)
        at('DECLARATION_INVALID', `${decl.source} is cut only by the day of each change: leave group_by out, or write group_by: at with a bucket`, 'group_by');
      if (decl.bucket !== undefined && !isBucket(decl.bucket)) at('DECLARATION_INVALID', `${String(decl.bucket)} is not a bucket`, 'bucket');
      else if (decl.bucket !== undefined && decl.group_by !== 'at')
        at('DECLARATION_INVALID', `${decl.source} is cut by the day of each change: write group_by: at beside the bucket`, 'group_by');
      if (refusals.length) return { ok: false, refusal: refusals[0]! };
      return readChanged(sql, decl, ctx, shift!, list, field as string);
    }
    if (decl.bucket !== undefined) at('DECLARATION_INVALID', `${decl.source} is one count over its window, with no line through time: leave bucket out`, 'bucket');
    else if (decl.group_by !== undefined && decl.group_by !== 'by')
      at('DECLARATION_INVALID', `${decl.source} is read in parts by who made each entry, and by nothing else: leave group_by out, or write by`, 'group_by');
    const who = madeBy(decl.where, list, clockOf(ctx));
    for (const r of who.bad) at(r.code, r.fix, 'where');
    if (refusals.length) return { ok: false, refusal: refusals[0]! };
    return readMade(sql, decl, ctx, shift!, list, who.predicate);
  }

  /* CASH ROLLED FORWARD AND THE WALK AHEAD ARE READ IN THEIR OWN FILE (`money-figures.ts`), after the two keys every
     figure needs and before anything that assumes one aggregation over one list. */
  /* A SUM OF FIGURES reads each part back through here and adds the readings (`readSumOf`). */
  if (isSumOf(decl.value)) {
    if (refusals.length) return { ok: false, refusal: refusals[0]! };
    return readSumOf(sql, decl, ctx);
  }
  /* AND ONE SUM AS A SHARE OF ANOTHER, each half read as a sum is (`readRatioOf`). */
  if (isRatioOf(decl.value)) {
    if (refusals.length) return { ok: false, refusal: refusals[0]! };
    return readRatioOf(sql, decl, ctx);
  }
  if (isRolled(decl.value) || isWalked(decl)) {
    if (refusals.length) return { ok: false, refusal: refusals[0]! };
    return isWalked(decl) ? readWalk(sql, decl, ctx) : readRolled(sql, decl, ctx);
  }
  /* AND A FIGURE CHECKED AGAINST ITS OWN ENTRIES (`readCrosscheck`), which reads the figure it checks back through here. */
  if (isCrosscheck(decl.value)) {
    if (refusals.length) return { ok: false, refusal: refusals[0]! };
    return readCrosscheck(sql, decl, ctx);
  }
  /* AND A TREND, which reads the figure it is of back through here and hands its buckets to `trend.ts`. */
  if (isShape(decl.value, 'trend')) {
    if (refusals.length) return { ok: false, refusal: refusals[0]! };
    return readTrend(sql, decl, ctx);
  }
  /* AND A STREAK, the days or weeks in a row that hold an entry (`readStreak`), for a habit kept up. */
  if (isShape(decl.value, 'streak')) {
    if (refusals.length) return { ok: false, refusal: refusals[0]! };
    return readStreak(sql, decl, ctx);
  }

  const register = decl.source.startsWith('register.') ? decl.source.slice('register.'.length) : null;
  /* A WORD NO READER HOLDS IS REFUSED BY NAME, with the words this build does read, so `record.dor` is told it is not a
     source and which ones are, not that it is no register. */
  if (!register)
    at(
      'SOURCE_UNKNOWN',
      `${decl.source} is not a source this build reads. It reads register.<list>, series.<figure>, events.<list>, or one of ${Object.keys(sourceReaders()).join(', ')}`,
      'source',
    );
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
  /* A DIFFERENCE'S HALVES MAY NAME THE GROUPING THEMSELVES, and from here on it is the figure's own: one
     field, read once, by everything below. Two fields are refused by name, as every half's `group_by` was before. */
  const lifted = liftedGrouping(decl);
  if (lifted.said) at('NOT_IN_THIS_BUILD', lifted.said, 'group_by');
  decl = lifted.decl;

  /* A RUNNING TOTAL IS A SUM, WALKED. From here on the figure is the sum of the field it names, so the
     field, the `where`, the currencies and the as-of day are checked and read by everything a sum is read by, and the
     walk is one more read at the end (`crossedAt`). */
  const run = runningOf(decl, schema, register, at, ctx.schemaOf);
  if (run) decl = { ...decl, value: { sum: run.sum } };

  for (const word of keysOf(decl.value)) {
    if ((UNREAD as readonly string[]).includes(word))
      at('NOT_IN_THIS_BUILD', `${word} is a published shape this build does not read, so its figure would be the ungrouped one`, 'value');
    /* Read above when it is the whole value, so one met here is inside a ratio or a difference. */
    if ((WHOLE_SHAPES as readonly string[]).includes(word))
      at('NOT_IN_THIS_BUILD', `${word} is a figure of its own in this build, never half of a ratio or a difference; declare it as its own figure`, 'value');
  }

  /**
   * THE GROUPING, WHICH IS READ NOW, AND CHECKED AGAINST THE REGISTER IT GROUPS.
   *
   * `08 §2.1`'s rules: one field; a `bucket` only beside a day or an instant, and a day or an instant
   * only with one, because a bar per distinct date is a list rather than a chart. A ratio of groups
   * is a second dimension of arithmetic this build does not do, so it says so.
   *
   * A DIFFERENCE IS GROUPED: both halves are read over one part's entries and subtracted there, so each part
   * answers its own difference (`groupsOf`). It was refused with the ratio, and Money could not say which category
   * moved against last month.
   *
   * WHEN A ROW WAS WRITTEN GROUPS TOO: `created_at` and `updated_at`, the two instants the record stamps (`isStamped`).
   * No register declares them, so this asked `schema.fields` alone and refused `group_by: created_at` as
   * `FIELD_UNKNOWN`, and a count of what was added each week could not be declared over any list. The other names the
   * record keeps in a column, `id`, `seq` and `version`, are not dates, and a grouping by one is a bar per row, so they
   * are still refused.
   */
  if (decl.group_by !== undefined) {
    const by = typeof decl.group_by === 'string' ? decl.group_by : null;
    const type = by && schema && (Object.hasOwn(schema.fields, by) || isStamped(schema, by)) ? typeOf(schema, by) : undefined;
    const dated = type === 'day' || type === 'instant';
    if (by === null) at('DECLARATION_INVALID', 'group_by is one field name', 'group_by');
    else if (schema && type === undefined) at('FIELD_UNKNOWN', `${register} has no field called ${by}`, 'group_by');
    else if (dated && decl.bucket === undefined) at('DECLARATION_INVALID', `${by} is a date, so group_by needs a bucket: day, week, month, quarter or year`, 'bucket');
    else if (!dated && schema && decl.bucket !== undefined) at('DECLARATION_INVALID', `a bucket cuts a date, and ${by} is a ${type}`, 'bucket');
    if (decl.bucket !== undefined && !isBucket(decl.bucket)) at('DECLARATION_INVALID', `${String(decl.bucket)} is not a bucket`, 'bucket');
    if ('ratio' in decl.value) at('NOT_IN_THIS_BUILD', 'a ratio is not grouped in this build; group each half as its own figure', 'group_by');
  } else if (decl.bucket !== undefined) at('DECLARATION_INVALID', `buckets by ${String(decl.bucket)} and groups by nothing`, 'bucket');

  /* THE WINDOW A DIFFERENCE TAKES ITS SECOND HALF FROM IS ONE OF THREE WORDS, and such a difference is never cut by date:
     its halves hold different dates, so a bar for a week would be that week less nothing. */
  const before = 'diff' in decl.value ? (decl.value.diff as { before?: unknown } | null)?.before : undefined;
  if (before !== undefined) {
    if (!(BEFORE as readonly unknown[]).includes(before)) at('DECLARATION_INVALID', `${String(before)} is not a window before: write ${BEFORE.join(', ')}`, 'value');
    if (decl.bucket !== undefined) at('DECLARATION_INVALID', 'a difference against the window before is grouped by a field and never cut by date, because its halves hold different dates', 'bucket');
  }

  const fields = aggregationsOf(decl.value);
  if (fields.length === 0) at('VALUE_MALFORMED', 'a value is an aggregation, a ratio or a diff', 'value');
  /* A FIGURE THAT ONLY ADDS UP THE MONEY A ROW'S PARTS ADD UP TO READS A SPLIT ROW AS ITS PARTS (`row-parts.ts`): its total
     is the same either way, and a cut or a clause by a field the parts carry, a category, reads each part under its own.
     A count is never read so, since a row split in three is still one row. */
  const split = splitOf(schema);
  if (register && split && fields.length > 0 && fields.every((f) => f.kind === 'sum' && f.field === split.of && f.lookup === undefined)) sql = bySplit(sql, register, split);
  /* `past` WAITS A WHOLE NUMBER OF DAYS, and a `by` it cannot read is refused: read as none, a line three days late
     and a line due yesterday would be the same count under a declaration that says otherwise. */
  const waits = pastFault(decl.value);
  if (waits !== null) at('VALUE_MALFORMED', waits, 'value');
  if (schema)
    for (const f of fields) {
      for (const id of [f.field, f.by].filter((x): x is string => typeof x === 'string'))
        if (id !== 'id' && !Object.hasOwn(schema.fields, id) && !(f.kind === 'age' && isStamped(schema, id))) at('FIELD_UNKNOWN', `${register} has no field called ${id}`, 'value');
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
  /* A FIGURE ABOUT ONE ROW THAT SAYS ITS OWN CURRENCY IS READ IN IT (`scopeCurrency`), and every other in the home one. */
  const own = isMoneyFigure(schema, decl.value) ? scopeCurrency(sql, schema, scope.predicate, ctx) : null;
  const fx: Across = {
    into: own ?? held.home,
    home: held.home,
    rates: held.rates,
    /* The local day on a live read in a zone, as the predicate's `today` is (`clockOf`). */
    today: new Date(clockOf(ctx)).toISOString().slice(0, 10),
    day: dayFieldOf(schema.fields),
    ...(ctx.point ? { point: true as const } : {}),
  };
  /**
   * AND UNDER `asOfMs` THE CURRENT WINDOW ENDS AT THE AS-OF DAY, as the window before ends at its own.
   *
   * A start with no end ends at the clock, and the clock the rows are compared against is the real one, which under
   * `asOfMs` is days or months later than the day asked about. `on after -30d` read as of sixty days back counted every
   * row dated after that day up to now: it measured 14,300,000 in four rows where the thirty days to the as-of day hold
   * 300,000 in two, and `snapshot` backfills every missing day this way. `test/metrics-asof-end.test.ts` holds it. A
   * live read is not given the end, because a live window has always counted a row dated ahead of today and that is not
   * what was wrong here.
   */
  const current = localInstants(
    ctx.asOfMs === undefined ? said.predicate : endedAt(said.predicate, null, schema, ctx.asOfMs),
    schema,
    ctx.tz,
  );
  /**
   * A DIFFERENCE AGAINST THE WINDOW BEFORE (`diff.before`) READS ITS SECOND HALF THERE: the same words at a
   * moved clock, ended at that clock's day and never past the day this window starts, which is the window the
   * comparison below reads and is built the same way. `moved` is whether the words name a day at all.
   */
  const halved = ((word: Before | undefined) => {
    if (word === undefined) return null;
    const anchor = clockOf(ctx);
    const moveTo = word === 'year_ago' ? yearBefore(anchor) : word === 'month_ago' ? monthBefore(anchor) : anchor - shift!;
    const shifted = resolvedOf(decl.where, schema, { ...ctx, asOfMs: moveTo });
    return {
      predicate: localInstants(endedAt(shifted.predicate, said.predicate, schema, moveTo), schema, ctx.tz),
      moved: JSON.stringify(shifted.predicate) !== JSON.stringify(said.predicate),
      noise: word === 'previous' && shift! < 7 * DAY,
    };
  })(before as Before | undefined);
  /* THE GATE A CHANGE BETWEEN THE TWO HALVES PASSES, for the whole figure and for each part on its own (`comparisonOf`). */
  const change = (a: { value: number | null; rows: number }, b: { value: number | null; rows: number }): { delta: number | null; why: string } =>
    halved?.noise
      ? { delta: null, why: 'a window under seven days is noise' }
      : halved && !halved.moved
        ? { delta: null, why: 'the predicate does not mention time, so the window moves nothing' }
        : comparisonOf(a, b, true);
  const now = read(sql, current, schema, decl, tablesOf(decl), fx, halved ? { before: halved } : {});
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

  /* A RUNNING TOTAL ANSWERS HERE: the sum just read, or the total as it stood at the first entry to reach its line.
     It has no window before, because the walk is over every entry the `where` chose and a moved clock moves the stop. */
  if (run) {
    const stop = lineAt(sql, schema, run, said.predicate, now.value, fx, ctx);
    if ('fault' in stop) return no<Reading>('DECLARATION_INVALID', `${decl.metric}: ${stop.fault}`, { at: 'value' });
    const crossed = crossedAt(sql, schema, run, stop.line, current, now.value, fx);
    const value = crossed ? crossed.value : now.value.value;
    const verdict = verdictOf(decl, value, now.value.unit, fx.rates, fx.today);
    const inScope = heldBy(sql, schema, scope.predicate);
    return ok({
      ...now.value,
      value,
      held: inScope,
      delta: null,
      why: decl.compare === 'none' ? 'no comparison asked for' : 'a running total is not compared with a window before',
      met: heldVerdict(verdict.met, inScope),
      ...(verdict.targetIn ? { targetIn: verdict.targetIn } : {}),
      ...(crossed ? { crossed } : {}),
    });
  }

  /* THE COMPARISON IS THE SAME PREDICATE AGAINST A MOVED CLOCK, which is why a predicate with no
     dated clause compares a set with itself: the delta is then structurally zero, and reporting that
     as "no change" would be a fact about the arithmetic dressed as a fact about the business. */
  let delta: number | null = null;
  let why = '';
  /* A DIFFERENCE AGAINST THE WINDOW BEFORE IS ITS OWN COMPARISON: `of` against `per`, whatever `compare` says. */
  if (halved && now.value.halves) ({ delta, why } = change({ value: now.value.halves.of, rows: now.value.rows }, { value: now.value.halves.per, rows: now.value.halves.perRows }));
  else if (decl.compare === 'none' || shift === null) why = 'no comparison asked for';
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
    } else ({ delta, why } = comparisonOf(now.value, before.value));
  }

  const grouped = decl.group_by === undefined ? null : groupsOf(sql, current, schema, decl, ctx, fx, halved ? { predicate: halved.predicate, change } : undefined);
  if (grouped && !grouped.ok) return grouped;

  const { met, targetIn } = verdictOf(decl, now.value.value, now.value.unit, fx.rates, fx.today);
  /* ONE MORE `count(*)` ON A TABLE THIS FIGURE HAS ALREADY COUNTED ONCE, and it is counted here
     rather than inside a scan because it is a fact about the scope and not about an aggregation:
     the comparison window, the two halves of a ratio and every group are all the same rows under a
     narrower predicate, so each of them reading it would be the same query several times over. */
  const inScope = heldBy(sql, schema, scope.predicate);
  const reduced = fields.filter((f) => REDUCING.has(f.kind)).map((f) => f.field).filter((f): f is string => typeof f === 'string');
  const unsaid = now.value.rows === 0 && inScope > 0 && requiresFilled(said.predicate, reduced);
  return ok({
    ...now.value,
    ...backsOf(sql, schema, decl.value, current),
    held: inScope,
    ...(unsaid ? { unsaid: true as const } : {}),
    delta,
    why,
    met: heldVerdict(met, inScope),
    ...(targetIn ? { targetIn } : {}),
    ...(grouped ? grouped.value : {}),
  });
}

/** How many entries a sum names in `backs`; the rest are counted in `backsMore`. */
export const BACKS_CAP = 50;

/**
 * The entries a plain sum added, for `Reading.backs`: the ones its `where` chose that hold the summed field, read once
 * for the figure itself and never for its comparison window or its groups, which are the same entries under a narrower
 * `where`. Two short reads on the list the figure has just scanned.
 */
function backsOf(sql: Sql, schema: Schema, value: Value, predicate: Predicate | undefined): Pick<Reading, 'backs' | 'backsMore'> {
  if (!('sum' in value)) return {};
  const field = typeof value.sum === 'string' ? value.sum : value.sum.product[0];
  const w = compile(predicate, schema);
  if (w.bad.length) return {};
  /* THE SUM'S OWN TEST OF WHAT IT ADDS (`one`): the amount of a money, the value of a quantity, never the pair. */
  const type = schema.fields[field]?.type;
  const held = `${jsonPath(field)}${type === 'money' ? '.amount' : type === 'quantity' ? '.value' : ''}`;
  const where = `register = ? AND deleted_at IS NULL AND ${w.sql} AND json_extract(fields, ?) IS NOT NULL`;
  const params = [schema.register, ...w.params, held];
  const added = Number(sql.one<{ n: number }>(`SELECT count(*) AS n FROM entry WHERE ${where}`, ...params)?.n ?? 0);
  if (added === 0) return {};
  const backs = sql
    .all<{ seq: number }>(`SELECT seq FROM entry WHERE ${where} AND seq IS NOT NULL ORDER BY seq LIMIT ${BACKS_CAP}`, ...params)
    .map((r) => `${schema.register}#${r.seq}`);
  if (backs.length === 0) return {};
  return { backs, ...(added > backs.length ? { backsMore: added - backs.length } : {}) };
}

/* ── a running total and a trend ─────────────────────── */

/** Whether a value is the shape called `word` at its top: `{ running: … }`, `{ trend: … }`. */
const isShape = (value: unknown, word: string): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, word);

/**
 * A running total as declared: the field added up, the field walked in order of, and the line it stops at. The line is
 * a number (`until`), or what one row holds (`from`): `field` of the row the figure's `where` holds its ref `of` to.
 */
type Running = { sum: string; order: string; until: number | null; from: { field: string; of: string } | null };

/** What a running total adds up and what it is walked in order of, by field type: the two lists install checks by (`declare.ts`). */
const SUMMED: ReadonlySet<string> = new Set(['money', 'int', 'decimal', 'duration', 'quantity']);
const ORDERED: ReadonlySet<string> = new Set(['day', 'instant', 'int', 'decimal']);

/**
 * The running total a figure declares, or `null` when it declares none or one that cannot be read, each fault said
 * through `at`. The field it adds up is not checked here: the figure becomes that field's sum, and a sum's own checks
 * name a field that is not there or is not a number.
 */
function runningOf(
  decl: MetricDecl,
  schema: Schema | null,
  register: string | null,
  at: (code: string, fix: string, key?: string) => void,
  schemaOf: EvalContext['schemaOf'],
): Running | null {
  if (!isShape(decl.value, 'running')) return null;
  const body = (decl.value as unknown as { running: unknown }).running;
  const shape = body !== null && typeof body === 'object' && !Array.isArray(body) ? (body as { sum?: unknown; order?: unknown; until?: unknown }) : null;
  const stop = shape?.until as { gte?: unknown } | null | undefined;
  const lined = stop !== null && typeof stop === 'object' && !Array.isArray(stop) && Object.keys(stop).join() === 'gte';
  const line = lined && typeof stop.gte === 'number' && Number.isFinite(stop.gte) ? stop.gte : null;
  /* OR A FIELD OF THE ROW A PARAMETER NAMES: `{ gte: { field: budget, of: category } }`, a category's own budget. */
  const row = lined && stop.gte !== null && typeof stop.gte === 'object' && !Array.isArray(stop.gte) ? (stop.gte as { field?: unknown; of?: unknown }) : null;
  const from = row && Object.keys(row).sort().join() === 'field,of' && typeof row.field === 'string' && row.field !== '' && typeof row.of === 'string' && row.of !== '' ? { field: row.field, of: row.of } : null;
  let good = true;
  const bad = (code: string, fix: string, key = 'value'): void => {
    good = false;
    at(code, fix, key);
  };
  if (!shape || typeof shape.sum !== 'string' || shape.sum === '') bad('VALUE_MALFORMED', 'a running total takes sum: the money or number field it adds up, as { running: { sum: amount, order: due } }');
  if (!shape || typeof shape.order !== 'string' || shape.order === '') bad('VALUE_MALFORMED', 'a running total takes order: the day or number field it walks in order of, as { running: { sum: amount, order: due } }');
  if (shape && shape.until !== undefined && !lined)
    bad('VALUE_MALFORMED', "the line a running total stops at is until: { gte: 500000 }, a number in the figure's own units");
  /* A line read off a setting installs and has no reader yet. */
  if (shape && shape.until !== undefined && lined && line === null && from === null)
    bad('NOT_IN_THIS_BUILD', "this build reads the line a running total stops at as a number, until: { gte: 500000 }, or as a field of the row its where names, until: { gte: { field: budget, of: category } }, and not yet as a setting");
  if (!good || !shape) return null;
  const order = shape.order as string;
  if (schema) {
    const type = Object.hasOwn(schema.fields, order) || isStamped(schema, order) ? typeOf(schema, order) : undefined;
    if (type === undefined) at('FIELD_UNKNOWN', `${register} has no field called ${order}`, 'value');
    else if (!ORDERED.has(type)) at('VALUE_MALFORMED', `a running total walks in order of a day or a number, and ${order} is a ${type}`, 'value');
    const summed = Object.hasOwn(schema.fields, shape.sum as string) ? schema.fields[shape.sum as string]?.type : undefined;
    if (summed !== undefined && !SUMMED.has(summed)) at('VALUE_MALFORMED', `a running total adds up money or a number, and ${String(shape.sum)} is a ${summed}`, 'value');
    if (from) {
      const spec = Object.hasOwn(schema.fields, from.of) ? schema.fields[from.of] : undefined;
      const to = spec?.type === 'ref' && typeof spec.to === 'string' && spec.to !== '' ? spec.to : null;
      const there = to === null ? null : schemaOf(to);
      const held = there && Object.hasOwn(there.fields, from.field) ? there.fields[from.field]?.type : undefined;
      if (spec === undefined) at('FIELD_UNKNOWN', `${register} has no field called ${from.of}`, 'value');
      else if (to === null) at('VALUE_MALFORMED', `the line is a field of the row ${from.of} points at, and ${from.of} is a ${spec.type} that points at none`, 'value');
      else if (there && held === undefined) at('FIELD_UNKNOWN', `${to} has no field called ${from.field}`, 'value');
      else if (held !== undefined && !SUMMED.has(held)) at('VALUE_MALFORMED', `the line a running total stops at is money or a number, and ${from.field} is a ${held}`, 'value');
    }
  }
  if (decl.group_by !== undefined || decl.bucket !== undefined)
    at('DECLARATION_INVALID', 'a running total is one walk through its entries and is never cut in parts: leave group_by and bucket out', decl.group_by !== undefined ? 'group_by' : 'bucket');
  return { sum: shape.sum as string, order, until: line, from };
}

/**
 * THE LINE A RUNNING TOTAL STOPS AT, in the units its total is in: the number it declares, or what one row holds.
 *
 * `{ field: budget, of: category }` IS THE BUDGET OF THE ONE CATEGORY THE FIGURE'S `where` HOLDS IT TO, which is how a
 * figure filled for each row of a list (`category is {{it}}`) stops at that row's own line. A `where` that holds the
 * ref to no one row has no line to read and says so. A row that leaves the field empty has none either, and that is
 * not a fault: a category with no budget passed none, and the figure is its total. Money in another currency than the
 * total is converted at today's rate, and with no rate there is no line: two currencies are never compared as they are.
 */
function lineAt(sql: Sql, schema: Schema, run: Running, predicate: Predicate | undefined, total: Read, fx: Across, ctx: Pick<EvalContext, 'reads'>): { line: number | null } | { fault: string } {
  if (run.from === null) return { line: run.until };
  const { field, of } = run.from;
  const to = String(schema.fields[of]?.to ?? '');
  const held = new Set<string>();
  for (const leaf of predicate === undefined ? [] : conjuncts(predicate)) {
    if (leaf.field !== of) continue;
    const one = typeof leaf.is === 'string' ? leaf.is : Array.isArray(leaf.in) && leaf.in.length === 1 && typeof leaf.in[0] === 'string' ? leaf.in[0] : null;
    if (one !== null) held.add(one);
  }
  if (held.size !== 1) return { fault: `the line is ${field} of one row, and where holds ${of} to ${held.size === 0 ? 'none' : 'more than one'}: write ${of} is {{it}}` };
  if (ctx.reads !== undefined && !ctx.reads(to)) return { line: null };
  const row = sql.one<{ v: string | null }>("SELECT json_extract(fields, ?) AS v FROM entry WHERE register = ? AND id = ? AND deleted_at IS NULL", jsonPath(field), to, [...held][0]!);
  const said: unknown = typeof row?.v === 'string' ? JSON.parse(row.v) : (row?.v ?? null);
  if (typeof said === 'number') return { line: Number.isFinite(said) ? said : null };
  if (said === null || typeof said !== 'object') return { line: null };
  const { amount, currency, value } = said as { amount?: unknown; currency?: unknown; value?: unknown };
  if (typeof amount !== 'number') return { line: typeof value === 'number' ? value : null };
  if (total.unit === null || currency === total.unit) return { line: amount };
  const rate = typeof currency === 'string' ? rateFor(fx.rates, currency, total.unit, fx.today.slice(0, 10)) : null;
  return { line: rate ? convertMinor(amount, currency as string, total.unit, rate.rate) : null };
}

/**
 * The first entry a running total reached its line at, or `null`: no line, no one total to walk, or nothing reached it.
 *
 * WALKED IN ORDER OF THE FIELD AND THEN OF WHEN EACH WAS WRITTEN, so two instalments due the same day keep one order
 * from read to read. An entry with nothing in the order field has no place in the walk and goes last, since the total
 * at the end still holds it.
 *
 * TWO CURRENCIES FOLLOW THE SUM. `total` is the sum as `one` read it. Where it has no one number (parts, or an at-least)
 * there is no total to walk and nothing crossed. Where it converted, each amount is converted on its way in at the rate
 * the sum used for it: the rate as of the day its row is about (`across`).
 */
function crossedAt(sql: Sql, schema: Schema, run: Running, line: number | null, predicate: Predicate | undefined, total: Read, fx: Across): Crossed | null {
  if (line === null || total.value === null) return null;
  const w = compile(predicate, schema);
  if (w.bad.length) return null;
  const type = schema.fields[run.sum]?.type;
  const money = type === 'money';
  const held = `json_extract(fields, '${jsonPath(run.sum)}${money ? '.amount' : type === 'quantity' ? '.value' : ''}')`;
  const unit = money ? `json_extract(fields, '${jsonPath(run.sum)}.currency')` : 'NULL';
  const order = isStamped(schema, run.order) ? run.order : `json_extract(fields, '${jsonPath(run.order)}')`;
  const dated = money && fx.day ? `json_extract(fields, '${jsonPath(fx.day)}')` : 'NULL';
  const rows = sql.all<{ id: string; v: number; u: string | null; o: string | number | null; d: string | null }>(
    `SELECT id, ${held} AS v, ${unit} AS u, ${order} AS o, ${dated} AS d FROM entry WHERE register = ? AND deleted_at IS NULL AND ${w.sql} AND ${held} IS NOT NULL ORDER BY (${order} IS NULL), ${order}, rowid`,
    schema.register,
    ...w.params,
  );
  let sum = 0;
  for (const r of rows) {
    let amount = Number(r.v);
    if (money && r.u !== total.unit) {
      /* The sum converted this one, so there is a rate; with none there is no walk to answer from. Nought with no rate
         is the one amount a sum adds without one (`acrossSaid`), and it moves the walk nowhere. */
      const rate = typeof r.u === 'string' && total.unit !== null ? rateFor(fx.rates, r.u, total.unit, (typeof r.d === 'string' ? r.d : fx.today).slice(0, 10)) : null;
      if (!rate && amount === 0) continue;
      if (!rate) return null;
      amount = convertMinor(amount, r.u as string, total.unit as string, rate.rate);
    }
    sum += amount;
    if (sum >= line) return { id: r.id, at: r.o, value: sum };
  }
  return null;
}

/* ── a streak ────────────────────────────────────────── */

/** What a streak counts in a row: days, or weeks from Monday. */
export const STREAK_GRAINS = ['day', 'week'] as const;
export type StreakGrain = (typeof STREAK_GRAINS)[number];
/** The most distinct days a streak reads back: more than two years of days in a row. */
export const STREAK_DAYS_MOST = 800;

/** The Monday a day falls in, as `YYYY-MM-DD`, read in UTC as every day here is. */
const mondayOf = (day: string): string => {
  const at = Date.parse(`${day}T12:00:00Z`);
  const back = (new Date(at).getUTCDay() + 6) % 7;
  return new Date(at - back * DAY).toISOString().slice(0, 10);
};

/**
 * A STREAK: how many days (or weeks, from Monday) in a row up to now hold at least one entry the figure's `where` admits,
 * dated by `on` (a day or an instant the list keeps, or `created_at` when left out). A habit logged every day reads 12
 * on its twelfth day.
 *
 * TODAY DOES NOT BREAK IT. Until the day (or the week) is over, a streak that held yesterday still holds: it is counted
 * from the bucket before when the one the clock is in has nothing yet, and `streak.today` says which, so a tile can say
 * "log today to keep it". A gap of one whole bucket ends it, and a list with nothing in its last two buckets reads 0.
 *
 * ONE READ OF THE DISTINCT DAYS, newest first and `STREAK_DAYS_MOST` at most, so a list of years of entries costs the
 * days it holds and never its rows. No currency, no window and no comparison: the run is its own measure.
 */
function readStreak(sql: Sql, decl: MetricDecl, ctx: EvalContext): Result<Reading> {
  const mine = (fix: string): string => `${decl.metric}: ${fix}`;
  const body = (decl.value as unknown as { streak: unknown }).streak;
  const shape = body !== null && typeof body === 'object' && !Array.isArray(body) ? (body as { on?: unknown; grain?: unknown }) : null;
  if (shape === null) return no<Reading>('VALUE_MALFORMED', mine('a streak is written { streak: { on: <a day field>, grain: day } }, both parts optional'), { at: 'value' });
  const grain = shape.grain === undefined ? 'day' : shape.grain;
  if (!(STREAK_GRAINS as readonly unknown[]).includes(grain)) return no<Reading>('VALUE_MALFORMED', mine(`a streak counts days or weeks in a row, and ${String(grain)} is neither: write grain: day or grain: week`), { at: 'value' });
  if (decl.group_by !== undefined || decl.bucket !== undefined)
    return no<Reading>('DECLARATION_INVALID', mine('a streak is one run of days and is never cut in parts: leave group_by and bucket out'), { at: decl.group_by !== undefined ? 'group_by' : 'bucket' });
  const register = decl.source.startsWith('register.') ? decl.source.slice('register.'.length) : null;
  if (register === null) return no<Reading>('SOURCE_UNKNOWN', mine(`a streak counts the entries of a list, written source: register.<list>, and ${decl.source} is not one`), { at: 'source' });
  const schema = ctx.schemaOf(register);
  if (!schema || (ctx.reads !== undefined && !ctx.reads(register))) return no<Reading>('REGISTER_UNKNOWN', mine(`there is no list called ${register}`), { at: 'source' });
  const on = shape.on === undefined ? 'created_at' : shape.on;
  if (typeof on !== 'string' || on === '') return no<Reading>('VALUE_MALFORMED', mine('a streak names the day each entry falls on as on: <a day or instant field>'), { at: 'value' });
  const type = Object.hasOwn(schema.fields, on) || isStamped(schema, on) ? typeOf(schema, on) : undefined;
  if (type === undefined) return no<Reading>('FIELD_UNKNOWN', mine(`${register} has no field called ${on}`), { at: 'value' });
  if (type !== 'day' && type !== 'instant') return no<Reading>('VALUE_MALFORMED', mine(`a streak is dated by a day or an instant, and ${on} is a ${type}`), { at: 'value' });
  const said = resolvedOf(decl.where, schema, ctx);
  if (said.bad.length) return { ok: false, refusal: said.bad[0]! };
  const w = compile(said.predicate, schema);
  if (w.bad.length) return { ok: false, refusal: w.bad[0]! };
  const dated = isStamped(schema, on) ? on : `json_extract(fields, '${jsonPath(on)}')`;
  const days = sql
    .all<{ d: string | null }>(
      `SELECT DISTINCT substr(${dated}, 1, 10) AS d FROM entry WHERE register = ? AND deleted_at IS NULL AND ${w.sql} AND ${dated} IS NOT NULL ORDER BY d DESC LIMIT ${STREAK_DAYS_MOST}`,
      register,
      ...w.params,
    )
    .map((r) => r.d)
    .filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(d));
  const held = sql.one<{ n: number }>('SELECT count(*) AS n FROM entry WHERE register = ? AND deleted_at IS NULL', register)?.n ?? 0;
  const today = new Date(clockOf(ctx)).toISOString().slice(0, 10);
  const bucketOfDay = (d: string): string => (grain === 'week' ? mondayOf(d) : d);
  const step = (grain === 'week' ? 7 : 1) * DAY;
  const back = (b: string): string => new Date(Date.parse(`${b}T12:00:00Z`) - step).toISOString().slice(0, 10);
  const buckets = new Set(days.filter((d) => d <= today).map(bucketOfDay));
  const now = bucketOfDay(today);
  const has = buckets.has(now);
  let at = has ? now : back(now);
  let run = 0;
  while (buckets.has(at)) {
    run += 1;
    at = back(at);
  }
  const last = days.find((d) => d <= today) ?? null;
  const { met } = verdictOf({ format: decl.format, target: decl.target }, run, null, [], today);
  return ok({
    value: run,
    unit: null,
    rows: days.length,
    held,
    delta: null,
    why: 'a streak is its own measure, with no window before',
    met: heldVerdict(met, held),
    refusals: [],
    streak: { grain: grain as StreakGrain, last, today: has },
  });
}

/** The most buckets ahead a trend is asked for: a year of months, the bound install holds it to (`declare.ts`). */
export const TREND_AHEAD_MOST = 12;

/** Why a trend is flat, in the words a page can say. */
const flatSaid = (why: string, n: number, bucket: Bucket): string =>
  why === 'few'
    ? `${n} full ${bucket}${n === 1 ? ' is' : 's is'} too few to say: a trend is read from ${TREND_POINTS} or more`
    : why === 'nought'
      ? `a full ${bucket} of nought or less, or one in two currencies, has no rate of growth`
      : `the ${bucket}s do not tell growth from flat`;

/**
 * A TREND: what `trendOf` says of another figure's buckets.
 *
 * THE FIGURE IT IS OF IS READ THROUGH `evaluateMetric`, AS ANY PAGE READS IT, so its `where`, its currencies, its as-of
 * day and which bucket is unfinished are that figure's own and are decided in one place. It is read off its stored
 * declaration, as a cross-check reads the figure it checks, and it adds up the same source, which is what says who may
 * read it.
 *
 * `value` IS THE RATE, a share a bucket, so a target holds it as it holds any figure: `{ gte: 0 }` is "not falling".
 * Flat is no rate and no verdict, and `why` says which flat. A steady rise is an amount a bucket and no share, so it
 * too has no `value` and no verdict, and is said whole in `trend`, as any other answer `trend.ts` gives is.
 *
 * WHAT LEAVES IS WHAT JSON CAN CARRY AND WHAT MONEY IS KEPT IN. A `t` that is not a finite number is left out, because
 * `JSON.stringify` sends it as `null` and a reader would take that for "no t". The buckets ahead of a figure in whole
 * numbers are rounded to whole numbers, which for money is minor units: a line through logarithms answers fractions of
 * a piastre, and an amount with a fraction is not an amount this record keeps.
 */
function readTrend(sql: Sql, decl: MetricDecl, ctx: EvalContext): Result<Reading> {
  /* Each refusal is `no(` and its code, written out, because the gate that counts emitted codes reads them there. */
  const mine = (fix: string): string => `${decl.metric}: ${fix}`;
  const body = (decl.value as unknown as { trend: unknown }).trend;
  /* `08 §2.2` publishes a trend over a series' own field, and that form has no reader here. */
  if (body === null || typeof body !== 'object' || Array.isArray(body))
    return no<Reading>('NOT_IN_THIS_BUILD', mine('this build reads a trend of a figure in buckets, as { trend: { of: in-by-month, ahead: 3 } }, and a trend over a field is a published shape it does not read'), { at: 'value' });
  const { of, ahead } = body as { of?: unknown; ahead?: unknown };
  if (typeof of !== 'string' || of === '') return no<Reading>('VALUE_MALFORMED', mine('a trend takes of: the figure it reads, by its id, as { trend: { of: in-by-month, ahead: 3 } }'), { at: 'value' });
  /* LEFT OUT, NOTHING IS READ AHEAD: the trend alone. Install lets it be left out, and a default would be a forecast nobody asked for. */
  if (ahead !== undefined && (typeof ahead !== 'number' || !Number.isInteger(ahead) || ahead < 1 || ahead > TREND_AHEAD_MOST))
    return no<Reading>('OUT_OF_BOUNDS', mine(`a trend takes ahead: how many buckets past the last full one it reads, a whole number from 1 to ${TREND_AHEAD_MOST}`), { at: 'value' });
  if (decl.group_by !== undefined || decl.bucket !== undefined)
    return no<Reading>('DECLARATION_INVALID', mine(`a trend is one answer about ${of}'s buckets and has none of its own: leave group_by and bucket out`), { at: decl.group_by !== undefined ? 'group_by' : 'bucket' });
  if (of === decl.metric) return no<Reading>('DECLARATION_INVALID', mine(`a trend is of another figure, and ${of} names itself`), { at: 'value' });
  const stored = sql.one<{ body: string }>("SELECT body FROM declaration WHERE id = ? AND kind = 'metric' AND superseded_at IS NULL AND retired = 0", `metric.${of}`);
  if (!stored) return no<Reading>('METRIC_UNKNOWN', mine(`there is no figure called ${of} to read a trend of`), { at: 'value' });
  const read = JSON.parse(stored.body) as MetricDecl;
  const named = typeof read.name === 'string' && read.name !== '' ? `${read.name} (${of})` : of;
  if (isShape(read.value, 'trend')) return no<Reading>('DECLARATION_INVALID', mine(`a trend is of a figure in buckets, and ${named} is a trend itself`), { at: 'value' });
  if (read.bucket === undefined || !isBucket(read.bucket) || read.group_by === undefined)
    return no<Reading>('DECLARATION_INVALID', mine(`${named} is one number, and a trend is read from buckets: give it a group_by on a day and bucket: month, or name a figure that has them`), { at: 'value' });
  if (read.source !== decl.source) return no<Reading>('DECLARATION_INVALID', mine(`${named} adds up ${read.source}, so that is the source of its trend too`), { at: 'source' });
  const bucket = read.bucket;

  const shown = evaluateMetric(sql, { ...read, compare: 'none' }, ctx);
  if (!shown.ok) return shown;
  const buckets = (shown.value.groups ?? []).map((g) => ({ key: g.key, value: g.value, state: g.state }));
  const said = trendOf(buckets, ahead ?? 0, bucket) as Trend & { t?: number; ahead?: { value: number; low: number; high: number }[]; cap?: number };

  /* ROUNDED WHERE THE FIGURE IS IN WHOLE NUMBERS: minor units, or a count. An average in fractions keeps its fractions. */
  const whole = buckets.every((b) => b.value === null || Number.isInteger(b.value));
  const round = (n: number): number => (whole ? Math.round(n) : n);
  const { t, ...rest } = said;
  const trend = {
    ...rest,
    ...(typeof t === 'number' && Number.isFinite(t) ? { t } : {}),
    ...(said.ahead ? { ahead: said.ahead.map((a) => ({ ...a, value: round(a.value), low: round(a.low), high: round(a.high) })) } : {}),
    ...(typeof said.cap === 'number' ? { cap: round(said.cap) } : {}),
    bucket,
    unit: shown.value.unit,
  } as TrendSaid;

  const value = said.kind === 'growth' ? said.rate : null;
  const { met } = verdictOf({ format: decl.format, target: decl.target }, value, null, [], new Date(clockOf(ctx)).toISOString().slice(0, 10));
  return ok({
    value,
    unit: null,
    rows: shown.value.rows,
    held: shown.value.held,
    delta: null,
    why: said.kind === 'flat' ? flatSaid(said.why, said.n, bucket) : 'a trend is its own comparison, with no window before',
    met: heldVerdict(met, shown.value.held),
    refusals: [],
    ...(shown.value.fx ? { fx: shown.value.fx } : {}),
    trend,
  });
}

/* ── a sum of figures ────────────────────────────────── */

/** How many figures one sum adds, and how many sums deep a sum of sums may go. */
export const SUM_OF_PARTS_MOST = 8;
export const SUM_OF_DEPTH_MOST = 3;

/** Whether a value is a sum of other figures: `{ sum_of: [...] }` at its top. */
export const isSumOf = (value: unknown): value is SumOf => isShape(value, 'sum_of');

/** Whether a value is one sum of figures over another: `{ ratio_of: { of, per } }` at its top. */
export const isRatioOf = (value: unknown): value is RatioOf => isShape(value, 'ratio_of');

/** A part's id and its parameter: THE FIRST COLON SEPARATES, as in a walk's opening (`book-cash:Kiln`). */
const partOf = (said: string): { named: string; param: string | undefined } => {
  const colon = said.indexOf(':');
  return colon < 0 ? { named: said, param: undefined } : { named: said.slice(0, colon), param: said.slice(colon + 1) };
};

/**
 * What is wrong with a sum of figures, in words, or `null`: the one check install and the reader both make.
 *
 * `bodyOf` is the installed (or staged) body of a figure by its id, or `null`. A part that names the figure itself, a
 * part nobody installed, money added to a figure that is not money, more than `SUM_OF_PARTS_MOST` parts and a chain of
 * sums deeper than `SUM_OF_DEPTH_MOST` are each refused, and the depth is what ends a loop of sums naming each other.
 */
export function sumOfFault(value: SumOf, self: string, bodyOf: (id: string) => MetricDecl | null, depth = 1): string | null {
  const parts: unknown = (value as { sum_of?: unknown }).sum_of;
  if (!Array.isArray(parts) || parts.length === 0) return 'a sum of figures names them, as sum_of: [{ metric: cash-now }, { metric: owed-out, minus: true }]';
  if (parts.length > SUM_OF_PARTS_MOST) return `a sum of figures adds ${SUM_OF_PARTS_MOST} at most, and this one names ${parts.length}`;
  if (depth > SUM_OF_DEPTH_MOST) return `a sum of sums goes ${SUM_OF_DEPTH_MOST} deep at most, and ${self} is ${depth} deep`;
  let money: string | null = null;
  let plain: string | null = null;
  for (const part of parts as unknown[]) {
    const p = part as { metric?: unknown; minus?: unknown; optional?: unknown } | null;
    const shaped = p !== null && typeof p === 'object' && !Array.isArray(p) && keysOf(p).every((k) => k === 'metric' || k === 'minus' || k === 'optional');
    if (
      !shaped ||
      typeof p.metric !== 'string' ||
      p.metric === '' ||
      (p.minus !== undefined && typeof p.minus !== 'boolean') ||
      (p.optional !== undefined && typeof p.optional !== 'boolean')
    )
      return 'each part is { metric: <a figure> }, with minus: true when it is taken away and optional: true when an add-on may not be there';
    const { named } = partOf(p.metric);
    if (named === self) return `a sum adds other figures, and ${named} is this one`;
    const body = bodyOf(named);
    if (!body && p.optional === true) continue;
    if (!body) return `there is no figure called ${named} to add`;
    if (isMoneyFormat(body.format)) money ??= named;
    else plain ??= named;
    if (isSumOf(body.value)) {
      const deeper = sumOfFault(body.value, named, bodyOf, depth + 1);
      if (deeper) return deeper;
    }
  }
  if (money !== null && plain !== null) return `${money} is money and ${plain} is not: a sum adds money to money, or numbers to numbers`;
  return null;
}

/** An installed figure's body by its id, read off its live declaration as a walk's opening is. */
const installedFigure = (sql: Sql, id: string): MetricDecl | null => {
  const row = sql.one<{ body: string }>("SELECT body FROM declaration WHERE id = ? AND kind = 'metric' AND superseded_at IS NULL AND retired = 0", `metric.${id}`);
  return row ? (JSON.parse(row.body) as MetricDecl) : null;
};

/**
 * A SUM OF FIGURES: each part read through `evaluateMetric` with the same context, as any page reads it, then added.
 *
 * EACH READING BECOMES SIGNED AMOUNTS, its value in its unit or its `parts` one a currency, and they are added by
 * `across` and said by `acrossSaid`, so the sum converts, is at least, or comes back in parts exactly as a sum over a
 * list does. Two currencies are never added as they are. A part's own reading has converted what it could at the rates
 * of its rows' days; what is still in another currency is priced at the sum's day.
 *
 * AT LEAST ONLY WHILE NOTHING UNPRICED IS TAKEN AWAY. A lower bound less an amount nobody could price is a bound on
 * nothing, so a negative amount in another currency left without a rate gives the parts, never `atLeast`.
 *
 * A KEPT POINT (`ctx.point`) IS A NUMBER ONLY WHEN EVERY PART IS ONE: a part that named a pair it had no rate of names
 * it again here, and the night writes no point.
 */
function readSumOf(sql: Sql, decl: MetricDecl, ctx: EvalContext): Result<Reading> {
  /* Each refusal is `no(` and its code, written out, because the gate that counts emitted codes reads them there. */
  const mine = (fix: string): string => `${decl.metric}: ${fix}`;
  const parts = ((decl.value as unknown as SumOf).sum_of ?? []) as SumOf['sum_of'];
  for (const p of Array.isArray(parts) ? parts : []) {
    const named = typeof p?.metric === 'string' && p.metric !== '' ? partOf(p.metric).named : null;
    if (named !== null && named !== decl.metric && p.optional !== true && installedFigure(sql, named) === null)
      return no<Reading>('METRIC_UNKNOWN', mine(`there is no figure called ${named} to add`), { at: 'value' });
  }
  const fault = sumOfFault(decl.value as unknown as SumOf, decl.metric, (id) => installedFigure(sql, id));
  if (fault) return no<Reading>('DECLARATION_INVALID', mine(fault), { at: 'value' });
  if (decl.compare !== undefined && decl.compare !== 'none')
    return no<Reading>('DECLARATION_INVALID', mine('a sum of figures is not compared with a window before: write compare: none'), { at: 'compare' });
  if (decl.group_by !== undefined || decl.bucket !== undefined)
    return no<Reading>('DECLARATION_INVALID', mine('a sum of figures is one number: leave group_by and bucket out'), { at: decl.group_by !== undefined ? 'group_by' : 'bucket' });
  if (decl.where !== undefined) return no<Reading>('DECLARATION_INVALID', mine('a sum of figures chooses no entries of its own: leave where out'), { at: 'where' });

  const held = ctx.fx?.() ?? { home: null, rates: [] };
  const today = new Date(clockOf(ctx)).toISOString().slice(0, 10);
  const amounts: Amount[] = [];
  const missing = new Set<string>();
  let count = 0;
  let money = false;
  let rows = 0;
  let scope = 0;
  let unread: string | null = null;
  for (const p of parts) {
    const { named, param } = partOf(p.metric);
    /* A HOLE NOBODY FILLED IS NO NAME TO ASK ABOUT, as a walk's opening says (`readWalk`). */
    if (param !== undefined && /\{\{\w+\}\}/.test(param))
      return no<Reading>('REQUIRED_MISSING', mine(`this figure is read once for each of something and adds ${named} for the same one. Ask for it by name, as ${decl.metric}:<name>.`), { at: 'value' });
    /* AN OPTIONAL PART NOBODY INSTALLED ADDS NOTHING: the add-on is not here, so neither is what it would hold. */
    const body = installedFigure(sql, named);
    if (body === null) continue;
    const figure = param === undefined ? body : (fill(body, null, param) as MetricDecl);
    const read = evaluateMetric(sql, figure, ctx);
    if (!read.ok) return read;
    const r = read.value;
    rows += r.rows;
    scope += r.held;
    for (const pair of r.fx?.missing ?? []) missing.add(pair);
    const sign = p.minus === true ? -1 : 1;
    if (!isMoneyFormat(figure.format)) {
      if (r.value === null) unread ??= figure.name || named;
      else count += sign * r.value;
      continue;
    }
    money = true;
    if (r.value !== null && r.unit !== null) amounts.push({ currency: r.unit, amount: sign * r.value, day: null });
    else if (r.value === null && r.parts) for (const part of r.parts) amounts.push({ currency: part.currency, amount: sign * part.amount, day: null });
    /* A SUM OVER NOTHING IS NOUGHT WITH NO CURRENCY, and adds nothing. Any other money with no currency is no amount. */
    else if (r.value !== 0) unread ??= figure.name || named;
  }

  const sum: AcrossSaid = (() => {
    if (unread !== null || !money) return { value: unread === null ? count : null, unit: null };
    const pairs = (): FxRead => ({ into: held.home, home: held.home, asOf: null, forward: false, stale: false, missing: [...missing].sort() });
    if (ctx.point && missing.size > 0) return { value: null, unit: null, parts: partsOf(amounts), fx: pairs() };
    const gap = ctx.point ? pointSaid(amounts, held.home, held.home, held.rates, today) : null;
    if (gap) return gap;
    const priced = !amounts.some((a) => a.amount < 0 && a.currency !== held.home);
    const said = acrossSaid(across(amounts, held.home, held.rates, today, held.home !== null), amounts, held.home, held.home, priced);
    /* A PAIR A PART COULD NOT PRICE IS STILL NAMED when the sum has no value either: which rate would add it up. */
    if (said.value === null && said.fx && missing.size > 0) return { ...said, fx: { ...said.fx, missing: [...new Set([...said.fx.missing, ...missing])].sort() } };
    return said;
  })();

  const { met, targetIn } = verdictOf({ format: decl.format, target: decl.target }, sum.value, sum.unit, held.rates, today);
  return ok({
    ...sum,
    rows,
    held: scope,
    delta: null,
    why: unread !== null ? `${unread} has no number to add` : 'a sum of figures is not compared with a window before',
    met: heldVerdict(met, scope),
    refusals: [],
    ...(targetIn ? { targetIn } : {}),
  });
}

/**
 * ONE SUM OF FIGURES AS A SHARE OF ANOTHER (`RatioOf`): each half read by `readSumOf` as a money figure with no target,
 * then divided when both are one number in one unit. Anything else, a half in parts by currency, a half with no number or
 * a half of nought, reads no value and says why; the verdict is the share against the figure's own target.
 */
function readRatioOf(sql: Sql, decl: MetricDecl, ctx: EvalContext): Result<Reading> {
  const mine = (fix: string): string => `${decl.metric}: ${fix}`;
  const r = (decl.value as unknown as RatioOf).ratio_of as Partial<RatioOf['ratio_of']> | null;
  if (r === null || typeof r !== 'object' || !Array.isArray(r.of) || !Array.isArray(r.per))
    return no<Reading>('DECLARATION_INVALID', mine('a share of figures names both halves, as ratio_of: { of: [{ metric: a }], per: [{ metric: b }] }'), { at: 'value' });
  const half = (parts: SumOf['sum_of']): Result<Reading> =>
    readSumOf(sql, { ...decl, value: { sum_of: parts } as unknown as MetricDecl['value'], format: 'money', target: undefined }, ctx);
  const of = half(r.of);
  if (!of.ok) return of;
  const per = half(r.per);
  if (!per.ok) return per;
  const a = of.value;
  const b = per.value;
  const held = ctx.fx?.() ?? { home: null, rates: [] };
  const today = new Date(clockOf(ctx)).toISOString().slice(0, 10);
  const why =
    a.value === null || b.value === null
      ? 'a half has no one number, so no share is taken'
      : a.unit !== b.unit
        ? 'the two halves are in different currencies, so no share is taken'
        : b.value === 0
          ? 'nothing comes in, so no share is taken'
          : null;
  const value = why === null ? a.value! / b.value! : null;
  const { met, targetIn } = verdictOf({ format: decl.format, target: decl.target }, value, null, held.rates, today);
  const scope = a.held + b.held;
  return ok({
    value,
    unit: null,
    rows: a.rows + b.rows,
    held: scope,
    delta: null,
    why: why ?? 'a share of figures is not compared with a window before',
    met: heldVerdict(met, scope),
    refusals: [],
    ...(targetIn ? { targetIn } : {}),
  });
}

/**
 * A verdict as a reading over `held` things may give it: A MISS OVER NOTHING HELD IS NO VERDICT. A
 * count held to at least one over a Ledger nobody has started read as missed, so a fresh record was told two things were
 * wrong with it. Only the miss is withheld: nothing held meets an `lte` (no late bill on an empty list), and nought over
 * rows that exist still misses, since a Ledger that holds rows and kept none this week has stopped.
 * `test/fresh-met.test.ts` holds the three.
 */
export const heldVerdict = (met: boolean | null, held: number): boolean | null => (held === 0 && met === false ? null : met);

/** The kinds that reduce over a field's values, so a row with the field empty gives them nothing to read. */
const REDUCING: ReadonlySet<string> = new Set(['sum', 'avg', 'min', 'max']);

/** Whether a `where` requires one of `fields` filled: a `present` leaf (or `empty: false`) on it, at the top or under `all`. */
function requiresFilled(node: Predicate | undefined, fields: readonly string[]): boolean {
  if (node === undefined || fields.length === 0) return false;
  if ('all' in node && Array.isArray(node.all)) return node.all.some((n) => requiresFilled(n as Predicate, fields));
  if ('field' in node && typeof node.field === 'string') return fields.includes(node.field) && (node.present === true || node.empty === false);
  return false;
}

/** The order a grouping by a word draws in: the largest part first, then the key. Exported for the browser's reader. */
export const largestFirst = (a: Group, b: Group): number =>
  (b.value ?? -Infinity) - (a.value ?? -Infinity) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/** A field id or an enum value as a person reads it: `owed_to_me` is "Owed to me". Exported for `pages.ts`, whose filters say values so. */
export const wordsOf = (id: string): string => {
  const said = id.replace(/_/gu, ' ').trim();
  return said === '' ? id : said[0]!.toUpperCase() + said.slice(1);
};

/** What one row a grouping points at says of itself: its title, and the currency it says it is kept in. */
export type Pointed = { title: string | null; currency: string | null };


/** A field id as a declaration may name one: the grammar `jsonPath` holds, asked first so a list's body cannot throw. */
const FIELD_ID = /^[a-z][a-z0-9_]{0,31}$/u;

/**
 * The kinds of title that are not words: a link, which is the id of another row, an amount or a file, which are kept as
 * objects, a list and raw JSON. A list titled by one names no part (`Names, never ids`), and the reader says the key.
 */
const NOT_A_NAME: ReadonlySet<unknown> = new Set(['ref', 'money', 'quantity', 'file', 'list', 'json', 'secret']);

/**
 * The rows of `to` that `ids` name, each with its title and the currency it says it is kept in.
 *
 * A ROW THAT SAYS WHICH CURRENCY IT IS KEPT IN is one whose list declares a text or enum field called `currency` and
 * holds a currency code there: money-core's books, a founder's organisations. That is the row's own statement, so a
 * figure about the row is read in it (`groupsOf`, `scopeCurrency`, `readRolled`) rather than converted into the home
 * currency: Harbour says USD, and its part of Cash now by book was drawn in pounds Egyptian.
 *
 * READ FROM THE DECLARATION, because a context carries no list's title field, and one query for every id. A deleted row
 * still names the rows that point at it, as `titleOfRow` in `index.ts` names one; a title field declared `secret`, or
 * one that holds no words (`NOT_A_NAME`), is never read into a name.
 */
export function pointedRows(sql: Sql, to: string, ids: readonly string[]): Map<string, Pointed> {
  const out = new Map<string, Pointed>();
  const asked = [...new Set(ids.filter((id) => typeof id === 'string' && id !== ''))];
  if (asked.length === 0) return out;
  const body = sql.one<{ body: string }>(
    "SELECT body FROM declaration WHERE id = ? AND kind = 'register' AND superseded_at IS NULL AND retired = 0",
    `register.${to}`,
  )?.body;
  let list: { title?: unknown; fields?: unknown } = {};
  try {
    list = body === undefined ? {} : (JSON.parse(body) as typeof list);
  } catch {
    list = {};
  }
  const fields = Array.isArray(list.fields) ? (list.fields as { id?: unknown; type?: unknown; retired?: unknown }[]) : [];
  const live = (id: string) => fields.find((f) => f?.id === id && f.retired !== true);
  const title = typeof list.title === 'string' && FIELD_ID.test(list.title) && live(list.title) && !NOT_A_NAME.has(live(list.title)?.type) ? list.title : null;
  const kept = live('currency');
  /* A LIST WITH NO CURRENCY FIELD IS KEPT IN THE CURRENCY OF ITS ONE REQUIRED MONEY (round 1030): an account says its
     currency by its balance, so a figure about one account's lines (`account is Cash (USD)`) is read in dollars and
     never turned into the home currency. */
  const held = kept ? undefined : fields.find((f) => f?.type === 'money' && (f as { required?: unknown }).required === true && f.retired !== true && typeof f.id === 'string' && FIELD_ID.test(f.id));
  const currency = kept && (kept.type === 'text' || kept.type === 'enum') ? jsonPath('currency') : held ? `${jsonPath(held.id as string)}.currency` : null;
  if (title === null && currency === null) return out;
  const said = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() !== '' ? v.trim() : typeof v === 'number' || typeof v === 'boolean' ? String(v) : null;
  /* THE IDS ARE ONE BOUND ARRAY, so the statement binds two values at any number of ids: the Durable Object
     refuses a statement over 100, and one value an id crashed a page of 101. */
  const rows = sql.all<{ id: string; t: unknown; c: unknown }>(
    `SELECT id, ${title === null ? 'NULL' : `json_extract(fields, '${jsonPath(title)}')`} AS t, ${currency === null ? 'NULL' : `json_extract(fields, '${currency}')`} AS c
       FROM entry WHERE register = ? AND id IN (SELECT value FROM json_each(?))`,
    to,
    JSON.stringify(asked),
  );
  for (const r of rows) {
    const code = typeof r.c === 'string' ? r.c.trim().toUpperCase() : '';
    out.set(String(r.id), { title: said(r.t), currency: isCurrencyCode(code) ? code : null });
  }
  return out;
}

/** What a grouping's parts are called, and the currency the row behind each part says it is kept in. */
export type GroupNames = { label: (key: string) => string | undefined; currency: (key: string) => string | null };

/**
 * The names of a grouping's parts, by the field it groups by.
 *
 * AN ENUM BY ITS DECLARED LABEL, A YES OR NO BY THE WORD, A REF BY THE TITLE OF THE ROW IT POINTS AT. Cash now by book
 * groups by `accounts.book`, a ref, so every key is the ULID the row stores, and every reader that drew one said "Book
 * #01M3VMPSHV07AM4S51WDTFM5XG" (Today 1), an agent's `get` included. A grouping by text
 * is keyed by its words already and carries no label, and so does a key no row answers for.
 *
 * A LIST THE CALLER MAY NOT READ NAMES NOTHING (`EvalContext.reads`): its rows' titles are not handed to a member invited
 * to the rows that point at them, and their currencies do not shape her figure. A page is read for nobody in particular,
 * so `registersOf` in `pages.ts` names that list among the ones a grouped figure reads, and the record holds the block.
 */
export function groupNames(sql: Sql, schema: Schema, by: string, keys: readonly string[], ctx: Pick<EvalContext, 'reads'>): GroupNames {
  const spec = Object.hasOwn(schema.fields, by) ? schema.fields[by] : undefined;
  if (spec?.type === 'enum') return { label: (key) => spec.labels?.[key] ?? wordsOf(key), currency: () => null };
  if (spec?.type === 'bool')
    return { label: (key) => (key === 'true' || key === '1' ? 'Yes' : key === 'false' || key === '0' ? 'No' : undefined), currency: () => null };
  const to = spec?.type === 'ref' && typeof spec.to === 'string' && spec.to !== '' ? spec.to : null;
  if (to === null || (ctx.reads !== undefined && !ctx.reads(to))) return { label: () => undefined, currency: () => null };
  const pointed = pointedRows(sql, to, keys);
  return { label: (key) => pointed.get(key)?.title ?? undefined, currency: (key) => pointed.get(key)?.currency ?? null };
}

/** Each part with its name beside its key, where the grouping names one. */
export const withLabels = (groups: readonly Group[], names: GroupNames): Group[] =>
  groups.map((g) => {
    const label = names.label(g.key);
    return label === undefined ? g : { ...g, label };
  });

/**
 * The currency a figure scoped to one row is read in, when that row says it is kept in one.
 *
 * `book-cash:Harbour` IS A QUESTION ABOUT HARBOUR (`fill` in `fill.ts` sets `within` to the clauses its parameter
 * filled), and Harbour says USD: its page led with its cash in pounds Egyptian, converted. So a scope that pins a ref to
 * one row, in a top-level clause, is asked what that row says, and a single answer is the figure's currency. Two rows
 * that disagree, a list the caller may not read and a row that says nothing all leave the home currency as it was.
 */
export function scopeCurrency(sql: Sql, schema: Schema, scope: Predicate | undefined, ctx: Pick<EvalContext, 'reads'>): string | null {
  if (scope === undefined) return null;
  const found = new Set<string>();
  for (const leaf of conjuncts(scope)) {
    const field = typeof leaf.field === 'string' ? leaf.field : null;
    const spec = field !== null && Object.hasOwn(schema.fields, field) ? schema.fields[field] : undefined;
    const to = spec?.type === 'ref' && typeof spec.to === 'string' && spec.to !== '' ? spec.to : null;
    if (to === null || (ctx.reads !== undefined && !ctx.reads(to))) continue;
    const one = typeof leaf.is === 'string' ? leaf.is : Array.isArray(leaf.in) && leaf.in.length === 1 && typeof leaf.in[0] === 'string' ? leaf.in[0] : null;
    if (one === null) continue;
    const said = pointedRows(sql, to, [one]).get(one)?.currency;
    if (said) found.add(said);
  }
  return found.size === 1 ? [...found][0]! : null;
}

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
  /* A DIFFERENCE AGAINST THE WINDOW BEFORE: the window its second half is read over, and the gate each part's
     change is put through, which the caller holds because it knows whether the window moved at all. */
  then?: { predicate: Predicate | undefined; change: (now: { value: number | null; rows: number }, before: { value: number | null; rows: number }) => { delta: number | null; why: string } },
): Result<Pick<Reading, 'groups' | 'current' | 'more'>> {
  const w = compile(predicate, schema);
  if (w.bad.length) return { ok: false, refusal: w.bad[0]! };
  const by = decl.group_by!;
  const where = `register = ? AND deleted_at IS NULL AND ${w.sql}`;
  const params: (string | number)[] = [schema.register, ...w.params];
  /* A STAMPED INSTANT IS `entry`'S OWN COLUMN, never a key of `fields`, where `json_extract` finds nothing on any row. The
     name is written into the SQL as it is only because `isStamped` has just matched it to one of the record's own
     columns, `created_at` or `updated_at`, and nothing else reaches that branch. */
  const field = isStamped(schema, by) ? by : `json_extract(fields, '${jsonPath(by)}')`;
  const tables = tablesOf(decl);
  const value = decl.value as Aggregation;

  const units = new Map<string, string | null>();
  /**
   * A PART OF A DIFFERENCE IS THE WHOLE DIFFERENCE WITH ONE MORE CLAUSE ON BOTH HALVES (`read`), so a part refuses two
   * units, splits by currency and converts exactly as the figure above it does.
   *
   * AGAINST THE WINDOW BEFORE, A PART ONLY ONE WINDOW HOLDS COUNTS THE OTHER AS NOUGHT: rent paid last month and not yet
   * this month is a difference of all of it, and it is the part most worth seeing. Its change is another matter, and
   * the gate says so for that part alone.
   */
  const pair = 'diff' in decl.value;
  const part = (key: string, clause: string, more: (string | number)[], own: Across | undefined = fx): Result<Pick<Group, 'value' | 'rows' | 'parts' | 'halves' | 'delta' | 'why'>> => {
    if (pair) {
      const got = read(sql, predicate, schema, decl, tables, own, { before: then, clause: { sql: clause, params: more } });
      if (!got.ok) return got;
      units.set(key, got.value.unit);
      const { rows, halves: h } = got.value;
      const kept = got.value.parts ? { parts: got.value.parts } : {};
      if (!h || !then) return ok({ value: rows === 0 ? null : got.value.value, rows, ...kept });
      const halves: Halves = { of: rows === 0 ? 0 : h.of, per: h.perRows === 0 ? 0 : h.per, perRows: h.perRows };
      const value = got.value.parts || halves.of === null || halves.per === null ? null : halves.of - halves.per;
      return ok({ value, rows, ...kept, halves, ...then.change({ value: halves.of, rows }, { value: halves.per, rows: h.perRows }) });
    }
    const got = one(sql, schema, value, `${where} AND ${clause}`, [...params, ...more], tables, own);
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
  /* AND THE PARTS ONLY THE WINDOW BEFORE HOLDS, for a difference read against it. */
  if (then) {
    const b = compile(then.predicate, schema);
    if (b.bad.length) return { ok: false, refusal: b.bad[0]! };
    const seen = new Set(values.map((r) => String(r.v)));
    for (const r of sql.all<{ v: string | number }>(`SELECT DISTINCT ${field} AS v FROM entry WHERE register = ? AND deleted_at IS NULL AND ${b.sql} AND ${field} IS NOT NULL`, schema.register, ...b.params))
      if (!seen.has(String(r.v))) values.push(r);
  }
  /* EACH PART BY ITS NAME, AND A PART WHOSE ROW SAYS WHICH CURRENCY IT IS KEPT IN IS ADDED UP IN THAT ONE (`groupNames`):
     what a book in dollars holds is dollars, converted only where its own rows are in another currency. A part in a
     currency the others are not in puts every part in parts (`inParts`), so no bar is ranked across two currencies. */
  const names = groupNames(sql, schema, by, values.map((r) => String(r.v)), ctx);
  const groups: Group[] = [];
  for (const { v } of values) {
    const key = String(v);
    const own = money && fx ? names.currency(key) : null;
    const got = part(key, `${field} = ?`, [v], own === null || !fx ? fx : { ...fx, into: own });
    if (!got.ok) return got;
    groups.push({ key, ...got.value, state: 'full' });
  }
  groups.splice(0, groups.length, ...inParts(groups));
  groups.sort(largestFirst);
  return ok({ groups: withLabels(groups.slice(0, GROUP_CAP), names), more: Math.max(0, groups.length - GROUP_CAP) });
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

/** A declared figure read as a sign: its id and name, green, red or none, the number read and one sentence. */
export type DeclaredSign = { sign: string; name: string; state: 'green' | 'red' | 'none'; value: number | null; said: string; hold: false };

/**
 * A figure declared `vital: true`, read as a sign, or `null` for a figure that is not one.
 *
 * RED WHEN THE READING MISSES ITS TARGET, and only then: a reading that could not be judged (no value, a currency with
 * no rate, a refusal) is `none`, never green, so a sum over nothing does not pass for want of a number. A count of none is
 * a number and is judged: `lte: 0` over a list that exists and holds nothing is green, because nothing is the answer.
 *
 * A READING THAT COULD NOT BE TAKEN SAYS SO. `null` is the figure refused whole (its list is
 * gone, or its source is one this build does not read), and refusals on a reading are a part of it that could not be
 * read. Either is `none`, and its sentence says the figure could not be read, never "nothing to judge by yet", which
 * is a quiet list's sentence and would have him wait for rows that cannot come. Its number is not shown, since a 0 from
 * a list that is not there is not a count. `hold` is always false: the hold's clock watches the record's own closed list
 * (`signs.ts`), and a sign a pack declares is shown beside them, not counted with them.
 */
export function vitalOf(decl: Pick<MetricDecl, 'metric' | 'name' | 'vital' | 'target'>, reading: Pick<Reading, 'value' | 'met' | 'refusals'> | null): DeclaredSign | null {
  if (decl.vital !== true || decl.target === undefined) return null;
  const unread = reading === null || reading.refusals.length > 0;
  const judged = !unread && reading.value !== null ? reading.met : null;
  const state = judged === false ? 'red' : judged === true ? 'green' : 'none';
  const said =
    state === 'red'
      ? `${decl.name} misses its target.`
      : state === 'green'
        ? `${decl.name} meets its target.`
        : unread
          ? `${decl.name} could not be read, so it is not judged.`
          : `${decl.name} has nothing to judge by yet.`;
  return { sign: decl.metric, name: decl.name, state, value: unread ? null : reading.value, said, hold: false };
}

/**
 * Every figure of `decls` declared `vital: true`, read now as a sign, in the order given. The caller hands the figures
 * with their targets already read live (`liveTarget` in `declare.ts`), so a limit a person changed is the one judged.
 */
export function readDeclaredSigns(sql: Sql, decls: readonly MetricDecl[], ctx: EvalContext): DeclaredSign[] {
  return decls.flatMap((decl) => {
    if (decl.vital !== true || decl.target === undefined) return [];
    const read = evaluateMetric(sql, decl, ctx);
    const sign = vitalOf(decl, read.ok ? read.value : null);
    return sign === null ? [] : [sign];
  });
}

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
 * THE `ratio` SENTENCE WAS NOT ONE OF THE TWO, said here because it is easy to count it as a third. That arm is reached
 * only when both halves match the regex, so it is about two currencies whenever it speaks at all. The `?? 'no unit'` in
 * both pair sentences is unreachable for the same reason: the `diff` arm needs both units non-empty and the `ratio` arm
 * needs both to be codes. They keep the fallback so the mark is spelled in one place and not so that it prints.
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
  /* FOR A DIFFERENCE. `before` is the window its second half is read over, and `clause` is one part of a grouped
     one: the whole query with one more clause, on both halves, as `groupsOf` reads a part of anything else. */
  opts: { before?: { predicate: Predicate | undefined } | undefined; clause?: { sql: string; params: (string | number)[] } | undefined } = {},
): Result<Read> {
  const w = compile(predicate, schema);
  if (w.bad.length) return { ok: false, refusal: w.bad[0]! };

  const also = opts.clause ? ` AND ${opts.clause.sql}` : '';
  const where = `register = ? AND deleted_at IS NULL AND ${w.sql}${also}`;
  const params: (string | number)[] = [schema.register, ...w.params, ...(opts.clause?.params ?? [])];

  if ('ratio' in decl.value || 'diff' in decl.value) {
    /* HOISTED SO THE REFUSAL BELOW READS ITS CODE FROM A CONSTRUCTOR AND NOT FROM A TERNARY WHOSE
       CONDITION HOLDS A QUOTE: `refusals.mjs` cannot cross one, and would count neither code.
       The narrowing has to stay inline, because `'ratio' in decl.value` is what tells the type
       checker which half of the union it is holding, and a boolean does not carry that. */
    const ratio = 'ratio' in decl.value;
    const pair = 'ratio' in decl.value ? decl.value.ratio : decl.value.diff;
    const half: Across | undefined = fx ? { ...fx, halves: true } : undefined;
    /* THE SECOND HALF OVER THE WINDOW BEFORE, when the difference names one: the same clauses compiled at a moved clock. */
    const then = opts.before ? compile(opts.before.predicate, schema) : null;
    if (then && then.bad.length) return { ok: false, refusal: then.bad[0]! };
    const perWhere = then ? `register = ? AND deleted_at IS NULL AND ${then.sql}${also}` : where;
    const perParams: (string | number)[] = then ? [schema.register, ...then.params, ...(opts.clause?.params ?? [])] : params;
    const of = one(sql, schema, pair.of, where, params, lookups, half);
    const per = one(sql, schema, pair.per, perWhere, perParams, lookups, half);
    if (!of.ok) return of;
    if (!per.ok) return per;
    const halves: Pick<Read, 'halves'> = then ? { halves: { of: of.value.value, per: per.value.value, perRows: per.value.rows } } : {};
    /* A HALF IN PARTS, OR TWO HALVES IN TWO CURRENCIES, IS THE FIGURE ONCE PER CURRENCY: each half read again over the rows
       in that currency, unconverted, and subtracted or divided there (`fx.ts` `pairParts`). A converted pair is in one
       currency by now and falls through to the arithmetic below. */
    const code = (u: string | null | undefined): u is string => typeof u === 'string' && /^[A-Z]{3}$/u.test(u);
    const apart = Boolean(of.value.parts || per.value.parts) || (code(of.value.unit) && code(per.value.unit) && of.value.unit !== per.value.unit);
    if (apart) {
      const currencies = [of.value, per.value].flatMap((h) => h.parts?.map((p) => p.currency) ?? (code(h.unit) ? [h.unit] : []));
      const ofField = moneyFieldOf(schema, pair.of);
      const perField = moneyFieldOf(schema, pair.per);
      const inCurrency = (agg: Aggregation, field: string | null, currency: string, over = where, bound = params): number | null => {
        if (field === null) return null;
        const got = one(sql, schema, agg, `${over} AND json_extract(fields, '${jsonPath(field)}.currency') = ?`, [...bound, currency], lookups);
        return got.ok ? got.value.value : null;
      };
      const parts = pairParts(currencies, ratio, (c) => ({ of: inCurrency(pair.of, ofField ?? perField, c), per: inCurrency(pair.per, perField ?? ofField, c, perWhere, perParams) }));
      const said = fxOfPair(fx, of.value.fx, per.value.fx, false);
      /* AND ITS HALVES HAVE NO ONE NUMBER EACH, even where each is in one currency: E£100 now against $70 then is not a
         change of 43%, and a change is read off these two numbers (`comparisonOf`). */
      const apiece: Pick<Read, 'halves'> = then ? { halves: { of: null, per: null, perRows: per.value.rows } } : {};
      if (parts.length) return ok({ value: null, unit: null, rows: of.value.rows, refusals: [], parts, ...apiece, ...(said ? { fx: said } : fx ? { fx: { into: fx.into, home: fx.home, asOf: null, forward: false, stale: false, missing: [] } } : {}) });
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
    return ok({ value, unit: 'ratio' in decl.value ? rateUnit(of.value.unit, per.value.unit) : (of.value.unit ?? per.value.unit), rows: of.value.rows, refusals: [], ...halves, ...(converted ? { fx: converted } : {}) });
  }

  return one(sql, schema, decl.value, where, params, lookups, fx);
}

/**
 * An aggregation's kind and what it reads: the key that is an aggregation, wherever it sits.
 *
 * BY NAME AND NOT BY PLACE. `past` is the one aggregation with a second key, `by`, and a record holds a declaration
 * with its keys in order, so `{ past: 'next_due', by: '3d' }` comes back `{ by, past }`. Read by its first key, a
 * stored figure was refused "no field called 3d" on every read while the same figure handed over unstored answered. A
 * value that names no aggregation still answers its first key, so the refusal goes on naming what was written.
 */
export function kindOf(agg: object): [string, unknown] | undefined {
  const entries = Object.entries(agg);
  return entries.find(([key]) => (AGGREGATIONS as readonly string[]).includes(key)) ?? entries[0];
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
  const [kind, operand] = kindOf(agg) as [string, string | Product];
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

  /* THE ROWS THAT LEAVE THE FIELD EMPTY, whatever its type: the half of "the share with no category" a ratio's one
     `where` could not count beside the whole (money-signs B3). */
  if (kind === 'empty')
    return ok({
      value: Number(
        sql.one<{ n: number }>(
          `SELECT count(*) AS n FROM entry WHERE ${where} AND (json_extract(fields, ?) IS NULL OR json_extract(fields, ?) = '')`,
          ...params,
          jsonPath(field),
          jsonPath(field),
        )?.n ?? 0,
      ),
      unit: null,
      rows,
      refusals: [],
    });

  /* HOW MANY CURRENCIES A MONEY FIELD IS KEPT IN, the currency alone: `distinct` counts amount and currency together,
     so three accounts in pounds with three balances read three (money-signs B2). */
  if (kind === 'currencies')
    return ok({
      value: Number(
        sql.one<{ n: number }>(`SELECT count(DISTINCT json_extract(fields, ?)) AS n FROM entry WHERE ${where}`, `${jsonPath(field)}.currency`, ...params)?.n ?? 0,
      ),
      unit: null,
      rows,
      refusals: [],
    });

  /* THE ROWS WHOSE DAY IS GONE, COUNTED INSIDE A WIDER `where` (signs-metric-75-76). A ratio's two
     halves share the one `where`, so with the day in it "every matched line is on time" and "no line was ever
     matched" were both no row, and a sign could not say nought of the first without saying it of the second. Here the
     `where` holds who is judged and this counts the late among them: no row is still nought over nothing, which a
     ratio answers with no value, and rows with none late is a nought that was read. THE DAY IS THE PREDICATE'S, so
     `{ past: f, by: '3d' }` and `f before -3d` count the same rows on a live read and on a read of a day gone: both
     end at the reading's own day (`fx.today`, `clockOf`). A row with no day is not late. No day to read from is no
     value, never nought. */
  if (kind === 'past') {
    const days = pastDays(agg);
    const today = fx?.today ?? null;
    const edge = days === null || today === null ? null : new Date(Date.parse(`${today.slice(0, 10)}T12:00:00Z`) - days * DAY).toISOString().slice(0, 10);
    if (edge === null) return ok({ value: null, unit: null, rows, refusals: [] });
    return ok({
      value: Number(
        sql.one<{ n: number }>(`SELECT count(*) AS n FROM entry WHERE ${where} AND substr(json_extract(fields, ?), 1, 10) < ?`, ...params, jsonPath(field), edge)?.n ?? 0,
      ),
      unit: null,
      rows,
      refusals: [],
    });
  }

  /* THE AGE OF THE NEWEST DAY, in whole days to the reading's own day: `{ max: 'on' }` is a day, not an age, and read
     as a number it is twenty thousand. No row, or no day to count from, is no value (money-signs B1). */
  if (kind === 'age') {
    /* A STAMP THE RECORD WRITES (`created_at`, `updated_at`) IS A COLUMN, not a field (stands-50). */
    const stamped = isStamped(schema, field);
    const v =
      sql.one<{ v: string | null }>(`SELECT max(${stamped ? field : 'json_extract(fields, ?)'}) AS v FROM entry WHERE ${where}`, ...(stamped ? [] : [jsonPath(field)]), ...params)?.v ??
      null;
    const today = fx?.today ?? null;
    const days = v === null || today === null ? null : Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${String(v).slice(0, 10)}T00:00:00Z`)) / 86_400_000);
    return ok({ value: days === null || Number.isNaN(days) ? null : Math.max(0, days), unit: null, rows, refusals: [] });
  }

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
    /* THE TABLE'S KEYS ARE ONE BOUND ARRAY, not one value a key: a table of 101 broke the Durable Object's
       limit. An empty table still excludes only the unset, as `NOT IN (NULL)` did. */
    const known = Object.keys(table);
    const marks = known.length === 0 ? 'NULL' : 'SELECT value FROM json_each(?)';
    const missing = sql
      .all<{ v: string | null }>(
        `SELECT DISTINCT ${byExpr} AS v FROM entry WHERE ${where} AND ${expr} IS NOT NULL AND (${byExpr} IS NULL OR ${byExpr} NOT IN (${marks}))`,
        ...params,
        ...(known.length === 0 ? [] : [JSON.stringify(known)]),
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
     open. The browser reads it the same way (`apps/web` `metrics.ts` `one`). */
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
    /* A SUM OF NO MONEY IS NOUGHT IN THE CURRENCY THE FIGURE IS ADDED UP IN, so it is drawn "EGP 0" and never a bare "0"
       a person cannot tell from a count. With no currency to add up in, it names none. */
    const none = money && kind === 'sum' ? (fx?.into ?? fx?.home ?? null) : null;
    if (groups.length === 0) return ok({ value: kind === 'sum' ? 0 : null, unit: none, rows, refusals: [] });
    /* A SUM OF MONEY IN A CURRENCY OTHER THAN THE ONE THE FIGURE IS ADDED UP IN is read row by row, each amount with
       the day its row is about, and converted at the rate as of that day, or said one amount per currency (`fx.ts`). */
    const foreign = groups.length > 1 || (fx?.into != null && groups[0]!.u !== fx.into);
    /* AND SO IS AN AVERAGE, A LEAST OR A MOST: each amount converted first, or each currency's own, never across two. */
    if (money && fx && REDUCIBLE.has(kind) && foreign && groups.every((g) => g.u !== null)) {
      const dated = fx.day ? `json_extract(fields, '${jsonPath(fx.day)}')` : 'NULL';
      const amounts = sql
        .all<{ u: string; v: number; d: string | null }>(`SELECT ${unitExpr} AS u, ${expr} AS v, ${dated} AS d FROM entry WHERE ${where} AND ${expr} IS NOT NULL`, ...params)
        .map((r) => ({ currency: String(r.u), amount: Number(r.v), day: typeof r.d === 'string' ? r.d : null }));
      /* CONVERTED WHEN SOMEBODY CHOSE THE CURRENCY TO ADD UP IN: the record's home currency, or the one a row the figure
         is about says it is kept in (`groupNames`, `scopeCurrency`). `into` is one of the two or it is `null`. */
      /* A KEPT POINT NEEDS EACH RATE OF ITS OWN DAY OR THE DAY BEFORE, else it is no number and the night writes none. */
      const gap = fx.point ? pointSaid(amounts, fx.into, fx.home, fx.rates, fx.today, kind as Reduce) : null;
      if (gap) return ok({ ...gap, rows, refusals: [] });
      const said = across(amounts, fx.into, fx.rates, fx.today, fx.into !== null, kind as Reduce);
      /* ONE, CONVERTED, AT LEAST OR IN PARTS (`acrossSaid`). A half of a ratio or a diff is never at least: a bound
         less a bound, or over one, is a bound on nothing. */
      return ok({ ...acrossSaid(said, amounts, fx.into, fx.home, fx.halves !== true), rows, refusals: [] });
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

/** The most days `past` waits before a day counts as gone: ten years, past which it is a typing slip. */
const PAST_BY_MOST = 3650;

/**
 * How many whole days gone a `past` counts from, or `null` when its `by` is not a number of days.
 *
 * `by: '3d'` IS THREE DAYS, and left out it is none, so a day before today is gone. Days only: a month is not a number
 * of days, and a line "a month late" is the predicate's to say.
 */
function pastDays(agg: Aggregation): number | null {
  const by = (agg as { by?: unknown }).by;
  if (by === undefined) return 0;
  const days = typeof by === 'string' ? /^(\d{1,4})d$/u.exec(by) : null;
  return days && Number(days[1]) <= PAST_BY_MOST ? Number(days[1]) : null;
}

/**
 * What is wrong with how long a value's `past` waits, or `null`: the one sentence the reader refuses with, and the
 * install too (`declare.ts`), so a figure that would be refused on every read never goes in (signs-metric-75-76).
 */
export function pastFault(value: unknown): string | null {
  if (value === null || typeof value !== 'object') return null;
  return halvesOf(value as Value).some((half) => 'past' in half && pastDays(half) === null)
    ? `past waits a whole number of days, written by: '3d', up to ${PAST_BY_MOST}d; leave by out to count a day before today`
    : null;
}

/** The aggregations money across currencies is converted for, or read one currency at a time. */
const REDUCIBLE = new Set(['sum', 'avg', 'min', 'max']);

/** The money field an aggregation reads, or `null` when it reads a count or a field that is not money. */
function moneyFieldOf(schema: Schema, agg: Aggregation): string | null {
  const [, operand] = kindOf(agg) as [string, string | Product];
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
  const type = Object.hasOwn(schema.fields, field) ? schema.fields[field]?.type : undefined;
  /* AN AGE IS COUNTED FROM A DAY, and currencies are read off money: on any other field each is a number about nothing. */
  if (kind === 'age') return type === undefined || type === 'day' || type === 'instant' ? null : `age reads a day, and ${field} is a ${type}. Name a day or instant field.`;
  /* A DAY ALONE: an instant is gone at a moment in a zone, which the predicate reads and this does not. */
  if (kind === 'past') return type === undefined || type === 'day' ? null : `past reads a day, and ${field} is ${type === 'instant' ? 'an' : 'a'} ${type}. Name a day field.`;
  if (kind === 'currencies') return type === undefined || type === 'money' ? null : `currencies reads money, and ${field} is a ${type}. Name a money field.`;
  if (!['sum', 'avg', 'min', 'max'].includes(kind) || field === 'id') return null;
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

/**
 * A difference whose halves name the grouping, as one whose figure does.
 *
 * BOTH HALVES NAME THE SAME FIELD, OR IT IS TWO QUESTIONS. Subtracting what each shop took from what each category cost
 * has no part to put the answer in, and one half grouped beside one that is not is the same fault. `said` is the
 * sentence for either, and for halves that disagree with the figure's own `group_by`.
 */
function liftedGrouping(decl: MetricDecl): { decl: MetricDecl; said: string | null } {
  const diff = 'diff' in decl.value ? (decl.value.diff as { of?: unknown; per?: unknown } | null) : null;
  const held = (half: unknown): half is Record<string, unknown> => half !== null && typeof half === 'object' && !Array.isArray(half);
  if (!diff || !held(diff.of) || !held(diff.per)) return { decl, said: null };
  const a = diff.of.group_by;
  const b = diff.per.group_by;
  if (a === undefined && b === undefined) return { decl, said: null };
  const bare = (half: Record<string, unknown>): Aggregation => Object.fromEntries(Object.entries(half).filter(([key]) => key !== 'group_by')) as Aggregation;
  const word = (by: unknown): string => (by === undefined ? 'nothing' : String(by));
  const said =
    a !== b
      ? `a difference is grouped by one field, and its halves are grouped by ${word(a)} and ${word(b)}; group both by the same field`
      : decl.group_by !== undefined && decl.group_by !== a
        ? `its halves are grouped by ${word(a)} and the figure by ${String(decl.group_by)}; a difference is grouped by one field`
        : null;
  return { decl: { ...decl, value: { diff: { ...diff, of: bare(diff.of), per: bare(diff.per) } } as Value, group_by: decl.group_by ?? ((a ?? b) as string) }, said };
}

/** Every key anywhere in a value expression. A field NAME is a value and never appears here. */
function keysOf(value: unknown): string[] {
  if (value === null || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(keysOf);
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => [k, ...keysOf(v)]);
}

/** The one aggregation of a value, or the two halves of a ratio or a difference. */
function halvesOf(value: Value): Aggregation[] {
  const pair = 'ratio' in value ? value.ratio : 'diff' in value ? value.diff : null;
  return (pair ? [pair.of, pair.per] : [value as Aggregation]).filter((half): half is Aggregation => half !== null && typeof half === 'object');
}

/** Every aggregation a value expression reads, with the field each names. */
function aggregationsOf(value: Value): { kind: string; field: string; by?: string; lookup?: string }[] {
  const flat = (agg: Aggregation): { kind: string; field: string; by?: string; lookup?: string }[] => {
    const entry = kindOf(agg);
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

     AND IT NAMES THE PREDICTION IT GRADES, so the record holds it as it holds that prediction. Without the id the
     record matched the question's words, and two predictions in the same words, one over Money and one over Inbox, both
     answered, so the Inbox miss was held from the member who reads Inbox. */
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

/**
 * The line a figure's days with no rate are kept in: one `metric_point` a day under `no-rate:<figure>`, holding how
 * many pairs had no rate (`value`), gone the night the day gets its point.
 *
 * A LINE OF ITS OWN AND NOT A TABLE, so it travels, is erased and is exported as every kept line is. NOT IN THE
 * FIGURE'S OWN LINE under another grain, because a reader of a line by its name alone would take the day for a point.
 * ITS SOURCE IS THE NIGHT'S (`night.`), which Health's late-numbers sign leaves out: it is written by the record
 * about itself, and a line that stops when rates arrive is not a number gone quiet.
 */
const noRateLine = (figure: string): string => `no-rate:${figure}`;
const NO_RATE_SOURCE = 'night.no-rate';

/**
 * `missing` is every day asked for that got no point, and `noRate` is how many of those are missing for want of a rate
 * of that day: the figure had its rows and no way to price them as that day's. `rewrote` is how many days of
 * the night's window (`REWRITE_DAYS`) held a point whose value or unit the night moved.
 */
export type Snapshot = { series: string; wrote: number; backfilled: number; rewrote: number; missing: number; noRate: number };

/**
 * HOW MANY DAYS, YESTERDAY FIRST, EACH NIGHT READS AGAIN AND CORRECTS: yesterday and the two before it.
 *
 * A bank's text for a Friday lands on the Saturday, and an entry dated Thursday is written down on Saturday morning. Kept
 * fill-only, the point of Thursday was the cash before that entry for as long as the line lasted. Three is a weekend and
 * the day each side of it; a later entry than that is a correction a person makes, and the backfill fills gaps only.
 */
export const REWRITE_DAYS = 3;

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
 *
 * AND IT CORRECTS THE LAST THREE NIGHTS, BY THREE RULES. Yesterday and the two days before it (`REWRITE_DAYS`) are read
 * again every night and written only where the value or the unit stored differs, so a day nothing changed keeps its
 * `wrote_at`. A point this writer did not write (its `source` is not the figure's) is never overwritten. Every day
 * before the three is fill-only, as the backfill always was.
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

/**
 * How many days of a figure's window hold no point in its kept line: the nights `snapshot` could not write,
 * which it counts (`missing`) and keeps nowhere, read back from `metric_point` by the record's own days.
 *
 * THE WINDOW ENDS YESTERDAY, the last day a night writes, in the record's zone (`clockOf`); today has no point until
 * tonight, and counting it would read one night missed every day. On a read of a past day it ends the day before that.
 *
 * A LINE IS NOT MISSED BEFORE IT BEGAN. The window starts at the line's first point if that is later, so a figure armed
 * three days ago is not thirty nights behind. NOTHING, NEVER NOUGHT, for a line with no point at all, or one that began
 * after the window: there is nothing to have missed yet, and nought would say every night was kept.
 *
 * ONE QUERY, however long the window: the line's first day, the days of the window holding a point, and which of the
 * others lacked a rate (`noRateLine`), together. "3 nights missed" over a line that had its rows and no rate to price
 * them at is a different thing to mend than a night that never ran, and the sentence says how many are which.
 */
function readSeriesGaps(sql: Sql, decl: MetricDecl, ctx: EvalContext, shift: number): Result<Reading> {
  const series = decl.source.slice('series.'.length);
  const back = (day: string, n: number): string => new Date(Date.parse(`${day}T12:00:00Z`) - n * DAY).toISOString().slice(0, 10);
  const today = new Date(clockOf(ctx)).toISOString().slice(0, 10);
  const last = back(today, 1);
  const first = back(today, Math.max(1, Math.round(shift / DAY)));
  /* A day that has since got its point is not one, whatever was kept of it. */
  const row = sql.one<{ began: string | null; held: number; no_rate: string | null }>(
    `SELECT (SELECT min(at) FROM metric_point WHERE series = ? AND grain = 'day') AS began, COUNT(DISTINCT at) AS held,
            (SELECT group_concat(at) FROM (SELECT n.at FROM metric_point n WHERE n.series = ? AND n.grain = 'day' AND n.at >= ? AND n.at <= ?
               AND NOT EXISTS (SELECT 1 FROM metric_point p WHERE p.series = ? AND p.grain = 'day' AND p.at = n.at) ORDER BY n.at)) AS no_rate
       FROM metric_point WHERE series = ? AND grain = 'day' AND at >= ? AND at <= ?`,
    series,
    noRateLine(series),
    first,
    last,
    series,
    series,
    first,
    last,
  );
  const began = row?.began ?? null;
  const t = decl.target as { lte?: unknown; gte?: unknown } | undefined;
  const said = (value: number | null, days: number, why: string): Result<Reading> => {
    const met = value === null ? null : typeof t?.lte === 'number' ? value <= t.lte : typeof t?.gte === 'number' ? value >= t.gte : null;
    return ok({ value, unit: null, rows: value ?? 0, held: days, delta: null, why, met, refusals: [] });
  };
  if (began === null) return said(null, 0, `${wordsOf(series)} has kept no point yet`);
  if (began > last) return said(null, 0, `${wordsOf(series)} began after the window`);
  const from = began > first ? began : first;
  const days = Math.round((Date.parse(`${last}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY) + 1;
  const gaps = days - Number(row?.held ?? 0);
  const why = `days of the last ${days} with no point in ${wordsOf(series)}`;
  /* The window asked about starts where the line did, so a day kept before that is not one of these. */
  const noRate = (row?.no_rate ?? '').split(',').filter((at) => at >= from).sort();
  if (gaps <= 0 || noRate.length === 0) return said(gaps, days, why);
  const out = said(gaps, days, `${why}, ${noRate.length === gaps ? (gaps === 1 ? 'for' : 'each for') : `${noRate.length} of them for`} want of a rate`);
  return out.ok ? ok({ ...out.value, noRateDays: noRate }) : out;
}

/**
 * WHO CAN MAKE AN ENTRY, as `events.<list>` sorts them and as its `where` names them (`by is not person`): a person, an
 * agent's run, a door's pattern, a rule somebody declared, a script, and the record itself, which is its own mechanisms
 * (`system`, and the kernel's own rules) and anything the history signs that is none of the others.
 *
 * AND AN IMPORT, WHICH IS NOBODY'S LEGWORK: `braindog import` writes over the API as a run of its own, by no agent anybody
 * named, under a client id that says import (`apps/cli/src/import.ts`). Sorted as an agent, 200 lines copied from another
 * tool read as 200 filed for you, so it is a maker of its own that `by is agent or door or rule` does not keep.
 */
export const MAKERS = ['person', 'agent', 'door', 'rule', 'script', 'record', 'import'] as const;

/** How the client id of `braindog import`'s run begins (`apps/cli/src/import.ts`, the `x-braindog-client` it sends). */
const IMPORT_CLIENT = 'braindog-import-';
export type Maker = (typeof MAKERS)[number];

/** The kernel's own rules, which are the record acting and nobody's declared rule (`undo.ts` `whoOf` says the same three). */
const OWN_RULES: ReadonlySet<string> = new Set(['rule:ladder', 'rule:additive', 'rule:update', 'rule:handled']);

/** An id written with hyphens or underscores, as words: `tidy-ledger` is "Tidy ledger". */
const idWords = (id: string): string => wordsOf(id.replace(/-/gu, '_'));

/** What `by` may be asked about over `events.<list>`: one enum, the makers. */
const madeSchema = (list: string): Schema => ({ register: list, fields: { by: { type: 'enum', values: MAKERS } } });

/**
 * The `where` of a figure over `events.<list>`, as a predicate over `by`, with what is wrong with it.
 *
 * `by` AND NOTHING ELSE. The grammar grants every schema the record's own columns (`created_at`, `state`), and a clause
 * on one would be compiled, never applied, and the figure would read as if it had been: so any other field is refused
 * by name. The entries' own fields are a question for a figure over `register.<list>`.
 */
function madeBy(where: Predicate | string | undefined, list: string, nowMs: number): { predicate: Predicate | undefined; bad: Refusal[] } {
  if (where === undefined) return { predicate: undefined, bad: [] };
  const schema = madeSchema(list);
  const parsed = typeof where === 'string' ? parseWhere(where, schema, { nowMs }) : { predicate: where, bad: [] as Refusal[] };
  if (parsed.bad.length) return parsed;
  const other = new Set<string>();
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    for (const q of ['all', 'any', 'none'] as const) if (Array.isArray(n[q])) return void (n[q] as unknown[]).forEach(walk);
    if (typeof n.field !== 'string' || n.field !== 'by' || n.via !== undefined) other.add(typeof n.field === 'string' ? n.field : 'pointed');
  };
  walk(parsed.predicate);
  if (other.size)
    return {
      predicate: undefined,
      bad: [...other].map((field) => ({ code: 'FIELD_UNKNOWN', fix: `${field} is not asked of events.${list}, which narrows by who made an entry: by is ${MAKERS.join(', ')}`, at: 'where' })),
    };
  return { predicate: parsed.predicate, bad: compile(parsed.predicate, schema).bad };
}

/** Who one signature in the history is: the kind, the key its part is kept under, and what a person calls it. */
type Made = { by: Maker; key: string; label: string };

/**
 * Who an actor in the history is, for a part of `events.<list>`.
 *
 * A NAME, NEVER A HANDLE, IN THE LABEL: a person by name, a run by its agent, a pattern by the add-on that brought it
 * (so an add-on of twelve patterns is one part, "HSBC Egypt", and not twelve), a rule by the name it was declared with.
 * The key keeps the handle, because a link and a filter are made from it. Every run of one agent is one part.
 */
function makerOf(sql: Sql, actor: string): Made {
  const named = (id: string): { pack: string | null; name: string | null } => {
    const row = sql.one<{ pack_id: string | null; name: unknown }>(
      "SELECT pack_id, json_extract(body, '$.name') AS name FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0",
      id,
    );
    return { pack: row?.pack_id ?? null, name: typeof row?.name === 'string' && row.name.trim() !== '' ? row.name.trim() : null };
  };
  if (actor.startsWith('p_')) {
    const name = sql.one<{ name: string | null }>('SELECT name FROM person WHERE id = ?', actor)?.name?.trim();
    return { by: 'person', key: `person:${actor}`, label: name || 'Someone' };
  }
  if (new RegExp(`^${SESSION_PREFIX}\\d+$`, 'u').test(actor) || actor.startsWith('agent:')) {
    const session = actor.startsWith('agent:')
      ? null
      : sql.one<{ a: unknown; c: unknown }>(
          "SELECT json_extract(fields, '$.agent') AS a, json_extract(fields, '$.client_id') AS c FROM entry WHERE register = ? AND seq = ?",
          SESSION,
          Number(actor.slice(SESSION_PREFIX.length)),
        );
    const agent = actor.startsWith('agent:') ? actor.slice('agent:'.length) : session?.a;
    /* AN IMPORT'S RUN, by its client id and by naming no agent: a named agent that happens to carry the prefix is still it. */
    if ((typeof agent !== 'string' || agent === '' || agent === 'other') && typeof session?.c === 'string' && session.c.startsWith(IMPORT_CLIENT))
      return { by: 'import', key: 'import', label: 'An import' };
    return typeof agent === 'string' && agent !== '' && agent !== 'other'
      ? { by: 'agent', key: `agent:${agent}`, label: idWords(agent) }
      : { by: 'agent', key: 'agent', label: 'An agent' };
  }
  if (actor.startsWith('ingest:')) {
    const id = actor.slice('ingest:'.length);
    const decl = named(`ingest.${id}`);
    const pack = decl.pack === null ? null : sql.one<{ name: unknown }>("SELECT json_extract(manifest, '$.name') AS name FROM pack WHERE id = ?", decl.pack);
    const addOn = typeof pack?.name === 'string' && pack.name.trim() !== '' ? pack.name.trim() : null;
    return { by: 'door', key: `door:${decl.pack ?? id}`, label: addOn ?? (decl.pack === null ? (decl.name ?? idWords(id)) : idWords(decl.pack)) };
  }
  if (actor.startsWith('script:')) {
    const bare = actor.slice('script:'.length).replace(/@v\d+$/u, '');
    return { by: 'script', key: `script:${bare}`, label: idWords(bare) };
  }
  if (actor.startsWith('rule:') && !OWN_RULES.has(actor)) {
    const id = actor.slice('rule:'.length);
    return { by: 'rule', key: actor, label: named(`rule.${id}`).name ?? idWords(id) };
  }
  return { by: 'record', key: 'record', label: 'BrainDog' };
}

/**
 * A figure over `events.<list>`: how many of the list's entries were made in the window, in parts by who made them.
 *
 * THE WINDOW IS WHOLE DAYS ENDING TODAY, in the record's zone (`clockOf`, `dayStartsAt`): `1d` is today so far and `30d`
 * is today and the twenty-nine days before it. So "filed today" and the list beside it name the same day.
 *
 * AN ENTRY COUNTS ONCE, UNDER WHOEVER MADE IT. The walk is over the list's entries, one each, and the history is asked
 * one thing of each: who signed its first `create`. An edit, a rule that set a field after, a delete and a restore make
 * no entry and move none to another part. An entry deleted since is not in the list and is not counted.
 *
 * BOUNDED TO ONE LIST AND ITS WINDOW (REC-B20's risk): the entries are chosen by list and by when they were made before
 * the history is opened, and it is opened by its index on the target, one entry at a time.
 *
 * `held` IS EVERY ENTRY MADE IN THE WINDOW, whoever made it, and `value` the ones the `where` kept. An entry whose
 * making the history does not hold is in `held` and in no part: nobody can be named for it.
 */
function readMade(sql: Sql, decl: MetricDecl, ctx: EvalContext, shift: number, list: string, who: Predicate | undefined): Result<Reading> {
  const days = Math.max(1, Math.round(shift / DAY));
  const today = new Date(clockOf(ctx)).toISOString().slice(0, 10);
  const first = new Date(Date.parse(`${today}T12:00:00Z`) - (days - 1) * DAY).toISOString().slice(0, 10);
  const starts = (day: string): string => (ctx.tz === undefined ? `${day}T00:00:00.000Z` : dayStartsAt(day, ctx.tz));
  const signed = sql.all<{ actor: string | null; n: number }>(
    `SELECT (SELECT c.actor FROM event c WHERE c.target = 'entry:' || r.id AND c.kind = 'create' AND c.field IS NULL ORDER BY c.rowid LIMIT 1) AS actor,
            COUNT(*) AS n
       FROM entry r WHERE r.register = ? AND r.deleted_at IS NULL AND r.created_at >= ? AND r.created_at < ?${ctx.viewer === undefined ? '' : ` AND ${unprivate('r.id')}`} GROUP BY 1`,
    list,
    starts(first),
    starts(dayAfter(today)),
    ...(ctx.viewer === undefined ? [] : [ctx.viewer]),
  );
  const schema = madeSchema(list);
  const parts = new Map<string, Group>();
  let held = 0;
  for (const row of signed) {
    const n = Number(row.n);
    held += n;
    if (row.actor === null) continue;
    const made = makerOf(sql, row.actor);
    if (who !== undefined && !evaluate(who, { by: made.by }, schema)) continue;
    const part = parts.get(made.key) ?? { key: made.key, label: made.label, value: 0, rows: 0, state: 'full' as const };
    parts.set(made.key, { ...part, value: (part.value ?? 0) + n, rows: part.rows + n });
  }
  const groups = [...parts.values()].sort(largestFirst);
  const value = groups.reduce((sum, g) => sum + g.rows, 0);
  const t = decl.target as { lte?: unknown; gte?: unknown } | undefined;
  const met = typeof t?.lte === 'number' ? value <= t.lte : typeof t?.gte === 'number' ? value >= t.gte : null;
  const name = sql.one<{ name: unknown }>("SELECT json_extract(body, '$.name') AS name FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0", `register.${list}`)?.name;
  const why = `${typeof name === 'string' && name.trim() !== '' ? name.trim() : idWords(list)} entries made ${days === 1 ? 'today' : `in the last ${days} days`}`;
  const more = Math.max(0, groups.length - GROUP_CAP);
  return ok({ value, unit: null, rows: value, held, delta: null, why, met, refusals: [], groups: groups.slice(0, GROUP_CAP), ...(more > 0 ? { more } : {}) });
}

/**
 * A figure over `events.<list>` as `{ count: 'changed', field }`: how many of the list's entries had that field changed
 * in the window, and with a `bucket`, in each bucket of it (AGT-C17 job c, "skills changing", by week).
 *
 * THE WINDOW IS `readMade`'S, whole days ending today in the record's zone. A BUCKET IS CUT BY THE DAY OF THE CHANGE as
 * the history wrote it, the way a figure over a list cuts `created_at` (`groupsOf`), so the learnings that arrived and
 * the skills that changed in one week of one chart are cut at the same edge.
 *
 * AN ENTRY COUNTS ONCE IN EACH PART, however many times it changed there: a skill that took two versions in a week is
 * one skill that changed that week, so "2 skills changed" says what it counts. An edit of any other field, a change to
 * an entry deleted since, and the entry's making are not counted. A state field changes by a `state` line, any other by
 * an `edit`, and both are read.
 *
 * ONE BOUND QUERY: the history by its index on the time, inside the window, joined to the list's live entries.
 */
function readChanged(sql: Sql, decl: MetricDecl, ctx: EvalContext, shift: number, list: string, field: string): Result<Reading> {
  const days = Math.max(1, Math.round(shift / DAY));
  const today = new Date(clockOf(ctx)).toISOString().slice(0, 10);
  const first = new Date(Date.parse(`${today}T12:00:00Z`) - (days - 1) * DAY).toISOString().slice(0, 10);
  const starts = (day: string): string => (ctx.tz === undefined ? `${day}T00:00:00.000Z` : dayStartsAt(day, ctx.tz));
  const lines = sql.all<{ d: string; t: string }>(
    `SELECT DISTINCT substr(e.ts, 1, 10) AS d, e.target AS t
       FROM event e JOIN entry r ON r.id = substr(e.target, 7)
      WHERE e.ts >= ? AND e.ts < ? AND e.kind IN ('edit', 'state') AND e.field = ? AND substr(e.target, 1, 6) = 'entry:'
        AND r.register = ? AND r.deleted_at IS NULL`,
    starts(first),
    starts(dayAfter(today)),
    field,
    list,
  );
  const value = new Set(lines.map((l) => l.t)).size;
  const t = decl.target as { lte?: unknown; gte?: unknown } | undefined;
  const met = typeof t?.lte === 'number' ? value <= t.lte : typeof t?.gte === 'number' ? value >= t.gte : null;
  const body = sql.one<{ name: unknown; fields: unknown }>(
    "SELECT json_extract(body, '$.name') AS name, json_extract(body, '$.fields') AS fields FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0",
    `register.${list}`,
  );
  const named = typeof body?.name === 'string' && body.name.trim() !== '' ? body.name.trim() : idWords(list);
  const label = (() => {
    try {
      const held = (JSON.parse(String(body?.fields ?? '[]')) as { id?: unknown; label?: unknown }[]).find((f) => f?.id === field)?.label;
      return typeof held === 'string' && held.trim() !== '' ? held.trim().toLowerCase() : idWords(field).toLowerCase();
    } catch {
      return idWords(field).toLowerCase();
    }
  })();
  const why = `${named} whose ${label} changed ${days === 1 ? 'today' : `in the last ${days} days`}`;
  const whole = { value, unit: null, rows: value, held: value, delta: null, why, met, refusals: [] };
  if (decl.bucket === undefined) return ok(whole);

  /* EVERY BUCKET FROM THE FIRST CHANGE TO THE ONE THE CLOCK IS IN, one nothing changed in `empty`: a gap, never a zero. */
  const bucket = decl.bucket;
  const current = bucketOf(new Date(clockOf(ctx)).toISOString(), bucket)!;
  const each = new Map<string, Set<string>>();
  for (const l of lines) {
    const key = bucketOf(String(l.d), bucket);
    if (key !== null) each.set(key, (each.get(key) ?? new Set<string>()).add(l.t));
  }
  const keys = [...each.keys()].sort();
  if (keys.length === 0) return ok({ ...whole, groups: [], current, more: 0 });
  const run = bucketRun(keys[0]!, keys.at(-1)! > current ? keys.at(-1)! : current, bucket, GROUP_CAP);
  const groups: Group[] = run.keys.map((key) => {
    const n = each.get(key)?.size ?? 0;
    return { key, value: n === 0 ? null : n, rows: n, state: bucketState(key, n, current, key === run.keys[0] && run.more === 0) };
  });
  return ok({ ...whole, groups, current, more: run.more });
}

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

  let noRate = 0;
  /* `wrote` a day that held no point, `rewrote` one whose value or unit moved, `same` one read again and found as kept. */
  const write = (day: string, overwrite: boolean): 'wrote' | 'rewrote' | 'same' | 'kept' | 'missing' => {
    const held = sql.one<{ value: number; unit: string | null; source: string | null }>(
      "SELECT value, unit, source FROM metric_point WHERE series = ? AND grain = 'day' AND at = ?",
      decl.metric,
      day,
    );
    /* A POINT ANOTHER WRITER KEPT IS ITS OWN (an import, a figure fetched from a provider): this night never moves it. */
    if (held && (!overwrite || held.source !== decl.source)) return 'kept';

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
    /* AND AS A POINT (`EvalContext.point`): a rate of the amount's own day, the day before or the quiet days before
       that (`RATE_QUIET_DAYS`), else no number. */
    const read = evaluateMetric(sql, decl, { ...ctx, asOfMs: Date.parse(`${day}T12:00:00Z`), tz: deps.tz, point: true });
    /* A NULL VALUE IS NO ROW. A series with a zero on every day nothing happened is a series that
       cannot tell "nothing" from "no answer", and the difference is the whole of a trend. */
    if (!read.ok || read.value.value === null) {
      /* A DAY THAT HAS ITS POINT KEEPS IT when the night reads it again and finds no number: a rate gone quiet or a late
         entry in a currency with no rate makes the day unknown, not nothing, and the point it had is still the best said. */
      if (held) return 'kept';
      /* THE REASON IS "NO RATE" when the figure named a pair it could not price, or left amounts out and is at least:
         a lower bound is not that day's number either. A night with no rate is counted, and a later night with one
         fills the day in, since the backfill writes every day that holds no point. */
      const pairs = read.ok ? (read.value.fx?.missing.length ?? 0) : 0;
      if (read.ok && (read.value.atLeast === true || pairs > 0)) {
        noRate++;
        /* AND THE DAY IS KEPT, so the figure over this line can say which nights were a rate's (`readSeriesGaps`). */
        sql.exec(
          `INSERT INTO metric_point (series, grain, at, value, unit, n, source, wrote_at) VALUES (?, 'day', ?, ?, '', NULL, ?, ?)
           ON CONFLICT (series, grain, at) DO UPDATE SET value = excluded.value, source = excluded.source, wrote_at = excluded.wrote_at`,
          noRateLine(decl.metric),
          day,
          Math.max(1, pairs),
          NO_RATE_SOURCE,
          deps.nowAt,
        );
      } else sql.exec("DELETE FROM metric_point WHERE series = ? AND grain = 'day' AND at = ?", noRateLine(decl.metric), day);
      return 'missing';
    }
    sql.exec("DELETE FROM metric_point WHERE series = ? AND grain = 'day' AND at = ?", noRateLine(decl.metric), day);

    const wrote = point(read.value.value, read.value.unit);
    /* THE SAME ANSWER IS NOT WRITTEN AGAIN, so `wrote_at` still says when the day last moved. */
    if (held && Number(held.value) === wrote.value && (held.unit ?? '') === (wrote.unit ?? '')) return 'same';

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
    return held ? 'rewrote' : 'wrote';
  };

  /* YESTERDAY AND THE TWO DAYS BEFORE IT ARE READ AGAIN (`REWRITE_DAYS`), so a snapshot that ran twice in one day agrees
     with itself and a Thursday entry that lands on Saturday moves Thursday. No further back than the backfill reaches:
     a night asked for no days behind yesterday reads yesterday alone. Every earlier day is kept. */
  const today = write(yesterday, true);
  let backfilled = 0;
  let rewrote = today === 'rewrote' ? 1 : 0;
  let missing = today === 'missing' ? 1 : 0;

  for (let n = 1; n <= backfillDays; n++) {
    const out = write(back(yesterday, n), n < REWRITE_DAYS);
    if (out === 'wrote') backfilled++;
    if (out === 'rewrote') rewrote++;
    if (out === 'missing') missing++;
  }

  /* `wrote` is whether yesterday holds this figure's point after the night, written now or found as it was kept. */
  return ok({ series: decl.metric, wrote: today === 'wrote' || today === 'rewrote' || today === 'same' ? 1 : 0, backfilled, rewrote, missing, noRate });
}
