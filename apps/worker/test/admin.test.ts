/**
 * admin.brain.dog (`src/admin.ts`): which name is the admin host, what each path answers, the five
 * headers on every answer, and what the page and its script may and may not do with the operator key.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ADMIN_HEADERS, isAdminHost, serveAdmin } from '../src/admin.ts';
import { ADMIN_CSS, ADMIN_HTML, ADMIN_JS } from '../src/admin-page.ts';

const HOST = 'brain.dog';
const at = (path: string, method = 'GET', host = `admin.${HOST}`): Request => new Request(`https://${host}${path}`, { method });

const CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const served = (request: Request): Response => {
  const out = serveAdmin(request);
  assert.ok(out !== null, `${request.method} ${request.url} answered null`);
  return out;
};

test('the admin host is exactly admin. and PUBLIC_HOST, case-blind, any port', () => {
  assert.equal(isAdminHost(at('/'), HOST), true);
  assert.equal(isAdminHost(at('/', 'GET', 'ADMIN.Brain.Dog'), HOST), true);
  assert.equal(isAdminHost(at('/', 'GET', 'admin.brain.dog:8443'), HOST), true);
  assert.equal(isAdminHost(at('/'), ' Brain.Dog '), true);
  for (const host of ['brain.dog', 'app.brain.dog', 'admin.brain.dog.evil.test', 'xadmin.brain.dog', 'admin.alpha.brain.dog', 'admin.brain.dog.'])
    assert.equal(isAdminHost(at('/', 'GET', host), HOST), false, host);
  assert.equal(isAdminHost(at('/'), ''), false, 'empty PUBLIC_HOST');
  assert.equal(isAdminHost(at('/'), undefined), false, 'no PUBLIC_HOST');
  assert.equal(isAdminHost(at('/', 'GET', 'admin.alpha.brain.dog'), 'alpha.brain.dog'), true);
});

test('the three files are served with their types', () => {
  const page = served(at('/'));
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('content-type'), 'text/html; charset=utf-8');
  const script = served(at('/admin.js'));
  assert.equal(script.headers.get('content-type'), 'text/javascript; charset=utf-8');
  const style = served(at('/admin.css'));
  assert.equal(style.headers.get('content-type'), 'text/css; charset=utf-8');
});

test('every answer carries the five headers exactly, the 404 and 405 included', async () => {
  assert.deepEqual(ADMIN_HEADERS, {
    'content-security-policy': CSP,
    'cache-control': 'no-store',
    'x-robots-tag': 'noindex, nofollow',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
  });
  const requests = [at('/'), at('/admin.js'), at('/admin.css'), at('/'), at('/nope'), at('/api/boot'), at('/app/'), at('/', 'POST'), at('/admin.js', 'DELETE'), at('/', 'HEAD'), at('/nope', 'HEAD')];
  for (const request of requests) {
    const out = served(request);
    for (const [name, value] of Object.entries(ADMIN_HEADERS)) assert.equal(out.headers.get(name), value, `${request.method} ${new URL(request.url).pathname}: ${name}`);
    assert.equal(out.headers.get('set-cookie'), null);
  }
});

test('HEAD answers as GET with no body, any other method is 405', async () => {
  const head = served(at('/', 'HEAD'));
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(await head.text(), '');
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    const out = served(at('/', method));
    assert.equal(out.status, 405, method);
    assert.equal(out.headers.get('allow'), 'GET, HEAD');
  }
});

test('the operator doors are the router\'s, any method, and an unknown path is a plain 404', async () => {
  for (const path of ['/account/ops/applications', '/account/ops/invite', '/account/ops/funnel', '/account/ops', '//account//ops/invite/'])
    for (const method of ['GET', 'POST']) assert.equal(serveAdmin(at(path, method)), null, `${method} ${path}`);
  for (const path of ['/nope', '/account', '/account/opsx', '/api/boot', '/mcp', '/app/', '/index.html', '/admin.js.map']) {
    const out = served(at(path));
    assert.equal(out.status, 404, path);
    assert.equal(out.headers.get('content-type'), 'text/plain; charset=utf-8');
    assert.equal(await out.text(), 'Not found.');
  }
});

test('the page has no inline script or style and loads only /admin.js and /admin.css', () => {
  const scripts = [...ADMIN_HTML.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.length, 1);
  assert.match(scripts[0]![1]!, /\bsrc="\/admin\.js"/);
  assert.equal(scripts[0]![2]!.trim(), '', 'a script body is inline script');
  assert.doesNotMatch(ADMIN_HTML, /<style\b/i);
  assert.doesNotMatch(ADMIN_HTML, /\sstyle=/i);
  assert.doesNotMatch(ADMIN_HTML, /\son[a-z]+=/i, 'an inline handler is inline script');
  const loads = [...ADMIN_HTML.matchAll(/\b(?:src|href)="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(loads.sort(), ['/admin.css', '/admin.js']);
  assert.match(ADMIN_HTML, /<title>BrainDog admin<\/title>/);
  assert.equal((ADMIN_HTML.match(/<h1\b/g) ?? []).length, 1);
  assert.match(ADMIN_HTML, /<input id="key-field"[^>]*type="password"[^>]*autocomplete="off"/);
});

test('the script keeps the key in sessionStorage only and sends it only as Authorization', () => {
  assert.doesNotMatch(ADMIN_JS, /localStorage/);
  assert.doesNotMatch(ADMIN_JS, /\?key/i);
  assert.doesNotMatch(ADMIN_JS, /console\./);
  assert.doesNotMatch(ADMIN_JS, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/, 'a stranger\'s words go in as text');
  assert.doesNotMatch(ADMIN_JS, /https?:\/\/(?!')/, 'no address but the page\'s own');
  assert.equal((ADMIN_JS.match(/Bearer /g) ?? []).length, 1);
  assert.match(ADMIN_JS, /Authorization: 'Bearer ' \+ keyOf\(\)/);
  /* keyOf() is read in the one header and in the checks that a key is kept, and in no URL or body. */
  for (const line of ADMIN_JS.split('\n').filter((l) => l.includes('keyOf()'))) assert.doesNotMatch(line, /fetch\(|JSON\.stringify|\.href|location/, line.trim());
  assert.match(ADMIN_JS, /sessionStorage\.setItem/);
  assert.match(ADMIN_JS, /sessionStorage\.removeItem/);
  assert.match(ADMIN_JS, /credentials: 'omit'/);
});

