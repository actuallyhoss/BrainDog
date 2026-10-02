/**
 * A metric as a screen draws it: the declaration's type, and the words and links a figure is drawn with.
 *
 * THE RECORD READS THE FIGURE AND THIS FILE ONLY SAYS IT. `08-METRICS-AND-ANALYTICS` §2 specifies the
 * document (source, predicate, aggregation, format, target, window, comparison), and the kernel's
 * `metrics.ts` is what reads one: the rows it matched, the parts a sum across currencies is in, the
 * comparison with the window before. This file held a second reader of the same document, run by no
 * screen and kept equal to the record's by a test, so every change to a figure was made twice. What is
 * left is what a tile, a page and a palette draw a
 * reading with: its format, its target as a sentence, its note, its door and the sentence under a
 * figure in several currencies.
 *
 * AND THE LINK IS DERIVED. A tile's href used to be typed beside its predicate, so the two drifted:
 * a tile counting five states whose link listed three, and a figure excluding cancelled services whose
 * link included them. One predicate produces both the figure and the URL, so they cannot disagree.
 */

import type { Bucket, FxRead, Group, Part, Rate, TargetIn } from '@braindog/kernel';
import { clausesOf, quoteValue } from '@braindog/where';
import { day as longDay, integer, money, shortDay } from 'braindog-render';

import { copy } from '../copy.ts';
import { REGISTERS } from './held.ts';
import { BARE, amountOf, currencyOf } from './money.ts';
import { joinsWithOr, registerHref } from './where.ts';
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
   * computed as `previous`: the kernel's `yearBefore` says what the record means by a year.
   */
  compare?: 'previous' | 'year_ago' | 'none';
  /** The factor tables the declaration carries, which the record reads. */
  lookups?: Record<string, Record<string, number>>;
  /** One field the figure is also read per value of, as the record reads it (`08 §2.1`). */
  group_by?: string;
  /** `day` · `week` · `month` · `quarter` · `year`, beside a date `group_by` only. */
  bucket?: Bucket;
  /**
   * THE CLAUSES A PARAMETER FILLED, WHICH ARE SCOPE AND NOT FILTER, and what `held` counts.
   *
   * NOBODY WRITES THIS IN A DOCUMENT. `withParam` puts it on the copy it hands a drawing helper, the
   * way the kernel's `fill` puts `MetricDecl.within` on the copy it hands `evaluateMetric`, and
   * `unreadable` holds it to the clauses of `where`. The seed carries no such key and needs none.
   */
  within?: string;
};

/* ── a reading, as a tile says it ────────────────────────────────────────── */

/**
 * A figure's reading in the shape a tile is written from: the record's reading, with the words `shown`, `why` and
 * `unmeasured` a tile draws beside it. The record's own shape is the kernel's `Reading`.
 */
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
   * the record's: `MetricDecl.within` carries the clauses the parameter filled, and the record counts
   * this inside them.
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
 * The home currency and the dated rates a block is converted at when it arrives without rates of its own: none of
 * either until something hands them in.
 *
 * IT WAS THE SAMPLE'S `fx` ROWS, and `blocks.ts` converts with this whenever a block arrives without rates of its own,
 * so a live bar the record sent no rates for was converted at the sample's. `fixtures/fill.ts` hands those rows in for
 * the tests that read the sample, and a test hands in a home currency of its own with `withFx`.
 */
let fxSource: () => { home: string | null; rates: readonly Rate[] } = () => ({ home: null, rates: [] });

/** Convert with this home currency and these rates until the returned function puts the last ones back. */
export function withFx(source: () => { home: string | null; rates: readonly Rate[] }): () => void {
  const before = fxSource;
  fxSource = source;
  return () => {
    fxSource = before;
  };
}

/** The home currency and rates figures are read with now. */
export const fxNow = (): { home: string | null; rates: readonly Rate[] } => fxSource();

/**
 * A figure's target line, in the currency the figure is written in: the declared one, or converted into the one it was
 * added up in and saying so. Empty when the figure is in another currency and no rate converts its target.
 */
