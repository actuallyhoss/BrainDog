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
import { compile, jsonPath, resolveDay, type Schema } from '@braindog/where';

import type { Entry } from './index.ts';
import { convertMinor, homeFrom, rateFor, rateIsStale } from './fx.ts';
import { clockOf, predicateOf, type EvalContext } from './metrics.ts';

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
  /**
   * The field holding the days of the month a row's money moves on: a day from 1 to 31, `last`, or two of them,
   * `15, last` (`daysOf`). Set, the walk steps to those days of every month its cycle lands in; empty, it steps as the
   * cycle alone says, and twice a month falls back to the leg's table (the 1st and the 15th).
   *
   * A SALARY PAID TWICE A MONTH HAS DAYS, and they were one table for every row of every record: a line paid on the 15th
   * and the last day walked on the 1st and the 15th. And a line on the 30th typed in September read as "the end of the
   * month" and walked to 31 October. `last` is each month's own last day; `30` is the 30th, or the end of a shorter
   * month. The row's own first day still moves first, because that is the day somebody wrote on it.
   */
  days?: string;
  /**
   * The field holding what happens to a day that falls on one of the record's rest days (`ForecastDeps.restDays`):
   * `leave` it, the working day `before`, or the working day `after`. Empty is `leave`, which is a line as imported.
   */
  weekend?: string;
  /**
   * Set, this leg is EVERYDAY SPENDING: it walks none of its rows. It measures the money that went out of them in the
   * last full calendar months and moves a week's share of that each week to the horizon (`everydayOf`).
   *
   * THE WALK HELD ONLY ROWS WITH A DATE, so a record with a salary line and no bills climbed by the salary for ever.
   * What a card spends on food has no row ahead of it, and the only honest figure for it is what it has been.
   *
   * `register` is the list of moves, `on` the day a move happened, `amount` its money, `where` the filter (cleared, not
   * a transfer) and `incoming` what marks money in, which is left out. `months` is how many calendar months back to
   * measure, 3 when nobody says. `already` names the legs whose rows are in the walk already, so rent written as a
   * repeating line and also paid through the bank is not walked twice; absent, it is every other leg of this walk.
   */
  everyday?: { months?: number; already?: readonly Leg[] };
};

/**
 * What an everyday leg measured in one currency. `spent` is the average money out of the months counted, `planned` what
 * the walk already holds of it, and `monthly` what is moved: `spent` less `planned`, never under nought.
 */
export type Everyday = {
  /** `null` only when the list holds no dated money at all, so there is no currency to name. */
  currency: string | null;
  /** The months counted, oldest first, as `2026-07`: full months with money out in them. */
  months: string[];
  spent: number;
  planned: number;
  monthly: number;
  /** Set when nothing is moved: the sentence that says why. It is not a refusal, because the walk is whole without it. */
  why?: string;
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
  /**
   * How far the walk went, in days, when that is further than `horizon`: a forecast block opens on its `horizon:` and
   * walks to the longest of its `horizons:`, so the length control can offer every one of them (`pages.ts`). Absent when
   * the walk is the length it opens on.
   */
  reach?: number;
  /** Set when a leg is everyday spending: what it measured, one for each currency, in the currency's own money. */
  everyday?: Everyday[];
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
  /** Set on a week's share of everyday spending, which is measured and has no row of its own (`Leg.everyday`). */
  kind?: 'everyday';
};

export type ForecastDeps = {
  sql: Sql;
  schemaOf: (register: string) => Schema | null;
  titleOf: (register: string) => string | null;
  /**
   * A row of a list the walk has already read the ids of, by that list as well as its id, so the read names the list and a
   * walk over rows is held on the lists it walked (`notice`). Read by the id alone, it read past every list and no walk with
   * a row in it was held at all.
   */
  hydrate: (id: string, register: string) => Entry | null;
  ctx: EvalContext;
  /**
   * The record's rest days, as weekday numbers (0 Sunday to 6 Saturday), which a row's `weekend` rule moves a day off.
   * Absent, the walk reads the record's `rest_days` setting (`restDaysOf`), and Saturday and Sunday when none is set.
   */
  restDays?: readonly number[];
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

/** How many calendar months an everyday leg measures when it does not say, and the most it may ask for. */
const EVERYDAY_MONTHS = 3;
const EVERYDAY_MONTHS_CAP = 24;
/** What a week's share of everyday spending is called in the walk. */
const EVERYDAY_LABEL = 'Everyday spending';
const EVERYDAY_NO_MONTH = 'There is no full month of spending to measure yet, so everyday spending is not in this walk.';
const EVERYDAY_COVERED = 'What is already planned covers the spending measured, so nothing more is moved for everyday spending.';

/**
 * The furthest ahead a walk may be asked to look, in days.
 *
 * `horizon` ARRIVES ON A BLOCK AND WAS VALIDATED BY NOTHING. It multiplies into a timestamp and
 * feeds the recurrence loop, so a number somebody typed in a declaration decided how much work this
 * function does. Ten years is longer than any cash question a person actually asks and short enough
 * that the loop above stays a loop.
 */
export const HORIZON_CAP = 3650;

/**
 * How far a walk looks: a whole number of days, `'last'` for the last dated movement (`lastOf`), or `{ last: n }` for
 * the last dated movement and never fewer than `n` days, which is a block whose length control offers both `last` and a
 * length that may be the longer of the two (`walkReach` in `pages.ts`). `most` stops it there however far the last
 * movement is, for a walk nobody asked to go to the end (`WALK_UNASKED` in `pages.ts`); it is never less than `last`.
 */
export type Horizon = number | 'last' | { last: number; most?: number };

/** Where a `{ last, most }` walk stops at the furthest: `most` when it is a length no shorter than `last`, else `HORIZON_CAP`. */
const ceilingOf = (h: { last: number; most?: number }): number =>
  typeof h.most === 'number' && Number.isInteger(h.most) && h.most >= h.last && h.most <= HORIZON_CAP ? h.most : HORIZON_CAP;

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
  /** The days of the month from the leg's `days` field, or `null` when it is empty: the cycle alone steps. */
  named: readonly Named[] | null;
  /** Where a day on a rest day moves, from the leg's `weekend` field. */
  shift: Shift;
};

