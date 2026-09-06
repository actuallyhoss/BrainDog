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

/** The half of a compound value that is not its number: a currency, a unit. */
const QUALIFIER: Record<string, { part: string; key: string }> = {
  money: { part: 'currency', key: 'currency' },
  quantity: { part: 'unit', key: 'unit' },
};

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

/**
 * The clause that keeps a compound value whole.
 *
 * A money value is an amount AND a currency; a quantity is a number AND a unit. Comparing only the
 * numbers is the exact mistake minor units exist to make impossible, and it was being made
 * everywhere except `is` and the ordered operators.
 */
function qualifier(field: string, type: string, value: unknown, put: (v: string | number) => string): string {
  const q = QUALIFIER[type];
  if (!q || typeof value !== 'object' || value === null) return '';
  const half = (value as Record<string, unknown>)[q.key];
  return half === undefined ? '' : ` AND ${extract(field, type, `.${q.part}`)} = ${put(String(half))}`;
}

/**
 * The qualifier a value would carry, as a plain string — or `null` where it carries none.
 *
 * FOR DEDUPLICATING BEFORE BINDING. The clause `qualifier` returns has a literal `?` in it, so two
 * different currencies produce the same string; deduplicating those and binding as you go puts more
 * parameters in the list than there are placeholders in the SQL.
 */
function currencyKey(field: string, type: string, value: unknown): string | null {
  const q = QUALIFIER[type];
  if (!q || typeof value !== 'object' || value === null) return null;
  const half = (value as Record<string, unknown>)[q.key];
  return half === undefined ? null : String(half);
}

