/**
 * The route row for which skills are behind their findings (`packages/record/src/methods/skills-behind.ts`).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * READ+, AND IT CHANGES NOTHING. The method's first statement is `scoped(ctx, 'read')`, and it answers nothing from a
 * list the caller may not read. Proposing a skill's next version is `propose`'s, and taking it is a press on Decide.
 *
 * `takes` SAYS THE SHAPE AND NOTHING MORE. `limit` is a whole number, so a call asking by anything else is refused
 * here, at `limit`. How many it may ask for is the record's question.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'skillsBehind', group: 'READ+', writes: false, what: 'Which skills have lessons about them that their text does not take in yet, each with those lessons. It changes nothing.',
    takes: { limit: 'integer' } },
];
