/**
 * A metric, DECLARED.
 *
 * `08-METRICS-AND-ANALYTICS` §2 specifies the whole document — source, predicate, aggregation,
 * format, target, window, comparison — and the implementation was a twelve-case `switch` with
 * `const KILN = 1` inside it. Two consequences, and the second is the expensive one:
 *
 *   - there was exactly one project page, because a second project meant a thirteenth case;
 *   - `stat` was unusable on any page an agent writes, because every figure it can show was a
 *     branch in a function an agent cannot reach.
 *
 * WHAT IS BUILT HERE IS THE DOCUMENT, NOT THE WHOLE GRAMMAR. The spec's eleven aggregations,
 * `group_by`, `bucket`, `snapshot` and the series source are post-v1 shapes with no consumer in
 * this build; what is here is the part every existing tile needed — six aggregations, the closed
 * `ratio`/`diff` combinator, a row-level product through a named lookup, the two required fields,
 * and the comparison gate. A declaration that reaches for the rest is refused by name rather than
 * ignored, which is the rule the rest of this package already follows.
 *
 * THE TWO REQUIRED FIELDS ARE REQUIRED. §2.2, in bold: a number with no target is decoration, and a
 * number with no comparison window is a number you cannot act on. Both are refused here with that
 * sentence, because every dashboard product makes them optional and every dashboard product is full
 * of numbers nobody acts on.
 *
 * AND THE LINK IS DERIVED. A tile's href used to be typed beside its predicate, so the two drifted —
 * measured twice: a tile counting five states whose link listed three, and a figure excluding
 * cancelled services whose link included them. One predicate now produces both the figure and the
 * URL, so they cannot disagree.
 */

import {
  GROUP_CAP,
  across,
  bucketOf,
  bucketRun,
  bucketState,
  dayFieldOf,
  fxOfPair,
  isBucket,
  largestFirst,
  pairParts,
  rateUnit,
  targetFor,
  type Bucket,
  type FxRead,
  type Group,
  type Part,
  type Rate,
  type Reduce,
  type TargetIn,
} from '@braindog/kernel';
import { clausesOf, quoteValue } from '@braindog/where';
import { day as longDay, integer, money, shortDay } from 'braindog-render';

import { copy } from '../copy.ts';
import { LOOKUPS, REGISTERS, ROWS } from './held.ts';
import { BARE, amountOf, currencyOf, mixedFix } from './money.ts';
import { compile, everyClause, explain, joinsWithOr, matches, registerHref, resolveDay } from './where.ts';
import type { Clause, Where } from './where.ts';
import type { Entry } from './schema.ts';

/* ── the document ────────────────────────────────────────────────────────── */

/** The six this build reads. `median`, `last`, `running` and `trend` are §2.3 and series-only. */
export type Aggregation =
  | { sum: Operand }
  | { count: string }
  | { avg: Operand }
  | { min: string }
  | { max: string }
  | { distinct: string };

/**
 * A field, or a row-level product of a field and a named lookup.
 *
 * §2.5's shape, with a literal table instead of an `fx` register: a service's `cost` is per CYCLE,
 * so a yearly domain and a monthly bucket are two different units and adding them produces a number
 * that is not about anything. That factor used to be written out longhand in one metric and omitted
 * from another, and Kiln's annual cost came out 9.25 times too low.
 */
export type Operand = string | { product: [string, { lookup: string; by: string }] };

export type Value =
  | Aggregation
  | { ratio: { of: Aggregation; per: Aggregation } }
  | { diff: { of: Aggregation; per: Aggregation } };

export type MetricDecl = {
  metric: string;
  name: string;
  /** `register.<id>`, or one of the two figures the record computes rather than stores. */
  source: string;
  /** The sentence grammar, the same one a block's `where:` reads. */
  where?: string;
  value: Value;
  /**
   * `money.<CUR>` · `int` · `decimal` · `pct` · `days`.
   *
   * OPTIONAL, which every reader already assumed and this type did not say. A declaration without
   * one crashed `format()` on `shape.startsWith` — a `TypeError` out of a figure, on a page. A
   * number with no declared shape is written as a number.
   */
  format?: string;
  /** What good looks like. Money is minor units, like everywhere else. */
  target: { lte: number } | { gte: number };
  /** The comparison shift: `compare` re-evaluates the predicate with `asOf = now − W`. */
  window: string;
  /**
   * `08 §2`'s three words, and this type knew two of them.
   *
   * The kernel's copy of this union had the same two, so both engines agreed by both being wrong,
   * which `50 §1` is about and which a differential pass cannot see. `year_ago` installed and was
   * computed as `previous`: see `yearBefore` for what the record means by a year and what the
   * drift cost.
   */
  compare?: 'previous' | 'year_ago' | 'none';
  /**
   * The factor tables the declaration carries, which the record reads. The sample reads the seed's own `LOOKUPS`, which
   * is where the seed's declarations copy theirs from, so the two cannot name different factors.
   */
  lookups?: Record<string, Record<string, number>>;
  /** One field the figure is also read per value of, as the record reads it (`08 §2.1`). */
  group_by?: string;
  /** `day` · `week` · `month` · `quarter` · `year`, beside a date `group_by` only. */
  bucket?: Bucket;
  /**
   * THE CLAUSES A PARAMETER FILLED, WHICH ARE SCOPE AND NOT FILTER, and what `held` counts.
   *
   * NOBODY WRITES THIS IN A DOCUMENT. `withParam` puts it on the copy it hands `read`, the way the
   * kernel's `fill` puts `MetricDecl.within` on the copy it hands `evaluateMetric`. The seed carries
   * no such key and needs none.
   *
   * IT IS THE SECOND COPY OF A RULE THAT SHOULD EXIST ONCE, which `50 §1` is about: the kernel
   * derives it in `scopeOf` and this file derives it again, because there are two engines. Measured
   * before it existed, over the demo's own rows: `project-owed:Kiln` answered `held: 40` here and
   * `held: 10` in the kernel, and forty is every obligation in the record. `engines.test.ts` now
   * drives the two over the same declaration, each filling the parameter by its own rule, so the
   * next divergence is a failing test rather than two screens.
   */
  within?: string;
};

/* ── evaluating one ──────────────────────────────────────────────────────── */

export type Reading = {
  /** `null` when the metric could not be read; `refusals` says why. */
  value: number | null;
  shown: string;
  /** How many rows the predicate matched. Zero of these is an answer. */
  rows: number;
  /**
   * How many rows the source register holds AT ALL. Zero of these is not an answer.
   *
   * Nothing overdue on a register of thirty-eight obligations is the good news the figure exists to
   * deliver. Nothing overdue on a register somebody has not typed into yet is not news at all, and
   * with only `rows` to read from, the tile could not tell them apart — so an hour-old record
   * reported its finances healthy, in green, on all four tiles.
   *
   * AND A PARAMETER IS PART OF THE SCOPE, so `project-owed:Kiln` counts Kiln's obligations and not
   * the record's. This was `ROWS[register].length` with no scope input at all, which made every
   * project page read the whole register: measured on the demo's rows, `project-owed:Kiln` answered
   * `held: 40` here against the kernel's `held: 10`, so a project created inside a record that
   * already has invoices elsewhere read `rows: 0` out of forty held, which is the good-news zero.
   * `MetricDecl.within` carries the clauses the parameter filled and this is counted inside them.
   */
  held: number;
  /** The proportional change against the shifted window, or `null` when it is not comparable. */
  delta: number | null;
  /** Why there is no delta, in words, so an absent comparison is not an absent explanation. */
  why: string;
  /**
   * The same fact for the person reading the tile, or `null` when no comparison was asked for.
   *
   * `why` IS THE AUTHOR'S PHRASE and this is the reader's. "the predicate does not mention time, so
   * the window moves nothing" is precise and is addressed to whoever wrote the declaration; what a
   * person under a headline figure needs is that nothing here is dated, so there is no before.
   *
   * `null` FOR `compare: 'none'` IS DELIBERATE. A figure whose declaration says not to compare it is
   * not missing a comparison — it is a figure that does not have one, and saying so every time
   * would be noise on every tile that is working exactly as declared.
   */
  unmeasured: string | null;
  refusals: string[];
  /** The rows the figure was computed over, as an address; absent when the figure reads no list, so it opens nothing. */
  href?: string;
  /** A grouped figure's parts, as the record's `groupsOf` returns them. */
  groups?: Group[];
  /** The bucket the clock is in, on a figure bucketed by date. */
  current?: string;
  /** Groups past the cap of fifty, left out. */
  more?: number;
  /** The currency a money figure is in, as the record's `unit` says it; `null` for a plain figure or one in parts. */
  unit?: string | null;
  /** Money in more than one currency that was not added up: one amount per currency, and `value` is `null`. */
  parts?: Part[];
  /** How a figure across currencies was read, as the record's `fx` says it. */
  fx?: FxRead;
  /** A figure converted out of its declared currency: its target converted too, as the record's `targetIn` says it. */
  targetIn?: TargetIn;
};

const DAY_MS = 86_400_000;

/* ── money across currencies ─────────────────────────────────────────────── */

/**
 * The home currency and the dated rates this build's figures read: none of either until something hands them in.
 *
 * THE ARITHMETIC IS THE RECORD'S (`fx.ts`, imported), so a figure over the same rows at the same rates is the same
 * minor unit in both engines. A test hands in a home currency with `withFx`, which is how the engines are held equal.
 *
 * IT WAS THE SAMPLE'S `fx` ROWS, and `blocks.ts` converts with this whenever a block arrives without rates of its own,
 * so a live bar the record sent no rates for was converted at the sample's. `fixtures/fill.ts` hands those rows in for
 * the tests that read the sample.
 */
let fxSource: () => { home: string | null; rates: readonly Rate[] } = () => ({ home: null, rates: [] });

/** Read every figure with this home currency and these rates until the returned function puts the last ones back. */
export function withFx(source: () => { home: string | null; rates: readonly Rate[] }): () => void {
  const before = fxSource;
  fxSource = source;
  return () => {
    fxSource = before;
  };
}

