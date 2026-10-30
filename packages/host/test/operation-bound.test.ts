/**
 * An operation grant started for one request body is spent only on that body (`boundRequest`), on both hosts. It named
 * only its method, so a `token` grant minted whatever its holder sent.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { boundRequest, OTHER_REQUEST } from '../src/auth.ts';

const hex = async (text: string): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');

const post = (body: string) => new Request('https://brain.example/api/createToken', { method: 'POST', headers: { 'content-type': 'application/json' }, body });

test('THE BODY THE GRANT WAS STARTED FOR PASSES, AND STAYS READABLE; ANY OTHER IS REFUSED', async () => {
  const asked = JSON.stringify({ scope: 'read', label: 'laptop', days: 30 });
  const binds = await hex(asked);
  const same = post(asked);
  assert.equal(await boundRequest(same, binds), true);
  assert.equal(await same.text(), asked, 'checking the body used it up');
  assert.equal(await boundRequest(post(JSON.stringify({ scope: 'write', label: 'laptop', days: 365, reach: ['inbox'] })), binds), false);
  assert.equal(await boundRequest(post(`${asked} `), binds), false);
  assert.equal(OTHER_REQUEST.code, 'FORBIDDEN');
});

test('A GRANT STARTED WITHOUT A BODY IS HELD TO ITS METHOD ALONE, as before', async () => {
  assert.equal(await boundRequest(post('{"anything":true}'), null), true);
  assert.equal(await boundRequest(post('{"anything":true}'), undefined), true);
});
