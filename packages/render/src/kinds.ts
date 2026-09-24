/**
 * The eight primitives, the thirty-three kinds, and the four intent words.
 *
 * A block set is a SYSTEM, not a catalogue. Every kind draws from the same eight primitives and the
 * same tokens, and no kind introduces a colour, a font or a spacing value (05 §1).
 *
 * The twenty ship as ONE table rather than twenty files, in the shape a pack's `block`
 * declaration takes, so a first-party kind and a kind a pack invented after the bundle shipped
 * travel one code path (22 §3, ADR-056).
 */

/** Closed, versioned, and the real API surface. Eight is reviewable; unbounded kinds are not. */
export const PRIMITIVES = [
  'panel',
  'grid',
  'rows',
  'proportional',
  'inline',
  'list',
  'table',
  'media',
] as const;

export type Primitive = (typeof PRIMITIVES)[number];

/**
 * The class each primitive draws with, and the ONE place the mapping is written.
 *
 * A THEME HAS TO KNOW THESE NAMES and must not import this package to learn them — it has no
 * workspace dependencies, which is what makes it a seam rather than a layer. So the names are
 * EXPORTED here and handed in there, and the one gap that mattered is why: the forced-colours
 * boundary list was hand-written against a mental model of the app, so `.prop`, `.inline` and
 * `.list` were missing — six of the sixteen kinds of the day lost every boundary under Windows High Contrast —
 * while `.card`, `.field` and `.sheet` were in it and are classes nothing emits.
 */
export const PRIMITIVE_CLASSES: Record<Primitive, string> = {
  panel: 'panel',
  grid: 'grid',
  rows: 'rows',
  proportional: 'prop',
  inline: 'inline',
  list: 'list',
  table: 'table',
  media: 'media',
};

/** An integer a pack's manifest compares against. The record refuses an install when its own is lower. */
export const PRIMITIVES_VERSION = 1;

/**
 * The four words an agent may write, and the only path by which an intent reaches the DOM.
 *
 * The GLYPH IS PART OF THE TOKEN, not a choice at the call site. Under simulated dichromacy the
 * intent hues collapse — measured, 13 §2.3 — so a component cannot render `warn` without its glyph,
 * because there is no API that lets it.
 *
 * Each glyph carries U+FE0E, the text presentation selector. Without it ⚠ and ✓ resolve to COLOUR
 * EMOJI on most platforms — which paints an intent in a colour no theme chose and no validator
 * measured, and quietly breaks the rule that no component writes a colour (22 §7 gate 3).
 */
export const TONES = {
  good: { role: 'earn', glyph: '✓︎', label: 'good' },
  warn: { role: 'warn', glyph: '⚠︎', label: 'watch this' },
  bad: { role: 'danger', glyph: '⊘︎', label: 'wrong' },
  // `info` names a role of its own rather than borrowing `accent`, because in the house theme the
  // accent IS the mark and the mark is red — see the seed in `@braindog/theme`.
  info: { role: 'info', glyph: 'ⓘ︎', label: 'note' },
} as const;

export type Tone = keyof typeof TONES;

/** An author who reaches for a colour role gets the intent, not a refusal (05 §7.4). */
export const TONE_ALIAS: Record<string, Tone> = {
  earn: 'good',
  danger: 'bad',
  accent: 'info',
  risk: 'warn',
};

/** `hole` is a tone, on `bar` only: the row that is a task, not a value (05 §7.5). */
export const BAR_HOLE = 'hole';

/** The head of the position column in a `sparkline`'s fold, where each drawn line's points are a column. */
export const SPARKLINE_POINT = 'Point';

