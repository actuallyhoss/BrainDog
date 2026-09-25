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

import { ROWS } from './data.ts';
import { REGISTERS } from './held.ts';
/* THE SAME MARKER `metrics.ts` PUTS IN ITS OWN CURRENCY SET, imported rather than retyped: two
   copies of the word a screen prints are two words that drift, and this one is printed by
   `mixedFix` on both sides of the product. */
import { BARE } from './metrics.ts';
import { convertMinor, rateFor } from '@braindog/kernel';

import { fxNow } from './metrics.ts';
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
  /**
   * The currency the movement was written in, set only when it was converted into the walk's, as the kernel's `Step.from`.
   *
   * THE FORECAST'S RATE DRIFT MOVES EXACTLY THESE STEPS, and this walk used to convert without saying so: over the seed in
   * pounds the kernel marked every sterling bill `from: GBP` and this walk marked none, so the drift control on the demo
   * had nothing to move. `engines.test.ts` holds the two walks to the same marks.
   */
  from?: string;
  /** What the movement is part of, from the leg's `group` field, set only when the leg names one and the row fills it. */
  of?: string;
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
  /** Set when a home currency is chosen and a movement could not be converted into it: each pair, `USD to EGP`. */
  missing?: string[];
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
/** The last day of the month a `YYYY-MM-DD` day falls in: day zero of the month after it, at noon. */
const endOfMonth = (day: string): string => iso(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0, 12));
const noon = (day: string): number => Date.parse(`${day}T12:00:00Z`);

/**
 * The cycle value a row carries that the leg's table does not name, or `null`.
 *
 * `?? 0` MADE `weekly` ON A LEG THAT NAMES `monthly` THE SAME AS `none`, and the walk below counted a
 * weekly bill once and said nothing. `none` and an empty value mean exactly "once" and stay quiet; a
 * value the table names, even with a zero, is the declaration saying "once" on purpose. The kernel
 * asks the same question in `occurrences`, and `hasOwn` in both so a prototype key is not a cycle.
 */
