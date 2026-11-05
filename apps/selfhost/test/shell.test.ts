/**
 * The app as the self-host serves it: the file when there is one, the app when there is not, and nothing
 * outside the build whatever the path says.
 *
 * THE BUILD IS LAID OUT AS `apps/web` WRITES IT WITH NO BASE: every file at the top of `build/`, so the app is `/…`
 * and its scripts are `/_app/…`. The app was under `/app` until 29 Oct, and every address there is a 308 to the root.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { shellOf } from '../src/shell.ts';

const INDEX = '<!doctype html><title>BrainDog</title>';
const FONT = 'not really a font';

function build() {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-shell-'));
  const root = join(dir, 'build');
  const app = root;
  mkdirSync(join(app, '_app', 'immutable'), { recursive: true });
  mkdirSync(join(app, 'fonts'), { recursive: true });
  writeFileSync(join(app, 'index.html'), INDEX);
  writeFileSync(join(app, '_app', 'immutable', 'entry.js'), 'export {};');
  writeFileSync(join(app, 'fonts', 'inter.woff2'), FONT);
  writeFileSync(join(dir, 'secret.txt'), 'outside the build');
  return { dir, root, app, clean: () => rmSync(dir, { recursive: true, force: true }) };
}

/* THE ORIGIN THIS HOST IS CONFIGURED AT, which is not the one the request arrived on: a redirect is built from this alone. */
const ORIGIN = 'https://studio.example';

const get = async (serve: (r: Request, origin: string) => Response, path: string, method = 'GET') => {
  const res = serve(new Request(`http://localhost:8080${path}`, { method }), ORIGIN);
  return { status: res.status, headers: res.headers, text: await res.text() };
};

