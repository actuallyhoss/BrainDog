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
  /** `enum` only: the words a person reads for some of its values. The column holds the id. */
  labels?: Readonly<Record<string, string>>;
  /** What a new row holds when nobody says, as the record fills it on create. An enum's form opens on it. */
  default?: unknown;
  /** Only indexed fields may be filtered on, and only eight are offered (50 §5.2). */
  index?: boolean;
  /**
   * THIS FIELD IS PART OF WHAT THE ROW IS FOUND BY — and the browser's own mirror did not have it.
   *
   * The seed declares it on nine fields and this type dropped it on the floor, so the app could not
   * have read the declaration even if it had wanted to: `search()` matched titles and the register's
   * text box matched every rendered value, and neither is what `34 §6` and `29 §5` say the record
   * does. A declared key the mirror cannot see is the same defect as a declared key the record
   * accepts and ignores, one layer out.
   *
   * `fts.ts` on why it is opt-in: *"an index over everything answers every query with everything."*
   */
  search?: boolean;
  /**
   * THE FIELD IS STILL DECLARED AND IS NO LONGER READ — the key on the same line of `fts.ts`.
   *
   * `if (!f.search || f.retired) continue`. The `search` half was added here after a review found
   * the mirror could not see it, under the sentence *"a key the mirror cannot see is the same defect
   * as a key the record accepts and ignores"* — and `retired` was left out of the same fix, on the
   * same line of the same file it quotes. A retired searchable field goes on answering queries in
   * the browser and stops answering them in the record.
   */
  retired?: boolean;
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
  /**
   * The field this one makes readable, if it makes one readable.
   *
   * A COLUMN OF AMOUNTS ON UNSTATED PERIODS CANNOT BE READ: `GBP 340.00` beside `GBP 5.00` is not a
   * comparison until one says yearly and the other monthly. `services.cycle` is that field for
   * `services.cost`, and when the default column set narrowed to what a register nominates the
   * amounts stayed and the period went, which is the exact thing the seed's comment on that field
   * predicts. So the pair is declared rather than inferred, and it travels together.
   */
  qualifies?: string;
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
  /** One line saying what this register is FOR, the body of its `no-data-yet` state. The kernel's own
      `session` declares none, so a reader says nothing rather than "holds undefined". */
  holds?: string;
  /** The field that titles a row. */
  title: string;
  /** Three fields, declared, that become a two-line card below 640px. A declaration, not a media
      query — density follows the pointer, never the width (13 §10). */
  mobile: readonly [string, string, string];
  /** The field whose value carries the row's state, if it has one. */
  state?: string;
  /** Which state values are terminal, so `cleared` can say when the last one closed. */
  done?: readonly string[];
  /** A day field the record fills when a row enters a `done` state and empties when it leaves one. */
  finished?: string;
  /** Its rows are steps of the row a `ref` field points at, done when a `bool` field is true (the kernel's `steps.ts`). */
  steps?: { of: string; done: string };
  fields: readonly FieldDecl[];
  /** Rows of this register HAVE an identity: a mark and a frozen accent hue (13 §2.1b). */
  identity?: { mark: string; accent: string };
  /** The rail glyph. Falls back to `rows`, which is what a register is. */
  icon?: IconRef;
  /** The pack that owns it, or absent for a register the person made. */
  pack?: string;
  /** What its rows are spoken as instead of `register#n`: `S` for the kernel's agent runs, `S1`. */
  seq_prefix?: string;
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
  columns?: readonly {
    field: string;
    label?: string;
    width?: string;
    align?: 'start' | 'end';
    /**
     * What the column is on a `cards` block (05 §2). One figure and three facts at most. `scope`, on
     * any other kind, draws where the row applies: its project, or Everywhere.
     */
    as?: 'title' | 'figure' | 'fact' | 'trend' | 'ring' | 'who' | 'when' | 'mark' | 'scope';
    /** A money column's sign, read from an enum: the value that makes the amount go out draws `−`, any other `+`. */
    sign?: { field: string; minus: string };
  }[];
  /** A `section` that starts shut, folding the blocks after it up to the next section. */
  fold?: boolean;
  /** The glyph beside a `section`'s heading. */
  icon?: string;
  /** The project's rows, then the ones that apply everywhere (06 §1.1). */
  inherit?: boolean;
  /** A `feed`'s: `seen` marks the rows after the reader's read mark as new, and `first` caps the rows. */
  since?: 'seen';
  first?: number;
  /** A `diff`'s: the row whose history it reads, the text field it compares, and how many versions. */
  row?: string;
  field?: string;
  versions?: number;
  /** A `stat`'s figures. `trend: 12w` draws how the figure moved over that window, from its daily series. */
  cells?: readonly { metric: string; label: string; trend?: string; note?: string }[];
  /** A `stat`'s: its first figure is the screen's one hero figure. */
  lead?: boolean;
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
  opening?: number | { metric: string };

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

  /**
   * `forecast.runway` only: how many days ahead the walk looks. 180 when it is not declared.
   *
   * IT IS A BUSINESS QUESTION AND `limit:` IS A SCREEN QUESTION. The block derived one from the
   * other — twelve times however many rows fit — so a page declaring twelve rows got a 144-day
   * forecast while its own `empty:` sentence promised six months. The kernel's `PageBlock` has
   * carried this key since it was written and nothing on this side read it.
   */
  horizon?: number;

  /** Mandatory on every source-bound block. An empty state that says nothing is a dead end, and a
      record is MOSTLY empty on day one (06 §1). */
  empty?: string;
  tone?: 'good' | 'warn' | 'bad' | 'info';
  body?: string;
  /** A `note`'s body is a whole document, with its own blocks, drawn as the row page draws it: a project's `{{note}}`. */
  document?: boolean;
  /**
   * Draw this block only when a figure says so. Evaluated at render, never compiled.
   *
   * A WARNING THAT DOES NOT APPLY TEACHES PEOPLE TO IGNORE WARNINGS, which is the whole reason this
   * key exists — and it was documented and not implemented, so a permanent red note naming a
   * counterparty drew on every Money page in every record whether or not anything was overdue. And
   * when the figure it referred to was empty the sentence degraded to a raw internal path, in the
   * danger colour, beside a fabricated claim about somebody the reader has never invoiced.
   */
  when?: { metric: string } & Partial<Record<'gt' | 'gte' | 'lt' | 'lte' | 'is' | 'not', number>>;

  /** The server evaluated `when:` and said whether to draw it. */
  drawn?: boolean;

  /** A `series`'s lines: figures grouped by one date bucket, each `in` or `out`, and `then:` for buckets to come. */
  series?: readonly { metric: string; then?: string; label?: string; dir?: 'in' | 'out' }[];
  /** A `series`'s reach, in buckets: back from the current one, including it, and ahead of it. */
  back?: number;
  ahead?: number;
  /** A `stat` or `lines` over readings: whether a point is a day or a week. */
  bucket?: string;
  /** A `series`'s: draw what was left, in minus out, as a line. */
  net?: boolean;
  /** A `forecast`'s: the series its opening figure is remembered in, drawn before today. */
  recorded?: string;
  /** A `cards` block's: a row whose day in `field` is older than `after` is drawn as out of date. */
  stale?: { field: string; after: string };
  /** A `forecast`'s: which knobs a reader may move. */
  knobs?: readonly ('horizon' | 'late' | 'spend' | 'leave')[];
  /** A `bar` or `split`'s: the label of the row that holds what no part does, drawn last and linked to those rows. */
  unset?: string;
  /** A `bar` or `split`'s: the intent a part is drawn in, by the value it groups, such as `{ off_track: bad }`. A part not named is neutral. */
  tones?: Readonly<Record<string, 'good' | 'warn' | 'bad' | 'info'>>;
  /** A `progress` budget's: the figure, grouped by a word, of what was spent against each row's limit. */
  spent?: string;
  /** A `progress` goal's: the figure, grouped by a link to the block's rows, of what was logged toward each row's target. */
  toward?: string;
  /** A `forecast`'s: the figure its late knob marks, how late money has come in on average. */
  late?: string;
  /** A `forecast`'s: say under the chart how many days are left when the walk goes under within this many days. */
  under?: number;
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
  /** Why it is being asked: the reasoning whoever opened it wrote down with it. Absent when they wrote none. */
  context?: string;
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

