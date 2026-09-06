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

import { integer, money } from 'braindog-render';

import { LOOKUPS, NOW, REGISTERS, ROWS } from './data.ts';
import { amountOf, currencyOf, mixedFix } from './money.ts';
import { compile, explain, matches } from './where.ts';
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
  compare?: 'previous' | 'none';
};

/* ── evaluating one ──────────────────────────────────────────────────────── */

export type Reading = {
  /** `null` when the metric could not be read; `refusals` says why. */
  value: number | null;
  shown: string;
  rows: number;
  /** The proportional change against the shifted window, or `null` when it is not comparable. */
  delta: number | null;
  /** Why there is no delta, in words, so an absent comparison is not an absent explanation. */
  why: string;
  refusals: string[];
  href: string;
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
  if (typeof op === 'string') return amountOf(e.fields[op]);
  const [field, { lookup, by }] = op.product;
  const base = operand(e, field);
  const factor = LOOKUPS[lookup]?.[String(e.fields[by] ?? '')];
  return base === null || factor === undefined ? null : base * factor;
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
  for (const e of rows) {
    const c = currencyOf(e.fields[id]);
    if (c) seen.add(c);
  }
  return seen;
}

/** Every currency any operand of this value expression reads. */
export function currenciesRead(rows: Entry[], value: Value): Set<string> {
  if ('ratio' in value) return pairCurrencies(rows, value.ratio);
  if ('diff' in value) return pairCurrencies(rows, value.diff);
  return currenciesOf(rows, value);
}

const pairCurrencies = (rows: Entry[], pair: { of: Aggregation; per: Aggregation }): Set<string> =>
  new Set([...currenciesOf(rows, pair.of), ...currenciesOf(rows, pair.per)]);