export function targetSaid(
  decl: MetricDecl,
  r: { unit?: string | null | undefined; targetIn?: TargetIn | undefined; value?: number | null | undefined },
): string {
  /* THE FIGURE GOES WITH IT, so a limit says nothing while it is kept and how far over once it is not (`targetLine`). */
  const value = r.value ?? null;
  /* A BARE `money` FORMAT NAMES NO CURRENCY (money-core 3.0.0: the record's home one), so its target is said in the
     currency the record read the figure in, never as a bare number of minor units. */
  if (decl.format === 'money' && r.unit && /^[A-Z]{3}$/u.test(r.unit)) return targetLine({ ...decl, format: `money.${r.unit}` }, value);
  if (!offTarget(decl, r.unit)) return targetLine(decl, value);
  if (!r.targetIn) return '';
  const from = r.targetIn.from ?? decl.format!.slice('money.'.length);
  /* THE FIGURE WAS ADDED UP IN `targetIn.currency`, the currency its target was converted into, so the two compare. */
  const line = targetLine({ ...decl, format: `money.${r.targetIn.currency}`, target: r.targetIn.target }, value);
  /* NOTHING IS NOTHING IN EVERY CURRENCY, so a bound of zero is not said to be converted; nor is one typed in this currency. */
  const bound = 'lte' in r.targetIn.target ? r.targetIn.target.lte : r.targetIn.target.gte;
  return !line || bound === 0 || from === r.targetIn.currency ? line : copy.targetConverted(line, from);
}

/**
 * What a figure across currencies says under itself: why it is in parts, or as of which day's rates it was converted.
 * `null` for a figure in one currency. Read from the record's reading or a tile's `Reading`, which carry the same keys.
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
  /* MONEY AND BARE NUMBERS TOGETHER IS MIXED TOO. `money.ts`'s `total()` guards it by name: "quietly
     reading the bare ones as the currency of the others is the same failure wearing a different hat".

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
 * AND IT IS THE RECORD'S WORD. It read `no currency` while `packages/kernel/src/metrics.ts` wrote
 * `no unit` into the same refusal, so the sample and a live record said different things about the
 * same two rows. `money.test.ts` opens a real record and drives the whole refusal, which is where the
 * kernel's word is actually held.
 *
 * THIS LINE WAS A THIRD COPY OF THE STRING AND IS NOW A RE-EXPORT, which is the repair `money.ts`
 * asked for in words: *"the way out is for `metrics.ts` to delete its own line and re-export this
 * one"*. It could not travel the other way (`money.ts` cannot import from this module, because this
 * module imports from it), so `money.ts` holds the literal and this passes it on.
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
  /* A BARE `money` IS THE HOME CURRENCY'S (money-core 3.0.0). With none chosen it names no currency, so it is written
     as the number it is rather than in a currency guessed for it. */
  const home = shape === 'money' ? fxSource().home : null;
  if (home !== null) return money(Math.round(n), home);
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
 * A metric id, with its parameter: `project-owed:Kiln`.
 *
 * The one substitution a metric document takes, and it is deliberately not a template language:
 * `{{it}}` is the thing the metric is about, filled from the id. It is what makes a project page a
 * declaration rather than a thirteenth case: three documents cover four projects and the fifth,
 * where before there were three per project, each with the name typed into its predicate.
 *
 * A parameter is never a predicate: it lands in the value slot of a clause the document already
 * wrote, and the record still checks it against the register, so `project-owed:Atlantis` is refused
 * by name rather than reported as nothing owed.
 */
/* A WHERE MAY BE A PREDICATE TREE and not a sentence (one sentence cannot mix a comma with an `or`), and a tree is
   never a template, so only a sentence is searched. */
export const isTemplate = (decl: MetricDecl): boolean => typeof decl.where === 'string' && decl.where.includes('{{');

/** The six aggregations this build reads. `08` §2.2 publishes eleven; the rest are post-v1. */
const READS_AGGREGATION = ['sum', 'count', 'avg', 'min', 'max', 'distinct'];

