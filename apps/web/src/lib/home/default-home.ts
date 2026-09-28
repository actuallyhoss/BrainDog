/**
 * THE HOUSE HOME: the page Home draws on a record that declares neither its use case's `home-<id>` nor a `home` page
 * (modules C8), and what Home does to whichever of the three it draws.
 *
 * A PAGE BODY OVER COMPUTED SOURCES ONLY, NAMING NO LIST. Every figure, question, run and deadline it shows is one the
 * record already answers across its lists (`figures.home`, `governance.open`, `sessions.live`, `deadlines`,
 * `activity`), so the web never knows a pack by the name of its list (shell.md USE-2). The record draws it with
 * `previewPage`, which writes nothing, and Home hands the answer to `PageView` with `mode: 'home'`, so its questions are
 * answered in place and its writes stay on (contracts §11 X19).
 *
 * A PLAIN MODULE, so the body and the reshaping below are read by a test without a component.
 */

import type { PageBlock } from '../record/schema.ts';
import type { LiveBlock } from '../record/page-live.ts';
import { words } from './words.ts';

/** The headings a use case's voice may say its own way, with the house line each falls back to. */
export type HomeVoice = { rightNow: string; needsYou: string; sinceAway: string };

const HOUSE: HomeVoice = { rightNow: words.rightNow, needsYou: words.needsYou, sinceAway: words.sinceAway };

/** How far ahead "Coming up" looks, in days (modules MOD-8). */
export const COMING_UP_DAYS = 14;

/** How many questions "What needs you" draws before its count becomes the door to Decide. */
export const NEEDS_YOU_LIMIT = 5;

/**
 * The house Home, in the words of the voice that speaks. The blocks are the web's `PageBlock`, which the record lints as
 * it would any page body before it draws them.
 */
export function defaultHome(voice: HomeVoice = HOUSE): { page: string; title: string; blocks: PageBlock[] } {
  return {
    page: 'home',
    title: 'Home',
    blocks: [
      /* THE FIGURES A PACK ASKED A PLACE ON HOME FOR (`home: 1..9`), at most four; hidden below when none did. */
      { kind: 'stat', heading: voice.rightNow, source: 'figures.home' },
      /* ANSWERED WHERE THEY ARE SHOWN (MOD-9): the page's writes are on, so a queue draws `QueueAnswer`. */
      { kind: 'queue', heading: voice.needsYou, source: 'governance.open', limit: NEEDS_YOU_LIMIT, empty: words.nothingWaiting },
      /* THE RUNS STILL WORKING, one line each with the agent's face; hidden below when none is. */
      {
        kind: 'table',
        heading: words.workingNow,
        source: 'sessions.live',
        where: 'state is active',
        columns: [
          { field: 'agent', as: 'who' },
          { field: 'doing', as: 'title' },
          { field: 'last_seen', as: 'when' },
        ],
        limit: 6,
      },
      /* WHAT FALLS DUE, overdue first and then by day, as the record orders it; Home splits the overdue rows out. */
      {
        kind: 'timeline',
        heading: words.comingUp,
        source: 'deadlines',
        horizon: COMING_UP_DAYS,
        columns: [{ field: 'day' }, { field: 'title' }, { field: 'amount', sign: { field: 'direction', minus: 'out' } }],
        limit: 12,
        empty: words.nothingDue,
      },
      /* WHAT CHANGED SINCE THE READER'S MARK, which Home stamps when they leave, never when they open it. */
      { kind: 'feed', heading: voice.sinceAway, source: 'activity', since: 'seen', first: 8, empty: words.nothingNew },
    ],
  };
}

/** The house Home in the house voice (contracts §8.3). */
export const DEFAULT_HOME = defaultHome();

const isFigures = (b: LiveBlock): boolean => b.source === 'figures.home';
const isRuns = (b: LiveBlock): boolean => b.source === 'sessions.live';
const isDue = (b: LiveBlock): boolean => b.source === 'deadlines';
const isQueue = (b: LiveBlock): boolean => b.kind === 'queue';
/* A BLOCK THE RECORD REFUSED, OR THIS BUILD CANNOT DRAW, draws its own sentence and is never hidden or reshaped here. */
const says = (b: LiveBlock): boolean => b.refusals.length > 0 || b.cannot !== undefined;

