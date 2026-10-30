/**
 * The route rows for what may be on the record twice, and for his press that folds it
 * (`packages/record/src/methods/held-twice.ts`).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * `heldTwice` IS READ+, AND IT CHANGES NOTHING. The method's first statement is `guard(ctx, 'read', ...)`, so anybody who
 * may read the list is answered, and somebody it is closed to is refused as reading the list is. It answers each row's
 * number in the list, for a list narrowed to them; asking whether two people are one is `sameOne`'s.
 *
 * `askFoldTwice` IS DATA, AND IT WRITES ONLY A QUESTION. Its first statement is `guard(ctx, 'write', ...)`, and a token
 * is refused after it, since folding is a person's press. Nothing is folded until the question is answered on Decide.
 *
 * `takes` SAYS THE SHAPE AND NOTHING MORE. `register` is text, so a call naming the list by anything else is refused
 * here, at `register`. Whether that list keeps people, or says what makes two of its rows the same, is the record's.
 * `askFoldTwice` also takes `rows`, the ones picked on the list, as JSON, so a press folds only their groups.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'heldTwice', group: 'READ+', writes: false, what: 'Which people, or which things in a list that says what makes two of them the same, may be here twice, each by their number in the list, lowest first. Nothing for any other list. It changes nothing.',
    takes: { register: 'text' } },
  { name: 'askFoldTwice', group: 'DATA', writes: true, what: 'Put one question on Decide that folds everything a list holds twice into one of each, or only the things picked and what they are here twice with, with one Undo, asked by a person and never by an agent.',
    takes: { register: 'text', rows: 'json' } },
];
