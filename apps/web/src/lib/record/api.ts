/**
 * The record, as the app reads it.
 *
 * In the real client every one of these is `POST /api/<method>` returning a `Result<T>`; here they
 * answer from `data.ts`. The SHAPES are the real ones, so the screens above this file are the real
 * screens: one request per page load and never one per block, `total` and `drawn` and `stale_at`
 * per block, and every `{{path}}` resolved before it reaches the renderer (22 §5).
 *
 * ponytail: synchronous, in-memory, no write path. The mock-up is the frontend; swapping this file
 * for `lib/data/call.ts` is the whole of what the wiring costs.
 */

import { day as fmtDay, money, relative, integer, MISSING } from 'braindog-render';
import type { Column, TableRow } from 'braindog-render/svelte';
import {
  AUDIT,
  INBOX,
  JOB,
  NOW,
  TODAY,
  PACKS,
  PAGES,
  PEOPLE_ACCESS,
  QUESTIONS,
  DECIDED,
  REGISTERS,
  ROWS,
  NEWS,
  VAULT,
} from './data.ts';
import type { Entry, FieldDecl, PageBlock, PageDecl, RegisterDecl } from './schema.ts';

export const CURRENCY = 'GBP';

/* ── values ──────────────────────────────────────────────────────────────── */

const decl = (register: string, field: string): FieldDecl | undefined =>
  REGISTERS[register]?.fields.find((f) => f.id === field);

/** A label is the field id with `_` as a space, until a pack needs a different word (50 §10). */
export const labelOf = (f: FieldDecl): string =>
  f.label ?? f.id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/**
 * Formatting is decided for the reader, not at the call site. A `ref` reads as the title of the row
 * it points at, because a person says "Halden", not "people#1".
 */
export function display(register: string, field: string, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const f = decl(register, field);
  if (!f) return String(value);
  switch (f.type) {
    case 'money':
      return money(Number(value), CURRENCY);
    case 'day':
      return `${fmtDay(String(value))}`;
    case 'instant':
      return relative(String(value).slice(0, 10), NOW);
    case 'int':
      return integer(Number(value));
    case 'decimal':
    case 'duration':
      return `${value}${f.unit ? ` ${f.unit}` : ''}`;
    case 'bool':
      return value ? 'yes' : 'no';
    case 'enum':
      return String(value).replace(/_/g, ' ');
    case 'ref': {
      const target = f.to ? ROWS[f.to] : undefined;
      const hit = target?.find((e) => e.seq === Number(value));
      const titleField = f.to ? REGISTERS[f.to]?.title : undefined;
      return hit && titleField ? String(hit.fields[titleField] ?? `${f.to}#${value}`) : `${f.to}#${value}`;
    }
    case 'secret':
      return '••••••••';
    default:
      return String(value);
  }
}

/** The second line of a date cell: the band a person actually holds. */
export const dueBand = (iso: unknown): string => (typeof iso === 'string' ? relative(iso, NOW) : '');

/**
 * The identity of the row a `ref` points at, when its register declares one.
 *
 * One mark and one accent per thing, and colour means WHICH PROJECT, everywhere. The hue is frozen
 * at create and never hand-picked; it reaches the DOM as `oklch(L C h)` with the theme's two mark
 * constants, and it may colour a mark, a chip, an avatar, a calendar dot or a chart series — and
 * NEVER text, an intent, a surface, or any border that carries meaning (13 §2.1b).
 *
 * It is never the only signal either: the name always sits beside it. Past four marks the name is
 * what carries identity anyway, which is why there is no fifth colour to find.
 */
export type Identity = { mark: string; hue: number; name: string; retired: boolean };

