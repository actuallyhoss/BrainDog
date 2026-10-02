/**
 * "Point at an export": a file the person exported from another app (a bank's CSV, a Notion, Trello or Todoist export,
 * a spreadsheet saved as CSV) read into the first run, mapped into one list, and shown before anything is written.
 *
 * THREE STEPS, AND NONE OF THEM WRITES. `readExport` reads the file in the browser into columns and entries, and nothing
 * leaves the device but its first few entries, to the model. `mapExport` says which list it goes into and which column
 * fills which field: the model reads it first (`POST /api/slash/mapping`, `ask.ts`) and these rules where there is none
 * (`byRules`), and what the model answers is held to the list's own declaration (`fromReply`). `entriesOf` turns every
 * entry into the fields that list stores, which the one press writes (`accept.ts`).
 *
 * A FILE NO LIST HOLDS BECOMES A LIST OF ITS OWN, named in the person's words ("HSBC") with a field for each column and
 * one page to read it on (`newListDeclarations`), filed as a change in the same press the rest goes in.
 *
 * A plain `.ts` with relative imports, so `node --test` can hold it; the screen only calls it.
 */

import { AGENTS_PACK } from '@braindog/seed/packs';

import type { AskMapping, MappingAsked, MappingReply } from './ask.ts';
import { allLists, decimalsOf, entryOf, FILLABLE, isDay, type Field, type List } from './lists.ts';

/** A file as the first run reads it: its columns in order, and its entries as the text in each cell. */
export type Export = { file: string; columns: string[]; entries: Record<string, string>[]; more: number };

/** How a file goes into the record. `list` is a list this build ships, or `null` for a list of its own named `name`. */
export type Mapping = {
  file: string;
  list: string | null;
  name: string;
  /** The module that declares the list, which the press turns on with it; `null` for a list of its own. */
  module: string | null;
  fields: { column: string; field: string }[];
  fixed: { field: string; value: string }[];
  summary: string | null;
  /** `rules`, or the model as Slash's ledger names it. */
  by: string;
};

/** The entries one file brings, at most: a few years of a bank account, and one press's worth of writes. */
export const ENTRIES_MOST = 1000;
/** The entries the model is shown. */
const SAMPLE = 8;
/** The columns read, at most. */
const COLUMNS_MOST = 40;
/** How much of one value the model reads (`VALUE_BYTES` in packages/slash's propose.ts); the rest is never looked at. */
const CELL_BYTES = 160;
/** The longest body `/api/slash/mapping` takes (`FIRST_RUN_BODY_LIMIT` in packages/host's slash-ask.ts), kept clear of. */
const BODY_MOST = 31_000;
/** The largest file read: ten megabytes is far past any export of one person's. */
export const BYTES_MOST = 10 * 1024 * 1024;

/* ── reading the file ──────────────────────────────────────────────────── */

/** The delimiter of a CSV, read off its first line outside quotes: a comma, a semicolon or a tab. */
function delimiterOf(text: string): string {
  const end = text.search(/\r?\n/u);
  const line = end < 0 ? text : text.slice(0, end);
  const counts = new Map<string, number>([[',', 0], [';', 0], ['\t', 0]]);
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && counts.has(ch)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  const [most, n] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [',', 0];
  return n > 0 ? most : ',';
}

/** RFC 4180, with the delimiter sniffed: quoted cells, doubled quotes, newlines inside quotes, CRLF. */
export function csvCells(text: string): string[][] {
  const d = delimiterOf(text);
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === d) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((c) => c.trim() !== '')) out.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) out.push(row);
  return out;
}

type Json = unknown;
const isMap = (v: Json): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A JSON value as the text a cell would hold: a nested thing by its name, a list by its names, joined. */
function cellOf(v: Json): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(cellOf).filter((s) => s !== '').join(', ');
  if (isMap(v)) for (const k of ['name', 'title', 'plain_text', 'text', 'content', 'value', 'start']) if (typeof v[k] === 'string' || typeof v[k] === 'number') return String(v[k]);
  return '';
}

