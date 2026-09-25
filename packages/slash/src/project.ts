/**
 * The checks that stand between a model's JSON and a suggestion a person reads.
 *
 * FOUR OF THEM, IN THIS ORDER, and nothing is filed until all four have passed: the schema, the
 * citation rule, the anchor rule, and whatever the job adds on top. `46 §8`'s last-but-one row is
 * this file: *"schema then cite then class check then record.propose; a failure at any step files
 * nothing."*
 *
 * THE ONE HARD RULE IS RULE 1 OF THE SYSTEM PROMPT AND IT IS NOT TRUSTED TO THE MODEL. A figure a
 * model typed is a figure nobody can check, and this product's whole posture is that a number in
 * front of a person is a number with a row behind it. `cite()` is where that stops being a
 * sentence in a prompt and becomes a refusal.
 *
 * THE TOKEN COUNT IS `bytes / 3` AND THAT IS A DELIBERATE CEILING (`46 §10`). It over-counts
 * English by about a quarter and holds for Arabic, which is the direction to be wrong in: a prompt
 * this thinks is 8,000 tokens and the provider reads as 6,300 costs a few dropped rows, where the
 * other direction costs a refused call. It is swapped for the provider's counter the day the
 * `usage.in ≤ 1.3 × tokens(prompt)` assertion fails on a fixture.
 */

import { no, ok, type Refusal, type Result } from '@braindog/ports';

import type { Citable, Projection, RawPayload } from './types.ts';

const UTF8 = new TextEncoder();

/** The local estimate, `46 §7`. Never billed: the account row uses the provider's `usage`. */
export const tokens = (text: string): number => Math.ceil(UTF8.encode(text).length / 3);

/**
 * The first `n` bytes of a string, cut on a character boundary.
 *
 * CUT ON THE CHARACTER AND NOT ON THE BYTE, because a shape is a grouping key: half a UTF-8
 * sequence would make two subjects that differ only in where the cut landed into two shapes, and
 * `24 §4.3` groups unmatched arrivals on exactly this string.
 */
export const firstBytes = (text: string, n: number): string => {
  if (UTF8.encode(text).length <= n) return text;
  let out = '';
  let used = 0;
  for (const ch of text) {
    const size = UTF8.encode(ch).length;
    if (used + size > n) break;
    out += ch;
    used += size;
  }
  return out;
};

/**
 * The grouping key for an arrival nothing parsed: `channel | sender domain | digit-blanked subject`.
 *
 * DETERMINISTIC, AND COMPUTED BEFORE THE MODEL RATHER THAN BY IT (`46 §13` D15). The model's whole
 * contribution to triage is `kind` and `actionable`; the shape is the part another payload has to
 * match exactly for the two to be one group, and a model that answers a shape answers a different
 * one for the same message on a bad day. Three receipts from one bank differing only in the amount
 * are one shape here, which is what lets the unmatched-ingest count reach its floor of three.
 *
 * ONE NUMBER IS ONE `#`, THOUSANDS SEPARATORS INCLUDED. A comma between two digit runs is part of
 * the number and not a word boundary, so `EGP 1,299.00` and `EGP 940.50` both become `EGP #.#`.
 * Masking each digit run on its own would print `#,#.#` for the first and `#.#` for the second,
 * and the two receipts from one bank that differ only in whether the amount passed a thousand
 * would then sit in two groups, neither of which ever reaches the floor of three.
 */
const NUMBER = /[0-9]+(?:,[0-9]+)*/gu;

export const shapeOf = (raw: RawPayload): string => {
  const at = raw.from === null ? '' : raw.from.slice(raw.from.lastIndexOf('@') + 1).toLowerCase();
  const subject = firstBytes((raw.subject ?? '').replaceAll(NUMBER, '#'), 64);
  return `${raw.channel}|${at}|${subject}`;
};

/**
 * What a figure may be pinned to, built once per projection (`46 §5.6`).
 *
 * THE TYPES COME FROM THE INDEX AND NOT FROM THE VALUE'S SHAPE. A money field is money because the
 * register says so; sniffing `{ amount, currency }` off a value would make any object with those
 * two keys quotable, and a `json` field holding a webhook's echo of a payment is exactly that
 * object with no register behind it.
 */
