/**
 * The app's own key doors on the self-host, over a real socket: an owner in a browser putting a key in, reading it
 * back, replacing its value, and every credential that must not get through.
 *
 * THESE ARE NOT THE VAULT DOORS AND DO NOT WEAKEN THEM. `/api/vault/*` takes a vault grant's bearer and refuses
 * any request carrying an `Origin`, which `vault-doors.test.ts` holds. `/api/keys/*` is the mirror image: a
 * browser session, no bearer of any kind, and an origin this host answers for. What decides whether the session
 * may reach a key is the record's own vault gate, which this file also holds to its fifteen minutes.
 *
 * THE VALUE IS GENERATED HERE AND OBVIOUSLY FAKE, and long enough that a fragment of it anywhere is findable. At
 * the end, the SQLite file and its WAL, the event table, and everything this process wrote to a console, stdout
 * or stderr are searched for it. The one answer that asked for it is the only place it may be.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openKeyStore, recordKeys } from '../src/keys.ts';
import { start } from '../src/server.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  body: {
    id: 'things',
    name: 'Things',
    title: 'name',
    scopes: { repos: 'repos' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'repos', type: 'list', of: 'text' },
    ],
  } as never,
};

const KEYS = {
  id: 'register.credentials',
  kind: 'register' as const,
  body: {
    id: 'credentials',
    name: 'Keys',
    title: 'label',
    fields: [
      { id: 'label', type: 'text', required: true, max: 120 },
      { id: 'opens', type: 'text', required: true, max: 280 },
      { id: 'kind', type: 'enum', values: ['api_token', 'password', 'ssh_key', 'recovery_codes', 'note'], required: true },
      { id: 'project', type: 'ref', to: 'things', scope: { widen: 'person' } },
      { id: 'value', type: 'secret' },
    ],
  } as never,
};

/** A fake value, made per run, that no provider would ever issue. */
const fake = (): string => ['bd_fake_keys_value_', randomBytes(24).toString('hex')].join('');

type Body = { ok: boolean; value?: Record<string, unknown>; refusal?: { code: string; fix: string; at?: string } } | null;

/** Everything this process writes while a test runs: every console method, and stdout and stderr themselves. */
function listen() {
  const lines: string[] = [];
  const kept = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  for (const name of ['log', 'error', 'warn', 'info'] as const) console[name] = (...args: unknown[]) => void lines.push(args.map(String).join(' '));
  const out = process.stdout.write.bind(process.stdout);
  const err = process.stderr.write.bind(process.stderr);
  /* Passed on as well as kept, because the test runner reports through the same streams. */
  process.stdout.write = ((chunk: unknown, ...rest: never[]) => (lines.push(String(chunk)), out(chunk as string, ...rest))) as typeof process.stdout.write;
  process.stderr.write = ((chunk: unknown, ...rest: never[]) => (lines.push(String(chunk)), err(chunk as string, ...rest))) as typeof process.stderr.write;
  return {
    lines,
    stop() {
      Object.assign(console, kept);
      process.stdout.write = out;
      process.stderr.write = err;
    },
  };
}

