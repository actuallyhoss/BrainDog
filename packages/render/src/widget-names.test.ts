import { test } from 'node:test';
import assert from 'node:assert/strict';

import { agentNamed, distill, plainName } from './widgets.ts';

test('an agent is said by its own spelling, as every other page says it', () => {
  assert.equal(agentNamed('claude'), 'Claude');
  assert.equal(agentNamed('codex'), 'Codex');
  assert.equal(agentNamed('Cursor'), 'Cursor');
  assert.equal(agentNamed('aider'), 'Aider');
  assert.equal(agentNamed(undefined), undefined);
});

test('a shouted bank line reads as a name, initials stay', () => {
  assert.equal(plainName('FENWICK CLOUD'), 'Fenwick Cloud');
  assert.equal(plainName('USD'), 'USD');
});

test('A LINE OF DAYS IS PREVIEWED BY ITS NEWEST READING, IN ITS OWN MONEY: Gold price said "5,801.7 This week" for EGP 5,801.68 a gram', () => {
  const block = { kind: 'lines', source: 'register.gold_rates', columns: [{ field: 'on' }, { field: 'per_gram' }] };
  const now = [5_790.1, null, 5_801.68, null];
  const read = distill({ block }, { measures: [{ name: '24k', unit: 'EGP', bucket: 'day', now }] });
  assert.equal(read.figures?.length, 1);
  assert.deepEqual([read.figures![0]!.label, read.figures![0]!.value, read.figures![0]!.unit, read.figures![0]!.format], ['Latest', 580_168, 'EGP', 'money']);
  assert.equal(read.empty, null);
  /* NOTHING READ IS ITS EMPTY LINE, never a nought. */
  assert.deepEqual(distill({ block: { ...block, empty: 'No 24k gold rate yet.' } }, { measures: [{ name: '24k', unit: 'EGP', bucket: 'day', now: [null, null] }] }).figures, []);
  /* A LINE OF WEEKS STILL SAYS THIS WEEK AND THE ONE BEFORE. */
  const weeks = distill({ block }, { measures: [{ name: 'Orders', unit: '', bucket: 'week', now: [3, 5] }] });
  assert.deepEqual(weeks.figures?.map((f) => [f.label, f.value]), [['This week', 5], ['Last week', 3]]);
});
