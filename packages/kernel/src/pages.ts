/**
 * Reading a page: a document, and the queries its blocks are.
 *
 * NOTHING HERE IS A COMPONENT. A page names blocks; a block names a kind, a source, a predicate and
 * some columns. What this produces is the ROWS and the readings — never the formatting, which is the
 * renderer's and is a different package. The split is what makes a page an agent writes
 * indistinguishable from one that shipped: both are documents, and neither is code.
 *
 * ONE BLOCK'S REFUSAL IS ONE BLOCK. A page whose third block names a field nobody declared shows
 * the other four and says what happened in the third — because a page that fails whole is a page a
 * person cannot use to find out what is wrong with it, and the thing that wrote the block cannot
 * see the screen.
 *
 * A TEMPLATE IS ONE DECLARATION AND ONE PAGE PER ROW. `for: { register, where }` expands into a page
 * per matching row with every `{{field}}` filled from it — so four projects are four pages over one
 * document rather than four documents with the name typed into every predicate, every metric id and
 * every heading. The slug comes from the row's title, so `/p/kiln` survives a re-ordering.
 */

import { sizeRead } from './kinds/sizes.ts';
import type { Refusal, Result } from '@braindog/ports';
import { no, ok, refused } from '@braindog/ports';
import { evaluate, type Leaf, type Predicate, type Schema } from '@braindog/where';

import type { ActionRow } from './actions.ts';
import type { ScriptRow } from './script-rows.ts';
import type { Exception } from './exceptions.ts';
import { ANSWER_KEYS, BLOCK_READS, FILTER_TYPES, WHEN_DEPTH, blockKeyOf, declaredActions, feedSaysFault, forecastAxisFault, isPickedLeaf, isReaderLeaf, keyedBlocks, kindsReading, kpisFault, noteSaysFault, whenJoin, whenTreeFault, wrongKindKey, type KpisFor, type WhenReader } from './block-keys.ts';
import * as kpiRank from './kpi-rank.ts';
import { kpiTrend, type KpiAnswer } from './sources/kpis.ts';
import { cutActions, type OfferedAction } from './row-actions.ts';
import { GROUPED_BY_FIELD, applyLook, composeLook, figureSaid, lookOf, mergeLook, type LookBody } from './compose.ts';
/* A PAGE'S HEAD OVER ITS TITLE, read and resolved by the file that checks it at install. */
import { headerBody, resolveHead, type HeadFigure, type ResolvedHead } from './page-head.ts';
import { listRead, searchClauses, searchWord, type SearchShape } from './page-search.ts';
import { HANDOFFS_OPEN, KIND_SAID, RECORD_ACTIVITY, builtInFigure, ownWork, type OpenStep } from './built-in-figures.ts';
import type { ActionBlocking } from './signs-actions.ts';
import { KEEP, markDrawn, type Why } from './drawn.ts';
import { splitOf, rowsBySplit } from './row-parts.ts';
import { kindModule } from './kinds/index.ts';
import { sourceReadsWhole, sourceModule } from './sources/index.ts';
import { ACTIONS_BLOCKING } from './sources/actions-blocking.ts';
import { FEED_BY } from './sources/activity.ts';
import { RUNS_ON_LISTS } from './sources/runs-on.ts';
import { DEADLINES_GROUP } from './sources/deadlines.ts';
import { DOING_SAID, withSaid } from './sources/sessions-working.ts';
import { fileLists } from './kinds/gallery.ts';
import { panelFault, roadmapFault, shortFault } from './kinds/words.ts';
import { BODY_KINDS, type Shows } from './govern.ts';
import { CARD_FOLD, CARD_FOLD_MOST } from './declare.ts';
import { fill } from './fill.ts';
import { isCurrencyCode, type Json } from './coerce.ts';
import { exponentOf, moneyText } from './ingest.ts';
import { across, dayFieldOf as datedBy, isAtLeast, partsOf, rateFor, type Amount, type Part, type Rate } from './fx.ts';
import type { Entry } from './index.ts';
import { predicateOf, windowMs, wordsOf, type EvalContext, type FxRead, type MetricDecl, type Reading } from './metrics.ts';
import { HORIZON_CAP, runway, type Horizon, type Leg, type Only, type Runway } from './forecast.ts';
import { beyondOf, figureLists, isRolled, pointedIn, WALK_SOURCE, walksToZero, type PointsAt, type Rolled } from './money-figures.ts';
import { withAdds, type PageAddition } from './page-adds.ts';
import { factsOf, type CardFact } from './card-facts.ts';
import { barsOf, type Bars, type SeriesLine } from './series.ts';
import { bucketStart, isBucket } from './buckets.ts';
import { isQuiet, presenceOf, WORKING_MS, type Presence } from './presence.ts';
import { SESSION_PREFIX, agentOf, recordNamed } from './session.ts';
import { quietSign, type VitalSign } from './signs.ts';
import { nextSteps, stepsPercent, tallySteps, type StepsDecl } from './steps.ts';
import { COSTS, type Cost, type Wait } from './weigh.ts';
import { REDUCES, ROW_TEXT_MOST, RAIL_PAGES, SUMS, railRoom } from './constants.ts';
import { MEASURES_LISTED, MEASURES_MOST, MEASURE_BUCKETS, measureBucket, measureLines, measureSeries, measureWindow, readableZone, type MeasureLatest, type MeasureSeries, type RawReading } from './measures.ts';
import { localDays } from './measures.ts';

/** One test of one figure in a block's `when:`: the figure, and the one of `empty`, `beyond` or a comparison it is held to. */
export type WhenLeaf = { metric: string; empty?: boolean; beyond?: boolean; gt?: number; gte?: number; lt?: number; lte?: number; is?: number; not?: number };

/**
 * A block's `when:`: one leaf, or `all:` (every one holds) or `any:` (one does) of two or more, each a leaf or one join of
 * leaves. Two levels deep at most (`block-keys.ts` `WHEN_DEPTH`).
 */
export type WhenTree = WhenLeaf | WhenReaderLeaf | WhenPickedLeaf | { all: WhenTree[] } | { any: WhenTree[] };

/** One test of what the reader picked on the page's own filter (`block-keys.ts` `isPickedLeaf`): `''` is none picked. */
export type WhenPickedLeaf = { picked: string; is: string | readonly string[] };

/** One test of who reads the page: the reader is one of these words (`block-keys.ts` `WHEN_READERS`). */
export type WhenReaderLeaf = { reader: WhenReader | readonly WhenReader[] };

/**
 * The leaves of a `when:`, however it is joined, each once in the order written. Anything that is not a leaf is left
 * out, and so is anything deeper than a `when:` may go, which never holds (`whenHolds`).
 */
export function whenLeaves(when: PageBlock['when'] | unknown, depth = 1): WhenLeaf[] {
  if (!when || typeof when !== 'object' || depth > WHEN_DEPTH + 1) return [];
  const join = whenJoin(when);
  if (join === 'both') return [];
  if (join === null) return typeof (when as WhenLeaf).metric === 'string' ? [when as WhenLeaf] : [];
  const list = (when as Record<string, unknown>)[join];
  return Array.isArray(list) ? list.flatMap((part) => whenLeaves(part, depth + 1)) : [];
}

/** One sentence of a note's `says:`: the condition it is said under, absent on the last, its words and its tone. */
export type SaysLine = { when?: WhenTree; body: string; tone?: 'good' | 'warn' | 'bad' | 'info' };

export type PageBlock = {
  kind: string;
  /**
   * The block's name for the engine: what a page's look (`compose.ts`) leads with, orders, hides and pins by. Declared,
   * or a hash of its kind, source and heading (`block-keys.ts` `defaultBlockKey`), and answered on every block a read
   * hands back, so a host keys what it draws by it rather than by its place.
   */
  key?: string;
  heading?: string;
  span?: number;
  source?: string;
  where?: string;
  /** `as: 'scope'` draws where the row applies: its project, or everywhere. */
  /**
   * `as: 'scope'` draws where the row applies. `sign:` writes a money column's figure with `−` where an enum says the
   * money goes out, and a column named `changed`, on a register with no such field, says who changed the row last.
   */
  /**
   * `metric:` IN PLACE OF `field:` is a card's `trend`: a figure grouped by a date bucket, `{{field}}` in its id filled
   * from each card's row (`project-done-by-week:{{name}}`), read once a card and answered as `trends`. Such a column
   * names no field, so its `field` is absent whatever this type says of the rest. `kpi: 'headline'` beside it reads each
   * card's line from the key number its project leads with (`sources/kpis.ts` `for: cards`), the figure only on a card
   * whose project keeps none with a value.
   */
  /**
   * `or:` names a second field of the same list, read where `field` holds nothing: a bank line's clean name, or the
   * words the bank wrote where nobody was matched to it. The entry carries both and the host falls back.
   */
  columns?: { field: string; or?: string; metric?: string; kpi?: 'headline'; label?: string; as?: string; edit?: boolean; sign?: { field: string; minus: string } }[];
  /**
   * A `stat`'s figures. `trend: 12w` draws how the figure moved over that window, from its daily series. With `ahead:`
   * naming a figure over the walk (`runway-days`), the trend is that walk's balance over the window AHEAD from today
   * instead, from the figure the walk opens from and over its legs, so a tile draws the very walk Cash ahead draws.
   * `ahead:` may name the figure a walk opens from (`cash-now`) instead, and the fullest walk declared from it is drawn
   * (`walkFrom`), so a page that knows only what is held draws its future without naming whose figure walks it.
   */
  /* `sign`: the way the money in a figure goes, said in front of it, "+£11,490" for `in` and "−£43,047" for `out` (AM1). */
  cells?: { metric: string; label?: string; trend?: string; note?: string; ahead?: string; sign?: 'in' | 'out' }[];
  /**
   * A `stat`'s: its first figure is the screen's one hero figure. A `cards` block's: its first card is drawn two tracks
   * wide. A `note`'s: its body is the page's opening sentence, said with the plural and nought rules a figure's note has.
   */
  lead?: boolean;
  /** Which of the page's two columns the block sits in, on a page with a `layout`. `main` when absent. */
  area?: 'main' | 'rail';
  /** A widget's frame on a board (`board.ts`): small, wide, tall, large or full. */
  size?: 'small' | 'wide' | 'tall' | 'large' | 'full';
  /** A widget not yet kept: who put it on the board and why (`board.ts`). */
  draft?: { by: string; why?: string; cost?: string };
  /** A `progress` block's: each row a band from its low to its high, columns `label | spent | low | high`. */
  range?: boolean;
  /** A `queue`'s: one tile per question, drawn with its recommended option's visual. */
  tiles?: boolean;
  /** A `split`'s: the parts drawn as a thin ring with their total in the middle. */
  donut?: boolean;
  /**
   * A `bar`'s over a list with a day: each bar says how many rows it adds up and the day of the newest, `4 times · last
   * 24 Aug`, so a bar a payee is a line about that payee (`last` on each part of the whole read).
   */
  tally?: boolean;
  /** A `heat`'s: a line a person, a dot in each week they were in touch, columns `day | who`. `people:` until People 2.6.0. */
  who?: boolean;
  /** A `section`'s: the blocks after it, up to the next section, drawn on one surface. */
  box?: boolean;
  /**
   * A `section`'s: whether it starts shut. A grouped `cards` block's: how many cards each group shows before the rest
   * fold, `CARD_FOLD` when it does not say (answered either way). A `feed`'s: `run`, one row for each run's lines, its
   * newest, with how many more that run wrote (`FeedRow.run_more`).
   */
  fold?: boolean | number | 'run';
  /**
   * A `cards` or `series` block's: how many it shows before "Show all", 1 to 24 (`mostOf` in braindog-render); six for cards
   * where it says nothing. A grouped `lines` block's (a sixth column): how many readings it lists under its lines.
   */
  most?: number;
  /**
   * A `cards` or a `table` block's: a field of its list that draws its rows in groups. A link groups them by the row it
   * points at, named by that row's title; a choice, or the list's state, by its value, named by the choice's label. Each
   * answered row says its group (`PageRow.group`), in the order the rows were read. A `feed`'s: `day`,
   * and every row says the day it was written in the record's own zone (`FeedRow.day`).
   */
  group?: string;
  /** Any block's: the glyph in the well beside its heading. */
  icon?: string;
  /**
   * Over a register with a scope field: the rows of the project `where:` names, then the rows that
   * apply everywhere, a project's row hiding a global one of the same title where the register says
   * the nearer wins (`scope.ts`).
   */
  inherit?: boolean;
  /**
   * Whether each row says an agent is on it right now.
   *
   * A BLOCK OPTION AND NOT A COLUMN ONE, though `34 §2` planned it as a column: the render primitives
   * take a plain string per cell and carry no column metadata, so a flag living inside one `columns:`
   * entry would need a new field on another package's `Column` type. A row either has an agent on it
   * or it does not, which is a fact about the ROW, so it is declared once here.
   *
   * The answer comes back as `working_now`, aligned with `rows`. It is computed only when asked,
   * because it reads every row's history.
   */
  working?: boolean;
  /** A `feed`'s: `seen` marks the rows after the reader's read mark as new, and `first` caps the rows. */
  since?: 'seen';
  first?: number;
  /** A `diff`'s: the row whose history it reads, the field it compares, and how many versions. */
  row?: string;
  field?: string;
  versions?: number;
  order?: { field: string; dir?: 'asc' | 'desc' }[];
  limit?: number;
  /**
   * `forecast.runway` only: what is liquid today, and the legs the walk reads.
   *
   * A number, or `{ metric }`: the figure a page's own `Cash now` tile reads, so the walk and the tile
   * start from one declaration rather than from a balance typed twice.
   */
  opening?: number | { metric: string };
  from?: Leg[];
  /** How many days the walk reads, or `'last'`: to the last dated movement, whose length the walk answers (`Runway.horizon`). */
  horizon?: number | 'last';
  empty?: string;
  target?: number;
  /**
   * The condition a block draws under. `06 §1.1` publishes it and the kernel did not read it.
   *
   * A red note about an overdue invoice on a record with no invoices is the one thing a `when:`
   * exists to prevent, and the browser has evaluated it since it was written while this side drew
   * every block unconditionally. Two implementations of one page, disagreeing about which blocks
   * are on it.
   */
  /* `empty: true` holds while the figure reads with no value and no amount in any currency, and `empty: false` while it
     has one: the one test a figure with nothing in it meets. */
  /* `beyond: true` holds while the reading carries `beyond` (`money-figures.ts` `beyondOf`): a walk to zero that looked
     as far as it walks and never went under, which has no value and so meets no comparison. `all:` is two or more
     leaves, and the block draws only while every one holds; `any:` is two or more, and it draws while one does. Either
     may hold one join of the other kind, and no deeper. */
  when?: WhenTree;
  /**
   * A `note`'s sentences, read top to bottom: the first whose `when:` holds is the note's body, its `{{path}}` holes
   * filled as any body's are, and its `tone` the block's. The last has no `when` and is the calm line, so every reader
   * of the page is said the same sentence. Never beside `body:` (`block-keys.ts` `noteSaysFault`).
   */
  says?: SaysLine[];
  /** A `series`'s lines: figures grouped by one date bucket, and how many buckets back and ahead it draws. */
  series?: SeriesLine[];
  back?: number;
  ahead?: number;
  /** A `calendar`'s: how many whole weeks it shows from the Monday of this one, 1 to 8, in place of back and ahead. */
  weeks?: number;
  /**
   * A `drawn` block's (`kinds/drawn.ts`): the component, its HTML, a style tag and a script, which the host draws in a
   * sandboxed frame; and the height in pixels it stands at before it says its own.
   */
  code?: string;
  height?: number;
  /** A `project` block's (`kinds/project.ts`): the row of the project's shape it draws, one part or two. */
  parts?: readonly string[];
  /** A `stat` or `lines` over readings: whether a point is a day or a week. A day when absent. */
  bucket?: string;
  /** A `series`'s: whether it draws what was left, in minus out, as a line. */
  net?: boolean;
  /**
   * A `forecast`'s: the series its opening figure is remembered in, so the line draws how cash moved
   * before today (`08 §3`: the recorded half and the projected half read the same figure).
   */
  recorded?: string;
  /** A `forecast`'s: which of its knobs a reader may move. */
  knobs?: string[];
  /** A `forecast`'s: the figure the late knob marks, how many days late money has come in on average. */
  late?: string;
  /** A `forecast`'s: say under the chart how many days are left when the walk goes under within this many days. */
  under?: number;
  /**
   * A `forecast`'s: the figure of what a reader may count as sold on a day they pick, such as what is held in gold. The
   * record reads it and answers `sells`; the walk itself never counts it, because selling is the reader's what-if.
   */
  sell?: { metric: string };
  /**
   * A `forecast`'s: the lengths its horizon knob offers, each a whole number of days or `last`, the walk's last dated
   * movement. Checked here and drawn by the host, which walks no further than `horizon:` whatever is chosen.
   */
  horizons?: (number | 'last')[];
  /**
   * A `forecast`'s: what the page's opening line already says of the walk, which is `under`, when the money runs out.
   * The host then leaves the sentence over the chart off and keeps the flag on the crossing. Answered only while a lead
   * note on the same page is drawn (`headlineHeld`), since a line that is not drawn says nothing.
   */
  headline?: 'under';
  /** A `forecast`'s: where its value axis starts, `fit` (what saying nothing draws) or `zero`, always from nought. */
  axis?: 'fit' | 'zero';
  /** A `bar` or `split`'s: the label of the row that holds what no part does, drawn last and linked to those rows. */
  unset?: string;
  /** A `bar` or `split`'s: the intent a part is drawn in, by the value it groups, such as `{ off_track: bad }`. A part not named is neutral.
      A `cards` block tones a card by its title's value, and a `lanes` block a lane by its fourth column's. */
  tones?: Record<string, 'good' | 'warn' | 'bad' | 'info'>;
  /** A `lanes` block's: how many hours back from now it shows, 24 when it says nothing, at most 168. */
  hours?: number;
  /** A `note`'s: its body is a whole document, drawn with the blocks written in it, such as a project's `{{note}}`. */
  document?: boolean;
  /**
   * A `cards` block's: a row whose day in `field` is older than `after` is drawn as out of date. With `figure`, the day
   * is the one that figure's group for the card says (`staleDaysOf`), written into `field` in the answer, so a book's
   * account card is dated by the bank's last word on it and not by the day somebody typed.
   */
  stale?: { field: string; after: string; figure?: string };
  /**
   * A `ring` over a register's: the rows its dial is set against, as a sentence over the same list. Without it the
   * whole is every row the block's scope admits, the page's project when it inherits and the list otherwise, and the
   * `where` is always the part.
   */
  of?: string;
  /**
   * A `progress` block's: the figure, grouped by a word, that says what was spent against each row's limit. The record
   * reads it beside the rows and the host sets each row against the part whose key is that row's value.
   */
  spent?: string;
  /**
   * A `progress` block's: the figure, grouped by a link to the block's own rows, that says how far each row has come, so
   * a goal is moved by the rows logged against it rather than a number typed on it. Each row's target is its second
   * column, set against the part whose key is that row.
   */
  toward?: string;
  /**
   * A `capture`'s: the register a new row is added to. Its own key rather than `source:`, because a capture reads no
   * row, and the equalities its `where:` pins are what the new row is filled with (`fills` on the answer).
   */
  register?: string;
  /**
   * Over `runs_on`: the project whose keys, tools, skills and actions it reads, by its spoken id, `'{{spoken}}'` on the
   * project's template. Over `kpis` for one project, that project.
   */
  about?: string;
  /** A `kpis` block's: one project's key numbers, the few that lead Today, or the one each project's card leads with (`sources/kpis.ts`). */
  for?: KpisFor;
  /**
   * A `section`'s on a page per row: the host panel drawn for that row under the section's heading, `actions`,
   * `reporting`, `run` or `seen` (`kinds/words.ts` `PANELS`). The record checks the word and hands it back; the panel is the host's.
   */
  panel?: string;
  /**
   * A `steps` block's: the short view, the rows `where` admits, named `label` on the switch. The read still answers every
   * row up to `limit`, and says which are in the short view in `short_now`.
   */
  short?: { where: string; label: string };
  /**
   * Whether the block is drawn. Absent on a block that draws. `false` where its `when:` said no, where it holds nothing
   * and does not lead the page, where what it reads no row has said, and on a section over nothing (`markDrawn`, in
   * `drawn.ts`), so every reader of the answer draws the same blocks the screen does.
   */
  drawn?: boolean;
  /** Why a block is not drawn, beside `drawn: false`: `empty`, `unsaid`, `when` or `cannot` (`drawn.ts` `Why`). */
  why?: Why;
  /*
   * NOT TYPED HERE: `actions` and `row_actions`. As declared they are JSON nobody has checked, read through
   * `declaredActions` as any page key is; as answered they are `BlockResult`'s, cut to the reader.
   */
};

export type PageDecl = {
  page: string;
  title: string;
  blocks: PageBlock[];
  /**
   * `for:` makes it a template: one page per row of the register it names. `fleeting: true` says its rows are many and
   * come and go, as runs do, so its pages take an address only after every steadier page has had its pick
   * (`resolvePages`). A template over the runs' own list is read so without saying it.
   */
  for?: { register: string; where?: string; fleeting?: boolean };
  /** The list whose page this is: `/r/<list>` opens here (`pages()` answers it as `opens`). Never with `for:`. */
  list?: string;
  requires?: string[];
  [key: string]: unknown;
};

export type BlockResult = PageBlock & {
  /**
   * What may be pressed on the block itself, and on each of its rows (`row-actions.ts`): declared, checked
   * against the fields of the block's list, and cut to what this reader may press (`PageDeps.level`), each marked `hard`
   * and `undo`. Absent where nothing is left to press.
   */
  actions?: readonly OfferedAction[];
  row_actions?: readonly OfferedAction[];
  /**
   * A note with `says:`: which of its sentences was said, counted from 0. Its words are the answer's `body` and its tone
   * the answer's `tone`, so a host draws the note as it draws any other (`saidLine`).
   */
  says_at?: number;
  /** A note with `says:`: the said sentence's words, its holes still to be filled from `values`. */
  body?: string;
  /** A note with `says:`: the said sentence's tone, when it has one. */
  tone?: 'good' | 'warn' | 'bad' | 'info';
  /**
   * The rows the block draws, cut to `limit`, each with every field it holds and a long text cut short (`leanRows`). A
   * row that says `clipped` holds less than the whole of one of its texts, and a reader that edits it reads it whole
   * first. A `section` sends none: what it draws of them is `matched`.
   */
  rows: PageRow[];
  /**
   * A `bar` or a `split` over rows, and a `forecast`: the record's home currency and dated rates, when it has either. A
   * host that shows a walk in another currency converts each step with these, never with rates of its own.
   */
  fx?: { home: string | null; rates: Rate[] };
  /** How many the predicate matched, which is what a total is a total OF. */
  matched: number;
  /** On a kind that adds up over a list: its parts and its total over every row (`WholeRead`). */
  wholeRead?: WholeRead;
  /** A `stat` block's figures, in the order its cells named them. */
  /** Each cell's figure, and the target the record holds for it, so a host says the record's target rather than its own build's. */
  readings?: {
    metric: string;
    label?: string;
    /** The figure's declared format (`pct`, `day`, `int`...), for a host that holds no copy of the declaration. */
    format?: string;
    reading: Reading | null;
    refusal?: Refusal;
    trend?: (number | null)[];
    /**
     * A trend AHEAD (`cells[].ahead`): `trend` is then the walk's balance at the end of each day from today, today first,
     * in `currency`'s minor units, and `low` the lowest it reaches and the first day it does. Absent on a trend behind.
     */
    ahead?: { from: string; currency: string; low: { day: string; value: number } };
    target?: MetricDecl['target'];
  }[];
  /** A `forecast.runway` block's walk. */
  walk?: Runway;
  /**
   * A cash walk over money in several currencies that could not be converted: one walk a currency, each starting from
   * that currency's part of the opening, in code order, and why it is not one walk (`home`, and each `missing` pair).
   * A walk's `sells` is what that walk may count as sold, in its own currency, when the block offers the sell control.
   */
  walks?: (Runway & { past?: { at: string; value: number }[]; sells?: { label: string; value: number }[] })[];
  walkFx?: { home: string | null; missing: string[] };
  /** On a block that inherits: how many of rows, at the end, apply everywhere rather than to the project. Over runs_on, how many it kept that apply everywhere, counted before limit: cut them. */
  inherited?: number;
  /**
   * Where each row applies, aligned with `rows`: its project's title, or `null` for everywhere. On
   * `sessions.live` and `sessions.working`, the name of the project each run was placed in.
   */
  scopes?: (string | null)[];
  /**
   * Aligned with `scopes`: the mark and hue of the project each row applies to (the first, where a row names several),
   * or `null` where it applies everywhere. A project that declares no mark or hue answers `null` in that half.
   */
  scope_marks?: ({ mark: string | null; hue: number | null } | null)[];
  /** A `cards` block's: how far along each row is from the steps under it, where its ring's own field is empty (`steps.ts`). */
  rings?: (number | null)[];
  /**
   * A `cards` block's with a column `as: next`: that field of the first step under each row that is not done, in the
   * order the steps list declares, aligned with `rows`. `null` for a row with no open step.
   */
  nexts?: (string | null)[];
  /**
   * A `cards` block's with a column `{ metric, as: trend }`: that figure for each card, one number a bucket oldest first,
   * aligned with `rows`. A bucket with no value is `null`, a gap, except on a count or a sum, where nothing counted is
   * nought. `null` for a card whose figure has nothing in the buckets drawn, which draws no line.
   */
  trends?: ((number | null)[] | null)[];
  /**
   * A `cards` block's with a column `{ metric, as: when }`: that figure for each card, its one number and whether it
   * met its target, aligned with `rows`. `null` for a card whose figure reads nothing, which draws no line.
   */
  whens?: ({ value: number; met: boolean | null; at?: string; by?: string | null } | null)[];
  /**
   * A `cards` block's with columns `{ metric, as: fact, label }`: one entry a card, one fact a figure column in column
   * order, aligned with `rows`. `null` for a fact that reads nothing, which draws no fact.
   */
  facts?: CardFact[][];
  /** A `steps` block's over a list that declares `steps:`: whether each row is done, aligned with `rows`. */
  done_now?: boolean[];
  /** And the index in `rows` of the first row not done, `null` when every row is. */
  next?: number | null;
  /**
   * A `steps` block's under `first:`: how many of the steps `matched` are open. `matched` counts the done ones too, so the
   * short view's "more" is this less the open steps it drew, and never `matched` less them (5 steps, 2 done, `first: 2`
   * drew 2 and said 3 more where 1 was left out).
   */
  open?: number;
  /**
   * A `steps` block's with `short:`: whether each row is in the short view, aligned with `rows`. The rows are every row
   * up to `limit`, so a host switches between the two views without a second read.
   */
  short_now?: boolean[];
  /**
   * A `calendar`'s: the months it shows, from the first day of the first to the last day of the last, and today, each a
   * day in the record's own zone. Every row it answers falls between `from` and `to` (`kinds/calendar.ts`).
   */
  window?: { from: string; to: string; today: string } | { from: string; to: string; now: string };
  /** A `lanes` block's: each row that overlaps the window, as a title between two instants (`kinds/lanes.ts`). */
  lanes?: { title: string; start: string; end: string | null; tone?: 'good' | 'warn' | 'bad' | 'info'; href?: string }[];
  /**
   * A `gallery`'s: each file it draws as the record stores it, aligned with the rows it draws (the list's, or the ones
   * written out), `null` where the record holds none (`kinds/gallery.ts`).
   */
  files?: (StoredFile | null)[];
  /**
   * An `inputs` block's: the type of each field it draws, by field id, which a host picks its control by. And a computed
   * source's, by field (`typesOf`), which a host draws each cell by, where no list declares the field: `instant`, `run`.
   */
  types?: Record<string, string>;
  /** An inputs block's: the fields it draws that the record works out (derive:), drawn as figures and never boxes. */
  derived?: string[];
  /**
   * And the record's home currency, or `null` when it has none, which a bare figure typed into an empty money box is
   * written in. The browser's own guess was the sample's rows, which a shipped build never fills, so it wrote GBP on a
   * record in EGP.
   */
  home?: string | null;
  /** A `feed` block's rows, newest first, a burst being one row. */
  feed?: FeedRow[];
  /** A `queue` block's questions, in the record's own order, cut to `limit`. `matched` is how many are open. */
  queue?: QueueQuestion[];
  /**
   * A `queue` over `governance.open`'s: of the `matched` questions, how many have waited past `STALE_DAYS` (`stale`) and
   * how many would be hard to undo (`hardToUndo`, cost `undo`). Counted over every question that matched, never over the
   * ones drawn, so a screen saying "two of them for over two weeks" is saying it of the record and not of the first
   * twenty. One key and not two beside `matched`, because a block already says `stale:` of a card's day.
   */
  waiting?: { stale: number; hardToUndo: number };
  /**
   * A `capture` block's: what a row added through it is filled with, by field, in the stored form. Each is an
   * equality its `where:` pinned (`captureFills`), so a line under "Later" adds a task that is kept for later.
   */
  fills?: Record<string, string>;
  /** On a feed with `since: seen`: the reader's read mark, or `null` when they have none yet. */
  seen?: string | null;
  /** A `diff` block's versions of its field, newest first, at most `versions` of them. */
  history?: { at: string; by: string; text: string }[];
  /** A `series` block's buckets and each line's value in them. */
  bars?: Bars;
  /** A `kpis` block's key numbers, each with its points, shape, chart, verdict and why it is here (`sources/kpis.ts`). */
  kpis?: KpiAnswer[];
  /**
   * A `kpis` block's: the list its key numbers are kept in, found by its shape, so a host links "All numbers" to it
   * without naming a list of its own. Absent on a record that keeps none, or that this reader may not read.
   */
  kpi_list?: string;
  /**
   * A `stat` or `lines` over a register of readings: one series a measure (`measures.ts`). A `stat`'s are every measure,
   * the ones that moved most first; a `lines` block's are only the measures with two points or more in the period to join.
   */
  measures?: MeasureSeries[];
  /**
   * A `lines` block over readings: each measure with one reading in the period, which draws no line, as that reading,
   * newest first. Never on a `stat`, whose tiles are each a measure's newest reading already.
   */
  latest?: MeasureLatest[];
  /** A walk's `recorded:` series over the ninety days before today, oldest first, a day with no point absent. */
  past?: { at: string; value: number }[];
  /**
   * Aligned with `rows`: who changed each row last (`RowChange`). When a column is `changed`, every row that has a history;
   * otherwise only a row an agent, Slash, a rule or an import changed in the last week, for the byline and its Undo, and
   * absent when no row is one.
   */
  changes?: (RowChange | null)[];
  /** Aligned with `rows`, when the block set `working: true`: whether an agent is on each row right now. */
  working_now?: boolean[];
  /**
   * On `sessions.live`, aligned with `rows`: whether each run has gone quiet, open and not working (`presenceOf` in
   * `presence.ts`). Open is not working, so a declared page draws a quiet run as gone quiet and not as at work, from the
   * record's clock rather than one of its own.
   */
  quiet?: boolean[];
  /** On `sessions.live`, aligned with `rows`: the one word each run reads as (`presenceOf`): working, quiet, left, ended, stopped or before. */
  presence?: Presence[];
  /**
   * On `sessions.working`, aligned with `rows`: how many helpers each run has working under it. A helper is folded into
   * the run that started it and is not a row of its own, so one agent with four subagents is one card that says four.
   */
  helpers?: number[];
  /** A forecast's `late:` figure, read: how many days late money has come in on average, or `null` when nothing was paid. */
  lateness?: number | null;
  /** That figure's name as the record declares it, which the late knob is called by, so a use case's words reach it. */
  late_name?: string;
  /**
   * A forecast's `sell:` figure, read: what it is called and what it holds, in minor units of the walk's currency. Empty
   * when the figure reads nothing or reads another currency, and only ever on a block drawn as one walk: a block drawn
   * as a group carries each walk's own on that walk (`walks`).
   */
  sells?: { label: string; value: number }[];
  /**
   * Every `{{path}}` in the block's heading, body, empty sentence or authored cells that the record
   * holds a value for, by the path as written. A path it holds nothing for is absent, and draws `—`.
   */
  values?: Record<string, Json>;
  /**
   * HOW A `{{path}}` THAT IS A FIGURE WAS CONVERTED, by the path as written: the figure's own `fx`, for a figure that
   * is one amount (never one in parts) worked out with a rate. `values` holds the amount alone, so without this a
   * sentence could not know its rates are out of date, where a tile's figure says it. Absent when no path was converted.
   */
  values_fx?: Record<string, FxRead>;
  /**
   * WHICH RULE OF THE ORDER READ EACH FILLED `{{path}}`, by the path as written (`ReadAs`, `PATH_ORDER`): a list's
   * `count` or `state`, a `figure`, a `module`'s figure, a row's `field`, or a row's newest `reading`. Every key of
   * `values` has one, so a check can list a path two rules match. Absent when no path holds a value.
   */
  read_as?: Record<string, ReadAs>;
  /**
   * HOW OLD EACH FILLED `{{path}}` IS, by the path as written: the day its value was stated on, where the record knows one.
   * A rolled figure's oldest stated balance (`Reading.as_of`), or the `as_of` day of the row a field is read from. A host
   * says the age beside a figure in a sentence once it is old, as a tile does. Absent when no path has a day.
   */
  values_as_of?: Record<string, string>;
  /**
   * Every `{{path}}` of the block that names nothing the record has: no figure, list, row, field or value of a list's
   * state. A host draws each as the author wrote it, marked, and leaves it out of a chip, a tile or a bar, where a path
   * that names something and holds nothing keeps its `—`. Absent when every path names something.
   */
  unnamed?: string[];
  /**
   * WHAT EACH FIGURE THE BLOCK NAMES IS, AS THIS RECORD DECLARES IT, by its id with no parameter (`figuresOf`): its name,
   * the list and `where` it is read over, what it adds up, its format, its target and the field it groups by. Every
   * figure a cell, a `metric.` source, a series line or a `{{path}}` of the block names, filled or not. A host says a
   * figure's words, its door and its target from this and never from a copy of the packs it was built with. Present,
   * even empty, on every block that answers readings, values, a series or a `metric.` source, so a host can tell a
   * record that names nothing from one built before this key; absent on any other block.
   */
  figures?: Record<string, FigureFacts>;
  /**
   * The pack that added this block to a page another pack declares (`page-adds.ts`), absent on the page's own blocks. A
   * host says where the block came from with it, and leaves it out of an arrangement it saves, because the page's own
   * declaration never holds it.
   */
  added?: string;
  /** What this block could not do. Non-empty means the block drew nothing. */
  refusals: Refusal[];
};

/** A figure as a host draws it (`BlockResult.figures`): the keys of its declaration a tile, a sentence and a door read. */
export type FigureFacts = Pick<MetricDecl, 'name' | 'source' | 'value'> & Partial<Pick<MetricDecl, 'where' | 'format' | 'target' | 'group_by'>>;

/** The keys of a declaration a block's `figures` carries, each only where the declaration has it. */
const FIGURE_FACTS = ['name', 'source', 'where', 'value', 'format', 'target', 'group_by'] as const;

/**
 * Every figure a block names, as the record declares it, or `undefined` for a block that answers no figure (`figures`).
 *
 * BY ITS ID WITH NO PARAMETER, as a host looks a figure up: `project-owed:Kiln` is `project-owed`, and its `where` still
 * holds the `{{it}}` the host fills (`withParam`). A `{{path}}` is asked by each word between its dots as well as
 * whole, since `{{money.owed}}` and a hole's place are read by either (`row-href.ts` `holePlaceIn`). A word that names
 * no declared figure is left out: a built-in figure is the record's own and has no declaration to say.
 */
function figuresOf(deps: PageDeps, block: PageBlock, read: BlockResult): Record<string, FigureFacts> | undefined {
  const source = typeof read.source === 'string' && read.source.startsWith('metric.') ? read.source.slice('metric.'.length) : null;
  const lines = Array.isArray(read.series) ? read.series : [];
  const values = read.values !== undefined && Object.keys(read.values).length > 0;
  if (!(read.readings?.length || values || lines.length || source !== null)) return undefined;
  const ids = new Set<string>();
  const add = (id: unknown) => {
    if (typeof id !== 'string') return;
    const at = id.indexOf(':');
    const bare = (at < 0 ? id : id.slice(0, at)).trim();
    if (bare !== '') ids.add(bare);
  };
  for (const r of read.readings ?? []) add(r.metric);
  if (source !== null) add(source);
  for (const l of lines) add((l as { metric?: unknown } | null)?.metric);
  for (const path of pathsOf(block, (id) => figureNamed(deps, id))) {
    const at = path.indexOf(':');
    const bare = at < 0 ? path : path.slice(0, at);
    add(bare);
    for (const word of bare.split('.')) add(word);
  }
  const out: Record<string, FigureFacts> = {};
  for (const id of ids) {
    const decl = deps.metric(id);
    if (!decl) continue;
    const facts: Record<string, unknown> = {};
    for (const key of FIGURE_FACTS) if (decl[key] !== undefined) facts[key] = decl[key];
    out[id] = facts as FigureFacts;
  }
  return out;
}

/** The kinds of actor a feed groups by, which the feed's own source holds (`sources/activity.ts`). */
export { FEED_BY };
export type FeedBy = (typeof FEED_BY)[number];

/**
 * Who a run is, beside a line that run signed: its handle (`S42`), the kind of agent it is (`claude`, and `other` where
 * it said none and its app names none), the app it ran in as the run holds it (`claude-code`), and the run it helps.
 *
 * SO NO LINE IS A BARE HANDLE. A run signs the log with its handle, and a host that was handed `S42` alone could only
 * say "An agent", so every run on Activity sat in one lane. `agent` is always said, and a host names the run
 * by it and by `client`, and a helper by its `parent`.
 */
export type RunBy = { run: string; agent: string; client: string | null; parent: string | null };

/** One row of a feed. `who`, `kind` and `target` are `null` on the row that folds a group's rows past `first:`. */
export type FeedRow = {
  by: FeedBy;
  who: string | null;
  count: number;
  kind: string | null;
  target: string | null;
  note: string | null;
  at: string;
  /** What the target is called, where the host could say (a row's title), for a reader who is not handed an id. */
  thing?: string | null;
  /** On a `setup` row (`feed.ts`), how many example rows the record set itself up with. */
  rows?: number;
  /**
   * The list the target is a row of, the register part of `tasks#3`, or `null` for anything else. An `activity` block
   * answers it on every row it draws, and its `where` reads it as `list is tasks` (`listOf`).
   */
  list?: string | null;
  /**
   * The names of the rows a rule's run folded into this one line, newest first, one a row: a rule that categorised six
   * payments is one line naming six, not six lines (`feedRows`). Absent from a row that is one target's.
   */
  things?: string[];
  /**
   * On a row a run signed, who that run is, or `null` for a run the record does not hold. `run_by` and not `by`, which
   * is the kind of actor a feed groups by. Absent from a row no run signed, and where the host reads no runs (`runOf`).
   */
  run_by?: RunBy | null;
  /**
   * On a feed that says `group: day`, the day this row was written, `2026-10-13`, in the record's own zone: a host draws
   * one heading a day from it and counts no hours itself. Every row of such a feed has one, the row that folds a group's
   * remainder past `first:` too, and each day's rows sit together, the newest day first.
   */
  day?: string;
  /**
   * On a feed that says `fold: run`, on the one row a run's lines are answered as, its newest: how many more lines that
   * run wrote, `0` where this is all of them. `count` and `run_more` together are every line of the run (of the run that
   * day, where the feed groups by day). Absent from a row no run signed.
   */
  run_more?: number;
};

/** One way to answer a question, as a queue draws it. `because` is the reason its author gave for it. */
/**
 * `shows` is what the option IS, drawn beside its label: its colours, a figure, or a file the record holds. It is the
 * option's content and never a colour the page is drawn in (`govern.ts` `showsOf`).
 */
/**
 * `hard` is set, and only ever `true`, on an option that cannot be taken back once picked (`weigh.ts` `optionCost`). It
 * is the option that is hard and not the question, so a drawer says it on that option and gives it to no key.
 */
export type QueueOption = {
  key: string;
  label: string;
  because: string;
  recommended: boolean;
  shows?: Shows;
  hard?: true;
  /**
   * WHAT THIS OPTION DOES TO ROWS, IN NAMES ("every open card draws what its options change"), on an option that
   * carries its own patches: the list, how many rows, and the value each field it sets moves them to, a link by the
   * title it points at. The question's `rows_said` is accepting's; this is the option's.
   */
  said?: { list: string; rows: number; moves: { field: string; label?: string; to: Json; n: number }[] };
  /** The money choosing this option files where it names, one value a currency (a bank's tail answered: the messages waiting). */
  files?: { amount: number; currency: string }[];
};

/**
 * One open question, as the `governance.open` source reads it.
 *
 * `why` is what whoever opened it wrote (`body.context`), and it is empty when they wrote none.
 *
 * `cost` IS WHAT IT WOULD COST TO GET THIS ONE WRONG (`weigh.ts`), and it is the order they arrive
 * in. It is computed from what accepting the proposal would do, never declared by whoever opened it:
 * a queue ranked by self-declared importance is a queue in which everything is urgent by the second
 * week. This paragraph used to say the opposite — that the record holds no cost, and that calling
 * recency a ranking by cost would be a number nobody computed. That was true, and the answer was to
 * compute one rather than to keep saying so (`19 §6`, risk 6, the fourth countermeasure).
 */
/** `about` is what the question is about, as its body says it (`body.about`), which a queue's `where` filters on. */
/**
 * `list` is the list the question's row is on, the register part of an `about` that names a row (`obligations#4`), and
 * `null` when it names none. A `governance.open` block answers it on every question it draws (`listOf`).
 */
export type QueueQuestion = {
  id: string;
  who: string;
  at: string;
  kind: string;
  question: string;
  why: string;
  cost: Cost;
  options: QueueOption[];
  about?: string;
  list?: string | null;
  /** The list a rowset adds to or changes, which a question whose `about` names no row is on; absent on any other body. */
  rows_on?: string;
  /** The person handed this question to decide, a person id; absent when nobody was handed it. */
  decider?: string | null;
  /**
   * On a queue's lead question (`lead: true`): what was proposed, the body's kind, and what accepting it does, one
   * short line read off the body (`does.ts`), so the first question is drawn whole with the change under it. A change
   * to what a list holds keeps `does` below the lead too (`sources/governance.ts` `ledBy`).
   */
  body_kind?: string;
  does?: string;
  /** The body of a `pack`, `settings` or `arrange` proposal, so a card says the arrangement in its own summary (web `card.ts` `arrangementOf`) without opening its page. */
  arranged?: Record<string, unknown>;
  /** How long it can wait (`weigh.ts` `WAIT_SQL`): `soon`, `old` or `new`, read in the queue's own query. */
  waits?: Wait;
  /**
   * On a question about who may be one person or organisation (`people.ts`'s cluster question): each name it is about,
   * by the handle beside it, with where they were seen and which is kept, so the queue draws the merge card itself.
   */
  candidates?: QueueCandidate[];
  /** How many rows a question about rows holds, for the count in its card's heading. */
  held?: number;
  /** On a question put off (`governance.later`): the day it comes back, and why it was put off. */
  until?: string;
  until_why?: string;
  /**
   * FOR THE DECISION CARD'S BY-LINE: the run that asked, by its handle (`S42`) beside what it was doing and the app it
   * ran in ("Claude Code"), when an agent's run filed it; and who drafted it for whoever filed it, `slash` or
   * `slash:<model>` when Slash did.
   */
  run?: { id: string; name?: string; app?: string };
  drafted_by?: string;
  /**
   * The money accepting writes, one value a row it writes: integer minor units with a currency, never added up here. A
   * question that changes money on a row, or hits the ladder's money floor there, is always `cost: undo`, so Enter never
   * accepts it.
   */
  money?: { amount: number; currency: string }[];
  /**
   * `true` when every amount in `money` is on a row accepting adds: the question records an amount, as an entry in a
   * ledger does, and moves none, so it is deleted or put back like any new row and is not `cost: undo` for it.
   */
  records?: true;
  /** What accepting changes on the one row a question updates: each field, its name, what it holds now and what it will. */
  changes?: { field: string; label?: string; before: Json | null; after: Json | null }[];
  /**
   * WHAT ACCEPTING DOES TO MANY ROWS, said once for the card's picture (§45 "every decision carries its options drawn"):
   * the list, the titles of the rows it adds (`ROWS_SAID_NAMES` at most, and how many more), and the value each field it
   * sets most often moves rows to, with how many. Only on a rowset of more than one row or of new rows, where `changes`
   * says nothing. A link, a secret, a file and money are never said here: money has its own line (`money`).
   */
  rows_said?: { list: string; rows: number; adds: string[]; more: number; moves: { field: string; label?: string; to: Json; n: number }[] };
  /** The kinds of change it is (`change-kind.ts`'s keys, `tasks:move:done`), dearest first, as the ladder counts it. */
  kinds?: string[];
  /**
   * WHAT IT IS ABOUT, AS ONE KEY (`cause.ts`), so a thing asked twice is asked once: the cause its opener gave or the
   * record derived. With `alike`, how many open questions share that cause, itself included, so Decide draws one card
   * for a family and says how many it holds. Both absent from a question the record has no cause for.
   */
  cause?: string;
  alike?: number;
};

/**
 * WHAT THE DECISION CARD SAYS BESIDE ONE QUESTION, read on its own (`kernel.queueQuestion`): the run that asked and the
 * app it ran in, who drafted it, the money accepting writes, what changes on the one row it updates, and the kinds of
 * change it is. The same facts a queue's question carries, so a card drawn outside a page's queue says what the queue's
 * says.
 */
export type QuestionFacts = Pick<QueueQuestion, 'run' | 'drafted_by' | 'money' | 'records' | 'changes' | 'kinds' | 'rows_said'>;

/** The most new rows' titles a card's picture names, and the most moves it says. */
export const ROWS_SAID_NAMES = 6;
export const ROWS_SAID_MOVES = 4;

/** One name a merge question is about: its handle (`people#4`), its name, where it was seen, and whether it is kept. */
export type QueueCandidate = { at: string; name: string; seen: string[]; kept?: true };

/** What a queue's `where:` reads of an open question: who asked, what kind and band it is, and what it is about. */
/** `rows_on` is the list a rowset adds to or changes, which a question that names no row of its own is on (`list is`). */
export type OpenFacts = { who: string; kind: string; cost: Cost; about: string | null; rows_on?: string | null };

/**
 * How many days an open question waits before it is said to have waited too long: two weeks. The record counts them
 * (`stale` on a queue) and a screen says how many, so the number is the record's and not each screen's.
 */
export const STALE_DAYS = 14;

/** One answered question, as `governance.decided` reads it: what was asked, what was chosen, why, by whom and when. */
export type DecidedQuestion = {
  id: string;
  question: string;
  /** The option chosen, `accept` or `reject` for a question that offered none. */
  answer: string;
  /** The chosen option's own label, when the question offered options. */
  answer_label?: string;
  reason: string;
  who: string;
  at: string;
  /** The kind of proposal it answered, and what that was about, when the question is still held. */
  kind: string;
  about?: string;
};

/** A reader filter as the page answers it: the field, its name, how it is drawn, the value chosen and each value with how many open rows hold it. */
export type PageFilter = {
  field: string;
  label: string;
  control: 'chips' | 'segmented';
  chosen: string | null;
  /** `hue`, for a link to a row that holds one (a project's own colour, 0 to 359), so a chip wears its dot. */
  values: { value: string; label: string; count: number; hue?: number }[];
  /** The lists its values were counted and named from, so a host holds the filter from a reader who may not read them. */
  reads: string[];
};

/** One event, as the activity source reads it. */
export type ActivityEvent = { ts: string; actor: string; kind: string; target: string | null; note: string | null; thing?: string | null; rows?: number; run_by?: RunBy | null };

/**
 * What a page read made for one reader may hand her of the reads across the whole record: each line of the log, each
 * question and each list asked of her own lens by the host, so a feed, a queue or what went quiet
 * drawn for a Viewer or an Admin leaves out what `recentHistory` and `governance` leave out for her: the owner's own
 * lists, a personal list, a row her rule does not admit. A line is asked with the row it is about, read once, or `null`
 * for a line about no row or a row gone. Absent, the read hands everything, as it does the owner.
 */
export type PageSees = {
  line: (e: { kind: string; target: string | null; target_kind: string | null; field: string | null; row: Entry | null }) => boolean;
  question: (kind: 'suggestion' | 'decision', id: string) => boolean;
  list: (register: string) => boolean;
};

/**
 * Who changed a row last, for the byline a page draws under it: the kind of actor and who it was, when, and the batch
 * that puts the change back (`undoPlan`). For a run, its handle (`S42`), its agent (`claude`), the app it ran in and the
 * person it acts for; and whether the reader has seen it, against their read mark, when the host knows it.
 */
export type RowChange = {
  by: FeedBy;
  who: string;
  at: string;
  batch?: string;
  run?: string;
  agent?: string;
  app?: string;
  for?: string;
  unseen?: boolean;
};

/** A row's newest event, as `PageDeps.lastChanges` reads it: who, when, its batch, and for a run what the run says it is. */
export type LastChange = { actor: string; ts: string; batch: string | null; agent?: string; app?: string; for?: string };

/** One event about a row, oldest first. A create carries every field in `to` and `field: null`. */
export type RowEvent = { ts: string; actor: string; kind: string; field: string | null; to: Json | null };

/** `read_at` is the record's clock when it read the page, which a host draws "today" and "out of date" against. */
/**
 * `look` is the look the page was read under (`compose.ts`): who arranged it, what leads, what was hidden and the one next
 * action. Answered when the host reads looks (`PageDeps.look`).
 */
/**
 * `zone` is the record's own zone (an IANA name) the page was read in, so text drawn off the browser names the same day
 * the record does: a digest and the app say which zone their "today" is.
 */
export type PageResult = { page: string; title: string; blocks: BlockResult[]; read_at?: string; zone?: string; look?: LookBody; [key: string]: unknown };

/**
 * The refusals that hold a block back from its reader rather than ask its author to fix it: outside the caller's
 * ceiling is `FORBIDDEN`, inside it with a level that does not reach `read` is `LEVEL_REQUIRED`.
 *
 * A LIST OF CODES RATHER THAN "ANY REFUSAL AT ALL". A block refused for a misspelt key is a block somebody has to be
 * able to see in order to fix.
 */
export const WITHHELD_CODES: readonly string[] = ['FORBIDDEN', 'LEVEL_REQUIRED'];

const WITHHELD: ReadonlySet<string> = new Set(WITHHELD_CODES);

/**
 * Whether a page's blocks are every one withheld from their reader: at least one block, and each carries a refusal whose
 * code is in `WITHHELD_CODES`. ONE RULE FOR EVERY READ OF A PAGE, so the record's list of pages and an agent's list of
 * resources never disagree on whether a page is there for this caller. A page of no blocks is not withheld: it is empty.
 */
export function whollyWithheld(blocks: readonly { refusals?: readonly { code: string }[] | undefined }[]): boolean {
  return blocks.length > 0 && blocks.every((b) => (b.refusals ?? []).some((r) => WITHHELD.has(r.code)));
}

export type PageDeps = {
  /** Every live page declaration. */
  pages: () => PageDecl[];
  /** One metric document by its id, or `null`. */
  metric: (id: string) => MetricDecl | null;
  /** One reading. It is a callback rather than SQL because this layer runs queries it did not write. */
  read: (decl: MetricDecl) => Result<Reading>;
  /**
   * A money figure read with no currency to add up in, so each currency is its own amount (`<figure>.apart`). A host
   * that does not take it says no figure apart, and the sentence drops the clause.
   */
  readApart?: (decl: MetricDecl) => Result<Reading>;
  list: (q: {
    register: string;
    where?: Predicate | undefined;
    limit?: number;
    order?: { field: string; dir?: 'asc' | 'desc' }[];
    /** The cursor the page above answered with. A host that pages answers one; `null` or absent is the last page. */
    cursor?: string;
  }) => Result<{ rows: Entry[]; matched: number; cursor?: string | null }>;
  schemaOf: (register: string) => Schema | null;
  /** The field that titles a row of this register — what a template's slug is made from. */
  titleOf: (register: string) => string | null;
  /** A list's name as its declaration says it, or `null`, which a page's head names a list it goes back to by. */
  listName?: (register: string) => string | null;
  /** The cash walk, when a block names it. */
  /** `only` walks one currency's movements, unconverted, for a walk drawn once per currency. */
  /**
   * `into` walks in a currency other than the home one, every movement in another converted into it (`forecast.ts`): a
   * book's own, when its opening figure is read in it (`scopeCurrency` in `metrics.ts`). A host that does not take it
   * walks in the home currency, and the walk is then drawn once per currency rather than converted out of the book's.
   */
  runway: (opening: number, legs: readonly Leg[], horizon?: Horizon, only?: Only, into?: string) => Runway | null;
  /**
   * The length a reader picked on a forecast's horizon knob, in days or `last`, when it is longer than the walk reaches
   * unasked (`walkReach`). A forecast walks it only when its own `horizons:` offers it. Absent, nothing was asked.
   */
  walk?: number | 'last';
  /**
   * `false` READS A CARD'S TREND FROM ITS OWN FIGURE AND NEVER FROM THE PROJECT'S KEY NUMBER (`kpiLeadsOf`): a read for a
   * shared link (SL2), since the key numbers are read across the whole record and a link reads only the page.
   */
  keyNumbers?: false;
  ctx: EvalContext;
  /*
   * OPTIONAL, so a host that has not wired one of these gets `NOT_IN_THIS_BUILD` on the block that
   * needs it rather than a type error in every caller.
   */
  /** The field that says where a register's rows apply, and the register of projects it points at. */
  scopeOf?: (register: string) => { field: string; to: string } | null;
  /** The lists whose rows are steps of this list's rows, and how each says which row and whether it is done. */
  stepsOf?: (register: string) => ({ register: string } & StepsDecl)[];
  /** The kernel's `inScope`, which is where nearer-wins is decided. */
  inScope?: (register: string, project: string, opts: { limit?: number; open?: boolean }) => Result<{ rows: Entry[]; inherited: Entry[] }>;
  /** Every event about one row of `register`, oldest first. `row` is a spoken id or a row id. */
  history?: (register: string, row: string) => Result<RowEvent[]>;
  /**
   * The newest event of each row, by row id, in one read: what a block's `changes` answer. Absent, only a `changed`
   * column says who changed a row, read from `history` row by row, and no batch is said.
   */
  lastChanges?: (ids: readonly string[]) => ReadonlyMap<string, LastChange>;
  /** The newest `limit` events, newest first, and the reader's read mark. */
  activity?: (limit: number) => { events: ActivityEvent[]; seen: string | null };
  /**
   * The run a handle names (`S42`), in any state, or `null` where the record holds none: what a feed's `run_by` is read
   * from. `readPage` asks it once a run for a page, however many lines and blocks that run signed.
   */
  runOf?: (run: string) => Entry | null;
  /** Every run of the kernel's `session` register not in one of its `done` states, the most recently seen first. */
  sessionsLive?: () => Entry[];
  /**
   * The runs working now that no working run started, each with how many of its helpers are working too: `workingRuns`
   * in `presence.ts`, the one clock the rail, Today and the Agents page count by. The most recently heard from first.
   */
  sessionsWorking?: () => { run: Entry; helpers: number }[];
  /** Every active scheduled action, as the record's `actions` read lists them, keys by label. */
  actions?: () => ActionRow[];
  /** Every installed script, as the record's `scripts` read lists them (`script-rows.ts`), which a `scripts` block reads. */
  scripts?: () => ScriptRow[];
  /**
   * The record's vital signs now, in the order of the closed list (`signs.ts` `readSigns`): each its id, its name, its
   * state, its number and its own sentence. A `signs` block reads them; a sign with nothing to read is `none`.
   */
  signs?: () => readonly VitalSign[];
  /**
   * Every page resolved, once for a walk over many (`pageWalk` in `index.ts`). Absent, each page read resolves them
   * itself, as one read alone should.
   */
  resolved?: () => ReturnType<typeof resolvePages>;
  /**
   * The next steps runs left and nobody has taken, newest first, each marked `next` or `earlier`: in one project (its
   * spoken id, as a run holds it) or, with `null`, on the whole record (`openSteps` in `built-in-figures.ts`, over
   * `handoff.ts`'s `openHandoffs`). A `handoffs.open` block reads them.
   */
  handoffs?: (project: string | null) => readonly OpenStep[];
  /**
   * What went quiet on this record, the longest quiet first (`openExceptions` in `exceptions.ts`): a list or a
   * door that stopped, a feed that missed its time, a row older than its page allows. An `exceptions` block reads them.
   */
  exceptions?: () => readonly Exception[];
  /**
   * One project's scheduled actions that are paused, stopped as failed, or late, each in one sentence (`signs-actions.ts`
   * `actionsBlocking`): what is in the project's way besides its blockers. An `actions.blocking` block reads them.
   */
  blocking?: (project: string) => readonly ActionBlocking[];
  /**
   * Who opened a key last and when: the newest `grant.read` event on the grant a key's row points at, or `null` when
   * nobody has. `runs_on` asks it with the grant's id and answers only who and when, never the grant.
   */
  keyOpened?: (grant: string) => { actor: string; ts: string } | null;
  /** Every open of a key since an instant, newest first: the grant.read events on the grant a key's row points at, as the record's usedBy walks them. runs_on counts the runs among them and answers no grant. */
  keyUses?: (grant: string, since: string) => readonly { actor: string; ts: string }[];
  /** The fields a list marks its rows by, its `identity:` (`{ mark, accent }`), or `null` when it declares none. */
  identityOf?: (register: string) => { mark?: string; accent?: string } | null;
  /**
   * The open questions, dearest first and the oldest first within a band, cut to `limit`, and how many are open in all.
   *
   * `keep` IS THE BLOCK'S `where:`, over what the record knows of a question before it reads it whole, so the cut is
   * made after the filter and over every open question rather than the newest few. A host that takes it answers
   * `matched`, `stale` and `hardToUndo` over what `keep` admitted (every open question without one); a host that does
   * not leaves them out, and the queue counts what it was handed.
   */
  openQuestions?: (
    limit: number,
    keep?: (q: OpenFacts) => boolean,
  ) => { questions: QueueQuestion[]; open: number; matched?: number; stale?: number; hardToUndo?: number };
  /** The questions put off whose day has not come, soonest back first, and how many there are. */
  laterQuestions?: (limit: number) => { questions: QueueQuestion[]; later: number };
  /** Agents' suggestions waiting on their shelf beside Needs you, oldest first, and how many there are. */
  apartQuestions?: (limit: number) => { questions: QueueQuestion[]; apart: number };
  /** The answered questions, latest first, and how many there are. */
  decisions?: (limit: number) => { decisions: DecidedQuestion[]; total: number };
  /**
   * How many rows of `register` the predicate admits, by the value each holds in `field` (`null` for none), for a
   * page's reader filters. Absent, the page counts them from `list`, which reads every row to do it.
   */
  tally?: (q: { register: string; field: string; where?: Predicate | undefined }) => Result<{ value: Json; n: number }[]>;
  /**
   * A list added up in the database, in one grouped query, for a block that adds up (`WholeAsk`, `WholePart`). Absent,
   * the block reads every row a page at a time through `list` and adds them up here, to the same answer.
   */
  whole?: (q: WholeAsk) => Result<WholePart[]>;
  /** The record's timezone, which a day of readings is counted in. `UTC` when absent. */
  tz?: string;
  /**
   * The entry the text sits on: a template page's row, or the row whose own screen draws a document. A one-word
   * `{{path}}` is that entry's field when its list declares one, and `<field>.count` counts a list field of it.
   * Absent, a path reads as it always has.
   */
  here?: Entry;
  /** The record's home currency, or `null` when it has none, which an `inputs` block answers as `home`. */
  home?: () => string | null;
  /**
   * The readings a `stat` or `lines` over a register draws: the named fields of every row the predicate admits whose
   * `when` is on or after `since`, and the newest reading of each measure whenever it was.
   */
  readings?: (q: {
    register: string;
    where?: Predicate | undefined;
    when: string;
    value: string;
    name?: string;
    unit?: string;
    /** A money field each reading may hold in place of `value`: minor units and a currency, read whole. */
    amount?: string;
    /** The sixth column: a field each measure is listed under, answered as a person reads it (a link by its row's name). */
    group?: string;
    since: string;
  }) => Result<{ readings: RawReading[]; latest: RawReading[] }>;
  /** A series' daily points from one day to another, both included, oldest first (`metric_point`). */
  /** `unit` is the currency or unit the point was written in, `''` or absent for none. */
  points?: (series: string, from: string, to: string) => { at: string; value: number; unit?: string | null }[];
  /**
   * Every list the record declares, with the states that finish its rows and its fields: what `deadlines` walks, since
   * it reads across the lists rather than one. Declarations only, so asking reads no row.
   */
  lists?: () => readonly ListShape[];
  /** Every live metric declaration, which `figures.home` and a forecast's sell knob choose from by what each declares. */
  metrics?: () => readonly MetricDecl[];
  /**
   * The installed module or add-on a declaration came with, by the declaration's id (`metric.open-tasks`), or `null` for
   * one nobody's pack brought: what `<module>.<figure>` asks. Absent, a declaration's own `pack:` says, and a
   * figure that names none is its list's, as a first-party pack places it.
   */
  packOf?: (id: string) => string | null;
  /**
   * The blocks installed packs add to the page whose declaration id is `page` (`additionsOf` in `page-adds.ts`), which
   * `readPage` lays among the page's own. Absent, a page draws its own blocks and nothing else.
   */
  adds?: (page: string) => readonly PageAddition[];
  /**
   * What `readBlock` hands a registered kind beside the record's reads (`KindKit`). Filled by `readBlock` when it asks a
   * kind module, and by nothing else: a host leaves it out, and whatever a host put here is replaced.
   */
  kit?: KindKit;
  /**
   * The live `look.<page>` declaration's body for a page's declaration id without `page.`, or `null` when none is
   * stored. A HOST THAT HANDS THIS TURNS THE ENGINE ON: each page is read under its stored look, or the rules' look
   * (`composeLook`) when it has none, and the answer says which in `look`. Absent, a page reads as declared.
   */
  look?: (page: string) => unknown;
  /**
   * WHO IS READING, for the look: each block as this reader may be shown it (whole, or held back with the sentence that
   * says why), and their own read mark. A host that hands this has the page's blocks held BEFORE its look is composed
   * and laid, so the rules weigh only what the reader may see, and a look Slash wrote from blocks she is held from is
   * not laid for her (`lookedAt`). The answer carries the held blocks. Absent, every block is read as the record's.
   */
  reader?: {
    hold: (block: BlockResult) => BlockResult;
    seen?: string | null;
    /**
     * Whether this reader may read the inbox. `false` has each vital sign a `signs` block draws told in the kernel's
     * words with no facts (`quietSign`), BEFORE its `where:` is read, so a filter cannot search a message's text either.
     * Absent is the record's own reader, who reads every sign as it was filed.
     */
    inbox?: boolean;
  };
  /**
   * THE READER'S LEVEL, in the record's words (`row-actions.ts` `ACTION_LEVELS`: read, write, decide or owner), as the
   * record checks it for a write. Each block's `actions` and `row_actions` are cut to it, so a reader is sent only what
   * the record would let them press. Absent is `read`, and nothing beyond reading is sent.
   */
  level?: string;
  /**
   * WHO READS, for a `when: { reader }`: the record's owner, a member signed in, an agent on a token, or
   * somebody holding a link. Named apart from `reader` above, which is how a reader is held. Absent, no block whose
   * `when` asks who reads is sent, so a host that has not said who reads is never shown what was held for the owner.
   */
  readerIs?: WhenReader;
  /** WHAT THE READER PICKED ON THE PAGE'S FILTERS, by field, for a `when: { picked }`. Absent, nothing was picked. */
  picked?: ReadonlyMap<string, string>;
  /**
   * The verbs this host carries out (`RUNS` in `packages/record/src/verbs.ts`). A verb the table names and the host does
   * not run yet is cut, rather than sent to be refused on every press. Absent, the table is the whole answer.
   */
  runs?: ReadonlySet<string>;
  /**
   * WHAT THE RECORD READS THAT THE KERNEL CANNOT: a source by its name, such as `lists` or `pages`, or
   * `undefined` for one the host does not hold. Asked only where no registered source answers the name, so a host never
   * shadows one, and never for a list (`register.<id>`). Absent, such a name is a source nobody knows.
   */
  hostSources?: (name: string) => HostSource | undefined;
  /**
   * A person who wrote a line of the log, by the name the record holds for them, or `null` where it holds none: what an
   * Activity page's "who" filter offers them by. Absent, every person is offered together as People, never by an id.
   */
  actorName?: (actor: string) => string | null;
};

/**
 * One source the record hands the page reader (`PageDeps.hostSources`): its fields, and its rows read as a list's are,
 * `where`, `order`, `limit` and `cursor` passed through. `whole` says it reads across the whole record, so a page that
 * draws it is held from a reader who does not read all of it (`WHOLE_RECORD`). `says` is one line about it for a person.
 */
export type HostSource = {
  says?: string;
  whole?: true;
  schema: Schema;
  rows(q: {
    where?: Predicate | undefined;
    order?: { field: string; dir?: 'asc' | 'desc' }[];
    limit?: number;
    cursor?: string;
  }): Result<{ rows: Entry[]; next?: string | null; matched?: number }>;
};

/**
 * What a kind module (`kinds/index.ts`) reads a block with that it may not import: this file's and `metrics.ts`'s own
 * functions, handed over on `deps.kit` when `readBlock` asks the module.
 *
 * HANDED OVER AND NOT IMPORTED, because importing them is a loop the module loses. `block-keys.ts` and `declare.ts`
 * read the kind registry while they load, and this file and `metrics.ts` each reach `declare.ts` through their own
 * imports (`govern.ts` down to `migrate.ts`). A kind module importing either, loaded first as the registry's own test
 * loads it, would load `block-keys.ts` before the registry's table existed, and the kernel would not load at all.
 */
export type KindKit = {
  /** `metrics.ts`'s own, so a kind reads a `where:` sentence, and the clauses it adds, exactly as every block does. */
  predicateOf: typeof predicateOf;
  /** Today in the record's own zone, `2026-09-25`, as a `stat` over readings counts its days (`measures.ts`). */
  today: () => string;
};

/** A `file` field's stored value, which is what a page answers for a file: never its bytes and never an address. */
export type StoredFile = { sha256: string; mime: string; bytes: number; name: string };

/**
 * What a list says about itself that a read across the lists needs: its id, the states that mean finished, and which of
 * its fields are deadlines. The kernel's `RegisterDecl` is one; named by shape, so this file imports no more of it.
 */
export type ListShape = {
  id: string;
  done?: readonly string[] | undefined;
  /** `to` is the list a ref points at, which names the parts of a figure grouped by it (`pointsBeside`). */
  /** `search` is whether the field is one a row is searched by (`fts.ts`), which a page's head narrows by too (`page-search.ts`). */
  fields: readonly { id: string; type: string; to?: string | undefined; deadline?: boolean | undefined; retired?: boolean | undefined; search?: boolean | undefined }[];
};

/**
 * What `registersOf` asks to name the lists a block reads beside its source: the reads of `PageDeps` it needs, and the
 * list a run's project is a row of. Declarations, never rows, so asking costs no read of any list.
 */
export type ListsBeside = {
  stepsOf?: (register: string) => readonly { register: string }[];
  scopeOf?: (register: string) => { field: string; to: string } | null;
  /** The one list that declares `scopes:`, whose rows the ladder places runs in, or `null` when there is none. */
  projects?: () => string | null;
  /** Every list, as `PageDeps.lists` answers, so a `deadlines` block names each list that holds a deadline. */
  lists?: () => readonly ListShape[];
  /** Every live metric, as `PageDeps.metrics` answers, so the home figures and the sell knob name the lists behind theirs. */
  metrics?: () => readonly MetricDecl[];
  /** The module a declaration came with, as `PageDeps.packOf` answers, so `<module>.<figure>` names its figure's lists. */
  packOf?: (id: string) => string | null;
  /** The sources the record reads, as `PageDeps.hostSources` answers, so one that reads across the record is named `*`. */
  hostSources?: (name: string) => HostSource | undefined;
};

/** The source a block names for one project's actions in its way, which that source holds. */
export { ACTIONS_BLOCKING };

/** The name `registersOf` gives a read across the whole record, which no register id can be. */
export const WHOLE_RECORD = '*';

/**
 * The kinds that ADD THEIR ROWS UP, whose `limit:` cuts the GROUPS they draw and never the rows they read.
 *
 * A sum over the first six rows is a wrong number rather than a short list. So these read as many
 * rows as a list read hands back at once, and a register past that says it cannot be drawn rather
 * than adding up part.
 *
 * THAT LAST CLAUSE WAS A SENTENCE IN THIS COMMENT AND NOT A LINE OF CODE. `READ_WHOLE` had one
 * site, the read limit below, and nothing compared `matched` against it: measured on a record with
 * 301 obligations, a `split` came back with 200 rows, `matched: 301` and an EMPTY `refusals`, so
 * the figure was the first 200 amounts added up. `apps/web` happened to guard it, which made the
 * kernel's own correctness rule the property of one of its callers: `packages/mcp` publishes the
 * same answer to an agent as "rows and figures", and an agent totalling a bar over a 250-row
 * register was told nothing. The refusal was below, where every consumer got it.
 *
 * AND THE REFUSAL IS GONE WHERE A WHOLE READ IS HANDED (`handsWhole`), because it made a list past 200 rows
 * undrawable: the Ledger's own chart of where the money went was dead from its 201st row. These kinds now answer
 * `wholeRead`, added up over every row (`wholeOf`), and what bounds them is time (`WHOLE_MS`), with a count far above
 * any list a person keeps (`WHOLE_WALK_ROWS`) for the host whose clock does not move.
 *
 * `section` IS NOT ONE OF THESE. Its count on screen is `total`, the whole match, so it is never
 * showing a slice; it reads no row to be right, and measured over the same 301 rows it draws its
 * default 50 and is correct. Putting it here would refuse a heading that has nothing to add up.
 * That is the other question, and it has its own name below.
 *
 * THE SET ITSELF, AND `REDUCES` BESIDE IT, ARE `constants.ts`'s, so a screen that needs only the set does not
 * read this file. They are exported from here as they always were.
 */
export { REDUCES, SUMS };
/**
 * HOW MANY ROWS RIDE BESIDE A WHOLE READ, and it is no longer a ceiling. A kind that adds up answers
 * `wholeRead`, its parts and its total over every row, and these rows are handed with it so a drawer written before
 * `wholeRead` still draws a list this short as it did. Past them it has only `wholeRead` to draw from.
 */
const ROWS_BESIDE = 200;

/** How long a whole read may take before the block is refused instead, in milliseconds: the bound that replaced 200 rows. */
export const WHOLE_MS = 250;
/** How many parts a whole read hands back by label; the smallest past that are added into `rest`, never dropped. */
export const WHOLE_PARTS = 200;
/** A page of the list a whole read walks when the host hands no grouped read (`PageDeps.whole`). */
const WHOLE_PAGE = 500;
/**
 * How many rows that walk reads at most. TIME IS THE BOUND, AND A CLOCK MAY NOT MOVE: on a host
 * whose `performance.now()` stands still through one piece of work the walk never ran late, so a ledger of any length
 * was walked a page at a time on every open of the page. A count holds whatever the clock does, and it is read off
 * the first page's `matched` where the host says one, so a list past it is refused after one page and not after a
 * hundred. The grouped read a host hands in (`PageDeps.whole`) is one query and is not counted here.
 */
export const WHOLE_WALK_ROWS = 50_000;

/**
 * WHETHER THIS BUILD HANDS A WHOLE READ AT ALL, which is whether `ANSWER_KEYS` (`block-keys.ts`) lists `wholeRead`.
 *
 * THE RECORD BLANKS A HELD BLOCK BY THAT LIST AND BY NOTHING ELSE (`shellOf` in `packages/record`), so an answer key
 * missing from it stays on a block a reader is held from. Measured with `wholeRead` unlisted: a member invited to
 * Categories alone opened a page with a bar over Transactions and was handed every label and the total off the held
 * block, which is the fault `latest` had (`test/answers-keys.test.ts`). So the key is handed only where the list that
 * takes it off again has it, and where it does not a kind that adds up reads as it did before: `ROWS_BESIDE` rows, and
 * a refusal past them. ASKED WHEN A BLOCK IS READ, never when this file loads, as every read of that file's lists is.
 */
const handsWhole = (): boolean => ANSWER_KEYS.includes('wholeRead');

/** What a whole read asks the database: the fields it groups by, and the field it adds up, or `null` to count rows. */
export type WholeAsk = {
  register: string;
  where?: Predicate | undefined;
  /** `day: true` groups by the day a value falls on, its first ten characters, so an instant is grouped by its day. */
  by: readonly { field: string; day?: true }[];
  value: string | null;
  /** The list's day field, grouped by as well when the value is money, so each amount is converted at its own day's rate. */
  dated: string | null;
};

/**
 * One group of a whole read as the database answers it: the value of each `by` field as the rows hold it, the currency
 * or unit the amounts were in (`null` for a bare number), their day, their sum, and how many rows there were and how
 * many of them held a value. Two currencies are two groups, so nothing is added across them here.
 */
/**
 * `rows` counts what was added up, a split row once a part; `entries`, where a host says it, counts the rows themselves,
 * so a split row is one (review of 30 October, R14). Absent, it is `rows`.
 */
export type WholePart = { by: Json[]; unit: string | null; day: string | null; sum: number; rows: number; said: number; entries?: number };

/** One part of a block that adds up: a label as the rows hold it, never a name made up here. */
export type WholeRow = {
  /** The first column's value as stored, `null` for the rows that hold none. A heat's is its day. */
  label: Json;
  /** On a heat drawn a person a line (`who: true`): who, as stored. */
  who?: Json;
  rows: number;
  /** The sum, or the count where the block counts. `null` when it is money in currencies that are not added: see `parts`. */
  value: number | null;
  /** The currency or unit `value` is in. Absent on a count and on a bare number. */
  unit?: string;
  /** One amount a currency, when they could not be added into one. */
  parts?: Part[];
  /** The whole this part is a share of: a heat day's under `of:`, and all the rows of a `progress` group. */
  of?: number | null;
  /** On a `tally:` bar, the day of the newest row with an amount in this part, as the list's day field holds it. */
  last?: string;
};

/**
 * What a kind that adds up answers beside its rows: its parts by label and the total of EVERY row its scope
 * and `where` admit, added up in the database or over the whole list, never over a page of it.
 */
export type WholeRead = {
  /** The parts, largest first; a heat's days oldest first, and only the days of its twelve weeks. */
  rows: WholeRow[];
  /** The sum or the count over every row. `null` when it is money that could not be added into one currency. */
  total: number | null;
  unit?: string;
  parts?: Part[];
  /** Present when the money was converted into the home currency: the oldest rate's day, and whether it is stale. */
  converted?: { asOf: string; stale: boolean };
  /** The whole the total is a share of: what a heat's `of:` admits, or every row a `progress` counted. */
  of?: number | null;
  /** Past `WHOLE_PARTS` labels: how many more there were, and what they add up to. */
  rest?: { labels: number; rows: number; value: number | null; unit?: string; parts?: Part[] };
  /** On a heat: the rows dated outside its twelve weeks, or holding no day, which no cell draws. */
  outside?: number;
  /** On a heat: how many distinct days outside its twelve weeks hold a row. A row with no day is in `outside` and is no day. */
  outsideDays?: number;
};

/** The register `sessions.live` and `sessions.working` read, whose fields their columns name. */
const SESSION = 'session';

/** The field of a run that says which project it is placed in, by that project's spoken name (`projectsOf`). */
const PLACED = 'project';

/** How many versions a `diff` shows: `42 §4.5` bounds `versions` at 2 to 10. */
const VERSIONS = { least: 2, most: 10 } as const;

/**
 * Every page a person could open, templates expanded.
 *
 * The slug of an expanded page is the ROW'S TITLE, lower-cased and hyphenated — not its number.
 * `/p/kiln` is a URL somebody can type and one that survives the row being renumbered; `/p/things-1`
 * is neither.
 */
/**
 * EVERY ROW A PREDICATE MATCHES, a page at a time, in the record's own order. A template is a page per row, and it
 * read one page of 200: the row after that had no page at all, and nothing said so. The walk follows the cursor
 * `list` answers with, so the order is the keyset's and a row comes once. A host whose `list` answers no cursor
 * is read as one page, which is what it said it had.
 */
function everyRow(deps: PageDeps, register: string, where: Predicate | undefined): Result<{ rows: Entry[]; matched: number }> {
  const rows: Entry[] = [];
  let cursor: string | null = null;
  let matched = 0;
  do {
    const got = deps.list({ register, ...(where ? { where } : {}), limit: 500, ...(cursor ? { cursor } : {}) });
    if (!got.ok) return got;
    rows.push(...got.value.rows);
    matched = got.value.matched;
    cursor = got.value.rows.length > 0 ? (got.value.cursor ?? null) : null;
  } while (cursor);
  return ok({ rows, matched });
}

/**
 * WHEN A PAGE CLAIMS ITS ADDRESS: a page somebody wrote first (0), a template over rows that stay second (1), and a
 * template over rows that are many and short-lived last (2), which is one over the runs' own list or one whose `for:`
 * says `fleeting: true`.
 */
export function claimRank(decl: PageDecl): 0 | 1 | 2 {
  if (!decl.for) return 0;
  return decl.for.register === SESSION || decl.for.fleeting === true ? 2 : 1;
}

/* `fillRow` FILLS A TEMPLATE FROM ONE OF ITS ROWS, `fill` unless the caller keeps the pages it filled before (`pages()` in
   the kernel), which must answer what `fill` would. */
export function resolvePages(
  deps: PageDeps,
  fillRow: (decl: PageDecl, row: Entry) => PageDecl = (decl, row) => fill(decl, row) as PageDecl,
): { slug: string; decl: PageDecl; row?: Entry; refusal?: Refusal }[] {
  type Resolved = { slug: string; decl: PageDecl; row?: Entry; refusal?: Refusal };
  const taken = new Set<string>();

  /**
   * A slug nothing else has.
   *
   * TWO ROWS WITH THE SAME TITLE USED TO GIVE TWO PAGES AT ONE ADDRESS, and only the first was
   * reachable — while its own filled predicate (`name is Kiln`) matched BOTH, so the page for one
   * project showed the other's rows under its own name. A punctuation-only title slugged to the
   * empty string, and every one of those collided there.
   */
  const claim = (name: string, register: string, seq: number | null): string => {
    const base = slugify(name) || `${register}-${seq ?? 0}`;
    if (!taken.has(base)) {
      taken.add(base);
      return base;
    }
    /* AND THE FALLBACK WAS NEVER CHECKED EITHER, so the collision it exists to break could happen
       to it: a static page called `kiln`, a static page called `kiln-1`, and a template row titled
       "Kiln" at seq 1 put two pages at `kiln-1`. `readPage` finds by slug, so the second was listed
       and unreachable, which is the exact failure the paragraph above says was fixed. Counting up
       ends because `taken` is finite and every step adds to it. */
    let unique = `${base}-${seq ?? taken.size}`;
    for (let n = 2; taken.has(unique); n += 1) unique = `${base}-${seq ?? taken.size}-${n}`;
    taken.add(unique);
    return unique;
  };

  /* THE ADDRESSES ARE CLAIMED IN AN ORDER THAT DOES NOT MOVE: the pages somebody wrote first, then the templates, each
     by its declaration's id. They were claimed in the order the record handed the declarations over, and that read has
     no `ORDER BY`, so whichever template the store answered first took the bare name: two templates over one list could
     trade `/p/<name>`, and re-installing one could move it. A page somebody wrote goes first because its name is the
     author's word for it, where a template's is a row's title that happens to match. The ids are compared by code unit
     and not by `localeCompare`, so every host sorts them alike.

     ONLY THE CLAIMING IS SORTED. The pages still come out in the order the record handed them over, which is the
     order `boot`, `pages` and the rail read them in, because this is about addresses and not about places.

     AND A TEMPLATE WHOSE ROWS COME AND GO CLAIMS LAST (`claimRank`). By id alone `run` sorts before `skill` and
     `someone`, so a run whose doing slugged to an active skill's name took `/p/<skill>` and the skill's page moved to
     `<skill>-4`: a link to a skill moved every time an agent started work under its name. Runs are many and short-lived,
     so they take what is left, and a run that meets a steadier page's name is the page that is numbered.

     AND AMONG TEMPLATES OF ONE RANK, THE ROW THAT WAS THERE FIRST KEEPS ITS ADDRESS. By template id alone, a project
     added today named like a skill added last month took `/p/<skill>` from it because `project` sorts before `skill`, and
     a link somebody had kept for a month opened somebody else's page. So a row's pages claim in the order the rows were
     written, the template's id breaking a tie between two pages of one row, and a newcomer is the page that is numbered.
     A numbered address carries its row's number and not a count, so it does not move either. */
  const decls = deps.pages();
  const made: Resolved[][] = decls.map(() => []);
  /** One address to claim: the name it wants, when, and where its page goes once it has one. */
  type Want = { rank: 0 | 1 | 2; age: string; page: string; at: number; nth: number; name: string; register: string; seq: number | null; put: (slug: string) => void };
  const wants: Want[] = [];
  const filled: (() => void)[] = [];
  decls.forEach((decl, at) => {
    const here = made[at]!;
    const claims = claimRank(decl);
    if (!decl.for) {
      wants.push({ rank: claims, age: '', page: decl.page, at, nth: 0, name: decl.page, register: 'page', seq: null, put: (slug) => here.push({ slug, decl }) });
      return;
    }

    /* A TEMPLATE THAT CANNOT BE EXPANDED IS STILL A PAGE, and it says why. These were `continue`d,
       so a declaration with a typo in its `for.where` was reported as a page that does not exist —
       to the person who had just written it. It claims after its rank's rows, by its id: a template that broke has not
       claimed its own id while it worked, so taking it now would move a row's page that already held it. */
    const refuse = (refusal: Refusal): void => {
      wants.push({ rank: claims, age: '\uffff', page: decl.page, at, nth: 0, name: decl.page, register: 'page', seq: null, put: (slug) => here.push({ slug, decl, refusal }) });
    };

    const register = decl.for.register;
    const schema = deps.schemaOf(register);
    if (!schema) {
      refuse({ code: 'REGISTER_UNKNOWN', fix: `${decl.page} is a page per row of ${register}, and there is no such register.`, at: 'for' });
      return;
    }
    const said = predicateOf(decl.for.where, schema, deps.ctx);
    if (said.bad.length) {
      refuse(said.bad[0]!);
      return;
    }
    const listed = everyRow(deps, register, said.predicate);
    if (!listed.ok) {
      /* A LIST CANNOT CONFLICT — nothing was written — so the guard is the type system agreeing
         rather than a case anybody expects to see. */
      if (refused(listed)) refuse(listed.refusal);
      return;
    }
    const title = deps.titleOf(register);
    if (!title) {
      refuse({ code: 'REQUIRED_MISSING', fix: `${register} names no title field, so its pages have no name.`, at: 'for' });
      return;
    }

    /* TWO ROWS OF ONE NAME, IN TWO PLACES, ARE TELLABLE APART BY THE PLACE. A project's skill hides the global one of
       its name (`32 §2.1`, nearer wins), so both are real and both have pages; numbering the second gave
       `review-pr` and `review-pr-1`, which says nothing about which is which, and which of them took the bare
       name turned on the order the rows were listed in. So the row that applies everywhere keeps the name, and a
       row scoped to a place is named for it too: `review-pr-kiln`. */
    /* A TEMPLATE'S PAGES KEEP ONE ORDER. They share the template's one `nav.order`, so the order they were listed in
       was the order a rail and a strip of tabs drew them in, and that was the list's default, the row changed last
       first: editing a part moved its tab (measured on a pack with a page per part). So they come in the list's
       declared order, which is its `steps:` order where it is a list of steps, a row with none after the rest, and
       otherwise, and between equals, the order the rows were written in. */
    const order = ownSteps(deps, register, schema)?.order;
    const rank = (row: Entry): number | string | null => {
      const v = order === undefined ? null : row.fields[order];
      return typeof v === 'number' || typeof v === 'string' ? v : null;
    };
    const rows = [...listed.value.rows].sort((x, y) => {
      const a = rank(x);
      const b = rank(y);
      if (a !== b) {
        if (a === null) return 1;
        if (b === null) return -1;
        if (a < b) return -1;
        if (a > b) return 1;
      }
      return (x.seq ?? 0) - (y.seq ?? 0);
    });
    const counts = new Map<string, number>();
    for (const row of rows) {
      const base = slugify(String(row.fields[title] ?? ''));
      counts.set(base, (counts.get(base) ?? 0) + 1);
    }
    const scope = deps.scopeOf?.(register) ?? null;
    let places: Map<string, string> | null = null;
    const placeOf = (row: Entry): string | null => {
      const at = scope ? row.fields[scope.field] : undefined;
      if (!scope || typeof at !== 'string') return null;
      if (!places) {
        const named = deps.titleOf(scope.to);
        const held = everyRow(deps, scope.to, undefined);
        places = new Map(held.ok && named ? held.value.rows.map((r) => [r.id, String(r.fields[named] ?? '')]) : []);
      }
      return places.get(at) || null;
    };
    /* KEYED BEFORE IT IS FILLED, so every page out of one template answers one key for one block whatever its row
       wrote into the heading, and one look covers them all (`block-keys.ts`). */
    const keyed: PageDecl = Array.isArray(decl.blocks) ? { ...decl, blocks: keyedBlocks(decl.blocks) } : decl;
    const slugs = new Map<Entry, string>();
    const shared = [...counts.values()].some((n) => n > 1);
    /* EACH ROW'S PLACE ASKED ONCE, not twice for every comparison the sort makes. */
    const placedAt = shared ? new Map(rows.map((row) => [row, Number(placeOf(row) !== null)])) : null;
    const everywhereFirst = placedAt ? [...rows].sort((x, y) => placedAt.get(x)! - placedAt.get(y)!) : rows;
    everywhereFirst.forEach((row, nth) => {
      const name = String(row.fields[title] ?? '');
      const place = (counts.get(slugify(name)) ?? 0) > 1 ? placeOf(row) : null;
      wants.push({ rank: claims, age: row.created_at, page: decl.page, at, nth, name: place === null ? name : `${name} ${place}`, register, seq: row.seq, put: (slug) => slugs.set(row, slug) });
    });
    /* The pages come out in the template's own order once every row has its address. */
    filled.push(() => {
      for (const row of rows) here.push({ slug: slugs.get(row)!, decl: fillRow(keyed, row), row });
    });
  });

  /* A row's age is its `created_at`, which is an ISO stamp and so sorts by code unit; a page written by hand has none and
     claims by its id alone, and a broken template's own page has the last there is. Between two rows of one moment the template's id decides, then the order the template put
     its own rows in (a row that applies everywhere before one scoped to a place). */
  const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  wants.sort((x, y) => x.rank - y.rank || cmp(x.age, y.age) || cmp(x.page, y.page) || x.at - y.at || x.nth - y.nth);
  for (const want of wants) want.put(claim(want.name, want.register, want.seq));
  for (const fillIn of filled) fillIn();
  return made.flat();
}

/* HOW MANY PAGES OUT OF ONE TEMPLATE A RAIL DRAWS, `RAIL_PAGES`, and the counter that keeps to it, `railRoom`: `constants.ts`'s,
   with why the cap is in the kernel at all, because the shell reads them on its first open and this file is half the kernel. */
export { RAIL_PAGES, railRoom };

/**
 * One page, with every block run.
 *
 * `filter` IS WHAT THE READER CHOSE in the page's own `filters:`, a value by field: `{ project: '12' }`. Each is ANDed
 * onto every block over a list that has the field, and the answer's `filters` says which values each could take and
 * how many open rows hold each. A field the page does not filter on is not applied, and a value the field cannot hold
 * is answered as no choice, so an address kept from before a page changed still opens it.
 */
/**
 * THE PAGE OF ONE ROW THAT COMES AND GOES, FOUND BY ITS ADDRESS AND THE ROW THE HOST LAST SAW AT IT (scope 2026-10-24
 * H18), or `null` when that row no longer holds that address. Such pages claim last (`claimRank`), so the address one
 * holds turns on every steadier page and on earlier rows of its own kind alone: the steadier ones are resolved, the row
 * is read by its number, and its claim is made as `resolvePages` makes it. A row an earlier one shares a name with is
 * numbered there, which this answers as a different address, so the caller resolves them all as before. A read of one
 * run's page filled a page for each of 908 runs on his record.
 */
function rowPageAt(deps: PageDeps, slug: string, about: { register: string; seq: number }): ReturnType<typeof resolvePages>[number] | null {
  const decls = deps.pages();
  const over = decls.filter((d) => claimRank(d) === 2 && d.for?.register === about.register);
  if (over.length !== 1) return null;
  const decl = over[0]!;
  const schema = deps.schemaOf(about.register);
  const title = deps.titleOf(about.register);
  if (!schema || !title) return null;
  const said = predicateOf(decl.for!.where, schema, deps.ctx);
  if (said.bad.length) return null;
  const bySeq: Predicate = { field: 'seq', is: about.seq };
  const got = deps.list({ register: about.register, where: said.predicate ? { all: [said.predicate, bySeq] } : bySeq, limit: 1 });
  if (!got.ok || got.value.rows.length !== 1) return null;
  const row = got.value.rows[0]!;
  const taken = new Set(resolvePages({ ...deps, pages: () => decls.filter((d) => claimRank(d) < 2) }).map((p) => p.slug));
  const base = slugify(String(row.fields[title] ?? '')) || `${about.register}-${row.seq}`;
  let claimed = base;
  if (taken.has(base)) {
    claimed = `${base}-${row.seq}`;
    for (let n = 2; taken.has(claimed); n += 1) claimed = `${base}-${row.seq}-${n}`;
  }
  if (claimed !== slug) return null;
  const keyed: PageDecl = Array.isArray(decl.blocks) ? { ...decl, blocks: keyedBlocks(decl.blocks) } : decl;
  return { slug, decl: fill(keyed, row) as PageDecl, row };
}

export function readPage(host: PageDeps, slug: string, filter?: Readonly<Record<string, string>>, about?: { register: string; seq: number }): Result<PageResult> {
  /* A RUN IS READ ONCE FOR THE PAGE (`runsOnce`), whichever of its blocks names it first. */
  const deps = runsOnce(host);
  /* A PAGE SOMEBODY WROTE IS FOUND AMONG THE WRITTEN ONES ALONE (scope 2026-10-24 A9). They claim their addresses before
     any template does (`resolvePages`), so which address each holds never turns on a template's rows, and resolving every
     page to find one filled a page for every row of every template: on his record a read of the Agents page filled one
     for each of 908 runs, 1,410 ms of the record's time. A slug none of them holds is looked for among them all. */
  /* AND A RUN'S PAGE, WHEN THE HOST SAYS WHICH ROW HELD ITS ADDRESS (`rowPageAt`), is found by that row alone. */
  const atRow = about !== undefined && host.resolved === undefined ? rowPageAt(deps, slug, about) : null;
  const written = atRow === null && host.resolved === undefined ? resolvePages({ ...deps, pages: () => deps.pages().filter((d) => !d.for) }) : null;
  const mine = written?.find((p) => p.slug === slug && !p.refusal);
  /* AND A PAGE OF A ROW THAT STAYS, A PROJECT'S, IS FOUND AMONG THE PAGES THAT CLAIM BEFORE THE RUNS' (`claimRank`): their
     addresses never turn on a run, so filling a page for each run to find a project's was the most of its time. A slug
     none of them holds is looked for among them all. */
  const steady =
    atRow === null && mine === undefined && host.resolved === undefined ? resolvePages({ ...deps, pages: () => deps.pages().filter((d) => claimRank(d) < 2) }) : null;
  const held = steady?.some((p) => p.slug === slug) === true ? steady : null;
  const every = atRow !== null ? [atRow] : mine !== undefined ? written! : (held ?? host.resolved?.() ?? resolvePages(deps));
  const found = atRow ?? mine ?? every.find((p) => p.slug === slug);
  /* THE SLUGS OFFERED ARE THE PAGES SOMEBODY WROTE, AND NEVER THE ONES A TEMPLATE MADE OUT OF ROWS. A page per row is
     named after the row's title, so listing those slugs listed every row title of every templated list, and this
     function cannot tell who is asking. Measured: a member invited to Obligations alone asked for `nope` and was handed
     `dinner-with-the-auditor` and `told-sam-about-the-redundancy-list` from a Diary she cannot read, while `pages` in
     the same run listed her `desk` and nothing else. A written page's slug is the author's word for a page, so the
     owner who types `dsek` still gets `desk`; one who mistypes a project's page is sent to `pages`, which answers each
     caller with what that caller may open. */
  if (!found)
    return no<PageResult>('PAGE_UNKNOWN', `There is no page at ${slug}. A page made for each row of a list is not named here; pages lists every page you can open.`, {
      at: 'slug',
      allowed: every.filter((p) => !p.row).map((p) => p.slug),
    });

  /* A PAGE THAT COULD NOT BE EXPANDED IS A PAGE WITH ONE SENTENCE ON IT, not a 404. The person
     reading it is usually the person who wrote the declaration. */
  /* THE RECORD'S CLOCK, WHEN IT READ THE PAGE. What is out of date, what is late and which day is today on this page are
     the record's answers, so a host draws them against this rather than against its own clock. */
  const read_at = new Date(deps.ctx.nowMs).toISOString();
  const zone = deps.tz ?? 'UTC';
  if (found.refusal) {
    const note = { kind: 'note', rows: [], matched: 0, refusals: [found.refusal] };
    return ok({ ...found.decl, page: found.slug, read_at, zone, blocks: [{ ...note, key: blockKeyOf(note) }] });
  }

  /* AN EXPANDED PAGE SAYS WHICH ROW IT IS ABOUT, so a host can name the project without guessing it
     from the title. The title is already the row's, so this says nothing the page did not. */
  const title = found.row ? deps.titleOf(found.row.register) : null;
  /* EVERY BLOCK TAKES ITS KEY HERE, the page's own first, so a block another pack adds never takes a key the page's
     own has; each addition is keyed before its row fills it, as the template's own were (`resolvePages`). */
  const taken = new Set<string>();
  const own = keyedBlocks(found.decl.blocks, taken);
  const adds = deps.adds?.(`page.${found.decl.page}`) ?? [];
  const addKeys = keyedBlocks(
    adds.map((a) => a.block),
    taken,
  ).map((b) => b.key);
  const laid = withAdds(
    own,
    adds.map((a, i) => {
      const block = { ...a.block, key: addKeys[i]! };
      return { ...a, block: found.row ? (fill(block, found.row) as PageBlock) : block };
    }),
  );
  /* THE HEAD'S SEARCH. The word under its `search: { param }` is taken out of the choices, so it is never read
     as a field, and narrows every list the page draws to the rows that say it (`page-search.ts`). A page whose head
     declares no search reads the same key as any other word the address holds: as nothing. */
  const laidBlocks = laid.map((l) => l.block);
  const param = searchParamOf(found.decl);
  const typed = param !== null && filter !== undefined && Object.hasOwn(filter, param) ? filter[param] : undefined;
  const choices = typed === undefined || filter === undefined ? filter : Object.fromEntries(Object.entries(filter).filter(([k]) => k !== param));
  const filters = readerFilters(deps, found.decl, laidBlocks, choices);
  const word = typeof typed === 'string' ? searchWord(typed) : null;
  const searched = word === null ? new Map<string, Predicate[]>() : searchClauses(searchShapes(deps), laidBlocks, word);
  const clauses = joinClauses(filters?.clauses, searched);
  const log = filters?.log ?? null;
  /* A SECTION WHOSE `when:` SAYS NO HIDES WHAT IT HOLDS, the blocks after it in its column up to the next section. It
     hid only its own heading, so a fresh record drew the folded "Not this week" line with nothing under it, and the
     blocks under a hidden heading stood on the page with no heading over them. They are not read: a block nobody
     will see costs no query. Each column keeps its own: a section in the rail neither ends nor starts a fold in the
     main column. */
  const hiding = new Set<string>();
  const blocks = laid.map(({ block: b, added }) => {
    const area = b !== null && typeof b === 'object' && b.area === 'rail' ? 'rail' : 'main';
    if (b !== null && typeof b === 'object' && b.kind === 'section') hiding.delete(area);
    else if (hiding.has(area) && b !== null && typeof b === 'object') {
      const folded: BlockResult = { ...unacted(shorn(b)), rows: [], matched: 0, refusals: [], drawn: false, why: 'when' };
      return added === undefined ? folded : { ...folded, added };
    }
    /* THE PAGE'S ROW IS THE ENTRY ITS TEXT SITS ON, so `{{money:price}}` and `{{blockers.count}}` read the row. */
    const at = found.row ? { ...deps, here: found.row } : deps;
    /* AND WHAT THE READER PICKED, so a line can say the months a strip narrows the blocks to (`when: { picked }`). */
    const on = filters && filters.picked.size > 0 ? { ...at, picked: filters.picked } : at;
    /* A PAGE'S LINE OVER A LIST THE READER NARROWED IS SAID OF WHAT IS SHOWN (31 October, AG15): Work narrowed to Kiln
       said "1 late, 3 waiting on you." over a Waiting on you of one. */
    const lined = b !== null && typeof b === 'object' && b.kind === 'note' && b.lead === true ? figuresNarrowed(on, clauses) : on;
    const read = rowNamed(deps, found.row, readBlock(clauses.size > 0 || log ? narrowed(lined, b, clauses, log) : lined, b));
    if (b !== null && typeof b === 'object' && b.kind === 'section' && read.drawn === false) hiding.add(area);
    const astray = found.decl.for || panelFault(b.panel, null) ? null : panelFault(b.panel, false);
    const drawn = astray ? { ...read, rows: [], matched: 0, refusals: [...read.refusals, astray] } : read;
    return added === undefined ? drawn : { ...drawn, added };
  });
  /* HELD BEFORE THE LOOK IS COMPOSED, so the look is the one this reader's page answers and not the record's (`heldFor`). */
  const shown = deps.reader ? heldFor(blocks, deps.reader.hold) : null;
  /* A BOARD IS LAID OUT BY ITS OWN ORDER AND SIZES (`board.ts`), never reordered by a look: what he arranged on Today is
     where it stays, and nothing moves under him (Call 19). */
  const looked = (found.decl as { board?: unknown }).board === true ? null : lookedAt(deps, found.decl.page, shown?.blocks ?? blocks, shown, found.decl.layout !== undefined);
  /* AND THE COUNT BESIDE THE NAME: "Work 15" stood over the seven tasks of the one project picked. */
  const head = pageHead(figuresNarrowed(deps, clauses), found.decl, every, read_at, zone);
  /* AND THE HEAD SAYS HOW MANY THE WORD FOUND, across the page's lists, as this reader is shown them: "3 found". */
  const kept = head && word !== null ? { word, found: foundAcross(shown?.blocks ?? blocks, searched) } : null;
  return ok({
    ...found.decl,
    page: found.slug,
    read_at,
    zone,
    ...(found.row && found.row.seq !== null
      ? { param: { register: found.row.register, seq: found.row.seq, title: String((title && Object.hasOwn(found.row.fields, title) ? found.row.fields[title] : null) ?? '') } }
      : {}),
    /* A HOST PANEL IS ABOUT THE PAGE'S ROW, so on a page about no row it draws nothing and says why. It is said here
       because the page is in hand here; the word itself was checked with the block (`kinds/words.ts` `panelFault`). */
    /* AND WHAT OTHER PACKS ADD TO IT, laid among its own blocks as it is read and never written into its declaration
       (`page-adds.ts`). A page made from a template fills each addition from its row, as `resolvePages` filled its own. */
    /* AND WHAT IS DRAWN IS SAID HERE, for every reader: a block that holds nothing, one over what no row has said, a
       section over nothing, each `drawn: false` with its `why` (`markDrawn`), so an agent reading the page, a shared
       page and an export leave out what the screen does. After the look, so a box the look emptied is shut. */
    blocks: headlineHeld(drawnUnder(looked?.blocks ?? shown?.blocks ?? blocks, looked?.look.pinned)),
    ...(filters ? { filters: filters.answer } : {}),
    ...(looked ? { look: looked.look } : {}),
    ...(head ? { head: kept ? { ...head, searched: kept } : head } : {}),
  });
}

/** The address word a page's head searches under (`header.search.param`), or `null` when its head declares none. */
function searchParamOf(decl: PageDecl): string | null {
  const declared = (decl as { header?: unknown }).header;
  if (declared === undefined) return null;
  const h = headerBody(declared, { figures: null, fields: null });
  return h.ok ? (h.value.search?.param ?? null) : null;
}

/** What the head's search asks of each list: its fields as declared, with which are searched, and its title. */
function searchShapes(deps: PageDeps): (register: string) => SearchShape | null {
  const lists = deps.lists?.() ?? null;
  return (register) => {
    const declared = lists?.find((l) => l.id === register);
    const schema = declared ? null : deps.schemaOf(register);
    if (!declared && !schema) return null;
    const fields = declared ? declared.fields : Object.entries(schema!.fields).map(([id, f]) => ({ id, type: f.type }));
    return { fields, title: deps.titleOf(register) };
  };
}

/** The reader's choices and the search's clauses together, by the list each narrows. */
function joinClauses(a: ReadonlyMap<string, readonly Predicate[]> | undefined, b: ReadonlyMap<string, readonly Predicate[]>): Map<string, Predicate[]> {
  const out = new Map<string, Predicate[]>();
  for (const from of [a, b]) for (const [register, more] of from ?? []) if (more.length > 0) out.set(register, [...(out.get(register) ?? []), ...more]);
  return out;
}

/**
 * The rows the search kept across the page's lists: each list once, by the most any block over it matched, so two blocks
 * over one list count its rows once. A block that was refused or held counts nothing.
 */
function foundAcross(blocks: readonly BlockResult[], searched: ReadonlyMap<string, readonly Predicate[]>): number {
  const most = new Map<string, number>();
  for (const b of blocks) {
    const register = listRead(b);
    if (register === null || !searched.has(register) || b.refusals.length > 0) continue;
    most.set(register, Math.max(most.get(register) ?? 0, typeof b.matched === 'number' ? b.matched : 0));
  }
  return [...most.values()].reduce((n, m) => n + m, 0);
}

/**
 * THE HEAD OVER A PAGE'S TITLE, its parts resolved for this read, or `null` when it declares none or none has
 * anything to say. A count and a state read their figure as a stat cell does; the action is cut to the reader's level as
 * a block's actions are, and left off when it does not reach.
 */
function pageHead(deps: PageDeps, decl: PageDecl, every: ReturnType<typeof resolvePages>, now: string, zone: string): ResolvedHead | null {
  const declared = (decl as { header?: unknown }).header;
  if (declared === undefined) return null;
  const h = headerBody(declared, { figures: null, fields: null });
  if (!h.ok) return null;
  const figure = (id: string): HeadFigure | null => {
    const metric = deps.metric(id);
    const read = metric ? deps.read(metric) : null;
    if (!read?.ok) return null;
    const { value, unit, met } = read.value;
    const said = value === null ? '' : ((unit ? figureSaid({ amount: value, currency: unit }) : figureSaid(value)) ?? String(value));
    return { value, said, tone: met === true ? 'good' : met === false ? 'bad' : null };
  };
  const head = resolveHead(h.value, {
    figure,
    now,
    zone,
    pageTitle: (id) => every.find((p) => p.slug === id && !p.row)?.decl.title ?? null,
    listName: (id) => deps.listName?.(id) ?? null,
  });
  if (head.action) {
    const [cut] = cutActions([head.action], deps.level ?? 'read', deps.runs);
    if (cut) head.action = cut;
    else delete head.action;
  }
  return Object.keys(head).length > 0 ? head : null;
}

/**
 * THE PAGE UNDER ITS LOOK, or `null` when the host reads no looks.
 *
 * The stored look wins as it is, unless it is the owner's: then the rules fill what he left unset, never over what he
 * pinned (`mergeLook`). With none stored, or one Slash wrote from blocks this reader is held from, the rules' look over
 * what she is shown is the page's. Read after the page's own blocks and its adds,
 * so the look can name either, and before what is drawn is marked and the headline is held, so a box the look emptied
 * is shut and a hidden lead note says no line.
 */
function lookedAt(
  deps: PageDeps,
  page: string,
  blocks: readonly BlockResult[],
  shown: { rekeyed: ReadonlyMap<string, string>; held: boolean } | null,
  layout = false,
): { blocks: BlockResult[]; look: LookBody } | null {
  if (!deps.look) return null;
  const stored = rekeyedLook(lookOf(deps.look(page)), shown?.rekeyed);
  /* A LOOK SLASH WROTE WAS WRITTEN FROM THE WHOLE PAGE, so it is laid only for a reader shown the whole page. Laid for a
     member held from a block, its order, its lead and its basis said whether that block held something late: the rules
     answer her instead, from what she is shown. An owner's look is his arrangement and not a reading, so it stands. */
  if (stored !== null && stored.by !== 'owner' && !shown?.held) return laidGroups(deps, applyLook(blocks, stored, { layout }));
  const composed = composeLook({
    page,
    blocks,
    today: localDays(readableZone(deps.ctx.tz ?? deps.tz))(deps.ctx.asOfMs ?? deps.ctx.nowMs),
    seen: deps.reader?.seen !== undefined ? deps.reader.seen : (deps.activity?.(0).seen ?? null),
    ...(deps.lists ? { lists: deps.lists() } : {}),
    titleOf: deps.titleOf,
    stateOf: (list) => deps.schemaOf(list)?.state ?? null,
    ...(stored?.by === 'owner' && stored.pinned ? { pinned: stored.pinned } : {}),
  });
  return laidGroups(deps, applyLook(blocks, stored?.by === 'owner' ? mergeLook(stored, composed) : composed, { layout }));
}

/**
 * THE GROUPS A LOOK LAID, SAID ON EVERY ROW as a block's own `group:` says them (`groupedRows`), so a look that groups
 * fourteen cards by their state draws them under each state's name and not only says it would.
 *
 * A look names a block's `group` after the block was read (`applyLook`), so its rows are grouped here, by the same read
 * of the list's field a block's own group takes. A block that grouped itself has said its rows already and is passed
 * by. A FIELD THE READ CANNOT GROUP BY IS TAKEN OFF AND NOT REFUSED: a look is laid over a page and never stops it
 * drawing, so the block is drawn as it was read. Grouped cards fold as a block's own grouped cards do.
 */
function laidGroups(deps: PageDeps, looked: { blocks: BlockResult[]; look: LookBody }): { blocks: BlockResult[]; look: LookBody } {
  const blocks = looked.blocks.map((b): BlockResult => {
    if (!GROUPED_BY_FIELD.has(b.kind) || typeof b.group !== 'string' || b.rows.length === 0 || b.rows.some((r) => r.group !== undefined)) return b;
    const register = typeof b.source === 'string' && b.source.startsWith('register.') ? b.source.slice('register.'.length) : null;
    const schema = register === null ? null : deps.schemaOf(register);
    const g = register === null || schema === null ? null : rowGrouping(b, register, schema);
    if (g === null || 'code' in g) {
      const { group: _group, ...ungrouped } = b;
      return ungrouped;
    }
    return { ...b, rows: groupedRows(deps, b.rows, g), ...(b.kind === 'cards' && b.fold === undefined ? { fold: CARD_FOLD } : {}) };
  });
  return { ...looked, blocks };
}

/**
 * The page's blocks as its reader is shown them (`PageDeps.reader`), each with a key no other block of the page has,
 * whether any was held from them, and the new key of each block the hold keyed again.
 *
 * A HELD BLOCK MAY BE KEYED AGAIN WITHOUT WHAT IT READS, so two held blocks alike can meet on one key, and one key for two
 * blocks would let a look pin whichever came first. A key the hold left alone is the block's; one it changed is parted
 * from every other in page order, `-2`, then `-3`, as `keyedBlocks` parts the page's own.
 */
function heldFor(
  blocks: readonly BlockResult[],
  hold: (block: BlockResult) => BlockResult,
): { blocks: BlockResult[]; rekeyed: Map<string, string>; held: boolean } {
  const held = blocks.map((b) => hold(b));
  const taken = new Set(held.flatMap((b, i) => (b.key !== undefined && b.key === blocks[i]!.key ? [b.key] : [])));
  const rekeyed = new Map<string, string>();
  const out = held.map((b, i) => {
    const was = blocks[i]!.key;
    if (b.key === undefined) return was === undefined ? b : { ...b, key: was };
    if (b.key === was) return b;
    let key = b.key;
    for (let n = 2; taken.has(key); n += 1) key = `${b.key}-${n}`;
    taken.add(key);
    if (was !== undefined) rekeyed.set(was, key);
    return key === b.key ? b : { ...b, key };
  });
  /* HELD IS A SENTENCE THE HOLD ADDED, not a longer list: the record's shell answers its one sentence in place of the
     block's own, so a block already refused and then held answered no more refusals than it had and read as shown. */
  return { blocks: out, rekeyed, held: held.some((b, i) => b.refusals.some((r) => !blocks[i]!.refusals.includes(r))) };
}

/** A stored look with each block it names under the key its reader's page gives that block (`heldFor`). */
function rekeyedLook(look: LookBody | null, rekeyed: ReadonlyMap<string, string> | undefined): LookBody | null {
  if (look === null || !rekeyed?.size) return look;
  const as = (k: string): string => rekeyed.get(k) ?? k;
  return {
    ...look,
    ...(look.lead !== undefined ? { lead: as(look.lead) } : {}),
    ...(look.order ? { order: look.order.map(as) } : {}),
    ...(look.hide ? { hide: look.hide.map(as) } : {}),
    ...(look.pinned ? { pinned: look.pinned.map(as) } : {}),
    ...(look.group ? { group: Object.fromEntries(Object.entries(look.group).map(([k, f]) => [as(k), f])) } : {}),
  };
}

/**
 * The page's blocks marked as every reader draws them (`markDrawn`), with what the owner pinned kept.
 *
 * A PINNED BLOCK IS NEVER HIDDEN (`compose.ts`): he put it there, so it keeps its nought as `empty: keep` keeps it, and the
 * heading over it stays with it. Kept by handing the rule the block as `keep` and giving it back its own `empty:` after,
 * so the rule is the one rule and the answer says what the declaration said.
 */
function drawnUnder(blocks: readonly BlockResult[], pinned: readonly string[] | undefined): BlockResult[] {
  const pins = new Set(pinned ?? []);
  const pinnedAt = (b: BlockResult): boolean => b.key !== undefined && pins.has(b.key);
  if (!blocks.some(pinnedAt)) return markDrawn(blocks);
  return markDrawn(blocks.map((b) => (pinnedAt(b) ? { ...b, empty: KEEP } : b))).map((b, i) => {
    const was = blocks[i]!;
    if (!pinnedAt(was)) return b;
    const { empty: _keep, ...rest } = b;
    return was.empty === undefined ? rest : { ...rest, empty: was.empty };
  });
}

/**
 * The page's blocks with a forecast's `headline:` taken off when no lead note on the page is drawn.
 *
 * THE OPENING LINE IS WHAT SAYS WHEN THE MONEY RUNS OUT, and a forecast that leaves its own sentence off for it has to
 * know the line is there. Money's line is drawn only while the record keeps one set of money (`books-held`), so a
 * record with two books read no line and a chart that no longer said when the walk goes under either.
 */
function headlineHeld(blocks: readonly BlockResult[]): BlockResult[] {
  const said = blocks.some((b) => b.kind === 'note' && b.lead === true && b.drawn !== false && b.refusals.length === 0);
  return blocks.map((b) => {
    if (said || b.headline === undefined) return b;
    const { headline: _unsaid, ...rest } = b;
    return rest as BlockResult;
  });
}

/* ── the reader's filters ────────────────────────────────────────────────── */

/** The most values one filter offers, most held first. Past this a strip of chips is a list nobody reads. */
const FILTER_VALUES = 50;

/* THE REGISTER A BLOCK READS ROWS OF is `listRead` in `page-search.ts`, which the head's search narrows by too. */

/** The row a chosen link points at, by its number (`12`), spoken id (`projects#12`) or row id, with its number and title. */
type Pointed = { id: string; seq: number; label: string };

function pointedAt(deps: PageDeps, to: string, value: string): Pointed | null {
  const spoken = /^(?:([a-z][a-z0-9_-]*)#)?([1-9][0-9]*)$/u.exec(value);
  if (spoken && spoken[1] !== undefined && spoken[1] !== to) return null;
  const where: Predicate = spoken ? { field: 'seq', is: Number(spoken[2]) } : { field: 'id', is: value };
  const got = deps.list({ register: to, where, limit: 1 });
  const row = got.ok ? got.value.rows[0] : undefined;
  if (!row || row.seq === null) return null;
  const title = deps.titleOf(to);
  const t = title && Object.hasOwn(row.fields, title) ? row.fields[title] : null;
  return { id: row.id, seq: row.seq, label: typeof t === 'string' && t.trim() !== '' ? t : `#${row.seq}` };
}

/**
 * The clause one chosen value makes on one list, or `null` when that list's field cannot hold it.
 *
 * `''` IS "NONE", the rows that hold nothing in the field, which is the "No project" chip. A link is chosen by the
 * number of the row it points at, as an address keeps it, and the clause holds that row's id, which is what the field
 * stores; a link to another list than the chosen row's is not narrowed by it.
 */
function clauseOf(field: string, spec: Schema['fields'][string], value: string, pointed: Pointed | null, to: string | undefined): Predicate | null {
  if (value === '') return { field, empty: true };
  switch (spec.type) {
    case 'ref':
      return pointed && spec.to === to ? { field, is: pointed.id } : null;
    case 'bool':
      return value === 'true' || value === 'false' ? { field, is: value === 'true' } : null;
    case 'enum':
      return (spec.values ?? []).includes(value) ? { field, is: value } : null;
    case 'text':
      return { field, is: value };
    default:
      return null;
  }
}

/** A field's spec on one list when it is one a filter may pick a value of, else `undefined`. */
const filterable = (schema: Schema | null, field: string): Schema['fields'][string] | undefined => {
  const spec = schema && Object.hasOwn(schema.fields, field) ? schema.fields[field] : undefined;
  return spec && FILTER_TYPES.has(spec.type) ? spec : undefined;
};

/** The predicate the rows still open on a list read: not in one of its `done` states. Every row, on a list with none. */
function openOn(deps: PageDeps, register: string, schema: Schema): Predicate[] {
  const done = deps.lists?.().find((l) => l.id === register)?.done ?? [];
  return schema.state !== undefined && done.length > 0 ? [{ field: schema.state, not_in: [...done] }] : [];
}

/**
 * Whether a predicate could hold of a row whose `field` is `value`, whatever its other fields hold (`certain` false), or
 * must (`certain` true). A test of another field, or a hop to another list, is a maybe.
 */
function could(where: Predicate, field: string, value: string, schema: Schema, certain: boolean): boolean {
  const group = where as { all?: Predicate[]; any?: Predicate[]; none?: Predicate[] };
  if (Array.isArray(group.all)) return group.all.every((k) => could(k, field, value, schema, certain));
  if (Array.isArray(group.any)) return group.any.some((k) => could(k, field, value, schema, certain));
  if (Array.isArray(group.none)) return !group.none.some((k) => could(k, field, value, schema, !certain));
  if (!('field' in where) || (where as Leaf).field !== field || (where as Leaf).via !== undefined) return !certain;
  return evaluate(where, { [field]: value }, schema);
}

/**
 * The rows a chip counts on one list: the open ones (`openOn`), because a chip saying 40 over a list of 3 things to do
 * counts what is finished; UNLESS A BLOCK OVER IT DRAWS FINISHED ROWS AMONG OPEN ONES, and then THE ROWS THE PAGE'S BLOCKS
 * WOULD SHOW, each block's own `where:` ORed with the others'.
 *
 * A LEDGER LINE IS `cleared` ONCE IT HAS MOVED, which is `done` on its list, and the Ledger draws every line that is not
 * void in one list. Counted as open only, "Not filed yet" read 0 beside nineteen unfiled lines and the account and
 * category chips were not offered at all. Work's "Done this week" is a block of finished tasks alone, beside the open
 * ones, and does not make Work's chips count finished work.
 */
function shownOn(deps: PageDeps, register: string, schema: Schema, blocks: readonly PageBlock[]): Predicate[] {
  const open = openOn(deps, register, schema);
  const state = schema.state;
  const done = deps.lists?.().find((l) => l.id === register)?.done ?? [];
  const values = state === undefined ? [] : (schema.fields[state]?.values ?? []);
  const said: (Predicate | undefined)[] = [];
  for (const b of blocks) {
    if (listRead(b) !== register) continue;
    const where = b.where as Predicate | string | undefined;
    /* A HOLE STILL IN IT, OR A SENTENCE THE LIST CANNOT READ, IS A BLOCK THAT DRAWS NOTHING (`readBlock`). */
    if (typeof where === 'string' && /\{\{\w+\}\}/.test(where)) continue;
    const got = predicateOf(where, schema, deps.ctx);
    if (got.bad.length === 0) said.push(got.predicate);
  }
  if (state === undefined || open.length === 0) return open;
  /* EVERY BLOCK OVER THE LIST DRAWS ONLY FINISHED ROWS, as Reports reads cleared Ledger lines alone: the open rows are
     none of what the page shows, and its month picker read "Last month 0" over a month of spending. The chips count the
     rows the blocks draw. A finished-only block beside a block of open rows (Work's "Done this week") is not this. */
  const finishedOnly = (p: Predicate | undefined): p is Predicate =>
    p !== undefined && names(p, state) && !values.some((v) => !done.includes(v) && could(p, state, v, schema, false));
  if (said.length > 0 && said.every(finishedOnly)) return said.length === 1 ? [said[0]!] : [{ any: said as Predicate[] }];
  const mixes = (p: Predicate | undefined): boolean =>
    p !== undefined &&
    values.some((v) => done.includes(v) && could(p, state, v, schema, false)) &&
    values.some((v) => !done.includes(v) && could(p, state, v, schema, false));
  if (!said.some(mixes)) return open;
  /* A BLOCK THAT SAYS NOTHING OF THE STATE IS STILL ITS OPEN ROWS. */
  const each = said.map((p): Predicate[] => {
    const own = p === undefined ? [] : [p];
    return p !== undefined && names(p, state) ? own : [...open, ...own];
  });
  if (each.some((p) => p.length === 0)) return [];
  if (each.length === 1) return each[0]!;
  return [{ any: each.map((p) => (p.length === 1 ? p[0]! : { all: p })) }];
}

/** Whether a predicate tests `field` on its own list: a leaf on it, at any depth. A hop to another list does not. */
function names(where: Predicate, field: string): boolean {
  const group = where as { all?: Predicate[]; any?: Predicate[]; none?: Predicate[] };
  const kids = group.all ?? group.any ?? group.none;
  if (Array.isArray(kids)) return kids.some((k) => names(k, field));
  return 'field' in where && (where as Leaf).field === field && (where as Leaf).via === undefined;
}

/** How many rows the predicate admits by their value in `field`, from `tally` when the host has it, else every row. */
function tallied(deps: PageDeps, register: string, field: string, where: Predicate | undefined): Map<string, number> {
  const out = new Map<string, number>();
  const add = (v: Json | undefined, n: number): void => {
    const key = v === null || v === undefined || v === '' ? '' : v === true || v === 1 ? 'true' : v === false || v === 0 ? 'false' : typeof v === 'string' ? v : String(v);
    out.set(key, (out.get(key) ?? 0) + n);
  };
  if (deps.tally) {
    const got = deps.tally({ register, field, where });
    if (got.ok) for (const t of got.value) add(t.value, t.n);
    return out;
  }
  const every = everyRow(deps, register, where);
  if (every.ok) for (const r of every.value.rows) add(r.fields[field], 1);
  return out;
}

/**
 * A page's `filters:` answered: for each field it filters on, the values its open rows hold and how many hold each, and
 * the clauses the reader's choices make on each list a block reads. `null` on a page that declares none.
 *
 * EACH COUNT IS UNDER THE OTHER CHOICES and not its own, as a strip of chips is read: with Kiln chosen, the counts of
 * whose work it is are Kiln's, and the counts of the projects are still every project's. Only open rows are counted,
 * because a chip saying 40 over a list of 3 things to do counts what is finished, unless a block draws a list's
 * finished rows among its open ones, and then the rows the blocks would show are (`shownOn`).
 */
function readerFilters(
  deps: PageDeps,
  decl: PageDecl,
  blocks: readonly PageBlock[],
  filter: Readonly<Record<string, string>> | undefined,
): { answer: PageFilter[]; clauses: Map<string, Predicate[]>; log: ((e: ActivityEvent) => boolean) | null; picked: Map<string, string> } | null {
  const said = Array.isArray(decl.filters) ? (decl.filters as unknown[]) : [];
  const all = said.flatMap((f): { field: string; control: PageFilter['control']; options?: Choice[]; counts?: string }[] => {
    const one = f !== null && typeof f === 'object' && !Array.isArray(f) ? (f as { field?: unknown; control?: unknown; options?: unknown; counts?: unknown }) : {};
    const control = one.control === 'chips' || one.control === 'segmented' ? one.control : null;
    if (typeof one.field !== 'string' || control === null) return [];
    /* `counts:`, A SENTENCE THE COUNTED ROWS MUST ALSO HOLD (Q6 of 29 October): Work's project chips counted every task
       not finished, the backlog with them, and read 67 over an Open of 57. Said, the chips count what Open counts. */
    if (one.options === undefined) return [{ field: one.field, control, ...(typeof one.counts === 'string' && one.counts.trim() !== '' ? { counts: one.counts } : {}) }];
    const options = optionsOf(one.options);
    return options.length > 0 ? [{ field: one.field, control, options, ...(typeof one.counts === 'string' && one.counts.trim() !== '' ? { counts: one.counts } : {}) }] : [];
  });
  if (all.length === 0) return null;
  /* A FILTER OF ITS OWN CHOICES IS NO FIELD'S (`options:`), and is answered beside the fields' filters below. */
  const declared = all.filter((d) => d.options === undefined);

  /* A PAGE THAT DRAWS THE LOG IS FILTERED BY ITS OWN THREE QUESTIONS: who wrote a line, what kind of change it
     was and which list it was on, answered from the log and never from a list's field of the same word. */
  const logged = blocks.some((b) => b !== null && typeof b === 'object' && b.source === 'activity')
    ? logFilters(deps, declared.filter((d) => (LOG_FILTERS as readonly string[]).includes(d.field)), filter)
    : null;

  /* THE LISTS THE PAGE'S BLOCKS READ, in the page's order: a filter narrows what is drawn, so a list no block draws is
     not counted, and neither is one the reader may not read (`EvalContext.reads`), as `deadlines` leaves it out. The
     first that holds a field is the one its values are named from. */
  const readable = (r: string): boolean => deps.ctx.reads === undefined || deps.ctx.reads(r);
  const lists = [...new Set(blocks.map(listRead).filter((r): r is string => r !== null && readable(r)))];
  const schemas = new Map(lists.map((r) => [r, deps.schemaOf(r)] as const));
  /* WHAT EACH LIST'S BLOCKS SHOW, which is what a chip over it counts (`shownOn`). */
  const showing = new Map(lists.map((r) => {
    const s = schemas.get(r);
    return [r, s ? shownOn(deps, r, s, blocks) : []] as const;
  }));

  /* A CHOICE STANDS WHEN THE FIELD'S FIRST LIST CAN HOLD IT, and is then made on every list that has the field. A link
     is answered by the number of the row it points at, however it was chosen, so the chip it lights is the one drawn. */
  const chosen = new Map<string, { value: string; pointed: Pointed | null; to: string | undefined }>();
  for (const { field } of declared) {
    if (logged?.answers.has(field)) continue;
    const said = filter && Object.hasOwn(filter, field) ? filter[field] : undefined;
    if (typeof said !== 'string') continue;
    const value = said.trim();
    const home = lists.find((r) => filterable(schemas.get(r) ?? null, field));
    const spec = home === undefined ? undefined : filterable(schemas.get(home) ?? null, field);
    if (!spec) continue;
    const pointed = spec.type === 'ref' && value !== '' && spec.to !== undefined && readable(spec.to) ? pointedAt(deps, spec.to, value) : null;
    if (!clauseOf(field, spec, value, pointed, spec.to)) continue;
    chosen.set(field, { value: pointed ? String(pointed.seq) : value, pointed, to: spec.to });
  }
  /* EACH CHOICE OF ITS OWN IS ITS SENTENCE, read against each list: a list whose fields the sentence does not name is left
     as it is, as a list without a field is under a field's filter. */
  const own = all.filter((d): d is { field: string; control: PageFilter['control']; options: Choice[]; counts?: string } => d.options !== undefined);
  const sentenceOn = (register: string, where: string): Predicate | null => {
    const schema = schemas.get(register) ?? deps.schemaOf(register);
    if (!schema) return null;
    const got = predicateOf(where, schema, deps.ctx);
    return got.bad.length === 0 && got.predicate !== undefined ? got.predicate : null;
  };
  const picks = new Map<string, Choice>();
  for (const { field, options } of own) {
    const said = filter && Object.hasOwn(filter, field) ? filter[field]?.trim() : undefined;
    const pick = said === undefined ? undefined : options.find((c) => c.value === said);
    if (pick) picks.set(field, pick);
  }
  const clausesOn = (register: string, except?: string): Predicate[] => {
    const schema = schemas.get(register) ?? deps.schemaOf(register);
    const fields = [...chosen].flatMap(([field, c]) => {
      if (field === except) return [];
      const spec = filterable(schema ?? null, field);
      const clause = spec ? clauseOf(field, spec, c.value, c.pointed, c.to) : null;
      return clause ? [clause] : [];
    });
    const sentences = [...picks].flatMap(([field, c]) => {
      if (field === except) return [];
      const clause = sentenceOn(register, c.where);
      return clause ? [clause] : [];
    });
    return [...fields, ...sentences];
  };
  const clauses = new Map(lists.map((r) => [r, clausesOn(r)] as const));

  const answer = declared.map(({ field, control, counts: countsSaid }): PageFilter => {
    const fromLog = logged?.answers.get(field);
    if (fromLog) return { ...fromLog, control };
    const holding = lists.filter((r) => filterable(schemas.get(r) ?? null, field));
    const home = holding[0];
    const spec = home === undefined ? undefined : filterable(schemas.get(home) ?? null, field)!;
    const label = wordsOf(spec?.label ?? field);
    const picked = chosen.get(field);
    const pick = picked?.value ?? null;
    if (!spec || home === undefined) return { field, label, control, chosen: null, values: [], reads: [] };

    /* EVERY LIST THAT HOLDS THE FIELD AS THE FIRST DOES, counted together: a link to projects on tasks and on notes is
       one strip of projects. A list whose field is another type is a different question and is left out of the count. */
    const counts = new Map<string, number>();
    const reads: string[] = [];
    for (const r of holding) {
      const s = schemas.get(r)!;
      const other = s.fields[field]!;
      if (other.type !== spec.type || other.to !== spec.to) continue;
      reads.push(r);
      const own = countsSaid === undefined ? null : predicateOf(countsSaid, s, deps.ctx);
      const parts = [...(showing.get(r) ?? []), ...clausesOn(r, field), ...(own && own.bad.length === 0 && own.predicate !== undefined ? [own.predicate] : [])];
      const where: Predicate | undefined = parts.length === 0 ? undefined : parts.length === 1 ? parts[0] : { all: parts };
      for (const [v, n] of tallied(deps, r, field, where)) counts.set(v, (counts.get(v) ?? 0) + n);
    }

    /* A LINK IS COUNTED BY THE ROW IT POINTS AT AND OFFERED BY THAT ROW'S NUMBER AND TITLE, which is what an address
       keeps and a person reads. A row no longer there, or on a list the reader may not read, is not offered. */
    const named = new Map<string, { value: string; label: string; hue?: number }>();
    if (spec.type === 'ref' && spec.to !== undefined && readable(spec.to)) {
      reads.push(spec.to);
      const ids = [...counts.keys()].filter((k) => k !== '');
      const title = deps.titleOf(spec.to);
      const pointed = ids.length ? deps.list({ register: spec.to, where: { field: 'id', in: ids }, limit: 500 }) : null;
      for (const r of pointed?.ok ? pointed.value.rows : []) {
        if (r.seq === null) continue;
        const t = title && Object.hasOwn(r.fields, title) ? r.fields[title] : null;
        /* AND ITS HUE, WHEN IT HOLDS ONE, so a project's chip wears the project's colour as the sidebar does. */
        const hue = r.fields['hue'];
        const dot = typeof hue === 'number' && Number.isInteger(hue) && hue >= 0 && hue < 360 ? { hue } : {};
        named.set(r.id, { value: String(r.seq), label: typeof t === 'string' && t.trim() !== '' ? t : `#${r.seq}`, ...dot });
      }
    }
    const valueOf = (key: string): { value: string; label: string; hue?: number } | null => {
      if (key === '') return { value: '', label: `No ${label.toLowerCase()}` };
      if (spec.type === 'ref') return named.get(key) ?? null;
      if (spec.type === 'bool') return { value: key, label: key === 'true' ? 'Yes' : 'No' };
      if (spec.type === 'enum') return { value: key, label: spec.labels?.[key] ?? wordsOf(key) };
      return { value: key, label: key };
    };
    const values = [...counts]
      .flatMap(([key, count]) => {
        const v = valueOf(key);
        return v ? [{ ...v, count }] : [];
      })
      .filter((v) => v.count > 0);
    /* AN ENUM IN ITS DECLARED ORDER AND A YES BEFORE A NO, because those orders mean something; anything else most
       held first. "None" is always last. */
    const rank = (v: { value: string }): number =>
      v.value === '' ? Number.MAX_SAFE_INTEGER : spec.type === 'enum' ? (spec.values ?? []).indexOf(v.value) : spec.type === 'bool' ? (v.value === 'true' ? 0 : 1) : 0;
    values.sort((a, b) => rank(a) - rank(b) || b.count - a.count || a.label.localeCompare(b.label));
    const shown = values.slice(0, FILTER_VALUES);
    /* THE ONE CHOSEN IS OFFERED WHATEVER IT HOLDS, so the reader can see what they picked and take it off. */
    if (pick !== null && !shown.some((v) => v.value === pick)) {
      const kept = values.find((v) => v.value === pick);
      shown.push(kept ?? { value: pick, label: picked?.pointed?.label ?? valueOf(pick)?.label ?? pick, count: 0 });
    }
    return { field, label, control, chosen: pick, values: shown, reads };
  });
  /* A FILTER OF ITS OWN CHOICES, in the page's order among the rest: each choice with how many open rows its sentence
     keeps on the lists it reads, under the other choices, as a field's values are counted. A choice is offered at
     nought too, since the strip is the page's own words and not what the rows happen to hold. */
  const answers = all.map((d): PageFilter => {
    if (d.options === undefined) return answer.find((a) => a.field === d.field)!;
    const reads: string[] = [];
    const counts = d.options.map(() => 0);
    for (const r of lists) {
      const s = schemas.get(r);
      if (!s) continue;
      const sentences = d.options.map((c) => sentenceOn(r, c.where));
      if (sentences.every((p) => p === null)) continue;
      reads.push(r);
      /* AND THE SENTENCE ITS COUNTS ARE HELD TO (`counts:`), as a field's chips are: what is counted, not what is picked. */
      const held = d.counts === undefined ? null : predicateOf(d.counts, s, deps.ctx);
      const base = [...(showing.get(r) ?? []), ...clausesOn(r, d.field), ...(held && held.bad.length === 0 && held.predicate !== undefined ? [held.predicate] : [])];
      sentences.forEach((p, i) => {
        if (p === null) return;
        const parts = [...base, p];
        const where: Predicate = parts.length === 1 ? parts[0]! : { all: parts };
        for (const [, n] of tallied(deps, r, s.state ?? 'id', where)) counts[i] = counts[i]! + n;
      });
    }
    const values = d.options.map((c, i) => ({ value: c.value, label: c.label, count: counts[i]! }));
    return { field: d.field, label: wordsOf(d.field), control: d.control, chosen: picks.get(d.field)?.value ?? null, values, reads };
  });
  const picked = new Map<string, string>([...[...chosen].map(([field, c]) => [field, c.value] as const), ...[...picks].map(([field, c]) => [field, c.value] as const)]);
  return { answer: answers, clauses, log: logged?.keep ?? null, picked };
}

/** A filter's own choice: the word an address keeps, the name a person reads, and the sentence of the rows it keeps. */
type Choice = { value: string; label: string; where: string };

/** A filter's `options:` as the declaration checked them (`filterOptionsFault`), each one that is whole. */
function optionsOf(raw: unknown): Choice[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((c): Choice[] => {
    const one = c !== null && typeof c === 'object' && !Array.isArray(c) ? (c as { value?: unknown; label?: unknown; where?: unknown }) : {};
    return typeof one.value === 'string' && typeof one.label === 'string' && typeof one.where === 'string' ? [{ value: one.value, label: one.label, where: one.where }] : [];
  });
}

/* ── the sources the record reads ──────────────────────────────── */

/** The kinds that draw a host source's rows: a table, cards, and the pack primitives that draw rows. */
const HOST_ROW_KINDS: ReadonlySet<string> = new Set(['table', 'cards', 'list', 'rows', 'grid']);

/**
 * A block over a source the record hands in (`PageDeps.hostSources`), read as a list's rows are: its `columns` and `order`
 * name the source's fields, its `where:` is read against them, and `limit` is passed through, fifty when it says none.
 * A field the source does not hold is refused here, at read, with the fields it does. The cursor the source answers is
 * the block's `cursor`, for the page after this one.
 */
function hostBlock(deps: PageDeps, block: PageBlock, host: HostSource, base: BlockResult, also: (...more: Refusal[]) => Refusal[]): BlockResult {
  const name = block.source ?? '';
  if (!HOST_ROW_KINDS.has(block.kind))
    return { ...base, refusals: also({ code: 'DECLARATION_INVALID', fix: `${name} is drawn as a table or as cards. Draw it as one of those.`, at: 'kind' }) };
  const fields = host.schema.fields;
  const allowed = Object.keys(fields);
  for (const [at, named] of [
    ['columns', (block.columns ?? []).map((c) => c?.field)],
    ['order', (block.order ?? []).map((o) => o?.field)],
  ] as const) {
    const missing = named.filter((f) => typeof f !== 'string' || !Object.hasOwn(fields, f));
    if (missing.length) return { ...base, refusals: also({ code: 'FIELD_UNKNOWN', fix: `${name} has no field called ${missing.join(', ')}.`, at, allowed }) };
  }
  const said = predicateOf(block.where, host.schema, deps.ctx);
  if (said.bad.length) return { ...base, refusals: also(...said.bad) };
  const limit = block.limit === undefined ? 50 : Math.max(0, Math.floor(block.limit));
  if (limit === 0) return { ...base, matched: 0 };
  const got = host.rows({ ...(said.predicate === undefined ? {} : { where: said.predicate }), ...(block.order?.length ? { order: block.order } : {}), limit });
  if (!got.ok) return { ...base, refusals: refused(got) ? also(got.refusal) : also() };
  const rows = got.value.rows.slice(0, limit);
  const cursor = typeof got.value.next === 'string' && got.value.next !== '' ? { cursor: got.value.next } : {};
  return { ...base, rows, matched: got.value.matched ?? rows.length, ...cursor };
}

/* ── the log's own filters ─────────────────────────────────────── */

/** The three questions a page over the log may filter it by: who wrote a line, what kind of change, which list. */
export const LOG_FILTERS = ['who', 'kind', 'list'] as const;
/** How far back the log's choices are counted, in days: what an Activity page says of the last month. */
const LOG_DAYS = 30;
/** The most lines the log's choices are counted from, and a narrowed feed reads back through. */
const LOG_READ = 5000;
/** What each of the three is called above its choices. */
const LOG_LABELS: Readonly<Record<(typeof LOG_FILTERS)[number], string>> = { who: 'Who', kind: 'What changed', list: 'List' };

/** A name as an address holds it: lower case, a hyphen between words, so a person is chosen by a word, never an id. */
const addressWord = (name: string): string =>
  name
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/gu, '');

/**
 * Who wrote a line, as a reader chooses it: an agent by the name of its kind ("Claude"), however many runs it was; Slash
 * by name; the rules together, and BrainDog's own work as BrainDog, as "Who worked" beside it counts them (`ownWork`);
 * a person by the name the record holds for them, else every person together as People. NEVER AN ID: a run's handle and
 * a person's id are only ever what is looked up.
 */
function whoOf(deps: PageDeps, actor: string): { value: string; label: string } {
  if (actor === 'slash') return { value: 'slash', label: 'Slash' };
  if (ownWork(actor)) return { value: 'braindog', label: 'BrainDog' };
  const by = byOf(actor);
  if (by === 'rule') return { value: 'rules', label: 'Rules' };
  if (by === 'agent') {
    const run = RUN_HANDLE.test(actor) ? (deps.runOf?.(actor) ?? null) : null;
    const agent = actor.startsWith('agent:') ? actor.slice('agent:'.length) : run ? saidText(run.fields.agent) : null;
    const client = run ? saidText(run.fields.client) : null;
    if (agent === null && client === null) return { value: 'agents', label: 'Agents' };
    const named = agentOf({ ...(agent === null ? {} : { agent }), ...(client === null ? {} : { client }) });
    const value = addressWord(named.agent ?? '') || 'agents';
    return { value, label: named.name };
  }
  const name = deps.actorName?.(actor) ?? null;
  const value = name === null ? '' : addressWord(name);
  return value === '' ? { value: 'someone', label: 'People' } : { value, label: name! };
}

/**
 * A page's filters over the log answered: for each of who, kind and list it declares, the choices the last 30 days hold
 * and how many lines each, every count under the other choices as a list's are; and which lines the choices keep.
 *
 * A KIND IS SAID IN THE WORDS ACTIVITY SAYS IT IN, the ones the figure "What changed" names each by (`KIND_SAID`), and a
 * kind with no word there is said in plain words. A LIST IS NAMED BY ITS NAME, and one the reader may not read
 * is neither offered nor counted.
 */
function logFilters(
  deps: PageDeps,
  fields: readonly { field: string }[],
  filter: Readonly<Record<string, string>> | undefined,
): { answers: Map<string, PageFilter>; keep: ((e: ActivityEvent) => boolean) | null } {
  const answers = new Map<string, PageFilter>();
  if (fields.length === 0) return { answers, keep: null };
  const readable = (r: string): boolean => deps.ctx.reads === undefined || deps.ctx.reads(r);
  const who = new Map<string, { value: string; label: string }>();
  const valueOf = (field: string, e: ActivityEvent): { value: string; label: string } | null => {
    if (field === 'who') {
      if (!who.has(e.actor)) who.set(e.actor, whoOf(deps, e.actor));
      return who.get(e.actor)!;
    }
    if (field === 'kind') return { value: e.kind, label: Object.hasOwn(KIND_SAID, e.kind) ? KIND_SAID[e.kind]! : wordsOf(e.kind) };
    const list = listOf(e.target);
    return list !== null && readable(list) ? { value: list, label: deps.listName?.(list) ?? wordsOf(list) } : null;
  };
  const chosen = new Map<string, string>();
  for (const { field } of fields) {
    const said = filter && Object.hasOwn(filter, field) ? filter[field]?.trim() : undefined;
    if (said !== undefined && said !== '') chosen.set(field, said);
  }
  const holds = (e: ActivityEvent, except?: string): boolean => [...chosen].every(([field, value]) => field === except || valueOf(field, e)?.value === value);
  const since = deps.ctx.nowMs - LOG_DAYS * 86_400_000;
  const lines = deps.activity ? deps.activity(LOG_READ).events.filter((e) => Date.parse(e.ts) >= since) : [];
  for (const { field } of fields) {
    const counts = new Map<string, { value: string; label: string; count: number }>();
    for (const e of lines) {
      if (!holds(e, field)) continue;
      const v = valueOf(field, e);
      if (v === null) continue;
      const had = counts.get(v.value);
      counts.set(v.value, { ...v, count: (had?.count ?? 0) + 1 });
    }
    const values = [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    const shown = values.slice(0, FILTER_VALUES);
    const pick = chosen.get(field) ?? null;
    /* THE ONE CHOSEN IS OFFERED WHATEVER IT HOLDS, so the reader can see what they picked and take it off. */
    if (pick !== null && !shown.some((v) => v.value === pick)) shown.push(values.find((v) => v.value === pick) ?? { value: pick, label: wordsOf(pick), count: 0 });
    const label = LOG_LABELS[field as (typeof LOG_FILTERS)[number]];
    answers.set(field, { field, label, control: 'chips', chosen: pick, values: shown, reads: [WHOLE_RECORD] });
  }
  return { answers, keep: chosen.size > 0 ? (e) => holds(e) : null };
}

/**
 * A sentence ANDed with the reader's choices, NO DEEPER THAN IT WAS where that can be done: onto an `all` the choices
 * join it, and over an `any` of plain parts each part takes them, (A or B) and C being (A and C) or (B and C). Wrapped
 * whole, Work's "Not this week" (an `any` of `all`s) narrowed to Kiln nested three groups deep and was refused.
 */
function andFlat(where: Predicate | undefined, extra: readonly Predicate[]): Predicate {
  if (where === undefined) return extra.length === 1 ? extra[0]! : { all: [...extra] };
  const w = where as { all?: Predicate[]; any?: Predicate[] };
  if (Array.isArray(w.all)) return { all: [...w.all, ...extra] };
  if (Array.isArray(w.any) && w.any.every((m) => { const g = m as { all?: unknown; any?: unknown; none?: unknown }; return g.any === undefined && g.none === undefined; }))
    return { any: w.any.map((m) => ({ all: [...(Array.isArray((m as { all?: Predicate[] }).all) ? (m as { all: Predicate[] }).all : [m]), ...extra] })) };
  return { all: [where, ...extra] };
}

/**
 * The figures a page's line and its head's count read, with the reader's choices ANDed onto every figure over a list
 * they narrow (`register.<list>`). Every other figure, and a figure whose own sentence cannot be read here, is read as
 * declared. A narrowed figure is another figure to the read's cache, which keys a figure by its declaration whole.
 */
function figuresNarrowed(deps: PageDeps, clauses: ReadonlyMap<string, readonly Predicate[]>): PageDeps {
  if (clauses.size === 0) return deps;
  const read = deps.read;
  return {
    ...deps,
    read: (decl) => {
      const list = /^register\.([a-z][a-z0-9_]*)$/u.exec(typeof decl.source === 'string' ? decl.source : '')?.[1];
      const extra = list === undefined ? undefined : clauses.get(list);
      if (list === undefined || extra === undefined || extra.length === 0) return read(decl);
      let own: Predicate | undefined;
      if (typeof decl.where === 'string') {
        const schema = deps.schemaOf(list);
        if (!schema) return read(decl);
        const got = predicateOf(decl.where, schema, deps.ctx);
        if (got.bad.length > 0) return read(decl);
        own = got.predicate;
      } else own = decl.where;
      return read({ ...decl, where: andFlat(own, extra) });
    },
  };
}

/**
 * The reads one block makes, with the reader's choices ANDed onto every read of the list it draws.
 *
 * ONLY THE BLOCK'S OWN LIST, and only a read of its rows. The names of the projects its rows point at, the steps
 * under a card, a `{{path}}` naming one row by its number: those are other reads, and a filter on what is drawn says
 * nothing about them. So a read that names its rows by number or id is left as it is.
 */
function narrowed(deps: PageDeps, block: PageBlock, clauses: ReadonlyMap<string, readonly Predicate[]>, log: ((e: ActivityEvent) => boolean) | null = null): PageDeps {
  /* A FEED OVER THE LOG IS NARROWED BY THE LINES IT IS HANDED: the reader's choice of who, what kind and which list. It
     reads further back to find them, so a feed narrowed to one agent still draws that agent's lines and not a few. */
  const activity = deps.activity;
  if (log && activity && block !== null && typeof block === 'object' && block.source === 'activity')
    return {
      ...deps,
      activity: (limit) => {
        const read = activity(Math.max(limit, LOG_READ));
        return { ...read, events: read.events.filter(log).slice(0, limit) };
      },
    };
  const register = listRead(block);
  const extra = register === null ? [] : (clauses.get(register) ?? []);
  if (register === null || extra.length === 0) return deps;
  const named = (where: Predicate | undefined): boolean => {
    const leaf = where as Leaf | undefined;
    return leaf !== undefined && (leaf.field === 'seq' || leaf.field === 'id');
  };
  const and = (where: Predicate | undefined): Predicate => andFlat(where, extra);
  const readings = deps.readings;
  return {
    ...deps,
    list: (q) => deps.list(q.register === register && !named(q.where) ? { ...q, where: and(q.where) } : q),
    ...(readings ? { readings: (q: Parameters<typeof readings>[0]) => readings(q.register === register ? { ...q, where: and(q.where) } : q) } : {}),
  };
}

/**
 * Whether a block's `when:` is satisfied, given the figure it names.
 *
 * A FIGURE THAT CANNOT BE READ DOES NOT DRAW THE BLOCK. The alternative, drawing it anyway, is how a
 * red note about an overdue invoice appears on a record with no invoices at all. A `when:` naming a
 * metric nobody declared is the same answer for the same reason: the condition is unknown, and
 * drawing on an unknown is guessing.
 *
 * A CONDITION WITH NO TEST IN IT IS NOT A CONDITION. `{ metric: 'overdue' }` with no comparison does
 * not draw, because the author meant something and the block waits until they say what.
 */
function drawnWhen(deps: PageDeps, block: PageBlock): boolean {
  return !block.when || whenHolds(deps, block.when);
}

/**
 * Whether a `when:` holds: a leaf of its figure, `all:` of every part, `any:` of one.
 *
 * TWO TESTS ARE ONE CONDITION: `all:` holds only while every part holds, and a leaf that cannot be read fails it as it
 * fails alone. `any:` holds while one part does, so a figure that cannot be read is one part that does not, and the
 * others still say. A WHEN WHOSE SHAPE THE INSTALL WOULD REFUSE NEVER HOLDS, whatever its parts read (`whenTreeFault`):
 * a join of fewer than two parts, one that says both words, a join inside the same join, a part that names no figure,
 * and anything deeper than `WHEN_DEPTH`. So an `any` never draws on less than it says either, on a page installed
 * before it could be refused.
 */
export function whenHolds(deps: PageDeps, when: unknown): boolean {
  return whenTreeFault(when, 'when') === null && treeHolds(deps, when);
}

/** Whether a `when:` of a shape already checked holds: a leaf of its figure, `all:` of every part, `any:` of one. */
function treeHolds(deps: PageDeps, when: unknown): boolean {
  const join = whenJoin(when);
  if (join === null) return isReaderLeaf(when) ? readerHolds(deps, when) : isPickedLeaf(when) ? pickedHolds(deps, when) : leafHolds(deps, when as WhenLeaf);
  const parts = (when as Record<string, unknown[]>)[join]!;
  return join === 'all' ? parts.every((part) => treeHolds(deps, part)) : parts.some((part) => treeHolds(deps, part));
}

/**
 * The sentence of a note's `says:` that is said: the first whose `when:` holds, read top to bottom, or the last, which
 * has none. The shape is checked first (`noteSaysFault`), so there is a last and it always says.
 */
function saidLine(deps: PageDeps, says: readonly SaysLine[]): { at: number; line: SaysLine } {
  const at = says.findIndex((line, i) => i === says.length - 1 || (line.when !== undefined && whenHolds(deps, line.when)));
  return { at, line: says[at]! };
}

/**
 * Whether a leaf about who reads holds: only while the host said who reads and it is one of the words. NO READER SAID IS
 * NOBODY THE LEAF NAMES, so a block held for the owner is not sent to a host that has not said who is reading.
 */
function readerHolds(deps: PageDeps, when: WhenReaderLeaf): boolean {
  if (deps.readerIs === undefined) return false;
  const words: readonly unknown[] = Array.isArray(when.reader) ? when.reader : [when.reader];
  return words.includes(deps.readerIs);
}

/** Whether a leaf about what was picked holds: the filter's choice is one it names, `''` for none picked. */
function pickedHolds(deps: PageDeps, when: WhenPickedLeaf): boolean {
  const now = deps.picked?.get(when.picked) ?? '';
  const words: readonly string[] = Array.isArray(when.is) ? when.is : [when.is as string];
  return words.includes(now);
}

/** Whether one leaf of a `when:` holds of the figure it names. */
function leafHolds(deps: PageDeps, when: WhenLeaf): boolean {
  const decl = deps.metric(when.metric.split(':')[0] ?? '');
  if (!decl) return false;
  const at = when.metric.indexOf(':');
  const read = deps.read(at < 0 ? decl : (fill(decl, null, when.metric.slice(at + 1)) as MetricDecl));
  if (!read.ok) return false;
  /* A FIGURE IN SEVERAL CURRENCIES MEETS THE CONDITION WHEN ONE OF ITS AMOUNTS DOES: money late in pounds is late
     whatever is late in dollars, and "Late to you" is not hidden because two currencies cannot be added. */
  const parts = read.value.parts;
  const said = parts ? parts.map((p) => p.amount) : read.value.value === null ? [] : [read.value.value];
  /* BEYOND IS THE ONE TEST A WALK THAT NEVER WENT UNDER MEETS: its reading has no value, so no comparison holds of it,
     and on a record that holds money it is not empty in any sense a person means. True while the reading carries how
     far it looked, false while it does not. */
  if (when.beyond !== undefined) return when.beyond === (beyondOf(read.value) !== null);
  /* EMPTY IS THE ONE TEST A FIGURE WITH NO VALUE MEETS: true while no amount is held in any currency. A sum of
     money over no rows reads 0 with no currency, which is no amount at all; 0 EGP typed as a balance is one, and a count
     of nought is a count. A figure that cannot be read, or that nobody declared, still draws nothing, above. */
  if (when.empty !== undefined) return when.empty === (said.length === 0 || (!parts && decl.format === 'money' && !read.value.unit && read.value.value === 0));
  return said.some((v) => {
    if (when.gt !== undefined) return v > when.gt;
    if (when.gte !== undefined) return v >= when.gte;
    if (when.lt !== undefined) return v < when.lt;
    if (when.lte !== undefined) return v <= when.lte;
    if (when.is !== undefined) return v === when.is;
    if (when.not !== undefined) return v !== when.not;
    return false;
  });
}

/**
 * What a kind module is handed on `deps.kit` (`KindKit`), made for the one block it reads.
 *
 * TODAY IS THE DAY THE BLOCK'S OWN SENTENCE CALLS TODAY: the as-of instant when the read has one, in the zone the
 * sentence is read in (`metrics.ts` `clockOf`), so a calendar's months and a `where:` naming `today` never disagree.
 */
const kitOf = (deps: PageDeps): KindKit => ({
  predicateOf,
  today: () => localDays(deps.ctx.tz ?? deps.tz ?? 'UTC')(deps.ctx.asOfMs ?? deps.ctx.nowMs),
});

/**
 * One block.
 *
 * IT NEVER THROWS. Everything a block can get wrong (a source nobody has, a predicate the register cannot answer, a
 * metric that is not declared) comes back as a refusal ON THE BLOCK, so the page around it still draws.
 *
 * AND THIS IS WHERE THAT IS TRUE RATHER THAN HOPED. A declaration arrives as JSON from a pack or from
 * an agent's `draw`, and the reads below were written against the type: `cells: 'not an array'` reached a `.map` and
 * the throw took the page, or the agent's whole call, with it. Every shape the reads know to be wrong is refused in its
 * own sentence below; what none of them foresaw is caught here and answered as a refusal ON THE BLOCK, with the
 * technical reason under `detail` where a screen folds it away, so the page around it still draws.
 */
export function readBlock(deps: PageDeps, block: PageBlock): BlockResult {
  /* AND EVERY ANSWER CARRIES ITS KEY, the one it declares or its default (`block-keys.ts`), so a block read on its own
     is named as the page would name it. */
  const key = blockKeyOf(block);
  /* WHICH RULE READ A PATH IS THIS READ'S OWN (`read_as`): a block handed in again with the one an earlier read wrote on
     it, as the record reads a reader's own rows over, is read without it, so it is never refused as a key nobody
     declares and never carried past a read that filled nothing. */
  if (block !== null && typeof block === 'object' && Object.hasOwn(block, 'read_as')) {
    const { read_as: _earlier, ...rest } = block as PageBlock & { read_as?: unknown };
    block = rest as PageBlock;
  }
  /* AND SO IS THE SENTENCE A NOTE'S `says:` WAS ANSWERED WITH (`saidLine`): a note handed in again with the body the read
     wrote beside its `says_at` is read without both, so it chooses again rather than being refused for a body. */
  if (block !== null && typeof block === 'object' && Object.hasOwn(block, 'says_at') && Object.hasOwn(block, 'says')) {
    const { says_at: _said, body: _words, ...rest } = block as PageBlock & { says_at?: unknown; body?: unknown };
    block = rest as PageBlock;
  }
  /* A WIDGET READS WHAT ITS FRAME SHOWS AND ONE MORE (`kinds/sizes.ts`), so a small list on a board never reads fifty
     rows to draw one, and its "N more" is still known. Only a kind that draws its rows as it reads them is cut. */
  if (block !== null && typeof block === 'object') {
    const most = sizeRead(String(block.kind), (block as { size?: unknown }).size);
    if (most !== null) block = { ...block, limit: Math.min(typeof block.limit === 'number' ? block.limit : 50, most) };
  }
  try {
    /* A BLOCK READ BACK WITH THE FIGURES IT WAS ANSWERED IS ANSWERED THEM AGAIN, never the old ones carried over. */
    const { figures: _was, ...read } = leanRows(deps, readBlockAsWritten(deps, renamed(block)));
    /* AND WHAT EACH FIGURE IT NAMES IS, so a host says them from the record's declarations (`figuresOf`). */
    const figures = read.refusals.length === 0 ? figuresOf(deps, block, read) : undefined;
    return { ...read, ...(figures === undefined ? {} : { figures }), key };
  } catch (e) {
    return {
      ...(block !== null && typeof block === 'object' ? unacted(shorn(block)) : block),
      key,
      rows: [],
      matched: 0,
      refusals: [
        {
          code: 'DECLARATION_INVALID',
          fix: 'This block could not be read as it is written, so it draws nothing. Check each of its keys against what its kind reads.',
          detail: e instanceof Error ? e.message : String(e),
        },
      ],
    };
  }
}

/**
 * A block with a key it was written under at an earlier build said by its name now: a `heat`'s `people: true` is `who:`
 * since People 2.6.0. A record still holding 2.5.0 has the old word on its page, and that page reads as it did until
 * the record takes the update, rather than drawing a refusal where its chart was.
 */
function renamed(block: PageBlock): PageBlock {
  if (block === null || typeof block !== 'object' || block.kind !== 'heat' || !Object.hasOwn(block, 'people')) return block;
  const { people, ...rest } = block as PageBlock & { people?: unknown };
  return rest.who === undefined ? { ...rest, who: people as boolean } : rest;
}

/** Whether a block's `cells:` is something other than what the type says: a list of figures, each naming its metric. */
const cellsFault = (cells: unknown): boolean =>
  cells !== undefined &&
  !(Array.isArray(cells) && cells.every((c) => c !== null && typeof c === 'object' && typeof (c as { metric?: unknown }).metric === 'string'));

/**
 * A block without the `cells:` it was refused for.
 *
 * THE ANSWER CARRIES NO KEY ITS OWN TYPE SAYS CANNOT BE THERE. A refused block is still handed back with what it was
 * written with, and a host reading `cells` off it reads the list `BlockResult` promises: `cells: 'two'` echoed back
 * was the refused block throwing again one step later, in the host that draws the refusal.
 */
function shorn<T extends { cells?: unknown }>(block: T): T {
  if (!cellsFault(block.cells)) return block;
  const { cells: _refused, ...kept } = block;
  return kept as T;
}

/* ── lean rows ───────────────────────────────────────────────────────────── */

/* The characters of one text a page's row carries before it is cut: `constants.ts`'s, where a screen reads it. */
export { ROW_TEXT_MOST };

/** A row as a page answers it: the row, saying `clipped` where a text in it was cut (`leanRows`). */
export type PageRow = Entry & {
  clipped?: true;
  /**
   * On a grouped `cards` or `table` block (`group:`, its own or its look's): by a link, the row it points at, by its
   * handle (`projects#7`), and that row's title; by a choice or the state, the value it holds (`in_progress`) and the
   * choice's label for it, else the value in plain words ("In progress"). `value` is `''` and `name` says "No project"
   * for a row that points at or holds nothing. ON THE ROW AND NOT BESIDE
   * THE ROWS, so a block held from a reader, whose rows are taken off, keeps no name of the list she may not read.
   */
  group?: { value: string; name: string };
};

/** The keys a block answers one to a row, which go with the rows a section does not send. */
const ALIGNED = ['scopes', 'scope_marks', 'rings', 'nexts', 'trends', 'whens', 'done_now', 'next', 'short_now', 'changes', 'working_now', 'quiet', 'files', 'helpers'] as const;

/** The mark a cut text ends in, so a reader sees there is more. One code point, counted in the cut. */
export const CUT_MARK = '…';

/** A text cut at `ROW_TEXT_MOST` code points, its last one `CUT_MARK`, or `null` when it is no longer than that. */
function cutText(text: string): string | null {
  /* A STRING NO LONGER THAN THE CUT IN UTF-16 UNITS IS NO LONGER IN CODE POINTS, so most texts are not walked at all. */
  if (text.length <= ROW_TEXT_MOST) return null;
  let points = 0;
  let at = 0;
  let kept = 0;
  for (const ch of text) {
    if (points === ROW_TEXT_MOST - 1) kept = at;
    if (points === ROW_TEXT_MOST) return `${text.slice(0, kept).trimEnd()}${CUT_MARK}`;
    points += 1;
    at += ch.length;
  }
  return null;
}

/** A value with every text in it cut: a text, or a list of texts. Anything else as it is. */
function cutValue(value: Json): Json {
  if (typeof value === 'string') return cutText(value) ?? value;
  if (Array.isArray(value) && value.some((v) => typeof v === 'string' && v.length > ROW_TEXT_MOST))
    return value.map((v) => (typeof v === 'string' ? (cutText(v) ?? v) : v));
  return value;
}

/**
 * A block's answer as a page sends it: each row's long texts cut, and a section's rows not sent at all.
 *
 * THE PROJECTS PAGE ANSWERED 760 KB, AND 723 KB OF IT WAS NOTES NOTHING DREW. "In play", "Parked and finished" and "Not
 * in play" each shipped every project's whole `note` document, up to 71 KB a row, under columns that never read it, and
 * the page reads itself again on every write to the record (Projects). So a text or a
 * document past `ROW_TEXT_MOST` characters is cut there, as `list` cuts it for an agent, and the row says `clipped`; a
 * row's own page and `get` still answer it whole, and a block that draws a whole document reads it as a `{{path}}`
 * value (`valuesOf`), which this leaves alone.
 *
 * EVERY OTHER FIELD STAYS, WHICH IS A DECISION AND NOT AN OVERSIGHT. The light fields are what a host does with a row it
 * did not draw: the docked panel opens a row on every field its list declares and saves only what changed against
 * them, a tick's Undo puts back the state and the finished day the row held, and a row's tone is read from its state
 * and its deadline (`apps/web/src/lib/page/row-host.svelte.ts`, `page-writes.ts`, `record/api.ts` `toneOf`). Cut to its
 * columns, a project opened in the panel showed empty boxes over values it holds, and its Undo cleared a day it never
 * showed. They are a few hundred bytes a row; the weight was the long texts.
 *
 * A SECTION IS DRAWN AS ITS COUNT (`matched`), so it sends no row and nothing aligned to one: "Parked and finished"
 * read sixteen projects whole for one number. A list the record does not declare (`deadlines`, `actions`, `runs_on`)
 * has every long string cut, since there is no type to tell its texts by.
 *
 * AN `inputs` BLOCK GOES WHOLE. It is a form over the one row it reads, and a box opened on the first 280 characters of
 * a longer text saves those 280 over the rest when anything in it is typed.
 */
function leanRows(deps: PageDeps, read: BlockResult): BlockResult {
  if (read.kind === 'inputs') return read;
  if (read.kind === 'section') {
    if (read.rows.length === 0 && !ALIGNED.some((key) => key in read)) return read;
    const out: Record<string, unknown> = { ...read, rows: [] };
    for (const key of ALIGNED) delete out[key];
    return out as BlockResult;
  }
  if (read.rows.length === 0) return read;
  const texts = new Map<string, ReadonlySet<string> | null>();
  const textsOf = (register: string): ReadonlySet<string> | null => {
    if (!texts.has(register)) {
      const schema = deps.schemaOf(register);
      texts.set(
        register,
        schema === null
          ? null
          : new Set(Object.entries(schema.fields).flatMap(([id, f]) => (f.type === 'text' || f.type === 'document' || (f.type === 'list' && f.of === 'text') ? [id] : []))),
      );
    }
    return texts.get(register)!;
  };
  let cut = false;
  const rows = read.rows.map((row): PageRow => {
    const said = textsOf(row.register);
    let fields: Entry['fields'] | null = null;
    for (const [id, value] of Object.entries(row.fields)) {
      if (said !== null && !said.has(id)) continue;
      const kept = cutValue(value as Json);
      if (kept === value) continue;
      fields ??= { ...row.fields };
      fields[id] = kept as Entry['fields'][string];
    }
    if (fields === null) return row;
    cut = true;
    return { ...row, fields, clipped: true };
  });
  return cut ? { ...read, rows } : read;
}

/**
 * The fields of the list a block reads, which its actions' args may name, or `null` where it reads no list this read
 * knows the shape of: then an action is checked for its shape alone.
 */
function fieldsOfBlock(deps: PageDeps, block: PageBlock): ReadonlySet<string> | null {
  const register = typeof block.source === 'string' && block.source.startsWith('register.') ? block.source.slice('register.'.length) : block.register;
  const schema = typeof register === 'string' && register ? deps.schemaOf(register) : null;
  return schema ? new Set(Object.keys(schema.fields)) : null;
}

/** A block without what may be pressed on it, for an answer that never reached the cut (`readBlockAsWritten`). */
function unacted<T extends object>(block: T): T {
  if (!Object.hasOwn(block, 'actions') && !Object.hasOwn(block, 'row_actions')) return block;
  const { actions: _block, row_actions: _rows, ...kept } = block as T & { actions?: unknown; row_actions?: unknown };
  return kept as T;
}

function readBlockAsWritten(deps: PageDeps, block: PageBlock): BlockResult {
  /* A KEY THIS BUILD DOES NOT READ IS SAID, and it is said whatever else the block turns out to be:
     a `cells` block with a misspelt key and a `table` block with one are the same mistake, and the
     stat arm below returns before any other check runs.

     A LIST AND NOT A TYPE CHECK, because a declaration arrives as JSON from a pack somebody else wrote and TypeScript
     is not there at the moment it is read. The list lives in `block-keys.ts`, with which kinds read each key that only
     some do, because the install check refuses from the same list (`declare.ts` `pageBody`) and two copies were two
     answers. It is read here, when a block is read, and never copied into a constant of this file when it loads: a
     kind module may import this file, and `block-keys.ts` is built from the kind registry, so a copy taken at load
     could be taken before the list exists (`kinds/index.ts`). */
  const unread = Object.keys(block)
    .filter((key) => !BLOCK_READS.has(key))
    .map((key): Refusal => ({ code: 'DECLARATION_INVALID', fix: `${key}: is not a key a block reads.`, at: key }));
  /* AND A KEY ANOTHER KIND READS IS SAID HERE AS THE INSTALL SAYS IT (`block-keys.ts`). A page installed before the install
     check closed carries `lead: true` on its cards or `since: seen` on a table, and each read clean and was drawn
     without. A key written as `undefined` is no key: a caller spreading a block to clear one should not be told of it.
     `of` has its own sentence below. OWN KEYS ONLY: looked up by bracket, `toString` on a block found
     `Object.prototype.toString` and the read threw where it had refused; the name is refused above as unread. */
  /* `kindsReading` AND NOT THE TABLE, because it answers for the registered kinds too: a key a registered kind reads is
     one only that kind may carry. */
  for (const [key, value] of Object.entries(block)) {
    const kinds = kindsReading(key);
    if (value === undefined || key === 'of' || !kinds || kinds.includes(block.kind)) continue;
    unread.push({ code: 'DECLARATION_INVALID', fix: wrongKindKey(key, block.kind), at: key });
  }
  /* A PACK'S OWN KIND (`block.<id>`) IS INSTALLED LIKE ANY OTHER (`declare.ts` `pageBody`), so it is read like any
     other: it falls through the arms below exactly as an unregistered built-in kind would, and a `source:` naming a
     register draws through the same grid primitive a `table` does. The early refusal this file once answered left an
     installed block drawing a hole on the page; nothing here still says a deploy is owed. */
  /* `of:` IS READ BY ONE KIND OVER ONE KIND OF SOURCE, and anywhere else it would be a sentence the block drew
     without, which is the misspelt key above by another route. */
  /* AND A HEAT OVER A LIST READS ONE TOO: each day's whole, which its wash is then a share of (`wholeOf`). */
  /* ONLY WHERE A WHOLE READ IS HANDED (`handsWhole`): without one nothing reads a heat's `of:`, and it is unread again. */
  const takesOf = block.kind === 'ring' || (block.kind === 'heat' && handsWhole());
  if (block.of !== undefined && !(takesOf && typeof block.source === 'string' && block.source.startsWith('register.')))
    unread.push({
      code: 'DECLARATION_INVALID',
      /* A RING AN AUTHOR WROTE OUT WAS TOLD "a ring has none", which reads as if no ring could take the key. */
      fix: `of: names the whole a ring or a heat over a list is set against, ${takesOf ? `and this ${block.kind} is not over a list` : `and a ${block.kind} has none`}.`,
      at: 'of',
    });

  const base: BlockResult = { ...block, rows: [], matched: 0, refusals: unread };
  /* WHAT MAY BE PRESSED IS NEVER SENT AS IT WAS DECLARED: it is cut to this reader below, once the block is
     drawn, and a block not drawn, or refused, carries none. */
  delete base.actions;
  delete base.row_actions;

  /**
   * AND `unread` HAS TO SURVIVE THE RETURN THAT SPREADS `base`, WHICH IT DID NOT.
   *
   * The comment above says the misspelt key is said whatever else the block turns out to be, and it
   * was true of exactly one path: the eight returns below each write their own `refusals:` over the
   * spread, so a block that both misspelt a key AND named a source nobody publishes reported only
   * the source. The author fixed the source, redeployed, and met the second sentence they could have
   * had the first time. Every refusal this function knows about goes back in one list.
   */
  const also = (...more: readonly Refusal[]): Refusal[] => [...unread, ...more];

  /* `cells:` IS A LIST OF FIGURES, EACH NAMING ITS METRIC, as the install says (`declare.ts` `pageBody`). A page installed
     before that check, or a block an agent hands `draw`, can carry anything, and the stat arm, the page's `{{path}}`
     values and the access walk all read it as the list the type promises. Said here, before any of them reads it. */
  if (cellsFault(block.cells))
    return {
      ...shorn(base),
      refusals: also({ code: 'DECLARATION_INVALID', fix: 'cells: is a list of figures, each naming its metric, such as cells: [{ metric: overdue }].', at: 'cells' }),
    };

  /* AND A BLOCK WHOSE CONDITION IS NOT MET DRAWS NOTHING, before any query runs. `drawn` is on the
     result rather than implied by an empty one, because "the condition was false" and "the query
     matched nothing" are different facts and a renderer that cannot tell them apart draws the empty
     state of a block that was never meant to be on the page. */
  if (!drawnWhen(deps, block)) return { ...base, drawn: false, why: 'when' };

  /* A BLOCK'S ACTIONS ARE CHECKED AS THE INSTALL CHECKS THEM, against the fields of its list (`block-keys.ts`
     `actionsFault`), and a good list is cut to what this reader may press: with no level said, that is reading, and
     nothing is sent. A press the record would refuse is never drawn. */
  const pressed = block as PageBlock & { actions?: unknown; row_actions?: unknown };
  if (pressed.actions !== undefined || pressed.row_actions !== undefined) {
    const acted = declaredActions(block as unknown as Readonly<Record<string, unknown>>, 'This block', fieldsOfBlock(deps, block));
    if (!acted.ok) return { ...base, refusals: also({ code: 'DECLARATION_INVALID', fix: acted.fault.fix, at: acted.fault.at, ...(acted.fault.allowed ? { allowed: acted.fault.allowed } : {}) }) };
    for (const key of ['actions', 'row_actions'] as const) {
      const cut = acted.value[key] ? cutActions(acted.value[key], deps.level ?? 'read', deps.runs) : [];
      if (cut.length > 0) base[key] = cut;
    }
  }

  /* A NOTE THAT SAYS SEVERAL SENTENCES SAYS ONE, the first whose `when:` holds, read here and not by each host,
     so every reader of the page is said the same sentence: "3 questions wait for you" while they wait, and the calm line
     only when nothing does. Its words become the body before the holes are filled, so they are filled as any body's
     are, and its tone, when it has one, is the block's. A model's line put on a lead as `said` still wins over it, as it
     wins over any body, because the record puts it on after this read. */
  if (block.kind === 'note' && block.says !== undefined) {
    const fault = noteSaysFault(block as unknown as Readonly<Record<string, unknown>>, 'This note');
    if (fault) return { ...base, refusals: also({ code: 'DECLARATION_INVALID', fix: fault.fix, at: fault.at, ...(fault.allowed ? { allowed: fault.allowed } : {}) }) };
    const { at, line } = saidLine(deps, block.says);
    const tone = line.tone ?? (block as { tone?: BlockResult['tone'] }).tone;
    /* WITHOUT THE OTHER SENTENCES, so only the holes of the one said are read. */
    const { says: _sentences, ...one } = block;
    block = { ...one, body: line.body, ...(tone ? { tone } : {}) } as PageBlock;
    base.body = line.body;
    base.says_at = at;
    if (tone) base.tone = tone;
  }

  /* THE PAGE'S LIVE FIGURES ARE THE RECORD'S TO SAY, so the host does not answer them from a copy of
     its own. Only for a block that draws: a figure in a block that is not on the page is not read. */
  const { values, values_fx, read_as, values_as_of, unnamed } = valuesOf(deps, block);
  if (values) base.values = values;
  if (values_fx) base.values_fx = values_fx;
  if (read_as) base.read_as = read_as;
  if (values_as_of) base.values_as_of = values_as_of;
  if (unnamed) base.unnamed = unnamed;

  /* THE PAGE WORDS THE INSTALL CHECKS ARE CHECKED AGAIN HERE, for a page installed under an earlier build, in the
     install's own sentences (`kinds/words.ts`): a section's host panel, a path's short view and a roadmap's columns.
     Whether the page is about a row is the page's to say, so a panel's word is checked here and its page in
     `readPage`. */
  const worded = panelFault(block.panel, null) ?? shortFault(block.short) ?? (block.kind === 'roadmap' ? roadmapFault(block) : null);
  if (worded) return { ...base, refusals: also(worded) };
  /* CARDS AND TABLES ARE GROUPED BY A FIELD OF THEIR LIST, so over anything but a list they draw no groups, and say so
     rather than drawing ungrouped under a `group:` the author wrote. The field itself is checked where the list is in hand. */
  /* BUT A TABLE OVER WHAT FALLS DUE GROUPS BY THE STRETCH EACH DAY IS IN, its one word (`DEADLINES_GROUP`), which its own
     read puts on each row (`sources/deadlines.ts`). */
  const dueGrouped = block.kind === 'table' && block.source === 'deadlines' && block.group === DEADLINES_GROUP;
  if (GROUPED_BY_FIELD.has(block.kind) && block.group !== undefined && !dueGrouped && !(typeof block.source === 'string' && block.source.startsWith('register.'))) {
    const what = block.kind === 'cards' ? 'cards' : 'rows';
    return {
      ...base,
      refusals: also({ code: 'DECLARATION_INVALID', fix: `group: draws ${what} in groups by a field of their list, and these ${what} are over no list. Give them source: register.<id>, or take group: off.`, at: 'group' }),
    };
  }

  /* A SOURCE THAT SAYS `first` IS ANSWERED BEFORE ANY KIND READS THE BLOCK (`sources/index.ts` `Source.first`): the figures
     pinned to Home, which a `stat` names no cells for, and what falls due, which is one answer whatever draws it. Each
     says why in its own file. BUT A REGISTERED KIND WHOSE `across` NAMES THE SOURCE READS IT ITSELF (`kinds/index.ts`):
     a calendar over `deadlines` reads its own months, where the source would hand it a table's days and no window. */
  const early = sourceModule(block.source);
  if (early?.first && !kindModule(block.kind)?.across?.includes(block.source ?? '')) return walkSells(deps, block, early.read(deps, block, base, also, sourceKit(deps)));

  /* A REGISTERED KIND READS ITSELF, AND IT IS ASKED BEFORE ANY ARM BELOW (`kinds/index.ts`). What every block shares is
     already done by here: the keys nobody reads, `when:` and the page's `{{path}}` values. So a kind module is only the
     part that is its own, and a kind that is not registered falls through to the arms below exactly as it did before
     the registry existed. Its `validate` runs again at read, for a page installed under an earlier build of it. */
  const registered = kindModule(block.kind);
  if (registered) {
    const fault = registered.validate?.(block, { stage: 'read' }) ?? null;
    /* WITH THE KIT, which a module cannot import (`KindKit`): the sentence reader every block is read with, and today. */
    return fault ? { ...base, refusals: also(fault) } : registered.read({ ...deps, kit: kitOf(deps) }, block, base);
  }

  /* A STAT OVER A REGISTER AND NO FIGURES reads that register's rows, as a table does, and the host draws one tile a
     measure from them: the numbers a project reported are rows, and a figure per measure would be a declaration per
     measure nobody can write ahead of the project sending it. */
  if (block.cells || (block.kind === 'stat' && !block.source?.startsWith('register.'))) {
    return {
      ...base,
      readings: (block.cells ?? []).map(({ trend: window, ahead: walkOf, ...cell }) => {
        const decl = deps.metric(cell.metric.split(':')[0] ?? '');

        if (!decl)
          return {
            ...cell,
            reading: null,
            refusal: {
              code: 'METRIC_UNKNOWN',
              fix: `There is no metric called ${cell.metric}. A figure BrainDog computes rather than declares is not one either.`,
              at: 'metric',
            },
          };
        /* The declaration with its parameter filled: `project-owed:Kiln` is one document read about
           one project, which is what makes a project page a declaration rather than a case. */
        /* THE FIRST COLON SEPARATES, and everything after it is the parameter — a project called
           `C:\Repos` is a project, and splitting on every colon read it as `C`. */
        const at = cell.metric.indexOf(':');
        const param = at < 0 ? undefined : cell.metric.slice(at + 1);
        const read = deps.read(param === undefined ? decl : (fill(decl, null, param) as MetricDecl));
        const moved = window === undefined ? {} : walkOf !== undefined ? aheadOf(deps, walkOf, window) : trendOf(deps, cell.metric, window);
        /* THE FIGURE'S DECLARED FORMAT RIDES WITH IT, so a pack's percent or day is said as one by a host that holds no
           copy of the declaration (`tileOf`). */
        const target = { ...(decl.target === undefined ? {} : { target: decl.target }), ...(typeof decl.format === 'string' ? { format: decl.format } : {}) };
        if ('refusal' in moved) return { ...cell, ...target, reading: read.ok ? read.value : null, refusal: moved.refusal };
        if (read.ok) return { ...cell, ...target, reading: read.value, ...moved };
        return refused(read) ? { ...cell, ...target, reading: null, refusal: read.refusal } : { ...cell, ...target, reading: null };
      }),
    };
  }

  /* A SERIES READS ITS FIGURES, grouped by one bucket, and lines them up on one run of buckets. */
  if (block.kind === 'series') {
    /* A LINE NAMES ITS FIGURE AS A CELL DOES, `project-in-by-month:Kiln`: the first colon separates, and the declaration
       is read with its parameter filled, so one figure draws one project's months on each project's page. */
    const lineOf = (id: string): MetricDecl | null => {
      const at = id.indexOf(':');
      const decl = deps.metric(at < 0 ? id : id.slice(0, at));
      return decl === null || at < 0 ? decl : (fill(decl, null, id.slice(at + 1)) as MetricDecl);
    };
    const got = barsOf(block.series, block.back, block.ahead, lineOf, deps.read);
    return 'refusal' in got ? { ...base, refusals: also(got.refusal) } : { ...base, bars: got.bars, matched: got.bars.keys.length };
  }

  /* A CAPTURE READS NO ROWS, and it is answered before the source checks because it has no source. */
  if (block.kind === 'capture') return captureBlock(deps, block, base, also);
  /* INPUTS READ ONE ROW BY `register:` AND NOT BY `source:`, for the reason a capture does: they name the list they write. */
  if (block.kind === 'inputs') return inputsBlock(deps, block, base, also);

  /* A BLOCK WITH NO SOURCE IS A WRITTEN BLOCK, and the record has nothing to add to it. `05` §1 makes
     `table` the page-only kind that takes `source:` and `columns:`; every other kind draws the rows
     of its own fenced text, so a `note` or a `code` block is held, travels and versions like any
     other declaration and is simply handed back. Refusing it would be the record insisting that a
     paragraph is a query. */
  if (!block.source) return base;
  /* A SOURCE THAT IS NOT A LIST ANSWERS ITSELF, by the module registered under its name (`sources/index.ts`): a reading
     over several lists, the record's events, its runs or its questions, rather than a query against one list. What every
     block shares is already done by here, and a registered kind was asked first, above. */
  const computed = sourceModule(block.source);
  /* A GROUP OF WALKS IS OFFERED WHAT IT MAY SELL BY WALK (`walkSells`), which a source that answers one walk leaves be. */
  if (computed) return walkSells(deps, block, computed.read(deps, block, base, also, sourceKit(deps)));
  /* A SOURCE THE RECORD READS AND THE KERNEL CANNOT, such as every list with its count, is asked only after the
     registered ones, so it never shadows one, and never for a list. Its rows come back on the one rows path. */
  const hosted = block.source.startsWith('register.') || block.source.startsWith('metric.') ? undefined : deps.hostSources?.(block.source);
  if (hosted) return hostBlock(deps, block, hosted, base, also);
  /* A BAR OR A SPLIT OVER A GROUPED FIGURE draws the figure's parts, so a part may be a monthly share of a yearly
     cost, which a sum over the rows cannot be. The host adds what no part holds as its `unset:` row. */
  if (block.source.startsWith('metric.')) return metricBlock(deps, block, block.source.slice('metric.'.length), base, also);
  const register = block.source.startsWith('register.') ? block.source.slice('register.'.length) : null;
  const schema = register ? deps.schemaOf(register) : null;
  if (!register || !schema)
    return { ...base, refusals: also({ code: 'SOURCE_UNKNOWN', fix: `${block.source} is not a source here.`, at: 'source' }) };

  /* A DIFF READS ONE ROW'S HISTORY, not the rows a predicate matches. */
  if (block.kind === 'diff') return diffBlock(deps, block, register, schema, base, also);

  /* OUT OF DATE IS A DAY AND A WINDOW, checked here because the host draws it from both. */
  let staleDays: { field: string; days: StaleDays } | null = null;
  if (block.stale !== undefined) {
    const s = block.stale as { field?: unknown; after?: unknown; figure?: unknown } | null;
    const type = s && typeof s.field === 'string' && Object.hasOwn(schema.fields, s.field) ? schema.fields[s.field]?.type : undefined;
    if (!s || (type !== 'day' && type !== 'instant') || typeof s.after !== 'string' || windowMs(s.after) === null)
      return {
        ...base,
        refusals: also({ code: 'DECLARATION_INVALID', fix: `stale: names a day field on ${register} and a window, such as { field: as_of, after: 7d }.`, at: 'stale' }),
      };
    /* AND THE DAY MAY BE A FIGURE'S, each card's group's, read once for the block. */
    if (s.figure !== undefined) {
      const days = staleDaysOf(deps, register, s.figure);
      if ('code' in days) return { ...base, refusals: also(days) };
      staleDays = { field: s.field as string, days };
    }
  }

  /* A CARD'S OR A TABLE ROW'S GROUP IS A LINK, A CHOICE OR THE STATE OF THIS LIST, checked here where the list is in hand. */
  const grouping = GROUPED_BY_FIELD.has(block.kind) ? rowGrouping(block, register, schema) : null;
  if (grouping && 'code' in grouping) return { ...base, refusals: also(grouping) };

  /* A HOLE STILL IN THE `where` IS A FIELD THE PAGE'S ROW HOLDS NOTHING IN, since only a template page is filled and
     `fill` leaves a hole it has no value for. A skill with no `because` yet has no learnings behind it, which is the
     block's `empty:` sentence and not a refusal naming a row called `{{because}}`. */
  if (typeof block.where === 'string' && /\{\{\w+\}\}/.test(block.where)) return { ...base, refusals: also() };

  const said = predicateOf(block.where, schema, deps.ctx);
  if (said.bad.length) return { ...base, refusals: also(...said.bad) };

  /* THE NUMBERS A PROJECT REPORTED ARE WORKED OUT HERE, NOT IN THE BROWSER. A `stat` or `lines` over a register names
     which field is when, which the value, and optionally the measure's name and unit, and the record hands back one
     series a measure over the period and the one before, bucketed by the record's local day or week (`measures.ts`).
     A year of hourly polls is a few hundred numbers on the wire rather than every reading. */
  if ((block.kind === 'stat' || block.kind === 'lines') && deps.readings && (block.columns?.length ?? 0) >= 2) {
    /* THE FIFTH COLUMN IS THE READING AS MONEY: integer minor units with the reading's own currency, read in
       place of `value` where a row holds it (`measures.ts` `moneyOf`), so "Monthly revenue" of USD 48.15 is never the
       decimal 4,815 with a unit of text. A reading in another currency is a line of its own, never added to this one. */
    /* AND THE SIXTH GROUPS THEM: a field each measure is listed under, such as its project, and a grouped `lines`
       block lists every measure it draws no line for under its group, the quiet ones too (`measureLines`). */
    const [when, val, name, unit, amount, group] = (block.columns ?? []).map((c) => c.field);
    const missing = [when, val, name, unit, amount, group].filter((f): f is string => f !== undefined && !Object.hasOwn(schema.fields, f));
    if (missing.length)
      return {
        ...base,
        refusals: also({ code: 'FIELD_UNKNOWN', fix: `${register} has no field called ${missing.join(', ')}.`, at: 'columns', allowed: Object.keys(schema.fields) }),
      };
    if (amount !== undefined && schema.fields[amount]?.type !== 'money')
      return {
        ...base,
        refusals: also({ code: 'DECLARATION_INVALID', fix: `The fifth column is each reading as money, and ${amount} on ${register} is not a money field. Name a money field there, or leave it off.`, at: 'columns' }),
      };
    if (block.bucket !== undefined && !(MEASURE_BUCKETS as readonly unknown[]).includes(block.bucket))
      return { ...base, refusals: also({ code: 'DECLARATION_INVALID', fix: `bucket: is ${MEASURE_BUCKETS.join(' or ')}.`, at: 'bucket' }) };
    const tz = readableZone(deps.tz);
    const window = measureWindow(deps.ctx.nowMs, block.back, measureBucket(block.bucket), tz);
    if (group !== undefined && block.kind !== 'lines')
      return { ...base, refusals: also({ code: 'DECLARATION_INVALID', fix: 'The sixth column groups the measures a lines block lists. Take it off this stat, or make it lines.', at: 'columns' }) };
    const read = deps.readings({
      register,
      where: said.predicate,
      when: when!,
      value: val!,
      ...(name ? { name } : {}),
      ...(unit ? { unit } : {}),
      ...(amount ? { amount } : {}),
      ...(group ? { group } : {}),
      since: window.since,
    });
    if (!read.ok) return { ...base, refusals: refused(read) ? also(read.refusal) : also() };
    /* `limit:` IS HOW MANY MEASURES, at most the twelve a block is ever handed, so Today can draw the four that moved. */
    const most = typeof block.limit === 'number' && Number.isFinite(block.limit) ? Math.min(MEASURES_MOST, Math.max(0, Math.floor(block.limit))) : MEASURES_MOST;
    /* GROUPED, THE LIST UNDER THE LINES TAKES `most:`, else the block's `limit:` as before, else `MEASURES_LISTED`. */
    const listed = typeof block.most === 'number' ? Math.min(MEASURES_LISTED, Math.max(1, Math.floor(block.most))) : typeof block.limit === 'number' ? most : MEASURES_LISTED;
    const opts = { nowMs: deps.ctx.nowMs, back: block.back, bucket: block.bucket, tz, fallback: block.heading ?? '', most, ...(group ? { grouped: true, listed } : {}) };
    const all = [...read.value.latest, ...read.value.readings];
    /* A TILE OF ONE READING IS STILL A FIGURE, AND A LINE OF ONE IS A DOT. So a `stat` draws every measure, the ones that
       moved first, and a `lines` block draws a line only where there are two points to join, ranked by how much each
       moved, and hands the measures with one reading back beside them as `latest` (`measures.ts`). */
    if (block.kind === 'lines') {
      const { lines, latest } = measureLines(all, opts);
      return { ...base, measures: lines, latest, matched: read.value.readings.length };
    }
    return { ...base, measures: measureSeries(all, opts), matched: read.value.readings.length };
  }

  /* WHERE A ROW APPLIES IS THE REGISTER'S SCOPE FIELD, and nothing else can answer it. Both keys that
     ask are checked before any query, so a block that cannot say which project draws nothing rather
     than every row of the register. */
  const inherit = block.inherit === true;
  /* THE LIST OF RUNS SAYS WHERE A RUN APPLIES IN ITS OWN WAY: a run is placed in a project by that project's
     spoken name, which `projectsOf` reads as the two run sources read it, and no `scope:` field says so. So over that
     list `as: scope` is taken on the run's project and answered below, and it is not a scope this block inherits by. */
  const runs = register === SESSION;
  const placedIn = runs ? (block.columns ?? []).filter((c) => c.as === 'scope' && c.field === PLACED) : [];
  const scoped = (block.columns ?? []).filter((c) => c.as === 'scope' && !placedIn.includes(c));
  if ((inherit && (!deps.scopeOf || !deps.inScope)) || (scoped.length && !deps.scopeOf))
    return {
      ...base,
      refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog does not read where a row applies yet.', at: inherit ? 'inherit' : 'columns' }),
    };
  const scope = inherit || scoped.length ? (deps.scopeOf?.(register) ?? null) : null;
  if (inherit && !scope)
    return {
      ...base,
      refusals: also({ code: 'FIELD_UNKNOWN', fix: `${register} has no field that says where its rows apply, so there is nothing to inherit.`, at: 'inherit' }),
    };
  const astray = scoped.find((c) => c.field !== scope?.field);
  if (astray)
    return {
      ...base,
      refusals: also({
        code: 'DECLARATION_INVALID',
        fix: scope
          ? `as: scope draws where a row applies, which ${register} says in ${scope.field}, not ${astray.field}.`
          : `as: scope draws where a row applies, and ${register} has no field that says so.`,
        at: 'columns',
      }),
    };

  /* A LIMIT OF ZERO DRAWS NOTHING, which is what it says. `Math.max(1, …)` turned it into one row —
     a block declaring it wanted no rows and getting one is a block nobody can write. */
  /* AND A SECTION ASKS FOR ONE: it draws its count, `matched`, which is the whole match however few rows are read, and
     sends none of them (`leanRows`). It read fifty projects whole for the one number "Parked and finished" says. */
  const limit = SUMS.has(block.kind)
    ? ROWS_BESIDE
    : block.kind === 'section' && block.limit !== 0
      ? 1
      : block.limit === undefined
        ? 50
        : Math.max(0, Math.floor(block.limit));
  if (limit === 0) return { ...base, matched: 0 };

  /* A RING OVER A REGISTER IS PROGRESS, one row it counts rather than the rows it matched. IT IS ASKED HERE, AFTER
     THE SCOPE AND THE LIMIT, because the first cut asked it straight after the `where` and so skipped both: a ring
     with `inherit: true` counted Kiln's own done jobs against every job of every project (2 of 16 where Kiln and
     the jobs that apply everywhere are 3 of 6), one over a list with no scope field drew the list instead of
     saying so, and `limit: 0` drew the dial. */
  if (block.kind === 'ring') return ringOf(deps, block, register, schema, said.predicate, inherit ? scope : null, base, also);

  /* A PATH IS A LIST THAT SAYS WHICH OF ITS ROWS ARE DONE, which only a list declaring `steps:` does. `first:` is its
     short view, the first open rows, so over a list that says nothing is done there are no open rows to cut, and the
     block is refused rather than drawn long under a promise to be short. */
  const path = block.kind === 'steps' ? ownSteps(deps, register, schema) : null;
  if (block.kind === 'steps' && block.first !== undefined && !path)
    return {
      ...base,
      refusals: also({
        code: 'DECLARATION_INVALID',
        fix: `first: draws the first open steps, and ${register} does not say which of its rows are done. Declare steps: { of, done } on ${register}, or write limit: instead.`,
        at: 'first',
      }),
    };
  /* THE ORDER GOES TO THE QUERY, not to the page after it. Sorting the rows that came back is
     sorting a page that was already chosen: "the five largest" would be five arbitrary rows put in
     order, which is a different answer and an invisible one. A path with no `order:` of its own reads in the
     order its list declares for its steps, which is the order a card's next step is picked in. */
  const order = block.order?.length ? block.order : path?.order ? [{ field: path.order, dir: 'asc' as const }] : undefined;
  const ask = (where: Predicate | undefined, most: number): Result<Listed> =>
    inherit && scope
      ? listInherited(deps, register, scope, where, most, order)
      : deps.list({
          register,
          where,
          limit: most,
          ...(order ? { order } : {}),
        });
  /* THE SHORT VIEW OF A PATH ASKS FOR ITS OPEN ROWS, so the done ones never take the room `limit` gives. Cut after the
     read, a path of [done, open, open, open] with `first: 2, limit: 1` answered no rows while three steps were open.
     `matched` is still the whole list's, asked apart, and `open` is this read's own count: the drawer's "more" is the
     open steps it did not draw, so it is counted from `open` and not from `matched`, which holds the done ones too. */
  const short = path && block.first !== undefined ? path : null;
  /* `first: 0` DRAWS NO STEPS, which is what it says, as `limit: 0` draws no rows. `Math.max(1, …)` drew one, so a
     hand-made block asking for none got the first open step. The open steps are still asked, one row, because the
     read's count is what the drawer's "more" is made from, and the kernel's `list` reads a limit of 0 as no limit given
     and answers its default. */
  const drawn = short ? Math.min(limit, Math.floor(block.first!)) : limit;
  const listed = short ? ask(openOf(said.predicate, short.done), Math.max(1, drawn)) : ask(said.predicate, limit);
  if (!listed.ok) return { ...base, refusals: refused(listed) ? also(listed.refusal) : also() };
  const whole = short ? ask(said.predicate, 1) : listed;
  if (!whole.ok) return { ...base, refusals: refused(whole) ? also(whole.refusal) : also() };

  /* WHERE NO WHOLE READ IS HANDED (`handsWhole`), A SUM OVER A PAGE OF ITS ROWS IS STILL A WRONG NUMBER, so the block
     says so as it always did. Where one is handed this never fires, and what bounds the block is time (`wholeLate`). */
  const pastOneRead = (): BlockResult => ({
    ...base,
    refusals: also({
      code: 'OUT_OF_BOUNDS',
      fix: `A ${block.kind} adds up every row it matched, and ${register} matched ${listed.value.matched} where a block that adds up reads ${ROWS_BESIDE}. Narrow it with where: until it matches ${ROWS_BESIDE} or fewer, or draw it as a list.`,
      at: 'where',
    }),
  });
  if (SUMS.has(block.kind) && !handsWhole() && listed.value.matched > ROWS_BESIDE) return pastOneRead();

  /* THE COLUMNS ARE CHECKED AGAINST THE REGISTER. A column naming a field nobody declared renders as
     an empty cell under a heading that promises one, which reads as "no value" rather than as "no
     such thing" — and the difference is whether anybody investigates. */
  const unknown = (block.columns ?? [])
    .filter((c) => !(block.kind === 'cards' && (c.as === 'next' || c.metric !== undefined)))
    /* A COLUMN'S SECOND FIELD (`or:`) IS CHECKED AS ITS FIRST IS, or the fallback would be a blank nobody looks into. */
    .flatMap((c) => (c.or === undefined ? [c.field] : [c.field, c.or]))
    /* WHAT A RUN SAID IT IS DOING IS A COLUMN OF THE LIST OF RUNS AND NO FIELD OF IT (`withSaid`), here as on the two
       run sources, so a card over the runs that stopped says the sentence a card over the working ones says. */
    .filter((f) => f !== 'seq' && f !== CHANGED && !(runs && f === DOING_SAID) && !Object.hasOwn(schema.fields, f));
  /* A CARD'S NEXT STEP IS A FIELD OF THE STEPS LIST, not of the list the cards are over, so it is checked there. */
  const nextFault = nextColumnFault(deps, block, register);
  if (nextFault) return { ...base, refusals: also(nextFault) };

  /* A REFUSAL MEANS THE BLOCK DREW NOTHING, which is what `BlockResult` says and what it was not
     doing: it returned the rows AND the refusal, so a renderer that drew the rows and ignored the
     sentence would show a table with a column of blanks where a field nobody declared should be —
     which reads as "no value" rather than as "no such thing". */
  if (unknown.length)
    return {
      ...base,
      refusals: also({
        code: 'FIELD_UNKNOWN',
        fix: `${register} has no field called ${unknown.join(', ')}.`,
        at: 'columns',
        allowed: Object.keys(schema.fields),
      }),
    };
  /* A CARD'S PICTURE AND ITS HUE ARE FIELDS OF THE CARD'S OWN ROW, checked here where the list is in hand. */
  const roled = roleFault(block, register, schema);
  if (roled) return { ...base, refusals: also(roled) };
  /* A CARD'S TREND IS A FIGURE, checked before any card reads it, so an unknown one is said once and not once a card. */
  const trendFault = trendColumnFault(deps, block) ?? whenColumnFault(deps, block);
  if (trendFault) return { ...base, refusals: also(trendFault) };

  /* A SIGN IS READ FROM AN ENUM AND ONE OF ITS VALUES, or the figure would carry a sign nothing decides. */
  const unsigned = (block.columns ?? []).find((c) => {
    if (c.sign === undefined) return false;
    const field = typeof c.sign?.field === 'string' && Object.hasOwn(schema.fields, c.sign.field) ? schema.fields[c.sign.field] : undefined;
    return !(field?.type === 'enum' && typeof c.sign?.minus === 'string' && (field.values ?? []).includes(c.sign.minus));
  });
  if (unsigned)
    return {
      ...base,
      refusals: also({
        code: 'DECLARATION_INVALID',
        fix: `sign: names an enum field on ${register} and the value that makes the amount go out, such as { field: direction, minus: owed_by_me }.`,
        at: 'columns',
      }),
    };
  const asksChanged = (block.columns ?? []).some((c) => c.field === CHANGED) && !Object.hasOwn(schema.fields, CHANGED);
  if (asksChanged && !deps.history && !deps.lastChanges)
    return { ...base, refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog does not read who changed a row onto a page yet.', at: 'columns' }) };
  /* `working: true` NEEDS BOTH HALVES OR NEITHER. It is one question asked of two reads, and a record
     wired for one of them would answer `false` for every row, which is a block quietly saying nobody
     is working rather than saying it cannot tell. */
  if (block.working === true && !(deps.history && deps.sessionsLive))
    return { ...base, refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog does not read whether an agent is on a row onto a page yet.', at: 'working' }) };

  const read = short && !(drawn > 0) ? [] : listed.value.rows;
  const ranged = block.kind === 'progress' && block.range === true ? rangeFault(block, register, schema, read) : null;
  if (ranged) return { ...base, refusals: also(ranged) };
  /* EACH GROUPED CARD OR TABLE ROW SAYS ITS GROUP (`groupedRows`). */
  const grouped = grouping ? groupedRows(deps, read, grouping) : read;
  const rows = staleDays ? datedRows(grouped, staleDays.field, staleDays.days) : grouped;
  const marks = path ? rows.map((r) => r.fields[path.done] === true) : null;
  /* A PATH'S NEXT STEP IS ITS FIRST OPEN STEP IN THE ORDER ITS LIST DECLARES, not the first open one drawn. Under
     `order: rank desc` a path drew S3, S2, S1 and marked S2 as next while the card over the same steps said S1. So it
     is picked by `nextSteps`, the rule a card's next step is picked by, with every drawn row put under one parent so
     that its one answer is the whole path's. */
  const lead = path
    ? nextSteps(
        rows.map((r, at) => ({ seq: r.seq, at, fields: { path: 1, done: r.fields[path.done], rank: path.order === undefined ? null : r.fields[path.order] } })),
        { of: 'path', done: 'done', order: 'rank' },
      ).get('1')
    : undefined;
  /* WHICH OF THE ROWS ARE IN THE PATH'S SHORT VIEW, beside every row up to `limit`, so both views draw from this one
     answer (`shortOf`). */
  const inShort = shortOf(deps, block, register, schema, rows);
  if ('refusals' in inShort) return { ...base, refusals: also(...inShort.refusals) };
  /* A BUDGET SETS ITS ROWS AGAINST A FIGURE, read here beside them, so a limit and what was spent come from one answer.
     A GOAL IS SET AGAINST WHAT WAS LOGGED TOWARD IT the same way, the figure grouped by the row it points at. */
  const figure = block.kind !== 'progress' ? undefined : block.spent !== undefined ? { id: block.spent, at: 'spent' } : block.toward !== undefined ? { id: block.toward, at: 'toward' } : undefined;
  const spent = figure === undefined ? {} : spentOf(deps, figure.id, figure.at);
  if ('refusal' in spent) return { ...base, refusals: also(spent.refusal) };
  /* A LIMIT AND WHAT WAS SPENT AGAINST IT ARE ONE CURRENCY, for the reason two currencies are never added: a EUR 50 limit
     is not 90% used by GBP 45. */
  const unit = 'readings' in spent ? (spent.readings[0]?.reading?.unit ?? null) : null;
  const limitField = block.columns?.[1]?.field;
  if (unit !== null && limitField !== undefined) {
    const other = rows.map((r) => r.fields[limitField]).find((v): v is { currency: string } => typeof v === 'object' && v !== null && typeof (v as { currency?: unknown }).currency === 'string' && (v as { currency: string }).currency !== unit);
    /* A ROW IN ANOTHER CURRENCY IS SET AGAINST THE FIGURE AT THE RATE THE RECORD HOLDS, when it holds one (a goal in
       dollars on a record kept in pounds); the reader converts the row's limit the same way. With no rate it is refused.
       ON THE RECORD'S OWN DAY, the one the reader converts on: the machine's day let a record on a held clock (an as-of
       read, a test) ask for a rate on a day it has not reached. */
    const rates = deps.ctx.fx?.().rates ?? [];
    const today = localDays(readableZone(deps.ctx.tz ?? deps.tz))(deps.ctx.asOfMs ?? deps.ctx.nowMs);
    const convertible = other !== undefined && rateFor(rates, other.currency, unit, today) !== null;
    if (other && !convertible)
      return {
        ...base,
        refusals: also({ code: 'MIXED_CURRENCY', fix: `A row here is in ${other.currency} and ${figure?.id} is in ${unit}, and two currencies are never set against each other. Give the row's ${limitField} in ${unit}, or read a figure in ${other.currency}.`, at: figure?.at ?? 'spent' }),
      };
  }
  /* A KIND THAT ADDS UP ANSWERS ITS WHOLE: its parts and its total over every row the scope and the `where`
     admit, read here after every check above, so a block refused for a column is never added up first. The rows above
     are the first of them and ride beside it. A BLOCK THAT INHERITS ADDS UP ITS PROJECT'S ROWS AND THE ONES THAT APPLY
     EVERYWHERE, the two sentences its list was read by, as one. */
  let wholeRead: WholeRead | null = null;
  if (SUMS.has(block.kind) && handsWhole()) {
    const reach = (p: Predicate | undefined): Result<Predicate | undefined> => {
      if (!(inherit && scope)) return ok(p);
      const everywhere = everywhereOf(deps, register, scope, p);
      return everywhere.ok ? ok({ any: [p!, everywhere.value] }) : everywhere;
    };
    /* A HEAT'S `of:` IS A SENTENCE OVER THE SAME LIST, refused at `of:` as a ring's is, and the part is always inside
       the whole: the days are counted where both the `where` and the `of:` hold. */
    let part = said.predicate;
    let whole: Predicate | undefined | null = null;
    if (block.kind === 'heat' && block.of !== undefined) {
      const shape = block.of as unknown;
      if (typeof shape !== 'string' && (typeof shape !== 'object' || shape === null || Array.isArray(shape)))
        return { ...base, refusals: also({ code: 'VALUE_MALFORMED', fix: `of: is a sentence over ${register}, such as list is work.`, at: 'of' }) };
      const wanted = predicateOf(block.of, schema, deps.ctx);
      if (wanted.bad.length) return { ...base, refusals: also(...wanted.bad.map((r) => ({ ...r, at: 'of' }))) };
      const home = inherit && scope ? allOf(said.predicate).find((n) => (n as Leaf).field === scope.field && typeof (n as Leaf).is === 'string') : undefined;
      part = andOf([...allOf(said.predicate), ...allOf(wanted.predicate)]);
      const all = reach(andOf([...(home ? [home] : []), ...allOf(wanted.predicate)]));
      if (!all.ok) return { ...base, refusals: refused(all) ? also({ ...all.refusal, at: 'of' }) : also() };
      whole = all.value;
    }
    const admitted = reach(part);
    if (!admitted.ok) return { ...base, refusals: refused(admitted) ? also(admitted.refusal) : also() };
    const added = wholeOf(deps, block, register, schema, admitted.value, whole);
    if (!added.ok) return { ...base, refusals: refused(added) ? also(added.refusal) : also() };
    wholeRead = added.value;
    /* AND A BLOCK WHOSE COLUMNS NAME NOTHING THIS CAN ADD UP (`wholeShape`) HAS NO WHOLE, so its drawer adds up the rows
       it is handed, and past one read of them that is the wrong number the refusal was written for. It still says so. */
    if (wholeRead === null && listed.value.matched > ROWS_BESIDE) return pastOneRead();
  }
  /* A BAR OR A SPLIT ADDS UP ITS ROWS WHERE IT IS DRAWN, so the home currency and the rates travel beside them, and the
     rows are converted or split by currency with the same arithmetic a figure uses (`fx.ts`). */
  const held = block.kind === 'bar' || block.kind === 'split' || (block.kind === 'progress' && figure !== undefined) ? deps.ctx.fx?.() : undefined;
  /* A RUN'S PROJECT BY ITS NAME, AND WHAT IT SAID IT IS DOING, read only for a block that asks for either: the same two
     answers `sessions.live` gives, so a run reads the same on a card whichever of the three lists it. */
  const runSaid = runs && (block.columns ?? []).some((c) => c.field === DOING_SAID);
  const placed = placedIn.length > 0 || runSaid ? projectsOf(deps, rows) : null;
  return {
    ...base,
    ...spent,
    rows: placed && runSaid ? withSaid(deps, block, rows, placed.scopes, SOURCE_KIT) : rows,
    ...(wholeRead ? { wholeRead } : {}),
    ...(held && (held.home !== null || held.rates.length > 0) ? { fx: { home: held.home, rates: [...held.rates] } } : {}),
    ...changesOf(deps, register, rows, asksChanged),
    ...(block.working === true ? { working_now: workingOf(deps, register, rows) } : {}),
    matched: whole.value.matched,
    /* THE OPEN STEPS, which the short view's read already counted: it asked for the open rows alone. */
    ...(short ? { open: listed.value.matched } : {}),
    ...(inherit ? { inherited: listed.value.inherited ?? 0 } : {}),
    ...(scope ? scopesOf(deps, rows, scope) : {}),
    ...(placed && placedIn.length > 0 ? placed : {}),
    ...ringsOf(deps, block, register, rows),
    ...nextsOf(deps, block, register, rows),
    ...trendsOf(deps, block, rows),
    ...whensOf(deps, block, rows),
    ...factsOf(deps, block, rows),
    ...(marks ? { done_now: marks, next: lead === undefined ? null : lead.at } : {}),
    ...(grouping && block.kind === 'cards' ? { fold: typeof block.fold === 'number' ? block.fold : CARD_FOLD } : {}),
    ...inShort,
  };
}

/** Each card's day by the value of the field its figure groups by, as `staleDaysOf` reads them. */
type StaleDays = { by: string; days: ReadonlyMap<string, string> };

/**
 * The day a figure says for each of its groups, for a card's `stale:`: a figure that rolls this list's balances forward
 * (`value: { rolled }` over `register.<this list>`) with `read: as_of` and a `group_by`, so each group's value is the
 * oldest day its accounts were last confirmed on, held as whole days since 1970 (`readRolled`). A card finds its day by
 * its own value of that field.
 *
 * THE TYPED DAY IS NOT THE AGE. A bank message writes a balance on a Ledger row and never the account's typed "As of",
 * so every account on the owner's record read out of date and would go on reading it after messages filed. A
 * group with no confirmed day says none, and the card keeps the day its row holds.
 */
function staleDaysOf(deps: PageDeps, register: string, figure: unknown): StaleDays | Refusal {
  const wrong = (why: string): Refusal => ({
    code: 'DECLARATION_INVALID',
    fix: `stale: figure: reads each card's day from a figure that rolls ${register}'s balances by account, with read: as_of and group_by. ${why}`,
    at: 'stale',
  });
  if (typeof figure !== 'string' || figure === '') return wrong('Name the figure, such as figure: account-ages.');
  const decl = deps.metric(figure);
  if (!decl) return wrong(`There is no figure called ${figure}.`);
  const rolled = isRolled(decl.value) ? (decl.value as unknown as { rolled: Rolled }).rolled : null;
  if (!rolled || rolled.read !== 'as_of' || decl.source !== `register.${register}` || decl.group_by === undefined)
    return wrong(`${decl.name} is not one.`);
  const read = deps.read(decl);
  if (!read.ok) return refused(read) ? read.refusal : wrong(`${decl.name} could not be read.`);
  const days = new Map<string, string>();
  for (const g of read.value.groups ?? [])
    if (typeof g.value === 'number' && Number.isFinite(g.value)) days.set(g.key, new Date(g.value * 86_400_000).toISOString().slice(0, 10));
  return { by: decl.group_by, days };
}

/** Each card with its group's day written into the `stale:` field, where the figure says one; the stored rows untouched. */
function datedRows(rows: readonly PageRow[], field: string, days: StaleDays): PageRow[] {
  return rows.map((r) => {
    const key = r.fields[days.by];
    const day = typeof key === 'string' || typeof key === 'number' ? days.days.get(String(key)) : undefined;
    return day === undefined ? r : { ...r, fields: { ...r.fields, [field]: day } };
  });
}

/**
 * WHAT A BLOCK'S ROWS ARE GROUPED BY: a link, each group a row of the list it points at and named by that row's title,
 * or a choice of the list (its state among them), each group one of its values and named by the choice's own label.
 */
type Grouping = { field: string; label: string } & ({ to: string } | { labels: Readonly<Record<string, string>> });

/** Whether a field may group a block's rows: a link to another list, a choice, or the list's state whatever it is. */
const groupsBy = (spec: Schema['fields'][string], state: boolean): boolean =>
  (spec.type === 'ref' && typeof spec.to === 'string' && spec.to !== '') || spec.type === 'enum' || state;

/**
 * The field a `cards` or a `table` block groups by, or why it cannot, or `null` when it groups by nothing. Said again at
 * read for a page installed before the install checked it (`declare.ts` `cardGroupFault`). Only cards fold their groups.
 *
 * A LINK, A CHOICE OR THE STATE, because each group then has a name a person reads: the row pointed at, or the label of
 * the value. A text, a number or a day would be a heading a row long, and the filters already pick one value of those.
 */
function rowGrouping(block: PageBlock, register: string, schema: Schema): Grouping | Refusal | null {
  const cards = block.kind === 'cards';
  const fold = block.fold;
  if (cards && fold !== undefined && !(typeof fold === 'number' && Number.isInteger(fold) && fold >= 1 && fold <= CARD_FOLD_MOST))
    return { code: 'OUT_OF_BOUNDS', fix: `fold: is how many cards each group shows before the rest fold, from 1 to ${CARD_FOLD_MOST}.`, at: 'fold' };
  if (block.group === undefined)
    return !cards || fold === undefined
      ? null
      : { code: 'DECLARATION_INVALID', fix: 'fold: folds the groups of cards, and these cards draw none. Give them group: a link, a choice or the state of their list, or take fold: off.', at: 'fold' };
  const may = Object.entries(schema.fields).flatMap(([id, f]) => (groupsBy(f, id === schema.state) ? [id] : []));
  const what = cards ? 'these cards' : 'these rows';
  const spec = typeof block.group === 'string' && Object.hasOwn(schema.fields, block.group) ? schema.fields[block.group] : undefined;
  if (!spec) return { code: 'FIELD_UNKNOWN', fix: `${register} has no field called ${String(block.group)} to group ${what} by.`, at: 'group', allowed: may };
  const field = block.group as string;
  const label = wordsOf(spec.label ?? field);
  if (spec.type === 'ref' && typeof spec.to === 'string' && spec.to !== '') return { field, label, to: spec.to };
  if (groupsBy(spec, field === schema.state)) return { field, label, labels: spec.labels ?? {} };
  return {
    code: 'DECLARATION_INVALID',
    fix: `${cards ? 'Cards' : 'Rows'} are grouped by a link to another list, a choice or the list's state, so each group has a name, and ${field} is ${spec.type}. ${may.length ? `Group by ${may.join(' or ')}.` : `${register} has none of those.`}`,
    at: 'group',
    allowed: may,
  };
}

/**
 * EACH ROW WITH ITS GROUP. By a choice: the value it holds, named by the choice's label, else the value in plain words.
 * By a link: the row it points at, by its handle and its title. A row no longer there is nothing, and so is a link to a
 * list the reader may not read, whose titles she is not told: the record holds the whole block from her anyway, by the
 * list `registersOf` names for it.
 *
 * THE ROWS STAY IN THE ORDER THEY WERE READ. A host draws a group where its first row stands and the rows in no group
 * where the record put them, so a block ordered by the last day in touch still reads the most recent first.
 */
function groupedRows(deps: PageDeps, rows: readonly Entry[], g: Grouping): PageRow[] {
  /* "No project", and "No CRM deal" as its label says it: only a capital that starts a word is taken down. */
  const said = /^[A-Z][^A-Z]/u.test(g.label) ? g.label[0]!.toLowerCase() + g.label.slice(1) : g.label;
  const none = { value: '', name: `No ${said}` };
  if ('labels' in g) {
    const { labels } = g;
    return rows.map((r): PageRow => {
      const v = r.fields[g.field];
      if (typeof v !== 'string' || v === '') return { ...r, group: none };
      const named = Object.hasOwn(labels, v) ? labels[v]!.trim() : '';
      return { ...r, group: { value: v, name: named !== '' ? named : wordsOf(v) } };
    });
  }
  if (deps.ctx.reads !== undefined && !deps.ctx.reads(g.to)) return [...rows];
  const first = (v: unknown): string | null =>
    Array.isArray(v) ? ((v.find((x) => typeof x === 'string' && x !== '') as string | undefined) ?? null) : typeof v === 'string' && v !== '' ? v : null;
  const ids = [...new Set(rows.map((r) => first(r.fields[g.field])).filter((id): id is string => id !== null))];
  const title = deps.titleOf(g.to);
  const listed = ids.length ? deps.list({ register: g.to, where: { field: 'id', in: ids }, limit: ids.length }) : null;
  const found = new Map(listed?.ok ? listed.value.rows.map((r) => [r.id, r] as const) : []);
  return rows.map((r): PageRow => {
    const id = first(r.fields[g.field]);
    const to = id === null ? undefined : found.get(id);
    if (!to || to.seq === null) return { ...r, group: none };
    const t = title !== null && Object.hasOwn(to.fields, title) ? to.fields[title] : null;
    return { ...r, group: { value: `${g.to}#${to.seq}`, name: typeof t === 'string' && t.trim() !== '' ? t.trim() : 'Untitled' } };
  });
}

/**
 * The steps declaration of the list a block reads, when it is a list of steps.
 *
 * READ THROUGH `stepsOf` OF THE LIST ITS `of` FIELD POINTS AT, because that is the one read of a list's `steps:` a host
 * wires: every ref field of the list is a place the steps could belong to, and the one whose target names this list
 * among its steps is the answer.
 */
/**
 * A block's `where` and "not done" together, one `all` so an inherited read still finds its project among the clauses.
 * `none` of `is: true` and not `is: false`, because a step nobody has ticked holds no value and is open.
 */
function openOf(where: Predicate | undefined, done: string): Predicate {
  const open: Predicate = { none: [{ field: done, is: true }] };
  if (where === undefined) return open;
  const all = (where as { all?: unknown }).all;
  return { all: [...(Array.isArray(all) ? (all as Predicate[]) : [where]), open] };
}

function ownSteps(deps: PageDeps, register: string, schema: Schema): StepsDecl | null {
  if (!deps.stepsOf) return null;
  for (const spec of Object.values(schema.fields)) {
    const to = (spec as { to?: unknown }).to;
    if (spec.type !== 'ref' || typeof to !== 'string') continue;
    const mine = deps.stepsOf(to).find((l) => l.register === register);
    if (mine) return { of: mine.of, done: mine.done, ...(mine.order === undefined ? {} : { order: mine.order }) };
  }
  return null;
}

/** The list whose rows are steps of `register` and hold `field`, or why there is none. */
function stepsHolding(deps: PageDeps, register: string, field: string): { register: string; steps: StepsDecl } | Refusal {
  const lists = deps.stepsOf?.(register) ?? [];
  if (lists.length === 0)
    return {
      code: 'DECLARATION_INVALID',
      fix: `as: next draws the first open step under each card, and no list says its rows are steps of ${register}. Declare steps: { of, done } on the list of steps, or give the column another role.`,
      at: 'columns',
    };
  const holding = lists.find((l) => Object.hasOwn(deps.schemaOf(l.register)?.fields ?? {}, field));
  if (!holding)
    return {
      code: 'FIELD_UNKNOWN',
      fix: `${lists.map((l) => l.register).join(' and ')} ${lists.length > 1 ? 'have' : 'has'} no field called ${field}, and as: next names a field of the steps under each card.`,
      at: 'columns',
      allowed: lists.flatMap((l) => Object.keys(deps.schemaOf(l.register)?.fields ?? {})),
    };
  return { register: holding.register, steps: holding };
}

/** Why a `cards` block's `as: next` column cannot be answered, or `null`. */
function nextColumnFault(deps: PageDeps, block: PageBlock, register: string): Refusal | null {
  const col = block.kind === 'cards' ? block.columns?.find((c) => c.as === 'next') : undefined;
  if (!col) return null;
  const found = stepsHolding(deps, register, col.field);
  return 'code' in found ? found : null;
}

/**
 * EACH CARD'S NEXT STEP: that field of the first step under the card that is not done, in the order its list declares.
 *
 * THE WHOLE STEPS LIST IS READ, as `ringsOf` reads it, because the next step under a card is not in any page of the
 * list a card could ask for: it is the lowest open rank among the card's own, wherever it sits.
 */
function nextsOf(deps: PageDeps, block: PageBlock, register: string, rows: readonly Entry[]): { nexts?: (string | null)[] } {
  const col = block.kind === 'cards' ? block.columns?.find((c) => c.as === 'next') : undefined;
  if (!col) return {};
  const found = stepsHolding(deps, register, col.field);
  if ('code' in found) return {};
  const read = everyRow(deps, found.register, undefined);
  if (!read.ok) return {};
  const first = nextSteps(read.value.rows, found.steps);
  return {
    nexts: rows.map((r) => {
      const v = first.get(r.id)?.fields[col.field];
      return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : null;
    }),
  };
}

/** How many buckets a card's trend reaches back, the current one among them: eight weeks is two months of a project. */
const TREND_BUCKETS = 8;

/** A cards block's trend column over a figure, or `undefined`. */
const trendColumn = (block: PageBlock) => (block.kind === 'cards' ? block.columns?.find((c) => c.as === 'trend' && typeof c.metric === 'string') : undefined);

/** A trend figure's id, `project-done-by-week:{{name}}`, as the figure it names and the parameter after it, unfilled. */
const trendNamed = (metric: string): { id: string; param: string | null } => {
  const at = metric.indexOf(':');
  return at < 0 ? { id: metric, param: null } : { id: metric.slice(0, at), param: metric.slice(at + 1) };
};

/**
 * Why a card's trend figure cannot be drawn, or `null`: no figure has the name, or it is not grouped by a date bucket,
 * so it has no run of weeks or months to draw. Asked of the declaration alone, before a card is read.
 */
function trendColumnFault(deps: PageDeps, block: PageBlock): Refusal | null {
  const col = trendColumn(block);
  if (!col) return null;
  const { id } = trendNamed(col.metric!);
  const decl = deps.metric(id);
  if (!decl) return { code: 'METRIC_UNKNOWN', fix: `There is no figure called ${id} for a card's trend to draw.`, at: 'columns' };
  if (!isBucket(decl.bucket))
    return { code: 'DECLARATION_INVALID', fix: `${id} is not grouped by a date and a bucket, so a card has no weeks or months of it to draw. Name a figure with group_by: a day and bucket:.`, at: 'columns' };
  return null;
}

/**
 * EACH CARD'S TREND: the figure its trend column names, with `{{field}}` filled from the card's own row, read over the
 * last `TREND_BUCKETS` buckets by the series' own arithmetic (`barsOf`), so a project card's line and the project page's
 * chart of the same figure are the same numbers.
 *
 * NOTHING COUNTED IS NOUGHT ON A COUNT OR A SUM, and a gap on anything else. A week in which no task of a project was
 * finished is a week of nought, and a line that lifted off there would say nothing was known about it; an average of
 * nothing is not nought, so there the gap stays. A card whose figure has nothing in any bucket, whose hole its row
 * cannot fill, or whose figure is in several currencies at once draws no line: two currencies are never one line.
 */
function trendsOf(deps: PageDeps, block: PageBlock, rows: readonly Entry[]): { trends?: ((number | null)[] | null)[] } {
  const col = trendColumn(block);
  if (!col) return {};
  const leads = col.kpi === 'headline' ? kpiLeadsOf(deps) : null;
  return {
    trends: rows.map((row) => {
      /* A PROJECT THAT LEADS WITH A KEY NUMBER DRAWS THAT NUMBER'S OWN LINE, or no line where its points fall short of the
         periods drawn: never the figure's, beside a number it is not (the KPI plan of 21 October, 2.5, decided 3). */
      const lead = leads?.get(row.id);
      if (lead) return kpiTrend(lead, deps.ctx.nowMs, TREND_BUCKETS);
      const filled = String(fill(col.metric!, row));
      if (filled.includes('{{')) return null;
      const { id, param } = trendNamed(filled);
      const decl = deps.metric(id);
      if (!decl) return null;
      const counted = isCounted(decl.value);
      const lineOf = (named: string): MetricDecl | null => (named === filled ? (param === null ? decl : (fill(decl, null, param) as MetricDecl)) : null);
      const got = barsOf([{ metric: filled }], TREND_BUCKETS, 0, lineOf, deps.read);
      if ('refusal' in got || got.bars.split) return null;
      const line = got.bars.values[0] ?? [];
      if (line.every((v) => v === null)) return null;
      return counted ? line.map((v) => v ?? 0) : line;
    }),
  };
}

/** The most project leads one read of the key numbers answers: every card of the longest cards block, and more. */
const KPI_LEADS_MOST = 200;
/** The key numbers' source and kind, one name (`sources/index.ts`). */
const KPIS_KIND = 'kpis';

/**
 * THE KEY NUMBER EACH PROJECT LEADS WITH, by the project's row id: the `kpis` source read `for: cards`, the one answer the
 * app's cards, the hero and Today lead with, so a card's line is the number its figure says. Only a number with a value
 * leads, as a card leads only with one (`cardKpiOf` in the app). A record with no key numbers, or a source that refuses,
 * gives none, and every card draws its figure as before.
 *
 * ONLY FOR A READER OF THE WHOLE RECORD, since the source reads across it (`whole`): a key number worked out from a figure
 * reads whatever list the figure counts. A member held to some lists is drawn the figure, as the column names, and the
 * block over the projects is not held from them for the sake of one line.
 */
function kpiLeadsOf(deps: PageDeps): ReadonlyMap<string, KpiAnswer> {
  const source = sourceModule(KPIS_KIND);
  const reads = deps.ctx.reads;
  if (!source || deps.keyNumbers === false || (reads !== undefined && !reads(WHOLE_RECORD))) return new Map();
  const block: PageBlock = { kind: KPIS_KIND, source: KPIS_KIND, for: 'cards', limit: KPI_LEADS_MOST };
  const read = source.read(deps, block, { ...block, rows: [], matched: 0, refusals: [] }, (...more) => [...more], sourceKit(deps));
  const out = new Map<string, KpiAnswer>();
  for (const a of read.kpis ?? []) if (a.latest !== null && (read.refusals ?? []).length === 0) out.set(a.thing, a);
  return out;
}

/** A cards block's when column over a figure, or `undefined`. */
const whenColumn = (block: PageBlock) => (block.kind === 'cards' ? block.columns?.find((c) => c.as === 'when' && typeof c.metric === 'string') : undefined);

/**
 * Why a card's when figure cannot be drawn, or `null`: no figure has the name, or it is grouped, so it is no one
 * number a card. Asked of the declaration alone, before a card is read.
 */
function whenColumnFault(deps: PageDeps, block: PageBlock): Refusal | null {
  const col = whenColumn(block);
  if (!col) return null;
  const { id } = trendNamed(col.metric!);
  const decl = deps.metric(id);
  if (!decl) return { code: 'METRIC_UNKNOWN', fix: `There is no figure called ${id} for a card's when to say.`, at: 'columns' };
  if (decl.group_by !== undefined || decl.bucket !== undefined)
    return { code: 'DECLARATION_INVALID', fix: `${id} is read in parts, so a card has no one number of it to say. Name a figure with no group_by.`, at: 'columns' };
  return null;
}

/**
 * EACH CARD'S WHEN: the figure its when column names, with `{{field}}` filled from the card's own row,
 * read once a card as the project page's own tile reads it, so "2 days" on a card and "Last worked 2 days" on the
 * project's page are one reading. A card whose figure reads nothing, or is refused, draws no line, never nought.
 */
function whensOf(deps: PageDeps, block: PageBlock, rows: readonly Entry[]): Pick<BlockResult, 'whens'> {
  const col = whenColumn(block);
  if (!col) return {};
  return {
    whens: rows.map((row) => {
      const filled = String(fill(col.metric!, row));
      if (filled.includes('{{')) return null;
      const { id, param } = trendNamed(filled);
      const decl = deps.metric(id);
      if (!decl) return null;
      const read = deps.read(param === null ? decl : (fill(decl, null, param) as MetricDecl));
      if (!read.ok || typeof read.value.value !== 'number' || !Number.isFinite(read.value.value)) return null;
      /* AND THE MOMENT AND WHOSE RUN IT WAS, where the figure says them (`project-worked`, Z7 of 25 October), so a card
         says "20 minutes ago" and who, as Today does, and not only the day. */
      const { at, by } = read.value as { at?: unknown; by?: unknown };
      return { value: read.value.value, met: read.value.met, ...(typeof at === 'string' ? { at, by: typeof by === 'string' ? by : null } : {}) };
    }),
  };
}

/** Whether a figure counts or adds up, so a bucket with nothing in it is nought rather than unknown. */
const isCounted = (value: unknown): boolean => value !== null && typeof value === 'object' && ('count' in value || 'sum' in value);

/**
 * The field type each card role that draws a stored value must name: a `picture` leads the card with a file the record
 * holds, drawn through the host's `RenderOptions.file`, and a `hue` is a whole number of degrees on the colour wheel,
 * drawn only on the card's mark.
 */
const ROLE_TYPES: Readonly<Record<string, string>> = { picture: 'file', hue: 'int' };

/**
 * Why a card's `picture` or `hue` column cannot be drawn, or `null`.
 *
 * THE ROW HOLDS BOTH, so the read answers them as the rows already carry them: a picture as its stored
 * `{ sha256, mime, bytes, name }` and a hue as its number. What is checked is only that the field is the right kind of
 * thing, because a text field as a picture is a card led by a broken image and a text field as a hue is a colour made
 * of words. A hue outside 0 to 359 is the drawer's to leave off, one row at a time, as it leaves off a mark it cannot
 * draw.
 */
function roleFault(block: PageBlock, register: string, schema: Schema): Refusal | null {
  if (block.kind !== 'cards') return null;
  for (const column of block.columns ?? []) {
    const want = typeof column.as === 'string' && Object.hasOwn(ROLE_TYPES, column.as) ? ROLE_TYPES[column.as] : undefined;
    if (want === undefined) continue;
    const type = Object.hasOwn(schema.fields, column.field) ? schema.fields[column.field]?.type : undefined;
    if (type === want) continue;
    return {
      code: 'DECLARATION_INVALID',
      fix:
        column.as === 'picture'
          ? `as: picture leads a card with a file this BrainDog holds, and ${register}'s ${column.field} is ${type ?? 'no field'}. Name a file field.`
          : `as: hue is the card's colour, a whole number of degrees from 0 to 359, and ${register}'s ${column.field} is ${type ?? 'no field'}. Name an int field.`,
      at: 'columns',
      allowed: Object.entries(schema.fields)
        .filter(([, spec]) => spec.type === want)
        .map(([field]) => field),
    };
  }
  return null;
}

/**
 * Which rows of a path are in its short view (`short:`), aligned with `rows`, or why that cannot be said.
 *
 * ASKED OF THE RECORD AND NOT WORKED OUT HERE: the short view's sentence and the rows already read go to `list` as one
 * question, so a row is in the short view exactly when the record's own filter says so, and a sentence the list cannot
 * answer is refused as a block's `where:` is. One read, of at most the rows the block drew, which `limit` bounds.
 */
function shortOf(
  deps: PageDeps,
  block: PageBlock,
  register: string,
  schema: Schema,
  rows: readonly Entry[],
): { short_now?: boolean[] } | { refusals: Refusal[] } {
  if (block.kind !== 'steps' || block.short === undefined) return {};
  const said = predicateOf(block.short.where, schema, deps.ctx);
  if (said.bad.length) return { refusals: said.bad.map((r) => ({ ...r, at: 'short' })) };
  if (rows.length === 0) return { short_now: [] };
  const drawn: Predicate = { field: 'id', in: rows.map((r) => r.id) };
  const kept = deps.list({ register, where: said.predicate === undefined ? drawn : { all: [said.predicate, drawn] }, limit: rows.length });
  if (!kept.ok) return { refusals: refused(kept) ? [kept.refusal] : [] };
  const inView = new Set(kept.value.rows.map((r) => r.id));
  return { short_now: rows.map((r) => inView.has(r.id)) };
}

/**
 * The field types a range's low, high and spent may be: figures, money among them.
 *
 * ONLY TYPES THE KERNEL DECLARES (`FIELD_TYPES` in `coerce.ts`). `number` sat here beside them, a type no field can
 * have, so it admitted nothing and read as if it did. A `quantity` is left out: it is a figure with a unit, and nothing
 * here checks that the three columns share one.
 */
const RANGE_TYPES = new Set(['int', 'decimal', 'money']);

/**
 * Why a `progress` block drawn as ranges cannot be, or `null`.
 *
 * FOUR COLUMNS, THE LAST THREE FIGURES, AND ONE CURRENCY. The drawer puts every row on one scale, the largest high, and
 * adds the three columns into a total line, so a text where a low should be is a band from nothing, and pounds beside
 * dollars on one scale is the sum the record never makes.
 */
function rangeFault(block: PageBlock, register: string, schema: Schema, rows: readonly Entry[]): Refusal | null {
  const cols = block.columns ?? [];
  if (cols.length !== 4)
    return { code: 'DECLARATION_INVALID', fix: 'A progress drawn as ranges names four columns: the label, what was spent, the low and the high.', at: 'columns' };
  const figures = cols.slice(1).map((c) => c.field);
  const wrong = figures.find((f) => !RANGE_TYPES.has(schema.fields[f]?.type ?? ''));
  if (wrong !== undefined)
    return {
      code: 'DECLARATION_INVALID',
      fix: `A range is drawn from figures, and ${register}'s ${wrong} is ${schema.fields[wrong]?.type ?? 'not a field'}. Name a number or money field for what was spent, the low and the high.`,
      at: 'columns',
      allowed: Object.entries(schema.fields).filter(([, s]) => RANGE_TYPES.has(s.type)).map(([f]) => f),
    };
  const currencies = new Set<string>();
  for (const r of rows)
    for (const f of figures) {
      const v = r.fields[f];
      if (v !== null && typeof v === 'object' && typeof (v as { currency?: unknown }).currency === 'string') currencies.add((v as { currency: string }).currency);
    }
  if (currencies.size > 1)
    return {
      code: 'MIXED_CURRENCY',
      fix: `${register}'s ranges are in ${[...currencies].sort().join(' and ')}, and one scale and one total are one currency. Narrow it with where: to one currency, or give the rows one.`,
      at: 'columns',
    };
  return null;
}

/**
 * What a cash walk starts from: a number written on the block, or the reading of a declared figure.
 *
 * `{ metric }` IS THE ONE THAT CANNOT DRIFT. A page that leads with Cash now and walks from a typed
 * opening says two things about one balance, and only one of them moves when an account is updated.
 */
function openingOf(
  deps: PageDeps,
  opening: PageBlock['opening'],
): { value: number | null; unit: string | null; refusal?: Refusal; parts?: Part[]; missing?: string[]; converted?: boolean } {
  if (typeof opening === 'number') return { value: opening, unit: null };
  if (!opening || typeof opening !== 'object' || typeof opening.metric !== 'string') return { value: null, unit: null };
  /* THE FIRST COLON SEPARATES, as in a stat cell: `book-cash:Kiln` is one book's opening, read with its parameter filled. */
  const at = opening.metric.indexOf(':');
  const decl = deps.metric(at < 0 ? opening.metric : opening.metric.slice(0, at));
  if (!decl)
    return {
      value: null,
      unit: null,
      refusal: { code: 'METRIC_UNKNOWN', fix: `There is no metric called ${opening.metric} for the walk to start from.`, at: 'opening' },
    };
  const read = deps.read(at < 0 ? decl : (fill(decl, null, opening.metric.slice(at + 1)) as MetricDecl));
  if (!read.ok) return { value: null, unit: null, ...(refused(read) ? { refusal: read.refusal } : {}) };
  if (read.value.refusals.length) return { value: null, unit: null, refusal: read.value.refusals[0]! };
  /* A BALANCE IN SEVERAL CURRENCIES WITH NO RATE BETWEEN THEM IS NOT ONE AMOUNT TO START FROM: its parts are, one walk a
     currency, and the pairs it lacks are said beside them. */
  const parts = read.value.parts;
  if (parts) return { value: null, unit: null, parts, missing: read.value.fx?.missing ?? [] };
  return { value: read.value.value ?? 0, unit: read.value.unit, converted: Boolean(read.value.fx?.asOf) };
}

/**
 * The knobs a `forecast` may offer, which are `FORECAST_KNOBS` in `packages/render/src/forecast.ts` word for word.
 *
 * THE RENDERER DREW EIGHT AND THIS LET A DECLARATION NAME FOUR, so growth, rate drift, counting a plan and selling a
 * holding were built, tested, and refused on every page that asked for them: `knobs: [grow]` answered
 * DECLARATION_INVALID and the walk drew nothing at all (`test/pages-forecast-knobs.test.ts`).
 */
export const KNOBS = ['horizon', 'late', 'spend', 'leave', 'grow', 'drift', 'count', 'sell'] as const;

/** How far back a forecast draws what was recorded. */
const RECORDED_DAYS = 90;

/**
 * A walk's remembered balance before today, when it names the series, and its knobs checked.
 *
 * `recorded:` NAMES THE FIGURE THE OPENING IS, or the line would join two measures at today: the
 * opening is a reading of one figure, and what came before has to be that figure remembered, which is
 * why a series other than the opening's is refused rather than drawn.
 */
/** Remembered points in one currency, as a walk draws them: a point written in another currency is not this walk's. */
const pastIn = (points: readonly { at: string; value: number; unit?: string | null }[], currency: string | null): { at: string; value: number }[] =>
  points.filter((p) => !currency || !p.unit || p.unit === currency).map((p) => ({ at: p.at, value: p.value }));

function recordedOf(deps: PageDeps, block: PageBlock): { past?: { at: string; value: number; unit?: string | null }[] } | { refusal: Refusal } {
  if (block.knobs !== undefined && (!Array.isArray(block.knobs) || block.knobs.some((k) => !(KNOBS as readonly unknown[]).includes(k))))
    return { refusal: { code: 'DECLARATION_INVALID', fix: `knobs is a list of ${KNOBS.join(', ')}.`, at: 'knobs', allowed: [...KNOBS] } };
  /* THE HORIZON KNOB'S CHOICES ARE CHECKED WITH THE KNOBS, because a list the host cannot offer is a control drawn with
     nothing in it. How far each reaches is not checked here: the walk goes to the longest of them within `WALK_UNASKED`,
     and further only when a reader asks (`walkReach`), and a length past what a walk may carry is left off it rather
     than refusing the block. */
  if (block.horizons !== undefined && !horizonsOk(block.horizons))
    return {
      refusal: {
        code: 'DECLARATION_INVALID',
        fix: `horizons: is a list of one to ${HORIZONS_MOST} lengths for the horizon knob, each a whole number of days or last, such as [90, 365, last].`,
        at: 'horizons',
      },
    };
  if (block.headline !== undefined && block.headline !== 'under')
    return { refusal: { code: 'DECLARATION_INVALID', fix: "headline: is under, when the page's opening line says when the money runs out.", at: 'headline', allowed: ['under'] } };
  const axised = forecastAxisFault(block as unknown as Readonly<Record<string, unknown>>, 'This forecast');
  if (axised) return { refusal: { code: 'DECLARATION_INVALID', fix: axised.fix, at: axised.at, allowed: axised.allowed } };
  if (block.recorded === undefined) return {};
  const id = typeof block.recorded === 'string' ? block.recorded.replace(/^series\./u, '') : '';
  const opening = block.opening !== null && typeof block.opening === 'object' ? block.opening.metric : null;
  if (!id || id !== opening)
    return { refusal: { code: 'DECLARATION_INVALID', fix: `recorded: names the series its opening figure is remembered in, which is ${opening ?? 'a figure this walk does not open from'}.`, at: 'recorded' } };
  if (!deps.points) return {};
  const DAY = 86_400_000;
  const at = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { past: deps.points(id, at(deps.ctx.nowMs - RECORDED_DAYS * DAY), at(deps.ctx.nowMs - DAY)) };
}

/**
 * A forecast's late mark, read from the figure it names, and its warning reach checked.
 *
 * THE MARK IS A FACT ABOUT WHAT HAPPENED: how late money has come in, from the paid rows. The knob itself
 * stays arithmetic over the walk, and the mark only says where the record puts a reader's guess.
 */
function latenessOf(deps: PageDeps, block: PageBlock): { lateness?: number | null; late_name?: string } | { refusal: Refusal } {
  if (block.under !== undefined && (!Number.isInteger(block.under) || block.under < 1 || block.under > 365))
    return { refusal: { code: 'OUT_OF_BOUNDS', fix: 'under: is a whole number of days between 1 and 365.', at: 'under' } };
  if (block.late === undefined) return {};
  const decl = typeof block.late === 'string' ? deps.metric(block.late) : null;
  if (!decl) return { refusal: { code: 'METRIC_UNKNOWN', fix: `There is no metric called ${String(block.late)} for the late knob to mark.`, at: 'late' } };
  const read = deps.read(decl);
  if (!read.ok) return refused(read) ? { refusal: read.refusal } : {};
  if (read.value.refusals.length) return { refusal: read.value.refusals[0]! };
  /* THE KNOB IS CALLED BY THE FIGURE IT MARKS, as the record holds it, so it speaks as the use case installed it. */
  return { lateness: read.value.value, ...(typeof decl.name === 'string' && decl.name.trim() !== '' ? { late_name: decl.name } : {}) };
}

/**
 * What a forecast's sell control may count as sold: the figure `sell:` names, read, when it is in the walk's money.
 *
 * THE RENDERER ADDS THIS NUMBER TO THE BALANCE ON THE DAY A READER PICKS, as it arrives, so it has to be the walk's own
 * currency before it leaves here. A figure in dollars under a walk in pounds is left out rather than refused: the walk
 * is still right without it, and the one wrong answer is USD 1,500.75 walked as GBP 1,500.75. The renderer drops a
 * figure in another currency too, but only by the code written beside the number, and that is a second guard, not
 * this one. A figure that reads nothing, or less than nothing, is nothing to sell.
 */
function sellsOf(deps: PageDeps, block: PageBlock, currency: string | null): { sells?: { label: string; value: number }[] } | { refusal: Refusal } {
  /* WITH NO `sell:`, A WALK THAT OFFERS THE SELL KNOB OFFERS EVERY FIGURE DECLARED `sellable` (`sellables`). */
  if (block.sell === undefined) return sellables(deps, block, currency);
  const id = block.sell !== null && typeof block.sell === 'object' ? block.sell.metric : undefined;
  if (typeof id !== 'string' || id === '') return { refusal: { code: 'DECLARATION_INVALID', fix: 'sell: names a figure, as sell: { metric: holdings-value }.', at: 'sell' } };
  const decl = deps.metric(id);
  if (!decl) return { refusal: { code: 'METRIC_UNKNOWN', fix: `There is no metric called ${id} for the sell knob to offer.`, at: 'sell' } };
  const read = deps.read(decl);
  if (!read.ok) return refused(read) ? { refusal: read.refusal } : { sells: [] };
  if (read.value.refusals.length) return { refusal: read.value.refusals[0]! };
  const worth = read.value.value;
  const offered = currency !== null && read.value.unit === currency && typeof worth === 'number' && Number.isFinite(worth) && worth > 0;
  return { sells: offered ? [{ label: typeof decl.name === 'string' && decl.name.trim() !== '' ? decl.name : id, value: worth }] : [] };
}

/**
 * How a figure moved over a window, one value a day from its series, a day with no point a gap.
 *
 * A GAP AND NOT A ZERO: a day the snapshot did not run is a day nothing is known about, and a dip to
 * zero would say the balance was zero. Today is not in it, because today's point is written tomorrow.
 */
function trendOf(deps: PageDeps, metric: string, window: string): { trend?: (number | null)[] } | { refusal: Refusal } {
  const span = windowMs(window);
  if (span === null)
    return { refusal: { code: 'DECLARATION_INVALID', fix: `trend: ${window} is not a window. Write 12w, 90d or 3m.`, at: 'trend' } };
  if (!deps.points) return {};
  const DAY = 86_400_000;
  const days = Math.max(1, Math.round(span / DAY));
  const at = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const last = deps.ctx.nowMs - DAY;
  const from = at(last - (days - 1) * DAY);
  const by = new Map(deps.points(metric, from, at(last)).map((p) => [p.at, p.value]));
  const trend = Array.from({ length: days }, (_, i) => by.get(at(last - (days - 1 - i) * DAY)) ?? null);
  return trend.some((v) => v !== null) ? { trend } : {};
}

/**
 * THE FULLEST WALK THAT OPENS FROM FIGURE `id`: of the figures over `forecast.runway` whose `opening` names it, the one
 * over the most legs, by id when two tie. Two figures over the same legs walk one walk, so which is answered changes
 * nothing drawn, and a walk over fewer legs (what lasts if nothing comes in) is a part of the whole one, not the future.
 */
function walkFrom(deps: PageDeps, id: string): MetricDecl | null {
  const best = fullestWalk(deps.metrics?.() ?? [], id);
  return best === null ? null : deps.metric(best.metric);
}

/** `walkFrom`'s choice among `figures`, as declared: the reader of the lists a page reads asks it with no live target. */
function fullestWalk(figures: readonly MetricDecl[], id: string): MetricDecl | null {
  let best: MetricDecl | null = null;
  for (const d of figures) {
    if (d.source !== 'forecast.runway' || !Array.isArray(d.legs) || d.opening?.metric !== id) continue;
    if (best === null || d.legs.length > (best.legs as unknown[]).length) best = d;
  }
  return best;
}

/**
 * A TREND AHEAD: the walk a figure over `forecast.runway` walks (its legs, from the figure its `opening` names), over the
 * window from today, as the balance at the end of each day, today first. The same walk Cash ahead draws over the same
 * legs, so a tile on Today and the chart on Money cannot draw two pictures of one future.
 *
 * NOTHING WHERE IT CANNOT BE ONE WALK: a figure that is not a walk, an opening with no value, or money in two currencies
 * with no rate to add them, for the reason a walk never crosses two currencies. A window that is not one is refused, as
 * a trend behind refuses it.
 */
function aheadOf(
  deps: PageDeps,
  walkId: string,
  window: string,
): { trend?: (number | null)[]; ahead?: { from: string; currency: string; low: { day: string; value: number } } } | { refusal: Refusal } {
  const span = windowMs(window);
  if (span === null) return { refusal: { code: 'DECLARATION_INVALID', fix: `trend: ${window} is not a window. Write 12w, 90d or 3m.`, at: 'trend' } };
  const isWalk = (d: MetricDecl | null): d is MetricDecl & { legs: Leg[]; opening: { metric: string } } =>
    d !== null && d.source === 'forecast.runway' && Array.isArray(d.legs) && typeof d.opening?.metric === 'string';
  const named = deps.metric(walkId);
  const decl = isWalk(named) ? named : walkFrom(deps, walkId);
  if (!isWalk(decl))
    return { refusal: { code: 'DECLARATION_INVALID', fix: `ahead: names a figure over the walk, or a figure of what is held that a walk opens from, such as runway-days or cash-now; ${walkId} is neither.`, at: 'ahead' } };
  const opening = deps.metric(decl.opening.metric);
  const held = opening ? deps.read(opening) : null;
  if (!held?.ok || typeof held.value.value !== 'number') return {};
  const DAY = 86_400_000;
  const days = Math.max(1, Math.round(span / DAY));
  const walk = deps.runway(held.value.value, decl.legs as Leg[], days);
  if (!walk || walk.currency === null || (held.value.unit !== null && held.value.unit !== walk.currency)) return {};
  const today = localDays(readableZone(deps.ctx.tz ?? deps.tz))(deps.ctx.asOfMs ?? deps.ctx.nowMs);
  const at = (n: number): string => new Date(Date.parse(`${today}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
  const trend: number[] = [];
  let balance = walk.from;
  let low = { day: today, value: walk.from };
  let i = 0;
  for (let n = 0; n <= days; n++) {
    const day = at(n);
    while (i < walk.steps.length && walk.steps[i]!.day <= day) {
      balance = walk.steps[i++]!.balance;
      if (balance < low.value) low = { day, value: balance };
    }
    trend.push(balance);
  }
  return { trend, ahead: { from: today, currency: walk.currency, low } };
}

/* ── where a row applies ─────────────────────────────────────────────────── */

type Listed = { rows: Entry[]; matched: number; inherited?: number };

/**
 * The rows that apply everywhere as a block that inherits reads them, beside its project's own: the block's `where`
 * without its project clause, over the rows with no project, less the ones the project replaced with its own.
 * `listInherited` reads a page by it, and a whole read adds up by it (`wholeOf`), so the two cannot disagree.
 */
function everywhereOf(deps: PageDeps, register: string, scope: { field: string; to: string }, predicate: Predicate | undefined): Result<Predicate> {
  const clauses = allOf(predicate);
  const home = clauses.find((n): n is Leaf => (n as Leaf).field === scope.field && typeof (n as Leaf).is === 'string');
  if (!home)
    return no('REQUIRED_MISSING', `A block that inherits names its project in where:, as ${scope.field} is <project>.`, { at: 'where' });
  const project = home.is as string;
  const rest = clauses.filter((n) => n !== home);

  const claimed = deps.inScope!(register, project, { open: true, limit: 200 });
  if (!claimed.ok) return claimed;
  const shown = deps.inScope!(register, project, { limit: 200 });
  if (!shown.ok) return shown;
  const title = deps.titleOf(register);
  const titleOf = (e: Entry): string => String(e.fields[title ?? ''] ?? '');
  const visible = new Set(shown.value.inherited.map(titleOf));
  const hidden = title ? [...new Set(claimed.value.rows.map(titleOf))].filter((t) => !visible.has(t)) : [];
  return ok({
    all: [...rest, { field: scope.field, empty: true }, ...(hidden.length ? [{ none: [{ field: title!, in: hidden }] }] : [])],
  });
}

/** A predicate's clauses when it is a run of them, else the one it is; none for none. */
const allOf = (p: Predicate | undefined): Predicate[] =>
  p === undefined ? [] : Array.isArray((p as { all?: unknown }).all) ? (p as { all: Predicate[] }).all : [p];
/** Clauses as one predicate, every one of which must hold; `undefined` for none. */
const andOf = (cs: readonly Predicate[]): Predicate | undefined => (cs.length === 0 ? undefined : cs.length === 1 ? cs[0] : { all: [...cs] });

/**
 * The refusal of a whole read that ran past `WHOLE_MS`, or `null` for one inside it. The count of rows was the old
 * bound and it refused a list anybody could have added up; time is what a page actually has less of.
 */
export const wholeLate = (ms: number): Refusal | null =>
  ms > WHOLE_MS ? { code: 'OUT_OF_BOUNDS', fix: 'Adding this up took longer than a page waits. Narrow this with a where: so it adds up fewer.', at: 'where' } : null;

/**
 * The refusal of a walk past `WHOLE_WALK_ROWS`, or `null` for one inside it. IT SAYS LENGTH AND NOT TIME, because on
 * the host this is for no time was seen to pass. The way out is the same one, so the fix ends as `wholeLate`'s does.
 */
export const wholeLong = (rows: number): Refusal | null =>
  rows > WHOLE_WALK_ROWS ? { code: 'OUT_OF_BOUNDS', fix: 'This is too long to add up on a page. Narrow this with a where: so it adds up fewer.', at: 'where' } : null;

/** What a stored value adds: its number and the currency or unit it is in, or `null` for a value that is not an amount. */
function amountIn(v: unknown): { n: number; unit: string | null } | null {
  if (typeof v === 'number') return Number.isFinite(v) ? { n: v, unit: null } : null;
  if (typeof v === 'string') return v.trim() !== '' && Number.isFinite(Number(v)) ? { n: Number(v), unit: null } : null;
  if (v === null || typeof v !== 'object') return null;
  const held = v as { amount?: unknown; currency?: unknown; value?: unknown; unit?: unknown };
  if (typeof held.amount === 'number' && Number.isFinite(held.amount)) return { n: held.amount, unit: typeof held.currency === 'string' ? held.currency : null };
  if (typeof held.value === 'number' && Number.isFinite(held.value)) return { n: held.value, unit: typeof held.unit === 'string' ? held.unit : null };
  return null;
}

/**
 * Every row a whole read asks for, as groups: the host's one grouped query when it hands one (`PageDeps.whole`), else
 * the list read to its end a page at a time and grouped here. EITHER WAY IT IS EVERY ROW, and either way it stops at
 * `WHOLE_MS` with the sentence that says to narrow it: a walk checks the clock after each page, so a list too long to
 * add up costs a quarter of a second and never the whole of it. BOTH HOLD A COUNT AS WELL (`wholeLong`), which stops
 * the walk where the clock stands still and refuses a grouped answer whose parts hold more rows than a walk may read.
 */
function wholeParts(deps: PageDeps, ask: WholeAsk, split: string | null = null): Result<WholePart[]> {
  const started = performance.now();
  const late = (): Result<WholePart[]> | null => {
    const refusal = wholeLate(performance.now() - started);
    return refusal ? { ok: false, refusal } : null;
  };
  if (deps.whole) {
    const got = deps.whole(ask);
    if (!got.ok) return got;
    /* THE SAME COUNT AS THE WALK: the rows behind the parts, so a list the browser refuses to count is refused here. */
    const long = wholeLong(got.value.reduce((n, part) => n + (Number.isFinite(part.rows) ? part.rows : 0), 0));
    return long ? { ok: false, refusal: long } : (late() ?? got);
  }
  const groups = new Map<string, WholePart>();
  /* EACH GROUP'S ROWS BY ID, so a split row's parts under one label count it once (`entries`). */
  const ids = new Map<string, Set<string>>();
  let cursor: string | undefined;
  let walked = 0;
  do {
    const page = deps.list({ register: ask.register, where: ask.where, limit: WHOLE_PAGE, ...(cursor ? { cursor } : {}) });
    if (!page.ok) return page;
    walked += page.value.rows.length;
    const long = wholeLong(Math.max(walked, Number.isFinite(page.value.matched) ? page.value.matched : 0));
    if (long) return { ok: false, refusal: long };
    /* A SPLIT ROW ADDS UP AS ITS PARTS, as the host's grouped query reads it (`row-parts.ts`). */
    for (const row of split === null ? page.value.rows : rowsBySplit(page.value.rows, split)) {
      const by = ask.by.map(({ field, day }): Json => {
        const v = row.fields[field];
        if (v === undefined || v === null || v === '') return null;
        return day ? (typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : null) : (v as Json);
      });
      const amount = ask.value === null ? null : amountIn(row.fields[ask.value]);
      const on = ask.dated === null || amount === null ? null : row.fields[ask.dated];
      const day = typeof on === 'string' && on.length >= 10 ? on.slice(0, 10) : null;
      const key = JSON.stringify([by, amount?.unit ?? null, day]);
      const group = groups.get(key) ?? { by, unit: amount?.unit ?? null, day, sum: 0, rows: 0, said: 0, entries: 0 };
      group.rows += 1;
      const seen = ids.get(key) ?? new Set<string>();
      const id = (row as { id?: unknown }).id;
      if (typeof id !== 'string' || id === '' || !seen.has(id)) group.entries = (group.entries ?? 0) + 1;
      if (typeof id === 'string' && id !== '') seen.add(id);
      ids.set(key, seen);
      if (amount) {
        group.sum += amount.n;
        group.said += 1;
      }
      groups.set(key, group);
    }
    cursor = page.value.rows.length > 0 && typeof page.value.cursor === 'string' && page.value.cursor !== '' ? page.value.cursor : undefined;
    const stop = late();
    if (stop) return stop;
  } while (cursor !== undefined);
  return ok([...groups.values()]);
}

/** The types a block adds up: a number, a length of time, money, or a quantity in its unit. */
const SUMMED: ReadonlySet<string> = new Set(['int', 'decimal', 'duration', 'money', 'quantity']);

/** What some rows add up to while they are being gathered: how many, and their amounts by currency and day. */
type Gathered = { rows: number; entries: number; said: number; done: number; bare: number; amounts: Amount[] };
const gathered = (): Gathered => ({ rows: 0, entries: 0, said: 0, done: 0, bare: 0, amounts: [] });
const gather = (into: Gathered, part: WholePart, done: boolean): void => {
  into.rows += part.rows;
  into.entries += part.entries ?? part.rows;
  into.said += part.said;
  if (done) into.done += part.rows;
  if (part.said === 0) return;
  if (part.unit === null) into.bare += part.sum;
  else into.amounts.push({ currency: part.unit, amount: part.sum, day: part.day });
};

/** The first day a heat draws: the Monday eleven weeks before the week `today` is in (`render/src/days.ts` `heatGrid`). */
function heatFrom(today: string): string {
  const at = new Date(`${today}T00:00:00Z`);
  const sinceMonday = (at.getUTCDay() + 6) % 7;
  return new Date(at.getTime() - (sinceMonday + 77) * 86_400_000).toISOString().slice(0, 10);
}

/**
 * How a kind that adds up reads its columns, or `null` when its columns name nothing this can add up (a column that is
 * not a field of the list, or a value that is a list of links, which the host adds up from the rows it is handed).
 *
 *   bar, split   the first column's values, each with the sum of the second, or its rows where there is no second
 *   chips        the first column's values, each with its rows
 *   gauge        one sum of the second column
 *   heat         each day of the first column with the sum of the second, or its rows; `who: true` counts a day a person
 *   progress     the first column's values, each with how many of its rows say yes in the second (a yes or no, or the
 *                list's own status where it says which states are done); any other progress is a track a row, and its
 *                whole is one sum of the second column
 */
function wholeShape(deps: PageDeps, block: PageBlock, register: string, schema: Schema): { by: WholeAsk['by']; value: string | null; done: ((v: Json) => boolean) | null } | null {
  const [first, second] = (block.columns ?? []).map((c) => c.field);
  const typeOf = (f: string | undefined): string | undefined => (f !== undefined && Object.hasOwn(schema.fields, f) ? schema.fields[f]!.type : undefined);
  if ((first !== undefined && typeOf(first) === undefined) || (second !== undefined && typeOf(second) === undefined)) return null;
  const label = first === undefined ? [] : [{ field: first }];
  const summed = second !== undefined && SUMMED.has(typeOf(second)!) ? second : undefined;
  if (block.kind === 'chips') return { by: label, value: null, done: null };
  if (block.kind === 'heat') {
    if (first === undefined) return null;
    if (block.who === true) return second === undefined ? null : { by: [{ field: first, day: true }, { field: second }], value: null, done: null };
    return second !== undefined && summed === undefined ? null : { by: [{ field: first, day: true }], value: summed ?? null, done: null };
  }
  if (block.kind === 'progress' && first !== undefined && second !== undefined && block.spent === undefined && block.toward === undefined && block.range !== true) {
    if (typeOf(second) === 'bool') return { by: [...label, { field: second }], value: null, done: (v) => v === true || v === 1 };
    const states = schema.state === second ? (deps.lists?.().find((l) => l.id === register)?.done ?? []) : [];
    if (states.length > 0) return { by: [...label, { field: second }], value: null, done: (v) => states.includes(String(v)) };
  }
  if (second !== undefined && summed === undefined) return null;
  if (block.kind === 'gauge' || block.kind === 'progress') return { by: [], value: summed ?? null, done: null };
  return { by: label, value: summed ?? null, done: null };
}

/** A bar's or a split's second field for its label (`or:`), a text field of the list, or `null`. */
function orOf(block: PageBlock, schema: Schema, by: WholeAsk['by']): string | null {
  if ((block.kind !== 'bar' && block.kind !== 'split') || by.length !== 1) return null;
  const or = block.columns?.[0]?.or;
  return typeof or === 'string' && or !== by[0]!.field && schema.fields[or]?.type === 'text' ? or : null;
}

/** A BANK'S DAY AT THE HEAD OF ITS LINE ("19OCT26 "), which is no part of a name. */
const BANK_STAMP = /^\d{1,2}(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d{2}(?:\d{2})?\s+(?=\S)/iu;

/** A name as two lines are matched on: no bank day before it, one space between words, any case. */
const nameKey = (v: string): string => v.replace(BANK_STAMP, '').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en');

/**
 * A kind that adds up, over every row its scope and `where` admit: the parts by label and the total, or
 * `null` when its columns name nothing to add up. `whole` is a heat's `of:` as a predicate, `null` when it has none.
 *
 * MONEY IS ADDED UP AS A FIGURE ADDS IT (`fx.ts` `across`): in the home currency at each amount's own day's rate when
 * the record has one and the rates reach, else in the rows' one currency, else one amount a currency and no number.
 * Two currencies are never one sum, in a part or in the total.
 *
 * A PART WHOSE ROWS HOLD NOTHING TO ADD IS LEFT OUT, as a bar with nothing sized has no bar: a zero would say it holds
 * none. Its rows are still in every count.
 */
function wholeOf(deps: PageDeps, block: PageBlock, register: string, schema: Schema, where: Predicate | undefined, whole: Predicate | undefined | null): Result<WholeRead | null> {
  const shape = wholeShape(deps, block, register, schema);
  if (!shape) return ok(null);
  const money = shape.value !== null && schema.fields[shape.value]?.type === 'money';
  const held = money ? deps.ctx.fx?.() : undefined;
  const home = held?.home ?? null;
  const today = localDays(readableZone(deps.ctx.tz ?? deps.tz))(deps.ctx.asOfMs ?? deps.ctx.nowMs);
  /* A BAR'S LABEL HAS A SECOND FIELD TO READ WHERE IT HOLDS NOTHING (`or:` on its first column), read only where its
     words name a label the first field already holds (live check of 30 October, 10): Reports' "Paid most" counted only
     the lines a payee was put on, so Ahmed Emad read 1,501.50 beside two lines of his own of 15,015 and 23,020 that
     named him in the bank's words alone. A line whose words name nobody known stays with the rows that hold none. */
  const or = orOf(block, schema, shape.by);
  const by = or === null ? shape.by : [...shape.by, { field: or }];
  /* A TALLY: GROUPED BY DAY AS WELL, as money converted a day at a time already is, so each part knows its newest day. */
  const tally = block.kind === 'bar' && block.tally === true && money;
  const ask = (w: Predicate | undefined) =>
    wholeParts(deps, { register, where: w, by, value: shape.value, dated: money && (home !== null || tally) ? datedBy(schema.fields) : null }, splitOf(schema)?.of === shape.value ? splitOf(schema)!.field : null);
  type Figure = Pick<WholeRow, 'value' | 'unit' | 'parts'> & { converted?: { asOf: string; stale: boolean } };
  const figure = (g: Gathered): Figure => {
    if (shape.value === null) return { value: shape.done ? g.done : g.rows };
    if (g.amounts.length === 0) return { value: g.bare };
    const a = across(g.amounts, home, held?.rates ?? [], today, home !== null);
    if (a.kind === 'parts') return { value: null, parts: a.parts };
    /* AT LEAST IS NOT A TOTAL (`fx.ts` `atleast`): a part or a total that left an amount out for want of a rate is one
       amount a currency, unconverted, as it was before a sum could say at least. No reader of a whole draws the mark
       yet, and a lower bound with no mark is wrong money on a screen. */
    if (isAtLeast(a)) return { value: null, parts: partsOf(g.amounts) };
    return { value: a.amount, ...(a.currency ? { unit: a.currency } : {}), ...(a.kind === 'converted' ? { converted: { asOf: a.asOf, stale: a.stale } } : {}) };
  };

  const read = ask(where);
  if (!read.ok) return read;
  const known = new Map<string, Json>();
  if (or !== null) for (const part of read.value) if (typeof part.by[0] === 'string' && part.by[0].trim() !== '' && !known.has(nameKey(part.by[0]))) known.set(nameKey(part.by[0]), part.by[0]);
  /* A TALLY NAMES A LINE BY ITS SECOND FIELD'S OWN WORDS where they name nobody known (audit 2 B5): Payees left out
     Paperhaus Supplies, seven lines the Ledger draws by that name, and counted them as "Not named yet". So a tally is
     who was paid as the lines say it, each name once however it is spelt (the first spelling read), and what stays
     unnamed is a line that holds no words in either field. Any other bar keeps the rule above. */
  const named = (words: string): Json => {
    if (!tally || words.trim() === '') return null;
    const key = nameKey(words);
    if (!known.has(key)) known.set(key, words.trim());
    return known.get(key) ?? null;
  };
  const heat = block.kind === 'heat';
  const from = heat ? heatFrom(today) : '';
  const drawn = (label: Json): label is string => typeof label === 'string' && label >= from && label <= today;
  const total = gathered();
  const byLabel = new Map<string, { label: Json; who?: Json; sum: Gathered; last?: string }>();
  let outside = 0;
  /* AND THE DAYS OUTSIDE THE WINDOW, EACH ONCE (`outsideDays`): a host says "N days fall outside the twelve weeks", and
     forty entries on one old day are one day. An entry holding no day is no day at all: it is in `outside`, which is
     what the cells fall short of the total by, and not in the days. */
  const outsideDays = new Set<string>();
  for (const part of read.value) {
    const done = shape.done ? shape.done(part.by[1] ?? null) : false;
    gather(total, part, done);
    if (shape.by.length === 0) continue;
    const own = part.by[0] ?? null;
    const label = (own === null || own === '') && or !== null && typeof part.by[1] === 'string' ? (known.get(nameKey(part.by[1])) ?? named(part.by[1])) : own;
    if (heat && !drawn(label)) {
      outside += part.rows;
      if (typeof label === 'string') outsideDays.add(label);
      continue;
    }
    const who = heat && shape.by.length === 2 ? { who: part.by[1] ?? null } : {};
    const key = JSON.stringify([label, 'who' in who ? who.who : 0]);
    const at = byLabel.get(key) ?? { label, ...who, sum: gathered() };
    gather(at.sum, part, done);
    if (tally && part.day !== null && (at.last === undefined || part.day > at.last)) at.last = part.day;
    byLabel.set(key, at);
  }

  /* A HEAT'S `of:` IS EACH DAY'S WHOLE, read the same way over what the `of:` admits, so a day's wash is a share. */
  const wholes = new Map<string, Gathered>();
  const every = gathered();
  if (heat && whole !== null) {
    const all = ask(whole);
    if (!all.ok) return all;
    for (const part of all.value) {
      gather(every, part, false);
      const label = part.by[0] ?? null;
      if (!drawn(label)) continue;
      const at = wholes.get(label) ?? gathered();
      gather(at, part, false);
      wholes.set(label, at);
    }
  }

  const said = (g: Gathered): boolean => shape.value === null || g.said > 0;
  const text = (v: Json): string => (typeof v === 'string' ? v : JSON.stringify(v));
  const parts = [...byLabel.values()].filter((g) => said(g.sum)).map((g) => ({ ...g, figure: figure(g.sum) }));
  if (heat) parts.sort((a, b) => text(a.label).localeCompare(text(b.label)) || text(a.who ?? null).localeCompare(text(b.who ?? null)));
  else parts.sort((a, b) => (b.figure.value ?? -Infinity) - (a.figure.value ?? -Infinity) || b.sum.rows - a.sum.rows || text(a.label).localeCompare(text(b.label)));
  const kept = heat ? parts : parts.slice(0, WHOLE_PARTS);
  const rows = kept.map(({ label, who, sum, last, figure: { converted: _at, ...f } }): WholeRow => {
    const share = heat && whole !== null ? { of: figure(wholes.get(label as string) ?? gathered()).value } : shape.done ? { of: sum.rows } : {};
    /* ROWS, NOT PARTS: a payee's one payment split over three categories is one row of his (`entries`, R14). */
    return { label, ...(who === undefined ? {} : { who }), rows: sum.entries, ...f, ...share, ...(last === undefined ? {} : { last }) };
  });
  const past = parts.slice(kept.length);
  const tail = gathered();
  for (const g of past) {
    tail.rows += g.sum.rows;
    tail.entries += g.sum.entries;
    tail.said += g.sum.said;
    tail.done += g.sum.done;
    tail.bare += g.sum.bare;
    tail.amounts.push(...g.sum.amounts);
  }
  const { converted: _rest, ...rest } = figure(tail);
  return ok({
    rows,
    ...figureTotal(figure(total)),
    ...(heat && whole !== null ? { of: figure(every).value } : shape.done ? { of: total.rows } : {}),
    ...(past.length > 0 ? { rest: { labels: past.length, rows: tail.entries, ...rest } } : {}),
    ...(heat ? { outside, outsideDays: outsideDays.size } : {}),
  });
}

/** A figure as a whole read's total says it: `total` where a part says `value`. */
const figureTotal = ({ value, ...rest }: { value: number | null; unit?: string; parts?: Part[]; converted?: { asOf: string; stale: boolean } }): Pick<WholeRead, 'total' | 'unit' | 'parts' | 'converted'> => ({ total: value, ...rest });

/**
 * A project's rows, then the rows that apply everywhere.
 *
 * `inScope` DECIDES WHAT IS HIDDEN, so the page and a run's context cannot disagree about which
 * global row a project's row replaces. It does not take a predicate, so the rows themselves come from
 * `list`, and what `inScope` contributes is the set of titles a project row has claimed.
 */
function listInherited(
  deps: PageDeps,
  register: string,
  scope: { field: string; to: string },
  predicate: Predicate | undefined,
  limit: number,
  order: PageBlock['order'],
): Result<Listed> {
  const reach = everywhereOf(deps, register, scope, predicate);
  if (!reach.ok) return reach;
  const everywhere = reach.value;

  const sorted = order?.length ? { order } : {};
  const own = deps.list({ register, where: predicate, limit, ...sorted });
  if (!own.ok) return own;
  const room = limit - own.value.rows.length;
  /* ASKED EVEN WITH NO ROOM, because `matched` is what the total is a total of. */
  const global = deps.list({ register, where: everywhere, limit: Math.max(1, room), ...sorted });
  if (!global.ok) return global;
  const tail = global.value.rows.slice(0, Math.max(0, room));
  return ok({ rows: [...own.value.rows, ...tail], matched: own.value.matched + global.value.matched, inherited: tail.length });
}

/**
 * A `bar` or a `split` over a figure grouped by a word: the reading, whose parts the host draws.
 *
 * A DATE CUT INTO BUCKETS IS A SERIES, not parts of a whole, so only a figure grouped by a word is read here.
 */
function metricBlock(deps: PageDeps, block: PageBlock, id: string, base: BlockResult, also: (...r: Refusal[]) => Refusal[]): BlockResult {
  if (block.kind !== 'bar' && block.kind !== 'split')
    return { ...base, refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: `A ${block.kind} does not read a figure yet; a bar or a split does.`, at: 'source' }) };
  /* A FIGURE'S PARAMETER IS SPLIT OFF AT THE FIRST COLON, as a figure cell's is, so a split on a project page
     over `metric.<cost>:{{name}}` draws that project's parts. The refusal names the figure, never the parameter. */
  const colon = id.indexOf(':');
  const name = colon < 0 ? id : id.slice(0, colon);
  const named = deps.metric(name);
  if (!named) return { ...base, refusals: also({ code: 'METRIC_UNKNOWN', fix: `There is no metric called ${name}.`, at: 'source' }) };
  const decl = colon < 0 ? named : (fill(named, null, id.slice(colon + 1)) as MetricDecl);
  /* A FIGURE OF THE LOG IS CUT BY `activity:` (who, kind or hour) AND CARRIES NO `group_by`, yet its reading is parts
     of a whole all the same, so it is let through beside a figure grouped by a word. */
  if ((typeof decl.group_by !== 'string' && decl.source !== RECORD_ACTIVITY) || decl.bucket !== undefined)
    return {
      ...base,
      refusals: also({ code: 'DECLARATION_INVALID', fix: `A ${block.kind} over a figure draws its parts, so ${name} groups by a word, and a date cut into buckets is a series.`, at: 'source' }),
    };
  const read = deps.read(decl);
  if (!read.ok) return { ...base, refusals: refused(read) ? also(read.refusal) : also() };
  if (read.value.refusals.length) return { ...base, refusals: also(...read.value.refusals) };
  return { ...base, readings: [{ metric: id, reading: read.value }], matched: read.value.groups?.length ?? 0 };
}

/** The cells of the row a ring over a register counts, in the order `ringPlan` reads one row: `label | value | target`. */
const RING_COLUMNS = [{ field: 'label' }, { field: 'value' }, { field: 'target' }];

/**
 * A `ring` over a register: ONE ROW OF PROGRESS, the rows its `where` matches against the rows its scope admits.
 *
 * THE WHOLE IS THE BLOCK'S SCOPE AND THE `where` IS THE PART, which is the owner's call. The first cut set every ring
 * against every row of the list, so `list is work, state is done` over 4 work chores (2 done) and 96 home ones drew 2%,
 * where the work list is half done. The sentence does not say which of its clauses is the whole, so the record does not
 * guess: without `of:` the whole is the list, or the page's project and the rows that apply everywhere when the block
 * inherits, and 2 of 100 is the right answer to the block as written. `of: list is work` says the other whole and draws
 * 2 of 4. The part is counted inside the whole, `where` and `of` together, so a part can never be larger than its
 * whole.
 *
 * THE LIST READ WAS THE WRONG QUESTION. Measured on ten tasks with three done, `where: state is done` answered the
 * three done rows, and `ringPlan` reads two to five rows as PARTS of a whole, so the dial set the done tasks
 * against each other and the seven open ones were nowhere on it. What a person means by a ring over a list is how
 * far along it is, and the whole it is set against is not a row to draw.
 *
 * TWO COUNTS AND NO ROWS, so it has no ceiling. Both come from `matched`, which `list` answers over the whole
 * predicate whatever the page it hands back, which is why `ring` is not in `SUMS` and a ring over 250 tasks draws.
 *
 * THE ROW'S COLUMNS ARE THE RECORD'S, answered on the block, because no field of the register holds a count. A
 * block that names columns of its own is refused rather than drawn with them ignored: they would say the ring
 * reads fields it never looks at.
 *
 * THE LABEL IS THE BLOCK'S TITLE. The first cut wrote the raw `where` into it, so the words beside the dial and the
 * dial's spoken name read `list is work, state is done: 2 of 100`. A block with no heading is labelled with the
 * list's id, which is at least a name the author wrote.
 */
function ringOf(
  deps: PageDeps,
  block: PageBlock,
  register: string,
  schema: Schema,
  predicate: Predicate | undefined,
  scope: { field: string; to: string } | null,
  base: BlockResult,
  also: (...r: Refusal[]) => Refusal[],
): BlockResult {
  if (block.columns?.length)
    return {
      ...base,
      refusals: also({
        code: 'DECLARATION_INVALID',
        fix: `A ring over ${register} draws one row it counts, the rows where: matches against all of them, so it takes no columns:.`,
        at: 'columns',
      }),
    };
  /* A NUMBER OR A LIST IN `of:` WAS REFUSED AT `where`. `predicateOf` passes anything that is not a string on as a
     predicate, the list read then refused `of: 5` as `VALUE_MALFORMED`, and the key it read that refusal from was
     the `where`, which was fine. A group or a leaf is let through, as `where` lets one through. */
  const shape = block.of as unknown;
  if (shape !== undefined && typeof shape !== 'string' && (typeof shape !== 'object' || shape === null || Array.isArray(shape)))
    return {
      ...base,
      refusals: also({ code: 'VALUE_MALFORMED', fix: `of: is a sentence over ${register}, such as list is work.`, at: 'of' }),
    };
  const whole = predicateOf(block.of, schema, deps.ctx);
  if (whole.bad.length) return { ...base, refusals: also(...whole.bad.map((r) => ({ ...r, at: 'of' }))) };

  const clauses = (p: Predicate | undefined): Predicate[] =>
    p === undefined ? [] : Array.isArray((p as { all?: unknown }).all) ? (p as { all: Predicate[] }).all : [p];
  const joined = (cs: Predicate[]): Predicate | undefined => (cs.length === 0 ? undefined : cs.length === 1 ? cs[0] : { all: cs });
  const wanted = clauses(whole.predicate);
  const said = clauses(predicate);
  /* THE PROJECT CLAUSE IS THE SCOPE, so an inheriting ring's whole keeps it and drops the rest of the `where`.
     `listInherited` refuses a `where` that names no project, which is the sentence a table that inherits gets. */
  const home = scope ? said.find((n) => (n as Leaf).field === scope.field && typeof (n as Leaf).is === 'string') : undefined;
  const count = (cs: Predicate[]): Result<Listed> =>
    scope ? listInherited(deps, register, scope, joined(cs), 1, undefined) : deps.list({ register, ...(cs.length ? { where: joined(cs) } : {}), limit: 1 });

  const done = count([...said, ...wanted]);
  if (!done.ok) return { ...base, refusals: refused(done) ? also(done.refusal) : also() };
  const all = count([...(home ? [home] : []), ...wanted]);
  if (!all.ok) return { ...base, refusals: refused(all) ? also(all.refusal) : also() };
  const at = new Date(deps.ctx.nowMs).toISOString();
  const row: Entry = {
    id: `${register}#ring`,
    register,
    seq: null,
    fields: { label: block.heading?.trim() || register, value: done.value.matched, target: all.value.matched },
    state: null,
    version: 0,
    created_at: at,
    updated_at: at,
    deleted_at: null,
  };
  /* `matched` IS THE ONE ROW DRAWN, so a drawer that prints "Showing 1 of 3" under a slice sees no slice here. */
  return { ...base, columns: RING_COLUMNS, rows: [row], matched: 1 };
}

/**
 * What a `progress` budget spent, as the figure it names: grouped by a word, never cut into date buckets, because each
 * part is set against the row whose value is its key.
 */
function spentOf(deps: PageDeps, id: unknown, at = 'spent'): { readings: NonNullable<BlockResult['readings']> } | { refusal: Refusal } | Record<string, never> {
  if (typeof id !== 'string' || id === '')
    return { refusal: { code: 'DECLARATION_INVALID', fix: `${at}: names a figure grouped by a word, such as spent-this-month.`, at } };
  const decl = deps.metric(id);
  if (!decl) return { refusal: { code: 'METRIC_UNKNOWN', fix: `There is no metric called ${id}.`, at } };
  if (typeof decl.group_by !== 'string' || decl.bucket !== undefined)
    return { refusal: { code: 'DECLARATION_INVALID', fix: `A progress block sets each row against a part of ${id}, so it groups by a word, and a date cut into buckets is a series.`, at } };
  const read = deps.read(decl);
  if (!read.ok) return refused(read) ? { refusal: read.refusal } : {};
  if (read.value.refusals.length) return { refusal: read.value.refusals[0]! };
  return { readings: [{ metric: id, reading: read.value }] };
}

/** The column that says who changed a row last. A register's own field of that name wins. */
const CHANGED = 'changed';

/** How long a change made for the reader wears its byline on a page: a week. */
const BYLINE_MS = 7 * 86_400_000;

/** A change somebody made for the reader rather than by their own hand: a run, an agent, Slash, a rule or an import. */
const madeFor = (actor: string): boolean =>
  /^S\d+$/.test(actor) || actor.startsWith('agent:') || actor === 'slash' || actor.startsWith('rule:') || actor.startsWith('ingest:');

/**
 * Who changed each row last, aligned with `rows`: the newest event, its kind of actor, and when, with the batch Undo puts
 * back and, for a run, what the run is.
 *
 * ON EVERY BLOCK OF A LIST, for the byline (trust): a row changed for the reader in the last week carries
 * its change and every other row is `null`, and a block with none answers no `changes`. A `changed` column asked for
 * every row's, whoever made it, and gets them.
 */
function changesOf(deps: PageDeps, register: string, rows: readonly Entry[], every: boolean): { changes?: (RowChange | null)[] } {
  /* A HOST WITHOUT THE ONE-QUERY READ pays a history read a row only where a `changed` column asked for one. */
  if (!deps.lastChanges && (!deps.history || !every)) return {};
  const read = deps.lastChanges?.(rows.map((r) => r.id));
  const seen = deps.reader?.seen;
  const since = deps.ctx.nowMs - BYLINE_MS;
  const changes = rows.map((r): RowChange | null => {
    let last: LastChange | undefined = read?.get(r.id);
    if (!read) {
      const events = r.seq === null ? undefined : deps.history?.(register, `${register}#${r.seq}`);
      const newest = events?.ok ? events.value.at(-1) : undefined;
      last = newest ? { actor: newest.actor, ts: newest.ts, batch: null } : undefined;
    }
    if (!last) return null;
    if (!every && !(madeFor(last.actor) && Date.parse(last.ts) >= since)) return null;
    return {
      by: byOf(last.actor),
      who: last.actor,
      at: last.ts,
      ...(last.batch ? { batch: last.batch } : {}),
      ...(/^S\d+$/.test(last.actor) ? { run: last.actor } : {}),
      ...(last.agent ? { agent: last.agent } : {}),
      ...(last.app ? { app: last.app } : {}),
      ...(last.for ? { for: last.for } : {}),
      ...(typeof seen === 'string' ? { unseen: last.ts > seen } : {}),
    };
  });
  return every || changes.some((c) => c !== null) ? { changes } : {};
}

/**
 * Whether an agent is on each row right now, aligned with `rows`.
 *
 * NOT WHO CHANGED THE ROW LAST, WHETHER THAT ACTOR IS STILL AT IT, which is a different question and
 * the reason this is not read off `changes`. Only an agent has a run to be at, so a row last touched
 * by a person or a rule answers `false` before the runs are read at all.
 *
 * THEN TWO CLOCKS AND NOT ONE. The touch itself has to sit inside `WORKING_MS`, because an agent that
 * is still running does not mean it is still on the row it wrote three hours ago; and the run the
 * write was signed by has to be working, which `presenceOf` says and nothing here works out again.
 * A helper counts: it is folded under its parent on `sessions.working`, but the row is still its own.
 *
 * THE JOIN IS THE RUN'S NAME AND NOT THE AGENT'S. `30 §3`: an agent's write is signed by its run,
 * `event.actor = 'S42'`, because three agents under one token are three runs and the question worth
 * answering later is which RUN wrote the row. Joining on `session.agent` instead would have marked
 * every row Claude touched today as worked on the moment any Claude run was open.
 */
function workingOf(deps: PageDeps, register: string, rows: readonly Entry[]): boolean[] {
  const now = deps.ctx.nowMs;
  const live = new Set(
    (deps.sessionsLive?.() ?? [])
      /* WORKING, which is narrower than `sessions.live`'s own "not finished": an idle run has stopped, and an active
         one nobody has heard from inside the window has gone quiet. Neither is somebody working on a row now. */
      .filter((run) => presenceOf(run, now) === 'working' && run.seq !== null)
      .map((run) => `${SESSION_PREFIX}${String(run.seq)}`),
  );
  if (live.size === 0) return rows.map(() => false);
  return rows.map((r) => {
    const events = r.seq === null ? undefined : deps.history?.(register, `${register}#${r.seq}`);
    const last = events?.ok ? events.value.at(-1) : undefined;
    if (!last || byOf(last.actor) !== 'agent') return false;
    return now - Date.parse(last.ts) < WORKING_MS && live.has(last.actor);
  });
}

/**
 * HOW FAR ALONG EACH CARD IS, when its ring's field is empty and a list declares steps of this one: the share of its steps
 * done. Absent when no ring would take one, so a page with nothing to derive answers as it did.
 */
function ringsOf(deps: PageDeps, block: PageBlock, register: string, rows: readonly Entry[]): { rings?: (number | null)[] } {
  const ring = block.kind === 'cards' ? block.columns?.find((c) => c.as === 'ring') : undefined;
  if (!ring || !deps.stepsOf || rows.every((r) => typeof r.fields[ring.field] === 'number')) return {};
  const lists = deps.stepsOf(register);
  if (lists.length === 0) return {};
  const tally = new Map<string, { done: number; total: number }>();
  for (const list of lists) {
    const read = everyRow(deps, list.register, undefined);
    if (read.ok) tallySteps(read.value.rows, list, tally);
  }
  const rings = rows.map((r) => (typeof r.fields[ring.field] === 'number' ? null : stepsPercent(tally.get(r.id))));
  return rings.some((v) => v !== null) ? { rings } : {};
}

/**
 * Where each row applies, aligned with `rows`: the title of its project and that project's mark and hue, or `null` in
 * both for a row that applies everywhere.
 *
 * THE MARK IS READ FROM THE SAME ROWS AS THE TITLE, so a chip and the name beside it never come from two reads. A row
 * that names several projects is titled by all of them and marked by the first, because a chip draws one mark.
 */
function scopesOf(
  deps: PageDeps,
  rows: readonly Entry[],
  scope: { field: string; to: string },
): { scopes: (string | null)[]; scope_marks: ({ mark: string | null; hue: number | null } | null)[] } {
  const said = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' ? [v] : []);
  const ids = [...new Set(rows.flatMap((r) => said(r.fields[scope.field])))];
  const title = deps.titleOf(scope.to);
  const listed = ids.length && title ? deps.list({ register: scope.to, where: { field: 'id', in: ids }, limit: 200 }) : null;
  const found = new Map(listed?.ok ? listed.value.rows.map((r) => [r.id, r] as const) : []);
  const identity = deps.identityOf?.(scope.to) ?? null;
  return {
    scopes: rows.map((r) => {
      const at = said(r.fields[scope.field]);
      return at.length ? at.map((id) => (found.has(id) ? String(found.get(id)!.fields[title!] ?? id) : id)).join(', ') : null;
    }),
    scope_marks: rows.map((r) => {
      const first = said(r.fields[scope.field])[0];
      return first === undefined ? null : markOf(found.get(first), identity);
    }),
  };
}

/**
 * A project's mark and hue, by the fields its list names in `identity:`, or `null` in each half it does not hold.
 *
 * A HUE IS A WHOLE DEGREE FROM 0 TO 359 OR NOTHING, because a host draws it straight into a colour and a value outside
 * the wheel would be a colour nobody chose. OWN PROPERTIES ONLY, as everywhere a declaration names a field.
 */
function markOf(row: Entry | undefined, identity: { mark?: string; accent?: string } | null): { mark: string | null; hue: number | null } {
  const at = (field: string | undefined): Json | undefined => (row && field !== undefined && Object.hasOwn(row.fields, field) ? row.fields[field] : undefined);
  const mark = at(identity?.mark);
  const hue = at(identity?.accent);
  return {
    mark: typeof mark === 'string' && mark.trim() !== '' ? mark : null,
    hue: typeof hue === 'number' && Number.isInteger(hue) && hue >= 0 && hue <= 359 ? hue : null,
  };
}

/* ── activity ────────────────────────────────────────────────────────────── */

/** Who `@braindog/seed` writes a sample as, which the app names BrainDog (`names.ts`). */
export const SEED_ACTOR = 'p_seed';

/**
 * The kind of actor behind an event, by `30 §3`'s grammar.
 *
 * A run and a token are agents, and so is `slash`; a rule, an ingest and the record's own work are
 * rules, because nobody chose them at that moment. Anything else is a person.
 *
 * THE SAMPLE'S OWN HAND (`SEED_ACTOR`) IS THE RECORD'S WORK TOO. It wrote every row a sample opens with, and its lines sat
 * under "You" on a record nobody had touched yet, the backup the night run missed among them.
 */
export function byOf(actor: string): FeedBy {
  if (/^S\d+$/.test(actor) || actor.startsWith('agent:') || actor === 'slash') return 'agent';
  /* A SCRIPT'S RUN (`script:<id>@v<n>`) is a mechanism's, as a rule's is, never the person's. */
  if (actor.startsWith('rule:') || actor.startsWith('ingest:') || actor.startsWith('script:') || actor === 'system' || actor === SEED_ACTOR) return 'rule';
  return 'you';
}

/** What reads a run by its handle, `PageDeps.runOf`. */
type RunReader = NonNullable<PageDeps['runOf']>;

/** A field of a run's row as words, or `null` where it holds none. */
const saidText = (v: Json | undefined): string | null => (typeof v === 'string' && v !== '' ? v : null);

/** Who the run `run` is, from its own row: `agentOf` reads the kind of agent from its app where the run said none. */
export function runByOf(run: string, entry: Entry | null): RunBy | null {
  if (!entry) return null;
  const agent = saidText(entry.fields.agent);
  const client = saidText(entry.fields.client);
  const kind = agentOf({ ...(agent === null ? {} : { agent }), ...(client === null ? {} : { client }) }).agent;
  return { run, agent: kind === undefined || kind === '' ? 'other' : kind, client, parent: saidText(entry.fields.parent) };
}

/**
 * What a row by `who` says of its run: `run_by` where `who` is a run's handle, and nothing where it is anybody else or
 * the host reads no runs. EACH RUN IS READ ONCE, since a run that worked for an hour signed most of the feed.
 */
function runsBy(runOf: RunReader | undefined): (who: string | null) => { run_by?: RunBy | null } {
  const read = new Map<string, RunBy | null>();
  return (who) => {
    if (!runOf || who === null || !/^S\d+$/.test(who)) return {};
    if (!read.has(who)) read.set(who, runByOf(who, runOf(who)));
    return { run_by: read.get(who) ?? null };
  };
}

/** A run's handle, `S42`, which is what signs a run's lines. */
const RUN_HANDLE = /^S\d+$/u;

/**
 * What a `feed` block said of its days and its runs, and the zone its days are counted in.
 *
 * `group: 'day'` AND `fold: 'run'` ARE THE ONLY WORDS (`block-keys.ts` `feedSaysFault`), and `zone` is the record's own,
 * an IANA name, `UTC` when it is absent or names no zone.
 */
export type FeedSays = { group?: 'day'; fold?: 'run'; zone?: string | undefined };

/**
 * The day an event was written, in `zone`: a write at 23:30 UTC is the next day in Cairo. A stamp that is no instant
 * answers its own first ten characters, so one bad line never throws a whole feed away.
 */
function feedDays(zone: string | undefined): (ts: string) => string {
  const days = localDays(readableZone(zone));
  return (ts) => {
    const ms = Date.parse(ts);
    return Number.isNaN(ms) ? ts.slice(0, 10) : days(ms);
  };
}

/** Whether a rule's line may take `e` in as one more row: the same rule, the same kind of write, no words of its own. */
const foldsInto = (last: FeedRow, e: ActivityEvent): boolean =>
  last.by === 'rule' &&
  last.who === e.actor &&
  last.kind !== null &&
  last.kind === e.kind &&
  (last.note === null || last.note.trim() === '') &&
  (e.note === null || e.note.trim() === '') &&
  typeof last.thing === 'string' &&
  typeof e.thing === 'string' &&
  listOf(last.target) !== null &&
  listOf(last.target) === listOf(e.target);

/**
 * Events, newest first, as feed rows: a run of events by one actor, of one kind, on one target is
 * one row with a count, and past `first` rows a group's remainder is one row, so no count is lost.
 *
 * AND A RULE'S RUN OVER SEVERAL ROWS OF ONE LIST IS ONE ROW TOO, naming each row in `things`. "Since you were away"
 * read "TALLYARD categorised" six times down the page, one line a payment the rule filed in the same moment; it is one
 * line now, and the host words it (`Categorised 6 payments: Tallyard, Northern Rail and 4 more`). Only a rule's, and
 * only where neither line wrote words of its own: a note a rule wrote is that row's, and a person's or an agent's
 * edits to different rows are different work.
 *
 * `says` IS WHAT THE BLOCK SAID OF ITS DAYS AND ITS RUNS (`FeedSays`), and a feed that said neither is answered as it
 * always was. With `group: day` every row says its `day` and nothing is one row across midnight: not a burst, not a
 * rule's run, not a remainder. With `fold: run` a run's lines are one row, its newest, and `run_more` counts the rest;
 * with both, one row a run a day. A person's, a rule's and a token's lines are never folded by it, and a run's line
 * between two of theirs still parts them, as it does unfolded.
 */
export function feedRows(events: readonly ActivityEvent[], first?: number, runOf?: RunReader, says?: FeedSays): FeedRow[] {
  const bursts: FeedRow[] = [];
  const runBy = runsBy(runOf);
  const dayOf = says?.group === 'day' ? feedDays(says.zone) : null;
  const folding = says?.fold === 'run';
  /* THE ROWS EACH FOLDED LINE NAMES, by target, so a row the rule wrote twice is named once. */
  const named = new Map<FeedRow, Set<string | null>>();
  /* THE ONE ROW EACH RUN IS ANSWERED AS, a day where the feed groups by day. */
  const runs = new Map<string, FeedRow>();
  /* THE ROW THE NEXT LINE MAY JOIN: the newest, unless a line folded into an older row came between. */
  let last: FeedRow | undefined;
  for (const e of events) {
    const day = dayOf?.(e.ts);
    const held = folding && RUN_HANDLE.test(e.actor) ? runs.get(`${e.actor} ${day ?? ''}`) : undefined;
    if (held && !(held === last && (held.run_more ?? 0) === 0 && held.kind === e.kind && held.target === e.target)) {
      held.run_more = (held.run_more ?? 0) + 1;
      last = undefined;
      continue;
    }
    if (last && last.day !== day) last = undefined;
    if (last && last.who === e.actor && last.kind === e.kind && last.target === e.target) last.count += 1;
    else if (last && foldsInto(last, e)) {
      const seen = named.get(last) ?? new Set([last.target]);
      named.set(last, seen);
      last.count += 1;
      if (!seen.has(e.target)) {
        seen.add(e.target);
        last.things = [...(last.things ?? [last.thing as string]), e.thing as string];
      }
    } else {
      last = {
        by: byOf(e.actor),
        who: e.actor,
        count: 1,
        kind: e.kind,
        target: e.target,
        note: e.note,
        at: e.ts,
        ...(e.thing === undefined ? {} : { thing: e.thing }),
        ...(e.rows === undefined ? {} : { rows: e.rows }),
        ...runBy(e.actor),
        ...(day === undefined ? {} : { day }),
      };
      if (folding && RUN_HANDLE.test(e.actor)) {
        last.run_more = 0;
        runs.set(`${e.actor} ${day ?? ''}`, last);
      }
      bursts.push(last);
    }
  }
  if (first === undefined) return bursts;
  const cap = Math.min(50, Math.max(1, Math.floor(first)));
  const kept: FeedRow[] = [];
  /* ONE REMAINDER A GROUP, and a day where the feed groups by day, so a heading's count is that day's own. */
  const rest = new Map<string, FeedRow>();
  const taken = new Map<FeedBy, number>();
  for (const row of bursts) {
    const n = taken.get(row.by) ?? 0;
    taken.set(row.by, n + 1);
    if (n < cap) kept.push(row);
    else {
      /* A FOLDED RUN'S OTHER LINES ARE COUNTED TOO, so no line is lost past `first`. */
      const lines = row.count + (row.run_more ?? 0);
      const folded = rest.get(`${row.by} ${row.day ?? ''}`);
      if (folded) folded.count += lines;
      else
        rest.set(`${row.by} ${row.day ?? ''}`, { by: row.by, who: null, count: lines, kind: null, target: null, note: null, at: row.at, ...(row.day === undefined ? {} : { day: row.day }) });
    }
  }
  const rows = [...kept, ...rest.values()];
  /* EACH DAY'S ROWS SIT TOGETHER, its remainders after its own rows. The sort is stable, and the rows are newest first. */
  return dayOf ? rows.sort((a, b) => (a.day === b.day ? 0 : (a.day ?? '') < (b.day ?? '') ? 1 : -1)) : rows;
}

/**
 * An agent's events, newest first, as rows grouped by WHO did them: a burst is one row with a count, and past
 * `first` rows one agent's remainder is one row that keeps its name, so no count is lost and no agent's work is
 * folded into another's.
 *
 * A RUN'S ROWS SAY WHO THE RUN IS (`run_by`), and so does the row that folds its remainder, which keeps its name.
 */
export function agentRows(events: readonly ActivityEvent[], first?: number, runOf?: RunReader): FeedRow[] {
  const bursts: FeedRow[] = [];
  const runBy = runsBy(runOf);
  for (const e of events) {
    const last = bursts.at(-1);
    if (last && last.who === e.actor && last.kind === e.kind && last.target === e.target) last.count += 1;
    else bursts.push({ by: byOf(e.actor), who: e.actor, count: 1, kind: e.kind, target: e.target, note: e.note, at: e.ts, thing: e.thing ?? null, ...runBy(e.actor) });
  }
  if (first === undefined) return bursts;
  const cap = Math.min(50, Math.max(1, Math.floor(first)));
  const kept: FeedRow[] = [];
  const rest = new Map<string, FeedRow>();
  const taken = new Map<string, number>();
  for (const row of bursts) {
    const who = row.who ?? '';
    const n = taken.get(who) ?? 0;
    taken.set(who, n + 1);
    if (n < cap) kept.push(row);
    else {
      const folded = rest.get(who);
      if (folded) folded.count += row.count;
      else rest.set(who, { by: row.by, who: row.who, count: row.count, kind: null, target: null, note: null, at: row.at, thing: null, ...runBy(row.who) });
    }
  }
  return [...kept, ...rest.values()];
}

/* ── the one-line add ────────────────────────────────────────────────────── */

/**
 * A `capture` over `register:`: the list a new row goes into, and what its `where:` fills that row with.
 *
 * NO ROW IS READ AND NONE IS WRITTEN. The write is the host's, through `oncapture`, at the moment somebody
 * presses Add; what the record answers here is only what the host would otherwise have to work out for
 * itself from a sentence, and two hosts working it out would be two answers. The `where:` is still read
 * against the register, so a filter naming a field the list lacks is refused on the block rather than
 * quietly filling nothing.
 */
function captureBlock(deps: PageDeps, block: PageBlock, base: BlockResult, also: (...more: readonly Refusal[]) => Refusal[]): BlockResult {
  const register = block.register;
  if (typeof register !== 'string' || register === '')
    return { ...base, refusals: also({ code: 'REQUIRED_MISSING', fix: 'A capture names the list it adds to, as register: tasks.', at: 'register' }) };
  const schema = deps.schemaOf(register);
  if (!schema) return { ...base, refusals: also({ code: 'REGISTER_UNKNOWN', fix: `There is no register called ${register}, so a capture has nowhere to add to.`, at: 'register' }) };
  const said = predicateOf(block.where, schema, deps.ctx);
  if (said.bad.length) return { ...base, refusals: also(...said.bad) };
  /* THE SAME SENTENCE READ AGAIN WITH NO TITLE LOOKUP, where a title names no row, so the links left standing are the
     ones it named by a spoken id or a row id (`captureFills` says why only those). */
  const byId = predicateOf(block.where, schema, { ...deps.ctx, refByTitle: undefined, absent: 'no-row' });
  return { ...base, fills: captureFills(said.predicate, schema, deps.titleOf(register), byId.bad.length ? undefined : byId.predicate) };
}

/**
 * The field types an `inputs` block can offer a control for. A ref, a list, a file or a document is not typed into a box.
 *
 * ONLY TYPES THE KERNEL DECLARES (`FIELD_TYPES` in `coerce.ts`). `number`, `pct` and `boolean` sat here beside them,
 * names no field can have, so they admitted nothing and read as if they did. A `quantity` stays out until a host has a
 * box that takes a figure and its unit together; until then it is edited on the row.
 */
const TYPABLE = new Set(['text', 'url', 'email', 'enum', 'int', 'decimal', 'money', 'day', 'instant', 'bool', 'duration']);

/**
 * An `inputs` block over `register:`: one row of the list, and the type of each field it draws.
 *
 * ONE ROW, THE ONE `row:` NAMES OR THE LIST'S FIRST, because a what-if a person types into is a single set of numbers:
 * a price and three costs. Every other block over the list reads the same row after a write, which is how a verdict
 * under `when:` answers the figures as they are typed, and nothing is held in memory that the record does not hold.
 * The write is the host's, through the row writer, as a capture's is.
 */
function inputsBlock(deps: PageDeps, block: PageBlock, base: BlockResult, also: (...more: readonly Refusal[]) => Refusal[]): BlockResult {
  const register = block.register;
  if (typeof register !== 'string' || register === '')
    return { ...base, refusals: also({ code: 'REQUIRED_MISSING', fix: 'Inputs name the list whose row they edit, as register: checks.', at: 'register' }) };
  /* `where:` IS REFUSED, NOT READ, because nothing here read it and the row it seemed to pick was the list's first: a
     block installed with `where: name is Two` wrote, when typed into, row One. `06 §1.1` names the row with `row:`
     alone, so a page installed before `declare.ts` refused the key draws no row to type into rather than the wrong one.
     */
  if (block.where !== undefined)
    return { ...base, refusals: also({ code: 'DECLARATION_INVALID', fix: `Inputs edit the one row that row: names, such as ${register}#2, and read no where:. Name the row with row:.`, at: 'where' }) };
  const schema = deps.schemaOf(register);
  if (!schema) return { ...base, refusals: also({ code: 'REGISTER_UNKNOWN', fix: `There is no register called ${register}, so the inputs have no row to edit.`, at: 'register' }) };
  const fields = (block.columns ?? []).map((c) => c.field);
  /* WITH NO `columns:` THE ROW'S TYPABLE FIELDS ARE DRAWN, and a ref, a list or a file is left out as it is refused when
     named: answering its type handed the host a box to type a row id or a document into. */
  /* AND ONLY THE ONES A PERSON MAY TYPE INTO. A field changed only by an accepted proposal (`by: decide`), one that
     keeps its first value (`immutable`), one the record computes (`derived`) and one the list retired were each drawn
     as a box, and typing into the first was answered `FORBIDDEN approved_price changes only by an accepted proposal`.
     The schema a block reads carries types and not these, so they are read off the list's own declaration; a host that
     hands no `lists` leaves them to the write to refuse. */
  const shut = new Set(
    (deps.lists?.().find((l) => l.id === register)?.fields ?? [])
      .filter((f) => {
        const said = f as { by?: unknown; immutable?: unknown; derived?: unknown; retired?: unknown };
        return said.by === 'decide' || said.immutable === true || said.derived === true || said.retired === true;
      })
      .map((f) => f.id),
  );
  const worked = new Set((deps.lists?.().find((l) => l.id === register)?.fields ?? []).filter((f) => (f as { derived?: unknown }).derived === true).map((f) => f.id));
  const named = fields.length ? fields : Object.keys(schema.fields).filter((f) => TYPABLE.has(schema.fields[f]!.type) && !shut.has(f));
  const unknown = named.filter((f) => !Object.hasOwn(schema.fields, f));
  if (unknown.length)
    return { ...base, refusals: also({ code: 'FIELD_UNKNOWN', fix: `${register} has no field called ${unknown.join(', ')}.`, at: 'columns', allowed: Object.keys(schema.fields) }) };
  const untypable = fields.find((f) => !TYPABLE.has(schema.fields[f]!.type));
  if (untypable !== undefined)
    return {
      ...base,
      refusals: also({
        code: 'DECLARATION_INVALID',
        fix: `${register}'s ${untypable} is a ${schema.fields[untypable]!.type}, and an input is typed text, a number, money, a day, a yes or no, or a choice. Take the column off, or edit it on the row.`,
        at: 'columns',
        allowed: Object.entries(schema.fields).filter(([, s]) => TYPABLE.has(s.type)).map(([f]) => f),
      }),
    };
  let where: Predicate | undefined;
  if (block.row !== undefined) {
    const m = typeof block.row === 'string' ? SPOKEN.exec(block.row) : null;
    if (!m || m[1] !== register)
      return { ...base, refusals: also({ code: 'VALUE_MALFORMED', fix: `row: names a row of ${register} by its spoken id, such as ${register}#1.`, at: 'row' }) };
    where = { field: 'seq', is: Number(m[2]) };
  }
  const got = deps.list({ register, ...(where ? { where } : {}), limit: 1, order: [{ field: 'seq', dir: 'asc' }] });
  if (!got.ok) return { ...base, refusals: refused(got) ? also(got.refusal) : also() };
  return {
    ...base,
    rows: got.value.rows,
    matched: got.value.rows.length,
    types: Object.fromEntries(named.map((f) => [f, schema.fields[f]!.type])),
    ...(named.some((f) => worked.has(f)) ? { derived: named.filter((f) => worked.has(f)) } : {}),
    home: deps.home?.() ?? null,
  };
}

/**
 * The equalities a predicate pins, which a row added under it inherits: `apps/web`'s `inheritedFrom`, read off the
 * record's own parse of the sentence rather than off the browser's.
 *
 * AS NARROW AS THE GRID'S ADD, and each exclusion is a value nobody chose written in silence:
 *
 *   `is` WITH ONE VALUE, at the top of the predicate or inside a top-level `all`. `state is open or doing` names a
 *   set, and picking one member for somebody is a guess stored as if they had said it. Anything under `any` or
 *   `none` is the same guess one level down.
 *
 *   ENUM AND TEXT, AND A LINK NAMED BY ITS ID. A day filter is usually a moving word (`by before today`). A link named
 *   by a title is resolved to a row id here but not by the sample engine, which reads the reader's prose, and a title
 *   is a guess at a row besides, so it is not preset. A link named by its spoken id (`about is parts#2`, which is what a
 *   template's `{{spoken}}` writes) or its row id names exactly one row in any engine, and is preset: without it a
 *   pad filtered to one part hid every note typed beside it (measured on a pack with a page per part).
 *   `byId` is the sentence read with no title lookup, and a link is preset only where it reads the same row there.
 *
 *   NEVER THE TITLE, because the title is what the person is typing.
 *
 * THE VALUE IS THE STORED ONE. The parse has already turned `Later` into `backlog`, so the host writes what the
 * record keeps rather than what the page prints.
 */
function captureFills(predicate: Predicate | undefined, schema: Schema, title: string | null, byId: Predicate | undefined): Record<string, string> {
  if (predicate === undefined) return {};
  const leavesOf = (p: Predicate): Predicate[] => ('all' in p && Array.isArray(p.all) ? p.all : [p]);
  /* ONE ROW, BY ID: the `is` leaves of the sentence read with no title lookup. A title there named no row. */
  const named = new Set(byId === undefined ? [] : leavesOf(byId).flatMap((l) => ('field' in l && typeof (l as Leaf).is === 'string' ? [JSON.stringify([l.field, (l as Leaf).is])] : [])));
  const out: Record<string, string> = {};
  for (const leaf of leavesOf(predicate)) {
    if (!('field' in leaf) || typeof leaf.field !== 'string' || leaf.via !== undefined) continue;
    const said = (leaf as Leaf).is;
    if (typeof said !== 'string' || Object.keys(leaf).length !== 2) continue;
    const type = Object.hasOwn(schema.fields, leaf.field) ? schema.fields[leaf.field]?.type : undefined;
    if (leaf.field === title) continue;
    if (type === 'ref' ? !named.has(JSON.stringify([leaf.field, said])) : type !== 'enum' && type !== 'text') continue;
    out[leaf.field] = said;
  }
  return out;
}

/* ── the open questions ──────────────────────────────────────────────────── */

/** Whether a question opened at `at` has waited past `STALE_DAYS` by `nowMs`. An instant that cannot be read has not. */
export function staleAt(at: string, nowMs: number): boolean {
  const ms = Date.parse(at);
  return Number.isFinite(ms) && nowMs - ms > STALE_DAYS * 86_400_000;
}

/* ── the runs working now ────────────────────────────────────────────────── */

/** A spoken id as the ladder writes a run's project: `things#1`. */
const SPOKEN = /^([a-z][a-z0-9_]*)#([1-9][0-9]*)$/;

/**
 * The project each run was placed in, by its name, aligned with `rows`, or `null` for a run placed nowhere.
 *
 * A RUN HOLDS ITS PROJECT AS A SPOKEN ID, which a reader cannot use, so it is named here as
 * `scopesOf` names a ref, and every host draws the same name. An id that names no row is kept as it
 * was written rather than dropped. A register with its own prefix is not read, as `fill` does not.
 *
 * AND EACH PROJECT'S MARK AND HUE BESIDE ITS NAME (`scope_marks`), read off the same rows, so a run's card wears the
 * chip a row of that project wears. A run whose project names no row is marked by nothing.
 */
function projectsOf(deps: PageDeps, rows: readonly Entry[]): { scopes: (string | null)[]; scope_marks: ({ mark: string | null; hue: number | null } | null)[] } {
  const asked = new Map<string, Set<number>>();
  for (const r of rows) {
    const m = SPOKEN.exec(typeof r.fields.project === 'string' ? r.fields.project : '');
    if (m) asked.set(m[1]!, (asked.get(m[1]!) ?? new Set<number>()).add(Number(m[2])));
  }
  const names = new Map<string, string>();
  const marks = new Map<string, { mark: string | null; hue: number | null }>();
  for (const [register, seqs] of asked) {
    const title = deps.titleOf(register);
    const listed = title ? deps.list({ register, where: { field: 'seq', in: [...seqs] }, limit: 200 }) : null;
    const identity = deps.identityOf?.(register) ?? null;
    if (listed?.ok)
      for (const r of listed.value.rows) {
        names.set(`${register}#${r.seq}`, String(r.fields[title!] ?? ''));
        marks.set(`${register}#${r.seq}`, markOf(r, identity));
      }
  }
  const placed = (r: Entry): string | null => (typeof r.fields.project === 'string' && r.fields.project !== '' ? r.fields.project : null);
  return {
    scopes: rows.map((r) => {
      const at = placed(r);
      return at === null ? null : names.get(at) || at;
    }),
    scope_marks: rows.map((r) => {
      const at = placed(r);
      return at === null ? null : (marks.get(at) ?? { mark: null, hue: null });
    }),
  };
}

/* ── what a project runs on ──────────────────────────────────────────────── */

/**
 * The type a host reads a computed source's field as, by field, where it is not the type the source's `where` reads.
 *
 * A RUN IS A HANDLE, `S731`, which `where: used_by is S731` compares as words, and which a person is never shown alone: a
 * host draws a `run` as the agent's name and the day, from the fields beside it, and links to the run. So `used_by`
 * stays text to the grammar and is answered as a run to the host.
 */
const HOST_TYPES: Readonly<Record<string, Readonly<Record<string, string>>>> = { runs_on: { used_by: 'run' }, [HANDOFFS_OPEN]: { run: 'run' } };

/**
 * A computed source's fields' types, for a host to draw a cell by when no list declares the field: an instant through
 * how long ago, a run as its agent's name. Without them a project page printed `2026-10-06T19:07:01.610Z` and `S731`
 * under "Tools and servers", because the browser knows the lists' fields and no computed source's.
 */
function typesOf(schema: Schema): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, spec] of Object.entries(schema.fields)) out[field] = HOST_TYPES[schema.register]?.[field] ?? spec.type;
  return out;
}

/* ── one row's history ───────────────────────────────────────────────────── */

/** The values one text field held, oldest first, an event that left it as it was being no version. */
export function versionsOf(events: readonly RowEvent[], field: string): { at: string; by: string; text: string }[] {
  const out: { at: string; by: string; text: string }[] = [];
  for (const e of events) {
    const to = e.field === null ? (e.to !== null && typeof e.to === 'object' && !Array.isArray(e.to) ? e.to[field] : undefined) : e.field === field ? e.to : undefined;
    if (typeof to !== 'string' || out.at(-1)?.text === to) continue;
    out.push({ at: e.ts, by: e.actor, text: to });
  }
  return out;
}

function diffBlock(
  deps: PageDeps,
  block: PageBlock,
  register: string,
  schema: Schema,
  base: BlockResult,
  also: (...more: readonly Refusal[]) => Refusal[],
): BlockResult {
  const refuse = (refusal: Refusal): BlockResult => ({ ...base, refusals: also(refusal) });
  if (!block.row) return refuse({ code: 'REQUIRED_MISSING', fix: 'A diff names the row whose history it reads, as row: skills#2.', at: 'row' });
  if (!block.field) return refuse({ code: 'REQUIRED_MISSING', fix: 'A diff names the field it compares, as field: body.', at: 'field' });
  const decl = schema.fields[block.field];
  if (!decl) return refuse({ code: 'FIELD_UNKNOWN', fix: `${register} has no field called ${block.field}.`, at: 'field', allowed: Object.keys(schema.fields) });
  /* LINES ARE WHAT A DIFF COMPARES, so a field that holds no text has no diff to draw. */
  if (decl.type !== 'document' && decl.type !== 'text')
    return refuse({ code: 'DECLARATION_INVALID', fix: `A diff compares text, and ${block.field} is ${decl.type}.`, at: 'field' });
  if (!deps.history) return refuse({ code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog does not read a row’s history onto a page yet.', at: 'source' });
  const events = deps.history(register, block.row);
  if (!events.ok) return { ...base, refusals: refused(events) ? also(events.refusal) : also() };
  const all = versionsOf(events.value, block.field).reverse();
  const n = Math.min(VERSIONS.most, Math.max(VERSIONS.least, Math.floor(block.versions ?? VERSIONS.least)));
  return { ...base, history: all.slice(0, n), matched: all.length };
}

/* ── the small parts ─────────────────────────────────────────────────────── */

/** A title as a slug a person can type: lower-case, hyphens, nothing else. */
export const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/* `fill` and the scope a parameter sets live in `fill.ts`, which `money-figures.ts` can import too. */
export { fill };

/* Every list a predicate hops into (`pointed`): the one walk `money-figures.ts` keeps for a figure's `where`. */
export { pointedIn };

/**
 * The registers a page draws from, so a caller's scope can be checked against it.
 *
 * A PAGE'S TITLE IS A SENTENCE ABOUT WHAT THE RECORD HOLDS. "Payroll, monthly" tells a bookkeeper
 * invited to one register that there is a payroll register — which is the exact inference `boot`
 * filters its own list to prevent: a list of names is itself information. `pages()` returned every
 * page a record declares to anybody with `read` on anything.
 *
 * `for:` COUNTS AS MUCH AS A BLOCK'S `source`. A template is one page per row of the register it
 * walks, so its existence says that register is there — and each expanded page carries a row's title
 * as its own, which says more.
 *
 * A PAGE THAT NAMES NONE IS PROSE, and prose is for anybody who may read.
 *
 * AND A `stat` BLOCK NAMES ITS REGISTERS THROUGH ITS FIGURES, WHICH THIS DID NOT LOOK AT.
 *
 * `05 §1` makes `table` the page-only kind that takes `source:`; a `stat` has `cells:` instead, and
 * each cell names a metric whose own declaration carries the `source`. So a page made entirely of
 * figures named no register here, was treated as prose, and was listed to everybody. Driven over
 * HTTP with a read token whose ceiling is one register: `list` refuses, `metric` refuses, `boot`
 * shows one register, and then `pages` names the payroll page and `page` hands back its readings.
 * The shipped seed's own Money page is exactly that shape.
 *
 * IT NEEDS A RESOLVER, because a metric id is a name and the declaration behind it lives in the
 * record. The caller passes one; a page whose metric cannot be resolved contributes nothing, which
 * is the same answer `metric` gives for a name it cannot reach and is the safe direction: the
 * listing is filtered by what a page IS known to touch, so an unknown is not a licence.
 *
 * WHAT IT ANSWERS, for a caller deciding what to hold back: every register id the page reads, each once, plus
 * `WHOLE_RECORD` (`*`) when any block reads across the whole record (`activity`, `actions`, `governance.open`).
 * An empty answer is prose. A caller that asks `reaches` or `readable` of every name refuses `*` to anybody whose
 * ceiling is not the whole record, and a caller that treats the answer as a list of lists to NAME must leave `*`
 * out.
 *
 * AND THE LISTS A BLOCK READS BESIDE ITS SOURCE, WHICH ARE NAMED BY DECLARATIONS AND NOT BY THE BLOCK, through
 * `beside`. Measured: a member invited to Areas alone was drawn a hidden list's `salary` by a card's `as: next`,
 * because `nextsOf` reads every row of the steps under the cards and this named only Areas; `as: ring` read the same
 * rows, and `as: scope`, `inherit` and the live runs read the titles of the projects list the same way. A caller that
 * holds blocks passes `beside`, as it passes `metric`; without it these are not named, which is what this answered
 * before.
 */
export function registersOf(decl: PageDecl, metric?: (id: string) => MetricDecl | null, beside?: ListsBeside): string[] {
  const named = new Set<string>();
  const add = (source: unknown) => {
    if (typeof source === 'string' && source.startsWith('register.')) named.add(source.slice('register.'.length));
  };
  /* A FIGURE NAMES EVERY LIST IT READS, not its source alone (`money-figures.ts` `figureLists`): a rolled cash figure
     reads its moves and its checks, and a walk its legs and the figure it opens from, so a page with one on it is held
     from a member who may not read those lists as it is on Home and in the sell knob (`listsRead`). */
  const pointsAt = pointsBeside(beside);
  /* A FIGURE'S PARAMETER IS CUT AT THE FIRST COLON: `cost:{{name}}` reads the lists `cost` reads. */
  const addFigure = (said: string): void => {
    const id = said.indexOf(':') < 0 ? said : said.slice(0, said.indexOf(':'));
    const d = metric?.(id) ?? builtInFigure(id);
    if (d) for (const list of listsRead(d, (other) => metric?.(other) ?? null, pointsAt)) named.add(list);
  };
  if (decl.for?.register) named.add(decl.for.register);
  for (const block of decl.blocks ?? []) {
    add(block.source);
    /* A `where:` THAT HOPS INTO ANOTHER LIST READS THAT LIST. A table over Categories kept to
       the ones a transaction points at was held by Categories alone, so a member who may not open Transactions read
       which categories have entries, off a page. A figure's hops were already named (`figureLists`); a block's own
       `where:` and a ring's or a heat's `of:` are named here, by the same walk. */
    for (const list of [...pointedIn(block.where), ...pointedIn(block.of)]) named.add(list);
    /* INPUTS READ A ROW OF `register:` AND DRAW ITS FIGURES, so the list is the block's as a source's is. A capture's is
       not: it reads nothing. */
    if (block.kind === 'inputs' && typeof block.register === 'string') named.add(block.register);
    /* A CASH WALK READS EVERY LIST ITS LEGS WALK, and this read only the list its opening figure counts. So a walk over
       Bills was a block about Accounts, and a member invited to Obligations alone read *Severance for Sam*, -1,250,000,
       off the Desk page while `list('bills')` refused her. A leg is JSON somebody wrote, so one with no list names
       nothing here and the walk refuses it when it runs. */
    if (Array.isArray(block.from))
      for (const leg of block.from as unknown[])
        if (leg !== null && typeof leg === 'object' && typeof (leg as { register?: unknown }).register === 'string')
          named.add((leg as { register: string }).register);
    /* THE RUNS ARE ROWS OF `session`, whether a block lists the live ones or marks which of its own rows has an
       agent on it. `sessionsLive` refuses somebody without `read` on `session`, and the block on the same page
       handed that person each run's repo, what it was doing and its token id. */
    const runs = block.source === 'sessions.live' || block.source === 'sessions.working';
    if (runs || block.working === true || block.source === HANDOFFS_OPEN) named.add(SESSION);
    /* A LIVE RUN IS NAMED BY ITS PROJECT'S TITLE (`projectsOf`), a row of the list that declares `scopes:`. */
    /* AND SO IS A RUN READ OFF THE LIST ITSELF, where a card asks for its project or for what it said it is doing: both
       read the projects' titles (`projectsOf`, `withSaid`). */
    const listedRuns =
      block.source === `register.${SESSION}` && (block.columns ?? []).some((c) => c?.field === DOING_SAID || (c?.as === 'scope' && c?.field === PLACED));
    const projects = runs || listedRuns || block.source === HANDOFFS_OPEN ? beside?.projects?.() : null;
    if (projects) named.add(projects);
    /* A CARD'S NEXT STEP AND ITS RING READ EVERY LIST OF STEPS UNDER THE CARDS, all of them, because `ringsOf` tallies
       each and `stepsHolding` refuses a field none of them has with every one's name and fields in `allowed`. */
    const source = typeof block.source === 'string' && block.source.startsWith('register.') ? block.source.slice('register.'.length) : null;
    if (source !== null && block.kind === 'cards' && (block.columns ?? []).some((c) => c?.as === 'next' || c?.as === 'ring'))
      for (const list of beside?.stepsOf?.(source) ?? []) named.add(list.register);
    /* A CARD'S GROUP IS NAMED BY THE TITLE OF THE ROW ITS LINK POINTS AT (`groupedRows`), a row of that list. */
    const groupedBy = source !== null && block.kind === 'cards' && typeof block.group === 'string' ? pointsAt?.(source, block.group) : null;
    if (groupedBy) named.add(groupedBy);
    /* A CARD'S PICTURE AND ITS HUE READ NO LIST BESIDE THE CARDS' OWN: each is a field of the card's row (`roleFault`),
       and the source above names that list. What is named here is what a picture reads that its block does not say:
       a gallery's picture written out as `file:contracts#2/scan` is a row of Contracts, which its answer hands over as
       stored (`kinds/gallery.ts`), so a reader who may not open Contracts is not handed its scan. */
    if (block.kind === 'gallery') for (const list of fileLists(block)) named.add(list);
    /* A ROW'S SCOPE IS DRAWN AS ITS PROJECT'S TITLE (`scopesOf`), and an inherited read walks the project's rows. */
    if (source !== null && (block.inherit === true || (block.columns ?? []).some((c) => c?.as === 'scope'))) {
      const scope = beside?.scopeOf?.(source);
      if (scope) named.add(scope.to);
    }
    /* WHAT READS ACROSS THE RECORD IS NAMED `*`. The open questions, the scheduled actions and the log belong to
       no list, and naming none made each one prose: `pages` listed the page to anybody and `page` drew the queue
       and a bank key's host and label to a member whom `governance` and `actions` both refuse. `*` is the one
       name the record's `reaches` already answers only for a ceiling of the whole record, so asking whether a
       caller may read it is asking whether they read all of it. It is never a list's id: `declare.ts` refuses
       a register id that is not lower-case letters, digits and underscores. */
    /* AND SO IS A SOURCE THE RECORD READS ACROSS ITSELF (`HostSource.whole`), such as its census of pages; one that
       answers each reader only what they may read, such as `lists`, names nothing. Never asked over a registered name.
       Both are asked of the one list the record and a shared link hold by too (`sourceReadsWhole`). */
    if (sourceReadsWhole(block.source, beside?.hostSources)) named.add(WHOLE_RECORD);
    /* WHAT A PROJECT RUNS ON READS THE KEYS, TOOLS AND SKILLS LISTS AND THE PROJECT `about:` NAMES, each whether or not
       this record holds it, and the scheduled actions beside them, which belong to no list and so are `*`: a key's
       label and an action's host are held back from a member who may not read all of them, as `actions` holds them. */
    if (block.source === 'runs_on') {
      for (const list of RUNS_ON_LISTS) named.add(list.register);
      /* AND THE RUNS, whose agent is said beside each run's handle. */
      named.add(SESSION);
      const about = typeof block.about === 'string' ? SPOKEN.exec(block.about) : null;
      if (about) named.add(about[1]!);
      named.add(WHOLE_RECORD);
    }
    /* ONLY A LIST OF CELLS NAMES FIGURES: `cells:` that is not one is refused on its block (`readBlock`) and draws
       nothing, so it names no list, and walking it here threw where the block refuses. */
    for (const cell of Array.isArray(block.cells) ? block.cells : []) {
      if (cell === null || typeof cell !== 'object' || typeof cell.metric !== 'string') continue;
      /* THE FIRST COLON SEPARATES, as everywhere else: `project-owed:C:\Repos` is one project. */
      const at = cell.metric.indexOf(':');
      addFigure(at < 0 ? cell.metric : cell.metric.slice(0, at));
      /* AND A TREND AHEAD READS THE WALK IT DRAWS: every list its legs walk and the figure it opens from. */
      if (typeof (cell as { ahead?: unknown }).ahead === 'string') {
        const ahead = (cell as { ahead: string }).ahead;
        addFigure(ahead);
        /* A FIGURE OF WHAT IS HELD DRAWS THE FULLEST WALK FROM IT (`walkFrom`), whose legs are read too. */
        const walk = fullestWalk(beside?.metrics?.() ?? [], ahead);
        if (walk) addFigure(walk.metric);
      }
    }
    /* A SERIES READS EVERY FIGURE IT LINES UP. */
    for (const line of block.series ?? [])
      for (const id of [line?.metric, line?.then]) if (typeof id === 'string') addFigure(id.indexOf(':') < 0 ? id : id.slice(0, id.indexOf(':')));
    /* A WALK THAT STARTS FROM A FIGURE READS THAT FIGURE'S LIST, and so does the figure its late knob marks. */
    if (block.opening && typeof block.opening === 'object') {
      const at = block.opening.metric.indexOf(':');
      addFigure(at < 0 ? block.opening.metric : block.opening.metric.slice(0, at));
    }
    if (typeof block.late === 'string') addFigure(block.late);
    /* A CARD DATED BY A FIGURE READS THAT FIGURE'S LISTS: the moves and checks its balances are rolled over. */
    const staleBy = block.stale !== null && typeof block.stale === 'object' ? (block.stale as { figure?: unknown }).figure : undefined;
    if (typeof staleBy === 'string') addFigure(staleBy);
    /* AND THE FIGURE A PROGRESS BLOCK SETS ITS ROWS AGAINST, which `spentOf` reads whole into `readings`. Unnamed, a
       budget over Budgets with `spent:` a figure of Payroll drew a member invited to Budgets the Payroll total to the unit. */
    for (const figure of [block.spent, block.toward]) if (typeof figure === 'string') addFigure(figure);
    /* AND THE FIGURE ITS SELL KNOB OFFERS, which is a total of a list: a member who may not open Holdings is not handed
       what is in it as the amount a date control would add. */
    if (block.sell && typeof block.sell === 'object' && typeof block.sell.metric === 'string') addFigure(block.sell.metric);
    /* WHAT READS ACROSS THE LISTS NAMES EVERY LIST IT MAY READ: the lists holding a deadline, the lists behind the
       figures pinned to Home, and behind every figure a sell knob with no `sell:` offers. Without the record's lists
       and figures to name them by (`beside`), each is named `*`, which holds it back from anybody who may not read the
       whole record rather than listing it as prose. */
    for (const name of acrossLists(block, beside)) named.add(name);
    /* A BAR OR A SPLIT OVER A FIGURE READS THE FIGURE'S LIST. */
    if (typeof block.source === 'string' && block.source.startsWith('metric.')) addFigure(block.source.slice('metric.'.length));
    /* AND A CARD'S TREND READS ITS FIGURE'S LISTS, once a card, so a member who may not open Tasks is not drawn how many
       of a project's tasks were finished each week. */
    for (const c of block.kind === 'cards' && Array.isArray(block.columns) ? block.columns : [])
      if (c !== null && typeof c === 'object' && typeof c.metric === 'string') addFigure(trendNamed(c.metric).id);
    /* A `when:` READS A FIGURE TOO, and a block that draws only when a number crosses a line is a
       statement about that number whether or not the block is on the page. */
    /* EVERY LEAF'S, when it is `all:` or `any:` of several: each is a statement about its own figure. AND EVERY SENTENCE'S
       OF A NOTE'S `says:`, whichever is said: the one said tells the reader the others did not hold. */
    const sentences = Array.isArray(block.says) ? block.says : [];
    for (const leaf of [block.when, ...sentences.map((line) => (line !== null && typeof line === 'object' ? line.when : undefined))].flatMap((w) => whenLeaves(w))) {
      const at = leaf.metric.indexOf(':');
      addFigure(at < 0 ? leaf.metric : leaf.metric.slice(0, at));
    }
    /* AND SO DOES A `{{path}}` IN ITS PROSE, which the page answer now fills from the record. */
    for (const path of pathsOf(block, (id) => (metric?.(id) ?? builtInFigure(id)) !== null, true)) {
      const said = pathOf(path);
      if (!said) continue;
      if ('metric' in said) {
        addFigure(said.metric);
        continue;
      }
      /* A ROW'S OWN FIELD, AND THE DAY OF A ROW'S NEWEST READING, name no list here: which list holds a row's readings is
         known only on the row's page, and each is held where it is read (`ctx.reads` in `newestReading`). */
      if ('own' in said || 'measure' in said) continue;
      /* `<module>.<figure>` NAMES THE LISTS ITS FIGURE READS, read over the declarations `beside` hands, and its first word
         is a list only when the record has a list of that name. */
      const two = twoOf(said);
      const owned = two && beside ? moduleFigure(beside, two.head, two.tail) : null;
      if (owned) addFigure(owned.metric);
      const isList = (id: string): boolean => LIST_ID.test(id) && (owned === null || (beside?.lists?.() ?? []).some((l) => l.id === id));
      if ('change' in said || 'rowsOf' in said || 'crossingOf' in said || 'convertedOf' in said) {
        const head = 'change' in said ? said.change : 'rowsOf' in said ? said.rowsOf : 'crossingOf' in said ? said.crossingOf : said.convertedOf;
        const isFigure = (metric?.(head) ?? builtInFigure(head)) !== null;
        if (isFigure) addFigure(head);
        /* A LIST OF THAT NAME IS NAMED TOO when the record has one, since a state it holds is read first (`twoOf`). */
        if (isList(head) && (!isFigure || (beside?.lists?.() ?? []).some((l) => l.id === head))) named.add(head);
      } else if ('then' in said) {
        /* A NESTED PATH READS ITS ROW'S LIST AND THE LIST ITS LINK POINTS AT, so a reader held from Projects is held from
           `{{tasks#1.project.name}}` as she is from the project itself. */
        named.add(said.register);
        const to = pointsAt?.(said.register, said.field);
        if (to) named.add(to);
      } else if (isList(said.register)) named.add(said.register);
    }
  }
  return [...named];
}

/* ── live values ─────────────────────────────────────────────────────────── */

/** A list's id as a path names it: a figure's id may hold a dash, a list's may not. */
const LIST_ID = /^[a-z][a-z0-9_]*$/;

/** Lexically a path, `05 §7.1`, as the renderer reads one. */
const PATH = /^[A-Za-z][A-Za-z0-9_-]*(?:#\d+)?(?:\.[A-Za-z][A-Za-z0-9_-]*(?:#\d+)?)*$/;

/**
 * A figure asked with its parameter, `plan-left:Flat`, or null for words that are not one.
 *
 * THE FIRST COLON SEPARATES, as it does in a figure cell (`project-owed:Kiln`), and everything after it is the
 * parameter: a plan called `C:\Repos` or `Flat 2.0` is one plan. The parameter is read without the spaces round it,
 * so `{{plan-left: Flat}}` asks what `{{plan-left:Flat}}` asks.
 */
function figureAsked(path: string): { id: string; param: string } | null {
  const at = path.indexOf(':');
  if (at <= 0) return null;
  const id = path.slice(0, at).trim();
  const param = path.slice(at + 1).trim();
  return param !== '' && /^[a-z][a-z0-9_-]*$/.test(id) ? { id, param } : null;
}

/** The forms a renderer reads before it reads a path, whose words after the colon are never a parameter. */
const NOT_A_FIGURE = new Set(['icon', 'bad']);

/** The eight typed forms of `05 §7.2`, whose argument may be a path. */
const TYPED = new Set(['date', 'day', 'until', 'ago', 'money', 'quantity', 'pct', 'ref']);

/**
 * The field types a path may read. `05 §7.1` rule 2: a document or a note is an argument, not a figure.
 * A secret is never a figure, and a ref or a list would be an id, so each is left out by not being named.
 */
const FIGURES = new Set(['text', 'url', 'email', 'enum', 'int', 'number', 'decimal', 'money', 'day', 'instant', 'bool', 'boolean', 'duration', 'pct']);

/**
 * Every `{{path}}` a reader would see in a block, each once: in its heading, body, empty sentence, authored
 * cells and column labels, outside code spans, as a bare path or as a typed form's path argument.
 *
 * A FIGURE WITH ITS PARAMETER IS A PATH ONLY TO A CALLER WHO CAN SAY THE FIGURE EXISTS (`figure`), REC-B12:
 * `{{plan-left:Flat}}` in a plan's lead sentence is asked, keyed as written. Words before a colon are not a figure by
 * their shape alone (`{{config:book}}`, `{{bad:three days late}}`), so with nobody to ask, and for a name no figure
 * has, the hole is the author's text, as every hole with a colon was before a note could ask.
 *
 * AND A TEMPLATE'S, BEFORE ITS ROW FILLS IT (`unfilled`): `{{plan-left:{{name}}}}` is asked too, as a figure cell's
 * `plan-left:{{name}}` is, so the lists a template reads are named from its declaration and not only from a page
 * made of it. Only `registersOf` asks: there is no value to read until the row is in.
 */
export function pathsOf(block: PageBlock, figure?: (id: string) => boolean, unfilled = false): string[] {
  const authored = (block as { authored?: unknown }).authored;
  const cells = Array.isArray(authored)
    ? authored.flatMap((r) => (r !== null && typeof r === 'object' && Array.isArray((r as { cells?: unknown }).cells) ? (r as { cells: unknown[] }).cells : []))
    : [];
  const out = new Set<string>();
  /* A FIGURE'S OWN NOTE NAMES FIGURES TOO: `in {{cash-accounts}} account(s)` under Cash now. */
  const notes = (Array.isArray(block.cells) ? (block.cells as unknown[]) : []).map((c) => (c !== null && typeof c === 'object' ? (c as { note?: unknown }).note : undefined));
  /* AND A COLUMN'S LABEL IS READ AS A HEADING IS: `Open ({{tasks.open}})` over a column was drawn with the braces in
     it, because the heading above it was filled and the label beside it was never asked. */
  const labels = Array.isArray(block.columns) ? block.columns.map((c) => (c !== null && typeof c === 'object' ? (c as { label?: unknown }).label : undefined)) : [];
  /* AND EVERY SENTENCE A NOTE'S `says:` MAY SAY, since any of them may be the body a reader sees. */
  const sentences = Array.isArray(block.says) ? block.says.map((line) => (line !== null && typeof line === 'object' ? (line as { body?: unknown }).body : undefined)) : [];
  for (const text of [block.heading, (block as { body?: unknown }).body, block.empty, ...cells, ...notes, ...labels, ...sentences]) {
    if (typeof text !== 'string') continue;
    /* CODE SPANS FIRST, as the renderer lifts them: a `{{…}}` in backticks is text, not a question. */
    const spanless = text.replace(/`[^`]*`/g, ' ');
    const nested = unfilled && figure !== undefined ? spanless.matchAll(/\{\{((?:[^{}]|\{\{\w+\}\})*)\}\}/g) : [];
    for (const m of [...spanless.matchAll(/\{\{([^{}]*)\}\}/g), ...nested]) {
      const body = (m[1] ?? '').trim();
      const colon = body.indexOf(':');
      const form = colon > 0 ? body.slice(0, colon).trim() : '';
      const raw = TYPED.has(form) ? body.slice(colon + 1).trim() : body;
      /* A typed form's literal is the author's value; `ref`'s `tasks#241` is a literal and not a path. */
      if (TYPED.has(form) && (!/^[A-Za-z]/.test(raw) || (form === 'ref' && /^[a-z][a-z0-9_]*#\d+$/.test(raw)))) continue;
      if (PATH.test(raw)) out.add(raw);
      else if (figure !== undefined) {
        const asked = figureAsked(raw);
        if (asked && !NOT_A_FIGURE.has(asked.id) && figure(asked.id)) out.add(raw);
      }
    }
  }
  return [...out];
}

/**
 * What a path names, in `05 §7.1`'s grammar outside a template: a metric, a row's field by spoken id, one step through
 * that field, a register's count, how many of a register's rows are in one state, or a module's figure. Nothing else is
 * read, and a path that names none of these is `null` rather than a guess.
 *
 * THE SHAPE ONLY. Which of several readings two words get is the record's to say, in the one order `twoOf` writes down,
 * so this answers the form the words take and `valueAt` and `namedAt` walk the order over it.
 *
 * `<list>#<n>.<field>.<part>` IS ONE STEP INTO A FIELD: a field of the row a link points at, a money's
 * `amount` or `currency`, or how many a list field holds (`count`). A fourth part is nothing, so a path never walks
 * from row to row to row.
 */
function pathOf(
  path: string,
  own?: Schema['fields'],
):
  | { metric: string; param?: string }
  | { change: string; words?: true }
  | { rowsOf: string; part: RowPart; field?: string }
  | { crossingOf: string; part: CrossingPart }
  | { convertedOf: string; part: ConvertedPart }
  | { register: string; seq: number; field: string }
  | { register: string; seq: number; field: string; then: string }
  | { register: string; count: true }
  | { register: string; state: string }
  | { own: string; count?: true }
  | { measure: string; period: string; since: true }
  | null {
  /* A FIGURE WITH ITS PARAMETER, before the path is cut at its full stops: the parameter is a name and may hold one. */
  const asked = figureAsked(path);
  if (asked) return { metric: asked.id, param: asked.param };
  const parts = path.split('.');
  /* THE ENTRY THE TEXT SITS ON IS READ FIRST: one word its list declares is its field, and `<field>.count` over
     one of its list fields is how many that field holds. A word it does not declare reads as it always has. */
  const ownField = (word: string | undefined): boolean => own !== undefined && word !== undefined && Object.hasOwn(own, word);
  if (parts.length === 1 && ownField(path)) return { own: path };
  if (parts.length === 2 && parts[1] === 'count' && ownField(parts[0]) && own![parts[0]!]!.type === 'list') return { own: parts[0]!, count: true };
  if (parts.length === 1) return /^[a-z][a-z0-9_-]*$/.test(path) ? { metric: path } : null;
  if (parts.length === 3) {
    const row = /^([a-z][a-z0-9_]*)#([1-9][0-9]*)$/.exec(parts[0]!);
    const [, field, then] = parts as [string, string, string];
    /* `<measure>.<period>.since` IS THE DAY A ROW'S NEWEST READING WAS READ, on a page with a row. */
    if (!row && then === 'since' && /^[a-z][a-z0-9_-]*$/.test(parts[0]!) && /^[A-Za-z][A-Za-z0-9_-]*$/.test(field)) return { measure: parts[0]!, period: field, since: true };
    return row && /^[a-z][a-z0-9_]*$/.test(then) ? { register: row[1]!, seq: Number(row[2]), field, then } : null;
  }
  if (parts.length !== 2) return null;
  const [head, tail] = parts as [string, string];
  /* `<figure>.first_<field>` IS A FIELD OF THE FIRST ROW A FIGURE COUNTS, the row `.first` names, so a sentence can say
     "Salma still owes EGP 1,350" (`rowsValue`). */
  const firstOf = /^first_([a-z][a-z0-9_]*)$/.exec(tail);
  if (firstOf && /^[a-z][a-z0-9_-]*$/.test(head)) return { rowsOf: head, part: 'first', field: firstOf[1]! };
  /* `<figure>.change` IS HOW FAR A FIGURE MOVED (`changeOf`). A list called `tasks` with a state called `change` would
     say the same words, and `twoOf`'s order decides between the two. */
  if (tail === 'change' && /^[a-z][a-z0-9_-]*$/.test(head)) return { change: head };
  /* `<figure>.moved` IS THE SAME MOVE SAID IN WORDS, "6% down" and "8% up", for a sentence that reads on from it: "6% down
     on a month ago" where `.change` wrote "−6% on a month ago" (P20). Nought is `0%` in both. */
  if (tail === 'moved' && /^[a-z][a-z0-9_-]*$/.test(head)) return { change: head, words: true };
  /* `<figure>.first`, `.names`, `.more` AND `.since` ARE THE ROWS A FIGURE COUNTS (`rowsValue`), decided between a figure
     and a list's state of that name exactly as `.change` is. */
  if ((ROW_PARTS as readonly string[]).includes(tail) && /^[a-z][a-z0-9_-]*$/.test(head)) return { rowsOf: head, part: tail as RowPart };
  /* `<figure>.on`, `.because` AND `.because_amount` ARE WHERE A WALK TO ZERO GOES UNDER (`crossingValue`): its day, what
     falls due that day and its money, so a sentence says why the money runs out on the day it does. `.low` and `.low_on`
     are the lowest it reaches in twelve weeks and that day. */
  if ((CROSSING_PARTS as readonly string[]).includes(tail) && /^[a-z][a-z0-9_-]*$/.test(head)) return { crossingOf: head, part: tail as CrossingPart };
  /* `<figure>.apart`, `.converted` AND `.rate_on` ARE A MONEY FIGURE IN EACH OF ITS CURRENCIES, THE ONE AMOUNT THEY ARE
     CONVERTED INTO AND THE DAY OF THE RATES, so a line keeps pounds and dollars apart and says the sum as roughly that. */
  if ((CONVERTED_PARTS as readonly string[]).includes(tail) && /^[a-z][a-z0-9_-]*$/.test(head)) return { convertedOf: head, part: tail as ConvertedPart };
  const row = /^([a-z][a-z0-9_]*)#([1-9][0-9]*)$/.exec(head);
  if (row) return { register: row[1]!, seq: Number(row[2]), field: tail };
  /* A MODULE'S ID MAY HOLD A DASH where a list's may not, so `money-core.cash-now` is two words to ask the order about. */
  if (!/^[a-z][a-z0-9_-]*$/.test(head)) return null;
  if (tail === 'count') return { register: head, count: true };
  return /^[A-Za-z][A-Za-z0-9_-]*$/.test(tail) ? { register: head, state: tail } : null;
}

/** A stored value a reader may be shown: a scalar, or a money's amount and currency and nothing else. */
function figure(v: Json | undefined): Json | undefined {
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  if (v !== null && typeof v === 'object' && !Array.isArray(v) && typeof v.amount === 'number' && typeof v.currency === 'string')
    return { amount: v.amount, currency: v.currency };
  return undefined;
}

/**
 * One path's value, or `undefined` when the record holds none.
 *
 * NOTHING IS COMPUTED HERE THAT THE RECORD DOES NOT ALREADY ANSWER: a declared metric's reading, a
 * stored field, a count `list` already returns. A field is read from the row's OWN properties and only
 * when the register declares it, so `tasks#1.constructor` is nothing rather than the prototype.
 *
 * AND WHICH RULE READ IT, on `how.as` (`ReadAs`), for every path that holds a value: what the block answers as
 * `read_as`, so a later check can list a path two rules match.
 */
function valueAt(deps: PageDeps, path: string, how: { fx?: FxRead; as?: ReadAs; asOf?: string } = {}): Json | undefined {
  const here = deps.here;
  const parsed = pathOf(path, here ? deps.schemaOf(here.register)?.fields : undefined);
  if (!parsed) return undefined;
  /* THE ENTRY'S OWN FIELD, read from the entry in hand. A long field (a document) is named and stays unavailable, as it
     is on any row: `05 §7.1` makes it an argument and not a figure. */
  if ('own' in parsed) {
    const spec = deps.schemaOf(here!.register)!.fields[parsed.own]!;
    const held = Object.hasOwn(here!.fields, parsed.own) ? here!.fields[parsed.own] : undefined;
    how.as = 'field';
    if (parsed.count) return Array.isArray(held) ? held.length : 0;
    return FIGURES.has(spec.type) ? figure(held) : undefined;
  }
  if ('measure' in parsed) {
    how.as = 'reading';
    return newestReading(deps, parsed.measure, parsed.period)?.day;
  }
  if ('then' in parsed) {
    how.as = 'field';
    return stepValue(deps, parsed);
  }
  const two = twoOf(parsed);
  if (two) return twoValue(deps, parsed, two, how);
  if ('metric' in parsed) {
    const named = deps.metric(parsed.metric);
    /* The declaration with its parameter filled, as a figure cell reads `project-owed:Kiln`. */
    const decl = named && parsed.param !== undefined ? (fill(named, null, parsed.param) as MetricDecl) : named;
    how.as = 'figure';
    return decl ? figureValue(deps, decl, how) : undefined;
  }
  if (!('seq' in parsed)) return undefined;
  how.as = 'field';
  const schema = deps.schemaOf(parsed.register);
  if (!schema) return undefined;
  const decl = Object.hasOwn(schema.fields, parsed.field) ? schema.fields[parsed.field] : undefined;
  if (!decl || !FIGURES.has(decl.type)) return undefined;
  const row = rowAt(deps, parsed.register, parsed.seq);
  if (!row || !Object.hasOwn(row.fields, parsed.field)) return undefined;
  /* A ROW THAT SAYS WHEN IT WAS STATED (`as_of`, a balance's day) dates every field read from it. */
  const stated = parsed.field !== 'as_of' && Object.hasOwn(row.fields, 'as_of') ? row.fields.as_of : undefined;
  if (typeof stated === 'string' && /^\d{4}-\d{2}-\d{2}/u.test(stated)) how.asOf = stated.slice(0, 10);
  return figure(row.fields[parsed.field]);
}

/** A row by its spoken id's number, `tasks#3`, or `null` when the list holds none. */
function rowAt(deps: PageDeps, register: string, seq: number): Entry | null {
  const listed = deps.list({ register, where: { field: 'seq', is: seq }, limit: 1 });
  return (listed.ok ? listed.value.rows[0] : undefined) ?? null;
}

/** One figure's reading as a sentence says it: a number, an amount, its amounts in several currencies, or a day. */
function figureValue(deps: PageDeps, decl: MetricDecl, how?: { fx?: FxRead; asOf?: string }): Json | undefined {
  const read = deps.read(decl);
  if (!read.ok) return undefined;
  /* A ROLLED FIGURE'S OLDEST STATED BALANCE IS ITS AGE (`Reading.as_of`), in parts or in one amount. */
  if (how && typeof read.value.as_of === 'string') how.asOf = read.value.as_of.slice(0, 10);
  /* A FIGURE IN SEVERAL CURRENCIES IS EACH OF ITS AMOUNTS, which the host writes one after another. */
  if (read.value.parts) return read.value.parts.map((p) => ({ amount: p.amount, currency: p.currency }));
  if (read.value.value === null) return undefined;
  /* A FIGURE THAT IS A DAY (the latest `due`) is held as whole days since 1970, and a sentence says the day: the ISO day
     goes out, which a host writes as it writes any other day. */
  if (decl.format === 'day') return new Date(read.value.value * 86_400_000).toISOString().slice(0, 10);
  /* A FIGURE THAT IS A SHARE (`format: 'pct'`, held as a fraction) is said as its tile says it, "62%", not as the
     fraction's every digit: "take 20.268978494623656 of what comes in" was Reports' line under Health. */
  if (decl.format === 'pct' && !read.value.unit) return `${Math.round(read.value.value * 100).toLocaleString('en-GB')}%`;
  /* AND HOW ONE AMOUNT WAS CONVERTED, for a caller that asks (`values_fx`): only where a rate was used. */
  if (how && read.value.fx?.asOf) how.fx = read.value.fx;
  return read.value.unit ? { amount: read.value.value, currency: read.value.unit } : read.value.value;
}

/* ── the order for two words, and one step further ───────────────────────── */

type PathSaid = NonNullable<ReturnType<typeof pathOf>>;

/**
 * The two words of a path the order below decides, `tasks` and `open`, or `null` for a path of another form.
 */
function twoOf(said: PathSaid): Two | null {
  if ('change' in said) return { head: said.change, tail: 'words' in said ? 'moved' : 'change' };
  if ('rowsOf' in said) return { head: said.rowsOf, tail: said.field === undefined ? said.part : `first_${said.field}` };
  if ('crossingOf' in said) return { head: said.crossingOf, tail: said.part };
  if ('convertedOf' in said) return { head: said.convertedOf, tail: said.part };
  if ('count' in said && 'register' in said) return { head: said.register, tail: 'count' };
  if ('state' in said) return { head: said.register, tail: said.state };
  return null;
}

type Two = { head: string; tail: string };

/** Which rule of `PATH_ORDER` read a path, as a block answers it in `read_as`. A row's field by spoken id is `field`. */
export type ReadAs = 'count' | 'state' | 'figure' | 'module' | 'field' | 'reading';

/**
 * One rule of the order: `reads` is `null` when the rule does not take the path, else what it reads, which may be
 * nothing held (a dash); `names` says whether the rule names the path whatever it holds now, for `namedAt`.
 */
type PathRule = {
  as: ReadAs;
  reads: (deps: PageDeps, said: PathSaid, two: Two, how: { fx?: FxRead }) => { value: Json | undefined } | null;
  names: (deps: PageDeps, said: PathSaid, two: Two) => boolean;
};

/** The list a path's first word names, when it is one, which rule 1 reads. */
const listNamed = (deps: PageDeps, head: string): Schema | null => (LIST_ID.test(head) ? deps.schemaOf(head) : null);

/**
 * THE ORDER FOR TWO WORDS, written down here once and walked (`05 §7.1`). A path two rules could read is read
 * by the first that takes it, and never guessed:
 *
 * 1. A list and `count`, or a state its list's state field holds: `tasks.count`, `tasks.open`.
 * 2. A figure and `change`, `first`, `names`, `more`, `since` or `first_<field>`: `cash-now.change`.
 * 3. An installed module or add-on and a figure it declares (`moduleFigure`): `work.open-tasks`, read over the whole
 *    record on any page.
 * 4. On a page with a row, a field of that row and a part (`stepSpec`): `client.name`, `revenue.amount`.
 * 5. On a page with a row, a measure and a period (`newestReading`): `revenue.monthly`, the newest monthly revenue
 *    reading the record holds about that row.
 * 6. Then nothing: a state its list does not hold is not a count of nought, which would read as true.
 *
 * `valueAt` reads by it (`twoValue`), `namedAt` says whether anything answers by it, and `registersOf` names every list
 * a reading by it could reach, so a block is held from a reader by whichever rule answers. A reading's list is held
 * where it is read (`ctx.reads`), because which list holds a row's readings is known only on the row's page.
 */
const PATH_ORDER: readonly PathRule[] = [
  {
    /* A LIST'S COUNT, asked of the list as a whole. */
    as: 'count',
    reads: (deps, said, two) => {
      if (!('count' in said) || !listNamed(deps, two.head)) return null;
      const listed = deps.list({ register: two.head, limit: 1 });
      return { value: listed.ok ? listed.value.matched : undefined };
    },
    names: (deps, said, two) => 'count' in said && listNamed(deps, two.head) !== null,
  },
  {
    /* THE COUNT OF A LIST'S ROWS IN A STATE IT HOLDS, asked by the field it mirrors its state onto. */
    as: 'state',
    reads: (deps, _said, two) => {
      const schema = listNamed(deps, two.head);
      if (!schema || !stateNamed(deps, two.head, two.tail)) return null;
      const listed = deps.list({ register: two.head, where: { field: schema.state!, is: two.tail }, limit: 1 });
      return { value: listed.ok ? listed.value.matched : undefined };
    },
    names: (deps, _said, two) => stateNamed(deps, two.head, two.tail),
  },
  {
    /* A FIGURE'S PART, when a figure has the name: how far it moved, or the rows it counts. */
    as: 'figure',
    reads: (deps, said) => {
      const decl =
        'change' in said ? deps.metric(said.change)
        : 'rowsOf' in said ? deps.metric(said.rowsOf)
        : 'crossingOf' in said ? deps.metric(said.crossingOf)
        : 'convertedOf' in said ? deps.metric(said.convertedOf)
        : null;
      if (!decl) return null;
      if ('crossingOf' in said) return { value: crossingValue(deps, decl, said.part) };
      if ('convertedOf' in said) return { value: convertedValue(deps, decl, said.part) };
      return { value: 'rowsOf' in said ? rowsValue(deps, decl, said.part, said.field) : changeOf(deps, decl, 'words' in said) };
    },
    names: (deps, said) => {
      if ('change' in said) return figureNamed(deps, said.change);
      /* A CROSSING IS NAMED BY A FIGURE THAT WALKS TO ZERO, and by no other: `cash-now.on` is the author's slip. */
      if ('convertedOf' in said) return figureNamed(deps, said.convertedOf);
      if ('crossingOf' in said) {
        const decl = deps.metric(said.crossingOf);
        return decl !== null && decl.source === WALK_SOURCE && walksToZero((decl.value as { walk?: unknown } | undefined)?.walk);
      }
      if (!('rowsOf' in said) || !figureNamed(deps, said.rowsOf)) return false;
      if (said.field === undefined) return true;
      /* `first_<field>` NAMES A FIELD THE FIGURE'S LIST DECLARES, so `first_ownd` is the author's typo and not a dash. */
      const decl = deps.metric(said.rowsOf);
      const schema = decl?.source.startsWith('register.') ? deps.schemaOf(decl.source.slice('register.'.length)) : null;
      return schema !== null && Object.hasOwn(schema.fields, said.field);
    },
  },
  {
    /* A MODULE'S FIGURE, over the whole record, and only to a reader of every list behind it. */
    as: 'module',
    reads: (deps, _said, two, how) => {
      const owned = moduleFigure(deps, two.head, two.tail);
      return owned ? { value: mayRead(deps, owned) ? figureValue(deps, owned, how) : undefined } : null;
    },
    names: (deps, _said, two) => moduleFigure(deps, two.head, two.tail) !== null,
  },
  {
    /* A FIELD OF THE PAGE'S ROW AND A PART, one step as `<list>#<n>.<field>.<part>` takes it from a row by spoken id. */
    as: 'field',
    reads: (deps, _said, two) => {
      const spec = ownStep(deps, two);
      return spec ? { value: stepOn(deps, spec, deps.here!, two.head, two.tail) } : null;
    },
    names: (deps, _said, two) => ownStep(deps, two) !== null,
  },
  {
    /* THE NEWEST READING OF A MEASURE FOR A PERIOD ABOUT THE PAGE'S ROW, and only when the record holds one. */
    as: 'reading',
    reads: (deps, _said, two) => {
      const newest = newestReading(deps, two.head, two.tail);
      return newest ? { value: newest.value } : null;
    },
    names: (deps, _said, two) => newestReading(deps, two.head, two.tail) !== null,
  },
];

/** One path of two words, read by `PATH_ORDER`: the first rule that takes it says its value, and `how.as` which it was. */
function twoValue(deps: PageDeps, said: PathSaid, two: Two, how: { fx?: FxRead; as?: ReadAs }): Json | undefined {
  for (const rule of PATH_ORDER) {
    const read = rule.reads(deps, said, two, how);
    if (read === null) continue;
    how.as = rule.as;
    return read.value;
  }
  return undefined;
}

/** The field of the page's row a two-word path steps through, `revenue` of `revenue.amount`, or `null`. */
function ownStep(deps: PageDeps, two: Two): { type: string; to?: string | undefined } | null {
  return deps.here ? stepSpec(deps, { register: deps.here.register, field: two.head, then: two.tail }) : null;
}

/* ── the newest reading about a row ──────────────────────────────────────── */

/** Past every reading's instant, so the record answers each measure's newest as `latest` and no period of them. */
const AFTER_EVERY = '9999-12-31T23:59:59.999Z';

/**
 * A measure's words as a reading's name says them: `dailyRunRate` and `daily_run_rate` are `daily run rate`, in small
 * letters, so `revenue.monthly` finds "Monthly revenue".
 */
const spokenAs = (s: string): string =>
  s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * A list of readings about rows of `about`, by its declared shape and never by its id: an `at` that is an instant or a
 * day, a `value` that is a number or an `amount` that is money (or both), an optional `unit`, its title as the
 * measure's name, and the fields that point at `about`. `null` for any other list.
 */
function readingShape(list: ListShape, about: string): { refs: string[]; value: string; amount: boolean; unit: boolean } | null {
  const live = list.fields.filter((f) => !f.retired);
  const has = (id: string, types: readonly string[]): boolean => live.some((f) => f.id === id && types.includes(f.type));
  const refs = live.filter((f) => f.type === 'ref' && f.to === about).map((f) => f.id);
  const value = has('value', ['decimal', 'number', 'integer']);
  const amount = has('amount', ['money']);
  if (refs.length === 0 || !has('at', ['instant', 'date']) || (!value && !amount)) return null;
  return { refs, value: value ? 'value' : 'amount', amount, unit: has('unit', ['text']) };
}

/**
 * One reading as a sentence says it: money as integer minor units and the currency it was written in, never converted,
 * or the number as it was read. An older reading is a decimal whose unit is a currency code, and is turned into minor
 * units by that currency's digits, as `measures.ts` turns one the other way.
 */
function readingSaid(r: RawReading): Json | undefined {
  let held = r.amount;
  if (typeof held === 'string' && held.startsWith('{')) {
    try {
      held = JSON.parse(held) as unknown;
    } catch {
      held = undefined;
    }
  }
  const money = held !== null && typeof held === 'object' ? (held as { amount?: unknown; currency?: unknown }) : null;
  if (money && typeof money.amount === 'number' && Number.isInteger(money.amount) && typeof money.currency === 'string' && money.currency.trim() !== '')
    return { amount: money.amount, currency: money.currency.trim().toUpperCase() };
  const n = typeof r.value === 'number' ? r.value : typeof r.value === 'string' && r.value.trim() !== '' ? Number(r.value) : Number.NaN;
  if (!Number.isFinite(n)) return undefined;
  const unit = typeof r.unit === 'string' ? r.unit.trim().toUpperCase() : '';
  return isCurrencyCode(unit) ? { amount: Math.round(n * 10 ** exponentOf(unit)), currency: unit } : n;
}

/**
 * `<measure>.<period>` on a page with a row (rule 5 of `PATH_ORDER`): the newest reading of that measure for that period
 * about the row, and the day it was read in the record's zone, or `null` when the record holds none.
 *
 * BY ITS NAME WHOLE, OR ITS NAME, A COMMA AND THE ROW'S TITLE, the rule the bands script reads by
 * (`packs/portfolio-bands/bands.js`), since an import names a project's reading "Monthly revenue, <project>". The name is
 * the period and the measure in either order, so `revenue.monthly` is "Monthly revenue" and "Revenue monthly".
 *
 * ONE READING, NEVER A SUM: the newest is said in the currency it was written in, and a reading in another currency
 * beside it is not added, converted or averaged in. Each list of readings is asked once, for this row, through
 * `deps.readings`, and a list the reader may not open is not asked.
 */
function newestReading(deps: PageDeps, measure: string, period: string): { value: Json; day: string } | null {
  const here = deps.here;
  if (!here || !deps.readings || !deps.lists) return null;
  const reads = deps.ctx.reads;
  const own = deps.titleOf(here.register);
  const title = own && typeof here.fields[own] === 'string' ? spokenAs(here.fields[own]) : '';
  const words = [`${spokenAs(period)} ${spokenAs(measure)}`, `${spokenAs(measure)} ${spokenAs(period)}`];
  const wanted = new Set(words.flatMap((w) => (title === '' ? [w] : [w, `${w}, ${title}`])));
  let best: { ms: number; at: string; value: Json } | null = null;
  for (const list of deps.lists()) {
    const shape = readingShape(list, here.register);
    const name = shape ? deps.titleOf(list.id) : null;
    if (!shape || !name || (reads !== undefined && !reads(list.id))) continue;
    const about: Predicate = shape.refs.length === 1 ? { field: shape.refs[0]!, is: here.id } : { any: shape.refs.map((f) => ({ field: f, is: here.id })) };
    const read = deps.readings({ register: list.id, where: about, when: 'at', value: shape.value, name, ...(shape.unit ? { unit: 'unit' } : {}), ...(shape.amount ? { amount: 'amount' } : {}), since: AFTER_EVERY });
    if (!read.ok) continue;
    for (const r of [...read.value.latest, ...read.value.readings]) {
      if (typeof r.name !== 'string' || !wanted.has(spokenAs(r.name)) || typeof r.at !== 'string') continue;
      const ms = Date.parse(r.at.length === 10 ? `${r.at}T00:00:00Z` : r.at);
      const value = readingSaid(r);
      if (!Number.isFinite(ms) || value === undefined || (best !== null && best.ms >= ms)) continue;
      best = { ms, at: r.at, value };
    }
  }
  if (best === null) return null;
  return { value: best.value, day: best.at.length === 10 ? best.at : localDays(readableZone(deps.tz))(best.ms) };
}

/** What a declaration reads of the modules a record has installed: `PageDeps` and `ListsBeside` both hand these. */
type ModuleReads = { lists?: () => readonly ListShape[]; metrics?: () => readonly MetricDecl[]; packOf?: (id: string) => string | null };

/** The pack a declaration's own body names, `pack:`, or `null`. */
const packSaid = (body: unknown): string | null => {
  const p = body !== null && typeof body === 'object' ? (body as { pack?: unknown }).pack : undefined;
  return typeof p === 'string' && p !== '' ? p : null;
};

/**
 * The module or add-on a figure came with: the host's word for it (`packOf`), else the figure's own `pack:`, else the
 * module of the list it counts, which is where a first-party pack places a figure that names none.
 */
function moduleOf(src: ModuleReads, decl: MetricDecl, lists: readonly ListShape[]): string | null {
  const said = src.packOf?.(`metric.${decl.metric}`) ?? packSaid(decl);
  if (said) return said;
  if (typeof decl.source !== 'string' || !decl.source.startsWith('register.')) return null;
  const list = decl.source.slice('register.'.length);
  return src.packOf?.(`register.${list}`) ?? packSaid(lists.find((l) => l.id === list));
}

/**
 * `<module>.<figure>`: the figure an installed module or add-on declares under that word, or `null`.
 *
 * A MODULE IS INSTALLED WHEN IT HAS A FIGURE ON THE RECORD, so a module that was turned off, whose declarations are
 * retired, answers nothing. Among its figures the word is, in this order: the figure's id (`work.open-tasks`); its id
 * with the module's own word before it (`<module>-<word>`); or the one figure that is the plain total of a field of
 * that name (`{ sum: <word> }`), which is how `{{portfolio.revenue}}` reads what the projects say they earn. Two figures
 * totalling the same field answer nothing, as does a figure that waits for a parameter, since neither is one figure.
 */
function moduleFigure(src: ModuleReads, module: string, word: string): MetricDecl | null {
  if (!src.metrics || !/^[a-z][a-z0-9_-]*$/.test(module)) return null;
  const lists = src.lists?.() ?? [];
  const figures = src.metrics().filter((d) => moduleOf(src, d, lists) === module);
  const by = (id: string) => figures.find((d) => d.metric === id) ?? null;
  const totals = figures.filter((d) => {
    const v = d.value as unknown;
    return v !== null && typeof v === 'object' && Object.keys(v).length === 1 && (v as { sum?: unknown }).sum === word && !JSON.stringify(d).includes('{{');
  });
  return by(word) ?? by(`${module}-${word}`) ?? (totals.length === 1 ? totals[0]! : null);
}

/**
 * `<list>#<n>.<field>.<part>`: one step into a row's field, or nothing.
 *
 * - A LINK'S ROW: `tasks#1.project.name` is the name of the project the task points at, a field that list declares and
 *   a reader may be shown, and only to a reader of both lists. One step: a link on the far row is not followed.
 * - A MONEY'S `amount` (minor units) or `currency`, so a sentence can say the two apart.
 * - A LIST FIELD'S `count`, how many it holds, nought when it holds none.
 * - A long field is still nothing, as it is a step nearer (`05 §7.1` rule 2), and so is any other part.
 */
function stepValue(deps: PageDeps, said: { register: string; seq: number; field: string; then: string }): Json | undefined {
  const spec = stepSpec(deps, said);
  const reads = deps.ctx.reads;
  if (!spec || (reads !== undefined && !reads(said.register))) return undefined;
  const row = rowAt(deps, said.register, said.seq);
  return row ? stepOn(deps, spec, row, said.field, said.then) : undefined;
}

/**
 * The step itself, from a row in hand: a row by spoken id, or the page's own row (`<field>.<part>`, rule 4 of
 * `PATH_ORDER`). The list a link points at is still held to a reader of it.
 */
function stepOn(deps: PageDeps, spec: { type: string; to?: string | undefined }, row: Entry, field: string, then: string): Json | undefined {
  const reads = deps.ctx.reads;
  const held = Object.hasOwn(row.fields, field) ? row.fields[field] : undefined;
  if (spec.type === 'list') return Array.isArray(held) ? held.length : 0;
  if (spec.type === 'money') {
    const m = figure(held);
    return m !== null && typeof m === 'object' && !Array.isArray(m) ? m[then] : undefined;
  }
  const to = spec.to!;
  if (typeof held !== 'string' || held === '' || (reads !== undefined && !reads(to))) return undefined;
  const far = deps.list({ register: to, where: { field: 'id', is: held }, limit: 1 });
  const hit = far.ok ? far.value.rows[0] : undefined;
  return hit && Object.hasOwn(hit.fields, then) ? figure(hit.fields[then]) : undefined;
}

/**
 * The field a step is taken through, when the step is one the record reads: a link and a field of the list it points
 * at that a reader may be shown, a money and `amount` or `currency`, or a list field and `count`. `null` otherwise.
 */
function stepSpec(deps: PageDeps, said: { register: string; field: string; then: string }): { type: string; to?: string | undefined } | null {
  const schema = deps.schemaOf(said.register);
  const spec = schema && Object.hasOwn(schema.fields, said.field) ? schema.fields[said.field] : undefined;
  if (!spec) return null;
  if (spec.type === 'money') return said.then === 'amount' || said.then === 'currency' ? spec : null;
  if (spec.type === 'list') return said.then === 'count' ? spec : null;
  if (spec.type !== 'ref' || typeof spec.to !== 'string' || spec.to === '') return null;
  const far = deps.schemaOf(spec.to);
  const part = far && Object.hasOwn(far.fields, said.then) ? far.fields[said.then] : undefined;
  return part && FIGURES.has(part.type) ? spec : null;
}

/** What a sentence may say about the rows a figure counts: the first one's name, a few names, how many besides, and since when. */
const ROW_PARTS = ['first', 'names', 'more', 'since'] as const;
type RowPart = (typeof ROW_PARTS)[number];

/** The parts of a money figure a sentence may name: each currency apart, the sum converted, the rates' day, its parts held. */
const CONVERTED_PARTS = ['apart', 'converted', 'rate_on', 'rate_age', 'groups'] as const;
type ConvertedPart = (typeof CONVERTED_PARTS)[number];

/**
 * `{{cash-now.apart}}`: a money figure in each currency it holds, never converted, then `{{cash-now.converted}}` the one
 * amount those come to in the home currency, to whole units, and `{{cash-now.rate_on}}` the day of the rates it took and `{{cash-now.rate_age}}` how old they are.
 *
 * - `apart` IS ALWAYS SAID, one amount where there is one currency, so a line can open on it on any record.
 * - `converted` AND `rate_on` ARE SAID ONLY WHERE THE FIGURE WAS CONVERTED FROM ANOTHER CURRENCY, so a record that keeps
 *   one currency, or one with no rate, has neither, and a sentence drops the clause and reads as it always did.
 * - `converted` IS ROUNDED TO WHOLE UNITS because a sum at one day's rate is about that much, never to the penny.
 */
function convertedValue(deps: PageDeps, decl: MetricDecl, part: ConvertedPart): Json | undefined {
  if (!mayRead(deps, decl)) return undefined;
  /* `groups` IS HOW MANY PARTS A GROUPED FIGURE HAS, every one its bar draws (Q9 of 29 October): "Spread over 6
     accounts" stood over a tile of seven rows, since an account at nought is drawn, at nought, and was not counted. */
  if (part === 'groups') {
    const read = deps.read(decl);
    if (!read.ok || !read.value.groups) return undefined;
    return read.value.groups.length;
  }
  if (part === 'apart') {
    const apart = deps.readApart?.(decl);
    if (!apart?.ok) return undefined;
    const parts = apart.value.parts;
    if (parts && parts.length > 0) return parts.map((p) => ({ amount: p.amount, currency: p.currency }));
    return apart.value.value !== null && apart.value.unit !== null ? { amount: apart.value.value, currency: apart.value.unit } : undefined;
  }
  const read = deps.read(decl);
  if (!read.ok || read.value.value === null || read.value.unit === null || !read.value.fx?.asOf) return undefined;
  if (part === 'rate_on') return read.value.fx.asOf;
  /* `rate_age` IS HOW OLD THOSE RATES ARE, in words: "under a day old", "1 day old", "29 days old". */
  if (part === 'rate_age') {
    const today = localDays(readableZone(deps.ctx.tz ?? deps.tz))(deps.ctx.asOfMs ?? deps.ctx.nowMs);
    const days = Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${read.value.fx.asOf}T00:00:00Z`)) / 86_400_000));
    return days === 0 ? 'under a day old' : days === 1 ? '1 day old' : `${days} days old`;
  }
  const unit = 10 ** exponentOf(read.value.unit);
  return { amount: Math.round(read.value.value / unit) * unit, currency: read.value.unit };
}

/** The parts of a walk to zero a sentence may name: the day it goes under, what falls due then, and that money; and the lowest it reaches and that day. */
const CROSSING_PARTS = ['on', 'because', 'because_amount', 'low', 'low_on'] as const;
type CrossingPart = (typeof CROSSING_PARTS)[number];

/**
 * `{{lasts-no-income.on}}`: where a figure's walk to zero goes under, as a sentence names it, so "79 days" can say it
 * lasts to Wed 13 Jan, when the second part of the house is due.
 *
 * - `on` is the day of the step that leaves the balance under, the same day `zero_on` holds; `because` what that step
 *   is, as the walk labels it; `because_amount` its money, said as an amount going out.
 * - THE FIGURE'S OWN WALK, read as the figure is (`readWalk`'s `under`), so the day and the count of days cannot
 *   disagree. A walk that never goes under, that opens under, or that a reader may not see has none, and a sentence
 *   then drops the clause, as it does any figure it cannot read.
 */
function crossingValue(deps: PageDeps, decl: MetricDecl, part: CrossingPart): Json | undefined {
  if (decl.source !== WALK_SOURCE || !walksToZero((decl.value as { walk?: unknown } | undefined)?.walk) || !mayRead(deps, decl)) return undefined;
  /* `.low` AND `.low_on` ARE THE LOWEST THE SAME WALK REACHES IN THE NEXT TWELVE WEEKS AND THE FIRST DAY IT DOES (audit
     31 Oct f, AF4), the low point the hero's Cash now draws beside its walk (`aheadOf` over `12w`), so the line Money
     opens on and the tile under it say one low point. A walk that cannot be one walk has none, and the clause drops. */
  if (part === 'low' || part === 'low_on') {
    const walked = aheadOf(deps, decl.metric, '12w');
    if ('refusal' in walked || !walked.ahead) return undefined;
    return part === 'low_on' ? walked.ahead.low.day : { amount: walked.ahead.low.value, currency: walked.ahead.currency };
  }
  const read = deps.read(decl);
  const under = read.ok ? read.value.under : undefined;
  if (!under) return undefined;
  if (part === 'on') return under.day;
  if (part === 'because') return under.label !== '' ? under.label : undefined;
  return under.currency !== null ? { amount: under.amount, currency: under.currency } : under.amount;
}

/** How many rows `.names` names before it says how many more. */
const NAMED_MOST = 3;

/**
 * A few names as a person lists them: `A`, `A and B`, `A, B and C`, and past `NAMED_MOST` `A, B and 4 more`. A row with
 * no title is counted in the more, so one name over three rows is `A and 2 more` and never `A` alone.
 */
function namesSaid(names: readonly string[], total: number): string {
  if (names.length === 0) return '';
  if (names.length === total && total <= NAMED_MOST) return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names.at(-1)!}`;
  const said = names.slice(0, 2);
  return `${said.join(', ')} and ${total - said.length} more`;
}

/** The first day or instant field a predicate compares, which is the line the figure draws (`by before today`). */
function dayFieldOf(node: Predicate | undefined, schema: Schema): string | null {
  if (!node) return null;
  for (const q of ['all', 'any', 'none'] as const)
    if (q in node) {
      for (const n of (node as Record<typeof q, Predicate[]>)[q]) {
        const found = dayFieldOf(n, schema);
        if (found) return found;
      }
      return null;
    }
  const leaf = node as { field?: unknown; via?: unknown };
  if (typeof leaf.field !== 'string' || leaf.via !== undefined || !Object.hasOwn(schema.fields, leaf.field)) return null;
  const type = schema.fields[leaf.field]!.type;
  return type === 'day' || type === 'instant' ? leaf.field : null;
}

/**
 * `{{tasks-late-yours.first}}`: the rows a counting figure counts, as a sentence names them, so a page's line can say
 * "Turn auto-renew back on is late" where it said "1 late", and "Kiln and Portage need a push" where it said "2 at risk".
 *
 * - `first` is the first row's title, `names` the first few listed as a person lists them (`namesSaid`), `more` how
 *   many the figure counts besides the first, and `since` the first row's day on the line the figure draws.
 * - `first_<field>` is one field of that first row, a field its list declares and a reader may be shown, so a sentence
 *   names the amount beside the name: "{{orders-owed.first}} still owes {{money:orders-owed.first_owed}}".
 * - FIRST IS THE ONE FURTHEST PAST THE LINE: rows are ordered by the first day field the figure's `where` compares,
 *   oldest first, so the task late longest and the person quiet longest lead. A figure that compares no day keeps the
 *   list's own order.
 * - Over a list the reader may not open, or a figure that is not a list's rows, this is nothing, and a lead note then
 *   drops the clause (`leadOf`) as it does any figure it cannot read.
 */
function rowsValue(deps: PageDeps, decl: MetricDecl, part: RowPart, field?: string): Json | undefined {
  /* A FIGURE THAT SAYS ITS OWN NAMES (`TidyReading.names`, the tidy's `tidied-week` and `gone-stale`): its reading's words, for `.names` alone. */
  if (!decl.source.startsWith('register.')) {
    if (part !== 'names' || field !== undefined || !mayRead(deps, decl)) return undefined;
    const read = deps.read(decl);
    const names = read.ok ? (read.value as { names?: unknown }).names : undefined;
    return typeof names === 'string' && names !== '' ? names : undefined;
  }
  if (!mayRead(deps, decl)) return undefined;
  const register = decl.source.slice('register.'.length);
  const schema = deps.schemaOf(register);
  const title = deps.titleOf(register);
  if (!schema || !title) return undefined;
  /* A FIELD OF THE FIRST ROW is one its list declares and a reader may be shown: never a document or a secret. A REF
     IS SAID BY THE NAME OF THE ENTRY IT POINTS AT (uc6-shop-49), so "Salma still owes EGP 1,350" names Salma, and only
     to a reader of the list it points at. */
  const spec = field === undefined ? undefined : schema.fields[field];
  const isRef = spec?.type === 'ref' && typeof spec.to === 'string' && spec.to !== '';
  if (field !== undefined && !(spec !== undefined && (FIGURES.has(spec.type) || isRef))) return undefined;
  const said = predicateOf(decl.where, schema, deps.ctx);
  if (said.bad.length) return undefined;
  const by = dayFieldOf(said.predicate, schema);
  const listed = deps.list({ register, where: said.predicate, limit: NAMED_MOST, ...(by ? { order: [{ field: by, dir: 'asc' as const }] } : {}) });
  if (!listed.ok || listed.value.rows.length === 0) return undefined;
  const { rows, matched } = listed.value;
  if (part === 'more') return Math.max(0, matched - 1);
  const named = (r: (typeof rows)[number]): string | null => {
    const n = r.fields[title];
    return typeof n === 'string' && n.trim() !== '' ? n : null;
  };
  /* `first` AND `since` ARE THE SAME ROW, the first with a title, so "Pell & Vine has been quiet since April" is one
     person's name and that person's day. */
  const lead = rows.find((r) => named(r) !== null);
  /* `first_<field>` IS THE SAME ROW AS `first`, so the name and the amount in "Salma still owes EGP 1,350" are one row's. */
  if (field !== undefined) {
    const row = lead ?? rows[0]!;
    if (!Object.hasOwn(row.fields, field)) return undefined;
    const value = row.fields[field];
    if (!isRef) return figure(value);
    const to = spec!.to!;
    if (typeof value !== 'string' || (deps.ctx.reads !== undefined && !deps.ctx.reads(to))) return undefined;
    const t = deps.titleOf(to);
    if (!t) return undefined;
    const hit = deps.list({ register: to, where: { field: 'id', is: value }, limit: 1 });
    const name = hit.ok ? hit.value.rows[0]?.fields[t] : undefined;
    return typeof name === 'string' && name.trim() !== '' ? name : undefined;
  }
  if (part === 'since') {
    const day = by === null ? undefined : (lead ?? rows[0]!).fields[by];
    return typeof day === 'string' && day !== '' ? day : undefined;
  }
  const names = rows.flatMap((r) => named(r) ?? []);
  if (names.length === 0) return undefined;
  return part === 'first' ? names[0]! : namesSaid(names, matched);
}

/** How far before the remembered point a figure's change may look for one, past the day its window names. */
const CHANGE_SLACK_DAYS = 7;

/**
 * `{{cash-now.change}}`: how far a figure moved since its window ago, as a signed whole percent (`+8%`, `−8%`, `0%`), or
 * nothing.
 *
 * AGAINST WHAT THE RECORD REMEMBERED, NOT A SECOND READ. Cash now is a balance, and the same rows read a month back say
 * today's balance again, so the figure's own comparison (`delta`) is empty for exactly the figure a headline wants to
 * say moved. The night's point is what the figure was (`metric_point`), so the change is now against the newest point
 * on or before the day the window names (30 days for `window: 30d`), looking at most a week further back for one.
 *
 * NOTHING WHEN THERE IS NOTHING TRUE TO SAY, and a lead note then drops the clause (`leadOf`): no point that old, a
 * figure in several currencies or none, a point written in another currency than today's figure (two currencies are
 * never set against each other), or a point at nought, which no percent is of.
 */
function changeOf(deps: PageDeps, decl: MetricDecl, words = false): Json | undefined {
  if (!deps.points) return undefined;
  const read = deps.read(decl);
  if (!read.ok || read.value.parts || read.value.value === null || read.value.refusals.length) return undefined;
  const now = read.value.value;
  const DAY = 86_400_000;
  const span = windowMs(decl.window ?? '30d') ?? 30 * DAY;
  const days = Math.max(1, Math.round(span / DAY));
  const at = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const clock = deps.ctx.asOfMs ?? deps.ctx.nowMs;
  const then = deps.points(decl.metric, at(clock - (days + CHANGE_SLACK_DAYS) * DAY), at(clock - days * DAY)).at(-1);
  if (!then || !Number.isFinite(then.value) || then.value === 0) return undefined;
  /* A POINT IS KEPT AS THE NIGHT WROTE IT (`metrics.ts` `point`): a bare number with no unit, `''` or `count`, and a
     fraction scaled to basis points under `pct.bp`. Read as it was stored, an average of 1.25 a month ago was a unit
     today's 1.5 does not have, and never said it moved. */
  const bare = (unit: string | null | undefined): string | null => (!unit || unit === 'count' || unit === 'pct.bp' ? null : unit);
  if (bare(then.unit) !== bare(read.value.unit)) return undefined;
  const was = then.unit === 'pct.bp' ? then.value / 10_000 : then.value;
  const pct = Math.round(((now - was) / Math.abs(was)) * 100);
  if (words) return pct > 0 ? `${pct}% up` : pct < 0 ? `${-pct}% down` : '0%';
  return pct > 0 ? `+${pct}%` : pct < 0 ? `−${-pct}%` : '0%';
}

/**
 * A template page's block with every `{{field}}` of its row taken out of `unnamed`: `fill` writes each field the row
 * holds and leaves the hole where it holds nothing, and that hole is "a field on this row" (`05 §7.1`) with no value, so
 * it draws its dash. Marked unnamed, a project with no note printed `{{note}}` as the author's typo.
 */
function rowNamed(deps: PageDeps, row: Entry | undefined, read: BlockResult): BlockResult {
  if (!row || !read.unnamed) return read;
  const schema = deps.schemaOf(row.register);
  if (!schema) return read;
  const left = read.unnamed.filter((path) => !Object.hasOwn(schema.fields, path));
  if (left.length === read.unnamed.length) return read;
  const { unnamed: _all, ...rest } = read;
  return left.length ? { ...rest, unnamed: left } : rest;
}

/**
 * Every path in a block the record holds a value for, and every path that names nothing at all, each `undefined` when
 * there are none.
 *
 * TWO DIFFERENT SILENCES. A path the record knows and holds no value for draws `—`: Cash now with no balance yet. A path
 * that names no figure, list, row, field or value is the author's words and not a question, `{{portfolio.revnue}}`, and
 * a host draws it as written and marked (`unnamed`), never as a dash that reads like a number still to come. Before
 * this the two answered the same, so 48 paths on the owner's record drew a dash for a typo. Only a path with no value is
 * asked whether it names anything, so a block whose paths all hold values costs no read more than it did.
 */
function valuesOf(
  deps: PageDeps,
  block: PageBlock,
): { values?: Record<string, Json>; values_fx?: Record<string, FxRead>; read_as?: Record<string, ReadAs>; values_as_of?: Record<string, string>; unnamed?: string[] } {
  const out: Record<string, Json> = {};
  const fx: Record<string, FxRead> = {};
  const as: Record<string, ReadAs> = {};
  const aged: Record<string, string> = {};
  const unnamed: string[] = [];
  for (const path of pathsOf(block, (id) => figureNamed(deps, id))) {
    const how: { fx?: FxRead; as?: ReadAs; asOf?: string } = {};
    const v = valueAt(deps, path, how);
    if (v !== undefined) out[path] = v;
    else if (!namedAt(deps, path)) unnamed.push(path);
    /* AND WHICH RULE READ IT, for every path that holds a value. */
    if (v !== undefined && how.as) as[path] = how.as;
    /* A FIGURE'S CONVERSION GOES OUT BESIDE ITS AMOUNT (rates-foot-note-80), so a sentence can say its rates are old. */
    if (v !== undefined && how.fx) fx[path] = how.fx;
    /* AND THE DAY IT WAS STATED ON, so a sentence can say its age once it is old. */
    if (v !== undefined && how.asOf) aged[path] = how.asOf;
  }
  return {
    ...(Object.keys(out).length ? { values: out } : {}),
    ...(Object.keys(fx).length ? { values_fx: fx } : {}),
    ...(Object.keys(as).length ? { read_as: as } : {}),
    ...(Object.keys(aged).length ? { values_as_of: aged } : {}),
    ...(unnamed.length ? { unnamed } : {}),
  };
}

/** A figure by its id, declared or built in, as `registersOf` finds one. */
const figureNamed = (deps: PageDeps, id: string): boolean => (deps.metric(id) ?? builtInFigure(id)) !== null;

/** Whether `state` is one of the values a list's state field holds, which `<list>.<state>` counts. */
function stateNamed(deps: PageDeps, register: string, state: string): boolean {
  const schema = LIST_ID.test(register) ? deps.schemaOf(register) : null;
  const field = schema?.state;
  const spec = schema && field !== undefined && Object.hasOwn(schema.fields, field) ? schema.fields[field] : undefined;
  return spec?.type === 'enum' && (spec.values ?? []).includes(state);
}

/**
 * Whether a path names something the record has, whatever it holds now: a figure (declared or built in), a list (its
 * count, or a value of its state), or a row's field. A row is asked for only when the list and the field are known, so
 * `tasks#999.title` is a row nobody has, and `tasks#3.title` with no title is named and draws its dash.
 *
 * A READ THE CALLER MAY NOT MAKE IS NAMED, never unnamed: whether a list's row exists is not told to somebody who cannot
 * open it, and the path draws the dash it drew before.
 */
function namedAt(deps: PageDeps, path: string): boolean {
  const parsed = pathOf(path, deps.here ? deps.schemaOf(deps.here.register)?.fields : undefined);
  if (!parsed) return false;
  if ('own' in parsed) return true;
  if ('measure' in parsed) return newestReading(deps, parsed.measure, parsed.period) !== null;
  if ('metric' in parsed) return figureNamed(deps, parsed.metric);
  /* ONE STEP NAMES SOMETHING WHEN THE STEP IS ONE THE RECORD READS and the row is there: `tasks#1.project.nmae` is the
     author's typo, and a link through a list the caller may not open is named and draws its dash. */
  if ('then' in parsed) return stepSpec(deps, parsed) !== null && rowThere(deps, parsed.register, parsed.seq);
  const two = twoOf(parsed);
  if (two) {
    /* BY THE SAME ORDER `valueAt` READS BY (`PATH_ORDER`), so a path one rule names is never drawn as words nobody
       knows. A reading the record does not hold names nothing, and draws as the author wrote it. */
    return PATH_ORDER.some((rule) => rule.names(deps, parsed, two));
  }
  if (!('seq' in parsed)) return false;
  const schema = deps.schemaOf(parsed.register);
  if (!schema || !Object.hasOwn(schema.fields, parsed.field)) return false;
  return rowThere(deps, parsed.register, parsed.seq);
}

/** Whether a row is there, and a read the caller may not make answers that it is, so its dash is drawn as before. */
function rowThere(deps: PageDeps, register: string, seq: number): boolean {
  const listed = deps.list({ register, where: { field: 'seq', is: seq }, limit: 1 });
  return !listed.ok || listed.value.rows.length > 0;
}

/**
 * The registers ONE block draws from, for a caller deciding whether to blank it.
 *
 * The same walk as `registersOf` over a single block, and it exists because the record checked
 * `block.source` alone: a `stat` block has none, so its readings were never blanked for a caller
 * who cannot read the register behind them.
 */
export function registersOfBlock(block: PageBlock, metric?: (id: string) => MetricDecl | null, beside?: ListsBeside): string[] {
  return registersOf({ page: '', title: '', blocks: [block] }, metric, beside);
}

/* ── what a module's page reads across the lists ─────────────────────────── */

/**
 * The list a row named by its spoken id is on, `obligations` for `obligations#4`, or `null` for anything else.
 *
 * ONE READING FOR THREE SOURCES: a feed row's target, a question's `about` and a deadline's row are each a spoken id when
 * they name a row, so `list is obligations` means the same thing over `activity`, `governance.open` and `deadlines`. A
 * question whose `about` is a word rather than a row is on no list, and says `null` rather than a guess.
 */
function listOf(said: string | null | undefined): string | null {
  const m = typeof said === 'string' ? SPOKEN.exec(said) : null;
  return m ? m[1]! : null;
}

/**
 * The record's home currency and dated rates, beside a walk as beside a bar or a split, when it holds either.
 *
 * SO A HOST SHOWING A WALK IN ANOTHER CURRENCY CONVERTS WITH THE RECORD'S RATES, the ones the walk itself was added up
 * with, and never with a table of its own that could disagree with the figure above it.
 */
function fxOf(deps: PageDeps): { fx?: { home: string | null; rates: Rate[] } } {
  const held = deps.ctx.fx?.();
  return held && (held.home !== null || held.rates.length > 0) ? { fx: { home: held.home, rates: [...held.rates] } } : {};
}

/**
 * How far a forecast walks unasked when it offers longer lengths than it opens on: two years and a day. It is the
 * longest length the shipped Cash ahead offers (money-core 3.9.0, `packages/seed`), so every choice on Money's knob is
 * a press away without asking, and a block offering five years or ten, or `last` over a long plan, walks two at most.
 * A walk opening on longer than this walks what it opens on.
 */
export const WALK_UNASKED = 731;

/**
 * How far a forecast block walks: its `horizon:`, and the longer of its `horizons:` that fall within `WALK_UNASKED`, or
 * one of its `horizons:` a reader asked for (`asked`, `PageDeps.walk`). `last` is walked as it says, and a block that
 * names no length walks the record's default.
 *
 * NOT THE LONGEST LENGTH THE KNOB OFFERS, UNASKED. Every page load walked it: Money's Cash ahead opened on 90 days and
 * offered five years, so each load walked 1,825 days for a chart that opened on three months, five times the work it
 * did before, and a block offering ten years walked ten whatever it opened on. So a walk reaches past what it opens on
 * only as far as `WALK_UNASKED`, and a longer length is walked when a reader picks it, which the host asks for with
 * `walk`. A length the block does not offer is not walked whoever asks, so `horizons:` stays the bound on the work, and
 * one the walk reaches unasked is walked as it would be unasked, so asking never shortens what the knob offers.
 *
 * `last` AMONG `horizons:` IS A LENGTH TOO, and only the rows know how long: a block opening on 90 days that offers
 * `last` walked 90, so "To the end" stopped at three months over a plan that runs two years. It walks to the last dated
 * movement and never short of the longest number within reach (`Horizon`'s `{ last: n }`), and unasked no further than
 * `WALK_UNASKED` (`most`).
 */
function walkReach(block: PageBlock, asked?: number | 'last'): Horizon | undefined {
  if (typeof block.horizon !== 'number') return block.horizon;
  const opens = block.horizon;
  const offered = Array.isArray(block.horizons) ? block.horizons : [];
  const longer = offered.filter((h): h is number => typeof h === 'number' && Number.isInteger(h) && h > opens && h <= HORIZON_CAP);
  const toEnd = offered.includes('last');
  /* ASKED, AND OFFERED: walked in full, to `HORIZON_CAP` at most, as the block declared it. */
  if (asked === 'last' && toEnd) return { last: Math.max(opens, ...longer) };
  const cap = Math.max(opens, WALK_UNASKED);
  if (typeof asked === 'number' && asked > cap && longer.includes(asked)) return toEnd ? { last: asked } : asked;
  const most = Math.max(opens, ...longer.filter((h) => h <= cap));
  return toEnd ? { last: most, most: cap } : most;
}

/** How many lengths a forecast's horizon knob may offer: more is a list to read, not a choice to make. */
const HORIZONS_MOST = 8;

/** Whether `horizons:` is a list the knob can offer: one to `HORIZONS_MOST` lengths, each whole days or `last`. */
function horizonsOk(said: unknown): boolean {
  return (
    Array.isArray(said) &&
    said.length >= 1 &&
    said.length <= HORIZONS_MOST &&
    said.every((h: unknown) => h === 'last' || (typeof h === 'number' && Number.isInteger(h) && h >= 1))
  );
}

/**
 * Every list a figure reads, `figure` resolving the one a walk opens from.
 *
 * NOT ITS `source` ALONE: a cash figure rolled forward reads its moves and its checks beside its accounts, and a walk
 * reads each list its legs walk (`money-figures.ts` `figureLists`), so a figure pinned to Home or offered to the sell
 * knob named by its source would hand a member invited to Accounts the sum of Transactions she cannot open.
 */
const listsRead = (decl: MetricDecl, figure: (id: string) => MetricDecl | null, pointsAt?: PointsAt): string[] =>
  /* The count of open questions names the whole record there (`WHOLE_RECORD`), as the queue over the same source does.
     AND THE LIST A GROUPED FIGURE'S PARTS ARE NAMED FROM (`pointsAt`), so a block drawing Cash now by book, whose parts
     carry the books' names, is held from a reader who may not open Books as it is from one who may not open Accounts. */
  typeof decl.source === 'string' ? figureLists(decl, figure, pointsAt) : [];

/** `PointsAt` from the record's lists as `registersOf` is handed them, or `undefined` without them. */
function pointsBeside(beside: ListsBeside | undefined): PointsAt | undefined {
  const lists = beside?.lists?.();
  if (!lists) return undefined;
  return (register, field) => {
    const f = lists.find((l) => l.id === register)?.fields.find((x) => x.id === field);
    return f?.type === 'ref' && typeof f.to === 'string' && f.to !== '' ? f.to : null;
  };
}

/**
 * Whether the reader may read every list behind a figure. A host that has not said who is reading (`EvalContext.reads`
 * absent) reads everything, and the record then holds the whole block from a reader by the lists `registersOf` names.
 */
const mayRead = (deps: PageDeps, decl: MetricDecl): boolean => {
  const reads = deps.ctx.reads;
  const pointsAt: PointsAt = (register, field) => {
    const spec = deps.schemaOf(register)?.fields[field];
    return spec?.type === 'ref' && typeof spec.to === 'string' && spec.to !== '' ? spec.to : null;
  };
  return reads === undefined || listsRead(decl, deps.metric, pointsAt).every((list) => reads(list));
};

/** How many figures a sell knob with no `sell:` reads at most, so a record with many sellable figures reads a few. */
const SELLS_MOST = 8;

/** A figure a walk may count as sold, and the currency it is written in, before any one walk is asked about. */
type Sellable = { label: string; value: number; unit: string | null };

/**
 * Every figure a sell knob with no `sell:` may count as sold, in whatever money each is: each the record declares
 * `sellable: true` and the reader may read, that holds more than nothing, called by the name it is declared with.
 * `null` when the block offers no sell knob, and then nothing was read.
 *
 * READ ONCE FOR A GROUP OF WALKS, since each walk of a group takes its own from the one reading (`walkSells`).
 */
function sellableFigures(deps: PageDeps, block: PageBlock): Sellable[] | null {
  if (!deps.metrics || !Array.isArray(block.knobs) || !block.knobs.includes('sell')) return null;
  const held: Sellable[] = [];
  const offered = deps.metrics().filter((d) => d.sellable === true && mayRead(deps, d));
  for (const decl of offered.slice(0, SELLS_MOST)) {
    const read = deps.read(decl);
    if (!read.ok || read.value.refusals.length) continue;
    const worth = read.value.value;
    if (typeof worth === 'number' && Number.isFinite(worth) && worth > 0)
      held.push({ label: typeof decl.name === 'string' && decl.name.trim() !== '' ? decl.name : decl.metric, value: worth, unit: read.value.unit ?? null });
  }
  return held;
}

/**
 * Every figure a sell knob with no `sell:` may count as sold in one walk: those of `sellableFigures` in the walk's own
 * money.
 *
 * NOTHING HERE IS REFUSED. `sell:` names one figure, and its author is told when it cannot be read; a sellable figure
 * this page never named that cannot be read, or is in another currency, is left off the knob, and the walk is right
 * without it. A block drawn once per currency has no one currency (`null`) and is offered none on the block itself:
 * each of its walks is offered its own (`walkSells`).
 */
function sellables(deps: PageDeps, block: PageBlock, currency: string | null, figures?: Sellable[] | null): { sells?: { label: string; value: number }[] } {
  if (currency === null) return {};
  const held = figures === undefined ? sellableFigures(deps, block) : figures;
  return held ? { sells: held.filter((f) => f.unit === currency).map(({ label, value }) => ({ label, value })) } : {};
}

/**
 * A block drawn as a group of walks, with what each walk may count as sold written on that walk, in that walk's money.
 *
 * ONE `sells` ON THE BLOCK WOULD BE EVERY WALK'S, since a host draws each walk with the block's keys spread over it, and
 * a holding in dollars would then be sold out of the pound walk as pounds. So the answer is by walk: a holding is
 * offered under the walk of its own currency and no other, and a walk nothing is held in is offered an empty list. A
 * walk with no currency is offered nothing. A `sell:` that could not be read was already refused by the source.
 */
function walkSells(deps: PageDeps, block: PageBlock, out: BlockResult): BlockResult {
  if (!out.walks || out.walks.length === 0) return out;
  const figures = block.sell === undefined ? sellableFigures(deps, block) : undefined;
  if (figures === null) return out;
  const walks = out.walks.map((w) => {
    const sold = figures === undefined ? sellsOf(deps, block, w.currency) : sellables(deps, block, w.currency, figures);
    return 'refusal' in sold || sold.sells === undefined ? w : { ...w, sells: sold.sells };
  });
  return { ...out, walks };
}

/** How many figures Home pins at most. */
const FIGURES_HOME_MOST = 4;

/**
 * The figures pinned to Home: every metric declaring `home:` a whole number from 1 to 9, in that order, the metric's id
 * breaking a tie, and at most `FIGURES_HOME_MOST` of them. `reads` leaves out a figure the reader may not read.
 *
 * `home` IS CHECKED AGAIN HERE THOUGH THE INSTALL CHECKS IT (`declare.ts` `HOME_PLACE_MOST`), because this reads the
 * stored JSON and not the install's answer: a place outside 1 to 9 is no place, and the figure is left off Home.
 */
function pinnedOf(metrics: readonly MetricDecl[], reads?: (decl: MetricDecl) => boolean): MetricDecl[] {
  const at = (d: MetricDecl): number => {
    const h: unknown = d.home;
    return typeof h === 'number' && Number.isInteger(h) && h >= 1 && h <= 9 ? h : 0;
  };
  return metrics
    .filter((d) => at(d) > 0 && (reads === undefined || reads(d)))
    .sort((a, b) => at(a) - at(b) || (a.metric < b.metric ? -1 : a.metric > b.metric ? 1 : 0))
    .slice(0, FIGURES_HOME_MOST);
}

/**
 * The lists a block that reads across them may read, for `registersOf`: every list holding a deadline, the lists behind
 * each figure pinned to Home, and behind each figure a sell knob with no `sell:` may offer (`listsRead`). `*` for any
 * of them whose declarations the caller did not hand over (`beside`), so an unknown is never a licence.
 */
function acrossLists(block: PageBlock, beside: ListsBeside | undefined): string[] {
  if (block.source === 'deadlines') {
    const lists = beside?.lists?.();
    if (!lists) return [WHOLE_RECORD];
    return lists.filter((l) => l.fields.some((f) => f.deadline === true && f.type === 'day' && f.retired !== true)).map((l) => l.id);
  }
  const offers =
    block.source === 'figures.home'
      ? 'home'
      : block.source === 'forecast.runway' && block.sell === undefined && Array.isArray(block.knobs) && block.knobs.includes('sell')
        ? 'sellable'
        : null;
  if (offers === null) return [];
  const metrics = beside?.metrics?.();
  if (!metrics) return [WHOLE_RECORD];
  const chosen = offers === 'home' ? pinnedOf(metrics) : metrics.filter((d) => d.sellable === true);
  const figure = (id: string): MetricDecl | null => metrics.find((m) => m.metric === id) ?? null;
  return chosen.flatMap((d) => listsRead(d, figure, pointsBeside(beside)));
}

/**
 * What a source module is handed beside the record's reads: the helpers and the words of this file and of the kernel
 * that its read needs, which it cannot import (`sources/index.ts` says why a module is a leaf at run time).
 *
 * ONE OBJECT FOR EVERY SOURCE, made once, since nothing in it is about one block: each module takes the names it uses.
 * AT THE FOOT OF THE FILE, so every word in it is made by the time it is; it is read only when a block is.
 */
const SOURCE_KIT = {
  predicateOf,
  /* the feed */
  byOf,
  listOf,
  agentRows,
  feedRows,
  feedSaysFault,
  /* the questions */
  staleAt,
  BODY_KINDS,
  COSTS,
  /* the runs, and what is called by a run */
  SESSION,
  SESSION_PREFIX,
  SPOKEN,
  HANDOFFS_OPEN,
  agentOf,
  isQuiet,
  presenceOf,
  projectsOf,
  recordNamed,
  markOf,
  typesOf,
  quietSign,
  /* what falls due */
  localDays,
  readableZone,
  /* the figures pinned to Home */
  pinnedOf,
  mayRead,
  readBlock,
  /* the cash walk */
  openingOf,
  walkReach,
  recordedOf,
  latenessOf,
  sellsOf,
  pastIn,
  fxOf,
  /* the key numbers: their rules (`kpi-rank.ts`), every row of a list, a figure with its project filled, money said */
  kpiRank,
  kpisFault,
  everyRow,
  fill,
  moneyText,
  exponentOf,
  isBucket,
  bucketStart,
};
export type SourceKit = typeof SOURCE_KIT;

/**
 * The kit a source is handed on this read: the one kit, and where the host reads runs (`runOf`) a feed's two row makers
 * with that read in hand, so every line a run signed says who the run is (`run_by`) without a source asking for it.
 */
function sourceKit(deps: PageDeps): SourceKit {
  const runOf = deps.runOf;
  if (!runOf) return SOURCE_KIT;
  return {
    ...SOURCE_KIT,
    feedRows: (events, first, own, says) => feedRows(events, first, own ?? runOf, says),
    agentRows: (events, first) => agentRows(events, first, runOf),
  };
}

/**
 * `deps` with each run read once: `runOf` kept for the length of one page, so two feeds on a page, and every line of
 * each, ask the record for a run one time between them. A host that reads no runs is handed back as it came.
 */
function runsOnce(deps: PageDeps): PageDeps {
  const runOf = deps.runOf;
  if (!runOf) return deps;
  const read = new Map<string, Entry | null>();
  return {
    ...deps,
    runOf: (run) => {
      if (!read.has(run)) read.set(run, runOf(run));
      return read.get(run) ?? null;
    },
  };
}
