/**
 * The cash walk: what is liquid now, then every dated movement in order, until it goes under.
 *
 * THE ONE BLOCK ON ANY PAGE THAT IS ABOUT THE FUTURE. Everything else the record draws is a fact
 * about rows that exist; this is an arithmetic over dates that have not happened, and the whole
 * value of it is one number — the day the balance crosses zero, and the row that does it.
 *
 * BOTH SIDES OF THE RECORD, because a forecast built from invoices alone has forgotten the hosting
 * bill. What it walks is DECLARED on the block rather than wired here: which registers, which date
 * field, which amount, which direction, and whether the movement repeats. A forecast that knew the
 * word "obligations" would be a forecast that works for one record.
 *
 * ONE CURRENCY OR NO WALK. A crossing day computed across two is a real-looking date on which
 * nothing happens, and there is no screen on which anybody notices.
 *
 * AN OVERDUE MOVEMENT IS STILL A MOVEMENT. Dropping anything dated before today reads as "that is
 * the past", but an unpaid invoice is money that has not moved yet whatever its date says. It is
 * clamped to today so the walk stays in order, and the label says which rows those are.
 */

import type { Refusal, Result, Sql } from '@braindog/ports';
import { no } from '@braindog/ports';
import { compile, resolveDay, type Schema } from '@braindog/where';

import type { Entry } from './index.ts';
import { predicateOf, type EvalContext } from './metrics.ts';

export type Leg = {
  register: string;
  /** The date the movement happens on. */
  on: string;
  /** The money field. Its currency is the walk's, and two of them is a refusal. */
  amount: string;
  where?: string;
  /**
   * Which values of a field mean money ARRIVING. Absent means every row of this leg is an outgoing,
   * which is what a subscription is.
   */
  incoming?: { field: string; is: string };
  /** A movement that recurs: a field naming a cycle, and a table of months per cycle. */
  every?: { field: string; months: Record<string, number> };
};

export type Runway = {
  from: number;
  currency: string | null;
  mixed: readonly string[];
  steps: Step[];
  /** The first step whose balance goes under, or `null` if none does inside the horizon. */
  crossed: Step | null;
  days: number | null;
  horizon: number;
  refusals: Refusal[];
};

export type Step = {
  day: string;
  label: string;
  /** Signed, in minor units. Positive is money arriving. */
  delta: number;
  balance: number;
  source: string;
  spoken: string;
};

export type ForecastDeps = {
  sql: Sql;
  schemaOf: (register: string) => Schema | null;
  titleOf: (register: string) => string | null;
  hydrate: (id: string) => Entry | null;
  ctx: EvalContext;
};

const DAY_MS = 86_400_000;
const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
/**
 * Noon on a day — and a day that already carries a time is that time.
 *
 * A `day` FIELD HOLDS TEN CHARACTERS AND AN `instant` FIELD HOLDS TWENTY-FOUR, and nothing stops a
 * leg naming either. Concatenating a `T12:00:00Z` onto an instant is `NaN`, `occurrences` returns
 * nothing, and a £500 outgoing vanishes out of a walk that then says "you never run out".
 */
const noon = (day: string): number => Date.parse(day.length === 10 ? `${day}T12:00:00Z` : day);

/** The ten characters a step is labelled by, whichever of the two the field held. */
const dayOf = (value: string): string => value.slice(0, 10);

/**
 * Walk the legs.
 *
 * `opening` is what is liquid TODAY and it is a number somebody has to supply: a runway seeded from
 * a balance nobody declared is a forecast that looks like a fact and is a guess.
 */
/** The most rows one leg may carry. Past it the walk refuses rather than answering from a subset. */
const CAP = 2000;

/**
 * The most times one row may recur inside a walk. Past it the walk refuses rather than truncating.
 *
 * IT WAS A BARE `64` IN A `for` LOOP THAT `break`s, WHICH IS THE TRUNCATION THE ROW CAP ABOVE
 * REFUSES TO DO. The argument beside that cap is that "a crossing day computed from most of the
 * money is the one number in this module that must never be approximately right", and a monthly
 * charge over a ten-year horizon stopped in 2031 and reported the runway as un-crossed, silently,
 * by the same arithmetic the row cap exists to prevent.
 *
 * SIXTY-FOUR IS ENOUGH FOR EVERY HORIZON A PERSON ASKS FOR: five years of monthly, sixteen of
 * quarterly, sixty-four of annual. What it is not enough for is a horizon nobody validated, and the
 * answer to that is a sentence rather than a shorter walk.
 */
