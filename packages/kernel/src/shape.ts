/**
 * The shape copy: a record's export with every value scrambled and every structure kept (PRF-A13, `area-proof-a.md`
 * 2.5).
 *
 * WHY IT EXISTS. Every gate draws an invented record, and the faults that matter show up on a lived one: residue, a
 * person twice, ten thousand points, a state somebody typed. A shape copy is that lived record with nothing left in it
 * that anyone said. The look and the gates open it on a scratch record and see what his record LOOKS like.
 *
 * THE RULES, from the brief, each one a line below:
 *   - a word becomes a made-up word of the same length, case and script, by a keyed hash whose key is thrown away, so
 *     equal words stay equal and duplicates survive;
 *   - a number keeps its sign and its count of digits, and the numbers of one series share one secret factor, so a
 *     chart keeps its shape;
 *   - every date moves by one offset, so ages, gaps and order hold;
 *   - states, field ids of published add-ons and currency codes stay, and a declaration that matches a published
 *     add-on stays whole; any other declaration keeps its structure and loses its words;
 *   - sealed bytes become zeros of the same length, and the signature goes with the values it was over.
 *
 * THE LEAK THIS GUARDS IS THE ONE THE SCRAMBLER TAKES FOR STRUCTURE: a state he typed, a list named after a client, a
 * field id of his own. So nothing is kept for being shaped like structure. A word is kept only when it is the product's
 * own: a table or column name, the grammar's words, or a word a published declaration uses as an id, a key or a value.
 * His ids are scrambled by the same hash wherever they appear, so a register, its entries, its counter and the events
 * about it still point at one another.
 *
 * Tokens, devices and sign-in methods are in the `local` section and never travel; a `local` table found in a file
 * anyway is dropped here too.
 */

import { CONFIG_TYPES, GRAMMAR_VALUES, KINDS, REGISTER_BODY_KEYS, digest, jcs } from './declare.ts';
import { FIELD_TYPES, isCurrencyCode, type Json } from './coerce.ts';
import { ERASED } from './erase.ts';
import { SIGNS_KEY } from './signs.ts';

/** The second line of a shape file. A gate and an import read it before anything else. */
export const SHAPE_MARK = '#shape: true';

/** Whether a file is a shape copy: its own mark, or a `dog_meta` row a scratch record adopted from one. */
export function isShape(lines: readonly string[]): boolean {
  for (const raw of lines.slice(0, 4)) if (raw.trim() === SHAPE_MARK) return true;
  return lines.some((l) => l.trim() === '["shape","true"]');
}

/** A declaration as the catalogue publishes it. Its body is matched byte for byte, so an edited copy is his. */
export type Published = { id: string; pack?: string | null | undefined; body: unknown };

export type ShapeOptions = {
  /** The published add-ons' declarations. Anything not in it is scrambled, so leaving it out is the safe default. */
  published?: readonly Published[];
  /** The hash key. Random and thrown away unless a test fixes it. */
  key?: Uint8Array;
  /** The one date offset, in days. Whole weeks from the key unless a test fixes it. */
  shiftDays?: number;
  /** When the copy is taken, so `shape_at` can say what "now" is inside it. */
  now?: number;
};

/* ── the keyed hash ─────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * SHA-256, synchronously. WebCrypto only answers with a promise, and a record is tens of thousands of words, each of
 * which has to be hashed in the middle of a walk; a promise per word turns one pass into two. The output feeds a
 * keyed hash whose key is random and discarded, so this is a pseudo-random function, never a checksum anyone verifies.
 */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function sha256(bytes: Uint8Array): Uint8Array {
  const bits = bytes.length * 8;
  const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bits / 0x100000000));
  view.setUint32(padded.length - 4, bits >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rot = (x: number, n: number): number => (x >>> n) | (x << (32 - n));
  for (let at = 0; at < padded.length; at += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(at + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15]!;
      const b = w[i - 2]!;
      w[i] = (w[i - 16]! + (rot(a, 7) ^ rot(a, 18) ^ (a >>> 3)) + w[i - 7]! + (rot(b, 17) ^ rot(b, 19) ^ (b >>> 10))) >>> 0;
    }
    let a = h[0]!, b = h[1]!, c = h[2]!, d = h[3]!, e = h[4]!, f = h[5]!, g = h[6]!, k = h[7]!;
    for (let i = 0; i < 64; i++) {
      const t1 = (k + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + K[i]! + w[i]!) >>> 0;
      const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      k = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    [a, b, c, d, e, f, g, k].forEach((x, i) => (h[i] = h[i]! + x));
  }
  const out = new Uint8Array(32);
  const put = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) put.setUint32(i * 4, h[i]!);
  return out;
}

