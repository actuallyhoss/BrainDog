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

import { parseMoney, scanMoney, type CurrencyTable, type Money } from '../src/money.ts';

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
  ['EGP 1,25,000', money(12500000, 'EGP')],
  ['EGP 1,23,456,789', undefined],
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
  ['EGP 1’250.00', money(125000, 'EGP')],
  ['KWD 1’250', money(1250000, 'KWD')],
  ['EGP 5’50', undefined],
  ['EGP ١٬٢٥٠٫٠٠', money(125000, 'EGP')],
  ['EGP ١٫٢٥٠', undefined],
  ['EGP ١2٣', undefined],
  ['12.50 \u200fEGP', money(1250, 'EGP')],
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

/* ── the adversarial pass: four shapes measured against the live code, all four wrong ─────────── */

/**
 * THE SIGN AT THE WRONG END, which is how a refund is filed as a charge.
 *
 * Measured before the repair: `EGP 1,250.00-` read as **+125000**. Not a refusal, not a missing
 * field: the right currency and the right magnitude with the sign inverted, which is a balance out
 * by twice the amount and a row that nothing downstream can question. The leading minus, the
 * Unicode minus and the parenthesis were all read; the trailing one was walked straight past,
 * because the forward scan looked for a currency and a closing bracket and nothing else.
 *
 * IT IS NOT AN EXOTIC FORM. It is what SAP prints, what a mainframe COBOL PIC clause with a
 * trailing sign prints, and what several Gulf and Egyptian bank statements print for a credit.
 *
 * GLUED TO THE DIGITS, AND NOT FOLLOWED BY ONE, which is the whole of the rule that keeps a range
 * from becoming a credit. `EGP 12.00-15.00` is two prices, and `Total EGP 5.00 - thanks` is a
 * sentence with a dash in it; neither is negative, and both are pinned below.
 */
test('A TRAILING MINUS IS A MINUS, and walking past it files a refund as a charge', () => {
  assert.deepEqual(parseMoney('EGP 1,250.00-', TABLE), money(-125000, 'EGP'));
  assert.deepEqual(parseMoney('1,250.00- EGP', TABLE), money(-125000, 'EGP'));
  assert.deepEqual(parseMoney('1.250,00- EUR', TABLE), money(-125000, 'EUR'));
  assert.deepEqual(parseMoney('EGP 1,250.00−', TABLE), money(-125000, 'EGP'), 'the Unicode minus too');
  assert.deepEqual(parseMoney('JPY 1,250-', TABLE), money(-1250, 'JPY'), 'and where there are no minor units');

  /* A digit after it means it is a range, and a space before it means it is a dash. */
  assert.deepEqual(parseMoney('EGP 12.00-15.00', TABLE), money(1200, 'EGP'), 'a range is not a credit');
  assert.deepEqual(parseMoney('Total EGP 5.00 - thanks', TABLE), money(500, 'EGP'), 'a dash is not a sign');
  /* An explicit leading sign was written by somebody and is not overruled by a character at the far end. */
  assert.deepEqual(parseMoney('EGP +1,250.00-', TABLE), money(125000, 'EGP'));
});

/**
 * THE SPACE BETWEEN THE CODE AND THE NUMBER IS NOT ALWAYS `U+0020`, and this file already knew it.
 *
 * `SPACE_LIKE` is exported from `money.ts` precisely because a statement writes sixteen different
 * spaces, and `isSep` consults it, so `EUR 2<U+00A0>642,97` groups correctly. The two space skips
 * inside `scanMoney` did not: both compared against the literal `' '`, so the currency on the other
 * side of a no-break space was never found.
 *
 * MEASURED: `EGP<U+00A0>5.00` and `5.00<U+00A0>EGP` both returned `undefined`, and so did
 * `Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(1234.56)` and the
 * `fr-FR` one. The record could not read back the string its own formatter had printed, and an
 * `&nbsp;` between the code and the figure is the ordinary output of an HTML email. A refusal
 * rather than a wrong number, so it cost a field and not a balance, but it cost it on the most
 * common rendering there is.
 */
test('A NO-BREAK SPACE BESIDE THE NUMBER STILL CARRIES THE CURRENCY', () => {
  const nbsp = ' ';
  assert.deepEqual(parseMoney(`EGP${nbsp}5.00`, TABLE), money(500, 'EGP'));
  assert.deepEqual(parseMoney(`5.00${nbsp}EGP`, TABLE), money(500, 'EGP'));
  assert.deepEqual(parseMoney(`1.234,56${nbsp}€`, TABLE), money(123456, 'EUR'));
  assert.deepEqual(parseMoney(`€${nbsp}1.234,56`, TABLE), money(123456, 'EUR'));
  assert.deepEqual(parseMoney(`EGP${nbsp}-1,250.00`, TABLE), money(-125000, 'EGP'), 'and the sign is still reached');

  /* The record's own formatters, round-tripped. Both print a no-break space before the symbol. */
  for (const locale of ['de-DE', 'fr-FR'])
    assert.deepEqual(
      parseMoney(new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(1234.56), TABLE),
      money(123456, 'EUR'),
      locale,
    );
});

