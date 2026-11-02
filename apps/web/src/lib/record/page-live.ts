/**
 * A declared page on `/p/<slug>`, read from the record, and only from the record.
 *
 * A ROUTE-ONLY MODULE, like `row-live.ts`: the client carries the route table as a value.
 *
 * A REFUSAL IS THE RECORD'S SENTENCE, `UNREACHABLE` AND `UNAUTHORIZED` INCLUDED. Those two drew the
 * in-browser sample's page and kept that for the tab, so a person whose session lapsed read the seeded
 * studio's Desk under their own record's address until they reloaded. The sample is gone now.
 * Every page now asks, and the next one asks again. A page the record does not have is `missing`, with
 * the addresses of the pages it does have.
 *
 * A LIVE PAGE IS DRAWN FROM THE ANSWER AND NOTHING ELSE. Each block the record sent becomes the shape
 * the page's drawing already reads, except a block whose kind is registered (`lib/page/kinds/index.ts`),
 * which keeps the answer whole and is drawn from it by its own module. A block this build cannot draw from
 * that answer carries one plain sentence instead, and is never filled from anything the record did not send.
 *
 * THE DECLARATIONS ARE THE SEED'S COPY, as they are for the list and the row (`remote.ts` says why):
 * a register's labels, a metric's format and target line.
 */

import { createClient, type ClientOptions } from '@braindog/client';
import { KEEP_RATES_AT } from '@braindog/declare';
import type { Bars, FxRead, MeasureSeries, Part, QueueQuestion, TargetIn } from '@braindog/kernel';
import { COSTS, isBucket, isQuiet } from '@braindog/kernel/constants';
import { KPIS_KIND, MISSING, UNNAMED, dateSaid, datesIn, exponentOf, integer, slugWords, money, moneyWhole, quantity, shortDay, since, barFigures, day as fmtDay, type Resolve } from 'braindog-render';

import { copy } from '../copy.ts';
import { stopped } from '../shell/headline.ts';
import { presenceSaid, type RunPresence } from '../ui/presence-words.ts';
import { factCells } from './card-fact-cells.ts';
import { lateSaid } from '../home/today-tiles.ts';
import { isForecast } from '../home/card-kpi.ts';
import type { WorkedAt } from '../home/project-cards.ts';
import type { ActionRow, Outcome } from './actions.ts';
import {
  agentsTable,
  columnHeading,
  decl as fieldOf,
  feedTable,
  historyTable,
  homeCurrency,
  markColumns,
  runWords,
  toRows,
  unnamed,
  walkTable,
  type BlockResult,
  type FeedRow,
  type MeasureLatest,
  type Metric,
  type Walk,
  type WalkStep,
} from './api.ts';
import { REGISTERS } from './held.ts';
import { rowHref, spokenOf } from './row-href.ts';
import { linkOf, REST_MARK, TALLY_LAST, TALLY_TIMES, staleOf } from './blocks.ts';
import { thingName } from './project.ts';
import { bylineOf } from './byline.ts';
import { FIGURES_KNOWN as METRICS } from './figures-known.ts';
import { figuresFor, learnFigures } from './figures-said.ts';
import { askSlot } from '../page/slot.ts';
import { readBoot } from './boot-live.ts';
import { kept as keptAnswers, pageKey } from './kept-pages.ts';
import { beyondOf, format, fxNote, hrefFor, leadOf, markOf, pluralsIn, noteOf, partsShown, partsText, targetSaid, walksNote, withParam, type MetricDecl } from './metrics.ts';
import { moneyInText } from './money.ts';
import { entryOf, learn, namesOf, refMapOf, targetsOf, type RecordRow, type RefMap } from './remote.ts';
import { REDUCES, SUMS, type Entry, type PageBlock, type PageDecl } from './schema.ts';
import { compile } from './where.ts';
import { drawerOf } from '../page/kinds/index.ts';
import { liveOf } from '../ui/face.ts';
import { sourceRows } from './source-rows.ts';
import { scriptOf } from './scripts.ts';
import { noteWithoutLeftovers } from './brief.ts';
import { learnZone, recordToday } from './zone.ts';
import { pathOf } from '../ui/icons.ts';
import { rowsOf as tabRows, walkRows } from '../data/ref-rows.ts';
import type { BlockResult as Answer } from '@braindog/kernel';

/**
 * MONEY IN A SENTENCE IS SAID IN WHOLE UNITS (30 October, one rule app-wide): a line read "£11,317 a month, more than the
 * £3,655.20 a month that came in". Lists and tables keep the pence the record holds; a note's sentence rounds each
 * amount it carries to the whole pound, "£3,655", and leaves every other number as it is.
 */
/**
 * ONE MARK OF CURRENCY IN A SENTENCE (coordinator's live check of 1 Nov): Budgets' line read "USD $952 a month", the
 * code and the symbol both. A code standing just before its own symbol and a figure is left out, the symbol kept.
 */
function oneMarkIn(text: string): string {
  return text.replace(/\b([A-Z]{3})[ \u00a0]((?:[A-Z]{1,2})?[$£€¥₹])(?=[−-]?\d)/gu, (found: string, code: string, symbol: string) => {
    try {
      const parts = (display: 'symbol' | 'narrowSymbol') => new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: display }).formatToParts(0).find((x) => x.type === 'currency')?.value;
      return symbol === parts('symbol') || symbol === parts('narrowSymbol') ? symbol : found;
    } catch {
      return found;
    }
  });
}

/** An amount of a thousand or more in a text, which the one rule for cents says whole. */
const BIG_AMOUNT = /(?<!\b1 = )(?:[£$€¥₹]|\b[A-Z]{3}\s)[−-]?(?:\d{1,3}(?:,\d{3})+|\d{4,})(?!\d)/u;

export const wholeMoneyIn = (text: string): string => wholeMoneyOf(text);

function wholeMoneyOf(text: string, all = false): string {
  text = oneMarkIn(text);
  /* ONE RULE A SENTENCE (polish5, 2 Nov): Budgets read "$951.67 a month across 3 categories. $2,586 spent this month",
     one sentence saying money two ways. Where any amount in it is a thousand or more, and so said whole, every amount in
     it is whole; where none is, the cents stay where they are not nought ("$148.85 to pay on the card"). */
  const big = all || BIG_AMOUNT.test(text);
  /* A RATE IS NOT AN AMOUNT: "USD 1 = EGP 50.50" keeps its pence, or "GBP 1 = USD 1.35" would read as one to one. */
  return text.replace(/(?<!\b1 = )((?:[£$€¥₹]|\b[A-Z]{3}\s)[−-]?)(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})(?!\d)/gu, (found: string, lead: string, units: string, cents: string) => {
    /* THE ONE RULE FOR CENTS (1 Nov): under a thousand the cents stay where they are not nought, "$148.85 to pay on the
       card"; from a thousand up, and ".00" at any size, the amount is whole. */
    if (!big && Number(units.replace(/,/gu, '')) < 1000 && cents !== '00') return found;
    const whole = Number(units.replace(/,/gu, '')) + (Number(cents) >= 50 ? 1 : 0);
    return `${lead}${whole.toLocaleString('en')}`;
  });
}

/** A block's resolver as `pluralsIn` reads a figure: its words, none for a path that names nothing, `null` unread. */
const saidFor =
  (read: Resolve) =>
  (path: string): string | null => {
    const v = read(path);
    return v === UNNAMED ? '' : typeof v === 'string' ? v : null;
  };

export type Fetch = NonNullable<ClientOptions['fetch']>;

export const liveWords = {
  cannot: 'This part of the page cannot be drawn yet.',
  changed: 'The page changed while it was being read.',
  /**
   * WHAT A REDUCING FIGURE SAYS WHEN THE FIELD IT ADDS UP IS ONE NOBODY HAS FILLED IN.
   *
   * It is the tile's half of the sentence the bar beside it already draws, *"No project in play says
   * what it earns. Put a year on one and it draws here."* That bar can name the field because a
   * declaration wrote its `empty:` for one block; this line is said under any figure, so it names
   * what happened rather than what to type.
   *
   * IT BELONGS IN `copy.ts` AND IS HERE BECAUSE THAT FILE IS ANOTHER AGENT'S THIS RUN. `liveWords`
   * is already the two sentences this path says for itself, so a third sits beside them rather than
   * being written twice; moving it is a rename and nothing else.
   */
  unsaid: copy.nothingMatched,
} as const;

/**
 * WHAT A PAGE SAYS ONCE, AT ITS FOOT (`footed`), kept here beside the call as `page-new.ts` keeps `pageWords`.
 *
 * RATES OUT OF DATE ARE THE PAGE'S NEWS AND NOT A TILE'S: the sentence was printed under every converted figure and had
 * nothing to press. Here it is said once, with the one way to stop it happening again, which opens the rates action
 * already filled in (`routes/packs/[id]` offers the same address from Money's settings).
 */
export const footWords = {
  /**
   * `way` IS WHAT THE RECORD ALREADY HAS. `none`: no action fetches rates, so the new one is offered.
   * `held`: one does, paused or failing or merely late, and the way on is that action; offering the preset again was a
   * second copy to a person who needed the first mended. `unread`: the actions could not be read, so nothing is offered,
   * because a link chosen at a guess is the fault this fixes.
   */
  ratesStale: (day: string, way: RatesWay, age: number, pairs = ''): string => {
    /* THE RATE ITSELF AND HOW OLD IT IS, SINCE THE LOOK OF 27 OCTOBER: "$1 = EGP 50.50, the rate from 28 Sep 2026, is 30
       days old". A record that sends no rate beside its figures is said the day and the age alone. */
    const old = age === 1 ? '1 day old' : `${age} days old`;
    const said = pairs
      ? `${pairs}, the rate${pairs.includes(' and ') ? 's' : ''} from ${day}, ${pairs.includes(' and ') ? 'are' : 'is'} ${old}, so figures on this page converted at ${pairs.includes(' and ') ? 'them' : 'it'} are out of date.`
      : `Figures on this page are converted at rates as of ${day}, ${old}, which are out of date.`;
    if (way === 'none') return `${said} [Keep rates current](${RATES_PRESET})`;
    return way === 'held' ? `${said} [Open the action that fetches them](${RATES_HELD})` : said;
  },
} as const;

/** What a record has for keeping its rates current, as the foot reads it. */
export type RatesWay = 'none' | 'held' | 'unread';

/** The rates action, filled in and waiting for a yes. Record-relative: the renderer's `href` puts the record in front. */
const RATES_PRESET = KEEP_RATES_AT;

/** Where a scheduled action is listed with its state and its way back on. An action has no address of its own. */
const RATES_HELD = '/automations?tab=scheduled';

/**
 * THE RATES ACTION A RECORD HOLDS, or `null`: the one filed under the name the sheet's own preset files it under, and
 * failing that one that writes the list the preset writes.
 *
 * BOTH ARE ASKED OF `ratesPreset` AND WRITTEN NOWHERE ELSE, so the day the add-on's file is filed under another name, or
 * keeps its rates in another list, this follows it. Neither moves with the currencies (one address, one action,
 * `ratesSpecFor`), so any two of them ask it.
 *
 * AN ACTION DRAFTED BY HAND IS KNOWN BY WHAT IT DOES: under a name of its own it read as no rates
 * action at all, and the foot offered a second copy beside the one already fetching. `writes` is the list an action
 * files what it fetched in, as the record answers it beside the name; an answer without it is found by name alone, as
 * before. The preset's own comes first where both are held, since that is the one the sheet opens again.
 */
export function ratesActionOf<A extends { ingest: string; writes?: string | null }>(actions: readonly A[]): A | null {
  const filed = RATES_FILED ?? null;
  if (filed === null) return null;
  return actions.find((a) => a.ingest === filed.ingest) ?? (filed.register === '' ? null : (actions.find((a) => a.writes === filed.register) ?? null));
}
let RATES_FILED: { ingest: string; register: string } | null | undefined;

/**
 * THE PRESET'S NAME AND LIST, LEARNT ONCE BEFORE `ratesActionOf` IS ASKED: the sheet's preset (`action-draft.ts`) is
 * asked by `import()`, and only for a page whose rates are out of date, so a page that has none does not load the
 * action sheet's drafting to draw. The reader learns it beside the actions it reads for the foot.
 */
export async function learnRates(): Promise<void> {
  if (RATES_FILED !== undefined) return;
  const { ratesPreset } = await import('./action-draft.ts');
  RATES_FILED ??= ratesPreset({ currencies: ['USD', 'EUR'], home: 'USD' })?.filled ?? null;
}

/** A refusal as the record sends one, and only the keys read here. */
type Said = { code: string; fix: string };

/** A reading as the kernel's `metrics.ts` sends one, and only the keys read here. */
type Reading = {
  value: number | null;
  unit: string | null;
  rows: number;
  /**
   * How many rows the list holds at all, which is not `rows` and is what an empty list means here.
   *
   * OPTIONAL BECAUSE A READING BUILT BY HAND HAS ONLY EVER WRITTEN `rows`, the same reason
   * `news-live.ts` leaves it optional: a required key would have made every such reading in
   * `page-live.test.ts` a compile error rather than a repair. Where it is absent the tile falls back
   * to `rows`, which is the old, ambiguous reading of a zero and withholds the verdict rather than
   * inventing one. The record always sends it.
   */
  held?: number;
  met: boolean | null;
  refusals: Said[];
  /** The entries the figure was added up from, by handle, where the record says; narrowed by `backsOf`, never trusted. */
  backs?: unknown;
  /**
   * A grouped figure's parts, and how many past the cap were not drawn. `label` is what the record calls a part where its
   * key is not words: the title of the row a ref points at, an enum's declared label. Unchecked, so it is narrowed where
   * it is read; a record on an older kernel sends none.
   */
  groups?: { key: string; value: number | null; parts?: Part[]; label?: unknown }[];
  more?: number;
  /** Money in several currencies not added up, and how a figure across currencies was read. */
  parts?: Part[];
  fx?: FxRead;
  /** A figure converted out of its declared currency: its target, converted at the latest rate. */
  targetIn?: TargetIn;
  /** A walk to zero that never went under: the last day it looked at. Beside a null value; narrowed by `beyondOf`, never trusted. */
  beyond?: unknown;
};

/* `group` IS A GROUPED CARD'S OR TABLE ROW'S, what it is grouped under by value and name (`PageRow.group`), narrowed by `groupsOf`. */
type Row = RecordRow & { updated_at?: string; group?: unknown };

/**
 * A block as the record's `page` answers it: the declaration, with what the kernel read on it.
 *
 * WHAT THE RECORD CHECKS AND WHAT IT MERELY CARRIES ARE DIFFERENT THINGS, and this type is where that
 * difference is written down rather than cast away. `declare.ts` checks a block's `kind`, `span`,
 * `limit`, `tone`, `fold`, `icon`, `source`, `cells`, `when`, `columns` and `order` when a declaration
 * is installed, so those arrive at the shapes it admits. It does not look at `heading`, `empty`,
 * `body`, `target` or `authored` AT ALL, and `pages.ts` forwards them because they are keys a block
 * may carry. Each of those is `unknown` here and is narrowed once, by the code that puts it on a
 * block, because the app's own `PageBlock` promises a shape nobody checked.
 *
 * A BLOCK IS JSON FROM A RECORD, and a pack is a thing a stranger wrote, so this path is where a
 * declaration can be a shape the app did not expect.
 */
type Answered = {
  source?: string;
  span?: number;
  limit?: number;
  tone?: PageBlock['tone'];
  /* A SECTION'S `true`, AND ON A GROUPED CARD BLOCK `true` OR HOW MANY OF EACH GROUP SHOW, narrowed below. */
  fold?: unknown;
  icon?: string;
  columns?: { field: string; label?: unknown; width?: string; align?: 'start' | 'end'; as?: string; sign?: { field: string; minus: string }; metric?: unknown; or?: unknown; named?: unknown }[];
  cells?: { metric: string; label?: unknown; trend?: unknown; ahead?: unknown; note?: unknown; sign?: unknown }[];
  /* THE KEYS THE RECORD NEVER CHECKED, NAMED RATHER THAN COUNTED. This said THE SIX and listed
     seven, and `label` below makes any count wrong again, so it names them: `kind`, `where`,
     `heading`, `empty`, `body`, `target`, `authored`, and every `label` a column, cell or reading
     carries. `blocks.ts` draws the text ones through `escapeCell`, which is `c.replaceAll(...)`, and
     `authored` through `r.cells.map(escapeCell)`. Anything that is not the shape the app's type
     promises is a TypeError inside the page's own render rather than a block saying it cannot be
     drawn, and a block that throws takes the whole page with it.

     `label` WAS THE ONE LEFT TRUSTED. The kernel now refuses a non-text label at install, so a
     record on this build cannot send one; a record on an older kernel still can, and this is the
     path that reads what a record actually sent rather than what it should have sent. */
  kind?: unknown;
  where?: unknown;
  heading?: unknown;
  empty?: unknown;
  body?: unknown;
  target?: unknown;
  authored?: unknown;
  rows?: Row[];
  matched?: number;
  /** A sum kind's whole, added up by the record over every row the block admits; read through `wholeOf`. */
  wholeRead?: unknown;
  readings?: { metric: string; label?: unknown; reading: Reading | null; refusal?: Said; trend?: unknown; note?: unknown }[];
  scopes?: (string | null)[];
  rings?: (number | null)[];
  inherited?: number;
  refusals?: Said[];
  drawn?: boolean;
  values?: Record<string, unknown>;
  /**
   * HOW EACH `{{path}}` THAT IS A FIGURE WAS CONVERTED, by the path, as a figure's `fx` says it of a tile. `values` holds
   * the amount alone, so a sentence could not know its rates were out of date; narrowed by `staleSaid`, never trusted.
   */
  values_fx?: unknown;
  /** A lead note's line as the model wrote it overnight, sent only while the figures it was written from still hold. */
  said?: unknown;
  [key: string]: unknown;
};

/**
 * A PAGE AS THE RECORD ANSWERS ONE, which is not the same object as a page this app declares.
 *
 * `schema.ts`'s `PageDecl` is a DECLARATION: it carries `blocks`, and it marks `requires` required
 * because a page this app writes names the registers it reads (`rows-write.ts`, and `06 §1.1`, where
 * `requires` is what takes a page out of the nav with the pack that owned its rows). An ANSWER is
 * neither of those things. Its blocks come back beside the declaration and are drawn separately, and
 * `requires` is a key the record sends only when the declaration behind it has one.
 *
 * NAMING THAT DIFFERENCE IS THE POINT. This was one `as unknown as PageDecl` with a `requires: []`
 * in front of it: the app declaring, on the record's behalf, that the page reads no register at all.
 * The cast is what let it through, and a cast that bridges two types silences every other difference
 * between them at the same time.
 */
/**
 * `declared_version` is the version the record holds the page at, which arranging it writes against. `filters` is
 * what the page may be narrowed by, as the record answered it; `filtersOf` (`$lib/page/filters.ts`) reads it.
 */
export type LivePageDecl = Omit<PageDecl, 'blocks' | 'requires'> & {
  requires?: readonly string[];
  declared_version?: number;
  filters?: unknown;
  look?: LiveLook;
  /** What a project's page draws of its shape, answered beside its blocks (`shape-answer.ts`); none on any other page. */
  shape?: unknown;
};

/**
 * HOW THE ENGINE ARRANGED THE PAGE (the look overlay), as the record answers it beside the
 * blocks: which block leads, the order of the rest by their keys, what it hid, the line it leads with, the one next
 * action, the blocks pinned in place, and who arranged it (the rules, Slash, or the person). The record answers it as
 * `PageResult.look` (`packages/kernel/src/compose.ts` `LookBody`), already applied to the blocks. `kept` names the
 * person who kept what Slash arranged, where the record says it.
 *
 * NARROWED HERE (`lookOf`), because the record checks a look against the block grammar and the app's type still says
 * more than the record checked: a key that is not text is no key, and a look with no `by` is no look at all.
 */
export type LiveLook = {
  /** The page declaration the look is laid over, which every page drawn from one template shares; a look is `look.<page>`. */
  page: string | null;
  basis: string | null;
  lead: string | null;
  order: readonly string[];
  hide: readonly string[];
  headline: string | null;
  next: { row: string; text: string } | null;
  pinned: readonly string[];
  by: 'rule' | 'slash' | 'owner';
  kept: string | null;
  /** The owner's widths, columns and grouping, where the look says them, so Undo puts an earlier look back whole. */
  span?: Record<string, number>;
  area?: Record<string, 'main' | 'rail'>;
  group?: Record<string, string>;
  /** When the live look was written, when the record says. */
  at?: string | null;
};

type AnsweredPage = LivePageDecl & { blocks?: Answered[]; [key: string]: unknown };

/** A block the page draws: the app's `BlockResult`, with what only a live answer carries. */
export type LiveBlock = BlockResult & {
  /** A block the record holds from this reader (refused FORBIDDEN or LEVEL_REQUIRED): Today gives it no cell. */
  held?: true;
  /** A queue of questions narrowed to the page's own by its `where`, which the clause itself never reaches the page as. */
  narrowed?: true;
  /** A lead note's: its sentence is the line the model wrote, not the rules' (`said`), so a hero can say who wrote it. */
  modelLine?: true;
  /** The rows a block names, by handle (`tasks#3`), with the name each is said by: a list's refs, or a note's (`refNamesOf`). */
  names?: ReadonlyMap<string, string>;
  /** The block's `{{path}}` values as the record answered them. */
  values?: Record<string, unknown>;
  /** An `actions` block's rows, in the shape "Runs on" reads. */
  actions?: ActionRow[];
  /** Set when this build cannot draw the block from a live answer: the one line drawn instead. */
  cannot?: string;
  /** A heat's: how many of its list's days fall outside its twelve weeks, which no cell draws and the block says under them. */
  outside?: number;
  /** A heat's: how many distinct days those are, where the record says (`outsideDays`). What the sentence under the cells counts. */
  outsideDays?: number;
  /**
   * An `inputs` block's: the record's home currency as the kernel answers it beside `types`, or `null` where none is set,
   * which a bare figure typed into an empty money box is written in (`inputs-write.ts` `home`).
   */
  home?: string | null;
  /** An `inputs` block's: the fields its list works out (`derive:`), as the record answers them, drawn as figures and never typed into. */
  derived?: readonly string[];
  /** A block with a column `as: scope`: what each of those cells draws its chip from (`scopeCellsOf`). */
  scopeCells?: ScopeCells;
  /**
   * WHAT THE BLOCK IS, AS THE RECORD NAMES IT: its declared `key`, or the record's stable hash of its kind, source and
   * heading. A page recomposing follows a block by this and never by its place (`$lib/page/recompose.ts`). Absent from a
   * record older than the look overlay, where the page works one out the same way.
   */
  key?: string;
  /**
   * A WIDGET ON TODAY THAT SAYS ITS OWN `empty:` LINE in its frame, holding nothing (`home/widget-empty.ts`): the page's
   * quiet rule leaves it drawn (`PageBody.svelte`), and the drawer says the line as any empty block does.
   */
  saysEmpty?: true | undefined;
  /** Who changed each row last, aligned with the rows, as the record answered it (`$lib/page/byline.ts` reads it). */
  changes?: unknown[];
  /**
   * EACH `{{path}}` OF THE BLOCK THAT NAMES NOTHING OF THE RECORD, as the kernel answers it beside `values`: no figure,
   * list, row or field. The page's resolver answers `UNNAMED` for these (`namedResolverOf`), so the renderer prints the
   * author's words in prose and leaves the figure out of a chip, a tile or a bar, where a named path with no value
   * keeps its dash.
   */
  unnamed?: string[] | undefined;
  /**
   * THE DAY EACH FILLED `{{path}}` WAS STATED ON, where the record knows one (`values_as_of`): a rolled figure's oldest
   * balance, or a row's own `as_of`. A sentence says the age beside the figure once it is old (`agedText`).
   */
  valuesAsOf?: Record<string, string> | undefined;
  /**
   * A RUN'S FACE ON A CARD whose `who` column the block answered as a run (`types`), aligned with the rows, or `null`
   * where the row names no run the page could read. Handed to the renderer as its `runs`, as a block of runs is.
   */
  runFaces?: (RunCell | null)[];
  /** HOW MANY HELPERS EACH RUN HAS WORKING WITH IT, on a block of runs at work (`sessions.working`), aligned with the rows. */
  helpers?: number[];
  /**
   * WHEN EACH CARD'S PROJECT WAS LAST WORKED ON, from a when column over `project-worked`,
   * aligned with the rows, or `null` for a card it said no moment of. Today and Projects draw a card's live line from it.
   */
  lastWorked?: (WorkedAt | null)[];
  /**
   * A QUEUE'S CARDS SHOWN BEFORE "N MORE" OPENS THE REST IN PLACE, questions of one family counted once (Needs you's
   * groups, `routes/decide/views.ts` `NEEDS_SHOWN`). Absent, a queue shows every card it holds.
   */
  most?: number;
  /**
   * SET ON A BLOCK THE READER ADDED AND THE PAGE NEVER DECLARED (the foot, `footed`). Arrange and Change this page save
   * against the count of declared blocks, and the record refuses a save whose count is off; whoever hands blocks to
   * either leaves these out, and nothing offers to move, change or pin one.
   */
  synthetic?: true;
};

