/**
 * An added `ref` lands by rule only into a list the key reads (`loop/research-batch-thirty-five-audit.md` finding 5).
 *
 * `byRule` asked whether the key is the owner's and reaches the list the field is added to, and never about the list a
 * `ref` points at. The audit's `reads.mts ref` measured an owner's key held to Projects adding `paid_by: ref to money`
 * with no press (Projects at version 2), then writing `money#1` into it and being answered `ok`, and `money#99` and
 * being told "there is no such row": the write path's own check, used as an oracle for which Money rows exist, by a
 * key that is refused `list money`. The owner had declared no such field; the key added the reference itself.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);

const reg = (id: string, name: string, fields: unknown[] = []) => ({
  id: `register.${id}`,
  kind: 'register' as const,
  body: { id, name, title: 'name', fields: [{ id: 'name', type: 'text', required: true }, ...fields] } as never,
});

const session = { host: 'kiln-mbp', repo: 'kiln', agent: 'claude' };
/** The audit's key: the owner's, at `write`, held to Projects alone. */
const held: CallContext = { principal: { kind: 'token', id: 'tok_h', scope: 'write', person: 'p_1', level: 'owner' }, registers: ['things'], session };

type Out = { ok: boolean; value?: Record<string, unknown>; refusal?: { code: string; fix: string } };

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([reg('things', 'Projects'), reg('money', 'Money', [{ id: 'amount', type: 'int' }])])).ok);
  assert.ok(api.kernel.create('things', { name: 'Kiln' }, { actor: 'p_1' }).ok);
  assert.ok(api.kernel.create('money', { name: 'Loan to Omar', amount: 5000 }, { actor: 'p_1' }).ok);
  const add = async (field: Record<string, unknown>, ctx: CallContext): Promise<Out> =>
    (await api.propose(
      { question: 'Add a link to Money?', body_kind: 'change', body: { declaration_id: 'register.things', to: { add: { fields: [field] } } } } as never,
      ctx,
    )) as Out;
  const version = () => api.kernel.declarations().find((d) => d.id === 'register.things')!.version;
  const status = (out: Out) => {
    assert.ok(out.ok, JSON.stringify(out));
    return sql.one<{ status: string }>('SELECT status FROM suggestion ORDER BY rowid DESC LIMIT 1')!.status;
  };
  return { sql, api, add, version, status };
}

test('A KEY HELD TO PROJECTS ADDS A REF INTO MONEY, WHICH IT CANNOT READ: filed, and it waits for the owner', async () => {
  const { sql, api, add, version, status } = await record();
  const cannot = await api.list({ register: 'money' }, held);
  assert.equal(cannot.ok, false, 'the key reads Money, so this case proves nothing');

  const out = await add({ id: 'paid_by', type: 'ref', to: 'money' }, held);
  assert.equal(out.value?.landed, undefined, `it landed: ${JSON.stringify(out)}`);
  assert.equal(status(out), 'open');
  assert.equal(version(), 1, 'Projects changed with no press');

  /* AND SO THE ORACLE IS NOT THERE TO ASK: with no `paid_by` on Projects, money#1 and money#99 are refused alike. */
  const one = (await api.update({ register: 'things', seq: 1, patch: { paid_by: 'money#1' }, version: 1 } as never, held)) as Out;
  const none = (await api.update({ register: 'things', seq: 1, patch: { paid_by: 'money#99' }, version: 1 } as never, held)) as Out;
  assert.equal(one.ok, false);
  assert.equal(one.refusal?.code, none.refusal?.code, 'a row that exists and one that does not were told apart');
  sql.close();
});

test('THE SAME HOLDS FOR A LIST OF REFS, which landed at version 2 before this file', async () => {
  const { sql, add, version, status } = await record();
  const out = await add({ id: 'payers', type: 'list', of: 'ref', to: 'money' }, held);
  assert.equal(out.value?.landed, undefined, `it landed: ${JSON.stringify(out)}`);
  assert.equal(status(out), 'open');
  assert.equal(version(), 1, 'Projects changed with no press');
  sql.close();
});

test('AN OWNER KEY HELD TO APPEND ON MONEY, WITH NO CEILING, still reads no Money, and its ref waits', async () => {
  const { sql, add, version, status } = await record();
  const appendOnMoney: CallContext = { principal: { kind: 'token', id: 'tok_a', scope: 'write', person: 'p_1', level: 'owner' }, levels: { money: 'append' }, session };
  const out = await add({ id: 'paid_by', type: 'ref', to: 'money' }, appendOnMoney);
  assert.equal(out.value?.landed, undefined);
  assert.equal(status(out), 'open');
  assert.equal(version(), 1);
  sql.close();
});

test('A KEY THAT READS BOTH LISTS STILL ADDS THE REF BY RULE, which is the rule working as the owner answered it', async () => {
  for (const ctx of [
    { ...held, registers: ['things', 'money'] },
    { principal: held.principal, session },
  ] as CallContext[]) {
    const { sql, add, version } = await record();
    const out = await add({ id: 'paid_by', type: 'ref', to: 'money' }, ctx);
    assert.deepEqual(out.value?.landed, { declaration: 'register.things', version: 2 }, JSON.stringify(out));
    assert.equal(version(), 2);
    sql.close();
  }
});
