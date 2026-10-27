/**
 * One lesson learned twice through the host: `learningsTwice` and `promoteLearnings`, the two rows of
 * `routes/learnings.ts`, built in batch 90.
 *
 * THE ROWS FIRST: the read is READ+ and writes nothing, the press is DATA and writes, both take nothing, and each says
 * in one plain sentence what it does, the press that a person asks it and never a key.
 *
 * THEN THE REAL RECORD THROUGH `serveApi`, the seed and the agents add-on installed, two of the seed's invented projects
 * each learning the same thing: a GET reads the pair by name, a key's press is a 403 that files nothing, and the
 * person's press files one question on Decide, signed by them, and a second press joins it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ROUTES, handlersFor, serveApi } from '../src/index.ts';
import { ROUTES as OWN } from '../src/routes/learnings.ts';
import { createRecordApi, type CallContext } from '@braindog/record';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW as SEEDED, installAgentsPack, installSeed } from '../../seed/src/index.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
const agent: CallContext = { principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' } };
type Answer = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
type Pair = { older: { project: string }; newer: { project: string }; question: string };

test('THE TWO ROWS: the read is READ+ and writes nothing, the press is DATA and writes, and each says what it does plainly', () => {
  const rows = OWN.filter((r) => r.name === 'learningsTwice' || r.name === 'promoteLearnings');
  assert.deepEqual(rows.map((r) => [r.name, r.group, r.writes]), [['learningsTwice', 'READ+', false], ['promoteLearnings', 'DATA', true]]);
  for (const r of rows) {
    assert.deepEqual(r.takes, {});
    assert.equal(ROUTES.filter((x) => x.name === r.name).length, 1, `${r.name} is routed once`);
    assert.doesNotMatch(r.what, /—|\bids?\b|\brows?\b|\bentit(y|ies)\b|\blist item\b|\bULIDs?\b/u, 'the sentence names things as a person does');
  }
  assert.match(rows[0]!.what, /changes and asks nothing/u);
  assert.match(rows[1]!.what, /A person asks it, never a key/u);
});

async function recordWithPair() {
  const DAY = 86_400_000;
  const sql = openSqlite();
  const clock = fixedClock(SEEDED);
  const api = await createRecordApi({ sql, clock });
  const must = (r: unknown) => assert.ok((r as { ok: boolean }).ok, JSON.stringify(r));
  must(await installSeed(api.kernel));
  must(await installAgentsPack(api.kernel));
  const listed = (await api.list({ register: 'learnings', limit: 50 }, owner)) as { ok: boolean; value: { rows: { seq: number; state: string }[] } };
  for (const row of listed.value.rows)
    if (row.state === 'active') must(await api.update({ register: 'learnings', seq: row.seq, patch: { state: 'reverted', why: 'Taken off so this file counts only what it wrote.' } }, owner));
  const project = async (name: string) => {
    const found = (await api.list({ register: 'things', where: { field: 'name', is: name } }, owner)) as { value: { rows: { seq: number }[] } };
    return `things#${String(found.value.rows[0]!.seq)}`;
  };
  const learn = async (daysAgo: number, lesson: string, name: string) => {
    clock.set(SEEDED + (200 - daysAgo) * DAY);
    must(await api.create({ register: 'learnings', fields: { lesson, because: 'An import ran once and doubled a month.', kind: 'method', topic: 'imports', project: await project(name) } }, owner));
  };
  await learn(9, 'Run the import twice to prove it holds.', 'Kiln');
  await learn(3, 'Always run imports twice and prove they hold.', 'Portage');
  clock.set(SEEDED + 200 * DAY);
  return { sql, api };
}

const call = async (handlers: ReturnType<typeof handlersFor>, ctx: CallContext, name: string, method: 'GET' | 'POST') => {
  const init = method === 'POST' ? { method, headers: { 'content-type': 'application/json' }, body: '{}' } : undefined;
  const res = await serveApi(new Request(`https://x/api/${name}`, init), handlers, ctx);
  return { status: res.status, body: (await res.json()) as Answer };
};

test('THROUGH THE REAL RECORD: the pair is read by name, a key is refused the press, and a person files it once', async () => {
  const { sql, api } = await recordWithPair();
  const handlers = handlersFor(api);
  const asked = () => sql.all<{ opened_by: string }>("SELECT opened_by FROM suggestion WHERE cause LIKE 'learned-twice#%'");

  for (const ctx of [owner, agent]) {
    const read = await call(handlers, ctx, 'learningsTwice', 'GET');
    assert.equal(read.status, 200);
    const pairs = (read.body.value as { pairs: Pair[] }).pairs;
    assert.deepEqual(pairs.map((p) => [p.older.project, p.newer.project]), [['Kiln', 'Portage']]);
    assert.equal(pairs[0]!.question, 'Kiln and Portage learned the same thing. Keep it once, for everywhere?');
  }

  const keyed = await call(handlers, agent, 'promoteLearnings', 'POST');
  assert.deepEqual([keyed.status, keyed.body.refusal?.code], [403, 'NEEDS_BROWSER_SESSION']);
  assert.doesNotMatch(keyed.body.refusal?.fix ?? '', /—/u);
  assert.equal(asked().length, 0, 'a key files nothing');

  const pressed = await call(handlers, owner, 'promoteLearnings', 'POST');
  assert.equal(pressed.status, 200);
  assert.equal((pressed.body.value as { open: number }).open, 1);
  const again = await call(handlers, owner, 'promoteLearnings', 'POST');
  assert.deepEqual(again.body.value, { asked: [], open: 1 }, 'a second press joins the one waiting');
  assert.deepEqual(asked().map((q) => q.opened_by), ['p_1'], 'one question, signed by who pressed');
  sql.close();
});
