/**
 * A currency code written against its figure, with no space between them.
 *
 * WHY THIS FILE EXISTS. `loop/research-batch-eighteen-audit.md` section 2 drove `scanMoney` over a code glued to
 * its number and it answered garbage in the fallback currency: `EGP2500.00` came back as GBP 0.00 and
 * `EGP1,284.50` as GBP 284.50. The letter before the first digit refused the number its start, as it should for an
 * identifier like `INV1250`, and the tokenizer then walked on one character at a time and started a fresh number
 * after the first separator it met, so the tail of the figure became an amount of its own and took the declared
 * currency. Through `bank-from-out` that was a cash withdrawal of EGP 2,500.00 filed at `exact` as GBP 0.00.
 *
 * TWO RULES, AND EACH ROW BELOW HOLDS ONE OF THEM. A code in the table touching the digits is that code and that
 * figure, because the bank printed both. And a number refused its start is refused whole: nothing inside it
 * may start a number, whatever a letter glued to it says, because the tail of a refused figure is never the
 * figure somebody sent.
 *
 * EVERY FIGURE IS INVENTED.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { scanDecimals, scanInts, scanMoney, type CurrencyTable, type Money } from '../src/money.ts';

const TABLE: CurrencyTable = {
  EGP: { exponent: 2 },
  GBP: { exponent: 2, symbol: '£' },
  USD: { exponent: 2 },
  KWD: { exponent: 3 },
};

const money = (amount: number, currency: string): Money => ({ amount, currency });

type Row = [input: string, want: Money[], declared?: string];

const rows: Row[] = [
  /* The two the audit printed, and the line that carried the first of them. */
  ['EGP2500.00', [money(250_000, 'EGP')], 'GBP'],
  ['EGP1,284.50', [money(128_450, 'EGP')], 'GBP'],
  ['327 EGP2500.00', [money(32_700, 'EGP'), money(250_000, 'EGP')], 'GBP'],
  ['EGP2500.00', [money(250_000, 'EGP')]],
  /* The glued code keeps every other rule it had with a space: the exponent is the code's, a trailing minus is a
     sign, and a code on the other side that disagrees is no candidate. */
  ['KWD1.250', [money(1_250, 'KWD')], 'GBP'],
  ['EGP2500.00-', [money(-250_000, 'EGP')], 'GBP'],
  ['USD5.00 EGP', [], 'GBP'],
  ['paid USD12.40 today', [money(1_240, 'USD')], 'GBP'],
  /* A glued code after one figure is the next figure's prefix, as it is with a space. */
  ['EGP 5.00 USD245.00', [money(500, 'EGP'), money(24_500, 'USD')], 'GBP'],
  /* A code that is not in the table, or letters that are not a code, still refuse the number, and now refuse
     all of it: before this, `INV1250.75` read as GBP 75.00 and `ABC1,250.00` as GBP 250.00. */
  ['INV1250.75', [], 'GBP'],
  ['ABC1,250.00', [], 'GBP'],
  ['XEGP2500.00', [], 'GBP'],
  ['EGPX2500.00', [], 'GBP'],
  ['REF88213.', [], 'GBP'],
  /* A refused number ends where its run of digits ends, so a real amount after a space still reads. */
  ['INV1250 EGP 5.00', [money(500, 'EGP')], 'GBP'],
  ['INV1250 5.00', [money(500, 'GBP')], 'GBP'],
];

for (const [input, want, declared] of rows)
  test(`scanMoney(${JSON.stringify(input)}${declared ? `, ${declared}` : ''}) is ${JSON.stringify(want)}`, () => {
    assert.deepEqual(scanMoney(input, TABLE, declared), want);
  });

test('A NUMBER GLUED TO LETTERS IS NOT AN INTEGER OR A DECIMAL EITHER, head or tail', () => {
  /* `scanInts` and `scanDecimals` have no table, so no letters make a code for them, and the tail rule is the
     one that reaches them: `INV1250.75` gave the integer 75 and the decimal 75 before, and `EGP2,500` the integer
     500. */
  assert.deepEqual(scanInts('INV1250.75'), []);
  assert.deepEqual(scanDecimals('INV1250.75'), []);
  assert.deepEqual(scanInts('EGP2,500'), []);
  assert.deepEqual(scanInts('ref AB12 and 7'), [7]);
});
