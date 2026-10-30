/**
 * THE SCREENS A STRANGER OPENS, DRAWN IN THE LIGHT FRAME: sign-in, every screen under it, and sign-up.
 *
 * THEY NEVER LOAD THE APP'S FRAME (`AppFrame.svelte`). Until 30 Oct the frame was the root layout, so `/signin` and
 * `/signup` waited for about 54 files of shell (the rail, the palette's way in, the record's readers and what those
 * import) before a stranger saw a field, none of which either screen draws (first hour audit, E14). The root load
 * answers them with no shell and hands over the light frame (`routes/+layout.ts`), which the root layout draws them in.
 *
 * ONE LIST, READ THREE TIMES: by the root load, by the root layout, and by the build (`vite.config.ts`), which keeps the
 * app frame's preloads out of these screens' lists. Plain TypeScript with no `$lib` import, so the build can load it.
 */
import type { Shell } from '../record/boot-live.ts';

/** The route folders drawn in the light frame, as the build finds their nodes. */
export const LIGHT_ROUTES = ['signin', 'signup'] as const;

/** Whether a path inside the record (`here()` of the address) is drawn in the light frame. */
export const light = (inner: string): boolean => inner === '/signin' || inner.startsWith('/signin/') || inner === '/signup';

/** What the app frame is handed: the shell the root load read, and whether a model is behind Slash. */
export type FrameData = Shell & { slash: boolean };
