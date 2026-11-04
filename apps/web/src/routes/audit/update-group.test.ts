/**
 * SHL-A21's web half: one pass of BrainDog's own update is one line on Activity that opens to what it did, and the
 * sentence under the title counts the record's own lines apart from the agents', from the record's own `byWho`.
 *
 * THE LINES ARE MADE AS `readLog` HANDS THEM ON: the record folds a pass into one line (`update-pass.ts`) with its
 * sentence as `pass` and every line it wrote as `steps`, and the web keeps both on the line it draws.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import type { AuditEvent, EventKind } from '../../lib/record/schema.ts';
import { awaySaid, burstsOf, byWhoOf, historyWords, keyOf, passOf, type ByWho, type Passed } from './lines.ts';

const NO_NAMES: ReadonlyMap<string, string> = new Map();
const at = (m: number): string => new Date(2026, 9, 9, 3, m).toISOString();

const ev = (seq: number, by: string, kind: EventKind, target: string | undefined, note: string): AuditEvent => ({
  seq,
  at: at(seq % 60),
  by,
  kind,
  ...(target === undefined ? {} : { target }),
  note,
  version: seq,
});

/** Six things one pass did, newest first, as the record sends them under the pass. */
const STEPS: AuditEvent[] = [
  ev(106, 'system', 'note', undefined, 'People was updated to 1.4.0.'),
  ev(105, 'system', 'upgrade', 'pack:people', ''),
  ev(104, 'system', 'declare', 'page.people', ''),
  ev(103, 'system', 'note', undefined, 'Money was updated to 2.1.0.'),
  ev(102, 'system', 'upgrade', 'pack:money-core', ''),
  ev(101, 'system', 'declare', 'page.money', ''),
];

const SAID = 'BrainDog updated 2 add-ons: Money and People, and nothing you changed was lost.';

/** The one line the pass is said as: its newest step's place in the log, the sentence, and the steps under it. */
const PASS: Passed = {
  ...STEPS[0]!,
  kind: 'upgrade',
  note: SAID,
  pass: { said: SAID, updated: 2, asked: 0, steps: STEPS.length, at: '2026-10-09' },
  steps: STEPS,
};

test('a pass of six steps reads as one line that opens to its six steps', () => {
  const told = burstsOf([ev(120, 'agent:codex', 'edit', 'tasks#4', 'Status set to Done'), PASS, ev(90, 'you', 'create', 'tasks#5', '')]);
  assert.equal(told.length, 3, 'the pass is one line among the others, never six');
  const line = told[1]!;
  const pass = passOf(line.e);
  assert.ok(pass, 'the pass line is read as a pass');
  assert.equal(pass.said, SAID, 'the line says what the pass did, by the names of what it updated');
  assert.equal(pass.steps.length, 6, 'and opens to every step it wrote');
  assert.deepEqual(
    pass.steps.map((s) => s.e.seq),
    [106, 105, 104, 103, 102, 101],
    'newest first, as the record sent them',
  );
  assert.equal(new Set(pass.steps.map((s) => s.key)).size, 6, 'each step is keyed once');
  assert.ok(pass.steps.every((s) => s.key.startsWith(`${keyOf(line.e)}/`)), 'a step is keyed under its pass');
});

/**
 * A PERSON'S OWN EDIT IN THE SAME MINUTE IS NEVER THE PASS'S. The record folds only what `system` wrote inside the pass
 * (`passFolder`), and here nothing joins a pass either: it has no list to burst on and is no run to fold under, so the
 * person's update of the same add-on, a minute's twin of the pass, is still their own line beside it.
 */
test("a person's own edit in the same minute as a pass is never folded into it", () => {
  const mine: AuditEvent = { ...ev(107, 'you', 'upgrade', 'pack:people', ''), at: PASS.at };
  const theirs: AuditEvent = { ...ev(100, 'p_mara', 'edit', 'tasks#9', 'Status set to Done'), at: PASS.at };
  const told = burstsOf([mine, PASS, theirs]);
  assert.equal(told.length, 3, "the pass, and each person's edit on its own");
  assert.deepEqual(
    told.map((t) => t.e.by),
    ['you', 'system', 'p_mara'],
  );
  assert.equal(passOf(told[0]!.e), null, 'your update of an add-on is no pass, however close to one');
  const steps = passOf(told[1]!.e)!.steps;
  assert.ok(
    steps.every((s) => s.e.by === 'system'),
    'and what the pass opens to is what the record wrote',
  );
  assert.ok(!steps.some((s) => s.e === mine || s.e === theirs));
});

