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
import { PATHS, type IconName } from '../ui/icons.ts';
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
import { runway } from './forecast.ts';
import { compile, explain, matches } from './where.ts';
import type { Entry, FieldDecl, PageBlock, PageDecl, RegisterDecl } from './schema.ts';

export const CURRENCY = 'GBP';

/**
 * The cash the walk starts from, in minor units.
 *
 * A STAND-IN, and it is named up here so that it reads as one. The record does not hold a bank
 * balance yet, and a runway seeded from a number nobody declared is a forecast that looks like a
 * fact. When an account row exists this becomes a lookup and nothing else changes.
 */
const OPENING = 4_200_000;

/** One locale for collation, so a list is in the same order for everybody looking at one record. */
const LOCALE = 'en-GB';

/* ── values ──────────────────────────────────────────────────────────────── */

const decl = (register: string, field: string): FieldDecl | undefined =>
  REGISTERS[register]?.fields.find((f) => f.id === field);

/** A label is the field id with `_` as a space, until a pack needs a different word (50 §10). */
export const labelOf = (f: FieldDecl): string =>
  f.label ?? f.id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/**
 * Is what this field renders a string SOMEBODY TYPED, or a string the app built?
 *
 * The distinction is bidirectional text, and it is not cosmetic. Unicode resolves the direction of
 * neutral characters — spaces, punctuation, brackets, the `—` in an invoice title — from the
 * paragraph around them. So an Arabic party name sitting in an English paragraph puts its full stop
 * on the wrong end of the sentence, and an English title in an Arabic UI does the same in reverse.
 * The text is not merely aligned oddly; it is in the wrong ORDER, and the reader has no way to know
 * that the app did it rather than whoever typed it.
 *
 * `dir="auto"` hands the browser the one rule it needs: take the direction from the first strong
 * character in the string. "Invoice 2026-041" starts with a Latin I and reads left-to-right;
 * "فاتورة 2026" starts with an Arabic letter and reads right-to-left; both then place their own
 * neutrals correctly, in the same grid, with no locale setting and no guess by us.
 *
 * It is TRUE for `text` and `document`, obviously, and also for `ref` — a reference renders as the
 * TITLE of the row it points at, which is prose. It is false for everything else on purpose: money,
 * dates, integers and durations are strings this file assembled from a number, and their direction
 * is the app's rather than the reader's. An unknown field is treated as prose, because the failure
 * of guessing wrong that way is a correctly-ordered string, and the other way it is a broken one.
 */
export const isProse = (register: string, field: string): boolean => {
  const t = decl(register, field)?.type;
  return t === undefined || t === 'text' || t === 'document' || t === 'ref';
};

/** `dir` for a prose element, and nothing at all otherwise — Svelte drops an undefined attribute. */
export const dirOf = (register: string, field: string): 'auto' | undefined =>
  isProse(register, field) ? 'auto' : undefined;

/**
 * The fields a PERSON sees, which is not the same list as the fields a register declares.
 *
 * Two kinds come out. A `secret` is never rendered anywhere, which was already true. And the two
 * fields named by `identity` are the row's MARK and its frozen accent hue: machinery that exists so
 * a thing can be recognised at a glance, chosen once at create and never hand-picked (13 §2.1b).
 *
 * They were being listed like any other field, so creating a project asked for "Mark" and "Hue" in
 * two text boxes, and the row page printed them as values. `labelOf` is what made it look
 * deliberate rather than broken: it capitalises a field id into a plausible English word, so an
 * internal column arrives wearing a label and nothing about the screen says it should not be there.
 *
 * The identity is drawn, not typed. There is nothing to ask and nothing to read.
 */
export function readableFields(register: string): FieldDecl[] {
  const reg = REGISTERS[register];
  if (!reg) return [];
  const internal = new Set([reg.identity?.mark, reg.identity?.accent].filter(Boolean));
  return reg.fields.filter((f) => f.type !== 'secret' && !internal.has(f.id));
}

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
    case 'duration': {
      /* ROUNDED, because these get summed. `0.2 + 3 + 0.2` is 3.4000000000000004 in binary
         floating point, and a bar chart totalling three tasks' effort printed exactly that. Money
         never has this problem — it is an integer in minor units — but a decimal is a decimal, so
         the display has to be the thing that decides how many places a person sees.

         Three places is the ceiling and trailing zeros are dropped, so `3.4` stays `3.4` and does
         not become `3.400`. `toLocaleString` also groups the thousands, which a raw template did
         not: `1200 d` was a number nobody reads as one thousand two hundred. */
      const n = Number(value);
      const shown = Number.isFinite(n) ? n.toLocaleString('en-GB', { maximumFractionDigits: 3 }) : String(value);
      return `${shown}${f.unit ? ` ${f.unit}` : ''}`;
    }
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
  ref: 'minmax(11ch, 16ch)',
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
      // THE TITLE COLUMN IS NOT JUST ANOTHER TEXT COLUMN. Sharing the free space equally between
      // every flexible column let a fixed 13ch enum sit at its full width beside a title being
      // truncated mid-word — and the title is the only cell in the row a person actually reads to
      // find what they came for. It takes the lion's share of whatever is left over.
      width: f.id === r.title ? 'minmax(24ch, 3fr)' : (WIDTH[f.type] ?? WIDTH.text!),
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
  /* DECLARED, not guessed. This was "the first indexed `day` field", which for `tracks` is `opened`
     — always in the past — so every open track came out `bad`. */
  const dated = r.fields.find((f) => f.type === 'day' && f.deadline);
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

