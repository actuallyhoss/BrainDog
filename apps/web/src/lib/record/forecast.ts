/**
 * The two aggregations that turn a record into a forecast: `running` and `trend` (08 §2.3).
 *
 * Neither was expressible with the nine ordinary aggregations, and the workaround in the system this
 * traces — a human typing the answer into a number field — is exactly the failure the whole
 * declared-metric idea exists to prevent. A typed number is right on the day it is typed.
 *
 * `running` is a cumulative reducer with a stop condition, over an order. Seed from what is liquid,
 * apply each dated movement on its day, stop at the first row that crosses. That walk is a cash
 * runway, and it is also a plan's countdown to zero with the stop removed. It returns the SEQUENCE
 * and the row that crossed, not just the date — because "you run out on 14 November" is a fact you
 * look at, and "you run out on 14 November, and it is the Fenwick renewal that does it" is a fact
 * you act on.
 *
 * `trend` is a log-linear fit that REFUSES TO ANSWER when the data cannot support one. Six points of
 * noise will always yield a slope; printing it as growth is how a product invents a number that then
 * gets quoted in a meeting. It is gated on significance and the projection is capped, and both the
 * refusal and the cap say so out loud.
 *
 * MONEY IS AN INTEGER IN MINOR UNITS throughout, and the walk never divides. A forecast that
 * accumulates floating-point pounds drifts by a penny a few hundred rows in, and a balance that is
 * off by a penny is a balance nobody trusts again.
 */

import { NOW, ROWS } from './data.ts';
import { resolveDay } from './where.ts';
import type { Entry } from './schema.ts';

/** One movement on one day, and the balance after it. */
export type Step = {
  day: string;
  /** What moved the money, in the words the row uses. */
  label: string;
  /** Signed, in minor units. Positive is money arriving. */
  delta: number;
  /** The running balance after this step, in minor units. */
  balance: number;
  source: 'obligation' | 'service';
  href: string;
};

export type Runway = {
  /** What it started from, in minor units. */
  from: number;
  steps: Step[];
  /** The first step whose balance goes under, or null if none does inside the horizon. */
  crossed: Step | null;
  /** Whole days from today to that step, or null. */
  days: number | null;
  /** The horizon actually walked, so a caller can say "nothing in the next 180 days". */
  horizon: number;
};

const DAY_MS = 86_400_000;
const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const noon = (day: string): number => Date.parse(`${day}T12:00:00Z`);

/** Months per cycle. A cycle this does not know does not recur, which is the safe direction. */
const CYCLE_MONTHS: Record<string, number> = { monthly: 1, yearly: 12, two_yearly: 24 };

/**
 * Every renewal a live service will actually charge inside the window.
 *
 * A service is one row with a next date and a cycle, so a 180-day window contains six charges from a
 * monthly subscription and none from a two-yearly one that renewed last month. Reading only the
 * stored `renews` date would count each subscription once and make every horizon beyond a month
 * wrong in the same direction: too cheap.
 *
 * Dates advance by calendar month rather than by 30 days, so a monthly renewal on the 31st does not
 * drift backwards through the year.
 */
function renewals(service: Entry, until: number): { day: string; at: number }[] {
  const first = String(service.fields.renews ?? '');
  if (!first) return [];
  const months = CYCLE_MONTHS[String(service.fields.cycle ?? '')] ?? 0;
  const out: { day: string; at: number }[] = [];

  const start = Date.parse(`${first}T12:00:00Z`);
  if (!Number.isFinite(start)) return [];

  for (let n = 0; n < 64; n++) {
    /* `resolveDay` rather than `setUTCMonth`, because `setUTCMonth` OVERFLOWS. A monthly service
       renewing on the 31st stepped 31 Jan → 3 Mar → 31 Mar → 1 May: nothing in February, two
       charges in March. The comment here used to claim the opposite. `where.ts` already solved
       this for predicates and clamps to the last day of the month intended, so it is the same
       arithmetic in one place rather than two that disagree. */
    const day = months === 0 ? iso(start) : resolveDay(`+${months * n}m`, start);
    if (!day) break;
    const at = Date.parse(`${day}T12:00:00Z`);
    if (at > until) break;
    if (at >= NOW) out.push({ day, at });
    if (!months) break;
  }
  return out;
}

/**
 * The cash walk: what is liquid now, then every dated movement in order, until it goes under.
 *
 * BOTH SIDES OF THE RECORD, because a forecast built from invoices alone is a forecast that has
 * forgotten the hosting bill. Open obligations supply the one-off movements in both directions and
 * live services supply the recurring outgoings, expanded across the window.
 *
 * A `part` obligation counts in full. It is the honest direction for a balance you are asking not to
 * go under: the part already paid is not in the opening figure either.
 */
