import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pickableOf, rowsToSend } from './picked.ts';

const servers = {
  register: 'tools',
  rows: [
    { name: 'fenwick', kind: 'mcp', transport: 'stdio', command: 'fenwick-mcp' },
    { name: 'docs', kind: 'mcp', transport: 'http', endpoint: 'https://docs.example/mcp' },
    { kind: 'mcp' },
  ],
};

test('A ROWSET THAT ADDS SEVERAL ROWS is drawn a row each, by name and the line that tells them apart', () => {
  assert.deepEqual(pickableOf('rowset', servers), [
    { n: 0, title: 'fenwick', detail: 'fenwick-mcp' },
    { n: 1, title: 'docs', detail: 'https://docs.example/mcp' },
    { n: 2, title: 'Row 3', detail: '' },
  ]);
});

test('ONE ROW, AN UPDATE, OR ANOTHER KIND is taken whole, with nothing to tick', () => {
  assert.deepEqual(pickableOf('rowset', { register: 'tools', rows: [servers.rows[0]] }), []);
  assert.deepEqual(pickableOf('rowset', { register: 'tools', rows: [servers.rows[0], { at: 'tools#1', version: 1, patch: {} }] }), []);
  assert.deepEqual(pickableOf('change', servers), []);
  assert.deepEqual(pickableOf(undefined, undefined), []);
});

test('ACCEPT SENDS the whole proposal when all are ticked, the ticked places when some are, and nothing to accept when none are', () => {
  assert.equal(rowsToSend(3, []), undefined);
  assert.deepEqual(rowsToSend(3, [1]), [0, 2]);
  assert.deepEqual(rowsToSend(3, [0, 2]), [1]);
  assert.equal(rowsToSend(3, [0, 1, 2]), null);
});
