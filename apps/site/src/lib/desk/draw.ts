/**
 * The desk's little drawings as path strings: a project's sparkline, the cash line, Tidepool's monthly bars.
 *
 * PURE AND SERVER-SAFE, so the prerendered page carries every drawing in its HTML and a test can read the numbers.
 * The shapes are the prototype's (`loop/site-2026-10-17/src/site.html`, `spark`, `area` and the bars in `project()`),
 * with every coordinate rounded to one place so the served bytes stay short.
 */

/** A coordinate rounded to one place, said without a trailing ".0". */
export const n1 = (v: number): string => String(Math.round(v * 10) / 10);

/** The line through the points, and the same line closed down to the floor for the soft fill under it. */
export type Drawn = { line: string; fill: string };

const path = (pts: readonly (readonly [number, number])[]): string =>
  pts.map(([x, y], i) => `${i ? 'L' : 'M'}${n1(x)} ${n1(y)}`).join(' ');

const across = (count: number, i: number, w: number): number => (count > 1 ? (i * w) / (count - 1) : (i ? w : 0));

/**
 * A sparkline in a `w` by `h` box, 3 units clear of the top and bottom. A flat series draws a flat line at the floor
 * of that margin rather than dividing by nothing, and a single value draws a line across the box.
 */
export function spark(values: readonly number[], w = 84, h = 30): Drawn {
  const vs = values.length === 1 ? [values[0]!, values[0]!] : values;
  const mn = Math.min(...vs);
  const r = Math.max(...vs) - mn || 1;
  const line = path(vs.map((v, i) => [across(vs.length, i, w), h - 3 - ((v - mn) / r) * (h - 6)] as const));
  return { line, fill: `${line} L${n1(w)} ${n1(h)} L0 ${n1(h)}Z` };
}

/** The cash line: a 300 by 64 box stretched to the tile's width, with room under the lowest point and over the top. */
export const AREA = { w: 300, h: 64 } as const;

export function area(values: readonly number[]): Drawn {
  const { w, h } = AREA;
  const vs = values.length === 1 ? [values[0]!, values[0]!] : values;
  const mn = Math.min(...vs) - 2;
  const r = Math.max(...vs) + 1 - mn;
  const line = path(vs.map((v, i) => [across(vs.length, i, w), h - ((v - mn) / r) * h] as const));
  return { line, fill: `${line} L${w} ${h} L0 ${h}Z` };
}

/** One bar of a month chart, with where its label sits. The last month is the current one. */
export type Bar = { x: number; y: number; w: number; h: number; label: string; cx: number; ly: number; now: boolean };

/** The bars' box: 340 by 116, bars 34 wide and 22 apart on a 96 high floor, labels 16 under it. */
export const BARS = { w: 340, h: 116, floor: 96, bar: 34, gap: 22 } as const;

/**
 * Month bars scaled against `top`, or when none is given the next whole number over the tallest month (the
 * prototype's 9 for a top of 8.4), so the tallest bar never touches the top of the box.
 */
export function bars(
  months: readonly { label: string; value: number }[],
  top = Math.floor(Math.max(0, ...months.map((m) => m.value))) + 1,
): Bar[] {
  return months.map((m, i) => {
    const bh = Math.round((Math.max(0, m.value) / top) * BARS.floor * 10) / 10;
    const x = i * (BARS.bar + BARS.gap) + 4;
    return {
      x,
      y: Math.round((BARS.floor - bh) * 10) / 10,
      w: BARS.bar,
      h: bh,
      label: m.label,
      cx: x + BARS.bar / 2,
      ly: BARS.floor + 16,
      now: i === months.length - 1,
    };
  });
}
