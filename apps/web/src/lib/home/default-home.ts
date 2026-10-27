/**
 * TODAY, DECLARED: the page every record opens on when it declares neither its use case's `home-<id>` nor a `home`
 * page, and what Home does to whichever of the three it draws ("every page is declared").
 *
 * A PAGE BODY LIKE ANY OTHER. Today was a screen of its own (retired 24 October), and Overview a second
 * one over the house Home; both are this body now, drawn by the one reader (`PageView` in `home` mode), so a person or
 * an agent reshapes Today by installing a `home` page, and one look holds everywhere.
 *
 * TAILORED TO WHAT THE RECORD HOLDS. The body is built from what the shell already says the record has: the work blocks
 * only where it keeps tasks, the line a task is typed into only where the reader may add one, and cash only where the
 * Money page is. Everything else is a source the record answers across its lists (`governance.open`, `sessions.working`,
 * `deadlines`, `activity`), so nothing here is anybody's own record by name (§27).
 *
 * CALM. A block with nothing in it is not drawn, a row shown in one block is not shown again in the next, and the
 * page's one line is worked out from the blocks drawn (`sentenceOf`), so the line and the page cannot disagree. What
 * holds nothing is the record's rule for every page (`drawn: false` with `why`, the kernel's `drawn.ts`, read here
 * through `$lib/page/home.ts` `bare` and `emptyHidden`, which PageBody applies in mode=home); Home applies it here too,
 * so what it counts and lays out is what the reader draws.
 *
 * A PLAIN MODULE, so the body and the reshaping below are read by a test without a component.
 */

import { clausesOf, resolveDay } from '@braindog/where';
import { KPIS_KIND, MISSING, exponentOf, money, writeAmount } from 'braindog-render';

import type { QueueQuestion } from '@braindog/kernel';

import { homeCurrency } from '../record/api.ts';
import { REGISTERS } from '../record/held.ts';
import { namesAmount } from '../record/money.ts';

import type { FieldDecl, PageBlock, RegisterDecl } from '../record/schema.ts';
import type { LiveBlock } from '../record/page-live.ts';
import { bare, emptyHidden, says } from '../page/home.ts';
import { lists } from '../copy/lists.ts';
import { lateSaid, sentenceOf, type Sentence } from './today-tiles.ts';
import { dayGroups, lateLines, type WithRows } from './home-rows.ts';
import { words } from './words.ts';
/* THE LIST A TASK IS KEPT IN, named once for every work screen (`lib/work/list.ts`), never again here. */
import { TASKS } from '../work/list.ts';
import { daysBetween, dueSaid } from '../work/board.ts';
import { recordToday } from '../record/zone.ts';

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

/** Today's line while it opens on the card to tell it one real thing (use case 6, step 5). */
export const TELL_LINE = 'Tell it one real thing, and watch where it goes.';

/**
 * HOW MUCH A FIRST TODAY HOLDS: what one sentence becomes at most (`tell/read.ts` makes eight entries at most). The next
 * steps (`WantMore`) are a first Today's, so a record that holds more than this by hand is not offered them, and a
 * record kept for months reads its Today as it did.
 */
export const FIRST_TODAY_MOST = 8;

/** How far ahead "Coming up" looks, in days. */
export const COMING_UP_DAYS = 14;

/**
 * How many things "Coming up" draws: the next few, read on their own, so the late ones above never use up its rows.
 * Past it the count is the door to the rest, as on every other tile.
 */
export const COMING_UP_LIMIT = 5;

/** How many questions Needs you draws before its count becomes the door to Decide. Tiles are big, so three. */
export const NEEDS_YOU_LIMIT = 3;

/**
 * On a phone, two (the phone order of 27 October): the first answered where it stands with its suggested answer,
 * the second a row a tap opens, and "N more" the door to the rest, so the phone's Today holds what needs him, what is
 * late and urgent, who is at work, cash and what is next in about two screens.
 */
export const NEEDS_YOU_LIMIT_PHONE = 2;

/**
 * HOW MANY OPEN QUESTIONS TODAY ASKS THE RECORD FOR, so it can put the money first (`needsYouOrder`) before it shows the
 * few it shows: the record ranks by the cost of being wrong, and Today leads with what costs money.
 */
export const NEEDS_YOU_READ = 40;


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
  /**
   * WHAT THIS RECORD'S WEEK IS MADE OF, where it keeps a list of things that fall due for somebody (`weekOf`): Today then
   * opens on what is due this week and the money that came in. Absent where it keeps none, and Today is as it was.
   */
  week?: Week | undefined;
  /**
   * The record holds the page its vital signs are shown on (`SIGNS_PAGE`), so Today carries the line that says how
   * many of them read red and opens that page (`signsLine`). Left out or `false`, Today is as it was: a line that says
   * something needs a look and opens nothing is a dead end, and Settings says the count in plain words there.
   */
  health?: boolean;
  /**
   * The record reads what went quiet onto a page for this reader (the source `exceptions`: a list or a way in that
   * stopped, a feed that missed its time), so Today carries the tile that says which (`quietTile`). Left out or `false`,
   * Today is as it was: a record that does not read it, or a reader it is not shown to, would be drawn a refusal.
   */
  quiet?: boolean;
  /**
   * THE LIST OF PEOPLE THE RECORD KEEPS (`peopleOf`), which the desk's last row names a few of. Left out where it keeps
   * none, and the row is Arrivals and Coming up.
   */
  people?: People | undefined;
  /**
   * THE READER MAY READ THE RECORD'S RUNS, so Today declares who is working (`sessions.working`), which the desk draws
   * as Working now. Left out where the record would refuse the block.
   */
  runs?: boolean | undefined;
  /**
   * THE LIST THE RECORD KEEPS ITS PROJECTS IN (the one that declares `scopes`), by its id and the field its rows are
   * named by, which Today declares its projects' cards over. Left out where it keeps none.
   */
  projects?: { register: string; title: string; name: string } | undefined;
};

/** The fewest days a figure's line is drawn from (a chart has at least three points, else the tile shows the number). */
const LINE_LEAST = 3;

/**
 * THE LINE A TASK IS TYPED INTO, named by the list's own singular as every list's capture line is ("Add a job" on a
 * record that calls its tasks jobs), with the article the house's one helper chooses (`captureIn`).
 */
export const captureHeading = (one: string | undefined): string => lists.captureIn(one?.trim() || words.task);

/**
 * A page body as `previewPage` takes it. Today's own is one twelve-column board with no rail (`todayHome`); a body kept
 * from an older Today may still carry its rail, four twelfths wide.
 */
export type HomeBody = { page: string; title: string; layout?: { rail: number; sticky: boolean }; blocks: PageBlock[] };

/* THE QUEUE'S TILE FORM AND A BLOCK'S KEY ARE KEYS THE KERNEL ADMITS (`declare.ts`, `block-keys.ts`) AND THE APP'S BLOCK
   TYPE DOES NOT NAME, so they are spread in rather than written as properties the type would refuse. */
const TILES = { tiles: true } as const;
const keyed = (key: DeskKey) => ({ key }) as const;

/* ── the desk ──────────────────────────────────────────────────────────── */

/**
 * THE BLOCKS TODAY'S DESK SHOWS AT REST, by the key each is declared under (the 19 October desk, roadmap slice 1a): what
 * needs you, who is working and the cash in the first row, the few key numbers that lead under it (`numbersTile`), the
 * record's week where it keeps one, then the projects, and what is coming up and a few people beside Arrivals. WHO IS
 * WORKING AND THE PROJECTS ARE BLOCKS OF THE BODY SINCE 24 OCTOBER: Home draws each as the desk's own tile
 * (`deskOf`), where they were parts it drew around the page. Every other block of Today's
 * own body folds behind one More (`deskFolded`), and so does every tile Home draws around the page.
 */