/** The keyed hash: SHA-256 over the key and a tagged input, remembered, since a record says the same word often. */
function keyed(key: Uint8Array): (tag: string) => Uint8Array {
  const seen = new Map<string, Uint8Array>();
  const enc = new TextEncoder();
  return (tag) => {
    let got = seen.get(tag);
    if (got) return got;
    const text = enc.encode(tag);
    const both = new Uint8Array(key.length + text.length);
    both.set(key);
    both.set(text, key.length);
    got = sha256(both);
    seen.set(tag, got);
    return got;
  };
}

/** A stream of uniform numbers from one tag, as long as the caller needs. */
function stream(hash: (tag: string) => Uint8Array, tag: string): () => number {
  let block = 0;
  let bytes = hash(`${tag}\u0000${block}`);
  let at = 0;
  return () => {
    if (at + 4 > bytes.length) {
      bytes = hash(`${tag}\u0000${++block}`);
      at = 0;
    }
    const n = ((bytes[at]! << 24) | (bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!) >>> 0;
    at += 4;
    return n;
  };
}

/* ── one value at a time ────────────────────────────────────────────────────────────────────────────────────── */

const DAY = 86_400_000;
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ULID = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const HEXISH = /^[0-9a-f]{16,}$/;
const DAY_AT = /^\d{4}-\d{2}-\d{2}(?=$|T)/;
const MONTH = /^\d{4}-\d{2}$/;

/**
 * THE LETTERS A LETTER MAY BECOME: the lower-case letters of its own block of 128 code points. A Latin letter becomes a
 * Latin letter and an Arabic one an Arabic one, which is "the same script" without a table of scripts that would be
 * one more list to keep. Upper case is put back afterwards, so `Zorbex` and `zorbex` stay the same word.
 */
const BLOCKS = new Map<number, string[]>();
function lettersOf(cp: number): string[] {
  const block = cp >> 7;
  let got = BLOCKS.get(block);
  if (got) return got;
  got = [];
  for (let c = block << 7; c < (block + 1) << 7; c++) {
    const ch = String.fromCodePoint(c);
    if (/^[\p{Ll}\p{Lo}]$/u.test(ch) && ch.toUpperCase().length === 1) got.push(ch);
  }
  BLOCKS.set(block, got);
  return got;
}

/** The scrambler for one copy: its key, its offset, and the factor of each series, all gone when the copy is. */
export class Scrambler {
  readonly shiftDays: number;
  private readonly hash: (tag: string) => Uint8Array;

  constructor(key: Uint8Array, shiftDays?: number) {
    this.hash = keyed(key);
    /* WHOLE WEEKS, BACKWARDS, so a weekday stays the weekday and a weekly rhythm still reads as one. Between four
       weeks and half a year: far enough that no date in the copy is a date he lived, near enough that seasons hold. */
    this.shiftDays = shiftDays ?? -7 * (4 + (stream(this.hash, 'shift')() % 23));
  }

  /** A made-up word: same length, same case, same script, and the same word every time this word is met. */
  word(w: string): string {
    const next = stream(this.hash, `w:${w.toLowerCase()}`);
    let out = '';
    for (const ch of w) {
      const lower = ch.toLowerCase();
      if (!/\p{L}/u.test(ch) || lower.length !== ch.length) {
        out += ch;
        continue;
      }
      const pool = lettersOf(lower.codePointAt(0)!);
      const made = pool.length ? pool[next() % pool.length]! : ch;
      out += ch !== lower ? made.toUpperCase() : made;
    }
    return out;
  }

  /**
   * WHERE x GOES AMONG n PLACES: the same place every time, and never two numbers to one. A keyed Feistel network over
   * the smallest even count of bits that holds n, walked again while it lands past the end. A hash per number sent two
   * of his numbers to one often (any two digits in nine draws), and a group of duplicates appeared that was never his.
   */
  private place(tag: string, x: bigint, n: bigint): bigint {
    if (n <= 1n) return x;
    const half = BigInt(Math.max(1, Math.ceil((n - 1n).toString(2).length / 2)));
    const mask = (1n << half) - 1n;
    const words = Math.ceil(Number(half) / 32);
    let v = x;
    do {
      let l = v >> half;
      let r = v & mask;
      for (let round = 0; round < 4; round++) {
        const next = stream(this.hash, `p:${tag}:${round}:${r}`);
        let f = 0n;
        for (let i = 0; i < words; i++) f = (f << 32n) | BigInt(next());
        [l, r] = [r, l ^ (f & mask)];
      }
      v = (l << half) | r;
    } while (v >= n);
    return v;
  }

  /** A run of digits in text: the same count, a leading zero kept as a zero and no other digit made one. */
  digits(run: string): string {
    if (run.length === 1) return String(this.place('d:1', BigInt(run), 10n));
    const span = 10n ** BigInt(run.length - 1);
    if (run[0] === '0') return '0' + this.place(`d0:${run.length}`, BigInt(run.slice(1)), span).toString().padStart(run.length - 1, '0');
    return String(span + this.place(`d:${run.length}`, BigInt(run) - span, 9n * span));
  }

  /**
   * A number: its sign, its digits before the point and its digits after it, kept.
   *
   * WITH A SERIES it is multiplied by that series' one factor, so every point of a chart moves together and the line
   * keeps its shape. The factor is never below one, so two whole numbers that differ stay two numbers; the result is
   * held inside its count of digits, so a figure that would grow a digit stops at the largest one it can be, and only
   * there can two of a series meet. WITHOUT ONE it takes its own place among the numbers of its digits, the same
   * number for the same number and never the number of another.
   */
  number(n: number, series?: string): number {
    if (!Number.isFinite(n) || n === 0) return n;
    const text = String(Math.abs(n));
    if (/e/i.test(text)) return n;
    const [whole = '0', frac = ''] = text.split('.');
    const dec = frac.length;
    const lo = whole === '0' ? 1 : 10 ** (whole.length - 1 + dec);
    /* PAST 2^53 A NUMBER IS NOT EXACT ANYWAY: its digits are held to the largest that is, never passed through. */
    const hi = Math.min(Number.MAX_SAFE_INTEGER, whole === '0' ? 10 ** dec - 1 : 10 ** (whole.length + dec) - 1);
    const was = Math.min(hi, Math.round(Math.abs(n) * 10 ** dec));
    let units: number;
    if (series !== undefined) {
      const factor = 1 + (0.4 * stream(this.hash, `f:${series}`)()) / 0x100000000;
      units = Math.min(hi, Math.max(lo, Math.round(was * factor)));
      /* A FRACTION THAT ENDS IN ZERO PRINTS SHORTER (`12.30` is `12.3`), so its last digit is never a zero. */
      if (dec > 0 && units % 10 === 0) units += units + 1 <= hi ? 1 : -1;
    } else if (dec === 0) units = lo + Number(this.place(`n:${lo}`, BigInt(was - lo), BigInt(hi - lo + 1)));
    else {
      /* A FRACTION'S LAST DIGIT IS ONE TO NINE, as it was, so the places are the digits before it times nine. */
      const [first, last] = [Math.floor(lo / 10), Math.floor(hi / 10)];
      const at = Number(this.place(`n:${lo}:${dec}`, BigInt((Math.floor(was / 10) - first) * 9 + (was % 10) - 1), BigInt((last - first + 1) * 9)));
      units = (first + Math.floor(at / 9)) * 10 + (at % 9) + 1;
    }
    return Math.sign(n) * (units / 10 ** dec);
  }

  /** A day, an instant or a month, moved by the one offset. Only the date part changes: the offset is whole days. */
  date(s: string): string | null {
    const day = DAY_AT.exec(s)?.[0];
    if (day) {
      const t = Date.parse(`${day}T00:00:00Z`);
      if (Number.isNaN(t)) return null;
      return new Date(t + this.shiftDays * DAY).toISOString().slice(0, 10) + s.slice(10);
    }
    if (MONTH.test(s)) {
      const t = Date.parse(`${s}-15T00:00:00Z`);
      return Number.isNaN(t) ? null : new Date(t + this.shiftDays * DAY).toISOString().slice(0, 7);
    }
    return null;
  }

  /** A ULID: its time moved by the offset, so order and age hold, and the rest from the hash, so it still joins. */
  ulid(id: string): string {
    let ms = 0;
    for (const c of id.slice(0, 10)) ms = ms * 32 + CROCKFORD.indexOf(c);
    ms = Math.max(0, ms + this.shiftDays * DAY);
    let time = '';
    for (let i = 0; i < 10; i++) {
      time = CROCKFORD[ms % 32]! + time;
      ms = Math.floor(ms / 32);
    }
    const next = stream(this.hash, `u:${id}`);
    let rest = '';
    for (let i = 0; i < 16; i++) rest += CROCKFORD[next() % 32]!;
    return time + rest;
  }

  /** A hash or a hex handle: hex of the same length, the same for the same input. */
  hex(s: string): string {
    const next = stream(this.hash, `x:${s}`);
    let out = '';
    for (let i = 0; i < s.length; i++) out += (next() % 16).toString(16);
    return out;
  }

  /** Whether a string is one of the shapes `ulid`, `hex` or `date` takes whole. */
  static ulidLike = (s: string): boolean => ULID.test(s);
  static hexLike = (s: string): boolean => HEXISH.test(s) && (s.length >= 32 || (/\d/.test(s) && /[a-f]/.test(s)));
}

/* ── words in their places ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * `strict` is his text: every word goes, every number goes. `keep` is a declaration's body, a where and a measure: the
 * grammar's own words and figures stay so the declaration still means something, and his ids still go. `values` is a
 * proposal that carries his rows or his choices: the grammar's words stay and every figure goes, since a figure there
 * is his amount, never a declaration's bound.
 */
type Mode = 'strict' | 'keep' | 'values';

const IDENT = /^[a-z0-9_-]+$/;
const BREAKS = /([.:/#@+=?&,|;])/;
const INSTANT = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const INSTANT_IN = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)/;
/** What the kernel writes in place of a value it withheld or erased: a reader tells them from a value by the mark. */
const MARKS: ReadonlySet<string> = new Set(['--redacted--', ERASED]);
const PROSE =
  /(\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?)|(?<![0-9A-Za-z])([0-7][0-9A-HJKMNP-TV-Z]{25})(?![0-9A-Za-z])|([\p{L}\p{M}\p{N}_]+)/gu;

/**
 * The grammar's words, from the lists the kernel validates against, so no list here can drift from them, and the keys
 * of the three values `coerce` writes as objects: money, a quantity and a file.
 */
const VALUE_KEYS = ['amount', 'currency', 'value', 'unit', 'sha256', 'mime', 'bytes', 'name'];
/* THE KERNEL'S OWN KEYS AND UNITS: the snapshot of the signs, and the two units a bare number gets (`metrics.ts`,
   `realUnit`: `count`, and `pct.bp`, whose `bp` is short enough to stay). */
const KERNEL_WORDS = [SIGNS_KEY, 'count', 'pct'];
function grammar(): Set<string> {
  const out = new Set<string>([...KINDS, ...FIELD_TYPES, ...CONFIG_TYPES, ...VALUE_KEYS, ...KERNEL_WORDS, ...GRAMMAR_VALUES]);
  for (const list of Object.values(REGISTER_BODY_KEYS)) for (const w of list) out.add(w);
  return out;
}

/** The product's words and the scrambler, and the rules that decide which a string meets. */
class Shaper {
  readonly keep = grammar();
  /** His names: every name a declaration of his gives as a value. A key in his grammar that is one of these is his. */
  readonly his = new Set<string>();
  readonly s: Scrambler;

  constructor(s: Scrambler) {
    this.s = s;
  }

  /** Learn the words a published declaration uses as ids, keys and values: they are the product's, never his. */
  learn(value: unknown): void {
    if (typeof value === 'string') {
      if (/\s/.test(value)) return;
      for (const part of value.split(BREAKS)) if (IDENT.test(part)) this.keep.add(part);
    } else if (Array.isArray(value)) for (const v of value) this.learn(v);
    else if (value && typeof value === 'object')
      for (const [k, v] of Object.entries(value)) {
        this.learn(k);
        this.learn(v);
      }
  }

  /** Note the names a declaration of his gives, so the keys that repeat them are known to be his. */
  note(value: unknown): void {
    if (typeof value === 'string') {
      if (!/\s/.test(value)) for (const part of value.split(BREAKS)) if (IDENT.test(part) && !this.keep.has(part)) this.his.add(part);
    } else if (Array.isArray(value)) for (const v of value) this.note(v);
    else if (value && typeof value === 'object') for (const v of Object.values(value)) this.note(v);
  }

  /** One string, by its shape: JSON, a date, an id, a hash, a code, a path of names, or text. */
  text(v: string, mode: Mode): string {
    if (MARKS.has(v)) return v;
    if ((v.startsWith('{') || v.startsWith('[')) && v.length > 1) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(v);
      } catch {
        parsed = undefined;
      }
      if (parsed !== null && typeof parsed === 'object') return JSON.stringify(this.json(parsed, mode));
    }
    if (INSTANT.test(v) || MONTH.test(v)) return this.s.date(v) ?? this.prose(v, mode);
    if (!/\s/.test(v)) return this.path(v, mode);
    return this.prose(v, mode);
  }

  /**
   * A string with no spaces, read as names joined by marks: `register.obligations`, `seq:tools`, `entry:01J…`,
   * an address. Each name is taken alone, so his register is the same made-up word in all four places.
   */
  path(v: string, mode: Mode): string {
    /* AN INSTANT INSIDE A KEY (`<entry>:due:2026-09-30T12:00:00.000Z:-7d`) holds the marks the names are cut at, so it
       is taken out whole first. */
    const pieces = v.split(INSTANT_IN);
    if (pieces.length > 1) return pieces.map((p, i) => (i % 2 ? (this.s.date(p) ?? p) : this.path(p, mode))).join('');
    const parts = v.split(BREAKS);
    return parts
      .map((part, i) => {
        if (i % 2 === 1 || part === '') return part;
        if (Scrambler.ulidLike(part)) return this.s.ulid(part);
        /* `rec_` and `g_` before a ULID: the prefix says what it is, the ULID is which. */
        const tagged = /^([a-z]{1,8}_)(.{26})$/.exec(part);
        if (tagged && Scrambler.ulidLike(tagged[2]!)) return tagged[1]! + this.s.ulid(tagged[2]!);
        if (Scrambler.hexLike(part)) return this.s.hex(part);
        if (isCurrencyCode(part)) return part;
        /* `tools#8` is a handle, and its number is a count, not a value. */
        if (/^\d+$/.test(part)) return parts[i - 1] === '#' ? part : this.s.digits(part);
        if (INSTANT.test(part) || MONTH.test(part)) return this.s.date(part) ?? part.replace(/\d+/g, (d) => this.s.digits(d));
        if (IDENT.test(part)) return this.name(part);
        return this.prose(part, mode);
      })
      .join('');
  }

  /**
   * One lower-case name. Kept when it is the product's word; otherwise each run of letters becomes a made-up word.
   * A run of one or two letters stays (`7d`, `v2`, the `p` of `p_1`): no word of his is that short, and a duration
   * that loses its unit is no longer a duration. Two digits beside letters stay; three or more are a number of his.
   */
  name(part: string): string {
    if (this.keep.has(part)) return part;
    return part
      .replace(/[a-z]+/g, (run) => (run.length <= 2 ? run : this.s.word(run)))
      .replace(/\d{3,}/g, (run) => this.s.digits(run));
  }

  /** Text: dates move, ids map, currency codes stay, names follow `name`, and every other word is made up. */
  prose(v: string, mode: Mode): string {
    return v.replace(PROSE, (all, date: string | undefined, ulid: string | undefined, token: string | undefined) => {
      if (date) return this.s.date(date) ?? all;
      if (ulid) return this.s.ulid(ulid);
      const t = token ?? all;
      if (isCurrencyCode(t)) return t;
      if (/^[a-z][a-z0-9_]*$/.test(t) && (mode !== 'strict' || /[_\d]/.test(t))) return this.name(t);
      return t
        .replace(/\p{L}[\p{L}\p{M}]*/gu, (w) => this.s.word(w))
        .replace(/\p{Nd}+/gu, (d) => (mode === 'keep' ? d : this.s.digits(d)));
    });
  }

  /**
   * A JSON value. `series` is the field a number belongs to, so a field's numbers share a factor wherever they appear:
   * on the entry, in the event that changed it, in a suggestion that proposes it. At the top of an entry's fields,
   * each key names the series below it.
   */
  json(v: unknown, mode: Mode, series?: string, fields = false, keys = false): unknown {
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'number') return mode === 'keep' ? v : this.s.number(v, series);
    if (typeof v === 'string') return this.text(v, mode);
    if (Array.isArray(v)) return v.map((x) => this.json(x, mode, series, false, keys));
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o['b64'] === 'string' && Object.keys(o).length === 1) return zeros(o['b64']);
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(o)) {
        const kept = keys && /^[A-Za-z0-9_-]+$/.test(k) && !this.his.has(k.toLowerCase());
        out[kept ? k : this.key(k, mode)] = this.json(x, mode, fields ? k : series, false, keys);
      }
      return out;
    }
    return v;
  }

  /**
   * An object's key: a name, by the same rule as a name anywhere, so a field id is one word in every place.
   *
   * IN GRAMMAR, A LOWER-CASE KEY THAT IS NONE OF HIS NAMES STAYS. The grammar has more keys than any list here holds (a
   * measure's `where`, a pack's `registers`), and scrambling one leaves a declaration nothing can read. A key of his in
   * a declaration is a name the declaration also gives as a value (an enum's `labels` repeat its `values`), so `his`
   * has it, and it goes.
   */
  key(k: string, mode: Mode = 'strict'): string {
    if (mode !== 'strict' && IDENT.test(k) && !this.his.has(k)) return k;
    return /\s/.test(k) ? this.prose(k, 'strict') : this.path(k, 'strict');
  }
}

