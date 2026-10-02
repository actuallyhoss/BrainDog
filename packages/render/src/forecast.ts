/**
 * What `forecast` decides, as functions both drawers call.
 *
 * A forecast is a cash walk drawn as a line: the balance the record remembered, solid, up to today,
 * and the walk from today's balance, dashed, to the horizon, over a soft wash down to the zero rule. The value axis is
 * a few round steps that always hold zero, said short (`£50k`, `£0`, `−£50k`), and the first day the balance goes under
 * is marked and said in words.
 *
 * NO STEMS. Every movement worth a twentieth of the range stood on the zero rule as a stem, which on a year's walk was
 * a few grey ticks nobody could read against a balance line (the money review called them stray), and their deltas
 * stretched the axis past anything the balance reached. What moved on a day is the scrub's readout and the table's.
 *
 * THE KNOBS ARE ARITHMETIC OVER THE STEPS THE HOST SENT, not a second query. Clients paying later
 * moves every incoming step; spending the record does not know about takes a little every day; a
 * movement left out is every occurrence of it. The walk the host made is the baseline, and a knob
 * never reaches the record or the address.
 *
 * AND THE FIVE LONGER-RANGE CONTROLS ARE
 * THE SAME KIND OF ARITHMETIC, which is what keeps them equal in both engines: the kernel's walk and the browser's
 * both reach this file as rows, so a control applied here is applied to either. Spending and money in grow by a
 * percentage a year from today; a converted step moves with a yearly drift in its pair; a stream or a plan is counted
 * in or out whole; and holdings the host sends a figure for arrive on a day a reader picks. What a control needs to
 * know about a step beyond its day and amount comes on an `of` row under it, written only when the host knows it.
 */

import { MISSING, axisFigure, exponentOf, headlineFigure, money } from './format.ts';
import { signedOf } from './bridge.ts';
import { figureLike } from './figure.ts';

const at = (n: number): string => String(Math.round(n * 100) / 100);
const DAY_MS = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/u;
const MONTH_DAYS = 30.4375;
const YEAR_DAYS = MONTH_DAYS * 12;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PAIR = /^[A-Z]{3} to [A-Z]{3}$/u;
/** A rate as the host writes it: decimal digits, and an exponent where a number that small is written with one. */
const RATE = /^\d+(?:\.\d+)?(?:e-?\d+)?$/iu;

export const FORECAST_KNOBS = ['horizon', 'late', 'spend', 'leave', 'grow', 'drift', 'count', 'sell'] as const;
export type ForecastKnob = (typeof FORECAST_KNOBS)[number];

export type ForecastStep = {
  day: string;
  label: string;
  delta: number;
  /** The pair a converted step came through, `USD to EGP`, which the drift knob moves it by. Absent on money never converted. */
  pair?: string;
  /** What the step is part of, a plan, when that is not its label: the parts of one plan are counted in or out together. */
  of?: string;
};

/** Money a reader may count as sold on a day: what it is called and what it is worth, in the walk's own money. */
export type ForecastSell = { label: string; value: number };

/**
 * Another currency the walk may be shown in: the walk's own (`from`), the one shown (`to`), the day of the rate and how
 * many of `to` one of `from` buys, from a `show | GBP to USD | 2026-09-20 | 1.2712` row the host writes.
 */
export type ForecastShow = { from: string; to: string; day: string; rate: number };

export type ForecastModel = {
  today: string;
  /** What the opening figure is called: `Cash now`. */
  label: string;
  opening: number;
  /** The opening cell as drawn, which every computed figure is written like. */
  template: string;
  past: { day: string; value: number }[];
  steps: ForecastStep[];
  horizon: number;
  /**
   * The lengths the horizon knob offers as the block declared them (`horizons:`), each whole days or `last`, the walk's
   * last dated movement; `null` when the host sent none, and the knob offers a quarter, half a year and a year.
   */
  horizons: (number | 'last')[] | null;
  knobs: ForecastKnob[];
  /** How many days late money has come in on average, which the late knob marks, or `null` when the host sent none. */
  late: number | null;
  /** What the late knob is called, the figure it marks as the host names it, or `null` for the renderer's own words. */
  lateName: string | null;
  /** How near a crossing is said under the chart, in days, or `null` when it is never said. */
  under: number | null;
  /**
   * One walk of several drawn from one declaration, one a currency (`group | id | key`), or `null` for a walk on its own.
   * The walks of a group move together under one set of knobs, which the walk that names `knobs` draws.
   */
  group: { id: string; key: string } | null;
  /** What the sell knob may count as sold, from the `sell` rows written in this walk's money. */
  sells: ForecastSell[];
  /** The other currencies the walk may be shown in, with the record's rates into each; empty when the host sent none. */
  shows: ForecastShow[];
  /**
   * The record's own currency, from a `home | GBP |  |` row, or `null` when the host sent none. A figure shown in it is
   * written by its symbol alone, and one in any other currency keeps its code after the amount.
   */
  home: string | null;
  /**
   * What went out in an average month of the last three, in the walk's own money, from a `spent | 3 |  | £2,400.00` row,
   * or `null` when the host sent none or wrote it in another money. The spend slider reaches twice it.
   */
  spent: number | null;
};

/** Growth a year, in percent, of money going out and of money coming in. */
export type Growth = { in: number; out: number };

/**
 * What a group of walks holds between them: the knobs every walk reads, and spending by each walk's key.
 *
 * THE FOUR LATER KNOBS ARE OPTIONAL BECAUSE A GROUP IS MADE ELSEWHERE (`svelte/forecast-group.svelte.ts`) with the first
 * four only, and a group that holds none of them is a group where none has moved.
 */
export type GroupKnobs = {
  horizon: number | null;
  late: number;
  spend: Record<string, number>;
  leave: string[];
  grow?: Growth;
  /** Drift a year, in percent, by pair: `{ 'USD to EGP': 10 }` is one dollar buying ten percent more pounds a year from now. */
  drift?: Record<string, number>;
  /** The day holdings are counted as sold, or `null` for not sold. */
  sell?: string | null;
};

