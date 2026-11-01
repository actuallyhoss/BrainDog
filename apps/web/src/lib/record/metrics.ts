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
 * ONE READING IS STILL MADE HERE, over entries a tab already holds: a difference in parts and against the window before
 * (`diffRead`). Its predicate, its moved clock and its gate are the record's own, imported, so nothing is said twice.
 *
 * AND THE LINK IS DERIVED. A tile's href used to be typed beside its predicate, so the two drifted:
 * a tile counting five states whose link listed three, and a figure excluding cancelled services whose
 * link included them. One predicate produces both the figure and the URL, so they cannot disagree.
 */

import { BEFORE, GROUP_CAP, comparisonOf, monthBefore, yearBefore, type Before, type Bucket, type FxRead, type Group, type Halves, type Part, type Rate, type TargetIn } from '@braindog/kernel';
import { clausesOf, evaluate, parseWhere, quoteValue, type Predicate } from '@braindog/where';
import { UNNAMED, day as longDay, integer, money, shortDay } from 'braindog-render';

import { copy } from '../copy.ts';
import { REGISTERS } from './held.ts';
import { BARE, amountOf, currencyOf, mixedFix } from './money.ts';
import { homeCurrency } from './api.ts';
import { joinsWithOr, schemaOf } from './where.ts';
import { hrefFor, registerOf } from './figure-href.ts';
import type { Entry } from './schema.ts';

/** A noun's many: an s, except "person(s)", which is people and never "persons" (AN16). */
const manyOf = (word: string): string => (word === 'person' ? 'people' : word === 'Person' ? 'People' : `${word}s`);

/* ── the document ────────────────────────────────────────────────────────── */

/** The ten this build reads. `median`, `last`, `running` and `trend` are §2.3 and series-only. */
export type Aggregation =
  | { sum: Operand }
  | { count: string }
  | { avg: Operand }
  | { min: string }
  | { max: string }
  | { distinct: string }
  /* THE KERNEL'S THREE SIGNS WORDS (`AGGREGATIONS`): the age of the newest day, the currencies a money field is kept
     in and the rows that leave a field empty. Each is a count or a number of days, never money. */
  | { age: string }
  | { currencies: string }
  | { empty: string }
  /* AND ITS FOURTH (signs-metric-75-76): how many rows hold a day that is gone, `by` whole days or more, counted inside
     a `where` that does not say the day. `past` is written first, as the record reads the first key's field. */
  | { past: string; by?: string | undefined };

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
  /**
   * `before` IS THE WINDOW THE SECOND HALF IS READ FROM, one of the record's three words (`BEFORE`): the same
   * `where` at the clock moved back, ended at that clock's day. Without it both halves read the same entries.
   */
  | { diff: { of: Aggregation; per: Aggregation; before?: Before | undefined } };

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
  /** On a difference against the window before: what each half read, as the record's `halves` says it. */
  halves?: Halves;
  /** On a kept series with gaps: the days that have no point for want of a rate (the kernel's `Reading.noRateDays`). */
  noRateDays?: string[];
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
  /**
   * A sum that converted what it could, as the record's `atLeast` and `noRate` say it: `parts[0]` is the least
   * the whole can be and `noRate` is what no rate reached. `value` is `null`, and it is held to no target.
   */
  atLeast?: true;
  noRate?: Part[];
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
 * THE MARK A VERDICT EARNS ON A TILE, which is not always the verdict (2026-10-29, after audit of 30 October, 20).
 *
 * A FLOOR OF NOUGHT IS A GUARD, NOT A GOAL. `target: { gte: 0 }` is on a hundred figures because a figure must have a
 * target, and it is met by every count, every day and every sum of amounts there is: "To pay on the card £1,240" and
 * "Oldest balance 3 Sep" drew a tick for being at least nothing. So a floor of nought says only when it is crossed: a
 * miss is still a miss (cash below nought, a net worth that went under), and being above it draws no mark. Every other
 * target, a ceiling, a goal of a year's runway, a share to keep, is marked both ways as before.
 */
export function markOf(decl: Pick<MetricDecl, 'target'> | undefined, met: boolean | null): boolean | null {
  if (met !== true) return met;
  const t = decl?.target as { gte?: unknown; lte?: unknown } | undefined;
  return t !== undefined && typeof t.gte === 'number' && t.gte <= 0 && t.lte === undefined ? null : met;
}

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
 * What a figure across currencies says under itself: why it is in parts, that it is only at least, or as of which day's
 * rates it was converted.
 * `null` for a figure in one currency. Read from the record's reading or a tile's `Reading`, which carry the same keys.
 */
