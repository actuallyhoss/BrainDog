/**
 * `map:`: a JSON answer read into one row by paths (`43 §4.4`, `§4.5`).
 *
 * WHAT A POLL OR A PULL FILLS A ROW WITH when the answer is JSON. `extract:` reads text with anchors, which is
 * right for an email and wrong for `{"data":{"mrr":4200}}`: an anchor finds the first `"mrr":` anywhere in the
 * document, and a path finds the one the declaration named. One entry per field, and each is one of three:
 *
 *   { path, type, from?, values?, other?, currency?, minor?, format? }   read from the answer
 *   { value: <literal> }                                                  stated by the declaration
 *   { arrived: true }                                                     the instant the answer arrived
 *
 * `value` is how a poll says which measure it is and which project it is for, facts the answer does not carry.
 * `arrived` is how it says when, for an answer that holds no time of its own. Neither reads a clock of its own:
 * the arrival's instant is the one the raw row is stored under.
 *
 * NOTHING HERE THROWS. A body that is not JSON reaches nothing, so every read field is missing, and the arrival
 * files for review with its bytes kept, as an unreadable email does.
 */

import { selectAll } from '@braindog/where';

import type { Json } from './index.ts';

/** `43 §4.5`'s types. `ref`, `file`, `secret`, `quantity` and `list` cannot be mapped from an answer. */
export const MAP_TYPES = ['text', 'int', 'decimal', 'money', 'day', 'instant', 'enum', 'bool', 'duration', 'url', 'email', 'document', 'json'] as const;
export type MapType = (typeof MAP_TYPES)[number];

export type Mapping =
  | {
      path: string | readonly [string, string];
      type: MapType;
      from?: 'epoch_s' | 'epoch_ms';
      minor?: boolean;
      currency?: string;
      format?: string;
      values?: readonly string[];
      other?: string;
    }
  | { value: Json }
  | { arrived: true };

/** `43 §4.5`: fifteen significant digits, past which a decimal is not the number that was sent. */
const SIGNIFICANT = 15;

/** One field read: its value, or `null`, and whether a declared `other:` stood in for it. */
export type Mapped = { value: Json | null; outcome: 'exact' | 'defaulted' | 'missing' | 'invalid' };

const MISSING: Mapped = { value: null, outcome: 'missing' };
/**
 * A VALUE WAS THERE AND COULD NOT BE READ, which is not the same as one that was not there.
 *
 * `43 §4.5`'s table says `invalid` for every type given something it cannot take, and this returned `missing`
 * for all of them. Both are `needs-review`, so no wrong row was ever written — but the receipt and the reason
 * are read by a person deciding what to do, and the two say opposite things. `missing` sends them to the
 * provider to ask why a field was not sent; `invalid` sends them to a value that WAS sent and that we could
 * not read, which is usually a format that changed. `invalid` also outranks `missing` in `§5.1` step 9's
 * severity, so collapsing them understated a field that was invalid in one row and absent in another.
 */
const INVALID: Mapped = { value: null, outcome: 'invalid' };
const exact = (value: Json): Mapped => ({ value, outcome: 'exact' });

/**
 * Every value a path reaches: `data.items[0].id`, `[-1]` the last, `[]` every element.
 *
 * `where` OWNS THE GRAMMAR AND THIS IS THE SEAM. `43 §4.4` is one grammar with three readers, and this file
 * used to carry the third hand-written copy of it. `packages/where` already owned the other two and this
 * package already depended on it, so the copy was never buying anything except a second answer to
 * `data[-1].id`.
 *
 * THE `catch` IS THE ONE REAL DIFFERENCE AND IT IS DELIBERATE. `selectAll` refuses a malformed path, because
 * a path is a declaration and install is where an author should hear about a typo. Here a malformed path
 * must reach nothing instead: `declare` has already refused one at install, so anything that arrives
 * malformed at THIS point came some other way, and a coercion step that throws mid-write would take an
 * ingest down over a field. Both postures are right for their own door; this line is where they meet.
 */
export function select(root: unknown, path: string): unknown[] {
  try {
    return selectAll(root as Json, path);
  } catch {
    return [];
  }
}

/** The one value a path reaches, or `undefined` when it reaches none or several. */
const one = (root: unknown, path: string): unknown => {
  const got = select(root, path).filter((v) => v !== undefined);
  return got.length === 1 ? got[0] : undefined;
};

const INT = /^[+-]?\d+$/u;
const DECIMAL = /^[+-]?(?:\d+\.?\d*|\.\d+)$/u;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/iu;

const digits = (text: string): number => text.replace(/^[+-]/u, '').replace('.', '').replace(/^0+/u, '').length;

function decimalOf(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!DECIMAL.test(t) || digits(t) > SIGNIFICANT) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function intOf(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && INT.test(v.trim()) ? Number(v.trim()) : null;
  return n !== null && Number.isSafeInteger(n) ? n : null;
}

