/**
 * A record method under a slug, `/<slug>/api/<method>`, through `export default`'s own `fetch` and a real `Directory$`, and
 * the same under the old `/app/<slug>/api/<method>`, which a CLI whose hosts file was written before the move still asks.
 *
 * THE WEB SENDS EVERY RECORD CALL THERE ONCE A PAGE IS UNDER A SLUG (`apiBase` in `apps/web/src/lib/at.ts`), so the
 * pieces `app-path.test.ts` and `session.test.ts` hold one at a time have to meet in `route()`: the slug read off the
 * path, the Directory asked about it, and the record handed `/api/<method>` at the root it routes on. That file reads
 * `index.ts` as text for the wiring, and text cannot tell a door that runs from one written after the `return` that
 * forwards, so this suite runs the bundle (`bundled-worker.ts`). The records behind it are a double that writes down
 * what reached it, because what a record does with `boot` is `packages/record`'s and is tested there.
 *
 * AND `/app/api/<method>`, WHICH NAMES NO RECORD AND NO PAGE. `api` is a word the Directory never hands out, so the
 * first segment was read as one of the app's pages, the rest was `/api/boot`, and the Worker served it as a second
 * copy of the root `/api`: the public demo to a caller with no credential (the demo is gone since),
 * a cookie's record to a signed-in caller, and the key doors past their own check, which
 * reads the slug and saw none. The web never renders that address, so it is never served: a write is refused, as
 * `ROUTE_UNKNOWN`, the way any other path this Worker does not serve is, and a GET is the old address's one 308 to the
 * root's own `/api`, which asks the caller's credential again at the real door.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bundled, objectStorage } from './bundled-worker.ts';

const HOST = 'brain.example.test';
const ORIGIN = `https://${HOST}`;
const STUDIO = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const HOME = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE';
const BOOKS = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAF';
const ADA = 'ada@example.test';

type Reached = { record: string; path: string; method: string; body: string };

/** The Worker, its Directory over `node:sqlite` with three records named, and Ada signed in on two of them. */
async function world() {
  const { default: worker, Directory$ } = await bundled();
  const addressed: string[] = [];
  const reached: Reached[] = [];
  const records = {
    idFromName: (n: string) => (addressed.push(n), n),
    get: (record: string) => ({
      fetch: async (request: Request) => {
        reached.push({ record, path: new URL(request.url).pathname, method: request.method, body: await request.text() });
        return new Response('{"ok":true,"value":{}}', { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
      },
      access: async () => ({ level: 'owner', registers: null, levels: {} }),
    }),
  };
  /* THE SHELL IS THERE, so a path the Worker reads as a page of the app answers 200 with it rather than "no app". */
  const ASSETS = {
    fetch: async (request: Request) =>
      new URL(request.url).pathname === '/' ? new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }) : new Response(null, { status: 404 }),
  };
  const env: Record<string, unknown> = { PUBLIC_HOST: HOST, SESSION_SECRET: 'fake-session-secret-for-tests-only-0123456789', RECORD: records, ASSETS };
  /* THE KEY IS DERIVED UNDER THE BLOCK, asynchronously, so the test waits for it as the platform would. */
  const blocked: Promise<unknown>[] = [];
  const state = { storage: objectStorage(), id: { toString: () => 'directory' }, blockConcurrencyWhile: (f: () => Promise<unknown>) => (blocked.push(f()), blocked.at(-1)), waitUntil: () => {} };
  const directory = new Directory$(state, env);
  await Promise.all(blocked);
  env['DIRECTORY'] = { idFromName: (n: string) => n, get: () => directory };

  for (const [slug, email, record] of [['the-studio', ADA, STUDIO], ['ada-at-home', ADA, HOME], ['bobs-books', 'bob@example.test', BOOKS]] as const) {
    assert.ok(directory.prepare(slug, email, null).person, slug);
    assert.equal(directory.nameRecord(slug, email, record), null, slug);
  }
  const claim = await directory.auth({ flow: 'claim.mint', email: ADA });
  const signed = await directory.auth({ flow: 'magic.redeem', claimToken: claim.mail?.claimToken, ip: '' });
  assert.ok(signed.session && signed.session !== 'clear', JSON.stringify(signed));
  const sid = signed.session.sid;
  const on = ((await directory.auth({ flow: 'session', sid })).body as { record?: string } | undefined)?.record;
  /* WHICHEVER RECORD THE SESSION ROW WAS LEFT ON, the slug asks for the other, so a pass cannot be the row answering. */
  const other = on === STUDIO ? { slug: 'ada-at-home', record: HOME } : { slug: 'the-studio', record: STUDIO };
  const ask = (path: string, init: RequestInit = {}) => worker.fetch(new Request(`${ORIGIN}${path}`, init), env, { waitUntil: () => {} });
  const cookie = { cookie: `__Host-bd_s=${sid}` };
  const clear = () => ((addressed.length = 0), (reached.length = 0));
  return { ask, cookie, other, addressed, reached, clear };
}

