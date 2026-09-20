/**
 * Cut down to the one table this fixture needs, and correct on purpose.
 *
 * THE SEEDED VIOLATION HERE IS IN `index.ts`, so sign-in has to be clean: a fixture that also tripped the
 * sign-in rules would assert a count that means something else. It is present at all because the gate now
 * treats a missing `packages/host/src/auth.ts` as a finding rather than as nothing, and this tree had been
 * the one place that silence could not be seen.
 */
export const AUTH_ROUTES: readonly AuthRoute[] = [
  { path: '/auth/methods', method: 'GET', flow: 'methods', on: 'both', needs: 'nothing', what: 'Which ways in this host offers.' },
];
