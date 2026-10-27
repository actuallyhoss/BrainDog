/**
 * The route row for taking a question back (`packages/record/src/methods/withdraw.ts`).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * DATA, BECAUSE IT IS THE OTHER HALF OF `propose`. Whoever may ask may take back what they asked, and the kernel says
 * whether this caller is the run that asked; anybody else is refused with the fix, and answers it in Decide.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'withdraw', group: 'DATA', writes: true, what: 'Take back a question you asked while it is still open, so it leaves Decide. Only the run that asked can.' },
];
