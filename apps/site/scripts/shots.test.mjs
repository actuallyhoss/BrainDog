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
 * browser at the top level, and `usecases.mjs` starts a record per use case.
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

/** The one file `product.mjs` writes, by the `FILE` constant it writes it under. */
function productWrites() {
  const text = readFileSync(join(import.meta.dirname, 'product.mjs'), 'utf8');
  return [...text.matchAll(/^const FILE = '([^']+)';$/gm)].map((m) => m[1]);
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
  assert.equal(writes.length, 1, 'no `const FILE` parsed out of product.mjs');
  assert.deepEqual(writes.filter((f) => !names.has(f)), []);
});

test('product.mjs draws the card from the site build and not from the record app', () => {
  /* ON 23 SEPTEMBER IT COULD NOT RUN AT ALL. It looked for `apps/web/build/index.html`, and the
     record app now builds under `apps/web/build/app/`, so the run printed "no record-app build" and
     exited 1 with the app freshly built beside it. The card is made of the site's own mark, face and
     palette, so the site's build is the one it reads, and it starts no record and forwards no
     `/api` because nothing on the card is a read of one. */
  const text = readFileSync(join(import.meta.dirname, 'product.mjs'), 'utf8');
  assert.match(text, /const ROOT = join\(import\.meta\.dirname, '\.\.', 'build'\);/, 'product.mjs does not read apps/site/build');
  assert.doesNotMatch(text, /'web',\s*'build'/, 'product.mjs reads the record app build again');
  assert.doesNotMatch(text, /tools\/gates\/record\.mjs|startRecord/, 'product.mjs starts a record again');
});

test('the link preview is a 1200 by 630 card and not a capture of the app', () => {
  /* The file it replaced was 2880 by 1800: the Work board at 1440 by 900 at a device scale of 2,
     288 KB, which is a screenshot of the app under another name. 1200 by 630 is the size the Open
     Graph card is drawn at, and a drawing made to that size is the only thing that is. The width
     and height are the IHDR chunk's, bytes 16 to 24 of any PNG. */
  const png = readFileSync(join(SHOTS, 'home-light.png'));
  assert.equal(png.subarray(1, 4).toString('latin1'), 'PNG');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);
});

test('usecases.mjs writes nothing into static/shots', () => {
  /* It photographs for a person to look at, into the directory `--png=` names, and never ships. */
  const text = readFileSync(join(import.meta.dirname, 'usecases.mjs'), 'utf8');
  assert.doesNotMatch(text, /['"]static['"],\s*['"]shots['"]/, 'usecases.mjs builds a path into static/shots again');
});