/**
 * THE ENTRIES OF A JSON EXPORT: an array of objects as it is, or the largest array of objects inside one object, one level
 * down, which is where Trello keeps its cards, Todoist its items and Notion its results.
 */
function jsonEntries(v: Json): Record<string, Json>[] | null {
  const objects = (a: Json): Record<string, Json>[] | null => (Array.isArray(a) && a.length > 0 && a.every(isMap) ? (a as Record<string, Json>[]) : null);
  const top = objects(v);
  if (top) return top;
  if (!isMap(v)) return null;
  let best: Record<string, Json>[] | null = null;
  for (const inner of Object.values(v)) {
    const found = objects(inner) ?? (isMap(inner) ? Object.values(inner).map(objects).find((x) => x !== null) ?? null : null);
    if (found && (best === null || found.length > best.length)) best = found;
  }
  return best;
}

/** A column name a person can read: blank ones are named by their place. */
const columnName = (raw: string, i: number): string => (raw.trim() === '' ? `Column ${i + 1}` : raw.trim().slice(0, 80));

/**
 * A file read into columns and entries, or why it could not be. `.json` is read as JSON, anything else as CSV, and a
 * CSV's first line is its columns. Columns no entry fills are left out.
 */
export function readExport(file: string, text: string): Export | { why: string } {
  const body = text.replace(/^﻿/u, '');
  let columns: string[] = [];
  let entries: Record<string, string>[] = [];
  const json = /\.json$/iu.test(file) || /^\s*[[{]/u.test(body);
  if (json) {
    let parsed: Json;
    try {
      parsed = JSON.parse(body);
    } catch {
      return { why: 'notJson' };
    }
    const found = jsonEntries(parsed);
    if (!found) return { why: 'noEntries' };
    const seen: string[] = [];
    for (const e of found.slice(0, 50)) for (const k of Object.keys(e)) if (!seen.includes(k)) seen.push(k);
    columns = seen;
    entries = found.map((e) => Object.fromEntries(columns.map((c) => [c, cellOf(e[c])])));
  } else {
    const cells = csvCells(body);
    if (cells.length < 2) return { why: 'noEntries' };
    columns = cells[0]!.map(columnName);
    const unique = columns.map((c, i) => (columns.indexOf(c) === i ? c : `${c} ${i + 1}`));
    columns = unique;
    entries = cells.slice(1).map((r) => Object.fromEntries(columns.map((c, i) => [c, (r[i] ?? '').trim()])));
  }
  columns = columns.filter((c) => entries.some((e) => (e[c] ?? '').trim() !== '')).slice(0, COLUMNS_MOST);
  if (columns.length === 0 || entries.length === 0) return { why: 'noEntries' };
  const kept = entries.slice(0, ENTRIES_MOST).map((e) => Object.fromEntries(columns.map((c) => [c, e[c] ?? ''])));
  return { file, columns, entries: kept, more: Math.max(0, entries.length - ENTRIES_MOST) };
}

/* ── reading a cell ────────────────────────────────────────────────────── */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number): string => String(n).padStart(2, '0');
const dayOfParts = (y: number, m: number, d: number): string | null => {
  const year = y < 100 ? 2000 + y : y;
  const s = `${year}-${pad(m)}-${pad(d)}`;
  return isDay(s) ? s : null;
};

/**
 * HOW ONE COLUMN WRITES ITS DAYS, read off all of it: a day over twelve in the first place is day first, one in the
 * second is month first, and a column that never says is read the way the person's own language writes dates.
 */
export function dayReader(values: readonly string[], locale: string): (v: string) => string | null {
  let dayFirst = !/^en-US$|^en-PH$|^en-CA$/u.test(locale);
  for (const v of values) {
    const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/u.exec(v.trim());
    if (!m) continue;
    if (Number(m[1]) > 12) {
      dayFirst = true;
      break;
    }
    if (Number(m[2]) > 12) {
      dayFirst = false;
      break;
    }
  }
  return (raw) => {
    const v = raw.trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/u.exec(v);
    if (m) return dayOfParts(Number(m[1]), Number(m[2]), Number(m[3]));
    m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})/u.exec(v);
    if (m) return dayOfParts(Number(m[1]), Number(m[2]), Number(m[3]));
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/u.exec(v);
    if (m) return dayFirst ? dayOfParts(Number(m[3]), Number(m[2]), Number(m[1])) : dayOfParts(Number(m[3]), Number(m[1]), Number(m[2]));
    m = /^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*\.?[\s-],?\s*(\d{2,4})/u.exec(v);
    if (m) {
      const month = MONTHS.indexOf(m[2]!.toLowerCase()) + 1;
      return month > 0 ? dayOfParts(Number(m[3]), month, Number(m[1])) : null;
    }
    m = /^([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/u.exec(v);
    if (m) {
      const month = MONTHS.indexOf(m[1]!.toLowerCase()) + 1;
      return month > 0 ? dayOfParts(Number(m[3]), month, Number(m[2])) : null;
    }
    return null;
  };
}

/**
 * A number as a person's export writes it: `1,234.56`, `1.234,56`, `-12.30`, `(12.30)`, `£12.30`, `12.30 GBP`, `12.30-`.
 * `null` for a cell that is not one.
 */
export function numberOf(raw: string): number | null {
  let v = raw.trim().replace(/[\s  ']/gu, '');
  if (v === '') return null;
  let negative = false;
  if (/^\(.*\)$/u.test(v)) {
    negative = true;
    v = v.slice(1, -1);
  }
  if (v.endsWith('-')) {
    negative = true;
    v = v.slice(0, -1);
  }
  v = v.replace(/^[A-Za-z]{3}|[A-Za-z]{3}$/gu, '').replace(/^[^\d+-]+|[^\d]+$/gu, '');
  if (v.startsWith('-')) {
    negative = !negative;
    v = v.slice(1);
  } else if (v.startsWith('+')) v = v.slice(1);
  /* A SYMBOL AFTER THE SIGN, as a bank writes "-£12.30". */
  v = v.replace(/^\p{Sc}+/u, '');
  if (!/^[\d.,]+$/u.test(v)) return null;
  const lastDot = v.lastIndexOf('.');
  const lastComma = v.lastIndexOf(',');
  /* THE LAST SEPARATOR IS THE DECIMAL ONE where both are written, and a lone comma is one only before one or two digits. */
  const decimal = lastDot >= 0 && lastComma >= 0 ? (lastDot > lastComma ? '.' : ',') : lastComma >= 0 && /,\d{1,2}$/u.test(v) && !/,\d{3}/u.test(v.slice(0, lastComma + 1)) ? ',' : '.';
  const whole = decimal === '.' ? v.replace(/,/gu, '') : v.replace(/\./gu, '').replace(',', '.');
  if (!/^\d*\.?\d*$/u.test(whole) || whole === '' || whole === '.') return null;
  const n = Number(whole);
  return Number.isFinite(n) ? (negative ? -n : n) : null;
}

/**
 * THE CURRENCIES A SYMBOL CAN STAND FOR, read off the runtime's ISO list and how it writes each one, never a table
 * this file keeps: `£` is every currency whose symbol holds one (`£`, `E£`, `L£`), and `$` every dollar and peso.
 */
const SYMBOLS: ReadonlyMap<string, ReadonlySet<string>> = (() => {
  const by = new Map<string, Set<string>>();
  for (const code of Intl.supportedValuesOf('currency'))
    for (const currencyDisplay of ['narrowSymbol', 'symbol'] as const) {
      const written = new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay })
        .formatToParts(1)
        .find((p) => p.type === 'currency')?.value;
      for (const ch of written?.match(/\p{Sc}/gu) ?? []) {
        const could = by.get(ch) ?? new Set<string>();
        could.add(code);
        by.set(ch, could);
      }
    }
  return by;
})();

/**
 * WHETHER A CELL'S AMOUNT IS IN `currency`: a cell that names another, by its code or by a symbol only other currencies
 * use, is not, and is never stored as if it were. A cell that names none is.
 */
export function inCurrency(raw: string, currency: string): boolean {
  const code = /(?:^|[^A-Za-z])([A-Z]{3})(?:[^A-Za-z]|$)/u.exec(raw)?.[1];
  if (code !== undefined && code !== currency) return false;
  for (const ch of raw) {
    const could = SYMBOLS.get(ch);
    if (could && !could.has(currency)) return false;
  }
  return true;
}

/** A cell that says yes or no. */
const boolOf = (raw: string): boolean | null => {
  const v = raw.trim().toLowerCase();
  if (['true', 'yes', 'y', '1', 'x', '✓', 'done', 'checked'].includes(v)) return true;
  if (['false', 'no', 'n', '0', '', 'unchecked'].includes(v)) return false;
  return null;
};

/** A cell read as one value of an enum, by its value or by how it reads with spaces: "Owed to me" is `owed_to_me`. */
const enumOf = (raw: string, values: readonly string[]): string | null => {
  const v = raw.trim().toLowerCase().replace(/[\s-]+/gu, '_');
  return values.find((x) => x.toLowerCase() === v) ?? null;
};

/** One cell read as one field stores it, or `undefined`. */
function cellAs(field: Field, raw: string, day: (v: string) => string | null, currency: string | null): unknown {
  switch (field.type) {
    case 'day':
      return day(raw) ?? undefined;
    case 'money': {
      /* AN AMOUNT THE CELL SAYS IS IN ANOTHER CURRENCY IS NOT KEPT, never relabelled: "$3.50" is not 350 pence. */
      const n = numberOf(raw);
      return n === null || currency === null || !inCurrency(raw, currency) ? undefined : { amount: Math.round(n * 10 ** decimalsOf(currency)), currency };
    }
    case 'int': {
      const n = numberOf(raw);
      return n === null ? undefined : Math.round(n);
    }
    case 'decimal':
    case 'number':
      return numberOf(raw) ?? undefined;
    case 'bool':
      return boolOf(raw) ?? undefined;
    case 'enum':
      return enumOf(raw, field.values) ?? undefined;
    default:
      return raw.trim() === '' ? undefined : raw.trim();
  }
}

/* ── which list, and which field ───────────────────────────────────────── */

/** A name squeezed for matching: "Due date" and `due_date` are one. */
const squeeze = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * THE WORDS OTHER APPS HEAD A COLUMN WITH, by the field id this build's lists use for it. Vocabulary, not a person's
 * data: a bank calls a description "Narrative", Todoist calls a task "Content", Trello a card's "Name".
 */
const SAID_AS: Readonly<Record<string, readonly string[]>> = {
  what: ['description', 'details', 'memo', 'narrative', 'title', 'task', 'content', 'summary', 'item', 'payee', 'merchant', 'reference', 'name'],
  name: ['name', 'title', 'fullname', 'company', 'contact', 'project'],
  due: ['due', 'duedate', 'deadline', 'date', 'dueon'],
  by: ['due', 'duedate', 'deadline', 'dueon', 'date'],
  on: ['date', 'posted', 'transactiondate', 'bookingdate', 'valuedate', 'completedon'],
  amount: ['amount', 'value', 'total', 'sum', 'price', 'cost', 'paidout', 'paidin'],
  email: ['email', 'emailaddress', 'mail'],
  note: ['notes', 'note', 'comment', 'comments', 'desc'],
  renews: ['renews', 'renewal', 'renewaldate', 'expires', 'expiry', 'nextpayment'],
  cost: ['cost', 'price', 'amount', 'fee'],
  provider: ['provider', 'vendor', 'company', 'from'],
};

/** The lists a file may go into: every list this build ships whose required fields a file can fill, the agents' aside. */
export function exportLists(modules?: readonly string[]): List[] {
  return allLists(modules).filter((l) => l.module !== AGENTS_PACK.manifest.id && l.fields.every((f) => !f.required || f.fallback || FILLABLE.has(f.type)));
}

/** The lists as the model is offered them: each field a file could fill, with an enum's values. */
export function listsAsked(lists: readonly List[]): MappingAsked['lists'] {
  return lists.map((l) => ({
    id: l.id,
    name: l.name,
    fields: l.fields.filter((f) => FILLABLE.has(f.type)).map((f) => ({ id: f.id, type: f.type, ...(f.type === 'enum' ? { values: [...f.values] } : {}) })),
  }));
}

/** Whether every entry the mapping writes would have what its list requires. */
const complete = (list: List, fields: Mapping['fields'], fixed: Mapping['fixed']): boolean =>
  fields.some((m) => m.field === list.title) && list.fields.every((f) => !f.required || f.fallback || fields.some((m) => m.field === f.id) || fixed.some((x) => x.field === f.id));

/** How many of a column's cells read as a field's type: one in two at least, for a column to fill it. */
function readsAs(exp: Export, column: string, field: Field, locale: string): boolean {
  const cells = exp.entries.slice(0, 50).map((e) => e[column] ?? '').filter((c) => c.trim() !== '');
  if (cells.length === 0) return false;
  const day = dayReader(cells, locale);
  /* AN AMOUNT READS AS ONE WHATEVER CURRENCY IT NAMES; which currency it is in is asked of each cell when it is kept. */
  const good = cells.filter((c) => (field.type === 'money' ? numberOf(c) !== null : cellAs(field, c, day, 'XXX') !== undefined)).length;
  return good * 2 >= cells.length;
}

/** The mapping these rules find for one list: each column to the field its heading names, where its cells read as one. */
function mapInto(exp: Export, list: List, locale: string): Mapping['fields'] {
  const out: Mapping['fields'] = [];
  for (const f of list.fields.filter((x) => FILLABLE.has(x.type))) {
    const names = new Set([squeeze(f.id), squeeze(f.label), ...(SAID_AS[f.id] ?? [])]);
    const column = exp.columns.find((c) => names.has(squeeze(c)) && !out.some((m) => m.column === c) && readsAs(exp, c, f, locale));
    if (column !== undefined) out.push({ column, field: f.id });
  }
  return out;
}

/** The file's own name without its ending, as a list's name: `hsbc-2026.csv` is "Hsbc 2026". */
export const nameOfFile = (file: string): string => {
  const bare = file.replace(/\.[A-Za-z0-9]+$/u, '').replace(/[_-]+/gu, ' ').trim();
  return (bare.charAt(0).toUpperCase() + bare.slice(1)).slice(0, 40) || 'Imported';
};

/**
 * WHAT THESE RULES MAP A FILE INTO WITHOUT A MODEL: the list whose fields the most columns name, where every entry would
 * have its title and what it requires; or a list of the file's own where none would.
 */
export function byRules(exp: Export, lists: readonly List[], locale: string): Mapping {
  /* A DAY OR AN AMOUNT MATCHED SAYS MORE THAN A NAME DOES, so a Trello card with a due day is a task and not a person. */
  const score = (list: List, fields: Mapping['fields']): number =>
    fields.length + fields.filter((m) => list.fields.find((f) => f.id === m.field)?.type !== 'text').length / 2;
  /* A FILE OF AMOUNTS IS ABOUT MONEY, so a list that keeps none of them is not where it goes: a bank's description and
     date would otherwise make it a list of tasks. */
  const amounts = exp.columns.some((c) => {
    const cells = exp.entries.slice(0, 50).map((e) => (e[c] ?? '').trim()).filter((x) => x !== '');
    return cells.length > 0 && cells.every((x) => numberOf(x) !== null) && cells.some((x) => /[.,]\d{2}\)?-?$/u.test(x));
  });
  let best: { list: List; fields: Mapping['fields']; score: number } | null = null;
  for (const list of lists) {
    const fields = mapInto(exp, list, locale);
    if (!complete(list, fields, [])) continue;
    if (amounts && !fields.some((m) => list.fields.find((f) => f.id === m.field)?.type === 'money')) continue;
    const s = score(list, fields);
    if (best === null || s > best.score) best = { list, fields, score: s };
  }
  if (best && best.fields.length >= 2) return { file: exp.file, list: best.list.id, name: best.list.name, module: best.list.module, fields: best.fields, fixed: [], summary: null, by: 'rules' };
  return { file: exp.file, list: null, name: nameOfFile(exp.file), module: null, fields: [], fixed: [], summary: null, by: 'rules' };
}