export type KindSpec = {
  primitive: Primitive;
  /** How many cells a row takes, before the optional trailing tone word. */
  cells: number;
  /**
   * How many of those cells, counted from the end, a row may leave off. A tone word is read from
   * the first cell past the required ones, so a `stat` row of three cells and a tone keeps its tone
   * while a fourth cell, the trend, is still room the row has.
   */
  optional?: number;
  /**
   * The words a fence may put after the kind, before the heading: ` ```stat lead | Cash ` is the
   * `lead` form of `stat`. Any other word degrades, naming the forms there are.
   */
  forms?: readonly string[];
  /** Whether a trailing tone word is read as the row's tone. */
  tone: boolean;
  /** A row cap. Over it, the block degrades under DIALECT_ARITY — there is no DIALECT_ROWS. */
  rows?: number;
  /** Rows are taken verbatim: never split on `|`, never trimmed. */
  verbatim?: boolean;
  /**
   * The body is prose, so a line is never split into cells and can never overflow an arity.
   * `note` is the ONLY drawn kind in the `measure` class, because it is the only one that may
   * contain a paragraph (13 §4.1).
   */
  prose?: boolean;
  /** The first row fixes the column count. */
  header?: boolean;
  /** Rows carry a leading `[ ]` or `[x]`. */
  checkbox?: boolean;
  /** The list is a sequence, so its markers are numbers. */
  ordered?: boolean;
  /** A row whose tone cell is `hole` sits last, outside the scale, and is the only row that is a button. */
  hole?: boolean;
  /** Indentation is structural, two spaces per level. */
  indented?: boolean;
  /** Bound to a register rather than to authored rows, so it cannot appear in a write-up. */
  pageOnly?: boolean;
  /**
   * The narrowest `span` this kind stays legible at, out of the page's twelve columns.
   *
   * NOT a taste value and not a per-page decision — it is 13 §4.1's three width classes made
   * enforceable. Width is a property of the KIND: `measure` for prose, `room` for anything with its
   * own internal columns, `content` for a short drawn thing. A `table` at span 3 is eight columns in
   * a quarter of a page, which is not a narrow table — it is an unreadable one, and the person who
   * dragged it there gets no signal that they broke it.
   *
   * So the size control REFUSES below this rather than clamping silently. 21 §11: caps are counters,
   * not discoveries, and a closed list's control cannot express a non-member.
   */
  minSpan: number;
  /**
   * What this kind is FOR, in the picker's own grouping.
   *
   * 21 §3.3 groups the picker by purpose rather than by primitive, and the difference matters: a
   * person adding a block knows they want to show a list, and does not know or care that `todo`,
   * `steps` and `timeline` share the `list` primitive while `chips` does not. The primitive is how
   * the renderer thinks; the purpose is how the author does.
   */
  purpose: 'say' | 'figure' | 'list' | 'plan' | 'media';
};

/**
 * Thirty-three, counted. `diagram` is post-v1 and arrives as a
 * pack, which is the whole reason the primitive layer exists (05 §2).
 *
 * The table is written `as const satisfies` so the KEYS derive the `Kind` union and every entry is
 * shape-checked — and then re-exported as `Record<Kind, KindSpec>`, because `as const` alone narrows
 * each entry to its own literal type and `KINDS[kind].ordered` stops compiling for the kinds that do
 * not set it.
 */
