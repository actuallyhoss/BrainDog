/**
 * A headline's money: whole amounts without `.00`, one mark of currency, and a ledger's figures left exact.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { axisFigure, barFigure, figureChars, headlineFigure, headlineMoney, leadingCode, money, symbolFigure, symbolText, totalSaid } from './format.ts';
import { figureLike } from './figure.ts';
import { AMOUNT_SPACE, amountsIn, readAmount, writeAmount, type AmountSetting } from './money.ts';

test('A HEADLINE SAYS A WHOLE AMOUNT WITHOUT ITS ZEROS, and keeps a fraction under a thousand', () => {
  assert.equal(headlineFigure(money(3_385_000, 'GBP')), '£33,850');
  assert.equal(headlineFigure(money(41_230_000, 'EGP')), 'EGP 412,300', 'a currency with no symbol keeps its code in front');
  /* A TOTAL IS WHOLE FROM A THOUSAND UP AND TO THE CENT UNDER IT (d9bab2403), half a unit away from nought. */
  assert.equal(headlineFigure(money(3_385_050, 'GBP')), '£33,851');
  assert.equal(headlineFigure(money(3_385_049, 'GBP')), '£33,850');
  assert.equal(headlineFigure(money(-3_385_050, 'GBP')), '−£33,851');
  assert.equal(headlineFigure(money(99_950, 'GBP')), '£999.50', 'under a thousand a fraction that is part of the amount stays');
  assert.equal(headlineFigure(money(-129_900, 'GBP')), '−£1,299');
  assert.equal(headlineFigure(money(-129_900, 'EGP')), 'EGP −1,299');
  assert.equal(headlineFigure(money(1_299, 'JPY')), '¥1,299', 'a currency with no minor unit has nothing to drop');
  assert.equal(headlineFigure(money(1_500, 'KWD')), 'KWD 1.500', 'three places that are not all zeros stay');
  assert.equal(headlineFigure(money(1_000_000, 'CLF')), 'CLF 100');
  assert.equal(headlineMoney(3_385_000, 'GBP'), '£33,850');
  assert.equal(headlineMoney(0.5, 'GBP'), '—', 'a fractional minor unit is still no figure');
});

test('A HEADLINE NEVER SAYS A CURRENCY TWICE: a symbol with its code after it is said by the code', () => {
  assert.equal(headlineFigure('$4,800.00 USD'), '$4,800');
  assert.equal(headlineFigure('E£43,700.00 EGP'), 'EGP 43,700');
  assert.equal(headlineFigure('−$39.50 USD'), '−$39.50');
  assert.equal(headlineFigure('£24,800.00'), '£24,800', 'a symbol alone is kept as written');
  assert.equal(headlineFigure('+GBP 850.00'), '+£850', 'a sign written for money in stays in front');
});

test('SEVERAL AMOUNTS ARE EACH SAID AS A HEADLINE, and what is not money comes back as written', () => {
  assert.equal(headlineFigure('EGP 43,700.00 · GBP 24,800.00'), 'EGP 43,700 · £24,800');
  assert.equal(headlineFigure('EGP 43,700.00 · GBP 24,800.50'), 'EGP 43,700 · £24,801');
  for (const text of ['2026', '1,200', '1,200.50', '4.00', '41 days', '3 Sep 2026', '—', '12%', 'Q3 −1,299.00', '']) assert.equal(headlineFigure(text), text);
});

test('A LEDGER STAYS EXACT: money, symbolFigure and a sentence not marked as a headline keep every minor unit', () => {
  assert.equal(money(3_385_000, 'GBP'), 'GBP 33,850.00');
  assert.equal(symbolFigure(money(3_385_000, 'GBP')), '£33,850.00');
  /* Every digit, past sixteen of them: money is placed by slicing its digits, never divided into a float (and
     the edge cases in format-zone.test.ts). */
  assert.equal(money('900719925474099312', 'JPY'), 'JPY 900,719,925,474,099,312');
  assert.equal(symbolFigure(money(900_719_925_474_099_312n, 'GBP')), '£9,007,199,254,740,993.12');
  assert.equal(symbolText('Cash is GBP 33,850.00 across 2 accounts'), 'Cash is £33,850.00 across 2 accounts');
  assert.equal(symbolText('Cash is GBP 33,850.00 and EGP 412,300.00', true), 'Cash is £33,850 and EGP 412,300');
});

test('A FIGURE A HOST DREW WITH ITS CODE AFTER A NO-BREAK SPACE IS STILL ONE FIGURE, and says its currency once', () => {
  /* The web's money drawer writes `£24,000.00` and `GBP` with U+00A0 between, so a line never breaks inside an amount;
     read only with a plain space, every such figure kept its `.00` and its code on tiles and on the forecast's axis. */
  assert.equal(headlineFigure('£24,000.00\u00a0GBP'), '£24,000');
  assert.equal(headlineFigure('−£39.00\u202fGBP'), '−£39');
  assert.equal(axisFigure('£31,035.00\u00a0GBP'), '£31k');
  assert.equal(axisFigure('$4,800.00 USD'), '$4.8k', 'an axis says one mark of currency too');
  assert.equal(barFigure('£11,200.00\u00a0GBP'), '£11,200');
});

