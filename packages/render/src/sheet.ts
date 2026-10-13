/**
 * The look sheet's specimens: fixed blocks, written in the dialect, for every chart form the sheet draws.
 *
 * THE SHEET DRAWS THE RECORD IT IS OPENED ON (the web app's `SheetCharts.svelte`), and a record does not hold every
 * form at every size: nobody has a chart of exactly two points, most have no stale one, and a fresh record has none
 * at all. So each form has a specimen here, and the sheet draws it where the record has nothing to draw, saying so.
 *
 * A SPECIMEN IS A FENCE, NOT A PLAN OBJECT. It goes through `parse` and the drawer like a block somebody wrote, so the
 * picture on the sheet is the picture a page gets, and a fault in the drawer is a fault on the sheet.
 *
 * FIXED, AND WRITTEN AGAINST ONE DAY (`SHEET_DAY`). The sheet is photographed and a later build is judged beside the
 * photograph, so nothing here reads the clock or rolls a number: the host draws a specimen with `now: SHEET_NOW`.
 *
 * EVERY ONE SAYS "specimen" TWICE: in its label, which the sheet prints over it, and in the block's own heading, so a
 * picture cut out of the sheet still cannot be taken for somebody's figures.
 *
 * STALE IS IN THE DATA, NOT IN A FLAG. A stale specimen's newest point is `SHEET_STALE_STEPS` of its own step before
 * the sheet's day, which is past the "twice its step" a chart is called stale at. The drawer decides what stale looks
 * like; this only gives it something stale to draw.
 */

import { addDays } from './forecast.ts';
import { day } from './format.ts';
import { parse, type Segment } from './parse.ts';

/** The word every specimen carries, in its label and in what is drawn. */
export const SPECIMEN = 'specimen';

/** The day the specimens are written against, and noon on it, which a host hands the drawer as `now`. */
export const SHEET_DAY = '2026-10-13';
export const SHEET_NOW = Date.parse(`${SHEET_DAY}T12:00:00Z`);

/** How many points each chart form is drawn at: none, the three counts under a chart, and a month of days. */
export const SHEET_POINTS = [0, 1, 2, 3, 30] as const;

/** The chart forms that hold points over time, as `sheetKey` names them: the kind, and its form after a space. */
export const SHEET_FORMS = ['lines', 'series', 'series net', 'sparkline', 'heat', 'forecast'] as const;
export type SheetForm = (typeof SHEET_FORMS)[number];

/** The chart kinds a record may hold, in the order the sheet names them: the kinds it looks for among a record's own pages. */
export const SHEET_KINDS = ['lines', 'series', 'sparkline', 'heat', 'forecast', 'roadmap', 'progress', 'ring', 'split', 'bridge', 'bar', 'gauge'] as const;
export type SheetKind = (typeof SHEET_KINDS)[number];

export type SheetAge = 'fresh' | 'stale';

/** The three states a plan's bar is drawn in. */
export const SHEET_STATES = ['working', 'late', 'done'] as const;
export type SheetState = (typeof SHEET_STATES)[number];

/** How many of its own steps before the sheet's day a stale specimen's newest point is. Past two, which is stale. */
export const SHEET_STALE_STEPS = 5;

export type Specimen = {
  /** What tells it from every other, and what the sheet keys its drawing by. */
  key: string;
  kind: string;
  form?: string;
  /** What the sheet prints over it. Always begins "Specimen". */
  label: string;
  /** The fence, as an author would write it. */
  source: string;
  points?: number;
  age?: SheetAge;
  /** A chart with days: its newest point, as an ISO day or month, and what one step of it is. */
  newest?: string;
  step?: 'day' | 'month';
};

/**
 * A specimen as the drawer takes it. READ AS A PAGE'S BLOCK, because the sheet is a page: a forecast is drawn only on
 * one, and written in a note it is shown as its fence.
 */
export const specimenSegments = (s: Pick<Specimen, 'source'>): Segment[] => parse(s.source, { page: true });

