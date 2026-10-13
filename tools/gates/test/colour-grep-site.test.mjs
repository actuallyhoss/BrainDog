/**
 * `colour-grep` and the site's shot tooling: what is let through there, and what still is not.
 *
 *   node --test tools/gates/test/colour-grep-site.test.mjs
 *
 * `apps/site/scripts` held seventeen literals the gate reported on every run, so a real one in the app did not stand
 * out. Three things are let through, each by NAME: the shot tooling's test file, the four lines of the contact sheet's
 * own stylesheet, and the one line of bounds the live site's colours are read against. Every tree here is planted in a
 * temporary folder, so each fault is the only one in its tree.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const gates = join(import.meta.dirname, '..');

const HEX = '#2563EB';
const TEST_FILE = `import assert from 'node:assert/strict';\nassert.equal(hex('rgb(37, 99, 235)'), '${HEX}');\n`;
const SHEET = [
  'const page = `<style>',
  '  body { margin: 0; background: #F3F4F6; color: #101318; font: 15px/1.5 system-ui, sans-serif; }',
  '  section { background: #FFFFFF; border-radius: 16px; padding: 20px; }',
  '  img { display: block; border-radius: 8px; background: #F3F4F6; }',
  '  .red { color: #B3322C; }',
  '</style>`;',
  '',
].join('\n');
const BOUNDS = '{\n  "heights": { "/": 5658 },\n  "colours": ["#CF413A", "#B3322C", "#BB2C29", "#101318"],\n  "cookies": 0\n}\n';

function tree(t, files) {
  const at = mkdtempSync(join(tmpdir(), 'colour-grep-site-'));
  t.after(() => rmSync(at, { recursive: true, force: true }));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(at, rel)), { recursive: true });
    writeFileSync(join(at, rel), text);
  }
  return at;
}

function run(at) {
  const r = spawnSync(process.execPath, [join(gates, 'colour-grep.mjs'), at], { encoding: 'utf8' });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

/** The `file:line` of each finding, in the order the gate printed them. */
const found = (out) => out.split('\n').filter((l) => /^ {2}\S+:\d+$/u.test(l)).map((l) => l.trim()).sort();

test("a hex in the shot tooling's test file passes", (t) => {
  const r = run(tree(t, { 'apps/site/scripts/shots.test.mjs': TEST_FILE }));
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /colour-grep: 0 literals outside the theme/u);
});

test('the same hex in a component is red, and the gate names the file and the line', (t) => {
  const r = run(tree(t, {
    'apps/site/scripts/shots.test.mjs': TEST_FILE,
    'apps/web/src/lib/Tile.svelte': `<script>\n  const ink = '${HEX}';\n</script>\n<p style="color: ${HEX}">Late</p>\n`,
  }));
  assert.equal(r.status, 1, r.out);
  assert.deepEqual(found(r.out), ['apps/web/src/lib/Tile.svelte:2', 'apps/web/src/lib/Tile.svelte:4']);
  assert.match(r.out, /colour-grep: 2 colour literal\(s\)/u);
});

test('the test file is let through by its name, not by its folder or its ending', (t) => {
  const r = run(tree(t, {
    'apps/site/scripts/card.mjs': `export const ink = '${HEX}';\n`,
    'apps/site/scripts/card.test.mjs': TEST_FILE,
    'apps/site/src/lib/shots.test.mjs': TEST_FILE,
    'apps/web/src/lib/tile.test.mjs': TEST_FILE,
  }));
  assert.equal(r.status, 1, r.out);
  assert.deepEqual(found(r.out), [
    'apps/site/scripts/card.mjs:1',
    'apps/site/scripts/card.test.mjs:2',
    'apps/site/src/lib/shots.test.mjs:2',
    'apps/web/src/lib/tile.test.mjs:2',
  ]);
});

test("the contact sheet's four lines and the bounds' one line pass where they live", (t) => {
  const r = run(tree(t, { 'apps/site/scripts/shot.mjs': SHEET, 'apps/site/scripts/live-bounds.json': BOUNDS }));
  assert.equal(r.status, 0, r.out);
});

test('a fifth colour in the contact sheet, or a colour elsewhere in the script, is red', (t) => {
  const more = SHEET.replace('</style>', '  h1 { color: #CF413A; }\n</style>') + `const accent = '${HEX}';\n`;
  const r = run(tree(t, { 'apps/site/scripts/shot.mjs': more }));
  assert.equal(r.status, 1, r.out);
  assert.deepEqual(found(r.out), ['apps/site/scripts/shot.mjs:6', 'apps/site/scripts/shot.mjs:8']);
});

test('the same lines in any other file are red: the lines are named with their file', (t) => {
  const r = run(tree(t, { 'apps/site/src/routes/sheet.mjs': SHEET, 'apps/site/src/lib/bounds.json': BOUNDS }));
  assert.equal(r.status, 1, r.out);
  assert.deepEqual(found(r.out), [
    'apps/site/src/lib/bounds.json:3',
    'apps/site/src/routes/sheet.mjs:2',
    'apps/site/src/routes/sheet.mjs:3',
    'apps/site/src/routes/sheet.mjs:4',
    'apps/site/src/routes/sheet.mjs:5',
  ]);
});

test('a colour outside the list of bounds in the bounds file is red', (t) => {
  const r = run(tree(t, { 'apps/site/scripts/live-bounds.json': BOUNDS.replace('"cookies": 0', `"ink": "${HEX}"`) }));
  assert.equal(r.status, 1, r.out);
  assert.deepEqual(found(r.out), ['apps/site/scripts/live-bounds.json:4']);
});
