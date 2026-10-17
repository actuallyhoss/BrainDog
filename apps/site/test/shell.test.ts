/**
 * The site's shell, read at the source with no build: the signed-in swap, the header's row, what is held, the footer
 * under the launch flags, and the shared parts every page draws (DIRECTION §47, §48).
 *
 * THE COMPONENTS ARE COMPILED HERE, FOR THE SERVER, as `apps/web/src/lib/design/offer-card.test.ts` does, because
 * `node --test` cannot load a `.svelte` file and the claim is about the HTML they draw.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import type { Component } from 'svelte';

import { HELD, LAUNCH } from '../src/lib/launch.ts';
import { SOURCE } from '../src/lib/links.ts';
import { PAGES, reachable } from '../src/lib/nav.ts';
import { footerGroups } from '../src/lib/site/footer.ts';
import { SIGNED_IN, isSignedIn } from '../src/lib/site/signed-in.ts';

registerHooks({
  load(url, context, next) {
    if (url.endsWith('.svelte')) {
      const filename = fileURLToPath(url);
      const { js } = compile(readFileSync(filename, 'utf8'), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    return next(url, context);
  },
});

const component = async <P extends Record<string, unknown>>(name: string): Promise<Component<P>> =>
  ((await import(new URL(`../src/lib/site/${name}.svelte`, import.meta.url).href)) as { default: Component<P> }).default;

const SCRIPT = readFileSync(new URL('../static/signed-in.js', import.meta.url), 'utf8');
const APP_HTML = readFileSync(new URL('../src/app.html', import.meta.url), 'utf8');

/** What `/signed-in.js` does to the page for this cookie: true when it marks the page signed in. */
const scriptSays = (cookie: string): boolean => {
  const dataset: Record<string, string> = {};
  runInNewContext(SCRIPT, { document: { cookie, documentElement: { dataset } } });
  return 'in' in dataset;
};

test('/signed-in.js and isSignedIn agree on every cookie', () => {
  assert.equal(SIGNED_IN, 'bd_in');
  const cases: [string, boolean][] = [
    ['bd_in=x', true],
    ['a=1; bd_in=sam-co', true],
    ['bd_in=', false],
    ['xbd_in=1', false],
    ['', false],
  ];
  for (const [cookie, want] of cases) {
    assert.equal(isSignedIn(cookie), want, `isSignedIn(${JSON.stringify(cookie)})`);
    assert.equal(scriptSays(cookie), want, `/signed-in.js on ${JSON.stringify(cookie)}`);
  }
});

test('/signed-in.js imports nothing and names the one cookie', () => {
  assert.ok(!/\bimport\b|\bexport\b/.test(SCRIPT), 'signed-in.js is a plain script, loaded before any module');
  assert.ok(SCRIPT.includes(`'${SIGNED_IN}'`), 'signed-in.js reads a cookie other than bd_in');
});

test('app.html loads /signed-in.js in the head, blocking, and carries no inline script', () => {
  const head = APP_HTML.slice(APP_HTML.indexOf('<head>'), APP_HTML.indexOf('</head>'));
  assert.ok(head.includes('<script src="/signed-in.js"></script>'), 'the head does not load /signed-in.js as a plain blocking script');
  const scripts = APP_HTML.match(/<script\b[^>]*>/g) ?? [];
  assert.deepEqual(scripts, ['<script src="/signed-in.js">'], 'app.html carries a script of its own besides /signed-in.js');
  assert.ok(!APP_HTML.includes('\u2014'), 'app.html ships an em dash in its bytes');
});

