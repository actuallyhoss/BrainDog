/**
 * The plans and what each includes, for the pricing page and the home page's teaser, read off the one table of plans.
 *
 * FREE LEADS (since 2 October): the $12 plan is not branded as the one to pick. The free tier is what is highlighted,
 * and the subscriptions are an extra for pros.
 * Free is drawn first and loudest everywhere; Cloud and Cloud Plus follow it, quieter, as the plans for pros.
 *
 * EVERY FIGURE IS `PLAN_TABLE`'S, `packages/record/src/plans.ts`: the price, the runs, requests, bytes and
 * script time, the Slash credits, the agents and the people. The cards below are made from `TABLE` and type no
 * figure of their own. `TABLE` is the table's three sold rows, whole, because the site does not declare
 * `@braindog/record` yet and a relative climb into it is the `graph` gate's "cross-package relative import". The day
 * `apps/site/package.json` names `"@braindog/record": "workspace:*"`, `TABLE` becomes
 * `import { PLAN_TABLE as TABLE } from '@braindog/record/plans'` and nothing else here changes. Until then
 * `plans.test.ts` holds every field of every row to `PLAN_TABLE` with `tableDiffers`, so a figure moved in either place
 * names the plan and the meter and goes red.
 *
 * THE DEFAULTS TAKEN FOR THE OWNER (his to change in `PLAN_TABLE` with a word): Cloud Plus is five times
 * Cloud on every figure; agents are 3 on Free, 15 on Cloud and 75 on Cloud Plus; no yearly price, so the site draws
 * none; the packs and extra usage chosen on 26 September stand.
 *
 * SLASH IS COUNTED IN CREDITS (since 26 September), because a price of $0.10 a Slash ask reads badly.
 * One question or draft is one credit, however much work it takes, and each plan includes a month of them.
 *
 * PACKS ARE SHOWN WITH BILLING ON, AND ONLY THEN. The checkout sells the table's two packs beside the plans
 * (`apps/worker/src/billing.ts`, in Stripe's test mode while billing is not live), so `PACKS` is `packsOnSale` of
 * `LAUNCH.billing`: the table's packs, each with its price, when the site says a card is charged, and none before. Billing
 * stays off or in test mode until the owner's word to charge, so today the site names no pack and says
 * they are coming later, and that word flips one line in `launch.ts`. Extra usage is still sold by no checkout: the site
 * says it is coming later either way. Nothing here charges a card.
 *
 * FIGURES ONLY. The sentences the pricing page says about them are in `copy/pricing.ts`; `unit` and `for` stay here
 * because the home page's teaser reads them beside the price.
 */

import { LAUNCH } from './launch.ts';
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
  /** Whether the plan takes people beyond the owner (the Plus gate on teams). */
  teams: boolean;
  /** The most every file attached in a record may come to, in bytes. No page draws it yet; `tableDiffers` holds it. */
  files: number | null;
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
    teams: false,
    files: GB,
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
    teams: false,
    files: 20 * GB,
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
    teams: true,
    files: 100 * GB,
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
  /** Where the button goes; `external` because it is the app's, on `app.brain.dog`. */
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
    for: 'For trying it with your first agents.',
    href: SIGNUP,
    external: true,
  },
  {
    id: 'cloud',
    ...card(TABLE.hosted),
    unit: 'a month, per record',
    for: 'For one person running several projects with several agents.',
    href: `${SIGNUP}?plan=cloud`,
    external: true,
  },
  {
    id: 'plus',
    ...card(TABLE.plus),
    unit: 'a month, per record',
    for: "For a small team and everyone's agents.",
    href: `${SIGNUP}?plan=plus`,
    external: true,
  },
];

/** The plans a person pays for, in the order they are offered after Free. */
export const PAID: readonly Plan[] = PLANS.filter((p) => p.id !== 'free');

/** Cents of `CURRENCY` as a person reads them, the table's `priceOf`: whole dollars bare ("$5"), else to the cent. */
export const priceOf = (cents: number): string =>
  cents % 100 === 0 ? `$${cents / 100}` : `$${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;

/** A pack of Slash credits as the site draws it: the table's `Pack`, with its price as a person reads it. */
export type Pack = { id: string; credits: number; cents: number; price: string };

/** The table's `PACKS`, every field: 100 credits for $5, 500 for $20, his of 26 September. `plans.test.ts` holds each. */
export const TABLE_PACKS: readonly Omit<Pack, 'price'>[] = [
  { id: 'credits-100', credits: 100, cents: 500 },
  { id: 'credits-500', credits: 500, cents: 2_000 },
];

/**
 * The packs the site shows for a word on billing: the table's, each with `priceOf` beside it, when billing is on, and
 * none when it is off, so no page names a pack a card cannot buy.
 */
export const packsOnSale = (billing: boolean): readonly Pack[] =>
  billing ? TABLE_PACKS.map((p) => ({ ...p, price: priceOf(p.cents) })) : [];

/** SLASH CREDIT PACKS ON SALE, by `LAUNCH.billing`: empty until billing is on. Every page that draws packs reads this. */
export const PACKS: readonly Pack[] = packsOnSale(LAUNCH.billing);

export const plan = (id: Plan['id']): Plan => PLANS.find((p) => p.id === id)!;
