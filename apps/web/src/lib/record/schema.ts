/**
 * The shapes the app renders.
 *
 * These are the record's types as the browser sees them, not the kernel's. The app is a client of
 * the same API the agents use: every call is `POST /api/<method>` with the session cookie and
 * nothing else, and it never holds a bearer token (50 §1).
 *
 * MONEY IS ALWAYS AN INTEGER IN MINOR UNITS, with its own currency beside it. Divide by 100 before
 * saying a number out loud, and never add two currencies.
 */

export type FieldType =
  | 'text'
  | 'document'
  | 'money'
  | 'day'
  | 'instant'
  | 'int'
  | 'decimal'
  | 'enum'
  | 'bool'
  | 'ref'
  | 'secret'
  | 'duration';

export type FieldDecl = {
  id: string;
  type: FieldType;
  /** The label a person reads. Absent means the id with `_` as a space (50 §10). */
  label?: string;
  /** `enum` only. An unknown value at install is ENUM_VALUE_UNKNOWN. */
  values?: readonly string[];
  /** Only indexed fields may be filtered on, and only eight are offered (50 §5.2). */
  index?: boolean;
  /**
   * This day is a DEADLINE: a date the row is measured against, so past it is late.
   *
   * Opt-in, and it has to be, because the row's tone was taken from the first indexed `day` field
   * the register happened to declare. `tracks` declares `opened`, which is always in the past, so
   * every unfinished track was drawn in the alarm colour and the only row that was not red was the
   * finished one — a track whose newest update says "on track", painted as an emergency. A date and
   * a deadline are different things and only the declaration knows which this is.
   */
  deadline?: boolean;
  required?: boolean;
  /** `ref` only: the register it points at. */
  to?: string;
  /**
   * How a `duration` is SAID. It is stored as integer seconds, because seconds is one unit and
   * `0.2` is a number of some unit the field forgot to name.
   */
  unit?: string;
};

/**
 * The glyph a nav row wears.
 *
 * A NAME, not a path: a declaration that could ship arbitrary SVG is a declaration that can ship a
 * colour and a tracking pixel, and the icon set is the whole point of having one (22 §9). Unknown
 * names fall back to the primitive glyph for the thing, never to nothing — a rail where half the
 * rows have a glyph and half do not reads as a rendering bug, not as a hierarchy.
 */
export type IconRef = string;

export type RegisterDecl = {
  id: string;
  /** What a person calls the collection, and one of them. Never an id in a heading (29 §5). */
  name: string;
  one: string;
  /** One line saying what this register is FOR — the body of its `no-data-yet` state. */
  holds: string;
  /** The field that titles a row. */
  title: string;
  /** Three fields, declared, that become a two-line card below 640px. A declaration, not a media
      query — density follows the pointer, never the width (13 §10). */
  mobile: readonly [string, string, string];
  /** The field whose value carries the row's state, if it has one. */
  state?: string;
  /** Which state values are terminal, so `cleared` can say when the last one closed. */
  done?: readonly string[];
  fields: readonly FieldDecl[];
  /** Rows of this register HAVE an identity: a mark and a frozen accent hue (13 §2.1b). */
  identity?: { mark: string; accent: string };
  /** The rail glyph. Falls back to `rows`, which is what a register is. */
  icon?: IconRef;
  /** The pack that owns it, or absent for a register the person made. */
  pack?: string;
};

/**
 * A money value: an integer in minor units, WITH ITS OWN CURRENCY.
 *
 * The pair is the type, and it is one object rather than two fields for the reason the rule exists:
 * an amount that can be separated from its currency is an amount that will be, and the separation
 * is never noticed — a sum of eight sterling invoices and one euro one is a number, and it looks
 * exactly like a right one.
 */
export type MoneyValue = { amount: number; currency: string };

export const isMoney = (v: unknown): v is MoneyValue =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as MoneyValue).amount === 'number' &&
  typeof (v as MoneyValue).currency === 'string';

export type Fields = Record<string, string | number | boolean | MoneyValue | null>;

