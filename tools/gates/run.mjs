/**
 * Every gate, in order, from the repository root.
 *
 *   node tools/gates/run.mjs
 *
 * A gate that only warns is a gate that is ignored, so each one exits non-zero and this runner
 * reports every failure rather than stopping at the first. A run that names one problem when there
 * are four costs four runs.
 *
 * AND A GATE DOES NOT GET TO SAY WHETHER IT COULD RUN. `52 §5.1` step 2: a gate declares what it
 * cannot run without, this file reads every declaration before it spawns anything, and a gate whose
 * prerequisite is unmet is refused here rather than asked. See `NEEDS` below for what that fixes.
 *
 * AND EVERY GATE BUT THE SPAWNED ONES IS NOW A FUNCTION THIS FILE CALLS RATHER THAN A SCRIPT IT SPAWNS.
 * `52 §5.1` step 3: see `IMPORTED OR SPAWNED` below for what it buys, what it costs, and why the
 * spawned ones keep the dialect they have. Which of the two a gate is in is DECLARED by its entry here, with
 * `call(...)`, and never guessed from the gate's text, which is the trap the first half of that step
 * left behind.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { basename, dirname, join } from 'node:path';

import { webBuildUnmet } from './lib.mjs';

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

/**
 * A GATE THIS FILE CALLS RATHER THAN SPAWNS, AND IT SAYS SO HERE. `52 §5.1` step 3.
 *
 * THE DIALECT IS DECLARED IN THIS TABLE BECAUSE THE FIRST VERSION GUESSED IT FROM THE GATE'S TEXT,
 * and that guess was one commit from being a trap: see `IMPORTED OR SPAWNED` below for the whole of
 * it. A `call` entry takes the file and nothing else, because a called gate is handed the root and
 * nothing else.
 *
 * A SYMBOL RATHER THAN A WORD, so nothing can reach `spawnSync` by accident. The spawned path takes
 * this slot as the command to run, and `'call'` sitting there would be a command a shell might find.
 */
