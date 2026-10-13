/**
 * The route row for who may be on the record twice (`packages/record/src/methods/held-twice.ts`).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * READ+, AND IT CHANGES NOTHING. The method's first statement is `guard(ctx, 'read', ...)`, so anybody who may read the
 * list is answered, and somebody it is closed to is refused as reading the list is. It answers each person's number in
 * the list, for a list narrowed to them; asking whether two of them are one is `sameOne`'s.
 *
 * `takes` SAYS THE SHAPE AND NOTHING MORE. `register` is text, so a call naming the list by anything else is refused
 * here, at `register`. Whether that list is where the record keeps people is the record's question.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'heldTwice', group: 'READ+', writes: false, what: 'Which people may be on this record twice, each by their number in the list, lowest first. Nothing when the list is not where the record keeps people. It changes nothing.',
    takes: { register: 'text' } },
];