/**
 * Every key a metric document may carry here, so one it may not is named rather than ignored.
 *
 * `within` IS IN HERE FOR THE COPY AND NOT FOR THE DOCUMENT, because `withParam` puts it on the copy
 * a drawing helper is handed and this check runs on that copy: left out, every parameterised figure
 * was named as *"within: is published in 08 and not read by this build"*, which is every tile on every
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

/** The formats this build writes. A format it does not know printed the bare number. `money` is money-core 3.0.0's, in the record's home currency. */
const READS_FORMAT = ['money', 'int', 'pct', 'days', 'decimal', 'day'];

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
 * obligations and the open ones among them are what it matched.
 *
 * A COMMA IS WHAT SEPARATES A SENTENCE'S CLAUSES, so the clauses kept here are the clauses that
 * grammar would have built: the same rule the kernel's `scopeOf` applies to the same sentence, one
 * level up. A predicate with no `{{it}}` in any clause cuts nothing, and `within` is then left off so
 * `held` stays the whole register it has always been.
 *
 * AND NOTHING IS CUT FROM A SENTENCE WITH A `, or`, which is the kernel's `scopeOf` again. `compile` reads `a, or b` as an
 * or-group, and a parameter under an "or" widens the rows rather than naming which rows the
 * figure is about. Split on the comma regardless, `state is paid, or thing is {{it}}` kept ` or thing is Kiln` as its
 * scope, which compiled to no row, and read `held: 0` beside eighteen matched rows on the seed; the other order read
 * `held: 10` under the same eighteen (`where-any.test.ts`).
 *
 * THE NAME IS WRITTEN BY THE GRAMMAR'S OWN `quoteValue` AND THE CLAUSES CUT BY ITS OWN `clausesOf`, which is what the
 * kernel's `fill` does with the same template. This copy substituted the name raw and cut on every comma: a
 * project called `not Kiln` became `thing is not Kiln`, whose tile
 * linked to `f=thing:not-in:Kiln`, every project but Kiln; `Wax, wick and scent` became `thing is Wax` and a clause
 * about a field called `wick`; and `Kiln, or state is paid` widened the figure's scope with an `or`. Quoted, each is
 * the one name.
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
 *
 * NOUGHT IS NOUGHT IN ANY CURRENCY. A money figure comes back from `said` as `GBP 0.00`, never `0`, so a clause saying
 * only that nothing was owed was kept while the same clause over a count went. `nought` reads the figure
 * as the resolver writes it, one currency's part at a time.
 *
 * A FIGURE THAT DID NOT READ TAKES ITS CLAUSE WITH IT. `said` answers `null` for a figure the record refused, and the
 * renderer then draws the hole as the mark for a missing figure, a clause that says nothing; the rest of the sentence
 * still stands, and a lead with no clause left is not drawn at all (`page-live.ts`).
 *
 * THE VERB AFTER A COUNTED NOUN AGREES WITH THE SAME COUNT: `{{all}} essential step(s) are done` is "1 essential step
 * is done" and "3 essential steps are done", whichever form the template wrote. Only the verbs `VERB` names are
 * changed, because a verb that agrees by an `s` of its own cannot be told from a noun by reading it.
 *
 * AND A NUMBER IS READ WHOLE. `2.1 day(s)` was counted from the `1` after the point, and said "2.1 day".
 *
 * A FIGURE'S CHANGE IS ONE MORE HOLE, `{{cash-now.change}}`, which the record answers as a signed percent against the
 * figure's remembered value a window ago (`+8%`, `−8%`) and leaves out when it has no such point, so these same two
 * rules drop its clause: an unread change takes the clause with it, and `0%` is nought.
 */
