/**
 * The route rows for giving things a colour of their own (`packages/record/src/methods/hues.ts`, PGS-A06 step 5).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD: `router-groups` holds each row's group to
 * `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same name to the guard its group implies.
 *
 * READ+ TO COUNT, DATA TO GIVE. `huesWanted` names no list it must have (`scoped(ctx, 'read')`), so anybody who may read
 * anything is answered, held to the lists they read, and it changes nothing. `giveHues` is a row write on one list, the
 * group the owner's `update` takes, and the record refuses a token: the press is the person's.
 *
 * `takes` SAYS THE SHAPE AND NOTHING MORE: `list` is text, so a list named by anything else is refused here, at `list`.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'huesWanted', group: 'READ+', writes: false, what: 'How many things in each of your lists have no colour of their own, with a few of their names. Held to the lists you may read. It changes nothing.',
    takes: { list: 'text' } },
  { name: 'giveHues', group: 'DATA', writes: true, what: 'Give everything in one list that has no colour of its own a colour, each unlike its neighbours, in one change that one Undo takes back. A thing that has a colour is never touched. Yours to press, not a key’s.' },
];
