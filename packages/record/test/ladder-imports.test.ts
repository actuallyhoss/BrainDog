/**
 * Every import made into the record, and the owner's word on each, the ladder's half ("Untrusted text
 * (mail, bank texts, imports, other people's rows, add-on descriptions) drops the run to Ask"): `importsFound` counts
 * what each import's run created by list, `adopt` keeps what the owner said, `importActors` names every import he has not
 * said is his own, and `standing` says which agent is asking about everything and why.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { ladder } from '../src/ladder.ts';
import { PROJECTS } from '../../../fixtures/names.ts';
import { openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 12);

const list = (id: string, name: string) => ({
  id: `register.${id}`,
  kind: 'register' as const,
  body: { id, name, title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
});

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** A token's call from a run: the import's (no agent named, its client id says import) or a named agent's. */
const from = (token: string, client_id: string, agent: string): CallContext => ({
  principal: { kind: 'token', id: token, scope: 'write', person: 'p_1', level: 'owner' },
  session: { client_id, agent },
});

/** Adding to a list is lifted for a grant, so its writes are written and signed by its run. */
const lifted = (sql: NodeSql, token: string, ...lists: string[]) => {
  for (const l of lists) sql.exec("INSERT INTO ladder (agent, kind, rung, accepted_unchanged, since) VALUES (?, ?, 'tell', 0, '2026-10-01T00:00:00.000Z')", token, `${l}:add`);
};

/** A record with two lists, an import's grant and two agents' grants, and three rows the import brought in. */
async function record() {
  const sql = openSqlite();
  const clock = { at: NOW, now: () => clock.at };
  const api = await createRecordApi({ sql, clock: clock as never });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE', slug: 'lanternfish', name: PROJECTS[0], tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  value(await api.kernel.install([list('errands', 'Errands'), list('chores', 'Chores')]));
  const token = (id: string, label: string) =>
    sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES (?, 'p_1', ?, 'write', ?, '2026-10-01T00:00:00.000Z')", id, `h_${id}`, label);
  token('t_import', 'Import');
  token('t_claude', 'Claude Code');
  token('t_cursor', 'Cursor');
  lifted(sql, 't_import', 'errands', 'chores');
  lifted(sql, 't_claude', 'errands');
  const importing = from('t_import', 'braindog-import-1f2e', 'other');
  for (const name of ['Post the parcel', 'Return the books']) value(await api.create({ register: 'errands', fields: { name } }, importing));
  value(await api.create({ register: 'chores', fields: { name: 'Water the plants' } }, importing));
  const trust = ladder({ sql, kernel: api.kernel, now: clock.now });
  return { api, sql, clock, trust };
}

test('AN IMPORT IS FOUND WITH WHAT IT BROUGHT INTO EACH LIST, by the list name, and nothing said of it yet', async () => {
  const { trust } = await record();
  const found = trust.importsFound();
  assert.equal(found.length, 1, 'one import was made');
  const [one] = found;
  assert.match(one!.run, /^S\d+$/u, 'the run as a person says it');
  assert.deepEqual(one!.lists, [
    { list: 'Errands', rows: 2 },
    { list: 'Chores', rows: 1 },
  ]);
  assert.equal(one!.rows, 3);
  assert.equal(one!.adopted, null, 'the owner has said nothing of it');
  assert.equal(one!.at, new Date(NOW).toISOString(), 'when it first wrote');
});

test('IMPORT ACTORS NAME EVERY IMPORT NOT SAID TO BE HIS OWN: until it is, and again once he takes it back', async () => {
  const { trust } = await record();
  const run = trust.importsFound()[0]!.run;
  assert.deepEqual(trust.importActors(), [run]);
  trust.adopt(run, true, 'p_1');
  assert.deepEqual(trust.importActors(), [], 'his own is no longer outside text');
  assert.equal(trust.importsFound()[0]!.adopted, true);
  trust.adopt(run, false, 'p_1');
  assert.deepEqual(trust.importActors(), [run], 'treated as outside text again');
  assert.equal(trust.importsFound()[0]!.adopted, false);
});

test('A NAMED AGENT WHOSE CLIENT ID CARRIES THE PREFIX IS THAT AGENT, NOT AN IMPORT', async () => {
  const { api, trust } = await record();
  value(await api.create({ register: 'errands', fields: { name: 'Book the van' } }, from('t_claude', 'braindog-import-9a9a', 'claude')));
  const found = trust.importsFound();
  assert.equal(found.length, 1, 'still only the one import');
  assert.equal(found[0]!.rows, 3, 'and the agent\'s row is not counted in it');
});

test('STANDING SAYS WHICH AGENT IS ASKING ABOUT EVERYTHING AND WHY, and null for one that read nothing from outside', async () => {
  const { sql, trust } = await record();
  const marks = (): number => sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM pref WHERE person_id = 'ladder:untrusted'")!.n;
  const asking = (name: string) => trust.standing().agents.find((a) => a.agent === name)!.asking;
  assert.equal(asking('Claude Code'), null);
  trust.markUntrusted({ token: 't_claude', run: null }, 'the inbox');
  assert.deepEqual(asking('Claude Code'), { from: 'the inbox', at: new Date(NOW).toISOString() }, 'the token\'s own mark');
  assert.equal(asking('Cursor'), null, 'another agent is not marked');
  const before = marks();
  trust.standing();
  assert.equal(marks(), before, 'reading where an agent stands writes nothing');
  assert.ok(sql.one("SELECT 1 AS y FROM pref WHERE person_id = 'ladder:untrusted' AND key = 'token:t_claude'"), 'the token keeps its mark for its next run');
});

test('STANDING READS THE MARK ON AN AGENT\'S NEWEST OPEN RUN', async () => {
  const { api, trust } = await record();
  const claude = from('t_claude', 'c-1', 'claude');
  value(await api.create({ register: 'errands', fields: { name: 'Book the van' } }, claude));
  const run = api.kernel.findRun(claude.session ?? {}, 't_claude');
  assert.ok(run, 'the agent has a run');
  trust.markUntrusted({ token: 't_claude', run: api.kernel.nameOf(run.id) }, 'something another person wrote');
  assert.equal(trust.standing().agents.find((a) => a.agent === 'Claude Code')!.asking?.from, 'something another person wrote');
});
