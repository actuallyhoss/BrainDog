/**
 * HOW FAR ALONG A ROW IS, FROM THE STEPS UNDER IT.
 *
 * A list may say its rows are the steps of another list's rows: `steps: { of: 'thing', done: 'done' }` on a list of project
 * steps says each row belongs to the project its `thing` points at and is done when `done` is true. A card that draws how
 * far along a project is from a field nobody fills (a person tracking steps never types a percentage) draws the share of
 * its steps that are done instead. A number somebody did type always wins.
 *
 * AND WHICH STEP COMES NEXT, when the list says what orders them: `order: 'rank'` is a field of the steps list, lowest
 * first, and the next step under a row is the first of its steps that is not done. Without it the steps come in the
 * order they were written, which is the only order a list with no such field has.
 *
 * One function, so the record and the browser's sample count the same steps the same way.
 */

export type StepsDecl = { of: string; done: string; order?: string };

/** Each parent's steps as done and total, keyed by what the step's `of` field holds. */
export function tallySteps(
  rows: readonly { fields: Readonly<Record<string, unknown>> }[],
  steps: StepsDecl,
  into: Map<string, { done: number; total: number }> = new Map(),
): Map<string, { done: number; total: number }> {
  for (const row of rows) {
    const of = row.fields[steps.of];
    if (typeof of !== 'string' && typeof of !== 'number') continue;
    const key = String(of);
    const held = into.get(key) ?? { done: 0, total: 0 };
    held.total += 1;
    if (row.fields[steps.done] === true) held.done += 1;
    into.set(key, held);
  }
  return into;
}

/** The share done, as a whole percentage, or `null` for a row with no steps. */
export const stepsPercent = (tally: { done: number; total: number } | undefined): number | null =>
  tally && tally.total > 0 ? Math.round((tally.done / tally.total) * 100) : null;

/**
 * Each parent's first step that is not done, keyed by what the step's `of` field holds.
 *
 * A STEP WITH NO VALUE IN THE ORDER FIELD COMES AFTER EVERY STEP WITH ONE, because a step nobody has ranked yet is not
 * the one to do first; between two of them, and between two of one rank, the one written first wins (`seq`).
 */
export function nextSteps<R extends { seq: number | null; fields: Readonly<Record<string, unknown>> }>(rows: readonly R[], steps: StepsDecl): Map<string, R> {
  const rank = (r: R): number | string | null => {
    const v = steps.order === undefined ? null : r.fields[steps.order];
    return typeof v === 'number' || typeof v === 'string' ? v : null;
  };
  const sorted = [...rows].sort((a, b) => {
    const x = rank(a);
    const y = rank(b);
    if (x !== y) {
      if (x === null) return 1;
      if (y === null) return -1;
      if (x < y) return -1;
      if (x > y) return 1;
    }
    return (a.seq ?? Number.MAX_SAFE_INTEGER) - (b.seq ?? Number.MAX_SAFE_INTEGER);
  });
  const out = new Map<string, R>();
  for (const row of sorted) {
    const of = row.fields[steps.of];
    if ((typeof of !== 'string' && typeof of !== 'number') || row.fields[steps.done] === true || out.has(String(of))) continue;
    out.set(String(of), row);
  }
  return out;
}
