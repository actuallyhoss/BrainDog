/**
 * `lanes`: a stretch of work as swimlanes, one lane a row, from the instant it started to the instant it ended.
 *
 * OVER A LIST it names three columns, the title, the start and the end (`columns: [title, started, ended]`), and the
 * start and the end are `instant` fields. A row with no end is still going, and its lane runs to now. So is a run the
 * record counts as working now (`sessionsWorking`, the one clock in `presence.ts`), whatever its end column says: over
 * the list of runs the end is when it was last heard from, and a run at work drew "11:30 to 14:57" and a bar that
 * stopped short of now, or past it, where it is still going. A fourth column
 * picks each lane's tone: its value is looked up in the block's `tones:`, such as `{ blocked: bad, working: info }`,
 * the words a `bar` and a `split` tone their parts with. It may instead write its rows out, each
 * `{ cells: [title, start, end, value] }`, the end left empty for one still going.
 *
 * `hours:` IS HOW FAR BACK FROM NOW IT LOOKS, `HOURS` when it says nothing and at most `HOURS_MOST`, a week.
 *
 * THE KERNEL READS THE WINDOW AND THE HOST DRAWS IT. The answer carries `window`, where it opens, where it closes and
 * now, and `lanes`, every row that overlaps it: one that started before it closed and had not ended before it opened.
 * A LANE KEEPS ITS OWN START AND END, never cut to the window, so a host says "since Monday" of a lane that began
 * before the window did and draws only the part inside.
 *
 * A LANE'S INSTANTS ARE THE RECORD'S ONE SHAPE, `2026-09-25T12:00:00.000Z` (`coerce.ts` `instant`). THE WINDOW'S ARE
 * WRITTEN IN THE RECORD'S ZONE, `2026-09-25T15:00:00.000+03:00`, as a calendar's days are the record's days: the
 * moment is the same either way, and the offset is how a host that knows no zone says the hours along the top as the
 * record's own. A record in UTC writes `Z`. Now is the as-of instant when the read has one: the clock every other
 * block on the page is read by.
 *
 * EVERY ROW, OR THE NEWEST `LANES_MOST` AND HOW MANY MORE. Lanes that drew the first rows read would show the newest
 * hours as idle when they were the busiest, so a block never draws the oldest and stops. Past `LANES_MOST` it draws the
 * `LANES_MOST` that started last, in start order, and says the rest as a count (`more`), which a host prints under the
 * drawing ("and 87 more"). It refused instead, and a busy day of agents' runs, 287 in a day where lanes draw 200, left
 * the agents home with a refusal where its day belonged. The cap stands, so one block never reads more than
 * `LANES_MOST` rows, and the block still takes no `limit:`.
 *
 * A LEAF: nothing of the kernel is imported at run time, for the reason `kinds/listed.ts` gives.
 */

import type { Predicate } from '@braindog/where';

import type { BlockResult } from '../pages.ts';
import type { KindModule } from './index.ts';
import { authoredCells, invalid, listedFault, readListed } from './listed.ts';

/** The most lanes a block draws. Past it nobody reads a lane, and the block says to narrow itself. */
export const LANES_MOST = 200;

/** How many hours back a block may look: a week. */
export const HOURS_MOST = 168;

/** The hours looked back over when the block does not say: a day. */
const HOURS = 24;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** The intents a lane is drawn in, the words a `bar` and a `split` tone a part with (`pages.ts` `tones`). */
const TONES = ['good', 'warn', 'bad', 'info'] as const;
export type LaneTone = (typeof TONES)[number];

/** One lane: what it is called, when it started, when it ended or `null` while it is still going. */
export type Lane = {
  title: string;
  start: string;
  end: string | null;
  /** The intent it is drawn in, when the block's `tones:` names the value its fourth column holds. Absent is neutral. */
  tone?: LaneTone;
  /** The row's own page, a path of this BrainDog. Absent on a lane written out, which is no row. */
  href?: string;
};

/** What the lanes are drawn inside: `hours:` back from now, up to now, each instant written in the record's zone. */
export type LanesWindow = { from: string; to: string; now: string };

/** A `lanes` block's answer: every block's, with its lanes and the window they were read in. */
export type LanesAnswer = Omit<BlockResult, 'window'> & {
  lanes: Lane[];
  window: LanesWindow;
  /** How many rows in the hours are not drawn: those that started before the newest `LANES_MOST`. Absent when none. */
  more?: number;
};

/** An instant as a row written out may say it: a day, a time and a zone, so it is one moment wherever it is read. */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/u;

/**
 * The instant a cell holds, in milliseconds, or `null` when it holds none this record can read.
 *
 * THE SHAPE IS NOT THE CHECK, as a calendar says of a day: `Date.parse` rolls 30 February into March, so the day that
 * comes back out, read at the offset it was written in, has to be the day that went in.
 */
