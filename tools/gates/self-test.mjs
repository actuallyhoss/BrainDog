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
 * HOW IT WORKS. `tools/gates/negative/<gate>/` holds one seeded violation: a minimal tree the gate
 * runs against with its root pointed at the fixture. Each gate must exit non-zero and name the
 * seeded file. A gate that passes its own negative is reported by name, and the run is red.
 *
 * WHY A FIXTURE TREE RATHER THAN A UNIT TEST. The thing under test is the gate as CI runs it:
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
     so the two real scrims in this repository (`color-mix(in srgb, black …)`, at two strengths six
     per cent apart) had never been seen. ONE finding, and the fixture carries two decoys beside
     it: `content: 'gold'` and a grid area called `tan`. `tan`, `linen`, `plum` and `gold` are CSS
     colour names and ordinary English, so the rule is the PROPERTY plus the name, and a count of
     one is what proves the distinction rather than asserting it. */
  { gate: 'colour-grep-named', run: 'colour-grep', expect: /colour literal/, findings: 1 },
  /* `css-rules` CLAIMS ELEVEN OF `52 §5.2`'s TWELVE ROWS (row 12 is skipped; see the gate's own
     header) plus the two rules the table does not number, and this is where the finding that started
     this work landed: the gate seeded TWO cases for TWELVE-ish rules, so one working rule
     (`unknown-property`, below) made every other one look alive, including the four that had never
     fired once. `loop/finding-css-rules.md` is the record of it. One fixture per rule now, each one
     crafted so it trips EXACTLY the rule under test and nothing else. A fixture that also fires
     `unknown-property` on an incidental `var()` would assert a count that means something else. */
  { gate: 'css-rules-colour', run: 'css-rules', expect: /never a colour/, findings: 1 },
  { gate: 'css-rules-font-size', run: 'css-rules', expect: /escapes the type scale/, findings: 1 },
  { gate: 'css-rules', expect: /resolves to nothing/, findings: 1 },
  { gate: 'css-rules-outline', run: 'css-rules', expect: /focus-ok/, findings: 1 },
  { gate: 'css-rules-physical', run: 'css-rules', expect: /breaks under dir="rtl"/, findings: 1 },
  { gate: 'css-rules-zindex', run: 'css-rules', expect: /a fight the next literal wins/, findings: 1 },
  /* ROW 7 HAS TWO HALVES (an `<Icon size=…>` outside the four names, and a literal `width`/`height`
     on an `<svg>`) and one fixture carries both, so a count of two is what proves neither half is
     riding on the other's finding. */
  { gate: 'css-rules-icon-size', run: 'css-rules', expect: /not a number/, findings: 2 },
  { gate: 'css-rules-identifier-size', run: 'css-rules', expect: /two roles colliding/, findings: 1 },
  { gate: 'css-rules-icon-color', run: 'css-rules', expect: /currentColor only/, findings: 1 },
  { gate: 'css-rules-unemitted-class', run: 'css-rules', expect: /rename left the rule behind/, findings: 1 },
  /* TWO VIOLATIONS AND SEVEN DECOYS, and the count is what proves the decoys are still forgiven.
     One violation is a refusal sentence in `.ts` and the other is prose in the README of a package
     whose `package.json` does not say `private`, because those are the two kinds of writing this
     gate reads and a fixture that exercised one would not notice the other going quiet.

     The decoys all hold an em dash spaced on both sides, which is the exact shape the gate refuses:
     a block comment, a line comment, two SQL column annotations inside a schema literal, a fenced
     code block, an inline code span and an HTML comment. A bare glyph and a heading rule sit there
     too, unspaced. If any exemption stops working this goes to three or more rather than staying
     green, and an exemption nothing tests is an exemption that quietly widens. */
  /* TWO FIXTURES AND ONE SENTENCE, because the rule has two halves and a count of one proves each.
     Both trees carry the line *"A seeded sentence — in prose, outside any fence."* in a README, and
     the only difference between them is `private` in the manifest. `em-dash` is private and its one
     finding is in the source, which says the README was forgiven; `em-dash-readme` is published and
     its one finding is the README, which says the same sentence is read when a stranger can reach
     it. Seeding both halves in one tree would have made the total two and `named()` one, which is
     how this pair was born. */
  { gate: 'em-dash', expect: /used as punctuation/, findings: 1 },
  { gate: 'em-dash-readme', run: 'em-dash', expect: /used as punctuation/, findings: 1 },
  { gate: 'css-rules-media-beaten', run: 'css-rules', expect: /wins on source order/, findings: 1 },
  { gate: 'css-rules-faint', run: 'css-rules', expect: /not below 24px/, findings: 1 },
  { gate: 'css-rules-ellipsis', run: 'css-rules', expect: /does nothing on a flex/, findings: 1 },
  { gate: 'stack', expect: /finding\(s\)/, findings: 1 },
  /* AND THE OTHER HALF OF THAT RULE: a `fetch(` the gate must NOT name. `37 §2.2`'s `Http` port
     declares a method called `fetch`, and the rule matched the signature exactly as it matches a
     call, so the gate that stops a package reaching the network reported the port that exists so
     none of them does. The fixture holds both in one file and asserts a count of one, because a
     gate that went red here would look identical to a gate that got it right. */
  { gate: 'stack-signature', run: 'stack', expect: /calls fetch/, findings: 1 },
  /* THE ONE SCOPED RULE, AND BOTH HALVES OF IT. `43 §8` bans regular expressions under
     `packages/extract` and nowhere else, so the fixture seeds three: a literal and a constructor
     inside that package, which must be named, and a literal in another package, which must not.
     Two findings rather than three is the assertion: a count of three would mean the gate had
     quietly become a repository-wide ban, and a count of one would mean it knew the slash form and
     not `new RegExp(source)`, which is the spelling somebody reaches for next. */
  { gate: 'stack-regexp', run: 'stack', expect: /compiles nothing/, findings: 2 },
  /* THE RAW BYTE SCAN. The fixture is `Buffer.from`-built rather than typed, because a NUL byte
     does not survive being typed through an editing tool, the same reason the gate's own header
     insists on it for anyone seeding a case here. One finding: a NUL sitting inside a string
     literal, the shape of both real defects this gate was written for. */
  { gate: 'nul-bytes', expect: /a raw NUL at offset/, findings: 1 },

  /* AND THE CLASS THAT SHIPPED MORE OFTEN THAN NUL DID. The gate read 0x00 alone for months while
     its own header described the general defect, and widening it to every C0 control turned up
     nine bytes the tree had been carrying, three of them a word-boundary escape that had lost its
     backslash. One seeded case per class is not the standard here, but one seeded case for the
     ONLY class a gate used to see would leave the whole widening untested, which is the state this
     fixture is here to end. */
  { gate: 'nul-bytes-backspace', run: 'nul-bytes', expect: /a raw BACKSPACE at offset/, findings: 1 },

  /* THE FOUR HALVES OF `graph`, ONE FIXTURE EACH. A gate with three checks and one fixture is a
     gate with one check under test and two that have never been asked to fire, and this one's
     three are independent: a cycle is found in the manifests, an undeclared import in the source,
     and a relative escape in a specifier that resolves outside its own package.

     EACH FIXTURE CARRIES ITS OWN `docs/31-STACK.md`, because the gate reads the order out of the
     document rather than holding a copy of it. A fixture without one has no order at all, every
     package in it is unranked, and all four would go red for the same wrong reason.

     `graph-cycle` names its seeded file TWICE on purpose: a cycle inside a total order always
     contains an edge that points up it, so the same manifest line is reported by the cycle check
     and by the direction check. Two findings is the honest number. */
  /* AND `expect` IS ANCHORED ON THE RULE'S VOCABULARY, NOT ON ITS PUNCTUATION. This pattern read
     the word `cycle` followed by an em dash, and a sweep of those over the other gate files turned
     `graph`'s finding into `cycle: kernel → where → kernel. where → kernel closes it`, which the
     pattern could no longer match. Two words the rule cannot be stated without survive a reformat; a dash between them
     does not.

     THE FAILURE MODE HERE IS ALREADY THE SAFE ONE, which is why this is a better pattern rather
     than a new mechanism. A stale `expect` lands on the branch below that prints "went red with a
     sentence this test does not recognise" and pushes the gate onto `failed`, so the run is red
     and the gate is named. Nothing goes quiet: the cost of rewording a finding is a false red
     against this table, which is the direction a test of tests should fail in. */
  { gate: 'graph-cycle', run: 'graph', expect: /\bcycle\b.*\bcloses it\b/u, findings: 2 },
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
     the record."* One finding, not two: the fixture holds a real leak and an innocent call whose
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
     drift, and which three is the repair. A count of one would pass a gate that compared two. */
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
  /* AND THE OTHER HALF OF THAT GATE: a `CHECK` a later migration widened, over a document that
     never says which migration did it. `30 §1` is migration 0001 verbatim and cannot be corrected
     to the running schema, so this is the only thing standing between a member the database
     enforces and nobody being able to learn it exists by reading. */
  { gate: 'closed-lists-widened', run: 'closed-lists', expect: /widened outbox\.kind/, findings: 1 },
  /* THE LIST, NOT THE COUNT. The fixture swaps `lookup` for `regex` and leaves the ten at ten, so
     every check that counts agrees and the vocabulary a declaration may use to read a stranger's
     message has quietly gained a member nobody reviewed. That is the whole argument for reading a
     closed list rather than counting it, and it is the one the render kinds table lost first. */
  { gate: 'closed-lists-extractors', run: 'closed-lists', expect: /not the same list in the same order/, findings: 1 },
  /* THE SHELL CHECK, WHICH READS EVERY `apps/*\/src/app.html` IN THE WORKSPACE. It is in `bundle`
     because that gate already reads a built shell, and until now it read only the built one, only
     for `apps/web`, and only when there was a build. The source form needs neither, and it reaches
     `apps/site`, which nothing in this suite had ever read a line of. The fixture spells the body
     placeholder twice and the head placeholder once, so a count of one is what proves the gate
     reports the placeholder that is wrong rather than every placeholder it finds. */
  { gate: 'bundle-shell', run: 'bundle', expect: /a shell the build cannot substitute/, findings: 1 },
  /* ONE LINE NAMES THE CODE, and the fixture drops exactly one. The gate reports two findings for
     it (the missing code, and the family whose size no longer matches) and only the first can
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
     second, which is the rule that matters, because a code the tree already hands to callers with
     no fixture is the enumeration rotting in the direction that costs something. The file names two
     codes on purpose: a gate counting fixtures rather than finding gaps would report zero or two
     here, and only "one" is the right answer. */
  { gate: 'refusal-fixtures', expect: /and has no fixture/, findings: 1 },
  /* `derived:` SAYS A CODE IS READ OFF AN ENVELOPE, and the one thing it must never become is a way
     to quieten a fixture that never needed it. So the tree seeded for it claims the key on a code
     whose own site constructs it, which is the branch that keeps the key narrow. The other four
     branches are proved by mutation in the gate's own header. */
  { gate: 'refusal-fixtures-derived', run: 'refusal-fixtures', expect: /derived from .*itself/, findings: 1 },
  /* ONE, and the fixture holds two flags so the count means something: one declared and never
     read, one declared and read. A gate that reported both would be counting flags rather than
     finding dead ones. */
  { gate: 'flags', expect: /a branch nobody takes/, findings: 1 },
  { gate: 'no-declarations-in-kernel', expect: /declaration written in the kernel/, findings: 1 },
  /* THE SEEDED FIXTURE HOLDS TWO SENTENCES AND RENDERS ONE, so a gate that named both (or neither)
     is a gate that is counting keys rather than finding dead ones. */
  { gate: 'dead-copy', expect: /nobody reads/, findings: 1 },

  /* AND THE SHAPE `dead-copy` COULD NOT SEE: a sentence whose only renderer is a module nothing
     imports. It cost a real one: `copy.alpha`, the word that tells the alpha deployment apart from
     the real record, named only by a component that had never been mounted. A grep over source said
     it was rendered. */
  { gate: 'dead-copy-orphan', run: 'dead-copy', expect: /nobody reads/, findings: 1 },
];

