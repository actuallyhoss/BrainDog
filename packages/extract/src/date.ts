/**
 * Dates, read by a format the declaration gave, and never guessed.
 *
 * WHY A FORMAT IS REQUIRED AND NOT SNIFFED. `29/08/26` and `08/29/26` are both valid days and mean different
 * ones, and no amount of looking at a single arrival tells you which a provider writes. A sniffed format is
 * right for eleven months and wrong for the twelve days a year that make it ambiguous, which is exactly when
 * somebody's money moves. So `date:` carries `format:`, `declare` lints it at install, and this file refuses a
 * format it cannot read rather than falling back to one it likes (`43 §4.3`).
 *
 * NO `RegExp`, HERE OR ANYWHERE UNDER `src/` (`43 §8`). A compiled format is a list of tokens and the scan is
 * one index that only advances, so there is nothing to backtrack and nothing for a payload to make expensive.
 */

/**
 * A compiled format: fixed-width and variable-width field tokens, a month written as a name (`MN`), and
 * literal runs that match themselves.
 */
type Token = { kind: 'Y4' | 'Y2' | 'M2' | 'D2' | 'M1' | 'D1' | 'MN' } | { kind: 'lit'; text: string };

export type DateFormatInvalid = { code: 'DATE_FORMAT_INVALID'; at: string; fix: string };

const invalid = (at: string, fix: string): DateFormatInvalid => ({ code: 'DATE_FORMAT_INVALID', at, fix });

const isDigit = (ch: string | undefined): boolean => ch !== undefined && ch >= '0' && ch <= '9';

/* A format string is a declaration, not a payload, so caching one is caching something trusted and small.
   SIXTY-FOUR ENTRIES, because a record has a handful of declarations and an unbounded cache keyed by a string
   is a slow leak in a long-lived Worker. */
const CACHE_MAX = 64;
const cache = new Map<string, readonly Token[]>();

/**
 * Turn a format into tokens, or refuse it.
 *
 * THE THREE RULES ARE ALL ABOUT AMBIGUITY, not tidiness:
 *  - exactly one year, one month and one day token, because two of anything means the format cannot say which
 *    of the two a number belongs to, and none means the answer is not a calendar day at all;
 *  - a variable-width token (`D`, `M`) must be followed by a literal or the end, because `DMYYYY` over
 *    `1122026` reads as the 1st of December and the 11th of February equally well and nothing decides;
 *  - anything else is a literal that matches itself, so a separator is never optional.
 */
function compile(format: string): readonly Token[] {
  const hit = cache.get(format);
  if (hit !== undefined) return hit;

  const tokens: Token[] = [];
  let lit = '';
  const flush = () => {
    if (lit !== '') {
      tokens.push({ kind: 'lit', text: lit });
      lit = '';
    }
  };

  for (let i = 0; i < format.length; ) {
    const four = format.slice(i, i + 4);
    const three = format.slice(i, i + 3);
    const two = format.slice(i, i + 2);
    if (four === 'YYYY') {
      flush();
      tokens.push({ kind: 'Y4' });
      i += 4;
    } else if (two === 'YY') {
      flush();
      tokens.push({ kind: 'Y2' });
      i += 2;
    } else if (three === 'MON') {
      /* CHECKED BEFORE `MM` AND `M`, which cannot start it anyway: `MON` begins with one `M` and then a
         letter no token uses, so `MMON` is still `MM` and a literal `ON`, exactly as it read before. */
      flush();
      tokens.push({ kind: 'MN' });
      i += 3;
    } else if (two === 'MM') {
      flush();
      tokens.push({ kind: 'M2' });
      i += 2;
    } else if (two === 'DD') {
      flush();
      tokens.push({ kind: 'D2' });
      i += 2;
    } else if (format[i] === 'M') {
      flush();
      tokens.push({ kind: 'M1' });
      i += 1;
    } else if (format[i] === 'D') {
      flush();
      tokens.push({ kind: 'D1' });
      i += 1;
    } else {
      lit += format[i];
      i += 1;
    }
  }
  flush();

  const count = (kinds: readonly Token['kind'][]) => tokens.filter((t) => kinds.includes(t.kind)).length;
  if (count(['Y4', 'Y2']) !== 1 || count(['M2', 'M1', 'MN']) !== 1 || count(['D2', 'D1']) !== 1)
    throw invalid(
      'date.format',
      'A format holds exactly one year token (YYYY or YY), one month token (MM, M or MON) and one day token (DD or D).',
    );

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.kind !== 'M1' && t.kind !== 'D1') continue;
    const next = tokens[i + 1];
    /* `D` RUN INTO `MON` IS REFUSED TOO, although a digit and a letter can always be told apart. The
       kernel's `declare` lints a format before this ever sees one, and it reads `DMON` as `D` then `M`,
       which it refuses; a format this package accepted and the door refused would be a rule nobody can
       reach. `DDMON` costs one character and reads everywhere. */
    if (next !== undefined && next.kind !== 'lit')
      throw invalid(
        'date.format',
        'A one-or-two digit token (D or M) must be followed by a separator or end the format, or the digits either side cannot be told apart. Use DD or MM instead.',
      );
  }

  /* CLEARED WHOLE WHEN IT FILLS, which `43 §10` names: a record with more than sixty-four date formats is
     not a record this was built for, and an eviction policy would be machinery for a case that does not
     arise. */
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(format, tokens);
  return tokens;
}

