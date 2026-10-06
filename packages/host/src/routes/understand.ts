/**
 * The route row for reading what the record already holds for who and what each thing is about, now rather than
 * tonight: the record's `understand`, one slice of the nightly walk (DIRECTION §38: "understanding is the engine's
 * first job").
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * ADMIN, AN OWNER IN A BROWSER, as `slash` and `slashPropose` are: the walk links rows on every list it reads and files
 * questions on Decide for the whole record, and no token reaches it, so an agent cannot start it. A WRITE, so it is a
 * POST, and `{ dry: true }` answers what it would link and ask with nothing written or filed. Until the record has the
 * method, `handlersFor` answers `NOT_IN_THIS_BUILD`.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'understand', group: 'ADMIN', writes: true, what: 'Read what this BrainDog already holds for who and what each thing is about, now rather than tonight: link what is certain and ask on Decide about the rest. With dry, it says what it would link and ask, and changes nothing.' },
];
