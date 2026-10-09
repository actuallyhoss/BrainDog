/**
 * The plans and what each includes, for the pricing page and the home page's teaser, read off the one table of plans.
 *
 * FREE LEADS (DIRECTION §35, the owner on 2 October): "i dont like how it brands the $12 as the go to. instead i want
 * the product to have the free tier to be what's highlighted, and then the subscriptions as an extra thing for pros".
 * Free is drawn first and loudest everywhere; Cloud and Cloud Plus follow it, quieter, as the plans for pros.
 *
 * EVERY FIGURE IS `PLAN_TABLE`'S (LCH-A08), `packages/record/src/plans.ts`: the price, the runs, requests, bytes and
 * script time, the Slash credits, the agents and the people. The cards below are made from `TABLE` and type no
 * figure of their own. `TABLE` is the table's three sold rows, whole, because the site does not declare
 * `@braindog/record` yet and a relative climb into it is the `graph` gate's "cross-package relative import". The day
 * `apps/site/package.json` names `"@braindog/record": "workspace:*"`, `TABLE` becomes
 * `import { PLAN_TABLE as TABLE } from '@braindog/record/plans'` and nothing else here changes. Until then
 * `plans.test.ts` holds every field of every row to `PLAN_TABLE` with `tableDiffers`, so a figure moved in either place
 * names the plan and the meter and goes red.
 *
 * THE DEFAULTS TAKEN FOR THE OWNER (DIRECTION §42, his to change in `PLAN_TABLE` with a word): Cloud Plus is five times
 * Cloud on every figure; agents are 3 on Free, 15 on Cloud and 75 on Cloud Plus; no yearly price, so the site draws
 * none; the packs and extra usage he chose on 26 September stand.
 *
 * SLASH IS COUNTED IN CREDITS. The owner, 26 September: "$0.1 per slash ask sounds so bad. maybe use slash credits?"
 * One question or draft is one credit, however much work it takes, and each plan includes a month of them.
 *
 * NO PACKS AND NO EXTRA USAGE ON SALE, YET. Their figures are in the table, and no checkout sells either
 * (`apps/worker/src/billing.ts` sells the two plans and nothing else; LCH-A10 builds the packs). So the site says only
 * that they are coming later, and `PACKS` is empty until the checkout sells one. Billing stays off or in test mode
 * (DIRECTION §42): nothing here charges a card.
 *
 * FIGURES ONLY. The sentences the pricing page says about them are in `copy/pricing.ts`; `unit` and `for` stay here
 * because the home page's teaser reads them beside the price.
 */

import { SIGNUP } from './links.ts';

const HOUR_MS = 3_600_000;
const GB = 1_000_000_000;

/** One row of `PLAN_TABLE`, as `packages/record/src/plans.ts` types `PlanFigures`. */
type Meters = { runs: number; requests: number; bytes: number; ms: number };
type ExtraPrice = { cents: number; per: number };
type Row = {
  name: string;
  cents: { month: number; year: number | null };
  price: { month: string; year: string | null };
  allowance: Meters;
  credits: number;
  agents: number;
  people: number | null;
  extra: { runs: ExtraPrice; requests: ExtraPrice; bytes: ExtraPrice; ms: ExtraPrice } | null;
};

/** The currency every figure in cents is in, `CURRENCY` in the table. */
export const CURRENCY = 'USD' as const;

/** His figures of 26 September for usage past the allowance, the table's `EXTRA`. */
const EXTRA: NonNullable<Row['extra']> = {
  runs: { cents: 100, per: 5_000 },
  requests: { cents: 100, per: 50_000 },
  bytes: { cents: 50, per: GB },
  ms: { cents: 100, per: 10 * HOUR_MS },
};

