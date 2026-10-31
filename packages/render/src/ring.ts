/**
 * What `ring` decides, as functions both drawers call.
 *
 * A ring is a small dial with a figure in its centre. ONE ROW IS PROGRESS: `label | value | target`, the arc the
 * share of the target, read exactly as `progress` reads a goal (`progress.ts`), so a ring and a progress track over
 * the same row can never disagree about how far along it is. TWO TO FIVE ROWS ARE PARTS: `label | value | note`,
 * the arcs laid end to end as `split` cuts its track (`split.ts`), in the same four neutral steps, so a ring and a
 * split over the same rows show the same shares in the same order.
 *
 * NO VALUE IS WORDS ONLY. `progress` draws an empty track for a goal with
 * nothing saved, and that is right there, because a track with no fill still has its row of words beside it. A dial
 * with no arc in a 64px square reads as zero at a glance, which is a claim about a value nobody wrote. So a value
 * that does not read draws no ring, while a written `0` draws the ring with nothing on it.
 *
 * THE CENTRE OF A WHOLE IS ONE CURRENCY OR NOTHING. The parts' figure is their sum, written the way the first part
 * is written; parts in two units have no sum, so the centre is left empty and each arc is still its share of what
 * was written.
 */

import type { Tone } from './kinds.ts';
import { currencyOfFigure } from './money.ts';
import { signedOf } from './bridge.ts';
import { ringOf } from './cards.ts';
import { progressPlan, progressSentence } from './progress.ts';
import { amountLike } from './series.ts';
import { SPLIT_PART, splitPlan, splitSentence } from './split.ts';

/** The most rows a ring takes. `kinds.ts` caps the fence at it, so a sixth row degrades rather than drawing. */
export const RING_MOST = 5;

/** One row as the plan reads it: the label, value and third cell as drawn text, and a tone the author wrote. */
export type RingInput = { label: string; value: string; third: string; tone?: Tone };

/**
 * One arc on the dial, against a circle whose path length is 100: `dash` is its length and the gap after it,
 * `offset` how far round it starts, both attributes and never a style.
 */
export type RingArc = { row: number; dash: string; offset: string; step: number; tone?: Tone };

export type RingPlan = {
  form: 'progress' | 'parts';
  /** Whether the dial is drawn at all. False is words only. */
  ring: boolean;
  arcs: RingArc[];
  /** The figure in the centre: the share on progress, the whole on parts. Empty when there is none to say. */
  centre: string;
  /** The dial's accessible name. */
  name: string;
  /** Progress only: the reading, a tone the author wrote winning, as `progressPlan` gives it. */
  intent?: Tone;
  /** Progress only: what is left to go, or `Reached`. */
  left: string;
  /** Parts only: each row's share as printed, `null` for a row that draws no arc. */
  shares: (string | null)[];
  /** No rows at all: the block is its sentence. */
  empty: boolean;
};

/** Two decimals at most, and no trailing zeros, so an attribute stays short and exact. */
const at = (n: number): string => String(Math.round(n * 100) / 100);

/**
 * What a figure is counted in: everything in it that is not a digit, a separator or a sign. `EGP 6,000.00` is in
 * `EGP`, `£300.00` in `£`, `12` in nothing, so two parts can be added only when this is the same for both.
 */
const unitOf = (text: string): string => text.replace(/[\d.,\s−-]/gu, '');

const NO_RING = { ring: false, arcs: [], centre: '', left: '' } as const;

/** The dial for a block's rows: progress for one, parts for two to five. */
export function ringPlan(rows: readonly RingInput[], home?: string | null): RingPlan {
  if (rows.length === 0) return { form: 'progress', ...NO_RING, arcs: [], name: '', shares: [], empty: true };
  if (rows.length === 1) return progressRing(rows[0]!, home);
  return partsRing(rows, home);
}

/**
 * The arcs of rows read as parts of a whole, for any number of rows: the dial of a ring of two to five, and of a `split`
 * drawn as a donut, which may have more. The centre is their sum where they share one currency.
 */