/** One walk's knobs, read from what its group holds. */
export const knobsIn = (model: ForecastModel, held: GroupKnobs, key: string): Knobs => ({
  horizon: held.horizon ?? model.horizon,
  late: held.late,
  spend: held.spend[key] ?? 0,
  leave: held.leave,
  ...(held.grow !== undefined ? { grow: held.grow } : {}),
  ...(held.drift !== undefined ? { drift: held.drift } : {}),
  ...(held.sell !== undefined ? { sell: held.sell } : {}),
});

export type Knobs = {
  horizon: number;
  late: number;
  spend: number;
  leave: readonly string[];
  grow?: Growth;
  drift?: Readonly<Record<string, number>>;
  sell?: string | null;
};

export type Scenario = {
  horizon: number;
  /** One balance a day, today first. */
  days: { day: string; balance: number }[];
  /** The steps inside the horizon after the knobs, each with the balance after it. */
  steps: (ForecastStep & { balance: number })[];
  crossed: { day: string; balance: number } | null;
  lowest: { day: string; balance: number };
};

const ms = (day: string): number => Date.parse(`${day}T12:00:00Z`);
export const addDays = (day: string, n: number): string => new Date(ms(day) + n * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string): number => Math.round((ms(to) - ms(from)) / DAY_MS);
/** `12 Nov`, the way a sentence over a chart says a day. */
export const shortDay = (day: string): string => {
  if (!ISO.test(day)) return day;
  const d = new Date(ms(day));
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

/** A whole number written in a cell, at least `least`, or `null`. */
const whole = (cell: string | undefined, least = Number.MIN_SAFE_INTEGER): number | null => {
  const n = cell === undefined || cell.trim() === '' ? NaN : Number(cell.trim());
  return Number.isInteger(n) && n >= least ? n : null;
};

/** The model, from the rows as plain text, or `null` when there is no `opening` row to walk from. */
export function forecastModel(rows: readonly (readonly string[])[]): ForecastModel | null {
  const opening = rows.find((r) => r[0]?.trim() === 'opening');
  const today = opening?.[1]?.trim() ?? '';
  const value = signedOf(opening?.[3] ?? '');
  if (!opening || !ISO.test(today) || !Number.isFinite(value)) return null;
  const horizonCell = Number(rows.find((r) => r[0]?.trim() === 'horizon')?.[1]);
  const knobWords = (rows.find((r) => r[0]?.trim() === 'knobs')?.[1] ?? '').split(/\s+/u);
  return {
    today,
    label: opening[2]?.trim() ?? '',
    opening: value,
    template: opening[3]!.trim(),
    past: rows.flatMap((r) => {
      const v = signedOf(r[3] ?? '');
      const d = r[1]?.trim() ?? '';
      return r[0]?.trim() === 'past' && ISO.test(d) && d < today && Number.isFinite(v) ? [{ day: d, value: v }] : [];
    }),
    steps: stepsOf(rows, today),
    horizon: Number.isInteger(horizonCell) && horizonCell > 0 ? horizonCell : 180,
    horizons: horizonsOf(rows.find((r) => r[0]?.trim() === 'horizons')),
    knobs: FORECAST_KNOBS.filter((k) => knobWords.includes(k)),
    late: whole(rows.find((r) => r[0]?.trim() === 'late')?.[1]),
    lateName: rows.find((r) => r[0]?.trim() === 'late')?.[2]?.trim() || null,
    under: whole(rows.find((r) => r[0]?.trim() === 'under')?.[1], 1),
    group: groupOf(rows.find((r) => r[0]?.trim() === 'group')),
    sells: sellsOf(rows, opening[3]!),
    shows: showsOf(rows),
    home: homeOf(rows.find((r) => r[0]?.trim() === 'home')),
    spent: spentOf(rows.find((r) => r[0]?.trim() === 'spent'), opening[3]!),
  };
}

/** A `home | GBP |  |` row's currency, or `null` when there is none or it is not a code. */
function homeOf(row: readonly string[] | undefined): string | null {
  const code = row?.[1]?.trim() ?? '';
  return /^[A-Z]{3}$/u.test(code) ? code : null;
}

/**
 * A `spent | 3 |  | £2,400.00` row's monthly figure, or `null`.
 *
 * ONLY IN THE WALK'S OWN MONEY, as a `sell` figure is (`sellsOf`): the number is read without the unit it is written in,
 * so an average in dollars beside a walk in pounds would set the slider's reach by the wrong amount.
 */
function spentOf(row: readonly string[] | undefined, template: string): number | null {
  const cell = row?.[3]?.trim() ?? '';
  const v = Math.abs(signedOf(cell));
  return cell && Number.isFinite(v) && v > 0 && unitOf(cell) === unitOf(template) ? v : null;
}

/**
 * A `horizons | 90 180 365 last |  |` row's lengths, or `null` when there is no row or nothing in it reads.
 *
 * A WORD THAT IS NOT A LENGTH IS LEFT OUT, NOT THE ROW. The record checks `horizons:` before it answers, so a word here
 * that is neither whole days nor `last` came from somewhere else, and the lengths beside it are still the author's.
 */
function horizonsOf(row: readonly string[] | undefined): (number | 'last')[] | null {
  const said = (row?.[1] ?? '').split(/\s+/u).flatMap((w): (number | 'last')[] => {
    if (w === 'last') return ['last'];
    return /^\d+$/u.test(w) && Number(w) >= 1 ? [Number(w)] : [];
  });
  return said.length ? said : null;
}

/**
 * The `show | GBP to USD | day | rate` rows: every currency the walk may be shown in, once each, all from the walk's own.
 *
 * A ROW FROM ANOTHER CURRENCY THAN THE FIRST ROW'S IS LEFT OUT, because the rate multiplies the walk's own figures and
 * a rate out of dollars applied to a walk in pounds would draw every amount wrong by the rate between the two.
 */
function showsOf(rows: readonly (readonly string[])[]): ForecastShow[] {
  const out: ForecastShow[] = [];
  for (const r of rows) {
    if (r[0]?.trim() !== 'show') continue;
    const pair = r[1]?.trim() ?? '';
    const day = r[2]?.trim() ?? '';
    const cell = r[3]?.trim() ?? '';
    if (!PAIR.test(pair) || !ISO.test(day) || !RATE.test(cell)) continue;
    const [from, to] = pair.split(' to ') as [string, string];
    const rate = Number(cell);
    if (!Number.isFinite(rate) || rate <= 0 || from === to) continue;
    if (out.some((s) => s.to === to) || (out[0] !== undefined && out[0].from !== from)) continue;
    out.push({ from, to, day, rate });
  }
  return out;
}

/**
 * The walk in another currency: every amount multiplied by the rate and rounded to that currency's own decimals, and
 * written as a screen writes that currency (`writtenIn`), so the chart, the table and every knob's figure read in it.
 *
 * ONE RATE FOR EVERY DAY OF THE WALK, the newest the record holds, because no rate is known for a day ahead of today
 * and a walk is days ahead of today. The remembered balance before today is shown at the same rate, which the note
 * beside the control says by naming the rate's day.
 */
export function inCurrency(model: ForecastModel, show: ForecastShow): ForecastModel {
  const unit = 10 ** exponentOf(show.to);
  /* THE SIGN IS PUT BACK AFTER ROUNDING, as `scaled` below does it, so a cost and a refund of one size agree. */
  const by = (v: number): number => (Math.sign(v) * Math.round(Math.abs(v) * show.rate * unit)) / unit;
  const opening = by(model.opening);
  return {
    ...model,
    opening,
    template: writtenIn(Math.round(opening * unit), show.to, model.home),
    past: model.past.map((p) => ({ ...p, value: by(p.value) })),
    steps: model.steps.map((s) => ({ ...s, delta: by(s.delta) })),
    sells: model.sells.map((s) => ({ ...s, value: by(s.value) })),
    shows: [],
    spent: model.spent === null ? null : by(model.spent),
  };
}

/** How English writes a currency in one of its two displays, or `undefined`; it throws on a code the runtime refuses. */
const display = (currency: string, currencyDisplay: 'symbol' | 'narrowSymbol'): string | undefined =>
  new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay }).formatToParts(0).find((p) => p.type === 'currency')?.value;

