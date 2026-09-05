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
import { no, ok } from '@braindog/ports';
import { compile, jsonPath, parseWhere, type Predicate, type Schema } from '@braindog/where';

/** The six this build reads. The other five are `08` §2.2's and are refused by name. */
export const AGGREGATIONS = ['sum', 'count', 'avg', 'min', 'max', 'distinct'] as const;
export type Aggregation =
  | { sum: string }
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
  compare?: 'previous' | 'none' | undefined;
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
const UNREAD = ['last', 'delta', 'median', 'product', 'group_by', 'bucket', 'running', 'trend', 'lookup'] as const;

export type EvalContext = {
  nowMs: number;
  /** The register's declared fields, so a predicate and a field expression check against one shape. */
  schemaOf: (register: string) => Schema | null;
  /** A ref written by name: `thing is Kiln`. Absent means a sentence cannot name one. */
  refByTitle?: ((register: string, title: string) => string | null) | undefined;
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
  if (typeof where !== 'string') return { predicate: where, bad: [] };
  return parseWhere(where, schema, {
    nowMs: ctx.nowMs,
    ...(ctx.refByTitle === undefined ? {} : { refByTitle: ctx.refByTitle }),
  });
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

  for (const word of UNREAD)
    if (JSON.stringify(decl.value).includes(`"${word}"`))
      at('UNIMPLEMENTED', `${word} is a published shape this build does not read, so its figure would be the ungrouped one`, 'value');

  const fields = aggregationsOf(decl.value);
  if (fields.length === 0) at('VALUE_MALFORMED', 'a value is an aggregation, a ratio or a diff', 'value');
  if (schema)
    for (const f of fields)
      if (f.field !== 'id' && !Object.hasOwn(schema.fields, f.field))
        at('FIELD_UNKNOWN', `${register} has no field called ${f.field}`, 'value');
      else if (!AGGREGATIONS.includes(f.kind as (typeof AGGREGATIONS)[number]))
        at('UNIMPLEMENTED', `${f.kind} is not an aggregation this build reads`, 'value');

  const said = schema ? predicateOf(decl.where, schema, ctx) : { predicate: undefined, bad: [] };
  refusals.push(...said.bad);
  if (schema && said.predicate) refusals.push(...compile(said.predicate, schema).bad);

  if (refusals.length || !schema) return { ok: false, refusal: refusals[0]! };

  const now = read(sql, said.predicate, schema, decl);
  if (!now.ok) return now;

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
    const shifted = predicateOf(decl.where, schema, { ...ctx, nowMs: ctx.nowMs - shift });
    const moved = JSON.stringify(shifted.predicate) !== JSON.stringify(said.predicate);
    const before = read(sql, shifted.predicate, schema, decl);

    if (!before.ok) why = before.refusal.fix;
    else if (!moved) {
      /* A SET COMPARED WITH ITSELF IS NOT NO CHANGE. The delta would be structurally zero, and
         reporting that as "steady" is a fact about the arithmetic dressed as a fact about the
         business — which is worse than saying nothing, because somebody would act on it. */
      why = 'the predicate does not mention time, so the window moves nothing';
    } else if (now.value.rows === 0 || before.value.rows === 0) why = 'one of the two windows is empty';
    else if (before.value.rows * 2 < now.value.rows) why = 'the window before has under half the rows';
    else if (before.value.value === null || now.value.value === null || before.value.value === 0)
      why = 'the window before has nothing to compare against';
    else delta = (now.value.value - before.value.value) / before.value.value;
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

function read(sql: Sql, predicate: Predicate | undefined, schema: Schema, decl: MetricDecl): Result<Read> {
  const w = compile(predicate, schema);
  if (w.bad.length) return { ok: false, refusal: w.bad[0]! };

  const where = `register = ? AND deleted_at IS NULL AND ${w.sql}`;
  const params: (string | number)[] = [schema.register, ...w.params];

  if ('ratio' in decl.value || 'diff' in decl.value) {
    const pair = 'ratio' in decl.value ? decl.value.ratio : decl.value.diff;
    const of = one(sql, schema, pair.of, where, params);
    const per = one(sql, schema, pair.per, where, params);
    if (!of.ok) return of;
    if (!per.ok) return per;
    const a = of.value.value;
    const b = per.value.value;
    /* A ZERO DENOMINATOR IS NOT A NUMBER. Never `0`, never infinity, never `NaN` — the em dash, and
       the numerator is still on the row behind it. */
    const value = a === null || b === null ? null : 'ratio' in decl.value ? (b === 0 ? null : a / b) : a - b;
    return ok({ value, unit: 'ratio' in decl.value ? null : of.value.unit, rows: of.value.rows, refusals: [] });
  }

  return one(sql, schema, decl.value, where, params);
}

/** One aggregation, as one SELECT. Money groups by currency; everything else is a scalar. */
function one(sql: Sql, schema: Schema, agg: Aggregation, where: string, params: (string | number)[]): Result<Read> {
  const [kind, field] = Object.entries(agg)[0] as [string, string];
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

  if (kind === 'distinct')
    return ok({
      value: Number(sql.one<{ n: number }>(`SELECT count(DISTINCT ${expr}) AS n FROM entry WHERE ${where}`, ...params)?.n ?? 0),
      unit: null,
      rows,
      refusals: [],
    });

  const fn = kind === 'sum' ? 'sum' : kind === 'avg' ? 'avg' : kind === 'min' ? 'min' : 'max';

  /* MONEY AND QUANTITY CARRY THEIR UNIT INTO THE GROUP BY. The rule is one line — two currencies are
     never added — and this is the line that would have added them: one SUM over a column of amounts
     is a figure of the right size in whatever unit happened to be commonest. */
  if (type === 'money' || type === 'quantity') {
    const unitExpr = `json_extract(fields, '${jsonPath(field)}.${type === 'money' ? 'currency' : 'unit'}')`;
    const groups = sql.all<{ u: string | null; v: number | null; n: number }>(
      `SELECT ${unitExpr} AS u, ${fn}(${expr}) AS v, count(${expr}) AS n FROM entry WHERE ${where} AND ${expr} IS NOT NULL GROUP BY u ORDER BY u`,
      ...params,
    );
    if (groups.length === 0) return ok({ value: kind === 'sum' ? 0 : null, unit: null, rows, refusals: [] });
    if (groups.length > 1)
      return no<Read>(
        'MIXED_CURRENCY',
        `these rows are in ${groups.map((g) => g.u ?? 'no unit').join(' and ')}, and two ${type === 'money' ? 'currencies' : 'units'} are never added`,
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

/** Every aggregation a value expression reads, with the field each names. */
function aggregationsOf(value: Value): { kind: string; field: string }[] {
  const flat = (agg: Aggregation): { kind: string; field: string }[] => {
    const entry = Object.entries(agg)[0];
    return entry && typeof entry[1] === 'string' ? [{ kind: entry[0], field: entry[1] }] : [];
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
export function scorePrediction(
  sql: Sql,
  id: string,
  ctx: EvalContext,
  deps: { mint: () => string; nowAt: string },
): Result<Scored> {
  const row = sql.one<{ id: string; claim: string; measure: string; target: string; window: string; on_miss: string }>(
    'SELECT id, claim, measure, target, window, on_miss FROM prediction WHERE id = ? AND scored_at IS NULL',
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

  const observed = reading.value.value;
  const met = observed === null ? null : meets(observed, targetOf(row.target));

  sql.exec(
    'UPDATE prediction SET scored_at = ?, observed = ?, met = ? WHERE id = ?',
    deps.nowAt,
    observed === null ? null : Math.round(observed),
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

  return ok({ id, observed, met });
}

/**
 * The target as a bound.
 *
 * `<= 20` and `20` are the same claim written two ways, and a prediction written as a bare number
 * means "at least this" — which is what `gte` is. A leading operator says otherwise.
 */
export function targetOf(text: string): { lte: number } | { gte: number } {
  const t = text.trim();
  if (t.startsWith('<=') || t.startsWith('≤')) return { lte: Number(t.replace(/^(<=|≤)/, '')) };
  if (t.startsWith('<')) return { lte: Number(t.slice(1)) };
  if (t.startsWith('>=') || t.startsWith('≥')) return { gte: Number(t.replace(/^(>=|≥)/, '')) };
  if (t.startsWith('>')) return { gte: Number(t.slice(1)) };
  return { gte: Number(t) };
}
