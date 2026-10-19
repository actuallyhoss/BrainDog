/**
 * A note is cleaned on the way in: the old tool's status line, the name heading and a chips block with an unfilled slot
 * are not written, the real sentence is, and a note with nothing real left is not written at all.
 * The doors and the planned rows are those of `import-note.test.ts`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Kernel } from '@braindog/kernel';
import { declarations } from '@braindog/seed';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import type { Plan, PlannedRow } from '../src/adapter.ts';
import { applyPlan, type Door } from '../src/import.ts';

const NOW = Date.UTC(2026, 9, 20, 6);
const ACTOR = 'p_1';

function doorOf(kernel: Kernel): Door {
  return {
    schema: async (register) => {
      const decl = kernel.register(register);
      return decl ? { ok: true, value: decl } : { ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: `There is no register called ${register}.` } };
    },
    list: async ({ register, limit, cursor }) =>
      kernel.list({ register, ...(limit === undefined ? {} : { limit }), ...(cursor === undefined || cursor === null ? {} : { cursor }) }),
    create: async ({ register, fields, note }) => kernel.create(register, fields, { actor: ACTOR, ...(note === undefined ? {} : { note }) }),
    update: async ({ register, seq, patch, version, note }) =>
      kernel.update(register, `${register}#${String(seq)}`, patch, { actor: ACTOR, ...(version === undefined ? {} : { version }), ...(note === undefined ? {} : { note }) }),
    governance: async () => ({ ok: true, value: [] }),
    propose: async (p) => kernel.propose(p as never, ACTOR),
  };
}

const domain = (name: string, note: string): PlannedRow => ({
  register: 'services',
  key: `tallybook:domain:${name}`,
  label: name,
  fields: { name, kind: 'domain', cycle: 'yearly', state: 'live', provider: 'Cove Domains', note },
});

const planOf = (rows: PlannedRow[]): Plan => ({ key: 'tallybook:', taken: null, rev: null, rows, asks: [], polls: [], skipped: [], changed: [] });

test('A NOTE ARRIVES WITHOUT WHAT THE OLD TOOL LEFT IN IT, AND A NOTE WITH NOTHING REAL LEFT IS NOT WRITTEN', async () => {
  const sql = openSqlite();
  const kernel = await openRecord(sql, fixedClock(NOW));
  const put = await kernel.install(declarations() as never);
  assert.ok(put.ok);
  const messy = '# brain.example\n\nStatus in Old Tool: live. Kind: work.\n\n```chips\ndollar | {{revenue.monthly}} | Monthly | good\n```\n\nHeld for the spring launch.';
  const empty = '# cove.example\nStatus in Old Tool: live. Kind: work.';
  const report = await applyPlan(planOf([domain('brain.example', messy), domain('cove.example', empty)]), doorOf(kernel), { dryRun: false });
  assert.deepEqual(report.refused, []);
  const got = await kernel.list({ register: 'services', limit: 50 });
  assert.ok(got.ok);
  const rows = Object.fromEntries(got.value.rows.map((r) => [String((r.fields as { name?: unknown }).name), r.fields as Record<string, unknown>]));
  assert.equal(rows['brain.example']?.note, 'Held for the spring launch.');
  assert.equal(rows['cove.example']?.note, undefined);
  assert.deepEqual(rows['brain.example']?.tags, ['tallybook:domain:brain.example'], 'the import tag stays as provenance');
  sql.close();
});