/**
 * The symbol a currency is written with, `$` for USD, or `null` for one English writes by its code (`EGP`, `CHF`).
 *
 * THE APP'S OWN RULE (`symbolOf` in `apps/web/src/lib/record/money.ts`), SAID AGAIN because this package imports nothing
 * from the app: the walk's own figures reach this file already drawn by it, and a converted figure beside them has to
 * be drawn the same way or the two amounts in one table read as two kinds of money.
 */
function symbolOf(currency: string): string | null {
  try {
    if (display(currency, 'symbol')?.toUpperCase() === currency) return null;
    const narrow = display(currency, 'narrowSymbol');
    return narrow && narrow.toUpperCase() !== currency ? narrow : null;
  } catch {
    return null;
  }
}

/**
 * An amount in minor units as a screen writes money (contracts §8.3): `£2,400.00` in the record's own currency,
 * `$4,800.00 USD` in any other, and `EGP 58,185.54`, code first, for a currency with no symbol of its own.
 *
 * A CURRENCY NOT KNOWN TO BE THE RECORD'S KEEPS ITS CODE AFTER THE AMOUNT, so a bare `$` never stands for a dollar nobody
 * named: when the host sends no `home` row, every converted figure says which currency it is in.
 */
function writtenIn(minor: number, currency: string, home: string | null): string {
  const coded = money(minor, currency);
  const symbol = symbolOf(currency);
  const m = /^[A-Z]{3} (−?)(.+)$/u.exec(coded);
  if (!symbol || !m) return coded;
  return `${m[1]}${symbol}${m[2]}${currency === home ? '' : ` ${currency}`}`;
}

/**
 * A currency as a person names it, `US dollar` for USD, for a control that offers one; its code only where the runtime
 * knows no name for it.
 *
 * SENTENCE CASE, the last word lower: English gives `US Dollar` and `British Pound`, and every label in the product is
 * in sentence case. A name of one word, `Euro`, stays as it is, because it begins the label.
 */
export function currencyName(code: string): string {
  let name: string | undefined;
  try {
    name = new Intl.DisplayNames('en', { type: 'currency' }).of(code);
  } catch {
    return code;
  }
  if (!name || name.toUpperCase() === code) return code;
  const words = name.split(' ');
  if (words.length > 1) words[words.length - 1] = words[words.length - 1]!.toLowerCase();
  return words.join(' ');
}

/**
 * The `step` rows, each with what the `of` row directly under it says: `of | plan | pair |`.
 *
 * DIRECTLY UNDER, AND NOT MATCHED BY DAY AND LABEL, because a label is not an identity: one row on one day can be written
 * in two currencies, and a pair matched to the wrong one drifts money that was never converted. A row can only have one
 * row under it, so the position cannot be wrong. And A FIFTH CELL ON THE STEP ROW WAS THE OBVIOUS PLACE and is refused:
 * `forecast` takes four cells (`kinds.ts`), and a step row with five degrades the whole block to its source text.
 */
function stepsOf(rows: readonly (readonly string[])[], today: string): ForecastStep[] {
  const out: ForecastStep[] = [];
  let above: ForecastStep | null = null;
  for (const r of rows) {
    const kind = r[0]?.trim();
    if (kind === 'of' && above) {
      const of = r[1]?.trim() ?? '';
      const pair = r[2]?.trim() ?? '';
      if (of) above.of = of;
      if (PAIR.test(pair)) above.pair = pair;
      above = null;
      continue;
    }
    above = null;
    const v = signedOf(r[3] ?? '');
    const d = r[1]?.trim() ?? '';
    if (kind !== 'step' || !ISO.test(d) || !Number.isFinite(v)) continue;
    above = { day: d < today ? today : d, label: r[2]?.trim() ?? '', delta: v };
    out.push(above);
  }
  return out;
}

