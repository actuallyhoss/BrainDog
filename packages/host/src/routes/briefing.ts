/**
 * The route row for the briefing (`packages/record/src/methods/briefing.ts`).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * READ+, AND IT CHANGES NOTHING. The method's first statement is `scoped(ctx, 'read')`: it names no list, and holds
 * each card to what the caller may read itself, so somebody invited to one list is answered only what that list holds.
 * It is worked out when it is asked and kept in no table.
 *
 * `takes` IS EMPTY, because the briefing is the record's and the caller chooses nothing about it.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'briefing', group: 'READ+', writes: false, what: 'What matters here now: a few cards, each one line and the thing it opens, the most pressing first. What is late, what is asked, a step an agent left and what falls due this week. No card when nothing is pressing. It changes nothing.',
    takes: {} },
];
