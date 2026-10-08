/**
 * The route rows for what is not working in BrainDog itself (`packages/record/src/methods/faults.ts`, AGT-C06).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * `faults` IS READ+ AND WRITES NOTHING: the owner, or an agent on the owner's key, reads each fault's sentence, how many
 * times and since when, and a member is refused by the record. `retryFault` IS ADMIN: queueing a dead job again changes
 * what the record does tonight, so it is the owner's in a browser, as every other ADMIN door is.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'faults', group: 'READ+', writes: false, what: 'What is not working in BrainDog now, each in one sentence with how many times and since when. It changes nothing.',
    takes: {} },
  { name: 'retryFault', group: 'ADMIN', writes: true, what: 'Try one broken part of BrainDog again now, rather than at tonight’s retry. Named by the cause the list gives it.' },
];
