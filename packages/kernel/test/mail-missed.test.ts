/**
 * Health's "didn't get the summary" line goes once nothing will clear it (review m, RM9): when the member is taken off,
 * when their address changes, and when the next run of that summary goes without them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Kernel } from '../src/index.ts';
import { openSqlite, fixedClock, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 26, 7);
const DAY = 86_400_000;
const SUMMARY = 'the summary "Monday money"';

async function record(): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  assert.ok(k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'studio', name: 'Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  assert.ok(k.invite('p_1', { person: 'p_mia', email: 'mia@example.test', name: 'Mia', level: 'read' }).ok);
  return { k, sql, clock };
}

const missed = (sql: NodeSql): string[] =>
  sql.all<{ said: string }>("SELECT said FROM fault WHERE cause LIKE 'mail#missed.%' AND cleared_at IS NULL ORDER BY cause").map((r) => r.said);

test('A MEMBER TAKEN OFF IS NO LONGER SAID TO HAVE MISSED A MAIL', async () => {
  const { k, sql } = await record();
  k.mailMissed(['mia@example.test'], SUMMARY);
  assert.deepEqual(missed(sql), [`Mia didn't get ${SUMMARY}: their address was refused.`]);
  assert.ok(k.removeMember('p_1', 'p_mia').ok);
  assert.deepEqual(missed(sql), []);
  sql.close();
});

test('A MEMBER GIVEN A NEW ADDRESS IS NO LONGER SAID TO HAVE MISSED A MAIL', async () => {
  const { k, sql } = await record();
  k.mailMissed(['mia@example.test'], SUMMARY);
  assert.ok(k.invite('p_1', { person: 'p_mia', email: 'mia@studio.test', level: 'read' }).ok);
  assert.deepEqual(missed(sql), []);
  sql.close();
});

test('THE NEXT RUN OF THE SUMMARY DROPS THE LINES ABOUT THE LAST ONE, and one still refused is said again', async () => {
  const { k, sql, clock } = await record();
  k.mailMissed(['mia@example.test', 'gone@example.test'], SUMMARY);
  assert.equal(missed(sql).length, 2);
  clock.advance(7 * DAY);
  k.mailSent(['p1@example.test'], SUMMARY);
  assert.deepEqual(missed(sql), [], 'a line about last week stayed');
  k.mailMissed(['mia@example.test'], SUMMARY);
  assert.deepEqual(missed(sql), [`Mia didn't get ${SUMMARY}: their address was refused.`]);
  /* A SEND IN THE SAME RUN KEEPS THIS RUN'S LINE. */
  clock.advance(60_000);
  k.mailSent(['p1@example.test'], SUMMARY);
  assert.equal(missed(sql).length, 1);
  sql.close();
});
