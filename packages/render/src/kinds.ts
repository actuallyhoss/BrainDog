/**
 * The eight primitives, the sixteen kinds, and the four intent words.
 *
 * A block set is a SYSTEM, not a catalogue. Every kind draws from the same eight primitives and the
 * same tokens, and no kind introduces a colour, a font or a spacing value (05 §1).
 *
 * The sixteen ship as ONE table rather than sixteen files, in the shape a pack's `block`
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
  info: { role: 'accent', glyph: 'ⓘ︎', label: 'note' },
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

export type KindSpec = {
  primitive: Primitive;
  /** How many cells a row takes, before the optional trailing tone word. */
  cells: number;
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
};

/**
 * Sixteen, counted. `diagram`, `sparkline`, `series` and `forecast` are post-v1 and arrive as a
 * pack, which is the whole reason the primitive layer exists (05 §2).
 */
export const KINDS = {
  /* Prose and emphasis */
  note: { primitive: 'panel', cells: 0, tone: true, prose: true },
  quote: { primitive: 'panel', cells: 2, tone: false, rows: 1 },

  /* Figures */
  stat: { primitive: 'grid', cells: 3, tone: true, rows: 6 },
  bar: { primitive: 'proportional', cells: 3, tone: true, hole: true },
  gauge: { primitive: 'proportional', cells: 3, tone: true, rows: 1 },
  chips: { primitive: 'inline', cells: 3, tone: true },

  /* Rows — `spec` is the workhorse: 194 of 7,138 rendered lines in the predecessor's census, and
     no writing guide said so (05 §7.4). */
  spec: { primitive: 'rows', cells: 3, tone: false },
  params: { primitive: 'rows', cells: 3, tone: false },

  /* Work */
  todo: { primitive: 'list', cells: 2, tone: false, checkbox: true },
  steps: { primitive: 'list', cells: 3, tone: false, ordered: true },
  timeline: { primitive: 'list', cells: 3, tone: true },
  board: { primitive: 'grid', cells: 3, tone: false },

  /* Technical */
  code: { primitive: 'media', cells: 0, tone: false, verbatim: true },
  tree: { primitive: 'media', cells: 0, tone: false, verbatim: true, indented: true },
  comparison: { primitive: 'table', cells: 0, tone: false, header: true },

  /* Register-bound */
  table: { primitive: 'table', cells: 0, tone: false, pageOnly: true },
} as const satisfies Record<string, KindSpec>;

export type Kind = keyof typeof KINDS;

export const isKind = (s: string): s is Kind => Object.hasOwn(KINDS, s);

/** The two render-time degradations. Neither is a refusal: a document is never refused for its dialect. */
export type DegradeCode = 'DIALECT_ARITY' | 'DIALECT_KIND_UNKNOWN';