test('a line that is no pass, or a pass with nothing under it, is drawn as it always was', () => {
  assert.equal(passOf(ev(1, 'system', 'install', 'pack:money-core', '')), null);
  assert.equal(passOf({ ...PASS, steps: [] }), null, 'a pass the record sent no steps for has nothing to open');
  const bare = passOf({ ...PASS, pass: { ...PASS.pass!, said: '' } });
  assert.equal(bare?.said, SAID, 'a pass with no sentence says its note, which the record sets to the same words');
});

test("the sentence under the title counts the record's own apart from the agents'", () => {
  /* HIS RECORD ON THE MORNING AFTER AN UPDATE: sixty newest lines, the pass one of them. */
  const actors = [...Array<string>(52).fill('agent:codex'), 'system', ...Array<string>(7).fill('you')];
  const byWho: ByWho = { you: 7, people: 0, agents: 52, rules: 0, record: 1 };
  assert.equal(
    awaySaid(actors, null, NO_NAMES, true, byWho),
    'More than 60 changes since you were last here. Agents made 52 of the newest 60, and BrainDog itself made one.',
  );
  assert.equal(
    awaySaid(['agent:codex', 'system', 'system', 'you'], null, NO_NAMES, false, { you: 1, people: 0, agents: 1, rules: 0, record: 2 }),
    '4 changes since you were last here. Agents made one, and BrainDog itself made 2.',
  );
  /* THE RECORD'S COUNT WINS over the web's own reading of who: Slash is the record's, never an agent's. */
  assert.equal(
    awaySaid(['slash', 'you'], null, NO_NAMES, false, { you: 1, people: 0, agents: 0, rules: 0, record: 1 }),
    '2 changes since you were last here. BrainDog itself made one.',
  );
  assert.equal(awaySaid(['system'], null, NO_NAMES, false, { you: 0, people: 0, agents: 0, rules: 0, record: 1 }), 'One change since you were last here, by BrainDog itself.');
  assert.equal(
    awaySaid(['system', 'system'], null, NO_NAMES, false, { you: 0, people: 0, agents: 0, rules: 0, record: 2 }),
    '2 changes since you were last here. BrainDog itself made all of them.',
  );
  assert.equal(
    awaySaid([...Array<string>(59).fill('you'), 'system'], null, NO_NAMES, true, { you: 59, people: 0, agents: 0, rules: 0, record: 1 }),
    'More than 60 changes since you were last here. BrainDog itself made one of the newest 60.',
  );
  /* A HOST OLDER THAN `byWho` is counted as before. */
  assert.equal(awaySaid(['S4', 'slash'], null, NO_NAMES, false, null), '2 changes since you were last here. Agents made all of them.');
  for (const s of [historyWords.itself, historyWords.showSteps(1), historyWords.showSteps(6), historyWords.hideSteps]) {
    assert.doesNotMatch(s, /—|\brow\b/u, 'no em dash and no "row" in what a person reads');
  }
});

test('only a count is taken as the record’s count of who', () => {
  assert.deepEqual(byWhoOf({ you: 1, people: 0, agents: 2, rules: 0, record: 3 }), { you: 1, people: 0, agents: 2, rules: 0, record: 3 });
  assert.equal(byWhoOf(undefined), null);
  assert.equal(byWhoOf({ you: 1, agents: 2 }), null, 'a count missing a kind is not one');
  assert.equal(byWhoOf({ you: 1, people: 0, agents: -2, rules: 0, record: 3 }), null);
});

test('Activity draws the pass as its sentence, and what it did closed until pressed', () => {
  const page = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
  const markup = page.slice(page.indexOf('{#snippet entry('), page.indexOf('<PageHead'));
  assert.match(markup, /\{@const pass = passOf\(e\)\}/u, 'the line asks whether it is a pass');
  assert.match(markup, /\{:else if pass !== null\}<span class="line-title">\{pass\.said\}<\/span>/u, 'and says its sentence as its whole line');
  assert.match(markup, /aria-expanded=\{open\}/u, 'the press says whether it is open');
  assert.match(markup, /\{#if open\}\s*<ul class="ledger steps" in:opens out:shuts>/u, 'the steps are drawn only once opened');
  assert.match(page, /let passesOpen = \$state<ReadonlySet<string>>\(new Set\(\)\);/u, 'and every pass starts closed');
  /* ACTIVITY DROPPED THE COUNT SENTENCE UNDER ITS TITLE (4f6f97102), so it can no longer disagree with the tile's count. */
  assert.doesNotMatch(page.replace(/<!--[\s\S]*?-->/gu, '').replace(/\/\*[\s\S]*?\*\//gu, ''), /\bawaySaid\(/u, 'the count sentence is back under the title');
});
