/**
 * Claims the site makes about the rest of the tree, each held to the file that settles it.
 *
 * WHY THESE AND WHY HERE. `loop/research-site-claims.md` (22 September) found claims like these false
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

test('the hosted backup cell does not promise copies while the sealing key is a placeholder', () => {
  /* `sealerOf` in `apps/worker/src/snapshots.ts` refuses a placeholder recipient before the walk
     starts, so with `age1<production-recipient>` no hosted copy is written at all. */
  const recipient = productionRecipient();
  assert.ok(recipient !== undefined, 'no AGE_RECIPIENT in the production environment of wrangler.jsonc');

  const row = site.pricing.rows.find((r: readonly string[]) => r[0] === 'Backups');
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

  const row = site.pricing.rows.find((r: readonly string[]) => r[0] === 'Backups');
  assert.ok(row, 'the pricing table has no Backups row');
  const hosted = row[2] ?? '';
  if (recipient !== '' && !recipient.includes('<')) {
    assert.doesNotMatch(hosted, /once we set|None yet/, `production seals to ${recipient.slice(0, 10)}..., and the cell says "${hosted}"`);
  }
  if (recipient === '') {
    assert.doesNotMatch(hosted, /seal/i, `production's AGE_RECIPIENT is empty, so its copies are unsealed, and the cell says "${hosted}"`);
  }
});

/**
 * The shapes this site has used to say no model answers here: "no host here has one" under the Slash
 * line and "none is configured by default" under the arrangement note, both false from 24 September.
 */
const NO_MODEL = /no host here has (one|a model)|none is configured|once you configure one/i;

test('no sentence says there is no model while an environment includes one', () => {
  /* TWO VARS, BECAUSE THERE ARE TWO WAYS TO A MODEL (`apps/worker/src/slash.ts`). `SLASH_INCLUDED` at
     `yes` switches on the included model (`includedInference`), and a non-empty `SLASH_ENDPOINT` names
     the person's own. The checks this replaces read the palette and the hosts' wiring and neither var,
     and the copy's comments leaned on `SLASH_ENDPOINT` being `""`; production turned `SLASH_INCLUDED`
     on beside that empty endpoint, and both false sentences shipped with this file green.

     BOTH ENVIRONMENTS, BECAUSE ONE COPY IS BUILT FOR EACH ENVIRONMENT'S SITE, and each site forwards to
     its own environment's app (`apps/site/wrangler.jsonc`). A sentence denying a model is false on any
     site whose app has one, production's first. Each var must be declared in each environment, so a
     rename or a deleted line fails here instead of reading as "no model" and standing the check down. */
  const envs = wranglerConfig(fileURLToPath(REPO)).env ?? {};
  const modelled: string[] = [];
  for (const name of ['production', 'alpha']) {
    const vars = envs[name]?.vars;
    const included = vars?.['SLASH_INCLUDED'];
    const endpoint = vars?.['SLASH_ENDPOINT'];
    assert.ok(included !== undefined, `no SLASH_INCLUDED in the ${name} environment of apps/worker/wrangler.jsonc`);
    assert.ok(endpoint !== undefined, `no SLASH_ENDPOINT in the ${name} environment of apps/worker/wrangler.jsonc`);
    if (included === 'yes' || endpoint.trim() !== '') modelled.push(name);
  }

  const said = strings(site).filter((s) => NO_MODEL.test(s));
  if (modelled.length > 0) {
    assert.deepEqual(said, [], `a model is included in ${modelled.join(' and ')}, and the site says there is none: ${said.join(' | ')}`);
  }
});
