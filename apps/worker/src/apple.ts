/**
 * `/.well-known/apple-app-site-association`: the file Apple's servers read to let the BrainDog apps use this name's
 * passkeys, and to open the iPhone app for the addresses it draws.
 *
 * A PASSKEY IN AN APP NEEDS THE NAME TO VOUCH FOR THE APP. An app that is not a browser is offered a passkey only for a
 * relying party it is associated with: the app's entitlement lists `webcredentials:<name>` (`apps/apple`, and the Tauri
 * app's `apps/desktop/src-tauri/Entitlements.plist`), and the name answers this file naming the app as
 * `<team>.<bundle id>`. Both apps are named, the iPhone's and the Mac's. The relying party is `brain.dog` (`RP_ID`) and
 * the app lives at `app.brain.dog`, so both answer it: this Worker on its own name, and the site forwarding it
 * (`run_worker_first` in `apps/site/wrangler.jsonc`).
 *
 * A UNIVERSAL LINK OPENS THE APP, AND ONLY FOR WHAT IT DRAWS: a question to decide, a page, a list, an
 * invitation, each with or without the record's name in front (`/<slug>/...`, `apps/web/src/lib/at.ts`), and the sign-in
 * link only when it carries a BrainDog app's challenge (`?app=`), which is the link the app asked for. The host's own
 * doors are excluded FIRST, because Apple takes the first component that matches and `*` crosses a `/`: `/api/*` and
 * `/auth/*` and the rest are never an app's to open, under a slug or not. The Mac app takes the same addresses (apps
 * mac6, 3 November): a question, a page or a list clicked in Mail or a chat opens in its window, and its sign-in link
 * comes back to it as the iPhone's does; `braindog://` stays for what the app itself opens (widgets, Siri).
 *
 * THE TEAM IS THE OWNER'S APPLE DEVELOPER TEAM, `APPLE_TEAM_ID`, ten capitals and digits and no secret (every signed app
 * carries it). Unset, the file is a 404 and the apps' passkeys and links are refused as they were; every other way in
 * works.
 *
 * SERVED AS JSON WITH NO REDIRECT: Apple's fetcher follows none, and reads `application/json`.
 */

/** The Mac app's bundle identifier (`apps/desktop/src-tauri/tauri.conf.json`, and the native Mac app in `apps/apple`). */
export const MAC_APP = 'dog.brain.desktop';

/** The iPhone app's bundle identifier (`apps/apple`). */
export const IOS_APP = 'dog.brain.app';

const TEAM = /^[A-Z0-9]{10}$/;

/** One `applinks` component: a path pattern, an optional query to match, and whether a match keeps the app away. */
type Component = { '/': string; '?'?: Record<string, string>; exclude?: true; comment?: string };

/** The host's doors (`HOST_DOORS` in `packages/host/src/auth.ts`), never opened by the app. */
const DOORS: readonly string[] = ['api', 'auth', 'account', 'mcp', 'in', 'oauth', 'a', 'ws', 'healthz', 'app', '_app', '.well-known', 'drawn-frame'];

/**
 * The doors a record's name goes in front of (`/<slug>/api/...`). Only these, because `*` crosses a `/` and a list
 * named `in` would otherwise be shut out of the app by a slugged `in` door.
 */
const SLUGGED_DOORS: readonly string[] = ['api', 'auth'];

/** What the iPhone app draws, at the root (the record the session is on) and under a record's name. */
const DRAWN: readonly string[] = ['/decide', '/decide/*', '/p/*', '/r/*'];

const COMPONENTS: readonly Component[] = [
  ...DOORS.flatMap((door): Component[] => [
    { '/': `/${door}`, exclude: true },
    { '/': `/${door}/*`, exclude: true },
  ]),
  ...SLUGGED_DOORS.map((door): Component => ({ '/': `/*/${door}/*`, exclude: true })),
  ...DRAWN.flatMap((path): Component[] => [{ '/': path }, { '/': `/*${path}` }]),
  /* AN INVITATION IS `/invite#<token>`: the fragment is not matched, and the app reads it off the address it is handed. */
  { '/': '/invite', comment: 'An invitation, opened in the app inside the same session.' },
  { '/': '/invite/*' },
  /* THE SIGN-IN LINK ONLY WHEN A BRAINDOG APP ASKED FOR IT. A link the browser asked for opens in the browser. */
  { '/': '/signin', '?': { app: '*' }, comment: 'A sign-in link a BrainDog app asked for: the app hands it back to itself.' },
];

/** The file's body for a team: both apps' passkeys, and both apps' links. */
export function association(team: string): object {
  return {
    applinks: { details: [{ appIDs: [`${team}.${IOS_APP}`, `${team}.${MAC_APP}`], components: COMPONENTS }] },
    webcredentials: { apps: [`${team}.${IOS_APP}`, `${team}.${MAC_APP}`] },
  };
}

export function appleAssociation(teamId: string | undefined): Response {
  const team = (teamId ?? '').trim();
  if (!TEAM.test(team))
    return new Response(JSON.stringify({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'No app is associated with this name: APPLE_TEAM_ID is not set.' } }), {
      status: 404,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  return new Response(JSON.stringify(association(team)), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' },
  });
}
