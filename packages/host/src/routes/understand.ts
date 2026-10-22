/**
 * The route row for reading what the record already holds for who and what each thing is about, now rather than
 * tonight: the record's `understand`, one slice of the nightly walk ("understanding is the engine's
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
 *
 * AND `understandPlan`, THE SAME DRY SLICE AS A READ+ READ, for the command line and an agent's `understand` tool: what
 * the walk would link and ask, in names, so an agent working for the owner sees how the record reads the people and
 * projects in the work before it meets anyone. A GET that takes nothing, writes nothing and files nothing; who may read
 * it is the record's to say (`30 §10`), and a record built before it answers `NOT_IN_THIS_BUILD`, never a 500.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'understand', group: 'ADMIN', writes: true, what: 'Read what this BrainDog already holds for who and what each thing is about, now rather than tonight: link what is certain and ask on Decide about the rest. With dry, it says what it would link and ask, and changes nothing.' },
  { name: 'understandPlan', group: 'READ+', writes: false, what: 'What this BrainDog would link next to who and what each thing is about, and what it would ask you on Decide, all in names. It changes nothing.',
    takes: {} },
];
