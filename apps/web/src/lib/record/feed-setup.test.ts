/**
 * A feed block on a page says a record setting itself up as one line, in the words Home's feed uses.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { feedTable } from './api.ts';

test('A SETUP ROW ON A FEED BLOCK IS SAID AS HOME SAYS IT, the use case and how many example rows', () => {
  const at = '2026-09-17T11:00:00.000Z';
  const { rows } = feedTable(
    [
      { by: 'you', who: 'p_1', count: 1, kind: 'create', target: 'goals#9', note: null, at, thing: 'Learn to swim' },
      { by: 'rule', who: 'system', count: 1, kind: 'setup', target: 'pack:usecase-personal', note: null, at, rows: 56 },
      { by: 'rule', who: 'system', count: 1, kind: 'setup', target: null, note: null, at, rows: 0 },
    ],
    false,
    null,
    Date.parse(at),
    'p_1',
  );
  assert.deepEqual(
    rows.map((r) => r.cells[3]),
    ['added Learn to swim', 'Set up Personal with 56 example rows', 'Linked the example rows to each other'],
  );
});
