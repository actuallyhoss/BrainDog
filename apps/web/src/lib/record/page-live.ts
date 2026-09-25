/**
 * A declared page on `/p/<slug>`, read from the record, and only from the record.
 *
 * A ROUTE-ONLY MODULE, like `row-live.ts`: the client carries the route table as a value.
 *
 * A REFUSAL IS THE RECORD'S SENTENCE, `UNREACHABLE` AND `UNAUTHORIZED` INCLUDED. Those two drew the
 * in-browser sample's page and kept that for the tab, so a person whose session lapsed read the seeded
 * studio's Desk under their own record's address until they reloaded (DIRECTION 26 removed the sample).
 * Every page now asks, and the next one asks again. A page the record does not have is `missing`, with
 * the addresses of the pages it does have.
 *
 * A LIVE PAGE IS DRAWN FROM THE ANSWER AND NOTHING ELSE. Each block the record sent becomes the shape
 * the page's drawing already reads. A block this build cannot draw from that answer carries one plain
 * sentence instead, and is never filled from anything the record did not send.
 *
 * THE DECLARATIONS ARE THE SEED'S COPY, as they are for the list and the row (`remote.ts` says why):
 * a register's labels, a metric's format and target line.
 */

import { createClient, type ClientOptions } from '@braindog/client';
import { COSTS, isBucket, isStale, type Bars, type FxRead, type MeasureSeries, type Part, type QueueQuestion, type TargetIn } from '@braindog/kernel';
import { MISSING, integer, money, quantity } from 'braindog-render';

import { copy } from '../copy.ts';
import type { ActionRow, Outcome } from './actions.ts';
import {
  agentsTable,
  columnHeading,
  decl as fieldOf,
  feedTable,
  historyTable,
  markColumns,
  toRows,
  walkTable,
  type BlockResult,
  type FeedRow,
  type Metric,
  type Walk,
  type WalkStep,
} from './api.ts';
import { REGISTERS } from './held.ts';
import { linkOf } from './blocks.ts';
import { METRICS } from './declared.ts';
import { readBoot } from './boot-live.ts';
import { format, fxNote, hrefFor, noteOf, partsShown, partsText, targetSaid, walksNote, withParam, type MetricDecl } from './metrics.ts';
import { entryOf, learn, namesOf, refMapOf, targetsOf, type RecordRow, type RefMap } from './remote.ts';
import { REDUCES, SUMS, type PageBlock, type PageDecl } from './schema.ts';
import { compile } from './where.ts';

export type Fetch = NonNullable<ClientOptions['fetch']>;

export const liveWords = {
  cannot: 'This block cannot be drawn from the record yet.',
  changed: 'The page changed while it was being read.',
  /**
   * WHAT A REDUCING FIGURE SAYS WHEN THE FIELD IT ADDS UP IS ONE NOBODY HAS FILLED IN.
   *
   * It is the tile's half of the sentence the bar beside it already draws, *"No project in play says
   * what it earns. Put a year on one and it draws here."* That bar can name the field because a
   * declaration wrote its `empty:` for one block; this line is said under any figure, so it names
   * what happened rather than what to type.
   *
   * IT BELONGS IN `copy.ts` AND IS HERE BECAUSE THAT FILE IS ANOTHER AGENT'S THIS RUN. `liveWords`
   * is already the two sentences this path says for itself, so a third sits beside them rather than
   * being written twice; moving it is a rename and nothing else.
   */
  unsaid: copy.nothingMatched,
} as const;

/** A refusal as the record sends one, and only the keys read here. */
type Said = { code: string; fix: string };

/** A reading as the kernel's `metrics.ts` sends one, and only the keys read here. */
type Reading = {
  value: number | null;
  unit: string | null;
  rows: number;
  /**
   * How many rows the list holds at all, which is not `rows` and is what an empty list means here.
   *
   * OPTIONAL BECAUSE A READING BUILT BY HAND HAS ONLY EVER WRITTEN `rows`, the same reason
   * `news-live.ts` leaves it optional: a required key would have made every such reading in
   * `page-live.test.ts` a compile error rather than a repair. Where it is absent the tile falls back
   * to `rows`, which is the old, ambiguous reading of a zero and withholds the verdict rather than
   * inventing one. The record always sends it.
   */
  held?: number;
  met: boolean | null;
  refusals: Said[];
  /** A grouped figure's parts, and how many past the cap were not drawn. */
  groups?: { key: string; value: number | null; parts?: Part[] }[];
  more?: number;
  /** Money in several currencies not added up, and how a figure across currencies was read. */
  parts?: Part[];
  fx?: FxRead;
  /** A figure converted out of its declared currency: its target, converted at the latest rate. */
  targetIn?: TargetIn;
};

type Row = RecordRow & { updated_at?: string };

/**
 * A block as the record's `page` answers it: the declaration, with what the kernel read on it.
 *
 * WHAT THE RECORD CHECKS AND WHAT IT MERELY CARRIES ARE DIFFERENT THINGS, and this type is where that
 * difference is written down rather than cast away. `declare.ts` checks a block's `kind`, `span`,
 * `limit`, `tone`, `fold`, `icon`, `source`, `cells`, `when`, `columns` and `order` when a declaration
 * is installed, so those arrive at the shapes it admits. It does not look at `heading`, `empty`,
 * `body`, `target` or `authored` AT ALL, and `pages.ts` forwards them because they are keys a block
 * may carry. Each of those is `unknown` here and is narrowed once, by the code that puts it on a
 * block, because the app's own `PageBlock` promises a shape nobody checked.
 *
 * THE SAMPLE CANNOT REACH THIS. Its blocks are typed literals in `data.ts`, written in this repo and
 * checked by the compiler. A live block is JSON from a record, and a pack is a thing a stranger
 * wrote, so this path is the only one where a declaration can be a shape the app did not expect.
 */
