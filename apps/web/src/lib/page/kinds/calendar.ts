/**
 * A `calendar` block, written from the record's answer: `title | day` a row, drawn by `braindog-render` as the months
 * the rows fall in and an agenda of their days (`packages/render/src/calendar.ts`).
 *
 * OVER A LIST, `columns: [{ field: <title> }, { field: <day or instant> }]`, and the record has already read only the
 * rows of the window of whole months the block asked for (`back:`, `ahead:`), so every row it sent is drawn. The title
 * is said as every cell says it and opens its row; the day is written as `YYYY-MM-DD`, an instant as the day it falls
 * on where the reader is, because a meeting at 23:30 on the 12th is on the 12th for the person who has it.
 *
 * AUTHORED ROWS are written as they were typed, with their tone, since a calendar takes one.
 *
 * A row the record sent with no day is not written: the record reads by the day field, so such a row is one a later
 * build sent under another rule, and a calendar has nowhere to put it.
 */

import { display } from '../../record/api.ts';
import type { KindDrawer } from './index.ts';
import { authoredOf, entriesOf, escapeCell, fenced, fieldsOf, linked, listOf } from './dialect.ts';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/u;

/** The day a stored value is on for the reader, as `YYYY-MM-DD`, or null for a value that is no day. */
function dayOf(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  if (ISO_DAY.test(v)) return v;
  const at = Date.parse(v);
  if (!Number.isFinite(at)) return null;
  const d = new Date(at);
  return `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const calendar: KindDrawer = {
  draw(result, opts) {
    const authored = authoredOf(result);
    if (authored.length)
      return fenced(
        'calendar',
        authored.map((r) => `${r.cells.slice(0, 2).map(escapeCell).join(' | ')}${r.tone ? ` | ${r.tone}` : ''}`),
        opts,
      );
    const register = listOf(result);
    const [title = '', day = ''] = fieldsOf(result);
    if (!register || !title || !day) return fenced('calendar', [], opts);
    const rows = entriesOf(result).flatMap((e) => {
      const on = dayOf(e.fields[day]);
      if (on === null) return [];
      return [`${linked(display(register, title, e.fields[title], opts.now) ?? '', register, e.seq)} | ${on}`];
    });
    return fenced('calendar', rows, opts);
  },
};