/** What a figure is written in, with its number taken out: `£` of `−£1,200.00`, `EGP` of `EGP 5,000.00`. */
const unitOf = (figure: string): string => figure.replace(/[\d.,\s−+-]/gu, '');

/**
 * The `sell | | label | figure` rows whose figure is written in the walk's own money.
 *
 * A FIGURE IN ANOTHER MONEY IS LEFT OUT, NEVER ADDED. `signedOf` reads the number and drops the sign it is written in, so
 * holdings of $900.00 beside a walk in pounds read as 900 and would have walked as £900.00. The host converts what it
 * can before it writes the row; what reaches here in another unit is a figure this walk cannot add.
 */
function sellsOf(rows: readonly (readonly string[])[], template: string): ForecastSell[] {
  const unit = unitOf(template);
  return rows.flatMap((r) => {
    const cell = r[3]?.trim() ?? '';
    const v = signedOf(cell);
    const label = r[2]?.trim() ?? '';
    return r[0]?.trim() === 'sell' && label && Number.isFinite(v) && v > 0 && unitOf(cell) === unit ? [{ label, value: v }] : [];
  });
}

/** A `group` row's id and this walk's key in it, or `null` when either is blank. */
function groupOf(row: readonly string[] | undefined): ForecastModel['group'] {
  const id = row?.[1]?.trim() ?? '';
  const key = row?.[2]?.trim() ?? '';
  return id && key ? { id, key } : null;
}

/** The knobs untouched: the walk as the host made it. */
export const baseKnobs = (model: ForecastModel): Knobs => ({ horizon: model.horizon, late: 0, spend: 0, leave: [] });

export const knobsMoved = (model: ForecastModel, k: Knobs): boolean =>
  k.horizon !== model.horizon ||
  k.late !== 0 ||
  k.spend !== 0 ||
  k.leave.length > 0 ||
  (k.grow?.in ?? 0) !== 0 ||
  (k.grow?.out ?? 0) !== 0 ||
  Object.values(k.drift ?? {}).some((n) => n !== 0) ||
  Boolean(k.sell);

const cents = (n: number): number => Math.round(n * 100) / 100;

/**
 * An amount scaled and rounded to the cent on its size, with its sign put back after.
 *
 * `cents` ON THE SIGNED VALUE ROUNDS A HALF CENT UP FOR MONEY IN AND DOWN FOR MONEY OUT, because `Math.round(-0.5)` is
 * `-0`: the same rent grown by the same percentage would come out a cent apart as a cost and as a refund.
 */
const scaled = (v: number, by: number): number => (by === 1 ? v : Math.sign(v) * cents(Math.abs(v) * by));

/**
 * What a percentage a year comes to by a day, compounded from today: `10` over half a year is `1.1 ** 0.5`.
 *
 * FROM TODAY AND NEVER BEFORE IT, so an overdue step, which the model already puts on today, is today's money and has
 * not grown. The year is `MONTH_DAYS` twelve times, so a year of the spend knob's drip and a year of growth agree.
 */
const grownBy = (percent: number, today: string, day: string): number =>
  percent === 0 ? 1 : (1 + percent / 100) ** (Math.max(0, daysBetween(today, day)) / YEAR_DAYS);

/** The walk with the knobs applied. */
export function scenario(model: ForecastModel, knobs: Knobs): Scenario {
  const horizon = Math.max(1, Math.min(model.horizon, Math.round(knobs.horizon)));
  const end = addDays(model.today, horizon);
  const leave = new Set(knobs.leave);
  const grow = knobs.grow ?? { in: 0, out: 0 };
  const drift = knobs.drift ?? {};
  /* HOLDINGS SOLD ON A DAY ALREADY GONE ARE SOLD TODAY, as an overdue step is walked today: the money has not arrived. */
  const soldOn = knobs.sell && ISO.test(knobs.sell) ? (knobs.sell < model.today ? model.today : knobs.sell) : null;
  const sold: ForecastStep[] = soldOn ? model.sells.map((s) => ({ day: soldOn, label: s.label, delta: s.value })) : [];
  const steps = model.steps
    /* A PLAN LEFT OUT IS EVERY PART OF IT, whose labels all differ, so the knob holds the plan's name as `of` says it. */
    .filter((s) => !leave.has(s.label) && !(s.of !== undefined && leave.has(s.of)))
    .map((s) => {
      /* GROWTH BY THE DAY THE MONEY WAS DUE, AND DRIFT BY THE DAY IT ARRIVES. An invoice paid ten days late is not ten
         days bigger, but the dollars in it are changed into pounds on the day they come. */
      const grown = grownBy(s.delta > 0 ? grow.in : grow.out, model.today, s.day);
      const day = s.delta > 0 && knobs.late > 0 ? addDays(s.day, knobs.late) : s.day;
      const drifted = s.pair ? grownBy(drift[s.pair] ?? 0, model.today, day) : 1;
      return grown === 1 && drifted === 1 && day === s.day ? s : { ...s, day, delta: scaled(s.delta, grown * drifted) };
    })
    .concat(sold)
    .filter((s) => s.day <= end)
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (a.s.day < b.s.day ? -1 : a.s.day > b.s.day ? 1 : a.i - b.i))
    .map(({ s }) => s);
  const perDay = knobs.spend / MONTH_DAYS;
  /* SPENDING THE RECORD DOES NOT KNOW IS SPENDING, so it grows with the rest of it, a day's worth at a time. Without
     growth it stays `perDay * d`, the same arithmetic as before this knob, to the float. */
  let dripped = 0;
  const drip = (d: number, day: string): number => {
    if (grow.out === 0) return perDay * d;
    if (d > 0) dripped += perDay * grownBy(grow.out, model.today, day);
    return dripped;
  };
  const days: Scenario['days'] = [];
  const after: Scenario['steps'] = [];
  let moved = 0;
  let k = 0;
  for (let d = 0; d <= horizon; d++) {
    const day = addDays(model.today, d);
    const spent = drip(d, day);
    while (k < steps.length && steps[k]!.day <= day) {
      moved += steps[k]!.delta;
      after.push({ ...steps[k]!, balance: cents(model.opening + moved - spent) });
      k++;
    }
    days.push({ day, balance: cents(model.opening + moved - spent) });
  }
  const crossed = days.find((p) => p.balance < 0) ?? null;
  const lowest = days.reduce((low, p) => (p.balance < low.balance ? p : low), days[0]!);
  return { horizon, days, steps: after, crossed, lowest };
}