type Answered = {
  source?: string;
  span?: number;
  limit?: number;
  tone?: PageBlock['tone'];
  fold?: boolean;
  icon?: string;
  columns?: { field: string; label?: unknown; width?: string; align?: 'start' | 'end'; as?: string; sign?: { field: string; minus: string } }[];
  cells?: { metric: string; label?: unknown; trend?: unknown; note?: unknown }[];
  /* THE KEYS THE RECORD NEVER CHECKED, NAMED RATHER THAN COUNTED. This said THE SIX and listed
     seven, and `label` below makes any count wrong again, so it names them: `kind`, `where`,
     `heading`, `empty`, `body`, `target`, `authored`, and every `label` a column, cell or reading
     carries. `blocks.ts` draws the text ones through `escapeCell`, which is `c.replaceAll(...)`, and
     `authored` through `r.cells.map(escapeCell)`. Anything that is not the shape the app's type
     promises is a TypeError inside the page's own render rather than a block saying it cannot be
     drawn, and a block that throws takes the whole page with it.

     `label` WAS THE ONE LEFT TRUSTED. The kernel now refuses a non-text label at install, so a
     record on this build cannot send one; a record on an older kernel still can, and this is the
     path that reads what a record actually sent rather than what it should have sent. */
  kind?: unknown;
  where?: unknown;
  heading?: unknown;
  empty?: unknown;
  body?: unknown;
  target?: unknown;
  authored?: unknown;
  rows?: Row[];
  matched?: number;
  readings?: { metric: string; label?: unknown; reading: Reading | null; refusal?: Said; trend?: unknown; note?: unknown }[];
  scopes?: (string | null)[];
  rings?: (number | null)[];
  inherited?: number;
  refusals?: Said[];
  drawn?: boolean;
  values?: Record<string, unknown>;
  [key: string]: unknown;
};

/**
 * A PAGE AS THE RECORD ANSWERS ONE, which is not the same object as a page this app declares.
 *
 * `schema.ts`'s `PageDecl` is a DECLARATION: it carries `blocks`, and it marks `requires` required
 * because a page this app writes names the registers it reads (`rows-write.ts`, and `06 §1.1`, where
 * `requires` is what takes a page out of the nav with the pack that owned its rows). An ANSWER is
 * neither of those things. Its blocks come back beside the declaration and are drawn separately, and
 * `requires` is a key the record sends only when the declaration behind it has one.
 *
 * NAMING THAT DIFFERENCE IS THE POINT. This was one `as unknown as PageDecl` with a `requires: []`
 * in front of it: the app declaring, on the record's behalf, that the page reads no register at all.
 * The cast is what let it through, and a cast that bridges two types silences every other difference
 * between them at the same time.
 */
/** `declared_version` is the version the record holds the page at, which arranging it writes against. */
export type LivePageDecl = Omit<PageDecl, 'blocks' | 'requires'> & { requires?: readonly string[]; declared_version?: number };

type AnsweredPage = LivePageDecl & { blocks?: Answered[]; [key: string]: unknown };

/** A block the page draws: the app's `BlockResult`, with what only a live answer carries. */
export type LiveBlock = BlockResult & {
  /** The block's `{{path}}` values as the record answered them. */
  values?: Record<string, unknown>;
  /** An `actions` block's rows, in the shape "Runs on" reads. */
  actions?: ActionRow[];
  /** Set when this build cannot draw the block from a live answer: the one line drawn instead. */
  cannot?: string;
};

export type LivePage = { page: LivePageDecl; blocks: LiveBlock[] };

export type Opened =
  | { from: 'live'; page: LivePage; now: number }
  | { from: 'missing'; held: { address: string; title?: string }[] }
  | { from: 'refused'; fix: string };

/** What a scope cell reads for a row that applies to every project, as the sample says it. */
const EVERYWHERE = 'Everywhere';

/** The register a block's rows belong to, when it has one this build can draw. */
function registerOf(b: Answered): string | null {
  if (b.source === 'sessions.live') return 'session';
  return b.source?.startsWith('register.') ? b.source.slice('register.'.length) : null;
}

/** A string the record did not have to check, or nothing. */
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/**
 * The roles a DECLARATION may give a column, which is the eight `declare.ts` admits.
 *
 * `braindog-render`'s own `CARD_ROLES` has a ninth, `quiet`, and its comment says why it is not one of
 * these: the evaluator writes `quiet` from the record's clock, and a declaration does not name it.
 * `scope` is not a role either. It says what the cell HOLDS, which this file settles from `scopes`
 * before anything is drawn, so it is not carried onto the column.
 *
 * A WORD THAT IS NEITHER IS DROPPED RATHER THAN ASSERTED. The record refuses one at install, so this
 * is the second half of a check rather than the only one, and `as Column[]` was the app promising a
 * closed set about a string it had not looked at.
 */
const ROLES = ['title', 'figure', 'fact', 'trend', 'ring', 'who', 'when', 'mark'] as const;
const roleOf = (v: unknown): (typeof ROLES)[number] | undefined => ROLES.find((r) => r === v);

const columnsOf = (b: Answered) => {
  /* THE REGISTER SAYS WHICH COLUMNS ARE FIGURES, AND UNTIL NOW THIS PATH GUESSED FROM THE NAME.
     It matched `amount` or `cost`, which are the only two money fields any page currently
     declares, so nothing on screen was wrong. It was one pack away from being wrong in both
     directions: `revenue` and `rate` are declared money and were drawn as ordinary text, and a
     text field called `cost_centre` would have been drawn as a figure.

     THE COST IS NOT ONLY AN ELLIPSIS. A truncated figure reads as a smaller number rather than as
     damage (13 §4.2), and `truncate: 'never'` is also how `cardPlan` and `cardRoles` pick which
     column is a card's figure, so a money column this missed was demoted to a fact on every phone.

     The sample path was fixed in `d666678` to ask `decl`. This asks the same function rather than
     a second copy of the same guess, which is how the two halves came to disagree in the first
     place. A block over no register has nothing to ask and truncates as the text it is drawn as. */
  const register = registerOf(b) ?? '';
  return (b.columns ?? []).map((c) => {
    /* A SCOPE COLUMN ON A CARD IS A FACT: the cell says where the row applies, filled from `scopes` below. */
    const as = c.as === 'scope' && b.kind === 'cards' ? 'fact' : roleOf(c.as);
    return {
      field: c.field,
      label: columnHeading(register, { field: c.field, label: str(c.label) }),
      width: c.width ?? 'minmax(12ch,1fr)',
      align: c.align ?? 'start',
      truncate: fieldOf(register, c.field)?.type === 'money' ? ('never' as const) : ('end' as const),
      ...(as === undefined ? {} : { as }),
    };
  });
};

/**
 * One figure of a `stat` block, as a tile.
 *
 * THE VERDICT IS THE RECORD'S (`met`), and a figure over an empty list carries none, because a tick
 * over an empty list is a verdict on nothing. The label, the format and the target line are the
 * declaration's.
 *
 * AN EMPTY LIST IS `held === 0` AND NOT `rows === 0`, and the difference is the whole of it. `rows` is
 * what the predicate matched and `held` is what the list holds at all, so nothing overdue over forty
 * invoices and nothing overdue over a list nobody has written to came through here as the same tile.
 * This is the renderer the live pages use, `/p/<slug>` among them, and it was the one left keying off
 * `rows` after `news-live.ts` was moved: driven in `engines.test.ts` over one kernel reading,
 * `{rows: 0, held: 40}`, Home answered `tone: "good"` with a link and this answered no verdict and no
 * link. One figure, two screens, two answers — and the project page is the screen the kernel's own
 * narrowing of `held` was written for, so it was the screen most likely to be asked.
 *
 * AND THERE IS A THIRD STATE BETWEEN THOSE TWO, which `unsaid` below is: a list that holds rows where
 * not one of them carries the field the figure adds up. Its own paragraph says what that drew.
 */
