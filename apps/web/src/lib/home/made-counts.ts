/**
 * HOW MANY ENTRIES EACH LIST HELD THE MOMENT THE FIRST RUN MADE THE BRAINDOG (AH19), kept on this device by the record's
 * address. A Guide's plan is written by the starter from the sentence, not added by the person, so Today still offers to
 * tell it one real thing (`addedByHand` in `first-today.ts`). Nothing kept counts every entry, as before.
 *
 * IN localStorage AND NOT A PREFERENCE: it is a fact about one record's making, read only by Today, and a cookie carries
 * every record's preferences on every request. Every read and write is guarded, so a private window counts as before.
 */

const KEY = 'braindog.made.counts';

type Kept = Record<string, Record<string, number>>;

const isCounts = (v: unknown): v is Record<string, number> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0);

function all(): Kept {
  try {
    const v: unknown = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '{}');
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Kept) : {};
  } catch {
    return {};
  }
}

/** What the making wrote into the record at `base`, by list id, or nothing where this device kept none. */
export function madeOf(base: string): Record<string, number> {
  const v = all()[base];
  return isCounts(v) ? v : {};
}

/** Keep what the making wrote into the record at `base`. */
export function keepMade(base: string, counts: Record<string, number>): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify({ ...all(), [base]: counts }));
  } catch {
    /* Not kept: Today counts every entry, as before. */
  }
}