/** One length the horizon knob offers: how many days it walks, and how a person says it. */
export type HorizonChoice = { days: number; label: string };

/** What the knob offers when the block declared no `horizons:`: a quarter, half a year and a year, in days. */
const HORIZONS_SAID = [91, 183, 365] as const;

/**
 * How far past the walk a choice may reach and still be offered, drawn as the walk. A six-month choice over a walk of
 * 180 days is 183 days, and refusing it for three days would take away the choice the walk was declared for.
 */
const HORIZON_SLACK = 7;

/**
 * The horizon choices that fit inside the walk the host made, in the order the block declared them, each once.
 *
 * NO CHOICE REACHES PAST THE WALK. The host walks as far as the block's `horizon:` and no further (`pages.ts`
 * `recordedOf`), so a five-year choice over a one-year walk would draw the same year under a longer name. `last` is the
 * day of the walk's last dated movement, which the walk itself holds.
 */
export function horizonChoices(model: ForecastModel): HorizonChoice[] {
  const out: HorizonChoice[] = [];
  for (const h of model.horizons ?? HORIZONS_SAID) {
    const choice = h === 'last' ? lastChoice(model) : h - HORIZON_SLACK <= model.horizon ? { days: Math.min(h, model.horizon), label: spanWords(h) } : null;
    if (choice && !out.some((c) => c.days === choice.days)) out.push(choice);
  }
  return out;
}

/** "To the end": as far as the walk's last dated movement, or `null` when nothing is dated after today. */
function lastChoice(model: ForecastModel): HorizonChoice | null {
  const last = model.steps.reduce((most, s) => (s.day > most ? s.day : most), model.today);
  const days = Math.min(daysBetween(model.today, last), model.horizon);
  return days >= 1 ? { days, label: FORECAST_TO_END } : null;
}

/** How near a length must be to whole months or whole years, in days, to be said in them. */
const MONTH_NEAR = 4;
const YEAR_NEAR = 7;

/** A length as a person says it: `3 months`, `1 year`, `5 years`, or `45 days` when it is neither. */
function spanWords(days: number): string {
  const years = Math.round(days / YEAR_DAYS);
  if (years >= 1 && Math.abs(days - years * YEAR_DAYS) <= YEAR_NEAR) return forecastYears(years);
  const months = Math.round(days / MONTH_DAYS);
  if (months >= 1 && Math.abs(days - months * MONTH_DAYS) <= MONTH_NEAR) return forecastMonths(months);
  return forecastDays(days);
}

/** How many stops the spend slider has at most, so every stop is a figure a person would say. */
const SPEND_STOPS = 50;
/** The months of going out the spend slider's reach is measured over. */
const SPEND_MONTHS = 3;

/** The spend slider's reach and its step, both in the walk's own money. */
export type SpendRange = { max: number; step: number };

/**
 * The spend slider: from nothing to twice what goes out in an average month, in steps that are round in the money
 * the walk is drawn in (1, 2 or 5 times a power of ten of its units), never finer than one unit of it.
 *
 * THE AVERAGE OF THE LAST THREE MONTHS GOING OUT, which the host sends on a `spent` row (`model.spent`). A walk that
 * came without one is measured by its own first three months ahead instead, because that is the money going out the
 * other rows hold: a walk carries what is dated ahead of today and nothing of what was spent before it. It was a fixed
 * 0 to 5,000 in steps of 100 in whatever money the walk was in, so one slider reached a month's rent in one currency
 * and a fraction of one in another.
 *
 * A WALK WITH NOTHING GOING OUT reaches a sixth of its opening balance, twice a twelfth, the same measure of a month;
 * and a walk with neither has only the smallest stops.
 */
export function spendRange(model: ForecastModel): SpendRange {
  const until = addDays(model.today, Math.round(SPEND_MONTHS * MONTH_DAYS));
  const ahead = model.steps.reduce((n, s) => (s.delta < 0 && s.day <= until ? n - s.delta : n), 0) / SPEND_MONTHS;
  const month = model.spent ?? (ahead > 0 ? ahead : Math.abs(model.opening) / 12);
  if (!(month > 0)) return { max: SPEND_STOPS, step: 1 };
  const step = roundStep((2 * month) / SPEND_STOPS);
  return { max: Math.max(step, Math.ceil((2 * month) / step) * step), step };
}

/** The round number at or above `n`, 1, 2 or 5 times a power of ten, and never less than one of the money's units. */
function roundStep(n: number): number {
  if (!(n > 1)) return 1;
  const tens = 10 ** Math.floor(Math.log10(n));
  const lead = n / tens;
  return (lead <= 1 ? 1 : lead <= 2 ? 2 : lead <= 5 ? 5 : 10) * tens;
}

/** The five movements that weigh most, by label, with their summed amount as drawn. */
export function largest(model: ForecastModel, most = 5): { label: string; amount: string }[] {
  const by = new Map<string, { sum: number; weight: number }>();
  for (const s of model.steps) {
    const g = by.get(s.label) ?? { sum: 0, weight: 0 };
    g.sum += s.delta;
    g.weight += Math.abs(s.delta);
    by.set(s.label, g);
  }
  return [...by.entries()]
    .filter(([label]) => label !== '')
    .sort((a, b) => b[1].weight - a[1].weight)
    .slice(0, most)
    .map(([label, g]) => ({ label, amount: figureLike(model.template, g.sum) }));
}

