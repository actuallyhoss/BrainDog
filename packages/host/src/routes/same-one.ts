/**
 * The route row for a person asking whether entries held twice are one (`packages/record/src/methods/same-one.ts`).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * DATA, AND A WRITE THAT MERGES NOTHING. The method's first statement is `guard(ctx, 'write', ...)`, so anybody who may
 * write to the list may ask. What it writes is the one question the nightly pass would have filed for the same entries,
 * and it answers that question's id; the folding itself stays on Decide, where somebody says who is who.
 *
 * `takes` SAYS THE SHAPE AND NOTHING MORE. `register` is text, so a body naming the list by anything else is refused
 * here, at `register`. `rows` is the entries' ids as a list, and whether it is there, is a list and holds two or more
 * of that list's own is the record's question, answered by the record at `rows` in its own sentence.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'sameOne', group: 'DATA', writes: true, what: 'Ask whether two or more people you hold are the same one. It opens one question on Decide; the owner\'s own agent, while he lets it act or told it to, merges them at once, with Undo.',
    takes: { register: 'text', rows: 'json' } },
];
