/**
 * A list's `hand:`, read: who holds its rows.
 *
 * A FILE OF ITS OWN, apart from the package's planner (`index.ts`), because the app reads it on every page that draws a
 * list's rows, and the planner carries the declaration validator with it. `@braindog/declare/hand` is this file.
 */

/**
 * Who holds a list's rows, as its `hand:` says: the link field a person is handed a row by, the text field
 * holding the name an agent signs with, and the state a row an agent takes moves to. Either holder may be absent.
 */
export type Hand = { person: string | null; agent: string | null; taken: string | null };

/**
 * A register body's `hand:`, or `null` for a list that does not say who holds its rows.
 *
 * READ, NOT CHECKED: the record refused a `hand:` whose parts are not fields of the list at install (`handFault` in
 * `packages/kernel/src/declare.ts`), so a reader only has to tell a part that is there from one that is not. A part that
 * is not a string is read as absent rather than trusted, since a body can reach a screen from an older host.
 */
export function handOf(body: Readonly<Record<string, unknown>> | null | undefined): Hand | null {
  const hand = body?.hand;
  if (hand === null || typeof hand !== 'object' || Array.isArray(hand)) return null;
  const part = (k: string): string | null => {
    const v = (hand as Record<string, unknown>)[k];
    return typeof v === 'string' && v !== '' ? v : null;
  };
  const out = { person: part('person'), agent: part('agent'), taken: part('taken') };
  return out.person === null && out.agent === null ? null : out;
}
