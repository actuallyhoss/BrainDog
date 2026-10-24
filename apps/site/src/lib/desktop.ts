/**
 * Whether a notarised BrainDog.dmg is laid in `static/desktop/` for this build to publish (E52).
 *
 * `tools/desktop/release.mjs --stage` sets it, and only after Gatekeeper accepted the app as a notarised Developer ID:
 * until then `/download` stays in `HELD` (`launch.ts`), since an unsigned app is refused on every Mac but the one that
 * built it. Committed with the changelog entry that says the Mac app can be downloaded, then deployed.
 */
export const DESKTOP_NOTARIZED: boolean = false;
