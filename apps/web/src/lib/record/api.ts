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

import { day as fmtDay, diffRows, money, relative, since, integer, MISSING } from 'braindog-render';

import { amountOf, currencyOf, homeOf, mixedFix } from './money.ts';
import type { Column, TableRow } from 'braindog-render/svelte';
import { answers, terms, tokensOf, why } from './find.ts';
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
  AUTH_METHODS,
  DEPLOYMENT,
  DEVICES,
  TOKENS,
  PACKS,
  OBSERVED,
  PAGES,
  SUSPENDED,
  PASSKEYS,
  PEOPLE_ACCESS,
  SNAPSHOTS,
  SNAPSHOTS_KEPT,
  SIGNING_KEY,
  SOURCES,
  QUESTIONS,
  DECIDED,
  REGISTERS,
  ROWS,
  NEWS,
  SERIES,
  VAULT,
} from './data.ts';
/* Type only, and there is no cycle: `remote.ts` reads the declaration and the sample, never this file. */
import type { Names } from './remote.ts';
import { runway } from './forecast.ts';
import { resolvePages } from './pages.ts';
import { compile, declaredValue, explain, matches } from './where.ts';
import { METRICS } from './declared.ts';
import { STALE_MS, barsOf, findingsFrom, isStale, type Bars, type SeriesLine } from '@braindog/kernel';
import { meetsTarget, noteOf, read, targetLine, windowMs, withParam } from './metrics.ts';
import { REDUCES } from './schema.ts';
import type { Entry, Fields, Filter, FieldDecl, Job, PackInfo, PageBlock, PageDecl, RegisterDecl } from './schema.ts';
import type { CallOut } from './actions.ts';

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
 * The currency most of this record's money is in, which a screen writes with its symbol alone.
 * A function, not a constant: `ROWS` is declared later in this module and read through an import
 * cycle, so computing it at load threw before `ROWS` existed and took sixteen test files with it.
 */
let home: string | null | undefined;
export const homeCurrency = (): string | null =>
  (home ??= homeOf(Object.values(ROWS).flatMap((rows) => rows.flatMap((e) => Object.values(e.fields)))));

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
/**
 * What a cash walk starts from, as the record reads it: a typed number, or a declared figure's reading.
 *
 * `{ metric }` keeps the walk and the Cash now tile on one declaration. A figure that cannot be read
 * leaves the walk with no opening and says why, rather than walking from zero.
 */
export function openingOf(opening: PageBlock['opening']): { value: number | null; unit: string | null; refusal?: string } {
  if (typeof opening === 'number') return { value: opening, unit: null };
  if (!opening || typeof opening !== 'object' || typeof opening.metric !== 'string') return { value: null, unit: null };
  const decl = METRICS[opening.metric];
  if (!decl) return { value: null, unit: null, refusal: `There is no metric called ${opening.metric} for the walk to start from.` };
  const reading = read(decl);
  if (reading.refusals.length) return { value: null, unit: null, refusal: reading.refusals[0]! };
  return { value: reading.value ?? 0, unit: currencyOfFormat(decl.format) };
}

/** `money.GBP` is sterling; any other format is not a currency. */
const currencyOfFormat = (format: string | undefined): string | null => (format?.startsWith('money.') ? format.slice('money.'.length) : null);

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
  ENUM_VALUE_UNKNOWN: 'the value being saved is not one this field allows. Either widen the field or fix what writes it',
  REQUIRED_MISSING: 'something keeps arriving without it. Either it is not really required, or whatever sends these rows never had it',
  TYPE_MISMATCH: 'what arrives is not the shape this field allows',
  REF_NOT_FOUND: 'the row it points at is not in this record yet',
  OUT_OF_BOUNDS: 'the value is outside the range this field allows',
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

/** WHAT A REGISTER SAYS A FIELD IS. Exported because the live path has to ask the same question
   the sample path asks, and answering it twice is how the two came to disagree. */
export const decl = (register: string, field: string): FieldDecl | undefined =>
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

/**
 * `now` IS THE RECORD'S INSTANT, and it defaults to the seed's. A screen reading a real record passes
 * the one `boot` answered with, so an `instant` is banded against the day the record thinks it is.
 */
