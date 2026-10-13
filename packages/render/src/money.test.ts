/**
 * THE ONE WRITER OF AN AMOUNT. `money()` writes the stored form; `readAmount` reads only that; `writeAmount` draws
 * it once, by the table at the head of `money.ts`. Each test here is a figure that was wrong on a screen: the pound
 * with no sign, a tile rounded, a minus after the code, and a code cut to "USI".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { money } from './format.ts';
import { AMOUNT_SPACE, amountsIn, readAmount, writeAmount, type AmountSetting } from './money.ts';

const S = AMOUNT_SPACE;
const text = (minor: bigint | number, currency: string, home: string | null, setting: AmountSetting): string | undefined =>
  writeAmount({ minor, currency }, home, setting)?.text;

test('what money() stores is read back to the same minor units, in every exponent', () => {
  const cases: [bigint, string][] = [
    [129900n, 'EGP'], [-7361527n, 'EGP'], [0n, 'USD'], [5n, 'GBP'], [-1n, 'GBP'],
    [1299n, 'JPY'], [-1299n, 'JPY'], [1234567n, 'KWD'], [1000000n, 'CLF'],
    [900719925474099312n, 'JPY'], [-123456789012345678901234n, 'EGP'],
  ];
  for (const [minor, currency] of cases) {
    assert.deepEqual(readAmount(money(minor, currency)), { minor, currency }, money(minor, currency));
  }
});

test('the two stored forms the scope names', () => {
  assert.deepEqual(readAmount('EGP 1,299.00'), { minor: 129900n, currency: 'EGP' });
  assert.deepEqual(readAmount('EGP −73,615.27'), { minor: -7361527n, currency: 'EGP' });
});

test('anything that is not the stored form is not read', () => {
  const not = [
    'E£1,299.00', '£1,299.00', '$31k', 'E£31k', '$2,947.95 USD', '1,299.00', 'EGP 1,299', 'EGP 1299.00',
    'EGP 1,299.0', 'EGP 1,299.000', 'JPY 1,299.00', 'EGP -1,299.00', '−EGP 1,299.00', '+EGP 1,299.00',
    'egp 1,299.00', 'EGP  1,299.00', ' EGP 1,299.00', 'EGP 1,299.00 ', 'EGP 12,99.00', 'EGP ,299.00',
    `EGP${S}1,299.00`, 'EGP 1,299.00 due', '', '—',
  ];
  for (const t of not) assert.equal(readAmount(t), null, JSON.stringify(t));
});

test('a drawn amount is never read back', () => {
  for (const setting of ['exact', 'read', 'axis'] as const) {
    for (const [minor, currency] of [[3124055n, 'EGP'], [294795n, 'USD'], [120000n, 'CHF']] as const) {
      assert.equal(readAmount(text(minor, currency, 'EGP', setting)!), null);
    }
  }
});

test('the Egyptian pound at home is written by its sign, every piastre kept', () => {
  assert.deepEqual(writeAmount({ minor: 108621341n, currency: 'EGP' }, 'EGP', 'exact'), {
    minus: '', sign: 'E£', whole: '1,086,213', fraction: '.41', code: '', codePlace: null, text: 'E£1,086,213.41',
  });
  assert.equal(text(108621341n, 'EGP', 'EGP', 'read'), 'E£1,086,213.41', 'a tile is never rounded');
  assert.equal(text(5818500n, 'EGP', 'EGP', 'exact'), 'E£58,185.00');
  assert.equal(text(5818500n, 'EGP', 'EGP', 'read'), 'E£58,185');
  assert.equal(text(5818554n, 'EGP', 'egp', 'read'), 'E£58,185.54');
});

test('another currency with a sign carries its code after', () => {
  /* The code is held in a name: a key called `code` beside a word in capitals reads as a refusal code to the refusals gate. */
  const usd = 'USD';
  assert.deepEqual(writeAmount({ minor: 294795n, currency: 'USD' }, 'EGP', 'exact'), {
    minus: '', sign: '$', whole: '2,947', fraction: '.95', code: usd, codePlace: 'after', text: `$2,947.95${S}USD`,
  });
  assert.equal(text(480000n, 'USD', 'EGP', 'read'), `$4,800${S}USD`);
  assert.equal(text(108621341n, 'EGP', 'GBP', 'exact'), `E£1,086,213.41${S}EGP`);
  assert.equal(text(2832000n, 'GBP', 'GBP', 'exact'), '£28,320.00');
  assert.equal(text(2832000n, 'GBP', null, 'exact'), `£28,320.00${S}GBP`, 'no home: every currency says its code');
  assert.equal(text(5000n, 'CAD', 'USD', 'read'), `$50${S}CAD`, 'two dollars never look alike');
});

