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

import { NOW, REGISTERS, ROWS } from './data.ts';
/* THE SAME MARKER `metrics.ts` PUTS IN ITS OWN CURRENCY SET, imported rather than retyped: two
   copies of the word a screen prints are two words that drift, and this one is printed by
   `mixedFix` on both sides of the product. */
import { BARE } from './metrics.ts';
import { amountOf, currencyOf } from './money.ts';
import { compile, matches, resolveDay } from './where.ts';
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
  /** The register the movement came from. It is the leg's own name, not a word from a fixed pair. */
  source: string;
  href: string;
};

export type Runway = {
  /** What it started from, in minor units. */
  from: number;
  /**
   * The one currency the whole walk is in, and the codes it saw when it was not one.
   *
   * A CASH WALK IS ONE CURRENCY OR IT IS NOTHING. It adds invoices to subscriptions to an opening
   * balance; add two currencies and the crossing day is invented — a real-looking date, on which
   * nothing happens. So `mixed` non-empty means there are no steps: the caller shows the sentence.
   */
  currency: string | null;
  mixed: readonly string[];
  steps: Step[];
  /** The first step whose balance goes under, or null if none does inside the horizon. */
  crossed: Step | null;
  /** Whole days from today to that step, or null. */
  days: number | null;
  /** The horizon actually walked, so a caller can say "nothing in the next 180 days". */
  horizon: number;
  /**
   * What this walk would not do, in words. Empty is the ordinary case.
   *
   * A REFUSAL IS A VALUE, which is the posture of every other module here and the one this walk did
   * not have. The horizon and a leg's cycle are numbers somebody typed into a declaration, and both
   * of them used to be walked as though they were the numbers they said they were. `mixed` stays
   * the currency channel it has always been, because that is the one the screen already reads.
   */
  refusals: readonly string[];
};

const DAY_MS = 86_400_000;
const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const noon = (day: string): number => Date.parse(`${day}T12:00:00Z`);

/**
 * The days one row's movement lands on inside the window.
 *
 * BY THE CYCLE THE LEG DECLARES. A leg with no `every` is a one-off; one with it reads the row's own
 * cycle field through the leg's table of months, so a quarterly plan is a declaration change rather
 * than a code change.
 *
 * A 180-DAY WINDOW HOLDS SIX CHARGES FROM A MONTHLY SUBSCRIPTION and none from a two-yearly one that
 * renewed last month. Reading only the stored date would count each once and make every horizon
 * beyond a month wrong in the same direction: too cheap.
 */
