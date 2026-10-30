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

/**
 * WHICH OF THE THREE DIGIT SYSTEMS A CHARACTER IS FROM: 0 Latin, 1 Arabic-Indic (`٠`–`٩`, U+0660), 2 the extended
 * Arabic-Indic of Persian and Urdu (`۰`–`۹`, U+06F0), or -1 for none.
 *
 * AN EGYPTIAN BANK WRITING IN ARABIC WRITES `١٬٢٥٠٫٠٠`, and with `0`–`9` as the only digits that SMS held no number
 * at all: no amount, every time, on the record of a man who banks in Cairo. `43 §10` still rules out Unicode
 * normalisation, and this is not that: each of these digits is one UTF-16 unit, as its Latin twin is, so reading
 * one as the other moves no index. The digits are mapped where a token is READ (`split`), and the text is never
 * rewritten.
 *
 * A NUMBER WRITTEN IN TWO SYSTEMS IS REFUSED WHOLE (`split`'s `mixed`). `١2٣` is a typo, a forgery or two numbers
 * run together, and no reading of it is one anybody sent.
 */
function systemOf(ch: string | undefined): number {
  if (ch === undefined) return -1;
  if (ch >= '0' && ch <= '9') return 0;
  const c = ch.charCodeAt(0);
  if (c >= 0x0660 && c <= 0x0669) return 1;
  if (c >= 0x06f0 && c <= 0x06f9) return 2;
  return -1;
}
const isDigit = (ch: string | undefined): boolean => systemOf(ch) !== -1;
/** A digit of any of the three systems as its Latin twin. */
const latin = (ch: string): string => {
  const system = systemOf(ch);
  return system === 0 ? ch : String.fromCharCode(0x30 + ch.charCodeAt(0) - (system === 1 ? 0x0660 : 0x06f0));
};
/** Is `ch` a digit, in any of the three systems? The bidi-mark rule in `extractors.ts` asks it. */
export const isAnyDigit = isDigit;

/**
 * THE ARABIC DECIMAL SEPARATOR (`٫`, U+066B) AND THOUSANDS SEPARATOR (`٬`, U+066C), which say which they are.
 *
 * `1.250` is two amounts; `١٫٢٥٠` is one, because U+066B is never grouping and U+066C is never a point. So a token
 * carrying either is read by what the marks say (`readArabic`) and not by the thousands rule, and a token that
 * carries one of them beside a `.` or `,` is refused: `١٫٢٣٤,٥٠` has two decimal points by two conventions, and
 * the only way to read it is to pick one.
 */
const ARABIC_POINT = '٫';
const ARABIC_GROUP = '٬';
const isArabicSep = (ch: string): boolean => ch === ARABIC_POINT || ch === ARABIC_GROUP;

/**
 * THE APOSTROPHE AS SWITZERLAND PRINTS IT: `'` on a keyboard, `’` (U+2019) out of `Intl` and every Swiss bank's
 * PDF, and `‘` (U+2018) from a word processor that curled it the wrong way.
 *
 * `isSep` held the keyboard one alone, so `CHF 1’234.50` tokenised as `1` and `234.50` and the first token took the
 * code: CHF 1.00, in the ledger, a thousand times too small. A WRONG NUMBER, which is the class this file exists
 * to refuse.
 *
 * AND AN APOSTROPHE ONLY EVER GROUPS. No locale writes it as a decimal point, so `KWD 1’250` is one thousand two
 * hundred and fifty dinars and not the one and a quarter the thousands rule gives a lone `,` at exponent 3, and
 * `5’50` is refused rather than read as five and a half.
 */
const isApostrophe = (ch: string | undefined): boolean => ch === "'" || ch === '’' || ch === '‘';

const isLetter = (ch: string | undefined): boolean =>
  ch !== undefined && ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z'));
