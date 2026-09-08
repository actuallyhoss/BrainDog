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
  /* THE NINETY-NINE REFUSAL CODES, which had no `RefusalCode` type and so no list at all. A code is
     the one part of a refusal a caller can branch on, and `10 §7` builds the agent contract on it:
     the refusal teaches, and it teaches from a code stable across versions. Beside `event-kinds`
     because it is the same shape over the corpus's other large vocabulary. */
  ['refusals', ['node', [join(here, 'refusals.mjs')]]],
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
  /* A PREFERENCE THAT CHANGES NOTHING IS A CONTROL THAT LIES (`25 §1`'s `series` class). The Text
     setting shipped inert for the life of the build because the 128-configuration matrix is widths,
     schemes and directions — no preference but `scheme` is an axis of it, so nothing ever asked. */
  ['prefs', ['node', [join(here, 'prefs.mjs')]]],
  /* AND EVERY KEY THE PRODUCT PRINTS IS A KEY THAT DOES SOMETHING. `19 §4`'s whole argument for a
     registry is that the sheet documents by READING it, so it cannot drift — and it had drifted
     three ways, found by a sweep rather than by anything here. */
  ['keys', ['node', [join(here, 'keys.mjs')]]],
  // Last two because they are the slow ones: a real browser over every route.
  ['layout', ['node', [join(here, 'layout.mjs')]]],
  ['a11y', ['node', [join(here, 'a11y.mjs')]]],
];

/**
 * Which of them this run is asking for — `52 §2`'s flags, less `--negative`.
 *
 *   node tools/gates/run.mjs --except layout,a11y,keys,prefs,bundle    the ones that read source
 *   node tools/gates/run.mjs --only theme                              that one
 *   node tools/gates/run.mjs --allow-skip bundle                       a skip there is not red
 *
 * SELECTION IS NOT TOLERANCE, and `52 §6` is about the other thing: *"there is no `skip`, `only`,
 * `retry` or `allow-failure` on a gate"* forbids a red gate being waved through, and nothing here
 * changes what a red gate does. What this picks is which JOB asks the question, and it exists
 * because five of the nineteen need a built app and a real browser — nineteen minutes of one — while
 * the fourteen that read source cost under a minute. One workflow cannot hold both answers: at
 * nineteen minutes on every push the run is cancelled or ignored, and at fourteen gates on merge
 * alone the browser ones report after the commit that broke them has landed.
 *
 * `--except`, AND NOT A LIST OF THE FAST ONES, is the whole reason it is spelt this way. A workflow
 * that names what it runs stops running the gate somebody adds tomorrow, silently and for ever — the
 * same defect as a gate that cannot fail, one level up again. A workflow that names what it
 * EXCLUDES picks the new one up; and if the new one turns out to need a build it exits 3, which is
 * red under CI, so what arrives is a sentence naming the gate rather than a green run that checked
 * one thing fewer than it claims.
 *
 * A NAME THAT MATCHES NOTHING IS EXIT 2. `--except a11y,ally` would otherwise run everything and
 * report success, and a typo that widens coverage is not the failure mode worth guarding — a typo
 * that narrows it is, and `--only bundel` is that one.
 */
const list = (flag) => {
  const at = process.argv.indexOf(flag);
  if (at === -1) return null;
  const value = process.argv[at + 1];
  if (!value || value.startsWith('--')) {
    console.error(`  ${flag} takes a comma-separated list of gate names.`);
    process.exit(2);
  }
  return value.split(',').map((s) => s.trim()).filter(Boolean);
};

const NAMES = GATES.map(([name]) => name);
const only = list('--only');
const except = list('--except') ?? [];
const allowSkip = list('--allow-skip') ?? [];

const misspelt = [...(only ?? []), ...except, ...allowSkip].filter((n) => !NAMES.includes(n));
if (misspelt.length) {
  console.error(`  no such gate: ${misspelt.join(', ')}. The ${GATES.length} are: ${NAMES.join(', ')}.`);
  process.exit(2);
}

const SELECTED = GATES.filter(([name]) => (only === null || only.includes(name)) && !except.includes(name));
if (SELECTED.length === 0) {
  console.error('  that selection is empty, and a run of no gates must not read as a run of every gate.');
  process.exit(2);
}
const omitted = NAMES.filter((n) => !SELECTED.some(([name]) => name === n));

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

for (const [name, [cmd, args, opts]] of SELECTED) {
  process.stdout.write(`\n▸ ${name}\n`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: false, ...opts });
  if (r.status === 3) skipped.push(name);
  else if (r.status !== 0) failed.push(name);
}

/* `--allow-skip` NAMES THE PREREQUISITE THIS JOB DOES NOT HAVE, one gate at a time, so that the job
   which does have it still goes red. A blanket "skips are fine here" is the same waiver the
   paragraph above refuses. */
const disallowed = skipped.filter((name) => !allowSkip.includes(name));
if (disallowed.length && process.env.CI) failed.push(...disallowed);

// NAMED, not counted. "1 of 8 gates failed" over a screen of eight gates' output is a search.
const ran = SELECTED.length - skipped.length;
const aside = skipped.length === 0 ? '' : ', and ' + skipped.length + ' could not run: ' + skipped.join(', ');
/* AND A RUN THAT WAS ASKED FOR LESS SAYS SO. "14 of 14 gates passed" beside a nineteen-gate corpus
   is the sentence a subset would otherwise print, and it reads as the whole thing. */
const unasked = omitted.length === 0 ? '' : '\n  ' + omitted.length + ' were not asked for: ' + omitted.join(', ') + '.';
console.log(
  (failed.length === 0
    ? '\n  ' + ran + ' of ' + SELECTED.length + ' gates passed' + aside + '.'
    : '\n  ' + [...new Set(failed)].length + ' of ' + SELECTED.length + ' gates failed: ' + [...new Set(failed)].join(', ') + '.') +
    unasked +
    '\n',
);

if (failed.length) process.exitCode = 1;
