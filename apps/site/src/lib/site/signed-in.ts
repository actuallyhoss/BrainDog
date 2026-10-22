/**
 * Whether the visitor is signed in to BrainDog, read from the one cookie the site reads.
 *
 * THE WORKER SETS `bd_in` BESIDE THE SESSION (`apps/worker/src/signed-in.ts`) and clears it at sign-out. It holds the
 * record's address or `1`, never a credential, and it is readable by a page (not HttpOnly) so this site, which is
 * prerendered and has no server, can draw "Open BrainDog" in place of "Start free" and "Sign in". The site never
 * sets it.
 *
 * `static/signed-in.js` IS THIS FUNCTION AGAIN, in plain script with no imports, because it runs in the `<head>`
 * before the first paint and the CSP allows no inline script. `test/shell.test.ts` runs both on the same cookies and
 * holds them equal.
 */
export const SIGNED_IN = 'bd_in';

/** True when `cookie` (as `document.cookie` gives it) holds `bd_in` with a value that is not empty. */
export const isSignedIn = (cookie: string): boolean =>
  cookie.split(';').some((part) => {
    const eq = part.indexOf('=');
    return eq > 0 && part.slice(0, eq).trim() === SIGNED_IN && part.slice(eq + 1).trim() !== '';
  });
