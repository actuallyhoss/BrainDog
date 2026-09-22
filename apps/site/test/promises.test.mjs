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
 * a record of their own. What a stranger CAN have is the sample: `https://app.brain.dog/api/boot`
 * answers 401 `UNAUTHORIZED`, `apps/web/src/lib/record/device.ts:143` counts that as no record, and
 * the app draws its built-in sample under the bar that says `This is a sample record.` The live
 * bundle carries that sentence.
 *
 * SO THE SITE SAID THREE THINGS THAT WERE WRONG IN OPPOSITE DIRECTIONS. It offered a self-hosted
 * record as something an agent reaches today, which nobody outside this repository can install; it
 * called the product open source in the present tense while the code is private; and it told the
 * reader there was no demo and no record to look at, when the one thing the app does for a stranger
 * is show them one. The old comments argued the last from `DEMO_RECORD` being empty, which is true
 * of the server and says nothing about the sample the browser draws for itself.
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

import { SOURCE, DOCS, BUILD, site } from '../src/lib/copy.ts';

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

test('no install command reaches the reader', () => {
  for (const pattern of INSTALL) {
    const found = hits(pattern);
    assert.deepEqual(found, [], `${pattern} matches ${found.length} line(s) under apps/site/src:\n${found.join('\n')}`);
  }
});

/**
 * A PACKAGE NAME IN A SENTENCE IS AN INSTALL COMMAND WITH THE VERB LEFT OFF. The workspace names are
 * fine in an import, which `spoken()` removes, and nowhere a reader sees them.
 */
test('no unpublished package is named to the reader', () => {
  const PACKAGE = /@braindog\/[a-z]|\bbraindog-(render|mcp|cli|selfhost|kernel|record)\b/;
  const named = SAID.filter(([, text]) => PACKAGE.test(text)).map(([at, text]) => `${at}: ${text}`);
  assert.deepEqual(named, [], `copy.ts names a package nobody can install:\n${named.join('\n')}`);
  const drawn = hits(PACKAGE);
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

test('while the repository is linked, the legal page says it is private', () => {
  if (SOURCE === null) return;
  assert.match(site.legal.licence.note, /private/, 'legal.licence.note no longer says the repository is private');
});

/**
 * THE SENTENCES THAT WERE FALSE ON 22 SEPTEMBER, each refused by the shape that made it false rather
 * than by its exact words, so a rewording that keeps the claim still fails.
 */
const FALSE_TODAY = [
  /* The app draws a sample for anybody signed out. */
  [/\bno demo\b|\bnothing to look at\b|\bno record to look at\b/i, 'says there is nothing to look at, and the app opens on a sample record'],
  /* Nobody outside this repository can install a self-host. */
  [/self-host[^.]*\btoday\b|\btoday\b[^.]*self-host/i, 'offers a self-hosted record today, and the self-hosted build is not published'],
  /* The code is private, so "open source" is a plan and not a state. */
  [/\bis open source\b|^Open source\./i, 'calls the code open source in the present tense, and the repository is private'],
  /* No record of one's own can be made until provisioning opens. */
  [/\brecord of your own (starts|begins|takes|is)\b/i, 'offers a record of your own in the present tense, and sign-up is not open'],
];

test('no sentence promises what a stranger cannot have today', () => {
  /* EVERY SHAPE IS ASKED BEFORE ANYTHING FAILS, so one run names every false sentence and not only
     the first. `SAID` finds a sentence in `copy.ts`; `hits` finds one typed into a route. */
  const found = FALSE_TODAY.flatMap(([pattern, why]) => [
    ...SAID.filter(([, text]) => pattern.test(text)).map(([at, text]) => `${why}. ${at}: ${text}`),
    ...hits(pattern)
      .filter((line) => !line.startsWith('lib/copy.ts:'))
      .map((line) => `${why}. ${line}`),
  ]);
  assert.deepEqual(found, [], `${found.length} sentence(s) promise what a stranger cannot have:\n${found.join('\n')}`);
});

/**
 * AND THE THING A STRANGER CAN HAVE IS SAID, on the first screen. Taking the false sentences out is
 * not enough on its own: a page that only lists what is closed reads as a product that is not there,
 * and the sample is there.
 */
test('the first screen says what a stranger can open today', () => {
  assert.match(site.hero.note, /\bsample\b/, 'hero.note does not say the app opens on a sample record');
});
