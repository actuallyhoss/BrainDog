/** `page-lists.ts`: a page names its figures first, then each list a block reads, the questions, and the runs. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { QUESTIONS } from '../data/local.ts';
import { PAGE_FIGURES, pageLists } from './page-lists.ts';

test('EACH BLOCK SAYS WHAT IT READS, once, after the figures', () => {
  const blocks = [
    { source: 'register.transactions' },
    { source: 'register.transactions' },
    { kind: 'inputs', register: 'accounts' },
    { source: 'governance.open' },
    { source: 'metric.cash-now' },
    null,
  ];
  assert.deepEqual(pageLists(blocks), [PAGE_FIGURES, 'transactions', 'accounts', QUESTIONS]);
});

test('A PAGE OVER THE RUNS NAMES THEM, which the copy never keeps', () => {
  assert.ok(pageLists([{ source: 'sessions.live' }]).includes('session'));
});
