/**
 * The host's last restore drill, kept by the Directory (LCH-C04 job 3, the scope's critic): one `dir_meta` row, the
 * newest put wins, counts only, and a stored shape this build cannot read is no drill rather than a throw.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createDirectory, type HostDrill } from '../src/directory.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 9);

function setup() {
  const sql = openSqlite();
  return { sql, d: createDirectory(sql, fixedClock(NOW)) };
}

const DRILL: HostDrill = { at: '2026-10-09T09:17:00.000Z', pass: true, copies: 2, rows: 4120, lists: 31, people: 3, records: 7 };

test('NO DRILL YET IS null, AND A PUT IS READ BACK AS IT WAS', () => {
  const { d } = setup();
  assert.equal(d.drill.read(), null);
  d.drill.put(DRILL);
  assert.deepEqual(d.drill.read(), DRILL);
});

test('THE HOST KEEPS THE LAST DRILL: one row, the newest put wins', () => {
  const { sql, d } = setup();
  d.drill.put(DRILL);
  const later: HostDrill = { ...DRILL, at: '2026-11-01T09:17:00.000Z', pass: false, records: null };
  d.drill.put(later);
  assert.deepEqual(d.drill.read(), later);
  assert.equal(sql.all("SELECT key FROM dir_meta WHERE key = 'drill'").length, 1);
});

test('ONLY THE COUNTS ARE KEPT, whatever else the caller handed in', () => {
  const { sql, d } = setup();
  d.drill.put({ ...DRILL, record: 'rec_01HZZZZZZZZZZZZZZZZZZZZZZZ', email: 'someone@example.test' } as HostDrill);
  const stored = sql.one<{ value: string }>("SELECT value FROM dir_meta WHERE key = 'drill'")?.value ?? '';
  assert.deepEqual(Object.keys(JSON.parse(stored)).sort(), ['at', 'copies', 'lists', 'pass', 'people', 'records', 'rows']);
  assert.ok(!stored.includes('rec_') && !stored.includes('@'), 'an id or an address was kept beside the counts');
});

test('A STORED DRILL THIS BUILD CANNOT READ IS NO DRILL, never a throw', () => {
  const { sql, d } = setup();
  for (const value of ['not json', '{"at":"x","pass":"yes"}', '{"at":"x","pass":true,"copies":-1,"rows":0,"lists":0,"people":0,"records":null}']) {
    sql.exec("INSERT INTO dir_meta (key, value) VALUES ('drill', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", value);
    assert.equal(d.drill.read(), null, value);
  }
});

test("THE DIRECTORY'S COPY CARRIES THE DRILL, so a restored host still says when it was last tested", () => {
  const from = setup();
  from.d.drill.put(DRILL);
  const to = setup();
  const loaded = to.d.load(from.d.dump());
  assert.ok(loaded.ok, JSON.stringify(loaded));
  assert.deepEqual(to.d.drill.read(), DRILL);
});
