/**
 * Swimlanes' geometry: a lane a row (an agent, a person, a machine), each with the spans it was busy,
 * on one time axis with hour ticks under it and the now line through it ("time and
 * overlap", such as who is at work, or sessions).
 *
 * TIME IS EPOCH MILLISECONDS, and ticks fall on the viewer's own local hours: the axis says "09:00"
 * where their clock does. The tick step is the smallest of 1, 2, 3, 4, 6, 12 or 24 hours that keeps
 * the labels 56px apart, so a phone gets fewer ticks, not smaller ones.
 *
 * A LIVE SPAN RUNS TO NOW, whatever its `to` says, because it is still running. Every span is clipped
 * to the window and is never thinner than 4px, so a two-minute session is still there.
 *
 * AT PHONE WIDTH THE LABELS GO ABOVE THEIR LANES (below 360px), and the lanes take the full width.
 */

import { clamp, listed, r2, textWidth } from './shared.ts';

export interface Span {
  from: number;
  to: number;
  /** Still running: drawn in `live`, up to now. */
  live?: boolean | undefined;
}

export interface Lane {
  label: string;
  spans: readonly Span[];
}

/** A moment worth a dashed rule: "you left 21:40". */
export interface LaneMark {
  at: number;
  label?: string | undefined;
}

export interface DrawnSpan {
  x: number;
  w: number;
  rx: number;
  live: boolean;
}

export interface DrawnLane {
  label: string;
  labelY: number;
  /** Top of the lane's track. */
  y: number;
  spans: DrawnSpan[];
}

export interface Tick {
  x: number;
  text: string;
  anchor: 'start' | 'middle' | 'end';
}

export interface NowLine {
  x: number;
  text: string;
  pillX: number;
  pillW: number;
}

export interface DrawnMark {
  x: number;
  label: string | null;
  labelX: number;
  anchor: 'start' | 'middle' | 'end';
}

export interface SwimGeometry {
  /** Where the lanes start: after the labels, or 0 when folded. */
  gutter: number;
  lanes: DrawnLane[];
  ticks: Tick[];
  /** The axis hairline's y; the now line and the rules run from the top down to it. */
  axisY: number;
  tickY: number;
  now: NowLine | null;
  marks: DrawnMark[];
  height: number;
  folded: boolean;
}

export interface SwimOptions {
  start: number;
  end: number;
  now: number;
  width: number;
  marks?: readonly LaneMark[] | undefined;
  format?: ((t: number) => string) | undefined;
}

export const TRACK_H = 12;
export const FOLD_BELOW = 360;
const HOUR = 3_600_000;
const STEPS = [1, 2, 3, 4, 6, 12, 24] as const;
const TICK_GAP = 56;
const TOP = 18;

const CLOCK = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** "09:40", on the viewer's clock. */
export const clock = (t: number): string => CLOCK.format(t);

/** The hour step that keeps tick labels `gap` px apart at this scale. */
export function tickStep(pxPerHour: number, gap = TICK_GAP): number {
  return STEPS.find((s) => s * pxPerHour >= gap) ?? 24;
}

/** Local whole hours from `start` to `end` that fall on the step: 00:00, 02:00, 04:00. */
export function hourTicks(start: number, end: number, step: number): number[] {
  if (!(end > start)) return [];
  const d = new Date(start);
  d.setMinutes(0, 0, 0);
  if (d.getTime() < start) d.setHours(d.getHours() + 1);
  while (d.getHours() % step !== 0) d.setHours(d.getHours() + 1);
  const out: number[] = [];
  /* The guard is a count, not a time, so a DST day never loops. */
  for (let k = 0; d.getTime() <= end && k < 400; k++) {
    out.push(d.getTime());
    d.setHours(d.getHours() + step);
  }
  return out;
}

/** Anchor a label so it stays inside [0, width]. */
function anchored(x: number, w: number, width: number): 'start' | 'middle' | 'end' {
  if (x + w / 2 > width) return 'end';
  if (x - w / 2 < 0) return 'start';
  return 'middle';
}

