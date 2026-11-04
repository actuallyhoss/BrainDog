/**
 * A rule's firings are counted by month as well as in all (migration 48, sec-follow M5), so "this month" over a rule is
 * the month's count and never the whole count's last date.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyMigrations } from '../src/migrate.ts';
import { raiseStat } from '../src/rules.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const OCT = Date.UTC(2026, 9, 30, 12);
const NOV = Date.UTC(2026, 10, 1, 9);

test('EACH FIRING RAISES THE WHOLE COUNT AND ITS MONTH’S', async () => {
  const sql = openSqlite();
  await applyMigrations(sql, fixedClock(OCT));
  raiseStat(sql, 'file-coffee', 'entry_1', OCT);
  raiseStat(sql, 'file-coffee', 'entry_2', OCT);
  raiseStat(sql, 'file-coffee', 'entry_3', NOV);
  assert.equal(sql.one<{ fired: number }>('SELECT fired FROM rule_stat WHERE rule = ?', 'file-coffee')?.fired, 3);
  assert.deepEqual(sql.all('SELECT month, fired FROM rule_month WHERE rule = ? ORDER BY month', 'file-coffee').map((r) => ({ ...r })), [
    { month: '2026-10', fired: 2 },
    { month: '2026-11', fired: 1 },
  ]);
  sql.close();
});
