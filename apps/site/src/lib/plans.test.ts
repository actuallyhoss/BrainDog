/**
 * The plans the site prices, held to the code that sells them and the code that meters them.
 *
 * WHY THIS TEST. Every figure of a plan is `PLAN_TABLE`'s (`packages/record/src/plans.ts`, LCH-A08), and `plans.ts`
 * holds its three sold rows as `TABLE` until the site declares `@braindog/record`. The first check is every field of
 * every row against the table, with a planted fault beside it so the comparison is seen to fail. Three other files
 * act on the same figures: the checkout sells `HOSTED_PLANS` and makes Free as
 * `FREE_PLAN` in `apps/worker/src/billing.ts`, the Directory holds a record to `ALLOWANCE` in
 * `packages/record/src/directory.ts`, and Slash starts a record at `ASK_CAP_DEFAULT` (Free's at `ASK_CAP_FREE`) in
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
import { home } from './copy/home.ts';
import { LAUNCH } from './launch.ts';
import { PACKS, PAID, PLANS, TABLE, TABLE_PACKS, packsOnSale, priceOf, type Allowance } from './plans.ts';

const REPO = new URL('../../../../', import.meta.url);

type Meters = { runs: number; requests: number; bytes: number; ms: number };

const { ALLOWANCE } = (await import(new URL('packages/record/src/directory.ts', REPO).href)) as {
  ALLOWANCE: { [plan: string]: Meters | null };
};
const { HOSTED_PLANS, FREE_PLAN, PACK_SETTINGS, planName, planPrice } = (await import(new URL('apps/worker/src/billing.ts', REPO).href)) as {
  HOSTED_PLANS: { [plan: string]: { id: string; directory: string } };
  PACK_SETTINGS: { [pack: string]: string };
  FREE_PLAN: { id: string; directory: string };
  planName: (plan: string) => string;
  planPrice: (plan: string) => string;
};
const { ASK_CAP_DEFAULT, ASK_CAP_FREE } = (await import(new URL('packages/slash/src/types.ts', REPO).href)) as {
  ASK_CAP_DEFAULT: number;
  ASK_CAP_FREE: number;
};

const { PLAN_TABLE, PACKS: TABLE_PACKS_HELD, priceOf: tablePriceOf, tableDiffers } = (await import(new URL('packages/record/src/plans.ts', REPO).href)) as {
  PLAN_TABLE: { [plan: string]: { agents: number | null; credits: number | null } };
  PACKS: readonly { id: string; credits: number; cents: number }[];
  priceOf: (cents: number) => string;
  tableDiffers: (copy: Readonly<Record<string, unknown>>, table?: Readonly<Record<string, unknown>>) => string[];
};

/** The table's rows the site sells or gives away: a self-host is no card on the pricing page. */
const sold = { free: PLAN_TABLE.free, hosted: PLAN_TABLE.hosted, plus: PLAN_TABLE.plus };

const HOUR_MS = 3_600_000;
const GB = 1_000_000_000;

/** The Directory plan each of the site's plans is metered under, from billing.ts. */
const meteredAs = (id: string): string => (id === 'free' ? FREE_PLAN.directory : (HOSTED_PLANS[id]?.directory ?? ''));

test("every field of every plan the site draws is PLAN_TABLE's", () => {
  assert.deepEqual(tableDiffers(TABLE, sold), [], 'apps/site/src/lib/plans.ts says a figure packages/record/src/plans.ts does not');
});

test('a figure moved in the site\'s copy of the table fails, naming the plan and the meter', () => {
  /* THE PLANTED FAULT: the roadmap's old 60,000 runs on Cloud Plus, the very figure LCH-A08 found in two places. */
  const moved = structuredClone(TABLE);
  moved.plus.allowance.runs = 60_000;
  assert.deepEqual(tableDiffers(moved, sold), ['plus.allowance.runs: is 60000, the table says 75000']);
  const agents = structuredClone(TABLE);
  agents.free.agents = 4;
  assert.deepEqual(tableDiffers(agents, sold), ['free.agents: is 4, the table says 3']);
});

