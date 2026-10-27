/**
 * THE ROWS OF A SOURCE THIS BUILD HAS NEVER HEARD OF, laid out by their fields. A computed source used to cost an
 * arm in `page-live.ts`, one `if (b.source === ...)` a name, and a block over any other source drew the line saying it
 * cannot be drawn: a source added in the kernel's registry (`packages/kernel/src/sources/`) or the record's
 * (`packages/record/src/sources/`) waited for an edit here before anybody saw it. This reads what the record answered on
 * such a block and writes each cell with the app's one writer for its type, so a new source draws with no edit.
 *
 * THE TYPES ARE THE ANSWER'S. The kernel answers a computed source's `types` beside its rows (`pages.ts` `typesOf`), one
 * word a field. A record that sends none, an older one or a source that has not said, is read BY EACH VALUE instead: an
 * amount with a currency is money, `2026-10-15` a day, a full time an instant, a whole number a count, any other number a
 * decimal, true or false a yes or no, and the rest text. A guess from a value is a fallback and never wins over a type
 * the record said.
 *
 * NEVER A RAW ID. A field typed as a link or a handle, a field called `id`, the field a source names its own rows by
 * (`list` on `lists`, `page` on `pages`) and a `slug` are handles, and a column is never made of one unless the block
 * names it; a value that is a row id draws as nothing even then. A row links to its own page only when it is a row of a
 * list, with that list and its number; a row with no number (`seq: null`) has no link.
 *
 * PURE: no record, no store, no Svelte. `page-live.ts` is its one caller, and the page route's chunk carries it, so
 * nothing every screen loads grows by it.
 */

import { day, integer, quantity, since, writeAmount } from 'braindog-render';

/** One cell as a person reads it, or `null` where there is nothing to say. */
export type Cell = string | null;

/** A column of a source's rows: the field it reads, its heading, and the type its cells were written by. */
export type SourceColumn = { field: string; label: string; type: string };

export type SourceRows = {
  columns: SourceColumn[];
  rows: Cell[][];
  /** Each row's own address where it has a list and a number, else `null`. */
  links: (string | null)[];
  /** Each row's key, stable across reads: its id where it has one, else its place. */
  keys: string[];
};

/** What a caller knows that a value does not carry: the clock, the record's home currency and who each run is. */
export type SourceSay = { now?: number; home?: string | null; names?: ReadonlyMap<string, string> };

/** The most columns a block that names none is given, so a source with many fields is a table and not a wall. */
const COLUMNS_MOST = 6;

const ROW_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/u;
const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/u;

/** The types that name another thing rather than say something, which no column is made of unasked. */
const HANDLE_TYPES = new Set(['ref', 'id', 'handle', 'key']);

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

const isMoney = (v: unknown): v is { amount: number; currency: string } =>
  isObject(v) && typeof v.amount === 'number' && typeof v.currency === 'string' && /^[A-Za-z]{3}$/u.test(v.currency);

/** The type a value says it is, where the record said none. */
export function typeOfValue(v: unknown): string {
  if (isMoney(v)) return 'money';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'decimal';
  if (typeof v === 'string') {
    if (ROW_ID.test(v)) return 'ref';
    if (DAY.test(v)) return 'day';
    if (INSTANT.test(v) && Number.isFinite(Date.parse(v))) return 'instant';
  }
  return 'text';
}

/** A field's heading from its own name, where the block gave none: `last_seen` is "Last seen". */
const headingOf = (field: string): string => {
  const words = field.replace(/[_.-]+/gu, ' ').trim();
  return words === '' ? field : words.charAt(0).toUpperCase() + words.slice(1);
};

/** Whether `field` names the source's own rows rather than saying something of them. */
function isHandle(field: string, type: string, source: string): boolean {
  if (HANDLE_TYPES.has(type) || field === 'id' || field === 'slug') return true;
  const one = source.endsWith('s') ? source.slice(0, -1) : source;
  return field === one || field === source;
}