/**
 * MINUS ZERO IS NOT AN AMOUNT, and `money-property.test.ts` says so in as many words while
 * `scanMoney` was producing it.
 *
 * Measured: `(EGP 0.00)`, `EGP -0.00` and `EGP -0` all returned `{ amount: -0 }`, because the sign
 * was applied to the magnitude without asking whether there was one. It survives `JSON.stringify`
 * as `0` and dies in `JSON.parse`, so the row in memory and the row read back out of the kernel are
 * two values that `Object.is` and `assert.deepStrictEqual` both call different: a dedupe that keys
 * on the pair sees two rows where the bank sent one.
 */
test('MINUS ZERO IS NOT AN AMOUNT, it is zero', () => {
  for (const written of ['(EGP 0.00)', 'EGP -0.00', 'EGP -0', 'EGP -0,000', '(EGP 0.00) EGP'])
    assert.ok(Object.is(parseMoney(written, TABLE)?.amount, 0), `${written} produced minus zero`);
  assert.deepEqual(parseMoney('(EGP 0.00)', TABLE), money(0, 'EGP'));
});

/**
 * TWO AMOUNTS ON ONE LINE ARE TWO AMOUNTS, and one of them was being dropped.
 *
 * A foreign-exchange line prints both sides: `USD 5.00 EGP 245.00` charged and billed. Measured,
 * `scanMoney` returned **one** pair for it, the EGP one. The code between the two numbers was read
 * as a suffix for the first and as a prefix for the second, the first number therefore had `USD`
 * before it and `EGP` after it, the two disagreed, and the disagreement rule threw it away. The
 * mirror form `5.00 USD 245.00 EGP` lost the second for the same reason from the other side.
 *
 * THE DISAGREEMENT RULE ITSELF IS RIGHT AND STAYS, which is what the last three assertions are for.
 * `USD 5.00 EGP` has a code on each side and no second number to explain either of them away, so it
 * is still no candidate at all. What changed is narrow: a code that is itself the prefix of the next
 * number is not also this number's suffix, and a code already read as one number's suffix does not
 * get to contradict the next number's own suffix.
 */
test('TWO AMOUNTS ON ONE LINE ARE TWO AMOUNTS, not one and a silent loss', () => {
  assert.deepEqual(scanMoney('USD 5.00 EGP 245.00', TABLE), [money(500, 'USD'), money(24500, 'EGP')]);
  assert.deepEqual(scanMoney('5.00 USD 245.00 EGP', TABLE), [money(500, 'USD'), money(24500, 'EGP')]);
  assert.deepEqual(scanMoney('EGP 5.00 EGP 245.00', TABLE), [money(500, 'EGP'), money(24500, 'EGP')]);
  assert.deepEqual(scanMoney('USD 5.00 and EGP 245.00', TABLE), [money(500, 'USD'), money(24500, 'EGP')]);
  assert.deepEqual(scanMoney('USD 5.00 (EGP 245.00)', TABLE), [money(500, 'USD'), money(-24500, 'EGP')]);

  assert.deepEqual(scanMoney('USD 5.00 EGP', TABLE), [], 'the disagreement rule survives');
  assert.deepEqual(scanMoney('5.00 EGP 245.00', TABLE), [money(500, 'EGP'), money(24500, 'EGP')], 'one code, two numbers');
});

/**
 * THREE AMOUNTS IN SUFFIX FORM, where the two-amount repair shifted every currency one place left.
 *
 * Measured on the repaired code before this test was written: `5.00 USD 245.00 EGP 10 JPY` returned
 * `[500 USD, 24500 USD]`. The second figure is written `EGP` in the string and came out `USD`, and the
 * third was dropped altogether. On the code before the repair the same line returned `[500 USD]`, so the
 * middle amount went from a refusal to a wrong currency, which is the one trade this file says it will
 * never make: a wrong number cannot be questioned downstream and a missing one can.
 *
 * WHY IT ONLY BITES AT THREE. The middle number has a code on each side, and the code on its right is
 * also the prefix of the number after it, so the suffix was suppressed as the next amount's property
 * before the claim on its prefix had been released. It was then left holding the previous amount's code
 * as its only candidate. The release has to be decided against the code that is actually there, not
 * against what survives the suppression.
 */
test('THREE AMOUNTS IN SUFFIX FORM KEEP THEIR OWN CURRENCIES, and none borrows the one to its left', () => {
  assert.deepEqual(scanMoney('5.00 USD 245.00 EGP 10 JPY', TABLE), [
    money(500, 'USD'),
    money(24500, 'EGP'),
    money(10, 'JPY'),
  ]);
  assert.deepEqual(scanMoney('5.00 USD 245.00 EGP 10.00 EUR 3 JPY', TABLE), [
    money(500, 'USD'),
    money(24500, 'EGP'),
    money(1000, 'EUR'),
    money(3, 'JPY'),
  ]);
});

