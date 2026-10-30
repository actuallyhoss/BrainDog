/**
 * `43 §9.2`'s property: 2,000 random amounts, rendered the five ways a statement writes them, read
 * back to the pair they were rendered from.
 *
 * NO `fast-check`, AND THAT IS A CHOICE RATHER THAN A SHORTAGE. `§13` asks for 2,000 cases and for
 * no seed file under `test/seeds/`, which is to say: no recorded counterexample, every run the same
 * 2,000 cases, and a failure that reproduces from the test alone. A counter with a fixed multiplier
 * gives exactly that in twenty lines and adds nothing to install. What a generator library buys is
 * shrinking, and a failure here is already minimal: one amount, one currency, one style, all three
 * printed.
 *
 * THE RENDERER IS NOT WRITTEN TO THE PARSER. Every form below is one a bank statement actually
 * prints. A form this parser cannot read is a finding about the parser and gets written down, not
 * a form to quietly drop from the list.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseMoney, type CurrencyTable } from '../src/money.ts';

/* Exponents 0, 2 and 3, because the minor-unit arithmetic is where this can go wrong and a table
   of nothing but 2 would never exercise it. */
const TABLE: CurrencyTable = {
  USD: { exponent: 2, symbol: '$' },
  EGP: { exponent: 2 },
  EUR: { exponent: 2, symbol: '€' },
  JPY: { exponent: 0, symbol: '¥' },
  KWD: { exponent: 3 },
};
const CODES = Object.keys(TABLE);
const STYLES = ['en', 'eu', 'space', 'bare', 'parens'] as const;
type Style = (typeof STYLES)[number];

/** mulberry32: one multiply-shift, the same sequence on every machine and every run. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const group = (digits: string, sep: string): string => {
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += sep;
    out += digits[i];
  }
  return out;
};

function render(amount: number, currency: string, style: Style, trim = false): string {
  const e = TABLE[currency]!.exponent;
  const abs = Math.abs(amount);
  const unit = 10 ** e;
  const whole = String(Math.floor(abs / unit));
  const frac = e === 0 ? '' : String(abs % unit).padStart(e, '0');

  const [thousands, point] =
    style === 'eu' ? ['.', ','] : style === 'space' ? [' ', ','] : style === 'bare' ? ['', '.'] : [',', '.'];
  /**
   * A FRACTION WITH ITS TRAILING ZEROES DROPPED, SOMETIMES, because a statement prints `5.5` and `5` as
   * often as it prints `5.50`. Without it every rendered fraction is exactly `exponent` digits long and the
   * pad that turns `5` into `500` is never exercised: swapping `padEnd` for `padStart` in `readAmount`
   * left all 2,000 cases green, which is how this line came to be written.
   *
   * ONLY AT EXPONENT 2, AND THE REASON IS A REAL AMBIGUITY RATHER THAN AN AWKWARD TEST. At exponent 3,
   * `KWD 1,250` can be read as 1,250 dinars grouped or as 1.250 dinars to three places, and there is
   * nothing in the string to settle it; `readAmount` chooses the decimals, which is the reading that
   * cannot silently inflate an amount by a thousand. A renderer that emitted that form would be asserting
   * one side of a coin toss, so it does not emit it.
   */
  const trimmed = e === 2 && trim ? frac.replace(/0+$/u, '') : frac;
  const number = group(whole, thousands) + (trimmed === '' ? '' : point + trimmed);

  const negative = amount < 0;
  if (style === 'parens') return negative ? `${currency} (${number})` : `${currency} ${number}`;
  return `${currency} ${negative ? '-' : ''}${number}`;
}

test('2,000 AMOUNTS RENDERED FIVE WAYS READ BACK TO WHAT THEY WERE RENDERED FROM', () => {
  const next = rng(0x43_09_02);
  let checked = 0;
  for (let i = 0; i < 2000; i++) {
    const currency = CODES[Math.floor(next() * CODES.length)]!;
    const style = STYLES[Math.floor(next() * STYLES.length)]!;
    /* ±10^13 minor units, and the small amounts deliberately over-sampled: a fraction that is all
       zeroes, a whole part under one thousand and an amount of zero are where grouping and padding
       disagree, and a uniform draw over thirteen digits would show one of each in two thousand. */
    const digits = 1 + Math.floor(next() * 14);
    const magnitude = Math.floor(next() * 10 ** digits);
    const amount = magnitude === 0 ? 0 : next() < 0.5 ? -magnitude : magnitude; /* NEVER -0: it is not an amount, and deepEqual is right to tell them apart. */

    const text = render(amount, currency, style, next() < 0.5);
    assert.deepEqual(parseMoney(text, TABLE), { amount, currency }, `${style}: ${JSON.stringify(text)}`);
    checked += 1;
  }
  assert.equal(checked, 2000);
});

