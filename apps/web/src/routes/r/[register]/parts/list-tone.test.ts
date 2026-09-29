/**
 * What a dot means on a list: the deadline's column carries a row's tone, and a finished row carries none.
 *
 * THE TWO ANSWERS THE GRID AND THE SAVED VIEW BOTH READ, from `list.ts`, so the list and the view it narrows cannot draw
 * a dot in two places. The register below is written here rather than read from a module, because what is under test is
 * the rule over any declaration: the first `day` field is not the deadline unless it says so.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { RegisterDecl } from '../../../../lib/record/schema.ts';
import { deadlineOf, withoutGood } from './list.ts';

const bills = {
  id: 'bills',
  name: 'Bills',
  one: 'bill',
  title: 'what',
  mobile: ['what', 'amount', 'due'],
  state: 'state',
  done: ['paid'],
  fields: [
    { id: 'what', type: 'text' },
    { id: 'opened', type: 'day' },
    { id: 'due', type: 'day', deadline: true },
    { id: 'state', type: 'enum', values: ['open', 'paid'] },
  ],
} as unknown as RegisterDecl;

test('the tone is about the day the list declares its deadline, and not the first day it holds', () => {
  assert.equal(deadlineOf(bills), 'due');
  assert.equal(deadlineOf({ ...bills, fields: bills.fields.filter((f) => f.id !== 'due') }), undefined);
  assert.equal(deadlineOf(undefined), undefined);
});

type Row = { key: string; tone?: 'good' | 'warn' | 'bad' | undefined };

test('a finished row loses its colour, and a late or close one keeps it', () => {
  const late: Row = { key: 'bills#2', tone: 'bad' };
  const plain: Row = { key: 'bills#3' };
  const rows: Row[] = [{ key: 'bills#1', tone: 'good' }, late, { key: 'bills#4', tone: 'warn' }, plain];
  const drawn = withoutGood(rows);
  assert.deepEqual(
    drawn.map((r) => [r.key, r.tone]),
    [
      ['bills#1', undefined],
      ['bills#2', 'bad'],
      ['bills#4', 'warn'],
      ['bills#3', undefined],
    ],
  );
  /* A row with nothing to take off is handed back as it came. */
  assert.equal(drawn[1], late);
  assert.equal(drawn[3], plain);
});
