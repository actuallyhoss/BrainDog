/**
 * `entity_key` as the record keeps it: written with the row, rebuilt from the rows when migration 23 lands and when an
 * import ends, moved to the survivor by a merge, and gone with an erased person. And the nightly question about who
 * may be one person, handed to a model by names and masked addresses only and answered as one question per pair.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type EraseReport, type Kernel, type ResolveJob, type WriteContext } from '../src/index.ts';
import { applyMigrations } from '../src/migrate.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 12);
const OWNER: WriteContext = { actor: 'p_owner' };

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Projects', title: 'name', scopes: { repos: 'repos' }, fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }] },
};

const PEOPLE: Declaration = {
  id: 'register.people',
  kind: 'register',
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true, search: true },
      { id: 'email', type: 'email', unique: true, index: true },
      { id: 'handles', type: 'list', of: 'text' },
      { id: 'projects', type: 'list', of: 'ref', to: 'things' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
    ],
  },
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([PROJECTS, PEOPLE]));
  return { k, sql };
}

const keys = (sql: NodeSql) =>
  Object.fromEntries(sql.all<{ key: string; row_id: string }>('SELECT key, row_id FROM entity_key ORDER BY key').map((r) => [r.key, r.row_id]));

test('A ROW’S KEYS ARE WRITTEN WITH IT, follow its edits, and go when it is deleted', async () => {
  const { k, sql } = await record();
  const ada = value<Entry>(k.create('people', { name: 'Ada', email: 'Ada.L@gmail.com', handles: ['github:ada'] }, OWNER));
  assert.deepEqual(keys(sql), { 'email:adal@gmail.com': ada.id, 'github:ada': ada.id });

  value(k.update('people', ada.id, { handles: ['github:ada-l'] }, OWNER));
  assert.deepEqual(keys(sql), { 'email:adal@gmail.com': ada.id, 'github:ada-l': ada.id });

  /* A second row is not added with a key the first holds (the merge door), and one given it later does not take it. */
  const made = k.create('people', { name: 'Ada again', handles: ['github:ada-l', 'github:twin'] }, OWNER) as { ok: boolean; refusal?: { code: string } };
  assert.equal(made.ok ? 'made' : made.refusal?.code, 'ALREADY_KNOWN');
  const twin = value<Entry>(k.create('people', { name: 'Ada again', handles: ['github:twin'] }, OWNER));
  value(k.update('people', twin.id, { handles: ['github:ada-l', 'github:twin'] }, OWNER));
  assert.equal(keys(sql)['github:ada-l'], ada.id);
  assert.equal(keys(sql)['github:twin'], twin.id);

  value(k.update('people', ada.id, { deleted_at: new Date(NOW).toISOString() } as never, OWNER));
  assert.equal(keys(sql)['email:adal@gmail.com'], undefined, 'a deleted row kept its keys');
  sql.close();
});

test('MIGRATION 23 KEYS THE ROWS ALREADY HERE, and a folded row’s keys go to the end of its chain', async () => {
  const { k, sql } = await record();
  const ada = value<Entry>(k.create('people', { name: 'Ada', email: 'ada@x.io' }, OWNER));
  const ada2 = value<Entry>(k.create('people', { name: 'Ada L', email: 'ada@work.io' }, OWNER));
  const ada3 = value<Entry>(k.create('people', { name: 'A. L.', handles: ['github:al'] }, OWNER));
  /* Folded as a record from before the merge door holds them: the fields alone, since only a decision folds a row now. */
  for (const [row, into] of [[ada3, ada2], [ada2, ada]] as const)
    sql.exec("UPDATE entry SET fields = json_set(fields, '$.merged_into', ?), deleted_at = ? WHERE id = ?", into.id, new Date(NOW).toISOString(), row.id);
  assert.equal(k.rebuildKeys(), 3);
  const live = keys(sql);
  assert.deepEqual(live, { 'email:ada@work.io': ada.id, 'email:ada@x.io': ada.id, 'github:al': ada.id });

  /* As a record from before the table: no keys, and the ledger one short. */
  sql.exec('DELETE FROM entity_key');
  /* Every migration from 23 on, since the ledger applies only past the last one it holds; 24 rebuilds `declaration`. */
  sql.exec('DELETE FROM migration WHERE version >= 23');
  const { result } = await applyMigrations(sql, fixedClock(NOW));
  assert.ok(result.ok);
  /* From 23 on, however many have landed since. */
  assert.deepEqual(result.value.applied.slice(0, 2), [23, 24]);
  assert.deepEqual(keys(sql), live);
  /* And an import's rebuild says the same. */
  sql.exec('DELETE FROM entity_key');
  assert.equal(k.rebuildKeys(), 3);
  assert.deepEqual(keys(sql), live);
  sql.close();
});

test('AN ERASED PERSON TAKES THEIR KEYS AND THEIR MENTIONS WITH THEM', async () => {
  const { k, sql } = await record();
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_owner', 'owner@studio.test', 'Olu Owner')");
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_owner', '*', 'owner')");
  const mara = value<Entry>(k.create('people', { name: 'Mara Quill', email: 'mara@quill.test', handles: ['github:maraquill'] }, OWNER));
  const kept = value<Entry>(k.create('people', { name: 'Olu', email: 'olu@studio.test' }, OWNER));
  value(k.meet({ name: 'Mara Quill', where: 'a note about the lease' }, OWNER));
  assert.ok(Object.values(keys(sql)).includes(mara.id));

  value<EraseReport>(await k.erase({ subjects: ['Mara Quill'], basis: 'Article 17 request received 2026-10-05' }, 'p_owner'));
  assert.deepEqual(keys(sql), { 'email:olu@studio.test': kept.id }, 'an erased person’s keys are still in the file');
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM entity_mention')?.n, 0, 'their bare name is still in the file');
  sql.close();
});

