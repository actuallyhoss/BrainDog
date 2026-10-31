/**
 * THE SCREENS A STRANGER OPENS, DRAWN IN THE LIGHT FRAME: sign-in, the Mac app's sign-in under it, sign-up, and the
 * page a read-only link opens (`/s`, AH33: it asked `boot` and `schemas` for a stranger, two 401s in the console).
 *
 * THEY NEVER LOAD THE APP'S FRAME (`AppFrame.svelte`). Until 30 Oct the frame was the root layout, so `/signin` and
 * `/signup` waited for about 54 files of shell (the rail, the palette's way in, the record's readers and what those
 * import) before a stranger saw a field, none of which either screen draws (first hour audit, E14). The root load
 * answers them with no shell and hands over the light frame (`routes/+layout.ts`), which the root layout draws them in.
 *
 * THE BUNDLE GATE COUNTS THE APP'S FRAME IN A RECORD'S FIRST LOAD (`tools/gates/bundle.mjs`), since every screen of a
 * record still waits for it. THE BUILD NAMES THESE SCREENS AGAIN (`LIGHT_PAGE` in `vite.config.ts`), to put what they
 * import in the light frame's preload list: a screen added here is added there. `/s` IS NOT: named there, the list
 * pointed at a chunk the build had dropped (a 404 on every first open), and a link's page loads its own reads first anyway.
 */
import type { Shell } from '../record/boot-live.ts';

/** Whether a path inside the record (`here()` of the address) is drawn in the light frame. */
export const light = (inner: string): boolean => LIGHT.has(inner);

/**
 * THE THREE BY NAME, NOT `/signin/*` (RE10): a typo under sign-in is a 404, and drawn in the light frame its page bar drew
 * the Bell and the You menu over nothing read, so it is the app frame's 404, as it was before the split.
 */
const LIGHT: ReadonlySet<string> = new Set(['/signin', '/signin/desktop', '/signup', '/s']);

/** What the app frame is handed: the shell the root load read, and whether a model is behind Slash. */
export type FrameData = Shell & { slash: boolean };
