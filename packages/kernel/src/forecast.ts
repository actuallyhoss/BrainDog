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
import { convertMinor, homeFrom, rateFor, rateIsStale } from './fx.ts';
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
  /**
   * A movement that recurs: a field naming a cycle, and what each of its values means.
   *
   * THREE TABLES, BECAUSE THREE KINDS OF CYCLE DO NOT REDUCE TO ONE. A week is not a whole number of months, and a
   * fortnightly salary written as half a month lands twice on one day and never in between (the fraction refusal in
   * `cyclesWrong`). So `months` counts calendar months (`monthly: 1`, `yearly: 12`), `weeks` counts seven-day weeks
   * (`weekly: 1`, `fortnightly: 2`), and `twice` names the two days of every month a movement lands on
   * (`twice_monthly: [1, 15]`). A value none of them names walks once and is said; a value two of them name is
   * refused, because the walk would have to guess which one the person meant.
   */
  every?: {
    field: string;
    months?: Record<string, number>;
    weeks?: Record<string, number>;
    twice?: Record<string, [number, number]>;
  };
  /**
   * The field holding the last day a row's money moves on. Nothing after it is walked; a step on the day itself is.
   *
   * A LEG HAD NO END, SO A REPEATING ROW WALKED FOR EVER UNTIL SOMETHING CLOSED IT. An importer that closes a line only
   * the night after its `ends_on` passes leaves a gap, and until then a salary ending on 20 October walked 15 November,
   * 15 December and every month to the horizon: measured in `test/forecast-ends.test.ts`, a USD 1,000.00 monthly line
   * read USD 12,000.00 over a 365-day walk where the source itself counts one cheque. A runway too high is the one
   * direction this walk must never be wrong in.
   *
   * THE LAST PAYDAY, NOT THE LAST DAY WORKED, because that is what an `ends_on` means where it is set from: the source
   * drops a payday strictly after `ends_on` and keeps one on it, labels the field "Until", and adds no final cheque
   * after the day. So the end is inclusive and it bounds the day money moves, which is the only day this walk knows
   * about. An empty value is no end.
   */
  ends?: string;
  /**
   * The field naming what a row's movement is part of: the plan an instalment belongs to. Each step then says it
   * (`Step.of`), so the forecast's control that counts a plan in or out moves every part of it together.
   *
   * A LABEL COULD NOT DO THIS, because the parts of one plan are titled `Proofing press, 3 of 8` and every part is a
   * different word. Only a non-empty text value is a name: a number or an empty field groups nothing, rather than
   * putting every such row into one plan called nothing.
   */
  group?: string;
};

export type Runway = {
  from: number;
  currency: string | null;
  mixed: readonly string[];
  /** Set when movements in another currency were converted into `currency`: the newest rate's day. */
  converted?: { asOf: string; forward: boolean; stale: boolean };
  /** Set when a home currency is chosen and a movement could not be converted into it: each pair, `USD to EGP`. */
  missing?: string[];
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
  /**
   * The currency the movement was written in, set only when it was converted into the walk's: `USD` on a salary walked
   * in EGP. The forecast's rate drift moves exactly these steps and no others: measured before it existed, a 10% drift
   * on USD to EGP could not tell a USD salary from EGP rent, and moved neither.
   */
  from?: string;
  /** What the movement is part of, from the leg's `group` field, set only when the leg names one and the row fills it. */
  of?: string;
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

/** The last day of the month a `YYYY-MM-DD` day falls in: day zero of the month after it, at noon. */
const endOfMonth = (day: string): string => iso(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0, 12));

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
 * SIX HUNDRED, BECAUSE EVERY CYCLE A LEG CAN NAME FITS UNDER IT FOR THE LONGEST HORIZON A BLOCK MAY
 * ASK FOR. Sixty-four months is five years and four months, so a monthly salary on a ten-year walk
 * lost its last five years to the cap's sentence, and the ordinary answer to "to the end" was that
 * sentence. The shortest cycle is now a week, and a walk of `HORIZON_CAP` days holds at most 522
 * weekly steps and 120 monthly ones. It stays a cap rather than going, because it is also what
 * bounds the work: at most this many steps for each of the `CAP` rows a leg reads.
 */
