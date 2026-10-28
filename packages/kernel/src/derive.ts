/**
 * A row-level derived field: worked out from the other fields of the same row at read, and **never stored**.
 *
 *   derive: { sum: [a, b, ...] } | { diff: [a, b] } | { product: [a, b] } | { ratio: [a, b] }
 *         | { band: { of, steps: [{ upto, is }], else } } | { via: { ref, field } } | { normalise: { of, how } }
 *
 * Two halves, both pure. `deriveFault` is the declaration's rule: what a field declaring `derive` may say, each way
 * to be wrong refused by name with one sentence that names the field. `derived` is the value, read from one row.
 * `derive-rows.ts` fills a page of rows and resolves `via` once a page.
 *
 * A MISSING SOURCE GIVES NULL, NEVER ZERO. A total that reads 0 because the quantity was never written is a figure
 * nobody wrote; null is drawn as nothing and says so. The same for a ratio by zero, and for money in two currencies,
 * which are never added: a sum across them has no honest answer, so it has none.
 */

import type { Refusal } from '@braindog/ports';

import type { Json } from './coerce.ts';

export const DERIVE_SHAPES = ['sum', 'diff', 'product', 'ratio', 'band', 'via', 'normalise'] as const;
export type DeriveShape = (typeof DERIVE_SHAPES)[number];

/** How `normalise` folds text: case, outer space, or everything but the digits. */
export const NORMALISE_HOW = ['lower', 'trim', 'digits'] as const;

export type BandStep = { upto: number; is: string };

export type Derive =
  | { sum: readonly string[] }
  | { diff: readonly [string, string] }
  | { product: readonly [string, string] }
  | { ratio: readonly [string, string] }
  | { band: { of: string; steps: readonly BandStep[]; else?: string } }
  | { via: { ref: string; field: string } }
  | { normalise: { of: string; how: (typeof NORMALISE_HOW)[number] } };

/** A field as a declaration holds it: loose, because `deriveFault` is what makes it trustworthy. */
export type DeriveField = {
  id: string;
  type: string;
  of?: string;
  to?: string;
  values?: unknown;
  derive?: unknown;
  derived?: boolean;
  retired?: boolean;
  currency_fixed?: unknown;
  currency_from?: unknown;
  [key: string]: unknown;
};

/** The keys that ask a caller for the value, or index one that is stored. A derived field is neither asked nor stored. */
export const DERIVE_REFUSES = ['index', 'unique', 'required', 'required_when', 'default', 'immutable'] as const;

const NUMBER = new Set(['int', 'decimal', 'duration']);
const TEXTLIKE = new Set(['text', 'email', 'url', 'enum']);

const fault = (fix: string, at: string): Refusal => ({ code: 'DECLARATION_INVALID', fix, at });
const isPart = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const a = (type: string): string => `${/^[aeiou]/u.test(type) ? 'an' : 'a'} ${type}`;

/** The one shape a `derive:` names, and its body, or null when it is not one object with one known key. */
export function shapeOf(derive: unknown): { shape: DeriveShape; body: unknown } | null {
  if (!isPart(derive)) return null;
  const keys = Object.keys(derive);
  if (keys.length !== 1 || !(DERIVE_SHAPES as readonly string[]).includes(keys[0]!)) return null;
  return { shape: keys[0] as DeriveShape, body: derive[keys[0]!] };
}

/** The field ids a derivation reads from its own row. */
export function sourcesOf(derive: unknown): string[] {
  const got = shapeOf(derive);
  if (got === null) return [];
  const { shape, body } = got;
  if (shape === 'sum' || shape === 'diff' || shape === 'product' || shape === 'ratio')
    return Array.isArray(body) ? body.filter((s): s is string => typeof s === 'string') : [];
  if (!isPart(body)) return [];
  const one = shape === 'via' ? body.ref : body.of;
  return typeof one === 'string' ? [one] : [];
}

/** True when the field is worked out at read: it declares `derive`, or carries the kernel's own flag. */
export const isDerived = (f: { derive?: unknown; derived?: unknown }): boolean => f.derive !== undefined || f.derived === true;