/**
 * What a vault row can hold, closed at five: `12 §6`'s prose and the `CHECK` in `30 §1`'s DDL.
 *
 * `kind` WAS `string`, AND THREE OF THE SIX SEEDED ROWS WERE OUTSIDE THE LIST. They read `api key`,
 * `oauth` and `token`:
 *
 *   - `api key` is not a value — the value is `api_token`, and "API key" also uses the word `19 §9`
 *     bans on this exact screen.
 *   - `oauth` is not a `grant.kind` AT ALL. It belongs to `auth.kind`, the connector's eight
 *     (`25 §5.2`: `none · bearer · basic · header · query_param · oauth2_refresh · jwt_rs256 ·
 *     aws_sigv4`), which describes how a CONNECTOR authenticates rather than what a vault row holds.
 *     Two enums, one screen, and the wrong one printed.
 *   - `token` is a `device_grant.reach` value (`02 §1`), from a third table.
 *
 * A closed list typed as `string` is a closed list nothing closes.
 */
export const CREDENTIAL_KINDS = ['api_token', 'password', 'ssh_key', 'recovery_codes', 'note'] as const;
export type CredentialKind = (typeof CREDENTIAL_KINDS)[number];

export type Credential = {
  id: string;
  label: string;
  /** What it OPENS. The register indexes that and never the value itself. */
  opens: string;
  kind: CredentialKind;
  rotated: string;
  /** Days since rotation, past which the record says so. */
  stale?: boolean;
};

