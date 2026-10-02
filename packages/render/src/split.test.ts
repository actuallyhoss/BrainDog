import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SPLIT_ZERO, splitPlan, splitSentence } from './split.ts';
import { parse } from './parse.ts';
import { toHTML } from './html.ts';

test('a split cuts the track by share, in neutral steps, with a hairline where two parts meet', () => {
  const plan = splitPlan([600, 300, 100]);
  assert.equal(plan.empty, false);
  assert.deepEqual(
    plan.parts.map((p) => [p.at, p.x, p.width, p.step, p.share]),
    [
      [0, '0', '600', 0, '60%'],
      [1, '600', '300', 1, '30%'],
      [2, '900', '100', 2, '10%'],
    ],
  );
  assert.equal(plan.cuts, 'M600 0V100 M900 0V100');
  assert.equal(splitSentence([{ label: 'Rent', share: '60%' }, { label: '', share: '40%' }]), 'Rent 60%, Part 40%');
});

test('a fifth part shares the last step, and a sliver says under one per cent rather than zero', () => {
  const plan = splitPlan([1000, 1, 1, 1, 1]);
  assert.deepEqual(plan.parts.map((p) => p.step), [0, 1, 2, 3, 3]);
  assert.equal(plan.parts[1]?.share, '<1%');
});

test('A PART WITH NO NUMBER, ZERO OR LESS IS NOT A PART, and a hole is never one', () => {
  const plan = splitPlan([Number.NaN, 0, -5, 50, 50], [false, false, false, false, true]);
  assert.deepEqual(plan.parts.map((p) => [p.at, p.width]), [[3, '1000']]);
  assert.equal(plan.cuts, '', 'one part has nowhere to cut');
  assert.equal(splitPlan([0, 0]).empty, true);
  assert.equal(splitPlan([]).empty, true);
});

const SPLIT = '```split | Where it goes\nPayroll | GBP 6,000.00 | 4 people\nRent | GBP 3,000.00 |  | warn\nTools | GBP 1,000.00\nUncategorised | GBP 900.00 | 12 rows | hole\n```';

test('A SPLIT DRAWS A TRACK NAMED BY ITS SHARES, a legend that prints every figure, and the hole after it', () => {
  const html = toHTML(parse(SPLIT));
  assert.match(html, /<svg class="split-track" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label="Payroll 60%, Rent 30%, Tools 10%">/u);
  assert.match(html, /<rect class="split-seg" data-step="1" data-intent="warn" x="600" y="0" width="300" height="100"><\/rect>/u);
  assert.match(html, /<li class="split-item"><span class="split-dot" data-step="0" aria-hidden="true"><\/span><span class="split-label">Payroll<\/span><span class="split-value num">£6,000<\/span><span class="split-share num">60%<\/span><span class="split-note">4 people<\/span><\/li>/u);
  assert.match(html, /<td>GBP 6,000\.00<\/td>|>GBP 6,000\.00</u, 'the fold of numbers keeps every penny');
  assert.ok(html.indexOf('split-legend') < html.indexOf('split-hole'), 'the hole sits after the legend');
  assert.match(html, /<div class="split-hole" data-hole data-intent="warn">/u, 'no host, no button');
  assert.match(toHTML(parse(SPLIT), { hole: true }), /<button type="button" class="split-hole" data-hole data-intent="warn">/u);
  assert.doesNotMatch(html, /style=/u);
  assert.match(toHTML(parse('```split\nIn | £90\nRefunds | −£40.00\n```')), /aria-label="In 100%"/u, 'a credit written with a symbol is not a part');
});

test('all zero, the track is a sentence and the figures are still printed', () => {
  const html = toHTML(parse('```split\nA | 0\nB | 0\n```'));
  assert.match(html, new RegExp(`<p class="split-empty">${SPLIT_ZERO}</p>`, 'u'));
  assert.doesNotMatch(html, /<svg/u);
  assert.match(html, /<span class="split-label">B<\/span><span class="split-value num">0<\/span>/u);
});

test('A SPLIT PUTS ITS NUMBERS IN A FOLD: each part, its figure and its share, and a row that is no part has no share', () => {
  const html = toHTML(parse('```split\nRent | 300\n | 100\nTools | pending\nUncategorised | 50 | 2 rows | hole\n```'));
  const fold = /<div class="split-numbers">[\s\S]*<\/table><\/div>/u.exec(html)?.[0] ?? '';
  assert.doesNotMatch(html, /The numbers/u);
  assert.match(fold, /<div class="split-numbers"><table class="split-table"><thead><tr><th scope="col">Part<\/th><th scope="col">Amount<\/th><th scope="col">Share<\/th><\/tr><\/thead>/u);
  assert.match(fold, /<tr><th scope="row">Rent<\/th><td class="num">300<\/td><td class="num">75%<\/td><\/tr>/u);
  assert.match(fold, /<tr><th scope="row">Part<\/th><td class="num">100<\/td><td class="num">25%<\/td><\/tr>/u, 'an unnamed part is still a row head');
  assert.match(fold, /<tr><th scope="row">Tools<\/th><td class="num">pending<\/td><td class="num">—<\/td><\/tr>/u);
  assert.match(fold, /<tr><th scope="row">Uncategorised<\/th><td class="num">50<\/td><td class="num">—<\/td><\/tr><\/tbody>/u, 'the hole comes last and is not a part');
});