/**
 * THE MODEL'S MAPPING, HELD TO THE FILE AND THE LIST: a list outside those offered is a list of the file's own, a column
 * the file does not have or whose cells do not read as the field is dropped, and a mapping that would leave an entry
 * without its title or something its list requires is the rules' instead.
 */
export function fromReply(reply: MappingReply, exp: Export, lists: readonly List[], locale: string): Mapping {
  const list = lists.find((l) => l.id === reply.list) ?? null;
  const summary = reply.summary.trim() === '' ? null : reply.summary.trim();
  if (list === null) {
    const name = reply.name?.trim() ?? '';
    return { file: exp.file, list: null, name: name === '' ? nameOfFile(exp.file) : name.slice(0, 40), module: null, fields: [], fixed: [], summary, by: reply.by };
  }
  const fields: Mapping['fields'] = [];
  for (const m of reply.fields) {
    const f = list.fields.find((x) => x.id === m.field && FILLABLE.has(x.type));
    if (!f || !exp.columns.includes(m.column) || fields.some((x) => x.field === f.id) || !readsAs(exp, m.column, f, locale)) continue;
    fields.push({ column: m.column, field: f.id });
  }
  const fixed = reply.fixed.filter((x) => {
    const f = list.fields.find((y) => y.id === x.field);
    return f?.type === 'enum' && f.values.includes(x.value) && !fields.some((m) => m.field === x.field);
  });
  if (!complete(list, fields, fixed)) return { ...byRules(exp, lists, locale), summary };
  return { file: exp.file, list: list.id, name: list.name, module: list.module, fields, fixed, summary, by: reply.by };
}