/**
 * THE FORTY KINDS AN EVENT CAN HAVE, WHICH THE BROWSER HELD NONE OF — AND NEVER NEEDED TO.
 *
 * `kind` was `string`, and every value in the seed was invented here: `entry.create`,
 * `entry.update`, `question.open`, `declaration.set`, plus `entry.archive`, `question.decide` and
 * `pack.install` in `/audit`'s display map. Seven strings, none of them a kind, on the one screen
 * whose entire subject is what this record recorded. The `CHECK` in migration 0001 would have
 * refused all eight seeded rows.
 *
 * It is the failure this file already names twenty lines above about a different list: **a closed
 * list typed as `string` is a closed list nothing closes.**
 *
 * AND THE LIST WAS ONE IMPORT AWAY THE WHOLE TIME. `packages/kernel/src/events.ts` has held the
 * forty since it was written, `index.ts` exports them, `apps/web` already depends on the kernel and
 * already imports four other things from it — and `event-kinds.mjs` exists solely to keep five
 * copies of this vocabulary agreeing. Declaring a sixth here would have been the same mistake in a
 * newer file. `30 §2` rule 1: a new kind is a kernel migration, so the kernel is where the list
 * lives and everything else reads it.
 */
import type { EventKind } from '@braindog/kernel';
import type { CallOut } from './actions.ts';
export type { EventKind };