/** The mark and hue of the project a row applies to, as the kernel answers them beside `scopes` (`scope_marks`). */
export type ScopeMark = { mark: string | null; hue: number | null };

/**
 * WHAT A SCOPE CELL DRAWS ITS CHIP FROM, handed to the renderer beside the block.
 *
 * `columns` are the indexes of the columns declared `as: scope`; a cell there holds the project's name, or
 * `everywhere`. `marks` is each name's mark and hue, and `glyph` the globe's path, which the renderer draws for
 * everywhere because it ships no glyph art of its own (05 §3).
 *
 * BY NAME, AND NOT BY ROW, because a board or a checklist keeps a row somebody just moved where they left it
 * (`page-writes.ts` `keptSegment`), so a list aligned with the rows as read would hand a card another row's mark. A
 * name is the cell's own text wherever the row ends up.
 *
 * THE RENDERER READS THE SAME SHAPE under the same name (`packages/render/svelte/p/Table.svelte`, `Cards.svelte`),
 * and it is written out there rather than imported, because this app's modules are not the render package's to read.
 */
export type ScopeCells = { columns: readonly number[]; everywhere: string; glyph: string | null; marks: ReadonlyMap<string, ScopeMark> };

/** A run's face as the renderer's `Cards` takes it (`RunCell` in `braindog-render`'s `cards.ts`), written out as `ScopeCells` is. */
export type RunCell = { run: string; agent: string | null; live: 'working' | 'quiet' | 'stopped'; presence?: RunPresence };

export type LivePage = { page: LivePageDecl; blocks: LiveBlock[] };

export type Opened =
  | { from: 'live'; page: LivePage; now: number }
  | { from: 'missing'; held: { address: string; title?: string }[] }
  | { from: 'refused'; fix: string };

/** What a scope cell reads for a row that applies to every project, as the sample says it. */
const EVERYWHERE = 'Everywhere';

/**
 * One row's half of `scope_marks`, narrowed: a mark that is words, and a hue that is a whole degree on the wheel, else
 * `null` in that half. The kernel checks both (`pages.ts` `markOf`); a record on another build is read, not trusted.
 */
const scopeMarkOf = (v: unknown): ScopeMark | null => {
  if (!isObject(v)) return null;
  const { mark, hue } = v;
  return {
    mark: typeof mark === 'string' && mark.trim() !== '' ? mark : null,
    hue: typeof hue === 'number' && Number.isInteger(hue) && hue >= 0 && hue <= 359 ? hue : null,
  };
};

/**
 * What a block's scope cells draw their chips from, or nothing for a block with no column `as: scope`.
 *
 * THE MARK IS READ BESIDE THE NAME THE CELL ALREADY HOLDS, from `scope_marks`, which the kernel reads off the same
 * project rows as `scopes`, so a chip and the words in it never come from two reads. A `scope_marks` that is not one
 * entry a row is left out whole, and the cells keep their words with no mark.
 */
function scopeCellsOf(columns: readonly { as?: unknown }[], rows: readonly { cells: (string | null)[] }[], said: unknown): ScopeCells | undefined {
  const at = columns.flatMap((c, i) => (c.as === 'scope' ? [i] : []));
  if (at.length === 0) return undefined;
  const each = Array.isArray(said) && said.length === rows.length ? said : [];
  const marks = new Map<string, ScopeMark>();
  rows.forEach((row, n) => {
    const mark = scopeMarkOf(each[n]);
    if (!mark) return;
    for (const i of at) {
      const name = row.cells[i];
      if (typeof name === 'string' && name !== '' && name !== EVERYWHERE) marks.set(name, mark);
    }
  });
  return { columns: at, everywhere: EVERYWHERE, glyph: pathOf('globe', undefined) ?? null, marks };
}

/** The register a block's rows belong to, when it has one this build can draw. */
function registerOf(b: Answered): string | null {
  if (b.source === 'sessions.live' || b.source === 'sessions.working') return 'session';
  /* AN `inputs` BLOCK NAMES ITS LIST AS `register:`, as a capture does, and has no `source:`. Without this the page read
     never asked for a pack's list before drawing one, and every such block came back as the line saying it cannot be
     drawn, on the first record that had not already opened that list somewhere else. */
  if (b.kind === 'inputs') return typeof b.register === 'string' && b.register !== '' ? b.register : null;
  return b.source?.startsWith('register.') ? b.source.slice('register.'.length) : null;
}

/**
 * WHAT A GROUPED FIGURE'S PARTS ARE KEYED BY: the list the figure reads and the field it groups by, from this build's copy
 * of the figure (`METRICS`). `null` for a block over anything else, and for a figure this build does not declare, whose
 * parts are named by the record's own `label` or by their keys.
 */
function groupedBy(b: Answered): { register: string; field: string } | null {
  if (typeof b.source !== 'string' || !b.source.startsWith('metric.')) return null;
  const id = b.source.slice('metric.'.length);
  const at = id.indexOf(':');
  const figure = METRICS[at < 0 ? id : id.slice(0, at)];
  const by = figure?.group_by;
  if (!figure || typeof by !== 'string' || !figure.source.startsWith('register.')) return null;
  return { register: figure.source.slice('register.'.length), field: by };
}

/**
 * THE LIST A GROUPED FIGURE'S KEYS POINT AT, when it groups by a ref, or `null`. Such a key is the ULID the record stores
 * the ref as, which is the one string a person must never read: Cash now by book drew "Book #01M3VMPSHV07AM4S51WDTFM5XG".
 */
function partsTarget(b: Answered): string | null {
  const by = groupedBy(b);
  const f = by ? fieldOf(by.register, by.field) : undefined;
  return f?.type === 'ref' && typeof f.to === 'string' && f.to !== '' ? f.to : null;
}

/** The label the record gave a part, when it is words. */
const labelled = (g: { label?: unknown }): string | null => (typeof g.label === 'string' && g.label.trim() !== '' ? g.label.trim() : null);

/** Whether the record named every part of a grouped figure itself, so no list has to be walked to name them here. */
const partsNamed = (b: Answered): boolean => (b.readings?.[0]?.reading?.groups ?? []).every((g) => labelled(g) !== null);

/**
 * A PART'S NAME, NEVER ITS KEY WHEN THE KEY IS AN ID: the record's `label`, else the title of the row the key points at,
 * else that row said as its kind and number, and a key whose row this reader cannot reach as the kind alone ("Unnamed
 * book", `unnamed`). A key that is a word (an enum's value, a name) keeps the record's label as it came, and `blocks.ts`
 * says it as its field says it first, which knows the person's own word for a value.
 */
function partName(g: { key: string; label?: unknown }, target: string | null, refs: ReadonlyMap<string, RefMap>): string | undefined {
  const said = labelled(g);
  if (said !== null) return said;
  if (target === null) return undefined;
  const map = refs.get(target);
  const seq = map?.seqOf.get(g.key);
  if (seq === undefined) return unnamed(target, g.key);
  return map?.titleOf.get(seq) ?? unnamed(target, seq);
}

/** A string the record did not have to check, or nothing. */
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/**
 * ONE LINE OF A WHOLE: a label as the list stores it, what every row under it adds to, the currency when that is
 * money, and for a heat set against another whole (`of:`) that day's whole.
 */
type WholeLine = { label: string | number | boolean | null; value: number; currency?: string; of?: number; rest?: true; times?: number; last?: string };

/** A whole number that counts something, nought or more. */
const counted = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/**
 * THE LABELS PAST THE KERNEL'S CAP AS LINES OF THE WHOLE (`rest`, `WHOLE_PARTS` in `kernel/src/pages.ts`), or `null`
 * where the rest does not read: none where there is no rest, one where it added up, and one a currency where it did not.
 *
 * A REST LINE HOLDS NO LABEL, because it is no value of the field: a date column would write it as a day and a chip
 * would filter by it. It is marked instead, and the drawer says it in its own words, last (`blocks.ts` `REST_MARK`).
 */
function restOf(past: unknown): WholeLine[] | null {
  if (past === undefined || past === null) return [];
  if (typeof past !== 'object') return null;
  const { labels, rows, value, unit, parts } = past as Record<string, unknown>;
  if (!counted(labels) || labels === 0 || !counted(rows)) return null;
  if (unit !== undefined && unit !== null && typeof unit !== 'string') return null;
  if (typeof value === 'number' && Number.isFinite(value))
    return [{ label: null, value, ...(typeof unit === 'string' && /^[A-Z]{3}$/.test(unit) ? { currency: unit } : {}), rest: true }];
  if (value !== null || !Array.isArray(parts) || parts.length === 0) return null;
  const lines: WholeLine[] = [];
  for (const p of parts) {
    const { amount, currency } = (p ?? {}) as Record<string, unknown>;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || typeof currency !== 'string') return null;
    lines.push({ label: null, value: amount, currency, rest: true });
  }
  return lines;
}

/**
 * HOW MANY OF A HEAT'S ROWS NO CELL DRAWS (`outside` on the kernel's `WholeRead`: dated outside its twelve weeks, or
 * holding no day): the count, nought where the record said none, and `null` where what it said is no count.
 */
function outsideOf(v: unknown): number | null {
  const outside = v !== null && typeof v === 'object' ? (v as { outside?: unknown }).outside : undefined;
  if (outside === undefined || outside === null) return 0;
  return counted(outside) ? outside : null;
}

/**
 * WHETHER THE LINES ADD TO THE WHOLE'S OWN TOTAL, the rest among them. Bars that add to something else than the figure
 * the record read over the same rows are a chart about a different list, and nothing on screen would say which is right.
 *
 * A TOTAL THAT IS NO NUMBER HOLDS THE LINES TO NOTHING: money the record could not add into one currency is `null`,
 * and a record that sent none has none. A GAUGE AND A TRACK A ROW HAVE NO LINES, their whole being the one sum.
 * A HEAT'S TOTAL COUNTS THE ROWS NO CELL DRAWS, so a heat that counts is held to its cells and those together, and one
 * that adds a field up with rows outside is not held: what those rows hold is in the total and in no line.
 * MONEY CONVERTED A LINE AT A TIME ROUNDS A LINE AT A TIME, so it is held to within one minor unit a line.
 */
function addsUp(v: unknown, kind: string, sums: boolean, lines: readonly WholeLine[]): boolean {
  const { total, unit, currency, converted } = v as Record<string, unknown>;
  if (typeof total !== 'number' || !Number.isFinite(total)) return true;
  if (kind === 'gauge' || (kind === 'progress' && lines.length === 0)) return true;
  const outside = kind === 'heat' ? (outsideOf(v) ?? 0) : 0;
  if (outside > 0 && sums) return true;
  const named = typeof unit === 'string' ? unit : typeof currency === 'string' ? currency : null;
  if (named !== null && lines.some((l) => l.currency !== undefined && l.currency !== named)) return false;
  if (new Set(lines.map((l) => l.currency ?? '')).size > 1) return false;
  const sum = lines.reduce((n, l) => n + l.value, outside);
  const slack = converted !== undefined && converted !== null ? lines.length : 1e-9 * Math.max(1, Math.abs(total));
  return Math.abs(sum - total) <= slack;
}

/**
 * A SUM KIND'S WHOLE AS THE RECORD ANSWERS IT (`wholeRead`: `{ rows, total, of? }`), narrowed, or `null`.
 *
 * ALL OF IT READS OR NONE OF IT DOES. A line whose sum is not a number, or whose currency is not a word, is not left
 * out and the rest drawn: the bars would add to less than the list and nothing on screen would say so.
 */
