/**
 * What Settings > Billing says of Slash credit packs and of a plan that is a gift: the credits a
 * record has left, a button a pack on sale with its credits and the Worker's price, the checkout asked for a pack and no
 * plan, the gift's line with nothing to manage at Stripe, and an answer from a host older than packs drawn as before.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  backFromCheckout, billingOf, managedAtStripe, packPage, packsOf, planLine, planShown, readBilling, stateLine, upgradeOf, words,
  type BillingAnswer,
} from './billing.ts';

const NOW = Date.UTC(2026, 9, 14);
const PACKS = [
  { id: 'credits-100', credits: 100, price: '$5' },
  { id: 'credits-500', credits: 500, price: '$20' },
];
const row = (over: Record<string, unknown> = {}) => ({ record: 'rec_1', slug: 'juniper', state: 'active', plan: 'cloud', price: '$12 a month', ...over });
const answer = (records: unknown[], extra: Record<string, unknown> = {}): BillingAnswer =>
  billingOf({ open: true, plans: [{ id: 'cloud', name: 'Cloud', price: '$12 a month' }], records, ...extra })!;

/** A fetch that answers one envelope and keeps what it was asked. */
function faked(value: unknown) {
  const asked: { url: string; body: unknown }[] = [];
  const io = async (url: string, init?: RequestInit) => {
    asked.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify({ ok: true, value }));
  };
  return { io, asked };
}

test('a record with packs on sale offers one button a pack, each with its credits and price', async () => {
  const { io } = faked({ open: true, plans: [], packs: PACKS, records: [row({ credits: 100 })] });
  const read = await readBilling(io);
  assert.ok(read.ok);
  const r = read.value.records[0]!;
  assert.equal(r.credits, 100);
  const shown = packsOf(r, read.value);
  assert.equal(shown.left, "Extra questions from packs: 100. They do not run out at the month's end.");
  assert.deepEqual(shown.buy.map((b) => b.label), ['100 questions, $5', '500 questions, $20']);
  assert.deepEqual(shown.buy.map((b) => b.said), ['Buy 100 more Slash questions, $5', 'Buy 500 more Slash questions, $20']);
  /* A free record is sold packs too: it needs no plan to buy credits. */
  assert.equal(packsOf({ ...r, plan: 'free', state: 'unbilled' }, read.value).buy.length, 2);
});

test('nothing is offered while the host sells no pack, or to a lapsed record', () => {
  assert.deepEqual(packsOf(answer([row()]).records[0]!, answer([row()])).buy, []);
  const off = answer([row()], { open: false, packs: [] });
  assert.deepEqual(packsOf(off.records[0]!, off).buy, []);
  /* The Worker sells packs with no plan price set, and `open` is the plans': its packs are still offered. */
  const packsOnly = answer([row({ plan: 'free', state: 'unbilled' })], { open: false, plans: [], packs: PACKS });
  assert.equal(packsOf(packsOnly.records[0]!, packsOnly).buy.length, 2);
  const lapsed = answer([row({ state: 'lapsed' })], { packs: PACKS });
  assert.deepEqual(packsOf(lapsed.records[0]!, lapsed).buy, []);
  /* A pack that is not one is left out: no credits, a share of a credit, or no price. */
  const odd = answer([row()], { packs: [{ id: 'a', credits: 0, price: '$1' }, { id: 'b', credits: 2.5, price: '$1' }, { id: 'c', credits: 10, price: '' }] });
  assert.deepEqual(odd.packs, []);
});

test('the credits left are said when there are some, and never as nought', () => {
  const none = answer([row({ credits: 0 })], { packs: PACKS });
  assert.equal(packsOf(none.records[0]!, none).left, null);
  const big = answer([row({ credits: 1500 })]);
  assert.equal(packsOf(big.records[0]!, big).left, 'Credits from packs: 1,500');
});

test('buying asks the checkout door for the record and the pack, and no plan, and goes only to an https page', async () => {
  const { io, asked } = faked({ url: 'https://checkout.stripe.com/c/pay_test_1' });
  assert.deepEqual(await packPage('rec_1', 'credits-100', io), { ok: true, value: 'https://checkout.stripe.com/c/pay_test_1' });
  assert.deepEqual(asked, [{ url: '/account/billing/checkout', body: { record: 'rec_1', pack: 'credits-100' } }]);
  const bad = await packPage('rec_1', 'credits-100', faked({ url: 'javascript:alert(1)' }).io);
  assert.equal(bad.ok, false);
});

test('a gift reads as a gift where the plan is, says no payment, and has nothing to manage at Stripe', () => {
  const given = answer([row({ gift: true, plan: 'plus', period_end: null }), row({ record: 'rec_2', slug: 'birch', state: 'comp' })], { packs: PACKS });
  const [plus, cloud] = given.records;
  assert.equal(planShown(plus!), 'Cloud Plus, a gift from BrainDog');
  assert.equal(planLine(cloud!), 'Cloud, a gift from BrainDog');
  assert.equal(cloud!.gift, true);
  assert.equal(stateLine(plus!, NOW), '');
  assert.equal(stateLine({ ...plus!, periodEnd: Date.UTC(2026, 11, 1) }, NOW), 'Given until 1 December.');
  assert.equal(managedAtStripe(plus!, given), false);
  /* A gift can still buy packs. */
  assert.equal(packsOf(plus!, given).buy.length, 2);
  /* A gift is offered no upgrade: the checkout refuses one. */
  assert.equal(upgradeOf({ ...cloud!, plan: 'free' }, given), null);
  /* A gift with no Stripe row is a gift, never "Not billed". */
  assert.equal(planShown({ ...plus!, state: 'unbilled' }), 'Cloud Plus, a gift from BrainDog');
});

test('an answer from a host older than packs draws as it did', () => {
  const old = answer([row({ period_end: Date.UTC(2026, 9, 24) })]);
  const r = old.records[0]!;
  assert.deepEqual(old.packs, []);
  assert.equal(r.credits, null);
  assert.equal(r.gift, false);
  assert.deepEqual(packsOf(r, old), { left: null, buy: [] });
  assert.equal(planShown(r), 'Cloud, $12 a month');
  assert.equal(stateLine(r, NOW), 'Paid through 24 October.');
  assert.equal(managedAtStripe(r, old), true);
});

test('the address Stripe sends a person back to is known, and no other', () => {
  assert.equal(backFromCheckout('#paid=cs_test_1'), true);
  assert.equal(backFromCheckout('#credits=cs_test_1'), true);
  assert.equal(backFromCheckout(''), false);
  assert.equal(backFromCheckout('#charts'), false);
});

test('the words a person reads carry no em dash and no id', () => {
  const said = [words.buyCredits, words.packButton(100, '$5'), words.packSaid(100, '$5'), words.creditsLeft(100), words.gift('Cloud'), words.giftUntil('1 December')];
  for (const s of said) assert.doesNotMatch(s, /—|credits-100|rec_/u);
});

test('THE BILLING ANSWER CARRIES TEAMS HELD, and the invite sentence is the record\'s own', async () => {
  const { TEAMS_HELD_SAID } = await import('@braindog/record/directory');
  const { copy } = await import('../../lib/copy.ts');
  assert.equal(copy.inviteHeld, TEAMS_HELD_SAID);
  assert.equal(answer([]).teamsHeld, false);
  assert.equal(answer([], { teams_held: true }).teamsHeld, true);
});
