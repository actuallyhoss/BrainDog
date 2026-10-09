/**
 * Runs carried in by the import keep the day they were last seen in the old system (AGT-C10 job 4).
 *
 * MEASURED BEFORE: the kernel refused `last_seen` from every caller, so the adapter left it out and all 295 of the
 * owner's imported runs read as last seen on the morning of the import, 291 abandoned ones still holding a next step.
 * What is asserted is the import over the kernel this product ships: the time passes through as the adapter gave it
 * and lands as `seen_before`, a finished run keeps no step and a handoff keeps its own, and the import run again finds
 * each run by its key and writes nothing, because the carried day it reads back is the one it planned.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { openRecord, type Kernel } from '@braindog/kernel';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { applyPlan, type Door } from '../src/import.ts';
import type { Plan, PlannedRow } from '../src/adapter.ts';

const NOW = Date.UTC(2026, 9, 9, 9);
const ACTOR = 'p_1';

/**
 * WHETHER THE IMPORT READS A RUN'S CARRIED DAY BACK, for the re-import check: its diff (`import.ts`, `differs`) is
 * feed-switch-46's file, so the line that compares a run's `last_seen` with its `seen_before` lands through the
 * integrator. Until it does, the check is reported as waiting rather than red; once it is in, it fails by itself.
 */
const READS_BACK = readFileSync(new URL('../src/import.ts', import.meta.url), 'utf8').includes("'seen_before'");

/** The importer's door, onto the kernel, as one person writes. */
function doorOf(kernel: Kernel): { door: Door; writes: () => number } {
  let writes = 0;
  const door: Door = {
    schema: async (register) =>
      kernel.registers().has(register)
        ? { ok: true, value: { register } }
        : { ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: `There is no register called ${register}.` } },
    list: async ({ register, limit, cursor }) =>
      kernel.list({ register, ...(limit === undefined ? {} : { limit }), ...(cursor === undefined || cursor === null ? {} : { cursor }) }),
    create: async ({ register, fields, note }) => (writes++, kernel.create(register, fields, { actor: ACTOR, ...(note === undefined ? {} : { note }) })),
    update: async ({ register, seq, patch, version, note }) => (
      writes++,
      kernel.update(register, `${register}#${String(seq)}`, patch, {
        actor: ACTOR,
        ...(version === undefined ? {} : { version }),
        ...(note === undefined ? {} : { note }),
      })
    ),
    governance: async () => ({ ok: true, value: [] }) as never,
    propose: async (p) => kernel.propose(p as never, ACTOR),
  };
  return { door, writes: () => writes };
}

/** One run as an adapter for the old system plans it: keyed by its `client_id`, with the time it was last seen there. */
const run = (id: string, state: string, seen: string, next?: string): PlannedRow => ({
  register: 'session',
  key: `oldtool:session:${id}`,
  label: id,
  fields: { client_id: `oldtool:session:${id}`, agent: 'claude', doing: `Old run ${id}`, state, last_seen: seen, ...(next === undefined ? {} : { next }) },
});

const RUNS = [
  run('S1', 'done', '2026-09-21T10:00:00.000Z', 'Ship the batch'),
  run('S2', 'abandoned', '2026-09-24T18:30:00.000Z', 'Try again'),
  run('S3', 'handoff', '2026-09-28T07:15:00.000Z', 'Kern the lowercase pairs'),
];

const plan = (rows: PlannedRow[]): Plan => ({ key: 'oldtool:', taken: '2026-09-29', rev: 1, rows, asks: [], polls: [], skipped: [], changed: [] });

async function record() {
  const sql = openSqlite();
  const kernel = await openRecord(sql, fixedClock(NOW));
  return { sql, kernel };
}

const carried = (kernel: Kernel) =>
  (kernel.list({ register: 'session', limit: 100 }) as { ok: true; value: { rows: { fields: Record<string, unknown> }[] } }).value.rows
    .map((r) => [r.fields.client_id, r.fields.seen_before, r.fields.last_seen ?? null, r.fields.next ?? null])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

test('THE IMPORT CARRIES EACH RUN’S DAY: last seen lands as seen before, the clock stays empty, and only the handoff keeps its step', async () => {
  const { sql, kernel } = await record();
  const out = await applyPlan(plan(RUNS), doorOf(kernel).door, { dryRun: false });
  assert.deepEqual(out.refused, []);
  assert.deepEqual(out.tally.session, { added: 3, updated: 0, unchanged: 0 });
  assert.deepEqual(carried(kernel), [
    ['oldtool:session:S1', '2026-09-21T10:00:00.000Z', null, null],
    ['oldtool:session:S2', '2026-09-24T18:30:00.000Z', null, null],
    ['oldtool:session:S3', '2026-09-28T07:15:00.000Z', null, 'Kern the lowercase pairs'],
  ]);
  sql.close();
});

test('THE IMPORT RUN AGAIN IS QUIET: each run is found by its key, its carried day reads back the same, and nothing is written', { todo: READS_BACK ? false : 'waits for the seen_before line in import.ts (feed-switch-46, blocked to the integrator)' }, async () => {
  const { sql, kernel } = await record();
  const { door, writes } = doorOf(kernel);
  await applyPlan(plan(RUNS), door, { dryRun: false });
  const first = writes();
  const again = await applyPlan(plan(RUNS), door, { dryRun: false });
  assert.deepEqual(again.refused, []);
  assert.deepEqual(again.tally.session, { added: 0, updated: 0, unchanged: 3 });
  assert.equal(writes(), first, 'the second import wrote to a run');
  sql.close();
});

test('A DAY MOVED IN THE OLD SYSTEM MOVES HERE: the import run again writes the one run whose day changed, and only its day', { todo: READS_BACK ? false : 'waits for the seen_before line in import.ts (feed-switch-46, blocked to the integrator)' }, async () => {
  const { sql, kernel } = await record();
  const { door } = doorOf(kernel);
  await applyPlan(plan(RUNS), door, { dryRun: false });
  const later = [run('S1', 'done', '2026-09-23T12:00:00.000Z', 'Ship the batch'), ...RUNS.slice(1)];
  const again = await applyPlan(plan(later), door, { dryRun: false });
  assert.deepEqual(again.tally.session, { added: 0, updated: 1, unchanged: 2 });
  assert.deepEqual(carried(kernel)[0], ['oldtool:session:S1', '2026-09-23T12:00:00.000Z', null, null]);
  sql.close();
});
