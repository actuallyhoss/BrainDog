/**
 * `braindog-render` — the block dialect, MIT.
 *
 * Separately licensed from the app on purpose. The app is Apache-2.0 and this is MIT, because the
 * block dialect is meant to be embedded anywhere, including in code that is not open at all. MIT
 * asks nothing of whoever embeds it, and the renderer is the piece other people have a reason to
 * use.
 *
 * The root exports are `parse` · `toHTML` · `KINDS` · `PRIMITIVES` · `PRIMITIVES_VERSION`. There is
 * no `expand`: kinds expansion belongs to `declare`, not here (ADR-045). The Svelte components live
 * at `braindog-render/svelte` and are held to this renderer by the parity gate.
 */

export { parse, splitRow, type Block, type Degraded, type Markdown, type ParseOptions, type Row, type RowRef, type Segment } from './parse.ts';
export { toHTML, captioned, describe, escape, holeLabel, verbatimText, type RenderOptions } from './html.ts';
export {
  CARD_ROLES,
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
export { inline, text, magnitudeOfCell, safeHref, type Inline, type InlineOptions, type Resolve } from './inline.ts';
export {
  KINDS,
  PRIMITIVES,
  PRIMITIVES_VERSION,
  TONES,
  TONE_ALIAS,
  BAR_HOLE,
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
} from './format.ts';