const TABLE = {
  /* Prose and emphasis */
  note: { primitive: 'panel', cells: 0, tone: true, prose: true, minSpan: 4, purpose: 'say' },
  quote: { primitive: 'panel', cells: 2, tone: false, rows: 1, minSpan: 4, purpose: 'say' },

  /* Figures */
  /* A stat row is `label | figure | note | trend`, the trend a run of numbers and optional. The
     `lead` form draws the first figure as the screen's one hero figure. */
  stat: { primitive: 'grid', cells: 4, optional: 1, forms: ['lead'], tone: true, rows: 6, minSpan: 4, purpose: 'figure' },
  bar: { primitive: 'proportional', cells: 3, tone: true, hole: true, minSpan: 4, purpose: 'figure' },
  gauge: { primitive: 'proportional', cells: 3, tone: true, rows: 1, minSpan: 4, purpose: 'figure' },
  chips: { primitive: 'inline', cells: 3, tone: true, minSpan: 3, purpose: 'figure' },
  /* `label | 18 20 19 24 | figure`: a small line and the figure it ends at (`src/cards.ts`'s `trendOf`). */
  sparkline: { primitive: 'proportional', cells: 3, tone: true, minSpan: 3, purpose: 'figure' },
  /* `label | value | note`: one track cut into parts, with a legend, and a `hole` row after it as
     `bar` has (`src/split.ts`). */
  split: { primitive: 'proportional', cells: 3, tone: true, hole: true, minSpan: 4, purpose: 'figure' },
  /* `label | ±amount | note`: from the first row to the last, the rows between moving it
     (`src/bridge.ts`). */
  bridge: { primitive: 'proportional', cells: 3, tone: false, minSpan: 4, purpose: 'figure' },
  /* A header row `Month | in: Money in | out: Money out | state`, then a row a bucket: bars in above a
     zero rule and out below it, and the `net` form's line of what was left (`src/series.ts`). */
  series: { primitive: 'proportional', cells: 0, tone: false, header: true, forms: ['net'], minSpan: 6, purpose: 'figure' },
  /* A header row `Day | Revenue | was: Previous 30 days`, then a row a point: a measure over time as a line, the
     period before as a quiet dashed one, and the lead figure with its change (`src/lines.ts`). */
  lines: { primitive: 'proportional', cells: 0, tone: false, header: true, minSpan: 4, purpose: 'figure' },
  /* `label | value | target | note`: one track a row filled toward its target, and the `budget` form, where the target
     is a limit and spending past it is marked (`src/progress.ts`). */
  progress: { primitive: 'proportional', cells: 4, optional: 1, forms: ['budget'], tone: true, minSpan: 4, purpose: 'figure' },
  /* `opening | day | label | balance`, then `past`, `step`, `horizon` and `knobs` rows: a cash walk as a
     line, with knobs where the host asks for them (`src/forecast.ts`). Page-only, because its rows are
     a walk the record computed. */
  forecast: { primitive: 'proportional', cells: 4, tone: false, pageOnly: true, minSpan: 8, purpose: 'figure' },
  /* `label | value | target`: one row is progress toward the target, and two to five rows are the parts of a whole,
     the third cell then a note (`src/ring.ts`). A 64px dial with the figure in its centre, so it sits beside a stat
     in a third of a page. FIVE AND NO MORE, because a sixth arc is a sliver nobody can find by its step: the four
     neutral steps already make a fifth part share the last, and past that the ring is a pie chart pretending to be
     a gauge. A sixth row degrades as an arity, as a seventh `stat` does. `optional` lets a proportion written as
     `3/5` or `60%` leave the target off and still take a tone word. */
  ring: { primitive: 'proportional', cells: 3, optional: 1, tone: true, rows: 5, minSpan: 3, purpose: 'figure' },

  /* Rows — `spec` is the workhorse: 194 of 7,138 rendered lines in the predecessor's census, and
     no writing guide said so (05 §7.4). */
  spec: { primitive: 'rows', cells: 3, tone: false, minSpan: 4, purpose: 'list' },
  params: { primitive: 'rows', cells: 3, tone: false, minSpan: 4, purpose: 'list' },

  /* Work */
  /* A todo row is `title | detail | fact | fact`, the two facts optional and drawn as ONE quiet line under the
     title, joined by a dot (`src/html.ts`, `svelte/p/List.svelte`).

     TWO FACTS AND NOT ONE, because what was lost was two. Work's Waiting on you said when each task fell due and
     who changed it last at 1.5.0, and on a `todo` of two cells both went, since a four-cell row written into a
     page degraded whole as DIALECT_ARITY (measured 22 September). A third cell alone would have made that page
     choose again, or join the two upstream into one string, and a joined string cannot be formatted per field:
     the due day is a date and the change is an actor and an age, and `display()` knows each only by its field.

     AND NO MORE THAN TWO, because one line under a title holds two short facts and a third is a table. A row
     of five cells still degrades. `optional` changes nothing a reader sees on a kind with no tone word, and it is
     written so the declaration says what the row means: the last two cells may be left off, and a two-cell
     todo, or one whose last two cells are blank as a page's projection pads them, draws exactly as it did. */
  todo: { primitive: 'list', cells: 4, optional: 2, tone: false, checkbox: true, minSpan: 3, purpose: 'plan' },
  steps: { primitive: 'list', cells: 3, tone: false, ordered: true, minSpan: 4, purpose: 'plan' },
  timeline: { primitive: 'list', cells: 3, tone: true, minSpan: 4, purpose: 'plan' },
  board: { primitive: 'grid', cells: 3, tone: false, minSpan: 6, purpose: 'plan' },
  /* `day | value`: twelve weeks by weekday ending on this one, each day washed by how busy it was (`src/heat.ts`,
     over `src/days.ts`'s grid). On `grid`, because a day is a cell to read and point at and not a magnitude along a
     track, and a drawer that does not know the kind yet falls back to the grid's label and figure, which reads as the
     day and its count. The value may be left off, and a row with none is one of something, as a register's row on a
     day is. No tone: the wash is the reading, and a tone on one day would be a fifth colour in a scale of four. */
  heat: { primitive: 'grid', cells: 2, optional: 1, tone: false, minSpan: 4, purpose: 'figure' },
  /* `title | by | effort`: a task as a bar ending on its due day, as long as its effort in days, and a task
     with no effort as a dated stem (`src/roadmap.ts`). On `list`, because the README has called a roadmap
     a list with dates since the primitive table was written, and because a drawer that does not know the
     kind yet falls back to the list's title, detail and state, which reads as the task, its day and its
     effort. On `proportional` it would have fallen back to a bar scaled off the date cell, and
     `magnitudeOfCell` reads `2026-09-10` and `2026-10-05` both as 2026 (measured), so every task would
     have drawn one identical full-length bar.
     `optional` lets a date leave the effort off and still take a tone word. Six columns wide, as `board`
     and `series` are, because a time axis narrower than half a page puts a month in a few pixels. */
  roadmap: { primitive: 'list', cells: 3, optional: 1, tone: true, minSpan: 6, purpose: 'plan' },

  /* Technical */
  code: { primitive: 'media', cells: 0, tone: false, verbatim: true, minSpan: 4, purpose: 'media' },
  tree: { primitive: 'media', cells: 0, tone: false, verbatim: true, indented: true, minSpan: 4, purpose: 'media' },
  comparison: { primitive: 'table', cells: 0, tone: false, header: true, minSpan: 6, purpose: 'list' },

  /* Register-bound */
  table: { primitive: 'table', cells: 0, tone: false, pageOnly: true, minSpan: 6, purpose: 'list' },

  /* Page-bound, on existing primitives so `PRIMITIVES_VERSION` does not move. A `cards` fence's
     first row names what each column is on a card (`src/cards.ts`); a `section` has one row,
     `glyph | count | fold`. Both reach a fence only from a page's own evaluator (`parse`'s `page`). */
  cards: { primitive: 'grid', cells: 0, tone: true, header: true, pageOnly: true, minSpan: 4, purpose: 'list' },
  section: { primitive: 'panel', cells: 3, tone: false, rows: 1, pageOnly: true, minSpan: 12, purpose: 'say' },

  /* The agent path's two more, on existing primitives for the same reason. A `feed` row is
     `by | who | count | what | when`, plus a `seen` row where the reader last looked (`src/feed.ts`);
     it is page-only, because its rows are the record's activity. A `diff` is verbatim rows marked
     `- `, `+ ` or two spaces (`src/diff.ts`), so a write-up can carry one too. */
  feed: { primitive: 'list', cells: 5, tone: true, pageOnly: true, minSpan: 4, purpose: 'list' },
  diff: { primitive: 'media', cells: 0, tone: false, verbatim: true, minSpan: 4, purpose: 'media' },
  /* What each agent did, one group per agent (`src/agents.ts`): `who | count | what | when`. Page-only, as `feed` is. */
  agents: { primitive: 'list', cells: 4, tone: true, pageOnly: true, minSpan: 4, purpose: 'list' },
  /* What is waiting on a person, a question and its ways to answer (`src/queue.ts`). Two kinds of row,
     `q | id | who | when | question | why | cost` and `opt | id | key | label | because | recommended`, as
     `feed` marks one of its rows `seen`. The seventh cell is the band the record put the question in, which
     is also the order the rows arrive in. Page-only, because the questions are the record's own. */
  queue: { primitive: 'list', cells: 7, tone: true, pageOnly: true, minSpan: 6, purpose: 'list' },
  /* The one-line add (`src/capture.ts`): `into | register | label | where` once, then `set | field | value` for each
     equality a new row inherits. On the panel, because it is one bounded field and not rows of anything. Page-only,
     because what it writes into is the record's, and a write-up has no host to write with. */
  capture: { primitive: 'panel', cells: 4, tone: false, pageOnly: true, minSpan: 4, purpose: 'list' },
} as const satisfies Record<string, KindSpec>;

export type Kind = keyof typeof TABLE;

export const KINDS: Record<Kind, KindSpec> = TABLE;

export const isKind = (s: string): s is Kind => Object.hasOwn(TABLE, s);

/** The two render-time degradations. Neither is a refusal: a document is never refused for its dialect. */
export type DegradeCode = 'DIALECT_ARITY' | 'DIALECT_KIND_UNKNOWN';
