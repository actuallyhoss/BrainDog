/**
 * The session hints, and the three routes a run is reached through.
 *
 * A hint is held to its grammar and dropped when it fails, and the call it came with still goes
 * through: a wrong hint is a run found less well, never a refused write. `_meta.session` over `/mcp` is
 * held to the same grammar, because it is the same seven things said in a body.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { HINTS, ROUTES, handlersFor, hintsOf, serveApi, sessionOf, withSession } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const GOOD: Record<string, string> = {
  'x-braindog-session': 'S12',
  'x-braindog-client': 'a1b2-c3:d4.e_5',
  'x-braindog-host': 'studio-pc',
  'x-braindog-repo': 'braindog',
  'x-braindog-remote': 'github.com/sam/braindog',
  'x-braindog-cwd': 'C:\\Repos\\braindog',
  'x-braindog-agent': 'claude',
};

const KEPT = {
  spoken: 'S12',
  client_id: 'a1b2-c3:d4.e_5',
  host: 'studio-pc',
  repo: 'braindog',
  remote: 'github.com/sam/braindog',
  cwd: 'C:\\Repos\\braindog',
  agent: 'claude',
};

test('EVERY HINT THAT FITS ITS GRAMMAR IS KEPT, under the field it names', () => {
  assert.deepEqual(sessionOf(new Headers(GOOD)), KEPT);
  assert.deepEqual(sessionOf(new Headers()), {});
});

test('A HINT THAT FAILS ITS GRAMMAR IS DROPPED, and every other hint is kept', () => {
  const bad: [string, string][] = [
    ['x-braindog-session', 'S0'],
    ['x-braindog-session', 'S1x'],
    ['x-braindog-session', 's1'],
    ['x-braindog-session', 'SG3'],
    ['x-braindog-client', 'has space'],
    ['x-braindog-client', 'x'.repeat(129)],
    ['x-braindog-host', 'a/b'],
    ['x-braindog-host', ''],
    ['x-braindog-repo', '../etc'],
    ['x-braindog-repo', 'a..b'],
    ['x-braindog-repo', 'C:\\Repos\\braindog'],
    ['x-braindog-repo', '-flag'],
    ['x-braindog-repo', 'x'.repeat(65)],
    ['x-braindog-remote', 'x'.repeat(257)],
    ['x-braindog-cwd', 'x'.repeat(513)],
    ['x-braindog-cwd', 'C:\\with\ta tab'],
    ['x-braindog-agent', 'gpt'],
    ['x-braindog-agent', 'Claude'],
  ];
  for (const [name, value] of bad) {
    const headers = new Headers(GOOD);
    headers.set(name, value);
    const got = sessionOf(headers);
    const key = Object.entries(HINTS).find(([, hint]) => hint.header === name)?.[0] ?? assert.fail(`${name} is no hint`);
    assert.equal(Object.hasOwn(got, key), false, `${name}: ${JSON.stringify(value)} was kept`);
    assert.equal(Object.keys(got).length, 6, `${name}: another hint was dropped with it`);
  }
});

test('_meta.session IS HELD TO THE SAME GRAMMAR, and only its own string keys are read', () => {
  assert.deepEqual(hintsOf(KEPT), KEPT);
  assert.deepEqual(hintsOf({ ...KEPT, repo: '../etc', agent: 'gpt', cwd: 'C:\\Users\\Zoë', host: 7, doing: 'not a hint' }), {
    spoken: 'S12',
    client_id: 'a1b2-c3:d4.e_5',
    remote: 'github.com/sam/braindog',
  });
  assert.deepEqual(hintsOf(JSON.parse('{"__proto__":{"repo":"braindog"}}')), {});
  assert.deepEqual(hintsOf(Object.create({ repo: 'braindog' })), {}, 'an inherited key was read as a hint');
  for (const nothing of [null, undefined, 'S1', 42, ['S1']]) assert.deepEqual(hintsOf(nothing), {});
});

test('THE HINTS GO ON THE CONTEXT KEY BY KEY, and a call with none leaves it as it was', () => {
  const ctx: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
  assert.equal(withSession(ctx, {}), ctx);
  const once = withSession(ctx, { repo: 'braindog', host: 'studio-pc' });
  assert.deepEqual(once.session, { repo: 'braindog', host: 'studio-pc' });
  assert.deepEqual(withSession(once, { repo: 'site' }).session, { repo: 'site', host: 'studio-pc' });
  assert.equal(ctx.session, undefined, 'the context it was given was changed');
});

test('THE THREE RUN ROUTES ARE IN THE GROUPS 30 §5 GIVES THEM, and get takes a spoken id', () => {
  const route = (name: string) => ROUTES.find((r) => r.name === name) ?? assert.fail(`${name} is not routed`);
  assert.deepEqual([route('attach').group, route('attach').writes], ['DATA', true]);
  assert.deepEqual([route('handoff').group, route('handoff').writes], ['DATA', true]);
  assert.deepEqual([route('sessionsLive').group, route('sessionsLive').writes], ['READ+', false]);
  assert.equal(route('get').takes?.spoken, 'text');
});

test('ATTACH AND sessionsLive THROUGH THE SHARED WIRING: a token is a run, and a person is refused', async () => {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(Date.UTC(2026, 8, 11, 12)) });
  const handlers = handlersFor(api);
  const agent: CallContext = {
    principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' },
    session: { host: 'studio-pc', repo: 'braindog', agent: 'claude' },
  };
  const post = async (name: string, body: unknown, ctx: CallContext) => {
    const res = await serveApi(new Request(`https://x/api/${name}`, { method: 'POST', body: JSON.stringify(body) }), handlers, ctx);
    return { status: res.status, body: (await res.json()) as { ok: boolean; value?: Record<string, unknown>; refusal?: Record<string, unknown> } };
  };

  const attached = await post('attach', { source: 'startup', client_id: 'c-1' }, agent);
  assert.equal(attached.status, 200);
  assert.deepEqual([attached.body.value?.spoken, attached.body.value?.resumed], ['S1', false]);

  const live = await serveApi(new Request('https://x/api/sessionsLive'), handlers, agent);
  const rows = ((await live.json()) as { value: { spoken: string; same_repo: boolean }[] }).value;
  assert.deepEqual(rows.map((r) => [r.spoken, r.same_repo]), [['S1', true]]);

  const person = await post('attach', { source: 'startup' }, { principal: { kind: 'person', id: 'p_1', level: 'owner' } });
  assert.equal(person.status, 403);
  assert.equal(person.body.refusal?.code, 'FORBIDDEN');
});

test('CONTEXT IS A READ+ GET THROUGH THE SHARED WIRING, naming the run the headers point at and opening none', async () => {
  const route = ROUTES.find((r) => r.name === 'context') ?? assert.fail('context is not routed');
  assert.deepEqual([route.group, route.writes], ['READ+', false]);

  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 11, 12)) });
  const handlers = handlersFor(api);
  const agent: CallContext = {
    principal: { kind: 'token', id: 'tok_1', scope: 'read', person: 'p_1', level: 'owner' },
    session: { host: 'studio-pc', repo: 'braindog', agent: 'claude', client_id: 'c-1' },
  };
  const read = async () => {
    const res = await serveApi(new Request('https://x/api/context'), handlers, agent);
    return { status: res.status, body: (await res.json()) as { ok: boolean; value?: { session: unknown; next: string } } };
  };

  const first = await read();
  assert.equal(first.status, 200);
  assert.equal(first.body.value?.session, null, 'a run that does not exist was named');
  assert.match(first.body.value?.next ?? '', /first write opens a session/);
  assert.equal(sql.all("SELECT 1 FROM entry WHERE register = 'session'").length, 0, 'reading context opened a run');
  sql.close();
});

/** Projects, and people with the fields the agents pack gives them, which are the fields `meet` writes. */
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

