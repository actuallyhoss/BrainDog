/**
 * `43 §5.1` — one arrival in, one `Extraction` out, in nine steps and in that order.
 *
 * THE ORDER IS THE CONTRACT, not an implementation detail. A body over the cap is answered before it is
 * parsed, a skip is answered before any field is read, and routing happens after the fields exist because it
 * reads them. Each step can only see what the ones before it settled, which is what makes the answer the
 * same every time for the same arrival.
 *
 * NOTHING HERE THROWS ON A STRANGER'S BODY. Every bad input is an outcome with a reason a person can act on.
 * The only throws in this package come from a DECLARATION that is outside the grammar, and `declare` has
 * already refused those at install; they are defence in depth rather than a path anyone should reach.
 *
 * A REASON CARRIES FIELD IDS, OUTCOME WORDS, INDICES AND COUNTS, AND NEVER A VALUE. `inbox_raw.reason` is
 * read on a review screen and copied into support threads, and the arrival it describes is somebody's bank
 * message. "amount invalid" is actionable; "could not read EGP 1,250.00 from ..." is the statement leaking
 * one line at a time. This is the one rule in the file worth a test of its own.
 */

import { mapField, type MapDeps, type Mapping } from '@braindog/kernel';
import type { Json } from '@braindog/where';

import { matches, skipReason, subjectOf, type Matchable, type RawArrival } from './arrival.ts';
import { fold, normalise, run, type Form, type RunCtx } from './extractors.ts';
import { readRows, UNPARSEABLE, type Format, type Read } from './formats.ts';

export type Fields = Record<string, Json>;
export type Confidence = 'exact' | 'proposed' | 'needs-review';
export type FieldOutcome = 'exact' | 'chosen' | 'defaulted' | 'missing' | 'ambiguous' | 'invalid';

export type Route = { by: string[]; to: { when: string[]; register: string }[] };

export type Declaration = Matchable & {
  id: string;
  extract?: Record<string, Form>;
  map?: Record<string, Mapping>;
  fetch?: { read?: Read };
  writes: { register: string | Route; confidence?: Confidence } | { series: string; kind: string };
};

export type ExtractCtx = RunCtx & MapDeps & {
  now: number;
  tz: string;
  maxRows?: number;
  /** Field types by id, so `map:`'s `arrived: true` knows whether a day or an instant was asked for. */
  types?: Record<string, string>;
};

export type ExtractedRow = {
  fields: Fields;
  confidence: Confidence;
  outcome: Record<string, FieldOutcome>;
  register?: string;
};

export type Receipt = {
  ingest_id: string;
  raw_id: string;
  confidence: Confidence;
  rows: number;
  fields: Record<string, FieldOutcome>;
  wrote: string[];
};

export type Extraction = {
  rows: ExtractedRow[];
  confidence: Confidence;
  skipped?: string;
  reason?: string;
  receipt?: Receipt;
};

/** `25 §7` rule 7, the row and BLOB ceiling. */
const BODY_BYTES_MAX = 2_000_000;
const ROWS_MAX = 5_000;
/** `§5.1` step 9: eight items, then a count. A reason is read on a screen, not parsed. */
const REASON_ITEMS = 8;

/* ── the two orderings ───────────────────────────────────────────────────── */

const CONFIDENCE_ORDER: Confidence[] = ['exact', 'proposed', 'needs-review'];

/** The worse of two, on `exact > proposed > needs-review`. */
const worse = (a: Confidence, b: Confidence): Confidence =>
  CONFIDENCE_ORDER.indexOf(a) >= CONFIDENCE_ORDER.indexOf(b) ? a : b;

/**
 * `§5.1` step 9's severity, which is NOT step 7's order and must not be confused with it.
 *
 * Step 7 asks what a row's outcomes make of the row; this asks which of two outcomes for the same field
 * across rows the receipt should show. `invalid` beats `ambiguous` because a value that was there and was
 * wrong tells a person more than two values that were both plausible.
 */
const SEVERITY: FieldOutcome[] = ['exact', 'chosen', 'defaulted', 'missing', 'ambiguous', 'invalid'];
const worseOutcome = (a: FieldOutcome, b: FieldOutcome): FieldOutcome =>
  SEVERITY.indexOf(a) >= SEVERITY.indexOf(b) ? a : b;

const REVIEWABLE = new Set<FieldOutcome>(['missing', 'ambiguous', 'invalid']);
const JUDGED = new Set<FieldOutcome>(['chosen', 'defaulted']);

/** `§5.1` step 7. */
function rowConfidence(outcome: Record<string, FieldOutcome>): Confidence {
  const all = Object.values(outcome);
  if (all.some((o) => REVIEWABLE.has(o))) return 'needs-review';
  if (all.some((o) => JUDGED.has(o))) return 'proposed';
  return 'exact';
}

