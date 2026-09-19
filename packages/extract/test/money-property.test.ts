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
