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

/**
 * One key number as a card draws it, or `null` when nothing has arrived for it: a number with no value is no figure,
 * and the card then says what it says without one.
 */
export function cardKpiOf(a: KpiAnswered, opts: { home?: string | null; now?: number } = {}): CardKpi | null {
  const v = kpiView(a, opts);
  if (!v.figure) return null;
  const stale = v.stale ? v.stale.said : null;
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
    sentence: v.sentence,
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
