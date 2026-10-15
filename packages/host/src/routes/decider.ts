/**
 * The route row for handing a question to the one person who decides it (`packages/record/src/methods/decider.ts`,
 * USE-A13).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * ADMIN, AS EVERY METHOD THAT SAYS WHO MAY DO WHAT IS: the owner, in a browser. A token never hands a question out.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'setDecider', group: 'ADMIN', writes: true, what: 'Hand one open question to the person who decides it, somebody who holds Decides or owns the record, or take it back with nobody named.' },
];
