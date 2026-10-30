/**
 * The route row for what stopped on this record (`packages/record/src/methods/exceptions.ts`).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * READ+, AND IT CHANGES NOTHING. The method's first statement is `scoped(ctx, 'read')`, so anybody who reads the record
 * is answered, each only about the lists they may read. It files no question: what stopped is read fresh every time and
 * is gone from the answer when the thing arrives again.
 *
 * `takes` SAYS THE SHAPE AND NOTHING MORE: it takes nothing.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'exceptions', group: 'READ+', writes: false, what: 'What stopped here: a list that took something most days and then nothing, a way in that went quiet, a feed that missed its time, and anything older than its page allows. Each by its name, in one sentence, with the day it stopped. It changes nothing.',
    takes: {} },
];