export function identityOf(register: string, field: string, value: unknown): Identity | null {
  const f = decl(register, field);
  if (!f || f.type !== 'ref' || !f.to) return null;
  const target = REGISTERS[f.to];
  if (!target?.identity) return null;
  const row = (ROWS[f.to] ?? []).find((e) => e.seq === Number(value));
  if (!row) return null;
  const lane = target.state ? String(row.fields[target.state] ?? '') : '';
  return {
    mark: String(row.fields[target.identity.mark] ?? '●'),
    hue: Number(row.fields[target.identity.accent] ?? 0),
    name: String(row.fields[target.title] ?? ''),
    // A retired row is achromatic. It still has a mark; it no longer has a claim on a hue.
    retired: lane === 'retired' || lane === 'parked',
  };
}

/* ── columns ─────────────────────────────────────────────────────────────
   The default projection: seq, the title field, the `mobile:` fields, state, then indexed fields,
   capped at TEN. At 1440px the return sweep is ~1392px, and beyond ten columns of legible width the
   eye loses the row — which in a money ledger means reading a figure off the wrong line (13 §4.2). */

const WIDTH: Record<string, string> = {
  // 6ch is the number's width and not the CELL's: the cell also carries its padding, so `#10`
  // truncated where `#9` did not. An identifier truncates in the middle by rule, which meant the
  // spoken id — the whole point of the column — came out as `#…`.
  seq: '9ch',
  money: '15ch',
  day: '15ch',
  instant: '20ch',
  int: '10ch',
  decimal: '10ch',
  duration: '10ch',
  enum: '13ch',
  bool: '6ch',
  text: 'minmax(14ch, 1fr)',
  document: 'minmax(14ch, 1fr)',
  ref: 'minmax(12ch, 20ch)',
  secret: '14ch',
};

/** Quantities, dates and counts end. Text and refs start. */
const END = new Set(['money', 'day', 'instant', 'int', 'decimal', 'duration']);

export function columnsFor(register: string): Column[] {
  const r = REGISTERS[register];
  if (!r) return [];
  const wanted = new Set<string>([r.title, ...r.mobile, ...(r.state ? [r.state] : [])]);
  for (const f of r.fields) if (f.indexed) wanted.add(f.id);

  const cols: Column[] = [
    // The spoken id truncates in the MIDDLE if it ever has to, keeping prefix and suffix.
    { field: 'seq', label: '#', width: WIDTH.seq!, align: 'end', truncate: 'middle' },
  ];
  for (const f of r.fields) {
    if (!wanted.has(f.id) || cols.length >= 10) continue;
    cols.push({
      field: f.id,
      label: labelOf(f),
      width: WIDTH[f.type] ?? WIDTH.text!,
      align: END.has(f.type) ? 'end' : 'start',
      // A figure never truncates: a truncated figure is not shortened, it is wrong.
      truncate: f.type === 'money' ? 'never' : 'end',
    });
  }
  return cols;
}

/** A row's tone comes from the data, never from a call site: overdue is `bad`, due soon is `warn`. */
function toneOf(register: string, e: Entry): TableRow['tone'] {
  const r = REGISTERS[register];
  if (!r) return undefined;
  const state = r.state ? String(e.fields[r.state] ?? '') : '';
  if (r.done?.includes(state)) return 'good';
  const dated = r.fields.find((f) => f.type === 'day' && f.indexed);
  if (!dated) return undefined;
  const value = e.fields[dated.id];
  if (typeof value !== 'string') return undefined;
  const days = (Date.parse(`${value}T12:00:00Z`) - NOW) / 86_400_000;
  if (days < 0) return 'bad';
  if (days < 14) return 'warn';
  return undefined;
}

export function toRows(register: string, entries: Entry[], columns: Column[]): TableRow[] {
  return entries.map((e) => ({
    key: `${register}#${e.seq}`,
    href: `/r/${register}/${e.seq}`,
    tone: toneOf(register, e),
    cells: columns.map((c) => (c.field === 'seq' ? `#${e.seq}` : display(register, c.field, e.fields[c.field]))),
  }));
}

/* ── filters and order ────────────────────────────────────────────────────── */

export type Filter = { field: string; op: string; values: string[] };