function instantOf(v: unknown, from: 'epoch_s' | 'epoch_ms' | undefined): string | null {
  if (from !== undefined) {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? decimalOf(v) : null;
    if (n === null || !Number.isFinite(n)) return null;
    const ms = from === 'epoch_s' ? n * 1000 : n;
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }
  /* NEVER `Date.parse` ON FREE TEXT: an RFC 3339 string with its zone, or nothing. */
  if (typeof v !== 'string' || !RFC3339.test(v.trim())) return null;
  const d = new Date(v.trim());
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

export type MapDeps = {
  /** A currency's minor-unit exponent. */
  exponent: (currency: string) => number;
  /** A day in a declared format, or `null`. */
  day: (text: string, format: string) => string | null;
};

/**
 * One field, by its mapping, over a parsed answer.
 *
 * `arrivedAt` is the arrival's instant, and `fieldType` the register's type for the field, which is what
 * says whether `arrived` writes an instant or a day.
 */
export function mapField(deps: MapDeps, mapping: Mapping, root: unknown, arrivedAt: string, fieldType?: string): Mapped {
  if (mapping === null || typeof mapping !== 'object') return MISSING;
  if ('value' in mapping) return mapping.value === undefined ? MISSING : exact(mapping.value);
  if ('arrived' in mapping) return mapping.arrived === true ? exact(fieldType === 'day' ? arrivedAt.slice(0, 10) : arrivedAt) : MISSING;
  if (!('path' in mapping)) return MISSING;

  /* MONEY MAY READ TWO PATHS: the amount and its currency. */
  if (mapping.type === 'money') {
    const [amountPath, currencyPath] = Array.isArray(mapping.path) ? mapping.path : [mapping.path as string, undefined];
    const currency = currencyPath === undefined ? mapping.currency : one(root, currencyPath);
    /* A CURRENCY PATH THAT REACHED NOTHING IS ABSENT; ONE THAT REACHED SOMETHING UNREADABLE IS INVALID. */
    if (currency === undefined) return MISSING;
    if (typeof currency !== 'string' || !/^[A-Za-z]{3}$/u.test(currency)) return INVALID;
    const raw = one(root, amountPath);
    if (raw === undefined) return MISSING;
    const code = currency.toUpperCase();
    if (mapping.minor === true) {
      const n = intOf(raw);
      return n === null ? INVALID : exact({ amount: n, currency: code });
    }
    const n = decimalOf(raw);
    if (n === null) return INVALID;
    const minor = n * 10 ** deps.exponent(code);
    /* PRECISION BEYOND THE CURRENCY'S EXPONENT IS INVALID, not absent: `JPY 12.5` is a real number that the
       yen cannot hold, and the two available answers are 12 and 13, so the answer is neither (`43 §4.3`). */
    if (Math.abs(minor - Math.round(minor)) > 1e-6) return INVALID;
    return exact({ amount: Math.round(minor), currency: code });
  }

  if (typeof mapping.path !== 'string') return MISSING;
  const v = one(root, mapping.path);
  if (v === undefined) return MISSING;

  switch (mapping.type) {
    case 'text':
    case 'url':
    case 'email':
    case 'document':
      return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? exact(String(v)) : INVALID;
    case 'int': {
      const n = intOf(v);
      return n === null ? INVALID : exact(n);
    }
    case 'duration': {
      const n = intOf(v);
      return n === null ? INVALID : exact(n);
    }
    case 'decimal': {
      const n = decimalOf(v);
      return n === null ? INVALID : exact(n);
    }
    case 'bool':
      if (v === true || v === 'true' || v === 1) return exact(true);
      if (v === false || v === 'false' || v === 0) return exact(false);
      return INVALID;
    case 'instant': {
      const at = instantOf(v, mapping.from);
      return at === null ? INVALID : exact(at);
    }
    case 'day': {
      if (mapping.from !== undefined) {
        const at = instantOf(v, mapping.from);
        return at === null ? INVALID : exact(at.slice(0, 10));
      }
      if (typeof v !== 'string') return INVALID;
      const d = deps.day(v.trim(), mapping.format ?? 'YYYY-MM-DD');
      return d === null ? INVALID : exact(d);
    }
    case 'enum': {
      const values = Array.isArray(mapping.values) ? mapping.values : [];
      if (typeof v === 'string' && values.includes(v)) return exact(v);
      return typeof mapping.other === 'string' ? { value: mapping.other, outcome: 'defaulted' } : INVALID;
    }
    case 'json':
      return exact(v as Json);
    /* AN UNKNOWN TYPE IS THE DECLARATION'S FAULT AND NOT THE VALUE'S, so it stays `missing`:
       `MAP_TYPES` is closed and `declare` refuses anything outside it at install. */
    default:
      return MISSING;
  }
}

/**
 * Parse an answer once. `undefined` is a body that is not JSON, or one over the cap: everything it maps is missing.
 */
export function parseAnswer(body: string, cap = 2_000_000): unknown {
  if (new TextEncoder().encode(body).length > cap) return undefined;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
}

/** One mapped row: what was read, and which fields were not read cleanly. */
export type RowRead = { fields: Record<string, Json>; missed: string[]; soft: string[] };

/**
 * A whole row, by its `map:`, over one parsed answer.
 *
 * ONE ROW OR FIVE HUNDRED IS THE SAME READ. An email carrying `{"total":4200}` and page three of a
 * provider's charges differ in how many roots there are, not in what a root means — so the field
 * loop, the missing list and the *chose or defaulted* list are this function, and `arrive` and the
 * connector extractor both call it. Two copies of this loop would be two definitions of what
 * `proposed` means, and the copy that drifts is the one nobody is reading when a number looks wrong.
 */
export function readRow(
  deps: MapDeps,
  map: Readonly<Record<string, Mapping>>,
  root: unknown,
  arrivedAt: string,
  typeOf: (field: string) => string | undefined,
): RowRead {
  const fields: Record<string, Json> = {};
  const missed: string[] = [];
  const soft: string[] = [];

  for (const [field, mapping] of Object.entries(map)) {
    const got = mapField(deps, mapping, root, arrivedAt, typeOf(field));
    /* A FIELD THAT READ NOTHING IS NAMED AND NOT WRITTEN AS `null`. A null in a row is a value
       somebody could act on; a name in `missed` is the row saying it could not be read. */
    if (got.value === null) { missed.push(field); continue; }
    fields[field] = got.value;
    if (got.outcome !== 'exact') soft.push(field);
  }
  return { fields, missed, soft };
}
