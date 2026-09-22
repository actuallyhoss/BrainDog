/**
 * The `web-build` prerequisite, asked of a build that is there and older than the code.
 *
 *   node --test "tools/gates/test/*.test.mjs"
 *
 * WHAT THIS IS FOR, AND IT COST AN HOUR ON 22 SEPTEMBER. `run.mjs` answered `web-build` with
 * `existsSync(apps/web/build)` and nothing else, so every gate that declares it was run against
 * whatever `build/` happened to hold. `layout` and `a11y` then reported nineteen findings about a
 * version of the app that was no longer the source, and every one of them was chased before anybody
 * looked at the build's date. `bundle` already knew how to prove a build is not this code and
 * skipped on it; the runner, which decides for six gates at once, did not.
 *
 * A COPIED TREE, FOR THE REASON `needs.test.mjs` GIVES. `run.mjs` takes the root from its own
 * location, so the one condition worth testing is reached by copying this directory into a
 * temporary root and writing the build and the source there with the times each case needs. `stack`
 * is replaced by a stub that declares `web-build` and prints a marker, so the marker in the output
 * means the runner judged the build good enough to run a gate against.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const gates = join(import.meta.dirname, '..');

const RAN = 'THE STUB GATE RAN';
const STUB = `export const needs = ['web-build'];\nconsole.log('  stack: ${RAN}');\n`;

/* TWO MOMENTS AN HOUR APART, SET EXPLICITLY. Writing the files in order and trusting the clock
   would make "newer" a matter of filesystem timestamp resolution, which on some volumes is two
   seconds and would make the stale case pass or fail by how fast the machine is. */
const EARLIER = new Date('2026-09-22T09:00:00Z');
const LATER = new Date('2026-09-22T10:00:00Z');
/* BETWEEN THE TWO, for the one case that needs a build strictly older than the source while the main
   build stays strictly newer. "Older" is a strict comparison, so a build stamped at the same moment
   as the source is not stale, and the `build-alpha/` case written with `EARLIER` for both passed
   against a runner that held every `build-*` directory against the prerequisite. */
const BETWEEN = new Date('2026-09-22T09:30:00Z');

/** Write a file, making its directory, and set the file's time. */
function put(at, body, when) {
  mkdirSync(join(at, '..'), { recursive: true });
  writeFileSync(at, body);
  utimesSync(at, when, when);
}

/**
 * A root with this directory copied in, a web build stamped `built`, and one source file stamped
 * `edited`. `variants` is a map of variant name to its build's stamp, and `script` is written as the
 * app's `build:variants` so the runner reads the variant list from where the build does.
 */
function tree({ built, edited, sourceAt = 'apps/web/src/lib/Thing.svelte', variants = {}, script = null }) {
  const root = mkdtempSync(join(tmpdir(), 'braindog-fresh-'));
  const to = join(root, 'tools', 'gates');
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(gates))
    if (name.endsWith('.mjs') || name === 'budgets.json') cpSync(join(gates, name), join(to, name));
  writeFileSync(join(to, 'stack.mjs'), STUB);
  if (edited) put(join(root, ...sourceAt.split('/')), '<p>edited</p>\n', edited);
  const stamp = (dir, when) => {
    put(join(dir, 'index.html'), '<!doctype html>\n', when);
    utimesSync(dir, when, when);
  };
  if (built) stamp(join(root, 'apps', 'web', 'build'), built);
  for (const [name, when] of Object.entries(variants)) stamp(join(root, 'apps', 'web', `build-${name}`), when);
  if (script !== null)
    writeFileSync(join(root, 'apps', 'web', 'package.json'), JSON.stringify({ scripts: { 'build:variants': script } }));
  return root;
}

function run(root) {
  const r = spawnSync(process.execPath, [join(root, 'tools', 'gates', 'run.mjs'), '--only', 'stack'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, CI: '' },
  });
  rmSync(root, { recursive: true, force: true });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

/* The variant line exactly as `apps/web/package.json` spells it, so the reader is tested on the
   real shape and not on a tidier one written for the test. */
const VARIANTS_SCRIPT =
  "node -e \"for (const v of ['cloud','quiet','busy']) { process.env.BRAINDOG_VARIANT=v; require('child_process').execSync('npx vite build',{stdio:'inherit'}); }\"";