export function applyFilters(register: string, entries: Entry[], filters: Filter[], q?: string): Entry[] {
  let out = entries;
  for (const f of filters)
    out = out.filter((e) => {
      const v = e.fields[f.field];
      if (f.op === 'in') return f.values.includes(String(v));
      if (f.op === 'before') return typeof v === 'string' && v < f.values[0]!;
      if (f.op === 'after') return typeof v === 'string' && v > f.values[0]!;
      return String(v) === f.values[0];
    });
  if (q) {
    const needle = q.toLowerCase();
    out = out.filter((e) =>
      Object.entries(e.fields).some(([k, v]) => {
        const shown = display(register, k, v);
        return shown ? shown.toLowerCase().includes(needle) : false;
      }),
    );
  }
  return out;
}

export function sortRows(register: string, entries: Entry[], field: string, dir: 'asc' | 'desc'): Entry[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...entries].sort((a, b) => {
    if (field === 'seq') return (a.seq - b.seq) * sign;
    const x = a.fields[field];
    const y = b.fields[field];
    if (x === y) return a.seq - b.seq;
    if (x === null || x === undefined) return 1;
    if (y === null || y === undefined) return -1;
    return (x < y ? -1 : 1) * sign;
  });
}

/* ── metrics ─────────────────────────────────────────────────────────────
   A metric with no target is decoration, and a metric with no comparison window cannot be acted on.
   Each one below carries both, and the mixed-currency case is refused at install, not at render. */

export type Metric = {
  id: string;
  label: string;
  value: string;
  note: string;
  tone?: 'good' | 'warn' | 'bad' | 'info' | undefined;
  /** Where the figure came from, so pressing it opens the rows behind it. */
  href?: string | undefined;
};

const open = (e: Entry) => e.fields.state === 'open' || e.fields.state === 'part';
const days = (iso: unknown) =>
  typeof iso === 'string' ? (Date.parse(`${iso}T12:00:00Z`) - NOW) / 86_400_000 : Infinity;

export function metric(id: string): Metric {
  const obligations = ROWS.obligations ?? [];
  const services = ROWS.services ?? [];

  switch (id) {
    case 'owed-to-you': {
      const rows = obligations.filter((e) => open(e) && e.fields.direction === 'owed_to_me');
      const total = rows.reduce((a, e) => a + Number(e.fields.amount ?? 0), 0);
      const late = rows.filter((e) => days(e.fields.due) < 0).length;
      return {
        id,
        label: 'Owed to you',
        value: money(total, CURRENCY),
        note: `${rows.length} open · ${late} past terms`,
        tone: late > 0 ? 'warn' : 'good',
        href: '/r/obligations?f=direction:is:owed_to_me&f=state:in:open,part',
      };
    }
    case 'due-30d': {
      const rows = obligations.filter((e) => open(e) && e.fields.direction === 'owed_by_me' && days(e.fields.due) <= 30);
      const total = rows.reduce((a, e) => a + Number(e.fields.amount ?? 0), 0);
      return {
        id,
        label: 'Due in 30 days',
        value: money(total, CURRENCY),
        note: `target ≤ ${money(2_500_000, CURRENCY)}`,
        tone: total > 2_500_000 ? 'warn' : 'good',
        href: '/r/obligations?f=direction:is:owed_by_me&f=due:before:+30d',
      };
    }
    case 'overdue': {
      const rows = obligations.filter((e) => open(e) && days(e.fields.due) < 0);
      const total = rows.reduce((a, e) => a + Number(e.fields.amount ?? 0), 0);
      return {
        id,
        label: 'Overdue',
        value: money(total, CURRENCY),
        note: rows.length === 0 ? 'nothing late' : `${rows.length} rows · target 0`,
        tone: rows.length === 0 ? 'good' : 'bad',
        href: '/r/obligations?f=state:in:open,part&f=due:before:today',
      };
    }
    case 'renews-30d': {
      const rows = services.filter((e) => e.fields.state !== 'cancelled' && days(e.fields.renews) <= 30);
      return {
        id,
        label: 'Renews in 30 days',
        value: String(rows.length),
        note: `of ${services.filter((e) => e.fields.state !== 'cancelled').length} live`,
        tone: rows.length > 6 ? 'warn' : undefined,
        href: '/r/services?f=renews:before:+30d',
      };
    }
    case 'estate-year': {
      const total = services
        .filter((e) => e.fields.state !== 'cancelled')
        .reduce((a, e) => a + Number(e.fields.cost ?? 0) * (e.fields.cycle === 'monthly' ? 12 : e.fields.cycle === 'two_yearly' ? 0.5 : 1), 0);
      return { id, label: 'Cost per year', value: money(Math.round(total), CURRENCY), note: `target ≤ ${money(30_000, CURRENCY)}`, tone: total > 30_000 ? 'warn' : 'good', href: '/r/services' };
    }
    case 'lapsing': {
      const rows = services.filter((e) => e.fields.state === 'lapsing');
      return {
        id,
        label: 'Lapsing',
        value: String(rows.length),
        note: rows.length === 0 ? 'all renewing' : 'auto-renew is off',
        tone: rows.length === 0 ? 'good' : 'bad',
        href: '/r/services?f=state:is:lapsing',
      };
    }
    case 'open-questions':
      return {
        id,
        label: 'Open questions',
        value: String(QUESTIONS.length),
        note: 'target ≤ 3',
        tone: QUESTIONS.length > 3 ? 'warn' : 'good',
        href: '/decide',
      };
    default:
      return { id, label: id, value: MISSING, note: 'no such metric' };
  }
}

