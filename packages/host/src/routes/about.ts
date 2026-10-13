/**
 * The route row for what one thing on the record is (`packages/record/src/methods/about.ts`).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * READ+, AND IT CHANGES NOTHING. The method's first statement is `scoped(ctx, 'read')`: it names no list, so anybody
 * who may read anything is answered, and the answer is held to the lists that caller reads. Something in a list closed
 * to her is answered as a name nobody has, so the route never says it is there.
 *
 * `takes` SAYS THE SHAPE AND NOTHING MORE. `name` is text, so a call naming the thing by anything else is refused
 * here, at `name`. Asking by a row's number in its list is the record method's second form, for a caller in process.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'about', group: 'READ+', writes: false, what: 'What one thing is, asked by its name: its kind, its name, what else it goes by and where it was seen. When two things answer to the name, both are offered and neither is picked. Held to the lists you may read. It changes nothing.',
    takes: { name: 'text' } },
];
