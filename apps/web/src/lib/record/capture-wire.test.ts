/**
 * A `capture` block from the answer to the field: what `draw()` builds from `register` and `fills`, what a live
 * answer carries across `page-live.ts`, and what pressing Add writes.
 *
 * `4cff0163` LANDED THE KIND WITH NO HOST. Both engines answer a capture with the list and what a new row is filled
 * with, and the renderer draws a field from `into` and `set` rows, and nothing in this app wrote those rows: `draw()`
 * fell through to the generic branch, wrote a fence with no rows, and the parser degraded it with "no into row". So a
 * capture declared on any page drew as a degraded block, on the sample and on a record alike, and a live answer lost
 * its list on the way in because `blockOf` resets `register` on every block that is not a register's rows.
 *
 * THE WRITE IS THE REGISTER GRID'S. A line typed under a filter on `/r/tasks` and the same line typed into a capture
 * on a page under the same filter are one act, so they are held here to one row: the same fields, the same required
 * values filled in, the same sentence about what was filled.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { capturePlan, type Block } from 'braindog-render';

import './fixtures/fill.ts';
import { REGISTERS } from './api.ts';
import { readBlock } from './fixtures/readers.ts';
import { draw } from './blocks.ts';
import { blockOf } from './page-live.ts';
import { capturedFields } from './rows-write.ts';
import { registerHref } from './where.ts';
import type { PageBlock } from './schema.ts';
import { captureRow } from '../page/capture.ts';

const AT = Date.UTC(2026, 8, 15, 12);

const declared = (where?: string) => ({ kind: 'capture', heading: 'What needs doing?', register: 'tasks', ...(where === undefined ? {} : { where }) });

/** The one capture a drawn block holds, or a failure naming what was drawn instead. */
function drawnCapture(segments: ReturnType<typeof draw>['segments']): Block {
  const blocks = segments.filter((s): s is Block => s.type === 'block' && s.kind === 'capture');
  assert.equal(blocks.length, 1, `a capture drew ${JSON.stringify(segments.map((s) => (s.type === 'degraded' ? `degraded: ${s.fix}` : s.type)))}`);
  return blocks[0]!;
}

test('A CAPTURE ON THE SAMPLE DRAWS ITS FIELD: the list, where it is, and what a new row inherits', () => {
  const { segments, refusal } = draw(readBlock(declared('state is Later') as unknown as PageBlock));
  assert.equal(refusal, null, 'a capture reads no rows, so it has no empty answer to give');
  const drawn = drawnCapture(segments);
  assert.equal(drawn.heading, 'What needs doing?', "the heading is the field's prompt, so it has to reach the drawer");
  assert.deepEqual(capturePlan(drawn.rows), {
    register: 'tasks',
    label: REGISTERS.tasks!.name,
    href: registerHref('tasks', 'state is Later'),
    inherited: { state: 'backlog' },
  });
});

test('A LIVE CAPTURE KEEPS ITS LIST AND ITS FILLS across the page reader, and draws what the sample draws', () => {
  const live = blockOf({ ...declared('state is Later'), fills: { state: 'backlog' }, rows: [], matched: 0, refusals: [] }, new Map(), AT);
  assert.equal(live.cannot, undefined);
  assert.equal(live.register, 'tasks');
  assert.deepEqual(live.fills, { state: 'backlog' });
  const sample = drawnCapture(draw(readBlock(declared('state is Later') as unknown as PageBlock)).segments);
  assert.deepEqual(capturePlan(drawnCapture(draw(live).segments).rows), capturePlan(sample.rows));
});

test('A LIVE CAPTURE WHOSE FILLS ARE NOT TEXT SAYS IT CANNOT BE DRAWN, rather than adding a row with half its values', () => {
  /* A line under "Later" that dropped the one fill it could not read would add an open task: a write the person
     did not make, and nothing on screen would say so. */
  for (const fills of [{ state: 3 }, ['backlog'], 'backlog', null, undefined]) {
    const live = blockOf({ ...declared('state is Later'), fills, rows: [], matched: 0, refusals: [] }, new Map(), AT);
    assert.equal(typeof live.cannot, 'string', JSON.stringify(fills));
  }
  const nowhere = blockOf({ kind: 'capture', register: 7, fills: {}, rows: [], matched: 0, refusals: [] }, new Map(), AT);
  assert.equal(typeof nowhere.cannot, 'string');
});

test('WHAT A NEW ROW IS FILLED WITH IS THE STORED VALUE, and the page does not dress it as money', () => {
  /* `draw()` puts every cell of a drawn block through `symbolText`, so `USD 5` in a `spec` reads `$5`. A `set` row is
     not read by anyone: it is the value the host writes, and the record keeps `USD 5`. */
  const live = blockOf({ ...declared('agent is USD 5'), fills: { agent: 'USD 5' }, rows: [], matched: 0, refusals: [] }, new Map(), AT);
  assert.deepEqual(capturePlan(drawnCapture(draw(live).segments).rows)?.inherited, { agent: 'USD 5' });
});

test('PRESSING ADD WRITES THE ROW THE REGISTER GRID WRITES for the same line under the same filter', () => {
  const row = captureRow('tasks', 'Book the kiln', { state: 'backlog' }, AT);
  assert.ok(row);
  assert.equal(row.fields[REGISTERS.tasks!.title], 'Book the kiln');
  assert.equal(row.fields.state, 'backlog');
  assert.deepEqual(row, capturedFields('tasks', 'Book the kiln', [{ field: 'state', op: 'is', values: ['backlog'] }], AT));
  /* AND A REQUIRED FIELD NOTHING PINNED IS FILLED AND SAID, as the grid's line does, rather than refused by the record. */
  assert.deepEqual(captureRow('obligations', 'Deposit', {}, AT)?.filled, capturedFields('obligations', 'Deposit', [], AT).filled);
});

test('A LIST THIS BUILD HAS NO DECLARATION FOR CANNOT BE WRITTEN FROM A PAGE, so the host passes no oncapture', () => {
  /* Without the list's title field there is no field to put the line in, and a row with no title is not a row. */
  assert.equal(captureRow('nowhere', 'Book the kiln', {}, AT), null);
});

test('THE PAGE HANDS THE CAPTURE A WRITE ONLY WHERE ONE CAN BE MADE', () => {
  const view = readFileSync(new URL('../page/PageView.svelte', import.meta.url), 'utf8');
  assert.match(view, /oncapture=\{/, 'PageView never hands a capture its write, so every capture draws the read-only line');
  assert.match(view, /captureRow\(/, 'the write is not the grid line one');
});
