/** The first-run connect screen's decisions: five apps with this record's lines, and the sign's two states. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { connectLines } from '../record/device.ts';
import { appLines, firstWords, signOf } from './first-connect.ts';

test('five apps, each with a line for this record and no key', () => {
  const apps = appLines(connectLines('https://brain.dog', 'acme'));
  assert.deepEqual(
    apps.map((a) => a.name),
    ['Claude Code', 'Claude', 'ChatGPT', 'VS Code', 'Cursor'],
  );
  assert.equal(apps[0]?.line, 'braindog setup https://brain.dog/app/acme');
  assert.equal(apps[1]?.line, 'https://brain.dog/mcp');
  assert.ok(apps.every((a) => !/bearer|token|—/iu.test(a.line + a.what)));
});

test('the sign waits, then names the agent and the machine', () => {
  assert.deepEqual(signOf([]), { connected: false, said: firstWords.waiting });
  const at = '2026-10-20T10:00:00Z';
  assert.equal(signOf([{ tile: 'claude-code', app: 'Claude Code', machine: 'MacBook', at }]).said, 'Connected: Claude Code on MacBook');
  assert.equal(signOf([{ tile: 'other', app: 'Cursor', machine: null, at }]).said, 'Connected: Cursor');
});
