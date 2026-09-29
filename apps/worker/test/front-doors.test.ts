/**
 * The Worker's front doors: a crash answered by reference, the limit asked before a record
 * is, and the JSON lines the operator's alerts are queries over.
 *
 * THE CRASH IS MADE WHERE A STRANGER CAN MAKE ONE: a Directory that throws, which is the first binding every record door
 * touches. Its sentence holds an address, as a driver's sentence about a row can, and what is checked is that the answer
 * holds a reference and nothing of the sentence, on `/api`, under a record's name, and on `/mcp` in JSON-RPC.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bundled } from './bundled-worker.ts';
import { cloud } from './cloud-harness.ts';
import { doorPath, op, outboxFields } from '../src/oplog.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const OWNER = 'ada@example.test';
const HOST = 'app.example.test';
/* WHAT A DRIVER CAN SAY ABOUT A ROW, and the address in it is the part that must never reach a caller. */
const THROWN = 'SQLITE_AUTH: not authorized, row alice@example.com';

/** Every line written to the console while `fn` runs, whichever method wrote it. */
async function logged<T>(fn: () => Promise<T>): Promise<{ out: T; lines: string[] }> {
  const lines: string[] = [];
  const methods = ['log', 'info', 'warn', 'error'] as const;
  const kept = methods.map((m) => console[m]);
  for (const m of methods) console[m] = (...args: unknown[]) => void lines.push(args.map(String).join(' '));
  try {
    return { out: await fn(), lines };
  } finally {
    methods.forEach((m, i) => (console[m] = kept[i]!));
  }
}

/** The JSON lines among `lines`, parsed; a line that is not one is left out. */
const parsed = (lines: string[]): Record<string, unknown>[] =>
  lines.flatMap((line) => {
    try {
      const value = JSON.parse(line) as unknown;
      return typeof value === 'object' && value !== null ? [value as Record<string, unknown>] : [];
    } catch {
      return [];
    }
  });

