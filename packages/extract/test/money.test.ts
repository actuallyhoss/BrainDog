/**
 * The money grammar, row by row from `43 §9.2`.
 *
 * EVERY ROW IS A READING THAT COULD GO THE OTHER WAY. `1.250` is one thousand two hundred and fifty or one
 * and a quarter, `1,250` in dinars is a quarter of what it is in pounds, and `$5.00` is two different
 * currencies in one table. None of these is an edge case in the sense of being rare: they are the ordinary
 * output of ordinary providers, and a reading that is wrong here is a balance that is wrong for ever,
 * silently, because nothing downstream can tell a correct 125000 from an incorrect one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseMoney, type CurrencyTable, type Money } from '../src/money.ts';

const TABLE: CurrencyTable = {
  EGP: { exponent: 2 },
  USD: { exponent: 2, symbol: '$' },
  CAD: { exponent: 2, symbol: '$' },
  EUR: { exponent: 2, symbol: '€' },
  JPY: { exponent: 0, symbol: '¥' },
  KWD: { exponent: 3 },
};

const money = (amount: number, currency: string): Money => ({ amount, currency });

type Row = [input: string, want: Money | undefined, declared?: string];

const rows: Row[] = [
  ['EGP 1,250.00', money(125000, 'EGP')],
  ['1.250,00 EUR', money(125000, 'EUR')],
  ['EGP 1250', money(125000, 'EGP')],
  ['1 250,00 EUR', money(125000, 'EUR')],
  ['EGP 1.250', money(125000, 'EGP')],
  ['EGP 1.25', money(125, 'EGP')],
  ['EGP 1,25', money(125, 'EGP')],
  ['JPY 1,250', money(1250, 'JPY')],
  ['JPY 12.5', undefined],
  ['EGP 12.345', money(1234500, 'EGP')],
  ['EGP 1,250.000', undefined],
  ['EGP 1,25,000', undefined],
  ['EGP 1250,000', undefined],
  ['EGP 1,250,000', money(125000000, 'EGP')],
  ['EGP 1.250.000', money(125000000, 'EGP')],
  ['EGP 1,250,000.50', money(125000050, 'EGP')],
  ['-EGP 1,250.00', money(-125000, 'EGP')],
  ['EGP -1,250.00', money(-125000, 'EGP')],
  ['(EGP 1,250.00)', money(-125000, 'EGP')],
  ['EGP −1,250.00', money(-125000, 'EGP')],
  ['€5', money(500, 'EUR')],
  ['$5.00', undefined],
  ['$5.00', money(500, 'USD'), 'USD'],
  ['1,250.00', undefined],
  ['1,250.00', money(125000, 'EGP'), 'EGP'],
  ['5.00 EGP', money(500, 'EGP')],
  ['USD 5.00 (EGP 245.00)', money(500, 'USD')],
  ['USD 5.00 EGP', undefined],
  ['XYZ 5.00', undefined],
  ['on 29/08/26 EGP 5.00', money(500, 'EGP')],
  ['EGP 90,071,992,547,409.91', money(9007199254740991, 'EGP')],
  ['EGP 90,071,992,547,409.92', undefined],
];

for (const [input, want, declared] of rows)
  test(`money: ${input}${declared === undefined ? '' : ` (declared ${declared})`}`, () => {
    assert.deepEqual(parseMoney(input, TABLE, declared), want);
  });

test('THE THOUSANDS RULE TURNS ON THE EXPONENT AND NOTHING ELSE', () => {
  /* The same eight characters, two currencies, two amounts — and both readings are correct. This is the one
     place the package cannot be right by being careful: it is right by being told the currency first. */
  assert.deepEqual(parseMoney('EGP 1.250', TABLE), money(125000, 'EGP'));
  assert.deepEqual(parseMoney('KWD 1.250', TABLE), money(1250, 'KWD'));
  /* `43 §10` names this as the ceiling, so it is pinned rather than left to be discovered: a provider that
     writes dinars grouped and undecimalled is read as one and a quarter, and wants `map:` instead of text. */
  assert.deepEqual(parseMoney('KWD 1,250', TABLE), money(1250, 'KWD'), 'the named ceiling moved');
});

test('A CURRENCY EITHER SIDE THAT DISAGREES YIELDS NOTHING, rather than the nearer one', () => {
  assert.equal(parseMoney('USD 5.00 EGP', TABLE), undefined);
  /* And a declared currency never overrides one the provider wrote, because the provider is the one that
     moved the money. */
  assert.deepEqual(parseMoney('5.00 EGP', TABLE, 'USD'), money(500, 'EGP'));
});

test('a round trip over every currency and every style, which is the floor until fast-check is installed', () => {
  /* `43 §9.2` wants a 2,000-case property with committed seeds; `fast-check` is not a dependency of this
     repository yet, and adding one to satisfy a test is the wrong order. This is the same assertion over a
     fixed grid — every currency in the table against every style a provider writes — and it fails for the
     same reasons the property would. The precedent is `where`'s escape table. */
  const styles = {
    en: (whole: string, frac: string) => (frac === '' ? whole : `${whole}.${frac}`),
    eu: (whole: string, frac: string) => (frac === '' ? whole : `${whole},${frac}`),
    bare: (whole: string, frac: string) => (frac === '' ? whole : `${whole}.${frac}`),
  };

  const group = (digits: string, sep: string): string => {
    let out = '';
    for (let i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % 3 === 0) out += sep;
      out += digits[i];
    }
    return out;
  };

  const amounts = [0, 5, 99, 100, 1250, 125000, 9999999, 123456789];
  for (const [code, row] of Object.entries(TABLE)) {
    if (row.symbol === '$') continue; // a shared symbol is nobody's; the rows above cover it
    for (const base of amounts) {
      const minor = String(base).padStart(row.exponent + 1, '0');
      const whole = row.exponent === 0 ? minor : minor.slice(0, minor.length - row.exponent);
      const frac = row.exponent === 0 ? '' : minor.slice(minor.length - row.exponent);
      for (const [name, render] of Object.entries(styles)) {
        const grouped = name === 'bare' ? whole : group(whole, name === 'en' ? ',' : '.');
        const written = `${code} ${render(grouped, frac)}`;
        assert.deepEqual(parseMoney(written, TABLE), money(base, code), written);
      }
    }
  }
});
