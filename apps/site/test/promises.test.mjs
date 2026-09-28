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
 * THE THIRD TURNED OVER ON 25 SEPTEMBER. `loop/DIRECTION.md` §26 removed the sample and demo mode
 * together: the app only ever shows a real record, and without a session it is the sign-in screen
 * (`loop/research-no-sample.md`, brief A9 for this site). So the rule that required the site to name
 * the sample now refuses it, and the first screen has to say sign-in instead.
 *
 * THE GITHUB LINK STAYS, ON THE OWNER'S WORD, AND THIS FILE DOES NOT FIGHT IT. `loop/DIRECTION.md`
 * §10 records it verbatim: "link the github repo on the brain.dog site, even though it's private rn".
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
   serves at `/cli/install.sh` (`apps/cli/README.md`), which is published with the product (`loop/DIRECTION.md` §33). */
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
 * THE SITE DESCRIBES THE FINISHED PRODUCT (`loop/DIRECTION.md` §33, 26 September): "I want the marketing site to
 * reflect what the FINAL product would be, not where it would stand". The tests that held the opposite (that the
 * first screen say the app opens to sign-in, that no sentence offer what a stranger could not have yet, and that the
 * legal page call the repository private) went that day. This one keeps the old sentences from coming back: a page
 * that says a plan is not open, or that there is no way to sign up, is a page written for a day that has passed by
 * the time this copy is deployed.
 */
const NOT_YET = [
  /\bneither plan is open\b/i,
  /\bnot open yet\b/i,
  /\bno way to sign up\b/i,
  /\bsign-up is not open\b/i,
  /\bnothing is for sale\b/i,
  /\bthe repository is private\b/i,
];

test('no sentence says the product is not open yet', () => {
  const found = NOT_YET.flatMap((pattern) => SAID.filter(([, text]) => pattern.test(text)).map(([at, text]) => `${at}: ${text}`));
  assert.deepEqual(found, [], `${found.length} sentence(s) describe the product before launch:\n${found.join('\n')}`);
});
