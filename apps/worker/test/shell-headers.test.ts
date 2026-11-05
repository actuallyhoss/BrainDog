/**
 * Every page of the app says it may not be framed, may not be sniffed, and sends no referrer off the site.
 *
 * MEASURED ON PRODUCTION BEFORE THIS: NOT ONE OF THEM ON ANY ANSWER. `/app/`, `/app/signin`, `/app/acme/` (the app was
 * under `/app` then) and every other page of `app.brain.dog` came back with a `Cache-Control` and a content type and
 * nothing that says who may frame it. A full `script-src` needs the shell's inline scripts hashed through `kit.csp`, which
 * the build does, and HSTS was a zone setting nobody had turned on (measured 5 Nov), so it is a header now, for this host alone.
 *
 * THE WORKER SETS THEM, BECAUSE IT IS THE ONLY PLACE CERTAIN TO REACH THE PAGE. `apps/web/static/_headers` is read by
 * the static assets, and whether its rules survive a response fetched through the `ASSETS` binding and handed back by
 * this Worker was not measured. What `appPage` returns is, so this runs the bundle (`bundled-worker.ts`) and asks it.
 *
 * AND ONLY THE PAGES. `/api`, `/mcp` and `/in/*` answer an agent, a CLI or a bank's webhook sender, none of which draws
 * a frame or follows a referrer, and a header there is noise every reader of those answers has to skip.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bundled } from './bundled-worker.ts';
import { asPage } from '../src/route.ts';

const ORIGIN = 'https://brain.example.test';

const PAGE = {
  'content-security-policy': "frame-ancestors 'none'",
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'strict-transport-security': 'max-age=31536000',
  'cross-origin-opener-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=(), midi=()',
} as const;

/**
 * A response whose headers cannot be changed, which is what the Workers runtime hands back from a binding's `fetch`.
 *
 * THE PLATFORM REFUSES `headers.set` ON SUCH A RESPONSE WITH "Can't modify immutable headers", which is the documented
 * behaviour of every response a Worker receives rather than builds, and Node's `Response` has no such guard. Without
 * this double a wrapper that set the headers in place would pass here and throw on every page in production.
 */
function immutable(out: Response): Response {
  for (const verb of ['set', 'append', 'delete'])
    Object.defineProperty(out.headers, verb, { value: () => { throw new TypeError("Can't modify immutable headers."); } });
  return out;
}

async function world() {
  const { default: worker } = await bundled();
  const ASSETS = {
    fetch: async (request: Request) => {
      const path = new URL(request.url).pathname;
      if (path === '/') return immutable(new Response('<!doctype html><title>BrainDog</title>', { headers: { 'content-type': 'text/html' } }));
      if (path === '/fonts/geist.woff2') return immutable(new Response(new Uint8Array([119, 79, 70, 50]), { headers: { 'content-type': 'font/woff2' } }));
      return immutable(new Response(null, { status: 404 }));
    },
  };
  /* NO SESSION IS EVER SENT, so the Directory is a double that nothing here should reach. Being asked is a failure. */
  const asked: string[] = [];
  const directory = new Proxy({}, { get: (_, name) => async () => (asked.push(String(name)), null) });
  const env = {
    PUBLIC_HOST: 'brain.example.test',
    SESSION_SECRET: 'fake-session-secret-for-tests-only-0123456789',
    ASSETS,
    DIRECTORY: { idFromName: (n: string) => n, get: () => directory },
    RECORD: { idFromName: (n: string) => n, get: () => ({ fetch: async () => new Response('{}') }) },
  };
  const ask = (path: string, init: RequestInit = {}) => worker.fetch(new Request(`${ORIGIN}${path}`, init), env, { waitUntil: () => {} });
  return { ask, asked };
}

/* `PAGE`'s policy is `frame-ancestors 'none'` alone because the shell here carries no meta policy of its own, and a
   page is told only what a meta tag cannot say (`pagePolicy`). A file beside the pages is told this instead. */
const FILE_POLICY = "default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

const pageHeaders = (out: Response) => Object.fromEntries(Object.keys(PAGE).map((name) => [name, out.headers.get(name)]));

