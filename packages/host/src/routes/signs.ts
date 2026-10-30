/**
 * The route row for the record's vital signs (`packages/record/src/methods/signs.ts`).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * READ+ AND NO WRITE. Reading the signs files nothing and opens no run: the kernel keeps a reading a day at 00:05 by
 * itself, so `braindog signs`, the Health page and an agent all read what is true now without changing it. It takes
 * nothing, so a GET carries no query.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'signs', group: 'READ+', writes: false, what: 'Your BrainDog’s vital signs now, each with whether it needs a look, its number, one sentence and its last 14 days. It changes nothing.',
    takes: {} },
];
