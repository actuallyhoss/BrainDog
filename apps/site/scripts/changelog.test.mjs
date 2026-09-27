/**
 * The changelog checker, asked what input would make each of its checks fire.
 *
 *   node --test apps/site/scripts/changelog.test.mjs
 *
 * A CHECK THAT HAS NEVER FAILED MAY NOT WORK, and this repository has measured that rather than
 * asserted it: `tools/gates/guards.mjs` asked four source gates what input would make them fire and
 * the answers were 1 of 7, 3 of 10, a check blind to its own file, and 2 of 16. `changelog.mjs` went
 * green on its first run against the real page, which is exactly the reading a gate gives when it is
 * measuring nothing, so every one of its seven checks is given an entry list that should trip it.
 *
 * THE FIXTURES ARE TINY ON PURPOSE. `check()` takes the log as an argument rather than reading git,
 * so a case here is nine commits and one entry, and a failure points at one line instead of at 1,288
 * commits. The hashes are the forty hex characters git produces, because the checker resolves a
 * written hash as a PREFIX of a full one and a fixture that cheated on that would not exercise the
 * prefix matching or the ambiguity finding.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import { check, fullHistory } from './changelog.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');

/**
 * `8fd25709` IS THE COMMIT THAT WROTE THE SIX MISSING DAYS, so its parent is the tree in which this
 * page was wrong. The last case in this file reads that parent's own changelog out of git and asserts
 * the coverage check names the days it was behind. Nothing else here reads the repository.
 */
const STALE = '8fd25709~1';

const hash = (head) => head + 'f'.repeat(40 - head.length);

/** Four commits over three days, which is the smallest history with a gap in the middle of it. */
const LOG = [
  { hash: hash('aaa1'), date: '2026-03-03', subject: 'The third day' },
  { hash: hash('bbb1'), date: '2026-03-02', subject: 'The second day' },
  { hash: hash('bbb2'), date: '2026-03-02', subject: 'The second day again' },
  { hash: hash('ccc1'), date: '2026-03-01', subject: 'The first day' },
];

const entry = (over) => ({
  date: '2026-03-03',
  kind: 'shipped',
  title: 'A thing shipped',
  body: 'It did not exist. It exists now.',
  commits: ['aaa1'],
  ...over,
});

/** Every day in LOG covered, so a case only reports what the case is about. */
const COVERED = [
  entry({}),
  entry({ date: '2026-03-02', title: 'Another thing', commits: ['bbb1'] }),
  entry({ date: '2026-03-01', title: 'A first thing', commits: ['ccc1'] }),
];

const swap = (at, over) => COVERED.map((e, i) => (i === at ? { ...e, ...over } : e));

test('a list that holds against its log reports nothing', () => {
  assert.deepEqual(check(COVERED, LOG), []);
});

test('1. an entry naming no commit is a finding', () => {
  for (const commits of [[], undefined]) {
    const found = check(swap(0, { commits }), LOG);
    assert.equal(found.length, 1, `commits: ${JSON.stringify(commits)}`);
    assert.match(found[0], /names no commit/);
  }
});

test('2. a hash that is in no commit is a finding', () => {
  const found = check(swap(0, { commits: ['deadbee'] }), LOG);
  assert.equal(found.length, 1);
  assert.match(found[0], /deadbee, which is not a commit in this log/);
});

test('2. a hash that is more than one commit is a finding', () => {
  /* `bbb` is both fixtures of the second day, which is the real hazard of a hand-written short
     hash: it is unambiguous on the day it is written down and stops being so later. */
  const found = check(swap(1, { commits: ['bbb'] }), LOG);
  assert.equal(found.length, 1);
  assert.match(found[0], /bbb, which is 2 commits/);
});

test('3. an entry dated anything but its first commit is a finding', () => {
  const found = check(swap(0, { date: '2026-03-04' }), LOG);
  /* Two, and the second one is the point: moving the date off the commit also moves the entry off
     the day, so 2026-03-03 loses its only entry and the coverage check says so. */
  assert.equal(found.length, 2);
  assert.match(found[0], /is dated 2026-03-04 and its first commit aaa1ffff is dated 2026-03-03/);
});

