/**
 * What `forecast` decides, as functions both drawers call.
 *
 * A forecast is a cash walk drawn as a line: the balance the record remembered up to today and the walk from today's
 * balance, one solid line as far as the record knows the movements, dashed only beyond it, over a soft wash down to the
 * zero rule, split there so what is under zero can be tinted on its own. The value axis is a few round steps fitted to
 * the balances, said short (`£50k`, `£0`, `−£50k`), and holds zero only where the walk crosses it or comes near
 * (`axisFit`), or always where the block says `axis: zero`; an axis that leaves zero out marks its end nearest zero as
 * cut and says where it starts in the chart's name (`cut`, `foot`); today is a dot with its balance beside it; and the first day the balance goes under is marked, said in
 * words, and tied to the line by a thin rule.
 *
 * DASHED ONLY BEYOND WHAT IS KNOWN. The whole walk was dashed from today, so a year of entered bills and invoices read
 * as a guess from its first day (the money review: "make it a real chart"). The movements are the record's own, so
 * the line is solid to the last of them, or to the day a `known` row names, and only what lies past it is dashed.
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

import { MISSING, axisFigure, exponentOf, headlineFigure } from './format.ts';
import { signedOf } from './bridge.ts';
import { figureLike } from './figure.ts';
import { currencyOfFigure, readAmount, writeAmount, type AmountSetting } from './money.ts';
import { addDays, daysBetween, shortDay, shortMonth } from './day-math.ts';

export { addDays, daysBetween, shortDay, shortMonth };

const at = (n: number): string => String(Math.round(n * 100) / 100);
const DAY_MS = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/u;
/** A calendar month as the host writes one, `2026-07`. */
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/u;
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
  /**
   * The currency every amount of the walk is in, read from the opening cell (`currencyOf`), or `null` when that cell
   * names none this file can be sure of. Every figure is then written from a number and this, by `forecastFigure`.
   */
  currency: string | null;
  /**
   * The opening figure as the table's first line reads it: what `forecastFigure` writes for it where the currency is
   * known, and the host's own cell where it is not, which is then the shape a figure is copied from. Any other figure
   * is `forecastFigure`'s to write, never a copy of this.
   */
  template: string;
  past: { day: string; value: number }[];
  steps: ForecastStep[];
  /** How many days the chart opens on: the horizon knob at rest. */
  horizon: number;
  /**
   * How far the host walked, in days, from a `reach | 730 |  |` row: never less than `horizon`, and the same when the
   * host sent none. A chart can open on three months over a walk of two years, and the knob offers every length up to
   * the walk's own reach rather than only up to the length it opened on (visual review 4).
   */
  reach: number;
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
  /**
   * The calendar months `spent` was measured over, from the `spent` row's third cell (`2026-07..2026-09`), or `null`
   * when there is no `spent` row or the cell does not hold two months in order. The one line of everyday spending says
   * them (`forecastEveryday`).
   */
  measured: { from: string; to: string } | null;
  /**
   * The last day the walk is drawn from what the record knows, from a `known | 2026-12-31 |  |` row, or `null` when the
   * host sent none and the walk's last dated movement is it. The line is solid to it and dashed beyond.
   */
  known: string | null;
  /**
   * Whether the page's headline already says when the money runs out, from a `headline | under |  |` row. The sentence
   * over the chart is then left off while the walk is the host's own, and the flag on the crossing stays: Money said one
   * fact three times, "runs out in 57 days" over "Goes under on 30 Oct" over a flag reading 30 Oct (visual review 3).
   */
  headline: boolean;
  /**
   * Where the value axis starts, from an `axis | zero |  |` row: `zero` holds nought whatever the walk does, and `fit`,
   * what a block that says nothing gets, fits the axis to the balances and marks its end as cut where nought is off it.
   */
  axis: 'fit' | 'zero';
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
  /** Whether the walk is read as if no money came in from today (`noIncome` on `Knobs`). */
  noIncome?: boolean;
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
  ...(held.noIncome ? { noIncome: true } : {}),
});

export type Knobs = {
  horizon: number;
  late: number;
  spend: number;
  leave: readonly string[];
  grow?: Growth;
  drift?: Readonly<Record<string, number>>;
  sell?: string | null;
  /**
   * IF INCOME STOPPED: every movement of money in left out of the walk, from today. It is the walk `lasts-no-income`
   * counts, the same steps with the incoming ones gone, so the line it draws crosses where that figure says. Holdings a
   * reader counts as sold still arrive: selling is a question of its own, asked by the sell knob.
   */
  noIncome?: boolean;
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

/**
 * TODAY AS THE CHART SAYS IT: the balance at the end of today, after today's movements, which is the walk's first day.
 *
 * ONE TODAY FOR THE LINE, ITS DOT AND ITS LOWEST (polish5, 2 Nov). The dot and "Today $41,380" read the opening, before
 * today's movements, while the line started and the lowest was counted after them: an overdue invoice walked today put
 * "Lowest $44,580 today" beside "Today $41,380", and a second dot under the line's start. The opening is still what
 * the accounts hold now, and the table of movements says it; the chart says the day as it ends.
 */
export const todayBalance = (model: Pick<ForecastModel, 'opening'>, shown: Pick<Scenario, 'days'>): number => shown.days[0]?.balance ?? model.opening;

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
  const horizon = Number.isInteger(horizonCell) && horizonCell > 0 ? horizonCell : 180;
  const home = homeOf(rows.find((r) => r[0]?.trim() === 'home'));
  const currency = currencyOf(opening[3]!.trim(), home);
  const inWalk = inWalkMoney(opening[3]!, currency, home);
  const knobWords = (rows.find((r) => r[0]?.trim() === 'knobs')?.[1] ?? '').split(/\s+/u);
  return {
    today,
    label: opening[2]?.trim() ?? '',
    opening: value,
    currency,
    template: currency === null ? opening[3]!.trim() : forecastFigure({ currency, home, template: '' }, value),
    past: rows.flatMap((r) => {
      const v = signedOf(r[3] ?? '');
      const d = r[1]?.trim() ?? '';
      return r[0]?.trim() === 'past' && ISO.test(d) && d < today && Number.isFinite(v) ? [{ day: d, value: v }] : [];
    }),
    steps: stepsOf(rows, today),
    horizon,
    reach: Math.max(horizon, whole(rows.find((r) => r[0]?.trim() === 'reach')?.[1], 1) ?? 0),
    horizons: horizonsOf(rows.find((r) => r[0]?.trim() === 'horizons')),
    knobs: FORECAST_KNOBS.filter((k) => knobWords.includes(k)),
    late: whole(rows.find((r) => r[0]?.trim() === 'late')?.[1]),
    lateName: rows.find((r) => r[0]?.trim() === 'late')?.[2]?.trim() || null,
    under: whole(rows.find((r) => r[0]?.trim() === 'under')?.[1], 1),
    group: groupOf(rows.find((r) => r[0]?.trim() === 'group')),
    sells: sellsOf(rows, inWalk),
    shows: showsOf(rows),
    home,
    spent: spentOf(rows.find((r) => r[0]?.trim() === 'spent'), inWalk),
    measured: measuredOf(rows.find((r) => r[0]?.trim() === 'spent'), inWalk),
    known: knownOf(rows.find((r) => r[0]?.trim() === 'known'), today),
    headline: rows.some((r) => r[0]?.trim() === 'headline' && r[1]?.trim() === 'under'),
    /* ANY OTHER WORD IS FITTED, the board's own axis: the record refuses one at install, so a stray word here is a host's. */
    axis: rows.some((r) => r[0]?.trim() === 'axis' && r[1]?.trim() === 'zero') ? 'zero' : 'fit',
  };
}

/** A `known | 2026-12-31 |  |` row's day, or `null` when there is none, it is not a day, or it is before today. */
function knownOf(row: readonly string[] | undefined, today: string): string | null {
  const d = row?.[1]?.trim() ?? '';
  return ISO.test(d) && d >= today ? d : null;
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
function spentOf(row: readonly string[] | undefined, inWalk: (cell: string) => boolean): number | null {
  const cell = row?.[3]?.trim() ?? '';
  const v = Math.abs(signedOf(cell));
  return cell && Number.isFinite(v) && v > 0 && inWalk(cell) ? v : null;
}

/**
 * A `spent | 3 | 2026-07..2026-09 | £2,400.00` row's months, or `null`.
 *
 * ONLY BESIDE A FIGURE THIS WALK READS: months with no amount the walk can use would say how something unsaid was
 * measured. Two months out of order, or a cell in any other shape, say nothing rather than a wrong span.
 */
function measuredOf(row: readonly string[] | undefined, inWalk: (cell: string) => boolean): ForecastModel['measured'] {
  const [from = '', to = '', ...more] = (row?.[2] ?? '').trim().split('..');
  if (more.length || !MONTH.test(from) || !MONTH.test(to) || from > to || spentOf(row, inWalk) === null) return null;
  return { from, to };
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
 * written as a screen writes that currency (`forecastFigure`), so the chart, the table and every knob's figure read in it.
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
    currency: show.to,
    template: forecastFigure({ currency: show.to, home: model.home, template: '' }, opening),
    past: model.past.map((p) => ({ ...p, value: by(p.value) })),
    steps: model.steps.map((s) => ({ ...s, delta: by(s.delta) })),
    sells: model.sells.map((s) => ({ ...s, value: by(s.value) })),
    shows: [],
    spent: model.spent === null ? null : by(model.spent),
  };
}

