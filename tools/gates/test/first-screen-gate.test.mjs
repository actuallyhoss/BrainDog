/**
 * `first-screen`, the gate, driven with a runner handed in: no self-host, no walk, nothing drawn.
 *
 *   node --test tools/gates/test/first-screen-gate.test.mjs
 *
 * THE RUNNER IS THE COMMAND AS THE GATE READS IT AND NO MORE: an exit code and the lines it printed, in the command's
 * own shape (a heading a screen, a line a check, a last line with the counts). Each test hands the gate one way a run
 * can end and holds what it says: both green and quiet, one red and the person named with the first red check, a check
 * that read nothing, a walk that drew nothing, a command that never finished. The people are the tree's own two files,
 * read only for their names.
 */

import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import firstScreenGate, { CHECK, PEOPLE, findingOf, firstRed, judge, nameOf } from '../first-screen.mjs';

const ROOT = join(import.meta.dirname, '..', '..', '..');

/** What the command prints for a run with nothing red, as `name`. */
const green = (name) =>
  [
    `The first run's own words (118 sentences), as ${name}`,
    '  no-tour: green. no tour, checklist or sample entries',
    `/app/ at 1440 wide (the rail and Today, just kept, before anything was told), as ${name}`,
    '  no-tour: green. no tour, checklist or sample entries',
    '  nothing-before-press: does not apply. not a first-run page (/app/)',
    '  rail-has-rows: green. the rail holds no place besides Today, Decide and People',
    '4 checks: 3 green, 0 red, 0 not seen, 1 that do not apply. Exit code 0.',
  ].join('\n');

/** The same run with the rail holding an empty place on the phone, and a second red after it. */
const red = (name) =>
  [
    `The first run's own words (118 sentences), as ${name}`,
    '  no-tour: green. no tour, checklist or sample entries',
    `/app/ at 1440 wide (the rail and Today, just kept, before anything was told), as ${name}`,
    '  signs-line: not seen. the snapshot holds no count of vital signs',
    '  rail-has-rows: green. the rail holds no place besides Today, Decide and People',
    `/app/ at 390 wide (Today and the tab bar, after the first real thing), as ${name}`,
    '  rail-has-rows: \u001b[31mred\u001b[0m. the rail shows Bills, which holds nothing yet',
    '  pages-line: red. "New page" twice',
    '5 checks: 2 green, 2 red, 1 not seen. UNCHECKED: 1 of 5 read nothing, which is not a pass. Exit code 1.',
  ].join('\n');

/** A runner that answers by the person's file, and keeps who it was asked for. */
function runner(byFile) {
  const asked = [];
  const run = (root, file) => {
    asked.push(file);
    return { status: 0, out: '', err: '', ...byFile[file] };
  };
  return { run, asked };
}

/** The gate called with `run`, and everything it wrote. */
function called(run, root = ROOT) {
  const said = [];
  const keep = { log: console.log, error: console.error };
  console.log = (...a) => void said.push(a.join(' '));
  console.error = (...a) => void said.push(a.join(' '));
  try {
    return { code: firstScreenGate(root, run), said: said.join('\n') };
  } finally {
    Object.assign(console, keep);
  }
}

const [MARIAM, SAM] = PEOPLE;

test('the two people are Mariam and Sam, and the command is in the tree', () => {
  assert.deepEqual(PEOPLE, ['tools/people/mariam.json', 'tools/people/sam.json']);
  assert.equal(nameOf(ROOT, MARIAM), 'Mariam');
  assert.equal(nameOf(ROOT, SAM), 'Sam');
  assert.equal(CHECK, 'tools/people/expect/first-screen.mjs');
});

test('both leave with 0: green, both were walked, and nothing is red', () => {
  const { run, asked } = runner({ [MARIAM]: { out: green('Mariam') }, [SAM]: { out: green('Sam') } });
  const { code, said } = called(run);
  assert.equal(code, undefined);
  assert.deepEqual(asked, PEOPLE);
  assert.match(said, /first-screen: 2 people walked through the first run, 0 finding\(s\)/u);
});