const CALL = Symbol('called rather than spawned');
const call = (file) => [CALL, [file]];

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
  ['clean-room', call(join(here, 'clean-room.mjs'))],
  /* AND WHAT THE REPOSITORY CARRIES ABOUT ITS OWNER: no private name, the licence files right, the README
     with its Licence section and no price or badge, and on the owner's machine his own private list. Beside
     `clean-room` because both are a read of every tracked file for something that must not be in it. */
  ['public-clean', call(join(here, 'public-clean.mjs'))],
  /* AND WHAT A STRANGER WITH A FORK REACHES ON IT, AND WHAT AN INSTALL RUNS: the workflows' triggers, permissions, secrets,
     runners, pins and scripts, and the manifests, lockfile and build allowance. Beside `public-clean` for the same reason. */
  ['public-repo', call(join(here, 'public-repo.mjs'))],
  /* The banned surface: one kernel, three runtimes, and a source file that imports a driver has
     chosen one of them. Cheap and early, beside the other greps. */
  ['stack', ['node', [join(here, 'stack.mjs')]]],

  /* BESIDE `stack` BECAUSE IT IS THE SAME KIND OF CHECK: a raw byte scan over source, cheap and
     early. Two files in this repository picked up a stray NUL byte and nothing in the other
     twenty-four gates noticed: one sat inside a string literal and typechecked clean, the other
     sat inside a regex character class where `\x00` was meant. A NUL also makes git call the file
     binary, so it silently stops diffing and stops merging. This is a scan of bytes rather than of
     syntax, because the defect is in the byte and not in the shape of the code around it. */
  ['nul-bytes', call(join(here, 'nul-bytes.mjs'))],
  /* EVERY TEST FILE RUNS, AND NONE SKIPS ITS WAY TO GREEN. A test no script, workflow step or
     gate reaches is a promise nobody checks, and twelve of the runner's own sat there. A text walk, cheap
     and early, beside the other scans of the whole tree. */
  ['orphan-tests', call(join(here, 'orphan-tests.mjs'))],
  /* THE OTHER HALF OF `31 §3`. `stack` is layer 4: the runtime surface a package may not name.
     This is layers 3 and 5: the seventeen-row order, acyclicity, and the relative import that
     climbs out of its own package, which pnpm resolves happily and which nothing else can see. */
  ['graph', call(join(here, 'graph.mjs'))],
  /* THE ONE THAT GUARDS THE PROMISE THE PRODUCT IS BUILT ON: a credential never goes in the record,
     and never in a log. It is a grep, so it belongs beside the other greps and costs nothing. */
  ['secret-grep', call(join(here, 'secret-grep.mjs'))],
  /* THE ONE LIST LARGE ENOUGH TO HAVE DRIFTED THREE TIMES (52 §5.2). Four of its five sources are
     not code, so nothing but a gate can notice that a document gained a kind the database refuses. */
  ['event-kinds', call(join(here, 'event-kinds.mjs'))],
  /* THE SURFACE IS SPLIT BY WHO MAY REACH IT (30 §5), and sixteen INTERNAL methods are each one line
     from being routable. `createRecord` makes somebody the owner of a record. */
  ['router-groups', call(join(here, 'router-groups.mjs'))],
  /* AND WHETHER THE RECORD APPLIES THE GROUP THE TABLE PUBLISHES. `30 §10` puts authorisation in
     the record, so the group in `ROUTES` gates nothing at runtime; it was ADMIN on a method guarded
     `read`, and the answer to that method carries every colleague's email. */
  ['guards', call(join(here, 'guards.mjs'))],
  /* AND WHETHER EACH READ OF THE KERNEL'S ROWS SITS BEHIND A SIGHT CHECK: `guards` holds a method to
     its group, this holds the rows inside it to the caller. Report mode until Slice 3: it lists every call site and passes. */
  ['sight', call(join(here, 'sight.mjs'))],
  /* AND THE OTHER TWENTY-TWO CLOSED LISTS. 30 §2: a list enforced only by a validator is a list one
     code path forgets, which holds only while the CHECK and the document agree about what it is. */
  ['closed-lists', call(join(here, 'closed-lists.mjs'))],
  /* AND THE COUNTS THE DOCUMENTS STATE, READ AGAINST THE CODE. A number in
     prose about the gates, the block kinds, the MCP tools and templates, the refusal codes or the declaration kinds is
     a claim, and those claims went stale unnoticed until this read them. Beside `closed-lists` because that gate
     already holds the spelled-out block-kind counts, and this one reads the digits beside it. */
  ['docs-counts', call(join(here, 'docs-counts.mjs'))],
  /* AND THE RULINGS PAGE AND ITS TESTS, HELD TOGETHER: every settled question in docs/04-PACKS.md §9 names the
     test that holds it, and a todo test says what it waits on. Beside `docs-counts` because both read a document against
     the code. */
  ['rulings', call(join(here, 'rulings.mjs'))],
  /* AND WHAT A TELEMETRY POINT MAY CARRY (`08 §5`, `51 §5.18`): one writeDataPoint( under apps/, its Blobs and Doubles labelled by 08 §5's columns, and none of the never-written words. */
  ['telemetry-allowlist', call(join(here, 'telemetry-allowlist.mjs'))],
  /* THE NINETY-NINE REFUSAL CODES, which had no `RefusalCode` type and so no list at all. A code is
     the one part of a refusal a caller can branch on, and `10 §7` builds the agent contract on it:
     the refusal teaches, and it teaches from a code stable across versions. Beside `event-kinds`
     because it is the same shape over the corpus's other large vocabulary. */
  /* THE ONE INVARIANT `30` STATES AS SQL, ASKED OF A REAL RECORD. `30 §3` closes the `slash` actor
     to suggest, propose and predict and calls it "an invariant with a test": the assistant proposes
     and a person decides. This materialises the seed through the real write path, offers the record
     the four writes a model may not make, and runs `30 §3`'s query over what came back.

     IT MAKES THE WRITES BEFORE IT QUERIES, and that is the whole reason it is worth having.
     `52 §5.2` says to materialise the record and run the query, and in this tree that is green off
     an empty table: the seed writes no `slash` event at all, so the filter filters nothing. A gate
     that passes because its subject is absent is the failure this directory exists to catch, and it
     was specified that way. The only gate here that builds a record, and at about 150ms it is still
     a grep's price. */
  ['slash-actor', call(join(here, 'slash-actor.mjs'))],
  ['refusals', call(join(here, 'refusals.mjs'))],

  /* AND THE OTHER HALF OF `30 §6`'s LAST PARAGRAPH: *"every `code` has a fixture that produces
     it."* `refusals` counts which codes the tree emits and says 37 are emitted by nothing; this
     holds the other 75 to a file each, keyed by the `via` that raises it, which is what turns that
     37 from a search into a burn-down. Beside `refusals` because they are two halves of one
     sentence. */
  ['refusal-fixtures', call(join(here, 'refusal-fixtures.mjs'))],
  /* A FLAG IS A DECISION THAT HAS NOT BEEN TAKEN, and the failure it becomes is permanent
     branching. This asks six questions of the list, of which the load-bearing one is whether the
     flag is read at all. `dead-copy`'s own hole is that a statically-false `{#if}` counts as
     rendered, and every flag is that `{#if}`. */
  ['flags', call(join(here, 'flags.mjs'))],
  /* THE RULE THE WHOLE ADDITIVE STORY RESTS ON (02 §1). A register the kernel ships is a name no
     pack can own, and breaking it is always the shortest path. */
  ['no-declarations-in-kernel', call(join(here, 'no-declarations-in-kernel.mjs'))],
  /* AND THE SAME RULE ONE LEVEL UP: the core ships no declaration, and its code names no use case.
     Measured on 23 September, no core package says `gold` or `hsbc` outside a comment,
     and nothing held it there. Beside the kernel rule because a `'bank-hsbc-eg'` in the record is
     that rule broken without a single declaration written. */
  ['shell-words', call(join(here, 'shell-words.mjs'))],
  /* AND THE NAMES THE ADD-ONS THEMSELVES DECLARE: `shell-words` holds a list somebody wrote, and this reads every
     pack and use case for its add-on, list, field and figure ids and fails where the core spells one as a string or
     after `register.`. What stands today is in `core-names.held.json`, which only shrinks. */
  ['core-names', call(join(here, 'core-names.mjs'))],
  /* AND THE SAME KIND OF RULE ABOUT THE SAMPLE. The app's test data lives in `fixtures/` and in the seed's
     root, and a shipped file that imports either draws the sample on a real record. Beside `shell-words` because both
     are a grep over what the core ships for something it must not name. */
  ['no-fixtures', call(join(here, 'no-fixtures.mjs'))],
  /* AND NO SHAPE COPY OF A RECORD IS KEPT IN THE TREE: a `.brainl` made by `export --shape`, under any name,
     is a record's own counts and lengths, and only `--allow-shape` imports one. */
  ['no-shape-files', call(join(here, 'no-shape-files.mjs'))],
  /* AND WHAT `no-fixtures` CANNOT SEE OF THE SAMPLE: the demo's setting outside a test, and a string only the
     test fixture holds in the built app. It needs the build, so it runs in `--built`. */
  ['no-sample', call(join(here, 'no-sample.mjs'))],
  /* AND THE WEB NAMES NO FIRST-PARTY LIST OR PACK, AND GUESSES NO CURRENCY.
     Beside `shell-words` and `no-fixtures` because it is the same kind of rule: a grep over what the app ships for
     something it must not name. */
  ['web-lists', call(join(here, 'web-lists.mjs'))],
  ['css-rules', call(join(here, 'css-rules.mjs'))],
  ['colour-grep', call(join(here, 'colour-grep.mjs'))],
  /* `50 §3` says one file holds every sentence so the copy is reviewable in one place. That is true
     only while the file and the product hold the same sentences, and 26 of 212 were reviewable and
     unrendered, including the five that define the words the product is built out of. */
  ['dead-copy', call(join(here, 'dead-copy.mjs'))],
  /* AND THE ONE HOUSE RULE ABOUT THOSE SENTENCES THAT NOTHING ENFORCED: "no em dashes and no
     flippant register in anything a stranger reads", against 91 string literals carrying
     one, most of them in refusals, which is the prose somebody meets at the moment they are stuck. */
  ['em-dash', call(join(here, 'em-dash.mjs'))],
  /* EVERY MENU ITEM HAS A GLYPH, ONE ACTION WEARS ONE, AND A NEW "…" IS REACHED BY A RIGHT-CLICK. */
  ['menu-items', call(join(here, 'menu-items.mjs'))],
  /* AND THE HOUSE WORDS, HELD BY A CHECK: the list in `words.json` (row, credential, register as a noun, an id
     in a sentence, the long dash) over every copy string the app ships. Beside `em-dash` because it reads the same
     copy for a wider list, and its `page` entries are the page lint's, so a page and the source are judged by one. */
  ['words', call(join(here, 'words.mjs'))],
  /* AND THE WRITING GUIDE IS THE LIST, PRINTED: docs/54-WRITING.md is what words.json makes. */
  ['words-guide', ['node', [join(here, 'words-guide.mjs'), '--check']]],
  /* AND THE ONE CLOCK: a run's `last_seen` compared with the time anywhere outside `presence.ts` is the
     rail, Today and Agents saying three numbers again. Today's hits are allowed by count, and the list only shrinks. */
  ['one-clock', call(join(here, 'one-clock.mjs'))],
  /* AND EVERY COMMIT IS ONE SHORT SENTENCE, BY HIM: no tool as author, no trailer, no session link, and the
     history never restarts. The commit-msg hook asks the same rules through it. */
  ['commits', call(join(here, 'commits.mjs'))],
  /* AND NOTHING LOCAL IS TRACKED: an agent's folder, a loop note, a record, a key or a `.local.json`. */
  ['hygiene', call(join(here, 'hygiene.mjs'))],
  /* AND AN APPLIED MIGRATION IS NEVER EDITED: each migration's checksum, by the runner's own `checksum`, against
     `packages/kernel/src/migrations/LOCK.json`, and a new one ships with a passing rehearsal's receipt. */
  ['migration-lock', call(join(here, 'migration-lock.mjs'))],
  /* AND THE LOG ONLY GROWS (his "append-only audit"): every statement under `packages/*\/src` that updates or
     deletes a line of `event` is on one list with its reason, and a seventh is red. Beside `migration-lock` because a
     migration is the one other place the log is reshaped, and that gate holds it. */
  ['audit-append-only', call(join(here, 'audit-append-only.mjs'))],
  /* AND A RELEASED VERSION IS NEVER CHANGED IN PLACE (`packs/README.md`'s "A published version never changes"):
     every version in the catalogue of the released commit is still there once, with its checksum, size and date, and
     no file of one moved. A new version is cut beside it. It reads history, so a shallow checkout is red. */
  ['catalogue-immutable', call(join(here, 'catalogue-immutable.mjs'))],
  /* AND A DRAWN BOARD SHIPS ONLY WITH ITS YES: a page, specimen, variant, stand-in or pick changed after its
     yes needs a new one, and a yes that misses a width, a theme or a pick is red. */
  ['board-yes', call(join(here, 'board-yes.mjs'))],
  /* AND NO AGENT TRANSCRIPT IS READ (transcripts are never read): a hook or package naming transcript_path or opening a client's session folder. */
  ['no-transcript', call(join(here, 'no-transcript.mjs'))],
  /* AND NO AGENT APP'S LOGIN IS NAMED (docs/48 §8): Claude Code's keychain item or file, the claude.ai login, or Codex's
     file, anywhere but a refusal list the gate names. */
  ['no-login', call(join(here, 'no-login.mjs'))],
  /* AND ONE LEDGER FOR EVERY NUMBER A GATE IS HELD TO: a budget never rises unless the owner is quoted, a debt
     only falls, a held list only shrinks, and a number written in a gate file is a debt. Beside the other source gates
     because it reads files and needs nothing built. */
  ['ledger', call(join(here, 'ledger.mjs'))],
  ['theme', ['node', [join(root, 'packages/skin/scripts/theme.mjs'), '--check']]],
  // Needs a build. It exits 3 when there is not one, which is a skip here and not a pass, so
  // `pnpm gates` is useful on a fresh checkout; CI builds first, and then it is a real gate.
  ['bundle', call(join(here, 'bundle.mjs'))],
  /* A PREFERENCE THAT CHANGES NOTHING IS A CONTROL THAT LIES (`25 §1`'s `series` class). The Text
     setting shipped inert for the life of the build because the 128-configuration matrix is widths,
     schemes and directions. No preference but `scheme` is an axis of it, so nothing ever asked. */
  ['prefs', call(join(here, 'prefs.mjs'))],
  /* AND EVERY KEY THE PRODUCT PRINTS IS A KEY THAT DOES SOMETHING. `19 §4`'s whole argument for a
     registry is that the sheet documents by READING it, so it cannot drift. It had drifted three
     ways, found by a sweep rather than by anything here. */
  ['keys', call(join(here, 'keys.mjs'))],
  // Last three because they are the slow ones: a real browser over every route.
  ['layout', call(join(here, 'layout.mjs'))],
  ['a11y', call(join(here, 'a11y.mjs'))],
  /* THE ONE BROWSER GATE THAT DRIVES A DOOR RATHER THAN MEASURING A SCREEN. Both halves of sign-in were
     tested and the join between them never was: the verifier against a software authenticator, the client
     against a fake `navigator.credentials`, and nothing at all against a browser's own WebAuthn stack over
     the challenge, origin and RP ID a real record issued. It comes in by the server key, adds a passkey,
     signs out and comes back in with it. On its own ephemeral port, so it does not join the queue for 5189
     the two above share. */
  ['passkey', call(join(here, 'passkey.mjs'))],
  /* AND THE OTHER ONE THAT DRIVES A BLOCK RATHER THAN MEASURING IT. `queue` was tested at every seam
     and in screenshots and nothing had ever pressed one: an option word that goes nowhere and a count
     of what is left that goes nowhere both pass every unit test there is. It presses an option and
     checks the gate it lands on, presses the count and checks it reaches Decide. Its own ephemeral
     port, for the reason `passkey` has one. */
  ['queue', call(join(here, 'queue.mjs'))],
  /* AND THE PANEL BESIDE A LIST, PRESSED (PGS-C04's guard). Every list opens the one editing panel and each seam of it
     was tested from the source; nothing had pressed `p`, Save, Undo, `j` or Escape on one. On a fresh record with ten
     tasks it does, at the desk width and at 390 where the panel is a bottom sheet, and reads the list, the toast and the address.
     A walk, so it lives in `walks/`; its own ephemeral port, for the reason `passkey` has one. */
  ['row-drawer', call(join(here, 'walks', 'row-drawer.walk.mjs'))],
  /* AND MONEY'S WHERE IT WENT, OPENED (PGS-C20's guard): on a fresh record with twelve entries this month, five unfiled
     from two payees, the folded heading is on Money shut and opens on its two blocks, at 390 and the desk. */
  ['money-where', call(join(here, 'walks', 'money-where.walk.mjs'))],
  /* WHAT A SETTLED SCREEN PRINTS: every address the gates' record gives, drawn once at 390 on the record's
     clock, red on a raw id, a raw time, a key, a value that never arrived or a page error. Its own ephemeral port, for
     the reason passkey has one. */
  ['printed', call(join(here, 'printed.mjs'))],
  /* AND THE SAME SIGN-IN ON THE HOST THAT WAS DEPLOYED, with the canary's own passkey. Here there is no
     CANARY_PASSKEY, so it runs on a fresh self-host and says "self-host only"; `after-deploy.yml` runs it against
     the deployed host. Its own ephemeral port, for the reason `passkey` has one. */
  ['signin-live', call(join(here, 'signin-live.mjs'))],
  /* AND THE FIRST SCREENS OF A NEW RECORD, FOR TWO PEOPLE: it walks Mariam and Sam through the first run on a fresh
     self-host and judges the drawn rail and Today (no tour, nobody in People but them, no empty place, one "New page").
     No browser and no build: the walk draws the web's own source. It judges nothing itself; the command does. */
  ['first-screen', call(join(here, 'first-screen.mjs'))],
  /* HOW FAST NINE SCREENS DRAW (PRF perf): first paint, drawn, from the kept copy and a revisit, at 390 and 1440, on the
     gates' record with no wait added, each the middle of a few opens and held to the ceilings in budgets.json. Its own
     ephemeral port, for the reason passkey has one. */
  ['perf', call(join(here, 'perf.mjs'))],
  /* AFTER EVERYTHING, BECAUSE IT IS THE ONLY ONE THAT MEASURES SOMETHING OUTSIDE THIS REPOSITORY
     (52 §3; 51 §5.17). The thirty above ask whether the tree is right; this asks whether the
     tree is what the internet is serving, which is a question only `deploy.yml` is in a position to
     ask. Everywhere else it exits 3 and is named in `--allow-skip`. It is last for the same
     reason `layout` and `a11y` are: a run that fails earlier should not have deployed. */
  ['deploy-parity', call(join(here, 'deploy-parity.mjs'))],
  /* THE RULE SHEET ON A PROOF RECORD: every rule of a block, a value and a layout, read at 390 and 1440. Last,
     beside deploy-parity, because it too reads what the internet serves. */
  ['rule-sheet', call(join(here, 'rule-sheet.mjs'))],
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
 * WHAT A GATE CANNOT RUN WITHOUT, READ BEFORE ANY GATE HAS RUN. `52 §5.1` step 2.
 *
 * THE DEFECT THIS CLOSES SHIPPED TWICE. Until this existed the runner spawned every gate and read
 * the EXIT CODE, so the only account of an unmet prerequisite was the gate's own. `passkey` and
 * `queue` each found no build and exited 0, which is a pass, and each one's header claimed in
 * prose that it printed a skip. A gate is the worst-placed thing in the tree to report that it
 * could not run, because the report and the thing being reported on are the same program: the
 * report is written by the code that did not run.
 *
 * SO THE PREREQUISITE IS THE RUNNER'S QUESTION NOW. A gate whose declared need is unmet is not
 * spawned at all, and the line that arrives is this file's rather than the gate's. There is no
 * exit code in that path for a gate to get wrong.
 *
 * WHY IT IS READ AS TEXT AND NOT BY `import()` FOR THE GATES THAT ARE STILL SCRIPTS, which is what
 * `52 §5.1` step 2 says. Measured before step 3 landed:
 * `node -e "import('./tools/gates/em-dash.mjs').then(m => console.log(m.needs))"` printed
 * `em-dash: 0 em dashes used as punctuation, over 415 files` and then `undefined`. A gate that does
 * its work at module top level RUNS when it is imported, which is precisely what asking before
 * running is for; and reading `needs` off the namespace would mean reading it after the gate had
 * finished, which is not a prerequisite check but an epilogue. That is still true of the gates below
 * registered as scripts, and this reader is for those. The ones registered with `call(...)`
 * are asked by `importedNeeds` instead, off the module, and none of the scripts this reader covers
 * declares anything today: every gate that has a prerequisite is one registered with `call(...)`, so this reader
 * now guards the next script gate that grows one rather than any gate in the table. It stays for that
 * reason, and because a gate may be registered as a script for as long as its author likes:
 * see `IMPORTED OR SPAWNED`. Either way the property step 2
 * is for holds, and it is the only one that matters here: nothing the gate can say decides whether
 * the gate runs.
 *
 * A DECLARATION THIS CANNOT READ IS A REFUSAL AND NEVER AN EMPTY LIST, and this paragraph is about
 * the spawned half alone. The whole mechanism turns
 * on a missing declaration meaning "no prerequisites", so a declaration that was present and
 * unparsed would silently mean the same thing and put the gate straight back in charge of its own
 * verdict. What is readable is a LITERAL list of quoted lower-case names, over one line or several;
 * what is not is a value computed at runtime, `export const needs = needsOf(root)`, which cannot be
 * read before the gate runs by construction. That one is exit 2 naming the file, and so is a name
 * no key of `NEEDS` defines, because a prerequisite nothing knows how to check is one nothing can
 * find unmet.
 */