/** How many lines of a gate's output name the seeded file. One per seeded violation. */
const named = (said, seeded) => said.split('\n').filter((l) => l.includes(seeded)).length;

/**
 * THE SENTENCE IS THE WORDS AND NOT THEIR CAPITALISATION, so every `expect` above is matched
 * case-insensitively.
 *
 * TWICE IN TWO DAYS A REWORDING HAS UNHOOKED ONE OF THESE, and both times for a reason that had
 * nothing to do with the rule under test. `graph`'s cycle finding lost the em dash the pattern was
 * anchored on. `css-rules`'s `unemitted-class` message had a comma before *"a rename left the rule
 * behind"* turned into a full stop, which capitalised the `a`, and the pattern went from matching
 * to not matching without a single word changing.
 *
 * THE FIX IS TO MATCH WHAT THE ASSERTION IS ABOUT. No gate in this directory has two findings that
 * differ only in case, so nothing is weakened by ignoring it, and one entire class of false red
 * stops happening. The other half of the answer is in the patterns themselves: anchor on the words
 * a rule cannot be stated without, never on the punctuation between them.
 *
 * AND THE FAILURE IS LOUD EITHER WAY, which is why this stays a pattern match rather than becoming
 * machine-readable finding codes across thirty gates. A pattern that no longer matches makes this
 * run red and names the gate; it has never been able to turn into a quiet pass. A test of tests
 * should fail towards the false red, and this one does.
 */
