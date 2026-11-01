/**
 * What the site promises a stranger, held to what a stranger can have today.
 *
 *   node --test --experimental-strip-types "apps/site/test/promises.test.mjs"
 *
 * MEASURED ON 22 SEPTEMBER, WITH NETWORK READS ONLY. `https://github.com/actuallyhoss/BrainDog`
 * answers 404 to anybody signed out, because the repository is private. `npm view` answers E404 for
 * `braindog`, `braindog-render`, `braindog-mcp`, `@braindog/mcp`, `@braindog/render` and
 * `@braindog/selfhost`: nothing this repository builds is on the registry. `POST /auth/provision`
 * answers 404 on both hosts until the owner sets `PROVISION_KEY` and binds `KEK`, so nobody can make
 * a record of their own. On that date what a stranger COULD have was the sample: `/api/boot` answered
 * 401 `UNAUTHORIZED`, `apps/web/src/lib/record/device.ts` counted that as no record, and the app drew
 * its built-in sample under a bar saying `This is a sample record.`
 *
 * SO THE SITE SAID THREE THINGS THAT WERE WRONG IN OPPOSITE DIRECTIONS. It offered a self-hosted
 * record as something an agent reaches today, which nobody outside this repository can install; it
 * called the product open source in the present tense while the code is private; and it told the
 * reader there was no demo and no record to look at, when the one thing the app did for a stranger
 * was show them one.
 *
 * THE THIRD TURNED OVER ON 25 SEPTEMBER. The owner removed the sample and demo mode
 * together: the app only ever shows a real record, and without a session it is the sign-in screen.
 * So the rule that required the site to name
 * the sample now refuses it, and the first screen has to say sign-in instead.
 *
 * THE GITHUB LINK STAYS, ON THE OWNER'S WORD, AND THIS FILE DOES NOT FIGHT IT: the brain.dog site
 * links the GitHub repository even while it is private.
 * What this file refuses is every OTHER address into the repository (a README, a build page, a
 * release), because those are the links that 404 with nothing beside them saying why, and it
 * requires the legal page to keep the sentence that says the repository is private.
 *
 * IT READS `src/` AND NOT `build/`, unlike `content.test.ts`, on purpose. An install command is a
 * string somebody types into `copy.ts` or a route, and this has to fail on the commit that types it,
 * without anybody having run a build first. Comments are stripped, because the comments in this app
 * quote the false sentences they replaced, and they are allowed to.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { SOURCE, DOCS, BUILD, LAUNCH, site } from '../src/lib/copy.ts';

const SRC = new URL('../src/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/** Every `.svelte` and `.ts` file under `src/`, as `[path, text]`. */
const files = (dir = SRC) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(svelte|ts)$/.test(name) ? [[relative(SRC, path).replaceAll('\\', '/'), readFileSync(path, 'utf8')]] : [];
  });

/**
 * THE FILE WITH ITS COMMENTS, ITS IMPORTS AND ITS STYLES TAKEN OUT. What is left is markup and code,
 * which is where anything a reader sees has to come from. The `//` rule skips a `//` after a colon so
 * that `https://` survives it.
 */
const spoken = (text) =>
  text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/^\s*import\s[^\n]*$/gm, '');