export function fxNote(r: {
  parts?: readonly Part[] | undefined;
  fx?: FxRead | undefined;
  atLeast?: true | undefined;
  noRate?: readonly Part[] | undefined;
}): string | null {
  if (!r.fx) return null;
  if (r.parts) {
    /* ONE CURRENCY IS SAID AS IT IS, AND NEEDS NO RATE (audit 31 Oct o, AO6): a founder whose first money line was
       "Stripe paid out 1,950 USD today" on a pound record was told "Not added up yet: there is no rate from USD to EGP"
       in his first minutes, over one amount with nothing to add it to. Rates are raised once two currencies meet. */
    if (r.parts.length < 2) return null;
    /* A SUM THAT CONVERTED WHAT IT COULD: the first part is the least the whole can be, and `noRate` is what
       no rate reached. It says so, and names each pair, where it used to say nothing was added up. */
    const least = r.atLeast && r.noRate?.length ? r.parts[0] : undefined;
    if (least && r.fx.missing.length) return copy.figureAtLeast(money(Math.round(least.amount), least.currency), r.fx.missing);
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
  !shape || shape === 'money' || shape.startsWith('money.') ? partsText(parts) : parts.map((p) => `${p.currency} ${format(shape, p.amount)}`).join(' · ');

const WINDOW = /^(\d{1,4})([dwm])$/;

/** A window as milliseconds, or `null` when it is not one. */
export function windowMs(w: string): number | null {
  const m = WINDOW.exec(w.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n * (m[2] === 'd' ? DAY_MS : m[2] === 'w' ? 7 * DAY_MS : 30 * DAY_MS);
}


/**
 * The currencies the field an aggregation reads is written in.
 *
 * A SUM IS THE PLACE TWO CURRENCIES MEET. The predicate does not care, the count does not care, and
 * then one line adds them — and what comes out is a number of the right size in the wrong unit,
 * under a code the declaration chose rather than the rows did.
 */
function currenciesOf(rows: Entry[], agg: Aggregation): Set<string> {
  /* AN AGE, A COUNT OF CURRENCIES, OF EMPTY ROWS AND OF DAYS GONE ADD NO MONEY, so no two currencies meet in them. */
  if ('age' in agg || 'currencies' in agg || 'empty' in agg || 'past' in agg) return new Set();
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
export function currenciesRead(rows: Entry[], value: Value, before: Entry[] = rows): Set<string> {
  if ('ratio' in value) return pairCurrencies(rows, value.ratio, rows);
  if ('diff' in value) return pairCurrencies(rows, value.diff, before);
  return currenciesOf(rows, value);
}

/**
 * EACH HALF OVER ITS OWN ENTRIES. Both were read over one list, which is right for a ratio and for a difference of two
 * fields, and wrong for a difference against the window before (`diff.before`), whose second half holds other entries:
 * pounds this month against dollars last month read as one currency. `before` is that window's entries.
 */
const pairCurrencies = (rows: Entry[], pair: { of: Aggregation; per: Aggregation }, before: Entry[]): Set<string> =>
  new Set([...currenciesOf(rows, pair.of), ...currenciesOf(before, pair.per)]);

/**
 * A day as a figure says it: `30 Oct`, and `30 Oct 2027` when it is not in the year the clock is in, because a day
 * said without its year is read as this year's. Text that is not a day is said as it came.
 */
function daySaid(day: string, now: number): string {
  const said = shortDay(day);
  return said === day || day.slice(0, 4) === new Date(now).toISOString().slice(0, 4) ? said : `${said} ${day.slice(0, 4)}`;
}

/**
 * How a figure is written. The format is declared, so two tiles of one number look the same.
 *
 * AND `format` IS OPTIONAL, which this did not survive. A declaration without one crashed on
 * `shape.startsWith` — a `TypeError` out of a figure, on a page, from a key the schema marks
 * optional and every other reader treats as optional. A number with no declared shape is written as
 * a number, which is the honest default and what the `default` branch below already said.
 */
export function format(shape: string | undefined, n: number | string | null, now: number = Date.now()): string {
  if (n === null) return '—';
  /* A DAY MAY ARRIVE AS THE DAY ITSELF, `2026-10-30`, and is said as one. Any other text is a number written as text,
     or is said as it came. */
  if (typeof n === 'string') {
    if (shape === 'day' && /^\d{4}-\d{2}-\d{2}/u.test(n)) return daySaid(n.slice(0, 10), now);
    const parsed = n.trim() === '' ? Number.NaN : Number(n);
    return Number.isFinite(parsed) ? format(shape, parsed, now) : n;
  }
  if (!shape) return n.toLocaleString('en', { maximumFractionDigits: 2 });
  if (shape.startsWith('money.')) return money(Math.round(n), shape.slice('money.'.length));
  /* A BARE `money` IS THE HOME CURRENCY'S (money-core 3.0.0). With none chosen it names no currency, so it is written
     as the number it is rather than in a currency guessed for it. */
  /* AND THE SHELL'S HOME CURRENCY WHERE NO RATES WERE HANDED IN, the one the record chose or its money is all in
     (`homeCurrency`): a sum of nothing in an add-on's money figure drew a bare "0" beside "EGP 4,200,000". */
  const home = shape === 'money' ? (fxSource().home ?? homeCurrency()) : null;
  if (home !== null) return money(Math.round(n), home);
  switch (shape) {
    case 'int':
      return integer(Math.round(n));
    case 'pct':
      /* A MINUS SIGN, NOT A HYPHEN, as every money figure writes one ("Kept, 90 days −69.7%"). */
      return `${(n * 100).toLocaleString('en', { maximumFractionDigits: 1 }).replace(/^-/u, '−')}%`;
    case 'days':
      return Math.round(n) === 1 ? '1 day' : `${Math.round(n)} days`;
    case 'decimal':
      return n.toLocaleString('en', { maximumFractionDigits: 2 });
    /* A FIGURE THAT IS A DAY, held as whole days since 1970: `11 Sep`. */
    case 'day':
      return daySaid(new Date(Math.round(n) * DAY_MS).toISOString().slice(0, 10), now);
    default:
      return String(n);
  }
}

/* A FIGURE'S DOOR IS `figure-href.ts`'s, so a row's address can name it without this file. */
export { hrefFor };

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
/* A WHERE MAY BE A PREDICATE TREE and not a sentence (one sentence cannot mix a comma with an `or`), and a tree can be
   a template too since portfolio 1.19.0: `kpi-stale` names its measure in one, since a measure's name may hold a comma.
   So the tree is searched as well as a sentence. */
/* A WALK'S HOLE IS IN ITS LEGS AND IN THE FIGURE IT OPENS FROM (book-walk-opening-76): `book-lasts-until` has no `where`
   and opens from `book-cash:{{it}}`. Read by `where` alone it was a figure with nothing to fill, offered in the palette
   and read bare, where the record refuses it and asks for it by name. */
/* AND A SUM'S HOLE IS IN THE FIGURES IT ADDS (money-core 3.29.0): `account-gap` has no `where` and adds `account-now:{{it}}`
   less `account-lines:{{it}}`, so it is a figure about one account and is read once it is named. */
export const isTemplate = (decl: MetricDecl): boolean => {
  const walk = decl as { legs?: unknown; opening?: unknown; value?: unknown };
  return JSON.stringify([decl.where ?? null, walk.legs ?? null, walk.opening ?? null, walk.value ?? null]).includes('{{');
};

/** The ten aggregations this build reads. `08` §2.2 publishes eleven; the rest are post-v1. */
const READS_AGGREGATION = ['sum', 'count', 'avg', 'min', 'max', 'distinct', 'age', 'currencies', 'empty', 'past'];

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
    const pair = ('ratio' in value ? value.ratio : value.diff) as { of?: object; per?: object; before?: unknown } | undefined;
    for (const side of ['of', 'per'] as const) {
      const agg = pair?.[side];
      if (!agg || !Object.keys(agg).some((k) => READS_AGGREGATION.includes(k)))
        out.push(`value.${side}: this build reads ${READS_AGGREGATION.join(' · ')}`);
    }
    /* A DIFFERENCE IN PARTS AND AGAINST THE WINDOW BEFORE, in the sentences the record refuses each with at
       install: a ratio is still not grouped, a difference is grouped by one field, the window before is one of three
       words, and such a difference is never cut by date. */
    if ('ratio' in value && decl.group_by !== undefined) out.push('group_by: a ratio is not grouped in this build; group each half as its own figure');
    const grouping = 'diff' in value ? halvesGrouping(decl) : null;
    if (grouping?.said) out.push(`group_by: ${grouping.said}`);
    if ('diff' in value && pair?.before !== undefined) {
      if (!(BEFORE as readonly unknown[]).includes(pair.before)) out.push(`value: ${String(pair.before)} is not a window before: write ${BEFORE.join(', ')}`);
      if (decl.bucket !== undefined) out.push('bucket: a difference against the window before is grouped by a field and never cut by date, because its halves hold different dates');
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

/* ── a difference in parts, and against the window before ──────── */

/**
 * A difference whose halves name the grouping, as one whose figure does: the record's `liftedGrouping`, in its words.
 *
 * BOTH HALVES NAME THE SAME FIELD, OR IT IS TWO QUESTIONS. `said` is the sentence for halves that disagree with each
 * other or with the figure's own `group_by`, and `by` is the one field the difference is read per value of.
 */
function halvesGrouping(decl: MetricDecl): { of: Aggregation; per: Aggregation; by: string | undefined; said: string | null } | null {
  const diff = (decl.value as { diff?: { of?: unknown; per?: unknown } | null } | undefined)?.diff;
  const held = (half: unknown): half is Record<string, unknown> => half !== null && typeof half === 'object' && !Array.isArray(half);
  if (!diff || !held(diff.of) || !held(diff.per)) return null;
  const a = diff.of.group_by;
  const b = diff.per.group_by;
  const bare = (half: Record<string, unknown>): Aggregation => Object.fromEntries(Object.entries(half).filter(([key]) => key !== 'group_by')) as Aggregation;
  const word = (by: unknown): string => (by === undefined ? 'nothing' : String(by));
  const said =
    a === undefined && b === undefined
      ? null
      : a !== b
        ? `a difference is grouped by one field, and its halves are grouped by ${word(a)} and ${word(b)}; group both by the same field`
        : decl.group_by !== undefined && decl.group_by !== a
          ? `its halves are grouped by ${word(a)} and the figure by ${String(decl.group_by)}; a difference is grouped by one field`
          : null;
  return { of: bare(diff.of), per: bare(diff.per), by: decl.group_by ?? (typeof a === 'string' ? a : undefined), said };
}

/** The operators that start a window and the ones that end it, as the record's `endedAt` lists them. */
const LOWER = ['after', 'gt', 'gte'] as const;
const UPPER = ['before', 'lt', 'lte', 'between', 'is', 'in'] as const;

const conjuncts = (p: Predicate): Record<string, unknown>[] =>
  (Array.isArray((p as { all?: unknown }).all) ? (p as { all: Predicate[] }).all : [p]) as Record<string, unknown>[];

const dayAfter = (iso: string): string => new Date(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);

/**
 * The window before, ended at the moved clock's day: the record's `endedAt`, for a window that writes only its start.
 *
 * `on at least bom` READ A MONTH BACK IS `on at least 1 September`, WHICH STILL RUNS TO TODAY, so it holds this month
 * too. Every dated field given a start and no end is ended the day after the moved clock's, since `before` leaves its
 * own day out, and never past the day the current window starts, so no entry is in both.
 */
function endedAt(shifted: Predicate | undefined, current: Predicate | undefined, register: string, thenMs: number): Predicate | undefined {
  if (!shifted || current === undefined) return shifted;
  const fields = REGISTERS[register]?.fields ?? [];
  const dated = (field: unknown): field is string => typeof field === 'string' && fields.some((f) => f.id === field && (f.type === 'day' || f.type === 'instant'));
  const clauses = conjuncts(shifted);
  const started = new Set(clauses.filter((c) => dated(c.field) && LOWER.some((op) => op in c)).map((c) => c.field as string));
  for (const c of clauses) if (dated(c.field) && UPPER.some((op) => op in c)) started.delete(c.field as string);
  if (started.size === 0) return shifted;
  /* THE FIRST DAY A WINDOW HOLDS: `gte` names it, `after` names the day before it. */
  const startOf = (of: readonly Record<string, unknown>[], field: string): string | undefined =>
    of
      .filter((c) => c.field === field)
      .flatMap((c) => LOWER.filter((op) => typeof c[op] === 'string').map((op) => (op === 'gte' ? (c[op] as string).slice(0, 10) : dayAfter(c[op] as string))))
      .sort()
      .at(-1);
  const clock = dayAfter(new Date(thenMs).toISOString());
  const ends = [...started].map((field) => {
    const begins = startOf(conjuncts(current), field);
    return { field, before: begins !== undefined && begins < clock ? begins : clock } as Predicate;
  });
  return { all: [...(clauses as Predicate[]), ...ends] } as Predicate;
}

/**
 * The entries of each half: this window's, and the window before's when the difference names one.
 *
 * THE RECORD'S OWN PARSER, CLOCK AND TEST OF A ROW (`parseWhere`, `monthBefore`, `evaluate`), so the two windows are the
 * record's and nothing about a predicate is said twice. A year back is the same day last year; `previous` is the
 * figure's own `window`. `moved` is whether the words name a day at all, and `noise` a window under seven days.
 */
function halvesOf(decl: MetricDecl, register: string, rows: readonly Entry[], now: number): { bad: string[]; of: Entry[]; per: Entry[]; then: { moved: boolean; noise: boolean } | null } {
  const schema = schemaOf(register);
  const nothing = (bad: string[]) => ({ bad, of: [], per: [], then: null });
  const said = parseWhere(decl.where, schema, { nowMs: now });
  if (said.bad.length) return nothing(said.bad.map((b) => b.fix));
  /* The row goes beside its fields, for words about what the record keeps in a column (`created_at`). */
  const admits = (p: Predicate | undefined) => rows.filter((e) => evaluate(p, e.fields as Record<string, unknown>, schema, { id: e.id, seq: e.seq, version: e.version, created_at: e.created }));
  const of = admits(said.predicate);
  const word = 'diff' in decl.value ? decl.value.diff.before : undefined;
  if (word === undefined) return { bad: [], of, per: of, then: null };
  const shift = windowMs(decl.window ?? '');
  if (word === 'previous' && shift === null) return nothing([`window: ${String(decl.window)} is not a window, so there is no window before it`]);
  const moveTo = word === 'year_ago' ? yearBefore(now) : word === 'month_ago' ? monthBefore(now) : now - shift!;
  const shifted = parseWhere(decl.where, schema, { nowMs: moveTo });
  if (shifted.bad.length) return nothing(shifted.bad.map((b) => b.fix));
  const moved = JSON.stringify(shifted.predicate) !== JSON.stringify(said.predicate);
  return { bad: [], of, per: admits(endedAt(shifted.predicate, said.predicate, register, moveTo)), then: { moved, noise: word === 'previous' && shift! < 7 * DAY_MS } };
}

/** What one half read: its number, or `null` when it holds no one number, and what it added in each currency. */
type HalfRead = { value: number | null; rows: number; amounts: Map<string, number>; refusal?: string };

/** One half over the entries of its window. A bare number is kept under `BARE`, beside what is in a currency. */
function halfOf(agg: Aggregation, rows: readonly Entry[]): HalfRead {
  const amounts = new Map<string, number>();
  const none = (refusal: string): HalfRead => ({ value: null, rows: rows.length, amounts, refusal });
  if ('age' in agg) return none('value: the age of the newest day is read by the record, and not inside a difference here');
  /* THE RECORD'S DAY IS NOT THIS TAB'S: a day is gone by the record's own today, so the count is the record's to make. */
  if ('past' in agg) return none('value: the days that are gone are counted by the record, and not inside a difference here');
  const op = 'count' in agg ? agg.count : 'distinct' in agg ? agg.distinct : 'sum' in agg ? agg.sum : 'avg' in agg ? agg.avg : 'min' in agg ? agg.min : 'max' in agg ? agg.max : 'currencies' in agg ? agg.currencies : agg.empty;
  if (typeof op !== 'string') return none('value: a figure multiplied by a factor is read by the record, and not inside a difference here');
  const said = rows.map((e) => (op === 'id' ? e.seq : e.fields[op])).filter((v) => v !== null && v !== undefined && v !== '');
  if ('count' in agg) return { value: said.length, rows: rows.length, amounts };
  if ('empty' in agg) return { value: rows.length - said.length, rows: rows.length, amounts };
  if ('distinct' in agg) return { value: new Set(said.map((v) => JSON.stringify(v))).size, rows: rows.length, amounts };
  if ('currencies' in agg) return { value: new Set(said.map(currencyOf).filter(Boolean)).size, rows: rows.length, amounts };
  const numbers: number[] = [];
  for (const v of said) {
    const n = amountOf(v);
    if (n === null) continue;
    numbers.push(n);
    const unit = currencyOf(v) ?? BARE;
    amounts.set(unit, (amounts.get(unit) ?? 0) + n);
  }
  /* MONEY IS ADDED IN ONE CURRENCY OR NOT AT ALL, and a minimum across two is no amount either. */
  if (amounts.size > 1) return { value: null, rows: rows.length, amounts };
  if ('sum' in agg) return { value: numbers.reduce((a, n) => a + n, 0), rows: rows.length, amounts };
  if (numbers.length === 0) return { value: null, rows: rows.length, amounts };
  const value = 'avg' in agg ? numbers.reduce((a, n) => a + n, 0) / numbers.length : 'min' in agg ? Math.min(...numbers) : Math.max(...numbers);
  return { value, rows: rows.length, amounts };
}

/** A difference as this file reads one: the whole, its parts, and what the record's reading carries beside them. */
export type DiffRead = Required<Pick<Reading, 'value' | 'rows' | 'delta' | 'why' | 'refusals' | 'unit'>> & Pick<Reading, 'parts' | 'halves' | 'groups' | 'more'>;

/**
 * A difference over the entries a tab holds: `of` less `per`, the whole and each part.
 *
 * THE RECORD READS THE FIGURE, AND THIS IS FOR ENTRIES ALREADY IN HAND: a draft before it is sent, and a list a page
 * holds whole. It answers what the record's `groupsOf` answers for the same entries. A grouped difference is one
 * difference for each part, over that part's entries alone. With `diff.before`, `per` is read over the same words at
 * the clock moved back and ended at that clock's day (`halvesOf`); the reading and each part then carry `halves`, and
 * a `delta` and `why` through the record's own gate, `comparisonOf(now, before, true)`, asked of each part by itself.
 * A part only one window holds counts the other as nought.
 *
 * NOTHING IS CONVERTED HERE. Two currencies are one amount for each (`parts`) and no number, so no change is said
 * across them; the record converts into a home currency, and a reading of its own is what a tile draws when it has one.
 */
export function diffRead(decl: MetricDecl, rows: readonly Entry[], now: number = Date.now()): DiffRead {
  const refused = (refusals: string[]): DiffRead => ({ value: null, rows: 0, delta: null, why: '', refusals, unit: null });
  const register = registerOf(decl.source ?? '');
  const pair = halvesGrouping(decl);
  if (register === null || pair === null) return refused(['value: this reads a difference over a list, and the record reads every other figure']);
  const named = unreadable(decl);
  if (named.length) return refused(named);
  if (isTemplate(decl)) return refused(['where: a figure with a name still to fill is read once it has one']);
  const windows = halvesOf(decl, register, rows, now);
  if (windows.bad.length) return refused(windows.bad);
  const then = windows.then;
  const change = (a: { value: number | null; rows: number }, b: { value: number | null; rows: number }): { delta: number | null; why: string } =>
    then?.noise
      ? { delta: null, why: 'a window under seven days is noise' }
      : then && !then.moved
        ? { delta: null, why: 'the predicate does not mention time, so the window moves nothing' }
        : comparisonOf(a, b, true);

  /** One difference: the whole, or one part. `apiece` is the whole being in two currencies, which puts every part in parts. */
  const one = (ofRows: readonly Entry[], perRows: readonly Entry[], apiece: boolean) => {
    const of = halfOf(pair.of, ofRows);
    const per = halfOf(pair.per, perRows);
    const units = [...new Set([...of.amounts.keys(), ...per.amounts.keys()])].sort();
    const mixed = units.length > 1;
    const parts: Part[] = units.map((currency) => ({ currency, amount: (of.amounts.get(currency) ?? 0) - (per.amounts.get(currency) ?? 0) }));
    const halves: Halves = mixed ? { of: null, per: null, perRows: per.rows } : { of: of.rows === 0 ? 0 : of.value, per: per.rows === 0 ? 0 : per.value, perRows: per.rows };
    const value = mixed || apiece || (then ? halves.of === null || halves.per === null : of.value === null || per.value === null) ? null : then ? halves.of! - halves.per! : of.value! - per.value!;
    return { value, rows: of.rows, units, refusal: of.refusal ?? per.refusal, ...(mixed || apiece ? { parts } : {}), ...(then ? { halves, ...change({ value: halves.of, rows: of.rows }, { value: halves.per, rows: per.rows }) } : {}) };
  };

  const whole = one(windows.of, windows.per, false);
  if (whole.refusal) return refused([whole.refusal]);
  /* MONEY BESIDE A BARE NUMBER IS REFUSED, as the record refuses it, in `money.ts`'s sentence. */
  if (whole.units.includes(BARE) && whole.units.length > 1) return refused([mixedFix(whole.units)]);
  const { units, refusal: _, ...said } = whole;
  const reading: DiffRead = { delta: null, why: '', ...said, refusals: [], unit: units.length === 1 && units[0] !== BARE ? units[0]! : null };
  if (pair.by === undefined) return reading;

  /* EVERY PART EITHER WINDOW HOLDS, the largest difference first and the name breaking a tie; past fifty they are
     counted and not drawn. An entry with nothing in the field is in no part, as the record leaves it out. */
  const keyOf = (e: Entry): string | null => (e.fields[pair.by!] === null || e.fields[pair.by!] === undefined || e.fields[pair.by!] === '' ? null : String(e.fields[pair.by!]));
  const keys = [...new Set([...windows.of, ...(then ? windows.per : [])].map(keyOf).filter((k): k is string => k !== null))];
  const groups: Group[] = keys.map((key) => {
    const { units: __, refusal: ___, ...part } = one(windows.of.filter((e) => keyOf(e) === key), then ? windows.per.filter((e) => keyOf(e) === key) : windows.of.filter((e) => keyOf(e) === key), units.length > 1);
    return { key, ...part, value: !then && part.rows === 0 ? null : part.value, state: 'full' };
  });
  groups.sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { ...reading, groups: groups.slice(0, GROUP_CAP), more: Math.max(0, groups.length - GROUP_CAP) };
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
 * `in {{cash-accounts}} account(s), as of {{cash-as-of}}` is the line under Cash now, and `(s)` after a number is the
 * one plural the sentence needs: `1 account`, `2 accounts`.
 *
 * A FIGURE THE NOTE NAMES THAT CANNOT BE READ TAKES ITS CLAUSE WITH IT, as it does in a lead (`leadOf`): "Lasts to"
 * and a dash under Cash now, on a record whose money outlasts the walk, said a hole where there was nothing to say.
 *
 * AND A FIGURE'S PART IS NAMED AS A FIGURE IS (`{{lasts-no-income.on}}`, `{{every-month-in.names}}`), so a cell's note
 * can say why its figure is what it is, and drops the clause as a figure does when the part has nothing to say.
 */
export function noteOf(template: string, said: (id: string) => string | null | typeof UNNAMED): string {
  /* A CLAUSE THAT ONLY SAYS NOUGHT IS LEFT OUT. "0 with an agent, 0 kept for later" under a new record's Open tasks is
     two things to read that say nothing; a clause whose every figure is 0 goes, and a note with none left is empty.
     The template's own commas are the clauses, split before a figure like 1,200 is written in. */
  const FIGURE = /\{\{\s*([a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_]*)?)\s*\}\}/gu;
  const clausesOf = (sentence: string): string[] =>
    sentence.split(/,\s+/u).filter((clause) => {
      const ids = [...clause.matchAll(FIGURE)].map((m) => m[1]!);
      return ids.length === 0 || (ids.every((id) => said(id) !== null) && ids.some((id) => said(id) !== '0'));
    });
  /* SENTENCE BY SENTENCE WHERE THERE ARE TWO OR MORE, as a lead is (`leadOf`): a sentence whose every figure went goes
     whole, and one that lost its last clause keeps its full stop. One sentence is cut by its clauses alone, as always. */
  const sentences = template.split(SENTENCE_END);
  const kept =
    sentences.length === 1
      ? clausesOf(template)
      : [
          sentences
            .flatMap((sentence) => {
              const left = clausesOf(sentence);
              const figured = FIGURE.test(sentence);
              FIGURE.lastIndex = 0;
              if (figured && !left.some((c) => c.match(FIGURE) !== null)) return [];
              const joined = left.join(', ');
              return [/[.!?]$/u.test(sentence) && !/[.!?]$/u.test(joined) ? `${joined}.` : joined];
            })
            .join(' '),
        ];
  /* A PATH THAT NAMES NOTHING (`UNNAMED`) IS THE AUTHOR'S OWN WORDS, printed as written, never the dash a figure that
     could not be read gets: the dash would say a figure is missing where the author's typo is. */
  return kept
    .join(', ')
    .replace(/\{\{\s*([a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_]*)?)\s*\}\}/gu, (_, id: string) => {
      const v = said(id);
      return v === UNNAMED ? id : (v ?? '');
    })
    .replace(/(^|[^\d.,])(\d[\d,]*) ([A-Za-z]+)\(s\)/gu, (_, lead: string, n: string, word: string) => `${lead}${n} ${n === '1' ? word : manyOf(word)}`)
    .replace(/([A-Za-z]+)\(s\)/gu, (_, word: string) => manyOf(word));
}

/** A `{{path}}` a lead sentence may name: a figure's id, and the page's own paths such as `steps.count` or `tasks#12.state`. */
const HOLE = /\{\{\s*([a-z][a-z0-9_-]*(?:[.#][a-z0-9_-]+)*(?::[^{}\s]+)?)\s*\}\}/gu;

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
export function leadOf(template: string, read: (path: string) => string | null | undefined | typeof UNNAMED): string {
  const sentences = template.split(SENTENCE_END);
  if (sentences.length === 1) return leadSentence(template, read);
  /* SENTENCE BY SENTENCE, so a sentence whose figures did not read goes whole and takes nothing of the one before it
     ("Cash is £33,850. Kiln's part 2 is late." on a record with nothing late is the first sentence alone). A sentence
     with no figure in it leans on the one before, and goes when that one went. */
  const out: string[] = [];
  let before = true;
  for (const sentence of sentences) {
    if (!HOLE_IN.test(sentence)) {
      if (before) out.push(sentence);
      continue;
    }
    const said = leadSentence(sentence, read).trim();
    before = said !== '';
    if (said !== '') out.push(/[.!?]$/u.test(said) ? said : `${said}.`);
  }
  return out.join(' ');
}

/** Where one sentence of a lead ends and the next begins: a stop, then space, then more words. */
const SENTENCE_END = /(?<=[.!?])\s+(?=\S)/u;
/** Whether text holds a `{{path}}`. */
const HOLE_IN = /\{\{\s*[a-z][a-z0-9_-]*/u;
/** A typed hole's form, `{{ago:tasks-late.first_by}}`, read by the path after it. */
const TYPED_FORM = /^(?:date|day|until|ago|money|quantity|pct|ref):(?=[A-Za-z])/u;

/** One sentence of a lead by `leadOf`'s rules: its clauses chosen, its plurals and verbs settled, its holes kept. */
function leadSentence(template: string, readAs: (path: string) => string | null | undefined | typeof UNNAMED): string {
  /* A TYPED HOLE IS READ BY ITS PATH: `{{ago:x.first_due}}` stands or goes with `x.first_due`, as the renderer reads it. */
  const read = (path: string) => readAs(path.replace(TYPED_FORM, ''));
  /* A PATH THAT NAMES NOTHING (`UNNAMED`) KEEPS ITS CLAUSE: the renderer prints the author's words for it, so it is no
     figure that failed to read and no nought. Everywhere else here it reads as no words. */
  const said = (path: string): string | null => {
    const v = read(path);
    return v === UNNAMED ? '' : (v ?? null);
  };
  const stands = (clause: string): boolean => {
    /* `{{bad:late}}` IS THE AUTHOR'S WORD IN THE DANGER COLOUR, no figure: it neither holds a clause up nor takes it away. */
    const holes = [...clause.matchAll(HOLE)].map((m) => m[1]!).filter((h) => !h.startsWith('bad:'));
    if (holes.length === 0) return true;
    if (holes.some((h) => read(h) === UNNAMED)) return true;
    const figures = holes.map((h) => said(h));
    if (figures.some((f) => f === null)) return false;
    return figures.some((f) => f !== null && !nought(f));
  };
  /* A CLAUSE THAT OPENS ON "with" LEANS ON THE ONE BEFORE IT, and goes when that one goes: "and Salma still owes EGP
     1,350, with 2 more orders not paid at all" read ", with 2 more orders not paid at all" after nobody, one order
     short, for a reader who may see Orders and not People (shop-owed-53-54's checker). */
  let before = true;
  const kept = template.split(/,\s+/u).filter((clause) => (before = stands(clause) && (before || !/^with\b/iu.test(clause))));
  return pluralsIn(kept.join(', '), said)
    /* A LEAD WHOSE OPENING CLAUSE DROPPED starts on the next one's "and" (uc6-shop-49): "and Salma still owes EGP 1,350"
       says "Salma still owes EGP 1,350". */
    .replace(/^and\s+/u, '');
}

/**
 * THE PLURALS OF A TEMPLATE SETTLED BY ITS FIGURES, with every `{{path}}` kept for the renderer (`leadOf`'s rules, apart
 * from its clauses): `{{n}} payment(s)` is "payment" for one and "payments" for more, and a verb after it agrees. Every
 * note says it so, not only a lead (recheck of 30 October, N5: "27 payment(s)" on Payees).
 */
export function pluralsIn(template: string, said: (path: string) => string | null): string {
  const one = (count: string): boolean => count.trim() === '1';
  return template
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
      /(\{\{\s*([a-z][a-z0-9_-]*(?:[.#][a-z0-9_-]+)*(?::[^{}\s]+)?)\s*\}\}|(?<![\d.,])\b\d[\d,]*(?:\.\d+)?)((?:\s+[A-Za-z]+)*?)\s+([A-Za-z]+)\(s\)(?:(\s+)(are|is|were|was|have|has)\b)?/gu,
      (_, figure: string, path: string | undefined, between: string, word: string, gap: string | undefined, verb: string | undefined) => {
        const single = one(path === undefined ? figure : (said(path) ?? ''));
        const forms = verb !== undefined && Object.hasOwn(VERB, verb) ? VERB[verb] : undefined;
        return `${figure}${between} ${single ? word : manyOf(word)}${forms ? `${gap ?? ' '}${single ? forms[0] : forms[1]}` : ''}`;
      },
    )
    .replace(/([A-Za-z]+)\(s\)/gu, (_, word: string) => manyOf(word));
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

/**
 * Is the figure on the right side of what was declared as good? `null` when there is no figure to hold to it, and for a
 * sum that is only at least: a lower bound is not the figure, so it is neither on its target nor off it.
 */
export function meetsTarget(decl: MetricDecl, value: number | null, r?: { atLeast?: true | undefined }): boolean | null {
  if (value === null || r?.atLeast) return null;
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
  /* A DAY HAS NO LINE: its bound is a day nobody set (the first of 2100, for the day the money runs out), and "At least
     1 Jan 2100" under a date is the declaration talking. The tone says which side of it the day is on. */
  if (decl.format === 'day') return '';
  /* MONEY IN NO CURRENCY HAS NO LINE: a bare `money` with no home currency is written as the minor units it is kept in
     ("720000 over your limit"), so it is said only once a caller names the currency (`targetSaid`). */
  if (decl.format === 'money' && fxSource().home === null) return '';
  /* A LIMIT WITH ITS FIGURE BESIDE IT says nothing while the figure keeps to it, since "Limit 5" under a 2 is a rule
     nobody broke, and says how far over once it does not: the tone already says which side it is on. */
  if (under && typeof value === 'number') return value <= bound ? '' : `${format(decl.format, value - bound).replace(/\.0+$/u, '')} over your limit`;
  if (under && bound === 0) return 'None expected';
  /* NOTHING IS UNDER NOTHING, so a floor of zero is a line nobody can miss, and is not said: a count's, and money's
     "Keep above GBP 0" too. NOR ONE BELOW IT, which is a guard and not a goal as `markOf` reads it: Weather's −100° and
     an account's balance, which may be anything (audit 2 B17), drew "At least −£90,071,992,547,409.91". */
  if (!under && bound <= 0) return '';
  const figure = format(decl.format, bound).replace(/\.0+$/u, '');
  if (under) return `Limit ${figure}`;
  return `At least ${figure}`;
};

/**
 * How far a walk looked without going under, as the day it is said with, or `null`.
 *
 * NO VALUE IS TWO THINGS AND ONLY ONE OF THEM IS A FAILURE. A walk whose balance stays above zero has no day to answer
 * with, and the record sends the last day it looked at beside the empty value (`Beyond` in the kernel's
 * `money-figures.ts`). Only a calendar day and a whole count of days is taken for one.
 */
export function beyondOf(r: { beyond?: unknown }): string | null {
  const b = r.beyond;
  if (typeof b !== 'object' || b === null) return null;
  const { day, days } = b as { day?: unknown; days?: unknown };
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(day) || Number.isNaN(Date.parse(day))) return null;
  return typeof days === 'number' && Number.isInteger(days) ? longDay(day) : null;
}