/** The link a `via` field is read through and the field it reads there, or `null` for any other shape. */
export function throughOf(derive: unknown): { ref: string; field: string } | null {
  if (derive === null || typeof derive !== 'object') return null;
  const via = (derive as { via?: unknown }).via as { ref?: unknown; field?: unknown } | undefined;
  return via !== null && typeof via === 'object' && typeof via.ref === 'string' && typeof via.field === 'string' ? { ref: via.ref, field: via.field } : null;
}

/** The pairs and lists a numeric shape reads: `sum` takes two or more, the others exactly two. */
function pairFault(id: string, shape: DeriveShape, body: unknown): Refusal | null {
  const many = shape === 'sum';
  const ok = Array.isArray(body) && body.every((s) => typeof s === 'string') && (many ? body.length >= 2 : body.length === 2);
  if (ok) return null;
  return fault(
    many
      ? `${id} adds up two or more of its other fields, written as sum: [price, tax].`
      : `${id} reads two of its other fields, written as ${shape}: [first, second].`,
    `${id}.derive.${shape}`,
  );
}

/** The body of `band`, `via` or `normalise`, before any source is looked up. */
function bodyFault(f: DeriveField, shape: DeriveShape, body: unknown): Refusal | null {
  const id = f.id;
  const at = `${id}.derive.${shape}`;
  if (shape === 'band') {
    const steps = isPart(body) ? body.steps : undefined;
    const good =
      isPart(body) &&
      typeof body.of === 'string' &&
      Array.isArray(steps) &&
      steps.length > 0 &&
      steps.every((s) => isPart(s) && typeof s.upto === 'number' && Number.isFinite(s.upto) && typeof s.is === 'string' && s.is !== '') &&
      (body.else === undefined || (typeof body.else === 'string' && body.else !== ''));
    if (!good)
      return fault(`${id} sorts one number into bands, written as band: { of: amount, steps: [{ upto: 100, is: small }], else: large }.`, at);
    const ups = (steps as BandStep[]).map((s) => s.upto);
    if (ups.some((u, i) => i > 0 && u <= ups[i - 1]!))
      return fault(`${id}'s bands go from the smallest upto to the largest, each larger than the one before.`, `${at}.steps`);
    if (f.type === 'enum') {
      const values = Array.isArray(f.values) ? f.values : [];
      const words = [...(steps as BandStep[]).map((s) => s.is), ...(typeof body.else === 'string' ? [body.else] : [])];
      const stray = words.find((w) => !values.includes(w));
      if (stray !== undefined) return fault(`${id} is an enum without the value ${stray}, which one of its bands gives.`, `${at}.steps`);
    }
    return null;
  }
  if (shape === 'via') {
    if (isPart(body) && typeof body.ref === 'string' && typeof body.field === 'string') return null;
    return fault(`${id} reads one field through a link of this list, written as via: { ref: account, field: name }.`, at);
  }
  if (isPart(body) && typeof body.of === 'string' && (NORMALISE_HOW as readonly string[]).includes(String(body.how))) return null;
  return fault(`${id} folds one text field, written as normalise: { of: name, how: lower }, where how is lower, trim or digits.`, at);
}