const NEEDS = {
  /* A BUILD THAT IS THERE IS NOT A BUILD OF THIS CODE, and this line asked only the first question
     until 22 September. `existsSync(apps/web/build)` let `layout` and `a11y` measure a build older
     than the source, and they reported nineteen findings about an app that no longer existed, every
     one of which was chased before anybody looked at the build's date. `bundle` already knew how to
     prove a build stale; its walk is in `lib.mjs` now and this asks it too, so a stale build is
     the same refusal as a missing one: the gate is not run, the line names the file that is newer,
     and the command below is the fix. The runner does not build on its own, because a gate run that
     silently builds is a run whose timing and output nobody asked for. A variant list this cannot
     read is a refusal in the same voice rather than a stack trace, for the reason this file opens
     with: one unreadable fact must not end the run before a single gate has been asked. */
  'web-build': {
    unmet: () => webBuildUnmet(root).catch((cause) => cause.message),
    what: 'a built web app at apps/web/build that is newer than its source',
    how: 'pnpm --filter @braindog/web build',
    built: true,
  },
  /* THE ONE PREREQUISITE THAT IS NOT A FILE. `deploy-parity` asks whether the internet is serving
     this tree, and nothing on a developer's machine can answer that. */
  host: {
    unmet: () => (process.env.DEPLOY_HOST ? null : 'DEPLOY_HOST is not set'),
    what: 'DEPLOY_HOST naming the host to compare against',
    how: 'DEPLOY_HOST=<host> node tools/gates/run.mjs --only deploy-parity',
    built: false,
  },
  /* A BUILD THE GATE FINDS FOR ITSELF, ONE PART AT A TIME, AND THE ONE NEED THIS RUNNER NEVER REFUSES.
     `a11y` audits five builds and skips each absent one by name; `prefs` and `self-test` read source as
     well as a build. `web-build` would refuse all of each when the web app alone is missing, which is
     silent in the direction of measuring less, so each of them argued for declaring nothing. Declaring
     nothing put them in `--unbuilt`, in the job that builds nothing, where every one of them skips. This
     says which JOB asks them, and never whether they run: a build they miss is still their own exit 3,
     which is red under CI. */
  builds: {
    unmet: () => null,
    what: 'the builds it reads, each found and named by the gate itself',
    how: 'pnpm --filter @braindog/web build && pnpm --filter @braindog/site build',
    built: true,
  },
  /* A PROOF RECORD, the second prerequisite that is not a file: `rule-sheet` reads the pages of a record made through the
     public sign-up with Rule sheet installed, which only the proof area has after a deploy. The app is at the root of every
     host, so the address is the record's own, `https://<host>/<record>`. */
  proof: {
    unmet: () => (process.env.PROOF_RECORD ? null : 'PROOF_RECORD is not set'),
    what: "PROOF_RECORD naming a proof record's app address with Rule sheet installed, and PROOF_STATE the signed-in browser state the proof harness saved",
    how: 'PROOF_RECORD=<https://host/record> PROOF_STATE=<file> node tools/gates/run.mjs --only rule-sheet',
    built: false,
  },
};