/** A kind and its form as one name: `series net`, `lines`. */
export const sheetKey = (kind: string, form?: string): string => (form ? `${kind} ${form}` : kind);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-10` moved by whole months. */
const addMonths = (month: string, by: number): string => {
  const at = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + by;
  return `${Math.floor(at / 12)}-${String((at % 12) + 1).padStart(2, '0')}`;
};
const monthSaid = (month: string): string => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

/** The i-th value of a specimen's line: a fixed walk that rises, dips and never repeats a neighbour. */
const valueAt = (i: number): number => 40 + ((i * 37) % 23) + Math.floor(i / 2);

const pounds = (n: number): string => `£${n.toLocaleString('en-GB')}.00`;

const fence = (info: string, rows: readonly string[]): string => ['```' + info, ...rows, '```'].join('\n');

/** The days or months of `n` points ending `back` steps before the sheet's day, oldest first. */
const daysTo = (n: number, back: number): string[] => Array.from({ length: n }, (_, i) => addDays(SHEET_DAY, -back - (n - 1 - i)));
const monthsTo = (n: number, back: number): string[] => Array.from({ length: n }, (_, i) => addMonths(SHEET_DAY.slice(0, 7), -back - (n - 1 - i)));

/**
 * One chart form at `points` points, fresh or stale.
 *
 * A SPARKLINE HAS NO DAY, so it has no age and asking for a stale one throws; so does a stale chart of no points, which
 * has no newest point to be old. A forecast's points are its past, which ends the day before it opens.
 */
export function chartSpecimen(form: SheetForm, points: number, age: SheetAge = 'fresh'): Specimen {
  if (age === 'stale' && form === 'sparkline') throw new Error('a sparkline has no day, so no stale specimen');
  if (age === 'stale' && points === 0) throw new Error('no point is the newest, so no stale specimen of none');
  const back = age === 'stale' ? SHEET_STALE_STEPS : 0;
  const said = `${points} ${points === 1 ? 'point' : 'points'}${form === 'sparkline' ? '' : `, ${age}`}`;
  const [kind, sub] = form.split(' ') as [string, string | undefined];
  const base = { key: `${form}:${points}:${age}`, kind, ...(sub ? { form: sub } : {}), label: `Specimen: ${form}, ${said}`, points, age };

  if (form === 'lines') {
    const days = daysTo(points, back);
    const source = fence(`lines | Orders, ${SPECIMEN}`, ['Day | Orders', ...days.map((d, i) => `${day(d)} | ${valueAt(i)}`)]);
    return { ...base, source, step: 'day', ...(days.length ? { newest: days.at(-1)! } : {}) };
  }
  if (form === 'series' || form === 'series net') {
    const months = monthsTo(points, back);
    const net = form === 'series net';
    const head = net ? 'Month | in: Money in | out: Money out' : 'Month | Orders';
    const rows = months.map((m, i) => (net ? `${monthSaid(m)} | ${pounds(valueAt(i) * 100)} | ${pounds(valueAt(i + 3) * 80)}` : `${monthSaid(m)} | ${valueAt(i)}`));
    const source = fence(`${form} | ${net ? 'In and out' : 'Orders'}, ${SPECIMEN}`, [head, ...rows]);
    return { ...base, source, step: 'month', ...(months.length ? { newest: months.at(-1)! } : {}) };
  }
  if (form === 'heat') {
    const days = daysTo(points, back);
    const source = fence(`heat | Done, ${SPECIMEN}`, days.map((d, i) => `${d} | ${(valueAt(i) % 5) + 1}`));
    return { ...base, source, step: 'day', ...(days.length ? { newest: days.at(-1)! } : {}) };
  }
  if (form === 'forecast') {
    const days = daysTo(points, Math.max(back, 1));
    const source = fence(`forecast | Cash, ${SPECIMEN}`, [
      `opening | ${SHEET_DAY} | Cash now | ${pounds(12_000)}`,
      ...days.map((d, i) => `past | ${d} |  | ${pounds(11_000 + valueAt(i) * 20)}`),
      `step | ${addDays(SHEET_DAY, 9)} | Rent | −${pounds(2_400)}`,
      `step | ${addDays(SHEET_DAY, 20)} | Retainer | ${pounds(4_000)}`,
      'horizon | 90 |  | ',
    ]);
    return { ...base, source, step: 'day', ...(days.length ? { newest: days.at(-1)! } : {}) };
  }
  const values = Array.from({ length: points }, (_, i) => valueAt(i));
  const source = fence(`sparkline | Cash, ${SPECIMEN}`, [`Cash | ${values.join(' ')} | ${values.at(-1) ?? ''}`]);
  return { ...base, source };
}

/** How stale a specimen is: its newest point and how many of its steps that is before the sheet's day, or `null` when fresh. */
export function specimenStale(s: Pick<Specimen, 'newest' | 'step'>): { since: string; steps: number } | null {
  if (!s.newest || !s.step) return null;
  const steps =
    s.step === 'day'
      ? Math.round((Date.parse(`${SHEET_DAY}T00:00:00Z`) - Date.parse(`${s.newest}T00:00:00Z`)) / 86_400_000)
      : (Number(SHEET_DAY.slice(0, 4)) - Number(s.newest.slice(0, 4))) * 12 + Number(SHEET_DAY.slice(5, 7)) - Number(s.newest.slice(5, 7));
  return steps > 2 ? { since: s.newest, steps } : null;
}

/** Every chart specimen the sheet draws: each form at each count, fresh, and stale wherever it has a day and a point. */
export function chartSpecimens(): Specimen[] {
  return SHEET_FORMS.flatMap((form) => [
    ...SHEET_POINTS.map((n) => chartSpecimen(form, n, 'fresh')),
    ...(form === 'sparkline' ? [] : SHEET_POINTS.filter((n) => n > 0).map((n) => chartSpecimen(form, n, 'stale'))),
  ]);
}

/* A PLAN'S ROW IS `title | last day | days of work | tone`, as `roadmap.ts` reads a task. Work in hand has no tone and
   takes the accent; late is `bad`, done is `good`. Two of each, so a plan in one state still has two bars to pack. */
const PLAN_ROWS: Record<SheetState, readonly string[]> = {
  working: [`Write the page | ${addDays(SHEET_DAY, 8)} | 10`, `Proof the italics | ${addDays(SHEET_DAY, 15)} | 6`],
  late: [`Renew the lease | ${addDays(SHEET_DAY, -3)} | 4 | bad`, `Send the figures | ${addDays(SHEET_DAY, -1)} | 2 | bad`],
  done: [`Send the quote | ${addDays(SHEET_DAY, -7)} | 3 | good`, `Book the printer | ${addDays(SHEET_DAY, -10)} | 2 | good`],
};

/** The plan, in the states asked for: all three unless told, which is the one that draws its key. */
export function planSpecimen(states: readonly SheetState[] = SHEET_STATES): Specimen {
  const said = states.join(', ');
  return {
    key: `roadmap:${states.join('+')}`,
    kind: 'roadmap',
    label: `Specimen: plan, ${said}`,
    source: fence(`roadmap | Autumn, ${SPECIMEN}`, states.flatMap((s) => PLAN_ROWS[s])),
  };
}

/** The plan with the three states together, then each state alone. */
export const planSpecimens = (): Specimen[] => [planSpecimen(), ...SHEET_STATES.map((s) => planSpecimen([s]))];

const part = (kind: string, form: string | undefined, heading: string, rows: readonly string[]): Specimen => ({
  key: sheetKey(kind, form),
  kind,
  ...(form ? { form } : {}),
  label: `Specimen: ${sheetKey(kind, form)}`,
  source: fence(`${sheetKey(kind, form)} | ${heading}, ${SPECIMEN}`, rows),
});

/**
 * The chart forms that hold parts of a whole and not points over time, one specimen each. Each carries one part that
 * is over or late, so the deeper red and its mark are on the sheet beside the accent.
 */
export function partSpecimens(): Specimen[] {
  return [
    part('progress', undefined, 'Savings', ['Holiday | £1,200.00 | £3,000.00 | by 1 Mar 2027', 'New laptop | £900.00 | £900.00', 'Someday |  | ']),
    part('progress', 'budget', 'This month', ['Groceries | £212.40 | £300.00', 'Eating out | £140.00 | £120.00', 'Transport | £10.00 | £100.00']),
    part('progress', 'range', 'Budget', ['Box | £150.00 | £100.00 | £200.00', 'Print | £900.00 | £100.00 | £250.00 | warn']),
    part('ring', undefined, 'Week', ['Deep work | 12', 'Letters | 6', 'Invoices | 4 |  | bad']),
    part('split', undefined, 'Owed', ['Paid | 600', 'Overdue | 300 | 3 invoices | bad', 'Due soon | 100 |  | warn']),
    part('bridge', undefined, 'This month', ['Start | £9,000', 'Coming in | +£2,000 | 5 invoices', 'Going out | −£1,600', 'End of month | £9,400']),
    part('bar', undefined, 'Spend', ['Rent | 1200', 'Tools | 340', 'Travel | 90']),
    part('gauge', undefined, 'Runway', ['Months of cash | 5 | 12']),
    /* A HEAT WHOSE DAYS ARE SHARES, `3 of 12`: each day washed by its part of that day's own whole, with the line that
       says so under the grid. Its fence is a plain `heat`, so it is written out and not through `part`. */
    {
      key: 'heat:share',
      kind: 'heat',
      label: "Specimen: heat, each day a share of that day's whole",
      source: fence(`heat | Done on the day, ${SPECIMEN}`, daysTo(30, 0).map((d, i) => `${d} | ${(valueAt(i) % 5) + (i % 2)} of ${(valueAt(i) % 5) + 1 + (i % 3)}`)),
    },
  ];
}

/** The specimen a form is drawn from where the record holds none: the long fresh chart, the whole plan, or the part. */
export function specimenFor(kind: string, form?: string): Specimen | undefined {
  const key = sheetKey(kind, form);
  if ((SHEET_FORMS as readonly string[]).includes(key)) return chartSpecimen(key as SheetForm, 30);
  if (key === 'roadmap') return planSpecimen();
  return partSpecimens().find((s) => s.key === key);
}

/**
 * A FAILED RUN, DRAWN BOTH WAYS, for the open call the sheet puts to its reader: in red with the mark red carries,
 * and with the word alone, where red is kept for late and over. The word "Failed" is in both, so neither says it by
 * colour alone.
 */
export const FAILED_RUN: { red: Specimen; plain: Specimen } = {
  red: {
    key: 'failed-run:red',
    kind: 'timeline',
    label: 'Specimen: a failed run, in red',
    source: fence(`timeline | Runs, ${SPECIMEN}`, ['3h ago | Nightly figures | Failed | bad', '1d ago | Nightly figures | Finished', '2d ago | Nightly figures | Finished']),
  },
  plain: {
    key: 'failed-run:plain',
    kind: 'timeline',
    label: 'Specimen: a failed run, in words only',
    source: fence(`timeline | Runs, ${SPECIMEN}`, ['3h ago | Nightly figures | Failed', '1d ago | Nightly figures | Finished', '2d ago | Nightly figures | Finished']),
  },
};
