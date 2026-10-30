/**
 * S6 (`widget-signals.ts` `emptyForWeeks`): a widget is asked off Today only once it has stood on the board three weeks
 * with nothing to show. A minute-old record was asked about Working now "after three weeks" (E1, 31 Oct).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi } from '../src/index.ts';
import { widgetSignals, type SignalRead } from '../src/widget-signals.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW } from '../../seed/src/index.ts';

const DAY = 86_400_000;

async function recordBorn(bornMs: number) {
  const sql = openSqlite();
  await createRecordApi({ sql, clock: fixedClock(NOW) });
  sql.exec(
    "INSERT INTO record (singleton, id, slug, name, format_ver, created_at) VALUES (1, 'rec_test', 'test', 'Test', 1, ?) ON CONFLICT (singleton) DO UPDATE SET created_at = excluded.created_at",
    new Date(bornMs).toISOString(),
  );
  return sql;
}

const readAt = (sql: SignalRead['sql'], nowMs: number): SignalRead => ({
  sql,
  nowMs,
  person: 'p_1',
  lists: new Set(['quiet']),
  figures: new Set(),
  addons: new Set(),
  templates: [],
  board: [{ key: 'quiet-list', heading: 'Quiet list', source: 'register.quiet', empty: true }],
});

const removals = (read: SignalRead) => widgetSignals(read, new Map(), []).filter((s) => s.signal === 'S6');

test('a record made today is not asked to take an empty widget off', async () => {
  const sql = await recordBorn(NOW);
  assert.deepEqual(removals(readAt(sql, NOW + 60_000)), []);
});

test('a record made three weeks ago is asked about a widget that has shown nothing since', async () => {
  const sql = await recordBorn(NOW - 30 * DAY);
  const out = removals(readAt(sql, NOW));
  assert.equal(out.length, 1);
  assert.equal(out[0]!.remove, 'quiet-list');
});

test('a widget put on Today a week ago waits, however old the record', async () => {
  const sql = await recordBorn(NOW - 90 * DAY);
  sql.exec(
    "INSERT INTO declaration (id, version, kind, pack_id, body, checksum, retired, superseded_at, created_at) VALUES ('page.home', 1, 'page', NULL, ?, 'x', 0, NULL, ?)",
    JSON.stringify({ page: 'home', blocks: [{ kind: 'table', key: 'quiet-list', source: 'register.quiet' }] }),
    new Date(NOW - 7 * DAY).toISOString(),
  );
  assert.deepEqual(removals(readAt(sql, NOW)), []);
});
