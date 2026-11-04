/**
 * The live look cannot press, cannot leave the record's reads, cannot run under CI, and sends the token and nothing
 * else (PRF-A02's guard).
 *
 * A HOST OF ITS OWN ON LOOPBACK stands in for brain.dog, and counts what reaches it, so "refused" means "never left"
 * and not merely "answered 403". The sign-in file is a folder of this test's, named through `XDG_CONFIG_HOME` in the
 * `env` handed to `open`, so the machine's own sign-in is never read.
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

import { ROUTES } from '../../../packages/host/src/index.ts';
import { LOOKS, outFor, ROOT, serve } from '../run.mjs';
import { READING, allowed, open } from '../sources/live.mjs';

const TOKEN = 'rec_01J8Z3N4W5X6Y7Z8A9B0C1D2E3.not-a-real-secret-but-a-long-one';
const heard = [];
let host;
let dir;
let env;
let look;
let source;

before(async () => {
  host = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      heard.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') });
      res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': 'rec=handed-back; Path=/' });
      res.end(JSON.stringify({ ok: true, value: { registers: [{ id: 'tasks' }] } }));
    });
  });
  await new Promise((r) => host.listen(0, '127.0.0.1', r));
  dir = mkdtempSync(join(tmpdir(), 'look-live-'));
  mkdirSync(join(dir, 'braindog'));
  const key = `http://127.0.0.1:${host.address().port}/acme`;
  writeFileSync(join(dir, 'braindog', 'hosts.json'), JSON.stringify({ default: key, hosts: { [key]: { token: { value: TOKEN, expires: '2999-01-01T00:00:00Z', label: 'test' } } } }));
  env = { XDG_CONFIG_HOME: dir };
  source = await open('acme', { env });
  look = await serve(source, { build: dir });
});

after(async () => {
  await look?.close();
  await new Promise((r) => host.close(r));
  rmSync(dir, { recursive: true, force: true });
});

const ask = (path, init = {}) => fetch(`${look.origin}${path}`, init).then(async (r) => ({ status: r.status, text: await r.text(), cookie: r.headers.get('set-cookie') }));

test('every route the table marks as a write is refused before it leaves', async () => {
  const before = heard.length;
  const writes = ROUTES.filter((r) => r.writes && !r.postRead);
  assert.ok(writes.length > 0);
  for (const r of writes) {
    const said = await ask(`/api/${r.name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(said.status, 403, r.name);
    assert.match(said.text, /reads and never writes/u, r.name);
    const got = await ask(`/acme/api/${r.name}`);
    assert.equal(got.status, 403, `${r.name} as a GET under the slug`);
  }
  assert.equal(heard.length, before, 'no write reached the host');
  assert.ok(source.counts().writes >= writes.length * 2);
});

test('a read outside the reading groups, and a path outside the record\'s reads, is refused', async () => {
  const before = heard.length;
  for (const r of ROUTES.filter((x) => !x.writes && !['DATA', 'READ+'].includes(x.group))) assert.equal((await ask(`/api/${r.name}`)).status, 403, r.name);
  for (const path of ['/account/usage', '/account/billing', '/auth/methods', '/mcp', '/in/mail', '/api/slash/status', '/api/snapshots/one', '/api/nothing', '/api/boot/again', '/api/%2e%2e/account/usage']) {
    const said = await ask(path);
    assert.equal(said.status, 403, path);
  }
  assert.match((await ask('/account/usage')).text, /cannot be drawn by the live look/u);
  assert.equal(heard.length, before, 'nothing outside reached the host');
});

test('no write gets through by another spelling of its address, or by a verb or override header on a read', async () => {
  const before = heard.length;
  const writes = ROUTES.filter((r) => r.writes && !r.postRead).map((r) => r.name);
  const spellings = (w) => [
    `/api/${w}/`,
    `/api//${w}`,
    `/API/${w}`,
    `/api/${w[0].toUpperCase()}${w.slice(1)}`,
    `/api/%${w.charCodeAt(0).toString(16)}${w.slice(1)}`,
    `/api/boot%2F..%2F${w}`,
    `/api/boot%2f${w}`,
    `/acme/api/boot/..%2F${w}`,
    `/acme/api%2F${w}`,
    `/api/${w}%00`,
    `/api/${w};boot`,
    `/api/boot/../${w}`,
    `/api/%2e%2e/api/${w}`,
  ];
  for (const w of writes)
    for (const path of spellings(w)) {
      const said = await ask(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      assert.notEqual(said.status, 200, path);
    }
  assert.equal(heard.length, before, 'no spelling of a write reached the host');
  for (const method of ['PUT', 'PATCH', 'DELETE', 'OPTIONS']) assert.equal((await ask('/api/boot', { method })).status, 403, method);
  assert.equal(heard.length, before, 'no write verb on a read reached the host');
  /* An override header or a query that names another verb or method is not carried: the host names the method by
     the path alone, and the path that leaves is `/api/<a read>` and nothing else. */
  const overrides = { 'x-http-method-override': 'DELETE', 'x-http-method': 'DELETE', 'x-method-override': 'DELETE' };
  const said = await ask(`/api/boot?_method=DELETE&method=${writes[0]}`, { headers: overrides });
  assert.equal(said.status, 200);
  const [sent] = heard.slice(before);
  assert.equal(sent.method, 'GET');
  assert.equal(new URL(sent.url, 'http://x').pathname, '/api/boot');
  for (const h of Object.keys(overrides)) assert.equal(sent.headers[h], undefined, h);
});

