/**
 * Today's desk tiles as blocks of its body (`desk-part.ts`): who is working is drawn as Working now from the block's own
 * rows, and a block of runs with nobody at work is not drawn.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { LiveBlock } from '../record/page-live.ts';
import { desked, runsOf } from './desk-part.ts';
import { liveRows } from './desk.ts';

const NOON = Date.parse('2026-10-24T12:00:00Z');

const working = (entries: LiveBlock['entries'], cells: string[][] = []): LiveBlock =>
  ({
    kind: 'table',
    key: 'working',
    source: 'sessions.working',
    drawn: true,
    refusals: [],
    columns: [{ field: 'agent' }, { field: 'doing' }, { field: 'project' }, { field: 'last_seen' }],
    entries,
    rows: cells.map((c) => ({ cells: c })),
  }) as unknown as LiveBlock;

test('THE RUNS AT WORK ARE READ OFF THE BLOCK: the agent, what it is doing and the project by its cell', () => {
  const b = working([{ seq: 7, fields: { agent: 'claude', doing: 'Fix the hero' }, created: '2026-10-24T11:30:00Z' }] as never, [['Claude', 'Fix the hero', 'Kiln', '']]);
  const [run] = runsOf(b);
  assert.equal(run?.seq, 7);
  assert.equal(run?.doing, 'Fix the hero');
  assert.equal(run?.project, 'Kiln');
});

/* THE AUDIT OF 25 OCTOBER, Z6 (`today-1512-light.png` against `-more/run-904-390-dark-full.png`): Today said "since 22
   Oct" for the run opened 22 Oct 22:21 while Agents said "2 h 54 min" for the same run, this stretch. Today's row says
   no length until `presence` answers, and then the one Agents says. */
test('A RUN OPENED TWO DAYS AGO SAYS NO "since 22 Oct" ON TODAY, and once presence answers, the length Agents says', () => {
  const b = working([{ seq: 904, fields: { agent: 'claude', doing: 'Tidy projects' }, created: '2026-10-22T19:21:00Z' }] as never, [['Claude', 'Tidy projects', 'BrainDog', '']]);
  const [out] = desked([b], NOON, () => '');
  const rows = out?.desk?.kind === 'working' ? out.desk.rows : [];
  assert.equal(rows[0]?.began, '', 'Today says a length the Agents page does not');
  const live = { run: 'S904', name: null, agent: 'claude', machine: null, project: null, repo: null, worktree: null, branch: null, doing: 'Tidy projects', state: 'working', instruction: null, task: null, stopped: null, helpers: [], parent: null, for_s: 2 * 3600 + 54 * 60, heard_s: 5, reach: 'hooks' } as const;
  assert.equal(liveRows(rows, [{ ...live, helpers: [] }], [], NOON)[0]?.began, 'for 2 h 54 min');
});

test('WHO IS WORKING IS THE DESK\'S WORKING NOW TILE, and nobody at work draws no tile', () => {
  const b = working([{ seq: 7, fields: { agent: 'claude' }, created: '2026-10-24T11:30:00Z' }] as never, [['Claude', '', '', '']]);
  const [out] = desked([b], NOON, () => '');
  assert.equal(out?.desk?.kind, 'working');
  assert.equal(out?.desk?.kind === 'working' ? out.desk.rows.length : 0, 1);
  const [none] = desked([working([])], NOON, () => '');
  assert.equal(none?.drawn, false);
  assert.equal(none?.desk, undefined);
});

test('A BLOCK THAT IS NOT ONE OF THE DESK\'S IS LEFT AS IT CAME', () => {
  const other = { ...working([]), key: 'cash', source: 'money.cash' } as LiveBlock;
  assert.equal(desked([other], NOON, () => '')[0], other);
});
