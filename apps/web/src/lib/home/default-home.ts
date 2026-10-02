/**
 * TODAY, DECLARED: the page every record opens on when it declares neither its use case's `home-<id>` nor a `home`
 * page, and what Home does to whichever of the three it draws (DIRECTION §35, "every page is declared").
 *
 * A PAGE BODY LIKE ANY OTHER. Today was a screen of its own (`Today.svelte`, kept at `/?classic`), and Overview a second
 * one over the house Home; both are this body now, drawn by the one reader (`PageView` in `home` mode), so a person or
 * an agent reshapes Today by installing a `home` page, and one look holds everywhere.
 *
 * TAILORED TO WHAT THE RECORD HOLDS. The body is built from what the shell already says the record has: the work blocks
 * only where it keeps tasks, the line a task is typed into only where the reader may add one, and cash only where the
 * Money page is. Everything else is a source the record answers across its lists (`governance.open`, `sessions.live`,
 * `deadlines`, `activity`), so nothing here is anybody's own record by name (§27).
 *
 * CALM. A block with nothing in it is not drawn, a row shown in one block is not shown again in the next, and the
 * page's one line is worked out from the blocks drawn (`sentenceOf`), so the line and the page cannot disagree. What
 * holds nothing is the page reader's rule for every home (`$lib/page/home.ts`, `bare` and `emptyHidden`, which PageBody
 * applies in mode=home); Home applies it here too, so what it counts and lays out is what the reader draws.
 *
 * A PLAIN MODULE, so the body and the reshaping below are read by a test without a component.
 */

import type { PageBlock } from '../record/schema.ts';
import type { LiveBlock } from '../record/page-live.ts';
import { bare, emptyHidden, says } from '../page/home.ts';
import { sentenceOf, type Sentence } from './today-tiles.ts';
import { words } from './words.ts';
/* THE LIST A TASK IS KEPT IN, named once for every work screen (`lib/work/list.ts`), never again here. */
import { TASKS } from '../work/list.ts';

/** The headings a use case's voice may say its own way, with the house line each falls back to. */
export type HomeVoice = {
  rightNow: string;
  needsYou: string;
  sinceAway: string;
  workingNow: string;
  comingUp: string;
  overdue: string;
  nothingWaiting: string;
  nothingDue: string;
};

const HOUSE: HomeVoice = {
  rightNow: words.rightNow,
  needsYou: words.needsYou,
  sinceAway: words.sinceAway,
  workingNow: words.workingNow,
  comingUp: words.comingUp,
  overdue: words.overdue,
  nothingWaiting: words.nothingWaiting,
  nothingDue: words.nothingDue,
};

/** How far ahead "Coming up" looks, in days. */
export const COMING_UP_DAYS = 14;

/** How many questions "What needs you" draws before its count becomes the door to Decide. Tiles are big, so three. */
export const NEEDS_YOU_LIMIT = 3;


/** Not finished: what every one of Today's work blocks reads. */
const LIVE = 'state is not done or dropped';

/** What the record holds that Today's body is built around, read off the shell. */
export type Holds = {
  /** The record keeps tasks, and the reader may read them. */
  tasks: boolean;
  /** The reader may add a task, so the page carries the line one is typed into. */
  adds: boolean;
  /** The record has the Money page, whose cash figure and its weeks Today shows. */
  money: boolean;
};

/** A page body as `previewPage` takes it: the main column and a rail four twelfths wide. */
export type HomeBody = { page: string; title: string; layout: { rail: number; sticky: boolean }; blocks: PageBlock[] };

/* THE RAIL, AND THE QUEUE'S TILE FORM, ARE KEYS THE KERNEL ADMITS (`declare.ts`) AND THE APP'S BLOCK TYPE DOES NOT NAME,
   so they are spread in rather than written as properties the type would refuse. */
const RAIL = { area: 'rail' } as const;
const TILES = { tiles: true } as const;

/**
 * TODAY'S BODY, in the words of the voice that speaks. In reading order: the page's line, the line a task is typed
 * into, the questions waiting on the reader as tiles, the work late or due today, the work handed back, the urgent
 * work, and what falls due in the next two weeks; beside them, the agents at work, cash, and what changed since the
 * reader last looked. The record lints it as it would any body before it draws it.
 */
