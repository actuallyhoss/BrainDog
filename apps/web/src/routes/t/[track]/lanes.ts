/**
 * Who has worked on a thread's project over the last day, as swimlanes and one line saying what they mean (time
 * and overlap). Out of the component so `node --test` can hold it; a Svelte page does not mount there.
 *
 * A RUN'S SPAN IS WHEN ITS ROW WAS WRITTEN TO WHEN IT WAS LAST HEARD FROM. The kernel writes a `session` row when a run
 * starts and stamps `last_seen` on every write it makes (`packages/kernel/src/session.ts`), so `created` and
 * `last_seen` are the two ends the record already holds; a run working now runs to now. That is an outline, not a
 * timesheet: a run that went quiet in the middle is drawn through the gap, and the line says "worked on it for" about
 * the time between those two ends and nothing finer.
 *
 * TWO RUNS OF ONE AGENT AT ONCE ARE ONE AGENT'S TIME ONCE, so an agent's minutes are the union of its spans, never the
 * sum. Every figure here is read off the rows; nothing is estimated.
 */

import type { Lane, Span } from '../../../lib/viz/swimlanes.ts';

/** One run as the lanes read it. `created` and `lastSeen` are the record's own instants. */
export type Run = { agent: string; created: string; lastSeen: string; working: boolean };

/** A day, the window the lanes cover and the line counts over. */
export const WINDOW_MS = 24 * 60 * 60_000;

/** What the lanes draw, and each agent's time inside the window, most first. */
export type Lanes = {
  lanes: Lane[];
  start: number;
  end: number;
  worked: { agent: string; ms: number; working: boolean }[];
};

/** The time a set of spans covers, overlaps counted once. */
function covered(spans: readonly Span[]): number {
  const sorted = [...spans].sort((a, b) => a.from - b.from);
  let total = 0;
  let from = Number.NEGATIVE_INFINITY;
  let to = Number.NEGATIVE_INFINITY;
  for (const s of sorted) {
    if (s.from > to) {
      if (to > from) total += to - from;
      from = s.from;
      to = s.to;
    } else if (s.to > to) {
      to = s.to;
    }
  }
  if (to > from) total += to - from;
  return total;
}

/**
 * The runs over the day that ends at `now`, one lane an agent, in the order each agent was last heard from.
 *
 * A run is in the window when any of it is; its span is clipped to the window, and a run working now reaches now. A run
 * whose instants cannot be read is left out rather than drawn somewhere it never was.
 */
export function lanesOf(runs: readonly Run[], now: number, windowMs = WINDOW_MS): Lanes {
  const start = now - windowMs;
  const by = new Map<string, { spans: Span[]; working: boolean; last: number }>();
  for (const r of runs) {
    const from = Date.parse(r.created);
    const seen = Date.parse(r.lastSeen);
    if (!Number.isFinite(from) || !Number.isFinite(seen)) continue;
    const to = r.working ? now : seen;
    if (to < start || from > now) continue;
    const agent = r.agent.trim() === '' ? 'agent' : r.agent;
    const lane = by.get(agent) ?? { spans: [], working: false, last: Number.NEGATIVE_INFINITY };
    lane.spans.push({ from: Math.max(from, start), to: Math.min(Math.max(to, from), now), live: r.working });
    lane.working ||= r.working;
    lane.last = Math.max(lane.last, to);
    by.set(agent, lane);
  }
  const order = [...by.entries()].sort((a, b) => b[1].last - a[1].last);
  return {
    lanes: order.map(([label, l]) => ({ label, spans: l.spans })),
    start,
    end: now,
    worked: order
      .map(([agent, l]) => ({ agent, ms: covered(l.spans), working: l.working }))
      .sort((a, b) => b.ms - a.ms),
  };
}

/** A stretch of time as a sentence says it: "42 minutes", "1 hour 8 minutes", "under a minute". */
export function durationSaid(ms: number): string {
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'under a minute';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const hours = h === 0 ? '' : h === 1 ? '1 hour' : `${h} hours`;
  const minutes = m === 0 ? '' : m === 1 ? '1 minute' : `${m} minutes`;
  return [hours, minutes].filter(Boolean).join(' ');
}

const COUNT = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const counted = (n: number): string => COUNT[n] ?? String(n);

/**
 * The one line under the lanes (specific and sourced). "claude has worked on it for 42 minutes in the last
 * day, and is working now." With several agents it names the one who put in the most and says how many are at it now.
 */
export function lanesSaid(l: Lanes, project: string): string {
  const [top, ...rest] = l.worked;
  if (!top) return `No agent has worked on ${project} in the last day.`;
  const now = l.worked.filter((w) => w.working).length;
  if (rest.length === 0) {
    return `${top.agent} has worked on it for ${durationSaid(top.ms)} in the last day${top.working ? ', and is working now' : ''}.`;
  }
  const lead = `${counted(l.worked.length)} agents worked on it in the last day, ${top.agent} the longest at ${durationSaid(top.ms)}.`;
  return now === 0 ? lead : `${lead} ${counted(now)} ${now === 1 ? 'is' : 'are'} working now.`;
}