/**
 * THE GROUP SEPARATOR A FRENCH STATEMENT ACTUALLY PRINTS, which is not the space on the keyboard.
 *
 * Found by the property above on its first run, with `Intl.NumberFormat('fr-FR')`'s own output as
 * the renderer. `money.ts`'s `isSep` takes `, . ' ` and the ASCII space and nothing else, while
 * `extractors.ts`'s `SPACE_LIKE` folds eighteen space characters including all of these. Two lists
 * about one question, and the pipeline normalises before it scans so nothing inside the package
 * ever sees the difference — but `parseMoney` is one of `43 §2`'s nine exported functions and its
 * contract says nothing about normalising first.
 *
 * AND IT IS WRONG RATHER THAN EMPTY, which is what makes it worth the fix. The scanner stops at the
 * separator, reads `2` and files 2,642.97 euro as **2.00 euro**: a number in the ledger, in the
 * right currency, off by three orders of magnitude, with no outcome that puts it in front of
 * anybody. A refusal would have been safe.
 */
test('A NO-BREAK SPACE IS A GROUP SEPARATOR, and reading past it is how 2,642.97 became 2.00', () => {
  const T: CurrencyTable = { EUR: { exponent: 2, symbol: '€' } };
  const want = { amount: 264297, currency: 'EUR' };
  for (const [name, sep] of [
    ['ASCII space', ' '],
    ['no-break space, the &nbsp; of every HTML email', ' '],
    ['narrow no-break space, what Intl fr-FR prints', ' '],
    ['thin space', ' '],
  ] as const)
    assert.deepEqual(parseMoney(`EUR 2${sep}642,97`, T), want, name);

  /* The record's own formatter, round-tripped. If this one fails the record cannot read back what
     it printed, which is not a case anybody has to imagine a provider into. */
  assert.deepEqual(parseMoney(`EUR ${new Intl.NumberFormat('fr-FR').format(2642.97)}`, T), want);
});

/* ── the marks around a number ──────────────────────────────────────────────────────────────────── */

/**
 * The table the hand-rendered forms below read against. `TABLE`'s five and the pound, because a second
 * symbol beside `€` is what proves a symbol is matched by its own character and not by being the only one.
 * Every symbol here is carried by exactly one row; `money.test.ts` holds the case where `$` is two.
 */
const MARKED: CurrencyTable = { ...TABLE, GBP: { exponent: 2, symbol: '£' } };
const MARKED_CODES = Object.keys(MARKED);

const NBSP = ' ';

/** Five ways a statement groups and points a number. The no-break space is `TABLE`'s `space` as HTML prints it. */
const SEPARATORS = {
  en: [',', '.'],
  eu: ['.', ','],
  nbsp: [NBSP, ','],
  apostrophe: ["'", '.'],
  bare: ['', '.'],
} as const;
type Separators = keyof typeof SEPARATORS;
const SEPARATOR_NAMES = Object.keys(SEPARATORS) as Separators[];

/** The magnitude alone, grouped and pointed, with `render`'s rule for dropping trailing zeroes. */
function digitsOf(amount: number, exponent: number, style: Separators, trim: boolean): string {
  const unit = 10 ** exponent;
  const abs = Math.abs(amount);
  const [thousands, point] = SEPARATORS[style];
  const whole = group(String(Math.floor(abs / unit)), thousands);
  const frac = exponent === 0 ? '' : String(abs % unit).padStart(exponent, '0');
  const kept = exponent === 2 && trim ? frac.replace(/0+$/u, '') : frac;
  return kept === '' ? whole : whole + point + kept;
}

const SIGNS = ['none', 'minus', 'unicode', 'plus', 'trailing', 'parens'] as const;
type Sign = (typeof SIGNS)[number];
const GAPS = ['', ' ', NBSP] as const;

