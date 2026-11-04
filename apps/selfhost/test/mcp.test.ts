/**
 * `/mcp` on the self-host, over a real socket: the bearer before the body, the transport's refusals, a client's
 * initialize and then a tool call, and an agent reaching exactly what it reaches through `/api`.
 *
 * NOTHING SECRET IN ANY ANSWER. Every body the server wrote is kept, and at the end of each test none of them
 * holds a bearer, the server key or a session id.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connect } from 'node:net';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { start } from '../src/server.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const NOW = Date.UTC(2026, 8, 5, 12);
const MB = 1_048_576;

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register' as const,
  body: { id: 'obligations', name: 'Obligations', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

type Wire = {
  jsonrpc?: string;
  id?: unknown;
  result?: Record<string, unknown>;
  error?: { message: string; data?: unknown } & Record<'code', number>;
  ok?: boolean;
  value?: unknown;
  refusal?: { fix: string } & Record<'code', string>;
};

let n = 0;
const rpc = (method: string, params?: Record<string, unknown>) => ({ jsonrpc: '2.0', id: ++n, method, ...(params === undefined ? {} : { params }) });

/** A tool result: whether it is a refusal, and the whole value, which is `structuredContent` beside the brief text. */
const said = (r: { wire: Wire }) => {
  const result = r.wire.result as { content: { text: string }[]; isError?: boolean; structuredContent?: unknown };
  return { isError: result.isError === true, value: result.structuredContent, text: result.content[0]!.text };
};

/** A value with its nulls taken out, all the way down, as a tool answers one: a null says nothing a missing key does not. */
const noNulls = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(noNulls)
    : value !== null && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => [k, noNulls(v)]))
      : value;

/** The status line and headers of an answer to a request whose body is announced and never sent. */
const head = (port: number, lines: string[]) =>
  new Promise<string>((resolve, reject) => {
    const socket = connect(port, '127.0.0.1');
    let got = '';
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('nothing was answered while the body was still owed'));
    }, 3000);
    socket.on('data', (d) => {
      got += d.toString('latin1');
      if (got.includes('\r\n\r\n')) {
        clearTimeout(timer);
        socket.destroy();
        resolve(got.slice(0, got.indexOf('\r\n\r\n') + 2));
      }
    });
    socket.on('error', reject);
    socket.write(`${lines.join('\r\n')}\r\n\r\n`);
  });

