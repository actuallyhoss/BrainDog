import { test } from 'node:test';
import assert from 'node:assert/strict';

import { agentNamed, plainName } from './widgets.ts';

test('an agent is said by its own spelling, as every other page says it', () => {
  assert.equal(agentNamed('claude'), 'Claude');
  assert.equal(agentNamed('codex'), 'Codex');
  assert.equal(agentNamed('Cursor'), 'Cursor');
  assert.equal(agentNamed('aider'), 'Aider');
  assert.equal(agentNamed(undefined), undefined);
});

test('a shouted bank line reads as a name, initials stay', () => {
  assert.equal(plainName('FENWICK CLOUD'), 'Fenwick Cloud');
  assert.equal(plainName('USD'), 'USD');
});
