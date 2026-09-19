/**
 * Money, read out of a stranger's sentence without a float and without a guess.
 *
 * THE WHOLE FILE EXISTS BECAUSE `1.250` IS TWO DIFFERENT AMOUNTS. It is one thousand two hundred and fifty in
 * Cairo and one and a quarter in London, and the string does not say which. What decides is the currency's
 * exponent, so the currency has to be found before the number is read, and an amount whose currency is
 * unknown is not an amount: it is a number somebody would have to check (`43 §4.3`).
 *
 * NEVER A FLOAT. `Number('0.1') + Number('0.2')` is not `0.3`, and a ledger built on that drifts by a cent a
 * thousand rows and cannot be reconciled with a bank. Every amount here is integer minor units: the digit
 * string is assembled, the fraction is padded to the exponent, and `Number()` is applied once to a string of
 * digits (`02 §3`, ADR-032).
 *
 * REFUSE RATHER THAN ROUND. `JPY 12.5` is more precision than the yen has, and the two available answers are
 * 12 and 13. Both are wrong, one of them silently, so the answer is no candidate: the field is `missing`, the
 * row is `needs-review`, and a person sees it.
 *
 * NO `RegExp` (`43 §8`). One index that advances.
 */

export type Money = { amount: number; currency: string };
export type CurrencyTable = Record<string, { exponent: number; symbol?: string }>;

const MAX = Number.MAX_SAFE_INTEGER; // 2^53 − 1, the ceiling on minor units

const isDigit = (ch: string | undefined): boolean => ch !== undefined && ch >= '0' && ch <= '9';
const isLetter = (ch: string | undefined): boolean =>
  ch !== undefined && ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z'));
const isUpper = (ch: string | undefined): boolean => ch !== undefined && ch >= 'A' && ch <= 'Z';
const isSep = (ch: string | undefined): boolean => ch === ',' || ch === '.' || ch === "'" || ch === ' ';

/* ── the tokenizer, shared by money, int and decimal ─────────────────────── */

export type NumberToken = { text: string; start: number; end: number };

/**
 * May a number start at `i`?
 *
 * THE RULE IS ABOUT DATES AND REFERENCES, not about numbers. `29/08/26` holds three perfectly good integers
 * and none of them is an amount, and `2026-08-29` the same; a digit reached through `/`, `:` or `-` from
 * another digit is part of something that is not a number. A letter before it means it is an identifier
 * (`INV1250`). Everything else may start one, which is why `Ref 88213.` yields its integer.
 */
function mayStart(text: string, i: number): boolean {
  if (i === 0) return true;
  const prev = text[i - 1];
  if (isDigit(prev) || isLetter(prev)) return false;
  if (prev === '/' || prev === ':' || prev === '-') return !isDigit(text[i - 2]);
  return true;
}

/**
 * Every number token in `text`, in text order.
 *
 * A separator is only part of the token when a digit follows it, so a full stop ending a sentence ends the
 * token, and two spaces end it even though one would not.
 */
export function numberTokens(text: string): NumberToken[] {
  const out: NumberToken[] = [];
  for (let i = 0; i < text.length; ) {
    if (!isDigit(text[i]) || !mayStart(text, i)) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < text.length) {
      if (isDigit(text[j])) {
        j += 1;
        continue;
      }
      if (isSep(text[j]) && isDigit(text[j + 1])) {
        j += 1;
        continue;
      }
      break;
    }
    out.push({ text: text.slice(i, j), start: i, end: j });
    i = j;
  }
  return out;
}

/** A token split into its digit runs and the separators between them. */
function split(token: string): { groups: string[]; seps: string[] } {
  const groups: string[] = [];
  const seps: string[] = [];
  let run = '';
  for (const ch of token) {
    if (isDigit(ch)) run += ch;
    else {
      groups.push(run);
      seps.push(ch);
      run = '';
    }
  }
  groups.push(run);
  return { groups, seps };
}

/** Are the groups after the first exactly three digits long, and the first one to three? */
function grouped(groups: readonly string[], upto: number): boolean {
  if (groups[0]!.length < 1 || groups[0]!.length > 3) return false;
  for (let i = 1; i <= upto; i++) if (groups[i]!.length !== 3) return false;
  return true;
}

const safe = (digits: string): number | null => {
  const n = Number(digits);
  return Number.isSafeInteger(n) && Math.abs(n) <= MAX ? n : null;
};

