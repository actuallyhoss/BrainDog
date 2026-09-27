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
 *
 * AND THE FIVE THE OLD TOOL'S FORECAST HAD THAT THIS ONE DID NOT (brief B6 of `loop/research-legacy-parity.md`) ARE
 * THE SAME KIND OF ARITHMETIC, which is what keeps them equal in both engines: the kernel's walk and the browser's
 * both reach this file as rows, so a control applied here is applied to either. Spending and money in grow by a
 * percentage a year from today; a converted step moves with a yearly drift in its pair; a stream or a plan is counted
 * in or out whole; and holdings the host sends a figure for arrive on a day a reader picks. What a control needs to
 * know about a step beyond its day and amount comes on an `of` row under it, written only when the host knows it.
 */

import { MISSING, axisFigure } from './format.ts';
import { signedOf } from './bridge.ts';
import { figureLike } from './figure.ts';

const at = (n: number): string => String(Math.round(n * 100) / 100);
const DAY_MS = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/u;
const MONTH_DAYS = 30.4375;
const YEAR_DAYS = MONTH_DAYS * 12;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PAIR = /^[A-Z]{3} to [A-Z]{3}$/u;

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
    knobs: FORECAST_KNOBS.filter((k) => knobWords.includes(k)),
    late: whole(rows.find((r) => r[0]?.trim() === 'late')?.[1]),
    lateName: rows.find((r) => r[0]?.trim() === 'late')?.[2]?.trim() || null,
    under: whole(rows.find((r) => r[0]?.trim() === 'under')?.[1], 1),
    group: groupOf(rows.find((r) => r[0]?.trim() === 'group')),
    sells: sellsOf(rows, opening[3]!),
  };
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

/**
 * The streams and the plans a reader may count in or out: every movement that happens more than once, by the plan it
 * is part of when the host said so and by its label when not, money in apart from money out and the heaviest first.
 *
 * MORE THAN ONCE, because that is what a stream or a plan is without naming either: a salary comes every month and a
 * plan has parts. A movement that happens once is a one-off, which `largest` offers under Leave out when it weighs.
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
  /**
   * Whether the walk ends higher than it starts. The bottom of the axis is written in the corner the walk is not near: the
   * near one when it falls, the far one when it rises, where a rising walk started from the bottom and drew over it.
   */
  rises: boolean;
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
    top: axisFigure(figure(hi)),
    bottom: axisFigure(figure(lo)),
    rises: (shown.days.filter((p) => p.day <= end).at(-1)?.balance ?? model.opening) > (model.past[0]?.value ?? model.opening),
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
export const FORECAST_GROW_OUT = 'Spending grows by';
export const FORECAST_GROW_IN = 'Money in grows by';
export const FORECAST_COUNT = 'What counts';
export const FORECAST_COUNT_IN = 'Money in';
export const FORECAST_COUNT_OUT = 'Money out';
export const FORECAST_SELL_NOTE = 'empty keeps them';
export const forecastPerYear = (n: number): string => `${n}% a year`;
/** The drift knob for one pair: `The USD to EGP rate moves by`. */
export const forecastDrift = (pair: string): string => `The ${pair} rate moves by`;
/** What the drift knob's number means, from the pair: `how much more EGP one USD buys each year`. */
export const forecastDriftNote = (pair: string): string => {
  const [from, to] = pair.split(' to ');
  return `how much more ${to ?? ''} one ${from ?? ''} buys each year`;
};
/** The sell knob, naming what it sells as the host called it: `Gold, Bonds sold on`. */
export const forecastSold = (labels: readonly string[]): string => `${labels.join(', ')} sold on`;
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
/** Spending the record does not know in one currency of a walk drawn once per currency. */
export const forecastSpendIn = (key: string): string => `${FORECAST_SPEND}, in ${key}`;
export const forecastRecorded = (day: string, figure: string): string => `recorded from ${day}, when it was ${figure}`;
export const forecastUnderIn = (n: number): string => (n <= 0 ? 'Cash goes under today' : `Cash goes under in ${n} ${n === 1 ? 'day' : 'days'}`);
export const forecastAverage = (n: number): string => (n <= 0 ? 'on average so far: on time' : `on average so far: ${n} ${n === 1 ? 'day' : 'days'}`);
export const forecastLowest = (figure: string, day: string): string => `Lowest ${figure} on ${day}`;
