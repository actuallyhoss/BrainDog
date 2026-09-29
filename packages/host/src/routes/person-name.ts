/**
 * The route row for a person changing their own name (`packages/record/src/methods/person-name.ts`).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * DATA, A PERSON'S OWN, AS `setPref` IS. Any level may change their own name, since it is theirs and not the record's;
 * the method refuses a token and a shared link. The sign-in address is not a record's route at all: it is
 * `POST /account/email` and `/account/email/confirm` in `../auth.ts`, the account's.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'renamePerson', group: 'DATA', writes: true, what: 'Change your own name, as every record you belong to shows it. A person only, signed in; the change is in History, signed by you.' },
];
