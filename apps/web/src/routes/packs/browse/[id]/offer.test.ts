/**
 * The install card's sentences of what waits (`offer.ts`): the parts the plan left out until the record holds a list
 * (SHL-A11). Which key an install sends to which host is the plan sheet's (`$lib/market/plan.ts`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import type { SharedPlan } from '../../sharing.ts';
import { sheetWords, waitsOf, type Planned } from './offer.ts';

const planned = (diff: Record<string, unknown>): Planned => ({ kind: 'pack', doc: {}, diff, planHash: 'h', approve: [] });

const NAMES: Readonly<Record<string, string>> = { people: 'People', clients: 'Clients', fx: 'Rates', 'page.clients-board': 'Client board' };
const nameOf = (id: string): string => NAMES[id] ?? id;

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