function unreadCycle(row: Entry, leg: Leg): string | null {
  if (!leg.every) return null;
  const cycle = String(row.fields[leg.every.field] ?? '');
  return cycle !== '' && cycle !== 'none' && !Object.hasOwn(leg.every.months, cycle) ? cycle : null;
}

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
function occurrences(row: Entry, leg: Leg, first: string, until: number, last: string | null, now: number): { day: string; at: number }[] {
  const start = noon(first);
  if (!Number.isFinite(start)) return [];
  /* A ROW ENDED BEFORE ITS FIRST DAY WALKS NOTHING, one-off or not, as the kernel's (`Leg.ends` there). */
  if (last !== null && first > last) return [];
  const cycle = leg.every ? String(row.fields[leg.every.field] ?? '') : '';
  const months = leg.every && Object.hasOwn(leg.every.months, cycle) ? leg.every.months[cycle]! : 0;
  /* A CYCLE THIS TABLE HAS NO FACTOR FOR IS A ONE-OFF, and a FRACTIONAL one is not. `!months` used
     to carry `!Number.isInteger(months)` beside it, so `monthly: 0.5`, which is how somebody writes
     a fortnightly charge, fell through to the one-off branch and charged each monthly
     service once in six months instead of six times. On the shipped services leg that closed at
     436,810 against a true 348,150: GBP 886.60 too high, over thirteen steps that look exactly like
     forty-four correct ones. The fraction is refused on the leg in `runway` now, so one cannot
     reach this line; what is left here is the honest case, a cycle the leg's table does not name.
     That one is still walked once, and `runway` says so through `unreadCycle`. */
  if (!months) return start <= until ? [{ day: first, at: start }] : [];

  /* A CYCLE BEFORE TODAY HAS ALREADY BEEN CHARGED. `renews` is an anchor nobody moves on, and every
     past cycle was clamped to today as overdue, so a monthly service anchored three months back
     charged four times on day one. Skipped cycles do not count toward the 64, as in the kernel. */
  const today = iso(now);
  /* A FIRST DAY THAT IS ITS MONTH'S LAST DAY STAYS ON THE LAST DAY, as the kernel's walk does since W57-2
     (`packages/kernel/src/forecast.ts`, `f732179d`). The clamp alone stepped a bill due 30 September to 30 October
     and 30 December, and `engines.test.ts` holds the two engines to the same walk, so CI went red on the push that
     carried the kernel half alone. A first day that is not a month end steps exactly as before.

     EXCEPT ON A CYCLE OF WHOLE YEARS, again as the kernel does. Audit fifty-eight finding 10 walked a
     yearly bill taken on 28 February 2027 to 29 February 2028 in both engines, a day after the
     anniversary it renews on. A whole-year cycle never leaves the month it started in, February is
     the only month whose length changes between years, and the clamp in `resolveDay` already walks a
     leap-day start to 28 February in a common year and back to the 29th in a leap one.
     `forecast-month-end.test.ts` beside this file walks those rows through both engines. */
  const monthEnd = months % 12 !== 0 && endOfMonth(first) === first;
  const out: { day: string; at: number }[] = [];
  for (let n = 0; out.length < 64 && n < 64 + 1_200; n++) {
    /* `resolveDay` RATHER THAN `setUTCMonth`, because `setUTCMonth` OVERFLOWS. A monthly charge on
       the 29th stepped 29 Jan → 1 Mar → 29 Mar: nothing in February and two charges in March, and
       every balance between the two was one charge too high on a screen somebody reads to decide
       whether they can pay a bill. On the 31st it is worse — 31 Jan → 3 Mar → 31 Mar → 1 May.

       The fix was written once already and landed in a `renewals` helper nothing called, under a
       comment claiming this path did it. This is the live path, and it is now the same arithmetic
       `where.ts` uses for predicates: clamp to the last day of the month intended. */
    const stepped = n === 0 ? iso(start) : resolveDay(`+${months * n}m`, start);
    const day = stepped && n > 0 && monthEnd ? endOfMonth(stepped) : stepped;
    if (!day) break;
    const at = noon(day);
    /* PAST THE ROW'S LAST DAY IS THE SAME STOP AS PAST THE HORIZON, as in the kernel. */
    if (!Number.isFinite(at) || at > until || (last !== null && day > last)) break;
    if (day < today) continue;
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
  /**
   * The field holding the last day a row's money moves on: nothing after it is walked, and a step on the day itself is.
   * Inclusive because the old tool's `ends_on`, which the import sets it from, is the last payday and not the last day
   * worked; the argument and the measurement are on the kernel's `Leg.ends`, and `forecast-ends.test.ts` beside this
   * file walks the same ended rows through both engines.
   */
  ends?: string;
  /**
   * The field naming what a row's movement is part of: the plan an instalment belongs to, said on each step as `Step.of`.
   * A label could not do it, because the seed titles each part `Proofing press, 3 of 8`. Only a non-empty text value is a
   * name, exactly as the kernel's `Leg.group` reads it.
   */
  group?: string;
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
/** Which movements a walk reads: one currency's, unconverted, or every one but those in `except`, converted as usual. */
export type Only = string | { except: readonly string[] };

/**
 * `now` IS THE DAY THE WALK STARTS FROM, and the caller's. It was the seed's frozen `NOW` read here, which is right for
 * the sample's rows and for nothing else: the rows this walks are `api.ts`'s mock, which passes its own clock, and any
 * other caller gets the wall clock rather than 3 September 2026.
 */
export function runway(opening: number, legs: readonly Leg[], horizon = 180, only?: Only, now: number = Date.now()): Runway {
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

  const until = now + horizon * DAY_MS;
  const refusals: string[] = [];
  const movements: { at: number; currency: string; step: Omit<Step, 'balance'> }[] = [];
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
      /* `is set to` AND IT WAS `declares`. `10 §7` makes the refusal the teacher, and a refusal
         that opens in the schema's own verb teaches the schema: the person reading this is looking
         at a cash walk with a leg missing from it and wants to know which list to go and fix.
         `packages/kernel/src/forecast.ts` still says `declares` in the same sentence, and cannot
         be reached from here. */
      refusals.push(
        `${leg.register} is set to a cycle of ${fraction[1]} months for ${fraction[0]}, and a cycle is a whole number of months.`,
      );
      continue;
    }

    const decl = REGISTERS[leg.register];
    /** Each cycle value the leg's table does not name, and how many walked rows carry it. */
    const unread = new Map<string, number>();
    let unreadableEnd = 0;
    for (const row of ROWS[leg.register] ?? []) {
      /* THE SAME PREDICATE EVERY OTHER READ USES, compiled from the leg's own sentence — so a leg
         saying `state is open or part` means what the same words mean on a page. */
      if (leg.where && !matches(row, compile(leg.register, leg.where, now), now)) continue;

      /* A BARE NUMBER IS NOT MONEY, AND ADDING ONE IS MIXING. `amountOf` coerces any scalar, and
         `currencyOf` answers `null` for it — so a leg pointing at a `duration` or an `int` field
         poured seconds into a sterling walk and `mixed` stayed empty, because nothing counted the
         currency that was never there. Seventeen thousand seconds arrived on the screen as
         GBP −172.80 and the crossing day moved. `money.ts` has guarded this since it was written;
         this walk did not.

         AND THE GUARD RAN AFTER THE ZERO CHECK, so a leg pointed at a `text` field slipped past it
         in silence: `amountOf('Halden')` is `null`, `?? 0` makes it zero, and the `continue` above
         fired before anything asked what the value was. No steps and no sentence, which is the one
         answer a cash walk must never give. The kernel counts that row as not money and says so.

         ABSENT IS STILL NOT WRONG. A row nobody has priced yet moves no balance, and saying so on
         every one of them would bury the leg that is actually misdeclared. What is faulted is a
         value that is THERE and is not money. */
      const held = row.fields[leg.amount];
      const present = held !== undefined && held !== null && held !== '';
      const currency = currencyOf(held);
      if (present && !currency) bare = true;

      const amount = amountOf(held) ?? 0;
      if (amount === 0) continue;
      if (currency) seen.add(currency);

      const on = String(row.fields[leg.on] ?? '').slice(0, 10);
      if (!on) continue;
      /* AN END THIS WALK CANNOT READ IS SAID AND THE ROW LEFT OUT, in the kernel's words: walked with no end it would
         repeat for ever, which is the fault the field exists to stop. */
      const last = leg.ends ? String(row.fields[leg.ends] ?? '').slice(0, 10) : '';
      if (last && !Number.isFinite(noon(last))) {
        unreadableEnd++;
        continue;
      }

      /* WHICH VALUES MEAN MONEY ARRIVING is on the leg. Absent, every row of it is an outgoing \u2014
         which is what a subscription is, and what made the second leg readable as a declaration. */
      const incoming = leg.incoming ? row.fields[leg.incoming.field] === leg.incoming.is : false;
      const label = String(row.fields[decl?.title ?? leg.on] ?? '');
      /* A NUMBER OR AN EMPTY FIELD GROUPS NOTHING, as in the kernel, rather than putting every such row into one plan
         called nothing, which the plan control would then count in or out as one. */
      const part = leg.group ? row.fields[leg.group] : undefined;
      const of = typeof part === 'string' && part.trim() !== '' ? part.trim() : null;

      /* COUNTED WHERE THE KERNEL COUNTS IT: a row that reached the walk with money, a date and a
         step inside the window. A row with no amount, or one whose first day is past the horizon,
         is missing nothing from this walk whatever its cycle. */
      const walked = occurrences(row, leg, on, until, last || null, now);
      const cycle = unreadCycle(row, leg);
      if (cycle !== null && walked.length) unread.set(cycle, (unread.get(cycle) ?? 0) + 1);

      for (const r of walked) {
        /* AN OVERDUE MOVEMENT IS STILL A MOVEMENT, clamped to today rather than dropped: the walk
           stays in order, a balance that is already gone is gone at the top of it, and the label
           says which rows those are. Dropping them read 116 days where the truth was 93. */
        /* BY THE DAY, as the kernel: noon UTC against the clock made a bill due today overdue in the
           afternoon, while `due before today` still excluded it. */
        const late = r.day < iso(now);
        movements.push({
          at: late ? now : r.at,
          currency: currency ?? '',
          step: {
            day: late ? new Date(now).toISOString().slice(0, 10) : r.day,
            label: `${label}${late ? ' \u00b7 overdue' : ''}`,
            delta: incoming ? amount : -amount,
            source: leg.register,
            href: `/r/${leg.register}/${row.seq}`,
            ...(of !== null ? { of } : {}),
          },
        });
      }
    }

    /* ONE SENTENCE PER VALUE, IN THE KERNEL'S WORDS, typed twice because this app reaches the
       kernel's walk only through its index and the sentence is not exported there. Driven before
       it existed: a £100 bill with `repeats: weekly` on a leg naming only `monthly` walked as one
       step of minus 10,000 and an empty list, where a 60-day window holds eight or nine of it.
       `forecast-unknown-cycle.test.ts` holds this string against the kernel's, so the two cannot
       drift apart the way the fractional-cycle sentence did. */
    if (unreadableEnd)
      refusals.push(
        `${unreadableEnd} ${unreadableEnd === 1 ? 'row' : 'rows'} of ${leg.register} ${unreadableEnd === 1 ? 'has an end in' : 'have ends in'} ${leg.ends} that this walk could not read, and ${unreadableEnd === 1 ? 'its' : 'their'} money is not in it.`,
      );
    for (const [value, n] of [...unread].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      refusals.push(
        `${n} ${n === 1 ? 'row' : 'rows'} of ${leg.register} ${n === 1 ? 'has' : 'have'} ${leg.every!.field} set to ${value}, which this walk has no cycle for, and ${n === 1 ? 'its' : 'their'} money is in the walk once rather than every time it recurs. Give ${value} a whole number of months on this leg, or set the ${n === 1 ? 'row' : 'rows'} to a cycle the leg has.`,
      );
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
  /* MOVEMENTS IN ANOTHER CURRENCY ARE CONVERTED INTO THE HOME ONE, each at the rate as of its day, as the kernel's walk
     does; one that cannot be converted leaves the walk with no steps and a sentence naming the rate. */
  /* ONE CURRENCY OF A WALK DRAWN ONCE PER CURRENCY (`only`): that currency's movements, as they are, as the kernel's. */
  if (typeof only === 'string' && !bare) {
    for (let i = movements.length - 1; i >= 0; i -= 1) if (movements[i]!.currency !== only) movements.splice(i, 1);
    seen.clear();
    seen.add(only);
  }
  /* AND THE HOME WALK BESIDE THEM (`except`): every movement but those in a currency with no rate, which walk on their own. */
  if (only !== undefined && typeof only !== 'string') {
    for (let i = movements.length - 1; i >= 0; i -= 1) if (only.except.includes(movements[i]!.currency)) movements.splice(i, 1);
    for (const c of only.except) seen.delete(c);
  }
  const held = typeof only === 'string' ? { home: null, rates: [] } : fxNow();
  const home = held.home;
  if (!bare && home !== null && seen.size > 0 && (seen.size > 1 || !seen.has(home))) {
    const missing = new Set<string>();
    for (const m of movements) {
      if (m.currency === home) continue;
      const r = rateFor(held.rates, m.currency, home, m.step.day);
      if (!r) missing.add(m.currency);
      else m.step = { ...m.step, delta: convertMinor(m.step.delta, m.currency, home, r.rate), from: m.currency };
    }
    if (missing.size)
      return {
        from: opening,
        currency: null,
        mixed: [...seen].sort(),
        missing: [...missing].sort().map((c) => `${c} to ${home}`),
        steps: [],
        crossed: null,
        days: null,
        horizon,
        refusals: [...refusals, `this walk reads ${[...seen].sort().join(' and ')} and adds it up in ${home}, and there is no rate yet from ${[...missing].sort().join(' or ')} to ${home}`],
      };
    seen.clear();
    seen.add(home);
  }
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
    days: crossed ? Math.round((noon(crossed.day) - now) / DAY_MS) : null,
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
