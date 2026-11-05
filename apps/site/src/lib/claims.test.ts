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

import { CLAIMS } from './claims.ts';
import { site } from './copy.ts';
import { slashPage } from './copy/slash.ts';
import { HELD, LAUNCH, held } from './launch.ts';
import { launchOrder, ownerMarkers } from './launch-order.ts';
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

/**
 * EVERY WORD THE SITE HOLDS: `site`, and the Slash page's own export, which that page imports directly and `copy.ts`
 * does not spread (batch 103). The ledger's paths and the scans below read this.
 */
const COPY = { ...site, slashPage } as const;

test('nav.ts names every page the site prerenders, so the header, the 404 and the sitemap do', () => {
  /* THE ROUTE DIRECTORIES ARE THE LIST, because `svelte.config.js` prerenders `*` and every one of
     these has no parameter. The 404's list and `/sitemap.xml` are both built from `nav.ts`'s
     `PAGES`, so a page missing there is missing from both. */
  const routes = new URL('src/routes/', SITE);
  const pages = [
    '/',
    ...readdirSync(routes, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== '404' && existsSync(new URL(`${d.name}/+page.svelte`, routes)) && !(held() && (HELD as readonly string[]).includes(`/${d.name}`)))
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
 * THE SITE'S LAUNCH FLAGS MIRROR THE WORKER'S VARS. Production's `SIGNUP` is sign-up's switch (`apps/worker/src/launch.ts`),
 * so `LAUNCH.signup` is on exactly when it is `open` or `invite`: either way a stranger who presses Start free reaches
 * sign-up, where an invited person signs up and anyone else applies. Since 17 October sign-up is invite only, a person
 * only learns that when they press sign up, and they can apply. So the site keeps Start free
 * and says nothing about invites, and the check below this one holds it to that. `BILLING` is billing's, so `LAUNCH.billing` is on exactly when it
 * is `live`. Before 8 October there was no `SIGNUP` and `LAUNCH.signup` read `BILLING`, so a host open to anybody and a
 * site that said it was closed passed together. A production config with no `SIGNUP` fails here, because then nothing
 * says who may sign up. The support address is the Worker's `SUPPORT_ADDRESS`, and `/support` shows `SUPPORT_EMAIL`, so
 * the two are one address or both empty. Each is read off the parsed config of production, because that is the
 * environment the site deployed to brain.dog describes.
 */
test("the launch flags and the support address match production's Worker vars", () => {
  const vars: { [key: string]: string } = wranglerConfig(fileURLToPath(REPO)).env?.['production']?.vars ?? {};
  const signup = vars['SIGNUP'];
  assert.ok(signup !== undefined, 'no SIGNUP in the production environment of apps/worker/wrangler.jsonc, so nothing says who may sign up');
  assert.equal(LAUNCH.signup, signup === 'open' || signup === 'invite', `production's SIGNUP is "${signup}", and LAUNCH.signup in src/lib/launch.ts is ${LAUNCH.signup}`);
  const billing = vars['BILLING'];
  assert.ok(billing !== undefined, 'no BILLING in the production environment of apps/worker/wrangler.jsonc, so nothing says whether cards are charged');
  assert.equal(LAUNCH.billing, billing === 'live', `production's BILLING is "${billing}", and LAUNCH.billing in src/lib/launch.ts is ${LAUNCH.billing}`);
  /* Absent reads as empty: the var is added the day the address routes to a person. */
  const support = vars['SUPPORT_ADDRESS'] ?? '';
  assert.equal(SUPPORT_EMAIL, support, `production's SUPPORT_ADDRESS is "${support}", and SUPPORT_EMAIL in src/lib/links.ts is "${SUPPORT_EMAIL}"`);
});

/**
 * THE SITE SAYS NOTHING ABOUT INVITES, AND SO NEVER THAT SIGN-UP IS OPEN TO EVERYONE. With production on `invite`, a
 * sentence like "anyone can sign up" is false the moment a stranger presses Start free and is asked for an invite or
 * an application. It is checked whatever `SIGNUP` says: if sign-up opens to all one day, the site still need not
 * say so, and a sentence planted now must not wait for that day.
 */
const OPEN_TO_ALL = /anyone can sign up|open to everyone|no invite|no waitlist/i;

test('while sign-up is by invite, no sentence on the site says it is open to everyone', () => {
  const said = LAUNCH.invite ? strings(COPY).filter((s) => OPEN_TO_ALL.test(s)) : [];
  assert.deepEqual(said, [], `the site says sign-up is open to everyone, and production may be invite only: ${said.join(' | ')}`);
  /* THE PLANTED FAULT, so the pattern is seen to catch each shape, whatever its case. */
  for (const planted of ['Anyone can sign up today.', 'BrainDog is OPEN TO EVERYONE.', 'No invite needed.', 'No waitlist, just start.'])
    assert.match(planted, OPEN_TO_ALL, planted);
});

/**
 * THE SITE'S WORD ON BACKUPS, HELD TO PRODUCTION'S SEALING KEY. Until batch 103 this read one cell, the pricing
 * table's Backups row; the table the owner designed on 17 October has no such row, and the copy that speaks of nightly
 * copies is the security page's. So it reads every sentence the site holds about backups or sealed copies, and holds
 * each to the key the way the cell was held. With no such sentence there is nothing to hold.
 */
const backupLines = (): string[] => strings(COPY).filter((s) => /\bbackups?\b|\bcop(y|ies)\b.*\bseal|\bseal.*\bcop(y|ies)\b/i.test(s));

test('no sentence promises backups while the sealing key is a placeholder', () => {
  /* `sealerOf` in `apps/worker/src/snapshots.ts` refuses a placeholder recipient before the walk
     starts, so with `age1<production-recipient>` no hosted copy is written at all. */
  const recipient = productionRecipient();
  assert.ok(recipient !== undefined, 'no AGE_RECIPIENT in the production environment of wrangler.jsonc');
  if (recipient.includes('<')) {
    for (const line of backupLines()) assert.match(line, /\byet\b/, `the key is ${recipient}, so no hosted copy is kept, and the site says "${line}"`);
  }
});

test('no sentence about backups still waits on a sealing key once production has one', () => {
  /* Production's `AGE_RECIPIENT` became a real `age1` key on
     54a16ffb (22 September, 20:12) and the cell went on saying "None yet ... once we set the key"
     for a day, because the check above only speaks while the value is a placeholder and was green
     either way. This is the other half: a real recipient means no sentence may wait on one, and an
     empty one, which `sealerOf` takes as a decision to keep unsealed copies, means none may say
     the copies are sealed. */
  const recipient = productionRecipient();
  assert.ok(recipient !== undefined, 'no AGE_RECIPIENT in the production environment of wrangler.jsonc');
  for (const line of backupLines()) {
    if (recipient !== '' && !recipient.includes('<')) {
      assert.doesNotMatch(line, /once we set|None yet/, `production seals to ${recipient.slice(0, 10)}..., and the site says "${line}"`);
    }
    if (recipient === '') assert.doesNotMatch(line, /seal/i, `production's AGE_RECIPIENT is empty, so its copies are unsealed, and the site says "${line}"`);
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

  const said = strings(COPY).filter((s) => NO_MODEL.test(s));
  if (modelled.length > 0) {
    assert.deepEqual(said, [], `a model is included in ${modelled.join(' and ')}, and the site says there is none: ${said.join(' | ')}`);
  }
});

/**
 * THE LEDGER OF CLAIMS (`claims.ts`) HELD TO THE COPY AND TO THE FLAGS. A claim is found by the path it names and its
 * own words, so a sentence reworded without its claim fails here; a claim on a flag names a flag `launch.ts` has; a
 * claim marked true on a flag fails the day the flag goes off, and one marked `flag` fails the day it goes on, so the
 * ledger never says a stale thing for long. A `not-yet` claim is checked across every string the site holds.
 */

/** The value at a dotted path into the copy, an array index as a number. */
const at = (path: string): unknown =>
  path.split('.').reduce<unknown>((v, key) => (v && typeof v === 'object' ? (v as { [k: string]: unknown })[key] : undefined), COPY);

test('every claim in the ledger is said where it says, in its own words', () => {
  const ids = new Set<string>();
  for (const claim of CLAIMS) {
    assert.ok(!ids.has(claim.id), `two claims are called ${claim.id}`);
    ids.add(claim.id);
    if (claim.state === 'not-yet' && !claim.soon) continue;
    const value = at(claim.where);
    assert.equal(typeof value, 'string', `${claim.id}: ${claim.where} is not a sentence`);
    assert.ok((value as string).includes(claim.said), `${claim.id}: ${claim.where} no longer says "${claim.said}"; it says "${value}"`);
  }
});

test('every claim on a flag names a flag launch.ts has, and agrees with it', () => {
  for (const claim of CLAIMS) {
    if (claim.state === 'flag') assert.ok(claim.flag !== undefined, `${claim.id} is marked flag and names none`);
    if (claim.flag === undefined) continue;
    assert.ok(Object.hasOwn(LAUNCH, claim.flag), `${claim.id} names the flag "${claim.flag}", and launch.ts has no such flag`);
    const on = LAUNCH[claim.flag];
    if (claim.state === 'true') assert.ok(on, `${claim.id} is marked true on ${claim.flag}, and LAUNCH.${claim.flag} is off`);
    if (claim.state === 'flag') assert.ok(!on, `${claim.id} waits on ${claim.flag}, and LAUNCH.${claim.flag} is on, so mark it true`);
    if (claim.state === 'not-yet') assert.ok(!on, `${claim.id} is not yet, and LAUNCH.${claim.flag} is on: check it and mark it again`);
  }
});

test('no sentence in the copy says a claim the ledger marks not yet', () => {
  const said = strings(COPY);
  /* A `soon` claim is said once, as not yet, at its own place: that one sentence is left out, and any other fails. */
  const found = CLAIMS.filter((c) => c.state === 'not-yet').flatMap((c) => {
    const own = c.soon ? at(c.where) : undefined;
    let excused = own === undefined ? 0 : 1;
    return said
      .filter((s) => s.toLowerCase().includes(c.said.toLowerCase()) && !(s === own && excused-- > 0))
      .map((s) => `${c.id}: "${s}"`);
  });
  assert.deepEqual(found, [], `${found.length} sentence(s) say what is not true yet:\n${found.join('\n')}`);
});

/**
 * THE ORDER OF LAUNCH: the legal pages go live before sign-up opens, a bot check is keyed before it does,
 * billing goes live only with both prices and a door a person can come through, and the legal pages only once their
 * texts hold no `[owner:` marker. `launchOrder` says every broken rule in a line.
 *
 * ON PLANTED CONFIGS ONLY. Production today is `SIGNUP: open` with `LAUNCH.legal` false and an empty site key, so the
 * same test on the real config would be red on master: whether it is asserted there is the owner's to rule. The first
 * case plants on a copy of production's own vars, so the rule is proven against the config it will one day read.
 */
test('the order of launch: sign-up open before the legal pages fails with the legal line', () => {
  const production: { [key: string]: string } = wranglerConfig(fileURLToPath(REPO)).env?.['production']?.vars ?? {};
  const planted = launchOrder({ ...production, SIGNUP: 'open' }, { legal: false });
  assert.ok(
    planted.some((line) => line.includes('Set LAUNCH.legal to true first, so /legal/<name> goes live before sign-up opens')),
    `a copy of production with SIGNUP open and LAUNCH.legal false was not refused for the legal pages: ${JSON.stringify(planted)}`,
  );
  assert.deepEqual(launchOrder({ SIGNUP: 'open', TURNSTILE_SITE_KEY: '0x-planted-site-key' }, { legal: false }), [
    'Sign-up is open before the legal pages are live. Set LAUNCH.legal to true first, so /legal/<name> goes live before sign-up opens.',
  ]);
});

test('the order of launch: a legal, keyed, open config passes, and so does one not yet open', () => {
  assert.deepEqual(launchOrder({ SIGNUP: 'open', TURNSTILE_SITE_KEY: '0x-planted-site-key', BILLING: 'off' }, { legal: true }, 0), []);
  for (const signup of [undefined, '', 'invite', 'closed'])
    assert.deepEqual(launchOrder({ ...(signup === undefined ? {} : { SIGNUP: signup }) }, { legal: false }), [], `SIGNUP ${String(signup)}`);
});

test('the order of launch: open with no site key, billing live short of a price or with sign-up closed, legal with markers', () => {
  assert.match(launchOrder({ SIGNUP: ' open ', TURNSTILE_SITE_KEY: '  ' }, { legal: true }).join('\n'), /no bot check\. Put TURNSTILE_SITE_KEY/);
  const short = launchOrder({ SIGNUP: 'invite', BILLING: 'live', STRIPE_PRICE_HOSTED: 'price_planted_one' }, { legal: false });
  assert.deepEqual(short, ['Billing is live without STRIPE_PRICE_PLUS. Set both prices before BILLING is live.']);
  const shut = launchOrder({ BILLING: 'live', STRIPE_PRICE_HOSTED: 'price_planted_one', STRIPE_PRICE_PLUS: 'price_planted_two' }, { legal: false });
  assert.deepEqual(shut, ['Billing is live while sign-up is closed, so nobody can reach a plan to pay for. Set SIGNUP to invite or open first.']);
  assert.equal(ownerMarkers(['Kept by [owner: a planted name].', 'Held in [owner: a place] for [owner: how long].', 'Finished.']), 3);
  assert.deepEqual(launchOrder({}, { legal: true }, 3), ['LAUNCH.legal is true while the legal texts still hold 3 [owner: markers. Finish them in apps/site/legal/ first.']);
  for (const line of [...short, ...shut, ...launchOrder({ SIGNUP: 'open' }, { legal: true }, 1)]) assert.ok(!line.includes('\u2014'), line);
});
