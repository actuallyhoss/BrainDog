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

import { amountOf, currencyOf, mixedFix } from './money.ts';
import type { Column, TableRow } from 'braindog-render/svelte';
import { PATHS, type IconName } from '../ui/icons.ts';
import { copy } from '../copy.ts';
import {
  AUDIT,
  INBOX,
  JOB,
  JOBS,
  VIEWS,
  NOW,
  TODAY,
  PACKS,
  OBSERVED,
  PAGES,
  SUSPENDED,
  PEOPLE_ACCESS,
  QUESTIONS,
  DECIDED,
  REGISTERS,
  ROWS,
  NEWS,
  VAULT,
} from './data.ts';
import { runway } from './forecast.ts';
import { resolvePages } from './pages.ts';
import { compile, explain, matches } from './where.ts';
import { METRICS } from './declared.ts';
import { findingsFrom } from '@braindog/kernel';
import { meetsTarget, read, targetLine, withParam } from './metrics.ts';
import { REDUCES } from './schema.ts';
import type { Entry, Filter, FieldDecl, Job, PackInfo, PageBlock, PageDecl, RegisterDecl } from './schema.ts';

/**
 * The currency the rows of one money field are in, or `null` when they are not all one.
 *
 * THIS REPLACED A CONSTANT, and the constant was the bug. `CURRENCY = 'GBP'` was pinned to every
 * money value on every screen, so a euro invoice would have rendered as sterling — the right digits
 * under the wrong code, on the one kind of figure somebody acts on. A currency is a property of a
 * VALUE; this function exists only for the places that need one when there is no value yet, like an
 * empty field on a form, and it answers from the rows rather than from a preference.
 */
export function currencyFor(register: string, field: string): string | null {
  const seen = new Set<string>();
  for (const row of ROWS[register] ?? []) {
    const c = currencyOf(row.fields[field]);
    if (c) seen.add(c);
    if (seen.size > 1) return null;
  }
  return [...seen][0] ?? null;
}

/**
 * The cash the walk starts from, in minor units.
 *
 * A STAND-IN, and it is named up here so that it reads as one. The record does not hold a bank
 * balance yet, and a runway seeded from a number nobody declared is a forecast that looks like a
 * fact. When an account row exists this becomes a lookup and nothing else changes.
 */
/**
 * The `forecast.runway` block the record declares, or `null`.
 *
 * ONE DECLARATION, READ BY BOTH. The tile and the block were two walks over two openings, and the
 * only way two figures about one future stay in step is for there to be one of them.
 */
const declaredWalk = (): PageBlock | null => {
  for (const decl of Object.values(PAGES)) for (const b of decl.blocks) if (b.source === 'forecast.runway') return b;
  return null;
};

/** One locale for collation, so a list is in the same order for everybody looking at one record. */
const LOCALE = 'en-GB';

/* ── what the record noticed, on the screen it is about ──────────── */

/**
 * What this record has noticed about one register, if anything has crossed.
 *
 * THE MOST SOPHISTICATED MECHANISM IN THE PRODUCT WAS INVISIBLE. Nine signals, four detectors whose
 * counts come from the rule of three, a dispersion requirement on each because a burst is not a
 * pattern, a weekly analyser with four governors and a self-suspending brake — and the interface
 * never emitted a signal, never read a finding and never showed one. The person it exists for could
 * not tell it was there.
 *
 * IT GOES WHERE IT IS ABOUT. `write.refused` carries `<register>.<field>:<code>`, which is a PLACE:
 * the grid where somebody keeps being refused. A findings screen somewhere else would be a second
 * inbox; a line above the rows they are already failing at is the record saying "this keeps
 * happening" at the moment they are doing it.
 *
 * THE THRESHOLDS ARE THE KERNEL'S, applied by `findingsFrom`. A screen with its own copy of them is
 * a screen that says a pattern has been reached while the analyser proposes nothing.
 */
