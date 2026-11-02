/**
 * Every file in `static/shots/` is one the site asks for, and no capture script writes another.
 *
 *   node --test apps/site/scripts/shots.test.mjs
 *
 * ONE FILE AND ONE READER. `static/shots/` held 33 captures on 22 September and the built site named
 * 9; the next day the screenshots on the home page were ruled out because they looked terrible,
 * and the home page stopped drawing any. What is left is the link preview,
 * `home-light.png`, which `app.html` names as the `og:image`. Deleting the files by hand fixes that
 * once; the next run of a capture script puts them straight back, which is why the scripts are held
 * to the page here too.
 *
 * THE CAPTURE SCRIPTS ARE READ AS TEXT AND NOT IMPORTED, because importing either one runs it: both
 * open a browser at the top level, and `usecases.mjs` starts a record per use case. `shot.mjs` is the
 * one that is imported: its work sits under `import.meta.main`, so what arrives here is the bounds
 * reader the daily look at the live site fails on, with no browser behind it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { hex, outOfBounds, routesOf, sheet } from './shot.mjs';

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

/**
 * The files `product.mjs` writes: one card per page `CARD_PATHS` names, under the file `cardOf` gives it (`lib/site/seo.ts`,
 * since every key page has its own card). The script is read as text to see it still writes by `cardOf`; the names
 * come from `seo.ts`, which is plain data and safe to import.
 */
async function productWrites() {
  const text = readFileSync(join(import.meta.dirname, 'product.mjs'), 'utf8');
  if (!/for \(const path of CARD_PATHS\)/.test(text) || !/cardOf\(path\)/.test(text)) return [];
  const { CARD_PATHS, cardOf } = await import('../src/lib/site/seo.ts');
  return [...new Set(CARD_PATHS.map((path) => new URL(cardOf(path)).pathname.split('/').pop()))];
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

test('product.mjs writes nothing the site does not name', async () => {
  const names = referenced();
  const writes = await productWrites();
  assert.ok(writes.includes('home-light.png'), 'product.mjs does not write each card `CARD_PATHS` names under `cardOf`, the home card first');
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

/* THE LIVE BOUNDS. The facts below are a site inside every bound; each test after the first
   plants one fact outside and the reader has to name it, and only it. */
const BOUNDS = JSON.parse(readFileSync(join(import.meta.dirname, 'live-bounds.json'), 'utf8'));

const inBounds = () => ({
  origin: 'https://brain.dog',
  build: '1',
  at: '2026-10-13T00:00:00.000Z',
  routes: {
    '/': { height: 7200, link: null, button: '#101318', buttonHover: '#B3322C', outside: [], cookies: [] },
    '/pricing': { height: 9000, link: '#BB2C29', button: '#CF413A', buttonHover: '#b3322c', outside: [], cookies: [] },
  },
});

/** The facts with one planted on a page, and what the reader says of them. */
function planted(path, fact) {
  const facts = inBounds();
  Object.assign(facts.routes[path], fact);
  return outOfBounds(facts, BOUNDS);
}

test('the bounds are the ones the site is held to', () => {
  assert.equal(BOUNDS.heights['/'], 7200);
  for (const red of ['#CF413A', '#B3322C']) assert.ok(BOUNDS.colours.includes(red), `${red} is not a colour in bounds`);
  assert.equal(BOUNDS.outsideScripts, 0);
  assert.equal(BOUNDS.cookies, 0);
});

test('a site inside every bound is green, at the bound itself and in either case of a colour', () => {
  assert.deepEqual(outOfBounds(inBounds(), BOUNDS), []);
});

test('a home page one pixel over its height is red, and a taller page with no bound is not', () => {
  assert.deepEqual(planted('/', { height: 5659 }), ['/ is 5,659 tall at 1440, over its bound of 5,658.']);
  assert.deepEqual(planted('/pricing', { height: 90000 }), []);
});

test('a blue link is red, by the page and the colour', () => {
  assert.deepEqual(planted('/pricing', { link: '#2563EB' }), [
    "/pricing: the first link in the text is #2563EB, which is not the site's red or its ink.",
  ]);
});

test('a blue button is red at rest and under the pointer, each said apart', () => {
  assert.match(planted('/', { button: '#2563EB' })[0], /^\/: the main button at rest is #2563EB/);
  assert.match(planted('/', { buttonHover: '#1D4ED8' })[0], /^\/: the main button under the pointer is #1D4ED8/);
  // A button the pointer never reached, or a colour the browser gave in another form, is in no list.
  assert.equal(planted('/', { buttonHover: 'not reached' }).length, 1);
  assert.equal(planted('/', { button: 'rgba(0, 0, 0, 0)' }).length, 1);
});

test('a script from another site is red, and names where it comes from', () => {
  assert.deepEqual(planted('/', { outside: ['cdn.example.com'] }), ['/ loads 1 script from another site: cdn.example.com.']);
});

test('a cookie is red, by its name', () => {
  assert.deepEqual(planted('/pricing', { cookies: ['sid'] }), ['/pricing sets a cookie: sid.']);
});

test('a run that looked at no page, or missed a page with a bound, is red and not a clean site', () => {
  assert.equal(outOfBounds({ routes: {} }, BOUNDS).length, 2);
  const facts = inBounds();
  delete facts.routes['/'];
  assert.deepEqual(outOfBounds(facts, BOUNDS), ['/ has no height at 1440, and its bound is 5,658.']);
});

test('the routes are the sitemap, as paths, once each', () => {
  const xml = '<urlset><url><loc>https://brain.dog/</loc></url><url><loc>https://brain.dog/for/teams</loc></url><url><loc> https://brain.dog/docs/ </loc></url><url><loc>https://brain.dog/docs</loc></url></urlset>';
  assert.deepEqual(routesOf(xml), ['/', '/for/teams', '/docs']);
});

test('a computed colour is read as the palette writes it, and anything else is left in the browser words', () => {
  assert.equal(hex('rgb(207, 65, 58)'), '#CF413A');
  assert.equal(hex('rgba(16, 19, 24, 1)'), '#101318');
  assert.equal(hex('rgba(0, 0, 0, 0)'), 'rgba(0, 0, 0, 0)');
  assert.equal(hex('oklch(0.6 0.2 25)'), 'oklch(0.6 0.2 25)');
  assert.equal(hex(null), null);
});

test('the sheet holds every capture under its page and says what is out of bounds first', () => {
  const facts = inBounds();
  const captures = [
    { path: '/', width: 1440, label: 'light', file: 'home-light.png' },
    { path: '/', width: 390, label: 'dark', file: 'home-dark-390.png' },
    { path: '/pricing', width: 390, label: 'light', file: 'pricing-light-390.png' },
  ];
  const red = sheet(facts, captures, ['/ sets a cookie: sid.']);
  for (const c of captures) assert.ok(red.includes(`src="${c.file}"`), `${c.file} is not on the sheet`);
  assert.ok(red.indexOf('/ sets a cookie: sid.') < red.indexOf('<section>'), 'the fault is below the pictures');
  assert.match(sheet(facts, captures, []), /In bounds\./);
  assert.doesNotMatch(red, /\u2014/, 'an em dash on the sheet');
});
