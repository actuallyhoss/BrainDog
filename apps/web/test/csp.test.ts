/**
 * The app's Content Security Policy, read from the built shell (12 §8).
 *
 * WHY THE BUILT SHELL AND NOT THE CONFIG. The browser runs the page, not `svelte.config.js`. SvelteKit writes the policy
 * into the shell's `<meta>` and both hosts copy that meta into the header (`pagePolicy` in `apps/worker/src/route.ts`
 * and `apps/selfhost/src/shell.ts`), so an inline script whose hash is missing there is a script the browser refuses,
 * and the shell's inline scripts are the whole app starting. The site measured what that looks like: a page that
 * loads, and nothing in it that answers (`apps/site/test/one-origin.test.mjs`).
 *
 * THE BUILT HALF IS SKIPPED WHEN THERE IS NO BUILD, with a sentence, because the `test` legs of `ci.yml` do not build.
 * The half that reads the config runs everywhere.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EMBED_PROVIDERS } from 'braindog-render';

/* A PATH IN A VARIABLE, so `svelte-check` does not ask for a declaration file for a config written in JavaScript. */
const CONFIG = '../svelte.config.js';
type Csp = { mode?: string; directives?: Partial<Record<'default-src' | 'script-src' | 'style-src-elem' | 'style-src-attr' | 'frame-src' | 'form-action', string[]>> };

const SHELL = new URL('../build/index.html', import.meta.url);
const TURNSTILE = 'https://challenges.cloudflare.com';

const hash = (text: string): string => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;

/** A policy as a map from each directive to its sources, as the browser splits it. */
function directives(policy: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const part of policy.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) out.set(name, sources);
  }
  return out;
}

test('THE POLICY FRAMES EXACTLY ITS OWN DRAWN FRAME, THE EMBED PROVIDERS AND TURNSTILE, AND ITS ONE INLINE EXCEPTION IS A STYLE ATTRIBUTE', async () => {
  const { default: config } = (await import(CONFIG)) as { default: { kit?: { csp?: Csp } } };
  const d = config.kit?.csp?.directives ?? {};
  /* `'self'` FOR THE DRAWN BLOCK'S FRAME ALONE, which both hosts serve under its own policy (`@braindog/host/drawn-frame`).
     `blob:` FOR AN ATTACHED PDF ALONE (07d611b46), and the two checks under this one are what keep it that. */
  assert.deepEqual(d['frame-src'], ['self', 'blob:', ...EMBED_PROVIDERS.map((p) => p.origin), TURNSTILE], "frame-src is not 'self', blob:, EMBED_PROVIDERS and Turnstile");
  assert.equal(config.kit?.csp?.mode, 'hash');
  assert.deepEqual(d['style-src-attr'], ['unsafe-inline']);
  assert.deepEqual(d['form-action'], ['self'], 'a form on the page could post to any host: default-src does not cover form-action');
  for (const name of ['default-src', 'script-src', 'style-src-elem'] as const)
    assert.ok(!(d[name] ?? []).some((s) => s === 'unsafe-inline' || s === 'unsafe-eval'), `${name} allows inline or eval`);
});

test('A BLOB IN A FRAME IS ONLY EVER A PDF: the one file that frames a blob types it as one, and no other file that makes a blob draws a frame', () => {
  const src = fileURLToPath(new URL('../src/', import.meta.url));
  const viewer = 'lib/attach/AttachmentViewer.svelte';
  const makes = (readdirSync(src, { recursive: true }) as string[])
    .filter((f) => f.endsWith('.svelte') || f.endsWith('.ts'))
    .filter((f) => !f.endsWith('.test.ts') && readFileSync(join(src, f), 'utf8').includes('createObjectURL'));
  assert.ok(makes.includes(viewer), 'the viewer no longer makes a blob, so frame-src no longer needs blob:');
  for (const file of makes) {
    if (file === viewer) continue;
    assert.doesNotMatch(readFileSync(join(src, file), 'utf8'), /<iframe\b/u, `${file} makes a blob and draws a frame, and frame-src lets a blob in`);
  }
  const text = readFileSync(join(src, viewer), 'utf8').replace(/<!--[\s\S]*?-->/gu, '');
  assert.deepEqual(
    [...text.matchAll(/createObjectURL\((.*)\)/gu)].map((m) => m[1]),
    ["new Blob([bytes], { type: 'application/pdf' })"],
    'a blob the viewer frames can carry another type, and a blob typed as a page runs in this origin',
  );
});

test(
  'THE BUILT SHELL CARRIES A POLICY THAT HASHES EVERY INLINE SCRIPT AND STYLE IN IT',
  { skip: existsSync(SHELL) ? false : 'apps/web/build/index.html is not there; build apps/web to run this' },
  () => {
    const html = readFileSync(SHELL, 'utf8');
    const meta = /<meta http-equiv="content-security-policy" content="([^"]*)"/i.exec(html)?.[1];
    assert.ok(meta, 'the shell carries no policy meta, so kit.csp wrote none and the hosts send no script-src');
    const d = directives(meta);

    assert.deepEqual(d.get('default-src'), ["'self'"]);
    assert.deepEqual(d.get('object-src'), ["'none'"]);
    assert.deepEqual(d.get('base-uri'), ["'none'"]);
    assert.deepEqual(d.get('style-src-attr'), ["'unsafe-inline'"]);

    /* Every inline script the browser would run, wherever it sits: the meta governs only what follows it, but the header
       the hosts copy it into governs the whole page. A JSON data block is not run, so it needs no hash. */
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(
      (m) => !/\bsrc=/i.test(m[1] ?? '') && !/type="application\/(ld\+)?json"/i.test(m[1] ?? '') && (m[2] ?? '').trim() !== '',
    );
    assert.ok(scripts.length > 0, 'the shell has no inline script, so SvelteKit no longer boots from one and this test reads the wrong file');
    for (const [, , body] of scripts)
      assert.ok(d.get('script-src')?.includes(hash(body ?? '')), `an inline script is not hashed in script-src: ${(body ?? '').slice(0, 80)}`);

    for (const [, , body] of html.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi))
      assert.ok(d.get('style-src-elem')?.includes(hash(body ?? '')), `an inline style is not hashed in style-src-elem: ${(body ?? '').trim().slice(0, 80)}`);
  },
);
