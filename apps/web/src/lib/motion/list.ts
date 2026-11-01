/**
 * A LIST THAT MOVES, IN ONE IMPORT (ui pass, 1 Nov): the three parts every keyed list wants, under the names a screen
 * reaches for. A line added after the list first drew opens into place, one taken away lets go and its gap closes,
 * and the rest slide to their new places on `animate:flip`. Still on the first draw and in a screen's first second;
 * a fade, or nothing, under reduced motion.
 *
 *   import { flip } from 'svelte/animate';
 *   import { enter, leave, moved } from '$lib/motion/list.ts';
 *
 *   {#each rows as row (row.key)}
 *     <li in:enter out:leave animate:flip={moved()}>…</li>
 *   {/each}
 *
 * For a card or a tile rather than a line, `arrive` and `depart` from `$lib/motion`. For a list whose items sit in an
 * `{#if}` inside the `{#each}` (where Svelte plays no local transition), `listMotion` from `$lib/motion` watches the
 * list itself.
 */

export { lineIn as enter, dismiss as leave, springy as moved, arrive, depart, listMotion, staggered } from './index.ts';
