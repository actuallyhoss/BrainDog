/**
 * `where:` — one predicate, one grammar, and the two things you can do with it.
 *
 * SEVEN CONSUMERS READ THIS: a block's query, a saved view, a rule's condition, a metric's window,
 * an ingest match, a lock, and an agent's `list`. They must agree, and the only way to be sure they
 * agree is for there to be one of it. The frontend learned this the expensive way — a page's
 * predicate and a URL's filter chips were two languages, and they disagreed about whether a date
 * was before today.
 *
 * TWO RENDERINGS, ONE MEANING. `compile` turns a predicate into SQL over `entry`, for the register
 * it was checked against; `evaluate` answers the same question about one row already in memory,
 * which is what a rule needs mid-write and what a test can assert without a database. A test here
 * runs both and compares, because two renderings that disagree are worse than one that is slow.
 *
 * A PREDICATE IS CHECKED AGAINST A REGISTER BEFORE IT IS RUN. A field that does not exist, an
 * operator its type cannot take, a value outside an enum — each is a refusal with a sentence, not a
 * clause that quietly matches nothing. The failure that motivated it: `state is not done` on a
 * register with no `done` state was true of every row, so a filter that looked like it had worked
 * returned the whole register.
 */

import type { Refusal } from '@braindog/ports';

export const QUANTIFIERS = ['all', 'any', 'none'] as const;
export type Quantifier = (typeof QUANTIFIERS)[number];

/** Nineteen, `34-GRAMMARS` §1.1. `near` needs the full-text index and is not read here yet. */
export const OPERATORS = [
  'is', 'not', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte', 'before', 'after', 'between',
  'contains', 'matches', 'starts', 'ends', 'empty', 'present', 'has', 'lacks', 'near',
] as const;
export type Operator = (typeof OPERATORS)[number];

export type Money = { amount: number; currency: string };
export type Quantity = { value: number; unit: string };
export type Scalar = string | number | boolean | Money | Quantity;

export type Leaf = { field: string; via?: string } & Record<string, unknown>;
export type Group = { all: Node[] } | { any: Node[] } | { none: Node[] };
export type Node = Group | Leaf;
export type Predicate = Node;

/** What the predicate is allowed to name, and what each field can hold. */
export type Schema = {
  register: string;
  fields: Record<string, { type: string; values?: readonly string[] }>;
};

export type Compiled = {
  /** A SQL fragment over `entry`, parenthesised, safe to drop into a WHERE. */
  sql: string;
  params: (string | number)[];
  /** Everything the predicate asked for that could not be resolved. Non-empty means: run nothing. */
  bad: Refusal[];
};

const isGroup = (n: Node): n is Group =>
  typeof n === 'object' && n !== null && ('all' in n || 'any' in n || 'none' in n);

const quantifierOf = (g: Group): Quantifier => ('all' in g ? 'all' : 'any' in g ? 'any' : 'none');
const childrenOf = (g: Group): Node[] => (('all' in g ? g.all : 'any' in g ? g.any : g.none) ?? []);

/**
 * The JSON path a field is stored at, and the ONE place it is spelled.
 *
 * The partial index and the predicate have to be the same string or the index is never used, and
 * "the query got slow" is the only symptom — a year after somebody renamed a helper.
 */
export const jsonPath = (field: string): string => `$.${field}`;

const IDENT = /^[a-z][a-z0-9_]{0,31}$/;

/** A money or quantity value is an OBJECT, so its number lives one level down. */
const NUMERIC_SUBPATH: Record<string, string> = { money: '.amount', quantity: '.value' };

const extract = (field: string, type: string, part = ''): string =>
  `json_extract(fields, '${jsonPath(field)}${part || NUMERIC_SUBPATH[type] || ''}')`;

const ORDERED = new Set(['int', 'decimal', 'duration', 'money', 'quantity', 'day', 'instant']);
const TEXTUAL = new Set(['text', 'document', 'url', 'email', 'enum', 'ref', 'secret']);

