/**
 * The route row for what each arrival in the Inbox is and who it is from (`packages/record/src/methods/inbox-hints.ts`).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * READ+, AND IT CHANGES NOTHING. The method's first statement is `scoped(ctx, 'read')`, and it then answers only a
 * caller the Inbox is open to, as the Inbox itself is: anybody else is answered no hints. Nothing is stored or filed.
 *
 * `takes` SAYS THE SHAPE AND NOTHING MORE. `ids` is a list, so it arrives as JSON; how many it may name and what each
 * must be is the record's question.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'inboxHints', group: 'READ+', writes: false, what: 'For each arrival named in the Inbox, what it is (a payment, or someone writing), who it is from by the name the record knows them by, and the amount it says, worked out by rules from what arrived. Fifty at most. It changes nothing.',
    takes: { ids: 'json' } },
];
