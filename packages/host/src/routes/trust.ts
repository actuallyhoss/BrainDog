/**
 * The route row for each agent's standing on the ladder (`packages/record/src/methods/trust.ts`).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * READ+ AND NO WRITE. The ladder moves when an agent writes, when the owner answers an offer and when a change is
 * undone; reading where it stands moves nothing and opens no run. Who may read it is the record's to say: the method's
 * first statement is its guard, and the host passes a refusal on as the record worded it. It takes nothing, so a GET
 * carries no query.
 *
 * AND ONE ADMIN ROW, THE OWNER'S "Ask again": `trustTakeBack` puts an agent back to asking, by the name and the words
 * `trust` said. A person in a browser and never a token, as `slashReads` is, so no agent sets a rung of its own.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'trust', group: 'READ+', writes: false, what: 'How far each agent is trusted with each kind of change: Ask, Do and tell or Do quietly, since when, and whether it was put back to Ask. It changes nothing. Only the owner of the record reads it.',
    takes: {} },
  { name: 'trustTakeBack', group: 'ADMIN', writes: true, what: 'Puts an agent back to asking before it makes one kind of change, or every kind when none is named.',
    takes: { agent: 'text', kind: 'text' } },
];
