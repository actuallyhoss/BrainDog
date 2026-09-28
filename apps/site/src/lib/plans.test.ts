/**
 * The plans the site prices, held to the code that sells them and the code that meters them.
 *
 * WHY THIS TEST (`loop/finish/contracts.md` C8). `plans.ts` is where the owner changes a price or an
 * allowance, and three other files act on the same figures: the checkout sells `HOSTED_PLANS` in
 * `apps/worker/src/billing.ts`, the Directory holds a record to `ALLOWANCE` in
 * `packages/record/src/directory.ts`, and Slash starts a record at `ASK_CAP_DEFAULT` in
 * `packages/slash/src/types.ts`. A figure moved in one and not the others is a page that promises
 * what the record does not do, so each check reads the other package's value and not a copy of it.
 *
 * THE SPECIFIERS ARE RUNTIME URLS, as `claims.test.ts`'s is: the site declares none of these packages,
 * and a written import of one would be an undeclared edge in the `graph` gate. Each file loads in plain
 * Node, as its own package's tests already load it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { site } from './copy.ts';
import { EXTRA, PLANS, type Allowance } from './plans.ts';

const REPO = new URL('../../../../', import.meta.url);

type Meters = { runs: number; requests: number; bytes: number; ms: number };

const { ALLOWANCE } = (await import(new URL('packages/record/src/directory.ts', REPO).href)) as {
  ALLOWANCE: { [plan: string]: Meters | null };
};
const { HOSTED_PLANS } = (await import(new URL('apps/worker/src/billing.ts', REPO).href)) as {
  HOSTED_PLANS: { [plan: string]: { name: string; price: string; directory: string } };
};
const { ASK_CAP_DEFAULT } = (await import(new URL('packages/slash/src/types.ts', REPO).href)) as { ASK_CAP_DEFAULT: number };

const HOUR_MS = 3_600_000;
const GB = 1_000_000_000;

test('the site prices exactly the plans the checkout sells, by the same name and price', () => {
  assert.deepEqual(
    PLANS.map((p) => p.id).sort(),
    Object.keys(HOSTED_PLANS).sort(),
    'plans.ts and HOSTED_PLANS in apps/worker/src/billing.ts name different plans',
  );
  for (const plan of PLANS) {
    const sold = HOSTED_PLANS[plan.id];
    assert.ok(sold, `billing.ts sells no ${plan.id}`);
    assert.equal(plan.name, sold.name, `plans.ts calls ${plan.id} "${plan.name}" and billing.ts "${sold.name}"`);
    /* THE CARD READS "$12" OVER "a month, per record"; the checkout's words are "$12 a month". */
    assert.ok(plan.unit.startsWith('a month'), `${plan.name}'s card says "${plan.unit}", and billing.ts charges by the month`);
    assert.equal(`${plan.price} a month`, sold.price, `plans.ts says ${plan.name} is ${plan.price} and billing.ts "${sold.price}"`);
  }
});

test("each plan's allowance is the one the Directory holds the record to", () => {
  for (const plan of PLANS) {
    const directory = HOSTED_PLANS[plan.id]?.directory ?? '';
    const held = ALLOWANCE[directory];
    assert.ok(held, `the Directory has no allowance for ${directory}, which billing.ts meters ${plan.name} under`);
    const a = plan.allowance;
    assert.equal(a.runs, held.runs, `${plan.name}: the site says ${a.runs} runs, the Directory holds ${held.runs}`);
    assert.equal(a.requests, held.requests, `${plan.name}: the site says ${a.requests} requests, the Directory holds ${held.requests}`);
    assert.equal(a.gb * GB, held.bytes, `${plan.name}: the site says ${a.gb} GB, the Directory holds ${held.bytes} bytes`);
    assert.equal(a.hours * HOUR_MS, held.ms, `${plan.name}: the site says ${a.hours} hours, the Directory holds ${held.ms} ms`);
  }
});

test("Cloud's Slash credits are the monthly ask limit a record starts with", () => {
  const cloud = PLANS.find((p) => p.id === 'cloud');
  assert.ok(cloud, 'plans.ts has no Cloud plan');
  assert.equal(cloud.allowance.credits, ASK_CAP_DEFAULT, `the site says ${cloud.allowance.credits} credits and packages/slash starts a record at ${ASK_CAP_DEFAULT}`);
});

test('Cloud Plus is five times the Cloud allowance, as its card says', () => {
  /* THE CARD'S FIRST LINE (`copy/pricing.ts`, `plans.plus.points`) is a claim about every figure, so
     every figure is checked: a Plus allowance raised on one meter alone makes the line false. */
  const cloud = PLANS.find((p) => p.id === 'cloud');
  const plus = PLANS.find((p) => p.id === 'plus');
  assert.ok(cloud && plus, 'plans.ts is missing Cloud or Cloud Plus');
  if (!site.pricing.plans.plus.points.some((line) => /five times/i.test(line))) return;
  for (const key of Object.keys(cloud.allowance) as (keyof Allowance)[]) {
    assert.equal(plus.allowance[key], cloud.allowance[key] * 5, `Cloud Plus has ${plus.allowance[key]} ${key}, not five times Cloud's ${cloud.allowance[key]}`);
  }
});

test('the allowance table has a row for every meter, and every extra-usage price extends one', () => {
  const cloud = PLANS.find((p) => p.id === 'cloud');
  assert.ok(cloud, 'plans.ts has no Cloud plan');
  const rows = site.pricing.usage.map((u) => u.key);
  assert.deepEqual([...rows].sort(), Object.keys(cloud.allowance).sort(), 'copy/pricing.ts usage leaves out a meter, or names one plans.ts has not');
  for (const e of EXTRA) assert.ok(rows.includes(e.key), `extra usage prices ${e.key}, which the allowance table does not show`);
});