/** The home currency and rates figures are read with now. */
export const fxNow = (): { home: string | null; rates: readonly Rate[] } => fxSource();

/** How a figure is read: the currency it is added up in and the rates, and `bools`, the register's yes-or-no fields. */
type Fx = { into: string | null; home: string | null; rates: readonly Rate[]; today: string; day: string | null; bools: ReadonlySet<string> };

/** What a figure is, beside its number: the currency it is in, or its parts and how it was read. */
type Figure = { value: number | null; unit: string | null; parts?: Part[]; fx?: FxRead };

/**
 * One value expression over rows, in the currency the figure is added up in.
 *
 * A SUM OF MONEY IN A CURRENCY OTHER THAN THAT ONE is converted at the rate as of each row's day, or said one amount per
 * currency, as the record's `aggregate` does. Everything else is `evaluateValue`, and the checks in `read` refuse it.
 */
function figureOf(rows: Entry[], value: Value, fx: Fx): Figure {
  if ('ratio' in value || 'diff' in value) return pairOf(rows, value, fx);
  const n = evaluateValue(rows, value, fx.bools);
  const seen = currenciesOf(rows, value);
  const only = seen.size === 1 ? [...seen][0]! : null;
  const unit = only === BARE ? null : only;
  const kind: Reduce | null = 'sum' in value ? 'sum' : 'avg' in value ? 'avg' : 'min' in value ? 'min' : 'max' in value ? 'max' : null;
  if (kind === null || seen.has(BARE) || seen.size === 0 || !(seen.size > 1 || (fx.into !== null && only !== fx.into))) return { value: n, unit };
  const field = (value as Record<Reduce, Operand>)[kind];
  const id = typeof field === 'string' ? field : field.product[0];
  const amounts = rows.flatMap((e) => {
    const currency = currencyOf(e.fields[id]);
    const amount = operand(e, field);
    const at = fx.day ? e.fields[fx.day] : null;
    return currency === null || amount === null ? [] : [{ currency, amount, day: typeof at === 'string' ? at.slice(0, 10) : null }];
  });
  const got = across(amounts, fx.into, fx.rates, fx.today, fx.home !== null, kind);
  if (got.kind === 'one') return { value: got.amount, unit: got.currency };
  if (got.kind === 'converted') return { value: got.amount, unit: got.currency, fx: { into: fx.into, home: fx.home, asOf: got.asOf, forward: got.forward, stale: got.stale, missing: [] } };
  return { value: null, unit: null, parts: got.parts, fx: { into: fx.into, home: fx.home, asOf: null, forward: false, stale: false, missing: got.missing } };
}

/** The field an aggregation reads, whatever it multiplies it by. `id` for a count of rows. */
const fieldOf = (agg: Aggregation): string => {
  const op = 'count' in agg ? agg.count : 'distinct' in agg ? agg.distinct : 'sum' in agg ? agg.sum : 'avg' in agg ? agg.avg : 'min' in agg ? agg.min : agg.max;
  return typeof op === 'string' ? op : op.product[0];
};

/**
 * IS THIS A FIGURE OF MONEY? THE DECLARED TYPE OF A FIELD IT AGGREGATES ANSWERS, as the record's
 * `isMoneyFigure` asks it, and a unit that happens to be three upper-case letters does not: `KGS` is a
 * weight and `GBP` is not, and only the declaration can tell them apart.
 *
 * `some` AND NOT `every`, for the reason the record gives: a rate takes its currency from one half, so
 * `sum(balance) / count(id)` is an average balance in the currency of the balances, and `id` names no
 * declared field at all.
 */
const isMoneyFigure = (register: string | null, value: Value): boolean => {
  const fields = register ? REGISTERS[register]?.fields : undefined;
  if (!fields) return false;
  const aggs: Aggregation[] = 'ratio' in value ? [value.ratio.of, value.ratio.per] : 'diff' in value ? [value.diff.of, value.diff.per] : [value];
  return aggs.some((agg) => fields.find((f) => f.id === fieldOf(agg))?.type === 'money');
};

/**
 * A ratio or a diff over rows, as the record's `read` reads one: each half in the currency the figure is added up in,
 * or, when a half is in parts or the halves are in two currencies, once per currency over the rows in it (`pairParts`).
 */
function pairOf(rows: Entry[], value: Extract<Value, { ratio: unknown } | { diff: unknown }>, fx: Fx): Figure {
  const ratio = 'ratio' in value;
  const pair = 'ratio' in value ? value.ratio : value.diff;
  const of = figureOf(rows, pair.of, fx);
  const per = figureOf(rows, pair.per, fx);
  const code = (u: string | null | undefined): u is string => typeof u === 'string' && /^[A-Z]{3}$/u.test(u);
  if (of.parts || per.parts || (code(of.unit) && code(per.unit) && of.unit !== per.unit)) {
    const currencies = [of, per].flatMap((h) => h.parts?.map((p) => p.currency) ?? (code(h.unit) ? [h.unit] : []));
    const moneyField = (agg: Aggregation): string | null => {
      const f = fieldOf(agg);
      return rows.some((e) => currencyOf(e.fields[f]) !== null) ? f : null;
    };
    const ofField = moneyField(pair.of);
    const perField = moneyField(pair.per);
    const inCurrency = (agg: Aggregation, field: string | null, currency: string): number | null =>
      field === null ? null : aggregate(rows.filter((e) => currencyOf(e.fields[field]) === currency), agg);
    const parts = pairParts(currencies, ratio, (c) => ({ of: inCurrency(pair.of, ofField ?? perField, c), per: inCurrency(pair.per, perField ?? ofField, c) }));
    if (parts.length)
      return { value: null, unit: null, parts, fx: fxOfPair(fx, of.fx, per.fx, false) ?? { into: fx.into, home: fx.home, asOf: null, forward: false, stale: false, missing: [] } };
    return { value: null, unit: null };
  }
  const a = of.value;
  const b = per.value;
  const n = a === null || b === null ? null : ratio ? (b === 0 ? null : a / b) : a - b;
  const converted = fxOfPair(fx, of.fx, per.fx, true);
  return { value: n, unit: ratio ? rateUnit(of.unit, per.unit) : (of.unit ?? per.unit), ...(converted ? { fx: converted } : {}) };
}

/**
 * A figure's target line, in the currency the figure is written in: the declared one, or converted into the one it was
 * added up in and saying so. Empty when the figure is in another currency and no rate converts its target.
 */
export function targetSaid(decl: MetricDecl, r: { unit?: string | null | undefined; targetIn?: TargetIn | undefined }): string {
  if (!offTarget(decl, r.unit)) return targetLine(decl);
  if (!r.targetIn) return '';
  const from = r.targetIn.from ?? decl.format!.slice('money.'.length);
  const line = targetLine({ ...decl, format: `money.${r.targetIn.currency}`, target: r.targetIn.target });
  /* NOTHING IS NOTHING IN EVERY CURRENCY, so a bound of zero is not said to be converted; nor is one typed in this currency. */
  const bound = 'lte' in r.targetIn.target ? r.targetIn.target.lte : r.targetIn.target.gte;
  return bound === 0 || from === r.targetIn.currency ? line : copy.targetConverted(line, from);
}

/**
 * What a figure across currencies says under itself: why it is in parts, or as of which day's rates it was converted.
 * `null` for a figure in one currency. Read from the record's reading or this build's, which carry the same keys.
 */
export function fxNote(r: { parts?: readonly Part[] | undefined; fx?: FxRead | undefined }): string | null {
  if (!r.fx) return null;
  if (r.parts) {
    if (r.fx.home !== null && r.fx.missing.length) return copy.figureNoRate(r.fx.missing.join(', '));
    /* ONE CURRENCY AND NO HOME CURRENCY IS NOT A PROBLEM TO REPORT: the amount is said in the currency it is in. */
    return r.parts.length > 1 ? copy.figureNoHome : null;
  }
  /* A STALE RATE GETS ITS OWN SENTENCE, and it comes before `forward`. The footnote used to read
     the same whether the rate was yesterday's or July's, which is the whole defect: a poll that
     stopped because an action was paused or a key expired goes on converting, and a figure that
     never changes tone is a figure he keeps acting on. `forward` is about one amount's day; stale
     is about the whole figure, so stale wins when both are true. */
  if (r.fx.asOf && r.fx.stale) return copy.figureConvertedStale(longDay(r.fx.asOf));
  if (r.fx.asOf) return (r.fx.forward ? copy.figureConvertedForward : copy.figureConverted)(longDay(r.fx.asOf));
  return null;
}

/** Why a cash walk is drawn once per currency: the rate it lacks, or that no home currency is chosen. */
export const walksNote = (home: string | null, missing: readonly string[], walks: number): string | null =>
  home !== null && missing.length ? copy.figureNoRate(missing.join(', ')) : walks > 1 ? copy.figureNoHome : null;

/** Whether a figure came back in a currency other than the one it declares, so its target, which is in that one, does not apply. */
export const offTarget = (decl: { format?: string | undefined } | undefined, unit: string | null | undefined): boolean =>
  Boolean(decl?.format?.startsWith('money.') && unit && decl.format.slice('money.'.length) !== unit);

/** Amounts in several currencies as one line of text, each written in its own: `EGP 52,000.00 · USD 3,400.00`. */
export const partsText = (parts: readonly Part[]): string => parts.map((p) => money(Math.round(p.amount), p.currency)).join(' · ');

/**
 * A figure's parts as its format writes them: money in each currency, or a share or a count with the currency it is of,
 * `EGP 35% · USD 40%`, because a ratio of pounds to pounds is not an amount of pounds.
 */
export const partsShown = (shape: string | undefined, parts: readonly Part[]): string =>
  !shape || shape.startsWith('money.') ? partsText(parts) : parts.map((p) => `${p.currency} ${format(shape, p.amount)}`).join(' · ');
const WINDOW = /^(\d{1,4})([dwm])$/;

