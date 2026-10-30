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

import { parseMoney, scanDecimals, scanInts, type CurrencyTable } from '../src/money.ts';

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
 * WHAT IS LEFT OUT HAS A TEST OF ITS OWN BELOW: Indian grouping, Swiss grouping, Arabic-Indic digits, and the
 * right-to-left locales whose direction marks sit between a number and its code.
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
 * READ EXACTLY ON BOTH SIDES OF A LAKH, IN RUPEES. Below one the Indian and the Western forms are the same string; from
 * one up, `readAmount` takes a figure as lakhs when every group fits (the first one or two digits, then twos, then the
 * last three) and the currency is one whose banks print lakhs (`LAKH_CURRENCIES`), so the record of somebody paid in
 * rupees reads what their bank printed instead of nothing. In any other currency a comma figure shaped as lakhs is no
 * amount, as it was before lakhs were read (review of 30 October, R13): `en-IN` printing dollars above a lakh is refused,
 * and the same dollars below one still read.
 */
test('INDIAN GROUPING IS READ EXACTLY IN RUPEES, BELOW A LAKH AND ABOVE ONE, AND IN NO OTHER CURRENCY ABOVE ONE', () => {
  const next = rng(0x43_09_06);
  let below = 0;
  let refused = 0;
  for (let i = 0; i < 600; i++) {
    const currency = (['INR', 'USD', 'JPY', 'KWD'] as const)[Math.floor(next() * 4)]!;
    const amount = amountFrom(next);
    const text = intl('en-IN', currency, 'code', amount);
    const lakhs = Math.floor(Math.abs(amount) / 10 ** INTL[currency]!.exponent) >= 100_000;
    if (!lakhs) below += 1;
    if (lakhs && currency !== 'INR') {
      assert.equal(parseMoney(text, INTL), undefined, shown(text));
      refused += 1;
    } else assert.deepEqual(parseMoney(text, INTL), { amount, currency }, shown(text));
  }
  assert.ok(below > 100 && below < 500, `${below} of 600 below a lakh; the draw stopped covering one side`);
  assert.ok(refused > 50, `${refused} lakh figures in other currencies; the draw stopped covering them`);
});

/**
 * A FIGURE THAT IS NEITHER WESTERN NOR LAKH STAYS REFUSED. Two conventions in one figure is a figure nobody can
 * read without picking one, and picking is what this file does not do.
 */
test('A FIGURE GROUPED PARTLY BY LAKHS AND PARTLY BY THOUSANDS IS NO AMOUNT', () => {
  for (const text of ['INR 1,23,456,789', 'INR 1,234,56', 'INR 123,45,678', 'INR 1,23,4567', 'INR 1.23.456', 'INR 1,23,456.789'])
    assert.equal(parseMoney(text, INTL), undefined, text);
  /* The same shapes that do fit. */
  assert.deepEqual(parseMoney('INR 1,00,000', INTL), { amount: 10_000_000, currency: 'INR' });
  assert.deepEqual(parseMoney('INR 10,00,00,000.50', INTL), { amount: 10_000_000_050, currency: 'INR' });
  /* NOT IN A CURRENCY NOBODY PRINTS IN LAKHS, AND NEVER FROM A NOUGHT (review of 30 October, R13). */
  for (const text of ['KWD 1,00,000', 'EGP 10,20,300', 'EGP 1,25,000', 'USD 12,34,567.50', 'INR 00,12,345', 'INR 0,12,345'])
    assert.equal(parseMoney(text, INTL), undefined, text);
  assert.deepEqual(parseMoney('EGP ١٬٢٥٬٠٠٠', INTL), { amount: 12_500_000, currency: 'EGP' }, 'the Arabic mark groups lakhs in any currency');
  assert.deepEqual(scanInts('scores 1,10,100'), [], 'a comma list is not a number');
  assert.deepEqual(scanDecimals('scores 1,10,100'), []);
});

/**
 * ARABIC-INDIC DIGITS, as `ar-EG`, `ar-SA` and `fa-IR` print them, read back exactly.
 *
 * Both systems an Egyptian record meets: Arabic-Indic (`U+0660`) and the extended set of Persian and Urdu (`U+06F0`),
 * with `٬` grouping and `٫` as the point. `ar-EG` writes a negative as `U+061C - U+200F` before the digits and
 * `fa-IR` as `U+200E − U+200E` before the code, so the direction marks are crossed here as well; a reader that
 * stopped at them lost the minus, which is a debit filed as a credit. `ur-IN` groups by lakhs with `٬`.
 */
