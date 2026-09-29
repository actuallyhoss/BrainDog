/**
 * The sentence under Settings' title: what it says from the copies and the month's usage, and that it says nothing it
 * did not read.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { daysLeft, healthSaid, lastCopy, nearest, type Part } from './health.ts';

const text = (parts: Part[] | null): string => (parts ?? []).map((p) => p.text).join('');
const needs = (parts: Part[] | null): string[] => (parts ?? []).filter((p) => p.needs).map((p) => p.text);

const NOW = Date.parse('2026-09-29T09:00:00Z');

test('all healthy names both facts and marks nothing', () => {
  const said = healthSaid('in', { resets: '1 October', near: null, daysLeft: 2 });
  assert.equal(text(said), 'All healthy: last night’s copy is in, and nothing runs out before 1 October.');
  assert.deepEqual(needs(said), []);
});

test('a missed night is the phrase that needs him, and the rest is still said', () => {
  const said = healthSaid('missing', { resets: '1 October', near: null, daysLeft: 2 });
  assert.equal(text(said), 'No copy last night, and nothing runs out before 1 October.');
  assert.deepEqual(needs(said), ['No copy last night']);
});

test('a meter near its limit is named with its share and the days left', () => {
  const said = healthSaid('in', { resets: '1 October', near: { key: 'runs', share: 0.914 }, daysLeft: 2 });
  assert.equal(text(said), 'Runs are at 91%, 2 days to go, and last night’s copy is in.');
  assert.deepEqual(needs(said), ['Runs are at 91%, 2 days to go']);
});

test('both at once are both marked', () => {
  const said = healthSaid('missing', { resets: '1 October', near: { key: 'bytes', share: 1 }, daysLeft: 2 });
  assert.equal(text(said), 'No copy last night, and fetched data is used up until 1 October.');
  assert.equal(needs(said).length, 2);
});

test('nothing read is no sentence, and one half read is that half alone', () => {
  assert.equal(healthSaid(null, null), null);
  assert.equal(text(healthSaid('in', null)), 'All healthy: last night’s copy is in.');
  assert.equal(text(healthSaid(null, { resets: '1 October', near: null, daysLeft: 2 })), 'All healthy: nothing runs out before 1 October.');
});

test('last night is the newest copy, and no copies is nothing to judge by', () => {
  assert.equal(lastCopy(['2026-09-29T03:00:00Z', '2026-09-20T03:00:00Z'], NOW), 'in');
  assert.equal(lastCopy(['2026-09-26T03:00:00Z'], NOW), 'missing');
  assert.equal(lastCopy([], NOW), null);
  assert.equal(lastCopy(['not a date'], NOW), null);
});

test('only a meter at the notice line or past it is near', () => {
  assert.equal(nearest([{ key: 'runs', share: 0.5 }, { key: 'requests', share: 0.79 }]), null);
  assert.deepEqual(nearest([{ key: 'runs', share: 0.5 }, { key: 'ms', share: 0.85 }]), { key: 'ms', share: 0.85 });
  assert.equal(nearest([]), null);
});

test('the days left count today', () => {
  assert.equal(daysLeft(NOW), 2);
  assert.equal(daysLeft(Date.parse('2026-02-01T00:00:00Z')), 28);
  assert.equal(daysLeft(Date.parse('2026-09-30T23:00:00Z')), 1);
});
