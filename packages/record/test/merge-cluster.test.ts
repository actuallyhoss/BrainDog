/**
 * A doubtful merge is one question for the whole cluster (`loop/contract-17.md`), and Decide draws it as one card: every
 * candidate by name with where each was seen, and three answers, Merge all, Keep apart and Pick. The question is a
 * `rowset` whose rows fold rows into one through `merged_into`, so the record reads the candidates out of it and says
 * which rows each one is, and `decide` with `rows` merges only the ones picked, carrying only what they brought.
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
  const lanternfish = value<Entry>(await api.create({ register: 'organisations', fields: { name: 'Lanternfish', domain: 'lanternfish.example' } }, owner));
  const commits = (n: number, repo: string) => Array.from({ length: n }, (_, i) => `2026-09-${String(10 + i).padStart(2, '0')} · commit ${String(4464966 + i)} in ${repo}`);
  const kept = value<Entry>(
    await api.create(
      { register: 'people', fields: { name: 'Joaquin Herrera', email: 'joaquin.herrera@lanternfish.example', org: lanternfish.id, met: [...commits(6, 'lanternfish'), '2026-10-01 · mail from lanternfish.example'] } },
      owner,
    ),
  );
  const login = value<Entry>(await api.create({ register: 'people', fields: { name: 'joaquinherrera', handles: ['github:joaquinherrera'], met: commits(1, 'lanternfish-admin') } }, owner));
  const other = value<Entry>(await api.create({ register: 'people', fields: { name: 'joaquinpell', handles: ['github:joaquinpell'], met: ['2026-09-30 · agent run S740'] } }, owner));
  const asked = value<{ id: string }>(
    api.kernel.propose(
      {
        question: 'Are Joaquin Herrera, joaquinherrera and joaquinpell one person?',
        body_kind: 'rowset',
        body: {
          register: 'people',
          rows: [
            { at: 'people#1', version: kept.version, patch: { handles: ['github:joaquinherrera', 'github:joaquinpell'] } },
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
  assert.equal(q.question, 'Are Joaquin Herrera, joaquinherrera and joaquinpell one person?');
  assert.deepEqual(q.merge?.candidates, [
    { name: 'Joaquin Herrera', row: 'people#1', keeps: true, org: 'Lanternfish', seen: ['mail from lanternfish.example', '6 commits in lanternfish'], known_by: ['email'], rows: [] },
    { name: 'joaquinherrera', row: 'people#2', keeps: false, org: null, seen: ['a commit in lanternfish-admin'], known_by: ['github'], rows: [1] },
    { name: 'joaquinpell', row: 'people#3', keeps: false, org: null, seen: ['agent run S740'], known_by: ['github'], rows: [2] },
  ]);
  /* THE ANSWERS AS THE CARD NAMES THEM (`apps/web/src/routes/decide/merge.ts`): merge, apart, and a pick for each folded. */
  assert.deepEqual(
    q.merge?.options.map((o) => [o.says, o.decide.option]),
    [
      ['Merge all', 'merge'],
      ['Keep apart', 'apart'],
      ['Pick joaquinherrera', 'pick:people#2'],
      ['Pick joaquinpell', 'pick:people#3'],
    ],
  );
  /* NO ADDRESS LEAVES, only that there is one. */
  assert.doesNotMatch(JSON.stringify(q.merge), /@|joaquin\.herrera/u);
  /* AND THE QUEUE CARRIES IT TOO. */
  const open = value<{ id: string; merge?: MergeCluster }[]>(await api.governance({ register: 'suggestion', status: 'open' }, owner));
  assert.equal(open.find((r) => r.id === asked)?.merge?.candidates.length, 3);
  sql.close();
});

const people = async (api: Awaited<ReturnType<typeof record>>['api']) =>
  value<{ rows: { seq: number; fields: Record<string, unknown> }[] }>(await api.list({ register: 'people' }, owner)).rows;

