/**
 * How the app draws what a record answers: a cell, a column, a row's tone and name, a filter as a sentence, a cash walk,
 * a feed and who did what, with no reading of its own.
 *
 * IT WAS ALSO THE SAMPLE, AND THAT HALF IS GONE. This file answered `boot`, `list`, `entry`, `search`, `page`, `values`,
 * `job` and `metric` out of `data.ts`, as "a synchronous mock" that one day would be swapped for the real client, and
 * re-exported twenty-five of the sample's tables beside them. The client arrived and every live screen reads the record
 * through it, but the helpers those screens draw with lived in the same module as the mock, so the mock shipped with
 * them and six screens still called it: the Add a block previews, `/s/<token>`, `/jobs/<id>`, the aim on `/decide`, the
 * pen in Settings and the shell's own type (DIRECTION 26, `loop/research-no-sample.md` wave B2). The readers are in
 * `fixtures/readers.ts` now, which only a test may import, and `no-sample-b2.test.ts` holds both halves of that.
 *
 * AND NOTHING HERE READS THE SAMPLE NOW. Until wave C1 `ROWS` was the fallback of `display`, `identityOf` and
 * `spokenRow` when a caller handed no `names`, and all of `currencyFor`, `homeCurrency` and `hueOf`, and the
 * sample's `PACKS` named an add-on in `setupSaid` and `packDiff`. The rows, the row names and the declarations are
 * `held.ts`'s, which only the record fills in a shipped tab, and a module's name is `modules.ts`'s.
 */

import { agentDoing, day as fmtDay, diffRows, money, relative, shortDay, since, integer, MISSING } from 'braindog-render';
import type { Column, TableRow } from 'braindog-render/svelte';
import { ruleName, useCaseName } from '@braindog/seed/usecases/names';
import { STALE_MS, type Bars, type MeasureSeries, type Part, type QueueQuestion, type Rate } from '@braindog/kernel';

import { amountOf, currencyOf, homeOf } from './money.ts';
import { isGlyph, type IconName } from '../ui/icons.ts';
import { copy } from '../copy.ts';
import { PAGES, REGISTERS, ROWS, TITLES } from './held.ts';
import { MODULES, moduleOf } from './modules.ts';
/* Type only, and there is no cycle: `remote.ts` reads the declaration and the sample, never this file. */
import type { Names } from './remote.ts';
import { compile, declaredValue } from './where.ts';
import type { MetricDecl } from './metrics.ts';
import type { Entry, Fields, Filter, FieldDecl, PackInfo, PageBlock, RegisterDecl } from './schema.ts';
import type { CallOut } from './actions.ts';
import { listLine } from './tags.ts';

/* THE DECLARATIONS EVERY HELPER BELOW READS, which are `held.ts`'s and not a copy: a list the record taught this tab is
   the list a cell here is drawn from. */
export { REGISTERS };

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

/* ── values ──────────────────────────────────────────────────────────────── */

/** WHAT A REGISTER SAYS A FIELD IS. Exported because the live path has to ask the same question
   the sample path asks, and answering it twice is how the two came to disagree. */
export const decl = (register: string, field: string): FieldDecl | undefined =>
  REGISTERS[register]?.fields.find((f) => f.id === field);

/**
 * A COLUMN'S HEADING: the label its block gives it, or over a list's title field the word for one of its rows, as the list
 * is labelled, so a team whose tasks are Tickets reads Ticket over them. Any other column is headed by its field id, as
 * it always was.
 */
export const columnHeading = (register: string, c: { field: string; label?: string | undefined }): string => {
  if (typeof c.label === 'string') return c.label;
  const list = REGISTERS[register];
  const one = list && list.title === c.field ? list.one : undefined;
  return typeof one === 'string' && one ? one.charAt(0).toUpperCase() + one.slice(1) : c.field;
};

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
/**
 * A ROW NOBODY NAMED, SAID AS ITS KIND AND NUMBER: `Course #1`, never `courses#1`. A ref to a row with
 * no title, or to a row the record did not name, drew the stored spoken id in a table cell, which is
 * the string a person never says. `label` is the field's own label, for a list this build does not
 * declare.
 */
export function unnamed(register: string, seq: number | string, label?: string): string {
  const kind = REGISTERS[register]?.one ?? label ?? register.replace(/_/g, ' ');
  return `${kind.charAt(0).toUpperCase()}${kind.slice(1)} #${seq}`;
}

/** A spoken id as a person writes it and a tool call passes it: `things#1`. */
const SPOKEN_ID = /^([a-z][a-z0-9_]*)#([1-9][0-9]*)$/;

/**
 * WHAT A SPOKEN ID HELD AS TEXT READS AS, AND WHERE IT OPENS. A run holds its project as `things#1` and
 * a tool call reads `tracks#1`; both drew the id. The name comes from `names` when the screen is
 * drawing a record, and from the names this tab has learnt otherwise, and a row with no name reads as `unnamed`.
 */
export function spokenRow(value: unknown, names?: Names): { label: string; href: string } | null {
  const m = typeof value === 'string' ? SPOKEN_ID.exec(value) : null;
  if (!m) return null;
  const [, register, seq] = m as unknown as [string, string, string];
  const titleField = REGISTERS[register]?.title;
  const said = names
    ? names.get(value as string)
    : titleField
      ? TITLES.get(register)?.get(Number(seq))
      : undefined;
  const label = typeof said === 'string' && said.trim() !== '' ? said : unnamed(register, seq);
  return { label, href: `/r/${register}/${seq}` };
}

