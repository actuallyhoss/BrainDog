/**
 * Claims the site makes about the rest of the tree, each held to the file that settles it.
 *
 * WHY THESE AND WHY HERE. A read of the site on 22 September found claims like these false
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
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { site } from './copy.ts';
import { LAUNCH } from './launch.ts';
import { SUPPORT_EMAIL } from './links.ts';
import { PAGES, PLACES } from './nav.ts';

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

test('nav.ts names every page the site prerenders, so the header, the 404 and the sitemap do', () => {
  /* THE ROUTE DIRECTORIES ARE THE LIST, because `svelte.config.js` prerenders `*` and every one of
     these has no parameter. The 404's list and `/sitemap.xml` are both built from `nav.ts`'s
     `PAGES`, so a page missing there is missing from both. */
  const routes = new URL('src/routes/', SITE);
  const pages = [
    '/',
    ...readdirSync(routes, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== '404' && existsSync(new URL(`${d.name}/+page.svelte`, routes)))
      .map((d) => `/${d.name}`),
  ];

  const named = PAGES.map((p) => p.path);
  for (const page of pages) assert.ok(named.includes(page), `nav.ts leaves out ${page}, so the 404 and the sitemap do too`);
});

test('every place nav.ts names is a route the site has', () => {
  /* THE OTHER DIRECTION, AND UNDER PLAIN NODE IT IS THE ONLY GUARD. `exists` in `nav.ts` drops a place with no
     `+page.svelte` from the header and the footer at build time, but here `import.meta.glob` does not exist, so
     every place counts as live, and a path typed wrong (or a page for one kind of person under `for/` that was
     never written) would be listed by the 404 and the sitemap from one build and missing from the next. */
  const routes = new URL('src/routes/', SITE);
  const missing = PLACES.map((p) => p.path).filter((path) => !existsSync(new URL(`.${path}/+page.svelte`, routes)));
  assert.deepEqual(missing, [], `nav.ts names ${missing.join(', ')}, and src/routes holds no page there`);
});

/**
 * THE SITE'S LAUNCH FLAGS MIRROR THE WORKER'S VARS. There is no sign-up var: production's `BILLING` is both switches, so
 * `LAUNCH.signup` is on exactly when it is set, and `LAUNCH.billing` exactly when it is `live`. The support
 * address is the Worker's `SUPPORT_ADDRESS`, and `/support` shows `SUPPORT_EMAIL`, so the two are one address
 * or both empty. Each is read off the parsed config of production, because that is the environment the site
 * deployed to brain.dog describes.
 */
test("the launch flags and the support address match production's Worker vars", () => {
  const vars: { [key: string]: string } = wranglerConfig(fileURLToPath(REPO)).env?.['production']?.vars ?? {};
  const billing = vars['BILLING'];
  assert.ok(billing !== undefined, 'no BILLING in the production environment of apps/worker/wrangler.jsonc, so nothing says whether sign-up is open');
  assert.equal(LAUNCH.signup, billing !== '', `production's BILLING is "${billing}", and LAUNCH.signup in src/lib/launch.ts is ${LAUNCH.signup}`);
  assert.equal(LAUNCH.billing, billing === 'live', `production's BILLING is "${billing}", and LAUNCH.billing in src/lib/launch.ts is ${LAUNCH.billing}`);
  /* Absent reads as empty: the var is added the day the address routes to a person. */
  const support = vars['SUPPORT_ADDRESS'] ?? '';
  assert.equal(SUPPORT_EMAIL, support, `production's SUPPORT_ADDRESS is "${support}", and SUPPORT_EMAIL in src/lib/links.ts is "${SUPPORT_EMAIL}"`);
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
  /* Production's `AGE_RECIPIENT` became a real `age1` key on
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