type Form = {
  currency: string;
  /** The code, or the table's symbol for it. */
  mark: string;
  side: 'before' | 'after';
  gap: (typeof GAPS)[number];
  sign: Sign;
  /** Before the mark and its gap (`-EUR 5`), or touching the digits (`EUR -5`). Only a mark before has the choice. */
  outside: boolean;
  digits: string;
};

/** One amount, written the way the form says. Every shape here is one a statement or a till slip prints. */
function write(f: Form): string {
  const { mark, gap, digits } = f;
  const lead = f.sign === 'minus' ? '-' : f.sign === 'unicode' ? '−' : f.sign === 'plus' ? '+' : '';
  if (f.side === 'after') {
    /* A TRAILING MINUS AGAINST A CODE IS A REFERENCE (`4417-B`), so the scanner rightly does not read it as a
       sign; a statement that prints one always leaves the space. A symbol may touch it. */
    const after = f.sign === 'trailing' && /^[A-Z]/u.test(mark) && gap === '' ? ' ' : gap;
    if (f.sign === 'parens') return `(${digits}${after}${mark})`;
    if (f.sign === 'trailing') return `${digits}-${after}${mark}`;
    return `${lead}${digits}${after}${mark}`;
  }
  if (f.sign === 'parens') return f.outside ? `(${mark}${gap}${digits})` : `${mark}${gap}(${digits})`;
  if (f.sign === 'trailing') return `${mark}${gap}${digits}-`;
  return f.outside ? `${lead}${mark}${gap}${digits}` : `${mark}${gap}${lead}${digits}`;
}

/**
 * Whether the form is one the reader refuses, by `money-glued.test.ts`'s rule and no other.
 *
 * A CODE TOUCHING ITS DIGITS IS READ ONLY WHEN THE FIGURE CARRIES A POINT OR A GROUPING MARK, because a code
 * glued to a bare run is how a reference is written (`TOP20`, `PEN15`), and a figure grouped with a space is a
 * run that ends at the space. Refusing is the safe answer to both: nothing is written and a person is asked.
 * A symbol is never an identifier, so a symbol touching its digits always reads.
 */
function refused(f: Form): boolean {
  const touching = f.side === 'before' && /^[A-Z]{3}$/u.test(f.mark) && f.gap === '' &&
    (f.sign === 'none' || f.sign === 'trailing' || f.outside);
  if (!touching) return false;
  const first = [...f.digits].find((ch) => ch < '0' || ch > '9');
  return first === undefined || !",.'".includes(first);
}

test('2,000 AMOUNTS WITH THEIR CODE OR SYMBOL ON EITHER SIDE AND EVERY SIGN A STATEMENT PRINTS READ BACK EXACTLY', () => {
  const next = rng(0x43_09_03);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)]!;
  let read = 0;
  let refusedCount = 0;

  for (let i = 0; i < 2000; i++) {
    const currency = pick(MARKED_CODES);
    const row = MARKED[currency]!;
    const symbol = row.symbol !== undefined && next() < 0.5;
    const digits = 1 + Math.floor(next() * 14);
    const magnitude = Math.floor(next() * 10 ** digits);
    const negative = magnitude !== 0 && next() < 0.5;
    const amount = negative ? -magnitude : magnitude;

    /* THE SIGN FOLLOWS THE AMOUNT: a negative is written one of the four ways a minus is printed, a positive
       plainly or with a `+`. Zero is never signed, because `-0` is not an amount. */
    const sign: Sign = negative
      ? pick(['minus', 'unicode', 'trailing', 'parens'] as const)
      : magnitude === 0 ? 'none' : pick(['none', 'plus'] as const);

    const form: Form = {
      currency,
      mark: symbol ? row.symbol! : currency,
      side: next() < 0.5 ? 'before' : 'after',
      gap: pick(GAPS),
      sign,
      outside: next() < 0.5,
      digits: digitsOf(amount, row.exponent, pick(SEPARATOR_NAMES), next() < 0.5),
    };
    const text = write(form);
    const label = `${JSON.stringify(text)} (${form.side}, ${form.sign}, gap ${JSON.stringify(form.gap)})`;

    /* REFUSED IS `undefined` AND NEVER A DIFFERENT NUMBER. The one thing this reader may not do with a form it
       cannot place is hand back the tail of it, in some currency, as though that were the amount. */
    if (refused(form)) {
      assert.equal(parseMoney(text, MARKED), undefined, label);
      refusedCount += 1;
    } else {
      assert.deepEqual(parseMoney(text, MARKED), { amount, currency }, label);
      read += 1;
    }
  }

  /* BOTH HALVES WERE EXERCISED. A generator drifting so that every case landed on one side would leave the
     other rule asserted by nothing, and the count is the only place that would show. */
  assert.equal(read + refusedCount, 2000);
  assert.ok(read > 1500, `only ${read} cases read`);
  assert.ok(refusedCount > 10, `only ${refusedCount} cases exercised the refusal`);
});