/**
 * The URL's filter chips, as a `where` sentence.
 *
 * There were two filter languages in this product and they disagreed. `where.ts` resolves dates,
 * checks enum values and matches on what the screen shows; `applyFilters` did four raw string
 * comparisons, so `due before today` asked whether `'2026-10-01' < 'today'` — true for every row,
 * because `'2'` sorts before `'t'` — and `due before +30d` was false for every row for the same
 * reason in the other direction.
 *
 * The consequence was three money tiles linking to a list that contradicted them: Overdue said two
 * rows and opened eighteen; "Due in 30 days" and "Renews in 30 days" both opened nothing at all.
 * A figure you cannot click through to is a figure you cannot check.
 *
 * A chip is a control and a sentence is a declaration, so both spellings stay — but there is one
 * evaluator underneath, and it is the one with the tests.
 */
export const whereOf = (filters: Filter[]): string =>
  filters
    .map((f) =>
      f.op === 'in'
        ? `${f.field} is ${f.values.join(' or ')}`
        : f.op === 'before' || f.op === 'after'
          ? `${f.field} ${f.op} ${f.values[0] ?? ''}`
          : `${f.field} is ${f.values[0] ?? ''}`,
    )
    .join(', ');

export function applyFilters(register: string, entries: Entry[], filters: Filter[], q?: string): Entry[] {
  const w = compile(register, whereOf(filters));
  let out = filters.length ? entries.filter((e) => matches(e, w, NOW)) : entries;

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
    /* TEXT COLLATES, everything else compares. `<` on strings compares UTF-16 code units, so every
       capital sorts above every lowercase — "Zebra" before "apple" — and anything accented lands
       after "z", which puts "Ökonkwo" at the bottom of a column of party names. Numbers and ISO
       days are left alone: money is an integer and must compare by magnitude, and `2026-07-27` is
       chronological already precisely because it is written to sort as text. */
    if (typeof x === 'string' && typeof y === 'string') return x.localeCompare(y, LOCALE) * sign;
    return (x < y ? -1 : 1) * sign;
  });
}

/* ── tracks ──────────────────────────────────────────────────────────────── */

export type Health = 'on_track' | 'at_risk' | 'off_track';
export type UpdateState = 'current' | 'missing' | 'not_expected';

export type TrackHealth = {
  /** The newest update's health, or null when there has never been one. Never a stored field. */
  health: Health | null;
  /** When that update was written. */
  asOf: string | null;
  state: UpdateState;
  by: string | null;
};

/** How long an open track may go unspoken about before the absence is worth showing. */
const UPDATE_WINDOW_DAYS = 14;

/**
 * A track's current health, DERIVED from its newest update and never read from the track.
 *
 * A mutable health column tells you a track was healthy; it cannot tell you whether that was
 * verified on Friday or has said the same thing since March. Storing it beside an append-only log
 * of changes to it is two systems that can disagree, so there is one system: the newest row wins
 * and there is nowhere else to look (20 §9).
 *
 * `not_expected` IS A SEPARATE VALUE FROM `missing`, and it is the part every implementation of
 * this omits. A track that is holding, done or dropped is not silent — nobody is expected to say
 * anything about it. Without the distinction, every finished and parked track piles into the
 * missing bucket, the bucket becomes noise, and the nudge built on it is dead inside a month.
 */
export function trackHealth(seq: number): TrackHealth {
  const track = ROWS.tracks?.find((t) => t.seq === seq);
  const state = String(track?.fields.state ?? '');
  const expected = state === 'open';

  const newest = (ROWS.updates ?? [])
    .filter((u) => Number(u.fields.track) === seq)
    .sort((a, b) => String(a.fields.at).localeCompare(String(b.fields.at)))
    .at(-1);

  if (!newest) {
    return { health: null, asOf: null, by: null, state: expected ? 'missing' : 'not_expected' };
  }

  const asOf = String(newest.fields.at);
  const age = (NOW - Date.parse(asOf)) / 86_400_000;
  return {
    health: newest.fields.health as Health,
    asOf,
    by: String(newest.fields.by ?? ''),
    state: !expected ? 'not_expected' : age > UPDATE_WINDOW_DAYS ? 'missing' : 'current',
  };
}

