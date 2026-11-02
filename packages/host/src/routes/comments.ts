/**
 * The route rows for comments (`packages/record/src/methods/comments.ts`).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * READ+ TO READ A THREAD AND DATA TO WRITE ONE, as `governance` and `propose` are: a comment changes no row, and anybody
 * who reads a thing may say something about it (`docs/20-COLLABORATION.md` §5).
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'comments', group: 'READ+', writes: false, what: 'The comments on one row, question or decision you can read, oldest first, with their replies and how each was resolved.',
    takes: { on: 'text' } },
  { name: 'mentionable', group: 'READ+', writes: false, what: 'The people an @ may name on one row, question or decision you can read: those who may see it, by name. It changes nothing.',
    takes: { on: 'text' } },
  { name: 'comment', group: 'DATA', writes: true, what: 'Say something about one row, question or decision you can read, or reply under a comment on it, in 280 characters or fewer.' },
  { name: 'resolveComment', group: 'DATA', writes: true, what: 'Resolve a comment as addressed, wont-fix or incorrect, with the reason. Its author, or somebody who may change what it is on.' },
];
