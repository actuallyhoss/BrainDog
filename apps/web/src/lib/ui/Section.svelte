<!--
  A group as a tile (DIRECTION §39): the tile's colour on the board, flat, radius 16 and 20 in, the heading at 15
  semibold with its count in the quiet ink and the actions at the right, and the rows inside it.

  INSIDE A TILE OR A SHEET IT IS ONLY THE HEADING AND ITS ROWS, because a tile never holds a tile.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title,
    count,
    children,
    aside,
  }: { title: string; count?: number; children: Snippet; aside?: Snippet } = $props();
</script>

<section class="section" data-surface="tile">
  <div class="section-head">
    <h2 class="section-title">
      {title}
      <!--
        A ZERO IS NOT A COUNT, and the test was `count !== undefined`, which zero passes.

        So a new record read `Passkeys 0` over "No passkey yet.", `Connectors 0` over "Nothing feeds
        this record yet.", `What is kept 0` over "No backup yet." and `Installed 0` over "No packs
        installed." The same fact twice, once in the schema's register and once in the reader's, and
        the number is the half that says nothing: a count is here to save somebody counting rows,
        and there are no rows to count. The sentence below is the one that names what would be here
        and what puts it there, so it is the one that stays.
      -->
      {#if count}<span class="section-count num">{count}</span>{/if}
    </h2>
    {#if aside}<div class="section-aside">{@render aside()}</div>{/if}
  </div>
  {@render children()}
</section>

<style>
  .section {
    min-inline-size: 0;
    padding: var(--tile-pad);
    background: var(--tile);
    border-radius: var(--tile-r);
  }

  :global(:is(.tile, .sheet)) .section {
    padding: 0;
    background: none;
    border-radius: 0;
    box-shadow: none;
  }

  .section-head {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: var(--btn-h);
    margin-block: calc(-1 * var(--sp-1)) var(--sp-2);
  }

  /* A TILE'S HEADING IS 15 AT 600, the step every tile heading on a page takes (`.block-head`), so a section and a
     block beside it read as two tiles of one board. It ranks over a row title (15 at 500) by weight alone. */
  .section-title {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    min-inline-size: 0;
    margin: 0;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-body);
    font-weight: var(--fw-semi);
    line-height: 22px;
  }

  .section-count {
    color: var(--dim);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .section-aside {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin-inline-start: auto;
  }
</style>
