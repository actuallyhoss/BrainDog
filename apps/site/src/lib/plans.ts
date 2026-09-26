/**
 * The plans and what each includes, in one place, for the pricing page and the home page's teaser.
 *
 * THE OWNER'S CALL, MADE ON 26 SEPTEMBER (`loop/DIRECTION.md` §33): a second hosted plan beside the
 * first, and extra usage priced per unit. That reverses decisions item 2's default of one plan and no
 * charge past it. Cloud's allowances are item 2's (15,000 runs, 150,000 requests, 1 GB fetched, 50
 * hours, 80 Slash asks). Cloud Plus's and every extra-usage price are the lead's proposal on the same
 * day, and are his to change here: every figure the site shows about a plan is read from this file.
 *
 * SLASH IS COUNTED IN CREDITS, AND MORE OF IT IS BOUGHT IN PACKS, NOT BY THE ASK. The owner, the same
 * day: "$0.1 per slash ask sounds so bad. maybe use slash credits?" One question or draft is one credit,
 * however much work it takes (contracts X41's rule for an ask, under a friendlier name); each plan
 * includes a month of them, and a pack adds more, used once the month's are gone and kept until spent.
 * A credit costs at most about $0.04 of model time (a record's ceiling is 300,000 neurons a month, about
 * $3.30, against 80 credits and the background work, decisions C19), so a pack at $0.05 or $0.04 a
 * credit holds its margin even at that worst case, which few questions reach.
 *
 * Runs, requests, bytes and hours are the Worker's metered units; each is priced at several times
 * Cloudflare's own rate so a busy record never costs more to run than it pays.
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
  cta: string;
  /** Where the button goes; `external` because `/app` is the app's, served on this site's name. */
  href: string;
  external: boolean;
  /** What the plan includes each month. */
  allowance: Allowance;
  /** What sets the plan apart, beyond the numbers, in two or three lines. */
  points: string[];
};


export const PLANS: readonly Plan[] = [
  {
    id: 'cloud',
    name: 'Cloud',
    price: '$12',
    unit: 'a month, per record',
    for: 'For a person, a household or a small business.',
    cta: 'Start your record',
    href: SIGNUP,
    external: true,
    allowance: { credits: 80, runs: 15_000, requests: 150_000, gb: 1, hours: 50 },
    points: ['Unlimited colleagues', 'Nightly backups, last 30 kept', 'Email and webhook inbox'],
  },
  {
    id: 'plus',
    name: 'Cloud Plus',
    price: '$29',
    unit: 'a month, per record',
    for: 'For busy teams, or records with lots of agents and automations.',
    cta: 'Start with Plus',
    href: `${SIGNUP}?plan=plus`,
    external: true,
    allowance: { credits: 400, runs: 60_000, requests: 600_000, gb: 5, hours: 200 },
    points: ['Five times the Cloud allowance', 'Everything in Cloud', 'Switch plans any time'],
  },
];

/** A row of the allowance table: its name, what it means, and how each allowance is written. */
export const USAGE: readonly { key: keyof Allowance; name: string; said: string; unit: (n: number) => string }[] = [
  { key: 'credits', name: 'Slash credits', said: 'One for each question or draft. Background work never spends them.', unit: (n) => `${n.toLocaleString('en-US')} a month` },
  { key: 'runs', name: 'Automation and script runs', said: 'Each time a rule, an automation or a script runs.', unit: (n) => `${n.toLocaleString('en-US')} a month` },
  { key: 'requests', name: 'Requests to other services', said: 'Pulls, calls and webhooks your record sends out.', unit: (n) => `${n.toLocaleString('en-US')} a month` },
  { key: 'gb', name: 'Data fetched', said: 'What those requests bring back.', unit: (n) => `${n} GB a month` },
  { key: 'hours', name: 'Script time', said: 'Time your scripts spend running.', unit: (n) => `${n} hours a month` },
];

/**
 * EXTRA USAGE, OFF UNTIL THE OWNER TURNS IT ON, under a monthly cap they set. Without it, work that
 * needs more than the plan waits for the next month, which is item 2's behaviour and stays the default.
 */
export const EXTRA: readonly { name: string; price: string; per: string }[] = [
  { name: 'Automation and script runs', price: '$1', per: 'per 5,000 runs' },
  { name: 'Requests to other services', price: '$1', per: 'per 50,000 requests' },
  { name: 'Data fetched', price: '$0.50', per: 'per GB' },
  { name: 'Script time', price: '$1', per: 'per 10 hours' },
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
