/**
 * The New project guide growing into a running project, on the record this host makes with its own catalogue: a guide
 * asked for on Decide, its idea stage reached, Spark asking once to add Projects and Work, and accepting adding both with
 * every guide row kept and no studio example rows brought in.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';
import { seedCatalogue } from '@braindog/seed/usecases/catalogue';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value?: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

type Filed = { filed: { id: string; question: string }[] };

test('A GUIDE WHOSE IDEA STAGE IS OVER IS ASKED ONCE TO ADD PROJECTS AND WORK, and accepting keeps every row', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 17, 12)), catalogue: seedCatalogue() });
  const asked = value<{ id: string }>(await api.propose({ question: 'Use the New project guide?', body_kind: 'pack', body: { install: 'usecase-guide' } }, owner));
  value(await api.decide({ id: asked.id, decide: { option: 'accept', reason: 'yes' } } as never, owner));
  const packs = () => sql.all<{ id: string }>('SELECT id FROM pack').map((p) => p.id).sort();
  assert.deepEqual(packs(), ['usecase-guide']);
  const grows = async () => value<Filed>(await api.sparkPropose({}, owner)).filed.filter((f) => /Add Projects and Work/u.test(f.question));

  type Row = { seq: number; fields: Record<string, unknown> };
  const milestones = value<{ rows: Row[] }>(await api.list({ register: 'milestones', limit: 50 }, owner)).rows;
  const idea = milestones.filter((m) => m.fields.stage === 'idea');
  assert.equal(idea.length, 2);
  assert.deepEqual(await grows(), [], 'a guide in its idea stage is not asked');
  for (const m of idea) value(await api.update({ register: 'milestones', seq: m.seq, patch: { state: 'reached' } }, owner));

  const count = () => ['milestones', 'steps', 'choices', 'resources'].map((register) => sql.all("SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL", register).length);
  const before = count();
  const filed = await grows();
  assert.equal(filed.length, 1, 'Spark asks to add Projects and Work');
  assert.deepEqual(packs(), ['usecase-guide'], 'asking adds nothing');
  assert.deepEqual(await grows(), [], 'and asks once');

  value(await api.decide({ id: filed[0]!.id, decide: { option: 'accept', reason: 'yes' } } as never, owner));
  assert.deepEqual(packs(), ['portfolio', 'usecase-guide', 'work']);
  assert.deepEqual(count(), before, 'every guide row is kept');
  assert.equal(sql.all("SELECT id FROM entry WHERE register IN ('things', 'tasks') AND deleted_at IS NULL").length, 0, 'no studio example rows came with them');
});
