/**
 * The route row for renaming one machine (`packages/record/src/methods/device-rename.ts`, the machine stamp).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * ADMIN, AS `revokeDevice` IS: the owner, in a browser. A machine is named by its handle, the one `listDevices` shows.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'renameDevice', group: 'ADMIN', writes: true, what: 'Rename one machine by its handle: its sign-in and its key read the new name.' },
];