/** Text with every run of space as one plain space, so a figure joined by a space that does not break reads the same. */
const spaced = (text: string): string => text.replace(/\s+/gu, ' ').trim();

/**
 * The currency an opening cell is in, or `null` when the cell does not say.
 *
 * A HOST WRITES THE STORED FORM, `EGP 34,850.00`, and `readAmount` reads that. A host that has already written the cell
 * for a screen sends `£34,850.00`, `$1,950` or `£1,000.00 GBP`. Such a cell is in a currency when writing its own number
 * in that currency gives the cell back; failing that, its code or its sign says it (`currencyOfFigure`, by the writer's
 * own sign table). Since other currencies are written by their own sign, "$1,950" on a record with no home row is the
 * US dollar: asking only for a code after the figure lost it, and with it the currency of the spend knob and every
 * sell. A sign nobody owns (`E£`) stays a figure whose currency is not known.
 */
function currencyOf(cell: string, home: string | null): string | null {
  const stored = readAmount(cell)?.currency;
  if (stored) return stored;
  const value = signedOf(cell);
  if (!Number.isFinite(value)) return null;
  for (const currency of new Set([...(cell.match(/[A-Z]{3}/gu) ?? []), ...(home ? [home] : [])])) {
    for (const as of [home, null]) {
      for (const setting of ['exact', 'read'] as const) {
        if (spaced(forecastFigure({ currency, home: as, template: '' }, value, setting)) === spaced(cell)) return currency;
      }
    }
  }
  /* A CODE AFTER A SIGN THE WRITER NO LONGER ADDS (`£1,000.00 GBP`), OR A SIGN ALONE (`$1,950`). */
  return currencyOfFigure(cell, home);
}

/**
 * An amount of the walk as a screen writes it, by the one writer (`writeAmount`): every penny in a table (`exact`), a
 * fraction of noughts dropped beside the chart (`read`), compact on the value axis (`axis`). Both drawers call this
 * for every figure a forecast shows, so a walk reads one way whichever drew it.
 *
 * THE AXIS IS IN ONE CURRENCY AND NAMES IT ONCE. Every level of it is the walk's own money, which the balance beside
 * today's dot and the table under the chart both write in full, so a level is written as that currency writes itself,
 * `$1.5k`, and not `$1.5k USD` six times down the side.
 *
 * A WALK WHOSE CURRENCY IS NOT KNOWN COPIES ITS OPENING CELL, as every figure once did: the number in the shape of the
 * cell the host drew. It is the one case left, a cell drawn in a sign the record never named.
 */
