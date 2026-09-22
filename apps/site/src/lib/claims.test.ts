/**
 * Three claims the site makes about the rest of the tree, each held to the file that settles it.
 *
 * WHY THESE THREE AND WHY HERE. `loop/research-site-claims.md` (22 September) found them false
 * while `test/content.test.ts` passed 16 of 16: that suite reads the built HTML against the seed,
 * and none of these is a claim about the seed. Each went false because somebody changed a file in
 * another package and nothing on the site side was reading it. So each check below reads the other
 * package's file and not a copy of its value.
 *
 * IT SITS IN `src/lib` ONLY BECAUSE `test/` BELONGED TO ANOTHER AGENT WHEN IT WAS WRITTEN, and the
 * package's `test` script globs `test/*.test.ts`, so `pnpm test` does not run it yet. Run it as
 * `node --test --experimental-strip-types "apps/site/src/lib/*.test.ts"` until it moves.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

import { site } from './copy.ts';

const SITE = new URL('../../', import.meta.url);
const REPO = new URL('../../', SITE);

/** Every string anywhere under `site`, so a claim is found by its words rather than by its path. */
const strings = (v: unknown): string[] =>
  typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : [];

test('the 404 page and the sitemap name every page the site prerenders', () => {
  /* THE ROUTE DIRECTORIES ARE THE LIST, because `svelte.config.js` prerenders `*` and every one of
     these has no parameter. `/agents` was added on 6ef2193e and neither list heard about it. */
  const routes = new URL('src/routes/', SITE);
  const pages = [
    '/',
    ...readdirSync(routes, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== '404' && existsSync(new URL(`${d.name}/+page.svelte`, routes)))
      .map((d) => `/${d.name}`),
  ];

  const linked: string[] = site.notFound.links.map((l) => l.href);
  const map = readFileSync(new URL('static/sitemap.xml', SITE), 'utf8');
  const located = [...map.matchAll(/<loc>https:\/\/brain\.dog([^<]*)<\/loc>/g)].map((m) => m[1]);

  for (const page of pages) {
    assert.ok(linked.includes(page), `the 404 page says it lists every page and leaves out ${page}`);
    assert.ok(located.includes(page), `sitemap.xml leaves out ${page}`);
  }
});

test('the Spark line does not say no screen asks while the palette asks', () => {
  /* THE PALETTE ASKS THROUGH THE CLIENT, `sparkRead`, since a331fe8c. The old comment measured the
     screen with `grep spark/read apps/web/src`, which the client's own door hid from. */
  const palette = readFileSync(new URL('apps/web/src/lib/palette/Palette.svelte', REPO), 'utf8');
  const line = strings(site).find((s) => s.startsWith('Asking your record a question in words'));
  assert.ok(line, 'the Spark line is gone from copy.ts; this check should go with it');
  if (palette.includes('.sparkRead(')) {
    assert.doesNotMatch(line, /nothing on a screen asks/i, 'the palette asks Spark, and the line says no screen does');
  }
});

test('the hosted backup cell does not promise copies while the sealing key is a placeholder', () => {
  /* `sealerOf` in `apps/worker/src/snapshots.ts` refuses a placeholder recipient before the walk
     starts, so with `age1<production-recipient>` no hosted copy is written at all. */
  const wrangler = readFileSync(new URL('apps/worker/wrangler.jsonc', REPO), 'utf8');
  const production = wrangler.slice(wrangler.indexOf('"production"'));
  const recipient = /"AGE_RECIPIENT":\s*"([^"]*)"/.exec(production)?.[1];
  assert.ok(recipient !== undefined, 'no AGE_RECIPIENT in the production environment of wrangler.jsonc');

  const row = site.pricing.compare.rows.find((r) => r[0] === 'Backups');
  assert.ok(row, 'the pricing table has no Backups row');
  const hosted = row[2] ?? '';
  if (recipient.includes('<')) {
    assert.match(hosted, /\byet\b/, `the key is ${recipient}, so no hosted copy is kept, and the cell says "${hosted}"`);
  }
});