/** A window as milliseconds, or `null` when it is not one. */
export function windowMs(w: string): number | null {
  const m = WINDOW.exec(w.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n * (m[2] === 'd' ? DAY_MS : m[2] === 'w' ? 7 * DAY_MS : 30 * DAY_MS);
}

const registerOf = (source: string): string | null =>
  source.startsWith('register.') ? source.slice('register.'.length) : null;

/** One operand, on one row. `null` when the row does not carry it — absent is not zero. */
function operand(e: Entry, op: Operand): number | null {
  /* `amountOf` RATHER THAN `Number`, because money is `{ amount, currency }` and `Number({…})` is
     `NaN` — which this used to turn into `null`, so every money metric read as "—" with no refusal
     and no way to tell that from "no rows matched". */
  if (typeof op === 'string') {
    /* A DAY IS READ AS THE WHOLE DAYS SINCE 1970 THAT NAME IT, as the record reads a day's minimum. Only
       `min`, `max` and `avg` reach here with one: a sum of days is refused before this. */
    const v = e.fields[op];
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(v)) return Math.round(Date.parse(`${v}T00:00:00Z`) / DAY_MS);
    return amountOf(v);
  }
  const [field, { lookup, by }] = op.product;
  const base = operand(e, field);
  const factor = LOOKUPS[lookup]?.[String(e.fields[by] ?? '')];
  /* ROUNDED PER ROW, as the record rounds it: minor units are integers, and a third of a penny per row
     summed in one engine and rounded in the other put the two a penny apart on one tile. */
  return base === null || factor === undefined ? null : Math.round(base * factor);
}

/**
 * The `by` values in these rows that the declared table has no factor for.
 *
 * IT IS THE SET, NOT A BOOLEAN, because the sentence a person needs names the values — "no factor
 * for `yearly`" is actionable and "this figure is unreadable" is not.
 */
export function missingFactors(rows: Entry[], value: Value): string[] {
  const aggs: Aggregation[] =
    'ratio' in value ? [value.ratio.of, value.ratio.per] : 'diff' in value ? [value.diff.of, value.diff.per] : [value];
  const out = new Set<string>();
  for (const agg of aggs) {
    const field = 'count' in agg ? agg.count : 'distinct' in agg ? agg.distinct : 'sum' in agg ? agg.sum : 'avg' in agg ? agg.avg : 'min' in agg ? agg.min : agg.max;
    if (typeof field === 'string') continue;
    const { lookup, by } = field.product[1];
    for (const e of rows) {
      const key = String(e.fields[by] ?? '');
      if (LOOKUPS[lookup]?.[key] === undefined) out.add(`${lookup}.${key || '—'}`);
    }
  }
  return [...out].sort();
}

/**
 * The currencies the field an aggregation reads is written in.
 *
 * A SUM IS THE PLACE TWO CURRENCIES MEET. The predicate does not care, the count does not care, and
 * then one line adds them — and what comes out is a number of the right size in the wrong unit,
 * under a code the declaration chose rather than the rows did.
 */
function currenciesOf(rows: Entry[], agg: Aggregation): Set<string> {
  const field =
    'count' in agg ? agg.count : 'distinct' in agg ? agg.distinct : 'sum' in agg ? agg.sum : 'avg' in agg ? agg.avg : 'min' in agg ? agg.min : agg.max;
  const id = typeof field === 'string' ? field : field.product[0];
  const seen = new Set<string>();
  if (typeof id !== 'string') return seen;
  let bare = false;
  for (const e of rows) {
    const value = e.fields[id];
    /* A ROW WITH NOTHING IN THE FIELD IS NOT A UNIT MISMATCH. `null` and `undefined` are absent
       rather than unitless, and `amountOf` skips them; counting them as bare would refuse every
       metric over a field anybody left blank. */
    if (value === null || value === undefined) continue;
    const c = currencyOf(value);
    if (c) seen.add(c);
    else if (amountOf(value) !== null) bare = true;
  }
  /* MONEY AND BARE NUMBERS TOGETHER IS MIXED TOO, and this was the third summing site and the only
     one that did not say so. `money.ts`'s `total()` guards it by name — "quietly reading the bare
     ones as the currency of the others is the same failure wearing a different hat" — and
     `forecast.ts` guards it again for the cash walk, because a leg pointing at a `duration` field
     once poured seventeen thousand seconds into a sterling walk and moved the crossing day.
     
     Here the check collected only the NON-NULL currencies, so a set of size one passed however many
     unitless numbers were summed into it. The sentinel is a marker in the set rather than a second
     return value, so every existing caller of `currenciesRead` refuses without being changed. */
  if (bare && seen.size > 0) seen.add(BARE);
  return seen;
}

/**
 * The mark for "and some of these had no currency at all", which is `money.ts`'s and is passed on here.
 *
 * A string that is not a currency code, so it cannot collide with one and cannot be printed as one:
 * `mixedFix` renders the set into a sentence, and this reads as what it is.
 *
 * AND IT IS THE RECORD'S WORD RATHER THAN THIS ENGINE'S. It read `no currency` while
 * `packages/kernel/src/metrics.ts` wrote `no unit` into the same refusal, so the sample and a live
 * record said different things about the same two rows. `money.test.ts`'s first guard compared this
 * constant with `money.ts`'s and could not see the third copy; it opens a real record and drives the
 * whole refusal now, which is where the kernel's word is actually held.
 *
 * THIS LINE WAS A THIRD COPY OF THE STRING AND IS NOW A RE-EXPORT, which is the repair `money.ts`
 * asked for in words: *"the way out is for `metrics.ts` to delete its own line and re-export this
 * one"*. It could not travel the other way — `money.ts` cannot import from this module, because this
 * module imports from it — so `money.ts` holds the literal and this passes it on. `forecast.ts` reads
 * it from here and does not change.
 *
 * THE KERNEL'S CANNOT BE IMPORTED: `BARE_UNIT` is module-private at `packages/kernel/src/metrics.ts`
 * and `index.ts` re-exports no such name, so there is nothing on that edge to import. `bare-unit.test.ts`
 * asserts the two that are left are one string and that the kernel's is still spelled the same.
 */
export { BARE };

/** Every currency any operand of this value expression reads. */
export function currenciesRead(rows: Entry[], value: Value): Set<string> {
  if ('ratio' in value) return pairCurrencies(rows, value.ratio);
  if ('diff' in value) return pairCurrencies(rows, value.diff);
  return currenciesOf(rows, value);
}

const pairCurrencies = (rows: Entry[], pair: { of: Aggregation; per: Aggregation }): Set<string> =>
  new Set([...currenciesOf(rows, pair.of), ...currenciesOf(rows, pair.per)]);

/**
 * Does this row CARRY that field? Which is not the same question as what number it holds.
 *
 * `''` IS ABSENT HERE, and it is the one line in this file where that has to be said out loud. The
 * record's write path drops an empty string entirely, so the register the kernel reads has no `''`
 * in it and answers `json_extract(fields, '$.note') IS NOT NULL` for thirty-eight obligations of
 * which five carry a note. This build's copy of the same seed stores the `''` instead of dropping
 * it, so a browser that counted it as a value was counting rows the record does not have.
 */
const carries = (e: Entry, field: string): boolean => {
  const v = e.fields[field];
  return v !== undefined && v !== null && v !== '';
};

function aggregate(rows: Entry[], agg: Aggregation, bools: ReadonlySet<string> = new Set()): number | null {
  /* A COUNT COUNTS ROWS THAT HAVE A VALUE, WHATEVER TYPE THE VALUE IS. This went through `operand`,
     which is `amountOf`, which is `null` for every string, so `count: 'note'` read 0 where the
     record reads 5, and `count: 'due'` and `count: 'state'` read 0 over thirty-eight rows that all
     carry both. None of them refused: the tile came back `rows: 38`, `shown: "0"`, and under a
     `target: { lte: 5 }` it rendered as a figure meeting its target, in green. It bit `text`,
     `enum`, `day`, `instant` and `document` and agreed on `int` only by accident.

     `operand`'s use of `amountOf` is still right for `sum`, `avg`, `min` and `max`, and the comment
     on it says why. A count is a presence test, and it never was one. */
  if ('count' in agg) return agg.count === 'id' ? rows.length : rows.filter((e) => carries(e, agg.count)).length;
  if ('distinct' in agg) {
    /* `JSON.stringify` RATHER THAN `String`, and absent rows dropped. `String({ amount, currency })`
       is `'[object Object]'`, so every money value in a register collapsed to ONE distinct value —
       three invoices of different amounts counted as one — and a row with no value at all
       contributed `''` as a value of its own. Absent is not a value, which is the rule `count` one
       line up already follows. */
    const seen = new Set<string>();
    for (const e of rows) {
      /* `''` WAS KEPT AS A VALUE HERE, on the argument that it is one to SQLite: the kernel's
         `count(DISTINCT ...)` does count an empty string as a distinct value. That is true of
         SQLite and it is not true of this record, because the write path drops `''` before anything
         is stored. The kernel's rows never hold one, so the two builds came out off by exactly
         the `''` bucket, every time. `distinct: 'note'` on obligations read 6 against the record's
         5, and `distinct: 'points_at'` on services 11 against 10. The premise was right and the
         register it was about was the wrong one. Absent is `undefined`, `null`, or the empty string
         this build's copy of the seed writes where the record writes nothing. */
      if (!carries(e, agg.distinct)) continue;
      seen.add(JSON.stringify(e.fields[agg.distinct]));
    }
    return seen.size;
  }

  const field = 'sum' in agg ? agg.sum : 'avg' in agg ? agg.avg : 'min' in agg ? agg.min : agg.max;
  /* AN AVERAGE BOOL READS A ROW NOBODY MARKED AS 0, as the record's `coalesce` does: skipped, two essential steps with one
     done and one cleared averaged 1, and the lead said "All 2 essential steps are done" with one open
     (`loop/research-audit-2026-09-25-layouts.md` finding 13). */
  const unmarked = 'avg' in agg && typeof field === 'string' && bools.has(field);
  const values = rows.map((e) => operand(e, field) ?? (unmarked ? 0 : null)).filter((n): n is number => n !== null);
  if ('sum' in agg) return values.reduce((a, n) => a + n, 0);
  // An average, a minimum and a maximum OF NOTHING is not zero. `null` renders as the em dash.
  if (values.length === 0) return null;
  if ('avg' in agg) return values.reduce((a, n) => a + n, 0) / values.length;
  if ('min' in agg) return Math.min(...values);
  return Math.max(...values);
}