export function forecastFigure(model: Pick<ForecastModel, 'currency' | 'home' | 'template'>, value: number, setting: AmountSetting = 'exact'): string {
  if (!Number.isFinite(value)) return MISSING;
  if (model.currency !== null) {
    /* THE SIGN IS PUT BACK AFTER ROUNDING, as `scaled` below does it, so a cost and a refund of one size agree. */
    const minor = Math.sign(value) * Math.round(Math.abs(value) * 10 ** exponentOf(model.currency));
    const said = writeAmount({ minor, currency: model.currency }, setting === 'axis' ? model.currency : model.home, setting);
    if (said) return said.text;
  }
  const copied = figureLike(model.template, value);
  return setting === 'axis' ? axisFigure(copied) : setting === 'read' ? headlineFigure(copied) : copied;
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
 * Whether a figure is in the walk's own money. BY ITS CURRENCY WHERE BOTH SAY ONE (`currencyOf`), not by its spelling:
 * `$900` and `USD 900.00`, or `£2,000` beside an opening of `£1,000.00 GBP`, are one money written two ways, and compared
 * as text the sell and the spend average in them were left out. Where either says none, the spelling is all there is.
 */
const inWalkMoney = (opening: string, currency: string | null, home: string | null) => (cell: string): boolean => {
  const said = currency === null ? null : currencyOf(cell, home);
  return said !== null ? said === currency : unitOf(cell) === unitOf(opening);
};

/**
 * The `sell | | label | figure` rows whose figure is written in the walk's own money.
 *
 * A FIGURE IN ANOTHER MONEY IS LEFT OUT, NEVER ADDED. `signedOf` reads the number and drops the sign it is written in, so
 * holdings of $900.00 beside a walk in pounds read as 900 and would have walked as £900.00. The host converts what it
 * can before it writes the row; what reaches here in another unit is a figure this walk cannot add.
 */
function sellsOf(rows: readonly (readonly string[])[], inWalk: (cell: string) => boolean): ForecastSell[] {
  return rows.flatMap((r) => {
    const cell = r[3]?.trim() ?? '';
    const v = signedOf(cell);
    const label = r[2]?.trim() ?? '';
    return r[0]?.trim() === 'sell' && label && Number.isFinite(v) && v > 0 && inWalk(cell) ? [{ label, value: v }] : [];
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
  Boolean(k.sell) ||
  Boolean(k.noIncome);

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

/** How far the walk reaches: the host's own reach, and never less than the length the chart opens on. */
const reachOf = (model: ForecastModel): number => Math.max(model.horizon, model.reach);

/** The walk with the knobs applied. */
export function scenario(model: ForecastModel, knobs: Knobs): Scenario {
  const horizon = Math.max(1, Math.min(reachOf(model), Math.round(knobs.horizon)));
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
    .filter((s) => !knobs.noIncome || s.delta <= 0)
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

/**
 * One length the horizon knob offers: how many days it walks, and how a person says it. `walk` is the length the host is
 * asked to walk when it is picked, for a choice past how far the walk reaches (`horizonChoices` with `walks`), and
 * `end` marks "To the end", whose days move with the walk the host sends.
 */
export type HorizonChoice = { days: number; label: string; walk?: number | 'last'; end?: true };

/** What the knob offers when the block declared no `horizons:`: a quarter, half a year and a year, in days. */
const HORIZONS_SAID = [91, 183, 365] as const;

/**
 * How far past the walk a choice may reach and still be offered, drawn as the walk. A six-month choice over a walk of
 * 180 days is 183 days, and refusing it for three days would take away the choice the walk was declared for.
 */
const HORIZON_SLACK = 7;

/**
 * The horizon choices the walk the host made can draw, in the order the block declared them, each once.
 *
 * NO CHOICE DRAWS PAST THE WALK. The host walks as far as it says (`reach`, else `horizon`) and no further, so a
 * five-year choice over a one-year walk would draw the same year under a longer name. But every length up to the walk's
 * reach is offered, and not only up to the length the chart opens on: a chart opening on three months over a two-year
 * walk still offers half a year, a year and two (visual review 4). `last` is the day of the walk's last dated movement,
 * which the walk itself holds.
 *
 * A LONGER LENGTH IS ASKED FOR, WHERE THE HOST CAN WALK IT (`walks`, `RenderOptions.walk`). The record walks two years
 * at most unasked and further when a reader picks a longer length, so with `walks` every declared length past the reach
 * is offered with `walk`, the length to ask the host for, and "To the end" asks for `last` while the walk may have
 * stopped short of the plan's end (`mayRunOn`). Without `walks` they are left off, as before, since nothing could draw
 * them.
 */
export function horizonChoices(model: ForecastModel, walks = false): HorizonChoice[] {
  const out: HorizonChoice[] = [];
  const reach = reachOf(model);
  for (const h of model.horizons ?? HORIZONS_SAID) {
    let choice: HorizonChoice | null;
    if (h === 'last') {
      choice = lastChoice(model);
      if (choice && walks && mayRunOn(model)) choice = { ...choice, walk: 'last' };
    } else if (h - HORIZON_SLACK <= reach) choice = { days: Math.min(h, reach), label: spanWords(h) };
    else choice = walks ? { days: h, label: spanWords(h), walk: h } : null;
    if (choice && !out.some((c) => c.days === choice.days)) out.push(choice);
  }
  return out;
}

/** "To the end": as far as the walk's last dated movement, or `null` when nothing is dated after today. */
function lastChoice(model: ForecastModel): HorizonChoice | null {
  const last = model.steps.reduce((most, s) => (s.day > most ? s.day : most), model.today);
  const days = Math.min(daysBetween(model.today, last), reachOf(model));
  return days >= 1 ? { days, label: FORECAST_TO_END, end: true } : null;
}

/**
 * Whether the plan may run on past the walk the host sent: it stopped short of a length the block declares, or it still
 * moved money in its last month, which is what a walk the host cut off looks like. A plan that ended well inside the
 * walk asks nothing.
 */
function mayRunOn(model: ForecastModel): boolean {
  const reach = reachOf(model);
  if ((model.horizons ?? []).some((h) => typeof h === 'number' && h - HORIZON_SLACK > reach)) return true;
  const last = model.steps.reduce((most, s) => (s.day > most ? s.day : most), model.today);
  return daysBetween(model.today, last) > reach - Math.ceil(MONTH_DAYS);
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
  /* WHOLE WEEKS FROM TWO TO TWELVE are said in weeks, so Money's ten-week window reads `10 weeks`, not `70 days`. */
  if (days % 7 === 0 && days >= 14 && days <= 84) return forecastWeeks(days / 7);
  return forecastDays(days);
}

/** How many stops the spend slider has at most, so every stop is a figure a person would say. */
const SPEND_STOPS = 50;
/** The months of going out the spend slider's reach is measured over. */
const SPEND_MONTHS = 3;

/**
 * The spend slider: its two ends and its step, all in the walk's own money, what it is called and the note under it,
 * and the amount it is measured against, `null` where the record measured nothing and the slider adds what it does
 * not know.
 */
export type SpendRange = { min: number; max: number; step: number; name: string; note: string; measured: number | null };

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
export function spendRange(model: ForecastModel, key = ''): SpendRange {
  const until = addDays(model.today, Math.round(SPEND_MONTHS * MONTH_DAYS));
  const ahead = model.steps.reduce((n, s) => (s.delta < 0 && s.day <= until ? n - s.delta : n), 0) / SPEND_MONTHS;
  const month = model.spent ?? (ahead > 0 ? ahead : Math.abs(model.opening) / 12);
  const unknown = { min: 0, name: key ? forecastSpendIn(key) : FORECAST_SPEND, note: FORECAST_SPEND_NOTE, measured: null };
  if (!(month > 0)) return { ...unknown, max: SPEND_STOPS, step: 1 };
  const step = roundStep((2 * month) / SPEND_STOPS);
  if (model.spent === null) return { ...unknown, max: Math.max(step, Math.ceil((2 * month) / step) * step), step };
  /* SPENDING THE RECORD MEASURED IS MOVED UP OR DOWN FROM WHERE IT IS, so the slider runs from spending none of it to
     spending it twice, opening on no change. Each end is a whole number of steps, so no change is a stop, and never past
     the measured amount: below it the walk would be paid for spending less than nothing. */
  const reach = Math.max(step, Math.floor(model.spent / step) * step);
  return { min: -reach, max: reach, step, name: key ? forecastMeasuredIn(key) : FORECAST_SPEND_MEASURED, note: everydaySaid(model, model.spent), measured: model.spent };
}

/**
 * What the spend slider reads at `value`, its amount already written as `figure` without a sign: `E£2,000 a month` where
 * it adds spending the record does not know, and where it moves what was measured, `No change`, `E£2,000 more a month`
 * or `E£2,000 less a month`.
 */
export const spendSaid = (range: SpendRange, value: number, figure: string): string =>
  range.measured === null ? forecastPerMonth(figure) : value === 0 ? FORECAST_SPEND_SAME : value > 0 ? forecastSpendMore(figure) : forecastSpendLess(figure);

/** Whether a step is a week's share of everyday spending, as the record's walk names those steps. */
export const isEveryday = (s: { label: string }): boolean => s.label === FORECAST_EVERYDAY;

/** The movements "Every movement" lists one by one: every step but the weekly shares of everyday spending. */
export const listedSteps = <T extends { label: string }>(steps: readonly T[]): T[] => steps.filter((s) => !isEveryday(s));

/**
 * The one line "Every movement" holds for everyday spending, `Everyday spending, measured from Jul to Sep: E£41,200 a
 * month`, or `''` when the walk on screen moves none.
 *
 * ONE LINE, NOT A ROW A WEEK. The record walks a week's share of everyday spending every seventh day, so a year's walk
 * listed fifty-two lines of the same amount between the bills a person reads the list for. The monthly amount is the
 * one the record measured (`spent`); a walk that came without it is said from its own weekly shares.
 */
/** NO ".00" ON A WHOLE AMOUNT IN A LIST (recheck of 30 October, 34), as Coming up and Money's tiles say one; real pence stay. */
const WHOLE_PENCE = /\.00(?=$|\s[A-Z]{3}$)/u;

export function forecastEveryday(model: ForecastModel, shown: Scenario): string {
  if (!shown.steps.some(isEveryday)) return '';
  const weeks = model.steps.filter(isEveryday);
  /* A MONTH SAID FROM WEEKS IS SAID IN WHOLE UNITS, because a week's share was rounded to the cent and twelve over
     fifty-two of it comes back a cent or two short of the month it was cut from. */
  const monthly = model.spent ?? Math.round((-weeks.reduce((n, s) => n + s.delta, 0) / weeks.length) * (52 / 12));
  return everydaySaid(model, monthly);
}

/** The everyday line's words for a monthly amount, the months it was measured over said when the host sent them. */
function everydaySaid(model: ForecastModel, monthly: number): string {
  const m = model.measured;
  const over = !m ? '' : m.from === m.to ? `, measured in ${shortMonth(m.from, model.today)}` : `, measured from ${shortMonth(m.from, model.today)} to ${shortMonth(m.to, model.today)}`;
  /* IN WHOLE UNITS, as a sentence says money (recheck of 30 October, 34): "EGP 128,980.97 a month" kept its pennies. */
  return `${FORECAST_EVERYDAY}${over}: ${forecastPerMonth(forecastFigure(model, Math.round(Math.abs(monthly)), 'read'))}`;
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
    .map(([label, g]) => ({ label, amount: forecastFigure(model, g.sum) }));
}

/**
 * The movements dated inside the horizon on screen, `horizon` days from today as `scenario` holds it to the walk's
 * reach, an overdue one among them, since it is walked today.
 *
 * NOT THE WHOLE WALK. The host walks past the length the chart opens on, so a longer one is a press away, and "What
 * counts" totalled every step it sent: on Money that was five years of salary beside a chart of three months.
 * A stream is offered and weighed by what moves on the chart and in its table. By the day each movement
 * is dated, before the late knob moves money in: a salary paid late is still one a reader may count, and the switches do
 * not come and go as the knob is dragged.
 */
function stepsInside(model: ForecastModel, horizon: number): ForecastStep[] {
  const end = addDays(model.today, Math.max(1, Math.min(reachOf(model), Math.round(horizon))));
  return model.steps.filter((s) => s.day <= end);
}

/**
 * The streams and the plans a reader may count in or out: every movement inside the horizon on screen that happens
 * more than once there, by the plan it is part of when the host said so and by its label when not, money in apart from
 * money out and the heaviest first. `horizon` is the length shown, the one the chart opens on unless a reader moved it.
 *
 * MORE THAN ONCE, because that is what a stream or a plan is without naming either: a salary comes every month and a
 * plan has parts. A movement that happens once is a one-off, which `countsOf` offers beside these when it weighs.
 */
export function streamsOf(model: ForecastModel, horizon: number = model.horizon): { in: { label: string; amount: string }[]; out: { label: string; amount: string }[] } {
  const by = new Map<string, { sum: number; weight: number; n: number }>();
  for (const s of stepsInside(model, horizon)) {
    const key = s.of ?? s.label;
    if (key === '') continue;
    const g = by.get(key) ?? { sum: 0, weight: 0, n: 0 };
    g.sum += s.delta;
    g.weight += Math.abs(s.delta);
    g.n += 1;
    by.set(key, g);
  }
  const all = [...by.entries()].filter(([, g]) => g.n > 1).sort((a, b) => b[1].weight - a[1].weight);
  const said = ([label, g]: [string, { sum: number }]) => ({ label, amount: forecastFigure(model, g.sum) });
  return { in: all.filter(([, g]) => g.sum > 0).map(said), out: all.filter(([, g]) => g.sum <= 0).map(said) };
}

/** A stream, a plan or a one-off a reader may count in or out, with its amount as drawn. */
export type Counted = { label: string; amount: string };

/**
 * Everything "What counts" offers, money in apart from money out and the heaviest first: every stream and plan
 * (`streamsOf`), and the `most` heaviest movements that happen once, each counted inside the horizon on screen.
 *
 * ONE CONTROL, ONE MEANING OF ON. "Leave out" offered the heavy movements and "What counts" the streams, over the one
 * list of what is left out, and a chip pressed in one meant the opposite of a chip pressed in the other. A movement
 * is keyed as `streamsOf` keys it, by the plan it is part of and by its label when not, which is what `scenario`
 * leaves out.
 */
export function countsOf(model: ForecastModel, horizon: number = model.horizon, most = 5): { in: Counted[]; out: Counted[] } {
  const by = new Map<string, { sum: number; weight: number; n: number }>();
  for (const s of stepsInside(model, horizon)) {
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
  const said = ([label, g]: [string, { sum: number }]): Counted => ({ label, amount: forecastFigure(model, g.sum, 'read') });
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
  /* THE WALK'S FIRST DAY IS TODAY, so a crossing in another year says its year. */
  if (shown.crossed) return forecastNow(shortDay(shown.crossed.day, base.days[0]?.day));
  return FORECAST_STILL;
}

export type ForecastPlan = {
  /** The sentence over the chart, and whether it is the warning. */
  said: string;
  warn: boolean;
  /**
   * Whether the sentence is drawn over the chart: not where the page's headline already says when the walk goes under
   * (`headline`) and no knob has moved it off the walk the headline read. It is still said in the chart's name.
   */
  legend: boolean;
  past: string;
  /** The walk from today as far as the record knows it, solid, and `''` when nothing ahead of today is known. */
  walk: string;
  /** The walk beyond what is known, dashed, from where `walk` ends, and `''` when the record knows it to the horizon. */
  future: string;
  /**
   * The soft wash between the balance and the zero rule, remembered and walked alike, split at zero: `area` is the part
   * above it and `below` the part under it, each one closed path or `''` when the walk never goes that side.
   */
  area: string;
  below: string;
  /** Today's dot, where its balance is said (shares across and down), and the balance as a headline says it. */
  now: { d: string; at: string; y: string; label: string; place: NowPlace; over?: true; rule: string };
  base: string;
  /** Where the solid rule is drawn: zero where the axis holds it, and else the end of the axis nearest zero. */
  zero: string;
  /** The rules at the axis's other round steps, faint, and `''` when the rule at `zero` is the only one. */
  grid: string;
  /**
   * The crossing's dot, where its label sits as a fraction across, and the thin rule from the label at the chart's top
   * edge down to the dot, so the flag says which point of the line it names.
   */
  cross: { d: string; rule: string; at: string; day: string; near: boolean } | null;
  low: string;
  /**
   * EACH PART OF A PLAN GOING OUT INSIDE THE CHART, as a numbered drop (money-core 3.27.0): where its step sits on the
   * line (shares across and down, as today's label is placed), its number, and what it is, its day and its amount, which
   * a list under the chart says beside the same number. A part of a plan is the largest money a walk moves on a day, and
   * a line that fell by most of the balance with nothing saying why read as a fault in the chart. At most `FORECAST_DROPS_MOST`,
   * the soonest, so a plan of many parts over years does not cover the line in numbers.
   */
  drops: { n: number; at: string; y: string; label: string; day: string; amount: string }[];
  /**
   * EVERY OTHER MOVEMENT THE LIST UNDER THE CHART NAMES, AS A DOT ON THE LINE (money-core 3.29.0): a salary, a premium, a
   * bill, each where it moves the balance, money in apart from money out, so a step in the line is never left unsaid.
   * Each is one path of zero-length strokes, `''` where there is none. Everyday spending is not marked: it is a week's
   * share every seventh day, and the summary says it once.
   */
  marks: { in: string; out: string };
  /**
   * THE LOWEST POINT, SAID BESIDE ITS DOT (money-core 3.29.0): where it sits (shares across and down), the figure, and
   * which way its words lean at the chart's ends, or `null` where the lowest is today, which today's label already says.
   * `drop` is set where a numbered part of a plan sits on the same day, so the words hang below its disc. `foot` is set
   * where they hang past the plot's foot (`lowFoot`), and the month names are set under them.
   */
  lowLabel: { at: string; y: string; figure: string; side?: 'start' | 'end'; drop?: true; foot?: true } | null;
  /** The month names under the chart; `edge` is the start's own month, set at the left edge rather than centred. */
  ticks: { at: string; label: string; edge?: true }[];
  /** The start and the end of the time axis, for the scrub. */
  start: string;
  span: number;
  lo: number;
  hi: number;
  /**
   * The value axis, top first: each round step as a share of the height from the top (`--at`), said short, and which of
   * them is zero, none where zero is out of view. ONE SIDE AND ONE SCALE, where the axis was its top in the far corner and its bottom in the near one,
   * each the walk's own extreme to the penny (`£31,035.00 GBP` over `−£127,489.90 GBP`), which no reader could read
   * a level between.
   */
  axis: { at: string; label: string; zero: boolean; cut?: true }[];
  /**
   * Whether nought is off the value axis: a fitted axis over a walk that stays one side of it. The axis's end nearest
   * nought is then its real amount and carries `cut`, which both drawers mark with a break, and `foot` says it in words
   * for a screen reader (`The axis starts at E£980,000.`), in the chart's name. `false` and `''` where nought is held.
   */
  cut: boolean;
  foot: string;
  sentence: string;
};

/** The most parts of plans a chart numbers as drops: the soonest, so the line is never covered in numbers. */
export const FORECAST_DROPS_MOST = 6;

/** How near either end of the chart the lowest point is, as a share, for its words to lean inward from it. */
const LOW_EDGE = 0.15;

/**
 * Whether a numbered disc sits where the lowest point's words are drawn, by how far it is from the point as shares of
 * the plot, across and down: the words take about a tenth of a wide chart and more of a phone's, so a disc within an
 * eighth across and a sixth up or down hangs them below it. Over-cautious on purpose: words hung a disc lower cost nothing.
 */
const nearLow = (across: number, down: number): boolean => Math.abs(across) <= 0.125 && Math.abs(down) <= 1 / 6;

/** How many movements the list under the chart names before the rest wait in Every movement, every numbered part kept. */
export const FORECAST_NEXT_MOST = 8;

/** One cell of the summary over the chart: what it is called, its figure said short, the line under it, and its way. */
/** `below`: the figure itself is under nought, which Look B draws red whichever way it moved. */
export type SummaryCell = { key: 'end' | 'low' | 'everyday'; label: string; figure: string; note: string; dir?: 'in' | 'out'; below?: true };

/**
 * THE ANSWER BEFORE THE CHART (money-core 3.29.0): the cash at the horizon and how far that is from today, the lowest
 * point and what took it there, and what everyday spending takes a month where the record measured it. Read off the
 * walk on screen, so a knob that moves the line moves these with it, and a drawer with no knobs says the host's walk.
 */
export function forecastSummary(model: ForecastModel, shown: Scenario): SummaryCell[] {
  const now = todayBalance(model, shown);
  const last = shown.days.at(-1) ?? { day: model.today, balance: now };
  const change = cents(last.balance - now);
  /* THE ANSWER IN WHOLE UNITS, as Cash now is said over it: a walk that averages everyday spending lands on piastres,
     and "EGP 756,443.02" beside "from EGP 729,312 today" read as two kinds of figure. The list under the chart keeps
     each movement to the cent. */
  const read = (v: number): string => forecastFigure(model, Math.round(v), 'read');
  /* THE CHANGE SAYS WHICH WAY IN A WORD (audit of 31 October, 23): "from £33,850 today · −£55,953" left a reader to
     guess what the second figure was. Now "from £33,850 today, down £55,953". */
  const changed = change === 0 || Math.round(change) === 0 ? '' : forecastChange(change > 0, read(Math.abs(change)));
  const cells: SummaryCell[] = [
    {
      key: 'end',
      label: forecastCashOn(shortDay(last.day, model.today)),
      figure: read(last.balance),
      note: [forecastFromToday(read(now)), changed].filter(Boolean).join(', '),
      ...(change !== 0 ? { dir: change > 0 ? ('in' as const) : ('out' as const) } : {}),
      ...(Math.round(last.balance) < 0 ? { below: true as const } : {}),
    },
  ];
  const low = shown.lowest;
  /* WHAT TOOK IT THERE: the last movement out on the lowest day, which is the one a reader looks for. */
  const cause = listedSteps(shown.steps.filter((s) => s.day === low.day && s.delta < 0)).at(-1);
  cells.push({
    key: 'low',
    label: FORECAST_LOWEST,
    figure: read(low.balance),
    note: low.day === model.today ? FORECAST_TODAY : [forecastOnDay(shortDay(low.day, model.today)), cause ? forecastAfter(cause.label) : ''].filter(Boolean).join(', '),
    ...(low.balance < 0 ? { dir: 'out' as const } : {}),
  });
  const everyday = everydayMonthly(model, shown);
  if (everyday !== null) cells.push({ key: 'everyday', label: FORECAST_EVERYDAY, figure: read(everyday), note: everydayNote(model) });
  return cells;
}

/** What everyday spending takes a month on the walk on screen, or `null` where it moves none. */
function everydayMonthly(model: ForecastModel, shown: Scenario): number | null {
  if (!shown.steps.some(isEveryday)) return null;
  const weeks = model.steps.filter(isEveryday);
  return Math.abs(model.spent ?? Math.round((-weeks.reduce((n, s) => n + s.delta, 0) / weeks.length) * (52 / 12)));
}

/** The line under everyday spending's figure: `a month, the average of Jul to Sep`, or `a month` where no months came. */
function everydayNote(model: ForecastModel): string {
  const m = model.measured;
  if (!m) return FORECAST_A_MONTH;
  return forecastAverageOf(m.from === m.to ? shortMonth(m.from, model.today) : `${shortMonth(m.from, model.today)} to ${shortMonth(m.to, model.today)}`);
}

/** One line of the list under the chart: a movement, or the one line everyday spending is said in. */
export type NextRow = { everyday: true; said: string } | { everyday?: undefined; n: number | null; dir: 'in' | 'out'; day: string; label: string; amount: string };

/**
 * THE LIST UNDER THE CHART (money-core 3.29.0): everyday spending in one line, then the movements in order, each
 * instalment and each repeating line on its own row with its day and its amount to the cent, the soonest
 * `FORECAST_NEXT_MOST` and every part of a plan the line numbers, so a number on the line is always in the list. `more`
 * is how many movements inside the horizon wait in Every movement.
 */
export function forecastNext(model: ForecastModel, shown: Scenario, plan: Pick<ForecastPlan, 'drops'>, most = FORECAST_NEXT_MOST): { rows: NextRow[]; more: number } {
  const end = addDays(model.today, shown.horizon);
  const listed = listedSteps(shown.steps).filter((s) => s.day <= end);
  const numbered = new Map<(typeof listed)[number], number>();
  /* A DROP IS NUMBERED IN THE ORDER THE PLAN NUMBERS THEM: the soonest parts of plans going out, after today. */
  let n = 0;
  for (const s of listed) if (n < plan.drops.length && s.of !== undefined && s.of !== '' && s.delta < 0 && s.day > model.today) numbered.set(s, ++n);
  const kept = listed.filter((s, i) => i < most || numbered.has(s));
  const said = forecastEveryday(model, shown);
  /* ONE WAY FOR THE LIST (polish5's rule for a set of exact amounts): every line to the penny where any line has pence,
     every line whole where none does. "−$45" over "−$208.25" read as two kinds of figure in one column. */
  const figures = kept.map((s) => forecastFigure(model, s.delta));
  const pence = figures.some((f) => !WHOLE_PENCE.test(f));
  return {
    rows: [
      ...(said ? [{ everyday: true as const, said }] : []),
      ...kept.map((s, i) => ({ n: numbered.get(s) ?? null, dir: s.delta > 0 ? ('in' as const) : ('out' as const), day: shortDay(s.day, model.today), label: s.label, amount: `${s.delta > 0 ? '+' : ''}${pence ? figures[i]! : figures[i]!.replace(WHOLE_PENCE, '')}` })),
    ],
    more: listed.length - kept.length,
  };
}

/** Whether any money comes in inside the horizon, which is what "If income stopped" would take away. */
export const hasIncome = (model: ForecastModel, horizon: number = model.horizon): boolean =>
  model.steps.some((s) => s.delta > 0 && s.day <= addDays(model.today, Math.max(1, Math.min(reachOf(model), Math.round(horizon)))));

/** How many round steps the value axis is cut into at most, so at most one more name than this down its side. */
const AXIS_MOST = 5;
/** And at least, where the money's own unit allows it: an axis of its two ends says no level between them. */
const AXIS_LEAST = 2;
/** About how many steps it is cut into when no round step fits `AXIS_LEAST` to `AXIS_MOST`; `roundStep` rounds up. */
const AXIS_STEPS = 4;
/**
 * How near zero the balances come, as a share of their own range, for the axis to hold zero: at half, zero takes a
 * third of the height at most. A walk from £2k to £10k is read from zero; one from £31k to £34k is not.
 */
const ZERO_NEAR = 0.5;
/**
 * And the most of the axis zero may cost: with zero held the balances still fill half the height, or zero is let go.
 * Round steps are coarse, so £34k to £102k reached from zero ran to £150k and the line had under half the chart.
 */
const ZERO_MOST = 2;
/**
 * The least the axis spans, as a share of the largest balance: a twentieth. A balance that moves £50 on £31,000 is
 * flat, and an axis fitted to the £50 would draw it as a cliff.
 */
const AXIS_FLAT = 0.05;
/** The round steps tried, each times a power of ten. */
const AXIS_ROUND = [1, 2, 5] as const;

/** The value axis: its two ends, the step between its levels, and the levels top first, zero written as `0`. */
export type AxisFit = { lo: number; hi: number; step: number; levels: number[] };

/**
 * The value axis fitted to the balances: round levels from the one at or below the lowest to the one at or above the
 * highest, on the round step that leaves the least empty band, and the larger step where two leave the same.
 *
 * ZERO IS HELD ONLY WHERE THE WALK CROSSES IT OR COMES NEAR (`ZERO_NEAR`). It was always held, so a balance between
 * £31k and £34k was a line across the top tenth of the chart over nine tenths of nothing, and what it did in those
 * months could not be read. And near is not enough where the round steps from zero would leave the balances under
 * half the height (`ZERO_MOST`): the axis is then the balances' own band.
 *
 * `said` answers whether a level reads exactly as the axis writes it. An axis says `£31.5k` as `£32k`, so a step of
 * five hundred there would name two levels alike; a step whose levels are not all said exactly is passed over for the
 * next rounder one. Left out, every level is taken as said.
 *
 * `zero` IS A BLOCK'S `axis: zero`, and holds nought however far the walk is from it, which any page may ask for
 * (HD.251). Fitted is still what a block that says nothing gets, because it is what the board draws.
 */
export function axisFit(min: number, max: number, said: (level: number) => boolean = () => true, zero = false): AxisFit {
  let low = Math.min(min, max);
  let high = Math.max(min, max);
  if (!Number.isFinite(low) || !Number.isFinite(high)) low = high = 0;
  const flat = Math.max(Math.abs(low), Math.abs(high)) * AXIS_FLAT;
  if (high - low < flat) {
    const mid = (low + high) / 2;
    low = mid - flat / 2;
    high = mid + flat / 2;
  }
  if (zero) return axisOver(Math.min(low, 0), Math.max(high, 0), said);
  const range = high - low;
  const own = axisOver(low, high, said);
  const near = low > 0 ? low <= range * ZERO_NEAR : high < 0 && -high <= range * ZERO_NEAR;
  if (!near) return own;
  const held = axisOver(Math.min(low, 0), Math.max(high, 0), said);
  return held.hi - held.lo <= range * ZERO_MOST ? held : own;
}

/** The round levels over one band, as `axisFit` chooses them once it has settled whether zero is in the band. */
function axisOver(low: number, high: number, said: (level: number) => boolean): AxisFit {
  const fit = (step: number): AxisFit => {
    const lo = Math.floor(low / step) * step;
    const hi = Math.max(lo + step, Math.ceil(high / step) * step);
    const n = Math.round((hi - lo) / step);
    /* TOP FIRST, each counted from the bottom so a long axis does not drift, and zero is `0` and never `-0`. */
    const levels = Array.from({ length: n + 1 }, (_, i) => lo + (n - i) * step).map((v) => (Math.abs(v) < step / 2 ? 0 : v));
    return { lo, hi, step, levels };
  };
  const tried: AxisFit[] = [];
  if (high > low)
    for (let e = Math.floor(Math.log10(high - low)) - 2; e <= Math.floor(Math.log10(high - low)) + 1; e++)
      for (const m of AXIS_ROUND) if (m * 10 ** e >= 1) tried.push(fit(m * 10 ** e));
  const steps = (a: AxisFit): number => a.levels.length - 1;
  const best = (least: number): AxisFit | undefined =>
    tried
      .filter((a) => steps(a) >= least && steps(a) <= AXIS_MOST && a.levels.every(said))
      .sort((a, b) => a.hi - a.lo - (b.hi - b.lo) || b.step - a.step)[0];
  /* NEVER FINER THAN ONE OF THE MONEY'S UNITS, so a balance that moves by pence has an axis of its two ends. */
  return best(AXIS_LEAST) ?? best(1) ?? fit(roundStep((high - low) / AXIS_STEPS));
}

/**
 * Whether the axis says a level exactly: `axisFigure` keeps one decimal below ten of its step (`£1.6k`) and whole
 * steps above (`£31k`), so `£31,500` is not said and `£1,500` is.
 */
function axisSays(level: number): boolean {
  let n = Math.abs(level);
  for (let i = 0; n >= 1_000 && i < 4; i++) n /= 1_000;
  const kept = n >= 10 ? n : n * 10;
  return Math.abs(kept - Math.round(kept)) < 1e-6;
}

/** How many month names the time axis holds at most, when it names every month. */
const TICKS_MOST = 12;
/**
 * How many names it holds at most when it skips months. HALF, because a phone keeps every other name from seven up
 * (`blocks-charts.css`), and every other name of "2027 Jul 2028 Jul" is four Julys and no year.
 */
const TICKS_SPACED = 6;
/** The months between two names on the time axis, tried in order: every month, a quarter, half a year, a year. */
const TICK_EVERY = [1, 3, 6, 12] as const;
/** How far across the first month name must sit for the start's own month to be named at the edge beside it. */
const TICK_START_ROOM = 0.06;
/**
 * How near today the crossing is, as a share of the chart, for the two labels to be set apart: today's balance goes
 * under its dot and the flag's day to the right of its rule. On a phone "30 Oct" sat on top of "£33,850".
 */
const FLAG_NEAR = 0.15;

/**
 * Today's label as a share of the plot on a phone, its worst case: "EGP 752,841.68" is about 105px of a 280px plot, and
 * the word over the figure two lines of 16px in a 160px one. A desk's plot is wider and taller, so a corner free on a
 * phone is free there.
 */
const NOW_WIDE = 0.38;
const NOW_TALL = 0.2;
/** The gap between the dot and its label, as a share of the plot's height. */
const NOW_GAP = 0.025;

/** Where today's label sits round its dot: over it to the end side, under it, or to the start side over or under. */
export type NowPlace = 'above' | 'under' | 'start' | 'start-under';

/** How far the label stands off the dot, as a share across, when every corner of it is crossed (`start`, shifted). */
const NOW_SHIFT = 0.14;
/** The label's width as a share where it stands off the dot, which only a plot wide enough to hold it can do. */
const NOW_WIDE_FAR = 0.2;

/**
 * THE CORNER OF TODAY'S DOT THAT THE LINE DOES NOT RUN THROUGH, AND THAT STAYS INSIDE THE PLOT: over the dot to the end side, where the label always sat, drew "Today" and "EGP 752,841.68" across a
 * walk that steps up the day after, at 390. `points` are the line's own, as shares across and down. With the crossing's
 * flag near, the corners over the dot are the flag's. A dot with no free corner keeps the first, as it always did.
 */
export function nowPlace(points: readonly { x: number; y: number }[], dot: { x: number; y: number }, near: boolean): NowPlace | 'start-far' {
  const order: NowPlace[] = near ? ['under', 'start-under'] : ['above', 'under', 'start', 'start-under'];
  const crossed = nowCrossings(points, dot);
  /* THE FIRST CORNER THE LINE LEAVES FREE, else the one it crosses least, else where the label always sat. */
  let best: { place: NowPlace | 'start-far'; n: number } | null = null;
  /* STANDING OFF THE DOT is the last resort: a dot at the foot of a line that falls into it has no free corner beside it. */
  for (const place of [...order, ...(near ? [] : (['start-far'] as const))]) {
    const n = crossed(place);
    if (n !== null && (best === null || n < best.n)) best = { place, n };
    if (n === 0) break;
  }
  return best !== null && (best.n === 0 || best.place !== 'start-far') ? best.place : (order[0] ?? 'above');
}

/**
 * HOW MUCH OF THE LINE EACH CORNER OF TODAY'S DOT HOLDS, or `null` for a corner that would hang outside the plot. Read by
 * `nowPlace` to choose, and by the plan to say whether the corner chosen is crossed all the same (`over`, A23): a dot
 * near the top of a walk that falls away from it, in the six-month and one-year views, had no free corner, and the line
 * ran through "Today £33,850".
 */
export function nowCrossings(points: readonly { x: number; y: number }[], dot: { x: number; y: number }): (place: NowPlace | 'start-far') => number | null {
  const boxOf = (place: NowPlace | 'start-far') => {
    const far = place === 'start-far';
    const start = place === 'start' || place === 'start-under' || far;
    const under = place === 'under' || place === 'start-under';
    const off = far ? NOW_SHIFT : 0;
    return {
      x0: start ? dot.x - off - (far ? NOW_WIDE_FAR : NOW_WIDE) : dot.x,
      x1: start ? dot.x - off : dot.x + NOW_WIDE,
      y0: under ? dot.y + NOW_GAP : dot.y - NOW_GAP - NOW_TALL,
      y1: under ? dot.y + NOW_GAP + NOW_TALL : dot.y - NOW_GAP,
    };
  };
  /* THE LINE BETWEEN ITS POINTS, not only the points: a long step has none inside a corner it runs straight through. */
  const along = points.flatMap((p, i) => {
    const q = points[i + 1];
    if (!q) return [p];
    const n = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 0.01));
    return Array.from({ length: n }, (_, k) => ({ x: p.x + ((q.x - p.x) * k) / n, y: p.y + ((q.y - p.y) * k) / n }));
  });
  return (place) => {
    const b = boxOf(place);
    if (b.x0 < 0 || b.x1 > 1 || b.y0 < 0 || b.y1 > 1) return null;
    return along.filter((p) => p.x > b.x0 && p.x < b.x1 && p.y > b.y0 && p.y < b.y1).length;
  };
}

/** The lowest point's label as a share of the plot's height on a phone: "Lowest" over its figure, two lines of 16px. */
const LOW_TALL = 0.2;
/** How much lower the label hangs where a numbered part of a plan sits on the same day: its 16px disc and a gap. */
const LOW_DROP = 0.11;

/**
 * WHETHER THE LOWEST POINT'S WORDS HANG PAST THE PLOT'S FOOT. They stand under the dot, where nothing of the line can be,
 * since the line never goes lower; under a dot at the foot they hung onto the month names, "Lowest −£16,213" over "Nov"
 * (audit of 31 October, A23). Where they would, the label says so (`foot`) and both drawers set the month names under
 * it, rather than moving the words off their dot or the axis off its round steps. `y` is the dot's share down.
 */
export const lowFoot = (y: number, drop: boolean): boolean => y + NOW_GAP + LOW_TALL + (drop ? LOW_DROP : 0) > 1;

/**
 * The `data-place` both drawers set on today's label, or `null` where it sits where it always did: over the dot, or under
 * it with the flag near, which `data-near-flag` already says.
 */
export const nowPlaced = (plan: Pick<ForecastPlan, 'now' | 'cross'>): NowPlace | null =>
  plan.now.place === (plan.cross?.near ? 'under' : 'above') ? null : plan.now.place;

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
 * moved. The value axis is fitted to the balances drawn (`axisFit`): it runs from the round step at or below
 * the lowest to the one at or above the highest, and holds zero only where they cross it or come near.
 *
 * WHERE ZERO IS OUT OF VIEW THE RULE IS THE AXIS'S OWN END NEAREST IT, the bottom of a walk that stays above and the
 * top of one that stays under, and the wash runs to it, so a drawer still has one rule to draw and one shape to fill.
 */
export function forecastPlan(model: ForecastModel, shown: Scenario, base: Scenario | null = null): ForecastPlan {
  const start = model.past[0]?.day ?? model.today;
  const end = addDays(model.today, shown.horizon);
  const span = Math.max(1, daysBetween(start, end));
  const values = [...model.past.map((p) => p.value), ...shown.days.map((p) => p.balance), ...(base?.days.filter((p) => p.day <= end).map((p) => p.balance) ?? [])];
  const { lo, hi, levels } = axisFit(Math.min(...values), Math.max(...values), axisSays, model.axis === 'zero');
  /* NOUGHT OFF THE AXIS IS SAID, never left to the eye: a line across a chart from £980k reads as near nothing unless
     the foot says it is not nought. A walk under zero throughout is cut at its top, the end nearest nought. */
  const offAxis = lo > 0 || hi < 0;
  /* THE RULE THE WASH RUNS TO: zero where the axis holds it, else the end of the axis nearest zero. */
  const floor = Math.min(hi, Math.max(lo, 0));
  const x = (day: string) => at((daysBetween(start, day) / span) * 1000);
  const y = (v: number) => at(((hi - v) / (hi - lo)) * 100);

  const now = todayBalance(model, shown);
  let past = '';
  let prev: string | null = null;
  for (const p of model.past) {
    past += `${past ? ' ' : ''}${prev !== null && daysBetween(prev, p.day) === 1 ? 'L' : 'M'}${x(p.day)} ${y(p.value)}`;
    prev = p.day;
  }
  if (prev !== null && daysBetween(prev, model.today) === 1) past += ` L${x(model.today)} ${y(now)}`;

  const line = (days: Scenario['days']) =>
    days.filter((p) => p.day <= end).map((p, i) => `${i ? 'L' : 'M'}${x(p.day)} ${y(p.balance)}`).join(' ');
  /* A LINE OF ONE POINT DRAWS NOTHING, and is said as nothing. */
  const drawn = (days: Scenario['days']) => (days.filter((p) => p.day <= end).length > 1 ? line(days) : '');

  /* THE KNOWN PART AND THE GUESSED PART SHARE THE DAY BETWEEN THEM, so the solid line and the dashed one meet. */
  const lastStep = shown.steps.reduce((most, s) => (s.day > most ? s.day : most), model.today);
  const known = (model.known ?? lastStep) < end ? (model.known ?? lastStep) : end;

  /* THE WASH RUNS UNDER BOTH LINES, down to the zero rule at its two ends, and is cut at zero into the part above and
     the part under, each one shape, so the part a person has to act on can be tinted alone. Where the walk crosses
     between two days the cut is put on the crossing itself, or the wash above would poke past the line there. A day the
     record did not remember is bridged, as the eye bridges it. */
  const points = [...model.past.map((p) => ({ day: p.day, v: p.value })), ...shown.days.filter((p) => p.day <= end).map((p) => ({ day: p.day, v: p.balance }))];
  const cut: { d: number; v: number }[] = [];
  for (const p of points) {
    const d = daysBetween(start, p.day);
    const prev = cut.at(-1);
    if (prev && Math.sign(prev.v) * Math.sign(p.v) < 0) cut.push({ d: prev.d + (prev.v / (prev.v - p.v)) * (d - prev.d), v: 0 });
    cut.push({ d, v: p.v });
  }
  const xd = (d: number) => at((d / span) * 1000);
  const wash = (side: (v: number) => number, any: boolean) =>
    cut.length > 1 && any
      ? `M${xd(cut[0]!.d)} ${y(floor)} ${cut.map((p) => `L${xd(p.d)} ${y(side(p.v))}`).join(' ')} L${xd(cut.at(-1)!.d)} ${y(floor)}Z`
      : '';
  const area = wash((v) => Math.max(floor, v), cut.some((p) => p.v > 0));
  const below = wash((v) => Math.min(floor, v), cut.some((p) => p.v < 0));

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
  /* THE MONTH THE CHART STARTS IN IS NAMED AT ITS EDGE, where there is room before the first name: a walk from 3 Sep
     named Oct to Aug and never the Sep it began in (visual review 3). A start on the 1st is its own month too. An axis
     of years names the start's year, and wants twice the room for it: "Sep" beside "2027" read as September 2027. */
  const yearly = every === 12;
  if (ticks.length === 0 || Number(ticks[0]!.at) >= TICK_START_ROOM * (yearly ? 2 : 1))
    ticks.unshift({ at: '0', label: yearly ? start.slice(0, 4) : tickLabel(start, every), edge: true });

  const c = shown.crossed;
  const said = c ? forecastUnder(shortDay(c.day, model.today)) : forecastAbove(shortDay(end, model.today));
  const nowAt = daysBetween(start, model.today) / span;
  /* THE LINE AS SHARES OF THE PLOT, each stretch between two days walked in eighths, so a step that leaps a whole corner
     in one day is still found in it. */
  const shareOf = (day: string, v: number) => ({ x: daysBetween(start, day) / span, y: (hi - v) / (hi - lo) });
  const traced: { x: number; y: number }[] = [];
  for (const run of [model.past.map((p) => shareOf(p.day, p.value)), [shareOf(model.today, now), ...shown.days.filter((p) => p.day <= end).map((p) => shareOf(p.day, p.balance))]])
    run.forEach((p, i) => {
      const before = run[i - 1];
      if (before) for (let k = 1; k < 8; k++) traced.push({ x: before.x + ((p.x - before.x) * k) / 8, y: before.y + ((p.y - before.y) * k) / 8 });
      traced.push(p);
    });
  const nearFlag = c !== null && Math.abs(daysBetween(start, c.day) / span - nowAt) <= FLAG_NEAR;
  const placed = nowPlace(traced, shareOf(model.today, now), nearFlag);
  /* AND WHETHER THE LINE RUNS THROUGH IT ALL THE SAME, or the corner hangs past the plot: then the words stand on the tile's
     own colour, so the line passes behind them and never through them (A23). */
  const nowOver = nowCrossings(traced, shareOf(model.today, now))(placed) !== 0;
  /* STANDING OFF THE DOT is the start side's words, moved left along the plot. */
  const place: NowPlace = placed === 'start-far' ? 'start' : placed;
  const figure = (v: number) => forecastFigure(model, v);
  /* `--at` IS A SHARE, as every chart's ticks read it, and `y` answers in the box's hundred units. */
  /* TOP FIRST, so the foot is the last level and the top the first. */
  const cutIndex = !offAxis ? -1 : lo > 0 ? levels.length - 1 : 0;
  const axis: ForecastPlan['axis'] = levels.map((v, i) => ({
    at: String(Math.round(Number(y(v)) * 100) / 10_000),
    label: forecastFigure(model, v, 'axis'),
    zero: v === 0,
    ...(i === cutIndex ? { cut: true as const } : {}),
  }));
  const foot = !offAxis ? '' : lo > 0 ? forecastAxisFrom(forecastFigure(model, lo, 'read')) : forecastAxisTo(forecastFigure(model, hi, 'read'));
  const sentence = [
    /* SAID AS THE DOT SAYS IT: the opening's name ("Cash now") is what the accounts hold before today's movements. */
    `${FORECAST_NOW} ${figure(now)}`,
    model.past.length ? forecastRecorded(shortDay(model.past[0]!.day, model.today), figure(model.past[0]!.value)) : '',
    said,
    forecastLowest(figure(shown.lowest.balance), shortDay(shown.lowest.day, model.today)),
  ]
    .filter(Boolean)
    .join('. ');

  /* THE DROPS FIRST, so a dot is never drawn under a numbered disc. */
  const drops = shown.steps
    .filter((s) => s.of !== undefined && s.of !== '' && s.delta < 0 && s.day > model.today && s.day <= end)
    .slice(0, FORECAST_DROPS_MOST);
  const marked = (incoming: boolean) =>
    listedSteps(shown.steps)
      .filter((s) => s.day <= end && (incoming ? s.delta > 0 : s.delta < 0) && !drops.includes(s))
      .map((s) => `M${x(s.day)} ${y(s.balance)}h0`)
      .join(' ');
  const lowAt = daysBetween(start, shown.lowest.day) / span;
  /* A NUMBERED DISC NEAR THE LOWEST POINT, not only on its day (audit of 31 October, 23): the third part of a plan fell
     the day after the lowest and its disc sat under the word "Lowest", on every look. A disc close enough across and up
     or down to sit under the words hangs them below it. */
  const lowDrop = drops.some((s) => s.day === shown.lowest.day || nearLow(daysBetween(start, s.day) / span - lowAt, (hi - s.balance) / (hi - lo) - (hi - shown.lowest.balance) / (hi - lo)));
  const lowLabel: ForecastPlan['lowLabel'] =
    shown.lowest.day === model.today
      ? null
      : {
          at: at(lowAt),
          y: String(Math.round(Number(y(shown.lowest.balance)) * 100) / 10_000),
          figure: forecastFigure(model, Math.round(shown.lowest.balance), 'read'),
          ...(lowAt > 1 - LOW_EDGE ? { side: 'end' as const } : lowAt < LOW_EDGE ? { side: 'start' as const } : {}),
          ...(lowDrop ? { drop: true as const } : {}),
          ...(lowFoot(shareOf(shown.lowest.day, shown.lowest.balance).y, lowDrop) ? { foot: true as const } : {}),
        };

  return {
    said,
    warn: c !== null,
    /* NO SENTENCE WHILE THE PAGE'S HEADLINE SAYS HOW LONG THE MONEY LASTS, whether this walk goes under or not (the scope
       of 24 October). Over Money's Lasts saying "Lasts past 23 Oct 2027" from its year's walk, this chart said
       "Stays above zero to 1 Jan 2027, as far as the chart goes": true, and a second day for one question. The page
       names one horizon, the tile's, and the chart's own end is on its axis. A knob that moves the walk brings it back. */
    legend: !(model.headline && base === null),
    past,
    walk: drawn(shown.days.filter((p) => p.day <= known)),
    future: drawn(shown.days.filter((p) => p.day >= known)),
    area,
    below,
    now: {
      d: `M${x(model.today)} ${y(now)}h0`,
      at: at(placed === 'start-far' ? nowAt - NOW_SHIFT : nowAt),
      y: String(Math.round(Number(y(now)) * 100) / 10_000),
      label: forecastFigure(model, now, 'read'),
      place,
      ...(nowOver ? { over: true as const } : {}),
      /* TODAY IS A HAIRLINE DOWN THE WHOLE CHART as well as a dot, named "Today" with the balance under the word, so the
         eye finds where the remembered line ends and the walk begins (the money review). */
      rule: `M${x(model.today)} 0V100`,
    },
    base: base ? line(base.days) : '',
    zero: y(floor),
    grid: levels.filter((v) => v !== floor).map((v) => `M0 ${y(v)}H1000`).join(' '),
    cross: c
      ? {
          d: `M${x(c.day)} ${y(c.balance)}h0`,
          rule: `M${x(c.day)} 0V${y(c.balance)}`,
          at: at(daysBetween(start, c.day) / span),
          day: shortDay(c.day),
          near: Math.abs(daysBetween(start, c.day) / span - nowAt) <= FLAG_NEAR,
        }
      : null,
    low: `M${x(shown.lowest.day)} ${y(shown.lowest.balance)}h0`,
    drops: drops.map((s, i) => ({
        n: i + 1,
        at: at(daysBetween(start, s.day) / span),
        y: String(Math.round(Number(y(s.balance)) * 100) / 10_000),
        label: s.label,
        day: shortDay(s.day, model.today),
        amount: forecastFigure(model, s.delta, 'read'),
      })),
    marks: { in: marked(true), out: marked(false) },
    lowLabel,
    ticks,
    start,
    span,
    lo,
    hi,
    axis,
    cut: offAxis,
    foot,
    sentence: `${sentence}.${foot ? ` ${foot}` : ''}`,
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
    balance: balance === null ? MISSING : forecastFigure(model, balance, 'read'),
    moves: shown.steps.filter((s) => s.day === day).slice(0, 3).map((s) => ({ label: s.label, amount: forecastFigure(model, s.delta, 'read') })),
  };
}

/**
 * The paints the wash and the faint rules carry as attributes, as `RING_PAINT` gives its circles, so a page with no rule
 * for them draws a quiet wash and hairlines rather than a black slab; every rule in the host's stylesheet wins over them.
 */
export const FORECAST_PAINT = {
  area: { fill: 'currentColor', 'fill-opacity': '0.06', stroke: 'none' },
  grid: { fill: 'none', stroke: 'currentColor', 'stroke-opacity': '0.08' },
  walk: { fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' },
  now: { fill: 'none', stroke: 'currentColor', 'stroke-width': '7', 'stroke-linecap': 'round' },
  rule: { fill: 'none', stroke: 'currentColor', 'stroke-opacity': '0.35', 'stroke-width': '1' },
  mark: { fill: 'none', stroke: 'currentColor', 'stroke-width': '5', 'stroke-linecap': 'round' },
} as const satisfies Record<string, Readonly<Record<string, string>>>;

/** The renderer's own words, as `split.ts` keeps `SPLIT_ZERO`: it imports nothing from the app. */
export const FORECAST_NONE = 'No balance to forecast from yet.';
export const FORECAST_NUMBERS = 'Every movement';
export const FORECAST_WHEN = 'When';
export const FORECAST_WHAT = 'What';
export const FORECAST_MOVE = 'In and out';
export const FORECAST_BALANCE = 'Balance';
export const FORECAST_TODAY = 'today';
/** The word over today's balance, on the hairline at today. */
export const FORECAST_NOW = 'Today';
export const FORECAST_HORIZON = 'Horizon';
export const FORECAST_LATE = 'Money in arrives late by';
export const FORECAST_SPEND = "Spending the record doesn't know";
export const FORECAST_SPEND_NOTE = "the record only knows bills you've entered";
/** The record's own name for a week's share of everyday spending, which its walk gives every such step. */
export const FORECAST_EVERYDAY = 'Everyday spending';
export const FORECAST_SPEND_MEASURED = 'Spend more or less each month';
export const FORECAST_SPEND_SAME = 'No change';
export const forecastSpendMore = (figure: string): string => `${figure} more a month`;
export const forecastSpendLess = (figure: string): string => `${figure} less a month`;
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
export const FORECAST_FULL = 'Full screen';
export const FORECAST_CLOSE = 'Close';
export const FORECAST_SHOW_IN = 'Show in';
export const FORECAST_TO_END = 'To the end';
/** Under the "Show in" control while another currency is shown: the day of the rate every amount was converted at. */
export const forecastRateOf = (day: string): string => `converted at the rate of ${shortDay(day)}`;
export const FORECAST_SAME = 'Goes under on the same day as before';
export const FORECAST_NO_LONGER = 'No longer goes under';
export const FORECAST_STILL = 'Still stays above zero';
export const forecastUnder = (day: string): string => `Goes under on ${day}`;
/**
 * A WALK THAT STAYS ABOVE SAYS HOW FAR THE CHART LOOKS: Money's Lasts walks a year
 * and said "Lasts past 23 Oct 2027" over this chart's ten weeks saying "Stays above zero to 1 Jan 2027", one walk read
 * as two answers. The day is where the chart stops, not where the money does.
 */
export const forecastAbove = (day: string): string => `Stays above zero to ${day}, as far as the chart goes`;
export const forecastSooner = (n: number): string => `${n} ${n === 1 ? 'day' : 'days'} sooner than before`;
export const forecastLater = (n: number): string => `${n} ${n === 1 ? 'day' : 'days'} later than before`;
export const forecastNow = (day: string): string => `Now goes under on ${day}`;
export const forecastMonths = (n: number): string => `${n} ${n === 1 ? 'month' : 'months'}`;
export const forecastYears = (n: number): string => `${n} ${n === 1 ? 'year' : 'years'}`;
export const forecastDays = (n: number): string => `${n} ${n === 1 ? 'day' : 'days'}`;
export const forecastWeeks = (n: number): string => `${n} ${n === 1 ? 'week' : 'weeks'}`;
export const forecastPerMonth = (figure: string): string => `${figure} a month`;
/** Spending the record does not know in one currency of a walk drawn once per currency, the currency by its name. */
export const forecastSpendIn = (key: string): string => `${FORECAST_SPEND}, in ${/^[A-Z]{3}$/u.test(key) ? currencyName(key) : key}`;
/** Measured spending moved in one currency of a walk drawn once per currency, the currency by its name. */
export const forecastMeasuredIn = (key: string): string => `${FORECAST_SPEND_MEASURED}, in ${/^[A-Z]{3}$/u.test(key) ? currencyName(key) : key}`;
export const forecastRecorded = (day: string, figure: string): string => `recorded from ${day}, when it was ${figure}`;
export const forecastUnderIn = (n: number): string => (n <= 0 ? 'Cash goes under today' : `Cash goes under in ${n} ${n === 1 ? 'day' : 'days'}`);
export const forecastAverage = (n: number): string => (n <= 0 ? 'on average so far: on time' : `on average so far: ${n} ${n === 1 ? 'day' : 'days'}`);
export const forecastLowest = (figure: string, day: string): string => `Lowest ${figure} on ${day}`;
/** The word over the lowest point's figure, on the chart and in the summary. */
export const FORECAST_LOWEST = 'Lowest';
export const forecastCashOn = (day: string): string => `Cash on ${day}`;
export const forecastFromToday = (figure: string): string => `from ${figure} today`;
/** How far the end of the chart is from today, by its way: `up £1,200` or `down £55,953`. */
export const forecastChange = (up: boolean, figure: string): string => `${up ? 'up' : 'down'} ${figure}`;
export const forecastOnDay = (day: string): string => `on ${day}`;
export const forecastAfter = (label: string): string => `after ${label}`;
export const FORECAST_A_MONTH = 'a month';
export const forecastAverageOf = (months: string): string => `a month, the average of ${months}`;
/** What the list under the chart is called, and what is said of the movements it leaves to Every movement. */
export const FORECAST_NEXT = 'Next movements';
export const forecastNextMore = (n: number): string => `${n} more in Every movement`;
/** The one-press question beside the horizon: the walk with every movement of money in left out. */
export const FORECAST_NO_INCOME = 'If income stopped';
/** Where a value axis that leaves zero out starts, said in the chart's name: `The axis starts at E£980,000.` */
export const forecastAxisFrom = (figure: string): string => `The axis starts at ${figure}.`;
/** And where one under zero throughout stops, at its top. */
export const forecastAxisTo = (figure: string): string => `The axis stops at ${figure}.`;
/**
 * The break both drawers set beside the cut end of the value axis, the mark a chart draws where its axis does not run
 * to zero. Never the colour alone: the end's label is the real amount, and the chart's name says where it starts.
 */
export const FORECAST_AXIS_BREAK = '<svg viewBox="0 0 10 10" width="0.8em" height="0.8em" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M1 8L4 2M6 8L9 2"></path></svg>';
/**
 * The break's own place, beside the label and over the chart's edge, written on the element so the string drawer, which
 * has no sheet of its own, sets it where the component does. No colour: it is the label's.
 */
export const FORECAST_AXIS_BREAK_STYLE = 'position:absolute;inset-inline-end:100%;padding-inline-end:0.25em;line-height:1';
