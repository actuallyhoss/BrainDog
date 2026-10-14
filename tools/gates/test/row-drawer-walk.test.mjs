/**
 * The row drawer's walk, its pure half: what the walk does, as data, and what it calls red (PGS-C04's guard).
 *
 *   node --test tools/gates/test/row-drawer-walk.test.mjs
 *
 * WHY THE JUDGE IS ASKED WITHOUT A BROWSER. The walk presses `p`, Save, Undo, `j` and Escape on a list in a real
 * browser, and a browser gate that cannot go red is a gate that passes a broken panel. So what it read is handed to one
 * pure `judge(seen)`, and each thing PGS-C04 promises is taken away here in turn: a walk that saw it missing is red in
 * the words of what was missing, and a walk that saw all of it is green.
 *
 * AND THE RUNNER HOLDS IT. A walk nobody registered is a walk nobody runs; the last test reads the runner's own list.
 */

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { budget } from '../lib.mjs';
import { NEW_DAY_TASK, OPENED, PLANT, STEPS, TASKS, WALKED, WIDTHS, formOf, handed, judge, needs, planted, seeded, walkedTrue } from '../walks/row-drawer.walk.mjs';

const gates = join(import.meta.dirname, '..');

const THIRD = TASKS[OPENED - 1].what;
const FOURTH = TASKS[WALKED - 1].what;

/** A walk that saw everything PGS-C04 promises, at one width. */
const good = (width) => ({
  width,
  form: width < 900 ? 'bottom sheet' : 'side panel',
  third: THIRD,
  fourth: FOURTH,
  day: { before: '3 Oct', wanted: '21 Oct', saved: '21 Oct', undone: '3 Oct' },
  opened: { row: String(OPENED), task: THIRD },
  saved: { row: null, toast: `Saved ${THIRD}`, undo: true, listed: true },
  reopened: { row: String(OPENED), task: THIRD },
  walked: { row: String(WALKED), task: FOURTH },
  escaped: { row: null, open: false },
});

/** The good walk with one thing changed, by the path to it. */
function without(width, path, value) {
  const seen = structuredClone(good(width));
  const keys = path.split('.');
  let at = seen;
  for (const k of keys.slice(0, -1)) at = at[k];
  at[keys.at(-1)] = value;
  return seen;
}

test('ten tasks, the third opened and the fourth walked to, at the desk and at 390', () => {
  assert.equal(TASKS.length, 10);
  assert.equal(OPENED, 3);
  assert.equal(WALKED, 4);
  /* THE TWO WIDTHS EVERY SCREEN IS AUDITED AT (`budgets.json`), never a pair written into the walk: the phone's 390,
     where the panel is a bottom sheet, and a desk past 1,280, where it docks beside the list. */
  assert.deepEqual([...WIDTHS], [...budget('a11y').widths]);
  assert.equal(WIDTHS.length, 2);
  assert.equal(Math.min(...WIDTHS), 390);
  assert.ok(Math.max(...WIDTHS) >= 1280);
  assert.equal(new Set(TASKS.map((t) => t.what)).size, 10, 'each task has its own name');
  /* ONE TASK ALREADY HOLDS THE DAY THE THIRD IS MOVED TO, so "the new day" is read off the list as the list prints a
     day, and never off a format written down here. No other task is due that day. */
  const moved = TASKS[NEW_DAY_TASK - 1];
  assert.notEqual(NEW_DAY_TASK, OPENED);
  assert.equal(TASKS.filter((t) => t.due === moved.due).length, 1);
  assert.deepEqual(needs, ['web-build']);
});

test('the steps are PGS-C04\'s, in its order, each with what it does in plain words', () => {
  assert.deepEqual(
    STEPS.map((s) => s.id),
    ['list', 'open', 'type', 'save', 'undo', 'reopen', 'walk', 'escape'],
  );
  for (const s of STEPS) {
    assert.equal(typeof s.does, 'string');
    assert.ok(s.does.length > 0 && !/[—–]/u.test(s.does), `${s.id} says what it does, without a dash`);
  }
  assert.equal(STEPS.find((s) => s.id === 'open').key, 'p');
  assert.equal(STEPS.find((s) => s.id === 'walk').key, 'j');
  assert.equal(STEPS.find((s) => s.id === 'escape').key, 'Escape');
});