/**
 * A HYPHEN BETWEEN A DIGIT AND A LETTER IS A REFERENCE, and the trailing-sign repair read it as a credit.
 *
 * Measured after that repair and with a declared currency, which is how `@braindog/record` wires this
 * function: `Payment ref 4417-B` returned `-441700`, `Card ending 1234-X` returned `-123400` and
 * `2026-Q3 fee` returned `-202600`. Before the repair each came back positive. The number itself was
 * always spurious, because a declared currency lets any bare figure in the slice be read as an amount,
 * but the sign was not: a charge now files itself as a refund, and that is the same inversion the
 * trailing-sign test was written to stop, arriving from the other direction.
 *
 * NO STATEMENT WRITES A SIGN AGAINST A LETTER. SAP and the COBOL picture put the trailing minus at the
 * end of the field, so what follows it is the end of the string, a space or a bracket, and the two forms
 * the repair set out to read, `1,250.00-` and `1,250.00- EGP`, both still read. Reference numbers with a
 * letter suffix are ordinary in the same documents, so the letter is the tell.
 */
test('A HYPHEN BEFORE A LETTER IS A REFERENCE AND NOT A SIGN', () => {
  assert.equal(parseMoney('Payment ref 4417-B', TABLE, 'EGP')?.amount, 441700);
  assert.equal(parseMoney('Card ending 1234-X', TABLE, 'EGP')?.amount, 123400);
  assert.equal(parseMoney('2026-Q3 fee', TABLE, 'EGP')?.amount, 202600);

  /* And the shapes the trailing sign was added for are untouched. */
  assert.deepEqual(parseMoney('EGP 1,250.00-', TABLE), money(-125000, 'EGP'));
  assert.deepEqual(parseMoney('1,250.00- EGP', TABLE), money(-125000, 'EGP'));
  assert.deepEqual(parseMoney('(EGP 1,250.00-)', TABLE), money(-125000, 'EGP'));
});

/**
 * A DATE NEVER TAKES THE CURRENCY, and its first field did.
 *
 * The tokenizer refuses every field of a date but the first, because only the later ones have a digit behind
 * the slash. So the `14` of `14/08/2026` was a figure, and in `Amount 120.00 EGP 14/08/2026` it took as its
 * prefix the `EGP` the real amount had already read as its suffix: EGP 14.00 beside EGP 120.00. The year of an
 * ISO date and the hour of a time start the same way, so `scanMoney` now skips all three.
 *
 * READ LEFT TO RIGHT, as before. The amount keeps the code it found first, and a code between two real
 * figures still reads for both, which `5.00 EGP 245.00` above pins and HSBC Egypt's `From HSBC:` line needs.
 */
test('A DATE NEVER TAKES THE CURRENCY, not its day, not its year and not its hour', () => {
  assert.deepEqual(scanMoney('Amount 120.00 EGP 14/08/2026', TABLE), [money(12000, 'EGP')]);
  assert.deepEqual(scanMoney('Amount 120.00 EGP 14/08/2026', TABLE, 'USD'), [money(12000, 'EGP')], 'nor the fallback');
  assert.deepEqual(scanMoney('Amount 120.00 EGP 2026-08-14', TABLE), [money(12000, 'EGP')], 'the ISO year');
  assert.deepEqual(scanMoney('EGP 120.00 on 14/08/2026 16:42', TABLE, 'EGP'), [money(12000, 'EGP')], 'the hour');
  /* With a declared currency the day came first and was the answer, ahead of the amount the line was about. */
  assert.deepEqual(parseMoney('on 29/08/26 EGP 5.00', TABLE, 'USD'), money(500, 'EGP'));
});

/**
 * A SPACE AFTER A POINT ENDS THE FIGURE, so two figures side by side are two tokens.
 *
 * `USD 5.00 6.00` was one token holding a point, a space and a point, which no shape reads, so the USD 5.00
 * written plainly at its start was lost with it. A space still groups where nothing else has: `1 250,00` is
 * one figure, and a card number printed in fours is one figure no shape reads rather than four amounts.
 */
test('A FIGURE AFTER A FINISHED FIGURE IS A SECOND FIGURE', () => {
  assert.deepEqual(scanMoney('USD 5.00 6.00', TABLE), [money(500, 'USD')]);
  assert.deepEqual(scanMoney('USD 5.00 6.00', TABLE, 'EGP'), [money(500, 'USD'), money(600, 'EGP')]);
  assert.deepEqual(scanMoney('1 250,00 EUR', TABLE), [money(125000, 'EUR')]);
  assert.deepEqual(scanMoney('card 4471 1234 5678 9012', TABLE, 'EGP'), []);
});
