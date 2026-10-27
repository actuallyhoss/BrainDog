/**
 * The route row for running one scheduled action now (`packages/record/src/methods/action-run.ts`).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * DATA, BECAUSE A TOKEN MAY PRESS IT: an owner in a browser, or a token whose agent may write in the action's project.
 * The method asks both after the group's own guard. The press makes no request; it moves the next run to now.
 *
 * THE 429 IS ALREADY THE DOOR'S. `serveApi` answers `RATE_LIMITED` as 429 and sends the refusal's `retry_after` as
 * `Retry-After`, the shape `limits.ts` answers its own minute in, so this row needs nothing of its own for it.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'actionRun', group: 'DATA', writes: true, what: 'Run one scheduled action now: its next run is due at once, at most once a minute.' },
];
