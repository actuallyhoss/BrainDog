/**
 * The route rows for shared links to one page (`packages/record/src/methods/shares.ts`).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * OPENING, CLOSING AND LISTING ARE THE OWNER'S, AND READING IS THE LINK'S. The owner's change who can read a page, so they
 * are ADMIN, a browser session at owner. `sharedPage` is reached only through `Authorization: Share <token>`, which each host
 * checks at its own door (`packages/host/src/share.ts`) and turns into the share principal; any other caller asking it
 * is refused by the record's ladder. `openShare`'s answer carries the link, which the host signs, because the record
 * never holds the key.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'openShare', group: 'ADMIN', writes: true, what: 'Open a read-only link to one page for 1 to 90 days, 30 unless said. The link is shown once and never again.' },
  { name: 'closeShare', group: 'ADMIN', writes: true, what: 'Close one shared link for good. Sharing the page again makes a new link.' },
  { name: 'shares', group: 'ADMIN', writes: false, what: 'The links this record opened to its pages, newest first, open and closed, and never a link itself.' },
  { name: 'sharedPage', group: 'READ+', writes: false, what: 'The one page a shared link opens, read-only and one level deep. Only a shared link asks it.' },
];