export function todayHome(holds: Holds, voice: HomeVoice = HOUSE): HomeBody {
  const work: PageBlock[] = holds.tasks
    ? [
        {
          kind: 'todo',
          heading: words.lateOrToday,
          icon: 'calendar',
          source: `register.${TASKS}`,
          where: `${LIVE}, by before +1d`,
          columns: [{ field: 'what' }, { field: 'by' }],
          order: [{ field: 'by', dir: 'asc' }],
          limit: 8,
          empty: words.nothingLate,
        },
        /* HANDED BACK TO BE CHECKED: an agent finished its part and a person looks before it is done. */
        {
          kind: 'todo',
          heading: words.toCheck,
          icon: 'hourglass',
          source: `register.${TASKS}`,
          where: 'state is review',
          columns: [{ field: 'what' }, { field: 'agent' }],
          order: [{ field: 'by', dir: 'asc' }],
          limit: 6,
          empty: words.nothingToCheck,
        },
        /* URGENT WITH NO DAY YET COME. One that is also late is drawn once, above (`homeDrawn`). */
        {
          kind: 'todo',
          heading: words.urgent,
          icon: 'alert',
          source: `register.${TASKS}`,
          where: `${LIVE}, priority is urgent`,
          columns: [{ field: 'what' }, { field: 'by' }],
          order: [{ field: 'by', dir: 'asc' }],
          limit: 6,
          empty: words.nothingUrgent,
        },
      ]
    : [];
  return {
    page: 'today',
    title: 'Today',
    layout: { rail: 4, sticky: false },
    blocks: [
      /* THE PAGE'S LINE. Its words are the calm one; Home says the line worked out from the blocks over it (`homeDrawn`),
         and a record's own `home` page that writes its own line keeps it. */
      { kind: 'note', lead: true, body: words.nothingNow },
      /* THE LINE A TASK IS TYPED INTO, with the light syntax ("tomorrow !urgent #Kiln") the page reader reads. */
      ...(holds.tasks && holds.adds ? [{ kind: 'capture', heading: words.addTask, icon: 'plus', register: TASKS } as PageBlock] : []),
      /* ANSWERED WHERE THEY ARE SHOWN: the page's writes are on, so a queue draws `QueueAnswer`. */
      { kind: 'queue', heading: voice.needsYou, icon: 'ask', source: 'governance.open', limit: NEEDS_YOU_LIMIT, empty: voice.nothingWaiting, ...TILES },
      ...work,
      /* WHAT FALLS DUE ACROSS EVERY LIST, overdue first and then by day; a task already drawn above is not drawn again. */
      {
        kind: 'timeline',
        heading: voice.comingUp,
        icon: 'calendar',
        source: 'deadlines',
        horizon: COMING_UP_DAYS,
        columns: [{ field: 'day' }, { field: 'title' }, { field: 'amount', sign: { field: 'direction', minus: 'out' } }],
        limit: 8,
        empty: voice.nothingDue,
      },
      /* THE RUNS STILL WORKING, one line each with the agent's face; not drawn when none is. */
      {
        kind: 'table',
        heading: voice.workingNow,
        icon: 'session',
        source: 'sessions.live',
        where: 'state is active',
        columns: [
          { field: 'agent', label: 'Agent' },
          { field: 'doing', label: 'Doing' },
          { field: 'last_seen', label: 'Last seen' },
        ],
        limit: 6,
        empty: words.noneWorking,
        ...RAIL,
      },
      /* CASH NOW AND ITS TWELVE WEEKS, read from the Money page's own figure, where that page is. */
      ...(holds.money
        ? [{ kind: 'stat', heading: words.money, icon: 'wallet', cells: [{ metric: 'cash-now', label: words.cashNow, trend: '12w' }], ...RAIL } as PageBlock]
        : []),
      /* WHAT CHANGED SINCE THE READER'S MARK, which Home stamps when they leave, never when they open it. */
      { kind: 'feed', heading: voice.sinceAway, icon: 'activity', source: 'activity', since: 'seen', first: 8, empty: words.nothingNew, ...RAIL },
    ],
  };
}

/** Today's body in the house voice, on a record that holds everything it draws. */
export const DEFAULT_HOME = todayHome({ tasks: true, adds: true, money: true });

/* ── what Home does to the page it draws ───────────────────────────────── */

const isRuns = (b: LiveBlock): boolean => b.source === 'sessions.live';
const isDue = (b: LiveBlock): boolean => b.source === 'deadlines';
const isQueue = (b: LiveBlock): boolean => b.kind === 'queue';
const isTodo = (b: LiveBlock): boolean => b.kind === 'todo';
/** Whether the block's rows are its entries one for one, which every reshaping here needs to keep them aligned. */
const aligned = (b: LiveBlock): boolean => b.entries.length === b.rows.length;

