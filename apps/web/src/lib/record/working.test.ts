/**
 * `working: true`'s truth: not who changed a row last, but whether that actor is still at it.
 *
 * `workingNowAt` takes the ledger and the runs as arguments precisely so a test can hand it rows
 * nobody wrote and runs nobody opened, rather than waiting for the sample's own frozen clock to line
 * up with a write that happened to land in the last 45 minutes — which, at the sample's fixed `NOW`,
 * none of the seed's agent-authored rows do (checked below, against the real ledger).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { WORKING_MARK } from 'braindog-render';

import './fixtures/fill.ts';
import { workingNowAt } from './api.ts';
import { readBlock as webBlock, workingNow } from './fixtures/readers.ts';
import { ROWS } from './fixtures/sample.ts';
import { toSegments } from './blocks.ts';
import type { PageBlock } from './schema.ts';

const HOUR = 3_600_000;
const NOW = Date.parse('2026-09-03T12:00:00.000Z');

/** A run, shaped just enough for `workingAt` to read: `agent`, `state`, `last_seen`. */
const run = (agent: string, state: string, minutesAgo: number) => ({
  seq: 1,
  version: 1,
  created: '',
  by: agent,
  fields: { agent, state, last_seen: new Date(NOW - minutesAgo * 60_000).toISOString() },
});

test('AN AGENT WHO JUST WROTE THE ROW, AND IS STILL RUNNING, LIGHTS THE DOT', () => {
  const audit = [{ by: 'claude', at: new Date(NOW - 2 * 60_000).toISOString(), target: 'tasks#9' }];
  const runs = [run('claude', 'active', 1)];
  assert.equal(workingNowAt('tasks', 9, NOW, audit, runs), true);
});

test('THE SAME AGENT, WRITTEN THREE HOURS AGO, DOES NOT LIGHT — EVEN IF IT IS RUNNING RIGHT NOW', () => {
  const audit = [{ by: 'claude', at: new Date(NOW - 3 * HOUR).toISOString(), target: 'tasks#9' }];
  const runs = [run('claude', 'active', 1)];
  assert.equal(workingNowAt('tasks', 9, NOW, audit, runs), false, 'a stale touch is not "right now"');
});

test('THE SAME AGENT, WRITTEN JUST NOW, DOES NOT LIGHT WHEN ITS OWN RUN HAS GONE QUIET', () => {
  const audit = [{ by: 'claude', at: new Date(NOW - 1 * 60_000).toISOString(), target: 'tasks#9' }];
  const runs = [run('claude', 'active', 50)]; // past STALE_MS (45m)
  assert.equal(workingNowAt('tasks', 9, NOW, audit, runs), false);
});

test('AN IDLE RUN IS NOT A LIVE ONE, even heard from a minute ago', () => {
  const audit = [{ by: 'claude', at: new Date(NOW - 1 * 60_000).toISOString(), target: 'tasks#9' }];
  const runs = [run('claude', 'idle', 1)];
  assert.equal(workingNowAt('tasks', 9, NOW, audit, runs), false);
});

test('A PERSON OR A RULE HAS NO RUN TO BE AT', () => {
  const audit = [{ by: 'you', at: new Date(NOW - 1 * 60_000).toISOString(), target: 'tasks#9' }];
  assert.equal(workingNowAt('tasks', 9, NOW, audit, [run('claude', 'active', 1)]), false);
  const ruled = [{ by: 'rule.reply', at: new Date(NOW - 1 * 60_000).toISOString(), target: 'tasks#9' }];
  assert.equal(workingNowAt('tasks', 9, NOW, ruled, [run('claude', 'active', 1)]), false);
});

test('A DIFFERENT ROW’S TOUCH DOES NOT LIGHT THIS ONE', () => {
  const audit = [{ by: 'claude', at: new Date(NOW - 1 * 60_000).toISOString(), target: 'tasks#1' }];
  assert.equal(workingNowAt('tasks', 9, NOW, audit, [run('claude', 'active', 1)]), false);
});

test('NOTHING IN THE LEDGER ABOUT THE ROW ANSWERS FALSE, not an error', () => {
  assert.equal(workingNowAt('tasks', 9, NOW, [], []), false);
});

