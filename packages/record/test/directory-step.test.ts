/**
 * The first-run funnel (`seen` with `step.mark`): each step counts once a record, a name off the closed list or a
 * record the Directory does not know is never kept, and a return counts only on a later day than the record was made.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { STEPS, createDirectory } from '../src/directory.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 17, 9);
const DAY = 86_400_000;

function setup() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const d = createDirectory(sql, clock, { mac: new Uint8Array(32).fill(7), magic: true });
  sql.exec("INSERT INTO dir_record (id, created_at) VALUES ('rec_a', ?)", new Date(NOW).toISOString());
  return { sql, clock, d };
}

const mark = (d: ReturnType<typeof setup>['d'], step: string, record = 'rec_a') => d.seen({ flow: 'step.mark', record, step });

test('a step counts once a record, and only a step on the list', () => {
  const { sql, d } = setup();
  assert.deepEqual(mark(d, 'saw_connect'), { counted: true });
  assert.deepEqual(mark(d, 'saw_connect'), { counted: false });
  assert.deepEqual(mark(d, 'not_a_step'), { counted: false });
  assert.deepEqual(mark(d, 'copied_line', 'rec_unknown'), { counted: false });
  assert.deepEqual(sql.all('SELECT record, step, day FROM dir_step').map((r) => ({ ...r })), [{ record: 'rec_a', step: 'saw_connect', day: '2026-10-17' }]);
});

test('coming back counts on a later day and not on the day the record was made', () => {
  const { clock, d } = setup();
  assert.deepEqual(mark(d, 'came_back'), { counted: false });
  clock.advance(DAY);
  assert.deepEqual(mark(d, 'came_back'), { counted: true });
  assert.deepEqual(mark(d, 'came_back'), { counted: false });
});

test('the list has the seven steps of the first run', () => {
  assert.equal(STEPS.length, 7);
});
