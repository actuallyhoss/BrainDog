/**
 * `43 §5.7` — whether two rows are the same event seen twice.
 *
 * THE KEY OF `07 §2` MADE EXACT: same `on:` fields, day within one, prefix equal. A provider that sends the
 * same transaction twice sends it with a different id, often a day apart at a boundary, and often with the
 * merchant string extended. Exact equality misses all three, which is how a ledger doubles.
 *
 * FALSE IS THE SAFE ANSWER AND THE CODE LEANS THAT WAY EVERYWHERE. A false negative writes a duplicate row
 * that a person can see and delete. A false positive silently drops a real transaction, and nothing
 * downstream will ever show them what went missing. So every absent value, every malformed day and every
 * unreadable field answers false rather than "near enough".
 *
 * NOTHING HERE USES A REGULAR EXPRESSION (`43 §8`), the day check included.
 */

import { bankKey, jcs } from '@braindog/kernel';
import type { Json } from '@braindog/where';

import { normalise } from './extractors.ts';
import type { Fields } from './pipeline.ts';

export type Dedupe =
  | string[]
  | { near: { on: string[]; day: string; prefix?: { field: string; chars?: number } } };

const DAY = 86_400_000;
const PREFIX_CHARS = 12;
/**
 * HOW FAR APART TWO SIGHTINGS OF ONE PAYMENT MAY BE WHEN THEY CAME BY TWO ROADS: an alert dated the day the card was
 * used and a statement line dated the day the bank posted it, which is often two days later and three over a weekend.
 * Only a pair that one side's field cannot tell apart gets it (`isDuplicate`); two rows that both hold every field keep
 * the one day, since nothing about them says they came by different roads.
 */
export const NEAR_ACROSS_DAYS = 3;
/** The field a row says which way its money went in, in every list that keeps money (`in` or `out`). */
const WAY = 'direction';

/**
 * Canonical equality for one field.
 *
 * ABSENT ON EITHER SIDE IS NOT EQUAL, including absent on both. `§5.7` form 1 says "present on both sides
 * and canonically equal", and the stronger reading is the right one: two rows that both lack a reference
 * have not agreed on anything, and calling that a match would collapse every row without one into a single
 * event. `null` is present and compares as itself.
 */
function sameField(a: Fields, b: Fields, field: string): boolean {
  if (!Object.hasOwn(a, field) || !Object.hasOwn(b, field)) return false;
  const l = a[field];
  const r = b[field];
  if (l === undefined || r === undefined) return false;
  /* Sorted-key JSON, so a money value compares as `{ amount, currency }` whichever order it was built in. */
  return jcs(l) === jcs(r);
}

/** `YYYY-MM-DD` to a UTC instant, or `undefined`. Hand-checked, because this package holds no `RegExp`. */
function utcDay(value: Json | undefined): number | undefined {
  if (typeof value !== 'string' || value.length !== 10) return undefined;
  if (value[4] !== '-' || value[7] !== '-') return undefined;
  for (const i of [0, 1, 2, 3, 5, 6, 8, 9]) {
    const c = value.charCodeAt(i);
    if (c < 48 || c > 57) return undefined;
  }
  const y = Number(value.slice(0, 4));
  const m = Number(value.slice(5, 7));
  const d = Number(value.slice(8, 10));
  const at = Date.UTC(y, m - 1, d);
  /* THE CALENDAR HAS THE LAST WORD. `Date.UTC` rolls 2026-02-30 forward to March, so a day that did not
     exist would compare as one that did, one day out, which is exactly the tolerance this function feeds. */
  const back = new Date(at);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return undefined;
  return at;
}

/**
 * `normalise`, then accents off, then case off, then trim. For comparison and nothing else.
 *
 * THIS IS NOT `extractors.fold` AND THE DIFFERENCE IS INDICES. That one folds `A-Z` and only `A-Z`, because
 * every position it hands back is a position in the text the record stored and `43 §10` refuses any
 * normalisation that changes a length. Nothing downstream of this one is an index: two strings go in and a
 * boolean comes out, so it can afford to lose information that the scanners cannot. Naming them both `fold`
 * would put two different contracts behind one word in one package, which is worse than a copy, so this one
 * says in its name that it is the lossy one.
 *
 * `CAFÉ` AND `CAFE` ARE THE SAME MERCHANT, which is what a person would say and what a provider does when it
 * stops sending accents halfway through a year.
 */
