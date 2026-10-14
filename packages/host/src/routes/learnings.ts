/**
 * The route row for what was learned (`packages/record/src/methods/learnings.ts`, AGT-C14 job c, Build 3).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * `learnings` IS READ+ AND WRITES NOTHING: a person, or an agent on a key that reads, is handed the learnings that
 * still stand where they are, in the order a session needs them, held by the record to whoever may read that list.
 *
 * `takes` SAYS THE SHAPE AND NOTHING MORE. `limit` is a whole number and may be left out, so a call asking by anything
 * else is refused here, at `limit`. How many it may ask for is the record's question.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'learnings', group: 'READ+', writes: false, what: 'What was learned that still stands where you are: methods before facts, this project before everywhere, newest first. Forty unless you ask for another count, and it says when there are more. It changes nothing.',
    takes: { limit: 'integer' } },
];
