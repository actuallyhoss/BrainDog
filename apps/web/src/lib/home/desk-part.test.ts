/**
 * Today's desk tiles as blocks of its body (`desk-part.ts`): who is working is drawn as Working now from the block's own
 * rows, and a block of runs with nobody at work is not drawn.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { LiveBlock } from '../record/page-live.ts';
import { desked, runsOf } from './desk-part.ts';

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

test('THE RUNS AT WORK ARE READ OFF THE BLOCK: the agent, what it is doing, the project by its cell and when it began', () => {
  const b = working([{ seq: 7, fields: { agent: 'claude', doing: 'Fix the hero' }, created: '2026-10-24T11:30:00Z' }] as never, [['Claude', 'Fix the hero', 'Kiln', '']]);
  const [run] = runsOf(b);
  assert.equal(run?.seq, 7);
  assert.equal(run?.doing, 'Fix the hero');
  assert.equal(run?.project, 'Kiln');
  assert.equal(run?.since, '2026-10-24T11:30:00Z');
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
