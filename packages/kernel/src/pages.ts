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

import type { Refusal, Result } from '@braindog/ports';
import { no, ok, refused } from '@braindog/ports';
import type { Leaf, Predicate, Schema } from '@braindog/where';

import type { ActionRow } from './actions.ts';
import type { Exception } from './exceptions.ts';
import { ANSWER_KEYS, BLOCK_READS, FILTER_TYPES, blockKeyOf, feedSaysFault, keyedBlocks, kindsReading, wrongKindKey } from './block-keys.ts';
import { applyLook, composeLook, lookOf, mergeLook, type LookBody } from './compose.ts';
import { HANDOFFS_OPEN, RECORD_ACTIVITY, builtInFigure, type OpenStep } from './built-in-figures.ts';
import type { ActionBlocking } from './signs-actions.ts';
import { KEEP, markDrawn, type Why } from './drawn.ts';
import { kindModule } from './kinds/index.ts';
import { sourceModule } from './sources/index.ts';
import { ACTIONS_BLOCKING } from './sources/actions-blocking.ts';
import { FEED_BY } from './sources/activity.ts';
import { RUNS_ON_LISTS } from './sources/runs-on.ts';
import { DOING_SAID, withSaid } from './sources/sessions-working.ts';
import { fileLists } from './kinds/gallery.ts';
import { panelFault, roadmapFault, shortFault } from './kinds/words.ts';
import { BODY_KINDS, type Shows } from './govern.ts';
import { CARD_FOLD, CARD_FOLD_MOST } from './declare.ts';
import { fill } from './fill.ts';
import type { Json } from './coerce.ts';
import { across, dayFieldOf as datedBy, isAtLeast, partsOf, type Amount, type Part, type Rate } from './fx.ts';
import type { Entry } from './index.ts';
import { predicateOf, windowMs, wordsOf, type EvalContext, type FxRead, type MetricDecl, type Reading } from './metrics.ts';
import { HORIZON_CAP, runway, type Horizon, type Leg, type Only, type Runway } from './forecast.ts';
import { beyondOf, figureLists, isRolled, pointedIn, type PointsAt, type Rolled } from './money-figures.ts';
import { withAdds, type PageAddition } from './page-adds.ts';
import { barsOf, type Bars, type SeriesLine } from './series.ts';
import { isBucket } from './buckets.ts';
import { isQuiet, presenceOf, WORKING_MS } from './presence.ts';
import { SESSION_PREFIX, agentOf, recordNamed } from './session.ts';
import { quietSign, type VitalSign } from './signs.ts';
import { nextSteps, stepsPercent, tallySteps, type StepsDecl } from './steps.ts';
import { COSTS, type Cost, type Wait } from './weigh.ts';
import { MEASURES_MOST, MEASURE_BUCKETS, measureBucket, measureLines, measureSeries, measureWindow, readableZone, type MeasureLatest, type MeasureSeries, type RawReading } from './measures.ts';
import { localDays } from './measures.ts';

/** One test of one figure in a block's `when:`: the figure, and the one of `empty`, `beyond` or a comparison it is held to. */
export type WhenLeaf = { metric: string; empty?: boolean; beyond?: boolean; gt?: number; gte?: number; lt?: number; lte?: number; is?: number; not?: number };

/** The leaves of a `when:`, whether it is written as one or as `all:` of several. Anything that is not a leaf is left out. */
export function whenLeaves(when: PageBlock['when']): WhenLeaf[] {
  if (!when || typeof when !== 'object') return [];
  const said = Array.isArray((when as { all?: unknown }).all) ? (when as { all: unknown[] }).all : 'all' in when ? [] : [when];
  return said.filter((leaf): leaf is WhenLeaf => leaf !== null && typeof leaf === 'object' && typeof (leaf as WhenLeaf).metric === 'string');
}

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
   * names no field, so its `field` is absent whatever this type says of the rest.
   */
  /**
   * `or:` names a second field of the same list, read where `field` holds nothing: a bank line's clean name, or the
   * words the bank wrote where nobody was matched to it. The entry carries both and the host falls back.
   */
  columns?: { field: string; or?: string; metric?: string; label?: string; as?: string; sign?: { field: string; minus: string } }[];
  /** A `stat`'s figures. `trend: 12w` draws how the figure moved over that window, from its daily series. */
  cells?: { metric: string; label?: string; trend?: string; note?: string }[];
  /**
   * A `stat`'s: its first figure is the screen's one hero figure. A `cards` block's: its first card is drawn two tracks
   * wide. A `note`'s: its body is the page's opening sentence, said with the plural and nought rules a figure's note has.
   */
  lead?: boolean;
  /** Which of the page's two columns the block sits in, on a page with a `layout`. `main` when absent. */
  area?: 'main' | 'rail';
  /** A `progress` block's: each row a band from its low to its high, columns `label | spent | low | high`. */
  range?: boolean;
  /** A `queue`'s: one tile per question, drawn with its recommended option's visual. */
  tiles?: boolean;
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
   * A `cards` block's: a link field of its list, which draws the cards in groups, one a row it points at, named by that
   * row's title. Each answered row says its group (`PageRow.group`), in the order the rows were read. A `feed`'s: `day`,
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
     has one (PGS-C06): the one test a figure with nothing in it meets. */
  /* `beyond: true` holds while the reading carries `beyond` (`money-figures.ts` `beyondOf`): a walk to zero that looked
     as far as it walks and never went under, which has no value and so meets no comparison. `all:` is two or more
     leaves, and the block draws only while every one holds. */
  when?: WhenLeaf | { all: WhenLeaf[] };
  /** A `series`'s lines: figures grouped by one date bucket, and how many buckets back and ahead it draws. */
  series?: SeriesLine[];
  back?: number;
  ahead?: number;
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
   * project's template.
   */
  about?: string;
  /**
   * A `section`'s on a page per row: the host panel drawn for that row under the section's heading, `actions` or
   * `reporting` (`kinds/words.ts` `PANELS`). The record checks the word and hands it back; the panel is the host's.
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
  requires?: string[];
  [key: string]: unknown;
};

export type BlockResult = PageBlock & {
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
  readings?: { metric: string; label?: string; reading: Reading | null; refusal?: Refusal; trend?: (number | null)[]; target?: MetricDecl['target'] }[];
  /** A `forecast.runway` block's walk. */
  walk?: Runway;
  /**
   * A cash walk over money in several currencies that could not be converted: one walk a currency, each starting from
   * that currency's part of the opening, in code order, and why it is not one walk (`home`, and each `missing` pair).
   * A walk's `sells` is what that walk may count as sold, in its own currency, when the block offers the sell control.
   */
  walks?: (Runway & { past?: { at: string; value: number }[]; sells?: { label: string; value: number }[] })[];
  walkFx?: { home: string | null; missing: string[] };
  /** On a block that inherits: how many of `rows`, at the end, apply everywhere rather than to the project. */
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
   * Every `{{path}}` of the block that names nothing the record has: no figure, list, row, field or value of a list's
   * state. A host draws each as the author wrote it, marked, and leaves it out of a chip, a tile or a bar, where a path
   * that names something and holds nothing keeps its `—`. Absent when every path names something.
   */
  unnamed?: string[];
  /**
   * The pack that added this block to a page another pack declares (`page-adds.ts`), absent on the page's own blocks. A
   * host says where the block came from with it, and leaves it out of an arrangement it saves, because the page's own
   * declaration never holds it.
   */
  added?: string;
  /** What this block could not do. Non-empty means the block drew nothing. */
  refusals: Refusal[];
};