export function display(
  register: string,
  field: string,
  value: unknown,
  now: number = NOW,
  names?: Names,
): string | null {
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
      /**
       * `since`, NOT A DAY WITH THE TIME CUT OFF.
       *
       * This was `relative(String(value).slice(0, 10), NOW)` — the truncation every caller in the
       * app had learned to write, because `relative()` takes a day and hands back its argument when
       * given anything else. So the miss was hidden and the time went with it: `session.last_seen`
       * and `updates.at` are instants, and a run seen two hours ago and one seen eleven hours
       * ago both read *today*. One formatter, on the one function every cell goes through.
       */
      return since(String(value), now);
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
      /* THE DECLARED LABEL, where the value has one: `owed_to_me` reads Money in. */
      return f.labels?.[String(value)] ?? String(value).replace(/_/g, ' ');
    case 'ref': {
      /**
       * A LIVE ROW IS NEVER NAMED FROM THE SAMPLE.
       *
       * `names` holds the record's own title for every row a ref on this screen points at, gathered
       * by the same walk that turned the stored ULID into this number. Where it is given it is the
       * ONLY source: a number the record did not name draws as `<list>#<number>`, which is a row
       * somebody can open, rather than as whatever the built-in sample happens to call that number.
       */
      if (names) return names.get(`${f.to}#${value}`) ?? `${f.to}#${value}`;
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

/** One row's identity, from its own fields, when its register declares one. The sample's rows and a record's are read alike. */
export function identityOfRow(register: string, fields: Readonly<Record<string, unknown>>): Identity | null {
  const target = REGISTERS[register];
  if (!target?.identity) return null;
  const lane = target.state ? String(fields[target.state] ?? '') : '';
  return {
    mark: String(fields[target.identity.mark] ?? '●'),
    hue: Number(fields[target.identity.accent] ?? 0),
    name: String(fields[target.title] ?? ''),
    // A retired row is achromatic. It still has a mark; it no longer has a claim on a hue.
    retired: lane === 'retired' || lane === 'parked',
  };
}

/**
 * `names` IS WHAT SAYS THE ROW CAME FROM A RECORD, as it is for `display`. Given, it is the only source: a ref the
 * record did not name has no mark, rather than the mark and name the built-in sample gives that number.
 */
export function identityOf(register: string, field: string, value: unknown, names?: Names): Identity | null {
  const f = decl(register, field);
  if (!f || f.type !== 'ref' || !f.to) return null;
  if (!REGISTERS[f.to]?.identity) return null;
  if (names) return names.marks?.get(`${f.to}#${value}`) ?? null;
  const row = (ROWS[f.to] ?? []).find((e) => e.seq === Number(value));
  return row ? identityOfRow(f.to, row.fields) : null;
}

/**
 * THE THING A ROW BELONGS TO, WITHOUT BEING TOLD WHICH FIELD HOLDS IT.
 *
 * `identityOf` answers about a NAMED field, which is what a cell needs: the caller is drawing the
 * `thing` column and wants the mark for the value in it. A row's leading glyph has no field to
 * name. It wants the answer to a different question, "what is this row about", and until now
 * nothing could ask it.
 *
 * The comment two hundred lines above this one says the rule out loud: *"One mark and one accent
 * per thing, and colour means WHICH PROJECT, everywhere."* Everywhere was four places, none of
 * them a row. Four of the seven registers the seed ships declare `thing -> things`, and `things` is
 * the one register with an `identity:`, so those four lists can say which project a row belongs to
 * in one glyph and had been saying it in a text column or not at all.
 *
 * FIRST MATCH IN DECLARED ORDER, and that is the register's choice rather than this function's.
 * A register lists its fields in the order it wants them read, so the first `ref` that reaches a
 * register with an identity is the one it considers the row's subject. `obligations` declares
 * `party -> people` before `thing -> things` and `people` has no identity, so the walk passes over
 * it and lands on the project, which is the right answer for the wrong-looking reason: it is right
 * because `people` declares no mark, not because this function prefers projects.
 *
 * NULL IS THE COMMON ANSWER AND IS NOT A FAILURE. `things` itself has no ref at all, `people` has
 * none, and a pack may ship a register that belongs to nothing. A row with no thing behind it gets
 * no glyph, which is the honest drawing of "this row is not about a project".
 */
export function identityFor(register: string, fields: Readonly<Record<string, unknown>>, names?: Names): Identity | null {
  for (const f of REGISTERS[register]?.fields ?? []) {
    if (f.type !== 'ref' || !f.to) continue;
    const found = identityOf(register, f.id, fields[f.id], names);
    if (found) return found;
  }
  return null;
}

/* ── columns ─────────────────────────────────────────────────────────────
   The default projection: seq, the title field, the `mobile:` fields, state, then indexed fields,
   capped at TEN. At 1440px the return sweep is ~1392px, and beyond ten columns of legible width the
   eye loses the row — which in a money ledger means reading a figure off the wrong line (13 §4.2). */

const WIDTH: Record<string, string> = {
  // The number's width plus the cell's padding: `#99`. The project's mark used to lead this cell and
  // sized it at 11ch; it moved in front of the title, so a list with longer ids widens the column
  // from the rows in hand with `seqWidth`.
  seq: '8ch',
  money: '15ch',
  day: '15ch',
  /* A FOSSIL SIZED FOR A STRING IT NO LONGER PRINTS. `20ch` fits `2026-09-03T11:57:00.000Z`, which
     is what an `instant` cell rendered before `display()` learned to band one; the longest thing it
     can say now is `55 min ago`. Ten characters of empty column, right-aligned, on every register
     that has one. */
  instant: '12ch',
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

/**
 * WHICH COLUMNS A LIST OPENS WITH, and it used to be every indexed field.
 *
 * A FRICTION PASS COUNTED THE COST. `/r/obligations` drew nine columns over thirty-nine rows: 180
 * numbers, 88 controls and 597 words on a screen whose question is "what do I owe and what am I
 * owed". Every one of those columns is a defensible column, and the eight of them together are the
 * reason the screen reads as a database rather than as an answer. It is seventh of the ten things
 * the pass found costing a person the most, and the only one on that list that is a decision about
 * DEFAULTS rather than a thing to build.
 *
 * `index: true` MEANS FAST TO FILTER, NOT WORTH READING. That is the mistake this made: it is a
 * storage decision, taken by whoever wrote the declaration for reasons about SQL, and it was being
 * read as an editorial one. `services` indexes its provider, its type, its renewal, its cycle and
 * its state, because a page filters on all five, and none of that is an argument for five columns.
 *
 * WHAT A REGISTER ALREADY SAYS IT IS ABOUT. `mobile` is the three fields the declaration nominates
 * for a card where there is room for three, which is exactly the editorial judgement wanted here;
 * `title` is what the row IS; `state` is the one field a reader scans a list to compare; and a
 * `deadline` field is the one the tone of the whole row is computed from, so leaving it off would
 * draw a red row with nothing on it explaining why. Obligations opens at five columns instead of
 * nine and answers the same question.
 *
 * NOTHING IS LOST AND THE WAY BACK ALREADY EXISTED. The display sheet on every list offers every
 * readable field and remembers what a reader turns on, per register, in `pref.columns`. This
 * changes which side of that switch a column starts on, and the switch has been there since the
 * screen was written.
 */
/** The `#` column's width for the rows in hand: the digits of the highest id, the `#` and the cell's padding, never under 8ch. */
export function seqWidth(entries: readonly { seq: number }[]): string {
  let top = 0;
  for (const e of entries) if (e.seq > top) top = e.seq;
  return `${Math.max(8, String(top).length + 6)}ch`;
}

export function columnsFor(register: string, declared?: RegisterDecl): Column[] {
  /* THE BUILT-IN DECLARATION FIRST, then the one the record sent: a list a pack brought, or one somebody made, is not in
     `REGISTERS`, and without its own declaration here it drew rows with no cells in them. */
  const r = REGISTERS[register] ?? declared;
  if (!r) return [];
  const wanted = new Set<string>([r.title, ...r.mobile, ...(r.state ? [r.state] : [])]);
  for (const f of r.fields) if (f.deadline) wanted.add(f.id);
  /**
   * AND A FIELD THAT MAKES A COLUMN BESIDE IT READABLE, which is the case the first cut of this
   * dropped and the declaration had already written down.
   *
   * `services` puts `cost` on its card and its `cycle` is what makes the number mean anything:
   * the seed says so where the field is declared, in as many words, *"a column of amounts on
   * unstated periods cannot be read: `GBP 340.00` beside `GBP 5.00` is not a comparison until one
   * says yearly and the other monthly"*. Narrowing the default set to the fields a card nominates
   * took the period off and left the amounts, which is the exact thing that comment predicts.
   *
   * `qualifies:` IS THE DECLARATION SAYING SO, rather than this function knowing that a register
   * called services has a field called cycle. A field that makes another one readable is a fact
   * about the pair, and the pair travels together or neither is worth drawing. It costs one key on
   * one field and it is the register's to set, which is where every other decision about what a
   * list shows already lives.
   */
  for (const f of r.fields) if (f.qualifies !== undefined && wanted.has(f.qualifies)) wanted.add(f.id);

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
export function toneOf(register: string, e: Entry, now: number = NOW): TableRow['tone'] {
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
  const days = (Date.parse(`${value}T12:00:00Z`) - now) / 86_400_000;
  if (days < 0) return 'bad';
  if (days < 14) return 'warn';
  return undefined;
}

export function toRows(register: string, entries: Entry[], columns: Column[], now: number = NOW, names?: Names): TableRow[] {
  /* AN ENUM IN SENTENCE CASE, as the register's own grid draws it. The list says "Owed by me" through
     a first-letter rule on its own markup; a page block or a backlink table drawing the same row said
     "owed by me", so one row read two ways a click apart. */
  const enums = new Set(columns.filter((c) => decl(register, c.field)?.type === 'enum').map((c) => c.field));
  const cased = (field: string, text: string | null): string | null => (enums.has(field) && text ? text.charAt(0).toUpperCase() + text.slice(1) : text);
  return entries.map((e) => ({
    key: `${register}#${e.seq}`,
    href: `/r/${register}/${e.seq}`,
    tone: toneOf(register, e, now),
    cells: columns.map((c) => (c.field === 'seq' ? `#${e.seq}` : cased(c.field, display(register, c.field, e.fields[c.field], now, names)))),
  }));
}

/**
 * What the capture line can answer on the reader's behalf, from the filter they are looking at.
 *
 * ASKING AGAIN FOR WHAT IS ALREADY ON SCREEN is asking a person to repeat themselves to a machine
 * that heard them. Looking at `?f=state:is:open` means the answer to "what state" is in the address,
 * and a one-line add that then demanded it would be a modal with fewer fields.
 *
 * IT IS DELIBERATELY NARROW, and each exclusion is a way of writing a wrong value in silence:
 *
 *   `is` AND NOTHING ELSE. `in` and `before` name a SET. Picking a member of a set for somebody is
 *   guessing at the one moment they have not said which, and the guess would be stored as if they
 *   had.
 *
 *   THE TITLE IS NEVER INHERITED, because the title is what the reader is typing.
 *
 *   ENUM AND TEXT ONLY. The URL carries the READABLE form of a value and the record stores the
 *   declared one: `direction is owed to me` on screen is `owed_to_me` underneath, which is exactly
 *   what `declaredValue` exists to reconcile. It reconciles the two spellings of a DECLARED value
 *   and passes anything else through unchanged, so a money, a day or a reference would arrive here
 *   as the reader's prose and be written as the field's value. A `day` is worse than merely wrong:
 *   `due is today` is a moving value frozen at the instant somebody typed a row.
 *
 *   AN ENUM VALUE THE FIELD DOES NOT DECLARE IS DROPPED. `declaredValue` returns its input when
 *   nothing matches, which is right for a filter (the answer is no rows) and wrong for a write (the
 *   answer would be a row nobody can read).
 */
export function inheritedFrom(register: string, filters: readonly Filter[]): Fields {
  const decl = REGISTERS[register];
  if (!decl) return {};
  const out: Fields = {};
  for (const f of filters) {
    if (f.op !== 'is' || f.values.length !== 1) continue;
    const field = decl.fields.find((x) => x.id === f.field);
    if (!field || field.id === decl.title) continue;
    if (field.type !== 'enum' && field.type !== 'text') continue;
    const said = declaredValue(register, f.field, f.values[0]!);
    if (field.type === 'enum' && !field.values?.includes(said)) continue;
    out[f.field] = said;
  }
  return out;
}

/**
 * The required fields that line cannot answer, so it can say so rather than writing a short row.
 *
 * A CAPTURE LINE THAT SILENTLY DROPPED A REQUIRED FIELD would be the shape this repository keeps
 * finding: a control that reports success and leaves the record in a state the declaration refuses.
 */
export function unansweredBy(register: string, held: Fields): { id: string; label: string }[] {
  const decl = REGISTERS[register];
  if (!decl) return [];
  return decl.fields
    .filter((f) => f.required && f.id !== decl.title && !(f.id in held))
    .map((f) => ({ id: f.id, label: labelOf(f) }));
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

  /**
   * THE TEXT BOX IS ONE OPERATOR, AND IT IS NOT A SCAN OVER EVERY COLUMN.
   *
   * `50 §5.2` step 6: *"text → the search box as `matches`"*. `29 §5` says what that is — *"`matches:`,
   * FTS5 over the register's `search:` fields"* — and `34 §6` gives the semantics: whole-token,
   * case-folded, over the register's searchable fields.
   *
   * This filtered on `display()` over EVERY field, which is the shape `fts.ts` opens by ruling out,
   * and it is why the door on `/search` landed somewhere else: the page counted title matches and
   * linked to a list matching everything. Both sides read the declaration now; `find.ts` is the one
   * matcher, and `find.test.ts`'s *"EVERY GROUP'S COUNT IS THE NUMBER OF ROWS ITS OWN DOOR LANDS
   * ON"* asserts the two answers are the same set. (This named `search.test.ts`, which asserts no
   * such thing — a miscitation inside the comment written to fix a miscitation.)
   */
  if (q) out = out.filter((e) => answers(register, e, q));
  return out;
}

/** `names` is a live record's, as `display` takes it: a ref column on a record sorts by the record's names. */
export function sortRows(register: string, entries: Entry[], field: string, dir: 'asc' | 'desc', names?: Names): Entry[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...entries].sort((a, b) => {
    if (field === 'seq') return (a.seq - b.seq) * sign;
    const x = a.fields[field];
    const y = b.fields[field];
    if (x === y) return a.seq - b.seq;
    if (x === null || x === undefined) return 1;
    if (y === null || y === undefined) return -1;

    /**
     * A REF SORTS BY THE NAME ON SCREEN, not by the row number behind it.
     *
     * A `ref` is stored as a seq — a number — so it missed the string branch below and fell into
     * `amountOf`, which coerces any scalar, and the column was ordered by the hidden id while the
     * cell rendered the title of the row it points at. `/r/obligations?sort=party:asc` gave Halden
     * ×9, Ravensworth ×8, J. Okonkwo ×4, Pell & Vine ×5 — the `people` register's own seq order, in
     * no visible order at all, under a `columnheader` announcing `aria-sort="ascending"`.
     *
     * The Project column has the same shape and was saved by luck: Kiln, Marlow & Co, Portage and
     * Tallow happen to be alphabetical in seq order, so renaming one project would have silently
     * stopped that column sorting too.
     *
     * `display()` IS WHAT THE CELL SHOWS, so it is what the sort has to read. Same locale collation
     * as any other text, for the same reason.
     */
    const decl = REGISTERS[register]?.fields.find((f) => f.id === field);
    /* AND AN ENUM WITH LABELS SORTS BY THEM, for the same reason: `owed_by_me` is Money out on screen. */
    if (decl?.type === 'ref' || (decl?.type === 'enum' && decl.labels)) {
      const sx = display(register, field, x, NOW, names) ?? '';
      const sy = display(register, field, y, NOW, names) ?? '';
      return sx.localeCompare(sy, LOCALE) * sign;
    }

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
/**
 * The same derivation over rows a caller hands in, against a clock it names.
 *
 * IT IS SPLIT OUT SO A LIVE THREAD CAN BE DERIVED THE SAME WAY. `/t/<track>` read the sample's rows
 * whatever record was open, and the fix is for it to hand its own rows to the derivation rather than
 * for a second copy of the rule to exist beside this one. The `not_expected` distinction and the
 * newest-wins ordering are the two things every implementation of this drops, so there is one
 * implementation and `trackHealth` is a reading of it against the sample.
 */
export function healthOf(track: Entry | undefined, updates: readonly Entry[], seq: number, now: number): TrackHealth {
  const state = String(track?.fields.state ?? '');
  const expected = state === 'open';

  const newest = updates
    .filter((u) => Number(u.fields.track) === seq)
    .sort((a, b) => String(a.fields.at).localeCompare(String(b.fields.at)))
    .at(-1);

  if (!newest) {
    return { health: null, asOf: null, by: null, state: expected ? 'missing' : 'not_expected' };
  }

  const asOf = String(newest.fields.at);
  const age = (now - Date.parse(asOf)) / 86_400_000;
  return {
    health: newest.fields.health as Health,
    asOf,
    by: String(newest.fields.by ?? ''),
    state: !expected ? 'not_expected' : age > UPDATE_WINDOW_DAYS ? 'missing' : 'current',
  };
}

export function trackHealth(seq: number): TrackHealth {
  return healthOf(
    ROWS.tracks?.find((t) => t.seq === seq),
    ROWS.updates ?? [],
    seq,
    NOW,
  );
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

/** Every update on a track, newest first, out of the rows a caller hands in. */
export const updatesIn = (updates: readonly Entry[], seq: number): Entry[] =>
  updates
    .filter((u) => Number(u.fields.track) === seq)
    .sort((a, b) => String(b.fields.at).localeCompare(String(a.fields.at)));

/** The same thread, read against the sample. */
export const updatesFor = (seq: number): Entry[] => updatesIn(ROWS.updates ?? [], seq);

/**
 * The agent runs placed in one project, most recently seen first.
 *
 * BY PROJECT, BECAUSE A RUN HAS NO THREAD. The kernel's `session` register holds a run's `project` as
 * the project's spoken id, `things#1`, and nothing narrower.
 */
export const runsIn = (runs: readonly Entry[], project: string): Entry[] =>
  runs
    .filter((x) => x.fields.project === project)
    .sort((a, b) => String(b.fields.last_seen).localeCompare(String(a.fields.last_seen)));

/** The same runs, read against the sample. */
export const runsOn = (project: string): Entry[] => runsIn(ROWS.session ?? [], project);

/** A run's spoken id, `S1`, which is the name the kernel signs its writes with. */
export const runName = (run: Entry): string => `${REGISTERS.session?.seq_prefix ?? 'S'}${run.seq}`;

/**
 * Whether a run is working now: active, and heard from within the kernel's 45 minutes. Worked out on
 * read, as the kernel does, because a run that crashed never says so.
 */
export const workingAt = (run: Entry, now: number): boolean =>
  run.fields.state === 'active' && now - Date.parse(String(run.fields.last_seen)) < STALE_MS;

/** The same question, asked against the sample's frozen clock. */
export const working = (run: Entry): boolean => workingAt(run, NOW);

/** The job a run is doing, found by the run the job names, or `null`. */
export const jobOf = (run: Entry): Job | null => Object.values(JOBS).find((j) => j.run === runName(run)) ?? null;

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
  /** How the figure moved, one value a day, oldest first; `null` is a day nothing was recorded. */
  trend?: (number | null)[] | undefined;
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
    const walk = runway(openingOf(block?.opening).value ?? 0, block?.from ?? []);
    /* AND A WALK OVER NOTHING IS NOT A RUNWAY OF OVER 180 DAYS. `tone: 'good'` is hard-coded on this
       branch, so a record with no money in it and nothing dated to spend reported the one figure in
       the product that is about the future as fine — out of an opening balance of zero and an empty
       list of movements. `19 §6` again: nothing to show is not the same as nothing to worry about. */
    if (!walk.crossed && walk.steps.length === 0 && walk.from === 0)
      return { id, label: 'Runway', value: MISSING, note: copy.nothingDated, href: '/p/money' };
    if (!walk.crossed)
      return {
        id,
        label: 'Runway',
        value: `Over ${walk.horizon} days`,
        /* "TAKES X UNDER" HAS NO OBJECT, so a reader supplies one and reads *under X* — which the
           walk directly below it then breaks, twice, under a green tick. The floor is zero (the
           crossing test is `balance < 0`); `X` is where the walk STARTS. Measured on a three-row
           record: "nothing dated takes GBP 5,000.00 under" over a table showing that balance falling
           to GBP 3,636.00 on the same day. This branch only ever renders on a small record — at
           twelve rows the walk crosses and the tile flips — so it is week one's sentence, which is
           the week nothing had ever looked at. */
        note: `starts at ${money(walk.from, walk.currency ?? 'GBP')} and nothing dated takes it under`,
        /* THE TICK NEEDS SOMETHING TO HAVE BEEN WALKED. With an opening balance declared on the page
           and no dated movement anywhere in the record, the note is true — nothing takes it under,
           because there is no nothing — and a green tick over it is a verdict on a walk that did not
           happen. The sentence stays; the judgement goes. */
        ...(walk.steps.length === 0 ? {} : { tone: 'good' as const }),
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

  if (id === 'open-questions') {
    /* AND THIS ONE RETURNS BEFORE THE EMPTY GUARD BELOW, so it kept the tick a record with nothing
       in it has not earned: `Open questions · 0 · no more than 3 · ✓`. It is the same defect the
       guard was written for, on `/decide` — which `19 §2` names as one of the three spine screens,
       and which the commit that added the guard edited in the same breath. A figure over an empty
       list is not good news; it is not news. */
    const none = QUESTIONS.length === 0 && DECIDED.length === 0;
    return {
      id,
      label: 'Open questions',
      value: String(QUESTIONS.length),
      /* A LITERAL THAT `targetLine` WOULD HAVE WRITTEN. Every other target on every other tile went
         from `target ≤ X` to a sentence; this one is typed out here, so it stayed — on `/decide`,
         which `19 §2` names as one of the three spine screens. */
      note: none
        ? copy.nothingIn('Decisions')
        : targetLine({ format: 'int', target: { lte: 3 } } as Parameters<typeof targetLine>[0]),
      ...(none ? {} : { tone: QUESTIONS.length > 3 ? ('warn' as const) : ('good' as const) }),
      href: '/decide',
    };
  }

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

  /**
   * A FIGURE OVER AN EMPTY LIST IS NOT GOOD NEWS. IT IS NOT NEWS.
   *
   * `meetsTarget` is `value <= target.lte`, and `0 <= 2000000` is true — so on a record with nothing
   * in it, `OWED TO YOU · GBP 0.00`, `DUE IN 30 DAYS · GBP 0.00` and `OVERDUE TO PAY · GBP 0.00`
   * each carried a tick labelled *good*. Four green ticks on the screen somebody sees the hour they
   * install the product, telling them their finances are healthy on the strength of no data at all.
   *
   * `19 §6` names five empty states and says collapsing them is the failure; this is the collapse
   * nothing had audited, because both usability passes before this one could not reach an empty
   * record in a browser. `no-data-yet` was reading as `cleared`.
   *
   * THE TONE GOES AND THE SENTENCE ARRIVES. A tile with no tone is a fact without a verdict, which
   * is exactly right here — and the note says which list is empty, so it points at the thing to do
   * rather than only declining to judge. The comparison line is dropped with it: "nothing to compare
   * with yet" under "nothing in Obligations yet" is the same sentence twice.
   */
  const empty = reading.held === 0;

  const met = empty ? null : meetsTarget(decl, reading.value);
  /* The delta reads as a MOVEMENT and not as a sign: "up 18% on the 30d before" is a sentence, and
     `+18%` beside a target is two numbers a reader has to tell apart. */
  /* AND AN ABSENT COMPARISON SAYS SO. `19 §6`: a surface showing nothing must never be
     indistinguishable from a surface with nothing to show — and three of the four tiles on the money
     page carried no movement and no explanation, which reads as "this has not moved" when every one
     of them declares a window. */
  /* AND A MOVEMENT OF NOTHING IS NOT A MOVEMENT. `Math.abs(delta * 100).toFixed(0)` rounds every
     shift under half a per cent to `0`, so the sentence read "up 0% on the 30 days before" — a
     direction, a magnitude of nothing, and a reader left to work out which half to believe. */
  const pct = reading.delta === null ? 0 : Math.round(Math.abs(reading.delta * 100));
  const move =
    reading.delta === null
      ? reading.unmeasured
        ? ` · ${reading.unmeasured}`
        : ''
      : pct === 0
        ? ` · ${copy.aboutTheSame} ${reading.why}`
        : ` · ${reading.delta >= 0 ? 'up' : 'down'} ${pct}% ${reading.why}`;

  return {
    id,
    label: decl.name,
    value: reading.shown,
    note: empty ? copy.nothingIn(REGISTERS[decl.source.replace(/^register\./, '')]?.name ?? decl.name) : `${targetLine(decl)}${move}`,
    tone: met === null ? undefined : met ? 'good' : 'warn',
    /**
     * AND A FIGURE OVER AN EMPTY REGISTER IS NOT A DOOR EITHER.
     *
     * The paragraph above takes the tick off a tile computed from no data, and left the tile a
     * link: pressing `OWED TO YOU · GBP 0.00 · nothing in Obligations yet` opened a filtered list
     * of a register with nothing in it, so somebody reading the sentence that says there is nothing
     * there was invited to go and look at it.
     *
     * `held === 0` AND NOT `value === 0`, and the difference is the whole of it. `Overdue · GBP
     * 0.00` over thirty-eight invoices is an answer, and its door opens the filter that produced it,
     * which is worth having. A register with nothing in it has no such filter to show.
     */
    ...(empty ? {} : { href: reading.href }),
  };
}

/** The values a page's `{{path}}` interpolations resolve to, pre-resolved server-side (22 §5). */
export function values(): Record<string, string> {
  /**
   * TWO PATHS, EACH NAMED FOR THE DIRECTION IT MEANS.
   *
   * There was one, called `oldest_overdue`, and it changed direction under a comment explaining why:
   * first it took the minimum over BOTH directions, so a sentence about a receivable printed the age
   * of a bill you owe; then it was narrowed to `owed_to_me`, and the note that consumes it is gated
   * on the `overdue` metric — which is `owed BY me`. So the alarm fired on payables and printed the
   * age of a receivable: 5w on screen for a record whose oldest overdue payable is nine weeks old.
   *
   * The old comment got the rule right and the caller wrong: *a path is named after what it means or
   * it means whatever the first caller assumed*. So neither of these is called `oldest_overdue`, and
   * a sentence has to say which one it wants.
   */
  const oldestIn = (direction: string) =>
    (ROWS.obligations ?? [])
      .filter((e) => open(e) && e.fields.direction === direction && days(e.fields.due) < 0)
      .map((e) => String(e.fields.due))
      .sort()[0] ?? '';

  return {
    /** Money you owe, past its date — the set the `overdue` metric counts. */
    'obligations.oldest_unpaid': oldestIn('owed_by_me'),
    /** Money owed to you, past its date. Statutory interest you could charge. */
    'obligations.oldest_unrecovered': oldestIn('owed_to_me'),
    'obligations.count': String((ROWS.obligations ?? []).length),
    'services.count': String((ROWS.services ?? []).length),
    ...Object.fromEntries(
      ['owed-to-you', 'due-30d', 'overdue', 'late-in', 'renews-30d', 'estate-year', 'lapsing'].map((id) => [id, metric(id).value]),
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
      /* THE REGISTER'S OWN NAME, NOT A SECOND SPELLING OF IT. This was the literal `Tracks`, so
         renaming the register to Threads renamed the list, the page heading, the palette and the
         rail's own Lists section, and left the rail section above these rows saying the old word.
         One string, read from the declaration, cannot drift from it. */
      section: REGISTERS.tracks?.name ?? 'Threads',
      order: 10 + n,
      icon: 'rows',
    });

  return {
    index: {
      slug: 'the-studio',
      name: 'The Studio',
      locale: 'en',
      /**
       * THE LISTS THAT HOLD SOMETHING, AND IT USED TO BE EVERY LIST DECLARED.
       *
       * `USABILITY.md`'s second question is whether the product grows as the record grows, and the
       * rail was the clearest no in it: eight list links, each with its own tally, drawn identically
       * over a record of eight rows and a record of four hundred. Seven of the eight read `0`, and a
       * link to a list with nothing in it is a thing a person has to read, decide is irrelevant, and
       * put down, every time they look at the rail. The precedent is `Second.svelte`, which filters
       * the same way under a comment saying that counting every declared register "is the count that
       * made this unreachable".
       *
       * HERE AND NOT IN THE RAIL, because the rail is not the only reader. The phone's More sheet
       * draws this same list, and the last time a rail rule lived in one of the two surfaces rather
       * than in the list they share, the phone and the desktop showed different navigation and the
       * bundle baseline had to be re-recorded to put it right. One list, one rule.
       *
       * A LIST IS NOT HIDDEN BY THIS. It is one keystroke away in the palette, which reaches objects
       * rather than screens, and it arrives in the rail the moment it holds a row. What goes is the
       * standing offer to look at nothing.
       */
      registers: Object.values(REGISTERS)
        .filter((r) => (ROWS[r.id] ?? []).length > 0)
        .map((r) => ({
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
           * palette is labelled "Search".
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
  /** Every scheduled action it would add: `04 §3`'s `calls_out`. */
  calls: readonly CallOut[];
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
              /* AND IT COUNTED `blocks`. `block` is defined once, on the AddBlock sheet, once per
                 device, behind a cookie — and this line is on the trust screen, which is where a
                 stranger decides whether to let a file into their business and the one screen in
                 the product with no way to define anything. What the count is FOR is how much
                 page arrives with the pack, and a table and a figure are what a page is made of.
                 The word is untouched everywhere it is taught. */
              `${decl.blocks.length} ${decl.blocks.length === 1 ? 'table or figure' : 'tables and figures'}`,
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
    touches: 'nothing you have written: 0 rows read, 0 of your rows changed',
    unread: !pack.installed,
    calls: pack.calls ?? [],
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
  /**
   * On `sessions.live`, whether each run in `entries` has not been heard from within the kernel's
   * `STALE_MS`. A card grid draws such a run dimmed.
   */
  quiet?: boolean[] | undefined;
  metrics?: Metric[] | undefined;
  /** On a block that inherits: how many of `entries`, at the end, apply everywhere rather than to the project. */
  inherited?: number;
  /** A `feed` block's rows before they are words, newest first, a burst being one row. */
  feed?: FeedRow[];
  /** On a feed with `since: seen`: the reader's read mark, or `null` when they have none yet. */
  seen?: string | null;
  /** A `diff` block's versions of its field, newest first. */
  history?: { at: string; by: string; text: string }[];
  /** A `forecast.runway` block's walk, which a `bridge` draws from rather than from the table. */
  walk?: Walk;
  /** A `series` block's buckets and each line's value in them, as the record's `barsOf` lines them up. */
  bars?: Bars;
  /** A forecast's `recorded:` series over the ninety days before today, oldest first. */
  past?: readonly { at: string; value: number }[];
  /** A forecast's `late:` figure, read: how many days late money has come in on average, or `null` when nothing was paid. */
  lateness?: number | null;
};

/** The kernel's `FeedRow` (`packages/kernel/src/pages.ts`), which this engine must agree with. */
export type FeedRow = {
  by: 'agent' | 'rule' | 'you';
  who: string | null;
  count: number;
  kind: string | null;
  target: string | null;
  note: string | null;
  at: string;
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
  const opened = openingOf(b.opening);
  const walk = runway(opened.value ?? 0, b.from ?? [], b.horizon);
  /* A WALK THE RECORD CANNOT MAKE IS A SENTENCE, not an empty table. A cash walk over two currencies
     produces a crossing day that looks real and is invented.

     AND THE WALK'S OWN SENTENCES REACH THE BLOCK, WHICH THEY DID NOT. This read `walk.mixed` and
     nothing else, so the refusals the walk itself produces — a horizon it cannot carry, a leg
     pointed at something that is not money, a cycle that is not a whole number of months, a row
     that recurs past the cap — came back to a block that drew an empty table under its own `empty:`
     sentence instead. "Nothing is coming" and "this walk could not be made" are different facts and
     one of them is the reason for the other. */
  const recorded = recordedOf(b);
  const late = latenessOf(b);
  const refusals = [
    ...(opened.refusal ? [opened.refusal] : []),
    ...(typeof recorded === 'string' ? [recorded] : []),
    ...(typeof late === 'string' ? [late] : []),
    ...walk.refusals,
    ...(walk.mixed.length ? [`The cash walk needs one currency: ${mixedFix(walk.mixed)}.`] : []),
    ...(opened.unit !== null && walk.currency !== null && opened.unit !== walk.currency
      ? [`The opening balance is in ${opened.unit} and the movements are in ${walk.currency}. A cash walk adds them, so they need one currency.`]
      : []),
  ];
  return {
    ...b,
    register: undefined,
    entries: [],
    matched: [],
    refusals,
    ...(refusals.length ? {} : { walk }),
    ...(refusals.length || typeof recorded === 'string' || !recorded ? {} : { past: recorded }),
    ...(refusals.length || typeof late === 'string' || late === undefined ? {} : { lateness: late }),
    /* A BRIDGE ADDS UP THE WHOLE WALK, and a forecast draws it, so each shows every movement it read rather than a slice of them. */
    ...walkTable(walk, b.kind === 'bridge' || b.kind === 'forecast' ? walk.steps.length : b.limit, new Date(NOW).toISOString().slice(0, 10), refusals.length > 0),
    drawn: b.drawn ?? drawnWhen(b),
    stale_at: new Date(NOW).toISOString(),
    metrics: undefined,
  };
}

/**
 * A series: each figure read here, grouped as the record groups it, and lined up by the record's own `barsOf`.
 *
 * The figures are this build's readings and the arithmetic that lines them up is imported, so the
 * sample and a record draw the same bars in the same buckets.
 */
function seriesBlock(b: PageBlock): BlockResult {
  const got = barsOf(
    b.series as SeriesLine[] | undefined,
    b.back,
    b.ahead,
    (id) => (METRICS[id] ?? null) as never,
    (decl) => {
      const r = read(decl as never);
      return r.refusals.length
        ? { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: r.refusals[0]! } }
        : { ok: true, value: { groups: r.groups ?? [], current: r.current ?? '', unit: r.rows === 0 ? null : unitOfFormat((decl as { format?: string }).format) } };
    },
  );
  const refusals = 'refusal' in got ? [got.refusal.fix] : [];
  const unread = Object.keys(b).filter((k) => !READS.has(k)).map((k) => `${k}: is not a key this build reads`);
  return {
    ...b,
    register: undefined,
    columns: [],
    entries: [],
    matched: [],
    refusals: [...unread, ...refusals],
    rows: [],
    ...('bars' in got ? { bars: got.bars } : {}),
    shown: 'bars' in got ? got.bars.keys.length : 0,
    total: 'bars' in got ? got.bars.keys.length : 0,
    drawn: b.drawn ?? drawnWhen(b),
    stale_at: new Date(NOW).toISOString(),
    metrics: undefined,
  };
}

/** The currency a `money.<CUR>` format names, or `null`. */
const unitOfFormat = (format: string | undefined): string | null => (format?.startsWith('money.') ? format.slice('money.'.length) : null);

/** The knobs a forecast may offer: the kernel's `KNOBS`. */
const KNOBS = ['horizon', 'late', 'spend', 'leave'];

/**
 * A forecast's remembered balance before today, as the record's `recordedOf` reads it, or the sentence that stops it.
 *
 * The series is the opening figure's own, over the ninety days before today, a day with no point absent.
 */
function recordedOf(b: PageBlock): readonly { at: string; value: number }[] | string | null {
  if (b.knobs !== undefined && (!Array.isArray(b.knobs) || b.knobs.some((k) => !KNOBS.includes(k)))) return `knobs is a list of ${KNOBS.join(', ')}.`;
  if (b.recorded === undefined) return null;
  const id = typeof b.recorded === 'string' ? b.recorded.replace(/^series\./u, '') : '';
  const opening = b.opening !== null && typeof b.opening === 'object' ? b.opening.metric : null;
  if (!id || id !== opening) return `recorded: names the series its opening figure is remembered in, which is ${opening ?? 'a figure this walk does not open from'}.`;
  const DAY = 86_400_000;
  const at = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const from = at(NOW - 90 * DAY);
  const to = at(NOW - DAY);
  return (SERIES[id] ?? []).filter((p) => p.at >= from && p.at <= to);
}

/**
 * A forecast's late mark, as the record's `latenessOf` reads it, or the sentence that stops it.
 *
 * `undefined` when the block names no figure; the reading, `null` when nothing was paid, when it does.
 */
function latenessOf(b: PageBlock): number | null | string | undefined {
  if (b.under !== undefined && (!Number.isInteger(b.under) || b.under < 1 || b.under > 365)) return 'under: is a whole number of days between 1 and 365.';
  if (b.late === undefined) return undefined;
  const decl = typeof b.late === 'string' ? METRICS[b.late] : undefined;
  if (!decl) return `There is no metric called ${String(b.late)} for the late knob to mark.`;
  const reading = read(decl);
  return reading.refusals.length ? reading.refusals[0]! : reading.value;
}

/** One step of a cash walk, as this build's walk and the record's both send it. */
export type WalkStep = { day: string; label: string; delta: number; balance: number; source: string; href?: string; spoken?: string };

/** A cash walk, with only the keys the table reads. The record's `crossed` arrives as a copy of a step, not the step. */
export type Walk = { from: number; currency: string | null; steps: readonly WalkStep[]; crossed: WalkStep | null };

/** Where a step's row opens: this build's `href`, or the record's `register#seq` as that row's address. */
function stepHref(s: WalkStep): string | undefined {
  if (s.href) return s.href;
  const m = /^([a-z_][a-z0-9_]*)#(\d+)$/u.exec(s.spoken ?? '');
  return m ? `/r/${m[1]}/${m[2]}` : undefined;
}

/**
 * A cash walk as a table: the columns, the opening row, a row a step, and how many of the steps it shows.
 *
 * ONE SHAPE FOR BOTH WALKS, the sample's and the one a record answers on a page, so the two draw the
 * same table. `today` is the day the opening balance is liquid on, and `refused` draws no row at all.
 */
export function walkTable(
  walk: Walk,
  limit: number | undefined,
  today: string,
  refused: boolean,
): Pick<BlockResult, 'columns' | 'rows' | 'shown' | 'total'> {
  /* FIXED TRACKS, NOT `auto`. Each row is its own grid over one declared track list, so an `auto`
     track sized itself to each row's own date: the What column started at a different x on every
     row whose date was a digit longer. Wide enough for "14 Sep 2026" with the tone's gutter, and
     for "−£19,100.00". */
  const columns = [
    { field: 'day', label: 'When', width: '17ch', align: 'start' as const, truncate: 'end' as const },
    { field: 'what', label: 'What', width: 'minmax(16ch,1fr)', align: 'start' as const, truncate: 'end' as const },
    { field: 'delta', label: 'In and out', width: '15ch', align: 'end' as const, truncate: 'never' as const },
    { field: 'balance', label: 'Balance', width: '15ch', align: 'end' as const, truncate: 'never' as const },
  ];
  const steps = walk.steps.slice(0, limit ?? 12);
  /* THE CROSSING BY WHAT IT IS, because a record's `crossed` came over the wire as its own object. */
  const c = walk.crossed;
  const crossed = c
    ? walk.steps.findIndex((s) => s === c || (s.day === c.day && s.balance === c.balance && s.delta === c.delta && s.source === c.source && s.label === c.label))
    : -1;
  return {
    columns,
    shown: steps.length,
    rows: [
      /* THE OPENING IS A ROW, because every balance under it is that number plus a movement. It was
         nowhere on the screen: the first row read "In and out −9,190.00 · Balance −4,190.00", which
         only adds up if you already know the walk started at 5,000 — and the red "RUNWAY 0 days"
         headline above it is derived from the same invisible figure. A forecast whose arithmetic
         cannot be checked from the screen is a number somebody has to trust. */
      /* AND NO OPENING ROW UNDER A REFUSAL OF ANY KIND, for the reason the mixed-currency case
         already had: a block that refuses draws nothing, and half a table under a sentence saying
         the walk could not be made is the half somebody reads. */
      ...(refused
        ? []
        : [
            {
              key: 'opening',
              cells: [fmtDay(today), 'What is liquid today', '', moneyOr(walk.from, walk.currency)],
              href: undefined,
              tone: undefined,
            },
          ]),
      ...steps.map((s, i) => ({
      /* The key is the movement, not the index: two charges on one day from one service are
         different rows, and a keyed list that reuses an index re-renders the wrong one. */
      key: `${s.day}-${s.source}-${stepHref(s)}-${i}`,
      cells: [fmtDay(s.day), s.label, moneyOr(s.delta, walk.currency), moneyOr(s.balance, walk.currency)],
      href: stepHref(s),
      /* THE CROSSING IS ONE ROW. Painting every row after it the same colour buries the fact the
         walk exists to produce: the day you go under. Everything after it is still under, which is
         `warn` — a state, not an event. */
      tone: i === crossed ? ('bad' as const) : s.balance < 0 ? ('warn' as const) : undefined,
      })),
    ],
    total: walk.steps.length,
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
  /* A section's two keys: `fold` starts it shut, `icon` names the glyph beside its heading. */
  'fold', 'icon',
  /* A feed's and a diff's keys, so a page may declare them before their bindings land. */
  'since', 'first', 'row', 'field', 'versions',
  /* A block that reads its project's rows and the ones it inherits from everywhere. */
  'inherit',
  /* A stat whose first figure is the screen's hero. */
  'lead',
  /* A series's lines and its reach. */
  'series', 'back', 'ahead', 'net',
  /* A forecast's remembered figure and its knobs, its late mark and its warning reach. */
  'recorded', 'knobs', 'late', 'under',
  /* A card grid's out-of-date rule. */
  'stale',
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
        refusals: [`this block could not be read: ${e instanceof Error ? e.message : String(e)}`],
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

/** Exported for the test that holds this engine against the kernel's over the seed. */
export function readBlock(b: PageBlock): BlockResult {
  {
    /* A BLOCK MAY BE SOURCED FROM A WALK, NOT ONLY A REGISTER. 05 §2 defers a `forecast` KIND to
       post-v1 and says the primitive layer is what exists so that it can be drawn without one, so
       this adds a source rather than a kind: `forecast.runway` fills an ordinary `table` with the
       cash walk. Nothing about the block is new, and the day a real `forecast` kind ships, the
       declaration that changes is the kind, not the query. */
    if (b.source === 'forecast.runway') return runwayBlock(b);
    if (b.kind === 'series') return seriesBlock(b);
    /* A FEED READS THE LEDGER and a diff reads one row's history, so neither is a register's rows. */
    if (b.source === 'activity') return activityBlock(b);
    if (b.kind === 'diff') return diffBlock(b);
    /* THE RUNS WORKING NOW are `session`'s rows in the order the kernel's `sessionsLive` gives them,
       so a declared order would be a second answer to a question the source settles. */
    const live = b.source === 'sessions.live';
    if (live && b.order?.length) return computed(b, ['order: sessions.live comes the most recently seen first, so it takes no order:']);

    const register = live ? SESSION : b.source?.startsWith('register.') ? b.source.slice('register.'.length) : undefined;
    const all = live ? liveRuns() : register ? (ROWS[register] ?? []) : [];
    const { entries: matched, refusals, own } = register
      ? b.inherit === true
        ? inheritFor(register, all, b)
        : { ...filterForBlock(register, all, b), own: undefined }
      : { entries: [], refusals: [], own: undefined };

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
    if (b.source && !register) said.push(`source: ${b.source} is not a source this build reads. It reads register.<id>, forecast.runway, activity and sessions.live`);
    if (register) {
      /* `seq` is a column and not a field: it is on the ROW rather than in its fields, and `toRows`
         renders it as `#4`. Any pack may name it, so it belongs in the set a column may resolve to
         even though no register declares it. */
      const declared = new Set(['seq', ...(REGISTERS[register]?.fields ?? []).map((f) => f.id)]);
      for (const c of b.columns ?? [])
        if (!declared.has(c.field)) said.push(`columns: there is no field called ${c.field} on ${register}`);
      /* WHERE A ROW APPLIES IS THE SCOPE FIELD'S TO SAY, as the kernel checks it. */
      const scope = scopeFieldOf(register);
      for (const c of b.columns ?? [])
        if (c.as === 'scope' && c.field !== scope?.id)
          said.push(
            scope
              ? `columns: as: scope draws where a row applies, which ${register} says in ${scope.id}, not ${c.field}`
              : `columns: as: scope draws where a row applies, and ${register} has no field that says so`,
          );
    }
    for (const key of Object.keys(b))
      if (!READS.has(key)) said.push(`${key}: is not a key this build reads`);
    /* OUT OF DATE IS A DAY AND A WINDOW, as the record checks it. */
    if (b.stale !== undefined && register) {
      const type = decl(register, b.stale?.field ?? '')?.type;
      if ((type !== 'day' && type !== 'instant') || typeof b.stale?.after !== 'string' || windowMs(b.stale.after) === null)
        said.push(`stale: names a day field on ${register} and a window, such as { field: as_of, after: 7d }`);
    }
    /* `limit:` is a READING cap, not a query cap: it says how much of the answer fits on the page.
       The kinds that reduce are handed the whole answer (see `matched`), so a sum is a sum. */
    const entries = matched.slice(0, b.limit ?? 50);
    const columns = b.columns
      ? b.columns.map((c) => ({
          field: c.field,
          label: c.label ?? c.field,
          width: c.width ?? 'minmax(12ch,1fr)',
          align: c.align ?? 'start',
          /* A FIGURE NEVER TRUNCATES, AND WHICH COLUMNS ARE FIGURES IS THE REGISTER'S TO SAY.
             This asked the field's NAME and matched `amount` or `cost`, so `revenue` and `rate`,
             both declared money, were drawn as ordinary text, and a text field called `cost_centre`
             would have been drawn as a figure. The declared type is already in scope here: the same
             function reads `REGISTERS[register].fields` twelve lines above to name a column the
             register does not have, and `columnsFor` has asked the type since it was written
             (13 §4.2: a truncated figure is not shortened, it is wrong). A column over no register
             has no declared type to ask, so it truncates as the text it is being drawn as. */
          truncate: decl(register ?? '', c.field)?.type === 'money' ? ('never' as const) : ('end' as const),
          /* A card's role for this column. Without it every cards block fell back to the guessed roles.
             `scope` is not a role the renderer draws: it says what the cell holds, which is settled here. */
          ...(c.as === undefined || c.as === 'scope' ? {} : { as: c.as }),
        }))
      : [];
    const rows = toRows(register ?? '', entries, columns);
    (b.columns ?? []).forEach((c, i) => {
      if (c.as !== 'scope') return;
      entries.forEach((e, n) => {
        const cells = rows[n]?.cells;
        if (cells) cells[i] = absent(e.fields[c.field]) ? EVERYWHERE : (cells[i] ?? null);
      });
    });
    /* A RUN HOLDS ITS PROJECT AS A SPOKEN ID, and the kernel's page layer names it, so this does too. */
    if (live)
      (b.columns ?? []).forEach((c, i) => {
        if (c.field !== 'project') return;
        entries.forEach((e, n) => {
          const cells = rows[n]?.cells;
          if (cells) cells[i] = projectName(e.fields.project) ?? cells[i] ?? null;
        });
      });
    return {
      ...b,
      register,
      columns,
      entries,
      matched,
      refusals: said,
      rows,
      /* The kernel's own test of a run gone quiet, so the two hosts dim the same runs. */
      ...(live ? { quiet: entries.map((e) => isStale({ fields: e.fields as never, updated_at: e.created }, NOW)) } : {}),
      ...(own === undefined ? {} : { inherited: Math.max(0, entries.length - own) }),
      /* A KIND THAT REDUCES DRAWS THE WHOLE ANSWER, so it is never showing a slice of it. `bar`,
         `chips` and `gauge` iterate `matched` — every row — and apply `limit:` to their GROUPS; this
         counted `entries` for every kind alike, so the first author to write `limit: 5` on a bar
         over 38 rows would have got "Showing 5 of 38" above a chart containing all 38. No block in
         the seed declares one, which is the only reason it is not on screen today. */
      shown: REDUCES.has(b.kind) ? matched.length : entries.length,
      total: matched.length,
      drawn: b.drawn ?? drawnWhen(b),
      stale_at: new Date(NOW).toISOString(),
      metrics: b.cells?.map((c) => {
        const trend = c.trend === undefined ? undefined : trendOf(c.metric, c.trend);
        const note = c.note === undefined ? {} : { note: noteOf(c.note, (id) => (METRICS[id] ? metric(id).value : null)) };
        return { ...metric(c.metric), label: c.label, ...(trend ? { trend } : {}), ...note };
      }),
    };
  }
}

/**
 * How a figure moved over a window, one value a day from its series, as the record's `trendOf` reads it.
 *
 * A day with no point is a gap and never a zero, and today is not in it, because today's point is
 * written tomorrow. Nothing recorded at all is no trend, so no line is drawn from nothing.
 */
export function trendOf(metricId: string, window: string, now: number = NOW): (number | null)[] | undefined {
  const span = windowMs(window);
  if (span === null) return undefined;
  const DAY = 86_400_000;
  const days = Math.max(1, Math.round(span / DAY));
  const at = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const last = now - DAY;
  const by = new Map((SERIES[metricId] ?? []).map((p) => [p.at, p.value]));
  const trend = Array.from({ length: days }, (_, i) => by.get(at(last - (days - 1 - i) * DAY)) ?? null);
  return trend.some((v) => v !== null) ? trend : undefined;
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

/** The kernel's register of agent runs, which `sessions.live` reads. */
const SESSION = 'session';

/** The runs not in one of `session`'s `done` states, the most recently seen first: the kernel's `sessionsLive`. */
const liveRuns = (): Entry[] => {
  const done = new Set<string>(REGISTERS[SESSION]?.done ?? []);
  return (ROWS[SESSION] ?? [])
    .filter((e) => !done.has(String(e.fields.state ?? '')))
    .sort((a, z) => String(z.fields.last_seen ?? '').localeCompare(String(a.fields.last_seen ?? '')));
};

/** A spoken id as the ladder writes a run's project: `things#1`. */
const SPOKEN = /^([a-z][a-z0-9_]*)#([1-9][0-9]*)$/;

/** The title of the row a spoken id names, or `undefined` when it names none, so the id is kept as written. */
const projectName = (value: unknown): string | undefined => {
  const m = typeof value === 'string' ? SPOKEN.exec(value) : null;
  if (!m) return undefined;
  const title = REGISTERS[m[1]!]?.title;
  const name = title ? (ROWS[m[1]!] ?? []).find((e) => e.seq === Number(m[2]))?.fields[title] : undefined;
  return absent(name) ? undefined : String(name);
};

/** What a scope cell reads for a row that applies to every project. */
const EVERYWHERE = 'Everywhere';

const absent = (v: unknown): boolean => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

/** The field that says where a register's rows apply, as `packages/kernel/src/scope.ts` finds it. */
const scopeFieldOf = (register: string): (FieldDecl & { scope?: { same?: string }; to?: string }) | undefined =>
  (REGISTERS[register]?.fields as (FieldDecl & { scope?: { same?: string }; retired?: boolean })[] | undefined)?.find(
    (f) => f.scope !== undefined && !f.retired,
  );

/**
 * A project's rows, then the rows that apply everywhere, as the kernel's `inScope` decides it: where
 * the register says the nearer wins, an open project row hides a global row of the same title.
 * `own` is how many of `entries`, at the front, are the project's.
 */
function inheritFor(register: string, all: Entry[], b: PageBlock): { entries: Entry[]; refusals: string[]; own: number } {
  const none = (refusal: string) => ({ entries: [], refusals: [refusal], own: 0 });
  const decl = REGISTERS[register];
  const scope = scopeFieldOf(register);
  if (!decl || !scope) return none(`inherit: ${register} has no field that says where its rows apply, so there is nothing to inherit`);
  const w = compile(register, b.where);
  if (w.bad.length) return { entries: [], refusals: explain(w), own: 0 };
  const home = w.clauses.find((c): c is Extract<typeof c, { values: string[] }> => c.field === scope.id && c.op === 'is' && c.values.length === 1);
  if (!home) return none(`where: a block that inherits names its project, as ${scope.id} is <project>`);

  const said = home.values[0]!.trim().toLowerCase();
  const projects = scope.to ? (ROWS[scope.to] ?? []) : [];
  const projectTitle = scope.to ? REGISTERS[scope.to]?.title : undefined;
  const project = projects.find((p) => String(p.seq) === said || String(p.fields[projectTitle ?? ''] ?? '').toLowerCase() === said);
  const at = (e: Entry): boolean => {
    const v = e.fields[scope.id];
    return project !== undefined && (Array.isArray(v) ? v.includes(project.seq) : v === project.seq);
  };

  const title = decl.title ?? '';
  const done = new Set<string>(decl.done ?? []);
  const open = (e: Entry): boolean => !done.has(String(e.fields[decl.state ?? ''] ?? ''));
  const claimed = new Set(scope.scope?.same === 'nearer' ? all.filter((e) => at(e) && open(e)).map((e) => String(e.fields[title] ?? '')) : []);
  const rest = { ...w, clauses: w.clauses.filter((c) => c !== home) };

  const order = b.order?.[0];
  const sorted = (list: Entry[]) => (order ? sortRows(register, list, order.field, order.dir ?? 'asc') : list);
  const own = sorted(all.filter((e) => at(e) && matches(e, rest, NOW)));
  const global = sorted(all.filter((e) => absent(e.fields[scope.id]) && matches(e, rest, NOW) && !claimed.has(String(e.fields[title] ?? ''))));
  return { entries: [...own, ...global], refusals: [], own: own.length };
}

/** The shell every block that is not a register's rows returns, so each says only what it adds. */
const computed = (b: PageBlock, refusals: string[]): BlockResult => ({
  ...b,
  register: undefined,
  columns: [],
  entries: [],
  matched: [],
  refusals,
  rows: [],
  shown: 0,
  total: 0,
  drawn: b.drawn ?? drawnWhen(b),
  stale_at: new Date(NOW).toISOString(),
  metrics: undefined,
});

/** The kinds of actor a feed groups by, the kernel's `FEED_BY`. */
const FEED_KINDS: readonly string[] = ['agent', 'rule', 'you'];

/** The kind of actor behind a ledger event, the kernel's `byOf` over this build's spelling of actors. */
const feedByOf = (by: string): FeedRow['by'] => (by === 'you' ? 'you' : /^rule[.:]/.test(by) || by === 'system' ? 'rule' : 'agent');

/**
 * A feed over the ledger: a run of events by one actor, of one kind, on one row is one row with a
 * count, and past `first:` rows a group's remainder is one row. The kernel's `feedRows`, mirrored.
 */
function activityBlock(b: PageBlock): BlockResult {
  /* THE THREE THINGS A FEED'S `where:` MAY ASK, each `is` or `is not`, joined by `and`. */
  type Asked = { actor: string; kind: string; target: string };
  const tests: ((e: Asked) => boolean)[] = [];
  const bad: string[] = [];
  for (const part of (b.where ?? '').split(/\s+and\s+/i).filter((p) => p.trim())) {
    const m = /^\s*(actor|kind|target)\s+is(\s+not)?\s+(.+?)\s*$/i.exec(part);
    if (!m) {
      bad.push(`where: a feed asks about actor, kind or target, and "${part.trim()}" is none of them`);
      continue;
    }
    const field = m[1]!.toLowerCase() as keyof Asked;
    const values = m[3]!.split(/\s+or\s+|,\s*/i).map((v) => v.trim());
    if (field === 'actor' && values.some((v) => !FEED_KINDS.includes(v))) bad.push('where: an actor is agent, rule or you');
    const negate = m[2] !== undefined;
    tests.push((e) => values.includes(e[field]) !== negate);
  }
  if (bad.length) return computed(b, bad);

  const kept = AUDIT.filter((e) => tests.every((t) => t({ actor: feedByOf(e.by), kind: e.kind, target: e.target ?? '' })));
  const bursts: FeedRow[] = [];
  for (const e of kept) {
    const last = bursts.at(-1);
    if (last && last.who === e.by && last.kind === e.kind && last.target === (e.target ?? null)) last.count += 1;
    else bursts.push({ by: feedByOf(e.by), who: e.by, count: 1, kind: e.kind, target: e.target ?? null, note: e.note ?? null, at: e.at });
  }
  let feed = bursts;
  if (b.first !== undefined) {
    const cap = Math.min(50, Math.max(1, Math.floor(b.first)));
    const taken = new Map<string, number>();
    const rest = new Map<string, FeedRow>();
    feed = [];
    for (const row of bursts) {
      const n = taken.get(row.by) ?? 0;
      taken.set(row.by, n + 1);
      if (n < cap) feed.push(row);
      else {
        const folded = rest.get(row.by);
        if (folded) folded.count += row.count;
        else rest.set(row.by, { by: row.by, who: null, count: row.count, kind: null, target: null, note: null, at: row.at });
      }
    }
    feed.push(...rest.values());
  }
  /* A DEMO READER HAS NO READ MARK, so the seen row carries no time: the renderer's "not looked yet". */
  return {
    ...computed(b, []),
    feed,
    ...(b.since === 'seen' ? { seen: null } : {}),
    ...feedTable(feed, b.since === 'seen', null, NOW),
    total: kept.length,
  };
}

/** When a feed row happened, in words: a day against today, and an instant as how long ago. */
const whenOf = (at: string, now: number): string => (/^\d{4}-\d{2}-\d{2}$/u.test(at) ? relative(at, now) : since(at, now));

/**
 * A feed's rows as the renderer reads them, `by | who | count | what | when`, with the `seen` row.
 *
 * ONE SHAPE FOR THE SAMPLE'S FEED AND A RECORD'S. On a feed that marks what is new, the `seen` row sits
 * below the rows newer than the reader's read mark, which the renderer draws as new, and says when that
 * was. A reader with no mark yet gets it at the end with no time, which is the renderer's "not looked yet".
 */
export function feedTable(feed: readonly FeedRow[], marks: boolean, seen: string | null, now: number): Pick<BlockResult, 'rows' | 'shown'> {
  const rows: TableRow[] = feed.map((r, i) => ({
    key: `${r.at}-${i}`,
    cells: [r.by, r.who === null ? '' : actorOf(r.who), String(r.count), r.note ?? [r.kind, r.target].filter(Boolean).join(' '), whenOf(r.at, now)],
    href: undefined,
    tone: undefined,
  }));
  if (marks) {
    const at = seen === null ? -1 : feed.findIndex((r) => r.at <= seen);
    rows.splice(at === -1 ? rows.length : at, 0, { key: 'seen', cells: ['seen', seen === null ? '' : whenOf(seen, now)], href: undefined, tone: undefined });
  }
  return { rows, shown: feed.length };
}

/**
 * A diff over one row's text field. THIS BUILD KEEPS NO FIELD HISTORY, so a row has one version, the
 * one it holds, and the block draws that version with nothing to compare it to.
 */
function diffBlock(b: PageBlock): BlockResult {
  const register = b.source?.startsWith('register.') ? b.source.slice('register.'.length) : undefined;
  if (!register || !REGISTERS[register]) return computed(b, [`source: ${b.source ?? ''} is not a register this build holds`]);
  if (!b.row) return computed(b, ['row: a diff names the row whose history it reads, as row: skills#2']);
  if (!b.field) return computed(b, ['field: a diff names the field it compares, as field: body']);
  const decl = REGISTERS[register]!.fields.find((f) => f.id === b.field);
  if (!decl) return computed(b, [`field: there is no field called ${b.field} on ${register}`]);
  if (decl.type !== 'document' && decl.type !== 'text') return computed(b, [`field: a diff compares text, and ${b.field} is ${decl.type}`]);
  const seq = Number(/(\d+)$/.exec(b.row)?.[1]);
  const row = (ROWS[register] ?? []).find((e) => e.seq === seq);
  if (!row) return computed(b, [`row: ${b.row} is not a row of ${register}`]);
  const text = row.fields[b.field];
  const history = typeof text === 'string' ? [{ at: row.created, by: row.by, text }] : [];
  return {
    ...computed(b, []),
    history,
    ...historyTable(history, history.length),
  };
}

/**
 * A diff block's lines: the newest version against the one before it, as the renderer reads them. One
 * version has nothing to compare with and draws no line. `total` is every version the row has held.
 */
export function historyTable(history: readonly { text: string }[], total: number): Pick<BlockResult, 'rows' | 'shown' | 'total'> {
  return {
    rows:
      history.length > 1
        ? diffRows(history[1]!.text, history[0]!.text).map((line, i) => ({ key: String(i), cells: [line], href: undefined, tone: undefined }))
        : [],
    shown: history.length,
    total,
  };
}

/**
 * THE MOST ROWS ANY SURFACE PUTS IN A DOCUMENT, and the number `13 §4.3` gives.
 *
 * It lived as a `const DOM_CAP = 2000` inside the register route, so it was the register's rule
 * rather than the product's — and every other list in the build rendered every row it held. A saved
 * view is the register's list with a different filter and had no cap at all; `/audit` grows with
 * WRITES rather than rows, so on a busy record it is the longest list in the product; `/inbox` is
 * where one bad ingest rule puts thousands of arrivals, and it is the screen you need at exactly
 * that moment.
 *
 * `22 §4` measures the cost: ~27 µs a row on a desktop and ~167 µs at 4× throttle, at nine nodes a
 * row — so five thousand rows is *"~833 ms of build on a mid-tier phone no matter what CSS you
 * write"*. The way past it is a filter or an export, never a virtualised scroll.
 */
export const DOM_CAP = 2_000;

/**
 * `33 §2`'s CEILING, and the page a grid asks for.
 *
 * The contract's `limit` defaults to 25 and caps at 200; this function's default is **the whole
 * answer**, because every caller but the grid wants a count, a metric or a forecast and paging one
 * of those would be a cap nobody asked for. An earlier comment here said "25 by default", which its
 * own docstring thirty lines down contradicted.
 */
export const PAGE = 200;

/**
 * One page of a list, and where the next one starts.
 *
 * `13 §4.3` SPECIFIES THREE MECHANISMS AND THIS TREE HAD ONE AND A HALF. Rows arrive in *"200-row
 * keyset pages into rowgroups of 100 under `content-visibility`; the DOM caps at 2,000 with a
 * visible cap line"*. The rowgroups are built and correct. The cap line is built and correct. The
 * pages did not exist: this function took a filter and a sort and returned every row the register
 * held, so `DOM_CAP` was not the END of a paging sequence, it was a substitute for one.
 *
 * KEYSET, NOT OFFSET, WHICH IS WHY THE CURSOR NAMES A ROW. `33 §2` chose it deliberately: an offset
 * shifts under a concurrent write, so page two silently skips or repeats whatever moved across the
 * boundary. The cursor here is the `seq` of the last row of the page before, and the next page
 * starts after that ROW rather than at that COUNT — so a row inserted above it changes nothing.
 *
 * A CURSOR THAT NO LONGER RESOLVES IS `stale`, NOT AN EMPTY PAGE. If the answer changed underneath —
 * the filter moved, the row was archived — the honest response is to say the sequence is broken and
 * let the caller start again. Returning `[]` would look like the end of the list, which is the one
 * answer that is indistinguishable from a correct one.
 *
 * NO `limit` MEANS THE WHOLE ANSWER, which every existing caller wants and which is what a count,
 * a metric and a forecast read. Paging is something a *grid* does.
 *
 * AND THE MOCK RECOMPUTES THE FILTER PER PAGE, which the real record does not. That is worth saying
 * plainly rather than hiding: this is a fidelity exercise in the SHAPE of the answer, not in its
 * cost. Its value is that it forces the head count, `⌘a`, the sort chips and the empty states to be
 * written against a PARTIAL answer — which is what `call('list', …)` will return, and what none of
 * them assumed while this returned everything.
 */
export function list(
  register: string,
  opts: {
    filters?: Filter[];
    q?: string;
    sort?: { field: string; dir: 'asc' | 'desc' };
    /** Rows per page. Clamped to `33 §2`'s ceiling of 200. Absent means the whole answer. */
    limit?: number;
    /** The `seq` of the last row of the previous page. */
    cursor?: string;
  } = {},
) {
  const all = ROWS[register] ?? [];
  const filtered = applyFilters(register, all, opts.filters ?? [], opts.q);
  const sorted = opts.sort ? sortRows(register, filtered, opts.sort.field, opts.sort.dir) : filtered;
  const key = questionKey(register, opts);

  if (opts.limit === undefined)
    return { entries: sorted, total: all.length, matched: filtered.length, cursor: null, stale: false };

  /* `NaN` SURVIVED THIS CLAMP AND CAME BACK AS THE END OF THE LIST. `Math.floor(NaN)` is `NaN` and
     both `Math.max` and `Math.min` propagate it, so `slice(0, NaN)` was `[]` and the answer was
     `{ entries: [], cursor: null }` — the empty page this function's own comment says it refuses to
     give, because it is indistinguishable from a finished walk. */
  const asked = Number(opts.limit);
  const limit = Number.isFinite(asked) ? Math.min(Math.max(1, Math.floor(asked)), PAGE) : PAGE;

  let from = 0;
  if (opts.cursor !== undefined) {
    const at = cursorAt(sorted, key, opts.cursor);
    if (at === -1) return { entries: [], total: all.length, matched: filtered.length, cursor: null, stale: true };
    from = at + 1;
  }

  const page = sorted.slice(from, from + limit);
  const last = page[page.length - 1];
  return {
    entries: page,
    total: all.length,
    matched: filtered.length,
    /* NULL AT THE END OF THE ANSWER, and only there. A cursor pointing at the last row would ask the
       caller for one more page that is always empty, and an observer watching a sentinel would keep
       firing at the bottom of a finished list. */
    cursor: last && from + limit < sorted.length ? `${key}:${last.seq}` : null,
    stale: false,
  };
}

/**
 * A CURSOR NAMES A ROW **IN ONE ANSWER**, and it used to name only the row.
 *
 * `findIndex` on a bare `seq` finds that row wherever it happens to sit, so a cursor taken from an
 * ascending page and handed to the descending answer resumed at index 2,415 of 2,614 and reported
 * `stale: false` — silently skipping 2,415 rows. The grid resets its pages when the question changes,
 * so it was not reachable through the screen; the API had no guard and nothing tested it, which is
 * how it would have reached the first caller that did not reset.
 *
 * The question is part of the cursor now. `33 §2` calls a cursor opaque, and this is what opaque
 * buys: a cursor from a different question does not resolve, so the answer is `stale` — start again —
 * rather than a page from the middle of somewhere else.
 *
 * AND THE SAME QUESTION HASHES THE SAME WAY, WHICHEVER ORDER IT WAS BUILT IN. This was
 * `JSON.stringify` over the options as handed in, and `JSON.stringify` preserves key order — so
 * `{ field, op, values }` and `{ op, values, field }` were two different questions over the same 38
 * rows in the same order, as were `values: ['open','part','paid']` and `['paid','part','open']`, and
 * `sort: { field, dir }` and `{ dir, field }`. A caller that rebuilt its options object with a
 * different key order got `stale` on every `more()`: refetch page one, keep the new cursor, fire the
 * observer, `stale` again — an unbounded reset loop that never advances a row. That is precisely
 * *"the first caller that did not reset"* the paragraph above names, arriving through the guard
 * rather than past it.
 *
 * A filter is written out field by field in a fixed order; the filters and each `values` list are
 * SORTED, because `state in (open, paid)` and `state in (paid, open)` are the same question and a
 * reader who dragged a chip has not asked a new one.
 */
const questionKey = (
  register: string,
  opts: { filters?: Filter[]; q?: string; sort?: { field: string; dir: 'asc' | 'desc' } },
): string => {
  const said = JSON.stringify([
    register,
    (opts.filters ?? [])
      .map((f) => [f.field, f.op, [...f.values].sort()] as const)
      .sort((x, y) => (x[0] === y[0] ? x[1].localeCompare(y[1]) : x[0].localeCompare(y[0]))),
    opts.q ?? '',
    opts.sort ? [opts.sort.field, opts.sort.dir] : null,
  ]);
  let h = 5381;
  for (let i = 0; i < said.length; i++) h = ((h * 33) ^ said.charCodeAt(i)) >>> 0;
  return h.toString(36);
};

const cursorAt = (rows: readonly Entry[], key: string, cursor: string): number => {
  const at = cursor.lastIndexOf(':');
  if (at === -1 || cursor.slice(0, at) !== key) return -1;
  const seq = cursor.slice(at + 1);
  return rows.findIndex((e) => String(e.seq) === seq);
};

/**
 * WHO DID IT, IN WORDS. `rule.renewal` and `rule.reply` are declaration ids, and every surface that
 * answers "who changed my record" answers a question nobody asks in dotted notation.
 *
 * IT LIVED IN `/audit` AND HOME DREW THE RAW ID. Two of the six actors in "Since you were away" were
 * `rule.reply` and `rule.renewal`, while the audit log one route over rendered the same two as
 * "reply rule" and "renewal rule" — the same fact, on the same record, spelled two ways, and the
 * screen a person lands on had the machine's spelling. A function two surfaces need is not a detail
 * of one of them.
 */
export const actorOf = (by: string): string => {
  const rule = /^rule\.(.+)$/.exec(by);
  if (rule) return `${rule[1]!.replace(/[._]/g, ' ')} rule`;
  /* THE TWO ACTORS THAT ARE NEITHER PEOPLE NOR RULES. `30 §3` closes the grammar at five shapes and
     two of them are bare words: `spark` is the assistant — *"only ever on `suggest`, `propose` or
     `predict`, never on a row write"* — and `system` is *"migrations, purges, the scheduler itself,
     the dead-letter suggestion"*.

     They arrived on this screen the day the ledger gained a nightly backup and a proposal, and they
     arrived as themselves: a filter chip reading `system` beside one reading `You`. `19 §9` is
     about exactly that — the schema's word on a surface a person reads — and *who backed up my
     record* is answered by "the record itself", not by a principal name. */
  if (by === 'system') return 'the record itself';
  if (by === 'spark') return 'the assistant';
  return by;
};

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
  /** The searchable field that answered, when the title did not — `find.ts`'s `why`. */
  why?: string;
};

/**
 * Everything in the record that answers what was typed — by the declaration, not by the title.
 *
 * THIS HEADING SAID "whose title contains" for a version and a half after it stopped being true. The
 * correction went in forty-eight lines below, inside the loop, which is the append-a-correction shape
 * this codebase keeps finding: a reader who stops at the summary has read the old behaviour.
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
/**
 * What a search found, and how much of it you are being shown.
 *
 * IT USED TO RETURN AN ARRAY AND NOTHING ELSE, so every caller knew what it had and none of them
 * could know what it was missing. The palette asked for eight, printed eight, and said nothing —
 * on the surface `19 §4` makes the primary way to reach a row. Worse than a flat cap of eight: the
 * round-robin below hands one hit per source per round, so across nine sources a budget of eight is
 * frequently ONE ROW PER LIST, and the comment beside it says the rotation was added precisely
 * because *"nothing on screen said the list was partial"*. The distribution was fixed and the
 * silence was not.
 *
 * `total` COSTS ONE COUNTER inside loops that already run. `groups` is the same hits kept in their
 * lists rather than interleaved, which is what a results PAGE wants and a ranked palette does not.
 */
export type SearchResult = {
  /** The round-robined hits, at most `limit`. */
  hits: SearchHit[];
  /** How many rows matched across every list — what the caller is not showing. */
  total: number;
  /** Every list that matched, with its own count and the address that holds the rest. */
  groups: { kind: string; total: number; hits: SearchHit[]; href: string | null }[];
};

export function search(q: string, limit = 24): SearchResult {
  const needle = q.trim().toLowerCase();
  const want = terms(q);
  if (!want) return { hits: [], total: 0, groups: [] };

  const groups: SearchHit[][] = [];

  for (const [id, r] of Object.entries(REGISTERS)) {
    const group: SearchHit[] = [];
    for (const e of ROWS[id] ?? []) {
      /* THE DECLARATION DECIDES, not this loop. `title.includes(needle)` could not find a row by its
         provider or by the body of its update, and the door this function draws pointed at a list
         that could. One matcher, read from `search:` — see `find.ts`. */
      if (!answers(id, e, q)) continue;
      const title = String(e.fields[r.title] ?? '');
      group.push({
        title,
        /* The register's own name is the GROUP heading these rows sit under, so repeating it on
           every row said the same word twice, eight times down the list. */
        detail: display(id, r.state ?? '', e.fields[r.state ?? '']) ?? '',
        /* AND WHY IT IS HERE, when the title does not contain what was typed. Broadening the match
           past the title means rows arrive under a name that does not answer the query, and a result
           somebody cannot connect to their own typing is one they stop trusting. */
        ...(() => {
          const said = why(id, e, q, title);
          return said === null ? {} : { why: said };
        })(),
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
    /* THE SAME TOKENISATION AS THE ROWS ABOVE. A question is not a register row and has no
       declaration to read, but a query that means one thing in eight groups and something else in
       the ninth is a query nobody can reason about — so the words are split and prefix-matched the
       same way, over the one piece of text a question has. The id still resolves whole. */
    if (want.every((w) => tokensOf(q2.title).some((t) => t.startsWith(w))) || q2.id.toLowerCase() === needle)
      questions.push({ title: q2.title, detail: q2.decided ? 'Decided' : 'Open question', href: `/decide/${q2.id}`, kind: 'Decide', icon: 'decide', spoken: q2.id });
  /**
   * AND THE PAGES, because the screen's own sentence promised them.
   *
   * `/search`'s empty state reads *"Every list, every decision, and every page — by the words in
   * them"*, and this function walked registers and questions. So `renewals` and `overview` — both
   * page titles the palette finds one keystroke away — answered *"Nothing in the record matches"* on
   * the surface `19 §2` calls the structured fallback for when the palette was not enough. The
   * promise shipped as the route became a first-class destination, which is the worst moment for it
   * to be false.
   *
   * No door: `/p/*` is not a filtered list, so the group discloses its cap in a sentence like the
   * questions do.
   */
  const found: SearchHit[] = [];
  for (const [slug, p] of Object.entries(pages()))
    if (p.nav && p.placed !== false && want.every((w) => tokensOf(p.title).some((t) => t.startsWith(w))))
      /* THE GROUP IS HEADED BY THE WORD THE PRODUCT USES FOR IT, AND IT WAS NOT. This wrote the
         literal `Pages` while the rail, the sheet and every other surface say `Pages and lists`
         out of `copy.pages`, so the palette and the navigation named the same thing twice and
         differently. One word, in the file that owns the words. */
      found.push({ title: p.title, detail: p.nav.section, href: `/p/${slug}`, kind: copy.pages, icon: iconFor(p.icon, 'grid') });
  if (found.length) groups.push(found);

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

  return {
    hits,
    total: groups.reduce((n, g) => n + g.length, 0),
    /* The list's own name, off the first hit — every hit in a group carries the same `kind` because
       the group IS one register (or the questions, which unshift themselves in front).

       AND THE ADDRESS THAT HOLDS ALL OF THEM. A results page that caps a group and cannot say where
       the rest is has the defect it was built to fix, one door along; the register's own `q` runs
       the same title match, so the link is the same question asked of one list. The questions group
       has no register, and `/decide` is not a filtered list, so it gets none. */
    groups: groups.map((g) => {
      const first = g[0]?.href ?? '';
      const register = /^\/r\/([a-z0-9_]+)\//.exec(first)?.[1] ?? null;
      return {
        kind: g[0]?.kind ?? '',
        total: g.length,
        hits: g,
        href: register ? `/r/${register}?q=${encodeURIComponent(q.trim())}` : null,
      };
    }),
  };
}

export { AUDIT, AUTH_METHODS, DEPLOYMENT, DEVICES, INBOX, JOB, JOBS, NOW, PACKS, PAGES, PASSKEYS, QUESTIONS, DECIDED, REGISTERS, ROWS, NEWS, SNAPSHOTS, SNAPSHOTS_KEPT, SIGNING_KEY, SOURCES, TODAY, TOKENS, VAULT, VIEWS, PEOPLE_ACCESS };

/**
 * One run, by the id in the address — or `null`, which is a MISS and not a failure.
 *
 * THE ROUTE IGNORED ITS OWN PARAMETER. `/jobs/9` and `/jobs/anything` rendered the same screen with
 * the same fixture under a header printing that fixture's id, so the `[id]` segment was decoration.
 * A route whose segment means nothing is one that gets linked wrongly the first time it is linked.
 */
export const job = (id: string): Job | null => JOBS[id] ?? null;