export type AuditEvent = {
  seq: number;
  at: string;
  by: string;
  kind: EventKind;
  /**
   * OPTIONAL, because `target` is nullable in the DDL and the ledger had no kind that used the
   * nullability. `30 §1`: `target TEXT` with no `NOT NULL`, and `02 §871`'s field table calls it
   * optional in as many words. A nightly `export` is about the record, not about a row in it — no
   * document gives that event a target, and `string` forced one to be invented before the event
   * could be written down at all. A required field on a nullable column is a fixture that can only
   * hold the rows somebody already thought of.
   *
   * The shape, when there is one, is `45 §5.1`'s: a spoken id (`services#6`), a declaration id
   * (`page.money`), or `<kind>:<spoken id>` for the governance rows — `suggestion:SG31`,
   * `decision:D41`, `prediction:<id>`.
   */
  target?: string;
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
  /**
   * A page of YOURS this pack's nav order would move, and never does.
   *
   * `04 §4`: "The commonest way an extension ecosystem degrades a product is by quietly rearranging
   * the navigation, so a pack does not get to … A pack may place a page it owns; it may never move
   * yours." The move is SHOWN and then ignored — which needs somewhere to be shown from, and there
   * was nowhere: the diff had a `CHANGES` section behind a condition that could not be true, so
   * three sentences about the most important refusal this screen makes rendered nowhere.
   */
  moves?: readonly { page: string; from: number; to: number }[];
  /** A name this pack declares that the record already has. `04 §3`'s `CONFLICTS`. */
  conflicts?: readonly string[];
  /** The scheduled actions it would add, as `planPack`'s `calls_out` carries them (`04 §7`). */
  calls?: readonly CallOut[];
  /**
   * What the pack calls the things it declares, for a pack this record has not installed.
   *
   * `04 §3`'s worked diff prints `register.invoices  11 fields` for a pack that is NOT installed —
   * the plan is computed by READING the pack, so the shape is known before anything is applied, and
   * the Kennel index carries it. Without this the diff falls back to the id, which is the same leak
   * it was rewritten to remove: `learnings`, `skills`, `credentials` in front of somebody deciding
   * whether to trust a stranger's file.
   */
  titles?: Readonly<Record<string, string>>;
};

/**
 * The kinds that REDUCE, and are therefore handed the whole answer rather than a page of it.
 *
 * `bar` groups and counts, `chips` groups and counts, `gauge` sums against a target: each one is
 * arithmetic over every row the predicate admitted, because a sum of the first page is a wrong
 * number rather than a short list. `limit:` cuts their GROUPS, never their rows.
 *
 * IT IS HERE, IN THE FILE THAT IMPORTS NOTHING, because two files need it and neither may import
 * the other: `blocks.ts` is where the three functions read `matched`, and `api.ts` is where the
 * count of what a block draws is computed. Those two disagreeing is a slice line saying "Showing 5
 * of 38" over a chart with all thirty-eight rows in it.
 */
export const REDUCES: ReadonlySet<string> = new Set(['bar', 'chips', 'gauge', 'progress', 'section', 'split']);

export type NewsItem = { at: string; by: string; text: string; href: string; tone?: 'good' | 'warn' | 'bad' | 'info' };

/**
 * The person ladder, closed at five: `read ⊂ append ⊂ write ⊂ decide ⊂ owner` (`20 §1`).
 *
 * IT USED TO ADMIT `admin`, WHICH IS NOT ONE OF THEM. `copy.levelMeans` has the right five and the
 * screen falls back to printing the raw value, so a person at `admin` would have rendered the word
 * `admin` where every other row reads a sentence — an id on the screen that says who can change
 * your business record. `20 §1` also says why the word does not exist: the ladder is "never held by
 * a token or a share link, which is why there is no `admin` token scope".
 */
export const LEVELS = ['read', 'append', 'write', 'decide', 'owner'] as const;
export type Level = (typeof LEVELS)[number];

