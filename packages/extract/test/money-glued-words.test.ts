/**
 * A currency code glued to digits, where the digits are an identifier and not a figure.
 *
 * WHY THIS FILE EXISTS. `635bff96` let a number start after three capitals the table holds, so `EGP2500.00` read
 * as EGP 2,500.00. The table `@braindog/record` wires is every code `Intl.supportedValuesOf('currency')` names,
 * and a measurement of what that let in with EGP declared found: `Flight MAD2031`
 * gave MAD 2,031.00, `voucher TOP20` TOP 20.00, `Promo ALL2026` ALL 2,026, `at CAD1 PETROL` CAD 1.00,
 * `Seat BAM12.` BAM 12.00, and `Ref PEN15` PEN 15.00. Before `635bff96` each of those lines read its EGP figures
 * and nothing else, and that is what every row below expects again.
 *
 * THE TABLE HERE IS THE RECORD'S, built the same way, because the defect is that ordinary capitals are codes in
 * it. A hand-written table of four codes would have passed against the broken reader.
 *
 * EVERY FIGURE IS INVENTED.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { scanMoney, type CurrencyTable, type Money } from '../src/money.ts';

/* EVERY CODE AT EXPONENT 2, because what this file measures is which capitals are codes, not how many minor units
   each one has, and working an exponent out here would be the fourth copy `ingest.test.ts` refuses. The rows expect
   EGP and USD at 2 and KWD at 3, which ISO 4217 gives and which is written down here rather than worked out. */
const TABLE: CurrencyTable = {
  ...Object.fromEntries(Intl.supportedValuesOf('currency').map((code) => [code, { exponent: 2 }])),
  KWD: { exponent: 3 },
};

const egp = (amount: number): Money => ({ amount, currency: 'EGP' });

type Row = [input: string, want: Money[]];

/* The six that were measured, and two references with a code inside them. `Card ending 4417` and `OTP is 4417.`
   are the declared currency reading a bare integer, which is how the record wires this function and is not
   what this file is about; they are kept so the rows are the measured lines whole. */
const identifiers: Row[] = [
  ['Flight MAD2031 charged EGP 1,500.00', [egp(150_000)]],
  ['Promo ALL2026 applied, paid 99.00', [egp(9_900)]],
  ['Paid 99.00 with voucher TOP20', [egp(9_900)]],
  ['Card ending 4417 at CAD1 PETROL EGP 800.00', [egp(441_700), egp(80_000)]],
  ['Your OTP is 4417. Seat BAM12. Total 450.00', [egp(441_700), egp(45_000)]],
  ['Ref PEN15 paid EGP 20.00', [egp(2_000)]],
  /* A code with a digit on its left is inside a reference, whatever follows it, and so is a figure with a
     letter on its right, point or no point. */
  ['Ref AB9CAD17.50 paid EGP 20.00', [egp(2_000)]],
  ['Ref PEN15.00X paid EGP 20.00', [egp(2_000)]],
  /* THE SEPARATOR THAT LETS A GLUED FIGURE START IS NEVER A SPACE. Measured with the space let through: this line
     read nothing at all, because `PEN15` started a figure, swallowed ` 20.00` as its grouping, and the whole of
     `15 20.00` then failed to parse. The amount after the reference is the only amount on the line. */
  ['Ref PEN15 20.00', [egp(2_000)]],
];

/* The glued figures a bank prints, which carry their point or their grouping, in every position a sign, a
   bracket or a label puts them. */
const figures: Row[] = [
  ['EGP2500.00', [egp(250_000)]],
  ['EGP1,284.50', [egp(128_450)]],
  ['EGP2500.00-', [egp(-250_000)]],
  ['-EGP2500.00', [egp(-250_000)]],
  ['(EGP2500.00)', [egp(-250_000)]],
  ['Amount:EGP2,500.00', [egp(250_000)]],
  ['327 EGP2500.00', [egp(32_700), egp(250_000)]],
  ['Withdrawal EGP2500.00- Your available balance is EGP 31,040.25', [egp(-250_000), egp(3_104_025)]],
  ['paid USD12.40 today', [{ amount: 1_240, currency: 'USD' }]],
  ['KWD1.250', [{ amount: 1_250, currency: 'KWD' }]],
];

for (const [input, want] of [...identifiers, ...figures])
  test(`scanMoney(${JSON.stringify(input)}, EGP) is ${JSON.stringify(want)}`, () => {
    assert.deepEqual(scanMoney(input, TABLE, 'EGP'), want);
  });