const UTF8 = new TextEncoder();

/** One value as the engine reads it: on one line, and no longer than its first 160 bytes, never cut inside a character. */
export function cellSent(v: string): string {
  const line = v.replace(/\s+/gu, ' ').trim();
  if (UTF8.encode(line).length <= CELL_BYTES) return line;
  let out = '';
  let used = 0;
  for (const ch of line) {
    used += UTF8.encode(ch).length;
    if (used > CELL_BYTES) break;
    out += ch;
  }
  return out;
}

/**
 * What the model is asked about a file: its first entries, each value cut to what the engine reads.
 *
 * CUT HERE, NOT THERE. The engine only ever reads 160 bytes of a value, but the door weighs the whole body first, so an
 * export with a long notes column was refused and the first run fell back to the rules without a word. A wide file can
 * still be too long at eight entries, and then it is shown fewer: one entry is enough to read headings by.
 */
export function mappingAsked(exp: Export, lists: readonly List[]): MappingAsked {
  const sample = exp.entries.slice(0, SAMPLE).map((e) => Object.fromEntries(exp.columns.map((c) => [c, cellSent(e[c] ?? '')])));
  const asked: MappingAsked = { file: exp.file, columns: exp.columns, sample, lists: listsAsked(lists) };
  while (asked.sample.length > 1 && JSON.stringify(asked).length > BODY_MOST) asked.sample.pop();
  return asked;
}

