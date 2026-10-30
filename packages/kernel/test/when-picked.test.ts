/**
 * A `when:` by what the reader picked on the page's own filter: `{ picked: months, is: this }`, `''` for none picked, so
 * a page's line says the months a strip of choices narrows the blocks under it to (live check of 30 October, 20).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, ok } from '@braindog/ports';

import { whenTreeFault } from '../src/block-keys.ts';
import { readPage, type BlockResult, type PageBlock, type PageDeps } from '../src/pages.ts';

const NOW = Date.UTC(2026, 9, 15, 12);

const MONTHS = {
  field: 'months',
  control: 'segmented',
  options: [
    { value: 'this', label: 'This month', where: 'on at least bom' },
    { value: 'last', label: 'Last month', where: 'on at least bom-1m, on before bom' },
  ],
};

const LINE: PageBlock = {
  kind: 'note',
  says: [
    { when: { picked: 'months', is: 'this' }, body: 'This month.' },
    { when: { picked: 'months', is: ['last'] }, body: 'Last month.' },
    { body: 'The last 13 months.' },
  ],
} as unknown as PageBlock;

function depsOver(): PageDeps {
  return {
    pages: () => [{ page: 'reports', title: 'Reports', filters: [MONTHS], blocks: [LINE] } as never],
    metric: () => null,
    read: () => no('METRIC_UNKNOWN', 'This test reads no figure.'),
    list: () => ok({ rows: [], matched: 0 }),
    schemaOf: () => null,
    titleOf: () => null,
    runway: () => null,
    ctx: { nowMs: NOW, schemaOf: () => null },
  };
}

const said = (filter?: Record<string, string>): string => {
  const read = readPage(depsOver(), 'reports', filter);
  assert.ok(read.ok, JSON.stringify(read));
  return (read.value.blocks as BlockResult[]).map((b) => b.body ?? '').join(' ');
};

test('THE LINE SAYS THE MONTHS PICKED, and the last sentence while none is', () => {
  assert.equal(said(), 'The last 13 months.');
  assert.equal(said({ months: 'this' }), 'This month.');
  assert.equal(said({ months: 'last' }), 'Last month.');
  /* A choice the strip does not offer is no choice. */
  assert.equal(said({ months: 'never' }), 'The last 13 months.');
});

test('A LEAF ABOUT WHAT WAS PICKED IS CHECKED FOR ITS SHAPE', () => {
  assert.equal(whenTreeFault({ picked: 'months', is: 'this' }, 'when'), null);
  assert.equal(whenTreeFault({ picked: 'months', is: ['', 'this'] }, 'when'), null);
  assert.match(whenTreeFault({ picked: '', is: 'this' }, 'when') ?? '', /picked names a filter/u);
  assert.match(whenTreeFault({ picked: 'months' }, 'when') ?? '', /is is a choice's value/u);
  assert.match(whenTreeFault({ picked: 'months', is: 'this', gt: 0 }, 'when') ?? '', /says picked and gt/u);
});