function aggregate(rows: Entry[], agg: Aggregation): number | null {
  if ('count' in agg)
    return agg.count === 'id' ? rows.length : rows.filter((e) => operand(e, agg.count) !== null).length;
  if ('distinct' in agg) {
    /* `JSON.stringify` RATHER THAN `String`, and absent rows dropped. `String({ amount, currency })`
       is `'[object Object]'`, so every money value in a register collapsed to ONE distinct value —
       three invoices of different amounts counted as one — and a row with no value at all
       contributed `''` as a value of its own. Absent is not a value, which is the rule `count` one
       line up already follows. */
    const seen = new Set<string>();
    for (const e of rows) {
      const v = e.fields[agg.distinct];
      if (v === undefined || v === null || v === '') continue;
      seen.add(JSON.stringify(v));
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
  const w = compile(register, decl.where);
  const chips = w.clauses.map((c) =>
    'values' in c
      ? `${c.field}:${c.op === 'is not' ? 'not-in' : 'in'}:${c.values.map(encodeURIComponent).join(',')}`
      : `${c.field}:${c.op}:${encodeURIComponent(c.day)}`,
  );
  return chips.length ? `/r/${register}?${chips.map((f) => `f=${f}`).join('&')}` : `/r/${register}`;
}

/** Does this predicate mention time at all? Without one, the shifted window is the same rows. */
const dated = (where: string | undefined, register: string): boolean =>
  compile(register, where).clauses.some((c) => !('values' in c));

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
const READS_KEY = new Set(['metric', 'name', 'source', 'where', 'value', 'format', 'target', 'window', 'compare']);

/** The formats this build writes. A format it does not know printed the bare number. */
const READS_FORMAT = ['int', 'pct', 'days', 'decimal'];

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
      out.push(`${key}: is published in 08 and not read by this build — the figure would be the ungrouped one`);

  const value = decl.value as Record<string, unknown> | undefined;
  if (!value || typeof value !== 'object') out.push('value: is missing');
  else if (!('ratio' in value) && !('diff' in value)) {
    const named = Object.keys(value);
    if (!named.some((k) => READS_AGGREGATION.includes(k)))
      out.push(`value: ${named.join(', ') || 'nothing'} — this build reads ${READS_AGGREGATION.join(' · ')}`);
  } else {
    const pair = ('ratio' in value ? value.ratio : value.diff) as { of?: object; per?: object } | undefined;
    for (const side of ['of', 'per'] as const) {
      const agg = pair?.[side];
      if (!agg || !Object.keys(agg).some((k) => READS_AGGREGATION.includes(k)))
        out.push(`value.${side}: this build reads ${READS_AGGREGATION.join(' · ')}`);
    }
  }

  if (decl.format && !decl.format.startsWith('money.') && !READS_FORMAT.includes(decl.format))
    out.push(`format: ${decl.format} — this build writes money.<CUR> · ${READS_FORMAT.join(' · ')}`);

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
  if (isTemplate(decl)) refusals.push(`${decl.metric}: is a template — read it as ${decl.metric}:<name>`);

  /* THE SHAPE OF THE TARGET, not only its presence. `docs/08` writes it three times as
     `{ lte: { amount, currency } }`, and a target of an object compared with `<=` is neither true
     nor false — it printed `target ≤ GBP NaN` under a `warn` glyph, with no refusal at all. That is
     the exact class this file exists to prevent, in the file that prevents it. */
  const bound = decl.target && ('lte' in decl.target ? decl.target.lte : decl.target.gte);
  if (decl.target && typeof bound !== 'number')
    refusals.push(
      `${decl.metric}: target takes a number in the figure's own units — { lte: 400000 } for money in minor units, not { lte: { amount, currency } }`,
    );

  /* AND THE AGGREGATION. `08` §2.2 publishes eleven and this build reads six; the other five reached
     the field picker as `undefined` and threw a TypeError, which the page then reported as "this
     block's filter was not understood" — the filter was fine. `group_by`, `bucket` and `snapshot`
     are published too, and were ignored in silence, which is worse: the figure that came back was
     the UNGROUPED one, drawn under a heading that says it is grouped. */
  refusals.push(...unreadable(decl).map((r) => `${decl.metric}: ${r}`));

  const shift = decl.window ? windowMs(decl.window) : null;
  if (decl.window && shift === null)
    refusals.push(`${decl.metric}: ${decl.window} is not a window — write 30d, 4w or 3m`);

  if (register && REGISTERS[register])
    refusals.push(...explain(compile(register, decl.where)).map((r) => `${decl.metric}: ${r}`));

  if (refusals.length || !register)
    return { value: null, shown: '—', rows: 0, delta: null, why: refusals[0] ?? '', refusals, href: '/p/money' };

  const w = compile(register, decl.where);
  const all = ROWS[register] ?? [];
  const rows = all.filter((e) => matches(e, w, now));

  /* TWO CURRENCIES ARE NEVER ADDED, and this is the line that would have added them. A tile is one
     figure with one code beside it; a sum across two is a number of the right size in the wrong
     unit, and there is no screen on which anybody notices. */
  const seen = currenciesRead(rows, decl.value);
  if (seen.size > 1) {
    const why = `${decl.metric}: ${mixedFix([...seen].sort())}`;
    return { value: null, shown: '—', rows: rows.length, delta: null, why, refusals: [why], href: hrefFor(decl) };
  }

  /* AND THE FORMAT IS CHECKED AGAINST THEM. `format: money.GBP` is a declaration about how to write
     the figure; the rows are what it is a figure OF. When they disagree the declaration is wrong,
     and printing the rows' number under the declaration's code is the quiet version of that. */
  const declared = decl.format?.startsWith('money.') ? decl.format.slice('money.'.length) : null;
  const held = [...seen][0];
  if (declared && held && declared !== held) {
    const why = `${decl.metric}: the rows are in ${held} and the format says ${declared}`;
    return { value: null, shown: '—', rows: rows.length, delta: null, why, refusals: [why], href: hrefFor(decl) };
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
    return { value: null, shown: '—', rows: rows.length, delta: null, why, refusals: [why], href: hrefFor(decl) };
  }

  const value = evaluateValue(rows, decl.value);

  let delta: number | null = null;
  let why = '';
  if (decl.compare === 'none' || shift === null) why = 'no comparison asked for';
  else if (shift < 7 * DAY_MS) why = 'a window under seven days is noise';
  else if (!dated(decl.where, register)) why = 'the predicate does not mention time, so the window moves nothing';
  else {
    const before = all.filter((e) => matches(e, w, now - shift));
    if (rows.length === 0 || before.length === 0) why = 'one of the two windows is empty';
    else if (before.length * 2 < rows.length) why = 'the window before has under half the rows';
    else {
      const prior = evaluateValue(before, decl.value);
      if (prior === null || prior === 0 || value === null) why = 'the window before has nothing to compare against';
      else {
        delta = (value - prior) / Math.abs(prior);
        why = `on the ${decl.window} before`;
      }
    }
  }

  return { value, shown: format(decl.format, value), rows: rows.length, delta, why, refusals: [], href: hrefFor(decl) };
}

/** Is the figure on the right side of what was declared as good? */
export function meetsTarget(decl: MetricDecl, value: number | null): boolean | null {
  if (value === null) return null;
  return 'lte' in decl.target ? value <= decl.target.lte : value >= decl.target.gte;
}

/** The target, in the same words the figure is written in. */
export const targetLine = (decl: MetricDecl): string =>
  'lte' in decl.target
    ? `target ≤ ${format(decl.format, decl.target.lte)}`
    : `target ≥ ${format(decl.format, decl.target.gte)}`;
