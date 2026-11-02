/**
 * A PROJECT'S PART ONCE ITS CODE HAS LANDED (speed5, 2 Nov), so a slot draws it in the same pass as the hold is set.
 *
 * `PageView` waits for `ProjectPart` before it sets the shape's hold, and `BlockSlot` then drew it through
 * `{#await import(...)}`, which draws nothing until the promise settles, even for code already in the tab. So the hero
 * and Numbers and work drew a frame as bare headings, and where the browser painted that frame the page under them moved
 * 304px down: a project's page at the desk read a layout shift of 0.6 in two cold opens of three. `PageView` puts the
 * component here as it lands, and `BlockSlot` draws what is here at once, as `tile-landed.ts` does for Today's tiles.
 *
 * PURE: no rune, no `$lib`, types only from the component.
 */

import type ProjectPart from './ProjectPart.svelte';

export const partLanded: { part?: typeof ProjectPart } = {};
