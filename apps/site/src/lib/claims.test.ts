/**
 * Three claims the site makes about the rest of the tree, each held to the file that settles it.
 *
 * WHY THESE THREE AND WHY HERE. `loop/research-site-claims.md` (22 September) found them false
 * while `test/content.test.ts` passed 16 of 16: that suite reads the built HTML against the seed,
 * and none of these is a claim about the seed. Each went false because somebody changed a file in
 * another package and nothing on the site side was reading it. So each check below reads the other
 * package's file and not a copy of its value.
 *
 * IT SITS IN `src/lib` BECAUSE `test/` BELONGED TO ANOTHER AGENT WHEN IT WAS WRITTEN. For a while
 * `pnpm test` globbed `test/*.test.ts` only and never ran it, nor the component tests beside it;
 * the package's `test` script now globs `src/lib/*.test.ts` and the pages' `bands.test.ts` too.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { site } from './copy.ts';

const SITE = new URL('../../', import.meta.url);
const REPO = new URL('../../', SITE);

/**
 * Production's `AGE_RECIPIENT`, read off the parsed `apps/worker/wrangler.jsonc` and not off its text.
 *
 * THE TEXT WAS READ UNTIL 23 SEPTEMBER, AND FROM fe14e8be ON IT READ ALPHA'S KEY. Both backup checks
 * sliced the file at its first `"production"` and took the first `AGE_RECIPIENT` after it. That push
 * put a staged `"production": {` fragment in the comment at the top of the file, so the slice began
 * there, ran through the whole alpha block, and found `age1f6rykm...` at `:363`, alpha's, where
 * production's `age1av0654...` is at `:531`. It passed only because both are real keys now.
 *
 * THE CHECKER'S OWN PARSER, `wranglerConfig` in `apps/worker/scripts/provision-check.mjs`, so this and
 * the deploy-time checker cannot disagree about a comment. The specifier is a runtime URL for the
 * reason `apps/worker/test/wrangler-routes.test.ts` gives: the script has no declaration, and a static
 * import of it does not typecheck.
 */
const checker = new URL('apps/worker/scripts/provision-check.mjs', REPO).href;
const { wranglerConfig } = (await import(checker)) as {
  wranglerConfig: (root: string) => { env?: { [name: string]: { vars?: { [key: string]: string } } } };
};
const productionRecipient = (): string | undefined => wranglerConfig(fileURLToPath(REPO)).env?.['production']?.vars?.['AGE_RECIPIENT'];

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
  const recipient = productionRecipient();
  assert.ok(recipient !== undefined, 'no AGE_RECIPIENT in the production environment of wrangler.jsonc');

  const row = site.pricing.compare.rows.find((r) => r[0] === 'Backups');
  assert.ok(row, 'the pricing table has no Backups row');
  const hosted = row[2] ?? '';
  if (recipient.includes('<')) {
    assert.match(hosted, /\byet\b/, `the key is ${recipient}, so no hosted copy is kept, and the cell says "${hosted}"`);
  }
});

test('the hosted backup cell does not still wait on a sealing key once production has one', () => {
  /* `loop/research-site-now.md`, section 3. Production's `AGE_RECIPIENT` became a real `age1` key on
     54a16ffb (22 September, 20:12) and the cell went on saying "None yet ... once we set the key"
     for a day, because the check above only speaks while the value is a placeholder and was green
     either way. This is the other half: a real recipient means the cell must not wait on one, and an
     empty one, which `sealerOf` takes as a decision to keep unsealed copies, means it must not say
     the copies are sealed. */
  const recipient = productionRecipient();
  assert.ok(recipient !== undefined, 'no AGE_RECIPIENT in the production environment of wrangler.jsonc');

  const row = site.pricing.compare.rows.find((r) => r[0] === 'Backups');
  assert.ok(row, 'the pricing table has no Backups row');
  const hosted = row[2] ?? '';
  if (recipient !== '' && !recipient.includes('<')) {
    assert.doesNotMatch(hosted, /once we set|None yet/, `production seals to ${recipient.slice(0, 10)}..., and the cell says "${hosted}"`);
  }
  if (recipient === '') {
    assert.doesNotMatch(hosted, /seal/i, `production's AGE_RECIPIENT is empty, so its copies are unsealed, and the cell says "${hosted}"`);
  }
});

test('the column over the Spark line does not call it unbuilt while both hosts wire the engine', () => {
  /* `loop/research-site-now.md`, claim 3. The line under the head was careful; the head was not, and
     the head is what a stranger reads. Both files are read rather than trusted, so the day one host
     drops the engine this check stands down instead of defending a head that has become true.

     THE ENGINE'S NAME IS READ OFF ITS OWN `package.json` AND NOT TYPED HERE. `test/promises.test.mjs`
     refuses a workspace package name anywhere under `src/` outside an import or a comment, because a
     package name in a sentence is an install command with the verb left off, and it measured this
     file doing exactly that on the first draft. */
  const engine = (JSON.parse(readFileSync(new URL('packages/spark/package.json', REPO), 'utf8')) as { name: string }).name;
  const wired = ['apps/worker/src/spark.ts', 'apps/selfhost/src/spark.ts'].every((path) => {
    const at = new URL(path, REPO);
    return existsSync(at) && readFileSync(at, 'utf8').includes(`'${engine}'`);
  });
  const column = site.plain.columns.find((c) => c.lines.some((l: string) => l.startsWith('Asking your record a question in words')));
  assert.ok(column, 'no column holds the Spark line; this check should go with it');
  if (wired) {
    assert.doesNotMatch(column.head, /\bbuilt\b/i, `both hosts wire ${engine}, and the column over it is headed "${column.head}"`);
  }
});
