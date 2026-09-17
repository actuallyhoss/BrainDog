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

/** `43 §4.4`'s ceiling on a path. */
export const MAP_PATH_SEGMENTS = 16;
/** `43 §4.5`: fifteen significant digits, past which a decimal is not the number that was sent. */
const SIGNIFICANT = 15;

/** One field read: its value, or `null`, and whether a declared `other:` stood in for it. */
export type Mapped = { value: Json | null; outcome: 'exact' | 'defaulted' | 'missing' };

const MISSING: Mapped = { value: null, outcome: 'missing' };
const exact = (value: Json): Mapped => ({ value, outcome: 'exact' });

/**
 * Every value a path reaches: `data.items[0].id`, `[-1]` the last, `[]` every element.
 *
 * OWN PROPERTIES ONLY, so `__proto__` and `constructor` reach nothing. A path outside the grammar reaches
 * nothing too; `declare` refuses one at install, and this is the backstop for a declaration that came some
 * other way.
 */
export function select(root: unknown, path: string): unknown[] {
  if (path === '') return [root];
  const segments = path.split('.');
  if (segments.length > MAP_PATH_SEGMENTS) return [];
  let at: unknown[] = [root];
  for (const segment of segments) {
    const m = /^([^.[\]\s]+)?(?:\[(\d+|-1|)\])?$/u.exec(segment);
    if (!m || (m[1] === undefined && m[2] === undefined)) return [];
    const [, key, index] = m;
    const next: unknown[] = [];
    for (const node of at) {
      let here: unknown = node;
      if (key !== undefined) {
        if (here === null || typeof here !== 'object' || Array.isArray(here) || !Object.hasOwn(here, key)) continue;
        here = (here as Record<string, unknown>)[key];
      }
      if (index === undefined) {
        next.push(here);
        continue;
      }
      if (!Array.isArray(here)) continue;
      if (index === '') next.push(...here);
      else {
        const i = index === '-1' ? here.length - 1 : Number(index);
        if (i >= 0 && i < here.length) next.push(here[i]);
      }
    }
    at = next;
  }
  return at;
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
    if (typeof currency !== 'string' || !/^[A-Za-z]{3}$/u.test(currency)) return MISSING;
    const raw = one(root, amountPath);
    const code = currency.toUpperCase();
    if (mapping.minor === true) {
      const n = intOf(raw);
      return n === null ? MISSING : exact({ amount: n, currency: code });
    }
    const n = decimalOf(raw);
    if (n === null) return MISSING;
    const minor = n * 10 ** deps.exponent(code);
    if (Math.abs(minor - Math.round(minor)) > 1e-6) return MISSING;
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
      return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? exact(String(v)) : MISSING;
    case 'int': {
      const n = intOf(v);
      return n === null ? MISSING : exact(n);
    }
    case 'duration': {
      const n = intOf(v);
      return n === null ? MISSING : exact(n);
    }
    case 'decimal': {
      const n = decimalOf(v);
      return n === null ? MISSING : exact(n);
    }
    case 'bool':
      if (v === true || v === 'true' || v === 1) return exact(true);
      if (v === false || v === 'false' || v === 0) return exact(false);
      return MISSING;
    case 'instant': {
      const at = instantOf(v, mapping.from);
      return at === null ? MISSING : exact(at);
    }
    case 'day': {
      if (mapping.from !== undefined) {
        const at = instantOf(v, mapping.from);
        return at === null ? MISSING : exact(at.slice(0, 10));
      }
      if (typeof v !== 'string') return MISSING;
      const d = deps.day(v.trim(), mapping.format ?? 'YYYY-MM-DD');
      return d === null ? MISSING : exact(d);
    }
    case 'enum': {
      const values = Array.isArray(mapping.values) ? mapping.values : [];
      if (typeof v === 'string' && values.includes(v)) return exact(v);
      return typeof mapping.other === 'string' ? { value: mapping.other, outcome: 'defaulted' } : MISSING;
    }
    case 'json':
      return exact(v as Json);
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
