/**
 * `public-clean`: each of its four parts goes red on its own fault and stays green on a tree without one.
 *
 *   node --test tools/gates/test/public-clean.test.mjs
 *
 * THE PRIVATE WORDS ARE PLANTED HERE AT RUN TIME, in a temporary tree, from the gate's own `WORDS`: a test that spelled
 * them would be a hit of the rule it tests. The committed negative (`negative/public-clean/`) seeds part (b) for that
 * reason, and this file runs it too.
 *
 * NO RUN HERE READS THE OWNER'S PRIVATE LIST. Each spawn points `BRAINDOG_PRIVATE_TERMS` at a file of the test's own, or
 * at none, so the answer is the same on his machine and in CI.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import publicClean, { ALLOWED, ALLOWED_SPELLING, FROZEN, WORDS, licenceFindings, readmeFindings, filesOf, textOf } from '../public-clean.mjs';

/* AND NO CALL IN THIS PROCESS READS IT EITHER: `publicClean` called here reads the list from the same variable. */
process.env.BRAINDOG_PRIVATE_TERMS = join(tmpdir(), 'braindog-no-such-private-list.txt');

const gates = join(import.meta.dirname, '..');
const root = join(gates, '..', '..');
const planted = join(gates, 'negative', 'public-clean');

/** The gate over `at`, with a private list of the test's own or none. */
function run(at, terms = join(tmpdir(), 'braindog-no-such-private-list.txt')) {
  const r = spawnSync(process.execPath, [join(gates, 'public-clean.mjs')], {
    encoding: 'utf8',
    env: { ...process.env, BRAINDOG_GATE_ROOT: at, BRAINDOG_PRIVATE_TERMS: terms },
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

/** A clean tree: the planted one less its changelog, plus whatever `files` adds. */
function tree(t, files = {}, drop = ['CHANGELOG.md']) {
  const at = mkdtempSync(join(tmpdir(), 'public-clean-'));
  t.after(() => rmSync(at, { recursive: true, force: true }));
  cpSync(planted, at, { recursive: true });
  for (const f of ['expect.txt', ...drop]) rmSync(join(at, f), { force: true });
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(at, rel)), { recursive: true });
    writeFileSync(join(at, rel), text);
  }
  return at;
}

/** A finding is a path, a line number where it has one, two spaces, and why: the summary and the advice under it are not. */
const findings = (out) => out.split('\n').filter((l) => /^ {2}(?!public-clean:)[^\s:]+(?::\d+)? {2}\S/u.test(l));

test('the planted tree is red on its changelog, and on nothing else', () => {
  const r = run(planted);
  assert.equal(r.status, 1, r.out);
  assert.deepEqual(findings(r.out), ["  CHANGELOG.md  is a changelog at the root, and the changelog is the site's"]);
});

test('the same tree without the changelog is green', (t) => {
  const r = run(tree(t));
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /0 finding\(s\)/u);
});

test('(a) each word is found in any case, on its line, and the account name is not', (t) => {
  const [first, second, third] = WORDS;
  const at = tree(t, {
    'src/a.ts': `const a = 1;\nconst who = '${first.toUpperCase()}';\n`,
    'src/b.md': `Built for ${second[0].toUpperCase()}${second.slice(1)}.\n`,
    'src/c.json': `{ "site": "${third}.example" }\n`,
    'src/d.md': `github.com/${ALLOWED_SPELLING}/braindog\n`,
    [`notes/${second}-plan.txt`]: 'nothing inside\n',
  });
  const r = run(at);
  assert.equal(r.status, 1, r.out);
  const lines = findings(r.out).map((l) => l.trim().split('  ')[0]);
  assert.deepEqual(lines.sort(), ['src/a.ts:2', 'src/b.md:1', 'src/c.json:1', `notes/${second}-plan.txt:0`].sort());
});

