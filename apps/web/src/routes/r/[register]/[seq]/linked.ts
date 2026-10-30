/**
 * One line of a list that points at this row, as the row's page draws it under "Bills and invoices" or "Instalments":
 * its amount with its way, and where it stands in a word.
 *
 * A PERSON'S BILLS TOLD THEIR STATE BY A DOT ALONE. "Cloud storage, annual, May · £3,030.00" beside a red dot said
 * neither that the money was coming in nor that it was late, and its pence read unlike every other amount in the app.
 * So the amount says its way, "+£3,030" in, "−£3,030" out, as the Money page and a list's cards do, and the dot has a
 * word beside it: "Paid", "38 days late", "Due in 5 days", "Part paid".
 *
 * THE TONE IS NOT DECIDED HERE. It is `toneOf`'s, read by the list with the record's clock, so a bill drawn late in its
 * list is drawn late here; this file only says it in words. Out of the component so a test can load it in Node.
 */

import type { Fields, RegisterDecl } from '../../../../lib/record/schema.ts';
import { amountField, signedSaid, wayOf } from '../../../../lib/record/money-way.ts';
import { rowWords } from './said.ts';

const DAY = 86_400_000;

/** Calendar days from `now` to a `YYYY-MM-DD` day: 0 today, negative once it has passed. */
export function daysUntil(day: string, now: number): number {
  return Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY) - Math.floor(now / DAY);
}

/** An enum's value as the list labels it, in sentence case where it labels none. */
function labelled(decl: RegisterDecl, field: string, value: string): string {
  const f = decl.fields.find((x) => x.id === field);
  const said = f?.labels?.[value] ?? value.replace(/_/gu, ' ');
  return said.charAt(0).toUpperCase() + said.slice(1);
}

/**
 * Where one pointing row stands, in words, or `null` where there is nothing to say beyond its day.
 *
 * - A finished row says its state: "Paid", "Written off". A list whose rows are born done (a ledger's "cleared") says
 *   nothing, as `toneOf` draws no dot for it.
 * - An open row past its deadline says how late, and one inside a fortnight how close, the window `toneOf` colours.
 * - Any other state that is not the list's first says itself ("Part paid"), and ahead of the lateness when both hold.
 */
export function linkedState(decl: RegisterDecl | undefined, fields: Readonly<Record<string, unknown>>, now: number): string | null {
  if (!decl) return null;
  const stateId = decl.state;
  const state = stateId ? fields[stateId] : undefined;
  const stateField = stateId ? decl.fields.find((f) => f.id === stateId) : undefined;
  if (typeof state === 'string' && decl.done?.includes(state)) {
    const born = stateField?.default;
    return typeof born === 'string' && decl.done.includes(born) ? null : labelled(decl, stateId!, state);
  }
  const first = stateField?.values?.[0];
  const own = stateId && typeof state === 'string' && state !== '' && state !== first ? labelled(decl, stateId, state) : null;
  const deadline = decl.fields.find((f) => f.type === 'day' && f.deadline);
  const due = deadline ? fields[deadline.id] : undefined;
  let when: string | null = null;
  if (typeof due === 'string' && /^\d{4}-\d{2}-\d{2}/u.test(due)) {
    const n = daysUntil(due.slice(0, 10), now);
    if (n < 0) when = rowWords.overdue(-n);
    else if (n === 0) when = rowWords.dueToday;
    else if (n === 1) when = rowWords.dueTomorrow;
    else if (n < 14) when = rowWords.dueIn(n);
  }
  if (own && when) return `${own}, ${when.charAt(0).toLowerCase()}${when.slice(1)}`;
  return own ?? when;
}

/**
 * The cells under a pointing row's title, the amount said as a sentence says it ("£3,030", "£12.50") and signed by its
 * way. `say` is how the page draws money in text (`moneyInText` with the record's currency).
 */
export function linkedCells(
  decl: RegisterDecl | undefined,
  columns: readonly { field: string }[],
  cells: readonly (string | null)[],
  fields: Readonly<Record<string, unknown>> | undefined,
  say: (text: string) => string,
): string[] {
  const figure = amountField(decl)?.id;
  const way = fields ? wayOf(decl, fields as Readonly<Fields>) : null;
  return cells
    .map((c, i) => {
      if (!c) return '';
      const said = say(c);
      return columns[i]?.field === figure ? signedSaid(said, way) : said;
    })
    .slice(1)
    .filter((c) => c !== '');
}
