/**
 * The route rows for the organisations and projects that may be on the record twice, and for his press that asks
 * whether two are one (`packages/record/src/methods/named-twice.ts`).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * `namedTwice` IS READ+, AND IT CHANGES NOTHING. The method's first statement is `scoped(ctx, 'read')`, and every pair
 * is held to the lists the caller reads, so somebody a list is closed to is told nothing of it.
 *
 * `askNamedSame` IS DATA, AND IT WRITES ONLY A QUESTION. Its first statement is `guard(ctx, 'write', ...)` on the pair's
 * list, and a token is refused after it, since folding is a person's press. Nothing is folded until it is answered.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'namedTwice', group: 'READ+', writes: false, what: 'Which organisations and projects may be on this record twice, each with one sentence saying why. It changes nothing.',
    takes: { limit: 'integer' } },
  { name: 'askNamedSame', group: 'DATA', writes: true, what: 'Put one question on Decide that folds two organisations or projects into one, with one Undo, asked by a person and never by an agent.',
    takes: { pair: 'text' } },
];
