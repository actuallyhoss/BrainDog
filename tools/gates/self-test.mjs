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
import { readdirSync, readFileSync, existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { keyPaths, webBuildUnmet } from './lib.mjs';

/* IN `--built`, NOT `--unbuilt`: its browser negatives read `apps/web/build` and skip without one, so the job that builds
   nothing would see it exit 3. `builds` is never refused by the runner; it only says which job asks for this gate. */
export const needs = ['builds'];

const here = dirname(fileURLToPath(import.meta.url));
const negatives = join(here, 'negative');

/** What a `case.json` may say, and nothing else. */
const CASE_KEYS = new Set(['gate', 'rule', 'expect', 'findings', 'total', 'skip', 'why']);

/**
 * Each planted tree says, in its own `case.json`, which gate it is for and what that gate must say.
 *
 *   { "gate": "colour-grep", "rule": "an eight-digit hex colour", "expect": "colour literal",
 *     "findings": 1, "total": 1, "skip": true, "why": "..." }
 *
 * `gate` is the gate as `run.mjs` registers it, and the tree is pointed at it with `cwd` and
 * `BRAINDOG_GATE_ROOT`. `rule` is the rule inside that gate the tree proves, in plain words, and is
 * what the line for the tree prints. `expect` is a pattern the red line must hold, matched without
 * regard to case. `findings` is how many lines name the tree's `expect.txt`; `total`, when given, is
 * the whole of what the gate reports; `skip` asks for exit 3 over a root that holds nothing. `why`
 * is the reason the tree is shaped the way it is, which is where the comments of the old list went.
 *
 * THE LIST USED TO LIVE HERE, AND IT COULD NOT SEE A GATE WITH NOTHING IN IT. Eighty-three rows in
 * this file and eighty-three trees beside it, and a check that every tree had a row; nothing asked
 * whether every gate had a tree, so `passkey`, `theme`, `deploy-parity` and `typecheck` had none and
 * the run was green (PRF-B02). The case now travels with its tree, so a tree cannot be added without
 * one and a gate is covered by the trees that name it.
 *
 * Nothing here monkey-patches a gate: a gate that needed a special mode to be testable would be a
 * gate whose tested behaviour is not the shipped one.
 */
export function readCases(dir, registered) {
  const cases = [];
  const refused = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const tree = entry.name;
    const at = join(dir, tree, 'case.json');
    if (!existsSync(at)) {
      refused.push(`negative/${tree}/ is planted and has no case.json, so nothing says which gate it is for.`);
      continue;
    }
    let c;
    try {
      c = JSON.parse(readFileSync(at, 'utf8'));
    } catch (cause) {
      refused.push(`negative/${tree}/case.json does not read as JSON: ${cause.message}`);
      continue;
    }
    /* A WORD SPELT WRONG IS A CHECK DROPPED, not a refusal, unless it is refused here: `totl` would leave the count
       unasked and the tree as green as before. */
    const stray = c && typeof c === 'object' ? Object.keys(c).filter((k) => !CASE_KEYS.has(k)) : [];
    if (stray.length) {
      refused.push(`negative/${tree}/case.json says ${stray.join(', ')}, which a case does not have, so whatever it meant is not checked.`);
      continue;
    }
    if (c.skip !== undefined && typeof c.skip !== 'boolean') {
      refused.push(`negative/${tree}/case.json says skip is ${JSON.stringify(c.skip)}, and it is true or left out.`);
      continue;
    }
    if (typeof c?.gate !== 'string' || !c.gate) {
      refused.push(`negative/${tree}/case.json names no gate.`);
      continue;
    }
    if (!registered.has(c.gate)) {
      refused.push(`negative/${tree}/case.json names ${c.gate}, and run.mjs registers no gate by that name.`);
      continue;
    }
    if (typeof c.rule !== 'string' || !c.rule.trim()) {
      refused.push(`negative/${tree}/case.json says no rule, so its line could not say what was proved.`);
      continue;
    }
    if (!Number.isInteger(c.findings) || c.findings < 1 || (c.total !== undefined && !Number.isInteger(c.total))) {
      refused.push(`negative/${tree}/case.json counts no findings, and a planted fault is at least one.`);
      continue;
    }
    let expect;
    try {
      expect = new RegExp(c.expect, 'iu');
    } catch {
      refused.push(`negative/${tree}/case.json expects a pattern that does not compile: ${c.expect}`);
      continue;
    }
    cases.push({ tree, gate: c.gate, rule: c.rule, expect, findings: c.findings, total: c.total, skip: c.skip === true });
  }
  return { cases, refused };
}