test('(a) a binary file is not read', (t) => {
  const at = tree(t, { 'img.bin': Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(WORDS[1])]) });
  assert.equal(run(at).status, 0);
});

test('(a) the allowance: at or under its number is green, over it is red, under it says so', (t) => {
  const at = tree(t, { 'x.ts': `// ${WORDS[0]}\n// ${WORDS[1]}\n` });
  t.mock.method(console, 'log', () => {});
  const said = [];
  t.mock.method(console, 'error', (l) => said.push(l));
  assert.equal(publicClean(at, { 'x.ts': 2 }), undefined);
  assert.equal(publicClean(at, { 'x.ts': 3 }), undefined);
  assert.equal(publicClean(at, { 'x.ts': 1 }), 1);
  assert.equal(publicClean(at, {}), 1);
  assert.ok(said.some((l) => l.includes('x.ts:2')));
});

test('(a) a file named like a key every object carries is not allowed by it', (t) => {
  const at = tree(t, { constructor: `// ${WORDS[2]}\n` });
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  assert.equal(publicClean(at, {}), 1);
});

test('(b) a licence that lost its holder, a missing one, and a NOTICE at the root are each red; a deep NOTICE is not', (t) => {
  const at = tree(t, { LICENSE: 'Apache License\nVersion 2.0, January 2004\n', NOTICE: 'x\n', 'packages/render/src/glyphs/NOTICE': 'x\n' });
  rmSync(join(at, 'packages/render/LICENSE'));
  const r = run(at);
  assert.equal(r.status, 1, r.out);
  const said = findings(r.out).map((l) => l.trim());
  assert.equal(said.length, 3, r.out);
  assert.ok(said.some((l) => l.startsWith('LICENSE  does not name Quartz Apps LLC')));
  assert.ok(said.some((l) => l.startsWith('packages/render/LICENSE  is missing')));
  assert.ok(said.some((l) => l.startsWith('NOTICE  is a NOTICE at the root')));
});

test('(c) a badge, a price and a Licence section that names one licence are each red; the banner is not', () => {
  const said = (text) => readmeFindings(text).map((f) => `${f.line} ${f.why}`);
  const licence = '## Licence\n\nApache License 2.0, and MIT for one package.\n';
  assert.deepEqual(said(`<img src=".github/media/banner-light.svg" alt="x">\n\n${licence}`), []);
  assert.match(said(`[![ci](https://img.shields.io/badge/ci-green.svg)](x)\n\n${licence}`).join(), /^1 shows an image that is not the banner/u);
  assert.match(said(`Pro is $12 a month.\n\n${licence}`).join(), /^1 prints a price/u);
  assert.deepEqual(said('Ten seats, 40 USD.\n\n## Licence\n\nApache only.\n').map((l) => l.split(',')[0]).sort(), [
    '1 prints a price',
    '3 has a Licence section that does not name MIT',
  ]);
  assert.match(said('# Nothing about licences\n').join(), /has no Licence section/u);
  assert.deepEqual(said(`Run \`$ pnpm install\`.\n\n${licence}`), [], 'a shell prompt is not a price');
});

test('(d) a private term is found whole, printed by its line in the list and never itself', (t) => {
  const at = tree(t, { 'bank.test.ts': "const tail = '4417';\nconst hash = 'ab4417cd';\nconst who = 'Quillon Ashby';\n" });
  const list = join(at, '..', `terms-${process.pid}.txt`);
  t.after(() => rmSync(list, { force: true }));
  writeFileSync(list, '# the owner\'s list\n\n4417\nquillon ashby\n');
  const r = run(at, list);
  assert.equal(r.status, 1, r.out);
  assert.deepEqual(findings(r.out).map((l) => l.trim()), [
    'bank.test.ts:1  holds a term from the private list (its line 3)',
    'bank.test.ts:3  holds a term from the private list (its line 4)',
  ]);
  assert.doesNotMatch(r.out, /4417|quillon/iu);
});