/** Money when the walk knows its currency, and the bare integer when there is nothing to say. */
const moneyOr = (minor: number, currency: string | null): string => (currency === null ? integer(minor) : money(minor, currency));

/** What a `duration`'s declared unit is worth in the seconds the record stores. */
const SECONDS: Record<string, number> = { s: 1, m: 60, h: 3_600, d: 86_400, w: 604_800 };

/**
 * `now` IS THE RECORD'S INSTANT, and it defaults to this browser's. A screen reading a real record passes
 * the one `boot` answered with, so an `instant` is banded against the day the record thinks it is. The default was
 * the seed's frozen 3 September 2026, so a live screen that passed nothing banded a record's instants against the
 * sample's day; the sample's readers in `fixtures/readers.ts` pass the sample's clock themselves.
 */
export function display(
  register: string,
  field: string,
  value: unknown,
  now: number = Date.now(),
  names?: Names,
): string | null {
  if (value === null || value === undefined || value === '') return null;
  /* A LIST READS AS ITS ELEMENTS, and never with the tags the record keeps for itself (`tags.ts`). */
  if (Array.isArray(value)) return listLine(value);
  /* AN AGENT BY ITS NAME: the field holds what the agent signs with, `claude`, and a card read "claude" beside "Changed by
     Claude". A lower-case word is said with its capital, on any list; anything else is left as it was typed. */
  if (field === 'agent' && typeof value === 'string' && /^[a-z][a-z0-9-]*$/u.test(value)) return value.charAt(0).toUpperCase() + value.slice(1);
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
      /* A PERCENTAGE SITS ON ITS FIGURE, "60%", as every share on the screen is written; another unit keeps its space. */
      return `${shown}${f.unit ? `${f.unit === '%' ? '' : ' '}${f.unit}` : ''}`;
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
      if (names) return names.get(`${f.to}#${value}`) || unnamed(f.to ?? register, String(value), f.label);
      /* AND WITHOUT `names`, THE NAMES THIS TAB HAS LEARNT (`held.ts` `TITLES`). This read the sample's rows, so a
         caller that handed none drew the sample's name for whatever number the record's ref held. */
      const said = f.to ? TITLES.get(f.to)?.get(Number(value)) : undefined;
      return said === undefined || said === '' ? unnamed(f.to ?? register, String(value), f.label) : said;
    }
    case 'secret':
      return '••••••••';
    default:
      /* A RUN'S PROJECT IS HELD AS A SPOKEN ID, and reads as the project's name. */
      if (register === 'session' && field === 'project') return spokenRow(value, names)?.label ?? String(value);
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
export function toneOf(register: string, e: Entry, now: number = Date.now()): TableRow['tone'] {
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

export function toRows(register: string, entries: Entry[], columns: Column[], now: number = Date.now(), names?: Names): TableRow[] {
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
    /* AND AN ENUM'S LABEL IS ITS VALUE, as the record's parse reads it. `declaredValue` used to match the value's
       own words and not the register's label for it, so `state is Later` came back as `Later`, which tasks do not
       declare, and was dropped here while the kernel filled the same line as `backlog`. `capture-block.test.ts`
       found it on its first run: one `where:`, a task kept for later on a record and an ordinary one on the demo.
       THE REPAIR WAS A SECOND MATCHER, HERE, and it folded case where the kernel's `resolve` also collapses every run
       of spaces and underscores, so `state is to_check` filled `review` on a record and nothing on the demo.
       `declaredValue` reads labels with the kernel's own fold now, and this reads `declaredValue`, so there is one
       matcher. `labels-parity.test.ts` holds it against the kernel. */
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
   It is a SHAPE rather than a reader, and `fixtures/sample.ts` needs it to declare a saved view — which it
   cannot import from this file, because this file imports it. */
export type { Filter };

/**
 * The `f=` chips of an address, as the filters every reader of this app takes.
 *
 * IT WAS FOUR LINES INSIDE THE REGISTER ROUTE and a copy of those four lines in five tests
 * (`api.test.ts` twice, `metrics.test.ts`, `pages.test.ts`, `where.test.ts`), which is the shape
 * that lets a parser be wrong in the route and right in every test of it. The route imports this
 * now, so what a test drives is what the page reads.
 *
 * THE CHIP IS THREE PIECES AT THE FIRST TWO COLONS, AND THE REST OF THE STRING IS THE VALUE. It
 * used to be `raw.split(':')` taking the third piece, and a list element is not a word:
 * `people.handles` holds `git:jokonkwo` and `tools.needs` holds
 * `header:Authorization=credentials#1`, so every value of two of the mirror's eleven list fields
 * carries a colon. `handles:has:git:jokonkwo` parsed as the value `git`, which nobody holds, and the
 * grid came back empty — the one answer indistinguishable from a filter that worked. `registerHref`
 * does encode the value, and `URLSearchParams` hands the colon straight back, so the encoding never
 * reached the split.
 *
 * A COMMA STILL SEPARATES VALUES and that is not the same hole. `compile` splits the `where`
 * sentence on the comma too and says so in place, so a value carrying one cannot be written in
 * either language: a known limitation rather than a silent one, and `list-chips.test.ts` drives the
 * refusal both engines answer with.
 */
export const chipsOf = (params: URLSearchParams): Filter[] =>
  params.getAll('f').map((raw) => {
    const at = raw.indexOf(':');
    if (at === -1) return { field: raw, op: 'is', values: [''] };
    const then = raw.indexOf(':', at + 1);
    return {
      field: raw.slice(0, at),
      op: then === -1 ? raw.slice(at + 1) : raw.slice(at + 1, then),
      values: (then === -1 ? '' : raw.slice(then + 1)).split(','),
    };
  });

/**
 * The address word that joins the chips with "or", read one way wherever an address is read.
 *
 * ANY OTHER SPELLING IS THE PLAIN "and" EVERY ADDRESS WRITTEN BEFORE IT MEANT, so `join=all`, a
 * typo, or no word at all open the list they always opened rather than a refusal on a link that
 * worked yesterday. `whereOf` below and `treeOf` in `remote.ts` take what this answers.
 */
export const joinOf = (params: URLSearchParams): 'any' | undefined => (params.get('join') === 'any' ? 'any' : undefined);

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
 *
 * `join` IS THE ADDRESS WORD `join=any`, AND UNDER IT THE CHIPS ARE JOINED WITH `, or`. One word is
 * the whole of it because both engines refuse a sentence mixing `,` and `, or` (wave two's brief 7),
 * so a set of chips is all "and" or all "or". `applyFilters` and `list` below pass it on the
 * sample, and on a record `treeOf` in `remote.ts` reads the same word into an `any` group, because
 * the list there never reads chips through this sentence. `remote-compare.test.ts` holds the two to
 * the same rows. The address is read by `joinOf` above, and the register route does not read it
 * yet, which is why `registerHref` still mints no such address.
 */
export const whereOf = (filters: Filter[], join?: 'any'): string =>
  filters
    .map((f) => {
      /**
       * THE SIX COMPARE WORDS, SPELLED IN THE CHIP BY THE OPERATOR `compile` GIVES THEM, as `not-on`
       * is. They fell to the last line here, so `amount:gte:GBP 2400` came back as
       * `amount is GBP 2400`, which drew none of the 25 obligations `amount at least GBP 2400`
       * admits, and `what:contains:rent` as `what is rent`, which drew none of three.
       *
       * `between` TAKES ITS TWO ENDS AS TWO VALUES, which is what the chip's comma already means, and
       * one value writes `between 10` for the compiler to refuse by name rather than a range with no
       * top. A range of days never arrives here: `compile` makes it `gte` and `lte`, two chips.
       */
      if (f.op === 'gt' || f.op === 'gte' || f.op === 'lt' || f.op === 'lte') {
        const word = { gt: 'more than', gte: 'at least', lt: 'less than', lte: 'at most' }[f.op];
        return `${f.field} ${word} ${f.values[0] ?? ''}`;
      }
      if (f.op === 'between') return `${f.field} between ${f.values.join(' and ')}`;
      if (f.op === 'contains') return `${f.field} contains ${f.values[0] ?? ''}`;
      if (f.op === 'in') return `${f.field} is ${f.values.join(' or ')}`;
      /* `not-in`, so a URL can say everything the SENTENCE can. Without it a declared metric whose
         predicate negates, `state is not cancelled`, had no link that opened its own rows, and the
         alternative was writing out the enum's complement, which breaks the moment a pack adds a
         value to it. */
      if (f.op === 'not-in') return `${f.field} is not ${f.values.join(' or ')}`;
      if (f.op === 'before' || f.op === 'after') return `${f.field} ${f.op} ${f.values[0] ?? ''}`;
      /**
       * `not-on`, THE NEGATION OF A DATE CLAUSE, WHICH CAME BACK AS ITS OWN COMPLEMENT.
       *
       * `registerHref` minted `f=due:not on:today` for `due is not today`, the compiled operator
       * written into the chip verbatim, and the chip fell past every arm here to `<field> is <value>`
       * and came back `due is today`. Measured on the shipped mirror: the sentence admits all 40
       * obligations and the chip drew 0 of them, because nothing there is due today. A filter that
       * quietly inverts is the one failure that module exists to prevent.
       *
       * THE CHIP SPELLS IT WITH A HYPHEN for the reason `not-in` does: a raw space in a URL is not a
       * chip anybody reads back, and `pages.test.ts` asserts no declared block's link carries one.
       *
       * `on` NEEDS NO ARM AND DELIBERATELY HAS NONE, because `<field> is <a day>` on a dated field IS
       * the `on` clause: `due:on:today` falls to the last line as `due is today` and compiles to the
       * clause it was minted from, which is the fold the record's own `ORDERED` table makes when it
       * reads the word. A second arm would be one more spelling of one clause to keep in step.
       */
      if (f.op === 'not-on') return `${f.field} is not ${f.values[0] ?? ''}`;
      /**
       * `has` AND `lacks`, THE TWO OPERATORS ONLY A LIST TAKES, and until they were written here
       * nothing outside `where.ts` could spell either one.
       *
       * They fell to the line below and came back as `repos is portage`, which both engines now
       * refuse: *"repos is a list, which cannot be asked \"is\""*. So the one shape a list filter
       * could arrive in, a chip, from a link, from a metric or a saved view, was the one shape that
       * could not be read, and `registerHref` answered the whole register for any predicate carrying
       * a list clause because of it. It mints the narrow address now, and this line is the reader
       * that made that possible.
       *
       * ONE VALUE, WHICH IS THE GRAMMAR'S RULE AND NOT A NARROWING CHOSEN HERE. `where.ts` types the
       * clause `values: [string]` because the operator looks for a single element inside a list, and
       * `tags has urgent or soon` would otherwise look for a tag literally called `urgent or soon`.
       * Joining the rest on ` or ` would have written a sentence the compiler refuses by name, so
       * the first value is the value.
       */
      if (f.op === 'has' || f.op === 'lacks') return `${f.field} ${f.op} ${f.values[0] ?? ''}`;
      return `${f.field} is ${f.values[0] ?? ''}`;
    })
    .join(join === 'any' ? ', or ' : ', ');

/** `names` is a live record's, as `display` takes it: a ref column on a record sorts by the record's names. */
export function sortRows(register: string, entries: Entry[], field: string, dir: 'asc' | 'desc', names?: Names): Entry[] {
  const sign = dir === 'asc' ? 1 : -1;
  /* TWO ROWS WITH ONE VALUE GO NEWEST FIRST, in either direction, because that is the record's own tie-break: its sorted
     list orders by the field and then `id DESC`, and an id is minted in the order rows are made, as a number is. Oldest
     first here put two tasks due on one day in one order on the sample and the other on a real record. */
  const tie = (a: Entry, b: Entry): number => b.seq - a.seq;
  return [...entries].sort((a, b) => compareRows(register, a, b, field, sign, names) || tie(a, b));
}

/**
 * TEXT IN THE RECORD'S ORDER, which is one rule in both engines: without regard to case (ASCII letters folded, as SQLite's
 * `NOCASE` folds them), then by the stored text to break a tie. `localeCompare` here and byte order in the kernel put a
 * mixed-case column in two orders, and a page that is whole is sorted here while a longer one is sorted there.
 */
const foldCase = (s: string): string => s.replace(/[A-Z]/gu, (c) => c.toLowerCase());
const textOrder = (x: string, y: string): number => {
  const fx = foldCase(x);
  const fy = foldCase(y);
  if (fx !== fy) return fx < fy ? -1 : 1;
  return x === y ? 0 : x < y ? -1 : 1;
};

function compareRows(register: string, a: Entry, b: Entry, field: string, sign: number, names?: Names): number {
  if (field === 'seq') return (a.seq - b.seq) * sign;
  const x = a.fields[field];
  const y = b.fields[field];
  if (x === y) return 0;
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
   *
   * NO CLOCK IS PASSED, because a ref reads as a name and a name is the same at any hour. This passed the sample's
   * frozen `NOW`, which was the only reason the sort of a live list imported the sample's clock at all.
   */
  const decl = REGISTERS[register]?.fields.find((f) => f.id === field);
  if (decl?.type === 'ref') {
    const sx = display(register, field, x, undefined, names) ?? '';
    const sy = display(register, field, y, undefined, names) ?? '';
    return textOrder(sx, sy) * sign;
  }

  /**
   * AN ENUM SORTS BY ITS POSITION IN `values`, as the record's `list` does, and it sorted by the label where it had one
   * and the stored word where it did not. `tasks.priority` read High, Low, Normal, Urgent ascending, and the sample's
   * tasks by state put Later (`backlog`) after Dropped. Declared order is his call 1 in
   * `loop/research-living-in-it.md` section 8, taken for him as the survey's default and reversible here and in the
   * kernel's `list`. A word outside `values` goes after every declared one, and an empty value has gone last above.
   */
  const declared = decl?.type === 'enum' ? decl.values : undefined;
  if (declared?.length) {
    const at = (v: unknown): number => {
      const i = declared.indexOf(String(v));
      return i < 0 ? declared.length : i;
    };
    return (at(x) - at(y)) * sign;
  }

  /* TEXT SORTS WITHOUT CASE, everything else compares. `<` on strings alone put every capital above every lowercase,
     "Zebra" before "apple". It is the record's rule (`textOrder`), not the reader's collation, so the two engines agree.
     Numbers and ISO days are left alone: money is an integer and must compare by magnitude, and `2026-07-27` is
     chronological already precisely because it is written to sort as text, and folds to itself. */
  if (typeof x === 'string' && typeof y === 'string') return textOrder(x, y) * sign;
  /* MONEY IS AN OBJECT, and `{} < {}` is false both ways round — so a column of money sorted into
     whatever order the rows arrived in, which looks exactly like a sort that worked. Within one
     currency it compares by magnitude; across two it groups by code first, because there is no
     order between them and pretending otherwise is the same lie as adding them. */
  const mx = amountOf(x);
  const my = amountOf(y);
  if (mx !== null && my !== null) {
    const cx = currencyOf(x) ?? '';
    const cy = currencyOf(y) ?? '';
    if (cx !== cy) return (cx < cy ? -1 : 1) * sign;
    return (mx - my) * sign;
  }
  return (x < y ? -1 : 1) * sign;
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
 * implementation, and `trackHealth` in `fixtures/readers.ts` is a reading of it against the sample.
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

/** The intent a health carries. `null` is not an alarm — nobody having spoken is not bad news. */
export const healthTone = (h: Health | null): 'good' | 'warn' | 'bad' | undefined =>
  h === 'on_track' ? 'good' : h === 'at_risk' ? 'warn' : h === 'off_track' ? 'bad' : undefined;

/**
 * What a reader sees where a health goes, including when there isn't one.
 *
 * BY THE LABELS THE `updates` DECLARATION'S HEALTH FIELD CARRIES, when the caller hands it. The thread's header read
 * only the table below, so a record labelling `updates.health.on_track` as Fine read Fine on every update's chip and
 * On track in the header above them. The table stays as the words for a health the record does not label, and for a
 * caller with no declaration to hand.
 */
export function healthLabel(t: TrackHealth, updates?: RegisterDecl): string {
  if (t.state === 'not_expected') return 'No update expected';
  if (!t.health) return 'Update missing';
  const words = { on_track: 'On track', at_risk: 'At risk', off_track: 'Off track' } as const;
  const said = updates?.fields.find((f) => f.id === 'health')?.labels?.[t.health] ?? words[t.health];
  return t.state === 'missing' ? `${said}, and stale` : said;
}

/** Every update on a track, newest first, out of the rows a caller hands in. */
export const updatesIn = (updates: readonly Entry[], seq: number): Entry[] =>
  updates
    .filter((u) => Number(u.fields.track) === seq)
    .sort((a, b) => String(b.fields.at).localeCompare(String(a.fields.at)));

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

/** A run's spoken id, `S1`, which is the name the kernel signs its writes with. */
export const runName = (run: Entry): string => `${REGISTERS.session?.seq_prefix ?? 'S'}${run.seq}`;

/**
 * Whether a run is working now: active, and heard from within the kernel's 45 minutes. Worked out on
 * read, as the kernel does, because a run that crashed never says so.
 */
export const workingAt = (run: Entry, now: number): boolean =>
  run.fields.state === 'active' && now - Date.parse(String(run.fields.last_seen)) < STALE_MS;

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

/* ── the third state of a figure ──────────────────────────────────────────
   There are three engines that turn one reading of one declaration into one tile: `figureTile` in
   `fixtures/readers.ts` for the sample, `news-live.ts` for Home, `page-live.ts` for a declared page.
   The rule below is theirs, and it lives here because this file is the one all three already import,
   so reading it costs no new edge and creates no cycle.

   IT BELONGS IN `metrics.ts`, which is where every other question asked ABOUT a declaration lives:
   `hrefFor`, `offTarget`, `targetSaid` and `withParam` all take a `MetricDecl` and answer something
   about it, and all three engines already import from there. It is here because that file belonged to
   another agent on the run that moved it, and this is the nearest home reachable from all three.
   `50 §1` is this tree's standing bill for the same rule written twice, so it is worth saying plainly
   that `page-live.ts` still holds a copy of `overUnsaidField` and `reducedFields`: the parity test in
   `news-live.test.ts` drives one reading through all three and is what will fail the day they
   differ. */

/** The four aggregations that reduce a FIELD to one number. A count reads rows and is not one of them. */
const REDUCING = ['sum', 'avg', 'min', 'max'] as const;

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

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
 * THIS IS THE LINE BETWEEN THE TWO ZEROES, and it is narrow on purpose. `out-30d` sums `amount` where
 * the obligation is open and due inside a month: nothing matched over forty obligations is GBP 0.00
 * owed, which is the answer that figure exists to give, and it keeps its verdict and its door.
 * `projects-earning` sums `revenue` where `revenue is set`: nothing matched means no row carries the
 * number being added up, so its zero is the absence of an answer rather than one.
 *
 * `compile` IS ASKED RATHER THAN THE SENTENCE BEING READ A SECOND TIME. The grammar spells this clause
 * three ways, `is set`, `is present` and `is not empty`, all of which compile to one `present` clause,
 * and a second reader of the sentence would be a fourth place to get it wrong. A register this build
 * has no declaration for compiles to no clauses, so the tile answers as it did before rather than
 * guessing.
 *
 * AT ANY CLOCK, because only the clauses' shape is read here and a date resolves the same `present` clause on any day.
 * It compiled at the sample's `NOW`, which Home and a declared page imported through this function on a live record.
 */
function overUnsaidField(decl: MetricDecl): boolean {
  const register = decl.source.startsWith('register.') ? decl.source.slice('register.'.length) : null;
  if (register === null) return false;
  const reduced = reducedFields(decl.value);
  if (reduced.length === 0) return false;
  return compile(register, decl.where).clauses.some((c) => c.op === 'present' && reduced.includes(c.field));
}

/**
 * WHAT A REDUCING FIGURE SAYS WHEN THE FIELD IT ADDS UP IS ONE NOBODY HAS FILLED IN.
 *
 * It is the tile's half of the sentence the bar beside it already draws, *"No project in play says
 * what it earns. Put a year on one and it draws here."* That bar can name the field because a
 * declaration wrote its `empty:` for one block; this line is said under any figure, so it names what
 * happened rather than what to type.
 *
 * IT LIVES IN `copy.ts` WITH THE REST OF THE PRODUCT'S SENTENCES, which is where it went the moment
 * one pass owned both files. `page-live.ts` reads the same key through `liveWords.unsaid`, and the
 * parity test holds the two to each other.
 */
export const NO_ROW_SAID = copy.nothingMatched;

/**
 * THE STATE BETWEEN AN EMPTY LIST AND AN ANSWER: THE LIST HOLDS ROWS, AND NOT ONE OF THEM HAS SAID.
 *
 * The kernel's zero rule is written for a COUNT, and its own words are that zero matched over rows
 * that exist is good news (`packages/kernel/src/metrics.ts`). A REDUCING figure turns that sentence
 * over. A sum of no values is zero and the kernel means it to be, so `GBP 0.00` is the same number
 * whether a portfolio earned nothing or nobody has written down what it earns, and `target: { gte: 0 }`
 * on a money sum is met by every value such a sum can take, which is the decoration a target is
 * refused at install for being. So `met: true` carried no measurement and the tile drew a tick anyway.
 *
 * MEASURED AT HIS SIZE, on the record `loop/research-at-scale.md` §1 built: 27 projects, 14 in play, a
 * monthly figure held for three of them and `revenue` unset on every row, because the importer files a
 * monthly figure as a reading and has no year to write. After `a89bc072` put `revenue is set` on the
 * Earning figures the reading is `rows: 0, held: 27`. Driven through the three engines before this
 * function existed, over exactly that reading: Home and the sample both answered `tone: "good"` with
 * `href: /r/things?f=lane:in:building,earning&f=revenue:is:set` and the target line "never below
 * zero", while the declared page answered no tone, no door and the sentence. One figure, three
 * screens, two answers.
 *
 * AN EMPTY LIST IS ASKED FIRST AND WINS, because a list nobody has written to has no field to have
 * filled in: that zero is `held`, it has its own sentence on each surface, and asking this second
 * would have replaced it. `held` is absent on a reading a caller built by hand, and the fallback to
 * `rows` there is the old ambiguous zero, which withholds the verdict rather than inventing one.
 */
export function unsaidFigure(decl: MetricDecl | undefined, r: { rows: number; held?: number }): boolean {
  if (decl === undefined || (r.held ?? r.rows) === 0) return false;
  return r.rows === 0 && overUnsaidField(decl);
}

/* ── the rail ────────────────────────────────────────────────────────────── */

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
 *
 * "THE SET" IS ALL 251, not the 63 the app drew for itself. This checked `PATHS` alone until
 * 24 September, so `icon: rocket`, a name `braindog-render/glyphs` ships, drew a document. The answer is
 * still synchronous: `isGlyph` knows every name up front and only the paths arrive late.
 */
export const iconFor = (declared: string | undefined, fallback: IconName): IconName =>
  declared && isGlyph(declared) ? declared : fallback;

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

export function packDiff(pack: PackInfo, installed: boolean = pack.installed === true): PackDiff {
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
    const owner = MODULES.find((p) => p.registers.includes(id));
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
    unread: !installed,
    calls: pack.calls ?? [],
  };
}

export type BlockResult = PageBlock & {
  /** A `bar` or `split` over a grouped figure: the whole, and each part by its key, largest first. */
  parts?: Parts;
  /** A `bar` or `split` over rows: the record's home currency and dated rates, which it sends beside the rows. */
  fx?: { home: string | null; rates: readonly Rate[] } | undefined;
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
  /**
   * A `queue` block's questions, as the record answered them: what is waiting, who opened it, why,
   * and the ways to answer it. `total` is how many are open, which is how the block knows what it
   * left out.
   */
  queue?: QueueQuestion[];
  /**
   * A `capture` block's: what a row added through it is filled with, by field, in the stored form. The kernel's `fills`,
   * which this engine answers from `inheritedFrom`, the register grid's own add.
   */
  fills?: Record<string, string>;
  /** A `feed` block's rows before they are words, newest first, a burst being one row. */
  feed?: FeedRow[];
  /** On a feed with `since: seen`: the reader's read mark, or `null` when they have none yet. */
  seen?: string | null;
  /** A `diff` block's versions of its field, newest first. */
  history?: { at: string; by: string; text: string }[];
  /** A `forecast.runway` block's walk, which a `bridge` draws from rather than from the table. */
  walk?: Walk;
  /** A walk over several currencies that could not be converted: one walk a currency, and why it is not one. */
  walks?: Walk[] | undefined;
  walkNote?: string | null;
  /** One walk of a walk drawn once per currency: the group its knobs are shared in, and its key there. */
  walkGroup?: { id: string; key: string } | undefined;
  /** A `series` block's buckets and each line's value in them, as the record's `barsOf` lines them up. */
  bars?: Bars;
  /** A `stat` or `lines` over readings: one series a measure, as the record's `measureSeries` works them out. */
  measures?: MeasureSeries[];
  /** A forecast's `recorded:` series over the ninety days before today, oldest first. */
  past?: readonly { at: string; value: number }[];
  /** A forecast's `late:` figure, read: how many days late money has come in on average, or `null` when nothing was paid. */
  lateness?: number | null;
  /** That figure's name as the record declares it, which the late knob is called by. */
  late_name?: string;
  /** A `bar` over a list of links: the money each linked row holds, by the row's id, which the bar adds up per row. */
  linked?: Readonly<Record<string, unknown>>;
  /**
   * A `progress` budget: what its `spent:` figure read, each part by the raw value of the word it groups by. With
   * `toward`, a goal's `toward:` figure, each part keyed by the number of the row it was logged against.
   */
  spentBy?: { metric: string; unit: string | null; groups: { key: string; value: number | null }[]; toward?: boolean };
  /** On a live record: the record's own title for each row a ref on this block points at, so a group is never named from the sample. */
  names?: Names;
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
  /** What the target is called, where the record could say: a row's title. */
  thing?: string | null;
  /** On a `setup` row, how many example rows the record set itself up with. */
  rows?: number;
};

/** One step of a cash walk, as this build's walk and the record's both send it. */
export type WalkStep = { day: string; label: string; delta: number; balance: number; source: string; href?: string; spoken?: string };

/** A cash walk, with only the keys the table reads. The record's `crossed` arrives as a copy of a step, not the step. */
export type Walk = {
  from: number;
  currency: string | null;
  steps: readonly WalkStep[];
  crossed: WalkStep | null;
  /** On a walk drawn once per currency: the opening figure remembered in this walk's currency, oldest first. */
  past?: readonly { at: string; value: number }[] | undefined;
};

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

/** A grouped figure's whole and its parts, as a `bar` or a `split` draws them. */
export type Parts = {
  metric: string;
  value: number | null;
  groups: { key: string; value: number | null; parts?: Part[] }[];
  more: number;
  /** The currency the parts are in, which is the home one once converted; absent when the figure says its format's. */
  unit?: string | null;
};

/** An agent as a person reads its name: `agent:claude` is Claude. A run (`S42`) and the assistant are said as `actorOf` says them. */
const agentNamed = (who: string): string => {
  const named = actorOf(who);
  return /^agent:/u.test(who) ? named.charAt(0).toUpperCase() + named.slice(1) : named;
};

/**
 * An `agents` block's rows as the renderer reads them: `who | count | what | when`. The agent is named as a person reads
 * it, and what it did is the event's note, or the verb and the row it was done to (`agentDoing`).
 */
export function agentsTable(feed: readonly FeedRow[], now: number): Pick<BlockResult, 'rows' | 'shown'> {
  const rows: TableRow[] = feed.map((r, i) => ({
    key: `${r.at}-${i}`,
    cells: [r.who === null ? '' : agentNamed(r.who), String(r.count), r.kind === 'setup' ? setupSaid(r.target, r.rows ?? 0) : agentDoing(r.kind, r.thing ?? r.target, r.note), whenOf(r.at, now)],
    href: undefined,
    tone: undefined,
  }));
  return { rows, shown: feed.length };
}

/**
 * WHO DID IT, AS A PERSON READS IT. A live record signs a person's write with their id, and a feed drew
 * `p_01M2PAZ28BN3FTKQB266DVT4HX` beside every line: the reader is You, and anybody else is somebody on the record.
 */
export const feedWho = (who: string, me: string | null, names: ReadonlyMap<string, string> = new Map()): string => {
  const said = whoDid(who, me, names);
  return said.you && me === null ? actorOf(who) : said.name;
};

/** A person's id as the record signs a write with it: `p_` and a ULID. */
const PERSON_ID = /^p_[0-9A-Z]{20,}$/u;

/**
 * WHO DID IT, BY NAME WHERE THE RECORD HAS ONE. A row's page printed `p_01M2PAZ…` under Added and down its History, and
 * the id ran over "just now" beside it. The reader is You; a person the record names is that name; any other person is
 * Someone on this record; a rule, an agent, the assistant and the record itself are said as `actorOf` says them.
 */
export function whoDid(who: string, me: string | null, names: ReadonlyMap<string, string> = new Map()): { name: string; you: boolean; person: boolean } {
  /* THE SAMPLE SIGNS THE READER'S OWN WRITES `you`. */
  if ((me !== null && me !== '' && who === me) || who === 'you') return { name: copy.feedYou, you: true, person: true };
  const named = names.get(who);
  if (named) return { name: named, you: false, person: true };
  if (PERSON_ID.test(who)) return { name: copy.feedSomeone, you: false, person: true };
  return { name: actorOf(who), you: false, person: false };
}

/**
 * WHAT IT WAS DONE TO, when that is not a row: a feed drew "installed pack:usecase-team" and "suggested suggestion:SG1".
 */
export function feedThing(target: string | null): string | null {
  if (target === null) return null;
  const usecase = /^pack:usecase-([a-z][a-z0-9-]*)$/u.exec(target)?.[1];
  if (usecase) return copy.feedUseCase(useCaseName(usecase));
  const pack = /^pack:(.+)$/u.exec(target)?.[1];
  if (pack) return copy.feedPack(pack);
  return /^suggestion:(SG\d+)$/u.exec(target)?.[1] ?? target;
}

/**
 * A RECORD SETTING ITSELF UP IS ONE LINE (`kernel/src/feed.ts`), on Home and on a feed block alike: the use case it
 * installed, or the add-on, and how many example rows it added, rather than a line a row.
 */
export function setupSaid(target: string | null, rows: number): string {
  if (rows === 0) return copy.setUpLinked;
  const id = (target ?? '').replace(/^pack:/u, '');
  const usecase = /^usecase-([a-z][a-z0-9-]*)$/u.exec(id)?.[1];
  if (usecase) return copy.setUpWith(useCaseName(usecase), rows);
  const names = (moduleOf(id)?.registers ?? []).map((r) => REGISTERS[r]?.name ?? r);
  return names.length > 0 ? copy.setUpWith(names.join(', '), rows) : copy.setUpRows(rows);
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
export function feedTable(feed: readonly FeedRow[], marks: boolean, seen: string | null, now: number, me: string | null = null, names: ReadonlyMap<string, string> = new Map()): Pick<BlockResult, 'rows' | 'shown'> {
  const rows: TableRow[] = feed.map((r, i) => ({
    key: `${r.at}-${i}`,
    cells: [r.by, r.who === null ? '' : feedWho(r.who, me, names), String(r.count), r.kind === 'setup' ? setupSaid(r.target, r.rows ?? 0) : agentDoing(r.kind, r.thing ?? feedThing(r.target), r.note), whenOf(r.at, now)],
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
 * WHO DID IT, IN WORDS. `rule.renewal` and `rule.reply` are declaration ids, and every surface that
 * answers "who changed my record" answers a question nobody asks in dotted notation.
 *
 * IT LIVED IN `/audit` AND HOME DREW THE RAW ID. Two of the six actors in "Since you were away" were
 * `rule.reply` and `rule.renewal`, while the audit log one route over rendered the same two as
 * "reply rule" and "renewal rule" — the same fact, on the same record, spelled two ways, and the
 * screen a person lands on had the machine's spelling. A function two surfaces need is not a detail
 * of one of them.
 */
/**
 * THE COLUMN THAT SAYS WHO CHANGED A ROW LAST, AND WHEN. It is not a field: a register that declares a field
 * called `changed` keeps its own, and every other reads the row's history.
 */
export const CHANGED = 'changed';

/** What is wrong with a column's `sign:`, as the record checks it: an enum on the register, and one of its values. */
export function signFaults(register: string, columns: PageBlock['columns']): string[] {
  return (columns ?? []).flatMap((c) => {
    if (c.sign === undefined) return [];
    const field = decl(register, c.sign?.field ?? '');
    return field?.type === 'enum' && typeof c.sign?.minus === 'string' && (field.values ?? []).includes(c.sign.minus)
      ? []
      : [`columns: sign: names an enum field on ${register} and the value that makes the amount go out, such as { field: direction, minus: owed_by_me }`];
  });
}

/** Only these three sign a run (`session.agent`, `30 §3`): a person or a rule has no run to be at. */
const LIVE_AGENTS = new Set(['claude', 'codex', 'cursor']);

/** The newest ledger event about one exact row, or `null` when nothing has touched it. */
function lastTouchIn(audit: readonly { by: string; at: string; target?: string | undefined }[], register: string, seq: number): { by: string; at: string } | null {
  const target = `${register}#${seq}`;
  const said = audit.filter((a) => a.target === target).sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  return said ? { by: said.by, at: said.at } : null;
}

/**
 * `working: true`'s question, asked with the ledger and the runs handed to it rather than read from
 * the module's own — which is what makes it a function a test can put a made-up row and a made-up
 * run through, the way `workingNow` below puts the record's real ones.
 *
 * NOT WHO CHANGED THE ROW LAST, WHETHER THAT ACTOR IS STILL AT IT: only an agent has a run to be at,
 * so a row last touched by `you` or a rule answers `false` before the runs are even read. Then two
 * clocks, not one — the touch itself has to sit inside the kernel's 45-minute staleness window
 * (`STALE_MS`), because an agent that is still running does not mean it is still on the row it wrote
 * three hours ago, and the run that agent is named on has to be heard from inside that same window
 * (`workingAt`) — the same fact `sessions.live` shows for a run, asked here of a row instead.
 *
 * THE KERNEL ANSWERS THE SAME QUESTION in `pages.ts` `workingOf`, off the row's history rather than
 * off a sample ledger, and `engines.test.ts` holds the two to the same answer.
 */
export function workingNowAt(
  register: string,
  seq: number,
  now: number,
  audit: readonly { by: string; at: string; target?: string | undefined }[],
  runs: readonly Entry[],
): boolean {
  const touch = lastTouchIn(audit, register, seq);
  if (!touch || !LIVE_AGENTS.has(touch.by)) return false;
  if (now - Date.parse(touch.at) >= STALE_MS) return false;
  return runs.some((run) => run.fields.agent === touch.by && workingAt(run, now));
}

/** `You, 3 Sep` or `Reply rule, 9 Sep`: who changed a row last, and the day. */
export const changedText = (by: string, at: string): string => {
  const who = actorOf(by);
  return `${who.charAt(0).toUpperCase()}${who.slice(1)}, ${shortDay(at.slice(0, 10))}`;
};

/**
 * A column's `sign:` and a `changed` column, filled in over the cells `toRows` drew.
 *
 * THE SIGN IS A WORD ON THE FIGURE, never a colour: money going out reads `−GBP 1,350.00` and money coming in
 * `+GBP 4,800.00`, in the same neutral ink (DESIGN-SYSTEM §0 rule 3).
 */
export function markColumns(
  register: string,
  columns: readonly { field: string; sign?: { field: string; minus: string } }[] | undefined,
  entries: readonly Entry[],
  rows: TableRow[],
  changed: (e: Entry, n: number) => { by: string; at: string } | null,
): void {
  (columns ?? []).forEach((c, i) => {
    rows.forEach((row, n) => {
      const e = entries[n];
      if (!e) return;
      if (c.field === CHANGED && decl(register, CHANGED) === undefined) {
        const who = changed(e, n);
        row.cells[i] = who ? changedText(who.by, who.at) : null;
        return;
      }
      const cell = row.cells[i];
      if (!c.sign || typeof cell !== 'string' || cell === '' || cell === MISSING) return;
      const out = e.fields[c.sign.field] === c.sign.minus;
      const bare = cell.replace(/^[−+-]/u, '');
      const negative = cell.startsWith('−') || cell.startsWith('-');
      row.cells[i] = `${out !== negative ? '−' : '+'}${bare}`;
    });
  });
}

export const actorOf = (by: string): string => {
  const rule = /^rule\.(.+)$/.exec(by);
  if (rule) return ruleName(rule[1]!) ?? `${rule[1]!.replace(/[._-]/g, ' ')} rule`;
  /* THE TWO ACTORS THAT ARE NEITHER PEOPLE NOR RULES. `30 §3` closes the grammar at five shapes and
     two of them are bare words: `slash` is the assistant — *"only ever on `suggest`, `propose` or
     `predict`, never on a row write"* — and `system` is *"migrations, purges, the scheduler itself,
     the dead-letter suggestion"*.

     They arrived on this screen the day the ledger gained a nightly backup and a proposal, and they
     arrived as themselves: a filter chip reading `system` beside one reading `You`. `19 §9` is
     about exactly that — the schema's word on a surface a person reads — and *who backed up my
     record* is answered by "the record itself", not by a principal name. */
  if (by === 'system') return 'the record itself';
  if (by === 'slash') return 'the assistant';
  /* AN AGENT BY ITS NAME: a token's write with no run is signed `agent:claude` (`30 §3`), and Home said "Agent:claude". */
  const agent = /^agent:(.+)$/u.exec(by);
  if (agent) return agent[1]!;
  return by;
};

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