const recognises = (expect) => (expect.flags.includes('i') ? expect : new RegExp(expect.source, `${expect.flags}i`));

const failed = [];

/**
 * THE NEGATIVES THAT WERE NEVER ASKED, held apart from the ones that failed.
 *
 * A gate whose negative could not be run has not passed and has not failed, and those are three
 * outcomes rather than two. Keeping the third in its own list is what lets the summary at the
 * bottom print a denominator instead of a total that quietly shrank.
 */
const notRun = [];

/**
 * The negatives that cannot be a fixture tree, because the thing under test is a real browser over
 * a real build. Five gates run that way, and each one is run again with one violation seeded.
 *
 * THREE OUTCOMES, NOT TWO, AND THE THIRD IS THE ONE THAT COST AN EVENING. This was written as
 * `if (r.status === 0 || !said.includes(names))`, so a gate that went red for something else
 * entirely (a route that never settled, a browser that would not launch, a build too old for the
 * fixtures it is served with) was reported in the same words as a gate that saw the seeded
 * violation and shrugged: "PASSED an intent with no glyph". That sentence sends a reader into the
 * rule, and the rule was fine. The fixture runner below has always said "went red but never named
 * X" and printed what the gate did say; these four now say the same thing, for the same reason.
 *
 * AND THE TAIL RATHER THAN THE HEAD. A browser gate's first lines are a row of progress dots per
 * width and scheme; its findings are at the bottom. The fixture gates print theirs first, which is
 * why that branch slices the other end.
 */