/** The intent a health carries. `null` is not an alarm — nobody having spoken is not bad news. */
export const healthTone = (h: Health | null): 'good' | 'warn' | 'bad' | undefined =>
  h === 'on_track' ? 'good' : h === 'at_risk' ? 'warn' : h === 'off_track' ? 'bad' : undefined;

/** What a reader sees where a health goes, including when there isn't one. */
export function healthLabel(t: TrackHealth): string {
  if (t.state === 'not_expected') return 'No update expected';
  if (!t.health) return 'Update missing';
  const words = { on_track: 'On track', at_risk: 'At risk', off_track: 'Off track' } as const;
  return t.state === 'missing' ? `${words[t.health]}, and stale` : words[t.health];
}

/** Every update on a track, newest first — the thread a person actually reads. */
export const updatesFor = (seq: number): Entry[] =>
  (ROWS.updates ?? [])
    .filter((u) => Number(u.fields.track) === seq)
    .sort((a, b) => String(b.fields.at).localeCompare(String(a.fields.at)));

/** Every session pinned to a track, most recently seen first. */
export const sessionsFor = (seq: number): Entry[] =>
  (ROWS.sessions ?? [])
    .filter((x) => Number(x.fields.track) === seq)
    .sort((a, b) => String(b.fields.last_seen).localeCompare(String(a.fields.last_seen)));

/* ── what points AT this row ──────────────────────────────────────────────
   A `ref` declares `to:` and nothing declares the other direction, so the record could say "this
   invoice is for Halden" and a person's page could not say "these four invoices are Halden's" —
   which is the half somebody opens a person for. There is nothing to add to the data model: the
   inverse of every `ref` is already stated, once, on the field that declares it. */

export type Backlink = {
  register: string;
  /** The register's own name, and the field's label — "Obligations · Party", not "obligations". */
  name: string;
  label: string;
  icon: IconName;
  total: number;
  /** The first few, ready to draw. The rest are behind `href`. */
  rows: TableRow[];
  columns: Column[];
  href: string;
};

/**
 * Every row in the record that points at this one, grouped by the relation that points.
 *
 * GROUPED BY FIELD AND NOT BY REGISTER, because two fields of one register can point at the same
 * place and mean different things: an update's `track` is what it is about and its `supersedes` is
 * what it replaces. Collapsing them into "Updates (7)" would be a number nobody could act on.
 *
 * A register is skipped when it points at itself through the row itself — a row is not its own
 * backlink — and the scan is over `ROWS`, which is already in memory.
 */
