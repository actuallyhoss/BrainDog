/**
 * ONE WAY TO WRITE AN AMOUNT ON A SCREEN. Three functions, and nothing else writes an amount a person reads.
 *
 * `money()` in `format.ts` writes the stored form, code first (`EGP 1,299.00`), and that stays what a row, a mail
 * and an agent's answer hold. A screen wrote it twice: the app rewrote each cell, then the renderer rewrote it
 * again from the drawn text, with two sign tables that disagreed. So one amount read `E£1,086,213` on a tile,
 * `EGP −73,615.27` in a list, and `$0 USI` where a cell cut its code. This module reads the stored text once
 * (`readAmount`) and writes it once (`writeAmount`), knowing the record's home currency and where the figure stands.
 * Text that was drawn is never read back into a number.
 *
 * THE RULE IS ONE TABLE, the two `const`s under "The rule". They are calls made on the person's behalf and theirs
 * to reverse: another answer changes that table and nothing else in this file.
 *
 *   the home currency, with a sign      sign, amount                 £1,086,213.41
 *   any other currency with a sign      sign, amount, code after     $2,947.95 USD
 *   a currency with no sign             code, amount                 EGP 1,200.00
 *   a negative amount                   a true minus in front        −EGP 497.26
 *   `exact` (tables, ledgers, forms)    every minor unit             EGP 58,185.00
 *   `read` (tiles, sentences, bars)     a fraction of zeros dropped  EGP 58,185
 *   `axis` (a chart's axis only)        compact                      EGP 31k
 *
 * A CURRENCY ENGLISH WRITES BY ITS CODE HAS NO SIGN, even where the runtime knows a narrow one: the Egyptian pound
 * is `EGP`, as the franc is `CHF`, never `E£` (his word, 9 October). So no figure reads `E£1,299.00 EGP`, with or
 * without a home currency.
 *
 * NEVER CUT, NEVER ROUNDED off an axis. The amount is a run of digits from the moment it is read to the moment it
 * is written, so every digit stored is a digit drawn, and the code is joined to its figure by a space that does
 * not break: an amount is one word, in a sentence too.
 */

import { exponentOf } from './format.ts';

/** An amount of money: a whole number of minor units, and the currency they are in. Never one without the other. */
export type Amount = { minor: bigint; currency: string };

/** Where a figure stands. `exact`: a table, a ledger, a form. `read`: a tile, a sentence, a bar. `axis`: a chart's axis. */
export type AmountSetting = 'exact' | 'read' | 'axis';

/**
 * An amount as it is drawn, in parts, so a screen can set the fraction and the code quieter than the figure.
 * `text` is the parts joined, for a sentence or a label. `codePlace` says where the code stands, `null` when the
 * figure carries none because its sign says the currency.
 */
export type WrittenAmount = {
  minus: string;
  sign: string;
  whole: string;
  fraction: string;
  code: string;
  codePlace: 'before' | 'after' | null;
  text: string;
};

/* ---- The rule ------------------------------------------------------------------------------------------------ */

/** Whether the home currency drops its code when it has a sign. `false` writes the code first everywhere. */
const HOME_BY_SIGN = true;

/** A sign is the runtime's narrow form when it is a currency sign with at most two capitals before it: `$`, `£`, `R$`. Not `kr`, not `CHF`. */
const A_SIGN = /^[A-Z]{0,2}\p{Sc}$/u;

/* ---- The glyphs ---------------------------------------------------------------------------------------------- */

const MINUS = '−';
/** The space between a code and its figure. It does not break, so a line never ends on "EGP" or starts on "USD". */
export const AMOUNT_SPACE = ' ';
const STEPS = ['', 'k', 'm', 'bn', 'tn'] as const;

const signs = new Map<string, string>();

/** How English writes a currency in one of its two displays; it throws on a code the runtime refuses. */
const written = (currency: string, currencyDisplay: 'symbol' | 'narrowSymbol'): string | undefined =>
  new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay }).formatToParts(0).find((p) => p.type === 'currency')?.value;

/** The sign a currency is written with, or `''` when it has none of its own and is written by its code. */
function signOf(currency: string): string {
  const known = signs.get(currency);
  if (known !== undefined) return known;
  let sign = '';
  try {
    /* Where English's own symbol for it is the code (`EGP`, `SGD`, `CHF`), the code is how it is written: the
       narrow form alone gave `E£`, which English does not write. */
    const narrow = written(currency, 'symbol') === currency ? undefined : written(currency, 'narrowSymbol');
    /* `¤` is the runtime's mark for no currency at all (`XXX`), not a sign anyone writes. */
    if (narrow && narrow !== '¤' && A_SIGN.test(narrow)) sign = narrow;
  } catch {
    /* Not a code the runtime will format: it is written by its code. */
  }
  signs.set(currency, sign);
  return sign;
}

/** Digits in groups of three, counted off in one pass. */
function grouped(digits: string): string {
  const head = digits.length % 3 || 3;
  const groups = [digits.slice(0, head)];
  for (let i = head; i < digits.length; i += 3) groups.push(digits.slice(i, i + 3));
  return groups.join(',');
}

/* ---- Reading ------------------------------------------------------------------------------------------------- */

const STORED = /^([A-Z]{3}) (−?)(\d{1,3}(?:,\d{3})*)(?:\.(\d+))?$/u;