/** The values a page's `{{path}}` interpolations resolve to, pre-resolved server-side (22 §5). */
export function values(): Record<string, string> {
  const overdue = (ROWS.obligations ?? []).filter((e) => open(e) && days(e.fields.due) < 0);
  const oldest = overdue.map((e) => String(e.fields.due)).sort()[0];
  return {
    'obligations.oldest_overdue': oldest ?? '',
    'obligations.count': String((ROWS.obligations ?? []).length),
    'services.count': String((ROWS.services ?? []).length),
    ...Object.fromEntries(
      ['owed-to-you', 'due-30d', 'overdue', 'renews-30d', 'estate-year', 'lapsing'].map((id) => [id, metric(id).value]),
    ),
  };
}

/* ── the endpoints ───────────────────────────────────────────────────────── */

export type NavEntry = { id: string; title: string; href: string; section: string; order: number };

export function boot() {
  const nav: NavEntry[] = Object.values(PAGES)
    .filter((p) => p.nav && p.placed !== false)
    .map((p) => ({ id: p.page, title: p.title, href: `/p/${p.page}`, section: p.nav!.section, order: p.nav!.order }));

  return {
    index: {
      slug: 'the-studio',
      name: 'The Studio',
      locale: 'en',
      registers: Object.values(REGISTERS).map((r) => ({ id: r.id, name: r.name, count: (ROWS[r.id] ?? []).length })),
    },
    nav,
    /** Pages that emerged and were never placed. A holding pen, not a decision (19 §3). */
    pen: Object.values(PAGES).filter((p) => p.placed === false),
    me: { person: 'you', level: 'owner' as const, owner: true, records: [{ slug: 'the-studio', name: 'The Studio' }] },
    people: PEOPLE_ACCESS,
    questions: QUESTIONS,
    whatsNew: NEWS,
    sinceCapped: false,
    version: 4192,
    /** Absent means every "Ask Spark" affordance is ABSENT, not disabled (23 §8). */
    spark: false,
  };
}

export type BlockResult = PageBlock & {
  rows: TableRow[];
  columns: Column[];
  entries: Entry[];
  total: number;
  drawn: boolean;
  /** Machine-readable, and every block that renders a query result carries one: staleness is a
      TIMESTAMP, not a vibe (19 §6). */
  stale_at: string;
  register?: string | undefined;
  metrics?: Metric[] | undefined;
};

