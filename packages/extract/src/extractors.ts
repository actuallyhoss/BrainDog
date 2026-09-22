/**
 * The ten extractors and three combinators, over one text.
 *
 * THIS FILE NEVER SEES A DECLARATION. It sees one form and one string, which is why a reviewer asking "why
 * was this row proposed?" reads `index.ts` and not this: everything here is mechanical, and every judgement
 * about confidence lives one file up (`43 §3`).
 *
 * WHY EVERY SCAN IS ONE ADVANCING PASS. A payload is a stranger's (`12 §5`), and the classic way to turn a
 * stranger's text into an outage is a pattern that backtracks. There is no `RegExp` under this package at all
 * (`43 §8`): an anchor is `indexOf`, a number is a walk, a literal is compared. The brief's rule — anchored,
 * bounded, literals escaped — is satisfied by having nothing to anchor and nothing to escape.
 *
 * MATCHING IS ASCII-CASE-INSENSITIVE OVER A PARALLEL FOLDED COPY, never over a lowered original: the copy is
 * the same length, so an index into it is an index into the text, and a value is always sliced from the text
 * a person actually received (`34 §1.2`).
 */

import type { Json } from '@braindog/where';

import { scanDates } from './date.ts';
/* `SPACE_LIKE` COMES FROM `money.ts` and is not declared twice. It was here, with sixteen members,
   while `money.ts` knew about the ASCII space alone, and the two disagreeing is how a no-break space
   turned 2,642.97 into 2.00 for any caller who reached `parseMoney` without normalising first. The
   list belongs to the file that has to tell a separator from the end of a number. */
import { scanDecimals, scanInts, scanMoney, SPACE_LIKE, type CurrencyTable } from './money.ts';

/* ONE `Json`, FROM `where`. It was defined here when this package had no dependencies; it has one now, and
   two structurally identical definitions of the same type are two places for it to stop being identical. */
export type { Json };

export const EXTRACTORS = [
  'after',
  'before',
  'between',
  'money',
  'date',
  'text',
  'int',
  'decimal',
  'enum',
  'lookup',
] as const;

export const COMBINATORS = ['first', 'nth', 'default'] as const;

type Anchor = { after?: string; before?: string; between?: [string, string] };

export type Form =
  | { after: string }
  | { before: string }
  | { between: [string, string] }
  | { text: Anchor }
  | { money: Anchor & { currency?: string } }
  | { date: Anchor & { format: string } }
  | { int: Anchor }
  | { decimal: Anchor & { sep?: '.' | ',' } }
  | { enum: Anchor & { map: Record<string, Json> } }
  | { lookup: Anchor & { register: string; by: string } }
  | { first: Form[] }
  | { nth: { n: number; of: Form } }
  | { default: { value: Json; of: Form } };

export type RunCtx = {
  currencies: CurrencyTable;
  lookup: (register: string, by: string) => { id: string; value: string }[];
};

/** What one form found: values in text order, and whether finding them cost a judgement. */
export type Found = { values: Json[]; note: 'exact' | 'chosen' | 'defaulted' } | 'ambiguous';

export type ExtractorUnknown = { code: 'EXTRACTOR_UNKNOWN'; at: string; fix: string };

const unknown = (at: string, fix: string): ExtractorUnknown => ({ code: 'EXTRACTOR_UNKNOWN', at, fix });

const found = (values: Json[], note: 'exact' | 'chosen' | 'defaulted' = 'exact'): Found => ({ values, note });

/* ── normalise and fold ──────────────────────────────────────────────────── */


const INVISIBLE = new Set(['\u200b', '\u200c', '\u200d', '\ufeff']);

/**
 * One text, in the shape every extractor sees.
 *
 * ZERO-WIDTH CHARACTERS GO FIRST AND GO ENTIRELY. They are invisible to the person reading the arrival and
 * visible to `indexOf`, so a provider — or somebody who can write into one — could put one inside `EGP` and
 * walk past an anchor, an `enum` literal and a `match:` alike while the message still reads correctly on
 * screen. Stripping them is the difference between what the reader saw and what the scanner scanned being
 * the same string (`43 §8`).
 *
 * NO UNICODE NORMALISATION (`43 §10`): NFKC would fold a full-width digit into an ASCII one and change the
 * length, and every index here is a position in the text the record stored.
 */