/**
 * Read a token as minor units at exponent `e`, by the shape table of `43 §4.3`.
 *
 * THE THOUSANDS RULE, which is the one judgement call in the file: a lone separator followed by exactly three
 * digits is grouping, because at exponent 0, 1, 2 or 4 no valid amount has exactly three decimals — and at
 * exponent 3 it is the decimal point, because three decimals is what that currency writes. The ceiling is
 * named in `43 §10`: `KWD 1,250` meaning one thousand two hundred and fifty dinars reads as 1.250, and a
 * provider that writes dinars with grouping and no decimals is a provider that needs `map:` rather than text.
 */
export function readAmount(token: string, e: number): number | null {
  const { groups, seps } = split(token);
  if (groups.some((g) => g.length === 0)) return null;

  let whole: string;
  let fraction: string;

  if (seps.length === 0) {
    whole = groups[0]!;
    fraction = '';
  } else if (seps.length === 1) {
    const last = groups[1]!;
    if (last.length === 3 && e !== 3) {
      if (!grouped(groups, 1)) return null;
      whole = groups[0]! + last;
      fraction = '';
    } else {
      if (last.length > e) return null;
      whole = groups[0]!;
      fraction = last;
    }
  } else {
    /* Two or more: everything but the last separator is ONE grouping character over groups of exactly three.
       A last separator that differs is the decimal point; one that is the same has to leave three digits
       behind it, or the grouping is not grouping. */
    const groupChar = seps[0]!;
    for (let i = 0; i < seps.length - 1; i++) if (seps[i] !== groupChar) return null;
    if (!grouped(groups, seps.length - 1)) return null;
    const last = groups[groups.length - 1]!;
    if (seps[seps.length - 1] === groupChar) {
      if (last.length !== 3) return null;
      whole = groups.join('');
      fraction = '';
    } else {
      if (last.length > e) return null;
      whole = groups.slice(0, -1).join('');
      fraction = last;
    }
  }

  return safe(whole + fraction.padEnd(e, '0'));
}

/* ── currency ────────────────────────────────────────────────────────────── */

/** The symbols exactly one row carries. `$` with USD and CAD in the table is nobody's symbol (`43 §4.3`). */
function unambiguousSymbols(table: CurrencyTable): [string, string][] {
  const seen = new Map<string, string | null>();
  for (const [code, row] of Object.entries(table)) {
    if (row.symbol === undefined) continue;
    seen.set(row.symbol, seen.has(row.symbol) ? null : code);
  }
  const out: [string, string][] = [];
  for (const [symbol, code] of seen) if (code !== null) out.push([symbol, code]);
  return out.sort((a, b) => b[0].length - a[0].length);
}

/** A three-letter code ending at `pos` (exclusive), bounded by non-letters and present in the table. */
function codeBefore(text: string, pos: number, table: CurrencyTable): { code: string; at: number } | null {
  if (pos < 3) return null;
  for (let i = pos - 3; i < pos; i++) if (!isUpper(text[i])) return null;
  if (isLetter(text[pos - 4]) || isLetter(text[pos])) return null;
  const code = text.slice(pos - 3, pos);
  return Object.hasOwn(table, code) ? { code, at: pos - 3 } : null;
}

/** A three-letter code starting at `pos`. */
function codeAfter(text: string, pos: number, table: CurrencyTable): { code: string; at: number } | null {
  if (pos + 3 > text.length) return null;
  for (let i = pos; i < pos + 3; i++) if (!isUpper(text[i])) return null;
  if (isLetter(text[pos - 1]) || isLetter(text[pos + 3])) return null;
  const code = text.slice(pos, pos + 3);
  return Object.hasOwn(table, code) ? { code, at: pos + 3 } : null;
}

function symbolBefore(text: string, pos: number, symbols: readonly [string, string][]): { code: string; at: number } | null {
  for (const [symbol, code] of symbols)
    if (pos >= symbol.length && text.slice(pos - symbol.length, pos) === symbol)
      return { code, at: pos - symbol.length };
  return null;
}

function symbolAfter(text: string, pos: number, symbols: readonly [string, string][]): { code: string; at: number } | null {
  for (const [symbol, code] of symbols)
    if (text.slice(pos, pos + symbol.length) === symbol) return { code, at: pos + symbol.length };
  return null;
}

/* ── the scan ────────────────────────────────────────────────────────────── */