/**
 * How a file goes into the record: the model's mapping where a host has one and it answered, these rules otherwise.
 * `ask` is `null` on a host with no model behind Slash.
 */
export async function mapExport(exp: Export, ask: AskMapping | null, locale: string, modules?: readonly string[]): Promise<Mapping> {
  const lists = exportLists(modules);
  if (ask === null) return byRules(exp, lists, locale);
  const out = await ask(mappingAsked(exp, lists)).catch(() => null);
  return out?.ok ? fromReply(out.value, exp, lists, locale) : byRules(exp, lists, locale);
}

/* ── a list of its own ─────────────────────────────────────────────────── */

/** An id the record takes: lower case, a letter first, underscores, at most 40. */
const idOf = (s: string, fallback: string): string => {
  const id = s
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '_')
    .replace(/^[^a-z]+|_+$/gu, '')
    .slice(0, 40);
  return id === '' ? fallback : id;
};

/** Field ids the record keeps for itself (`RESERVED_FIELD_IDS` in the kernel), which a column cannot take. */
const RESERVED = new Set(['id', 'seq', 'register', 'created_at', 'updated_at', 'deleted_at', 'version', 'spoken', 'title']);

/** A list of the file's own: its id, and each column as a field of the type its cells read as. */
export type OwnList = { id: string; name: string; title: string; fields: (Field & { column: string })[] };