/** The four aggregations that reduce a FIELD to one number. A count reads rows and is not one of them. */
const REDUCING = ['sum', 'avg', 'min', 'max'] as const;

/** The fields a figure adds up, averages or takes a bound of, both halves of a pair included. */
function reducedFields(value: MetricDecl['value']): string[] {
  const halves: unknown[] = 'diff' in value ? [value.diff.of, value.diff.per] : 'ratio' in value ? [value.ratio.of, value.ratio.per] : [value];
  return halves.flatMap((half) => {
    const said = isObject(half) ? half : {};
    return REDUCING.flatMap((word) => {
      const operand = said[word];
      if (typeof operand === 'string') return [operand];
      /* A ROW-LEVEL PRODUCT reduces over the field it multiplies, which is the first half of `product`. */
      const product = isObject(operand) && Array.isArray(operand.product) ? operand.product[0] : null;
      return typeof product === 'string' ? [product] : [];
    });
  });
}

/**
 * WHETHER A FIGURE'S OWN PREDICATE REQUIRES THE FIELD IT REDUCES OVER TO BE FILLED IN.
 *
 * THIS IS THE LINE BETWEEN THE TWO ZEROES, and it is narrow on purpose. `out-30d` sums `amount`
 * where the obligation is open and due inside a month: nothing matched over forty obligations is
 * GBP 0.00 owed, which is the answer that figure exists to give, and it keeps its verdict and its
 * door. `projects-earning` sums `revenue` where `revenue is set`: nothing matched means no row
 * carries the number being added up, so its zero is the absence of an answer rather than one.
 *
 * `compile` IS ASKED RATHER THAN THE SENTENCE BEING READ A SECOND TIME. The same rule written twice
 * is what `metrics.ts` and the kernel's `scopeOf` are still paying for (`50 §1`), and the grammar
 * spells this clause three ways, `is set`, `is present` and `is not empty`, all of which compile to
 * one `present` clause. A register the app has no declaration for compiles to no clauses, so the
 * tile answers as it did before rather than guessing.
 */
function overUnsaidField(decl: MetricDecl): boolean {
  const register = decl.source.startsWith('register.') ? decl.source.slice('register.'.length) : null;
  if (register === null) return false;
  const reduced = reducedFields(decl.value);
  if (reduced.length === 0) return false;
  return compile(register, decl.where).clauses.some((c) => c.op === 'present' && reduced.includes(c.field));
}

const isTarget = (v: unknown): v is { lte: number } | { gte: number } =>
  typeof v === 'object' && v !== null && (typeof (v as { lte?: unknown }).lte === 'number' || typeof (v as { gte?: unknown }).gte === 'number');

export function tileOf(cell: NonNullable<Answered['readings']>[number], values?: Record<string, unknown>): Metric {
  const at = cell.metric.indexOf(':');
  const template = METRICS[at < 0 ? cell.metric : cell.metric.slice(0, at)];
  const built = template && at >= 0 ? withParam(template, cell.metric.slice(at + 1)) : template;
  /* THE TARGET IS THE RECORD'S, which a use case may have set for a person (`install.ts` `MODULE_TARGETS`); the build's
     declaration only says it when the record did not. */
  const held = (cell as { target?: unknown }).target;
  const decl = built && isTarget(held) ? { ...built, target: held } : built;
  const label = str(cell.label) ?? decl?.name ?? cell.metric;
  const r = cell.reading;
  /* A FIGURE IN SEVERAL CURRENCIES IS EACH AMOUNT IN ITS OWN, never a blank, and says why it is not one number. */
  const across = r ? fxNote(r) : null;
  const said = (fallback: string) =>
    typeof cell.note === 'string'
      ? noteOf(cell.note, (id) => {
          const v = values?.[id];
          if (typeof v === 'number') return format(METRICS[id]?.format, v);
          return resolverOf(values)(id);
        })
      : fallback;
  if (r && r.parts && !cell.refusal && r.refusals.length === 0)
    return { id: cell.metric, label, value: partsShown(decl?.format, r.parts), note: [said(''), across].filter(Boolean).join(' · ') };
  if (!r || r.value === null || cell.refusal || r.refusals.length)
    return { id: cell.metric, label, value: MISSING, note: copy.figureUnavailable, tone: 'warn' };
  const empty = (r.held ?? r.rows) === 0;
  /**
   * AND THE STATE BETWEEN THE TWO: THE LIST HOLDS ROWS, AND NOT ONE OF THEM HAS SAID.
   *
   * The rule above is the kernel's, written for a COUNT, and its own words are that zero matched
   * over rows that exist is good news (`packages/kernel/src/metrics.ts`). A REDUCING figure turns
   * that sentence over. A sum of no values is zero and the kernel means it to be, so `GBP 0.00` is
   * the same number whether a portfolio earned nothing or nobody has written down what it earns,
   * and `target: { gte: 0 }` on a money sum is met by every value such a sum can take, which is the
   * decoration a target is refused at install for being. So `met: true` carried no measurement and
   * the tile drew a tick anyway.
   *
   * MEASURED AT HIS SIZE, on the record `loop/research-at-scale.md` §1 built: 27 projects, 14 in
   * play, a monthly figure held for three of them and `revenue` unset on every row, because the
   * importer files a monthly figure as a reading and has no year to write. After `a89bc072` put
   * `revenue is set` on the Earning figures the reading is `rows: 0, held: 27`, and this renderer
   * answered `tone: "good"` with `href: /r/things?f=lane:in:building,earning&f=revenue:is:set` —
   * a green GBP 0.00 with a door into a list of no rows, on the first screen he opens about his
   * portfolio, in the same block row as a bar correctly drawing "No project in play says what it
   * earns." One page, two blocks, two answers.
   *
   * THE TONE AND THE DOOR GO AND THE SENTENCE ARRIVES, which is what `api.ts` already does for the
   * empty register a few lines from its own `held === 0`. The figure itself stays: a total of
   * nothing is zero, and it is the verdict on it that was invented.
   */
  const unsaid = !empty && r.rows === 0 && decl !== undefined && overUnsaidField(decl);
  const met = empty || unsaid ? null : r.met;
  /* NO DOOR OVER NO ROWS, AND NONE FOR A FIGURE THAT READS NO LIST: `hrefFor` answers `null` there, where it used to
     answer Money's page on every record. */
  const door = decl && !empty && !unsaid ? hrefFor(decl) : null;
  /* THE LINE IS THE RECORD'S SERIES, and only numbers and gaps are drawn: anything else is not a day. */
  const trend = Array.isArray(cell.trend) && cell.trend.every((v) => v === null || (typeof v === 'number' && Number.isFinite(v))) ? (cell.trend as (number | null)[]) : undefined;
  return {
    id: cell.metric,
    label,
    ...(trend ? { trend } : {}),
    /* A CURRENCY CODE IS MONEY AND ANY OTHER UNIT IS A QUANTITY. Every unit went to `money`, so a
       sum of 150 kg drew `KG 1.50` and 12.5 hours drew `H 0.13`. */
    value: !r.unit
      ? format(decl?.format, r.value)
      : /^[A-Z]{3}$/u.test(r.unit)
        ? money(Math.round(r.value), r.unit)
        : quantity(r.value, r.unit),
    /* A NOTE THE CELL DECLARES is said instead of the target, each figure it names formatted as declared, and a converted
       figure says as of which day's rates. */
    note: [said(unsaid ? liveWords.unsaid : decl ? targetSaid(decl, r) : ''), across].filter(Boolean).join(' · '),
    tone: met === null ? undefined : met ? 'good' : 'warn',
    ...(door ? { href: door } : {}),
  };
}

