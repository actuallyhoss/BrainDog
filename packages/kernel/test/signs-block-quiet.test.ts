/**
 * A `signs` BLOCK READ BY SOMEBODY WITH NO INBOX REACH (audit 38-39, finding 1): each sign is told in the kernel's words
 * (`quietSign`) before it is a row, so neither a column nor a `where:` reads a message's text. The record's own reader,
 * and one the host says may read the inbox, read each sign as it was filed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, ok } from '@braindog/ports';

/* `pages.ts` FIRST, as `signs-page.test.ts` reads it. */
import { readBlock, type BlockResult, type PageBlock, type PageDeps } from '../src/pages.ts';
import type { VitalSign } from '../src/signs.ts';

const NOW = Date.UTC(2026, 9, 9, 7);

const RED: VitalSign = {
  sign: 'arrivals-filed',
  name: 'Arrivals file by themselves',
  state: 'red',
  value: 7,
  said: 'A text from Lena about the rent has waited two days.',
  facts: ['Lena: the rent is late again'],
  days: [],
};
const GREEN: VitalSign = { sign: 'oldest-question', name: 'No question waits too long', state: 'green', value: 3, said: 'The oldest question has waited 3 days.', facts: [], days: [] };

function depsFor(inbox: boolean | undefined, withReader = true): PageDeps {
  return {
    pages: () => [],
    metric: () => null,
    read: () => no('METRIC_UNKNOWN', 'This test reads no figures.'),
    list: () => ok({ rows: [], matched: 0 }),
    schemaOf: () => null,
    titleOf: () => null,
    runway: () => null,
    ctx: { nowMs: NOW, schemaOf: () => null },
    signs: () => [RED, GREEN],
    ...(withReader ? { reader: { hold: (b: BlockResult) => b, ...(inbox === undefined ? {} : { inbox }) } } : {}),
  };
}

const TABLE: PageBlock = { kind: 'table', source: 'signs', columns: [{ field: 'name' }, { field: 'state' }, { field: 'said' }] };

test('A READER HELD FROM THE INBOX reads the red sign in the kernel words, never the message', () => {
  const read = readBlock(depsFor(false), TABLE);
  assert.deepEqual(read.refusals, []);
  assert.equal(read.rows[0]!.fields.said, 'Messages came in that are not filed yet.');
  assert.ok(!JSON.stringify(read).includes('Lena'));
  /* A sign QUIET does not name keeps its own sentence. */
  assert.equal(read.rows[1]!.fields.said, 'The oldest question has waited 3 days.');
});

test('A FILTER CANNOT SEARCH THE MESSAGE TEXT for a reader held from the inbox', () => {
  const block: PageBlock = { ...TABLE, where: 'said contains Lena' };
  const held = readBlock(depsFor(false), block);
  assert.deepEqual(held.refusals, []);
  assert.equal(held.matched, 0);
  const owner = readBlock(depsFor(undefined, false), block);
  assert.equal(owner.matched, 1);
});

test('THE RECORD READER AND ONE WITH INBOX REACH read each sign as it was filed', () => {
  for (const deps of [depsFor(undefined, false), depsFor(undefined), depsFor(true)]) {
    const read = readBlock(deps, TABLE);
    assert.equal(read.rows[0]!.fields.said, RED.said);
  }
});
