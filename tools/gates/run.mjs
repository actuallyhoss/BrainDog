/**
 * Every gate, in order, from the repository root.
 *
 *   node tools/gates/run.mjs
 *
 * A gate that only warns is a gate that is ignored, so each one exits non-zero and this runner
 * reports every failure rather than stopping at the first. A run that names one problem when there
 * are four costs four runs.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

/**
 * `pnpm` on Windows is a `.cmd` shim, and Node refuses to spawn one without a shell (EINVAL, the
 * fix for CVE-2024-27980). It is the only gate that is not a plain script, and its argv is a
 * constant, so it is the only one given a shell.
 *
 * ONE STRING, NOT A COMMAND AND AN ARGUMENT LIST. With `shell: true` Node concatenates the list
 * unescaped and says so on every run (DEP0190), which printed a security warning at the foot of
 * every `pnpm gates` a stranger ran. The line is a constant, so handing the shell the whole of it is
 * exactly as safe and says nothing.
 */
const PNPM = ['pnpm -r run typecheck', [], { shell: true }];

const GATES = [
  /* FIRST, because a type error invalidates every gate under it, and because two of them reached a
     commit while the seven browser-and-grep gates all reported green. `pnpm -r` so the packages and
     both apps are held to it, which is where the shapes actually cross. */
  ['typecheck', PNPM],
  /* THE GATES' OWN TEST, SECOND. A gate that has never failed is a gate that may not work. An
     audit found six here reporting zero findings because their predicate could never be true, every
     one of them printing green. This runs each grep gate against a seeded violation and is red when
     one of them passes it, which is the only thing that makes the nine below mean anything. */
  ['self-test', ['node', [join(here, 'self-test.mjs')]]],
  ['clean-room', ['node', [join(here, 'clean-room.mjs')]]],
  /* The banned surface: one kernel, three runtimes, and a source file that imports a driver has
     chosen one of them. Cheap and early, beside the other greps. */
  ['stack', ['node', [join(here, 'stack.mjs')]]],

  /* BESIDE `stack` BECAUSE IT IS THE SAME KIND OF CHECK: a raw byte scan over source, cheap and
     early. Two files in this repository picked up a stray NUL byte and nothing in the other
     twenty-four gates noticed: one sat inside a string literal and typechecked clean, the other
     sat inside a regex character class where `\x00` was meant. A NUL also makes git call the file
     binary, so it silently stops diffing and stops merging. This is a scan of bytes rather than of
     syntax, because the defect is in the byte and not in the shape of the code around it. */
  ['nul-bytes', ['node', [join(here, 'nul-bytes.mjs')]]],
  /* THE OTHER HALF OF `31 §3`. `stack` is layer 4: the runtime surface a package may not name.
     This is layers 3 and 5: the seventeen-row order, acyclicity, and the relative import that
     climbs out of its own package, which pnpm resolves happily and which nothing else can see. */
  ['graph', ['node', [join(here, 'graph.mjs')]]],
  /* THE ONE THAT GUARDS THE PROMISE THE PRODUCT IS BUILT ON: a credential never goes in the record,
     and never in a log. It is a grep, so it belongs beside the other greps and costs nothing. */
  ['secret-grep', ['node', [join(here, 'secret-grep.mjs')]]],
  /* THE ONE LIST LARGE ENOUGH TO HAVE DRIFTED THREE TIMES (52 §5.2). Four of its five sources are
     not code, so nothing but a gate can notice that a document gained a kind the database refuses. */
  ['event-kinds', ['node', [join(here, 'event-kinds.mjs')]]],
  /* THE SURFACE IS SPLIT BY WHO MAY REACH IT (30 §5), and sixteen INTERNAL methods are each one line
     from being routable. `createRecord` makes somebody the owner of a record. */
  ['router-groups', ['node', [join(here, 'router-groups.mjs')]]],
  /* AND WHETHER THE RECORD APPLIES THE GROUP THE TABLE PUBLISHES. `30 §10` puts authorisation in
     the record, so the group in `ROUTES` gates nothing at runtime; it was ADMIN on a method guarded
     `read`, and the answer to that method carries every colleague's email. */
  ['guards', ['node', [join(here, 'guards.mjs')]]],
  /* AND THE OTHER TWENTY-TWO CLOSED LISTS. 30 §2: a list enforced only by a validator is a list one
     code path forgets, which holds only while the CHECK and the document agree about what it is. */
  ['closed-lists', ['node', [join(here, 'closed-lists.mjs')]]],
  /* THE NINETY-NINE REFUSAL CODES, which had no `RefusalCode` type and so no list at all. A code is
     the one part of a refusal a caller can branch on, and `10 §7` builds the agent contract on it:
     the refusal teaches, and it teaches from a code stable across versions. Beside `event-kinds`
     because it is the same shape over the corpus's other large vocabulary. */
  /* THE ONE INVARIANT `30` STATES AS SQL, ASKED OF A REAL RECORD. `30 §3` closes the `spark` actor
     to suggest, propose and predict and calls it "an invariant with a test": the assistant proposes
     and a person decides. This materialises the seed through the real write path, offers the record
     the four writes a model may not make, and runs `30 §3`'s query over what came back.

     IT MAKES THE WRITES BEFORE IT QUERIES, and that is the whole reason it is worth having.
     `52 §5.2` says to materialise the record and run the query, and in this tree that is green off
     an empty table: the seed writes no `spark` event at all, so the filter filters nothing. A gate
     that passes because its subject is absent is the failure this directory exists to catch, and it
     was specified that way. The only gate here that builds a record, and at about 150ms it is still
     a grep's price. */
  ['spark-actor', ['node', [join(here, 'spark-actor.mjs')]]],
  ['refusals', ['node', [join(here, 'refusals.mjs')]]],

  /* AND THE OTHER HALF OF `30 §6`'s LAST PARAGRAPH: *"every `code` has a fixture that produces
     it."* `refusals` counts which codes the tree emits and says 37 are emitted by nothing; this
     holds the other 75 to a file each, keyed by the `via` that raises it, which is what turns that
     37 from a search into a burn-down. Beside `refusals` because they are two halves of one
     sentence. */
  ['refusal-fixtures', ['node', [join(here, 'refusal-fixtures.mjs')]]],
  /* A FLAG IS A DECISION THAT HAS NOT BEEN TAKEN, and the failure it becomes is permanent
     branching. This asks six questions of the list, of which the load-bearing one is whether the
     flag is read at all. `dead-copy`'s own hole is that a statically-false `{#if}` counts as
     rendered, and every flag is that `{#if}`. */
  ['flags', ['node', [join(here, 'flags.mjs')]]],
  /* THE RULE THE WHOLE ADDITIVE STORY RESTS ON (02 §1). A register the kernel ships is a name no
     pack can own, and breaking it is always the shortest path. */
  ['no-declarations-in-kernel', ['node', [join(here, 'no-declarations-in-kernel.mjs')]]],
  ['css-rules', ['node', [join(here, 'css-rules.mjs')]]],
  ['colour-grep', ['node', [join(here, 'colour-grep.mjs')]]],
  /* `50 §3` says one file holds every sentence so the copy is reviewable in one place. That is true
     only while the file and the product hold the same sentences, and 26 of 212 were reviewable and
     unrendered, including the five that define the words the product is built out of. */
  ['dead-copy', ['node', [join(here, 'dead-copy.mjs')]]],
  ['theme', ['node', [join(root, 'packages/skin/scripts/theme.mjs'), '--check']]],
  // Needs a build. It exits 3 when there is not one, which is a skip here and not a pass, so
  // `pnpm gates` is useful on a fresh checkout; CI builds first, and then it is a real gate.
  ['bundle', ['node', [join(here, 'bundle.mjs')]]],
  /* A PREFERENCE THAT CHANGES NOTHING IS A CONTROL THAT LIES (`25 §1`'s `series` class). The Text
     setting shipped inert for the life of the build because the 128-configuration matrix is widths,
     schemes and directions. No preference but `scheme` is an axis of it, so nothing ever asked. */
  ['prefs', ['node', [join(here, 'prefs.mjs')]]],
  /* AND EVERY KEY THE PRODUCT PRINTS IS A KEY THAT DOES SOMETHING. `19 §4`'s whole argument for a
     registry is that the sheet documents by READING it, so it cannot drift. It had drifted three
     ways, found by a sweep rather than by anything here. */
  ['keys', ['node', [join(here, 'keys.mjs')]]],
  // Last three because they are the slow ones: a real browser over every route.
  ['layout', ['node', [join(here, 'layout.mjs')]]],
  ['a11y', ['node', [join(here, 'a11y.mjs')]]],
  /* THE ONE BROWSER GATE THAT DRIVES A DOOR RATHER THAN MEASURING A SCREEN. Both halves of sign-in were
     tested and the join between them never was: the verifier against a software authenticator, the client
     against a fake `navigator.credentials`, and nothing at all against a browser's own WebAuthn stack over
     the challenge, origin and RP ID a real record issued. It comes in by the server key, adds a passkey,
     signs out and comes back in with it. On its own ephemeral port, so it does not join the queue for 5189
     the two above share. */
  ['passkey', ['node', [join(here, 'passkey.mjs')]]],
  /* AND THE OTHER ONE THAT DRIVES A BLOCK RATHER THAN MEASURING IT. `queue` was tested at every seam
     and in screenshots and nothing had ever pressed one: an option word that goes nowhere and a count
     of what is left that goes nowhere both pass every unit test there is. It presses an option and
     checks the gate it lands on, presses the count and checks it reaches Decide. Its own ephemeral
     port, for the reason `passkey` has one. */
  ['queue', ['node', [join(here, 'queue.mjs')]]],
  /* AFTER EVERYTHING, BECAUSE IT IS THE ONLY ONE THAT MEASURES SOMETHING OUTSIDE THIS REPOSITORY
     (52 §3; 51 §5.17). The twenty-seven above ask whether the tree is right; this asks whether the
     tree is what the internet is serving, which is a question only `deploy.yml` is in a position to
     ask. Everywhere else it exits 3 and is named in `--allow-skip`. It is last for the same
     reason `layout` and `a11y` are: a run that fails earlier should not have deployed. */
  ['deploy-parity', ['node', [join(here, 'deploy-parity.mjs')]]],
];

