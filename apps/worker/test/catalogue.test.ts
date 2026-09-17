/**
 * What a hosted record is offered to install, and the carry step an update runs (`@braindog/seed/usecases/catalogue`).
 *
 * A HOSTED PERSONAL 1.0.0 RECORD UPDATED AND LEFT ITS TYPED PROGRESS BEHIND. The carry moved into the record, which runs
 * the catalogue's step, and the Worker handed in no catalogue. `src/index.ts` imports `cloudflare:workers` and cannot be
 * loaded by `node --test`, so the line that hands the list in is read as text, and the list itself is driven through
 * the record exactly as the Worker opens it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createRecordApi, type CallContext } from '@braindog/record';
import { seedCatalogue } from '@braindog/seed/usecases/catalogue';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const value = <T>(r: unknown): T => {
  assert.ok((r as { ok: boolean }).ok, JSON.stringify(r));
  return (r as { value: T }).value;
};

test('THE WORKER HANDS THE SEED CATALOGUE TO EVERY RECORD IT OPENS', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8');
  assert.match(src, /const CATALOGUE = seedCatalogue\(\);/u);
  const opened = src.indexOf('createRecordApi({');
  const handed = src.indexOf('catalogue: CATALOGUE,');
  assert.ok(opened > 0 && handed > opened, 'createRecordApi is not given the catalogue, so no update carries anything');
});

test('A HOSTED PERSONAL RECORD UPDATED FROM 1.0.0 CARRIES WHAT IT KEPT TYPED into the log', async () => {
  const catalogue = seedCatalogue();
  const personal = catalogue.find((e) => e.id === 'usecase-personal');
  assert.ok(personal?.carry, 'the catalogue has no carry step for Personal');
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 17)), catalogue });
  const put = async (doc: unknown) => {
    const planned = value<{ diff: { planHash: string } }>(await api.planPack({ doc }, owner));
    value(await api.installPack({ doc, planHash: planned.diff.planHash }, owner));
  };
  const holds: string[] = [];
  for (const id of personal.modules) {
    const doc = catalogue.find((e) => e.id === id)!.doc({ holds, usecase: 'personal' });
    await put(doc);
    holds.push(...((doc?.declarations ?? []) as { register?: string }[]).flatMap((d) => (d.register ? [d.register] : [])));
  }
  const current = personal.doc({ holds })!;
  await put({ ...current, version: '1.0.0', seeds: [] });
  const goal = value<{ id: string; seq: number }>(await api.create({ register: 'goals', fields: { what: 'Swim 20 lengths', target: 20, done: 12 } }, owner));

  await put({ ...current, seeds: [] });
  type Rows = { rows: { seq: number; fields: Record<string, unknown> }[] };
  const log = value<Rows>(await api.list({ register: 'goal_log' }, owner)).rows.filter((r) => r.fields.what === 'So far, before the log');
  assert.equal(log.length, 1, 'the update to Personal left the typed progress where nothing reads it');
  assert.equal(Number(log[0]!.fields.amount), 12);
  assert.equal(log[0]!.fields.goal, goal.id, 'the carried row does not point at its goal');
  const after = value<Rows>(await api.list({ register: 'goals' }, owner)).rows.find((r) => r.seq === goal.seq);
  assert.equal(after?.fields.done ?? null, null, 'the typed number was kept and would count twice');
  sql.close();
});
