/**
 * The route row for the rows of one list that hold the same values (`packages/record/src/methods/same-values.ts`).
 *
 * READ+, AND IT CHANGES NOTHING: its first statement is `guard(ctx, 'read', ...)`, and it is answered only to somebody
 * who reads the whole list. `fields` is JSON, a list of field ids.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'sameValues', group: 'READ+', writes: false, what: 'The rows of one list that hold the same values in the fields named, in sets, a moment compared by its day: readings written twice, say. It changes nothing.',
    takes: { register: 'text', fields: 'json' } },
];
