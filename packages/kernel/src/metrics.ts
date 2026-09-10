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
 * TWO CURRENCIES ARE NEVER ADDED. A money sum groups by currency in SQL and refuses when more than
 * one group comes back: a total across two is a number of the right size in the wrong unit, sitting
 * in a tile with a code beside it, and there is no screen on which anybody notices.
 *
 * WHAT IS NOT HERE IS REFUSED BY NAME. `group_by`, `bucket`, `running`, `trend`, `last`, `median`
 * and the `lookup` product are published shapes with no consumer in this build. Reading one and
 * quietly returning the ungrouped figure would be a number under a heading that says it is grouped,
 * which is worse than an em dash.
 */

import type { Refusal, Result, Sql } from '@braindog/ports';
import { fixOf, no, ok } from '@braindog/ports';
import { compile, jsonPath, parseWhere, resolveDay, type Predicate, type Schema } from '@braindog/where';

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
  /** `register.<id>`. A `series.<id>` source reads `metric_point`, which this build does not. */
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
  /** `money.GBP`, `int`, `pct`, `days`. It says how to WRITE the figure, never what it is of. */
  format?: string | undefined;
};

export type Reading = {
  value: number | null;
  /** The currency the rows were in, when they were money. `null` for a plain figure. */
  unit: string | null;
  rows: number;
  /** `(value − prior) / prior`, or `null` with `why` naming the clause that stopped it. */
  delta: number | null;
  why: string;
  met: boolean | null;
  refusals: Refusal[];
};

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
 */
