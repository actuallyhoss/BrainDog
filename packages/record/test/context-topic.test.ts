/**
 * `context { topic }`: an agent with no folder says what the person is working on, and its run is placed by it.
 *
 * Claude.ai, ChatGPT and any remote MCP client send no repository, remote or folder, so the first project could never
 * form from them. The topic their first call says is the one name there is: it places the run in the project of that
 * name, or on a record with no project yet forms the first one from it as a draft, exactly as a folder does. With no
 * topic, the answer asks the agent to find out.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext, type Context } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 22, 12);

/** The projects, as the portfolio pack declares the parts a formed project fills. */
const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  body: {
    id: 'things',
    name: 'Projects',
    title: 'name',
    search: ['name'],
    scopes: { repos: 'repos', folders: 'folders' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'about', type: 'text' },
      { id: 'lane', type: 'enum', values: ['earning', 'building', 'parked'] },
      { id: 'repos', type: 'list', of: 'text' },
      { id: 'folders', type: 'list', of: 'text' },
      { id: 'draft', type: 'bool', default: false },
    ],
  } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

/** A remote client's call: an app's name and nothing about where it is. */
const remote = (scope: 'read' | 'propose' | 'write' = 'write', session: CallContext['session'] = { client: 'claude-ai' }): CallContext => ({
  principal: { kind: 'token', id: 'tok_1', scope, person: 'p_1', level: 'owner' },
  session,
});

const value = <T>(r: { ok: boolean }): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record(projects: string[] = []) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([THINGS])).ok);
  for (const name of projects) value<Entry>(await api.create({ register: 'things', fields: { name, lane: 'earning' } }, owner));
  return { api, sql };
}

const things = (sql: NodeSql) =>
  sql
    .all<{ name: string; draft: number | null }>("SELECT json_extract(fields, '$.name') AS name, json_extract(fields, '$.draft') AS draft FROM entry WHERE register = 'things' AND deleted_at IS NULL ORDER BY seq")
    .map((r) => ({ name: r.name, draft: r.draft === 1 }));

const runProjects = (sql: NodeSql): (string | null)[] =>
  sql.all<{ project: string | null }>("SELECT json_extract(fields, '$.project') AS project FROM entry WHERE register = 'session' ORDER BY seq").map((r) => r.project);

test('A FIRST CLAUDE.AI SESSION ENDS WITH A PROJECT: its topic forms the first one as a draft and the run is in it', async () => {
  const { api, sql } = await record();
  const told = value<Context>(await api.context({ topic: 'kiln works' }, remote()));
  assert.deepEqual(things(sql), [{ name: 'Kiln works', draft: true }]);
  assert.equal(told.project?.name, 'Kiln works');
  assert.ok(told.session, 'the run was opened where it said it works');
  assert.deepEqual(runProjects(sql), ['things#1']);
  assert.equal(told.ask, undefined);
  /* AND THE NEXT CALL, WHICH SAYS NO TOPIC, STILL STANDS THERE: the run was placed, and nothing about a folder moves it. */
  const again = value<Context>(await api.context({}, remote()));
  assert.equal(again.project?.name, 'Kiln works');
  assert.equal(again.ask, undefined);
});

test('ONE PROJECT, HOWEVER OFTEN IT IS SAID: a second topic call finds the run in its project and forms nothing more', async () => {
  const { api, sql } = await record();
  value<Context>(await api.context({ topic: 'Kiln works' }, remote()));
  value<Context>(await api.context({ topic: 'Tidepool' }, remote()));
  assert.deepEqual(things(sql), [{ name: 'Kiln works', draft: true }]);
  assert.deepEqual(runProjects(sql), ['things#1']);
});

test('A RECORD WITH PROJECTS PLACES THE RUN IN THE ONE OF THAT NAME, case aside, and forms none from a topic', async () => {
  const { api, sql } = await record(['Kiln', 'Marlow & Co']);
  const told = value<Context>(await api.context({ topic: 'kiln' }, remote()));
  assert.equal(told.project?.name, 'Kiln');
  assert.deepEqual(runProjects(sql), ['things#1']);
  assert.equal(things(sql).length, 2);
});

test('A TOPIC NO PROJECT IS CALLED, on a record with projects, forms nothing and says so in one line', async () => {
  const { api, sql } = await record(['Kiln']);
  const told = value<Context>(await api.context({ topic: 'Tidepool' }, remote()));
  assert.equal(told.project, null);
  assert.deepEqual(things(sql), [{ name: 'Kiln', draft: false }]);
  assert.match(told.ask ?? '', /^No project is called Tidepool\. Ask which one this is/u);
});

test('NO FOLDER AND NO TOPIC: the answer asks what the person is working on, and writes nothing', async () => {
  const { api, sql } = await record();
  const told = value<Context>(await api.context({}, remote()));
  assert.equal(told.project, null);
  assert.match(told.ask ?? '', /no folder, so no project yet\. Ask what they are working on, then call context with topic/u);
  assert.deepEqual(things(sql), []);
  assert.deepEqual(runProjects(sql), []);
});

test('A TOPIC THAT NAMES NOTHING FORMS NOTHING, and the agent is asked again', async () => {
  const { api, sql } = await record();
  const told = value<Context>(await api.context({ topic: 'nothing' }, remote()));
  assert.deepEqual(things(sql), []);
  assert.match(told.ask ?? '', /Ask what they are working on/u);
});

test('AN AGENT THAT SAYS WHERE IT IS IS PLACED BY THAT, never by a topic, and is never asked', async () => {
  const { api, sql } = await record();
  const told = value<Context>(await api.context({ topic: 'Kiln works' }, remote('write', { agent: 'claude', cwd: '/Users/sam/Code/tidepool' })));
  assert.deepEqual(things(sql), []);
  assert.deepEqual(runProjects(sql), []);
  assert.equal(told.ask, undefined);
});

test('A KEY THAT MAY ONLY READ IS BRIEFED, and its topic writes nothing', async () => {
  const { api, sql } = await record();
  value<Context>(await api.context({ topic: 'Kiln works' }, remote('read')));
  assert.deepEqual(things(sql), []);
  assert.deepEqual(runProjects(sql), []);
});

test('A PERSON IS NEVER A RUN: her topic forms nothing and she is asked nothing', async () => {
  const { api, sql } = await record();
  const told = value<Context>(await api.context({ topic: 'Kiln works' }, owner));
  assert.deepEqual(things(sql), []);
  assert.equal(told.ask, undefined);
});

test('A TOPIC THAT IS NOT A FEW WORDS IS REFUSED AT topic', async () => {
  const { api } = await record();
  for (const topic of ['', 'x'.repeat(61), 42]) {
    const out = (await api.context({ topic } as never, remote())) as { ok: boolean; refusal?: { code: string; at?: string } };
    assert.equal(out.ok, false, JSON.stringify(topic));
    assert.equal(out.refusal?.code, 'VALUE_MALFORMED');
    assert.equal(out.refusal?.at, 'topic');
  }
});