function occurrences(row: Entry, leg: Leg, first: string, until: number): { day: string; at: number }[] {
  const start = noon(first);
  if (!Number.isFinite(start)) return [];
  const months = leg.every ? (leg.every.months[String(row.fields[leg.every.field] ?? '')] ?? 0) : 0;
  /* A CYCLE THIS TABLE HAS NO FACTOR FOR IS A ONE-OFF, and a FRACTIONAL one is not. `!months` used
     to carry `!Number.isInteger(months)` beside it, so `monthly: 0.5`, which is how somebody writes
     a fortnightly charge, fell through to the one-off branch and charged each monthly
     service once in six months instead of six times. On the shipped services leg that closed at
     436,810 against a true 348,150: GBP 886.60 too high, over thirteen steps that look exactly like
     forty-four correct ones. The fraction is refused on the leg in `runway` now, so one cannot
     reach this line; what is left here is the honest case, a cycle the leg's table does not name. */
  if (!months) return start <= until ? [{ day: first, at: start }] : [];

  const out: { day: string; at: number }[] = [];
  for (let n = 0; n < 64; n++) {
    /* `resolveDay` RATHER THAN `setUTCMonth`, because `setUTCMonth` OVERFLOWS. A monthly charge on
       the 29th stepped 29 Jan → 1 Mar → 29 Mar: nothing in February and two charges in March, and
       every balance between the two was one charge too high on a screen somebody reads to decide
       whether they can pay a bill. On the 31st it is worse — 31 Jan → 3 Mar → 31 Mar → 1 May.

       The fix was written once already and landed in a `renewals` helper nothing called, under a
       comment claiming this path did it. This is the live path, and it is now the same arithmetic
       `where.ts` uses for predicates: clamp to the last day of the month intended. */
    const day = n === 0 ? iso(start) : resolveDay(`+${months * n}m`, start);
    if (!day) break;
    const at = noon(day);
    if (!Number.isFinite(at) || at > until) break;
    out.push({ day, at });
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
/** What one leg of a walk reads. It is the declaration's own shape, not a second one. */
export type Leg = {
  register: string;
  on: string;
  amount: string;
  where?: string;
  incoming?: { field: string; is: string };
  every?: { field: string; months: Readonly<Record<string, number>> };
};

/**
 * The furthest ahead a walk may be asked to look, in days.
 *
 * `horizon` ARRIVES ON A PAGE BLOCK AND WAS VALIDATED BY NOTHING. It multiplies into a timestamp
 * and feeds the recurrence loop, so a number somebody typed into a declaration decided both how
 * much work this function does and what window the answer is about. Every wrong one still came
 * back as a table of movements with a running balance and a crossing day, with nothing on the
 * screen to say the window was not a window. Driven against the money page's own legs: `0` closed
 * at 164,600 over five steps, `12.5` at minus 1,654,700 over nine, and `100000` walked 924.
 *
 * Ten years is longer than any cash question a person actually asks, and short enough that the
 * recurrence loop above stays a loop. It is the kernel's number and the kernel's argument rather
 * than a second one, because the two engines answer the same question about the same record.
 */
const HORIZON_CAP = 3650;

/**
 * The cash walk: what is liquid now, then every dated movement in order, until it goes under.
 *
 * WHAT IT READS IS DECLARED, NOT WIRED. This walked `ROWS.obligations` and `ROWS.services` by name,
 * under a page declaration that said which registers to read and was ignored \u2014 so a customer whose
 * money lives in registers of their own got a cash walk over somebody else's, or none. A forecast
 * that knows the word `obligations` is a forecast that works for one record.
 *
 * A `part` obligation counts in full. It is the honest direction for a balance you are asking not to
 * go under: the part already paid is not in the opening figure either.
 */
export function runway(opening: number, legs: readonly Leg[], horizon = 180): Runway {
  /* THE HORIZON IS A NUMBER SOMEBODY TYPED IN A DECLARATION, and it was multiplied into a timestamp
     with nothing checked at all. A refusal is a value here as everywhere else, so a horizon this
     walk cannot carry is a sentence rather than a table drawn over a window that is not a window. */
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > HORIZON_CAP)
    return {
      from: opening,
      currency: null,
      mixed: [],
      steps: [],
      crossed: null,
      days: null,
      horizon,
      refusals: [
        `A horizon is a whole number of days between 1 and ${HORIZON_CAP.toLocaleString('en-GB')}, and this one is ${JSON.stringify(horizon)}.`,
      ],
    };

  const until = NOW + horizon * DAY_MS;
  const refusals: string[] = [];
  const movements: { at: number; step: Omit<Step, 'balance'> }[] = [];
  const seen = new Set<string>();
  /** Whether any leg contributed a number with no currency on it. See the note at the check below. */
  let bare = false;

  for (const leg of legs) {
    /* A CYCLE IS A WHOLE NUMBER OF MONTHS, checked once for the leg rather than once per row. A
       fraction has no honest reading: `+0.5m` is not a step this arithmetic can take, so the walk
       either rounds it, collapsing two occurrences onto one day, or drops the recurrence
       altogether, which is what it did. The leg is refused by name and skipped, because half of a
       cash walk is not a smaller cash walk, it is a crossing day computed from part of the money. */
    const fraction = leg.every ? Object.entries(leg.every.months).find(([, n]) => !Number.isInteger(n)) : undefined;
    if (fraction) {
      refusals.push(
        `${leg.register} declares a cycle of ${fraction[1]} months for ${fraction[0]}, and a cycle is a whole number of months.`,
      );
      continue;
    }

    const decl = REGISTERS[leg.register];
    for (const row of ROWS[leg.register] ?? []) {
      /* THE SAME PREDICATE EVERY OTHER READ USES, compiled from the leg's own sentence — so a leg
         saying `state is open or part` means what the same words mean on a page. */
      if (leg.where && !matches(row, compile(leg.register, leg.where), NOW)) continue;

      const amount = amountOf(row.fields[leg.amount]) ?? 0;
      if (amount === 0) continue;
      /* A BARE NUMBER IS NOT MONEY, AND ADDING ONE IS MIXING. `amountOf` coerces any scalar, and
         `currencyOf` answers `null` for it — so a leg pointing at a `duration` or an `int` field
         poured seconds into a sterling walk and `mixed` stayed empty, because nothing counted the
         currency that was never there. Seventeen thousand seconds arrived on the screen as
         GBP −172.80 and the crossing day moved. `money.ts` has guarded this since it was written;
         this walk did not. */
      const currency = currencyOf(row.fields[leg.amount]);
      if (currency) seen.add(currency);
      else bare = true;

      const on = String(row.fields[leg.on] ?? '').slice(0, 10);
      if (!on) continue;

      /* WHICH VALUES MEAN MONEY ARRIVING is on the leg. Absent, every row of it is an outgoing \u2014
         which is what a subscription is, and what made the second leg readable as a declaration. */
      const incoming = leg.incoming ? row.fields[leg.incoming.field] === leg.incoming.is : false;
      const label = String(row.fields[decl?.title ?? leg.on] ?? '');

      for (const r of occurrences(row, leg, on, until)) {
        /* AN OVERDUE MOVEMENT IS STILL A MOVEMENT, clamped to today rather than dropped: the walk
           stays in order, a balance that is already gone is gone at the top of it, and the label
           says which rows those are. Dropping them read 116 days where the truth was 93. */
        const late = r.at < NOW;
        movements.push({
          at: late ? NOW : r.at,
          step: {
            day: late ? new Date(NOW).toISOString().slice(0, 10) : r.day,
            label: `${label}${late ? ' \u00b7 overdue' : ''}`,
            delta: incoming ? amount : -amount,
            source: leg.register,
            href: `/r/${leg.register}/${row.seq}`,
          },
        });
      }
    }
  }

  /* ONE CURRENCY OR NO WALK, AND A NUMBER WITH NO CURRENCY IS NOT ONE. A crossing day computed from
     two currencies is a real-looking date on which nothing happens, and there is no screen on which
     anybody would notice.

     THE GUARD FIRED ON `bare && seen.size > 0`, so it caught a bare leg only when ANOTHER leg had
     supplied a currency. A bare leg walking ALONE, which is the case with nothing to compare
     it against, walked. One leg over `tasks.effort` and an opening of GBP 5,000: fourteen task
     efforts in integer seconds were poured into a sterling balance, the walk crossed on 2026-09-06
     at minus 243,040, and the tile above it read RUNWAY · 3 days in the alarm colour. A walk adds
     money; a leg that is not pointed at money is not a smaller walk, it is a different question.
     `bare` alone is the condition, and the marker goes into the set so the sentence the screen
     already draws names what was wrong with it. */
  if (bare) seen.add(BARE);
  const mixed = bare || seen.size > 1 ? [...seen].sort() : [];
  const currency = mixed.length ? null : ([...seen][0] ?? null);
  if (mixed.length) return { from: opening, currency, mixed, steps: [], crossed: null, days: null, horizon, refusals };

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
    currency,
    mixed,
    steps,
    crossed,
    days: crossed ? Math.round((noon(crossed.day) - NOW) / DAY_MS) : null,
    horizon,
    refusals,
  };
}