export type Entry = {
  /** The number you can say out loud. Per-register, and it is why renaming a register is refused. */
  seq: number;
  fields: Fields;
  /** The compare-and-set value. Last-writer-wins is wrong for money (22 §5). */
  version: number;
  created: string;
  /** Written by an agent, by a rule, or by a person. */
  by: string;
};

export type PageBlock = {
  kind: string;
  heading?: string;
  /**
   * How many of the page's twelve columns this block takes. 1–12, default 12 (06 §1.1).
   *
   * COLUMNS, AND NOTHING ELSE. There is no x, no y, no height and no pixel anywhere in this type,
   * and that is the whole design rather than an omission. 21 §3.1 rejects free placement on
   * measured evidence: in Home Assistant's masonry a ONE-PIXEL height difference could move a card
   * from the leftmost column to the rightmost, and people lost their spatial memory of where a
   * control lived. Blocks flow in declaration order, so a layout cannot have a hole in it, cannot
   * reflow when a query returns one more row, and collapses to one column on a phone by keeping
   * the only thing that carried meaning — the order.
   *
   * Height is deliberately absent too. What a person means by "make it taller" is "show me more
   * rows", and that is `limit` — a number that survives a font-size change, a density change and a
   * phone, where a pixel height does not.
   */
  span?: number;
  source?: string;
  where?: string;
  columns?: readonly { field: string; label?: string; width?: string; align?: 'start' | 'end'; link?: boolean }[];
  cells?: readonly { metric: string; label: string }[];
  order?: readonly { field: string; dir: 'asc' | 'desc' }[];
  limit?: number;
  /**
   * `gauge` only: the number the sum is measured against.
   *
   * It is on the DECLARATION and not in the rows because a budget is a decision somebody made, not
   * a figure the register holds. A gauge with no target draws nothing rather than inventing one.
   */
  target?: number;
  /**
   * ROWS SOMEBODY WROTE, for the kinds that are not bound to a register.
   *
   * 05 §2 is explicit that `table` is "the one kind bound to a `source:` register rather than to
   * authored rows" — so authored rows are the NORM in the dialect and the register-bound block is
   * the exception. The declaration had no way to carry them, which made three of the sixteen kinds
   * undeliverable: `comparison` is defined as "a small table you write yourself", and a `quote` and
   * a `tree` are by definition not projections of anything.
   *
   * It is `authored:` and not `rows:` because the two are different halves of the same idea and the
   * name should say which half. The author writes `authored`; the evaluator produces `rows`. A
   * register-bound block has the second and not the first, and one of these kinds has the first and
   * not the second — a block with both is a declaration that cannot decide where its content comes
   * from, and the evaluator refuses it rather than picking.
   *
   * Cells are an array rather than a pipe-delimited string so that nobody has to escape a
   * separator, and so the arity can be checked against the kind before anything renders.
   */
  authored?: readonly { cells: readonly string[]; tone?: 'good' | 'warn' | 'bad' | 'info' }[];

  /**
   * `forecast.runway` only: what is liquid TODAY, in minor units.
   *
   * SOMEBODY HAS TO SUPPLY IT. A runway seeded from a balance nobody declared is a forecast that
   * looks like a fact and is a guess — and the block was reading a module constant of GBP 42,000
   * while its own declaration said GBP 5,000, so the tile and the page it sat on disagreed by 8.4
   * times, in the one figure this product computes about the future.
   */
  opening?: number;

  /**
   * `forecast.runway` only: which registers the walk reads, and what each one contributes.
   *
   * DECLARED, NOT WIRED. A forecast that knew the word `obligations` is a forecast that works for
   * one record — which is exactly what it was: the declaration was in the page and the walk
   * ignored it, so a customer whose money lives in a register of their own got a cash walk over
   * somebody else's registers or none at all.
   */
  from?: readonly {
    register: string;
    /** The date field the movement happens on. */
    on: string;
    /** The money field. Its currency is the walk's, and two of them is a refusal. */
    amount: string;
    where?: string;
    /** Which values of a field mean money ARRIVING. Absent means every row is an outgoing. */
    incoming?: { field: string; is: string };
    /** A movement that recurs: a field naming a cycle, and a table of months per cycle. */
    every?: { field: string; months: Readonly<Record<string, number>> };
  }[];

  /** Mandatory on every source-bound block. An empty state that says nothing is a dead end, and a
      record is MOSTLY empty on day one (06 §1). */
  empty?: string;
  tone?: 'good' | 'warn' | 'bad' | 'info';
  body?: string;
  /** The server evaluated `when:` and said whether to draw it. A page that shows a warning that does
      not apply teaches people to ignore warnings. */
  drawn?: boolean;
};

