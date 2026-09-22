/**
 * Every file in `static/shots/` is one the site asks for, and no capture script writes another.
 *
 *   node --test apps/site/scripts/shots.test.mjs
 *
 * ONE FILE AND ONE READER. `static/shots/` held 33 captures on 22 September and the built site named
 * 9; the next day the owner said of the screenshots on the home page *i hate those screenshots. they
 * look terrible*, and the home page stopped drawing any. What is left is the link preview,
 * `home-light.png`, which `app.html` names as the `og:image`. Deleting the files by hand fixes that
 * once; the next run of a capture script puts them straight back, which is why the scripts are held
 * to the page here too.
 *
 * THE SCRIPTS ARE READ AS TEXT AND NOT IMPORTED, because importing either one runs it: both open a
 * browser at the top level, and `product.mjs` binds a port the browser gates share.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SITE = join(import.meta.dirname, '..');
const SRC = join(SITE, 'src');
const SHOTS = join(SITE, 'static', 'shots');

function sources(dir) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && /\.(svelte|ts|js|html|css)$/.test(e.name))
    .map((e) => readFileSync(join(e.parentPath, e.name), 'utf8'));
}

/** The captures the site names, as literals, anywhere under `src/`. */
function referenced() {
  const names = new Set();
  for (const text of sources(SRC)) for (const m of text.matchAll(/\/shots\/([A-Za-z0-9_.-]+\.(?:webp|png))/g)) names.add(m[1]);
  return names;
}

/** Every name a SHOTS entry in `product.mjs` makes: one light PNG each. */
function productWrites() {
  const text = readFileSync(join(import.meta.dirname, 'product.mjs'), 'utf8');
  const list = text.slice(text.indexOf('const SHOTS = ['), text.indexOf('];', text.indexOf('const SHOTS = [')));
  return [...list.matchAll(/\{\s*name:\s*'([^']+)'[^}]*\}/g)].map((m) => `${m[1]}-light.png`);
}

test('the site names its captures as literals, so a literal scan sees all of them', () => {
  /* A `/shots/${name}` template would be a reader this file cannot see, and every test below would
     then call a served capture unreferenced. */
  const dynamic = sources(SRC).filter((t) => /\/shots\/\$\{/.test(t));
  assert.equal(dynamic.length, 0, 'a source file builds a /shots/ address at runtime');
  assert.ok(referenced().size > 0, 'no /shots/ literal found under src, so the scan is reading the wrong place');
});

test('every file in static/shots is one the site names', () => {
  const names = referenced();
  const unread = readdirSync(SHOTS).filter((f) => !names.has(f));
  assert.deepEqual(unread, [], `${unread.length} file(s) in static/shots ship with no page naming them`);
});

test('every capture the site names is in static/shots', () => {
  const present = new Set(readdirSync(SHOTS));
  const missing = [...referenced()].filter((f) => !present.has(f));
  assert.deepEqual(missing, [], 'the site names a capture that is not there');
});

test('product.mjs writes nothing the site does not name', () => {
  const names = referenced();
  const writes = productWrites();
  assert.ok(writes.length > 0, 'no SHOTS entry parsed out of product.mjs');
  assert.deepEqual(writes.filter((f) => !names.has(f)), []);
});

test('usecases.mjs writes nothing into static/shots', () => {
  /* It photographs for a person to look at, into the directory `--png=` names, and never ships. */
  const text = readFileSync(join(import.meta.dirname, 'usecases.mjs'), 'utf8');
  assert.doesNotMatch(text, /['"]static['"],\s*['"]shots['"]/, 'usecases.mjs builds a path into static/shots again');
});