test('the script calls the operator doors and says the owner\'s sentences', () => {
  for (const said of [
    "That key is not this BrainDog's operator key.",
    'Invited, the link is mailed.',
    "'/account/ops/applications'",
    "{ invite: item.id }",
    "{ decline: item.id }",
    "{ email: email }",
    "asked.note = note",
    "{ end: item.ref }",
    'window.confirm(',
  ])
    assert.ok(ADMIN_JS.includes(said), said);
  for (const words of ['Applications', 'Invite someone', 'Invites', 'Forget the key']) assert.ok(ADMIN_HTML.includes(words), words);
});

test('the Funnel section reads the funnel door and draws its eight weeks as text, a step to a column', () => {
  assert.match(ADMIN_HTML, /<section class="tile wide" id="funnel" aria-labelledby="funnel-title">/);
  for (const words of ['Funnel', 'Week of', 'Visits', 'Applied', 'Invites used', 'Signed up', 'First agent', 'First brief']) assert.ok(ADMIN_HTML.includes(words), words);
  assert.ok(ADMIN_JS.includes("ask('/account/ops/funnel')"));
  /* THE DIRECTORY'S NAMES FOR ITS STEPS, and the record's two, in the order the columns are drawn. */
  assert.ok(ADMIN_JS.includes("var STEPS = ['seen', 'applied', 'invites_used', 'signed_up', 'agent', 'brief'];"));
  assert.match(ADMIN_HTML, /<div class="scroll" id="funnel-scroll" tabindex="0" role="region"/, 'a wide table scrolls inside its tile, never the page');
  assert.match(ADMIN_CSS, /\.scroll \{ overflow-x: auto;/);
});

test('no em dash and none of the words a person never reads, in any of the three', () => {
  for (const [name, body] of Object.entries({ ADMIN_HTML, ADMIN_CSS, ADMIN_JS })) {
    assert.doesNotMatch(body, /—/, `${name}: an em dash`);
    const words = name === 'ADMIN_CSS' ? '' : body.replace(/<[^>]+>/g, ' ');
    assert.doesNotMatch(words, /\b(row|rows|list item|entity|credential|schema|slug)\b/i, name);
  }
});

test('the style is Look B in light and dark and draws nothing from elsewhere', () => {
  /* RED WORDS AND RED FILLS ARE TWO TOKENS: #C2362F words, #CF413A a filled button. */
  assert.match(ADMIN_CSS, /--red: #C2362F/);
  assert.match(ADMIN_CSS, /--red-fill: #CF413A/);
  assert.match(ADMIN_CSS, /@media \(prefers-color-scheme: dark\)/);
  assert.match(ADMIN_CSS, /"Lexend"/);
  assert.doesNotMatch(ADMIN_CSS, /url\(|@import|gradient|box-shadow|backdrop-filter/);
});

test('the add-on queue reads and decides through the Kennel review door, which the router answers', () => {
  for (const method of ['GET', 'POST']) assert.equal(serveAdmin(at('/api/kennel/v1/review', method)), null, method);
  assert.equal(served(at('/api/kennel/v1/index.json')).status, 404, 'only the review door is passed on');
  assert.match(ADMIN_HTML, /<section class="tile wide" id="addons" aria-labelledby="addons-title">/);
  for (const words of ['Plugins waiting for review', 'Approve', 'Decline', 'verdict: verdict', "'/api/kennel/v1/review'", 'Say why in a line']) assert.ok(ADMIN_HTML.includes(words) || ADMIN_JS.includes(words), words);
});