export function swimlanes(lanes: readonly Lane[], o: SwimOptions): SwimGeometry {
  const fmt = o.format ?? clock;
  const folded = o.width < FOLD_BELOW;
  const gutter = folded ? 0 : Math.min(Math.max(0, ...lanes.map((l) => textWidth(l.label))) + 12, Math.round(o.width * 0.3));
  const plot = Math.max(0, o.width - gutter);
  const span = o.end - o.start;
  const x = (t: number): number => (span > 0 ? gutter + ((clamp(t, o.start, o.end) - o.start) / span) * plot : gutter);

  const pitch = folded ? 38 : 28;
  const first = folded ? TOP + 26 : TOP + 14;
  const drawn = lanes.map((lane, i): DrawnLane => {
    const y = first + i * pitch;
    const spans = lane.spans.flatMap((s): DrawnSpan[] => {
      const live = s.live === true;
      const from = Math.max(s.from, o.start);
      const to = Math.min(live ? o.now : s.to, o.end);
      if (!Number.isFinite(from) || !Number.isFinite(to) || to < from || from > o.end) return [];
      const w = Math.max(4, x(to) - x(from));
      const left = Math.min(x(from), o.width - w);
      return [{ x: r2(left), w: r2(w), rx: r2(Math.min(6, w / 2)), live }];
    });
    return { label: lane.label, labelY: folded ? y - 6 : y + 10, y, spans };
  });

  const lastTrack = first + Math.max(0, lanes.length - 1) * pitch + TRACK_H;
  const axisY = r2(lastTrack + 10 + 0.5);
  const tickY = r2(axisY + 15.5);

  const step = tickStep(span > 0 ? (plot * HOUR) / span : 0);
  const ticks = hourTicks(o.start, o.end, step).map((t): Tick => {
    const text = fmt(t);
    const tx = r2(x(t));
    return { x: tx, text, anchor: anchored(tx, textWidth(text), o.width) };
  });

  let now: NowLine | null = null;
  if (o.now >= o.start && o.now <= o.end && span > 0) {
    const text = `now ${fmt(o.now)}`;
    const pillW = textWidth(text) + 12;
    const nx = r2(x(o.now));
    now = { x: nx, text, pillW, pillX: r2(clamp(nx - pillW / 2, 0, Math.max(0, o.width - pillW))) };
  }

  const marks = (o.marks ?? [])
    .filter((m) => m.at >= o.start && m.at <= o.end)
    .map((m): DrawnMark => {
      const mx = r2(x(m.at));
      const w = m.label ? textWidth(m.label) : 0;
      const anchor = anchored(mx, w, o.width);
      const lo = anchor === 'start' ? mx : anchor === 'end' ? mx - w : mx - w / 2;
      /* A mark's words give way to the now pill rather than sit on it. */
      const clash = now !== null && lo < now.pillX + now.pillW + 4 && lo + w + 4 > now.pillX;
      return { x: mx, label: m.label && !clash ? m.label : null, labelX: mx, anchor };
    });

  return { gutter, lanes: drawn, ticks, axisY, tickY, now, marks, height: r2(tickY + 4), folded };
}

/**
 * "Sessions from 00:00 to 10:00. claude: 00:20 to 01:40, 04:40 to 06:02 and since 08:58. codex:
 * nothing. Now is 09:40."
 */
export function describeLanes(
  lanes: readonly Lane[],
  o: { start: number; end: number; now: number },
  subject?: string,
  format: (t: number) => string = clock,
): string {
  const lead = `${subject ?? 'Sessions'} from ${format(o.start)} to ${format(o.end)}.`;
  const each = lanes.map((lane) => {
    const said = lane.spans.map((s) => (s.live ? `since ${format(s.from)}` : `${format(s.from)} to ${format(s.to)}`));
    return `${lane.label}: ${said.length > 0 ? listed(said) : 'nothing'}.`;
  });
  const now = o.now >= o.start && o.now <= o.end ? ` Now is ${format(o.now)}.` : '';
  return [lead, ...each].join(' ') + now;
}
