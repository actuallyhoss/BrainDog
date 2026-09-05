/**
 * Every gate, in order, from the repository root.
 *
 *   node tools/gates/run.mjs
 *
 * A gate that only warns is a gate that is ignored, so each one exits non-zero and this runner
 * reports every failure rather than stopping at the first — a run that names one problem when there
 * are four costs four runs.
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

/**
 * `pnpm` on Windows is a `.cmd` shim, and Node refuses to spawn one without a shell (EINVAL, the
 * fix for CVE-2024-27980). It is the only gate that is not a plain script, and its argv is a
 * constant, so it is the only one given a shell.
 */
const PNPM = ['pnpm', ['-r', 'run', 'typecheck'], { shell: true }];

const GATES = [
  /* FIRST, because a type error invalidates every gate under it — and because two of them reached a
     commit while the seven browser-and-grep gates all reported green. `pnpm -r` so the packages and
     both apps are held to it, which is where the shapes actually cross. */
  ['typecheck', PNPM],
  ['clean-room', ['node', [join(here, 'clean-room.mjs')]]],
  /* The banned surface: one kernel, three runtimes, and a source file that imports a driver has
     chosen one of them. Cheap and early, beside the other greps. */
  ['stack', ['node', [join(here, 'stack.mjs')]]],
  ['css-rules', ['node', [join(here, 'css-rules.mjs')]]],
  ['colour-grep', ['node', [join(here, 'colour-grep.mjs')]]],
  ['theme', ['node', [join(root, 'packages/skin/scripts/theme.mjs'), '--check']]],
  // Needs a build. Both report and exit 0 when there is not one, so `pnpm gates` is useful on a
  // fresh checkout; CI builds first, and then they are real gates.
  ['bundle', ['node', [join(here, 'bundle.mjs')]]],
  // Last two because they are the slow ones: a real browser over every route.
  ['layout', ['node', [join(here, 'layout.mjs')]]],
  ['a11y', ['node', [join(here, 'a11y.mjs')]]],
];

const failed = [];

for (const [name, [cmd, args, opts]] of GATES) {
  process.stdout.write(`\n▸ ${name}\n`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: false, ...opts });
  if (r.status !== 0) failed.push(name);
}

// NAMED, not counted. "1 of 8 gates failed" over a screen of eight gates' output is a search.
console.log(
  failed.length === 0
    ? `\n  ${GATES.length} gates passed.\n`
    : `\n  ${failed.length} of ${GATES.length} gates failed: ${failed.join(', ')}.\n`,
);

if (failed.length) process.exitCode = 1;
