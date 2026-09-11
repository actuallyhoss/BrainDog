/**
 * The app as the self-host serves it: the file when there is one, the app when there is not, and nothing
 * outside the build whatever the path says.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { shellOf } from '../src/shell.ts';

const INDEX = '<!doctype html><title>BrainDog</title>';

function build() {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-shell-'));
  const root = join(dir, 'build');
  mkdirSync(join(root, '_app', 'immutable'), { recursive: true });
  writeFileSync(join(root, 'index.html'), INDEX);
  writeFileSync(join(root, '_app', 'immutable', 'entry.js'), 'export {};');
  writeFileSync(join(dir, 'secret.txt'), 'outside the build');
  return { dir, root, clean: () => rmSync(dir, { recursive: true, force: true }) };
}

const get = async (serve: (r: Request) => Response, path: string, method = 'GET') => {
  const res = serve(new Request(`http://localhost:8080${path}`, { method }));
  return { status: res.status, headers: res.headers, text: await res.text() };
};

test('EVERY SCREEN IS THE APP, AND IT CANNOT BE FRAMED', async () => {
  const b = build();
  try {
    const serve = shellOf(b.root);
    for (const path of ['/', '/signin', '/r/tasks', '/settings/recovery']) {
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
    assert.equal((await get(serve, '/', 'POST')).status, 405);
  } finally {
    b.clean();
  }
});

test('NOTHING OUTSIDE THE BUILD, by any spelling of the path or through a link inside it', async () => {
  const b = build();
  try {
    const serve = shellOf(b.root);
    for (const path of ['/..%2Fsecret.txt', '/%2e%2e/secret.txt', '/..%5Csecret.txt', '/_app/..%2F..%2Fsecret.txt', '/%2F..%2Fsecret.txt']) {
      const out = await get(serve, path);
      assert.ok(!out.text.includes('outside the build'), `${path} reached a file outside the build`);
    }
    let linked = true;
    try {
      symlinkSync(join(b.dir, 'secret.txt'), join(b.root, 'link.txt'));
    } catch {
      /* Windows needs a privilege to make a link; the resolve check is the same code either way. */
      linked = false;
    }
    if (linked) assert.ok(!(await get(serve, '/link.txt')).text.includes('outside the build'), 'a link inside the build reached out of it');
  } finally {
    b.clean();
  }
});

test('a directory that is not a build is refused at start, with a sentence', () => {
  const b = build();
  try {
    assert.throws(() => shellOf(join(b.dir, 'nothing-here')));
    rmSync(join(b.root, 'index.html'));
    assert.throws(() => shellOf(b.root), /has no index\.html, so it is not a built app/);
  } finally {
    b.clean();
  }
});