test('MEET IS A DATA WRITE THROUGH THE SHARED WIRING: 422 where People is switched off, and a person added where it is not', async () => {
  const route = ROUTES.find((r) => r.name === 'meet') ?? assert.fail('meet is not routed');
  assert.deepEqual([route.group, route.writes], ['DATA', true]);

  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 15, 12)) });
  const handlers = handlersFor(api);
  const agent: CallContext = {
    principal: { kind: 'token', id: 'tok_1', scope: 'propose', person: 'p_1', level: 'owner' },
    session: { host: 'studio-pc', repo: 'braindog', agent: 'claude', client_id: 'c-1' },
  };
  const post = async (body: unknown) => {
    const res = await serveApi(new Request('https://x/api/meet', { method: 'POST', body: JSON.stringify(body) }), handlers, agent);
    return { status: res.status, body: (await res.json()) as { ok: boolean; value?: Record<string, unknown>; refusal?: Record<string, unknown> } };
  };
  const said = { name: 'Ada Lovelace', email: 'ada@example.com', where: 'commit 4464966 in braindog' };

  const off = await post(said);
  assert.equal(off.status, 422);
  assert.equal(off.body.refusal?.code, 'REGISTER_UNKNOWN');
  assert.equal(sql.all('SELECT 1 FROM entry').length, 0, 'a refused meet wrote something');

  assert.ok((await api.kernel.install([THINGS, PEOPLE])).ok);
  const on = await post(said);
  assert.equal(on.status, 200);
  assert.deepEqual([on.body.value?.person, on.body.value?.created], ['people#1', true]);
  sql.close();
});

test('A REMOTE LOSES ITS USERINFO, so a password in a git remote never reaches the record', () => {
  const said = sessionOf(new Headers({ 'x-braindog-remote': 'https://sam:hunter2@github.com/sam/braindog.git' }));
  assert.equal(said.remote, 'https://github.com/sam/braindog.git');
  assert.equal(hintsOf({ remote: 'ssh://deploy:hunter2@example.com/r.git' }).remote, 'ssh://example.com/r.git');
  /* scp-style has no scheme and no password: left as it is, and the scope resolver reads it. */
  assert.equal(sessionOf(new Headers({ 'x-braindog-remote': 'git@github.com:sam/braindog.git' })).remote, 'git@github.com:sam/braindog.git');
});
