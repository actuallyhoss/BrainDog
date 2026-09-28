/**
 * The route rows for the record's quiet hours (`packages/record/src/methods/quiet.ts`, `loop/finish/contracts.md` §12.1,
 * `docs/09-ALARMS-AND-NOTIFICATIONS.md` §5 rule 3).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * READ+ TO READ AND ADMIN TO CHANGE. Every member is told when their summary is held back, and only an owner in a
 * browser moves the window, since it holds the summary back for everybody. The write takes its window in a POST body.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'quietHours', group: 'READ+', writes: false, what: 'The record’s quiet hours, when a summary that comes due is held until they end, in the record’s time zone.' },
  { name: 'setQuietHours', group: 'ADMIN', writes: true, what: 'Set the record’s quiet hours to a start and an end, turn them off, or put 22:00 to 08:00 back.' },
];
