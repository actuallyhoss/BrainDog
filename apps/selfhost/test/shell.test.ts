/**
 * The app as the self-host serves it: the file when there is one, the app when there is not, and nothing
 * outside the build whatever the path says.
 *
 * THE BUILD IS LAID OUT AS `apps/web` WRITES IT WITH `paths.base: '/app'` (`loop/research-one-domain.md` Brief B):
 * every file under `build/app/`, so the app is `/app/…` and its scripts are `/app/_app/…`.
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
  const app = join(root, 'app');
  mkdirSync(join(app, '_app', 'immutable'), { recursive: true });
  mkdirSync(join(app, 'fonts'), { recursive: true });
  writeFileSync(join(app, 'index.html'), INDEX);
  writeFileSync(join(app, '_app', 'immutable', 'entry.js'), 'export {};');
  writeFileSync(join(app, 'fonts', 'inter.woff2'), FONT);
  writeFileSync(join(dir, 'secret.txt'), 'outside the build');
  writeFileSync(join(root, 'secret.txt'), 'outside the app');
  return { dir, root, app, clean: () => rmSync(dir, { recursive: true, force: true }) };
}

const get = async (serve: (r: Request) => Response, path: string, method = 'GET') => {
  const res = serve(new Request(`http://localhost:8080${path}`, { method }));
  return { status: res.status, headers: res.headers, text: await res.text() };
};

test('EVERY SCREEN UNDER /app IS THE APP, AND IT CANNOT BE FRAMED', async () => {
  const b = build();
  try {
    const serve = shellOf(b.root);
    for (const path of ['/app', '/app/', '/app/signin', '/app/r/tasks', '/app/acme/r/tasks', '/app/settings/recovery']) {
      const out = await get(serve, path);
      assert.equal(out.status, 200, path);
      assert.equal(out.text, INDEX, path);
      assert.equal(out.headers.get('content-type'), 'text/html; charset=utf-8');
      assert.equal(out.headers.get('content-security-policy'), "frame-ancestors 'none'");
      assert.equal(out.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(out.headers.get('cache-control'), 'no-cache');
    }
    const script = await get(serve, '/app/_app/immutable/entry.js');
    assert.equal(script.status, 200);
    assert.equal(script.headers.get('content-type'), 'text/javascript; charset=utf-8');
    assert.equal(script.headers.get('cache-control'), 'public, max-age=31536000, immutable');

    /* A missing script is a 404, not a page the browser then fails to run. */
    assert.equal((await get(serve, '/app/_app/immutable/missing.js')).status, 404);
    assert.equal((await get(serve, '/app/_app/missing.js')).status, 404);
    assert.equal((await get(serve, '/app/', 'POST')).status, 405);
  } finally {
    b.clean();
  }
});

test('THE ROOT AND EVERY PATH THE APP USED TO HAVE ARE A 308 INTO /app, WITH THE QUERY KEPT', async () => {
  /* `/` is where a person types the address, and `/signin?next=…` is where a bookmark from before the move points.
     A 308 and not a page: the page would load `/_app/…` scripts that are no longer there. */
  const b = build();
  try {
    const serve = shellOf(b.root);
    for (const [path, to] of [
      ['/', '/app/'],
      ['/signin?next=%2Fr%2Ftasks', '/app/signin?next=%2Fr%2Ftasks'],
      ['/r/tasks', '/app/r/tasks'],
      ['/apple', '/app/apple'],
      /* A page cached from before the move asks for its scripts here; they are under /app now, and a miss there is a 404. */
      ['/_app/immutable/entry.js', '/app/_app/immutable/entry.js'],
    ] as const) {
      const out = await get(serve, path);
      assert.equal(out.status, 308, path);
      assert.equal(out.headers.get('location'), to, path);
      assert.equal(out.headers.get('cache-control'), 'no-store', path);
      assert.equal(out.text, '', path);
    }
    /* A redirect is for a navigation. Anything else is refused as it was. */
    assert.equal((await get(serve, '/', 'POST')).status, 405);
  } finally {
    b.clean();
  }
});

test('/fonts/* IS SERVED FROM THE APP, because the shared tokens.css asks for it at the root', async () => {
  /* `packages/skin/tokens.css:51-70` names `url('/fonts/…')`, and on the self-host there is no site to answer it. */
  const b = build();
  try {
    const serve = shellOf(b.root);
    const font = await get(serve, '/fonts/inter.woff2');
    assert.equal(font.status, 200);
    assert.equal(font.text, FONT);
    assert.equal(font.headers.get('content-type'), 'font/woff2');
    assert.equal((await get(serve, '/app/fonts/inter.woff2')).text, FONT);
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
      '/app/..%2Fsecret.txt',
      '/app/..%2F..%2Fsecret.txt',
      '/app/%2e%2e/secret.txt',
      '/app/..%5Csecret.txt',
      '/app/_app/..%2F..%2F..%2Fsecret.txt',
      '/app/%2F..%2Fsecret.txt',
      '/fonts/..%2F..%2Fsecret.txt',
      '/fonts/..%2F..%2F..%2Fsecret.txt',
      '/..%2Fsecret.txt',
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
    if (linked) assert.ok(!(await get(serve, '/app/link.txt')).text.includes('outside the build'), 'a link inside the build reached out of it');
  } finally {
    b.clean();
  }
});

test('THE BUILD DIRECTORY OR ITS app FOLDER, EITHER ONE', async () => {
  /* BRAINDOG_SHELL was the build directory before the move, and `main.ts` and the catalogue name the folder that
     holds `index.html`. Both are served the same, from the app folder, and nothing above it is reachable from either. */
  const b = build();
  try {
    for (const dir of [b.root, b.app]) {
      const serve = shellOf(dir);
      assert.equal((await get(serve, '/app/r/tasks')).text, INDEX, dir);
      assert.equal((await get(serve, '/app/_app/immutable/entry.js')).status, 200, dir);
      assert.ok(!(await get(serve, '/app/..%2Fsecret.txt')).text.includes('outside the'), dir);
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
    assert.throws(() => shellOf(b.root), /has no app\/index\.html, so it is not a built app/);
  } finally {
    b.clean();
  }
});