function evaluateValue(rows: Entry[], value: Value, bools?: ReadonlySet<string>): number | null {
  if ('ratio' in value || 'diff' in value) {
    const pair = 'ratio' in value ? value.ratio : value.diff;
    const of = aggregate(rows, pair.of, bools);
    const per = aggregate(rows, pair.per, bools);
    if (of === null || per === null) return null;
    /* A ZERO DENOMINATOR IS NOT A NUMBER. §2.2's last row: never `0`, never infinity, never `NaN` —
       the em dash, and the numerator is still on the row behind it. */
    if ('ratio' in value) return per === 0 ? null : of / per;
    return of - per;
  }
  return aggregate(rows, value, bools);
}

/**
 * How a figure is written. The format is declared, so two tiles of one number look the same.
 *
 * AND `format` IS OPTIONAL, which this did not survive. A declaration without one crashed on
 * `shape.startsWith` — a `TypeError` out of a figure, on a page, from a key the schema marks
 * optional and every other reader treats as optional. A number with no declared shape is written as
 * a number, which is the honest default and what the `default` branch below already said.
 */
export function format(shape: string | undefined, n: number | null): string {
  if (n === null) return '—';
  if (!shape) return n.toLocaleString('en', { maximumFractionDigits: 2 });
  if (shape.startsWith('money.')) return money(Math.round(n), shape.slice('money.'.length));
  switch (shape) {
    case 'int':
      return integer(Math.round(n));
    case 'pct':
      return `${(n * 100).toLocaleString('en', { maximumFractionDigits: 1 })}%`;
    case 'days':
      return `${Math.round(n)} days`;
    case 'decimal':
      return n.toLocaleString('en', { maximumFractionDigits: 2 });
    /* A FIGURE THAT IS A DAY, held as whole days since 1970: `11 Sep`. */
    case 'day':
      return shortDay(new Date(Math.round(n) * DAY_MS).toISOString().slice(0, 10));
    default:
      return String(n);
  }
}

/**
 * The URL that opens the rows a figure was computed over.
 *
 * A negation becomes `not-in` rather than the enum's complement: the complement is only writable
 * when the field declares its values, and a URL that silently lists them is a URL that breaks when
 * a pack adds one.
 */
export function hrefFor(decl: MetricDecl): string | null {
  const register = registerOf(decl.source);
  /* A FIGURE THAT READS NO LIST HAS NO ROWS TO OPEN, SO IT HAS NO DOOR. This answered `/p/money`, which is a page only
     money-core declares: on a record without Money the door opened nothing, and on one with it the door opened a page
     about something else. Every caller leaves `href` off on `null`, as they already did for a figure over no rows. */
  if (!register) return null;
  /* THE SAME BUILDER A PAGE BLOCK USES. It lived here, so a figure's link was derived from its
     predicate and a block's link was not derived from anything — the block just went to the
     register. Two surfaces asking the same question of the same sentence now get the same answer
     from the same function, which is the only arrangement under which they cannot drift. */
  return registerHref(register, decl.where);
}

/**
 * The day one clause turns on at one clock, or `null` when it turns on none.
 *
 * THE TWO READERS BELOW ARE THIS ONE FUNCTION, which is the whole reason it exists. `resolvedAt`
 * decides whether the shifted window is a different question and the sentence under the tile
 * decides what to tell the person about it, and they were two spellings of the same test:
 * `'values' in c ? c : …` here and `w.clauses.every((c) => 'values' in c)` there. Two readings of
 * one union drift, and this one had already drifted from `matches`.
 *
 * A LIST OF DAYS IS THE CLAUSE BOTH OF THEM READ WRONG. `has` and `lacks` carry their element in a
 * `values` tuple, deliberately, so that a reader testing for `values` does not go looking for a
 * `day` key they have no room for — `where.ts` says so at the union member. But `matches` resolves
 * that element against the clock it is handed when the list holds days or instants
 * (`elementWanted`), so `days has today` names a different day every day while both readers here
 * called it timeless. Measured on a register declared in the test beside three rows: 1 row at the
 * clock, 2 thirty days back, a real −50 percent, and the tile reported no delta at all under
 * *"nothing here is dated, so there is no before to compare with"*.
 *
 * AND A WRITTEN-OUT DATE IS STILL A DATE THAT DOES NOT MOVE, which is the other half and was the
 * reason this function was written. The check used to ask whether any clause was a DATE clause, and
 * `due before 2026-10-01` is one: it resolves to the same day however far the clock is wound back,
 * so the shifted window matched the same rows, the delta came out structurally zero and the tile
 * read GBP 103,430.00 · no change on the 30 days before. A set compared with itself, printed as a
 * fact about the business. So the question is the kernel's, for every kind of clause: what day does
 * it turn on at this clock, and is that a different day at the other one.
 *
 * A WORD THAT WILL NOT RESOLVE KEEPS ITSELF rather than becoming `null`, because `null` is how this
 * says "no day is mentioned here" and an unreadable day mentions one. `read` refuses such a clause
 * long before this, through `explain`; the fallback is so that a caller which does not cannot be
 * told that `due before wednesday` is a predicate about nothing.
 */
const dayAt = (register: string, c: Clause, now: number): string | null => {
  if (!('values' in c)) return resolveDay(c.day, now) ?? c.day;
  if (c.op !== 'has' && c.op !== 'lacks') return null;
  const of = REGISTERS[register]?.fields.find((f) => f.id === c.field)?.of;
  if (of !== 'day' && of !== 'instant') return null;
  return resolveDay(c.values[0], now) ?? c.values[0];
};

/**
 * The predicate as it RESOLVES at one clock: the same clauses, each beside the day it turns on.
 *
 * AND THE OR-GROUP'S CLAUSES WITH THEM, read through `everyClause`. Reading `clauses` alone, a tile over
 * `state is open, or due before today` resolved to `[]` at both clocks, because an or-group leaves
 * `clauses` empty, so the window was judged to move nothing and the person was told nothing here is
 * dated about a predicate whose second half names today (`where-any.test.ts`).
 */
const resolvedAt = (w: Where, now: number): string =>
  JSON.stringify(everyClause(w).map((c) => ({ ...c, at: dayAt(w.register, c, now) })));

/** Does this predicate say anything different at the moved clock? Without that, the two sets are one set. */
const moves = (w: Where, now: number, then: number): boolean => resolvedAt(w, now) !== resolvedAt(w, then);

/** The day after a day, in UTC as `resolveDay` counts. */
const dayAfter = (iso: string): string => new Date(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);

/**
 * The window before, given the end the current one takes from the clock.
 *
 * A WINDOW THAT WRITES ONLY ITS START ENDS AT THE CLOCK, AND THE CLOCK WAS THE ONE THING THAT DID NOT
 * MOVE. `matches` at the moved clock moves every day a clause names and nothing the predicate leaves
 * unsaid, so `on after -31d` thirty days back was `on after -61d` up to today: sixty-one days holding
 * the thirty-one it was compared with. `spent-30d` and `received-30d` were written that way when it was
 * measured (the seed has said `on after -30d` since `aeef01c5`), and in
 * `metrics-window.test.ts` equal money in two consecutive months read `delta: -0.5` under "on the 30
 * days before", a doubled month `-0.33`, and `year_ago` `-0.875` against an identical month. The
 * Ledger's lead tile could not say "up" for any spending at all.
 *
 * SO THE END MOVES WITH THE CLOCK AS THE START DOES, and a `before` clause saying so is added to each
 * dated field with an `after` and no `before` or `on`: the moved clock's day is the last day of the
 * window before, which is `08 §2.4`'s "last month to the 14th". AND NEVER PAST THE DAY BEFORE THE
 * CURRENT WINDOW STARTS, for a declaration whose span is longer than its window. The seed's said
 * `-31d` under a `window: 30d` that moves thirty, so the moved clock's own day was that window's first
 * and its rows were counted on both sides; at `-30d` the two days coincide and the cut changes nothing,
 * and it stays for the next declaration spelled the longer way.
 *
 * A field with a written end is left alone, because that end already moved, and so is a field with no
 * start: `due before today` is a balance at a moment. `packages/kernel/src/metrics.ts` `endedAt` is the
 * same rule over the record's predicate tree, and the two test files hold both to the same rows.
 *
 * `more than` AND `at least` START A WINDOW AS `after` DOES, and the kernel's `LOWER` list has read
 * them since the sentence could say them. This read `after` alone, so `on more than -30d` and
 * `on at least -29d`, the same thirty days as `on after -30d`, were set beside a window before with
 * no end: sixty days holding the thirty. Over seven rows in `metrics-window.test.ts` the browser read
 * `delta` -0.053 for both where the kernel read +17 for all three spellings. `less than` and
 * `at most` are written ends, as `before` is, and a range of days compiles to `gte` and `lte`.
 */
const STARTS: ReadonlySet<string> = new Set(['after', 'gt', 'gte']);
const ENDS: ReadonlySet<string> = new Set(['before', 'on', 'lt', 'lte']);

const endedAt = (w: Where, now: number, then: number): Where => {
  const dated = w.clauses.filter((c): c is Extract<Clause, { day: string }> => 'day' in c);
  const started = new Set(dated.filter((c) => STARTS.has(c.op)).map((c) => c.field));
  for (const c of dated) if (ENDS.has(c.op)) started.delete(c.field);
  if (started.size === 0) return w;
  const clock = dayAfter(new Date(then).toISOString());
  const ends = [...started].map((field): Clause => {
    /* The latest start is where the current window begins, when a field is given two. THE FIRST DAY
       A WINDOW HOLDS: `gte` names it, and `after` and `gt` name the day before it. */
    const begins = dated
      .filter((c) => c.field === field && STARTS.has(c.op))
      .map((c) => {
        const d = resolveDay(c.day, now);
        return d === null ? null : c.op === 'gte' ? d.slice(0, 10) : dayAfter(d);
      })
      .filter((d): d is string => d !== null)
      .sort()
      .at(-1);
    return { field, op: 'before', day: begins !== undefined && begins < clock ? begins : clock };
  });
  return { ...w, clauses: [...w.clauses, ...ends] };
};

