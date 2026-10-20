<!--
  A group as a tile, drawn by `Tile.svelte` (the UI pass of 20 October, 2.A.4): one tile in the product, and this is
  its older door, kept until every caller has moved to `Tile` (wave 4 deletes it).

  THE SAME TILE: `--tile`, radius 16, `--tile-pad`, the heading at 15/600 with its count at 15/500 in `--ink-3`, and
  `aside` at the heading's end, where `Tile` puts its `actions`. The element keeps the `section` class beside `tile`,
  so `Empty`'s rule that a section's empty state is the compact line still finds it.

  THE ROWS ARE ONE CHILD. A tile spaces its children 16 apart, and a section's rows were laid out by their own flow; the
  body wrapper keeps them as they were.

  A ZERO IS NOT A COUNT here, as it never was: "Passkeys 0" over "No passkey yet." says the same fact twice.

  INSIDE A TILE OR A SHEET IT IS ONLY THE HEADING AND ITS ROWS, because a tile never holds a tile.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import Tile from './Tile.svelte';

  let {
    title,
    count,
    children,
    aside,
  }: { title: string; count?: number; children: Snippet; aside?: Snippet } = $props();
</script>

<Tile class="section" data-surface="tile" {title} count={count ? count : undefined} actions={aside}>
  <div class="section-body">{@render children()}</div>
</Tile>

<style>
  .section-body {
    min-inline-size: 0;
  }

  /* A TILE NEVER HOLDS A TILE: inside one, or inside a sheet, the section is its heading and its rows on the surface
     it stands on. */
  :global(:is(.tile, .sheet, .dock-body) .tile.section) {
    padding: 0;
    background: none;
    border-radius: 0;
  }
</style>
