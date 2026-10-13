/**
 * What leaves with an add-on's calls, said on Decide's arranged sheet (audit 53, finding 8).
 *
 * The sheet drew its calls from the body's `approve` strings alone, which never say the key in the call's own line, so an
 * add-on that sends a key out had no sentence of what leaves. An arrangement files `calls_out` beside `approve` now
 * (`@braindog/record` `arrange.ts`), and the sheet reads it through the kernel's `doesOf('install', body)`, the one
 * sentence the queue's card says too.
 *
 * The add-ons are made up: "stripe" here is a key's label of this test's own.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { doesOf } from '@braindog/kernel';

import { arrangedOf, type Part } from './arranged.ts';

const BASE = {
  packs: { install: ['stripe'] },
  plan: [{ pack: 'stripe', version: '1.0.0', adds: ['register.payments'] }],
};
const HOURLY = { host: 'api.stripe.com', every: '1h', trigger: 'schedule', per_day: 0, grant: 'stripe', change: 'new' };
const LINE = "Sends your key 'stripe' to api.stripe.com every hour.";

type Calls = Extract<Part, { part: 'calls' }>;
const callsOf = (body: Record<string, unknown>): Calls | undefined =>
  arrangedOf('arrange', body)?.parts.find((p): p is Calls => p.part === 'calls');

test('a key sent to a host every hour is said in one sentence, the kernel\'s own', () => {
  const body = { ...BASE, approve: ['CALLS OUT api.stripe.com · every 1h · grant "stripe"'], calls_out: [HOURLY] };
  const part = callsOf(body);
  assert.ok(part, 'the sheet has a calls part');
  assert.deepEqual(part.sends, [LINE]);
  assert.equal(part.sends?.join(' '), doesOf('install', body));
});

test('a body that files no calls_out says no such sentence', () => {
  const part = callsOf({ ...BASE, approve: ['CALLS OUT hooks.example.org · when a rule runs it'] });
  assert.ok(part, 'the rule-fired call is still drawn');
  assert.equal(part.sends, undefined);
  /* AND NOTHING THAT CALLS OUT HAS NO CALLS PART AT ALL. */
  assert.equal(callsOf(BASE), undefined);
  assert.equal(callsOf({ ...BASE, calls_out: [] }), undefined);
});

test('an approve-only body reads as it did', () => {
  const approve = ['CALLS OUT api.stripe.com · every 1d · grant "Stripe"', 'CALLS OUT hooks.example.org · when a rule runs it · sends amount, status'];
  const out = arrangedOf('arrange', { ...BASE, approve });
  assert.deepEqual(
    out?.parts.filter((p) => p.part === 'starts' || p.part === 'calls'),
    [
      { part: 'starts', feeds: [{ host: 'api.stripe.com', detail: 'every day', every: 'every day', keys: ['Stripe'], to: {} }] },
      { part: 'calls', calls: [{ host: 'hooks.example.org', detail: 'when a rule runs it, sends amount, status', every: '', keys: [], to: {} }] },
    ],
  );
});

test('a call the sentence says is not drawn again from approve', () => {
  const ruled = { host: 'hooks.example.org', every: '', trigger: 'rule', per_day: 40, grant: 'stripe', change: 'new' };
  const part = callsOf({
    ...BASE,
    approve: ['CALLS OUT hooks.example.org · when a rule runs it · grant "stripe"', 'CALLS OUT other.example.org · when a rule runs it'],
    calls_out: [ruled, ruled],
  });
  assert.deepEqual(part?.sends, ["Sends your key 'stripe' to hooks.example.org when a rule runs it, up to 40 times a day."]);
  assert.deepEqual(part?.calls.map((c) => c.host), ['other.example.org']);
});

test('a call that is as it was, and one that cannot be read, say nothing', () => {
  assert.equal(callsOf({ ...BASE, calls_out: [{ ...HOURLY, change: 'same' }, 'api.stripe.com', null] }), undefined);
});

test('the sheet draws each sentence inside its calls section', () => {
  const svelte = readFileSync(new URL('./Arranged.svelte', import.meta.url), 'utf8');
  const at = svelte.indexOf("p.part === 'calls'");
  const section = svelte.slice(at, svelte.indexOf('</section>', at));
  assert.match(section, /#each p\.sends \?\? \[\] as line/u);
  assert.match(section, /class="arr-sends"/u);
});