const EVERY_CAP = 600;
/**
 * How many cycles a walk steps through at most, past ones included: a monthly anchor a century back or a weekly one
 * twenty years back, each with the ten years of `HORIZON_CAP` still to walk.
 */
const SKIP_CAP = EVERY_CAP + 1_200;

/** How far a walk looks when nobody said, and when `'last'` finds no dated end to walk to. */
const HORIZON_DEFAULT = 180;

/**
 * The furthest ahead a walk may be asked to look, in days.
 *
 * `horizon` ARRIVES ON A BLOCK AND WAS VALIDATED BY NOTHING. It multiplies into a timestamp and
 * feeds the recurrence loop, so a number somebody typed in a declaration decided how much work this
 * function does. Ten years is longer than any cash question a person actually asks and short enough
 * that the loop above stays a loop.
 */
const HORIZON_CAP = 3650;

/** Which movements a walk reads: one currency's, unconverted, or every one but those in `except`, converted as usual. */
export type Only = string | { except: readonly string[] };

/** One row a leg admitted, read once and walked once the horizon is known. `first` and `last` are ten-character days. */
type Held = {
  first: string;
  last: string | null;
  cadence: Cadence;
  /** The cycle value no table of the leg names, which walks once and is said. */
  unread: string | null;
  amount: number;
  currency: string;
  incoming: boolean;
  label: string;
  spoken: string;
  of: string | null;
};

/** What one leg read: the sentence that stopped it, or its rows and a count of each thing it could not read. */
type LegRead = { leg: Leg; stopped: Refusal | null; rows: Held[]; unreadable: number; unreadableEnd: number; notMoney: number };

/**
 * Walk the legs.
 *
 * `opening` is what is liquid TODAY and it is a number somebody has to supply: a runway seeded from
 * a balance nobody declared is a forecast that looks like a fact and is a guess.
 *
 * `horizonDays` is a whole number of days, or `'last'`: to the last dated movement (`lastOf`).
 *
 * `into` IS A CURRENCY SOMEBODY ASKED TO SEE THE WALK IN, in place of the home one: every movement in another currency is
 * converted at the rate as of its own day, and a pair with no rate is named in `missing`, exactly as a walk into the
 * home currency is. A walk of one currency (`only` as a string) is never converted, so it ignores `into`.
 */
