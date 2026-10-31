import { test } from 'node:test';
import assert from 'node:assert/strict';

import { saidDay } from '../src/said-day.ts';

const NOW = Date.UTC(2026, 9, 31, 12);

test('A DAY READS AS THE APP SAYS IT: the year only when it is not this one', () => {
  assert.equal(saidDay('2026-12-02', NOW), '2 Dec');
  assert.equal(saidDay('2026-12-02T09:30:00.000Z', NOW), '2 Dec');
  assert.equal(saidDay('2027-01-29T00:00:00Z', NOW), '29 Jan 2027');
  assert.equal(saidDay('2020-01-01', NOW), '1 Jan 2020');
  assert.equal(saidDay('soon', NOW), 'soon');
});