/**
 * A GATE FILE NOBODY REGISTERED IS A GATE NOBODY RUNS, and nothing said so.
 *
 * `52 §5.1` step 1 is *"list `tools/gates/*.mjs` minus `run.mjs`, `lib.mjs`, `self-test.mjs`"* and
 * this file holds a hard-coded array instead, which is exactly the failure the `--except` comment
 * below argues against, one level down: *"a workflow that names what it runs stops running the gate
 * somebody adds tomorrow, silently and for ever."* Two gates were written and left unregistered in
 * one week; both were caught by a person noticing, which is not a mechanism.
 *
 * IT IS NOT A DIRECTORY SCAN REPLACING THE ARRAY, and the array stays. It carries two things a scan
 * cannot: the ORDER, which is load-bearing (`typecheck` first because a type error invalidates
 * everything under it, `self-test` second because it is what makes the rest mean anything, the two
 * browser gates last because they are nineteen minutes), and the entries that are not files in
 * this directory at all, like `theme`, which runs `packages/skin/scripts/theme.mjs --check`.
 *
 * So the scan is the CHECK and not the source. Adding a gate is still a line in this file;
 * forgetting the line is now loud, before a single gate has run.
 *
 * AND WHAT COUNTS AS A GATE IS DERIVED RATHER THAN LISTED. The first version of this held
 * `['run.mjs', 'lib.mjs', 'self-test.mjs']` as a literal (`52 §5.1`'s own three) and reported
 * `routes.mjs`, which is not a gate: it exports `routesOf` and `a11y` and `layout` both import it.
 * A hand-written list of exceptions is the same defect as a hand-written list of gates, one line
 * further down, so the rule is derived instead: **a file another file in this directory imports is
 * a library, and the two runners are the two runners.** `routes.mjs` earns its exemption by being
 * imported, and the day somebody adds a second shared helper it earns the same one for free.
 */
