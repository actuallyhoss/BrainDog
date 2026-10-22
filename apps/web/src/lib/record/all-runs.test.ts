/**
 * TODAY'S RUNS AS LANES (`agentDay`, `rowsOf` in `all-runs.ts`): runs that overlap in a lane sit on rows of their own,
 * up to three, and the axis starts at the hour the first run did, so runs late in the day are not stacked on now.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LANE_ROWS, agentDay, rowsOf } from './all-runs.ts';

test('RUNS THAT OVERLAP SIT ON ROWS OF THEIR OWN, and one that follows another shares its row', () => {
  const { spans, rows } = rowsOf([
    { at: 0, width: 50, live: false },
    { at: 10, width: 20, live: false },
    { at: 60, width: 10, live: true },
  ]);
  assert.equal(rows, 2);
  assert.deepEqual(
    spans.map((s) => s.row),
    [0, 1, 0],
  );
});

test('PAST THREE ROWS A RUN SHARES THE ROW THAT FREES FIRST', () => {
  const { spans, rows } = rowsOf(Array.from({ length: 5 }, () => ({ at: 99.4, width: 0.6, live: true })));
  assert.equal(rows, LANE_ROWS);
  assert.equal(new Set(spans.map((s) => s.row)).size, LANE_ROWS);
});

test('THE AXIS STARTS AT THE HOUR THE FIRST RUN DID, and a run begun a moment ago ends at now inside the track', () => {
  const now = new Date(2026, 8, 3, 15, 0).getTime();
  const at = (h: number, m: number) => new Date(2026, 8, 3, h, m).toISOString();
  const day = agentDay(
    [
      { seq: 1, state: 'active', fields: { agent: 'claude', started: at(11, 30), last_seen: at(15, 0) } },
      { seq: 2, state: 'active', fields: { agent: 'claude', started: at(15, 0), last_seen: at(15, 0) } },
    ],
    now,
  )!;
  assert.equal(day.ticks[0]?.label, '11:00');
  const late = day.lanes[0]!.spans.find((s) => s.at > 50)!;
  assert.ok(late.at + late.width <= 100);
  assert.equal(day.lanes[0]!.rows, 2);
});