test('ARABIC-INDIC DIGITS READ AS THE AMOUNT THEY WRITE, IN EVERY SIGN AND EXPONENT', () => {
  const next = rng(0x43_09_07);
  for (let i = 0; i < 400; i++) {
    const locale = (['ar-EG', 'ar-SA', 'fa-IR', 'ur-IN', 'ar-IQ'] as const)[Math.floor(next() * 5)]!;
    const currency = INTL_CODES[Math.floor(next() * INTL_CODES.length)]!;
    const amount = amountFrom(next);
    const text = intl(locale, currency, 'code', amount);
    assert.deepEqual(parseMoney(text, INTL), { amount, currency }, `${locale}: ${shown(text)}`);
  }
  /* The text an Egyptian bank sends in Arabic, with no code beside the figure: the declared pound fills it. */
  assert.deepEqual(parseMoney('EGP ١٬٢٥٠٫٠٠', INTL), { amount: 125000, currency: 'EGP' });
  assert.deepEqual(parseMoney('تم خصم مبلغ ١٢٥٠٫٠٠ جنيه من حسابك', INTL, 'EGP'), { amount: 125000, currency: 'EGP' });
  assert.deepEqual(parseMoney(intl('ar-EG', 'EGP', 'code', -264297), INTL), { amount: -264297, currency: 'EGP' });
  /* Arabic digits with the Latin marks, which some banks print, read by the Latin rules. */
  assert.deepEqual(parseMoney('EGP ١,٢٣٤.٥٠', INTL), { amount: 123450, currency: 'EGP' });
});

/**
 * THE ARABIC MARKS SAY WHAT THEY ARE, AND NOTHING THAT MIXES TWO SYSTEMS IS READ.
 *
 * `٫` is always the point, so `EGP ١٫٢٥٠` is three decimals of a two-decimal currency and refused, where `EGP 1.250`
 * is one thousand two hundred and fifty by the thousands rule; `٬` is always grouping, so `KWD ١٬٢٥٠` is 1,250
 * dinars, where `KWD 1,250` is one and a quarter. A figure written in two digit systems, or with an Arabic mark
 * beside a Latin one, has no single reading and is no amount.
 */
test('A NUMBER IN TWO DIGIT SYSTEMS, OR WITH TWO KINDS OF MARK, IS REFUSED RATHER THAN READ', () => {
  assert.equal(parseMoney('EGP ١٫٢٥٠', INTL), undefined);
  assert.deepEqual(parseMoney('KWD ١٬٢٥٠', INTL), { amount: 1_250_000, currency: 'KWD' });
  for (const text of [
    'EGP ١2٣', 'EGP 1٢3.00', 'EGP ١٢۳', 'EGP ١٬٢٣٤.٥٠', 'EGP ١٫٢٣٤,٥٠', 'EGP ١٬٢٣٤٫٥٠٫٠', 'EGP ١٫٢٣٤٬٥٠٠', 'EGP 12٬34',
  ])
    assert.equal(parseMoney(text, INTL), undefined, shown(text));
});

/**
 * SWISS GROUPING, `U+2019` where a keyboard writes `'`.
 *
 * It used to be the one wrong number in this file: `CHF 1’234.50` tokenised as `1` and `234.50`, and the first token
 * took the code in front of it, so CHF 1,234.50 read as CHF 1.00. An apostrophe is now grouping in all three of its
 * spellings and only grouping, so at exponent 3 it is still a thousands mark and never the point.
 */
test('SWISS GROUPING READS AS THE AMOUNT INTL PRINTS', () => {
  const next = rng(0x43_09_09);
  for (let i = 0; i < 400; i++) {
    const currency = (['CHF', 'EUR', 'JPY', 'KWD'] as const)[Math.floor(next() * 4)]!;
    const amount = amountFrom(next);
    const text = intl('de-CH', currency, 'code', amount);
    assert.deepEqual(parseMoney(text, INTL), { amount, currency }, shown(text));
  }
  assert.deepEqual(parseMoney('CHF 1’234.50', INTL), { amount: 123450, currency: 'CHF' });
  assert.deepEqual(parseMoney('CHF 1‘234.50', INTL), { amount: 123450, currency: 'CHF' });
  assert.deepEqual(parseMoney("KWD 1'250", INTL), { amount: 1_250_000, currency: 'KWD' });
  assert.deepEqual(parseMoney('KWD 1’250', INTL), { amount: 1_250_000, currency: 'KWD' });
  /* An apostrophe is never a point: refused, not five and a half. */
  for (const text of ['CHF 5’50', "CHF 5'5", 'CHF 1,234’50', 'CHF 1’23’456'])
    assert.equal(parseMoney(text, INTL), undefined, text);
});

/**
 * RIGHT-TO-LEFT LOCALES WITH LATIN DIGITS, and the direction marks between a number and its code.
 *
 * `he-IL` prints `-1,234.50 U+00A0 U+200F EGP`; the mark hid the code, so nothing was read. `ar-AE`, `ar-MA` and
 * `ar-IN` put `U+200F U+200E` in front of the minus.
 */
test('A DIRECTION MARK BETWEEN A NUMBER AND ITS CODE OR ITS SIGN COSTS NEITHER', () => {
  const next = rng(0x43_09_0a);
  for (let i = 0; i < 400; i++) {
    const locale = (['he-IL', 'ar-AE', 'ar-MA', 'ar-IN', 'ur-PK'] as const)[Math.floor(next() * 5)]!;
    const currency = INTL_CODES[Math.floor(next() * INTL_CODES.length)]!;
    const amount = amountFrom(next);
    const text = intl(locale, currency, 'code', amount);
    assert.deepEqual(parseMoney(text, INTL), { amount, currency }, `${locale}: ${shown(text)}`);
  }
  assert.deepEqual(parseMoney('12.50 \u200fEGP', INTL), { amount: 1250, currency: 'EGP' });
  assert.deepEqual(parseMoney('EGP\u200e -\u200f12.50', INTL), { amount: -1250, currency: 'EGP' });
});

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
