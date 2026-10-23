/**
 * What the site sends so it can share an origin with the record app, and what it must not send.
 *
 *   node --test --experimental-strip-types "apps/site/test/one-origin.test.mjs"
 *
 * ONE ORIGIN MEANS THE SESSION COOKIE AND THE MARKETING PAGES ANSWER FROM THE SAME PLACE. Once the
 * app is `brain.dog/app/` rather than `app.brain.dog`, a script injected into any page of this site
 * runs where the record's cookie is, and a crawler that follows `Allow: /` walks into `/app/`,
 * `/api/`, `/auth/` and `/account/`, which the Worker answers. The move to one domain
 * asked for a CSP and for those four to be disallowed.
 *
 * THE CSP IT WROTE DOWN KILLS THE DRAWN APP, measured on 23 September. SvelteKit prerenders an inline `<script>` that starts the page. Served with a
 * header of `script-src 'self'; frame-ancestors 'none'`, the browser refused it ("Executing inline
 * script violates the following Content Security Policy directive"), and pressing "Solo founder" in
 * the hero left "Personal" selected: no tab, no rail, nothing in the window answered. So the script
 * policy lives in `kit.csp` with `mode: 'hash'`, where SvelteKit hashes the very script it writes
 * into each page's `<meta>`, and the header carries only what a meta tag cannot: `frame-ancestors`
 * is ignored in a meta policy, so it has to be a header.
 *
 * A HEADER `script-src` ON TOP OF THE META TAG STILL BREAKS IT, because a browser enforces every
 * policy it is given and a script must pass all of them. That is the trap the last test guards,
 * and it passes on the commit that wrote this file: nothing had added the header yet. It is here
 * so the next person to read that CSP advice does not add it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import config from '../svelte.config.js';

const text = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/**
 * `_headers` AS CLOUDFLARE READS IT: a path at the start of a line, then its headers indented under
 * it. Comments are dropped first, because this file's comments quote the header it must not carry.
 */