export const DESK_KEYS = ['needs-you', 'working', 'cash', 'numbers', 'week-due', 'week-money', 'projects', 'coming-up', 'faces'] as const;
export type DeskKey = (typeof DESK_KEYS)[number];
const ON_DESK: ReadonlySet<string> = new Set(DESK_KEYS);

/** Whether a block is one the desk shows at rest, by its declared key. */
export const onDesk = (b: { key?: string | undefined }): boolean => typeof b.key === 'string' && ON_DESK.has(b.key);

/**
 * TODAY'S BLOCKS WITH THE REST FOLDED: while More is shut, every drawn block the desk does not show at rest is marked
 * not drawn, at its place, so every write still finds its block by index. `folded` is how many that is, which More
 * says. Open, the blocks are as they came. A NEW OBJECT ONLY WHERE ONE FOLDS.
 *
 * A LIST OF TASKS NEVER FOLDS (frame A, 23 October): the urgent tasks and the work handed back are the rows `x` ticks,
 * and with no More to open they would be on no screen a key could reach. They stand under the desk.
 */
export function deskFolded<B extends { key?: string | undefined; kind?: string; drawn: boolean }>(blocks: readonly B[], open: boolean): { blocks: B[]; folded: number } {
  let folded = 0;
  const out = blocks.map((b) => {
    /* A BLOCK THE DESK DRAWS AS ITS OWN TILE (`desk-part.ts`), what is late among them, is on the desk wherever it is. */
    if (!b.drawn || onDesk(b) || b.kind === 'todo' || (b as { desk?: unknown }).desk !== undefined) return b;
    folded += 1;
    return open ? b : { ...b, drawn: false };
  });
  return { blocks: out, folded };
}

/* ── a record's week ───────────────────────────────────────────────────── */

/** A list's declaration, as `weekOf` reads it. */
export type WeekDecl = Pick<RegisterDecl, 'id' | 'name' | 'one' | 'title' | 'fields' | 'state' | 'done'>;

/**
 * WHAT A RECORD'S WEEK IS MADE OF, where it keeps a list of things that fall due for somebody: a shop's orders, each
 * someone's, due on a day, done once it is (`weekOf`). Today then opens on what is due this week and the money that
 * came in (use case 6, step 6; planner-45, the onboarding target).
 *
 * `due` is that list, with its day, who each is for, what it is, the clause that leaves out the done ones, and the
 * amount an entry says was paid on it (`paid`, or `null` where the list keeps none), which only names who paid.
 *
 * WHAT CAME IN IS NOT READ HERE. It was a table over the ledger's `way is in`, which counted a transfer between her own
 * accounts and never saw a payment kept as a paid invoice, so a shop with no account read "Nothing came in" on the
 * week Nadia paid EGP 900. It is Money's own two figures now (`weekMoney`), the same on every record.
 */
export type Week = {
  due: { register: string; name: string; one: string; day: string; who: string; what: string; open: string | null; paid: string | null };
};

const live = (f: FieldDecl): boolean => f.retired !== true;
/** A field whose id or label says `re`. */
const saysOf = (f: FieldDecl, re: RegExp): boolean => re.test(f.id) || re.test(f.label ?? '');

/**
 * THE WEEK THIS RECORD KEEPS, read off its lists' declarations, or `undefined` where it keeps none. NEVER BY A LIST'S
 * NAME (§27): the list is the one whose entries are somebody's (a link to the list that plays `meets`, People), fall due
 * on a day (a `deadline` day), and are done once they are (`done`), and that does not owe a required amount (a bill
 * owes one, and Late already says a bill). The tasks are Today's own blocks and are never it.
 */
export function weekOf(decls: readonly WeekDecl[], people: string | null): Week | undefined {
  if (people === null) return undefined;
  const due = decls.find(
    (d) =>
      d.id !== TASKS &&
      d.id !== people &&
      (d.done?.length ?? 0) > 0 &&
      !d.fields.some((f) => live(f) && f.type === 'money' && f.required) &&
      d.fields.some((f) => live(f) && f.type === 'day' && f.deadline) &&
      d.fields.some((f) => live(f) && f.type === 'ref' && f.to === people),
  );
  if (!due) return undefined;
  const day = due.fields.find((f) => live(f) && f.type === 'day' && f.deadline)!;
  const who = due.fields.find((f) => live(f) && f.type === 'ref' && f.to === people)!;
  /* ONE CLAUSE FOR EACH DONE STATE, all of them holding: the grammar reads no "is not a or b". */
  const open = due.state && due.done?.length ? due.done.map((s) => `${due.state} is not ${s}`).join(', ') : null;
  /* ONLY A FIELD THAT SAYS IT WAS PAID: an order's total is what it comes to, never what came in. */
  const paid = due.fields.find((f) => live(f) && f.type === 'money' && saysOf(f, /paid/i));
  return { due: { register: due.id, name: due.name, one: due.one, day: day.id, who: who.id, what: due.title, open, paid: paid?.id ?? null } };
}

/**
 * THE PEOPLE THE RECORD KEEPS, as the desk names a few of them: the list that plays `meets`, its name for itself, the
 * field each is named by, and one fact beside the name (the first link to another list, such as who they are with).
 * NEVER BY A LIST'S NAME (§27), and `undefined` where the record keeps no such list or its declaration is not learnt.
 */
export type People = { register: string; name: string; icon: string; title: string; fact: string | null; where?: string | undefined };

/** The glyph a tile of people wears where the list declares none of its own. */
const FACES = 'users';

export function peopleOf(decls: readonly (WeekDecl & { icon?: string | undefined })[], people: string | null): People | undefined {
  if (people === null) return undefined;
  const d = decls.find((x) => x.id === people);
  if (!d || !d.title) return undefined;
  const fact = d.fields.find((f) => live(f) && f.type === 'ref' && f.to !== people && f.id !== d.title);
  const where = everyoneWhere(d);
  return { register: d.id, name: d.name, icon: d.icon || FACES, title: d.title, fact: fact?.id ?? null, ...(where ? { where } : {}) };
}

/**
 * THE PEOPLE EVERY SCREEN COUNTS (today-390-light-full.png): Today said "People 8" over every row of the list,
 * the record's own person and those folded into another among them, while People said "7 contacts". So the tile leaves
 * out who the list's `meets:` role marks as the reader (`self`) and as merged (`merged_into`, a link to the list
 * itself), as People's own count does. A list with neither keeps every row. Read off the declaration, never a name.
 */
function everyoneWhere(d: WeekDecl): string | undefined {
  const role = (d as { meets?: unknown }).meets;
  const field = (part: string, fits: (f: FieldDecl) => boolean): string | undefined => {
    const named = role !== null && typeof role === 'object' && !Array.isArray(role) ? (role as Record<string, unknown>)[part] : undefined;
    const id = typeof named === 'string' ? named : part;
    const f = d.fields.find((x) => x.id === id && live(x));
    return f && fits(f) ? f.id : undefined;
  };
  const merged = field('merged_into', (f) => f.type === 'ref' && (f as { to?: unknown }).to === d.id);
  const self = field('self', (f) => f.type === 'bool');
  const clauses = [...(merged ? [`${merged} is empty`] : []), ...(self ? [`${self} is not true`] : [])];
  return clauses.length > 0 ? clauses.join(', ') : undefined;
}

/** The people tile's empty line, which Home leaves undrawn as it does every empty block. */
const NOBODY_YET = 'Nobody here yet.';

/** How many people the desk names: the newest few, and the list's own page has the rest. */
export const PEOPLE_LIMIT = 4;

