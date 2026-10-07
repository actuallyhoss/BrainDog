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

import { clausesOf, resolveDay } from '@braindog/where';

import type { PageBlock } from '../record/schema.ts';
import type { LiveBlock } from '../record/page-live.ts';
import { bare, emptyHidden, says } from '../page/home.ts';
import { lists } from '../copy/lists.ts';
import { lateSaid, sentenceOf, type Sentence } from './today-tiles.ts';
import { dayGroups, lateLines, type WithRows } from './home-rows.ts';
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

/** Today's lead note as `todayHome` declares it: words with no figure in them, which the rules never rewrite. */
export const TODAY_LEAD = words.nothingNow;

/** How far ahead "Coming up" looks, in days. */
export const COMING_UP_DAYS = 14;

/**
 * How many things "Coming up" draws: the next few, read on their own, so the late ones above never use up its rows.
 * Past it the count is the door to the rest, as on every other tile.
 */
export const COMING_UP_LIMIT = 5;

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
  /**
   * One of the tasks list as the record words it ("task", "job", a label the voice gives it), which the line a task is
   * typed into is named by. The house word when left out.
   */
  one?: string;
};

/**
 * THE LINE A TASK IS TYPED INTO, named by the list's own singular as every list's capture line is ("Add a job" on a
 * record that calls its tasks jobs), with the article the house's one helper chooses (`captureIn`).
 */
export const captureHeading = (one: string | undefined): string => lists.captureIn(one?.trim() || words.task);

/** A page body as `previewPage` takes it: the main column and a rail four twelfths wide. */
export type HomeBody = { page: string; title: string; layout: { rail: number; sticky: boolean }; blocks: PageBlock[] };

/* THE RAIL, AND THE QUEUE'S TILE FORM, ARE KEYS THE KERNEL ADMITS (`declare.ts`) AND THE APP'S BLOCK TYPE DOES NOT NAME,
   so they are spread in rather than written as properties the type would refuse. */
const RAIL = { area: 'rail' } as const;
const TILES = { tiles: true } as const;

/**
 * TODAY'S BODY, in the words of the voice that speaks. In reading order: the page's line, the line a task is typed
 * into, the questions waiting on the reader as tiles, what is late (the tasks late or due today, then the money that
 * fell due), the work handed back and the urgent work; beside them, the agents at work, cash, the next few things
 * that fall due, and what changed since the reader last looked. The record lints it as it would any body before it
 * draws it.
 *
 * LATE IS ONE TILE. The tasks and the money that are late are two reads, because a task is ticked where it is shown and
 * a bill is not, and Home draws them on one surface under one name (`homeDrawn`), the tasks first.
 */
