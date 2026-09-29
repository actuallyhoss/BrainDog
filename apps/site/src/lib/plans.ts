/**
 * The plans and what each includes, in one place, for the pricing page and the home page's teaser.
 *
 * THE OWNER'S CALL, MADE ON 26 SEPTEMBER: a second hosted plan beside the first, and extra usage
 * priced per unit. That reverses the earlier default of one plan and no charge past it. Cloud's
 * allowances are that plan's (15,000 runs, 150,000 requests, 1 GB fetched, 50
 * hours, 80 Slash asks). Cloud Plus's and every extra-usage price are the lead's proposal on the same
 * day, and are his to change here: every figure the site shows about a plan is read from this file.
 *
 * SLASH IS COUNTED IN CREDITS, AND MORE OF IT IS BOUGHT IN PACKS, NOT BY THE ASK. The owner, the same
 * day: "$0.1 per slash ask sounds so bad. maybe use slash credits?" One question or draft is one credit,
 * however much work it takes (the rule for an ask, under a friendlier name); each plan
 * includes a month of them, and a pack adds more, used once the month's are gone and kept until spent.
 * A credit costs at most about $0.04 of model time (a record's ceiling is 300,000 neurons a month, about
 * $3.30, against 80 credits and the background work), so a pack at $0.05 or $0.04 a
 * credit holds its margin even at that worst case, which few questions reach.
 *
 * Runs, requests, bytes and hours are the Worker's metered units; each is priced at several times
 * Cloudflare's own rate so a busy record never costs more to run than it pays.
 *
 * HELD TO THE CODE THAT CHARGES AND METERS, by `plans.test.ts`: each
 * plan's name and price to `HOSTED_PLANS` in `apps/worker/src/billing.ts`, what the checkout sells;
 * its runs, requests, gigabytes and hours to the Directory's `ALLOWANCE` in
 * `packages/record/src/directory.ts`, what the Worker holds a record to; Cloud's credits to
 * `ASK_CAP_DEFAULT` in `packages/slash/src/types.ts`. A figure changed here and not there turns that
 * test red, so the page never promises what the record does not do.
 *
 * FIGURES ONLY. The sentences the pricing page says about them are in `copy/pricing.ts`; `name`, `unit`
 * and `for` stay here because the home page's teaser reads them beside the price.
 */

import { SIGNUP } from './copy.ts';

export type Allowance = {
  /** Slash credits a month. One question or draft is one credit, however many passes it takes. */
  credits: number;
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
  id: 'cloud' | 'plus';
  name: string;
  /** What it costs, as it reads on the card. */
  price: string;
  unit: string;
  /** One sentence: who it is for. */
  for: string;
  /** Where the button goes; `external` because `/app` is the app's, served on this site's name. */
  href: string;
  external: boolean;
  /** What the plan includes each month. */
  allowance: Allowance;
};

export const PLANS: readonly Plan[] = [
  {
    id: 'cloud',
    name: 'Cloud',
    price: '$12',
    unit: 'a month, per record',
    for: 'For a person, a household or a small business.',
    href: SIGNUP,
    external: true,
    allowance: { credits: 80, runs: 15_000, requests: 150_000, gb: 1, hours: 50 },
  },
  {
    id: 'plus',
    name: 'Cloud Plus',
    price: '$29',
    unit: 'a month, per record',
    for: 'For busy teams, or records with lots of agents and automations.',
    href: `${SIGNUP}?plan=plus`,
    external: true,
    allowance: { credits: 400, runs: 75_000, requests: 750_000, gb: 5, hours: 250 },
  },
];

/**
 * EXTRA USAGE, OFF UNTIL THE OWNER TURNS IT ON, under a monthly cap they set. Without it, work that
 * needs more than the plan waits for the next month, which is item 2's behaviour and stays the default.
 *
 * Each row is keyed by the allowance it extends, so its name is the allowance table's and cannot drift
 * from it. Slash has none: more of it is bought as a pack, below.
 */
export const EXTRA: readonly { key: Exclude<keyof Allowance, 'credits'>; price: string; per: string }[] = [
  { key: 'runs', price: '$1', per: 'per 5,000 runs' },
  { key: 'requests', price: '$1', per: 'per 50,000 requests' },
  { key: 'gb', price: '$0.50', per: 'per GB' },
  { key: 'hours', price: '$1', per: 'per 10 hours' },
];

/**
 * SLASH CREDIT PACKS, bought when the month's credits are not enough. A pack's credits are spent after the
 * plan's, and are kept until they are used.
 */
export const PACKS: readonly { credits: number; price: string }[] = [
  { credits: 100, price: '$5' },
  { credits: 500, price: '$20' },
];

export const plan = (id: Plan['id']): Plan => PLANS.find((p) => p.id === id)!;