const BROWSER = [
  /**
   * `layout`: `BRAINDOG_GATE_SEED=1` puts a 2000px heading inside `#main`, the exact bug the gate
   * is named after, and the one it could not see while it treated the app's own scroll container
   * as an exemption.
   */
  {
    gate: 'layout',
    seed: '1',
    names: 'reaches 2000px',
    blind: 'PASSED a 2000px heading inside #main. It is examining nothing.',
    red: 'red on a 2000px heading inside #main',
  },
  /**
   * `a11y`: `BRAINDOG_GATE_SEED=intent` prepends an `a[data-intent="bad"]` with no name for the
   * intent. `13 §5.1`'s rule is about what reaches the DOM, so a rendered page is the only place it
   * can be checked.
   *
   * AN ANCHOR BECAUSE A `div` PROVED NOTHING. The gate's exemption was written `button, a[href], …`,
   * so every phone card, each one an anchor, was exempt, and the negative was seeding the one
   * shape that could not slip through. The rule looked tested and covered a third of what it claimed.
   */
  {
    gate: 'a11y',
    seed: 'intent',
    names: 'a.seeded[bad]',
    blind: 'PASSED an intent with no glyph. Colour is carrying meaning alone and nothing sees it.',
    red: 'red on an intent with no glyph',
  },
  /**
   * `prefs`: `BRAINDOG_GATE_SEED=prefs` pins `--row-h`, `--t-ui` and `--text` to constants, which
   * is precisely what the build shipped for the life of the Text control, and the gate must notice
   * that two settings come back identical.
   */
  {
    gate: 'prefs',
    seed: 'prefs',
    names: 'the body step',
    blind: 'PASSED a pinned token. A preference could reach the cookie and nothing else.',
    red: 'red on a preference pinned to a constant',
  },
  /**
   * `keys`: `BRAINDOG_GATE_SEED=keys` swallows every `y` in the capture phase, which is what a
   * binding nobody wrote looks like from outside the page, and the gate must name `copy-id`.
   */
  {
    gate: 'keys',
    seed: 'keys',
    names: 'copy-id',
    blind: 'PASSED a swallowed key. The sheet could advertise a binding nothing answers.',
    red: 'red on a key the page never receives',
  },
  /**
   * `queue`: `BRAINDOG_GATE_SEED=queue` puts the cheapest band at the top of the queue and the
   * dearest at the bottom, which is `19 §6`'s fourth countermeasure read backwards. The rank is
   * computed in one file, carried through a page source, and drawn by two renderers, and every one
   * of those seams has its own test; what nothing asserted until this gate is the end of the chain,
   * so what nothing can assert until this negative is that the gate looks at it.
   */
  {
    gate: 'queue',
    seed: 'queue',
    names: 'not ranked by cost of being wrong',
    blind: 'PASSED a queue with the cheapest question first. The ranking could be reversed and nothing would say.',
    red: 'red on a queue ranked backwards',
  },
];

