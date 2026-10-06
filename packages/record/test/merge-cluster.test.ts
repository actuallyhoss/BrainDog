/**
 * A doubtful merge is one question for the whole cluster (`loop/contract-17.md`), and Decide draws it as one card: every
 * candidate by name with where each was seen, and three answers, Merge all, Keep apart and Pick. The question is a
 * `rowset` whose rows fold rows into one through `merged_into`, so the record reads the candidates out of it and says
 * which rows each one is, and `decide` with `rows` merges only the ones picked.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext, type MergeCluster } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 12);

const ORGS = {
  id: 'register.organisations',
  kind: 'register' as const,
  body: {
    id: 'organisations',
    name: 'Organisations',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'domain', type: 'text' },
      { id: 'merged_into', type: 'ref', to: 'organisations' },
    ],
  } as never,
};

const PEOPLE = {
  id: 'register.people',
  kind: 'register' as const,
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email', index: true },
      { id: 'handles', type: 'list', of: 'text' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
      { id: 'org', type: 'ref', to: 'organisations' },
    ],
  } as never,
};

/** A list that plays no part, whose rowsets are only rowsets. */
const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(await api.kernel.install([ORGS, PEOPLE, TASKS]));
  const encore = value<Entry>(await api.create({ register: 'organisations', fields: { name: 'Encore', domain: 'encore.example' } }, owner));
  const commits = (n: number, repo: string) => Array.from({ length: n }, (_, i) => `2026-09-${String(10 + i).padStart(2, '0')} · commit ${String(4464966 + i)} in ${repo}`);
  const kept = value<Entry>(
    await api.create(
      { register: 'people', fields: { name: 'Rohan Mehta', email: 'rohan.mehta@encore.example', org: encore.id, met: [...commits(6, 'encore'), '2026-10-01 · mail from encore.example'] } },
      owner,
    ),
  );
  const login = value<Entry>(await api.create({ register: 'people', fields: { name: 'rohanmehta', handles: ['github:rohanmehta'], met: commits(1, 'encore-admin') } }, owner));
  const other = value<Entry>(await api.create({ register: 'people', fields: { name: 'jherrerastudio', handles: ['github:jherrerastudio'], met: ['2026-09-30 · agent run S740'] } }, owner));
  const asked = value<{ id: string }>(
    api.kernel.propose(
      {
        question: 'Are Rohan Mehta, rohanmehta and jherrerastudio one person?',
        body_kind: 'rowset',
        body: {
          register: 'people',
          rows: [
            { at: 'people#1', version: kept.version, patch: { handles: ['github:rohanmehta', 'github:jherrerastudio'] } },
            { at: 'people#2', version: login.version, patch: { merged_into: 'people#1', deleted_at: new Date(NOW).toISOString() } },
            { at: 'people#3', version: other.version, patch: { merged_into: 'people#1', deleted_at: new Date(NOW).toISOString() } },
          ],
        },
      },
      'p_1',
    ),
  );
  return { api, sql, asked: asked.id };
}

const question = async (api: Awaited<ReturnType<typeof record>>['api'], id: string) =>
  value<{ id: string; question: string; merge?: MergeCluster }>(await api.governance({ register: 'suggestion', id }, owner));

test('THE CLUSTER IS EVERY CANDIDATE BY NAME, the one kept first, each with where it was seen and how it is known', async () => {
  const { api, sql, asked } = await record();
  const q = await question(api, asked);
  assert.equal(q.question, 'Are Rohan Mehta, rohanmehta and jherrerastudio one person?');
  assert.deepEqual(q.merge?.candidates, [
    { name: 'Rohan Mehta', row: 'people#1', keeps: true, org: 'Encore', seen: ['mail from encore.example', '6 commits in encore'], known_by: ['email'], rows: [] },
    { name: 'rohanmehta', row: 'people#2', keeps: false, org: null, seen: ['a commit in encore-admin'], known_by: ['github'], rows: [1] },
    { name: 'jherrerastudio', row: 'people#3', keeps: false, org: null, seen: ['agent run S740'], known_by: ['github'], rows: [2] },
  ]);
  assert.deepEqual(
    q.merge?.options.map((o) => [o.says, o.decide.option]),
    [
      ['Merge all', 'accept'],
      ['Keep apart', 'reject'],
      ['Pick the ones that are the same', 'accept'],
    ],
  );
  /* NO ADDRESS LEAVES, only that there is one. */
  assert.doesNotMatch(JSON.stringify(q.merge), /@|rohan\.mehta/u);
  /* AND THE QUEUE CARRIES IT TOO. */
  const open = value<{ id: string; merge?: MergeCluster }[]>(await api.governance({ register: 'suggestion', status: 'open' }, owner));
  assert.equal(open.find((r) => r.id === asked)?.merge?.candidates.length, 3);
  sql.close();
});

test('PICK MERGES ONLY THE ONES PICKED: their rows are accepted, and the rest stay apart', async () => {
  const { api, sql, asked } = await record();
  const q = await question(api, asked);
  const picked = q.merge!.candidates.filter((c) => c.name === 'jherrerastudio').flatMap((c) => c.rows);
  value(await api.decide({ id: asked, decide: { option: 'accept', reason: 'only the Herrera login is him', rows: picked } } as never, owner));
  const live = value<{ rows: { fields: Record<string, unknown> }[] }>(await api.list({ register: 'people' }, owner)).rows.map((r) => r.fields.name).sort();
  assert.deepEqual(live, ['Rohan Mehta', 'rohanmehta']);
  sql.close();
});

test('A ROWSET THAT FOLDS NOTHING, OR IS ON ANOTHER LIST, IS NO MERGE', async () => {
  const { api, sql } = await record();
  value(await api.create({ register: 'tasks', fields: { what: 'Ship' } }, owner));
  const plain = value<{ id: string }>(
    api.kernel.propose({ question: 'Rename Rohan?', body_kind: 'rowset', body: { register: 'people', rows: [{ at: 'people#1', version: 1, patch: { name: 'Rohan M.' } }] } }, 'p_1'),
  );
  const tasks = value<{ id: string }>(api.kernel.propose({ question: 'Two tasks?', body_kind: 'rowset', body: { register: 'tasks', rows: [{ what: 'Ship again' }] } }, 'p_1'));
  assert.equal((await question(api, plain.id)).merge, undefined);
  assert.equal((await question(api, tasks.id)).merge, undefined);
  sql.close();
});

test('THE ORGANISATION IS NAMED ONLY TO SOMEBODY WHO READS THE ORGANISATIONS, as context names it', async () => {
  const { api, sql, asked } = await record();
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  value(await api.invite({ person: 'p_2', name: 'Bea', registers: { people: 'read' } } as never, owner));
  const held = api.kernel.access('p_2')!;
  const bea: CallContext = { principal: { kind: 'person', id: 'p_2', level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  const q = value<{ merge?: MergeCluster } | null>(await api.governance({ register: 'suggestion', id: asked }, bea));
  assert.deepEqual(
    q?.merge?.candidates.map((c) => [c.name, c.org]),
    [
      ['Rohan Mehta', null],
      ['rohanmehta', null],
      ['jherrerastudio', null],
    ],
  );
  assert.doesNotMatch(JSON.stringify(q), /Encore/u);
  sql.close();
});
