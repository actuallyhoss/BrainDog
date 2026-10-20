<!--
  A use case's Home in miniature, on its card (`mini.ts` reads the tiles): a 2 by 2 board of small tiles on a well, each
  its heading at the caption size over a shape for its kind. A picture of the product, so it is hidden from a screen
  reader; the card's words say the same.
-->
<script lang="ts">
  import type { MiniTile } from './mini.ts';

  let { tiles }: { tiles: readonly MiniTile[] } = $props();
</script>

<div class="mini" aria-hidden="true" data-count={tiles.length}>
  {#each tiles as t, i (i)}
    <div class="mini-tile" data-shape={t.shape}>
      <span class="mini-name">{t.title}</span>
      <span class="mini-shape">
        {#if t.shape === 'figure'}
          <i style="block-size: 45%"></i><i style="block-size: 75%"></i><i style="block-size: 100%"></i>
        {:else if t.shape === 'board'}
          <i></i><i></i><i></i>
        {:else if t.shape === 'calendar'}
          {#each { length: 10 } as _, d (d)}<i data-on={d === 3 || d === 7 ? '' : undefined}></i>{/each}
        {:else if t.shape === 'note'}
          <i></i><i></i>
        {:else}
          <i></i><i></i><i></i>
        {/if}
      </span>
    </div>
  {/each}
</div>

<style>
  /* THE WELL: the tile's second fill, in light and dark alike, with the small tiles on it in the tile's own. */
  .mini {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-auto-rows: 60px;
    gap: var(--sp-2);
    padding: var(--sp-2);
    border-radius: var(--r-pop);
    background: var(--tile-2);
  }

  /* ONE TILE ALONE TAKES THE ROW, so a use case with a single list is not a quarter of a picture. */
  .mini[data-count='1'] .mini-tile,
  .mini[data-count='3'] .mini-tile:last-child {
    grid-column: 1 / -1;
  }

  .mini-tile {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    min-inline-size: 0;
    padding: var(--sp-2);
    border-radius: var(--r-ctl);
    background: var(--tile);
  }

  .mini-name {
    overflow: hidden;
    color: var(--ink-2);
    font-size: var(--fs-cap);
    font-weight: var(--fw-medium);
    line-height: 16px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mini-shape {
    display: flex;
    flex: 1;
    min-block-size: 0;
  }

  .mini-shape i {
    display: block;
    border-radius: 2px;
    background: var(--rule-strong);
  }

  /* A LIST: three bars, the last shorter, as rows read. */
  [data-shape='list'] .mini-shape,
  [data-shape='note'] .mini-shape {
    flex-direction: column;
    justify-content: center;
    gap: var(--sp-1);
  }

  [data-shape='list'] .mini-shape i,
  [data-shape='note'] .mini-shape i {
    block-size: 4px;
    inline-size: 100%;
  }

  [data-shape='list'] .mini-shape i:last-child,
  [data-shape='note'] .mini-shape i:last-child {
    inline-size: 60%;
  }

  /* FIGURES: a column chart of three, in ink, the one dark mark on the card. */
  [data-shape='figure'] .mini-shape {
    align-items: end;
    gap: var(--sp-1);
  }

  [data-shape='figure'] .mini-shape i {
    inline-size: 8px;
    background: var(--ink-3);
  }

  [data-shape='figure'] .mini-shape i:last-child {
    background: var(--ink);
  }

  /* A BOARD: three columns. */
  [data-shape='board'] .mini-shape {
    gap: var(--sp-1);
  }

  [data-shape='board'] .mini-shape i {
    flex: 1;
  }

  /* A CALENDAR: a row of days, two of them marked. */
  [data-shape='calendar'] .mini-shape {
    flex-wrap: wrap;
    align-content: center;
    gap: 2px;
  }

  [data-shape='calendar'] .mini-shape i {
    inline-size: calc((100% - 8px) / 5);
    block-size: 6px;
  }

  [data-shape='calendar'] .mini-shape i[data-on] {
    background: var(--ink-3);
  }
</style>
