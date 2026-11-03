/**
 * The one table of plans: every figure of every plan, written out once more here, so a figure moved in
 * `plans.ts` turns this red and says which plan and which figure, and so does a copy of the table with one figure
 * moved (the planted fault). The Directory's `ALLOWANCE` and `PLANS` and its Free sentences are held to the table too.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CURRENCY, PACKS, PLANS, PLAN_TABLE, priceOf, tableDiffers, type PlanFigures } from '../src/plans.ts';
import * as directory from '../src/directory.ts';

const HOUR = 3_600_000;
const GB = 1_000_000_000;
const EXTRA = { runs: { cents: 100, per: 5_000 }, requests: { cents: 100, per: 50_000 }, bytes: { cents: 50, per: GB }, ms: { cents: 100, per: 10 * HOUR } };

/** Every figure, as the price list sets them: Cloud Plus five times Cloud, agents 3, 15 and 75, no yearly price. */
const EXPECTED: Record<string, PlanFigures> = {
  free: {
    name: 'Free',
    cents: { month: 0, year: null },
    price: { month: '$0', year: null },
    allowance: { runs: 1_000, requests: 10_000, bytes: 100_000_000, ms: 5 * HOUR },
    credits: 20,
    agents: 3,
    people: 1,
    teams: false,
    files: GB,
    extra: null,
  },
  hosted: {
    name: 'Cloud',
    cents: { month: 1_200, year: null },
    price: { month: '$12', year: null },
    allowance: { runs: 15_000, requests: 150_000, bytes: GB, ms: 50 * HOUR },
    credits: 80,
    agents: 15,
    people: null,
    teams: false,
    files: 20 * GB,
    extra: EXTRA,
  },
  plus: {
    name: 'Cloud Plus',
    cents: { month: 2_900, year: null },
    price: { month: '$29', year: null },
    allowance: { runs: 75_000, requests: 750_000, bytes: 5 * GB, ms: 250 * HOUR },
    credits: 400,
    agents: 75,
    people: null,
    teams: true,
    files: 100 * GB,
    extra: EXTRA,
  },
  selfhost: {
    name: 'Self-host',
    cents: { month: 0, year: null },
    price: { month: '$0', year: null },
    allowance: null,
    credits: null,
    agents: null,
    people: null,
    teams: true,
    files: null,
    extra: null,
  },
};

test('every figure of every plan is the one written here', () => {
  assert.deepEqual([...PLANS], ['free', 'hosted', 'plus', 'selfhost']);
  assert.deepEqual(tableDiffers(EXPECTED), []);
  assert.deepEqual(PLAN_TABLE, EXPECTED);
  assert.equal(CURRENCY, 'USD');
});

test('a copy of the table with one figure moved fails, naming the plan and the meter', () => {
  const planted = structuredClone(EXPECTED);
  planted.plus!.allowance!.runs = 60_000;
  assert.deepEqual(tableDiffers(planted), ['plus.allowance.runs: is 60000, the table says 75000']);
  const agents = structuredClone(EXPECTED);
  agents.free!.agents = 4;
  assert.deepEqual(tableDiffers(agents), ['free.agents: is 4, the table says 3']);
  const { selfhost: _, ...short } = structuredClone(EXPECTED);
  assert.deepEqual(tableDiffers(short), ['selfhost: is missing']);
});

test('Cloud Plus is five times Cloud on every meter, credit and agent, at no yearly price', () => {
  const cloud = PLAN_TABLE.hosted;
  const plus = PLAN_TABLE.plus;
  for (const k of ['runs', 'requests', 'bytes', 'ms'] as const) assert.equal(plus.allowance![k], cloud.allowance![k] * 5, k);
  assert.equal(plus.credits, cloud.credits! * 5);
  assert.equal(plus.agents, cloud.agents! * 5);
  for (const plan of PLANS) assert.equal(PLAN_TABLE[plan].price.year, null, `${plan} has a yearly price`);
});

test('the packs are 100 credits for $5 and 500 for $20, in whole cents', () => {
  assert.deepEqual(PACKS, [
    { id: 'credits-100', credits: 100, cents: 500 },
    { id: 'credits-500', credits: 500, cents: 2_000 },
  ]);
  for (const p of PACKS) assert.ok(Number.isInteger(p.cents) && Number.isInteger(p.credits), p.id);
});

test('a price a person reads is made from its cents', () => {
  assert.equal(priceOf(0), '$0');
  assert.equal(priceOf(1_200), '$12');
  assert.equal(priceOf(1_250), '$12.50');
  assert.equal(priceOf(1_205), '$12.05');
  for (const plan of PLANS) assert.equal(PLAN_TABLE[plan].price.month, priceOf(PLAN_TABLE[plan].cents.month), plan);
});

test("the Directory's plans and allowance are the table's", () => {
  assert.equal(directory.PLANS, PLANS);
  assert.equal(directory.PLAN_TABLE, PLAN_TABLE);
  for (const plan of PLANS) assert.deepEqual(directory.ALLOWANCE[plan], PLAN_TABLE[plan].allowance, plan);
});

test("Free's sentences read the table's count of people and the plans' names", () => {
  assert.equal(
    directory.FREE_ONE_PERSON,
    'Teams are part of Cloud Plus, so nobody else can join this BrainDog yet. Move it to Cloud Plus in Settings to invite colleagues.',
  );
  assert.equal(
    directory.FREE_JOIN_REFUSED,
    'This BrainDog is not on Cloud Plus, so nobody else can join it yet. Ask its owner to move it to Cloud Plus, then open this link again.',
  );
});
