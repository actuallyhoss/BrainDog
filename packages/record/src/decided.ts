/**
 * What a decided question says it chose, for the card's "Decided 2 Oct: <the choice>" (`decidedHere`, AGT-B09).
 *
 * Pure: the record reads each closed question with its close and its decision (`placedDecided`) and hands them here.
 * The words follow the kernel's own memory of an answer (`remembered` in `govern.ts`, which says a no as `said: 'No'`):
 * an options question chose one of its options, and says that option as the person read it; any other question was a
 * yes or a no to the question itself, and says which with the question's own words. What was only partly taken, or
 * closed some way that is no answer, says nothing rather than half of it.
 */

/** How a question was closed, as the record keeps it. */
export type Resolution = {
  /** `addressed` when a decision closed it, `wont-fix` or `incorrect` when the person declined it, anything else no answer. */
  resolved_as: string | null;
  /** The question's body as it stands. A question with options in it is answered by one of them. */
  body: unknown;
  /** The decision that closed it, as its `decide` event keeps it: the answer, and the rows taken when only some were. */
  decided?: { answer?: unknown; rows?: unknown } | null;
};

/** The ways a person declines a question, which say no to it. */
const DECLINED = new Set(['wont-fix', 'incorrect']);

/** A question as a choice repeats it: its own words without the question mark. */
const asked = (question: string): string => question.trim().replace(/[\s?]+$/, '').trim();

const optionsOf = (body: unknown): { id?: unknown; label?: unknown }[] => {
  const options = body !== null && typeof body === 'object' ? (body as { options?: unknown }).options : undefined;
  return Array.isArray(options) ? options.filter((o): o is { id?: unknown; label?: unknown } => o !== null && typeof o === 'object') : [];
};

const rowsOf = (body: unknown): number | null => {
  const rows = body !== null && typeof body === 'object' ? (body as { rows?: unknown }).rows : undefined;
  return Array.isArray(rows) ? rows.length : null;
};

/**
 * What was chosen, in words a person reads, or `null` when the close is no answer to say: the chosen option's label;
 * "Yes: <the question>" for an accept; "No: <the question>" for a reject or a decline. A rowset accepted for only some
 * of its rows, an option that is no longer among the options, or a close with no decision behind it is `null`.
 */
export function choiceOf(question: string, resolution: Resolution): string | null {
  const said = asked(question);
  if (DECLINED.has(resolution.resolved_as ?? '')) return said === '' ? null : `No: ${said}`;
  if (resolution.resolved_as !== 'addressed' || !resolution.decided) return null;
  const answer = resolution.decided.answer;
  if (typeof answer !== 'string' || answer === '') return null;
  const options = optionsOf(resolution.body);
  if (options.length > 0) {
    const label = options.find((o) => o.id === answer)?.label;
    return typeof label === 'string' && label.trim() !== '' ? label.trim() : null;
  }
  if (said === '') return null;
  if (answer === 'reject') return `No: ${said}`;
  if (answer !== 'accept') return null;
  /* SOME OF A ROWSET IS NOT A YES TO THE QUESTION: what it took is in the rows, and "Yes" would say all of it was. */
  const taken = resolution.decided.rows;
  const all = rowsOf(resolution.body);
  if (Array.isArray(taken) && all !== null && taken.length < all) return null;
  return `Yes: ${said}`;
}
