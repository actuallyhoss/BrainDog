/**
 * What Settings > Billing says of a free record (DIRECTION §35): it is on Free, never "Not billed", and it is offered the
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