test('THE SHELL AND THE SIGN-IN PAGE CARRY ALL FOUR, and so does a page under a slug and a file beside the pages', async () => {
  const { ask } = await world();
  for (const path of ['/', '/signin', '/acme/r/tasks', '/settings/agents']) {
    const out = await ask(path, { headers: { accept: 'text/html' } });
    assert.equal(out.status, 200, path);
    assert.deepEqual(pageHeaders(out), PAGE, path);
    /* THE SHELL IS STILL THE SHELL: the wrap changes the headers and nothing the browser draws. */
    assert.equal(out.headers.get('content-type'), 'text/html', path);
    assert.equal(await out.text(), '<!doctype html><title>BrainDog</title>', path);
  }
  /* THE FONTS ARE SERVED THROUGH `appPage` TOO, and `nosniff` only blocks a script or a style whose type is wrong
     (the Fetch standard's "should response to request be blocked due to nosniff"), so a `font/woff2` is untouched. */
  const font = await ask('/fonts/geist.woff2');
  assert.equal(font.status, 200);
  assert.equal(font.headers.get('content-type'), 'font/woff2');
  assert.deepEqual([...new Uint8Array(await font.arrayBuffer())], [119, 79, 70, 50]);
  /* A FILE BESIDE THE PAGES GETS THE STRICT POLICY: nothing inline runs in a font, a script or an image. */
  assert.deepEqual(pageHeaders(font), { ...PAGE, 'content-security-policy': FILE_POLICY });
  /* A HEAD IS ANSWERED WITH THE SAME HEADERS AND NO BODY. */
  const head = await ask('/signin', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.deepEqual(pageHeaders(head), PAGE);
  /* AND THE OLD ADDRESS IS NO PAGE AT ALL: one 308 to the same page at the root, query kept, and the shell never drawn. */
  const old = await ask('/app/signin?next=%2Facme', { headers: { accept: 'text/html' } });
  assert.equal(old.status, 308);
  assert.equal(old.headers.get('location'), `${ORIGIN}/signin?next=%2Facme`);
});

test('/api, /mcp AND /in/* CARRY NONE OF THE FRAMING HEADERS, because nothing that reads them draws a page', async () => {
  const { ask } = await world();
  const answers: string[] = [];
  for (const [path, init] of [
    ['/api/boot', {}],
    ['/mcp', { headers: { accept: 'text/html' } }],
    ['/in/anything', { method: 'POST', body: '{}' }],
  ] as const) {
    const out = await ask(path, init);
    answers.push(`${path} ${out.status} ${out.headers.get('x-frame-options')} ${out.headers.get('content-security-policy')} ${out.headers.get('referrer-policy')}`);
  }
  /* THE STATUSES ARE PRODUCTION'S OWN, so a pass is the real door answering and not a crash. */
  assert.deepEqual(answers, ['/api/boot 401 null null null', '/mcp 405 null null null', '/in/anything 404 null null null']);
});

/* A MISTYPED SLUG, THROUGH `route()`. Measured on production: `/app/Acme/api/boot`,
   `/app/admin/api/boot` and `/app/www/api/boot` were `200 text/html`, the 8074-byte shell, so a JSON client with a
   mistyped slug read a page as success. `app-path.test.ts` holds the rule; this holds what the Worker answers with it. */
test('AN API PATH UNDER A WORD THAT IS NOT A NAME IS THE ROUTER’S 404 JSON, and a page whose second segment is `api` is still a page', async () => {
  const { ask, asked } = await world();
  const answers: string[] = [];
  for (const path of ['/Acme/api/boot', '/admin/api/boot', '/www/api/boot', '/ACME/api', '/r/api', '/settings/api/boot']) {
    const out = await ask(path);
    const text = await out.text();
    answers.push(`${path} ${out.status} ${/"code":"([A-Z_]+)"/.exec(text)?.[1] ?? out.headers.get('content-type')}`);
  }
  assert.deepEqual(answers, [
    '/Acme/api/boot 404 ROUTE_UNKNOWN',
    '/admin/api/boot 404 ROUTE_UNKNOWN',
    '/www/api/boot 404 ROUTE_UNKNOWN',
    '/ACME/api 404 ROUTE_UNKNOWN',
    /* `r/[register]` AND `settings/[area]` ARE PAGES, so a register called `api` and an area called `api` are the shell. */
    '/r/api 200 text/html',
    '/settings/api/boot 200 text/html',
  ]);
  assert.deepEqual(asked, [], 'the Directory was asked about a path that names no record');
});

/* THE HEADER IS THE PAGE'S OWN META POLICY, so the hashes in it are the build's own: a header `script-src`
   that lacked them would refuse the shell's inline scripts and draw an empty screen (`apps/site/test/one-origin.test.mjs`
   measured exactly that on the site). Turnstile stays on `/signup` and `/signin` alone. */
test('A PAGE IS SENT THE POLICY IN ITS OWN META WITH FRAME-ANCESTORS, AND TURNSTILE ONLY ON /signup AND /signin', async () => {
  const meta = "default-src 'self'; script-src 'self' 'sha256-abc=' https://challenges.cloudflare.com; style-src-attr 'unsafe-inline'; frame-src https://www.loom.com https://challenges.cloudflare.com";
  const shell = `<!doctype html><head><meta http-equiv="content-security-policy" content="${meta}"></head>`;
  const answer = (body: string | null) => immutable(new Response(body, { headers: { 'content-type': 'text/html' } }));
  const policy = async (path: string | undefined, body: string | null = shell) => (await asPage(answer(body), path)).headers.get('content-security-policy');

  assert.equal(await policy('/signup'), `${meta}; frame-ancestors 'none'`);
  assert.equal(await policy('/signin'), `${meta}; frame-ancestors 'none'`);
  assert.equal(await policy(undefined), `${meta}; frame-ancestors 'none'`, 'an answer with no address keeps the page policy whole');
  const narrowed = "default-src 'self'; script-src 'self' 'sha256-abc='; style-src-attr 'unsafe-inline'; frame-src https://www.loom.com; frame-ancestors 'none'";
  for (const path of ['/', '/acme/r/tasks', '/signup/extra', '/app/signin']) assert.equal(await policy(path), narrowed, path);

  /* A HEAD OR A 304 HAS NO BODY TO READ, and a policy without the hashes would blank the page a browser kept. */
  assert.equal(await policy('/signin', null), "frame-ancestors 'none'");
  /* THE PAGE IS SENT UNCHANGED. */
  assert.equal(await (await asPage(answer(shell), '/')).text(), shell);
});
