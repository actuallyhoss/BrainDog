/**
 * A picture the export names that nothing here draws is left out, and the report says how many.
 *
 * WHAT WAS ON HIS RECORD. The old tool kept its own word for each project's picture, the importer carried the word
 * across as it stood, and the Projects page drew the first letter of that word where the picture should be: H, I and P
 * beside eleven projects, none of them the project's own initial. A list says which field is its picture in its
 * `identity.mark`, and the kernel says whether a word is one the set draws (`isMarkGlyph`), so the import asks that
 * and sends the project without the word. It then takes a picture the way a new project does.
 *
 * A CONTROL IS LEFT OUT BY THE SAME QUESTION, and that one used to cost the whole project: the record refuses a
 * button's name as a picture (`MARK_IS_CONTROL`), so the name, the lane and everything else went with it.
 *
 * THE ROWS ARE PLANNED BY HAND AND THE KERNEL ANSWERS, as in `import-note.test.ts`. EVERY VALUE IS MADE UP.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Kernel } from '@braindog/kernel';
import { declarations } from '@braindog/seed';

import { isMarkGlyph, isUnknownMark } from '../../../packages/kernel/src/marks.ts';
import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import type { Plan, PlannedRow } from '../src/adapter.ts';
import { applyPlan, said, type Door } from '../src/import.ts';

const NOW = Date.UTC(2026, 8, 22, 6);
const ACTOR = 'p_1';

async function record(t: { after: (fn: () => unknown) => void }): Promise<Kernel> {
  const sql = openSqlite();
  t.after(() => sql.close());
  const kernel = await openRecord(sql, fixedClock(NOW));
  const put = await kernel.install(declarations() as never);
  assert.ok(put.ok, put.ok ? '' : `the lists would not install: ${JSON.stringify(put)}`);
  return kernel;
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

const project = (id: string, name: string, mark?: string): PlannedRow => ({
  register: 'things',
  key: `tally:project:${id}`,
  label: name,
  fields: { name, lane: 'building', ...(mark === undefined ? {} : { mark }) },
});
const planOf = (rows: PlannedRow[]): Plan => ({ key: 'tally:', taken: null, rev: null, rows, asks: [], polls: [], skipped: [], changed: [] });

/** Each imported project's picture, by its name. */
async function marks(kernel: Kernel): Promise<Record<string, unknown>> {
  const got = await kernel.list({ register: 'things', limit: 100 });
  assert.ok(got.ok);
  return Object.fromEntries(got.value.rows.map((r) => [String(r.fields.name), r.fields.mark]));
}

const FOUR = [project('1', 'Kiln Works', 'koala'), project('2', 'Harbour Type', 'Rocket'), project('3', 'Quiet Ledger', 'close'), project('4', 'Lantern', 'star')];