const isUpper = (ch: string | undefined): boolean => ch !== undefined && ch >= 'A' && ch <= 'Z';
/**
 * THE SIXTEEN SPACES A STATEMENT PRINTS, and not just the one on the keyboard.
 *
 * `normalise` in `extractors.ts` folds all of these to a plain space before any extractor runs, and this
 * file knew about `U+0020` alone, so two lists answered one question. Nothing inside the package noticed,
 * because `pipeline.ts` normalises before it scans - but `parseMoney` is one of `43 §2`'s nine exported
 * functions and its contract says nothing about normalising first.
 *
 * THE DISAGREEMENT COST A WRONG NUMBER RATHER THAN NO NUMBER, which is the class this package exists to
 * avoid. `EGP 2<U+00A0>642,97` tokenised as `2` and `642,97`, so 2,642.97 read as 2.00: the right
 * currency, in the ledger, three orders of magnitude out, and no outcome that puts it in front of
 * anybody. `U+00A0` is the `&nbsp;` of every HTML email, and `U+202F` is what `Intl.NumberFormat('fr-FR')`
 * itself prints, so the record could not read back a number it had formatted.
 *
 * EXPORTED, AND `normalise` READS IT. One list, and it lives here because this is the file that has to
 * tell a group separator from the end of a number.
 */
export const SPACE_LIKE: ReadonlySet<string> = new Set([
  '\t', '\u00a0', '\u2000', '\u2001', '\u2002', '\u2003', '\u2004', '\u2005', '\u2006',
  '\u2007', '\u2008', '\u2009', '\u200a', '\u202f', '\u205f', '\u3000',
]);

/**
 * A SPACE, INCLUDING THE FIFTEEN THAT ARE NOT `U+0020`.
 *
 * `isSep` consulted `SPACE_LIKE` from the day it was written, and the two space skips in `scanMoney`
 * compared against the literal `' '`, so one function in this file knew about the other fifteen and the
 * other did not. `EGP<U+00A0>5.00` tokenised its number and then failed to find the code three characters
 * to its left, and `Intl.NumberFormat('de-DE', { style: 'currency' })` prints exactly that: the record
 * could not read back what its own formatter had written. One predicate now, and both callers use it.
 */
const isSpace = (ch: string | undefined): boolean => ch === ' ' || (ch !== undefined && SPACE_LIKE.has(ch));

const isSep = (ch: string | undefined): boolean =>
  ch === ',' || ch === '.' || isApostrophe(ch) || ch === ARABIC_POINT || ch === ARABIC_GROUP || isSpace(ch);

/**
 * THE THREE DIRECTION MARKS, U+200E, U+200F AND U+061C, which right-to-left text puts around a number.
 *
 * `Intl.NumberFormat('ar-EG')` writes a negative as `U+061C - U+200F ١٬٢٣٤٫٥٠ EGP` and `he-IL` writes
 * `-1,234.50 U+00A0 U+200F EGP`: a mark between the sign and the digits, and between the space and the code. The
 * walk below stopped at the mark, so the first lost its minus (a debit read as a credit) and the second its code.
 *
 * DROPPED FROM `scanMoney`'S OWN COPY ONLY. They are invisible, so the copy is the text a person saw; nothing is
 * sliced out of it, so no index into the caller's text moves; and `normalise` keeps them inside words, where they
 * set the order the words are shown in (`extractors.ts`).
 */
export const BIDI_MARKS: ReadonlySet<string> = new Set(['‎', '‏', '؜']);

const withoutMarks = (text: string): string => {
  if (!text.includes('‎') && !text.includes('‏') && !text.includes('؜')) return text;
  let out = '';
  for (const ch of text) if (!BIDI_MARKS.has(ch)) out += ch;
  return out;
};

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
 * Does a number begin at `p`, reached over at most one space?
 *
 * ASKED OF THE CHARACTERS AFTER A CURRENCY CODE, to tell a suffix from the next amount's prefix. In
 * `USD 5.00 EGP 245.00` the `EGP` is three characters from one number and four from another, and the only
 * thing in the string that says which one it belongs to is that a number follows it.
 */
function startsNumber(text: string, p: number): boolean {
  const q = isSpace(text[p]) ? p + 1 : p;
  /* WITH NO SPACE, THE LETTER BEFORE THE DIGIT IS THE CODE ITSELF, which the caller has just found in the
     table, so the identifier rule in `mayStart` is not the question. `EGP 5.00 USD245.00` is two amounts, and
     asking `mayStart` refused the second, left `USD` looking like the first one's suffix, and dropped both
     on the disagreement rule. */
  return isDigit(text[q]) && (q === p || mayStart(text, q));
}

