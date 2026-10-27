/**
 * The perf gate's judge and its seed, asked without a browser.
 *
 *   node --test tools/gates/test/perf-gate.test.mjs
 *
 * The walk draws nine screens in a real browser; what is held here is the part that decides red: a time over its ceiling
 * is a finding that says the screen, the width, the time and the budget, Today is held to its own copy ceiling, and the
 * planted run is chosen by name among others.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { SCREENS, judge, seededBy } from '../perf.mjs';

const P = { paintMs: 10, drawnMs: 20, copyMs: 30, todayCopyMs: 40, revisitMs: 50, callsMax: Object.fromEntries(SCREENS.map((s) => [s.name, 5])) };
const row = (screen, over = {}) => ({ screen, width: 390, paint: 1, drawn: 1, copy: 1, revisit: 1, calls: 1, by: { boot: 1 }, asked: ['boot'], ...over });

test('times inside every ceiling are green', () => {
  assert.deepEqual(judge(SCREENS.map((s) => row(s)), P), []);
});

test('each time over its ceiling is a finding naming the screen, the width, the time and the budget', () => {
  const other = SCREENS.find((s) => !s.today);
  const found = judge([row(other, { paint: 11, drawn: 21, copy: 31, revisit: 51 })], P);
  assert.equal(found.length, 4);
  assert.match(found[0], new RegExp(`^${other.name} @390  first paint took 11 ms, over its budget of 10 ms$`, 'u'));
  assert.ok(found.some((f) => f.includes('a revisit took 51 ms, over its budget of 50 ms')));
});

test('Today is held to its own ceiling for the kept copy, and every other screen to the general one', () => {
  const today = SCREENS.find((s) => s.today);
  const other = SCREENS.find((s) => !s.today);
  assert.deepEqual(judge([row(today, { copy: 40 })], P), []);
  assert.equal(judge([row(today, { copy: 41 })], P).length, 1);
  assert.equal(judge([row(other, { copy: 31 })], P).length, 1);
});

test('a screen over its reads budget, one with none, and one asking a read twice are each a finding (scope 2026-10-24 A6)', () => {
  const other = SCREENS.find((s) => !s.today);
  const over = judge([row(other, { calls: 6, by: { list: 6 } })], P);
  assert.equal(over.length, 1);
  assert.match(over[0], new RegExp(`^${other.name} @390  asked 6 reads, over its budget of 5 \\(list 6\\)$`, 'u'));
  assert.match(judge([row(other)], { ...P, callsMax: {} })[0], /has no reads budget in perf.callsMax/u);
  assert.equal(judge([row(other, { asked: ['list tasks', 'list tasks'] })], P).length, 1);
});

test('the nine screens are the ones the roadmap names, and exactly one is Today', () => {
  assert.equal(SCREENS.length, new Set(SCREENS.map((s) => s.name)).size);
  assert.equal(SCREENS.filter((s) => s.today).length, 1);
});

test('the planted run is chosen by name, among others joined by commas, and by nothing else', () => {
  for (const yes of ['perf', ' perf ', 'queue, perf', 'perf,keys']) assert.equal(seededBy(yes), true, yes);
  for (const no of [undefined, '', 'perfs', 'per', 'queue,keys']) assert.equal(seededBy(no), false, String(no));
});