/** Does the predicate mention time at all, in either half? Read for the sentence under a tile that has no comparison. */
const timeless = (w: Where, now: number): boolean => everyClause(w).every((c) => dayAt(w.register, c, now) === null);

/**
 * The same clock, one year earlier.
 *
 * `compare: year_ago` WAS COMPUTED AS `previous` HERE TOO. The union above read
 * `'previous' | 'none'` while the record's declaration validator admitted `08 §2`'s three words, so
 * a metric declaring `year_ago` installed, fell into the arm below that moves the clock back one
 * WINDOW, and rendered a delta against last month under a label that says last year. The
 * comparability gate is correct and passes, so the tile carried a number with `unmeasured: null`
 * and nothing on the screen disagreed with anything else on it.
 *
 * A YEAR IS NOT A FIXED NUMBER OF MILLISECONDS, AND THE RECORD HAS ALREADY SAID WHAT IT MEANS BY
 * ONE. `resolveDay` resolves `+1m` by calendar arithmetic and clamps the day of the month, because
 * rolling 31 January into 3 March is not what anybody means by a month. A year is twelve of those,
 * so it is the same calendar date one year earlier at the same time of day: 365 days most years and
 * 366 across a leap day. A constant `365 * DAY_MS` lands on the wrong day of the month for good
 * after every 29 February, and `08 §2.4` asks for the opposite in so many words, cutting the prior
 * window at the same day, "this month to the 14th against last month to the 14th".
 *
 * THE ONE DAY THAT CLAMPS IS 29 FEBRUARY, whose anniversary is 28 February: `Date.UTC` rolls it to
 * 1 March on its own, which would set a February figure beside a March one under a label naming one
 * month. It is UTC because `resolveDay` is, and an anniversary computed in another zone would name
 * a day the predicate then resolves differently for part of every year.
 *
 * IT IS THE SAME ARITHMETIC AS THE KERNEL'S `yearBefore`, written out twice because there are two
 * engines. `50 §1` says there should not be; while there are, the two have to agree to the
 * millisecond or the browser and the record disagree about which rows last year holds.
 */
