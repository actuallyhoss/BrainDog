/**
 * `board-yes`: a governed screen changes only with a board with a yes (EXP-A01 job 5).
 *
 *   node --test tools/gates/test/board-yes.test.mjs
 *
 * THE COMMITTED NEGATIVES PLANT ONE FAULT EACH (`negative/board-yes/`, a governed file edited after the yes, and
 * `negative/board-yes-drift/`, the board's own page edited after it). Here a board is planted in a folder of its own
 * and walked through its life: no yes and quiet, a yes taken and green, then each way the yes stops being true, each
 * red by itself, and green again once the yes names the new hashes.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { globRe, governedOf, imagesNamed, judge, sha256, standing } from '../board-yes.mjs';

const gates = join(import.meta.dirname, '..');

function run(at) {
  const r = spawnSync(process.execPath, [join(gates, 'board-yes.mjs')], { encoding: 'utf8', env: { ...process.env, BRAINDOG_GATE_ROOT: at } });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

const put = (root, f, text) => {
  mkdirSync(dirname(join(root, f)), { recursive: true });
  writeFileSync(join(root, f), text);
};
const json = (v) => `${JSON.stringify(v, null, 2)}\n`;
const IMAGES = Object.fromEntries([390, 1440, 1512, 1728].flatMap((w) => ['light', 'dark'].map((t) => [`candidate/p-${w}-${t}.png`, sha256(`${w} ${t}`)])));

/** A tree with one board, `frame`, governing `packages/skin/**`, and no yes. */
function planted() {
  const root = mkdtempSync(join(tmpdir(), 'board-yes-'));
  put(root, 'packages/skin/house.css', ':root { --tile: white; }\n');
  put(root, 'packages/other/x.css', 'ungoverned\n');
  put(root, 'design/boards/frame/paths.json', json(['packages/skin/**']));
  put(root, 'design/boards/frame/checks.json', json({ board: 'frame', screens: [], checks: [] }));
  put(root, 'design/boards/frame/page.dog', 'page: frame\n');
  return root;
}

/** A yes as `board.mjs --yes` writes it, from the board as it stands. */
const takeYes = (root, over = {}) => {
  const now = standing(root, 'frame');
  const yes = { board: 'frame', units: ['EXP-A01'], said: 'yes', taken: { on: '2026-10-08', from: 'the owner\'s word' }, seen: false, images: IMAGES, widths: [390, 1440, 1512, 1728], themes: ['light', 'dark'], commit: null, paths: now.paths, drawn: now.drawn, ...over };
  put(root, 'design/boards/frame/yes.json', json(yes));
};

test('a glob names files at any depth, one folder, or one file', () => {
  assert.ok(globRe('packages/skin/**').test('packages/skin/a/b.css'));
  assert.ok(globRe('packages/skin/').test('packages/skin/house.css'));
  assert.ok(globRe('apps/web/src/lib/*.svelte').test('apps/web/src/lib/Rail.svelte'));
  assert.ok(!globRe('apps/web/src/lib/*.svelte').test('apps/web/src/lib/ui/Rail.svelte'));
  assert.deepEqual(governedOf(['packages/skin/**'], ['packages/other/x.css', 'packages/skin/house.css']), ['packages/skin/house.css']);
  assert.equal(imagesNamed({ a: 'f'.repeat(64), b: 'not a hash' }), 1);
});

