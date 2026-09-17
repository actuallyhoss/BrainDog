import { test } from 'node:test';
import assert from 'node:assert/strict';

import { progressPlan, progressSentence } from './progress.ts';
import { parse } from './parse.ts';
import { toHTML } from './html.ts';
import { KINDS } from './kinds.ts';

test('a goal fills toward its target, says what is left, and is good only once reached', () => {
  const [half, done, none, blank] = progressPlan([
    { value: '£1,200.00', target: '£3,000.00' },
    { value: '£3,100.00', target: '£3,000.00' },
    { value: '£10.00', target: '' },
    { value: '', target: '7' },
  ]);
  assert.deepEqual([half!.fill, half!.share, half!.intent, half!.left], ['0.40', '40%', undefined, '£1,800.00 to go']);
  assert.deepEqual([done!.fill, done!.intent, done!.left], ['1.00', 'good', 'Reached']);
  assert.equal(none!.drawable, false);
  assert.deepEqual([blank!.fill, blank!.share, blank!.left], ['0.00', '0%', '7 to go']);
});

test('a budget is quiet under nine tenths, a watch from there, and bad past the limit with the overspend marked', () => {
  const [quiet, near, over] = progressPlan(
    [
      { value: 'GBP 150.00', target: 'GBP 300.00' },
      { value: 'GBP 280.00', target: 'GBP 300.00' },
      { value: 'GBP 400.00', target: 'GBP 300.00' },
    ],
    'budget',
  );
  assert.deepEqual([quiet!.intent, quiet!.left, quiet!.limit], [undefined, 'GBP 150.00 left', null]);
  assert.equal(near!.intent, 'warn');
  assert.deepEqual([over!.fill, over!.limit, over!.intent, over!.left, over!.share], ['1.00', '0.75', 'bad', 'GBP 100.00 over', '133%']);
  assert.equal(progressPlan([{ value: '1', target: '2', tone: 'info' }], 'budget')[0]!.intent, 'info', 'a tone the host wrote wins');
});

test('the fence reads the budget form and a note, and draws a track, the share and the fold', () => {
  assert.equal(KINDS.progress.primitive, 'proportional');
  const [block] = parse('```progress budget | Spending\nGroceries | £212.40 | £300.00 | this month\nEating out | £140.00 | £120.00\n```');
  assert.equal(block?.type, 'block');
  assert.equal(block?.type === 'block' ? block.form : null, 'budget');
  const html = toHTML(parse('```progress budget | Spending\nGroceries | £212.40 | £300.00 | this month\nEating out | £140.00 | £120.00\n```'));
  assert.match(html, /<div class="prop progress" data-form="budget">/u);
  assert.match(html, /style="--fill:0\.71"/u);
  assert.match(html, /<span class="progress-over" style="--limit:0\.86"><\/span>/u);
  assert.match(html, /£20\.00 over/u);
  assert.match(html, /<span class="progress-note">this month<\/span>/u);
  assert.match(html, /<details class="progress-numbers">/u);
  assert.equal(progressSentence('Bike', '3', '7', '43%'), 'Bike: 3 of 7, 43%');
});
