/**
 * THE KEY SENTENCE ON DECIDE: a proposed install that would send a key out says so as one line of what
 * accepting does, by the key's label and the host, the way the plan sheet says it before an install.
 *
 * The kernel's `doesOf` already writes the sentence from a plan's `calls_out` or a proposal's `egress`, and the plan
 * sheet reads it (`lib/market/plan.ts`). Decide's own list named a story, a preview or the entries a question changes
 * and never asked the kernel, so the same install read "Sends your key 'stripe' to api.stripe.com every hour." on the
 * sheet and nothing on the question that approves it. The old queue's own list of what accepting does is gone with
 * it (24 October); the declared queue's lead says the record's `does`, and one question's page asks the kernel
 * (`[id]/arranged-sends.test.ts`). This holds the sentence itself.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { doesOf } from '@braindog/kernel';

/** One action an install would arm, as the plan's `calls_out` carries it. */
const call = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  ingest: 'ingest.stripe-charges',
  host: 'api.stripe.com',
  every: '1h',
  trigger: 'schedule',
  per_day: null,
  grant: 'stripe',
  line: 'CALLS OUT api.stripe.com · every 1h · grant "stripe"',
  change: 'new',
  ...over,
});

test('a pack install question whose body holds calls_out reads the key sentence, by label and host', () => {
  const said = doesOf('install', { install: 'stripe', calls_out: [call()] });
  assert.equal(said, "Sends your key 'stripe' to api.stripe.com every hour.");
});

test('the sentence names the key and the host and never the action’s id or the plan’s own line', () => {
  const said = doesOf('install', { install: 'stripe', calls_out: [call(), call({ ingest: 'ingest.stripe-payouts', host: 'files.stripe.com', every: '15m' })] });
  assert.ok(!said.includes('ingest.'), said);
  assert.ok(!said.includes('CALLS OUT'), said);
  assert.ok(!said.includes('grant'), said);
  assert.ok(said.includes('files.stripe.com every 15 minutes'), said);
});

test('a question that sends nothing adds no line: no calls, calls already approved, or a body with none', () => {
  assert.equal(doesOf('install', { install: 'notes' }), '');
  assert.equal(doesOf('install', { install: 'notes', calls_out: [] }), '');
  assert.equal(doesOf('install', { install: 'stripe', calls_out: [call({ change: 'same' })] }), '');
});
