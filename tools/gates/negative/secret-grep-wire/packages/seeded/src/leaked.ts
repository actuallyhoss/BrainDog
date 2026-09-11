/**
 * The fourth seeded violation: a sign-in secret written to a log.
 *
 * `sid`, `linkToken`, `claimToken` and `serverKey` are the four raw values the sign-in seam carries, each
 * by exactly one name so this gate can follow it. The first function below logs the session id, which is
 * a signed-in account in whatever reads the log. The second posts the server key to its own host, which is
 * the one transmission these values exist for, and must not be a finding: a count of one is what proves
 * the gate tells the two apart.
 */
export function signedIn(sid: string): void {
  console.error('signed in', sid);
}

export function exchange(serverKey: string): Promise<Response> {
  return fetch('/auth/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ serverKey }) });
}