/** Sealed bytes, as the format writes them: the same count of bytes, every one of them zero. */
function zeros(b64: string): { b64: string } {
  return { b64: b64.replace(/[^=]/g, 'A') };
}

/* ── the file ───────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The columns that are the product's and travel as they are: kinds, states, levels, counts, versions, a zone, the
 * migrations' own checksums. Every other column is his, and is read by its shape. A column added later is his until
 * somebody writes it here, which is the safe way round.
 */
const KEPT: Readonly<Record<string, readonly string[]>> = {
  dog_meta: ['key'],
  dog_section: ['table_name', 'section'],
  migration: ['version', 'checksum'],
  record: ['singleton', 'locale', 'tz', 'format_ver', 'quiet'],
  schedule: ['kind', 'state', 'attempts'],
  counter: ['next'],
  entry: ['seq', 'version'],
  entry_vec: ['dims', 'model'],
  metric_point: ['grain', 'n'],
  outbox: ['kind', 'state', 'attempts'],
  event: ['kind', 'target_kind'],
  inbox_raw: ['channel', 'state'],
  ingest_receipt: ['confidence'],
  pack: ['version', 'source'],
  prediction: ['window', 'met', 'on_miss'],
  member: ['level'],
  grant: ['kind', 'version', 'kdf', 'wrapped_by', 'bytes', 'opened', 'rotate_every', 'sealed_under'],
  vault_key: ['purpose', 'wrapped_by'],
  declaration: ['version', 'kind', 'retired'],
  suggestion: ['body_kind', 'status', 'kind'],
};

