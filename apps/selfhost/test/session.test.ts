/**
 * An agent's runs on the self-host, over a real socket: the session headers on `/api`, `_meta.session` on
 * `/mcp`, and a browser that is never a run.
 *
 * NOTHING SECRET IN ANY ANSWER. Every body the server wrote is kept, and at the end of each test none of
 * them holds a bearer, the server key or a session cookie.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createClient } from '@braindog/client';

import { start } from '../src/server.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const NOW = Date.UTC(2026, 8, 11, 12);

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

/** Where an agent says it is: the headers the command line sends. */
const HERE: Record<string, string> = {
  'x-braindog-host': 'studio-pc',
  'x-braindog-repo': 'braindog',
  'x-braindog-agent': 'claude',
  'x-braindog-cwd': 'C:\\Repos\\braindog',
};

type Wire = { ok?: boolean; value?: unknown; refusal?: { fix: string; at?: string } & Record<'code', string>; result?: Record<string, unknown> };
type Row = { id: string; seq: number; state: string | null; fields: Record<string, unknown> };
type Event = { actor: string; kind: string; note: string | null };

async function stack() {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-session-'));
  const serverKey = randomBytes(32).toString('base64url');
  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    token: serverKey,
    sessionKey: new Uint8Array(randomBytes(32)),
    now: () => NOW,
    pollMs: 0,
  });
  const port = (running.server.address() as { port: number }).port;
  const origin = `http://localhost:${port}`;

  const person = running.directory.person$('ada@example.com', 'Ada');
  assert.ok(person.ok);
  const owner = person.value.id;
  assert.ok((await running.api.createRecord({ id: REC, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: owner, email: 'ada@example.com', name: 'Ada' } })).ok);
  assert.ok(running.directory.provision({ slug: 'the-studio', email: 'ada@example.com', record: REC }).ok);
  assert.ok((await running.api.kernel.install([TASKS])).ok);

  const bodies: string[] = [];
  const secrets: string[] = [serverKey];
  const http = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, init);
    const raw = await res.text();
    bodies.push(raw);
    return { status: res.status, headers: res.headers, wire: (raw ? JSON.parse(raw) : {}) as Wire };
  };
  const post = (auth: Record<string, string>, method: string, args: unknown, headers: Record<string, string> = {}) =>
    http(`/api/${method}`, { method: 'POST', headers: { 'content-type': 'application/json', ...auth, ...headers }, body: JSON.stringify(args) });
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
  /** A read as the owner, by the server key: how a person checks who wrote what. */
  const read = async <T>(path: string): Promise<T> => {
    const out = await http(path, { headers: bearer(serverKey) });
    assert.equal(out.status, 200, JSON.stringify(out.wire));
    return out.wire.value as T;
  };

  return {
    running,
    port,
    origin,
    owner,
    serverKey,
    secrets,
    http,
    post,
    bearer,
    read,
    history: (register: string, seq: number) => read<Event[]>(`/api/history?register=${register}&seq=${seq}`),
    run: (spoken: string) => read<Row | null>(`/api/get?spoken=${spoken}`),
    runs: () => running.sql.all<{ seq: number }>("SELECT seq FROM entry WHERE register = 'session' ORDER BY seq").map((r) => r.seq),
    /**
     * A write token of the owner's. A new agent starts at Ask (DIRECTION §37), so its writes are filed as questions;
     * `trusted` names the kinds it writes at Do and tell, as `seedLadder` keeps them for a token that wrote before the
     * ladder, for the tests that are about the run and not the rung.
     */
    async mint(scope: 'read' | 'propose' | 'write' = 'write', trusted: string[] = []) {
      const out = await running.api.createToken({ scope }, { principal: { kind: 'person', id: owner, level: 'owner' } });
      assert.ok(out.ok, 'the token was not minted');
      const { id, bearer: token } = (out as { value: { id: string; bearer: string } }).value;
      for (const kind of trusted)
        running.sql.exec("INSERT INTO ladder (agent, kind, rung, accepted_unchanged, since) VALUES (?, ?, 'tell', 0, ?)", id, kind, new Date(NOW).toISOString());
      secrets.push(token);
      return token;
    },
    /** Who filed each question open on Decide. */
    asked: () => running.sql.all<{ opened_by: string }>("SELECT opened_by FROM suggestion WHERE status = 'open' ORDER BY rowid").map((r) => r.opened_by),
    /** A tool call as a 2025-06-18 client sends it, with `_meta.session` when given. */
    tool: (token: string, name: string, args: Record<string, unknown>, session?: Record<string, unknown>, headers: Record<string, string> = {}) =>
      http('/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...bearer(token),
          'mcp-protocol-version': '2025-06-18',
          'mcp-method': 'tools/call',
          'mcp-name': name,
          ...headers,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args, ...(session === undefined ? {} : { _meta: { session } }) } }),
      }),
    clean() {
      for (const body of bodies) for (const secret of secrets) assert.ok(!body.includes(secret), 'a secret reached an answer');
    },
    async close() {
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('AN AGENT’S FIRST WRITE THROUGH THE SELF-HOST IS SIGNED S1, and its next from the same client is S1 again', async () => {
  const s = await stack();
  try {
    const token = await s.mint('write', ['tasks:add']);
    const said = { ...HERE, 'x-braindog-client': 'claude-run-1' };
    assert.equal((await s.post(s.bearer(token), 'create', { register: 'tasks', fields: { what: 'One' } }, said)).status, 200);
    assert.equal((await s.post(s.bearer(token), 'create', { register: 'tasks', fields: { what: 'Two' } }, said)).status, 200);

    assert.deepEqual(s.runs(), [1]);
    assert.equal((await s.history('tasks', 1))[0]?.actor, 'S1');
    assert.equal((await s.history('tasks', 2))[0]?.actor, 'S1');
    const s1 = (await s.run('S1')) ?? assert.fail('S1 is not there');
    assert.deepEqual(
      { client_id: s1.fields.client_id, host: s1.fields.host, repo: s1.fields.repo, agent: s1.fields.agent, cwd: s1.fields.cwd },
      { client_id: 'claude-run-1', host: 'studio-pc', repo: 'braindog', agent: 'claude', cwd: 'C:\\Repos\\braindog' },
    );
    assert.deepEqual(
      (await s.history('session', 1)).map((e) => [e.actor, e.kind, e.note]),
      [['S1', 'create', 'opened: auto']],
    );
    s.clean();
  } finally {
    await s.close();
  }
});

test('A NEW AGENT’S FIRST WRITE ASKS, and the question is still signed by the run it opens, S1', async () => {
  const s = await stack();
  try {
    /* Nothing seeded: a token minted now starts at Ask for every kind (DIRECTION §37). */
    const token = await s.mint();
    const said = { ...HERE, 'x-braindog-client': 'claude-run-1' };
    const out = await s.post(s.bearer(token), 'create', { register: 'tasks', fields: { what: 'One' } }, said);
    assert.equal(out.status, 200, JSON.stringify(out.wire));
    assert.equal((out.wire.value as { asked?: { question: string } }).asked?.question, 'Add One to Tasks?');

    /* NOTHING WAS WRITTEN, and the question waits on Decide, filed by the run its first write opened. */
    assert.equal(s.running.sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM entry WHERE register = 'tasks'")?.n, 0);
    assert.deepEqual(s.runs(), [1]);
    assert.deepEqual(s.asked(), ['S1']);
    const s1 = (await s.run('S1')) ?? assert.fail('S1 is not there');
    assert.equal(s1.fields.client_id, 'claude-run-1');

    /* THE SAME THROUGH /mcp, from the same client: the same run asks again, and no second run is opened. */
    const r = await s.tool(token, 'create', { register: 'tasks', fields: { what: 'Two' } }, { client_id: 'claude-run-1' });
    assert.equal(r.status, 200);
    assert.notEqual((r.wire.result as { isError?: boolean }).isError, true, JSON.stringify(r.wire.result));
    assert.deepEqual(s.runs(), [1]);
    assert.deepEqual(s.asked(), ['S1', 'S1']);
    s.clean();
  } finally {
    await s.close();
  }
});

test('THE SAME THROUGH /mcp: _meta.session names the run, over the headers key by key', async () => {
  const s = await stack();
  try {
    const token = await s.mint('write', ['tasks:add']);
    const meta = { client_id: 'codex-run-1', host: 'studio-pc', repo: 'braindog', agent: 'codex' };
    for (const what of ['One', 'Two']) {
      const r = await s.tool(token, 'create', { register: 'tasks', fields: { what } }, meta);
      assert.equal(r.status, 200);
      assert.notEqual((r.wire.result as { isError?: boolean }).isError, true, JSON.stringify(r.wire.result));
    }
    assert.deepEqual(s.runs(), [1]);
    assert.equal((await s.history('tasks', 2))[0]?.actor, 'S1');
    assert.equal((await s.run('S1'))?.fields.agent, 'codex');

    /* The header says one client and `_meta` another: `_meta` wins, and it is a second run. */
    const r = await s.tool(token, 'create', { register: 'tasks', fields: { what: 'Three' } }, { client_id: 'codex-run-2' }, { 'x-braindog-client': 'codex-run-1' });
    assert.equal(r.status, 200);
    assert.deepEqual(s.runs(), [1, 2]);
    assert.equal((await s.history('tasks', 3))[0]?.actor, 'S2');
    assert.equal((await s.run('S2'))?.fields.client_id, 'codex-run-2');
    s.clean();
  } finally {
    await s.close();
  }
});

test('ONE RUN PER HOST SESSION over the socket: the hook’s attach, a command from a scratch folder and a bare tool call are S1', async () => {
  const s = await stack();
  try {
    const token = await s.mint('write', ['tasks:add']);
    /* The start hook: the session's own id in the body, the headers saying where it is. */
    const hook = await s.post(s.bearer(token), 'attach', { source: 'startup', client_id: 'cc-1' }, HERE);
    assert.equal(hook.status, 200, JSON.stringify(hook.wire));
    /* The agent runs the command line from its scratch folder, which names no run and no repository. */
    const loose = await s.post(s.bearer(token), 'create', { register: 'tasks', fields: { what: 'From a scratch folder' } }, { 'x-braindog-cwd': '/tmp/scratch' });
    assert.equal(loose.status, 200, JSON.stringify(loose.wire));
    /* And a tool call that says nothing at all of where it is. */
    const bare = await s.tool(token, 'create', { register: 'tasks', fields: { what: 'From a bare tool call' } });
    assert.equal(bare.status, 200);
    assert.notEqual((bare.wire.result as { isError?: boolean }).isError, true, JSON.stringify(bare.wire.result));

    assert.deepEqual(s.runs(), [1], 'a write that named no run opened one of its own');
    assert.deepEqual([(await s.history('tasks', 1))[0]?.actor, (await s.history('tasks', 2))[0]?.actor], ['S1', 'S1']);
    /* Named for its agent and where it works, never for the day. */
    assert.equal((await s.run('S1'))?.fields.doing, 'Claude in braindog');
    s.clean();
  } finally {
    await s.close();
  }
});

test('BAD HEADERS ARE DROPPED, and the write they came with still goes in', async () => {
  const s = await stack();
  try {
    const token = await s.mint('write', ['tasks:add']);
    const bad = {
      'x-braindog-session': 'S0',
      'x-braindog-client': 'has space',
      'x-braindog-host': 'a/b',
      'x-braindog-repo': '../etc',
      'x-braindog-remote': 'r'.repeat(257),
      'x-braindog-cwd': 'c'.repeat(513),
      'x-braindog-agent': 'gpt',
    };
    const out = await s.post(s.bearer(token), 'create', { register: 'tasks', fields: { what: 'Still here' } }, bad);
    assert.equal(out.status, 200, JSON.stringify(out.wire));
    assert.equal((await s.history('tasks', 1))[0]?.actor, 'S1');
    const s1 = (await s.run('S1')) ?? assert.fail('S1 is not there');
    for (const key of ['client_id', 'host', 'repo', 'remote', 'cwd']) assert.equal(s1.fields[key], undefined, `${key} was kept`);
    assert.notEqual(s1.fields.agent, 'gpt');
    s.clean();
  } finally {
    await s.close();
  }
});

test('A BROWSER SESSION NEVER BECOMES A RUN, whatever headers it sends', async () => {
  const s = await stack();
  try {
    const signedIn = await s.http('/auth/token', {
      method: 'POST',
      headers: { origin: s.origin, 'content-type': 'application/json' },
      body: JSON.stringify({ serverKey: s.serverKey }),
    });
    assert.equal(signedIn.status, 200);
    const cookie = signedIn.headers.getSetCookie()[0]?.split(';')[0] ?? assert.fail('no session cookie');
    s.secrets.push(cookie.slice(cookie.indexOf('=') + 1));

    const out = await s.post({ cookie, origin: s.origin }, 'create', { register: 'tasks', fields: { what: 'By hand' } }, { ...HERE, 'x-braindog-client': 'c-1' });
    assert.equal(out.status, 200, JSON.stringify(out.wire));
    assert.deepEqual(s.runs(), []);
    assert.equal((await s.history('tasks', 1))[0]?.actor, s.owner);
    const attach = await s.post({ cookie, origin: s.origin }, 'attach', { source: 'startup' }, HERE);
    assert.equal(attach.wire.refusal?.code, 'FORBIDDEN');
    assert.deepEqual(s.runs(), []);
    s.clean();
  } finally {
    await s.close();
  }
});

test('ATTACH, HANDOFF, sessionsLive, boot AND get S1 THROUGH THE TYPED CLIENT', async () => {
  const s = await stack();
  try {
    const token = await s.mint();
    /* The command line's own `fetch` adds the session headers; the client sends what it is handed. */
    const client = createClient({
      base: `http://127.0.0.1:${s.port}`,
      token,
      fetch: (url, init) => fetch(url, { ...init, headers: { ...(init?.headers as Record<string, string>), ...HERE } }),
    });

    const first = await client.attach({ source: 'startup', client_id: 'cc-1', doing: 'Wire sessions', branch: 'master', head: 'aee9762' });
    assert.ok(first.ok, JSON.stringify(first));
    assert.deepEqual([first.value.spoken, first.value.resumed], ['S1', false]);

    /* No client id in the headers, so the ladder adopts the live run on this host and repository. */
    const handed = await client.handoff({ next: 'Run the gates', tried: 'Reading the cookie on plain http' });
    assert.ok(handed.ok, JSON.stringify(handed));
    assert.deepEqual(s.runs(), [1]);

    const again = await client.attach({ source: 'resume', client_id: 'cc-1', branch: 'feature' });
    assert.ok(again.ok);
    assert.deepEqual([again.value.spoken, again.value.resumed], ['S1', true]);
    assert.deepEqual(
      [again.value.session.fields.next, again.value.session.fields.tried, again.value.session.fields.branch],
      ['Run the gates', ['Reading the cookie on plain http'], 'feature'],
    );

    const live = await client.sessionsLive();
    assert.ok(live.ok);
    assert.deepEqual(live.value.map((r) => [r.spoken, r.stale, r.same_repo]), [['S1', false, true]]);
    /* Worked out as it is read, over the wire as in the record: heard from just now, so working, and no age yet. */
    const said = live.value[0] as unknown as { quiet?: unknown; ran_s?: unknown };
    assert.deepEqual([said.quiet, said.ran_s], [false, 0]);

    const boot = await client.boot();
    assert.ok(boot.ok);
    assert.deepEqual([boot.value.sessions?.map((r) => r.spoken), boot.value.waiting], [['S1'], []]);

    const got = await client.call<Row | null>('get', { spoken: 'S1' });
    assert.ok(got.ok);
    assert.equal(got.value?.fields.doing, 'Wire sessions');
  } finally {
    await s.close();
  }
});
