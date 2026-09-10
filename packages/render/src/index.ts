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

export { parse, splitRow, type Block, type Degraded, type Markdown, type Row, type Segment } from './parse.ts';
export { toHTML, describe, escape, holeLabel, type RenderOptions } from './html.ts';
export { inline, text, safeHref, type Inline, type InlineOptions, type Resolve } from './inline.ts';
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
  yesno,
  type TypedForm,
} from './format.ts';