test('one leaves with 1: red, and it names who, the first red check, its screen and what it saw', () => {
  const { run, asked } = runner({ [MARIAM]: { out: green('Mariam') }, [SAM]: { status: 1, out: red('Sam') } });
  const { code, said } = called(run);
  assert.equal(code, 1);
  assert.deepEqual(asked, PEOPLE, 'the first person passing does not end the run, and neither would her failing');
  assert.match(said, /Sam: rail-has-rows is red on \/app\/ at 390 wide \(Today and the tab bar, after the first real thing\)\. the rail shows Bills, which holds nothing yet/u);
  assert.doesNotMatch(said, /Mariam:/u, 'the person who passed is not named among the findings');
  assert.doesNotMatch(said, /pages-line/u, 'the first red check, not every one');
  assert.match(said, /1 finding\(s\)/u);
});

test('the first person red does not hide the second', () => {
  const { run } = runner({ [MARIAM]: { status: 1, out: red('Mariam') }, [SAM]: { status: 1, out: red('Sam') } });
  const { code, said } = called(run);
  assert.equal(code, 1);
  assert.match(said, /Mariam: rail-has-rows is red/u);
  assert.match(said, /Sam: rail-has-rows is red/u);
  assert.match(said, /2 finding\(s\)/u);
});

test('a red comes before a check that read nothing, and with no red the unread check is named', () => {
  assert.equal(firstRed(red('Sam')).check, 'rail-has-rows');
  const unread = ['/app/ at 1440 wide, as Sam', '  signs-line: not seen. the snapshot holds no count of vital signs', '1 checks: 0 green, 0 red, 1 not seen. Exit code 1.'].join('\n');
  assert.equal(findingOf('Sam', { status: 1, out: unread, err: '' }), 'Sam: signs-line read nothing, which is not a pass on /app/ at 1440 wide. the snapshot holds no count of vital signs');
  assert.equal(firstRed(green('Sam')), null);
});

test('a walk that drew nothing (2) is red with the command\'s own reason, and so is one that never finished', () => {
  const stopped = { status: 2, out: 'first-screen: red. no screen was drawn: the walk never opened the record. Exit code 2.\n', err: '(node:1) ExperimentalWarning: SQLite is an experimental feature\n' };
  assert.equal(findingOf('Mariam', stopped), 'Mariam: the first-screen checks left with 2 and named no red check. first-screen: red. no screen was drawn: the walk never opened the record. Exit code 2.');
  assert.match(findingOf('Mariam', { status: null, out: '', err: '' }), /^Mariam: the first screens were not drawn and judged within \d+ seconds\.$/u);
  const { code } = called(runner({ [MARIAM]: stopped }).run);
  assert.equal(code, 1);
});

test('a 1 that names nothing is still red: the exit code is the verdict, the lines only say why', () => {
  assert.match(findingOf('Sam', { status: 1, out: green('Sam'), err: '' }), /^Sam: the first-screen checks left with 1 and named no red check\. /u);
});

test('a person whose file is not there is a finding and is not run', () => {
  const { run, asked } = runner({});
  const { walked, findings } = judge(ROOT, run, [MARIAM, 'tools/people/nobody-of-that-name.json']);
  assert.equal(walked, 1);
  assert.deepEqual(asked, [MARIAM]);
  assert.equal(findings.length, 1);
  assert.match(findings[0], /^Nobody-of-that-name: .* is not there/u);
});

test('a tree with no people is skipped with 3 and runs nothing', () => {
  const root = mkdtempSync(join(tmpdir(), 'first-screen-gate-'));
  try {
    const { run, asked } = runner({});
    const { code, said } = called(run, root);
    assert.equal(code, 3);
    assert.deepEqual(asked, []);
    assert.match(said, /Skipped\./u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