/** The type a column's cells read as: days, amounts (money where a currency is known), yes or no, or text. */
function typeOf(exp: Export, column: string, currency: string | null, locale: string): string {
  const probe = (type: string): boolean => readsAs(exp, column, { id: column, type, label: column, required: false, fallback: false, values: [] }, locale);
  const cells = exp.entries.slice(0, 50).map((e) => (e[column] ?? '').trim()).filter((c) => c !== '');
  if (probe('day') && cells.every((c) => /\d/u.test(c))) return 'day';
  if (cells.every((c) => numberOf(c) !== null)) return currency !== null && cells.some((c) => /[.,]\d{2}$|^\D/u.test(c)) ? 'money' : 'decimal';
  if (cells.every((c) => ['true', 'false', 'yes', 'no'].includes(c.toLowerCase()))) return 'bool';
  return 'text';
}

/** The list a file of its own makes, `taken` being the list ids the record or the setup already has. */
export function ownList(exp: Export, name: string, currency: string | null, locale: string, taken: readonly string[] = allLists().map((l) => l.id)): OwnList {
  let id = idOf(name, 'imported');
  for (let n = 2; taken.includes(id); n++) id = `${idOf(name, 'imported').slice(0, 36)}_${n}`;
  const fields: OwnList['fields'] = [];
  for (const column of exp.columns.slice(0, 24)) {
    let fid = idOf(column, 'field');
    if (RESERVED.has(fid)) fid = `${fid}_`;
    for (let n = 2; fields.some((f) => f.id === fid); n++) fid = `${idOf(column, 'field').slice(0, 36)}_${n}`;
    fields.push({ id: fid, column, type: typeOf(exp, column, currency, locale), label: column.slice(0, 60), required: false, fallback: false, values: [] });
  }
  const title = fields.find((f) => f.type === 'text') ?? fields[0]!;
  title.required = true;
  return { id, name, title: title.id, fields };
}

