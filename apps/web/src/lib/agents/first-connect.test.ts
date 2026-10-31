/** The first-run connect screen's decisions: five apps with this record's lines, and the sign's two states. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { connectLines } from '../record/device.ts';
import { appLines, exampleOf, firstWords, signOf } from './first-connect.ts';

test('five apps, Claude first at every width, each with a line for this record and no key', () => {
  const apps = appLines(connectLines('https://brain.dog', 'acme'));
  assert.deepEqual(
    apps.map((a) => a.name),
    ['Claude', 'ChatGPT', 'Claude Code', 'VS Code', 'Cursor'],
  );
  assert.equal(apps[0]?.before, null);
  assert.equal(apps[0]?.line, 'https://brain.dog/mcp');
  assert.equal(apps[2]?.before, 'curl -fsSL https://brain.dog/cli/install.sh | sh', 'the install line comes before setup');
  assert.equal(apps[2]?.line, 'braindog setup https://brain.dog/acme');
  assert.ok(apps.every((a) => !/bearer|token|—/iu.test(a.line + a.what)));
});

test('THE EXAMPLE NAMES WHAT THE BRAINDOG KEEPS (AH25)', () => {
  assert.equal(exampleOf(['orders', 'products', 'people', 'obligations']), 'an order, a bill or somebody you met');
  assert.equal(exampleOf(['courses', 'assignments', 'study_sessions']), 'an essay that is due');
  assert.equal(exampleOf([]), 'something to do, a bill or somebody you met');
  assert.doesNotMatch(firstWords.sub(['assignments']), /order/u);
});

test('THE SCREEN FIRST SAYS WHAT WAS MADE, by the places on it', () => {
  assert.equal(firstWords.made(['Orders', 'Products', 'People', 'Money']), 'Your BrainDog is made, with Orders, Products, People and Money, and more as you fill them.');
  assert.equal(firstWords.made([]), 'Your BrainDog is made.');
});

test('the sign waits, then names the agent and the machine', () => {
  assert.deepEqual(signOf([]), { connected: false, said: firstWords.waiting });
  const at = '2026-10-20T10:00:00Z';
  assert.equal(signOf([{ tile: 'claude-code', app: 'Claude Code', machine: 'MacBook', at }]).said, 'Connected: Claude Code on MacBook');
  assert.equal(signOf([{ tile: 'other', app: 'Cursor', machine: null, at }]).said, 'Connected: Cursor');
});

test('WHAT TO DO IN THE APP LEADS, AND THE AGENT IS THE SECOND STEP, said as optional (first hour audit, E3)', () => {
  assert.doesNotMatch(firstWords.title, /agent|connect/iu, 'the first title is about an agent again');
  assert.match(firstWords.sub(), /Today/u);
  assert.match(firstWords.agentTitle, /if you use one/u);
  assert.equal(firstWords.go, 'Go to Today');
});
