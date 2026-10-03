/**
 * The live runs a page draws say which have gone quiet, so a declared page tells working from open.
 *
 * MEASURED ON THE OWNER'S RECORD: "Working now" drew four runs that nobody had heard from in hours, each as an agent
 * at work. Quiet is worked out when read and never stored (`isQuiet` in `session.ts`), and `sessions.live` answers it
 * beside the rows from the record's own clock, so every host draws the same runs as gone quiet.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 2, 12);
const MIN = 60_000;

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  /* A RUN AS THE LADDER LEAVES IT: what it is doing, its state, and when it was last heard from. */
  const run = (doing: string, state: string, minutesAgo: number) => {
    const made = k.create('session', { doing, agent: 'claude', state }, { actor: 'p_1', stamp: { last_seen: new Date(NOW - minutesAgo * MIN).toISOString() } });
    assert.ok(made.ok, JSON.stringify(made));
  };
  run('Fix the invoice export', 'active', 5);
  run('Write the release notes', 'active', 95);
  run('Waiting on a review', 'idle', 40);
  run('Hand the migration on', 'handoff', 300);
  return { k, sql };
}

test('SESSIONS.LIVE SAYS WHICH RUNS HAVE GONE QUIET, one flag a run, aligned with the runs it draws', async () => {
  const { k, sql } = await record();
  const live = k.block({ kind: 'cards', source: 'sessions.live', columns: [{ field: 'doing', as: 'title' }, { field: 'agent', as: 'who' }] } as never);
  assert.deepEqual(live.refusals, []);
  const said = live.rows.map((r, i) => [r.fields.doing, live.quiet?.[i]]);
  assert.deepEqual(
    Object.fromEntries(said),
    {
      'Fix the invoice export': false,
      'Write the release notes': true,
      'Waiting on a review': true,
      /* A HANDOFF STOPPED ON PURPOSE, so it is never quiet, however long it waits. */
      'Hand the migration on': false,
    },
  );
  assert.equal(live.quiet?.length, live.rows.length);

  /* CUT TO A LIMIT, THE FLAGS ARE CUT WITH THE RUNS, and a section over the runs, drawn as its count, sends neither. */
  const one = k.block({ kind: 'cards', source: 'sessions.live', columns: [{ field: 'doing', as: 'title' }], limit: 1 } as never);
  assert.deepEqual([one.rows.length, one.quiet?.length, one.matched], [1, 1, 4]);
  const heading = k.block({ kind: 'section', heading: 'Agents', source: 'sessions.live' } as never);
  assert.deepEqual([heading.rows, 'quiet' in heading, heading.matched], [[], false, 4]);
  sql.close();
});
