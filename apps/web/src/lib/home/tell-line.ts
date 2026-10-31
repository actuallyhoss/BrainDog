/**
 * Today's slim "Tell it something" line, kept after the first thing is added (first-hour audit AH9, the call in
 * loop/plans/finish/QUEUE.md): for the first week, or until it is hidden, with the same rules-only reader as the card, so
 * adding never spends an ask. And what was last added through it, said under it the same before and after a reload
 * (AH23), so the first thing told is seen where it was said.
 *
 * PER VIEWER AND PER BRAINDOG, in this browser only: it is a convenience, never the record's state, so it lives in
 * `localStorage` under the record's own address, and a browser that keeps nothing still draws Today (every read and
 * write is guarded, and a missing copy reads as a first visit).
 *
 * A plain `.ts` so `node --test` can hold it; `Home.svelte` and `TellOne.svelte` only call it.
 */

/** One entry added, as the line under the field says it: what it is, the list it went into and where that list is. */
export type ToldLine = { said: string; list: string; href: string };

export type TellKept = {
  /** When the line was first offered here, in ms: it stays a week from then. */
  from?: number;
  /** Hidden by the person: it does not come back. */
  hidden?: boolean;
  /** What the last press added, and when. */
  last?: { at: number; lines: ToldLine[] };
};

/** The most entries added by hand on a BrainDog that is still offered the slim line: past it, the record is long kept. */
export const SLIM_MOST = 60;

/** How long the slim line stays after it is first offered. */
export const WEEK = 7 * 86_400_000;
/** How long what was last added is said under it. */
export const LAST_FOR = 2 * 86_400_000;

const keyOf = (base: string): string => `bd.tell:${base || '/'}`;

const shaped = (v: unknown): TellKept => {
  if (v === null || typeof v !== 'object') return {};
  const o = v as Record<string, unknown>;
  const out: TellKept = {};
  if (typeof o.from === 'number' && Number.isFinite(o.from)) out.from = o.from;
  if (o.hidden === true) out.hidden = true;
  const last = o.last as { at?: unknown; lines?: unknown } | undefined;
  if (last && typeof last.at === 'number' && Array.isArray(last.lines))
    out.last = {
      at: last.at,
      lines: last.lines.filter((l): l is ToldLine => l !== null && typeof l === 'object' && typeof l.said === 'string' && typeof l.list === 'string' && typeof l.href === 'string').slice(0, 8),
    };
  return out;
};

/** What this browser keeps of the line for the BrainDog at `base`; nothing when it keeps nothing. */
export function readTell(base: string): TellKept {
  try {
    const raw = globalThis.localStorage?.getItem(keyOf(base));
    return raw ? shaped(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

/** Keeps a change, and answers what is kept now (the change alone, where the browser keeps nothing). */
export function keepTell(base: string, change: TellKept): TellKept {
  const next = { ...readTell(base), ...change };
  try {
    globalThis.localStorage?.setItem(keyOf(base), JSON.stringify(next));
  } catch {
    /* A private window keeps nothing: the line is still drawn for this visit. */
  }
  return next;
}

/** Whether the slim line is offered: not hidden, and within a week of the first time it was. */
export const slimShown = (kept: TellKept, now: number): boolean => kept.hidden !== true && (kept.from === undefined || now - kept.from < WEEK);

/** What was last added, while it is recent enough to say. */
export const lastLines = (kept: TellKept, now: number): ToldLine[] => (kept.last && now - kept.last.at < LAST_FOR ? kept.last.lines : []);
