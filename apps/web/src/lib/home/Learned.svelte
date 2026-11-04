<!--
  What your answers taught, as one tile at the end of the board: the heading, at most three lines of
  what the record will not ask again because it was answered, in the record's own words, and a count of the rest.

  AN ANSWER USED TO VANISH INTO DECIDE. Once given it closed its question and nothing on the first screen said what it
  had settled. Here the record says it: what it learned, so it does not ask again.

  A TILE AND NEVER A QUESTION. Nothing here asks, decides or opens; at nought the tile is gone.

  THE LINES STAY IN INK, the count of the rest in the quieter colour, all at the row's own size (15).
-->
<script lang="ts">
  import { learnedTile, type Learned } from './learned.ts';

  let { found }: { found: Learned } = $props();

  const tile = $derived(learnedTile(found));
</script>

{#if tile}
  <section class="learned" aria-labelledby="learned-h" data-learned>
    <h2 class="l-head" id="learned-h">{tile.heading}</h2>
    <ul class="l-list">
      {#each tile.lines as line, i (i)}
        <li class="l-line" dir="auto">{line}</li>
      {/each}
    </ul>
    {#if tile.more}<p class="l-more">{tile.more[0]!.toUpperCase() + tile.more.slice(1)}.</p>{/if}
  </section>
{/if}

<style>
  /* A TILE OF ITS OWN, the whole row of the board: flat, no border, no shadow, the board's own radius. */
  .learned {
    grid-column: 1 / -1;
    min-inline-size: 0;
    padding: var(--tile-pad, 20px);
    background: var(--tile);
    border-radius: var(--r-tile, 16px);
  }

  .l-head {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: 1.4;
  }

  .l-list {
    display: flex;
    flex-direction: column;
    margin: var(--sp-3) 0 0;
    padding: 0;
    list-style: none;
  }

  /* THE HAIRLINE BETWEEN TWO, as between two rows of any list here (`ui/rows.css`). */
  .l-list > li + li {
    border-block-start: 1px solid var(--rule);
  }

  .l-line {
    padding: var(--sp-2) 0;
    color: var(--ink);
    font-size: var(--fs-body, 15px);
    line-height: calc(22px * var(--type, 1));
    overflow-wrap: anywhere;
  }

  .l-more {
    margin: var(--sp-2) 0 0;
    color: var(--ink-3);
    font-size: var(--fs-body, 15px);
    line-height: calc(22px * var(--type, 1));
  }

  @media (forced-colors: active) {
    .learned {
      border: 1px solid CanvasText;
    }
  }
</style>
