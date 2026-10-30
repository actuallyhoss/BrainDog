/**
 * The route row for what his answers taught (`packages/record/src/methods/learned.ts`).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * READ+, AND IT CHANGES NOTHING. The method's first statement is `scoped(ctx, 'read')`, and every line it answers is
 * held to what the caller may read: a question to whoever may see it, a pair of people to whoever reads their list.
 * Taking an answer back is Undo's and Decide's, never this row's.
 *
 * `takes` SAYS THE SHAPE AND NOTHING MORE. `limit` is a whole number, so a call asking by anything else is refused
 * here, at `limit`. How many it may ask for is the record's question.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'learned', group: 'READ+', writes: false, what: 'What BrainDog will not ask again because of an answer, each in one plain sentence: two people kept apart, an offer turned down, a question answered no. Newest first, 50 at most. It changes nothing.',
    takes: { limit: 'integer' } },
];