test('IN THE SAMPLE, ONE ROW LIGHTS AND THE REST DO NOT', () => {
  /* `tasks#8` is what `session#1` is on: Claude, active, heard from three minutes ago, and a ledger
     line six minutes old naming that row. The demo carries exactly one so the dot is a thing a person
     can actually see; every other row must stay dark, including rows the same agent wrote hours ago,
     because "an agent is running" is not "on this row, right now". */
  assert.equal(workingNow('tasks', 8), true);
  assert.equal(workingNow('tasks', 12), false, 'a write from hours ago is not work in progress');
  assert.equal(workingNow('services', 6), false);
  assert.equal(ROWS.tasks!.filter((r) => workingNow('tasks', r.seq)).length, 1, 'the demo lights more than the one row a run is on');
});

/* ── and what a page does with the answer ────────────────────────────────── */

/** Each drawn row's first cell, which is the cell a `todo` calls the row by. */
const firstCells = (block: ReturnType<typeof webBlock>): string[] =>
  toSegments(block).flatMap((seg) => ('rows' in seg ? (seg.rows as { cells: string[] }[]).map((r) => r.cells[0] ?? '') : []));

test('A BLOCK THAT ASKS CARRIES THE ANSWER, and the drawer marks the rows the answer names', () => {
  const declared = { kind: 'todo', source: 'register.tasks', columns: [{ field: 'what' }], limit: 3, working: true } as PageBlock;
  const block = webBlock(declared);
  /* `working: true` WAS REFUSED BY BOTH ENGINES until this pass — it was in neither `READS` — so a
     page could not turn on a dot both renderers had always known how to draw. */
  assert.deepEqual(block.refusals, [], block.refusals.join('; '));
  assert.ok(Array.isArray(block.working_now), 'the evaluator did not answer working: true');
  assert.equal(block.working_now!.length, block.entries.length);

  const marked = firstCells({ ...block, working_now: block.entries.map((_e, i) => i === 1) });
  assert.equal(marked.length, 3);
  assert.ok(!marked[0]!.startsWith(WORKING_MARK), 'a row nobody is on wears the mark');
  assert.ok(marked[1]!.startsWith(WORKING_MARK), 'the row an agent is on wears no mark');
  assert.ok(!marked[2]!.startsWith(WORKING_MARK));
  /* THE ROW IS STILL THE ROW. The mark is written onto the cell, so the name has to survive it. */
  assert.equal(marked[1]!.slice(WORKING_MARK.length), marked[1]!.slice(WORKING_MARK.length).trim());

  /* AND A BLOCK THAT DID NOT ASK DRAWS NO DOTS, whoever is working. */
  const { working: _off, ...unasked } = declared as Record<string, unknown>;
  const quiet = webBlock(unasked as PageBlock);
  assert.equal(quiet.working_now, undefined);
  assert.ok(!firstCells(quiet).some((c) => c.startsWith(WORKING_MARK)));
});

test('A BOARD’S DOT FOLLOWS ITS CARD when the board sorts its columns, and does not stay behind on the row that took its place', () => {
  const block = webBlock({
    kind: 'board',
    source: 'register.tasks',
    columns: [{ field: 'state' }, { field: 'what' }, { field: 'thing' }],
    where: 'state is not dropped',
    working: true,
  } as PageBlock);
  assert.deepEqual(block.refusals, [], block.refusals.join('; '));

  /* A `board` is drawn in its state's declared order, not the register's, and `working_now` is
     answered in the register's. Until this was carried through the sort, the dot sat on whichever
     card had stood where the worked-on one was: an agent shown on a row it has never touched. */
  const cards = toSegments(block).flatMap((seg) => ('rows' in seg ? (seg.rows as { cells: string[] }[]).map((r) => r.cells[1] ?? '') : []));
  const marked = cards.filter((c) => c.startsWith(WORKING_MARK));
  assert.deepEqual(marked.map((c) => c.slice(WORKING_MARK.length)), ['Variable axis QA on the new cut'], 'the dot is on the wrong card');
});
