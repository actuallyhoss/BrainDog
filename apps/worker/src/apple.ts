/**
 * `/.well-known/apple-app-site-association`: the file Apple's servers read to let the Mac app use this name's passkeys.
 *
 * A PASSKEY IN AN APP WINDOW NEEDS THE NAME TO VOUCH FOR THE APP. WebKit in an app that is not a browser offers a
 * passkey only for a relying party the app is associated with: the app's entitlement lists `webcredentials:<name>`
 * (`apps/desktop/src-tauri/Entitlements.plist`), and the name answers this file naming the app as `<team>.<bundle id>`.
 * The relying party is `brain.dog` (`RP_ID`) and the app lives at `app.brain.dog`, so both answer it: this Worker on
 * its own name, and the site forwarding it.
 *
 * THE TEAM IS THE OWNER'S APPLE DEVELOPER TEAM, `APPLE_TEAM_ID`, ten capitals and digits and no secret (every signed app
 * carries it). Unset, the file is a 404 and the app's passkeys are refused as they are today; every other way in works.
 *
 * SERVED AS JSON WITH NO REDIRECT: Apple's fetcher follows none, and reads `application/json`.
 */

/** The Mac app's bundle identifier (`apps/desktop/src-tauri/tauri.conf.json`). */
export const MAC_APP = 'dog.brain.desktop';

const TEAM = /^[A-Z0-9]{10}$/;

export function appleAssociation(teamId: string | undefined): Response {
  const team = (teamId ?? '').trim();
  if (!TEAM.test(team))
    return new Response(JSON.stringify({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'No app is associated with this name: APPLE_TEAM_ID is not set.' } }), {
      status: 404,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  return new Response(JSON.stringify({ webcredentials: { apps: [`${team}.${MAC_APP}`] } }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' },
  });
}
