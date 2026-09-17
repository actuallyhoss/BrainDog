/**
 * The day a row was finished, filled by the record (`finished:` on a register).
 *
 * A REGISTER NAMES A DAY FIELD AS `finished`, and the record fills it with today when a row enters one of its `done`
 * states and empties it when the row leaves them. Nobody had to remember to say the day a task was done, so a figure
 * counting work by the week it was finished counts all of it.
 *
 * A DAY SOMEBODY WROTE IS KEPT. A row made or moved to done with the day already in the write keeps that day, which is
 * how an import or a person saying "I finished this on Monday" is dated. Reopening a row empties the day unless the same
 * write sets it.
 *
 * ONE FUNCTION FOR BOTH ENGINES. The write path calls it on every create and update, and the sample engine in the
 * browser calls it on the rows it makes, so a row the sample shows as done carries the day a real record would give it.
 */

export type FinishedDecl = { state?: string | undefined; done?: readonly string[] | undefined; finished?: string | undefined };

const empty = (v: unknown): boolean => v === undefined || v === null || v === '';

/**
 * `fields` as the write leaves them, with the finished day filled or emptied. `before` is the row's state before the
 * write, `null` for a create; `wrote` is the fields the write itself named. Answers what it did.
 */
export function stampFinished(
  decl: FinishedDecl,
  before: { state: string | null } | null,
  fields: Record<string, unknown>,
  wrote: readonly string[],
  today: string,
): 'filled' | 'emptied' | null {
  const day = decl.finished;
  if (!day || !decl.state) return null;
  const done = decl.done ?? [];
  const now = done.includes(String(fields[decl.state] ?? ''));
  const was = before !== null && done.includes(String(before.state ?? ''));
  if (now && !was && empty(fields[day])) {
    fields[day] = today;
    return 'filled';
  }
  if (!now && was && !wrote.includes(day) && !empty(fields[day])) {
    delete fields[day];
    return 'emptied';
  }
  return null;
}