/**
 * THE DECLARATIONS A LIST OF ITS OWN IS FILED AS: the list, and one page that reads it, newest day first where it keeps
 * days. As `previewChange` and the change Decide accepts take them: `{ id, kind, body }`.
 */
export function newListDeclarations(own: OwnList, summary: string | null): { id: string; kind: string; body: Record<string, unknown> }[] {
  const day = own.fields.find((f) => f.type === 'day');
  const shown = [own.fields.find((f) => f.id === own.title)!, ...own.fields.filter((f) => f.id !== own.title)].slice(0, 5);
  return [
    {
      id: `register.${own.id}`,
      kind: 'register',
      body: {
        register: own.id,
        name: own.name,
        icon: 'rows',
        holds: summary ?? `what came in from ${own.name}`,
        title: own.title,
        fields: own.fields.map((f) => ({ id: f.id, label: f.label, type: f.type, ...(f.required ? { required: true } : {}), ...(f.type === 'text' ? { search: true } : {}), ...(f.type === 'day' ? { index: true } : {}) })),
      },
    },
    {
      id: `page.${own.id}`,
      kind: 'page',
      body: {
        page: own.id,
        title: own.name,
        nav: { section: own.name, order: 10 },
        icon: 'rows',
        requires: [`register.${own.id}`],
        blocks: [
          {
            kind: 'table',
            heading: own.name,
            span: 12,
            source: `register.${own.id}`,
            columns: shown.map((f) => ({ field: f.id, label: f.label })),
            ...(day ? { order: [{ field: day.id, dir: 'desc' }] } : {}),
            limit: 50,
            empty: `Nothing in ${own.name} yet.`,
          },
        ],
      },
    },
  ];
}

