/** Cut down to the two tables this gate reads. The account row needs nothing, and an account route reads the session. */
export const ACCOUNT_ROUTES: readonly AccountRoute[] = [
  { path: '/account/usage', method: 'GET', on: 'both', needs: 'session', what: 'What the records you own used.' },
  { path: '/account/seeded', method: 'GET', on: 'both', needs: 'nothing', what: 'seeded' },
];

export async function serveAccount(request: Request): Promise<Response> {
  return new Response(null, { status: 404 });
}

export const AUTH_ROUTES: readonly AuthRoute[] = [
  { path: '/auth/methods', method: 'GET', flow: 'methods', on: 'both', needs: 'nothing', what: 'Which ways in this host offers.' },
];
