/**
 * The sixteen types, in and out.
 *
 * ONE JOB: turn what a caller sent into the canonical form the record stores, or refuse it with a
 * sentence. Every value that reaches a row goes through here, which is why the refusals are specific
 * rather than a single VALUE_MALFORMED — a caller told "not a valid money" learns nothing, and a
 * caller told "amount is a float; money is an integer in minor units" fixes it on the next call.
 *
 * THE TWO TEXT REFUSALS ARE HERE BECAUSE THEY ARE REAL BUGS, NOT PEDANTRY. `TEXT_JSON_QUOTED` is a
 * client that stringified a string and sent `"\"hello\""`; the value looks right in a log and wrong
 * on a screen, for ever. `TEXT_ESCAPED_NEWLINE` is a note containing the two characters backslash
 * and `n` where a line break was meant — written once by an agent, read a hundred times by a person.
 * Both are silent, both survive a round trip, and neither is detectable later.
 *
 * MONEY IS AN INTEGER IN MINOR UNITS, and a float `amount` is refused rather than rounded. Rounding
 * is how a record ends up 1p out on a figure somebody is about to act on, and the rounding is
 * invisible at the moment it happens.
 */

import type { Refusal } from '@braindog/ports';

/** Canonical JSON: what a field holds once it is in the record. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** The sixteen, plus the two containers. `list<T>` carries its element type in `of`. */
export type FieldType =
  | 'text'
  | 'document'
  | 'int'
  | 'duration'
  | 'decimal'
  | 'money'
  | 'quantity'
  | 'day'
  | 'instant'
  | 'bool'
  | 'enum'
  | 'ref'
  | 'file'
  | 'url'
  | 'email'
  | 'secret'
  | 'list'
  | 'json';

export type FieldDecl = {
  id: string;
  type: FieldType;
  /** `list<T>`'s element type. */
  of?: Exclude<FieldType, 'list'>;
  values?: readonly string[];
  to?: string;
};

export type Coerced = { ok: true; value: Json } | { ok: false; refusal: Refusal };

const bad = (code: string, fix: string, at: string, extra: Omit<Refusal, 'code' | 'fix' | 'at'> = {}): Coerced => ({
  ok: false,
  refusal: { code, fix, at, ...extra },
});

const good = (value: Json): Coerced => ({ ok: true, value });

/** 2^53 − 1: past it, an integer is no longer exactly itself, and money stops being money. */
const MAX_SAFE = Number.MAX_SAFE_INTEGER;

const INT_STRING = /^-?\d+$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY = /^[A-Za-z]{3}$/;
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const GRANT = /^g_[0-9A-HJKMNP-TV-Z]{26}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const SPOKEN = /^([a-z][a-z0-9_]{0,31})#(\d+)$/;

/** A string that is a JSON-quoted string: a client that stringified a value it already had. */
export function isJsonQuoted(s: string): boolean {
  if (s.length < 2 || s[0] !== '"' || s.at(-1) !== '"') return false;
  try {
    return typeof JSON.parse(s) === 'string';
  } catch {
    return false;
  }
}

/** The two characters backslash and `n`, with no real newline anywhere in the string. */
export const hasEscapedNewline = (s: string): boolean => s.includes('\\n') && !s.includes('\n');

/** A day that exists. `2026-02-30` matches the shape and is not a date. */
export function isRealDay(s: string): boolean {
  const m = DAY.exec(s);
  if (!m) return false;
  const [y, mo, d] = s.split('-').map(Number) as [number, number, number];
  const back = new Date(Date.UTC(y, mo - 1, d));
  return back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === d;
}

/** `YYYY-MM-DDTHH:MM:SS.mmmZ`, which is the only instant shape the record stores. */
export const instant = (ms: number): string => new Date(ms).toISOString();

/** `obligations#41` — the id a person says out loud. */
export const spoken = (register: string, seq: number): string => `${register}#${seq}`;

export function parseSpoken(s: string): { register: string; seq: number } | null {
  const m = SPOKEN.exec(s.trim());
  return m ? { register: m[1]!, seq: Number(m[2]) } : null;
}

/**
 * Turn one value into what the record stores, or refuse it.
 *
 * `resolve` is how a `ref` given as a spoken id becomes a row id, and a `secret` is checked against
 * the grants that exist. Both are lookups the caller owns, because this module may not touch SQL.
 */
export type Lookups = {
  /** `obligations#41` to the row's 26-character id, or `null` when there is no such row. */
  refId?: (register: string, seq: number) => string | null;
  /** Does a grant with this id exist? */
  grantExists?: (id: string) => boolean;
};

