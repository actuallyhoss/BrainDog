/**
 * The route row for trying a whole change before anybody accepts it (`packages/record/src/methods/preview-change.ts`).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * READ+ BESIDE `previewPage`, AND A POST LIKE IT (`writes: true`), though it keeps nothing: a change and its sample rows
 * are no query string, and the rehearsal writes before it throws every write away.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'previewChange', group: 'READ+', writes: true, what: 'Draw a whole change as it would stand, over sample rows if it brings any, each page held to what you may read. It keeps nothing.' },
];
