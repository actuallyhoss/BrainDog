/**
 * The plans, every figure of each, in one table: what a record on it costs, what it may run, how many Slash credits,
 * agents and people it holds, what extra usage costs, and the credit packs on sale.
 *
 * ONE TABLE, BECAUSE FOUR FILES HELD THE SAME FIGURES: the site's price list, the checkout's words, the
 * Directory's allowance and Slash's ask limits, and Cloud Plus was 75,000 runs in one and 60,000 in another. The
 * Directory's `ALLOWANCE` and `PLANS` are this table read again (`directory.ts`), the checkout takes its names and
 * prices from here (`apps/worker/src/billing.ts`), and `test/plans.test.ts` holds every figure.
 *
 * THE DEFAULTS TAKEN (each one a change of a word here): Cloud Plus is five times Cloud, the
 * code's figure and its card's own claim, not the roadmap's 60,000; agents are 3 on Free, 15 on Cloud and 75 on Cloud
 * Plus; no yearly price; the packs and extra usage chosen on 26 September stand. Free's figures are the default of
 * 2 October, Cloud's the one set on 26 September.
 *
 * MONEY IS WHOLE CENTS OF ONE CURRENCY, `CURRENCY`. `price` is those cents as a person reads them, made here and never
 * typed beside them. Nothing here charges: billing stays off or in test mode until he sits for a live charge.
 */

export const PLANS = ['free', 'hosted', 'plus', 'selfhost'] as const;
export type Plan = (typeof PLANS)[number];

/** The currency every figure in cents below is in. */
export const CURRENCY = 'USD' as const;

/** One month's allowance: runs, requests, bytes fetched and run time in milliseconds. Failures are never limited. */
export type Allowance = { runs: number; requests: number; bytes: number; ms: number };

/** What extra usage of one meter costs: `cents` for every `per` of it, in the meter's own unit. */
export type ExtraPrice = { cents: number; per: number };

export type PlanFigures = {
  /** The plan's name as a person reads it. */
  name: string;
  /** What it costs in cents of `CURRENCY`: by the month, and by the year when one is sold (`null`: none). */
  cents: { month: number; year: number | null };
  /** The same, as a person reads it ("$12"). */
  price: { month: string; year: string | null };
  /** What a record's scheduled actions may spend in a calendar month, UTC. `null` is no limit. */
  allowance: Allowance | null;
  /** Slash credits a month: one question or draft is one credit. `null`: the record's own `ask_cap` alone holds it. */
  credits: number | null;
  /** How many agent keys a record may hold live. A self-host's server key and a share link are not agents. */
  agents: number | null;
  /** How many people may hold a record. `null` is no limit. */
  people: number | null;
  /** Whether a second person may join the record (teams). Plus and a self-host only; the gate also waits for billing to be on. */
  teams: boolean;
  /** The most every file attached in a record may come to, in bytes. `null`: the host's own default (`ATTACHED_RECORD_MOST`). */
  files: number | null;
  /** What usage past the allowance costs, each meter, under a cap the owner sets. `null`: none is sold. */
  extra: { runs: ExtraPrice; requests: ExtraPrice; bytes: ExtraPrice; ms: ExtraPrice } | null;
};

const HOUR_MS = 3_600_000;
const GB = 1_000_000_000;