export type Person = {
  id: string;
  name: string;
  /**
   * Their level over the whole record — the `member` row whose register is `*` — or `null`.
   *
   * `null` IS NOT `read`, AND THE KERNEL HAS SHIPPED BOTH WRONG ANSWERS. `members.ts` records them:
   * it first PROMOTED the highest scoped level to the record-wide one, so somebody invited to one
   * register as its owner was an owner of the record — the vault, the export, `invite` itself; the
   * fix then gave a scoped-only member `read`, which hands an APPENDER a record-wide read, and
   * `append`'s whole point is that it does not read.
   *
   * The browser's mirror typed this `Level`, non-null, so it could not hold the answer either
   * version was arguing about. `null` means *nothing on the record itself* — what somebody holds
   * when they were invited to named lists and nothing else, which is the entire content of "invite
   * the bookkeeper".
   */
  level: Level | null;
  /**
   * The lists where they hold something OTHER than their record level — `member.register`.
   *
   * `20 §1` materialises a **5-person × 14-register matrix**, and `19 §2` names its absence as the
   * reason this area exists: *"the second left `20-COLLABORATION`'s 5-person × 14-register access
   * matrix with no screen anywhere in 24 documents."* The screen replaced it with one level each,
   * so the sentence the feature is FOR could not be drawn — `members.ts`'s own header: *"Somebody can
   * be an owner of the record and hold nothing more than `read` on the one register that carries the
   * payroll — because the alternative is a product where inviting a bookkeeper means showing them
   * everything, and what people do then is not invite the bookkeeper."*
   *
   * It overrides the record level in BOTH directions. A scoped level that could only narrow would
   * make the other half — `read` on the record, `write` on one list — impossible.
   */
  scoped: readonly { register: string; level: Level }[];
  /** The invitation is bound to one email (`12 §3`), so this is the identifier and not the name. */
  email: string;
  /** When they accepted. `null` while an invitation is still out. */
  since: string | null;
  /**
   * `person.suspended_at` — stopped without being decided about.
   *
   * `20 §6` puts it beside removal for a reason: removal deletes the levels, so restoring somebody
   * means remembering what they held. Suspension keeps every row and stops every one of them
   * working, which is what you reach for when somebody has left for a fortnight. `access()` reads it
   * now; for a while it was a column the interface could show and the ladder could not enforce.
   */
  suspended: string | null;
  /**
   * `member.seen_at` — how far they have read, and the one column of `member` the mirror lacked.
   *
   * `20 §6` is a table of what is worth building against what is theatre, and this is on the left:
   * *"**Read marks on decisions** — who has seen the thing that binds them"*, against *"currently
   * viewing"* on the right. The whole argument for it is that a decision binds people who were not
   * in the room, so the question a record can answer and a chat cannot is whether they have looked.
   *
   * The kernel has had the column since migration 0001 and `markRead` since `45 §5.2`; `members()`
   * returns it per person. The browser's `Person` carried the matrix and the suspension and stopped
   * one column short, so the People screen showed what everybody MAY do and nothing about whether
   * any of them had been.
   *
   * `null` is *they have not*, which is a different sentence from *a long time ago* and has to read
   * as one.
   */
  seen: string | null;
};

/**
 * A passkey this person can get back in with. `/settings/recovery` (`49 §5.8` step 5).
 *
 * `19 §2` names the area and says why it exists: "`recovery` and `people & sharing` were missing
 * from an earlier draft — the first left a passkey-primary product with NO DESIGNED WAY BACK IN."
 */
export type Passkey = { id: string; label: string; added: string; lastUsed: string | null };

/**
 * A sealed copy of the whole record. `53 §5.4`: "Three mechanisms, one contract: nightly, sealed,
 * thirty kept, restorable."
 *
 * `03 §6` is why it is not an export: "A snapshot is not an export: it is a full copy … disaster
 * recovery, not portability." The two live in different settings areas for that reason.
 */
export type Snapshot = {
  id: string;
  at: string;
  bytes: number;
  rows: number;
  /**
   * Why this night produced nothing, or `null`.
   *
   * `12 §8`: *"A backup that silently gave up is worse than none."* The record writes an `export`
   * event with `note: 'failed: <reason>'` and opens a suggestion (`49 §5.13` raises a question on a
   * self-host), and the screen listing what is kept is where somebody would look. A list of four
   * successes cannot show the one state the feature is for.
   */
  failed: string | null;
};

/**
 * A connector that pulls rows in. `25 §9` draws this screen — the most concrete UI specification
 * for any settings area — and its display words are three, not five.
 */
