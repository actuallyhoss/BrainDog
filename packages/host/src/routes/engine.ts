/**
 * The route row for the engine's health (`packages/record/src/methods/engine.ts`, ENG-A02).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * READ+, so a read token, the command line and the daily vital-sign read are told whether Slash's model answers, in the
 * same sentence a person reads in Settings.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'engineHealth', group: 'READ+', writes: false, what: 'Whether Slash’s model answers, read from its own ledger, with the one sentence a person reads about it.' },
];