/**
 * Is this token the first field of a date, a time or an account number?
 *
 * `mayStart` REFUSES EVERY FIELD BUT THE FIRST, because only the later ones have a digit behind the `/`, `:` or
 * `-` in front of them. The first field starts cleanly and carries its separator after it, so the `14` of
 * `14/08/2026` was a figure. In `Amount 120.00 EGP 14/08/2026` it took the `EGP` the real amount had just read
 * as its suffix, and the line gave EGP 14.00 beside EGP 120.00; with a declared currency, `on 29/08/26 EGP 5.00`
 * gave the day, as 29.00 in the fallback, ahead of the amount the line was about.
 *
 * A BARE RUN OF DIGITS ONLY. A date, a time and an account number print their fields with no point and no
 * grouping, so a figure that has either is never skipped: `12.00-15.00` is a range whose first price still reads,
 * which is the rule the trailing minus in `scanMoney` is written around. A range of bare figures such as
 * `EGP 100-200` reads nothing, which is a missing field a person sees rather than a day read as money.
 *
 * ASKED BY `scanMoney` ALONE. `scanInts` and `scanDecimals` read the same token list and still yield the `29` of
 * `29/08/26`, because a money read is the one where a figure takes a currency that belongs to its neighbour.
 */
function opensDate(text: string, token: NumberToken): boolean {
  const next = text[token.end];
  if ((next !== '/' && next !== ':' && next !== '-') || !isDigit(text[token.end + 1])) return false;
  for (const ch of token.text) if (!isDigit(ch)) return false;
  return true;
}

/**
 * Where the run of digits that `i` sits in ends, over the separators that do not end a number.
 *
 * NOT OVER A SPACE, although a space groups digits inside a token. A refused run is an identifier or a date,
 * and `INV1250 5.00` is a reference and then an amount, which one space between them does not make one thing.
 */
function runEnd(text: string, i: number): number {
  let j = i;
  while (isDigit(text[j]) || (isSep(text[j]) && !isSpace(text[j]) && isDigit(text[j + 1]))) j += 1;
  return j;
}

/**
 * Every number token in `text`, in text order.
 *
 * A separator is only part of the token when a digit follows it, so a full stop ending a sentence ends the
 * token, and two spaces end it even though one would not.
 *
 * A SPACE AFTER A POINT, A COMMA OR AN APOSTROPHE ENDS THE TOKEN. A space groups digits only in front of the
 * decimal separator (`1 250,00`), so once a token has crossed any other separator the space after it is the
 * gap between two figures. Read as one token, `USD 5.00 6.00` held a point, a space and a point, which no shape
 * in `readAmount` reads, so the USD 5.00 written plainly at its start was lost with the figure beside it. A space
 * between bare runs still continues the token, which is what keeps a card number printed in fours one figure no
 * shape reads and not four amounts in the fallback currency.
 *
 * `glued` IS HOW A CURRENCY CODE TOUCHING ITS FIGURE GETS THE FIGURE. Only `scanMoney` has the table that says
 * whether the three letters before a digit are a code, so it answers here; `scanInts` and `scanDecimals` pass
 * nothing and a letter before a digit still refuses it.
 *
 * AND A REFUSED NUMBER IS REFUSED WHOLE. This walked
 * on one character at a time after a refusal, so the first separator inside the figure started a fresh number
 * behind it: `EGP2500.00` read as `00` and `EGP1,284.50` as `284.50`, both in the fallback currency, and
 * `INV1250.75` gave the integer 75. The tail of a figure that could not start is never a figure anybody sent.
 */
