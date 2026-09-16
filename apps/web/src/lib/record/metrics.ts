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

import { GROUP_CAP, bucketOf, bucketRun, isBucket, largestFirst, type Bucket, type Group } from '@braindog/kernel';
import { integer, money, shortDay } from 'braindog-render';

import { LOOKUPS, NOW, REGISTERS, ROWS } from './data.ts';
import { amountOf, currencyOf, mixedFix } from './money.ts';
import { compile, explain, matches, registerHref, resolveDay } from './where.ts';
import type { Where } from './where.ts';
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
  href: string;
  /** A grouped figure's parts, as the record's `groupsOf` returns them. */
  groups?: Group[];
  /** The bucket the clock is in, on a figure bucketed by date. */
  current?: string;
  /** Groups past the cap of fifty, left out. */
  more?: number;
};

const DAY_MS = 86_400_000;
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
       `min` and `max` reach here with one: a sum or an average of days is refused before this. */
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
 * The mark for "and some of these had no currency at all".
 *
 * A string that is not a currency code, so it cannot collide with one and cannot be printed as one:
 * `mixedFix` renders the set into a sentence, and this reads as what it is.
 */
export const BARE = 'no currency';

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

function aggregate(rows: Entry[], agg: Aggregation): number | null {
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
  const values = rows.map((e) => operand(e, field)).filter((n): n is number => n !== null);
  if ('sum' in agg) return values.reduce((a, n) => a + n, 0);
  // An average, a minimum and a maximum OF NOTHING is not zero. `null` renders as the em dash.
  if (values.length === 0) return null;
  if ('avg' in agg) return values.reduce((a, n) => a + n, 0) / values.length;
  if ('min' in agg) return Math.min(...values);
  return Math.max(...values);
}

function evaluateValue(rows: Entry[], value: Value): number | null {
  if ('ratio' in value || 'diff' in value) {
    const pair = 'ratio' in value ? value.ratio : value.diff;
    const of = aggregate(rows, pair.of);
    const per = aggregate(rows, pair.per);
    if (of === null || per === null) return null;
    /* A ZERO DENOMINATOR IS NOT A NUMBER. §2.2's last row: never `0`, never infinity, never `NaN` —
       the em dash, and the numerator is still on the row behind it. */
    if ('ratio' in value) return per === 0 ? null : of / per;
    return of - per;
  }
  return aggregate(rows, value);
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
export function hrefFor(decl: MetricDecl): string {
  const register = registerOf(decl.source);
  if (!register) return '/p/money';
  /* THE SAME BUILDER A PAGE BLOCK USES. It lived here, so a figure's link was derived from its
     predicate and a block's link was not derived from anything — the block just went to the
     register. Two surfaces asking the same question of the same sentence now get the same answer
     from the same function, which is the only arrangement under which they cannot drift. */
  return registerHref(register, decl.where);
}

/**
 * The predicate as it RESOLVES at one clock: the same clauses, with every temporal word made a day.
 *
 * This is what the comparison actually depends on, and the check used to ask a different question.
 * It asked whether any clause was a DATE clause, and an absolute date is a date clause that does
 * not move. `due before 2026-10-01` over a thirty-day window compared 10,343,000 with itself and
 * reported `delta: 0`, so the tile read GBP 103,430.00 · no change on the 30 days before: a set
 * compared with itself, printed as a fact about the business. The relative form of the same
 * sentence, `due before today`, was right all along, which is why the gate looked like it worked.
 *
 * So the question is the kernel's: does the resolved predicate MOVE when the clock does? A word
 * like `today` or `+30d` resolves to a different day at a moved clock and a written-out date does
 * not, and no list of which spellings are which has to be kept anywhere.
 */
const resolvedAt = (w: Where, now: number): string =>
  JSON.stringify(w.clauses.map((c) => ('values' in c ? c : { ...c, day: resolveDay(c.day, now) })));

/** Does this predicate say anything different at the moved clock? Without that, the two sets are one set. */
const moves = (w: Where, now: number, then: number): boolean => resolvedAt(w, now) !== resolvedAt(w, then);

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

/** Every key a metric document may carry here, so one it may not is named rather than ignored. */
const READS_KEY = new Set(['metric', 'name', 'source', 'where', 'value', 'format', 'target', 'window', 'compare', 'lookups', 'snapshot', 'group_by', 'bucket']);

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
      if (type === 'day' && (kind === 'min' || kind === 'max')) continue;
      if (type !== undefined && !NUMERIC.has(type))
        out.push(`value: ${kind} reads a number, and ${field} is a ${type}. Count it, or aggregate a number field`);
    }
  }
  return out;
}