/** A self-host with a server key, a Directory holding one person, and the record that person owns. `open` has no key. */
async function stack(o: { open?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-mcp-'));
  const serverKey = o.open ? undefined : randomBytes(32).toString('base64url');
  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    ...(serverKey === undefined ? {} : { token: serverKey }),
    sessionKey: new Uint8Array(randomBytes(32)),
    now: () => NOW,
    pollMs: 0,
  });
  const port = (running.server.address() as { port: number }).port;
  const origin = `http://localhost:${port}`;

  let owner = 'p_self';
  if (!o.open) {
    const person = running.directory.person$('ada@example.com', 'Ada');
    assert.ok(person.ok);
    owner = person.value.id;
    assert.ok((await running.api.createRecord({ id: REC, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: owner, email: 'ada@example.com', name: 'Ada' } })).ok);
    assert.ok(running.directory.provision({ slug: 'the-studio', email: 'ada@example.com', record: REC }).ok);
    assert.ok((await running.api.kernel.install([OBLIGATIONS])).ok);
  }

  const bodies: string[] = [];
  const secrets: string[] = serverKey === undefined ? [] : [serverKey];
  const http = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, init);
    const raw = await res.text();
    bodies.push(raw);
    return { status: res.status, headers: res.headers, raw, wire: (raw ? JSON.parse(raw) : {}) as Wire };
  };
  const mcp = (bearer: string | null, message: unknown, headers: Record<string, string> = {}) =>
    http('/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(bearer === null ? {} : { authorization: `Bearer ${bearer}` }), ...headers },
      body: typeof message === 'string' ? message : JSON.stringify(message),
    });
  /** A tool call as a 2025-06-18 client sends it after initialize: the version it agreed, and the method and name mirrored. */
  const tool = (bearer: string, name: string, args: Record<string, unknown>) =>
    mcp(bearer, rpc('tools/call', { name, arguments: args }), { 'mcp-protocol-version': '2025-06-18', 'mcp-method': 'tools/call', 'mcp-name': name });
  const api = (bearer: string, method: string, args: Record<string, unknown>) =>
    http(`/api/${method}`, { method: 'POST', headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' }, body: JSON.stringify(args) });

  return {
    running,
    port,
    origin,
    owner,
    serverKey,
    secrets,
    http,
    mcp,
    tool,
    api,
    /**
     * An agent token for `person`, minted as the host would for them. What it may do is read from the member table on every call.
     *
     * A NEW AGENT STARTS AT ASK, so a write it sends is filed as a question. `trusted` names the kinds it
     * writes at Do and tell, as `seedLadder` keeps them for a token that wrote before the ladder: these tests are about
     * the door, not the rung.
     */
    async mint(person: string, scope: 'read' | 'propose' | 'write', trusted: string[] = []) {
      const out = await running.api.createToken({ scope }, { principal: { kind: 'person', id: person, level: 'owner' } });
      assert.ok(out.ok, 'the token was not minted');
      const { id, bearer } = (out as { value: { id: string; bearer: string } }).value;
      for (const kind of trusted)
        running.sql.exec("INSERT INTO ladder (agent, kind, rung, accepted_unchanged, since) VALUES (?, ?, 'tell', 0, ?)", id, kind, new Date(NOW).toISOString());
      secrets.push(bearer);
      return bearer;
    },
    lastSurface: (person: string, scope: string) =>
      running.sql.one<{ last_surface: string | null }>('SELECT last_surface FROM token WHERE person_id = ? AND scope = ?', person, scope)?.last_surface ?? null,
    clean() {
      for (const body of bodies) for (const secret of secrets) assert.ok(!body.includes(secret), 'a secret reached an answer');
    },
    async close() {
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('401 BEFORE THE BODY: a request whose body never arrives is still answered, and a session cookie is not a bearer', async () => {
  const s = await stack();
  try {
    /* THE BODY IS ANNOUNCED AND NEVER SENT, so an answer at all proves nothing waited for it. */
    for (const auth of [[], [`Authorization: Bearer ${REC}.not-a-token-this-record-minted`], ['Authorization: '], ['Authorization: Bearer']]) {
      const got = await head(s.port, ['POST /mcp HTTP/1.1', `Host: 127.0.0.1:${s.port}`, 'Content-Type: application/json', 'Content-Length: 4096', ...auth]);
      assert.match(got, /^HTTP\/1\.1 401 /, auth.join());
      assert.match(got, /\r\nwww-authenticate: Bearer resource_metadata="http:\/\/127\.0\.0\.1:\d+\/\.well-known\/oauth-protected-resource"\r\n/i);
      assert.match(got, /\r\ncache-control: no-store\r\n/i);
    }

    /* A LIVE SESSION, proved at /api, and refused at /mcp. */
    const signedIn = await s.http('/auth/token', {
      method: 'POST',
      headers: { origin: s.origin, 'content-type': 'application/json' },
      body: JSON.stringify({ serverKey: s.serverKey }),
    });
    assert.equal(signedIn.status, 200);
    const cookie = signedIn.headers.getSetCookie()[0]?.split(';')[0] ?? assert.fail('no session cookie');
    s.secrets.push(cookie.slice(cookie.indexOf('=') + 1));
    assert.equal((await s.http('/api/boot', { headers: { cookie } })).status, 200, 'the cookie is not live, so this proves nothing');
    const refused = await s.mcp(null, rpc('ping'), { cookie });
    assert.equal(refused.status, 401);
    assert.equal(refused.headers.get('www-authenticate'), `Bearer resource_metadata="http://127.0.0.1:${s.port}/.well-known/oauth-protected-resource"`);
    assert.equal(refused.wire.error?.code, -32001);
    s.clean();
  } finally {
    await s.close();
  }
});

test('OPEN MODE IS NOT A BEARER: a request carrying nothing is the owner at /api and nobody at /mcp', async () => {
  const s = await stack({ open: true });
  try {
    assert.equal((await s.http('/api/boot')).status, 200);
    const r = await s.mcp(null, rpc('ping'));
    assert.equal(r.status, 401);
    assert.equal(r.headers.get('www-authenticate'), 'Bearer');
  } finally {
    await s.close();
  }
});

test('405, 415 AND 413 ON A REAL SOCKET, a chunked body included, and the server answers the next call', async () => {
  const s = await stack();
  try {
    const bearer = await s.mint(s.owner, 'write');
    const auth = { authorization: `Bearer ${bearer}` };
    const answers = [];

    for (const method of ['GET', 'DELETE']) {
      const r = await s.http('/mcp', { method, headers: auth });
      assert.equal(r.status, 405, method);
      assert.equal(r.headers.get('allow'), 'POST');
      /* WITH THE CODE AND THE SENTENCE EVERY OTHER DOOR ANSWERS A METHOD WITH, and nothing about the record. */
      assert.deepEqual(JSON.parse(r.raw), { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: '/mcp takes a POST of one JSON-RPC message, with a bearer.' } });
      answers.push(r);
    }

    const typed = await s.http('/mcp', { method: 'POST', headers: { ...auth, 'content-type': 'text/plain' }, body: JSON.stringify(rpc('ping')) });
    assert.equal(typed.status, 415);
    answers.push(typed);

    const claimed = await s.mcp(bearer, ' '.repeat(MB + 1));
    assert.equal(claimed.status, 413);
    answers.push(claimed);

    /* NO CONTENT-LENGTH AT ALL: twenty chunks of 64 KB, and the count is what stops it. */
    const chunk = new Uint8Array(65_536).fill(32);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        if (sent++ < 20) c.enqueue(chunk);
        else c.close();
      },
    });
    const chunked = await s.http('/mcp', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body, duplex: 'half' } as RequestInit);
    assert.equal(chunked.status, 413);
    answers.push(chunked);

    for (const r of answers) assert.equal(r.headers.get('cache-control'), 'no-store', `a ${r.status} can be cached`);
    const after = await s.mcp(bearer, rpc('ping'));
    assert.equal(after.status, 200, 'a refused body left the server unable to answer');
    s.clean();
  } finally {
    await s.close();
  }
});

