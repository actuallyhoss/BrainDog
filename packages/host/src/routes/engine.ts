/**
 * The route rows for the engine's health, its readings and its one switch (`packages/record/src/methods/engine.ts` and
 * `engine-readings.ts`).
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
  /* THE ONE SWITCH FOR SLASH'S BACKGROUND READING, ADMIN as `slashDaily` is: an owner's in a browser. With no
     argument it answers the state as it stands. */
  { name: 'slashReads', group: 'ADMIN', writes: true, what: 'Whether Slash reads in the background and sends what a job needs to a model. On unless the owner turns it off.' },
  { name: 'engineHealth', group: 'READ+', writes: false, what: 'Whether Slash’s model answers, read from its own ledger, with the one sentence a person reads about it.' },
  /* WHAT THE MODEL WAS ASKED AND ANSWERED, READ+ as `engineHealth` is: purposes, counts, instants and a failure's
     code, with no row of the record and no person's words. `null` where the host hands the record no ledger. */
  { name: 'engineReadings', group: 'READ+', writes: false, what: 'What Slash’s model was asked and answered in the last 30 days, purpose by purpose, and what BrainDog does not yet understand.' },
];
