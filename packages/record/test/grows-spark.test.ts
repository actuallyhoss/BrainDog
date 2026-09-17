/**
 * Spark asking whether a use case should grow (`spark.ts` `growsDrafts`, `CatalogueEntry.grows`): once every figure the use
 * case names passes its test, the packs it grows into are asked for on Decide as one arrangement, asked once, installed
 * only when the owner accepts, and every row the use case holds is still there afterwards. A young record is asked too.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext, type CatalogueEntry } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

const count = (metric: string, where: string) => ({ metric, name: metric, source: 'register.stages', where, value: { count: 'id' }, format: 'int', target: { gte: 0 }, window: '30d', compare: 'none' });

const USE_CASE = {
  pack: 'usecase-trial',
  version: '1.0.0',
  summary: 'Stages of a trial.',
  author: 'BrainDog',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  declarations: [
    {
      register: 'stages',
      name: 'Stages',
      title: 'what',
      state: 'state',
      done: ['reached'],
      fields: [
        { id: 'what', type: 'text', required: true },
        { id: 'phase', type: 'enum', values: ['idea', 'later'] },
        { id: 'state', type: 'enum', values: ['open', 'reached'], default: 'open', required: true },
      ],
    },
    count('idea-left', 'phase is idea, state is not reached'),
    count('idea-reached', 'phase is idea, state is reached'),
  ],
};

const JOBS = {
  pack: 'jobs',
  version: '1.0.0',
  summary: 'Jobs.',
  author: 'BrainDog',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  declarations: [{ register: 'jobs', name: 'Jobs', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] }],
};

const QUESTION = 'The idea stage is done. Add Jobs so it can be run?';

const CATALOGUE: CatalogueEntry[] = [
  { id: 'jobs', kind: 'pack', title: 'Jobs', summary: 'Jobs.', modules: [], version: '1.0.0', doc: () => structuredClone(JOBS) },
  {
    id: 'usecase-trial',
    kind: 'usecase',
    title: 'Trial',
    summary: 'Stages of a trial.',
    modules: [],
    version: '1.0.0',
    doc: () => structuredClone(USE_CASE),
    grows: { when: [{ metric: 'idea-left', is: 0 }, { metric: 'idea-reached', gt: 0 }], install: ['jobs'], question: QUESTION, why: 'Every stage of the idea is reached.' },
  },
];

type Filed = { filed: { id: string; question: string }[]; skipped: { question: string; why: string }[] };

test('A USE CASE THAT HAS REACHED WHAT IT GROWS INTO IS ASKED ONCE ON DECIDE, and accepting adds the packs and keeps every row', async () => {
  const sql = openSqlite();
  /* A DAY-OLD RECORD: Spark reads no habits yet, and still asks this. */
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 17, 12)), catalogue: CATALOGUE });
  const put = value<{ id: string }>(await api.propose({ question: 'Make it a trial?', body_kind: 'pack', body: { install: 'usecase-trial' } }, owner));
  value(await api.decide({ id: put.id, decide: { option: 'accept', reason: 'yes' } } as never, owner));
  const on = () => sql.all<{ id: string }>('SELECT id FROM pack WHERE disabled_at IS NULL').map((p) => p.id).sort();
  assert.deepEqual(on(), ['usecase-trial']);

  const made = async (what: string, phase: string) => value<{ seq: number }>(await api.create({ register: 'stages', fields: { what, phase } }, owner));
  const one = await made('Say what it is', 'idea');
  const two = await made('Talk to people', 'idea');
  await made('Build it', 'later');
  const asked = async () => value<Filed>(await api.sparkPropose({}, owner)).filed.filter((f) => f.question === QUESTION);

  assert.deepEqual(await asked(), [], 'nothing is asked while the idea stage is open');
  value(await api.update({ register: 'stages', seq: one.seq, patch: { state: 'reached' } }, owner));
  assert.deepEqual(await asked(), [], 'one idea stage is still open');
  value(await api.update({ register: 'stages', seq: two.seq, patch: { state: 'reached' } }, owner));
  const out = value<Filed>(await api.sparkPropose({}, owner));
  const filed = out.filed.filter((f) => f.question === QUESTION);
  assert.equal(filed.length, 1, 'the idea stage is over, so Spark asks');
  assert.deepEqual(on(), ['usecase-trial'], 'asking installs nothing');
  assert.deepEqual(await asked(), [], 'and it is asked once');

  value(await api.decide({ id: filed[0]!.id, decide: { option: 'accept', reason: 'yes' } } as never, owner));
  assert.deepEqual(on(), ['jobs', 'usecase-trial']);
  assert.equal(sql.all("SELECT id FROM entry WHERE register = 'stages' AND deleted_at IS NULL").length, 3, 'every stage is still there');
  assert.deepEqual(await asked(), [], 'a use case that has grown is not asked again');
});
