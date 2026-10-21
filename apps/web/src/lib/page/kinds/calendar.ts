/**
 * A `calendar` block, written from the record's answer: `title | day` a row, drawn by `braindog-render` as the months
 * the rows fall in and an agenda of their days (`packages/render/src/calendar.ts`).
 *
 * OVER A LIST, `columns: [{ field: <title> }, { field: <day or instant> }]`, and the record has already read only the
 * rows of the window of whole months the block asked for (`back:`, `ahead:`), so every row it sent is drawn. The title
 * is said as every cell says it and opens its row; the day is written as `YYYY-MM-DD`, an instant as the day it falls
 * on where the reader is, because a meeting at 23:30 on the 12th is on the 12th for the person who has it.
 *
 * OVER WHAT FALLS DUE (`source: deadlines`) each row is the source's `{ list, row, title, day }`, and its title opens the
 * row on its own list, whose number is the one in `row` (`tasks#2`), so a person reads the name and never the id.
 *
 * AUTHORED ROWS are written as they were typed, with their tone, since a calendar takes one.
 *
 * `weeks` IS HANDED THROUGH: when the record's answer says it, the block drawn says it too, and the renderer draws a
 * strip of that many weeks from this one in place of the months (`calendarStripPlan`). A fence has no word for it, so
 * it is set on the parsed block, as the page read sets `actions`.
 *
 * A row the record sent with no day is not written: the record reads by the day field, so such a row is one a later
 * build sent under another rule, and a calendar has nowhere to put it.
 */

import type { BlockResult } from '@braindog/kernel';

import { display } from '../../record/api.ts';
import type { DrawOptions, Drawn, KindDrawer } from './index.ts';
import { authoredOf, entriesOf, escapeCell, fenced, fieldsOf, linked, listOf } from './dialect.ts';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/u;

/** The source that is every list's deadlines, as a page names it. */
const ACROSS = 'deadlines';
/** A deadline's spoken id, `<list>#<number>`. */
const SPOKEN = /^(?<list>[A-Za-z0-9_.-]+)#(?<seq>[1-9]\d*)$/u;

/** The day a stored value is on for the reader, as `YYYY-MM-DD`, or null for a value that is no day. */
function dayOf(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  if (ISO_DAY.test(v)) return v;
  const at = Date.parse(v);
  if (!Number.isFinite(at)) return null;
  const d = new Date(at);
  return `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The block's `weeks`, a whole number from 1 to 8 as the record checked it, or null for a calendar of months. */
function weeksOf(result: unknown): number | null {
  const weeks = (result as { weeks?: unknown }).weeks;
  return typeof weeks === 'number' && Number.isInteger(weeks) && weeks >= 1 && weeks <= 8 ? weeks : null;
}

/** The drawn block saying `weeks`, when the answer did. */
function withWeeks(drawn: Drawn, weeks: number | null): Drawn {
  if (weeks === null) return drawn;
  return { ...drawn, segments: drawn.segments.map((s) => (s.type === 'block' ? { ...s, weeks } : s)) };
}

/** What falls due, a line each: its title opening its row, and its day. */
function dueRows(result: BlockResult): string[] {
  return entriesOf(result).flatMap((e) => {
    const on = dayOf(e.fields.day);
    if (on === null) return [];
    const title = typeof e.fields.title === 'string' ? e.fields.title : '';
    const spoken = typeof e.fields.row === 'string' ? SPOKEN.exec(e.fields.row)?.groups : undefined;
    return [`${spoken ? linked(title, spoken.list!, Number(spoken.seq)) : escapeCell(title)} | ${on}`];
  });
}

/** The block's rows as one fence: over what falls due, over a list, or written out. */
function drawn(result: BlockResult, opts: DrawOptions): Drawn {
  if (result.source === ACROSS) return fenced('calendar', dueRows(result), opts);
  const authored = authoredOf(result);
  if (authored.length)
    return fenced(
      'calendar',
      authored.map((r) => `${r.cells.slice(0, 2).map(escapeCell).join(' | ')}${r.tone ? ` | ${r.tone}` : ''}`),
      opts,
    );
  const register = listOf(result);
  const [title = '', day = '', amount = ''] = fieldsOf(result);
  if (!register || !title || !day) return fenced('calendar', [], opts);
  const dated = entriesOf(result).filter((e) => dayOf(e.fields[day]) !== null);
  const rows = dated.map((e) => `${linked(display(register, title, e.fields[title], opts.now) ?? '', register, e.seq)} | ${dayOf(e.fields[day])}`);
  return withAmounts(fenced('calendar', rows, opts), amount ? dated.map((e) => amountSaid(register, amount, signOf(result), e.fields)) : null);
}

/** The third column's `sign:`, where it names one: the field and the value that makes the amount go out. */
function signOf(result: BlockResult): { field: string; minus: string } | null {
  const c = (Array.isArray(result.columns) ? result.columns[2] : undefined) as { sign?: { field?: unknown; minus?: unknown } } | undefined;
  return typeof c?.sign?.field === 'string' && typeof c.sign.minus === 'string' ? { field: c.sign.field, minus: c.sign.minus } : null;
}

/** A row's amount as the list says it, signed by the way it goes where the column says how: "−£19,100.00", "+£960.00". */
function amountSaid(register: string, field: string, sign: { field: string; minus: string } | null, fields: Readonly<Record<string, unknown>>): string {
  const said = display(register, field, fields[field] as never) ?? '';
  if (!said || !sign) return said;
  return `${fields[sign.field] === sign.minus ? '\u2212' : '+'}${said.replace(/^[\u2212+-]/u, '')}`;
}

/**
 * THE THIRD COLUMN, THE ROW'S AMOUNT, put on the parsed rows (the money review, H20). A calendar fence takes two cells
 * and a tone, so the amount cannot be written into it; the kernel answers it (`columns: [title, due, amount]`), and the
 * renderer draws a row's third cell at the end of its line in the list. It was read and dropped here, so Money's
 * "Due in the next 30 days" named each bill with no amount beside it.
 */
function withAmounts(drawn: Drawn, amounts: readonly string[] | null): Drawn {
  if (amounts === null) return drawn;
  return {
    ...drawn,
    segments: drawn.segments.map((s) => (s.type === 'block' ? { ...s, rows: s.rows.map((r, i) => ({ ...r, cells: [r.cells[0] ?? '', r.cells[1] ?? '', amounts[i] ?? ''] })) } : s)),
  };
}

export const calendar: KindDrawer = {
  draw(result, opts) {
    return withWeeks(drawn(result, opts), weeksOf(result));
  },
};
