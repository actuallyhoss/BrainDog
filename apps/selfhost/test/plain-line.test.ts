/**
 * A self-host with a server key and no certificate listens on every interface over plain http, so the key and the
 * sign-in cookie cross the network unencrypted. The start says so in one line, and only then.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { plainLine } from '../src/how.ts';

test('A KEY, NO CERTIFICATE, AN http ORIGIN AND A WIDE BIND IS SAID', () => {
  for (const listen of [undefined, '::', '0.0.0.0', '192.168.1.50'])
    assert.match(plainLine({ key: true, tls: false, listen, origin: 'http://localhost:8080' }) ?? '', /plain http on every interface/u, String(listen));
});

test('NOTHING IS SAID ON LOOPBACK, WITH TLS, BEHIND AN https PROXY, OR WITH NO KEY', () => {
  assert.equal(plainLine({ key: true, tls: false, listen: '127.0.0.1', origin: 'http://localhost:8080' }), null);
  assert.equal(plainLine({ key: true, tls: false, listen: '[::1]', origin: 'http://localhost:8080' }), null);
  assert.equal(plainLine({ key: true, tls: true, listen: undefined, origin: 'https://brain.home.arpa:8443' }), null);
  assert.equal(plainLine({ key: true, tls: false, listen: undefined, origin: 'https://studio.example' }), null);
  assert.equal(plainLine({ key: false, tls: false, listen: '0.0.0.0', origin: 'http://localhost:8080' }), null);
});

test('AI19: IN THE IMAGE THE LINE READS WHERE COMPOSE PUBLISHES, AND NEVER NAMES BRAINDOG_LISTEN', () => {
  const base = { key: true, tls: false, listen: undefined, origin: 'http://localhost:8080', image: true };
  assert.equal(plainLine({ ...base, publish: undefined }), null);
  assert.equal(plainLine({ ...base, publish: '127.0.0.1' }), null);
  const wide = plainLine({ ...base, publish: '0.0.0.0' }) ?? '';
  assert.match(wide, /BRAINDOG_PUBLISH/u);
  assert.doesNotMatch(wide, /BRAINDOG_LISTEN/u);
});