/** The header rows that are facts about the format and the machine, not about him. */
const KEPT_META: ReadonlySet<string> = new Set(['format', 'tz', 'locale', 'keys']);

/**
 * Columns whose JSON keys the kernel wrote: a reminder's `entry` and `field`, a header's `from`. Their values are his
 * and go; their keys are how the kernel reads the row back, and stay, unless a key is one of his names (a webhook
 * that carries an entry's fields), which goes like any other.
 */
const KERNEL_KEYS: ReadonlySet<string> = new Set(['schedule.payload', 'outbox.payload', 'inbox_raw.headers']);

/** Columns that hold grammar with his ids in it: the declaration's own words stay, his go. */
const GRAMMAR_COLUMNS: ReadonlySet<string> = new Set([
  'declaration.body',
  'suggestion.body',
  'prediction.measure',
  'pack.manifest',
  'member.row_where',
  /* A unit came off a declaration (`metrics.ts`, `realUnit`), so it is his when the declaration is: the same word. */
  'metric_point.unit',
  'prediction.unit',
]);

type Table = { name: string; header: string; columns: string[]; rows: unknown[][] };

function parse(lines: readonly string[]): { magic: string; tables: Table[] } {
  let magic = '#dogl 1';
  const tables: Table[] = [];
  let at: Table | null = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) continue;
    if (line.startsWith('#dogl ')) magic = line;
    else if (line.startsWith('#table ')) {
      const [name = '', cols = ''] = line.slice('#table '.length).split(' ');
      at = { name, header: line, columns: cols.split(',').filter(Boolean), rows: [] };
      tables.push(at);
    } else if (!line.startsWith('#') && at) at.rows.push(JSON.parse(line) as unknown[]);
  }
  return { magic, tables };
}

