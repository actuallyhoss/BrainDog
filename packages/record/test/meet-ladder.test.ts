/**
 * `meet` at the agent's rung (research-audit-20 H4): what a meeting does on its own stays automatic, a
 * person added and the line of where they were met; what an agent asserts on somebody already known (an address a fold
 * by the strong rules would carry onto them) is held to the ladder, and where it would ask it is a mention and one question instead of a write. An
 * agent on a Suggest grant only ever leaves mentions.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext, type Meeting } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 12);

const PEOPLE = {
  id: 'register.people',
  kind: 'register' as const,
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    meets: { name: 'name', email: 'email', handles: 'handles', keys: 'keys', met: 'met', merged_into: 'merged_into' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email', unique: true, index: true },
      { id: 'handles', type: 'list', of: 'text', label: 'Handles' },
      { id: 'keys', type: 'list', of: 'text', label: 'Keys' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
    ],
  } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };

/** An agent on a grant the record holds, as a host hands it over. */
const agent = (token: string, scope: 'propose' | 'write'): CallContext => ({
  principal: { kind: 'token', id: token, scope, person: 'p_1', level: 'owner' },
  session: { client_id: 'c1', client: 'claude-code', host: 'mac', repo: 'braindog' },
});

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  value(await api.kernel.install([PEOPLE]));
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_claude', 'p_1', 'h1', 'write', 'Claude Code', '2026-10-01T00:00:00.000Z')");
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_suggest', 'p_1', 'h2', 'propose', 'Cursor', '2026-10-01T00:00:00.000Z')");
  return { api, sql };
}

const people = (sql: NodeSql) =>
  sql.all<{ id: string; fields: string }>("SELECT id, fields FROM entry WHERE register = 'people' AND deleted_at IS NULL ORDER BY seq").map((r) => ({ id: r.id, fields: JSON.parse(r.fields) as Record<string, unknown> }));
const open = (sql: NodeSql) => sql.all<{ id: string }>("SELECT id FROM suggestion WHERE status = 'open' AND body_kind = 'rowset'");
const mentions = (sql: NodeSql) => sql.all<{ name: string; kind: string }>('SELECT name, kind FROM entity_mention ORDER BY name').map((m) => ({ name: m.name, kind: m.kind }));

test('SOMEBODY NEW IS ADDED ON ITS OWN, and meeting them again with nothing new adds the line', async () => {
  const { api, sql } = await record();
  const claude = agent('t_claude', 'write');
  const met = value<Meeting>(await api.meet({ name: 'Ada Lovelace', email: 'ada@example.com', source: 'commit 4464966 in braindog' }, claude));
  assert.equal(met.created, true);
  const again = value<Meeting>(await api.meet({ email: 'ada@example.com', source: 'commit 5a7b1c2 in braindog' }, claude));
  assert.equal(again.matched_by, 'key');
  assert.equal(again.mention, undefined);
  assert.equal((people(sql)[0]!.fields.met as string[]).length, 2);
  assert.equal(open(sql).length, 0, 'nothing to ask');
  sql.close();
});

test('WHAT AN AGENT CARRIES ONTO SOMEBODY KNOWN BY A STRONG FOLD ASKS AT ITS RUNG: a mention and one question, and nothing written', async () => {
  const { api, sql } = await record();
  const claude = agent('t_claude', 'write');
  value(await api.meet({ name: 'Lakshmi Vadlamudi', email: 'lakshmi.vadlamudi@brightloom.example', source: 'commit 1 in braindog' }, claude));
  const before = people(sql)[0]!;
  /* AN AGENT'S KEY IS HELD TO A COMMIT'S WORD (research-audit-21 H2), so a key match carries nothing onto her. A second
     address under her name is a fold by the strong rules, which would carry it onto her: that is an assertion about
     somebody the record already holds, and it goes through the ladder as a key match would (research-audit-22 M1). */
  const said = { name: 'Lakshmi Vadlamudi', email: 'lakshmivadlamudi@gmail.com', source: 'commit 2 in braindog' };
  const asked = value<Meeting>(await api.meet(said, claude));
  assert.equal(asked.mention, true);
  assert.equal(asked.created, false);
  assert.equal(asked.matched_by, 'strong');
  assert.equal(asked.row?.name, 'Lakshmi Vadlamudi');
  assert.ok(asked.question, 'one question filed');
  assert.equal(people(sql).length, 1, 'no second row was kept');
  assert.deepEqual(people(sql)[0]!.fields, before.fields, 'nothing written onto her');
  assert.deepEqual(mentions(sql), [{ name: 'Lakshmi Vadlamudi', kind: 'person' }]);
  const filed = open(sql);
  assert.equal(filed.length, 1);
  const q = value<{ question: string }>(await api.governance({ register: 'suggestion', id: filed[0]!.id }, owner));
  assert.equal(q.question, 'Add keys to Lakshmi Vadlamudi?');

  /* AT MOST ONE: the same meeting again is answered by the question already waiting. */
  const twice = value<Meeting>(await api.meet(said, claude));
  assert.equal(twice.question, asked.question);
  assert.equal(open(sql).length, 1);

  /* ACCEPTED, IT IS WRITTEN AS THE AGENT'S CHANGE. */
  value(await api.decide({ id: filed[0]!.id, decide: { option: 'accept', reason: 'yes' } }, owner));
  assert.ok((people(sql)[0]!.fields.keys as string[]).includes('email:lakshmivadlamudi@gmail.com'), JSON.stringify(people(sql)[0]!.fields));
  sql.close();
});

test('THE OWNER AT HER KEYBOARD IS NEVER ON THE LADDER', async () => {
  const { api, sql } = await record();
  value(await api.meet({ name: 'Ada Lovelace', email: 'ada@example.com', source: 'a note' }, agent('t_claude', 'write')));
  value(await api.meet({ email: 'ada@example.com', handle: 'github:ada', source: 'a note' }, owner));
  assert.deepEqual(people(sql)[0]!.fields.handles, ['github:ada']);
  assert.equal(open(sql).length, 0);
  sql.close();
});

test('AN AGENT ON A SUGGEST GRANT ONLY EVER LEAVES MENTIONS', async () => {
  const { api, sql } = await record();
  const cursor = agent('t_suggest', 'propose');
  const met = value<Meeting>(await api.meet({ name: 'Grace Hopper', email: 'grace@example.com', source: 'commit 1a2b3c4 in braindog' }, cursor));
  assert.deepEqual(met, { row: null, created: false, matched_by: 'none', mention: true });
  assert.equal(people(sql).length, 0, 'nobody is added');
  /* NOR ON SOMEBODY ALREADY KNOWN, and nothing is asked. */
  value(await api.meet({ name: 'Ada Lovelace', email: 'ada@example.com', source: 'a note' }, owner));
  const known = people(sql)[0]!;
  value<Meeting>(await api.meet({ email: 'ada@example.com', handle: 'github:ada', source: 'commit 1a2b3c4 in braindog' }, cursor));
  assert.deepEqual(people(sql)[0]!.fields, known.fields);
  assert.equal(open(sql).length, 0);
  assert.deepEqual(mentions(sql).map((m) => m.name), ['Grace Hopper', 'ada'], 'a login, never an address');
  sql.close();
});