/**
 * The amount in a figure `money()` wrote, or `null`.
 *
 * ONLY THE STORED FORM: three capitals, one space, a true minus or none, digits in groups of three, and exactly
 * the minor units the currency has. `EGP 1,299.00` and `EGP −73,615.27` are read. `E£1,299`, `$31k`, `EGP 1,299`
 * and `1,299.00` are not, because each is a drawing or a bare number, and a drawing read back is how `E£31k` once
 * became thirty-one pounds.
 */
export function readAmount(text: string): Amount | null {
  const m = STORED.exec(text);
  if (!m) return null;
  const currency = m[1]!;
  const fraction = m[4] ?? '';
  if (fraction.length !== exponentOf(currency)) return null;
  const digits = `${m[3]!.replace(/,/gu, '')}${fraction}`;
  const minor = BigInt(digits);
  return { minor: m[2] ? -minor : minor, currency };
}

/* ---- Writing ------------------------------------------------------------------------------------------------- */

/**
 * AN AXIS LABEL, COMPACT: 31,240.55 is `31k`, 1,600 is `1.6k`, 850.40 is `850`. An axis says where a scale
 * reaches, not what an amount is, so this is the one place a figure is rounded. One decimal below ten of a step,
 * whole steps above, and the step is chosen after the rounding, or 999,700 would read `1,000k`.
 */
function compact(units: number): string {
  let n = units;
  for (let i = 0; ; i += 1) {
    const said = n >= 10 ? Math.round(n) : Math.round(n * 10) / 10;
    if (said < 1_000 || i === STEPS.length - 1) {
      return `${said >= 1_000 ? grouped(BigInt(said).toString()) : String(said)}${STEPS[i]}`;
    }
    n /= 1_000;
  }
}

/**
 * An amount as a screen draws it, in parts and as text. `home` is the record's home currency, or `null` when the
 * record has none, and then every currency is written as another's.
 *
 * `minor` may be a whole number as well as a `bigint`, since most callers hold one. A number that is not whole is
 * not money, and comes back `null` rather than rounded to a penny nobody has.
 *
 * THE MINUS IS IN FRONT OF EVERYTHING, a code too: `−£497.26`, `−$12.00 USD`, `−EGP 1,200.00`. One place for the
 * sign down a column of mixed currencies. Nought has none.
 */
export function writeAmount(
  amount: { minor: bigint | number; currency: string },
  home: string | null,
  setting: AmountSetting,
): WrittenAmount | null {
  if (typeof amount.minor === 'number' && !Number.isInteger(amount.minor)) return null;
  const minor = BigInt(amount.minor);
  const currency = amount.currency.toUpperCase();
  const exp = exponentOf(currency);
  const digits = (minor < 0n ? -minor : minor).toString().padStart(exp + 1, '0');

  let whole: string;
  let fraction = '';
  let nought = minor === 0n;
  if (setting === 'axis') {
    whole = compact(Number(minor < 0n ? -minor : minor) / 10 ** exp);
    nought = whole === '0';
  } else {
    whole = grouped(digits.slice(0, digits.length - exp));
    const tail = digits.slice(digits.length - exp);
    if (exp > 0 && !(setting === 'read' && /^0+$/u.test(tail))) fraction = `.${tail}`;
  }

  const sign = signOf(currency);
  const isHome = home !== null && home.toUpperCase() === currency;
  const codePlace: WrittenAmount['codePlace'] = sign === '' ? 'before' : isHome && HOME_BY_SIGN ? null : 'after';
  const code = codePlace === null ? '' : currency;
  const minus = minor < 0n && !nought ? MINUS : '';
  const figure = `${whole}${fraction}`;
  const text =
    codePlace === 'before'
      ? `${minus}${code}${AMOUNT_SPACE}${figure}`
      : `${minus}${sign}${figure}${codePlace === 'after' ? `${AMOUNT_SPACE}${code}` : ''}`;
  return { minus, sign, whole, fraction, code, codePlace, text };
}

/* ---- In a sentence ------------------------------------------------------------------------------------------- */

/* A stored amount inside other words: the same shape as `STORED`, not glued to a letter or a digit in front, and
   not the head of a longer number behind. */
const IN_WORDS = /(?<![A-Za-z0-9])([A-Z]{3}) −?\d{1,3}(?:,\d{3})*(?:\.\d+)?(?![\d,]*\d)/gu;

/* The currencies the runtime has a name for. Three capitals it has none for are a word, whatever follows them. */
let names: Intl.DisplayNames | undefined;
const isCurrency = (code: string): boolean =>
  (names ??= new Intl.DisplayNames('en', { type: 'currency', fallback: 'none' })).of(code) !== undefined;

/**
 * A sentence with every stored amount in it written for a screen: "Rent of GBP 12,000.00 is due" is
 * "Rent of £12,000 is due" where the stored code and the home are GBP. Stored text shown on a screen, a question's
 * button or a note, goes through here. What is not a stored amount is left exactly as it was, and only a real
 * currency code starts one, so three capitals and a number ("THE 100.00", "USB 3.00") stay words.
 */
export function amountsIn(text: string, home: string | null, setting: AmountSetting): string {
  return text.replace(IN_WORDS, (found: string, code: string) => {
    const amount = isCurrency(code) ? readAmount(found) : null;
    return (amount && writeAmount(amount, home, setting)?.text) ?? found;
  });
}
