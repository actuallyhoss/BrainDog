/**
 * The gates' own test. A gate that has never failed is a gate that may not work.
 *
 * THIS IS THE MECHANISM, AND IT WAS THE MISSING ONE. An audit of this directory found six gates
 * reporting `0 findings` because their predicate could never be true: the layout gate treated the
 * app's own scroll container as an exemption and therefore examined nothing at 273 page-runs; the
 * colour grep could not see the eight-digit hex or the `fill="#333"` its own header names as the
 * case it exists for; the CSS gate skipped `var()` uses inside custom properties, which is exactly
 * where a token typo lives; the stack gate did not know two of the five words the spec bans. Every
 * one of them printed green. `52 §9` had specified this file all along.
 *
 * HOW IT WORKS. `tools/gates/negative/<gate>/` holds one seeded violation — a minimal tree the gate
 * runs against with its root pointed at the fixture. Each gate must exit non-zero and name the
 * seeded file. A gate that passes its own negative is reported by name, and the run is red.
 *
 * WHY A FIXTURE TREE RATHER THAN A UNIT TEST. The thing under test is the gate as CI runs it —
 * its walk, its exemptions, its regexes and its exit code together. Four of the six failures above
 * were in the walk or the exemptions rather than in the pattern, and no unit test of the pattern
 * would have found them.
 *
 *   node tools/gates/self-test.mjs
 */

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { keyPaths } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const negatives = join(here, 'negative');

/**
 * Each gate, the fixture it runs against, and how to point it there.
 *
 * `cwd` IS THE HANDLE for the gates that walk `process.cwd()`; `argv` for those that take a root.
 * Nothing here monkey-patches a gate: a gate that needed a special mode to be testable would be a
 * gate whose tested behaviour is not the shipped one.
 */