export type Noticed = {
  /** The field it keeps happening on, as a place on this screen. */
  field: { id: string; label: string } | null;
  /** The refusal code, kept whole — it is what an operator greps for. */
  code: string;
  n: number;
  days: number;
  window: string;
  /** The kernel's own sentence, verbatim, for the title and for anyone reading the analysis. */
  why: string;
  /** What to do about it, in one clause. */
  fix: string;
};

/**
 * What one refusal code means for whoever keeps hitting it.
 *
 * THE CODE IS FOR THE OPERATOR AND THE CLAUSE IS FOR THE PERSON. `ENUM_VALUE_UNKNOWN` names the
 * mechanism exactly and tells a bookkeeper nothing; showing only the friendly sentence would leave
 * the person supporting them nothing to search. Both, so neither reader is the one it was not
 * written for.
 *
 * AN UNKNOWN CODE IS NOT A BLANK. A refusal this table has not met yet still crossed a threshold
 * twelve times, and the honest line says so rather than drawing an empty strip.
 */
const FIXES: Readonly<Record<string, string>> = {
  ENUM_VALUE_UNKNOWN: 'the value being written is not one this field declares — either widen the field or fix what writes it',
  REQUIRED_MISSING: 'something keeps arriving without it — either it is not really required, or whatever sends these rows never had it',
  TYPE_MISMATCH: 'what arrives is not the shape this field declares',
  REF_NOT_FOUND: 'the row it points at is not in this record yet',
  OUT_OF_BOUNDS: 'the value is outside the range this field declares',
  IMMUTABLE: 'this field is settled once written, and something keeps trying to change it',
};

/**
 * What this record has noticed about one register, if anything has crossed.
 *
 * THE MOST SOPHISTICATED MECHANISM IN THE PRODUCT WAS INVISIBLE. Nine signals, four detectors whose
 * counts come from the rule of three, a dispersion requirement on each because a burst is not a
 * pattern, a weekly analyser with four governors and a self-suspending brake — and the interface
 * never emitted a signal, never read a finding and never showed one. The person it exists for could
 * not tell it was there.
 *
 * IT GOES WHERE IT IS ABOUT. `write.refused` carries `<register>.<field>:<code>`, which is a PLACE:
 * the grid where somebody keeps being refused. A findings screen somewhere else would be a second
 * inbox nobody opens; a line above the rows they are already failing at is the record saying "this
 * keeps happening" at the moment they are doing it.
 *
 * THE THRESHOLDS ARE THE KERNEL'S, applied by `findingsFrom` and never re-stated here. A screen
 * with its own copy of them is a screen that announces a pattern while the analyser proposes
 * nothing, which reads as the product being wrong about itself.
 *
 * ONE, NOT ALL OF THEM. `findingsFrom` sorts by how far past its own threshold each finding is, so
 * the first is the worst; a strip listing four is a second inbox again.
 *
 * AND NOTHING AT ALL WHILE THE ANALYSER IS SUSPENDED. A crossed threshold is not the whole test:
 * `analyse()` has four governors and a brake in front of it, and on a record under a fortnight old,
 * or one with three questions already open, or one whose proposals keep coming back wrong, the
 * threshold is crossed and no proposal is ever coming. Drawing the strip there is the exact failure
 * this function was written to avoid — a screen announcing a pattern while the analyser proposes
 * nothing — with the governors rather than the thresholds as the thing it forgot to ask.
 *
 * IT IS A PARAMETER because the live app will hand it `analyse().suspended` from the record itself.
 * The default is the fixture, so the mock reads the same way the product will.
 */
export function noticed(register: string, suspended: string | null = SUSPENDED): Noticed | null {
  if (suspended !== null) return null;
  const prefix = `${register}.`;
  const first = findingsFrom(OBSERVED).find((f) => f.signal === 'write.refused' && f.subject.startsWith(prefix));
  if (!first) return null;

  const [id = '', code = ''] = first.subject.slice(prefix.length).split(':');
  const field = decl(register, id);
  return {
    field: field ? { id, label: labelOf(field) } : null,
    code,
    n: first.n,
    days: first.days,
    window: first.window,
    why: first.why,
    fix: FIXES[code] ?? 'the record has been refusing these and nobody has looked at why',
  };
}

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
/** Money when the walk knows its currency, and the bare integer when there is nothing to say. */
const moneyOr = (minor: number, currency: string | null): string => (currency === null ? integer(minor) : money(minor, currency));

