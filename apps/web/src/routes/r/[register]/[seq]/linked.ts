/**
 * One line of a list that points at this row, as the row's page draws it under "Bills and invoices" or "Instalments":
 * its amount with its way, and where it stands in a word.
 *
 * A PERSON'S BILLS TOLD THEIR STATE BY A DOT ALONE. "Cloud storage, annual, May · £3,030.00" beside a red dot said
 * neither that the money was coming in nor that it was late, and its pence read unlike every other amount in the app.
 * So the amount says its way, "+£3,030" in, "−£3,030" out, as the Money page and a list's cards do, and the dot has a
 * word beside it: "Paid", "38 days late", "Due in 5 days", "Part paid".
 *
 * THE TONE IS THE LIST'S (`toneOf`, read with the record's clock), so a bill drawn late in its list is drawn late here,
 * with one exception: `toneOf` measures from noon, so a bill due today turns red at midday while its word still says
 * "Due today". Here the dot follows the word, amber all of its day. Out of the component so a test can load it in Node.
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

/** What a pointing row says beside its dot, and the dot's tone. */
export type Stands = { text: string | null; tone: 'good' | 'warn' | 'bad' | 'info' | undefined };

/**
 * Where one pointing row stands, in words (`null` where there is nothing to say beyond its day), and the list's `tone`
 * for it, amber on the day it is due.
 *
 * - A finished row says its state: "Paid", "Written off". A list whose rows are born done (a ledger's "cleared") says
 *   nothing, as `toneOf` draws no dot for it.
 * - An open row past its deadline says how late, and one inside a fortnight how close, the window `toneOf` colours.
 * - Any other state that is not the list's first says itself ("Part paid"), and ahead of the lateness when both hold.
 */
/** A money value as the record keeps it, `{ amount, currency }` in minor units, or `null`. */
const moneyOf = (v: unknown): { amount: number; currency: string } | null => {
  const m = v as { amount?: unknown; currency?: unknown } | null | undefined;
  return m && typeof m === 'object' && typeof m.amount === 'number' && Number.isFinite(m.amount) && typeof m.currency === 'string' ? { amount: m.amount, currency: m.currency } : null;
};

/**
 * HOW MUCH OF IT IS PAID, "£2,000 of £5,470 paid" (31 October, AG23), where the list keeps what was paid beside the
 * amount (a money field named `paid…`, as money's `settle` writes) and some of it, not all, is paid: "Part paid" alone
 * said nothing of how much. `null` where it cannot be said, and the state's own word stands.
 */
export function paidSaid(decl: RegisterDecl, fields: Readonly<Record<string, unknown>>, say: (minor: number, currency: string) => string): string | null {
  const figure = amountField(decl);
  const paidField = decl.fields.find((f) => f.type === 'money' && !f.retired && f.id !== figure?.id && /^paid/iu.test(f.id));
  if (!figure || !paidField) return null;
  const whole = moneyOf(fields[figure.id]);
  const paid = moneyOf(fields[paidField.id]);
  if (!whole || !paid || paid.currency !== whole.currency) return null;
  const total = Math.abs(whole.amount);
  if (paid.amount <= 0 || paid.amount >= total) return null;
  return `${say(paid.amount, paid.currency)} of ${say(total, whole.currency)} paid`;
}

export function linkedState(
  decl: RegisterDecl | undefined,
  fields: Readonly<Record<string, unknown>>,
  now: number,
  tone?: Stands['tone'],
  say?: (minor: number, currency: string) => string,
): Stands {
  if (!decl) return { text: null, tone };
  const stateId = decl.state;
  const state = stateId ? fields[stateId] : undefined;
  const stateField = stateId ? decl.fields.find((f) => f.id === stateId) : undefined;
  if (typeof state === 'string' && decl.done?.includes(state)) {
    const born = stateField?.default;
    return { text: typeof born === 'string' && decl.done.includes(born) ? null : labelled(decl, stateId!, state), tone };
  }
  const first = stateField?.values?.[0];
  const own = stateId && typeof state === 'string' && state !== '' && state !== first ? ((say ? paidSaid(decl, fields, say) : null) ?? labelled(decl, stateId, state)) : null;
  const deadline = decl.fields.find((f) => f.type === 'day' && f.deadline);
  const due = deadline ? fields[deadline.id] : undefined;
  let when: string | null = null;
  let toned = tone;
  if (typeof due === 'string' && /^\d{4}-\d{2}-\d{2}/u.test(due)) {
    const n = daysUntil(due.slice(0, 10), now);
    if (n < 0) when = rowWords.overdue(-n);
    else if (n === 0) {
      when = rowWords.dueToday;
      toned = 'warn';
    }
    else if (n === 1) when = rowWords.dueTomorrow;
    /* AND WHENEVER THE LINE IS TONED AS DUE SOON (pages polish, 2 Nov): a step due in 14 days stood "● Open" in amber,
       a colour with no word for it. */
    else if (n < 14 || tone === 'warn') when = rowWords.dueIn(n);
  }
  if (own && when) return { text: `${own}, ${when.charAt(0).toLowerCase()}${when.slice(1)}`, tone: toned };
  return { text: own ?? when, tone: toned };
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

/**
 * THE LINES THAT POINT HERE, IN THE ORDER A PERSON READS THEM (skills pass 2 Nov): a person's eight bills came in the
 * record's order, "7 Oct, 26 Feb 2027, 8 Nov, 5 Dec…", with the one 38 days late last. Now what is late leads, then what
 * is still open by the day it falls due, the undated open after them, and the finished last, the newest of them first.
 * A list with no deadline and no state keeps the record's order. Returns the order as indexes, so a caller keeps a line
 * and the fields read beside it together.
 */
export function pointingOrder(decl: RegisterDecl | undefined, raw: readonly (Readonly<Record<string, unknown>> | undefined)[], count: number, now: number): number[] {
  const at = Array.from({ length: count }, (_, i) => i);
  const deadline = decl?.fields.find((f) => f.type === 'day' && f.deadline)?.id;
  const stateId = decl?.state;
  if (!decl || (!deadline && !stateId)) return at;
  const dueOf = (i: number): string => {
    const v = deadline ? raw[i]?.[deadline] : undefined;
    return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/u.test(v) ? v.slice(0, 10) : '';
  };
  const done = (i: number): boolean => {
    const s = stateId ? raw[i]?.[stateId] : undefined;
    return typeof s === 'string' && (decl.done?.includes(s) ?? false);
  };
  const band = (i: number): number => {
    if (raw[i] === undefined) return 2;
    if (done(i)) return 3;
    const due = dueOf(i);
    if (due === '') return 2;
    return daysUntil(due, now) < 0 ? 0 : 1;
  };
  return at.sort((a, b) => {
    const d = band(a) - band(b);
    if (d !== 0) return d;
    const x = dueOf(a);
    const y = dueOf(b);
    if (x === y) return a - b;
    if (x === '') return 1;
    if (y === '') return -1;
    /* THE FINISHED, NEWEST FIRST; everything else soonest first. */
    return band(a) === 3 ? (x < y ? 1 : -1) : x < y ? -1 : 1;
  });
}
