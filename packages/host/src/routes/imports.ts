/**
 * The route rows for every import made into the record and the owner's word on each (`packages/record/src/methods/
 * imports.ts`, ENG-A13).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because `router-groups` holds each row's group to
 * `docs/30-BLUEPRINT.md` §5 and `guards` holds the record method of the same name to the guard its group implies.
 *
 * READ+ AND NO WRITE for `imports`: reading what was imported moves nothing and opens no run, and who may read it is the
 * record's to say. It takes nothing, so a GET carries no query.
 *
 * AND ONE ADMIN ROW, THE OWNER'S PRESS: `importAdopt` says an import is his own, or outside text. A person in a browser
 * and never a token, as `trustTakeBack` is, so no agent vouches for what it reads. `yes` is `json`, which keeps a
 * `true` or `false` as it was sent, since a route's arguments are text, an integer or JSON (`ArgType`).
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'imports', group: 'READ+', writes: false, what: 'Every import made into this record, what each brought in, and whether you said it is your own. Only the owner reads it.',
    takes: {} },
  { name: 'importAdopt', group: 'ADMIN', writes: true, what: 'Say an import is your own, or treat it as outside text, so an agent that reads it asks first.',
    takes: { run: 'text', yes: 'json' } },
];
