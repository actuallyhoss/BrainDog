/**
 * Migration 30's data step (AGT-C06-d): the questions the old ladder filed close as faults, on every record.
 *
 * MEASURED BEFORE: the owner's Decide holds "infer.resolve could not be delivered after 8 attempts: No model
 * answered..." opened by `system`, with Accept and Decline under it. What is asserted: every open question `system`
 * filed at the end of either ladder is resolved as `fault`, with a `resolve` event by `system` that carries the reason,
 * under a well-formed id; a question in other words, one already closed, and one an agent opened in the same words
 * are left as they were; Decide's count drops by exactly the ones closed; and running the step again changes nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import faults0030 from '../src/migrations/0030_faults.ts';
import { execScript } from '../src/migrate.ts';
import { isUlid } from '../src/ids.ts';
import { openRecord } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 3);
const REASON = 'This was a fault in BrainDog, not a question for you.';

const ask = (sql: NodeSql, id: string, by: string, question: string, status = 'open'): void =>
  sql.exec(
    "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES (?, 'change', ?, ?, ?, ?)",
    id,
    JSON.stringify({ declaration_id: 'kernel.outbox', from: { kind: 'infer.resolve' }, to: 'retry', question }),
    status,
    by,
    new Date(NOW).toISOString(),
  );

const open = (sql: NodeSql): number => sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE status = 'open'")!.n;

test('THE OLD LADDER\'S QUESTIONS CLOSE AS FAULTS, the rest stay, and Decide is lower by exactly those', async () => {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));

  ask(sql, 'SG1', 'system', 'infer.resolve could not be delivered after 8 attempts: No model answered. Retry it, or change what produces it.');
  ask(sql, 'SG2', 'system', 'A pull due 2026-10-01 could not run after 8 attempts: Nothing handles it. Retry it, or change what produces it.');
  ask(sql, 'SG3', 'system', 'Are these two people the same?');
  ask(sql, 'SG4', 'agent:claude', 'notify.email could not be delivered after 8 attempts: we should look at this.');
  ask(sql, 'SG5', 'system', 'export.r2 could not be delivered after 8 attempts: bucket gone.', 'resolved');
  const before = open(sql);
  assert.equal(before, 4);

  execScript(sql, faults0030);

  const rows = sql.all<{ id: string; status: string; resolved_as: string | null }>('SELECT id, status, resolved_as FROM suggestion ORDER BY id');
  assert.deepEqual(
    rows.map((r) => ({ ...r })),
    [
      { id: 'SG1', status: 'resolved', resolved_as: 'fault' },
      { id: 'SG2', status: 'resolved', resolved_as: 'fault' },
      { id: 'SG3', status: 'open', resolved_as: null },
      { id: 'SG4', status: 'open', resolved_as: null },
      { id: 'SG5', status: 'resolved', resolved_as: null },
    ],
  );
  assert.equal(open(sql), before - 2, "Decide's count is not lower by the two faults");

  const events = sql.all<{ id: string; ts: string; actor: string; target: string; target_kind: string; to_v: string; note: string }>(
    "SELECT id, ts, actor, target, target_kind, to_v, note FROM event WHERE kind = 'resolve' ORDER BY rowid",
  );
  assert.deepEqual(events.map((e) => e.target), ['suggestion:SG1', 'suggestion:SG2']);
  for (const e of events) {
    assert.equal(e.actor, 'system');
    assert.equal(e.target_kind, 'suggestion');
    assert.equal(e.to_v, 'fault');
    assert.equal(e.note, REASON);
    assert.ok(isUlid(e.id), `${e.id} is not a ULID`);
    assert.match(e.ts, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  }
  assert.notEqual(events[0]!.id, events[1]!.id);
  // The id's first ten characters are the clock it was written on, as a ULID's are.
  const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const ms = [...events[0]!.id.slice(0, 10)].reduce((n, c) => n * 32 + A.indexOf(c), 0);
  assert.ok(Math.abs(ms - Date.parse(events[0]!.ts)) < 1000, 'the id does not carry the time it was written');

  // Again, and nothing more is closed or said.
  execScript(sql, faults0030);
  assert.equal(sql.all("SELECT 1 FROM event WHERE kind = 'resolve'").length, 2);
  assert.equal(open(sql), before - 2);
  sql.close();
});

test('THE FAULT TABLE IS THERE ON A NEW RECORD, local, and empty', async () => {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  assert.equal(sql.one<{ s: string }>("SELECT section AS s FROM dog_section WHERE table_name = 'fault'")?.s, 'local');
  assert.equal(sql.all('SELECT 1 FROM fault').length, 0);
  sql.close();
});