/** A day of the month a row names: a number from 1 to 31, or `'last'` for each month's own last day. */
type Named = number | 'last';
type Shift = 'leave' | 'before' | 'after';

/** What one leg read: the sentence that stopped it, or its rows and a count of each thing it could not read. */
type LegRead = {
  leg: Leg;
  stopped: Refusal | null;
  rows: Held[];
  unreadable: number;
  unreadableEnd: number;
  notMoney: number;
  /** Rows whose days this walk could not read, walked by their cycle alone. */
  unreadableDays: number;
  /** Rows whose days do not fit how often they repeat (one day on twice a month, two on a cycle of months), walked by
   *  their cycle alone. */
  daysOff: number;
};

/**
 * Walk the legs.
 *
 * `opening` is what is liquid TODAY and it is a number somebody has to supply: a runway seeded from
 * a balance nobody declared is a forecast that looks like a fact and is a guess.
 *
 * `horizonDays` is a whole number of days, `'last'`: to the last dated movement (`lastOf`), or both (`Horizon`).
 *
 * `into` IS A CURRENCY SOMEBODY ASKED TO SEE THE WALK IN, in place of the home one: every movement in another currency is
 * converted at the rate as of its own day, and a pair with no rate is named in `missing`, exactly as a walk into the
 * home currency is. A walk of one currency (`only` as a string) is never converted, so it ignores `into`.
 */
/**
 * The next moment a walk over nothing new answers differently, given the clock it walks by.
 *
 * A WALK'S WINDOW MOVES WITHIN A DAY. A step is at noon UTC of its day and the horizon is `nowMs` plus whole days, so a bill due
 * on the last day of the span comes into it at 12:00 UTC (`until`, `lastOf`), and `days` is rounded from the same noon, so the
 * count goes down one at 00:00 UTC. Those are the only two: every other comparison is of days. `Math.round` takes the half up, so
 * the very millisecond of midnight answers as the moment before it, and a walk read on it is good for that millisecond alone.
 */
export function walkMovesAt(nowMs: number): number {
  const half = DAY_MS / 2;
  const past = ((nowMs % half) + half) % half;
  return past === 0 ? nowMs + 1 : nowMs + (half - past);
}