const text = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const count = (v: unknown): number => (typeof v === 'number' ? v : 0);
const STATES: readonly ActionRow['state'][] = ['pending', 'firing', 'paused', 'done'];

/** One row of an `actions` block, back in the shape the actions read gives "Runs on". */
export function actionOf(fields: Record<string, unknown>): ActionRow {
  const at = text(fields.last_at);
  const state = STATES.find((s) => s === fields.state) ?? 'pending';
  return {
    ingest: String(fields.ingest ?? ''),
    channel: fields.channel === 'pull' || fields.channel === 'call' ? fields.channel : 'poll',
    project: text(fields.project),
    host: text(fields.host),
    every: String(fields.every ?? ''),
    key: text(fields.key),
    state,
    next: text(fields.next),
    last: at
      ? { at, outcome: (text(fields.last_outcome) ?? 'ok') as Outcome, status: typeof fields.last_status === 'number' ? fields.last_status : null, note: text(fields.last_note) ?? '' }
      : null,
    month: { runs: count(fields.runs), requests: 0, bytes: 0, failures: count(fields.failures), held: 0 },
    days: [],
  };
}

/** The four intents a row may carry, as `schema.ts` spells them and `05 §7.4` publishes them. */
const TONE_WORDS = ['good', 'warn', 'bad', 'info'] as const;

/**
 * The rows somebody WROTE on a block, when they are rows a renderer can draw.
 *
 * `05 §2` makes authored rows the norm in the dialect, and `declare.ts` does not check them: a pack
 * declaring `authored: "two"`, or one row of it without a `cells` list, installs cleanly and reaches
 * `r.cells.map(escapeCell)`. A row that is not the shape the app's type promises is left out, so the
 * block draws the rows that ARE rows instead of the page failing on the one that is not.
 */
function authoredOf(v: unknown): PageBlock['authored'] {
  if (!Array.isArray(v)) return undefined;
  const rows = v.flatMap((r) => {
    const said = r !== null && typeof r === 'object' ? (r as { cells?: unknown; tone?: unknown }) : null;
    if (!Array.isArray(said?.cells)) return [];
    const cells = said.cells.filter((c): c is string => typeof c === 'string');
    if (cells.length !== said.cells.length) return [];
    const tone = TONE_WORDS.find((t) => t === said.tone);
    return [{ cells, ...(tone === undefined ? {} : { tone }) }];
  });
  return rows.length ? rows : undefined;
}

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStep = (v: unknown): v is WalkStep =>
  isObject(v) && typeof v.day === 'string' && typeof v.label === 'string' && Number.isFinite(v.delta) && Number.isFinite(v.balance) && typeof v.source === 'string';

/** A `series` block's `bars`, when they are what the record's `barsOf` sends: every line as long as the keys. */
function barsOf(v: unknown): Bars | null {
  if (!isObject(v) || !Array.isArray(v.keys) || !v.keys.every((k) => typeof k === 'string')) return null;
  const n = v.keys.length;
  const cell = (x: unknown) => x === null || (typeof x === 'number' && Number.isFinite(x));
  if (!Array.isArray(v.values) || !v.values.every((line) => Array.isArray(line) && line.length === n && line.every(cell))) return null;
  if (!Array.isArray(v.states) || v.states.length !== n || !v.states.every((s) => s === '' || s === 'partial' || s === 'due' || s === 'ahead')) return null;
  if (!isBucket(v.bucket) || typeof v.current !== 'string') return null;
  /* ONE CHART A CURRENCY, when the record lined the lines up once per currency: each as long as the keys, or none. */
  const split = Array.isArray(v.split)
    ? v.split.filter((t): t is { unit: string; values: (number | null)[][] } =>
        isObject(t) && typeof t.unit === 'string' && Array.isArray(t.values) && t.values.every((line) => Array.isArray(line) && line.length === n && line.every(cell)),
      )
    : [];
  return {
    bucket: v.bucket,
    current: v.current,
    keys: v.keys,
    states: v.states,
    values: v.values,
    unit: typeof v.unit === 'string' ? v.unit : null,
    ...(split.length > 0 ? { split } : {}),
  };
}

/** A forecast's remembered points, when they are points: a day and a number each. Anything else is none. */
function pastOf(v: unknown): { at: string; value: number }[] | null {
  if (!Array.isArray(v)) return null;
  return v.filter((p): p is { at: string; value: number } => isObject(p) && typeof p.at === 'string' && typeof p.value === 'number' && Number.isFinite(p.value));
}

/** A `forecast.runway` block's `walk`, when it is one. The record builds it; a record on another build may not have. */
function walkOf(v: unknown): Walk | null {
  if (!isObject(v) || !Array.isArray(v.steps) || !v.steps.every(isStep) || !Number.isFinite(v.from)) return null;
  return {
    from: v.from as number,
    currency: typeof v.currency === 'string' ? v.currency : null,
    steps: v.steps,
    crossed: isStep(v.crossed) ? v.crossed : null,
    /* A WALK OF SEVERAL, one a currency, carries its own remembered cash. */
    ...(pastOf(v.past) ? { past: pastOf(v.past)! } : {}),
  };
}

const FEED_BY: readonly FeedRow['by'][] = ['agent', 'rule', 'you'];
const textOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string';