test('INITIALIZE, THEN A TOOL CALL, IN ONE SESSION: nothing is minted for it, and the call reads the record', async () => {
  const s = await stack();
  try {
    const bearer = await s.mint(s.owner, 'write', ['obligations:add']);
    assert.equal((await s.api(bearer, 'create', { register: 'obligations', fields: { what: 'Invoice 41' } })).status, 200);

    const init = await s.mcp(bearer, rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } }));
    assert.equal(init.status, 200);
    assert.equal(init.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(init.headers.get('mcp-session-id'), null);
    const r = init.wire.result as { protocolVersion: string; instructions: string; serverInfo: { name: string } };
    assert.equal(r.protocolVersion, '2025-06-18');
    assert.equal(r.serverInfo.name, 'braindog');
    assert.ok(r.instructions.startsWith('BrainDog is'));

    const ack = await s.mcp(bearer, { jsonrpc: '2.0', method: 'notifications/initialized' }, { 'mcp-protocol-version': '2025-06-18' });
    assert.equal(ack.status, 202);
    assert.equal(ack.raw, '');

    const listed = await s.tool(bearer, 'list', { register: 'obligations' });
    assert.equal(listed.status, 200);
    assert.equal(listed.headers.get('mcp-session-id'), null);
    const out = said(listed);
    assert.equal(out.isError, false);
    assert.deepEqual((out.value as { rows: { fields: { what: string } }[] }).rows.map((row) => row.fields.what), ['Invoice 41']);
    /* AND THE TEXT A MODEL READS NAMES THE ROW BY ITS WORDS AND ITS HANDLE. */
    assert.match(out.text, /^Invoice 41 \(obligations#1\)/mu, out.text);

    /* AND THE TOKEN'S LISTING SAYS WHERE IT WAS LAST USED. */
    assert.equal(s.lastSurface(s.owner, 'write'), 'mcp');
    await s.api(bearer, 'boot', {});
    assert.equal(s.lastSurface(s.owner, 'write'), 'api');
    s.clean();
  } finally {
    await s.close();
  }
});