/**
 * The shape copy of an export's lines.
 *
 * THE INPUT IS A FILE, NOT A DATABASE, so the copy is made from exactly what an export says and the record is never
 * touched: the host takes a redacted export and hands it here. The output is a file of the same format, with the
 * same tables, the same count of rows in each, the same length in every value, a manifest that matches it, the
 * `#shape: true` mark on its second line and the same as a `dog_meta` row, and no signature: a signature is over the
 * real values, and an import that wants one is the refusal a shape file should meet.
 */
export async function shapeBrainl(lines: readonly string[], options: ShapeOptions = {}): Promise<string[]> {
  const key = options.key ?? crypto.getRandomValues(new Uint8Array(32));
  const shaper = new Shaper(new Scrambler(key, options.shiftDays));
  const { magic, tables } = parse(lines);

  const section = new Map<string, string>();
  for (const t of tables) {
    shaper.keep.add(t.name);
    for (const c of t.columns) shaper.keep.add(c);
    if (t.name === 'dog_section') for (const [n, s] of t.rows) section.set(String(n), String(s));
  }

  /* WHAT IS PUBLISHED: the catalogue's bodies byte for byte, and the kernel's own. Their words are the product's. */
  const published = new Set<string>();
  const packs = new Set<string>(['kernel']);
  for (const p of options.published ?? []) {
    published.add(jcs(p.body as Json));
    if (p.pack) packs.add(p.pack);
    shaper.learn(p.id);
    shaper.learn(p.body);
  }
  const decl = tables.find((t) => t.name === 'declaration');
  const isPublished = (row: unknown[]): boolean => {
    const cols = decl?.columns ?? [];
    const pack = row[cols.indexOf('pack_id')];
    return pack === 'kernel' || published.has(String(row[cols.indexOf('body')]));
  };
  for (const row of decl?.rows ?? [])
    if (isPublished(row)) {
      shaper.learn(row[decl!.columns.indexOf('id')]);
      const body = row[decl!.columns.indexOf('body')];
      if (typeof body === 'string') shaper.learn(JSON.parse(body));
    }

  for (const row of decl?.rows ?? [])
    if (!isPublished(row)) {
      shaper.note(row[decl!.columns.indexOf('id')]);
      const body = row[decl!.columns.indexOf('body')];
      if (typeof body === 'string') shaper.note(JSON.parse(body));
    }
  const entry = tables.find((t) => t.name === 'entry');
  for (const row of entry?.rows ?? []) shaper.note(row[entry!.columns.indexOf('register')]);

  const kept: Table[] = [];
  for (const t of tables) {
    /* `local` never travels: a lockout, a device, a token, a sign-in. One that arrived anyway goes here. */
    if (section.get(t.name) === 'local') continue;
    if (t.name === 'dog_sig') kept.push({ ...t, rows: [] });
    else if (t.name === 'dog_manifest') kept.push(t);
    else kept.push({ ...t, rows: t.rows.map((row) => shapeRow(shaper, t, row, isPublished, packs)) });
  }

  const meta = kept.find((t) => t.name === 'dog_meta');
  if (meta) {
    const at = new Date((options.now ?? Date.now()) + shaper.s.shiftDays * DAY).toISOString();
    meta.rows = [...meta.rows.filter((r) => r[0] !== 'shape' && r[0] !== 'shape_at'), ['shape', 'true'], ['shape_at', at]];
    meta.rows.sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : 1));
  }

  /* A declaration of his was re-written, so its checksum is the hash of what it says now. */
  if (decl) {
    const t = kept.find((x) => x.name === 'declaration')!;
    const [b, c] = [t.columns.indexOf('body'), t.columns.indexOf('checksum')];
    await Promise.all(
      t.rows.map(async (row, i) => {
        if (!isPublished(decl.rows[i]!) && typeof row[b] === 'string') row[c] = await digest(row[b] as string);
      }),
    );
  }

  const texts = new Map(kept.map((t) => [t.name, t.rows.map((r) => JSON.stringify(r))]));
  const manifest = kept.find((t) => t.name === 'dog_manifest');
  if (manifest)
    manifest.rows = await Promise.all(
      manifest.rows
        .filter((r) => texts.has(String(r[0])))
        .map(async (r) => {
          const rows = texts.get(String(r[0]))!;
          return [r[0], rows.length, await digest(rows.join('\n'))];
        }),
    );

  const out = [magic, SHAPE_MARK];
  for (const t of kept) {
    out.push(t.header);
    for (const row of t.rows) out.push(JSON.stringify(row));
  }
  return out;
}

