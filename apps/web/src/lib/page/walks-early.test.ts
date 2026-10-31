import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pageLists, refTargets } from './walks-early.ts';

test('the lists an early page answer draws are named as its reader names them, each once (speed-g SG2)', () => {
  const blocks = [
    { kind: 'note' },
    { kind: 'capture', register: 'tasks' },
    { kind: 'todo', source: 'register.tasks' },
    { kind: 'queue', source: 'governance.open' },
    { kind: 'inputs', register: 'readings' },
    { kind: 'todo', source: 'register.people', refusals: [{ code: 'FORBIDDEN' }] },
    { kind: 'table', source: 'sessions.working' },
  ];
  assert.deepEqual(pageLists(blocks), ['tasks', 'readings', 'session']);
  assert.deepEqual(pageLists(null), []);
});

test('a declaration’s refs and lists of refs are walked, each target once', () => {
  const fields = [
    { id: 'title', type: 'text' },
    { id: 'owner', type: 'ref', to: 'people' },
    { id: 'thing', type: 'ref', to: 'things' },
    { id: 'helpers', type: 'list', of: 'ref', to: 'people' },
    { id: 'tags', type: 'list', of: 'text' },
  ];
  assert.deepEqual(refTargets(fields), ['people', 'things']);
  assert.deepEqual(refTargets(undefined), []);
});
