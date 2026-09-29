/**
 * The New project guide growing into a running project, on the record this host makes with its own catalogue: a guide
 * asked for on Decide, its idea stage reached, Slash asking once to add Projects and Work, and accepting adding both with
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
  /* NO EXAMPLE ROWS COME WITH THE PACK ANY MORE (`packages/seed/src/usecases/catalogue.ts`
     "NO EXAMPLE ROWS, FROM ANYTHING ON OFFER"): a plain install off the catalogue plants nothing, and what a person
     would have from onboarding is either a model's formed plan or their own typed rows. This test is about growth once
     the idea stage is reached, not about seeding, so it writes the guide's own template rows by hand, word for word as
     `packages/seed/src/usecases/guide.ts`'s retired `seeds:` once planted them. */
  for (const fields of [
    { what: 'Say what it is and who it is for', stage: 'idea', state: 'underway', order: 1 },
    { what: 'Find the people who want it', stage: 'idea', state: 'not_started', order: 2 },
    { what: 'Plan the smallest first version', stage: 'plan', state: 'not_started', order: 3 },
    { what: 'Make the first version', stage: 'build', state: 'not_started', order: 4 },
    { what: 'Share it with the first people', stage: 'launch', state: 'not_started', order: 5 },
    { what: 'Keep it going and learn from it', stage: 'grow', state: 'not_started', order: 6 },
  ])
    value(await api.create({ register: 'milestones', fields }, owner));
  /* LITERAL DAYS, since `+2d` is the seed planter's own shorthand and `by` here takes a day as `YYYY-MM-DD`
     (the fixed clock is 2026-09-17). */
  for (const fields of [
    { what: 'Write one sentence about what this is and who it is for', state: 'to_do', order: 1, by: '2026-09-19' },
    { what: 'Name three people who would use it', state: 'to_do', order: 2, by: '2026-09-22' },
    { what: 'Ask one of them what they would want first', state: 'to_do', order: 3, by: '2026-09-26' },
  ])
    value(await api.create({ register: 'steps', fields }, owner));
  value(await api.create({ register: 'choices', fields: { question: 'What will it be called?', state: 'open' } }, owner));
  value(await api.create({ register: 'resources', fields: { name: 'Three projects like yours to learn from', kind: 'example' } }, owner));
  const grows = async () => value<Filed>(await api.slashPropose({}, owner)).filed.filter((f) => /run the project as well as guide it/u.test(f.question));

  type Row = { seq: number; fields: Record<string, unknown> };
  const milestones = value<{ rows: Row[] }>(await api.list({ register: 'milestones', limit: 50 }, owner)).rows;
  const idea = milestones.filter((m) => m.fields.stage === 'idea');
  assert.equal(idea.length, 2);
  assert.deepEqual(await grows(), [], 'a guide in its idea stage is not asked');
  for (const m of idea) value(await api.update({ register: 'milestones', seq: m.seq, patch: { state: 'reached' } }, owner));

  const count = () => ['milestones', 'steps', 'choices', 'resources'].map((register) => sql.all("SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL", register).length);
  const before = count();
  const filed = await grows();
  assert.equal(filed.length, 1, 'Slash asks to add Projects and Work');
  assert.deepEqual(packs(), ['usecase-guide'], 'asking adds nothing');
  assert.deepEqual(await grows(), [], 'and asks once');

  value(await api.decide({ id: filed[0]!.id, decide: { option: 'accept', reason: 'yes' } } as never, owner));
  assert.deepEqual(packs(), ['portfolio', 'usecase-guide', 'work']);
  assert.deepEqual(count(), before, 'every guide row is kept');
  assert.equal(sql.all("SELECT id FROM entry WHERE register IN ('things', 'tasks') AND deleted_at IS NULL").length, 0, 'no studio example rows came with them');
});