export function withParam(decl: MetricDecl, it: string): MetricDecl {
  return decl.where === undefined ? decl : { ...decl, metric: `${decl.metric}:${it}`, where: decl.where.replaceAll('{{it}}', it) };
}

export function read(decl: MetricDecl, now: number = NOW): Reading {
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
    refusals.push(...explain(compile(register, decl.where)).map((r) => `${decl.metric}: ${r}`));

  refusals.push(...groupingFaults(decl, register).map((r) => `${decl.metric}: ${r}`));

  if (refusals.length || !register)
    return { value: null, shown: '—', rows: 0, held: 0, delta: null, why: refusals[0] ?? '', unmeasured: null, refusals, href: '/p/money' };

  const w = compile(register, decl.where);
  const all = ROWS[register] ?? [];
  const rows = all.filter((e) => matches(e, w, now));

  /* TWO CURRENCIES ARE NEVER ADDED, and this is the line that would have added them. A tile is one
     figure with one code beside it; a sum across two is a number of the right size in the wrong
     unit, and there is no screen on which anybody notices. */
  const seen = currenciesRead(rows, decl.value);
  if (seen.size > 1) {
    const why = `${decl.metric}: ${mixedFix([...seen].sort())}`;
    return { value: null, shown: '—', rows: rows.length, held: all.length, delta: null, why, unmeasured: null, refusals: [why], href: hrefFor(decl) };
  }

  /* AND THE FORMAT IS CHECKED AGAINST THEM. `format: money.GBP` is a declaration about how to write
     the figure; the rows are what it is a figure OF. When they disagree the declaration is wrong,
     and printing the rows' number under the declaration's code is the quiet version of that. */
  const declared = decl.format?.startsWith('money.') ? decl.format.slice('money.'.length) : null;
  const held = [...seen][0];
  if (declared && held && declared !== held) {
    const why = `${decl.metric}: the rows are in ${held} and the format says ${declared}`;
    return { value: null, shown: '—', rows: rows.length, held: all.length, delta: null, why, unmeasured: null, refusals: [why], href: hrefFor(decl) };
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
    return { value: null, shown: '—', rows: rows.length, held: all.length, delta: null, why, unmeasured: null, refusals: [why], href: hrefFor(decl) };
  }

  const value = evaluateValue(rows, decl.value);

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
       is a sentence a person can see is wrong. */
    const timeless = w.clauses.every((c) => 'values' in c);
    why = timeless
      ? 'the predicate does not mention time, so the window moves nothing'
      : 'the predicate names a fixed date, so the window moves nothing';
    unmeasured = timeless
      ? 'nothing here is dated, so there is no before to compare with'
      : 'this asks about one fixed date, so the same rows are on both sides of the window';
  } else {
    const before = all.filter((e) => matches(e, w, then));
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
      const prior = evaluateValue(before, decl.value);
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
   */
  return {
    value,
    shown: format(decl.format, value),
    rows: rows.length,
    held: all.length,
    delta,
    why,
    unmeasured,
    refusals: [],
    href: hrefFor(decl),
    ...(decl.group_by === undefined ? {} : groupsOf(rows, decl, now)),
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
function groupsOf(rows: Entry[], decl: MetricDecl, now: number): Pick<Reading, 'groups' | 'current' | 'more'> {
  const by = decl.group_by!;
  const held = rows.filter((e) => carries(e, by));
  const part = (key: string, of: Entry[]): Group => ({
    key,
    value: of.length === 0 ? null : evaluateValue(of, decl.value),
    rows: of.length,
    state: 'full',
  });

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
      return { ...g, state: g.rows === 0 ? 'empty' : key >= current ? 'partial' : 'full' };
    });
    return { groups, current, more: run.more };
  }

  const byValue = new Map<string, Entry[]>();
  for (const e of held) {
    const key = String(e.fields[by]);
    byValue.set(key, [...(byValue.get(key) ?? []), e]);
  }
  const groups = [...byValue.entries()].map(([key, of]) => part(key, of)).sort(largestFirst);
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
  return template
    .replace(/\{\{\s*([a-z][a-z0-9_-]*)\s*\}\}/gu, (_, id: string) => said(id) ?? '—')
    .replace(/(^|[^\d.,])(\d[\d,]*) ([A-Za-z]+)\(s\)/gu, (_, lead: string, n: string, word: string) => `${lead}${n} ${n === '1' ? word : `${word}s`}`)
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
