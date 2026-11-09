/**
 * THE KEY NUMBER A PROJECT'S CARD LEADS WITH, apart from the cards themselves (`project-cards.ts`), because it is the
 * renderer's `kpiView` that plans it and Today's desk draws its cards before any key number is read: kept here, the
 * planner loads with the blocks that draw a key number and not with Today's first paint. Pure, so `project-cards.test.ts`
 * holds the rules.
 */

import { kpiView, type KpiInput } from 'braindog-render';

import type { ProjectCard } from './project-cards.ts';

/* ── the key number a card leads with ─────────────────────────────────────── */

/**
 * THE KEY NUMBER A PROJECT'S CARD AND HERO LEAD WITH (the KPI plan of 21 October, 2.5, decided 3): the one he marked to
 * lead the card, else its project's top one by Today's score (`kpiHeadline` in the kernel), as the `kpis` source answers
 * it `for: cards`. Planned by the renderer's own `kpiView`, so the card, the hero and Today say one number one way: the
 * figure (a flow its last whole month), its name, how it moved on the period before, and its line.
 *
 * ITS LINE IS ITS OWN READINGS, never tasks done by week beside a money figure; from three points, as every chart.
 * A STALE ONE SAYS SO IN THE WARN COLOUR, with the words, never red: red on a card is for what is late.
 */
export type CardKpi = {
  key: string;
  /** Its name, said small beside the figure: "Licence revenue". */
  name: string;
  /** The figure, said short as a tile says one, its unit word left to the name: "£1,900", "1,240". */
  figure: string;
  /** How it moved on the period before, in words, and whether that was the good way: "Up 36% on Aug". */
  move: { said: string; tone: 'good' | 'warn' | null } | null;
  /** "Not updated since 3 Oct", where it has stopped arriving; the move is not said then. */
  stale: string | null;
  /** Its line in the renderer's `0 0 1000 100` box: the line, the fill under a flow, its last dot, the month still running. */
  line: { line: string; area: string; end: string; partial: string } | null;
  /** The whole of it in one sentence, for a screen reader. */
  sentence: string;
};

/** A key number as the `kpis` source answers it: the renderer's input, and the project it is of. */
export type KpiAnswered = KpiInput & { thing?: string | undefined; project?: string | undefined };

/**
 * A FORECAST OR PLAN IS NO KEY NUMBER FOR A CARD TO LEAD WITH: "Monthly revenue a year out: bear" is what somebody expects,
 * not what came in, and a card's big figure is a measured one. Named by the words a scenario carries.
 */
export const isForecast = (name: string): boolean => /\ba year out\b|:\s*(bear|base|bull)\b|\b(forecast|projected|projection|outlook|scenario)\b/iu.test(name);

/** A name that says its figure is the thirty days to its newest reading: "Revenue, last 30 days". */
const LAST_30 = /\blast\s+(?:30|thirty)\s+days\b/iu;

/**
 * WHAT A MONEY KEY NUMBER SAYS OF A MONTH, SINCE 9 NOV (the owner, of Projects' earning a month: a secured income, a
 * salary under contract, should show its month at once, and a revenue fed daily its last 30 days). One reading for the
 * earning tile on Projects, a project's row there, its card on Today and its own page, so each says one figure one way:
 *
 * - `last30`: its name says "last 30 days" (a revenue fed daily): the thirty days to its newest reading are the month,
 *   counted while that reading is fresh, as a month made is.
 * - `secured`: kept a month (`every` 1m, or its name says month) and its shape is `level`, a standing rate such as a salary
 *   under contract: it counts from its newest reading however old that is, and is never said to be stale.
 * - `made`: any other kept a month: what came in the month its newest reading was made in.
 *
 * `null` for one that says no month. Whether it is money is for the reader to ask, as each holds money its own way.
 */
export type MonthKind = 'last30' | 'secured' | 'made';
export function monthKindOf(k: { name: string; kind?: string | null | undefined; every?: string | null | undefined }): MonthKind | null {
  if (LAST_30.test(k.name)) return 'last30';
  if (k.every !== '1m' && !/month/iu.test(k.name)) return null;
  return k.kind === 'level' ? 'secured' : 'made';
}

/** Money kept a month at a standing rate (`monthKindOf`): its unit is a currency code, as the record answers it. */
const securedMoney = (a: KpiAnswered): boolean => /^[A-Z]{3}$/u.test(a.unit ?? '') && monthKindOf(a) === 'secured';

/**
 * One key number as a card draws it, or `null` when nothing has arrived for it: a number with no value is no figure,
 * and the card then says what it says without one.
 */
export function cardKpiOf(a: KpiAnswered, opts: { home?: string | null; now?: number } = {}): CardKpi | null {
  const v = kpiView(a, opts);
  if (!v.figure) return null;
  /* A SECURED RATE IS NEVER STALE (`monthKindOf`, 9 Nov): a salary under contract is what it says until it changes, so its
     card says no "Not updated since" over the figure Projects counts as secured, and its sentence leaves it out too. */
  const standing = !!v.stale && securedMoney(a);
  const stale = v.stale && !standing ? v.stale.said : null;
  const tail = v.stale ? `, ${v.stale.said}` : '';
  const sentence = standing && v.sentence.endsWith(tail) ? v.sentence.slice(0, -tail.length) : v.sentence;
  const drawn = v.chart && (v.chart.form === 'line' || v.chart.form === 'area') && v.chart.line !== '' ? v.chart : null;
  return {
    key: v.key,
    name: v.name,
    /* THE NUMBER WITHOUT ITS UNIT WORD, since the name beside it says what it counts ("251", Specimen downloads): money
       keeps its code, which is what says the currency. */
    figure: v.figure.after === '' || /^[A-Z]{3}$/u.test(v.figure.after) ? v.figure.text : v.figure.main,
    move: !stale && v.change ? { said: `${v.change.said} ${v.change.against}`.trim(), tone: v.change.tone } : null,
    stale,
    line: drawn ? { line: drawn.line, area: drawn.area, end: drawn.end, partial: drawn.partial } : null,
    sentence,
  };
}

/**
 * Each card with the key number its project leads with, matched by the project's row id, else by its name. A card
 * whose project keeps none, or whose number has no value yet, keeps what it said: its money figure, else how far along.
 */
export function withKpis<C extends Pick<ProjectCard, 'name' | 'id' | 'kpi'>>(cards: readonly C[], answers: readonly KpiAnswered[], opts: { home?: string | null; now?: number } = {}): C[] {
  if (answers.length === 0) return [...cards];
  return cards.map((c) => {
    const a = answers.find((x) => (c.id && x.thing ? x.thing === c.id : x.project === c.name));
    const kpi = a && !isForecast(a.name) ? cardKpiOf(a, opts) : null;
    return kpi ? { ...c, kpi } : c;
  });
}