export type PageDecl = {
  /**
   * The row this page is ABOUT, when it is about one.
   *
   * A project page is the register's own numbers with one `where` on the front, and the thing it
   * narrows to already carries an identity: a mark and a hue chosen at create and frozen. Naming it
   * here lets the page and its rail row wear that colour, which is the only colour in the product
   * that means something specific — WHICH PROJECT — rather than something general.
   */
  identity?: { register: string; seq: number };
  /**
   * ONE DECLARATION, ONE PAGE PER ROW.
   *
   * A project page is the register's own numbers with a `thing is Kiln` on the front — which was
   * written in a comment above the old metric switch and was false in the code under it. Four
   * projects meant four page rows with the name typed into every predicate, every metric id and
   * every heading, and the page route stripped the repeated clause back out with a string
   * heuristic, which is the admission that the clause should never have been typed.
   *
   * A page that declares `for:` is a TEMPLATE. Every `{{field}}` in it — in a title, a predicate, a
   * heading, an empty state, a metric id — resolves against one row of that register, and the
   * template becomes one page per row the `where` admits. The slug comes from the row's own title,
   * so `/p/kiln` is still `/p/kiln`.
   */
  for?: { register: string; where?: string };
  /** Filled in by the resolver on a page that came from a template. */
  param?: { register: string; seq: number; title: string };
  page: string;
  title: string;
  nav?: { section: string; order: number };
  /** The rail glyph, when the page is placed in nav. Falls back to `doc`. */
  icon?: IconRef;
  requires: readonly string[];
  blocks: readonly PageBlock[];
  pack?: string;
  /** A page that emerged from the data and has not been placed in nav yet (29 §3). */
  origin?: 'derived' | 'person' | 'pack';
  placed?: boolean;
};

/** One open question. Ranked by the cost of being wrong, never by age. */
export type Question = {
  id: string;
  title: string;
  /** Why deciding late is expensive. This is the ranking, made legible. */
  cost: string;
  rank: number;
  opened: string;
  entity?: string;
  options: readonly { key: string; title: string; body: string; recommended?: boolean }[];
  /** Set once, with a mandatory reason, and then the row is immutable. */
  decided?: { option: string; reason: string; by: string; at: string };
};

export type InboxItem = {
  id: string;
  arrived: string;
  from: string;
  subject: string;
  /** Why no pattern matched it. The inbox is what the rules did not claim. */
  body: string;
  /** A pattern the record proposed, present only when a model is configured. */
  suggestion?: string;
};

export type Credential = {
  id: string;
  label: string;
  /** What it OPENS. The register indexes that and never the value itself. */
  opens: string;
  kind: string;
  rotated: string;
  /** Days since rotation, past which the record says so. */
  stale?: boolean;
};

export type AuditEvent = {
  seq: number;
  at: string;
  by: string;
  kind: string;
  target: string;
  note: string;
  version: number;
};

export type PackInfo = {
  id: string;
  name: string;
  blurb: string;
  version: string;
  installed: boolean;
  registers: readonly string[];
  pages: readonly string[];
  author: string;
  stars?: number;
};

export type NewsItem = { at: string; by: string; text: string; href: string; tone?: 'good' | 'warn' | 'bad' | 'info' };

export type Person = { id: string; name: string; level: 'read' | 'write' | 'admin' | 'owner'; hue: number };

export type Job = {
  id: string;
  kind: string;
  status: 'queued' | 'claimed' | 'running' | 'done' | 'failed' | 'stopped';
  model: string;
  started: string;
  events: readonly { seq: number; tool: string; input: string; out: string; ok: boolean }[];
};
