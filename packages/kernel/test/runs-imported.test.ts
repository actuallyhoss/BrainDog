/**
 * A run carried in keeps the day it was last seen there, through the kernel's own write path.
 *
 * MEASURED BEFORE: the write path refused `last_seen` from every caller (`IMMUTABLE_FIELD`), so an adapter that sent
 * the old system's time lost the run, and one that left it out gave all 295 imported runs on the owner's record the
 * morning of the import. `run-carried.ts` decides what is carried; what is asserted here is that `index.ts` calls it
 * before the field loop and applies it after the stamp, on the rows the Agents page reads.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Entry, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const BEFORE = '2026-08-14T09:30:00.000Z';
const OWNER: WriteContext = { actor: 'p_owner' };

async function record() {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  return { k, sql };
}

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};
const refusal = (r: unknown): { code: string; at?: string } => {
  const x = r as { ok: boolean; refusal: { code: string; at?: string } };
  assert.equal(x.ok, false, 'the write landed');
  return x.refusal;
};

test('AN IMPORTED RUN KEEPS ITS DAY: `last_seen` lands as `seen_before`, the clock stays the record\'s, and a done run drops its step', async () => {
  const { k, sql } = await record();
  const run = value<Entry>(
    k.create('session', { doing: 'Fix the export', agent: 'claude', state: 'done', last_seen: BEFORE, next: 'Ship it' }, OWNER),
  );
  assert.equal(run.fields.seen_before, BEFORE);
  assert.equal(run.fields.last_seen, undefined, 'a carried time is not heard from here');
  assert.equal(run.fields.next, undefined, 'a step from a session that is gone stays');
  sql.close();
});

test('A CARRIED HANDOFF KEEPS ITS STEP: the one state that says a step waits to be taken', async () => {
  const { k, sql } = await record();
  const run = value<Entry>(
    k.create('session', { doing: 'Half way', agent: 'claude', state: 'handoff', last_seen: BEFORE, next: 'Run the gates' }, OWNER),
  );
  assert.deepEqual([run.fields.seen_before, run.fields.next], [BEFORE, 'Run the gates']);
  sql.close();
});

test('A TIME THAT CANNOT BE READ IS REFUSED AT `last_seen` AS A TIME, not as a field nobody may write', async () => {
  const { k, sql } = await record();
  const r = refusal(k.create('session', { doing: 'Work', agent: 'claude', state: 'done', last_seen: 'last tuesday' }, OWNER));
  assert.notEqual(r.code, 'IMMUTABLE_FIELD');
  assert.equal(r.at, 'last_seen');
  sql.close();
});

test('A RUN NEVER HEARD FROM HERE TAKES A LATER CARRIED DAY on an update; one heard from here still refuses it', async () => {
  const { k, sql } = await record();
  const carried = value<Entry>(k.create('session', { doing: 'Old', agent: 'claude', state: 'done' }, OWNER));
  const later = '2026-09-01T10:00:00.000Z';
  const moved = value<Entry>(k.update('session', carried.id, { last_seen: later }, OWNER));
  assert.equal(moved.fields.seen_before, later);
  assert.equal(moved.fields.last_seen, undefined);

  const heard = value<Entry>(
    k.create('session', { doing: 'Live', agent: 'claude', state: 'active' }, { ...OWNER, stamp: { last_seen: new Date(NOW).toISOString() } }),
  );
  assert.equal(refusal(k.update('session', heard.id, { last_seen: later }, OWNER)).code, 'IMMUTABLE_FIELD');
  sql.close();
});