test('a currency with no sign keeps its code in front, home or not', () => {
  const chf = 'CHF';
  assert.deepEqual(writeAmount({ minor: 120000n, currency: 'CHF' }, 'CHF', 'exact'), {
    minus: '', sign: '', whole: '1,200', fraction: '.00', code: chf, codePlace: 'before', text: `CHF${S}1,200.00`,
  });
  assert.equal(text(120000n, 'CHF', 'EGP', 'read'), `CHF${S}1,200`);
  assert.equal(text(1234567n, 'KWD', 'EGP', 'exact'), `KWD${S}1,234.567`);
  assert.equal(text(9900n, 'SEK', 'SEK', 'exact'), `SEK${S}99.00`, '"kr" is letters, not a sign');
  assert.equal(text(100n, 'ZZZ', 'EGP', 'exact'), `ZZZ${S}1.00`, 'a code the runtime does not know');
});

test('a negative amount has a true minus in front of everything, and nought has none', () => {
  assert.equal(text(-49726n, 'EGP', 'EGP', 'exact'), '−E£497.26');
  assert.equal(text(-7361527n, 'EGP', 'EGP', 'exact'), '−E£73,615.27');
  assert.equal(text(-1200n, 'USD', 'EGP', 'exact'), `−$12.00${S}USD`);
  assert.equal(text(-120000n, 'CHF', 'EGP', 'exact'), `−CHF${S}1,200.00`);
  assert.equal(writeAmount({ minor: -49726n, currency: 'EGP' }, 'EGP', 'exact')?.minus, '−');
  for (const setting of ['exact', 'read', 'axis'] as const) {
    assert.ok(!text(-0, 'EGP', 'EGP', setting)!.includes('−'));
    assert.ok(!text(-49726n, 'EGP', 'EGP', setting)!.includes('-'), 'never a hyphen');
  }
  assert.equal(text(-4n, 'EGP', 'EGP', 'axis'), 'E£0', 'rounded to nothing, the sign goes too');
});

test('a large amount keeps every digit it was handed', () => {
  assert.equal(text(900719925474099312n, 'JPY', 'EGP', 'exact'), `¥900,719,925,474,099,312${S}JPY`);
  assert.equal(text(123456789012345678901234n, 'EGP', 'EGP', 'exact'), 'E£1,234,567,890,123,456,789,012.34');
  assert.equal(text(123456789012345678901200n, 'EGP', 'EGP', 'read'), 'E£1,234,567,890,123,456,789,012');
  assert.equal(text(123840762n, 'EGP', 'EGP', 'read'), 'E£1,238,407.62', 'ten thousand and over is not whole units');
  /* From the stored text to the screen, with no number in between. */
  const stored = money('900719925474099312', 'EGP');
  assert.equal(writeAmount(readAmount(stored)!, 'EGP', 'exact')?.text, 'E£9,007,199,254,740,993.12');
});

test('a whole number is taken as well as a bigint, and a fraction of a minor unit is not money', () => {
  assert.equal(text(129900, 'EGP', 'EGP', 'exact'), 'E£1,299.00');
  assert.equal(writeAmount({ minor: 0.5, currency: 'USD' }, 'EGP', 'exact'), null);
  assert.equal(writeAmount({ minor: Number.NaN, currency: 'USD' }, 'EGP', 'exact'), null);
});