const EVERY_CAP = 64;
/** How many cycles a walk steps through at most, past ones included: a monthly anchor a century back. */
const SKIP_CAP = EVERY_CAP + 1_200;

/**
 * The furthest ahead a walk may be asked to look, in days.
 *
 * `horizon` ARRIVES ON A BLOCK AND WAS VALIDATED BY NOTHING. It multiplies into a timestamp and
 * feeds the recurrence loop, so a number somebody typed in a declaration decided how much work this
 * function does. Ten years is longer than any cash question a person actually asks and short enough
 * that the loop above stays a loop.
 */
const HORIZON_CAP = 3650;

export function runway(deps: ForecastDeps, opening: number, legs: readonly Leg[], horizonDays = 180): Result<Runway> {
  /* THE HORIZON IS A NUMBER SOMEBODY TYPED IN A DECLARATION, and it was multiplied into a timestamp
     with nothing checked. A refusal is a value here as everywhere else, so a horizon this walk
     cannot carry is a sentence rather than a walk that quietly stops early or a loop that does not
     end. */
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > HORIZON_CAP)
    return no<Runway>(
      'OUT_OF_BOUNDS',
      `A horizon is a whole number of days between 1 and ${HORIZON_CAP.toLocaleString('en-GB')}, and this one is ${JSON.stringify(horizonDays)}.`,
      { at: 'horizon' },
    );
  const until = deps.ctx.nowMs + horizonDays * DAY_MS;
  const refusals: Refusal[] = [];
  const movements: { at: number; step: Omit<Step, 'balance'> }[] = [];
  const seen = new Set<string>();

  for (const leg of legs) {
    const schema = deps.schemaOf(leg.register);
    if (!schema) {
      refusals.push({ code: 'REGISTER_UNKNOWN', fix: `There is no register called ${leg.register}.`, at: 'from' });
      continue;
    }
    const said = predicateOf(leg.where, schema, deps.ctx);
    if (said.bad.length) {
      refusals.push(said.bad[0]!);
      continue;
    }
    const w = compile(said.predicate, schema);
    if (w.bad.length) {
      refusals.push(w.bad[0]!);
      continue;
    }

    /* A CYCLE IS A WHOLE NUMBER OF MONTHS, checked once for the leg rather than per row. A fraction
       collapses successive occurrences onto one day through `Math.round`, so a fortnightly £100
       declared as `0.5` charges twice on the sixth of three months and nothing in between. */
    const fraction = leg.every ? Object.entries(leg.every.months).find(([, n]) => !Number.isInteger(n)) : undefined;
    if (fraction) {
      refusals.push({
        code: 'VALUE_MALFORMED',
        /* `is set to` AND NOT `declares`, WHICH IS THE BROWSER'S WORDING FOR THE SAME REFUSAL.
           `19 §9` is that the product speaks the reader's words, and `declares` is the format's word
           for itself. The browser's copy of this walk was reworded and this one was not, which put
           two sentences on one refusal one commit after the pass whose whole subject was the two
           engines agreeing. Nothing compares the strings, so it was silent. */
        fix: `${leg.register} is set to a cycle of ${fraction[1]} months for ${fraction[0]}, and a cycle is a whole number of months.`,
        at: 'every',
      });
      continue;
    }

    const title = deps.titleOf(leg.register) ?? leg.on;
    /* THE CAP REFUSES, IT DOES NOT TRUNCATE. A walk that quietly dropped the five hundredth
       obligation would still report a crossing day, and a crossing day computed from most of the
       money is the one number in this module that must never be approximately right. */
    const rows = deps.sql.all<{ id: string }>(
      `SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL AND (${w.sql}) ORDER BY rowid LIMIT ${CAP + 1}`,
      leg.register,
      ...w.params,
    );
    if (rows.length > CAP) {
      refusals.push({
        code: 'OUT_OF_BOUNDS',
        fix: `${leg.register} matches more than ${CAP.toLocaleString('en-GB')} rows, which is more than one walk can carry — narrow what this leg reads.`,
        at: 'where',
      });
      continue;
    }

    let unreadable = 0;
    /* A LEG WHOSE AMOUNT IS NOT MONEY MUST SAY SO. `amount === null → continue` skipped the row in
       silence and only unreadable DATES were counted, so a leg pointing at an `int` or a `duration`
       field produced no steps and no refusals — and the page said nothing crosses zero, which is
       the one answer a cash walk must never give wrongly. */
    let notMoney = 0;
    /* A ROW THAT RAN OUT OF OCCURRENCES BEFORE THE HORIZON DID. See `EVERY_CAP`: this used to be a
       silent `break` in the middle of the money. */
    let truncated = 0;
    for (const { id } of rows) {
      const entry = deps.hydrate(id);
      if (!entry) continue;
      const money = entry.fields[leg.amount];
      if (money !== undefined && money !== null && !isMoney(money)) {
        notMoney++;
        continue;
      }
      const amount = isMoney(money) ? money.amount : null;
      if (amount === null || amount === 0) continue;
      if (isMoney(money)) seen.add(money.currency);

      const first = String(entry.fields[leg.on] ?? '');
      if (!first) continue;
      if (!Number.isFinite(noon(first))) {
        unreadable++;
        continue;
      }
      const incoming = leg.incoming ? entry.fields[leg.incoming.field] === leg.incoming.is : false;
      const label = String(entry.fields[title] ?? entry.id);
      const spoken = entry.seq === null ? entry.id : `${leg.register}#${entry.seq}`;

      const recurs = occurrences(deps, entry, leg, dayOf(first), until, iso(deps.ctx.nowMs));
      if (recurs.capped) truncated++;
      for (const { day, at } of recurs.of) {
        /* CLAMPED TO TODAY, not dropped. The walk stays in order and a balance that is already gone
           is gone at the top of it; the label says which rows those are. */
        /* BY THE DAY, NOT BY NOON UTC. `at < now` made a bill due today overdue from 12:00 UTC, while
           `due before today` on the same record still excluded it: two answers about one row. */
        const late = day < iso(deps.ctx.nowMs);
        movements.push({
          at: late ? deps.ctx.nowMs : at,
          step: {
            day: late ? iso(deps.ctx.nowMs) : day,
            label: `${label}${late ? ' · overdue' : ''}`,
            delta: incoming ? amount : -amount,
            source: leg.register,
            spoken,
          },
        });
      }
    }

    /* ONE SENTENCE PER LEG, not one per row. A leg whose date field holds something this walk cannot
       read is money missing from the answer, and money missing in silence is the failure the
       refusals list exists for. */
    if (unreadable)
      refusals.push({
        code: 'VALUE_MALFORMED',
        fix: `${unreadable} ${unreadable === 1 ? 'row' : 'rows'} of ${leg.register} have a ${leg.on} this walk could not read, and their money is not in it.`,
        at: 'on',
      });
    if (notMoney)
      refusals.push({
        code: 'VALUE_MALFORMED',
        fix: `${leg.register}.${leg.amount} is not money in ${notMoney} ${notMoney === 1 ? 'row' : 'rows'}, and a walk adds money. Point this leg at an amount.`,
        at: 'amount',
      });
    /* THE SAME SENTENCE THE ROW CAP GIVES, for the same reason: a crossing day computed from most of
       the money is worse than no crossing day, because it is the answer wearing the shape of one. */
    if (truncated)
      refusals.push({
        code: 'OUT_OF_BOUNDS',
        fix: `${truncated} ${truncated === 1 ? 'row' : 'rows'} of ${leg.register} recur more than ${EVERY_CAP} times before this horizon ends, and the rest of their money is not in the walk. Shorten the horizon.`,
        at: 'every',
      });
  }

  const mixed = seen.size > 1 ? [...seen].sort() : [];
  const currency = mixed.length ? null : ([...seen][0] ?? null);
  if (mixed.length)
    return {
      ok: true,
      value: {
        from: opening,
        currency,
        mixed,
        steps: [],
        crossed: null,
        days: null,
        horizon: horizonDays,
        refusals: [
          {
            code: 'MIXED_CURRENCY',
            fix: `this walk reads ${mixed.join(' and ')}, and a crossing day computed across two currencies is a date on which nothing happens`,
            at: 'from',
          },
        ],
      },
    };

  /* BY DAY, THEN OUTGOINGS BEFORE INCOMINGS ON THE SAME DAY. A balance that dips below zero at
     breakfast and recovers by lunchtime has still bounced, and a walk that pays you first hides
     exactly the day you needed to see. */
  const moving = movements.filter((m) => m.step.delta !== 0).sort((a, b) => a.at - b.at || a.step.delta - b.step.delta);

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
    ok: true,
    value: {
      from: opening,
      currency,
      mixed,
      steps,
      crossed,
      days: crossed ? Math.round((noon(crossed.day) - deps.ctx.nowMs) / DAY_MS) : null,
      horizon: horizonDays,
      refusals,
    },
  };
}

