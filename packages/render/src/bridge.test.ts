import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BRIDGE_MIXED, BRIDGE_UNKNOWN, bridgeFigure, bridgePlan, bridgePlanOf, bridgeSentence, bridgeWritten, moveOf, signedOf } from './bridge.ts';
import { AMOUNT_SPACE, writeFigure } from './money.ts';
import { tableCellBody } from './table.ts';
import { parse } from './parse.ts';
import { toHTML } from './html.ts';

test('a sign in front of a symbol is the sign, and a hyphen inside a word is not', () => {
  assert.equal(signedOf('−£1,600.00'), -1600);
  assert.equal(signedOf('-GBP 20'), -20);
  assert.equal(signedOf('GBP −1,299.00'), -1299);
  assert.equal(signedOf('+£2,000'), 2000);
  assert.equal(signedOf('Late-fee 300'), 300);
  assert.ok(Number.isNaN(signedOf('nothing')));
});

test('A BRIDGE STANDS ITS START AND END ON ZERO and floats each movement from the level before it', () => {
  const plan = bridgePlan([100, 50, -30, 120]);
  assert.equal(plan.warn, null, 'these add up');
  assert.equal(plan.zero, null, 'nothing crosses zero');
  assert.deepEqual(
    plan.bars?.map((b) => [b.move, b.x, b.width, b.y, b.height, b.from, b.span]),
    [
      ['start', '50', '150', '33.33', '66.67', '0', '666.67'],
      ['up', '300', '150', '0', '33.33', '666.67', '333.33'],
      ['down', '550', '150', '0', '20', '800', '200'],
      ['end', '800', '150', '20', '80', '0', '800'],
    ],
  );
  assert.deepEqual([moveOf(0, 3, -5), moveOf(1, 3, -5), moveOf(1, 3, 0), moveOf(2, 3, 5)], ['start', 'down', 'up', 'end']);
});

test('ROWS THAT DO NOT ADD UP ARE SAID IN WORDS, and the bars are still drawn as written', () => {
  const plan = bridgePlan([9000, 2000, -1600, 9000]);
  assert.equal(plan.bars?.length, 4);
  assert.equal(plan.warn, 'These steps do not add up: the start and the movements come to 9,400, and the end says 9,000.');
});

test('a row with no number draws no bars and says why; under two rows there is nothing to walk', () => {
  assert.deepEqual(bridgePlan([10, Number.NaN, 10]), { bars: null, zero: null, warn: BRIDGE_UNKNOWN });
  assert.deepEqual(bridgePlan([10]), { bars: null, zero: null, warn: null });
  assert.equal(bridgePlan([0, 0]).bars, null, 'nothing but zero has no scale');
});

test('a walk that goes under zero draws the zero line', () => {
  const plan = bridgePlan([100, -300, -200]);
  assert.equal(plan.warn, null);
  assert.equal(plan.zero, '33.33');
  assert.equal(bridgeSentence([{ label: 'Start', value: '£100' }, { label: 'Out', value: '' }]), 'Start £100, Out —');
});