test('A THROW AT THE FRONT DOOR ANSWERS A REFERENCE AND NOTHING OF WHAT WAS THROWN: /api, under a name, and /mcp', async () => {
  const { default: app } = await bundled();
  const throwing = { idFromName: (name: string) => name, get: () => { throw new Error(THROWN); } };
  const env = { PUBLIC_HOST: HOST, BRAINDOG_BUILD: '', DIRECTORY: throwing, RECORD: throwing, INGRESS: { send: async () => {} } };
  const asks: [string, RequestInit][] = [
    ['/api/boot', {}],
    ['/app/acme/api/boot', {}],
    [
      '/mcp',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${REC}.not-a-real-token` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      },
    ],
  ];
  for (const [path, init] of asks) {
    const { out, lines } = await logged(() => app.fetch(new Request(`https://${HOST}${path}`, init), env, { waitUntil: () => {} }));
    const text = await out.text();
    assert.equal(out.status, 500, `${path}: ${text}`);
    assert.equal(out.headers.get('cache-control'), 'no-store', path);
    assert.ok(!text.includes('alice@example.com') && !text.includes('SQLITE_AUTH'), `${path} answered what was thrown: ${text}`);

    /* ONE `crash` LINE, AND THE ANSWER CARRIES ITS REFERENCE, so the person who reads the answer can quote the line. */
    const crashes = parsed(lines).filter((line) => line.op === 'crash');
    assert.equal(crashes.length, 1, `${path}: ${lines.join('\n')}`);
    const ref = String(crashes[0]?.ref);
    assert.match(ref, /^[0-9a-f-]{36}$/);
    const body = JSON.parse(text) as { refusal?: { code?: string; fix?: string }; jsonrpc?: string; error?: { code?: number; data?: { ref?: string } } };
    if (path === '/mcp') {
      assert.equal(body.jsonrpc, '2.0');
      assert.equal(body.error?.code, -32603);
      assert.equal(body.error?.data?.ref, ref);
    } else {
      assert.equal(body.refusal?.code, 'INTERNAL');
      assert.ok(body.refusal?.fix?.includes(ref), text);
    }
    /* AND THE LINE NAMES THE DOOR, NEVER THE NAME IN THE PATH. */
    assert.equal(crashes[0]?.where, path === '/mcp' ? '/mcp' : '/api/boot');
  }
});

test('A REFUSING RL_READ IS 429 BEFORE THE RECORD IS ASKED, AND NO BINDING LIMITS NOTHING', async () => {
  const refusing = { limit: async () => ({ success: false }) };
  const cases: [string, Record<string, unknown>, number][] = [
    ['RL_READ refusing', { RL_READ: refusing }, 429],
    ['no binding', {}, 200],
  ];
  for (const [name, bound, status] of cases) {
    const c = await cloud(bound);
    await c.provision(REC, 'studio', OWNER);
    const cookie = await c.signIn(OWNER);
    /* WHAT "THE RECORD IS ASKED" MEANS HERE: the object's `fetch`, where every method runs. */
    const object = c.record(REC);
    const through = object.fetch.bind(object);
    let asked = 0;
    object.fetch = (request: Request) => {
      asked += 1;
      return through(request);
    };
    const out = await c.ask('/api/boot', { cookie });
    const text = await out.text();
    assert.equal(out.status, status, `${name}: ${text}`);
    if (status === 429) {
      assert.equal(asked, 0, `${name}: the record was asked`);
      assert.equal((JSON.parse(text) as { refusal?: { code?: string } }).refusal?.code, 'RATE_LIMITED');
      assert.equal(out.headers.get('retry-after'), '60');
      assert.equal(out.headers.get('cache-control'), 'no-store');
    } else {
      assert.equal(asked, 1, `${name}: the record was not asked`);
    }
  }
});

test('THE VERSION POLL SPENDS RL_POLL, SO A PERSON WHOSE READ MINUTE IS SPENT STILL HEARS THE RECORD MOVE', async () => {
  const refusing = { limit: async () => ({ success: false }) };
  const passing = { limit: async () => ({ success: true }) };
  const c = await cloud({ RL_READ: refusing, RL_POLL: passing });
  await c.provision(REC, 'studio', OWNER);
  const cookie = await c.signIn(OWNER);
  assert.equal((await c.ask('/api/boot', { cookie })).status, 429, 'the read minute is spent');
  const out = await c.ask('/api/version', { cookie });
  const text = await out.text();
  assert.equal(out.status, 200, text);
  assert.equal(typeof (JSON.parse(text) as { value?: { version?: unknown } }).value?.version, 'number', text);
});

test('ONLY GET /api/version IS THE POLL, which is the one ask that never wakes Slash’s daily look', async () => {
  const { pollAsked } = await import('../src/route.ts');
  assert.equal(pollAsked('GET', '/api/version'), true);
  assert.equal(pollAsked('GET', '/api/version/'), true);
  assert.equal(pollAsked('POST', '/api/version'), false);
  assert.equal(pollAsked('GET', '/api/boot'), false);
  assert.equal(pollAsked('GET', '/api/versions'), false);
});

test('A LINE IS ONE JSON OBJECT, op FIRST, AND AN ADDRESS NEVER LEAVES IN IT', async () => {
  const { lines } = await logged(async () => {
    op({ op: 'mail', kind: 'signin', ok: false, why: 'sent to ada@example.test and refused' }, 'error');
    op({ kind: 'first', op: 'boot', rec: null, fts5: true });
  });
  assert.equal(lines.length, 2);
  assert.ok(lines.every((line) => line.startsWith('{"op":')), lines.join('\n'));
  assert.ok(!lines.join('\n').includes('ada@example.test'), lines.join('\n'));
  assert.deepEqual(JSON.parse(lines[1]!), { op: 'boot', kind: 'first', rec: null, fts5: true });
});

test('A CRASH LINE NAMES THE DOOR, NEVER A TOKEN OR A NAME IN THE PATH', () => {
  assert.equal(doorPath('/api/boot'), '/api/boot');
  assert.equal(doorPath('/app/acme/api/list'), '/api/list');
  assert.equal(doorPath('/mcp/'), '/mcp');
  assert.equal(doorPath('/in/email/abc123secret'), '/in');
  assert.equal(doorPath('/auth/claim/abc123secret'), '/auth');
  assert.equal(doorPath('/app/acme/r/tasks'), '/app');
  assert.equal(doorPath('/apiary'), '/apiary');
});

test('AN ACK\'S outbox LINE: its state and attempts, and for a connector the ingest and the status the provider answered', () => {
  assert.deepEqual(outboxFields(REC, { kind: 'notify.email', state: 'dead', attempts: 8, payload: '{"to":"ada@example.test"}' }, { ok: true }, undefined), {
    op: 'outbox',
    rec: REC,
    kind: 'notify.email',
    state: 'dead',
    attempts: 8,
    ok: true,
  });
  const pulled = outboxFields(
    REC,
    { kind: 'pull.fetch', state: 'failed', attempts: 1, payload: JSON.stringify({ ingest: 'ingest.bank', grant: { ciphertext: 'x' } }) },
    { ok: true },
    { outcome: 'paused', error: { code: 'PULL_AUTH_REJECTED', at: 'fetch', found: 401, fix: 'Reconnect the credential.' } },
  );
  assert.deepEqual(pulled, { op: 'outbox', rec: REC, kind: 'pull.fetch', state: 'failed', attempts: 1, ok: true, ingest: 'ingest.bank', http: 401 });
  /* AN ACK THE RECORD REFUSED SAYS SO, with the code and nothing else of the refusal. */
  assert.deepEqual(outboxFields(null, { kind: 'notify.push', state: 'leased', attempts: 0, payload: '{}' }, { ok: false, code: 'OUT_OF_BOUNDS' }, undefined), {
    op: 'outbox',
    rec: null,
    kind: 'notify.push',
    state: 'leased',
    attempts: 0,
    ok: false,
    code: 'OUT_OF_BOUNDS',
  });
});
