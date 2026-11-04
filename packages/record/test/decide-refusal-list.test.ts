/**
 * A colleague invited to one list who tries to answer a question about that list is told what is true: deciding is for
 * somebody invited to the whole record. Not that the question belongs to the whole record, and not to open a list she
 * has open.
 *
 * MEASURED BEFORE THIS FILE. `decide` asks `guard(ctx, 'decide')` with no list, so a member invited to Tasks at
 * `decide`, answering the owner's question about Tasks, was refused with `allows`'s sentence for a call about the
 * record itself: "This belongs to the whole record, and you were invited to Tasks, and to nothing else. Open it, or ask
 * the owner to invite you to the whole record." The question was about Tasks, and "Open it" sent her to the list she
 * was already reading it from.
 *
 * WHETHER A LIST'S `decide` SHOULD DECIDE THAT LIST'S QUESTIONS IS THE OWNER'S CALL, and this does not answer it: she
 * is still refused. Only the sentence changes. It is said before the id is read, so a question about a list she cannot
 * see, and an id that names nothing, are refused in the same words and tell her nothing about either.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

const MONEY = {
  id: 'register.money',
  kind: 'register' as const,
  body: { id: 'money', name: 'Money', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };

const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};

async function studio() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 22, 9)) });
  assert.ok((await api.kernel.install([TASKS, MONEY])).ok);
  assert.ok(
    api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok,
  );
  const ask = async (register: string, question: string) =>
    value<{ id: string }>(await api.propose({ question, body_kind: 'rowset', body: { register, rows: [{ what: 'Kiln' }] } } as never, owner)).id;
  const tasks = await ask('tasks', 'Add the two Kiln tasks?');
  const money = await ask('money', 'File the kiln invoice?');
  /* BUILT THE WAY THE HOST BUILDS A MEMBER, from `kernel.access`. */
  const member = async (person: string, grant: Record<string, unknown>): Promise<CallContext> => {
    value(await api.invite({ person, name: person, ...grant } as never, owner));
    const held = api.kernel.access(person)!;
    return { principal: { kind: 'person', id: person, level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  };
  return { sql, api, tasks, money, member };
}

const verdict = { option: 'accept', reason: 'Yes, the kiln is booked.' };

test('(1) A MEMBER OF ONE LIST IS TOLD THAT DECIDING IS FOR THE WHOLE RECORD, and not to open the list she has open', async () => {
  const { sql, api, tasks, member } = await studio();
  const fen = await member('p_6', { registers: { tasks: 'decide' } });
  assert.equal(fen.principal.kind === 'person' && fen.principal.level, null, 'she holds a list and not the record');

  const out = (await api.decide({ id: tasks, decide: verdict }, fen)) as Out;
  assert.equal(out.ok, false, 'a list`s decide is the owner`s call, and this does not answer it');
  assert.equal(out.refusal!.code, 'FORBIDDEN');
  const fix = out.refusal!.fix;
  assert.doesNotMatch(fix, /\bOpen (?:it|one of those)\b/u, `she was told to open the list she has open: ${fix}`);
  assert.doesNotMatch(fix, /^This belongs to all of this BrainDog/u, `she was told a question about Tasks belongs to the whole record: ${fix}`);
  assert.match(fix, /invited to all of this BrainDog/u, `the sentence does not say who decides: ${fix}`);
  assert.match(fix, /Tasks/u, 'and it names the list she was invited to, by its name');
  assert.equal(api.kernel.governanceRow('suggestion', tasks)?.status, 'open', 'and the question is still open');
  sql.close();
});

test('(2) THE SAME WORDS FOR A QUESTION SHE CANNOT SEE AND FOR ONE THAT IS NOT THERE', async () => {
  const { sql, api, tasks, money, member } = await studio();
  const fen = await member('p_6', { registers: { tasks: 'decide' } });
  const said = async (id: string) => ((await api.decide({ id, decide: verdict }, fen)) as Out).refusal;
  const mine = await said(tasks);
  assert.deepEqual(await said(money), mine, 'a question about Money, which she cannot see, was refused differently');
  assert.deepEqual(await said('SG99'), mine, 'a question that does not exist was refused differently');
  sql.close();
});

test('(3) A MEMBER OF THE WHOLE RECORD BELOW decide IS STILL TOLD HER LEVEL, and one at decide still decides', async () => {
  const { sql, api, tasks, money, member } = await studio();
  const bea = await member('p_7', { level: 'read' });
  const refused = (await api.decide({ id: tasks, decide: verdict }, bea)) as Out;
  assert.equal(refused.refusal!.fix, 'This needs decide, and you have read access. Ask an owner to raise your access.');
  const dee = await member('p_8', { level: 'decide' });
  value(await api.decide({ id: money, decide: verdict }, dee));
  sql.close();
});