/** One row, column by column. A published declaration and its pack travel whole. */
function shapeRow(
  shaper: Shaper,
  t: Table,
  row: unknown[],
  isPublished: (row: unknown[]) => boolean,
  packs: ReadonlySet<string>,
): unknown[] {
  if (t.name === 'declaration' && isPublished(row)) return row;
  if (t.name === 'pack' && packs.has(String(row[t.columns.indexOf('id')]))) return row;
  const kept = new Set(KEPT[t.name] ?? []);
  const col = (name: string): unknown => row[t.columns.indexOf(name)];
  return t.columns.map((c, i) => {
    const v = row[i];
    if (kept.has(c) || v === null || v === undefined || typeof v === 'boolean') return v;
    if (t.name === 'dog_meta' && c === 'value' && KEPT_META.has(String(col('key')))) return v;
    if (typeof v === 'object') return shaper.json(v, 'strict');
    const at = `${t.name}.${c}`;
    if (at === 'entry.fields' && typeof v === 'string') return JSON.stringify(shaper.json(JSON.parse(v), 'strict', undefined, true));
    if (at === 'metric_point.value' && typeof v === 'number') return shaper.s.number(v, `metric:${String(col('series'))}`);
    if ((at === 'event.from_v' || at === 'event.to_v') && typeof v === 'string') return changed(shaper, v, col('field'));
    if (at === 'declaration.body' && typeof v === 'string') return jcs(shaper.json(JSON.parse(v), 'keep') as Json);
    if (KERNEL_KEYS.has(at) && typeof v === 'string' && v.startsWith('{')) {
      try {
        return JSON.stringify(shaper.json(JSON.parse(v), 'strict', undefined, false, true));
      } catch {
        return shaper.text(v, 'strict');
      }
    }
    /* A CHANGE AND A PATTERN PROPOSE A DECLARATION; a rowset, a choice and a question carry his rows and his words. */
    const proposes = at !== 'suggestion.body' || ['change', 'pattern'].includes(String(col('body_kind')));
    const mode: Mode = !GRAMMAR_COLUMNS.has(at) ? 'strict' : proposes ? 'keep' : 'values';
    if (typeof v === 'number') return mode === 'keep' ? v : shaper.s.number(v);
    if (typeof v === 'string') return shaper.text(v, mode);
    return v;
  });
}

/**
 * An event's before or after. It is the field's value written as JSON, so its numbers take the field's series and the
 * figure in the history moves with the figure on the entry; a whole set of fields takes each key's series.
 */
function changed(shaper: Shaper, v: string, field: unknown): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(v);
  } catch {
    return shaper.text(v, 'strict');
  }
  const series = typeof field === 'string' ? field : undefined;
  const whole = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) && series === undefined;
  return JSON.stringify(shaper.json(parsed, 'strict', series, whole));
}
