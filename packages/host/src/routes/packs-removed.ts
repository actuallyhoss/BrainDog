/**
 * The route row for what was taken out of this record and can still be put back (`packages/record/src/methods/packs-removed.ts`).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * ADMIN, AND IT CHANGES NOTHING. The method's first statement is `admin(ctx)`, as `installPack` and `uninstallPack`
 * start, so only an owner in a browser is answered and a token is refused in that guard's sentence. It is the read
 * half of `uninstallPack`, as `planPack` is the read half of installing.
 *
 * IT TAKES NOTHING. The answer is every add-on taken out within the window, so `takes` is empty and a query value the
 * route does not take reaches no answer.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'packsRemoved', group: 'ADMIN', writes: false, what: 'The plugins taken out that can still be put back, newest first: what each was called, which lists stayed and how many entries each still holds, and whether installing it again puts its settings and schedules back. It changes nothing.',
    takes: {} },
];
