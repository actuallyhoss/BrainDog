/**
 * The route row for many lists' declarations in one read (`packages/record/src/methods/schemas.ts`).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * `schemas` IS READ+, AS `schema` IS, AND IT CHANGES NOTHING. The method asks `scoped(ctx, 'read')` first and then holds
 * each list to `guard(ctx, 'read', list)`, the check `schema` asks, so nobody is answered a list here that `schema` would
 * refuse them. `registers` is JSON, a list of ids, so it survives a query string as the list it was; `every` is JSON
 * too, `true` for every list the caller reads, the ones `boot` names them by the same check.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'schemas', group: 'READ+', writes: false, what: 'What several registers hold, in one read: each one as schema answers it, or the refusal schema would give, or every register you may read. It changes nothing.',
    takes: { registers: 'json', every: 'json' } },
];