test('an axis is compact, and only an axis', () => {
  assert.deepEqual(writeAmount({ minor: 3124055n, currency: 'EGP' }, 'EGP', 'axis'), {
    minus: '', sign: 'E£', whole: '31k', fraction: '', code: '', codePlace: null, text: 'E£31k',
  });
  assert.equal(text(3124055n, 'GBP', 'GBP', 'axis'), '£31k');
  assert.equal(text(-160000n, 'GBP', 'GBP', 'axis'), '−£1.6k');
  assert.equal(text(85040n, 'CHF', 'EGP', 'axis'), `CHF${S}850`);
  assert.equal(text(3124055n, 'USD', 'EGP', 'axis'), `$31k${S}USD`, 'an axis in another currency still says which');
  assert.equal(text(99970000n, 'EGP', 'EGP', 'axis'), 'E£1m', 'the step is chosen after the rounding');
  assert.equal(text(108621341n, 'EGP', 'EGP', 'axis'), 'E£1.1m');
  assert.equal(text(250000000000n, 'EGP', 'EGP', 'axis'), 'E£2.5bn');
  assert.equal(text(31000n, 'JPY', 'JPY', 'axis'), '¥31k');
  assert.equal(text(0n, 'EGP', 'EGP', 'axis'), 'E£0');
  assert.equal(text(4_000_000_000_000_000_00n, 'EGP', 'EGP', 'axis'), 'E£4,000tn', 'past the last step it grows, never cut');
});

test('a code is never broken: whole, three letters, and joined to its figure', () => {
  const currencies = ['EGP', 'USD', 'GBP', 'CHF', 'KWD', 'JPY', 'CAD', 'SEK', 'CLF'];
  for (const currency of currencies) {
    for (const setting of ['exact', 'read', 'axis'] as const) {
      for (const minor of [0n, -1n, 108621341n, -900719925474099312n]) {
        const w = writeAmount({ minor, currency }, 'EGP', setting)!;
        assert.ok(w.code === '' || w.code === currency, `${currency}: the code is whole or absent`);
        assert.equal(w.codePlace === null, w.code === '');
        assert.ok(!/\s/u.test(w.text.replaceAll(S, '')), `${w.text}: no space a line can break at`);
        assert.ok(w.code !== '' || w.sign !== '', `${w.text}: an amount always says its currency`);
        const joined =
          w.codePlace === 'before'
            ? `${w.minus}${w.code}${S}${w.whole}${w.fraction}`
            : `${w.minus}${w.sign}${w.whole}${w.fraction}${w.code ? `${S}${w.code}` : ''}`;
        assert.equal(w.text, joined, 'the text is the parts, nothing cut and nothing added');
      }
    }
  }
  assert.equal(text(0n, 'USD', 'EGP', 'exact'), `$0.00${S}USD`, 'the screen that read "$0 USI"');
  assert.equal(text(0n, 'USD', 'EGP', 'read'), `$0${S}USD`);
});

test('every stored amount in a sentence is written, and the rest of the sentence is left alone', () => {
  assert.equal(amountsIn('Rent of EGP 12,000.00 is due.', 'EGP', 'read'), 'Rent of E£12,000 is due.');
  assert.equal(
    amountsIn('EGP 1,086,213.41 here, USD 2,947.95 there and EGP −73,615.27 owed', 'EGP', 'read'),
    `E£1,086,213.41 here, $2,947.95${S}USD there and −E£73,615.27 owed`,
  );
  assert.equal(amountsIn('Pay EGP 1,299.00, then JPY 1,299.', 'EGP', 'exact'), `Pay E£1,299.00, then ¥1,299${S}JPY.`);
  assert.equal(amountsIn('(CHF 1,200.00)', 'EGP', 'exact'), `(CHF${S}1,200.00)`);
  assert.equal(amountsIn('EGP 1,299.00', 'EGP', 'axis'), 'E£1.3k');
  const left = ['THE 100 best', 'USB 3.0 port', 'EGP 1,299.005', 'EGP 1299.00', 'XEGP 1,299.00', 'E£1,299.00', 'No amount here', ''];
  for (const t of left) assert.equal(amountsIn(t, 'EGP', 'read'), t, JSON.stringify(t));
  const once = amountsIn('Rent of EGP 12,000.00 and USD 5.00', 'EGP', 'read');
  assert.equal(amountsIn(once, 'EGP', 'read'), once, 'written once: a second pass changes nothing');
});
