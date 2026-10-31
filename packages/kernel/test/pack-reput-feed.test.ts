/**
 * An add-on put in again at the version it held (audit j, AJ6; review i, RI1). The record's own re-put that changed
 * nothing stays out of the feed; a person's own reinstall, and a re-put whose body changed, stay in it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 31, 12);

const put = (k: Kernel, checksum: string, by?: string) =>
  k.rememberPack({
    id: 'money-core',
    version: '3.33.0',
    source: 'local',
    ref: null,
    manifest: JSON.stringify({ pack: 'money-core', version: '3.33.0', requires: { format: 1, primitives: 1, packs: {} } }),
    checksum,
    ...(by === undefined ? {} : { by }),
  });

type Line = { actor: string; kind: string; target: string; field: string | null; ts: string; from_v: string | null; to_v: string; note: string | null };
const last = (sql: NodeSql): Line =>
  sql.one<Line>("SELECT actor, kind, target, field, ts, from_v, to_v, note FROM event WHERE kind = 'install' AND target = 'pack:money-core' ORDER BY rowid DESC LIMIT 1")!;
const quiet = (k: Kernel, l: Line): boolean => k.bookkeeping({ ...l, from: l.from_v, to: l.to_v });

test('THE RECORD PUTTING AN ADD-ON BACK AS IT WAS IS NO CHANGE', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  put(k, 'sum-a', 'p_1');
  assert.equal(quiet(k, last(sql)), false, 'a first install left the feed');
  put(k, 'sum-a', 'system');
  assert.equal(last(sql).from_v, '3.33.0');
  assert.equal(quiet(k, last(sql)), true, 'the record re-putting the same body was news');
  sql.close();
});

test('A PERSON’S OWN REINSTALL IS SIGNED BY THEM AND STAYS IN THE FEED', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  put(k, 'sum-a', 'p_1');
  put(k, 'sum-a', 'p_1');
  assert.equal(last(sql).actor, 'p_1');
  assert.equal(quiet(k, last(sql)), false, 'a reinstall somebody pressed was left out');
  sql.close();
});

test('A RE-PUT AT THE SAME VERSION WHOSE BODY CHANGED STAYS IN THE FEED', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  put(k, 'sum-a', 'p_1');
  put(k, 'sum-b', 'system');
  assert.equal(last(sql).from_v, null, 'a changed body kept the version it held as from');
  assert.equal(quiet(k, last(sql)), false, 'a fold landing at a live version said nothing');
  sql.close();
});
