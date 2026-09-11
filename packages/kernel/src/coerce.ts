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

/**
 * The sixteen, plus the two containers. `list<T>` carries its element type in `of`.
 *
 * AN ARRAY, BECAUSE A UNION CHECKS NOTHING AT INSTALL. This was a TypeScript type and only that, so
 * the list existed at compile time in a package whose whole job is admitting declarations written
 * somewhere else — and `type: 'currency'` installed clean, which is `04 §5`'s own worked example of
 * `FIELD_TYPE_UNKNOWN` (*"did you mean 'money'?"*). A pack is untyped text from another author; a
 * union cannot see it.
 *
 * `02 §1` is the authority for the members and calls the cost of a new one out loud: *"a
 * seventeenth is five pieces of work and a new way to be wrong"* — a validator, a form control, a
 * renderer, a `where:` compilation and a line in the MCP schema. A list a person can count is what
 * makes that sentence checkable.
 */
export const FIELD_TYPES = [
  'text', 'document', 'int', 'duration', 'decimal', 'money', 'quantity', 'day', 'instant', 'bool',
  'enum', 'ref', 'file', 'url', 'email', 'secret', 'list', 'json',
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export type FieldDecl = {
  id: string;
  type: FieldType;
  /** `list<T>`'s element type. */
  of?: Exclude<FieldType, 'list'>;
  values?: readonly string[];
  to?: string;
  /**
   * The name a person reads. Absent means the id with `_` as a space.
   *
   * IT IS NOT USED BY COERCION AND IT IS CARRIED ANYWAY, because the query grammar needs it: a page
   * prints its own `where:` back to the reader using the label, so `direction is owed_to_me` is
   * shown as `which way is owed to me`, and that sentence fed back to the record was
   * `FIELD_UNKNOWN` until the schema handed the grammar the same word the screen shows.
   */
  label?: string;
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

/**
 * The shapes a published key takes, by its issuer's own prefix: a private key's PEM header, Stripe,
 * GitHub, GitLab, Slack, AWS, Google, Anthropic and OpenAI, npm, 25 §7's own `phx_` and `vcp_`, a
 * JWT, the two webhook addresses that are their own secret, and a password written into a URL.
 */
const KEY_SHAPES: readonly RegExp[] = [
  /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/u,
  /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}/u,
  /\bgh[opsur]_[A-Za-z0-9]{30,}/u,
  /\bgithub_pat_[A-Za-z0-9_]{30,}/u,
  /\bglpat-[A-Za-z0-9_-]{20,}/u,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/u,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/u,
  /\bAIza[0-9A-Za-z_-]{35}/u,
  /\bsk-(?:ant|proj)-[A-Za-z0-9_-]{20,}/u,
  /\bsk-[A-Za-z0-9]{32,}/u,
  /\bnpm_[A-Za-z0-9]{36}/u,
  /\b(?:phx|vcp)_[A-Za-z0-9]{20,}/u,
  /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/u,
  /hooks\.slack\.com\/services\/[A-Za-z0-9/]{20,}/u,
  /discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]{20,}/u,
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/iu,
];

/** A run a key could be written as: the base64 and base64url alphabets, thirty-two or longer. */
const KEY_RUN = /[A-Za-z0-9+/=_-]{32,}/gu;

