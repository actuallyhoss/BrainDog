/**
 * The client, against a real server.
 *
 * There is no mock here on purpose. A client tested against a fake is a client that agrees with the
 * fake, and the two places this one has to be right — the verb it picks and the shape it hands back —
 * are exactly the two a fake would get wrong in the same way the client does.
 *
 * AND IT LIVES WITH THE SERVER RATHER THAN WITH THE CLIENT. It was `packages/client/test/`, which
 * gave `@braindog/client` a devDependency on `@braindog/selfhost` and a relative import that climbed
 * three directories out of the package into an app — `31 §1`: a package may name a capability, only
 * an app may name a runtime, and that package named one. The test is unchanged; the only thing that
 * moved is which side of the boundary it sits on, which is the side that has the runtime.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { codeOf, conflicted } from '@braindog/ports';

import { createClient } from '@braindog/client';
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
      { id: 'what', type: 'text', required: true, search: true },
      { id: 'party', type: 'text', search: true },
      { id: 'amount', type: 'money' },
      { id: 'state', type: 'enum', values: ['open', 'paid'] },
    ],
  } as never,
};

/* PORT 0, AND THE OS PICKS ONE. A counter from a fixed base fails for a reason that is not about
   the code — a killed run still holding a socket, another checkout, a reserved range — and it fails
   on whichever test happens to land on the number, which changes every time one is inserted. */