test('a root with no boards folder is skipped, and a board with no yes governs nothing', () => {
  const empty = mkdtempSync(join(tmpdir(), 'board-yes-'));
  const root = planted();
  try {
    assert.equal(run(empty).status, 3);
    const r = run(root);
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /1 board\(s\), 0 with a yes, governing 0 file\(s\), 0 finding\(s\)/u);
  } finally {
    rmSync(empty, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
});

test('a yes taken from the board as it stands is green, and each way it stops being true is red by itself', () => {
  const root = planted();
  try {
    takeYes(root);
    const green = run(root);
    assert.equal(green.status, 0, green.out);
    assert.match(green.out, /1 with a yes, governing 1 file\(s\), 0 finding\(s\)/u);

    put(root, 'packages/skin/house.css', ':root { --tile: glass; }\n');
    let found = judge(root, 'frame', ['packages/skin/house.css']).findings;
    assert.equal(found.length, 1);
    assert.match(found[0], /packages\/skin\/house\.css {2}changed since its yes/u);
    takeYes(root);
    assert.equal(run(root).status, 0);

    put(root, 'packages/skin/new.css', 'new\n');
    found = judge(root, 'frame', ['packages/skin/house.css', 'packages/skin/new.css']).findings;
    assert.deepEqual(found.length, 1);
    assert.match(found[0], /new\.css {2}is governed by it and its yes never named it/u);
    rmSync(join(root, 'packages/skin/new.css'));

    put(root, 'design/boards/frame/page.dog', 'page: frame\ntitle: Hero\n');
    found = judge(root, 'frame', ['packages/skin/house.css']).findings;
    assert.equal(found.length, 1);
    assert.match(found[0], /page\.dog {2}was edited after its yes/u);
    takeYes(root);

    put(root, 'design/boards/frame/skin.css', '.tile { box-shadow: none; }\n');
    assert.match(judge(root, 'frame', ['packages/skin/house.css']).findings.join('\n'), /skin\.css {2}was added after its yes/u);
    takeYes(root);

    rmSync(join(root, 'packages/skin/house.css'));
    assert.match(judge(root, 'frame', []).findings.join('\n'), /house\.css {2}is gone/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a yes with no words, too few pictures, or no board and units is red', () => {
  const root = planted();
  const files = ['packages/skin/house.css'];
  try {
    takeYes(root, { said: ' ' });
    assert.match(judge(root, 'frame', files).findings.join('\n'), /holds no words in said/u);
    takeYes(root, { images: Object.fromEntries(Object.entries(IMAGES).slice(0, 3)) });
    assert.match(judge(root, 'frame', files).findings.join('\n'), /names 3 image hash\(es\) for 4 width\(s\) and 2 theme\(s\)/u);
    takeYes(root, { units: undefined });
    assert.match(judge(root, 'frame', files).findings.join('\n'), /names no board or no list of units/u);
    takeYes(root, { seen: 'yes' });
    assert.match(judge(root, 'frame', files).findings.join('\n'), /seen is true once the pictures have been looked at/u);
    takeYes(root, { widths: [1440], images: Object.fromEntries(Object.entries(IMAGES).slice(0, 2)) });
    assert.match(judge(root, 'frame', files).findings.join('\n'), /was not taken at 390, 1512, 1728/u);
    put(root, 'design/boards/frame/yes.json', '{ not json');
    assert.match(judge(root, 'frame', files).findings.join('\n'), /does not read as JSON/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the gate reads hashes and never dates, and a yes not yet seen still holds its paths', () => {
  const root = planted();
  const files = ['packages/skin/house.css'];
  try {
    takeYes(root, { seen: false, taken: { on: '1999-01-01', from: 'a yes taken by default' } });
    assert.deepEqual(judge(root, 'frame', files).findings, []);
    put(root, 'packages/skin/house.css', ':root { --tile: glass; }\n');
    takeYes(root, { seen: false, taken: { on: '2099-12-31', from: 'a yes taken by default' }, paths: { 'packages/skin/house.css': sha256(':root { --tile: white; }\n') } });
    const found = judge(root, 'frame', files).findings;
    assert.equal(found.length, 1);
    assert.match(found[0], /house\.css {2}changed since its yes/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a board's own folder is never governed source, so a wide glob does not hold the yes against itself", () => {
  const root = planted();
  try {
    put(root, 'design/boards/frame/paths.json', json(['**']));
    takeYes(root);
    const now = standing(root, 'frame', ['packages/skin/house.css', 'packages/other/x.css', 'design/boards/frame/yes.json']);
    assert.deepEqual(Object.keys(now.paths), ['packages/other/x.css', 'packages/skin/house.css']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the two planted negatives are red for their one fault each', () => {
  const yes = run(join(gates, 'negative', 'board-yes'));
  assert.equal(yes.status, 1, yes.out);
  assert.match(yes.out, /packages\/skin\/board\.txt {2}changed since its yes/u);
  assert.match(yes.out, / 1 finding\(s\)/u);
  const drift = run(join(gates, 'negative', 'board-yes-drift'));
  assert.equal(drift.status, 1, drift.out);
  assert.match(drift.out, /design\/boards\/today\/page\.dog {2}was edited after its yes/u);
  assert.match(drift.out, / 1 finding\(s\)/u);
});
