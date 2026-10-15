/**
 * The route row for the grammar of an automation (`packages/record/src/methods/flow-grammar.ts`).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, for the reason `routes/automations.ts` gives: `router-groups`
 * holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same name to its
 * group's guard. READ+, as `automations` is, since it is read by whoever reads automations, and a read: it changes nothing.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'flowGrammar', group: 'READ+', writes: false, what: 'What an automation may say: every trigger and step, the arguments each takes and which it needs, and the most steps, depth, runs a day and answers one may hold.' },
];
