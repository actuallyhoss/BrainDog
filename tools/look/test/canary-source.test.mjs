/**
 * The canary look reads through the session its sign-in left, sends it to the canary and nowhere else, cannot press,
 * and will not start without one (PRF-A09 job 4).
 *
 * A HOST OF ITS OWN ON LOOPBACK stands in for brain.dog and counts what reaches it, so "refused" means "never left".
 * The session is a file of this test's, named through `CANARY_SESSION` in the `env` handed to `open`.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

import { ROUTES } from '../../../packages/host/src/index.ts';
import { serve } from '../run.mjs';
import { NO_SESSION, open, SET, WIDTHS } from '../sources/canary.mjs';

const SESSION = 'bd_s=the-canary-session';
const heard = [];
let host;
let dir;
let origin;
let env;
let source;
let look;

const session = (cookies) => {
  const file = join(dir, `session-${heard.length}-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(file, JSON.stringify({ cookies, origins: [] }));
  return file;
};

before(async () => {
  host = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      heard.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') });
      res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': 'bd_s=handed-back; Path=/' });
      res.end(JSON.stringify({ ok: true, value: { registers: [{ id: 'tasks' }] } }));
    });
  });
  await new Promise((r) => host.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${host.address().port}`;
  dir = mkdtempSync(join(tmpdir(), 'look-canary-'));
  const file = session([
    { name: 'bd_s', value: 'the-canary-session', domain: '127.0.0.1', path: '/', expires: -1 },
    { name: 'elsewhere', value: 'not-for-the-canary', domain: 'example.com', path: '/', expires: -1 },
  ]);
  env = { SMOKE_SLUG: 'ops', CANARY_ORIGIN: origin, CANARY_SESSION: file };
  source = await open(undefined, { env });
  look = await serve(source, { build: dir });
});

after(async () => {
  await look?.close();
  await source?.close();
  await new Promise((r) => host.close(r));
  rmSync(dir, { recursive: true, force: true });
});

const ask = (path, init = {}) => fetch(`${look.origin}${path}`, init).then(async (r) => ({ status: r.status, text: await r.text(), cookie: r.headers.get('set-cookie') }));

test('with no session it refuses to start, in one sentence', async () => {
  const refused = async (e) => {
    await assert.rejects(open(undefined, { env: e }), (err) => err.message === NO_SESSION);
  };
  await refused({ SMOKE_SLUG: 'ops', CANARY_ORIGIN: origin });
  await refused({ SMOKE_SLUG: 'ops', CANARY_ORIGIN: origin, CANARY_SESSION: join(dir, 'never-written.json') });
  await refused({ SMOKE_SLUG: 'ops', CANARY_ORIGIN: origin, CANARY_SESSION: session([{ name: 'bd_s', value: 'x', domain: 'example.com', path: '/' }]) });
  await refused({ SMOKE_SLUG: 'ops', CANARY_ORIGIN: origin, CANARY_SESSION: session([{ name: 'bd_s', value: 'x', domain: '127.0.0.1', path: '/', expires: 1 }]) });
  assert.equal(NO_SESSION.split(/[.!?](?:\s|$)/u).filter((s) => s.trim() !== '').length, 1, 'one sentence');
  await assert.rejects(open(undefined, { env: { CANARY_SESSION: env.CANARY_SESSION } }), /Name the canary/u);
});

test('a read goes to the canary under its name, with the session and the Origin it checks, and nothing comes back', async () => {
  const before = heard.length;
  const said = await ask('/app/ops/api/boot');
  assert.equal(said.status, 200);
  assert.equal(said.cookie, null, 'no cookie is handed back to the look');
  const got = heard.at(-1);
  assert.equal(heard.length, before + 1);
  assert.equal(got.url, '/app/ops/api/boot');
  assert.equal(got.headers.cookie, SESSION, 'the canary’s cookie alone, never one for another host');
  assert.equal(got.headers.origin, origin);
  assert.equal(got.headers.authorization, undefined, 'a session, never a key');
  for (const path of ['/auth/session', '/auth/passkeys', '/account/usage']) assert.equal((await ask(path)).status, 200, path);
  assert.deepEqual(heard.slice(-3).map((h) => h.url), ['/auth/session', '/auth/passkeys', '/account/usage']);
});

test('every write, sign-out included, is refused before it leaves', async () => {
  const before = heard.length;
  const writes = ROUTES.filter((r) => r.writes);
  assert.ok(writes.length > 0);
  for (const r of writes) {
    const said = await ask(`/app/ops/api/${r.name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(said.status, 403, r.name);
    assert.match(said.text, /reads and never writes/u, r.name);
  }
  for (const path of ['/auth/logout', '/auth/logout/all', '/auth/passkey/remove', '/account/delete'])
    assert.equal((await ask(path, { method: 'POST', body: '{}' })).status, 403, path);
  for (const method of ['PUT', 'PATCH', 'DELETE']) assert.equal((await ask('/api/boot', { method })).status, 403, method);
  for (const path of ['/mcp', '/in/mail', '/api/nothing']) assert.equal((await ask(path)).status, 403, path);
  assert.equal(heard.length, before, 'nothing that writes reached the canary');
  const counts = source.counts();
  assert.ok(counts.writes >= writes.length + 4);
  assert.ok(counts.outside >= 3);
});

test('it draws all at 390 and 1512, and never counts as seen', () => {
  assert.deepEqual(WIDTHS, [390, 1512]);
  assert.deepEqual(source.widths, [390, 1512]);
  assert.equal(SET, 'all');
  assert.equal(source.seen, false);
  assert.equal(source.pressable, false);
  assert.equal(source.prefix, '/ops');
  assert.match(source.record, /ops/u);
});

test('canary:self-host signs a fresh self-host in by its own key and draws the same way', async () => {
  const own = await open('self-host');
  const served = await serve(own, { build: dir });
  try {
    const said = await fetch(`${served.origin}/api/boot`).then(async (r) => ({ status: r.status, body: await r.json() }));
    assert.equal(said.status, 200);
    assert.equal(said.body.ok, true);
    assert.equal((await fetch(`${served.origin}/auth/logout`, { method: 'POST' })).status, 403, 'it cannot sign itself out either');
  } finally {
    await served.close();
    await own.close();
  }
});