function seededBrowser({ gate, seed, names, blind, red }) {
  /* SKIPPED WHEN THERE IS NO BUILD, like the gate itself, AND WRITTEN DOWN. This returned without
     touching either counter, so the five browser negatives could every one of them be skipped and
     the only trace was five lines above a summary that still read like a full pass. */
  if (!existsSync(join(here, '..', '..', 'apps/web/build'))) {
    console.log(`  ${gate}: no build, so its negative is not run`);
    notRun.push(gate);
    return;
  }
  const r = spawnSync(process.execPath, [join(here, `${gate}.mjs`)], {
    cwd: join(here, '..', '..'),
    encoding: 'utf8',
    env: { ...process.env, BRAINDOG_GATE_SEED: seed },
  });
  const said = `${r.stdout}${r.stderr}`;
  if (r.status === 0) {
    console.error(`  ${gate}: ${blind}`);
    failed.push(gate);
  } else if (!said.includes(names)) {
    console.error(`  ${gate}: went red but never named ${names}, so this run says nothing about the rule. What it did say:`);
    console.error(
      said
        .split('\n')
        .filter((l) => l.trim())
        .slice(-8)
        .map((l) => `      ${l}`)
        .join('\n'),
    );
    failed.push(gate);
  } else {
    ran++;
    console.log(`  ${gate}: ${red}`);
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
    console.error(`  ${gate}: PASSED its own seeded violation. It is checking nothing.`);
    failed.push(gate);
  } else if (!said.includes(seeded)) {
    console.error(`  ${gate}: went red but never named ${seeded}.`);
    console.error(said.split('\n').slice(0, 6).map((l) => `      ${l}`).join('\n'));
    failed.push(gate);
  } else if (!recognises(expect).test(said)) {
    console.error(`  ${gate}: went red with a sentence this test does not recognise. What it did say:`);
    console.error(
      said
        .split('\n')
        .filter((l) => l.trim())
        .slice(0, 6)
        .map((l) => `      ${l}`)
        .join('\n'),
    );
    failed.push(gate);
  } else if (named(said, seeded) !== findings) {
    /* THE COUNT, NOT ONLY THE COLOUR. The colour-grep fixture used to carry three forms in one
       file and this only asserted that the gate went red, so reverting any two of the three
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

for (const b of BROWSER) seededBrowser(b);

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
 * number that looks reviewed and asserts nothing: somebody tightens it, the diff is approved, and
 * the gate goes on measuring against whatever it holds instead. That is strictly worse than no
 * budget at all, because a missing one is visible and a dead one is not.
 *
 * IT GREPS FOR `.key` RATHER THAN PARSING. A gate reads its section into a one-letter binding, so
 * the use is `B.mainJsBrotli` and the name is unambiguous across this directory: no other file
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

/**
 * AND NO GATE REPORTS A PASS IT DID NOT EARN.
 *
 * TWO GATES SHIPPED A SKIP THAT WAS A GREEN TICK. `passkey.mjs` and `queue.mjs` each found no
 * `apps/web/build`, printed a sentence saying nothing had been driven, and then exited 0, which
 * `run.mjs` counts as a gate that passed. Both carried a header paragraph claiming that a skip was
 * printed and never passed off as a pass, so the false claim and the code contradicting it sat
 * forty lines apart in one file and the file read as though it had been thought about. A fresh
 * checkout reported the passkey ceremony and the queue green having opened no browser at all.
 *
 * THE RULE IS THE LITERAL AND NOT THE BEHAVIOUR, because the literal is enough. A gate that
 * genuinely passes exits 0 by falling off the end with `process.exitCode` unset, and nothing here
 * needs to say so out loud. An explicit `process.exit(0)` in a gate is therefore always an early
 * return, and an early return that reports a pass is the whole of this defect. One grep over the
 * directory catches it before a single gate has run.
 *
 * WHY NOT TEACH `run.mjs` TO NOTICE, which is the obvious place for it? Because the runner cannot
 * see what a gate said. It spawns each one with `stdio: "inherit"`, so the lines go straight to the
 * terminal and the runner holds none of them; to judge a gate by its output it would first have to
 * capture the stream, and `spawnSync` cannot capture and stream at the same time. The version that
 * works is an async `spawn` with a tee, and the cheap version of that turns a nineteen-minute
 * browser gate into nineteen minutes of silence followed by a dump. That is a rewrite of the runner
 * and a worse terminal, to catch a defect a grep catches for nothing.
 *
 * IT DOES NOT REPLACE `52 §5.1`, which specifies a runner that reads each gate's declared `needs`
 * and checks them itself, so a gate never gets the chance to mis-report an unmet one. That design
 * is the better one and it is not built. This is the guard for the tree that exists.
 *
 * A COMMENT MAY DISCUSS THE DEFECT WITHOUT SPELLING IT, and the ones that do already say "exited
 * 0" rather than writing the call. The grep reads comments too, on purpose: a directory where the
 * forbidden line can hide inside a block comment is a directory where the rule is advisory.
 */
function noSilentPass() {
  const EXIT_ZERO = [/process\.exit\(\s*0\s*\)/u, /process\.exitCode\s*=\s*0\b/u];

  /* THE TWO RUNNERS ARE NOT GATES, which is the exemption `run.mjs` makes by the same two names. An
     aggregator that finishes with nothing to report is entitled to say so out loud; a gate is not,
     because a gate saying so is a claim about something it measured. */
  const RUNNERS = new Set(['run.mjs', 'self-test.mjs']);

  /* AND THE ONE REGISTERED GATE THAT DOES NOT LIVE HERE. `run.mjs`'s `theme` entry runs
     `packages/skin/scripts/theme.mjs --check`, so a rule that read only this directory would leave
     the single gate outside it uncovered, which is the shape of hole this file exists to close. */
  const FILES = [
    ...readdirSync(here)
      .filter((f) => f.endsWith('.mjs') && !RUNNERS.has(f))
      .map((f) => ({ name: f, at: join(here, f) })),
    { name: 'packages/skin/scripts/theme.mjs', at: join(here, '..', '..', 'packages', 'skin', 'scripts', 'theme.mjs') },
  ];

  const offenders = FILES.flatMap(({ name, at }) =>
    readFileSync(at, 'utf8')
      .split(String.fromCharCode(10))
      .flatMap((line, i) => (EXIT_ZERO.some((re) => re.test(line)) ? [`${name}:${i + 1}`] : [])),
  );

  if (offenders.length) {
    console.error(`  silent-pass: ${offenders.length} gate line(s) exit 0 on purpose: ${offenders.join(', ')}.`);
    console.error('      A gate that passed exits 0 by falling off the end, so an explicit one is an early');
    console.error('      return, and an early return that reports a pass is a gate nobody can tell apart');
    console.error('      from a gate that worked. Exit 3, which run.mjs reads as a skip and never as a pass.');
    failed.push('silent-pass');
    return;
  }
  ran++;
  console.log(`  silent-pass: none of ${FILES.length} gate files exits 0 on purpose`);
}

budgetsAreRead();
noSilentPass();

/**
 * AND THE ANSWER IS ONE CLAIM, so it may not be made from part of the evidence.
 *
 * `ran` USED TO BE PRINTED WITH NO DENOMINATOR. The five browser negatives need `apps/web/build`,
 * and without one they returned from `seededBrowser` counting towards neither `ran` nor `failed`.
 * A checkout with no build therefore printed `self-test: 56 negatives caught by the gate seeded for
 * it.` and exited 0, and 56 is a comfortable number: nothing in that sentence says the five gates
 * that guard the rendered product were never asked. The number that shrank was the only symptom,
 * and a reader has to know 61 by heart to see it.
 *
 * A FINDING BEATS A SKIP, which is why `failed` is tested first. A run that caught a dead gate has
 * an answer and it is red, whether or not five others were reachable.
 *
 * EXIT 3 AND NOT 0 FOR THE REST, and this is the one gate in the directory where the choice is not
 * close. Every other gate reports a list of independent findings, so one input missing costs one
 * check and the rest of the output still means what it says. This file reports a single verdict
 * about the whole suite: *every gate catches the violation seeded for it*. That sentence is true
 * or it is unproven, and five gates unasked make it unproven. Passing it off as a pass would be
 * this file committing, about itself, the exact defect it was written to catch in others.
 *
 * AND THE SKIP LANDS WHERE IT SHOULD. `run.mjs` reads 3 as a skip and never as a pass, and CI
 * builds before it runs the gates, so in CI this is red and the missing build is the finding. On a
 * fresh clone it is a skip, which is the honest word for a question nobody could put.
 */
if (failed.length) {
  console.log(`\n  self-test: ${failed.length} gate(s) do not: ${[...new Set(failed)].join(', ')}.\n`);
  process.exitCode = 1;
} else if (notRun.length) {
  const asked = ran + notRun.length;
  console.log(
    `\n  self-test: ${ran} of ${asked} negatives caught, and ${notRun.length} not run for want of ` +
      `apps/web/build: ${notRun.join(', ')}. Build, then ask again.\n`,
  );
  process.exit(3);
} else {
  console.log(`\n  self-test: ${ran} negative${ran === 1 ? '' : 's'} caught by the gate seeded for it.\n`);
}