test('THE NIGHT’S DOUBTFUL PAIRS GO TO A MODEL AS NAMES, and its answer opens one question per pair, never a merge', async () => {
  const { k, sql } = await record();
  const brain = value<Entry>(k.create('things', { name: 'Encore' }, OWNER));
  const a = value<Entry>(k.create('people', { name: 'Rohan Mehta', email: 'rohan.m@encore.example', projects: [brain.id] }, OWNER));
  const b = value<Entry>(k.create('people', { name: 'rohanmehta', handles: ['github:rohanmehta'] }, OWNER));
  value(k.create('people', { name: 'Grace Hopper', email: 'grace@navy.mil' }, OWNER));

  k.purge();
  const jobs = sql.all<{ id: string; payload: string }>("SELECT id, payload FROM outbox WHERE kind = 'infer.resolve'");
  assert.equal(jobs.length, 1);
  const job = JSON.parse(jobs[0]!.payload) as ResolveJob;
  assert.equal(job.pairs.length, 1);
  const [pair] = job.pairs;
  assert.deepEqual(job.rows[pair!.hash]!.slice().sort(), [a.id, b.id].sort());
  const sides = [pair!.a, pair!.b].sort((x, y) => x.name.localeCompare(y.name));
  assert.deepEqual(sides, [
    { name: 'Rohan Mehta', kind: 'person', domain: 'encore.example', masked: 's*******m', seen: ['Encore'] },
    { name: 'rohanmehta', kind: 'person', masked: 's**********a', seen: [] },
  ]);
  assert.doesNotMatch(JSON.stringify(job.pairs), /rohan\.m@|@encore/, 'a full address went to the model');

  /* A second sweep the same night queues nothing. */
  k.purge();
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM outbox WHERE kind = 'infer.resolve'")?.n, 1);

  /* The answer: one pair it is sure of, and one hash it was never handed. */
  sql.exec("UPDATE outbox SET state = 'leased', leased_until = ? WHERE id = ?", new Date(NOW + 60_000).toISOString(), jobs[0]!.id);
  value(k.ackOutbox({ id: jobs[0]!.id, state: 'done', result: { verdicts: [{ hash: pair!.hash, same: true, confidence: 0.82 }, { hash: 'ffffffff', same: true, confidence: 1 }] } }));
  const open = sql.all<{ id: string }>('SELECT id FROM suggestion');
  assert.equal(open.length, 1);
  assert.match(k.question(open[0]!.id) ?? '', /^Are Rohan Mehta \(Encore, an address at encore\.xyz\) and rohanmehta \(GitHub\) one person\? They look likely to be\./);
  assert.equal(k.count('people'), 3, 'a model’s word merged two people');
  sql.close();
});

test('A RUN IS NAMED BY THE TITLE ITS AGENT GIVES A QUESTION, never by the question’s own words (M7)', async () => {
  const { k, sql } = await record();
  const as = (client_id: string): WriteContext => ({ actor: 'p_owner', principal: { kind: 'token', token: 't_1' }, session: { client_id, host: 'h', repo: 'braindog' } });
  const options = { body_kind: 'options' as const, body: { options: [{ id: 'merge', label: 'Merge them', because: 'One person.' }, { id: 'keep', label: 'Keep both', because: 'Two people.' }] } };
  value(k.propose({ ...options, question: 'Merge Sara into Sarah?' }, as('cc-1')));
  const run = () => sql.one<{ doing: string | null }>("SELECT json_extract(fields, '$.doing') AS doing FROM entry WHERE register = 'session' ORDER BY seq LIMIT 1")?.doing;
  assert.doesNotMatch(run() ?? '', /Sara/, 'the question named the run');
  value(k.propose({ ...options, question: 'Merge Sara into Sarah?', title: 'Tidying the contacts' }, as('cc-1')));
  assert.equal(run(), 'Tidying the contacts');
  sql.close();
});

test('A ROW A MEMBER’S AGENT MADE IS THAT MEMBER’S: a stranger who looks like that person asks the owner nothing about it', async () => {
  const { k, sql } = await record();
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_owner', '*', 'owner')");
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_ana', '*', 'write')");
  sql.exec("INSERT INTO token (id, person_id, hash, scope, created_at) VALUES ('t_ana', 'p_ana', 'h', 'write', '2026-10-01T00:00:00.000Z')");
  const ana: WriteContext = { actor: 'p_ana', principal: { kind: 'token', token: 't_ana' }, session: { client_id: 'cc', host: 'h', repo: 'encore' } };
  const made = value<Entry>(k.create('people', { name: 'Rohan Mehta', email: 'rohan.m@encore.example' }, ana));
  assert.match(sql.one<{ a: string }>("SELECT actor AS a FROM event WHERE target = ? AND kind = 'create'", `entry:${made.id}`)?.a ?? '', /^S\d+$/, 'her agent’s run made it');
  value(k.meet({ name: 'Rohan Mehta', email: 'rohan@elsewhere.example', where: 'a mail', untrusted: true }, OWNER));
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE status = 'open'")?.n, 0, 'her row is hers, as one she made by hand would be');
  assert.deepEqual(k.get(made.id)?.fields.email, 'rohan.m@encore.example', 'and nothing is carried onto it');
  sql.close();
});