/** `PLAN_TABLE`'s free, hosted and plus rows, every field. `plans.test.ts` refuses a field that differs. */
export const TABLE: { free: Row; hosted: Row; plus: Row } = {
  free: {
    name: 'Free',
    cents: { month: 0, year: null },
    price: { month: '$0', year: null },
    allowance: { runs: 1_000, requests: 10_000, bytes: 100_000_000, ms: 5 * HOUR_MS },
    credits: 20,
    agents: 3,
    people: 1,
    extra: null,
  },
  hosted: {
    name: 'Cloud',
    cents: { month: 1_200, year: null },
    price: { month: '$12', year: null },
    allowance: { runs: 15_000, requests: 150_000, bytes: GB, ms: 50 * HOUR_MS },
    credits: 80,
    agents: 15,
    people: null,
    extra: EXTRA,
  },
  plus: {
    name: 'Cloud Plus',
    cents: { month: 2_900, year: null },
    price: { month: '$29', year: null },
    allowance: { runs: 75_000, requests: 750_000, bytes: 5 * GB, ms: 250 * HOUR_MS },
    credits: 400,
    agents: 75,
    people: null,
    extra: EXTRA,
  },
};

export type Allowance = {
  /** Slash credits a month. One question or draft is one credit, however many passes it takes. */
  credits: number;
  /** Agents connected at once: how many agent keys a record may hold live. Not a monthly figure. */
  agents: number;
  /** Automation and script runs a month. */
  runs: number;
  /** Requests to other services a month: pulls, calls, webhooks out. */
  requests: number;
  /** Data fetched from other services a month, in gigabytes. */
  gb: number;
  /** Script time a month, in hours. */
  hours: number;
};

export type Plan = {
  id: 'free' | 'cloud' | 'plus';
  name: string;
  /** What it costs by the month, as it reads on the card ("$12"). No plan is sold by the year. */
  price: string;
  /** The same in whole cents of `CURRENCY`. */
  cents: number;
  unit: string;
  /** One sentence: who it is for. */
  for: string;
  /** Where the button goes; `external` because `/app` is the app's, served on this site's name. */
  href: string;
  external: boolean;
  /** What the plan includes each month, and the agents it connects at once. */
  allowance: Allowance;
};

/** A card's figures from its row of the table: the meters in the units a person reads, gigabytes and hours. */
const card = (row: Row): Pick<Plan, 'name' | 'price' | 'cents' | 'allowance'> => ({
  name: row.name,
  price: row.price.month,
  cents: row.cents.month,
  allowance: {
    credits: row.credits,
    agents: row.agents,
    runs: row.allowance.runs,
    requests: row.allowance.requests,
    gb: row.allowance.bytes / GB,
    hours: row.allowance.ms / HOUR_MS,
  },
});

export const PLANS: readonly Plan[] = [
  {
    id: 'free',
    ...card(TABLE.free),
    unit: 'no card needed',
    for: 'One record for one person, with the whole app.',
    href: SIGNUP,
    external: true,
  },
  {
    id: 'cloud',
    ...card(TABLE.hosted),
    unit: 'a month, per record',
    for: 'For a household or a small business that leans on Slash and automations.',
    href: `${SIGNUP}?plan=cloud`,
    external: true,
  },
  {
    id: 'plus',
    ...card(TABLE.plus),
    unit: 'a month, per record',
    for: 'For busy teams, or records with lots of agents and automations.',
    href: `${SIGNUP}?plan=plus`,
    external: true,
  },
];

/** The plans a person pays for, in the order they are offered after Free. */
export const PAID: readonly Plan[] = PLANS.filter((p) => p.id !== 'free');

/** A pack of Slash credits as the site draws it: the table's `Pack`, with its price as a person reads it. */
export type Pack = { credits: number; cents: number; price: string };

/**
 * SLASH CREDIT PACKS ON SALE. Empty: none is sold yet (the header says why), and every page that draws packs draws
 * nothing from an empty list. When the checkout sells one, it is the table's `PACKS` with `priceOf` beside each.
 */
export const PACKS: readonly Pack[] = [];

export const plan = (id: Plan['id']): Plan => PLANS.find((p) => p.id === id)!;