export function runway(
  deps: ForecastDeps,
  opening: number,
  legs: readonly Leg[],
  horizonDays: Horizon = HORIZON_DEFAULT,
  only?: Only,
  into?: string,
): Result<Runway> {
  /* THE HORIZON IS A NUMBER SOMEBODY TYPED IN A DECLARATION, and it was multiplied into a timestamp
     with nothing checked. A refusal is a value here as everywhere else, so a horizon this walk
     cannot carry is a sentence rather than a walk that quietly stops early or a loop that does not
     end. */
  const days = typeof horizonDays === 'object' && horizonDays !== null ? horizonDays.last : horizonDays;
  if (days !== 'last' && (!Number.isInteger(days) || days < 1 || days > HORIZON_CAP))
    return no<Runway>(
      'OUT_OF_BOUNDS',
      `A horizon is a whole number of days between 1 and ${HORIZON_CAP.toLocaleString('en-GB')}, or last for the last dated movement, and this one is ${JSON.stringify(days)}.`,
      { at: 'horizon' },
    );
  /* A CURRENCY TO WALK IN IS A CODE, checked like the horizon. Read as "no currency asked" it would walk in the home
     currency under a chip that says another one, and nothing on the screen would tell the two apart. */
  const asked = into === undefined ? null : homeFrom(into);
  if (into !== undefined && asked === null)
    return no<Runway>('VALUE_MALFORMED', `A currency to walk in is a three-letter code, and this one is ${JSON.stringify(into)}.`, { at: 'into' });
  /* TODAY IS THE RECORD'S LOCAL DAY, as every `today` a predicate names is (`clockOf`). The UTC date of `nowMs` made a
     bill due yesterday in `Africa/Cairo` read as due today until 03:00 local time, and a walk drawn beside a list that
     already called it late. */
  const today = iso(clockOf(deps.ctx));
  deps.ctx.movesAt?.(walkMovesAt(deps.ctx.nowMs));
  const refusals: Refusal[] = [];
  const movements: { at: number; currency: string; step: Omit<Step, 'balance'> }[] = [];
  const seen = new Set<string>();
  /* ONE GROUP HOWEVER IT IS WRITTEN: parts that said "harbourview" beside parts that said
     "Harbourview" were two plans to count in or out, as they were two plans on Plans. A group is its name with no accents, in
     lower case, with one space between words, said as the oldest row read wrote it, which is what Money's plans script
     names the plan after. */
  const spelled = new Map<string, string>();
  const groupOf = (said: unknown): string | null => {
    if (typeof said !== 'string' || said.trim() === '') return null;
    const key = said.normalize('NFKD').replace(/\p{M}/gu, '').normalize('NFC').toLowerCase().replace(/\s+/gu, ' ').trim();
    if (!spelled.has(key)) spelled.set(key, said.trim().replace(/\s+/gu, ' '));
    return spelled.get(key)!;
  };

  /* THE ROWS ARE READ BEFORE ANY IS WALKED, because `'last'` is a horizon only the rows can say: the walk cannot know
     where it ends until it has seen the last dated movement of every leg. Each leg's sentences still come out in the
     leg's own order below, as they did when reading and walking were one loop. */
  /* ONE LEG READ, into the set of currencies it is told to count: the walk's own for a leg of the walk, and a set
     nobody reads for a leg an everyday leg names as already walked, whose rows are measured and not moved. */
  const readLeg = (leg: Leg, counted: Set<string>): LegRead => {
    const read: LegRead = { leg, stopped: null, rows: [], unreadable: 0, unreadableEnd: 0, notMoney: 0, unreadableDays: 0, daysOff: 0 };
    const schema = deps.schemaOf(leg.register);
    if (!schema) {
      read.stopped = { code: 'REGISTER_UNKNOWN', fix: `There is no register called ${leg.register}.`, at: 'from' };
      return read;
    }
    const said = predicateOf(leg.where, schema, deps.ctx);
    if (said.bad.length) {
      read.stopped = said.bad[0]!;
      return read;
    }
    const w = compile(said.predicate, schema);
    if (w.bad.length) {
      read.stopped = w.bad[0]!;
      return read;
    }

    const wrong = cyclesWrong(leg);
    if (wrong) {
      read.stopped = wrong;
      return read;
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
      return read;
    }

    for (const { id } of rows) {
      const entry = deps.hydrate(id, leg.register);
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
      counted.add(money.currency);

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
      /* DAYS THIS WALK CANNOT READ ARE COUNTED AND SAID, and the row walks by its cycle as an empty field would. Left
         out, a salary typed "15th and last" would be money missing; walked on a guess, it would be days nobody wrote. */
      const given = leg.days ? daysOf(entry.fields[leg.days]) : null;
      if (given === undefined) read.unreadableDays++;
      const how = cadenceOf(leg.every, cycle);
      /* DAYS THAT DO NOT FIT THE CYCLE ARE SAID TOO, and the row walks by its cycle. Two days on a line paid every month
         walked it twice a month, double the money every figure that counts it by how often reads; one day on twice a
         month is half a pair. A week has no day of the month and a one-off has its own day, so those keep their days. */
      const off = misfit(given, how.cadence);
      if (off) read.daysOff++;
      const named = off ? null : given;
      read.rows.push({
        first: dayOf(first),
        last: last ? dayOf(last) : null,
        ...how,
        amount: money.amount,
        currency: money.currency,
        incoming: leg.incoming ? entry.fields[leg.incoming.field] === leg.incoming.is : false,
        label: String(entry.fields[title] ?? entry.id),
        spoken: entry.seq === null ? entry.id : `${leg.register}#${entry.seq}`,
        of: groupOf(part),
        named: named ?? null,
        shift: leg.weekend ? shiftOf(entry.fields[leg.weekend]) : 'leave',
      });
    }
    return read;
  };
  const reads: LegRead[] = [];
  const spending: Leg[] = [];
  for (const leg of legs) {
    if (leg.everyday) spending.push(leg);
    else reads.push(readLeg(leg, seen));
  }

  /* A FLOOR UNDER `last` WALKS THE LONGER OF THE TWO, and with nothing dated it walks the floor rather than the default. */
  const horizon =
    horizonDays === 'last'
      ? lastOf(reads, deps.ctx.nowMs, today)
      : typeof horizonDays === 'number'
        ? horizonDays
        : Math.min(ceilingOf(horizonDays), Math.max(horizonDays.last, lastOf(reads, deps.ctx.nowMs, today, horizonDays.last)));
  const until = deps.ctx.nowMs + horizon * DAY_MS;

  /* THE RECORD'S REST DAYS ARE READ ONCE, and only when a row has a rule that moves a day: a walk with none reads no
     setting, which is every walk of a record whose lines are as imported. */
  const rest = reads.some((r) => r.rows.some((row) => row.shift !== 'leave')) ? new Set(deps.restDays ?? restDaysOf(deps.sql)) : new Set<number>();

  for (const { leg, stopped, rows, unreadable, unreadableEnd, notMoney, unreadableDays, daysOff } of reads) {
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
      const recurs = occurrences(row, until, today, rest);
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
    if (unreadableDays)
      refusals.push({
        code: 'VALUE_MALFORMED',
        fix: `${unreadableDays} ${unreadableDays === 1 ? 'line' : 'lines'} of ${leg.register} ${unreadableDays === 1 ? 'has days' : 'have days'} in ${leg.days} that this walk could not read, and ${unreadableDays === 1 ? 'it walks' : 'they walk'} by how often alone. Write a day from 1 to 31, last, or two of them: 15, last.`,
        at: 'days',
      });
    if (daysOff)
      refusals.push({
        code: 'VALUE_MALFORMED',
        fix: `${daysOff} ${daysOff === 1 ? 'line' : 'lines'} of ${leg.register} ${daysOff === 1 ? 'names days' : 'name days'} in ${leg.days} that do not fit how often ${daysOff === 1 ? 'it repeats, and it walks' : 'they repeat, and they walk'} by how often alone. Twice a month takes two days, and every other cycle one.`,
        at: 'days',
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

  /* EVERYDAY SPENDING, ONCE THE HORIZON IS KNOWN: a week's share of each currency's monthly figure, every seventh day
     from today to the horizon. A YEAR IS 52 WEEKS AND TWELVE MONTHS, and each week is what the running total has reached
     less what it had, so the shares add up to the months walked to the unit and no rounding gathers over ten years. */
  const everyday: Everyday[] = [];
  for (const leg of spending) {
    const named = leg.everyday!.already?.filter((l) => !l.everyday).map((l) => readLeg(l, new Set<string>()));
    /* A LEG NAMED AS ALREADY WALKED THAT CANNOT BE READ SAYS SO ONCE, and not again when the walk reads it too. */
    for (const r of named ?? []) if (r.stopped && !refusals.some((x) => x.fix === r.stopped!.fix)) refusals.push(r.stopped);
    const measured = everydayOf(deps, leg, named ?? reads, today);
    if (!Array.isArray(measured)) {
      refusals.push(measured);
      continue;
    }
    for (const e of measured) {
      everyday.push(e);
      if (e.currency === null || e.monthly <= 0) continue;
      seen.add(e.currency);
      const share = (week: number): number => Math.round((e.monthly * 12 * week) / 52);
      for (let week = 1; week <= EVERY_CAP; week++) {
        const day = iso(noon(today) + week * 7 * DAY_MS);
        const at = noon(day);
        if (at > until) break;
        movements.push({
          at,
          currency: e.currency,
          step: { day, label: EVERYDAY_LABEL, delta: share(week - 1) - share(week), source: leg.register, spoken: 'everyday', kind: 'everyday' },
        });
      }
    }
  }
  const measure = spending.length ? { everyday } : {};

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
          ...measure,
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
        ...measure,
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
      ...measure,
      refusals,
    },
  };
}

/**
 * What an everyday leg measures, one answer for each currency its list holds, or the sentence that stopped it.
 *
 * FULL MONTHS ONLY (`bucketState` in `metrics.ts` is the same rule for a chart's bars): a month counts when it has ended
 * and the list's first dated money in that currency is in a month before it. The month a ledger began in holds only the
 * days after its first row, and this month is not over, so an average over either reads low.
 *
 * A MONTH WITH NO MONEY OUT IS LEFT OUT, NOT COUNTED AS NOUGHT. A month nothing was imported for is a month the record
 * does not know, and averaging it in as no spending is a runway too long, the one direction this walk must never be
 * wrong in.
 *
 * ADDED UP IN SQL, NOT ROW BY ROW, because three months of a card is more rows than the `CAP` a walked leg may carry and
 * nothing here needs a row: only a sum for each month and currency.
 */
function everydayOf(deps: ForecastDeps, leg: Leg, already: readonly LegRead[], today: string): Everyday[] | Refusal {
  const want = leg.everyday?.months ?? EVERYDAY_MONTHS;
  if (!Number.isInteger(want) || want < 1 || want > EVERYDAY_MONTHS_CAP)
    return {
      code: 'OUT_OF_BOUNDS',
      fix: `The months everyday spending is measured over is a whole number from 1 to ${EVERYDAY_MONTHS_CAP}, and this one is ${JSON.stringify(want)}.`,
      at: 'everyday',
    };
  const schema = deps.schemaOf(leg.register);
  if (!schema) return { code: 'REGISTER_UNKNOWN', fix: `There is no register called ${leg.register}.`, at: 'from' };
  /* A FIELD IS CHECKED BEFORE IT BECOMES A JSON PATH, which is the one place a name a declaration typed reaches SQL. */
  for (const [at, field] of [['on', leg.on], ['amount', leg.amount], ['incoming', leg.incoming?.field]] as const)
    if (field !== undefined && !schema.fields[field]) return { code: 'FIELD_UNKNOWN', fix: `${leg.register} has no field called ${field}.`, at };
  if (schema.fields[leg.amount]!.type !== 'money')
    return { code: 'VALUE_MALFORMED', fix: `${leg.register}.${leg.amount} is not money, and a walk adds money. Point this leg at an amount.`, at: 'amount' };
  const said = predicateOf(leg.where, schema, deps.ctx);
  if (said.bad.length) return said.bad[0]!;
  const w = compile(said.predicate, schema);
  if (w.bad.length) return w.bad[0]!;

  const day = `json_extract(fields, '${jsonPath(leg.on)}')`;
  const amount = `json_extract(fields, '${jsonPath(leg.amount)}.amount')`;
  const currency = `json_extract(fields, '${jsonPath(leg.amount)}.currency')`;
  const dated = `register = ? AND deleted_at IS NULL AND ${day} IS NOT NULL AND ${day} <> '' AND typeof(${amount}) IN ('integer', 'real') AND ${currency} IS NOT NULL`;
  /* WHERE EACH CURRENCY BEGAN, over every dated row of the list and not only the ones the filter keeps: a ledger whose
     first row is a deposit began that day. */
  const began = new Map<string, string>();
  /* ONCE FOR A READ, since it reads every dated row of the list and asks nothing a walk's own filter changes: a page of walks
     over one ledger scanned all of it for each. */
  const readBegan = () => deps.sql.all<{ c: string; m: string }>(`SELECT ${currency} AS c, min(substr(${day}, 1, 7)) AS m FROM entry WHERE ${dated} GROUP BY c`, leg.register);
  const memo = deps.ctx.walks;
  for (const r of memo === undefined ? readBegan() : memo.once(JSON.stringify(['began', leg.register, leg.on, leg.amount]), readBegan))
    began.set(String(r.c), String(r.m));
  if (began.size === 0) return [{ currency: null, months: [], spent: 0, planned: 0, monthly: 0, why: EVERYDAY_NO_MONTH }];

  /* THE MONTHS BEFORE THIS ONE, oldest first. Today is the record's local day, so the month that is not over is too. */
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const months: string[] = [];
  for (let back = want; back >= 1; back--) months.push(iso(Date.UTC(year, month - 1 - back, 1, 12)).slice(0, 7));
  const out = leg.incoming ? ` AND ${`json_extract(fields, '${jsonPath(leg.incoming.field)}')`} IS NOT ?` : '';
  const spent = new Map<string, number>();
  for (const r of deps.sql.all<{ c: string; m: string; total: number }>(
    `SELECT ${currency} AS c, substr(${day}, 1, 7) AS m, sum(${amount}) AS total FROM entry WHERE ${dated} AND (${w.sql}) AND ${day} >= ? AND ${day} < ?${out} GROUP BY c, m`,
    leg.register,
    ...w.params,
    `${months[0]!}-01`,
    `${today.slice(0, 7)}-01`,
    ...(leg.incoming ? [leg.incoming.is] : []),
  ))
    spent.set(`${String(r.c)} ${String(r.m)}`, Number(r.total));

  return [...began.keys()].sort().map((c): Everyday => {
    const counted = months.filter((m) => began.get(c)! < m && spent.has(`${c} ${m}`));
    if (counted.length === 0) return { currency: c, months: [], spent: 0, planned: 0, monthly: 0, why: EVERYDAY_NO_MONTH };
    const average = Math.round(counted.reduce((sum, m) => sum + spent.get(`${c} ${m}`)!, 0) / counted.length);
    const planned = plannedOf(already, c, counted, today);
    const monthly = Math.max(0, average - planned);
    return { currency: c, months: counted, spent: average, planned, monthly, ...(monthly === 0 ? { why: EVERYDAY_COVERED } : {}) };
  });
}

/**
 * What the walk already holds of one currency's monthly spending, so it is not walked twice: the monthly worth of every
 * live repeating line of money out, and the monthly average of the one-off money out that fell due in the months counted.
 *
 * RENT WRITTEN AS A REPEATING LINE IS ALSO PAID THROUGH THE BANK, so the measure holds it and so does the walk. A line
 * that has ended takes nothing off.
 *
 * A LINE IS LIVE WHEN IT FALLS DUE WITHIN ONE OF ITS OWN CYCLES FROM TODAY, NOT WITHIN THE WALK (verify3, 2 Nov). Read
 * against the walk's end, a line first due in March was taken off the everyday figure of a year's walk and not of a
 * twelve-week one, so the first twelve weeks of the two walks were two different futures: Money and Today said "Lowest
 * $30,107 on 23 Jan" where Forecast, which walks a year and shows twelve weeks, said "$28,611 on 25 Jan". A line that
 * starts later than one cycle from now was not in the months measured either, so it is not paid twice by leaving it in.
 */
function plannedOf(already: readonly LegRead[], currency: string, months: readonly string[], today: string): number {
  let repeating = 0;
  let once = 0;
  for (const { stopped, rows } of already) {
    if (stopped) continue;
    for (const row of rows) {
      if (row.incoming || row.currency !== currency || (row.last !== null && row.first > row.last)) continue;
      if (row.cadence === null) {
        if (months.includes(row.first.slice(0, 7))) once += row.amount;
        continue;
      }
      const cycleDays = row.cadence.kind === 'months' ? row.cadence.months * 31 : row.cadence.kind === 'weeks' ? row.cadence.weeks * 7 : 16;
      if ((row.last !== null && row.last < today) || noon(row.first) > noon(today) + cycleDays * DAY_MS) continue;
      repeating +=
        row.cadence.kind === 'months' ? row.amount / row.cadence.months : row.cadence.kind === 'weeks' ? (row.amount * 52) / (12 * row.cadence.weeks) : row.amount * 2;
    }
  }
  return Math.round(repeating + once / months.length);
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
function occurrences(
  row: Held,
  until: number,
  today: string,
  rest: ReadonlySet<number> = new Set(),
): { of: { day: string; at: number }[]; capped: boolean } {
  const { first, last, cadence } = row;
  const start = noon(first);
  if (!Number.isFinite(start)) return { of: [], capped: false };
  /* A ROW ENDED BEFORE ITS FIRST DAY WALKS NOTHING, one-off or not: see `Leg.ends`. An import can write a monthly row
     due 1 October for a line that ends on 28 September when the next payday is past the end, and that row is no cheque.
     */
  if (last !== null && first > last) return { of: [], capped: false };
  /* A DAY ON A REST DAY MOVES BY THE ROW'S RULE, and the row's own first day too: a rule says the money moves on a
     working day, and a "Next" already moved is a working day, so moving it again changes nothing. A day moved before
     today whose own day is still ahead moves today, not into the past it would be skipped or called late in. */
  const moved = (day: string): string => {
    const to = shifted(day, row.shift, rest);
    return to < today && day >= today ? today : to;
  };
  if (cadence === null) {
    const day = moved(first);
    return { of: noon(day) <= until ? [{ day, at: noon(day) }] : [], capped: false };
  }

  /* A CYCLE BEFORE TODAY HAS ALREADY BEEN CHARGED. `renews` is an anchor nobody moves on, and the
     walk started at it and clamped every past cycle to today as overdue: a monthly service anchored
     three months back charged four times on day one, and one anchored in 2020 hit the cap on a
     30-day horizon. The reminder engine skips past occurrences for the same reason (`expandRepeat`'s
     `skipPast`). Skipped cycles are not counted against `EVERY_CAP`, only against `SKIP_CAP`. */
  const days = stepsOf(first, start, cadence, row.named);
  const out: { day: string; at: number }[] = [];
  /* THE LAST DAY A STEP MOVED TO, so a step moved onto or behind the one before it is the same payment and is dropped:
     a "Next" typed as Thursday 29 October for a payday on the 30th, a Friday, is October's, and the 30th moved back a
     day is that payday again. */
  let prev = '';
  let n = 0;
  for (; out.length < EVERY_CAP && n < SKIP_CAP; n++) {
    const next = days.next();
    const named = next.done ? null : next.value;
    if (!named) break;
    /* PAST THE ROW'S LAST DAY IS THE SAME STOP AS PAST THE HORIZON, and it is a stop and not the cap, so `capped` below
       stays false for a line that simply ended. The end bounds the day the row names, before any rest day moves it. */
    if (noon(named) > until || (last !== null && named > last)) break;
    const to = shifted(named, row.shift, rest);
    const repeat = to <= prev;
    prev = to > prev ? to : prev;
    /* A DAY GONE BY IS SKIPPED ONLY WHEN ITS MOVE IS GONE BY TOO: a payday on Saturday 31 October paid the working day
       after is still Monday's money on the Sunday between. */
    if ((named < today && to < today) || repeat) continue;
    const day = moved(named);
    const at = noon(day);
    if (at > until) break;
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
function* stepsOf(
  first: string,
  start: number,
  cadence: NonNullable<Cadence>,
  named: readonly Named[] | null = null,
): Generator<string | null, void, undefined> {
  yield first;
  /* THE DAYS A ROW NAMES ARE ITS OWN, and they replace the twice-a-month table and the month end reading below. Twice a
     month has two of them and a cycle of months one (`runway` says a row whose days do not fit and hands none here). A
     week has no day of the month, so a weekly row walks by its seven days whatever it names. */
  if (named && cadence.kind === 'months') return yield* namedSteps(first, cadence.months, named);
  if (named && cadence.kind === 'twice') return yield* namedSteps(first, 1, named);
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

/**
 * The days a row's own `days` name, every `every` months, after the one its first day stands for.
 *
 * THE FIRST DAY IS ONE OF THE NAMED DAYS, MOVED OR MISTYPED, AND THE NEAREST ONE IS THE PAYMENT IT IS. A "Next" of
 * Thursday 29 October on a line paid on the 30th is October's pay moved to a working day, and one of Monday 2 November
 * on a line paid on the last day is October's moved the other way; walking every named day after the first would pay
 * the first of those twice and skip November's in the second. So the named day nearest the first day is that payment,
 * the earlier on a tie (which drops no money), and the walk goes on from the named day after it. A "Next" far from
 * every named day steps once on it and then on the named days: that is the sign the two disagree, and the form says
 * which wins ("Next" for the next payment, the days after it).
 *
 * `last` IS EACH MONTH'S OWN LAST DAY AND A NUMBER IS THAT DAY, or the last day of a month too short for it: `15, last`
 * walks 15 and 31 October and 15 and 30 November, and `30` walks 30 October, never the 31st.
 */
function* namedSteps(first: string, every: number, named: readonly Named[]): Generator<string, void, undefined> {
  const year = Number(first.slice(0, 4));
  const month = Number(first.slice(5, 7)) - 1;
  /* FROM ONE CYCLE BEFORE THE FIRST DAY'S MONTH, so there is always a named day on or before it to weigh. */
  function* all(): Generator<string, void, undefined> {
    for (let k = -1; ; k++) {
      const length = new Date(Date.UTC(year, month + k * every + 1, 0)).getUTCDate();
      const days = [...new Set(named.map((d) => (d === 'last' ? length : Math.min(d, length))))].sort((a, b) => a - b);
      for (const d of days) yield iso(Date.UTC(year, month + k * every, d, 12));
    }
  }
  const at = noon(first);
  let before = '';
  let stood = false;
  for (const day of all()) {
    if (day <= first) {
      before = day;
      continue;
    }
    /* THE FIRST NAMED DAY AFTER THE ROW'S OWN: the payment the row's day stands for when it is nearer than the one
       before, and so not walked again. */
    if (!stood) {
      stood = true;
      if (before === '' || noon(day) - at < at - noon(before)) continue;
    }
    yield day;
  }
}

/** Days that do not fit how often a row repeats: one day on twice a month, two on a cycle of months (see `runway`). */
const misfit = (given: readonly Named[] | null | undefined, cadence: Cadence): boolean =>
  !!given && !!cadence && cadence.kind !== 'weeks' && given.length !== (cadence.kind === 'twice' ? 2 : 1);

/**
 * One repeating row as the walk reads it: the leg that declares its fields, the row's fields, and the record's rest
 * days (`restDaysOf`), weekdays from 0 for Sunday. No rest days moves nothing.
 */
export type CycleLine = {
  leg: Pick<Leg, 'on' | 'every' | 'ends' | 'days' | 'weekend'>;
  fields: Readonly<Record<string, unknown>>;
  rest?: readonly number[];
  /**
   * The day of the month the line is paid on, 1 to 31, kept by whoever writes the answer back to the row's first day.
   * See `cycleAfter` and `anchorDayOf`. Only a cycle of months reads it, and the row's own days win when they fit.
   */
  anchorDay?: number;
};

/**
 * The next day a repeating row's money moves on after `day`, or `null` when there is none.
 *
 * THE WALK'S OWN STEPS, so the day a paid line moves its "Next" to is the day the forecast walks next: the same cycle
 * tables (`cadenceOf`), the same days of the month (`daysOf`, and `misfit` for days that do not fit), the same month
 * end and clamp (`stepsOf`). A row the walk reads once has no next day: a one-off, a cycle no table names, a first day
 * or an end nobody can read.
 *
 * THE DAY THE ROW NAMES, NOT THE DAY IT MOVED TO. A payday on Saturday 31 October paid the working day before answers
 * 31 October, and the walk moves it to the 30th each time it reads it. Written back moved, the 30th would be the day
 * the line steps from, and 30 November is not a month end.
 *
 * BUT A STEP WHOSE MOVE IS NOT AFTER `day` IS THE PAYMENT `day` ALREADY IS. Asked on Thursday 29 October for a line
 * paid on Friday the 30th, "the working day before", the 30th is that same pay and the answer is 30 November. So is a
 * step moved onto or behind the one before it, as in `occurrences`.
 *
 * A DAY WRITTEN BACK HAS LOST THE DAY IT WAS CLAMPED FROM, AND `anchorDay` KEEPS IT. The walk steps every cycle from
 * one first day, so 30 January clamps to 28 February and is the 30th again in March. A line whose "Next" is moved on
 * each time it is paid steps from the day last written, and 28 February read alone is a month end: measured, lines
 * first due on 28, 29 and 30 January were all answered 31 March, and the 31st of every long month after. Nothing on
 * the row says which it was, so the caller says it: with `anchorDay` a cycle of months steps as a row naming that one
 * day steps (`namedSteps`), the day itself or the last day of a month too short for it, and a leap day paid yearly
 * comes back to the 29th. Read it once with `anchorDayOf` before the first write, and keep it.
 *
 * WITHOUT ONE, AND WITHOUT DAYS OF ITS OWN, THE ROW IS READ AS THE WALK READS IT, month end and all, so the two still
 * agree on a row nobody has written back. A leg with a `days` field can keep the anchor there instead, and then the
 * walk reads it too.
 *
 * `null` PAST THE ROW'S LAST DAY, which bounds the day the row names, and when `SKIP_CAP` steps do not reach `day`.
 */
export function cycleAfter(day: string, line: CycleLine): string | null {
  const { leg, fields } = line;
  const after = dayOf(day);
  const on = String(fields[leg.on] ?? '');
  if (!on || !Number.isFinite(noon(on)) || !Number.isFinite(noon(after))) return null;
  const ends = leg.ends ? String(fields[leg.ends] ?? '') : '';
  if (ends && !Number.isFinite(noon(ends))) return null;
  const first = dayOf(on);
  const last = ends ? dayOf(ends) : null;
  if (last !== null && first > last) return null;
  const { cadence } = cadenceOf(leg.every, leg.every ? String(fields[leg.every.field] ?? '') : '');
  if (cadence === null) return null;
  const given = leg.days ? daysOf(fields[leg.days]) : null;
  const fits = given && !misfit(given, cadence) ? given : null;
  const named = fits ?? anchored(line.anchorDay, cadence);
  const shift = leg.weekend ? shiftOf(fields[leg.weekend]) : 'leave';
  const rest = new Set(line.rest ?? []);
  let prev = '';
  let n = 0;
  for (const step of stepsOf(first, noon(first), cadence, named)) {
    if (!step || n++ >= SKIP_CAP || (last !== null && step > last)) return null;
    const to = shifted(step, shift, rest);
    const repeat = to <= prev;
    prev = to > prev ? to : prev;
    if (step > after && to > after && !repeat) return step;
  }
  return null;
}

/** An anchor as the one day a cycle of months names, or nothing: no anchor, not a day of the month, or another cycle. */
const anchored = (anchorDay: number | undefined, cadence: NonNullable<Cadence>): readonly Named[] | null =>
  cadence.kind === 'months' && Number.isInteger(anchorDay) && anchorDay! >= 1 && anchorDay! <= 31 ? [anchorDay!] : null;

/**
 * The `anchorDay` to keep for a line before its first day is written back for the first time, or `null` when it needs
 * none: a week or twice a month names its days without the first day, a row's own days that fit already say it, and a
 * row the walk reads once has no next day.
 *
 * THE DAY THE WALK WOULD HAVE STEPPED BY, so the days answered with it are the days the forecast showed while the row
 * stood still: the day of the month of the first day, and 31, every month's last day, for a first day that is a month
 * end on a cycle that is not whole years (`stepsOf`). On whole years 29 February stays the 29th.
 *
 * READ IT FROM A ROW NOBODY HAS STEPPED YET. A row already written back to 28 February answers 31 here, as the walk
 * reads it, and only whoever knows the line can say it was the 28th, 29th or 30th.
 */
export function anchorDayOf(line: Pick<CycleLine, 'leg' | 'fields'>): number | null {
  const { leg, fields } = line;
  const on = String(fields[leg.on] ?? '');
  if (!on || !Number.isFinite(noon(on))) return null;
  const { cadence } = cadenceOf(leg.every, leg.every ? String(fields[leg.every.field] ?? '') : '');
  if (cadence === null || cadence.kind !== 'months') return null;
  const given = leg.days ? daysOf(fields[leg.days]) : null;
  if (given && !misfit(given, cadence)) return null;
  const first = dayOf(on);
  return cadence.months % 12 !== 0 && endOfMonth(first) === first ? 31 : Number(first.slice(8, 10));
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
 * repeat for ever would show nothing and read as an answer. `Runway.horizon` says which it was. A walk
 * with a floor (`{ last: n }`) walks `none`, its floor, instead.
 */
function lastOf(reads: readonly LegRead[], nowMs: number, today: string, none: number = HORIZON_DEFAULT): number {
  let furthest: string | null = null;
  for (const { rows } of reads)
    for (const row of rows) {
      if (row.last !== null && row.first > row.last) continue;
      const day = row.cadence === null ? row.first : row.last;
      if (day !== null && (furthest === null || day > furthest)) furthest = day;
    }
  if (furthest === null || furthest < today) return none;
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

/**
 * The days of the month a row's `days` field names: `null` when it is empty, `undefined` when this walk cannot read it.
 *
 * A DAY FROM 1 TO 31 OR `last`, ONE OR TWO OF THEM, apart by a comma, `and` or a space: `15, last`, `15 and last`,
 * `last`. A number field holding a whole day reads as that day. Anything else is said (`unreadableDays`), never guessed.
 */
function daysOf(value: unknown): Named[] | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isInteger(value) && value >= 1 && value <= 31 ? [value] : undefined;
  if (typeof value !== 'string') return undefined;
  const parts = value
    .toLowerCase()
    .split(/,|\band\b|\s+/)
    .map((p) => p.trim())
    .filter((p) => p !== '');
  if (parts.length === 0) return null;
  if (parts.length > 2) return undefined;
  const out: Named[] = [];
  for (const p of parts) {
    if (p === 'last') out.push('last');
    else if (/^\d{1,2}$/.test(p) && Number(p) >= 1 && Number(p) <= 31) out.push(Number(p));
    else return undefined;
  }
  /* THE SAME DAY TWICE IS ONE DAY, and on a line paid twice a month it would walk half its money. */
  return out.length === 2 && out[0] === out[1] ? undefined : out;
}

/** A row's weekend rule: `before` or `after` (the reminder engine's `previous` and `next` too), else `leave`. */
function shiftOf(value: unknown): Shift {
  const said = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (said === 'before' || said === 'previous') return 'before';
  if (said === 'after' || said === 'next') return 'after';
  return 'leave';
}

/**
 * A day moved off the record's rest days by a row's rule: back to the working day before, or on to the one after.
 *
 * THE SAME RULE THE REMINDERS KEEP (`shiftWorkday` in `schedule.ts`), with the rest days the record's own and not
 * Saturday and Sunday for everyone: in Cairo the weekend is Friday and Saturday, and a payday on Friday 30 October paid
 * "the working day before" is Thursday 29. A week of nothing but rest days has no working day, and the day stays.
 */
function shifted(day: string, how: Shift, rest: ReadonlySet<number>): string {
  if (how === 'leave' || rest.size === 0 || rest.size >= 7) return day;
  let at = noon(day);
  while (rest.has(new Date(at).getUTCDay())) at += how === 'before' ? -DAY_MS : DAY_MS;
  return iso(at);
}

/** Saturday and Sunday, the rest days a record has until somebody says otherwise. */
const REST_DEFAULT: readonly number[] = [6, 0];
/** The setting a record's rest days are held in, on whichever enabled pack declares it (Money, `rest_days`). */
export const REST_DAYS_SETTING = 'rest_days';
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * The record's rest days: the `rest_days` setting of the first enabled pack, by id, that declares one, as a person set
 * it or as the pack's default; Saturday and Sunday when no pack declares it or it is empty.
 *
 * READ AS `homeCurrency` IN `declare.ts` READS THE HOME CURRENCY, from the pack rows themselves, and each time a walk
 * needs it, so a change on Money's settings holds at once. Read here and not through `declare.ts`, which imports this
 * module's callers.
 *
 * A LIST OR A SENTENCE, because the setting is a person's: weekday numbers (0 or 7 Sunday, 1 Monday to 6 Saturday) or
 * names, `Friday, Saturday` or `fri sat`. `none` is a record with no rest days. A value nothing here can read is the
 * default rather than no rest days, since moving no payday is the reading that hides the setting was ever made.
 */
export function restDaysOf(sql: Sql): number[] {
  let rows: { manifest: string }[];
  try {
    rows = sql.all<{ manifest: string }>('SELECT manifest FROM pack WHERE disabled_at IS NULL ORDER BY id');
  } catch {
    return [...REST_DEFAULT];
  }
  for (const { manifest } of rows) {
    let m: { config?: Record<string, { default?: unknown }>; config_values?: Record<string, unknown> };
    try {
      m = JSON.parse(manifest) as typeof m;
    } catch {
      continue;
    }
    const decl = m?.config?.[REST_DAYS_SETTING];
    if (!decl || typeof decl !== 'object') continue;
    const set = m.config_values?.[REST_DAYS_SETTING];
    const read = weekdaysOf(set !== null && set !== undefined ? set : decl.default);
    if (read) return read;
  }
  return [...REST_DEFAULT];
}

/** Weekday numbers from a list or a sentence of numbers or names, `[]` for `none`, or `null` when nothing is readable. */
function weekdaysOf(value: unknown): number[] | null {
  const parts = Array.isArray(value)
    ? value.map((v) => String(v).trim().toLowerCase())
    : typeof value === 'string'
      ? value.toLowerCase().split(/[,\s]+|\band\b/).map((p) => p.trim())
      : typeof value === 'number'
        ? [String(value)]
        : [];
  const said = parts.filter((p) => p !== '');
  if (said.length === 1 && said[0] === 'none') return [];
  const out = new Set<number>();
  for (const p of said) {
    const n = /^[0-7]$/.test(p) ? Number(p) % 7 : p.length >= 3 ? WEEKDAYS.findIndex((w) => w.startsWith(p)) : -1;
    if (n < 0 || n > 6) return null;
    out.add(n);
  }
  return out.size ? [...out].sort((a, b) => a - b) : null;
}