export function runway(opening: number, horizon = 180): Runway {
  const until = NOW + horizon * DAY_MS;
  const movements: { at: number; step: Omit<Step, 'balance'> }[] = [];

  for (const row of ROWS.obligations ?? []) {
    const state = String(row.fields.state ?? '');
    if (state !== 'open' && state !== 'part') continue;
    const day = String(row.fields.due ?? '');
    const at = noon(day);
    if (!Number.isFinite(at) || at < NOW || at > until) continue;
    const owed = String(row.fields.direction ?? '') === 'owed_to_me';
    movements.push({
      at,
      step: {
        day,
        label: String(row.fields.what ?? ''),
        delta: owed ? Number(row.fields.amount ?? 0) : -Number(row.fields.amount ?? 0),
        source: 'obligation',
        href: `/r/obligations/${row.seq}`,
      },
    });
  }

  for (const row of ROWS.services ?? []) {
    /* `cancelled`, which is a state the register actually declares. This guarded on `ended` — a
       value nothing holds — so the guard never fired once and every cancelled subscription was
       charged for ever. `Old CI plan` was cancelled and still took GBP 174.00 out of the forecast
       over six months, as the first row of the money page's own "What is coming". Every other
       consumer in the app already spelled it `cancelled`. */
    if (String(row.fields.state ?? '') === 'cancelled') continue;
    for (const r of renewals(row, until))
      movements.push({
        at: r.at,
        step: {
          day: r.day,
          label: String(row.fields.name ?? ''),
          delta: -Number(row.fields.cost ?? 0),
          source: 'service',
          href: `/r/services/${row.seq}`,
        },
      });
  }

  /* A zero never reaches the walk. A free certificate renews like everything else and moves the
     balance by nothing, so it is a row that costs a line and says nothing — and in a list whose
     whole job is "what changes this number", a row that changes it by zero is noise. */
  const moving = movements.filter((m) => m.step.delta !== 0);

  /* By day, then outgoings before incomings on the same day. A balance that dips below zero at
     breakfast and recovers by lunchtime has still bounced, and a walk that pays you first hides
     exactly the day you needed to see. */
  moving.sort((a, b) => a.at - b.at || a.step.delta - b.step.delta);

  let balance = opening;
  const steps: Step[] = [];
  let crossed: Step | null = null;
  for (const m of moving) {
    balance += m.step.delta;
    const step: Step = { ...m.step, balance };
    steps.push(step);
    if (!crossed && balance < 0) crossed = step;
  }

  return {
    from: opening,
    steps,
    crossed,
    days: crossed ? Math.round((noon(crossed.day) - NOW) / DAY_MS) : null,
    horizon,
  };
}

/* ── trend ───────────────────────────────────────────────────────────────── */

export type Trend =
  | { kind: 'flat'; why: string; n: number; t: number }
  | {
      kind: 'growth';
      /** Compound growth per bucket, as a ratio. 1.08 is eight percent a bucket. */
      rate: number;
      low: number;
      high: number;
      n: number;
      t: number;
      /** The last complete bucket compounded forward. */
      projection: number[];
      /** True when the projection hit the 10x ceiling, which the caller must say out loud. */
      capped: boolean;
    };

/** The significance gate, and the ceiling. Both from 08 §2.3, both stated rather than tuned. */
const T_MIN = 2.1;
const N_MIN = 6;
const CAP = 10;

/**
 * A log-linear fit over buckets, which returns *flat* rather than a number it cannot support.
 *
 * SIX POINTS OF NOISE WILL ALWAYS PRODUCE A SLOPE. Fitting a line to anything and printing the
 * gradient as "growth" is how a product manufactures a figure that gets quoted in a meeting and then
 * defended for a year. So the fit has to clear |t| >= 2.1 with at least six buckets, and when it
 * does not the answer is "flat" WITH THE REASON, not a smaller number.
 *
 * The projection compounds the last complete bucket forward and is capped at ten times, with the cap
 * reported. An uncapped exponential on six points is a number that will be quoted.
 *
 * Log-linear because growth is multiplicative: a fit on the raw values says a business adding
 * £1,000 a month and one growing 10% a month are the same shape, and they are not. Non-positive
 * buckets have no logarithm and are dropped, which is also why a series that has ever been zero
 * cannot be fitted and says so.
 */
export function trend(buckets: readonly number[], ahead = 3): Trend {
  const usable = buckets.filter((b) => b > 0);
  const n = usable.length;
  if (n < N_MIN) {
    return { kind: 'flat', n, t: 0, why: `${n} usable buckets, and a fit needs ${N_MIN}` };
  }

  const ys = usable.map((b) => Math.log(b));
  const xs = usable.map((_, i) => i);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const sxy = xs.reduce((a, x, i) => a + (x - mx) * (ys[i]! - my), 0);
  if (sxx === 0) return { kind: 'flat', n, t: 0, why: 'every bucket is the same point in time' };

  const slope = sxy / sxx;
  const intercept = my - slope * mx;

  /* The standard error of the slope, which is the whole gate: it is what separates a real trend from
     six points that happen to lean. */
  const resid = ys.reduce((a, y, i) => a + (y - (intercept + slope * xs[i]!)) ** 2, 0);
  const se = Math.sqrt(resid / (n - 2) / sxx);
  const t = se === 0 ? 0 : slope / se;

  if (!Number.isFinite(t) || Math.abs(t) < T_MIN) {
    return {
      kind: 'flat',
      n,
      t: Number.isFinite(t) ? t : 0,
      why: `the fit is not significant (|t| ${Math.abs(t).toFixed(1)}, and it needs ${T_MIN})`,
    };
  }

  const rate = Math.exp(slope);
  const last = usable[n - 1]!;
  const ceiling = last * CAP;
  let capped = false;
  const projection: number[] = [];
  for (let k = 1; k <= ahead; k++) {
    const raw = last * rate ** k;
    if (raw > ceiling) capped = true;
    projection.push(Math.round(Math.min(raw, ceiling)));
  }

  return {
    kind: 'growth',
    rate,
    low: Math.exp(slope - 1.96 * se),
    high: Math.exp(slope + 1.96 * se),
    n,
    t,
    projection,
    capped,
  };
}