export function page(slug: string): { page: PageDecl; blocks: BlockResult[]; values: Record<string, string> } | null {
  const decl = PAGES[slug];
  if (!decl) return null;

  const blocks = decl.blocks.map((b): BlockResult => {
    const register = b.source?.startsWith('register.') ? b.source.slice('register.'.length) : undefined;
    const all = register ? (ROWS[register] ?? []) : [];
    const entries = register ? filterForBlock(register, all, b) : [];
    const columns = b.columns
      ? b.columns.map((c) => ({
          field: c.field,
          label: c.label ?? c.field,
          width: c.width ?? 'minmax(12ch,1fr)',
          align: c.align ?? 'start',
          truncate: c.field === 'amount' || c.field === 'cost' ? ('never' as const) : ('end' as const),
        }))
      : [];
    return {
      ...b,
      register,
      columns,
      entries: entries.slice(0, b.limit ?? 50),
      rows: toRows(register ?? '', entries.slice(0, b.limit ?? 50), columns),
      total: entries.length,
      drawn: b.drawn ?? true,
      stale_at: new Date(NOW).toISOString(),
      metrics: b.cells?.map((c) => ({ ...metric(c.metric), label: c.label })),
    };
  });

  return { page: decl, blocks, values: values() };
}

/** The mock's stand-in for a compiled `where:`. The real one is one JSON tree, seven consumers. */
function filterForBlock(register: string, entries: Entry[], b: PageBlock): Entry[] {
  let out = entries;
  if (b.where?.includes('owed to me')) out = out.filter((e) => e.fields.direction === 'owed_to_me');
  if (b.where?.includes('owed by me')) out = out.filter((e) => e.fields.direction === 'owed_by_me');
  if (b.where?.includes('state is open')) out = out.filter(open);
  if (register === 'services' && b.kind === 'timeline')
    out = out.filter((e) => e.fields.state !== 'cancelled' && days(e.fields.renews) <= 90);
  if (register === 'tasks' && b.kind === 'table') out = out.filter((e) => e.fields.state !== 'done' && e.fields.state !== 'dropped');
  const order = b.order?.[0];
  return order ? sortRows(register, out, order.field, order.dir) : out;
}

export function list(register: string, opts: { filters?: Filter[]; q?: string; sort?: { field: string; dir: 'asc' | 'desc' } } = {}) {
  const all = ROWS[register] ?? [];
  const filtered = applyFilters(register, all, opts.filters ?? [], opts.q);
  const sorted = opts.sort ? sortRows(register, filtered, opts.sort.field, opts.sort.dir) : filtered;
  return { entries: sorted, total: all.length, matched: filtered.length };
}

export const registerOf = (id: string): RegisterDecl | undefined => REGISTERS[id];
export const entry = (register: string, seq: number): Entry | undefined =>
  (ROWS[register] ?? []).find((e) => e.seq === seq);

export type SearchHit = { title: string; detail: string; href: string; kind: string; spoken?: string };

export function search(q: string, limit = 24): SearchHit[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const hits: SearchHit[] = [];

  for (const [id, r] of Object.entries(REGISTERS))
    for (const e of ROWS[id] ?? []) {
      const title = String(e.fields[r.title] ?? '');
      if (!title.toLowerCase().includes(needle)) continue;
      hits.push({
        title,
        detail: `${r.name} · ${display(id, r.state ?? '', e.fields[r.state ?? '']) ?? ''}`,
        href: `/r/${id}/${e.seq}`,
        kind: r.name,
        spoken: `${id}#${e.seq}`,
      });
      if (hits.length >= limit) return hits;
    }

  for (const q2 of [...QUESTIONS, ...DECIDED])
    if (q2.title.toLowerCase().includes(needle) || q2.id.toLowerCase() === needle)
      hits.push({ title: q2.title, detail: q2.decided ? 'Decided' : 'Open question', href: `/decide/${q2.id}`, kind: 'Decide', spoken: q2.id });

  return hits.slice(0, limit);
}

export { AUDIT, INBOX, JOB, NOW, PACKS, PAGES, QUESTIONS, DECIDED, REGISTERS, ROWS, NEWS, TODAY, VAULT, PEOPLE_ACCESS };