/** A URL's path, where a document's own id lives. A link to a document is not a key to it. */
const URL_PATH = /\b([a-z][a-z0-9+.-]*:\/\/[^\s/?#]+)\/[^\s?#]*/giu;

const classOf = (c: string): number => (c >= 'a' && c <= 'z' ? 0 : c >= 'A' && c <= 'Z' ? 1 : c >= '0' && c <= '9' ? 2 : 3);

/**
 * Whether one run reads as random rather than as words.
 *
 * ENTROPY ALONE DOES NOT TELL THEM APART: a long camel-case name scores what a 32-character key
 * scores. What does is how a key is made. It mixes lower case, capitals and digits, changes class at
 * two characters in five or more, has few separators, and holds few runs of three lower-case letters,
 * which is what a word is made of. Measured over random keys of 32 to 64 characters this misses
 * between one in forty and one in a thousand, and passes the long names, slugs and paths tried.
 */
function random(run: string): boolean {
  if (!/[a-z]/u.test(run) || !/[A-Z]/u.test(run) || !/[0-9]/u.test(run)) return false;
  if (run.replace(/[A-Za-z0-9]/gu, '').length > run.length / 10) return false;
  let turns = 0;
  for (let i = 1; i < run.length; i++) if (classOf(run[i]!) !== classOf(run[i - 1]!)) turns++;
  if (turns < 0.4 * (run.length - 1)) return false;
  let words = 0;
  for (const [w] of run.matchAll(/[a-z]{3,}/gu)) words += w.length;
  if (words >= 0.45 * run.length) return false;
  const counts = new Map<string, number>();
  for (const c of run) counts.set(c, (counts.get(c) ?? 0) + 1);
  let bits = 0;
  for (const n of counts.values()) bits -= (n / run.length) * Math.log2(n / run.length);
  return bits >= 3.5;
}

/**
 * Whether a text holds what looks like a key: a known issuer's shape, or a long random token.
 *
 * LET THROUGH ON PURPOSE: a hex digest or a git hash of any length, a ULID, a UUID and the record's
 * own ids, none of which mixes cases; a token inside a URL's path, which is a link; and anything
 * under 32 characters. A long base64 value that is not secret, such as a public key or a wallet
 * address, is refused with the keys, because it cannot be told apart from one.
 */
export function looksLikeCredential(text: string): boolean {
  if (KEY_SHAPES.some((shape) => shape.test(text))) return true;
  for (const [run] of text.replace(URL_PATH, '$1 ').matchAll(KEY_RUN)) if (random(run)) return true;
  return false;
}

/**
 * What `min:` and `max:` measure (`02 §5`): the UTF-8 bytes of a text or a document, the value of a
 * number, a money's amount in minor units and a quantity's value. `null` for anything else.
 */
export function measure(type: string, value: Json): number | null {
  if (type === 'text' || type === 'document') return typeof value === 'string' ? new TextEncoder().encode(value).length : null;
  if ((type === 'money' || type === 'quantity') && value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const n = type === 'money' ? value.amount : value.value;
    return typeof n === 'number' ? n : null;
  }
  return typeof value === 'number' ? value : null;
}

/** A field's bounds in words, as a refusal names them: `12 to 400`, `at least 12`, `at most 400`. */
export const range = (lo: number | undefined, hi: number | undefined): string =>
  lo !== undefined && hi !== undefined ? `${lo} to ${hi}` : lo !== undefined ? `at least ${lo}` : `at most ${String(hi)}`;

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
      /* A CREDENTIAL NEVER GOES IN A ROW IN PLAIN TEXT, and this is the check that keeps it out of
         every text a register holds, from every caller. First, so a key sent JSON-quoted is still
         answered with where keys go.

         `VALUE_MALFORMED`, AND THE `secret` ARM BELOW IS WHY. The record already answers a key sent
         where no row keeps one with this code and no `found`: a secret field takes a grant id and
         never the key. This is the same fact at a text field, and one fact keeps one code.
         `SECRET_IN_PACK` says it about a pack, and its repair is an edit to a pack file that a caller
         writing a learning has not got. `FORBIDDEN` is about who asks, and a person is refused this
         as surely as an agent. No `found`, because the value may be the key. */
      if (looksLikeCredential(value))
        return bad(
          'VALUE_MALFORMED',
          `${at} holds what looks like a key, and a key never goes in a row. Deposit it in the vault, and write here what it opens.`,
          at,
        );
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
      /* A BARE DAY IS ALLOWED, because it is not ambiguous: `Date.parse('2026-09-05')` is UTC
         midnight by the ECMAScript grammar, in every engine. What is ambiguous is a date WITH a time
         and no offset, which the same grammar reads as local. Refusing the bare form as well would
         be a narrowing nothing asked for, and it is the form an extracted date arrives in.

         `±hh` IS ALSO A ZONE. ISO 8601 admits the hour-only offset and rejecting it would refuse a
         value that says exactly what it means. */
      const zoned = /^\d{4}-\d{2}-\d{2}$/.test(said) || /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(said);
      if (!zoned)
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

      /**
       * THE REGISTER THE FIELD DECLARES, AND IT WAS NEVER COMPARED.
       *
       * `field.to` was read in this case for exactly one thing: building the sentence in the line
       * above. So `invoices#3` written into a field declared `to: contacts` resolved the INVOICES
       * row and stored its id, and every read afterwards followed the reference into the wrong
       * register and found a row that is a real row. Nothing is malformed, nothing is missing,
       * nothing refuses, and the answer is wrong: the shape this repository keeps finding, in the
       * one place where the record's own referential integrity lives.
       *
       * `REF_REGISTER_MISMATCH` AND NOT `REF_UNKNOWN`, and `30 §6` line 774 draws the line in as
       * many words: `REF_UNKNOWN` has nothing to point at, and this one points at the wrong thing.
       * The repairs differ, so the codes do: repoint this one, write the missing row for that one.
       *
       * `field.to` UNSET IS NOT A MISMATCH. A `ref` with no declared target accepts any register,
       * which is what `41 §4`'s own optionality means, and inventing a refusal for it here would
       * refuse a declaration `declare` accepts.
       */
      if (field.to !== undefined && said.register !== field.to)
        return bad(
          'REF_REGISTER_MISMATCH',
          `${at} points at ${field.to}, and ${s} is a ${said.register} row. Name a ${field.to} row, or change what this field points at.`,
          at,
          /* `allowed`, WHICH IS THE ONE SHAPE `Refusal` HAS FOR "SEND THIS INSTEAD". `50 §2.5`
             types the browser's own `Refusal` with `found` and `wanted`; `packages/ports` has
             neither, and inventing them at one call site would be a second refusal shape reaching a
             caller that reads the first. One register, because a field points at one. */
          { allowed: [field.to] },
        );

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