test("each card's agents and credits are its row's in PLAN_TABLE", () => {
  const row = { free: 'free', cloud: 'hosted', plus: 'plus' } as const;
  for (const plan of PLANS) {
    const held = PLAN_TABLE[row[plan.id]]!;
    assert.equal(plan.allowance.agents, held.agents, `${plan.name}: the site says ${plan.allowance.agents} agents, the table holds ${held.agents}`);
    assert.equal(plan.allowance.credits, held.credits, `${plan.name}: the site says ${plan.allowance.credits} credits, the table holds ${held.credits}`);
    const line = site.pricing.plans[plan.id].points.find((p) => /agents/.test(p));
    assert.ok(line?.includes(String(held.agents)), `${plan.name}'s card says no "${held.agents} agents" line`);
  }
});

test('Free is the first plan, and the site sells nothing for it', () => {
  assert.equal(PLANS[0]?.id, 'free', 'plans.ts draws a paid plan before Free, and Free leads (DIRECTION §35)');
  const free = PLANS[0]!;
  assert.equal(free.name, planName('free'), `plans.ts calls Free "${free.name}" and billing.ts "${planName('free')}"`);
  assert.equal(free.price, planPrice('free'), `plans.ts says Free is ${free.price} and billing.ts "${planPrice('free')}"`);
  assert.ok(!('free' in HOSTED_PLANS), 'billing.ts sells Free at checkout');
});

test('the site prices exactly the plans the checkout sells, by the same name and price', () => {
  assert.deepEqual(
    PAID.map((p) => p.id).sort(),
    Object.keys(HOSTED_PLANS).sort(),
    'plans.ts and HOSTED_PLANS in apps/worker/src/billing.ts name different paid plans',
  );
  for (const plan of PAID) {
    const sold = HOSTED_PLANS[plan.id];
    assert.ok(sold, `billing.ts sells no ${plan.id}`);
    assert.equal(plan.name, planName(plan.id), `plans.ts calls ${plan.id} "${plan.name}" and billing.ts "${planName(plan.id)}"`);
    /* THE CARD READS "$12" OVER "a month, per record"; the checkout's words are "$12 a month". */
    assert.ok(plan.unit.startsWith('a month'), `${plan.name}'s card says "${plan.unit}", and billing.ts charges by the month`);
    assert.equal(`${plan.price} a month`, planPrice(plan.id), `plans.ts says ${plan.name} is ${plan.price} and billing.ts "${planPrice(plan.id)}"`);
  }
});

test("each plan's allowance is the one the Directory holds the record to", () => {
  for (const plan of PLANS) {
    const directory = meteredAs(plan.id);
    const held = ALLOWANCE[directory];
    assert.ok(held, `the Directory has no allowance for ${directory}, which billing.ts meters ${plan.name} under`);
    const a = plan.allowance;
    assert.equal(a.runs, held.runs, `${plan.name}: the site says ${a.runs} runs, the Directory holds ${held.runs}`);
    assert.equal(a.requests, held.requests, `${plan.name}: the site says ${a.requests} requests, the Directory holds ${held.requests}`);
    assert.equal(Math.round(a.gb * GB), held.bytes, `${plan.name}: the site says ${a.gb} GB, the Directory holds ${held.bytes} bytes`);
    assert.equal(a.hours * HOUR_MS, held.ms, `${plan.name}: the site says ${a.hours} hours, the Directory holds ${held.ms} ms`);
  }
});

