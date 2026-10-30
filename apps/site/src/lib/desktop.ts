/**
 * Whether a notarised BrainDog.dmg is published where `brain.dog/desktop/BrainDog.dmg` sends a visitor (the R2 bucket
 * `braindog-desktop` at `download.brain.dog`, through `static/_redirects`).
 *
 * `tools/desktop/release.mjs --publish` sets it, and only after Gatekeeper accepted the app as a notarised Developer ID
 * and the uploaded dmg answered from its public address: until then `/download` stays in `HELD` (`launch.ts`), since an
 * unsigned app is refused on every Mac but the one that built it. Committed with the changelog entry that says the Mac
 * app can be downloaded, then deployed.
 */
export const DESKTOP_NOTARIZED: boolean = false;