test('A HEADLINE SENTENCE SAYS SHORT WHAT A HOST ALREADY DREW, and a sentence not marked a headline keeps it exact', () => {
  const said = 'Bills past their due date: £10,540.00\u00a0GBP still to pay, and −£39.00 GBP on one.';
  assert.equal(symbolText(said, true), 'Bills past their due date: £10,540 still to pay, and −£39 on one.');
  assert.equal(symbolText(said), said);
  assert.equal(symbolText('Invoice 2026-041 for £4,800.50 GBP', true), 'Invoice 2026-041 for £4,801', 'whole from a thousand up');
  assert.equal(symbolText('Invoice 2026-041 for £800.50 GBP', true), 'Invoice 2026-041 for £800.50', 'a fraction under a thousand stays');
  assert.equal(symbolText('Q3£ 12 GBP', true), 'Q3£ 12 GBP', 'nothing that is not a figure is touched');
});

test('three capitals after a figure are a code only when they are a currency: an ISA or a bill keeps its words', () => {
  assert.equal(symbolText('Top up £200 ISA before April?', true), 'Top up £200 ISA before April?');
  assert.equal(symbolText('Pay the £120.00 EDF bill, and £39.00 GBP to Bupa', true), 'Pay the £120.00 EDF bill, and £39 to Bupa');
  assert.equal(headlineFigure('£5 USB'), '£5 USB');
  assert.equal(barFigure('£2,000 ISA'), '£2,000 ISA');
  assert.equal(axisFigure('£2,000 ISA'), '£2,000 ISA');
  assert.equal(headlineFigure('£24,000.00 GBP'), '£24,000', 'a real code is still read');
});

/* ---- One writer: told the home currency, each old function says what `writeAmount` says ---------------- */

const AMOUNTS: [number, string][] = [
  [108_621_341, 'EGP'], [5_818_500, 'EGP'], [-49_726, 'EGP'], [294_795, 'USD'], [-1_200, 'USD'], [480_000, 'USD'],
  [3_124_055, 'GBP'], [120_000, 'CHF'], [-120_050, 'CHF'], [1_299, 'JPY'], [1_500, 'KWD'], [0, 'USD'], [0, 'EGP'],
];
const HOMES = ['EGP', 'USD', null] as const;
const written = (minor: number, currency: string, home: string | null, setting: AmountSetting): string => writeAmount({ minor, currency }, home, setting)!.text;

test('TOLD THE HOME CURRENCY, EACH OLD FUNCTION WRITES WHAT THE ONE WRITER WRITES: exact, read and axis, at home in pounds and in dollars', () => {
  for (const home of HOMES) {
    for (const [minor, currency] of AMOUNTS) {
      const stored = money(minor, currency);
      const said = `${stored} at home in ${home}`;
      assert.equal(symbolFigure(stored, home), written(minor, currency, home, 'exact'), said);
      /* A HEADLINE IS THE WRITER'S, THEN SAID AS A TOTAL (d9bab2403): a bar's and the writer's own keep the cents. */
      assert.equal(headlineFigure(stored, home), totalSaid(written(minor, currency, home, 'read')), said);
      assert.equal(barFigure(stored, home), written(minor, currency, home, 'read'), said);
      assert.equal(axisFigure(stored, home), written(minor, currency, home, 'axis'), said);
      assert.equal(headlineMoney(minor, currency, home), totalSaid(written(minor, currency, home, 'read')), said);
      for (const setting of ['exact', 'read', 'axis'] as const) {
        const w = writeAmount({ minor, currency }, home, setting)!;
        const coded = leadingCode(stored, home, setting)!;
        assert.equal(coded.text, w.text, `${said}, ${setting}`);
        assert.equal(coded.place, w.codePlace, `${said}, ${setting}`);
        assert.equal(coded.currency, w.code, `${said}, ${setting}`);
        /* The parts a screen sets apart are the whole of the text: nothing is drawn that the writer did not write. */
        const joined = coded.place === 'before' ? `${coded.sign}${coded.currency}${AMOUNT_SPACE}${coded.rest}` : coded.place === 'after' ? `${coded.sign}${coded.rest}${AMOUNT_SPACE}${coded.currency}` : `${coded.sign}${coded.rest}`;
        assert.equal(joined, w.text, `${said}, ${setting}`);
      }
    }
  }
});

