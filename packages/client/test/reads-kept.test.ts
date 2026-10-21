/**
 * Reads kept by the record's version (`keepReads` in `index.ts`): asked again at the same version and with no write sent
 * since, a read is answered from what it was answered and asks nothing. A moved version, any write, the reader's mark
 * for an answer that carries it, a refusal and a pull all ask again. Off unless an app turns it on.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createClient, forgetReads, keepReads, keptRead, wroteOutside } from '../src/index.ts';

function host() {
  const state = { version: 4, refuse: false };
  const asked: string[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const name = url.pathname.replace(/^\/api\//, '');
    asked.push(name);
    if (name === 'version') return Response.json({ ok: true, value: { version: state.version } });
    if (state.refuse) return Response.json({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'No.' } }, { status: 403 });
    if (name === 'page') return Response.json({ ok: true, value: { slug: url.searchParams.get('slug'), blocks: [{ kind: 'table', rows: [] }] } });
    if (name === 'previewPage') return Response.json({ ok: true, value: { blocks: [{ kind: 'feed', source: 'activity', seen: 'x' }], body: JSON.parse(String(init?.body ?? '{}')) } });
    return Response.json({ ok: true, value: { rows: [{ n: asked.length }] } });
  }) as typeof globalThis.fetch;
  const count = (name: string) => asked.filter((a) => a === name).length;
  return { fetch, asked, count, state };
}

test('OFF, every read is asked; ON, the same read at the same version is answered at once, as a copy of its own', async () => {
  const h = host();
  const c = createClient({ base: 'https://a.example', fetch: h.fetch });
  await c.list({ register: 'tasks' });
  await c.list({ register: 'tasks' });
  assert.equal(h.count('list'), 2);

  keepReads(true);
  try {
    await c.version();
    const first = await c.list({ register: 'tasks' });
    const again = await createClient({ base: 'https://a.example', fetch: h.fetch }).list({ register: 'tasks' });
    assert.equal(h.count('list'), 3);
    assert.deepEqual(again, first);
    /* EACH CALLER ITS OWN COPY: one that sorts or trims its rows reaches into nobody else's. */
    (again as { ok: true; value: { rows: unknown[] } }).value.rows.length = 0;
    const third = (await c.list({ register: 'tasks' })) as { ok: true; value: { rows: unknown[] } };
    assert.equal(third.value.rows.length, 1);
  } finally {
    keepReads(false);
  }
});

test('A MOVED VERSION, A WRITE AND A PULL ASK AGAIN; a refusal is never kept', async () => {
  const h = host();
  const c = createClient({ base: 'https://a.example', fetch: h.fetch });
  keepReads(true);
  try {
    await c.version();
    await c.page('money');
    await c.page('money');
    assert.equal(h.count('page'), 1);

    h.state.version = 5;
    await c.version();
    await c.page('money');
    assert.equal(h.count('page'), 2, 'the version moved');

    await c.create({ register: 'tasks', fields: { name: 'x' } });
    await c.page('money');
    assert.equal(h.count('page'), 3, 'a write was sent');

    wroteOutside();
    await c.page('money');
    assert.equal(h.count('page'), 4, 'a write was sent past the client');

    forgetReads();
    await c.page('money');
    assert.equal(h.count('page'), 5, 'a pull');

    h.state.refuse = true;
    await c.list({ register: 'nope' });
    h.state.refuse = false;
    await c.list({ register: 'nope' });
    assert.equal(h.count('list'), 2, 'a refusal is asked again');
  } finally {
    keepReads(false);
  }
});

test("THE READER'S MARK ASKS AGAIN ONLY THE ANSWERS THAT CARRY IT, and a read sent as a POST is kept by its body", async () => {
  const h = host();
  const c = createClient({ base: 'https://a.example', fetch: h.fetch });
  keepReads(true);
  try {
    await c.version();
    const body = { page: 'home', title: 'Today', blocks: [] };
    await c.call('previewPage', { body });
    await c.call('previewPage', { body });
    await c.call('previewPage', { body: { ...body, title: 'Other' } });
    assert.equal(h.count('previewPage'), 2);
    await c.page('money');
    await c.markRead();
    await c.call('previewPage', { body });
    await c.page('money');
    assert.equal(h.count('previewPage'), 3, 'its feed says what is unread');
    assert.equal(h.count('page'), 1, 'a page with no feed is the same page');
  } finally {
    keepReads(false);
  }
});

test('A READ BEFORE ANY VERSION IS KEPT AT THE FIRST VERSION ONLY WHEN IT WENT OUT AFTER THAT VERSION WAS ASKED', async () => {
  const h = host();
  const c = createClient({ base: 'https://a.example', fetch: h.fetch });
  keepReads(true);
  try {
    const tick = () => new Promise((r) => setTimeout(r, 5));
    await c.list({ register: 'early' });
    await tick();
    const asking = c.version();
    await tick();
    await c.list({ register: 'late' });
    await asking;
    await c.list({ register: 'early' });
    await c.list({ register: 'late' });
    assert.deepEqual(
      h.asked.filter((a) => a === 'list').length,
      3,
      'the read sent before the version was asked is asked again; the one sent after it is kept',
    );
  } finally {
    keepReads(false);
  }
});

test('A READ PAST THE CLIENT IS KEPT THE SAME WAY, and one at a relative address is always asked', async () => {
  const h = host();
  const c = createClient({ base: 'https://a.example', fetch: h.fetch });
  let n = 0;
  const ask = async () => ({ ok: true as const, value: (n += 1) });
  keepReads(true);
  try {
    await c.version();
    assert.equal((await keptRead('https://a.example', 'actions', ask)).value, 1);
    assert.equal((await keptRead('https://a.example/', 'actions', ask)).value, 1);
    h.state.version = 9;
    await c.version();
    assert.equal((await keptRead('https://a.example', 'actions', ask)).value, 2);
    assert.equal((await keptRead('', 'actions', ask)).value, 3);
    assert.equal((await keptRead('', 'actions', ask)).value, 4);
  } finally {
    keepReads(false);
  }
});
