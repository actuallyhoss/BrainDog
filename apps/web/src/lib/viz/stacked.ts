/**
 * A stacked bar's geometry: one pill-ended bar split into its parts, 2px apart, with a label under a
 * part, at its start, when the label fits inside the part's width. A label never runs on under the
 * next part, where it would read as that part's.
 *
 * THE PARTS SPAN THE WIDTH EXACTLY. The gaps come out of the width first, the parts share the rest by
 * value, and a part above zero is never thinner than 2px (the widest part pays for it), so a small
 * share is still seen.
 */

import { figure, r2, textWidth } from './shared.ts';

export interface StackPart {
  /** Index of the part in the list it came from. */
  i: number;
  x: number;
  w: number;
  /** Its label's start, or null when the label does not fit under it. */
  labelX: number | null;
}

export interface StackGeometry {
  parts: StackPart[];
  /** Baseline of the labels, below the bar. */
  labelY: number;
  height: number;
}

export const STACK_GAP = 2;
const MIN_PART = 2;

/** The x and width of each part above zero, in order, spanning `width` with `gap` between them. */
export function stack(values: readonly number[], width: number, gap = STACK_GAP): { i: number; x: number; w: number }[] {
  const kept = values.map((v, i) => ({ v: Number.isFinite(v) ? v : 0, i })).filter((p) => p.v > 0);
  if (kept.length === 0 || width <= 0) return [];
  const total = kept.reduce((s, p) => s + p.v, 0);
  const avail = Math.max(0, width - gap * (kept.length - 1));
  const ws = kept.map((p) => (p.v / total) * avail);

  /* A sliver becomes 2px, and the widest part gives the difference back, so the sum still holds. */
  let owed = 0;
  for (const [k, w] of ws.entries())
    if (w < MIN_PART) {
      owed += MIN_PART - w;
      ws[k] = MIN_PART;
    }
  if (owed > 0) {
    const widest = ws.indexOf(Math.max(...ws));
    ws[widest] = Math.max(MIN_PART, (ws[widest] ?? 0) - owed);
  }

  let x = 0;
  return kept.map((p, k) => {
    const w = ws[k] ?? 0;
    const part = { i: p.i, x: r2(x), w: r2(w) };
    x += w + gap;
    return part;
  });
}

export function stacked(
  parts: readonly { label: string; value: number }[],
  width: number,
  height = 12,
): StackGeometry {
  const spans = stack(
    parts.map((p) => p.value),
    width,
  );
  const placed = spans.map((s): StackPart => {
    const label = parts[s.i]?.label ?? '';
    return { ...s, labelX: label && textWidth(label) + 8 <= s.w ? s.x : null };
  });
  const labelled = placed.some((p) => p.labelX !== null);
  return { parts: placed, labelY: height + 16, height: height + (labelled ? 20 : 0) };
}

/** "Pounds by account: HSBC current 268,400, CIB 131,900 and cash 24,000". */
export function describeStacked(
  parts: readonly { label: string; value: number }[],
  subject: string | undefined,
  format: (n: number) => string = figure,
): string {
  const said = parts.filter((p) => Number.isFinite(p.value) && p.value > 0).map((p) => `${p.label} ${format(p.value)}`);
  if (said.length === 0) return subject ? `${subject}: nothing yet` : 'Nothing yet';
  return `${subject ? `${subject}: ` : ''}${said.join(', ')}`;
}