test('3. a later hash may be any day, because a thing can ship over two of them', () => {
  assert.deepEqual(check(swap(0, { commits: ['aaa1', 'ccc1'] }), LOG), []);
});

test('4. two entries anchored to one commit is a finding', () => {
  const found = check(swap(1, { date: '2026-03-03', commits: ['aaa1'] }), LOG);
  assert.ok(found.some((f) => /already anchors "A thing shipped"/.test(f)), found.join('\n'));
});

test('5. a day out of order is a finding', () => {
  const found = check([COVERED[2], COVERED[1], COVERED[0]], LOG);
  assert.ok(found.some((f) => /so the page is not newest first/.test(f)), found.join('\n'));
});

test('5. a day that reopens after it ended is caught by the same comparison', () => {
  /* THIS CASE IS WHY CHECK 5 IS ONE COMPARISON AND NOT TWO. It was written against a second branch
     asking whether a day had come back after ending, and no input could reach that branch: a list
     can only revisit a day by stepping UP to it, so the descending comparison has already reported
     it. The case stays, asserting the finding that does fire, so the merge cannot silently undo
     itself. */
  const reopened = [
    entry({}),
    entry({ date: '2026-03-02', title: 'Another thing', commits: ['bbb1'] }),
    entry({ date: '2026-03-01', title: 'A first thing', commits: ['ccc1'] }),
    entry({ date: '2026-03-02', title: 'A second second thing', commits: ['bbb2'] }),
  ];
  const found = check(reopened, LOG);
  assert.ok(
    found.some((f) => /A second second thing: comes after 2026-03-01/.test(f)),
    found.join('\n'),
  );
});

test('6. a day of commits with no entry is a finding, with its count', () => {
  /* THE FAILURE THIS FILE EXISTS FOR, in four lines: drop the middle day and the checker names it
     and says how many commits it is behind. */
  const found = check([COVERED[0], COVERED[2]], LOG);
  assert.equal(found.length, 1);
  assert.equal(found[0], '2026-03-02: 2 commits and no entry, so the changelog is behind the repository');
});

test('6. a day older than the oldest entry is not a finding', () => {
  /* The page starts where it starts. Reporting every commit before the first entry would make the
     check unanswerable rather than useful, and would fire hardest on the day somebody adds it. */
  assert.deepEqual(check([COVERED[0], COVERED[1]], LOG), []);
});

test('7. a body over three sentences is a finding', () => {
  const found = check(swap(0, { body: 'One. Two. Three. Four.' }), LOG);
  assert.equal(found.length, 1);
  assert.match(found[0], /has 4 sentences in its body/);
});

test('7. a sentence over 25 words is a finding', () => {
  const long = `A body ${'word '.repeat(24)}and one more.`;
  const found = check(swap(0, { body: long }), LOG);
  assert.equal(found.length, 1);
  assert.match(found[0], /has a 29 word sentence/);
});

test('7. a URL in a body or a title is a finding', () => {
  for (const over of [{ body: 'See https://example.com/releases for it.' }, { title: 'At https://example.com' }]) {
    const found = check(swap(0, over), LOG);
    assert.equal(found.length, 1, JSON.stringify(over));
    assert.match(found[0], /carries a URL/);
  }
});

test('7. a kind outside the three is a finding', () => {
  const found = check(swap(0, { kind: 'released' }), LOG);
  assert.equal(found.length, 1);
  assert.match(found[0], /has kind "released"/);
});

test('an empty list and an empty log each say so rather than passing', () => {
  assert.match(check([], LOG)[0], /claims nothing shipped ever/);
  assert.match(check(COVERED, [])[0], /nothing to hold the page against/);
});

/**
 * THE FAILURE THIS FILE EXISTS FOR, MEASURED ON THE TREE THAT HAD IT.
 *
 * Every case above is a fixture, and a fixture is something the author of the check chose. This one
 * is not: it reads the changelog as it stood at the commit before somebody noticed the page was
 * stale, out of git, and holds it against the log at that same commit. The four days it names are
 * days of real work that this page said nothing about.
 *
 * A MISSING HISTORY IS A SKIP THAT SAYS SO, which is the rule the gate suite follows and the reason
 * for it: a check with nothing to read is the same silence as no check, so it has to be louder than
 * a pass. A shallow clone or a tree where that commit does not exist gets a named skip rather than a
 * green tick.
 *
 * IT READS THE ENTRIES OUT OF THE OLD `+page.svelte` BY BRACKET MATCHING, because that is where they
 * lived: the array was a literal in the component, which is the arrangement this whole pass exists
 * to end. Once a version of `entries.ts` old enough to be stale exists, this can import that
 * instead and the extraction goes.
 */