/* `built` IS WHETHER A WEB BUILD MEETS THE NEED, and `--built` and `--unbuilt` below read nothing else. A
   need that does not say is a need neither selection can place, which is exit 2 the moment either is
   asked for, rather than a gate left out of both jobs without a word. */

/* `52 §5.1` ALSO NAMES `pack-build`, AND NOTHING DECLARES IT. Its one gate is `licence-closure`,
   which that section specifies and this tree has never had. A key here that no gate asks for would
   be a third account of the same fact, kept in step with nothing, so the name arrives with the gate
   that needs it and an unknown name is loud in the meantime. */

/** A literal list of single-quoted members, over one line or several. */
const DECLARATION = /^export const needs = \[([^\]]*)\];$/mu;
const MEMBER = /^'([a-z][a-z-]*)'$/u;

/** The script a GATES entry runs, wherever it lives: `theme` is not a file in this directory. */
const scriptOf = (argv) =>
  (Array.isArray(argv) ? argv.find((a) => typeof a === 'string' && a.endsWith('.mjs')) : undefined) ?? null;

const refuse = (line) => {
  console.error(`  ${line}`);
  process.exit(2);
};

function declaredNeeds(name, file) {
  /* `typecheck` IS `pnpm -r run typecheck` AND HAS NO FILE TO ASK. It also has no prerequisite: a
     tree that cannot typecheck is the finding. */
  if (file === null) return [];
  /* AND A REGISTERED GATE'S FILE CAN BE ABSENT, WHICH READING ONE MADE FATAL. Measured: delete
     `bundle.mjs` and leave its `GATES` line, and `readFileSync` threw `ENOENT` from here, so the run
     ended in a stack trace with none of the other thirty gates spawned. This file's own rule is
     that it reports every failure rather than stopping at the first, and one gate's file going
     missing is the weakest reason there is to stop. So the question is not asked: the gate is spawned
     as it was before any of this existed, and the spawn's own non-zero exit names it. A RENAME is
     loud without this, because the new name is in the directory and in no `GATES` entry; a deletion
     leaves nothing in the directory for that scan to see. */
  if (!existsSync(file)) return [];
  const source = readFileSync(file, 'utf8');
  /* AT THE START OF A LINE, because a header that explains why its gate declares nothing names the
     words in prose, and `a11y` and `prefs` both do. */
  if (!/^export const needs\b/mu.test(source)) return [];
  const found = DECLARATION.exec(source);
  if (found === null)
    refuse(
      `${name} names \`export const needs\` and this runner cannot read it. It must be a literal ` +
        `list of quoted names, \`export const needs = ['web-build'];\`, because a prerequisite ` +
        `computed at runtime cannot be read before the gate runs, and an unread one would mean no ` +
        `prerequisites and hand the gate back the verdict on itself.`,
    );
  return found[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((member) => {
      const m = MEMBER.exec(member);
      if (m === null) refuse(`${name} declares ${member} as a prerequisite, and a prerequisite is a quoted lower-case name.`);
      if (!Object.hasOwn(NEEDS, m[1]))
        refuse(`${name} declares the prerequisite ${m[1]}, and this runner knows ${Object.keys(NEEDS).join(' and ')}.`);
      return m[1];
    });
}

/**
 * Which of them this run is asking for: `52 §2`'s flags, less `--negative`.
 *
 *   node tools/gates/run.mjs --except layout,a11y,keys,prefs,bundle    the ones that read source
 *   node tools/gates/run.mjs --only theme                              that one
 *   node tools/gates/run.mjs --allow-skip bundle                       a skip there is not red
 *   node tools/gates/run.mjs --unbuilt                                 every gate that needs nothing
 *   node tools/gates/run.mjs --built --except layout,a11y              every gate a web build meets, less two
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
 * AND BETTER THAN EITHER LIST IS NO LIST: `--unbuilt` AND `--built`. Each reads the gates' own
 * `needs` against `NEEDS` above, so the job that builds nothing and the job that builds the app each say
 * which half they are and never which gates. `--unbuilt` is every gate that declares no need. `--built` is
 * every gate that declares one and whose every need a web build meets (`built: true`). A gate that needs a
 * live host is in neither, by construction rather than by a name left out. Both together are the two
 * halves at once. `--only` narrows either and `--except` takes from either, so the one list a workflow
 * still carries is the one it has a reason for.
 *
 * THE NEEDS ARE READ FROM EACH GATE'S TEXT HERE, BEFORE ANYTHING IS IMPORTED, because choosing what to
 * import is the question. A called gate's module is read again below once it is imported, and a module
 * that says something other than its text is exit 2: the job would have been chosen by the account that
 * did not run. A need a gate declares that `NEEDS` does not define is exit 2 in `declaredNeeds`.
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

const BY_NEED = { unbuilt: process.argv.includes('--unbuilt'), built: process.argv.includes('--built') };
let needsRead = null;
if (BY_NEED.unbuilt || BY_NEED.built) {
  const unplaced = Object.entries(NEEDS).filter(([, spec]) => typeof spec.built !== 'boolean').map(([need]) => need);
  if (unplaced.length)
    refuse(
      `NEEDS says of ${unplaced.join(' and ')} neither \`built: true\` nor \`built: false\`, so --built and ` +
        `--unbuilt cannot place a gate that declares it, and it would be in neither job without a word.`,
    );
  needsRead = new Map(GATES.map(([name, [, argv]]) => [name, declaredNeeds(name, scriptOf(argv))]));
}
/** Whether `--unbuilt` or `--built` picks this gate; true when neither was asked for. */
function pickedByNeed(name) {
  if (needsRead === null) return true;
  const needs = needsRead.get(name);
  if (needs.length === 0) return BY_NEED.unbuilt;
  return BY_NEED.built && needs.every((need) => NEEDS[need].built);
}

const SELECTED = GATES.filter(
  ([name]) => pickedByNeed(name) && (only === null || only.includes(name)) && !except.includes(name),
);
if (SELECTED.length === 0) {
  console.error('  that selection is empty, and a run of no gates must not read as a run of every gate.');
  process.exit(2);
}
const omitted = NAMES.filter((n) => !SELECTED.some(([name]) => name === n));

/**
 * ONE PART OF THAT SELECTION, so one run can be several jobs that share one build.
 *
 *   node tools/gates/run.mjs --only layout,a11y --shard 1/2     the first of two parts
 *   node tools/gates/run.mjs --shard 2/2 --list                 what the second part holds, and run nothing
 *
 * `gates.yml` hit its 35-minute ceiling on every push from 1 October: on the hosted runner `layout` alone
 * is 21 to 27 minutes and `a11y` 11, back to back in one job. Raising the ceiling buys the same minutes
 * on every run, so the run is split instead, and the split is THIS FILE'S rather than the workflow's.
 * A matrix that named a list of gates per job would be the hand-written list `--except` argues against:
 * a gate added tomorrow would land in no job. Here every selected gate lands in exactly one part, by
 * construction, so the matrix only says how many parts there are.
 *
 * THE PARTS ARE BALANCED BY `COST`, longest first, each to the part that holds least so far, and each
 * part then runs in registry order, so `typecheck` still goes first in whichever part holds it. The same
 * flags give the same parts on every machine, which is what lets two jobs agree without talking.
 *
 * AND A GATE THAT CAN BE CUT says so with `export const slices = <n>`, the most parts it can be cut into,
 * read off the module like `needs`. Sharded across M jobs it is cut into the smaller of n and M, and each
 * part is called as `gate(root, { part, of })`; unsharded it is called whole, as every gate always was.
 * Only an imported gate can be cut, because only a call can carry the part.
 *
 * A PART WITH NOTHING IN IT IS EXIT 2, for the reason an empty selection is: it is a job that would spend a
 * runner to report that it ran nothing, and the matrix is wider than the selection.
 */
const shardAt = process.argv.indexOf('--shard');
let SHARD = null;
if (shardAt !== -1) {
  const m = /^(\d+)\/(\d+)$/u.exec(process.argv[shardAt + 1] ?? '');
  if (m === null || Number(m[1]) < 1 || Number(m[1]) > Number(m[2])) {
    console.error('  --shard takes N/M, the Nth of M parts, counted from 1: `--shard 1/2`.');
    process.exit(2);
  }
  SHARD = { at: Number(m[1]), of: Number(m[2]) };
}
const LIST = process.argv.includes('--list');

/**
 * ABOUT HOW MANY SECONDS EACH SLOW GATE TAKES, AND EVERY GATE NOT HERE IS ONE.
 *
 * Measured on the hosted `ubuntu-latest` runner `CI_RUNNER` names: the full run of 28 September and the
 * push runs of 1 October (`◂` lines). Every other gate took under six seconds there. These are weights
 * for balancing the parts and never a budget: a stale figure makes the parts uneven, and no figure can
 * leave a gate unrun.
 */
const COST = { layout: 1450, a11y: 690, 'self-test': 168, keys: 86, typecheck: 63, prefs: 58 };
const costed = Object.keys(COST).filter((n) => !NAMES.includes(n));
if (costed.length) {
  console.error(`  COST names ${costed.join(', ')}, and no gate is called that.`);
  process.exit(2);
}

/**
 * IMPORTED OR SPAWNED, one gate at a time. `52 §5.1` step 3, on every gate registered with
 * `call(...)`; the rest are spawned exactly as they were.
 *
 * THE SECOND HALF OF STEP 3 IS THE GATES THAT NEED A BUILD OR A BROWSER, AND THEY ARE THE HALF THAT
 * MAKES STEP 2 WORTH ANYTHING. Every prerequisite in `NEEDS` belongs to one of them: `passkey` and
 * `queue` are the two gates that found no build and exited 0, and the paragraph above `NEEDS` is
 * written about them. Called, their declaration is the value the module holds, read before a line of
 * the gate has run, so the account the runner acts on and the account the gate acts on are one thing.
 *
 * WHY IT IS WORTH DOING AT ALL, AND IT IS THE STEP 2 DEFECT ONE LEVEL DOWN. Reading a declaration
 * out of source text means the declaration and the code can disagree: the text is one account of a
 * gate and the code is another, and nothing holds the two together. A gate that exits 0 having
 * checked nothing is the exact failure step 2 was written about, and `export const needs` present in
 * the text and absent from what actually runs would put the gate straight back in charge of its own
 * verdict, one level down from where step 2 took it away. An imported gate has ONE account:
 * `mod.needs` is the value the gate itself holds, read before `mod.default` has been called. That is
 * what "nothing happens on import" buys, and it is the whole of the argument.
 *
 * IT ALSO TAKES A SHAPE STEP 2 HAD TO REFUSE AND MAKES IT LEGAL. `export const needs =
 * needsOf(root)` cannot be read out of text before the gate runs, by construction, so step 2
 * refuses it; read off the module it is an ordinary value, computed by the gate and read before the
 * gate is called. EXCEPT UNDER `--built` AND `--unbuilt`, which choose from the text before anything is
 * imported, so there a computed `needs` is the same exit 2 and every gate keeps a literal list.
 *
 * THE DIALECT IS DECLARED IN `GATES` AND IS NEVER GUESSED FROM THE TEXT, AND THE FIRST VERSION OF
 * THIS GOT THAT WRONG IN A WAY THAT WAS ONE COMMIT FROM COSTING SOMETHING. It asked the text one
 * question, `EXPORTS_DEFAULT = /^export default\b/mu`, and IMPORTED any file that matched. A gate
 * that is still a script does its work at module top level, so a script that happened to match, for
 * any reason at all, would have run its whole body inside that import: above its own header line,
 * outside the timing and the capture, and before the `needs` check whose entire purpose is to stop a
 * gate running without what it needs. Measured with a two-line stub in `test/dialect.test.mjs`
 * (`console.log(...)` and then a line beginning `export default`): the stub's output printed ABOVE
 * `▸ bundle · imported` and the run reported `1 of 1 gates passed`. No gate in the tree matched by
 * accident, and the next person to migrate one was the person who would have found out.
 *
 * SO A TEXT MATCH CAN NOW ONLY REFUSE, AND IT CAN NEVER CAUSE AN IMPORT. `call(file)` in the table
 * above is the declaration, and the file's own text is read afterwards to check that the two accounts
 * AGREE, because a disagreement is exactly where both hazards live and neither is visible in a run:
 *
 *   * A call whose file does not carry the entry guard `if (import.meta.main)` is refused BEFORE it is
 *     imported. That guard is a gate saying, in the language rather than in a comment, that importing
 *     it does nothing, and it is the line every migrated gate here already ends with, because
 *     `self-test` spawns each gate file directly and a called gate has to keep working that way too.
 *   * A call whose file names no `export default` is refused before it is imported, for the same
 *     reason: the registration says import and the text says script, and finding out by importing it
 *     is the trap above.
 *   * A script whose file DOES name `export default` is refused as well. Half a migration is a
 *     function nobody calls, and `node stack.mjs` then defines it, calls nothing and exits 0, which
 *     this runner reads as a gate that passed. That is the silence this whole directory exists to
 *     break, so it is the one direction that may not be waved through.
 *   * And a file that says `export default` and hands back something that is not a function is exit 2
 *     naming the file, which is the one disagreement only the import itself can find.
 *
 * WHAT IT COSTS IS ISOLATION, AND THE SIX GATES THAT DRIVE A BROWSER ARE WHERE THAT BILL ARRIVES. A
 * spawned gate that throws, leaks a socket or leaves a browser running costs one exit code and one
 * process, and the process ending hands all of it back; a called one that throws would take this
 * runner and every gate after it down with it, so the call is wrapped and a throw is that gate's
 * failure. A handle is the part no wrapper can fix from out here: a server left on
 * a port is the next gate failing to bind, and a browser left running is a
 * runner that never exits. So each of those gates closes what it opened on every path out of itself,
 * including its early returns, and each one's header says so where somebody editing it will read it.
 *
 * THE GATES LEFT SPAWNED EACH HAVE A REASON. `typecheck` is `pnpm -r` through
 * a shell, `self-test` spawns every gate itself and would be this runner's work done twice in one
 * process, and `theme` passes `--check` to a script outside this directory, which a call cannot carry.
 * `stack` stays a script ON PURPOSE: `test/dialect.test.mjs`,
 * `test/durations.test.mjs` and `test/needs.test.mjs` each overwrite `stack.mjs` with a stub in a
 * copied tree and rely on `GATES` registering it as a spawn, because they need one real entry that
 * is spawned. Calling it would turn their script-shaped stubs into refusals, and the three would be
 * testing the refusal rather than the spawned path. It moves the day those tests pick another
 * stand-in, and not before.
 * Nothing goes red for any of them: a script gate is a supported dialect, not a gate waiting to be fixed.
 *
 * `clean-room`, `slash-actor` AND `no-declarations-in-kernel` MOVED BY EDITING THE GATE, NEVER BY A
 * WRAPPER HERE OR IN A LIBRARY. Measured on 22
 * September by importing each one from a stand-in for this file: `clean-room` reads its root from
 * `process.argv[2]`, which in this process is this runner's first flag, so `--only clean-room` made it
 * scan a directory called `--only` under the repository and throw `ENOENT`; `no-declarations-in-kernel` ran on the first
 * import and printed nothing on the second, because the module is cached; and `slash-actor`
 * called `process.exit` at top level, which would end this run. A wrapper that imports a
 * script is the trap described above with an extra file around it. So each now takes the root as its argument,
 * returns its finding rather than calling `process.exit`, closes what it opened on every path out, and ends with
 * the entry guard, which is the shape `52 §5.1` gives and `em-dash` took first.
 *
 * THE OTHER THING THE PROCESS BOUNDARY WAS DOING IS CONTAINING `process.exit`, and that one is
 * caught below rather than argued away: see `inside` at the run loop.
 *
 * AND AN IMPORTED GATE TAKES THE ROOT AS AN ARGUMENT. A spawned one was handed it as the child's
 * working directory and some of them default to `process.cwd()`; in this process that is wherever
 * the operator was standing, so `node ../../tools/gates/run.mjs` from inside a package would have
 * pointed those gates at that package. The root is this file's own, derived from `import.meta.url`.
 */
/** What a file has to carry to be a gate this runner CALLS, checked before it is ever imported. */
const EXPORTS_DEFAULT = /^export default\b/mu;
/**
 * The entry guard, which is a gate saying that importing it does nothing.
 *
 * ANCHORED AT THE START OF A LINE because a mention of `import.meta.main` inside a comment or a
 * string is prose about the rule rather than the rule, and this check decides whether a file is safe
 * to import. Every migrated gate in this directory ends with exactly this statement.
 */
const ENTRY_GUARD = /^if \(import\.meta\.main\)/mu;

/** What `mod.needs` may be: absent, or a list of names `NEEDS` defines. */
function importedNeeds(name, needs) {
  if (needs === undefined) return [];
  if (!Array.isArray(needs) || needs.some((n) => typeof n !== 'string'))
    refuse(
      `${name} exports a \`needs\` that is not a list of names, and a prerequisite is a name this runner can look up.`,
    );
  for (const need of needs)
    if (!Object.hasOwn(NEEDS, need))
      refuse(`${name} declares the prerequisite ${need}, and this runner knows ${Object.keys(NEEDS).join(' and ')}.`);
  return needs;
}

/** What `mod.slices` may be: absent, or how many parts at most this gate can be cut into. */
function importedSlices(name, slices) {
  if (slices === undefined) return 1;
  if (!Number.isInteger(slices) || slices < 1)
    refuse(`${name} exports a \`slices\` of ${JSON.stringify(slices)}, and it is the most parts the gate can be cut into, a whole number from 1.`);
  return slices;
}

const dialects = new Map();
for (const [name, [cmd, argv]] of SELECTED) {
  const file = scriptOf(argv);
  /* THE TEXT, OR NOTHING TO READ. A registered gate's file can be absent, and that is a failure the
     spawn reports one gate at a time rather than a reason to end the run: see `declaredNeeds`. */
  const source = file !== null && existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (cmd !== CALL) {
    /* A SCRIPT THAT DECLARES A GATE IS THE HALF-MIGRATION, and spawning it would check nothing while
       reporting a pass. The two accounts have to agree, and this is the direction where the
       disagreement is silent. */
    if (EXPORTS_DEFAULT.test(source))
      refuse(
        `${name} is registered as a script and its file names \`export default\`. In this directory a ` +
          `default export is a gate this runner CALLS, so spawning it may define a function and never ` +
          `run it, which reads here as a gate that passed. Register it with \`call(...)\`, or take the ` +
          `default export out.`,
      );
    dialects.set(name, { how: 'spawned' });
    continue;
  }
  /* AN ENTRY THAT PASSES FLAGS CANNOT BE CALLED, and dropping them silently is the failure worth
     naming: `theme` runs `theme.mjs --check`, and a call takes the root and nothing else, so the day
     a gate like that is registered as a call the two accounts of how to run it would differ by one
     argument and the gate would check the other thing. */
  const extra = argv.filter((a) => typeof a === 'string' && a !== file);
  if (file === null || extra.length > 0)
    refuse(
      `${name} is registered as a call and its GATES entry passes ${[file, ...extra].filter(Boolean).join(' ') || 'no file'}. ` +
        `A called gate is handed the root and nothing else, so anything else here would be dropped without a word.`,
    );
  /* A CALLED GATE'S FILE CAN BE ABSENT, AND THAT IS ONE GATE'S FAILURE RATHER THAN THE RUN'S, which
     is the argument `declaredNeeds` makes about the spawned half: a deletion leaves nothing in the
     directory for the unregistered-gate scan to see, and ending the run here would mean the
     thirty gates beside it were never asked over one missing file. A spawn gets that for
     nothing, because the child's non-zero exit is the report; there is no child here, so the report
     is a gate that says so and returns 1. */
  if (!existsSync(file)) {
    dialects.set(name, {
      how: 'imported',
      gate: () => {
        console.error(`  ${basename(file)} is registered as a call and is not there, so there was no gate to call.`);
        return 1;
      },
    });
    continue;
  }
  /* BOTH READ BEFORE THE IMPORT, because importing is the thing being decided. */
  if (!EXPORTS_DEFAULT.test(source))
    refuse(
      `${name} is registered as a call and names no \`export default\`. Importing it to find out is what ` +
        `runs a script gate's whole body inside this runner, so it is refused instead. Give it a default ` +
        `export, or register it as a script.`,
    );
  if (!ENTRY_GUARD.test(source))
    refuse(
      `${name} is registered as a call and has no \`if (import.meta.main)\` guard, which is how a gate says ` +
        `that importing it does nothing. Without it a body at module top level would run inside this ` +
        `import, above the gate's own line and before its prerequisites are read. It is also what keeps ` +
        `the gate runnable by hand and spawnable by \`self-test\`.`,
    );
  /**
   * AND AN IMPORT THAT THROWS IS THAT GATE'S FAILURE, NOT THE RUN'S, which is the argument the call
   * itself already got and this line did not.
   *
   * IT MATTERS MORE NOW THAN IT DID AN HOUR AGO. The eight gates step 3 started with import `lib.mjs`
   * and nothing else. The six added since import `@playwright/test`, `axe-core`'s bundle by path,
   * `record.mjs` (which reaches into `apps/selfhost` and two packages) and, in `passkey`, a `.ts`
   * module that Node strips types from as it loads. Any of those can fail to resolve in a tree that is
   * half installed, and an uncaught rejection here ends the process with a stack trace where the
   * summary should be, with every gate below this one never asked. That is the shape of failure this
   * file opens by refusing to have.
   */
  let mod;
  try {
    mod = await import(pathToFileURL(file).href);
  } catch (cause) {
    const said = cause?.stack ?? cause;
    dialects.set(name, {
      how: 'imported',
      gate: () => {
        console.error(`  ${name} could not be imported, so it was never asked anything: ${said}`);
        return 1;
      },
    });
    continue;
  }
  if (typeof mod.default !== 'function')
    refuse(
      `${name} names \`export default\` and it is not a function this runner can call. A gate is either a ` +
        `default-exported function that returns 1, 3 or nothing, or a script with no default export at all.`,
    );
  /* THE TEXT CHOSE THE JOB, SO THE MODULE HAS TO AGREE WITH IT: see `--unbuilt` above. */
  if (needsRead !== null) {
    const said = [...importedNeeds(name, mod.needs)].sort().join(', ') || 'nothing';
    const read = [...needsRead.get(name)].sort().join(', ') || 'nothing';
    if (said !== read)
      refuse(
        `${name} needs ${said} by its module and ${read} by its text, and --built and --unbuilt chose by the ` +
          `text. Write \`needs\` as a literal list, \`export const needs = ['web-build'];\`, so the two are one.`,
      );
  }
  dialects.set(name, { how: 'imported', gate: mod.default, needs: mod.needs, slices: importedSlices(name, mod.slices) });
}

/* EVERY PART OF THE SELECTION, in registry order, and the ones this run asks. Unsharded, a part is a whole
   gate and this run asks all of them, so nothing below changes for `pnpm gates`. */
const UNITS = SELECTED.flatMap(([name, entry]) => {
  const of = SHARD === null ? 1 : Math.min(dialects.get(name).slices ?? 1, SHARD.of);
  return Array.from({ length: of }, (_, i) => ({ name, entry, part: of === 1 ? null : { part: i + 1, of }, cost: (COST[name] ?? 1) / of }));
});
const label = (u) => (u.part === null ? u.name : `${u.name} (part ${u.part.part} of ${u.part.of})`);

function shardOf(units, { at, of }) {
  const load = Array(of).fill(0);
  const holds = Array.from({ length: of }, () => new Set());
  const longest = units.map((u, i) => [u, i]).sort(([a, i], [b, j]) => b.cost - a.cost || i - j);
  for (const [u] of longest) {
    const k = load.indexOf(Math.min(...load));
    load[k] += u.cost;
    holds[k].add(u);
  }
  return units.filter((u) => holds[at - 1].has(u));
}

const RUN = SHARD === null ? UNITS : shardOf(UNITS, SHARD);
if (RUN.length === 0) {
  console.error(
    `  part ${SHARD.at} of ${SHARD.of} holds no gate: this selection is ${UNITS.length} part(s), so the matrix is wider than it.`,
  );
  process.exit(2);
}
if (LIST) {
  for (const u of RUN) console.log(label(u));
  process.exit(0);
}

/* ASKED ONCE FOR THE WHOLE RUN, not once per gate. A build that appears halfway through must not
   give two gates with the same declaration two different verdicts. */
/* EACH ANSWER IS `null` FOR MET OR A SENTENCE SAYING WHY NOT, and it is awaited because the
   freshness walk stats every source file in the app and the packages. It is asked even when no
   selected gate declares it: measured at 31 ms on this tree on 22 September, which is less than
   deciding which gates need it would be worth. */
const why = new Map(await Promise.all(Object.entries(NEEDS).map(async ([need, spec]) => [need, await spec.unmet()])));
const unmetOf = new Map();
for (const [name, [, argv]] of SELECTED) {
  const d = dialects.get(name);
  const declared = d.how === 'imported' ? importedNeeds(name, d.needs) : declaredNeeds(name, scriptOf(argv));
  const unmet = declared.filter((need) => why.get(need) !== null);
  if (unmet.length > 0) unmetOf.set(name, unmet);
}

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
 *
 * AND NOW IT HOLDS TWO KINDS, COUNTED THE SAME AND SAYING DIFFERENT THINGS. A gate that exited 3
 * ran and found nothing to read. A gate this runner refused over an unmet `needs` never ran at all,
 * and its line says so in the runner's voice. Both are "could not run", which is what `--allow-skip`
 * and the `CI` rule are about, so neither needs its own counter; the difference is in the sentence a
 * reader gets, and it is the difference between a report and no report.
 */
const skipped = [];

/**
 * THE GATE THIS RUN IS INSIDE, and it is `null` every other moment.
 *
 * A GATE THAT WAS A SCRIPT COULD NOT END THIS RUN AND A GATE THAT IS A FUNCTION CAN. `process.exit`
 * inside an imported gate stops this process where it stands: the gates below it are never asked,
 * the summary never prints, and what a reader gets is one gate's output followed by silence and an
 * exit code. That is the shape of every defect this directory exists to catch, so it may not be the
 * shape of the runner's own failure. Measured with a stub gate whose whole body is `process.exit(3)`:
 * the run ended after that gate's line with no summary and nothing naming it, and `--only bundle,
 * em-dash` reported neither.
 *
 * THE HANDLER IS THE ONLY THING THAT CAN STILL SPEAK AT THAT POINT, which is why the check is here
 * and not a grep over the eight files. `self-test`'s `silent-pass` already refuses an explicit exit
 * 0, and this covers every other code a gate might exit with, including one somebody adds tomorrow.
 */
let inside = null;
process.on('exit', () => {
  if (inside === null) return;
  console.error(
    `\n  the run ended inside ${inside}, which called process.exit. An imported gate cannot do that:\n` +
      '  it takes this runner with it, so the gates after it were never asked and nothing printed above\n' +
      '  is a verdict on them. Return 1 for a finding or 3 for a skip, and leave the exiting here.\n',
  );
});

/**
 * HOW LONG EACH GATE TOOK, ON A LINE OF ITS OWN AFTER IT, whatever it answered.
 *
 * Eight gates were once priced for `ci.yml` from a runner that printed no duration, so every
 * figure in that table was the gap between two `▸` headers in a step log, and the
 * last gate of a run has no next header to subtract from. The closing glyph is `◂` and not `▸`
 * because the tests beside this file prove a gate was asked by matching `▸ <name>`, and a log read
 * that way would otherwise count every gate twice. `test/durations.test.mjs` holds the shape:
 * two spaces, `◂`, the name, `·`, seconds to one decimal, `s`.
 */
const took = (name, t0) => console.log(`  ◂ ${name} · ${((performance.now() - t0) / 1000).toFixed(1)} s`);

for (const unit of RUN) {
  const { name } = unit;
  const [cmd, args, opts] = unit.entry;
  const d = dialects.get(name);
  /* THE DIALECT IS ON THE LINE, because two ways of running a gate is two things that can be wrong
     and a reader of one screen of output should not have to work out which one a gate took. A part
     says which part after it, so `▸ <name>` still finds the gate. */
  const of = unit.part === null ? '' : ` · part ${unit.part.part} of ${unit.part.of}`;
  process.stdout.write(`\n▸ ${name} · ${d.how}${of}\n`);
  const t0 = performance.now();
  /* THE RUNNER'S REFUSAL, AND IT READS DIFFERENTLY FROM A GATE'S SKIP ON PURPOSE. Nothing was
     spawned, so nobody measured anything and nobody reported on it. It joins `skipped` because
     that is what a gate that could not run is, and `--allow-skip` and the CI rule below apply to
     it unchanged: CI builds first, so a refusal there says the build did not happen. */
  const unmet = unmetOf.get(name);
  if (unmet) {
    for (const need of unmet)
      console.log(`  ${name} was not run: it needs ${NEEDS[need].what}, and ${why.get(need)}. \`${NEEDS[need].how}\``);
    skipped.push(unit);
    continue;
  }
  if (d.how === 'imported') {
    let status;
    inside = name;
    try {
      /* THE ROOT, AND `?? 0` BECAUSE A PASS FALLS OFF THE END OF THE FUNCTION. That is the same
         property the gates had as scripts, where a pass was an unset `process.exitCode`, and
         `self-test`'s `silent-pass` grep is built on it: an explicit 0 in a gate is always an early
         return, and an early return that reports a pass is what that grep catches. */
      status = (await (unit.part === null ? d.gate(root) : d.gate(root, unit.part))) ?? 0;
    } catch (cause) {
      /* A THROW IS THIS GATE'S FAILURE AND NOT THE RUN'S. Spawning gave that for nothing: a child
         that died took its own exit code with it and the next gate still ran. In this process an
         uncaught throw would end the run with the gates below it never asked, which is the one thing
         this file says it will not do. */
      console.error(`  ${name} threw rather than reporting: ${cause?.stack ?? cause}`);
      failed.push(label(unit));
      took(name, t0);
      continue;
    } finally {
      /* `finally` RATHER THAN A LINE AFTER THE BLOCK, because the `catch` above ends in `continue`
         and a reset the failing path skips would name the wrong gate for the rest of the run. */
      inside = null;
    }
    took(name, t0);
    /* AND AN ANSWER OUTSIDE THE CONTRACT IS A FAILURE, NAMED, rather than a refusal that abandons
       the rest. A gate that returns 7 has not passed and has not skipped, and the gates after it are
       still worth asking. */
    if (status !== 0 && status !== 1 && status !== 3) {
      console.error(
        `  ${name} returned ${JSON.stringify(status)}, and a gate returns 1 for a finding, 3 for a skip, or nothing.`,
      );
      failed.push(label(unit));
    } else if (status === 3) skipped.push(unit);
    else if (status !== 0) failed.push(label(unit));
    continue;
  }
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: false, ...opts });
  took(name, t0);
  if (r.status === 3) skipped.push(unit);
  else if (r.status !== 0) failed.push(label(unit));
}