test('A MINUS IS A MINUS IN EVERY POSITION: parse(-x) is the negation of parse(x), for every form above', () => {
  const next = rng(0x43_09_04);
  for (let i = 0; i < 500; i++) {
    const currency = MARKED_CODES[Math.floor(next() * MARKED_CODES.length)]!;
    const row = MARKED[currency]!;
    const magnitude = 1 + Math.floor(next() * 10 ** (1 + Math.floor(next() * 12)));
    const digits = digitsOf(magnitude, row.exponent, 'en', false);
    const plain = parseMoney(`${currency} ${digits}`, MARKED);
    assert.deepEqual(plain, { amount: magnitude, currency });
    for (const text of [
      `-${currency} ${digits}`,
      `${currency} -${digits}`,
      `−${currency} ${digits}`,
      `${currency} ${digits}-`,
      `${digits}- ${currency}`,
      `(${currency} ${digits})`,
      `${currency} (${digits})`,
      `(${digits} ${currency})`,
    ])
      assert.deepEqual(parseMoney(text, MARKED), { amount: -magnitude, currency }, JSON.stringify(text));
  }
});

/* ── the record's own formatter, in two dozen locales ───────────────────────────────────────────── */

/**
 * `Intl.NumberFormat` IS THE RENDERER HERE, NOT A HAND-WRITTEN ONE, because the forms above are what this file
 * thinks a statement prints and these are what a machine in another country actually prints. Every locale in
 * this list writes Latin digits and a separator set `isSep` holds: the comma, the point, the ASCII and no-break
 * spaces, and the narrow no-break space of French. The minus is `-` or `U+2212` (Swedish, Norwegian, Finnish),
 * and the Arabic locales with Latin digits put a direction mark in front of it, which must not cost the sign.
 *
 * WHAT IS LEFT OUT IS LEFT OUT FOR A REASON, and each reason has a test below: Indian grouping, Swiss grouping
 * and Arabic-Indic digits. `he-IL` puts a direction mark between the number and its code, so the code is not
 * found and nothing is read without a declared currency; that is a refusal, and a safe one.
 */
const LOCALES = [
  'en-US', 'en-GB', 'de-DE', 'de-AT', 'fr-FR', 'fr-CH', 'es-ES', 'it-IT', 'nl-NL', 'pt-BR', 'sv-SE', 'nb-NO',
  'fi-FI', 'da-DK', 'pl-PL', 'cs-CZ', 'ru-RU', 'tr-TR', 'id-ID', 'ja-JP', 'ko-KR', 'zh-CN',
  'ar-EG-u-nu-latn', 'ar-SA-u-nu-latn',
] as const;

/** Exponents as ISO 4217 has them, which is what `Intl` prints: 0, 2 and 3. */
const INTL: CurrencyTable = {
  USD: { exponent: 2, symbol: '$' },
  EUR: { exponent: 2, symbol: '€' },
  GBP: { exponent: 2, symbol: '£' },
  EGP: { exponent: 2 },
  JPY: { exponent: 0, symbol: '¥' },
  KWD: { exponent: 3 },
  CHF: { exponent: 2 },
  INR: { exponent: 2 },
};
const INTL_CODES = ['USD', 'EUR', 'GBP', 'EGP', 'JPY', 'KWD'] as const;

/**
 * Minor units as the exact decimal string `Intl` formats without a float in between.
 *
 * A STRING, BECAUSE `amount / 100` IS A FLOAT. `Intl.NumberFormat` reads a numeric string exactly (ES2023), so
 * what is printed is the amount and not the nearest double to it rounded back.
 */
