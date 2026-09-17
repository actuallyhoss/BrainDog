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
  /* THE FOURTH NOTATION, and the plainest: `color: red`. The gate knew hex, `rgb()` and `oklch()`,
     so the two real scrims in this repository — `color-mix(in srgb, black …)`, at two strengths six
     per cent apart — had never been seen. ONE finding, and the fixture carries two decoys beside
     it: `content: 'gold'` and a grid area called `tan`. `tan`, `linen`, `plum` and `gold` are CSS
     colour names and ordinary English, so the rule is the PROPERTY plus the name, and a count of
     one is what proves the distinction rather than asserting it. */
  { gate: 'colour-grep-named', run: 'colour-grep', expect: /colour literal/, findings: 1 },
  /* `css-rules` CLAIMS ELEVEN OF `52 §5.2`'s TWELVE ROWS (row 12 is skipped — see the gate's own
     header) plus the two rules the table does not number, and this is where the finding that started
     this work landed: the gate seeded TWO cases for TWELVE-ish rules, so one working rule
     (`unknown-property`, below) made every other one look alive, including the four that had never
     fired once. `loop/finding-css-rules.md` is the record of it. One fixture per rule now, each one
     crafted so it trips EXACTLY the rule under test and nothing else — a fixture that also fires
     `unknown-property` on an incidental `var()` would assert a count that means something else. */
  { gate: 'css-rules-colour', run: 'css-rules', expect: /never a colour/, findings: 1 },
  { gate: 'css-rules-font-size', run: 'css-rules', expect: /escapes the type scale/, findings: 1 },
  { gate: 'css-rules', expect: /resolves to nothing/, findings: 1 },
  { gate: 'css-rules-outline', run: 'css-rules', expect: /focus-ok/, findings: 1 },
  { gate: 'css-rules-physical', run: 'css-rules', expect: /breaks under dir="rtl"/, findings: 1 },
  { gate: 'css-rules-zindex', run: 'css-rules', expect: /a fight the next literal wins/, findings: 1 },
  /* ROW 7 HAS TWO HALVES — an `<Icon size=…>` outside the four names, and a literal `width`/`height`
     on an `<svg>` — and one fixture carries both, so a count of two is what proves neither half is
     riding on the other's finding. */
  { gate: 'css-rules-icon-size', run: 'css-rules', expect: /not a number/, findings: 2 },
  { gate: 'css-rules-identifier-size', run: 'css-rules', expect: /two roles colliding/, findings: 1 },
  { gate: 'css-rules-icon-color', run: 'css-rules', expect: /currentColor only/, findings: 1 },
  { gate: 'css-rules-unemitted-class', run: 'css-rules', expect: /a rename left the rule behind/, findings: 1 },
  { gate: 'css-rules-media-beaten', run: 'css-rules', expect: /wins on source order/, findings: 1 },
  { gate: 'css-rules-faint', run: 'css-rules', expect: /not below 24px/, findings: 1 },
  { gate: 'css-rules-ellipsis', run: 'css-rules', expect: /does nothing on a flex/, findings: 1 },
  { gate: 'stack', expect: /finding\(s\)/, findings: 1 },
  /* THE RAW BYTE SCAN. The fixture is `Buffer.from`-built rather than typed, because a NUL byte
     does not survive being typed through an editing tool — the same reason the gate's own header
     insists on it for anyone seeding a case here. One finding: a NUL sitting inside a string
     literal, the shape of both real defects this gate was written for. */
  { gate: 'nul-bytes', expect: /a NUL byte at offset/, findings: 1 },

  /* THE FOUR HALVES OF `graph`, ONE FIXTURE EACH. A gate with three checks and one fixture is a
     gate with one check under test and two that have never been asked to fire — and this one's
     three are independent: a cycle is found in the manifests, an undeclared import in the source,
     and a relative escape in a specifier that resolves outside its own package.

     EACH FIXTURE CARRIES ITS OWN `docs/31-STACK.md`, because the gate reads the order out of the
     document rather than holding a copy of it. A fixture without one has no order at all, every
     package in it is unranked, and all four would go red for the same wrong reason.

     `graph-cycle` names its seeded file TWICE on purpose: a cycle inside a total order always
     contains an edge that points up it, so the same manifest line is reported by the cycle check
     and by the direction check. Two findings is the honest number. */
  { gate: 'graph-cycle', run: 'graph', expect: /cycle —/, findings: 2 },
  { gate: 'graph-direction', run: 'graph', expect: /points up the order/, findings: 1 },
  { gate: 'graph-undeclared', run: 'graph', expect: /undeclared import/, findings: 1 },
  { gate: 'graph-escape', run: 'graph', expect: /cross-package relative import/, findings: 1 },
  { gate: 'secret-grep', expect: /reaches a log/, findings: 1 },
  /* THE SAME LEAK UNDER THE NAME THE CODE USES. `52 §6`'s example is `console.log(plaintext)` and no
     file here has ever held a variable called that; the key hierarchy calls its secrets `plain`,
     `dek`, `kek`, `root` and `pkcs8`. One fixture per vocabulary, so widening the pattern is a thing
     that can be proved rather than asserted. */
  { gate: 'secret-grep-dek', run: 'secret-grep', expect: /reaches a log/, findings: 1 },
  /* THE THIRD SINK, AND THE ONE THIS GATE'S OWN MESSAGE NAMES FIRST: *"a credential never goes in
     the record."* One finding, not two — the fixture holds a real leak and an innocent call whose
     SQL merely contains the words `root`, `wrapped_by` and `kek`, because eight calls in the real
     tree are that shape and a gate red on all of them is a gate switched off. */
  { gate: 'secret-grep-record', run: 'secret-grep', expect: /reaches the record/, findings: 1 },
  /* THE FOURTH: a session id in a log. The same fixture posts the server key to its own host, which is the
     one transmission sign-in's four names exist for, so a count of one proves the gate tells them apart. */
  { gate: 'secret-grep-wire', run: 'secret-grep', expect: /sign-in secret reaches a log/, findings: 1 },
  /* THE FIFTH: an agent's key in `apps/cli/src/keys.ts`, sent from `depositOne`, the file's recorded exemption, and
     encoded to bytes that reach a log. One finding proves both halves: the exemption covers that function and
     nothing else, and a value is followed into a name that is not `plaintext`. */
  { gate: 'secret-grep-vault', run: 'secret-grep', expect: /a plaintext reaches a log/, findings: 1 },
  /* THE SIXTH: a key that comes back from a call. `const got = await getOne(…)` names no branded value, so
     `process.stdout.write(got.value)` was green until a same-file function whose return type names the brand was
     followed. The fixture also logs the answer of a deposit, a call whose return type does not, so one finding
     proves the gate follows only a return typed as plaintext. */
  { gate: 'secret-grep-return', run: 'secret-grep', expect: /a plaintext reaches standard output/, findings: 1 },
  /* THE SEVENTH, EIGHTH AND NINTH: the two keys September 17th added, which no name above matched. A report key's
     answer logged whole beside its id logged alone; an opened action key under a name on no list, beside a sentence
     that says "opened"; and `secret` in an error message, beside a bearer handed to `digest(`. One finding each proves
     the gate follows where the value came from and reads code, not prose. */
  { gate: 'secret-grep-report', run: 'secret-grep', expect: /a report key or an opened action key reaches a log/, findings: 1 },
  { gate: 'secret-grep-opened', run: 'secret-grep', expect: /a report key or an opened action key reaches a log/, findings: 1 },
  { gate: 'secret-grep-held', run: 'secret-grep', expect: /a report key or an opened action key reaches an error message/, findings: 1 },
  /* THREE, because a kind in one source and not the other three is three statements about the same
     drift — and which three is the repair. A count of one would pass a gate that compared two. */
  { gate: 'event-kinds', expect: /and migration 0001 does not/, findings: 3 },
  { gate: 'router-groups', expect: /INTERNAL is the host's own surface|puts it in INTERNAL/, findings: 2 },
  /* THE ACCOUNT TABLE, which reads the session cookie and nothing else. The fixture holds a correct row beside the
     seeded one, so a count of one proves the gate reads each row rather than going red on the table. */
  { gate: 'router-groups-account', run: 'router-groups', expect: /an account route reads the session cookie/, findings: 1 },
  /* THE REAL DEFECT, KEPT VERBATIM. `members` was routed ADMIN and guarded `guard(ctx, 'read')`, and
     thirteen of the fourteen ADMIN routes called `admin`. The fixture holds that one line beside
     three correct methods, so a count of one is what proves the gate distinguishes them rather than
     reporting every route it reads. */
  { gate: 'guards', expect: /routed as ADMIN and is guarded by guard\(\)/, findings: 1 },
  /* THE OTHER DIRECTION, AND THE ONE THAT IS SILENT IN REVIEW. `guards` had a single fixture, a
     method routed ADMIN and guarded `guard()`, so the gate was proved to catch a ceiling that is too
     LOW. A ceiling that is too high reads as care: `create` routed DATA and guarded `admin(ctx)`
     refuses every token and takes the eight MCP tools with it, and nothing had ever asked this gate
     to notice. The fixture's other five methods put DATA and `READ+` under both `guard` and
     `scoped`, so one finding is an assertion that those two groups share one list rather than an
     assertion that the gate went red about something. */
  { gate: 'guards-data', run: 'guards', expect: /routed as DATA and is guarded by admin\(\)/, findings: 1 },
  /* AND THE ONE ROUTE A KEY OUTSIDE ANY BROWSER CALLS AS OFTEN AS IT LIKES: `report` spending no budget, and the number
     the record enforces moved away from `budgets.json`'s `report.rowsPerMinute`. One each, so both halves are proved. */
  { gate: 'guards-report', run: 'guards', expect: /spends no reportBudget/, findings: 1 },
  { gate: 'guards-report-budget', run: 'guards', expect: /report.rowsPerMinute is/, findings: 1 },
  { gate: 'closed-lists', expect: /the migration admits/, findings: 1 },
  /* THE SHELL CHECK, WHICH READS EVERY `apps/*\/src/app.html` IN THE WORKSPACE. It is in `bundle`
     because that gate already reads a built shell, and until now it read only the built one, only
     for `apps/web`, and only when there was a build. The source form needs neither, and it reaches
     `apps/site`, which nothing in this suite had ever read a line of. The fixture spells the body
     placeholder twice and the head placeholder once, so a count of one is what proves the gate
     reports the placeholder that is wrong rather than every placeholder it finds. */
  { gate: 'bundle-shell', run: 'bundle', expect: /a shell the build cannot substitute/, findings: 1 },
  /* ONE LINE NAMES THE CODE, and the fixture drops exactly one. The gate reports two findings for
     it — the missing code, and the family whose size no longer matches — and only the first can
     name it, because the second is about a count. `findings` here is *lines that name the seeded
     token*, not *findings the gate made*, and conflating them is how a fixture ends up asserting a
     number that means something else. */
  /* ONE BYPASS, AND THE FIXTURE'S KERNEL IS OTHERWISE HONEST: three of its four writers call
     `sparkMayWrite`, and the fourth appends the event itself. That is `spark.ts`'s own "a sixth
     writer would be a sixth call" written as a tree. One finding, because the other three still
     refuse and the query returns exactly the row the bypass wrote. */
  { gate: 'spark-actor', expect: /spark wrote \w+, in the seed record/, findings: 1 },

  { gate: 'refusals', expect: /and REFUSAL_CODES does not/, findings: 1 },

  /* TWO CODES NAMED IN ONE SOURCE FILE AND ONE OF THEM FIXTURED, and the seeded violation is the
     second — which is the rule that matters, because a code the tree already hands to callers with
     no fixture is the enumeration rotting in the direction that costs something. The file names two
     codes on purpose: a gate counting fixtures rather than finding gaps would report zero or two
     here, and only "one" is the right answer. */
  { gate: 'refusal-fixtures', expect: /and has no fixture/, findings: 1 },
  /* ONE, and the fixture holds two flags so the count means something: one declared and never
     read, one declared and read. A gate that reported both would be counting flags rather than
     finding dead ones. */
  { gate: 'flags', expect: /a branch nobody takes/, findings: 1 },
  { gate: 'no-declarations-in-kernel', expect: /declaration written in the kernel/, findings: 1 },
  /* THE SEEDED FIXTURE HOLDS TWO SENTENCES AND RENDERS ONE, so a gate that named both — or neither —
     is a gate that is counting keys rather than finding dead ones. */
  { gate: 'dead-copy', expect: /nobody reads/, findings: 1 },

  /* AND THE SHAPE `dead-copy` COULD NOT SEE: a sentence whose only renderer is a module nothing
     imports. It cost a real one — `copy.alpha`, the word that tells the alpha deployment apart from
     the real record, named only by a component that had never been mounted. A grep over source said
     it was rendered. */
  { gate: 'dead-copy-orphan', run: 'dead-copy', expect: /nobody reads/, findings: 1 },
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

/**
 * The a11y gate's `intent-without-glyph` negative, and it cannot be a fixture tree either.
 *
 * `13 §5.1`'s rule is about what reaches the DOM, so the only place it can be checked is a rendered
 * page. `BRAINDOG_GATE_SEED=intent` prepends an `a[data-intent="bad"]` with no name for the intent
 * and the gate must go red.
 *
 * AN ANCHOR BECAUSE A `div` PROVED NOTHING. The gate's exemption was written `button, a[href], …`,
 * so every phone card — each one an anchor — was exempt, and the negative was seeding the one shape
 * that could not slip through. The rule looked tested and covered a third of what it claimed.
 */
function seededIntent() {
  if (!existsSync(join(here, '..', '..', 'apps/web/build'))) {
    console.log('  a11y: no build, so its negative is not run');
    return;
  }
  const r = spawnSync(process.execPath, [join(here, 'a11y.mjs')], {
    cwd: join(here, '..', '..'),
    encoding: 'utf8',
    env: { ...process.env, BRAINDOG_GATE_SEED: 'intent' },
  });
  const said = `${r.stdout}${r.stderr}`;
  if (r.status === 0 || !said.includes('a.seeded[bad]')) {
    console.error('  a11y: PASSED an intent with no glyph — colour is carrying meaning alone and nothing sees it.');
    failed.push('a11y');
  } else {
    ran++;
    console.log('  a11y: red on an intent with no glyph');
  }
}

/**
 * The prefs gate's negative, and it cannot be a fixture tree either.
 *
 * `BRAINDOG_GATE_SEED=prefs` pins `--row-h`, `--t-ui` and `--text` to constants — which is precisely what the
 * build shipped for the life of the Text control — and the gate must notice that two settings come
 * back identical.
 */
function seededPrefs() {
  if (!existsSync(join(here, '..', '..', 'apps/web/build'))) {
    console.log('  prefs: no build, so its negative is not run');
    return;
  }
  const r = spawnSync(process.execPath, [join(here, 'prefs.mjs')], {
    cwd: join(here, '..', '..'),
    encoding: 'utf8',
    env: { ...process.env, BRAINDOG_GATE_SEED: 'prefs' },
  });
  const said = `${r.stdout}${r.stderr}`;
  if (r.status === 0 || !said.includes('the body step')) {
    console.error('  prefs: PASSED a pinned token — a preference could reach the cookie and nothing else.');
    failed.push('prefs');
  } else {
    ran++;
    console.log('  prefs: red on a preference pinned to a constant');
  }
}

/**
 * The keys gate's negative, and it cannot be a fixture tree.
 *
 * `BRAINDOG_GATE_SEED=keys` swallows every `y` in the capture phase, which is what a binding nobody
 * wrote looks like from outside the page — and the gate must name `copy-id`.
 */
function seededKeys() {
  if (!existsSync(join(here, '..', '..', 'apps/web/build'))) {
    console.log('  keys: no build, so its negative is not run');
    return;
  }
  const r = spawnSync(process.execPath, [join(here, 'keys.mjs')], {
    cwd: join(here, '..', '..'),
    encoding: 'utf8',
    env: { ...process.env, BRAINDOG_GATE_SEED: 'keys' },
  });
  const said = `${r.stdout}${r.stderr}`;
  if (r.status === 0 || !said.includes('copy-id')) {
    console.error('  keys: PASSED a swallowed key — the sheet could advertise a binding nothing answers.');
    failed.push('keys');
  } else {
    ran++;
    console.log('  keys: red on a key the page never receives');
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
seededIntent();
seededPrefs();
seededKeys();

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
