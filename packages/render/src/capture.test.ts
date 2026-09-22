/**
 * `capture`: the one-line add, as a kind (`src/capture.ts`).
 *
 * The Svelte drawer's tree is held against `toHTML`'s in `parity.test.ts`; what is asserted here is
 * what both of them read, and the one branch only the Svelte drawer has, where a host can write.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { KINDS } from './kinds.ts';
import { parse } from './parse.ts';
import { captioned, toHTML } from './html.ts';
import { CAPTURE_ADD, captureFault, capturePlan, capturePrompt, captureSubmit } from './capture.ts';

const fence = (body: string, heading = 'What needs doing?'): string => '```capture | ' + heading + '\n' + body + '\n```';
const rows = (...lines: string[][]) => lines.map((cells) => ({ cells }));

test('A CAPTURE IS A PAGE KIND ON THE PANEL, and a fence in a write-up degrades as every page kind does', () => {
  assert.equal(KINDS.capture.primitive, 'panel');
  assert.equal(KINDS.capture.pageOnly, true);
  assert.equal(parse(fence('into | tasks | Tasks'))[0]?.type, 'degraded', 'a write-up has no host to add with');
  assert.equal(parse(fence('into | tasks | Tasks'), { page: true })[0]?.type, 'block');
});

test('THE LIST AND WHAT A NEW ROW IS FILLED WITH are read off the rows, and nothing else is', () => {
  const plan = capturePlan(rows(['into', 'tasks', 'Tasks', '/r/tasks'], ['set', 'state', 'backlog'], ['set', 'agent', 'claude']));
  assert.deepEqual(plan, { register: 'tasks', label: 'Tasks', href: '/r/tasks', inherited: { state: 'backlog', agent: 'claude' } });
  /* A LIST WITH NO NAME IS CALLED BY ITS ID, and a place that is not a path of this host is no place. */
  assert.deepEqual(capturePlan(rows(['into', 'tasks', '', '//evil.example/x'])), { register: 'tasks', label: 'tasks', href: null, inherited: {} });
  assert.equal(capturePlan(rows(['set', 'state', 'open'])), null, 'no list, no plan, and so no field');
});

test('A ROW THAT WOULD SEND A LINE SOMEWHERE NOBODY SAID degrades the block, with the reason', () => {
  assert.equal(captureFault([['into', 'tasks', 'Tasks'], ['set', 'state', 'open']]), null);
  const faults: [string[][], RegExp][] = [
    [[], /no into row/u],
    [[['set', 'state', 'open']], /before the list/u],
    [[['into', 'tasks'], ['into', 'people']], /two lists/u],
    [[['into', 'Tasks!']], /not a register's id/u],
    [[['into', 'tasks', 'Tasks', '/\\evil.example/x']], /not a path/u],
    [[['into', 'tasks'], ['set', 'state', 'open'], ['set', 'state', 'done']], /two values for state/u],
    [[['into', 'tasks'], ['set', 'state', '']], /no field or no value/u],
    [[['into', 'tasks'], ['where', 'state', 'open']], /starts "where"/u],
  ];
  for (const [given, said] of faults) assert.match(captureFault(given) ?? '', said, JSON.stringify(given));
  const drawn = parse(fence('into | tasks\nset | state | open\nset | state | done'), { page: true })[0];
  assert.equal(drawn?.type, 'degraded');
  assert.match(drawn && 'fix' in drawn ? drawn.fix : '', /A capture block has two values for state\./u);
});

test('PRESSING ADD HANDS THE HOST THE LIST, THE TRIMMED TEXT AND A COPY OF WHAT IT INHERITS, and a line of spaces hands it nothing', () => {
  const plan = capturePlan(rows(['into', 'tasks', 'Tasks'], ['set', 'state', 'backlog']));
  const sent = captureSubmit(plan, '  Chase Halden  ');
  assert.deepEqual(sent, { register: 'tasks', text: 'Chase Halden', inherited: { state: 'backlog' } });
  sent!.inherited.state = 'done';
  assert.deepEqual(captureSubmit(plan, 'Again')?.inherited, { state: 'backlog' }, 'a host keeping the object cannot change the next press');
  assert.equal(captureSubmit(plan, '   '), null);
  assert.equal(captureSubmit(null, 'Chase Halden'), null);
});

test('THE HEADING IS THE PROMPT AND NOT A CAPTION, and a capture with none is prompted in the list’s name', () => {
  const [block] = parse(fence('into | tasks | Tasks'), { page: true });
  assert.equal(block?.type, 'block');
  assert.equal(captioned(block as never), false);
  const plan = capturePlan(rows(['into', 'tasks', 'Tasks']))!;
  assert.equal(capturePrompt('What needs doing?', plan), 'What needs doing?');
  assert.equal(capturePrompt('', plan), 'Add to Tasks');
});

test('THE MIRROR HAS NO HOST TO ADD WITH, so it draws no field and no button: the list, as a door where it has an address', () => {
  const door = toHTML(parse(fence('into | tasks | Tasks | /r/tasks?f=state:is:backlog\nset | state | backlog'), { page: true }));
  assert.doesNotMatch(door, /<input|<button|<form|disabled/u);
  assert.match(door, /<p class="capture-elsewhere"><a class="capture-where" href="\/r\/tasks\?f=state:is:backlog">Add to Tasks<\/a><\/p>/u);
  assert.doesNotMatch(door, /figcaption/u, 'the prompt is not drawn as a caption over a field that is not there');
  const nowhere = toHTML(parse(fence('into | tasks | Tasks'), { page: true }));
  assert.match(nowhere, /<p class="capture-elsewhere">Tasks cannot be added to from here\.<\/p>/u);
  assert.equal(CAPTURE_ADD, 'Add');
});