test('a walk that saw all of it is green, at both widths', () => {
  for (const width of WIDTHS) assert.deepEqual(judge(good(width)), []);
});

/** Each promise taken away, and a word its finding must hold. */
const BROKEN = [
  ['the list not showing the new day after Save', 'day.saved', '3 Oct', /new day|still shows/u],
  ['the list printing no day at all after Save', 'day.saved', null, /new day|no day/u],
  ['no toast after Save', 'saved.toast', null, /toast/u],
  ['a toast with no Undo', 'saved.undo', false, /Undo/u],
  ['Undo not putting the day back', 'day.undone', '21 Oct', /Undo/u],
  ['the address without ?row=3 while the panel is open', 'opened.row', null, /row=3/u],
  ['the address still holding row after Save', 'saved.row', String(OPENED), /after Save/u],
  ['the address still holding row after Escape', 'escaped.row', String(WALKED), /after Escape/u],
  ['Escape leaving the panel open', 'escaped.open', true, /Escape/u],
  ['j not moving the panel to the fourth task', 'walked.task', THIRD, /fourth|j /u],
  ['j not moving the address to the fourth task', 'walked.row', String(OPENED), /row=4/u],
  ['p opening another task than the third', 'opened.task', FOURTH, /third/u],
  ['the list leaving the screen at Save', 'saved.listed', false, /list/u],
];

for (const [name, path, value, says] of BROKEN)
  for (const width of WIDTHS)
    test(`red at ${width}: ${name}`, () => {
      const findings = judge(without(width, path, value));
      assert.ok(findings.length > 0, 'the walk passed it');
      assert.ok(findings.some((f) => says.test(f)), findings.join(' | '));
      assert.ok(findings.every((f) => f.startsWith(`${width}: `)), 'each finding names its width');
      for (const f of findings) assert.doesNotMatch(f, /[—–]/u);
    });

const DESK = Math.max(...WIDTHS);

test('the panel is a bottom sheet at 390 and a panel beside the list at the desk, and the other way round is red', () => {
  assert.ok(judge(without(390, 'form', 'side panel')).some((f) => /bottom sheet/u.test(f)));
  assert.ok(judge(without(DESK, 'form', 'bottom sheet')).some((f) => /beside the list/u.test(f)));
  assert.ok(judge(without(390, 'form', null)).length > 0, 'no panel at all is red');
});

test('a day the list never printed proves nothing, and says so', () => {
  /* The task that already holds the new day prints nothing: there is nothing to hold the third task's day against. */
  assert.ok(judge(without(DESK, 'day.wanted', null)).some((f) => /could not be read/u.test(f)));
  /* The third task printed the new day before anything was typed: the walk would pass a Save that wrote nothing. */
  assert.ok(judge(without(DESK, 'day.before', '21 Oct')).some((f) => /already/u.test(f)));
});

test('the form is read from where the panel sits, never from a width written down', () => {
  const phone = { width: 390, height: 844 };
  const desk = { width: 1512, height: 900 };
  assert.equal(formOf({ form: 'sheet', left: 0, top: 300, width: 390, height: 544 }, phone), 'bottom sheet');
  assert.equal(formOf({ form: 'docked', left: 1060, top: 12, width: 440, height: 876 }, desk), 'side panel');
  assert.equal(formOf({ form: 'sheet', left: 950, top: 0, width: 440, height: 900 }, { width: 1390, height: 900 }), 'side panel');
  /* A sheet that floats in the middle of a phone is neither. */
  assert.equal(formOf({ form: 'sheet', left: 40, top: 100, width: 310, height: 400 }, phone), 'neither');
  assert.equal(formOf(null, phone), null);
});