function foldForComparison(text: string): string {
  let out = '';
  for (const ch of normalise(text).normalize('NFD')) {
    /* Drop the combining marks NFD just separated out (U+0300 to U+036F). */
    const code = ch.codePointAt(0)!;
    if (code < 0x0300 || code > 0x036f) out += ch;
  }
  /* `toLowerCase` AND NOT `extractors.fold`, which folds `A-Z` and stops. Nothing here is an index, so
     there is no reason to be conservative: `Ørsted` and `ØRSTED` are one merchant. */
  return out.toLowerCase().trim();
}

/** The words a bank puts before a payee on a statement line, already folded, longest first. */
const LEADS = [
  'ipn outward transfer to',
  'ipn inward transfer from',
  'ipn purchase to',
  'ipn transfer to',
  'ipn transfer from',
  'card purchase',
  'pos purchase',
  'purchase at',
  'payment to',
  'purchase',
];

/** Whether a word is a statement's day stamp: `05oct26` or `05oct2026`, day digits, three letters, year digits. */
function dayStamp(word: string): boolean {
  let i = 0;
  while (i < word.length && word.charCodeAt(i) >= 48 && word.charCodeAt(i) <= 57) i++;
  if (i < 1 || i > 2) return false;
  let j = i;
  while (j < word.length && word.charCodeAt(j) >= 97 && word.charCodeAt(j) <= 122) j++;
  if (j - i !== 3) return false;
  const year = word.length - j;
  if (year !== 2 && year !== 4) return false;
  for (let k = j; k < word.length; k++) if (word.charCodeAt(k) < 48 || word.charCodeAt(k) > 57) return false;
  return true;
}

/**
 * A description with what a bank wraps a payee in taken off, for comparison and nothing else: the day stamp a statement
 * line starts with (`05OCT26`), the words before the payee (`IPN outward transfer to`), a processor's name before its
 * star (`PAYMOB*`), the word `Purchase` at its end, and every mark that is not a letter, a digit or a space.
 *
 * WHY. One payment seen by an alert and by a statement is written twice with two descriptions: the alert reads
 * `AHMED EMAD SAIED ABDELAZIZ` and the statement `IPN outward transfer to AHMED EMAD SAIED ABDELAZIZ`, the alert
 * `UNITRADE` with its processor cut and the statement `05OCT26 PAYMOB*UNITRADE Purchase`. Compared as written, no twelve
 * letters agree, and the Ledger kept both (live check of 30 October, 11). Taken off both sides alike, they are one name.
 *
 * WHAT IS LEFT IS NEVER EMPTY: a text that is nothing but those words is compared as it was folded.
 */
export function bankless(text: string): string {
  const folded = foldForComparison(text);
  let flat = '';
  for (const ch of folded) {
    const c = ch.codePointAt(0)!;
    const letter = ch.toLowerCase() !== ch.toUpperCase();
    const digit = c >= 48 && c <= 57;
    flat += letter || digit || ch === '*' ? ch : ' ';
  }
  let words = flat.split(' ').filter((w) => w !== '');
  if (words.length > 1 && dayStamp(words[0]!)) words = words.slice(1);
  for (const lead of LEADS) {
    const said = lead.split(' ');
    if (words.length > said.length && said.every((w, i) => words[i] === w)) {
      words = words.slice(said.length);
      break;
    }
  }
  /* A PROCESSOR'S STAR: what stands before the first star, one or two words, is the processor's or the shop's own name
     said twice (`CHILLOUT *CHILLOUT ELO`), and what follows it is the payee. */
  let said = words.join(' ');
  const star = said.indexOf('*');
  if (star > 0 && star <= 14 && said.slice(0, star).trim().split(' ').length <= 2 && said.slice(star + 1).trim() !== '') said = said.slice(star + 1);
  words = said.split('*').join(' ').split(' ').filter((w) => w !== '');
  if (words.length > 1 && words[words.length - 1] === 'purchase') words = words.slice(0, -1);
  const out = words.join(' ');
  return out === '' ? folded : out;
}

/**
 * `§5.7` step 2's prefix rule. Absent on both counts equal; on one side it does not.
 *
 * AND TWO DESCRIPTIONS ARE ONE PAYEE WHEN WHAT A BANK WRAPS IT IN IS TAKEN OFF (`bankless`): their first `chars` letters
 * agree then, or the record's own payee key agrees (`bankKey`, which also cuts the place and the reference at the end:
 * `TALABAT CAIRO 4471 EG` is `Talabat`). The rule as written still decides first, so nothing it called the same is
 * called different now.
 */