/** One value, written by the app's one writer for its type. */
export function cellOf(type: string, v: unknown, say: SourceSay = {}): Cell {
  if (v === null || v === undefined || v === '') return null;
  /* A ROW ID IS NEVER WORDS, whatever the type says it is. */
  if (typeof v === 'string' && ROW_ID.test(v)) return null;
  switch (type) {
    case 'money':
      if (!isMoney(v) || !Number.isInteger(v.amount)) return null;
      return writeAmount({ minor: v.amount, currency: v.currency }, say.home ?? null, 'exact')?.text ?? null;
    case 'day':
      return typeof v === 'string' ? day(v.slice(0, 10)) : null;
    case 'instant':
      return typeof v === 'string' ? since(v, say.now ?? Date.now()) : null;
    case 'int':
    case 'count':
      return typeof v === 'number' && Number.isFinite(v) ? integer(Math.round(v)) : null;
    case 'decimal':
      /* Through the house writer, so a negative wears the one minus sign a whole number does. */
      return typeof v === 'number' && Number.isFinite(v) ? quantity(v, '') : null;
    case 'bool':
      return typeof v === 'boolean' ? (v ? 'Yes' : 'No') : null;
    case 'run':
      return typeof v === 'string' ? (say.names?.get(v) ?? null) : null;
    case 'enum':
      return typeof v === 'string' ? v.charAt(0).toUpperCase() + v.slice(1).replace(/_/gu, ' ') : null;
    default:
      if (HANDLE_TYPES.has(type)) return null;
      return typeof v === 'string' || typeof v === 'number' ? String(v) : null;
  }
}

/** The rows the record answered, as rows with fields; anything else is left out. */
type SourceRow = { id?: unknown; register?: unknown; seq?: unknown; fields: Record<string, unknown> };
const rowsIn = (v: unknown): SourceRow[] | null =>
  Array.isArray(v) ? v.filter((r): r is SourceRow => isObject(r) && isObject(r.fields)) : null;

/**
 * THE ROWS A RECORD ANSWERED ON A BLOCK OVER A SOURCE NO ARM KNOWS, laid out by their fields. `answer` is the block as
 * the record sent it (`rows`, `types`, `source`); `block` is the declaration (`columns`, `source`), which is often the
 * same object. The block's own columns, where it names them, in its order and under its labels; else every field the
 * rows carry that says something, in the order the record typed them, at most six. `null` where there are no rows to
 * read or nothing to draw of them, and the caller then says the block cannot be drawn, as before.
 */
export function sourceRows(
  answer: { rows?: unknown; types?: unknown; source?: unknown },
  block: { columns?: readonly { field?: unknown; label?: unknown }[] | undefined; source?: unknown },
  say: SourceSay = {},
): SourceRows | null {
  const rows = rowsIn(answer.rows);
  if (rows === null) return null;
  const source = typeof block.source === 'string' ? block.source : typeof answer.source === 'string' ? answer.source : '';
  const said = isObject(answer.types) ? answer.types : {};
  /* THE RECORD'S TYPE FIRST, THEN THE FIRST VALUE THAT SAYS ONE. */
  const typeOf = (field: string): string => {
    const t = said[field];
    if (typeof t === 'string' && t !== '') return t;
    const first = rows.find((r) => r.fields[field] !== null && r.fields[field] !== undefined && r.fields[field] !== '');
    return first ? typeOfValue(first.fields[field]) : 'text';
  };

  const named = (block.columns ?? []).filter((c): c is { field: string; label?: unknown } => typeof c.field === 'string' && c.field !== '');
  let columns: SourceColumn[];
  if (named.length > 0) {
    columns = named.map((c) => ({ field: c.field, label: typeof c.label === 'string' && c.label.trim() !== '' ? c.label.trim() : headingOf(c.field), type: typeOf(c.field) }));
  } else {
    const fields: string[] = Object.keys(said);
    for (const r of rows) for (const f of Object.keys(r.fields)) if (!fields.includes(f)) fields.push(f);
    columns = fields
      .map((field) => ({ field, label: headingOf(field), type: typeOf(field) }))
      .filter((c) => !isHandle(c.field, c.type, source) && rows.some((r) => cellOf(c.type, r.fields[c.field], say) !== null))
      .slice(0, COLUMNS_MOST);
  }
  if (columns.length === 0) return null;

  return {
    columns,
    rows: rows.map((r) => columns.map((c) => cellOf(c.type, r.fields[c.field], say))),
    links: rows.map((r) =>
      typeof r.register === 'string' && r.register !== '' && r.register !== source && typeof r.seq === 'number' && Number.isInteger(r.seq) && r.seq > 0 ? `/r/${r.register}/${r.seq}` : null,
    ),
    keys: rows.map((r, n) => (typeof r.id === 'string' && r.id !== '' ? `${source}:${r.id}` : `${source}:${n}`)),
  };
}