/** Whether the field's own type can hold what the shape gives, given the sources' types. One sentence, or null. */
function typeFault(f: DeriveField, shape: DeriveShape, body: unknown, src: readonly DeriveField[], theirs?: readonly DeriveField[]): Refusal | null {
  const id = f.id;
  const at = `${id}.derive.${shape}`;
  const types = src.map((s) => s.type);
  const all = (ok: (t: string) => boolean): boolean => types.every(ok);
  const cannot = (what: string): Refusal => fault(`${id} is ${a(f.type)}, and ${what}.`, at);
  if (shape === 'sum' || shape === 'diff') {
    const word = shape === 'sum' ? 'a sum' : 'a difference';
    if (f.type === 'money') {
      if (!all((t) => t === 'money')) return cannot(`${word} of money adds money to money, so every field it reads is money`);
      const loose = src.find((s) => s.currency_fixed !== true && typeof s.currency_from !== 'string');
      if (loose !== undefined)
        return fault(`${id} adds money from ${loose.id}, whose currency is not fixed, so give ${loose.id} currency_fixed or currency_from.`, at);
      return null;
    }
    if (f.type === 'quantity') return all((t) => t === 'quantity') ? null : cannot(`${word} of quantities reads quantities only`);
    if (f.type === 'int' || f.type === 'duration') return all((t) => t === f.type) ? null : cannot(`${word} that is ${a(f.type)} reads ${f.type} fields only`);
    if (f.type === 'decimal') return all((t) => t === 'int' || t === 'decimal') ? null : cannot(`${word} that is a decimal reads whole numbers and decimals`);
    return cannot(`${word} is money, a quantity or a number`);
  }
  if (shape === 'product') {
    const plain = (t: string): boolean => t === 'int' || t === 'decimal' || t === 'quantity';
    if (f.type === 'money')
      return types.filter((t) => t === 'money').length === 1 && types.some(plain) ? null : cannot('a product that is money is one money field times one number');
    if (f.type === 'int') return all((t) => t === 'int') ? null : cannot('a product that is a whole number reads two whole numbers');
    if (f.type === 'decimal') return all(plain) ? null : cannot('a product that is a decimal reads two numbers');
    return cannot('a product is money, a whole number or a decimal');
  }
  if (shape === 'ratio') {
    if (f.type !== 'decimal') return cannot('a ratio is a decimal');
    const num = (t: string): boolean => NUMBER.has(t) || t === 'quantity';
    return all((t) => t === 'money') || all(num) ? null : cannot('a ratio reads two numbers, or two money fields');
  }
  if (shape === 'band') {
    if (f.type !== 'enum' && f.type !== 'text') return cannot('a band gives a word, so it is an enum or a text');
    return all((t) => NUMBER.has(t) || t === 'money' || t === 'quantity') ? null : cannot(`a band sorts a number, and ${src[0]?.id} is not one`);
  }
  if (shape === 'via') {
    const link = src[0]!;
    if (link.type === 'list' && link.of === 'ref') return fault(`${id} reads through ${link.id}, which is a list of links, and via reads through one link.`, at);
    if (link.type !== 'ref') return fault(`${id} reads through ${link.id}, which is ${a(link.type)}, and via reads through a link.`, at);
    if (theirs === undefined) return null;
    const target = theirs.find((g) => g.id === (body as { field: string }).field && g.retired !== true);
    const there = String(link.to);
    if (target === undefined) return fault(`${id} reads ${(body as { field: string }).field} of ${there}, and ${there} has no such field.`, `${at}.field`);
    if (isDerived(target)) return fault(`${id} reads ${target.id} of ${there}, which is itself worked out, so read a field ${there} stores.`, `${at}.field`);
    if (target.type !== f.type || target.of !== f.of)
      return fault(`${id} is ${a(f.type)}, and ${target.id} of ${there} is ${a(target.type)}, so give ${id} the type ${target.type}.`, at);
    return null;
  }
  if (f.type !== 'text') return cannot('normalise gives text');
  return all((t) => TEXTLIKE.has(t)) ? null : cannot(`normalise folds text, and ${src[0]?.id} is not text`);
}

/**
 * What is wrong with a field's `derive:`, or null. `fields` are the list's own; `theirs`, when the record or the batch
 * holds it, are the fields of the list a `via` link points at, and without it the far field is checked where it is read.
 *
 * In this order, because each answer sends the author somewhere different: the shape, the keys that cannot sit beside
 * it, the shape's own body, its sources, and last whether the field's type holds what the shape gives.
 */
