/**
 * Schemas asked in one turn go as one read (`batchSchemas` in `index.ts`): each asker is answered as `schema` would have
 * answered it, a wave of one is `schema` as before, a host without `schemas` is asked once a list from then on, a whole
 * wave refused is asked once a list so each list hears its own refusal, and a host nobody reached is that for all.
 * Off unless an app turns it on.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { batchSchemas, createClient, forgetSchemas } from '../src/index.ts';

const BLOCKS = { 'block.tally': { title: 'Tally', purpose: 'Counts.' } };
const DECL = (id: string) => ({ id, name: id, title: 'name', fields: [{ id: 'name', type: 'text' }] });

function host(how: { schemas?: 'yes' | 'none' | 'refuse' | 'down' } = {}) {
  const asked: string[] = [];
  const fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const name = url.pathname.replace(/^\/api\//, '');
    asked.push(`${name} ${url.searchParams.get('register') ?? url.searchParams.get('registers') ?? ''}`.trim());
    if (name === 'schema') {
      const register = url.searchParams.get('register')!;
      if (register === 'closed') return Response.json({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'Not yours.' } }, { status: 403 });
      return Response.json({ ok: true, value: { ...DECL(register), blocks: BLOCKS } });
    }
    if (name === 'schemas') {
      if (how.schemas === 'none') return Response.json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no method called schemas.' } }, { status: 404 });
      if (how.schemas === 'refuse') return Response.json({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'You may not read.' } }, { status: 403 });
      if (how.schemas === 'down') throw new Error('fetch failed');
      const registers = JSON.parse(url.searchParams.get('registers')!) as string[];
      const lists = Object.fromEntries(registers.filter((r) => r !== 'closed').map((r) => [r, DECL(r)]));
      const refused = registers.includes('closed') ? { closed: { code: 'FORBIDDEN', fix: 'Not yours.' } } : {};
      return Response.json({ ok: true, value: { lists, refused, blocks: BLOCKS } });
    }
    return Response.json({ ok: true, value: null });
  }) as typeof globalThis.fetch;
  return { fetch, asked };
}

const on = async (fn: () => Promise<void>) => {
  forgetSchemas();
  batchSchemas(true);
  try {
    await fn();
  } finally {
    batchSchemas(false);
    forgetSchemas();
  }
};

test('OFF, each list is asked by itself, as it always was', async () => {
  forgetSchemas();
  const h = host();
  const c = createClient({ base: 'https://a.example', fetch: h.fetch });
  await Promise.all(['tasks', 'people'].map((r) => c.schema(r)));
  assert.deepEqual(h.asked.sort(), ['schema people', 'schema tasks']);
  forgetSchemas();
});

test('ON, the lists asked together go as one read, and each is answered as schema answers it', () =>
  on(async () => {
    const h = host();
    const c = createClient({ base: 'https://a.example', fetch: h.fetch });
    const [tasks, people, closed] = await Promise.all(['tasks', 'people', 'closed'].map((r) => c.schema(r)));
    assert.deepEqual(h.asked, ['schemas ["tasks","people","closed"]']);
    assert.deepEqual(tasks, { ok: true, value: { ...DECL('tasks'), blocks: BLOCKS } });
    assert.deepEqual(people, { ok: true, value: { ...DECL('people'), blocks: BLOCKS } });
    assert.deepEqual(closed, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Not yours.' } });
    /* KEPT AS schema KEEPS IT, and the refusal is not. */
    await c.schema('tasks');
    await c.schema('closed');
    assert.deepEqual(h.asked, ['schemas ["tasks","people","closed"]', 'schema closed']);
  }));

test('ON, one list alone is asked as schema, and two readers of one list share the one ask', () =>
  on(async () => {
    const h = host();
    const c = createClient({ base: 'https://a.example', fetch: h.fetch });
    await Promise.all([c.schema('tasks'), createClient({ base: 'https://a.example', fetch: h.fetch }).schema('tasks')]);
    assert.deepEqual(h.asked, ['schema tasks']);
  }));

test('A HOST WITHOUT schemas is asked once a list, and from then on without trying it again', () =>
  on(async () => {
    const h = host({ schemas: 'none' });
    const c = createClient({ base: 'https://a.example', fetch: h.fetch });
    const out = await Promise.all(['tasks', 'people'].map((r) => c.schema(r)));
    assert.ok(out.every((r) => r.ok));
    await Promise.all(['things', 'books'].map((r) => c.schema(r)));
    assert.deepEqual(h.asked.filter((a) => a.startsWith('schemas')).length, 1);
    assert.deepEqual(h.asked.filter((a) => a.startsWith('schema ')).sort(), ['schema books', 'schema people', 'schema tasks', 'schema things']);
  }));

