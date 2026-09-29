/**
 * Stopping a member and letting them back in, as `suspendMember` answers it, and the question a door asks before it
 * chooses `STOPPED` as its sentence (`stopped`).
 *
 * CALLED ON `members.ts` ITSELF, and not through `makeKernel`: what is proved here is what `suspend` answers and what
 * `stopped` says, which holds whether or not the kernel's facade has passed the answer through yet.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord } from './index.ts';
import { invite, remove, stopped, suspend, type MemberDeps } from './members.ts';
import { fixedClock, openSqlite } from '../test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 26, 12);

/** A record with an owner and one colleague who writes, so the last-owner guard is not what is measured. */
async function record() {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  let n = 0;
  const deps: MemberDeps = { sql, nowMs: NOW, mint: () => `e_${(n += 1).toString().padStart(4, '0')}`, hasRegister: () => false };
  assert.ok(invite(deps, 'system', { person: 'p_root', email: 'root@example.test', level: 'owner' }).ok);
  assert.ok(invite(deps, 'p_root', { person: 'p_a', email: 'a@example.test', level: 'write' }).ok);
  return { sql, deps };
}

const held = (sql: ReturnType<typeof openSqlite>, person: string) =>
  sql.one<{ suspended_at: string | null }>('SELECT suspended_at FROM person WHERE id = ?', person)?.suspended_at ?? null;

test('suspend answers where the person now stands: the instant they were stopped, then null once let back in', async () => {
  const { sql, deps } = await record();

  const off = suspend(deps, 'p_root', 'p_a', true);
  assert.ok(off.ok);
  assert.deepEqual(off.value, { person: 'p_a', suspended_at: new Date(NOW).toISOString() });
  assert.equal(held(sql, 'p_a'), off.value.suspended_at, 'the answer and the row disagree about when');

  /* A SECOND STOP ANSWERS THE FIRST ONE'S INSTANT, so a caller that lost its reply and retries learns what was written. */
  const again = suspend({ ...deps, nowMs: NOW + 60_000 }, 'p_root', 'p_a', true);
  assert.ok(again.ok);
  assert.equal(again.value.suspended_at, off.value.suspended_at);

  const back = suspend(deps, 'p_root', 'p_a', false);
  assert.ok(back.ok);
  assert.deepEqual(back.value, { person: 'p_a', suspended_at: null });
  assert.equal(held(sql, 'p_a'), null);
  sql.close();
});

test('stopped is true only for somebody on the record whom an owner has stopped', async () => {
  const { sql, deps } = await record();
  assert.equal(stopped(sql, 'p_a'), false, 'a working colleague read as stopped');
  assert.equal(stopped(sql, 'p_nobody'), false, 'a stranger read as stopped');

  assert.ok(suspend(deps, 'p_root', 'p_a', true).ok);
  assert.equal(stopped(sql, 'p_a'), true);

  /* TAKEN OFF AS WELL, they are no longer on the record, so a door says its own words and not `STOPPED`. */
  assert.ok(remove(deps, 'p_root', 'p_a').ok);
  assert.equal(stopped(sql, 'p_a'), false, 'somebody removed was told they were only stopped');
  sql.close();
});
