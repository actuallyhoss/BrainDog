/**
 * The route row for renaming one list after setup (`packages/record/src/methods/rename-list.ts`).
 *
 * ADMIN, AS EVERY CHANGE TO WHAT THE RECORD CALLS THINGS IS: the owner, in a browser. Slash, the first run's drafts and
 * Settings > Words all send it; Undo is the same call with the old name.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'renameList', group: 'ADMIN', writes: true, what: 'Rename one list: the word the speaking use case calls it, or its own name where none does. Undo is the same call with the old name.' },
];