export function todayHome(holds: Holds, voice: HomeVoice = HOUSE): HomeBody {
  /* WHAT FELL DUE AND WAS NOT DONE, across every list: what the late tasks above leave is the money. ONE LINE A THING,
     oldest first as the record answers it, "Legal review, February · −£9,190 · 2 months late": a date heading over
     each of six rows read as a ledger, and how late it is says more than the day it was due (`homeDrawn`). */
  const lateMoney: PageBlock = {
    kind: 'spec',
    heading: voice.overdue,
    icon: 'clock',
    source: 'deadlines',
    where: 'day before today',
    columns: [{ field: 'title' }, { field: 'amount', sign: { field: 'direction', minus: 'out' } }, { field: 'day' }],
    limit: 8,
    empty: words.nothingLate,
  };
  const work: PageBlock[] = holds.tasks
    ? [
        {
          kind: 'todo',
          heading: voice.overdue,
          icon: 'clock',
          source: `register.${TASKS}`,
          where: `${LIVE}, by before +1d`,
          columns: [{ field: 'what' }, { field: 'by' }],
          order: [{ field: 'by', dir: 'asc' }],
          limit: 8,
          empty: words.nothingLate,
        },
        lateMoney,
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
      { kind: 'note', lead: true, body: TODAY_LEAD },
      /* THE LINE A TASK IS TYPED INTO, with the light syntax ("tomorrow !urgent #Kiln") the page reader reads. */
      ...(holds.tasks && holds.adds ? [{ kind: 'capture', heading: captureHeading(holds.one), icon: 'plus', register: TASKS } as PageBlock] : []),
      /* ANSWERED WHERE THEY ARE SHOWN: the page's writes are on, so a queue draws `QueueAnswer`. */
      { kind: 'queue', heading: voice.needsYou, icon: 'ask', source: 'governance.open', limit: NEEDS_YOU_LIMIT, empty: voice.nothingWaiting, ...TILES },
      ...(holds.tasks ? work : [lateMoney]),
      /* THE RUNS STILL WORKING, one line each with the agent's face; not drawn when none is. */
      {
        kind: 'table',
        heading: voice.workingNow,
        icon: 'session',
        source: 'sessions.live',
        where: 'state is active, last_seen is today',
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
      /* THE NEXT FEW THINGS THAT FALL DUE ACROSS EVERY LIST, from today on, read on their own so what is late never
         takes their place; a task already drawn in the main column is not drawn again. IN THE RAIL, UNDER CASH: the
         main column is what to act on now and the rail what is coming, so Today's two columns end near each other
         rather than the main one running a tile longer. */
      {
        kind: 'timeline',
        heading: voice.comingUp,
        icon: 'calendar',
        source: 'deadlines',
        where: 'day after -1d',
        horizon: COMING_UP_DAYS,
        columns: [{ field: 'day' }, { field: 'title' }, { field: 'amount', sign: { field: 'direction', minus: 'out' } }],
        limit: COMING_UP_LIMIT,
        empty: voice.nothingDue,
        ...RAIL,
      },
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
  bare(b) || (!says(b) && (b.kind === 'todo' || b.kind === 'timeline' || b.kind === 'table' || b.kind === 'spec') && b.entries.length === 0);

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
  /**
   * THE LINE A TASK IS TYPED INTO, lifted out to sit in the head beside the page's name (DIRECTION §39: a whole tile spent
   * on one field), or `null` where the page has none. It stays in the list, not drawn, so every block keeps its place.
   */
  capture: LiveBlock | null;
  /** The line worked out from what is drawn, or `null` on a page that holds nothing it can be counted from. */
  sentence: Sentence | null;
  /**
   * The model's line for Home as the record sent it on the page's lead note (`said`, from Slash's `headline.home`) when
   * the block still carries it, unread: `homeLineOf` (`home-line.ts`) judges it. `undefined` when the block does not.
   */
  slash: unknown;
};

/**
 * THE MODEL'S LINE ON TODAY'S BODY, or `undefined`. The record sends Home's line on Today's lead note as `said`, only
 * when Slash wrote it today from the reading Today holds now (`homeLineFor` in the record), and the page reader draws it
 * as the note's words (`blockOf`). Today's lead is always `TODAY_LEAD`, so on Today's own body (`today`) a lead that
 * reads anything else is Slash's. A page the record declares writes its own lead, so there it is never taken for one.
 *
 * TODAY KEPT AS `home` (the arrange mode's first Done) IS SUCH A PAGE, so its line is Slash's only when the block still
 * carries the record's `said`: a lead that merely differs may be the author's own words, and is never signed as Slash's.
 */
export function slashLineOf(drawn: HomeDrawn, today: boolean): unknown {
  if (drawn.slash !== undefined) return drawn.slash;
  return today && drawn.lead !== null && drawn.lead !== TODAY_LEAD ? drawn.lead : undefined;
}

/**
 * THE BLOCKS AS HOME DRAWS THEM, whichever page they came from.
 *
 * THE PAGE'S LINE GOES TO THE HEAD. A `note lead` in plain words is the line under the title rather than a tile; one
 * that fills figures (`{{cash-now}}`) is the author's own tile and stays where it was written.
 *
 * A ROW IS DRAWN ONCE. A task late and urgent is in the first work block that holds it, and a deadline that is a task
 * already drawn is not drawn again in what falls due.
 *
 * WHAT FALLS DUE LEADS WITH WHAT IS ALREADY LATE: the late rows become a block of their own, headed Late, drawn
 * just before the rest. WHERE IT FOLLOWS THE LATE TASKS it is the same list, under their name and with the count of
 * both (`lateTile`, `home-rows.ts`), so what is late is said once, every thing in one shape, the tasks first. The
 * tasks' name says "or due today" while one of them is only due today, since that one is not late yet. What comes up
 * after it is drawn a day at a time.
 *
 * THE LINE A TASK IS TYPED INTO GOES TO THE HEAD, beside the page's name, as the page's line does under it.
 *
 * WHAT CHANGED IS ONLY WHAT IS NEW, and A BLOCK WITH NOTHING TO SHOW IS NOT DRAWN: an empty list on the page everybody
 * reads first is noise, and the line at the top already says the quiet half.
 *
 * NOTHING IS TAKEN OUT OF THE LIST, ONLY MARKED NOT DRAWN, as `lib/page/home.ts` hides a block: the reader keys every
 * write, held tick and id by a block's place in the list, so a block that empties between two reads (the last urgent
 * task ticked) must not move the blocks after it into its place. The lifted line stays at its place, and what falls
 * due is always two blocks, Late and the rest, either of them not drawn when it holds nothing.
 */
export function homeDrawn(blocks: readonly LiveBlock[], now: number, voice: HomeVoice = HOUSE, one?: string): HomeDrawn {
  const today = dayOf(now);
  let lead: string | null = null;
  let capture: LiveBlock | null = null;
  let slash: unknown;
  const drawn = new Set<string>();
  const shaped: LiveBlock[] = [];
  /* WHERE EACH LATE PART OF WHAT FALLS DUE LANDED, which may join the late tasks before it. */
  const lateAt: number[] = [];
  for (const b of blocks.map((x) => revoiced(x, voice, one))) {
    /* A BLOCK ITS `when:` LEFT OUT holds no row anybody saw, so it neither takes a row from the next nor counts. */
    if (says(b) || !b.drawn) {
      shaped.push(b);
      continue;
    }
    if (shaped.length === 0 && b.kind === 'note' && b.lead === true) {
      slash = (b as { said?: unknown }).said;
      const said = typeof b.body === 'string' ? b.body.trim() : '';
      if (said !== '' && !said.includes('{{')) {
        lead = said;
        shaped.push({ ...b, drawn: false });
        continue;
      }
    }
    if (b.kind === 'capture' && capture === null) {
      capture = b;
      shaped.push({ ...b, drawn: false });
      continue;
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
         Late says so; once a row that is not late is drawn, the rest past the limit are the later days'. */
      lateAt.push(shaped.length);
      shaped.push(howLate(pick(b, late, voice.overdue, rest.length === 0 ? late.length + b.total - b.entries.length : late.length), today));
      shaped.push(gone === 0 && late.length === 0 ? b : pick(b, rest, undefined, rest.length === 0 ? 0 : b.total - gone - late.length));
      continue;
    }
    shaped.push(newOnly(b));
  }
  const kept = shaped.map((b) => (b.drawn && hollow(b) ? { ...b, drawn: false } : b));
  /* WHAT CHANGED LEAVES OUT WHAT THE PAGE ALREADY SAYS, and goes if that was all of it. */
  const told = toldOf(kept);
  const fed = kept.map((b) => {
    if (!b.drawn || says(b) || b.kind !== 'feed') return b;
    const cut = worded(untold(b, told));
    return hollow(cut) ? { ...cut, drawn: false } : cut;
  });
  /* AND THEN THE READER'S OWN RULE, so a section over nothing goes with its blocks here as it does on the page. */
  const out = emptyHidden(fed);
  for (const at of lateAt) lateTile(out, at, today, voice);
  /* WHAT COMES UP, A DAY AT A TIME, each day a chip with what falls due on it beside it. */
  for (const [n, b] of out.entries())
    if (b.drawn && !says(b) && isDue(b) && b.kind === 'timeline' && aligned(b) && !(b as WithRows).homeRows)
      out[n] = { ...b, homeRows: { kind: 'days', days: dayGroups(b, today) } } as WithRows;
  return { blocks: out, lead, capture, sentence: sentenceFrom(shaped, today), slash };
}

/** Each house line Today's body writes that a voice may say its own way, by its key. */
const VOICED = Object.keys(HOUSE) as (keyof HomeVoice)[];

/** The voice's line for a house line Today's body writes, or the words as they are. */
function voicedLine(said: string | undefined, voice: HomeVoice): string | undefined {
  if (said === undefined) return said;
  const key = VOICED.find((k) => HOUSE[k] === said);
  return key === undefined ? said : voice[key];
}

/**
 * A HOME INSTALLED FROM TODAY'S BODY KEEPS SPEAKING IN THE VOICE. The arrange mode's first Done installs the body as it
 * was built that minute, so its headings and empty lines are fixed words: a heading still reading a house line ("What
 * needs you", "Late") is said in the voice that speaks now, and the line a task is typed into still reading the house
 * word is named by the list's own singular, so Settings › Words and a renamed list reach Today. Words that differ from
 * the house line are somebody's own (the author's, or a voice of the day it was kept), and are left as written.
 *
 * A NEW OBJECT ONLY WHERE A WORD CHANGES, so a page in the house voice is the blocks it was handed.
 */
function revoiced(b: LiveBlock, voice: HomeVoice, one: string | undefined): LiveBlock {
  const heading =
    b.kind === 'capture' && listOf(b) === TASKS && b.heading === captureHeading(undefined) ? captureHeading(one) : voicedLine(b.heading, voice);
  const empty = voicedLine(b.empty, voice);
  if (heading === b.heading && empty === b.empty) return b;
  return { ...b, ...(heading === undefined ? {} : { heading }), ...(empty === undefined ? {} : { empty }) };
}

/**
 * LATE ROWS SAY HOW LATE, on a block that draws a row a line: the day each was due becomes "2 months late". A timeline
 * keeps its days, because there the day is the heading the rows sit under.
 */
function howLate(b: LiveBlock, today: string): LiveBlock {
  const at = b.kind === 'timeline' ? -1 : b.columns.findIndex((c) => c.field === 'day');
  if (at === -1 || !aligned(b)) return b;
  const rows = b.rows.map((r, n) => {
    const day = b.entries[n]!.fields.day;
    if (typeof day !== 'string' || !DAY.test(day)) return r;
    const cells = [...r.cells];
    cells[at] = lateSaid(day.slice(0, 10), today);
    return { ...r, cells };
  });
  return { ...b, rows };
}

/** What a page already shows that a feed line could say again: the rows drawn in what falls due, and the questions drawn in What needs you, as a feed line names them (`suggestion:SG3`). */
type Told = { rows: ReadonlySet<string>; asks: ReadonlySet<string> };

function toldOf(blocks: readonly LiveBlock[]): Told {
  const rows = new Set<string>();
  const asks = new Set<string>();
  for (const b of blocks) {
    if (!b.drawn || says(b)) continue;
    if (isDue(b)) for (const e of b.entries) if (typeof e.fields.row === 'string') rows.add(e.fields.row);
    if (isQueue(b) && b.source === 'governance.open') for (const q of b.queue ?? []) asks.add(`suggestion:${q.id}`);
  }
  return { rows, asks };
}

/**
 * A FEED WITHOUT THE LINES THE PAGE ALREADY SAYS. A question a rule or an agent asked is drawn in What needs you while
 * it is open there, and once it is answered the answer is a line of its own; one past What needs you's few, or answered
 * already, keeps its line, since nothing else on the page says it. And a rule's note about a row that falls due
 * ("Halden licence, 3 of 4 is due today: £2,400.") is that row, drawn in Late or Coming up. Neither is said twice.
 * The feed's lines and its drawn rows are cut together, so the two stay one for one.
 */
function untold(b: LiveBlock, told: Told): LiveBlock {
  const feed = b.feed;
  if (!feed) return b;
  const lines = b.rows.filter((r) => r.key !== 'seen');
  if (lines.length !== feed.length) return b;
  const keep = feed.map((r) => {
    if (typeof r.target !== 'string') return true;
    if (r.kind === 'suggest') return !told.asks.has(r.target);
    return !(r.by === 'rule' && r.kind === 'note' && told.rows.has(r.target));
  });
  if (keep.every(Boolean)) return b;
  let n = 0;
  const rows = b.rows.filter((r) => r.key === 'seen' || keep[n++]);
  const left = feed.filter((_, i) => keep[i]);
  const gone = feed.length - left.length;
  return { ...b, feed: left, rows, shown: Math.max(0, b.shown - gone), total: Math.max(left.length, b.total - gone) };
}

/**
 * A FEED NEVER ENDS ON A BARE NUMBER. A burst the record could put no words to ("248" and nothing after it, under
 * Rules) is said as what it is, that many changes, so the count is in the words and the line reads as a line.
 */
function worded(b: LiveBlock): LiveBlock {
  const bare = (r: LiveBlock['rows'][number]): number | null => {
    const cells = (r as { cells?: readonly (string | null)[] }).cells ?? [];
    if (r.key === 'seen' || (cells[3] ?? '').trim() !== '') return null;
    const n = Number.parseInt(cells[2] ?? '', 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  if (!b.rows.some((r) => bare(r) !== null)) return b;
  const rows = b.rows.map((r) => {
    const n = bare(r);
    if (n === null) return r;
    const cells = [...r.cells];
    cells[2] = '';
    cells[3] = words.changes(n);
    return { ...r, cells };
  });
  return { ...b, rows };
}

/** Whether a drawn block is a list of tasks whose every row was due today or before. */
function lateTasks(b: LiveBlock | undefined, today: string): b is LiveBlock {
  if (!b?.drawn || !isTodo(b) || b.entries.length === 0) return false;
  return b.entries.every((e) => {
    const day = dayIn(b, e.fields as Record<string, unknown>);
    return day !== null && day <= today;
  });
}

/** How many rows a block holds past the ones it drew. */
const beyond = (b: LiveBlock): number => Math.max(0, b.total - b.rows.length);

/**
 * ONE LATE LIST, in place (`home-rows.ts`): the late part of what falls due at `at` and the late tasks just before it
 * are drawn as one list on the tasks' block, under their heading, with the count of both, and the money's own block is
 * not drawn. Their heading says "or due today" while one of the tasks is. Money late with no late tasks before it is the
 * list on its own block. Both stay at their places in the list, so every write still finds its block.
 *
 * THE LIST SAYS WHICH HALF RAN PAST ITS LIMIT (`more`), so "7 more" under it opens the bills when it was the bills.
 */
function lateTile(blocks: LiveBlock[], at: number, today: string, voice: HomeVoice): void {
  const money = blocks[at]!;
  const owes = money.drawn && aligned(money);
  const tasks = blocks[at - 1];
  if (!lateTasks(tasks, today) || !aligned(tasks)) {
    if (owes) blocks[at] = { ...money, homeRows: { kind: 'late', lines: lateLines([money], today), more: { tasks: 0, money: beyond(money) } } } as WithRows;
    return;
  }
  const heading = tasks.heading === voice.overdue && tasks.entries.some((e) => dayIn(tasks, e.fields as Record<string, unknown>) === today) ? words.lateOrToday : tasks.heading;
  const both = owes ? [tasks, money] : [tasks];
  blocks[at - 1] = {
    ...tasks,
    ...(heading === undefined ? {} : { heading }),
    /* EACH HALF'S OWN COUNT PAST WHAT IT DREW, which the one count of both below cannot say (`LateMore`). */
    homeRows: { kind: 'late', lines: lateLines(both, today), more: { tasks: beyond(tasks), money: owes ? beyond(money) : 0 } },
    shown: both.reduce((n, b) => n + b.rows.length, 0),
    total: both.reduce((n, b) => n + b.total, 0),
  } as WithRows;
  if (owes) blocks[at] = { ...money, drawn: false };
}

/** A clause that keeps a day column before a day: `by before +1d`, `day before today`. */
const BEFORE = /^\s*([a-z][a-z0-9_]*)\s+before\s+(\S+)\s*$/u;

/**
 * THE DAY A BLOCK'S OWN `where:` KEEPS EVERY ROW BEFORE, on a column it draws (or, over what falls due, its `day`),
 * read as the record reads it (`resolveDay` at noon of the reader's day), or `null` where it keeps none. `by before
 * +1d` is tomorrow: every row it holds, drawn or past its limit, fell due today or earlier. A clause with `or` in it
 * bounds nothing and is not read as one.
 */
function keptBefore(b: LiveBlock, today: string): string | null {
  if (typeof b.where !== 'string') return null;
  const noon = Date.parse(`${today}T12:00:00Z`);
  let first: string | null = null;
  for (const clause of clausesOf(b.where)) {
    const m = BEFORE.exec(clause);
    if (!m || !(b.columns.some((c) => c.field === m[1]) || (isDue(b) && m[1] === 'day'))) continue;
    const day = resolveDay(m[2]!, noon);
    if (day !== null && (first === null || day < first)) first = day;
  }
  return first;
}

/** The day a row of what falls due is due, `YYYY-MM-DD`, or `null`. */
const dueDay = (fields: Record<string, unknown>): string | null => (typeof fields.day === 'string' && DAY.test(fields.day) ? fields.day.slice(0, 10) : null);

/**
 * HOW MANY OF A BLOCK'S ROWS PAST ITS LIMIT ARE LATE TOO. The line counts the late work a block holds, not the rows it
 * draws: twenty late tasks drawn eight at a time are twenty late, never "eight late and twelve more". Only a block whose
 * every drawn row is late says it, and only one whose own `where:` keeps every row before tomorrow (Today's `by before
 * +1d`, Late money's `day before today`), so what it holds past the limit is late, or at the most due today. A block
 * with no such bound may hold next month's work past its limit: Urgent's is counted as needing the reader, not as late,
 * and what falls due in the next fortnight (a `deadlines` block reads 14 days ahead when it names no bound) as neither.
 */
function lateBeyond(b: LiveBlock, today: string): number {
  const beyond = Math.max(0, b.total - b.entries.length);
  if (beyond === 0 || b.entries.length === 0) return 0;
  const due = isDue(b);
  const allLate = b.entries.every((e) => {
    const fields = e.fields as Record<string, unknown>;
    const day = due ? dueDay(fields) : dayIn(b, fields);
    return day !== null && day < today;
  });
  if (!allLate) return 0;
  const before = keptBefore(b, today);
  return before !== null && before <= (resolveDay('+1d', Date.parse(`${today}T12:00:00Z`)) ?? before) ? beyond : 0;
}

/**
 * THE PAGE'S LINE, worked out from the blocks drawn: what needs the reader is the questions waiting, every row of a
 * work block, and what falls due today or already fell due; what is late is the late rows drawn and the late rows
 * their blocks hold past their limits (`lateBeyond`), the oldest day said; who is working is the runs drawn. `null`
 * when the page holds none of those blocks, so a page of figures says its own line.
 *
 * A LATE ROW IS COUNTED ONCE. Twenty late tasks drawn eight at a time leave twelve counted past Late's limit, and those
 * twelve are what a later block over the same list draws when it draws a late one (Urgent's oldest, a deadline that is
 * a task): such a row is one of the twelve, and is not counted again, late or as needing the reader.
 */
function sentenceFrom(blocks: readonly LiveBlock[], today: string): Sentence | null {
  let counts = false;
  let needing = 0;
  let agents = 0;
  let lateCount = 0;
  const late: string[] = [];
  /* THE LATE ROWS EACH LIST'S BLOCKS HOLD PAST THEIR LIMITS AND NO BLOCK HAS DRAWN YET, by list. */
  const owed = new Map<string, number>();
  const lateRow = (list: string | null, day: string): void => {
    late.push(day);
    const left = list === null ? 0 : (owed.get(list) ?? 0);
    if (left === 0) {
      lateCount += 1;
      return;
    }
    owed.set(list!, left - 1);
    needing -= 1;
  };
  for (const b of blocks) {
    if (says(b) || !b.drawn) continue;
    if (isQueue(b)) {
      counts = true;
      needing += asked(b);
    } else if (isTodo(b)) {
      counts = true;
      const list = listOf(b);
      /* THE BLOCK'S TOTAL already holds the rows past its limit, the late ones among them. */
      needing += b.total;
      for (const e of b.entries) {
        const day = dayIn(b, e.fields as Record<string, unknown>);
        if (day !== null && day < today) lateRow(list, day);
      }
      const beyond = lateBeyond(b, today);
      lateCount += beyond;
      if (list !== null && beyond > 0) owed.set(list, (owed.get(list) ?? 0) + beyond);
    } else if (isDue(b)) {
      counts = true;
      for (const e of b.entries) {
        const fields = e.fields as Record<string, unknown>;
        const day = dueDay(fields);
        if (day === null || day > today) continue;
        needing += 1;
        if (day < today) lateRow(typeof fields.row === 'string' ? fields.row.split('#')[0]! : null, day);
      }
      const beyond = lateBeyond(b, today);
      needing += beyond;
      lateCount += beyond;
    } else if (isRuns(b)) {
      counts = true;
      agents += b.entries.length;
    }
  }
  return counts ? sentenceOf(Math.max(0, needing), late.sort(), agents, today, lateCount) : null;
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