test('A WAVE REFUSED WHOLE IS ASKED ONCE A LIST, so each list hears what schema says of it', () =>
  on(async () => {
    const h = host({ schemas: 'refuse' });
    const c = createClient({ base: 'https://a.example', fetch: h.fetch });
    const [tasks, closed] = await Promise.all(['tasks', 'closed'].map((r) => c.schema(r)));
    assert.equal(tasks?.ok, true);
    assert.equal(closed?.ok, false);
    assert.deepEqual(h.asked.slice(1).sort(), ['schema closed', 'schema tasks']);
  }));

test('A HOST NOBODY REACHED is that answer for every list in the wave, and nothing is kept', () =>
  on(async () => {
    const h = host({ schemas: 'down' });
    const c = createClient({ base: 'https://a.example', fetch: h.fetch });
    const out = await Promise.all(['tasks', 'people'].map((r) => c.schema(r)));
    for (const r of out) assert.equal(!r.ok && 'refusal' in r ? r.refusal.code : null, 'UNREACHABLE');
    assert.deepEqual(h.asked, ['schemas ["tasks","people"]']);
  }));

test('EVERY LIST ASKED BESIDE boot ANSWERS THE LISTS A SCREEN THEN LEARNS, and one it does not hold is asked as before', () =>
  on(async () => {
    const h = host();
    const every = { ok: true, value: { lists: { tasks: DECL('tasks'), people: DECL('people') }, refused: {}, blocks: BLOCKS } };
    const c = createClient({ base: 'https://a.example', fetch: h.fetch });
    /* THE ANSWER THE PAGE ASKED FOR BEFORE THE APP ARRIVED, read once and never asked again. */
    assert.equal(await c.schemas(Promise.resolve(Response.json(every))), true);
    const [tasks, people, things] = await Promise.all(['tasks', 'people', 'things'].map((r) => createClient({ base: 'https://a.example', fetch: h.fetch }).schema(r)));
    assert.deepEqual(tasks, { ok: true, value: { ...DECL('tasks'), blocks: BLOCKS } });
    assert.deepEqual(people, { ok: true, value: { ...DECL('people'), blocks: BLOCKS } });
    assert.equal(things?.ok, true);
    assert.deepEqual(h.asked, ['schema things'], 'only the list it did not hold went out');
  }));

test('A schema ASKED WHILE EVERY LIST IS STILL OUT WAITS FOR IT, and asks nothing of its own', () =>
  on(async () => {
    const h = host();
    let land: (r: Response) => void = () => {};
    const c = createClient({ base: 'https://a.example', fetch: h.fetch });
    void c.schemas(new Promise<Response>((done) => (land = done)));
    const asking = c.schema('tasks');
    await new Promise((r) => setTimeout(r, 5));
    land(Response.json({ ok: true, value: { lists: { tasks: DECL('tasks') }, refused: {}, blocks: BLOCKS } }));
    assert.deepEqual(await asking, { ok: true, value: { ...DECL('tasks'), blocks: BLOCKS } });
    assert.deepEqual(h.asked, []);
  }));

test('EVERY LIST REFUSED OR UNREACHED IS NOTHING TO TAKE, and each list is asked as before', () =>
  on(async () => {
    const h = host();
    const c = createClient({ base: 'https://a.example', fetch: h.fetch });
    assert.equal(await c.schemas(Promise.resolve(Response.json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'No.' } }, { status: 404 }))), false);
    assert.equal((await c.schema('tasks')).ok, true);
    assert.deepEqual(h.asked, ['schema tasks']);
    forgetSchemas();
    assert.equal(await c.schemas(Promise.reject(new Error('fetch failed'))), false);
    assert.equal((await c.schema('people')).ok, true);
    assert.deepEqual(h.asked, ['schema tasks', 'schema people']);
  }));

test('A WRITE SENT SINCE EVERY LIST WAS ASKED leaves it untaken, since the write may have declared something', () =>
  on(async () => {
    const h = host();
    const c = createClient({ base: 'https://a.example', fetch: h.fetch });
    let land: (r: Response) => void = () => {};
    void c.schemas(new Promise<Response>((done) => (land = done)));
    await c.call('create', { register: 'tasks', fields: {} });
    land(Response.json({ ok: true, value: { lists: { tasks: DECL('tasks') }, refused: {}, blocks: BLOCKS } }));
    assert.equal((await c.schema('tasks')).ok, true);
    assert.deepEqual(h.asked, ['create', 'schema tasks']);
  }));
