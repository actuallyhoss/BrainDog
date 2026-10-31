/**
 * The route row for the record's time zone (`packages/record/src/methods/zone.ts`, MC2).
 *
 * ONE ROW, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because `router-groups` and `guards` read the table by that shape.
 * ADMIN: only an owner in a browser moves the zone, since every member's "today" is counted in it. It is read in
 * `boot`'s `zone`, so there is no reading row. The zone comes in a POST body.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'setZone', group: 'ADMIN', writes: true, what: 'Set the time zone this BrainDog counts its days in, a place such as Europe/London.' },
];
