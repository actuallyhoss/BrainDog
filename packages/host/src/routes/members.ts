/**
 * The route row for stopping a member and letting them back in (`packages/record/src/index.ts` `suspendMember`,
 * `loop/finish/contracts.md` §2.5 and X11).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * ONE VERB BOTH WAYS. `suspended: true` stops somebody and `false` lets them back in, as `setAutomation` takes `enabled`,
 * so there is no second route to keep in step with this one. ADMIN, beside `removeMember`, because deciding who may act
 * on the record is the owner's, in a browser.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'suspendMember', group: 'ADMIN', writes: true, what: 'Stop somebody without taking them off, or let them back in. Everything they held is kept. Never the last owner.' },
];
