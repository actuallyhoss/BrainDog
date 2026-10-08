/**
 * The plans and what each includes, in one place, for the pricing page and the home page's teaser.
 *
 * FREE LEADS (DIRECTION §35, the owner on 2 October): "i dont like how it brands the $12 as the go to. instead i want
 * the product to have the free tier to be what's highlighted, and then the subscriptions as an extra thing for pros".
 * Free is drawn first and loudest everywhere; Cloud and Cloud Plus follow it, quieter, as the plans for pros.
 *
 * FREE'S FIGURES ARE THE DEFAULT TAKEN FOR HIM on 2 October, his to change here: one record, one person, the full app,
 * 20 Slash credits, 1,000 runs, 10,000 requests, 0.1 GB fetched and 5 hours of script time a month. Cloud's
 * are the owner's call of 26 September (15,000 runs, 150,000 requests, 1 GB fetched, 50 hours, 80 Slash credits), and
 * Cloud Plus's the lead's proposal the same day.
 *
 * SLASH IS COUNTED IN CREDITS. The owner, 26 September: "$0.1 per slash ask sounds so bad. maybe use slash credits?"
 * One question or draft is one credit, however much work it takes (the rule for an ask, under a friendlier name), and
 * each plan includes a month of them.
 *
 * NO PACKS AND NO EXTRA USAGE, YET. He chose both on 26 September (packs of 100 credits for $5 and 500 for $20; extra
 * usage at $1 per 5,000 runs, $1 per 50,000 requests, $0.50 per GB and $1 per 10 hours, under a cap he sets), and
 * neither is built: `apps/worker/src/billing.ts` sells the two plans and nothing else, and `mayRun` in
 * `packages/record/src/directory.ts` holds a record at its allowance until the month turns. So the site says only that
 * they are coming later, and `PACKS` is empty until the checkout sells one.
 *
 * HELD TO THE CODE THAT CHARGES AND METERS, by `plans.test.ts`: each plan's name and price to `PLAN_TABLE` in
 * `packages/record/src/plans.ts` (`@braindog/record/plans`), read through `planName`/`planPrice` in
 * `apps/worker/src/billing.ts`, whose `HOSTED_PLANS` are what the checkout sells and `FREE_PLAN` what it sells nothing as;
 * every plan's runs, requests, gigabytes and hours to the Directory's `ALLOWANCE` in
 * `packages/record/src/directory.ts`, what the Worker holds a record to; Cloud's credits to `ASK_CAP_DEFAULT` and
 * Free's to `ASK_CAP_FREE` in `packages/slash/src/types.ts`. A figure changed here and not there turns that test red,
 * so the page never promises what the record does not do.
 *
 * FIGURES ONLY. The sentences the pricing page says about them are in `copy/pricing.ts`; `name`, `unit` and `for`
 * stay here because the home page's teaser reads them beside the price.
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
  id: 'free' | 'cloud' | 'plus';
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
    id: 'free',
    name: 'Free',
    price: '$0',
    unit: 'no card needed',
    for: 'One record for one person, with the whole app.',
    href: SIGNUP,
    external: true,
    allowance: { credits: 20, runs: 1_000, requests: 10_000, gb: 0.1, hours: 5 },
  },
  {
    id: 'cloud',
    name: 'Cloud',
    price: '$12',
    unit: 'a month, per record',
    for: 'For a household or a small business that leans on Slash and automations.',
    href: `${SIGNUP}?plan=cloud`,
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

/** The plans a person pays for, in the order they are offered after Free. */
export const PAID: readonly Plan[] = PLANS.filter((p) => p.id !== 'free');

/**
 * SLASH CREDIT PACKS ON SALE. Empty: none is sold yet (the header says why), and every page that draws packs draws
 * nothing from an empty list.
 */
export const PACKS: readonly { credits: number; price: string }[] = [];

export const plan = (id: Plan['id']): Plan => PLANS.find((p) => p.id === id)!;