const msOf = (v: unknown): number | null => {
  if (typeof v !== 'string' || !INSTANT.test(v)) return null;
  const ms = Date.parse(v);
  if (!Number.isFinite(ms)) return null;
  const zone = v.endsWith('Z') ? null : v.slice(-6);
  const offset = zone === null ? 0 : (zone.startsWith('-') ? -1 : 1) * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6)));
  return new Date(ms + offset * MINUTE).toISOString().slice(0, 10) === v.slice(0, 10) ? ms : null;
};

const iso = (ms: number): string => new Date(ms).toISOString();

/**
 * How many minutes ahead of UTC `tz` is at an instant, 0 for a zone this runtime cannot read: a module never throws,
 * and the instant is the same moment whichever offset it is written in.
 */
function offsetOf(tz: string | undefined, ms: number): number {
  if (tz === undefined || tz === 'UTC') return 0;
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(ms).find((p) => p.type === 'timeZoneName')?.value ?? '';
    const m = /([+-])(\d{2}):(\d{2})/u.exec(name);
    return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  } catch {
    return 0;
  }
}

/** An instant written in the record's zone, `2026-09-25T15:00:00.000+03:00`, or with `Z` where the zone is UTC's hour. */
function zoned(ms: number, tz: string | undefined): string {
  const offset = offsetOf(tz, ms);
  if (offset === 0) return iso(ms);
  const two = (n: number): string => String(Math.floor(n)).padStart(2, '0');
  const size = Math.abs(offset);
  return `${iso(ms + offset * MINUTE).slice(0, -1)}${offset < 0 ? '-' : '+'}${two(size / 60)}:${two(size % 60)}`;
}

/** Whether a cell holds nothing, which on an end means still going. */
const blank = (v: unknown): boolean => v === undefined || v === null || v === '';

const isTone = (v: unknown): v is LaneTone => typeof v === 'string' && (TONES as readonly string[]).includes(v);

/** The tone a value picks, or none. `Object.hasOwn`, so a lane whose value is `constructor` picks nothing. */
function toneOf(tones: unknown, value: unknown): { tone?: LaneTone } {
  if (blank(value) || tones === null || typeof tones !== 'object') return {};
  const key = String(value);
  const tone = Object.hasOwn(tones, key) ? (tones as Record<string, unknown>)[key] : undefined;
  return isTone(tone) ? { tone } : {};
}

/**
 * The answer as `BlockResult` names it. `pages.ts` types `window` as a calendar's, with `today`, and names no `lanes`
 * yet, so the kind's own type is `LanesAnswer` and this is the one place it is said to be a block's answer.
 */
const answered = (answer: LanesAnswer): BlockResult => answer as unknown as BlockResult;