/** Forty bytes. Past it a `LIKE` pattern reaches a platform ceiling that differs between hosts. */
const CONTAINS_MAX = 40;
const byteLength = (text: string): number => new TextEncoder().encode(text).length;

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
  /* AND THE STRINGS THE SENTENCE GRAMMAR PRODUCES FOR ONE. `resolve` answers the string `'true'`
     for `done is yes`, `json_extract` answers the integer `1`, and `1 = 'true'` is false in SQLite
     — so the sentence form matched NOTHING while the structured form matched correctly, and the
     negation of the same sentence matched EVERYTHING. Two spellings of one grammar disagreeing is
     the failure this package exists to make impossible, and the second half of it is the clause
     that quietly matches every row, which its own header is written against. */
  if (type === 'bool') {
    if (value === 'true') return 1;
    if (value === 'false') return 0;
    return null;
  }
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
      /* `none` IS `NOT ANY`, and the difference bites the moment there are two children: joining
         with AND makes it "not all", which passes every row that fails only one of them. Both
         `34-GRAMMARS` §1.1 and `evaluate` below say NOT-OR, and this said NOT-AND — invisible in
         the tests because every `none` case in them had exactly one child, where the two joins are
         the same string. */
      const joined = kids.join(q === 'all' ? ' AND ' : ' OR ');
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

    /* `Object.hasOwn`, NOT a truthiness check: `constructor` is a real field id by the grammar and
       resolves against `Object.prototype`, so `{field: 'constructor', is: 'x'}` compiled to a clause
       that matched nothing — a filter that quietly returned an empty list, which is the failure this
       whole module exists to prevent. */
    const decl = Object.hasOwn(schema.fields, field) ? schema.fields[field] : undefined;
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
      /* THE THREE WAYS A VALUE IS ABSENT. A write stores none of them — `null`, `''` and `[]` all
         remove the key — but an IMPORT carries whatever the other record held, and a row written
         by an older build may carry an empty string. `IS NULL` alone read those as present, so a
         `where: note is empty` missed exactly the rows somebody was looking for. */
      case 'empty':
        return `(${path} IS NULL OR ${path} = '' OR ${path} = '[]')`;
      case 'present':
        return `(${path} IS NOT NULL AND ${path} <> '' AND ${path} <> '[]')`;

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
        if (op === 'is') {
          const cmp = `${path} = ${put(bound)}`;
          return `(${cmp}${qualifier(field, decl.type, value, put)})`;
        }

        /* AND A FOREIGN-CURRENCY ROW IS NOT A MATCH EVEN UNDER NEGATION. `NOT(amount = 10000 AND
           currency = 'GBP')` is TRUE of a EUR row, so `fee is not GBP 100` returned every euro
           invoice in the record — a filter that quietly matched everything, which is the failure
           this module exists to prevent. The currency is asserted OUTSIDE the negation: a row in
           another currency is not the thing being talked about at all.

           THE QUALIFIER IS BOUND FIRST BECAUSE IT IS WRITTEN FIRST. `put` pushes in call order and
           the placeholders are read in string order, so computing the amount first here would bind
           the currency to the amount's `?` — the mistake the `is` branch above records. */
        const currency = qualifier(field, decl.type, value, put);
        const negated = `${path} = ${put(bound)}`;
        return currency
          ? `(${path} IS NULL OR (${currency.slice(' AND '.length)} AND NOT (${negated})))`
          : `(${path} IS NULL OR NOT (${negated}))`;
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
        /* EVERY VALUE CARRIES ITS OWN QUALIFIER. `in` was compiled as a bare `IN (…)` over the
           amounts, so 24,000 EUR matched a list holding 24,000 GBP — the exact mistake the `is`
           branch was written to prevent, in the branch beside it. One clause per value, ORed. */
        if (op === 'in') {
          const each = list.map((v, i) => `(${path} = ${put(bounds[i]!)}${qualifier(field, decl.type, v, put)})`);
          return `(${each.join(' OR ')})`;
        }

        /* `not_in` KEEPS THE CURRENCY AND NEGATES THE AMOUNTS, for the reason `not` does — and the
           currency clauses are bound first because they are written first.

           THE SET IS TAKEN BEFORE ANYTHING IS BOUND, which is the whole of the fix. This called
           `put` once per value and then deduplicated the resulting clause STRINGS — which are
           identical, because the `?` in them is literal — so two GBP values produced three
           placeholders and four parameters. `node:sqlite` raises `column index out of range` and
           the list, the metric or the page fails outright; a driver that tolerated the extra one
           would shift every binding by a place and answer `currency = 'GBP' AND NOT (amount =
           'GBP' OR amount = 10000)`, which returns a value that IS in the list. And `evaluate()`
           answers the same predicate without error, so a rule fires mid-write and the list behind
           it crashes. */
        const seen = new Set<string>();
        const same = (() => {
          const clauses: string[] = [];
          for (const v of list) {
            const key = currencyKey(field, decl.type, v);
            if (key === null || seen.has(key)) continue;
            seen.add(key);
            clauses.push(qualifier(field, decl.type, v, put).slice(' AND '.length));
          }
          return clauses.length ? `(${clauses.join(' OR ')}) AND ` : '';
        })();
        const amounts = list.map((_, i) => `${path} = ${put(bounds[i]!)}`).join(' OR ');
        return `(${path} IS NULL OR (${same}NOT (${amounts})))`;
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
        // Bound first, qualifier second, in the order the placeholders appear. See `is` above.
        const cmp = `${path} ${sign} ${put(bound)}`;
        const money = qualifier(field, decl.type, value, put);
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
        /* The bounds carry their currency too: `between 20,000 and 30,000 USD` matched a GBP row and
           a EUR row in BOTH renderings, so nothing flagged it — a shared bug is invisible to a test
           that only compares the two.

           AND BOTH BOUNDS, NOT THE LOW ONE. The qualifier was taken from `pair[0]` alone, so a range
           written from GBP 200 to USD 300 silently reread the ceiling as GBP 300: a plausible answer
           to a question nobody asked. Two currencies are not a range, and saying so is the only
           honest answer. */
        if (currencyKey(field, decl.type, pair[0]) !== currencyKey(field, decl.type, pair[1])) {
          bad.push(refuse('MIXED_CURRENCY', `${field} between takes one currency, and this range has two.`, field));
          return '';
        }
        return `(${path} IS NOT NULL AND ${path} >= ${put(lo)} AND ${path} <= ${put(hi)}${qualifier(field, decl.type, pair[0], put)})`;
      }

      case 'contains':
      case 'starts':
      case 'ends': {
        if (typeof value !== 'string') {
          bad.push(refuse('VALUE_MALFORMED', `${field} ${op} takes a string.`, field));
          return '';
        }
        /* `contains` IS `instr`, NEVER `LIKE`, and the difference is a parity bug rather than a
           preference. One platform caps a `LIKE` pattern at fifty bytes and the other at fifty
           thousand, so a forty-nine character `contains` works on a laptop and fails in production
           — the exact shape of failure this package exists to make impossible. `instr` has no
           pattern, so it has no ceiling, and it needs no escape: a value containing `%` is a value.
           `starts` and `ends` keep `LIKE`, because a prefix IS a pattern; their literals are held
           to the same forty bytes so neither can reach a platform's limit. */
        if (byteLength(value) > CONTAINS_MAX) {
          bad.push(
            refuse(
              'CONTAINS_TOO_LONG',
              `${field} ${op} takes at most ${CONTAINS_MAX} bytes, and this one is ${byteLength(value)}.`,
              field,
            ),
          );
          return '';
        }
        if (op === 'contains') return `(${path} IS NOT NULL AND instr(lower(${path}), lower(${put(value)})) > 0)`;

        const escaped = value.replace(/[\\%_]/g, (c) => `\\${c}`);
        const pattern = op === 'starts' ? `${escaped}%` : `%${escaped}`;
        return `(${path} IS NOT NULL AND ${path} LIKE ${put(pattern)} ESCAPE '\\')`;
      }

      case 'has':
      case 'lacks': {
        const bound = bind(value, 'text');
        if (bound === null) {
          bad.push(refuse('VALUE_MALFORMED', `${field} ${op} takes one value to look for in the list.`, field));
          return '';
        }
        /* GUARDED, because `json_each` RAISES on a bare string. `json_each(NULL)` is fine, so an
           absent row was never the problem — a row holding a scalar where a list belongs was, and
           one of them made the whole query throw and lost every other row's answer. An import
           carries whatever the other record held, and the `.dog` reader writes `fields` without
           coercing it, which is exactly the case the `empty`/`present` branch above is written for.
           A scalar is not a list, so it holds nothing: `'[]'` is the honest substitute. */
        const list = `CASE WHEN json_valid(json_extract(fields, '${jsonPath(field)}')) AND json_type(json_extract(fields, '${jsonPath(field)}')) = 'array' THEN json_extract(fields, '${jsonPath(field)}') ELSE '[]' END`;
        const exists = `EXISTS (SELECT 1 FROM json_each(${list}) WHERE value = ${put(bound)})`;
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
    const decl = Object.hasOwn(schema.fields, field) ? schema.fields[field] : undefined;
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
    /* THE THREE WAYS A VALUE IS ABSENT, and the compiler says the same three. A write stores none
       of them, but an import carries whatever the other record held. */
    const absent =
      raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && raw.length === 0);

    switch (op) {
      case 'empty':
        return absent;
      case 'present':
        return !absent;
      case 'is':
        return !absent && same(raw, value, type);
      /* AND A FOREIGN-CURRENCY ROW IS NOT A MATCH EVEN UNDER NEGATION: it is not the thing being
         talked about. `NOT(amount = 10000 AND currency = 'GBP')` was true of every euro row. */
      case 'not':
        return absent || (sameQualifier(type, raw, value) && !same(raw, value, type));
      case 'in':
        return !absent && Array.isArray(value) && value.some((v) => same(raw, v, type));
      case 'not_in':
        return (
          absent ||
          !Array.isArray(value) ||
          (value.some((v) => sameQualifier(type, raw, v)) && !value.some((v) => same(raw, v, type)))
        );
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
        if (!sameQualifier(type, raw, value)) return false;
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
        /* THE BOUNDS CARRY THEIR CURRENCY TOO. Without this, `between 20,000 and 30,000 USD` matched
           a GBP row and a EUR row — and it was wrong in BOTH renderings, so comparing them against
           each other flagged nothing. A shared mistake is the one a differential test cannot see. */
        if (!sameQualifier(type, raw, value[0])) return false;
        return a !== null && lo !== null && hi !== null && a >= lo && a <= hi;
      }
      /* CASE-FOLDED, because SQLite's LIKE is and `34-GRAMMARS` §1.2 says the operator is. This was
         `includes` on the raw strings, so a rule evaluated mid-write and the list drawn afterwards
         disagreed about the same row — the exact failure this module's header names, in the module
         that names it. */
      case 'contains':
        return !absent && typeof raw === 'string' && typeof value === 'string' && fold(raw).includes(fold(value));
      case 'starts':
        return !absent && typeof raw === 'string' && typeof value === 'string' && fold(raw).startsWith(fold(value));
      case 'ends':
        return !absent && typeof raw === 'string' && typeof value === 'string' && fold(raw).endsWith(fold(value));
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