/* ── the entries ───────────────────────────────────────────────────────── */

/**
 * EVERY ENTRY OF THE FILE AS ITS LIST STORES IT, and how many could not be: a cell that does not read as its field is
 * left empty, and an entry left without its title or something its list requires is not written. Money is in `currency`
 * and nothing else; with none chosen, an amount is not kept.
 */
export function entriesOf(
  exp: Export,
  mapping: Mapping,
  currency: string | null,
  locale: string,
  own?: OwnList,
): { register: string; fields: Record<string, unknown>[]; skipped: number } {
  const list: List | null = own
    ? { id: own.id, name: own.name, module: '', title: own.title, fields: own.fields }
    : (exportLists().find((l) => l.id === mapping.list) ?? null);
  if (list === null) return { register: mapping.list ?? '', fields: [], skipped: exp.entries.length };
  const pairs = own ? own.fields.map((f) => ({ column: f.column, field: f.id })) : mapping.fields;
  const days = new Map(pairs.map((p) => [p.column, dayReader(exp.entries.map((e) => e[p.column] ?? ''), locale)] as const));
  const out: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const e of exp.entries) {
    const fields: Record<string, unknown> = {};
    let other = false;
    for (const p of pairs) {
      const f = list.fields.find((x) => x.id === p.field);
      const v = f ? cellAs(f, e[p.column] ?? '', days.get(p.column) ?? (() => null), currency) : undefined;
      if (v !== undefined) fields[p.field] = v;
      /* AN AMOUNT IN ANOTHER CURRENCY HOLDS ITS ENTRY BACK, rather than letting it in without the amount it was about. */
      else if (f?.type === 'money' && currency !== null && numberOf(e[p.column] ?? '') !== null) other = true;
    }
    for (const x of own ? [] : mapping.fixed) fields[x.field] = x.value;
    const kept = other ? null : entryOf(list, fields, currency);
    if (kept) out.push(kept);
    else skipped++;
  }
  return { register: list.id, fields: out, skipped };
}

/** The entries a page preview is drawn over, at most, as `previewChange` holds one list to. */
const DRAWN_MOST = 20;

/**
 * THE PAGES DRAWN OVER THE FILE'S OWN ENTRIES: a list this build ships is drawn with the file's first entries in place
 * of its examples, and a list of the file's own is asked for beside the rest. Every one is a rehearsal that keeps nothing.
 */
export function drawnWith(
  asked: readonly Record<string, unknown>[],
  register: string,
  entries: readonly Record<string, unknown>[],
  own: { declarations: { id: string; kind: string; body: Record<string, unknown> }[] } | null,
): Record<string, unknown>[] {
  const some = entries.slice(0, DRAWN_MOST);
  if (own) return [...asked, { to: { declarations: own.declarations }, rows: some.length > 0 ? { [register]: some } : {} }];
  if (some.length === 0) return [...asked];
  return asked.map((a) => {
    const to = a.to as { declarations?: { id?: unknown }[] } | undefined;
    const reads = (to?.declarations ?? []).some((d) => d.id === `register.${register}`);
    return reads ? { ...a, rows: { ...((a.rows as Record<string, unknown>) ?? {}), [register]: some } } : a;
  });
}
