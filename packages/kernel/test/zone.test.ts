/**
 * The record's time zone can be changed after it is made (MC2): `setZone` writes `record.tz` and `dog_meta.tz`, logs
 * one `edit`, and the record's "today" follows at once. A zone that is not a place is refused, and the same zone again
 * changes nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

/* A fixed clock, so the one edit has one time. */
const NOW = Date.UTC(2026, 9, 31, 23, 30);

async function record() {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const made = k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'studio', name: 'Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.test', name: 'Ada' } });
  assert.ok(made.ok, JSON.stringify(made));
  return { k, sql };
}

test('A ZONE CHANGED IS THE RECORD\'S AT ONCE, logged once, and the same zone again changes nothing', async () => {
  const { k, sql } = await record();
  const edits = () => sql.one<{ n: number }>("SELECT count(*) AS n FROM event WHERE target_kind = 'record' AND field = 'tz'")?.n;
  assert.deepEqual(k.setZone({ tz: 'Africa/Cairo' }, 'p_1'), { ok: true, value: { tz: 'Africa/Cairo' } });
  assert.equal(k.identity()?.tz, 'Africa/Cairo');
  assert.equal(sql.one<{ value: string }>("SELECT value FROM dog_meta WHERE key = 'tz'")?.value, 'Africa/Cairo');
  assert.equal(edits(), 1);
  assert.ok(k.setZone({ tz: 'Africa/Cairo' }, 'p_1').ok);
  assert.equal(edits(), 1);
});

test('A ZONE THAT IS NOT A PLACE IS REFUSED, and nothing is written', async () => {
  const { k } = await record();
  for (const tz of ['EST', 'Etc/GMT+5', 'Mars/Olympus', '', undefined]) {
    const out = k.setZone({ tz }, 'p_1');
    assert.equal(out.ok, false, String(tz));
  }
  assert.equal(k.identity()?.tz, 'UTC');
});
