/**
 * Who else is in this working tree, and a next step that is true or absent (AGT-B08).
 *
 * On the owner's record a session saw six warning lines, four about sessions dead for hours, and another was told to
 * start a batch ten hours old and 53 commits behind. So the warning is said once and only for runs working in the same
 * tree on the same machine, and the Next slot is one of four shapes, a step past its window being absent.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { WORKING_MS, type Json } from '@braindog/kernel';

import { STEP_DAYS, TREE_WARNING, alsoHere, nextLines, sameTree, type TreeRun } from '../src/same-tree.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const MIN = 60_000;
const at = (msAgo: number): string => new Date(NOW - msAgo).toISOString();

const HERE = { host: 'dev-mac', repo: 'braindog', remote: 'github.com/mara/braindog' };

/** A run `seq`, working in the tree `HERE` and heard from `ago` ms before now unless `more` says otherwise. */
const run = (seq: number, more: Record<string, Json> = {}, state = 'active', ago = MIN): TreeRun => ({
  id: `run_${String(seq)}`,
  seq,
  state,
  fields: { ...HERE, agent: 'claude', client: 'claude-code', last_seen: at(ago), ...more },
});

const self = run(900, { doing: 'Fixing the money page' });

test('two runs in one folder on one machine share a tree', () => {
  assert.equal(sameTree(self, run(1)), true);
});

test('another machine, a parent, a child, a sibling and the run itself are not the same tree', () => {
  assert.equal(sameTree(self, run(1, { host: 'office-pc' })), false, 'another machine');
  assert.equal(sameTree(self, run(1, { host: '' })), false, 'a run that names no machine');
  assert.equal(sameTree(self, run(1, { parent: 'S900' })), false, 'its helper');
  const helper = run(901, { parent: 'S5' });
  assert.equal(sameTree(helper, run(5)), false, 'its parent');
  assert.equal(sameTree(helper, run(6, { parent: 'S5' })), false, 'a sibling under one parent');
  assert.equal(sameTree(self, run(900)), false, 'itself');
});

test('the repository is the folder and the remote together', () => {
  assert.equal(sameTree(self, run(1, { repo: 'kiln' })), false, 'another folder');
  assert.equal(sameTree(self, run(1, { remote: 'github.com/other/braindog' })), false, 'one folder name, two remotes');
  assert.equal(sameTree(self, run(1, { remote: null })), true, 'one side knows no remote');
  assert.equal(sameTree(run(2, { repo: null }), run(1, { repo: null })), true, 'no folder names: the remotes decide');
});

test('another machine, a parent, a sibling and a quiet run give no warning', () => {
  const helper = run(901, { parent: 'S5' });
  const others = [
    run(1, { host: 'office-pc' }),
    run(5),
    run(6, { parent: 'S5' }),
    run(7, {}, 'active', WORKING_MS + MIN),
    run(8, {}, 'idle'),
    run(9, {}, 'handoff'),
    run(10, {}, 'done'),
    { id: 'run_11', seq: 11, state: 'active', fields: { ...HERE } },
    helper,
  ];
  assert.equal(alsoHere(others, helper, NOW), null);
});

test('ten working runs give one sentence, three names and a count, and the caller is never one of them', () => {
  const ten = [self, ...Array.from({ length: 9 }, (_, i) => run(i + 1, { doing: `Task ${String(i + 1)}` }, 'active', (i + 1) * MIN))];
  const here = alsoHere(ten, self, NOW);
  assert.ok(here);
  assert.equal(here.warning, TREE_WARNING);
  assert.equal(here.lines.filter((l) => l === TREE_WARNING).length, 1, 'the warning once');
  assert.deepEqual(
    here.runs.map((r) => r.name),
    ['Claude Code (S1)', 'Claude Code (S2)', 'Claude Code (S3)'],
    'the three most recently heard from',
  );
  assert.equal(here.more, 6);
  assert.equal(here.lines[1], 'Also here: Claude Code (S1), Task 1; Claude Code (S2), Task 2; Claude Code (S3), Task 3, and 6 more.');
  assert.ok(!here.lines.join(' ').includes('S900'), 'not the caller');
  assert.ok(!here.lines.join(' ').includes('—'), 'no em dash');
});