test('PICK MERGES THE ONE PICKED, carrying only what it brought, and the rest stay apart', async () => {
  const { api, sql, asked } = await record();
  value(await api.decide({ id: asked, decide: { option: 'pick:people#3', reason: 'only the pell login is him' } }, owner));
  const live = await people(api);
  assert.deepEqual(live.map((r) => r.fields.name).sort(), ['Joaquin Herrera', 'joaquinherrera']);
  /* THE KEPT ONE GAINS THE PICKED LOGIN AND NEVER THE ONE KEPT APART. */
  assert.deepEqual(live.find((r) => r.fields.name === 'Joaquin Herrera')?.fields.handles, ['github:joaquinpell']);
  assert.deepEqual(live.find((r) => r.fields.name === 'joaquinherrera')?.fields.handles, ['github:joaquinherrera']);
  /* AND UNDO PUTS BOTH BACK: the folded one, and what the kept one was carried. */
  value(api.kernel.undoMerge('people#3', { actor: 'p_1' }));
  const back = await people(api);
  assert.deepEqual(back.map((r) => r.fields.name).sort(), ['Joaquin Herrera', 'joaquinherrera', 'joaquinpell']);
  assert.equal(back.find((r) => r.fields.name === 'Joaquin Herrera')?.fields.handles ?? null, null);
  sql.close();
});

test('MERGE ALL FOLDS EVERY ONE, KEEP APART FOLDS NONE, and a pick of a name it does not fold is refused', async () => {
  {
    const { api, sql, asked } = await record();
    const wrong = (await api.decide({ id: asked, decide: { option: 'pick:people#1', reason: 'r' } }, owner)) as { ok: boolean; refusal?: { code: string } };
    assert.equal(wrong.refusal?.code, 'ENUM_VALUE_UNKNOWN');
    value(await api.decide({ id: asked, decide: { option: 'merge', reason: 'all him' } }, owner));
    const live = await people(api);
    assert.deepEqual(live.map((r) => r.fields.name), ['Joaquin Herrera']);
    assert.deepEqual(live[0]?.fields.handles, ['github:joaquinherrera', 'github:joaquinpell']);
    sql.close();
  }
  {
    const { api, sql, asked } = await record();
    value(await api.decide({ id: asked, decide: { option: 'apart', reason: 'three people' } }, owner));
    assert.equal((await people(api)).length, 3);
    sql.close();
  }
});

test('A MERGE TAKEN IN PART BY PLACE folds the ones picked and carries only what they brought', async () => {
  const { api, sql, asked } = await record();
  const q = await question(api, asked);
  /* THE PLACES OF ONE CANDIDATE'S ROWS, AND THE CARRY ROW BESIDE THEM, which is worked out again for the one picked. */
  const rows = [0, ...q.merge!.candidates.filter((c) => c.name === 'joaquinpell').flatMap((c) => c.rows)];
  value(await api.decide({ id: asked, decide: { option: 'accept', reason: 'only the pell login is him', rows } } as never, owner));
  const live = await people(api);
  assert.deepEqual(live.map((r) => r.fields.name).sort(), ['Joaquin Herrera', 'joaquinherrera']);
  /* THE KEPT ONE GAINS THE PICKED LOGIN AND NEVER THE ONE KEPT APART. */
  assert.deepEqual(live.find((r) => r.fields.name === 'Joaquin Herrera')?.fields.handles, ['github:joaquinpell']);
  assert.equal(sql.all("SELECT 1 FROM suggestion WHERE id = ? AND status = 'open'", asked).length, 0, 'the question is answered');
  sql.close();
});

test('IN PART BY PLACE, NONE PICKED IS KEEP APART AND EVERY ONE IS MERGE ALL, and rows that are not places are refused', async () => {
  {
    const { api, sql, asked } = await record();
    const bad = (await api.decide({ id: asked, decide: { option: 'accept', reason: 'r', rows: ['people#2'] } } as never, owner)) as { ok: boolean; refusal?: { code: string; at?: string } };
    assert.equal(bad.refusal?.code, 'VALUE_MALFORMED');
    assert.equal(bad.refusal?.at, 'rows');
    /* A PLACE THE QUESTION DOES NOT HAVE IS REFUSED, never read as Keep apart. */
    const past = (await api.decide({ id: asked, decide: { option: 'accept', reason: 'r', rows: [99] } } as never, owner)) as { ok: boolean; refusal?: { at?: string } };
    assert.equal(past.refusal?.at, 'rows');
    value(await api.decide({ id: asked, decide: { option: 'accept', reason: 'three people', rows: [0] } } as never, owner));
    assert.equal((await people(api)).length, 3);
    sql.close();
  }
  {
    const { api, sql, asked } = await record();
    value(await api.decide({ id: asked, decide: { option: 'accept', reason: 'all him', rows: [1, 2] } } as never, owner));
    const live = await people(api);
    assert.deepEqual(live.map((r) => r.fields.name), ['Joaquin Herrera']);
    assert.deepEqual(live[0]?.fields.handles, ['github:joaquinherrera', 'github:joaquinpell']);
    sql.close();
  }
});