/** The kinds of actor a feed groups by, which the feed's own source holds (`sources/activity.ts`). */
export { FEED_BY };
export type FeedBy = (typeof FEED_BY)[number];

/**
 * Who a run is, beside a line that run signed: its handle (`S42`), the kind of agent it is (`claude`, and `other` where
 * it said none and its app names none), the app it ran in as the run holds it (`claude-code`), and the run it helps.
 *
 * SO NO LINE IS A BARE HANDLE. A run signs the log with its handle, and a host that was handed `S42` alone could only
 * say "An agent", so every run on Activity sat in one lane (H.296). `agent` is always said, and a host names the run
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
export type QueueOption = { key: string; label: string; because: string; recommended: boolean; shows?: Shows; hard?: true };

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
  /**
   * On a queue's lead question (`lead: true`): what was proposed, the body's kind, and what accepting it does, one
   * short line read off the body (`does.ts`), so the first question is drawn whole with the change under it. A change
   * to what a list holds keeps `does` below the lead too (`sources/governance.ts` `ledBy`).
   */
  body_kind?: string;
  does?: string;
  /** The body of a `pack`, `settings` or `arrange` proposal, so a card says the arrangement in its own summary (web `card.ts` `arrangementOf`, REC-A07 step 3) without opening its page. */
  arranged?: Record<string, unknown>;
  /** How long it can wait (`weigh.ts` `WAIT_SQL`, AGT-C08): `soon`, `old` or `new`, read in the queue's own query. */
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
   * question that moves money, or hits the ladder's money floor, is always `cost: undo`, so Enter never accepts it.
   */
  money?: { amount: number; currency: string }[];
  /** What accepting changes on the one row a question updates: each field, its name, what it holds now and what it will. */
  changes?: { field: string; label?: string; before: Json | null; after: Json | null }[];
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
export type QuestionFacts = Pick<QueueQuestion, 'run' | 'drafted_by' | 'money' | 'changes' | 'kinds'>;

/** One name a merge question is about: its handle (`people#4`), its name, where it was seen, and whether it is kept. */
export type QueueCandidate = { at: string; name: string; seen: string[]; kept?: true };

/** What a queue's `where:` reads of an open question: who asked, what kind and band it is, and what it is about. */
export type OpenFacts = { who: string; kind: string; cost: Cost; about: string | null };

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
  values: { value: string; label: string; count: number }[];
  /** The lists its values were counted and named from, so a host holds the filter from a reader who may not read them. */
  reads: string[];
};

/** One event, as the activity source reads it. */
export type ActivityEvent = { ts: string; actor: string; kind: string; target: string | null; note: string | null; thing?: string | null; rows?: number; run_by?: RunBy | null };

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
 * the record does (PGS-B04): a digest and the app say which zone their "today" is.
 */
export type PageResult = { page: string; title: string; blocks: BlockResult[]; read_at?: string; zone?: string; look?: LookBody; [key: string]: unknown };

/**
 * The refusals that hold a block back from its reader rather than ask its author to fix it: outside the caller's
 * ceiling is `FORBIDDEN`, inside it with a level that does not reach `read` is `LEVEL_REQUIRED`.
 *
 * A LIST OF CODES RATHER THAN "ANY REFUSAL AT ALL". A block refused for a misspelt key is a block somebody has to be
 * able to see in order to fix (PGS-A01, H.366).
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
  /**
   * The record's vital signs now, in the order of the closed list (`signs.ts` `readSigns`): each its id, its name, its
   * state, its number and its own sentence. A `signs` block reads them; a sign with nothing to read is `none`.
   */
  signs?: () => readonly VitalSign[];
  /**
   * The next steps runs left and nobody has taken, newest first, each marked `next` or `earlier`: in one project (its
   * spoken id, as a run holds it) or, with `null`, on the whole record (`openSteps` in `built-in-figures.ts`, over
   * `handoff.ts`'s `openHandoffs`). A `handoffs.open` block reads them.
   */
  handoffs?: (project: string | null) => readonly OpenStep[];
  /**
   * What went quiet on this record, the longest quiet first (`openExceptions` in `exceptions.ts`, ENG-B13): a list or a
   * door that stopped, a feed that missed its time, a row older than its page allows. An `exceptions` block reads them.
   */
  exceptions?: () => readonly Exception[];
  /**
   * One project's scheduled actions that are paused, stopped as failed, or late, each in one sentence (`signs-actions.ts`
   * `actionsBlocking`, REC-C09): what is in the project's way besides its blockers. An `actions.blocking` block reads them.
   */
  blocking?: (project: string) => readonly ActionBlocking[];
  /**
   * Who opened a key last and when: the newest `grant.read` event on the grant a key's row points at, or `null` when
   * nobody has. `runs_on` asks it with the grant's id and answers only who and when, never the grant.
   */
  keyOpened?: (grant: string) => { actor: string; ts: string } | null;
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
   * `{{path}}` is that entry's field when its list declares one, and `<field>.count` counts a list field of it (PGS-B03).
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
    /** A money field each reading may hold in place of `value`: minor units and a currency, read whole (REC-C03). */
    amount?: string;
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
  fields: readonly { id: string; type: string; to?: string | undefined; deadline?: boolean | undefined; retired?: boolean | undefined }[];
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
};

/** The source a block names for one project's actions in its way (REC-C09), which that source holds. */
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
 * AND THE REFUSAL IS GONE WHERE A WHOLE READ IS HANDED (PGS-B05, `handsWhole`), because it made a list past 200 rows
 * undrawable: the Ledger's own chart of where the money went was dead from its 201st row. These kinds now answer
 * `wholeRead`, added up over every row (`wholeOf`), and what bounds them is time (`WHOLE_MS`), with a count far above
 * any list a person keeps (`WHOLE_WALK_ROWS`) for the host whose clock does not move.
 *
 * `section` IS NOT ONE OF THESE. Its count on screen is `total`, the whole match, so it is never
 * showing a slice; it reads no row to be right, and measured over the same 301 rows it draws its
 * default 50 and is correct. Putting it here would refuse a heading that has nothing to add up.
 * That is the other question, and it has its own name below.
 *
 * IT IS CALLED `SUMS` AND IT USED TO BE CALLED `REDUCES`, which was the name of a DIFFERENT SET one
 * import away. `apps/web/src/lib/record/schema.ts` exported a `REDUCES` of these five plus
 * `section`, and this file exported a `REDUCES` of the five, both `ReadonlySet<string>` and both
 * importable into the same module: `page-live.ts` imports one of them today, and adding
 * `import { REDUCES } from '@braindog/kernel'` beside it would have compiled and answered
 * differently about `section`, with nothing in either name to say they disagreed. Two names now,
 * one question each, and `apps/web`'s `block-kinds.test.ts` holds the two packages together.
 */
/* `ReadonlySet` BECAUSE IT LEAVES THE PACKAGE, which `SLASH_KINDS` in `slash.ts` is declared as for
   the same reason: a bare `new Set` exported hands every caller `add` and `delete` on the set the
   kernel refuses by. */
