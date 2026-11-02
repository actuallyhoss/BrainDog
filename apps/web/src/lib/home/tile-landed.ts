/**
 * THE TILES' COMPONENTS ONCE THEIR CODE HAS LANDED (speed4, 2 Nov), so a slot draws one in the same pass as the page.
 *
 * `{#await import(...)}` draws nothing until the promise settles, even for a module already in the tab, so Late and
 * handed back and Working now drew a frame or more after the page around them, and every tile under them moved down
 * (a phone's layout shift of 0.17 over HTTP/2). `tile-code.ts` puts each here as it lands, and `BlockSlot` draws what is
 * here at once, and awaits the import only where it is not.
 *
 * PURE: no rune, no `$lib`, types only from the components.
 */

import type LateHold from './LateHold.svelte';
import type LateNow from './LateNow.svelte';
import type WorkingNow from './WorkingNow.svelte';

/**
 * `hold` is Late's room while its code is on its way (`LateHold.svelte`, nojump 2 Nov): Today's page puts it here as it
 * loads, so it is in hand before any slot draws, and a slow `late` never moves the tiles under it.
 */
export const landed: { late?: typeof LateNow; working?: typeof WorkingNow; hold?: typeof LateHold } = {};