test('ONLY DECIDE MERGES: a write naming merged_into, or bringing back one folded, is refused', async () => {
  const { api, sql, asked } = await record();
  const refused = (r: unknown) => (r as { ok: boolean; refusal?: { code: string; at?: string; fix: string } }).refusal;
  const update = refused(await api.update({ register: 'people', seq: 2, patch: { merged_into: 'people#1', deleted_at: new Date(NOW).toISOString() } }, owner));
  assert.equal(update?.code, 'IMMUTABLE_FIELD');
  assert.equal(update?.at, 'merged_into');
  assert.doesNotMatch(update?.fix ?? '', /people#|merged_into/u, 'a person is told in her own words');
  const agent: CallContext = { principal: { kind: 'token', id: 't_1', level: 'owner', scope: 'write' } as never };
  assert.equal(refused(await api.update({ register: 'people', seq: 2, patch: { merged_into: 'people#1' } }, agent))?.code, 'IMMUTABLE_FIELD');
  assert.equal(refused(await api.create({ register: 'people', fields: { name: 'Someone', merged_into: 'people#1' } }, owner))?.code, 'IMMUTABLE_FIELD');
  /* A NEW ROW NAMING NOBODY IS NO MERGE, and is written. */
  value(await api.create({ register: 'people', fields: { name: 'Nobody Folded', merged_into: null } }, owner));
  assert.equal((await people(api)).length, 4, 'nothing was folded');
  /* AND ONE FOLDED BY DECIDE COMES BACK ONLY BY UNDO. */
  value(await api.decide({ id: asked, decide: { option: 'merge', reason: 'him' } }, owner));
  const back = refused(await api.update({ register: 'people', seq: 3, patch: { deleted_at: null } }, owner));
  assert.equal(back?.code, 'IMMUTABLE_FIELD');
  assert.equal(back?.at, 'deleted_at');
  /* A PLAIN DELETE OF SOMEBODY NEVER FOLDED IS STILL A DELETE. */
  value(await api.update({ register: 'people', seq: 1, patch: { deleted_at: new Date(NOW).toISOString() } }, owner));
  sql.close();
});

test('A ROWSET THAT FOLDS NOTHING, OR IS ON ANOTHER LIST, IS NO MERGE', async () => {
  const { api, sql } = await record();
  value(await api.create({ register: 'tasks', fields: { what: 'Ship' } }, owner));
  const plain = value<{ id: string }>(
    api.kernel.propose({ question: 'Rename Joaquin?', body_kind: 'rowset', body: { register: 'people', rows: [{ at: 'people#1', version: 1, patch: { name: 'Joaquin H.' } }] } }, 'p_1'),
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
      ['Joaquin Herrera', null],
      ['joaquinherrera', null],
      ['joaquinpell', null],
    ],
  );
  assert.doesNotMatch(JSON.stringify(q), /Lanternfish/u);
  sql.close();
});

test('TWO NAMES HAVE NO PICK, since picking the one folded is Merge all, and a pick of it lands as Merge all', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(await api.kernel.install([ORGS, PEOPLE, TASKS]));
  value<Entry>(await api.create({ register: 'people', fields: { name: 'Ada Lovelace' } }, owner));
  const twin = value<Entry>(await api.create({ register: 'people', fields: { name: 'A. Lovelace' } }, owner));
  const rows = [{ at: 'people#2', version: twin.version, patch: { merged_into: 'people#1', deleted_at: new Date(NOW).toISOString() } }];
  const asked = value<{ id: string }>(api.kernel.propose({ question: 'Are these one person?', body_kind: 'rowset', body: { register: 'people', rows } }, 'p_1')).id;
  assert.deepEqual((await question(api, asked)).merge?.options.map((o) => o.says), ['Merge all', 'Keep apart']);
  value(await api.decide({ id: asked, decide: { option: 'pick:people#2', reason: 'the same' } }, owner));
  assert.deepEqual((await people(api)).map((r) => r.fields.name), ['Ada Lovelace']);
  assert.equal(sql.all("SELECT 1 FROM suggestion WHERE status != 'open'").length, 1, 'one question, one answer');
  sql.close();
});