/* ── the answers that stop the run ───────────────────────────────────────── */

const stop = (reason: string): Extraction => ({ rows: [], confidence: 'needs-review', reason });

/* ── step 6, routing ─────────────────────────────────────────────────────── */

/**
 * The register a row is written to: a name, or the first `when` tuple that matches.
 *
 * A MISS IS `needs-review` AND NOT A DEFAULT. A route exists because two kinds of row go to two places, so
 * the one the author did not anticipate is precisely the one nobody should guess at: writing it to the first
 * register would put a credit among the debits, quietly, and only sometimes.
 *
 * THE `by` VALUES ARE READ AS STRINGS, including `<money field>.currency`, because `when` tuples are written
 * in YAML where `EGP` and `840` are both text to the author.
 */
function routeOf(writes: Declaration['writes'], fields: Fields): { register?: string; miss?: string } {
  if (!('register' in writes)) return {};
  if (typeof writes.register === 'string') return { register: writes.register };

  const route = writes.register;
  const read = (by: string): string | undefined => {
    const dot = by.indexOf('.');
    if (dot === -1) {
      const v = fields[by];
      return v === undefined || v === null ? undefined : String(v);
    }
    const holder = fields[by.slice(0, dot)];
    const key = by.slice(dot + 1);
    if (holder === null || typeof holder !== 'object' || Array.isArray(holder)) return undefined;
    const v = (holder as Record<string, Json>)[key];
    return v === undefined || v === null ? undefined : String(v);
  };

  const got = route.by.map(read);
  for (const arm of route.to)
    if (arm.when.length === got.length && arm.when.every((w, i) => w === got[i])) return { register: arm.register };
  return { miss: `route miss on ${route.by.join(', ')}` };
}

/* ── step 9, the reason ──────────────────────────────────────────────────── */

/**
 * `needs-review: <field> <outcome>` items, capped at eight then counted.
 *
 * ONE ROW IS NAMED WITHOUT AN INDEX AND MANY ROWS WITH ONE. A single-row arrival saying "row 0 amount
 * missing" reads as though there were others.
 *
 * A ROUTE MISS IS AN ITEM AND NOT A FALLBACK. Step 9 gives a grammar for fields and says nothing about the
 * route, and the first reading was to use the miss only when no field was in review. That costs a person a
 * round trip: they fix the missing field, the arrival comes back to review, and the sentence they now see
 * was true the first time. Both go in the list, under the same cap.
 */
function reasonFor(rows: ExtractedRow[], routeMiss?: string): string | undefined {
  const items: string[] = [];
  const many = rows.length > 1;
  rows.forEach((row, i) => {
    for (const [field, outcome] of Object.entries(row.outcome))
      if (REVIEWABLE.has(outcome)) items.push(many ? `row ${i} ${field} ${outcome}` : `${field} ${outcome}`);
  });
  if (routeMiss !== undefined) items.push(routeMiss);
  if (items.length === 0) return undefined;
  const shown = items.slice(0, REASON_ITEMS);
  const rest = items.length - shown.length;
  return `needs-review: ${shown.join('; ')}${rest > 0 ? `; +${rest} more` : ''}`;
}

/* ── the nine steps ──────────────────────────────────────────────────────── */

