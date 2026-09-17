/**
 * Clearing the example rows setting up planted (`examples`, `clearExamples` on the record).
 *
 * PURE, SO `node --test` CAN IMPORT IT: the client is handed in, as `spark.ts` takes it.
 *
 * WHICH ROWS ARE EXAMPLES IS THE RECORD'S. Only a row that arrived as an example and that nobody has edited, noted, or
 * pointed a row of their own at is cleared; this file only words the offer. On a new record the offer is quiet. Once rows of
 * the person's own sit beside the examples (an import, or rows typed by hand), the examples are in the way, so it says so.
 */

type Refused = { ok: false; refusal: { code: string; fix: string } } | { ok: false; conflict: unknown };
type Answer<T> = { ok: true; value: T } | Refused;

export type ExamplesClient = { call: <T>(name: string, args?: Record<string, unknown>) => Promise<Answer<T>> };

/** What the record counts: untouched examples by list, examples somebody touched, and rows of their own in those lists. */
export type Examples = { untouched: number; touched: number; registers: Record<string, number>; others: number };

/** The offer as Home draws it, or `null` when there is nothing to clear. */
export type Offer = { title: string; body: string; button: string; confirm: string; keep: string; loud: boolean };

const rows = (n: number): string => (n === 1 ? 'one example row' : `${n} example rows`);

export const words = {
  title: 'Example rows',
  fresh: (n: number) =>
    `Setting up added ${rows(n)} so each page has something to show. They are marked as examples. Clear them when you are ready to use your own.`,
  beside: (n: number) =>
    `Your own rows are here now, beside ${rows(n)} setting up added. They show on Home, Money and the Dashboard until you clear them.`,
  touched: (n: number) => (n === 1 ? ' One example you changed stays.' : ` ${n} examples you changed stay.`),
  button: 'Clear the examples',
  confirm: (n: number) => (n === 1 ? 'Delete the example row' : `Delete ${n} example rows`),
  keep: 'Keep them',
  cleared: (n: number) => (n === 1 ? 'Cleared one example row.' : `Cleared ${n} example rows.`),
  kept: (n: number) => (n === 1 ? ' One you changed was kept.' : ` ${n} you changed were kept.`),
} as const;

/** The offer for what the record counted, or `null` when no untouched example is left. */
export function offerOf(e: Examples | null): Offer | null {
  if (!e || e.untouched === 0) return null;
  const loud = e.others > 0;
  return {
    title: words.title,
    body: (loud ? words.beside(e.untouched) : words.fresh(e.untouched)) + (e.touched > 0 ? words.touched(e.touched) : ''),
    button: words.button,
    confirm: words.confirm(e.untouched),
    keep: words.keep,
    loud,
  };
}

const fixOf = (out: Refused): string => ('refusal' in out ? out.refusal.fix : 'The record changed while this was open. Try again.');

/** What the record counts, or `null` on a refusal (a record the reader does not own has nothing to offer). */
export async function readExamples(client: ExamplesClient): Promise<Examples | null> {
  const out = await client.call<Examples>('examples');
  return out.ok ? out.value : null;
}

/** Clear them, and the sentence that says what happened. */
export async function clearExamples(client: ExamplesClient): Promise<{ ok: true; said: string } | { ok: false; fix: string }> {
  const out = await client.call<{ cleared: number; kept: number }>('clearExamples');
  if (!out.ok) return { ok: false, fix: fixOf(out) };
  return { ok: true, said: words.cleared(out.value.cleared) + (out.value.kept > 0 ? words.kept(out.value.kept) : '') };
}