test('AN AGENT REACHES THE SAME THINGS THROUGH /mcp AS THROUGH /api, AT THE SAME LEVELS, AND NOTHING MORE', async () => {
  const s = await stack();
  try {
    const owner = { principal: { kind: 'person' as const, id: s.owner, level: 'owner' as const } };
    assert.ok((await s.running.api.invite({ person: 'p_bo', email: 'bo@example.com', name: 'Bo', level: 'read' }, owner)).ok, 'Bo was not put on the record');
    const reader = await s.mint(s.owner, 'read');
    const writer = await s.mint(s.owner, 'write', ['obligations:add']);
    /* Bo's own write token, and Bo is on the record at read: the person's level is the ceiling. */
    const bo = await s.mint('p_bo', 'write');

    const create = { register: 'obligations', fields: { what: 'Invoice 41' } };
    for (const [bearer, who] of [
      [reader, 'a read token'],
      [bo, 'a write token held by somebody at read'],
    ] as const) {
      const viaApi = await s.api(bearer, 'create', create);
      const viaMcp = said(await s.tool(bearer, 'create', create));
      assert.equal(viaApi.wire.ok, false, `${who} wrote through /api`);
      assert.equal(viaMcp.isError, true, `${who} wrote through /mcp`);
      assert.deepEqual(viaMcp.value, viaApi.wire.refusal, `${who} was refused differently through the two`);

      const readApi = await s.api(bearer, 'list', { register: 'obligations' });
      const readMcp = said(await s.tool(bearer, 'list', { register: 'obligations' }));
      assert.equal(readApi.status, 200, `${who} could not read through /api`);
      assert.equal(readMcp.isError, false, `${who} could not read through /mcp`);
      assert.deepEqual(readMcp.value, noNulls(readApi.wire.value), `${who} read differently through the two`);
    }

    /* A WRITE TOKEN OF THE OWNER WRITES THROUGH BOTH, into the one record. */
    assert.equal((await s.api(writer, 'create', { register: 'obligations', fields: { what: 'By /api' } })).status, 200);
    assert.equal(said(await s.tool(writer, 'create', { register: 'obligations', fields: { what: 'By /mcp' } })).isError, false);
    const rows = (await s.api(writer, 'list', { register: 'obligations' })).wire.value as { rows: { fields: { what: string } }[] };
    assert.deepEqual(rows.rows.map((row) => row.fields.what).sort(), ['By /api', 'By /mcp']);

    /* AND NOTHING MORE. /api refuses a token the admin surface, and /mcp has no tool that reaches it. */
    const admin = await s.api(writer, 'listTokens', {});
    assert.equal(admin.status, 403);
    assert.equal(admin.wire.refusal?.code, 'NEEDS_BROWSER_SESSION');
    for (const name of ['listTokens', 'createToken', 'installPack', 'decide', 'listGrants']) {
      const none = said(await s.tool(writer, name, {}));
      assert.equal(none.isError, true, name);
      assert.equal((none.value as { code: string }).code, 'ROUTE_UNKNOWN', name);
    }
    s.clean();
  } finally {
    await s.close();
  }
});