export function extract(decl: Declaration, raw: RawArrival, ctx: ExtractCtx): Extraction {
  /* 1. Cap. THE ENCODED LENGTH AND NOT `body.length`: `25 §7` rule 7 is a BLOB ceiling in bytes, and a body
        of emoji is twice the characters it looks like. Measuring the wrong one lets a body through that the
        row cannot hold, which fails later and somewhere else. */
  const bytes = new TextEncoder().encode(raw.body).length;
  if (bytes > BODY_BYTES_MAX) return stop(`body too large (${bytes} bytes; the cap is ${BODY_BYTES_MAX})`);

  /* 2. Skip. An arrival this ingest owns but declines: `exact`, no receipt, nothing written. It is not a
        review, because declining was the declared intent. */
  const skipped = skipReason(decl, raw);
  if (skipped !== undefined) return { rows: [], confidence: 'exact', skipped };

  /* 3. Rows in. */
  const format: Format = decl.fetch?.read?.format ?? 'text';
  const maxRows = ctx.maxRows ?? ROWS_MAX;
  let bodies: Json[];
  if (format === 'text') bodies = [raw.body];
  else {
    const got = readRows(raw.body, format, decl.fetch?.read);
    if (got === UNPARSEABLE) return stop(`body unparseable as ${format}`);
    /* OVER THE CAP IS KEPT RAW AND NEVER TRUNCATED (`07 §2`). Answering the first five thousand with no way
       to say so is the silent wrong answer this rule exists to prevent. */
    if (got.length > maxRows) return stop(`rows over cap (${got.length}; the cap is ${maxRows})`);
    bodies = got;
  }

  /* 4 and 5. */
  const rows: ExtractedRow[] = bodies.map((body) => readOne(decl, body, format, ctx));

  /* 6. Route, per row. */
  let routeMiss: string | undefined;
  for (const row of rows) {
    const { register, miss } = routeOf(decl.writes, row.fields);
    if (register !== undefined) row.register = register;
    if (miss !== undefined) {
      row.confidence = 'needs-review';
      routeMiss ??= miss;
    }
  }

  /* 8. The worst row, then the ceiling. ZERO ROWS FROM A PARSEABLE BODY IS `exact`: an empty page is not a
        review, and answering otherwise would put every quiet poll in front of a person. */
  const ceiling: Confidence = ('register' in decl.writes ? decl.writes.confidence : undefined) ?? 'exact';
  let confidence: Confidence = 'exact';
  for (const row of rows) confidence = worse(confidence, row.confidence);
  /* THE CEILING ONLY APPLIES WHERE THERE IS SOMETHING TO CAP. `§5.1` step 8 says both that the ceiling
     lowers the arrival and that zero rows from a parseable body is `exact`, and with `writes.confidence:
     proposed` those two disagree. The explicit sentence wins, and its reason decides it: a poll that found
     nothing has produced no judgement to be unsure about, so marking it `proposed` would put a quiet
     Tuesday in the same tray as a reading somebody has to check. */
  if (rows.length > 0) confidence = worse(confidence, ceiling);

  /* 9. Receipt and reason. */
  const fields: Record<string, FieldOutcome> = {};
  for (const row of rows)
    for (const [field, outcome] of Object.entries(row.outcome))
      fields[field] = Object.hasOwn(fields, field) ? worseOutcome(fields[field]!, outcome) : outcome;

  const receipt: Receipt = {
    ingest_id: decl.id,
    raw_id: raw.id,
    confidence,
    rows: rows.length,
    fields,
    wrote: [],
  };

  const reason = confidence === 'needs-review' ? reasonFor(rows, routeMiss) : undefined;
  return { rows, confidence, receipt, ...(reason === undefined ? {} : { reason }) };
}

/**
 * Steps 4 and 5 for one row.
 *
 * NORMALISATION IS FOR TEXT ROWS ONLY. A structured row's values came out of a parser that already decided
 * what the bytes meant, and collapsing spaces inside a CSV cell would edit a value rather than tidy a
 * message.
 *
 * CASE IS FOLDED ON A PARALLEL COPY AND NEVER IN A VALUE. `folded` and `text` have equal length by
 * construction, so an index found in one is the same index in the other; that equality is what lets an
 * anchor be matched case-insensitively while the value keeps the case the provider sent.
 */
function readOne(decl: Declaration, body: Json, format: Format, ctx: ExtractCtx): ExtractedRow {
  const fields: Fields = {};
  const outcome: Record<string, FieldOutcome> = {};

  if (format === 'text') {
    const text = normalise(typeof body === 'string' ? body : String(body));
    const folded = fold(text);
    for (const [field, form] of Object.entries(decl.extract ?? {})) {
      const found = run(form, text, folded, ctx, `extract.${field}`);
      if (found === 'ambiguous') {
        outcome[field] = 'ambiguous';
        continue;
      }
      if (found.values.length === 0) {
        outcome[field] = 'missing';
        continue;
      }
      fields[field] = found.values[0]!;
      outcome[field] = found.note;
    }
    return { fields, confidence: rowConfidence(outcome), outcome };
  }

  /* `map:` — `43 §4.5`'s coercion, which lives in `packages/kernel/src/map.ts`. `extract` is rank 9 and
     `kernel` is 7, so this edge points down (`31 §2`), and calling it is what keeps one coercion table
     rather than two that drift. */
  const arrivedAt = new Date(ctx.now).toISOString();
  for (const [field, mapping] of Object.entries(decl.map ?? {})) {
    const got = mapField(ctx, mapping, body, arrivedAt, ctx.types?.[field]);
    outcome[field] = got.outcome;
    /* A REFUSED FIELD HAS NO VALUE RATHER THAN A NULL ONE. `§4.1` says a missing field is absent and never
       null, because a row written with `amount: null` reads as a real zero-ish value to everything
       downstream, where an absent key reads as the absence it is. */
    if (got.outcome === 'exact' || got.outcome === 'defaulted') fields[field] = got.value as Json;
  }
  return { fields, confidence: rowConfidence(outcome), outcome };
}

export { matches, subjectOf };