/**
 * The streams and the plans a reader may count in or out: every movement that happens more than once, by the plan it
 * is part of when the host said so and by its label when not, money in apart from money out and the heaviest first.
 *
 * MORE THAN ONCE, because that is what a stream or a plan is without naming either: a salary comes every month and a
 * plan has parts. A movement that happens once is a one-off, which `countsOf` offers beside these when it weighs.
 */
export function streamsOf(model: ForecastModel): { in: { label: string; amount: string }[]; out: { label: string; amount: string }[] } {
  const by = new Map<string, { sum: number; weight: number; n: number }>();
  for (const s of model.steps) {
    const key = s.of ?? s.label;
    if (key === '') continue;
    const g = by.get(key) ?? { sum: 0, weight: 0, n: 0 };
    g.sum += s.delta;
    g.weight += Math.abs(s.delta);
    g.n += 1;
    by.set(key, g);
  }
  const all = [...by.entries()].filter(([, g]) => g.n > 1).sort((a, b) => b[1].weight - a[1].weight);
  const said = ([label, g]: [string, { sum: number }]) => ({ label, amount: figureLike(model.template, g.sum) });
  return { in: all.filter(([, g]) => g.sum > 0).map(said), out: all.filter(([, g]) => g.sum <= 0).map(said) };
}

/** A stream, a plan or a one-off a reader may count in or out, with its amount as drawn. */
export type Counted = { label: string; amount: string };

/**
 * Everything "What counts" offers, money in apart from money out and the heaviest first: every stream and plan
 * (`streamsOf`), and the `most` heaviest movements that happen once.
 *
 * ONE CONTROL, ONE MEANING OF ON. "Leave out" offered the heavy movements and "What counts" the streams, over the one
 * list of what is left out, and a chip pressed in one meant the opposite of a chip pressed in the other. A movement
 * is keyed as `streamsOf` keys it, by the plan it is part of and by its label when not, which is what `scenario`
 * leaves out.
 */
export function countsOf(model: ForecastModel, most = 5): { in: Counted[]; out: Counted[] } {
  const by = new Map<string, { sum: number; weight: number; n: number }>();
  for (const s of model.steps) {
    const key = s.of ?? s.label;
    if (key === '') continue;
    const g = by.get(key) ?? { sum: 0, weight: 0, n: 0 };
    g.sum += s.delta;
    g.weight += Math.abs(s.delta);
    g.n += 1;
    by.set(key, g);
  }
  const all = [...by.entries()];
  const heaviest = (a: [string, { weight: number }], b: [string, { weight: number }]) => b[1].weight - a[1].weight;
  const once = all.filter(([, g]) => g.n === 1).sort(heaviest).slice(0, most);
  const offered = [...all.filter(([, g]) => g.n > 1), ...once].sort(heaviest);
  /* A SWITCH'S AMOUNT IS SAID SHORT, `−£54,560`, since it says how much a stream weighs and the table says it exactly. */
  const said = ([label, g]: [string, { sum: number }]): Counted => ({ label, amount: headlineFigure(figureLike(model.template, g.sum)) });
  return { in: offered.filter(([, g]) => g.sum > 0).map(said), out: offered.filter(([, g]) => g.sum <= 0).map(said) };
}

/** Every pair a step of this walk was converted through, which the drift knob offers one slider each. */
export const pairsOf = (model: ForecastModel): string[] => [...new Set(model.steps.flatMap((s) => (s.pair ? [s.pair] : [])))].sort();

/** How the scenario compares with the baseline, in words, or '' when nothing moved. */
export function against(base: Scenario, shown: Scenario, moved: boolean): string {
  if (!moved) return '';
  if (base.crossed && shown.crossed) {
    const n = daysBetween(base.crossed.day, shown.crossed.day);
    if (n === 0) return FORECAST_SAME;
    return n < 0 ? forecastSooner(-n) : forecastLater(n);
  }
  if (base.crossed) return FORECAST_NO_LONGER;
  if (shown.crossed) return forecastNow(shortDay(shown.crossed.day));
  return FORECAST_STILL;
}

export type ForecastPlan = {
  /** The sentence over the chart, and whether it is the warning. */
  said: string;
  warn: boolean;
  past: string;
  future: string;
  /** The soft wash between the balance and the zero rule, remembered and walked alike, as one closed path. */
  area: string;
  base: string;
  zero: string;
  /** The rules at the axis's other round steps, faint, and `''` when zero is the only one. */
  grid: string;
  /** The crossing's dot and where its label sits, as a fraction across. */
  cross: { d: string; at: string; day: string } | null;
  low: string;
  ticks: { at: string; label: string }[];
  /** The start and the end of the time axis, for the scrub. */
  start: string;
  span: number;
  lo: number;
  hi: number;
  /**
   * The value axis, top first: each round step as a share of the height from the top (`--at`), said short, and which of
   * them is zero. ONE SIDE AND ONE SCALE, where the axis was its top in the far corner and its bottom in the near one,
   * each the walk's own extreme to the penny (`£31,035.00 GBP` over `−£127,489.90 GBP`), which no reader could read
   * a level between.
   */
  axis: { at: string; label: string; zero: boolean }[];
  sentence: string;
};

/** About how many round steps the value axis is cut into; `roundStep` rounds up, so never more than this and one. */
const AXIS_STEPS = 4;

/** How many month names the time axis holds at most, when it names every month. */
const TICKS_MOST = 12;
/**
 * How many names it holds at most when it skips months. HALF, because a phone keeps every other name from seven up
 * (`blocks-charts.css`), and every other name of "2027 Jul 2028 Jul" is four Julys and no year.
 */
const TICKS_SPACED = 6;
/** The months between two names on the time axis, tried in order: every month, a quarter, half a year, a year. */
const TICK_EVERY = [1, 3, 6, 12] as const;

/**
 * A name on the time axis: the month, and the year where the names are a year apart or a year begins between them.
 *
 * A JANUARY SAYS ITS YEAR ONCE THE AXIS SKIPS MONTHS, because "Jan Jul Jan Jul" does not say which year a point is in,
 * and a line two years long is read by its years.
 */