export function normalise(text: string): string {
  let flat = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (INVISIBLE.has(ch)) continue;
    if (ch === '\r') {
      if (text[i + 1] === '\n') continue; // CRLF: the LF that follows does the work
      flat += '\n';
      continue;
    }
    flat += SPACE_LIKE.has(ch) ? ' ' : ch;
  }

  const lines: string[] = [];
  for (const line of flat.split('\n')) {
    let out = '';
    let wasSpace = false;
    for (const ch of line) {
      const space = ch === ' ';
      if (space && wasSpace) continue;
      out += ch;
      wasSpace = space;
    }
    lines.push(out.trim());
  }
  return lines.join('\n');
}

/** The parallel copy used for matching: ASCII case only, so the length never moves. */
export function fold(text: string): string {
  let out = '';
  for (const ch of text) out += ch >= 'A' && ch <= 'Z' ? ch.toLowerCase() : ch;
  return out;
}

const isWordChar = (ch: string | undefined): boolean =>
  ch !== undefined &&
  ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9'));

/** Bounded by characters that are neither letters nor digits — so `in` is not inside `coin`. */
const wholeToken = (folded: string, at: number, length: number): boolean =>
  !isWordChar(folded[at - 1]) && !isWordChar(folded[at + length]);

/* ── anchors ─────────────────────────────────────────────────────────────── */

type Slice = { start: number; end: number };

/**
 * The slices one anchor selects, in text order. No anchor is the whole text, once.
 *
 * EVERY OCCURRENCE, not the first: a statement lists twenty transactions and `between: ["at ", " on"]` is
 * meant to yield twenty merchants. `nth:` is how a declaration asks for one of them, and it can only do that
 * if they are all here.
 */
/**
 * An anchor literal at least one character long, or `null` for anything shorter.
 *
 * AN EMPTY LITERAL IS NOT AN ANCHOR (`43 §4.3`: an anchor literal is at least one character, and
 * `declare` refuses a shorter one at install — this is the defence-in-depth check for a form that
 * reaches here another way). `indexOf('')` is 0 at every index, so a walk that advances past each
 * hit by the literal's own length advances by ZERO over an empty one: not a slow scan, an infinite
 * loop that grows its slice list until the process runs out of memory. Treated here as no anchor at
 * all, the way the kernel's own `slices()` treats it (`ingest.ts`).
 */
const literal = (v: string | undefined): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

function slices(anchor: Anchor, text: string, folded: string, at: string): Slice[] {
  const keys = [anchor.after, anchor.before, anchor.between].filter((v) => v !== undefined);
  if (keys.length > 1)
    throw unknown(at, 'A form takes at most one of after, before or between. Use two fields, or between.');

  if (anchor.between !== undefined) {
    const [a, b] = anchor.between;
    const open = literal(a);
    if (open === null) return [];
    const needle = fold(open);
    const close = fold(b);
    const out: Slice[] = [];
    /* `43 §5.3` STEP 1, VERBATIM: "advancing past every hit" — past the whole literal, not one
       character. See the `after` branch below for why a `+1` walk answers wrong. */
    for (let i = folded.indexOf(needle); i !== -1; i = folded.indexOf(needle, i + needle.length)) {
      const from = i + needle.length;
      const to = folded.indexOf(close, from);
      /* AN OPENING WITH NO CLOSE YIELDS NOTHING, rather than running to the end of the body. "after the
         merchant, to the end of a statement" is a different declaration from "between the merchant and the
         date", and quietly turning one into the other puts a page of text in a field. */
      if (to !== -1) out.push({ start: from, end: to });
    }
    return out;
  }

  const after = literal(anchor.after);
  if (after !== null) {
    const needle = fold(after);
    const out: Slice[] = [];
    /* `43 §5.3` STEP 1, VERBATIM: "Each occurrence of the anchor literal (`indexOf` over `folded`,
       advancing past every hit) yields one slice." Past every HIT — the whole literal — not past one
       character: a `+1` walk turns an overlapping match into an extra occurrence, so `aaaa` under
       `{ after: 'aa' }` would answer `['aa', 'a', '']` for a literal that only occurs twice. */
    for (let i = folded.indexOf(needle); i !== -1; i = folded.indexOf(needle, i + needle.length))
      out.push({ start: i + needle.length, end: text.length });
    return out;
  }
  const before = literal(anchor.before);
  if (before !== null) {
    const needle = fold(before);
    const out: Slice[] = [];
    for (let i = folded.indexOf(needle); i !== -1; i = folded.indexOf(needle, i + needle.length))
      out.push({ start: 0, end: i });
    return out;
  }
  return [{ start: 0, end: text.length }];
}

const collapse = (text: string): string => {
  let out = '';
  let wasSpace = false;
  for (const ch of text) {
    const space = ch === ' ' || ch === '\t' || ch === '\n';
    if (space && wasSpace) continue;
    out += space ? ' ' : ch;
    wasSpace = space;
  }
  return out.trim();
};

