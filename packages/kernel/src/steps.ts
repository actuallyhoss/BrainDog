/**
 * HOW FAR ALONG A ROW IS, FROM THE STEPS UNDER IT.
 *
 * A list may say its rows are the steps of another list's rows: `steps: { of: 'thing', done: 'done' }` on a list of project
 * steps says each row belongs to the project its `thing` points at and is done when `done` is true. A card that draws how
 * far along a project is from a field nobody fills (a person tracking steps never types a percentage) draws the share of
 * its steps that are done instead. A number somebody did type always wins.
 *
 * One function, so the record and the browser's sample count the same steps the same way.
 */

export type StepsDecl = { of: string; done: string };

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