function tickLabel(day: string, every: number): string {
  const m = Number(day.slice(5, 7)) - 1;
  return every > 1 && m === 0 ? day.slice(0, 4) : MONTHS[m]!;
}

/**
 * The paths, the marks and the words for one scenario, with the baseline drawn faint when a knob has
 * moved. The value axis always holds zero, and runs from the round step at or below the lowest balance
 * to the one at or above the highest.
 */
export function forecastPlan(model: ForecastModel, shown: Scenario, base: Scenario | null = null): ForecastPlan {
  const start = model.past[0]?.day ?? model.today;
  const end = addDays(model.today, shown.horizon);
  const span = Math.max(1, daysBetween(start, end));
  const values = [0, ...model.past.map((p) => p.value), ...shown.days.map((p) => p.balance), ...(base?.days.filter((p) => p.day <= end).map((p) => p.balance) ?? [])];
  const step = roundStep((Math.max(...values) - Math.min(...values)) / AXIS_STEPS);
  const lo = Math.floor(Math.min(...values) / step) * step;
  const hi = Math.max(lo + step, Math.ceil(Math.max(...values) / step) * step);
  const x = (day: string) => at((daysBetween(start, day) / span) * 1000);
  const y = (v: number) => at(((hi - v) / (hi - lo)) * 100);
  const levels: number[] = [];
  for (let v = hi; v >= lo - step / 2; v -= step) levels.push(Math.abs(v) < step / 2 ? 0 : v);

  let past = '';
  let prev: string | null = null;
  for (const p of model.past) {
    past += `${past ? ' ' : ''}${prev !== null && daysBetween(prev, p.day) === 1 ? 'L' : 'M'}${x(p.day)} ${y(p.value)}`;
    prev = p.day;
  }
  if (prev !== null && daysBetween(prev, model.today) === 1) past += ` L${x(model.today)} ${y(model.opening)}`;

  const line = (days: Scenario['days']) =>
    days.filter((p) => p.day <= end).map((p, i) => `${i ? 'L' : 'M'}${x(p.day)} ${y(p.balance)}`).join(' ');

  /* THE WASH RUNS UNDER BOTH LINES AS ONE SHAPE, down to the zero rule at its two ends, so a walk that goes under
     washes the part below zero as well; a day the record did not remember is bridged, as the eye bridges it. */
  const points = [...model.past.map((p) => ({ day: p.day, v: p.value })), ...shown.days.filter((p) => p.day <= end).map((p) => ({ day: p.day, v: p.balance }))];
  const area = points.length > 1
    ? `M${x(points[0]!.day)} ${y(0)} ${points.map((p) => `L${x(p.day)} ${y(p.v)}`).join(' ')} L${x(points.at(-1)!.day)} ${y(0)}Z`
    : '';

  const starts: { d: number; day: string }[] = [];
  for (let d = 0; d <= span; d++) {
    const day = addDays(start, d);
    /* NOT AT THE VERY EDGES, where half the word would hang outside the chart. */
    if (day.endsWith('-01') && d / span > 0.03 && d / span < 0.97) starts.push({ d, day });
  }
  /* THE FEWEST MONTHS BETWEEN TWO NAMES THAT KEEP THE AXIS SHORT, each on its calendar's own months (a quarter is
     January, April, July and October), so a five-year walk names five Januaries by their years and not sixty months run
     into one another. */
  const month = (day: string): number => Number(day.slice(5, 7)) - 1;
  const every = TICK_EVERY.find((n) => starts.filter((s) => month(s.day) % n === 0).length <= (n === 1 ? TICKS_MOST : TICKS_SPACED)) ?? 12;
  const ticks: ForecastPlan['ticks'] = starts
    .filter((s) => month(s.day) % every === 0)
    .map((s) => ({ at: at(s.d / span), label: tickLabel(s.day, every) }));

  const c = shown.crossed;
  const said = c ? forecastUnder(shortDay(c.day)) : forecastAbove(shortDay(end));
  const figure = (v: number) => figureLike(model.template, v);
  /* `--at` IS A SHARE, as every chart's ticks read it, and `y` answers in the box's hundred units. */
  const axis = levels.map((v) => ({ at: String(Math.round(Number(y(v)) * 100) / 10_000), label: axisFigure(figure(v)), zero: v === 0 }));
  const sentence = [
    `${model.label || FORECAST_BALANCE} ${figure(model.opening)} ${FORECAST_TODAY}`,
    model.past.length ? forecastRecorded(shortDay(model.past[0]!.day), figure(model.past[0]!.value)) : '',
    said,
    forecastLowest(figure(shown.lowest.balance), shortDay(shown.lowest.day)),
  ]
    .filter(Boolean)
    .join('. ');

  return {
    said,
    warn: c !== null,
    past,
    future: line(shown.days),
    area,
    base: base ? line(base.days) : '',
    zero: y(0),
    grid: levels.filter((v) => v !== 0).map((v) => `M0 ${y(v)}H1000`).join(' '),
    cross: c ? { d: `M${x(c.day)} ${y(c.balance)}h0`, at: at(daysBetween(start, c.day) / span), day: shortDay(c.day) } : null,
    low: `M${x(shown.lowest.day)} ${y(shown.lowest.balance)}h0`,
    ticks,
    start,
    span,
    lo,
    hi,
    axis,
    sentence: `${sentence}.`,
  };
}

/**
 * The sentence under the chart when the walk goes under soon: `Cash goes under in 24 days`, or '' when it
 * does not go under within the block's `under:` reach, or the block set none.
 */
export function underNote(model: ForecastModel, shown: Scenario): string {
  if (model.under === null || !shown.crossed) return '';
  const n = daysBetween(model.today, shown.crossed.day);
  return n <= model.under ? forecastUnderIn(n) : '';
}

