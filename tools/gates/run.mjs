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
  /* THE GATES' OWN TEST, SECOND. A gate that has never failed is a gate that may not work — and an
     audit found six here reporting zero findings because their predicate could never be true, every
     one of them printing green. This runs each grep gate against a seeded violation and is red when
     one of them passes it, which is the only thing that makes the nine below mean anything. */
  ['self-test', ['node', [join(here, 'self-test.mjs')]]],
  ['clean-room', ['node', [join(here, 'clean-room.mjs')]]],
  /* The banned surface: one kernel, three runtimes, and a source file that imports a driver has
     chosen one of them. Cheap and early, beside the other greps. */
  ['stack', ['node', [join(here, 'stack.mjs')]]],
  /* THE ONE THAT GUARDS THE PROMISE THE PRODUCT IS BUILT ON: a credential never goes in the record,
     and never in a log. It is a grep, so it belongs beside the other greps and costs nothing. */
  ['secret-grep', ['node', [join(here, 'secret-grep.mjs')]]],
  /* THE ONE LIST LARGE ENOUGH TO HAVE DRIFTED THREE TIMES (52 §5.2). Four of its five sources are
     not code, so nothing but a gate can notice that a document gained a kind the database refuses. */
  ['event-kinds', ['node', [join(here, 'event-kinds.mjs')]]],
  /* THE SURFACE IS SPLIT BY WHO MAY REACH IT (30 §5), and sixteen INTERNAL methods are each one line
     from being routable — `createRecord` makes somebody the owner of a record. */
  ['router-groups', ['node', [join(here, 'router-groups.mjs')]]],
  /* AND THE OTHER TWENTY-TWO CLOSED LISTS. 30 §2: a list enforced only by a validator is a list one
     code path forgets — which holds only while the CHECK and the document agree about what it is. */
  ['closed-lists', ['node', [join(here, 'closed-lists.mjs')]]],
  /* THE RULE THE WHOLE ADDITIVE STORY RESTS ON (02 §1). A register the kernel ships is a name no
     pack can own — and breaking it is always the shortest path. */
  ['no-declarations-in-kernel', ['node', [join(here, 'no-declarations-in-kernel.mjs')]]],
  ['css-rules', ['node', [join(here, 'css-rules.mjs')]]],
  ['colour-grep', ['node', [join(here, 'colour-grep.mjs')]]],
  /* `50 §3` says one file holds every sentence so the copy is reviewable in one place. That is true
     only while the file and the product hold the same sentences — and 26 of 212 were reviewable and
     unrendered, including the five that define the words the product is built out of. */
  ['dead-copy', ['node', [join(here, 'dead-copy.mjs')]]],
  ['theme', ['node', [join(root, 'packages/skin/scripts/theme.mjs'), '--check']]],
  // Needs a build. Both report and exit 0 when there is not one, so `pnpm gates` is useful on a
  // fresh checkout; CI builds first, and then they are real gates.
  ['bundle', ['node', [join(here, 'bundle.mjs')]]],
  // Last two because they are the slow ones: a real browser over every route.
  ['layout', ['node', [join(here, 'layout.mjs')]]],
  ['a11y', ['node', [join(here, 'a11y.mjs')]]],
];

const failed = [];

/**
 * Gates that could not run — exit 3, which is a skip and not a pass.
 *
 * THREE OF THESE PRINTED GREEN WITH NO BUILD. `bundle`, `layout` and `a11y` exited 0 when there was
 * nothing to measure, so `pnpm gates` on a fresh checkout reported every gate passed with three of
 * them having examined nothing — the same silence `self-test.mjs` exists to break, one level up.
 *
 * UNDER `CI` A SKIP IS RED, because CI builds first: a skip there means the build did not happen and
 * the three gates that look at the shipped product were not among the ones that ran.
 */
const skipped = [];

for (const [name, [cmd, args, opts]] of GATES) {
  process.stdout.write(`\n▸ ${name}\n`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: false, ...opts });
  if (r.status === 3) skipped.push(name);
  else if (r.status !== 0) failed.push(name);
}

if (skipped.length && process.env.CI) failed.push(...skipped);

// NAMED, not counted. "1 of 8 gates failed" over a screen of eight gates' output is a search.
const ran = GATES.length - skipped.length;
const aside = skipped.length === 0 ? '' : ', and ' + skipped.length + ' could not run: ' + skipped.join(', ');
console.log(
  failed.length === 0
    ? '\n  ' + ran + ' of ' + GATES.length + ' gates passed' + aside + '.\n'
    : '\n  ' + [...new Set(failed)].length + ' of ' + GATES.length + ' gates failed: ' + [...new Set(failed)].join(', ') + '.\n',
);

if (failed.length) process.exitCode = 1;