test('A BRIDGE IS A CHART NAMED BY ITS ROWS, then the rows as text with their inline bars hidden, then the warn line', () => {
  const html = toHTML(parse('```bridge | This month\nStart | £9,000\nComing in | +£2,000 | 5 invoices\nGoing out | −£1,600\nEnd of month | £9,000\n```'));
  assert.match(html, /<div class="prop bridge" style="--cells:4"><svg class="bridge-chart" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label="Start £9,000, Coming in \+£2,000, Going out −£1,600, End of month £9,000">/u);
  assert.match(html, /<li class="bridge-row" data-move="down"><span class="bridge-label">Going out<\/span><svg class="bridge-inline" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true"><rect class="bridge-bar" data-move="down" x="[\d.]+" y="0" width="[\d.]+" height="100"><\/rect><\/svg><span class="bridge-value num">−£1,600<\/span>/u);
  assert.match(html, /<p class="bridge-warn" data-intent="warn"><span class="glyph" role="img" aria-label="watch this">⚠︎<\/span>These steps do not add up/u);
  assert.equal(parse('```bridge\nA | 1 | n | good\n```')[0]?.type, 'degraded', 'a bridge row takes no tone');
});

test('A BRIDGE PUTS ITS NUMBERS IN A FOLD, a row for each step with its amount as written', () => {
  const html = toHTML(parse('```bridge\nStart | 100\nSomething | soon\nEnd | \n```'));
  assert.match(
    html,
    /<div class="bridge-numbers"><table class="bridge-table"><thead><tr><th scope="col">Step<\/th><th scope="col">Amount<\/th><\/tr><\/thead><tbody><tr><th scope="row">Start<\/th><td class="num">100<\/td><\/tr><tr><th scope="row">Something<\/th><td class="num">soon<\/td><\/tr><tr><th scope="row">End<\/th><td class="num">—<\/td><\/tr><\/tbody><\/table><\/div><\/div>/u,
  );
});

test('TOLD THE HOME, A BRIDGE WRITES EVERY FIGURE AS A TABLE CELL DOES, and not told it changes nothing', () => {
  const cells = ['EGP 9,000.00', '+USD 40.00', 'EGP −1,600.00', 'US$3.63', 'soon', ''];
  assert.deepEqual(
    cells.map((c) => bridgeFigure(c, 'EGP')),
    cells.map((c) => writeFigure(c, 'EGP', 'exact')?.text ?? c),
  );
  for (const c of cells) {
    const body = tableCellBody(c, 'EGP').body;
    if ('amount' in body && body.amount) assert.equal(bridgeFigure(c, 'EGP'), body.amount.text, `${c} is spelled as its table cell`);
  }
  assert.deepEqual(
    cells.map((c) => bridgeFigure(c, 'EGP')),
    [`EGP${AMOUNT_SPACE}9,000.00`, '+$40.00', `−EGP${AMOUNT_SPACE}1,600.00`, 'US$3.63', 'soon', ''],
  );
  assert.equal(bridgeFigure('USD 40.00', 'USD'), '$40.00', 'the home currency is said by its sign');
  assert.equal(bridgeFigure('USD 40.00', null), '$40.00', 'a record with no home says another currency by its own sign');
  assert.deepEqual(cells.map((c) => bridgeFigure(c)), cells, 'not told a home, every figure is as its cell wrote it');
  assert.equal(bridgeWritten('soon', 'EGP'), null);
});

test('TOLD THE HOME, THE BARS ARE READ FROM THE AMOUNT ITSELF, and two currencies are never added', () => {
  const one = ['EGP 9,000.00', '+EGP 2,000.00', 'EGP −1,600.00', 'EGP 9,400.00'];
  assert.deepEqual(bridgePlanOf(one, 'EGP'), bridgePlan([9000, 2000, -1600, 9400]));
  assert.deepEqual(bridgePlanOf(one.map((c) => bridgeFigure(c, 'EGP')), 'EGP'), bridgePlan([9000, 2000, -1600, 9400]), 'and from the figure as written');
  assert.deepEqual(bridgePlanOf(['$40.00 USD', '−$12.50 USD', '$27.50 USD'], 'EGP'), bridgePlan([40, -12.5, 27.5]));

  const two = ['EGP 9,000.00', '+USD 40.00', 'EGP −1,600.00', 'EGP 7,440.00'];
  assert.deepEqual(bridgePlanOf(two, 'EGP'), { bars: null, zero: null, warn: BRIDGE_MIXED });
  assert.deepEqual(bridgePlanOf(two), bridgePlan(two.map(signedOf)), 'not told a home, the plan is the one it always was');
  assert.deepEqual(bridgePlanOf(['Start 100', '20', '120'], 'EGP'), bridgePlan([100, 20, 120]), 'a cell that is not an amount is read as before');
  assert.deepEqual(bridgePlanOf(['EGP 100.00', '20', 'EGP 120.00'], 'EGP'), bridgePlan([100, 20, 120]), 'a bare number beside one currency is a step in it');
});
