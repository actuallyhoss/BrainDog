/** The ask tile's state and the access sheet's rule mapping. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { askLine, askRun, choiceOf, defaultName, focusOf, ruleOfChoice, sheetOf, waitingAsks, type KeyAsk } from './access.ts';

const NOW = Date.parse('2026-10-26T12:00:00Z');
const ask = (over: Partial<KeyAsk>): KeyAsk => ({
  id: 'ka_1', credential: 'credentials#3', label: 'Stripe live', machine: 'h1', machine_name: 'Mac mini', run: null,
  status: 'pending', asked_at: '2026-10-26T11:59:00Z', expires: '2026-10-26T12:04:00Z', ...over,
});

test('only waiting asks are offered, the soonest to run out first', () => {
  const list = [ask({ id: 'a', expires: '2026-10-26T12:09:00Z' }), ask({ id: 'b' }), ask({ id: 'c', status: 'once' }), ask({ id: 'd', expires: '2026-10-26T11:00:00Z' })];
  assert.deepEqual(waitingAsks(list, NOW).map((a) => a.id), ['b', 'a']);
  assert.deepEqual(waitingAsks([], NOW), []);
});

test('an ask is said by the machine, else the run, else "A machine"', () => {
  assert.equal(askLine(ask({})), 'Mac mini wants to use Stripe live');
  assert.equal(askLine(ask({ machine_name: null, run: 'runs#9' })), 'runs#9 wants to use Stripe live');
  assert.equal(askLine(ask({ machine_name: null, label: null })), 'A machine wants to use credentials#3');
  assert.equal(askRun(ask({ run: 'runs#9' })), 'runs#9');
  assert.equal(askRun(ask({})), null);
});

test('the address names an ask, and says whether it is still waiting', () => {
  const list = [ask({}), ask({ id: 'ka_2', status: 'deny' })];
  assert.equal(focusOf(list, 'ka_1', NOW)?.waiting, true);
  assert.equal(focusOf(list, 'ka_2', NOW)?.waiting, false);
  assert.equal(focusOf(list, 'ka_9', NOW), null);
  assert.equal(focusOf(list, null, NOW), null);
});

test('no row means Always (default), and a rule is sent as it is read', () => {
  const machines = [{ handle: 'h1', label: 'Mac mini' }, { handle: 'h2', label: null }];
  const m = sheetOf(machines, []);
  assert.equal(m.fallback, null);
  assert.equal(defaultName(m.fallback), 'Always (default)');
  assert.deepEqual(m.lines.map((l) => [l.name, l.choice, l.effective]), [['Mac mini', 'default', 'always'], ['A machine', 'default', 'always']]);
  assert.equal(ruleOfChoice('default'), null);
  assert.equal(ruleOfChoice('ask'), 'ask');
  assert.equal(choiceOf(null), 'default');
  assert.equal(choiceOf('deny'), 'deny');
});

test('a key default is followed by a machine with no rule of its own', () => {
  const rules = [
    { credential: 'credentials#3', machine: '*', machine_name: null, rule: 'ask' as const },
    { credential: 'credentials#3', machine: 'h1', machine_name: 'Mac mini', rule: 'always' as const },
    { credential: 'credentials#3', machine: 'gone', machine_name: 'Old laptop', rule: 'deny' as const },
  ];
  const m = sheetOf([{ handle: 'h1', label: 'Mac mini' }, { handle: 'h2', label: 'Runner' }], rules);
  assert.equal(m.fallbackChoice, 'ask');
  assert.equal(defaultName(m.fallback), 'Key default: Ask each time');
  assert.deepEqual(m.lines.map((l) => [l.machine, l.choice, l.effective]), [['h1', 'always', 'always'], ['h2', 'default', 'ask'], ['gone', 'deny', 'deny']]);
});