/* `heat` IS ONE OF THEM BECAUSE IT ADDS THE ROWS ON ONE DAY TOGETHER (`render/src/heat.ts`), and it was left out when
   the kind landed. Measured over a register of sixty rows on sixty days: fifty rows, `matched: 60`, no refusal, so ten
   busy days were drawn as gaps. `ring` IS NOT, though it can look like one: over a register it draws one row it counts
   (`ringOf`), two `matched` figures and never a row read, so a ceiling would refuse a ring over 201 tasks for a limit
   it never meets. */
export const SUMS: ReadonlySet<string> = new Set(['bar', 'chips', 'gauge', 'heat', 'progress', 'split']);

/**
 * `SUMS` and `section`: the kinds whose count on screen is the WHOLE MATCH rather than the page drawn.
 *
 * Nothing in this file reads it, and it is here rather than in the app because it is a fact about
 * the record's own dialect that every consumer with a screen has to get right. `apps/web` reads it
 * for the slice line under a block, on both of its engines: `api.ts` over the sample and
 * `page-live.ts` over a live answer. The two disagreed about `section` while this was one set doing
 * both jobs, and the page said it twice, differently, for the same declaration: measured through
 * `blockOf` on a section with 2 rows and `matched: 301`, `shown 2, total 301`, which is what
 * `/p/[slug]` prints "Showing 2 of 301" on, over a heading that draws no row of its own and whose
 * own count says 301, while the same heading on the sample printed nothing.
 *
 * DERIVED FROM `SUMS` RATHER THAN LISTED AGAIN, so the only way the two can disagree is the one
 * kind that is the actual difference between the questions.
 */
export const REDUCES: ReadonlySet<string> = new Set([...SUMS, 'section']);
/**
 * HOW MANY ROWS RIDE BESIDE A WHOLE READ, and it is no longer a ceiling (PGS-B05). A kind that adds up answers
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
 * How many rows that walk reads at most (audit 53, finding 7). TIME IS THE BOUND, AND A CLOCK MAY NOT MOVE: on a host
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
export type WholePart = { by: Json[]; unit: string | null; day: string | null; sum: number; rows: number; said: number };

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
};

/**
 * What a kind that adds up answers beside its rows (PGS-B05): its parts by label and the total of EVERY row its scope
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

export function resolvePages(deps: PageDeps): { slug: string; decl: PageDecl; row?: Entry; refusal?: Refusal }[] {
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
    const everywhereFirst = shared ? [...rows].sort((x, y) => Number(placeOf(x) !== null) - Number(placeOf(y) !== null)) : rows;
    everywhereFirst.forEach((row, nth) => {
      const name = String(row.fields[title] ?? '');
      const place = (counts.get(slugify(name)) ?? 0) > 1 ? placeOf(row) : null;
      wants.push({ rank: claims, age: row.created_at, page: decl.page, at, nth, name: place === null ? name : `${name} ${place}`, register, seq: row.seq, put: (slug) => slugs.set(row, slug) });
    });
    /* The pages come out in the template's own order once every row has its address. */
    filled.push(() => {
      for (const row of rows) here.push({ slug: slugs.get(row)!, decl: fill(keyed, row) as PageDecl, row });
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

/**
 * HOW MANY PAGES OUT OF ONE TEMPLATE A RAIL DRAWS, and the rule lives here because two rails obey it.
 *
 * A template carrying `nav` is one rail entry per row it admits, which is a rail that grows with
 * the record. Measured end to end through the record's own `boot` at his size, 27 projects, 23
 * services and 22 skills over three nav-carrying templates: 72 rail entries, one per row, against
 * 15 with this cap. A rail that grows without bound is a rail that stops being a rail.
 *
 * THE BUDGET IS KEYED ON THE REGISTER AND THE HEADING TOGETHER. Per register alone, the first
 * template over a list spends the whole budget and a second one drew NOTHING: measured in
 * `apps/web` with a `Clients` template beside the shipped `Projects` one over the same 26 rows,
 * Projects drew 6 and Clients drew 0, so a heading somebody had declared was gone rather than
 * short. A page nobody generated is never counted at all, so rows can never push out a page
 * somebody wrote.
 *
 * IT IS IN THE KERNEL BECAUSE THE SAMPLE AND THE LIVE SHELL BOTH HAVE TO OBEY IT, and they are in
 * different files with no other package between them. The cap shipped as a local constant inside
 * the sample's `boot()` (then in `apps/web/src/lib/record/api.ts`, now in
 * `apps/web/src/lib/record/fixtures/readers.ts`), which is the SAMPLE's rail: the sample is four
 * projects forever, so the rule was true where it changed nothing and absent from the rail a real
 * record draws, where the same 26 links were still being offered every morning.
 *
 * NOTHING IS HIDDEN BY IT. Every page keeps its own address, stays in the list of pages a caller
 * may open, and the list it came out of carries the whole count beside its name in the rail.
 */
export const RAIL_PAGES = 5;

/**
 * The counter that rule needs, made once per rail: it answers whether one page may be drawn.
 *
 * A page with no `about` is a page somebody wrote, and it is always drawn. A page out of a
 * template is drawn while its register and heading have room, and the ones kept are the first
 * `RAIL_PAGES` offered, which is the order the rail draws them in.
 *
 * THE KEY IS A JSON PAIR RATHER THAN TWO STRINGS JOINED, because a heading is somebody's own
 * words and any separator picked here is one they are allowed to type.
 */
export function railRoom(): (about: { register: string; section: string } | null | undefined) => boolean {
  const drawn = new Map<string, number>();
  return (about) => {
    if (!about) return true;
    const key = JSON.stringify([about.register, about.section]);
    const n = (drawn.get(key) ?? 0) + 1;
    drawn.set(key, n);
    return n <= RAIL_PAGES;
  };
}

/**
 * One page, with every block run.
 *
 * `filter` IS WHAT THE READER CHOSE in the page's own `filters:`, a value by field: `{ project: '12' }`. Each is ANDed
 * onto every block over a list that has the field, and the answer's `filters` says which values each could take and
 * how many open rows hold each. A field the page does not filter on is not applied, and a value the field cannot hold
 * is answered as no choice, so an address kept from before a page changed still opens it.
 */
export function readPage(host: PageDeps, slug: string, filter?: Readonly<Record<string, string>>): Result<PageResult> {
  /* A RUN IS READ ONCE FOR THE PAGE (`runsOnce`), whichever of its blocks names it first. */
  const deps = runsOnce(host);
  const every = resolvePages(deps);
  const found = every.find((p) => p.slug === slug);
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
  const filters = readerFilters(deps, found.decl, laid.map((l) => l.block), filter);
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
      const folded: BlockResult = { ...shorn(b), rows: [], matched: 0, refusals: [], drawn: false, why: 'when' };
      return added === undefined ? folded : { ...folded, added };
    }
    /* THE PAGE'S ROW IS THE ENTRY ITS TEXT SITS ON, so `{{money:price}}` and `{{blockers.count}}` read the row (PGS-B03). */
    const on = found.row ? { ...deps, here: found.row } : deps;
    const read = rowNamed(deps, found.row, readBlock(filters ? narrowed(on, b, filters.clauses) : on, b));
    if (b !== null && typeof b === 'object' && b.kind === 'section' && read.drawn === false) hiding.add(area);
    const astray = found.decl.for || panelFault(b.panel, null) ? null : panelFault(b.panel, false);
    const drawn = astray ? { ...read, rows: [], matched: 0, refusals: [...read.refusals, astray] } : read;
    return added === undefined ? drawn : { ...drawn, added };
  });
  /* HELD BEFORE THE LOOK IS COMPOSED, so the look is the one this reader's page answers and not the record's (`heldFor`). */
  const shown = deps.reader ? heldFor(blocks, deps.reader.hold) : null;
  const looked = lookedAt(deps, found.decl.page, shown?.blocks ?? blocks, shown);
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
  });
}

