/**
 * A bearer that reaches a record's object after the record was deleted: the 401 every unknown bearer gets, on `/api` and on
 * `/mcp`, and never the object's own 503 `DELETED`.
 *
 * HOW A BEARER GETS THERE. Deleting a record closes its name in the Directory, and a bearer the Directory does not know is
 * 401 before any object is addressed. But the Worker keeps the Directory's yes for 30 s (`directoryKept`), so a key used
 * just before the delete still reaches the object for that long, and a Directory whose close did not land answers yes for
 * good. That yes is made here by hand, so the test does not wait on the kept answer's clock.
 *
 * WHY IT IS THE 401. `Record$.admit` answers `null` for a deleted object before anything else (`#gone`), and `bearerOf`
 * reads `null` as a bearer nobody issued, so the request is never forwarded and the object's 503s (`#answered`: deleted,
 * restoring, a build it refuses) are never reached by a bearer. A door that moves the check into the forwarded request
 * has to answer the same: the 401's one body on `/api`, and on `/mcp` the JSON-RPC 401 whose `www-authenticate` names
 * where to sign in (RFC 9728), so an agent starts OAuth again and does not wait for a record that is not coming back.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cloud, HOST, ORIGIN } from './cloud-harness.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const OWNER = 'ada@example.test';
const SLUG = 'studio';

type Out = { ok: boolean; value?: any; refusal?: { code: string; fix: string } };

/** A record with a write key that worked, deleted by its owner, and a Directory that still says yes to it. */
async function deleted() {
  const c = await cloud();
  const person = await c.provision(REC, SLUG, OWNER);
  const cookie = await c.signIn(OWNER);
  const minted = (await (await c.ask('/api/createToken', { method: 'POST', cookie, body: JSON.stringify({ scope: 'write', label: 'agent' }) })).json()) as Out;
  assert.ok(minted.ok, JSON.stringify(minted));
  const bearer = minted.value.bearer as string;
  assert.equal((await c.ask('/api/whoami', { bearer })).status, 200, 'the key did not work before the delete');

  const object = c.record(REC) as any;
  const gone = await c.ask('/api/deleteRecord', { method: 'POST', cookie, body: JSON.stringify({ slug: SLUG }) });
  assert.equal(gone.status, 200, await gone.clone().text());
  assert.equal(await c.directory.knows(REC), false, 'the delete left the name open');
  assert.equal(c.record(REC), object, 'the delete started a new object, so this is not the deleted one');

  /* THE DIRECTORY'S YES, as its kept answer gives it for 30 s, made by hand and asked every time. */
  const dir = c.directory as any;
  const knows = dir.knows.bind(dir);
  dir.knows = async (id: string) => (id === REC ? true : knows(id));
  (c.bundle as any).directoryKept.clear();

  /* WHAT THE OBJECT IS ASKED: `admit`, the bearer path's one trip, and `fetch`, where every method and every 503 is. */
  const seen = { admit: 0, fetch: 0 };
  const admit = object.admit.bind(object);
  object.admit = (...a: unknown[]) => ((seen.admit += 1), admit(...a));
  const fetch = object.fetch.bind(object);
  object.fetch = (request: Request) => ((seen.fetch += 1), fetch(request));
  return { c, person, object, bearer, seen, fetch };
}

test('A DELETED OBJECT ANSWERS A BEARER ON /api THE ONE 401, AND ITS OWN 503 IS NEVER REACHED', async () => {
  const { c, person, bearer, seen, fetch } = await deleted();
  for (const [path, init] of [
    ['/api/whoami', {}],
    ['/api/create', { method: 'POST', body: JSON.stringify({ register: 'tasks', fields: { title: 'After the delete' } }) }],
  ] as const) {
    const res = await c.ask(path, { ...init, bearer });
    const text = await res.text();
    assert.equal(res.status, 401, `${path}: ${text}`);
    assert.deepEqual(JSON.parse(text), { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'unauthorized' } }, path);
    assert.equal(res.headers.get('www-authenticate'), null, `${path} names an OAuth door, which is /mcp's`);
  }
  assert.equal(seen.admit, 2, 'the object was not asked, so this is the Directory’s 401 and not the object’s');
  assert.equal(seen.fetch, 0, 'a bearer was forwarded to a deleted object');

  /* WHAT IT WOULD HAVE ANSWERED, forwarded: its own 503, which no bearer is ever handed. */
  const ctx = { principal: { kind: 'token', id: 'tok_x', scope: 'write', person, level: 'owner' } };
  const direct = await fetch(new Request(`${ORIGIN}/api/whoami`, { headers: { 'x-braindog-ctx': JSON.stringify(ctx) } }));
  assert.equal(direct.status, 503, await direct.clone().text());
  assert.equal(((await direct.json()) as Out).refusal?.code, 'RECORD_UNAVAILABLE');
});

test('AND ON /mcp THE JSON-RPC 401, WITH www-authenticate NAMING resource_metadata', async () => {
  const { c, bearer, seen } = await deleted();
  for (const message of [{ method: 'tools/list' }, { method: 'tools/call', params: { name: 'record_index', arguments: {} } }]) {
    const res = await c.bundle.default.fetch(
      new Request(`${ORIGIN}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, ...message }) }),
      c.env,
      { waitUntil: () => {} },
    );
    const text = await res.text();
    assert.equal(res.status, 401, `${message.method}: ${text}`);
    assert.equal(res.headers.get('www-authenticate'), `Bearer resource_metadata="https://${HOST}/.well-known/oauth-protected-resource"`);
    const body = JSON.parse(text) as { jsonrpc?: string; id?: unknown; error?: { code?: number; message?: string } };
    assert.equal(body.jsonrpc, '2.0', text);
    assert.equal(body.id, null, text);
    assert.equal(body.error?.message, 'UNAUTHORIZED', text);
  }
  assert.equal(seen.admit, 2);
  assert.equal(seen.fetch, 0, 'a bearer was forwarded to a deleted object');
});
