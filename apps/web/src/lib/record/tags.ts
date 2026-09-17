/**
 * The tags a person reads, and the ones the record keeps for itself.
 *
 * A ROW FORMED FROM WHAT SOMEBODY SAID CARRIES `formed` BESIDE `example` (`@braindog/seed` `install.ts` `FORMED_TAG`), so
 * the record can tell the plan a person described from the examples it may offer to clear. Both are the record's words,
 * and the row page drew them as "formed,example". `formed` is never shown; on a formed row `example` is not shown either,
 * because that row is the person's own plan and not an example. A plain example row keeps `example`, which is how setting
 * up promised it would be marked. Hidden tags stay in the record, and an edit writes them back.
 */

export const FORMED = 'formed';
export const EXAMPLE = 'example';

/** The tags of `tags` the record keeps to itself. */
export function systemTags(tags: readonly unknown[]): string[] {
  const all = tags.map(String);
  const formed = all.includes(FORMED);
  return all.filter((t) => t === FORMED || (formed && t === EXAMPLE));
}

/** The tags a person reads, in the order the record holds them. */
export function shownTags(tags: readonly unknown[]): string[] {
  const hidden = new Set(systemTags(tags));
  return tags.map(String).filter((t) => !hidden.has(t));
}

/** A list as a line: its elements with a comma and a space, the record's own tags left out. `null` when nothing is left. */
export function listLine(value: readonly unknown[]): string | null {
  const shown = shownTags(value).map((t) => t.trim()).filter((t) => t !== '');
  return shown.length === 0 ? null : shown.join(', ');
}

/** What a person typed into a list's box, as the list the record takes, with the record's own tags kept. */
export function listFromDraft(draft: string, was: unknown): string[] {
  const typed = draft.split(',').map((t) => t.trim()).filter((t) => t !== '');
  const kept = Array.isArray(was) ? systemTags(was) : [];
  return [...new Set([...typed, ...kept])];
}
