/**
 * The 404 page is served at every depth, so it has to name its assets from the root.
 *
 *   node --test --experimental-strip-types "apps/site/test/not-found-depth.test.mjs"
 *
 * `wrangler.jsonc` answers a path with no file with `404.html` AT THE ADDRESS ASKED
 * (`not_found_handling: "404-page"`), so one document is served at `/nope`, `/a/b`, `/changelog/x`,
 * `/app/` and `/app/signin`. SvelteKit wrote every prerendered page's assets relative to the page
 * (`paths.relative` defaults to `true`), and `404.html` is prerendered for `/404`, so it asked for
 * `./_app/immutable/...` eighteen times. At `/nope` that is `/_app/...` and the page was whole. One
 * level down it is `/a/_app/...`, which is itself a path with no file, so every stylesheet and
 * module was answered with the 404 page's own HTML: Chromium drew the page in "Times New Roman" and
 * threw "Failed to fetch dynamically imported module .../a/_app/immutable/entry/start.js"
 * (measured at 16 assets failed on each of five paths).
 *
 * THE START SCRIPT HAD THE SAME FAULT IN A SECOND PLACE. With relative paths it sets SvelteKit's
 * base to `new URL(".", location).pathname`, so at `/a/b` the client would have believed the whole
 * site lived under `/a` even had its modules arrived. So this checks the base as well as the URLs.
 *
 * IT READS `build/`, like `content.test.ts`, because the fault is invisible in `src/`: no source
 * file here writes `./_app`. A missing build is a skip that says so.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const BUILD = new URL('../build/', import.meta.url);
const NOT_FOUND = new URL('404.html', BUILD);

const NO_BUILD = existsSync(NOT_FOUND)
  ? null
  : 'apps/site/build/404.html is missing. Run "pnpm --filter @braindog/site build" first: this reads the served bytes.';

const when = (reason) => (reason ? { skip: reason } : {});

/** Every place a page asks for something under `_app`, as written: `href`, `src` and the start script's `import(...)`. */
const asks = (html) => [...html.matchAll(/(?:href=|src=|import\()["']([^"']*_app\/[^"']*)["']/g)].map((m) => m[1]);

test('404.html names every asset from the root, so it draws the same at /a/b as at /nope', when(NO_BUILD), () => {
  const html = readFileSync(NOT_FOUND, 'utf8');
  const relative = html.split('./_app/').length - 1;
  assert.equal(relative, 0, `404.html asks for ./_app/ ${relative} time(s), which resolves under /a/_app/ at /a/b and 404s`);

  const urls = asks(html);
  assert.ok(urls.length > 0, 'found no _app asset in 404.html at all, so this test is no longer reading what it thinks it is');
  const loose = urls.filter((url) => !url.startsWith('/_app/'));
  assert.deepEqual(loose, [], `404.html asks for assets that do not start at /_app/:\n${loose.join('\n')}`);
});

test('404.html fixes the base rather than working it out from the address', when(NO_BUILD), () => {
  const html = readFileSync(NOT_FOUND, 'utf8');
  const derived = /new URL\(\s*["']\.["']\s*,\s*location\s*\)/.test(html);
  assert.equal(derived, false, 'the start script derives its base from location, which is /a at /a/b');
});

/* THE FAVICON TOO. `app.html` writes it as `%sveltekit.assets%/mark.svg`, which relative paths
   render as `./mark.svg`, so at `/a/b` the tab asked `/a/mark.svg` and was handed HTML. */
test('404.html asks for nothing relative to itself, the favicon included', when(NO_BUILD), () => {
  const html = readFileSync(NOT_FOUND, 'utf8');
  const dotted = [...html.matchAll(/(?:href|src)=["'](\.\.?\/[^"']*)["']/g)].map((m) => m[1]);
  assert.deepEqual(dotted, [], `404.html asks for paths relative to the address it is served at:\n${dotted.join('\n')}`);
});

test('every _app file 404.html asks for is in the build, so a root path is not just a different wrong path', when(NO_BUILD), () => {
  const missing = asks(readFileSync(NOT_FOUND, 'utf8'))
    .map((url) => url.replace(/^\.?\//, ''))
    .filter((path) => !existsSync(new URL(path, BUILD)));
  assert.deepEqual(missing, [], `404.html asks for files the build does not have:\n${missing.join('\n')}`);
});

/* THE OTHER PAGES ARE HELD TO IT TOO, because the setting is site-wide and a trailing slash or a
   future nested route puts any of them one level down. The read is RECURSIVE because a nested
   route is written to `build/<dir>/<page>.html`: with relative paths restored, a route at
   `changelog/x` was built to `build/changelog/x.html` asking for `../_app/`, and a flat read of
   `build/` listed six offenders and not that one. `../_app/` contains `./_app/`, so one substring
   catches both depths. */
test('no prerendered page asks for ./_app/, at any depth of the build', when(NO_BUILD), () => {
  const pages = readdirSync(BUILD, { recursive: true })
    .map((name) => String(name).replaceAll('\\', '/'))
    .filter((name) => name.endsWith('.html'));
  const offenders = pages.filter((name) => readFileSync(new URL(name, BUILD), 'utf8').includes('./_app/'));
  assert.deepEqual(offenders, [], `pages that name their assets relative to themselves: ${offenders.join(', ')}`);
});