const yearBefore = (now: number): number => {
  const d = new Date(now);
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
 * Read one metric, and the comparison with it.
 *
 * §2.4's gate, where it applies: a delta is present only when the window spans at least seven days,
 * both windows have rows, and the prior has at least half the current's count. The fourth condition
 * is this build's own and follows from the mechanism — the shifted window is the SAME PREDICATE
 * against a moved clock, so a predicate with no dated clause compares a set with itself and the
 * delta is structurally zero. Reporting that as "no change" would be a fact about the arithmetic
 * dressed as a fact about the business.
 */
/**
 * A metric id, with its parameter: `project-owed:Kiln`.
 *
 * The one substitution a metric document takes, and it is deliberately not a template language:
 * `{{it}}` is the thing the metric is about, filled from the id. It is what makes a project page a
 * declaration rather than a thirteenth case — three documents cover four projects and the fifth,
 * where before there were three per project, each with the name typed into its predicate.
 *
 * A parameter is never a predicate: it lands in the value slot of a clause the document already
 * wrote, and `compile` still checks it against the register — so `project-owed:Atlantis` is refused
 * by name rather than reported as nothing owed.
 */
export const isTemplate = (decl: MetricDecl): boolean => (decl.where ?? '').includes('{{');

/** The six aggregations this build reads. `08` §2.2 publishes eleven; the rest are post-v1. */
const READS_AGGREGATION = ['sum', 'count', 'avg', 'min', 'max', 'distinct'];

/**
 * Every key a metric document may carry here, so one it may not is named rather than ignored.
 *
 * `within` IS IN HERE FOR THE COPY AND NOT FOR THE DOCUMENT, because `withParam` puts it on the copy
 * it hands `read` and this check runs on that copy: left out, every parameterised figure came back
 * refused with *"within: is published in 08 and not read by this build"*, which is every tile on every
 * project page.
 *
 * THE REASON THAT USED TO STAND HERE SAID NO DOCUMENT WRITES IT, AND A DOCUMENT COULD. Measured before
 * the kernel closed it, `{where: 'state is open', within: 'party is HMRC'}` installed through
 * `validate` with no refusal at all, and the demo's `project-owed` body with `within: 'thing is Kiln,
 * thing is Tallow'` read here as `rows: 3, held: 0, value: 498000`. `declare.ts`'s `metricBody` now
 * refuses a body carrying the key, so what this line admits is the reader's own copy, and the check
 * below holds it to the shape a reader builds rather than trusting the name.
 */
const READS_KEY = new Set(['metric', 'name', 'source', 'where', 'value', 'format', 'target', 'window', 'compare', 'lookups', 'snapshot', 'group_by', 'bucket', 'within']);

/** The formats this build writes. A format it does not know printed the bare number. */
const READS_FORMAT = ['int', 'pct', 'days', 'decimal', 'day'];

/**
 * What the declaration asked for that this build cannot do — named, never ignored.
 *
 * The rule the rest of this package follows, applied to the file that claimed to follow it: a
 * declaration reaching for a published feature that is not implemented gets a sentence, because the
 * alternative is a figure that is quietly about something else.
 */
export function unreadable(decl: MetricDecl): string[] {
  const out: string[] = [];

  for (const key of Object.keys(decl))
    if (!READS_KEY.has(key))
      out.push(`${key}: is published in 08 and not read by this build. The figure would be the ungrouped one`);

  /**
   * AND A `within` IS CLAUSES OF THIS FIGURE'S OWN `where`, WHICH IS WHAT KEEPS `held` AT OR ABOVE `rows`.
   *
   * `withParam` keeps the clauses of `where` that carried the parameter and substitutes the same name
   * into both, so every clause of a `within` it built is a clause of the `where` beside it, character
   * for character once the space after the comma is trimmed (measured: `within: ' thing is Kiln'`, and
   * the kernel's `fill` writes the same leading space). Holding the key to that is not tidiness. `rows`
   * counts what `where` matched and `held` counts what `within` matched, both conjunctions over one
   * register, so clauses that are a subset cannot be matched by FEWER rows, and a subset is therefore
   * the whole of the `held >= rows` guarantee the tiles are read against.
   *
   * MEASURED ON ONE THAT IS NOT A SUBSET: `where: 'state is open, direction is owed to me, thing is
   * Kiln'` beside `within: 'thing is Kiln, thing is Tallow'` answered `rows: 3, held: 0, value: 498000`
   * with no refusal, and the tile drew GBP 4,980.00 with no `tone` and no `href` over those three rows,
   * because `held === 0` is how `news-live.ts` and `page-live.ts` both spell a list nobody has written
   * to. The kernel refuses that body at install; this is the same fact on the side that builds the copy,
   * so a reader that ever derives one wrongly is a sentence here rather than a money figure with its
   * verdict and its door withheld.
   */
  if (decl.within !== undefined) {
    const clauses = new Set((decl.where ?? '').split(',').map((clause) => clause.trim()));
    const loose = String(decl.within)
      .split(',')
      .map((clause) => clause.trim())
      .filter((clause) => !clauses.has(clause));
    if (loose.length)
      out.push(`within: ${loose.join(', ')} is not a clause of this figure's where, so held would count a different list from rows`);
  }

  const value = decl.value as Record<string, unknown> | undefined;
  if (!value || typeof value !== 'object') out.push('value: is missing');
  else if (!('ratio' in value) && !('diff' in value)) {
    const named = Object.keys(value);
    if (!named.some((k) => READS_AGGREGATION.includes(k)))
      out.push(`value: ${named.join(', ') || 'nothing'} is not an aggregation this build reads. It reads ${READS_AGGREGATION.join(' · ')}`);
  } else {
    const pair = ('ratio' in value ? value.ratio : value.diff) as { of?: object; per?: object } | undefined;
    for (const side of ['of', 'per'] as const) {
      const agg = pair?.[side];
      if (!agg || !Object.keys(agg).some((k) => READS_AGGREGATION.includes(k)))
        out.push(`value.${side}: this build reads ${READS_AGGREGATION.join(' · ')}`);
    }
  }

  out.push(...unaggregatable(decl));

  if (decl.format && !decl.format.startsWith('money.') && !READS_FORMAT.includes(decl.format))
    out.push(`format: ${decl.format} is not a format this build writes. It writes money.<CUR> · ${READS_FORMAT.join(' · ')}`);

  return out;
}

/** The field types `sum`, `avg`, `min` and `max` read as numbers: the kernel's `NUMERIC`. A `bool` is one or zero. */
const NUMERIC = new Set(['int', 'decimal', 'duration', 'money', 'quantity', 'bool']);

/**
 * Every aggregation that reads a day or a word as a number, as the kernel refuses it at install and at run.
 *
 * A DAY IS TEXT TO SQLITE, so the record summed `2026-07-28` as 2026 and answered NaN for its minimum, and
 * now refuses both as `VALUE_MALFORMED`. This build skipped the text in `amountOf` and answered a sum of
 * nothing instead. `count` and `distinct` read any field, and a field the register does not declare is
 * left to the predicate's own refusal.
 */
function unaggregatable(decl: MetricDecl): string[] {
  const register = registerOf(decl.source ?? '');
  const fields = register ? REGISTERS[register]?.fields : undefined;
  const value = decl.value as Value | undefined;
  if (!fields || !value || typeof value !== 'object') return [];
  const pair = 'ratio' in value ? value.ratio : 'diff' in value ? value.diff : null;
  const aggs = (pair ? [pair.of, pair.per] : [value]) as Record<string, unknown>[];
  const out: string[] = [];
  for (const agg of aggs) {
    for (const kind of ['sum', 'avg', 'min', 'max']) {
      if (!agg || !Object.hasOwn(agg, kind)) continue;
      const op = agg[kind] as Operand;
      const field = typeof op === 'string' ? op : op?.product?.[0];
      if (typeof field !== 'string' || field === 'id') continue;
      const type = fields.find((f) => f.id === field)?.type;
      if (type === 'day' && (kind === 'min' || kind === 'max' || kind === 'avg')) continue;
      if (type !== undefined && !NUMERIC.has(type))
        out.push(`value: ${kind} reads a number, and ${field} is a ${type}. Count it, or aggregate a number field`);
    }
  }
  return out;
}

/**
 * The one placeholder a parameter fills, spelled once so the substitution and the scope derived from
 * it below cannot disagree about which clauses carried it. `isTemplate` above deliberately asks a
 * wider question, whether there is any `{{` left at all, so that a placeholder this build does not
 * fill is still named as unread rather than measured as a predicate.
 */
const PARAM = '{{it}}';

/**
 * A template filled: the id with its parameter, the predicate with the name, and the scope the
 * parameter cut.
 *
 * A PARAMETER IS NOT A FILTER OVER A REGISTER, IT IS WHICH REGISTER THE FIGURE IS ABOUT, and that is
 * the whole distinction `Reading.held` exists to draw. `project-owed:Kiln` fills `thing is {{it}}`
 * into a predicate that also says `state is open`, so the rows the predicate chose from are Kiln's
 * obligations and the open ones among them are what it matched. Counted as the whole register
 * instead, this side answered `held: 40` on the demo against the kernel's `held: 10`, and `api.ts`
 * reads `held === 0` to decide between *nothing is overdue* and *add your first invoice*: with forty
 * rows in the register that is never zero, so a brand-new project was told its invoices were all
 * settled. The kernel repaired its own copy and this one was left, which `engines.test.ts` now
 * measures by driving both over one declaration.
 *
 * A COMMA IS WHAT SEPARATES A SENTENCE'S CLAUSES, exactly as `compile` splits it, so the clauses kept
 * here are the clauses that grammar would have built — the same rule the kernel's `scopeOf` applies
 * to the same sentence, one level up. A predicate with no `{{it}}` in any clause cuts nothing, and
 * `within` is then left off so `held` stays the whole register it has always been.
 *
 * AND NOTHING IS CUT FROM A SENTENCE WITH A `, or`, which is the kernel's `scopeOf` again. `compile` reads `a, or b` as an
 * or-group since M4 wave two brief 7, and a parameter under an "or" widens the rows rather than naming which rows the
 * figure is about. Split on the comma regardless, `state is paid, or thing is {{it}}` kept ` or thing is Kiln` as its
 * scope, which compiled to no row, and read `held: 0` beside eighteen matched rows on the seed; the other order read
 * `held: 10` under the same eighteen (`where-any.test.ts`).
 *
 * THE NAME IS WRITTEN BY THE GRAMMAR'S OWN `quoteValue` AND THE CLAUSES CUT BY ITS OWN `clausesOf`, which is what the
 * kernel's `fill` does with the same template. This copy substituted the name raw and cut on every comma
 * (`loop/research-audit-2026-09-25-layouts.md` §9): a project called `not Kiln` became `thing is not Kiln`, whose tile
 * linked to `f=thing:not-in:Kiln`, every project but Kiln; `Wax, wick and scent` became `thing is Wax` and a clause
 * about a field called `wick`; and `Kiln, or state is paid` widened the figure's scope with an `or`. Quoted, each is
 * the one name. `metrics-param.test.ts` holds `where` and `within` byte for byte to the kernel's.
 *
 * SPLIT AND JOINED, NOT `replaceAll(PARAM, it)`: a string replacement expands `$&`, `$'` and `` $` ``, so a name holding
 * `$'` was written with the rest of the sentence in its place.
 */
export function withParam(decl: MetricDecl, it: string): MetricDecl {
  if (decl.where === undefined) return decl;
  const named = quoteValue(it);
  const scope = joinsWithOr(decl.where) ? [] : clausesOf(decl.where).filter((clause) => clause.includes(PARAM));
  return {
    ...decl,
    metric: `${decl.metric}:${it}`,
    where: decl.where.split(PARAM).join(named),
    ...(scope.length === 0 ? {} : { within: scope.join(',').split(PARAM).join(named) }),
  };
}

/**
 * `now` IS THE CALLER'S CLOCK, and `api.ts`'s mock passes the sample's with the sample's rows. The default was the seed's
 * frozen `NOW`, so a caller that said nothing counted "overdue" as of 3 September 2026 whatever the day was.
 */
export function read(decl: MetricDecl, now: number = Date.now()): Reading {
  const refusals: string[] = [];
  if (!decl.target) refusals.push(`${decl.metric}: a number with no target is decoration`);
  if (!decl.window)
    refusals.push(`${decl.metric}: a number with no comparison window is a number you cannot act on`);

  const register = registerOf(decl.source);
  if (!register) refusals.push(`${decl.metric}: source ${decl.source} is not a register this build reads`);
  else if (!REGISTERS[register]) refusals.push(`${decl.metric}: there is no register called ${register}`);

  /* A TEMPLATE IS NOT A METRIC UNTIL IT HAS ITS PARAMETER. Read as it stands, `thing is {{it}}`
     would fail the register's value check and report "thing has no value {{it}}" — technically
     true and useless. It is named for what it is instead. */
  if (isTemplate(decl)) refusals.push(`${decl.metric}: is a template. Read it as ${decl.metric}:<name>`);

  /* THE SHAPE OF THE TARGET, not only its presence. `docs/08` writes it three times as
     `{ lte: { amount, currency } }`, and a target of an object compared with `<=` is neither true
     nor false — it printed `target ≤ GBP NaN` under a `warn` glyph, with no refusal at all. That is
     the exact class this file exists to prevent, in the file that prevents it. */
  const bound = decl.target && ('lte' in decl.target ? decl.target.lte : decl.target.gte);
  if (decl.target && typeof bound !== 'number')
    refusals.push(
      `${decl.metric}: target takes a number in the figure's own units. Write { lte: 400000 } for money in minor units, not { lte: { amount, currency } }`,
    );

  /* AND THE AGGREGATION. `08` §2.2 publishes eleven and this build reads six; the other five reached
     the field picker as `undefined` and threw a TypeError, which the page then reported as "this
     block's filter was not understood" — the filter was fine. `group_by`, `bucket` and `snapshot`
     are published too, and were ignored in silence, which is worse: the figure that came back was
     the UNGROUPED one, drawn under a heading that says it is grouped. */
  refusals.push(...unreadable(decl).map((r) => `${decl.metric}: ${r}`));

  const shift = decl.window ? windowMs(decl.window) : null;
  if (decl.window && shift === null)
    refusals.push(`${decl.metric}: ${decl.window} is not a window. Write 30d, 4w or 3m`);

  if (register && REGISTERS[register])
    refusals.push(...explain(compile(register, decl.where, now)).map((r) => `${decl.metric}: ${r}`));

  refusals.push(...groupingFaults(decl, register).map((r) => `${decl.metric}: ${r}`));

  /* A REFUSED FIGURE OPENS ITS OWN LIST WHEN THE RECORD HAS ONE, as the three refusals below it already did, and nothing
     when it has none. This path answered `/p/money` for both, so a figure refused for its window linked to Money
     whatever it counted. */
  if (refusals.length || !register) {
    const door = register && REGISTERS[register] ? hrefFor(decl) : null;
    return { value: null, shown: '—', rows: 0, held: 0, delta: null, why: refusals[0] ?? '', unmeasured: null, refusals, ...(door ? { href: door } : {}) };
  }

  const w = compile(register, decl.where, now);
  const all = ROWS[register] ?? [];
  const rows = all.filter((e) => matches(e, w, now));
  /* PAST THE REFUSAL ABOVE THE FIGURE HAS A LIST, so this is `hrefFor`'s answer with the `null` it can no longer give. */
  const href = registerHref(register, decl.where);

  /**
   * THE ROWS THE PREDICATE CHOSE FROM, which is the register's own unless a parameter narrowed it.
   *
   * `held` was `all.length` with nothing able to narrow it, so every project page counted the whole
   * register as its scope: `project-owed:Kiln` read `held: 40` where the kernel read `held: 10`.
   * The clauses `withParam` kept are a strict subset of `where`, so `explain` above has already said
   * anything wrong with them and there is nothing new to refuse here — and unlike the kernel's, this
   * predicate is matched in JavaScript and reaches no SQL, so an unchecked one is a wrong answer
   * rather than a hole. The clock is the same one `rows` was matched at, because the parameter's
   * clauses resolve their dates exactly as the whole sentence does.
   */
  const scope = decl.within === undefined ? null : compile(register, decl.within, now);
  const heldRows = scope === null ? all : all.filter((e) => matches(e, scope, now));

  /* TWO CURRENCIES ARE NEVER ADDED, and this is the line that would have added them. A tile is one
     figure with one code beside it; a sum across two is a number of the right size in the wrong
     unit, and there is no screen on which anybody notices. */
  const seen = currenciesRead(rows, decl.value);
  const declared = decl.format?.startsWith('money.') ? decl.format.slice('money.'.length) : null;
  const heldFx = fxSource();
  /**
   * THE CURRENCY A MONEY FIGURE IS ADDED UP IN IS THE ONE SOMEBODY CHOSE, OR IT IS NONE.
   *
   * This read `heldFx.home ?? declared`, as the record's did, and the fallback is the defect in both.
   * A pack declares `money.GBP` because a money figure must name a currency for its target to mean
   * anything, which is a fact about the SEED and never about the record it lands on; taking it as the
   * currency to add up in hands a record a currency nobody on it chose. Measured on a record holding
   * one currency and no sterling, the figure came back `{"value":null,"parts":[{"currency":"EGP",…}]}`
   * with `fx: {"into":"GBP","home":null}`, so one currency was said as a part, which is the shape for
   * two, and the number went with it. `packages/kernel/src/metrics.ts` carries the whole argument and
   * the numbers; this line is the same decision, and `engines.test.ts` holds the two to it.
   */
  const fx: Fx = {
    into: heldFx.home,
    home: heldFx.home,
    rates: heldFx.rates,
    today: new Date(now).toISOString().slice(0, 10),
    day: dayFieldOf(REGISTERS[register]?.fields ?? []),
    bools: new Set((REGISTERS[register]?.fields ?? []).filter((f) => f.type === 'bool').map((f) => f.id)),
  };
  /* A SUM ACROSS CURRENCIES IS CONVERTED OR SAID IN PARTS, before the refusals below, as the record reads it. */
  const figure = figureOf(rows, decl.value, fx);
  const acrossed = figure.parts !== undefined || figure.fx !== undefined;
  if (seen.size > 1 && !acrossed) {
    const why = `${decl.metric}: ${mixedFix([...seen].sort())}`;
    return { value: null, shown: '—', rows: rows.length, held: heldRows.length, delta: null, why, unmeasured: null, refusals: [why], href };
  }

  /**
   * AND THE FORMAT IS CHECKED AGAINST THEM, THOUGH NOT FOR THE CURRENCY ANY MORE.
   *
   * `format: money.GBP` is a declaration about how to write the figure and the rows are what it is a
   * figure OF. This refused when they named different currencies, which only ever fired because the
   * declared code stood in for the currency to add up in: a record with no home currency now reads its
   * money in the currency its rows carry, `shown` writes it from `figure.unit` when the two differ
   * (the line at the foot of this function), and the target is converted or withheld. Refusing there
   * would blank every money tile on a record whose currency is not the pack author's.
   *
   * WHAT IS LEFT IS A MONEY FORMAT OVER ROWS THAT ARE NOT MONEY, and the declared field type is what
   * answers that, never the three-letter shape of the unit: `KGS` is a weight. The record refuses the
   * identical declaration with `MIXED_CURRENCY` and the argument is written out there.
   *
   * NO REGISTER THIS APP DRAWS DECLARES A `quantity` (`schema.ts`'s `FIELD_TYPES`), so nothing in this
   * build can reach the refusal below today. It is here because the day one does, the engine that
   * refuses and the engine that does not would be a live disagreement about a shipped figure, which is
   * the whole reason `engines.test.ts` exists.
   */
  if (!acrossed && declared && figure.unit && !isMoneyFigure(register, decl.value)) {
    const why = `${decl.metric}: the rows are in ${figure.unit} and the format says ${declared}`;
    return { value: null, shown: '—', rows: rows.length, held: heldRows.length, delta: null, why, unmeasured: null, refusals: [why], href };
  }

  /* A FACTOR THE TABLE DOES NOT HOLD IS A REFUSAL, NOT A SMALLER NUMBER. `operand` answered `null`
     for a row whose `by` value has no entry, `aggregate` then filtered those nulls out of the sum,
     and the tile printed a figure short by however many rows fell through — with `rows` still
     counting them, so nothing on the screen disagreed with anything else. A `by` naming a field the
     table knows nothing about read GBP 0.00 over fourteen rows with no refusal at all. The kernel
     refuses the identical declaration with `LOOKUP_MISSING`; this is that check, on this side. */
  const short = missingFactors(rows, decl.value);
  if (short.length) {
    const why = `${decl.metric}: no factor for ${short.slice(0, 3).join(', ')}${short.length > 3 ? ` and ${short.length - 3} more` : ''}`;
    return { value: null, shown: '—', rows: rows.length, held: heldRows.length, delta: null, why, unmeasured: null, refusals: [why], href };
  }

  const value = figure.value;
  /* A FIGURE CONVERTED OUT OF THE CURRENCY IT DECLARES is judged against its target converted at the latest rate. */
  const targetIn =
    declared && figure.unit && figure.unit !== declared && /^[A-Z]{3}$/u.test(figure.unit) && decl.target
      ? targetFor(decl.target, declared, figure.unit, fx.rates, fx.today)
      : null;

  /**
   * AND WHETHER THERE IS A COMPARISON AT ALL, WHICH IS NOT THE SAME AS THERE BEING NO MOVEMENT.
   *
   * `19 §6`: a surface showing nothing must never be indistinguishable from a surface with nothing
   * to show. Three of the four tiles on the money page carried no comparison and said nothing about
   * why — which reads as "this has not moved", and every one of them declares a window. `unmeasured`
   * is the reason, in the terms of the screen: `why` stays the author's phrase for the ones that are
   * a declaration problem, and this is what a person is told.
   */
  let delta: number | null = null;
  let why = '';
  let unmeasured: string | null = null;
  /* HOW FAR THE CLOCK MOVES IS THE WHOLE OF THE DIFFERENCE BETWEEN THE TWO COMPARISON WORDS.
     `previous` moves it by the declared window and `year_ago` by a year, which is what each of them
     says. Both branches below read `now - shift`, so the two words named one figure and only one of
     the two labels above it was true. `yearBefore` carries the argument for what a year is. */
  const then = shift === null ? now : decl.compare === 'year_ago' ? yearBefore(now) : now - shift;
  if (decl.compare === 'none' || shift === null) {
    why = 'no comparison asked for';
    unmeasured = null;
  } else if (shift < 7 * DAY_MS) {
    why = 'a window under seven days is noise';
    unmeasured = 'too short a window to compare over';
  } else if (!moves(w, now, then)) {
    /* TWO WAYS FOR THE WINDOW TO MOVE NOTHING, and the check only ever knew about one of them. A
       predicate with no dated clause is the case this was written for; a predicate naming a day in
       full is the case it let through, and that IS a date clause, so asking "is any clause a date
       clause" answered yes and the figure was compared with itself. Each gets the sentence that is
       true of it, because "nothing here is dated" under a tile filtered to `due before 2026-10-01`
       is a sentence a person can see is wrong.

       AND THE QUESTION IS ASKED WITH THE SAME FUNCTION THE LINE ABOVE ASKS IT WITH. This read
       `w.clauses.every((c) => 'values' in c)`, which is a second reading of the union `resolvedAt`
       was already reading, and the two could answer differently about one clause without anything
       saying so. `dayAt` is that one reading. */
    const dateless = timeless(w, now);
    why = dateless
      ? 'the predicate does not mention time, so the window moves nothing'
      : 'the predicate names a fixed date, so the window moves nothing';
    unmeasured = dateless
      ? 'nothing here is dated, so there is no before to compare with'
      : 'this asks about one fixed date, so the same rows are on both sides of the window';
  } else {
    /* The window before ends where its clock is; `endedAt` has the measurement. `moves` above asks
       of the predicate as written, because an end added here is not the declaration mentioning time. */
    const prior = endedAt(w, now, then);
    const before = all.filter((e) => matches(e, prior, then));
    if (rows.length === 0 || before.length === 0) {
      why = 'one of the two windows is empty';
      unmeasured = 'nothing to compare with yet';
    } else if (before.length * 2 < rows.length) {
      why = 'the window before has under half the rows';
      /* IT SAID "too few rows before to compare against", under the second figure on Home. `why`
         is the author's and may say rows; this is the person's, and "rows before" is the schema
         describing its own window to somebody who asked how much they owe. */
      unmeasured = 'not enough history to compare yet';
    } else {
      const prior = figureOf(before, decl.value, fx).value;
      if (prior === null || prior === 0 || value === null) {
        why = 'the window before has nothing to compare against';
        unmeasured = 'nothing to compare with yet';
      } else {
        delta = (value - prior) / Math.abs(prior);
        /* AND THE SENTENCE SAYS WHICH COMPARISON IT IS. `on the 30 days before` under a figure
           measured against the same period a year ago is the label that made the wrong figure look
           right, and it would go on saying it after the arithmetic was fixed. */
        why = decl.compare === 'year_ago' ? 'against the same period last year' : `on the ${spokenWindow(decl.window)} before`;
      }
    }
  }

  /**
   * AND HOW MANY ROWS THE REGISTER HOLDS AT ALL, which is not `rows`.
   *
   * `rows` is what the predicate matched, and zero of those is a real answer: nothing overdue, on a
   * register holding thirty-eight obligations, is the good news the figure exists to deliver. Zero
   * rows in the REGISTER is a different fact and the tile had no way to tell them apart — so on a
   * record somebody installed an hour ago, `OWED TO YOU · GBP 0.00 · ✓` reported the finances
   * healthy, four times, in green. `19 §6`'s collapse, in the direction nothing had audited:
   * `no-data-yet` read as `cleared`.
   *
   * AND ON A PARAMETERISED FIGURE THE LIST IS THE PARAMETER'S, not the register's: `heldRows` above
   * has the measurement and the reason.
   */
  return {
    value,
    /* A FIGURE IN PARTS IS WRITTEN AS ITS PARTS, and one converted into a currency other than the declared one in that. */
    shown: figure.parts ? partsShown(decl.format, figure.parts) : figure.unit && declared && figure.unit !== declared ? money(Math.round(value ?? 0), figure.unit) : format(decl.format, value),
    rows: rows.length,
    held: heldRows.length,
    delta,
    why,
    unmeasured,
    refusals: [],
    href,
    unit: figure.unit,
    ...(figure.parts ? { parts: figure.parts } : {}),
    ...(figure.fx ? { fx: figure.fx } : {}),
    ...(targetIn ? { targetIn } : {}),
    ...(decl.group_by === undefined ? {} : groupsOf(rows, decl, now, fx)),
  };
}

/** What is wrong with a grouping, in the record's own terms (`metrics.ts`'s checks in the kernel). */
function groupingFaults(decl: MetricDecl, register: string | null): string[] {
  const fields = register ? REGISTERS[register]?.fields : undefined;
  if (decl.group_by === undefined)
    return decl.bucket === undefined ? [] : [`buckets by ${String(decl.bucket)} and groups by nothing`];
  const out: string[] = [];
  const by = typeof decl.group_by === 'string' ? decl.group_by : null;
  const type = by && fields ? fields.find((f) => f.id === by)?.type : undefined;
  const dated = type === 'day' || type === 'instant';
  if (by === null) out.push('group_by is one field name');
  else if (fields && type === undefined) out.push(`${register} has no field called ${by}`);
  else if (dated && decl.bucket === undefined) out.push(`${by} is a date, so group_by needs a bucket: day, week, month, quarter or year`);
  else if (!dated && fields && decl.bucket !== undefined) out.push(`a bucket cuts a date, and ${by} is a ${type}`);
  if (decl.bucket !== undefined && !isBucket(decl.bucket)) out.push(`${String(decl.bucket)} is not a bucket`);
  const value = decl.value as object | undefined;
  if (value && ('ratio' in value || 'diff' in value)) out.push('a ratio or a diff is not grouped in this build; group each half as its own figure');
  return out;
}

/**
 * A figure's parts, one per value of `group_by`, as the record's `groupsOf` reads them.
 *
 * THE SAME BUCKETS, IMPORTED FROM THE RECORD, so a bar labelled June holds the same rows here as there;
 * a bucket between the first and the last that nothing fell in is a gap with no value, never a zero.
 */
function groupsOf(rows: Entry[], decl: MetricDecl, now: number, fx: Fx): Pick<Reading, 'groups' | 'current' | 'more'> {
  const by = decl.group_by!;
  const held = rows.filter((e) => carries(e, by));
  const units = new Map<string, string | null>();
  const part = (key: string, of: Entry[]): Group => {
    const got: Figure = of.length === 0 ? { value: null, unit: null } : figureOf(of, decl.value, fx);
    units.set(key, got.unit);
    return { key, value: got.value, rows: of.length, ...(got.parts ? { parts: got.parts } : {}), state: 'full' };
  };
  /**
   * ONE PART IN PARTS PUTS EVERY PART IN PARTS, as the record's `groupsOf` does, AND SO DOES ONE
   * CURRENCY BESIDE ANOTHER.
   *
   * Both engines asked only whether some group already HELD parts, and a group holds parts only when
   * its own rows are in two currencies. Once `into` stopped falling back to the declared format, no
   * group on a record with no home currency came back in parts at all, so three obligations in EGP and
   * USD grouped by party drew `[{Landlord, 5200000}, {Utility, 618554}, {Bank, 340000}]`: the tile
   * above refuses to add two currencies and the bars under it ranked E£52,000.00 over $3,400.00 on the
   * raw minor units, with no currency drawn on the chart. The `units` map is what can answer it, and
   * only for a figure of money, because a part carries a `currency`.
   */
  const money = isMoneyFigure(registerOf(decl.source), decl.value);
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
    const current = bucketOf(new Date(now).toISOString(), bucket)!;
    const byKey = new Map<string, Entry[]>();
    for (const e of held) {
      const key = bucketOf(String(e.fields[by]), bucket);
      if (key !== null) byKey.set(key, [...(byKey.get(key) ?? []), e]);
    }
    const keys = [...byKey.keys()].sort();
    if (keys.length === 0) return { groups: [], current, more: 0 };
    const last = keys.at(-1)! > current ? keys.at(-1)! : current;
    const run = bucketRun(keys[0]!, last, bucket, GROUP_CAP);
    const groups = run.keys.map((key): Group => {
      const g = part(key, byKey.get(key) ?? []);
      return { ...g, state: bucketState(key, g.rows, current, key === run.keys[0] && run.more === 0) };
    });
    return { groups: inParts(groups), current, more: run.more };
  }

  const byValue = new Map<string, Entry[]>();
  for (const e of held) {
    const key = String(e.fields[by]);
    byValue.set(key, [...(byValue.get(key) ?? []), e]);
  }
  const groups = inParts([...byValue.entries()].map(([key, of]) => part(key, of))).sort(largestFirst);
  return { groups: groups.slice(0, GROUP_CAP), more: Math.max(0, groups.length - GROUP_CAP) };
}