export function runway(
  deps: ForecastDeps,
  opening: number,
  legs: readonly Leg[],
  horizonDays: number | 'last' = HORIZON_DEFAULT,
  only?: Only,
  into?: string,
): Result<Runway> {
  /* THE HORIZON IS A NUMBER SOMEBODY TYPED IN A DECLARATION, and it was multiplied into a timestamp
     with nothing checked. A refusal is a value here as everywhere else, so a horizon this walk
     cannot carry is a sentence rather than a walk that quietly stops early or a loop that does not
     end. */
  if (horizonDays !== 'last' && (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > HORIZON_CAP))
    return no<Runway>(
      'OUT_OF_BOUNDS',
      `A horizon is a whole number of days between 1 and ${HORIZON_CAP.toLocaleString('en-GB')}, or last for the last dated movement, and this one is ${JSON.stringify(horizonDays)}.`,
      { at: 'horizon' },
    );
  /* A CURRENCY TO WALK IN IS A CODE, checked like the horizon. Read as "no currency asked" it would walk in the home
     currency under a chip that says another one, and nothing on the screen would tell the two apart. */
  const asked = into === undefined ? null : homeFrom(into);
  if (into !== undefined && asked === null)
    return no<Runway>('VALUE_MALFORMED', `A currency to walk in is a three-letter code, and this one is ${JSON.stringify(into)}.`, { at: 'into' });
  const today = iso(deps.ctx.nowMs);
  const refusals: Refusal[] = [];
  const movements: { at: number; currency: string; step: Omit<Step, 'balance'> }[] = [];
  const seen = new Set<string>();

  /* THE ROWS ARE READ BEFORE ANY IS WALKED, because `'last'` is a horizon only the rows can say: the walk cannot know
     where it ends until it has seen the last dated movement of every leg. Each leg's sentences still come out in the
     leg's own order below, as they did when reading and walking were one loop. */
  const reads: LegRead[] = [];
  for (const leg of legs) {
    const read: LegRead = { leg, stopped: null, rows: [], unreadable: 0, unreadableEnd: 0, notMoney: 0 };
    reads.push(read);
    const schema = deps.schemaOf(leg.register);
    if (!schema) {
      read.stopped = { code: 'REGISTER_UNKNOWN', fix: `There is no register called ${leg.register}.`, at: 'from' };
      continue;
    }
    const said = predicateOf(leg.where, schema, deps.ctx);
    if (said.bad.length) {
      read.stopped = said.bad[0]!;
      continue;
    }
    const w = compile(said.predicate, schema);
    if (w.bad.length) {
      read.stopped = w.bad[0]!;
      continue;
    }

    const wrong = cyclesWrong(leg);
    if (wrong) {
      read.stopped = wrong;
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
      read.stopped = {
        code: 'OUT_OF_BOUNDS',
        fix: `${leg.register} matches more than ${CAP.toLocaleString('en-GB')} rows, which is more than one walk can carry. Narrow what this leg reads.`,
        at: 'where',
      };
      continue;
    }

    for (const { id } of rows) {
      const entry = deps.hydrate(id);
      if (!entry) continue;
      const money = entry.fields[leg.amount];
      /* A LEG WHOSE AMOUNT IS NOT MONEY MUST SAY SO. `amount === null → continue` skipped the row in
         silence and only unreadable DATES were counted, so a leg pointing at an `int` or a `duration`
         field produced no steps and no refusals, and the page said nothing crosses zero, which is
         the one answer a cash walk must never give wrongly. */
      if (money !== undefined && money !== null && !isMoney(money)) {
        read.notMoney++;
        continue;
      }
      if (!isMoney(money) || money.amount === 0) continue;
      seen.add(money.currency);

      const first = String(entry.fields[leg.on] ?? '');
      if (!first) continue;
      if (!Number.isFinite(noon(first))) {
        read.unreadable++;
        continue;
      }
      /* AN END THIS WALK CANNOT READ IS COUNTED AND THE ROW LEFT OUT, the way an unreadable first day is. Walked with no
         end it would be the repeating-for-ever this field exists to stop, and nothing on the screen would say so. */
      const last = leg.ends ? String(entry.fields[leg.ends] ?? '') : '';
      if (last && !Number.isFinite(noon(last))) {
        read.unreadableEnd++;
        continue;
      }
      const part = leg.group ? entry.fields[leg.group] : undefined;
      const cycle = leg.every ? String(entry.fields[leg.every.field] ?? '') : '';
      read.rows.push({
        first: dayOf(first),
        last: last ? dayOf(last) : null,
        ...cadenceOf(leg.every, cycle),
        amount: money.amount,
        currency: money.currency,
        incoming: leg.incoming ? entry.fields[leg.incoming.field] === leg.incoming.is : false,
        label: String(entry.fields[title] ?? entry.id),
        spoken: entry.seq === null ? entry.id : `${leg.register}#${entry.seq}`,
        of: typeof part === 'string' && part.trim() !== '' ? part.trim() : null,
      });
    }
  }

  const horizon = horizonDays === 'last' ? lastOf(reads, deps.ctx.nowMs, today) : horizonDays;
  const until = deps.ctx.nowMs + horizon * DAY_MS;

  for (const { leg, stopped, rows, unreadable, unreadableEnd, notMoney } of reads) {
    if (stopped) {
      refusals.push(stopped);
      continue;
    }
    /* A ROW THAT RAN OUT OF OCCURRENCES BEFORE THE HORIZON DID. See `EVERY_CAP`: this used to be a
       silent `break` in the middle of the money. */
    let truncated = 0;
    /* EACH CYCLE VALUE THE LEG'S TABLES DO NOT NAME, AND HOW MANY ROWS CARRY IT. See `cadenceOf`:
       these rows are walked once, and this is what lets the walk say that the rest is missing. */
    const unread = new Map<string, number>();
    for (const row of rows) {
      const recurs = occurrences(row, until, today);
      if (recurs.capped) truncated++;
      /* ONLY A ROW WITH A STEP INSIDE THE WINDOW: one whose first day is past the horizon is missing
         nothing from this walk, whatever its cycle. */
      if (row.unread !== null && recurs.of.length) unread.set(row.unread, (unread.get(row.unread) ?? 0) + 1);
      for (const { day, at } of recurs.of) {
        /* CLAMPED TO TODAY, not dropped. The walk stays in order and a balance that is already gone
           is gone at the top of it; the label says which rows those are. */
        /* BY THE DAY, NOT BY NOON UTC. `at < now` made a bill due today overdue from 12:00 UTC, while
           `due before today` on the same record still excluded it: two answers about one row. */
        const late = day < today;
        movements.push({
          at: late ? deps.ctx.nowMs : at,
          currency: row.currency,
          step: {
            day: late ? today : day,
            label: `${row.label}${late ? ' · overdue' : ''}`,
            delta: row.incoming ? row.amount : -row.amount,
            source: leg.register,
            spoken: row.spoken,
            ...(row.of !== null ? { of: row.of } : {}),
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
    if (unreadableEnd)
      refusals.push({
        code: 'VALUE_MALFORMED',
        fix: `${unreadableEnd} ${unreadableEnd === 1 ? 'row' : 'rows'} of ${leg.register} ${unreadableEnd === 1 ? 'has an end in' : 'have ends in'} ${leg.ends} that this walk could not read, and ${unreadableEnd === 1 ? 'its' : 'their'} money is not in it.`,
        at: 'ends',
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
    /* A CYCLE THE LEG HAS NO FACTOR FOR, IN THE SAME SHAPE AS `truncated` ABOVE, one sentence per value.
       Driven before this existed: a £100 bill with `repeats: weekly` on a leg naming only `monthly`
       walked as one step of minus 10,000 and no refusal at all, and a 60-day window holds eight or
       nine of it. `LOOKUP_MISSING` is the metrics engine's code for the same gap in a factor table
       (`metrics.ts`, "has no factor for"), and `allowed` says which cycles the leg does read, from
       all three of its tables.

       THE SENTENCE STILL SAYS MONTHS, the table every leg had before `weeks` and `twice`, and
       `forecast-unknown-cycle.test.ts` holds it word for word. */
    for (const [value, n] of [...unread].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      refusals.push({
        code: 'LOOKUP_MISSING',
        fix: `${n} ${n === 1 ? 'row' : 'rows'} of ${leg.register} ${n === 1 ? 'has' : 'have'} ${leg.every!.field} set to ${value}, which this walk has no cycle for, and ${n === 1 ? 'its' : 'their'} money is in the walk once rather than every time it recurs. Give ${value} a whole number of months on this leg, or set the ${n === 1 ? 'row' : 'rows'} to a cycle the leg has.`,
        at: 'every',
        allowed: cyclesOf(leg.every!),
      });
  }

  /* MOVEMENTS IN ANOTHER CURRENCY ARE CONVERTED INTO THE HOME ONE, OR THE ONE `into` ASKS FOR, each at the rate as of
     the day it happens, a day ahead at the newest rate there is (`fx.ts`). A walk that cannot convert one of them says
     which rate it lacks. */
  /* ONE CURRENCY OF A WALK DRAWN ONCE PER CURRENCY (`only`): that currency's movements, as they are, and never converted. */
  if (typeof only === 'string') {
    for (let i = movements.length - 1; i >= 0; i -= 1) if (movements[i]!.currency !== only) movements.splice(i, 1);
    seen.clear();
    seen.add(only);
  }
  /* AND THE HOME WALK BESIDE THEM (`except`): every movement but those in a currency with no rate, which walk on their own. */
  if (only !== undefined && typeof only !== 'string') {
    for (let i = movements.length - 1; i >= 0; i -= 1) if (only.except.includes(movements[i]!.currency)) movements.splice(i, 1);
    for (const c of only.except) seen.delete(c);
  }
  const held = typeof only === 'string' ? { home: null, rates: [] } : (deps.ctx.fx?.() ?? { home: null, rates: [] });
  let mixed = seen.size > 1 ? [...seen].sort() : [];
  let currency = mixed.length ? null : ([...seen][0] ?? null);
  let converted: Runway['converted'];
  /* THE CURRENCY ASKED FOR, ELSE THE HOME ONE, and neither for a walk of one currency, which is never converted. */
  const walkIn = typeof only === 'string' ? null : (asked ?? held.home);
  if (walkIn !== null && seen.size > 0 && (mixed.length || currency !== walkIn)) {
    const missing = new Set<string>();
    let asOf = '';
    let forward = false;
    for (const m of movements) {
      if (m.currency === walkIn) continue;
      const r = rateFor(held.rates, m.currency, walkIn, m.step.day);
      if (!r) {
        missing.add(`${m.currency} to ${walkIn}`);
        continue;
      }
      m.step = { ...m.step, delta: convertMinor(m.step.delta, m.currency, walkIn, r.rate), from: m.currency };
      /* THE OLDEST, not the newest: a runway is only as current as the stalest rate under it.
         See `Across.converted` in `fx.ts` for why all three folds had this the wrong way round. */
      if (asOf === '' || r.as_of < asOf) asOf = r.as_of;
      forward ||= r.forward;
    }
    if (missing.size === 0) {
      mixed = [];
      currency = walkIn;
      converted = { asOf, forward, stale: asOf !== '' && rateIsStale(asOf, today) };
    }
    if (missing.size)
      return {
        ok: true,
        value: {
          from: opening,
          currency: null,
          mixed: [...seen].sort(),
          missing: [...missing].sort(),
          steps: [],
          crossed: null,
          days: null,
          horizon,
          refusals: [
            {
              code: 'MIXED_CURRENCY',
              fix: `this walk reads ${[...seen].sort().join(' and ')} and adds it up in ${walkIn}, and there is no rate yet from ${[...missing].sort().map((p) => p.split(' to ')[0]).join(' or ')} to ${walkIn}`,
              at: 'from',
            },
          ],
        },
      };
  }
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
        horizon,
        refusals: [
          {
            code: 'MIXED_CURRENCY',
            fix: `this walk reads ${mixed.join(' and ')}, and a crossing day computed across two currencies is a date on which nothing happens. Set a home currency and rates into it to walk them as one`,
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
      ...(converted ? { converted } : {}),
      steps,
      crossed,
      days: crossed ? Math.round((noon(crossed.day) - deps.ctx.nowMs) / DAY_MS) : null,
      horizon,
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
 *
 * EXCEPT AT A MONTH END ON A CYCLE THAT IS NOT WHOLE YEARS, where the day moves to each later
 * month's last day (`stepsOf`).
 *
 * A WEEK IS SEVEN DAYS AND TWICE A MONTH IS TWO NAMED DAYS, each stepped by `stepsOf` below.
 */
function occurrences(row: Held, until: number, today: string): { of: { day: string; at: number }[]; capped: boolean } {
  const { first, last, cadence } = row;
  const start = noon(first);
  if (!Number.isFinite(start)) return { of: [], capped: false };
  /* A ROW ENDED BEFORE ITS FIRST DAY WALKS NOTHING, one-off or not: see `Leg.ends`. An import can write a monthly row
     due 1 October for a line that ends on 28 September when the next payday is past the end, and that row is no cheque.
     */
  if (last !== null && first > last) return { of: [], capped: false };
  if (cadence === null) return { of: start <= until ? [{ day: first, at: start }] : [], capped: false };

  /* A CYCLE BEFORE TODAY HAS ALREADY BEEN CHARGED. `renews` is an anchor nobody moves on, and the
     walk started at it and clamped every past cycle to today as overdue: a monthly service anchored
     three months back charged four times on day one, and one anchored in 2020 hit the cap on a
     30-day horizon. The reminder engine skips past occurrences for the same reason (`expandRepeat`'s
     `skipPast`). Skipped cycles are not counted against `EVERY_CAP`, only against `SKIP_CAP`. */
  const days = stepsOf(first, start, cadence);
  const out: { day: string; at: number }[] = [];
  let n = 0;
  for (; out.length < EVERY_CAP && n < SKIP_CAP; n++) {
    const next = days.next();
    const day = next.done ? null : next.value;
    if (!day) break;
    const at = noon(day);
    /* PAST THE ROW'S LAST DAY IS THE SAME STOP AS PAST THE HORIZON, and it is a stop and not the cap, so `capped` below
       stays false for a line that simply ended. */
    if (at > until || (last !== null && day > last)) break;
    if (day < today) continue;
    out.push({ day, at });
  }
  /* AND THE CAP IS REPORTED RATHER THAN TAKEN. Running out of occurrences while the horizon still
     has room is money missing from the answer, and the caller has to be able to tell that from a
     leg that simply ends. */
  return { of: out, capped: out.length === EVERY_CAP || n === SKIP_CAP };
}

/**
 * Every day a repeating row's money moves on, from its first day on, in order and without end: `occurrences` stops
 * reading at the horizon, the row's end or a cap, so nothing here has to. `null` is a day the calendar could not step to.
 */
function* stepsOf(first: string, start: number, cadence: NonNullable<Cadence>): Generator<string | null, void, undefined> {
  yield first;
  if (cadence.kind === 'weeks') {
    /* SEVEN DAYS AT A TIME FROM NOON ON THE FIRST DAY, so a month end or a leap day is simply a day the count passes
       through: a weekly row from 22 February 2028 lands on the 29th and then on 7 March. */
    for (let n = 1; ; n++) yield iso(start + n * cadence.weeks * 7 * DAY_MS);
  }
  if (cadence.kind === 'twice') {
    /* THE ROW'S OWN DAY FIRST, THEN THE TWO NAMED DAYS OF EVERY MONTH AFTER IT. A row due on the 3rd on a cycle of the
       1st and the 15th moves on the 3rd because that is the day somebody wrote on it, and on the 15th and the 1st after
       that. A named day past a month's end is its last day, so `[15, 31]` is the 15th and the end of every month, and
       29 February in a leap year. */
    const [a, b] = cadence.days;
    const year = Number(first.slice(0, 4));
    const month = Number(first.slice(5, 7)) - 1;
    for (let k = 0; ; k++)
      for (const named of [a, b]) {
        const length = new Date(Date.UTC(year, month + k + 1, 0)).getUTCDate();
        const day = iso(Date.UTC(year, month + k, Math.min(named, length), 12));
        if (day > first) yield day;
      }
  }
  /* A FIRST DAY THAT IS ITS MONTH'S LAST DAY IS "THE END OF THE MONTH", NOT A DAY NUMBER. The clamp
     alone stepped a bill due 30 September to 30 October and 30 December, a day short of those
     months' ends, and one due 28 February to the 28th of every month after it. `resolveDay` still
     picks the month, so the cycle's length is untouched, and only the day inside it moves to the
     end. A first day that is not a month end steps exactly as before.

     AN `instant` IS NOT EXEMPT. `runway` holds a row's first day as `dayOf(first)`, the instant's
     first ten characters, so an instant on a month's last day is a month end here exactly as a `day` is.

     EXCEPT ON A CYCLE OF WHOLE YEARS, which never leaves the month it started in. Measured: a yearly bill taken on 28
     February 2027 was walked to 29 February 2028: an annual renewal falls on its anniversary, and the anniversary of
     the 28th is the 28th. February is the only month whose length changes from one year to the next, so it is the only
     one where the two readings differ, and the clamp in `resolveDay` already gives a leap-day start the reading a
     person means: 28 February in a common year and 29 February again in the next leap year. A cycle that is not a whole
     number of years does leave February, and there the end of February is still the end of August or May. */
  if (cadence.kind === 'months') {
    const monthEnd = cadence.months % 12 !== 0 && endOfMonth(first) === first;
    for (let n = 1; ; n++) {
      const stepped = resolveDay(`+${Math.round(cadence.months * n)}m`, start);
      yield stepped && monthEnd ? endOfMonth(stepped) : stepped;
    }
  }
}

/** How a row repeats, once its cycle value has been looked up in the leg's tables. `null` walks once. */
type Cadence = { kind: 'months'; months: number } | { kind: 'weeks'; weeks: number } | { kind: 'twice'; days: readonly [number, number] } | null;

/**
 * What a row's cycle value means on a leg, and the value when no table names it.
 *
 * A ONE-OFF, AND SAID WHEN IT IS ONLY A ONE-OFF BECAUSE NO TABLE HAS A ROW FOR THE VALUE. `?? 0`
 * made `weekly` on a leg that names `monthly` indistinguishable from `none`, and the walk counted a
 * weekly bill once in silence. `none` and an empty value mean exactly "once", and every register
 * that repeats spells it that way (`obligations.repeats`), so those two stay quiet; a value a
 * table does name, even with a zero, is the declaration saying "once" on purpose. `hasOwn` rather
 * than `in`, because `in` would find `toString` on a row whose cycle was the word `toString`.
 *
 * A VALUE IS IN ONE TABLE AT MOST, which `cyclesWrong` refused before any row was read, so the order
 * the tables are asked in decides nothing.
 */
function cadenceOf(every: Leg['every'], cycle: string): { cadence: Cadence; unread: string | null } {
  if (!every) return { cadence: null, unread: null };
  if (every.months && Object.hasOwn(every.months, cycle)) {
    const months = every.months[cycle]!;
    return { cadence: months ? { kind: 'months', months } : null, unread: null };
  }
  if (every.weeks && Object.hasOwn(every.weeks, cycle)) {
    const weeks = every.weeks[cycle]!;
    return { cadence: weeks ? { kind: 'weeks', weeks } : null, unread: null };
  }
  if (every.twice && Object.hasOwn(every.twice, cycle)) return { cadence: { kind: 'twice', days: every.twice[cycle]! }, unread: null };
  return { cadence: null, unread: cycle !== '' && cycle !== 'none' ? cycle : null };
}

/** Every cycle value a leg's tables name, months first, for a refusal's `allowed`. */
const cyclesOf = (every: NonNullable<Leg['every']>): string[] => [
  ...Object.keys(every.months ?? {}),
  ...Object.keys(every.weeks ?? {}),
  ...Object.keys(every.twice ?? {}),
];

/** Two days of a month, each a whole number from 1 to 31, the earlier first. */
const isPair = (p: unknown): boolean =>
  Array.isArray(p) && p.length === 2 && Number.isInteger(p[0]) && Number.isInteger(p[1]) && p[0] >= 1 && p[1] <= 31 && p[0] < p[1];

/**
 * The sentence a leg's cycle tables earn before any row is read, or `null` when they walk.
 *
 * CHECKED ONCE FOR THE LEG RATHER THAN PER ROW, because a table is the declaration's and every row
 * under it would be wrong the same way.
 */
function cyclesWrong(leg: Leg): Refusal | null {
  if (!leg.every) return null;
  const { months = {}, weeks = {}, twice = {} } = leg.every;
  /* A CYCLE OF MONTHS IS A WHOLE NUMBER OF MONTHS. A fraction collapses successive occurrences onto
     one day through `Math.round`, so a fortnightly £100 declared as `0.5` charges twice on the sixth
     of three months and nothing in between. A fortnight is `weeks: { fortnightly: 2 }`. */
  const fraction = Object.entries(months).find(([, n]) => !Number.isInteger(n));
  if (fraction)
    return {
      code: 'VALUE_MALFORMED',
      /* `is set to` AND NOT `declares`: `19 §9` is that the product speaks the reader's words, and
         `declares` is the format's word for itself. */
      fix: `${leg.register} is set to a cycle of ${fraction[1]} months for ${fraction[0]}, and a cycle is a whole number of months.`,
      at: 'every',
    };
  /* A WEEK IS COUNTED THE SAME WAY, and a negative count would step backwards into cycles already
     charged. */
  const week = Object.entries(weeks).find(([, n]) => !Number.isInteger(n) || n < 0);
  if (week)
    return {
      code: 'VALUE_MALFORMED',
      fix: `${leg.register} is set to a cycle of ${week[1]} weeks for ${week[0]}, and a cycle is a whole number of weeks.`,
      at: 'every',
    };
  const pair = Object.entries(twice).find(([, p]) => !isPair(p));
  if (pair)
    return {
      code: 'VALUE_MALFORMED',
      fix: `${leg.register} is set to twice a month on ${JSON.stringify(pair[1])} for ${pair[0]}, and twice a month is two different days from 1 to 31, the earlier first.`,
      at: 'every',
    };
  /* ONE VALUE IN TWO TABLES WOULD WALK BY WHICHEVER TABLE WAS ASKED FIRST, which is a guess the
     declaration did not make. */
  const named = cyclesOf(leg.every);
  const twiceNamed = named.find((v, i) => named.indexOf(v) !== i);
  if (twiceNamed !== undefined)
    return {
      code: 'VALUE_MALFORMED',
      fix: `${leg.register} gives ${twiceNamed} more than one cycle, and the walk cannot tell which one is meant. Name it in one of months, weeks and twice.`,
      at: 'every',
    };
  return null;
}

/**
 * How many days a walk to `'last'` looks ahead: to the furthest day a row's money is dated to move, capped at
 * `HORIZON_CAP`.
 *
 * A DATED ROW IS ONE THAT STOPS. A one-off moves on its own day and a repeating row with an end
 * moves for the last time on or before that end, so the furthest of those is where "to the end"
 * ends: the last instalment of a plan, the last payday of a contract. A repeating row with no end
 * has no last day, and letting it set the walk would make every record holding one salary walk the
 * whole of `HORIZON_CAP`, which is the longest choice and not the end of anything. It still walks
 * every step up to the day the others fix.
 *
 * NOTHING DATED FROM TODAY ON WALKS `HORIZON_DEFAULT`, because a walk of one day over rows that
 * repeat for ever would show nothing and read as an answer. `Runway.horizon` says which it was.
 */
function lastOf(reads: readonly LegRead[], nowMs: number, today: string): number {
  let furthest: string | null = null;
  for (const { rows } of reads)
    for (const row of rows) {
      if (row.last !== null && row.first > row.last) continue;
      const day = row.cadence === null ? row.first : row.last;
      if (day !== null && (furthest === null || day > furthest)) furthest = day;
    }
  if (furthest === null || furthest < today) return HORIZON_DEFAULT;
  return Math.min(HORIZON_CAP, Math.max(1, Math.ceil((noon(furthest) - nowMs) / DAY_MS)));
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