/** What the scrub reads at a fraction across the chart: the day, its balance and what moved on it. */
export function readoutAt(model: ForecastModel, shown: Scenario, plan: ForecastPlan, fraction: number) {
  const f = Math.max(0, Math.min(1, fraction));
  const day = addDays(plan.start, Math.round(f * plan.span));
  const balance = day < model.today ? (model.past.find((p) => p.day === day)?.value ?? null) : (shown.days.find((p) => p.day === day)?.balance ?? null);
  return {
    at: at(daysBetween(plan.start, day) / plan.span),
    flip: f > 0.5,
    day: shortDay(day),
    balance: balance === null ? MISSING : headlineFigure(figureLike(model.template, balance)),
    moves: shown.steps.filter((s) => s.day === day).slice(0, 3).map((s) => ({ label: s.label, amount: headlineFigure(figureLike(model.template, s.delta)) })),
  };
}

/**
 * The paints the wash and the faint rules carry as attributes, as `ROADMAP_PAINT` gives its marks, so a page with no rule
 * for them draws a quiet wash and hairlines rather than a black slab; every rule in the host's stylesheet wins over them.
 */
export const FORECAST_PAINT = {
  area: { fill: 'currentColor', 'fill-opacity': '0.06', stroke: 'none' },
  grid: { fill: 'none', stroke: 'currentColor', 'stroke-opacity': '0.08' },
} as const satisfies Record<string, Readonly<Record<string, string>>>;

/** The renderer's own words, as `split.ts` keeps `SPLIT_ZERO`: it imports nothing from the app. */
export const FORECAST_NONE = 'There is no balance to walk from, so there is no forecast yet.';
export const FORECAST_NUMBERS = 'Every movement';
export const FORECAST_WHEN = 'When';
export const FORECAST_WHAT = 'What';
export const FORECAST_MOVE = 'In and out';
export const FORECAST_BALANCE = 'Balance';
export const FORECAST_TODAY = 'today';
export const FORECAST_HORIZON = 'Horizon';
export const FORECAST_LATE = 'Money in arrives late by';
export const FORECAST_SPEND = "Spending the record doesn't know";
export const FORECAST_SPEND_NOTE = "the record only knows bills you've entered";
export const FORECAST_GROW_OUT = 'Spending grows by';
export const FORECAST_GROW_IN = 'Money in grows by';
export const FORECAST_COUNT = 'What counts';
export const FORECAST_COUNT_IN = 'Money in';
export const FORECAST_COUNT_OUT = 'Money out';
/**
 * How many switches What counts shows a side before the rest wait behind "N more". The seed's year of money out was
 * twenty-five of them in a wall, heaviest first, and the first few are the ones a question is asked of.
 */
export const FORECAST_COUNTS_SHOWN = 6;
export const forecastMore = (n: number): string => `${n} more`;
export const FORECAST_SELL_NOTE = 'empty keeps them';
export const forecastPerYear = (n: number): string => `${n}% a year`;
/**
 * The drift knob for one pair, each currency by its name and never its code:
 * `The US dollar against the Egyptian pound moves by`.
 */
export const forecastDrift = (pair: string): string => {
  const [from, to] = pair.split(' to ');
  return `The ${currencyName(from ?? '')} against the ${currencyName(to ?? '')} moves by`;
};
/** What the drift knob's number means, from the pair: `above zero, one US dollar buys more each year`. */
export const forecastDriftNote = (pair: string): string => `above zero, one ${currencyName(pair.split(' to ')[0] ?? '')} buys more each year`;
/** The sell knob, naming what it sells as the host called it: `Gold, Bonds sold on`. */
export const forecastSold = (labels: readonly string[]): string => `${labels.join(', ')} sold on`;
export const FORECAST_RESET = 'Reset';
/** The one quiet control for every knob: it opens them under the chart where the block has the room, and in a sheet where it does not. */
export const FORECAST_ADJUST = 'Adjust';
export const FORECAST_FULL = 'Open full screen';
export const FORECAST_CLOSE = 'Close';
export const FORECAST_SHOW_IN = 'Show in';
export const FORECAST_TO_END = 'To the end';
/** Under the "Show in" control while another currency is shown: the day of the rate every amount was converted at. */
export const forecastRateOf = (day: string): string => `converted at the rate of ${shortDay(day)}`;
export const FORECAST_SAME = 'Goes under on the same day as before';
export const FORECAST_NO_LONGER = 'No longer goes under';
export const FORECAST_STILL = 'Still stays above zero';
export const forecastUnder = (day: string): string => `Goes under on ${day}`;
export const forecastAbove = (day: string): string => `Stays above zero to ${day}`;
export const forecastSooner = (n: number): string => `${n} ${n === 1 ? 'day' : 'days'} sooner than before`;
export const forecastLater = (n: number): string => `${n} ${n === 1 ? 'day' : 'days'} later than before`;
export const forecastNow = (day: string): string => `Now goes under on ${day}`;
export const forecastMonths = (n: number): string => `${n} ${n === 1 ? 'month' : 'months'}`;
export const forecastYears = (n: number): string => `${n} ${n === 1 ? 'year' : 'years'}`;
export const forecastDays = (n: number): string => `${n} ${n === 1 ? 'day' : 'days'}`;
export const forecastPerMonth = (figure: string): string => `${figure} a month`;
/** Spending the record does not know in one currency of a walk drawn once per currency, the currency by its name. */
export const forecastSpendIn = (key: string): string => `${FORECAST_SPEND}, in ${/^[A-Z]{3}$/u.test(key) ? currencyName(key) : key}`;
export const forecastRecorded = (day: string, figure: string): string => `recorded from ${day}, when it was ${figure}`;
export const forecastUnderIn = (n: number): string => (n <= 0 ? 'Cash goes under today' : `Cash goes under in ${n} ${n === 1 ? 'day' : 'days'}`);
export const forecastAverage = (n: number): string => (n <= 0 ? 'on average so far: on time' : `on average so far: ${n} ${n === 1 ? 'day' : 'days'}`);
export const forecastLowest = (figure: string, day: string): string => `Lowest ${figure} on ${day}`;