test('the signed-in rules beat a component\'s own display: !important, because app.css is in a layer', () => {
  const css = readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');
  assert.match(css, /html\[data-in\] \.when-out \{\s*display: none !important;/);
  assert.match(css, /html:not\(\[data-in\]\) \.when-in \{\s*display: none !important;/);
});

test('Start draws both states: Start free signed out, Open BrainDog signed in', async () => {
  const Start = await component<{ size?: 'md' | 'sm'; tone?: 'red' }>('Start');
  const { body } = render(Start, { props: {} });
  assert.match(body, /<a class="btn red when-out" href="\/app\/signup" rel="external">Start free<\/a>/);
  assert.match(body, /<a class="btn red when-in" href="\/app" rel="external">Open BrainDog<\/a>/);
  const small = render(Start, { props: { size: 'sm' } }).body;
  assert.match(small, /class="btn red sm when-out"/);
  assert.match(small, /class="btn red sm when-in"/);
});

test('SignIn is drawn only while signed out, and Close ends on Start', async () => {
  const SignIn = await component<{ class?: string }>('SignIn');
  assert.match(render(SignIn, { props: { class: 'menu-link' } }).body, /<a class="when-out menu-link" href="\/app\/signin" rel="external">Sign in<\/a>/);
  const Close = await component<{ title: string; body: string }>('Close');
  const close = render(Close, { props: { title: 'Start your record.', body: 'One sentence.' } }).body;
  assert.match(close, /<h2 class="huge[^"]*">Start your record\.<\/h2>/);
  assert.ok(close.includes('Start free') && close.includes('Open BrainDog'), 'the close does not end on Start');
});

test('PageHead draws one h1 and its lead', async () => {
  const PageHead = await component<{ title: string; lead?: string }>('PageHead');
  const head = render(PageHead, { props: { title: 'Free for one person.', lead: 'Every plan has the whole app.' } }).body;
  assert.equal(head.match(/<h1\b/g)?.length, 1);
  assert.match(head, /class="night/);
  assert.ok(head.includes('Every plan has the whole app.'));
});

test('the header row is Slash, Agents, Pricing and Docs', () => {
  const row = reachable({ public: false }).filter((p) => p.header);
  assert.deepEqual(row.map((p) => p.label), ['Slash', 'Agents', 'Pricing', 'Docs']);
  assert.deepEqual(row.map((p) => p.path), ['/slash', '/agents', '/pricing', '/docs']);
});

test('/packs is held, so the sitemap and the 404 do not name it', () => {
  assert.equal(LAUNCH.public, false);
  assert.ok((HELD as readonly string[]).includes('/packs'));
  assert.ok(!PAGES.some((p) => p.path === '/packs' || p.path === '/changelog'), 'PAGES names a held page');
});

const links = (launch: { legal: boolean; repo: boolean; public: boolean }) =>
  footerGroups(launch, '/docs/start/welcome').flatMap((g) => g.links.map((l) => l.label));

test('the footer names GitHub only with LAUNCH.repo, and Terms and Privacy only with LAUNCH.legal', () => {
  const now = links({ ...LAUNCH, legal: false, repo: false });
  assert.ok(!now.includes('GitHub'), 'the footer names GitHub while the repository is private');
  assert.ok(!now.includes('Terms') && !now.includes('Privacy'), 'the footer names Terms or Privacy before his texts are live');
  assert.ok(now.includes('Legal'), 'the footer leaves out /legal, which every page links');

  const repo = footerGroups({ ...LAUNCH, legal: false, repo: true }).flatMap((g) => g.links);
  assert.ok(repo.some((l) => l.label === 'GitHub' && l.href === SOURCE && l.rel === 'external'), 'the public repository is not in the footer');

  const legal = links({ ...LAUNCH, legal: true, repo: false });
  assert.ok(legal.includes('Terms') && legal.includes('Privacy'), 'the live texts are not in the footer');
});

test('the footer is Product, Learn and Company, as the design draws them', () => {
  const groups = footerGroups({ ...LAUNCH, legal: false, repo: false }, '/docs/start/welcome');
  assert.deepEqual(
    groups.map((g) => [g.title, g.links.map((l) => l.label)]),
    [
      ['Product', ['Agents', 'Slash', 'Pricing', 'Security']],
      ['Learn', ['Get started', 'Connect an agent', 'Docs']],
      ['Company', ['Support', 'Legal']],
    ],
  );
  assert.equal(groups[1]?.links[0]?.href, '/docs/start/welcome');
});