export function coerce(field: FieldDecl, value: unknown, look: Lookups = {}, at = field.id): Coerced {
  const malformed = (fix: string, extra?: Omit<Refusal, 'code' | 'fix' | 'at'>) =>
    bad('VALUE_MALFORMED', fix, at, extra ?? {});

  switch (field.type) {
    case 'text':
    case 'document': {
      if (typeof value !== 'string') return malformed(`${at} takes a string.`);
      /* In this order: a JSON-quoted string also contains no newline, and reporting the second would
         send the caller looking for a line break that was never the problem. */
      if (isJsonQuoted(value))
        return bad(
          'TEXT_JSON_QUOTED',
          `${at} arrived as a JSON-quoted string. Send the text itself, not the result of stringifying it.`,
          at,
        );
      if (hasEscapedNewline(value))
        return bad(
          'TEXT_ESCAPED_NEWLINE',
          `${at} contains the two characters backslash and n, and no line break anywhere. Send a real newline — or, if those two characters are meant literally, a value with a real line break in it as well.`,
          at,
        );
      // A `document` is the dialect, and the dialect is line-based: CRLF would put a stray CR in
      // every fence. Text is left exactly as it arrived.
      return good(field.type === 'document' ? value.replace(/\r\n/g, '\n') : value);
    }

    case 'int':
    case 'duration': {
      const n = typeof value === 'string' && INT_STRING.test(value.trim()) ? Number(value.trim()) : value;
      if (typeof n !== 'number' || !Number.isFinite(n)) return malformed(`${at} takes a whole number.`);
      if (!Number.isInteger(n)) return malformed(`${at} takes a whole number; ${n} has a fraction.`);
      if (Math.abs(n) > MAX_SAFE)
        return bad('INT_OUT_OF_RANGE', `${at} is past 2^53 − 1, where a number stops being exactly itself.`, at);
      return good(n);
    }

    case 'decimal': {
      const n = typeof value === 'string' && value.trim() !== '' ? Number(value.trim()) : value;
      if (typeof n !== 'number' || !Number.isFinite(n)) return malformed(`${at} takes a number.`);
      const digits = String(Math.abs(n)).replace(/[-.eE+]/g, '').replace(/^0+/, '').length;
      if (digits > 15)
        return malformed(`${at} has more than fifteen significant digits, which a double cannot hold exactly.`);
      return good(n);
    }

    case 'money': {
      if (typeof value !== 'object' || value === null || Array.isArray(value))
        return malformed(`${at} takes { amount, currency }, where amount is an integer in minor units.`);
      const raw = value as Record<string, unknown>;
      if ('minor' in raw && !('amount' in raw))
        return malformed(`${at} has a key called minor; a money value's number is called amount.`);
      const amountIn = raw.amount;
      const amount =
        typeof amountIn === 'string' && INT_STRING.test(amountIn.trim()) ? Number(amountIn.trim()) : amountIn;
      if (typeof amount !== 'number' || !Number.isFinite(amount))
        return malformed(`${at}.amount takes an integer in minor units — 4800 is GBP 48.00.`);
      /* A FLOAT IS THE EXACT BUG MINOR UNITS EXIST TO STOP, so it is refused rather than rounded:
         rounding is how a record ends up a penny out on a figure somebody is about to act on. */
      if (!Number.isInteger(amount))
        return malformed(`${at}.amount is ${amount}; money is an integer in minor units, so 48.00 is 4800.`);
      if (Math.abs(amount) > MAX_SAFE)
        return bad('INT_OUT_OF_RANGE', `${at}.amount is past 2^53 − 1.`, at);
      const currency = raw.currency;
      if (typeof currency !== 'string' || !CURRENCY.test(currency))
        return malformed(`${at}.currency takes a three-letter code, and every money value carries its own.`);
      return good({ amount, currency: currency.toUpperCase() });
    }

    case 'quantity': {
      if (typeof value !== 'object' || value === null || Array.isArray(value))
        return malformed(`${at} takes { value, unit }.`);
      const raw = value as Record<string, unknown>;
      const n = typeof raw.value === 'string' && raw.value.trim() !== '' ? Number(raw.value) : raw.value;
      if (typeof n !== 'number' || !Number.isFinite(n)) return malformed(`${at}.value takes a number.`);
      if (typeof raw.unit !== 'string' || raw.unit.trim() === '')
        return malformed(`${at}.unit names what the number counts, and a quantity without one is a number.`);
      return good({ value: n, unit: raw.unit.trim() });
    }

    case 'day': {
      if (typeof value !== 'string') return malformed(`${at} takes a day, as YYYY-MM-DD.`);
      const s = value.trim();
      if (!DAY.test(s)) return malformed(`${at} takes a day, as YYYY-MM-DD. An instant is a different type.`);
      /* THE SHAPE IS NOT THE CHECK: `Date.UTC` normalises, so 2026-02-30 would become 2 March — a
         date that is not the one that was sent, stored without a word about it. */
      if (!isRealDay(s)) return malformed(`${at} is ${s}, which is not a day that exists.`);
      return good(s);
    }

    case 'instant': {
      if (typeof value !== 'string') return malformed(`${at} takes an instant.`);
      const said = value.trim();
      /* AN INSTANT CARRIES ITS ZONE, and this took `Date.parse` at its word. `2026-09-05T02:00:00`
         with no offset is read as LOCAL time by the ECMAScript grammar, and `instant()` then
         restamps it as UTC — so on a self-host at UTC+3 that value was stored as
         `2026-09-04T23:00:00Z`: the PREVIOUS DAY for every `slice(0, 10)` reader, every digest
         window and every `before today`. The same host in another timezone stores a different
         moment for the same string, which is the one thing a record that syncs cannot do.

         And it is inconsistent with itself: a bare `YYYY-MM-DD` is parsed as UTC by the same
         function, so the identical day with and without a time landed on different days.

         The `day` type next door checks its shape rather than trusting the parse, for the same
         reason. This is that check for an instant: a zone, or a sentence saying so. */
      if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(said))
        return malformed(`${at} is ${said}, which names no timezone. Write 2026-09-05T02:00:00Z, or the offset it was recorded in.`);
      const ms = Date.parse(said);
      if (!Number.isFinite(ms)) return malformed(`${at} is not an instant this record can read.`);
      return good(instant(ms));
    }

    case 'bool': {
      if (typeof value === 'boolean') return good(value);
      if (value === 'true') return good(true);
      if (value === 'false') return good(false);
      return malformed(`${at} takes true or false.`);
    }

    case 'enum': {
      // Membership is the write path's, because the refusal there can list the values.
      if (typeof value !== 'string') return malformed(`${at} takes one of its declared values.`);
      return good(value);
    }

    case 'ref': {
      if (typeof value !== 'string') return malformed(`${at} takes a row id or a spoken id.`);
      const s = value.trim();
      if (ULID.test(s)) return good(s);
      const said = parseSpoken(s);
      if (!said) return malformed(`${at} takes a row id or a spoken id like ${field.to ?? 'register'}#41.`);
      const id = look.refId?.(said.register, said.seq) ?? null;
      if (!id) return malformed(`${at} names ${s}, and there is no such row.`);
      return good(id);
    }

    case 'file': {
      if (typeof value !== 'object' || value === null || Array.isArray(value))
        return malformed(`${at} takes { sha256, mime, bytes, name }.`);
      const raw = value as Record<string, unknown>;
      if (typeof raw.sha256 !== 'string' || !SHA256.test(raw.sha256))
        return malformed(`${at}.sha256 takes sixty-four lower-case hex characters.`);
      if (typeof raw.mime !== 'string' || raw.mime === '') return malformed(`${at}.mime is missing.`);
      if (typeof raw.bytes !== 'number' || !Number.isInteger(raw.bytes) || raw.bytes < 0)
        return malformed(`${at}.bytes takes a whole number of bytes.`);
      if (typeof raw.name !== 'string' || raw.name === '') return malformed(`${at}.name is missing.`);
      return good({ sha256: raw.sha256, mime: raw.mime, bytes: raw.bytes, name: raw.name });
    }

    case 'url': {
      if (typeof value !== 'string') return malformed(`${at} takes a URL.`);
      let url: URL;
      try {
        url = new URL(value.trim());
      } catch {
        return malformed(`${at} is not a URL.`);
      }
      /* TWO SCHEMES. Anything else in a record is a link somebody will eventually click out of a
         page the record rendered, and `javascript:` and `data:` are the two that matter. */
      if (url.protocol !== 'https:' && url.protocol !== 'mailto:')
        return malformed(`${at} is ${url.protocol.replace(':', '')}; a record holds https and mailto.`);
      return good(url.href);
    }

    case 'email': {
      if (typeof value !== 'string') return malformed(`${at} takes an email address.`);
      const s = value.trim();
      const parts = s.split('@');
      if (parts.length !== 2 || !parts[0] || !parts[1] || /\s/.test(s))
        return malformed(`${at} takes one address, as name@example.com.`);
      return good(`${parts[0]}@${parts[1]!.toLowerCase()}`);
    }

    case 'secret': {
      /* THE REFUSAL CARRIES NO `found`, and that is the whole rule: the value might be the
         credential itself, and a refusal is logged. A register indexes what a key OPENS, never the
         key — this field holds the id of a grant and nothing else, ever. */
      if (typeof value !== 'string' || !GRANT.test(value.trim()))
        return bad('VALUE_MALFORMED', `${at} takes the id of a grant, and never a credential.`, at);
      const id = value.trim();
      if (look.grantExists && !look.grantExists(id))
        return bad('VALUE_MALFORMED', `${at} names a grant that does not exist.`, at);
      return good(id);
    }

    case 'list': {
      if (!Array.isArray(value)) return malformed(`${at} takes a list.`);
      const of = field.of ?? 'text';
      const out: Json[] = [];
      for (const [i, element] of value.entries()) {
        const one = coerce({ ...field, type: of, of: undefined as never }, element, look, `${at}[${i}]`);
        if (!one.ok) return one;
        out.push(one.value);
      }
      return good(out);
    }

    case 'json':
      return good(value as Json);

    default:
      return malformed(`${at} has a type this build does not read.`);
  }
}

/**
 * Does this coerced value count as MISSING?
 *
 * `34-GRAMMARS` §1.3 makes JSON null, the empty string and the empty list all the same thing —
 * absent — so none of them is stored. A field holding `""` and a field holding nothing would be two
 * states with one meaning, and every reader would have to know both.
 */
export const isAbsent = (v: Json): boolean => v === null || v === '' || (Array.isArray(v) && v.length === 0);
