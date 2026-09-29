/**
 * The shell carries which host answered `boot`, when the host said, so a screen reads it rather than inferring it.
 *
 * WHY: Billing told a self-host from the Cloud by whether `/api/inbound/mint`
 * answered 404, because `boot` said nothing about the host. The record now copies `Build.host` into `boot`; this is
 * the half that carries it past `layoutOf`, which builds the shell key by key and drops anything it does not name.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { layoutOf } from './boot-live.ts';

const BOOT = { registers: [], now: '2026-09-15T12:00:00.000Z' };

test('the shell says the host `boot` named, and nothing for a host that did not name one', () => {
  assert.equal(layoutOf({ ...BOOT, host: 'self-host' }).host, 'self-host');
  assert.equal(layoutOf({ ...BOOT, host: 'cloud' }).host, 'cloud');
  /* ABSENT, NOT A GUESS. A host older than the field is left to the inference Billing made before it existed. */
  assert.ok(!('host' in layoutOf(BOOT)), 'a host that never said is not a host');
});
