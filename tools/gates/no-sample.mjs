/**
 * `no-sample`: nothing of the sample record is left in what ships ("also get rid of that whole sample record
 * stuff please").
 *
 *   node tools/gates/no-sample.mjs [root]
 *
 * ONLY WHAT `no-fixtures` DOES NOT COVER. That gate already refuses a shipped file that imports a fixture or the seed's
 * root, in every place that runs a record. Two things are left, and they are this gate's:
 *   - THE DEMO'S SETTING. The public demo read its record from a deployment variable, and the variable outlived it: a
 *     config or a source file that names it again is the demo on its way back. Outside tests, no tracked file names it
 *     (`DEMO`). Two tests name it rightly, to prove a deployment that still sets it opens nothing
 *     (`apps/worker/test/slash-demo.test.ts`, `apps/worker/scripts/smoke.test.mjs`).
 *   - THE FIXTURE IN THE BUNDLE. An import `no-fixtures` cannot see (through a barrel a test helper shares with the
 *     app, a glob, a copied table) still puts the sample's rows in front of a person. So the built web app is read for
 *     strings only the test fixture holds (`MARKERS`), and one found is the sample shipped.
 *
 * IT NEEDS THE BUILD, so the runner asks it in `--built`. The setting half needs nothing, and it is not split into a gate
 * of its own because one rule about one leftover is one gate (52 §5.1).
 *
 * A MARKER NOTHING HOLDS IS A CHECK OF NOTHING. In the workspace each marker must still be in a tracked file under
 * `apps/web/`, the fixture wherever it has moved; one that is not is a finding, so the list follows the fixture rather
 * than going quietly stale. Each was chosen on 9 October as a string in the fixture and in no other tracked file and
 * no built file: the seed's own strings ship on purpose (pack previews), so none of them is a marker.
 *
 * IT RETURNS 1 OR 3 AND FALLS OFF THE END FOR A PASS, which is what `self-test`'s `silent-pass` grep rests on.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { filesOf, isRepository, textOf } from './public-clean.mjs';

export const needs = ['web-build'];

/** The demo's deployment variable, put together so this file is not a hit of its own rule. */
export const DEMO = 'DEMO' + '_RECORD';

/** Strings only the test fixture (`apps/web/src/lib/record/fixtures/`) holds: in the bundle, the sample shipped. */
export const MARKERS = [
  'Font binaries bucket',
  'Marked Kerning pass, lowercase done',
  'Opened SG31, the Kiln licensing question',
  'Added 2 services from the Fenwick invoice',
  'Object storage, from the Fenwick invoice',
  'kilnfonts.example moved to lapsing because auto-renew is off',
];

/** Where a web build is: the adapter's output, and the client build it was copied from. Each one there is read. */
export const BUNDLES = ['apps/web/build', 'apps/web/.svelte-kit/output/client'];

/** A test, or a file that only tests use: it may name the setting, to prove it opens nothing. */
export const isTest = (rel) => /\.test\.[cm]?[jt]s$/u.test(rel) || /(?:^|\/)tests?\//u.test(rel);

/** This file, which names the setting's parts to define the rule. */
const SELF = 'tools/gates/no-sample.mjs';

/** Every file under `dir`, repository-relative to `root`. */
function walk(root, dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(root, full, out);
    else out.push(relative(root, full).replace(/\\/g, '/'));
  }
  return out;
}

/** Each line of `text` that names the setting, by number. */
export function demoLines(text) {
  const re = new RegExp(`\\b${DEMO}\\b`, 'u');
  return text.split('\n').flatMap((l, i) => (re.test(l) ? [i + 1] : []));
}

/** The markers `text` holds. */
export const markersIn = (text) => MARKERS.filter((m) => text.includes(m));

/**
 * THE CHECK IS A FUNCTION, imported by `run.mjs` rather than spawned (`52 §5.1` step 3). Nothing here happens on
 * import. The root defaults to `BRAINDOG_GATE_ROOT`, which is how `self-test` aims a gate at its seeded tree.
 */
export default function noSample(
  root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'),
) {
  const ROOT = resolve(root);
  const files = filesOf(ROOT);
  /* A GATE THAT READ NOTHING HAS NOT PASSED. Exit 3 is "could not run". */
  if (files === null || files.length === 0) {
    console.log(`  no-sample: no file to read under ${ROOT}`);
    return 3;
  }
  const bundles = BUNDLES.filter((b) => existsSync(join(ROOT, b)));
  if (bundles.length === 0) {
    console.log(`  no-sample: no web build under ${ROOT} (${BUNDLES.join(' or ')}), so the bundle was not read`);
    return 3;
  }
  const findings = [];

  /* THE SETTING, in every tracked file but the tests and this one. A planted tree of another gate is not this tree. */
  const repository = isRepository(ROOT);
  for (const rel of files) {
    if (isTest(rel) || rel === SELF || (repository && rel.startsWith('tools/gates/negative/'))) continue;
    const text = textOf(ROOT, rel);
    if (text !== null)
      for (const line of demoLines(text))
        findings.push(`  ${rel}:${line}  names ${DEMO}, the setting of the demo that is gone; only a test may name it`);
  }

  /* THE BUNDLE. */
  let read = 0;
  for (const b of bundles)
    for (const rel of walk(ROOT, join(ROOT, b))) {
      const text = textOf(ROOT, rel);
      if (text === null) continue;
      read++;
      for (const m of markersIn(text)) findings.push(`  ${rel}  holds "${m}", a string of the test fixture, so the sample ships`);
    }

  /* AND EACH MARKER IS STILL THE FIXTURE'S, in the workspace, where the fixture is. */
  if (repository) {
    const held = new Set();
    for (const rel of files)
      if (rel.startsWith('apps/web/')) {
        const text = textOf(ROOT, rel);
        if (text !== null) for (const m of markersIn(text)) held.add(m);
      }
    for (const m of MARKERS)
      if (!held.has(m)) findings.push(`  ${SELF}  lists the marker "${m}", and no tracked file under apps/web holds it: pick another string of the fixture`);
  }

  const where = `${files.length} file(s) and ${read} built file(s) in ${bundles.join(' and ')}`;
  if (findings.length === 0) {
    console.log(`  no-sample: ${where}, 0 finding(s)`);
    return;
  }
  for (const f of findings) console.error(f);
  console.error(
    `\n  no-sample: ${where}, ${findings.length} finding(s).\n` +
      '  The sample is test data and nothing else: the demo setting stays out of every config and source file, and\n' +
      '  the built app holds none of the fixture. Find the import that carried it in, and move it beside the tests.',
  );
  return 1;
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns each gate at its seeded fixture. `?? 0` because a pass returns
   nothing. */
if (import.meta.main) process.exitCode = noSample(process.argv[2]) ?? 0;
