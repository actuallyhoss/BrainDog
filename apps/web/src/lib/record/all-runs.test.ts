/**
 * TODAY'S RUNS AS LANES (`agentDay`, `rowsOf` in `all-runs.ts`): runs that overlap in a lane sit on rows of their own,
 * up to three, and the axis starts at the hour the first run did, so runs late in the day are not stacked on now.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LANE_ROWS, agentDay, notTheirs, readAllRuns, rowsOf } from './all-runs.ts';

/** A host answering each read as `answers` says, by method, and every other with nothing. */
function host(answers: Record<string, { status: number; body: unknown }>): () => void {
  const was = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL) => {
    const method = new URL(String(url)).pathname.split('/').at(-1) ?? '';
    const a = answers[method] ?? { status: 200, body: { ok: true, value: [] } };
    return new Response(JSON.stringify(a.body), { status: a.status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return () => void (globalThis.fetch = was);
}

test('JOBS THAT ARE NOT THIS READER\'S ARE NOT A LIST CUT SHORT, and a source that failed still is (24 Oct, H26)', async () => {
  /* A KEY, AS THE LIVE LOOK READS: jobs are an owner's in a browser, and refused to it. */
  const noJobs = { status: 403, body: { ok: false, refusal: { code: 'NEEDS_BROWSER_SESSION', fix: 'Open this from the app; a token cannot read the jobs.' } } };
  const list = { status: 200, body: { ok: true, value: { rows: [], matched: 0 } } };
  let done = host({ listJobs: noJobs, list });
  try {
    const out = await readAllRuns('https://record.example/r', Date.UTC(2026, 9, 24, 18));
    assert.equal(out.from, 'ready');
    assert.equal(out.from === 'ready' && out.short, false, 'the page said some runs could not be read');
  } finally {
    done();
  }
  /* A SOURCE THE RECORD COULD NOT ANSWER IS STILL SAID. */
  done = host({ listJobs: { status: 500, body: { ok: false, refusal: { code: 'INTERNAL', fix: 'internal' } } }, list });
  try {
    const out = await readAllRuns('https://record.example/r', Date.UTC(2026, 9, 24, 18));
    assert.equal(out.from === 'ready' && out.short, true);
  } finally {
    done();
  }
  for (const code of ['ROUTE_UNKNOWN', 'NEEDS_BROWSER_SESSION', 'FORBIDDEN']) assert.equal(notTheirs(code), true, code);
  for (const code of ['INTERNAL', 'UNREACHABLE', 'VERSION_STALE']) assert.equal(notTheirs(code), false, code);
});

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
