/**
 * The route rows written outside `index.ts`: every file under `routes/`, gathered into `EXTRA_ROUTES`.
 *
 * ONE FILE PER UNIT, AND THIS FILE IS ONLY A LIST. A new routed method is a record method in
 * `packages/record/src/methods/<unit>.ts` and its row in `routes/<unit>.ts`, which exports `ROUTES`; it is registered
 * here with one import line and one spread line, both inside the `ROUTES` block, so two units adding routes in one
 * workflow touch two lines of this file and no line of `index.ts` (`loop/finish/contracts.md` §0 point 5).
 *
 * `index.ts` SERVES THESE AS IT SERVES ITS OWN. `ROUTES` there is its own rows and then these, and `handlersFor` wires
 * each of these to the record method of the same name, answering `NOT_IN_THIS_BUILD` from a record that has not got it.
 */

import type { Route } from '../index.ts';

/* ROUTES: the imports, one line per file under this folder, named for the file. */
import { ROUTES as agents } from './agents.ts';
/* END ROUTES */

export const EXTRA_ROUTES: readonly Route[] = [
  /* ROUTES: the spreads, one line per file, in the order of the imports above. */
  ...agents,
  /* END ROUTES */
];