export function numberTokens(text: string, glued?: (at: number) => boolean): NumberToken[] {
  const out: NumberToken[] = [];
  for (let i = 0; i < text.length; ) {
    if (!isDigit(text[i])) {
      i += 1;
      continue;
    }
    if (!mayStart(text, i) && !(isLetter(text[i - 1]) && glued?.(i) === true)) {
      i = runEnd(text, i);
      continue;
    }
    let j = i;
    /* Whether the token has crossed a point, a comma or an apostrophe yet. */
    let marked = false;
    while (j < text.length) {
      if (isDigit(text[j])) {
        j += 1;
        continue;
      }
      if (isSep(text[j]) && isDigit(text[j + 1]) && !(marked && isSpace(text[j]))) {
        if (!isSpace(text[j])) marked = true;
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

/**
 * A token split into its digit runs, in Latin digits, and the separators between them.
 *
 * `mixed` WHEN THE DIGITS COME FROM MORE THAN ONE SYSTEM, which every reader refuses (see `systemOf`).
 */
function split(token: string): { groups: string[]; seps: string[]; mixed: boolean } {
  const groups: string[] = [];
  const seps: string[] = [];
  let run = '';
  let system = -1;
  let mixed = false;
  for (const ch of token) {
    const s = systemOf(ch);
    if (s !== -1) {
      if (system === -1) system = s;
      else if (s !== system) mixed = true;
      run += latin(ch);
    } else {
      groups.push(run);
      seps.push(ch);
      run = '';
    }
  }
  groups.push(run);
  return { groups, seps, mixed };
}

/**
 * The currencies whose banks print lakhs with `,`: India, Pakistan, Nepal, Sri Lanka and Bangladesh.
 *
 * A LIST, BECAUSE A COMMA LIST IS NOT A RUPEE. Read for every currency, `EGP 10,20,300` was EGP 1,020,300.00 and
 * "scores 1,10,100" was an amount (review of 30 October, R13), where before both were no amount at all. Nobody prints
 * pounds or dollars in lakhs with a comma, and a figure that only reads by guessing the convention is not read.
 */
export const LAKH_CURRENCIES: ReadonlySet<string> = new Set(['INR', 'PKR', 'NPR', 'LKR', 'BDT']);

/**
 * LAKH GROUPING, which every Indian bank prints and Urdu prints with `٬`: `12,34,567` is twelve lakh thirty-four
 * thousand five hundred and sixty-seven. The last group is three digits, every group before it two, and the first
 * one or two, never starting with a nought (`00,12,345` is nobody's figure).
 *
 * ONLY WHEN THE WHOLE NUMBER IS GROUPED THAT WAY, and at least three groups long. Below a lakh the Indian and the
 * Western forms are the same string (`12,345`), so nothing changes there; above it, a figure is read as lakhs only
 * when every group fits, so `1,23,456,789` (two conventions in one figure) is still no candidate, and so is
 * `1,234,56`. ONLY WITH `٬`, WHICH NO WESTERN FIGURE CARRIES, OR WITH `,` IN A LAKH CURRENCY (`LAKH_CURRENCIES`): a
 * lakh-shaped figure grouped by `.` is printed by nobody, and one grouped by `,` in pounds is a list, not an amount.
 */
function lakh(groups: readonly string[], sep: string, currency: string | undefined): boolean {
  if (sep !== ARABIC_GROUP && !(sep === ',' && currency !== undefined && LAKH_CURRENCIES.has(currency))) return false;
  if (groups.length < 3) return false;
  if (groups[0]!.length < 1 || groups[0]!.length > 2 || groups[0]![0] === '0') return false;
  for (let i = 1; i < groups.length - 1; i++) if (groups[i]!.length !== 2) return false;
  return groups[groups.length - 1]!.length === 3;
}

/** Are the groups after the first exactly three digits long, and the first one to three? */
function grouped(groups: readonly string[], upto: number): boolean {
  if (groups[0]!.length < 1 || groups[0]!.length > 3) return false;
  for (let i = 1; i <= upto; i++) if (groups[i]!.length !== 3) return false;
  return true;
}

/** Is a whole part, split at `sep`, grouped by thousands or, with `٬` or a lakh currency's `,`, by lakhs? */
const wholeGrouped = (whole: readonly string[], sep: string, currency?: string): boolean =>
  grouped(whole, whole.length - 1) || lakh(whole, sep, currency);

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
 *
 * `currency` IS THE CODE THE AMOUNT IS IN, when there is one: it decides whether `,` may group by lakhs (`lakh`).
 */
export function readAmount(token: string, e: number, currency?: string): number | null {
  const { groups, seps, mixed } = split(token);
  if (mixed || groups.some((g) => g.length === 0)) return null;
  if (seps.some(isArabicSep)) return readArabic(groups, seps, e);

  let whole: string;
  let fraction: string;

  if (seps.length === 0) {
    whole = groups[0]!;
    fraction = '';
  } else if (seps.length === 1) {
    const last = groups[1]!;
    /* AN APOSTROPHE GROUPS AT EVERY EXPONENT, three, too: it is never a point (`isApostrophe`). */
    if (last.length === 3 && (e !== 3 || isApostrophe(seps[0]))) {
      if (!grouped(groups, 1)) return null;
      whole = groups[0]! + last;
      fraction = '';
    } else {
      if (last.length > e || isApostrophe(seps[0])) return null;
      whole = groups[0]!;
      fraction = last;
    }
  } else {
    /* Two or more: everything but the last separator is ONE grouping character, over groups of three or, with
       `,`, over lakhs. A last separator that differs is the decimal point; one that is the same has to leave
       the whole number grouped, or the grouping is not grouping. */
    const groupChar = seps[0]!;
    for (let i = 0; i < seps.length - 1; i++) if (seps[i] !== groupChar) return null;
    const lastSep = seps[seps.length - 1]!;
    const pointed = lastSep !== groupChar;
    if (pointed && isApostrophe(lastSep)) return null;
    const wholeGroups = pointed ? groups.slice(0, -1) : groups;
    if (!wholeGrouped(wholeGroups, groupChar, currency)) return null;
    whole = wholeGroups.join('');
    fraction = pointed ? groups[groups.length - 1]! : '';
    if (fraction.length > e) return null;
  }

  return safe(whole + fraction.padEnd(e, '0'));
}

/**
 * A token whose separators are the Arabic ones, read by what they say rather than by the thousands rule.
 *
 * `٬` GROUPS AND `٫` IS THE POINT, always, so `١٫٢٥٠` at exponent 2 is refused (three decimals) where `1.250` would
 * be one thousand two hundred and fifty, and `١٬٢٥٠` in dinars is 1,250 where `1,250` would be one and a quarter.
 * The point is the last separator and comes once; every other is `٬`; anything else among them is refused.
 */
function readArabic(groups: readonly string[], seps: readonly string[], e: number): number | null {
  const point = seps.indexOf(ARABIC_POINT);
  if (point !== -1 && point !== seps.length - 1) return null;
  const groupSeps = point === -1 ? seps : seps.slice(0, -1);
  if (groupSeps.some((s) => s !== ARABIC_GROUP)) return null;
  const whole = point === -1 ? groups : groups.slice(0, -1);
  if (whole.length > 1 && !wholeGrouped(whole, ARABIC_GROUP)) return null;
  const fraction = point === -1 ? '' : groups[groups.length - 1]!;
  if (fraction.length > e) return null;
  return safe(whole.join('') + fraction.padEnd(e, '0'));
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

/**
 * May the three capitals glued to the digit at `at` be read as that figure's currency?
 *
 * THE TABLE `@braindog/record` WIRES IS EVERY CODE `Intl` KNOWS, AND MANY OF THEM ARE ORDINARY CAPITALS.
 * Measured, asking the table alone did this with EGP declared:
 * `Flight MAD2031` read as MAD 2,031.00, `voucher TOP20` as TOP 20.00, `Promo ALL2026` as ALL 2,026,
 * `at CAD1 PETROL` as CAD 1.00, `Seat BAM12.` as BAM 12.00 and `Ref PEN15` as PEN 15.00. Each is a flight,
 * a voucher, a seat or a reference, and each became an amount in a currency nobody spent.
 *
 * TWO THINGS A BANK'S GLUED FIGURE HAS AND AN IDENTIFIER DOES NOT. The figure carries its decimal point or its
 * grouping (`EGP2500.00`, `EGP1,284.50`, `KWD1.250`), where an identifier is a bare run of digits; a glued
 * code with a bare run stays refused, and refused whole. And nothing alphanumeric touches the code on its
 * left: `codeBefore` already refuses a letter there, and a digit there means the three capitals sit inside a
 * reference like `9CAD17F2B0`, which read CAD 17.00 from its middle. A space, a sign, a bracket, a colon or
 * the start of the string may stand there. A letter touching the figure's far end makes it a reference too:
 * `Ref PEN15.00X` has a point and still read PEN 15.00 until that was checked. Every glued line
 * `money-glued.test.ts` and the record's `money-ipn.test.ts` hold still reads.
 */
function gluedFigure(text: string, at: number, table: CurrencyTable): boolean {
  if (codeBefore(text, at, table) === null || isDigit(text[at - 4])) return false;
  let i = at;
  while (isDigit(text[i])) i += 1;
  return isSep(text[i]) && !isSpace(text[i]) && isDigit(text[i + 1]) && !isLetter(text[runEnd(text, at)]);
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

/**
 * `$`, WHICH THE TABLE CANNOT PLACE AND `declared` MUST NOT FILL (ruling 438, docs/04-PACKS.md "Rulings").
 *
 * The table `@braindog/record` wires carries no symbols, and one that does gives `$` to USD and CAD alike, so
 * `$` was skipped as if it were not there and `declared` filled the gap: `paid $12` on an EGP record read as
 * EGP 12, a wrong currency with a right-looking figure. A bare `$` is the record's home currency only when
 * that currency is itself written with `$`; anywhere else the amount is no candidate and a person is asked.
 * A letter prefix that names the country (`US$`, `C$`, `A$`) is that dollar, when the table holds it.
 */
const DOLLAR_PREFIX: Record<string, string> = {
  US: 'USD', C: 'CAD', CA: 'CAD', A: 'AUD', AU: 'AUD', NZ: 'NZD', HK: 'HKD', S: 'SGD', SG: 'SGD', NT: 'TWD', MX: 'MXN',
};

/* Which currencies are written with `$` is the runtime's to say (its narrow symbol), never a list typed here. */
const dollarHomes = new Map<string, boolean>();

/** May a bare `$` be read as `declared`? Only when the home currency is one written with `$`. */
function dollarIsHome(declared: string | undefined): boolean {
  if (declared === undefined) return false;
  let yes = dollarHomes.get(declared);
  if (yes === undefined) {
    try {
      const parts = new Intl.NumberFormat('en', { style: 'currency', currency: declared, currencyDisplay: 'narrowSymbol' }).formatToParts(0);
      yes = parts.find((p) => p.type === 'currency')?.value === '$';
    } catch {
      yes = false;
    }
    dollarHomes.set(declared, yes);
  }
  return yes;
}

/** A `$` ending at `pos`: the dollar a capital prefix names, or `null` for a bare one. */
function dollarBefore(text: string, pos: number, table: CurrencyTable): { code: string | null; at: number } | null {
  if (text[pos - 1] !== '$') return null;
  let i = pos - 1;
  while (i > 0 && isUpper(text[i - 1]) && pos - 1 - i < 2) i -= 1;
  const code = DOLLAR_PREFIX[text.slice(i, pos - 1)];
  if (i < pos - 1 && !isLetter(text[i - 1]) && code !== undefined && Object.hasOwn(table, code)) return { code, at: i };
  return { code: null, at: pos - 1 };
}

/** A `$` starting at `pos` that ends this figure rather than opening the next one (`12$`, `12 $`). */
function dollarAfter(text: string, pos: number): { at: number } | null {
  if (text[pos] !== '$' || startsNumber(text, pos + 1)) return null;
  return { at: pos + 1 };
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
export function scanMoney(given: string, table: CurrencyTable, declared?: string): Money[] {
  /* The direction marks out, so a sign and a code are found past them (`BIDI_MARKS`). Only amounts leave here. */
  const text = withoutMarks(given);
  const symbols = unambiguousSymbols(table);
  const out: Money[] = [];
  /* Where the previous amount found its trailing currency, so this one cannot claim the same three
     characters as its leading one. See the two-amount note below. */
  let claimed = -1;

  /* A LETTER TOUCHING THE FIRST DIGIT IS ALLOWED ONLY WHEN IT ENDS A CODE THE TABLE HOLDS, so `EGP2500.00` is
     EGP 2,500.00 and `INV1250` is still an identifier. `codeBefore` is the same test the backward walk below
     makes, so the code that let the number start is the code it is read in. `gluedFigure` narrows it to the
     glued codes that cannot be a word or a reference. */
  for (const token of numberTokens(text, (at) => gluedFigure(text, at, table))) {
    /* A date's first field is skipped before it can take a currency, and before it can claim one either, so the
       code the amount beside it read as a suffix stays that amount's alone. */
    if (opensDate(text, token)) continue;

    /* Backwards: spaces, a currency, a sign and an opening parenthesis, each at most once and in whichever
       order they come — `-EGP 5` and `EGP -5` are the same amount and both are written. */
    let before: string | null = null;
    let beforeAt = -1;
    let sign = 0;
    let open = false;
    /* A bare `$` on either side, which `declared` may fill only when home is written with `$` (ruling 438). */
    let bare = false;
    let j = token.start;
    for (let step = 0; step < 4; step++) {
      while (isSpace(text[j - 1])) j -= 1;
      if (before === null) {
        const hit = codeBefore(text, j, table) ?? symbolBefore(text, j, symbols);
        if (hit !== null) {
          before = hit.code;
          beforeAt = hit.at;
          j = hit.at;
          continue;
        }
        const dollar = bare ? null : dollarBefore(text, j, table);
        if (dollar !== null) {
          if (dollar.code !== null) {
            before = dollar.code;
            beforeAt = dollar.at;
          } else bare = true;
          j = dollar.at;
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

    /* Forwards: a trailing sign, at most one space, then a currency, then a closing parenthesis. One
       space, because a currency two words away belongs to the next sentence. */
    let k = token.end;

    /**
     * THE MINUS AT THE FAR END, which SAP, a COBOL trailing-sign picture and several Gulf and Egyptian
     * statements all print for a credit. It was read straight past, so `EGP 1,250.00-` came out as
     * +125000: the right currency and the right magnitude with the sign inverted, which is a balance
     * wrong by twice the amount and a row nothing downstream can question.
     *
     * GLUED TO THE DIGITS AND FOLLOWED BY NEITHER A DIGIT NOR A LETTER. A digit after it makes it a
     * range (`12.00-15.00` is two prices), and a space before it makes it a dash in a sentence; neither
     * is a sign, and the tokenizer already refuses to start a number after a digit-hyphen-digit for the
     * same reason. A LETTER AFTER IT MAKES IT A REFERENCE, which cost a sign before the letter was
     * excluded: with a declared currency, which is how `@braindog/record` wires this function,
     * `Payment ref 4417-B` read as -441700 and `2026-Q3 fee` as -202600, a charge filed as a refund.
     * Nothing prints a sign against a letter, because the trailing minus ends a field: what follows it
     * is the end of the string, a space or a bracket, and all three still read.
     */
    const tail = text[k];
    const next = text[k + 1];
    const trailing = (tail === '-' || tail === '−') && !isDigit(next) && !isLetter(next);
    if (trailing) k += 1;

    if (isSpace(text[k])) k += 1;
    let afterAt = k;
    let afterHit = codeAfter(text, k, table) ?? symbolAfter(text, k, symbols);
    /**
     * TWO AMOUNTS ON ONE LINE, which is what a foreign-exchange row is: `USD 5.00 EGP 245.00`, charged
     * and billed. The `EGP` sat after one number and before another, so the first number had a currency
     * on each side, they disagreed, and the disagreement rule threw away a perfectly clear USD amount.
     * Measured on the live code, that line yielded one pair instead of two.
     *
     * A CODE THAT PREFIXES THE NEXT NUMBER IS NOT ALSO THIS NUMBER'S SUFFIX, and only when this number
     * already has a prefix of its own: `5.00 USD 245.00 EGP` is the mirror form, where the same three
     * characters are the first number's suffix because nothing precedes it, and `claimed` then stops the
     * second number from reading them as its prefix and contradicting its own `EGP`.
     *
     * THE DISAGREEMENT RULE SURVIVES INTACT. `USD 5.00 EGP` has no following number to explain either
     * code away, so it is still no candidate at all.
     */
    /**
     * THE CLAIM IS RELEASED FIRST, against the code that is there and not against the one that survives
     * the suppression above. Measured with the two tests in the other order: `5.00 USD 245.00 EGP 10 JPY`
     * gave `[500 USD, 24500 USD]`. The middle number's own `EGP` was struck out as the `10`'s prefix
     * before anything had released the `USD` it had already lent to the first amount, so it was left
     * holding a code that belonged to its neighbour, and the `JPY` amount vanished behind the same shift.
     * A wrong currency, where the code before the two-amount repair had at least refused.
     */
    if (before !== null && afterHit !== null && beforeAt === claimed) before = null;
    /* A bare `$` in front is this figure's own mark, so a code that opens the next number is the next
       number's: `$5.00 EGP 245.00` is a dollar amount and an EGP one, never EGP 5. */
    if (afterHit !== null && (before !== null || bare) && startsNumber(text, afterHit.at)) afterHit = null;
    if (afterHit === null && before === null && !bare) {
      const dollar = dollarAfter(text, k);
      if (dollar !== null) {
        bare = true;
        k = dollar.at;
        /* `12$ EGP`: the code after a trailing `$` still says which currency it was. */
        const at = isSpace(text[k]) ? k + 1 : k;
        const code = codeAfter(text, at, table);
        if (code !== null && !startsNumber(text, code.at)) {
          afterHit = code;
          afterAt = at;
        }
      }
    }
    const after = afterHit?.code ?? null;
    if (afterHit !== null) k = afterHit.at;
    const closed = text[k] === ')';

    if (before !== null && after !== null && before !== after) continue;
    if (before === null && afterHit !== null) claimed = afterAt;

    /* A bare `$` beside a written code is that code (`$12 USD`, `$12 EGP`): the code is the one word that
       names a currency, and an amount with one is never made unsure by a `$` beside it. Beside nothing,
       the `$` is `declared` only when home is written with `$`. */
    if (bare && before === null && after === null && !dollarIsHome(declared)) continue;
    const currency = before ?? after ?? declared ?? null;
    if (currency === null || !Object.hasOwn(table, currency)) continue;

    const amount = readAmount(token.text, table[currency]!.exponent, currency);
    if (amount === null) continue;

    /* NOT WHEN IT IS ZERO. `-0` is not an amount: it survives `JSON.stringify` as `0` and comes back from
       `JSON.parse` as a value `Object.is` calls different, so the row in memory and the row read out of
       the kernel stop comparing equal and a dedupe sees two rows where the bank sent one. An explicit
       leading sign also wins over a trailing minus, because somebody wrote it. */
    const negative = sign === -1 || (sign === 0 && trailing) || (open && closed);
    out.push({ amount: negative && amount !== 0 ? -amount : amount, currency });
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
    const { groups, seps, mixed } = split(token.text);
    if (mixed || groups.some((g) => g.length === 0)) continue;
    /* THE ARABIC MARKS SAY WHICH IS THE POINT, whatever `sep` says, and never beside a `.` or a `,`. */
    const arabic = seps.some(isArabicSep);
    if (arabic && !seps.every(isArabicSep)) continue;
    const point = arabic ? ARABIC_POINT : sep;
    const points = seps.filter((s) => s === point).length;
    if (points > 1) continue;

    const at = seps.indexOf(point);
    const whole = at === -1 ? groups : groups.slice(0, at + 1);
    const fraction = at === -1 ? '' : groups.slice(at + 1).join('');
    if (at !== -1 && seps.length - 1 > at) continue; // a separator after the point is not grouping
    const groupSeps = at === -1 ? seps : seps.slice(0, at);
    if (groupSeps.some((s) => s !== groupSeps[0])) continue;
    /* ONLY WHEN THERE IS GROUPING. `3020.15` has a four-digit whole part and is a perfectly ordinary
       decimal; the one-to-three rule is about what a grouping separator implies, not about size. */
    if (groupSeps.length > 0 && !wholeGrouped(whole, groupSeps[0]!)) continue;

    const digits = whole.join('');
    let lead = 0;
    while (lead < digits.length - 1 && digits[lead] === '0') lead += 1;
    if (digits.length - lead + fraction.length > 15) continue;
    const value = Number(fraction === '' ? digits : `${digits}.${fraction}`);
    if (Number.isFinite(value)) out.push(value);
  }
  return out;
}