export type Source = {
  id: string;
  name: string;
  /** `ok · failing · paused`, from `PullResult.outcome` and the schedule row (47 §12). */
  state: 'ok' | 'failing' | 'paused';
  lastAt: string;
  /** `null` while paused: nothing is scheduled until somebody reconnects it. */
  nextAt: string | null;
  points: number;
  /** Why it stopped. `13 §6`: the app prints the server's `fix` VERBATIM. */
  error?: { code: string; fix: string; credential: string; at: string };
};

/**
 * A machine that asked to act as you, and what happened to the request. `12 §6.1`.
 *
 * "One row, two lives: pending → approved → active." And a denied row is KEPT, because
 * *"I said no to a request I did not make"* is the single most important line the table can
 * produce — a denial that leaves no trace is a break-in attempt nobody can see afterwards.
 */
/**
 * What a device grant reaches — `30 §1`'s `CHECK (reach IN (…))`, all six.
 *
 * TWO OF THEM ARE LONG-LIVED AND FOUR ARE ONE OPERATION. `login` and `runner` mint a ninety-day
 * bearer; `export`, `import`, `pack` and `token` are the OPERATION GRANT of `48 §13 D1` — one named
 * ADMIN operation, ten minutes, single-use, resolved to the approver. That difference is the whole
 * of what a person is deciding when they press Approve, so it cannot be left off the row.
 *
 * WRITTEN HERE RATHER THAN IMPORTED, because this file is the record as the BROWSER sees it and the
 * kernel is the record as the record sees it. `device.test.ts` reads the six back out of the
 * migration's own `CHECK (reach IN (…))` and asserts they agree — which it did not do when this
 * paragraph first claimed it did: it asserted the list had six members and no duplicates, which a
 * renamed reach satisfies. There is no exported reach list to import; the list lives as SQL text,
 * and `tools/gates/closed-lists.mjs` says in its own header that the `as const` half of that
 * comparison "is not here yet".
 */
export const REACHES = ['login', 'runner', 'export', 'import', 'pack', 'token'] as const;
export type Reach = (typeof REACHES)[number];

/**
 * `read ⊂ propose ⊂ write`. There is no `admin` and there is deliberately no fourth (ADR-060).
 *
 * Same argument as `REACHES` for why it is spelled here: `device.test.ts` compares it against the
 * kernel's own `SCOPES`.
 */
export const SCOPES = ['read', 'propose', 'write'] as const;
export type Scope = (typeof SCOPES)[number];