export function deriveFault(field: DeriveField, fields: readonly DeriveField[], theirs?: readonly DeriveField[]): Refusal | null {
  if (field.derive === undefined) return null;
  const id = field.id;
  const got = shapeOf(field.derive);
  if (got === null) {
    const keys = isPart(field.derive) ? Object.keys(field.derive) : [];
    const stray = keys.find((k) => !(DERIVE_SHAPES as readonly string[]).includes(k));
    return fault(
      stray !== undefined && keys.length === 1
        ? `${id} is worked out by ${stray}, which is not a shape; use one of ${DERIVE_SHAPES.join(', ')}.`
        : `${id} is worked out by exactly one of ${DERIVE_SHAPES.join(', ')}, like derive: { product: [price, quantity] }.`,
      `${id}.derive`,
    );
  }
  for (const key of DERIVE_REFUSES) {
    const v = field[key];
    if (v === undefined || v === false) continue;
    return fault(
      key === 'index' || key === 'unique'
        ? `${id} is worked out at read and never stored, so it cannot be ${key === 'index' ? 'indexed' : 'unique'}; drop ${key}.`
        : `${id} is worked out at read and never written, so ${key} is never read; drop ${key}.`,
      `${id}.${key}`,
    );
  }
  const { shape, body } = got;
  const shaped = shape === 'band' || shape === 'via' || shape === 'normalise' ? bodyFault(field, shape, body) : pairFault(id, shape, body);
  if (shaped !== null) return shaped;
  const src: DeriveField[] = [];
  for (const name of sourcesOf(field.derive)) {
    const at = `${id}.derive.${shape}`;
    if (name === id) return fault(`${id} is worked out from itself; name the other fields it reads.`, at);
    const s = fields.find((g) => g.id === name && g.retired !== true);
    if (s === undefined) return fault(`${id} reads ${name}, and this list has no field called ${name}.`, at);
    /* A FIELD WORKED OUT FROM ANOTHER WORKED OUT IS READ IN ORDER (`derive-rows.ts` `withDerived`), so `least = product
       [cost, margin]` reads the cost the row's parts make. A ring is refused, since neither end can be worked out first.
       A link a `via` reads through is a stored link, and a field the kernel works out itself has no `derive:` to order
       by, so both are still refused. */
    if (isDerived(s) && (shape === 'via' || s.derive === undefined || shapeOf(s.derive) === null))
      return fault(`${id} reads ${name}, which is itself worked out; read the fields ${name} is made from.`, at);
    if (isDerived(s) && readsBack(s, id, fields)) return fault(`${id} reads ${name}, which reads ${id} back, so neither can be worked out.`, at);
    src.push(s);
  }
  return typeFault(field, shape, body, src, theirs);
}

/** Whether `from`, worked out, reads `id` through any chain of fields worked out on the same list. */
function readsBack(from: DeriveField, id: string, fields: readonly DeriveField[]): boolean {
  const seen = new Set<string>();
  const walk = (f: DeriveField): boolean => {
    if (seen.has(f.id)) return false;
    seen.add(f.id);
    for (const name of sourcesOf(f.derive)) {
      if (name === id) return true;
      const next = fields.find((g) => g.id === name && g.retired !== true && g.derive !== undefined);
      if (next !== undefined && walk(next)) return true;
    }
    return false;
  };
  return walk(from);
}

/* ── the value ─────────────────────────────────────────────────────────── */

type Money = { amount: number; currency: string };
type Quantity = { value: number; unit: string };

const isMoney = (v: unknown): v is Money => isPart(v) && Number.isInteger(v.amount) && typeof v.currency === 'string';
const isQuantity = (v: unknown): v is Quantity => isPart(v) && typeof v.value === 'number' && Number.isFinite(v.value) && typeof v.unit === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Fifteen significant digits, what `coerce` lets a decimal hold, so 0.1 + 0.2 reads 0.3 and not its float. */
const tidy = (n: number): number => Number(n.toPrecision(15));

/**
 * An amount in minor units back to an integer, half away from zero, or null past 2^53 - 1. Tidied first below 10^15,
 * because 25 pence times 0.58 is 14.499999999999998 as a float and 14.5 in fact, and the half rounds up to 15.
 */
function minor(n: number): number | null {
  const r = Math.sign(n) * Math.round(Math.abs(Math.abs(n) < 1e15 ? tidy(n) : n));
  return Number.isSafeInteger(r) ? r + 0 : null;
}

/** A plain number out of a value: a number itself, or a quantity's value. Money is not a plain number. */
const plainOf = (v: unknown): number | null => (isNum(v) ? v : isQuantity(v) ? v.value : null);

/** The number a band compares: a number, a quantity's value, or a money's amount in minor units. */
const measureOf = (v: unknown): number | null => (isMoney(v) ? v.amount : plainOf(v));

/** One shared currency or unit across values, or null when there are two. */
function oneOf<T>(vs: readonly T[], key: (v: T) => string): string | null {
  const first = key(vs[0]!);
  return vs.every((v) => key(v) === first) ? first : null;
}