test('A PICTURE NOTHING DRAWS IS LEFT OUT, the project arrives all the same, and the report says how many', async (t) => {
  const kernel = await record(t);
  const report = await applyPlan(planOf(FOUR), doorOf(kernel), { dryRun: false, isMark: isMarkGlyph });

  assert.deepEqual(report.refused, [], 'a project was refused');
  assert.deepEqual(report.tally.things, { added: 4, updated: 0, unchanged: 0 });
  const got = await marks(kernel);
  assert.equal(got.Lantern, 'star', 'a picture the set draws was not carried');
  for (const name of ['Kiln Works', 'Harbour Type', 'Quiet Ledger']) assert.ok(!isUnknownMark(got[name]), `${name} wears ${String(got[name])}, which draws nothing`);

  assert.equal(report.pictures, 3);
  const lines = said(report, { dryRun: false, file: 'export.json' });
  assert.ok(lines.includes('3 pictures were not known, so each of those was left out and takes one the way a new one does.'), lines.join(' | '));
  assert.ok(!lines.some((l) => /koala|Rocket|things#|\bmark\b/u.test(l)), `the report names a word or an id: ${lines.join(' | ')}`);
});

test('THE SAME EXPORT AGAIN changes nothing, and says the same count', async (t) => {
  const kernel = await record(t);
  const door = doorOf(kernel);
  await applyPlan(planOf(FOUR), door, { dryRun: false, isMark: isMarkGlyph });
  const before = await marks(kernel);
  const again = await applyPlan(planOf(FOUR), door, { dryRun: false, isMark: isMarkGlyph });
  assert.deepEqual(again.tally.things, { added: 0, updated: 0, unchanged: 4 });
  assert.deepEqual(await marks(kernel), before);
  assert.equal(again.pictures, 3);
});

test('ONE IS SAID AS ONE, a dry run says would, and none is said by no line at all', async (t) => {
  const kernel = await record(t);
  const one = await applyPlan(planOf([project('1', 'Kiln Works', 'koala'), project('4', 'Lantern', 'star')]), doorOf(kernel), { dryRun: true, isMark: isMarkGlyph });
  assert.ok(said(one, { dryRun: true, file: 'export.json' }).includes('One picture was not known, so it would be left out and take one the way a new one does.'));
  assert.deepEqual(await marks(kernel), {}, 'a dry run wrote');

  /* An empty picture is nothing chosen, and a project with none planned has nothing to leave out. */
  const none = await applyPlan(planOf([project('4', 'Lantern', 'star'), project('5', 'Saltmarsh'), project('6', 'Orchard', '')]), doorOf(kernel), { dryRun: true, isMark: isMarkGlyph });
  assert.equal(none.pictures ?? 0, 0);
  assert.ok(!said(none, { dryRun: true, file: 'export.json' }).some((l) => l.includes('picture')));
});

test('A LIST THAT NAMES NO PICTURE FIELD keeps a field called mark as it came', async (t) => {
  const kernel = await record(t);
  const door = doorOf(kernel);
  /* The record answers with a list that declares no `identity`, as any list of somebody's own may. */
  const plain: Door = {
    ...door,
    schema: async (register) => {
      const has = await door.schema(register);
      if (!has.ok) return has;
      const { identity: _dropped, ...rest } = has.value as Record<string, unknown>;
      return { ok: true, value: rest };
    },
  };
  const report = await applyPlan(planOf([project('1', 'Kiln Works', 'koala')]), plain, { dryRun: false, isMark: isMarkGlyph });
  assert.equal(report.pictures ?? 0, 0);
  assert.equal((await marks(kernel))['Kiln Works'], 'koala');
});

/**
 * A PROJECT ALREADY HERE THAT WEARS A WORD NOTHING DRAWS IS REPAIRED BY THE NEXT IMPORT.
 *
 * The eleven projects were written before the import asked the question, so each holds the old tool's word, and
 * leaving the word out of the patch left it on the project. The import now clears it, and says how many it cleared.
 * The record is filled the old way first: every word answered as a picture, so it is carried as it stood.
 */
const asItCame = (): boolean => true;
const THREE = [project('1', 'Kiln Works', 'koala'), project('2', 'Harbour Type', 'Rocket'), project('4', 'Lantern', 'star')];

test('A WORD NOTHING DRAWS THAT IS ALREADY ON A PROJECT IS CLEARED, once, and the report says how many', async (t) => {
  const kernel = await record(t);
  const door = doorOf(kernel);
  await applyPlan(planOf(THREE), door, { dryRun: false, isMark: asItCame });
  assert.deepEqual(await marks(kernel), { 'Kiln Works': 'koala', 'Harbour Type': 'Rocket', Lantern: 'star' }, 'the record was not filled the old way');

  const dry = await applyPlan(planOf(THREE), door, { dryRun: true, isMark: isMarkGlyph });
  assert.equal(dry.repaired, 2);
  assert.ok(said(dry, { dryRun: true, file: 'export.json' }).includes('2 pictures already here were not known, so each of those would be cleared and take one the way a new one does.'));
  assert.equal((await marks(kernel))['Kiln Works'], 'koala', 'a dry run wrote');

  const report = await applyPlan(planOf(THREE), door, { dryRun: false, isMark: isMarkGlyph });
  assert.deepEqual(report.refused, [], 'a repair was refused');
  assert.deepEqual(report.tally.things, { added: 0, updated: 2, unchanged: 1 });
  const got = await marks(kernel);
  assert.equal(got.Lantern, 'star', 'a picture the set draws was touched');
  for (const name of ['Kiln Works', 'Harbour Type']) assert.ok(!isUnknownMark(got[name]), `${name} still wears ${String(got[name])}`);
  assert.equal(report.repaired, 2);
  const lines = said(report, { dryRun: false, file: 'export.json' });
  assert.ok(lines.includes('2 pictures already here were not known, so each of those was cleared and takes one the way a new one does.'), lines.join(' | '));
  assert.ok(!lines.some((l) => /koala|Rocket|things#/u.test(l)), `the report names a word or an id: ${lines.join(' | ')}`);

  /* Repaired is repaired: the night after has nothing to clear and says nothing about clearing. */
  const again = await applyPlan(planOf(THREE), door, { dryRun: false, isMark: isMarkGlyph });
  assert.deepEqual(again.tally.things, { added: 0, updated: 0, unchanged: 3 });
  assert.equal(again.repaired ?? 0, 0);
  assert.ok(!said(again, { dryRun: false, file: 'export.json' }).some((l) => l.includes('cleared')));
});

test('ONE CLEARED IS SAID AS ONE, and a picture the export now names is set and not counted as cleared', async (t) => {
  const kernel = await record(t);
  const door = doorOf(kernel);
  await applyPlan(planOf([project('1', 'Kiln Works', 'koala'), project('2', 'Harbour Type', 'Rocket')]), door, { dryRun: false, isMark: asItCame });
  const report = await applyPlan(planOf([project('1', 'Kiln Works', 'koala'), project('2', 'Harbour Type', 'star')]), door, { dryRun: false, isMark: isMarkGlyph });
  assert.equal(report.repaired, 1);
  assert.equal((await marks(kernel))['Harbour Type'], 'star');
  assert.ok(said(report, { dryRun: false, file: 'export.json' }).includes('One picture already here was not known, so it was cleared and takes one the way a new one does.'));
});