const decimalOf = (amount: number, exponent: number): `${number}` => {
  const unit = 10 ** exponent;
  const abs = Math.abs(amount);
  const frac = exponent === 0 ? '' : `.${String(abs % unit).padStart(exponent, '0')}`;
  return `${amount < 0 ? '-' : ''}${Math.floor(abs / unit)}${frac}` as `${number}`;
};

const formatters = new Map<string, Intl.NumberFormat>();
const intl = (locale: string, currency: string, display: 'code' | 'symbol', amount: number): string => {
  const key = `${locale}|${currency}|${display}`;
  let f = formatters.get(key);
  if (f === undefined) {
    f = new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: display });
    formatters.set(key, f);
  }
  return f.format(decimalOf(amount, INTL[currency]!.exponent));
};

/** The same amount draw as above: up to thirteen digits of minor units, small ones over-sampled, never `-0`. */
const amountFrom = (next: () => number, maxDigits = 13): number => {
  const digits = 1 + Math.floor(next() * maxDigits);
  const magnitude = Math.floor(next() * 10 ** digits);
  return magnitude === 0 ? 0 : next() < 0.5 ? -magnitude : magnitude;
};

const shown = (text: string): string =>
  [...text].map((ch) => (ch.charCodeAt(0) > 0x7e ? `<U+${ch.charCodeAt(0).toString(16).padStart(4, '0')}>` : ch)).join('');

test('2,000 AMOUNTS AS INTL PRINTS THEM IN 24 LOCALES READ BACK TO THE AMOUNT AND THE CURRENCY', () => {
  const next = rng(0x43_09_05);
  for (let i = 0; i < 2000; i++) {
    const locale = LOCALES[Math.floor(next() * LOCALES.length)]!;
    const currency = INTL_CODES[Math.floor(next() * INTL_CODES.length)]!;
    /* THE CODE ALWAYS, AND THE SYMBOL WHERE IT IS ONE CHARACTER EVERYWHERE. `€` is `€` in every locale here;
       the dollar is `US$`, `$US` or `$` and the pound `£GB` or `UK£` depending on where you stand, and a
       prefix the table does not hold is a currency the reader should not guess at. */
    const display = currency === 'EUR' && next() < 0.5 ? 'symbol' : 'code';
    const amount = amountFrom(next);
    const text = intl(locale, currency, display, amount);
    assert.deepEqual(parseMoney(text, INTL), { amount, currency }, `${locale} ${display}: ${shown(text)}`);
  }
});

/**
 * LAKH GROUPING, which every Indian bank prints: `12,34,567.50`.
 *
 * `readAmount` HOLDS EVERY GROUP AFTER THE FIRST TO THREE DIGITS, so a two-digit group is not grouping and the
 * figure is refused whole. That is the safe failure and the one asserted: below one lakh the Indian and the
 * Western forms are the same string and read exactly, and from one lakh up the answer is nothing or the right
 * amount, never a fragment of it. A reader that learns lakhs keeps this test green.
 */
test('INDIAN GROUPING IS READ EXACTLY BELOW A LAKH AND IS NEVER MISREAD ABOVE ONE', () => {
  const next = rng(0x43_09_06);
  let below = 0;
  for (let i = 0; i < 600; i++) {
    const currency = (['INR', 'USD', 'JPY', 'KWD'] as const)[Math.floor(next() * 4)]!;
    const amount = amountFrom(next);
    const text = intl('en-IN', currency, 'code', amount);
    const got = parseMoney(text, INTL);
    const wholeUnits = Math.floor(Math.abs(amount) / 10 ** INTL[currency]!.exponent);
    if (wholeUnits < 100_000) {
      assert.deepEqual(got, { amount, currency }, shown(text));
      below += 1;
    } else if (got !== undefined) {
      assert.deepEqual(got, { amount, currency }, `a lakh-grouped figure misread: ${shown(text)}`);
    }
  }
  assert.ok(below > 100 && below < 600, `${below} of 600 below a lakh; the draw stopped covering one side`);
});