/* ── the planted fault (`self-test`'s `row-drawer` case) ── */

test('the seed is read from BRAINDOG_GATE_SEED alone, by its own name, among others joined by commas', () => {
  const was = process.env.BRAINDOG_GATE_SEED;
  try {
    delete process.env.BRAINDOG_GATE_SEED;
    assert.equal(seeded(), false, 'no variable, no seed');
    process.env.BRAINDOG_GATE_SEED = 'row-drawer';
    assert.equal(seeded(), true, 'the variable is where it is read from');
    process.env.BRAINDOG_GATE_SEED = 'a11y-contrast, row-drawer';
    assert.equal(seeded(), true, 'one of several, as a11y reads them');
  } finally {
    if (was === undefined) delete process.env.BRAINDOG_GATE_SEED;
    else process.env.BRAINDOG_GATE_SEED = was;
  }
  for (const other of [undefined, '', 'queue', 'keys,prefs', 'row-drawers', 'row', 'drawer'])
    assert.equal(seeded(other), false, `${JSON.stringify(other)} is not this walk's seed`);
  assert.equal(seeded(' row-drawer '), true);
});

test('the planted reading turns a green walk red, in the words self-test names, at both widths', () => {
  for (const width of WIDTHS) {
    const seen = good(width);
    assert.ok(walkedTrue(seen), 'the good walk saw j work, so the planted reading replaces a true one');
    const findings = judge(planted(seen));
    assert.ok(findings.some((f) => f.includes('j did not move the panel to the fourth task')), findings.join(' | '));
    assert.ok(findings.some((f) => f.includes(`after j the address holds row=${OPENED}, not row=${WALKED}`)), findings.join(' | '));
    /* ONE FAULT: every finding is about `j`, and nothing else the walk read was changed. */
    assert.ok(findings.every((f) => /after j|^\d+: j /u.test(f)), findings.join(' | '));
    const { walked: _w, ...rest } = planted(seen);
    const { walked: _v, ...was } = seen;
    assert.deepEqual(rest, was);
    assert.deepEqual(seen, good(width), 'what the walk read is not changed in place');
  }
  assert.doesNotMatch(PLANT, /[—–]/u);
});

test('with no seed the judge says what it said before; a walk whose j was broken anyway is not the seed\'s red', () => {
  const was = process.env.BRAINDOG_GATE_SEED;
  delete process.env.BRAINDOG_GATE_SEED;
  try {
    for (const width of WIDTHS) {
      const seen = good(width);
      assert.equal(handed(seen), seen, 'an unseeded run hands the judge what it read, itself');
      assert.deepEqual(judge(handed(seen)), []);
      assert.notEqual(handed(seen, true), seen);
    }
    for (const [, path, value] of BROKEN) {
      const seen = without(DESK, path, value);
      assert.equal(handed(seen, false), seen);
      assert.deepEqual(judge(handed(seen)), judge(seen));
    }
  } finally {
    if (was !== undefined) process.env.BRAINDOG_GATE_SEED = was;
  }
  assert.equal(walkedTrue(without(DESK, 'walked.task', THIRD)), false);
  assert.equal(walkedTrue(without(DESK, 'walked.row', null)), false);
});

test('the runner holds an entry row-drawer, beside queue, in the run a web build meets', () => {
  const list = (args) => {
    const r = spawnSync(process.execPath, [join(gates, 'run.mjs'), ...args, '--list'], { encoding: 'utf8', env: { ...process.env, CI: '' } });
    assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
    return r.stdout.trim().split('\n');
  };
  const all = list([]);
  assert.ok(all.includes('row-drawer'), 'no entry row-drawer');
  assert.equal(all.indexOf('row-drawer'), all.indexOf('queue') + 1);
  assert.ok(list(['--built']).includes('row-drawer'));
  assert.ok(!list(['--unbuilt']).includes('row-drawer'));
});
