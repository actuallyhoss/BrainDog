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

const GATES = [
  ['clean-room', ['node', [join(here, 'clean-room.mjs')]]],
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

let failed = 0;

for (const [name, [cmd, args]] of GATES) {
  process.stdout.write(`\n▸ ${name}\n`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: false });
  if (r.status !== 0) failed++;
}

console.log(
  failed === 0
    ? `\n  ${GATES.length} gates passed.\n`
    : `\n  ${failed} of ${GATES.length} gates failed.\n`,
);

if (failed) process.exitCode = 1;
