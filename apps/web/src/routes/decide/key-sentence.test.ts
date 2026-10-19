/**
 * THE KEY SENTENCE ON DECIDE (SHL-A11): a proposed install that would send a key out says so as one line of what
 * accepting does, by the key's label and the host, the way the plan sheet says it before an install.
 *
 * The kernel's `doesOf` already writes the sentence from a plan's `calls_out` or a proposal's `egress`, and the plan
 * sheet reads it (`lib/market/plan.ts`). Decide's own list named a story, a preview or the entries a question changes
 * and never asked the kernel, so the same install read "Sends your key 'stripe' to api.stripe.com every hour." on the
 * sheet and nothing on the question that approves it. The screen is a Svelte file Node cannot load, so this holds the
 * sentence the screen is handed and reads the screen's own text for the call, the way `lists-wired.test.ts` does.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { doesOf } from '@braindog/kernel';

const screen = readFileSync(fileURLToPath(new URL('./Classic.svelte', import.meta.url)), 'utf8');

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

/** Decide's own `doesOf`, as the screen writes it: from its name to the `return out` that ends it. */
const local = (): string => {
  const from = screen.indexOf('function doesOf(q: Question)');
  assert.ok(from > 0, 'Classic.svelte no longer has its does list');
  return screen.slice(from, screen.indexOf('return out;', from));
};

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

test('The does list in Needs you asks the kernel for the sentence, from the question’s own body', () => {
  assert.ok(screen.includes("import { doesOf as sendsSaid } from '@braindog/kernel';"), 'the screen does not import the kernel’s doesOf');
  const body = local();
  assert.match(body, /aboutFor\(q\)/u, 'the does list never reads the question’s body');
  assert.match(body, /sendsSaid\('install', about\.body\)/u, 'the does list never asks the kernel what the install sends');
});

test('the sentence is one line of the list with the key icon, pushed only when there is one, for an install only', () => {
  const body = local();
  assert.match(body, /if \(sends\) out\.push\(\{ icon: 'key', text: sends \}\)/u);
  assert.match(body, /about\?\.kind === 'pack' && typeof about\.body\.install === 'string'/u, 'turning an add-on on or off arms nothing new and must say nothing');
  assert.equal(body.match(/sendsSaid\(/gu)?.length, 1, 'the sentence is said once');
});