/** ASCII case folding, which is what SQLite's LIKE does and therefore what the operator means. */
const fold = (s: string): string => s.replace(/[A-Z]/g, (c) => c.toLowerCase());

/**
 * Do a stored value and an operand agree about the half that is not the number?
 *
 * A currency for money, a unit for a quantity. Every comparison of a compound value has to ask this,
 * and the ones that did not were comparing 24,000 GBP with 24,000 EUR and calling them equal.
 */
function sameQualifier(type: string, a: unknown, b: unknown): boolean {
  const q = QUALIFIER[type];
  if (!q) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
  return (a as Record<string, unknown>)[q.key] === (b as Record<string, unknown>)[q.key];
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
  /* A BOOL IS TRUE OR FALSE HOWEVER IT WAS SPELLED. The sentence grammar resolves `open is yes` to
     the STRING `'true'`, and `true === 'true'` is false — so the sentence form matched nothing here
     while the SQL side had the mirror-image bug, and the two agreed by both being wrong. The
     compiler's `bind` reads the same two spellings; this is that rule on this side. */
  if (type === 'bool') return truth(a) === truth(b) && truth(a) !== null;
  return a === b;
}

/** `true`, `false` or `null` for a value that is neither, whichever of the two spellings it wore. */
const truth = (v: unknown): boolean | null =>
  v === true || v === 'true' ? true : v === false || v === 'false' ? false : null;

/* ── the sentence form ───────────────────────────────────────────────────── */

export { parseWhere, resolveDay } from './sentence.ts';
export type { Parsed, SentenceDeps } from './sentence.ts';