test('another session\'s helpers are never also here; a helper whose session went quiet stands on its own', () => {
  const busy = [run(5, { doing: 'Fixing the card' }), run(6, { parent: 'S5' }), run(7, { parent: 'S5' })];
  const here = alsoHere(busy, self, NOW);
  assert.deepEqual(here?.runs.map((r) => r.name), ['Claude Code (S5)']);
  assert.equal(here?.more, 0);
  assert.equal(here?.lines[1], 'Also here: Claude Code (S5), Fixing the card.');
  const orphan = alsoHere([run(5, {}, 'active', WORKING_MS + MIN), run(6, { parent: 'S5' })], self, NOW);
  assert.deepEqual(orphan?.runs.map((r) => r.name), ['Claude Code (S6)']);
  assert.equal(alsoHere([run(1, { host: 'office-pc' }), run(2, { host: 'office-pc', parent: 'S1' })], self, NOW), null, 'the same repository on another machine');
});

test('one other run is named with what it says, and a run that has not said is named alone', () => {
  const said = alsoHere([run(1, { doing: 'Writing the tests.' })], self, NOW);
  assert.equal(said?.lines[1], 'Also here: Claude Code (S1), Writing the tests.');
  const quiet = alsoHere([run(2, { doing: 'Claude Code in BrainDog' })], self, NOW);
  assert.equal(quiet?.lines[1], 'Also here: Claude Code (S2).');
});

/* ── the Next slot ─────────────────────────────────────────────────────────────────────────────────────────────────────── */

const HOUR = 60 * MIN;
const left = run(812, {}, 'handoff');

test('an open step names its writer, its age and the commits since, and asks to check another run\'s step', () => {
  const lines = nextLines({ by: left, step: 'Wire the end hook', at: at(2 * HOUR), commits: 3, tried: ['Calling handoff with ended', 'A second hook'] }, null, NOW);
  assert.deepEqual(lines, [
    'Wire the end hook. Left by Claude Code (S812) 2h ago, 3 commits since. Check before acting.',
    'Tried: Calling handoff with ended; A second hook',
  ]);
});

test('the reader\'s own fresh step needs no check, and its own day-old step does', () => {
  const step = { by: left, step: 'Wire the end hook.', at: at(5 * MIN), mine: true };
  assert.deepEqual(nextLines(step, null, NOW), ['Wire the end hook. Left by Claude Code (S812) 5 min ago.']);
  const old = nextLines({ ...step, at: at(25 * HOUR), commits: 1 }, null, NOW);
  assert.equal(old[0], 'Wire the end hook. Left by Claude Code (S812) 1 day ago, 1 commit since. Check before acting.');
});

test('the Tried line is cut at 90 characters', () => {
  const tried = ['Reading the whole file at once, which the API drops', 'running the full suite', 'restarting the worker by hand'];
  const lines = nextLines({ by: left, step: 'Wire the end hook', at: at(HOUR), tried }, null, NOW);
  assert.equal(lines.length, 2);
  assert.ok(lines[1]!.startsWith('Tried: Reading the whole file'));
  assert.ok(lines[1]!.length <= 90, `${String(lines[1]!.length)} characters`);
  assert.ok(lines[1]!.endsWith('…'));
});

test('a step somebody took says who and when', () => {
  const taken = { by: run(815), at: at(3 * MIN) };
  const lines = nextLines({ by: left, step: 'Wire the end hook', at: at(HOUR), taken }, null, NOW);
  assert.deepEqual(lines, ['Claude Code (S815) took this 3 min ago: Wire the end hook.']);
});

test('nothing handed over names the last session here, when it ended and its commit', () => {
  const last = { by: run(812, {}, 'done'), at: at(2 * HOUR), head: '5a57ba2' };
  assert.deepEqual(nextLines(null, last, NOW), ['Nothing was handed over. Last here: Claude Code (S812), 2h ago, at 5a57ba2.']);
  assert.deepEqual(nextLines(null, { ...last, head: null }, NOW), ['Nothing was handed over. Last here: Claude Code (S812), 2h ago.']);
});

test('a step past its window is absent, never shown stale', () => {
  const stale = { by: left, step: 'Start batch 31', at: at((STEP_DAYS * 24 + 1) * HOUR), commits: 53 };
  const last = { by: run(813, {}, 'done'), at: at(HOUR), head: 'c0ffee1' };
  const lines = nextLines(stale, last, NOW);
  assert.deepEqual(lines, ['Nothing was handed over. Last here: Claude Code (S813), 1h ago, at c0ffee1.']);
  assert.ok(!lines.join(' ').includes('batch 31'));
  assert.deepEqual(nextLines({ ...stale, at: 'not a time' }, null, NOW), [], 'an instant nobody can read');
});

test('a record where no run ended here before has no Next at all', () => {
  assert.deepEqual(nextLines(null, null, NOW), []);
});
