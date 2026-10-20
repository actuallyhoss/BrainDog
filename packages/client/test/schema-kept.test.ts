/**
 * A list's schema is asked once a version for the whole tab, however many clients ask it (`SCHEMAS` in `index.ts`):
 * nine screens asked it 48 times. A moved version, a write, a refusal, another host or another token asks again.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createClient, followDeclarations, wrote } from '../src/index.ts';

function host(answers: { version: number; refuse?: boolean }) {
  const asked: string[] = [];
  const fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const name = url.pathname.replace(/^\/api\//, '');
    asked.push(`${url.host} ${name}`);
    if (name === 'version') return Response.json({ ok: true, value: { version: answers.version } });
    if (name === 'schema' && answers.refuse) return Response.json({ ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: 'There is no list called nope.' } }, { status: 404 });
    if (name === 'schema') return Response.json({ ok: true, value: { register: url.searchParams.get('register') } });
    return Response.json({ ok: true, value: {} });
  }) as typeof globalThis.fetch;
  const schemas = () => asked.filter((a) => a.endsWith(' schema')).length;
  return { fetch, asked, schemas, answers };
}

test('NINE CLIENTS ON ONE HOST ASK schema(tasks) ONCE, and a moved version asks once more', async () => {
  const h = host({ version: 4 });
  const clients = Array.from({ length: 9 }, () => createClient({ base: 'https://a.example', fetch: h.fetch }));
  await Promise.all(clients.map((c) => c.schema('tasks')));
  assert.equal(h.schemas(), 1);
  /* THE FIRST VERSION HEARD names the answer already kept. */
  await clients[0]!.version();
  await clients[3]!.schema('tasks');
  assert.equal(h.schemas(), 1);
  h.answers.version = 5;
  await clients[1]!.version();
  await Promise.all(clients.map((c) => c.schema('tasks')));
  assert.equal(h.schemas(), 2);
});

test('A WRITE DROPS THE KEPT SCHEMAS, a refusal is never kept, and two hosts or two tokens never share', async () => {
  const h = host({ version: 1 });
  const a = createClient({ base: 'https://a.example', fetch: h.fetch });
  await a.schema('tasks');
  await a.create({ register: 'tasks', fields: { name: 'x' } });
  await a.schema('tasks');
  assert.equal(h.schemas(), 2);

  const r = host({ version: 1, refuse: true });
  const c = createClient({ base: 'https://a.example', fetch: r.fetch });
  assert.equal((await c.schema('nope')).ok, false);
  await c.schema('nope');
  assert.equal(r.schemas(), 2);

  const s = host({ version: 1 });
  await createClient({ base: 'https://a.example', fetch: s.fetch }).schema('tasks');
  await createClient({ base: 'https://b.example', fetch: s.fetch }).schema('tasks');
  await createClient({ base: 'https://a.example', fetch: s.fetch, token: 'rec_1.x' }).schema('tasks');
  assert.equal(s.schemas(), 3);
});

test('THE READER’S MARK AND A READ SENT AS A WRITE KEEP THE SCHEMAS: markRead and previewPage declare nothing', async () => {
  const h = host({ version: 1 });
  const a = createClient({ base: 'https://a.example', fetch: h.fetch });
  await a.schema('tasks');
  await a.markRead();
  await a.call('previewPage', { body: {} });
  await a.schema('tasks');
  assert.equal(h.schemas(), 1);
});

test('FOLLOWING THE DECLARATIONS, a moved version keeps the schema and a moved token asks again', async () => {
  const h = host({ version: 1 });
  let token: string | null = 'd1';
  followDeclarations(async () => token);
  try {
    const a = createClient({ base: 'https://follow.example', fetch: h.fetch });
    await a.version();
    await a.schema('tasks');
    h.answers.version = 2;
    await a.version();
    await a.schema('tasks');
    assert.equal(h.schemas(), 1, 'a row written elsewhere moved the version, and no declaration');
    token = 'd2';
    await a.schema('tasks');
    assert.equal(h.schemas(), 2, 'the log held a declaration');
    /* NOT CAUGHT UP: kept by the version again, which has not moved since the last ask. */
    token = null;
    await a.schema('tasks');
    assert.equal(h.schemas(), 3);
    await a.schema('tasks');
    assert.equal(h.schemas(), 3);
  } finally {
    followDeclarations(null);
  }
});

test('THE SAME READ OUT AT ONCE IS SENT ONCE, each caller gets its own copy, and a write ends the sharing', async () => {
  const h = host({ version: 1 });
  const a = createClient({ base: 'https://fly.example', fetch: h.fetch });
  const b = createClient({ base: 'https://fly.example', fetch: h.fetch });
  const [x, y] = await Promise.all([a.get('tasks', 1), b.get('tasks', 1)]);
  assert.equal(h.asked.filter((s) => s.endsWith(' get')).length, 1);
  assert.deepEqual(x, y);
  assert.notEqual(x, y);
  const wrote0 = wrote();
  const first = a.get('tasks', 1);
  await a.create({ register: 'tasks', fields: { name: 'x' } });
  await Promise.all([first, a.get('tasks', 1)]);
  assert.equal(h.asked.filter((s) => s.endsWith(' get')).length, 3);
  assert.equal(wrote(), wrote0 + 1);
});