function samePrefix(a: Fields, b: Fields, field: string, chars: number): boolean {
  const l = a[field];
  const r = b[field];
  const lHas = typeof l === 'string';
  const rHas = typeof r === 'string';
  if (!lHas && !rHas) return true;
  if (!lHas || !rHas) return false;
  if (foldForComparison(l).slice(0, chars) === foldForComparison(r).slice(0, chars)) return true;
  const lb = bankless(l);
  const rb = bankless(r);
  if (lb.slice(0, chars) === rb.slice(0, chars)) return true;
  const lk = bankKey(lb);
  return lk !== null && lk === bankKey(rb);
}

export function isDuplicate(a: Fields, b: Fields, dedupe: Dedupe): boolean {
  if (Array.isArray(dedupe)) {
    /* AN EMPTY LIST IS NOT A MATCH ON NOTHING. `every` over `[]` is true, which would make every pair of
       rows in the register a duplicate of every other. A key that names no fields is not a key. */
    if (dedupe.length === 0) return false;
    return dedupe.every((field) => sameField(a, b, field));
  }

  return nearMatch(a, b, dedupe) !== null;
}

/**
 * How two rows meet under a near key: `strong` when every `on:` field is held by both and agrees, `across` when one side
 * never held a field the other did (the same payment come by another road), and `null` when they are two.
 *
 * `isDuplicate` IS THIS, ANSWERED AS A YES OR NO. The record asks for the kind as well (`existingRow`), so a row matched
 * only across can be checked against the rows it might belong to instead, one to one.
 */
export function nearMatch(a: Fields, b: Fields, dedupe: Dedupe): 'strong' | 'across' | null {
  if (Array.isArray(dedupe)) return isDuplicate(a, b, dedupe) ? 'strong' : null;
  const { on, day, prefix } = dedupe.near;
  if (on.length === 0) return null;
  /* A FIELD ONE SIDE NEVER HELD DOES NOT TELL THEM APART, IN THE NEAR FORM ONLY (live check of 30 October, 11). A bank
     add-on that learned to read a reference wrote the same four alerts again beside the rows it had written before it
     could, since the old rows held no reference and "the same reference" failed on every one. Absent on one side is
     unknown, not different; held by both, it must agree, and at least one field must be held by both and agree. */
  const held = (x: Fields, f: string): boolean => Object.hasOwn(x, f) && x[f] !== undefined && x[f] !== null;
  /* AN AMOUNT IS NEVER UNKNOWN. A value with parts (a money, a quantity) named in the key must be held by both and agree
     at least once, so a row with no amount is never the same as one with an amount on the strength of its account. */
  const parts = (x: Fields, f: string): boolean => held(x, f) && typeof x[f] === 'object';
  let agreed = 0;
  let partsNamed = false;
  let partsAgreed = false;
  let across = false;
  for (const field of on) {
    if (parts(a, field) || parts(b, field)) partsNamed = true;
    if (!held(a, field) || !held(b, field)) {
      if (held(a, field) || held(b, field)) {
        across = true;
        continue;
      }
      return null;
    }
    if (!sameField(a, b, field)) return null;
    agreed++;
    if (parts(a, field)) partsAgreed = true;
  }
  if (agreed === 0) return null;
  if (partsNamed && !partsAgreed) return null;
  /* ONE PAYMENT NEVER GOES BOTH WAYS. Its way is not in every key (a bank's door reads it from which text came), and with
     the bank's words taken off, money to a person and money back from them read alike. */
  if (held(a, WAY) && held(b, WAY) && !sameField(a, b, WAY)) return null;

  /* A DAY FOR TWO ROWS THAT HOLD THE SAME FIELDS, AND THREE FOR A PAIR THAT CAME BY TWO ROADS (`NEAR_ACROSS_DAYS`). */
  const l = utcDay(a[day]);
  const r = utcDay(b[day]);
  if (l === undefined || r === undefined) return null;
  if (Math.abs(l - r) > (across ? NEAR_ACROSS_DAYS : 1) * DAY) return null;

  if (prefix !== undefined && !samePrefix(a, b, prefix.field, prefix.chars ?? PREFIX_CHARS)) return null;
  return across ? 'across' : 'strong';
}

