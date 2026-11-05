/**
 * The key doors on the self-host, over a real socket: a keychain grant from the device flow, a deposit, a read back, a
 * rotation, and every bearer that must not get through.
 *
 * THE VALUE IS GENERATED HERE AND OBVIOUSLY FAKE, and long enough that a fragment of it anywhere is findable. At the
 * end, the SQLite file and its WAL, the event table, and everything this process wrote to a console, stdout or
 * stderr are searched for it. The one answer that asked for it is the only place it may be.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { keyOpener } from '../src/actions.ts';
import { openKeyStore, recordKeys } from '../src/keys.ts';
import { start } from '../src/server.ts';

const DAY = 86_400_000;
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
const fake = (): string => ['bd_fake_keychain_value_', randomBytes(24).toString('hex')].join('');

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
  const dir = mkdtempSync(join(tmpdir(), 'braindog-keychain-'));
  const file = join(dir, 'record.brain');
  const serverKey = randomBytes(32).toString('base64url');
  let now = Date.UTC(2026, 8, 15, 12);
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
  const project = (name: string): string => {
    const out = running.api.kernel.create('things', { name, repos: [name.toLowerCase()] }, { actor: owner });
    assert.ok(out.ok, JSON.stringify(out));
    return out.value.id;
  };

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

  const signIn = async (): Promise<string> => {
    const out = await call('/auth/token', { body: { serverKey }, headers: { origin } });
    assert.equal(out.status, 200, out.raw);
    return /^bd_s=([A-Za-z0-9_-]{43});/.exec(out.headers.getSetCookie()[0] ?? '')?.[1] ?? assert.fail('no session cookie');
  };

  return {
    running,
    file,
    call,
    project,
    owner,
    store,
    signIn,
    advance: (ms: number) => void (now += ms),
    /** A keychain grant for `scope`, through the device flow a terminal runs and the approval a person gives. */
    async grant(scope: string): Promise<string> {
      const started = await call('/auth/device', { body: { reach: 'vault', label: 'test-laptop · braindog-cli', scope } });
      assert.equal(started.status, 200, started.raw);
      const code = started.body?.value as { device_code: string; user_code: string };
      const sid = await signIn();
      const looked = await call('/api/deviceLook', { sid, body: { user_code: code.user_code } });
      const approved = await call('/api/deviceApprove', { sid, body: { user_code: code.user_code, handle: looked.body?.value?.handle } });
      assert.equal(approved.status, 200, approved.raw);
      const exchanged = await call('/auth/device/token', { body: { device_code: code.device_code } });
      assert.equal(exchanged.status, 200, exchanged.raw);
      assert.equal(exchanged.body?.value?.reach, 'vault');
      return String(exchanged.body?.value?.bearer);
    },
    /** A login token, the bearer an agent uses for everything but keys. */
    async login(): Promise<string> {
      const out = await running.api.createToken({ scope: 'write' }, { principal: { kind: 'person', id: owner, level: 'owner' } });
      assert.ok(out.ok);
      return (out as { value: { bearer: string } }).value.bearer;
    },
    logs,
    async close() {
      logs.stop();
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const door = (which: 'deposit' | 'open') => `/api/vault/${which}`;

test('DEPOSIT, READ BACK AND ROTATE UNDER A PROJECT GRANT, SIGNED BY THE RUN, AND THE VALUE NOWHERE ELSE', async () => {
  const s = await stack();
  try {
    const kiln = s.project('Kiln');
    const bearer = await s.grant(kiln);
    const login = await s.login();

    /* A run to sign the reads, attached with the login token as the command line does. */
    const here = { 'x-braindog-agent': 'claude', 'x-braindog-host': 'test-laptop', 'x-braindog-repo': 'kiln' };
    const attached = await s.call('/api/attach', { bearer: login, body: { source: 'startup', client_id: 'cc-keychain' }, headers: here });
    assert.equal(attached.status, 200, attached.raw);
    const spoken = String(attached.body?.value?.spoken);
    assert.match(spoken, /^S[1-9][0-9]*$/);
    const run = { ...here, 'x-braindog-session': spoken };

    const first = fake();
    const put = await s.call(door('deposit'), { bearer, headers: run, body: { label: 'Kiln deploy', opens: 'Deploys kiln.example', value: first } });
    assert.equal(put.status, 200, put.raw);
    assert.equal(put.body?.value?.version, 1);
    assert.equal(put.body?.value?.rotated, false);
    assert.ok(!put.raw.includes(first), 'the deposit answer carried the value');
    const credential = String(put.body?.value?.credential);

    const got = await s.call(door('open'), { bearer, headers: run, body: { label: 'Kiln deploy' } });
    assert.equal(got.status, 200, got.raw);
    assert.equal(got.body?.value?.value, first);
    assert.equal(got.headers.get('cache-control'), 'no-store');

    /* The row keeps the index and names its project; its value field names a grant, never the bytes. */
    const row = s.running.api.kernel.get(credential) ?? assert.fail(`${credential} is not there`);
    assert.equal(row.fields.project, kiln);
    assert.equal(row.fields.opens, 'Deploys kiln.example');
    assert.match(String(row.fields.value), /^g_/);

    const second = fake();
    const rotated = await s.call(door('deposit'), { bearer, headers: run, body: { label: 'Kiln deploy', value: second } });
    assert.equal(rotated.status, 200, rotated.raw);
    assert.equal(rotated.body?.value?.version, 2);
    assert.equal(rotated.body?.value?.rotated, true);
    assert.equal(rotated.body?.value?.credential, credential);
    const again = await s.call(door('open'), { bearer, headers: run, body: { credential } });
    assert.equal(again.body?.value?.value, second);

    /* `grant.read` is signed by the run. */
    const events = s.running.sql.all<Record<string, unknown>>('SELECT * FROM event');
    const reads = events.filter((e) => Object.values(e).includes('grant.read'));
    assert.equal(reads.length, 2);
    for (const e of reads) assert.equal(e.actor, spoken);

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

test('A GRANT FOR ANOTHER PROJECT, OR FOR NO PROJECT, IS FORBIDDEN THE KEY', async () => {
  const s = await stack();
  try {
    const kiln = s.project('Kiln');
    const portage = s.project('Portage');
    const owned = await s.grant(kiln);
    const put = await s.call(door('deposit'), { bearer: owned, body: { label: 'Kiln deploy', opens: 'Deploys kiln.example', value: fake() } });
    assert.equal(put.status, 200, put.raw);
    const credential = String(put.body?.value?.credential);

    for (const bearer of [await s.grant(portage), await s.grant('*')]) {
      for (const body of [{ label: 'Kiln deploy' }, { credential }]) {
        const out = await s.call(door('open'), { bearer, body });
        assert.equal(out.status, 403, out.raw);
        assert.equal(out.body?.refusal?.code, 'FORBIDDEN');
      }
      /* Nor can it write over the key: the same label under another scope is another key. */
      const other = await s.call(door('deposit'), { bearer, body: { label: 'Kiln deploy', opens: 'Somewhere else', value: fake() } });
      assert.equal(other.status, 200, other.raw);
      assert.notEqual(other.body?.value?.credential, credential);
    }
  } finally {
    await s.close();
  }
});

test('A LOGIN TOKEN, THE SERVER KEY, NO BEARER AND A PAGE ARE REFUSED AT THE DOOR', async () => {
  const s = await stack();
  try {
    const kiln = s.project('Kiln');
    const login = await s.login();
    /* A LOGIN TOKEN OPENS NO KEY. It may add one at the deposit door. */
    const token = await s.call(door('open'), { bearer: login, body: { label: 'Kiln deploy' } });
    assert.equal(token.status, 403, token.raw);
    assert.equal(token.body?.refusal?.code, 'FORBIDDEN');
    for (const which of ['deposit', 'open'] as const) {
      const none = await s.call(door(which), { body: { label: 'Kiln deploy' } });
      assert.equal(none.status, 401);

      const page = await s.call(door(which), { bearer: await s.grant(kiln), body: { label: 'Kiln deploy' }, headers: { origin: 'http://localhost' } });
      assert.equal(page.status, 403);
      assert.equal(page.body?.refusal?.at, 'origin');
    }
    assert.equal(s.running.api.kernel.count('credentials'), 0, 'a refused deposit wrote a row');
  } finally {
    await s.close();
  }
});

test('AN EXPIRED GRANT IS REFUSED: thirty days for a project', async () => {
  const s = await stack();
  try {
    const bearer = await s.grant(s.project('Kiln'));
    const put = await s.call(door('deposit'), { bearer, body: { label: 'Kiln deploy', opens: 'Deploys kiln.example', value: fake() } });
    assert.equal(put.status, 200, put.raw);

    s.advance(30 * DAY + 1);
    const late = await s.call(door('open'), { bearer, body: { label: 'Kiln deploy' } });
    assert.equal(late.status, 403, late.raw);
    assert.equal(late.body?.refusal?.code, 'FORBIDDEN');
    assert.ok(!late.raw.includes('value'), 'the refusal carried a value');
  } finally {
    await s.close();
  }
});

/* ── keychain access: a key set to ask first (`12 §6.3`) ─────────────────── */

test('A KEY SET TO ASK WAITS FOR HIM: KEY_ASKED until he allows it once, then it opens once, and the next try asks again', async () => {
  const s = await stack();
  try {
    const kiln = s.project('Kiln');
    const bearer = await s.grant(kiln);
    const value = fake();
    const put = await s.call(door('deposit'), { bearer, body: { label: 'Kiln deploy', opens: 'Deploys kiln.example', value } });
    assert.equal(put.status, 200, put.raw);
    const credential = String(put.body?.value?.credential);
    const sid = await s.signIn();

    /* NO RULE IS TODAY'S BEHAVIOUR: it opens, and the owner sees no rule and no ask. */
    assert.equal((await s.call(door('open'), { bearer, body: { credential } })).body?.value?.value, value);
    const none = await s.call(`/api/keyAccess?credential=${encodeURIComponent(credential)}`, { sid });
    assert.deepEqual(none.body?.value?.rules, [], none.raw);

    const ask = await s.call('/api/setKeyAccess', { sid, body: { credential, machine: '*', rule: 'ask' } });
    assert.equal(ask.status, 200, ask.raw);
    assert.equal(ask.body?.value?.rule, 'ask');

    const asked = await s.call(door('open'), { bearer, body: { credential } });
    assert.equal(asked.status, 403, asked.raw);
    assert.equal(asked.body?.refusal?.code, 'KEY_ASKED');
    assert.ok(!asked.raw.includes(value), 'the refusal carried the value');
    /* The CLI's next try while it waits is the same answer, and still one ask. */
    assert.equal((await s.call(door('open'), { bearer, body: { credential } })).body?.refusal?.code, 'KEY_ASKED');

    const waiting = await s.call('/api/keyAsks', { sid });
    const asks = waiting.body?.value?.asks as { id: string; credential: string; label: string; machine_name: string }[];
    assert.equal(asks.length, 1, waiting.raw);
    assert.deepEqual([asks[0]!.credential, asks[0]!.label, asks[0]!.machine_name], [credential, 'Kiln deploy', 'test-laptop']);

    /* AN AGENT CANNOT ANSWER ITS OWN ASK: a token never reaches the keychain's methods. */
    const login = await s.login();
    const self = await s.call('/api/answerKeyAsk', { bearer: login, body: { id: asks[0]!.id, answer: 'always' } });
    assert.equal(self.body?.refusal?.code, 'NEEDS_BROWSER_SESSION', self.raw);

    const once = await s.call('/api/answerKeyAsk', { sid, body: { id: asks[0]!.id, answer: 'once' } });
    assert.equal(once.status, 200, once.raw);
    assert.equal((await s.call(door('open'), { bearer, body: { credential } })).body?.value?.value, value, 'allowed once did not open');
    assert.equal((await s.call(door('open'), { bearer, body: { credential } })).body?.refusal?.code, 'KEY_ASKED', 'allowed once opened twice');
  } finally {
    await s.close();
  }
});

test('ALWAYS ALLOW opens from then on; DENY is FORBIDDEN; and the owner in a browser is never asked', async () => {
  const s = await stack();
  try {
    const kiln = s.project('Kiln');
    const bearer = await s.grant(kiln);
    const value = fake();
    const put = await s.call(door('deposit'), { bearer, body: { label: 'Kiln deploy', opens: 'Deploys kiln.example', value } });
    const credential = String(put.body?.value?.credential);
    const sid = await s.signIn();
    assert.equal((await s.call('/api/setKeyAccess', { sid, body: { credential, machine: '*', rule: 'ask' } })).status, 200);

    assert.equal((await s.call(door('open'), { bearer, body: { credential } })).body?.refusal?.code, 'KEY_ASKED');
    const id = String(((await s.call('/api/keyAsks', { sid })).body?.value?.asks as { id: string }[])[0]?.id);
    assert.equal((await s.call('/api/answerKeyAsk', { sid, body: { id, answer: 'always' } })).status, 200);
    for (let i = 0; i < 2; i++) assert.equal((await s.call(door('open'), { bearer, body: { credential } })).body?.value?.value, value);

    const handle = (await s.running.api.kernel.deviceList()).find((d) => d.reach === 'vault')!.handle;
    const deny = await s.call('/api/setKeyAccess', { sid, body: { credential, machine: handle, rule: 'deny' } });
    assert.equal(deny.status, 200, deny.raw);
    assert.equal(deny.body?.value?.machine_name, 'test-laptop');
    const denied = await s.call(door('open'), { bearer, body: { credential } });
    assert.equal(denied.status, 403, denied.raw);
    assert.equal(denied.body?.refusal?.code, 'FORBIDDEN');
    assert.equal(denied.body?.refusal?.at, 'credential');

    /* The owner's own read goes through the keychain gate and no rule. */
    const mine = await s.call('/api/keys/open', { sid, body: { credential } });
    assert.equal(mine.body?.value?.value, value, mine.raw);

    /* A machine nobody signed in is not a machine a rule can name. */
    const stranger = await s.call('/api/setKeyAccess', { sid, body: { credential, machine: 'ffffffffffffffff', rule: 'deny' } });
    assert.equal(stranger.body?.refusal?.code, 'REF_UNKNOWN', stranger.raw);
  } finally {
    await s.close();
  }
});

test('A SCHEDULED RUN IS NEVER ASKED: its opener reaches a key set to ask, or to deny, as it always did', async () => {
  const s = await stack();
  try {
    const bearer = await s.grant(s.project('Kiln'));
    const value = fake();
    const put = await s.call(door('deposit'), { bearer, body: { label: 'Kiln deploy', opens: 'Deploys kiln.example', value } });
    const credential = String(put.body?.value?.credential);
    const grant = String(s.running.api.kernel.get(credential)?.fields.value);
    const sid = await s.signIn();
    const open = keyOpener(s.running.api, s.store);
    for (const rule of ['ask', 'deny'] as const) {
      assert.equal((await s.call('/api/setKeyAccess', { sid, body: { credential, machine: '*', rule } })).status, 200);
      assert.equal(await open({ id: grant, label: 'Kiln deploy' }), value, `a scheduled run was stopped by ${rule}`);
    }
    assert.equal(((await s.call('/api/keyAsks', { sid })).body?.value?.asks as unknown[]).length, 0, 'a scheduled run filed an ask');
  } finally {
    await s.close();
  }
});

test("A GRANT NAMING A RUN ON ANOTHER MACHINE IS NOT SIGNED AS THAT RUN, so the owner's ask and the key's reads name nobody else", async () => {
  const s = await stack();
  try {
    const kiln = s.project('Kiln');
    const bearer = await s.grant(kiln);
    const login = await s.login();
    /* THE OWNER'S OWN RUN, on the owner's machine; the grant was approved for test-laptop. */
    const theirs = { 'x-braindog-agent': 'claude', 'x-braindog-host': 'owner-mac', 'x-braindog-repo': 'kiln' };
    const attached = await s.call('/api/attach', { bearer: login, body: { source: 'startup', client_id: 'cc-owner' }, headers: theirs });
    assert.equal(attached.status, 200, attached.raw);
    const spoken = String(attached.body?.value?.spoken);

    const put = await s.call(door('deposit'), { bearer, headers: { ...theirs, 'x-braindog-session': spoken }, body: { label: 'Kiln deploy', opens: 'Deploys kiln.example', value: fake() } });
    assert.equal(put.status, 200, put.raw);
    const got = await s.call(door('open'), { bearer, headers: { ...theirs, 'x-braindog-session': spoken }, body: { label: 'Kiln deploy' } });
    assert.equal(got.status, 200, got.raw);

    const signed = s.running.sql.all<{ actor: string }>("SELECT actor FROM event WHERE kind IN ('grant.read', 'grant.deposit') OR to_v LIKE '%grant%'");
    assert.ok(signed.length > 0, 'nothing was signed, so this case proves nothing');
    for (const e of signed) assert.notEqual(e.actor, spoken, "the grant signed as another machine's run");
  } finally {
    await s.close();
  }
});
