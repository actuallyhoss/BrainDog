/**
 * The route row for Slash drafting from a description (`packages/record/src/methods/slash-draft.ts`).
 *
 * ONE ROW, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because `router-groups` holds its group to `docs/30-BLUEPRINT.md` §5 and
 * `guards` holds the record method of the same name to `admin(ctx`. ADMIN, as `slashPropose` is, and `writes: true`
 * because each ask it makes is a row in Slash's ledger, though nothing it drafts is filed.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'slashDraft', group: 'ADMIN', writes: true, what: 'Drafts from what you describe, each drawn before anything is filed and mended when BrainDog refused it. It files nothing.',
    takes: { asked: 'text', page: 'text', body: 'json', not: 'json' } },
];