/** Cents as a person reads them: whole dollars bare ("$12"), anything else to the cent ("$12.50"). */
export const priceOf = (cents: number): string =>
  cents % 100 === 0 ? `$${cents / 100}` : `$${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;

/** A row of the table from its cents, so the price a person reads is never typed apart from the figure. */
const row = (figures: Omit<PlanFigures, 'price'>): PlanFigures => ({
  ...figures,
  price: { month: priceOf(figures.cents.month), year: figures.cents.year === null ? null : priceOf(figures.cents.year) },
});

/** His figures of 26 September for usage past the allowance: $1 per 5,000 runs, $1 per 50,000 requests, $0.50 a GB, $1 per 10 hours. */
const EXTRA: NonNullable<PlanFigures['extra']> = {
  runs: { cents: 100, per: 5_000 },
  requests: { cents: 100, per: 50_000 },
  bytes: { cents: 50, per: GB },
  ms: { cents: 100, per: 10 * HOUR_MS },
};

export const PLAN_TABLE: Readonly<Record<Plan, PlanFigures>> = {
  /* One person's record at no charge: a fifteenth of Cloud's runs and requests, a tenth of its data and script time. */
  free: row({
    name: 'Free',
    cents: { month: 0, year: null },
    allowance: { runs: 1_000, requests: 10_000, bytes: 100_000_000, ms: 5 * HOUR_MS },
    credits: 20,
    agents: 3,
    people: 1,
    teams: false,
    files: GB,
    extra: null,
  }),
  /* Twenty hourly actions are 14,600 runs, so 15,000 is Cloud's. */
  hosted: row({
    name: 'Cloud',
    cents: { month: 1_200, year: null },
    allowance: { runs: 15_000, requests: 150_000, bytes: GB, ms: 50 * HOUR_MS },
    credits: 80,
    agents: 15,
    people: null,
    teams: false,
    files: 20 * GB,
    extra: EXTRA,
  }),
  /* Five times Cloud on every figure, as its card says. */
  plus: row({
    name: 'Cloud Plus',
    cents: { month: 2_900, year: null },
    allowance: { runs: 75_000, requests: 750_000, bytes: 5 * GB, ms: 250 * HOUR_MS },
    credits: 400,
    agents: 75,
    people: null,
    teams: true,
    files: 100 * GB,
    extra: EXTRA,
  }),
  /* Counted and never limited: a self-host bills nobody, and its own `ask_cap` holds its asks. */
  selfhost: row({
    name: 'Self-host',
    cents: { month: 0, year: null },
    allowance: null,
    credits: null,
    agents: null,
    people: null,
    teams: true,
    files: null,
    extra: null,
  }),
};

/**
 * The most a monthly cap on extra usage may be set to, in cents of `CURRENCY`. A ceiling on a mistyped figure, not a
 * price: the owner of a record sets their own cap anywhere from one cent to this, and 0 turns extra usage off.
 */
export const EXTRA_CAP_MOST = 100_000;

/**
 * What a month's usage past a plan's allowance costs, in whole cents, rounded down: each meter's excess at the table's
 * price for it, summed before rounding. 0 on a plan with no allowance or no extra usage, and for a month inside it.
 *
 * NOT CAPPED HERE: the cap is the record's, and the Directory charges the lesser of this and the month's cap.
 */
export function extraCents(plan: Plan, used: Allowance): number {
  const { allowance, extra } = PLAN_TABLE[plan];
  if (allowance === null || extra === null) return 0;
  let cents = 0;
  for (const k of ['runs', 'requests', 'bytes', 'ms'] as const) {
    const over = Math.max(0, Number(used[k]) - allowance[k]);
    if (Number.isFinite(over)) cents += (over * extra[k].cents) / extra[k].per;
  }
  /* A HAIR ABOVE THE FLOOR, so a sum that is a whole number in exact arithmetic is not a cent short in floating point. */
  return Math.max(0, Math.floor(cents + 1e-9));
}

/** Whether a plan takes a second person. A plan nobody could name (`null`, or one this build does not know) is let through. */
export const teamsOn = (plan: string | null): boolean => plan === null || !(plan in PLAN_TABLE) || PLAN_TABLE[plan as Plan].teams;

/** A pack of Slash credits: `credits` for `cents` of `CURRENCY`, on top of a plan's month. */
export type Pack = { id: string; credits: number; cents: number };

/** The packs chosen on 26 September: 100 credits for $5, 500 for $20. Sold by no checkout yet. */
export const PACKS: readonly Pack[] = [
  { id: 'credits-100', credits: 100, cents: 500 },
  { id: 'credits-500', credits: 500, cents: 2_000 },
];

/**
 * Where a copy of the table says a different figure: one line a figure, naming the plan and the field
 * ("plus.allowance.runs: is 60000, the table says 75000"). Empty when every figure agrees.
 *
 * FOR EVERY COPY THAT MUST AGREE, a site's price list or a test's own literal, so a figure moved in one place names
 * itself instead of passing quietly.
 */
export function tableDiffers(copy: Readonly<Record<string, unknown>>, table: Readonly<Record<string, unknown>> = PLAN_TABLE): string[] {
  const out: string[] = [];
  const walk = (at: string, said: unknown, held: unknown): void => {
    if (held !== null && typeof held === 'object' && said !== null && typeof said === 'object') {
      const keys = new Set([...Object.keys(held), ...Object.keys(said)]);
      for (const k of keys) walk(at ? `${at}.${k}` : k, (said as Record<string, unknown>)[k], (held as Record<string, unknown>)[k]);
      return;
    }
    if (!Object.is(said, held)) out.push(`${at}: is ${JSON.stringify(said) ?? 'missing'}, the table says ${JSON.stringify(held) ?? 'nothing'}`);
  };
  for (const plan of new Set([...Object.keys(table), ...Object.keys(copy)])) {
    const said = copy[plan];
    const held = table[plan];
    if (said === undefined || held === undefined) out.push(`${plan}: ${held === undefined ? 'is not a plan of the table' : 'is missing'}`);
    else walk(plan, said, held);
  }
  return out;
}
