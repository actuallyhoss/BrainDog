/**
 * `hygiene`: nothing local, private or generated is tracked, and `.gitignore` still keeps it out (WAY-B02).
 *
 *   node --test tools/gates/test/hygiene.test.mjs
 *
 * Each rule is asked once red and once green beside it, `.gitignore`'s guards are read by their text and never by
 * their line, the planted trees under `negative/hygiene-*` are each red on their one path, and this repository's own
 * `.gitignore` holds every guard.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { GUARDS, checkHygiene } from '../hygiene.mjs';

const gates = join(import.meta.dirname, '..');
const repo = join(gates, '..', '..');
const negatives = join(gates, 'negative');
const IGNORE = `${GUARDS.map(([line]) => line).join('\n')}\n`;
const GOOD = ['README.md', 'apps/web/static/_headers', 'apps/site/static/_headers', 'apps/site/static/_redirects', 'packages/kernel/src/index.ts', 'tools/gates/hygiene.mjs'];

test('a clean tree with every guard is green', () => {
  assert.deepEqual(checkHygiene(GOOD, IGNORE), []);
});

test('each tracked path that stays local is red, once, by its first rule', () => {
  const red = [
    'loop/DIRECTION.md',
    'loop/kit/hooks/pre-commit',
    '.claude/settings.json',
    'apps/web/.claude/notes.md',
    'CLAUDE.md',
    'packages/kernel/CLAUDE.local.md',
    'REPORT.md',
    'BUILD.md',
    'tools/gates/private-words.local.json',
    '.env',
    'apps/web/.env.production',
    'apps/web/.dev.vars',
    '_scratch.ts',
    'packages/kernel/src/__notes.md',
    'owner.brain',
    'fixtures/owner.brainl',
    'record.sqlite',
  ];
  for (const path of red) {
    const out = checkHygiene([...GOOD, path], IGNORE);
    assert.equal(out.length, 1, `${path}: ${out.join('\n')}`);
    assert.ok(out[0].includes(`  ${path}  is tracked`), out[0]);
  }
});

test('the paths that only look local are green', () => {
  const green = ['docs/REPORT.md', 'apps/site/src/routes/build/BUILD.md', 'packages/loop/index.ts', 'a/env.ts', 'brain.ts', 'x.local.jsonl', 'apps/web/static/_headers', 'packages/a_b.ts'];
  assert.deepEqual(checkHygiene([...GOOD, ...green], IGNORE), []);
});

test('the guards are read by their text: a comment above moves nothing, a line taken out is red', () => {
  assert.deepEqual(checkHygiene(GOOD, `# a note above every line\n\n${IGNORE.split('\n').reverse().join('\n')}`), []);
  for (const [line] of GUARDS) {
    const out = checkHygiene(GOOD, IGNORE.split('\n').filter((l) => l !== line).join('\n'));
    assert.equal(out.length, 1, line);
    assert.ok(out[0].includes(`no longer holds the line ${line},`), out[0]);
  }
  assert.match(checkHygiene(GOOD, null)[0], /\.gitignore {2}is missing/u);
});

test('this repository\'s .gitignore holds every guard', () => {
  const lines = new Set(readFileSync(join(repo, '.gitignore'), 'utf8').split('\n').map((l) => l.trim()));
  for (const [line] of GUARDS) assert.ok(lines.has(line), `.gitignore lost ${line}`);
});

test('every planted tree is red on its one path, by the count its case says', () => {
  const trees = readdirSync(negatives).filter((t) => t.startsWith('hygiene-'));
  assert.ok(trees.length >= 10, trees.join(', '));
  for (const tree of trees) {
    const at = join(negatives, tree);
    const c = JSON.parse(readFileSync(join(at, 'case.json'), 'utf8'));
    const seed = readFileSync(join(at, 'expect.txt'), 'utf8').trim();
    const r = spawnSync(process.execPath, [join(gates, 'hygiene.mjs')], { cwd: at, encoding: 'utf8', env: { ...process.env, BRAINDOG_GATE_ROOT: at } });
    const said = `${r.stdout}${r.stderr}`;
    assert.equal(r.status, c.skip ? 3 : 1, `${tree}: ${said}`);
    assert.match(said, new RegExp(c.expect, 'iu'), tree);
    assert.equal(said.split('\n').filter((l) => l.includes(seed)).length, c.findings, `${tree}: ${said}`);
  }
});