/**
 * A figure's own note, with each `{{id}}` it names written as that figure, and `N thing(s)` said properly.
 *
 * `in {{cash-accounts}} account(s), as of {{cash-as-of}}` is the line under Cash now. A figure the note
 * names that cannot be read is the em dash, as it is everywhere else, and `(s)` after a number is the
 * one plural the sentence needs: `1 account`, `2 accounts`.
 */
export function noteOf(template: string, said: (id: string) => string | null): string {
  /* A CLAUSE THAT ONLY SAYS NOUGHT IS LEFT OUT. "0 with an agent, 0 kept for later" under a new record's Open tasks is
     two things to read that say nothing; a clause whose every figure is 0 goes, and a note with none left is empty.
     The template's own commas are the clauses, split before a figure like 1,200 is written in. */
  const FIGURE = /\{\{\s*([a-z][a-z0-9_-]*)\s*\}\}/gu;
  const kept = template.split(/,\s+/u).filter((clause) => {
    const ids = [...clause.matchAll(FIGURE)].map((m) => m[1]!);
    return ids.length === 0 || ids.some((id) => said(id) !== '0');
  });
  return kept
    .join(', ')
    .replace(/\{\{\s*([a-z][a-z0-9_-]*)\s*\}\}/gu, (_, id: string) => said(id) ?? '—')
    .replace(/(^|[^\d.,])(\d[\d,]*) ([A-Za-z]+)\(s\)/gu, (_, lead: string, n: string, word: string) => `${lead}${n} ${n === '1' ? word : `${word}s`}`)
    .replace(/([A-Za-z]+)\(s\)/gu, '$1s');
}