export function leadOf(template: string, said: (path: string) => string | null): string {
  const kept = template.split(/,\s+/u).filter((clause) => {
    const figures = [...clause.matchAll(HOLE)].map((m) => said(m[1]!));
    if (figures.length === 0) return true;
    if (figures.some((f) => f === null)) return false;
    return figures.some((f) => f !== null && !nought(f));
  });
  const one = (count: string): boolean => count.trim() === '1';
  return kept
    .join(', ')
    /* A VERB AFTER A FIGURE'S NAMES AGREES WITH HOW MANY IT NAMED (`{{projects-need-you.names}} need(s) a push`): "Kiln
       needs a push", "Kiln and Portage need a push". The `(s)` after names is a verb's, so it is kept for one and dropped
       for several, the other way round from a noun's; `is` and its kind take `VERB`'s forms. */
    .replace(
      /(\{\{\s*([a-z][a-z0-9_-]*\.names)\s*\}\})(\s+)(?:([A-Za-z]+)\(s\)|(are|is|were|was|have|has)\b)/gu,
      (_, hole: string, path: string, gap: string, verb: string | undefined, be: string | undefined) => {
        const single = !/ and /u.test(said(path) ?? '');
        if (verb !== undefined) return `${hole}${gap}${verb}${single ? 's' : ''}`;
        const forms = VERB[be!]!;
        return `${hole}${gap}${single ? forms[0] : forms[1]}`;
      },
    )
    .replace(
      /(\{\{\s*([a-z][a-z0-9_-]*(?:[.#][a-z0-9_-]+)*)\s*\}\}|(?<![\d.,])\b\d[\d,]*(?:\.\d+)?)((?:\s+[A-Za-z]+)*?)\s+([A-Za-z]+)\(s\)(?:(\s+)(are|is|were|was|have|has)\b)?/gu,
      (_, figure: string, path: string | undefined, between: string, word: string, gap: string | undefined, verb: string | undefined) => {
        const single = one(path === undefined ? figure : (said(path) ?? ''));
        const forms = verb !== undefined && Object.hasOwn(VERB, verb) ? VERB[verb] : undefined;
        return `${figure}${between} ${single ? word : `${word}s`}${forms ? `${gap ?? ' '}${single ? forms[0] : forms[1]}` : ''}`;
      },
    )
    .replace(/([A-Za-z]+)\(s\)/gu, '$1s');
}

/** A figure as `resolverOf` writes it, `0`, `0.0`, `0%` or `GBP 0.00`, one part or several joined by ` · `. */
const NOUGHT = /^(?:[A-Z]{3} )?[-−]?0+(?:\.0+)?%?$/u;
const nought = (figure: string): boolean => figure.split(' · ').every((part) => NOUGHT.test(part.trim()));

/** The verbs `leadOf` makes agree, each as its one form and its many. */
const VERB: Readonly<Record<string, readonly [string, string]>> = {
  is: ['is', 'are'],
  are: ['is', 'are'],
  was: ['was', 'were'],
  were: ['was', 'were'],
  has: ['has', 'have'],
  have: ['has', 'have'],
};

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

/**
 * WHAT GOOD LOOKS LIKE FOR THIS FIGURE, in the words a person says it: "Limit £20,000", "Keep above £0", "None
 * expected", "At least 90".
 *
 * An inequality under *Owed to you* read as an instruction to be owed less, when it is the line past which somebody
 * should be chasing, and the two glyphs are ones a person cannot type. The sentences that replaced it ("no more than
 * GBP 20,000.00", "never below zero", "should be nothing") were right and read like a specification. These are what
 * somebody writes on a sticky note, and they fit one line under a figure on a phone.
 *
 * RIGHT AT THE BOUNDARY: `lte: 3` allows three, and a limit is the most allowed, so "Limit 3" says it. A floor above
 * zero stays "At least", because "Keep above 90" would call ninety a miss when the target meets it.
 *
 * THE FIGURE IS WRITTEN AS `format` WRITES IT, code first, so the screen's `symbolText` redraws it in the record's
 * currency like every other figure in a note; only a fraction of all zeros is dropped, because a target is a round
 * line somebody set and ".00" on it is width a phone does not have.
 *
 * WITH THE FIGURE'S VALUE, a limit is said only when it is broken ("3 over your limit"); without it, as the rule.
 */
export const targetLine = (decl: MetricDecl, value?: number | null): string => {
  /* A TARGET THAT NAMES A SETTING AND NO NUMBER YET (a money ceiling with no default) has no line to say. */
  const target = decl.target as { lte?: unknown; gte?: unknown };
  const under = typeof target.lte === 'number';
  const bound = typeof target.lte === 'number' ? target.lte : typeof target.gte === 'number' ? target.gte : null;
  if (bound === null) return '';
  /* A LIMIT WITH ITS FIGURE BESIDE IT says nothing while the figure keeps to it, since "Limit 5" under a 2 is a rule
     nobody broke, and says how far over once it does not: the tone already says which side it is on. */
  if (under && typeof value === 'number') return value <= bound ? '' : `${format(decl.format, value - bound).replace(/\.0+$/u, '')} over your limit`;
  if (under && bound === 0) return 'None expected';
  const figure = format(decl.format, bound).replace(/\.0+$/u, '');
  if (under) return `Limit ${figure}`;
  return bound === 0 ? `Keep above ${figure}` : `At least ${figure}`;
};