export const lanes: KindModule = {
  /* `tones` IS SHARED with a `bar` and a `split`, which tone a part by the value it groups (`block-keys.ts` `KEY_KINDS`). */
  keys: ['hours', 'tones'],

  validate(block, ctx) {
    const hours = block.hours;
    if (hours !== undefined && !(typeof hours === 'number' && Number.isInteger(hours) && hours >= 1 && hours <= HOURS_MOST))
      return {
        code: 'OUT_OF_BOUNDS',
        fix: `hours: on lanes is how many hours back from now they show, from 1 to ${HOURS_MOST}, and ${JSON.stringify(hours)} is not.`,
        at: 'hours',
      };
    if (block.limit !== undefined)
      return invalid(`Lanes draw every row in their hours, the newest ${LANES_MOST} on a busy stretch, so they take no limit:. Narrow them with where:, or show fewer hours with hours:.`, 'limit');

    const tones = block.tones;
    if (tones !== undefined) {
      if (tones === null || typeof tones !== 'object' || Array.isArray(tones))
        return invalid('tones: on lanes says which colour a value is drawn in, such as { blocked: bad, working: info }.', 'tones', TONES);
      for (const [value, tone] of Object.entries(tones))
        if (!isTone(tone))
          return invalid(`tones: draws ${value} as ${JSON.stringify(tone)}, and a tone is one of good, warn, bad or info.`, 'tones', TONES);
    }

    const shape = listedFault(
      block,
      'lanes',
      { fewest: 3, most: 4, said: 'three or four columns, the title, when it started, when it ended and what picks its colour, such as columns: [title, started, ended, state]' },
      ctx.stage,
    );
    if (shape) return shape;
    /* TONES WITH NOTHING TO READ THEM BY WOULD DRAW EVERY LANE NEUTRAL, and the author would not hear why. */
    if (tones !== undefined && block.source !== undefined && Array.isArray(block.columns) && block.columns.length < 4)
      return invalid('tones: colours a lane by its fourth column, and these lanes name three. Add the column, or take tones: off.', 'tones');

    /* THE START IS CHECKED, AND THE END WHERE THERE IS ONE: a lane with no start has nowhere to be drawn. The count of
       cells is not, which a drawer degrades (`declare.ts`, `05 §2.1`). */
    for (const cells of authoredCells(block) ?? []) {
      const start = msOf(cells[1]);
      const end = blank(cells[2]) ? null : msOf(cells[2]);
      if (start === null || (!blank(cells[2]) && end === null))
        return invalid(
          'A lane written out is its title, when it started and when it ended, such as { cells: [Import, 2026-10-07T09:00:00Z, 2026-10-07T09:40:00Z] }, the end left empty while it is still going.',
          'authored',
        );
      if (end !== null && end < start) return invalid('A lane written out ends after it starts, and this one ends first.', 'authored');
    }
    return null;
  },

  read(deps, block, base) {
    const nowMs = deps.ctx.asOfMs ?? deps.ctx.nowMs;
    const hours = (block as { hours?: number }).hours ?? HOURS;
    const fromMs = nowMs - hours * HOUR;
    const tz = deps.ctx.tz ?? deps.tz;
    const window: LanesWindow = { from: zoned(fromMs, tz), to: zoned(nowMs, tz), now: zoned(nowMs, tz) };
    const { window: _calendars, ...rest } = base;
    const answer = (more: Partial<LanesAnswer>): BlockResult => answered({ ...rest, window, lanes: [], ...more });

    /* ROWS WRITTEN OUT ARE THE AUTHOR'S, and the ones outside the hours are left out as a list's are, in start order. */
    if (!block.source) {
      const drawn = (authoredCells(block as unknown as Record<string, unknown>) ?? [])
        .map((cells) => ({ cells, start: msOf(cells[1]), end: blank(cells[2]) ? null : msOf(cells[2]) }))
        .filter((r): r is typeof r & { start: number } => r.start !== null && r.start <= nowMs && (r.end === null || r.end >= fromMs))
        .sort((a, b) => a.start - b.start)
        .map((r): Lane => ({ title: String(r.cells[0] ?? ''), start: iso(r.start), end: r.end === null ? null : iso(r.end), ...toneOf(block.tones, r.cells[3]) }));
      return answer({ lanes: drawn });
    }

    const [title, start, end, toned] = (block.columns ?? []).map((c) => c.field);
    /* OVERLAPPING THE HOURS: started by now, and not ended before they open. A row with no start matches neither
       comparison, so it is left out, as a calendar leaves out a row with no day. */
    const within: Predicate = {
      all: [{ field: start ?? '', lte: iso(nowMs) }, { any: [{ field: end ?? '', gte: iso(fromMs) }, { field: end ?? '', empty: true }] }],
    };
    const when = { types: ['instant'], said: '' };
    /* `matched` COUNTS EVERY ROW IN THE HOURS, whatever was handed back, as a calendar's does (`calendar.ts`). */
    const read = (dir: 'asc' | 'desc') =>
      readListed(deps, block, 'lanes', {
        rules: [
          { types: ['text', 'enum'], said: 'the title, a text field' },
          { ...when, said: 'when it started, an instant field' },
          { ...when, said: 'when it ended, an instant field' },
          { types: ['enum', 'text', 'bool'], said: 'what picks its colour, a choice, a text or a yes or no field' },
        ],
        limit: LANES_MOST,
        within,
        order: [{ field: start ?? '', dir }],
      });
    const first = read('asc');
    if ('refusals' in first) return answer({ refusals: [...base.refusals, ...first.refusals] });
    /* A BUSY STRETCH IS READ AGAIN FROM ITS NEWEST END, `LANES_MOST` rows and no more, and drawn in start order. Only
       then: a stretch that fits is the one read it always was. */
    let listed = first;
    if (first.matched > LANES_MOST) {
      const newest = read('desc');
      if ('refusals' in newest) return answer({ refusals: [...base.refusals, ...newest.refusals] });
      listed = { ...newest, rows: [...newest.rows].reverse() };
    }
    const more = Math.max(0, listed.matched - listed.rows.length);

    /* A RUN AT WORK HAS NOT ENDED: its lane runs to now, as the record's one clock says who works. */
    const working = listed.register === 'session' ? new Set((deps.sessionsWorking?.() ?? []).map((w) => w.run.id)) : null;

    /* ONE LANE A ROW, IN THE ROWS' ORDER, so a host that wants more of a row than its lane reads `rows` at the same place. */
    const drawn = listed.rows.map((row): Lane => {
      const ended = working?.has(row.id) ? null : row.fields[end ?? ''];
      const value = toned === undefined ? undefined : row.fields[toned];
      return {
        title: String(row.fields[title ?? ''] ?? ''),
        start: String(row.fields[start ?? '']),
        end: blank(ended) ? null : String(ended),
        ...toneOf(block.tones, value),
        ...(row.seq === null ? {} : { href: `/r/${row.register}/${row.seq}` }),
      };
    });
    return answer({ lanes: drawn, rows: listed.rows, matched: listed.matched, ...(more > 0 ? { more } : {}) });
  },
};