/** The desk's tile of people: the newest few, each with their face, opening their own row. */
function peopleTile(p: People): PageBlock {
  return {
    kind: 'cards',
    ...keyed('faces'),
    heading: p.name,
    icon: p.icon,
    span: 3,
    source: `register.${p.register}`,
    ...(p.where ? { where: p.where } : {}),
    columns: [{ field: p.title, as: 'who' }, ...(p.fact ? [{ field: p.fact, as: 'fact' as const }] : [])],
    order: [{ field: 'seq', dir: 'desc' }],
    limit: PEOPLE_LIMIT,
    empty: NOBODY_YET,
  } as PageBlock;
}

/**
 * What falls due from today through the seven days after and is not done: the days the shop's own figure counts
 * (`orders-due-7d`, shop 1.1.0), so the tile and the Orders page say one number. NEVER THE LATE ONES: those are Late's,
 * and the line's own clause (`weekLate`).
 */
const dueWhere = (w: Week): string => `${w.due.open ? `${w.due.open}, ` : ''}${w.due.day} after -1d, ${w.due.day} before +8d`;

/* ── the week's money ──────────────────────────────────────────────────── */

/**
 * WHAT CAME IN THIS WEEK, IN MONEY'S OWN TWO FIGURES (money-core 3.16.0), side by side and never added:
 * - `settled-in-7d`, what was owed to you and was marked paid in the seven days: the payment a shop with no account
 *   keeps as a paid invoice ("Nadia paid 900 on InstaPay"), and an invoice paid into an account and reconciled;
 * - `received-7d`, the ledger's money in over the same days, leaving out transfers between her own accounts and anything
 *   reconciled to an invoice, which the first already counts.
 * Each is one amount per currency unless a home currency and its rates say otherwise, so EGP 900 and USD 40 never read 940.
 */
export const WEEK_IN = ['settled-in-7d', 'received-7d'] as const;
/** What is still owed to you, beside what came in. */
export const OWED = 'owed-to-you';

/** The money tile's own words, Home's and no other screen's. */
export const MONEY_WEEK = 'Money this week';
/**
 * EACH FIGURE OF WHAT CAME IN BY ITS OWN NAME, never two cells both reading "In": what was marked paid, and what the
 * ledger says came in. A payment kept as a paid invoice and then met again in the bank's text is counted by one of the
 * two (`WEEK_IN`); two names say that the two cells are two different things, where "In EGP 900, In EGP 900" read as
 * the same money twice.
 */
export const WEEK_IN_SAID: Record<(typeof WEEK_IN)[number], string> = { 'settled-in-7d': 'Paid', 'received-7d': 'Came in' };
/** What is still owed to you, said as money still on its way and never as a debt held over somebody. */
export const OWED_TO_YOU = 'Still to come in';

/** Any figure at all: a `when:` that asks only that the record has the figure (`home-arrange.ts` `whileHeld`). */
const ANY = -Number.MAX_SAFE_INTEGER;

/**
 * THE WEEK'S MONEY TILE, drawn only where the record has Money's week figures: a record on an older Money, or with none,
 * reads no tile rather than three that cannot be read. A cell that reads nothing is left out by Home (`weekMoneyDrawn`),
 * so a week with nothing paid never says "Paid 0".
 */
export const weekMoney = (): PageBlock => ({
  kind: 'stat',
  heading: MONEY_WEEK,
  icon: 'wallet',
  cells: [...WEEK_IN.map((metric) => ({ metric, label: WEEK_IN_SAID[metric] })), { metric: OWED, label: OWED_TO_YOU }],
  when: { metric: WEEK_IN[0], gte: ANY },
});

/** The figure that counts the vital signs reading red now, by the name the kernel answers it under (`built-in-figures.ts`). */
export const SIGNS_RED = 'signs-red';
/** The page the vital signs are shown on, as the health sentence in Settings links to it (`signsAt`). */
export const SIGNS_PAGE = 'health';

/**
 * THE LINE TODAY SAYS WHILE A VITAL SIGN READS RED (a sign that fails says so in the app), in the
 * words the health sentence in Settings says it in. TWO NOTES ON THE ONE FIGURE, so one of them draws at most and the
 * count reads as a person says it, as the Health page's own line does. `signs-red` reads nothing while no sign has
 * anything to judge by and nought once none is red, and neither draws a note: a Today with nothing wrong is as it was.
 *
 * NEVER THE PAGE'S LINE (no `lead`), so the head keeps the sentence worked out from the work, and this stands under
 * what needs you. THE WORDS ARE THE LINK, to the page the signs are shown on, so Today carries the line only where the
 * record holds that page (`Holds.health`).
 */
export function signsLine(): PageBlock[] {
  const said = (words: string): string => `[${words}](/p/${SIGNS_PAGE}).`;
  return [
    { kind: 'note', when: { metric: SIGNS_RED, is: 1 }, body: said('One vital sign needs a look') },
    { kind: 'note', when: { metric: SIGNS_RED, gt: 1 }, body: said(`{{${SIGNS_RED}}} vital signs need a look`) },
  ];
}

/** The one source Today's tile of what went quiet reads, which belongs to no list. */
export const QUIET = 'exceptions';
/** The tile's name and what each of its three columns is called: the house's words, the same on every record. */
const QUIET_WORDS = { heading: 'Gone quiet', subject: 'What', since: 'Last seen', was: 'Before' } as const;

/**
 * WHAT WENT QUIET: the things this record was taking and has stopped taking, one line each, with what a person
 * calls it, the day it was last there and what it was before, in the record's own words ("Written to on 5 of 14 days").
 * Each was said only on its own page, so a feed that stopped a fortnight ago was found by opening the page it fed.
 *
 * NO `where:` AND NO `order:`. Every kind is shown, and the longest quiet first is the read's own order, which refuses
 * one written over it. NO `empty:` EITHER, so on a day nothing is quiet the record leaves the block out (`drawn.ts`) and
 * Today is as it was: "Nothing has gone quiet" every morning is a line nobody needs. IT NAMES NO LIST, so it is the same
 * tile on every record, and the names in it are the record's.
 */
export function quietTile(): PageBlock {
  return {
    kind: 'table',
    heading: QUIET_WORDS.heading,
    icon: 'history',
    source: QUIET,
    columns: [
      { field: 'subject', label: QUIET_WORDS.subject },
      { field: 'since', label: QUIET_WORDS.since },
      { field: 'was', label: QUIET_WORDS.was },
    ],
    limit: 6,
  };
}

/**
 * THE TILE ON A RECORD THAT DOES NOT READ IT IS NOT DRAWN, what went quiet and the key numbers alike. A host built
 * before the source answers the block as a refusal ("exceptions is not a source this record reads"), and so does a
 * record that will not show it to this reader;
 * neither is anything a person can act on from Today, so the block is marked not drawn and left at its place, as every
 * block a page hides is, and each write still finds its block by index. Every other block is handed back as it came.
 */
export function quietHeld<B extends { source?: string | undefined; refusals: readonly unknown[]; drawn: boolean }>(blocks: readonly B[]): B[] {
  return blocks.map((b) => ((b.source === QUIET || b.source === NUMBERS) && b.drawn && b.refusals.length > 0 ? { ...b, drawn: false } : b));
}

/** The source the few key numbers that lead Today are read from (the kernel's `sources/kpis.ts`), named as its kind is. */
export const NUMBERS: string = KPIS_KIND;

/**
 * THE FEW KEY NUMBERS THAT LEAD TODAY (2.5, decided 21 Oct): his pins first, then one a
 * project in play, off target before stale, stale before late, late before a big change, money before the rest, four at
 * most. THE RECORD RANKS THEM (`kpisForToday` in the kernel's `kpi-rank.ts`), and nothing here orders them again.
 *
 * DECLARED ON EVERY RECORD AND DRAWN ONLY WHERE A NUMBER IS: a record that keeps no key numbers answers none, and Home
 * does not draw a tile that holds nothing (`hollow`), so there is no empty box and no line asking for one. A whole row
 * of the board, under the first one and over the record's week.
 */
