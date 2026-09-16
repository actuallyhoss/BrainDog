/**
 * What `forecast` decides, as functions both drawers call.
 *
 * A forecast is a cash walk drawn as a line: the balance the record remembered, solid, up to today,
 * and the walk from today's balance, dashed, to the horizon. Every movement big enough to see stands
 * on the zero rule as a stem, and the first day the balance goes under is marked and said in words.
 *
 * THE KNOBS ARE ARITHMETIC OVER THE STEPS THE HOST SENT, not a second query. Clients paying later
 * moves every incoming step; spending the record does not know about takes a little every day; a
 * movement left out is every occurrence of it. The walk the host made is the baseline, and a knob
 * never reaches the record or the address.
 */

import { MISSING } from './format.ts';
import { signedOf } from './bridge.ts';
import { figureLike } from './figure.ts';

const at = (n: number): string => String(Math.round(n * 100) / 100);
const DAY_MS = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/u;
const MONTH_DAYS = 30.4375;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const FORECAST_KNOBS = ['horizon', 'late', 'spend', 'leave'] as const;
export type ForecastKnob = (typeof FORECAST_KNOBS)[number];

export type ForecastStep = { day: string; label: string; delta: number };

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
  knobs: ForecastKnob[];
  /** How many days late money has come in on average, which the late knob marks, or `null` when the host sent none. */
  late: number | null;
  /** How near a crossing is said under the chart, in days, or `null` when it is never said. */
  under: number | null;
};

export type Knobs = { horizon: number; late: number; spend: number; leave: readonly string[] };

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
    steps: rows.flatMap((r) => {
      const v = signedOf(r[3] ?? '');
      const d = r[1]?.trim() ?? '';
      return r[0]?.trim() === 'step' && ISO.test(d) && Number.isFinite(v) ? [{ day: d < today ? today : d, label: r[2]?.trim() ?? '', delta: v }] : [];
    }),
    horizon: Number.isInteger(horizonCell) && horizonCell > 0 ? horizonCell : 180,
    knobs: FORECAST_KNOBS.filter((k) => knobWords.includes(k)),
    late: whole(rows.find((r) => r[0]?.trim() === 'late')?.[1]),
    under: whole(rows.find((r) => r[0]?.trim() === 'under')?.[1], 1),
  };
}

/** The knobs untouched: the walk as the host made it. */
export const baseKnobs = (model: ForecastModel): Knobs => ({ horizon: model.horizon, late: 0, spend: 0, leave: [] });

export const knobsMoved = (model: ForecastModel, k: Knobs): boolean =>
  k.horizon !== model.horizon || k.late !== 0 || k.spend !== 0 || k.leave.length > 0;

const cents = (n: number): number => Math.round(n * 100) / 100;

/** The walk with the knobs applied. */
export function scenario(model: ForecastModel, knobs: Knobs): Scenario {
  const horizon = Math.max(1, Math.min(model.horizon, Math.round(knobs.horizon)));
  const end = addDays(model.today, horizon);
  const leave = new Set(knobs.leave);
  const steps = model.steps
    .filter((s) => !leave.has(s.label))
    .map((s) => (s.delta > 0 && knobs.late > 0 ? { ...s, day: addDays(s.day, knobs.late) } : s))
    .filter((s) => s.day <= end)
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (a.s.day < b.s.day ? -1 : a.s.day > b.s.day ? 1 : a.i - b.i))
    .map(({ s }) => s);
  const perDay = knobs.spend / MONTH_DAYS;
  const days: Scenario['days'] = [];
  const after: Scenario['steps'] = [];
  let moved = 0;
  let k = 0;
  for (let d = 0; d <= horizon; d++) {
    const day = addDays(model.today, d);
    while (k < steps.length && steps[k]!.day <= day) {
      moved += steps[k]!.delta;
      after.push({ ...steps[k]!, balance: cents(model.opening + moved - perDay * d) });
      k++;
    }
    days.push({ day, balance: cents(model.opening + moved - perDay * d) });
  }
  const crossed = days.find((p) => p.balance < 0) ?? null;
  const lowest = days.reduce((low, p) => (p.balance < low.balance ? p : low), days[0]!);
  return { horizon, days, steps: after, crossed, lowest };
}

/** The horizon choices, in months, that fit inside the declared walk: `[[3, 91], [6, 180]]`. */
export function horizonChoices(model: ForecastModel): [number, number][] {
  return ([3, 6, 12] as const).flatMap((m): [number, number][] => {
    const days = Math.round(m * MONTH_DAYS);
    return days - 7 <= model.horizon ? [[m, Math.min(days, model.horizon)]] : [];
  });
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
  base: string;
  zero: string;
  up: string;
  down: string;
  /** The crossing's dot and where its label sits, as a fraction across. */
  cross: { d: string; at: string; day: string } | null;
  low: string;
  ticks: { at: string; label: string }[];
  /** The start and the end of the time axis, for the scrub. */
  start: string;
  span: number;
  lo: number;
  hi: number;
  /** The top and the bottom of the value axis, written like the opening figure. */
  top: string;
  bottom: string;
  sentence: string;
};

