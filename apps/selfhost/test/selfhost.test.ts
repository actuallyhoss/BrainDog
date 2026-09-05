/**
 * The whole stack, over a socket.
 *
 * Every other test in this repo holds one package still and checks it. This one starts a server,
 * makes real HTTP requests, and reads a real file — because the thing that has never been checked
 * until now is whether the seven packages fit together, and the answer to that is not a unit test.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ROUTES } from '@braindog/host';
import { start } from '../src/server.ts';

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register' as const,
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money', index: true },
      { id: 'state', type: 'enum', values: ['open', 'paid'], index: true },
    ],
  } as never,
};

type Answer = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; allowed?: string[] } };

let port = 8900;

async function server(token?: string) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-'));
  const file = join(dir, 'record.sqlite');
  const at = port++;
  const running = await start({ file, port: at, ...(token === undefined ? {} : { token }) });
  assert.ok((await running.api.kernel.install([OBLIGATIONS])).ok);

  const call = async (path: string, body?: unknown): Promise<{ status: number; body: Answer }> => {
    const res = await fetch(`http://127.0.0.1:${at}/api/${path}`, {
      ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    return { status: res.status, body: (await res.json()) as Answer };
  };

  return {
    call,
    file,
    dir,
    port: at,
    /* `close` stops the server and leaves the FILE, because one test below is about the file
       outliving the process — a close that deleted it would make that test unwritable. */
    close: () => running.close(),
    clean() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('THE WHOLE STACK ANSWERS OVER A SOCKET', async () => {
  const s = await server();
  try {
    const boot = await s.call('boot');
    assert.equal(boot.status, 200);
    assert.deepEqual((boot.body.value as { registers: { id: string }[] }).registers.map((r) => r.id), ['obligations']);

    const made = await s.call('create', { register: 'obligations', fields: { what: 'Invoice 41', state: 'open', amount: { amount: 48_000, currency: 'GBP' } } });
    assert.equal(made.status, 200);
    assert.equal((made.body.value as { seq: number }).seq, 1);

    const read = await s.call('get?register=obligations&seq=1');
    assert.equal((read.body.value as { fields: { what: string } }).fields.what, 'Invoice 41');

    const listed = await s.call(`list?register=obligations&where=${encodeURIComponent(JSON.stringify({ field: 'state', is: 'open' }))}`);
    assert.equal((listed.body.value as { matched: number }).matched, 1);
  } finally {
    await s.close();
    s.clean();
  }
});

test('a record is a FILE, and it is still there when the process is not', async () => {
  // The whole promise of the self-host: your record is a file you have, not a service you rent.
  const s = await server();
  await s.call('create', { register: 'obligations', fields: { what: 'Invoice 41' } });
  await s.close();

  const again = await start({ file: s.file, port: s.port + 100 });
  try {
    const rows = await again.api.list({ register: 'obligations' }, { principal: { kind: 'person', id: 'p_self', level: 'owner' } });
    assert.ok(rows.ok);
    assert.equal(rows.value.rows[0]?.fields.what, 'Invoice 41');
    // And the number does not restart, because the counter travelled with the file.
    const next = await again.api.create({ register: 'obligations', fields: { what: 'Invoice 42' } }, { principal: { kind: 'person', id: 'p_self', level: 'owner' } });
    assert.ok(next.ok);
    assert.equal(next.value.seq, 2);
  } finally {
    await again.close();
    s.clean();
  }
});

test('EVERY ROUTE IN THE SHARED TABLE IS WIRED HERE TOO', async () => {
  // A route in one host and not the other is a product that behaves differently depending on where
  // a customer runs it, and nobody finds out until a record moves between them. The server refuses
  // to start rather than serve a partial surface — this asserts it answers all of them.
  const s = await server();
  try {
    for (const route of ROUTES) {
      const res = route.writes
        ? await s.call(route.name, { register: 'obligations', fields: { what: 'x' }, spoken: 'obligations#1', patch: {}, note: 'x' })
        : await s.call(`${route.name}?register=obligations&seq=1`);
      assert.notEqual(res.status, 404, `${route.name} is in the table and not served`);
      assert.notEqual(res.status, 405, `${route.name} disagrees with the table about its method`);
    }
  } finally {
    await s.close();
    s.clean();
  }
});

test('a refusal comes back over HTTP with its sentence and a status that means something', async () => {
  const s = await server();
  try {
    const bad = await s.call('create', { register: 'obligations', fields: { amount: { amount: 4.5, currency: 'GBP' } } });
    assert.equal(bad.status, 422);
    assert.match(bad.body.refusal?.fix ?? '', /minor units/);

    const gone = await s.call('schema?register=atlantis');
    assert.equal(gone.status, 404);
    assert.ok(gone.body.refusal?.allowed?.includes('obligations'));

    const nothing = await s.call('nonsense');
    assert.equal(nothing.status, 404);
    assert.equal(nothing.body.refusal?.code, 'ROUTE_UNKNOWN');
  } finally {
    await s.close();
    s.clean();
  }
});

test('with a token set, a request without it is refused before it reaches the record', async () => {
  const s = await server('sekret');
  try {
    const ok = await s.call('boot');
    assert.equal(ok.status, 200);

    const res = await fetch(`http://127.0.0.1:${s.port}/api/boot`);
    assert.equal(res.status, 401);
    assert.equal(((await res.json()) as Answer).refusal?.code, 'FORBIDDEN');
  } finally {
    await s.close();
    s.clean();
  }
});
