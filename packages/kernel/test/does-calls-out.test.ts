/**
 * THE KEY SENTENCE (SHL-A11): what an install sends out, said by key label and host, from the plan's `calls_out`.
 *
 * The plan already carries every action that would leave the record (`@braindog/declare`'s `Diff.calls_out`). The
 * approval read `CALLS OUT api.stripe.com · every 1h · grant "stripe"`, which is the diff's line, not a sentence.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { doesOf } from '../src/does.ts';

const call = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  ingest: 'ingest.stripe-charges',
  channel: 'pull',
  method: 'GET',
  host: 'api.stripe.com',
  every: '1h',
  trigger: 'schedule',
  per_day: null,
  grant: 'stripe',
  paged: true,
  sends: [],
  project: null,
  line: 'CALLS OUT api.stripe.com · every 1h · grant "stripe"',
  key_line: null,
  change: 'new',
  ...over,
});

test('a new action names the key by its label, the host and how often', () => {
  assert.equal(doesOf('install', { calls_out: [call()] }), "Sends your key 'stripe' to api.stripe.com every hour.");
  assert.equal(doesOf('install', { calls_out: [call({ every: '15m' })] }), "Sends your key 'stripe' to api.stripe.com every 15 minutes.");
  assert.equal(doesOf('install', { calls_out: [call({ every: '1d', change: 'changed' })] }), "Sends your key 'stripe' to api.stripe.com every day.");
});

test('a plan with no new action says nothing extra', () => {
  assert.equal(doesOf('install', { calls_out: [] }), '');
  assert.equal(doesOf('install', {}), '');
  assert.equal(doesOf('install', { calls_out: [call({ change: 'same' })] }), '');
  assert.equal(doesOf('pack', { install: 'money' }), 'Adds Money.');
  assert.equal(doesOf('pack', { install: 'money', calls_out: [call({ change: 'same' })] }), 'Adds Money.');
});

test('an action with no key names no key', () => {
  const said = doesOf('install', { calls_out: [call({ grant: null, host: 'api.frankfurter.app', every: '6h' })] });
  assert.equal(said, 'Calls api.frankfurter.app every 6 hours.');
  assert.ok(!said.includes('key'));
});

test('a call a rule runs says its ceiling for a day', () => {
  assert.equal(doesOf('install', { calls_out: [call({ every: '', trigger: 'rule', per_day: 100 })] }), "Sends your key 'stripe' to api.stripe.com when a rule runs it, up to 100 times a day.");
  assert.equal(
    doesOf('install', { calls_out: [call({ trigger: 'both', per_day: 40 })] }),
    "Sends your key 'stripe' to api.stripe.com every hour, and up to 40 times a day when a rule runs it.",
  );
});

test('every action is said once, with no id in any of it', () => {
  const said = doesOf('install', { calls_out: [call(), call({ ingest: 'ingest.stripe-payouts' }), call({ ingest: 'ingest.rates', grant: null, host: 'api.frankfurter.app', every: '1d' })] });
  assert.equal(said, "Sends your key 'stripe' to api.stripe.com every hour. Calls api.frankfurter.app every day.");
  assert.ok(!/ingest|CALLS OUT|grant/u.test(said));
});

test('a script that sends two keys names both, and a host nobody declared is said so', () => {
  assert.equal(doesOf('install', { calls_out: [call({ channel: 'script', grant: 'stripe, wise' })] }), "Sends your keys 'stripe' and 'wise' to api.stripe.com every hour.");
  assert.equal(doesOf('install', { calls_out: [call({ host: null })] }), "Sends your key 'stripe' to an address it does not name every hour.");
});

test('a question that installs an add-on says what it sends after what it adds', () => {
  const names = { pack: (id: string) => (id === 'stripe' ? 'Stripe' : null) };
  assert.equal(doesOf('pack', { install: 'stripe', calls_out: [call()] }, names), "Adds Stripe. Sends your key 'stripe' to api.stripe.com every hour.");
  /* A proposal carries the same thing as `egress`, with the label under `key` and no `change` (`actions.ts` `Egress`). */
  assert.equal(doesOf('pack', { install: 'stripe', egress: [{ host: 'api.stripe.com', every: '1h', trigger: 'schedule', per_day: null, key: 'stripe' }] }, names), "Adds Stripe. Sends your key 'stripe' to api.stripe.com every hour.");
});

test('a body it cannot read says nothing rather than something wrong', () => {
  assert.equal(doesOf('install', { calls_out: 'api.stripe.com' }), '');
  assert.equal(doesOf('install', { calls_out: [null, 7, 'x'] }), '');
  assert.equal(doesOf('install', null), '');
});
