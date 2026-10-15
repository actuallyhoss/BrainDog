/**
 * `braindog-render` — the block dialect, MIT.
 *
 * Separately licensed from the app on purpose. The app is Apache-2.0 and this is MIT, because the
 * block dialect is meant to be embedded anywhere, including in code that is not open at all. MIT
 * asks nothing of whoever embeds it, and the renderer is the piece other people have a reason to
 * use.
 *
 * The root exports are `parse` · `toHTML` · `KINDS` · `PRIMITIVES` · `PRIMITIVES_VERSION`, and beside
 * them the plan each drawer reads. THE PLANS ARE HERE BECAUSE A HOST WIRES THEM: the forms
 * (a path, a range, tiles, `inputs`) shipped with their names reachable only by module path, which
 * the package does not promise, so a host could not name `OnInput` to hand `inputs` its writer.
 * There is no `expand`: kinds expansion belongs to `declare`, not here (ADR-045). The Svelte
 * components live at `braindog-render/svelte` and are held to this renderer by the parity gate.
 */

export { parse, splitRow, type Block, type Degraded, type Markdown, type ParseOptions, type Row, type RowRef, type Segment } from './parse.ts';
export { toHTML, filtersHTML, captioned, describe, escape, holeLabel, hrefFor, verbatimText, EMPTY_KEEP, drawnRows, emptied, keepsNought, type RenderOptions } from './html.ts';
export {
  CARD_ROLES,
  CARDS_NEXT,
  CARDS_NONE,
  cardsCount,
  FOLD_HIDE,
  FOLD_SHOW,
  TREND,
  agentMarkFill,
  cardFault,
  cardLayout,
  counted,
  initialOf,
  isQuiet,
  markOf,
  ringDash,
  ringOf,
  trendOf,
  type AgentMark,
  type CardLayout,
  type CardRole,
} from './cards.ts';
export { hueOf } from './cards.ts';
export { CARD_EDIT_PAUSE, CARD_EDIT_ROLES, cardEdit, editAfter, editable, type CardEdit, type EditColumn, type EditField } from './card-edit.ts';
export { AGENTS_EARLIER, AGENTS_NOTHING, AGENT_VERBS, agentDoing, agentsPlan, type AgentGroup } from './agents.ts';
export {
  QUEUE_CLEARED,
  QUEUE_COSTS,
  QUEUE_DOES,
  QUEUE_REASONS,
  QUEUE_RECOMMENDED,
  QUEUE_ROWS,
  fileSrc,
  queueCost,
  queueFault,
  queueMore,
  queuePlan,
  queueReasoned,
  queueSuggested,
  queueWays,
  showsOf,
  type QueueItem,
  type QueueOption,
  type QueueRowKind,
  type QueueShows,
} from './queue.ts';
export { spoken } from './spoken.ts';
export {
  CAPTURE_ADD,
  CAPTURE_ROWS,
  captureFault,
  captureNowhere,
  capturePlan,
  capturePrompt,
  capturePromptFor,
  captureSubmit,
  type CapturePlan,
  type CaptureRowKind,
} from './capture.ts';
export { takeWorking, workingCell, WORKING_GLYPH, WORKING_LABEL, WORKING_MARK } from './working.ts';
export { CHOICE_KEYS, choiceOf, rowAt, rowKey } from './cursor.ts';
export {
  FILTERS_ALL,
  FILTER_CHIPS,
  SEGMENTED_MOST,
  filtersMore,
  filtersPlan,
  type Filter,
  type FilterChoice,
  type FilterPlan,
  type FilterValue,
  type OnFilter,
} from './filters.ts';
export { dayThisYear, rowsCell, timelineCell, timelineDays } from './timeline.ts';
export {
  TABLE_CHUNK,
  TABLE_ROWS_LABEL,
  ariaSort,
  chunkRows,
  comparisonPlan,
  glyphColumn,
  intrinsicRows,
  tableCellBody,
  type Column,
  type TableCellBody,
  type TableRow,
} from './table.ts';
export {
  FEED_BY,
  FEED_DAY,
  FEED_EARLIER,
  FEED_GROUPS,
  FEED_NO_MARK,
  FEED_NOTHING_NEW,
  FEED_SEEN,
  feedBurst,
  feedCased,
  feedCasedNodes,
  feedFault,
  feedFold,
  feedNew,
  feedPlan,
  type FeedBy,
  type FeedGroup,
} from './feed.ts';
export {
  DIFF_GLYPHS,
  DIFF_WORDS,
  diffFault,
  diffFolded,
  diffPlan,
  diffRows,
  diffSummary,
  lineDiff,
  readDiffRow,
  type DiffLine,
  type DiffOp,
  type DiffPart,
} from './diff.ts';
export { SPLIT_AMOUNT, SPLIT_PART, SPLIT_SHARE, SPLIT_STEPS, SPLIT_ZERO, splitPlan, splitSentence, type SplitPart, type SplitPlan } from './split.ts';
export { BRIDGE_AMOUNT, BRIDGE_STEP, BRIDGE_UNKNOWN, bridgeOff, bridgePlan, bridgeSentence, moveOf, signedOf, type BridgeBar, type BridgeMove, type BridgePlan } from './bridge.ts';
export { SERIES_AHEAD, SERIES_DUE, SERIES_MOST, SERIES_NET, SERIES_NONE, SERIES_NUMBERS, SERIES_PARTIAL, SERIES_POINTS, seriesNice, seriesPlan, seriesValue, type SeriesBar, type SeriesDir, type SeriesPlan, type SeriesState, type SeriesTick, type SeriesTotal } from './series.ts';
export { LINES_AGAINST, LINES_MOST, LINES_NONE, LINES_NOTHING, LINES_NUMBERS, changeSaid, linesNearest, linesPlan, linesValue, type LinesLine, type LinesPlan } from './lines.ts';
export {
  PROGRESS_LIMIT,
  PROGRESS_NEAR,
  PROGRESS_NONE,
  PROGRESS_NOT_SPENT,
  PROGRESS_OF,
  PROGRESS_PART,
  PROGRESS_REACHED,
  PROGRESS_SHARE,
  PROGRESS_SO_FAR,
  PROGRESS_SPENT,
  PROGRESS_TARGET,
  PROGRESS_TOTAL,
  progressLeft,
  progressOver,
  progressPlan,
  progressRangeSaid,
  progressSentence,
  progressSpentSaid,
  progressToGo,
  rangePlan,
  rangeSentence,
  type ProgressBar,
  type ProgressForm,
  type ProgressInput,
  type RangeBar,
  type RangeInput,
} from './progress.ts';
export { PATH_DONE, PATH_EVERYTHING, PATH_NEXT, PATH_STEP, PATH_VIEWS, pathFault, pathMore, pathPlan, pathRest, pathShort, unvalued, type PathMark } from './path.ts';
export { CALENDAR_DAY, CALENDAR_MONTHS_MOST, CALENDAR_NONE, CALENDAR_TODAY, CALENDAR_WEEKS_MOST, CALENDAR_WEEK_NONE, WEEKDAYS, dayParam, calendarDay, calendarMore, calendarOutside, calendarPlan, calendarSaid, calendarSkipped, calendarStripLines, calendarStripPlan, type CalendarCell, type CalendarDay, type CalendarMonth, type CalendarPlan, type CalendarStripDay, type CalendarStripLine, type CalendarStripPlan, type CalendarStripWeek } from './calendar.ts';
export { LANES_NONE, LANES_NOW, LANES_WINDOW, lanesFault, lanesInstant, lanesMore, lanesOutside, lanesPlan, lanesSentence, lanesSince, lanesSkipped, type Lane, type LanesPlan, type LanesTick } from './lanes.ts';
export { LINK_ADDRESS, LINKS_NONE, linkFault, linkHost, linkHref, linkPlan, type LinkLine } from './links.ts';
export { GALLERY_NONE, PICTURE_MIMES, fileRef, galleryPlan, isPictureMime, pictureSrc, type GalleryTile } from './gallery.ts';
export { EMBED_ASPECTS, EMBED_NONE, EMBED_PROVIDERS, embedAspect, embedFault, embedLoad, embedOf, embedOpen, embedPlan, type EmbedAspect, type EmbedPlan, type EmbedProvider } from './embed.ts';
export {
  INPUT_TYPES,
  INPUTS_NONE,
  controlOf,
  inputsFault,
  inputsPlan,
  isTicked,
  type InputControl,
  type InputField,
  type InputType,
  type OnInput,
} from './inputs.ts';
export { figureLike } from './figure.ts';
export {
  FORECAST_KNOBS,
  addDays,
  against,
  baseKnobs,
  daysBetween,
  forecastModel,
  forecastPlan,
  horizonChoices,
  knobsIn,
  knobsMoved,
  largest,
  readoutAt,
  scenario,
  shortDay,
  type ForecastKnob,
  type GroupKnobs,
  type ForecastModel,
  type ForecastPlan,
  type ForecastStep,
  type Knobs,
  type Scenario,
} from './forecast.ts';
export { forecastFigure } from './forecast.ts';
export { UNNAMED, cellNamesNothing, inline, magnitudeOfCell, namesNothing, safeHref, text, type Inline, type InlineOptions, type Resolve } from './inline.ts';
export {
  KINDS,
  PRIMITIVES,
  PRIMITIVES_VERSION,
  TONES,
  TONE_ALIAS,
  BAR_HOLE,
  SPARKLINE_POINT,
  SECTION_TONES,
  sectionTone,
  isKind,
  type DegradeCode,
  type Kind,
  type KindSpec,
  type Primitive,
  type SectionTone,
  type Tone,
} from './kinds.ts';
export { PACK_KIND, isPackKind, kindSpec, type BlockKind, type PackKind } from './kind-spec.ts';
export { kindsFor, type KindColumn } from './kinds-for.ts';
export { KIND_LINES, REACH_FOR, kindLine, type KindLine } from './kind-lines.ts';
export {
  MISSING,
  TYPED,
  bytes,
  dateLong,
  day,
  exponentOf,
  formatTyped,
  integer,
  magnitudeOf,
  money,
  pct,
  quantity,
  ref,
  relative,
  since,
  stamp,
  valueWord,
  yesno,
  type TypedForm,
  leadingCode,
  symbolFigure,
  symbolText,
  figureChars,
  headlineFigure,
  headlineMoney,
  axisFigure,
  barFigure,
  zeroFigure,
  type Home,
} from './format.ts';
/* The one writer of an amount for a screen (REC-C05): the stored form read, and written for exact, read and axis. */
export { AMOUNT_SPACE, amountsIn, readAmount, readFigure, writeAmount, writeFigure, type Amount, type AmountSetting, type Figure, type WrittenAmount } from './money.ts';
/* The page lint (PRF-A04): what a drawn page prints that a person should never read. The host draws its pages and runs it. */
export { LINT_RULES, lintHtml, lintPage, lintPart, lintText, type LintFinding, type LintPage, type LintPart, type LintRule } from './lint.ts';
/* The look sheets (EXP-C05): fixed specimens of every chart form, the plan and the parts, drawn on one fixed day. */
export { FAILED_RUN, SHEET_DAY, SHEET_FORMS, SHEET_KINDS, SHEET_NOW, SHEET_POINTS, SHEET_STALE_STEPS, SHEET_STATES, SPECIMEN, chartSpecimen, chartSpecimens, partSpecimens, planSpecimen, planSpecimens, sheetKey, specimenFor, specimenSegments, specimenStale, type SheetAge, type SheetForm, type SheetKind, type SheetState, type Specimen } from './sheet.ts';
/* A declared block's actions (PGS-A12): the plan Block.svelte draws them by, and the quiet line of labels without a host. */
export * from './actions.ts';
/* A form block (`form`): the plan Form.svelte draws by, what a press sends, and the lines without a host. */
export * from './form.ts';
/* The glyph groups (PGS-A08): which glyphs are the core, the set and the shell's, read by the grammar an agent is handed. */
export { GLYPH_GROUPS, GROUP_SAYS, glyphGroups, groupOf, markGlyphs, markGroups, type GlyphGroup } from './glyphs/groups.ts';
/* A long block of cards or a series (`most`): how many it shows before "Show all", and the words for the rest. */
export { MOST_CARDS, MOST_LEAST, MOST_MOST, isMost, mostOf, moreSaid, showAllSaid, type MostKeys } from './most.ts';
