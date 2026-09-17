/**
 * A declared page on `/p/<slug>`, read from the record, with the sample when there is no record.
 *
 * A ROUTE-ONLY MODULE, like `row-live.ts`: the client carries the route table as a value.
 *
 * `UNREACHABLE` and `UNAUTHORIZED` mean there is no record here, and the page reads the sample as it
 * always did. That is kept for the tab, so a static host is not asked again on every page. A page the
 * record does not have is `missing`, with the titles of the pages it does have. Any other refusal is
 * the record's own sentence.
 *
 * A LIVE PAGE IS DRAWN FROM THE ANSWER AND NOTHING ELSE. Each block the record sent becomes the shape
 * the page's drawing already reads. A block this build cannot draw from that answer carries one plain
 * sentence instead, and is never filled from the sample.
 *
 * THE DECLARATIONS ARE THE SEED'S COPY, as they are for the list and the row (`remote.ts` says why):
 * a register's labels, a metric's format and target line.
 */

import { createClient, type ClientOptions } from '@braindog/client';
import { isBucket, isStale, type Bars } from '@braindog/kernel';
import { MISSING, integer, money, quantity } from 'braindog-render';

import { copy } from '../copy.ts';
import type { ActionRow, Outcome } from './actions.ts';
import {
  REGISTERS,
  agentsTable,
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
import { METRICS } from './declared.ts';
import { readBoot } from './boot-live.ts';
import { noRecord } from './device.ts';
import { format, hrefFor, noteOf, targetLine, withParam } from './metrics.ts';
import { entryOf, namesOf, refMapOf, targetsOf, type RecordRow, type RefMap } from './remote.ts';
import type { PageBlock, PageDecl } from './schema.ts';
import { labels, relabel } from '../voice.ts';

export type Fetch = NonNullable<ClientOptions['fetch']>;

export const liveWords = {
  cannot: 'This block cannot be drawn from the record yet.',
  changed: 'The page changed while it was being read.',
} as const;

/** A refusal as the record sends one, and only the keys read here. */
type Said = { code: string; fix: string };

/** A reading as the kernel's `metrics.ts` sends one, and only the keys read here. */
type Reading = {
  value: number | null;
  unit: string | null;
  rows: number;
  met: boolean | null;
  refusals: Said[];
  /** A grouped figure's parts, and how many past the cap were not drawn. */
  groups?: { key: string; value: number | null }[];
  more?: number;
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
export type LivePageDecl = Omit<PageDecl, 'blocks' | 'requires'> & { requires?: readonly string[] };

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
  | { from: 'sample' }
  | { from: 'missing'; titles: string[] }
  | { from: 'refused'; fix: string };

/** The kinds that add rows up, which a slice of the answer would add up wrong. */
const REDUCES = new Set(['bar', 'chips', 'gauge', 'split']);

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
    const as = roleOf(c.as);
    return {
      field: c.field,
      label: str(c.label) ?? c.field,
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
 * THE VERDICT IS THE RECORD'S (`met`), and a figure over no rows carries none, because a tick over an
 * empty list is a verdict on nothing. The label, the format and the target line are the declaration's.
 */
function tileOf(cell: NonNullable<Answered['readings']>[number], values?: Record<string, unknown>): Metric {
  const at = cell.metric.indexOf(':');
  const template = METRICS[at < 0 ? cell.metric : cell.metric.slice(0, at)];
  const decl = template && at >= 0 ? withParam(template, cell.metric.slice(at + 1)) : template;
  const label = str(cell.label) ?? decl?.name ?? cell.metric;
  const r = cell.reading;
  if (!r || r.value === null || cell.refusal || r.refusals.length)
    return { id: cell.metric, label, value: MISSING, note: copy.figureUnavailable, tone: 'warn' };
  const met = r.rows === 0 ? null : r.met;
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
    /* A NOTE THE CELL DECLARES is said instead of the target, each figure it names formatted as declared. */
    note:
      typeof cell.note === 'string'
        ? noteOf(cell.note, (id) => {
            const v = values?.[id];
            if (typeof v === 'number') return format(METRICS[id]?.format, v);
            return resolverOf(values)(id);
          })
        : decl
          ? targetLine(decl)
          : '',
    tone: met === null ? undefined : met ? 'good' : 'warn',
    ...(decl && r.rows > 0 ? { href: hrefFor(decl) } : {}),
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
  if (!Array.isArray(v.states) || v.states.length !== n || !v.states.every((s) => s === '' || s === 'partial' || s === 'ahead')) return null;
  if (!isBucket(v.bucket) || typeof v.current !== 'string') return null;
  return { bucket: v.bucket, current: v.current, keys: v.keys, states: v.states, values: v.values, unit: typeof v.unit === 'string' ? v.unit : null };
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

/** One answered block as the page draws it. */
export function blockOf(b: Answered, refs: ReadonlyMap<string, RefMap>, now: number, me: string | null = null): LiveBlock {
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
    inherited,
    refusals = [],
    values,
    drawn,
    walk: walked,
    feed: fed,
    seen: mark,
    history: versions,
    bars: barred,
    changes: changed,
    past: remembered,
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
  if (kind === 'stat' || b.cells) return { ...shell, metrics: (readings ?? []).map((cell) => tileOf(cell, values)) };
  /* A BAR OR A SPLIT OVER A FIGURE draws the parts the record read. */
  if (typeof source === 'string' && source.startsWith('metric.')) {
    const reading = readings?.[0]?.reading;
    if (!reading) return cannot;
    const groups = (reading.groups ?? []).map((g) => ({ key: String(g.key), value: typeof g.value === 'number' ? g.value : null }));
    const parts = { metric: source.slice('metric.'.length), value: reading.value, groups, more: typeof reading.more === 'number' ? reading.more : 0 };
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

  /* A WALK, A FEED AND A DIFF ARE NOT ROWS OF A REGISTER. The kernel answers each as its own key, and each
     is shaped by the function that shapes the sample's, so the same renderer draws both. One the record
     did not send, or sent in a shape this cannot read, says it cannot be drawn rather than drawing empty. */
  if (b.source === 'forecast.runway') {
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
    return { ...shell, feed, ...(marks ? { seen } : {}), ...feedTable(feed, marks, seen, now, me), total: matched };
  }
  if (kind === 'diff') {
    const history = historyOf(versions);
    return history ? { ...shell, history, ...historyTable(history, Math.max(matched, history.length)) } : cannot;
  }

  const register = registerOf(b);
  /* A register the seed does not declare has no labels to draw with, and says so rather than drawing half an answer. */
  if (!register || !REGISTERS[register]) return cannot;
  /* A SUM OVER THE FIRST PAGE IS A WRONG NUMBER, so a kind that adds up draws only the whole answer. */
  const reduces = REDUCES.has(kind);
  if (reduces && got.length < matched) return cannot;

  const live = b.source === 'sessions.live';
  const entries = got.map((r) => entryOf(register, r, refs));
  const rows = toRows(register, entries, shell.columns, now, namesOf(refs));
  /* WHO CHANGED EACH ROW LAST, named by the kernel on `changes`, and each money column's sign. */
  markColumns(register, b.columns, entries, rows, (_e, n) => changeOf(changed, n));
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
    ...(inherited === undefined ? {} : { inherited }),
    ...(live ? { quiet: got.map((r) => isStale({ fields: r.fields as never, updated_at: r.updated_at ?? r.created_at }, now)) } : {}),
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
    if (v !== null && typeof v === 'object') {
      const { amount, currency } = v as { amount?: unknown; currency?: unknown };
      if (typeof amount === 'number' && typeof currency === 'string') return money(amount, currency);
    }
    return null;
  };
}

const titlesOf = (listed: unknown): string[] =>
  Array.isArray(listed) ? listed.flatMap((p) => (p !== null && typeof p === 'object' && typeof (p as { title?: unknown }).title === 'string' ? [(p as { title: string }).title] : [])) : [];

export type PageReader = { read(slug: string): Promise<Opened> };

/** A page reader for one tab. `base` is the page's own origin; the app never holds a token. */
export function pageReader(base: string, io?: Fetch, clock: () => number = () => Date.now()): PageReader {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const maps = new Map<string, RefMap>();
  let absent = false;

  /* A REF ARRIVES AS THE TARGET ROW'S ULID, so each register a ref points at is walked once and kept,
     as the row reader does. A register this reader may not list is left out, and its refs draw as ids. */
  async function mapOf(register: string): Promise<RefMap | null> {
    const kept = maps.get(register);
    if (kept) return kept;
    const rows: RecordRow[] = [];
    let cursor: string | null = null;
    do {
      const out = await client.list({ register, limit: 500, ...(cursor === null ? {} : { cursor }) });
      if (!out.ok) return null;
      rows.push(...(out.value.rows as RecordRow[]));
      cursor = out.value.cursor;
    } while (cursor !== null);
    const map = refMapOf(register, rows);
    maps.set(register, map);
    return map;
  }

  return {
    async read(slug) {
      if (absent) return { from: 'sample' };
      const out = await client.page(slug);
      if (!out.ok) {
        if (!('refusal' in out)) return { from: 'refused', fix: liveWords.changed };
        if (noRecord(out.refusal.code)) {
          absent = true;
          return { from: 'sample' };
        }
        if (out.refusal.code === 'PAGE_UNKNOWN') {
          const listed = await client.pages();
          return { from: 'missing', titles: listed.ok ? titlesOf(listed.value) : [] };
        }
        return { from: 'refused', fix: out.refusal.fix };
      }

      const { blocks = [], read_at, ...page } = out.value as AnsweredPage;
      /* TODAY IS THE RECORD'S, where it says what its clock read, so a record pinned to a day draws its own late rows,
         out-of-date balances and forecast from that day. A record that does not say is read against this clock. */
      const said = typeof read_at === 'string' ? Date.parse(read_at) : Number.NaN;
      const now = Number.isFinite(said) ? said : clock();
      /* A LIST THIS BUILD DOES NOT SHIP IS ASKED FOR, and kept beside the ones it does. A use case's own lists
         (`loop/research-spark.md` §2.1) are declared by the record and by no file here, and a page over them drew
         "cannot be drawn" on every block: the display knew only the lists of one use case. */
      for (const b of blocks) {
        const register = b.refusals?.length ? null : registerOf(b);
        if (!register || REGISTERS[register]) continue;
        const schema = await client.schema(register);
        const body = schema.ok ? (schema.value as { id?: unknown; fields?: unknown }) : null;
        if (body && Array.isArray(body.fields)) REGISTERS[register] = relabel({ ...body, id: register } as (typeof REGISTERS)[string], labels());
      }
      const wanted = new Set<string>();
      for (const b of blocks) {
        const register = b.refusals?.length ? null : registerOf(b);
        if (register) for (const target of targetsOf(register)) wanted.add(target);
      }
      /* WHO IS READING, for a feed that names the reader as You: the shell's own `boot`, kept, so it costs no call. */
      const booted = blocks.some((b) => b.source === 'activity') ? await readBoot(base, io) : null;
      const me = booted?.from === 'live' ? (booted.boot.me?.person ?? null) : null;
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
      return {
        from: 'live',
        now,
        page: { page: identity ? { ...page, identity } : page, blocks: blocks.map((b) => blockOf(b, refs, now, me)) },
      };
    },
  };
}