/* ── enum and lookup ─────────────────────────────────────────────────────── */

/**
 * The longest literal present as a whole token, or `'ambiguous'`.
 *
 * LONGEST WINS, because `credited` contains no shorter literal by accident but `debit` sits inside
 * `debited`, and a table holding both means the provider writes both. TWO OF EQUAL LENGTH MAPPING TO
 * DIFFERENT ANSWERS IS AMBIGUOUS AND NOT A PREFERENCE: `sent 5 recv 5` is a message this declaration cannot
 * read, and picking the earlier one would write a debit where a credit belongs — silently, and only
 * sometimes, which is the worst of both.
 */
/**
 * `43 §4.3`'s `enum` and `lookup` rule over already-folded text: the longest literal present as a
 * WHOLE TOKEN wins, and two of equal length with different values are **ambiguous**.
 *
 * EXPORTED THROUGH `matchLiterals` BELOW, because the kernel reads both of those forms too and read
 * them with `String.includes` and no ambiguity at all — so `coin` matched the literal `in`, and two
 * literals both present were decided by `Object.keys` order. It is rank 9 to the kernel's 7, so it
 * is handed down rather than imported, the way the number readers are (`31 §2`).
 */
function matchFolded(folded: string, entries: readonly (readonly [string, Json])[]): Json[] | 'ambiguous' {
  let best: { length: number; value: Json } | null = null;
  let clash = false;

  for (const [literal, value] of entries) {
    const needle = fold(literal);
    if (needle.length === 0) continue;
    let hit = false;
    for (let i = folded.indexOf(needle); i !== -1; i = folded.indexOf(needle, i + 1))
      if (wholeToken(folded, i, needle.length)) {
        hit = true;
        break;
      }
    if (!hit) continue;

    if (best === null || needle.length > best.length) {
      best = { length: needle.length, value };
      clash = false;
    } else if (needle.length === best.length && JSON.stringify(value) !== JSON.stringify(best.value)) {
      clash = true;
    }
  }

  if (best === null) return [];
  return clash ? 'ambiguous' : [best.value];
}

/**
 * `lookup`'s second rule, asked only when no row's value is a whole token: DIGITS PRINTED BEHIND STARS ARE THE
 * TAIL OF A LONGER VALUE, and they answer the one row whose value ends in them, or `'ambiguous'` for two or more.
 *
 * WHY IT EXISTS. `loop/research-bank-real.md`, *The three that did not read*, item 3: his bank prints one EGP
 * account as stars and four digits in its InstaPay messages and as a branch code, three stars and the last three
 * of those four in its `From HSBC:` lines. The whole-token rule could read one family or the other, never both,
 * so whichever `last4` he typed, one family went to review with the account unread.
 *
 * THE STARS ARE REQUIRED, because they are the bank saying the digits are a tail and nothing else in a slice
 * says so. A bare digit run is a figure as often as not, and `00` out of `EGP 900.00` ends a great many account
 * numbers. One `-` or space may stand between the stars and the digits, which is the `From HSBC:` shape. A value
 * no longer than the digits is not asked about, because a value that short would have been a whole token.
 *
 * TWO ROWS ENDING IN THE DIGITS IS A PERSON'S QUESTION and never the first row found: the declaration cannot know
 * which of two accounts the bank meant, and filing against the wrong one moves a balance nobody checks.
 *
 * `enum` NEVER GETS HERE. A map's words are a provider's vocabulary and a masked number is not a word in it.
 */
function matchMaskedTail(folded: string, entries: readonly (readonly [string, Json])[]): Json[] | 'ambiguous' {
  let answer: Json | undefined;
  for (let i = folded.indexOf('*'); i !== -1; i = folded.indexOf('*', i + 1)) {
    if (folded[i - 1] === '*') continue;
    let at = i;
    while (folded[at] === '*') at += 1;
    if (folded[at] === '-' || folded[at] === ' ') at += 1;
    const from = at;
    while (folded[at] !== undefined && folded[at]! >= '0' && folded[at]! <= '9') at += 1;
    if (at === from || isWordChar(folded[at])) continue;
    const digits = folded.slice(from, at);

    for (const [literal, value] of entries) {
      const whole = fold(literal);
      if (whole.length <= digits.length || !whole.endsWith(digits)) continue;
      if (answer !== undefined && JSON.stringify(answer) !== JSON.stringify(value)) return 'ambiguous';
      answer = value;
    }
  }
  return answer === undefined ? [] : [answer];
}