/**
 * The names `run.mjs` registers, read as text out of its `GATES` table.
 *
 * AS TEXT AND NOT BY `import()`, for the reason `run.mjs` reads `needs` as text: importing the runner
 * runs every gate. One entry a line, `['name', ...]`, which is the shape every entry has today; a
 * table that came back empty is a refusal, never a pass over no gates.
 */
export function registeredGates(text) {
  const start = text.indexOf('const GATES = [');
  const end = text.indexOf('\n];', start);
  if (start < 0 || end < 0) return new Set();
  return new Set([...text.slice(start, end).matchAll(/^\s*\['([a-z][a-z0-9-]*)',/gmu)].map((m) => m[1]));
}

/**
 * EVERY GATE HAS A PLANTED FAULT, AND THESE ARE THE ONES THAT DO NOT YET. The list may only shrink.
 *
 * A name here is a gate that goes red on nothing the self-test has ever planted, said out loud on
 * every run rather than read green. A name that gains a tree or a browser negative is a failure until
 * it comes off, so the list cannot hold a gate that no longer needs it; and
 * `test/self-test-cases.test.mjs` holds it to today's six, so a gate added tomorrow cannot join it.
 */
export const GAPS = new Map([
  ['typecheck', 'one type error in negative/typecheck/ comes with PRF-B02 job 4'],
  ['theme', 'a token file one value off, read by theme.mjs --tokens, comes with PRF-B02 job 5'],
  ['passkey', 'a seed that takes the virtual authenticator away comes with PRF-B02 job 4'],
  ['deploy-parity', 'a local host that names another build comes with PRF-B02 job 6'],
  ['rule-sheet', "batch 40's rule sheet on a proof record has no tree yet"],
  ['signin-live', "batch 43's planted tree: a self-host whose sign-in refuses the passkey"],
]);

/**
 * ONLY THE SELF-TEST ITSELF IS EXCUSED, and this is why: its planted fault is every other gate's. A
 * case that ran it would run it again from inside itself, every browser negative with it, and prove
 * nothing a red line below does not already prove.
 */
export const EXCUSED = new Set(['self-test']);

/** Which registered gates have no planted fault, and which gaps no longer are. */
export function uncovered(registered, covered) {
  const missing = [...registered].filter((g) => !covered.has(g) && !EXCUSED.has(g) && !GAPS.has(g));
  const closed = [...GAPS.keys()].filter((g) => covered.has(g));
  const open = [...GAPS.keys()].filter((g) => !covered.has(g));
  return { missing, closed, open };
}


/** How many lines of a gate's output name the seeded file. One per seeded violation. */
const named = (said, seeded) => said.split('\n').filter((l) => l.includes(seeded)).length;

/**
 * How many findings the gate says it made, off its own `N finding(s)` line, for a case with `total`.
 *
 * `findings` COUNTS LINES NAMING THE SEED, AND THAT CANNOT SEE A SECOND REASON FOR THE RED. The
 * assistant's rename to Slash measured it on September 25th: the refusals gate renamed and its
 * fixture not printed 22 findings, 21 about the fixture's stale family name, and the case still
 * passed because one line named WOULD_ORPHAN. The `slash-actor` fixture had carried a crash as its
 * second finding the same way since September 11th, when `d92523ec` changed the gate's `log` call
 * and not the fixture. A case that states `total` says its fixture is red for its seed and for
 * nothing else. Undefined when no such line is printed, which fails any `total`.
 */
const reported = (said) => {
  const m = /\b(\d+) finding\(s\)/u.exec(said);
  return m ? Number(m[1]) : undefined;
};

/**
 * THE SENTENCE IS THE WORDS AND NOT THEIR CAPITALISATION, so every `expect` in a `case.json` is
 * matched case-insensitively (`readCases` compiles it so, and this holds any other pattern to it).
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
   *
   * AND ONCE MORE WITH A PANEL DOCKED BESIDE THE WORK, which is its own pass with its own edge and
   * had never been asked to go red (research-audit-16 L12). Both sentences, because the sweep's alone
   * would hold the run red with the docked pass seeing nothing.
   */
  {
    gate: 'layout',
    seed: '1',
    names: ['reaches 2000px', 'under the panel'],
    blind: 'PASSED a 2000px heading inside #main. It is examining nothing.',
    red: 'red on a 2000px heading inside #main, with the panel shut and with it docked',
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

/* A STALE BUILD IS AN ABSENT ONE, and this asked only whether `apps/web/build` existed until
   22 September, which is the blind spot `run.mjs` closed the same day. A violation seeded into a
   build older than the source is a negative run against an app that is no longer this code: a gate
   fixed since the build goes red for the old reason, and a fixture the build predates goes red for
   none. The walk and the sentence are `run.mjs`'s own, from `lib.mjs`, so the two cannot disagree
   about which build is current. A variant list it cannot read is the same refusal rather than a
   stack trace, because one unreadable fact must not end the run before the fixture cases report.
   Set by `main`, so importing this file walks nothing. */
let buildUnmet = null;

function seededBrowser({ gate, seed, names, blind, red }) {
  /* SKIPPED WHEN THE BUILD CANNOT BE MEASURED, like the gate itself, AND WRITTEN DOWN. This returned
     without touching either counter, so the five browser negatives could every one of them be
     skipped and the only trace was five lines above a summary that still read like a full pass. */
  if (buildUnmet !== null) {
    console.log(`  ${gate}: ${buildUnmet}, so its negative is not run`);
    notRun.push(gate);
    return;
  }
  const r = spawnSync(process.execPath, [join(here, `${gate}.mjs`)], {
    cwd: join(here, '..', '..'),
    encoding: 'utf8',
    env: { ...process.env, BRAINDOG_GATE_SEED: seed },
  });
  const said = `${r.stdout}${r.stderr}`;
  /* EVERY SENTENCE A NEGATIVE NAMES, where one gate proves more than one pass on a single run. */
  const unnamed = [names].flat().filter((n) => !said.includes(n));
  if (r.status === 0) {
    console.error(`  ${gate}: ${blind}`);
    failed.push(gate);
  } else if (unnamed.length) {
    console.error(`  ${gate}: went red but never named ${unnamed.join(' or ')}, so this run says nothing about the rule. What it did say:`);
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

/** One planted tree, run against the gate its `case.json` names. */
function planted({ tree, gate, rule, expect, findings, total, skip }) {
  const fixture = join(negatives, tree);
  const r = spawnSync(process.execPath, [join(here, `${gate}.mjs`)], {
    cwd: fixture,
    encoding: 'utf8',
    env: { ...process.env, BRAINDOG_GATE_ROOT: fixture },
  });
  const said = `${r.stdout}${r.stderr}`;

  /* RED, AND ABOUT THE RIGHT THING. An exit code alone would be satisfied by a gate that crashed,
     which is a different failure wearing the same colour. */
  const seeded = readFileSync(join(fixture, 'expect.txt'), 'utf8').trim();
  if (r.status === 0) {
    console.error(
      skip
        ? `  ${tree}: PASSED a root with nothing in it. A mistyped root would read green.`
        : `  ${tree}: PASSED its own seeded violation. It is checking nothing.`,
    );
    failed.push(tree);
  } else if (skip && r.status !== 3) {
    console.error(`  ${tree}: exited ${r.status} over a root with nothing in it, and a gate that read nothing exits 3.`);
    console.error(said.split('\n').slice(0, 6).map((l) => `      ${l}`).join('\n'));
    failed.push(tree);
  } else if (!said.includes(seeded)) {
    console.error(`  ${tree}: went red but never named ${seeded}.`);
    console.error(said.split('\n').slice(0, 6).map((l) => `      ${l}`).join('\n'));
    failed.push(tree);
  } else if (!recognises(expect).test(said)) {
    console.error(`  ${tree}: went red with a sentence this test does not recognise. What it did say:`);
    console.error(
      said
        .split('\n')
        .filter((l) => l.trim())
        .slice(0, 6)
        .map((l) => `      ${l}`)
        .join('\n'),
    );
    failed.push(tree);
  } else if (named(said, seeded) !== findings) {
    /* THE COUNT, NOT ONLY THE COLOUR. The colour-grep fixture used to carry three forms in one
       file and this only asserted that the gate went red, so reverting any two of the three
       fixes still left the third firing, and the negative could not tell which of them was doing
       the work. A fixture that proves "something here is caught" is not a fixture; it has to
       prove that THIS is caught, which means one violation per fixture and the count asserted. */
    console.error(`  ${tree}: named ${seeded} on ${named(said, seeded)} line(s), and the fixture seeds ${findings}.`);
    failed.push(tree);
  } else if (total !== undefined && reported(said) !== total) {
    /* AND NOTHING ELSE BESIDE IT, where a case says how many findings the whole run makes. The
       count above is of lines naming the seed, so a gate that also goes red about the fixture's
       own scaffolding still passes it. */
    console.error(`  ${tree}: red with ${reported(said) ?? 'an uncounted number of'} finding(s), and the fixture accounts for ${total}. What it said:`);
    console.error(
      said
        .split('\n')
        .filter((l) => l.trim())
        .slice(0, 8)
        .map((l) => `      ${l}`)
        .join('\n'),
    );
    failed.push(tree);
  } else {
    ran++;
    const what = tree === gate ? gate : `${gate} (${tree})`;
    console.log(skip ? `  ${what}: ${rule}, naming ${seeded}` : `  ${what}: red on ${rule}, naming ${seeded}`);
  }
}

/**
 * EVERY REGISTERED GATE HAS A PLANTED FAULT, the rule the old list could not state. A gate with no
 * tree, no browser negative and no place on `GAPS` is red here and named; a gap that has gained one
 * is red too, until it comes off the list.
 */
function everyGateHasACase(registered, cases) {
  const covered = new Set([...cases.map((c) => c.gate), ...BROWSER.map((b) => b.gate)]);
  const { missing, closed, open } = uncovered(registered, covered);
  for (const g of missing) {
    console.error(`  ${g}: registered in run.mjs with no planted fault. A gate that has never failed may not work.`);
    failed.push(g);
  }
  for (const g of closed) {
    console.error(`  ${g}: has a planted fault now and is still on GAPS. Take it off; the list only shrinks.`);
    failed.push(g);
  }
  if (!missing.length && !closed.length) {
    ran++;
    const planted = [...registered].filter((g) => covered.has(g)).length;
    console.log(`  every gate has a case: ${planted} of ${registered.size} registered gates planted, self-test excused, the rest named below`);
  }
  for (const g of open) console.log(`  ${g}: no planted fault yet; ${GAPS.get(g)}`);
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
 * THE WHOLE PATH, NOT ITS LAST WORD. This compared `.port` against every source here, so four port
 * keys (`keys`, `prefs`, `layout`, `a11y`) passed on `server.address().port` while every browser gate
 * asked the system for a free port and read none of them (PRF-B02). A key is read now when a file
 * names its section and reads the key off that section: `budget('S').key`, a binding
 * `const X = budget('S')` and then `X.key`, or `const { key } = budget('S')`.
 *
 * IT GREPS RATHER THAN PARSING. A parser would be more precise and would also be a second thing that
 * can be wrong. `tools/look/` is read with this directory, because `look.widths` is its section.
 */
export function readPaths(source) {
  const read = new Set();
  for (const m of source.matchAll(/budget\(\s*'([\w]+)'\s*\)\.(\w+)/gu)) read.add(`${m[1]}.${m[2]}`);
  for (const m of source.matchAll(/\b(?:const|let)\s+\{([^}]*)\}\s*=\s*budget\(\s*'(\w+)'\s*\)/gu))
    for (const name of m[1].split(',')) {
      const key = name.split(':')[0].trim();
      if (key) read.add(`${m[2]}.${key}`);
    }
  for (const m of source.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*budget\(\s*'(\w+)'\s*\)/gu))
    for (const use of source.matchAll(new RegExp(`(?<![\\w$.])${m[1].replace(/\$/gu, '\\$')}\\.(\\w+)`, 'gu'))) read.add(`${m[2]}.${use[1]}`);
  return read;
}

export const deadKeys = (paths, sources) => {
  const read = new Set(sources.flatMap((s) => [...readPaths(s)]));
  return paths.filter((path) => !read.has(path));
};

function budgetsAreRead() {
  const dirs = [here, join(here, '..', 'look')];
  const sources = dirs
    .filter((d) => existsSync(d))
    .flatMap((d) =>
      readdirSync(d)
        .filter((f) => f.endsWith('.mjs') && f !== 'lib.mjs' && f !== 'self-test.mjs')
        .map((f) => readFileSync(join(d, f), 'utf8')),
    );

  const dead = deadKeys(keyPaths(), sources);
  if (dead.length) {
    console.error(`  budgets: ${dead.length} key(s) no gate reads: ${dead.join(', ')}.`);
    failed.push('budgets');
    return;
  }
  ran++;
  console.log(`  budgets: all ${keyPaths().length} numbers are read by a gate, each by its whole path`);
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
 * IT SITS BESIDE `52 §5.1` STEP 2, WHICH IS NOW BUILT, AND THE TWO CATCH DIFFERENT THINGS. The
 * runner reads each gate's declared `needs` before it spawns anything and refuses a gate whose
 * prerequisite is unmet, so an unmet prerequisite is never the gate's account any more. What that
 * cannot reach is a gate exiting 0 early for a reason it did NOT declare: a file it could not
 * read, a fixture directory that is empty, a list that came back with nothing in it. `needs` names
 * the prerequisites the runner can check from outside; this grep covers every other early
 * return, which is why both are here.
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


async function main() {
  buildUnmet = await webBuildUnmet(join(here, '..', '..')).catch((cause) => cause.message);

  const registered = registeredGates(readFileSync(join(here, 'run.mjs'), 'utf8'));
  if (!registered.size) {
    console.error('  run.mjs: no GATES table could be read, so no gate can be asked for its planted fault.');
    failed.push('run.mjs');
  }

  /* AND EVERY TREE IS CLAIMED, by its own case.json. A tree that says nothing, or names a gate nobody
     runs, is a violation nobody is seeding, which is the same silence this file exists to break. */
  const { cases, refused } = readCases(negatives, registered);
  for (const line of refused) {
    console.error(`  ${line}`);
    failed.push(line.split('/')[1]);
  }

  for (const c of cases) planted(c);
  for (const b of BROWSER) seededBrowser(b);
  everyGateHasACase(registered, cases);

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
    console.log(`\n  self-test: ${new Set(failed).size} gate(s) do not: ${[...new Set(failed)].join(', ')}.\n`);
    process.exitCode = 1;
  } else if (notRun.length) {
    const asked = ran + notRun.length;
    console.log(
      `\n  self-test: ${ran} of ${asked} negatives caught, and ${notRun.length} not run for want of ` +
        `a current apps/web/build: ${notRun.join(', ')}. \`pnpm --filter @braindog/web build\`, then ask again.\n`,
    );
    process.exit(3);
  } else {
    console.log(`\n  self-test: ${ran} negative${ran === 1 ? '' : 's'} caught by the gate seeded for it.\n`);
  }
}

/* RUN WHEN RUN, NOT WHEN IMPORTED, so `test/self-test-cases.test.mjs` can ask the reader and the key
   check without spawning eighty gates. `run.mjs` spawns this file, so nothing it does changes. */
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) await main();