test('the real page, at the commit before its six missing days were written', (t) => {
  let page;
  let log;
  try {
    const opts = { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 };
    page = execFileSync('git', ['show', `${STALE}:apps/site/src/routes/changelog/+page.svelte`], opts);
    log = execFileSync('git', ['log', '--format=%H|%ad|%s', '--date=short', STALE], opts);
  } catch (error) {
    t.skip(`cannot read ${STALE} from ${ROOT}, so the historical case has nothing to measure: ${error.message}`);
    return;
  }

  const open = page.indexOf('[', page.indexOf('= [', page.indexOf('const ENTRIES')) + 1);
  let depth = 0;
  let end = -1;
  for (let i = open; i < page.length; i++) {
    if (page[i] === '[') depth += 1;
    else if (page[i] === ']' && --depth === 0) {
      end = i;
      break;
    }
  }
  assert.ok(end > open, 'the old page held an ENTRIES array and this did not find it');
  /* `new Function` OVER THIS REPOSITORY'S OWN HISTORICAL SOURCE, and the alternatives are worse: a
     regex over a multi-line string concatenation would have to reimplement string literals, and
     writing the slice to a temporary module to import leaves a file behind on a failure. The input
     is a git object in this tree, not anything a caller can supply. */
  const entries = new Function(`return ${page.slice(open, end + 1)}`)();
  assert.equal(entries.length, 25, 'the stale page held twenty-five entries');

  const commits = log
    .split('\n')
    .filter((line) => line.includes('|'))
    .map((line) => {
      const [hash, date, ...rest] = line.split('|');
      return { hash, date, subject: rest.join('|') };
    });

  const found = check(entries, commits);
  for (const [day, n] of [
    ['2026-09-16', 71],
    ['2026-09-15', 25],
    ['2026-09-14', 2],
    ['2026-09-11', 11],
  ]) {
    assert.ok(
      found.includes(`${day}: ${n} commits and no entry, so the changelog is behind the repository`),
      `${day} should be reported as ${n} commits with no entry, and the findings were:\n${found.join('\n')}`,
    );
  }
  /* AND EVERY ONE OF THE TWENTY-FIVE IS UNANCHORED, which is the other half of the old arrangement:
     not one of them said which commit it came from, so nothing could tell an entry from an invention. */
  assert.equal(found.filter((f) => /names no commit/.test(f)).length, 25);
});

/**
 * ── THE ONE STATE THIS CHECKER CANNOT READ, AND WHAT IT DOES ABOUT IT ────────────────────────────
 *
 * MEASURED, IN A REAL `git clone --depth 1` OF THIS REPOSITORY WITH THE CHECKER COPIED IN: 183
 * findings and exit 1, one line per hash, every one of them saying `is not a commit in this log`, and
 * not one of them true. `git log` succeeds in a shallow clone and answers with the single commit it
 * was given, so nothing throws and every entry reads as invented.
 *
 * REFUSING TO RUN IS NOT ENOUGH, WHICH IS WHY THIS DEEPENS. `tools/gates/run.mjs` counts exit 3 as a
 * skip and then `if (disallowed.length && process.env.CI) failed.push(...disallowed)`, so a gate that
 * skips on a shallow clone is RED in CI, where every checkout is shallow: no checkout in
 * the workflows that test a push or a pull request sets `fetch-depth`, and `actions/checkout@v4` clones at depth 1. A
 * skip there would have to be waived by name in `--allow-skip` for ever, which is a gate CI never runs.
 *
 * `fullHistory` TAKES THE GIT RUNNER AS AN ARGUMENT for the reason `check` takes the log as one: the
 * six states worth asserting are a full clone, a shallow clone that deepens, a fetch that fails, a
 * fetch that claims success and changes nothing, a git that will not answer, and an answer this cannot
 * read, and reaching four of those for real costs a clone and a network. The fake records every argv,
 * so a case can also assert what was NOT run, which is the half that matters three times below.
 */