test('THE RULE AS A PERSON READS IT, through the old names: at home by its sign, another currency by its own sign, a true minus in front', () => {
  /* The dollar and sterling, whose signs nobody disputes. How the Egyptian pound is written is the writer's one
     table and the person's to rule, so it is held above only to what the writer says, never to a spelling here. */
  assert.equal(symbolFigure(money(108_621_341, 'GBP'), 'GBP'), '£1,086,213.41');
  assert.equal(symbolFigure(money(294_795, 'USD'), 'EGP'), '$2,947.95');
  assert.equal(symbolFigure(money(294_795, 'USD'), 'USD'), '$2,947.95');
  assert.equal(symbolFigure(money(-7_361_527, 'USD'), 'USD'), '−$73,615.27');
  assert.equal(symbolFigure(money(-120_000, 'CHF'), 'EGP'), `−CHF${AMOUNT_SPACE}1,200.00`, 'a currency with no sign keeps its code, and the minus stands in front of it');
  assert.equal(headlineFigure(money(5_818_500, 'USD'), 'USD'), '$58,185');
  assert.equal(headlineFigure(money(5_818_550, 'USD'), 'USD'), '$58,186', 'whole from a thousand up');
  assert.equal(headlineFigure(money(81_850, 'USD'), 'USD'), '$818.50', 'a fraction under a thousand stays');
  assert.equal(barFigure(money(480_000, 'USD'), 'EGP'), '$4,800');
  assert.equal(axisFigure(money(3_124_055, 'GBP'), 'GBP'), '£31k');
  assert.equal(axisFigure(money(800_000_000, 'USD'), 'USD'), '$8m');
  assert.equal(headlineFigure('GBP 43,700.00 · USD 24,800.50', 'GBP'), '£43,700 · $24,801', 'several amounts are each written once');
  for (const home of HOMES) {
    assert.equal(figureChars(money(108_621_341, 'EGP'), home), written(108_621_341, 'EGP', home, 'exact').length, 'a tile measures the figure as it is drawn');
  }
});

test('A SENTENCE TOLD THE HOME CURRENCY has every stored amount in it written by the one writer', () => {
  const said = 'Rent of EGP 12,000.00 is due, and USD 39.50 to the host';
  for (const home of HOMES) {
    assert.equal(symbolText(said, false, home), amountsIn(said, home, 'exact'));
    assert.equal(symbolText(said, true, home), amountsIn(said, home, 'read'));
  }
  assert.equal(symbolText('Rent of USD 12,000.00 is due, and GBP 39.50 to the host', true, 'USD'), 'Rent of $12,000 is due, and £39.50 to the host');
});

test('WHAT IS NOT A STORED AMOUNT IS NOT READ AS ONE: told the home currency, a drawing and a bare number keep the path they had', () => {
  for (const home of ['EGP', 'USD']) {
    for (const text of ['2026', '1,200', '41 days', '—', '12%', 'Q3 −1,299.00', '', 'EGP 1,299']) {
      assert.equal(headlineFigure(text, home), headlineFigure(text), text);
      assert.equal(barFigure(text, home), barFigure(text), text);
      assert.equal(axisFigure(text, home), axisFigure(text), text);
      assert.equal(symbolFigure(text, home), symbolFigure(text), text);
    }
    assert.equal(leadingCode('no figure', home), null);
  }
  assert.equal(headlineMoney(0.5, 'GBP', 'EGP'), '—', 'a fractional minor unit is still no figure');
});

test('A COMPUTED FIGURE IN THE SHAPE OF A STORED ONE is read once and written once, and a plain number keeps its path', () => {
  /* Not told the home currency, it answers the stored form, so whoever draws it next reads an amount and not a drawing. */
  assert.equal(figureLike('USD 12.00', -1234.567), 'USD −1,234.57');
  assert.equal(figureLike('GBP 4,800.00', 0), 'GBP 0.00');
  assert.equal(figureLike('JPY 1,299', 31_240.4), 'JPY 31,240');
  assert.deepEqual(readAmount(figureLike('EGP 12.00', 31_240.55)), { minor: 3_124_055n, currency: 'EGP' });
  for (const home of HOMES) {
    for (const setting of ['exact', 'read', 'axis'] as const) {
      assert.equal(figureLike('EGP 12.00', -73_615.27, home, setting), written(-7_361_527, 'EGP', home, setting));
      assert.equal(figureLike('USD 12.00', 2_947.95, home, setting), written(294_795, 'USD', home, setting));
    }
    assert.equal(axisFigure(figureLike('EGP 12.00', 31_240.55), home), written(3_124_055, 'EGP', home, 'axis'), 'the chain a chart draws its axis with');
    assert.equal(figureLike('1,200', 3400.4, home), '3,400');
    assert.equal(figureLike('no number', 12.5, home), '12.5');
    assert.equal(figureLike('£34,850.00', -2000, home), '−£2,000.00', 'a drawing is not read as an amount');
  }
  assert.equal(figureLike('EGP 12.00', Number.NaN, 'EGP'), '—');
});