/** An `activity` block's `feed`, when every row is one the renderer can file under a group. */
function feedOf(v: unknown): FeedRow[] | null {
  if (!Array.isArray(v)) return null;
  const ok = v.every(
    (r) =>
      isObject(r) && FEED_BY.includes(r.by as FeedRow['by']) && Number.isFinite(r.count) && typeof r.at === 'string' &&
      textOrNull(r.who) && textOrNull(r.kind) && textOrNull(r.target) && textOrNull(r.note) && (r.thing === undefined || textOrNull(r.thing)),
  );
  return ok ? (v as FeedRow[]) : null;
}

/**
 * A `queue` block's questions, when every one of them is a question a person can be shown.
 *
 * Checked field by field for the reason `feedOf` is: what arrives here is whatever a record sent, and
 * a question drawn with `undefined` where its options should be is worse than a block that says it
 * cannot be drawn. An option missing any of its four parts drops the whole question rather than the
 * option, because a choice that quietly lost one of its ways to answer is a different choice.
 */
function queueOf(v: unknown): QueueQuestion[] | null {
  if (!Array.isArray(v)) return null;
  const ok = v.every(
    (q) =>
      isObject(q) &&
      typeof q.id === 'string' &&
      typeof q.who === 'string' &&
      typeof q.at === 'string' &&
      typeof q.kind === 'string' &&
      typeof q.question === 'string' &&
      typeof q.why === 'string' &&
      /* THE BAND IS CHECKED AGAINST THE FOUR, not merely for being a string. It is the ranking, and a
         record a version ahead that sent a fifth band would otherwise have its whole queue drawn in an
         order this build could not explain. A record a version BEHIND sends no band at all, which is
         why absent is allowed and a wrong one is not. */
      (q.cost === undefined || (typeof q.cost === 'string' && (COSTS as readonly string[]).includes(q.cost))) &&
      Array.isArray(q.options) &&
      q.options.every((o) => isObject(o) && typeof o.key === 'string' && typeof o.label === 'string' && typeof o.because === 'string' && typeof o.recommended === 'boolean'),
  );
  return ok ? (v as QueueQuestion[]) : null;
}

/** A `diff` block's `history`, newest first, when every version is text. */
function historyOf(v: unknown): { at: string; by: string; text: string }[] | null {
  if (!Array.isArray(v)) return null;
  return v.every((h) => isObject(h) && typeof h.at === 'string' && typeof h.by === 'string' && typeof h.text === 'string')
    ? (v as { at: string; by: string; text: string }[])
    : null;
}

/**
 * Who changed row `n` last, as the kernel sent it, in the words the sample's column uses: a person is you, a rule is
 * named as a rule, and an agent by its name.
 */
function changeOf(changes: unknown, n: number): { by: string; at: string } | null {
  const c = Array.isArray(changes) ? (changes[n] as unknown) : null;
  if (!isObject(c) || typeof c.who !== 'string' || typeof c.at !== 'string') return null;
  const by = c.by === 'you' ? 'you' : c.who.replace(/^rule:/u, 'rule.').replace(/^agent:/u, '');
  return { by, at: c.at };
}

/** A series the record sent, when it is one: a name, a unit, aligned buckets, and numbers or gaps. */
function isSeries(v: unknown): v is MeasureSeries {
  if (v === null || typeof v !== 'object') return false;
  const m = v as Partial<MeasureSeries>;
  const numbers = (a: unknown) => Array.isArray(a) && a.every((x) => x === null || (typeof x === 'number' && Number.isFinite(x)));
  return (
    typeof m.name === 'string' &&
    typeof m.unit === 'string' &&
    (m.bucket === 'day' || m.bucket === 'week') &&
    Array.isArray(m.keys) &&
    m.keys.every((k) => typeof k === 'string') &&
    numbers(m.now) &&
    numbers(m.was) &&
    m.now!.length === m.keys.length &&
    m.was!.length === m.keys.length &&
    (m.latest === null || (typeof m.latest === 'object' && typeof m.latest?.value === 'number' && typeof m.latest.day === 'string' && typeof m.latest.at === 'string'))
  );
}

