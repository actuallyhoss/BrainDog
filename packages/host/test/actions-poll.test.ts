/**
 * A founder's poll pointed at a JSON server on this machine, the way a person tries one out, is refused like any
 * other private or local address: a port does not make loopback public, and no setting lets it through.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { refusedHost } from '../src/actions.ts';

test('A POLL OF A LOCAL JSON SERVER ON ANY PORT IS A LOCAL ADDRESS', () => {
  for (const url of ['https://127.0.0.1:5199/v1/numbers.json', 'https://localhost:8443/stats', 'https://[::1]:5199/numbers.json', 'https://192.168.1.20:3000/metrics.json'])
    assert.notEqual(refusedHost(new URL(url)), null, url);
  assert.equal(refusedHost(new URL('https://stats.northwind.example/v1/numbers.json')), null);
});