export const numbersTile = (): PageBlock =>
  ({ kind: KPIS_KIND, ...keyed('numbers'), span: 12, heading: words.numbers, icon: 'gauge', source: NUMBERS, for: 'today', empty: words.noNumbers }) as PageBlock;

/** The two blocks a record's week opens Today on: its own words, naming its list ("Orders due this week"). */
function weekBlocks(w: Week): PageBlock[] {
  const due: PageBlock = {
    kind: 'table',
    ...keyed('week-due'),
    span: 8,
    heading: `${w.due.name} due this week`,
    icon: 'calendar',
    source: `register.${w.due.register}`,
    where: dueWhere(w),
    columns: [{ field: w.due.who }, { field: w.due.what }, { field: w.due.day }],
    order: [{ field: w.due.day, dir: 'asc' }],
    limit: 8,
    empty: `No ${w.due.one.toLowerCase()} is due this week.`,
  } as PageBlock;
  return [due, { ...weekMoney(), ...keyed('week-money'), span: 4 } as PageBlock];
}

/**
 * TODAY'S BODY, in the words of the voice that speaks. In declared order: the page's line, the line a task is typed
 * into, the questions waiting on the reader as tiles, one line while a vital sign reads red (`signsLine`), what has
 * gone quiet (`quietTile`), what is late (the tasks late or due today, then the money that fell due), the work handed
 * back and the urgent work, the agents at work, cash, the next few things that fall due, a few people, and what changed
 * since the reader last looked. The record lints it as it would any body before it draws it.
 *
 * ONE BOARD OF TWELVE COLUMNS, NO RAIL. Home lays the desk out of it (`DESK_KEYS`, each keyed and given its share of a
 * row): what needs you, who is working and cash in the first row, the projects, then Arrivals, what is coming up and
 * people. The order a row is DECLARED in still matters, since a row is drawn once and the first block that holds it
 * keeps it (`homeDrawn`), so the late work stays before what comes up; Home puts each where the desk wants it.
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
    blocks: [
      /* THE PAGE'S LINE. Its words are the calm one; Home says the line worked out from the blocks over it (`homeDrawn`),
         and a record's own `home` page that writes its own line keeps it. */
      { kind: 'note', lead: true, body: TODAY_LEAD },
      /* THE LINE A TASK IS TYPED INTO, with the light syntax ("tomorrow !urgent #Kiln") the page reader reads. */
      ...(holds.tasks && holds.adds ? [{ kind: 'capture', heading: captureHeading(holds.one), icon: 'plus', register: TASKS } as PageBlock] : []),
      /* THE RECORD'S WEEK FIRST, where it keeps one: what is due this week and what came in. Late, what needs you and
         who is working keep their order after them. */
      ...(holds.week ? weekBlocks(holds.week) : []),
      /* ANSWERED WHERE THEY ARE SHOWN: the page's writes are on, so a queue draws `QueueAnswer`. */
      /* ASKED FOR WHOLE (`NEEDS_YOU_READ`), so Home can lead with the money (`needsYouOrder`); the tile still shows
         `NEEDS_YOU_LIMIT` and the rest are its count. */
      { kind: 'queue', ...keyed('needs-you'), span: 5, heading: voice.needsYou, icon: 'inbox', source: 'governance.open', limit: NEEDS_YOU_READ, empty: voice.nothingWaiting, ...TILES },
      /* WHAT IS WRONG WITH THE RECORD ITSELF, said only while a vital sign reads red: under what needs you, since it
         needs a look too, and over the work, which it may be the reason for. */
      ...(holds.health ? signsLine() : []),
      /* WHAT STOPPED ARRIVING, where the record reads it for this reader: under the vital signs, which say the record is
         unwell, and over the work, which a feed that stopped may be the reason for. Not drawn when nothing is quiet. */
      ...(holds.quiet ? [quietTile()] : []),
      ...(holds.tasks ? work : [lateMoney]),
      /* WHO IS WORKING, the record's runs at work by its one clock (`sessions.working`), only while one is (`runs-working`).
         The desk draws it as Working now, each run with how long it has been at it (`WorkingNow.svelte`). */
      ...(holds.runs ? [workingTile(voice)] : []),
      /* CASH AHEAD (today F5): the cash now, how long it lasts, and what comes in and goes out in the next thirty days,
         read from the Money page's own figures, where that page is. ITS LINE IS THE TWELVE WEEKS AHEAD, the walk the
         runway counts (`ahead: cash-now`, the fullest walk from the cash now) and Money's Cash ahead draws over the same twelve weeks, with today, the
         lowest point and both ends marked; it was the twelve weeks behind, under a tile called Cash ahead, and ended in
         a drop Money's chart did not have. */
      ...(holds.money
        ? [
            {
              kind: 'stat',
              ...keyed('cash'),
              span: 3,
              heading: words.money,
              icon: 'wallet',
              cells: [
                { metric: 'cash-now', label: words.cashNow, trend: '12w', ahead: 'cash-now', note: words.lastsTo },
                { metric: 'arriving-30d', label: words.comingIn },
                { metric: 'leaving-30d', label: words.goingOut },
              ],
            } as PageBlock,
          ]
        : []),
      /* THE FEW KEY NUMBERS THAT LEAD, under cash: drawn only where the record keeps one. */
      numbersTile(),
      /* THE PROJECTS IN PLAY, as their cards, where the record keeps a list of them. The desk draws them as its row of
         cards with the lanes over them (`ProjectCards.svelte`). */
      ...(holds.projects ? [projectsTile(holds.projects)] : []),
      /* THE NEXT FEW THINGS THAT FALL DUE ACROSS EVERY LIST, from today on, read on their own so what is late never
         takes their place; a task already drawn in a block above is not drawn again. */
      {
        kind: 'timeline',
        ...keyed('coming-up'),
        span: 3,
        heading: voice.comingUp,
        icon: 'calendar',
        source: 'deadlines',
        where: 'day after -1d',
        horizon: COMING_UP_DAYS,
        columns: [{ field: 'day' }, { field: 'title' }, { field: 'amount', sign: { field: 'direction', minus: 'out' } }],
        limit: COMING_UP_LIMIT,
        empty: voice.nothingDue,
      },
      /* A FEW OF THE PEOPLE THE RECORD KEEPS, beside what is coming up, where it keeps a list of them. */
      ...(holds.people ? [peopleTile(holds.people)] : []),
      /* WHAT CHANGED SINCE THE READER'S MARK, which Home stamps when they leave, never when they open it. Folded behind
         More: the desk's Arrivals says what came in. */
      { kind: 'feed', heading: voice.sinceAway, icon: 'activity', source: 'activity', since: 'seen', first: 8, empty: words.nothingNew },
    ],
  };
}

/**
 * WHO IS WORKING, as Today declares it: the record's runs working now, with the agent, what it says it is doing,
 * its project and when it was last heard from, six at most, and only while one is (the desk leaves an empty one out, `desk-part.ts`). A table, so a page kept from Today
 * draws it as any page draws runs; Today's desk draws it as Working now.
 */
export function workingTile(voice: HomeVoice = HOUSE): PageBlock {
  return {
    kind: 'table',
    ...keyed('working'),
    span: 4,
    heading: voice.workingNow,
    icon: 'session',
    source: 'sessions.working',
    columns: [{ field: 'agent' }, { field: 'doing' }, { field: 'project' }, { field: 'last_seen' }],
    limit: 6,
  } as PageBlock;
}

/** The record's figure of when a project was last worked on, its tasks and runs together (`built-in-figures.ts`). */
export const WORKED_FIGURE = 'project-worked';

/** How many of a record's projects Today reads for its cards: every one a record keeps, as the old desk read them. */
export const PROJECTS_READ = 500;

