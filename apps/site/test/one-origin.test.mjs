/**
 * What the site sends so it can share an origin with the record app, and what it must not send.
 *
 *   node --test --experimental-strip-types "apps/site/test/one-origin.test.mjs"
 *
 * ONE ORIGIN MEANS THE SESSION COOKIE AND THE MARKETING PAGES ANSWER FROM THE SAME PLACE. Once the
 * app is `brain.dog/app/` rather than `app.brain.dog`, a script injected into any page of this site
 * runs where the record's cookie is, and a crawler that follows `Allow: /` walks into `/app/`,
 * `/api/`, `/auth/` and `/account/`, which the Worker answers. `loop/research-one-domain.md` §2.6
 * asked for a CSP and for those four to be disallowed.
 *
 * THE CSP IT WROTE DOWN KILLS THE DRAWN APP, measured on 23 September (`loop/research-site-now.md`
 * §2, `probe4.mjs`). SvelteKit prerenders an inline `<script>` that starts the page. Served with a
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
 * so the next person to read §2.6 does not add it.
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