/** Every string in `site`, walked, so a sentence nobody renders yet is still checked. */
const strings = (value, at = 'site') => {
  if (typeof value === 'string') return [[at, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${at}[${i}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => strings(v, `${at}.${k}`));
  return [];
};

const SOURCES = files().map(([path, text]) => [path, spoken(text)]);
const SAID = strings(site);

/** Where a pattern matches, as `file: the line`, so a failure names the sentence and not only the file. */
const hits = (pattern) =>
  SOURCES.flatMap(([path, text]) =>
    text
      .split('\n')
      .filter((line) => pattern.test(line))
      .map((line) => `${path}: ${line.trim()}`),
  );

/**
 * AN INSTALL COMMAND IS A PROMISE THE REGISTRY ANSWERS, and today it answers 404 for every name this
 * repository could give. The day a package is published, the command that installs it is written
 * here with the `npm view` output that proves it in the comment beside it, and this list loses a line.
 */
const INSTALL = [
  /\bnpm\s+(i|install|add|exec|create|init)\b/,
  /\bnpx\s+\S/,
  /\bpnpm\s+(add|dlx|create|i|install)\b/,
  /\byarn\s+(add|dlx|create)\b/,
  /\bbunx?\s+(add|install|x)\b/,
  /\bgit\s+clone\b/,
  /\bdocker\s+(run|pull|compose)\b/,
  /\bcurl\b[^\n]*\|\s*(ba|z)?sh\b/,
  /\bnpmjs\.(com|org)\b/,
];

/* THE ONE INSTALL LINE THE SITE MAY SHOW IS ITS OWN: `CLI_INSTALL` in `copy.ts` fetches the script this site
   serves at `/cli/install.sh` (`apps/cli/README.md`), which is published with the product. */
const OWN_INSTALL = /https:\/\/brain\.dog\/cli\/install\.(sh|ps1)/;

/**
 * THE PACKAGES `LAUNCH` SAYS ARE ON NPM (`src/lib/launch.ts`), by the names their `package.json` gives them:
 * `apps/cli` is `braindog-cli` and `packages/render` is `braindog-render`. The day the owner flips `cli` or
 * `render`, a sentence naming that package and the command installing it may reach the reader, and not before.
 * Every other name stays refused whatever the flags say, because nothing else is published.
 */
const PUBLISHED = [LAUNCH.cli ? 'braindog-cli' : null, LAUNCH.render ? 'braindog-render' : null].filter((name) => name !== null);

/** The line with every published package name taken out, so what is left is what nobody can install. */
const unpublished = (line) => PUBLISHED.reduce((rest, name) => rest.replaceAll(name, ' '), line);

/** An install line is allowed when it is the site's own, or when it installs a package `LAUNCH` says is published. */
const installs = (line) => OWN_INSTALL.test(line) || PUBLISHED.some((name) => new RegExp(`\\b${name}\\b`).test(line));

test('no install command reaches the reader but the site’s own and the published packages’', () => {
  for (const pattern of INSTALL) {
    const found = hits(pattern).filter((line) => !installs(line));
    assert.deepEqual(found, [], `${pattern} matches ${found.length} line(s) under apps/site/src:\n${found.join('\n')}`);
  }
});

/**
 * A PACKAGE NAME IN A SENTENCE IS AN INSTALL COMMAND WITH THE VERB LEFT OFF. The workspace names are
 * fine in an import, which `spoken()` removes, and nowhere a reader sees them until `LAUNCH` says the
 * package is on npm.
 */
test('no unpublished package is named to the reader', () => {
  const PACKAGE = /@braindog\/[a-z]|\bbraindog-(render|mcp|cli|selfhost|kernel|record)\b/;
  const named = SAID.filter(([, text]) => PACKAGE.test(unpublished(text))).map(([at, text]) => `${at}: ${text}`);
  assert.deepEqual(named, [], `copy.ts names a package nobody can install:\n${named.join('\n')}`);
  const drawn = hits(PACKAGE).filter((line) => PACKAGE.test(unpublished(line)));
  assert.deepEqual(drawn, [], `a route or component names a package nobody can install:\n${drawn.join('\n')}`);
});

/**
 * THE ONE REPOSITORY ADDRESS IS THE BARE ONE, and only because the owner asked for it. A path inside
 * the repository (`/blob/...`, `/tree/...`, `/releases`, `#readme`) is a second link that 404s,
 * and it is exactly how the site came to carry seven dead links across four URLs before. `DOCS` and
 * `BUILD` stay off GitHub for the same reason until the repository is public.
 */
test('the only GitHub address is the bare repository the owner asked for', () => {
  assert.equal(SOURCE === null || /^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(SOURCE), true, `SOURCE is ${SOURCE}, which is a path inside the repository`);
  for (const [name, value] of [['DOCS', DOCS], ['BUILD', BUILD]]) {
    assert.equal(value !== null && /github\.com/.test(value), false, `${name} is ${value}, and the repository is private`);
  }
  const addresses = SOURCES.flatMap(([path, text]) =>
    [...text.matchAll(/https?:\/\/(www\.)?github\.com[^\s'"`)<>]*/g)].map((m) => [path, m[0]]),
  );
  const others = addresses.filter(([, url]) => url !== SOURCE).map(([path, url]) => `${path}: ${url}`);
  assert.deepEqual(others, [], `a GitHub address other than SOURCE (${SOURCE}):\n${others.join('\n')}`);
});

/**
 * THE SITE DESCRIBES THE FINISHED PRODUCT (since 26 September): the marketing site reflects what the
 * final product will be, not where it stands today. The tests that held the opposite (that the
 * first screen say the app opens to sign-in, that no sentence offer what a stranger could not have yet, and that the
 * legal page call the repository private) went that day. This one keeps the old sentences from coming back: a page
 * that says a plan is not open, or that there is no way to sign up, is a page written for a day that has passed by
 * the time this copy is deployed.
 */
/** A vague "soon": refused everywhere but the two lines `SOON` below allows. */
const COMING_SOON = /\bcoming soon\b/i;

const NOT_YET = [
  /\bneither plan is open\b/i,
  /\bnot open yet\b/i,
  /\bno way to sign up\b/i,
  /\bsign-up is not open\b/i,
  /\bnothing is for sale\b/i,
  /\bthe repository is private\b/i,
  /* SIGN-UP OPENED ON 8 OCTOBER, so a sentence that waits for launch or for sign-up to open is false
     the day it is read, and so is one that puts off a part with a vague "soon". `packs.ts` said "Anyone can start a
     record at launch." beside an open door until the copy was checked. */
  /\b(at|after|until|before) launch\b/i,
  /\bwhen the product launches\b/i,
  /\bsign[- ]?ups? opens\b/i,
  COMING_SOON,
  /\bnot yet\b/i,
  /* THE AUDIT'S NOT-YET CLAIMS (`src/lib/claims.ts`, marked `not-yet`). The repository stays private (the owner's choice), so
     no sentence says the code can be read or that the product is open source; the licence may still be named. */
  /\bthe code is open\b/i,
  /\bopen[- ]source\b/i,
  /\bread (the|our) code\b/i,
];

/**
 * THE TWO "COMING SOON"S THE OWNER ASKED FOR ("Extra use says 'coming soon' until a checkout sells it.
 * The paid buttons follow `LAUNCH.billing`."). Extra use is sold by no checkout, and the paid plans are not charged
 * while billing is off, so the pricing page says so in exactly two places: the extra-use section's own line and the
 * paid cards' word in their buttons' place. Each is allowed at its own path, as those exact words, and only while
 * `LAUNCH.billing` is false; anywhere else, in any other words, or with billing on, "coming soon" is refused as before.
 */
const SOON = {
  'site.pricing.extra.soon': 'Coming soon.',
  'site.pricing.cards.soon': 'Coming soon',
};

/**
 * HIS OWN WORDS FOR THE PAID PLANS (N2, 1 November): "coming soon, priced at launch". Said of Cloud and Cloud Plus, it
 * is a fact about a price nobody can pay yet, not a part of the product put off, so it passes both the "coming soon" and
 * the "at launch" patterns while billing is off, wherever it stands. With billing on it is refused like any other.
 */
const PRICED_AT_LAUNCH = /\bcoming soon,? (and )?(will be )?priced at launch\b/i;
const AT_LAUNCH = NOT_YET.find((p) => p.source.includes('launch\\b') && p.source.includes('at|after'));

/** Whether a sentence at a path is one of the allowed "coming soon"s, for a set of launch flags. */
const soonAllowed = (at, text, launch = LAUNCH) =>
  !launch.billing && ((Object.hasOwn(SOON, at) && SOON[at] === text) || PRICED_AT_LAUNCH.test(text));

/** Every sentence of `said` a NOT_YET pattern refuses, as `path: text`, for a set of launch flags. */
const notYet = (said, launch = LAUNCH) =>
  NOT_YET.flatMap((pattern) =>
    said
      .filter(
        ([at, text]) =>
          pattern.test(text) &&
          !(pattern === COMING_SOON && soonAllowed(at, text, launch)) &&
          !(pattern === AT_LAUNCH && !launch.billing && PRICED_AT_LAUNCH.test(text)),
      )
      .map(([at, text]) => `${at}: ${text}`),
  );

test('no sentence says the product is not open yet', () => {
  const found = notYet(SAID);
  assert.deepEqual(found, [], `${found.length} sentence(s) describe the product before launch:\n${found.join('\n')}`);
});

test('"Coming soon" is said only where the owner asked for it, and only while billing is off', () => {
  /* Both allowed lines are there, so the allowance is not a pass over nothing. */
  for (const [at, words] of Object.entries(SOON))
    assert.ok(SAID.some(([path, text]) => path === at && text === words), `${at} does not say "${words}"`);
  /* THE PLANTED FAULTS: the same words at another path, other words at an allowed path, and either with billing on. */
  assert.deepEqual(notYet([['site.home.plans.more', 'Coming soon']]), ['site.home.plans.more: Coming soon']);
  assert.ok(notYet([['site.pricing.extra.soon', 'Coming soon, after launch.']]).length > 0, 'other words at an allowed path pass');
  assert.deepEqual(notYet([['site.pricing.extra.say', 'Packs are coming soon.']]), ['site.pricing.extra.say: Packs are coming soon.']);
  const on = { ...LAUNCH, billing: true };
  assert.deepEqual(notYet([['site.pricing.cards.soon', 'Coming soon']], on), ['site.pricing.cards.soon: Coming soon']);
  /* HIS N2 PHRASE passes while billing is off and is refused once it is on; a launch put off in other words never passes. */
  assert.deepEqual(notYet([['site.meta.pricing.description', 'Cloud is coming soon, priced at launch.']], { ...LAUNCH, billing: false }), []);
  assert.ok(notYet([['site.meta.pricing.description', 'Cloud is coming soon, priced at launch.']], on).length > 0, 'the phrase passes with billing on');
  assert.ok(notYet([['site.home.free.say', 'Teams arrive after launch.']], { ...LAUNCH, billing: false }).length > 0, 'another launch sentence passes');
  /* AND THE REST STILL HOLDS: open source is refused while the repository is private. */
  if (!LAUNCH.repo) assert.deepEqual(notYet([['site.pricing.extra.soon', 'BrainDog is open source.']]), ['site.pricing.extra.soon: BrainDog is open source.']);
});

test('the self-host README names the repository to clone only once LAUNCH.repo is on', () => {
  /* THE CLONE LINE IS THE ONE ADDRESS THE README GAVE A STRANGER, and while the repository is private it answers 404.
     It comes back with the flag: a README that still starts from "your copy" once the repository is public fails here. */
  const readme = readFileSync(new URL('../../selfhost/README.md', import.meta.url), 'utf8');
  const clone = /git clone https:\/\/github\.com\/actuallyhoss\/BrainDog/u.test(readme);
  assert.equal(clone, LAUNCH.repo, LAUNCH.repo ? 'the README does not say how to clone the public repository' : 'the README tells people to clone a private repository');
});