/**
 * Every amount in `text`, in text order.
 *
 * `declared` IS A FALLBACK AND NEVER AN OVERRIDE. A currency written next to the number is the provider
 * saying what it sent; `currency:` in the declaration is the reader saying what it expects. When both exist
 * and disagree, the provider wins, because it is the one that moved the money — and when two currencies sit
 * either side of one number and disagree, there is no candidate at all, because nothing in the string decides
 * and a coin flip here is a wrong balance.
 */
export function scanMoney(text: string, table: CurrencyTable, declared?: string): Money[] {
  const symbols = unambiguousSymbols(table);
  const out: Money[] = [];

  for (const token of numberTokens(text)) {
    /* Backwards: spaces, a currency, a sign and an opening parenthesis, each at most once and in whichever
       order they come — `-EGP 5` and `EGP -5` are the same amount and both are written. */
    let before: string | null = null;
    let sign = 0;
    let open = false;
    let j = token.start;
    for (let step = 0; step < 4; step++) {
      while (text[j - 1] === ' ') j -= 1;
      if (before === null) {
        const hit = codeBefore(text, j, table) ?? symbolBefore(text, j, symbols);
        if (hit !== null) {
          before = hit.code;
          j = hit.at;
          continue;
        }
      }
      const prev = text[j - 1];
      if (sign === 0 && (prev === '-' || prev === '−' || prev === '+')) {
        sign = prev === '+' ? 1 : -1;
        j -= 1;
        continue;
      }
      if (!open && prev === '(') {
        open = true;
        j -= 1;
        continue;
      }
      break;
    }

    /* Forwards: at most one space, then a currency, then a closing parenthesis. One space, because a
       currency two words away belongs to the next sentence. */
    let k = token.end;
    if (text[k] === ' ') k += 1;
    const afterHit = codeAfter(text, k, table) ?? symbolAfter(text, k, symbols);
    const after = afterHit?.code ?? null;
    if (afterHit !== null) k = afterHit.at;
    const closed = text[k] === ')';

    if (before !== null && after !== null && before !== after) continue;
    const currency = before ?? after ?? declared ?? null;
    if (currency === null || !Object.hasOwn(table, currency)) continue;

    const amount = readAmount(token.text, table[currency]!.exponent);
    if (amount === null) continue;

    const negative = sign === -1 || (open && closed);
    out.push({ amount: negative ? -amount : amount, currency });
  }
  return out;
}

/** The first amount in `text`, or nothing. */
export function parseMoney(text: string, table: CurrencyTable, declared?: string): Money | undefined {
  return scanMoney(text, table, declared)[0];
}

/* ── int and decimal, the same tokenizer with no currency ────────────────── */

/** Every whole number in `text`. Separators group; a fraction means it is not an integer. */
export function scanInts(text: string): number[] {
  const out: number[] = [];
  for (const token of numberTokens(text)) {
    const value = readAmount(token.text, 0);
    if (value !== null) out.push(value);
  }
  return out;
}

/**
 * Every decimal in `text`, with `sep` as the point and the other separators grouping.
 *
 * FIFTEEN SIGNIFICANT DIGITS, because past that a double cannot hold the value it was given and the number
 * read back is not the number written. A quantity that long is not a quantity, it is an identifier.
 */
export function scanDecimals(text: string, sep: '.' | ',' = '.'): number[] {
  const out: number[] = [];
  for (const token of numberTokens(text)) {
    const { groups, seps } = split(token.text);
    if (groups.some((g) => g.length === 0)) continue;
    const points = seps.filter((s) => s === sep).length;
    if (points > 1) continue;

    const at = seps.indexOf(sep);
    const whole = at === -1 ? groups : groups.slice(0, at + 1);
    const fraction = at === -1 ? '' : groups.slice(at + 1).join('');
    if (at !== -1 && seps.length - 1 > at) continue; // a separator after the point is not grouping
    const groupSeps = at === -1 ? seps : seps.slice(0, at);
    if (groupSeps.some((s) => s !== groupSeps[0])) continue;
    /* ONLY WHEN THERE IS GROUPING. `3020.15` has a four-digit whole part and is a perfectly ordinary
       decimal; the one-to-three rule is about what a grouping separator implies, not about size. */
    if (groupSeps.length > 0 && !grouped(whole, whole.length - 1)) continue;

    const digits = whole.join('');
    let lead = 0;
    while (lead < digits.length - 1 && digits[lead] === '0') lead += 1;
    if (digits.length - lead + fraction.length > 15) continue;
    const value = Number(fraction === '' ? digits : `${digits}.${fraction}`);
    if (Number.isFinite(value)) out.push(value);
  }
  return out;
}