/**
 * `matchFolded` over text that has not been folded yet, which is the form a caller outside this file wants, and for
 * `lookup` alone `matchMaskedTail` when the whole-token rule found nothing.
 *
 * THE FORM IS AN ARGUMENT AND NOT A SECOND EXPORT, so the record that hands this down (`record/src/index.ts`,
 * `literals: matchLiterals`) reaches the lookup rule with no new wiring, and a caller that names no form gets the
 * rule `enum` has always had.
 */
export function matchLiterals(
  text: string,
  entries: readonly (readonly [string, Json])[],
  form: 'enum' | 'lookup' = 'enum',
): Json[] | 'ambiguous' {
  const folded = fold(text);
  const got = matchFolded(folded, entries);
  if (form !== 'lookup' || got === 'ambiguous' || got.length > 0) return got;
  return matchMaskedTail(folded, entries);
}

/**
 * Where a lookup slice starts once the mask in front of it is counted: the run of stars, and the one `-` or space
 * after them, that an anchor such as `between: ['***-', ' ']` consumed.
 *
 * THE ANCHOR IS WHERE THE STARS WERE. `bank-from-out` boxes its account between `***-` and a space, so the slice
 * is a bare `518` and the one sign that it is a tail sits outside it. Widening over stars and one separator adds
 * no letter or digit, so no whole token changes.
 */
function maskedStart(folded: string, start: number): number {
  let at = start;
  if ((folded[at - 1] === '-' || folded[at - 1] === ' ') && folded[at - 2] === '*') at -= 1;
  if (folded[at - 1] !== '*') return start;
  while (folded[at - 1] === '*') at -= 1;
  return at;
}

/* ── the forms ───────────────────────────────────────────────────────────── */

const DEPTH_MAX = 3;
const FIRST_MAX = 8;
const NTH_MAX = 64;
const ENUM_MAX = 64;

/**
 * Run one form over one text.
 *
 * `text` and `folded` have equal length and `folded` is `fold(text)`; candidates from several anchor slices
 * concatenate in text order.
 */