export const citable = (p: Projection): Citable => {
  const typeOf = new Map<string, string>();
  for (const reg of p.index.registers) for (const f of reg.fields) typeOf.set(`${reg.id}.${f.id}`, f.type);

  const out: Citable = { spoken: new Set(), paths: new Set(), money: new Set(), days: new Set() };
  for (const row of p.rows) {
    out.spoken.add(row.spoken);
    for (const [field, value] of Object.entries(row.fields)) {
      out.paths.add(`${row.spoken}.${field}`);
      const type = typeOf.get(`${row.register}.${field}`);
      if (type === 'money' && isMoney(value)) out.money.add(`${value.amount} ${value.currency}`);
      if (type === 'day' && typeof value === 'string') out.days.add(value);
    }
  }
  return out;
};

const isMoney = (v: unknown): v is { amount: number; currency: string } =>
  typeof v === 'object' && v !== null && typeof (v as { amount?: unknown }).amount === 'number'
  && typeof (v as { currency?: unknown }).currency === 'string';

/** `34 §2.3`: eight typed kinds and no ninth. A `{{rows:14}}` is refused for being the ninth. */
const TYPED = new Set(['date', 'day', 'until', 'ago', 'money', 'quantity', 'pct', 'ref']);

/** `34 §4`: the qualified spoken id, and the prefix every path over a row starts with. */
const QUALIFIED = /^([a-z][a-z0-9_]*)#([1-9][0-9]*)/u;

/** A typed argument is a literal when it starts with a digit or a minus, and a path when it starts with a letter. */
const isLiteral = (arg: string): boolean => /^[-0-9]/u.test(arg);

const NAME_IT = 'Name the path this figure comes from, or leave it out.';

const blank = (m: string): string => ' '.repeat(m.length);

/** Backtick spans are lifted first, so nothing inside one is read as prose or as an interpolation. */
const CODE_SPAN = /`[^`\n]*`/gu;
const INTERPOLATION = /\{\{[^}\n]*\}\}/gu;

/**
 * `cite(text, allowed)`: the one hard rule, as a procedure (`46 §5.7`).
 *
 * POSITIONS ARE PRESERVED BY BLANKING RATHER THAN BY DELETING, because the refusal has to say WHERE,
 * and `at: "about 40%"` is a repair while `at: "the text"` is a shrug. The same reason
 * `tools/gates/em-dash.mjs` blanks comments instead of stripping them.
 *
 * THE DIGIT SCAN RUNS OVER WHAT IS LEFT after code spans and interpolations are blanked, so the two
 * legitimate homes for a digit are the two that survive. Everything else, including a year, a
 * percentage and the word "2" in a sentence, is a figure with nothing behind it.
 */
export const cite = (text: string, allowed: Citable): Result<{ text: string; citations: string[] }> => {
  const spans = text.replace(CODE_SPAN, blank);
  const bare = spans.replace(INTERPOLATION, blank);

  const digit = bare.search(/[0-9]/u);
  if (digit >= 0) return no('PROPOSAL_UNCITED', NAME_IT, { at: around(bare, digit) });

  const citations: string[] = [];
  const add = (id: string): void => {
    if (!citations.includes(id)) citations.push(id);
  };

  for (const match of spans.matchAll(INTERPOLATION)) {
    const whole = match[0];
    const inner = whole.slice(2, -2).trim();
    const colon = inner.indexOf(':');

    if (colon < 0) {
      const fault = pathFault(inner, allowed);
      if (fault) return no('PROPOSAL_UNCITED', NAME_IT, { at: whole });
      addPath(inner, add);
      continue;
    }

    const kind = inner.slice(0, colon);
    const arg = inner.slice(colon + 1).trim();
    if (!TYPED.has(kind)) return no('PROPOSAL_UNCITED', NAME_IT, { at: whole });

    if (!isLiteral(arg)) {
      /* A PATH ARGUMENT FOLLOWS THE PATH RULE, whatever the kind is: `{{money:obligations#7.amount}}`
         is the row's own value rendered as money, which is the form `34 §2.3` says a rule's `say:`
         template uses, and it is cited by the row it names. */
      if (pathFault(arg, allowed)) return no('PROPOSAL_UNCITED', NAME_IT, { at: whole });
      addPath(arg, add);
      if (kind === 'ref') add(arg);
      continue;
    }

    /* A COMPUTED FIGURE IS A METRIC PATH OR IT IS NOTHING. `{{pct:-46.3}}` and `{{quantity:3 days}}`
       are the model doing arithmetic and quoting itself, and no row holds the answer to compare. */
    if (kind === 'pct' || kind === 'quantity') return no('PROPOSAL_UNCITED', NAME_IT, { at: whole });
    if (kind === 'money' && !allowed.money.has(arg)) return no('PROPOSAL_UNCITED', NAME_IT, { at: whole });
    if (kind !== 'money' && !allowed.days.has(arg)) return no('PROPOSAL_UNCITED', NAME_IT, { at: whole });
  }

  return ok({ text, citations });
};