const rules = () => {
  const out = [];
  for (const line of text('static/_headers').split('\n')) {
    if (/^\s*(#|$)/.test(line)) continue;
    if (!/^\s/.test(line)) out.push({ path: line.trim(), headers: [] });
    else {
      const at = line.indexOf(':');
      out.at(-1)?.headers.push({ name: line.slice(0, at).trim().toLowerCase(), value: line.slice(at + 1).trim() });
    }
  }
  return out;
};

/** The `Disallow` lines of the group that names `User-agent: *`, which is the group every crawler without its own falls into. */
const disallowedForEveryone = () => {
  const groups = [];
  let open = false;
  for (const raw of text('static/robots.txt').split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      if (!open) groups.push({ agents: [], disallow: [] });
      groups.at(-1).agents.push(value);
      open = true;
    } else {
      open = false;
      if (key === 'disallow' && groups.length) groups.at(-1).disallow.push(value);
    }
  }
  return groups.find((g) => g.agents.includes('*'))?.disallow ?? [];
};

test('the page policy is a hash policy from kit.csp, so the start script SvelteKit writes is allowed by name', () => {
  const csp = config.kit.csp;
  assert.equal(csp?.mode, 'hash', 'svelte.config.js has no kit.csp in hash mode');
  assert.deepEqual(csp.directives['script-src'], ['self']);
  assert.deepEqual(csp.directives['object-src'], ['none']);
  assert.deepEqual(csp.directives['base-uri'], ['self']);
});

test("_headers forbids framing on every path, with frame-ancestors 'none'", () => {
  const all = rules().find((r) => r.path === '/*');
  const policy = all?.headers.find((h) => h.name === 'content-security-policy')?.value ?? '';
  assert.match(policy, /(^|;)\s*frame-ancestors 'none'\s*(;|$)/, `no /* rule carries frame-ancestors 'none' (found ${JSON.stringify(policy)})`);
});

test('robots.txt keeps every crawler out of the app, its API, sign-in and the account pages', () => {
  const disallowed = disallowedForEveryone();
  for (const path of ['/app/', '/api/', '/auth/', '/account/']) {
    assert.ok(disallowed.includes(path), `robots.txt does not disallow ${path} for User-agent: * (it disallows ${JSON.stringify(disallowed)})`);
  }
});

/**
 * THE TRAP. `default-src` is named as well as `script-src`, because a policy without a `script-src`
 * falls back to `default-src` for scripts, so `default-src 'self'` in a header stops the start script
 * exactly the way `script-src 'self'` does.
 */
test('no _headers rule carries a script policy, which would block the inline start script the meta hash allows', () => {
  const scripted = rules().flatMap((r) =>
    r.headers
      .filter((h) => h.name.startsWith('content-security-policy') && /(^|;)\s*(script-src(-elem|-attr)?|default-src)\b/.test(h.value))
      .map((h) => `${r.path}: ${h.name}: ${h.value}`),
  );
  assert.deepEqual(scripted, [], `a header script policy kills the drawn app:\n${scripted.join('\n')}`);
});

/**
 * WHERE "OPEN THE APP" GOES FOLLOWS WHERE THE APP LIVES, READ FROM THE TWO `wrangler.jsonc` FILES.
 *
 * `APP` in `src/lib/copy.ts` is every "Open the app" on the site and the footer's sign-in. It was the absolute
 * `https://app.brain.dog`, which stays right only while production's `PUBLIC_HOST` is that name: with the one-domain vars a
 * sign-in on `app.brain.dog` is refused at `origin` and a device start there answers 403,
 * so a link to it lands a reader where signing in fails. Once the
 * app's `PUBLIC_HOST` is the site's own name, the link is the relative `/app`, which the site's script hands to its own
 * environment's app, so the alpha site's readers reach alpha's app and not production's. Before the flip `/app` on
 * `brain.dog` refuses sign-in too, so the link waits for the flip, and this test says which of the two it must be.
 */
const checker = await import(new URL('../../worker/scripts/provision-check.mjs', import.meta.url).href);

test('"Open the app" is /app once the app lives on the site name, and the site hands /app to the app in every environment', async () => {
  const { APP } = await import('../src/lib/copy.ts');
  const worker = checker.wranglerConfig();
  const site = checker.siteConfig();
  const host = worker.env.production.vars.PUBLIC_HOST;
  const shared = (site.env.production.routes ?? []).filter((r) => r.custom_domain).map(checker.hostOf).includes(host);
  if (!shared) {
    assert.equal(APP, `https://${host}`, `production's app is on ${host}, its own name, so "Open the app" has to go there`);
    return;
  }
  assert.equal(APP, '/app', `production's app is on ${host}, the site's own name, so "Open the app" is the site's /app`);
  for (const env of ['production', 'alpha']) {
    const first = (site.env[env]?.assets ?? site.assets ?? {}).run_worker_first ?? [];
    for (const path of ['/app', '/app/signin']) assert.ok(checker.workerFirst(first, path), `${env}: the site answers ${path} with its 404 page, so the link goes nowhere`);
  }
});

/**
 * THE SIGNED-IN SWAP RUNS UNDER THE SAME POLICY (batch 103). The site reads `bd_in` before the first
 * paint, so "Start free" and "Sign in" become "Open BrainDog" with nothing flickering. That needs a script in the head,
 * and the policy above allows only this origin's own files and the start script SvelteKit hashes. So the shell loads
 * `/signed-in.js` as a file from this origin, blocking on purpose, and writes no inline script of its own: one would
 * be refused under `script-src 'self'`, and a hash or `unsafe-inline` added to let it through would let others in.
 */
test('app.html loads /signed-in.js from this origin, under script-src self, with no inline script of its own', () => {
  assert.deepEqual(config.kit.csp?.directives['script-src'], ['self'], 'the script policy is no longer this origin alone');

  const shell = text('src/app.html').replace(/<!--[\s\S]*?-->/g, ' ');
  const head = shell.slice(0, shell.indexOf('</head>'));
  const scripts = [...shell.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  const loads = scripts.filter((m) => /\ssrc="\/signed-in\.js"/.test(m[1]));
  assert.equal(loads.length, 1, 'app.html does not load /signed-in.js, so a signed-in reader is offered Start free');
  assert.ok(head.includes(loads[0][0]), 'app.html loads /signed-in.js outside the head, so the page paints before it runs');
  assert.doesNotMatch(loads[0][1], /\s(async|defer|type="module")\b/, '/signed-in.js is deferred, so Start free flickers into Open BrainDog');
  assert.ok(text('static/signed-in.js').trim().length > 0, 'static/signed-in.js is missing or empty, so the tag loads nothing');

  for (const [tag, attrs, body] of scripts) {
    const src = /\ssrc="([^"]*)"/.exec(attrs)?.[1];
    assert.ok(src !== undefined && body.trim() === '', `app.html holds an inline script, which script-src 'self' refuses: ${tag.slice(0, 80)}`);
    assert.ok(src.startsWith('/') && !src.startsWith('//'), `app.html loads a script from another origin: ${src}`);
  }
});

/**
 * THE VISIT COUNT RUNS UNDER THE SAME POLICY (batch 103b, LAUNCH 103 job 9). `/seen.js` posts to this origin's
 * `/api/seen` and nowhere else, with no cookie. It is not loaded until counting is switched on in production
 * (`COUNT_VISITS`), so app.html does not name it yet; the day it does, it loads it `defer` from this origin.
 */
test('app.html does not load /seen.js yet, and /seen.js posts only to this origin', () => {
  const shell = text('src/app.html').replace(/<!--[\s\S]*?-->/g, ' ');
  assert.doesNotMatch(shell, /\/seen\.js/, 'app.html loads /seen.js while counting is off, so every page posts to a door that answers nothing');

  const script = text('static/seen.js').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const urls = [...script.matchAll(/fetch\(\s*'([^']*)'/g)].map((m) => m[1]);
  assert.deepEqual(urls, ['/api/seen'], `/seen.js fetches something other than this origin's /api/seen: ${JSON.stringify(urls)}`);
  assert.match(script, /credentials:\s*'omit'/, '/seen.js lets the session cookie go with the count');
});