/** The reader's day at `now`, as `YYYY-MM-DD`, which a deadline's `day` is compared with. */
const dayOf = (now: number): string => {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** The rows of a block at the given places, with the rows drawn and the entries they came from kept aligned. */
function pick(b: LiveBlock, at: readonly number[], heading?: string): LiveBlock {
  const entries = at.map((n) => b.entries[n]!);
  return {
    ...b,
    ...(heading === undefined ? {} : { heading }),
    entries,
    matched: entries,
    rows: at.map((n) => b.rows[n]!),
    shown: at.length,
    total: at.length,
  };
}

/**
 * THE BLOCKS AS HOME DRAWS THEM, whichever page they came from.
 *
 * TWO ARE HIDDEN WHEN THEY HOLD NOTHING: the figures when no pack pinned one, and the runs when no agent is working. An
 * empty band of figures and "No agent is working" are true on most records most days, and on the one page everybody
 * reads first they are noise.
 *
 * WHAT FALLS DUE LEADS WITH WHAT IS ALREADY LATE. The record answers overdue rows first (`deadlines`), so the late rows
 * become a block of their own, headed Overdue, drawn just before the rest: a late row is not one more line in a dated
 * list. A block with no late rows is drawn as the record answered it.
 */
export function homeBlocks(blocks: readonly LiveBlock[], now: number): LiveBlock[] {
  const today = dayOf(now);
  const out: LiveBlock[] = [];
  for (const b of blocks) {
    if (says(b)) {
      out.push(b);
      continue;
    }
    if (isFigures(b) && (b.metrics?.length ?? 0) === 0 && (b.measures?.length ?? 0) === 0) continue;
    if (isRuns(b) && b.entries.length === 0) continue;
    if (isDue(b) && b.entries.length === b.rows.length) {
      const late: number[] = [];
      const rest: number[] = [];
      b.entries.forEach((e, n) => {
        const day = e.fields.day;
        (typeof day === 'string' && day.slice(0, 10) < today ? late : rest).push(n);
      });
      if (late.length > 0) {
        out.push(pick(b, late, words.overdue));
        if (rest.length > 0) out.push(pick(b, rest));
        continue;
      }
    }
    out.push(b);
  }
  return out;
}

/** The counts the lead line is built from: the questions waiting, and the runs working with the agents' names. */
export type HomeCounts = { needing: number; working: number; agents: string[] };

/** The page's own counts, read off the blocks it answered, so the lead never asks the record a second time. */
export function countsOf(blocks: readonly LiveBlock[]): HomeCounts {
  const queue = blocks.find((b) => isQueue(b) && !says(b));
  const runs = blocks.find((b) => isRuns(b) && !says(b));
  const entries = runs?.entries ?? [];
  const agents = [...new Set(entries.map((e) => e.fields.agent).filter((a): a is string => typeof a === 'string' && a.trim() !== ''))];
  return { needing: queue ? Math.max(queue.total, queue.queue?.length ?? 0) : 0, working: entries.length, agents };
}

/** An agent as a person reads it: `claude-code` is Claude Code. */
const nameOf = (agent: string): string =>
  agent
    .split(/[-_\s]+/u)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

/**
 * THE LEAD LINE, "3 things need you. Claude is on 2.", or `null` when there is nothing to count. One agent is named,
 * because a name is what a reader recognises; several are counted, because a list of names is not a line.
 */
export function leadOf(c: HomeCounts): string | null {
  const parts: string[] = [];
  if (c.needing > 0) parts.push(words.needing(c.needing));
  if (c.working > 0) parts.push(c.agents.length === 1 ? words.onIt(nameOf(c.agents[0]!), c.working) : words.agentsOn(c.working));
  return parts.length ? parts.join(' ') : null;
}

/**
 * WHETHER HOME HAS NOTHING TO SAY BUT WHAT CHANGED: no figure pinned, no question waiting, nothing due and no agent
 * working. Such a record reads one calm sentence where the lead would be, and the feed under it. A page of the record's
 * own with any other kind of block is never quiet, because its author put that block there to be read.
 */
export function quiet(blocks: readonly LiveBlock[]): boolean {
  return blocks.every((b) => {
    if (says(b)) return false;
    if (isFigures(b)) return (b.metrics?.length ?? 0) === 0 && (b.measures?.length ?? 0) === 0;
    if (isQueue(b)) return countsOf([b]).needing === 0;
    if (isRuns(b) || isDue(b)) return b.entries.length === 0;
    return b.kind === 'feed';
  });
}
