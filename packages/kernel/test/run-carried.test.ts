/**
 * A run carried in keeps the day it was last seen where it came from (`run-carried.ts`).
 *
 * MEASURED BEFORE: the kernel refused `last_seen` from every caller (`IMMUTABLE_FIELD`), so an adapter that sent the
 * old system's time lost the run, and one that left it out gave all 295 of the owner's imported runs the import's day,
 * each still holding a next step for a session that was gone. What is asserted is the answer the write path applies:
 * the carried time as `seen_before`, `last_seen` out of the patch, and `next` dropped unless the run is a handoff.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { carriedIn } from '../src/run-carried.ts';
import { openRecord } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const SEPT = '2026-09-29T08:30:00.000Z';

/** The value of a carried answer, failing the test when it is a refusal. */
function carried(...args: Parameters<typeof carriedIn>) {
  const out = carriedIn(...args);
  assert.ok(out.ok, out.ok ? '' : out.refusal.fix);
  return out.value;
}

test('A CREATE CARRIES ITS TIME: last seen becomes seen before, and a step left somewhere else drops', () => {
  const out = carried({ doing: 'Old work', last_seen: SEPT, next: 'Ship the batch' }, null);
  assert.deepEqual(out.patch, { doing: 'Old work' });
  assert.deepEqual(out.stamp, { seen_before: SEPT });
  assert.equal(out.dropNext, true);
});

test('A HANDOFF KEEPS ITS STEP: the one state that says a step waits to be taken, sent or held', () => {
  const sent = carried({ state: 'handoff', last_seen: SEPT, next: 'Take it up' }, null);
  assert.deepEqual([sent.patch, sent.dropNext], [{ state: 'handoff', next: 'Take it up' }, false]);
  const held = carried({ last_seen: SEPT }, { state: 'handoff', fields: { state: 'handoff', next: 'Take it up' } });
  assert.equal(held.dropNext, false);
  /* And a handoff the write ends is no handoff any more. */
  const ended = carried({ state: 'done', last_seen: SEPT }, { state: 'handoff', fields: { state: 'handoff' } });
  assert.equal(ended.dropNext, true);
});

test('A RUN NEVER HEARD FROM HERE CARRIES ON AN UPDATE TOO, and its held step drops with it', () => {
  const out = carried({ last_seen: '2026-09-29T10:30:00+02:00' }, { state: 'abandoned', fields: { state: 'abandoned', next: 'Old' } });
  assert.deepEqual(out.stamp, { seen_before: SEPT }, 'read as an instant is, and stored in the one shape');
  assert.equal(out.dropNext, true);
});

test('A RUN HEARD FROM HERE KEEPS ITS CLOCK: the patch goes on as it came, and the field loop refuses it as before', () => {
  const patch = { last_seen: SEPT, next: 'Mine' };
  const out = carried(patch, { state: 'active', fields: { state: 'active', last_seen: '2026-10-08T12:00:00.000Z' } });
  assert.equal(out.patch, patch);
  assert.deepEqual([out.stamp, out.dropNext], [{}, false]);
});

test('NOTHING CARRIED, NOTHING CHANGED: a write with no last seen is the same write', () => {
  const patch = { doing: 'New', next: 'Keep' };
  const out = carried(patch, null);
  assert.equal(out.patch, patch);
  assert.deepEqual([out.stamp, out.dropNext], [{}, false]);
});

test('A TIME IT CANNOT READ IS REFUSED IN THE INSTANT’S WORDS, at last seen, and a null is taken out', () => {
  const zoneless = carriedIn({ last_seen: '2026-09-29T08:30:00' }, null);
  assert.equal(zoneless.ok, false);
  if (!zoneless.ok) {
    assert.equal(zoneless.refusal.code, 'VALUE_MALFORMED');
    assert.equal(zoneless.refusal.at, 'last_seen');
    assert.match(zoneless.refusal.fix, /timezone/);
  }
  assert.equal(carriedIn({ last_seen: 'yesterday' }, null).ok, false);
  const cleared = carried({ doing: 'x', last_seen: null, next: 'Kept' }, null);
  assert.deepEqual([cleared.patch, cleared.stamp, cleared.dropNext], [{ doing: 'x', next: 'Kept' }, {}, false]);
});

test('THROUGH THE WRITE PATH, A RUN HEARD FROM HERE KEEPS ITS STEP: a carried time is refused and the step stays', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(Date.UTC(2026, 9, 9, 12)));
  const owner = { actor: 'p_owner' };
  const heard = k.create('session', { doing: 'Live', state: 'active', next: 'Mine to take' }, { ...owner, stamp: { last_seen: '2026-10-09T11:00:00.000Z' } });
  assert.ok(heard.ok);
  const out = k.update('session', heard.value.id, { last_seen: SEPT }, owner);
  assert.equal(!out.ok && 'refusal' in out ? out.refusal.code : '', 'IMMUTABLE_FIELD');
  assert.ok(k.update('session', heard.value.id, { state: 'idle' }, owner).ok);
  const now = k.get(heard.value.id)!;
  assert.deepEqual([now.fields.next, now.fields.seen_before], ['Mine to take', undefined]);
  sql.close();
});
