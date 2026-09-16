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
import { isStale } from '@braindog/kernel';
import { MISSING, integer, money } from 'braindog-render';
import type { Column } from 'braindog-render/svelte';

import { copy } from '../copy.ts';
import type { ActionRow, Outcome } from './actions.ts';
import { REGISTERS, toRows, type BlockResult, type Metric } from './api.ts';
import { METRICS } from './declared.ts';
import { noRecord } from './device.ts';
import { format, hrefFor, targetLine, withParam } from './metrics.ts';
import { entryOf, namesOf, refMapOf, targetsOf, type RecordRow, type RefMap } from './remote.ts';
import type { PageBlock, PageDecl } from './schema.ts';

export type Fetch = NonNullable<ClientOptions['fetch']>;

export const liveWords = {
  cannot: 'This block cannot be drawn from the record yet.',
  changed: 'The page changed while it was being read.',
} as const;

/** A refusal as the record sends one, and only the keys read here. */
type Said = { code: string; fix: string };

/** A reading as the kernel's `metrics.ts` sends one, and only the keys read here. */
type Reading = { value: number | null; unit: string | null; rows: number; met: boolean | null; refusals: Said[] };

type Row = RecordRow & { updated_at?: string };

/** A block as the record's `page` answers it: the declaration, with what the kernel read on it. */
type Answered = {
  kind: string;
  source?: string;
  columns?: { field: string; label?: string; width?: string; align?: 'start' | 'end'; as?: string }[];
  cells?: { metric: string; label?: string }[];
  rows?: Row[];
  matched?: number;
  readings?: { metric: string; label?: string; reading: Reading | null; refusal?: Said }[];
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
const REDUCES = new Set(['bar', 'chips', 'gauge']);

/** What a scope cell reads for a row that applies to every project, as the sample says it. */
const EVERYWHERE = 'Everywhere';

/** The register a block's rows belong to, when it has one this build can draw. */
function registerOf(b: Answered): string | null {
  if (b.source === 'sessions.live') return 'session';
  return b.source?.startsWith('register.') ? b.source.slice('register.'.length) : null;
}

const columnsOf = (b: Answered): Column[] =>
  (b.columns ?? []).map((c) => ({
    field: c.field,
    label: c.label ?? c.field,
    width: c.width ?? 'minmax(12ch,1fr)',
    align: c.align ?? 'start',
    truncate: c.field === 'amount' || c.field === 'cost' ? 'never' : 'end',
    ...(c.as === undefined || c.as === 'scope' ? {} : { as: c.as }),
  })) as Column[];

/**
 * One figure of a `stat` block, as a tile.
 *
 * THE VERDICT IS THE RECORD'S (`met`), and a figure over no rows carries none, because a tick over an
 * empty list is a verdict on nothing. The label, the format and the target line are the declaration's.
 */
function tileOf(cell: NonNullable<Answered['readings']>[number]): Metric {
  const at = cell.metric.indexOf(':');
  const template = METRICS[at < 0 ? cell.metric : cell.metric.slice(0, at)];
  const decl = template && at >= 0 ? withParam(template, cell.metric.slice(at + 1)) : template;
  const label = cell.label ?? decl?.name ?? cell.metric;
  const r = cell.reading;
  if (!r || r.value === null || cell.refusal || r.refusals.length)
    return { id: cell.metric, label, value: MISSING, note: copy.figureUnavailable, tone: 'warn' };
  const met = r.rows === 0 ? null : r.met;
  return {
    id: cell.metric,
    label,
    value: r.unit ? money(Math.round(r.value), r.unit) : format(decl?.format, r.value),
    note: decl ? targetLine(decl) : '',
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

/** One answered block as the page draws it. */
export function blockOf(b: Answered, refs: ReadonlyMap<string, RefMap>, now: number): LiveBlock {
  const { rows: got = [], matched = 0, readings, scopes, inherited, refusals = [], values, drawn, walk: _walk, feed: _feed, seen: _seen, history: _history, ...decl } = b;
  /* THE DECLARATION'S COLUMNS ARE REPLACED BY DRAWN ONES, which the intersection type cannot say. */
  const shell = {
    ...(decl as unknown as PageBlock),
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
  } as unknown as LiveBlock;
  const cannot: LiveBlock = { ...shell, cannot: liveWords.cannot };

  if (refusals.length || drawn === false) return shell;
  if (b.kind === 'stat' || b.cells) return { ...shell, metrics: (readings ?? []).map(tileOf) };
  if (!b.source) return shell;
  if (b.source === 'actions') {
    const actions = got.map((r) => actionOf(r.fields));
    return { ...shell, actions, shown: actions.length, total: matched };
  }

  const register = registerOf(b);
  /* A WALK, A FEED AND A DIFF ARE NOT ROWS OF A REGISTER, and a register the seed does not declare has
     no labels to draw with. Each says so rather than drawing half an answer. */
  if (!register || b.kind === 'diff' || !REGISTERS[register]) return cannot;
  /* A SUM OVER THE FIRST PAGE IS A WRONG NUMBER, so a kind that adds up draws only the whole answer. */
  const reduces = REDUCES.has(b.kind);
  if (reduces && got.length < matched) return cannot;

  const live = b.source === 'sessions.live';
  const entries = got.map((r) => entryOf(register, r, refs));
  const rows = toRows(register, entries, shell.columns, now, namesOf(refs));
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

      const { blocks = [], ...page } = out.value as AnsweredPage;
      const now = clock();
      const wanted = new Set<string>();
      for (const b of blocks) {
        const register = b.refusals?.length ? null : registerOf(b);
        if (register) for (const target of targetsOf(register)) wanted.add(target);
      }
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
        page: { page: identity ? { ...page, identity } : page, blocks: blocks.map((b) => blockOf(b, refs, now)) },
      };
    },
  };
}
