/**
 * The route row for where things stand (`packages/record/src/methods/stale.ts`, AGT-C18 job c).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * `stale` IS READ+ AND WRITES NOTHING: a person, or an agent on a key that reads, is told what went stale where they
 * stand and the one call that clears each, held by the record to the lists they may read. It takes nothing.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'stale', group: 'READ+', writes: false, what: 'What went stale where you stand, each kind in one sentence with how many and the one call that clears it. It changes nothing.',
    takes: {} },
];