/* ── trend ───────────────────────────────────────────────────────────────── */

export type Trend =
  | { kind: 'flat'; why: string; n: number; dropped: number; t: number }
  | {
      kind: 'growth';
      /** Compound growth per bucket, as a ratio. 1.08 is eight percent a bucket. */
      rate: number;
      low: number;
      high: number;
      n: number;
      /** Buckets that had no logarithm and were left out of the fit, but NOT out of the time axis. */
      dropped: number;
      t: number;
      /** The last complete bucket compounded forward. */
      projection: number[];
      /** True when the projection hit the 10x ceiling, which the caller must say out loud. */
      capped: boolean;
    };

/**
 * Two-tailed 97.5% critical value of Student's t, by degrees of freedom.
 *
 * Small on purpose: the gate needs six buckets, so df starts at 4, and by df 30 the value is within
 * 4% of the normal limit. Anything larger takes 1.96, which is the limit it is converging on.
 */
const T_TABLE: Record<number, number> = {
  4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
  11: 2.201, 12: 2.179, 13: 2.16, 14: 2.145, 15: 2.131, 16: 2.12, 17: 2.11,
  18: 2.101, 19: 2.093, 20: 2.086, 22: 2.074, 24: 2.064, 26: 2.056, 28: 2.048, 30: 2.042,
};

