/**
 * The route row for the engine's probe (`packages/record/src/methods/engine-probe.ts`).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * ADMIN, AS `slashReads` IS: an owner's press in a browser, never a token's, since it sends a question to a model on the
 * record's account. It writes: one ledger row a model asked, and the mark that holds the next press for ten minutes.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'engineProbe', group: 'ADMIN', writes: true, what: 'Ask each model Slash would use whether it answers now, with a fixed question that holds nothing of the record, and say which answered and how fast, or why not. One every ten minutes.' },
];