/** The reader's day at `now`, as `YYYY-MM-DD`, which a deadline's `day` is compared with. */
const dayOf = (now: number): string => {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const DAY = /^\d{4}-\d{2}-\d{2}/u;

/** The list a block's rows are in, as a deadline names a row (`tasks#12`). */
const listOf = (b: LiveBlock): string | null => b.register ?? (b.source?.startsWith('register.') ? b.source.slice('register.'.length) : null);

/**
 * The rows of a block at the given places, with the rows drawn and the entries they came from kept aligned. `left`
 * is how many of the block's rows were taken out, so a block that held more than it drew still says how many more.
 */
function pick(b: LiveBlock, at: readonly number[], heading?: string, left = b.total - at.length): LiveBlock {
  const entries = at.map((n) => b.entries[n]!);
  return {
    ...b,
    ...(heading === undefined ? {} : { heading }),
    entries,
    matched: entries,
    rows: at.map((n) => b.rows[n]!),
    shown: at.length,
    total: Math.max(at.length, left),
  };
}

/** The places in a block whose entry passes `keep`. */
const where = (b: LiveBlock, keep: (fields: Record<string, unknown>, seq: number) => boolean): number[] =>
  b.entries.flatMap((e, n) => (keep(e.fields as Record<string, unknown>, e.seq) ? [n] : []));

/**
 * A feed over what changed since the reader's mark, cut to what is new: the lines after the mark, and not the mark's
 * own line or anything under it, which were read last time. A reader who has never marked anything sees it all.
 */
function newOnly(b: LiveBlock): LiveBlock {
  if (b.kind !== 'feed' || b.seen === undefined || !b.feed) return b;
  const seen = b.seen;
  const feed = seen === null ? b.feed : b.feed.filter((r) => r.at > seen);
  const mark = b.rows.findIndex((r) => r.key === 'seen');
  const rows = (mark === -1 ? b.rows : b.rows.slice(0, mark)).slice(0, feed.length);
  return { ...b, feed, rows, shown: feed.length, total: feed.length };
}

/** How many questions a queue holds: every one open, though it draws a few. */
const asked = (b: LiveBlock): number => Math.max(b.total, b.queue?.length ?? 0);

/**
 * Whether a block on Home has nothing to show, and so is not drawn. Home is calmer than any other home: a block that
 * holds nothing is not drawn even where its author wrote what empty means (`bare`), because the line at the top already
 * says the quiet half. And a list whose every row was drawn in a block above draws nothing, though more stand past its
 * limit.
 */
const hollow = (b: LiveBlock): boolean =>
  bare(b) || (!says(b) && (b.kind === 'todo' || b.kind === 'timeline' || b.kind === 'table') && b.entries.length === 0);

/** The first day one of a block's own columns holds for a row, `YYYY-MM-DD`, or `null`. */
function dayIn(b: LiveBlock, fields: Record<string, unknown>): string | null {
  for (const c of b.columns) {
    const v = fields[c.field];
    if (typeof v === 'string' && DAY.test(v)) return v.slice(0, 10);
  }
  return null;
}

/** Home's page as drawn, the line lifted out of it, and the sentence worked out from it. */
export type HomeDrawn = {
  blocks: LiveBlock[];
  /** The page's own line, when it declares one in plain words (`note lead`), lifted out to be the head's. */
  lead: string | null;
  /** The line worked out from what is drawn, or `null` on a page that holds nothing it can be counted from. */
  sentence: Sentence | null;
};

/**
 * THE BLOCKS AS HOME DRAWS THEM, whichever page they came from.
 *
 * THE PAGE'S LINE GOES TO THE HEAD. A `note lead` in plain words is the line under the title rather than a tile; one
 * that fills figures (`{{cash-now}}`) is the author's own tile and stays where it was written.
 *
 * A ROW IS DRAWN ONCE. A task late and urgent is in the first work block that holds it, and a deadline that is a task
 * already drawn is not drawn again in what falls due.
 *
 * WHAT FALLS DUE LEADS WITH WHAT IS ALREADY LATE: the late rows become a block of their own, headed Overdue, drawn
 * just before the rest.
 *
 * WHAT CHANGED IS ONLY WHAT IS NEW, and A BLOCK WITH NOTHING TO SHOW IS NOT DRAWN: an empty list on the page everybody
 * reads first is noise, and the line at the top already says the quiet half.
 *
 * NOTHING IS TAKEN OUT OF THE LIST, ONLY MARKED NOT DRAWN, as `lib/page/home.ts` hides a block: the reader keys every
 * write, held tick and id by a block's place in the list, so a block that empties between two reads (the last urgent
 * task ticked) must not move the blocks after it into its place. The lifted line stays at its place, and what falls
 * due is always two blocks, Overdue and the rest, either of them not drawn when it holds nothing.
 */
export function homeDrawn(blocks: readonly LiveBlock[], now: number, voice: HomeVoice = HOUSE): HomeDrawn {
  const today = dayOf(now);
  let lead: string | null = null;
  const drawn = new Set<string>();
  const shaped: LiveBlock[] = [];
  for (const b of blocks) {
    /* A BLOCK ITS `when:` LEFT OUT holds no row anybody saw, so it neither takes a row from the next nor counts. */
    if (says(b) || !b.drawn) {
      shaped.push(b);
      continue;
    }
    if (shaped.length === 0 && b.kind === 'note' && b.lead === true) {
      const said = typeof b.body === 'string' ? b.body.trim() : '';
      if (said !== '' && !said.includes('{{')) {
        lead = said;
        shaped.push({ ...b, drawn: false });
        continue;
      }
    }
    if (isTodo(b) && aligned(b)) {
      const list = listOf(b);
      const at = where(b, (_, seq) => list === null || !drawn.has(`${list}#${seq}`));
      for (const n of at) if (list !== null) drawn.add(`${list}#${b.entries[n]!.seq}`);
      shaped.push(at.length === b.entries.length ? b : pick(b, at, undefined, b.total - (b.entries.length - at.length)));
      continue;
    }
    if (isDue(b) && aligned(b)) {
      const fresh = where(b, (f) => !(typeof f.row === 'string' && drawn.has(f.row)));
      const late = fresh.filter((n) => {
        const day = b.entries[n]!.fields.day;
        return typeof day === 'string' && day.slice(0, 10) < today;
      });
      const rest = fresh.filter((n) => !late.includes(n));
      const gone = b.entries.length - fresh.length;
      /* THE RECORD ANSWERS WHAT IS LATE FIRST, so a block drawn full of late rows has more late rows past its limit, and
         Overdue says so; once a row that is not late is drawn, the rest past the limit are the later days'. */
      shaped.push(pick(b, late, voice.overdue, rest.length === 0 ? late.length + b.total - b.entries.length : late.length));
      shaped.push(gone === 0 && late.length === 0 ? b : pick(b, rest, undefined, rest.length === 0 ? 0 : b.total - gone - late.length));
      continue;
    }
    shaped.push(newOnly(b));
  }
  /* AND THEN THE READER'S OWN RULE, so a section over nothing goes with its blocks here as it does on the page. */
  return { blocks: emptyHidden(shaped.map((b) => (b.drawn && hollow(b) ? { ...b, drawn: false } : b))), lead, sentence: sentenceFrom(shaped, today) };
}

/**
 * THE PAGE'S LINE, worked out from the blocks drawn: what needs the reader is the questions waiting, every row of a
 * work block, and what falls due today or already fell due; what is late is the days those late rows were due; who is
 * working is the runs drawn. `null` when the page holds none of those blocks, so a page of figures says its own line.
 */
function sentenceFrom(blocks: readonly LiveBlock[], today: string): Sentence | null {
  let counts = false;
  let needing = 0;
  let agents = 0;
  const late: string[] = [];
  for (const b of blocks) {
    if (says(b) || !b.drawn) continue;
    if (isQueue(b)) {
      counts = true;
      needing += asked(b);
    } else if (isTodo(b)) {
      counts = true;
      needing += b.total;
      for (const e of b.entries) {
        const day = dayIn(b, e.fields as Record<string, unknown>);
        if (day !== null && day < today) late.push(day);
      }
    } else if (isDue(b)) {
      counts = true;
      for (const e of b.entries) {
        const day = typeof e.fields.day === 'string' ? e.fields.day.slice(0, 10) : '';
        if (day === '' || day > today) continue;
        needing += 1;
        if (day < today) late.push(day);
      }
    } else if (isRuns(b)) {
      counts = true;
      agents += b.entries.length;
    }
  }
  return counts ? sentenceOf(needing, late.sort(), agents, today) : null;
}

/**
 * WHETHER THE PAGE KEEPS ITS RAIL: only while both columns draw a block. A rail beside an empty main column, or a main
 * column beside an empty rail, is a page drawn at two thirds of its width for nothing, so it is drawn as one column.
 */
export function railed(blocks: readonly LiveBlock[]): boolean {
  const shown = blocks.filter((b) => b.drawn);
  const rail = (b: LiveBlock): boolean => (b as { area?: unknown }).area === 'rail';
  return shown.some(rail) && shown.some((b) => !rail(b));
}

/** Whether Home draws any block of the page at all. */
export const drawsAny = (blocks: readonly LiveBlock[]): boolean => blocks.some((b) => b.drawn);