/**
 * THE PROJECTS, as Today declares them: cards over the list that keeps them, by name. Which are in play and in
 * what order is the desk's to say from each row's lane (`project-cards.ts` `cardsOf`), as it said it when it read the
 * list itself, so the block reads the whole list and names no lane.
 */
export function projectsTile(p: { register: string; title: string; name: string }): PageBlock {
  return {
    kind: 'cards',
    ...keyed('projects'),
    span: 12,
    heading: p.name,
    icon: 'grid',
    source: `register.${p.register}`,
    /* AND WHEN EACH WAS LAST WORKED ON, BY THE RECORD'S ONE FIGURE: its tasks and its runs
       read together (`project-worked`), the figure Projects' cards read too, so both say one time. */
    columns: [{ field: p.title, as: 'title' }, { metric: `${WORKED_FIGURE}:{{${p.title}}}`, as: 'when', label: 'Worked on' }],
    limit: PROJECTS_READ,
  } as PageBlock;
}

/** Today's body in the house voice, on a record that holds everything it draws. */
export const DEFAULT_HOME = todayHome({ tasks: true, adds: true, money: true });

/* ── what Home does to the page it draws ───────────────────────────────── */

const isRuns = (b: LiveBlock): boolean => b.source === 'sessions.live' || b.source === 'sessions.working';
/** How many days of a line hold a number. */
const known = (line: readonly (number | null)[] | undefined): number => (line ?? []).filter((v) => v !== null).length;

/**
 * A FIGURE'S LINE AS HOME DRAWS IT: from the first day the record kept, and only when it is a line.
 *
 * THE RECORD ANSWERS THE WHOLE WINDOW ASKED FOR, a day with no point a gap (`trend: 12w` is eighty-four days). A
 * figure kept for a week is then seven points in the last twelfth of the tile, a tick at its far edge under a number,
 * and one kept for a day or two is a dot. So the days before the first one kept are left off, and the line runs the
 * tile's width; a gap after that stays a gap, since a night nobody kept is not a nought. Fewer than three days kept is
 * no line at all, and the tile shows the number.
 *
 * A NEW OBJECT ONLY WHERE A LINE CHANGES, so a tile whose line is whole is the block it was handed.
 */
function linesKept(b: LiveBlock): LiveBlock {
  if (b.kind !== 'stat' || !b.metrics?.some((m) => m.trend !== undefined)) return b;
  let changed = false;
  const metrics = b.metrics.map((m) => {
    if (m.trend === undefined) return m;
    const from = m.trend.findIndex((v) => v !== null);
    if (from < 0 || known(m.trend) < LINE_LEAST) {
      changed = true;
      const { trend: _short, ...rest } = m;
      return rest;
    }
    if (from === 0) return m;
    changed = true;
    return { ...m, trend: m.trend.slice(from) };
  });
  return changed ? { ...b, metrics } : b;
}

const isDue = (b: LiveBlock): boolean => b.source === 'deadlines';
const isQueue = (b: LiveBlock): boolean => b.kind === 'queue';
const isTodo = (b: LiveBlock): boolean => b.kind === 'todo';
/** Whether the block's rows are its entries one for one, which every reshaping here needs to keep them aligned. */
const aligned = (b: LiveBlock): boolean => b.entries.length === b.rows.length;

/** The record's day at `now`, as `YYYY-MM-DD` (`zone.ts`), which a deadline's `day` is compared with. */
const dayOf = (now: number): string => recordToday(now);

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
  bare(b) ||
  (!says(b) && (b.kind === 'todo' || b.kind === 'timeline' || b.kind === 'table' || b.kind === 'spec') && b.entries.length === 0) ||
  /* KEY NUMBERS ARE THE BLOCK'S `kpis` AND NOT ITS ROWS, so a record that keeps none draws no tile. */
  (b.kind === KPIS_KIND && b.refusals.length === 0 && !hasKpis(b));

/** Whether a `kpis` block answered any key number. */
const hasKpis = (b: LiveBlock): boolean => {
  const kpis = (b as { kpis?: unknown }).kpis;
  return Array.isArray(kpis) && kpis.length > 0;
};

/** The first day one of a block's own columns holds for a row, `YYYY-MM-DD`, or `null`. */
function dayIn(b: LiveBlock, fields: Record<string, unknown>): string | null {
  for (const c of b.columns) {
    const v = fields[c.field];
    if (typeof v === 'string' && DAY.test(v)) return v.slice(0, 10);
  }
  return null;
}

/** A question about money, as Needs you groups it (`routes/decide/views.ts` `aboutMoney`): it writes an amount, or names one. */
export const aboutMoney = (q: QueueQuestion): boolean => (Array.isArray(q.money) && q.money.length > 0) || namesAmount(q.question);

/**
 * TODAY'S NEEDS YOU IN NEEDS YOU'S OWN ORDER (today F3): the questions about money first, then the quick ones, the oldest
 * first inside each, so the two invoices to chase lead the first screen as they lead Needs you's Money column.
 */
export function needsYouOrder<Q extends QueueQuestion>(queue: readonly Q[]): Q[] {
  const rank = (q: Q): number => (aboutMoney(q) ? 0 : 1);
  return [...queue].sort((a, b) => rank(a) - rank(b) || String(a.at ?? '').localeCompare(String(b.at ?? '')));
}