/**
 * The days one row's movement lands on inside the window.
 *
 * BY CALENDAR MONTH, CLAMPED. `resolveDay('+3m')` is the same arithmetic the predicate grammar uses,
 * so a monthly charge on the 31st does not drift backwards through the year — and the two places
 * that step a month agree because they are one function.
 */
function occurrences(
  deps: ForecastDeps,
  entry: Entry,
  leg: Leg,
  first: string,
  until: number,
  today: string,
): { of: { day: string; at: number }[]; capped: boolean } {
  const start = noon(first);
  if (!Number.isFinite(start)) return { of: [], capped: false };
  const months = leg.every ? (leg.every.months[String(entry.fields[leg.every.field] ?? '')] ?? 0) : 0;
  if (!months) return { of: start <= until ? [{ day: first, at: start }] : [], capped: false };

  /* A CYCLE BEFORE TODAY HAS ALREADY BEEN CHARGED. `renews` is an anchor nobody moves on, and the
     walk started at it and clamped every past cycle to today as overdue: a monthly service anchored
     three months back charged four times on day one, and one anchored in 2020 hit the cap on a
     30-day horizon. The reminder engine skips past occurrences for the same reason (`expandRepeat`'s
     `skipPast`). Skipped cycles are not counted against the cap. */
  const out: { day: string; at: number }[] = [];
  let n = 0;
  for (; out.length < EVERY_CAP && n < SKIP_CAP; n++) {
    const day = n === 0 ? first : resolveDay(`+${Math.round(months * n)}m`, start);
    if (!day) break;
    const at = noon(day);
    if (at > until) break;
    if (day < today) continue;
    out.push({ day, at });
  }
  /* AND THE CAP IS REPORTED RATHER THAN TAKEN. Running out of occurrences while the horizon still
     has room is money missing from the answer, and the caller has to be able to tell that from a
     leg that simply ends. */
  return { of: out, capped: out.length === EVERY_CAP || n === SKIP_CAP };
}

/**
 * MONEY, AND NOT MERELY THE SHAPE OF IT.
 *
 * This tested that the two keys were PRESENT and never what was under them, so a `json` field
 * holding `{ amount: '500', currency: 'GBP' }` walked straight through: `delta` came out as the
 * string `"500"`, the running balance became `"100000500"` by concatenation rather than
 * £1,005.00 by addition, and every `balance < 0` after it was a string comparison. This is the guard
 * the `notMoney` counter exists to feed, so a value it waved through was money missing from the
 * answer with nothing said about it, which is the one thing a cash walk must never do.
 *
 * A FINITE NUMBER, because `NaN` and `Infinity` are both numbers and neither is an amount: `NaN`
 * poisons the whole running balance and never compares true against zero, so a walk carrying one
 * reports that nothing crosses.
 */
const isMoney = (v: unknown): v is { amount: number; currency: string } =>
  typeof v === 'object' &&
  v !== null &&
  'amount' in v &&
  'currency' in v &&
  typeof (v as { amount: unknown }).amount === 'number' &&
  Number.isFinite((v as { amount: number }).amount) &&
  typeof (v as { currency: unknown }).currency === 'string';