test("Cloud's and Free's Slash credits are the monthly ask limits Slash names for them", () => {
  const cloud = PLANS.find((p) => p.id === 'cloud');
  const free = PLANS.find((p) => p.id === 'free');
  assert.ok(cloud && free, 'plans.ts has no Cloud or no Free');
  assert.equal(cloud.allowance.credits, ASK_CAP_DEFAULT, `the site says ${cloud.allowance.credits} credits and packages/slash starts a record at ${ASK_CAP_DEFAULT}`);
  assert.equal(free.allowance.credits, ASK_CAP_FREE, `the site says Free has ${free.allowance.credits} credits and packages/slash names ${ASK_CAP_FREE}`);
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

test('the allowance table has a row for every meter', () => {
  const rows = site.pricing.usage.map((u) => u.key);
  for (const plan of PLANS)
    assert.deepEqual([...rows].sort(), Object.keys(plan.allowance).sort(), `copy/pricing.ts usage leaves out a meter of ${plan.name}, or names one plans.ts has not`);
});

test("with billing on, every pack the site shows is the table's, at its price, and one the checkout sells", () => {
  /* EVERY FIELD OF THE SITE'S COPY OF THE TABLE'S PACKS, as `TABLE` is held above: an id, credits or cents moved names itself. */
  assert.deepEqual(TABLE_PACKS, TABLE_PACKS_HELD, 'apps/site/src/lib/plans.ts holds packs packages/record/src/plans.ts does not');
  const shown = packsOnSale(true);
  assert.deepEqual(
    shown,
    TABLE_PACKS_HELD.map((p) => ({ ...p, price: tablePriceOf(p.cents) })),
    'with billing on the site shows a pack, or a price, the table does not hold',
  );
  for (const pack of shown) {
    assert.equal(priceOf(pack.cents), tablePriceOf(pack.cents), `the site reads ${pack.cents} cents as ${priceOf(pack.cents)}, the table as ${tablePriceOf(pack.cents)}`);
    assert.ok(pack.id in PACK_SETTINGS, `the site shows ${pack.id}, and apps/worker/src/billing.ts sells no such pack`);
  }
  /* THE PLANTED FAULT: a pack at a price of its own is seen to differ. */
  const moved = shown.map((p, i) => (i === 0 ? { ...p, cents: 400, price: '$4' } : p));
  assert.notDeepEqual(moved, TABLE_PACKS_HELD.map((p) => ({ ...p, price: tablePriceOf(p.cents) })));
  /* The packs' sentences name each pack at its price. */
  assert.equal(site.slash.allowance.packsUnit(shown), 'credits for $5, or 500 for $20, and they do not end with the month');
  assert.doesNotMatch(site.pricing.laterFor(shown), /credit packs .*coming later/i, 'with packs on sale the pricing page says they are coming later');
});

test('with billing off, no pack is shown and no sentence names one', () => {
  assert.deepEqual(packsOnSale(false), [], 'with billing off the site shows a credit pack no card can buy');
  assert.deepEqual(PACKS, packsOnSale(LAUNCH.billing), 'PACKS is not the packs on sale for LAUNCH.billing');
  if (!LAUNCH.billing) assert.equal(PACKS.length, 0, 'billing is off and plans.ts puts a credit pack on sale');
  const off = [site.slash.allowance.packsUnit(packsOnSale(false)), site.pricing.laterFor(packsOnSale(false))];
  for (const line of off) assert.doesNotMatch(line, /\$\d|\bcredits for\b|never expire|do not end with the month/i, `"${line}" names a pack while none is sold`);
  assert.match(off[1]!, /Credit packs and extra usage are coming later/, 'with billing off the pricing page does not say packs are coming later');
  /* What the pages draw today is the off state while billing is off. */
  if (!LAUNCH.billing) assert.deepEqual([site.slash.allowance.packsUnit(), site.pricing.later], off);
});

test('nothing promises what the checkout does not sell: no billed extra usage, and no $12 headline', () => {
  /* EXTRA USAGE IS NOT BUILT (`mayRun` holds a record at its allowance); packs are held by the two tests above. */
  const said = JSON.stringify({
    pricing: site.pricing,
    home: home.home.plans,
    slash: [site.slash.allowance.lead, site.slash.allowance.packsUnit(PACKS), site.slash.drawn.creditsReading('five')],
  });
  assert.doesNotMatch(said, /never charged past|charge for usage past|top up with a pack/i, 'the pricing copy still sells extra usage');
  for (const head of [site.pricing.title, site.pricing.sub, home.home.plans.title])
    assert.doesNotMatch(head, /\$\d/, `"${head}" is a headline with a price in it, and Free leads`);
});
