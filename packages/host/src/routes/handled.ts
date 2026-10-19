/**
 * The route row for what BrainDog arranged itself today (`packages/record/src/methods/handled.ts`).
 *
 * READ+, AND IT CHANGES NOTHING. The method's first statement is `scoped(ctx, 'read')`, and every line it answers is held
 * to the lists the caller may read. Putting a line back is Undo's, never this row's.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'handled', group: 'READ+', writes: false, what: 'What BrainDog arranged by itself today, each in one plain line with its reason and the decision that puts it back. Newest first, 20 at most. It changes nothing.',
    takes: {} },
];