/**
 * The paths, the marks and the words for one scenario, with the baseline drawn faint when a knob has
 * moved. The value axis always holds zero, and a stem stands for every movement worth at least a
 * twentieth of the range the balances cover.
 */
export function forecastPlan(model: ForecastModel, shown: Scenario, base: Scenario | null = null): ForecastPlan {
  const start = model.past[0]?.day ?? model.today;
  const end = addDays(model.today, shown.horizon);
  const span = Math.max(1, daysBetween(start, end));
  const values = [0, ...model.past.map((p) => p.value), ...shown.days.map((p) => p.balance), ...(base?.days.filter((p) => p.day <= end).map((p) => p.balance) ?? [])];
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const range = hi - lo || 1;
  const stems = shown.steps.filter((s) => Math.abs(s.delta) >= range * 0.05);
  lo = Math.min(lo, ...stems.map((s) => s.delta));
  hi = Math.max(hi, ...stems.map((s) => s.delta));
  if (hi === lo) hi = lo + 1;
  const x = (day: string) => at((daysBetween(start, day) / span) * 1000);
  const y = (v: number) => at(((hi - v) / (hi - lo)) * 100);

  let past = '';
  let prev: string | null = null;
  for (const p of model.past) {
    past += `${past ? ' ' : ''}${prev !== null && daysBetween(prev, p.day) === 1 ? 'L' : 'M'}${x(p.day)} ${y(p.value)}`;
    prev = p.day;
  }
  if (prev !== null && daysBetween(prev, model.today) === 1) past += ` L${x(model.today)} ${y(model.opening)}`;

  const line = (days: Scenario['days']) =>
    days.filter((p) => p.day <= end).map((p, i) => `${i ? 'L' : 'M'}${x(p.day)} ${y(p.balance)}`).join(' ');

  const stem = (dir: 1 | -1) =>
    stems
      .filter((s) => Math.sign(s.delta) === dir)
      .map((s) => `M${x(s.day)} ${y(0)}V${y(s.delta)}`)
      .join(' ');

  const ticks: ForecastPlan['ticks'] = [];
  for (let d = 0; d <= span; d++) {
    const day = addDays(start, d);
    /* NOT AT THE VERY EDGES, where half the word would hang outside the chart. */
    if (day.endsWith('-01') && d / span > 0.03 && d / span < 0.97) ticks.push({ at: at(d / span), label: MONTHS[Number(day.slice(5, 7)) - 1]! });
  }

  const c = shown.crossed;
  const said = c ? forecastUnder(shortDay(c.day)) : forecastAbove(shortDay(end));
  const figure = (v: number) => figureLike(model.template, v);
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
    base: base ? line(base.days) : '',
    zero: y(0),
    up: stem(1),
    down: stem(-1),
    cross: c ? { d: `M${x(c.day)} ${y(c.balance)}h0`, at: at(daysBetween(start, c.day) / span), day: shortDay(c.day) } : null,
    low: `M${x(shown.lowest.day)} ${y(shown.lowest.balance)}h0`,
    ticks,
    start,
    span,
    lo,
    hi,
    top: figure(hi),
    bottom: figure(lo),
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
    balance: balance === null ? MISSING : figureLike(model.template, balance),
    moves: shown.steps.filter((s) => s.day === day).slice(0, 3).map((s) => ({ label: s.label, amount: figureLike(model.template, s.delta) })),
  };
}

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
export const FORECAST_LEAVE = 'Leave out';
export const FORECAST_RESET = 'Reset';
export const FORECAST_SAME = 'Goes under on the same day as before';
export const FORECAST_NO_LONGER = 'No longer goes under';
export const FORECAST_STILL = 'Still stays above zero';
export const forecastUnder = (day: string): string => `Goes under on ${day}`;
export const forecastAbove = (day: string): string => `Stays above zero to ${day}`;
export const forecastSooner = (n: number): string => `${n} ${n === 1 ? 'day' : 'days'} sooner than before`;
export const forecastLater = (n: number): string => `${n} ${n === 1 ? 'day' : 'days'} later than before`;
export const forecastNow = (day: string): string => `Now goes under on ${day}`;
export const forecastMonths = (n: number): string => `${n} months`;
export const forecastDays = (n: number): string => `${n} ${n === 1 ? 'day' : 'days'}`;
export const forecastPerMonth = (figure: string): string => `${figure} a month`;
export const forecastRecorded = (day: string, figure: string): string => `recorded from ${day}, when it was ${figure}`;
export const forecastUnderIn = (n: number): string => (n <= 0 ? 'Cash goes under today' : `Cash goes under in ${n} ${n === 1 ? 'day' : 'days'}`);
export const forecastAverage = (n: number): string => (n <= 0 ? 'on average so far: on time' : `on average so far: ${n} ${n === 1 ? 'day' : 'days'}`);
export const forecastLowest = (figure: string, day: string): string => `Lowest ${figure} on ${day}`;