/** One answered block as the page draws it. */
export function blockOf(b: Answered, refs: ReadonlyMap<string, RefMap>, now: number, me: string | null = null, names: ReadonlyMap<string, string> = new Map()): LiveBlock {
  const {
    kind: _kind,
    where: _where,
    heading: _heading,
    empty: _empty,
    body: _body,
    target: _target,
    authored: _authored,
    cells: _cells,
    columns: _columns,
    /* THE KEYS THE RECORD DOES CHECK, taken by name so each is present only when it has a value.
       `exactOptionalPropertyTypes` draws the distinction the spread of an optional key erases: a
       `tone` that is absent and a `tone` that is explicitly `undefined` are different objects, and
       only the first is what `heading?: string` means. */
    source,
    span,
    limit,
    tone,
    fold,
    icon,
    rows: got = [],
    matched = 0,
    readings,
    scopes,
    rings,
    inherited,
    refusals = [],
    values,
    drawn,
    walk: walked,
    walks: walkedApart,
    walkFx,
    feed: fed,
    queue: waiting,
    seen: mark,
    history: versions,
    bars: barred,
    changes: changed,
    working: onIt,
    working_now: atWork,
    past: remembered,
    measures: measured,
    /* A CAPTURE'S LIST AND WHAT A NEW ROW IN IT IS FILLED WITH, taken by name so neither rides through `rest`
       unchecked: `fills` is what a press writes, so a value in it the app did not look at is a value it would store. */
    register: into,
    fills: filled,
    ...rest
  } = b;

  /* NARROWED ONCE, HERE, because the record does not check any of these and the app's type says it
     does. A key that is not what it claims to be is left off the block rather than put on it: the
     page then draws a block that is missing a heading, which is visible, instead of throwing inside
     the renderer, which takes every other block on the page with it. */
  const kind = str(b.kind) ?? '';
  const heading = str(b.heading);
  const where = str(b.where);
  const empty = str(b.empty);
  const body = str(b.body);
  const target = typeof b.target === 'number' && Number.isFinite(b.target) ? b.target : undefined;
  const authored = authoredOf(b.authored);
  /* A FIGURE'S LABEL IS THE RECORD'S OR ITS OWN NAME. The record checks that a cell names a metric
     and does not check that it carries a label, and the app's type says every cell has one. */
  const cells = b.cells?.map((c) => ({
    metric: c.metric,
    label: str(c.label) ?? c.metric,
    ...(typeof c.trend === 'string' ? { trend: c.trend } : {}),
    ...(typeof c.note === 'string' ? { note: c.note } : {}),
  }));

  /* THE DECLARATION'S COLUMNS ARE REPLACED BY DRAWN ONES, and everything the record sent that this
     file does not name rides through untouched, so a key a later kernel adds is carried rather than
     dropped. */
  const shell: LiveBlock = {
    ...rest,
    kind,
    ...(source === undefined ? {} : { source }),
    ...(span === undefined ? {} : { span }),
    ...(limit === undefined ? {} : { limit }),
    ...(tone === undefined ? {} : { tone }),
    ...(fold === undefined ? {} : { fold }),
    ...(icon === undefined ? {} : { icon }),
    ...(heading === undefined ? {} : { heading }),
    ...(where === undefined ? {} : { where }),
    ...(empty === undefined ? {} : { empty }),
    ...(body === undefined ? {} : { body }),
    ...(target === undefined ? {} : { target }),
    ...(authored === undefined ? {} : { authored }),
    ...(cells === undefined ? {} : { cells }),
    register: undefined,
    columns: columnsOf(b),
    entries: [],
    matched: [],
    refusals: refusals.map((r) => r.fix),
    rows: [],
    shown: 0,
    total: 0,
    drawn: drawn !== false,
    stale_at: new Date(now).toISOString(),
    metrics: undefined,
    ...(values ? { values } : {}),
  };
  const cannot: LiveBlock = { ...shell, cannot: liveWords.cannot };

  if (refusals.length || drawn === false) return shell;
  /* A CAPTURE READS NO ROWS, and it has no `source:` either, so it is answered before the check that sends a block
     with none back as written text. Its list is kept on `register`, which every other block here takes from its
     source, because `draw()` names the list from it and the page decides from it whether a line can be written.

     FILLS THAT ARE NOT ALL TEXT ARE A BLOCK THIS BUILD CANNOT DRAW, and not a capture that fills less: dropping the
     one value it could not read turns a line typed under "Later" into an open task, which is a write nobody made. */
  if (kind === 'capture') {
    const text = isObject(filled) && Object.values(filled).every((v) => typeof v === 'string');
    if (typeof into !== 'string' || into === '' || !text) return cannot;
    return { ...shell, register: into, fills: { ...(filled as Record<string, string>) } };
  }
  /* A STAT OVER A REGISTER AND NO FIGURES draws a tile a measure from the rows (`measures.ts`), as the kernel answers it. */
  if (b.cells || (kind === 'stat' && !registerOf(b))) return { ...shell, metrics: (readings ?? []).map((cell) => tileOf(cell, values)) };
  /* A BAR OR A SPLIT OVER A FIGURE draws the parts the record read. */
  if (typeof source === 'string' && source.startsWith('metric.')) {
    const reading = readings?.[0]?.reading;
    if (!reading) return cannot;
    const groups = (reading.groups ?? []).map((g) => ({ key: String(g.key), value: typeof g.value === 'number' ? g.value : null, ...(Array.isArray(g.parts) ? { parts: g.parts } : {}) }));
    const parts = { metric: source.slice('metric.'.length), value: reading.value, groups, more: typeof reading.more === 'number' ? reading.more : 0, unit: reading.unit };
    return { ...shell, parts, shown: groups.length, total: groups.length };
  }
  if (kind === 'series') {
    const bars = barsOf(barred);
    return bars ? { ...shell, bars, shown: bars.keys.length, total: bars.keys.length } : cannot;
  }
  if (!b.source) return shell;
  if (b.source === 'actions') {
    const actions = got.map((r) => actionOf(r.fields));
    return { ...shell, actions, shown: actions.length, total: matched };
  }
  /* WHAT IS WAITING ON A PERSON. `total` is how many are open and `shown` how many came back, so the
     block can say what it left out rather than drawing three of nine as though that were all of it. */
  if (b.source === 'governance.open') {
    const queue = queueOf(waiting);
    return queue ? { ...shell, queue, shown: queue.length, total: matched } : cannot;
  }

  /* A WALK, A FEED AND A DIFF ARE NOT ROWS OF A REGISTER. The kernel answers each as its own key, and each
     is shaped by the function that shapes the sample's, so the same renderer draws both. One the record
     did not send, or sent in a shape this cannot read, says it cannot be drawn rather than drawing empty. */
  if (b.source === 'forecast.runway') {
    /* ONE WALK A CURRENCY, when the record could not add them up, each drawn under its code and the reason said once. */
    const apart = Array.isArray(walkedApart) ? walkedApart.map(walkOf) : [];
    if (apart.length > 0 && apart.every((w): w is Walk => w !== null)) {
      const fx = isObject(walkFx) ? walkFx : {};
      const missing = Array.isArray(fx.missing) ? fx.missing.filter((m): m is string => typeof m === 'string') : [];
      return {
        ...shell,
        walks: apart,
        walkNote: walksNote(typeof fx.home === 'string' ? fx.home : null, missing, apart.length),
        ...walkTable(apart[0]!, kind === 'bridge' || kind === 'forecast' ? apart[0]!.steps.length : limit, new Date(now).toISOString().slice(0, 10), false),
      };
    }
    const walk = walkOf(walked);
    const past = pastOf(remembered);
    return walk
      ? {
          ...shell,
          walk,
          ...(past ? { past } : {}),
          ...walkTable(walk, kind === 'bridge' || kind === 'forecast' ? walk.steps.length : limit, new Date(now).toISOString().slice(0, 10), false),
        }
      : cannot;
  }
  if (b.source === 'activity') {
    const feed = feedOf(fed);
    if (!feed) return cannot;
    /* WHAT EACH AGENT DID: the record grouped its rows by who, and the renderer draws one head per agent. */
    /* EVERY EVENT IS ON A ROW, a burst counted on its own and the rest past `first:` folded into one, so nothing is left out to say. */
    if (kind === 'agents') return { ...shell, feed, ...agentsTable(feed, now), total: feed.length };
    const seen = typeof mark === 'string' ? mark : null;
    const marks = b.since === 'seen' || mark !== undefined;
    return { ...shell, feed, ...(marks ? { seen } : {}), ...feedTable(feed, marks, seen, now, me, names), total: matched };
  }
  if (kind === 'diff') {
    const history = historyOf(versions);
    return history ? { ...shell, history, ...historyTable(history, Math.max(matched, history.length)) } : cannot;
  }

  const register = registerOf(b);
  /* A register the seed does not declare has no labels to draw with, and says so rather than drawing half an answer. */
  if (!register || !REGISTERS[register]) return cannot;
  /* THE NUMBERS A PROJECT REPORTED, worked out by the record: one series a measure, drawn as tiles or charts. */
  if (kind === 'stat' || kind === 'lines') {
    if (Array.isArray(measured)) {
      const measures = measured.filter(isSeries);
      /* EVERY MEASURE IS DRAWN, so nothing is cut: `matched` counts readings, which no tile or chart is one of. */
      return { ...shell, register, measures, shown: measures.length, total: measures.length };
    }
  }
  /* A SUM OVER THE FIRST PAGE IS A WRONG NUMBER, so a kind that adds up draws only the whole answer.
     THE KERNEL REFUSES THIS NOW, at `packages/kernel/src/pages.ts`, and a refused block returned
     above with the record's own sentence rather than this line, so on a current record the guard
     below will not fire. It is kept because the record is a different deployment from this app: a
     record on an older kernel still answers 200 rows of 301 with an empty `refusals`, which is the
     case this guard was written for and the one it is still the only protection against. */
  if (SUMS.has(kind) && got.length < matched) return cannot;
  /* AND WHETHER THE BLOCK IS DRAWING A SLICE IS THE OTHER QUESTION, which is `REDUCES` and not
     `SUMS`: a section adds nothing up and is still never showing a page of its answer, because the
     count it draws is `total`. One variable answered both here and the section half was wrong.
     Measured through `blockOf` on a section with 2 rows and `matched: 301`: `shown 2, total 301`,
     which is the condition `/p/[slug]` prints "Showing 2 of 301" on, under a heading that draws no
     row of its own and whose own count said 301. `api.ts` reads `REDUCES` for the same `shown` on
     the sample and printed nothing, so one declaration drew two different pages. */
  const reduces = REDUCES.has(kind);

  /* A BUDGET IS DRAWN AGAINST WHAT ITS FIGURE SPENT, which the record read beside the rows; without it there is no budget to draw. */
  const { spent, toward } = rest as { spent?: unknown; toward?: unknown };
  const figure = spent ?? toward;
  let spentBy: LiveBlock['spentBy'];
  if (kind === 'progress' && figure !== undefined) {
    const reading = readings?.[0]?.reading;
    if (typeof figure !== 'string' || !reading) return cannot;
    /* A GOAL'S PARTS ARE KEYED BY THE ROW THEY WERE LOGGED AGAINST, which the record groups by its id; the rows here are
       drawn by number, so each key is said as that row's number. */
    const seqOf = new Map(got.map((r) => [String(r.id), String(r.seq)]));
    const groups = (reading.groups ?? []).map((g) => ({ key: spent === undefined ? (seqOf.get(String(g.key)) ?? String(g.key)) : String(g.key), value: typeof g.value === 'number' ? g.value : null }));
    spentBy = { metric: figure, unit: typeof reading.unit === 'string' ? reading.unit : null, groups, ...(spent === undefined ? { toward: true } : {}) };
  }

  const live = b.source === 'sessions.live';
  const entries = got.map((r) => entryOf(register, r, refs));
  /* HOW FAR ALONG A CARD IS FROM ITS STEPS, worked out by the record where the ring's own field is empty. Drawn through the
     field, so the ring reads as a typed one does; the row itself is not changed. */
  const ring = kind === 'cards' ? b.columns?.find((c) => c.as === 'ring')?.field : undefined;
  const drawnEntries = ring && Array.isArray(rings) ? entries.map((e, n) => (typeof rings[n] === 'number' ? { ...e, fields: { ...e.fields, [ring]: rings[n] } } : e)) : entries;
  const rows = toRows(register, drawnEntries, shell.columns, now, namesOf(refs));
  /* WHO CHANGED EACH ROW LAST, named by the kernel on `changes`, and each money column's sign. */
  markColumns(register, b.columns, entries, rows, (_e, n) => changeOf(changed, n));
  /* WHETHER AN AGENT IS ON EACH ROW, which the record works out from the row's history and its live
     runs. Narrowed here like everything else the record sends: a `working_now` that is not an array
     of booleans is left off, and the block draws no dots rather than drawing one for `"yes"`. */
  const working = onIt === true;
  const workingNow = working && Array.isArray(atWork) ? atWork.map((v) => v === true) : undefined;
  /* WHERE A ROW APPLIES, and which project a run is in, are named by the kernel on `scopes`. */
  (b.columns ?? []).forEach((c, i) => {
    if (c.as !== 'scope' && !(live && c.field === 'project')) return;
    rows.forEach((row, n) => {
      row.cells[i] = scopes?.[n] ?? (live ? (row.cells[i] ?? null) : EVERYWHERE);
    });
  });
  return {
    ...shell,
    register,
    entries,
    matched: entries,
    rows,
    shown: reduces ? matched : entries.length,
    total: matched,
    ...(spentBy === undefined ? {} : { spentBy }),
    names: namesOf(refs),
    ...(inherited === undefined ? {} : { inherited }),
    ...(live ? { quiet: got.map((r) => isStale({ fields: r.fields as never, updated_at: r.updated_at ?? r.created_at }, now)) } : {}),
    ...(working ? { working } : {}),
    ...(workingNow ? { working_now: workingNow } : {}),
  };
}