const RUNNERS = new Set(['run.mjs', 'self-test.mjs']);
const here_files = readdirSync(here).filter((name) => name.endsWith('.mjs'));
const imported = new Set(
  here_files.flatMap((name) =>
    [...readFileSync(join(here, name), 'utf8').matchAll(/from '\.\/([\w.-]+\.mjs)'/gu)].map((m) => m[1]),
  ),
);
const registered = new Set(
  GATES.flatMap(([, [, argv]]) => (Array.isArray(argv) ? argv.filter((a) => typeof a === 'string' && a.endsWith('.mjs')) : []))
    .map((p) => basename(p)),
);
const unregistered = here_files.filter((name) => !RUNNERS.has(name) && !imported.has(name) && !registered.has(name));
if (unregistered.length > 0) {
  console.error(
    `\n  ${unregistered.join(', ')} in tools/gates/ and in no GATES entry. A gate nobody registered is a gate nobody runs.`,
  );
  process.exit(1);
}

/**
 * Which of them this run is asking for: `52 §2`'s flags, less `--negative`.
 *
 *   node tools/gates/run.mjs --except layout,a11y,keys,prefs,bundle    the ones that read source
 *   node tools/gates/run.mjs --only theme                              that one
 *   node tools/gates/run.mjs --allow-skip bundle                       a skip there is not red
 *
 * SELECTION IS NOT TOLERANCE, and `52 §6` is about the other thing: *"there is no `skip`, `only`,
 * `retry` or `allow-failure` on a gate"* forbids a red gate being waved through, and nothing here
 * changes what a red gate does. What this picks is which JOB asks the question, and it exists
 * because five of the nineteen need a built app and a real browser (nineteen minutes of one),
 * while the fourteen that read source cost under a minute. One workflow cannot hold both answers: at
 * nineteen minutes on every push the run is cancelled or ignored, and at fourteen gates on merge
 * alone the browser ones report after the commit that broke them has landed.
 *
 * `--except`, AND NOT A LIST OF THE FAST ONES, is the whole reason it is spelt this way. A workflow
 * that names what it runs stops running the gate somebody adds tomorrow, silently and for ever.
 * That is the same defect as a gate that cannot fail, one level up again. A workflow that names
 * what it EXCLUDES picks the new one up; and if the new one turns out to need a build it exits 3,
 * which is red under CI, so what arrives is a sentence naming the gate rather than a green run
 * that checked one thing fewer than it claims.
 *
 * A NAME THAT MATCHES NOTHING IS EXIT 2. `--except a11y,ally` would otherwise run everything and
 * report success, and a typo that widens coverage is not the failure mode worth guarding. A typo
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
 * Gates that could not run: exit 3, which is a skip and not a pass.
 *
 * FIVE OF THESE PRINTED GREEN WITH NO BUILD. `bundle`, `layout` and `a11y` exited 0 when there was
 * nothing to measure, so `pnpm gates` on a fresh checkout reported every gate passed with three of
 * them having examined nothing, the same silence `self-test.mjs` exists to break, one level up.
 * `passkey` and `queue` were written afterwards and copied the habit back in, each saying in its own
 * header that it printed a skip and never passed one off as a pass while exiting 0 to say the
 * opposite. A gate is a skip because of the number it exits with, not because of the sentence above
 * it, so the number is the only part of that claim this runner can read.
 *
 * UNDER `CI` A SKIP IS RED, because CI builds first: a skip there means the build did not happen and
 * the gates that look at the shipped product were not among the ones that ran.
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