/**
 * THE PAGE UNDER ITS LOOK (DIRECTION §38), or `null` when the host reads no looks.
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
): { blocks: BlockResult[]; look: LookBody } | null {
  if (!deps.look) return null;
  const stored = rekeyedLook(lookOf(deps.look(page)), shown?.rekeyed);
  /* A LOOK SLASH WROTE WAS WRITTEN FROM THE WHOLE PAGE, so it is laid only for a reader shown the whole page. Laid for a
     member held from a block, its order, its lead and its basis said whether that block held something late: the rules
     answer her instead, from what she is shown. An owner's look is his arrangement and not a reading, so it stands. */
  if (stored !== null && stored.by !== 'owner' && !shown?.held) return applyLook(blocks, stored);
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
  return applyLook(blocks, stored?.by === 'owner' ? mergeLook(stored, composed) : composed);
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

/** The register a block reads rows of, or `null` for one over a figure, a computed source or nothing. */
const listRead = (b: PageBlock): string | null =>
  b !== null && typeof b === 'object' && typeof b.source === 'string' && b.source.startsWith('register.') ? b.source.slice('register.'.length) : null;

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
 * because a chip saying 40 over a list of 3 things to do counts what is finished.
 */
function readerFilters(
  deps: PageDeps,
  decl: PageDecl,
  blocks: readonly PageBlock[],
  filter: Readonly<Record<string, string>> | undefined,
): { answer: PageFilter[]; clauses: Map<string, Predicate[]> } | null {
  const said = Array.isArray(decl.filters) ? (decl.filters as unknown[]) : [];
  const declared = said.flatMap((f): { field: string; control: PageFilter['control'] }[] => {
    const one = f !== null && typeof f === 'object' && !Array.isArray(f) ? (f as { field?: unknown; control?: unknown }) : {};
    const control = one.control === 'chips' || one.control === 'segmented' ? one.control : null;
    return typeof one.field === 'string' && control !== null ? [{ field: one.field, control }] : [];
  });
  if (declared.length === 0) return null;

  /* THE LISTS THE PAGE'S BLOCKS READ, in the page's order: a filter narrows what is drawn, so a list no block draws is
     not counted, and neither is one the reader may not read (`EvalContext.reads`), as `deadlines` leaves it out. The
     first that holds a field is the one its values are named from. */
  const readable = (r: string): boolean => deps.ctx.reads === undefined || deps.ctx.reads(r);
  const lists = [...new Set(blocks.map(listRead).filter((r): r is string => r !== null && readable(r)))];
  const schemas = new Map(lists.map((r) => [r, deps.schemaOf(r)] as const));

  /* A CHOICE STANDS WHEN THE FIELD'S FIRST LIST CAN HOLD IT, and is then made on every list that has the field. A link
     is answered by the number of the row it points at, however it was chosen, so the chip it lights is the one drawn. */
  const chosen = new Map<string, { value: string; pointed: Pointed | null; to: string | undefined }>();
  for (const { field } of declared) {
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
  const clausesOn = (register: string, except?: string): Predicate[] => {
    const schema = schemas.get(register) ?? deps.schemaOf(register);
    return [...chosen].flatMap(([field, c]) => {
      if (field === except) return [];
      const spec = filterable(schema ?? null, field);
      const clause = spec ? clauseOf(field, spec, c.value, c.pointed, c.to) : null;
      return clause ? [clause] : [];
    });
  };
  const clauses = new Map(lists.map((r) => [r, clausesOn(r)] as const));

  const answer = declared.map(({ field, control }): PageFilter => {
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
      const parts = [...openOn(deps, r, s), ...clausesOn(r, field)];
      const where: Predicate | undefined = parts.length === 0 ? undefined : parts.length === 1 ? parts[0] : { all: parts };
      for (const [v, n] of tallied(deps, r, field, where)) counts.set(v, (counts.get(v) ?? 0) + n);
    }

    /* A LINK IS COUNTED BY THE ROW IT POINTS AT AND OFFERED BY THAT ROW'S NUMBER AND TITLE, which is what an address
       keeps and a person reads. A row no longer there, or on a list the reader may not read, is not offered. */
    const named = new Map<string, { value: string; label: string }>();
    if (spec.type === 'ref' && spec.to !== undefined && readable(spec.to)) {
      reads.push(spec.to);
      const ids = [...counts.keys()].filter((k) => k !== '');
      const title = deps.titleOf(spec.to);
      const pointed = ids.length ? deps.list({ register: spec.to, where: { field: 'id', in: ids }, limit: 500 }) : null;
      for (const r of pointed?.ok ? pointed.value.rows : []) {
        if (r.seq === null) continue;
        const t = title && Object.hasOwn(r.fields, title) ? r.fields[title] : null;
        named.set(r.id, { value: String(r.seq), label: typeof t === 'string' && t.trim() !== '' ? t : `#${r.seq}` });
      }
    }
    const valueOf = (key: string): { value: string; label: string } | null => {
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
  return { answer, clauses };
}

/**
 * The reads one block makes, with the reader's choices ANDed onto every read of the list it draws.
 *
 * ONLY THE BLOCK'S OWN LIST, and only a read of its rows. The names of the projects its rows point at, the steps
 * under a card, a `{{path}}` naming one row by its number: those are other reads, and a filter on what is drawn says
 * nothing about them. So a read that names its rows by number or id is left as it is.
 */
function narrowed(deps: PageDeps, block: PageBlock, clauses: ReadonlyMap<string, readonly Predicate[]>): PageDeps {
  const register = listRead(block);
  const extra = register === null ? [] : (clauses.get(register) ?? []);
  if (register === null || extra.length === 0) return deps;
  const named = (where: Predicate | undefined): boolean => {
    const leaf = where as Leaf | undefined;
    return leaf !== undefined && (leaf.field === 'seq' || leaf.field === 'id');
  };
  const and = (where: Predicate | undefined): Predicate => (where === undefined ? (extra.length === 1 ? extra[0]! : { all: [...extra] }) : { all: [where, ...extra] });
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
  const when = block.when;
  if (!when) return true;
  /* TWO TESTS ARE ONE CONDITION: `all:` draws only while every leaf holds, and a leaf that cannot be read fails it as it
     fails alone. A leaf that is not a leaf (`whenLeaves` leaves it out) fails it too, so an `all` never draws on less
     than it says. */
  const leaves = whenLeaves(when);
  if ('all' in when) return leaves.length >= 2 && leaves.length === when.all.length && leaves.every((leaf) => leafHolds(deps, leaf));
  return leaves.length === 1 && leafHolds(deps, leaves[0]!);
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
  /* EMPTY IS THE ONE TEST A FIGURE WITH NO VALUE MEETS (PGS-C06): true while no amount is held in any currency. A sum of
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
  try {
    return { ...leanRows(deps, readBlockAsWritten(deps, renamed(block))), key };
  } catch (e) {
    return {
      ...(block !== null && typeof block === 'object' ? shorn(block) : block),
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

/**
 * The characters of one text a page's row carries before it is cut, as many as `list` gives an agent (`packages/mcp`).
 * Counted in code points, so a cut never splits a character in two.
 */
export const ROW_TEXT_MOST = 280;

/** A row as a page answers it: the row, saying `clipped` where a text in it was cut (`leanRows`). */
export type PageRow = Entry & {
  clipped?: true;
  /**
   * On a grouped `cards` block (`group:`): the row its link points at, by its handle (`projects#7`), and that row's
   * title. `value` is `''` and `name` says "No project" for a card that points at nothing. ON THE ROW AND NOT BESIDE
   * THE ROWS, so a block held from a reader, whose rows are taken off, keeps no name of the list she may not read.
   */
  group?: { value: string; name: string };
};

/** The keys a block answers one to a row, which go with the rows a section does not send. */
const ALIGNED = ['scopes', 'scope_marks', 'rings', 'nexts', 'trends', 'done_now', 'next', 'short_now', 'changes', 'working_now', 'quiet', 'files'] as const;

/** A text cut at `ROW_TEXT_MOST` code points, or `null` when it is no longer than that. */
function cutText(text: string): string | null {
  /* A STRING NO LONGER THAN THE CUT IN UTF-16 UNITS IS NO LONGER IN CODE POINTS, so most texts are not walked at all. */
  if (text.length <= ROW_TEXT_MOST) return null;
  let points = 0;
  let at = 0;
  for (const ch of text) {
    if (points === ROW_TEXT_MOST) return text.slice(0, at);
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
 * the page reads itself again on every write to the record (`loop/research-real-record.md`, Projects). So a text or a
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
    .map((key): Refusal => ({ code: 'DECLARATION_INVALID', fix: `${key}: is not a key this record reads.`, at: key }));
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
  /* AND A HEAT OVER A LIST READS ONE TOO (PGS-B05): each day's whole, which its wash is then a share of (`wholeOf`). */
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

  /* THE PAGE'S LIVE FIGURES ARE THE RECORD'S TO SAY, so the host does not answer them from a copy of
     its own. Only for a block that draws: a figure in a block that is not on the page is not read. */
  const { values, values_fx, unnamed } = valuesOf(deps, block);
  if (values) base.values = values;
  if (values_fx) base.values_fx = values_fx;
  if (unnamed) base.unnamed = unnamed;

  /* THE PAGE WORDS THE INSTALL CHECKS ARE CHECKED AGAIN HERE, for a page installed under an earlier build, in the
     install's own sentences (`kinds/words.ts`): a section's host panel, a path's short view and a roadmap's columns.
     Whether the page is about a row is the page's to say, so a panel's word is checked here and its page in
     `readPage`. */
  const worded = panelFault(block.panel, null) ?? shortFault(block.short) ?? (block.kind === 'roadmap' ? roadmapFault(block) : null);
  if (worded) return { ...base, refusals: also(worded) };
  /* CARDS ARE GROUPED BY A LINK FIELD OF THEIR LIST, so cards over anything but a list draw no groups, and say so rather
     than drawing ungrouped under a `group:` the author wrote. The field itself is checked where the list is in hand. */
  if (block.kind === 'cards' && block.group !== undefined && !(typeof block.source === 'string' && block.source.startsWith('register.')))
    return {
      ...base,
      refusals: also({ code: 'DECLARATION_INVALID', fix: `group: draws cards in groups by a link field of their list, and these cards are over no list. Give them source: register.<id>, or take group: off.`, at: 'group' }),
    };

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
      readings: (block.cells ?? []).map(({ trend: window, ...cell }) => {
        const decl = deps.metric(cell.metric.split(':')[0] ?? '');

        if (!decl)
          return {
            ...cell,
            reading: null,
            refusal: {
              code: 'METRIC_UNKNOWN',
              fix: `There is no metric called ${cell.metric}. A figure this record computes rather than declares is not one either.`,
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
        const moved = window === undefined ? {} : trendOf(deps, cell.metric, window);
        const target = decl.target === undefined ? {} : { target: decl.target };
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
  /* A BAR OR A SPLIT OVER A GROUPED FIGURE draws the figure's parts, so a part may be a monthly share of a yearly
     cost, which a sum over the rows cannot be. The host adds what no part holds as its `unset:` row. */
  if (block.source.startsWith('metric.')) return metricBlock(deps, block, block.source.slice('metric.'.length), base, also);
  const register = block.source.startsWith('register.') ? block.source.slice('register.'.length) : null;
  const schema = register ? deps.schemaOf(register) : null;
  if (!register || !schema)
    return { ...base, refusals: also({ code: 'SOURCE_UNKNOWN', fix: `${block.source} is not a source this record reads.`, at: 'source' }) };

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

  /* A CARD'S GROUP IS A LINK FIELD OF THIS LIST, checked here where the list is in hand, as the install checks it. */
  const grouping = block.kind === 'cards' ? cardGrouping(block, register, schema) : null;
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
    /* THE FIFTH COLUMN IS THE READING AS MONEY (REC-C03): integer minor units with the reading's own currency, read in
       place of `value` where a row holds it (`measures.ts` `moneyOf`), so "Monthly revenue" of USD 48.15 is never the
       decimal 4,815 with a unit of text. A reading in another currency is a line of its own, never added to this one. */
    const [when, val, name, unit, amount] = (block.columns ?? []).map((c) => c.field);
    const missing = [when, val, name, unit, amount].filter((f): f is string => f !== undefined && !Object.hasOwn(schema.fields, f));
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
    const read = deps.readings({ register, where: said.predicate, when: when!, value: val!, ...(name ? { name } : {}), ...(unit ? { unit } : {}), ...(amount ? { amount } : {}), since: window.since });
    if (!read.ok) return { ...base, refusals: refused(read) ? also(read.refusal) : also() };
    /* `limit:` IS HOW MANY MEASURES, at most the twelve a block is ever handed, so Today can draw the four that moved. */
    const most = typeof block.limit === 'number' && Number.isFinite(block.limit) ? Math.min(MEASURES_MOST, Math.max(0, Math.floor(block.limit))) : MEASURES_MOST;
    const opts = { nowMs: deps.ctx.nowMs, back: block.back, bucket: block.bucket, tz, fallback: block.heading ?? '', most };
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
  /* THE LIST OF RUNS SAYS WHERE A RUN APPLIES IN ITS OWN WAY (AGT-C12): a run is placed in a project by that project's
     spoken name, which `projectsOf` reads as the two run sources read it, and no `scope:` field says so. So over that
     list `as: scope` is taken on the run's project and answered below, and it is not a scope this block inherits by. */
  const runs = register === SESSION;
  const placedIn = runs ? (block.columns ?? []).filter((c) => c.as === 'scope' && c.field === PLACED) : [];
  const scoped = (block.columns ?? []).filter((c) => c.as === 'scope' && !placedIn.includes(c));
  if ((inherit && (!deps.scopeOf || !deps.inScope)) || (scoped.length && !deps.scopeOf))
    return {
      ...base,
      refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: 'This record does not read where a row applies yet.', at: inherit ? 'inherit' : 'columns' }),
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
  const trendFault = trendColumnFault(deps, block);
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
    return { ...base, refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: 'This record does not read who changed a row onto a page yet.', at: 'columns' }) };
  /* `working: true` NEEDS BOTH HALVES OR NEITHER. It is one question asked of two reads, and a record
     wired for one of them would answer `false` for every row, which is a block quietly saying nobody
     is working rather than saying it cannot tell. */
  if (block.working === true && !(deps.history && deps.sessionsLive))
    return { ...base, refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: 'This record does not read whether an agent is on a row onto a page yet.', at: 'working' }) };

  const read = short && !(drawn > 0) ? [] : listed.value.rows;
  const ranged = block.kind === 'progress' && block.range === true ? rangeFault(block, register, schema, read) : null;
  if (ranged) return { ...base, refusals: also(ranged) };
  /* EACH GROUPED CARD SAYS ITS GROUP (`groupedRows`). */
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
    if (other)
      return {
        ...base,
        refusals: also({ code: 'MIXED_CURRENCY', fix: `A row here is in ${other.currency} and ${figure?.id} is in ${unit}, and two currencies are never set against each other. Give the row's ${limitField} in ${unit}, or read a figure in ${other.currency}.`, at: figure?.at ?? 'spent' }),
      };
  }
  /* A KIND THAT ADDS UP ANSWERS ITS WHOLE (PGS-B05): its parts and its total over every row the scope and the `where`
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
  const held = block.kind === 'bar' || block.kind === 'split' ? deps.ctx.fx?.() : undefined;
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
    ...(marks ? { done_now: marks, next: lead === undefined ? null : lead.at } : {}),
    ...(grouping ? { fold: typeof block.fold === 'number' ? block.fold : CARD_FOLD } : {}),
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
 * so every account on the owner's record read out of date and would go on reading it after messages filed (REC-B03). A
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
 * The link a `cards` block groups by, or why it cannot, or `null` when it groups by nothing. Said again at read for a
 * page installed before the install checked it (`declare.ts` `cardGroupFault`), in the same words.
 */
function cardGrouping(block: PageBlock, register: string, schema: Schema): { field: string; to: string; label: string } | Refusal | null {
  const fold = block.fold;
  if (fold !== undefined && !(typeof fold === 'number' && Number.isInteger(fold) && fold >= 1 && fold <= CARD_FOLD_MOST))
    return { code: 'OUT_OF_BOUNDS', fix: `fold: is how many cards each group shows before the rest fold, from 1 to ${CARD_FOLD_MOST}.`, at: 'fold' };
  if (block.group === undefined)
    return fold === undefined ? null : { code: 'DECLARATION_INVALID', fix: 'fold: folds the groups of cards, and these cards draw none. Give them group: a link field of their list, or take fold: off.', at: 'fold' };
  const links = Object.entries(schema.fields).flatMap(([id, f]) => (f.type === 'ref' && typeof f.to === 'string' && f.to !== '' ? [id] : []));
  const spec = typeof block.group === 'string' && Object.hasOwn(schema.fields, block.group) ? schema.fields[block.group] : undefined;
  if (!spec) return { code: 'FIELD_UNKNOWN', fix: `${register} has no field called ${String(block.group)} to group these cards by.`, at: 'group', allowed: links };
  if (spec.type !== 'ref' || typeof spec.to !== 'string' || spec.to === '')
    return {
      code: 'DECLARATION_INVALID',
      fix: `Cards are grouped by a link to another list, so each group is a row with a name, and ${block.group} is ${spec.type}. ${links.length ? `Group by ${links.join(' or ')}.` : `${register} has no link field.`}`,
      at: 'group',
      allowed: links,
    };
  return { field: block.group as string, to: spec.to, label: wordsOf(spec.label ?? (block.group as string)) };
}

/**
 * EACH CARD WITH ITS GROUP: the row its link points at, by its handle and its title. A row no longer there is nothing,
 * and so is a link to a list the reader may not read, whose titles she is not told: the record holds the whole block
 * from her anyway, by the list `registersOf` names for it.
 *
 * THE CARDS STAY IN THE ORDER THEY WERE READ. A host draws a group where its first card stands and the cards in no group
 * where the record put them, so a block ordered by the last day in touch still reads the most recent first.
 */
function groupedRows(deps: PageDeps, rows: readonly Entry[], g: { field: string; to: string; label: string }): PageRow[] {
  if (deps.ctx.reads !== undefined && !deps.ctx.reads(g.to)) return [...rows];
  const first = (v: unknown): string | null =>
    Array.isArray(v) ? ((v.find((x) => typeof x === 'string' && x !== '') as string | undefined) ?? null) : typeof v === 'string' && v !== '' ? v : null;
  const ids = [...new Set(rows.map((r) => first(r.fields[g.field])).filter((id): id is string => id !== null))];
  const title = deps.titleOf(g.to);
  const listed = ids.length ? deps.list({ register: g.to, where: { field: 'id', in: ids }, limit: ids.length }) : null;
  const found = new Map(listed?.ok ? listed.value.rows.map((r) => [r.id, r] as const) : []);
  /* "No project", and "No CRM deal" as its label says it: only a capital that starts a word is taken down. */
  const said = /^[A-Z][^A-Z]/u.test(g.label) ? g.label[0]!.toLowerCase() + g.label.slice(1) : g.label;
  const none = { value: '', name: `No ${said}` };
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
  return {
    trends: rows.map((row) => {
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
          ? `as: picture leads a card with a file the record holds, and ${register}'s ${column.field} is ${type ?? 'no field'}. Name a file field.`
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
function wholeParts(deps: PageDeps, ask: WholeAsk): Result<WholePart[]> {
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
  let cursor: string | undefined;
  let walked = 0;
  do {
    const page = deps.list({ register: ask.register, where: ask.where, limit: WHOLE_PAGE, ...(cursor ? { cursor } : {}) });
    if (!page.ok) return page;
    walked += page.value.rows.length;
    const long = wholeLong(Math.max(walked, Number.isFinite(page.value.matched) ? page.value.matched : 0));
    if (long) return { ok: false, refusal: long };
    for (const row of page.value.rows) {
      const by = ask.by.map(({ field, day }): Json => {
        const v = row.fields[field];
        if (v === undefined || v === null || v === '') return null;
        return day ? (typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : null) : (v as Json);
      });
      const amount = ask.value === null ? null : amountIn(row.fields[ask.value]);
      const on = ask.dated === null || amount === null ? null : row.fields[ask.dated];
      const day = typeof on === 'string' && on.length >= 10 ? on.slice(0, 10) : null;
      const key = JSON.stringify([by, amount?.unit ?? null, day]);
      const group = groups.get(key) ?? { by, unit: amount?.unit ?? null, day, sum: 0, rows: 0, said: 0 };
      group.rows += 1;
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
type Gathered = { rows: number; said: number; done: number; bare: number; amounts: Amount[] };
const gathered = (): Gathered => ({ rows: 0, said: 0, done: 0, bare: 0, amounts: [] });
const gather = (into: Gathered, part: WholePart, done: boolean): void => {
  into.rows += part.rows;
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

/**
 * A kind that adds up, over every row its scope and `where` admit (PGS-B05): the parts by label and the total, or
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
  const ask = (w: Predicate | undefined) =>
    wholeParts(deps, { register, where: w, by: shape.by, value: shape.value, dated: money && home !== null ? datedBy(schema.fields) : null });
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
  const heat = block.kind === 'heat';
  const from = heat ? heatFrom(today) : '';
  const drawn = (label: Json): label is string => typeof label === 'string' && label >= from && label <= today;
  const total = gathered();
  const byLabel = new Map<string, { label: Json; who?: Json; sum: Gathered }>();
  let outside = 0;
  /* AND THE DAYS OUTSIDE THE WINDOW, EACH ONCE (`outsideDays`): a host says "N days fall outside the twelve weeks", and
     forty entries on one old day are one day. An entry holding no day is no day at all: it is in `outside`, which is
     what the cells fall short of the total by, and not in the days. */
  const outsideDays = new Set<string>();
  for (const part of read.value) {
    const done = shape.done ? shape.done(part.by[1] ?? null) : false;
    gather(total, part, done);
    if (shape.by.length === 0) continue;
    const label = part.by[0] ?? null;
    if (heat && !drawn(label)) {
      outside += part.rows;
      if (typeof label === 'string') outsideDays.add(label);
      continue;
    }
    const who = heat && shape.by.length === 2 ? { who: part.by[1] ?? null } : {};
    const key = JSON.stringify([label, 'who' in who ? who.who : 0]);
    const at = byLabel.get(key) ?? { label, ...who, sum: gathered() };
    gather(at.sum, part, done);
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
  const rows = kept.map(({ label, who, sum, figure: { converted: _at, ...f } }): WholeRow => {
    const share = heat && whole !== null ? { of: figure(wholes.get(label as string) ?? gathered()).value } : shape.done ? { of: sum.rows } : {};
    return { label, ...(who === undefined ? {} : { who }), rows: sum.rows, ...f, ...share };
  });
  const past = parts.slice(kept.length);
  const tail = gathered();
  for (const g of past) {
    tail.rows += g.sum.rows;
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
    ...(past.length > 0 ? { rest: { labels: past.length, rows: tail.rows, ...rest } } : {}),
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
  /* A FIGURE'S PARAMETER IS SPLIT OFF AT THE FIRST COLON, as a figure cell's is (PGS-A04), so a split on a project page
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
 * ON EVERY BLOCK OF A LIST, for the byline (DIRECTION §37, trust): a row changed for the reader in the last week carries
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
  if (!deps.history) return refuse({ code: 'NOT_IN_THIS_BUILD', fix: 'This record does not read a row’s history onto a page yet.', at: 'source' });
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
    /* A `where:` THAT HOPS INTO ANOTHER LIST READS THAT LIST (audit 49-50, finding 5). A table over Categories kept to
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
    if (sourceModule(block.source)?.whole) named.add(WHOLE_RECORD);
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
    /* EVERY LEAF'S, when it is `all:` of several: each is a statement about its own figure. */
    for (const leaf of whenLeaves(block.when)) {
      const at = leaf.metric.indexOf(':');
      addFigure(at < 0 ? leaf.metric : leaf.metric.slice(0, at));
    }
    /* AND SO DOES A `{{path}}` IN ITS PROSE, which the page answer now fills from the record. */
    for (const path of pathsOf(block, (id) => (metric?.(id) ?? builtInFigure(id)) !== null, true)) {
      const said = pathOf(path);
      if (!said) continue;
      if ('metric' in said) addFigure(said.metric);
      else if ('own' in said) continue;
      else if ('change' in said || 'rowsOf' in said) {
        const head = 'change' in said ? said.change : said.rowsOf;
        if (metric?.(head) ?? builtInFigure(head)) addFigure(head);
        else if (LIST_ID.test(head)) named.add(head);
      } else named.add(said.register);
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
  for (const text of [block.heading, (block as { body?: unknown }).body, block.empty, ...cells, ...notes, ...labels]) {
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
 * What a path names, in `05 §7.1`'s grammar outside a template: a metric, a row's field by spoken id,
 * a register's count, or how many of a register's rows are in one state. Nothing else is read:
 * `portfolio.revenue` is a state count of a list with no such state, and so answers nothing, and a path
 * that names none of these is `null` rather than a guess.
 *
 * `<list>.<value>` IS A COUNT OF THE ROWS IN THAT STATE (`tasks.open`), where the value is one of the
 * list's `state` enum. `count` is the whole list's, so a state called `count` is read as the whole
 * count; every other word is a state, answered only when the list's state enum holds it (`valueAt`).
 * The list is named either way (`registersOf`), because a count of a list's rows is about that list.
 */
function pathOf(
  path: string,
  own?: Schema['fields'],
):
  | { metric: string; param?: string }
  | { change: string }
  | { rowsOf: string; part: RowPart; field?: string }
  | { register: string; seq: number; field: string }
  | { register: string; count: true }
  | { register: string; state: string }
  | { own: string; count?: true }
  | null {
  /* A FIGURE WITH ITS PARAMETER, before the path is cut at its full stops: the parameter is a name and may hold one. */
  const asked = figureAsked(path);
  if (asked) return { metric: asked.id, param: asked.param };
  const parts = path.split('.');
  /* THE ENTRY THE TEXT SITS ON IS READ FIRST (PGS-B03): one word its list declares is its field, and `<field>.count` over
     one of its list fields is how many that field holds. A word it does not declare reads as it always has. */
  const ownField = (word: string | undefined): boolean => own !== undefined && word !== undefined && Object.hasOwn(own, word);
  if (parts.length === 1 && ownField(path)) return { own: path };
  if (parts.length === 2 && parts[1] === 'count' && ownField(parts[0]) && own![parts[0]!]!.type === 'list') return { own: parts[0]!, count: true };
  if (parts.length === 1) return /^[a-z][a-z0-9_-]*$/.test(path) ? { metric: path } : null;
  if (parts.length !== 2) return null;
  const [head, tail] = parts as [string, string];
  /* `<figure>.first_<field>` IS A FIELD OF THE FIRST ROW A FIGURE COUNTS, the row `.first` names, so a sentence can say
     "Salma still owes EGP 1,350" (`rowsValue`). */
  const firstOf = /^first_([a-z][a-z0-9_]*)$/.exec(tail);
  if (firstOf && /^[a-z][a-z0-9_-]*$/.test(head)) return { rowsOf: head, part: 'first', field: firstOf[1]! };
  /* `<figure>.change` IS HOW FAR A FIGURE MOVED (`changeOf`). A list called `tasks` with a state called `change` would
     say the same words, so the record decides between the two by whether a figure of that name is declared. */
  if (tail === 'change' && /^[a-z][a-z0-9_-]*$/.test(head)) return { change: head };
  /* `<figure>.first`, `.names`, `.more` AND `.since` ARE THE ROWS A FIGURE COUNTS (`rowsValue`), decided between a figure
     and a list's state of that name exactly as `.change` is. */
  if ((ROW_PARTS as readonly string[]).includes(tail) && /^[a-z][a-z0-9_-]*$/.test(head)) return { rowsOf: head, part: tail as RowPart };
  const row = /^([a-z][a-z0-9_]*)#([1-9][0-9]*)$/.exec(head);
  if (row) return { register: row[1]!, seq: Number(row[2]), field: tail };
  if (!/^[a-z][a-z0-9_]*$/.test(head)) return null;
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
 */
function valueAt(deps: PageDeps, path: string, how?: { fx?: FxRead }): Json | undefined {
  const here = deps.here;
  const parsed = pathOf(path, here ? deps.schemaOf(here.register)?.fields : undefined);
  if (!parsed) return undefined;
  /* THE ENTRY'S OWN FIELD, read from the entry in hand. A long field (a document) is named and stays unavailable, as it
     is on any row: `05 §7.1` makes it an argument and not a figure. */
  if ('own' in parsed) {
    const spec = deps.schemaOf(here!.register)!.fields[parsed.own]!;
    const held = Object.hasOwn(here!.fields, parsed.own) ? here!.fields[parsed.own] : undefined;
    if (parsed.count) return Array.isArray(held) ? held.length : 0;
    return FIGURES.has(spec.type) ? figure(held) : undefined;
  }
  /* A FIGURE'S CHANGE WHEN A FIGURE HAS THE NAME, and otherwise the count of a list's rows in a state called `change`,
     which is what these words read as before a figure could be asked how far it moved. */
  if ('change' in parsed) {
    const decl = deps.metric(parsed.change);
    if (decl) return changeOf(deps, decl);
  }
  if ('rowsOf' in parsed) {
    const decl = deps.metric(parsed.rowsOf);
    if (decl) return rowsValue(deps, decl, parsed.part, parsed.field);
  }
  const said =
    'change' in parsed
      ? LIST_ID.test(parsed.change)
        ? { register: parsed.change, state: 'change' }
        : null
      : 'rowsOf' in parsed
        ? LIST_ID.test(parsed.rowsOf)
          ? { register: parsed.rowsOf, state: parsed.field === undefined ? parsed.part : `first_${parsed.field}` }
          : null
        : parsed;
  if (!said) return undefined;
  if ('metric' in said) {
    const named = deps.metric(said.metric);
    /* The declaration with its parameter filled, as a figure cell reads `project-owed:Kiln`. */
    const decl = named && said.param !== undefined ? (fill(named, null, said.param) as MetricDecl) : named;
    const read = decl ? deps.read(decl) : null;
    if (!read?.ok) return undefined;
    /* A FIGURE IN SEVERAL CURRENCIES IS EACH OF ITS AMOUNTS, which the host writes one after another. */
    if (read.value.parts) return read.value.parts.map((p) => ({ amount: p.amount, currency: p.currency }));
    if (read.value.value === null) return undefined;
    /* A FIGURE THAT IS A DAY (the latest `due`) is held as whole days since 1970, and a sentence says the day: the
       ISO day goes out, which a host writes as it writes any other day. */
    if (decl?.format === 'day') return new Date(read.value.value * 86_400_000).toISOString().slice(0, 10);
    /* AND HOW ONE AMOUNT WAS CONVERTED, for a caller that asks (`values_fx`): only where a rate was used. */
    if (how && read.value.fx?.asOf) how.fx = read.value.fx;
    return read.value.unit ? { amount: read.value.value, currency: read.value.unit } : read.value.value;
  }
  const schema = deps.schemaOf(said.register);
  if (!schema) return undefined;
  if ('count' in said) {
    const listed = deps.list({ register: said.register, limit: 1 });
    return listed.ok ? listed.value.matched : undefined;
  }
  /* A STATE'S COUNT IS ASKED OF THE LIST, as the whole count is, by the field the list mirrors its state onto, and only
     for a value that field's enum holds: `tasks.opne` is nothing rather than a count of nought, which would read as
     true. */
  if ('state' in said) {
    const field = schema.state;
    const spec = field !== undefined && Object.hasOwn(schema.fields, field) ? schema.fields[field] : undefined;
    if (field === undefined || spec?.type !== 'enum' || !(spec.values ?? []).includes(said.state)) return undefined;
    const listed = deps.list({ register: said.register, where: { field, is: said.state }, limit: 1 });
    return listed.ok ? listed.value.matched : undefined;
  }
  const decl = Object.hasOwn(schema.fields, said.field) ? schema.fields[said.field] : undefined;
  if (!decl || !FIGURES.has(decl.type)) return undefined;
  const listed = deps.list({ register: said.register, where: { field: 'seq', is: said.seq }, limit: 1 });
  const row = listed.ok ? listed.value.rows[0] : undefined;
  return row && Object.hasOwn(row.fields, said.field) ? figure(row.fields[said.field]) : undefined;
}

/** What a sentence may say about the rows a figure counts: the first one's name, a few names, how many besides, and since when. */
const ROW_PARTS = ['first', 'names', 'more', 'since'] as const;
type RowPart = (typeof ROW_PARTS)[number];

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
  if (!decl.source.startsWith('register.') || !mayRead(deps, decl)) return undefined;
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
function changeOf(deps: PageDeps, decl: MetricDecl): Json | undefined {
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
function valuesOf(deps: PageDeps, block: PageBlock): { values?: Record<string, Json>; values_fx?: Record<string, FxRead>; unnamed?: string[] } {
  const out: Record<string, Json> = {};
  const fx: Record<string, FxRead> = {};
  const unnamed: string[] = [];
  for (const path of pathsOf(block, (id) => figureNamed(deps, id))) {
    const how: { fx?: FxRead } = {};
    const v = valueAt(deps, path, how);
    if (v !== undefined) out[path] = v;
    else if (!namedAt(deps, path)) unnamed.push(path);
    /* A FIGURE'S CONVERSION GOES OUT BESIDE ITS AMOUNT (rates-foot-note-80), so a sentence can say its rates are old. */
    if (v !== undefined && how.fx) fx[path] = how.fx;
  }
  return { ...(Object.keys(out).length ? { values: out } : {}), ...(Object.keys(fx).length ? { values_fx: fx } : {}), ...(unnamed.length ? { unnamed } : {}) };
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
  if ('metric' in parsed) return figureNamed(deps, parsed.metric);
  if ('change' in parsed) return figureNamed(deps, parsed.change) || stateNamed(deps, parsed.change, 'change');
  if ('rowsOf' in parsed) {
    if (parsed.field === undefined) return figureNamed(deps, parsed.rowsOf) || stateNamed(deps, parsed.rowsOf, parsed.part);
    /* `first_<field>` NAMES A FIELD THE FIGURE'S LIST DECLARES, so `first_ownd` is the author's typo and not a dash. */
    const decl = deps.metric(parsed.rowsOf);
    const schema = decl?.source.startsWith('register.') ? deps.schemaOf(decl.source.slice('register.'.length)) : null;
    return (schema !== null && Object.hasOwn(schema.fields, parsed.field)) || stateNamed(deps, parsed.rowsOf, `first_${parsed.field}`);
  }
  if ('state' in parsed) return stateNamed(deps, parsed.register, parsed.state);
  const schema = deps.schemaOf(parsed.register);
  if (!schema) return false;
  if ('count' in parsed) return true;
  if (!Object.hasOwn(schema.fields, parsed.field)) return false;
  const listed = deps.list({ register: parsed.register, where: { field: 'seq', is: parsed.seq }, limit: 1 });
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
