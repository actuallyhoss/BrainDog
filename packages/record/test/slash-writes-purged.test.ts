/**
 * Slash's ninety-day write counts come from the event history, so writes to rows the hourly sweep has since purged still
 * count (`slash.ts` `readUsage`, `kernel/src/provision.ts` `purge`). A pack whose only use was on rows later deleted is not
 * said to be untouched.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration } from '../../kernel/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { readUsage } from '../src/slash.ts';

const NOW = Date.UTC(2026, 5, 1, 12);
const DAY = 86_400_000;
const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: { id: 'obligations', name: 'Obligations', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

test('writes to rows purged since still count in the ninety days', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  assert.ok((await k.install([OBLIGATIONS])).ok);
  for (const what of ['Rent', 'Insurance']) assert.ok(k.create('obligations', { what }, { actor: 'p_1' }).ok);
  assert.ok(k.update('obligations', 'obligations#1', { deleted_at: '2026-06-01' }, { actor: 'p_1' }).ok);
  assert.ok(k.update('obligations', 'obligations#2', { deleted_at: '2026-06-01' }, { actor: 'p_1' }).ok);

  clock.set(NOW + 40 * DAY);
  const before = readUsage(sql, k, clock.now()).lists.find((l) => l.id === 'obligations')?.writes90 ?? 0;
  assert.ok(before >= 4, `counted ${before} writes before the sweep`);
  assert.equal(k.purge().rows, 2);
  assert.equal(sql.all('SELECT 1 FROM entry').length, 0);
  const after = readUsage(sql, k, clock.now()).lists.find((l) => l.id === 'obligations')?.writes90 ?? 0;
  assert.equal(after, before, 'the writes went with the rows the sweep removed');
  sql.close();
});