/** What a `duration`'s declared unit is worth in the seconds the record stores. */
const SECONDS: Record<string, number> = { s: 1, m: 60, h: 3_600, d: 86_400, w: 604_800 };

export function display(register: string, field: string, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const f = decl(register, field);
  if (!f) return String(value);
  switch (f.type) {
    case 'money': {
      /* THE VALUE CARRIES ITS OWN CURRENCY. A money field that came back as a bare number is a row
         written before the field was money, or a caller that dropped half the value — either way the
         honest answer is the digits with no code rather than the digits under a guessed one. */
      const c = currencyOf(value);
      const a = amountOf(value);
      if (a === null) return null;
      return c === null ? integer(a) : money(a, c);
    }
    case 'day':
      return `${fmtDay(String(value))}`;
    case 'instant':
      return relative(String(value).slice(0, 10), NOW);
    case 'int':
      return integer(Number(value));
    case 'duration': {
      /* SECONDS IN, THE DECLARED UNIT OUT. The record holds one unit and the field says how to say
         it, which is the only arrangement in which two durations can be added: `0.2` on its own is
         a number of something, and adding it to `3` needs both to have meant the same thing. */
      const seconds = Number(value);
      if (!Number.isFinite(seconds)) return String(value);
      const unit = f.unit ?? 's';
      const per = SECONDS[unit] ?? 1;
      return `${(seconds / per).toLocaleString('en-GB', { maximumFractionDigits: 3 })} ${unit}`;
    }
    case 'decimal': {
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
  for (const f of r.fields) if (f.index) wanted.add(f.id);

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
/**
 * What a row's state and its deadline say about it: `good`, `bad`, or nothing.
 *
 * EXPORTED BECAUSE THE CARD NEEDS IT TOO. The grid has drawn this as a bar down the leading edge
 * since it was written, and below 640px the grid does not exist — so on a phone an overdue invoice
 * and a paid one were the same card, on the surface where somebody is most likely to be looking for
 * exactly that difference.
 */
export function toneOf(register: string, e: Entry): TableRow['tone'] {
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

/* `Filter` LIVES IN `schema.ts` NOW, and is re-exported here so every existing caller is unchanged.
   It is a SHAPE rather than a reader, and `data.ts` needs it to declare a saved view — which it
   cannot import from this file, because this file imports it. */
export type { Filter };

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
        : /* `not-in`, so a URL can say everything the SENTENCE can. Without it a declared metric
             whose predicate negates — `state is not cancelled` — had no link that opened its own
             rows, and the alternative was writing out the enum's complement, which breaks the
             moment a pack adds a value to it. */
          f.op === 'not-in'
          ? `${f.field} is not ${f.values.join(' or ')}`
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
    /* MONEY IS AN OBJECT, and `{} < {}` is false both ways round — so a column of money sorted into
       whatever order the rows arrived in, which looks exactly like a sort that worked. Within one
       currency it compares by magnitude; across two it groups by code first, because there is no
       order between them and pretending otherwise is the same lie as adding them. */
    const mx = amountOf(x);
    const my = amountOf(y);
    if (mx !== null && my !== null) {
      const cx = currencyOf(x) ?? '';
      const cy = currencyOf(y) ?? '';
      if (cx !== cy) return cx.localeCompare(cy) * sign;
      return (mx - my) * sign;
    }
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

/**
 * A figure, read from its DECLARATION.
 *
 * This was a twelve-case `switch` with `const KILN = 1` inside it, which is why there was exactly
 * one project page and why `stat` was unusable on any page an agent writes. The documents are in
 * `declared.ts` and the evaluator is in `metrics.ts`; what is left here is the two figures the
 * record computes rather than stores, and the translation from a reading into a tile.
 *
 * The NOTE is the target and the comparison, which is what 08 §2.2 says a figure is for: "EGP
 * 6,240,000 · target ≤ 5,000,000 · up 18% on the 30 days before it" is three facts and the second
 * is the one you act on. A bare figure is a number you look at.
 */
export function metric(id: string): Metric {
  /* THE RUNWAY, the only figure in the product that is about the future, and 08 §2.3's `running`
     aggregation — a cumulative reducer with a stop condition. It seeds from what is liquid, applies
     every dated movement in order, and reports the first day the balance goes under, with the row
     that did it: "you run out on 14 November" is a number you look at, and "the Fenwick renewal is
     what does it" is one you act on.

     AND IT WALKS WHAT THE PAGE DECLARES. The tile used a module constant of GBP 42,000 while the
     Money page's own `forecast.runway` block said GBP 5,000 — two figures about the same future,
     8.4 times apart, neither saying which balance it rested on. There is one declaration now, and
     the note says the figure it starts from. */
  if (id === 'runway') {
    const block = declaredWalk();
    const walk = runway(block?.opening ?? 0, block?.from ?? []);
    if (!walk.crossed)
      return {
        id,
        label: 'Runway',
        value: `Over ${walk.horizon} days`,
        note: `nothing dated takes ${money(walk.from, walk.currency ?? 'GBP')} under`,
        tone: 'good',
        href: '/p/money',
      };
    return {
      id,
      label: 'Runway',
      value: `${walk.days} days`,
      note: `${fmtDay(walk.crossed.day)} · ${walk.crossed.label}`,
      tone: walk.days !== null && walk.days < 45 ? 'bad' : 'warn',
      href: walk.crossed.href,
    };
  }

  if (id === 'open-questions')
    return {
      id,
      label: 'Open questions',
      value: String(QUESTIONS.length),
      /* A LITERAL THAT `targetLine` WOULD HAVE WRITTEN. Every other target on every other tile went
         from `target ≤ X` to a sentence; this one is typed out here, so it stayed — on `/decide`,
         which `19 §2` names as one of the three spine screens. */
      note: targetLine({ format: 'int', target: { lte: 3 } } as Parameters<typeof targetLine>[0]),
      tone: QUESTIONS.length > 3 ? 'warn' : 'good',
      href: '/decide',
    };

  /* `project-owed:Kiln` — the document, and the thing it is about. The parameter is everything after
     the FIRST colon, because a project can be called anything and a name with a colon in it is a
     name, not two ids. */
  const at = id.indexOf(':');
  const base = at === -1 ? id : id.slice(0, at);
  const template = METRICS[base];
  if (!template)
    return { id, label: id, value: MISSING, note: 'no metric is declared under that name', tone: 'warn', href: '/p/money' };
  const decl = at === -1 ? template : withParam(template, id.slice(at + 1));

  const reading = read(decl);
  /**
   * A FIGURE THAT CANNOT BE WORKED OUT SAYS SO, IN THE TERMS OF THIS SCREEN.
   *
   * `reading.refusals` are written for whoever wrote the DECLARATION: "group_by: is published in 08
   * and not read by this build", "target takes a number in the figure's own units — { lte: 400000 }
   * for money in minor units, not { lte: { amount, currency } }". Those are the right sentences and
   * they were printed under a headline figure on the Home screen — `08` is a document number, `this
   * build` is the software talking about itself, and there is no control anywhere in this app that
   * edits a metric.
   *
   * THE AUTHOR'S SENTENCE IS NOT LOST. It is what `/p/*`'s degraded block prints, beside the
   * declaration, where there is somebody who can act on it. Here the note says the fact and points
   * at the pack that owns the figure, which is the one move available to the person reading it.
   */
  if (reading.refusals.length)
    return {
      id,
      label: decl.name,
      value: MISSING,
      note: copy.figureUnavailable,
      tone: 'warn',
      /* THE PACK IS WHERE A FIGURE IS DECLARED, and it is the only screen in this product that has
         anything to say about one. A tile that cannot be worked out linking to the money page —
         which is where it is already — was a link back to itself. */
      href: '/packs',
    };

  const met = meetsTarget(decl, reading.value);
  /* The delta reads as a MOVEMENT and not as a sign: "up 18% on the 30d before" is a sentence, and
     `+18%` beside a target is two numbers a reader has to tell apart. */
  /* AND AN ABSENT COMPARISON SAYS SO. `19 §6`: a surface showing nothing must never be
     indistinguishable from a surface with nothing to show — and three of the four tiles on the money
     page carried no movement and no explanation, which reads as "this has not moved" when every one
     of them declares a window. */
  const move =
    reading.delta === null
      ? reading.unmeasured
        ? ` · ${reading.unmeasured}`
        : ''
      : ` · ${reading.delta >= 0 ? 'up' : 'down'} ${Math.abs(reading.delta * 100).toFixed(0)}% ${reading.why}`;

  return {
    id,
    label: decl.name,
    value: reading.shown,
    note: `${targetLine(decl)}${move}`,
    tone: met === null ? undefined : met ? 'good' : 'warn',
    href: reading.href,
  };
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

/**
 * Every page there is, which is not the same as every page DECLARED.
 *
 * A declaration carrying `for:` is a template and becomes one page per row it admits — four
 * projects over one `project` declaration, where before there was a `kiln` page and no way to have
 * a second. Resolved on read rather than cached, because the rows it depends on are the record.
 */
export const pages = (): Record<string, PageDecl> => resolvePages(PAGES);

export function boot() {
  const nav: NavEntry[] = Object.values(pages())
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
        /**
         * THE SAVED VIEWS OF THIS LIST, which appeared in no navigation at all.
         *
         * Two views existed in the record and the rail held zero `/v/` links, while the keyboard
         * sheet documented `⌥V` as "Save the filter as a view" — so the product taught somebody to
         * make a thing and then never showed it to them again. The palette found them, and the
         * palette is labelled "Search, or run a command".
         *
         * UNDER THE LIST THEY FILTER, because that is what one IS: the same rows with a predicate.
         * A section of its own would be a second place to look for a list.
         */
        views: Object.entries(VIEWS)
          .filter(([, v]) => v.register === r.id)
          .map(([key, v]) => ({ key, name: v.name })),
      })),
    },
    nav,
    /** Pages that emerged and were never placed. A holding pen, not a decision (19 §3). */
    pen: Object.values(pages()).filter((p) => p.placed === false),
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

/**
 * How many rows a register holds at all.
 *
 * NOT HOW MANY A PREDICATE MATCHED, which is what every other count on this page is. `19 §6` names
 * five empty states and says collapsing them into one is the failure — and telling "your filter
 * matched nothing" from "there is nothing here yet" needs exactly this number.
 */
export const heldBy = (register: string): number => (ROWS[register] ?? []).length;

/**
 * What installing a pack would add, derived from the record rather than typed.
 *
 * `04 §3` IS THE TRUST MODEL AND IT IS THE REASON A PACK MAY NOT CONTAIN CODE: "A pack is readable
 * text, so a truthful diff is possible — this is the entire trust model. You cannot diff a binary's
 * intentions." So the one screen that carries that promise had better be true.
 *
 * IT WAS A TEMPLATE STRING WITH THREE THINGS WRONG WITH IT. `+ register.things  1 field(s) added`:
 * the internal id for a list the rail calls Projects; `${pack.registers.length}` — a count of
 * REGISTERS — printed as a count of FIELDS, so all five installed packs said "1 field(s)" while
 * Obligations declares eight; and `+ page.— placed in nav`, the em-dash fallback for a pack with no
 * page, rendered as though `—` were a page about to be put in somebody's sidebar. Under it, a
 * paragraph explaining how nav ordering works — `23 §7`: never write a sentence explaining the
 * interface.
 *
 * SEVEN SECTIONS, AND ONLY THE ONES THAT SAY SOMETHING. `04 §3`'s diff is
 * `adds · changes · conflicts · seeds · spawns · calls_out · touches`, and three of them are
 * guarantees rather than findings: a pack physically cannot read a row at install time, so
 * "0 rows read" is a fact about the mechanism and not about this pack. Those are stated. `changes`
 * is stated only when there IS one, because `06 §1` is that a warning which does not apply teaches
 * people to ignore warnings.
 *
 * WHAT IS NOT KNOWN IS SAID AS NOT KNOWN. A pack this record has not installed declares registers
 * and pages this record does not have, so there is no field count to give and inventing one would
 * be the same lie in a new place. It gets the names it declares and a line saying the shape arrives
 * with the file.
 */
export type PackDiff = {
  adds: { kind: 'list' | 'page'; name: string; detail: string | null }[];
  /** A nav move this pack would make to a page it does not own. Shown, never applied (04 §4). */
  changes: string[];
  conflicts: string[];
  seeds: string;
  touches: string;
  /** True when the pack is not installed, so the counts are unknown rather than zero. */
  unread: boolean;
};

export function packDiff(pack: PackInfo): PackDiff {
  const adds: PackDiff['adds'] = [];

  for (const id of pack.registers) {
    /* A NAME THAT COLLIDES IS NOT AN ADD. It is the reason the install does not happen, and it has
       its own section; listing it under ADDS as well — with the EXISTING list's field count, since
       that name resolves — would say the pack brings you a Services you already have. */
    if (pack.conflicts?.includes(id)) continue;
    const decl = REGISTERS[id];
    adds.push(
      decl
        ? { kind: 'list', name: decl.name, detail: `${decl.fields.length} ${decl.fields.length === 1 ? 'field' : 'fields'}` }
        /* THE KIND IN WORDS WHEN THERE IS NO COUNT, because the glyph beside it is decorative and a
           screen reader would otherwise hear three bare nouns with nothing saying which is which. */
        : { kind: 'list', name: pack.titles?.[id] ?? id, detail: 'a list' },
    );
  }

  for (const id of pack.pages) {
    const decl = PAGES[id];
    adds.push(
      decl
        ? {
            kind: 'page',
            name: decl.title,
            detail: [
              `${decl.blocks.length} ${decl.blocks.length === 1 ? 'block' : 'blocks'}`,
              /* WHERE IT LANDS IN THE RAIL, which is the half somebody actually checks. A pack may
                 place a page it owns; `04 §4` is that it may never move yours. */
              decl.nav ? `${decl.nav.section} section` : 'not in your sidebar',
            ].join(' · '),
          }
        : { kind: 'page', name: pack.titles?.[id] ?? id, detail: 'a page' },
    );
  }

  /* `04 §4`: a pack may place a page it OWNS and may never move yours, and an update that would is
     shown and then ignored. Named by title, because the reader is being asked about their own
     sidebar rather than about a declaration. */
  const changes = (pack.moves ?? []).map((m) => {
    const decl = PAGES[m.page];
    return `${decl?.title ?? m.page} would move from ${m.from} to ${m.to} in the ${decl?.nav?.section ?? 'sidebar'} section`;
  });

  /* A NAME THIS RECORD ALREADY HAS. `02 §1`: a register the kernel or another pack ships is a name
     no pack can own, and the install is refused rather than merged — so this is the one section on
     the screen that means "you cannot have this", not "here is what would happen". */
  const conflicts = (pack.conflicts ?? []).map((id) => {
    const decl = REGISTERS[id];
    const owner = PACKS.find((p) => p.installed && p.registers.includes(id));
    return `${decl?.name ?? id} already exists${owner ? `, from ${owner.name}` : ''}`;
  });

  return {
    adds,
    changes,
    conflicts,
    /* `04 §3.2`: seeds get their own line, are marked `example`, and are clearable in one undoable
       action. It is a WRITE, and the trust screen was untrue for as long as it claimed otherwise. */
    seeds: '1 example row, marked example, clearable in one action',
    /* AND THIS ONE IS A GUARANTEE, not a measurement. `04 §3.2`: "A pack physically cannot read a
       row at install time, so \"0 rows read\" is a guarantee." */
    touches: 'nothing you have written — 0 rows read, 0 of your rows changed',
    unread: !pack.installed,
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
  /**
   * HOW MANY OF THE ANSWER THIS BLOCK IS SHOWING, against `total`.
   *
   * It is not `entries.length` and it is not `rows.length`, and the surface that said "Showing 0 of
   * 58" over thirteen visible rows had used both. A `forecast.runway` block has no `entries` — a
   * step of a cash walk is not a register row — and its `rows` carry a fourteenth that is not a
   * step: the opening balance, which is a header wearing a row's clothes.
   *
   * So the count is stated by whoever builds the block, in the unit the block's own total is in.
   */
  shown: number;
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
  /* THE DECLARATION, NOT A CONSTANT. This read a module-level `OPENING` of GBP 42,000 while its own
     page said GBP 5,000 — so the tile and the block it sat beside disagreed by 8.4 times, in the
     one figure this product computes about the future. A block with no `opening:` gets none, and
     the walk says so rather than inventing a balance. */
  /* HOW FAR AHEAD IS A BUSINESS QUESTION; `limit:` IS A SCREEN QUESTION.
     
     This read `b.limit ? b.limit * 12 : 180`, so the horizon was twelve times however many rows fit
     on the page — 144 days for a block declaring twelve — while the block's own `empty:` sentence
     read "Nothing dated in the next six months." Two answers to how far the forecast looks, in one
     declaration, and neither was the `horizon:` key `PageBlock` has always carried and nothing read.
     
     It mattered the moment the block started stating its total: "12 of 58" where 58 was movements
     inside a window derived from a row count. */
  const walk = runway(b.opening ?? 0, b.from ?? [], b.horizon);
  const columns = [
    { field: 'day', label: 'When', width: 'minmax(10ch,auto)', align: 'start' as const, truncate: 'end' as const },
    { field: 'what', label: 'What', width: 'minmax(16ch,1fr)', align: 'start' as const, truncate: 'end' as const },
    { field: 'delta', label: 'In and out', width: 'minmax(12ch,auto)', align: 'end' as const, truncate: 'never' as const },
    { field: 'balance', label: 'Balance', width: 'minmax(12ch,auto)', align: 'end' as const, truncate: 'never' as const },
  ];
  const steps = walk.steps.slice(0, b.limit ?? 12);
  /* A WALK THE RECORD CANNOT MAKE IS A SENTENCE, not an empty table. A cash walk over two currencies
     produces a crossing day that looks real and is invented. */
  const refusals = walk.mixed.length ? [`The cash walk needs one currency: ${mixedFix(walk.mixed)}.`] : [];
  return {
    ...b,
    register: undefined,
    columns,
    entries: [],
    matched: [],
    refusals,
    shown: steps.length,
    rows: [
      /* THE OPENING IS A ROW, because every balance under it is that number plus a movement. It was
         nowhere on the screen: the first row read "In and out −9,190.00 · Balance −4,190.00", which
         only adds up if you already know the walk started at 5,000 — and the red "RUNWAY 0 days"
         headline above it is derived from the same invisible figure. A forecast whose arithmetic
         cannot be checked from the screen is a number somebody has to trust. */
      ...(walk.mixed.length
        ? []
        : [
            {
              key: 'opening',
              cells: [fmtDay(new Date(NOW).toISOString().slice(0, 10)), 'What is liquid today', '', moneyOr(walk.from, walk.currency)],
              href: undefined,
              tone: undefined,
            },
          ]),
      ...steps.map((s, i) => ({
      /* The key is the movement, not the index: two charges on one day from one service are
         different rows, and a keyed list that reuses an index re-renders the wrong one. */
      key: `${s.day}-${s.source}-${s.href}-${i}`,
      cells: [fmtDay(s.day), s.label, moneyOr(s.delta, walk.currency), moneyOr(s.balance, walk.currency)],
      href: s.href,
      /* THE CROSSING IS ONE ROW. Painting every row after it the same colour buries the fact the
         walk exists to produce: the day you go under. Everything after it is still under, which is
         `warn` — a state, not an event. */
      tone: s === walk.crossed ? ('bad' as const) : s.balance < 0 ? ('warn' as const) : undefined,
      })),
    ],
    total: walk.steps.length,
    drawn: b.drawn ?? drawnWhen(b),
    stale_at: new Date(NOW).toISOString(),
    metrics: undefined,
  };
}

/**
 * Whether a block's `when:` is satisfied, given the figure it names.
 *
 * A FIGURE THAT CANNOT BE READ DOES NOT DRAW THE BLOCK. The alternative — drawing it anyway — is
 * how a red note about an overdue invoice appears on a record with no invoices at all, which is the
 * one thing a `when:` exists to prevent. A block with no `when:` always draws.
 */
function drawnWhen(b: PageBlock): boolean {
  if (!b.when) return true;
  /* A `when:` NAMING A FIGURE NOBODY DECLARED DOES NOT DRAW. It is the same answer as a figure that
     cannot be computed, and for the same reason: the block's condition is unknown, and drawing on
     an unknown is guessing. */
  const decl = METRICS[b.when.metric];
  if (!decl) return false;
  const reading = read(withParam(decl, b.when.metric));
  if (reading.value === null) return false;

  const v = reading.value;
  if (b.when.gt !== undefined) return v > b.when.gt;
  if (b.when.gte !== undefined) return v >= b.when.gte;
  if (b.when.lt !== undefined) return v < b.when.lt;
  if (b.when.lte !== undefined) return v <= b.when.lte;
  if (b.when.is !== undefined) return v === b.when.is;
  if (b.when.not !== undefined) return v !== b.when.not;
  /* A CONDITION WITH NO TEST IN IT IS NOT A CONDITION, and drawing the block would be guessing that
     the author meant "always". They meant something; the block waits until they say what. */
  return false;
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
  'target', 'authored', 'empty', 'tone', 'body', 'drawn', 'when', 'opening', 'from', 'horizon',
]);

export function page(slug: string): { page: PageDecl; blocks: BlockResult[]; values: Record<string, string> } | null {
  const decl = pages()[slug];
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
        shown: 0,
        total: 0,
        drawn: b.drawn ?? drawnWhen(b),
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
      /* A KIND THAT REDUCES DRAWS THE WHOLE ANSWER, so it is never showing a slice of it. `bar`,
         `chips` and `gauge` iterate `matched` — every row — and apply `limit:` to their GROUPS; this
         counted `entries` for every kind alike, so the first author to write `limit: 5` on a bar
         over 38 rows would have got "Showing 5 of 38" above a chart containing all 38. No block in
         the seed declares one, which is the only reason it is not on screen today. */
      shown: REDUCES.has(b.kind) ? matched.length : entries.length,
      total: matched.length,
      drawn: b.drawn ?? drawnWhen(b),
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

export { AUDIT, INBOX, JOB, JOBS, NOW, PACKS, PAGES, QUESTIONS, DECIDED, REGISTERS, ROWS, NEWS, TODAY, VAULT, VIEWS, PEOPLE_ACCESS };

/**
 * One run, by the id in the address — or `null`, which is a MISS and not a failure.
 *
 * THE ROUTE IGNORED ITS OWN PARAMETER. `/jobs/9` and `/jobs/anything` rendered the same screen with
 * the same fixture under a header printing that fixture's id, so the `[id]` segment was decoration.
 * A route whose segment means nothing is one that gets linked wrongly the first time it is linked.
 */
export const job = (id: string): Job | null => JOBS[id] ?? null;