const CASES = [
  { gate: 'clean-room', expect: /contains/, findings: 1 },
  { gate: 'colour-grep', run: 'colour-grep', expect: /colour literal/, findings: 1 },
  { gate: 'colour-grep-hex8', run: 'colour-grep', expect: /colour literal/, findings: 1 },
  { gate: 'colour-grep-oklch', run: 'colour-grep', expect: /colour literal/, findings: 1 },
  { gate: 'css-rules', expect: /findings/, findings: 1 },
  { gate: 'css-rules-ellipsis', run: 'css-rules', expect: /does nothing on a flex/, findings: 1 },
  { gate: 'stack', expect: /finding\(s\)/, findings: 1 },
  { gate: 'secret-grep', expect: /reaches a log/, findings: 1 },
  /* THREE, because a kind in one source and not the other three is three statements about the same
     drift — and which three is the repair. A count of one would pass a gate that compared two. */
  { gate: 'event-kinds', expect: /and migration 0001 does not/, findings: 3 },
  { gate: 'router-groups', expect: /INTERNAL is the host's own surface|puts it in INTERNAL/, findings: 2 },
  { gate: 'closed-lists', expect: /the migration admits/, findings: 1 },
  { gate: 'no-declarations-in-kernel', expect: /declaration written in the kernel/, findings: 1 },
];

/** How many lines of a gate's output name the seeded file. One per seeded violation. */
const named = (said, seeded) => said.split('\n').filter((l) => l.includes(seeded)).length;

const failed = [];

/**
 * The browser gate's negative, which cannot be a fixture tree.
 *
 * The thing under test is a real browser over a real build, and there is no smaller way to hold
 * that. `BRAINDOG_GATE_SEED` puts a 2000px heading inside `#main` — the exact bug the gate is named
 * after, and the one it could not see while it treated the app's own scroll container as an
 * exemption. Skipped when there is no build, like the gate itself.
 */
function seededLayout() {
  if (!existsSync(join(here, '..', '..', 'apps/web/build'))) {
    console.log('  layout: no build, so its negative is not run');
    return;
  }
  const r = spawnSync(process.execPath, [join(here, 'layout.mjs')], {
    cwd: join(here, '..', '..'),
    encoding: 'utf8',
    env: { ...process.env, BRAINDOG_GATE_SEED: '1' },
  });
  const said = `${r.stdout}${r.stderr}`;
  if (r.status === 0 || !said.includes('reaches 2000px')) {
    console.error('  layout: PASSED a 2000px heading inside #main — it is examining nothing.');
    failed.push('layout');
  } else {
    ran++;
    console.log('  layout: red on a 2000px heading inside #main');
  }
}

let ran = 0;

for (const { gate, expect, findings, run } of CASES) {
  const fixture = join(negatives, gate);
  if (!existsSync(fixture)) {
    console.error(`  ${gate}: no negative fixture at tools/gates/negative/${gate}/`);
    failed.push(gate);
    continue;
  }

  const r = spawnSync(process.execPath, [join(here, `${run ?? gate}.mjs`)], {
    cwd: fixture,
    encoding: 'utf8',
    env: { ...process.env, BRAINDOG_GATE_ROOT: fixture },
  });
  const said = `${r.stdout}${r.stderr}`;

  /* RED, AND ABOUT THE RIGHT THING. An exit code alone would be satisfied by a gate that crashed,
     which is a different failure wearing the same colour. */
  const seeded = readFileSync(join(fixture, 'expect.txt'), 'utf8').trim();
  if (r.status === 0) {
    console.error(`  ${gate}: PASSED its own seeded violation — it is checking nothing.`);
    failed.push(gate);
  } else if (!said.includes(seeded)) {
    console.error(`  ${gate}: went red but never named ${seeded}.`);
    console.error(said.split('\n').slice(0, 6).map((l) => `      ${l}`).join('\n'));
    failed.push(gate);
  } else if (!expect.test(said)) {
    console.error(`  ${gate}: went red with a sentence this test does not recognise.`);
    failed.push(gate);
  } else if (named(said, seeded) !== findings) {
    /* THE COUNT, NOT ONLY THE COLOUR. The colour-grep fixture used to carry three forms in one
       file and this only asserted that the gate went red — so reverting any two of the three
       fixes still left the third firing, and the negative could not tell which of them was doing
       the work. A fixture that proves "something here is caught" is not a fixture; it has to
       prove that THIS is caught, which means one violation per fixture and the count asserted. */
    console.error(`  ${gate}: named ${seeded} on ${named(said, seeded)} line(s), and the fixture seeds ${findings}.`);
    failed.push(gate);
  } else {
    ran++;
    console.log(`  ${gate}: red on its seeded violation, naming ${seeded}`);
  }
}

seededLayout();

/* AND EVERY FIXTURE IS CLAIMED. A directory under `negative/` that no case runs is a violation
   nobody is seeding, which is the same silence this file exists to break. */
for (const name of readdirSync(negatives, { withFileTypes: true }))
  if (name.isDirectory() && !CASES.some((c) => c.gate === name.name)) {
    console.error(`  negative/${name.name}/ is seeded and no case runs it.`);
    failed.push(name.name);
  }

/**
 * AND EVERY NUMBER IN `budgets.json` IS READ BY SOMETHING.
 *
 * `52 §4`: "every key is read by at least one gate (a `budgets.json` key nothing reads is a
 * `self-test` failure)". The reason is the same one the file exists for. A budget nobody reads is a
 * number that looks reviewed and asserts nothing — somebody tightens it, the diff is approved, and
 * the gate goes on measuring against whatever it holds instead. That is strictly worse than no
 * budget at all, because a missing one is visible and a dead one is not.
 *
 * IT GREPS FOR `.key` RATHER THAN PARSING. A gate reads its section into a one-letter binding, so
 * the use is `B.mainJsBrotli` and the name is unambiguous across this directory — no other file
 * here has a property by any of these names. A parser would be more precise and would also be a
 * second thing that can be wrong.
 */
function budgetsAreRead() {
  const sources = readdirSync(here)
    .filter((f) => f.endsWith('.mjs') && f !== 'lib.mjs' && f !== 'self-test.mjs')
    .map((f) => readFileSync(join(here, f), 'utf8'))
    .join(String.fromCharCode(10));

  const dead = keyPaths().filter((path) => !sources.includes(`.${path.split('.')[1]}`));
  if (dead.length) {
    console.error(`  budgets: ${dead.length} key(s) no gate reads: ${dead.join(', ')}.`);
    failed.push('budgets');
    return;
  }
  ran++;
  console.log(`  budgets: all ${keyPaths().length} numbers are read by a gate`);
}

budgetsAreRead();

console.log(
  failed.length === 0
    ? `\n  self-test: ${ran} negative${ran === 1 ? '' : 's'} caught by the gate seeded for it.\n`
    : `\n  self-test: ${failed.length} gate(s) do not: ${[...new Set(failed)].join(', ')}.\n`,
);
if (failed.length) process.exitCode = 1;