/** Home's page as drawn, the line lifted out of it, and the sentence worked out from it. */
export type HomeDrawn = {
  blocks: LiveBlock[];
  /** The page's own line, when it declares one in plain words (`note lead`), lifted out to be the head's. */
  lead: string | null;
  /**
   * THE LINE A TASK IS TYPED INTO, lifted out to sit in the head beside the page's name (a whole tile spent
   * on one field), or `null` where the page has none. It stays in the list, not drawn, so every block keeps its place.
   */
  capture: LiveBlock | null;
  /** The line worked out from what is drawn, or `null` on a page that holds nothing it can be counted from. */
  sentence: Sentence | null;
  /** The bills past their day, how many and their money as a display figure says it, for the foot of Needs you (today F3). */
  lateBills: { count: number; said: string } | null;
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
 * WHERE THE RECORD KEEPS A WEEK (`week`, handed in only for Today's own body), what is due this week is drawn once, and
 * the line says what is due and what came in (`weekSentence`), counted from those two blocks.
 *
 * A FIGURE'S LINE STARTS AT THE FIRST DAY THE RECORD KEPT, and is a line only from three days up (`linesKept`).
 *
 * WHAT CHANGED IS ONLY WHAT IS NEW, and A BLOCK WITH NOTHING TO SHOW IS NOT DRAWN: an empty list on the page everybody
 * reads first is noise, and the line at the top already says the quiet half.
 *
 * NOTHING IS TAKEN OUT OF THE LIST, ONLY MARKED NOT DRAWN, as `lib/page/home.ts` hides a block: the reader keys every
 * write, held tick and id by a block's place in the list, so a block that empties between two reads (the last urgent
 * task ticked) must not move the blocks after it into its place. The lifted line stays at its place, and what falls
 * due is always two blocks, Late and the rest, either of them not drawn when it holds nothing.
 */
/**
 * WHAT WAITS AND WHO IS WORKING, AS `boot` SAYS IT (`waits.svelte.ts`), which Home's line and its working tile read in
 * place of what the page happened to draw: the line counts every open question and every agent at
 * work by the record's one count, and the tile lists only the runs `boot` says are working. Absent from an older host,
 * and Home then counts what it drew, as before.
 */
export type HomeWaits = {
  questions: number;
  inbox: number | null;
  working: number;
  seqs: readonly (number | null)[];
  /** What a run answered Needs you on, of what he told it: counted with the questions, drawn in the tile's foot. */
  told?: number;
};

export function homeDrawn(
  blocks: readonly LiveBlock[],
  now: number,
  voice: HomeVoice = HOUSE,
  one?: string,
  waits?: HomeWaits | null,
  week?: Week,
): HomeDrawn {
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
    /* WHAT IS DUE THIS WEEK IS DRAWN ONCE: its entries are not drawn again in Late or in what comes up. */
    if (week && isWeekDue(b, week) && aligned(b)) {
      for (const e of b.entries) drawn.add(`${week.due.register}#${e.seq}`);
      shaped.push(b);
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
      /* THE LATE PART OF A BLOCK THE DESK SHOWS IS NOT THAT BLOCK: it takes a key of its own, so the desk keeps the
         block's key on what comes up and folds what is late with the rest. */
      const lateKey = onDesk(b) ? { key: `${b.key}-late` } : {};
      shaped.push({ ...howLate(pick(b, late, voice.overdue, rest.length === 0 ? late.length + b.total - b.entries.length : late.length), today), ...lateKey });
      shaped.push(gone === 0 && late.length === 0 ? b : pick(b, rest, undefined, rest.length === 0 ? 0 : b.total - gone - late.length));
      continue;
    }
    /* NEEDS YOU LEADS WITH THE MONEY (today F3), oldest first in each group, and its count is the badge's. */
    if (isQueue(b) && b.key === 'needs-you' && b.queue) {
      const total = waits ? waits.questions : b.total;
      /* THE HEAD SAYS THE ONE COUNT, an agent's question with the rest (`counted`); "N more" stays the questions'. */
      const told = waits?.told ?? 0;
      shaped.push({ ...b, queue: needsYouOrder(b.queue), total, ...(told > 0 ? { counted: total + told } : {}) });
      continue;
    }
    /* WHO IS WORKING IS `boot`'S: a run the page drew that has gone quiet is not drawn as working. */
    if (waits && isRuns(b) && aligned(b)) {
      const at = where(b, (_, seq) => waits.seqs.includes(seq));
      shaped.push(at.length === b.entries.length ? b : pick(b, at, undefined, at.length));
      continue;
    }
    /* THE WEEK'S MONEY SAYS ONLY WHAT IT HOLDS, on Today's own body and on a home kept from it alike. */
    if (isWeekMoney(b)) {
      shaped.push(weekMoneyDrawn(b));
      continue;
    }
    shaped.push(linesKept(newOnly(b)));
  }
  const kept = shaped.map((b) => (b.drawn && hollow(b) ? { ...b, drawn: false } : b));
  /* WHAT CHANGED LEAVES OUT WHAT THE PAGE ALREADY SAYS, and goes if that was all of it. */
  const told = toldOf(kept);
  const fed = kept.map((b) => {
    if (!b.drawn || says(b) || b.kind !== 'feed') return b;
    const cut = worded(untold(b, told));
    return hollow(cut) ? { ...cut, drawn: false } : cut;
  });
  /* AND THEN THE RECORD'S RULE, read as the record marked it and judged again only where it drew a block, so a section
     over nothing goes with its blocks here as it does on the page. */
  const out = emptyHidden(fed);
  for (const at of lateAt) lateTile(out, at, today, voice);
  /* WHAT COMES UP, A DAY AT A TIME, each day a chip with what falls due on it beside it. */
  for (const [n, b] of out.entries())
    if (b.drawn && !says(b) && isDue(b) && b.kind === 'timeline' && aligned(b) && !(b as WithRows).homeRows)
      out[n] = { ...b, homeRows: { kind: 'days', days: dayGroups(b, today) } } as WithRows;
  /* THE WEEK'S LATE ONES ARE THE WEEK'S TO SAY, by their own name: the house line counts what is late without them. */
  const house = sentenceFrom(week ? shaped.map((b) => lessWeekLate(b, week, today)) : shaped, today, waits ?? null);
  const sums = lateSumsOf(shaped, today);
  const billsSaid = sumsSaid(sums.bills);
  const lateBills = sums.billCount > 0 && billsSaid !== null ? { count: sums.billCount, said: billsSaid } : null;
  return { blocks: out, lead, capture, sentence: week ? weekSentence(shaped, today, week, house) : house, slash, lateBills };
}

/* ── the week's line ───────────────────────────────────────────────────── */

/** The week's due block, by its list and its own heading, as `weekBlocks` wrote it. */
const isWeekDue = (b: LiveBlock, w: Week): boolean =>
  b.kind === 'table' && listOf(b) === w.due.register && b.heading === `${w.due.name} due this week`;

/** The week's money tile, by its figures, on Today's own body and on one kept from it alike. */
const isWeekMoney = (b: LiveBlock): boolean => b.kind === 'stat' && (b.metrics ?? []).some((m) => (WEEK_IN as readonly string[]).includes(m.id));

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** A count in a sentence: digits always, never a word beside a figure. */
const opening = (n: number): string => n.toLocaleString('en-GB');

/** A day this week as a sentence says it: "today", "tomorrow", "Friday", and the short day past the week. */
function dueNamed(day: string, today: string): string {
  const n = daysBetween(today, day);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n > 1 && n < 7) return WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]!;
  return `on ${dueSaid(day, today)}`;
}

/** An amount as a sentence says it: "EGP 900", and the minor units only where there are some. Never a float. */
export function amountSpoken(minor: number, currency: string): string {
  const exp = exponentOf(currency);
  const whole = minor % 10 ** exp === 0;
  const body = (minor / 10 ** exp).toLocaleString('en-GB', { minimumFractionDigits: whole ? 0 : exp, maximumFractionDigits: exp });
  return `${currency.toUpperCase()} ${body}`;
}

const isMoney = (v: unknown): v is { amount: number; currency: string } =>
  typeof v === 'object' && v !== null && Number.isSafeInteger((v as { amount?: unknown }).amount) && typeof (v as { currency?: unknown }).currency === 'string';