export function partsRing(rows: readonly RingInput[], home?: string | null): RingPlan {
  const values = rows.map((r) => signedOf(r.value));
  const plan = splitPlan(values);
  const shares: (string | null)[] = rows.map(() => null);
  for (const p of plan.parts) shares[p.at] = p.share;
  if (plan.empty) return { form: 'parts', ...NO_RING, arcs: [], name: '', shares, empty: false };

  const arcs = plan.parts.map((p) => ({
    row: p.at,
    dash: `${at(Number(p.width) / 10)} 100`,
    offset: at(-Number(p.x) / 10),
    step: p.step,
    ...(rows[p.at]!.tone ? { tone: rows[p.at]!.tone } : {}),
  }));
  const drawn = plan.parts.map((p) => rows[p.at]!);
  const one = new Set(drawn.map((r) => unitOf(r.value))).size === 1;
  const total = plan.parts.reduce((sum, p) => sum + values[p.at]!, 0);
  return {
    form: 'parts',
    ring: true,
    arcs,
    centre: one ? amountLike(drawn[0]!.value, total, home, 'read') : '',
    name: splitSentence(plan.parts.map((p) => ({ label: rows[p.at]!.label, share: p.share }))),
    left: '',
    shares,
    empty: false,
  };
}

/**
 * One row toward its target, through `progressPlan` so the share, the reading and what is left are the ones a
 * `progress` track says. A value written as a proportion, `3/5` or `60%`, needs no target, as a card's ring reads it.
 */
function progressRing(r: RingInput, home: string | null | undefined): RingPlan {
  const base = { form: 'progress' as const, shares: [], empty: false };
  if (!Number.isFinite(signedOf(r.value))) return { ...base, ...NO_RING, arcs: [], name: '' };
  const [p] = progressPlan([{ value: r.value, target: r.third, ...(r.tone ? { tone: r.tone } : {}) }], 'goal', home);
  if (p?.drawable) {
    /* WHAT IS LEFT IS ONE AMOUNT LESS ANOTHER, so it is said only in one currency: a value in dollars toward a target
       in pounds read "EGP 699,370.05 to go", one currency taken from another. With two, nothing is said to be left. */
    const [has, wants] = [currencyOfFigure(r.value, home ?? null), currencyOfFigure(r.third ?? '', home ?? null)];
    const mixed = has !== null && wants !== null && has !== wants;
    return {
      ...base,
      ring: true,
      arcs: [{ row: 0, dash: `${at(Number(p.fill) * 100)} 100`, offset: '0', step: 0, ...(p.intent ? { tone: p.intent } : {}) }],
      centre: p.share,
      name: progressSentence(r.label, r.value, r.third, p.share),
      ...(p.intent ? { intent: p.intent } : {}),
      left: mixed ? '' : p.left,
    };
  }
  const m = ringOf(r.value);
  if (m === null) return { ...base, ...NO_RING, arcs: [], name: '' };
  const share = `${Math.round(m * 100)}%`;
  return {
    ...base,
    ring: true,
    arcs: [{ row: 0, dash: `${at(m * 100)} 100`, offset: '0', step: 0, ...(r.tone ? { tone: r.tone } : {}) }],
    centre: share,
    name: `${r.label || SPLIT_PART}: ${r.value}, ${share}`,
    ...(r.tone ? { intent: r.tone } : {}),
    left: '',
  };
}

/**
 * How each circle is painted when the page has no rule for it.
 *
 * AN SVG CIRCLE NOBODY PAINTS IS A BLACK DISC. `roadmap`, when it was a drawing, shipped without a rule and drew one
 * black slab; these attributes are the weakest thing in the cascade, so a host's `ring-` rules win over them and a
 * host with none still draws an outline in the block's own ink. A part's step is a lighter share of that ink, so
 * four parts are told apart with no stylesheet at all.
 */
export const RING_PAINT = {
  track: { fill: 'none', stroke: 'currentColor', 'stroke-opacity': '0.15', 'stroke-width': '4' },
  arc: { fill: 'none', stroke: 'currentColor', 'stroke-width': '4' },
} as const satisfies Record<string, Readonly<Record<string, string>>>;

/** A part's ink by its step, darkest first, for a page with no rule for `ring-arc[data-step]`. */
export const RING_STEP_OPACITY = ['1', '0.7', '0.45', '0.25'] as const;

/** The renderer's own words, as `progress.ts` keeps its own: it imports nothing from the app. */
export const RING_NONE = 'Nothing to measure yet.';
export const RING_OF = 'of';
