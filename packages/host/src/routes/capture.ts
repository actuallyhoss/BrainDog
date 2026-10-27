/**
 * The route row for keeping one sentence as several entries at once (`packages/record/src/methods/capture.ts`, use case 6
 * step 5).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * DATA, BESIDE `create`, BECAUSE IT IS `create` SEVERAL TIMES IN ONE PRESS. Every list is guarded as `create` guards it,
 * and what it adds is that the entries share one batch, so the Undo on its toast takes all of them back. A POST, and the
 * entries come in the body.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'capture', group: 'DATA', writes: true, what: 'Add one to eight entries across your lists in one go, all or none, so one Undo takes every one of them back.' },
];