const leap = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** The day has to exist. `31/02` is not a date that needs a review, it is not a date. */
const realDay = (y: number, m: number, d: number): boolean => {
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= (m === 2 && leap(y) ? 29 : MONTH_DAYS[m - 1]!);
};

const pad = (n: number, width: number): string => String(n).padStart(width, '0');

/** Read a fixed number of digits, or nothing. */
function fixed(text: string, at: number, width: number): { value: number; next: number } | null {
  if (at + width > text.length) return null;
  for (let i = at; i < at + width; i++) if (!isDigit(text[i])) return null;
  return { value: Number(text.slice(at, at + width)), next: at + width };
}

/** Read one or two digits, greedily: `D` over `29/` takes both, over `9/` takes one. */
function greedy(text: string, at: number): { value: number; next: number } | null {
  if (!isDigit(text[at])) return null;
  const width = isDigit(text[at + 1]) ? 2 : 1;
  return { value: Number(text.slice(at, at + width)), next: at + width };
}

/**
 * English three-letter month names, in calendar order.
 *
 * ENGLISH ONLY, AND ONLY THREE LETTERS, because that is what the bank this was written for prints
 * (`16AUG26`) and a longer list is a list of guesses: `SEPT`, `JUNE` and a French `AOÛT` are each somebody's
 * month, and a table that held them would have to decide which language a message is in before it could
 * read a day out of it. A four-letter name is not a month here; it is a date that is reviewed.
 */
const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const;

const isLetter = (ch: string | undefined): boolean => ch !== undefined && ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z'));

/** Read three letters that name a month, in any case, or nothing. */
function monthName(text: string, at: number): { value: number; next: number } | null {
  if (at + 3 > text.length) return null;
  const three = text.slice(at, at + 3);
  for (let i = 0; i < 3; i++) if (!isLetter(three[i])) return null;
  const index = (MONTH_NAMES as readonly string[]).indexOf(three.toLowerCase());
  return index === -1 ? null : { value: index + 1, next: at + 3 };
}

/** One attempt, starting at `at`. Returns the day and where it ended, or null. */
function matchAt(text: string, at: number, tokens: readonly Token[]): { day: string; end: number } | null {
  let i = at;
  let year: number | null = null;
  let month: number | null = null;
  let day: number | null = null;
  let firstToken = -1;
  let firstKind: Token['kind'] | null = null;
  let lastKind: Token['kind'] | null = null;
  let lastEnd = -1;

  for (const t of tokens) {
    if (t.kind === 'lit') {
      if (text.slice(i, i + t.text.length) !== t.text) return null;
      i += t.text.length;
      continue;
    }
    if (firstToken === -1) {
      firstToken = i;
      firstKind = t.kind;
    }
    const got =
      t.kind === 'Y4'
        ? fixed(text, i, 4)
        : t.kind === 'Y2' || t.kind === 'M2' || t.kind === 'D2'
          ? fixed(text, i, 2)
          : t.kind === 'MN'
            ? monthName(text, i)
            : greedy(text, i);
    if (got === null) return null;
    if (t.kind === 'Y4') year = got.value;
    else if (t.kind === 'Y2') year = 2000 + got.value;
    else if (t.kind === 'M2' || t.kind === 'M1' || t.kind === 'MN') month = got.value;
    else day = got.value;
    i = got.next;
    lastEnd = i;
    lastKind = t.kind;
  }

  /* BOUNDED AT BOTH ENDS. `129/08/26` is not the 29th and `29/08/261` is not 2026: a digit touching the number
     means the number is not the one the format describes, and taking it anyway invents a date out of the
     middle of a reference number. */
  if (firstToken > 0 && isDigit(text[firstToken - 1])) return null;
  if (isDigit(text[lastEnd])) return null;
  /* AND A NAME IS BOUNDED BY LETTERS, for the same reason a number is bounded by digits: `XAug 16 2026`
     is a word that ends in `aug`, and `Augusta 16 2026` is a place. Only where the name sits at an edge
     of the format, because inside one (`16AUG26`) the tokens either side already fix where it starts. */
  if (firstKind === 'MN' && isLetter(text[firstToken - 1])) return null;
  if (lastKind === 'MN' && isLetter(text[lastEnd])) return null;
  if (year === null || month === null || day === null) return null;
  if (!realDay(year, month, day)) return null;
  return { day: `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`, end: lastEnd };
}

/**
 * Every calendar day in `text` matching `format`, in text order.
 *
 * NON-OVERLAPPING, deliberately: the scan continues after a day it read, not one character along. An
 * overlapping attempt inside a date that already matched can only produce a second reading of the same digits,
 * and an `nth:` counting over that list would be counting phantoms.
 */
export function scanDates(text: string, format: string): string[] {
  const tokens = compile(format);
  const out: string[] = [];
  for (let i = 0; i < text.length; ) {
    const got = matchAt(text, i, tokens);
    if (got === null) {
      i += 1;
      continue;
    }
    out.push(got.day);
    i = Math.max(got.end, i + 1);
  }
  return out;
}

/** The first calendar day in `text` matching `format`, as `YYYY-MM-DD`, or nothing. */
export function parseDate(text: string, format: string): string | undefined {
  return scanDates(text, format)[0];
}
