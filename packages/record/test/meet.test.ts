/**
 * `meet` through the record: someone met in the work, added or matched, signed by the run that met them
 * and linked to its project.
 *
 * What is asserted is what a person reads later: who wrote the row, which project it joined, and that a
 * record with People switched off refuses and writes nothing, a run included. Matching itself is the
 * kernel's, and `packages/kernel/test/people.test.ts` holds it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext, type Meeting } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 15, 12);

const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  body: {
    id: 'things',
    name: 'Projects',
    title: 'name',
    scopes: { repos: 'repos' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'repos', type: 'list', of: 'text' },
    ],
  } as never,
};

/** People as the agents pack declares it, with the fields `meet` writes. */
const PEOPLE = {
  id: 'register.people',
  kind: 'register' as const,
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email', unique: true, index: true },
      { id: 'handles', type: 'list', of: 'text' },
      { id: 'projects', type: 'list', of: 'ref', to: 'things', scope: { links: true } },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
    ],
  } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

/** A token's call from a run in the braindog repository. */
const agent = (more: { scope?: 'read' | 'propose' | 'write'; registers?: readonly string[] } = {}): CallContext => ({
  principal: { kind: 'token', id: 'tok_1', scope: more.scope ?? 'propose', person: 'p_1', level: 'owner' },
  session: { host: 'dev-pc', repo: 'braindog', agent: 'claude', client_id: 'c-1' },
  ...(more.registers === undefined ? {} : { registers: more.registers }),
});

async function record(people = true) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install(people ? [THINGS, PEOPLE] : [THINGS])).ok);
  const project = value<Entry>(await api.create({ register: 'things', fields: { name: 'BrainDog', repos: ['braindog'] } }, owner));
  return { api, sql, project };
}

const value = <T>(r: { ok: boolean }): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const refusal = (r: { ok: boolean }): string => {
  const x = r as { ok: boolean; refusal?: { code: string; at?: string } };
  assert.equal(x.ok, false, 'the call went through');
  return x.refusal?.at === undefined ? String(x.refusal?.code) : `${x.refusal.code} at ${x.refusal.at}`;
};

const person = (sql: NodeSql) => {
  const rows = sql.all<{ id: string; fields: string }>("SELECT id, fields FROM entry WHERE register = 'people' ORDER BY seq");
  assert.equal(rows.length, 1, `there are ${rows.length} people`);
  return { id: rows[0]!.id, fields: JSON.parse(rows[0]!.fields) as Record<string, unknown> };
};

const counts = (sql: NodeSql) => ({
  rows: Number(sql.one<{ n: number }>('SELECT count(*) AS n FROM entry')?.n),
  events: Number(sql.one<{ n: number }>('SELECT count(*) AS n FROM event')?.n),
});

test('SOMEBODY NEW IS ADDED, signed by the run that met them and linked to its project', async () => {
  const { api, sql, project } = await record();
  const met = value<Meeting>(await api.meet({ name: 'Ada Lovelace', email: 'Ada@Example.com', where: 'commit 4464966 in braindog' }, agent()));
  assert.deepEqual(met, { row: { register: 'people', id: 'people#1', seq: 1, name: 'Ada Lovelace' }, created: true, matched_by: 'none' });

  const ada = person(sql);
  assert.deepEqual(
    [ada.fields.name, ada.fields.email, ada.fields.projects, ada.fields.met],
    ['Ada Lovelace', 'ada@example.com', [project.id], ['2026-09-15 · commit 4464966 in braindog']],
  );
  const actors = sql.all<{ actor: string }>('SELECT actor FROM event WHERE target = ?', `entry:${ada.id}`).map((e) => e.actor);
  assert.deepEqual(actors, ['S1']);
  sql.close();
});

test('SOMEBODY ALREADY THERE IS MATCHED, and gains the line and the handle and nothing else', async () => {
  const { api, sql } = await record();
  value(await api.meet({ name: 'Ada Lovelace', email: 'ada@example.com', where: 'commit 4464966 in braindog' }, agent()));
  const again = value<Meeting>(
    await api.meet({ name: 'A. Lovelace', email: 'ADA@example.com', handle: 'github:ada', where: 'commit 5a7b1c2 in braindog' }, agent()),
  );
  assert.deepEqual([again.row, again.created, again.matched_by], [{ register: 'people', id: 'people#1', seq: 1, name: 'Ada Lovelace' }, false, 'key']);

  const ada = person(sql);
  assert.equal(ada.fields.name, 'Ada Lovelace', 'what a commit said overwrote the name already held');
  assert.deepEqual(ada.fields.handles, ['github:ada']);
  assert.equal((ada.fields.met as string[]).length, 2);
  sql.close();
});

test('WITH PEOPLE SWITCHED OFF IT IS REGISTER_UNKNOWN, and nothing is written, a run included', async () => {
  const { api, sql } = await record(false);
  const before = counts(sql);
  assert.equal(refusal(await api.meet({ email: 'ada@example.com', where: 'commit 4464966 in braindog' }, agent())), 'REGISTER_UNKNOWN at register');
  assert.deepEqual(counts(sql), before);
  sql.close();
});

test('IT TAKES WHAT MEET TAKES AND NEEDS PROPOSE ON PEOPLE, and a person in the app links no project', async () => {
  const { api, sql } = await record();
  const said = { email: 'ada@example.com', where: 'commit 4464966 in braindog' };

  assert.equal(refusal(await api.meet({ ...said, phone: '555' } as never, agent())), 'FIELD_UNKNOWN at phone');
  assert.equal(refusal(await api.meet(said, agent({ scope: 'read' }))), 'FORBIDDEN');
  assert.equal(refusal(await api.meet(said, agent({ registers: ['things'] }))), 'FORBIDDEN');
  assert.equal(sql.all("SELECT 1 FROM entry WHERE register IN ('people', 'session')").length, 0);

  assert.deepEqual(value<Meeting>(await api.meet({ ...said, name: 'Ada Lovelace' }, owner)), {
    row: { register: 'people', id: 'people#1', seq: 1, name: 'Ada Lovelace' },
    created: true,
    matched_by: 'none',
  });
  sql.close();
});