const yearBefore = (nowMs: number): number => {
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
  /** The register's declared fields, so a predicate and a field expression check against one shape. */
  schemaOf: (register: string) => Schema | null;
  /** A ref written by name: `thing is Kiln`. Absent means a sentence cannot name one. */
  refByTitle?: ((register: string, title: string) => string | null) | undefined;
  /** The named factor tables a `product` reads. Absent means a `lookup` cannot be resolved. */
  lookups?: Record<string, Record<string, number>> | undefined;
};

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
  const nowMs = ctx.asOfMs ?? ctx.nowMs;
  if (typeof where !== 'string') return resolveRelative(where, schema, nowMs);
  return parseWhere(where, schema, {
    nowMs,
    ...(ctx.refByTitle === undefined ? {} : { refByTitle: ctx.refByTitle }),
  });
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

  const one = (field: string, value: unknown): unknown => {
    if (typeof value !== 'string') return value;
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
       every instant there has ever been. Two renderings of one grammar, and they agree. */
    const type = field && Object.hasOwn(schema.fields, field) ? schema.fields[field]?.type : undefined;
    if (!field || (type !== 'day' && type !== 'instant')) return node;

    const op = DATED.find((o) => o in leaf);
    if (!op) return node;
    const value = leaf[op];
    return {
      ...leaf,
      [op]: Array.isArray(value) ? value.map((v) => one(field, v)) : one(field, value),
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
  if (decl.target && typeof bound !== 'number')
    at('VALUE_MALFORMED', "target takes a number in the figure's own units — { lte: 400000 } for money in minor units", 'target');

  if (!decl.window) at('REQUIRED_MISSING', 'a number with no comparison window is a number you cannot act on', 'window');
  const shift = decl.window ? windowMs(decl.window) : null;
  if (decl.window && shift === null) at('VALUE_MALFORMED', `${decl.window} is not a window — write 30d, 4w or 3m`, 'window');

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
   * AND THE BODY'S OWN KEYS, BECAUSE THE WALK ABOVE FIRED WHERE NOBODY WRITES THEM.
   *
   * `keysOf(decl.value)` reads inside the value expression, and `group_by` and `bucket` are not
   * there: `42 §4.9` and `declare.ts`'s `metricBody` both put them at the TOP LEVEL of a metric
   * body, and `MetricDecl` above has no field for either — so a stored body carrying one arrives
   * here as an extra key nothing looks at. Driven over three rows summing GBP 700:
   *
   *     plain sum, no group_by                       {"value":700,"rows":3,"refusals":0}
   *     group_by: 'party' (the documented spelling)  {"value":700,"rows":3,"refusals":0}
   *     group_by inside value (the checked place)    REFUSED NOT_IN_THIS_BUILD
   *
   * The comment above is precise about the harm — *"its figure would be the ungrouped one"* — and
   * that is exactly what came back, with no refusal beside it.
   *
   * `declare.ts` NOW REFUSES THE DECLARATION, WHICH IS THE BETTER HALF AND IS NOT ALL OF IT: a
   * metric installed before that check existed is still in somebody's record, and this is the side
   * that reads it. Only the two shapes that can reach a body's top level are looked for, so a
   * register field called `trend` is still summable — the reason the `keysOf` walk exists.
   */
  const body = decl as unknown as Record<string, unknown>;
  for (const word of ['group_by', 'bucket'])
    if (body[word] !== undefined)
      at('NOT_IN_THIS_BUILD', `${word} is a published shape this build does not read, so its figure would be the ungrouped one`, word);

  const fields = aggregationsOf(decl.value);
  if (fields.length === 0) at('VALUE_MALFORMED', 'a value is an aggregation, a ratio or a diff', 'value');
  if (schema)
    for (const f of fields) {
      for (const id of [f.field, f.by].filter((x): x is string => typeof x === 'string'))
        if (id !== 'id' && !Object.hasOwn(schema.fields, id)) at('FIELD_UNKNOWN', `${register} has no field called ${id}`, 'value');
      if (!AGGREGATIONS.includes(f.kind as (typeof AGGREGATIONS)[number]))
        at('NOT_IN_THIS_BUILD', `${f.kind} is not an aggregation this build reads`, 'value');
      if (f.lookup && !ctx.lookups?.[f.lookup]) at('LOOKUP_UNKNOWN', `there is no factor table called ${f.lookup}`, 'value');
      if (f.lookup && f.kind !== 'sum') at('NOT_IN_THIS_BUILD', `a product is summed, and ${f.kind} is not a sum`, 'value');
    }

  const said = schema ? predicateOf(decl.where, schema, ctx) : { predicate: undefined, bad: [] };
  refusals.push(...said.bad);
  if (schema && said.predicate) refusals.push(...compile(said.predicate, schema).bad);

  if (refusals.length || !schema) return { ok: false, refusal: refusals[0]! };

  const now = read(sql, said.predicate, schema, decl, ctx.lookups);
  if (!now.ok) return now;

  /**
   * AND THE FORMAT IS CHECKED AGAINST THE ROWS, WHICH IT WAS NOT.
   *
   * `format: money.USD` is a declaration about how to WRITE the figure and the rows are what it is a
   * figure OF, so when they disagree the declaration is wrong. This side checked neither: a `sum` of
   * sterling invoices declared `money.USD` came back as a plain number with `unit: 'GBP'` and no
   * refusal, and every renderer in this product formats from `decl.format`, so it reached a screen
   * as USD 168,794.00 over rows that are in pounds. That is the worst class of defect this file
   * knows: a figure of the right size in the wrong currency, with nothing on the screen disagreeing
   * with anything else on it.
   *
   * THE BROWSER'S COPY OF THIS EVALUATOR HAS HAD THE CHECK ALL ALONG, one sentence and eight lines,
   * and a differential pass over the shipped seed is what found the two disagreeing. `50 §1` says
   * there should not be two engines; while there are, a check that lands on one of them is half a
   * check, and this is the half that was missing.
   */
  const declared = decl.format?.startsWith('money.') ? decl.format.slice('money.'.length) : null;
  if (declared && now.value.unit && declared !== now.value.unit)
    return no<Reading>(
      'MIXED_CURRENCY',
      `${decl.metric}: the rows are in ${now.value.unit} and the format says ${declared}.`,
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
    const moveTo = decl.compare === 'year_ago' ? yearBefore(ctx.nowMs) : ctx.nowMs - shift;
    const shifted = predicateOf(decl.where, schema, { ...ctx, nowMs: moveTo });
    const moved = JSON.stringify(shifted.predicate) !== JSON.stringify(said.predicate);
    const before = read(sql, shifted.predicate, schema, decl, ctx.lookups);

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

  return ok({
    ...now.value,
    delta,
    why,
    met: now.value.value === null || !decl.target ? null : meets(now.value.value, decl.target),
  });
}

/** Does the figure clear its target? A target is a bound, and `met` is a fact about one number. */
export const meets = (value: number, target: { lte: number } | { gte: number }): boolean =>
  'lte' in target ? value <= target.lte : value >= target.gte;

/* ── the scan ────────────────────────────────────────────────────────────── */

type Read = Omit<Reading, 'delta' | 'why' | 'met'>;

function read(
  sql: Sql,
  predicate: Predicate | undefined,
  schema: Schema,
  decl: MetricDecl,
  lookups?: Record<string, Record<string, number>> | undefined,
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
    const of = one(sql, schema, pair.of, where, params, lookups);
    const per = one(sql, schema, pair.per, where, params, lookups);
    if (!of.ok) return of;
    if (!per.ok) return per;
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
     * A CURRENCY IS THREE UPPER-CASE LETTERS, which is ISO 4217 and is what `money` stores in its
     * `currency` half. A `quantity` stores `h`, `d`, `m`: no unit this record can hold is spelled
     * like a currency and means something else, so the test is on the value rather than on a type
     * that would have to be threaded down through two aggregations to get here.
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
    const currency = (u: string | null | undefined) => typeof u === 'string' && /^[A-Z]{3}$/u.test(u);
    const said = (u: string | null | undefined) => typeof u === 'string' && u !== '';
    const clash = ratio
      ? currency(of.value.unit) && currency(per.value.unit) && of.value.unit !== per.value.unit
      : said(of.value.unit) && said(per.value.unit) && of.value.unit !== per.value.unit;
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
            `one half of this figure is in ${of.value.unit ?? 'no unit'} and the other in ${per.value.unit ?? 'no unit'}, and two currencies are never divided either`,
            { at: 'value' },
          )
        : no<Read>(
            'MIXED_CURRENCY',
            `one half of this figure is in ${of.value.unit ?? 'no unit'} and the other in ${per.value.unit ?? 'no unit'}, and two currencies are never subtracted either`,
            { at: 'value' },
          );

    const a = of.value.value;
    const b = per.value.value;
    /* A ZERO DENOMINATOR IS NOT A NUMBER. Never `0`, never infinity, never `NaN` — the em dash, and
       the numerator is still on the row behind it. */
    const value = a === null || b === null ? null : 'ratio' in decl.value ? (b === 0 ? null : a / b) : a - b;
    return ok({ value, unit: 'ratio' in decl.value ? null : of.value.unit, rows: of.value.rows, refusals: [] });
  }

  return one(sql, schema, decl.value, where, params, lookups);
}