/** `{{ref:X}}` needs a row; every other path needs a path or a row. */
const pathFault = (path: string, allowed: Citable): boolean =>
  !allowed.paths.has(path) && !allowed.spoken.has(path);

/** A path over a row cites that row. A bare metric id names no row and cites nothing. */
const addPath = (path: string, add: (id: string) => void): void => {
  const qualified = QUALIFIED.exec(path);
  if (qualified) add(qualified[0]);
};

/**
 * The span a refused digit sits in: the token holding it, and the word before it.
 *
 * TWO WORDS BECAUSE ONE IS NOT A SENTENCE. `at: "40%"` sends a person looking for a number they
 * cannot find in their own text; `at: "about 40%"` is searchable.
 */
const around = (text: string, at: number): string => {
  let start = at;
  while (start > 0 && text[start - 1] !== ' ' && text[start - 1] !== '\n') start--;
  let end = at;
  while (end < text.length && text[end] !== ' ' && text[end] !== '\n') end++;
  let prev = start;
  while (prev > 0 && (text[prev - 1] === ' ' || text[prev - 1] === '\n')) prev--;
  let head = prev;
  while (head > 0 && text[head - 1] !== ' ' && text[head - 1] !== '\n') head--;
  return text.slice(head, end).trim();
};

/**
 * Every anchor a proposed ingest body copies out of a message, in the order they are declared.
 *
 * WHAT COUNTS AS AN ANCHOR: the literal under a `match` operator, and the needles an extractor cuts
 * on. Not the field names, not the register, not the format tokens, because none of those is a
 * claim about what the message said.
 */
export const anchorsOf = (ingest: Record<string, unknown>): { path: string; anchor: string }[] => {
  const out: { path: string; anchor: string }[] = [];
  const MATCH_OPS = ['is', 'contains', 'starts', 'ends'];
  const CUT_OPS = ['after', 'before', 'between'];

  const match = ingest['match'];
  if (isRecord(match)) {
    for (const [field, clause] of Object.entries(match)) {
      if (!isRecord(clause)) continue;
      for (const op of MATCH_OPS) {
        const value = clause[op];
        if (typeof value === 'string') out.push({ path: `match.${field}.${op}`, anchor: value });
      }
    }
  }

  const extract = ingest['extract'];
  if (isRecord(extract)) {
    for (const [field, clause] of Object.entries(extract)) {
      if (!isRecord(clause)) continue;
      for (const op of CUT_OPS) {
        const value = clause[op];
        if (typeof value === 'string') out.push({ path: `extract.${field}.${op}`, anchor: value });
        else if (Array.isArray(value))
          value.forEach((v, i) => {
            if (typeof v === 'string') out.push({ path: `extract.${field}.${op}[${i}]`, anchor: v });
          });
      }
    }
  }
  return out;
};