/**
 * ARABIC-INDIC DIGITS ARE NOT READ, and the property is that they are never MISREAD.
 *
 * `isDigit` is `0`–`9` and nothing else, and `43 §10` rules out the Unicode normalisation that would fold
 * `١٢٣` into `123` (it changes lengths, and every index here is a position in the stored text). So `ar-EG`'s
 * own output, `١٬٢٣٤٫٥٠ EGP`, has no token in it at all and the answer is no amount. The two that matter for
 * an Egyptian record are both here: Arabic-Indic (`U+0660`) and the Persian extended set (`U+06F0`), with
 * the Arabic thousands and decimal marks between them.
 */
test('ARABIC-INDIC DIGITS ARE NEVER READ AS A DIFFERENT AMOUNT', () => {
  const next = rng(0x43_09_07);
  for (let i = 0; i < 400; i++) {
    const locale = (['ar-EG', 'ar-SA', 'fa-IR'] as const)[Math.floor(next() * 3)]!;
    const currency = INTL_CODES[Math.floor(next() * INTL_CODES.length)]!;
    const amount = amountFrom(next);
    const text = intl(locale, currency, 'code', amount);
    const got = parseMoney(text, INTL);
    if (got !== undefined) assert.deepEqual(got, { amount, currency }, `${locale}: ${shown(text)}`);
  }
});

test(
  'ARABIC-INDIC DIGITS READ AS THE AMOUNT THEY WRITE',
  { todo: 'money.ts reads ASCII digits only; an Arabic SMS from an Egyptian bank (EGP ١٬٢٥٠٫٠٠) is no amount until it maps U+0660–U+0669 and U+06F0–U+06F9 with U+066B and U+066C' },
  () => {
    assert.deepEqual(parseMoney('EGP ١٬٢٥٠٫٠٠', INTL), { amount: 125000, currency: 'EGP' });
    assert.deepEqual(parseMoney(intl('ar-EG', 'EGP', 'code', -264297), INTL), { amount: -264297, currency: 'EGP' });
  },
);

/**
 * SWISS GROUPING IS A WRONG NUMBER TODAY, and the only form in this file that is.
 *
 * `de-CH` groups with `U+2019`, the right single quotation mark, where a keyboard writes `'`. `isSep` holds the
 * ASCII apostrophe and not this one, so `CHF 1’234.50` tokenises as `1` and `234.50`, and the first token takes
 * the code in front of it: CHF 1.00, in the ledger, three orders of magnitude out, exactly the shape the
 * no-break space had before it was added. A refusal would be safe; this is not. Marked `todo` so the run stays
 * green and the defect stays visible, and the fix is one character in `isSep` (and `U+2018` beside it).
 */
test(
  'SWISS GROUPING READS AS THE AMOUNT INTL PRINTS',
  { todo: 'money.ts isSep: add U+2019 (and U+2018), which de-CH groups with; today CHF 1’234.50 reads as CHF 1.00' },
  () => {
    for (const amount of [123450, -123456750, 99]) {
      const text = intl('de-CH', 'CHF', 'code', amount);
      assert.deepEqual(parseMoney(text, INTL), { amount, currency: 'CHF' }, shown(text));
    }
  },
);

/* ── the currency nobody wrote ──────────────────────────────────────────────────────────────────── */

test('A DECLARED CURRENCY FILLS A BARE NUMBER AND NEVER OVERRIDES ONE THAT WAS WRITTEN', () => {
  const next = rng(0x43_09_08);
  for (let i = 0; i < 500; i++) {
    const declared = MARKED_CODES[Math.floor(next() * MARKED_CODES.length)]!;
    const written = MARKED_CODES[Math.floor(next() * MARKED_CODES.length)]!;
    const amount = amountFrom(next, 12);

    /* Bare: the declaration says what the provider meant and the exponent is the declared currency's. */
    const bare = `${amount < 0 ? '-' : ''}${digitsOf(amount, MARKED[declared]!.exponent, 'en', false)}`;
    assert.deepEqual(parseMoney(bare, MARKED, declared), { amount, currency: declared }, `${bare} declared ${declared}`);

    /* Written: the provider moved the money and named it, so its code wins whatever was declared. */
    const coded = `${written} ${amount < 0 ? '-' : ''}${digitsOf(amount, MARKED[written]!.exponent, 'en', false)}`;
    assert.deepEqual(parseMoney(coded, MARKED, declared), { amount, currency: written }, `${coded} declared ${declared}`);
  }
});