/** One aggregation, as one SELECT. Money groups by currency; everything else is a scalar. */
function one(
  sql: Sql,
  schema: Schema,
  agg: Aggregation,
  where: string,
  params: (string | number)[],
  lookups?: Record<string, Record<string, number>> | undefined,
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
    return aggregate(sql, field, type, times, where, params, kind);
  }

  /* MONEY AND QUANTITY CARRY THEIR UNIT INTO THE GROUP BY. The rule is one line — two currencies are
     never added — and this is the line that would have added them: one SUM over a column of amounts
     is a figure of the right size in whatever unit happened to be commonest. */
  return aggregate(sql, field, type, expr, where, params, kind, fn, rows);
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
    if (groups.length > 1)
      /* AND A QUANTITY SAYS SO IN ITS OWN CODE. `04 §5` gives the unit case its own row, *"a
         `quantity` aggregation across units"*, with its own sentence: *"sums consumption across m,
         cm and g. Scope the predicate to one unit"*. The sentence below has said "units" since it
         was written and the code said `MIXED_CURRENCY`, which is a sentence about money attached to
         a figure about metres. */
      return money
        ? no<Read>(
            'MIXED_CURRENCY',
            `these rows are in ${groups.map((g) => g.u ?? 'no unit').join(' and ')}, and two currencies are never added`,
            { at: field, allowed: groups.map((g) => String(g.u ?? '')) },
          )
        : no<Read>(
            'QUANTITY_MIXED_UNIT',
            `these rows are in ${groups.map((g) => g.u ?? 'no unit').join(' and ')}, and two units are never added`,
            { at: field, allowed: groups.map((g) => String(g.u ?? '')) },
          );
    const only = groups[0]!;
    return ok({ value: only.v === null ? null : Number(only.v), unit: only.u, rows, refusals: [] });
  }

  const out = sql.one<{ v: number | null; n: number }>(
    `SELECT ${fn}(${expr}) AS v, count(${expr}) AS n FROM entry WHERE ${where}`,
    ...params,
  );
  /* AN AVERAGE, A MINIMUM AND A MAXIMUM OF NOTHING IS NOT ZERO. A sum of nothing is. */
  if (Number(out?.n ?? 0) === 0) return ok({ value: kind === 'sum' ? 0 : null, unit: null, rows, refusals: [] });
  return ok({ value: out?.v === null || out?.v === undefined ? null : Number(out.v), unit: null, rows, refusals: [] });
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
     that gets said. `system` opens it; nobody can answer their own question here. */
  if (met === false && row.on_miss === 'suggest' && deps.propose)
    deps.propose(
      {
        question: `${row.claim} — predicted ${row.target}, observed ${observed === null ? 'nothing' : observed}. Supersede that decision, or say why you are keeping it.`,
        body_kind: 'options',
        body: {
          options: [
            { id: 'supersede', label: 'Supersede it', because: 'the change did not do what it promised' },
            { id: 'keep', label: 'Keep it', because: 'the prediction was wrong about the world, not the change' },
          ],
          requires_reason: true,
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
   * The last instant of a local day, as a UTC timestamp.
   *
   * BY SEARCH RATHER THAN BY ARITHMETIC, because an offset is not a constant: a day that a
   * government moves the clock in is 23 or 25 hours long, and adding a fixed offset to midnight puts
   * the boundary an hour inside the neighbouring day twice a year. Starting from noon — which no
   * transition has ever crossed — and stepping to the last minute that still names this day is
   * arithmetic-free and correct in every zone.
   */
  const endOf = (ms: number): number => {
    const want = at(ms);
    let t = Date.parse(`${want}T12:00:00Z`);
    /**
     * AND NOON UTC IS ONLY INSIDE THE LOCAL DAY FOR OFFSETS BETWEEN MINUS TWELVE AND PLUS TWELVE.
     *
     * The paragraph above argues for noon because no clock change has ever crossed it, and that is
     * true of noon LOCAL. This seeded noon UTC, which in `Pacific/Auckland` is one o'clock the NEXT
     * morning: the walk then started in the wrong day and every instant it stepped to was in the
     * wrong day too, so a record at UTC+12 or east stamped today's local date on a reading taken
     * as of one in the morning and called it yesterday. The zone the comment above is written about
     * is the zone it was wrong in, and `provision.test.ts` admits Auckland as a record's timezone.
     *
     * A YYYY-MM-DD STRING ORDERS LIKE THE DATE IT IS, so stepping in hours towards the day that is
     * wanted needs no offset table and no arithmetic on a zone. It is at most fourteen steps.
     */
    while (at(t) > want) t -= 3_600_000;
    while (at(t) < want) t += 3_600_000;
    /* Forward in hours while it is still this day, then back off by a millisecond. */
    while (at(t + 3_600_000) === want) t += 3_600_000;
    while (at(t + 60_000) === want) t += 60_000;
    return t + 60_000 - 1;
  };

  /** Yesterday, locally: the last instant of the day before the local day `nowMs` falls in. */
  const yesterday = endOf(ctx.nowMs) - DAY;

  const write = (dayMs: number, overwrite: boolean): 'wrote' | 'kept' | 'missing' => {
    const day = at(dayMs);
    if (!overwrite && sql.one("SELECT 1 AS x FROM metric_point WHERE series = ? AND grain = 'day' AND at = ?", decl.metric, day))
      return 'kept';

    const read = evaluateMetric(sql, decl, { ...ctx, asOfMs: endOf(dayMs) });
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
    const out = write(yesterday - n * DAY, false);
    if (out === 'wrote') backfilled++;
    if (out === 'missing') missing++;
  }

  return ok({ series: decl.metric, wrote: today === 'wrote' ? 1 : 0, backfilled, missing });
}
