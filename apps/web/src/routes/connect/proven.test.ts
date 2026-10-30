/**
 * The maker's mark on the consent screen is drawn only for an app whose metadata document was read from that maker's own
 * host. The name is the app's own choice: a registration here could call itself "Claude" and wear Claude's mark beside
 * "BrainDog checked".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { markFor } from './proven.ts';

test('A NAME ALONE WEARS NO MAKER’S MARK', () => {
  assert.equal(markFor({ client_name: 'Claude', source: { kind: 'dcr', host: 'claude.ai' } }), null);
  assert.equal(markFor({ client_name: 'Claude', source: null }), null);
  assert.equal(markFor({ client_name: 'Claude', source: { kind: 'cimd', host: 'evil.example' } }), null);
  assert.equal(markFor({ client_name: 'Claude', source: { kind: 'cimd', host: 'claude.ai.evil.example' } }), null);
  assert.equal(markFor({ client_name: 'ChatGPT', source: { kind: 'cimd', host: 'claude.ai' } }), null);
});

test('AN APP SERVED FROM ITS MAKER’S HOST WEARS THE MARK', () => {
  assert.equal(markFor({ client_name: 'Claude', source: { kind: 'cimd', host: 'claude.ai' } }), 'claude');
  assert.equal(markFor({ client_name: 'Claude Code', source: { kind: 'cimd', host: 'www.anthropic.com' } }), 'claude');
  assert.equal(markFor({ client_name: 'An app', source: { kind: 'cimd', host: 'claude.ai' } }), null);
});
