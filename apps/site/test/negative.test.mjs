/**
 * EVERY RULE THAT READS THE BUILT SITE, SEEN TO FAIL. LCH-B01.
 *
 *   node --test apps/site/test/negative.test.mjs
 *
 * A rule that has never failed may not work: a regular expression that matches nothing passes on every page. So
 * each rule here is run, by its own test name and in its own file, against a small site with one fault seeded in
 * it, and must fail with its own sentence. `tools/gates/negative/` does the same for the gates.
 *
 * THE SEEDS ARE A CLEAN SITE AND ONE FILE EACH. `negative/clean/` holds a home page and one page that stands in for
 * every other page the tests require. A seed folder holds only the file it changes, laid over a copy of the clean
 * site. The clean site is run through every rule too and must pass, so a seed fails for its fault and not because
 * the stand-in site is broken.
 *
 * THE RUNS ARE STRICT. Each is run with `SITE_BUILT=1`, as `ci.yml`'s build job runs the real ones, so a stand-in
 * site missing a page the tests require is red with the page's name rather than a row of skips that pass. And one
 * more run proves the flag itself: an empty folder skips without it and fails with it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LAUNCH } from '../src/lib/launch.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SEEDS = join(HERE, 'negative');

/**
 * The pages `content.test.ts` and `slash.test.ts` require. Each is the clean stand-in page but the home page. No
 * packs: they are held with the changelog until the site is public (batch 103).
 */
const PAGES = ['slash', 'agents', 'pricing', 'download', 'docs', 'changelog', 'support', 'security', 'legal', '404'];

/** The home page's shape, as `content.test.ts` holds it from 20 October: the hero with the desk, six bands, no picture. */
const HOME = 'the home page opens on the hero with the desk, then its six bands in order, and holds no picture';
const REPO = 'every page links /legal, and links the repository only when LAUNCH.repo';

/** Each rule: its seed, its file, its test's name, and what its failure says. */
const RULES = [
  { seed: 'img', file: 'content.test.ts', name: HOME, says: /draws a photograph again/ },
  { seed: 'no-desk', file: 'content.test.ts', name: HOME, says: /the hero of index\.html does not hold the desk/ },
  { seed: 'fifth-card', file: 'content.test.ts', name: HOME, says: /index\.html draws 8 bands/ },
  /* A planted link to the private repository, while it is private. Once `LAUNCH.repo` is on the rule asks for the
     link instead, and this seed would be the clean site's shape, so it stands down with the flag. */
  ...(LAUNCH.repo ? [] : [{ seed: 'repo-link', file: 'content.test.ts', name: REPO, says: /support\.html links the repository, and LAUNCH\.repo is off/ }]),
  { seed: 'em-dash', file: 'content.test.ts', name: 'no em dash reaches the reader', says: /pricing\.html shows 1 em dash/ },
  { seed: 'dead-link', file: 'content.test.ts', name: 'every href goes somewhere', says: /href="\/nowhere", and build\/ holds none/ },
  {
    seed: 'spark',
    file: 'slash.test.ts',
    name: 'no page this site serves names Spark outside the entry announcing the rename',
    says: /agents\.html still names Spark/,
  },
];

/** The clean site in a folder of its own, with a seed's files laid over it when one is named. */
function site(seed) {
  const dir = mkdtempSync(join(tmpdir(), 'site-negative-'));
  cpSync(join(SEEDS, 'clean', 'index.html'), join(dir, 'index.html'));
  for (const page of PAGES) cpSync(join(SEEDS, 'clean', 'page.html'), join(dir, `${page}.html`));
  if (seed) for (const name of readdirSync(join(SEEDS, seed))) cpSync(join(SEEDS, seed, name), join(dir, name));
  return dir;
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * One test file, run by `node --test` in a child of its own over `dir`, its output as TAP. `NODE_TEST_CONTEXT` is
 * dropped, because a child that inherits it reports to this runner in its private format and prints nothing.
 */
function run(file, dir, { name, strict = true } = {}) {
  const env = { ...process.env, SITE_BUILD_DIR: dir };
  delete env.NODE_TEST_CONTEXT;
  delete env.SITE_BUILT;
  if (strict) env.SITE_BUILT = '1';
  const args = ['--test', '--test-reporter=tap'];
  if (name) args.push(`--test-name-pattern=^${escape(name)}$`);
  const out = spawnSync(process.execPath, [...args, join(HERE, file)], { cwd: join(HERE, '..'), env, encoding: 'utf8' });
  return { code: out.status, text: `${out.stdout}\n${out.stderr}` };
}

for (const rule of RULES) {
  test(`the rule "${rule.name}" fails on the ${rule.seed} seed with its own sentence`, () => {
    const dir = site(rule.seed);
    try {
      const { code, text } = run(rule.file, dir, { name: rule.name });
      assert.notEqual(code, 0, `${rule.file} passed on the ${rule.seed} seed:\n${text}`);
      assert.match(text, new RegExp(`^not ok \\d+ - ${escape(rule.name)}$`, 'm'), `the rule itself did not fail:\n${text}`);
      assert.match(text, rule.says, `the rule failed for another reason than the ${rule.seed} seed:\n${text}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('every seeded rule passes on the clean site, so each seed fails for its fault', () => {
  const dir = site(null);
  try {
    for (const { file, name } of new Map(RULES.map((rule) => [rule.name, rule])).values()) {
      const { code, text } = run(file, dir, { name });
      assert.equal(code, 0, `"${name}" fails on the clean site, so its seed proves nothing:\n${text}`);
      assert.match(text, new RegExp(`^ok \\d+ - ${escape(name)}$`, 'm'), `"${name}" did not run on the clean site:\n${text}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a missing build skips at a desk and fails under SITE_BUILT=1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'site-empty-'));
  try {
    const desk = run('slash.test.ts', dir, { strict: false });
    assert.equal(desk.code, 0, `with no build and no flag, slash.test.ts did not pass with skips:\n${desk.text}`);
    assert.match(desk.text, /# SKIP .*is missing index\.html/, `with no build and no flag, nothing said why it skipped:\n${desk.text}`);

    const ci = run('slash.test.ts', dir);
    assert.notEqual(ci.code, 0, `with no build under SITE_BUILT=1, slash.test.ts passed:\n${ci.text}`);
    assert.match(ci.text, /SITE_BUILT=1 says the site was just built, and .* is missing index\.html/);
    assert.doesNotMatch(ci.text, /# SKIP/, `under SITE_BUILT=1 a test still skipped:\n${ci.text}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
