/**
 * `self-test`'s browser negatives, asked of a build that is there and older than the code.
 *
 *   node --test "tools/gates/test/*.test.mjs"
 *
 * THE SAME BLIND SPOT `needs-fresh.test.mjs` CLOSED IN THE RUNNER, ONE FILE OVER. `seededBrowser`
 * decided whether to run the five browser negatives with `existsSync(apps/web/build)`, so a build
 * older than the source was handed to `layout`, `a11y`, `prefs`, `keys` and `queue` with a violation
 * seeded into it. A negative run against a version of the app that is no longer the source proves
 * nothing about the gate as it stands: a fixture the old build predates goes red for the wrong
 * reason, and a rule fixed since the build goes green against code that has already changed.
 *
 * A COPIED TREE, FOR THE REASON `needs.test.mjs` GIVES. `self-test.mjs` takes the root from its own
 * location, so the one condition worth testing is reached by copying this directory into a temporary
 * root. The five browser gates are replaced by stubs that print a marker and exit 1, so the marker in
 * the output means `self-test` judged the build good enough to seed a violation into, and no browser
 * is ever launched. The fixture cases fail for want of their `negative/` trees, which is the point:
 * this asserts on the browser lines only, and the run's exit code is not what is under test.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const gates = join(import.meta.dirname, '..');

const RAN = 'THE STUB BROWSER GATE RAN';
const BROWSER = ['layout', 'a11y', 'prefs', 'keys', 'queue'];

/* TWO MOMENTS AN HOUR APART, SET EXPLICITLY, for the reason `needs-fresh.test.mjs` gives: trusting
   the clock would make "newer" a matter of timestamp resolution, which is two seconds on some
   volumes. */
const EARLIER = new Date('2026-09-22T09:00:00Z');
const LATER = new Date('2026-09-22T10:00:00Z');

function put(at, body, when) {
  mkdirSync(join(at, '..'), { recursive: true });
  writeFileSync(at, body);
  if (when) utimesSync(at, when, when);
}

/** A root with this directory copied in, stub browser gates, and a build and a source at the given times. */
function tree({ built, edited }) {
  const root = mkdtempSync(join(tmpdir(), 'braindog-selftest-fresh-'));
  const to = join(root, 'tools', 'gates');
  mkdirSync(join(to, 'negative'), { recursive: true });
  for (const name of readdirSync(gates))
    if (name.endsWith('.mjs') || name === 'budgets.json') cpSync(join(gates, name), join(to, name));
  for (const gate of BROWSER) writeFileSync(join(to, `${gate}.mjs`), `console.log('${RAN}');\nprocess.exitCode = 1;\n`);
  /* `noSilentPass` reads the one registered gate outside this directory, and a missing file would
     end the run with a stack trace after the lines this test reads, which is noise and not a result. */
  put(join(root, 'packages', 'skin', 'scripts', 'theme.mjs'), 'export {};\n');
  if (edited) put(join(root, 'apps', 'web', 'src', 'lib', 'Thing.svelte'), '<p>edited</p>\n', edited);
  if (built) {
    const dir = join(root, 'apps', 'web', 'build');
    put(join(dir, 'index.html'), '<!doctype html>\n', built);
    utimesSync(dir, built, built);
  }
  return root;
}

function run(root) {
  const r = spawnSync(process.execPath, [join(root, 'tools', 'gates', 'self-test.mjs')], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, BRAINDOG_GATE_SEED: '' },
  });
  rmSync(root, { recursive: true, force: true });
  return `${r.stdout}${r.stderr}`;
}

test('a build older than a source file is treated as absent, and the line names the file', () => {
  const out = run(tree({ built: EARLIER, edited: LATER }));
  assert.ok(!out.includes(RAN), `a browser negative was seeded into a build older than the source:\n${out}`);
  for (const gate of BROWSER)
    assert.match(out, new RegExp(`${gate}: .*Thing\\.svelte.*its negative is not run`, 'u'), `${gate} did not say why:\n${out}`);
});

test('a build newer than every source file runs the browser negatives', () => {
  const out = run(tree({ built: LATER, edited: EARLIER }));
  for (const gate of BROWSER) assert.ok(out.includes(`${gate}: went red but never named`), `${gate} was not run:\n${out}`);
});

test('no build at all still says so', () => {
  const out = run(tree({ built: null, edited: LATER }));
  assert.ok(!out.includes(RAN), `a browser negative ran with no build:\n${out}`);
  assert.match(out, /layout: there is no apps\/web\/build, so its negative is not run/u);
});