/** A `{{path}}` a lead sentence may name: a figure's id, and the page's own paths such as `steps.count` or `tasks#12.state`. */
const HOLE = /\{\{\s*([a-z][a-z0-9_-]*(?:[.#][a-z0-9_-]+)*)\s*\}\}/gu;

/**
 * A `note lead`'s body, said by `noteOf`'s two rules and with every `{{path}}` LEFT FOR THE RENDERER TO FILL.
 *
 * WHY NOT `noteOf` ITSELF. `noteOf` writes each figure in as the record's text, so money went on the screen as
 * `GBP 7,200.00` where every other sentence on the page says `£7,200.00`: the page's resolver is what writes a figure
 * the way the cells beside it do, and a body with no holes left in it never reaches that resolver. So the clauses are
 * chosen and the plurals settled here, from what `said` answers, and the holes go through as written.
 *
 * THE COUNT BEFORE THE WORD IS THE ONE THAT COUNTS IT, across the words between them: `{{done}} essential step(s)`
 * is one step or several by `{{done}}`, where `noteOf` only reads a number with the word straight after it and said
 * "1 essential steps". A number two figures back (`{{done}} of the {{all}} step(s)`) is not the count, because a
 * figure between them stops the words.
 */
export function leadOf(template: string, said: (path: string) => string | null): string {
  const kept = template.split(/,\s+/u).filter((clause) => {
    const paths = [...clause.matchAll(HOLE)].map((m) => m[1]!);
    return paths.length === 0 || paths.some((p) => said(p) !== '0');
  });
  const one = (count: string): boolean => count.trim() === '1';
  return kept
    .join(', ')
    .replace(/(\{\{\s*([a-z][a-z0-9_-]*(?:[.#][a-z0-9_-]+)*)\s*\}\}|\b\d[\d,]*)((?:\s+[A-Za-z]+)*?)\s+([A-Za-z]+)\(s\)/gu, (_, figure: string, path: string | undefined, between: string, word: string) =>
      `${figure}${between} ${one(path === undefined ? figure : (said(path) ?? '')) ? word : `${word}s`}`,
    )
    .replace(/([A-Za-z]+)\(s\)/gu, '$1s');
}

/**
 * A window as a person reads it, from the window as a declaration writes it.
 *
 * `on the 30d before` sat under every figure on Home and `/p/money` — the two screens somebody reads
 * every day — with the raw literal interpolated straight out of the declaration. `30d` is the
 * dialect's spelling and `30 days` is the sentence; the same swap `saidPlainly` makes for a
 * predicate's `+90d`, for the same reason.
 */
export const spokenWindow = (window: string): string => {
  const m = /^(\d{1,4})([dwmy])$/.exec(window.trim());
  if (!m) return window;
  const [, n, unit] = m as unknown as [string, string, string];
  const noun = { d: 'day', w: 'week', m: 'month', y: 'year' }[unit] ?? 'day';
  return `${n} ${noun}${n === '1' ? '' : 's'}`;
};

/** Is the figure on the right side of what was declared as good? */
export function meetsTarget(decl: MetricDecl, value: number | null): boolean | null {
  if (value === null) return null;
  return 'lte' in decl.target ? value <= decl.target.lte : value >= decl.target.gte;
}

/** The target, in the same words the figure is written in. */
/**
 * WHAT GOOD LOOKS LIKE FOR THIS FIGURE, as a sentence rather than an inequality.
 *
 * `target ≤ GBP 20,000.00` under *Owed to you* reads as an instruction to be owed less, which is
 * not what it means: it is the line past which somebody should be chasing. `≤` and `≥` are also
 * two glyphs a person cannot type and half of them will read as "less than" — and `target ≤ GBP
 * 0.00` under *Overdue to pay*, which is the commonest shape of all, means "none", not "at most
 * nothing".
 */
export const targetLine = (decl: MetricDecl): string => {
  const under = 'lte' in decl.target;
  const bound = 'lte' in decl.target ? decl.target.lte : decl.target.gte;
  if (under && bound === 0) return 'should be nothing';
  /* "AT LEAST £0.00" SAYS A NUMBER TO SAY A SIDE OF ZERO. Home's cash and money coming in both read it under the figure. */
  if (!under && bound === 0) return 'never below zero';
  /**
   * "WATCH OVER" IS NOT A SENTENCE ANYBODY SAYS, and at the boundary it argued with itself.
   *
   * It reads as the verb phrase — *supervise* — and the sense meant was "watch it if it goes over".
   * `/decide` printed **Open questions · 3 · watch over 3 · ✓**: the same number twice with a verb
   * between them, ticked, on one of `19 §2`'s three spine screens. And it was wrong about the
   * boundary either way round — `lte: 3` means three is fine, which "over 3" does not say.
   *
   * `no more than` and `at least` are what the inequality means, in the words a person uses for it.
   * The `lte: 0` branch above already reads perfectly, which is what says the pattern was fixable
   * rather than inherent.
   */
  return under ? `no more than ${format(decl.format, bound)}` : `at least ${format(decl.format, bound)}`;
};
