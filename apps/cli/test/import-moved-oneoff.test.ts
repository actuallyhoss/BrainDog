/**
 * A ONE-OFF DATE MOVED LATER IN THE OLD TOOL AFTER IT ARRIVED DONE IS OPEN AGAIN, ON ITS NEW DAY.
 *
 * `loop/research-batch-fifty-one-audit.md` finding 5. A one-off's `state` and `done_on` are `PlannedRow.onCreate`,
 * written when the task is made and never patched, so that a state he set is not undone by the next night
 * (`test/legacy-oneoff-state.test.ts`). `by` is patched every night. So the two disagreed the one time the date
 * moved, which is the one fact the state was drawn from. Measured by the audit over this kernel: a return dated
 * 2026-09-01 arrived done on the 17th; moved in the old tool to 2026-10-15, the next night patched `by` and left
 * `state: done`, `done_on: 2026-09-01`, a task done six weeks before its day and in no list of what is due, said under
 * "What changed" as `by` alone. A deadline extended is the common case of a moved date.
 *
 * `applyPlan` RELEASES A ROW'S `onCreate` FIELDS WHEN THE PATCH IT IS ABOUT TO SEND HOLDS `by`, because the date moved
 * and the planner's reading of it is news again. The audit's brief said the planner would then also have to plan
 * `done_on: null` for a one-off still ahead, or the release would leave the old `done_on` behind. Measured, it does
 * not: the release alone sends `by` and `state`, and the record empties `done_on` itself as the task leaves `done`,
 * because Tasks declares `finished: 'done_on'` (`packages/seed/src/modules/work.ts`, `packages/kernel/src/finished.ts`).
 * The `done_on` assertion below is that fact held, so a record that stopped emptying it would fail here.
 *
 * EVERY VALUE BELOW IS MADE UP.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { planLegacyTool } from '../src/legacy.ts';
import { applyPlan } from '../src/import.ts';
import { syntheticExport } from './legacy-export.ts';
import { ACTOR, doorOf, exitOf, record } from './legacy-record.ts';

const NOW = Date.UTC(2026, 8, 17, 9);

type Kernel = Awaited<ReturnType<typeof record>>['kernel'];

/** The audit's EV21 on the day it names: already past on the first night, so it arrives done. */
function exp(date: string): Record<string, unknown> {
  const e = syntheticExport();
  (e.db as Record<string, Record<string, unknown>[]>).events!.push({ id: 'EV21', title: 'File the return', kind: 'deadline', date });
  return e;
}

function theReturn(kernel: Kernel): { id: string; version: number; fields: Record<string, unknown> } {
  const tasks = kernel.list({ register: 'tasks', limit: 200 });
  assert.ok(tasks.ok);
  const got = tasks.value.rows.filter((r) => r.fields.what === 'File the return');
  assert.equal(got.length, 1, `the return is ${String(got.length)} tasks`);
  return got[0] as never;
}

test('A ONE-OFF THAT ARRIVED DONE AND IS MOVED PAST TODAY is open on its new day the next night, and said as more than its day', async () => {
  const { sql, kernel } = await record(NOW);
  await applyPlan(planLegacyTool(exp('2026-09-01'), '2026-09-17'), doorOf(kernel), { dryRun: false });
  const arrived = theReturn(kernel).fields;
  assert.deepEqual([arrived.state, arrived.by, arrived.done_on], ['done', '2026-09-01', '2026-09-01'], 'the first night did not file the return done, so this measures nothing');

  const moved = await applyPlan(planLegacyTool(exp('2026-10-15'), '2026-09-18'), doorOf(kernel), { dryRun: false });
  assert.equal(exitOf(moved), 0, JSON.stringify(moved.refused));
  const now = theReturn(kernel).fields;
  assert.equal(now.by, '2026-10-15');
  assert.equal(now.state, 'open', 'the return is still done six weeks before its day');
  assert.equal(now.done_on ?? null, null, `the return still says it was done on ${String(now.done_on)}`);
  const change = moved.changes.find((c) => c.label.startsWith('File the return'));
  assert.ok(change?.fields.includes('state'), `"What changed" said ${JSON.stringify(change?.fields)} and not the state`);
  sql.close();
});

test('A ONE-OFF WHOSE DAY DID NOT MOVE keeps the state he set, whatever the plan now reads', async () => {
  const { sql, kernel } = await record(NOW);
  await applyPlan(planLegacyTool(exp('2026-09-01'), '2026-09-17'), doorOf(kernel), { dryRun: false });
  const ret = theReturn(kernel);
  const reopened = kernel.update('tasks', ret.id, { state: 'open', done_on: null }, { actor: ACTOR, version: ret.version });
  assert.ok(reopened.ok, JSON.stringify(reopened));

  const again = await applyPlan(planLegacyTool(exp('2026-09-01'), '2026-09-18'), doorOf(kernel), { dryRun: false });
  assert.equal(exitOf(again), 0);
  assert.equal(theReturn(kernel).fields.state, 'open', 'a night with the same day wrote over the state he set');
  assert.deepEqual(again.changes.filter((c) => c.label.startsWith('File the return')), []);
  sql.close();
});