test('(d) a frozen file: at or under its number is green, over it is red, under it says so, and a planted tree has none', (t) => {
  const at = tree(t, { 'old.pack.json': '"card 4417"\n"card 4417 again"\n' });
  const list = join(at, '..', `frozen-${process.pid}.txt`);
  t.after(() => rmSync(list, { force: true }));
  writeFileSync(list, '4417\n');
  const was = process.env.BRAINDOG_PRIVATE_TERMS;
  process.env.BRAINDOG_PRIVATE_TERMS = list;
  t.after(() => (process.env.BRAINDOG_PRIVATE_TERMS = was));
  const logged = [];
  const said = [];
  t.mock.method(console, 'log', (l) => logged.push(l));
  t.mock.method(console, 'error', (l) => said.push(l));
  assert.equal(publicClean(at, {}, { 'old.pack.json': ['first', 'second'] }), undefined);
  assert.equal(publicClean(at, {}, { 'old.pack.json': ['first', 'second', 'third'] }), undefined);
  assert.ok(logged.some((l) => l.includes('old.pack.json: frozen with 3, now 2')));
  assert.equal(publicClean(at, {}, { 'old.pack.json': ['first'] }), 1);
  assert.equal(publicClean(at, {}), 1, 'a planted tree is read with nothing frozen');
  assert.ok(said.some((l) => l.includes('old.pack.json:2')));
});

test('(d) only published catalogue files are frozen, and each still holds what it is frozen with', () => {
  for (const [rel, lines] of Object.entries(FROZEN)) {
    assert.match(rel, /^apps\/web\/static\/catalogue\//u, `${rel} is not a published catalogue file`);
    assert.ok(lines.length > 0 && lines.every((l) => typeof l === 'string' && l !== ''), `${rel} says what it holds`);
    assert.notEqual(textOf(root, rel), null, `${rel} is gone; take it off FROZEN`);
  }
});

test('(b) and (c) hold on this repository as it is', () => {
  const files = filesOf(root);
  assert.ok(files && files.length > 0);
  assert.deepEqual(licenceFindings(files, (rel) => textOf(root, rel)), []);
  assert.deepEqual(readmeFindings(textOf(root, 'README.md')), []);
});

/**
 * THE LIST ONLY SHRINKS. The ceiling was the list as it was written (9 October): 99 files, 590 lines; 97 and 588 once
 * packages/mcp/src/index.ts named none; 81 and 382 once LCH-C11 job 3 swept packages/kernel/test; 62 and 204 once jobs
 * 4, 5 and 7 swept packages/record, packages/mcp and apps/cli's 19 files (batch 44); 43 and 148 once the kernel, mcp
 * and seed source left and two render and two page-live files went (batch 45); 1 and 6 once the web, the cli's source
 * and the render lint went (batch 46); 0 and 0 once the record's index named none (batch 47). The sweep is done, so a
 * ceiling above 0 now is a raise, and raising them is the one edit this test exists to make deliberate.
 */
test('the allowance never grows', () => {
  const files = Object.keys(ALLOWED);
  const lines = Object.values(ALLOWED).reduce((a, n) => a + n, 0);
  assert.ok(files.length <= 0, `ALLOWED holds ${files.length} files, over the ceiling of 0`);
  assert.ok(lines <= 0, `ALLOWED holds ${lines} lines, over the ceiling of 0`);
  assert.ok(Object.values(ALLOWED).every((n) => Number.isInteger(n) && n > 0), 'every entry is a count of one or more');
});

test('EVERY WORD IS A FINDING, the five added after a scrub found them back at the tip among them', (t) => {
  assert.ok(WORDS.length >= 8);
  for (const word of WORDS) {
    const at = tree(t, { 'x.ts': `// a line naming ${word.toUpperCase()} in passing\n` });
    assert.equal(run(at).status, 1, `a word of ${word.length} letters passed`);
  }
});
