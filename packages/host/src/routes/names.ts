/**
 * The route row for every name on the record (`packages/record/src/methods/names.ts`).
 *
 * READ+, AND IT CHANGES NOTHING. The search field keeps the answer on the device. Only a caller who reads every list,
 * whole, gets rows; anybody else is told so and searches the record as before.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'names', group: 'READ+', writes: false, what: "Every row's name with its day and amount, for a caller who reads every list whole. Anybody else is told it is not whole and gets no rows. It changes nothing." },
];
