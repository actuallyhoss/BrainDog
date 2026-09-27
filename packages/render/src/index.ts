/**
 * `braindog-render` — the block dialect, MIT.
 *
 * Separately licensed from the app on purpose. The app is Apache-2.0 and this is MIT, because the
 * block dialect is meant to be embedded anywhere, including in code that is not open at all. MIT
 * asks nothing of whoever embeds it, and the renderer is the piece other people have a reason to
 * use.
 *
 * The root exports are `parse` · `toHTML` · `KINDS` · `PRIMITIVES` · `PRIMITIVES_VERSION`, and beside
 * them the plan each drawer reads. THE PLANS ARE HERE BECAUSE A HOST WIRES THEM: wave two's forms
 * (a path, a range, tiles, `inputs`) shipped with their names reachable only by module path, which
 * the package does not promise, so a host could not name `OnInput` to hand `inputs` its writer.
 * There is no `expand`: kinds expansion belongs to `declare`, not here (ADR-045). The Svelte
 * components live at `braindog-render/svelte` and are held to this renderer by the parity gate.
 */

export { parse, splitRow, type Block, type Degraded, type Markdown, type ParseOptions, type Row, type RowRef, type Segment } from './parse.ts';
export { toHTML, captioned, describe, escape, holeLabel, hrefFor, verbatimText, type RenderOptions } from './html.ts';
export {
  CARD_ROLES,
  CARDS_NEXT,
  CARDS_NONE,
  FOLD_HIDE,
  FOLD_SHOW,
  TREND,
  cardFault,
  cardLayout,
  counted,
  initialOf,
  isQuiet,
  markOf,
  ringDash,
  ringOf,
  trendOf,
  type CardLayout,
  type CardRole,
} from './cards.ts';
export { hueOf } from './cards.ts';
export { AGENTS_EARLIER, AGENTS_NOTHING, AGENT_VERBS, agentDoing, agentsPlan, type AgentGroup } from './agents.ts';
export {
  QUEUE_CLEARED,
  QUEUE_COSTS,
  QUEUE_RECOMMENDED,
  QUEUE_ROWS,
  fileSrc,
  queueCost,
  queueFault,
  queueMore,
  queuePlan,
  queueSuggested,
  queueWays,
  showsOf,
  type QueueItem,
  type QueueOption,
  type QueueRowKind,
  type QueueShows,
} from './queue.ts';
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
  FEED_EARLIER,
  FEED_GROUPS,
  FEED_NO_MARK,
  FEED_NOTHING_NEW,
  FEED_SEEN,
  feedFault,
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
export { SERIES_AHEAD, SERIES_DUE, SERIES_MOST, SERIES_NET, SERIES_NONE, SERIES_NUMBERS, SERIES_PARTIAL, seriesPlan, seriesValue, type SeriesBar, type SeriesDir, type SeriesPlan, type SeriesState } from './series.ts';
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
export { PATH_DONE, PATH_EVERYTHING, PATH_NEXT, PATH_STEP, PATH_VIEWS, pathFault, pathMore, pathPlan, pathRest, pathShort, type PathMark } from './path.ts';
export { CALENDAR_MONTHS_MOST, CALENDAR_NONE, WEEKDAYS, calendarDay, calendarMore, calendarPlan, calendarSaid, calendarSkipped, type CalendarCell, type CalendarDay, type CalendarMonth, type CalendarPlan } from './calendar.ts';
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
export { inline, text, magnitudeOfCell, safeHref, type Inline, type InlineOptions, type Resolve } from './inline.ts';
export {
  KINDS,
  PRIMITIVES,
  PRIMITIVES_VERSION,
  TONES,
  TONE_ALIAS,
  BAR_HOLE,
  SPARKLINE_POINT,
  isKind,
  type DegradeCode,
  type Kind,
  type KindSpec,
  type Primitive,
  type Tone,
} from './kinds.ts';
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
  axisFigure,
  barFigure,
} from './format.ts';
