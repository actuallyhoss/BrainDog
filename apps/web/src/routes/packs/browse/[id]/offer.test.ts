/**
 * The install card's two sentences (`offer.ts`): which key an install sends to which host and how often, and the
 * parts the plan left out until the record holds a list (SHL-A11).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import type { SharedPlan } from '../../sharing.ts';
import { sendsOf, sheetWords, waitsOf, type Planned } from './offer.ts';

const call = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  ingest: 'ingest.stripe-charges',
  channel: 'pull',
  host: 'api.stripe.com',
  every: '1h',
  trigger: 'schedule',
  per_day: null,
  grant: 'stripe',
  line: 'CALLS OUT api.stripe.com · every 1h · grant "stripe"',
  change: 'new',
  ...over,
});

const planned = (diff: Record<string, unknown>): Planned => ({ kind: 'pack', doc: {}, diff, planHash: 'h', approve: [] });

const NAMES: Readonly<Record<string, string>> = { people: 'People', clients: 'Clients', fx: 'Rates', 'page.clients-board': 'Client board' };
const nameOf = (id: string): string => NAMES[id] ?? id;

test('the card says which key goes to which host and how often', () => {
  assert.deepEqual(sendsOf(planned({ calls_out: [call()] })), ["Sends your key 'stripe' to api.stripe.com every hour."]);
});

test('an action with no key names none, and one the record already runs is not said again', () => {
  const said = sendsOf(planned({ calls_out: [call({ grant: null, host: 'api.frankfurter.app', every: '1d' }), call({ change: 'same' })] }));
  assert.deepEqual(said, ['Calls api.frankfurter.app every day.']);
});

test('a plan that calls nothing says nothing', () => {
  assert.deepEqual(sendsOf(planned({ calls_out: [] })), []);
  assert.deepEqual(sendsOf(planned({})), []);
  assert.deepEqual(sendsOf({ kind: 'pack', doc: {}, diff: null, planHash: 'h', approve: [] }), []);
});

test('two actions that read the same are one sentence, and no id reaches the card', () => {
  const said = sendsOf(planned({ calls_out: [call(), call({ ingest: 'ingest.stripe-payouts' })] }));
  assert.equal(said.length, 1);
  assert.ok(!/ingest|CALLS OUT|grant/u.test(said.join(' ')));
});

test('a use case says what each of its packs sends, once', () => {
  const pack = { calls: [{ ingest: 'ingest.stripe-charges', channel: 'pull', host: 'api.stripe.com', every: '1h', key: 'stripe', sends: null }] };
  const rule = { calls: [{ ingest: 'ingest.notify', channel: 'call', host: 'hooks.example.com', every: '', key: null, sends: [], trigger: 'rule', perDay: 100 }] };
  const plan = { packs: [pack, pack, rule] } as unknown as SharedPlan;
  assert.deepEqual(sendsOf({ kind: 'usecase', plan }), ["Sends your key 'stripe' to api.stripe.com every hour.", 'Calls hooks.example.com when a rule runs it, up to 100 times a day.']);
});

test('what waits is said by name: the whole thing, or how many parts of it', () => {
  const diff = {
    waiting: [
      { at: 'register.clients.fields[2]', holds: ['people'] },
      { at: 'register.clients.fields[4]', holds: ['people'] },
      { at: 'page.clients-board', holds: ['people', 'rates'] },
      { at: 'register.clients.roles.rates', holds: ['fx'] },
    ],
  };
  assert.deepEqual(waitsOf(planned(diff), nameOf), ['2 parts of Clients wait until you have People.', 'Client board waits until you have People and exchange rates.', 'One part of Clients waits until you have Rates.']);
});

test('nothing waiting says nothing, and neither does a plan it cannot read', () => {
  assert.deepEqual(waitsOf(planned({ waiting: [] }), nameOf), []);
  assert.deepEqual(waitsOf(planned({}), nameOf), []);
  assert.deepEqual(waitsOf(planned({ waiting: [null, { at: 7 }, { at: 'register.clients', holds: [] }] }), nameOf), []);
  assert.deepEqual(waitsOf({ kind: 'usecase', plan: { packs: [] } as unknown as SharedPlan }, nameOf), []);
});

test('the install card draws what waits under the plan, and what it sends once, on the plan\'s own lines, in words with no dash in them', () => {
  const page = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
  assert.match(page, /extra=\{waits\.length > 0 \? told : undefined\}/u);
  /* WHAT IT SENDS IS SAID ONCE, by the plan sheet's calls group (`$lib/market/plan.ts` writes each line with `doesOf`). */
  assert.doesNotMatch(page, /\{#each sends as line/u);
  assert.match(page, /\{#each waits as line \(line\)\}/u);
  assert.match(readFileSync(new URL('../../../../lib/market/plan.ts', import.meta.url), 'utf8'), /doesOf\('install', \{ calls_out: \[/u);
  for (const word of Object.values(sheetWords)) assert.ok(!/[\u2013\u2014]/u.test(word), word);
});
