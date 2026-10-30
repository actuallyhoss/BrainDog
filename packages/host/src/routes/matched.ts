/**
 * The route row for who the record matched on its own (`packages/record/src/methods/matched.ts`).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * READ+, AND IT CHANGES NOTHING. The method's first statement is `guard(ctx, 'read', ...)` on the list that holds the
 * people, so anybody who may read them is answered, and somebody they are closed to is refused as reading the list is.
 * It answers names, one sentence of evidence and the batch an Undo takes; the undo itself is `undo`'s, an owner's.
 *
 * `takes` SAYS THE SHAPE AND NOTHING MORE. `limit` is a whole number, so a call asking by anything else is refused
 * here, at `limit`. How many it may ask for is the record's question.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'matched', group: 'READ+', writes: false, what: 'Who BrainDog matched on its own and still holds as one: who was folded into whom by name, one sentence of evidence, when, and the batch an Undo takes. Newest first, 50 at most. Nothing on a BrainDog that keeps no people. It changes nothing.',
    takes: { limit: 'integer' } },
];
