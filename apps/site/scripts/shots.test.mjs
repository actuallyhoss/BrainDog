/**
 * Every file in `static/shots/` is one the site asks for, and neither capture script writes another.
 *
 *   node --test apps/site/scripts/shots.test.mjs
 *
 * THIRTY-THREE FILES AND NINE READERS. On 22 September `static/shots/` held 33 captures, 5.2 MB on
 * disk, and the built site named 9 of them: every `/shots/` token in `build/*.html` and the page
 * chunk was extracted, and `apps/site/src` holds the same 9 as literals and no `/shots/${...}`
 * template. The other 24 were deployed to Cloudflare on every push and fetched by nobody. They were
 * there because `product.mjs` still photographed five screens the page had stopped drawing, and
 * `usecases.mjs` wrote its founder home capture beside the dashboard one the page actually serves.
 * Deleting the files by hand fixes that once; the next run of either script puts them straight
 * back, which is why the scripts' lists are held to the page here too.
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

/* The two passes both scripts make, wide then phone, each in both schemes. */
const SIZES = ['', '-phone'];
const SCHEMES = ['light', 'dark'];

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

/** Every name a SHOTS entry in `product.mjs` makes: a WebP per size and scheme, and a PNG when it asks. */
function productWrites() {
  const text = readFileSync(join(import.meta.dirname, 'product.mjs'), 'utf8');
  const list = text.slice(text.indexOf('const SHOTS = ['), text.indexOf('];', text.indexOf('const SHOTS = [')));
  const out = [];
  for (const m of list.matchAll(/\{\s*name:\s*'([^']+)'[^}]*\}/g)) {
    for (const size of SIZES) for (const scheme of SCHEMES) out.push(`${m[1]}${size}-${scheme}.webp`);
    if (/png:\s*true/.test(m[0])) out.push(`${m[1]}-light.png`);
  }
  return out;
}

/** The base names `usecases.mjs` lets into `static/shots/`, from its SHIPPED list. */
function usecaseWrites() {
  const text = readFileSync(join(import.meta.dirname, 'usecases.mjs'), 'utf8');
  const list = /const SHIPPED = new Set\(\[([^\]]*)\]\)/.exec(text);
  assert.ok(list, 'usecases.mjs declares no SHIPPED list, so every capture it takes is written into static/shots');
  const out = [];
  for (const m of list[1].matchAll(/'([^']+)'/g))
    for (const size of SIZES) for (const scheme of SCHEMES) out.push(`${m[1]}${size}-${scheme}.webp`);
  return out;
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

test('usecases.mjs lets nothing into static/shots that the site does not name', () => {
  const names = referenced();
  const writes = usecaseWrites();
  assert.ok(writes.length > 0, 'no SHIPPED entry parsed out of usecases.mjs');
  assert.deepEqual(writes.filter((f) => !names.has(f)), []);
});
