/**
 * The keys this domain's answers added are answer keys: a lines block's `latest` and a live block's `quiet`.
 *
 * `ANSWER_KEYS` (`block-keys.ts`) is two lists in one. It is what a block read back is allowed to carry, so a block
 * redrawn from its own answer is not refused for a key the read wrote; and it is what the record takes off a block it
 * holds from a reader (`shellOf` in `packages/record`). Measured with `latest` missing from it: a member invited to
 * Notes alone opened a page whose lines block reads Points and was handed `latest: [{ measure: 'Churn', value: 3 }]`
 * off the held block, a number from a list she may not read.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ANSWER_KEYS, openRecord, type Declaration } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 2, 12);
const OWNER = { actor: 'p_1' };

const POINTS: Declaration = {
  id: 'register.points',
  kind: 'register',
  body: { id: 'points', name: 'Points', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'value', type: 'decimal' }, { id: 'at', type: 'instant' }] } as never,
};

test('A LINES BLOCK’S latest AND A LIVE BLOCK’S quiet ARE ANSWER KEYS, so a held block keeps neither and one read back is not refused', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([POINTS])).ok);
  assert.ok(k.create('points', { name: 'Churn', value: 3, at: new Date(NOW).toISOString() }, OWNER).ok);
  assert.ok(k.create('session', { doing: 'Fix the export', agent: 'claude', state: 'active' }, { actor: 'p_1', stamp: { last_seen: new Date(NOW).toISOString() } }).ok);

  const lines = k.block({ kind: 'lines', source: 'register.points', columns: [{ field: 'at' }, { field: 'value' }, { field: 'name' }] } as never);
  const live = k.block({ kind: 'cards', source: 'sessions.live', columns: [{ field: 'doing', as: 'title' }] } as never);
  assert.deepEqual([lines.latest?.length, live.quiet], [1, [false]], 'the premise: both answers carry the key');
  for (const [drawn, declared] of [
    [lines, ['kind', 'source', 'columns']],
    [live, ['kind', 'source', 'columns']],
  ] as const) {
    const answered = Object.keys(drawn).filter((key) => !declared.includes(key as never));
    assert.deepEqual(answered.filter((key) => !ANSWER_KEYS.includes(key)), [], `${drawn.source} answered a key ANSWER_KEYS does not hold`);
    assert.deepEqual(k.block(drawn as never).refusals, [], `${drawn.source} read back was refused for a key its own read answered`);
  }
  sql.close();
});