const fakeGit = (answers) => {
  const left = [...answers];
  const ran = [];
  const git = (args) => {
    ran.push(args.join(' '));
    if (left.length === 0) assert.fail(`nothing left to answer: git ${args.join(' ')}`);
    const answer = left.shift();
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { git, ran };
};

const ASKED = 'rev-parse --is-shallow-repository';
const DEEPENED = 'fetch --unshallow --quiet';

test('a full clone is read as it stands, and nothing is fetched', () => {
  const { git, ran } = fakeGit(['false']);
  assert.deepEqual(fullHistory(git), { ok: true, deepened: false });
  assert.deepEqual(ran, [ASKED]);
});

test('a shallow clone is deepened rather than reported on', () => {
  const { git, ran } = fakeGit(['true', '', 'false']);
  assert.deepEqual(fullHistory(git), { ok: true, deepened: true });
  assert.deepEqual(ran, [ASKED, DEEPENED, ASKED]);
});

test('a fetch that fails cannot run, and hands on what git said', () => {
  /* An unreachable remote, which is the offline developer and the CI job whose network went. The
     sentence carries git's own message because the two reasons a fetch fails want different
     answers from a reader, and this file is in no position to tell them apart. */
  /* THE MESSAGE IS THE ONE `execFileSync` ACTUALLY THROWS, five lines of it, because the sentence
     this builds is printed as one line beside a root path and a measured run of the real thing put
     the words `at <root>` on the far side of a blank line, under two fatals, reading as a second
     failure rather than as the end of the first sentence. */
  const thrown = new Error(
    ['Command failed: git fetch --unshallow --quiet', "fatal: 'C:/nowhere' does not appear to be a git repository", '', 'fatal: Could not read from remote repository.', ''].join('\n'),
  );
  const { git, ran } = fakeGit(['true', thrown]);
  const answer = fullHistory(git);
  assert.equal(answer.ok, false);
  assert.match(answer.why, /shallow/);
  assert.match(answer.why, /does not appear to be a git repository/);
  assert.ok(!answer.why.includes('\n'), `a reason printed on one line, and this was:\n${answer.why}`);
  assert.deepEqual(ran, [ASKED, DEEPENED]);
});

test('a fetch that reports success and leaves the clone shallow cannot run', () => {
  /* THE SECOND ASK IS THE LOAD-BEARING ONE, AND THIS IS A MEASURED CASE AND NOT A DEFENSIVE ONE.
     In a depth-1 clone of this repository with its remote removed, on git 2.52.0,
     `git fetch --unshallow --quiet` exits 0, prints nothing and leaves the clone shallow, so a
     clone with nothing to deepen from arrives here rather than in the case above. Trusting the
     fetch's exit code would put every entry straight back into the 183 findings, this time behind
     a fetch that said it worked. */
  const { git, ran } = fakeGit(['true', '', 'true']);
  const answer = fullHistory(git);
  assert.equal(answer.ok, false);
  assert.match(answer.why, /still a shallow clone/);
  assert.deepEqual(ran, [ASKED, DEEPENED, ASKED]);
});

test('a git that will not answer is a skip, and never a fetch', () => {
  const { git, ran } = fakeGit([new Error('fatal: not a git repository')]);
  const answer = fullHistory(git);
  assert.equal(answer.ok, false);
  assert.match(answer.why, /not a git repository/);
  assert.deepEqual(ran, [ASKED]);
});

test('an answer this cannot read is a skip, and the clone is left alone', () => {
  /* ONLY A PLAIN `true` IS A SHALLOW CLONE, and the reason is measured: `git fetch --unshallow` in a
     complete clone of this repository exits 128 with `fatal: --unshallow on a complete repository
     does not make sense`. So deepening on anything other than `true` would turn a tree this could
     have read into a failed fetch and then a skip, which is the opposite of the trade this whole
     function exists to make. */
  const { git, ran } = fakeGit(['--is-shallow-repository']);
  const answer = fullHistory(git);
  assert.equal(answer.ok, false);
  assert.match(answer.why, /--is-shallow-repository/);
  assert.deepEqual(ran, [ASKED]);
});