/**
 * A block's `{{path}}` resolver, over the values the record answered.
 *
 * Formatting is the reader's, as `05 §7.1` rule 3 says: money as money, a count as a count. A value
 * the record did not send is `null`, which the renderer draws as `—`.
 */
export function resolverOf(values: Record<string, unknown> | undefined): (path: string) => string | null {
  return (path) => {
    if (!values || !Object.hasOwn(values, path)) return null;
    const v = values[path];
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return Number.isInteger(v) ? integer(v) : String(v);
    if (typeof v === 'boolean') return v ? 'yes' : 'no';
    /* A FIGURE IN SEVERAL CURRENCIES, one amount a currency, written as a tile writes its parts. */
    if (Array.isArray(v)) {
      const parts = v.filter((p): p is { amount: number; currency: string } => isObject(p) && typeof p.amount === 'number' && typeof p.currency === 'string');
      return parts.length && parts.length === v.length ? partsText(parts) : null;
    }
    if (v !== null && typeof v === 'object') {
      const { amount, currency } = v as { amount?: unknown; currency?: unknown };
      if (typeof amount === 'number' && typeof currency === 'string') return money(amount, currency);
    }
    return null;
  };
}

/**
 * THE PAGES A RECORD HOLDS, AS ADDRESSES WITH THEIR TITLES, because the reader is standing at an
 * address that did not work. This answered titles alone, so `/p/say-what-it-is-and-who-it-is-for`
 * offered "Your project" to somebody who had just typed a slug, and the page titled Your project
 * answers at `/p/home-guide`: both words on offer refuse again when typed.
 */