test('a build older than a source file is not met, and the refusal names the file', () => {
  const { status, out } = run(tree({ built: EARLIER, edited: LATER }));
  assert.ok(!out.includes(RAN), `a gate was run against a build older than the source:\n${out}`);
  assert.match(out, /could not run: stack/u);
  assert.match(out, /Thing\.svelte/u, `the refusal did not say which file made the build stale:\n${out}`);
  assert.match(out, /pnpm --filter @braindog\/web build/u);
  assert.equal(status, 0);
});

test('a build newer than every source file is met and the gate runs', () => {
  const { status, out } = run(tree({ built: LATER, edited: EARLIER }));
  assert.ok(out.includes(RAN), `a fresh build was refused:\n${out}`);
  assert.match(out, /1 of 1 gates passed/u);
  assert.equal(status, 0);
});

/* `packages/*\/src` IS SOURCE TOO, which is the lesson `bundle` learned first: the app compiles eight
   workspace packages into its chunks, so a kernel edit makes the build exactly as stale as a route. */
test('a package source newer than the build makes it stale', () => {
  const { out } = run(tree({ built: EARLIER, edited: LATER, sourceAt: 'packages/kernel/src/index.ts' }));
  assert.ok(!out.includes(RAN), `a build older than a package's source was treated as current:\n${out}`);
  assert.match(out, /index\.ts/u);
});

/* AND A TEST IS NOT SOURCE, for the same reason `bundle` gives: nothing a test file says can move a
   byte of what the browser downloads, so demanding a rebuild for one is a stale verdict people
   learn to ignore. */
test('a colocated test newer than the build does not make it stale', () => {
  const { out } = run(tree({ built: EARLIER, edited: LATER, sourceAt: 'apps/web/src/lib/Thing.test.ts' }));
  assert.ok(out.includes(RAN), `a test file was counted as source:\n${out}`);
});

test('a variant the build writes that is older than the source is not met', () => {
  const { out } = run(tree({ built: LATER, edited: LATER, variants: { cloud: EARLIER }, script: VARIANTS_SCRIPT }));
  assert.ok(!out.includes(RAN), `a stale build-cloud was served to a gate that reads it:\n${out}`);
  assert.match(out, /build-cloud/u);
});

/* ABSENT IS NOT STALE. `layout` treats each variant as optional and says so when it is missing, so a
   tree with no `build-quiet/` is a tree where that gate covers less and says it, not one where the
   runner refuses the gate outright. */
test('a variant that is absent does not make a fresh build unmet', () => {
  const { out } = run(tree({ built: LATER, edited: EARLIER, variants: { cloud: LATER }, script: VARIANTS_SCRIPT }));
  assert.ok(out.includes(RAN), `an absent variant was treated as a stale one:\n${out}`);
});

/* AND A BUILD NOTHING IN `build` WRITES IS NOT ASKED ABOUT. `build-alpha/` is `BRAINDOG_ENV=alpha`,
   which `pnpm --filter @braindog/web build` never writes, so refusing over it would name a command
   that cannot fix what it refused. In this tree today it is five days older than the main build. */
test('a stale build the variants script does not write is not a reason to refuse', () => {
  const { out } = run(tree({ built: LATER, edited: BETWEEN, variants: { alpha: EARLIER }, script: VARIANTS_SCRIPT }));
  assert.ok(out.includes(RAN), `a build outside build:variants was held against the prerequisite:\n${out}`);
});

/* BUNDLE'S OWN VERDICT, UNCHANGED BY THE LIFT. The walk moved into `lib.mjs`; the gate still compares
   it against the manifest, still skips with exit 3, and still names the file relative to the app. */
test('bundle still skips a build older than the source, naming the file', async () => {
  const root = mkdtempSync(join(tmpdir(), 'braindog-bundle-fresh-'));
  try {
    put(join(root, 'apps', 'web', 'src', 'app.html'), '%sveltekit.head%\n%sveltekit.body%\n', EARLIER);
    put(join(root, 'apps', 'web', '.svelte-kit', 'output', 'client', '.vite', 'manifest.json'), '{}', EARLIER);
    put(join(root, 'apps', 'web', 'src', 'routes', 'page.ts'), 'export {};\n', LATER);
    const { default: bundle } = await import('../bundle.mjs');
    const said = [];
    const log = console.log;
    console.log = (line) => said.push(line);
    let status;
    try {
      status = await bundle(root);
    } finally {
      console.log = log;
    }
    assert.equal(status, 3);
    assert.match(said.join('\n'), /older than src\/routes\/page\.ts|older than src\\routes\\page\.ts/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
