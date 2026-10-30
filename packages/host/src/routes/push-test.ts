/**
 * The route row for a person ringing their own devices once (`packages/record/src/methods/push-test.ts`).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * DATA, A PERSON'S OWN, AS `setPref` IS. Any level may ring their own phone; the method refuses a token and a shared
 * link, and a second press inside a minute is `RATE_LIMITED` with the seconds left. It writes, because each push is a
 * job in the outbox, and the tail rings the doorbell so the Worker sends it now.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'pushTest', group: 'DATA', writes: true, what: 'Send one test notification to each device you turned notifications on for, to see that it arrives. A person only, once a minute; it says nothing about what this BrainDog holds.' },
];
