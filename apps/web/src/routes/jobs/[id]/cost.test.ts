/** A job's cost: one cent, the runner's "a fraction of a cent", reads "under $0.01"; every other figure is money. */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { costWords } from './cost.ts';

test('one minor unit reads under the smallest coin', () => {
  assert.equal(costWords(1, 'USD', 'USD'), 'under $0.01');
  assert.equal(costWords(1, 'EUR', 'EUR'), 'under €0.01');
});

test('any other figure is drawn as money', () => {
  assert.equal(costWords(124, 'USD'), null);
  assert.equal(costWords(2, 'USD'), null);
  assert.equal(costWords(0, 'USD'), null);
});

test('the job page says the words when there are some, and Money otherwise', () => {
  const page = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
  assert.match(page, /import \{ costWords \} from '\.\/cost\.ts'/);
  assert.match(page, /costWords\(row\.cost_minor, row\.cost_currency\)/);
});