/** Which operators a type can take at all. An operator its type cannot take is a refusal. */
function operatorAllowed(op: Operator, type: string): boolean {
  if (op === 'empty' || op === 'present') return true;
  if (op === 'is' || op === 'not' || op === 'in' || op === 'not_in') return type !== 'list';
  if (op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte' || op === 'between') return ORDERED.has(type);
  if (op === 'before' || op === 'after') return type === 'day' || type === 'instant';
  if (op === 'contains' || op === 'starts' || op === 'ends') return TEXTUAL.has(type);
  if (op === 'has' || op === 'lacks') return type === 'list';
  return false;
}

const refuse = (code: string, fix: string, at?: string, allowed?: readonly string[]): Refusal => ({
  code,
  fix,
  ...(at === undefined ? {} : { at }),
  ...(allowed === undefined ? {} : { allowed }),
});

/** The literal a comparison binds, or a refusal if the value is not one this type can hold. */
function bind(value: unknown, type: string): string | number | null {
  if (type === 'money') return typeof value === 'object' && value !== null ? (value as Money).amount : null;
  if (type === 'quantity') return typeof value === 'object' && value !== null ? (value as Quantity).value : null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' || typeof value === 'string') return value;
  return null;
}

/**
 * Compile a predicate against a register into SQL and bound parameters.
 *
 * NOTHING IS INLINED. Every value is a bound parameter and every identifier has already matched
 * `^[a-z][a-z0-9_]{0,31}$` before it reaches a string — the field ids are inlined into
 * `json_extract` paths, which is the one place an identifier becomes SQL, so the grammar check is
 * the security boundary and not a nicety.
 */
export function compile(where: Predicate | undefined, schema: Schema): Compiled {
  const bad: Refusal[] = [];
  const params: (string | number)[] = [];

  const walk = (node: Node): string => {
    if (isGroup(node)) {
      const q = quantifierOf(node);
      const kids = childrenOf(node).map(walk).filter(Boolean);
      /* An EMPTY GROUP is not an empty question. `all: []` is true of everything and `any: []` of
         nothing, which is what the two words mean, and guessing either way would be a filter that
         silently passed or silently blocked. */
      if (kids.length === 0) return q === 'any' ? '0 = 1' : '1 = 1';
      const joined = kids.join(q === 'any' ? ' OR ' : ' AND ');
      return q === 'none' ? `NOT (${joined})` : `(${joined})`;
    }

    const leaf = node as Record<string, unknown>;

    for (const key of ['matches', 'predicate', 'near'])
      if (key in leaf) {
        bad.push(
          refuse('WHERE_UNSUPPORTED', `${key} is in the grammar and not read by this build — it needs the text index.`, key),
        );
        return '';
      }

    if ('via' in leaf && leaf.via !== undefined) {
      bad.push(refuse('WHERE_UNSUPPORTED', 'via is a hop through a ref, and this build reads one register at a time.', 'via'));
      return '';
    }

    const field = leaf.field;
    if (typeof field !== 'string' || !IDENT.test(field)) {
      bad.push(refuse('FIELD_UNKNOWN', `A leaf needs a field, and ${JSON.stringify(field)} is not one.`, 'field'));
      return '';
    }

    const decl = schema.fields[field];
    if (!decl) {
      bad.push(
        refuse('FIELD_UNKNOWN', `${schema.register} has no field called ${field}.`, field, Object.keys(schema.fields)),
      );
      return '';
    }

    const op = OPERATORS.find((o) => o in leaf);
    if (!op) {
      bad.push(refuse('WHERE_MALFORMED', `${field} has no test on it. One of: ${OPERATORS.join(' · ')}.`, field));
      return '';
    }
    if (!operatorAllowed(op, decl.type)) {
      bad.push(
        refuse('WHERE_OPERATOR_UNSUPPORTED', `${field} is a ${decl.type}, which cannot be asked "${op}".`, field),
      );
      return '';
    }

    const value = leaf[op];
    const path = extract(field, decl.type);
    const put = (v: string | number): string => {
      params.push(v);
      return '?';
    };

    /* An enum value outside the declared set is the failure that motivated the whole evaluator:
       `state is not done` on a register with no `done` was true of every row. */
    const checkEnum = (v: unknown): boolean => {
      if (decl.type !== 'enum' || !decl.values) return true;
      if (typeof v === 'string' && decl.values.includes(v)) return true;
      bad.push(refuse('ENUM_VALUE_UNKNOWN', `${field} has no value ${String(v)}.`, field, decl.values));
      return false;
    };

    switch (op) {
      case 'empty':
        return `(${path} IS NULL)`;
      case 'present':
        return `(${path} IS NOT NULL)`;

      case 'is':
      case 'not': {
        if (!checkEnum(value)) return '';
        const bound = bind(value, decl.type);
        if (bound === null) {
          bad.push(refuse('VALUE_MALFORMED', `${field} cannot be compared with ${JSON.stringify(value)}.`, field));
          return '';
        }
        /* A MONEY COMPARISON CARRIES ITS CURRENCY. Two currencies are two quantities, and comparing
           their numbers is the exact mistake minor units exist to make impossible.
           THE ORDER OF `put` IS THE ORDER OF THE PLACEHOLDERS: computing the currency clause first
           bound it to the amount's `?`, which made every money comparison match nothing — a filter
           that silently returned an empty list rather than a wrong one, which is the failure this
           whole package is built to avoid. */
        const cmp = `${path} = ${put(bound)}`;
        const money = decl.type === 'money' ? ` AND ${extract(field, decl.type, '.currency')} = ${put(String((value as Money).currency))}` : '';
        return op === 'is' ? `(${cmp}${money})` : `(${path} IS NULL OR NOT (${cmp}${money}))`;
      }

      case 'in':
      case 'not_in': {
        const list = Array.isArray(value) ? value : [];
        if (list.length === 0) {
          bad.push(refuse('WHERE_MALFORMED', `${field} ${op} needs at least one value.`, field));
          return '';
        }
        for (const v of list) if (!checkEnum(v)) return '';
        const bounds = list.map((v) => bind(v, decl.type)).filter((v): v is string | number => v !== null);
        if (bounds.length !== list.length) {
          bad.push(refuse('VALUE_MALFORMED', `${field} was given a value it cannot hold.`, field));
          return '';
        }
        const placeholders = bounds.map(put).join(', ');
        return op === 'in' ? `(${path} IN (${placeholders}))` : `(${path} IS NULL OR ${path} NOT IN (${placeholders}))`;
      }

      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte':
      case 'before':
      case 'after': {
        const bound = bind(value, decl.type);
        if (bound === null) {
          bad.push(refuse('VALUE_MALFORMED', `${field} cannot be compared with ${JSON.stringify(value)}.`, field));
          return '';
        }
        const sign = op === 'gt' ? '>' : op === 'gte' ? '>=' : op === 'lt' || op === 'before' ? '<' : op === 'lte' ? '<=' : '>';
        // Bound first, currency second, in the order the placeholders appear. See `is` above.
        const cmp = `${path} ${sign} ${put(bound)}`;
        const money = decl.type === 'money' ? ` AND ${extract(field, decl.type, '.currency')} = ${put(String((value as Money).currency))}` : '';
        /* A ROW WITH NO VALUE IS NOT BEFORE ANYTHING. `IS NOT NULL` is explicit rather than relying
           on SQLite's null comparison, because the same predicate is answered by `evaluate` in
           JavaScript, where `undefined < x` is false and `undefined > x` is also false — two
           languages agreeing by accident is not agreement. */
        return `(${path} IS NOT NULL AND ${cmp}${money})`;
      }

      case 'between': {
        const pair = Array.isArray(value) ? value : [];
        const lo = bind(pair[0], decl.type);
        const hi = bind(pair[1], decl.type);
        if (lo === null || hi === null) {
          bad.push(refuse('WHERE_MALFORMED', `${field} between takes two values, low first.`, field));
          return '';
        }
        return `(${path} IS NOT NULL AND ${path} >= ${put(lo)} AND ${path} <= ${put(hi)})`;
      }

      case 'contains':
      case 'starts':
      case 'ends': {
        if (typeof value !== 'string') {
          bad.push(refuse('VALUE_MALFORMED', `${field} ${op} takes a string.`, field));
          return '';
        }
        /* ESCAPED, and the escape declared. A value containing `%` would otherwise match anything —
           a search for "50%" returning every row, which reads as a search that found a lot. */
        const escaped = value.replace(/[\\%_]/g, (c) => `\\${c}`);
        const pattern = op === 'contains' ? `%${escaped}%` : op === 'starts' ? `${escaped}%` : `%${escaped}`;
        return `(${path} IS NOT NULL AND ${path} LIKE ${put(pattern)} ESCAPE '\\')`;
      }

      case 'has':
      case 'lacks': {
        const bound = bind(value, 'text');
        if (bound === null) {
          bad.push(refuse('VALUE_MALFORMED', `${field} ${op} takes one value to look for in the list.`, field));
          return '';
        }
        const exists = `EXISTS (SELECT 1 FROM json_each(json_extract(fields, '${jsonPath(field)}')) WHERE value = ${put(bound)})`;
        return op === 'has' ? `(${exists})` : `(NOT ${exists})`;
      }

      default:
        bad.push(refuse('WHERE_UNSUPPORTED', `${op} is in the grammar and not read by this build.`, field));
        return '';
    }
  };

  const sql = where === undefined ? '1 = 1' : walk(where) || '0 = 1';
  return { sql, params, bad };
}

/**
 * The same question, about one row already in memory.
 *
 * A rule mid-write has the row and no transaction to query from, and a test wants an answer without
 * a database. What matters is that this and `compile` say the same thing — there is a test that runs
 * both over the same rows and compares, because two renderings that disagree are worse than one
 * that is slow.
 */
export function evaluate(where: Predicate | undefined, fields: Record<string, unknown>, schema: Schema): boolean {
  if (where === undefined) return true;

  const one = (node: Node): boolean => {
    if (isGroup(node)) {
      const q = quantifierOf(node);
      const kids = childrenOf(node);
      if (kids.length === 0) return q !== 'any';
      if (q === 'all') return kids.every(one);
      if (q === 'any') return kids.some(one);
      return !kids.some(one);
    }

    const leaf = node as Record<string, unknown>;
    const field = typeof leaf.field === 'string' ? leaf.field : '';
    const decl = schema.fields[field];
    if (!decl) return false;

    const raw = fields[field];
    const type = decl.type;
    const numeric = (v: unknown): number | null => {
      if (type === 'money') return typeof v === 'object' && v !== null ? (v as Money).amount : null;
      if (type === 'quantity') return typeof v === 'object' && v !== null ? (v as Quantity).value : null;
      if (typeof v === 'number') return v;
      return null;
    };
    const comparable = (v: unknown): string | number | null =>
      type === 'day' || type === 'instant' ? (typeof v === 'string' ? v : null) : numeric(v);

    const op = OPERATORS.find((o) => o in leaf);
    if (!op || !operatorAllowed(op, type)) return false;
    const value = leaf[op];
    const absent = raw === undefined || raw === null;

    switch (op) {
      case 'empty':
        return absent;
      case 'present':
        return !absent;
      case 'is':
        return !absent && same(raw, value, type);
      case 'not':
        return absent || !same(raw, value, type);
      case 'in':
        return !absent && Array.isArray(value) && value.some((v) => same(raw, v, type));
      case 'not_in':
        return absent || !(Array.isArray(value) && value.some((v) => same(raw, v, type)));
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte':
      case 'before':
      case 'after': {
        if (absent) return false;
        const a = comparable(raw);
        const b = comparable(value);
        if (a === null || b === null) return false;
        if (type === 'money' && (raw as Money).currency !== (value as Money).currency) return false;
        if (op === 'gt' || op === 'after') return a > b;
        if (op === 'gte') return a >= b;
        if (op === 'lt' || op === 'before') return a < b;
        return a <= b;
      }
      case 'between': {
        if (absent || !Array.isArray(value)) return false;
        const a = comparable(raw);
        const lo = comparable(value[0]);
        const hi = comparable(value[1]);
        return a !== null && lo !== null && hi !== null && a >= lo && a <= hi;
      }
      case 'contains':
        return !absent && typeof raw === 'string' && typeof value === 'string' && raw.includes(value);
      case 'starts':
        return !absent && typeof raw === 'string' && typeof value === 'string' && raw.startsWith(value);
      case 'ends':
        return !absent && typeof raw === 'string' && typeof value === 'string' && raw.endsWith(value);
      case 'has':
        return Array.isArray(raw) && raw.some((v) => v === value);
      case 'lacks':
        return !Array.isArray(raw) || !raw.some((v) => v === value);
      default:
        return false;
    }
  };

  return one(where);
}

/** Equality, by type: money is equal when both halves are, because a number is not an amount. */
function same(a: unknown, b: unknown, type: string): boolean {
  if (type === 'money')
    return (
      typeof a === 'object' &&
      a !== null &&
      typeof b === 'object' &&
      b !== null &&
      (a as Money).amount === (b as Money).amount &&
      (a as Money).currency === (b as Money).currency
    );
  if (type === 'quantity')
    return (
      typeof a === 'object' &&
      a !== null &&
      typeof b === 'object' &&
      b !== null &&
      (a as Quantity).value === (b as Quantity).value &&
      (a as Quantity).unit === (b as Quantity).unit
    );
  return a === b;
}