/**
 * The value of a derived field on one row, or null. `row` is the row's own fields. `via` is what the page's resolver
 * answered for a `via` field: each linked row id the reader may open, and the far field's value on it. A link not in
 * it, because the reader cannot open that row or it is gone, derives null, the same as a link never written.
 *
 * The field is trusted to have passed `deriveFault`; a value of the wrong shape on the row still gives null rather
 * than a throw, because a row written before a field's type changed is read as it is.
 */
export function derived(row: Readonly<Record<string, Json | undefined>>, field: DeriveField, via?: ReadonlyMap<string, Json>): Json {
  const got = shapeOf(field.derive);
  if (got === null) return null;
  const { shape, body } = got;
  const read = (name: string): Json | null => {
    const v = row[name];
    return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0) ? null : v;
  };
  if (shape === 'sum' || shape === 'diff' || shape === 'product' || shape === 'ratio') {
    const vs = (body as readonly string[]).map(read);
    if (vs.some((v) => v === null)) return null;
    return arithmetic(shape, field.type, vs as Json[]);
  }
  const b = body as Record<string, unknown>;
  if (shape === 'band') {
    const n = measureOf(read(String(b.of)));
    if (n === null) return null;
    const step = (b.steps as readonly BandStep[]).find((s) => n <= s.upto);
    return step !== undefined ? step.is : typeof b.else === 'string' ? b.else : null;
  }
  if (shape === 'via') {
    const link = read(String(b.ref));
    if (typeof link !== 'string' || via === undefined) return null;
    return via.get(link) ?? null;
  }
  const text = read(String(b.of));
  if (typeof text !== 'string') return null;
  const out = b.how === 'lower' ? text.toLowerCase() : b.how === 'trim' ? text.trim() : text.replace(/\D/gu, '');
  return out === '' ? null : out;
}

/** `sum`, `diff`, `product` and `ratio` over values all present, typed by the field that holds the answer. */
function arithmetic(shape: 'sum' | 'diff' | 'product' | 'ratio', type: string, vs: readonly Json[]): Json {
  if (shape === 'product') {
    const [x, y] = vs as [Json, Json];
    if (type === 'money') {
      const money = isMoney(x) ? x : isMoney(y) ? y : null;
      const times = plainOf(money === x ? y : x);
      if (money === null || times === null) return null;
      const amount = minor(money.amount * times);
      return amount === null ? null : { amount, currency: money.currency };
    }
    const p = plainOf(x);
    const q = plainOf(y);
    if (p === null || q === null) return null;
    return type === 'int' ? minor(p * q) : tidy(p * q);
  }
  if (shape === 'ratio') {
    const [x, y] = vs as [Json, Json];
    if (isMoney(x) || isMoney(y)) {
      if (!isMoney(x) || !isMoney(y) || x.currency !== y.currency || y.amount === 0) return null;
      return tidy(x.amount / y.amount);
    }
    if (isQuantity(x) && isQuantity(y) && x.unit !== y.unit) return null;
    const p = plainOf(x);
    const q = plainOf(y);
    return p === null || q === null || q === 0 ? null : tidy(p / q);
  }
  /* sum and diff: one kind across every value, and one currency or one unit, or no answer. */
  const signed = (n: number, i: number): number => (shape === 'diff' && i > 0 ? -n : n);
  if (type === 'money') {
    if (!vs.every(isMoney)) return null;
    const currency = oneOf(vs, (v) => v.currency);
    if (currency === null) return null;
    const amount = minor(vs.reduce((t, v, i) => t + signed(v.amount, i), 0));
    return amount === null ? null : { amount, currency };
  }
  if (type === 'quantity') {
    if (!vs.every(isQuantity)) return null;
    const unit = oneOf(vs, (v) => v.unit);
    return unit === null ? null : { value: tidy(vs.reduce((t, v, i) => t + signed(v.value, i), 0)), unit };
  }
  if (!vs.every(isNum)) return null;
  const total = vs.reduce((t, v, i) => t + signed(v, i), 0);
  return type === 'decimal' ? tidy(total) : minor(total);
}
