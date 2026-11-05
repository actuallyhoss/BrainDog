/**
 * The Worker's key doors with the key store bound, over a real record: a keychain grant from the device flow, a deposit,
 * a read back, a scope that does not reach, a record made before the store was bound, and a root key that is not
 * the record's.
 *
 * THE RECORD IS `createRecordApi` OVER `node:sqlite`, the same SQLite a Durable Object runs, and the calls the Worker
 * makes over RPC are made to it directly. The root key is made in memory per test, and so is the value, which is
 * obviously fake and long enough that a fragment of it anywhere is findable. At the end every table of the record,
 * every answer but the one read, and everything this process wrote to a console, stdout or stderr are searched for it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { KeychainGrantSeen } from '@braindog/host';
import type { Result } from '@braindog/ports';
import { createRecordApi, type RecordApi } from '@braindog/record';

import { fixedClock, openSqlite, type NodeSql } from '../../../packages/kernel/test/sqlite.ts';
import { keyStoreOf, recordKeys, type KeyStore } from '../src/keys.ts';
import { OLD_RECORD, serveWorkerKeychain, type GrantDeps } from '../src/keychain.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const OWNER = 'p_01JZ8QK3F7R2M9V4XN6TCB5HAO';
const NOW = Date.UTC(2026, 8, 15, 12);

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

/** A root key for one test, made in memory and written nowhere. */
const testStore = async (): Promise<KeyStore> =>
  (await keyStoreOf(Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex'))) ?? assert.fail('no store');

/** A fake value, made per run, that no provider would ever issue. */
const fake = (): string => `bd_fake_keychain_value_${Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString('hex')}`;

type Body = { ok: boolean; value?: Record<string, unknown>; refusal?: { code: string; fix: string; at?: string } };

/** Everything this process writes while a test runs: every console method, and stdout and stderr themselves. */
function listen() {
  const lines: string[] = [];
  const kept = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  for (const name of ['log', 'error', 'warn', 'info'] as const) console[name] = (...args: unknown[]) => void lines.push(args.map(String).join(' '));
  const out = process.stdout.write.bind(process.stdout);
  const err = process.stderr.write.bind(process.stderr);
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

/** Every row of every table the record keeps, with bytes as bytes, as one string to search. */
function storage(sql: NodeSql): string {
  const tables = sql.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'");
  return tables
    .map((t) => JSON.stringify(sql.all(`SELECT * FROM "${t.name}"`), (_k, v: unknown) => (v instanceof Uint8Array ? Buffer.from(v).toString('latin1') : v)))
    .join('\n');
}

/** A record, made with keys when `store` is given, as provisioning makes one. */
async function record(store: KeyStore | null) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const made = await api.createRecord({
    id: REC,
    slug: 'the-studio',
    name: 'The Studio',
    tz: 'UTC',
    locale: 'en',
    owner: { id: OWNER, email: 'ada@example.com', name: 'Ada' },
    ...(store ? { keys: await recordKeys(store, REC) } : {}),
  });
  assert.ok(made.ok, JSON.stringify(made));
  const installed = await api.kernel.install([THINGS, KEYS]);
  assert.ok(installed.ok, JSON.stringify(installed));
  return {
    sql,
    api,
    project(name: string): string {
      const out = api.kernel.create('things', { name, repos: [name.toLowerCase()] }, { actor: OWNER });
      assert.ok(out.ok, JSON.stringify(out));
      return out.value.id;
    },
    /** A keychain grant for `scope`, through the device flow a terminal runs and the approval the owner gives. */
    async grant(scope: string): Promise<string> {
      const started = await api.deviceStart({ reach: 'vault', label: 'test-laptop', scope }, '127.0.0.1');
      assert.ok(started.ok, JSON.stringify(started));
      const person = { principal: { kind: 'person' as const, id: OWNER, level: 'owner' as const } };
      const looked = await api.deviceLook({ user_code: started.value.user_code }, person);
      assert.ok(looked.ok, JSON.stringify(looked));
      const approved = await api.deviceApprove({ user_code: started.value.user_code, handle: looked.value.handle }, person);
      assert.ok(approved.ok, JSON.stringify(approved));
      const out = await api.devicePoll({ device_code: started.value.device_code });
      assert.ok(out.ok, JSON.stringify(out));
      return String((out.value as { bearer?: string }).bearer);
    },
  };
}

/** The Worker's deps over one record, as `keyDoor` builds them over RPC. `store` absent is `KEK` unbound. */
function over(api: RecordApi, store?: KeyStore | null): GrantDeps {
  return {
    knows: async (id) => id === REC,
    keychainGrant: async (_id, bearer) => (await api.keychainGrant(bearer)) as Result<KeychainGrantSeen>,
    keys:
      store === undefined
        ? undefined
        : {
            store: async () => store,
            wrappingKey: async () => api.kernel.wrappingKey(),
            depositGrant: (_id, args, grant, hints, seal) => api.depositGrant(args, grant as never, hints, seal),
            openForGrant: (_id, args, grant, hints, kekId) => api.openForGrant(args, grant as never, hints, kekId),
          },
  };
}

async function call(deps: GrantDeps, which: 'deposit' | 'open', bearer: string, body: Record<string, unknown>) {
  const res = await serveWorkerKeychain(
    new Request(`https://app.brain.dog/api/vault/${which}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
      body: JSON.stringify(body),
    }),
    deps,
  );
  const raw = await res.text();
  return { status: res.status, raw, body: JSON.parse(raw) as Body, headers: res.headers };
}

test('WITH THE KEY STORE BOUND, A DEPOSIT IS SEALED AND READS BACK ONCE, AND THE VALUE IS NOWHERE ELSE', async () => {
  const logs = listen();
  const store = await testStore();
  const r = await record(store);
  try {
    assert.equal(r.api.kernel.wrappingKey(), (await store.current()).kekId);
    const kiln = r.project('Kiln');
    const bearer = await r.grant(kiln);
    const deps = over(r.api, store);
    const answers: string[] = [];

    const first = fake();
    const put = await call(deps, 'deposit', bearer, { label: 'Kiln deploy', opens: 'Deploys kiln.example', value: first });
    answers.push(put.raw);
    assert.equal(put.status, 200, put.raw);
    assert.equal(put.body.value?.version, 1);
    const credential = String(put.body.value?.credential);

    const got = await call(deps, 'open', bearer, { label: 'Kiln deploy' });
    assert.equal(got.status, 200, got.raw);
    assert.equal(got.body.value?.value, first);
    assert.equal(got.body.value?.credential, credential);
    assert.equal(got.headers.get('cache-control'), 'no-store');

    /* The row names a grant, never the bytes. */
    const row = r.api.kernel.get(credential) ?? assert.fail(`${credential} is not there`);
    assert.equal(row.fields.project, kiln);
    assert.match(String(row.fields.value), /^g_/);

    const second = fake();
    const rotated = await call(deps, 'deposit', bearer, { label: 'Kiln deploy', value: second });
    answers.push(rotated.raw);
    assert.equal(rotated.body.value?.version, 2);
    const again = await call(deps, 'open', bearer, { credential });
    assert.equal(again.body.value?.value, second);

    const missing = await call(deps, 'open', bearer, { label: 'Nothing by that name' });
    answers.push(missing.raw);
    assert.equal(missing.body.ok, false);

    const events = JSON.stringify(r.sql.all('SELECT * FROM event'));
    assert.equal(r.sql.all("SELECT id FROM event WHERE kind = 'grant.read'").length, 2);
    const kept = storage(r.sql);
    for (const value of [first, second]) {
      assert.ok(!kept.includes(value), 'a value reached the record storage');
      assert.ok(!events.includes(value), 'a value reached an event');
      for (const raw of answers) assert.ok(!raw.includes(value), 'a value reached an answer other than the read');
      for (const line of logs.lines) assert.ok(!line.includes(value), 'a value reached a log, stdout or stderr');
    }
  } finally {
    logs.stop();
    r.sql.close();
  }
});

test('A GRANT FOR ANOTHER PROJECT, OR FOR NO PROJECT, IS FORBIDDEN THE KEY', async () => {
  const store = await testStore();
  const r = await record(store);
  try {
    const deps = over(r.api, store);
    const kiln = r.project('Kiln');
    const portage = r.project('Portage');
    const value = fake();
    const put = await call(deps, 'deposit', await r.grant(kiln), { label: 'Kiln deploy', opens: 'Deploys kiln.example', value });
    assert.equal(put.status, 200, put.raw);
    const credential = String(put.body.value?.credential);

    for (const bearer of [await r.grant(portage), await r.grant('*')])
      for (const body of [{ label: 'Kiln deploy' }, { credential }]) {
        const out = await call(deps, 'open', bearer, body);
        assert.equal(out.status, 403, out.raw);
        assert.equal(out.body.refusal?.code, 'FORBIDDEN');
        assert.ok(!out.raw.includes(value), 'the refusal carried the value');
      }
  } finally {
    r.sql.close();
  }
});

test('A RECORD MADE BEFORE THE KEY STORE WAS BOUND ANSWERS ONE SENTENCE, and writes nothing', async () => {
  const r = await record(null);
  try {
    assert.equal(r.api.kernel.wrappingKey(), null);
    const deps = over(r.api, await testStore());
    const bearer = await r.grant(r.project('Kiln'));
    for (const [which, body] of [
      ['deposit', { label: 'Kiln deploy', opens: 'Deploys kiln.example', value: fake() }],
      ['open', { label: 'Kiln deploy' }],
    ] as const) {
      const out = await call(deps, which, bearer, body);
      assert.equal(out.status, 501, out.raw);
      assert.equal(out.body.refusal?.code, 'NOT_IN_THIS_BUILD');
      assert.equal(out.body.refusal?.fix, OLD_RECORD);
      assert.equal(out.headers.get('cache-control'), 'no-store');
    }
    assert.equal(r.api.kernel.count('credentials'), 0, 'a refused deposit wrote a row');
  } finally {
    r.sql.close();
  }
});

test('WITHOUT THE BINDING, A VALID GRANT ON A REAL RECORD STILL ENDS AT NOT_IN_THIS_BUILD', async () => {
  const r = await record(null);
  try {
    const bearer = await r.grant(r.project('Kiln'));
    for (const which of ['deposit', 'open'] as const) {
      const out = await call(over(r.api), which, bearer, { label: 'Kiln deploy', opens: 'x', value: fake() });
      assert.equal(out.status, 501, out.raw);
      assert.equal(out.body.refusal?.code, 'NOT_IN_THIS_BUILD');
      assert.equal(out.body.refusal?.at, 'keys');
      assert.notEqual(out.body.refusal?.fix, OLD_RECORD);
    }
    assert.equal(r.api.kernel.count('credentials'), 0);
  } finally {
    r.sql.close();
  }
});

test('A ROOT KEY THE RECORD WAS NOT WRAPPED UNDER IS WRONG_KEY, never a crash and never a row', async () => {
  const r = await record(await testStore());
  try {
    const deps = over(r.api, await testStore());
    const bearer = await r.grant(r.project('Kiln'));
    const put = await call(deps, 'deposit', bearer, { label: 'Kiln deploy', opens: 'Deploys kiln.example', value: fake() });
    assert.equal(put.body.refusal?.code, 'WRONG_KEY', put.raw);
    const got = await call(deps, 'open', bearer, { label: 'Kiln deploy' });
    assert.equal(got.body.ok, false, got.raw);
    assert.equal(r.api.kernel.count('credentials'), 0);
  } finally {
    r.sql.close();
  }
});