test('EVERY SCREEN AT THE ROOT IS THE APP, AND IT CANNOT BE FRAMED', async () => {
  const b = build();
  try {
    const serve = shellOf(b.root);
    for (const path of ['/', '/signin', '/r/tasks', '/acme/r/tasks', '/settings/recovery', '/apple']) {
      const out = await get(serve, path);
      assert.equal(out.status, 200, path);
      assert.equal(out.text, INDEX, path);
      assert.equal(out.headers.get('content-type'), 'text/html; charset=utf-8');
      assert.equal(out.headers.get('content-security-policy'), "frame-ancestors 'none'");
      assert.equal(out.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(out.headers.get('cache-control'), 'no-cache');
    }
    const script = await get(serve, '/_app/immutable/entry.js');
    assert.equal(script.status, 200);
    assert.equal(script.headers.get('content-type'), 'text/javascript; charset=utf-8');
    assert.equal(script.headers.get('cache-control'), 'public, max-age=31536000, immutable');

    /* A missing script is a 404, not a page the browser then fails to run. */
    assert.equal((await get(serve, '/_app/immutable/missing.js')).status, 404);
    assert.equal((await get(serve, '/_app/missing.js')).status, 404);
    assert.equal((await get(serve, '/', 'POST')).status, 405);
    /* A word that is one of the host's doors is never the app: the shell's 200 there would look like a working door. */
    for (const path of ['/a/x', '/ws', '/oauth/nothing', '/.well-known/security.txt', '/api/nothing']) assert.equal((await get(serve, path)).status, 404, path);
  } finally {
    b.clean();
  }
});

test('EVERY PATH UNDER /app IS A 308 TO THE SAME PATH AT THE ROOT, WITH THE QUERY KEPT', async () => {
  /* `/app/signin?next=…` is where a bookmark or a mailed link from before the move points. A 308 and not a page: the
     app there would read `app` as an address that is nobody's. */
  const b = build();
  try {
    const serve = shellOf(b.root);
    for (const [path, to] of [
      ['/app', '/'],
      ['/app/', '/'],
      ['/app/signin?next=%2Fapp%2Fr%2Ftasks', '/signin?next=%2Fapp%2Fr%2Ftasks'],
      ['/app/acme/r/tasks', '/acme/r/tasks'],
      /* A page cached from before the move asks for its scripts here; they are at the root now. */
      ['/app/_app/immutable/entry.js', '/_app/immutable/entry.js'],
    ] as const) {
      const out = await get(serve, path);
      assert.equal(out.status, 308, path);
      assert.equal(out.headers.get('location'), `${ORIGIN}${to}`, path);
      assert.equal(out.headers.get('cache-control'), 'no-store', path);
      assert.equal(out.text, '', path);
    }
    /* A DOUBLED SLASH OR A BACKSLASH AFTER /app NEVER NAMES ANOTHER HOST. Less `/app`, `/app//evil.example/x` was the
       bare `//evil.example/x`, which a browser follows to evil.example; under this host's origin it is a path here. */
    for (const path of ['/app//evil.example/x', '/app/\\evil.example/x', '/app/%5Cevil.example/x', '/app///evil.example']) {
      const out = await get(serve, path);
      assert.equal(out.status, 308, path);
      const to = out.headers.get('location') ?? '';
      assert.ok(to.startsWith(`${ORIGIN}/`), `${path} -> ${to}`);
      assert.equal(new URL(to, 'https://elsewhere.example').origin, ORIGIN, `${path} -> ${to}`);
    }
    /* A redirect is for a navigation. Anything else is refused as it was. */
    assert.equal((await get(serve, '/app/', 'POST')).status, 405);
    /* And a door's word under the old prefix is no page there either. */
    assert.equal((await get(serve, '/app/api/boot')).status, 404);
  } finally {
    b.clean();
  }
});

test('/fonts/* IS SERVED FROM THE BUILD, because the shared tokens.css asks for it at the root', async () => {
  /* `packages/skin/tokens.css:51-70` names `url('/fonts/…')`, which is where the app is. */
  const b = build();
  try {
    const serve = shellOf(b.root);
    const font = await get(serve, '/fonts/inter.woff2');
    assert.equal(font.status, 200);
    assert.equal(font.text, FONT);
    assert.equal(font.headers.get('content-type'), 'font/woff2');
    assert.equal((await get(serve, '/app/fonts/inter.woff2')).headers.get('location'), `${ORIGIN}/fonts/inter.woff2`);
    /* A missing font is a 404, never the page. */
    const missing = await get(serve, '/fonts/missing.woff2');
    assert.equal(missing.status, 404);
    assert.equal(missing.text, '');
  } finally {
    b.clean();
  }
});

test('NOTHING OUTSIDE THE APP, by any spelling of the path or through a link inside it', async () => {
  const b = build();
  try {
    const serve = shellOf(b.root);
    for (const path of [
      '/..%2Fsecret.txt',
      '/..%2F..%2Fsecret.txt',
      '/%2e%2e/secret.txt',
      '/..%5Csecret.txt',
      '/_app/..%2F..%2F..%2Fsecret.txt',
      '/%2F..%2Fsecret.txt',
      '/app/..%2Fsecret.txt',
      '/fonts/..%2F..%2Fsecret.txt',
      '/fonts/..%2F..%2F..%2Fsecret.txt',
    ]) {
      const out = await get(serve, path);
      assert.ok(!out.text.includes('outside the'), `${path} reached a file outside the app`);
    }
    let linked = true;
    try {
      symlinkSync(join(b.dir, 'secret.txt'), join(b.app, 'link.txt'));
    } catch {
      /* Windows needs a privilege to make a link; the resolve check is the same code either way. */
      linked = false;
    }
    if (linked) assert.ok(!(await get(serve, '/link.txt')).text.includes('outside the build'), 'a link inside the build reached out of it');
  } finally {
    b.clean();
  }
});

test('THE BUILD DIRECTORY, OR THE app FOLDER AN OPERATOR NAMED WHILE THE APP WAS UNDER /app', async () => {
  /* BRAINDOG_SHELL named `build/app` while the build wrote there, and that folder may still hold the old build. Once the
     build directory holds the new one, it is served from there, and nothing above it is reachable from either. */
  const b = build();
  try {
    mkdirSync(join(b.root, 'app'), { recursive: true });
    writeFileSync(join(b.root, 'app', 'index.html'), 'the build from before the move');
    for (const dir of [b.root, join(b.root, 'app')]) {
      const serve = shellOf(dir);
      assert.equal((await get(serve, '/r/tasks')).text, INDEX, dir);
      assert.equal((await get(serve, '/_app/immutable/entry.js')).status, 200, dir);
      assert.ok(!(await get(serve, '/..%2Fsecret.txt')).text.includes('outside the'), dir);
    }
  } finally {
    b.clean();
  }
});

test('a directory that is not a build is refused at start, with a sentence', () => {
  const b = build();
  try {
    assert.throws(() => shellOf(join(b.dir, 'nothing-here')));
    rmSync(join(b.app, 'index.html'));
    assert.throws(() => shellOf(b.root), /has no index\.html, so it is not a built app/);
  } finally {
    b.clean();
  }
});

/* The page's own policy is the header's, so a hash in the shell's meta is a hash the header allows, and a
   header `script-src` without it would refuse the shell's inline scripts and draw nothing. Turnstile is taken out,
   because the self-host has no sign-up page to load it. */
test('A PAGE CARRIES THE POLICY IN ITS OWN META, LESS TURNSTILE AND WITH FRAME-ANCESTORS; A FILE GETS THE STRICT ONE', async () => {
  const b = build();
  try {
    const meta = "default-src 'self'; script-src 'self' 'sha256-abc=' https://challenges.cloudflare.com; frame-src https://www.loom.com https://challenges.cloudflare.com; object-src 'none'";
    writeFileSync(join(b.app, 'index.html'), `<!doctype html><head><meta http-equiv="content-security-policy" content="${meta}"></head>`);
    const serve = shellOf(b.root);
    const want = "default-src 'self'; script-src 'self' 'sha256-abc='; frame-src https://www.loom.com; object-src 'none'; frame-ancestors 'none'";
    for (const [path, method] of [['/', 'GET'], ['/signup', 'GET'], ['/r/tasks', 'HEAD']] as const)
      assert.equal((await get(serve, path, method)).headers.get('content-security-policy'), want, `${method} ${path}`);
    const script = await get(serve, '/_app/immutable/entry.js');
    assert.equal(script.headers.get('content-security-policy'), "default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  } finally {
    b.clean();
  }
});

test('A PAGE SAYS WHO MAY FRAME IT, WHAT IT SENDS AS A REFERRER, AND THAT IT ASKS FOR NO CAMERA, as the Worker\'s do; and no HSTS, which is whoever runs it to say', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bd-shell-headers-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>x</title>');
  const out = shellOf(dir)(new Request('http://localhost:8080/'), 'http://localhost:8080');
  assert.equal(out.headers.get('x-frame-options'), 'DENY');
  assert.equal(out.headers.get('referrer-policy'), 'same-origin');
  assert.equal(out.headers.get('cross-origin-opener-policy'), 'same-origin');
  assert.match(out.headers.get('permissions-policy') ?? '', /camera=\(\)/u);
  assert.equal(out.headers.get('strict-transport-security'), null);
});

test('A PAGE SENDS NO REFERRER OFF THE HOST AND NOBODY MAY FRAME IT, as on the Cloud', async () => {
  const b = build();
  try {
    const serve = shellOf(b.root);
    const out = await get(serve, '/r/tasks');
    assert.equal(out.status, 200);
    assert.equal(out.headers.get('referrer-policy'), 'same-origin', 'a link out of a record tells the far side which host it left');
    assert.equal(out.headers.get('x-frame-options'), 'DENY');
    /* THE HOSTS' FRAME DOCUMENTS ANSWER FROM CODE, UNDER THEIR OWN POLICIES, NOT THE PAGE'S. */
    for (const path of ['/drawn-frame', '/drawn-frame/file', '/drawn-frame/hold']) {
      const frame = await get(serve, path);
      assert.equal(frame.status, 200, path);
      assert.match(frame.headers.get('content-security-policy') ?? '', /frame-ancestors 'self'/u, path);
      assert.equal(frame.headers.get('x-frame-options'), 'SAMEORIGIN', path);
    }
  } finally {
    b.clean();
  }
});