async function stack() {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-keys-'));
  const file = join(dir, 'record.dog');
  const serverKey = randomBytes(32).toString('base64url');
  let now = Date.UTC(2026, 8, 16, 12);
  const logs = listen();
  const store = await openKeyStore(join(dir, 'kek.key'));
  const running = await start({
    file,
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    token: serverKey,
    sessionKey: new Uint8Array(randomBytes(32)),
    keys: store,
    now: () => now,
    pollMs: 0,
  });
  const port = (running.server.address() as { port: number }).port;
  const origin = `http://localhost:${port}`;

  const person = running.directory.person$('ada@example.com', 'Ada');
  assert.ok(person.ok);
  const owner = person.value.id;
  const made = await running.api.createRecord({
    id: REC,
    slug: 'the-studio',
    name: 'The Studio',
    tz: 'UTC',
    locale: 'en',
    owner: { id: owner, email: 'ada@example.com', name: 'Ada' },
    keys: await recordKeys(store, REC),
  });
  assert.ok(made.ok, JSON.stringify(made));
  assert.ok(running.directory.provision({ slug: 'the-studio', email: 'ada@example.com', record: REC }).ok);
  const installed = await running.api.kernel.install([THINGS, KEYS]);
  assert.ok(installed.ok, JSON.stringify(installed));

  const call = async (path: string, init: { body?: unknown; sid?: string; bearer?: string; headers?: Record<string, string> } = {}) => {
    const method = init.body === undefined ? 'GET' : 'POST';
    const headers: Record<string, string> = {
      ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
      ...(init.sid === undefined ? {} : { cookie: `bd_s=${init.sid}`, origin }),
      ...(init.bearer === undefined ? {} : { authorization: `Bearer ${init.bearer}` }),
      ...init.headers,
    };
    const res = await fetch(`http://localhost:${port}${path}`, { method, headers, ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }) });
    const raw = await res.text();
    return { status: res.status, raw, body: (raw ? JSON.parse(raw) : null) as Body, headers: res.headers };
  };

  return {
    running,
    file,
    call,
    origin,
    owner,
    serverKey,
    logs,
    project: (name: string): string => {
      const out = running.api.kernel.create('things', { name, repos: [name.toLowerCase()] }, { actor: owner });
      assert.ok(out.ok, JSON.stringify(out));
      return out.value.id;
    },
    advance: (ms: number) => void (now += ms),
    /** A browser session, the way the app gets one on a self-host: the server key exchanged for a cookie. */
    async signIn(): Promise<string> {
      const out = await call('/auth/token', { body: { serverKey }, headers: { origin } });
      assert.equal(out.status, 200, out.raw);
      return /^bd_s=([A-Za-z0-9_-]{43});/.exec(out.headers.getSetCookie()[0] ?? '')?.[1] ?? assert.fail('no session cookie');
    },
    /** A login token, the bearer an agent uses for everything but keys. */
    async login(): Promise<string> {
      const out = await running.api.createToken({ scope: 'write' }, { principal: { kind: 'person', id: owner, level: 'owner' } });
      assert.ok(out.ok);
      return (out as { value: { bearer: string } }).value.bearer;
    },
    async close() {
      logs.stop();
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const door = (which: 'put' | 'open') => `/api/keys/${which}`;

test('A KEY PUT IN, READ BACK AND REPLACED FROM A BROWSER SESSION, AND THE VALUE NOWHERE ELSE', async () => {
  const s = await stack();
  try {
    const kiln = s.project('Kiln');
    const sid = await s.signIn();

    const first = fake();
    const put = await s.call(door('put'), {
      sid,
      body: { label: 'Kiln deploy', opens: 'Deploys kiln.example', kind: 'api_token', project: kiln, value: first },
    });
    assert.equal(put.status, 200, put.raw);
    assert.equal(put.body?.value?.version, 1);
    assert.equal(put.body?.value?.rotated, false);
    assert.ok(!put.raw.includes(first), 'the answer carried the value');
    const credential = String(put.body?.value?.credential);

    const got = await s.call(door('open'), { sid, body: { credential } });
    assert.equal(got.status, 200, got.raw);
    assert.equal(got.body?.value?.value, first);
    assert.equal(got.headers.get('cache-control'), 'no-store');

    /* The row keeps the index and names its project; its value field names a grant, never the bytes. */
    const row = s.running.api.kernel.get(credential) ?? assert.fail(`${credential} is not there`);
    assert.equal(row.fields.project, kiln);
    assert.equal(row.fields.opens, 'Deploys kiln.example');
    assert.match(String(row.fields.value), /^g_/);

    /* REPLACING ONE ROW'S VALUE ROTATES ITS GRANT rather than making a second row saying the same thing. */
    const second = fake();
    const again = await s.call(door('put'), {
      sid,
      body: { label: 'Kiln deploy', opens: 'Deploys kiln.example', credential, value: second },
    });
    assert.equal(again.status, 200, again.raw);
    assert.equal(again.body?.value?.version, 2);
    assert.equal(again.body?.value?.rotated, true);
    assert.equal(again.body?.value?.credential, credential);
    assert.equal(s.running.api.kernel.count('credentials'), 1, 'replacing a value made a second row');
    const back = await s.call(door('open'), { sid, body: { credential } });
    assert.equal(back.body?.value?.value, second);

    /* A read is counted, and signed by the person: a person in a browser is never a run. */
    const events = s.running.sql.all<Record<string, unknown>>('SELECT * FROM event');
    const reads = events.filter((e) => Object.values(e).includes('grant.read'));
    assert.equal(reads.length, 2);
    for (const e of reads) assert.equal(e.actor, s.owner);

    /* AND NOWHERE ELSE: not the event table, not the file or its WAL, not a line this process wrote. */
    const table = JSON.stringify(events, (_k, v: unknown) => (v instanceof Uint8Array ? Buffer.from(v).toString('latin1') : v));
    for (const value of [first, second]) {
      assert.ok(!table.includes(value), 'a value reached the event table');
      for (const line of s.logs.lines) assert.ok(!line.includes(value), 'a value reached a log, stdout or stderr');
      for (const path of [s.file, `${s.file}-wal`])
        if (existsSync(path)) assert.equal(readFileSync(path).indexOf(Buffer.from(value, 'utf8')), -1, `a value reached ${path}`);
    }
  } finally {
    await s.close();
  }
});

test('EVERY BEARER IS REFUSED NEEDS_BROWSER_SESSION, the server key included', async () => {
  const s = await stack();
  try {
    const login = await s.login();
    const body = { label: 'Kiln deploy', opens: 'Deploys kiln.example', value: fake() };
    for (const which of ['put', 'open'] as const)
      for (const bearer of [login, s.serverKey]) {
        const out = await s.call(door(which), { bearer, body, headers: { origin: s.origin } });
        assert.equal(out.status, 403, out.raw);
        assert.equal(out.body?.refusal?.code, 'NEEDS_BROWSER_SESSION');
      }
    assert.equal(s.running.api.kernel.count('credentials'), 0, 'a refused put wrote a row');
  } finally {
    await s.close();
  }
});

test('A PAGE SOMEWHERE ELSE, AND A REQUEST THAT IS NOT A PAGE AT ALL, ARE BOTH REFUSED', async () => {
  const s = await stack();
  try {
    const sid = await s.signIn();
    const body = { label: 'Kiln deploy', opens: 'Deploys kiln.example', value: fake() };
    for (const which of ['put', 'open'] as const) {
      const cross = await s.call(door(which), { sid, body, headers: { origin: 'https://elsewhere.example' } });
      assert.notEqual(cross.status, 200, cross.raw);
      /* A terminal sends no `Origin`, and a terminal's door is `/api/vault/*`, not this one. */
      const bare = await s.call(door(which), { body, headers: { cookie: `bd_s=${sid}` } });
      assert.notEqual(bare.status, 200, bare.raw);
    }
    assert.equal(s.running.api.kernel.count('credentials'), 0, 'a refused put wrote a row');
  } finally {
    await s.close();
  }
});

test('A SESSION WHOSE LAST PROOF IS OVER FIFTEEN MINUTES OLD IS SENT BACK TO SIGN IN', async () => {
  const s = await stack();
  try {
    const sid = await s.signIn();
    s.advance(16 * 60_000);
    const out = await s.call(door('put'), { sid, body: { label: 'Kiln deploy', opens: 'Deploys kiln.example', value: fake() } });
    assert.equal(out.status, 403, out.raw);
    assert.equal(out.body?.refusal?.code, 'NEEDS_BROWSER_SESSION');
    assert.match(String(out.body?.refusal?.fix), /Sign in again/);
    assert.equal(s.running.api.kernel.count('credentials'), 0, 'a refused put wrote a row');
  } finally {
    await s.close();
  }
});

test('A KEY THIS RECORD DOES NOT HOLD IS REF_UNKNOWN, and one with no sealed value is GRANT_REVOKED', async () => {
  const s = await stack();
  try {
    const sid = await s.signIn();
    const missing = await s.call(door('open'), { sid, body: { label: 'Nothing by that name' } });
    assert.equal(missing.body?.refusal?.code, 'REF_UNKNOWN', missing.raw);

    const put = await s.call(door('put'), { sid, body: { label: 'Kiln deploy', opens: 'Deploys kiln.example', value: fake() } });
    assert.equal(put.status, 200, put.raw);
    const credential = String(put.body?.value?.credential);
    const grant = String(s.running.api.kernel.get(credential)?.fields.value);
    assert.ok((await s.running.api.revokeGrant({ id: grant }, { principal: { kind: 'person', id: s.owner, level: 'owner' } })).ok);

    const gone = await s.call(door('open'), { sid, body: { credential } });
    assert.equal(gone.body?.refusal?.code, 'GRANT_REVOKED', gone.raw);
  } finally {
    await s.close();
  }
});