/** "A, B and C". */
const andOf = (items: readonly string[]): string => (items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

/**
 * A FIGURE THE TILE DREW AS NOUGHT: `EGP 0.00`, or a bare `0` where no currency was said. The record answers a sum over
 * nothing as 0 (uc6-money-47), and the cell is the only place left that says so.
 */
const nought = (value: string): boolean => /^(?:[A-Z]{3} )?[−-]?0(?:[.,]0+)?$/u.test(value.trim());

/** An amount as the tile wrote it ("EGP 900.00 · USD 40.00", the dot between spaces of either kind), as a sentence says it: "EGP 900 and USD 40". */
const spokenOf = (value: string): string => andOf(value.split(/\s*·\s*/u).map((v) => v.trim().replace(/\.0+$/u, '')));

/**
 * THE WEEK'S MONEY TILE AS HOME DRAWS IT: a cell that reads nought is left out, so a week with nothing paid never says
 * "Paid 0" and nothing owed is not a figure, and a tile left with none is not drawn. Every other figure is as it came.
 */
function weekMoneyDrawn(b: LiveBlock): LiveBlock {
  const metrics = (b.metrics ?? []).filter((m) => !(([...WEEK_IN, OWED] as string[]).includes(m.id) && nought(m.value)));
  if (metrics.length === b.metrics?.length) return b;
  return metrics.length === 0 ? { ...b, metrics, drawn: false } : { ...b, metrics };
}

/**
 * The entries behind a figure, by handle, where the record sent them with it (`backs`), else none. Unchecked, so it is
 * narrowed here; a figure that names none is backed by nothing Home can see.
 */
const backsOf = (m: object): string[] => {
  const held = (m as { backs?: unknown }).backs;
  return Array.isArray(held) ? held.filter((h): h is string => typeof h === 'string' && h !== '') : [];
};

/** Whether two figures are one entry's: each names what backs it, and both name the same single entry. */
const oneBacks = (a: object, b: object): boolean => {
  const [x, y] = [backsOf(a), backsOf(b)];
  return x.length === 1 && y.length === 1 && x[0] === y[0];
};

/**
 * WHAT CAME IN, AS THE LINE SAYS IT, read off the tile so the two cannot disagree. One figure is said by who paid
 * where exactly one entry due this week was paid that very amount ("Nadia paid EGP 900."), else as the amount
 * ("EGP 900 came in this week."). Both are said side by side, each by the tile's own name for it and never added
 * ("EGP 900 was paid, and EGP 150 came in this week."): they are two figures, and two amounts under one verb read
 * as the same money twice. TWO FIGURES OF ONE AMOUNT ARE TWO MONEYS, and both are said: an order marked paid and an
 * unrelated EGP 900 in the bank's text are 1,800, and one sentence of 900 would lose half of it. THEY ARE SAID ONCE ONLY
 * WHERE ONE ENTRY BACKS BOTH (`oneBacks`), which the figures themselves must say; the amounts being equal never does.
 */
function weekInSaid(blocks: readonly LiveBlock[], due: LiveBlock | undefined, w: Week): string | null {
  const tile = blocks.find((b) => b.drawn && !says(b) && isWeekMoney(b));
  const each = (tile?.metrics ?? []).filter((m) => (WEEK_IN as readonly string[]).includes(m.id) && !nought(m.value) && m.value !== MISSING);
  const came = each.length === 2 && each[0]!.value.trim() === each[1]!.value.trim() && oneBacks(each[0]!, each[1]!) ? each.slice(0, 1) : each;
  if (came.length === 0) return null;
  if (came.length === 2) {
    const [settled, received] = WEEK_IN.map((id) => came.find((m) => m.id === id)!.value);
    return `${spokenOf(settled!)} ${settled!.includes('·') ? 'were' : 'was'} paid, and ${spokenOf(received!)} came in this week.`;
  }
  const said = spokenOf(came[0]!.value);
  const paid = w.due.paid;
  if (paid !== null && due && aligned(due)) {
    const at = due.entries.flatMap((e, n) => {
      const p = (e.fields as Record<string, unknown>)[paid];
      return isMoney(p) && money(p.amount, p.currency) === came[0]!.value ? [n] : [];
    });
    const col = due.columns.findIndex((c) => c.field === w.due.who);
    const who = at.length === 1 && col >= 0 ? (due.rows[at[0]!]?.cells[col] ?? '').trim() : '';
    if (who) return `${who} paid ${said}.`;
  }
  return `${said} came in this week.`;
}

/**
 * THE WEEK'S LIST'S LATE ONES, WHERE LATE DREW THEM: the places in a block over what fell due of the entries that are
 * the week's list's and past their day. The tile counts from today (`dueWhere`), so an order past its day is in Late and
 * nowhere else, named there by its list and number.
 */
function weekLate(b: LiveBlock, w: Week, today: string): number[] {
  if (!b.drawn || says(b) || !isDue(b) || !aligned(b)) return [];
  return where(b, (f) => typeof f.row === 'string' && f.row.startsWith(`${w.due.register}#`) && (dueDay(f) ?? today) < today);
}

/** A clause that keeps one list and no other: `list is orders`, never `list is orders or obligations`. */
const ONE_LIST = /^\s*list\s+is\s+(\S+)\s*$/u;

/** Whether a block's own `where:` keeps it to the week's list, so every entry it holds, drawn or not, is one of the week's. */
const onWeekList = (b: LiveBlock, w: Week): boolean =>
  typeof b.where === 'string' && clausesOf(b.where).some((clause) => ONE_LIST.exec(clause)?.[1] === w.due.register);

/**
 * THE WEEK'S LIST'S LATE ONES LATE HOLDS PAST ITS LIMIT. Twelve late orders drawn eight at a time are twelve late, as
 * the house line counts them (`lateBeyond`): the block's own total says how many it holds. ONLY WHERE THE BLOCK'S OWN
 * `where:` KEEPS IT TO THE WEEK'S LIST (`list is orders`). Late is every list's, and its oldest eight being orders says
 * nothing of the four behind them: eight old orders and four newer bills read "12 orders are late". Where the block
 * does not say so itself, what stands past its limit is the house line's to count as things.
 */
function weekLatePast(b: LiveBlock, w: Week, today: string): number {
  const mine = weekLate(b, w, today);
  return mine.length > 0 && mine.length === b.entries.length && onWeekList(b, w) ? lateBeyond(b, today) : 0;
}

/** A block over what fell due without the week's late ones, for the house line to count: the week's line says those. */
function lessWeekLate(b: LiveBlock, w: Week, today: string): LiveBlock {
  const mine = weekLate(b, w, today);
  if (mine.length === 0) return b;
  const past = weekLatePast(b, w, today);
  const rest = pick(b, b.entries.flatMap((_, n) => (mine.includes(n) ? [] : [n])), undefined, b.total - mine.length - past);
  /* WHAT THE BLOCK HOLDS LATE PAST ITS LIMIT, READ BEFORE THE WEEK'S WERE TAKEN OUT: with every drawn one an order and
     Late over every list, none is left drawn to say the four behind them are late, and they are still the house's. */
  return { ...rest, lateHeld: lateBeyond(b, today) - past } as LiveBlock;
}

/**
 * THE WEEK'S LINE, counted from what the blocks drew: "One order is due Friday. Nadia paid EGP 900." What is late
 * leads, in red with its word, AND IS ITS OWN COUNT: "One order is late. Two more are due this week, the first today."
 * The late ones are read off Late (`weekLate`, and `weekLatePast` for those past its limit) and the rest off the tile, which starts today, so the tile's number is
 * the one the list's own page says and the two never differ by what is late. What came in is read off the money tile
 * (`weekInSaid`): by who paid where that is plain, else as the amounts, side by side, never added. Something else
 * waiting (a question, a bill past its day) is still said after it, as the house line says it. With nothing due,
 * nothing late and nothing in, the house line stands.
 */
function weekSentence(blocks: readonly LiveBlock[], today: string, w: Week, house: Sentence | null): Sentence | null {
  const parts: string[] = [];
  let needs = '';
  const due = blocks.find((b) => b.drawn && !says(b) && isWeekDue(b, w));
  const days = (due?.entries ?? []).map((e) => (e.fields as Record<string, unknown>)[w.due.day]).filter((d): d is string => typeof d === 'string' && DAY.test(d)).map((d) => d.slice(0, 10)).sort();
  const total = due ? Math.max(due.total, due.entries.length) : 0;
  /* A HOME KEPT FROM AN OLDER TODAY still reads the late ones into its tile: they are late there too, and not this week's. */
  const inTile = days.filter((d) => d < today).length;
  const late = inTile + blocks.reduce((n, b) => n + weekLate(b, w, today).length + weekLatePast(b, w, today), 0);
  const rest = total - inTile;
  if (late > 0 || rest > 0) {
    const one = w.due.one.toLowerCase();
    const many = w.due.name.toLowerCase();
    const next = days.find((d) => d >= today);
    if (late > 0) {
      needs = late === 1 ? `1 ${one} is late` : `${opening(late)} ${many} are late`;
      const more = rest === 0 ? '' : rest === 1 ? ` 1 more is due${next ? ` ${dueNamed(next, today)}` : ' this week'}.` : ` ${opening(rest)} more are due this week${next ? `, the first ${dueNamed(next, today)}` : ''}.`;
      parts.push(`${needs}.${more}`);
    } else if (rest === 1) parts.push(`1 ${one} is due${next ? ` ${dueNamed(next, today)}` : ' this week'}.`);
    else parts.push(`${opening(rest)} ${many} are due this week${next ? `, the first ${dueNamed(next, today)}` : ''}.`);
  }
  const came = weekInSaid(blocks, due, w);
  if (came) parts.push(came);
  if (parts.length === 0) return house;
  const own = parts.join(' ');
  /* THE HOUSE'S CALM HEAD IS NOT SAID IN THE MIDDLE OF THE WEEK'S LINE: only what it says is late follows. */
  const tail = house?.text.replace(/^Nothing needs you\. /u, '') ?? '';
  return house && house.needs ? { text: `${own} ${tail}`, needs: needs || house.needs } : { text: own, needs };
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

/** A FEED READS AS WORDS: a bare count said as changes, and a day as "10 Sep". */
function worded(b: LiveBlock): LiveBlock {
  return dated(counted(b));
}

/** A day as a feed line says it: "10 Sep", never the record's "2026-09-10" (today F19). */
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dayWords = (text: string): string =>
  text.replace(/\b(\d{4})-(\d{2})-(\d{2})(?![\d:T])\b/gu, (whole, _y: string, m: string, d: string) => {
    const month = MONTH[Number(m) - 1];
    return month && Number(d) >= 1 && Number(d) <= 31 ? `${Number(d)} ${month}` : whole;
  });

function dated(b: LiveBlock): LiveBlock {
  const has = (r: LiveBlock['rows'][number]): boolean => ((r as { cells?: readonly (string | null)[] }).cells ?? []).some((c) => typeof c === 'string' && dayWords(c) !== c);
  if (!b.rows.some(has)) return b;
  return { ...b, rows: b.rows.map((r) => (has(r) ? { ...r, cells: r.cells.map((c) => (typeof c === 'string' ? dayWords(c) : c)) } : r)) };
}

/**
 * A FEED NEVER ENDS ON A BARE NUMBER. A burst the record could put no words to ("248" and nothing after it, under
 * Rules) is said as what it is, that many changes, so the count is in the words and the line reads as a line.
 */
function counted(b: LiveBlock): LiveBlock {
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
  /* A block the week's late ones were taken out of says its own count, read while they were still in it (`lessWeekLate`). */
  const held = (b as { lateHeld?: unknown }).lateHeld;
  if (typeof held === 'number') return Math.max(0, held);
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
/**
 * THE LATE MONEY ON THE PAGE, by which way it goes and by currency (never added across currencies): every row of what
 * fell due that is past its day and carries an amount. `owed` is money owed to you (`direction: in`), `bills` money you
 * owe; `bills` counts the bills. Read from the rows the record answered, drawn or folded, once each.
 */
export type LateSums = { owed: Map<string, number>; bills: Map<string, number>; billCount: number; things: number };

/**
 * WHETHER A LIST'S LATE ROWS ARE BILLS, read off its declaration and never its name: a list that owes an amount once
 * (a required money field), not one a cadence repeats (an amount paired with its period by `qualifies`) and not one
 * whose cost may be left blank (a service). A list the reader holds no declaration for is counted, as it always was.
 */
const billsIn = (list: string): boolean => {
  const decl = REGISTERS[list];
  if (!decl) return true;
  const owed = decl.fields.find((f) => f.type === 'money' && f.required === true);
  return owed !== undefined && owed.qualifies === undefined && !decl.fields.some((f) => f.qualifies === owed.id);
};

export function lateSumsOf(blocks: readonly LiveBlock[], today: string): LateSums {
  const out: LateSums = { owed: new Map(), bills: new Map(), billCount: 0, things: 0 };
  const seen = new Set<string>();
  /* THE LATE ROWS A LIST'S BLOCK HOLDS PAST ITS LIMIT, by list: a later block that draws one of them (a deadline that is
     one of Late's undrawn tasks) does not count it again. */
  const past = new Map<string, number>();
  const lateRow = (list: string | null): void => {
    const left = list === null ? 0 : (past.get(list) ?? 0);
    if (left === 0) out.things += 1;
    else past.set(list!, left - 1);
  };
  for (const b of blocks) {
    if (says(b) || !b.drawn) continue;
    if (isTodo(b)) {
      for (const e of b.entries) {
        const day = dayIn(b, e.fields as Record<string, unknown>);
        if (day !== null && day < today) lateRow(listOf(b));
      }
      const beyond = lateBeyond(b, today);
      out.things += beyond;
      const list = listOf(b);
      if (list !== null && beyond > 0) past.set(list, (past.get(list) ?? 0) + beyond);
      continue;
    }
    if (!isDue(b)) continue;
    for (const e of b.entries) {
      const fields = e.fields as Record<string, unknown>;
      const day = dueDay(fields);
      if (day === null || day >= today) continue;
      const key = typeof fields.row === 'string' ? fields.row : `${b.source}#${e.seq}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const amount = fields.amount;
      /* A BILL IS A ROW OF BILLS AND INVOICES, the list Money's "Bills late" and the list's own "2 late" sum. A repeating
         charge whose day went by, or a renewal, carries money too, but it is a late thing and not a bill: counted in,
         Today said £10,593 of bills against Money's £10,540. */
      if (typeof fields.list === 'string' && !billsIn(fields.list)) {
        lateRow(fields.list);
        continue;
      }
      if (!isMoney(amount)) {
        lateRow(typeof fields.row === 'string' ? fields.row.split('#')[0]! : null);
        continue;
      }
      const into = fields.direction === 'in' ? out.owed : out.bills;
      if (fields.direction !== 'in') out.billCount += 1;
      into.set(amount.currency, (into.get(amount.currency) ?? 0) + Math.abs(amount.amount));
    }
    out.things += lateBeyond(b, today);
  }
  return out;
}

/** Sums by currency as a display figure says them, whole and per currency: "£7,200", "£7,200 and $400 USD". */
export function sumsSaid(sums: ReadonlyMap<string, number>): string | null {
  const home = homeCurrency();
  const parts = [...sums.entries()]
    .filter(([, minor]) => minor !== 0)
    .map(([currency, minor]) => {
      const exp = exponentOf(currency);
      const whole = Math.round(minor / 10 ** exp) * 10 ** exp;
      return writeAmount({ minor: whole, currency }, home, 'read')?.text ?? amountSpoken(whole, currency);
    });
  return parts.length === 0 ? null : andOf(parts);
}

/**
 * THE PAGE'S LINE (spec 4.1, today F2): "8 need you. £7,200 owed to you is late. 2 agents are working."
 *
 * WHAT NEEDS YOU IS ONE COUNT: `boot`'s open questions (`waits`), the number the badge and the Needs you tile say,
 * and nothing is added to it. Without `waits` (an older host) it is what the page's queues hold. LATE IS ITS OWN CLAUSE,
 * said with its money (`lateSumsOf`), and where no late thing carries money, as a count of things. WHO IS WORKING is
 * `boot`'s too. `null` when the page holds none of those blocks and nothing waits, so a page of figures says its own line.
 */
function sentenceFrom(blocks: readonly LiveBlock[], today: string, waits: HomeWaits | null = null): Sentence | null {
  /* SOMETHING WAITING IS ALWAYS SAID; with nothing waiting a page's own line (a use case's) may stand, as before. */
  let counts = waits !== null && (waits.questions > 0 || (waits.told ?? 0) > 0 || (waits.inbox ?? 0) > 0);
  let needing = (waits?.questions ?? 0) + (waits?.told ?? 0);
  let agents = 0;
  /* WHETHER THE PAGE READ WHAT IS LATE, so "Nothing is late" is said only where it was looked for. */
  let lateRead = false;
  for (const b of blocks) {
    if (says(b) || !b.drawn) continue;
    if (isQueue(b)) {
      counts = true;
      if (waits === null) needing += asked(b);
    } else if (isTodo(b) || isDue(b)) counts = lateRead = true;
    else if (isRuns(b)) {
      counts = true;
      agents += b.entries.length;
    }
  }
  if (!counts) return null;
  if (waits !== null) agents = waits.working;
  const sums = lateSumsOf(blocks, today);
  const late = { owed: sumsSaid(sums.owed), bills: sumsSaid(sums.bills) };
  return sentenceOf({ needYou: Math.max(0, needing), late, lateThings: sums.things, lateRead, agents, inbox: waits?.inbox ?? 0 });
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
