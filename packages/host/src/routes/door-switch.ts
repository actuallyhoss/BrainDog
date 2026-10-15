/**
 * The route row for switching one webhook door off or on (`packages/record/src/methods/door-switch.ts`).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'doorSwitch', group: 'ADMIN', writes: true, what: 'Switch one webhook door off or on. Off answers every arrival 410 and stores nothing; its address and token are kept, so on again is the same door.' },
];
