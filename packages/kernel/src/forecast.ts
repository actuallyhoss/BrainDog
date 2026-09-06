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

export function runway(deps: ForecastDeps, opening: number, legs: readonly Leg[], horizonDays = 180): Result<Runway> {
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
        fix: `${leg.register} declares a cycle of ${fraction[1]} months for ${fraction[0]}, and a cycle is a whole number of months.`,
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

      for (const { day, at } of occurrences(deps, entry, leg, dayOf(first), until)) {
        /* CLAMPED TO TODAY, not dropped. The walk stays in order and a balance that is already gone
           is gone at the top of it; the label says which rows those are. */
        const late = at < deps.ctx.nowMs;
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
): { day: string; at: number }[] {
  const start = noon(first);
  if (!Number.isFinite(start)) return [];
  const months = leg.every ? (leg.every.months[String(entry.fields[leg.every.field] ?? '')] ?? 0) : 0;
  if (!months) return start <= until ? [{ day: first, at: start }] : [];

  const out: { day: string; at: number }[] = [];
  for (let n = 0; n < 64; n++) {
    const day = n === 0 ? first : resolveDay(`+${Math.round(months * n)}m`, start);
    if (!day) break;
    const at = noon(day);
    if (at > until) break;
    out.push({ day, at });
  }
  return out;
}

const isMoney = (v: unknown): v is { amount: number; currency: string } =>
  typeof v === 'object' && v !== null && 'amount' in v && 'currency' in v;