export type Device = {
  id: string;
  name: string;
  /** `33 §2`'s six: `web · mcp · cli · email · webhook · alarm`. */
  surface: 'web' | 'mcp' | 'cli' | 'email' | 'webhook' | 'alarm';
  /**
   * ALL SIX THE DDL DEFINES, and the screen could draw four.
   *
   * `30 §1`: `CHECK (status IN ('pending','approved','active','expired','denied','revoked'))`. The
   * two that were missing are not exotic ones — **`approved` is the state a row is in for the seconds
   * between your click and the machine's next poll**, which is to say the screen had no way to show
   * you that approving had worked, and `expired` is what every pending row becomes ten minutes after
   * it was made, which is the single most common end a device grant has.
   *
   * A reader who cannot see `approved` presses the button twice.
   */
  /* `locked` IS NOT `denied`, AND THE DIFFERENCE IS WHOSE DECISION IT WAS. A row that runs out of
     wrong codes is closed by the record, not refused by a person; filing it as `denied` made the
     screen say "you said no" about a request nobody had answered. Four mistyped digits are a typo,
     and the record asserting a decision the reader never made is the worst thing this table can do
     (`12 §6.1`). */
  state: 'pending' | 'approved' | 'active' | 'expired' | 'denied' | 'locked' | 'revoked';
  /**
   * WHAT APPROVING IT WOULD ALLOW — `device_grant.reach`, one of `30 §6`'s six.
   *
   * `49 §5.11` step 3: *"the screen said what it was about to grant before the click"*, and the row
   * said what was ASKING and never what it would be allowed to do. The six are not interchangeable:
   * `login` mints a ninety-day write token, `runner` is the job bearer that executes code, and the
   * other four are one operation each, expiring in ten minutes.
   */
  reach: Reach;
  /**
   * `device_grant.ua` — what the asking device said it was.
   *
   * `30 §1` calls it *"the second free-text column the approver reads"*, and `48 §5.2` notes the CLI
   * sends none, so an absent one is a fact rather than a gap. For the four operation reaches it is
   * the `subject` the command sends: the thing that would be exported, imported or packed.
   */
  ua: string | null;
  /**
   * Wrong guesses spent against this record — `device_grant.tries`, and five is the end of it.
   *
   * IT IS ON THE ROW AND NOT ON THE FORM, because `49 §5.11` step 2.1 spends the try on **every**
   * pending row: *"every pending row pays for a wrong guess"*. That is deliberate — a counter per row
   * would let a guesser buy five more attempts by starting a second enrolment — and it means a
   * mistyped code is a cost to somebody else's pending request, which is why the field below refuses
   * a malformed one rather than sending it.
   */
  tries: number;
  /**
   * A STAND-IN FOR `code_hash`, AND IT PRESERVES ONE PROPERTY RATHER THAN THE TWO IT CLAIMED.
   *
   * The real column is `sha256(id ‖ ':' ‖ user_code)`, with the poll id as its salt and no host
   * secret in the formula. This mock has no crypto — the record makes no outbound calls and imports
   * no `node:` module — and uses the same small hash `list()` uses for its cursors.
   *
   * THIS COMMENT USED TO END *"so a leaked table cannot approve itself"*, and that is false of the
   * stand-in and was the wrong reason even for the real one. djb2 folded to 32 bits over a million
   * six-digit codes is a lookup table, and a review built it in under a second. What makes the real
   * column safe is SHA-256; what the salt buys, here and there, is that two grants showing the same
   * six digits do not collide.
   *
   * The property that IS preserved is the one this product is built on: the record does not hold the
   * code in clear. Nobody reading `data.ts` learns the wrong shape, and no screen can be built that
   * reads a code out of the row it is meant to be checking.
   */
  codeHash: string;
  at: string;
  lastSeen: string | null;
};

/**
 * A token this record has minted, as `12 §3` requires the app to list them.
 *
 * *"Every token records `last_used_at` and the surface it was used from, and the app lists them."*
 * The screen showed the machines that had ASKED and never the tokens that resulted, so there was no
 * surface anywhere in the product answering *what can act as me right now* — which is the question
 * `/settings/agents` exists for.
 *
 * NEVER THE TOKEN. `12 §6` and this product's first promise: the record indexes what a key opens,
 * never the key. A label, a scope, a surface and two dates.
 */
export type Token = {
  id: string;
  label: string;
  /**
   * `read ⊂ propose ⊂ write`, and the list is the kernel's rather than a fourth copy of it.
   *
   * There is no `admin` (ADR-060): the ladder stops below `decide`, so an agent may put a question in
   * front of a person and may not answer its own. A screen that offered a fourth word would be
   * offering something no token can hold.
   */
  scope: Scope;
  /** `last_surface` — where it was last used from, which is half of what makes a stolen one visible. */
  surface: Device['surface'];
  created: string;
  lastUsed: string | null;
  expires: string;
};

export type Job = {
  id: string;
  kind: string;
  status: 'queued' | 'claimed' | 'running' | 'done' | 'failed' | 'stopped';
  model: string;
  started: string;
  /** The agent run doing it, spoken `S1`. A run carries no job field, so the job names its run. */
  run?: string;
  events: readonly { seq: number; tool: string; input: string; out: string; ok: boolean }[];
};

/**
 * One clause of a grid's filter bar: a field, an operator, and the values chosen.
 *
 * IT IS A SHAPE, so it lives with the shapes. It was in `api.ts` — the reader — which meant the
 * fixture could not declare a saved view without importing from the module that imports it.
 */
export type Filter = { field: string; op: string; values: string[] };