test('A MEMBER UNDER A SLUG REACHES THAT RECORD AT /api/<method>, a read and a write alike, and not the one the session was on', async () => {
  const { ask, cookie, other, reached } = await world();
  const read = await ask(`/${other.slug}/api/boot`, { headers: cookie });
  assert.equal(read.status, 200, await read.clone().text());
  const write = await ask(`/${other.slug}/api/create`, {
    method: 'POST',
    headers: { ...cookie, origin: ORIGIN, 'content-type': 'application/json' },
    body: '{"register":"tasks","fields":{"title":"x"}}',
  });
  assert.equal(write.status, 200, await write.clone().text());
  /* THE OLD ADDRESS, SERVED WHERE IT STANDS AND NEVER REDIRECTED: a CLI refuses every redirect. */
  const old = await ask(`/app/${other.slug}/api/boot`, { headers: cookie });
  assert.equal(old.status, 200, await old.clone().text());
  assert.deepEqual(reached, [
    { record: other.record, path: '/api/boot', method: 'GET', body: '' },
    { record: other.record, path: '/api/create', method: 'POST', body: '{"register":"tasks","fields":{"title":"x"}}' },
    { record: other.record, path: '/api/boot', method: 'GET', body: '' },
  ]);
});

test('A SLUG SHE IS NOT ON AND ONE NOBODY HOLDS ARE THE SAME 403, AND NO RECORD IS ADDRESSED FOR EITHER', async () => {
  const { ask, cookie, addressed, reached } = await world();
  const bodies: unknown[] = [];
  for (const slug of ['bobs-books', 'nobody-has-this']) {
    const out = await ask(`/${slug}/api/boot`, { headers: cookie });
    assert.equal(out.status, 403, slug);
    bodies.push(await out.json());
  }
  const NOT_ON = { ok: false, refusal: { code: 'FORBIDDEN', fix: 'You are not on this BrainDog.' } };
  assert.deepEqual(bodies, [NOT_ON, NOT_ON], 'a name that exists answered differently from one that does not');
  /* `idFromName` ON A NAME NOBODY HAS CREATES THE OBJECT, so a refused slug must not reach the records at all. */
  assert.deepEqual(addressed, []);
  assert.deepEqual(reached, []);
});

test('/app/api/<method> IS NOT A SECOND /api: no session record, and the key doors are not reached by it', async () => {
  const { ask, cookie, addressed, reached, clear } = await world();
  /* THE ROOT STILL ANSWERS THE SAME COOKIE, so the refusals below are the path's and not a session that stopped working.
     Nothing presented at the root is 401 and reaches no record, which is what the root answers a stranger now. */
  const root = await ask('/api/boot', { headers: cookie });
  assert.equal(root.status, 200, await root.clone().text());
  assert.equal(reached.length, 1, 'the root did not reach the session record');
  assert.equal((await ask('/api/boot')).status, 401);
  assert.equal(reached.length, 1, 'a request with no credential reached a record');
  clear();

  const asks: [string, RequestInit][] = [
    ['/app/api/boot', {}],
    ['/app/api/boot', { headers: cookie }],
    ['/app/api/create', { method: 'POST', headers: { ...cookie, origin: ORIGIN, 'content-type': 'application/json' }, body: '{}' }],
    ['/app/api/vault/deposit', { method: 'POST', headers: { authorization: `Bearer ${STUDIO}.grant`, 'content-type': 'application/json' }, body: '{}' }],
    ['/app/api/vault/open', { method: 'POST', headers: { authorization: `Bearer ${STUDIO}.grant` }, body: '{}' }],
    ['/app/api/keys/put', { method: 'POST', headers: { ...cookie, origin: ORIGIN }, body: '{}' }],
    ['/app/api', { headers: cookie }],
  ];
  /* EVERY ANSWER IS COLLECTED BEFORE ANY IS COMPARED, so a failure names all the paths that were served and not the first. */
  const answered: string[] = [];
  for (const [path, init] of asks) {
    const out = await ask(path, init);
    const text = await out.text();
    const code = /"code":"([A-Z_]+)"/.exec(text)?.[1] ?? out.headers.get('location') ?? '-';
    answered.push(`${init.method ?? 'GET'} ${path} ${out.status} ${code}`);
  }
  /* A GET IS THE OLD ADDRESS'S 308 TO THE ROOT'S OWN DOOR, and the 308 itself reaches no record; a write is refused. */
  assert.deepEqual(
    answered,
    asks.map(([path, init]) => (init.method === 'POST' ? `POST ${path} 404 ROUTE_UNKNOWN` : `GET ${path} 308 ${ORIGIN}${path.slice(4)}`)),
  );
  assert.deepEqual(addressed, [], 'a record was addressed for a path that names none');
  assert.deepEqual(reached, []);
});