/* `--allow-skip` NAMES THE PREREQUISITE THIS JOB DOES NOT HAVE, one gate at a time, so that the job
   which does have it still goes red. A blanket "skips are fine here" is the same waiver the
   paragraph above refuses. */
const disallowed = skipped.filter((u) => !allowSkip.includes(u.name)).map(label);
if (disallowed.length && process.env.CI) failed.push(...disallowed);

// NAMED, not counted. "1 of 8 gates failed" over a screen of eight gates' output is a search.
const ran = RUN.length - skipped.length;
const aside = skipped.length === 0 ? '' : ', and ' + skipped.length + ' could not run: ' + skipped.map(label).join(', ');
/* AND A RUN THAT WAS ASKED FOR LESS SAYS SO. "14 of 14 gates passed" beside a nineteen-gate corpus
   is the sentence a subset would otherwise print, and it reads as the whole thing. */
const unasked = omitted.length === 0 ? '' : '\n  ' + omitted.length + ' were not asked for: ' + omitted.join(', ') + '.';
/* AND A PART SAYS WHAT THE OTHER PARTS HOLD, so its green line cannot read as the whole run's. */
const others = UNITS.filter((u) => !RUN.includes(u)).map(label);
const elsewhere =
  SHARD === null ? '' : '\n  this is part ' + SHARD.at + ' of ' + SHARD.of + (others.length === 0 ? '.' : ', and the others run: ' + others.join(', ') + '.');
/* AND THE SPLIT BETWEEN THE TWO DIALECTS, once, at the bottom. Four gates are still scripts, so
   the number that says how many were called is worth printing rather than counting by eye up the
   screen: it is how anybody notices a gate that quietly changed dialect, in either direction. */
const byImport = RUN.filter((u) => dialects.get(u.name).how === 'imported').map(label);
const how =
  '\n  ' +
  (byImport.length === 0
    ? 'all ' + RUN.length + ' were spawned.'
    : byImport.length + ' of ' + RUN.length + ' were imported rather than spawned: ' + byImport.join(', ') + '.');
console.log(
  (failed.length === 0
    ? '\n  ' + ran + ' of ' + RUN.length + ' gates passed' + aside + '.'
    : '\n  ' + [...new Set(failed)].length + ' of ' + RUN.length + ' gates failed: ' + [...new Set(failed)].join(', ') + '.') +
    unasked +
    elsewhere +
    how +
    '\n',
);

if (failed.length) process.exitCode = 1;