function wholeOf(v: unknown, kind: string, sums: boolean): WholeLine[] | null {
  const rows = v !== null && typeof v === 'object' ? (v as { rows?: unknown }).rows : undefined;
  if (!Array.isArray(rows)) return null;
  /* AND THE LABELS PAST THE KERNEL'S CAP ARE PART OF THE WHOLE: two hundred labels drawn and the smallest hundred left
     out add to less than the list with nothing saying so, so they are one line more, last. A HEAT
     HAS NO REST, every day of its twelve weeks being a line, and a rest has no day to be drawn on; nor has a count of
     what is done, whose rest says how many are done and not out of how many. */
  const past = restOf((v as { rest?: unknown }).rest);
  if (past === null || (past.length > 0 && (kind === 'heat' || kind === 'progress'))) return null;
  if (outsideOf(v) === null) return null;
  const lines: WholeLine[] = [];
  for (const r of rows) {
    if (r === null || typeof r !== 'object') return null;
    const { label = null, value, currency: named, unit, parts, of, rows: times, last } = r as Record<string, unknown>;
    /* A TALLY BAR'S COUNT AND NEWEST DAY (`tally:` in the kernel), carried as they were read, and nothing where they were not. */
    const tally = { ...(counted(times) ? { times } : {}), ...(typeof last === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(last) ? { last } : {}) };
    if (label !== null && typeof label !== 'string' && typeof label !== 'number' && typeof label !== 'boolean') return null;
    if (of !== undefined && of !== null && !(typeof of === 'number' && Number.isFinite(of) && of >= 0)) return null;
    /* THE KERNEL NAMES THE CURRENCY `unit`, and a label in currencies it could not add answers `parts`, one amount a currency. */
    const currency = named ?? (typeof unit === 'string' && /^[A-Z]{3}$/.test(unit) ? unit : undefined);
    if (currency !== undefined && currency !== null && typeof currency !== 'string') return null;
    const at = typeof of === 'number' ? { of } : {};
    if (value === null && Array.isArray(parts) && parts.length > 0) {
      for (const p of parts) {
        const { amount, currency: c } = (p ?? {}) as Record<string, unknown>;
        if (typeof amount !== 'number' || !Number.isFinite(amount) || typeof c !== 'string') return null;
        lines.push({ label, value: amount, currency: c, ...at, ...tally });
      }
      continue;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    lines.push({ label, value, ...(typeof currency === 'string' ? { currency } : {}), ...at, ...tally });
  }
  lines.push(...past);
  return addsUp(v, kind, sums, lines) ? lines : null;
}

/**
 * A TALLY BAR'S LINE CARRIES ITS COUNT AND ITS NEWEST DAY in two columns no list has (`TALLY_TIMES`, `TALLY_LAST`), as the
 * rest's line carries its mark, so the bar's drawer says them beside the bar (`barRows`). A line in two currencies is two
 * lines that each carry the label's whole count, and the drawer takes the largest, never the sum.
 */
const tallyFields = (l: WholeLine): Record<string, unknown> => ({ ...(l.times === undefined ? {} : { [TALLY_TIMES]: l.times }), ...(l.last === undefined ? {} : { [TALLY_LAST]: l.last }) });

/** The column a heat's share is written in when the block declares only its day: no list's field, so it is said as written. */
const WHOLE_SHARE = 'share of whole';

/**
 * How many rows a counted whole is laid out as at most; past it the block says it cannot be drawn.
 *
 * IT IS THE MOST ROWS THE RECORD WALKS FOR A WHOLE (`WHOLE_WALK_ROWS` in `kernel/src/pages.ts`), so no count the
 * record answers is refused by it, and a count past it is one no walk arrived at. It was 250,000, five times that,
 * which nothing could reach honestly and which a wrong line could fill on every refresh.
 */
const WHOLE_COUNTED_MOST = 50_000;

/**
 * THE WHOLE'S LINES AS ROWS THE BLOCK'S OWN DRAWER ADDS UP, or `null` where they cannot stand in for the rows.
 *
 * A LINE IS A ROW HOLDING THE TWO COLUMNS THE BLOCK DECLARES, its label and its sum, so the drawer that groups and
 * adds the rows (`blocks.ts`) adds one row a label and arrives at the record's own figure. Money keeps its currency,
 * and a label in two currencies is two lines, which the drawer already refuses to add together.
 * A BLOCK THAT COUNTS (chips, or one with no second column) IS HANDED ITS COUNT AS THAT MANY ROWS, the one row
 * repeated, because its drawer counts rows and a line counted once would say every label holds one.
 * A HEAT'S SHARE IS WRITTEN IN ITS VALUE, `3 of 12`, which is how the renderer reads a day set against its whole
 * (`render/src/heat.ts`), in the block's second column or, where it declares only its day, in `WHOLE_SHARE`.
 * A LINE IS NO ROW OF THE LIST, so it carries no number: nothing drawn from it opens a row (`withRefs`).
 * THE REST'S LINE HOLDS NO LABEL AND THE DRAWER'S MARK (`REST_MARK`), a column no list has, so it is said as the drawer
 * says it and never as a value of the field.
 * A THIRD COLUMN IS NOT IN THE LINES: a progress drawn against each row's target has no target to read here.
 */
function wholeRows(kind: string, columns: readonly { field?: unknown }[], lines: readonly WholeLine[]): Row[] | null {
  const [by, of] = columns.map((c) => (typeof c.field === 'string' ? c.field : ''));
  if (!by || columns.length > 2) return null;
  const shares = kind === 'heat' && lines.some((l) => l.of !== undefined);
  const counts = kind === 'chips' || (!of && !shares);
  if (shares && lines.some((l) => l.of === undefined)) return null;
  /* THE COUNTS ARE ADDED UP BEFORE A ROW IS LAID OUT, so a whole past the bound is refused having built nothing. */
  if (counts) {
    let all = 0;
    for (const l of lines) {
      if (!Number.isInteger(l.value) || l.value < 0) return null;
      if ((all += l.value) > WHOLE_COUNTED_MOST) return null;
    }
  }
  const rows: Row[] = [];
  for (const l of lines) {
    const row = (fields: Record<string, unknown>): Row => ({ id: '', seq: null, fields, version: 0, created_at: '' });
    if (!counts) {
      const sum = shares ? `${l.value} of ${l.of}` : l.currency ? { amount: l.value, currency: l.currency } : l.value;
      rows.push(row({ [by]: l.label, [of || WHOLE_SHARE]: sum, ...(l.rest ? { [REST_MARK]: true } : {}), ...tallyFields(l) }));
      continue;
    }
    const one = row({ [by]: l.label, ...(l.rest ? { [REST_MARK]: true } : {}) });
    for (let i = 0; i < l.value; i++) rows.push(one);
  }
  return rows;
}

/** A block's `fold:` as the app reads it: `true`, or a whole number of cards above nought. Anything else is no fold. */
const foldOf = (v: unknown): boolean | number | undefined => (typeof v === 'boolean' || (typeof v === 'number' && Number.isInteger(v) && v > 0) ? v : undefined);

/**
 * The roles a DECLARATION may give a column, which are the roles `declare.ts` admits (`CARD_ROLES` there).
 *
 * `braindog-render`'s own `CARD_ROLES` has one more, `quiet`, and its comment says why it is not one of
 * these: the evaluator writes `quiet` from the record's clock, and a declaration does not name it.
 *
 * `next` AND `reply` CAME WITH THE CARD ROLES, AND THIS LIST DROPPED BOTH. The kernel admitted them and answered `nexts`, the
 * renderer drew "Next: ...", and a card declared `{ field: 'what', as: 'next' }` reached the fence as `fact: Next` over
 * the card's own `what`: "The first piece" where the record had answered "Sample the fit" (`dynamic-app.test.ts`).
 * `scope` is not a role either. It says what the cell HOLDS, which this file settles from `scopes`
 * before anything is drawn, so it is not carried onto the column.
 *
 * A WORD THAT IS NEITHER IS DROPPED RATHER THAN ASSERTED. The record refuses one at install, so this
 * is the second half of a check rather than the only one, and `as Column[]` was the app promising a
 * closed set about a string it had not looked at.
 */
const ROLES = ['title', 'figure', 'fact', 'trend', 'ring', 'who', 'when', 'mark', 'next', 'reply', 'hue', 'picture', 'chip'] as const;
const roleOf = (v: unknown): (typeof ROLES)[number] | undefined => ROLES.find((r) => r === v);

/** The field types a declared column ends by default: counts and amounts. */
const ENDS = new Set(['money', 'int', 'decimal', 'duration']);

const columnsOf = (b: Answered) => {
  /* THE REGISTER SAYS WHICH COLUMNS ARE FIGURES, AND UNTIL NOW THIS PATH GUESSED FROM THE NAME.
     It matched `amount` or `cost`, which are the only two money fields any page currently
     declares, so nothing on screen was wrong. It was one pack away from being wrong in both
     directions: `revenue` and `rate` are declared money and were drawn as ordinary text, and a
     text field called `cost_centre` would have been drawn as a figure.

     THE COST IS NOT ONLY AN ELLIPSIS. A truncated figure reads as a smaller number rather than as
     damage (13 §4.2), and `truncate: 'never'` is also how `cardPlan` and `cardRoles` pick which
     column is a card's figure, so a money column this missed was demoted to a fact on every phone.

     The sample path was fixed in `d666678` to ask `decl`. This asks the same function rather than
     a second copy of the same guess, which is how the two halves came to disagree in the first
     place. A block over no register has nothing to ask and truncates as the text it is drawn as. */
  const register = registerOf(b) ?? '';
  return (b.columns ?? []).map((c) => {
    /* A SCOPE COLUMN ON A CARD IS A FACT: the cell says where the row applies, filled from `scopes` below, and the
       renderer draws it as a chip from the block's `scopeCells`. */
    const as = c.as === 'scope' && b.kind === 'cards' ? 'fact' : roleOf(c.as);
    return {
      field: c.field,
      /* A card's trend column reads a `metric:` and names no field, so with no label of its own it is headed by nothing. */
      label: columnHeading(register, { field: c.field ?? '', label: str(c.label) }),
      width: c.width ?? 'minmax(12ch,1fr)',
      /* A FIGURE ENDS ITS COLUMN WHERE THE PAGE SAYS NOTHING (2 Nov): the Errors page's Events and People sat at the start
         of their columns, so 412 and 6 did not line up by their units. Counts and amounts end, as a list's do; a date
         keeps where the page put it, since a dated column often opens the row. */
      align: c.align ?? (ENDS.has(fieldOf(register, c.field)?.type ?? '') ? ('end' as const) : ('start' as const)),
      truncate: fieldOf(register, c.field)?.type === 'money' ? ('never' as const) : ('end' as const),
      ...(as === undefined ? {} : { as }),
      /* A COLUMN DECLARED `named` SAYS ITS NAME ON A PHONE CARD TOO (`Column.named`). */
      ...(c.named === true ? { named: true } : {}),
      /* THE SECOND FIELD RIDES ALONG (`toRows` reads it where the first holds nothing): dropped here, no live page ever read it. */
      ...(typeof c.or === 'string' ? { or: c.or } : {}),
    };
  });
};

/**
 * One figure of a `stat` block, as a tile.
 *
 * THE VERDICT IS THE RECORD'S (`met`), and a figure over an empty list carries none, because a tick
 * over an empty list is a verdict on nothing. The label, the format and the target line are the
 * declaration's.
 *
 * AN EMPTY LIST IS `held === 0` AND NOT `rows === 0`, and the difference is the whole of it. `rows` is
 * what the predicate matched and `held` is what the list holds at all, so nothing overdue over forty
 * invoices and nothing overdue over a list nobody has written to came through here as the same tile.
 * This is the renderer the live pages use, `/p/<slug>` among them, and it was the one left keying off
 * `rows` after `news-live.ts` was moved: driven in `engines.test.ts` over one kernel reading,
 * `{rows: 0, held: 40}`, Home answered `tone: "good"` with a link and this answered no verdict and no
 * link. One figure, two screens, two answers — and the project page is the screen the kernel's own
 * narrowing of `held` was written for, so it was the screen most likely to be asked.
 *
 * AND THERE IS A THIRD STATE BETWEEN THOSE TWO, which `unsaid` below is: a list that holds rows where
 * not one of them carries the field the figure adds up. Its own paragraph says what that drew.
 */
/** The four aggregations that reduce a FIELD to one number. A count reads rows and is not one of them. */
const REDUCING = ['sum', 'avg', 'min', 'max'] as const;

/** The fields a figure adds up, averages or takes a bound of, both halves of a pair included. */
function reducedFields(value: MetricDecl['value']): string[] {
  const halves: unknown[] = 'diff' in value ? [value.diff.of, value.diff.per] : 'ratio' in value ? [value.ratio.of, value.ratio.per] : [value];
  return halves.flatMap((half) => {
    const said = isObject(half) ? half : {};
    return REDUCING.flatMap((word) => {
      const operand = said[word];
      if (typeof operand === 'string') return [operand];
      /* A ROW-LEVEL PRODUCT reduces over the field it multiplies, which is the first half of `product`. */
      const product = isObject(operand) && Array.isArray(operand.product) ? operand.product[0] : null;
      return typeof product === 'string' ? [product] : [];
    });
  });
}

/**
 * WHETHER A FIGURE'S OWN PREDICATE REQUIRES THE FIELD IT REDUCES OVER TO BE FILLED IN.
 *
 * THIS IS THE LINE BETWEEN THE TWO ZEROES, and it is narrow on purpose. `out-30d` sums `amount`
 * where the obligation is open and due inside a month: nothing matched over forty obligations is
 * GBP 0.00 owed, which is the answer that figure exists to give, and it keeps its verdict and its
 * door. `projects-earning` sums `revenue` where `revenue is set`: nothing matched means no row
 * carries the number being added up, so its zero is the absence of an answer rather than one.
 *
 * `compile` IS ASKED RATHER THAN THE SENTENCE BEING READ A SECOND TIME. The same rule written twice
 * is what `metrics.ts` and the kernel's `scopeOf` are still paying for (`50 §1`), and the grammar
 * spells this clause three ways, `is set`, `is present` and `is not empty`, all of which compile to
 * one `present` clause. A register the app has no declaration for compiles to no clauses, so the
 * tile answers as it did before rather than guessing.
 */
function overUnsaidField(decl: MetricDecl): boolean {
  const register = decl.source.startsWith('register.') ? decl.source.slice('register.'.length) : null;
  if (register === null) return false;
  const reduced = reducedFields(decl.value);
  if (reduced.length === 0) return false;
  return compile(register, decl.where).clauses.some((c) => c.op === 'present' && reduced.includes(c.field));
}

const isTarget = (v: unknown): v is { lte: number } | { gte: number } =>
  typeof v === 'object' && v !== null && (typeof (v as { lte?: unknown }).lte === 'number' || typeof (v as { gte?: unknown }).gte === 'number');

/**
 * The entries behind a reading, by handle, as a tile carries them: only where the record named at least one, so a figure
 * from a record that sends none says nothing rather than "backed by nothing". Home reads it to say two figures of one
 * amount once where a single entry backs both (`lib/home/default-home.ts` `oneBacks`).
 */
function backsOf(r: Reading): { backs?: string[] } {
  const held = Array.isArray(r.backs) ? r.backs.filter((h): h is string => typeof h === 'string' && h !== '') : [];
  return held.length ? { backs: held } : {};
}

/**
 * A TILE'S FIGURES SAY THE DAY OF THEIR RATES ONCE, under the last that was converted at them: Today's money tile said
 * "Converted at rates as of 28 Sep 2026." under each of its three figures. A sentence about a rate that is missing is
 * the figure's own, and stays under it.
 *
 * AND NOT AT ALL WHERE ANOTHER FIGURE OF THE TILE ALREADY NAMES THE RATE: Cash now says "at 2 Sep's rate, 1 day old"
 * with its Update, and "Converted at rates as of 2 Sep 2026." under Going out beside it said the same day twice.
 */
export function onceATile(metrics: Metric[]): Metric[] {
  const RATED = /(?:^| · )(Converted at rates as of [^·]*?\.)$/u;
  const last = new Map<string, number>();
  metrics.forEach((m, i) => {
    const said = RATED.exec(m.note ?? '')?.[1];
    if (said) last.set(said, i);
  });
  const named = metrics.some((m) => /\brates?\b/iu.test((m.note ?? '').replace(RATED, '')));
  return metrics.map((m, i) => {
    const said = RATED.exec(m.note ?? '')?.[1];
    if (!said || (!named && last.get(said) === i)) return m;
    return { ...m, note: (m.note ?? '').slice(0, -said.length).replace(/ · $/u, '') };
  });
}

/** A figure converted at rates that are out of date: the one thing a page says at its foot and not under the figure. */
const staleRead = (r: Reading | null | undefined): r is Reading & { fx: FxRead & { asOf: string } } => !!r && !r.parts && !!r.fx?.stale && typeof r.fx.asOf === 'string';

/**
 * `stale` IS WHERE "THESE RATES ARE OUT OF DATE" IS SAID. `tile` is under the figure, which is right wherever a tile is
 * drawn alone (Home, the palette, the news). `foot` is a page, which says it once under everything (`footed`): the tile
 * there still names the day its rates are from, and leaves the rest to the foot.
 */
export function tileOf(
  cell: NonNullable<Answered['readings']>[number],
  values?: Record<string, unknown>,
  missed: 'warn' | 'bad' | 'info' = 'warn',
  stale: 'tile' | 'foot' = 'tile',
): Metric {
  const at = cell.metric.indexOf(':');
  const template = METRICS[at < 0 ? cell.metric : cell.metric.slice(0, at)];
  const built = template && at >= 0 ? withParam(template, cell.metric.slice(at + 1)) : template;
  /* THE TARGET IS THE RECORD'S, which a use case may have set for a person (`install.ts` `MODULE_TARGETS`); the build's
     declaration only says it when the record did not. */
  const held = (cell as { target?: unknown }).target;
  const decl = built && isTarget(held) ? { ...built, target: held } : built;
  const label = str(cell.label) ?? decl?.name ?? cell.metric;
  /* THE FORMAT THE RECORD SENT WITH THE FIGURE, for a pack's metric this build holds no declaration of. */
  const declared = typeof (cell as { format?: unknown }).format === 'string' ? ((cell as { format?: unknown }).format as string) : undefined;
  const r = cell.reading;
  /* A FIGURE IN SEVERAL CURRENCIES IS EACH AMOUNT IN ITS OWN, never a blank, and says why it is not one number. */
  /* ON A PAGE, RATES OUT OF DATE ARE THE FOOT'S TO SAY, WITH THE RATE AND ITS AGE (`footed`), so a tile converted at them
     says nothing of them: "Converted at rates as of 28 Sep 2026." stood under three tiles and over a foot that said it
     again. A tile converted at current rates still says their day, once a tile (`onceATile`). */
  const across = !r ? null : stale === 'foot' && staleRead(r) ? null : fxNote(r);
  const said = (fallback: string) =>
    typeof cell.note === 'string'
      ? noteOf(cell.note, (id) => {
          const v = values?.[id];
          if (typeof v === 'number') return format(METRICS[id]?.format, v);
          return resolverOf(values)(id);
        })
      : fallback;
  if (r && r.parts && !cell.refusal && r.refusals.length === 0)
    return { id: cell.metric, label, value: partsShown(decl?.format, r.parts), note: [said(''), across].filter(Boolean).join(' · '), ...backsOf(r) };
  /* MONEY THAT OUTLASTS THE WALK IS AN ANSWER, not a figure nobody could work out: no dash, no warning, and no verdict,
     because nothing was measured against a target. The cell's own note is left out: it names the same walk's other
     figure, which has no value either. */
  const lasts = r && r.value === null && !cell.refusal && r.refusals.length === 0 ? beyondOf(r) : null;
  if (lasts !== null) return { id: cell.metric, label, value: /^lasts\b/iu.test(label) ? copy.pastDay(lasts) : copy.lastsPast(lasts), note: '' };
  if (!r || r.value === null || cell.refusal || r.refusals.length)
    return { id: cell.metric, label, value: MISSING, note: copy.figureUnavailable, tone: 'warn' };
  const empty = (r.held ?? r.rows) === 0;
  /**
   * AND THE STATE BETWEEN THE TWO: THE LIST HOLDS ROWS, AND NOT ONE OF THEM HAS SAID.
   *
   * The rule above is the kernel's, written for a COUNT, and its own words are that zero matched
   * over rows that exist is good news (`packages/kernel/src/metrics.ts`). A REDUCING figure turns
   * that sentence over. A sum of no values is zero and the kernel means it to be, so `GBP 0.00` is
   * the same number whether a portfolio earned nothing or nobody has written down what it earns,
   * and `target: { gte: 0 }` on a money sum is met by every value such a sum can take, which is the
   * decoration a target is refused at install for being. So `met: true` carried no measurement and
   * the tile drew a tick anyway.
   *
   * MEASURED AT HIS SIZE, on a record built to it: 27 projects, 14 in
   * play, a monthly figure held for three of them and `revenue` unset on every row, because the
   * importer files a monthly figure as a reading and has no year to write. After `a89bc072` put
   * `revenue is set` on the Earning figures the reading is `rows: 0, held: 27`, and this renderer
   * answered `tone: "good"` with `href: /r/things?f=lane:in:building,earning&f=revenue:is:set` —
   * a green GBP 0.00 with a door into a list of no rows, on the first screen he opens about his
   * portfolio, in the same block row as a bar correctly drawing "No project in play says what it
   * earns." One page, two blocks, two answers.
   *
   * THE TONE AND THE DOOR GO AND THE SENTENCE ARRIVES, which is what `api.ts` already does for the
   * empty register a few lines from its own `held === 0`. The figure itself stays: a total of
   * nothing is zero, and it is the verdict on it that was invented.
   */
  /* AND THE RECORD'S OWN WORD FOR IT FIRST (`reading.unsaid`), so it never waits on this tab having the list's schema:
     a phone read Today before the transactions schema had come, could not compile the figure's `tax_part is set`, and
     drew "Set aside this year £0" where the laptop left it out and led with "Due £26,520" (add-ons pass 3, 2 Nov). */
  const unsaid = !empty && r.rows === 0 && ((r as { unsaid?: unknown }).unsaid === true || (decl !== undefined && overUnsaidField(decl)));
  /* A FLOOR OF NOUGHT MARKS ONLY ITS MISS (`markOf`): "Oldest balance 3 Sep" and "To pay on the card £1,240" drew a tick. */
  const met = empty || unsaid ? null : markOf(decl, r.met);
  /* NO DOOR OVER NO ROWS, AND NONE FOR A FIGURE THAT READS NO LIST: `hrefFor` answers `null` there, where it used to
     answer Money's page on every record. */
  const door = decl && !empty && !unsaid ? hrefFor(decl) : null;
  /* THE LINE IS THE RECORD'S SERIES, and only numbers and gaps are drawn: anything else is not a day. */
  const trend = Array.isArray(cell.trend) && cell.trend.every((v) => v === null || (typeof v === 'number' && Number.isFinite(v))) ? (cell.trend as (number | null)[]) : undefined;
  /* A TREND AHEAD IS THE WALK FROM TODAY (`cells[].ahead`), and its note says the lowest it reaches and on which day. */
  const ahead = trend ? aheadOf((cell as { ahead?: unknown }).ahead) : null;
  /* THE LOWEST SAID AS FORECAST SAYS IT (live check of 30 October, 18): whole money to the unit, and "today" or the day
     as "29 Oct". Money and Today read "Lowest EGP 682,000 on Thu 29 Oct" where Forecast read "Lowest EGP 682,316 today". */
  const lowest = ahead && trend ? copy.cashLowest(wholeAmount(ahead.low.value, ahead.currency), lowDaySaid(ahead.low.day), aheadWindowSaid(trend.length - 1)) : '';
  return {
    id: cell.metric,
    label,
    ...(trend ? { trend } : {}),
    ...(ahead ? { ahead } : {}),
    /* A CURRENCY CODE IS MONEY AND ANY OTHER UNIT IS A QUANTITY. Every unit went to `money`, so a
       sum of 150 kg drew `KG 1.50` and 12.5 hours drew `H 0.13`. */
    value: !r.unit
      ? format(decl?.format ?? declared, r.value)
      : /^[A-Z]{3}$/u.test(r.unit)
        ? /* A TILE'S MONEY IN WHOLE UNITS (recheck of 30 October, 34): "Left over −£9,762.16" stood beside "£930" and
             "£10,692". The Ledger and the tables keep their pennies. */
          wholeMoneyIn(money(Math.round(r.value), r.unit))
        : quantity(r.value, r.unit),
    /* A NOTE THE CELL DECLARES is said instead of the target, each figure it names formatted as declared, and a converted
       figure says as of which day's rates. */
    /* THE DOT STAYS WITH THE FACT BEFORE IT (T1), so a wrapped note starts its second line with a fact, not a dot. */
    /* AND A FACT THAT ENDS ON A FULL STOP LETS IT GO BEFORE THE DOT (domains lane, 2 Nov): "(179 days). · Lowest" was two
       stops in a row. The last keeps its own. */
    note: [said(unsaid ? liveWords.unsaid : decl ? targetSaid(decl, r) : ''), lowest, across]
      .filter((part): part is string => Boolean(part))
      .map((part, i, all) => (i < all.length - 1 ? part.replace(/\.\s*$/u, '') : part))
      .join('\u00a0· '),
    /* A MISSED TARGET IS AMBER, and red only on a tile its page declared `bad`: the day the cash runs out. AND CASH NOW
       UNDER NOTHING, the one figure that is red wherever it is drawn: money below nought is the thing that needs the person. */
    tone: met === null ? undefined : met ? 'good' : cell.metric === 'cash-now' && r.value < 0 ? 'bad' : missed,
    ...(door ? { href: door } : {}),
    /* AND IT SAYS SO, so a page being read leaves the tile out: "Earning £0" over projects none of which says what it
       earns is no figure at all. A page being arranged still draws it, with the sentence. */
    ...(unsaid ? { unsaid: true } : {}),
    /* AND A FIGURE OVER A LIST THAT HOLDS NOTHING SAYS THAT TOO, only where the record counted it (`held`): an empty Work
       drew "Done in 7 days 0" under eight tiles each saying the list held nothing. */
    ...(r.held === 0 ? { nothingHeld: true } : {}),
    /* AND A FIGURE THAT ADDED UP NO ROW SAYS SO, so a widget on Today over nothing but such figures says its `empty:`. */
    ...(r.rows === 0 ? { readNone: true } : {}),
    /* AND MONEY THAT ADDED UP NO ROW TO NOUGHT SAYS SO, so a page being read leaves its "$0" tile off (`noughtOverNone`
       in the kernel's `drawn.ts`; leftovers9, Sam 2 Nov: "remove any $0 cards"). */
    ...(r.rows === 0 && r.value === 0 && typeof r.unit === 'string' && /^[A-Z]{3}$/u.test(r.unit) && (r as { beyond?: unknown }).beyond === undefined ? { noughtOverNone: true } : {}),
    /* AND WHAT BACKS IT, so two figures of one entry are said once and two of one amount are not. */
    ...backsOf(r),
  };
}

const text = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const count = (v: unknown): number => (typeof v === 'number' ? v : 0);
const STATES: readonly ActionRow['state'][] = ['pending', 'firing', 'paused', 'done'];

/** A trend ahead as the record answers it (`readings[].ahead`), or `null` for one behind or one that is not whole. */
function aheadOf(v: unknown): NonNullable<Metric['ahead']> | null {
  if (v === null || typeof v !== 'object') return null;
  const { from, currency, low } = v as { from?: unknown; currency?: unknown; low?: { day?: unknown; value?: unknown } | null };
  if (typeof from !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(from) || typeof currency !== 'string' || !/^[A-Z]{3}$/u.test(currency)) return null;
  if (!low || typeof low.day !== 'string' || typeof low.value !== 'number' || !Number.isFinite(low.value)) return null;
  return { from, currency, low: { day: low.day, value: low.value } };
}

/** Each money column of a table's rows said as one set (`barFigures`), in place. */
function moneySets(register: string, columns: readonly { field?: unknown }[], rows: { cells: (string | null)[] }[]): void {
  const fields = REGISTERS[register]?.fields ?? [];
  columns.forEach((c, i) => {
    if (typeof c.field !== 'string') return;
    const type = fields.find((f) => f.id === c.field)?.type;
    const at = rows.flatMap((r, n) => (typeof r.cells[i] === 'string' && r.cells[i] !== '' ? [n] : []));
    /* A LIST'S MONEY FIELD, OR A COLUMN NO LIST DECLARES (what falls due, across lists) whose every cell is money. */
    const money = type === 'money' || (type === undefined && at.length > 0 && at.every((n) => /\p{Sc}|\b[A-Z]{3}\b/u.test(rows[n]!.cells[i] as string) && /\d/u.test(rows[n]!.cells[i] as string)));
    if (!money) return;
    const said = barFigures(at.map((n) => rows[n]!.cells[i] as string), undefined, true);
    at.forEach((n, k) => (rows[n]!.cells[i] = said[k]!));
  });
}

/** A card's cost, price or fee figure of nought, said as "Free": only a money field named for what something costs. */
function freeSaid(register: string, columns: readonly { field?: unknown; as?: unknown }[], entries: readonly Entry[], rows: { cells: (string | null)[] }[]): void {
  const fields = REGISTERS[register]?.fields ?? [];
  columns.forEach((c, i) => {
    if (c.as !== 'figure' || typeof c.field !== 'string' || !/^(cost|price|fee)$/u.test(c.field)) return;
    if (fields.find((f) => f.id === c.field)?.type !== 'money') return;
    entries.forEach((e, n) => {
      const v = e.fields[c.field as string] as { amount?: unknown } | null | undefined;
      if (rows[n] && v && typeof v === 'object' && v.amount === 0) rows[n]!.cells[i] = 'Free';
    });
  });
}

/** The words a ledger line waiting to clear wears under its name. */
export const WAITING_TO_CLEAR = 'Waiting to clear';

/**
 * Each ledger line of a timeline still waiting to clear, marked in the line under its name: its account cell (the
 * second of the two the line under reads, `TIMELINE_UNDER` in braindog-render) says the words in place of the account,
 * so they fit a phone's line ("2 Sep · Production · Waiting to clear"); the first is the category, which picks the
 * line's chip, so it stays. Only a list of money moved (one with an account and an amount) whose state field holds
 * `pending`.
 */
export function pendingSaid(register: string, columns: readonly { field?: unknown }[], entries: readonly Entry[], rows: { cells: (string | null)[] }[]): void {
  const state = REGISTERS[register]?.state;
  const at = columns.findIndex((c) => c.field === 'account');
  if (!state || (at !== 3 && at !== 4) || !columns.some((c) => c.field === 'amount')) return;
  entries.forEach((e, n) => {
    const row = rows[n];
    if (!row || e.fields[state] !== 'pending') return;
    row.cells[at] = WAITING_TO_CLEAR;
  });
}

/**
 * A ROW DUE SOON SAYS WHEN IN ITS DUE CELL, AND WEARS NO AMBER DOT (polish-i, PI3): a page's table drew "Corporation tax,
 * payment on account · 7 Sep" with an orange dot and no word, where a list's card says "Due in 4 days" and its table
 * dropped the amber (P24). The cell of the list's deadline says "Due today", "Due tomorrow" or "Due in N days", the
 * card's words, and the row's `warn` goes, since the words say it. A table that does not draw the deadline is calm as a
 * list is: a dot with no word beside it said nothing a reader could read. A late row keeps its red.
 */
export function soonSaid(register: string, columns: readonly { field?: unknown }[], entries: readonly Entry[], rows: { cells: (string | null)[]; tone?: string | undefined }[], now: number): void {
  const dated = REGISTERS[register]?.fields.find((f) => f.type === 'day' && f.deadline)?.id;
  const at = dated === undefined ? -1 : columns.findIndex((c) => c.field === dated);
  entries.forEach((e, n) => {
    const row = rows[n];
    if (!row || row.tone !== 'warn') return;
    delete row.tone;
    const due = dated === undefined ? undefined : e.fields[dated];
    if (at < 0 || typeof due !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(due)) return;
    /* FROM THE RECORD'S DAY, NOT GREENWICH'S (AH22): at 01:52 in Cairo an order due Friday said "Due in 7 days". */
    const days = Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${recordToday(now)}T00:00:00Z`)) / 86_400_000);
    row.cells[at] = days <= 0 ? DUE_WORDS.today : days === 1 ? DUE_WORDS.tomorrow : DUE_WORDS.inDays(days);
  });
}

/** A close deadline's words, as a list's card says them (`RowCards.svelte`). */
export const DUE_WORDS = {
  today: 'Due today',
  tomorrow: 'Due tomorrow',
  inDays: (n: number): string => `Due in ${n} days`,
} as const;

/** An amount ahead in whole units, as Forecast says its lowest: never rounded to three figures beside it. */
function wholeAmount(minor: number, currency: string): string {
  const exp = exponentOf(currency);
  const whole = Math.round(minor / 10 ** exp) * 10 ** exp;
  return moneyWhole(whole, currency, homeCurrency())?.text ?? money(whole, currency);
}

/**
 * How far a walk ahead looks, from its days (the trend is today and then the end of each day): "12 weeks" when it is
 * whole weeks, as Today says its window, else "30 days".
 */
export function aheadWindowSaid(days: number): string {
  if (days >= 14 && days % 7 === 0) return `${days / 7} weeks`;
  return days === 1 ? '1 day' : `${days} days`;
}

/** The day of a lowest point as Forecast says it: "today", else "on 29 Oct", with its year only when it is not this one. */
function lowDaySaid(day: string): string {
  const today = recordToday();
  if (day.slice(0, 10) === today) return 'today';
  return `on ${shortDay(day.slice(0, 10), today)}`;
}

/** One row of an `actions` block, back in the shape the actions read gives "Runs on". */
export function actionOf(fields: Record<string, unknown>): ActionRow {
  const at = text(fields.last_at);
  const state = STATES.find((s) => s === fields.state) ?? 'pending';
  return {
    ingest: String(fields.ingest ?? ''),
    channel: fields.channel === 'pull' || fields.channel === 'call' ? fields.channel : 'poll',
    project: text(fields.project),
    host: text(fields.host),
    every: String(fields.every ?? ''),
    key: text(fields.key),
    state,
    next: text(fields.next),
    last: at
      ? { at, outcome: (text(fields.last_outcome) ?? 'ok') as Outcome, status: typeof fields.last_status === 'number' ? fields.last_status : null, note: text(fields.last_note) ?? '' }
      : null,
    month: { runs: count(fields.runs), requests: 0, bytes: 0, failures: count(fields.failures), held: 0 },
    days: [],
  };
}

/** The four intents a row may carry, as `schema.ts` spells them and `05 §7.4` publishes them. */
const TONE_WORDS = ['good', 'warn', 'bad', 'info'] as const;

/**
 * The rows somebody WROTE on a block, when they are rows a renderer can draw.
 *
 * `05 §2` makes authored rows the norm in the dialect, and `declare.ts` does not check them: a pack
 * declaring `authored: "two"`, or one row of it without a `cells` list, installs cleanly and reaches
 * `r.cells.map(escapeCell)`. A row that is not the shape the app's type promises is left out, so the
 * block draws the rows that ARE rows instead of the page failing on the one that is not.
 */
function authoredOf(v: unknown): PageBlock['authored'] {
  if (!Array.isArray(v)) return undefined;
  const rows = v.flatMap((r) => {
    const said = r !== null && typeof r === 'object' ? (r as { cells?: unknown; tone?: unknown }) : null;
    if (!Array.isArray(said?.cells)) return [];
    const cells = said.cells.filter((c): c is string => typeof c === 'string');
    if (cells.length !== said.cells.length) return [];
    const tone = TONE_WORDS.find((t) => t === said.tone);
    return [{ cells, ...(tone === undefined ? {} : { tone }) }];
  });
  return rows.length ? rows : undefined;
}

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStep = (v: unknown): v is WalkStep =>
  isObject(v) && typeof v.day === 'string' && typeof v.label === 'string' && Number.isFinite(v.delta) && Number.isFinite(v.balance) && typeof v.source === 'string';

/** A `series` block's `bars`, when they are what the record's `barsOf` sends: every line as long as the keys. */
function barsOf(v: unknown): Bars | null {
  if (!isObject(v) || !Array.isArray(v.keys) || !v.keys.every((k) => typeof k === 'string')) return null;
  const n = v.keys.length;
  const cell = (x: unknown) => x === null || (typeof x === 'number' && Number.isFinite(x));
  if (!Array.isArray(v.values) || !v.values.every((line) => Array.isArray(line) && line.length === n && line.every(cell))) return null;
  if (!Array.isArray(v.states) || v.states.length !== n || !v.states.every((s) => s === '' || s === 'partial' || s === 'due' || s === 'ahead')) return null;
  if (!isBucket(v.bucket) || typeof v.current !== 'string') return null;
  /* ONE CHART A CURRENCY, when the record lined the lines up once per currency: each as long as the keys, or none. */
  const split = Array.isArray(v.split)
    ? v.split.filter((t): t is { unit: string; values: (number | null)[][] } =>
        isObject(t) && typeof t.unit === 'string' && Array.isArray(t.values) && t.values.every((line) => Array.isArray(line) && line.length === n && line.every(cell)),
      )
    : [];
  return {
    bucket: v.bucket,
    current: v.current,
    keys: v.keys,
    states: v.states,
    values: v.values,
    unit: typeof v.unit === 'string' ? v.unit : null,
    ...(split.length > 0 ? { split } : {}),
  };
}

/** A forecast's remembered points, when they are points: a day and a number each. Anything else is none. */
function pastOf(v: unknown): { at: string; value: number }[] | null {
  if (!Array.isArray(v)) return null;
  return v.filter((p): p is { at: string; value: number } => isObject(p) && typeof p.at === 'string' && typeof p.value === 'number' && Number.isFinite(p.value));
}

/** A `forecast.runway` block's `walk`, when it is one. The record builds it; a record on another build may not have. */
function walkOf(v: unknown): Walk | null {
  if (!isObject(v) || !Array.isArray(v.steps) || !v.steps.every(isStep) || !Number.isFinite(v.from)) return null;
  return {
    from: v.from as number,
    currency: typeof v.currency === 'string' ? v.currency : null,
    steps: v.steps,
    crossed: isStep(v.crossed) ? v.crossed : null,
    /* A WALK OF SEVERAL, one a currency, carries its own remembered cash. */
    ...(pastOf(v.past) ? { past: pastOf(v.past)! } : {}),
    /* THE WALK'S OWN LENGTH, `horizon: 'last'` resolved (kernel's `Runway.horizon`), for the horizon knob's readout. */
    ...(typeof v.horizon === 'number' ? { horizon: v.horizon } : {}),
    /* AND HOW FAR IT WALKED PAST THAT, which the length control offers up to (`reach` rows, `blocks.ts`). */
    ...(typeof v.reach === 'number' && Number.isInteger(v.reach) && v.reach > 0 ? { reach: v.reach } : {}),
    /* WHAT THE EVERYDAY LEG MEASURED (kernel's `Runway.everyday`), which `forecastRows` writes as `spent` and `known`. */
    ...(Array.isArray(v.everyday) ? { everyday: v.everyday } : {}),
  };
}

/** The longest key a block or a look may carry: a key is a handle, never a paragraph. */
const KEY_MOST = 160;

/** A block's key as the record answered it, when it is one: short text with something in it. */
export function keyOf(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' && v.length <= KEY_MOST ? v : null;
}

/** Keys as the record answered them, each once, in its order; anything that is not a key is left out. */
const keysOf = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.map(keyOf).filter((k): k is string => k !== null))] : []);

const LOOK_BY: readonly LiveLook['by'][] = ['rule', 'slash', 'owner'];

/**
 * A page's look as the record answered it, or `null` where it sent none or one this build cannot read. One with no
 * `by` is none: who arranged a page is what decides whether a person is offered Undo, and a guess at it would offer
 * Undo on the person's own arrangement.
 */
export function lookOf(v: unknown): LiveLook | null {
  if (!isObject(v)) return null;
  const by = LOOK_BY.find((w) => w === v.by);
  if (!by) return null;
  const said = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x.trim() : null);
  const next = isObject(v.next) && keyOf(v.next.row) !== null && said(v.next.text) !== null ? { row: v.next.row as string, text: said(v.next.text)! } : null;
  return {
    page: typeof v.look === 'string' && /^[a-z][a-z0-9_-]{0,63}$/u.test(v.look) ? v.look : null,
    basis: said(v.basis),
    lead: keyOf(v.lead),
    order: keysOf(v.order),
    hide: keysOf(v.hide),
    headline: said(v.headline),
    next,
    pinned: keysOf(v.pinned),
    by,
    kept: said(v.kept),
    ...(isObject(v.span) ? { span: v.span as Record<string, number> } : {}),
    ...(isObject(v.area) ? { area: v.area as Record<string, 'main' | 'rail'> } : {}),
    ...(isObject(v.group) ? { group: v.group as Record<string, string> } : {}),
    ...(typeof v.at === 'string' ? { at: v.at } : {}),
  };
}

const FEED_BY: readonly FeedRow['by'][] = ['agent', 'rule', 'you'];
const textOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string';

/** A day as the record writes one, which is the only thing a feed's day heading is made from. */
const FEED_DAY = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * An `activity` block's `feed`, when every row is one the renderer can file under a group.
 *
 * `day` AND `run_more` ARE CHECKED AS THE REST ARE (a feed that says `group: day` or `fold: run`): a heading made from
 * something that is no day, or "and NaN more", is worse than a block that says it cannot be drawn.
 */
export function feedOf(v: unknown): FeedRow[] | null {
  if (!Array.isArray(v)) return null;
  const ok = v.every(
    (r) =>
      isObject(r) && FEED_BY.includes(r.by as FeedRow['by']) && Number.isFinite(r.count) && typeof r.at === 'string' &&
      textOrNull(r.who) && textOrNull(r.kind) && textOrNull(r.target) && textOrNull(r.note) && (r.thing === undefined || textOrNull(r.thing)) &&
      (r.things === undefined || (Array.isArray(r.things) && r.things.every((t) => typeof t === 'string'))) &&
      (r.day === undefined || (typeof r.day === 'string' && FEED_DAY.test(r.day))) &&
      (r.run_more === undefined || (Number.isSafeInteger(r.run_more) && (r.run_more as number) >= 0)),
  );
  return ok ? (v as FeedRow[]) : null;
}

/**
 * A `queue` block's questions, when every one of them is a question a person can be shown.
 *
 * Checked field by field for the reason `feedOf` is: what arrives here is whatever a record sent, and
 * a question drawn with `undefined` where its options should be is worse than a block that says it
 * cannot be drawn. An option missing any of its four parts drops the whole question rather than the
 * option, because a choice that quietly lost one of its ways to answer is a different choice.
 */
function queueOf(v: unknown): QueueQuestion[] | null {
  if (!Array.isArray(v)) return null;
  const ok = v.every(
    (q) =>
      isObject(q) &&
      typeof q.id === 'string' &&
      typeof q.who === 'string' &&
      typeof q.at === 'string' &&
      typeof q.kind === 'string' &&
      typeof q.question === 'string' &&
      typeof q.why === 'string' &&
      /* THE BAND IS CHECKED AGAINST THE FOUR, not merely for being a string. It is the ranking, and a
         record a version ahead that sent a fifth band would otherwise have its whole queue drawn in an
         order this build could not explain. A record a version BEHIND sends no band at all, which is
         why absent is allowed and a wrong one is not. */
      (q.cost === undefined || (typeof q.cost === 'string' && (COSTS as readonly string[]).includes(q.cost))) &&
      Array.isArray(q.options) &&
      q.options.every((o) => isObject(o) && typeof o.key === 'string' && typeof o.label === 'string' && typeof o.because === 'string' && typeof o.recommended === 'boolean'),
  );
  return ok ? (v as QueueQuestion[]) : null;
}

/** A `diff` block's `history`, newest first, when every version is text. */
function historyOf(v: unknown): { at: string; by: string; text: string }[] | null {
  if (!Array.isArray(v)) return null;
  return v.every((h) => isObject(h) && typeof h.at === 'string' && typeof h.by === 'string' && typeof h.text === 'string')
    ? (v as { at: string; by: string; text: string }[])
    : null;
}

/**
 * Who changed row `n` last, as the kernel sent it, in the words the sample's column uses: a person is you, a rule is
 * named as a rule, and an agent by its name.
 */
function changeOf(changes: unknown, n: number): { by: string; at: string } | null {
  const c = Array.isArray(changes) ? (changes[n] as unknown) : null;
  if (!isObject(c) || typeof c.who !== 'string' || typeof c.at !== 'string') return null;
  const by = c.by === 'you' ? 'you' : c.who.replace(/^rule:/u, 'rule.').replace(/^agent:/u, '');
  return { by, at: c.at };
}

/**
 * Each card's group by name, aligned with the rows, or `null` when the record said none.
 *
 * ON THE ROW, as the record answers it now: `{ value: 'organisations#7', name: 'Brightwell' }`, and `value: ''` for a card
 * that points at nothing, which is no group. A record that put no group on any row is read through the names it sent
 * beside the rows, as an older build did; neither, and the page reads the names from `names` (`blocks.ts`).
 */
function groupsOf(rows: readonly Row[], beside: unknown): (string | null)[] | null {
  if (rows.some((r) => isObject(r.group)))
    return rows.map((r) => {
      const g = r.group;
      return isObject(g) && typeof g.value === 'string' && g.value !== '' && typeof g.name === 'string' && g.name.trim() !== '' ? g.name.trim() : null;
    });
  if (Array.isArray(beside) && beside.length === rows.length) return beside.map((g) => (typeof g === 'string' && g.trim() !== '' ? g : null));
  return null;
}

/**
 * A table's rows by group name, aligned with the rows, or `null` when no row says one, and the table is drawn as it was.
 *
 * READ OFF THE ROWS ALONE (`PageRow.group`, `{ value, name }`), as a card's is, and a row whose group points at
 * nothing (`value: ''`) is in no group. NEVER BESIDE THE ROWS: no build answered a table's names there, so a table has
 * no older form to fall back to. The groups stand in the order of their first rows, which is the order of the rows.
 */
function tableGroupsOf(rows: readonly Row[]): (string | null)[] | null {
  const named = groupsOf(rows, undefined);
  return named?.some((g) => g !== null) ? named : null;
}

/** A series the record sent, when it is one: a name, a unit, aligned buckets, and numbers or gaps. */
function isSeries(v: unknown): v is MeasureSeries {
  if (v === null || typeof v !== 'object') return false;
  const m = v as Partial<MeasureSeries>;
  const numbers = (a: unknown) => Array.isArray(a) && a.every((x) => x === null || (typeof x === 'number' && Number.isFinite(x)));
  return (
    typeof m.name === 'string' &&
    typeof m.unit === 'string' &&
    (m.bucket === 'day' || m.bucket === 'week') &&
    Array.isArray(m.keys) &&
    m.keys.every((k) => typeof k === 'string') &&
    numbers(m.now) &&
    numbers(m.was) &&
    m.now!.length === m.keys.length &&
    m.was!.length === m.keys.length &&
    (m.latest === null || (typeof m.latest === 'object' && typeof m.latest?.value === 'number' && typeof m.latest.day === 'string' && typeof m.latest.at === 'string'))
  );
}

/**
 * A `lines` block's measures read once, when the record sent them: a name, a finite number, a unit and the instant and
 * day it was read. One that is not is left out, and the rest are drawn.
 */
function latestOf(v: unknown): MeasureLatest[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (m): m is MeasureLatest =>
      isObject(m) &&
      typeof m.measure === 'string' &&
      typeof m.value === 'number' &&
      Number.isFinite(m.value) &&
      typeof m.unit === 'string' &&
      typeof m.at === 'string' &&
      typeof m.day === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/u.test(m.day),
  );
}

/** What a project runs on is, in the words its blocks are headed by. */
const RUNS_ON_KINDS: Readonly<Record<string, string>> = { key: 'Key', tool: 'Tool or server', skill: 'Skill', action: 'Scheduled action' };

/** Where a scheduled action is read: the schedule, since an action has no screen of its own (`routes/automations/hub.ts`). */
const SCHEDULED_HREF = '/automations?tab=scheduled';

/**
 * Where one thing a project runs on opens: its own row by the spoken id the kernel answers (`spoken`, `credentials#3`),
 * or the schedule for a scheduled action. `null` for anything else, which draws no link rather than one to no page.
 */
export function runsOnHref(fields: Readonly<Record<string, unknown>>): string | null {
  if (fields.kind === 'action') return SCHEDULED_HREF;
  const spoken = typeof fields.spoken === 'string' ? fields.spoken : '';
  const at = spokenOf(spoken);
  return at ? (rowHref(spoken) ?? `/r/${at.register}/${at.seq}`) : null;
}

/** One answered block as the page draws it. */
/**
 * What a project runs on types its columns as (the kernel's `RUNS_ON`), for a record on a build that answered no `types`
 * beside the rows: the run that last used a thing, and when.
 */
const RUNS_ON_TYPES: Readonly<Record<string, string>> = { used_by: 'run', used_at: 'instant' };

/**
 * WHAT THE OTHER COMPUTED SOURCES THIS BUILD DRAWS TYPE THEIR FIELDS AS (the kernel's `HANDOFFS` and `SIGNS` schemas),
 * for a record that answered no `types` beside the rows. `signs` answers none on any record yet.
 */
const COMPUTED_TYPES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  runs_on: RUNS_ON_TYPES,
  'handoffs.open': { run: 'run', agent: 'text', next: 'text', left_at: 'instant', mark: 'enum' },
  signs: { sign: 'text', name: 'text', state: 'enum', value: 'decimal', said: 'text' },
};

/**
 * THE TYPE OF EACH COLUMN NO LIST DECLARES, as the block answered it (`BlockResult.types`), narrowed to words; a
 * computed source on an older record falls back to its source's own. `null` where neither says.
 */
export function answeredTypes(b: { types?: unknown; source?: unknown }): Readonly<Record<string, string>> | null {
  const t = b.types;
  if (isObject(t) && Object.values(t).every((v) => typeof v === 'string')) return t as Record<string, string>;
  return typeof b.source === 'string' && Object.hasOwn(COMPUTED_TYPES, b.source) ? COMPUTED_TYPES[b.source]! : null;
}

/** The paths of a block that name nothing of the record (`unnamed`), narrowed to words, or `undefined`. */
const unnamedOf = (b: Answered): string[] | undefined => {
  const u = (b as { unnamed?: unknown }).unnamed;
  return Array.isArray(u) && u.length > 0 && u.every((p) => typeof p === 'string') ? [...(u as string[])] : undefined;
};

/** The day each filled path was stated on (`values_as_of`), narrowed to ISO days, or `undefined`. */
const asOfOf = (b: Answered): Record<string, string> | undefined => {
  const a = (b as { values_as_of?: unknown }).values_as_of;
  if (!isObject(a)) return undefined;
  const out = Object.fromEntries(Object.entries(a).filter((e): e is [string, string] => typeof e[1] === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(e[1])));
  return Object.keys(out).length > 0 ? out : undefined;
};

/** How many days old a stated figure must be before a sentence says its age: a week, as a rate is stale after one. */
export const FIGURE_AGED_DAYS = 7;

/**
 * A figure as a sentence says it, with its age once it is old: `EGP 12,400.00 (as of 3 Sep)`. A figure stated within
 * `FIGURE_AGED_DAYS` of today is said bare, so a sentence is not cluttered with a day nobody needs.
 */
export function agedText(text: string, asOf: string | undefined, today: string): string {
  if (asOf === undefined) return text;
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`)) / 86_400_000);
  if (!Number.isFinite(days) || days < FIGURE_AGED_DAYS) return text;
  const day = format('day', Date.parse(`${asOf}T00:00:00Z`) / 86_400_000);
  /* A FIGURE THAT IS ITS OWN DAY ("the oldest balance is from 25 Aug") already says its age: "(as of 25 Aug)" after it said it twice. */
  return text.includes(day) ? text : `${text} (as of ${day})`;
}

/** The primitives a source no arm knows is drawn in, and the types whose cells stand at a column's end. */
const SOURCE_DRAWN: ReadonlySet<string> = new Set(['table', 'list', 'rows']);
const END_TYPES: ReadonlySet<string> = new Set(['money', 'int', 'count', 'decimal']);

/**
 * THE NEXT UNPAID PART OF EACH PLAN, SAID UNDER ITS BAR ("Next £1,875 on 3 Sep"), from the three figures Money's
 * Instalments tile reads after its two counts (`figures/plans.ts`): the day of the earliest open part, what is left to
 * pay, and what is left once that part is paid. The part's amount is the second less the third, which keeps one figure
 * from reading a row's amount by another row's day.
 *
 * A PLAN THE FIGURES CANNOT SAY IT FOR SAYS LESS, NEVER A GUESS: with no day it says nothing, and with no amount (the
 * script that writes what is left after each part has not reached this plan) it says the day alone. The year is left
 * off a day in this year. Returns the sentence for a plan's key, or `''`.
 */
function nextPart(cells: readonly { reading?: { value?: unknown; unit?: unknown; groups?: { key: string; value: number | null }[] } | null }[], now: number): (key: string) => string {
  const [days, left, after] = cells.map((c) => new Map((c.reading?.groups ?? []).map((g) => [String(g.key), g.value])));
  const unit = cells[1]?.reading?.unit;
  if (!days || !left || !after) return () => '';
  return (key) => {
    const at = days.get(key);
    if (typeof at !== 'number' || !Number.isFinite(at)) return '';
    const iso = new Date(at * 86_400_000).toISOString().slice(0, 10);
    const on = dateSaid(iso, now);
    const l = left.get(key);
    const a = after.get(key);
    const part = typeof l === 'number' && typeof a === 'number' && l > a && typeof unit === 'string' && /^[A-Z]{3}$/u.test(unit) ? moneyWhole(l - a, unit, homeCurrency()) : null;
    /* A PART WHOSE DAY HAS GONE IS LATE, in Today's words and the danger colour: "Next EGP
       467,915 on 13 Oct" stood in grey under a plan nine days after that day. Today is the reader's day at `now`. */
    const today = recordToday(now);
    if (iso < today) return `${part ? `${part.text} ` : ''}{{bad:${lateSaid(iso, today)}}}, due ${on}`;
    return part ? `Next ${part.text} on ${on}` : `Next on ${on}`;
  };
}

/** Whether a run the page read is at work, gone quiet or stopped, as a card of runs says it (`face.ts` `liveOf`). */
const liveOfRun = (run: Readonly<Record<string, unknown>>, now: number): RunCell['live'] =>
  liveOf(run.state, run.state === 'active' && isQuiet({ fields: run as never }, now));

/** A run's handle as a row holds it, `S731`, and its number. */
const RUN_HANDLE = /^S([1-9][0-9]*)$/u;

/**
 * EVERY RUN A BLOCK'S ROWS NAME in a column it answered as a run, by handle, so the reader can ask the record for each
 * once and the cells say "Claude Code, 6 Oct" rather than `S731`.
 */
export function runsNamed(b: Answered): string[] {
  /* ONLY WHERE THE PAGE DRAWS THE RUN'S WORDS: `blockOf` reads them on what a project runs on and on the steps runs left,
     so a block it draws another way asks the record for nothing. */
  if (b.source !== 'runs_on' && b.source !== 'handoffs.open') return [];
  const types = answeredTypes(b);
  if (!types || (b.refusals?.length ?? 0) > 0) return [];
  const fields = Object.keys(types).filter((f) => types[f] === 'run');
  const out = new Set<string>();
  for (const r of b.rows ?? []) {
    for (const f of fields) {
      const v = (r.fields as Record<string, unknown>)[f];
      if (typeof v === 'string' && RUN_HANDLE.test(v)) out.add(v);
    }
  }
  return [...out];
}

/**
 * THE WORDS FOR EACH RUN A BLOCK'S ROWS NAME: the app and day the page read, else the agent the record named beside the
 * handle in `agentField`, else nothing, which `display` says as An agent. Never the handle.
 */
function runNames(
  refs: ReadonlyMap<string, RefMap>,
  runs: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
  entries: readonly Entry[],
  runField: string,
  agentField: string,
): Map<string, string> {
  const said = new Map(namesOf(refs));
  for (const [handle, fields] of runs) {
    const words = runWords(fields);
    if (words !== null) said.set(handle, words);
  }
  for (const e of entries) {
    const handle = e.fields[runField];
    const agent = e.fields[agentField];
    if (typeof handle === 'string' && !said.has(handle) && typeof agent === 'string' && agent.trim() !== '') said.set(handle, agent.trim());
  }
  return said;
}

/** THE RUN'S FACE ON EACH CARD, from the run the page read, for a block whose `who` column is typed as a run. */
function runFacesOf(
  b: Answered,
  types: Readonly<Record<string, string>>,
  entries: readonly Entry[],
  runs: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
  now: number,
): (RunCell | null)[] | undefined {
  const whoAt = (b.columns ?? []).find((c) => c.as === 'who' && types[c.field] === 'run')?.field;
  if (whoAt === undefined) return undefined;
  const faces = entries.map((e): RunCell | null => {
    const handle = e.fields[whoAt];
    const run = typeof handle === 'string' ? runs.get(handle) : undefined;
    if (run === undefined || typeof handle !== 'string') return null;
    return { run: handle, agent: typeof run.agent === 'string' ? run.agent : null, live: liveOfRun(run, now), presence: presenceSaid(run.state, run, now) };
  });
  return faces.some((f) => f !== null) ? faces : undefined;
}

/** A step's mark and a sign's state as a person says them: the kernel hands the machine's word. */
const MARK_WORDS: Readonly<Record<string, string>> = { next: 'Next', earlier: 'Left earlier' };
const SIGN_WORDS: Readonly<Record<string, string>> = { red: 'Needs a look', green: 'All good', none: 'Not checked yet' };

/** The cell for `field` said through `words` where the row holds one of its keys, else as `toRows` said it. */
function wordsFor(columns: readonly { field: string }[], cells: (string | null)[], fields: Readonly<Record<string, unknown>>, field: string, words: Readonly<Record<string, string>>): (string | null)[] {
  const v = fields[field];
  const said = typeof v === 'string' && Object.hasOwn(words, v) ? words[v]! : null;
  return said === null ? cells : cells.map((c, i) => (columns[i]?.field === field ? said : c));
}

/**
 * THE WAY A FIGURE'S MONEY GOES, BY THE FIGURE, for a cell that carries no `sign` of its own (RN7). A Today arranged
 * before the cells were signed is kept on the record's `home` page with cells that never had one, and Money's own
 * pages from before its widgets did, so Coming in and Going out read as two figures of the same kind there. These two
 * are what they are wherever they are drawn; a cell that says its own way keeps it.
 */
const WAY_OF: Readonly<Record<string, 'in' | 'out'>> = { 'arriving-30d': 'in', 'leaving-30d': 'out' };

/** The names a note's refs were sent with, by the row's handle (`tasks#3`), or `null` for none or for a shape that is not one. */
export function refNamesOf(v: unknown): ReadonlyMap<string, string> | null {
  if (!isObject(v)) return null;
  const out = new Map<string, string>();
  for (const [handle, name] of Object.entries(v)) if (/^[a-z][a-z0-9_]*#[1-9][0-9]*$/u.test(handle) && typeof name === 'string' && name.trim() !== '') out.set(handle, name.trim());
  return out.size > 0 ? out : null;
}

export function blockOf(
  b: Answered,
  refs: ReadonlyMap<string, RefMap>,
  now: number,
  me: string | null = null,
  names: ReadonlyMap<string, string> = new Map(),
  runs: ReadonlyMap<string, Readonly<Record<string, unknown>>> = new Map(),
): LiveBlock {
  const {
    kind: _kind,
    where: _where,
    heading: _heading,
    empty: _empty,
    body: _body,
    target: _target,
    authored: _authored,
    cells: _cells,
    columns: _columns,
    /* THE KEYS THE RECORD DOES CHECK, taken by name so each is present only when it has a value.
       `exactOptionalPropertyTypes` draws the distinction the spread of an optional key erases: a
       `tone` that is absent and a `tone` that is explicitly `undefined` are different objects, and
       only the first is what `heading?: string` means. */
    source,
    span,
    limit,
    tone,
    fold,
    icon,
    rows: sent = [],
    matched = 0,
    /* THE WHOLE A SUM KIND ADDS UP, taken by name and narrowed by `wholeOf` below, so none rides through `rest` unread. */
    wholeRead: summed,
    readings,
    scopes,
    /* EACH ROW'S PROJECT MARK, taken by name so it reaches the page narrowed on `scopeCells` and never raw through `rest`. */
    scope_marks: scopeMarked,
    rings,
    inherited,
    refusals = [],
    values,
    drawn,
    walk: walked,
    walks: walkedApart,
    walkFx,
    feed: fed,
    queue: waiting,
    seen: mark,
    history: versions,
    bars: barred,
    changes: changed,
    working: onIt,
    working_now: atWork,
    past: remembered,
    measures: measured,
    /* THE MEASURES READ ONCE, beside the lines, taken by name and narrowed below so none rides through `rest` unchecked. */
    latest: readOnce,
    /* A CAPTURE'S LIST AND WHAT A NEW ROW IN IT IS FILLED WITH, taken by name so neither rides through `rest`
       unchecked: `fills` is what a press writes, so a value in it the app did not look at is a value it would store. */
    register: into,
    fills: filled,
    /* WHAT A BUILT PAGE'S FORMS ARE DRAWN FROM, taken by name and narrowed below, so a record on another
       build that sent one in a shape this cannot read draws the plain form rather than a wrong one. */
    nexts: nexted,
    /* EACH CARD'S TREND, a run of numbers a card, taken by name and narrowed into its cell below. */
    trends: trended,
    /* EACH CARD'S WHEN OVER A FIGURE, a number a card, taken by name and narrowed into its cell below. */
    whens: whened,
    /* EACH CARD'S FACTS OVER A FIGURE, a list a card, taken by name and narrowed into its cells below. */
    facts: facted,
    types: typed,
    home: homeSaid,
    done_now: doneNow,
    next: nextAt,
    open: openSteps,
    /* THE MODEL'S LINE FOR A LEAD NOTE, taken by name so it never rides through `rest` onto a block that is not one. */
    said: modelSaid,
    /* THE NAMES OF THE ROWS A NOTE'S REFS POINT AT, taken by name and narrowed into `names` below (`refNamesOf`). */
    ref_names: refNamed,
    /* WHAT THE BLOCK IS, taken by name and narrowed by `keyOf`, so a page never keys its blocks by something that is not text. */
    key: keyed,
    /* WHAT A CARD BLOCK'S CARDS ARE GROUPED BY, AND EACH CARD'S GROUP BY NAME, taken by name and narrowed below. */
    group: grouped,
    groups: groupNames,
    /* WHAT EACH FIGURE THE BLOCK NAMES IS, AS THE RECORD DECLARES IT, learnt before anything below reads a figure
       (`figures-known.ts`), and taken by name so it never rides through `rest` onto a block a page could save. */
    figures: told,
    ...rest
  } = b;
  learnFigures(told);
  /* A BLOCK FROM A RECORD BUILT BEFORE `figures` ASKS FOR THIS BUILD'S TABLES, which the next drawing reads: the page
     readers wait for them first (`figuresFor`), and a block drawn by any other path is not held up for them. */
  if (told === undefined) void figuresFor([b]);
  /* THE ROWS THE BLOCK IS DRAWN FROM: the ones sent, or for a sum kind short of its match the whole's lines (below). */
  let got = sent;

  /* NARROWED ONCE, HERE, because the record does not check any of these and the app's type says it
     does. A key that is not what it claims to be is left off the block rather than put on it: the
     page then draws a block that is missing a heading, which is visible, instead of throwing inside
     the renderer, which takes every other block on the page with it. */
  const kind = str(b.kind) ?? '';
  const heading = str(b.heading);
  const where = str(b.where);
  const empty = str(b.empty);
  const body = str(b.body);
  const target = typeof b.target === 'number' && Number.isFinite(b.target) ? b.target : undefined;
  const authored = authoredOf(b.authored);
  /* A FIGURE'S LABEL IS THE RECORD'S OR ITS OWN NAME. The record checks that a cell names a metric
     and does not check that it carries a label, and the app's type says every cell has one. */
  const cells = b.cells?.map((c) => ({
    metric: c.metric,
    label: str(c.label) ?? c.metric,
    ...(typeof c.trend === 'string' ? { trend: c.trend } : {}),
    ...(typeof c.ahead === 'string' ? { ahead: c.ahead } : {}),
    ...(typeof c.note === 'string' ? { note: c.note } : {}),
  }));

  /* THE DECLARATION'S COLUMNS ARE REPLACED BY DRAWN ONES, and everything the record sent that this
     file does not name rides through untouched, so a key a later kernel adds is carried rather than
     dropped. */
  const shell: LiveBlock = {
    ...rest,
    /* WHO CHANGED EACH ROW, aligned with the rows, put back on the block so a page draws its bylines and tints
       (`$lib/page/byline.ts` narrows each one itself). */
    ...(Array.isArray(changed) ? { changes: changed } : {}),
    kind,
    ...(source === undefined ? {} : { source }),
    /* A QUEUE OF QUESTIONS NARROWED TO THE PAGE'S OWN (`where`), said as a mark and never the clause: a page that says
       which questions are its own borrows no other into its suggestion slot (`PageBody.svelte`). */
    ...(kind === 'queue' && _where !== undefined ? { narrowed: true } : {}),
    ...(span === undefined ? {} : { span }),
    ...(limit === undefined ? {} : { limit }),
    ...(tone === undefined ? {} : { tone }),
    ...(foldOf(fold) === undefined ? {} : { fold: foldOf(fold)! }),
    ...(kind === 'cards' && typeof grouped === 'string' && grouped !== '' ? { group: grouped } : {}),
    ...(icon === undefined ? {} : { icon }),
    ...(heading === undefined ? {} : { heading }),
    ...(where === undefined ? {} : { where }),
    ...(empty === undefined ? {} : { empty }),
    /* A DAY THE RECORD WROTE INTO A NOTE IS SAID AS A PERSON SAYS IT (`datesIn`): a person's Seen in read
       "2026-08-28 · mail from halden.example". Never in a document, whose words are the person's own. */
    ...(body === undefined ? {} : { body: kind === 'note' && rest.document !== true && typeof body === 'string' ? datesIn(pluralsIn(wholeMoneyIn(body), saidFor(namedResolverOf(values, unnamedOf(b)))), now) : body }),
    /* A NOTE'S `{{ref:tasks#3}}` BY ITS ROW'S NAME (PJ4): the record sends the names of the rows it may show this reader,
       and the renderer says each by it (`refName` in `BlockSlot.svelte`) where it drew "#3" until the tab read the list. */
    ...((named) => (named === null ? {} : { names: named }))(kind === 'note' ? refNamesOf(refNamed) : null),
    ...(target === undefined ? {} : { target }),
    ...(authored === undefined ? {} : { authored }),
    ...(cells === undefined ? {} : { cells }),
    register: undefined,
    /* THE CAST IS `schema.ts`'S ROLE LIST BEING TWO SHORT: it still names the eight roles and `scope`, and the renderer's
       `Column` and the kernel both take `next` and `reply`. The two words belong in that file. */
    columns: columnsOf(b) as LiveBlock['columns'],
    entries: [],
    matched: [],
    refusals: refusals.map((r) => r.fix),
    /* AND WHETHER IT IS HELD FROM THIS READER, which Today leaves out of the board rather than saying (`quietHeld`). */
    ...(refusals.some((r) => (r as { code?: unknown }).code === 'FORBIDDEN' || (r as { code?: unknown }).code === 'LEVEL_REQUIRED') ? { held: true as const } : {}),
    rows: [],
    shown: 0,
    total: 0,
    drawn: drawn !== false,
    stale_at: new Date(now).toISOString(),
    metrics: undefined,
    ...(values ? { values } : {}),
    /* NARROWED, so the resolver is only ever handed words. */
    ...(unnamedOf(b) ? { unnamed: unnamedOf(b) } : {}),
    ...(asOfOf(b) ? { valuesAsOf: asOfOf(b) } : {}),
    ...(keyOf(keyed) === null ? {} : { key: keyOf(keyed)! }),
  };
  const cannot: LiveBlock = { ...shell, cannot: liveWords.cannot };

  if (refusals.length || drawn === false) return shell;
  /* A REGISTERED KIND IS DRAWN FROM THE ANSWER AS THE RECORD SENT IT (`lib/page/kinds/index.ts`), so nothing below
     translates it: the answer rides on the block whole, and its module narrows what it reads. The shell still carries
     what every block's frame reads, the heading, the source's list and the count of what was drawn against what matched,
     so the page's head and its "showing N of M" line need nothing from the module. A refused block and one whose
     `when:` said no returned above, and are drawn as every other kind's are. */
  if (drawerOf(kind)) {
    const register = registerOf(b);
    return {
      ...shell,
      ...(register && REGISTERS[register] ? { register } : {}),
      shown: got.length,
      total: Math.max(matched, got.length),
      answer: b as unknown as Answer,
    };
  }
  /* A LEAD NOTE IS THE SCREEN'S ONE SENTENCE, SAID BY `noteOf`'S RULES (`leadOf`): a clause whose every figure is nought
     goes, and `N thing(s)` is one thing or several. Before this the body went to the renderer as written, which filled
     each figure and left the rest alone, so the first line of a desk read "1 essential step(s) done" (measured at HEAD
     in `dynamic-app.test.ts`). The holes are kept, so each figure is still written by the page's resolver, the way the
     cells beside it are.

     A LEAD WITH NOTHING LEFT TO SAY IS NOT DRAWN, as a note whose `when:` said no is not: "0 essential steps done" is
     the clause the rule exists to take away, and a panel with no sentence in it is a hole in the first screen. */
  if (kind === 'note' && rest.lead === true && body !== undefined) {
    /* THE MODEL'S LINE COMES FIRST WHEN THE RECORD SENT ONE. It is written nightly from these same figures and checked
       before it is kept (`packages/record/src/headlines.ts`): every number in it is one the figures hold, and it is sent
       only while they still hold the values it was written from, so it cannot say what the tiles beside it do not. */
    const own = typeof modelSaid === 'string' ? modelSaid.trim() : '';
    /* AND IT ENDS AS A SENTENCE DOES (`stopped`, P13): "Portage and Kiln need a push, Marlow & Co is on track" ran out
       with no full stop under Projects' name, while the header's own line ended with one. */
    /* AND SAID AS EVERY OTHER SENTENCE IS (live check of 30 October, 15 and 17): the model wrote "cash lasts to
       2027-01-13" and "EGP 560,563.82, down −11%", so its line takes the days in words, the money in whole units and a
       direction said once. */
    if (own !== '') return { ...shell, body: stopped(datesIn(wholeMoneyIn(own), now).replace(/\b(down|up) [−+-](?=\d)/gu, '$1 ')), modelLine: true };
    /* A LINE WHOSE FIRST CLAUSE WENT STARTS ON A CAPITAL: Founder overview read "on what is due it runs out in 5 days." */
    const lead = leadOf(body, namedResolverOf(values, unnamedOf(b))).replace(/^\p{Ll}/u, (c) => c.toUpperCase());
    return lead.trim() === '' ? { ...shell, body: '', drawn: false } : { ...shell, body: stopped(lead) };
  }
  /* AN `inputs` BLOCK IS ONE ROW'S FIELDS TO TYPE INTO, read by `register:` and never by `source:`, so it is answered
     before the check that sends a block with no source back as written text. That check was where it went: the kernel
     answered the row and its `types`, and the page drew `Nothing matched.` over a row it had been handed.

     THE TYPES ARE THE RECORD'S, and a block whose `types` is not a map of words draws the line saying it cannot be drawn
     rather than guessing a control from the value: a money guessed to be text is a box that writes a string into a
     money field. */
  if (kind === 'inputs') {
    const register = registerOf(b);
    const types = isObject(typed) && Object.values(typed).every((t) => typeof t === 'string') ? (typed as Record<string, string>) : null;
    if (!register || !REGISTERS[register] || !types) return cannot;
    const entries = got.slice(0, 1).map((r) => entryOf(register, r, refs));
    const home = typeof homeSaid === 'string' && /^[A-Z]{3}$/u.test(homeSaid) ? homeSaid : null;
    const derived = Array.isArray(b.derived) ? b.derived.filter((f): f is string => typeof f === 'string') : [];
    return { ...shell, register, entries, matched: entries, rows: toRows(register, entries, shell.columns, now, namesOf(refs)), shown: entries.length, total: entries.length, names: namesOf(refs), types, home, derived } as LiveBlock;
  }
  /* A CAPTURE READS NO ROWS, and it has no `source:` either, so it is answered before the check that sends a block
     with none back as written text. Its list is kept on `register`, which every other block here takes from its
     source, because `draw()` names the list from it and the page decides from it whether a line can be written.

     FILLS THAT ARE NOT ALL TEXT ARE A BLOCK THIS BUILD CANNOT DRAW, and not a capture that fills less: dropping the
     one value it could not read turns a line typed under "Later" into an open task, which is a write nobody made. */
  if (kind === 'capture') {
    const text = isObject(filled) && Object.values(filled).every((v) => typeof v === 'string');
    if (typeof into !== 'string' || into === '' || !text) return cannot;
    return { ...shell, register: into, fills: { ...(filled as Record<string, string>) } };
  }
  /* A PROGRESS OVER TWO FIGURES BY ONE WORD draws a track a part of the second: what the first counted against it,
     `label | value | target`, the rows a progress is written in by hand. Money's Instalments is the one: the parts paid
     by plan against the parts in all by plan. A part the first figure does not hold has nothing counted, and reads nought.
     Six tracks, the most the tile ever drew, and the count of all of them is kept so the page can say what it left out.

     THE PLANS STILL BEING PAID COME FIRST, each kind in the order the record sent it. The six were the first six the
     record named, so a seventh plan with parts left to pay stood behind six that were paid off and the tile, which is
     drawn only while something is left to pay, could show nothing that was. A plan whose parts are all counted, or that
     has none to count, goes after every plan that has some left.

     AND WHAT WAS LEFT OUT IS EVERY PLAN NOT DRAWN, the ones past the record's own cap on a figure's parts among them
     (`more` on the second figure, which is the one that names every plan): `total` less `shown` is what the page says.
     A figure that was refused, or that came with no parts at all, falls through to the tiles below, which say why. */
  if (kind === 'progress' && (b.cells?.length === 2 || b.cells?.length === 5) && readings?.length === b.cells.length && readings.every((c) => Array.isArray(c.reading?.groups))) {
    const [first, second] = readings.map((c) => c.reading!.groups!);
    const done = new Map(first!.map((g) => [String(g.key), typeof g.value === 'number' ? g.value : 0]));
    /* WHAT EACH TRACK SAYS UNDER ITS BAR, from the three figures after the two counts when the tile reads them. */
    const next = nextPart(readings.slice(2), now);
    /* A PLAN TYPED ALL IN SMALL LETTERS IS NAMED WITH A CAPITAL: an import wrote each
       plan's name in small letters on its parts, and the tile said it so while Needs you and the plan's own row started
       it with a capital. A name typed with a capital anywhere is kept as typed, "iPad" among them. */
    const named = (key: string): string => (/\p{Lu}/u.test(key) ? key : key.charAt(0).toUpperCase() + key.slice(1));
    const plans = second!.map((g) => ({ key: String(g.key), name: labelled(g) ?? named(String(g.key)), paid: done.get(String(g.key)) ?? 0, parts: typeof g.value === 'number' ? g.value : 0 }));
    const open = (p: (typeof plans)[number]): boolean => p.paid < p.parts;
    const tracks = [...plans.filter(open), ...plans.filter((p) => !open(p))].slice(0, 6).map((p) => {
      const said = open(p) ? next(p.key) : '';
      return { cells: said ? [p.name, String(p.paid), String(p.parts), said] : [p.name, String(p.paid), String(p.parts)] };
    });
    const past = readings[1]!.reading!.more;
    return { ...shell, authored: tracks, shown: tracks.length, total: plans.length + (typeof past === 'number' && past > 0 ? past : 0) };
  }
  /* A STAT OVER A REGISTER AND NO FIGURES draws a tile a measure from the rows (`measures.ts`), as the kernel answers it. */
  if (b.cells || (kind === 'stat' && !registerOf(b)))
    return {
      ...shell,
      metrics: onceATile(
        (readings ?? []).map((cell, i) => {
          const m = tileOf(cell, values, b.tone === 'bad' ? 'bad' : b.tone === 'info' ? 'info' : 'warn', 'foot');
          /* A LINE ASKED FOR AND NOT KEPT YET (audit of 30 October, 21): Money's "Net worth, the last 12 weeks" drew its
             number over an empty chart until the nights had kept a line. It says when the line starts instead. */
          const asked = typeof b.cells?.[i]?.trend === 'string' && b.cells[i]!.ahead === undefined;
          const kept = (m.trend ?? []).filter((v) => v !== null).length;
          /* THE WAY ITS MONEY GOES, BY ITS OWN FIGURE AND NEVER ITS PLACE (audit 31 Oct m, AM1): Today's Cash ahead signed
             its second tile "+", and with no account Cash now drew nothing, so the rent going out read "+EGP 12,000". */
          const way = b.cells?.find((c) => c.metric === cell.metric)?.sign ?? WAY_OF[cell.metric];
          const signed: typeof m = way === 'in' || way === 'out' ? { ...m, sign: way } : m;
          return asked && kept < 3 && m.value !== MISSING ? { ...signed, waits: true as const } : signed;
        }),
      ),
    };
  /* A BAR OR A SPLIT OVER A FIGURE draws the parts the record read, EACH BY ITS NAME: a part keyed by a ref is the row
     it points at, read from the walk `pageReader` made of that list, and never the ULID the key is. */
  if (typeof source === 'string' && source.startsWith('metric.')) {
    const reading = readings?.[0]?.reading;
    if (!reading) return cannot;
    const target = partsTarget(b);
    const groups = (reading.groups ?? []).map((g) => {
      const key = String(g.key);
      const label = partName({ key, label: g.label }, target, refs);
      return { key, ...(label === undefined ? {} : { label }), value: typeof g.value === 'number' ? g.value : null, ...(Array.isArray(g.parts) ? { parts: g.parts } : {}) };
    });
    const parts = { metric: source.slice('metric.'.length), value: reading.value, groups, more: typeof reading.more === 'number' ? reading.more : 0, unit: reading.unit };
    return { ...shell, parts, shown: groups.length, total: groups.length };
  }
  if (kind === 'series') {
    const bars = barsOf(barred);
    return bars ? { ...shell, bars, shown: bars.keys.length, total: bars.keys.length } : cannot;
  }
  if (!b.source) return shell;
  /* WHAT A PROJECT RUNS ON NAMES NO REGISTER (`packages/kernel/src/pages.ts` `runsOnBlock`), so `registerOf` cannot
     resolve it and the common path below, which checks `REGISTERS[register]`, drew every such block as one this
     build cannot draw. Its rows are the kernel's own fields, scoped and ordered already: the project's
     own first, then the ones that apply everywhere. */
  if (b.source === 'runs_on') {
    const register = 'runs_on';
    const entries = got.map((r) => entryOf(register, r, refs));
    /* EACH COLUMN BY THE TYPE THE BLOCK ANSWERED: Last used is a time in words, and Last used by the run's app and day,
       linked to the run, where his project page printed `2026-10-06T19:07:01.610Z` and `S731`. */
    const types = answeredTypes(b) ?? {};
    /* A RUN THIS READER COULD NOT OPEN is said by the agent the record named beside it (`used_agent`), before An agent. */
    const said = runNames(refs, runs, entries, 'used_by', 'used_agent');
    /* EACH CARD OPENS THE ROW IT STANDS FOR, never `/r/runs_on/<n>`, which is no list (audit 31 Oct A37): a key, a tool
       or a skill by the spoken id the kernel answered beside it (`credentials#3`), on its own page where its list made
       one, and a scheduled action on the schedule, since an action has no screen of its own. */
    const rows = toRows(register, entries, shell.columns, now, said, types).map((row, n) => {
      const { href: _href, ...rest } = row;
      const to = runsOnHref(entries[n]!.fields);
      return { ...rest, ...(to ? { href: to } : {}) };
    });
    /* THE RUN'S FACE ON THE CARD, from the run the page read, as a block of runs hands its own. */
    const runFaces = runFacesOf(b, types, entries, runs, now);
    /* EACH ROW'S PROJECT IS A CHIP, as any block with a `scope` column draws one: the kernel's own
       `scopes`, the project's name for its own rows and none, drawn as Everywhere, for the ones beside it. */
    (b.columns ?? []).forEach((c, i) => {
      if (c.as !== 'scope') return;
      rows.forEach((row, n) => {
        row.cells[i] = scopes?.[n] ?? EVERYWHERE;
      });
    });
    /* NAMES, NEVER HANDLES, AND NO WIRE (on a project page): a key or a tool filed as
       `pinwheel-metrics` is said "Pinwheel metrics" (`thingName`, as the project's shape says it), and how a tool is
       reached, `stdio` or `http`, is how an agent's machine talks to it and nothing a person acts on, so that line is
       left out and the card draws its other facts. */
    (b.columns ?? []).forEach((c, i) => {
      rows.forEach((row, n) => {
        const cell = row.cells[i];
        if (c.as === 'title' && c.field === 'name' && typeof cell === 'string') row.cells[i] = thingName(cell);
        else if (c.field === 'detail' && entries[n]?.fields.kind === 'tool') row.cells[i] = '';
        /* WHAT IT IS IN A WORD, as the blocks beside it are headed: "Key", never the kernel's `key`. */
        else if (c.field === 'kind' && typeof entries[n]?.fields.kind === 'string') row.cells[i] = RUNS_ON_KINDS[entries[n]!.fields.kind as string] ?? cell ?? null;
      });
    });
    const scopeCells = scopeCellsOf(b.columns ?? [], rows, scopeMarked);
    return {
      ...shell,
      register,
      entries,
      matched: entries,
      rows,
      shown: entries.length,
      total: matched,
      names: namesOf(refs),
      /* A ROW THAT APPLIES EVERYWHERE DRAWS FAINT, exactly as a run gone quiet does (`lib/record/blocks.ts`
         `cardsRows` already reads this array for any cards block): the kernel's own `quiet` cell on each row,
         which a declaration cannot name (`braindog-render`'s `CARD_ROLES` admits it, `declare.ts`
         does not), so it is filled here rather than through a column an author wrote. */
      quiet: entries.map((e) => Boolean(e.fields.quiet)),
      ...(scopeCells ? { scopeCells } : {}),
      ...(runFaces ? { runFaces } : {}),
    };
  }
  /* THE STEPS RUNS LEFT AND NOBODY HAS TAKEN (`packages/kernel/src/pages.ts` `handoffsBlock`) name no register either,
     so the common path below drew the Agents page's "Left for the next run" as a block this build cannot draw. Each row
     is a step, newest first: the run that left it said by its app and day, else the agent the record named beside it,
     and linked to that run; when it was left in words; and its mark as words, Next or Left earlier. */
  if (b.source === 'handoffs.open') {
    const register = 'handoffs.open';
    const entries = got.map((r) => entryOf(register, r, refs));
    const types = answeredTypes(b) ?? {};
    const said = runNames(refs, runs, entries, 'run', 'agent');
    const rows = toRows(register, entries, shell.columns, now, said, types).map((row, n) => {
      const e = entries[n]!;
      const seq = typeof e.fields.run === 'string' ? RUN_HANDLE.exec(e.fields.run)?.[1] : undefined;
      /* KEYED BY THE STEP AND OPENING THE RUN THAT LEFT IT, never `/r/handoffs.open/0`, which is no page. */
      const { href: _href, ...rest } = row;
      return {
        ...rest,
        key: `handoff:${e.id ?? n}`,
        cells: wordsFor(shell.columns, row.cells, e.fields, 'mark', MARK_WORDS),
        ...(seq === undefined ? {} : { href: `/r/session/${seq}` }),
      };
    });
    const runFaces = runFacesOf(b, types, entries, runs, now);
    return { ...shell, register, entries, matched: entries, rows, shown: entries.length, total: Math.max(matched, entries.length), names: namesOf(refs), ...(runFaces ? { runFaces } : {}) };
  }
  /* THE INSTALLED SCRIPTS (`packages/kernel/src/sources/scripts.ts`), one row a script, which `/scripts` draws.
     `scripts` names no register, so the common path below would draw them as a block this build cannot draw. A row is
     keyed by its script and opens its own page, and two of its cells are said as the old list said them (`scriptOf`):
     `every` is what starts it ("Every day · by automation") and `last_at` where it stands ("Last
     ran 2 hours ago", "Paused"). A paused one, or one refused on its last run, carries its tone, drawn with its glyph. */
  if (b.source === 'scripts') {
    const register = 'scripts';
    const entries = got.map((r) => entryOf(register, r, refs));
    const rows: LiveBlock['rows'] = got.map((r, n) => {
      const s = scriptOf(r.fields, now);
      const cells = (b.columns ?? []).map((c) => {
        if (c.field === 'every') return s.what;
        if (c.field === 'last_at') return s.said;
        const v = r.fields[c.field];
        return typeof v === 'string' ? v : v === null || v === undefined ? null : String(v);
      });
      return {
        key: `script:${s.script || String(n)}`,
        cells,
        ...(s.tone ? { tone: s.tone } : {}),
        ...(s.script ? { href: `/scripts/${encodeURIComponent(s.script)}` } : {}),
      };
    });
    return { ...shell, register, entries, matched: entries, rows, shown: entries.length, total: Math.max(matched, entries.length) };
  }
  /* THE RECORD'S VITAL SIGNS (`packages/kernel/src/pages.ts` `signsBlock`), one row a sign in the record's own order,
     which Health draws as cards grouped by state. `signs` names no register, so before this every sign card on Health
     said it cannot be drawn. A sign is keyed by its id; its state is said in words, and a red one
     carries the bad tone, which reaches the page with its glyph, so it is never told by colour alone. */
  if (b.source === 'signs') {
    const register = 'signs';
    const entries = got.map((r) => entryOf(register, r, refs));
    const types = answeredTypes(b) ?? {};
    const rows = toRows(register, entries, shell.columns, now, namesOf(refs), types).map((row, n) => {
      const e = entries[n]!;
      const sign = typeof e.fields.sign === 'string' && e.fields.sign !== '' ? e.fields.sign : String(n);
      return {
        key: `sign:${sign}`,
        cells: wordsFor(shell.columns, row.cells, e.fields, 'state', SIGN_WORDS),
        ...(e.fields.state === 'red' ? { tone: 'bad' as const } : {}),
        /* AND OPENS WHERE IT IS MENDED (AG7): a failure opens its question, so Health's one problem has a way on. */
        ...(typeof e.fields.to === 'string' && e.fields.to.startsWith('/') && !e.fields.to.startsWith('//') ? { href: e.fields.to } : {}),
      };
    });
    return { ...shell, register, entries, matched: entries, rows, shown: entries.length, total: Math.max(matched, entries.length), names: namesOf(refs) };
  }
  /* A `deadlines` BLOCK READS ACROSS EVERY LIST (`packages/kernel/src/pages.ts` `deadlinesBlock`), so its rows are
     the kernel's own fields, `list`, `row`, `title`, `day`, `amount`, `direction`, and not a register's: `deadlines`
     names no real list, so `registerOf` answers null for it and the common path below sent every such block back
     as one this build cannot draw. Entries carry the raw fields (`homeBlocks` reads `entries[n].fields.day` to
     split Overdue), and rows are said by hand: `toRows`'s `display()` only knows a field's type through a declared
     register, which this one can never be.
     A DAY ALREADY GONE SAYS HOW LATE IT IS, in the words Today's Late uses (`lateSaid`), and the row carries the bad
     tone, which the page draws with its glyph, so it is never told by colour alone. The record reads what is late first,
     so a "Due this week" that any page declares listed a payment five days past under this week as a bare day. Today is
     the reader's own day at `now`, as Home works it out for its Late (`default-home.ts` `howLate`), which writes the same
     words again. */
  if (b.source === 'deadlines') {
    const spoken = /^([a-z][a-z0-9_]*)#([1-9][0-9]*)$/u;
    const today = recordToday(now);
    const entries = got.map((r) => entryOf('deadlines', r, refs));
    const rows: LiveBlock['rows'] = got.map((r) => {
      const at = typeof r.fields.row === 'string' ? spoken.exec(r.fields.row) : null;
      const due = typeof r.fields.day === 'string' && /^\d{4}-\d{2}-\d{2}/u.test(r.fields.day) ? r.fields.day.slice(0, 10) : null;
      const late = due !== null && due < today;
      const cells = (b.columns ?? []).map((c) => {
        const v = r.fields[c.field];
        if (c.field === 'day') return late ? lateSaid(due, today) : typeof v === 'string' ? dateSaid(v, now) : null;
        if (c.field === 'amount') {
          /* NO AMOUNT OF NOTHING (30 October): "Wildcard certificate £0.00" said a payment that is none; Today drew it
             with no amount, and so does every list now. */
          if (!isObject(v) || typeof v.amount !== 'number' || typeof v.currency !== 'string' || v.amount === 0) return null;
          /* BY THE ONE RULE FOR CENTS (next-money, M18): what falls due is a plan read at a glance, so from a thousand up
             it is whole, and Coming up's "$1,400" is never "$1,400.00" because another bill in the table has cents. */
          const unit = 10 ** exponentOf(v.currency);
          const said = money(Math.abs(v.amount) < 1000 * unit ? v.amount : Math.sign(v.amount) * Math.round(Math.abs(v.amount) / unit) * unit, v.currency);
          const out = c.sign ? r.fields[c.sign.field] === c.sign.minus : false;
          return `${out ? '−' : '+'}${said}`;
        }
        return typeof v === 'string' ? v : v === null || v === undefined ? null : String(v);
      });
      /* THE STRETCH IT FALLS DUE IN, where the block groups by it (`group: when`): the record puts it on the row, as a
         grouped table's group is, and the table heads each stretch once. */
      const group = isObject(r.group) && typeof r.group.name === 'string' && r.group.name.trim() !== '' ? r.group.name.trim() : null;
      return {
        key: typeof r.fields.row === 'string' ? r.fields.row : String(r.id),
        cells,
        ...(late ? { tone: 'bad' as const } : {}),
        ...(at ? { href: `/r/${at[1]}/${at[2]}` } : {}),
        ...(group ? { group } : {}),
      };
    });
    /* AND ITS AMOUNTS AS ONE SET, as every table's money column is (`moneySets`): no ".00" down whole amounts. */
    if (kind === 'table') moneySets('deadlines', b.columns ?? [], rows as { cells: (string | null)[] }[]);
    return { ...shell, register: 'deadlines', entries, matched: entries, rows, shown: entries.length, total: matched };
  }
  /* KEY NUMBERS ARE NOT ROWS OF A LIST: the record answers them as the block's `kpis`, which ride on it whole and are
     narrowed where they are drawn (`lib/page/kpis-in.ts`). Shown and total are both how many came: the record ranked
     the rest out on purpose, so no "N more" is said under them. */
  if (kind === KPIS_KIND) {
    const kpis = Array.isArray((b as { kpis?: unknown }).kpis) ? (b as { kpis: unknown[] }).kpis : [];
    return { ...shell, shown: kpis.length, total: kpis.length };
  }
  if (b.source === 'actions') {
    const actions = got.map((r) => actionOf(r.fields));
    return { ...shell, actions, shown: actions.length, total: matched };
  }
  /* WHAT IS WAITING ON A PERSON. `total` is how many are open and `shown` how many came back, so the
     block can say what it left out rather than drawing three of nine as though that were all of it. */
  /* WHAT WAS PUT OFF IS A QUEUE TOO: the same questions, each still open and waiting on its day, so it is read as the
     open one is and keeps its own source. */
  if (b.source === 'governance.open' || b.source === 'governance.later' || b.source === 'governance.apart') {
    const queue = queueOf(waiting);
    return queue ? { ...shell, queue, shown: queue.length, total: matched } : cannot;
  }
  /* WHAT WAS DECIDED IS ROWS NO LIST HOLDS: one line a decision, its cells the declared columns in the words a person
     reads (the day as an age, the answer by its option's label or the word for accepting or declining), and each a
     door to the decision on `/decide/<id>`. `latest` is when the newest was decided, which a calm line can say. */
  if (b.source === 'governance.decided') {
    const answerWord = (v: unknown): string => (v === 'accept' ? copy.acceptIt : v === 'reject' ? copy.rejectIt : typeof v === 'string' ? v : '');
    const cell = (f: Record<string, unknown>, field: string): string => {
      const v = f[field];
      if (field === 'at') return typeof v === 'string' ? since(v, now) : '';
      if (field === 'answer_label') return typeof v === 'string' && v !== '' ? moneyInText(v) : answerWord(f.answer);
      if (field === 'answer') return answerWord(v);
      return typeof v === 'string' ? moneyInText(v) : v === null || v === undefined ? '' : String(v);
    };
    const rows: LiveBlock['rows'] = got.flatMap((r) => {
      const id = typeof r.id === 'string' ? r.id : '';
      const f = isObject(r.fields) ? r.fields : {};
      return id === '' ? [] : [{ key: `decided:${id}`, cells: shell.columns.map((c) => cell(f, c.field)), href: `/decide/${encodeURIComponent(id)}` }];
    });
    const first = got[0]?.fields;
    const latest = isObject(first) && typeof first.at === 'string' ? first.at : null;
    return { ...shell, rows, shown: rows.length, total: Math.max(rows.length, matched), latest } as LiveBlock;
  }

  /* A WALK, A FEED AND A DIFF ARE NOT ROWS OF A REGISTER. The kernel answers each as its own key, and each
     is shaped by the function that shapes the sample's, so the same renderer draws both. One the record
     did not send, or sent in a shape this cannot read, says it cannot be drawn rather than drawing empty. */
  if (b.source === 'forecast.runway') {
    /* ONE WALK A CURRENCY, when the record could not add them up, each drawn under its code and the reason said once. */
    const apart = Array.isArray(walkedApart) ? walkedApart.map(walkOf) : [];
    if (apart.length > 0 && apart.every((w): w is Walk => w !== null)) {
      const fx = isObject(walkFx) ? walkFx : {};
      const missing = Array.isArray(fx.missing) ? fx.missing.filter((m): m is string => typeof m === 'string') : [];
      return {
        ...shell,
        walks: apart,
        walkNote: walksNote(typeof fx.home === 'string' ? fx.home : null, missing, apart.length),
        ...walkTable(apart[0]!, kind === 'bridge' || kind === 'forecast' ? apart[0]!.steps.length : limit, recordToday(now), false),
      };
    }
    const walk = walkOf(walked);
    const past = pastOf(remembered);
    return walk
      ? {
          ...shell,
          walk,
          ...(past ? { past } : {}),
          ...walkTable(walk, kind === 'bridge' || kind === 'forecast' ? walk.steps.length : limit, recordToday(now), false),
        }
      : cannot;
  }
  if (b.source === 'activity') {
    const feed = feedOf(fed);
    if (!feed) return cannot;
    /* WHAT EACH AGENT DID: the record grouped its rows by who, and the renderer draws one head per agent. */
    /* EVERY EVENT IS ON A ROW, a burst counted on its own and the rest past `first:` folded into one, so nothing is left out to say. */
    if (kind === 'agents') return { ...shell, feed, ...agentsTable(feed, now), total: feed.length };
    const seen = typeof mark === 'string' ? mark : null;
    const marks = b.since === 'seen' || mark !== undefined;
    return { ...shell, feed, ...(marks ? { seen } : {}), ...feedTable(feed, marks, seen, now, me, names), total: matched };
  }
  if (kind === 'diff') {
    const history = historyOf(versions);
    return history ? { ...shell, history, ...historyTable(history, Math.max(matched, history.length)) } : cannot;
  }

  const register = registerOf(b);
  /* A SOURCE NO ARM ABOVE KNOWS, a new one in the kernel's registry or the record's own, is drawn by its fields
     (`source-rows.ts`): each cell by the type the record answered for it, in the table, list or rows the block names. */
  if (!register && typeof source === 'string' && !source.startsWith('register.') && !source.startsWith('metric.') && SOURCE_DRAWN.has(kind)) {
    /* A RUN IS SAID AS THE RUN THE PAGE READ, its app and its day, never its handle. */
    const ran = new Map([...runs].flatMap(([handle, f]) => { const w = runWords(f); return w === null ? [] : [[handle, w] as const]; }));
    /* The home currency the record answered on the block, else the shell's. */
    const home = typeof homeSaid === 'string' && /^[A-Z]{3}$/u.test(homeSaid) ? homeSaid : homeCurrency();
    const laid = sourceRows(b, b, { now, home, names: ran });
    if (laid) {
      const columns = laid.columns.map((c) => ({ field: c.field, label: c.label, width: 'minmax(12ch,1fr)', align: END_TYPES.has(c.type) ? ('end' as const) : ('start' as const), truncate: c.type === 'money' ? ('never' as const) : ('end' as const) }));
      const rows = laid.rows.map((cells, n) => ({ key: laid.keys[n]!, cells, ...(laid.links[n] ? { href: laid.links[n]! } : {}) }));
      return { ...shell, columns, rows, shown: rows.length, total: Math.max(matched, rows.length) };
    }
  }
  /* A register the seed does not declare has no labels to draw with, and says so rather than drawing half an answer.
     WITH NO ROW TO LABEL THERE IS NO HALF ANSWER: a list this record does not hold yet, as a store's preview of an
     add-on draws it, says its heading and its own empty line. */
  if ((!register || !REGISTERS[register]) && sent.length === 0 && matched === 0 && kind === 'table') return shell;
  if (!register || !REGISTERS[register]) return cannot;
  /* THE NUMBERS A PROJECT REPORTED, worked out by the record: one series a measure, drawn as tiles or charts. */
  if (kind === 'stat' || kind === 'lines') {
    if (Array.isArray(measured)) {
      /* A PLAN IS NOT A READING (Q33 of 29 October): Numbers opened on "Monthly revenue a year out: base, bear, bull", a
         month old, as if measured. A project's page says its plan apart (`project-facts.ts` `planOf`); here it is left out. */
      const measures = measured.filter(isSeries).filter((m) => !isForecast(m.name));
      /* A MEASURE READ ONCE IS ITS READING, which a current record answers beside a `lines` block's lines (`latest`), and
         a `stat` has none of: its tiles are each a measure's newest reading already. */
      const latest = kind === 'lines' ? latestOf(readOnce).filter((m) => !isForecast(m.measure)) : [];
      /* EVERY MEASURE IS DRAWN, so nothing is cut: `matched` counts readings, which no tile or chart is one of. */
      const drawn = measures.length + latest.length;
      return { ...shell, register, measures, ...(latest.length > 0 ? { readOnce: latest } : {}), shown: drawn, total: drawn };
    }
  }
  /* A SUM OVER THE FIRST PAGE IS A WRONG NUMBER, so a kind that adds up draws only the whole answer, AND THE RECORD
     SENDS THE WHOLE NOW: `wholeRead`, one line a label with what every row under it adds to (`wholeRows`). His Ledger
     holds 217 rows and its bar by month was refused past 200; it is drawn from those lines, so its bars add to the
     list's own total however many rows came back beside them. The rows themselves are read while they are all there,
     because they hold every column and the lines hold two. A heat set against another whole (`of:`) reads the lines
     either way: only they say each day's whole.
     A RECORD THAT SENDS NO WHOLE STILL IS NOT ADDED UP FROM A SLICE. The record is a different deployment from this
     app, and one on an older kernel answers 200 rows of 301 with nothing beside them: that says it cannot be drawn. */
  let columns = shell.columns;
  /* AND A HEAT SAYS HOW MANY OF ITS ROWS NO CELL DRAWS (`outside`), whichever it was drawn from: its cells add to less
     than the list by that many, and the drawer says so under them (`blocks.ts` `outsideSaid`). */
  let outside = 0;
  let outsideDays: number | undefined;
  if (SUMS.has(kind)) {
    const adds = kind === 'heat' && (b.columns ?? []).length > 1 && (b as { who?: unknown }).who !== true;
    const lines = wholeOf(summed, kind, adds);
    if (kind === 'heat' && lines !== null) outside = outsideOf(summed) ?? 0;
    /* HOW MANY DAYS THOSE ARE, where the record says: forty entries on one old day are one day, and an entry with no
       day is none, so the sentence counts days and the arithmetic above still counts entries. */
    const days = (summed as { outsideDays?: unknown } | null)?.outsideDays;
    if (outside > 0 && counted(days)) outsideDays = days;
    const shares = kind === 'heat' && lines !== null && lines.some((l) => l.of !== undefined);
    if (sent.length < matched || shares) {
      const whole = lines === null ? null : wholeRows(kind, b.columns ?? [], lines);
      if (whole === null) return cannot;
      got = whole;
      /* A HEAT THAT DECLARES ONLY ITS DAY HAS NOWHERE TO SAY A SHARE, so the share is its second column here. */
      if (shares && shell.columns.length === 1) columns = [...shell.columns, { ...shell.columns[0]!, field: WHOLE_SHARE, label: WHOLE_SHARE }];
    }
  }
  /* AND WHETHER THE BLOCK IS DRAWING A SLICE IS THE OTHER QUESTION, which is `REDUCES` and not
     `SUMS`: a section adds nothing up and is still never showing a page of its answer, because the
     count it draws is `total`. One variable answered both here and the section half was wrong.
     Measured through `blockOf` on a section with 2 rows and `matched: 301`: `shown 2, total 301`,
     which is the condition `/p/[slug]` prints "Showing 2 of 301" on, under a heading that draws no
     row of its own and whose own count said 301. `api.ts` reads `REDUCES` for the same `shown` on
     the sample and printed nothing, so one declaration drew two different pages. */
  const reduces = REDUCES.has(kind);

  /* A BUDGET IS DRAWN AGAINST WHAT ITS FIGURE SPENT, which the record read beside the rows; without it there is no budget to draw. */
  const { spent, toward } = rest as { spent?: unknown; toward?: unknown };
  const figure = spent ?? toward;
  let spentBy: LiveBlock['spentBy'];
  if (kind === 'progress' && figure !== undefined) {
    const reading = readings?.[0]?.reading;
    if (typeof figure !== 'string' || !reading) return cannot;
    /* A GOAL'S PARTS ARE KEYED BY THE ROW THEY WERE LOGGED AGAINST, which the record groups by its id; the rows here are
       drawn by number, so each key is said as that row's number. */
    const seqOf = new Map(got.map((r) => [String(r.id), String(r.seq)]));
    const groups = (reading.groups ?? []).map((g) => ({ key: spent === undefined ? (seqOf.get(String(g.key)) ?? String(g.key)) : String(g.key), value: typeof g.value === 'number' ? g.value : null }));
    spentBy = { metric: figure, unit: typeof reading.unit === 'string' ? reading.unit : null, groups, ...(spent === undefined ? { toward: true } : {}) };
  }

  /* THE RUNS, ALL OF THEM OR THE ONES WORKING NOW (`sessions.working`, which the record already narrows by the one clock). */
  const live = b.source === 'sessions.live' || b.source === 'sessions.working';
  const entries = got.map((r) => entryOf(register, r, refs));
  /* HOW FAR ALONG A CARD IS FROM ITS STEPS, worked out by the record where the ring's own field is empty. Drawn through the
     field, so the ring reads as a typed one does; the row itself is not changed. */
  const ring = kind === 'cards' ? b.columns?.find((c) => c.as === 'ring')?.field : undefined;
  const drawnEntries = ring && Array.isArray(rings) ? entries.map((e, n) => (typeof rings[n] === 'number' ? { ...e, fields: { ...e.fields, [ring]: rings[n] } } : e)) : entries;
  const rows = toRows(register, drawnEntries, columns, now, namesOf(refs));
  /* WHO CHANGED EACH ROW LAST, named by the kernel on `changes`, and each money column's sign. */
  markColumns(register, b.columns, entries, rows, (_e, n) => changeOf(changed, n));
  /* A TABLE'S MONEY COLUMN AS ONE SET (recheck of 30 October, 34): no ".00" down a column of whole amounts, and every
     amount to the penny where one has pence, as a bar's figures are (`barFigures`). The Ledger's lines are a timeline,
     said to the penny by its own rule. */
  if (kind === 'table') moneySets(register, columns, rows);
  /* AND A ROW DUE SOON SAYS WHEN, in words and not an amber dot alone (`soonSaid`). */
  if (kind === 'table') soonSaid(register, columns, drawnEntries, rows, now);
  /* A COST OF NOTHING IS FREE (31 October, AG22): a free certificate's card read "£0" over "Cost". */
  if (kind === 'cards') freeSaid(register, columns, drawnEntries, rows);
  /* A LEDGER LINE STILL WAITING TO CLEAR SAYS SO IN THE TILE (finish F3), as the Ledger lists it apart and Budgets counts
     it: Money home's Ledger drew the pending £2,500 like any cleared line. Said at the end of the line under the name. */
  if (kind === 'timeline') pendingSaid(register, columns, entries, rows);
  /* WHETHER AN AGENT IS ON EACH ROW, which the record works out from the row's history and its live
     runs. Narrowed here like everything else the record sends: a `working_now` that is not an array
     of booleans is left off, and the block draws no dots rather than drawing one for `"yes"`. */
  const working = onIt === true;
  const workingNow = working && Array.isArray(atWork) ? atWork.map((v) => v === true) : undefined;
  /* WHERE A ROW APPLIES, and which project a run is in, are named by the kernel on `scopes`. */
  (b.columns ?? []).forEach((c, i) => {
    if (c.as !== 'scope' && !(live && c.field === 'project')) return;
    rows.forEach((row, n) => {
      row.cells[i] = scopes?.[n] ?? (live ? (row.cells[i] ?? null) : EVERYWHERE);
    });
  });
  /* AND THE CHIP EACH OF THOSE CELLS WEARS: the project's mark in its hue, or the globe for everywhere. A
     run's project is where it was placed, and a run placed nowhere is not "everywhere": its cell stays empty, so it
     draws nothing. A run that names a project wears its dot as a row of that project does, "on ● Kiln" in the card's
     meta line (agents F7), where it was a fact under a label. */
  const scopeCells = scopeCellsOf(b.columns ?? [], rows, scopeMarked);
  /* EACH CARD'S NEXT STEP IS THE RECORD'S ANSWER, `nexts`, written into the cell and never into the row, unlike a ring.
     The column names a field of the STEPS list, and the card's own list may hold a field of the same name: the measured
     desk's areas have a `what` of their own, so merged into the row it would also have replaced the card's `what` in
     any other column drawing it. A card with no open step says nothing there. */
  const nexts = kind === 'cards' && Array.isArray(nexted) && nexted.length === got.length ? nexted.map((v) => (typeof v === 'string' ? v : null)) : null;
  (b.columns ?? []).forEach((c, i) => {
    if (c.as !== 'next') return;
    rows.forEach((row, n) => {
      row.cells[i] = nexts?.[n] ?? null;
    });
  });
  /* AND EACH CARD'S TREND, `trends`, the record's reading of the column's `metric:` with the card's own fields filled
     in. Such a column names no field, so `toRows` drew it empty and this writes the run as the words `trendOf` reads,
     a gap as `-` and never as a zero. A card the record read nothing for draws no line. The record reads the first such
     column only (`pages.ts` `trendColumn`), so only that one is filled: a second would draw the first one's line. */
  const trends = kind === 'cards' && Array.isArray(trended) && trended.length === got.length ? trended : null;
  const trendAt = (b.columns ?? []).findIndex((c) => c.as === 'trend' && typeof c.metric === 'string');
  if (trendAt >= 0)
    rows.forEach((row, n) => {
      const run = trends?.[n];
      row.cells[trendAt] = Array.isArray(run) ? run.map((v) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : '-')).join(' ') : null;
    });
  /* AND EACH CARD'S WHEN OVER A FIGURE, `whens`: the days the record read for the card, said in words in
     its head, the column's label leading ("Worked on 2 days ago"). A figure past its target says the days as quiet
     ("Quiet for 40 days") and tones the card late, the word beside the colour. A card the record read nothing for draws
     no line. */
  const whens = kind === 'cards' && Array.isArray(whened) && whened.length === got.length ? whened : null;
  const whenAt = (b.columns ?? []).findIndex((c) => c.as === 'when' && typeof c.metric === 'string');
  if (whenAt >= 0)
    rows.forEach((row, n) => {
      row.cells[whenAt] = whenSaid(whens?.[n], typeof b.columns?.[whenAt]?.label === 'string' ? (b.columns[whenAt]!.label as string) : undefined);
      if ((whens?.[n] as { met?: unknown } | null | undefined)?.met === false && !row.tone) Object.assign(row, { tone: 'bad' });
    });
  /* AND THE MOMENT AND WHOSE RUN IT WAS, where the figure says them (`project-worked`),
     aligned with the rows, so a project's card on any page says the time Today's says. */
  const lastWorked = whens?.some((w) => workedAtOf(w) !== null) ? whens.map(workedAtOf) : null;
  /* AND EACH CARD'S FACTS OVER A FIGURE, `facts`: a count as its number and money as the page says money, a
     fact the record read nothing for drawn as no fact rather than 0. */
  if (kind === 'cards' && Array.isArray(facted) && facted.length === got.length)
    factCells(b.columns ?? [], facted, money).forEach((cells, n) => {
      const row = rows[n];
      if (row) for (const c of cells) row.cells[c.at] = c.text;
    });
  /* EACH CARD'S GROUP BY NAME, READ OFF ITS OWN ROW (`PageRow.group` in the kernel's `pages.ts`): the record puts it on
     the row and not beside the rows, so a block held from a reader keeps no name of a list she may not read. A card the
     record says points at nothing (`value: ''`, "No project") and a group that is not text are drawn among the
     ungrouped rather than under a heading of something else. A record on an older build answered the names beside the
     rows, `groups`, which is read the same way when no row says its own. */
  const cardGroups = kind === 'cards' ? groupsOf(got, groupNames) : kind === 'table' ? tableGroupsOf(got) : null;
  /* A TABLE'S ROWS SAY THEIR GROUP THEMSELVES, `group` on each drawn row, which the table reads (`tableLines` in the
     renderer): a page slices a folded table's rows and marks the ones that arrived, and a name on the row goes where
     the row goes, where a list beside the rows would have to be cut the same way at every step. */
  if (kind === 'table' && cardGroups)
    rows.forEach((row, n) => {
      const name = cardGroups[n];
      if (name) Object.assign(row, { group: name });
    });
  /* WHO CHANGED EACH ROW LAST, AS A BYLINE (`bylineOf`): an agent, an app, a rule or Slash, for whom, and whether the
     reader has seen it. Only where the record said a change for some row; a row you changed yourself carries none. */
  const lines = Array.isArray(changed) && changed.length === got.length ? got.map((_r, n) => bylineOf(changed[n], me, names, now, typeof mark === 'string' ? mark : null)) : null;
  const bylines = lines?.some((l) => l !== null) ? lines : null;
  /* A PATH'S MARKS ARE THE RECORD'S, one a row, and the first open one's place. A path under `first:` SAYS ITS OWN REST
     as "N more" (`blocks.ts` `pathRows`), so `shown` is the whole match and the page's slice line is not drawn under it
     as the same count told twice. */
  const marks = kind === 'steps' && Array.isArray(doneNow) && doneNow.length === got.length && doneNow.every((d) => typeof d === 'boolean') ? (doneNow as boolean[]) : null;
  const path = marks ? { done_now: marks, next: typeof nextAt === 'number' && Number.isInteger(nextAt) && nextAt >= 0 && nextAt < marks.length ? nextAt : null } : {};
  const short = marks !== null && typeof rest.first === 'number';
  /* AND HOW MANY STEPS ARE OPEN, which the short view's "N more" is counted from: `matched` holds the done ones too. */
  const open = short && typeof openSteps === 'number' && Number.isInteger(openSteps) && openSteps >= 0 ? { open: openSteps } : {};
  /* A TABLE'S COLUMN WITH NOTHING IN ANY ROW IS NOT DRAWN (next-money, M37): a plan's Paid table headed "Paid by" over a
     column empty on every row, the width of a word nobody filled. Last, once every rule that reads a column by its place
     has run, and only while some column still says something. */
  if (kind === 'table' && rows.length > 0) {
    const said = (c: unknown) => typeof c === 'string' && c.trim() !== '' && c !== MISSING;
    const keep = columns.map((_c, i) => rows.some((r) => said(r.cells[i])));
    if (keep.includes(false) && keep.includes(true)) {
      columns = columns.filter((_c, i) => keep[i]) as typeof columns;
      for (const r of rows) r.cells = r.cells.filter((_c, i) => keep[i]);
    }
  }
  return {
    ...shell,
    ...(columns === shell.columns ? {} : { columns }),
    register,
    entries,
    matched: entries,
    rows,
    shown: reduces || short ? matched : entries.length,
    total: matched,
    ...path,
    ...open,
    ...(spentBy === undefined ? {} : { spentBy }),
    ...(outside > 0 ? { outside } : {}),
    ...(outsideDays === undefined ? {} : { outsideDays }),
    names: namesOf(refs),
    ...(cardGroups ? { groups: cardGroups } : {}),
    ...(bylines ? { bylines } : {}),
    ...(inherited === undefined ? {} : { inherited }),
    /* GONE QUIET AS THE RECORD SAYS IT (`isQuiet`): open, and not heard from in 15 minutes (`WORKING_MS`), read off its
       `last_seen` alone, so a run that never said it is never shown at work. */
    ...(live ? { quiet: got.map((r) => isQuiet({ fields: r.fields as never }, now)) } : {}),
    ...(working ? { working } : {}),
    ...(workingNow ? { working_now: workingNow } : {}),
    ...(scopeCells ? { scopeCells } : {}),
    ...(lastWorked ? { lastWorked } : {}),
  };
}

/**
 * When a card's project was last worked on, from its when figure's reading: the moment, the agent whose run it was or
 * `null` for a task, and whether it is past its target. `null` where the figure said no moment.
 */
export function workedAtOf(when: unknown): WorkedAt | null {
  if (!when || typeof when !== 'object') return null;
  const { at, by, met } = when as { at?: unknown; by?: unknown; met?: unknown };
  if (typeof at !== 'string' || !Number.isFinite(Date.parse(at))) return null;
  return { at, by: typeof by === 'string' && by.trim() !== '' ? by.trim() : null, quiet: met === false };
}

/**
 * A block's `{{path}}` resolver, over the values the record answered.
 *
 * Formatting is the reader's, as `05 §7.1` rule 3 says: money as money, a count as a count. A value
 * the record did not send is `null`, which the renderer draws as `—`.
 *
 * A FIGURE THAT IS A DAY IS WRITTEN AS ONE. The record sends a figure's number and not its shape, so `cash-as-of`, a day
 * held as whole days since 1970, was written as a count: Money's "Out of date" note read "The oldest balance in Cash
 * now is from 20,690", and now reads "from 25 Aug". ONLY A DAY: every other shape is a count the sentence names the unit
 * of itself, and `days` through `format` made Money's lead "runs out in 12 days days" and kept a nought clause `leadOf`
 * drops.
 */
export function resolverOf(values: Record<string, unknown> | undefined): (path: string) => string | null {
  /* ONE RULE A SENTENCE (polish5, 2 Nov): a block's figures are said into one sentence, so where any money among them is
     a thousand or more, and so whole, every amount it says is whole: Budgets' "$951.67 a month across 3 categories.
     $2,586 spent this month" said money two ways in one line. Read once, from the figures as each alone would be said. */
  let big: boolean | null = null;
  const all = (): boolean => (big ??= Object.keys(values ?? {}).some((k) => BIG_AMOUNT.test(sayOf(values, k, false) ?? '')));
  return (path) => sayOf(values, path, all());
}

/** One figure of a block as its sentence says it; `all`, every amount whole (`resolverOf`). */
function sayOf(values: Record<string, unknown> | undefined, path: string, all: boolean): string | null {
  const wholeMoneyIn = (text: string) => wholeMoneyOf(text, all);
  {
    if (!values || !Object.hasOwn(values, path)) return null;
    const v = values[path];
    /* `<figure>.since` IS A DAY, said as the month a person would: "quiet since April", and the year only when it is not
       this one. */
    if (path.endsWith('.since') && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(v)) return monthOf(v);
    /* BY THE FIGURE'S OWN NAME, a parameter taken off (`cash-as-of:hsbc` is `cash-as-of`), so a figure read for one
       group of a grouped day figure is a day too: "3 Sep", never 20,699. */
    const figure = path.includes(':') ? path.slice(0, path.indexOf(':')) : path;
    /* `<figure>.on` IS THE DAY A WALK GOES UNDER (`pages.ts` `crossingValue`), `.low_on` the day it is lowest, and
       `.rate_on` the day of the rates a sum was converted at (`convertedValue`), each said as any day figure is. */
    const dayFigure = (Object.hasOwn(METRICS, figure) && METRICS[figure]?.format === 'day') || path.endsWith('.on') || path.endsWith('.low_on') || path.endsWith('.rate_on');
    /* A DAY FIGURE THE RECORD ANSWERED AS ITS ISO DAY (`pages.ts` `valueAt`) is said as the same figure is said from its
       count of days, so "the last part on 1 Jun" and never "on 2027-06-01". */
    if (dayFigure && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(v) && !Number.isNaN(Date.parse(v))) return format('day', Date.parse(v) / 86_400_000);
    if (typeof v === 'string') return v;
    if (typeof v === 'number') {
      if (dayFigure) return format('day', v);
      /* A MONEY FIGURE THE RECORD ANSWERED WITH NO CURRENCY (a sum of nothing) is said in the home one, never a bare "0". */
      const shape = Object.hasOwn(METRICS, figure) ? METRICS[figure]?.format : undefined;
      /* AND IN WHOLE UNITS, AS EVERY SENTENCE SAYS MONEY (recheck of 30 October, 34): "£11,317" stood beside
         "£3,655.20" in one line. The tiles and the Ledger keep their pennies; a sentence does not. */
      if (shape === 'money' || shape?.startsWith('money.')) return wholeMoneyIn(format(shape, v));
      return Number.isInteger(v) ? integer(v) : String(v);
    }
    if (typeof v === 'boolean') return v ? 'yes' : 'no';
    /* A FIGURE IN SEVERAL CURRENCIES, one amount a currency, written as a tile writes its parts. `<figure>.apart` IS A
       LINE'S, so its amounts are said as a sentence says them: "EGP 40,000.00 and $10,000.50". */
    if (Array.isArray(v)) {
      const parts = v.filter((p): p is { amount: number; currency: string } => isObject(p) && typeof p.amount === 'number' && typeof p.currency === 'string');
      if (!parts.length || parts.length !== v.length) return null;
      if (!path.endsWith('.apart')) return wholeMoneyIn(partsText(parts));
      const said = parts.map((p) => wholeMoneyIn(money(Math.round(p.amount), p.currency)));
      return said.length === 1 ? said[0]! : `${said.slice(0, -1).join(', ')} and ${said.at(-1)}`;
    }
    if (v !== null && typeof v === 'object') {
      const { amount, currency } = v as { amount?: unknown; currency?: unknown };
      /* `<figure>.converted` IS ABOUT THAT MUCH, in whole units (`convertedValue`), so it is said with no pennies. */
      if (typeof amount === 'number' && typeof currency === 'string') return wholeMoneyIn(money(amount, currency));
    }
    return null;
  }
}

/**
 * The resolver a block's renderer is handed: `resolverOf`, and `UNNAMED` for a path the record says names nothing
 * (`unnamed`), so the author's words are printed in prose and the figure is left out of a chip, a tile or a bar. A path
 * that names something and holds no value is still `null`, the dash.
 */
export function namedResolverOf(values: Record<string, unknown> | undefined, unnamed: readonly string[] | undefined): Resolve {
  const said = resolverOf(values);
  const none = new Set(unnamed ?? []);
  return (path) => (none.has(path) && !(values && Object.hasOwn(values, path)) ? UNNAMED : said(path));
}

/** A day as its month, `April`, with the year when it is not this year's, `April 2025`. */
function monthOf(day: string): string {
  const at = new Date(`${day}T12:00:00Z`);
  const month = at.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });
  return at.getUTCFullYear() === new Date().getUTCFullYear() ? month : `${month} ${at.getUTCFullYear()}`;
}

/* A FILE'S NAME IS ITS HASH, and only a hash in the one shape the record writes is ever put in an address: a value an
   agent wrote into a row is not a path segment until it is proven to be 64 hex digits (`kernel/src/coerce.ts` `file`). */
const SHA256 = /^[0-9a-f]{64}$/u;

/** The hash a stored file is kept under, or null for a value that is no file. */
function sha256Of(v: unknown): string | null {
  if (!isObject(v)) return null;
  const { sha256 } = v;
  return typeof sha256 === 'string' && SHA256.test(sha256) ? sha256 : null;
}

/**
 * Where each file a block draws is served, by the row and the field that hold it: the page's `RenderOptions.file`.
 *
 * THE RENDERER NAMES A FILE BY WHERE THE RECORD KEEPS IT, `file:<list>#<seq>/<field>`, and never by its address, because
 * only the host knows the address (`packages/render/src/gallery.ts`). The record's page answer already carries each
 * file's stored value, `{ sha256, mime, bytes, name }`, so the address is made from what the block holds and nothing is
 * fetched to find it. Three places hold one:
 * - the rows a block drew over a list, a card's `picture` among them (`entries`, beside `register`);
 * - the rows the record answered a registered kind with (`answer.rows`, over `answer.source`), a `gallery` over a list;
 * - a `gallery`'s written-out rows, whose files the record answers in `answer.files`, one a row in the rows' order, so
 *   the reference its author typed finds the file the record looked up for it.
 *
 * The answer is RECORD-RELATIVE, `/api/files/<sha256>`: the page places it under the record it is on, as it places every
 * other address the renderer draws (`RenderOptions.href`, `at`). A file the block does not hold, or one the record could
 * not find, answers `null`, and the tile or card draws its caption and no picture, never a reference as words.
 */
export function fileAt(block: LiveBlock): (row: string, field: string) => string | null {
  const held = new Map<string, string>();
  const keep = (list: string, seq: unknown, fields: unknown): void => {
    if (!isObject(fields) || typeof seq !== 'number' || !Number.isInteger(seq) || seq < 1) return;
    for (const [field, v] of Object.entries(fields)) {
      const sha256 = sha256Of(v);
      if (sha256) held.set(`${list}#${seq}/${field}`, sha256);
    }
  };
  if (block.register) for (const e of block.entries) keep(block.register, e.seq, e.fields);
  const answer: unknown = block.answer;
  if (isObject(answer)) {
    const { source, rows, authored, files } = answer;
    const list = typeof source === 'string' && source.startsWith('register.') ? source.slice('register.'.length) : '';
    if (list && Array.isArray(rows)) for (const r of rows) if (isObject(r)) keep(list, r.seq, r.fields);
    if (Array.isArray(authored) && Array.isArray(files) && files.length === authored.length)
      authored.forEach((r, n) => {
        const cells = isObject(r) && Array.isArray(r.cells) ? r.cells : [];
        const said = cells.find((c): c is string => typeof c === 'string' && c.trim().startsWith('file:'));
        const sha256 = sha256Of(files[n]);
        if (said && sha256) held.set(said.trim().slice('file:'.length).trim(), sha256);
      });
  }
  return (row, field) => {
    const sha256 = held.get(`${row}/${field}`);
    return sha256 ? `/api/files/${sha256}` : null;
  };
}

/**
 * THE PAGES A RECORD HOLDS, AS ADDRESSES WITH THEIR TITLES, because the reader is standing at an
 * address that did not work. This answered titles alone, so `/p/say-what-it-is-and-who-it-is-for`
 * offered "Your project" to somebody who had just typed a slug, and the page titled Your project
 * answers at `/p/home-guide`: both words on offer refuse again when typed.
 */
const heldOf = (listed: unknown): { address: string; title?: string }[] =>
  Array.isArray(listed)
    ? listed.flatMap((p) => {
        const said = p !== null && typeof p === 'object' ? (p as { page?: unknown; slug?: unknown; title?: unknown }) : {};
        const address = typeof said.slug === 'string' ? said.slug : typeof said.page === 'string' ? said.page : null;
        if (address === null) return [];
        return [typeof said.title === 'string' ? { address, title: said.title } : { address }];
      })
    : [];

/**
 * A PAGE'S BLOCKS WITH ITS FOOT UNDER THEM: one note, and only when a figure above it was converted at rates that are
 * out of date. `answered` and `drawn` are the same blocks, as the record sent them and as `blockOf` drew them.
 *
 * THE DAY NAMED IS THE OLDEST, because that is the figure furthest from true. A block that is not drawn, or that drew
 * no figure, asks for nothing; so does a figure still in parts, whose own sentence is about a rate that is missing and
 * stays under it. With nothing out of date the blocks come back as they were handed in.
 *
 * THE FOOT IS MARKED `synthetic`, AS NO BLOCK OF THE DECLARATION, and `actions` is the record's scheduled actions, which
 * choose the way on it offers (`footWords.ratesStale`); `null` where they could not be read.
 */
export function footed(answered: readonly Answered[], drawn: LiveBlock[], now: number, actions: readonly { ingest: string; writes?: string | null }[] | null): LiveBlock[] {
  const oldest = oldestStale(answered, drawn);
  if (oldest === null) return drawn;
  const way: RatesWay = actions === null ? 'unread' : ratesActionOf(actions) ? 'held' : 'none';
  const age = Math.max(0, Math.round((Date.parse(`${recordToday(now)}T00:00:00Z`) - Date.parse(`${oldest}T00:00:00Z`)) / 86_400_000));
  /* AMBER, as anything out of date is: a week is when a rate is, the day `fx.ts` marks a figure stale. */
  const foot = { kind: 'note', key: 'rates-out-of-date', span: 12, tone: 'warn', body: footWords.ratesStale(fmtDay(oldest), way, age, pairsSaid(answered, drawn, oldest)), rows: [], matched: 0, refusals: [] };
  return [...drawn, { ...blockOf(foot as unknown as Answered, new Map(), now), synthetic: true }];
}

/**
 * The oldest day a drawn figure was converted at out of date rates, or `null` where the page has no foot to say.
 *
 * EVERY PLACE A PAGE DRAWS A CONVERTED FIGURE ASKS, where only tiles did: a bar or a split over a
 * figure is that figure in its parts (`parts`), and a sentence with a figure in it says the same amount in words
 * (`staleSaid`). A bar or a split over a list's own money is converted here, on the drawn block, and says its day
 * through `staleOf`. A block this build could not draw says no figure, so it asks nothing.
 */
function oldestStale(answered: readonly Answered[], drawn: readonly LiveBlock[]): string | null {
  const days = answered.flatMap((b, i) => {
    const d = drawn[i];
    if (!d || d.drawn === false || d.cannot !== undefined) return [];
    const read = d.metrics || d.parts ? (b.readings ?? []).flatMap((c) => (staleRead(c.reading) ? [c.reading.fx.asOf] : [])) : [];
    const own = d.kind === 'bar' || d.kind === 'split' ? staleOf(d) : null;
    return [...read, ...staleSaid(b), ...(own === null ? [] : [own])];
  });
  return days.length === 0 ? null : days.reduce((a, b) => (b < a ? b : a));
}

/**
 * The days a block's `{{path}}` figures were converted at out of date rates (`values_fx`), each for a path the block
 * holds a value for. A record on an older kernel sends none, and its sentences ask for nothing, as before.
 */
function staleSaid(b: Answered): string[] {
  const how = b.values_fx;
  if (!isObject(how) || !b.values) return [];
  return Object.keys(how).flatMap((path) => {
    const fx = how[path];
    const said = Object.hasOwn(b.values!, path) && isObject(fx) && fx.stale === true && typeof fx.asOf === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(fx.asOf);
    return said ? [(fx as { asOf: string }).asOf] : [];
  });
}

/**
 * The rates the oldest day's figures were converted at, as a person reads them: "$1 = EGP 50.50", one a currency and
 * "and" between them, or `''` where the record sent none (`FxRead.pairs`). A rate under one is said the other way round,
 * "£1 = EGP 64.52", so it is never a fraction of a penny.
 */
function pairsSaid(answered: readonly Answered[], drawn: readonly LiveBlock[], day: string): string {
  const seen = new Map<string, string>();
  const take = (fx: unknown): void => {
    if (!isObject(fx) || fx.asOf !== day || typeof fx.into !== 'string' || !Array.isArray(fx.pairs)) return;
    for (const p of fx.pairs as unknown[]) {
      if (!isObject(p) || typeof p.from !== 'string' || typeof p.rate !== 'number' || !(p.rate > 0) || seen.has(p.from)) continue;
      seen.set(p.from, rateSaid(p.from, fx.into, p.rate));
    }
  };
  answered.forEach((b, i) => {
    const d = drawn[i];
    if (!d || d.drawn === false || d.cannot !== undefined) return;
    for (const c of b.readings ?? []) take(c.reading?.fx);
    if (isObject(b.values_fx)) for (const fx of Object.values(b.values_fx)) take(fx);
  });
  const said = [...seen.values()];
  return said.length <= 1 ? (said[0] ?? '') : `${said.slice(0, -1).join(', ')} and ${said.at(-1)}`;
}

/** One rate as a person reads it: one of a currency in the other, `$1 = EGP 50.50`, the larger way round. */
function rateSaid(from: string, into: string, rate: number): string {
  const [one, other, by] = rate >= 1 ? [from, into, rate] : [into, from, 1 / rate];
  const whole = (currency: string): string => money(10 ** exponentOf(currency), currency).replace(/\.0+$/u, '');
  return `${whole(one)} = ${money(Math.round(by * 10 ** exponentOf(other)), other)}`;
}

/**
 * A READ OF ONE PAGE, NARROWED BY THE READER'S CHOICE when they made one (`?f.thing=12`, `$lib/page/filters.ts`).
 * Every block over a list with that field is narrowed by the kernel, and the answer's `filters` carries what may be
 * chosen next; an empty choice is no choice, and the page is asked for by its slug alone.
 */
export type PageReader = {
  read(slug: string, filter?: Readonly<Record<string, string>>, opts?: ReadOpts): Promise<Opened>;
  /** The last live answer this tab drew of the page as this choice narrowed it, else `null`: drawn while `read` is out. */
  kept(slug: string, filter?: Readonly<Record<string, string>>): Opened | null;
};

/** WHAT A READ IS ASKED BESIDE THE PAGE: a length picked past the walk's reach (`walk`). */
export type ReadOpts = { walk?: Walked };

/** A length a reader picked on a forecast's horizon knob: whole days, or `last`, to the last dated movement. */
export type Walked = number | 'last';

/**
 * THE LENGTHS READERS PICKED PAST HOW FAR A WALK REACHES, by page. A forecast walks two years at most unasked (the
 * kernel's `WALK_UNASKED`), so five years is a length the page asks the record for when somebody picks it, and every
 * read of that page after it asks again: a re-read when the record moves would otherwise walk two years and pull the
 * chart back from under the reader. Held for the tab and not by one reader, because Home reads its page through a new
 * reader each time. A page left lets it go (`forgetWalks`), so the next visit opens on what the page opens on.
 */
const WALKS = new Map<string, Walked>();

/** Asks every later read of `slug` to walk `length` (`BlockSlot.svelte`, as the horizon knob is pressed). */
export function askWalk(slug: string, length: Walked): void {
  if (length === 'last' || (Number.isInteger(length) && length > 0)) WALKS.set(slug, length);
}

/** The length asked for on `slug`, if any. */
export const walkAsked = (slug: string): Walked | undefined => WALKS.get(slug);

/** Lets go of every length asked, but the one on the page still being read. */
export function forgetWalks(but: string | null = null): void {
  for (const slug of [...WALKS.keys()]) if (slug !== but) WALKS.delete(slug);
}

/** How long the page asked before the app arrived stands: the app's own code on a cold phone, and no longer. */
export const EARLY_PAGE_MS = 15_000;

/** Lets go of the page asked before the app arrived, unread, so no later read is handed it (`earlyPage`). */
export const dropEarlyPage = (): void => {
  (globalThis as { __bdPage?: unknown }).__bdPage = undefined;
};

/**
 * THE PAGE THE PAGE ASKED FOR BEFORE THE APP ARRIVED (`app.html`, an address `/p/<slug>` with nothing after it), as a
 * fetch that answers that one ask with it and sends every other, taken once and only for the address the reader would
 * ask at, or `null`. A page's first read waited for its whole code before it went out, two seconds and more on a cold
 * phone (speed-d SD2); a guess that turns out wrong is left unread, and the reader asks as it always did.
 *
 * ONE CHANCE, AND A SHORT ONE (RF6): the first page read of the tab takes it or lets it go, whatever it asks, and one
 * asked more than `EARLY_PAGE_MS` ago is let go. It was kept until a plain read of the same address came, so a first
 * screen that read another way (a walk, a filter, a reader of its own) left it standing, and the next plain read of
 * that page, minutes and writes later, was handed the answer from when the tab opened.
 */
export function earlyPage(base: string, slug: string, now: number = Date.now()): Fetch | null {
  const url = new URL(`${base}/api/page`);
  url.searchParams.set('slug', slug);
  url.searchParams.set('shape', '1');
  const held = (globalThis as { __bdPage?: { url?: unknown; at?: unknown; t?: unknown } }).__bdPage;
  dropEarlyPage();
  if (!held || held.url !== url.toString() || !(held.at instanceof Promise)) return null;
  if (typeof held.t !== 'number' || !(now - held.t >= 0 && now - held.t <= EARLY_PAGE_MS)) return null;
  let early: Promise<Response> | null = held.at as Promise<Response>;
  return ((input: string | URL | Request, init?: RequestInit) => {
    const at = early;
    if (at !== null && String(input) === url.toString() && (init?.method ?? 'GET') === 'GET') {
      early = null;
      return at;
    }
    return globalThis.fetch(input, init);
  }) as Fetch;
}

/** A page reader for one tab. `base` is the page's own origin; the app never holds a token. */
export function pageReader(base: string, io?: Fetch, clock: () => number = () => Date.now()): PageReader {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  /* EACH MAP BY THE WALK IT WAS MADE FROM, so a walk the tab asked again makes it again. */
  const maps = new Map<string, { rows: RecordRow[]; map: RefMap }>();

  /* A REF ARRIVES AS THE TARGET ROW'S ULID, so each register a ref points at is walked once and kept,
     as the row reader does. A register this reader may not list is left out, and its refs draw as ids. */
  const walked = new Map<string, RecordRow[]>();
  /* A WALK OUT IS SHARED, as the walks go out together: a list a ref and a bar both point at is asked once. */
  const walking = new Map<string, Promise<RecordRow[] | null>>();
  function rowsOf(register: string): Promise<RecordRow[] | null> {
    /* THE TAB'S WALK IS ASKED ON EVERY READ, since it keeps itself and asks again after a write this tab sent. Kept here
       as well, it outlived that write: a person an Orders box made drew as "Unnamed person" on the page read after it,
       until the page was opened again (audit 31 Oct n, AN18). A reader with a fetch of its own keeps its own walk. */
    const kept = io ? walked.get(register) : undefined;
    if (kept) return Promise.resolve(kept);
    let out = walking.get(register);
    if (!out) {
      out = walk(register).finally(() => walking.delete(register));
      walking.set(register, out);
    }
    return out;
  }
  /* THE TAB'S WALK (`ref-rows.ts`), shared by every reader and kept while the log says the list has not moved; a reader
     handed a fetch of its own walks for itself. */
  async function walk(register: string): Promise<RecordRow[] | null> {
    const rows = io ? await walkRows(client, register) : await tabRows(client, base, register);
    if (rows) walked.set(register, rows);
    return rows;
  }
  const asked = new Map<string, Promise<void>>();
  async function mapOf(register: string): Promise<RefMap | null> {
    /* A use case's own list is declared before it is walked, or its rows have no title to be named by. */
    await learn(client.schema, register, asked);
    const rows = await rowsOf(register);
    if (!rows) return null;
    const kept = maps.get(register);
    if (kept && kept.rows === rows) return kept.map;
    const map = refMapOf(register, rows);
    maps.set(register, { rows, map });
    return map;
  }

  const answer = {
    async read(slug: string, filter?: Readonly<Record<string, string>>, opts: ReadOpts = {}): Promise<Opened> {
      /* `client.page` drops an empty choice, so the page is asked for by its slug alone. A record that does not read
         `filter` answers the whole page.

         AND A LENGTH PICKED PAST THE WALK'S REACH IS ASKED FOR BY NAME (`walk`), which the record hands the kernel and
         the kernel walks only where a block offers it. Through `call`, as the client's `page` takes no length yet; a
         record that does not read `walk` keeps it as text it never looks at, and answers the walk it would have.

         AND A PROJECT'S SHAPE IS ASKED WITH IT (`shape`, scope 2026-10-24 A20): on a page about a project's row that draws
         its parts, the record answers what they draw beside the blocks, and nothing is read for them after. Any other page
         is answered as it was. */
      const walk = opts.walk ?? WALKS.get(slug);
      /* THE FIRST READ OF A PAGE OPENED BY ITS ADDRESS MAY HAVE GONE OUT WITH THE PAGE ITSELF (`earlyPage`). */
      const plain = walk === undefined && io === undefined && !(filter && Object.keys(filter).length);
      const early = plain ? earlyPage(base, slug) : null;
      if (!plain) dropEarlyPage();
      const out =
        walk === undefined
          ? await (early ? createClient({ base, fetch: early }) : client).page(slug, filter, { shape: true })
          : await client.call<unknown>('page', { slug, ...(filter && Object.keys(filter).length ? { filter } : {}), walk, shape: '1' });
      if (!out.ok) {
        if (!('refusal' in out)) return { from: 'refused', fix: liveWords.changed };
        if (out.refusal.code === 'PAGE_UNKNOWN') {
          const listed = await client.pages();
          return { from: 'missing', held: listed.ok ? heldOf(listed.value) : [] };
        }
        return { from: 'refused', fix: out.refusal.fix };
      }

      const { blocks = [], read_at, look: arranged, ...bare } = out.value as AnsweredPage;
      /* WHAT EACH FIGURE ON IT IS, AS THE RECORD SAID, before a block's figure is read below; this build's own tables
         only for a record that said nothing of them (`figures-known.ts`). */
      const owed = figuresFor(blocks);
      if (owed) await owed;
      /* THE ZONE THE PAGE WAS READ IN IS THE RECORD'S, which every day drawn from it is counted in (`zone.ts`). */
      learnZone((out.value as { zone?: unknown }).zone);
      /* HOW THE ENGINE ARRANGED IT, narrowed, and left off a page whose look this build cannot read. */
      const look = lookOf(arranged);
      const page: LivePageDecl = look ? { ...bare, look } : bare;
      /* TODAY IS THE RECORD'S, where it says what its clock read, so a record pinned to a day draws its own late rows,
         out-of-date balances and forecast from that day. A record that does not say is read against this clock. */
      const said = typeof read_at === 'string' ? Date.parse(read_at) : Number.NaN;
      const now = Number.isFinite(said) ? said : clock();
      /* EVERY LIST A BLOCK DRAWS IS ASKED FOR, through `learn`, whether or not this build ships it. A use case's own
         lists are declared by the record and by no file here, and a page over them drew
         "cannot be drawn" on every block. This then skipped any list the bundle holds, so a field added to Projects at
         run time was on the record and in no block over Projects: measured in `field-write.test.ts`, where the page
         asked for `page` and nothing else. `learn` keeps what it asked per reader, so a list two blocks draw is asked once.

         THE ASKS GO OUT TOGETHER, in the page's own order, the figures' lists among them (below): one after another, a
         page of six lists waited six round trips before its first block. `learn` never throws and a refused ask
         changes no list, so one list the record will not describe is said by its own block and the rest draw. */
      const learning = new Set<string>();
      for (const b of blocks) {
        const register = b.refusals?.length ? null : registerOf(b);
        if (register) learning.add(register);
      }
      for (const b of blocks) {
        const by = b.refusals?.length || partsNamed(b) ? null : groupedBy(b);
        if (by) learning.add(by.register);
      }
      await Promise.all([...learning].map((register) => learn(client.schema, register, asked)));
      const wanted = new Set<string>();
      for (const b of blocks) {
        const register = b.refusals?.length ? null : registerOf(b);
        if (register) for (const target of targetsOf(register)) wanted.add(target);
      }
      /* A FIGURE GROUPED BY A REF NAMES ITS PARTS FROM THE LIST THE REF POINTS AT, which no `register.` source asks
         for: the figure's own list is learnt, so its field is known to be a ref, and its target walked like any other.
         Not where the record named every part itself (`label`), which a current kernel does. */
      for (const b of blocks) {
        const by = b.refusals?.length || partsNamed(b) ? null : groupedBy(b);
        if (!by) continue;
        const target = partsTarget(b);
        if (target) wanted.add(target);
      }
      /* WHO IS READING, for a feed that names the reader as You: the shell's own `boot`, kept, so it costs no call. */
      const booting = blocks.some((b) => b.source === 'activity') ? readBoot(base, io) : null;
      /* THE LINKED LISTS ARE WALKED TOGETHER, one step deep as before (a target's own targets are not walked), and kept
         in the order they were wanted. A list this reader may not walk is left out alone. */
      const mapping = Promise.all([...wanted].map(async (target) => [target, await mapOf(target)] as const));
      /* THE PAGE IS THE ANSWER, AND THE ONE DERIVED KEY IS DERIVED FROM THE ANSWER. `identity` names
         the row a page is ABOUT, and it is what the page and its rail row wear a project's colour
         from; the record does not send it, but an expanded page sends `param`: the register, the
         number and the title of the row it was expanded from, which is the same row. So a live
         project page carries its own hue for the reason the sample's does (`pages.ts` sets both from
         one pair), rather than losing it to a key nobody carried across. What the record sent wins. */
      const identity = page.identity ?? (page.param ? { register: page.param.register, seq: page.param.seq } : undefined);
      /* A BAR OVER A LIST OF LINKS adds up what the linked rows hold: an organisation's balance is the money in the
         accounts it names. The linked list is walked once, as a ref's target is, and each row's money is handed on by id. */
      const linked = new Map<number, Record<string, unknown>>();
      const linking = Promise.all([...blocks.entries()].map(async ([i, b]) => {
        if (b.refusals?.length || (b.kind !== 'bar' && b.kind !== 'split')) return;
        /* The linked list's money field is known once its own list is learnt, which the walk beside this one asks too. */
        const register = registerOf(b);
        const field = b.columns?.[1]?.field;
        const to = register && field ? fieldOf(register, field)?.to : undefined;
        if (typeof to === 'string' && to !== '') await learn(client.schema, to, asked);
        const link = linkOf(register, field);
        if (!link) return;
        const rows = await rowsOf(link.to);
        /* BY THE ULID AND BY THE NUMBER, because the element the bar looks up is no longer the one that
           arrived. `entryOf` resolves a `list<ref>` element to the target row's SEQUENCE as of
           `a4d0111d`, which is what a person says and what every other screen wants; this map was
           written before that and keyed only by the ULID the record sends. The lookup then missed on
           every row, every row was skipped as linking to nothing, and the founder use case's "Balance
           by organisation" drew its empty line, "No organisation lists an account yet", on a record
           whose three organisations each hold an account. It was caught in a marketing capture rather
           than by a test, which is why the test beside this one drives both forms. */
        if (rows)
          linked.set(
            i,
            Object.fromEntries(
              rows.flatMap((r) => {
                const held = r.fields[link.money];
                return r.seq === null ? [[r.id, held] as const] : [[r.id, held] as const, [String(r.seq), held] as const];
              }),
            ),
          );
      }));
      /* A RUN A BLOCK NAMES IS ASKED FOR ONCE, by its number, so a card says the app it ran in and its day. A run this
         reader may not open is left out, and its cell says An agent. */
      const runs = new Map<string, Record<string, unknown>>();
      const naming = Promise.all(
        [...new Set(blocks.flatMap((b) => runsNamed(b)))].map(async (handle) => {
          const got = await client.get('session', Number(RUN_HANDLE.exec(handle)?.[1]));
          const row = got.ok && isObject(got.value) ? (got.value as { state?: unknown; fields?: unknown }) : null;
          if (row && isObject(row.fields)) runs.set(handle, { ...row.fields, ...(typeof row.state === 'string' ? { state: row.state } : {}) });
        }),
      );
      /* The walks, the bars' links, the runs and who is reading are all out at once, and the page waits for the slowest. */
      const [mapped, booted] = await Promise.all([mapping, booting, linking, naming]);
      const param = page.param;
      const me = booted?.from === 'live' ? (booted.boot.me?.person ?? null) : null;
      const names = new Map(Object.entries(booted?.from === 'live' ? (booted.boot.names ?? {}) : {}));
      const refs = new Map<string, RefMap>();
      for (const [target, map] of mapped) if (map) refs.set(target, map);
      const drawn = blocks.map((b, i) => {
        const made = blockOf(b, refs, now, me, names, runs);
        /* A PROJECT'S WHOLE NOTE LOSES WHAT AN IMPORT LEFT IN IT (`noteWithoutLeftovers`), its status line and a heading
           repeating the page's own name; the page was given its title, so only a page about a row does it. */
        const block =
          made.kind === 'note' && made.document && typeof made.body === 'string' && page.param
            ? { ...made, body: noteWithoutLeftovers(made.body, page.param.title) }
            : made;
        const lent = linked.get(i);
        return lent && !block.cannot ? { ...block, linked: lent } : block;
      });
      /* THE ACTIONS ARE READ ONLY FOR A PAGE WITH A FOOT TO SAY, which is one read on the few pages with rates out of
         date and none on the rest. A read the record refuses is `null`, and the foot then offers nothing. */
      let held: ActionRow[] | null = [];
      if (oldestStale(blocks, drawn) !== null) {
        /* THE ACTIONS' READER AND THE PRESET BY `import()`, on the few pages with a foot to say. */
        const [{ live: actionsOf }] = await Promise.all([import('./actions.ts'), learnRates()]);
        const got = await actionsOf(io ?? ((url, init) => fetch(url, init)), base).actions();
        held = got.ok && Array.isArray(got.value) ? got.value : null;
      }
      /* THE PAGE OPENED BY ITS ADDRESS ASKS ITS SUGGESTION NOW (`slot.ts` `askSlot`), its own reads done and before it
         draws, and the slot takes it when it draws, where it asked only once the page had drawn and the browser was
         idle. NOT BESIDE THE PAGE'S READS: batched with them, the page waited for the suggestion too. */
      if (early !== null) askSlot(base, page, blocks);
      /* A PAGE ABOUT A ROW NAMED AS A SLUG IS TITLED IN WORDS (`slugWords`): a skill's page read "review-pr". */
      const titled = param && typeof page.title === 'string' ? { ...page, title: slugWords(page.title) } : page;
      return {
        from: 'live',
        now,
        page: {
          page: identity ? { ...titled, identity } : titled,
          blocks: footed(blocks, drawn, now, held),
        },
      };
    },
  };

  /* EVERY ANSWER HANDED BACK IS KEPT FOR THE TAB (`kept-pages.ts`), so the page opened again draws at once while this
     read is out. A page the record does not have, or one it refused, lets its kept answer go. A write's re-read comes
     through here too, so what is kept is the page as the write left it. A walked read is a forecast, not the page, and
     is neither kept nor lets the page's kept answer go. */
  return {
    async read(slug, filter, opts) {
      const out = await answer.read(slug, filter, opts);
      if (opts?.walk !== undefined) return out;
      const key = pageKey(base, slug, filter);
      if (out.from === 'live') keptAnswers.put(key, out);
      else keptAnswers.drop(key);
      return out;
    },
    kept: (slug, filter) => keptAnswers.get(pageKey(base, slug, filter)),
  };
}

/** A card's when over a figure of days, in words: "Worked on 2 days ago", "Quiet for 40 days" past its target, or nothing. */
export function whenSaid(when: unknown, label?: string): string | null {
  if (!when || typeof when !== 'object') return null;
  const { value, met } = when as { value?: unknown; met?: unknown };
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return null;
  const days = `${value} ${value === 1 ? 'day' : 'days'}`;
  if (met === false) return `Quiet for ${days}`;
  const ago = value === 0 ? 'today' : value === 1 ? 'yesterday' : `${days} ago`;
  return label ? `${label} ${ago}` : ago;
}