/**
 * The anchor check (`46 §5.3` 5b): every anchor stands, verbatim, in at least one sample.
 *
 * THIS IS THE CITATION RULE FOR A PATTERN. A model that invents `" - "` as a separator has written a
 * pattern that matches nothing and will be reviewed by somebody who has to run it to find out. The
 * three fields it may have read from are `from`, `subject` and `body`, and nothing else in the
 * payload was in the prompt.
 */
export const anchorFault = (ingest: Record<string, unknown>, samples: readonly RawPayload[]): Refusal | null => {
  const haystacks = samples.flatMap((s) => [s.from ?? '', s.subject ?? '', s.body]);
  for (const { path, anchor } of anchorsOf(ingest)) {
    if (anchor === '') continue;
    if (!haystacks.some((h) => h.includes(anchor)))
      return {
        code: 'PROPOSAL_UNCITED',
        fix: NAME_IT,
        at: path,
      };
  }
  return null;
};

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The result schema, re-checked by hand after the provider has answered.
 *
 * WHY BY HAND AND WHY AGAIN. Every call sends its schema as `jsonSchema`, and a provider that
 * supports constrained decoding honours it; a provider that does not, and a gateway that dropped
 * the field on the way through, both return valid JSON of the wrong shape and neither says so. The
 * difference is invisible at the call site, and the thing downstream of it is a write in front of
 * a person.
 *
 * A SUBSET OF JSON SCHEMA AND NOT A VALIDATOR (`46 §10`): `type` (one name or a list), `required`,
 * `enum`, `additionalProperties: false`, and an array's `items.type`. That is exactly what the
 * three templates in `prompts.ts` use. `declare`'s Valibot path is the answer if a schema here ever
 * grows past ten keys; three keys does not earn a dependency.
 */
export const checkSchema = (schema: object, value: unknown, at = ''): Refusal | null => {
  const s = schema as Record<string, unknown>;
  const kinds = typeof s['type'] === 'string' ? [s['type']] : Array.isArray(s['type']) ? s['type'] : [];

  if (kinds.length > 0 && !kinds.some((k) => isType(k, value))) return schemaFault(at);

  if (Array.isArray(s['enum']) && !s['enum'].includes(value))
    return { ...schemaFault(at), allowed: s['enum'].map(String) };

  if (isRecord(value) && kinds.includes('object')) {
    const properties = isRecord(s['properties']) ? s['properties'] : {};
    for (const key of Array.isArray(s['required']) ? s['required'] : [])
      if (!Object.hasOwn(value, String(key))) return schemaFault(join(at, String(key)));

    if (s['additionalProperties'] === false)
      for (const key of Object.keys(value))
        if (!Object.hasOwn(properties, key)) return schemaFault(join(at, key));

    for (const [key, sub] of Object.entries(properties)) {
      if (!Object.hasOwn(value, key)) continue;
      if (!isRecord(sub)) continue;
      const fault = checkSchema(sub, value[key], join(at, key));
      if (fault) return fault;
    }
  }

  if (Array.isArray(value) && kinds.includes('array')) {
    const items = isRecord(s['items']) ? s['items'] : null;
    if (typeof s['minItems'] === 'number' && value.length < s['minItems'])
      return schemaFault(at);
    if (typeof s['maxItems'] === 'number' && value.length > s['maxItems'])
      return schemaFault(at);
    if (items)
      for (let i = 0; i < value.length; i++) {
        const fault = checkSchema(items, value[i], `${at}[${i}]`);
        if (fault) return fault;
      }
  }

  return null;
};

const join = (at: string, key: string): string => (at === '' ? key : `${at}.${key}`);

const schemaFix = (at: string): string =>
  `The model's answer did not match the schema${at === '' ? '' : ` at ${at}`}. Nothing was filed; ask again.`;

const schemaFault = (at: string): Refusal => ({
  code: 'PROPOSAL_SCHEMA',
  fix: schemaFix(at),
  ...(at === '' ? {} : { at }),
});

const isType = (kind: unknown, value: unknown): boolean => {
  switch (kind) {
    case 'object':
      return isRecord(value);
    case 'array':
      return Array.isArray(value);
    case 'null':
      return value === null;
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    default:
      return false;
  }
};