export function run(form: Form, text: string, folded: string, ctx: RunCtx, at = 'extract', depth = 1): Found {
  /* THREE LEVELS ARE ALLOWED AND A FOURTH IS NOT, counting the outermost form as one. Checked here
     rather than inside each combinator, because a combinator-only check counts the wrong thing: it
     let `first > nth > first > money` through, which is four forms deep, on the grounds that only
     three of them combine. And the first version refused the third level outright, a cap the
     specification does not have. Both are the kind of off-by-one nobody finds until an author
     writes the declaration the document says is legal. */
  if (depth > DEPTH_MAX)
    throw unknown(at, 'Forms nest three deep at most. Flatten the form, or extract two fields and combine them in a rule.');

  /* `NOTE` IS DATA, NOT PART OF THE FORM (`42 §4`, `42-SPEC-DECLARE.md` line 205: *a note is data,
     not a YAML comment. Legal on every declaration, field, block, section and action below*).
     `declare` filters it out of an extractor's keys before counting them, so `{ note: '...', money:
     {...} }` installs clean — a key whose only job is to be ignored has to be ignored here too, or
     an accepted declaration throws `EXTRACTOR_UNKNOWN` the first time an arrival reaches it. */
  const keys = Object.keys(form).filter((k) => k !== 'note');
  if (keys.length !== 1)
    throw unknown(at, 'A form is one object with exactly one key from the ten extractors or the three combinators.');
  const key = keys[0]!;

  /* The combinators first: they take a form rather than a text. */
  if (key === 'first') {
    const forms = (form as { first: Form[] }).first;
    if (forms.length < 2 || forms.length > FIRST_MAX)
      throw unknown(at, `first: takes between two and ${FIRST_MAX} forms.`);

    let winner: Found | null = null;
    let yielded = 0;
    for (const [i, one] of forms.entries()) {
      const got = run(one, text, folded, ctx, `${at}.first[${i}]`, depth + 1);
      /* AMBIGUITY IS NOT A MISS, so it does not fall through to the next form. The text held two readings
         and the next form cannot unsay that; `default:` takes the same line for the same reason. */
      if (got === 'ambiguous') return 'ambiguous';
      if (got.values.length === 0) continue;
      yielded += 1;
      if (winner === null) winner = got;
    }
    if (winner === null) return found([]);
    /* TWO FORMS THAT BOTH YIELDED IS `chosen` AND NOT `exact`: the declaration listed alternatives and the
       text satisfied more than one, so the answer is the order of the list rather than the message. That is
       a fine answer and a person should still be able to see that it was one. */
    return found([winner.values[0]!], yielded > 1 ? 'chosen' : winner.note);
  }

  if (key === 'nth') {
    const { n, of } = (form as { nth: { n: number; of: Form } }).nth;
    if (!Number.isInteger(n) || n < 1 || n > NTH_MAX) throw unknown(at, `nth.n is a whole number from 1 to ${NTH_MAX}.`);
    const got = run(of, text, folded, ctx, `${at}.nth.of`, depth + 1);
    if (got === 'ambiguous') return 'ambiguous';
    const value = got.values[n - 1];
    return found(value === undefined ? [] : [value], got.note);
  }

  if (key === 'default') {
    const { value, of } = (form as { default: { value: Json; of: Form } }).default;
    const got = run(of, text, folded, ctx, `${at}.default.of`, depth + 1);
    /* A DEFAULT COVERS ABSENCE, NEVER AMBIGUITY. "the text did not say" is a thing a declaration can answer
       in advance; "the text said two things" is not, and answering it with a default would write the
       fallback over a real value the message contained. */
    if (got === 'ambiguous') return 'ambiguous';
    return got.values.length > 0 ? got : found([value], 'defaulted');
  }

  /* The ten. Each reads the slices its anchor selects. */
  const body = (form as Record<string, unknown>)[key];

  if (key === 'after' || key === 'before') {
    const anchor = { [key]: body as string } as Anchor;
    return found(slices(anchor, text, folded, at).map((s) => text.slice(s.start, s.end)));
  }
  if (key === 'between') {
    const anchor = { between: body as [string, string] };
    return found(slices(anchor, text, folded, at).map((s) => text.slice(s.start, s.end)));
  }

  const anchor = (body ?? {}) as Anchor;
  const picked = slices(anchor, text, folded, at);
  const values: Json[] = [];

  switch (key) {
    case 'text':
      for (const s of picked) {
        const slice = collapse(text.slice(s.start, s.end));
        if (slice !== '') values.push(slice);
      }
      return found(values);

    case 'money': {
      const declared = (body as { currency?: string }).currency;
      for (const s of picked)
        for (const m of scanMoney(text.slice(s.start, s.end), ctx.currencies, declared)) values.push(m);
      return found(values);
    }

    case 'date': {
      const format = (body as { format?: string }).format;
      if (typeof format !== 'string')
        throw unknown(at, 'A date: needs format:, for example DD/MM/YYYY. A date is never guessed.');
      for (const s of picked) for (const d of scanDates(text.slice(s.start, s.end), format)) values.push(d);
      return found(values);
    }

    case 'int':
      for (const s of picked) for (const n of scanInts(text.slice(s.start, s.end))) values.push(n);
      return found(values);

    case 'decimal': {
      const sep = (body as { sep?: '.' | ',' }).sep ?? '.';
      for (const s of picked) for (const n of scanDecimals(text.slice(s.start, s.end), sep)) values.push(n);
      return found(values);
    }

    case 'enum': {
      const map = (body as { map?: Record<string, Json> }).map;
      if (map === undefined || typeof map !== 'object')
        throw unknown(at, 'An enum: needs map:, from the words the provider writes to the values you keep.');
      const entries = Object.entries(map);
      if (entries.length > ENUM_MAX) throw unknown(at, `An enum: map holds at most ${ENUM_MAX} words.`);
      return resolveOne(picked, folded, () => entries);
    }

    case 'lookup': {
      const { register, by } = body as { register?: string; by?: string };
      if (typeof register !== 'string' || typeof by !== 'string')
        throw unknown(at, 'A lookup: needs register: and by:, naming the list to search and the field to match.');
      const rows = ctx.lookup(register, by);
      return resolveOne(picked, folded, () => rows.map((r) => [r.value, r.id] as [string, Json]), 'lookup');
    }

    default:
      throw unknown(at, `Use one of: ${EXTRACTORS.join(', ')}, or ${COMBINATORS.join(', ')}.`);
  }
}

/** `enum` and `lookup` answer once for the whole form, so their slices resolve together. */
function resolveOne(
  picked: readonly Slice[],
  folded: string,
  entries: () => [string, Json][],
  form: 'enum' | 'lookup' = 'enum',
): Found {
  const table = entries();
  let answer: Json[] | null = null;
  for (const s of picked) {
    const got =
      form === 'lookup'
        ? matchLiterals(folded.slice(maskedStart(folded, s.start), s.end), table, 'lookup')
        : matchFolded(folded.slice(s.start, s.end), table);
    if (got === 'ambiguous') return 'ambiguous';
    if (got.length === 0) continue;
    if (answer !== null && JSON.stringify(answer) !== JSON.stringify(got)) return 'ambiguous';
    answer = got;
  }
  return found(answer ?? []);
}