export function backlinks(register: string, seq: number, show = 5): Backlink[] {
  const out: Backlink[] = [];

  for (const [id, r] of Object.entries(REGISTERS))
    for (const f of r.fields) {
      if (f.type !== 'ref' || f.to !== register) continue;
      const hits = (ROWS[id] ?? []).filter((e) => Number(e.fields[f.id]) === seq && !(id === register && e.seq === seq));
      if (hits.length === 0) continue;

      /* The pointing field is dropped from the columns: every row in this list has the same value
         for it, which is the row you are already looking at. */
      const columns = columnsFor(id).filter((c) => c.field !== f.id).slice(0, 3);
      out.push({
        register: id,
        name: r.name,
        label: labelOf(f),
        icon: iconFor(r.icon, 'rows'),
        total: hits.length,
        rows: toRows(id, hits.slice(0, show), columns),
        columns,
        href: `/r/${id}?f=${f.id}:is:${seq}`,
      });
    }

  /* Most first: on a person, "Obligations 12" is the reason you opened the page and "Tasks 1" is
     not, and a list in declaration order buries the first behind the second. */
  return out.sort((a, b) => b.total - a.total);
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

/**
 * A service's cost over a YEAR, whatever cycle it bills on.
 *
 * `cost` is per cycle, so adding a yearly domain to a monthly bucket adds two different units and
 * produces a number that is not about anything. This was written out longhand in one metric and
 * omitted entirely from another, so the estate's annual cost was right and Kiln's was 9.25 times
 * too low — GBP 112.00 against a true GBP 1,036.00, on a project page, under the word "year".
 * One factor, in one place, so the two cannot drift again.
 */
const perYear = (e: Entry): number =>
  Number(e.fields.cost ?? 0) * (e.fields.cycle === 'monthly' ? 12 : e.fields.cycle === 'two_yearly' ? 0.5 : 1);
const days = (iso: unknown) =>
  typeof iso === 'string' ? (Date.parse(`${iso}T12:00:00Z`) - NOW) / 86_400_000 : Infinity;

export function metric(id: string): Metric {
  const obligations = ROWS.obligations ?? [];
  const services = ROWS.services ?? [];

  /* The Kiln metrics are the same three shapes, narrowed by one `ref`. That is the whole trick of a
     project page: nothing about it is a new kind of thing, it is the register's own numbers with a
     `thing is Kiln` on the front. `KILN` is `things#1`. */
  const KILN = 1;
  const tasks = ROWS.tasks ?? [];

  switch (id) {
    case 'kiln-open': {
      const rows = tasks.filter((e) => e.fields.thing === KILN && e.fields.state !== 'done' && e.fields.state !== 'dropped');
      const late = rows.filter((e) => days(e.fields.by) < 0).length;
      return {
        id,
        label: 'Open',
        value: integer(rows.length),
        note: late > 0 ? `${late} past its date` : 'none past its date',
        tone: late > 0 ? 'warn' : 'good',
        href: '/r/tasks?f=thing:is:1&f=state:in:open,doing,blocked',
      };
    }
    case 'kiln-owed': {
      const rows = obligations.filter((e) => open(e) && e.fields.thing === KILN && e.fields.direction === 'owed_to_me');
      const total = rows.reduce((a, e) => a + Number(e.fields.amount ?? 0), 0);
      const late = rows.filter((e) => days(e.fields.due) < 0).length;
      return {
        id,
        label: 'Owed to you',
        value: money(total, CURRENCY),
        note: `${rows.length} open · ${late} past terms`,
        tone: late > 0 ? 'bad' : 'good',
        href: '/r/obligations?f=thing:is:1&f=direction:is:owed_to_me&f=state:in:open,part',
      };
    }
    case 'kiln-cost': {
      const rows = services.filter((e) => e.fields.thing === KILN && e.fields.state !== 'cancelled');
      const total = rows.reduce((a, e) => a + perYear(e), 0);
      return {
        id,
        label: 'Costs a year',
        value: money(total, CURRENCY),
        note: `${rows.length} live`,
        href: '/r/services?f=thing:is:1&f=state:in:live,lapsing',
      };
    }
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
      /* Bounded BELOW as well. `<= 30` counted everything already late too, so an overdue bill was
         in this tile and in Overdue at once and the two could not be added. A window with one end
         is a window that grows for ever. */
      const rows = obligations.filter(
        (e) => open(e) && e.fields.direction === 'owed_by_me' && days(e.fields.due) >= 0 && days(e.fields.due) <= 30,
      );
      const total = rows.reduce((a, e) => a + Number(e.fields.amount ?? 0), 0);
      return {
        id,
        label: 'Due in 30 days',
        value: money(total, CURRENCY),
        note: `target ≤ ${money(2_500_000, CURRENCY)}`,
        tone: total > 2_500_000 ? 'warn' : 'good',
        href: '/r/obligations?f=direction:is:owed_by_me&f=state:in:open,part&f=due:after:yesterday&f=due:before:%2B31d',
      };
    }
    /* ONE DIRECTION, like the two tiles it sits beside. This added receivables to payables and
       painted the sum in the alarm colour: GBP 17,740.00 was GBP 7,200 you are owed plus GBP 10,540
       you owe. Those are not the same problem and the sum is not a quantity — one is chasing, the
       other is a penalty.

       It is the money you OWE and have not paid, because that is the half the other two do not
       cover: `owed-to-you` already reports its own late count, and `due-30d` is the same direction
       but still ahead of you. The three are now disjoint and add up. */
    case 'overdue': {
      const rows = obligations.filter((e) => open(e) && e.fields.direction === 'owed_by_me' && days(e.fields.due) < 0);
      const total = rows.reduce((a, e) => a + Number(e.fields.amount ?? 0), 0);
      const owedToYou = obligations.filter((e) => open(e) && e.fields.direction === 'owed_to_me' && days(e.fields.due) < 0);
      return {
        id,
        label: 'Overdue',
        value: money(total, CURRENCY),
        note:
          rows.length === 0
            ? 'nothing late'
            : owedToYou.length
              ? `${rows.length} you owe · ${owedToYou.length} you are owed`
              : `${rows.length} rows · target 0`,
        tone: rows.length === 0 ? 'good' : 'bad',
        href: '/r/obligations?f=direction:is:owed_by_me&f=state:in:open,part&f=due:before:today',
      };
    }
    /* THE RUNWAY, which is the only figure in the product that is about the future.
       It seeds from what is liquid, applies every dated movement in order, and reports the first
       day the balance goes under — with the row that did it, because "you run out on 14 November"
       is a number you look at and "the Fenwick renewal is what does it" is one you act on.

       `OPENING` is a stand-in for a cash position the record does not hold yet. It is named here
       rather than buried in the walk so the day a real balance arrives there is one line to change,
       and so nobody mistakes it for something the record knows. */
    case 'runway': {
      const walk = runway(OPENING);
      if (!walk.crossed) {
        return {
          id,
          label: 'Runway',
          value: `Over ${walk.horizon} days`,
          note: 'nothing dated takes it under',
          tone: 'good',
          href: '/p/money',
        };
      }
      return {
        id,
        label: 'Runway',
        value: `${walk.days} days`,
        /* The row, not just the date. A forecast that names only a day leaves the reader to find
           out which movement caused it, and that is the only actionable half of the fact. */
        note: `${fmtDay(walk.crossed.day)} · ${walk.crossed.label}`,
        tone: walk.days !== null && walk.days < 45 ? 'bad' : 'warn',
        href: walk.crossed.href,
      };
    }
    case 'renews-30d': {
      /* Bounded BELOW, like `due-30d`. `<= 30` counted everything already lapsed too, so the tile
         said seven and its own link opened six — and one of the seven had renewed four days ago,
         which is not a thing that renews in thirty days. A window with one end is not a window. */
      const rows = services.filter(
        (e) => e.fields.state !== 'cancelled' && days(e.fields.renews) >= 0 && days(e.fields.renews) <= 30,
      );
      return {
        id,
        label: 'Renews in 30 days',
        value: String(rows.length),
        note: `of ${services.filter((e) => e.fields.state !== 'cancelled').length} live`,
        tone: rows.length > 6 ? 'warn' : undefined,
        href: '/r/services?f=state:in:live,lapsing&f=renews:after:yesterday&f=renews:before:%2B31d',
      };
    }
    case 'estate-year': {
      const total = services
        .filter((e) => e.fields.state !== 'cancelled')
        .reduce((a, e) => a + perYear(e), 0);
      /* 300_000, not 30_000. The target was written a zero short, so a GBP 2,906.80 estate was
         measured against GBP 300.00 and the tile read `warn` for a reason nobody could act on. A
         target that is absurd next to its own figure is a target people stop reading. */
      const target = 300_000;
      /* THE LINK CARRIES THE SAME FILTER THE FIGURE DOES. A bare `/r/services` opened sixteen rows
         summing GBP 3,254.80 under a tile reading GBP 2,906.80 and `good` — the difference being a
         cancelled service, absent from the figure and enough on its own to cross the target. */
      return { id, label: 'Cost per year', value: money(Math.round(total), CURRENCY), note: `target ≤ ${money(target, CURRENCY)}`, tone: total > target ? 'warn' : 'good', href: '/r/services?f=state:is:live%20or%20lapsing' };
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
  /* OWED TO YOU, and the direction is the whole of it. The only sentence that consumes this path is
     about statutory interest on a receivable, and the minimum was taken over overdue rows in BOTH
     directions — so the Money page printed the age of a bill YOU owe, in the alarm colour, under a
     sentence about interest you can charge somebody else. Shown 2mo; the oldest overdue receivable
     is 5w. A path is named after what it means or it means whatever the first caller assumed. */
  const overdue = (ROWS.obligations ?? []).filter(
    (e) => open(e) && e.fields.direction === 'owed_to_me' && days(e.fields.due) < 0,
  );
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

export type NavEntry = {
  id: string;
  title: string;
  href: string;
  section: string;
  order: number;
  icon: IconName;
  /** The frozen hue of the row this page is about, when it is about one. */
  hue?: number | undefined;
};

/**
 * A declared icon name, resolved against the set that actually shipped.
 *
 * A declaration is DATA — it arrives with a pack, and a pack is a thing a stranger wrote. The name
 * it asks for may be one this build has never heard of, and the answer to that is the fallback
 * glyph for the kind of row, never an empty box and never a thrown error: a rail is not allowed to
 * fail to render because someone spelled `obligations` where the set says `obligation`.
 */
export const iconFor = (declared: string | undefined, fallback: IconName): IconName =>
  declared && Object.hasOwn(PATHS, declared) ? (declared as IconName) : fallback;

/** The frozen hue of a declared identity, or undefined when the page is not about a row. */
export const hueOf = (id: { register: string; seq: number } | undefined): number | undefined => {
  if (!id) return undefined;
  const target = REGISTERS[id.register];
  const accent = target?.identity?.accent;
  if (!accent) return undefined;
  const row = (ROWS[id.register] ?? []).find((e) => e.seq === id.seq);
  const hue = row ? Number(row.fields[accent]) : NaN;
  return Number.isFinite(hue) ? hue : undefined;
};

export function boot() {
  const nav: NavEntry[] = Object.values(PAGES)
    .filter((p) => p.nav && p.placed !== false)
    .map((p) => ({
      id: p.page,
      title: p.title,
      href: `/p/${p.page}`,
      section: p.nav!.section,
      order: p.nav!.order,
      icon: iconFor(p.icon, 'doc'),
      hue: hueOf(p.identity),
    }));

  /* OPEN TRACKS IN THE RAIL, under their own heading. A track is a thing you are in the middle of,
     so the whole point is getting back into it — and a thread you have to go and find through a
     list is a thread you stop keeping. Only the open ones, and capped: a rail that grows without
     bound is a rail that stops being a rail. Holding and finished tracks live in the list. */
  const RAIL_TRACKS = 5;
  for (const [n, t] of (ROWS.tracks ?? [])
    .filter((t) => t.fields.state === 'open')
    .slice(0, RAIL_TRACKS)
    .entries())
    nav.push({
      id: `track-${t.seq}`,
      title: String(t.fields.name),
      href: `/t/${t.seq}`,
      section: 'Tracks',
      order: 10 + n,
      icon: 'rows',
    });

  return {
    index: {
      slug: 'the-studio',
      name: 'The Studio',
      locale: 'en',
      registers: Object.values(REGISTERS).map((r) => ({
        id: r.id,
        name: r.name,
        count: (ROWS[r.id] ?? []).length,
        icon: iconFor(r.icon, 'rows'),
      })),
    },
    nav,
    /** Pages that emerged and were never placed. A holding pen, not a decision (19 §3). */
    pen: Object.values(PAGES).filter((p) => p.placed === false),
    me: {
      person: 'you',
      level: 'owner' as const,
      owner: true,
      /* Two, because a switcher over a list of one is a control that can only ever confirm what you
         already know. The second is somebody else's record you have read access to, which is the
         case the level badge exists for. */
      records: [
        { slug: 'the-studio', name: 'The Studio', level: 'owner' as const },
        { slug: 'pell-vine', name: 'Pell & Vine', level: 'read' as const },
      ],
    },
    people: PEOPLE_ACCESS,
    questions: QUESTIONS,
    whatsNew: NEWS,
    sinceCapped: false,
    version: 4192,
    /** Absent means every "Ask BrainDog" affordance is ABSENT, not disabled (23 §8). */
    assistant: false,
  };
}

export type BlockResult = PageBlock & {
  rows: TableRow[];
  columns: Column[];
  /** The rows this block DRAWS: the matched set cut to `limit:`, aligned one-to-one with `rows`. */
  entries: Entry[];
  /**
   * The rows the predicate ADMITTED, uncut.
   *
   * `bar`, `chips` and `gauge` do arithmetic, and arithmetic over the first page of a register is a
   * wrong number rather than a short list: the cut is about how much a reader can take in, and a
   * total is one line however many rows went into it. Every kind that projects a row each reads
   * `entries`; every kind that reduces reads this.
   */
  matched: Entry[];
  /** What the `where:` could not understand, in words. Empty when it understood all of it. */
  refusals: string[];
  total: number;
  drawn: boolean;
  /** Machine-readable, and every block that renders a query result carries one: staleness is a
      TIMESTAMP, not a vibe (19 §6). */
  stale_at: string;
  register?: string | undefined;
  metrics?: Metric[] | undefined;
};

/**
 * The cash walk, shaped as an ordinary table block.
 *
 * Four columns, and the fourth is the reason the walk is drawn at all: the balance after each
 * movement. A list of dated amounts is the same information the register already has; the running
 * figure beside them is what makes it a forecast.
 *
 * The row that crosses carries the `bad` tone, so the eye lands on the day rather than on the
 * biggest number — those are rarely the same row, and the big number is the distraction.
 */
function runwayBlock(b: PageBlock): BlockResult {
  const walk = runway(OPENING, b.limit ? b.limit * 12 : 180);
  const columns = [
    { field: 'day', label: 'When', width: 'minmax(10ch,auto)', align: 'start' as const, truncate: 'end' as const },
    { field: 'what', label: 'What', width: 'minmax(16ch,1fr)', align: 'start' as const, truncate: 'end' as const },
    { field: 'delta', label: 'In and out', width: 'minmax(12ch,auto)', align: 'end' as const, truncate: 'never' as const },
    { field: 'balance', label: 'Balance', width: 'minmax(12ch,auto)', align: 'end' as const, truncate: 'never' as const },
  ];
  const steps = walk.steps.slice(0, b.limit ?? 12);
  return {
    ...b,
    register: undefined,
    columns,
    entries: [],
    matched: [],
    refusals: [],
    rows: steps.map((s, i) => ({
      /* The key is the movement, not the index: two charges on one day from one service are
         different rows, and a keyed list that reuses an index re-renders the wrong one. */
      key: `${s.day}-${s.source}-${s.href}-${i}`,
      cells: [fmtDay(s.day), s.label, money(s.delta, CURRENCY), money(s.balance, CURRENCY)],
      href: s.href,
      /* THE CROSSING IS ONE ROW. Painting every row after it the same colour buries the fact the
         walk exists to produce: the day you go under. Everything after it is still under, which is
         `warn` — a state, not an event. */
      tone: s === walk.crossed ? ('bad' as const) : s.balance < 0 ? ('warn' as const) : undefined,
    })),
    total: walk.steps.length,
    drawn: b.drawn ?? true,
    stale_at: new Date(NOW).toISOString(),
    metrics: undefined,
  };
}

/**
 * Every key a block declaration may carry, so one it cannot is named rather than ignored.
 *
 * A list, not a type check: a declaration arrives as JSON from a pack somebody else wrote, and
 * TypeScript is not there at the moment it is read. `when:` is the one 06 §1.1 documents and this
 * build does not have — an agent writing the doc's own worked example got a block that always drew.
 */
const READS = new Set([
  'kind', 'heading', 'span', 'source', 'where', 'columns', 'cells', 'order', 'limit',
  'target', 'authored', 'empty', 'tone', 'body', 'drawn',
]);

export function page(slug: string): { page: PageDecl; blocks: BlockResult[]; values: Record<string, string> } | null {
  const decl = PAGES[slug];
  if (!decl) return null;

  /**
   * SIX QUERIES, SIX INDEPENDENT FAILURES. The page route states that invariant at the top of its
   * own file, and it was not true of the read underneath it: `readPage` maps every block in one
   * call, so anything that threw in one of them took the whole page with it. A `where:` written as
   * the predicate tree `docs/06-PAGES` §1.1 specifies did exactly that — `.split` on an object —
   * and a page of five correct blocks rendered as nothing at all.
   *
   * A block that throws becomes a block that refuses, in the surface `draw()` already draws. The
   * message is the thrown one because a declaration is written by somebody who can act on it.
   */
  const blocks = decl.blocks.map((b): BlockResult => {
    try {
      return readBlock(b);
    } catch (e) {
      return {
        ...b,
        register: undefined,
        columns: [],
        entries: [],
        matched: [],
        refusals: [`${e instanceof Error ? e.message : String(e)} — this block could not be read`],
        rows: [],
        total: 0,
        drawn: b.drawn ?? true,
        stale_at: new Date(NOW).toISOString(),
        metrics: undefined,
      };
    }
  });

  return { page: decl, blocks, values: values() };
}

function readBlock(b: PageBlock): BlockResult {
  {
    /* A BLOCK MAY BE SOURCED FROM A WALK, NOT ONLY A REGISTER. 05 §2 defers a `forecast` KIND to
       post-v1 and says the primitive layer is what exists so that it can be drawn without one, so
       this adds a source rather than a kind: `forecast.runway` fills an ordinary `table` with the
       cash walk. Nothing about the block is new, and the day a real `forecast` kind ships, the
       declaration that changes is the kind, not the query. */
    if (b.source === 'forecast.runway') return runwayBlock(b);

    const register = b.source?.startsWith('register.') ? b.source.slice('register.'.length) : undefined;
    const all = register ? (ROWS[register] ?? []) : [];
    const { entries: matched, refusals } = register
      ? filterForBlock(register, all, b)
      : { entries: [], refusals: [] };

    /* WHAT THE DECLARATION SAID THAT THIS BUILD DOES NOT READ.
       Three shapes reached here and were answered with an empty block, which is the state reserved
       for "it asked and the answer was nothing":
         - a `source:` that resolves to neither a register nor the walk. 06 §1.1 documents
           `metric.<id>` and `block.<n>` and neither is implemented.
         - a field in `columns:` that the register does not declare. The same typo in `where:` says
           "there is no field called amounnt"; in `columns:` it drew a row of blank cells.
         - a key the type does not carry at all — `when:` is in 06 §1.1 and is not read anywhere.
       All three are the block's own error, so they go where `explain()` goes. */
    const said = [...refusals];
    if (b.source && !register) said.push(`source: ${b.source} — this build reads register.<id> and forecast.runway`);
    if (register) {
      /* `seq` is a column and not a field: it is on the ROW rather than in its fields, and `toRows`
         renders it as `#4`. Any pack may name it, so it belongs in the set a column may resolve to
         even though no register declares it. */
      const declared = new Set(['seq', ...(REGISTERS[register]?.fields ?? []).map((f) => f.id)]);
      for (const c of b.columns ?? [])
        if (!declared.has(c.field)) said.push(`columns: there is no field called ${c.field} on ${register}`);
    }
    for (const key of Object.keys(b))
      if (!READS.has(key)) said.push(`${key}: is not a key this build reads`);
    /* `limit:` is a READING cap, not a query cap: it says how much of the answer fits on the page.
       The kinds that reduce are handed the whole answer (see `matched`), so a sum is a sum. */
    const entries = matched.slice(0, b.limit ?? 50);
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
      entries,
      matched,
      refusals: said,
      rows: toRows(register ?? '', entries, columns),
      total: matched.length,
      drawn: b.drawn ?? true,
      stale_at: new Date(NOW).toISOString(),
      metrics: b.cells?.map((c) => ({ ...metric(c.metric), label: c.label })),
    };
  }
}

/** The mock's stand-in for a compiled `where:`. The real one is one JSON tree, seven consumers. */
function filterForBlock(register: string, entries: Entry[], b: PageBlock): { entries: Entry[]; refusals: string[] } {
  /* THE PREDICATE IS EVALUATED, not pattern-matched. This was five `String.includes` checks, and
     anything outside them passed every row through a filter that looked like it had worked — the
     one failure a declarative surface must not have, because the thing writing most of these
     declarations is an agent and an agent cannot see it. See `where.ts`. */
  /* Compiled ONCE, not per row: resolving fields, dates and enum values against the register is
     work that does not change between rows, and doing it inside the filter made it O(rows). */
  const predicate = b.where ? compile(register, b.where) : null;
  let out = predicate ? entries.filter((e) => matches(e, predicate, NOW)) : entries;

  /* THERE WERE TWO HIDDEN WINDOWS HERE, keyed on register-and-kind: a `timeline` over services
     dropped cancelled rows and anything past ninety days, and a `table` over tasks dropped done and
     dropped ones. The argument was that they are the kind's own default rather than a filter a
     reader chose. The argument is wrong, and it is wrong in the way this file spends most of its
     comments warning about: the same `where:` over the same register returned different rows
     depending on the kind, with nothing in the declaration saying so, and an agent asking a `table`
     for closed tasks got back `total: 0` and its own "nothing matched" sentence.

     Both are now written where they can be read, on the two declarations that wanted them, and both
     produce exactly the row counts the code did — 12 and 11. A default that cannot be seen is not a
     default, it is a second filter.

*/
  const order = b.order?.[0];
  return {
    entries: order ? sortRows(register, out, order.field, order.dir) : out,
    /* CARRIED OUT, not swallowed. A predicate that could not be understood matches nothing, which
       is the safe answer and an invisible one: the block drew a heading over a blank rectangle and
       whoever wrote the declaration — usually an agent — learned nothing. 10 §7's fourth rule is
       that the refusal is the teacher. */
    refusals: predicate ? explain(predicate) : [],
  };
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

export type SearchHit = {
  title: string;
  detail: string;
  href: string;
  kind: string;
  /** The glyph its own register or question type declares, so the palette need not guess. */
  icon: IconName;
  spoken?: string;
};

/**
 * Everything in the record whose title contains what was typed.
 *
 * THE CUT IS TAKEN ACROSS THE SOURCES, NOT INSIDE THE FIRST ONE. This returned from inside the
 * register loop the moment it hit the cap, and the palette asks for eight — so `obligations`, first
 * in declaration order, took the whole budget every time. Measured: `re` returned 8 hits, all
 * Obligations, out of 21 across People, Sessions, Tracks, Updates, Tasks and Decide; `a` returned 8
 * of 82. Typing `re` could not reach a task, and nothing on screen said the list was partial.
 *
 * So every source is collected, then ROUND-ROBINED: one hit from each in turn until the cap. A
 * register with three hundred matching rows now costs the others one slot each rather than all of
 * them, which is the only behaviour that makes a palette over eight registers usable.
 */
export function search(q: string, limit = 24): SearchHit[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];

  const groups: SearchHit[][] = [];

  for (const [id, r] of Object.entries(REGISTERS)) {
    const group: SearchHit[] = [];
    for (const e of ROWS[id] ?? []) {
      const title = String(e.fields[r.title] ?? '');
      if (!title.toLowerCase().includes(needle)) continue;
      group.push({
        title,
        /* The register's own name is the GROUP heading these rows sit under, so repeating it on
           every row said the same word twice, eight times down the list. */
        detail: display(id, r.state ?? '', e.fields[r.state ?? '']) ?? '',
        href: `/r/${id}/${e.seq}`,
        kind: r.name,
        icon: iconFor(r.icon, 'rows'),
        spoken: `#${e.seq}`,
      });
    }
    if (group.length) groups.push(group);
  }

  const questions: SearchHit[] = [];
  for (const q2 of [...QUESTIONS, ...DECIDED])
    if (q2.title.toLowerCase().includes(needle) || q2.id.toLowerCase() === needle)
      questions.push({ title: q2.title, detail: q2.decided ? 'Decided' : 'Open question', href: `/decide/${q2.id}`, kind: 'Decide', icon: 'decide', spoken: q2.id });
  /* Questions FIRST in the rotation: a decision waiting on you is the one thing in the record that
     is about today, and it is the one source that can never be more than a handful of rows. */
  if (questions.length) groups.unshift(questions);

  const hits: SearchHit[] = [];
  for (let round = 0; hits.length < limit; round++) {
    const before = hits.length;
    for (const group of groups) {
      const hit = group[round];
      if (hit) hits.push(hit);
      if (hits.length >= limit) break;
    }
    if (hits.length === before) break;
  }
  return hits;
}

export { AUDIT, INBOX, JOB, NOW, PACKS, PAGES, QUESTIONS, DECIDED, REGISTERS, ROWS, NEWS, TODAY, VAULT, PEOPLE_ACCESS };
