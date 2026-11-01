/**
 * What Settings > Billing says of a free record: it is on Free, never "Not billed", and it is offered the
 * first plan the host sells once, with the Worker's own price, and only while the host takes payment.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { copy } from '../../lib/copy.ts';
import { billingOf, paymentPage, planLine, planShown, upgradeOf, type BilledRecord } from './billing.ts';

const answer = (open: boolean, plans: unknown[] = [{ id: 'cloud', name: 'Cloud', price: '$12 a month' }, { id: 'plus', name: 'Cloud Plus', price: '$29 a month' }]) =>
  billingOf({ open, plans, records: [{ record: 'rec_1', slug: 'ada', state: 'unbilled', plan: 'free', price: '$0' }] })!;

test('a free record is named Free, and a record the operator made is still not billed', () => {
  const free = answer(true).records[0]!;
  assert.equal(planShown(free), copy.billingPlanFree);
  assert.equal(planLine(free), 'Free');
  const made: BilledRecord = { ...free, plan: 'cloud', price: '$12 a month' };
  assert.equal(planShown(made), copy.billingNotBilled);
  assert.equal(planShown({ ...made, state: 'active' }), 'Cloud, $12 a month');
});

test('a free record is offered the first plan the host sells, with its price, and nothing while payment is closed', () => {
  const open = answer(true);
  const offer = upgradeOf(open.records[0]!, open);
  assert.equal(offer?.plan.id, 'cloud');
  assert.match(offer?.line ?? '', /Cloud is \$12 a month\.$/);
  assert.equal(offer?.also?.id, 'plus');
  assert.equal(copy.billingUpgrade('Cloud'), 'Upgrade to Cloud');
  assert.equal(upgradeOf(answer(false).records[0]!, answer(false)), null);
  assert.equal(upgradeOf(answer(true, []).records[0]!, answer(true, [])), null);
  /* A paid record is offered nothing here: its plan changes on Stripe's own page. */
  assert.equal(upgradeOf({ ...open.records[0]!, plan: 'cloud', state: 'active' }, open), null);
});

test('the upgrade asks checkout for the record on the plan, and paying again names no plan', async () => {
  const bodies: unknown[] = [];
  const io = async (_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ ok: true, value: { url: 'https://checkout.stripe.com/c/pay_1' } }));
  };
  assert.deepEqual(await paymentPage('checkout', 'rec_1', io, 'cloud'), { ok: true, value: 'https://checkout.stripe.com/c/pay_1' });
  await paymentPage('checkout', 'rec_1', io);
  assert.deepEqual(bodies, [{ record: 'rec_1', plan: 'cloud' }, { record: 'rec_1' }]);
});

test('the offer says what the next plan holds in the figures the site sells, and a full meter is said in red', async () => {
  const { limitBars, moreOf } = await import('./billing.ts');
  const limited = billingOf({
    open: true,
    plans: [{ id: 'cloud', name: 'Cloud', price: '$12 a month', limits: { questions: 80, tools: 15, people: null, runs: 15000, teams: false } }],
    records: [{ record: 'rec_1', slug: 'ada', state: 'unbilled', plan: 'free', price: '$0', limits: { questions: 20, tools: 3, people: 1, runs: 1000, teams: false } }],
  })!;
  assert.equal(moreOf(limited.plans[0]!.limits), '80 Slash questions a month and 15 AI tools');
  const bars = limitBars({ limits: limited.records[0]!.limits, questions: 20, tools: 1, meters: [], resets: '1 December' });
  assert.equal(bars.bars[0]!.label, 'Slash questions · 20 of 20');
  assert.equal(bars.bars[0]!.tone, 'danger');
  assert.equal(bars.bars[1]!.label, 'AI tools connected · 1 of 3');
  assert.match(bars.full[0]!, /1 December/);
});