async function connected(token?: string) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-client-'));
  const running = await start({ file: join(dir, 'record.sqlite'), port: 0, ...(token === undefined ? {} : { token }) });
  const at = (running.server.address() as { port: number }).port;
  assert.ok((await running.api.kernel.install([OBLIGATIONS])).ok);
  const client = createClient({ base: `http://127.0.0.1:${at}`, ...(token === undefined ? {} : { token }) });
  return {
    client,
    async close() {
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const value = <T>(r: { ok: boolean } & Record<string, unknown>): T => {
  assert.ok(r.ok, r.ok ? '' : JSON.stringify(r.refusal));
  return (r as never as { value: T }).value;
};
const refusal = (r: { ok: boolean }) => {
  assert.ok(!r.ok, 'the call succeeded');
  return (r as never as { refusal: { code: string; fix: string; allowed?: string[] } }).refusal;
};

/* ── it works ────────────────────────────────────────────────────────────── */

test('THE CLIENT DRIVES A REAL RECORD, over a real socket', async () => {
  const c = await connected();
  try {
    assert.deepEqual(
      value<{ registers: { id: string }[] }>(await c.client.boot()).registers.map((r) => r.id),
      ['obligations'],
    );

    const made = value<{ seq: number; version: number }>(
      await c.client.create({ register: 'obligations', fields: { what: 'Invoice 41', party: 'Halden', state: 'open' } }),
    );
    assert.equal(made.seq, 1);

    const read = value<{ fields: { what: string } }>(await c.client.get('obligations', 1));
    assert.equal(read.fields.what, 'Invoice 41');

    value(await c.client.update({ register: 'obligations', seq: 1, patch: { state: 'paid' }, version: made.version }));
    assert.equal(value<{ state: string }>(await c.client.get('obligations', 1)).state, 'paid');
  } finally {
    await c.close();
  }
});

test('a predicate survives the query string, which is the thing a GET client gets wrong', async () => {
  const c = await connected();
  try {
    for (const [what, state] of [['a', 'open'], ['b', 'paid'], ['c', 'open']] as const)
      value(await c.client.create({ register: 'obligations', fields: { what, state } }));

    assert.equal(value<{ matched: number }>(await c.client.list({ register: 'obligations' })).matched, 3);
    assert.equal(
      value<{ matched: number }>(await c.client.list({ register: 'obligations', where: { field: 'state', is: 'open' } })).matched,
      2,
    );
    assert.equal(
      value<{ matched: number }>(
        await c.client.list({ register: 'obligations', where: { all: [{ field: 'state', is: 'open' }, { field: 'what', is: 'a' }] } }),
      ).matched,
      1,
    );
  } finally {
    await c.close();
  }
});

test('search comes back with enough to draw a result without fetching it', async () => {
  const c = await connected();
  try {
    value(await c.client.create({ register: 'obligations', fields: { what: 'Invoice 41', party: 'Halden' } }));
    const hits = value<{ register: string; seq: number; title: string }[]>(await c.client.search('hal'));
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.title, 'Invoice 41');
  } finally {
    await c.close();
  }
});

/* ── a refusal is a value at both ends ───────────────────────────────────── */

test('A REFUSAL IS A VALUE, WITH ITS SENTENCE INTACT, and nothing throws for one', async () => {
  // A client that throws on a 422 makes every caller write a try/catch to read a message that was
  // already structured, and the message loses its shape on the way through.
  const c = await connected();
  try {
    const missing = refusal(await c.client.create({ register: 'obligations', fields: { amount: { amount: 1, currency: 'GBP' } } }));
    assert.equal(missing.code, 'REQUIRED_MISSING');
    assert.ok(missing.fix.length > 10);

    const gone = refusal(await c.client.schema('atlantis'));
    assert.equal(gone.code, 'REGISTER_UNKNOWN');
    assert.ok(gone.allowed?.includes('obligations'), 'the refusal lost its list on the way through');

    value(await c.client.create({ register: 'obligations', fields: { what: 'a' } }));
    /* A CONFLICT SURVIVES THE TRIP TOO, and it is the arm that would have been quietly lost: the
       client passes the envelope through, so a body arriving as `{ ok: false, conflict }` reaches a
       caller reading `.refusal.fix` unless the client knows there are three arms. */
    const stale = await c.client.update({ register: 'obligations', seq: 1, patch: { what: 'b' }, version: 99 });
    assert.ok(conflicted(stale));
    assert.equal(codeOf(stale), 'VERSION_STALE');
    assert.ok(stale.conflict.current, 'the row did not survive the trip, and it is what a re-apply needs');
  } finally {
    await c.close();
  }
});

test('a method this build does not have is refused before a request is made', async () => {
  const c = await connected();
  try {
    const out = refusal(await c.client.call('delete_everything'));
    assert.equal(out.code, 'ROUTE_UNKNOWN');
    assert.ok(out.allowed?.includes('list'));
  } finally {
    await c.close();
  }
});

/* ── the network is the one thing the record has no opinion about ────────── */

test('A NETWORK FAILURE IS A REFUSAL TOO, so a caller has exactly one branch to write', async () => {
  const client = createClient({ base: 'http://127.0.0.1:9' });
  const out = refusal(await client.boot());
  assert.equal(out.code, 'UNREACHABLE');
  assert.match(out.fix, /could not be reached/);
});

test('and an answer this client does not recognise is unreachable, not a success', async () => {
  // A proxy returning its own error page with a 200 would otherwise arrive as a successful call
  // whose value is an HTML string, and the first thing that reads a field off it fails somewhere
  // unrelated to the cause.
  const client = createClient({
    base: 'http://x',
    fetch: async () => new Response('<html>we are having trouble</html>', { status: 200 }),
  });
  assert.equal(refusal(await client.boot()).code, 'UNREACHABLE');

  const wrongShape = createClient({ base: 'http://x', fetch: async () => new Response(JSON.stringify({ data: 1 })) });
  assert.equal(refusal(await wrongShape.boot()).code, 'UNREACHABLE');
});

/* ── the verb comes from the table ───────────────────────────────────────── */

test('THE VERB FOLLOWS THE ROUTE TABLE, not the caller’s guess', async () => {
  const seen: { url: string; method: string }[] = [];
  const client = createClient({
    base: 'http://x',
    fetch: async (input, init) => {
      seen.push({ url: String(input), method: init?.method ?? 'GET' });
      return new Response(JSON.stringify({ ok: true, value: null }));
    },
  });

  await client.boot();
  await client.list({ register: 'obligations' });
  await client.create({ register: 'obligations', fields: {} });
  await client.update({ register: 'obligations', seq: 1, patch: {} });

  assert.deepEqual(seen.map((s) => s.method), ['GET', 'GET', 'POST', 'POST']);
  for (const route of ROUTES.filter((r) => r.writes))
    assert.ok(
      seen.every((s) => !s.url.includes(`/api/${route.name}`) || s.method === 'POST'),
      `${route.name} writes and was sent as a GET`,
    );
});

test('a token is sent when there is one, and not when there is not', async () => {
  const headers: (string | null)[] = [];
  const withToken = createClient({
    base: 'http://x',
    token: 'sekret',
    fetch: async (_i, init) => {
      headers.push(new Headers(init?.headers).get('authorization'));
      return new Response(JSON.stringify({ ok: true, value: null }));
    },
  });
  const without = createClient({
    base: 'http://x',
    fetch: async (_i, init) => {
      headers.push(new Headers(init?.headers).get('authorization'));
      return new Response(JSON.stringify({ ok: true, value: null }));
    },
  });
  await withToken.boot();
  await without.boot();
  assert.deepEqual(headers, ['Bearer sekret', null]);
});

test('and the whole route table is reachable from the client', async () => {
  // A method in the table with no way to call it is a method that does not exist for anybody using
  // this client, which is everybody.
  const c = await connected();
  try {
    for (const route of ROUTES) {
      const out = await c.client.call(route.name, { register: 'obligations', seq: 1, fields: { what: 'x' }, patch: {}, q: 'x' });
      const answer = out as { ok: boolean; refusal?: { code: string } };
      assert.notEqual(answer.refusal?.code, 'ROUTE_UNKNOWN', `${route.name} is in the table and the client cannot call it`);
      assert.notEqual(answer.refusal?.code, 'UNREACHABLE', `${route.name} did not reach the server`);
    }
  } finally {
    await c.close();
  }
});