test('it refuses to start under CI, and says what the live look cannot draw', async () => {
  await assert.rejects(open('acme', { env: { ...env, CI: 'true' } }), /refuses to start under CI.*\/account/su);
  await assert.rejects(open('nobody', { env }), /No sign-in for a record called nobody/u);
});

test('a read goes on with the token and nothing else, and its answer comes back without a cookie', async () => {
  assert.ok(allowed().has('boot'));
  heard.length = 0;
  const said = await ask('/acme/api/boot?x=1', { headers: { cookie: 'bd_session=mine', 'x-page': 'secret', origin: 'http://elsewhere' } });
  assert.equal(said.status, 200);
  assert.equal(said.cookie, null, 'no cookie from the host reaches the browser');
  assert.equal(heard.length, 1);
  const [sent] = heard;
  assert.equal(sent.url, '/api/boot?x=1');
  assert.equal(sent.headers.authorization, `Bearer ${TOKEN}`);
  assert.equal(sent.headers.cookie, undefined);
  assert.equal(sent.headers['x-page'], undefined);
  assert.equal(sent.headers.origin, undefined);
  const posted = await ask('/api/list', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"register":"tasks"}' });
  assert.equal(posted.status, 200);
  assert.equal(heard[1].body, '{"register":"tasks"}');
});

test('the store catalogue is read as anybody reads it: a GET under /api/kennel/v1/, with no token and nothing of the page', async () => {
  heard.length = 0;
  const said = await ask('/acme/api/kennel/v1/index.json', { headers: { cookie: 'bd_session=mine', 'x-page': 'secret' } });
  assert.equal(said.status, 200);
  assert.equal(said.cookie, null);
  assert.equal(heard.length, 1);
  const [sent] = heard;
  assert.equal(sent.url, '/api/kennel/v1/index.json');
  assert.equal(sent.method, 'GET');
  assert.equal(sent.headers.authorization, undefined, 'the token went to the public store');
  assert.equal(sent.headers.cookie, undefined);
  assert.equal(sent.headers['x-page'], undefined);
  await ask('/api/kennel/v1/packs/glaze-book/1.2.0.pack.json');
  assert.equal(heard[1].url, '/api/kennel/v1/packs/glaze-book/1.2.0.pack.json');
  /* NOTHING ELSE UNDER IT, AND NO OTHER VERB. */
  const before = heard.length;
  for (const path of ['/api/kennel/v1/../boot', '/api/kennel/v1/%2e%2e/create', '/api/kennel/v2/index.json', '/api/kennel/v1/a?b=../c', '/api/kennel/v1/'])
    assert.equal((await ask(path)).status, 403, path);
  assert.equal((await ask('/api/kennel/v1/index.json', { method: 'POST', body: '{}' })).status, 403);
  assert.equal(heard.length, before, 'something outside the catalogue reached the host');
});

test('the token is in no answer and no count', async () => {
  const outputs = [JSON.stringify(source.counts()), JSON.stringify(source.cannot), source.record, source.prefix];
  for (const path of ['/api/create', '/account/usage', '/api/listTokens']) outputs.push((await ask(path)).text);
  for (const text of outputs) assert.ok(!text.includes(TOKEN) && !text.includes('not-a-real-secret'), text);
});

test('a live look writes only under loop/proof/looks', () => {
  assert.ok(outFor(source, undefined).startsWith(join(ROOT, LOOKS)));
  assert.throws(() => outFor(source, join(tmpdir(), 'elsewhere')), /writes only under loop\/proof\/looks/u);
});

test('a read sent as a POST goes on, and the write-marked routes that are reads are the only ones that do', () => {
  const posts = ROUTES.filter((r) => r.writes && r.postRead && READING.has(r.group)).map((r) => r.name);
  /* `reads` IS SEVERAL READS IN ONE POST (scope 2026-10-24 A6), and the host refuses any write inside it, so it goes on. */
  /* `today` IS TODAY'S TILES IN ONE READ (scope 2026-10-24 A12), each part asked as its own method would be, so it goes on. */
  /* `checkAutomation` AND `automationSentence` KEEP NOTHING: an automation's page checks
     its body, and the look blocked that three times as a write. */
  /* `addonCheck` PLANS A PLUGIN FILE AGAINST THE RECORD AND KEEPS NOTHING (`routes/addons.ts`, f4d6a2faa): a whole file is no query string. */
  assert.deepEqual(posts.sort(), ['addonCheck', 'automationSentence', 'checkAutomation', 'previewPage', 'reads', 'today']);
  assert.ok(allowed().has('checkAutomation'));
  assert.ok(allowed().has('previewPage'));
  assert.ok(allowed().has('reads'));
  assert.ok(allowed().has('today'));
  /* THE SHARE SHEET'S PREVIEW IS A READ SENT AS A POST TOO, so See as may ask it, and it is ADMIN, so it never goes on. */
  assert.ok(ROUTES.some((r) => r.name === 'sharePreview' && r.postRead));
  assert.ok(!allowed().has('sharePreview'));
});