const tCrit = (df: number): number => {
  if (df >= 30) return 1.96;
  const keys = Object.keys(T_TABLE).map(Number).sort((a, b) => a - b);
  const hit = keys.find((k) => k >= df);
  return T_TABLE[hit ?? 30] ?? 1.96;
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
 * buckets have no logarithm, so they cannot be points — but they are still MOMENTS IN TIME, and
 * they keep their place on the x axis. A month that earned nothing is data; the fit simply has
 * nothing to say about that month. How many were dropped is reported, and if too few survive the
 * answer is flat with the count.
 */
export function trend(buckets: readonly number[], ahead = 3): Trend {
  /* THE X AXIS IS THE BUCKET'S OWN POSITION, not its position among the survivors.
     
     Dropping a bucket must not drop a unit of TIME. Re-indexing after the filter meant a series of
     twelve months with alternating zeros was fitted as six consecutive months: it reported 1.0997 a
     month where the truth over those twelve is 1.0488, said `n: 6` when it was handed twelve, and
     put `t` at 379 — a number that looks beyond argument. The proof it was collapsing time is that
     a series containing a zero returned exactly the same rate as the same series with that bucket
     DELETED, which are not the same series. */
  const points = buckets.map((y, x) => ({ x, y })).filter((p) => p.y > 0);
  const n = points.length;
  const dropped = buckets.length - n;

  if (n < N_MIN) {
    return { kind: 'flat', n, dropped, t: 0, why: `${n} usable buckets, and a fit needs ${N_MIN}` };
  }

  const ys = points.map((p) => Math.log(p.y));
  const xs = points.map((p) => p.x);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const sxy = xs.reduce((a, x, i) => a + (x - mx) * (ys[i]! - my), 0);
  if (sxx === 0) return { kind: 'flat', n, dropped, t: 0, why: 'every bucket is the same point in time' };

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
      dropped,
      t: Number.isFinite(t) ? t : 0,
      why: `the fit is not significant (|t| ${Math.abs(t).toFixed(1)}, and it needs ${T_MIN})`,
    };
  }

  const rate = Math.exp(slope);

  /* The band anchors on the LAST BUCKET GIVEN, at its own index, and compounds over the real
     distance to each future one. Compounding from the last surviving point as though it were the
     last bucket would shorten the horizon by however many trailing buckets were dropped. */
  const lastX = buckets.length - 1;
  const anchor = Math.exp(intercept + slope * lastX);
  const ceiling = anchor * CAP;
  let capped = false;
  const projection: number[] = [];
  for (let k = 1; k <= ahead; k++) {
    const raw = anchor * rate ** k;
    if (raw > ceiling) capped = true;
    projection.push(Math.round(Math.min(raw, ceiling)));
  }

  return {
    kind: 'growth',
    rate,
    /* STUDENT'S t, not 1.96. The normal quantile is the large-sample limit, and this function is
       gated to fire at six points — where df is 4 and the two-tailed 97.5% value is 2.776, so the
       band drawn with 1.96 was about 40% too narrow. A function whose entire thesis is refusing to
       over-claim cannot then under-state its own uncertainty. */
    low: Math.exp(slope - tCrit(n - 2) * se),
    high: Math.exp(slope + tCrit(n - 2) * se),
    n,
    dropped,
    t,
    projection,
    capped,
  };
}
