/**
 * A domain's note, written where the record's Services list has a field for it and named where it has not.
 *
 * WHY THE TWO HALVES ARE ONE FILE. Estate 1.2.0 gives `services` a `note`, and a record that installed Estate before
 * that has no such field until the owner takes the update. The importer cannot choose which record it meets, so it has
 * to be right about both, and the two ways of being wrong are not symmetric. Measured against the kernel before this
 * change, with the note on the planned row: a record without the field answered `services has no field called note.
 * (FIELD_UNKNOWN)` and refused the WHOLE ROW, so the domain's name, renewal day and registrar went missing along with
 * the one field that record could not hold. That is exactly what `holdings.currency` did to fourteen rows at once.
 *
 * THE ROWS ARE PLANNED BY HAND AND NOT BY AN ADAPTER, on purpose. Whether a mapping puts a note on a domain row is
 * the adapter's decision; this file holds `applyPlan` to what it does with one once it is there.
 *
 * THE DOOR ANSWERS `schema` WITH THE REGISTER THE KERNEL HOLDS, as `packages/record`'s `schema` does over HTTP, because
 * the declared field ids in that answer are what the importer reads to tell the two records apart.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Kernel } from '@braindog/kernel';
import { declarations } from '@braindog/seed';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import type { Plan, PlannedRow } from '../src/adapter.ts';
import { applyPlan, said, type Door, type Words } from '../src/import.ts';

const NOW = Date.UTC(2026, 8, 22, 6);
const ACTOR = 'p_1';

type Decl = { id: string; body: { fields?: { id: string }[] } };

/** The shipped declarations, or with `services.note` taken out, which is every record still on Estate 1.1.0. */
async function record(withNote: boolean): Promise<{ sql: { close: () => void }; kernel: Kernel }> {
  const sql = openSqlite();
  const kernel = await openRecord(sql, fixedClock(NOW));
  const decls = (declarations() as unknown as Decl[]).map((d) =>
    withNote || d.id !== 'register.services' ? d : { ...d, body: { ...d.body, fields: (d.body.fields ?? []).filter((f) => f.id !== 'note') } },
  );
  const put = await kernel.install(decls as never);
  assert.ok(put.ok, put.ok ? '' : `the lists would not install: ${JSON.stringify(put)}`);
  return { sql, kernel };
}

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

const NOTE = 'Held against the clearance search of 2026-08. The .gg is not bought and should not be yet.';

const domain = (name: string, note?: string): PlannedRow => ({
  register: 'services',
  key: `tallybook:domain:${name}`,
  label: name,
  fields: { name, kind: 'domain', cycle: 'yearly', state: 'live', provider: 'Cove Domains', ...(note === undefined ? {} : { note }) },
});

/* THE WORDS AN ADAPTER'S `map.json` GIVES: what the list is called and which pack brings it. The command knows neither on
   its own, so the line that names the list is held to saying what these say. */
const WORDS: Words = {
  source: 'the old tool',
  map: { targets: { order: ['services'], optional: [], providedBy: { services: 'Estate' }, names: { services: 'Services' } }, usecase: null, listed: null, raw: {} },
};

const planOf = (rows: PlannedRow[]): Plan => ({ key: 'tallybook:', taken: null, rev: null, rows, asks: [], polls: [], skipped: [], changed: [] });

const held = async (kernel: Kernel): Promise<Record<string, Record<string, unknown>>> => {
  const got = await kernel.list({ register: 'services', limit: 50 });
  assert.ok(got.ok, 'the services would not list');
  return Object.fromEntries(got.value.rows.map((r) => [String((r.fields as { name?: unknown }).name), r.fields as Record<string, unknown>]));
};

test('ON A RECORD WHOSE SERVICES HOLD A NOTE, the note is written, and a second run leaves it unchanged', async () => {
  const { sql, kernel } = await record(true);
  const plan = planOf([domain('brain.example', NOTE), domain('cove.example')]);
  const report = await applyPlan(plan, doorOf(kernel), { dryRun: false });
  assert.deepEqual(report.refused, []);
  const rows = await held(kernel);
  assert.equal(rows['brain.example']?.note, NOTE);
  assert.equal(rows['cove.example']?.note, undefined);
  assert.equal(report.plan.skipped.length, 0, 'nothing was left out, so nothing is said to be');

  const again = await applyPlan(plan, doorOf(kernel), { dryRun: false });
  assert.deepEqual(again.tally.services, { added: 0, updated: 0, unchanged: 2 });
  sql.close();
});

test('ON A RECORD STILL ON THE ESTATE WITH NO NOTE, the row still arrives and the note is named in a line of its own', async () => {
  const { sql, kernel } = await record(false);
  const report = await applyPlan(planOf([domain('brain.example', NOTE), domain('cove.example')]), doorOf(kernel), { dryRun: false, words: WORDS });
  assert.deepEqual(report.refused, [], 'a field this record has not got cost the whole row');
  const rows = await held(kernel);
  assert.deepEqual(Object.keys(rows).sort(), ['brain.example', 'cove.example']);
  assert.equal(rows['brain.example']?.provider, 'Cove Domains', 'the rest of the row came across');

  const line = report.plan.skipped.find((s) => /note/u.test(s.reason));
  assert.ok(line, `no line names the note: ${JSON.stringify(report.plan.skipped)}`);
  assert.deepEqual(line.items, ['brain.example'], 'only the row that had a note is named');
  assert.match(line.reason, /Services/u);
  assert.match(line.reason, /Estate/u, 'the line says which pack to update');
  const printed = said(report, { dryRun: false, file: 'export.json' }).join('\n');
  assert.match(printed, /Left out, and why:[\s\S]*brain\.example/u);
  sql.close();
});