const heldOf = (listed: unknown): { address: string; title?: string }[] =>
  Array.isArray(listed)
    ? listed.flatMap((p) => {
        const said = p !== null && typeof p === 'object' ? (p as { page?: unknown; slug?: unknown; title?: unknown }) : {};
        const address = typeof said.slug === 'string' ? said.slug : typeof said.page === 'string' ? said.page : null;
        if (address === null) return [];
        return [typeof said.title === 'string' ? { address, title: said.title } : { address }];
      })
    : [];

export type PageReader = { read(slug: string): Promise<Opened> };

/** A page reader for one tab. `base` is the page's own origin; the app never holds a token. */
export function pageReader(base: string, io?: Fetch, clock: () => number = () => Date.now()): PageReader {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const maps = new Map<string, RefMap>();

  /* A REF ARRIVES AS THE TARGET ROW'S ULID, so each register a ref points at is walked once and kept,
     as the row reader does. A register this reader may not list is left out, and its refs draw as ids. */
  const walked = new Map<string, RecordRow[]>();
  async function rowsOf(register: string): Promise<RecordRow[] | null> {
    const kept = walked.get(register);
    if (kept) return kept;
    const rows: RecordRow[] = [];
    let cursor: string | null = null;
    do {
      const out = await client.list({ register, limit: 500, ...(cursor === null ? {} : { cursor }) });
      if (!out.ok) return null;
      rows.push(...(out.value.rows as RecordRow[]));
      cursor = out.value.cursor;
    } while (cursor !== null);
    walked.set(register, rows);
    return rows;
  }
  const asked = new Map<string, Promise<void>>();
  async function mapOf(register: string): Promise<RefMap | null> {
    const kept = maps.get(register);
    if (kept) return kept;
    /* A use case's own list is declared before it is walked, or its rows have no title to be named by. */
    await learn(client.schema, register, asked);
    const rows = await rowsOf(register);
    if (!rows) return null;
    const map = refMapOf(register, rows);
    maps.set(register, map);
    return map;
  }

  return {
    async read(slug) {
      const out = await client.page(slug);
      if (!out.ok) {
        if (!('refusal' in out)) return { from: 'refused', fix: liveWords.changed };
        if (out.refusal.code === 'PAGE_UNKNOWN') {
          const listed = await client.pages();
          return { from: 'missing', held: listed.ok ? heldOf(listed.value) : [] };
        }
        return { from: 'refused', fix: out.refusal.fix };
      }

      const { blocks = [], read_at, ...page } = out.value as AnsweredPage;
      /* TODAY IS THE RECORD'S, where it says what its clock read, so a record pinned to a day draws its own late rows,
         out-of-date balances and forecast from that day. A record that does not say is read against this clock. */
      const said = typeof read_at === 'string' ? Date.parse(read_at) : Number.NaN;
      const now = Number.isFinite(said) ? said : clock();
      /* EVERY LIST A BLOCK DRAWS IS ASKED FOR, through `learn`, whether or not this build ships it. A use case's own
         lists (`loop/research-spark.md` §2.1) are declared by the record and by no file here, and a page over them drew
         "cannot be drawn" on every block. This then skipped any list the bundle holds, so a field added to Projects at
         run time was on the record and in no block over Projects: measured in `field-write.test.ts`, where the page
         asked for `page` and nothing else. `learn` keeps what it asked per reader, so a list two blocks draw is asked once. */
      for (const b of blocks) {
        const register = b.refusals?.length ? null : registerOf(b);
        if (register) await learn(client.schema, register, asked);
      }
      const wanted = new Set<string>();
      for (const b of blocks) {
        const register = b.refusals?.length ? null : registerOf(b);
        if (register) for (const target of targetsOf(register)) wanted.add(target);
      }
      /* WHO IS READING, for a feed that names the reader as You: the shell's own `boot`, kept, so it costs no call. */
      const booted = blocks.some((b) => b.source === 'activity') ? await readBoot(base, io) : null;
      const me = booted?.from === 'live' ? (booted.boot.me?.person ?? null) : null;
      const names = new Map(Object.entries(booted?.from === 'live' ? (booted.boot.names ?? {}) : {}));
      const refs = new Map<string, RefMap>();
      for (const target of wanted) {
        const map = await mapOf(target);
        if (map) refs.set(target, map);
      }
      /* THE PAGE IS THE ANSWER, AND THE ONE DERIVED KEY IS DERIVED FROM THE ANSWER. `identity` names
         the row a page is ABOUT, and it is what the page and its rail row wear a project's colour
         from; the record does not send it, but an expanded page sends `param`: the register, the
         number and the title of the row it was expanded from, which is the same row. So a live
         project page carries its own hue for the reason the sample's does (`pages.ts` sets both from
         one pair), rather than losing it to a key nobody carried across. What the record sent wins. */
      const identity = page.identity ?? (page.param ? { register: page.param.register, seq: page.param.seq } : undefined);
      /* A BAR OVER A LIST OF LINKS adds up what the linked rows hold: an organisation's balance is the money in the
         accounts it names. The linked list is walked once, as a ref's target is, and each row's money is handed on by id. */
      const linked = new Map<number, Record<string, unknown>>();
      for (const [i, b] of blocks.entries()) {
        const link = b.refusals?.length || (b.kind !== 'bar' && b.kind !== 'split') ? null : linkOf(registerOf(b), b.columns?.[1]?.field);
        if (!link) continue;
        const rows = await rowsOf(link.to);
        /* BY THE ULID AND BY THE NUMBER, because the element the bar looks up is no longer the one that
           arrived. `entryOf` resolves a `list<ref>` element to the target row's SEQUENCE as of
           `a4d0111d`, which is what a person says and what every other screen wants; this map was
           written before that and keyed only by the ULID the record sends. The lookup then missed on
           every row, every row was skipped as linking to nothing, and the founder use case's "Balance
           by organisation" drew its empty line, "No organisation lists an account yet", on a record
           whose three organisations each hold an account. It was caught in a marketing capture rather
           than by a test, which is why the test beside this one drives both forms. */
        if (rows)
          linked.set(
            i,
            Object.fromEntries(
              rows.flatMap((r) => {
                const held = r.fields[link.money];
                return r.seq === null ? [[r.id, held] as const] : [[r.id, held] as const, [String(r.seq), held] as const];
              }),
            ),
          );
      }
      return {
        from: 'live',
        now,
        page: {
          page: identity ? { ...page, identity } : page,
          blocks: blocks.map((b, i) => {
            const drawn = blockOf(b, refs, now, me, names);
            const held = linked.get(i);
            return held && !drawn.cannot ? { ...drawn, linked: held } : drawn;
          }),
        },
      };
    },
  };
}
